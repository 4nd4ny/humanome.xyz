<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Db;
use Humanome\Llm\LlmRuntime;
use Humanome\Tests\CartographeTestCase;
use Humanome\Tests\LlmFakeHttpClient;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\TwinSupport;
use Humanome\Twin9\CreditService;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-ETA-05 — Gérer son école (crédit, surtaxe, plafond par élève, clé) :
 * tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/etablissement/UC-ETA-05-gerer-ecole.md
 *
 * Le parcours de l'école (sprint 6, lot S6b — ADR-013) rejoué à travers
 * l'API HTTP (Slim en processus, vraie base MySQL) : réglages (surtaxe
 * bornée, plafond par élève), achat de crédit par PayPal (bac à sable joué
 * par le faux client HTTP), clé de l'école (écrite, jamais rendue), membres
 * et dépense par élève, et ce que paie un appel de ses élèves sur la
 * cartographie ouverte. PayPal et Anthropic sont simulés : aucun appel
 * réseau, aucune vraie clé.
 */
final class UcEta05GererEcoleTest extends CartographeTestCase
{
    private LlmFakeHttpClient $http;

    /** @var array{id: int, csrf: string, sid: string} */
    private array $ecole;

    /** @var array{id: int, csrf: string, sid: string} */
    private array $lea;

    protected function setUp(): void
    {
        parent::setUp();
        TestDb::setEnv('PAYPAL_MODE', 'sandbox');
        TestDb::setEnv('PAYPAL_CLIENT_ID', 'client-fictif');
        TestDb::setEnv('PAYPAL_SECRET', 'secret-fictif');
        TestDb::setEnv('ANTHROPIC_API_KEY', TwinSupport::PLATFORM_KEY);
        TestDb::setEnv('SODIUM_MASTER_KEY', bin2hex(random_bytes(32)));
        Db::get()->exec("DELETE FROM settings WHERE name = 'twin9_config'");
        $this->http = new LlmFakeHttpClient();
        LlmRuntime::setHttpClient($this->http);
        $this->ecole = $this->registerAs('ecole@example.org', 'École des Tilleuls', ['etablissement']);
        $this->lea = $this->registerAs('lea@example.org', 'Léa', ['apprenant']);
    }

    protected function tearDown(): void
    {
        LlmRuntime::setHttpClient(null);
        parent::tearDown();
    }

    /** La cohorte de l'école, que Léa rejoint avec son consentement. */
    private function rejoindre(array $ecole, array $eleve, string $nom = 'BTS SIO 2026'): void
    {
        $cohorte = self::json($this->as_($ecole, 'POST', '/api/etablissement/cohortes', ['nom' => $nom]));
        $join = $this->as_($eleve, 'POST', '/api/cohortes/' . $cohorte['codeInvitation'] . '/rejoindre', ['consentement' => true]);
        self::assertSame(201, $join->getStatusCode(), (string) $join->getBody());
    }

    /** Un appel de la cartographie ouverte : 1 000 jetons en entrée, 200 en sortie (4 000 µUSD au prix de la grille). */
    private function appelTwin6(array $user, array $extra = []): ResponseInterface
    {
        TwinSupport::queueAnthropic($this->http, '{"poleNum":1}', 1000, 200);

        return $this->as_($user, 'POST', '/api/twin6/appel',
            ['model' => 'claude-sonnet-5', 'prompt' => 'Scanne le pôle 1.', 'max_tokens' => 1024] + $extra);
    }

    private static function crediter(int $compte, int $microusd, string $libelle): void
    {
        (new CreditService(Db::get()))->adjust($compte, $microusd, $libelle);
    }

    private static function solde(int $compte): int
    {
        return (new CreditService(Db::get()))->balance($compte);
    }

    private function page(): array
    {
        $r = $this->as_($this->ecole, 'GET', '/api/etablissement/ecole');
        self::assertSame(200, $r->getStatusCode(), (string) $r->getBody());

        return self::json($r);
    }

