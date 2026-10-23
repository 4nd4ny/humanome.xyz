<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Db;
use Humanome\Llm\LlmRuntime;
use Humanome\Tests\CartographeTestCase;
use Humanome\Tests\LlmFakeHttpClient;
use Humanome\Tests\StoredKeys;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\RunsTwin9Factices;
use Humanome\Tests\UseCases\Support\TwinSupport;
use Humanome\Twin9\CreditService;
use Humanome\Env;
use Humanome\Twin9\Lancement;
use Humanome\Twin9\ProfilPolicy;
use Humanome\Twin9\TarifsAnthropic;
use Humanome\Twin9\Twin9Config;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunInSeparateProcess;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-ADM-05 — Superviser Twin9 : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/administration/UC-ADM-05-superviser-twin9.md
 *
 * L'administrateur règle Twin9 par GET/PUT /api/twin9/admin/config et suit les
 * comptes par GET /api/twin9/admin/comptes ; chaque réglage est vérifié par
 * son EFFET côté apprenant : l'estimation d'un run du serveur et ses profils
 * (moteur factice, ADR-011), l'offre /meta, la facturation de la cartographie
 * ouverte, les packs PayPal. Les étages de l'offre, l'interrupteur, le rythme
 * et le pipeline, que plus rien ne commandait depuis T11, sont partis le
 * 2026-10-20. Amonts simulés. Les tests qui lancent le moteur factice tournent
 * chacun dans un processus à lui.
 */
final class UcAdm05SuperviserTwin9Test extends CartographeTestCase
{
    use RunsTwin9Factices;

    private LlmFakeHttpClient $http;

    /** @var array{id: int, csrf: string, sid: string} */
    private array $admin;

    /** @var array{id: int, csrf: string, sid: string} */
    private array $apprenant;

    protected function setUp(): void
    {
        parent::setUp();
        $pdo = Db::get();
        $pdo->exec('DELETE FROM twin9_protocole_versions');
        $pdo->exec('DELETE FROM twin9_protocole');
        $pdo->exec("DELETE FROM settings WHERE name IN ('twin9_config', 'twin9_referentiel', 'twin9_tarifs')");
        TestDb::setEnv('ANTHROPIC_API_KEY', TwinSupport::PLATFORM_KEY);
        TestDb::setEnv('SODIUM_MASTER_KEY', TwinSupport::MASTER_KEY_HEX);
        TestDb::setEnv('PAYPAL_MODE', 'sandbox');
        TestDb::setEnv('PAYPAL_CLIENT_ID', 'client-fictif');
        TestDb::setEnv('PAYPAL_SECRET', 'secret-fictif');
        $this->http = new LlmFakeHttpClient();
        LlmRuntime::setHttpClient($this->http);

        $this->admin = $this->registerAs('admin@example.org', 'Root Admin', ['admin']);
        $this->apprenant = $this->registerAs('lea@example.org', 'Léa', ['apprenant']);
    }

    protected function tearDown(): void
    {
        LlmRuntime::setHttpClient(null);
        parent::tearDown();
    }

    private function config(array $partial): ResponseInterface
    {
        return $this->as_($this->admin, 'PUT', '/api/twin9/admin/config', $partial);
    }

    /** Le coût estimé, en dollars, d'un run de deux journées et de sa fusion sans évaluation passée (T10). */
    private static function estimation(float $marge): float
    {
        return round(Lancement::REFERENCE_MICROUSD * 7 * $marge * 3 / 1_000_000, 6);
    }

