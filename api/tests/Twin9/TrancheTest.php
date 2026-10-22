<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\Keys\KeyVault;
use Humanome\MigrationRunner;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\TestDb;
use Humanome\Twin9\CallSettings;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\DirectCalls;
use Humanome\Twin9\EngineLoader;
use Humanome\Twin9\ProfilRepository;
use Humanome\Twin9\RunKey;
use Humanome\Twin9\RunRepository;
use Humanome\Twin9\Twin9Config;
use Humanome\Worker\Tick;
use Humanome\Worker\Twin9Run;
use Humanome\Worker\Twin9Slice;
use PDO;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunTestsInSeparateProcesses;
use PHPUnit\Framework\TestCase;
use stdClass;

/**
 * Twin9 runs by slices (T7, ADR-011 §2), with the fake engine of
 * tests/fixtures/twin9-factice, public and loaded as the real one: a run goes
 * to its end in slices; killed between two calls, it resumes without a call
 * twice; two runs at once keep their settings and their key; no slice
 * outlasts its length; the memory is written day by day and never keeps a
 * failure. Each test runs in a process of its own: the real engine may be
 * loaded in the others.
 */
#[RunTestsInSeparateProcesses]
#[PreserveGlobalState(false)]
final class TrancheTest extends TestCase
{
    private const GABARITS = [
        'factice/lecture' => "[appel:{\$APPEL}] Lis la journée {\$JOUR} en lecteur {\$LECTEUR} :\n{\$TEXTE}",
        'factice/etape' => "[appel:{\$APPEL}] Étape {\$ETAPE} de {\$JOUR}, après : {\$PRECEDENT}",
        'factice/fusion' => "[appel:{\$APPEL}] Fusionne :\n{\$JOURS}",
    ];

    private const PORTFOLIO = "## J1\nPremier jour.\n## J2\nDeuxième jour.\n## J3\nTroisième jour.\n";

    private PDO $pdo;

    private int $user;

    protected function setUp(): void
    {
        $this->pdo = TestDb::fresh();
        (new MigrationRunner($this->pdo, MigrationRunner::defaultMigrationsDir()))->run();
        TestDb::setEnv('TWIN_V9_DIR', \dirname(__DIR__) . '/fixtures/twin9-factice');
        self::assertTrue(EngineLoader::load());
        TestDb::setEnv('ANTHROPIC_API_KEY', 'sk-ant-instance-test');
        TestDb::setEnv('WORKER_TICK_BUDGET_SECONDS', '');
        $this->user = $this->utilisateur('apprenant@example.test');
    }

    protected function tearDown(): void
    {
        TestDb::restoreEnv();
    }

