<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\Llm\MultiHttpClient;
use Humanome\MigrationRunner;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\TestDb;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\DirectCalls;
use Humanome\Twin9\EngineLoader;
use Humanome\Twin9\Fournisseurs\Fournisseurs;
use Humanome\Twin9\ProfilRepository;
use Humanome\Twin9\RunCosts;
use Humanome\Twin9\RunRepository;
use Humanome\Twin9\Twin9Config;
use Humanome\Worker\Tick;
use Humanome\Worker\Twin9Lots;
use PDO;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunTestsInSeparateProcesses;
use PHPUnit\Framework\TestCase;
use stdClass;

/**
 * Twin9's mixed lane (P1-5, ADR-012), with the fake engine and simulated
 * providers: Anthropic's calls by batches, another provider's directly, in
 * the same run and the same slice — each call its route, each host its key;
 * a missing third-party key or a third party's cap never holds the batches
 * back; a third party's 400 stops the run once its calls in flight are back
 * (deferred stop); a third party's call leaves only if it may end within the
 * slice, and its cuts are counted; the instance's key rests from a provider
 * after its 429, for every run; a run held thirty minutes by a third party's
 * cap stops, its reserve given back; the guard of the providers is read again
 * at each slice. Each test runs in a process of its own: the real engine may
 * be loaded in the others. Every key, model and price is invented.
 */
#[RunTestsInSeparateProcesses]
#[PreserveGlobalState(false)]
final class VoieMixteTest extends TestCase
{
    private const GABARITS = [
        'factice/lecture' => "[appel:{\$APPEL}] Lis la journée {\$JOUR} en lecteur {\$LECTEUR} :\n{\$TEXTE}",
        'factice/etape' => "[appel:{\$APPEL}] Étape {\$ETAPE} de {\$JOUR}, après : {\$PRECEDENT}",
        'factice/fusion' => "[appel:{\$APPEL}] Fusionne :\n{\$JOURS}",
    ];

    private const PORTFOLIO = "## J1\nPremier jour.\n## J2\nDeuxième jour.\n## J3\nTroisième jour.\n";

    /** The instance's keys, invented: each host must get its own, never another's. */
    private const CLE_ANTHROPIC = 'sk-ant-instance-factice-mixte';

    private const CLE_OPENAI = 'cle-openai-factice-mixte';

    /** The third party's model, at an invented price; its longest call a second. */
    private const MODELE = 'modele-fictif-1';

    private const CREDIT = 1_000_000_000;

    private PDO $pdo;

    private int $user;

    private Twin9Config $config;

    protected function setUp(): void
    {
        $this->pdo = TestDb::fresh();
        (new MigrationRunner($this->pdo, MigrationRunner::defaultMigrationsDir()))->run();
        TestDb::setEnv('TWIN_V9_DIR', \dirname(__DIR__) . '/fixtures/twin9-factice');
        self::assertTrue(EngineLoader::load());
        TestDb::setEnv('ANTHROPIC_API_KEY', self::CLE_ANTHROPIC);
        TestDb::setEnv('OPENAI_API_KEY', self::CLE_OPENAI);
        TestDb::setEnv('WORKER_TICK_BUDGET_SECONDS', '');
        $this->config = new Twin9Config(new SettingsRepository($this->pdo));
        $this->config->update([
            'modeles' => $this->config->modeles() + ['openai:' . self::MODELE => self::entree()],
            'twin9_fournisseurs_ouverts' => ['anthropic', 'openai'],
        ]);
        $this->user = $this->utilisateur('mixte@example.test');
    }

    protected function tearDown(): void
    {
        TestDb::restoreEnv();
    }