    #[TestDox('UC-ADM-05-F09 — nominal : l’admin lit la config (prix catalogue + contributions), change les contributions Twin9 et Twin6 → l’estimation d’un run Twin9, les prix Twin6 de /meta et le coût réel de la cartographie ouverte suivent')]
    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testF09ContributionChangeReachesLearners(): void
    {
        $this->moteurFactice();
        $config = self::json($this->as_($this->admin, 'GET', '/api/twin9/admin/config'));
        self::assertSame(1.2, $config['marge']);
        self::assertSame([2, 10], $config['modeles']['claude-sonnet-5']['prix_usd_mtok'], 'prix catalogue visibles de l’admin seul');
        $profil = $this->profilDirect($this->apprenant);
        // un crédit large : il admet toutes les journées, et l'estimation les compte toutes
        (new CreditService(Db::get()))->topup($this->apprenant['id'], 1_000_000_000, 'ORDER-ADM-05');
        self::assertSame(self::estimation(1.2), $this->apercu($this->apprenant, $profil)['estimation']['cout_usd']);

        $maj = self::json($this->config(['marge' => 1.5, 'marge_twin6' => 1.25]));
        self::assertSame([1.5, 1.25], [$maj['marge'], $maj['marge_twin6']]);

        // Étape 6 : un run Twin9 s'estime à la nouvelle contribution (ses appels se règlent à la contribution
        // du moment : api/tests/Twin9/CoutsTest.php).
        self::assertSame(self::estimation(1.5), $this->apercu($this->apprenant, $profil)['estimation']['cout_usd']);
        $meta = self::json($this->as_($this->apprenant, 'GET', '/api/twin9/meta'));
        self::assertSame([2.5, 12.5], $meta['modeles_twin6']['claude-sonnet-5']);
        self::assertArrayNotHasKey('marge', $meta);
        self::assertArrayNotHasKey('modeles', $meta, 'l’offre Twin9 a quitté /meta avec le moteur du navigateur (T11)');

        // La cartographie ouverte Twin6 est facturée au nouveau taux marge_twin6.
        TwinSupport::queueAnthropic($this->http, '{"poleNum":1}', 1000, 200);
        $twin6 = $this->as_($this->apprenant, 'POST', '/api/twin6/appel', ['model' => 'claude-sonnet-5', 'prompt' => 'Scanne le pôle 1.', 'max_tokens' => 1024]);
        self::assertSame(200, $twin6->getStatusCode(), (string) $twin6->getBody());
        self::assertSame(5000, self::json($twin6)['cout_microusd'], '(1000×2 + 200×10) × 1,25 : Sonnet 5 à 2 / 10');
        self::assertSame(1_000_000_000 - 5000, (new CreditService(Db::get()))->balance($this->apprenant['id']));
    }

    #[TestDox('UC-ADM-05-F10 — A1 : la promotion « Twin9 avec sa clé » a disparu avec la voie personnelle (ADR-013) → l’administrateur ne peut plus l’ouvrir (422, clé inconnue) ; un profil à clé personnelle est refusé à l’enregistrement, même avec une clé gardée, et un profil enregistré avant est refusé à l’aperçu et au lancement, avec un message clair')]
    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testF10PromoWindow(): void
    {
        $this->moteurFactice();
        StoredKeys::seed(Db::get(), $this->apprenant['id'], 'anthropic', 'sk-ant-perso-fictive');
        $refuse = $this->creerProfil($this->apprenant, 'Ma clé', ['cle' => 'personnelle']);
        self::assertSame(422, $refuse->getStatusCode());
        self::assertSame(ProfilPolicy::CLE_PERSONNELLE_REFUSEE, self::json($refuse)['error']);

        $promo = $this->config(['twin9_cle_perso_ouverte' => true]);
        self::assertSame(422, $promo->getStatusCode());
        self::assertSame('Clé de configuration inconnue : twin9_cle_perso_ouverte', self::json($promo)['error']);
        self::assertArrayNotHasKey('twin9_cle_perso_ouverte', self::json($this->as_($this->admin, 'GET', '/api/twin9/admin/config')));
        self::assertArrayNotHasKey('cle_perso_ouverte', self::json($this->as_($this->apprenant, 'GET', '/api/twin9/configuration')));

        $ancien = $this->profilAncien($this->apprenant, 'Ma clé', ['cle' => 'personnelle']);
        foreach (['/api/twin9/runs/apercu' => $this->lancement($ancien), '/api/twin9/runs' => $this->lancement($ancien)] as $route => $corps) {
            $r = $this->as_($this->apprenant, 'POST', $route, $corps);
            self::assertSame(422, $r->getStatusCode(), $route);
            self::assertSame(ProfilPolicy::CLE_PERSONNELLE_REFUSEE, self::json($r)['error'], $route);
        }
        self::assertSame([], self::json($this->as_($this->apprenant, 'GET', '/api/twin9/runs'))['runs']);

        // un profil à la clé de l'instance, lui, s'estime toujours avec contribution
        (new CreditService(Db::get()))->topup($this->apprenant['id'], 1_000_000_000, 'ORDER-ADM-05-PROMO');
        $instance = $this->profilDirect($this->apprenant, 'Instance');
        self::assertSame(self::estimation(1.2), $this->apercu($this->apprenant, $instance)['estimation']['cout_usd']);
    }

