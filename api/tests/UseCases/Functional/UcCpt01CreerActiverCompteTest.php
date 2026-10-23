<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Auth\Waitlist;
use Humanome\Geo\CountryResolver;
use Humanome\Llm\FreeCreditLedger;
use Humanome\Tests\CartographeTestCase;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\CptSupport;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-CPT-01 — Créer un compte et l'activer par code email : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/compte/UC-CPT-01-creer-activer-compte.md
 *
 * Chaque test rejoue un scénario de la fiche à travers l'API HTTP (application
 * Slim en processus, vraie base MySQL) : un navigateur neuf (aucun cookie)
 * s'inscrit par POST /api/auth/register, « lit » l'email capturé par le
 * MemoryMailer, puis active son compte par POST /api/auth/activate (ou
 * demande un renvoi par POST /api/auth/resend).
 *
 * La liste d'attente (sprint 7, S7a-2 ; F26 à F29) : le plafond des crédits
 * offerts (OFFERTS_MENSUEL_USD) et la dépense du mois (free_credit_monthly)
 * sont posés par le test ; le passage au mois suivant est simulé en datant
 * waitlisted_at du mois précédent (UTC), la route lisant l'horloge réelle.
 */
final class UcCpt01CreerActiverCompteTest extends CartographeTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        // Base pays déterministe (le vrai résolveur lit une base MMDB locale).
        CountryResolver::setOverride(static fn (string $ip): ?string => 'FR');
        // Les crédits offerts du mois intacts, au plafond par défaut (sprint 7).
        self::$pdo->exec('DELETE FROM free_credit_monthly');
        TestDb::setEnv('OFFERTS_MENSUEL_USD', '20');
    }

    protected function tearDown(): void
    {
        CountryResolver::setOverride(null);
        self::$pdo->exec('DELETE FROM free_credit_monthly');
        TestDb::setEnv('OFFERTS_MENSUEL_USD', '20');
        parent::tearDown();
    }

    /**
     * Le mois des crédits offerts tel que, sous le plafond, il reste $reste
     * micro-dollars DÉPENSÉS en moins : un plafond de seuil + 0,10 $, et sa
     * dépense réglée. Renvoie [plafond] en micro-dollars.
     *
     * @return array{0: int}
     */
    private static function moisAvecReste(int $reste): array
    {
        self::$pdo->exec('DELETE FROM free_credit_monthly');
        $seuil = (new Waitlist(self::$pdo))->floorMicrousd();
        $plafond = $seuil + 100_000;
        TestDb::setEnv('OFFERTS_MENSUEL_USD', sprintf('%.6f', $plafond / 1_000_000));
        $ledger = new FreeCreditLedger(self::$pdo);
        self::assertTrue($ledger->reserve($plafond - $reste, $plafond));
        $ledger->settle($plafond - $reste, $plafond - $reste);

        return [$plafond];
    }

    /** Date l'attente d'un compte du mois UTC précédent (le $jour, à midi) : son attente est finie. */
    private static function attenteDuMoisDernier(string $email, int $jour = 15): void
    {
        $moisDernier = gmmktime(12, 0, 0, (int) gmdate('n') - 1, $jour, (int) gmdate('Y'));
        self::$pdo->prepare('UPDATE users SET waitlisted_at = ? WHERE email = ?')
            ->execute([gmdate('Y-m-d H:i:s', $moisDernier), $email]);
    }

    private static function countAudits(string $type): int
    {
        $stmt = self::$pdo->prepare('SELECT COUNT(*) FROM audit_events WHERE type = ?');
        $stmt->execute([$type]);

        return (int) $stmt->fetchColumn();
    }

    /** Étape 4 : le formulaire d'inscription envoie ses quatre champs. */
    private function signUp(array $overrides = []): ResponseInterface
    {
        $this->cookieSid = null;

        return $this->request('POST', '/api/auth/register', array_merge([
            'email' => 'ada@example.org',
            'emailConfirm' => 'ada@example.org',
            'password' => self::PASSWORD,
            'displayName' => 'Ada',
        ], $overrides));
    }

    /** @return array<string, mixed> ligne users (colonnes de vérification incluses) */
    private static function userRow(string $email): array
    {
        $stmt = self::$pdo->prepare('SELECT * FROM users WHERE email = ?');
        $stmt->execute([$email]);
        $row = $stmt->fetch();
        self::assertIsArray($row, 'compte ' . $email);

        return $row;
    }

    private static function countUsers(): int
    {
        return (int) self::$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
    }

    /** Un code à 4 chiffres dont on est sûr qu'il est faux. */
    private static function wrongCode(string $good, int $shift = 1): string
    {
        return str_pad((string) (((int) $good + $shift) % 10000), 4, '0', STR_PAD_LEFT);
    }

    #[TestDox('UC-CPT-01-F01 — scénario nominal : inscription (201, sans session) → email avec code → activation (200, session, rôle apprenant)')]
    public function testF01NominalSignUpThenActivate(): void
    {
        // Étapes 4-5 : inscription, compte en attente, AUCUNE session.
        $registered = $this->signUp(['email' => ' Ada@Example.org ', 'emailConfirm' => 'ADA@example.org']);
        self::assertSame(201, $registered->getStatusCode(), (string) $registered->getBody());
        self::assertSame([
            'status' => 'pending_activation',
            'email' => 'ada@example.org',
            'message' => 'Un code de confirmation à 4 chiffres vous a été envoyé par email.',
        ], self::json($registered));
        self::assertNull($this->cookieSid, 'pas de session avant activation');

        $row = self::userRow('ada@example.org');
        $userId = (int) $row['id'];
        self::assertNull($row['email_verified_at']);
        self::assertSame('argon2id', password_get_info((string) $row['password_hash'])['algoName']);
        self::assertSame(['apprenant'], \Humanome\Auth\Users::rolesOf(self::$pdo, $userId));
        $ttl = strtotime((string) $row['verification_expires_at']) - time();
        self::assertGreaterThan(1790, $ttl);
        self::assertLessThanOrEqual(1800, $ttl, 'code valable 30 minutes');
        self::assertSame(['userId' => $userId, 'details' => null], self::lastAudit('account_created'));

        // L'email reçu : code en clair + lien #/activer pré-rempli.
        $mail = $this->mailer->last();
        self::assertNotNull($mail);
        self::assertSame('ada@example.org', $mail['to']);
        self::assertSame('humanome.xyz — activez votre compte', $mail['subject']);
        $code = $this->lastCode();
        self::assertMatchesRegularExpression('/^\d{4}$/', $code);
        self::assertStringContainsString('/#/activer?email=ada%40example.org&code=' . $code, $mail['body']);
        self::assertStringContainsString('expire dans 30 minutes', $mail['body']);
        self::assertFalse(password_verify('x', (string) $row['verification_code_hash']));
        self::assertTrue(password_verify($code, (string) $row['verification_code_hash']), 'code stocké haché');

        // Étapes 8-9 : activation = premier login (session + jeton CSRF).
        $activated = $this->activate('ada@example.org', $code);
        self::assertSame(200, $activated->getStatusCode(), (string) $activated->getBody());
        $body = self::json($activated);
        self::assertSame([
            'id' => $userId,
            'email' => 'ada@example.org',
            'displayName' => 'Ada',
            'roles' => ['apprenant'],
            'hasAvatar' => false,
        ], $body['user']);
        self::assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $body['csrfToken']);
        self::assertNotNull($this->cookieSid);

        $me = self::json($this->request('GET', '/api/auth/me'));
        self::assertSame($body['csrfToken'], $me['csrfToken']);
        $after = self::userRow('ada@example.org');
        self::assertNotNull($after['email_verified_at']);
        self::assertNull($after['verification_code_hash'], 'code à usage unique');

        // Journal des connexions : pays + réseau tronqué, jamais l'IP. Colonne
        // JSON relue : MySQL ne conserve pas l'ordre des clés (assertEquals).
        self::assertEquals(
            ['userId' => $userId, 'details' => ['pays' => 'FR', 'reseau' => '203.0.113.0/24']],
            self::lastAudit('login'),
        );
    }

    #[TestDox('UC-CPT-01-F02 — A1 : le lien du mail (email encodé + code) active le compte, casse et espaces ignorés')]
    public function testF02ActivationThroughTheMailLink(): void
    {
        self::assertSame(201, $this->signUp()->getStatusCode());
        self::assertSame(1, preg_match('/#\/activer\?(\S+)/', $this->mailer->lastBody(), $m));
        parse_str($m[1], $params); // ce que fait le routeur front (#/activer?email=…&code=…)
        self::assertSame('ada@example.org', $params['email']);

        $response = $this->activate('  ' . strtoupper($params['email']) . ' ', ' ' . $params['code'] . ' ');

        self::assertSame(200, $response->getStatusCode());
        self::assertSame('ada@example.org', self::json($response)['user']['email']);
    }

    #[TestDox('UC-CPT-01-F03 — A2 : renvoi du code → nouveau mail, essais remis à 0 ; réponse générique sans envoi pour un compte inconnu ou déjà activé')]
    public function testF03ResendRegeneratesTheCode(): void
    {
        $this->signUp();
        $first = $this->lastCode();
        $firstHash = self::userRow('ada@example.org')['verification_code_hash'];
        self::assertSame(401, $this->activate('ada@example.org', self::wrongCode($first, 1))->getStatusCode());
        self::assertSame(401, $this->activate('ada@example.org', self::wrongCode($first, 2))->getStatusCode());
        self::assertSame(2, (int) self::userRow('ada@example.org')['verification_attempts']);

        $resend = $this->request('POST', '/api/auth/resend', ['email' => 'ADA@example.org']);
        self::assertSame(200, $resend->getStatusCode());
        $generic = self::json($resend);
        self::assertSame('ok', $generic['status']);
        self::assertCount(2, $this->mailer->sent, 'un second mail est parti');
        $row = self::userRow('ada@example.org');
        self::assertSame(0, (int) $row['verification_attempts'], 'cinq essais rouverts');
        self::assertNotSame($firstHash, $row['verification_code_hash'], 'code régénéré');

        // Anti-énumération : même réponse, aucun mail, pour un inconnu ou un compte déjà actif.
        self::assertSame(200, $this->activate('ada@example.org', $this->lastCode())->getStatusCode());
        foreach (['nobody@example.org', 'ada@example.org', 'pas-un-email'] as $email) {
            $this->cookieSid = null;
            $other = $this->request('POST', '/api/auth/resend', ['email' => $email]);
            self::assertSame(200, $other->getStatusCode(), $email);
            self::assertSame($generic, self::json($other), $email);
        }
        self::assertCount(2, $this->mailer->sent, 'aucun envoi supplémentaire');
    }

    #[TestDox('UC-CPT-01-F04 — A3 : reprise plus tard — connexion refusée (403 email_not_verified) puis activation, puis connexion normale')]
    public function testF04ResumeActivationFromLogin(): void
    {
        $this->signUp();
        $code = $this->lastCode();

        $this->cookieSid = null;
        $login = $this->login('ada@example.org', self::PASSWORD);
        self::assertSame(403, $login->getStatusCode());
        self::assertSame([
            'error' => 'Compte non activé : confirmez votre email avec le code reçu.',
            'code' => 'email_not_verified',
            'email' => 'ada@example.org',
        ], self::json($login));
        self::assertNull($this->cookieSid);

        self::assertSame(200, $this->activate('ada@example.org', $code)->getStatusCode());
        $this->cookieSid = null;
        self::assertSame(200, $this->login('ada@example.org', self::PASSWORD)->getStatusCode());
    }

    #[TestDox('UC-CPT-01-F05 — E2 : validation serveur 422 champ par champ (email, double saisie, mot de passe, nom), rien n’est créé')]
    public function testF05ServerSideValidation(): void
    {
        $cases = [
            'email' => [['email' => 'pas-un-email', 'emailConfirm' => 'pas-un-email'], 'Adresse email invalide'],
            'emailConfirm' => [['emailConfirm' => 'ada@example.com'], 'Les deux adresses email ne correspondent pas'],
            'password' => [['password' => '123456789'], 'Le mot de passe doit contenir au moins 10 caractères'],
            'password ' => [['password' => str_repeat('x', 1025)], 'Mot de passe trop long'],
            'displayName' => [['displayName' => '   '], 'Le nom affiché est requis (190 caractères maximum)'],
            'displayName ' => [['displayName' => str_repeat('n', 191)], 'Le nom affiché est requis (190 caractères maximum)'],
        ];
        foreach ($cases as $field => [$override, $message]) {
            $response = $this->signUp($override);
            self::assertSame(422, $response->getStatusCode(), $field);
            $body = self::json($response);
            self::assertSame('Validation échouée', $body['error']);
            self::assertSame([trim($field) => $message], $body['fields'], $field);
        }
        self::assertSame(0, self::countUsers());
        self::assertSame([], $this->mailer->sent, 'aucun email pour une inscription refusée');

        // La longueur se compte en CARACTÈRES : 10 lettres accentuées suffisent.
        self::assertSame(201, $this->signUp(['password' => 'éééééééééé'])->getStatusCode());
    }

    #[TestDox('UC-CPT-01-F06 — E3 : adresse déjà utilisée (casse comprise) → 409, pas de second compte ni de mail')]
    public function testF06DuplicateEmail(): void
    {
        self::assertSame(201, $this->signUp()->getStatusCode());

        $again = $this->signUp(['email' => 'ADA@example.org', 'emailConfirm' => 'ada@EXAMPLE.org', 'displayName' => 'Autre']);

        self::assertSame(409, $again->getStatusCode());
        self::assertSame(['error' => 'Un compte existe déjà avec cette adresse email'], self::json($again));
        self::assertSame(1, self::countUsers());
        self::assertCount(1, $this->mailer->sent);
    }

    #[TestDox('UC-CPT-01-F07 — E4 : 11e inscription de l’heure depuis une IP (/64 en IPv6) → 429 + Retry-After, même invalide les essais comptent')]
    public function testF07RegisterRateLimitPerIp(): void
    {
        CptSupport::awayFromWindowBoundary(3600); // fenêtre fixe d'une heure
        $this->clientIp = '2001:db8:1:2::1';
        for ($i = 1; $i <= 10; $i++) {
            // Le quota est compté AVANT la validation : même des requêtes invalides l'épuisent.
            self::assertSame(422, $this->signUp(['email' => 'invalide-' . $i])->getStatusCode(), "essai $i");
        }

        $this->clientIp = '2001:db8:1:2::abcd'; // même /64 : même seau
        $blocked = $this->signUp();
        self::assertSame(429, $blocked->getStatusCode());
        self::assertSame(['error' => 'Trop de tentatives, réessayez plus tard'], self::json($blocked));
        self::assertSame('30', $blocked->getHeaderLine('Retry-After'));
        self::assertSame(0, self::countUsers());

        $this->clientIp = '2001:db8:1:3::1'; // autre /64 : non pénalisé
        self::assertSame(201, $this->signUp()->getStatusCode());
    }

    #[TestDox('UC-CPT-01-F08 — E5 : 5 codes faux verrouillent (même le bon est refusé) ; inconnu, expiré, déjà activé → même 401 générique')]
    public function testF08WrongExpiredOrLockedCodes(): void
    {
        $this->signUp();
        $good = $this->lastCode();
        $bodies = [];
        for ($i = 1; $i <= 5; $i++) {
            $response = $this->activate('ada@example.org', self::wrongCode($good, $i));
            self::assertSame(401, $response->getStatusCode(), "code faux $i");
            $bodies['faux'] = (string) $response->getBody();
        }
        self::assertSame(5, (int) self::userRow('ada@example.org')['verification_attempts']);
        $locked = $this->activate('ada@example.org', $good);
        self::assertSame(401, $locked->getStatusCode(), 'verrou : le bon code ne suffit plus');
        $bodies['verrouille'] = (string) $locked->getBody();
        self::assertNull(self::userRow('ada@example.org')['email_verified_at']);

        $bodies['inconnu'] = (string) $this->activate('nobody@example.org', '1234')->getBody();

        $this->signUp(['email' => 'late@example.org', 'emailConfirm' => 'late@example.org']);
        $lateCode = $this->lastCode();
        self::$pdo->exec("UPDATE users SET verification_expires_at = '2000-01-01 00:00:00' WHERE email = 'late@example.org'");
        $bodies['expire'] = (string) $this->activate('late@example.org', $lateCode)->getBody();

        $this->register('done@example.org');
        $this->cookieSid = null;
        $bodies['deja-active'] = (string) $this->activate('done@example.org', '1234')->getBody();

        // Corps octet pour octet identiques : aucun oracle d'état du compte.
        self::assertCount(1, array_unique($bodies), implode(' | ', array_keys($bodies)));
        self::assertSame(['error' => 'Code invalide ou expiré'], json_decode($bodies['inconnu'], true));
    }

    #[TestDox('UC-CPT-01-F09 — E6 : code mal formé ou email absent → 422, ni essai consommé ni quota IP entamé')]
    public function testF09MalformedCode(): void
    {
        $this->signUp();
        foreach ([['ada@example.org', '12a4'], ['ada@example.org', '123'], ['ada@example.org', '12345'], ['', '1234']] as [$email, $code]) {
            $response = $this->activate($email, $code);
            self::assertSame(422, $response->getStatusCode(), $email . '/' . $code);
            self::assertSame(['error' => 'Email et code à 4 chiffres requis'], self::json($response));
        }
        self::assertSame(0, (int) self::userRow('ada@example.org')['verification_attempts']);
        self::assertSame(0, (int) self::$pdo->query("SELECT COUNT(*) FROM rate_limits WHERE bucket LIKE 'activate:%'")->fetchColumn());
    }

    #[TestDox('UC-CPT-01-F10 — E7 : au-delà de 20 activations par 15 min depuis une IP → 429, même avec le bon code')]
    public function testF10ActivationRateLimitPerIp(): void
    {
        CptSupport::awayFromWindowBoundary(900); // fenêtre fixe de 15 min
        $this->signUp();
        $good = $this->lastCode();
        for ($i = 1; $i <= 20; $i++) {
            self::assertSame(401, $this->activate('inconnu-' . $i . '@example.org', '0000')->getStatusCode(), "essai $i");
        }

        $blocked = $this->activate('ada@example.org', $good);
        self::assertSame(429, $blocked->getStatusCode());
        self::assertSame('Trop de tentatives, réessayez plus tard', self::json($blocked)['error']);
        self::assertGreaterThanOrEqual(30, (int) $blocked->getHeaderLine('Retry-After'));
        self::assertNull(self::userRow('ada@example.org')['email_verified_at']);

        $this->clientIp = '198.51.100.20'; // autre réseau : le bon code passe
        self::assertSame(200, $this->activate('ada@example.org', $good)->getStatusCode());
    }

    #[TestDox('UC-CPT-01-F11 — E8 : renvois limités à 3/h par compte et 10/h par IP → 429 sans nouvel email')]
    public function testF11ResendRateLimits(): void
    {
        CptSupport::awayFromWindowBoundary(3600);
        $this->signUp();
        for ($i = 1; $i <= 3; $i++) {
            self::assertSame(200, $this->request('POST', '/api/auth/resend', ['email' => 'ada@example.org'])->getStatusCode());
        }
        $sent = \count($this->mailer->sent);
        $blocked = $this->request('POST', '/api/auth/resend', ['email' => 'ada@example.org']);
        self::assertSame(429, $blocked->getStatusCode());
        self::assertSame(['error' => 'Trop de demandes de code, réessayez plus tard'], self::json($blocked));
        self::assertNotSame('', $blocked->getHeaderLine('Retry-After'));
        self::assertCount($sent, $this->mailer->sent);

        // Quota IP : 10 renvois/heure tous comptes confondus.
        self::$pdo->exec('DELETE FROM rate_limits');
        $this->clientIp = '198.51.100.30';
        $this->signUp(['email' => 'bob@example.org', 'emailConfirm' => 'bob@example.org', 'displayName' => 'Bob']);
        for ($i = 1; $i <= 10; $i++) {
            self::assertSame(200, $this->request('POST', '/api/auth/resend', ['email' => 'x' . $i . '@example.org'])->getStatusCode());
        }
        $sent = \count($this->mailer->sent);
        self::assertSame(429, $this->request('POST', '/api/auth/resend', ['email' => 'bob@example.org'])->getStatusCode());
        self::assertCount($sent, $this->mailer->sent);
    }

    #[TestDox('UC-CPT-01-F21 — ANOMALIE AN1 (pré-détournement) : l’activation par le titulaire de la boîte garde le mot de passe choisi par l’inscrivant, qui se connecte ensuite')]
    public function testF21ActivationKeepsTheRegistrantsPassword(): void
    {
        // Comportement ACTUEL figé (voir « Anomalies constatées », AN1) : un tiers
        // inscrit l'adresse de la victime avec SON mot de passe…
        $this->clientIp = '198.51.100.66';
        self::assertSame(201, $this->signUp(['password' => 'mot-de-passe-du-tiers'])->getStatusCode());

        // … la victime (autre navigateur, autre IP) active le compte avec le code
        // reçu dans SA boîte : l'activation n'exige ni ne redéfinit aucun mot de passe.
        $this->clientIp = '203.0.113.10';
        $this->cookieSid = null;
        self::assertSame(200, $this->activate('ada@example.org', $this->lastCode())->getStatusCode());

        // Le tiers se connecte au compte désormais vérifié avec son propre mot de passe.
        $this->clientIp = '198.51.100.66';
        $this->cookieSid = null;
        $login = $this->login('ada@example.org', 'mot-de-passe-du-tiers');
        self::assertSame(200, $login->getStatusCode(), 'anomalie AN1 : l’inscrivant garde l’accès');
        self::assertSame('ada@example.org', self::json($login)['user']['email']);
    }

    #[TestDox('UC-CPT-01-F22 — ANOMALIE AN3 : un compte jamais activé est conservé ; l’inscrivant ne peut pas le supprimer, seul le titulaire de la boîte le peut')]
    public function testF22UnactivatedAccountIsNeverPurged(): void
    {
        self::assertSame(201, $this->signUp()->getStatusCode());
        // Code expiré depuis longtemps : rien ne purge la ligne (aucune tâche planifiée).
        self::$pdo->exec("UPDATE users SET verification_expires_at = '2000-01-01 00:00:00' WHERE email = 'ada@example.org'");

        // L'inscrivant n'obtient jamais de session (403) : DELETE /api/auth/account → 401.
        $this->cookieSid = null;
        self::assertSame(403, $this->login('ada@example.org', self::PASSWORD)->getStatusCode());
        self::assertNull($this->cookieSid);
        self::assertSame(401, $this->request('DELETE', '/api/auth/account')->getStatusCode());
        $row = self::userRow('ada@example.org');
        self::assertNull($row['email_verified_at']);
        self::assertNotNull($row['verification_code_hash'], 'empreinte de code expirée conservée');
        // L'adresse reste bloquée pour une nouvelle inscription.
        self::assertSame(409, $this->signUp(['displayName' => 'Titulaire'])->getStatusCode());

        // Seule issue : le titulaire de la boîte se fait renvoyer un code, active, puis supprime.
        $this->cookieSid = null;
        self::assertSame(200, $this->request('POST', '/api/auth/resend', ['email' => 'ada@example.org'])->getStatusCode());
        $activated = $this->activate('ada@example.org', $this->lastCode());
        self::assertSame(200, $activated->getStatusCode());
        $token = (string) self::json($activated)['csrfToken'];
        self::assertSame(204, $this->request('DELETE', '/api/auth/account', null, ['X-CSRF-Token' => $token])->getStatusCode());
        self::assertSame(0, self::countUsers());
    }

    #[TestDox('UC-CPT-01-F23 — A2 : un renvoi vers une adresse mal formée répond de façon générique sans entamer aucun quota')]
    public function testF23ResendToAMalformedAddressConsumesNoQuota(): void
    {
        $this->signUp();
        $sent = \count($this->mailer->sent);
        for ($i = 1; $i <= 11; $i++) {
            $response = $this->request('POST', '/api/auth/resend', ['email' => 'pas-un-email']);
            self::assertSame(200, $response->getStatusCode(), "renvoi invalide $i");
            self::assertSame('ok', self::json($response)['status']);
        }
        self::assertSame(0, (int) self::$pdo->query("SELECT COUNT(*) FROM rate_limits WHERE bucket LIKE 'resend:%'")->fetchColumn());
        self::assertCount($sent, $this->mailer->sent);

        // Le quota IP (10/h) est intact : un vrai renvoi passe et envoie un mail.
        self::assertSame(200, $this->request('POST', '/api/auth/resend', ['email' => 'ada@example.org'])->getStatusCode());
        self::assertCount($sent + 1, $this->mailer->sent);
    }

    #[TestDox('UC-CPT-01-F24 — ANOMALIE AN5 : un tiers épuise le quota de renvoi du compte et verrouille le code ; le titulaire ne peut plus activer avant la fenêtre suivante')]
    public function testF24ThirdPartyCanBlockTheActivation(): void
    {
        CptSupport::awayFromWindowBoundary(3600);
        $this->signUp(); // le titulaire s'inscrit depuis 203.0.113.10

        // Un tiers (autre réseau) connaît seulement l'adresse : 3 renvois (quota
        // du COMPTE, clé = email seul) puis 5 codes faux (verrou du code).
        $this->clientIp = '198.51.100.99';
        for ($i = 1; $i <= 3; $i++) {
            $this->cookieSid = null;
            self::assertSame(200, $this->request('POST', '/api/auth/resend', ['email' => 'ada@example.org'])->getStatusCode());
        }
        $latest = $this->lastCode(); // le dernier code, parti dans la boîte du titulaire
        for ($i = 1; $i <= 5; $i++) {
            self::assertSame(401, $this->activate('ada@example.org', self::wrongCode($latest, $i))->getStatusCode());
        }

        // Comportement ACTUEL figé (voir « Anomalies constatées », AN5) : le titulaire,
        // depuis son propre réseau, a le bon code mais il est verrouillé, et le renvoi
        // lui est refusé jusqu'à la fenêtre suivante (1 h).
        $this->clientIp = '203.0.113.10';
        $this->cookieSid = null;
        self::assertSame(401, $this->activate('ada@example.org', $latest)->getStatusCode(), 'code verrouillé');
        self::assertSame(429, $this->request('POST', '/api/auth/resend', ['email' => 'ada@example.org'])->getStatusCode(), 'quota du compte épuisé par le tiers');
        self::assertNull(self::userRow('ada@example.org')['email_verified_at']);
    }

    #[TestDox('UC-CPT-01-F25 — E9 : API sans base configurée → 503 « Service indisponible » sur register, activate et resend, rien n’est créé')]
    public function testF25DatabaseNotConfigured(): void
    {
        CptSupport::withoutDatabase(function (): void {
            foreach ([
                ['/api/auth/register', ['email' => 'ada@example.org', 'emailConfirm' => 'ada@example.org', 'password' => self::PASSWORD, 'displayName' => 'Ada']],
                ['/api/auth/activate', ['email' => 'ada@example.org', 'code' => '1234']],
                ['/api/auth/resend', ['email' => 'ada@example.org']],
            ] as [$path, $body]) {
                $this->cookieSid = null;
                $response = $this->request('POST', $path, $body);
                self::assertSame(503, $response->getStatusCode(), $path);
                self::assertSame(['error' => 'Service indisponible'], self::json($response));
            }
        });
        self::assertSame(0, self::countUsers());
        self::assertSame([], $this->mailer->sent);
    }

    #[TestDox('UC-CPT-01-F26 — A4, RG8 : crédits offerts du mois épuisés → l’inscription est créée EN LISTE D’ATTENTE : 201 waitlisted, aucune session, aucun code, un mail qui le dit, audit account_waitlisted ; la connexion répond 403 waitlisted (sans session ni journal), le renvoi reste muet, l’activation est refusée ; les comptes existants (actif, en attente d’activation) ne sont pas touchés')]
    public function testF26SignUpAtTheCapIsWaitlisted(): void
    {
        // Avant le plafond : un compte actif et un compte qui attend son code.
        self::assertSame(200, $this->register('ancien@example.org', self::PASSWORD, 'Ancien')->getStatusCode());
        self::assertSame(201, $this->signUp(['email' => 'pending@example.org', 'emailConfirm' => 'pending@example.org'])->getStatusCode());
        $codeDuPending = $this->lastCode();
        $seuil = (new Waitlist(self::$pdo))->floorMicrousd();
        [$plafond] = self::moisAvecReste($seuil - 1); // un micro-dollar de moins que le plus petit appel de l'Essayer
        $this->mailer->clear();

        $registered = $this->signUp();
        self::assertSame(201, $registered->getStatusCode(), (string) $registered->getBody());
        self::assertSame([
            'status' => 'waitlisted',
            'email' => 'ada@example.org',
            'message' => Waitlist::signupMessage(),
        ], self::json($registered));
        self::assertStringStartsWith('Les crédits offerts de ce mois sont épuisés : votre inscription est en liste d\'attente.',
            self::json($registered)['message']);
        self::assertNull($this->cookieSid, 'pas de session');
        $row = self::userRow('ada@example.org');
        $userId = (int) $row['id'];
        self::assertNotNull($row['waitlisted_at']);
        self::assertLessThan(120, abs(strtotime($row['waitlisted_at'] . ' UTC') - time()), 'daté en UTC, maintenant');
        self::assertNull($row['verification_code_hash'], 'aucun code : l’activation attend la levée');
        self::assertNull($row['email_verified_at']);
        self::assertSame(['apprenant'], \Humanome\Auth\Users::rolesOf(self::$pdo, $userId));
        self::assertSame(['userId' => $userId, 'details' => null], self::lastAudit('account_created'));
        self::assertSame(['userId' => $userId, 'details' => null], self::lastAudit('account_waitlisted'));
        self::assertCount(1, $this->mailer->sent);
        self::assertSame(['ada@example.org', 'humanome.xyz — votre inscription est en liste d\'attente'],
            [$this->mailer->last()['to'], $this->mailer->last()['subject']]);
        self::assertSame('', $this->lastCode(), 'le mail ne porte aucun code');
        $mois = (new FreeCreditLedger(self::$pdo))->state($plafond);
        self::assertFalse($mois['exhausted'], 'le mois n’est pas « épuisé » au sens du statut public : il reste moins qu’un appel');

        // Connexion, bon mot de passe : 403 waitlisted, ni session ni journal.
        $connexions = self::countAudits('login');
        $this->cookieSid = null;
        $login = $this->login('ada@example.org', self::PASSWORD);
        self::assertSame(403, $login->getStatusCode());
        self::assertSame(['error' => Waitlist::signupMessage(), 'code' => 'waitlisted', 'email' => 'ada@example.org'], self::json($login));
        self::assertNull($this->cookieSid);
        self::assertSame($connexions, self::countAudits('login'));
        self::assertSame(401, $this->login('ada@example.org', 'mauvais mot de passe')->getStatusCode(),
            'sans le bon mot de passe, rien n’est dit');

        // Renvoi : réponse générique, aucun mail ; activation : refus générique.
        $resend = $this->request('POST', '/api/auth/resend', ['email' => 'ada@example.org']);
        self::assertSame(['status' => 'ok', 'message' => 'Si un compte non activé existe pour cette adresse, un nouveau code a été envoyé.'],
            self::json($resend));
        self::assertCount(1, $this->mailer->sent, 'aucun code envoyé');
        self::assertNull(self::userRow('ada@example.org')['verification_code_hash']);
        $activate = $this->activate('ada@example.org', '1234');
        self::assertSame([401, ['error' => 'Code invalide ou expiré']], [$activate->getStatusCode(), self::json($activate)]);
        self::assertSame(409, $this->signUp()->getStatusCode(), 'l’adresse est prise, comme pour toute inscription');

        // Les comptes existants ne sont pas touchés.
        $this->cookieSid = null;
        self::assertSame(200, $this->login('ancien@example.org', self::PASSWORD)->getStatusCode());
        $this->cookieSid = null;
        self::assertSame(200, $this->activate('pending@example.org', $codeDuPending)->getStatusCode());
        self::assertNull(self::userRow('ancien@example.org')['waitlisted_at']);
        self::assertNull(self::userRow('pending@example.org')['waitlisted_at']);
    }

    #[TestDox('UC-CPT-01-F27 — RG8 : le critère — ce que le mois a DÉPENSÉ laisse-t-il, sous le plafond, le plus petit appel de l’Essayer ? Au seuil exact : inscription ordinaire ; un micro-dollar de plus dépensé : liste d’attente ; une réserve en vol ne ferme rien ; plafond 0 : toute inscription attend')]
    public function testF27TheWaitlistCriterion(): void
    {
        $seuil = (new Waitlist(self::$pdo))->floorMicrousd();
        [$plafond] = self::moisAvecReste($seuil);
        self::assertSame('pending_activation', self::json($this->signUp(['email' => 'a1@example.org', 'emailConfirm' => 'a1@example.org']))['status'],
            'il reste exactement le plus petit appel');

        $ledger = new FreeCreditLedger(self::$pdo);
        self::assertTrue($ledger->reserve($seuil, $plafond), 'un appel en vol prend tout ce qui reste');
        self::assertSame('pending_activation', self::json($this->signUp(['email' => 'a2@example.org', 'emailConfirm' => 'a2@example.org']))['status'],
            'la réserve en vol ne compte pas');
        $ledger->settle($seuil, 1); // il se règle à 1 µ$
        self::assertSame('waitlisted', self::json($this->signUp(['email' => 'a3@example.org', 'emailConfirm' => 'a3@example.org']))['status'],
            'un micro-dollar de plus dépensé : sous le seuil');
        self::assertFalse($ledger->reserve($seuil, $plafond), 'et l’Essayer est refusé lui aussi');

        self::$pdo->exec('DELETE FROM free_credit_monthly');
        TestDb::setEnv('OFFERTS_MENSUEL_USD', '0');
        self::assertSame('waitlisted', self::json($this->signUp(['email' => 'a4@example.org', 'emailConfirm' => 'a4@example.org']))['status'],
            'plafond 0 : tout ce qui est offert est fermé');
        self::assertSame([null, null], [self::userRow('a1@example.org')['waitlisted_at'], self::userRow('a2@example.org')['waitlisted_at']]);
    }

    #[TestDox('UC-CPT-01-F28 — A5 : le mois suivant, la première requête d’authentification (ici une connexion ratée d’un inconnu) lève la liste dans l’ordre d’inscription — chacun reçoit son code et s’active ; un compte mis en attente ce mois-ci attend encore ; la connexion d’un compte dû le lève (403 email_not_verified, code envoyé) ; son renvoi aussi, un seul mail')]
    public function testF28TheNextMonthLiftsTheList(): void
    {
        TestDb::setEnv('OFFERTS_MENSUEL_USD', '0');
        foreach (['ada', 'bob', 'cid', 'dan', 'eve'] as $nom) {
            self::assertSame('waitlisted', self::json($this->signUp(['email' => "{$nom}@example.org", 'emailConfirm' => "{$nom}@example.org"]))['status']);
        }
        // Bob, inscrit après Ada, attend depuis plus longtemps qu'elle : l'ordre de levée
        // est celui de l'inscription (id), pas celui de la date d'attente.
        self::attenteDuMoisDernier('bob@example.org', 2);
        self::attenteDuMoisDernier('ada@example.org', 20);
        $this->mailer->clear();

        $this->cookieSid = null;
        self::assertSame(401, $this->login('inconnu@example.org', 'peu importe')->getStatusCode());
        self::assertSame(['ada@example.org', 'bob@example.org'], array_column($this->mailer->sent, 'to'), 'ordre d’inscription, pas de date');
        self::assertStringContainsString('sort de la liste d\'attente', $this->mailer->sent[0]['body']);
        self::assertSame([null, null], [self::userRow('ada@example.org')['waitlisted_at'], self::userRow('bob@example.org')['waitlisted_at']]);
        self::assertNotNull(self::userRow('cid@example.org')['waitlisted_at'], 'en attente ce mois-ci : attend encore');
        $lifted = self::lastAudit('waitlist_lifted');
        self::assertSame(['userId' => null, 'details' => ['targetUserId' => (int) self::userRow('bob@example.org')['id']]], $lifted);

        // Bob active son compte avec le code de la levée (la liste reste fermée aux nouvelles inscriptions).
        $bobCode = preg_match('/[?&]code=(\d{4})\b/', $this->mailer->sent[1]['body'], $m) === 1 ? $m[1] : '';
        self::assertSame(200, $this->activate('bob@example.org', $bobCode)->getStatusCode());

        // Cid : sa connexion, son attente finie, le lève (par la levée du mois qu'elle déclenche, Cid
        // étant le seul compte dû ; F35 couvre le compte au-delà du lot) — un code part, l'écran
        // d'activation suit.
        self::attenteDuMoisDernier('cid@example.org');
        $this->cookieSid = null;
        $login = $this->login('cid@example.org', self::PASSWORD);
        self::assertSame(403, $login->getStatusCode());
        self::assertSame('email_not_verified', self::json($login)['code']);
        self::assertSame('cid@example.org', $this->mailer->last()['to']);
        self::assertSame(200, $this->activate('cid@example.org', $this->lastCode())->getStatusCode());

        // Dan : son renvoi, son attente finie, le lève — un seul mail, son code active.
        self::attenteDuMoisDernier('dan@example.org');
        $avant = \count($this->mailer->sent);
        $this->cookieSid = null;
        self::assertSame(200, $this->request('POST', '/api/auth/resend', ['email' => 'dan@example.org'])->getStatusCode());
        self::assertSame(['dan@example.org'], array_column(\array_slice($this->mailer->sent, $avant), 'to'), 'un seul mail');
        self::assertSame(200, $this->activate('dan@example.org', $this->lastCode())->getStatusCode());
        self::assertNotNull(self::userRow('eve@example.org')['waitlisted_at'], 'Eve attend toujours');
    }

    #[TestDox('UC-CPT-01-F29 — A5 : le tick (POST /api/admin/worker-tick, jeton du déclencheur) lève aussi la liste du mois passé, et le dit dans ses compteurs (listeAttenteLevees) ; un tick sans compte dû n’en dit rien')]
    public function testF29TheTickLiftsTheList(): void
    {
        TestDb::setEnv('OFFERTS_MENSUEL_USD', '0');
        self::assertSame('waitlisted', self::json($this->signUp())['status']);
        self::attenteDuMoisDernier('ada@example.org');
        $this->mailer->clear();
        TestDb::setEnv('WORKER_TICK_TOKEN', 'jeton-de-tick-fictif-uc-cpt-01');
        TestDb::setEnv('ANTHROPIC_API_KEY', ''); // aucun relevé de tarifs : aucun réseau
        $tick = fn (): \Psr\Http\Message\ResponseInterface => $this->request('POST', '/api/admin/worker-tick',
            ['budgetSeconds' => 1, 'maxCalls' => 1], ['X-Worker-Tick-Token' => 'jeton-de-tick-fictif-uc-cpt-01']);

        $this->cookieSid = null;
        $first = $tick();
        self::assertSame(200, $first->getStatusCode(), (string) $first->getBody());
        self::assertSame(1, self::json($first)['listeAttenteLevees'] ?? null);
        self::assertSame(['ada@example.org'], array_column($this->mailer->sent, 'to'));
        self::assertNull(self::userRow('ada@example.org')['waitlisted_at']);
        self::assertSame(200, $this->activate('ada@example.org', $this->lastCode())->getStatusCode());

        $this->cookieSid = null;
        self::assertArrayNotHasKey('listeAttenteLevees', self::json($tick()));
        self::assertCount(1, $this->mailer->sent);
    }

    #[TestDox('UC-CPT-01-F31 — RG8 : une réserve orpheline (un Essayer dont le processus est mort avant son règlement) ferme l’offert ; passé RESERVATION_TTL_SECONDS, elle compte comme dépensée, et les nouvelles inscriptions partent en liste d’attente au lieu de rester ouvertes jusqu’au 1er ; l’administrateur la voit dépensée, plus « en vol »')]
    public function testF31AnOrphanReservationWaitlistsOnceExpired(): void
    {
        $seuil = (new Waitlist(self::$pdo))->floorMicrousd();
        [$plafond] = self::moisAvecReste($seuil);
        // L'orphelin : le pire cas d'un Essayer réservé il y a plus que l'échéance, jamais réglé.
        $mort = time() - FreeCreditLedger::RESERVATION_TTL_SECONDS - 1;
        if (FreeCreditLedger::month($mort) !== FreeCreditLedger::month()) {
            self::markTestSkipped('les premières minutes du mois UTC : l’orphelin serait du mois passé');
        }
        $ledger = new FreeCreditLedger(self::$pdo);
        self::assertTrue($ledger->reserve($seuil, $plafond, $mort));

        $registered = $this->signUp();
        self::assertSame(201, $registered->getStatusCode(), (string) $registered->getBody());
        self::assertSame('waitlisted', self::json($registered)['status'], 'l’offert est fermé : l’inscription attend');
        self::assertFalse($ledger->reserve($seuil, $plafond), 'et l’Essayer est refusé');
        $mois = $ledger->state($plafond);
        self::assertSame([$plafond, 0, true], [$mois['spentMicrousd'], $mois['reservedMicrousd'], $mois['exhausted']],
            'son pire cas compté comme dépensé, plus rien « en vol »');
    }

    #[TestDox('UC-CPT-01-F32 — A5 : le courriel de la levée refusé par le transport (mail() rend false) — le tick le dit (listeAttenteEchecs, aucune levée comptée) et le compte reste en liste d’attente ; sa connexion, son attente finie, répond 403 waitlisted « le courriel de votre code n’a pas pu partir », sans session ; le transport revenu, sa connexion le lève (403 email_not_verified, un code) et il s’active')]
    public function testF32ALiftWhoseMailFailsStaysOnTheList(): void
    {
        TestDb::setEnv('OFFERTS_MENSUEL_USD', '0');
        self::assertSame('waitlisted', self::json($this->signUp())['status']);
        self::attenteDuMoisDernier('ada@example.org');
        $this->mailer->clear();
        $this->mailer->refuse = true;
        TestDb::setEnv('WORKER_TICK_TOKEN', 'jeton-de-tick-fictif-uc-cpt-01');
        TestDb::setEnv('ANTHROPIC_API_KEY', ''); // aucun relevé de tarifs : aucun réseau

        $this->cookieSid = null;
        $tick = $this->request('POST', '/api/admin/worker-tick', ['budgetSeconds' => 1, 'maxCalls' => 1],
            ['X-Worker-Tick-Token' => 'jeton-de-tick-fictif-uc-cpt-01']);
        self::assertSame(200, $tick->getStatusCode(), (string) $tick->getBody());
        self::assertSame([1, null], [self::json($tick)['listeAttenteEchecs'] ?? null, self::json($tick)['listeAttenteLevees'] ?? null]);
        self::assertNotNull(self::userRow('ada@example.org')['waitlisted_at'], 'toujours en liste d’attente');
        self::assertNull(self::userRow('ada@example.org')['verification_code_hash']);

        $this->cookieSid = null;
        $login = $this->login('ada@example.org', self::PASSWORD);
        self::assertSame(403, $login->getStatusCode());
        self::assertSame(['code' => 'waitlisted', 'email' => 'ada@example.org'],
            array_intersect_key(self::json($login), ['code' => 0, 'email' => 0]));
        self::assertStringContainsString('n\'a pas pu partir', self::json($login)['error']);
        self::assertNull($this->cookieSid);
        self::assertSame([], $this->mailer->sent);

        $this->mailer->refuse = false;
        $this->cookieSid = null;
        $retry = $this->login('ada@example.org', self::PASSWORD);
        self::assertSame([403, 'email_not_verified'], [$retry->getStatusCode(), self::json($retry)['code']]);
        self::assertSame(['ada@example.org'], array_column($this->mailer->sent, 'to'));
        self::assertSame(200, $this->activate('ada@example.org', $this->lastCode())->getStatusCode());
    }

    #[TestDox('UC-CPT-01-F33 — RG9 : l’inscription lit l’horloge une fois — refusée sous octobre (le mois dépensé), à 23 h 59 min 59 s UTC le 31, alors que l’horloge passe au 1er novembre pendant la création du compte (le hachage Argon2id) : son attente est datée d’octobre, la réponse et le courriel disent « le 1er novembre », et la levée de novembre la prend ; la connexion et le renvoi lisent aussi leur horloge une fois')]
    public function testF33TheSignUpReadsTheClockOnce(): void
    {
        $seuil = (new Waitlist(self::$pdo))->floorMicrousd();
        $plafond = $seuil + 100_000;
        TestDb::setEnv('OFFERTS_MENSUEL_USD', sprintf('%.6f', $plafond / 1_000_000));
        $octobre = gmmktime(23, 59, 59, 10, 31, 2030);
        $ledger = new FreeCreditLedger(self::$pdo);
        self::assertTrue($ledger->reserve($plafond, $plafond, $octobre - 3600));
        $ledger->settle($plafond, $plafond, $octobre - 3600); // octobre 2030 dépensé ; novembre, neuf
        // Une horloge qui passe au 1er novembre à sa deuxième lecture.
        $lectures = 0;
        \Humanome\Clock::setOverride(static function () use (&$lectures, $octobre): int {
            return $octobre + (++$lectures > 1 ? 1 : 0);
        });
        try {
            $registered = $this->signUp();
            self::assertSame(201, $registered->getStatusCode(), (string) $registered->getBody());
            self::assertSame(['status' => 'waitlisted', 'email' => 'ada@example.org', 'message' => Waitlist::signupMessage($octobre)],
                self::json($registered));
            self::assertStringContainsString('le 1er novembre', self::json($registered)['message']);
            self::assertSame('2030-10-31 23:59:59', self::userRow('ada@example.org')['waitlisted_at'], 'daté de la décision : octobre');
            self::assertStringContainsString('Le 1er novembre, vous recevrez', $this->mailer->last()['body']);

            // Le 1er novembre, la connexion d'Ada la lève (son attente est finie), en lisant elle aussi
            // une seule horloge — dans le même lot que la levée du mois.
            $novembre = gmmktime(0, 0, 5, 11, 1, 2030);
            \Humanome\Clock::setOverride(static fn (): int => $novembre);
            $this->cookieSid = null;
            $login = $this->login('ada@example.org', self::PASSWORD);
            self::assertSame([403, 'email_not_verified'], [$login->getStatusCode(), self::json($login)['code']]);
            self::assertNull(self::userRow('ada@example.org')['waitlisted_at']);
            self::assertSame(['ada@example.org', 'humanome.xyz — activez votre compte'],
                [$this->mailer->last()['to'], $this->mailer->last()['subject']]);
        } finally {
            \Humanome\Clock::setOverride(null);
        }
    }

    #[TestDox('UC-CPT-01-F34 — RG9 : l’expiration du code d’activation est écrite et lue en UTC, quel que soit le fuseau de PHP — un code posé par un PHP en UTC (le cron, scripts/worker.php, qui lève la liste) et lu par un PHP réglé sur Paris s’active au lieu d’être « expiré » dès sa naissance ; posé sous Paris, il vit 30 minutes, pas 2 h 30 ; lu sous Los Angeles, il s’active aussi')]
    public function testF34TheCodeExpiryIsUtc(): void
    {
        $zone = date_default_timezone_get();
        try {
            date_default_timezone_set('UTC');
            self::assertSame('pending_activation', self::json($this->signUp())['status']);
            $code = $this->lastCode();
            date_default_timezone_set('Europe/Paris');
            $this->cookieSid = null;
            self::assertSame(200, $this->activate('ada@example.org', $code)->getStatusCode(), 'posé en UTC, lu sous Paris');

            self::assertSame('pending_activation', self::json($this->signUp(['email' => 'bob@example.org', 'emailConfirm' => 'bob@example.org']))['status']);
            $ttl = strtotime(self::userRow('bob@example.org')['verification_expires_at'] . ' UTC') - time();
            self::assertEqualsWithDelta(1800, $ttl, 5, 'posé sous Paris : 30 minutes, en UTC');
            date_default_timezone_set('America/Los_Angeles');
            $this->cookieSid = null;
            self::assertSame(200, $this->activate('bob@example.org', $this->lastCode())->getStatusCode(), 'posé sous Paris, lu sous Los Angeles');
        } finally {
            date_default_timezone_set($zone);
        }
    }

    #[TestDox('UC-CPT-01-F35 — A5 : plus de comptes dus qu’un lot (Waitlist::LIFT_BATCH + 1) — la connexion du dernier inscrit déclenche la levée du mois, qui lève les 50 premiers dans l’ordre d’inscription, puis le lève LUI (sa propre branche) : 403 email_not_verified et un seul courriel pour lui ; aucun compte ne reste en attente')]
    public function testF35TheLoginOfAnAccountBeyondTheBatchLiftsIt(): void
    {
        $hash = \Humanome\Auth\Users::hashPassword(self::PASSWORD);
        $emails = [];
        for ($i = 1; $i <= Waitlist::LIFT_BATCH + 1; $i++) {
            $emails[] = $email = sprintf('attente%02d@example.org', $i);
            \Humanome\Auth\Users::create(self::$pdo, $email, $hash, 'Attente ' . $i);
            self::attenteDuMoisDernier($email);
        }
        $dernier = end($emails);
        $this->mailer->clear();

        $this->cookieSid = null;
        $login = $this->login($dernier, self::PASSWORD);
        self::assertSame([403, 'email_not_verified'], [$login->getStatusCode(), self::json($login)['code']]);
        $destinataires = array_column($this->mailer->sent, 'to');
        self::assertSame(\array_slice($emails, 0, Waitlist::LIFT_BATCH), \array_slice($destinataires, 0, Waitlist::LIFT_BATCH),
            'la levée du mois : un lot, dans l’ordre d’inscription');
        self::assertSame([$dernier], array_values(array_filter($destinataires, static fn (string $to): bool => $to === $dernier)),
            'un seul courriel pour lui, de sa propre levée');
        self::assertCount(Waitlist::LIFT_BATCH + 1, $destinataires);
        self::assertNull(self::userRow($dernier)['waitlisted_at']);
        self::assertSame(0, (new Waitlist(self::$pdo))->count());
        self::assertSame(200, $this->activate($dernier, $this->lastCode())->getStatusCode());
    }
}