    #[TestDox('UC-ETA-05-F01 — nominal : défauts ; régler surtaxe et plafond ; acheter du crédit (PayPal, bac à sable) ; un élève rejoint ; son appel est débité de l’école au coût réel × (1 + surtaxe) et apparaît dans sa dépense')]
    public function testF01Nominal(): void
    {
        // 1. Défauts : surtaxe 3,5 %, plafond 0, aucun crédit, aucune clé, aucun élève.
        $page = $this->page();
        // (JSON writes 10.0 as 10)
        self::assertSame([3.5, 3.5, 10, 0, 0, [], [], 0], [$page['surtaxePct'], $page['surtaxeMin'], $page['surtaxeMax'],
            $page['plafondEleveMicrousd'], $page['creditMicrousd'], $page['cles'], $page['eleves'],
            $page['depenseMoisMicrousd']]);
        self::assertTrue($page['chiffrementDisponible']);

        // 2. Réglages : 6,5 %, 10 $ par élève et par mois.
        $put = $this->as_($this->ecole, 'PUT', '/api/etablissement/ecole', ['surtaxePct' => 6.5, 'plafondEleveUsd' => 10]);
        self::assertSame(200, $put->getStatusCode(), (string) $put->getBody());
        self::assertSame([6.5, 10_000_000], [self::json($put)['surtaxePct'], self::json($put)['plafondEleveMicrousd']]);
        self::assertEquals(['surtaxePct' => 6.5, 'plafondEleveUsd' => 10], self::lastAudit('ecole_reglages')['details']);

        // 3. L'école achète 20 $ de crédit (chemin existant, réservé aux écoles).
        TwinSupport::queuePaypalToken($this->http);
        TwinSupport::queuePaypalOrderCreated($this->http, 'ORDER-ETA05');
        self::assertSame(200, $this->as_($this->ecole, 'POST', '/api/twin9/credit/paypal/creer', ['pack_index' => 1])->getStatusCode());
        TwinSupport::queuePaypalToken($this->http);
        TwinSupport::queuePaypalCaptured($this->http, 'ORDER-ETA05', '20.00', 'CAP-ETA05');
        self::assertSame(200, $this->as_($this->ecole, 'POST', '/api/twin9/credit/paypal/capturer', ['order_id' => 'ORDER-ETA05'])->getStatusCode());
        self::assertSame(20_000_000, $this->page()['creditMicrousd']);

        // 4. Léa rejoint sa cohorte : membre, rien dépensé.
        $this->rejoindre($this->ecole, $this->lea);
        $eleves = $this->page()['eleves'];
        self::assertSame([['userId' => $this->lea['id'], 'displayName' => 'Léa', 'cohortes' => ['BTS SIO 2026'],
                           'membre' => true, 'moisMicrousd' => 0, 'totalMicrousd' => 0]], $eleves);

        // 5. Son appel : payé par son école, 4 000 µUSD × 1,065 ; rien sur le compte de Léa.
        $appel = $this->appelTwin6($this->lea);
        self::assertSame(200, $appel->getStatusCode(), (string) $appel->getBody());
        self::assertSame(4260, self::json($appel)['cout_microusd']);
        $page = $this->page();
        self::assertSame(20_000_000 - 4260, $page['creditMicrousd']);
        self::assertSame([4260, 4260, 4260], [$page['eleves'][0]['moisMicrousd'], $page['eleves'][0]['totalMicrousd'],
            $page['depenseMoisMicrousd']]);
        self::assertSame(['solde_microusd' => 0, 'evenements' => []], self::json($this->as_($this->lea, 'GET', '/api/twin9/credit')));
        $stmt = self::$pdo->prepare('SELECT COUNT(*) FROM twin9_credit_events WHERE user_id = ? AND beneficiaire_id = ?');
        $stmt->execute([$this->ecole['id'], $this->lea['id']]);
        self::assertSame(2, (int) $stmt->fetchColumn(), 'la réserve et sa réconciliation nomment Léa');
    }

    #[TestDox('UC-ETA-05-F02 — A1 : surtaxe hors bornes (3,49 ; 10,01 ; 3,555 ; une chaîne) ou plafond invalide → 422 par champ, rien n’est changé')]
    public function testF02BoundsAreChecked(): void
    {
        foreach ([['surtaxePct' => 3.49], ['surtaxePct' => 10.01], ['surtaxePct' => 3.555], ['surtaxePct' => '5'],
                  ['plafondEleveUsd' => -1], ['plafondEleveUsd' => 1.234], ['plafondEleveUsd' => 100000.01]] as $corps) {
            $r = $this->as_($this->ecole, 'PUT', '/api/etablissement/ecole', $corps);
            self::assertSame(422, $r->getStatusCode(), json_encode($corps));
            self::assertSame([array_key_first($corps)], array_keys(self::json($r)['fields']));
        }
        self::assertSame([3.5, 0], [$this->page()['surtaxePct'], $this->page()['plafondEleveMicrousd']]);
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM ecoles')->fetchColumn());
        // a field absent is kept
        $this->as_($this->ecole, 'PUT', '/api/etablissement/ecole', ['plafondEleveUsd' => 5]);
        $r = $this->as_($this->ecole, 'PUT', '/api/etablissement/ecole', ['surtaxePct' => 10]);
        self::assertSame([10, 5_000_000], [self::json($r)['surtaxePct'], self::json($r)['plafondEleveMicrousd']]);
    }