    #[TestDox('UC-ADM-05-F11 — A2 : grille de packs remplacée → offre /meta et montant de l’ordre PayPal d’une école suivent ; limite figée : un pack est désigné par sa POSITION')]
    public function testF11PacksDriveTheOffer(): void
    {
        // seule une école achète (ADR-013 §2 e)
        $ecole = $this->registerAs('ecole@example.org', 'École fictive', ['etablissement']);
        $this->config(['packs' => [['montant_usd' => 15, 'libelle' => 'Pack essai — 15 $'], ['montant_usd' => 500, 'libelle' => 'Pack établissement — 500 $']]]);
        self::assertSame([15, 500], array_column(self::json($this->as_($ecole, 'GET', '/api/twin9/meta'))['packs'], 'montant_usd'));

        TwinSupport::queuePaypalToken($this->http);
        TwinSupport::queuePaypalOrderCreated($this->http, 'ORDER-500');
        self::assertSame(200, $this->as_($ecole, 'POST', '/api/twin9/credit/paypal/creer', ['pack_index' => 1])->getStatusCode());
        self::assertSame('500.00', json_decode((string) $this->http->requests[1]['body'], true)['purchase_units'][0]['amount']['value']);
        self::assertSame(422, $this->as_($ecole, 'POST', '/api/twin9/credit/paypal/creer', ['pack_index' => 2])->getStatusCode());

        // LIMITE figée : l'ordre ne porte que pack_index. Une page chargée avec
        // l'ancienne grille (index 0 = 10 $) crée désormais un ordre de 15 $.
        TwinSupport::queuePaypalToken($this->http);
        TwinSupport::queuePaypalOrderCreated($this->http, 'ORDER-15');
        self::assertSame(200, $this->as_($ecole, 'POST', '/api/twin9/credit/paypal/creer', ['pack_index' => 0])->getStatusCode());
        self::assertSame('15.00', json_decode((string) $this->http->requests[3]['body'], true)['purchase_units'][0]['amount']['value']);
        self::assertSame(10, Twin9Config::defaults()['packs'][0]['montant_usd']);
    }

    #[TestDox('UC-ADM-05-F12 — A3 : un modèle retiré de l’offre refuse les profils qui le nomment (422), sur tout étage ; un modèle de l’offre sert à tous les étages d’un profil, qui s’estime et part ; un modèle ne porte que ses prix (2026-10-20)')]
    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testF12ModelOffer(): void
    {
        $this->moteurFactice();
        (new CreditService(Db::get()))->topup($this->apprenant['id'], 1_000_000_000, 'ORDER-ADM-05-B');
        $this->config(['modeles' => ['claude-haiku-5-5' => ['prix_usd_mtok' => [0.1, 0.5]]]]);
        // Le profil v9.8 nomme Sonnet 5.5 à l'étage profond : plus de prix, refusé.
        $sonnet = $this->creerProfil($this->apprenant, 'v9.8');
        self::assertSame(422, $sonnet->getStatusCode());
        self::assertSame('Profil refusé — claude-sonnet-5-5 : aucun prix pour ce modèle sur cette instance', self::json($sonnet)['error']);
        // Haiku 5.5 à tous les étages du profil, profond compris : admis, estimé, lancé.
        $etages = json_decode((string) json_encode(\Humanome\Twin9\ProfilRepository::v98()->etages));
        $etages->profond->modele = 'claude-haiku-5-5';
        $haiku = $this->profilDirect($this->apprenant, 'Haiku', ['etages' => $etages]);
        $this->apercu($this->apprenant, $haiku);
        self::assertSame(201, $this->as_($this->apprenant, 'POST', '/api/twin9/runs', $this->lancement($haiku))->getStatusCode());

        // Les « étages » d'un modèle de l'offre sont partis : envoyés, ils sont refusés.
        $etagesOffre = $this->config(['modeles' => ['claude-haiku-5-5' => ['prix_usd_mtok' => [0.1, 0.5], 'etages' => ['taggers']]]]);
        self::assertSame(422, $etagesOffre->getStatusCode());
        self::assertSame('Modèle claude-haiku-5-5 : clé inconnue etages', self::json($etagesOffre)['error']);
    }