    /**
     * A run whose reader « a » is Anthropic's and reader « b » OpenAI's,
     * by batches: each slice's batch holds Anthropic's calls only, and
     * leaves before the run's direct calls; OpenAI gets the reader b's calls
     * with its own key; while a batch is at Anthropic, the run is opened all
     * the same; it goes to its end, Anthropic's calls at half price, OpenAI's
     * at its full price; the journal, the counters and the execution say
     * each call's provider and lane.
     */
    public function testAMixedRunSendsAnthropicByBatchesAndTheOtherProviderDirectly(): void
    {
        $id = $this->nouveauRun();
        $lots = new FakeBatchApi(static fn (array $r): array => FakeBatchApi::message('vu ' . FakeBatchApi::appel($r)),
            regards: 1);
        $http = self::openai();

        $c = $this->tick($lots, $http);
        self::assertSame([1, 1, 6], [$c['twin9Runs'], $c['twin9Lots'], $c['twin9Appels']]);
        self::assertSame(['journees/J1/tags_a_P1.json', 'journees/J2/tags_a_P1.json', 'journees/J3/tags_a_P1.json'],
            array_map([FakeBatchApi::class, 'appel'], $lots->requetes), 'le lot ne porte que les appels d’Anthropic');
        self::assertSame(['journees/J1/tags_b_P1.json', 'journees/J2/tags_b_P1.json', 'journees/J3/tags_b_P1.json'],
            array_map([FakeMultiHttpClient::class, 'appel'], $http->requests), 'OpenAI reçoit ceux du lecteur b');
        foreach ($http->requests as $r) {
            self::assertStringStartsWith(Fournisseurs::REGISTRE['openai']['url'], $r['url']);
            self::assertSame('Bearer ' . self::CLE_OPENAI, $r['headers']['authorization'], 'sa clé, jamais une autre');
            self::assertStringNotContainsString(self::CLE_ANTHROPIC, (string) json_encode($r));
            self::assertSame(self::MODELE, $r['body']['model']);
        }
        $premier = $http->requests[0]['at'];
        self::assertLessThan($premier, $lots->lots['msgbatch_0001']['cree'], 'le lot part en tête de tranche');
        $journal = $this->pdo->query('SELECT appel, fournisseur, statut, custom_id IS NOT NULL AS lot FROM twin9_appels
                                       ORDER BY appel')->fetchAll(PDO::FETCH_ASSOC);
        foreach ($journal as $ligne) {
            $b = str_contains((string) $ligne['appel'], 'tags_b');
            self::assertSame([$b ? 'openai' : 'anthropic', $b ? 'repondu' : 'envoye', $b ? 0 : 1],
                [$ligne['fournisseur'], $ligne['statut'], (int) $ligne['lot']], (string) $ligne['appel']);
        }
        self::assertSame(Twin9Lots::EN_COURS, $this->attente($id));

        $c = $this->tick($lots, $http);
        self::assertSame([1, 0], [$c['twin9Runs'], $c['twin9Lots']],
            'son lot chez Anthropic, le run est ouvert quand même : il a une route directe');
        self::assertGreaterThanOrEqual(1, $c['twin9Passes']);

        $this->jusquAuBout($lots, $http);
        $runs = new RunRepository($this->pdo);
        self::assertSame('termine', $runs->statut($id));
        self::assertSame(3, \count($http->requests), 'OpenAI n’a reçu que les appels du lecteur b');
        self::assertCount(10, $lots->requetes);
        foreach ($lots->requetes as $r) {
            self::assertStringNotContainsString('tags_b', FakeBatchApi::appel($r));
        }
        $haiku = 'claude-haiku-5-5';
        $sonnet = 'claude-sonnet-5-5';
        $attendu = 3 * (int) $this->config->coutMicrousd($haiku, 100, 20, parLots: true)
            + 3 * (int) $this->config->coutMicrousd($haiku, 100, 20, parLots: true)
            + 4 * (int) $this->config->coutMicrousd($sonnet, 100, 20, parLots: true)
            + 3 * (int) $this->config->coutMicrousd('openai:' . self::MODELE, 100, 20);
        $compteurs = $runs->compteursDe($id);
        self::assertSame($attendu, $compteurs['cout_microusd'], 'Anthropic à moitié prix, OpenAI au plein tarif');
        self::assertSame(self::CREDIT - $attendu, (new CreditService($this->pdo))->balance($this->user));
        self::assertSame([10, 3], [$compteurs['par_fournisseur']['anthropic']['appels'],
                                   $compteurs['par_fournisseur']['openai']['appels']]);
        self::assertSame(3 * (int) $this->config->coutMicrousd('openai:' . self::MODELE, 100, 20),
            $compteurs['par_fournisseur']['openai']['cout_microusd']);
        $execution = $runs->execution($id);
        self::assertSame([3, 10], [$execution->par_voie->directe->appels, $execution->par_voie->lots->appels]);
        self::assertSame([10, 3], [$execution->par_fournisseur->anthropic->appels, $execution->par_fournisseur->openai->appels]);
        self::assertSame(3, $execution->par_modele->{'openai:' . self::MODELE}->appels, 'sous sa clé de prix');
        $modeles = $this->pdo->query('SELECT DISTINCT model FROM twin9_credit_events WHERE model LIKE "%:%"')
            ->fetchAll(PDO::FETCH_COLUMN);
        self::assertSame(['openai:' . self::MODELE], $modeles, 'le grand livre sous la clé de prix');
        self::assertSame([], $lots->restants());

        // its evaluation: the lane it went by, and the share of Anthropic in what its days and its merge cost
        $reglages = json_decode((string) $this->pdo->query('SELECT reglages FROM twin9_evaluations WHERE run_id = ' . $id)
            ->fetchColumn(), true, 64, JSON_THROW_ON_ERROR);
        $openai = 3 * (int) $this->config->coutMicrousd('openai:' . self::MODELE, 100, 20);
        $journees = $attendu - (int) $this->config->coutMicrousd($sonnet, 100, 20, parLots: true);
        self::assertSame('mixte', $reglages['voie']);
        self::assertEqualsWithDelta(['journee' => round(($journees - $openai) / $journees, 4), 'fusion' => 1.0],
            $reglages['part_anthropique'], 0.00001);
    }

    /**
     * Without OpenAI's key, the batch leaves all the same and OpenAI gets
     * nothing: its page says both. The key back, the run goes to its end.
     */
    public function testAMissingThirdPartyKeyNeverHoldsTheBatchBack(): void
    {
        $id = $this->nouveauRun();
        TestDb::setEnv('OPENAI_API_KEY', '');
        $lots = new FakeBatchApi(static fn (array $r): array => FakeBatchApi::message('vu ' . FakeBatchApi::appel($r)),
            regards: 1);
        $http = self::openai();

        $c = $this->tick($lots, $http);
        self::assertSame(1, $c['twin9Lots'], 'le lot d’Anthropic part');
        self::assertCount(3, $lots->requetes);
        self::assertSame([], $http->requests, 'rien chez OpenAI sans sa clé');
        // the same words as for a provider closed: its owner never learns which keys the instance holds
        self::assertSame(Twin9Lots::EN_COURS . ' ; fournisseur OpenAI indisponible sur cette instance', $this->attente($id));
        self::assertSame('en_cours', (new RunRepository($this->pdo))->statut($id));

        TestDb::setEnv('OPENAI_API_KEY', self::CLE_OPENAI);
        $this->jusquAuBout($lots, $http);
        self::assertSame('termine', (new RunRepository($this->pdo))->statut($id));
        self::assertCount(3, $http->requests);
    }

    /**
     * A third party's spending cap waits (no attempt spent), the run's page
     * says it, and the next batch still leaves; held thirty minutes on it,
     * the run stops — once its calls in flight are back —, what its direct
     * calls hold given back.
     */
    public function testAThirdPartysCapNeverHoldsTheBatchBackAndStopsTheRunAfterThirtyMinutes(): void
    {
        $id = $this->nouveauRun();
        $lots = new FakeBatchApi(static fn (array $r): array => FakeBatchApi::message('vu ' . FakeBatchApi::appel($r)),
            regards: 0);
        $http = self::openai(static fn (array $r): ?array => FakeMultiHttpClient::appel($r) === 'journees/J1/tags_b_P1.json'
            ? ['status' => 402, 'body' => '{"error":{"message":"texte-du-fournisseur-canari"}}'] : null);

        $this->tick($lots, $http);
        $etat = $this->appel($id, 'journees/J1/tags_b_P1.json');
        self::assertSame(['attente', 0], [$etat['statut'], (int) $etat['tentatives']], 'un plafond ne coûte pas de tentative');
        self::assertNotNull($etat['plafond_depuis']);
        self::assertStringContainsString('plafond de dépense atteint chez OpenAI', (string) $this->attente($id));

        $c = $this->tick($lots, $http);
        self::assertSame(1, $c['twin9Lots'], 'le lot suivant part, OpenAI plafonné ou non');
        self::assertSame(['journees/J2/1-greffier.md', 'journees/J3/1-greffier.md'],
            array_map([FakeBatchApi::class, 'appel'], \array_slice($lots->requetes, 3)));

        // thirty minutes on the cap: at its next try, the run stops
        $this->pdo->prepare('UPDATE twin9_appels SET plafond_depuis = NOW(3) - INTERVAL 31 MINUTE, reprise_at = NOW(3)
                              WHERE run_id = ? AND appel = ?')->execute([$id, 'journees/J1/tags_b_P1.json']);
        $c = $this->tick($lots, $http);
        $runs = new RunRepository($this->pdo);
        self::assertSame('echoue', $runs->statut($id));
        self::assertSame(1, $c['twin9Echoues']);
        self::assertSame('plafond de dépense atteint chez OpenAI depuis plus de 30 minutes : le run s’arrête, sa réserve '
            . 'est rendue', $this->attente($id));
        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM twin9_appels WHERE lot_id IS NULL
                                                         AND reserve_microusd IS NOT NULL')->fetchColumn(),
            'ce que tenaient ses appels directs est rendu');
        self::assertStringNotContainsString('canari', (string) json_encode($this->pdo->query(
            'SELECT panne, stop_reason FROM twin9_appels')->fetchAll()) . $this->attente($id));
    }

    /**
     * OpenAI refuses a call's settings (HTTP 400): the run stops, deferred —
     * its calls in flight come back, written with their cost, nothing more
     * leaves —, with a message the code writes, never the provider's.
     */
    public function testAThirdPartys400StopsTheRunOnceItsCallsInFlightAreBack(): void
    {
        $id = $this->nouveauRun(['/voie' => 'directe']);
        $anthropic = 0;
        $http = new FakeMultiHttpClient(static function (array $r) use (&$anthropic): array {
            $appel = FakeMultiHttpClient::appel($r);
            if (str_starts_with($r['url'], Fournisseurs::REGISTRE['anthropic']['url'])) {
                $anthropic++;

                return ['body' => FakeMultiHttpClient::message('vu ' . $appel)];
            }

            return match ($appel) {
                'journees/J1/tags_b_P1.json' => ['status' => 400,
                                                 'body' => '{"error":{"message":"texte-du-fournisseur-canari"}}'],
                default => ['body' => FakeMultiHttpClient::message('vu ' . $appel, self::MODELE, format: 'chat'),
                            'delai' => 0.4],
            };
        });

        $c = (new Tick($this->pdo, ['budgetSeconds' => 4, 'twin9Sender' => new DirectCalls($http)]))->run();

        $runs = new RunRepository($this->pdo);
        self::assertSame('echoue', $runs->statut($id));
        self::assertSame(1, $c['twin9Echoues']);
        self::assertSame('OpenAI refuse les réglages de l’appel au modèle ' . self::MODELE . ' (HTTP 400) : le run '
            . 's’arrête, à reprendre une fois ses réglages ou ceux de la grille corrigés', $this->attente($id));
        foreach (['journees/J2/tags_b_P1.json', 'journees/J3/tags_b_P1.json'] as $appel) {
            $etat = $this->appel($id, $appel);
            self::assertSame('repondu', $etat['statut'], $appel . ' : revenu, écrit');
            self::assertGreaterThan(0, (int) $etat['cout_microusd'], $appel . ' : avec son coût');
        }
        $refuse = $this->appel($id, 'journees/J1/tags_b_P1.json');
        self::assertSame(['attente', 0], [$refuse['statut'], (int) $refuse['tentatives']], 'à reprendre, sans tentative');
        self::assertSame(['journees/J1/tags_a_P1.json', 'journees/J1/tags_b_P1.json', 'journees/J2/tags_a_P1.json',
                          'journees/J2/tags_b_P1.json', 'journees/J3/tags_a_P1.json', 'journees/J3/tags_b_P1.json'],
            self::trie(array_map([FakeMultiHttpClient::class, 'appel'], $http->requests)),
            'plus rien ne part après le refus : ni greffier, ni nouvelle passe');
        self::assertSame(3, $anthropic);
        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM twin9_appels WHERE reserve_microusd IS NOT NULL')
            ->fetchColumn(), 'ses réserves soldées ou rendues');
        $couts = (int) $this->pdo->query('SELECT SUM(cout_microusd) FROM twin9_appels')->fetchColumn();
        self::assertSame(self::CREDIT - $couts, (new CreditService($this->pdo))->balance($this->user),
            'son propriétaire paie ce que ses appels ont coûté, rien d’autre');
        self::assertStringNotContainsString('canari', (string) json_encode($this->pdo->query(
            'SELECT panne, stop_reason FROM twin9_appels')->fetchAll()) . $this->attente($id));
    }