    #[TestDox('UC-ETA-05-F03 — A2 : la clé de l’école, chiffrée, jamais rendue ni journalisée ; les appels de ses élèves partent avec elle, son crédit intact, le plafond compte le prix de la grille ; retirée → 204, puis 404')]
    public function testF03TheSchoolsKey(): void
    {
        $this->as_($this->ecole, 'PUT', '/api/etablissement/ecole', ['plafondEleveUsd' => 1]);
        $put = $this->as_($this->ecole, 'PUT', '/api/etablissement/ecole/cle', ['cle' => '  sk-ant-ecole-fictive-0003  ']);
        self::assertSame(200, $put->getStatusCode(), (string) $put->getBody());
        self::assertSame(['anthropic'], array_column(self::json($put)['cles'], 'fournisseur'));
        foreach ([$put, $this->as_($this->ecole, 'GET', '/api/etablissement/ecole')] as $reponse) {
            self::assertStringNotContainsString('sk-ant-ecole', (string) $reponse->getBody());
        }
        self::assertEquals(['fournisseur' => 'anthropic'], self::lastAudit('ecole_cle_posee')['details']);
        self::assertStringNotContainsString('sk-ant', (string) self::$pdo->query('SELECT GROUP_CONCAT(details) FROM audit_events')->fetchColumn());
        self::assertStringNotContainsString('sk-ant', (string) self::$pdo->query('SELECT encrypted_key FROM ecole_cles')->fetchColumn());

        $this->rejoindre($this->ecole, $this->lea);
        $appel = $this->appelTwin6($this->lea);
        self::assertSame(200, $appel->getStatusCode(), (string) $appel->getBody());
        self::assertSame('sk-ant-ecole-fictive-0003', $this->http->requests[0]['headers']['x-api-key'], 'la clé de l’école');
        self::assertSame(4000, self::json($appel)['cout_microusd'], 'sur sa clé, le prix de la grille');
        self::assertSame([0, 4000], [$this->page()['creditMicrousd'], $this->page()['eleves'][0]['moisMicrousd']]);

        // refused: another provider, an empty key, a key with spaces
        foreach ([['cle' => 'sk-x', 'fournisseur' => 'openai'], ['cle' => '   '], ['cle' => 'sk ant']] as $corps) {
            self::assertSame(422, $this->as_($this->ecole, 'PUT', '/api/etablissement/ecole/cle', $corps)->getStatusCode());
        }
        self::assertSame(204, $this->as_($this->ecole, 'DELETE', '/api/etablissement/ecole/cle/anthropic')->getStatusCode());
        self::assertSame(404, $this->as_($this->ecole, 'DELETE', '/api/etablissement/ecole/cle/anthropic')->getStatusCode());
        self::assertSame([], $this->page()['cles']);
        self::assertEquals(['fournisseur' => 'anthropic'], self::lastAudit('ecole_cle_retiree')['details']);

        // without the master key: 503, nothing written
        TestDb::setEnv('SODIUM_MASTER_KEY', '');
        self::assertSame(503, $this->as_($this->ecole, 'PUT', '/api/etablissement/ecole/cle', ['cle' => 'sk-ant-fictive'])->getStatusCode());
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM ecole_cles')->fetchColumn());
    }

    #[TestDox('UC-ETA-05-F04 — E1 : un compte sans l’habilitation etablissement (un apprenant, même s’il déclare un rôle) → 403 ; un visiteur → 401')]
    public function testF04OnlyASchool(): void
    {
        // a declared role opens nothing (sprint 8, ADR-013 §2 h): the school is the habilitation the administrator grants
        self::$pdo->prepare('INSERT INTO user_declared_roles (user_id, role) VALUES (?, ?)')->execute([$this->lea['id'], 'architecte']);
        foreach ([['GET', '/api/etablissement/ecole', null], ['PUT', '/api/etablissement/ecole', ['surtaxePct' => 5]],
                  ['PUT', '/api/etablissement/ecole/cle', ['cle' => 'sk-ant-fictive']],
                  ['DELETE', '/api/etablissement/ecole/cle/anthropic', null]] as [$methode, $route, $corps]) {
            self::assertSame(403, $this->as_($this->lea, $methode, $route, $corps)->getStatusCode(), $methode . ' ' . $route);
        }
        $this->cookieSid = null;
        self::assertSame(401, $this->request('GET', '/api/etablissement/ecole')->getStatusCode());
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM ecole_cles')->fetchColumn());
    }