    #[TestDox('UC-ADM-05-F13 — nominal (comptes) : soldes et cumuls des seuls comptes ayant une activité, dernière activité d’abord')]
    public function testF13AccountsTable(): void
    {
        $ecole = $this->registerAs('ecole@example.org', 'École fictive', ['etablissement']);
        $credits = new CreditService(Db::get());
        $credits->topup($ecole['id'], 200_000_000, 'ORDER-ECOLE', 'Recharge PayPal');
        $credits->debit($ecole['id'], 1_000_000, 'tagger/1-tag-pole (réserve)', 'claude-sonnet-5');
        $credits->topup($this->apprenant['id'], 10_000_000, 'ORDER-LEA', 'Recharge PayPal');
        self::$pdo->exec("UPDATE twin9_credit_events SET created_at = '2026-07-01 09:00:00' WHERE user_id = " . $ecole['id']);

        $comptes = self::json($this->as_($this->admin, 'GET', '/api/twin9/admin/comptes'))['comptes'];
        self::assertSame(['lea@example.org', 'ecole@example.org'], array_column($comptes, 'email'));
        self::assertSame([199_000_000, 200_000_000, 1_000_000], [$comptes[1]['solde_microusd'], $comptes[1]['recharges_microusd'], $comptes[1]['consomme_microusd']]);
        self::assertNotContains('admin@example.org', array_column($comptes, 'email'), 'sans activité : absent');
    }

    #[TestDox('UC-ADM-05-F14 — E1 : supervision réservée à l’admin — visiteur 401 ; apprenant, promptologue, établissement 403 ; la configuration est inchangée')]
    public function testF14AdminOnly(): void
    {
        $promptologue = $this->registerAs('prompto@example.org', 'Prompto', ['promptologue']);
        $ecole = $this->registerAs('ecole@example.org', 'École', ['etablissement']);
        $routes = [['GET', '/api/twin9/admin/config', null], ['PUT', '/api/twin9/admin/config', ['marge' => 4.0]], ['GET', '/api/twin9/admin/comptes', null]];
        foreach ($routes as [$method, $path, $body]) {
            $this->cookieSid = null;
            self::assertSame(401, $this->request($method, $path, $body)->getStatusCode(), $path);
            foreach ([$this->apprenant, $promptologue, $ecole] as $user) {
                self::assertSame(403, $this->as_($user, $method, $path, $body)->getStatusCode(), $path);
            }
        }
        self::assertSame(1.2, self::json($this->as_($this->admin, 'GET', '/api/twin9/admin/config'))['marge']);
    }