    /**
     * OpenAI refuses a call's settings while the run's batch, submitted at
     * the head of the same slice, is still at Anthropic: the run stops, and
     * its batch is never cancelled — collected once ended, each answer
     * written with its cost and debited, then deleted.
     */
    public function testAStoppedRunsBatchInFlightIsCollectedNeverCancelled(): void
    {
        $id = $this->nouveauRun();
        $lots = new FakeBatchApi(static fn (array $r): array => FakeBatchApi::message('vu ' . FakeBatchApi::appel($r)),
            regards: 2);
        $http = self::openai(static fn (array $r): ?array => FakeMultiHttpClient::appel($r) === 'journees/J1/tags_b_P1.json'
            ? ['status' => 400, 'body' => '{"error":{"message":"texte-du-fournisseur-canari"}}'] : null);

        $this->tick($lots, $http);
        $runs = new RunRepository($this->pdo);
        self::assertSame('echoue', $runs->statut($id));
        self::assertSame(['msgbatch_0001'], $lots->restants(), 'son lot encore chez Anthropic');

        for ($n = 0; $n < 6 && $lots->restants() !== []; $n++) {
            $this->tick($lots, $http);
        }
        self::assertSame([], $lots->restants(), 'relevé, puis supprimé');
        self::assertNotContains('annuler', $lots->operations('msgbatch_0001'), 'jamais annulé');
        self::assertContains('resultats', $lots->operations('msgbatch_0001'), 'ses résultats lus');
        $this->assertLotRegle($id);
    }

