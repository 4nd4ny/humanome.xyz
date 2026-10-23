<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Auth\ActivationMail;
use Humanome\Auth\Audit;
use Humanome\Auth\RateLimiter;
use Humanome\Auth\Users;
use Humanome\Auth\Waitlist;
use Humanome\ClientIp;
use Humanome\DbSessionHandler;
use Humanome\Llm\AnthropicProvider;
use Humanome\Llm\DemoConfig;
use Humanome\Llm\FreeCreditLedger;
use Humanome\Llm\Pricing;
use Humanome\Mail\MailerFactory;
use Humanome\Mail\MemoryMailer;
use Humanome\Mail\PhpMailMailer;
use Humanome\Middleware\CsrfMiddleware;
use Humanome\MigrationRunner;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\TestDb;
use Humanome\Twin9\Twin9Config;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use RuntimeException;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Psr7\Factory\ServerRequestFactory;

/**
 * UC-CPT-01 — Créer un compte et l'activer par code email : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/compte/UC-CPT-01-creer-activer-compte.md
 *
 * Les briques appelées par POST /api/auth/register, /activate et /resend sont
 * exercées directement (sans couche HTTP) : Users (création, attribution et
 * relecture de rôle, stockage de l'empreinte du code, compteur d'essais,
 * activation), Audit, le Mailer injectable (MailerFactory / MemoryMailer), le
 * RateLimiter, l'identité IP des seaux (ClientIp) et les exemptions CSRF des
 * routes visiteur.
 *
 * Ce que ces briques NE décident PAS — rôle « apprenant » par défaut, hachage
 * du code, absence de détail dans account_created, valeurs des quotas 10/20/3/10
 * — est fixé par la route (api/src/routes/auth.php) et vérifié par les tests
 * fonctionnels (F01, F07, F10, F11).
 *
 * La liste d'attente (sprint 7, S7a-2 ; U19 à U22) : Auth\Waitlist, le critère
 * FreeCreditLedger::signupsOpen et Auth\ActivationMail, à horloge figée.
 */
final class UcCpt01CreerActiverCompteTest extends TestCase
{
    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    public static function tearDownAfterClass(): void
    {
        TestDb::restoreEnv();
    }

    protected function setUp(): void
    {
        self::$pdo->exec('DELETE FROM users');
        self::$pdo->exec('DELETE FROM audit_events');
        self::$pdo->exec('DELETE FROM rate_limits');
        self::$pdo->exec('DELETE FROM free_credit_monthly');
    }

    protected function tearDown(): void
    {
        MailerFactory::setOverride(null);
        unset($_COOKIE[DbSessionHandler::SESSION_NAME]);
    }