    #[TestDox('UC-ADM-05-F15 — E2 : corps scalaire → 400 ; liste JSON → 422 (clé « 0 ») ou 200 si vide ; clé inconnue ou valeur hors bornes → 422 avec message ; rien n’est modifié')]
    public function testF15InvalidUpdates(): void
    {
        $avant = self::json($this->as_($this->admin, 'GET', '/api/twin9/admin/config'));
        $raw = TwinSupport::rawRequest('PUT', '/api/twin9/admin/config', '"marge=2"', $this->admin['sid'], $this->admin['csrf']);
        self::assertSame(['error' => 'Corps JSON invalide : objet attendu'], self::json($raw));
        self::assertSame(400, $raw->getStatusCode());

        // Un tableau JSON est traité comme un objet : [1] → clé « 0 » inconnue ; [] → rien à changer (200).
        $liste = TwinSupport::rawRequest('PUT', '/api/twin9/admin/config', '[1]', $this->admin['sid'], $this->admin['csrf']);
        self::assertSame(422, $liste->getStatusCode());
        self::assertSame(['error' => 'Clé de configuration inconnue : 0'], self::json($liste));
        $vide = TwinSupport::rawRequest('PUT', '/api/twin9/admin/config', '[]', $this->admin['sid'], $this->admin['csrf']);
        self::assertSame(200, $vide->getStatusCode());

        foreach ([
            [['surtaxe' => 1.3], 'Clé de configuration inconnue : surtaxe'],
            [['marge' => 0.8], 'Marge hors bornes (entre 1 et 5)'],
            [['marge_twin6' => 'dix'], 'Marge Twin6 invalide : nombre attendu'],
            [['packs' => [['montant_usd' => 0, 'libelle' => 'gratuit']]], 'Pack hors bornes : montant entre 1 et 100 USD'],
            [['modeles' => ['m' => ['prix_usd_mtok' => [1, 5], 'etages' => ['grenier']]]], 'Modèle m : clé inconnue etages'],
            [['appels_par_minute' => 1000], 'Clé de configuration inconnue : appels_par_minute'],
        ] as [$partial, $message]) {
            $response = $this->config($partial);
            self::assertSame(422, $response->getStatusCode(), $message);
            self::assertSame($message, self::json($response)['error']);
        }
        $apres = self::json($this->as_($this->admin, 'GET', '/api/twin9/admin/config'));
        self::assertSame([1.2, 1.1], [$apres['marge'], $apres['marge_twin6']]);
        // Configuration ENTIÈRE inchangée (packs, modèles compris) ; relue de la colonne JSON : assertEquals.
        self::assertEquals($avant, $apres);
    }

    #[TestDox('UC-ADM-05-F17 — E5 : session admin valide mais jeton CSRF absent ou faux → 403, configuration inchangée')]
    public function testF17CsrfTokenIsRequired(): void
    {
        $avant = self::json($this->as_($this->admin, 'GET', '/api/twin9/admin/config'));
        foreach ([[], ['X-CSRF-Token' => 'jeton-faux']] as $entetes) {
            $this->cookieSid = $this->admin['sid'];
            $response = $this->request('PUT', '/api/twin9/admin/config', ['marge' => 4.0], $entetes);
            self::assertSame(403, $response->getStatusCode());
            self::assertSame(['error' => 'Jeton CSRF absent ou invalide'], self::json($response));
        }
        self::assertEquals($avant, self::json($this->as_($this->admin, 'GET', '/api/twin9/admin/config')));
    }

    #[TestDox('UC-ADM-05-F16 — cause de l’anomalie du formulaire : une config relue après enregistrement a ses clés réordonnées par MySQL')]
    public function testF16StoredConfigComesBackWithReorderedKeys(): void
    {
        $this->config(['marge' => 1.25]);
        $relue = self::json($this->as_($this->admin, 'GET', '/api/twin9/admin/config'));
        self::assertSame(['libelle', 'montant_usd'], array_keys($relue['packs'][0]));
        self::assertSame(['palier_long', 'prix_usd_mtok'], array_keys($relue['modeles']['claude-haiku-5-5']));
        self::assertSame(['montant_usd', 'libelle'], array_keys(Twin9Config::defaults()['packs'][0]), 'ordre des défauts, avant tout enregistrement');
    }

    /** Le déclencheur externe : un tick d'une seconde, jeton des migrations. */
    private function tick(): ResponseInterface
    {
        $this->cookieSid = null;

        return $this->request('POST', '/api/admin/worker-tick', ['budgetSeconds' => 1],
            ['X-Migrate-Token' => Env::get('MIGRATE_TOKEN')]);
    }