    /**
     * Anthropic has ended the batch of a run stopped meanwhile, every
     * request answered (billed): its answers are read, written with their
     * cost and debited — never cancelled unread, never sent again at the
     * run's resumption.
     */
    public function testAnEndedBatchOfAStoppedRunIsDebitedAndNeverSentAgain(): void
    {
        $id = $this->nouveauRun();
        $lots = new FakeBatchApi(static fn (array $r): array => FakeBatchApi::message('vu ' . FakeBatchApi::appel($r)),
            regards: 0);
        $refus = true;
        $http = self::openai(static function (array $r) use (&$refus): ?array {
            return $refus && FakeMultiHttpClient::appel($r) === 'journees/J1/tags_b_P1.json'
                ? ['status' => 400, 'body' => '{"error":{"message":"texte-du-fournisseur-canari"}}'] : null;
        });

        $this->tick($lots, $http);
        $runs = new RunRepository($this->pdo);
        self::assertSame('echoue', $runs->statut($id));
        $lots->etat(self::CLE_ANTHROPIC, 'msgbatch_0001', INF); // Anthropic ends it meanwhile

        $this->tick($lots, $http);
        self::assertNotContains('annuler', $lots->operations('msgbatch_0001'), 'un lot fini n’est pas annulé');
        self::assertContains('resultats', $lots->operations('msgbatch_0001'), 'ses résultats lus');
        self::assertSame([], $lots->restants());
        $this->assertLotRegle($id);

        // resumed, the grid mended: the batch's answers are read from the journal, never paid again
        $refus = false;
        self::assertTrue($runs->reprendre($id, $this->user));
        $this->jusquAuBout($lots, $http);
        self::assertSame('termine', $runs->statut($id));
        $tagsA = array_filter(array_map([FakeBatchApi::class, 'appel'], $lots->requetes),
            static fn (string $a): bool => str_contains($a, 'tags_a'));
        self::assertCount(3, $tagsA, 'les lecteurs a soumis une fois');
    }

