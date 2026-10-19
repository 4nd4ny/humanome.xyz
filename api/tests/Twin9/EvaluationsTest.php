<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\MigrationRunner;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\TestDb;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\DirectCalls;
use Humanome\Twin9\EngineLoader;
use Humanome\Twin9\Evaluations;
use Humanome\Twin9\Lancement;
use Humanome\Twin9\ProfilRepository;
use Humanome\Twin9\RunRepository;
use Humanome\Twin9\Twin9Config;
use Humanome\Worker\Tick;
use PDO;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunTestsInSeparateProcesses;
use PHPUnit\Framework\TestCase;
use stdClass;

/**
 * The evaluations Twin9 runs leave, to foresee the next ones (T8, the
 * strategy A, Christian's decision of 2026-10-19): a run done leaves the size
 * of each day of its map with what it paid for it, what its merge cost, the
 * largest worst case its calls held, its final cost, its duration and the
 * settings of its profile, never its content; the person's id goes with
 * their account. The forecasts read them as a fixed part and a part by
 * kilobyte, neither below zero, at the least, on average and at the most,
 * converted to a lane and a margin. The fake engine of
 * tests/fixtures/twin9-factice, a simulated Anthropic. Each test runs in a
 * process of its own.
 */
#[RunTestsInSeparateProcesses]
#[PreserveGlobalState(false)]
final class EvaluationsTest extends TestCase
{
    private const GABARITS = [
        'factice/lecture' => "[appel:{\$APPEL}] Lis la journée {\$JOUR} en lecteur {\$LECTEUR} :\n{\$TEXTE}",
        'factice/etape' => "[appel:{\$APPEL}] Étape {\$ETAPE} de {\$JOUR}, après : {\$PRECEDENT}",
        'factice/fusion' => "[appel:{\$APPEL}] Fusionne :\n{\$JOURS}",
    ];