    #[TestDox('UC-ETA-05-F05 — A3 : le plafond par élève : 0 par défaut → 402 « plafond », rien débité ; 0,01 $ ne couvre pas la réserve → 402 ; 0,02 $ → l’appel passe, réglé au coût réel')]
    public function testF05TheCapPerLearner(): void
    {
        self::crediter($this->ecole['id'], 5_000_000, 'crédit des tests');
        $this->rejoindre($this->ecole, $this->lea);

        $refus = $this->as_($this->lea, 'POST', '/api/twin6/appel',
            ['model' => 'claude-sonnet-5', 'prompt' => 'Scanne le pôle 1.', 'max_tokens' => 1024]);
        self::assertSame(402, $refus->getStatusCode());
        self::assertSame(['Plafond de votre école atteint pour ce mois', 'plafond', 0],
            [self::json($refus)['error'], self::json($refus)['code'], self::json($refus)['reste_microusd']]);
        self::assertSame([], $this->http->requests, 'rien ne part');

        $this->as_($this->ecole, 'PUT', '/api/etablissement/ecole', ['plafondEleveUsd' => 0.01]);
        self::assertSame(402, $this->as_($this->lea, 'POST', '/api/twin6/appel',
            ['model' => 'claude-sonnet-5', 'prompt' => 'Scanne le pôle 1.', 'max_tokens' => 1024])->getStatusCode(),
            'la réserve (le pire cas : 1 024 jetons de sortie) dépasse 0,01 $');
        $this->as_($this->ecole, 'PUT', '/api/etablissement/ecole', ['plafondEleveUsd' => 0.02]);
        $appel = $this->appelTwin6($this->lea);
        self::assertSame(200, $appel->getStatusCode(), (string) $appel->getBody());
        self::assertSame([5_000_000 - 4140, 4140], [$this->page()['creditMicrousd'], $this->page()['eleves'][0]['moisMicrousd']]);
    }

    #[TestDox('UC-ETA-05-F06 — A4 : élève de deux écoles : sans payeur → 422 « choisissez » ; avec payeur, celle-là paie ; une école dont il n’est pas membre → 422 ; son solde à lui, s’il le choisit')]
    public function testF06ALearnerOfTwoSchools(): void
    {
        $platanes = $this->registerAs('platanes@example.org', 'École des Platanes', ['etablissement']);
        foreach ([$this->ecole, $platanes] as $e) {
            $this->as_($e, 'PUT', '/api/etablissement/ecole', ['plafondEleveUsd' => 5]);
            self::crediter($e['id'], 5_000_000, 'crédit des tests');
        }
        $this->rejoindre($this->ecole, $this->lea);
        $this->rejoindre($platanes, $this->lea, 'Licence');
        self::crediter($this->lea['id'], 1_000_000, 'solde acheté avant');

        $refus = $this->as_($this->lea, 'POST', '/api/twin6/appel',
            ['model' => 'claude-sonnet-5', 'prompt' => 'Scanne le pôle 1.', 'max_tokens' => 1024]);
        self::assertSame(422, $refus->getStatusCode());
        self::assertSame('Choisissez qui paie cette analyse : vous êtes membre de plusieurs écoles', self::json($refus)['error']);

        self::assertSame(200, $this->appelTwin6($this->lea, ['payeur' => $platanes['id']])->getStatusCode());
        self::assertSame([5_000_000, 5_000_000 - 4140], [self::solde($this->ecole['id']), self::solde($platanes['id'])],
            'les Platanes seules');

        $autre = $this->registerAs('autre@example.org', 'École du Port', ['etablissement']);
        $hors = $this->as_($this->lea, 'POST', '/api/twin6/appel',
            ['model' => 'claude-sonnet-5', 'prompt' => 'x', 'payeur' => $autre['id']]);
        self::assertSame([422, 'Cette école ne paie pas pour vous : vous n’êtes membre d’aucune de ses cohortes'],
            [$hors->getStatusCode(), self::json($hors)['error']]);

        self::assertSame(200, $this->appelTwin6($this->lea, ['payeur' => 'personnel'])->getStatusCode());
        self::assertSame(1_000_000 - 4400, self::solde($this->lea['id']), 'son solde, à la contribution des particuliers');
    }
}