    /**
     * Its owner cancels a run while its direct calls are in flight (the
     * route, concurrently, frees only what no slice has in flight): nothing
     * more leaves, its calls in flight come back, written with their cost,
     * and the slice's end settles them at their real cost — never lost,
     * never free.
     */
    public function testARunCancelledWithCallsInFlightSettlesThemAtTheirRealCost(): void
    {
        $id = $this->nouveauRun(['/voie' => 'directe']);
        $pdo = $this->pdo;
        $user = $this->user;
        $config = $this->config;
        $annuleA = null;
        $http = new FakeMultiHttpClient(static function (array $r) use (&$annuleA, $pdo, $user, $config, $id): array {
            $appel = FakeMultiHttpClient::appel($r);
            if ($annuleA === null && str_contains($appel, 'tags_b')) {
                // as the route does
                $annuleA = microtime(true);
                self::assertTrue((new RunRepository($pdo))->annuler($id, $user));
                (new RunCosts($pdo, $config))->libererHorsVol($id);
            }
            $chat = str_starts_with($r['url'], Fournisseurs::REGISTRE['openai']['url']);

            return ['body' => FakeMultiHttpClient::message('vu ' . $appel, $chat ? self::MODELE : 'claude-haiku-5-5',
                format: $chat ? 'chat' : 'anthropic'), 'delai' => 0.5];
        });

        (new Tick($this->pdo, ['budgetSeconds' => 4, 'twin9Sender' => new DirectCalls($http)]))->run();

        self::assertSame('annule', (new RunRepository($this->pdo))->statut($id), 'annulé, jamais en échec');
        self::assertNotNull($annuleA);
        self::assertNotSame([], $http->requests);
        foreach ($http->requests as $r) {
            $appel = FakeMultiHttpClient::appel($r);
            self::assertLessThanOrEqual($annuleA, $r['at'], $appel . ' : plus rien ne part après l’annulation');
            $etat = $this->appel($id, $appel);
            self::assertSame('repondu', $etat['statut'], $appel . ' : revenu, écrit');
            self::assertGreaterThan(0, (int) $etat['cout_microusd'], $appel . ' : avec son coût');
        }
        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM twin9_appels WHERE reserve_microusd IS NOT NULL')
            ->fetchColumn(), 'plus rien n’est retenu');
        $couts = (int) $this->pdo->query('SELECT SUM(cout_microusd) FROM twin9_appels')->fetchColumn();
        self::assertSame(self::CREDIT - $couts, (new CreditService($this->pdo))->balance($this->user),
            'ses appels en vol payés à leur coût réel, rien d’autre');
    }

    /**
     * A run cancelled between two slices — or whose tick died — keeps what
     * its calls hold no longer than the next tick: each call's reserve goes
     * back, at its real cost for one answered.
     */
    public function testACancelledRunsReservesGoBackAtTheNextTick(): void
    {
        $id = $this->nouveauRun(['/voie' => 'directe']);
        $http = new FakeMultiHttpClient(static fn (array $r): array =>
            ['status' => 429, 'headers' => ['retry-after' => '30'], 'body' => '{}']);
        (new Tick($this->pdo, ['budgetSeconds' => 2, 'twin9Sender' => new DirectCalls($http)]))->run();
        self::assertGreaterThan(0, (int) $this->pdo->query('SELECT COUNT(*) FROM twin9_appels
                                                               WHERE reserve_microusd IS NOT NULL')->fetchColumn());
        self::assertLessThan(self::CREDIT, (new CreditService($this->pdo))->balance($this->user), 'des réserves tenues');
        // a call a dead tick left in flight
        $this->pdo->prepare('UPDATE twin9_appels SET statut = "envoye" WHERE run_id = ? AND appel = ?')
            ->execute([$id, 'journees/J1/tags_a_P1.json']);

        self::assertTrue((new RunRepository($this->pdo))->annuler($id, $this->user));
        (new Tick($this->pdo, ['budgetSeconds' => 2, 'twin9Sender' => new DirectCalls($http)]))->run();

        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM twin9_appels WHERE reserve_microusd IS NOT NULL')
            ->fetchColumn(), 'tout est rendu');
        self::assertSame(self::CREDIT, (new CreditService($this->pdo))->balance($this->user));
        self::assertSame('annule', (new RunRepository($this->pdo))->statut($id));
    }

    /**
     * The instance's OpenAI key refused (HTTP 401: revoked, mistyped): its
     * calls wait, no attempt spent, never a failure — the run's page says
     * the provider is unavailable, never why —; held thirty minutes, the run
     * stops, its reserve given back; resumed once the key is mended, it goes
     * to its end with every reader.
     */
    public function testARefusedThirdPartyKeyHoldsItsCallsBackWithoutFailing(): void
    {
        $id = $this->nouveauRun(['/voie' => 'directe']);
        $refusee = true;
        $http = new FakeMultiHttpClient(static function (array $r) use (&$refusee): array {
            $appel = FakeMultiHttpClient::appel($r);
            if (str_starts_with($r['url'], Fournisseurs::REGISTRE['anthropic']['url'])) {
                return ['body' => FakeMultiHttpClient::message('vu ' . $appel)];
            }

            return $refusee ? ['status' => 401, 'body' => '{"error":{"message":"texte-du-fournisseur-canari"}}']
                : ['body' => FakeMultiHttpClient::message('vu ' . $appel, self::MODELE, format: 'chat')];
        });
        $tick = fn (): array => (new Tick($this->pdo, ['budgetSeconds' => 4,
                                                       'twin9Sender' => new DirectCalls($http)]))->run();

        $c = $tick();
        self::assertSame(3, $c['twin9ClesRefusees'], 'comptés pour l’administrateur');
        self::assertStringContainsString('fournisseur OpenAI indisponible sur cette instance', (string) $this->attente($id));
        $tick();
        $tick();
        $runs = new RunRepository($this->pdo);
        self::assertSame('en_cours', $runs->statut($id));
        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM twin9_appels WHERE statut = "panne"')
            ->fetchColumn(), 'jamais une panne');
        $etat = $this->appel($id, 'journees/J1/tags_b_P1.json');
        self::assertSame(['attente', 0], [$etat['statut'], (int) $etat['tentatives']], 'aucune tentative perdue');

        // thirty minutes refused: at its next try, the run stops, what its calls hold given back
        $this->pdo->prepare('UPDATE twin9_appels SET plafond_depuis = NOW(3) - INTERVAL 31 MINUTE, reprise_at = NOW(3)
                              WHERE run_id = ? AND appel = ?')->execute([$id, 'journees/J1/tags_b_P1.json']);
        $tick();
        self::assertSame('echoue', $runs->statut($id));
        self::assertSame('fournisseur OpenAI indisponible sur cette instance depuis plus de 30 minutes : le run '
            . 's’arrête, sa réserve est rendue', $this->attente($id));
        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM twin9_appels WHERE reserve_microusd IS NOT NULL')
            ->fetchColumn());
        self::assertStringNotContainsString('canari', (string) json_encode($this->pdo->query(
            'SELECT panne, stop_reason FROM twin9_appels')->fetchAll()) . $this->attente($id));

        $refusee = false;
        self::assertTrue($runs->reprendre($id, $this->user));
        $this->pdo->exec('UPDATE twin9_appels SET reprise_at = NOW(3) WHERE statut = "attente"');
        for ($n = 0; $n < 20 && $runs->statut($id) === 'en_cours'; $n++) {
            $tick();
        }
        self::assertSame('termine', $runs->statut($id));
        self::assertSame(0, $runs->compteursDe($id)['par_fournisseur']['openai']['pannes'], 'chaque lecteur b est là');
    }

    /**
     * A third party's call leaves only if its model's longest call fits in
     * what remains of the slice: held back, it leaves at the head of the
     * next; a model longer than a slice never leaves, and the page says why.
     */
    public function testAThirdPartysCallLeavesOnlyIfItMayEndWithinTheSlice(): void
    {
        // a slice of 4 s (3.6 s once its reserve is kept) leaves 3.24 s at its head (Twin9Slice::dureeAdmise())
        $this->config->update(['modeles' => ['openai:' . self::MODELE => ['duree_max_s' => 3] + self::entree()]
            + $this->config->modeles()]);
        $this->nouveauRun(['/voie' => 'directe', '/college' => [self::lecteur('a')],
                           '/etapes/greffier' => (object) ['fournisseur' => 'openai', 'modele' => self::MODELE]],
            ['lecteurs' => ['a'], 'etapes' => ['greffier']]);
        $http = new FakeMultiHttpClient(static fn (array $r): array => str_contains($r['url'], 'anthropic')
            ? ['body' => FakeMultiHttpClient::message('vu'), 'delai' => 1.9]
            : ['body' => FakeMultiHttpClient::message('vu', self::MODELE, format: 'chat')]);

        $c = (new Tick($this->pdo, ['budgetSeconds' => 4, 'twin9Sender' => new DirectCalls($http)]))->run();
        self::assertSame(3, $c['twin9Gardes'], 'les trois greffiers attendent la tranche suivante');
        self::assertSame(0, $c['twin9Coupes']);
        self::assertSame([], array_values(array_filter($http->requests, static fn (array $r): bool =>
            str_contains($r['url'], 'openai'))), 'rien ne part chez OpenAI qui ne puisse finir dans la tranche');

        $debut = microtime(true);
        $c = (new Tick($this->pdo, ['budgetSeconds' => 4, 'twin9Sender' => new DirectCalls($http)]))->run();
        $openai = array_values(array_filter($http->requests, static fn (array $r): bool => str_contains($r['url'], 'openai')));
        self::assertCount(3, $openai, 'en tête de la tranche suivante');
        foreach ($openai as $r) {
            self::assertLessThan($debut + 1.0, $r['at']);
        }
        self::assertSame(0, $c['twin9Gardes']);

        // a model whose longest call outlasts the slice: it never leaves, and the page says why
        $autre = $this->nouveauRun(['/voie' => 'directe', '/college' => [self::lecteur('a')],
                                    '/etapes/greffier' => (object) ['fournisseur' => 'openai', 'modele' => self::MODELE]],
            ['lecteurs' => ['a'], 'etapes' => ['greffier']], $this->utilisateur('long@example.test'));
        $this->config->update(['modeles' => ['openai:' . self::MODELE => ['duree_max_s' => 4] + self::entree()]
            + $this->config->modeles()]);
        $rapide = new FakeMultiHttpClient(static fn (array $r): array => str_contains($r['url'], 'anthropic')
            ? ['body' => FakeMultiHttpClient::message('vu')]
            : throw new \LogicException('un appel plus long qu’une tranche ne part jamais'));
        for ($n = 0; $n < 3; $n++) {
            (new Tick($this->pdo, ['budgetSeconds' => 4, 'twin9Sender' => new DirectCalls($rapide),
                                   'twin9Utilisateur' => $this->userDe($autre)]))->run();
        }
        self::assertSame('en_cours', (new RunRepository($this->pdo))->statut($autre));
        self::assertSame('un appel à openai:' . self::MODELE . ' peut durer 4 s, plus que ne lui en laisse une tranche de '
            . '3 s : il attend une tranche plus longue, que donne la page du run ouverte', $this->attente($autre));
        self::assertSame(3, \count($rapide->requests), 'les lecteurs d’Anthropic sont partis');
    }

    /**
     * A model whose longest call outlasts what this slice leaves it (a
     * trigger's shorter slice) holds its own calls alone — another model of
     * the same provider leaves —, and the page says why and what to do; a
     * longer slice (its page open) lets them leave, and the run is no
     * longer held.
     */
    public function testAModelLongerThanTheSliceHoldsItsOwnCallsAlone(): void
    {
        $long = 'modele-fictif-2';
        $this->config->update(['modeles' => $this->config->modeles()
            + ['openai:' . $long => ['duree_max_s' => 4] + self::entree()]]);
        $college = [self::lecteur('a'), (object) ['nom' => 'b', 'poids' => 1, 'passes' => 1, 'fournisseur' => 'openai',
                                                  'modele' => $long], self::lecteur('c', 'openai')];
        $id = $this->nouveauRun(['/voie' => 'directe', '/college' => $college], ['lecteurs' => ['a', 'b', 'c']]);
        $http = new FakeMultiHttpClient(static fn (array $r): array => str_contains($r['url'], 'anthropic')
            ? ['body' => FakeMultiHttpClient::message('vu')]
            : ['body' => FakeMultiHttpClient::message('vu', (string) $r['body']['model'], format: 'chat')]);
        $tick = fn (int $secondes): array => (new Tick($this->pdo, ['budgetSeconds' => $secondes,
                                                                    'twin9Sender' => new DirectCalls($http)]))->run();
        $openai = static fn (): array => array_map([FakeMultiHttpClient::class, 'appel'], array_values(array_filter(
            $http->requests, static fn (array $r): bool => str_contains($r['url'], 'openai'))));

        // a slice of 4 s (3.24 s at its head): the readers c leave, the readers b wait
        $tick(4);
        self::assertNotSame([], $openai(), 'un autre modèle du même fournisseur part');
        foreach ($openai() as $appel) {
            self::assertStringContainsString('/tags_c_', $appel);
        }
        self::assertStringContainsString('un appel à openai:' . $long . ' peut durer 4 s, plus que ne lui en laisse une '
            . 'tranche de 3 s : il attend une tranche plus longue, que donne la page du run ouverte', (string) $this->attente($id));
        self::assertNotNull($this->retenuDepuis($id), 'retenu depuis cette tranche');

        // a slice of 6 s (4.86 s at its head), as its page open gives: they leave, the run is no longer held
        $tick(6);
        self::assertNotSame([], array_filter($openai(), static fn (string $a): bool => str_contains($a, '/tags_b_')));
        self::assertNull($this->retenuDepuis($id));
    }

    /**
     * A run held thirty minutes by a model longer than the slices it gets
     * (its page closed, a trigger's slices too short) stops, what its calls
     * hold given back, its page saying how to resume it; resumed, it is no
     * longer held.
     */
    public function testARunHeldThirtyMinutesByAModelLongerThanItsSlicesStops(): void
    {
        $this->config->update(['modeles' => ['openai:' . self::MODELE => ['duree_max_s' => 4] + self::entree()]
            + $this->config->modeles()]);
        $id = $this->nouveauRun(['/voie' => 'directe']);
        $http = new FakeMultiHttpClient(static fn (array $r): array => str_contains($r['url'], 'anthropic')
            ? ['body' => FakeMultiHttpClient::message('vu')]
            : throw new \LogicException('un appel plus long que la tranche ne part pas'));
        $tick = fn (): array => (new Tick($this->pdo, ['budgetSeconds' => 4, 'twin9Sender' => new DirectCalls($http)]))->run();

        $tick();
        $runs = new RunRepository($this->pdo);
        self::assertSame('en_cours', $runs->statut($id));
        self::assertNotNull($this->retenuDepuis($id));

        $this->pdo->prepare('UPDATE twin9_runs SET retenu_depuis = NOW(3) - INTERVAL 31 MINUTE WHERE id = ?')->execute([$id]);
        $c = $tick();
        self::assertSame('echoue', $runs->statut($id));
        self::assertSame(1, $c['twin9Echoues']);
        self::assertSame('un appel à openai:' . self::MODELE . ' peut durer plus que ne lui en laissent les tranches de '
            . 'ce run depuis plus de 30 minutes : le run s’arrête, sa réserve est rendue ; à reprendre la page du run '
            . 'ouverte', $this->attente($id));
        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM twin9_appels WHERE reserve_microusd IS NOT NULL')
            ->fetchColumn());

        self::assertTrue($runs->reprendre($id, $this->user));
        self::assertNull($this->retenuDepuis($id), 'repris, il ne l’est plus');
    }

    /** A third party's call the slice's end cuts is counted, by provider, in the journal and the execution. */
    public function testAThirdPartysCutIsCounted(): void
    {
        $id = $this->nouveauRun(['/voie' => 'directe']);
        $http = new FakeMultiHttpClient(static fn (array $r): array => str_contains($r['url'], 'anthropic')
            ? ['body' => FakeMultiHttpClient::message('vu')]
            : ['body' => FakeMultiHttpClient::message('vu', self::MODELE, format: 'chat'),
               'delai' => FakeMultiHttpClient::appel($r) === 'journees/J1/tags_b_P1.json' ? 10.0 : 0.0]);
        // a provider still answering when the slice ends: its connection cut by the slice, not by its own timeout
        $lent = new class ($http) implements MultiHttpClient {
            public function __construct(private readonly MultiHttpClient $http)
            {
            }

            public function start(string $id, string $method, string $url, array $headers, ?string $body,
                                  float $timeoutSeconds): void
            {
                $this->http->start($id, $method, $url, $headers, $body, 3600.0);
            }

            public function wait(float $deadline): array
            {
                return $this->http->wait($deadline);
            }

            public function abort(): array
            {
                return $this->http->abort();
            }

            public function running(): int
            {
                return $this->http->running();
            }
        };

        $c = (new Tick($this->pdo, ['budgetSeconds' => 3, 'twin9Sender' => new DirectCalls($lent)]))->run();

        self::assertSame(1, $c['twin9Coupes']);
        $etat = $this->appel($id, 'journees/J1/tags_b_P1.json');
        self::assertSame(['attente', 1], [$etat['statut'], (int) $etat['coupures']]);
        $execution = (new RunRepository($this->pdo))->execution($id);
        self::assertSame(1, $execution->par_fournisseur->openai->coupures);
        self::assertSame(0, $execution->par_fournisseur->anthropic->coupures);
        self::assertSame(1, $execution->par_voie->directe->coupures);
    }

    /**
     * After a 429 of a provider, the instance's key rests from it for every
     * run of the slice, as long as its Retry-After says: no run's call
     * leaves for it meanwhile.
     */
    public function testTheInstancesKeyRestsFromAProviderForEveryRunAfterA429(): void
    {
        $tout = ['/voie' => 'directe', '/parallelisme/appels_directs' => 1,
                 '/etages/lecteurs/fournisseur' => 'openai', '/etages/lecteurs/modele' => self::MODELE,
                 '/etages/rapide/fournisseur' => 'openai', '/etages/rapide/modele' => self::MODELE,
                 '/etages/profond/fournisseur' => 'openai', '/etages/profond/modele' => self::MODELE,
                 '/college' => [self::lecteur('a')]];
        $moteur = ['lecteurs' => ['a'], 'etapes' => [], 'fusion' => false];
        $this->nouveauRun($tout, $moteur);
        $this->nouveauRun($tout, $moteur, $this->utilisateur('second@example.test'));
        $n = 0;
        $http = new FakeMultiHttpClient(static function (array $r) use (&$n): array {
            return ++$n === 1 ? ['status' => 429, 'headers' => ['retry-after' => '1.2'], 'body' => '{}']
                : ['body' => FakeMultiHttpClient::message('vu', self::MODELE, format: 'chat'), 'delai' => 0.05];
        });

        (new Tick($this->pdo, ['budgetSeconds' => 5, 'twin9Sender' => new DirectCalls($http)]))->run();

        self::assertGreaterThanOrEqual(4, \count($http->requests));
        $refus = $http->requests[0]['at'];
        foreach (\array_slice($http->requests, 2) as $r) {
            self::assertGreaterThanOrEqual($refus + 1.15, $r['at'], 'aucun appel de l’un ou l’autre run pendant le repos');
        }
        self::assertLessThan($refus + 0.5, $http->requests[1]['at'], 'le second run était parti avant le refus');
    }

    /**
     * The guard is read again as each slice opens a run: a provider the
     * administrator closes meanwhile sends nothing more — its page says it —
     * while the batches go on; reopened, the run goes to its end.
     */
    public function testAProviderClosedMeanwhileSendsNothingMore(): void
    {
        $id = $this->nouveauRun();
        $lots = new FakeBatchApi(static fn (array $r): array => FakeBatchApi::message('vu ' . FakeBatchApi::appel($r)),
            regards: 0);
        $http = self::openai();
        $this->config->update(['twin9_fournisseurs_ouverts' => ['anthropic']]);

        $c = $this->tick($lots, $http);
        self::assertSame(1, $c['twin9Lots']);
        self::assertSame([], $http->requests);
        self::assertSame(Twin9Lots::EN_COURS . ' ; fournisseur OpenAI indisponible sur cette instance',
            $this->attente($id), 'les mots d’une clé absente : jamais pourquoi');

        $this->config->update(['twin9_fournisseurs_ouverts' => ['anthropic', 'openai']]);
        $this->jusquAuBout($lots, $http);
        self::assertSame('termine', (new RunRepository($this->pdo))->statut($id));
    }

    /**
     * A stopped run's batch, collected: its Anthropic readers answered,
     * written with their cost; nothing held any more, nothing left in a
     * batch; its owner debited what its calls cost, nothing else.
     */
    private function assertLotRegle(int $id): void
    {
        foreach (['J1', 'J2', 'J3'] as $jour) {
            $etat = $this->appel($id, "journees/$jour/tags_a_P1.json");
            self::assertSame('repondu', $etat['statut'], $jour . ' : sa réponse écrite');
            self::assertGreaterThan(0, (int) $etat['cout_microusd'], $jour . ' : avec son coût');
        }
        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM twin9_appels WHERE reserve_microusd IS NOT NULL')
            ->fetchColumn(), 'plus rien n’est retenu');
        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM twin9_lots')->fetchColumn());
        $couts = (int) $this->pdo->query('SELECT SUM(cout_microusd) FROM twin9_appels')->fetchColumn();
        self::assertSame(self::CREDIT - $couts, (new CreditService($this->pdo))->balance($this->user),
            'son propriétaire paie ce que ses appels ont coûté, lot compris');
    }

    /** A grid entry of the third party's model, at an invented price. @return array<string, mixed> */
    private static function entree(): array
    {
        return ['prix_usd_mtok' => [0.7, 1.3], 'plafond_sortie' => 30000, 'plafond_reflexion' => 0, 'duree_max_s' => 1];
    }

    /** A reader of the college, Anthropic's unless it names its provider. */
    private static function lecteur(string $nom, ?string $fournisseur = null): stdClass
    {
        return (object) (['nom' => $nom, 'poids' => 1, 'passes' => 1]
            + ($fournisseur === null ? [] : ['fournisseur' => $fournisseur, 'modele' => self::MODELE]));
    }

    /**
     * OpenAI, simulated: each request answered in Chat Completions' format,
     * unless $autrement answers it; never a request to another host.
     *
     * @param (\Closure(array<string, mixed>): ?array<string, mixed>)|null $autrement
     */
    private static function openai(?\Closure $autrement = null): FakeMultiHttpClient
    {
        return new FakeMultiHttpClient(static function (array $r) use ($autrement): array {
            if (!str_starts_with($r['url'], Fournisseurs::REGISTRE['openai']['url'])) {
                throw new \LogicException('aucun appel direct hors d’OpenAI : ' . $r['url']);
            }

            return ($autrement === null ? null : $autrement($r))
                ?? ['body' => FakeMultiHttpClient::message('vu ' . FakeMultiHttpClient::appel($r), self::MODELE,
                    format: 'chat')];
        });
    }

    /** @return array<string, mixed> the tick's counters */
    private function tick(FakeBatchApi $lots, FakeMultiHttpClient $http): array
    {
        return (new Tick($this->pdo, ['budgetSeconds' => 4, 'twin9Lots' => $lots,
                                      'twin9Sender' => new DirectCalls($http)]))->run();
    }

    private function jusquAuBout(FakeBatchApi $lots, FakeMultiHttpClient $http, int $max = 20): void
    {
        for ($n = 1; $n <= $max; $n++) {
            $this->tick($lots, $http);
            if ((int) $this->pdo->query('SELECT COUNT(*) FROM twin9_runs WHERE statut = "en_cours"')->fetchColumn() === 0) {
                return;
            }
        }
        self::fail("le run n'est pas allé au bout en $max tranches");
    }

    /**
     * A run of the fake engine: by default, by batches, the reader « a »
     * Anthropic's and the reader « b » OpenAI's, the steps greffier and
     * president, the merge.
     *
     * @param array<string, mixed> $profil changes to the v9.8 profile (JSON pointer => value)
     * @param array<string, mixed> $moteur the fake engine's settings
     */
    private function nouveauRun(array $profil = [], array $moteur = [], ?int $user = null): int
    {
        return (new RunRepository($this->pdo))->creer(
            $user ?? $this->user,
            $this->profil($profil),
            (object) ($moteur + ['lecteurs' => ['a', 'b'], 'etapes' => ['greffier', 'president'], 'fusion' => true]),
            'journal-factice.md',
            self::PORTFOLIO,
            'journal-factice',
            self::GABARITS,
            new \DateTimeImmutable('2026-10-18T12:00:00+00:00'),
            'twin9/runs/mixte',
        );
    }

    /** @param array<string, mixed> $changes */
    private function profil(array $changes): stdClass
    {
        $profil = ProfilRepository::v98();
        $profil->voie = 'lots';
        $profil->college = [self::lecteur('a'), self::lecteur('b', 'openai')];
        foreach ($changes as $pointeur => $valeur) {
            $noeud = $profil;
            $parties = explode('/', trim($pointeur, '/'));
            $dernier = array_pop($parties);
            foreach ($parties as $p) {
                $noeud->{$p} ??= new stdClass();
                $noeud = $noeud->{$p};
            }
            $noeud->{$dernier} = $valeur;
        }

        return ProfilRepository::validate($profil);
    }

    /** @return array<string, mixed> a call's row */
    private function appel(int $run, string $appel): array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM twin9_appels WHERE run_id = ? AND appel = ?');
        $stmt->execute([$run, $appel]);

        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    private function retenuDepuis(int $run): ?string
    {
        $stmt = $this->pdo->prepare('SELECT retenu_depuis FROM twin9_runs WHERE id = ?');
        $stmt->execute([$run]);
        $depuis = $stmt->fetchColumn();

        return $depuis === null || $depuis === false ? null : (string) $depuis;
    }

    private function attente(int $run): ?string
    {
        $stmt = $this->pdo->prepare('SELECT attente FROM twin9_runs WHERE id = ?');
        $stmt->execute([$run]);
        $attente = $stmt->fetchColumn();

        return $attente === null || $attente === false ? null : (string) $attente;
    }

    private function userDe(int $run): int
    {
        $stmt = $this->pdo->prepare('SELECT user_id FROM twin9_runs WHERE id = ?');
        $stmt->execute([$run]);

        return (int) $stmt->fetchColumn();
    }

    /** @param list<string> $valeurs @return list<string> */
    private static function trie(array $valeurs): array
    {
        sort($valeurs, SORT_STRING);

        return $valeurs;
    }

    private function utilisateur(string $email): int
    {
        $this->pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([$email, 'x', $email]);
        $id = (int) $this->pdo->lastInsertId();
        // the instance's key pays from its owner's credits (T10)
        (new CreditService($this->pdo))->adjust($id, self::CREDIT, 'crédit des tests');

        return $id;
    }
}