    private const PORTFOLIO = "## J1\nPremier jour : le capteur monté.\n## J2\nDeuxième jour.\n## J3\nTroisième jour, plus long que les autres.\n";

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
        $this->pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute(['apprenant@example.test', 'x', 'Apprenant']);
        $this->user = (int) $this->pdo->lastInsertId();
        (new CreditService($this->pdo))->adjust($this->user, 1_000_000_000, 'crédit des tests');
    }

    protected function tearDown(): void
    {
        TestDb::restoreEnv();
    }

    /**
     * Christian's list: the person evaluated, the size in kilobytes of each
     * day, the models and performance chosen, the final cost; with what each
     * day and the merge cost, the largest worst case a call of a day and of
     * the merge held, and nothing of the content. A day taken back from the
     * memory costs nothing; the days the memory keeps beyond those a run
     * takes are in its map; a day where a call failed says so; the account
     * erased, its rows stay, no longer anyone's.
     */
    public function testARunDoneLeavesItsEvaluationWithoutItsContent(): void
    {
        $http = self::anthropic();
        $premier = $this->nouveauRun(self::PORTFOLIO);
        $this->jusquAuBout($http);

        $e = $this->evaluation($premier);
        $runs = new RunRepository($this->pdo);
        $compteurs = $runs->compteursDe($premier);
        $profil = $this->profil();
        self::assertSame($this->user, $e['user_id']);
        self::assertSame(Evaluations::signature($profil, Lancement::empreinte(self::GABARITS)), $e['signature']);
        $parJour = $this->couts($http->requests);
        self::assertEquals([
            ['ko' => round(\strlen('Premier jour : le capteur monté.') / 1024, 2), 'cout_microusd' => $parJour['J1']],
            ['ko' => round(\strlen('Deuxième jour.') / 1024, 2), 'cout_microusd' => $parJour['J2']],
            ['ko' => round(\strlen('Troisième jour, plus long que les autres.') / 1024, 2), 'cout_microusd' => $parJour['J3']],
        ], $e['journees']);
        self::assertSame($parJour['J1'] + $parJour['J2'] + $parJour['J3'], $e['cout_journees_microusd']);
        self::assertSame($parJour['fusion'], $e['cout_fusion_microusd']);
        self::assertSame($compteurs['cout_microusd'], $e['cout_microusd'], 'le coût final, ce que l’apprenant a payé');
        self::assertSame($compteurs['duree_s'], $e['duree_s']);
        $pireCas = $this->piresCas($http->requests);
        self::assertSame([$pireCas['journee'], $pireCas['fusion']],
            [$e['pire_cas_journee_microusd'], $e['pire_cas_fusion_microusd']], 'le plus grand pire cas d’un appel');
        $config = new Twin9Config(new SettingsRepository($this->pdo));
        // MySQL's JSON keeps an object's keys in its own order
        self::assertEquals(['mode' => 'complet', 'voie' => 'directe', 'cle' => 'instance', 'marge' => $config->marge(),
                            'referentiel' => 'respire', 'version_referentiel' => '7.0.0', 'gabarits' => $profil->gabarits,
                            'empreinte_gabarits' => Lancement::empreinte(self::GABARITS)],
            array_intersect_key($e['reglages'], array_flip(['mode', 'voie', 'cle', 'marge', 'referentiel',
                'version_referentiel', 'gabarits', 'empreinte_gabarits'])));
        self::assertEquals(json_decode(json_encode($profil->etages), true), $e['reglages']['etages'],
            'les modèles et la performance de chaque étage');
        self::assertCount(\count($profil->college), $e['reglages']['lecteurs']);
        self::assertEquals(json_decode(json_encode($profil->jury), true), $e['reglages']['jury'],
            'les paramètres de l’algorithme');
        foreach (['Premier jour', 'Deuxième', 'capteur', 'journal-factice', 'J1'] as $contenu) {
            self::assertStringNotContainsString($contenu, json_encode($e, JSON_UNESCAPED_UNICODE), 'aucun contenu');
        }

        // a day added: the others are taken back from the memory, without a call
        $second = $this->nouveauRun(self::PORTFOLIO . "## J4\nUn jour de plus.\n");
        $this->jusquAuBout($http);
        $journees = $this->evaluation($second)['journees'];
        self::assertSame([null, null, null], array_column(\array_slice($journees, 0, 3), 'cout_microusd'));
        self::assertGreaterThan(0, $journees[3]['cout_microusd']);

        // its first day only, a new one: the map keeps the four others, from the memory, which its merge reads
        $troisieme = $this->nouveauRun("## J0\nLa veille.\n" . self::PORTFOLIO . "## J4\nUn jour de plus.\n", 1);
        $this->jusquAuBout($http);
        $journees = $this->evaluation($troisieme)['journees'];
        self::assertSame([Evaluations::ko(\strlen('La veille.')), Evaluations::ko(\strlen('Premier jour : le capteur monté.')),
                          Evaluations::ko(\strlen('Deuxième jour.')), Evaluations::ko(\strlen('Troisième jour, plus long que les autres.')),
                          Evaluations::ko(\strlen('Un jour de plus.'))], array_column($journees, 'ko'));
        self::assertSame([true, false, false, false, false], array_map(static fn (array $j): bool => $j['cout_microusd'] !== null,
            $journees), 'la journée prise seule a coûté');

        // a day where a call failed says so: the next run maps it again
        $panne = new FakeMultiHttpClient(static fn (array $r): array => FakeMultiHttpClient::appel($r) === 'journees/J5/1-greffier.md'
            ? ['status' => 500, 'body' => '{"type":"error"}'] : ['body' => FakeMultiHttpClient::message('vu ' . FakeMultiHttpClient::appel($r))]);
        $quatrieme = $this->nouveauRun("## J0\nLa veille.\n" . self::PORTFOLIO . "## J4\nUn jour de plus.\n## J5\nEncore un.\n");
        $this->jusquAuBout($panne);
        $journees = $this->evaluation($quatrieme)['journees'];
        self::assertSame(['ko' => Evaluations::ko(\strlen('Encore un.')), 'panne' => true],
            array_diff_key(end($journees), ['cout_microusd' => 1]));
        self::assertArrayNotHasKey('panne', $journees[0]);

        // the account erased: the rows stay, for the forecasts, no longer anyone's
        $this->pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$this->user]);
        self::assertSame([null, null, null, null], array_map(static fn (array $r): ?int => $r['user_id'] === null ? null
            : (int) $r['user_id'], $this->pdo->query('SELECT user_id FROM twin9_evaluations ORDER BY id')->fetchAll()));
    }

    /** A failure to record its evaluation never keeps a run from ending; the log names the run, nothing else. */
    public function testAFailureToRecordItsEvaluationNeverKeepsARunFromEnding(): void
    {
        $id = $this->nouveauRun(self::PORTFOLIO);
        // its row already there: the evaluation's insert fails
        $this->inserer('ffffffffffffffff', ['voie' => 'directe', 'marge' => 1.0], [], 0, 0, run: $id);
        $log = (string) tempnam(sys_get_temp_dir(), 'twin9-log');
        ini_set('error_log', $log);
        $this->jusquAuBout(self::anthropic());
        self::assertStringEndsWith('[twin9] évaluation du run ' . $id . ' non consignée : PDOException' . PHP_EOL,
            (string) file_get_contents($log));
        unlink($log);
        self::assertSame('termine', (new RunRepository($this->pdo))->statut($id));
        self::assertSame(['ffffffffffffffff'], $this->pdo->query('SELECT signature FROM twin9_evaluations')->fetchAll(PDO::FETCH_COLUMN));
        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM twin9_appels')->fetchColumn(), 'son journal effacé');
    }

    /**
     * The forecast: a day costs a fixed part and a part by kilobyte, a merge
     * the same by the kilobytes of its map, by least squares over the latest
     * evaluations of the signature, each converted to the lane and the margin
     * foreseen (half price by batches); between the sizes observed, at the
     * least and at the most by the gaps observed; beyond them, what a fixed
     * part and a part by kilobyte, neither below zero, allow. The largest
     * worst case of a call; the seconds of a day, by direct calls; another
     * signature, none.
     */
    public function testTheForecastIsAFixedPartAndAPartByKilobyte(): void
    {
        $evaluations = new Evaluations($this->pdo);
        $this->inserer('aaaaaaaaaaaaaaaa', ['voie' => 'directe', 'marge' => 1.0],
            [['ko' => 1.0, 'cout_microusd' => 100], ['ko' => 2.0, 'cout_microusd' => 150],
             ['ko' => 3.0, 'cout_microusd' => 200]], 400, 30, 500, 700);
        // by batches, the margin 1.2: 60 there is 100 here, by direct calls without margin; its map, 2 kB for 200
        $this->inserer('aaaaaaaaaaaaaaaa', ['voie' => 'lots', 'marge' => 1.2], [['ko' => 2.0, 'cout_microusd' => 60]], 120, 900,
            600, 300);

        $direct = $evaluations->modele('aaaaaaaaaaaaaaaa', false, 1.0);
        self::assertSame(2, $direct['evaluations']);
        self::assertEqualsWithDelta(['fixe' => 37.5, 'par_ko' => 50.0, 'ecart_min' => -37.5, 'ecart_max' => 12.5,
                                     'ko_min' => 1.0, 'ko_max' => 3.0], $direct['journee'], 0.0001);
        self::assertEqualsWithDelta(['fixe' => 100.0, 'par_ko' => 50.0, 'ecart_min' => 0.0, 'ecart_max' => 0.0,
                                     'ko_min' => 2.0, 'ko_max' => 6.0], $direct['fusion'], 0.0001);
        self::assertEqualsWithDelta(['journee' => 1000.0, 'fusion' => 700.0], $direct['pire_cas'], 0.0001,
            'le plus grand pire cas d’un appel, converti');
        self::assertSame(10.0, $direct['secondes_par_journee'], 'les journées par appels directs seulement');
        // between the sizes observed: the line and its gaps
        self::assertEqualsWithDelta(['min' => 125.0, 'moyenne' => 162.5, 'max' => 175.0],
            Evaluations::selon($direct['journee'], 2.5), 0.0001, 'une journée de 2,5 Ko');
        // above: at least what the largest cost, at most as much again by kilobyte
        self::assertEqualsWithDelta(['min' => 150.0, 'moyenne' => 237.5, 'max' => 200.0 * 4 / 3],
            Evaluations::selon($direct['journee'], 4.0), 0.0001, 'une journée de 4 Ko');
        self::assertEqualsWithDelta(['min' => 400.0, 'moyenne' => 600.0, 'max' => 400.0 * 10 / 6],
            Evaluations::selon($direct['fusion'], 10.0), 0.0001, 'la fusion d’une carte de 10 Ko');
        // below: at most what the smallest cost, at least its share by kilobyte
        self::assertEqualsWithDelta(['min' => 25.0, 'moyenne' => 62.5, 'max' => 100.0],
            Evaluations::selon($direct['journee'], 0.5), 0.0001, 'une journée d’un demi-Ko');
        self::assertEqualsWithDelta(['min' => 100.0, 'moyenne' => 150.0, 'max' => 200.0],
            Evaluations::selon($direct['fusion'], 1.0), 0.0001, 'la fusion d’une carte d’un Ko');

        $parLots = $evaluations->modele('aaaaaaaaaaaaaaaa', true, 1.2);
        foreach (['journee', 'fusion'] as $quoi) {
            foreach (['fixe', 'par_ko', 'ecart_min', 'ecart_max'] as $k) {
                self::assertEqualsWithDelta($direct[$quoi][$k] * 0.6, $parLots[$quoi][$k], 0.0001, "$quoi $k");
            }
            self::assertEqualsWithDelta($direct['pire_cas'][$quoi] * 0.6, $parLots['pire_cas'][$quoi], 0.0001);
        }

        // a bigger day that cost less: the cost does not grow with the size, their average
        $this->inserer('bbbbbbbbbbbbbbbb', ['voie' => 'directe', 'marge' => 1.0], [['ko' => 1.0, 'cout_microusd' => 200],
            ['ko' => 3.0, 'cout_microusd' => 100]], 1, 1);
        self::assertEqualsWithDelta(['fixe' => 150.0, 'par_ko' => 0.0, 'ecart_min' => -50.0, 'ecart_max' => 50.0,
                                     'ko_min' => 1.0, 'ko_max' => 3.0],
            $evaluations->modele('bbbbbbbbbbbbbbbb', false, 1.0)['journee'], 0.0001);
        // a fixed part below zero: the cost by kilobyte alone
        $this->inserer('eeeeeeeeeeeeeeee', ['voie' => 'directe', 'marge' => 1.0], [['ko' => 1.0, 'cout_microusd' => 10],
            ['ko' => 2.0, 'cout_microusd' => 100]], 1, 1);
        self::assertEqualsWithDelta(['fixe' => 0.0, 'par_ko' => 42.0, 'ecart_min' => -32.0, 'ecart_max' => 16.0,
                                     'ko_min' => 1.0, 'ko_max' => 2.0],
            $evaluations->modele('eeeeeeeeeeeeeeee', false, 1.0)['journee'], 0.0001);
        // a single size says nothing of the split: half of each; beyond it, what either allows
        $this->inserer('cccccccccccccccc', ['voie' => 'directe', 'marge' => 1.0], [['ko' => 2.0, 'cout_microusd' => 100]], 1, 1);
        $seul = $evaluations->modele('cccccccccccccccc', false, 1.0)['journee'];
        self::assertEqualsWithDelta(['fixe' => 50.0, 'par_ko' => 25.0, 'ecart_min' => 0.0, 'ecart_max' => 0.0,
                                     'ko_min' => 2.0, 'ko_max' => 2.0], $seul, 0.0001);
        self::assertEqualsWithDelta(['min' => 50.0, 'moyenne' => 75.0, 'max' => 100.0], Evaluations::selon($seul, 1.0), 0.0001);
        self::assertEqualsWithDelta(['min' => 100.0, 'moyenne' => 150.0, 'max' => 200.0], Evaluations::selon($seul, 4.0), 0.0001);
        // the same size three times, whatever the rounding of their mean: a single size
        $this->inserer('9999999999999999', ['voie' => 'directe', 'marge' => 1.0], [['ko' => 15.57, 'cout_microusd' => 100],
            ['ko' => 15.57, 'cout_microusd' => 110], ['ko' => 15.57, 'cout_microusd' => 90]], 1, 1);
        self::assertEqualsWithDelta(['fixe' => 50.0, 'par_ko' => 50.0 / 15.57, 'ecart_min' => -10.0, 'ecart_max' => 10.0,
                                     'ko_min' => 15.57, 'ko_max' => 15.57],
            $evaluations->modele('9999999999999999', false, 1.0)['journee'], 0.0001);
        // a day where a call failed is left out
        $this->inserer('8888888888888888', ['voie' => 'directe', 'marge' => 1.0], [['ko' => 1.0, 'cout_microusd' => 100],
            ['ko' => 2.0, 'cout_microusd' => 5, 'panne' => true]], 1, 1);
        self::assertSame([1.0, 1.0], [$evaluations->modele('8888888888888888', false, 1.0)['journee']['ko_min'],
                                      $evaluations->modele('8888888888888888', false, 1.0)['journee']['ko_max']]);
        self::assertNull($evaluations->modele('dddddddddddddddd', false, 1.0));
        // the latest only
        for ($n = 0; $n <= Evaluations::RECENTES; $n++) {
            $this->inserer('7777777777777777', ['voie' => 'directe', 'marge' => 1.0], [['ko' => 1.0, 'cout_microusd' => $n]], 1, 1);
        }
        self::assertSame(Evaluations::RECENTES, $evaluations->modele('7777777777777777', false, 1.0)['evaluations']);
        self::assertSame(-99.5, $evaluations->modele('7777777777777777', false, 1.0)['journee']['ecart_min'],
            'la plus ancienne, 0, laissée de côté : de 1 à 200, autour de 100,5');

        // a profile's signature: all its calls depend on, but its lane, its key, its caps and its parallelism
        $profil = $this->profil();
        $jeu = Lancement::empreinte(self::GABARITS);
        $autre = json_decode(json_encode($profil));
        $autre->voie = 'lots';
        $autre->cle = 'personnelle';
        $autre->budget_usd = 3.0;
        $autre->duree_minutes = 30;
        $autre->parallelisme->journees = 2;
        self::assertSame(Evaluations::signature($profil, $jeu), Evaluations::signature($autre, $jeu));
        foreach ([static fn (stdClass $p) => $p->etages->profond->effort = 'low',
                  static fn (stdClass $p) => $p->gabarits = 'defaut',
                  static fn (stdClass $p) => $p->referentiel->version = '7.1.0',
                  static fn (stdClass $p) => $p->scan_global->enabled = !$p->scan_global->enabled,
                  static fn (stdClass $p) => $p->jury = (object) ((array) $p->jury + ['autre' => 1])] as $n => $changer) {
            $autre = json_decode(json_encode($profil));
            $changer($autre);
            self::assertNotSame(Evaluations::signature($profil, $jeu), Evaluations::signature($autre, $jeu), (string) $n);
        }
        self::assertNotSame(Evaluations::signature($profil, $jeu),
            Evaluations::signature($profil, Lancement::empreinte(['factice/fusion' => 'Un gabarit changé.'] + self::GABARITS)),
            'un jeu de gabarits changé');
    }

    /**
     * @param array<string, mixed> $reglages
     * @param list<array{ko: float|null, cout_microusd: int|null, panne?: bool}> $journees
     * @param int|null $run its run; null: one of its own, beyond any run of the test
     */
    private function inserer(string $signature, array $reglages, array $journees, int $fusion, int $dureeS,
                             ?int $pireJour = null, ?int $pireFusion = null, ?int $run = null): void
    {
        $jours = array_sum(array_filter(array_column($journees, 'cout_microusd')));
        static $autre = 1_000_000;
        $this->pdo->prepare(
            'INSERT INTO twin9_evaluations (run_id, user_id, signature, reglages, journees, cout_journees_microusd,
                                            cout_fusion_microusd, pire_cas_journee_microusd, pire_cas_fusion_microusd,
                                            cout_microusd, duree_s) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([$run ?? ++$autre, $this->user, $signature, json_encode($reglages + ['mode' => 'complet']),
                    json_encode($journees), $jours, $fusion, $pireJour, $pireFusion, $jours + $fusion, $dureeS]);
    }

    /** @return array<string, mixed> a run's evaluation, its JSON decoded */
    private function evaluation(int $run): array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM twin9_evaluations WHERE run_id = ?');
        $stmt->execute([$run]);
        $e = $stmt->fetch();
        self::assertIsArray($e, 'une évaluation par run terminé');
        foreach (['reglages', 'journees'] as $json) {
            $e[$json] = json_decode((string) $e[$json], true, 64, JSON_THROW_ON_ERROR);
        }
        foreach (['user_id', 'cout_journees_microusd', 'cout_fusion_microusd', 'pire_cas_journee_microusd',
                  'pire_cas_fusion_microusd', 'cout_microusd', 'duree_s'] as $n) {
            $e[$n] = $e[$n] === null ? null : (int) $e[$n];
        }

        return $e;
    }

    /**
     * What each day's calls and the merge's cost, from the requests answered,
     * margin included.
     *
     * @param list<array<string, mixed>> $requetes
     * @return array<string, int>
     */
    private function couts(array $requetes): array
    {
        $config = new Twin9Config(new SettingsRepository($this->pdo));
        $couts = [];
        foreach ($requetes as $r) {
            $appel = FakeMultiHttpClient::appel($r);
            $ou = str_starts_with($appel, 'journees/') ? explode('/', $appel)[1] : 'fusion';
            $couts[$ou] = ($couts[$ou] ?? 0) + (int) $config->coutMicrousd((string) $r['body']['model'],
                intdiv(\strlen((string) $r['body']['messages'][0]['content']), 2), 1000);
        }

        return $couts;
    }

    /**
     * The largest worst case a call of a day, and of the merge, held: its
     * prompt's bytes in, its output budget out, margin included (T10).
     *
     * @param list<array<string, mixed>> $requetes
     * @return array{journee: int, fusion: int}
     */
    private function piresCas(array $requetes): array
    {
        $config = new Twin9Config(new SettingsRepository($this->pdo));
        $pires = ['journee' => 0, 'fusion' => 0];
        foreach ($requetes as $r) {
            $ou = str_starts_with(FakeMultiHttpClient::appel($r), 'journees/') ? 'journee' : 'fusion';
            $pires[$ou] = max($pires[$ou], max(1, (int) $config->coutMicrousd((string) $r['body']['model'],
                \strlen((string) $r['body']['messages'][0]['content']), (int) $r['body']['max_tokens'])));
        }

        return $pires;
    }

    /** Anthropic, answering each call: half its prompt's bytes in, 1,000 tokens out. */
    private static function anthropic(): FakeMultiHttpClient
    {
        return new FakeMultiHttpClient(static function (array $r): array {
            $message = FakeMultiHttpClient::message('vu ' . FakeMultiHttpClient::appel($r), (string) $r['body']['model']);
            $message['usage'] = ['input_tokens' => intdiv(\strlen((string) $r['body']['messages'][0]['content']), 2),
                                 'output_tokens' => 1000];

            return ['body' => $message, 'delai' => 0.02];
        });
    }

    private function jusquAuBout(FakeMultiHttpClient $http): void
    {
        for ($n = 0; $n < 30; $n++) {
            (new Tick($this->pdo, ['budgetSeconds' => 2, 'twin9Sender' => new DirectCalls($http),
                                   'twin9Pauses' => [0.05, 0.1]]))->run();
            if ((int) $this->pdo->query('SELECT COUNT(*) FROM twin9_runs WHERE statut = "en_cours"')->fetchColumn() === 0) {
                self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM twin9_runs WHERE statut <> "termine"')
                    ->fetchColumn());

                return;
            }
        }
        self::fail('le run ne va pas au bout');
    }

    /** @param int|null $jours its first days only */
    private function nouveauRun(string $portfolio, ?int $jours = null): int
    {
        return (new RunRepository($this->pdo))->creer(
            $this->user,
            $this->profil(),
            (object) ['lecteurs' => ['a', 'b'], 'etapes' => ['greffier', 'president'], 'fusion' => true, 'jours' => $jours],
            'journal-factice.md',
            $portfolio,
            'journal-factice',
            self::GABARITS,
            new \DateTimeImmutable('2026-10-18T12:00:00+00:00'),
        );
    }

    /** The v9.8 profile, by direct calls, its referential's version frozen. */
    private function profil(): stdClass
    {
        $profil = ProfilRepository::v98();
        $profil->voie = 'directe';
        $profil->referentiel->version = '7.0.0';

        return ProfilRepository::validate($profil);
    }
}