    public function testARunGoesToItsEndInSlices(): void
    {
        $id = $this->nouveauRun();
        $http = new FakeMultiHttpClient(static fn (array $r): array =>
            ['body' => FakeMultiHttpClient::message('vu ' . FakeMultiHttpClient::appel($r)), 'delai' => 0.25]);

        $ticks = $this->jusquAuBout($http, budget: 1);

        self::assertGreaterThan(1, $ticks, 'plusieurs tranches');
        $runs = new RunRepository($this->pdo);
        self::assertSame('termine', $runs->statut($id));
        $sorties = $runs->sorties($id);
        self::assertSame(['carto_evolutive.json', 'journees/J1/carto_jour.json', 'journees/J2/carto_jour.json',
                          'journees/J3/carto_jour.json'], array_keys($sorties));
        $carto = json_decode($sorties['carto_evolutive.json'], true);
        self::assertSame('vu fusion', $carto['fusion']);
        self::assertSame('2026-10-18T12:00:00+00:00', $carto['horloge'], 'l\'horloge du run, figée');
        self::assertSame(['vu journees/J2/tags_a_P1.json', 'vu journees/J2/tags_b_P1.json'], $carto['jours'][1]['lectures']);
        self::assertSame(['faisceaux', 'journees/J1', 'journees/J2', 'journees/J3'], $this->cles($id));
        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM twin9_appels')->fetchColumn(),
            'un run fini ne garde que ses compteurs');
        $compteurs = $runs->compteursDe($id);
        self::assertSame(13, $compteurs['appels']);
        self::assertSame(0, $compteurs['pannes']);
        self::assertSame(['claude-haiku-5-5' => 13], $compteurs['modeles_servis']);
    }

    /**
     * Killed between two calls (the tick dies as a call is about to leave),
     * then resumed: every call reaches Anthropic once. The passes the dead
     * tick played stay counted (P0-1): each is, as soon as it is played.
     */
    public function testKilledBetweenTwoCallsItResumesWithoutACallTwice(): void
    {
        $id = $this->nouveauRun([], ['/parallelisme/appels_directs' => 1]);
        $morts = 0;
        $http = new FakeMultiHttpClient(static function (array $r) use (&$morts): array {
            return ['body' => FakeMultiHttpClient::message('vu ' . FakeMultiHttpClient::appel($r))];
        });
        $tueur = new KillingMultiHttpClient($http, auDepart: [4, 9]);
        $passes = 0; // those of the ticks that lived, then of those that died
        for ($n = 0; $n < 10 && (new RunRepository($this->pdo))->statut($id) === 'en_cours'; $n++) {
            $avant = $this->passes($id);
            try {
                $passes += (new Tick($this->pdo, ['budgetSeconds' => 5, 'twin9Sender' => new DirectCalls($tueur)]))
                    ->run()['twin9Passes'];
            } catch (\RuntimeException $e) {
                self::assertSame('tick tué', $e->getMessage());
                $morts++;
                self::assertGreaterThan($avant, $this->passes($id), 'les passes du tick mort restent comptées');
                $passes += $this->passes($id) - $avant;
            }
        }

        self::assertSame(2, $morts);
        self::assertSame('termine', (new RunRepository($this->pdo))->statut($id));
        $appels = array_map([FakeMultiHttpClient::class, 'appel'], $http->requests);
        self::assertCount(13, $appels);
        self::assertSame(array_values(array_unique($appels)), $appels, 'aucun appel en double');
        self::assertSame($passes, (new RunRepository($this->pdo))->execution($id)->passes, 'toutes, figées');
    }

    /** Killed during a call, whose answer is lost: that call leaves again, once, its attempt counted. */
    public function testKilledDuringACallOnlyThatCallLeavesAgain(): void
    {
        $id = $this->nouveauRun([], ['/parallelisme/appels_directs' => 1]);
        $http = new FakeMultiHttpClient(static fn (array $r): array =>
            ['body' => FakeMultiHttpClient::message('vu ' . FakeMultiHttpClient::appel($r))]);
        $tueur = new KillingMultiHttpClient($http, enVol: [5]);
        for ($n = 0; $n < 10 && (new RunRepository($this->pdo))->statut($id) === 'en_cours'; $n++) {
            try {
                (new Tick($this->pdo, ['budgetSeconds' => 5, 'twin9Sender' => new DirectCalls($tueur)]))->run();
            } catch (\RuntimeException) {
            }
        }

        self::assertSame('termine', (new RunRepository($this->pdo))->statut($id));
        $appels = array_map([FakeMultiHttpClient::class, 'appel'], $http->requests);
        self::assertCount(14, $appels);
        $doubles = array_keys(array_filter(array_count_values($appels), static fn (int $n): bool => $n > 1));
        self::assertSame([$appels[4]], $doubles, 'seul l\'appel en vol repart');
        self::assertSame(14, (new RunRepository($this->pdo))->compteursDe($id)['tentatives']);
    }

    /** Two runs advance in the same slices, each with its own settings, templates and key. */
    public function testTwoRunsAtOnceKeepTheirSettingsAndTheirKeys(): void
    {
        TestDb::setEnv('SODIUM_MASTER_KEY', str_repeat('ab', 32));
        (new Twin9Config(new SettingsRepository($this->pdo)))->update(['twin9_cle_perso_ouverte' => true]);
        $autre = $this->utilisateur('autre@example.test');
        (new KeyVault($this->pdo, (string) KeyVault::masterKeyFromEnv()))->store($autre, 'anthropic', 'sk-ant-perso-test');
        $a = $this->nouveauRun(['lecteurs' => ['a']], ['/etapes/greffier' => (object) ['effort' => 'low']],
            gabarits: self::prefixes('A'));
        $b = $this->nouveauRun(['lecteurs' => ['x', 'y']], [
            '/etages/profond/modele' => 'claude-opus-4-8',
            '/etapes/greffier' => (object) ['budget_sortie' => 999],
            '/cle' => 'personnelle',
        ], user: $autre, gabarits: self::prefixes('B'));
        $http = new FakeMultiHttpClient(static fn (array $r): array =>
            ['body' => FakeMultiHttpClient::message('vu'), 'delai' => 0.05]);

        $this->jusquAuBout($http, options: ['twin9Runs' => 2]);

        $parRun = ['A' => [], 'B' => []];
        foreach ($http->requests as $r) {
            $parRun[substr((string) $r['body']['messages'][0]['content'], 0, 1)][] = $r;
        }
        self::assertCount(1 * 3 + 2 * 3 + 1, $parRun['A']);
        self::assertCount(2 * 3 + 2 * 3 + 1, $parRun['B']);
        foreach ($http->requests as $r) {
            self::assertArrayNotHasKey('temperature', $r['body']);
        }
        foreach ($parRun['A'] as $r) {
            $appel = FakeMultiHttpClient::appel($r);
            self::assertSame('sk-ant-instance-test', $r['headers']['x-api-key']);
            $profond = str_ends_with($appel, 'president.md') || $appel === 'fusion';
            self::assertSame($profond ? 'claude-sonnet-5-5' : 'claude-haiku-5-5', $r['body']['model'], $appel);
            self::assertSame(['type' => $profond ? 'between_tools' : 'disabled'], $r['body']['thinking'], $appel);
            self::assertSame(16000, $r['body']['max_tokens']);
            str_ends_with($appel, 'greffier.md')
                ? self::assertSame(['effort' => 'low'], $r['body']['output_config'])
                : self::assertArrayNotHasKey('output_config', $r['body']);
        }
        foreach ($parRun['B'] as $r) {
            $appel = FakeMultiHttpClient::appel($r);
            self::assertSame('sk-ant-perso-test', $r['headers']['x-api-key']);
            $profond = str_ends_with($appel, 'president.md') || $appel === 'fusion';
            self::assertSame($profond ? 'claude-opus-4-8' : 'claude-haiku-5-5', $r['body']['model'], $appel);
            self::assertSame(['type' => 'disabled'], $r['body']['thinking'], $appel);
            self::assertSame(str_ends_with($appel, 'greffier.md') ? 999 : 16000, $r['body']['max_tokens'], $appel);
            self::assertArrayNotHasKey('output_config', $r['body']);
        }
        self::assertLessThan(max(array_column($parRun['A'], 'at')), min(array_column($parRun['B'], 'at')),
            'les deux runs avancent ensemble');
        $runs = new RunRepository($this->pdo);
        self::assertCount(1, json_decode($runs->sorties($a)['carto_evolutive.json'], true)['jours'][0]['lectures']);
        self::assertCount(2, json_decode($runs->sorties($b)['carto_evolutive.json'], true)['jours'][0]['lectures']);
    }

    /**
     * Calls longer than a slice: every slice still ends on time; each cut
     * after half a slice spends an attempt, and the third makes a failure,
     * which leaves its day out of the memory.
     */
    public function testNoSliceOutlastsItsLength(): void
    {
        $id = $this->nouveauRun(['lecteurs' => ['a'], 'etapes' => ['greffier']]);
        $http = new FakeMultiHttpClient(static fn (array $r): array => FakeMultiHttpClient::appel($r) === 'journees/J2/1-greffier.md'
            ? ['body' => FakeMultiHttpClient::message('trop tard'), 'delai' => 30.0]
            : ['body' => FakeMultiHttpClient::message('vu'), 'delai' => 0.05]);

        $this->jusquAuBout($http, budget: 2);

        $longs = array_filter($http->requests, static fn (array $r): bool =>
            FakeMultiHttpClient::appel($r) === 'journees/J2/1-greffier.md');
        self::assertCount(3, $longs, 'trois tentatives, puis la panne');
        self::assertSame(['faisceaux', 'journees/J1', 'journees/J3'], $this->cles($id));
        self::assertSame(1, (new RunRepository($this->pdo))->compteursDe($id)['pannes']);
    }

    /**
     * The memory is written day by day: a day done is in it before the run
     * ends, a day with a failure never is, and the next run of the map plays
     * only that day again.
     */
    public function testTheMemoryIsWrittenDayByDayAndNeverKeepsAFailure(): void
    {
        $id = $this->nouveauRun();
        $fusions = 0;
        $http = new FakeMultiHttpClient(static function (array $r) use (&$fusions): array {
            $appel = FakeMultiHttpClient::appel($r);
            if ($appel === 'journees/J2/2-president.md') {
                return ['status' => 500, 'body' => '{"type":"error"}'];
            }
            if ($appel === 'fusion' && ++$fusions === 1) {
                return ['body' => FakeMultiHttpClient::message('lente'), 'delai' => 5.0];
            }

            return ['body' => FakeMultiHttpClient::message('vu ' . $appel)];
        });

        (new Tick($this->pdo, ['budgetSeconds' => 1, 'twin9Sender' => new DirectCalls($http),
                               'twin9Pauses' => [0.05, 0.1]]))->run();
        self::assertSame('en_cours', (new RunRepository($this->pdo))->statut($id), 'la fusion n\'a pas fini');
        self::assertSame(['journees/J1', 'journees/J3'], $this->cles($id), 'les journées finies, sans la panne');

        $this->jusquAuBout($http);
        self::assertSame(['faisceaux', 'journees/J1', 'journees/J3'], $this->cles($id));
        self::assertSame(1, (new RunRepository($this->pdo))->compteursDe($id)['pannes']);

        $avant = \count($http->requests);
        $suivant = $this->nouveauRun();
        $http2 = new FakeMultiHttpClient(static fn (array $r): array =>
            ['body' => FakeMultiHttpClient::message('vu ' . FakeMultiHttpClient::appel($r))]);
        $this->jusquAuBout($http2);
        self::assertSame(['journees/J2/tags_a_P1.json', 'journees/J2/tags_b_P1.json', 'journees/J2/1-greffier.md',
                          'journees/J2/2-president.md', 'fusion'],
            array_map([FakeMultiHttpClient::class, 'appel'], $http2->requests));
        self::assertSame(['faisceaux', 'journees/J1', 'journees/J2', 'journees/J3'], $this->cles($suivant));
        self::assertGreaterThan(0, $avant);
    }

    /**
     * Attempts: a rate refusal waits its Retry-After without spending one, a
     * network error spends one, a refusal of the model is a failure at once;
     * the model served is counted.
     */
    public function testAttemptsRetryAfterAndRefusals(): void
    {
        $id = $this->nouveauRun(['lecteurs' => ['a'], 'etapes' => ['greffier']]);
        $vus = [];
        $http = new FakeMultiHttpClient(static function (array $r) use (&$vus): array {
            $appel = FakeMultiHttpClient::appel($r);
            $n = $vus[$appel] = ($vus[$appel] ?? 0) + 1;
            if ($appel === 'journees/J1/tags_a_P1.json' && $n === 1) {
                return ['status' => 529, 'headers' => ['retry-after' => '0.2'], 'body' => '{"type":"error"}'];
            }
            if ($appel === 'journees/J2/tags_a_P1.json' && $n === 1) {
                return ['reseau' => true];
            }
            if ($appel === 'journees/J3/1-greffier.md') {
                return ['body' => ['stop_reason' => 'refusal', 'stop_details' => ['category' => 'cyber'],
                                   'model' => 'claude-haiku-5-5', 'content' => [],
                                   'usage' => ['input_tokens' => 10, 'output_tokens' => 0]]];
            }

            return ['body' => FakeMultiHttpClient::message('vu', 'claude-haiku-5-5-20261001')];
        });

        $this->jusquAuBout($http);

        self::assertSame(2, $vus['journees/J1/tags_a_P1.json']);
        self::assertSame(2, $vus['journees/J2/tags_a_P1.json']);
        self::assertSame(1, $vus['journees/J3/1-greffier.md'], 'un refus ne se retente pas');
        $compteurs = (new RunRepository($this->pdo))->compteursDe($id);
        self::assertSame(7, $compteurs['appels']);
        self::assertSame(8, $compteurs['tentatives'], 'le refus de débit ne compte pas, la coupure réseau oui');
        self::assertSame(1, $compteurs['pannes']);
        self::assertSame(['claude-haiku-5-5' => 1, 'claude-haiku-5-5-20261001' => 6], $compteurs['modeles_servis']);
        self::assertSame(['faisceaux', 'journees/J1', 'journees/J2'], $this->cles($id));
    }

    /**
     * P0-2: an output cut by its budget is a failure at once — one request,
     * its row a failure paid at its real usage, its text never kept —,
     * counted apart; its day stays out of the memory, and the next run of
     * the map instructs it again.
     */
    public function testACutOutputIsAFailureNeverSentAgain(): void
    {
        $id = $this->nouveauRun(['lecteurs' => ['a'], 'etapes' => ['greffier']]);
        $coupe = 'journees/J2/1-greffier.md';
        $fusions = 0;
        $http = new FakeMultiHttpClient(static function (array $r) use ($coupe, &$fusions): array {
            $appel = FakeMultiHttpClient::appel($r);
            if ($appel === $coupe) {
                return ['body' => ['type' => 'message', 'model' => 'claude-haiku-5-5', 'stop_reason' => 'max_tokens',
                                   'content' => [['type' => 'text', 'text' => 'un début coupé']],
                                   'usage' => ['input_tokens' => 100, 'output_tokens' => $r['body']['max_tokens']]]];
            }
            if ($appel === 'fusion' && ++$fusions === 1) {
                return ['body' => FakeMultiHttpClient::message('lente'), 'delai' => 5.0];
            }

            return ['body' => FakeMultiHttpClient::message('vu ' . $appel)];
        });

        $c = (new Tick($this->pdo, ['budgetSeconds' => 1, 'twin9Sender' => new DirectCalls($http),
                                    'twin9Pauses' => [0.05, 0.1]]))->run();
        self::assertSame(1, $c['twin9Tronques']);
        self::assertSame('en_cours', (new RunRepository($this->pdo))->statut($id), 'la fusion n\'a pas fini');
        $reglage = (new CallSettings($this->profil()))->pour('greffier', $coupe);
        $config = new Twin9Config(new SettingsRepository($this->pdo));
        $stmt = $this->pdo->prepare('SELECT statut, tentatives, reponse, panne, stop_reason, jetons_entree, jetons_sortie,
                                            cout_microusd FROM twin9_appels WHERE run_id = ? AND appel = ?');
        $stmt->execute([$id, $coupe]);
        $ligne = $stmt->fetch();
        self::assertSame(['statut' => 'panne', 'tentatives' => 1, 'reponse' => null,
                          'panne' => 'réponse tronquée : budget de sortie atteint (max_tokens)',
                          'stop_reason' => 'max_tokens', 'jetons_entree' => 100,
                          'jetons_sortie' => $reglage['budget_sortie'],
                          'cout_microusd' => $config->coutMicrousd($reglage['modele'], 100, $reglage['budget_sortie'])],
            ['statut' => $ligne['statut'], 'tentatives' => (int) $ligne['tentatives'], 'reponse' => $ligne['reponse'],
             'panne' => $ligne['panne'], 'stop_reason' => $ligne['stop_reason'],
             'jetons_entree' => (int) $ligne['jetons_entree'], 'jetons_sortie' => (int) $ligne['jetons_sortie'],
             'cout_microusd' => (int) $ligne['cout_microusd']], 'une panne, au coût de son usage réel');
        self::assertSame(['journees/J1', 'journees/J3'], $this->cles($id), 'la journée coupée hors de la mémoire');

        $this->jusquAuBout($http);
        $envois = array_filter($http->requests, static fn (array $r): bool => FakeMultiHttpClient::appel($r) === $coupe);
        self::assertCount(1, $envois, 'jamais relancé : le même prompt serait coupé de même');
        $compteurs = (new RunRepository($this->pdo))->compteursDe($id);
        self::assertSame([1, 1], [$compteurs['pannes'], $compteurs['tronques']]);
        // P0-1: its execution, frozen, says it too — the cut stop, its lane, its model —, its totals its counters'
        $execution = json_decode(json_encode((new RunRepository($this->pdo))->execution($id)), true);
        self::assertSame(['fige', true], [$execution['source'], $execution['partiel']], 'un run créé sans configuration');
        $n = $compteurs['appels'];
        // MySQL's JSON column orders the keys its own way: compared as maps
        self::assertEquals(['total' => $n, 'repondus' => $n - 1, 'pannes' => 1, 'tronques' => 1, 'refus' => 0,
                          'tentatives' => $compteurs['tentatives']], $execution['appels']);
        self::assertSame([$compteurs['cout_microusd'], $compteurs['jetons_entree'], $compteurs['jetons_sortie']],
            [$execution['cout_microusd'], $execution['jetons']['entree'], $execution['jetons']['sortie']]);
        self::assertEquals(['end' => $n - 1, 'max_tokens' => 1, 'context_window' => 0, 'refusal' => 0, 'other' => 0],
            $execution['arrets']);
        self::assertSame(['directe'], array_keys($execution['par_voie']));
        self::assertSame(['anthropic'], array_keys($execution['par_fournisseur']));
        self::assertSame([$n, 1, 1, $compteurs['cout_microusd']], [$execution['par_voie']['directe']['appels'],
            $execution['par_voie']['directe']['pannes'], $execution['par_voie']['directe']['tronques'],
            $execution['par_voie']['directe']['cout_microusd']]);
        self::assertSame(1, $execution['par_modele'][$reglage['modele']]['tronques']);
        self::assertSame(['appels' => 3, 'pannes' => 1, 'tronques' => 1,
                          'cout_microusd' => 2 * $config->coutMicrousd($reglage['modele'], 100, 20)
                              + $config->coutMicrousd($reglage['modele'], 100, $reglage['budget_sortie'])],
            $compteurs['par_etape']['greffier']);
        self::assertSame(0, $compteurs['par_etape']['tagger']['tronques'] ?? null);
        self::assertSame(['faisceaux', 'journees/J1', 'journees/J3'], $this->cles($id));

        $suivant = $this->nouveauRun(['lecteurs' => ['a'], 'etapes' => ['greffier']]);
        $http2 = new FakeMultiHttpClient(static fn (array $r): array =>
            ['body' => FakeMultiHttpClient::message('vu ' . FakeMultiHttpClient::appel($r))]);
        $this->jusquAuBout($http2);
        self::assertSame(['journees/J2/tags_a_P1.json', $coupe, 'fusion'],
            array_map([FakeMultiHttpClient::class, 'appel'], $http2->requests), 'le run suivant la réinstruit');
        self::assertSame(['faisceaux', 'journees/J1', 'journees/J2', 'journees/J3'], $this->cles($suivant));
    }

    /** The key is read as each call leaves; without one, the run waits, it does not fail. */
    public function testTheKeyIsReadAsEachCallLeaves(): void
    {
        $id = $this->nouveauRun();
        $http = new FakeMultiHttpClient(static fn (array $r): array => ['body' => FakeMultiHttpClient::message('vu')]);
        TestDb::setEnv('ANTHROPIC_API_KEY', '');
        (new Tick($this->pdo, ['budgetSeconds' => 1, 'twin9Sender' => new DirectCalls($http)]))->run();
        self::assertSame([], $http->requests);
        $stmt = $this->pdo->prepare('SELECT statut, attente FROM twin9_runs WHERE id = ?');
        $stmt->execute([$id]);
        self::assertSame(['statut' => 'en_cours', 'attente' => 'clé Anthropic indisponible'], $stmt->fetch());

        TestDb::setEnv('ANTHROPIC_API_KEY', 'sk-ant-nouvelle-cle');
        $this->jusquAuBout($http);
        self::assertSame(['sk-ant-nouvelle-cle'], array_values(array_unique(array_map(
            static fn (array $r): string => $r['headers']['x-api-key'], $http->requests))));
    }

    /** One day abreast: its calls only are in flight, the next day waits until it is done. */
    public function testTheDaysLedAbreast(): void
    {
        $this->nouveauRun([], ['/parallelisme/journees' => 1]);
        $http = new FakeMultiHttpClient(static fn (array $r): array =>
            ['body' => FakeMultiHttpClient::message('vu'), 'delai' => 0.02]);
        $this->jusquAuBout($http);
        $jours = array_map(static fn (array $r): string => explode('/', FakeMultiHttpClient::appel($r) . '/')[1],
            array_slice($http->requests, 0, 12));
        self::assertSame(['J1', 'J1', 'J1', 'J1', 'J2', 'J2', 'J2', 'J2', 'J3', 'J3', 'J3', 'J3'], $jours);
    }

    /**
     * P0-4: a pass is played again only when the calls already known cannot
     * fill the places the answers free. Two places, the answers one at a
     * time: fewer passes than calls — before, each answer brought one —, the
     * same calls, each once, and the outputs of a run that sends every call
     * of a pass at once, byte for byte.
     */
    public function testAPassIsPlayedAgainOnlyWhenTheKnownCallsCannotFillAPlace(): void
    {
        $reference = $this->nouveauRun([], ['/parallelisme/appels_directs' => 32], sortie: 'twin9/runs/rejeu');
        $this->jusquAuBout(new FakeMultiHttpClient(static fn (array $r): array =>
            ['body' => FakeMultiHttpClient::message('vu ' . FakeMultiHttpClient::appel($r))]));

        $id = $this->nouveauRun([], ['/parallelisme/appels_directs' => 2], user: $this->utilisateur('deux@example.test'),
            sortie: 'twin9/runs/rejeu');
        $n = 0;
        // each call a little longer than the one before: two calls in flight never end together
        $http = new FakeMultiHttpClient(static function (array $r) use (&$n): array {
            return ['body' => FakeMultiHttpClient::message('vu ' . FakeMultiHttpClient::appel($r)), 'delai' => 0.02 * ++$n];
        });
        $runs = new RunRepository($this->pdo);
        $passes = 0;
        $moteurMs = 0;
        $appels = 0;
        for ($t = 0; $t < 10 && $runs->statut($id) === 'en_cours'; $t++) {
            $c = (new Tick($this->pdo, ['budgetSeconds' => 5, 'twin9Sender' => new DirectCalls($http)]))->run();
            $passes += $c['twin9Passes'];
            $moteurMs += $c['twin9MoteurMs'];
            $appels += $c['twin9Appels'];
        }

        self::assertSame('termine', $runs->statut($id));
        $envoyes = array_map([FakeMultiHttpClient::class, 'appel'], $http->requests);
        self::assertCount(13, $envoyes);
        self::assertSame(array_values(array_unique($envoyes)), $envoyes, 'aucun appel en double');
        self::assertSame(13, $appels);
        self::assertLessThan($appels, $passes, 'une passe par réponse, avant P0-4');
        self::assertSame($runs->sorties($reference), $runs->sorties($id), 'les sorties, à l\'octet');

        // P0-1: the run keeps its passes and the engine's time, slice after slice, its final pass included
        $stmt = $this->pdo->prepare('SELECT passes, moteur_ms FROM twin9_runs WHERE id = ?');
        $stmt->execute([$id]);
        self::assertSame([$passes, $moteurMs], array_map(intval(...), $stmt->fetch(PDO::FETCH_NUM)));
        $execution = $runs->execution($id);
        self::assertSame([$passes, $moteurMs, 'fige'], [$execution->passes, $execution->moteur_ms, $execution->source]);
    }

    /**
     * P0-4, where a sending sets `plein` (Twin9Slice::envoyer): when a call
     * the run knows is still to look at — of a day abreast or not — and no
     * place is left; never when the calls it knows ran out, even the last
     * one taking the last place: the next answer then brings a pass while
     * the others fly. The fake engine's first pass knows six calls, two
     * readings of each of its three days.
     */
    public function testASendingIsFullOnlyWhenAKnownCallFindsNoPlace(): void
    {
        self::assertSame([2, true], $this->premierEnvoi(['/parallelisme/appels_directs' => 2]), 'des appels restent');
        self::assertSame([2, true], $this->premierEnvoi(['/parallelisme/appels_directs' => 2, '/parallelisme/journees' => 1]),
            'ceux des journées qui ne sont pas de front comptent');
        self::assertSame([6, false], $this->premierEnvoi(['/parallelisme/appels_directs' => 6]),
            'le dernier appel connu a pris la dernière place');
        self::assertSame([6, false], $this->premierEnvoi(['/parallelisme/appels_directs' => 7]), 'une place reste');
    }

    /**
     * One run at a time on a map: the second waits for the first, then takes
     * its days back from the memory, the same settings being the same
     * fingerprint; other call settings play the days again.
     */
    public function testOneRunAtATimeOnAMapAndTheFingerprintOfTheSettings(): void
    {
        $premier = $this->nouveauRun();
        $second = $this->nouveauRun();
        $http = new FakeMultiHttpClient(static fn (array $r): array =>
            ['body' => FakeMultiHttpClient::message('vu'), 'delai' => 0.02]);
        $this->jusquAuBout($http, options: ['twin9Runs' => 2]);

        self::assertSame('termine', (new RunRepository($this->pdo))->statut($premier));
        self::assertSame('termine', (new RunRepository($this->pdo))->statut($second));
        $appels = array_map([FakeMultiHttpClient::class, 'appel'], $http->requests);
        self::assertCount(14, $appels, 'le second ne refait que sa fusion');
        self::assertSame(['fusion', 'fusion'], array_slice($appels, 12));

        $troisieme = $this->nouveauRun([], ['/etapes/greffier' => (object) ['modele' => 'claude-sonnet-5-5']]);
        $http3 = new FakeMultiHttpClient(static fn (array $r): array => ['body' => FakeMultiHttpClient::message('vu')]);
        $this->jusquAuBout($http3);
        self::assertCount(13, $http3->requests, 'd\'autres réglages d\'appel relisent les journées');
        self::assertSame('termine', (new RunRepository($this->pdo))->statut($troisieme));
    }

    /** @return array<string, string> the fake templates, each prompt opening with $lettre */
    private static function prefixes(string $lettre): array
    {
        return array_map(static fn (string $g): string => $lettre . $g, self::GABARITS);
    }

    /** @return int the ticks it took */
    private function jusquAuBout(FakeMultiHttpClient $http, int $budget = 2, int $max = 30, array $options = []): int
    {
        $runs = new RunRepository($this->pdo);
        for ($n = 1; $n <= $max; $n++) {
            $debut = microtime(true);
            $compteurs = (new Tick($this->pdo, ['budgetSeconds' => $budget, 'twin9Sender' => new DirectCalls($http),
                                                'twin9Pauses' => [0.05, 0.1]] + $options))->run();
            self::assertLessThanOrEqual($budget, microtime(true) - $debut, 'la tranche tient dans sa durée');
            self::assertFalse($compteurs['locked']);
            $enCours = (int) $this->pdo->query('SELECT COUNT(*) FROM twin9_runs WHERE statut = "en_cours"')->fetchColumn();
            if ($enCours === 0) {
                return $n;
            }
        }
        self::fail("le run n'est pas allé au bout en $max tranches");
    }

    /** @param array<string, mixed> $moteur @param array<string, mixed> $profil @param string|null $sortie the run's output, drawn at random by default */
    private function nouveauRun(array $moteur = [], array $profil = [], ?int $user = null, ?array $gabarits = null,
                         string $portfolio = self::PORTFOLIO, ?string $sortie = null): int
    {
        return (new RunRepository($this->pdo))->creer(
            $user ?? $this->user,
            $this->profil($profil),
            (object) ($moteur + ['lecteurs' => ['a', 'b'], 'etapes' => ['greffier', 'president'], 'fusion' => true]),
            'journal-factice.md',
            $portfolio,
            'journal-factice',
            $gabarits ?? self::GABARITS,
            new \DateTimeImmutable('2026-10-18T12:00:00+00:00'),
            $sortie,
        );
    }

    /** The v9.8 profile, by the direct lane, with these changes (JSON pointer => value). @param array<string, mixed> $changes */
    private function profil(array $changes = []): stdClass
    {
        $profil = ProfilRepository::v98();
        $profil->voie = 'directe';
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

    /**
     * A new run's first pass and first sending, played by a slice as
     * advanceUntil() plays them; no answer comes back.
     *
     * @param array<string, mixed> $profil
     * @return array{int, bool} its calls in flight, and whether its sending took every place
     */
    private function premierEnvoi(array $profil): array
    {
        $id = $this->nouveauRun([], $profil, user: $this->utilisateur('plein-' . bin2hex(random_bytes(4)) . '@example.test'));
        $config = new Twin9Config(new SettingsRepository($this->pdo));
        $tranche = new Twin9Slice($this->pdo, new DirectCalls(new FakeMultiHttpClient(static fn (array $r): array =>
            ['body' => FakeMultiHttpClient::message('vu'), 'delai' => 60.0])), new RunKey($this->pdo, $config), $config,
            new FakeBatchApi(static fn (array $r): array => FakeBatchApi::message('vu')));
        $maintenant = microtime(true);
        foreach (['debut' => $maintenant, 'fin' => $maintenant + 30.0, 'dernierDepart' => $maintenant + 25.0,
                  'compteurs' => ['passes' => 0, 'moteurMs' => 0, 'appels' => 0, 'reprises' => 0]] as $champ => $valeur) {
            (new \ReflectionProperty(Twin9Slice::class, $champ))->setValue($tranche, $valeur);
        }
        $prive = static fn (string $methode, mixed ...$arguments): mixed =>
            (new \ReflectionMethod(Twin9Slice::class, $methode))->invoke($tranche, ...$arguments);
        $run = $prive('ouvrir', $id);
        self::assertInstanceOf(Twin9Run::class, $run);
        $prive('passer', $run);
        self::assertCount(6, $run->attendus, 'la première passe connaît six appels');
        $prive('envoyer', $run);

        return [\count($run->enVol), $run->plein];
    }

    /** The engine's passes a run has counted (twin9_runs.passes). */
    private function passes(int $run): int
    {
        $stmt = $this->pdo->prepare('SELECT passes FROM twin9_runs WHERE id = ?');
        $stmt->execute([$run]);

        return (int) $stmt->fetchColumn();
    }

    /** @return list<string> the keys of a run's map */
    private function cles(int $run): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT m.cle FROM twin9_memoire m JOIN twin9_runs r ON r.carte_id = m.carte_id WHERE r.id = ? ORDER BY m.cle'
        );
        $stmt->execute([$run]);

        return $stmt->fetchAll(PDO::FETCH_COLUMN);
    }

    private function utilisateur(string $email): int
    {
        $this->pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([$email, 'x', $email]);
        $id = (int) $this->pdo->lastInsertId();
        // the instance's key pays from its owner's credits (T10)
        (new CreditService($this->pdo))->adjust($id, 1_000_000_000, 'crédit des tests');

        return $id;
    }
}