    #[TestDox('UC-ADM-05-F19 — RG9 : le déclencheur relève les prix d’Anthropic une fois par jour — la grille stockée de juillet (Sonnet 5 à 3 / 15) passe à 2 / 10, l’apprenant le voit sur /meta, l’administrateur lit le relevé ; le tick suivant du jour ne relit rien')]
    public function testF19DailyReadingFixesTheGrid(): void
    {
        self::assertSame(200, $this->config(['modeles' => [
            'claude-sonnet-5' => ['prix_usd_mtok' => [3, 15]],
            'claude-haiku-5-5' => ['prix_usd_mtok' => [0.1, 0.5],
                'palier_long' => ['au_dela_de' => 100000, 'prix_usd_mtok' => [0.5, 2.5]]],
        ]])->getStatusCode());
        self::assertEquals([3.3, 16.5], self::json($this->as_($this->apprenant, 'GET', '/api/twin9/meta'))['modeles_twin6']['claude-sonnet-5']);
        self::assertNull(self::json($this->as_($this->admin, 'GET', '/api/twin9/admin/config'))['releve_tarifs'], 'jamais relevé');

        $this->http->queueResponse(['status' => 200,
            'body' => (string) file_get_contents(\dirname(__DIR__, 2) . '/fixtures/tarifs-anthropic.md')]);
        $tick = $this->tick();

        self::assertSame(200, $tick->getStatusCode(), (string) $tick->getBody());
        self::assertSame('ok', self::json($tick)['tarifs']);
        self::assertSame([['GET', TarifsAnthropic::SOURCE]], array_map(
            static fn (array $r): array => [$r['method'], $r['url']], $this->http->requests));
        self::assertEquals([2.2, 11], self::json($this->as_($this->apprenant, 'GET', '/api/twin9/meta'))['modeles_twin6']['claude-sonnet-5'],
            'l’apprenant paie 2 / 10, contribution comprise');
        $admin = self::json($this->as_($this->admin, 'GET', '/api/twin9/admin/config'));
        self::assertEquals([2, 10], $admin['modeles']['claude-sonnet-5']['prix_usd_mtok']);
        self::assertSame('ok', $admin['releve_tarifs']['statut']);
        self::assertSame(gmdate('Y-m-d'), $admin['releve_tarifs']['jour']);
        self::assertSame(['claude-sonnet-5'], array_column($admin['releve_tarifs']['changements'], 'modele'));
        self::assertSame([], $admin['releve_tarifs']['absents']);
        self::assertSame(403, $this->as_($this->apprenant, 'GET', '/api/twin9/admin/config')->getStatusCode());

        $again = $this->tick();
        self::assertSame(200, $again->getStatusCode());
        self::assertArrayNotHasKey('tarifs', self::json($again), 'relevé aujourd’hui : rien à relire');
        self::assertCount(1, $this->http->requests);
    }

    #[TestDox('UC-ADM-05-F20 — RG9 : une page des prix illisible ne change rien — le tick répond, la grille garde ses prix, l’administrateur lit l’échec et sa raison ; sans clé de la plateforme, aucun relevé')]
    public function testF20UnreadablePageChangesNothing(): void
    {
        $avant = self::json($this->as_($this->admin, 'GET', '/api/twin9/admin/config'))['modeles'];
        $this->http->queueResponse(['status' => 200, 'body' => "# Pricing\n\nNo table today.\n"]);
        $tick = $this->tick();

        self::assertSame(200, $tick->getStatusCode(), (string) $tick->getBody());
        self::assertSame('echec', self::json($tick)['tarifs']);
        $admin = self::json($this->as_($this->admin, 'GET', '/api/twin9/admin/config'));
        self::assertSame($avant, $admin['modeles']);
        self::assertSame('echec', $admin['releve_tarifs']['statut']);
        self::assertSame('page des prix illisible : section « Model pricing » introuvable', $admin['releve_tarifs']['erreur']);
        self::assertArrayNotHasKey('jour', $admin['releve_tarifs'], 'aucun relevé réussi');

        // Sans la clé de la plateforme, l'instance ne facture rien : rien à relever.
        Db::get()->exec("DELETE FROM settings WHERE name = 'twin9_tarifs'");
        TestDb::setEnv('ANTHROPIC_API_KEY', '');
        self::assertArrayNotHasKey('tarifs', self::json($this->tick()));
        self::assertCount(1, $this->http->requests);
    }
}