    /** @return array<string, mixed> */
    private static function row(int $userId): array
    {
        $stmt = self::$pdo->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$userId]);

        return $stmt->fetch();
    }

    #[TestDox('UC-CPT-01-U01 — Users::create, assignRole, rolesOf : compte créé non activé, rôle attribué puis relu, rôle inconnu refusé')]
    public function testU01CreateAndDefaultRole(): void
    {
        $id = Users::create(self::$pdo, 'ada@example.org', Users::hashPassword('correct horse battery'), 'Ada');
        self::assertSame([], Users::rolesOf(self::$pdo, $id), 'create n’attribue aucun rôle : c’est la route qui pose « apprenant » (F01)');
        Users::assignRole(self::$pdo, $id, 'apprenant');

        self::assertSame(['apprenant'], Users::rolesOf(self::$pdo, $id));
        $row = self::row($id);
        self::assertNull($row['email_verified_at'], 'un compte créé n’est PAS activé');
        self::assertSame(0, (int) $row['verification_attempts']);

        $this->expectException(RuntimeException::class);
        Users::assignRole(self::$pdo, $id, 'visiteur'); // le visiteur n'est pas un rôle (§2)
    }

    #[TestDox('UC-CPT-01-U02 — Users::hashPassword : empreinte Argon2id, jamais le mot de passe en clair')]
    public function testU02PasswordIsArgon2id(): void
    {
        $hash = Users::hashPassword('correct horse battery');

        self::assertSame('argon2id', password_get_info($hash)['algoName']);
        self::assertStringNotContainsString('correct horse battery', $hash);
        self::assertTrue(password_verify('correct horse battery', $hash));
        self::assertFalse(password_verify('Correct horse battery', $hash));
    }

    #[TestDox('UC-CPT-01-U03 — setVerificationCode stocke l’empreinte fournie et son expiration, remet les essais à 0 ; bumpVerificationAttempts compte')]
    public function testU03VerificationCodeAndAttempts(): void
    {
        $id = Users::create(self::$pdo, 'ada@example.org', Users::hashPassword('correct horse battery'), 'Ada');
        // L'empreinte est calculée par l'APPELANT (la route hache le code : F01) ;
        // setVerificationCode stocke telle quelle la chaîne reçue.
        $fingerprint = Users::hashPassword('0420');
        Users::setVerificationCode(self::$pdo, $id, $fingerprint, '2030-01-01 00:30:00');

        $row = self::row($id);
        self::assertSame($fingerprint, $row['verification_code_hash']);
        self::assertTrue(password_verify('0420', (string) $row['verification_code_hash']));
        self::assertSame('2030-01-01 00:30:00', $row['verification_expires_at']);

        self::assertSame(1, Users::bumpVerificationAttempts(self::$pdo, $id));
        self::assertSame(2, Users::bumpVerificationAttempts(self::$pdo, $id));

        // Renvoi (D5) : nouveau code ET cinq essais rouverts.
        Users::setVerificationCode(self::$pdo, $id, Users::hashPassword('9999'), '2030-01-01 01:00:00');
        self::assertSame(0, (int) self::row($id)['verification_attempts']);
    }

    #[TestDox('UC-CPT-01-U04 — markVerified active le compte et efface le code (usage unique) ; isVerified')]
    public function testU04MarkVerifiedIsSingleUse(): void
    {
        $id = Users::create(self::$pdo, 'ada@example.org', Users::hashPassword('correct horse battery'), 'Ada');
        Users::setVerificationCode(self::$pdo, $id, Users::hashPassword('0420'), '2030-01-01 00:30:00');
        Users::bumpVerificationAttempts(self::$pdo, $id);
        self::assertFalse(Users::isVerified(Users::findById(self::$pdo, $id)));

        Users::markVerified(self::$pdo, $id);

        $user = Users::findById(self::$pdo, $id);
        self::assertTrue(Users::isVerified($user));
        self::assertNull($user['verification_code_hash']);
        self::assertNull($user['verification_expires_at']);
        self::assertSame(0, (int) $user['verification_attempts']);
        self::assertFalse(Users::isVerified(null));
    }

    #[TestDox('UC-CPT-01-U05 — findByEmail : colonnes de vérification lues, casse indifférente (collation), ligne supprimée invisible')]
    public function testU05FindByEmail(): void
    {
        $id = Users::create(self::$pdo, 'ada@example.org', Users::hashPassword('correct horse battery'), 'Ada');

        $found = Users::findByEmail(self::$pdo, 'ada@example.org');
        self::assertNotNull($found);
        self::assertSame($id, (int) $found['id']);
        self::assertArrayHasKey('verification_code_hash', $found);
        self::assertArrayHasKey('email_verified_at', $found);
        self::assertNull(Users::findByEmail(self::$pdo, 'nobody@example.org'));
        // Collation utf8mb4_unicode_ci : la recherche (et l'index unique) ignorent la casse,
        // en plus de la normalisation en minuscules faite par les routes.
        self::assertSame($id, (int) Users::findByEmail(self::$pdo, 'ADA@Example.org')['id']);

        self::$pdo->exec('UPDATE users SET deleted_at = NOW() WHERE id = ' . $id);
        self::assertNull(Users::findByEmail(self::$pdo, 'ada@example.org'));
    }

    #[TestDox('UC-CPT-01-U06 — Mailer : override de test prioritaire, sinon mail() natif ; MemoryMailer extrait le code du lien')]
    public function testU06MailerSeamAndCodeExtraction(): void
    {
        self::assertInstanceOf(PhpMailMailer::class, MailerFactory::default());

        $memory = new MemoryMailer();
        MailerFactory::setOverride($memory);
        self::assertSame($memory, MailerFactory::default());

        MailerFactory::default()->send('ada@example.org', 'Sujet', "Code : 0420\nhttps://humanome.xyz/#/activer?email=ada%40example.org&code=0420");
        self::assertSame('ada@example.org', $memory->last()['to']);
        self::assertSame('0420', $memory->lastCode());

        $memory->send('ada@example.org', 'Sujet', 'aucun lien ici');
        self::assertSame('', $memory->lastCode());
        $memory->clear();
        self::assertNull($memory->last());
    }

    #[TestDox('UC-CPT-01-U07 — Audit::record sans détails : événement account_created daté, details NULL')]
    public function testU07AccountCreatedAudit(): void
    {
        $id = Users::create(self::$pdo, 'ada@example.org', Users::hashPassword('correct horse battery'), 'Ada');
        Audit::record(self::$pdo, $id, Audit::ACCOUNT_CREATED);

        $event = self::$pdo->query("SELECT user_id, details, created_at FROM audit_events WHERE type = 'account_created'")->fetch();
        self::assertSame($id, (int) $event['user_id']);
        self::assertNull($event['details']);
        self::assertNotEmpty($event['created_at']);
    }

    #[TestDox('UC-CPT-01-U08 — RateLimiter (fenêtre fixe) : blocage au-delà de la limite, fenêtre suivante libre, 30 s au premier refus puis doublé, plafonné à la fenêtre')]
    public function testU08RateLimitsOfTheUseCase(): void
    {
        // Les paramètres ci-dessous REPRODUISENT ceux de la route (auth.php) ;
        // ce test ne les lit pas : leur valeur réelle est vérifiée par F07
        // (inscription), F10 (activation) et F11 (renvoi par compte et par IP).
        $now = 1_800_000_000;
        foreach ([
            ['register:x', 10, 3600],
            ['activate:x', 20, 900],
            ['resend:acct:x', 3, 3600],
            ['resend:ip:x', 10, 3600],
        ] as [$bucket, $limit, $window]) {
            $limiter = new RateLimiter(self::$pdo, $limit, $window);
            for ($i = 1; $i <= $limit; $i++) {
                self::assertFalse($limiter->isBlocked($bucket, $now), "$bucket essai $i");
                $limiter->hit($bucket, $now);
            }
            self::assertTrue($limiter->isBlocked($bucket, $now), "$bucket bloqué après $limit");
            self::assertSame(30, $limiter->retryAfter($limit + 1), "$bucket : 30 s au premier refus");
            self::assertSame(60, $limiter->retryAfter($limit + 2), "$bucket : délai doublé");
            self::assertSame($window, $limiter->retryAfter($limit + 50), "$bucket : plafonné à la fenêtre");
            self::assertFalse($limiter->isBlocked($bucket, $now + $window), "$bucket : fenêtre suivante");
        }
    }

    #[TestDox('UC-CPT-01-U09 — CsrfMiddleware : register, activate et resend passent sans jeton même avec un cookie de session')]
    public function testU09VisitorRoutesAreCsrfExempt(): void
    {
        TestDb::overrideEnv();
        $_COOKIE[DbSessionHandler::SESSION_NAME] = 'cookie-quelconque';
        $handler = new class () implements RequestHandlerInterface {
            public int $calls = 0;

            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                $this->calls++;

                return (new ResponseFactory())->createResponse(204);
            }
        };
        $middleware = new CsrfMiddleware();

        foreach (['/api/auth/register', '/api/auth/activate', '/api/auth/resend'] as $path) {
            $request = (new ServerRequestFactory())->createServerRequest('POST', $path);
            self::assertSame(204, $middleware->process($request, $handler)->getStatusCode(), $path);
        }
        self::assertSame(3, $handler->calls);
        self::assertNotSame(PHP_SESSION_ACTIVE, session_status(), 'aucune session ouverte pour un visiteur');
    }

    #[TestDox('UC-CPT-01-U16 — ClientIp::bucketIdentity : IPv6 regroupée par /64, IPv4 complète, IPv4 mappée = IPv4 ; le seau stocké est haché')]
    public function testU16BucketIdentityOfTheQuotas(): void
    {
        self::assertSame(
            ClientIp::bucketIdentity('2001:db8:1:2::1'),
            ClientIp::bucketIdentity('2001:db8:1:2::abcd'),
            'même /64 : même seau (rotation de l’identifiant d’interface inutile)',
        );
        self::assertNotSame(ClientIp::bucketIdentity('2001:db8:1:2::1'), ClientIp::bucketIdentity('2001:db8:1:3::1'));
        self::assertSame('v4:203.0.113.10', ClientIp::bucketIdentity('203.0.113.10'));
        self::assertSame('v4:203.0.113.10', ClientIp::bucketIdentity('::ffff:203.0.113.10'));
        self::assertNotSame(ClientIp::bucketIdentity('203.0.113.10'), ClientIp::bucketIdentity('203.0.113.11'), 'IPv4 : adresse complète');

        // Forme du seau d'inscription (auth.php) : jamais l'IP en clair… mais
        // un sha256 NON salé de « v4:a.b.c.d » (voir « Anomalies constatées », AN2).
        $bucket = 'register:' . hash('sha256', ClientIp::bucketIdentity('203.0.113.10'));
        self::assertStringNotContainsString('203.0.113.10', $bucket);
        self::assertSame('register:' . hash('sha256', 'v4:203.0.113.10'), $bucket);
    }

    /** Un compte de test, non activé (comme à l'inscription). */
    private static function account(string $email): int
    {
        return Users::create(self::$pdo, $email, Users::hashPassword('correct horse battery'), 'Ada');
    }

    #[TestDox('UC-CPT-01-U19 — Waitlist, horloge figée au passage du 31 octobre au 1er novembre (UTC) : waitlisted_at écrit en UTC par PHP quel que soit le fuseau ; dû au 1er à 0 h UTC, pas une seconde avant ; prochaine levée le 1er du mois suivant (décembre → janvier) ; le message nomme le mois')]
    public function testU19WaitlistClockIsUtc(): void
    {
        $now = gmmktime(23, 59, 59, 10, 31, 2026); // 31 octobre, 23:59:59 UTC (1 h du matin à Paris le 1er novembre)
        $zone = date_default_timezone_get();
        date_default_timezone_set('Europe/Paris');
        try {
            $id = self::account('ada@example.org');
            (new Waitlist(self::$pdo))->enlist($id, $now);
        } finally {
            date_default_timezone_set($zone);
        }
        $row = Users::findById(self::$pdo, $id);
        self::assertSame('2026-10-31 23:59:59', $row['waitlisted_at'], 'UTC, jamais l’heure locale de PHP ni NOW() de MySQL');
        self::assertTrue(Waitlist::isWaitlisted($row));
        self::assertFalse(Waitlist::isDue($row, $now), 'encore octobre (UTC)');
        self::assertTrue(Waitlist::isDue($row, $now + 1), 'le 1er novembre à 0 h UTC');
        self::assertSame('2026-11-01 00:00:00', Waitlist::monthStart($now + 1));
        self::assertSame('2026-11-01', Waitlist::nextLift($now));
        self::assertSame('2027-01-01', Waitlist::nextLift(gmmktime(12, 0, 0, 12, 31, 2026)));
        self::assertFalse(Waitlist::isWaitlisted(['waitlisted_at' => null]));
        self::assertFalse(Waitlist::isDue(['waitlisted_at' => null], $now + 1));
        self::assertSame('Les crédits offerts de ce mois sont épuisés : votre inscription est en liste d\'attente. '
            . 'Vous recevrez votre code d\'activation par email le 1er novembre (plus tôt si l\'administrateur lève la liste).',
            Waitlist::signupMessage($now));
        self::assertStringContainsString('le 1er janvier', Waitlist::signupMessage(gmmktime(12, 0, 0, 12, 31, 2026)));
        self::assertSame(FreeCreditLedger::refusalMessage($now), 'Les crédits offerts de ce mois sont épuisés ; revenez le 1er novembre.',
            'le refus de S7a-1 inchangé');
    }

    #[TestDox('UC-CPT-01-U20 — FreeCreditLedger::signupsOpen : ouvertes tant que le plafond moins le DÉPENSÉ couvre le seuil, au micro-dollar près ; une réserve en vol ne compte pas ; plafond 0 → liste d’attente ; mois neuf → rouvertes. Le seuil (Waitlist::floorMicrousd) est le pire cas du plus petit appel de l’Essayer, que tout vrai appel dépasse')]
    public function testU20SignupsOpenUnderTheFloor(): void
    {
        $now = gmmktime(12, 0, 0, 10, 15, 2026);
        $ledger = new FreeCreditLedger(self::$pdo);
        $cap = 400_000;
        $floor = 320_065;
        self::assertTrue($ledger->signupsOpen($cap, $floor, $now), 'rien dépensé');
        self::assertTrue($ledger->reserve(79_935, $cap, $now));
        $ledger->settle(79_935, 79_935, $now);
        self::assertTrue($ledger->signupsOpen($cap, $floor, $now), 'reste 320 065 µ$ = le seuil : ouvertes');
        self::assertTrue($ledger->reserve(300_000, $cap, $now), 'un appel en vol');
        self::assertTrue($ledger->signupsOpen($cap, $floor, $now), 'la réserve en vol ne ferme rien');
        $ledger->settle(300_000, 1, $now);
        self::assertFalse($ledger->signupsOpen($cap, $floor, $now), 'reste 320 064 µ$ : sous le seuil');
        self::assertTrue($ledger->signupsOpen($cap, $floor, gmmktime(0, 0, 0, 11, 1, 2026)), 'le 1er novembre, un mois neuf');
        self::assertFalse($ledger->signupsOpen(0, $floor, gmmktime(0, 0, 0, 11, 1, 2026)), 'plafond 0 : toute inscription attend');
        self::assertFalse($ledger->signupsOpen(0, 0, gmmktime(0, 0, 0, 11, 1, 2026)), 'seuil nul compté au moins 1 µ$');

        // Le seuil : l'entrée du seul surcoût de la requête, toute la sortie du modèle, au tarif de la grille.
        TestDb::overrideEnv();
        $config = DemoConfig::load();
        $grille = (new Twin9Config(new SettingsRepository(self::$pdo)))->modeles();
        $seuil = (new Waitlist(self::$pdo))->floorMicrousd($config);
        self::assertSame(FreeCreditLedger::microusd(Pricing::estimateUsd($config->model,
            AnthropicProvider::REQUEST_OVERHEAD_TOKENS, $config->sortieMax(), $grille)), $seuil);
        self::assertGreaterThan(0, $seuil);
        // Invariant : tout appel réel de l'Essayer (une entrée non vide en plus du surcoût) réserve au
        // moins le seuil — une inscription en liste d'attente ne voit passer aucun appel de l'Essayer.
        foreach ([1, 5_000, 200_000] as $octets) {
            self::assertGreaterThanOrEqual($seuil, FreeCreditLedger::microusd(Pricing::estimateUsd($config->model,
                AnthropicProvider::REQUEST_OVERHEAD_TOKENS + $octets, $config->sortieMax(), $grille)), (string) $octets);
        }
    }

    #[TestDox('UC-CPT-01-U21 — Waitlist::liftDue : au 1er du mois, les comptes en attente des mois passés sont levés dans l’ordre d’inscription, par lots ; chacun reçoit son code (levée unique : une seconde levée n’envoie rien) ; ceux du mois courant et les comptes supprimés attendent ; audit waitlist_lifted sans auteur')]
    public function testU21LiftDueInSignupOrder(): void
    {
        $mailer = new MemoryMailer();
        MailerFactory::setOverride($mailer);
        $waitlist = new Waitlist(self::$pdo);
        $octobre = gmmktime(10, 0, 0, 10, 10, 2026);
        $ids = [];
        foreach (['un', 'deux', 'trois', 'parti'] as $i => $nom) {
            $ids[$nom] = self::account($nom . '@example.org');
            $waitlist->enlist($ids[$nom], $octobre + $i * 86_400);
        }
        self::$pdo->prepare('UPDATE users SET deleted_at = NOW() WHERE id = ?')->execute([$ids['parti']]);
        $novembre = gmmktime(0, 0, 0, 11, 1, 2026);
        $tard = self::account('novembre@example.org');
        $waitlist->enlist($tard, $novembre);

        self::assertSame(['lifted' => 0, 'failed' => 0], $waitlist->liftDue($novembre - 1), 'le 31 octobre au soir (UTC), rien n’est dû');
        self::assertSame([], $mailer->sent);
        self::assertSame(4, $waitlist->count(), 'le compte supprimé ne compte pas');

        self::assertSame(['lifted' => 2, 'failed' => 0], $waitlist->liftDue($novembre, 2), 'un lot de deux');
        self::assertSame(['un@example.org', 'deux@example.org'], array_column($mailer->sent, 'to'), 'ordre d’inscription');
        self::assertNull(self::row($ids['un'])['waitlisted_at']);
        self::assertNotNull(self::row($ids['un'])['verification_code_hash'], 'son code est posé');
        self::assertNotNull(self::row($ids['trois'])['waitlisted_at'], 'le suivant attend le lot suivant');
        self::assertStringContainsString('sort de la liste d\'attente', $mailer->sent[0]['body']);

        self::assertSame(['lifted' => 1, 'failed' => 0], $waitlist->liftDue($novembre));
        self::assertSame(['lifted' => 0, 'failed' => 0], $waitlist->liftDue($novembre), 'plus rien de dû');
        self::assertSame(Waitlist::UNCHANGED, $waitlist->lift($ids['un']), 'déjà levé : rien');
        self::assertCount(3, $mailer->sent, 'un mail par compte, jamais deux');
        self::assertNotNull(self::row($tard)['waitlisted_at'], 'inscrit en novembre : attend décembre');
        self::assertNotNull(self::row($ids['parti'])['waitlisted_at'], 'un compte supprimé n’est pas levé');

        $audits = self::$pdo->query("SELECT user_id, details FROM audit_events WHERE type = 'waitlist_lifted' ORDER BY id")->fetchAll();
        self::assertSame([null, null, null], array_column($audits, 'user_id'), 'la levée du mois n’a pas d’auteur');
        self::assertSame([$ids['un'], $ids['deux'], $ids['trois']],
            array_map(static fn (array $a): int => json_decode((string) $a['details'], true)['targetUserId'], $audits));
    }

    #[TestDox('UC-CPT-01-U22 — ActivationMail : le mail de la liste d’attente ne porte aucun code et nomme le 1er du mois suivant ; celui de la levée porte le code, le lien, ses 30 minutes et le recours « Renvoyer le code »')]
    public function testU22WaitlistMails(): void
    {
        $mailer = new MemoryMailer();
        MailerFactory::setOverride($mailer);
        ActivationMail::sendWaitlisted('ada@example.org', gmmktime(12, 0, 0, 10, 15, 2026));
        $attente = $mailer->last();
        self::assertSame(['ada@example.org', 'humanome.xyz — votre inscription est en liste d\'attente'], [$attente['to'], $attente['subject']]);
        self::assertStringContainsString('Le 1er novembre, vous recevrez par email votre code d\'activation', $attente['body']);
        self::assertStringNotContainsString('code=', $attente['body']);
        self::assertStringNotContainsString('code de confirmation est', $attente['body'], 'aucun code');
        self::assertSame('', $mailer->lastCode());

        $id = self::account('ada@example.org');
        ActivationMail::send(self::$pdo, $id, 'ada@example.org', true);
        $levee = $mailer->last();
        self::assertSame('humanome.xyz — activez votre compte', $levee['subject']);
        $code = $mailer->lastCode();
        self::assertMatchesRegularExpression('/^\d{4}$/', $code);
        self::assertTrue(password_verify($code, (string) self::row($id)['verification_code_hash']));
        self::assertStringContainsString('/#/activer?email=ada%40example.org&code=' . $code, $levee['body']);
        self::assertStringContainsString('Ce code expire dans 30 minutes', $levee['body']);
        self::assertStringContainsString('« Renvoyer le code »', $levee['body']);
        // Vrai au 1er du mois comme pour une levée par l'administrateur en cours de mois, plafond atteint.
        self::assertStringContainsString('Votre inscription sur humanome.xyz sort de la liste d\'attente.', $levee['body']);
        self::assertStringNotContainsString('renouvel', $levee['body']);
        self::assertStringContainsString('/#/compte', $levee['body']);
    }

    #[TestDox('UC-CPT-01-U25 — Waitlist : un courriel de levée que le transport refuse (mail() rend false : quota, sendmail en panne) laisse le compte EN LISTE D’ATTENTE, à sa date, sans code ni audit de levée — levée « mail_failed », jamais « lifted » ; la levée du mois s’arrête au premier refus et se retient 5 minutes (aucun courriel, aucun code régénéré à chaque requête), puis reprend dans l’ordre ; « Tout lever » s’arrête aussi et le dit (failed)')]
    public function testU25ALiftWhoseMailFailsStaysOnTheList(): void
    {
        $mailer = new MemoryMailer();
        $mailer->refuse = true;
        MailerFactory::setOverride($mailer);
        $waitlist = new Waitlist(self::$pdo);
        $octobre = gmmktime(10, 0, 0, 10, 10, 2026);
        $ids = [];
        foreach (['un', 'deux', 'trois'] as $i => $nom) {
            $ids[$nom] = self::account($nom . '@example.org');
            $waitlist->enlist($ids[$nom], $octobre + $i * 86_400);
        }
        $novembre = gmmktime(0, 0, 0, 11, 1, 2026);

        self::assertSame(['lifted' => 0, 'failed' => 1], $waitlist->liftDue($novembre), 'arrêtée au premier refus');
        self::assertSame(['un@example.org'], $mailer->refused, 'un seul essai');
        $un = self::row($ids['un']);
        self::assertSame(['2026-10-10 10:00:00', null, null], [$un['waitlisted_at'], $un['verification_code_hash'], $un['verification_expires_at']],
            'remis en liste d’attente à sa date, sans code : la levée suivante le reprend');
        self::assertSame(0, (int) self::$pdo->query("SELECT COUNT(*) FROM audit_events WHERE type = 'waitlist_lifted'")->fetchColumn());
        self::assertSame(3, $waitlist->count());

        // Le transport refuse encore : 5 minutes sans essai, à chaque requête et chaque tick.
        self::assertSame(['lifted' => 0, 'failed' => 0], $waitlist->liftDue($novembre + 60));
        self::assertCount(1, $mailer->refused, 'aucun essai pendant la retenue');

        // L'administrateur, lui, essaie : un compte, puis tout ; chacun le dit.
        self::assertSame(Waitlist::MAIL_FAILED, $waitlist->lift($ids['deux'], 1));
        self::assertSame(['lifted' => 0, 'failed' => 1, 'remaining' => 3], $waitlist->liftAll(1));
        self::assertSame(['un@example.org', 'deux@example.org', 'un@example.org'], $mailer->refused);
        self::assertSame(3, $waitlist->count());

        // Le transport revient, la retenue passée : la levée reprend dans l'ordre d'inscription.
        $mailer->refuse = false;
        self::assertSame(['lifted' => 3, 'failed' => 0], $waitlist->liftDue($novembre + 300));
        self::assertSame(['un@example.org', 'deux@example.org', 'trois@example.org'], array_column($mailer->sent, 'to'));
        self::assertSame(Waitlist::UNCHANGED, $waitlist->lift($ids['un']), 'déjà levé');
        self::assertSame(3, (int) self::$pdo->query("SELECT COUNT(*) FROM audit_events WHERE type = 'waitlist_lifted'")->fetchColumn());
    }
}
