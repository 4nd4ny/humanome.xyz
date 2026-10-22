<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\MigrationRunner;
use Humanome\Referentiel\ReferentielRepository;
use Humanome\Tests\TestDb;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\EngineLoader;
use Humanome\Twin9\MapStore;
use Humanome\Twin9\MoteurReglages;
use Humanome\Twin9\ProfilRepository;
use Humanome\Twin9\ReferentielMoteur;
use Humanome\Twin9\RunRepository;
use Humanome\Worker\Tick;
use PDO;
use PHPUnit\Framework\TestCase;
use stdClass;

/**
 * The greffier's stigmergy through the platform (Twin_v9's
 * docs/twin9/spec-stigmergie.md §6, §9, §11.3): two runs of a map, by the
 * tick, in slices, answers in a shuffled order, the MySQL journal and
 * memory, the engine of TWIN_V9_DIR — the oracle's 16-test-mode, its
 * settings those of the oracle with the stigmergy and the layers of the
 * trial preset (ProfilRepository::predefini('stigmergie'), MoteurReglages).
 *
 * The first analysis of a map reads no trace: its calls are the oracle's,
 * prompt for prompt, its outputs too, but for the day map's stigmergy
 * block, its last key, and its fingerprint; the day's journal enters the
 * map's memory under test/ (the test mode), one analysis. The second run,
 * with rescan, reads the day again: a second analysis, which reads the
 * first, its intensities those the journal replays with the profile's ρ.
 * Without an engine that has the stigmergy, these tests skip; PariteTest is
 * left as it is.
 */
final class StigmergieTest extends TestCase
{
    private const SCENARIO = '16-test-mode';

    private const JOUR = '2026-03-02';

    private static PDO $pdo;

    private static string $dir;

    public static function setUpBeforeClass(): void
    {
        self::$dir = EngineLoader::directory();
        if (!self::moteur()) {
            return;
        }
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
        $doc = json_decode((string) file_get_contents(\dirname(__DIR__, 3) . '/web/public/data/referentiel/respire-v7.json'),
            true, 512, JSON_THROW_ON_ERROR);
        (new ReferentielRepository(self::$pdo))->importPublishedDocument($doc, 'Import initial RESPIRE v7');
        TestDb::fichesRespire(self::$pdo);
    }

    protected function setUp(): void
    {
        if (!self::moteur()) {
            self::markTestSkipped('Twin_v9 absent (TWIN_V9_DIR), ou sans la stigmergie : ni son module ni son oracle ne sont là');
        }
        self::assertTrue(EngineLoader::load());
        TestDb::setEnv('ANTHROPIC_API_KEY', 'sk-ant-stigmergie');
        TestDb::setEnv('WORKER_TICK_BUDGET_SECONDS', '');
    }

    protected function tearDown(): void
    {
        TestDb::restoreEnv();
    }

    public function testTwoRunsOfAMapDepositThenReinforceTheirTraces(): void
    {
        $user = $this->utilisateur('stigmergie@example.test');
        $dir = self::$dir . '/oracle/scenarios/' . self::SCENARIO;
        $record = self::record($dir . '/calls.jsonl');
        $essai = MoteurReglages::depuis(self::profil(), self::referentiel());
        self::assertSame(['enabled' => true, 'evaporation' => 0.3, 'exploration' => 0.2, 'graine' => 1, 'lignes' => 5],
            (array) $essai->config->stigmergie);

        // 1. a new map: the oracle's calls, every one once, under its prompt
        $premier = $this->lancer($user, $record, '2026-10-18T12:00:00', rescan: false, strict: true);
        $envoyes = array_map(static fn (string $k): string => substr($k, strpos($k, ':') + 1), array_keys($premier[1]->envois));
        sort($envoyes, SORT_STRING);
        $attendus = array_keys($record);
        sort($attendus, SORT_STRING);
        self::assertSame($attendus, $envoyes, 'chaque appel de l’oracle, une fois, sous son prompt');

        $sorties = (new RunRepository(self::$pdo))->sorties($premier[0]);
        $scenario = json_decode((string) file_get_contents($dir . '/scenario.json'), false, 512, JSON_THROW_ON_ERROR);
        $carto = 'journees/' . self::JOUR . '/carto_jour.json';
        $chemins = array_map('strval', $scenario->outputs);
        sort($chemins, SORT_STRING);
        self::assertSame($chemins, array_keys($sorties), 'les sorties de l’oracle, rien d’autre');
        foreach ($chemins as $chemin) {
            $oracle = (string) file_get_contents($dir . '/outputs/' . $chemin);
            if ($chemin !== $carto) {
                str_ends_with($chemin, '.json')
                    ? self::assertSame(json_decode($oracle, true, 512, JSON_THROW_ON_ERROR),
                        json_decode($sorties[$chemin], true, 512, JSON_THROW_ON_ERROR), $chemin)
                    : self::assertSame($oracle, $sorties[$chemin], $chemin);
            }
        }
        $jour = json_decode($sorties[$carto], true, 512, JSON_THROW_ON_ERROR);
        self::assertSame('stigmergie', array_key_last($jour), 'le bloc, en dernière clé de la carte du jour');
        $bloc = $jour['stigmergie'];
        $oracle = json_decode((string) file_get_contents($dir . '/outputs/' . $carto), true, 512, JSON_THROW_ON_ERROR);
        self::assertArrayNotHasKey('stigmergie', $oracle);
        self::assertNotSame($oracle['empreinte'], $jour['empreinte'], 'l’empreinte de la carte du jour le compte');
        unset($jour['stigmergie'], $jour['empreinte'], $oracle['empreinte']);
        self::assertSame($oracle, $jour, 'hors le bloc et l’empreinte, la carte du jour de l’oracle');

        // the day's journal, in the map's memory, under test/ (the test mode), one analysis
        $memoire = $this->memoire($premier[0]);
        self::assertSame(['test/stigmergie/' . self::JOUR], $memoire->keys('test/stigmergie/'));
        self::assertSame([], $memoire->keys('stigmergie/'), 'rien hors de test/ en mode essai');
        $journal = json_decode((string) $memoire->read('test/stigmergie/' . self::JOUR), true, 512, JSON_THROW_ON_ERROR);
        self::assertSame(['schema', 'journee', 'texte_empreinte', 'n_analyses', 'analyses'], array_keys($journal));
        self::assertSame(['twin9-stigmergie/1', self::JOUR, 1], [$journal['schema'], $journal['journee'], $journal['n_analyses']]);
        self::assertCount(1, $journal['analyses']);
        $analyse = $journal['analyses'][0];
        self::assertSame(['evaporation' => 0.3, 'exploration' => 0.2, 'graine' => 1, 'lignes' => 5], $analyse['reglages']);
        self::assertNotSame([], $analyse['depots'], 'les passages validés déposent');
        self::assertSame([], $analyse['lues'], 'la première analyse ne lit aucune trace');
        self::assertSame([1, $analyse['run'], $analyse['depots'], $analyse['rejets']],
            [$bloc['analyse'], $bloc['run'], $bloc['depots'], $bloc['rejets']]);
        self::assertSame(self::rejouer($journal['analyses'], 0.3), self::intensites($bloc['traces']));

        // 2. the same map, rescan: the day read again, a second analysis, which reads the first
        $second = $this->lancer($user, $record, '2026-10-18T13:00:00', rescan: true, strict: false);
        self::assertSame($this->carte($premier[0]), $this->carte($second[0]), 'la même carte');
        $journal = json_decode((string) $this->memoire($second[0])->read('test/stigmergie/' . self::JOUR), true, 512,
            JSON_THROW_ON_ERROR);
        self::assertSame(2, $journal['n_analyses']);
        self::assertCount(2, $journal['analyses'], 'une analyse par run, quelles que soient ses passes');
        self::assertNotSame($journal['analyses'][0]['run'], $journal['analyses'][1]['run']);
        $bloc = json_decode((new RunRepository(self::$pdo))->sorties($second[0])[$carto], true, 512,
            JSON_THROW_ON_ERROR)['stigmergie'];
        self::assertSame([2, $journal['analyses'][1]['run']], [$bloc['analyse'], $bloc['run']]);
        $intensites = self::rejouer($journal['analyses'], 0.3);
        self::assertSame($intensites, self::intensites($bloc['traces']), 'τ₂ = 0,7·τ₁ + Δ₂');
        $renforcees = array_filter($bloc['traces'], static fn (array $t): bool => $t['analyses'] === 2);
        self::assertNotSame([], $renforcees, 'des traces déposées aux deux analyses');
    }

    /**
     * A run of the scenario on $user's map, through the tick until its end.
     *
     * @param array<string, array<string, string>> $record
     * @return array{0: int, 1: ReplaySender} the run, and what it sent
     */
    private function lancer(int $user, array $record, string $horloge, bool $rescan, bool $strict): array
    {
        $dir = self::$dir . '/oracle/scenarios/' . self::SCENARIO;
        $scenario = json_decode((string) file_get_contents($dir . '/scenario.json'), false, 512, JSON_THROW_ON_ERROR);
        $commande = $scenario->command;
        $option = static function (string $nom) use ($commande): ?string {
            $i = array_search($nom, $commande, true);

            return $i === false ? null : (string) $commande[$i + 1];
        };
        $essai = MoteurReglages::depuis(self::profil(), self::referentiel());
        // the oracle's settings, with the trial's stigmergy and layers
        $config = $scenario->settings->config;
        $config->stigmergie = $essai->config->stigmergie;
        $config->calques = $essai->config->calques;
        $jours = $option('--jours');
        $moteur = (object) ['config' => $config, 'roster' => $scenario->settings->roster,
                            'jours' => $jours === null ? null : (int) $jours, 'rescan' => $rescan,
                            'test' => isset($scenario->test_mode), 'memoire' => $scenario->state !== 'none',
                            'referentiel' => self::referentiel()];
        $portfolio = self::$dir . '/' . $option('--portfolio');

        self::$pdo->exec('UPDATE twin9_runs SET statut = "annule" WHERE statut = "en_cours"');
        $runs = new RunRepository(self::$pdo);
        $run = $runs->creer($user, self::profil(), $moteur, basename($portfolio), (string) file_get_contents($portfolio),
            pathinfo($portfolio, PATHINFO_FILENAME), self::gabarits(), new \DateTimeImmutable($horloge),
            (string) $option('--out'));
        $envoi = new ReplaySender($record, part: 0.5, strict: $strict);
        for ($tranches = 1; $runs->statut($run) === 'en_cours'; $tranches++) {
            self::assertLessThan(100, $tranches, 'le run ne va pas au bout');
            (new Tick(self::$pdo, ['budgetSeconds' => 5, 'twin9Sender' => $envoi, 'twin9Lots' => new ReplayBatchApi($record),
                                   'twin9Runs' => 1, 'twin9Fenetre' => 0.2]))->run();
        }
        self::assertSame('termine', $runs->statut($run));

        return [$run, $envoi];
    }

    /**
     * The trial preset as a run keeps it: by direct calls, every call of a
     * pass at once (the parity runs' bound, beyond what a profile may ask).
     */
    private static function profil(): stdClass
    {
        $profil = ProfilRepository::predefini('stigmergie');
        $profil->voie = 'directe';
        $profil = ProfilRepository::validate($profil);
        $profil->parallelisme->appels_directs = 10000;

        return $profil;
    }

    /**
     * The intensities the journal gives (spec-stigmergie.md §7.2), by trace,
     * rounded as the day map's block rounds them: at each analysis, every
     * trace evaporates, a rejection takes its factor from its code's traces,
     * each trace takes its largest deposit, under τ_max; below τ_min, it goes.
     *
     * @param list<array<string, mixed>> $analyses
     * @return array<string, float>
     */
    private static function rejouer(array $analyses, float $rho): array
    {
        $tau = [];
        $codes = [];
        foreach ($analyses as $analyse) {
            foreach ($tau as $id => $t) {
                $tau[$id] = $t * (1 - $rho);
            }
            foreach ($analyse['rejets'] as $rejet) {
                foreach ($tau as $id => $t) {
                    if ($codes[$id] === $rejet['code']) {
                        $tau[$id] = $t * $rejet['facteur'];
                    }
                }
            }
            $deltas = [];
            foreach ($analyse['depots'] as $depot) {
                $deltas[$depot['trace']] = max($deltas[$depot['trace']] ?? 0.0, (float) $depot['delta']);
                $codes[$depot['trace']] = $depot['code'];
            }
            foreach ($deltas as $id => $delta) {
                $tau[$id] = min(3.0, ($tau[$id] ?? 0.0) + $delta);
            }
            $tau = array_filter($tau, static fn (float $t): bool => $t >= 0.05);
        }
        $tau = array_map(static fn (float $t): float => round($t, 3), $tau);
        ksort($tau, SORT_STRING);

        return $tau;
    }

    /**
     * @param list<array<string, mixed>> $traces
     * @return array<string, float> the block's intensities, by trace
     */
    private static function intensites(array $traces): array
    {
        $tau = [];
        foreach ($traces as $trace) {
            $tau[(string) $trace['id']] = (float) $trace['tau'];
        }
        ksort($tau, SORT_STRING);

        return $tau;
    }

    private function carte(int $run): int
    {
        $stmt = self::$pdo->prepare('SELECT carte_id FROM twin9_runs WHERE id = ?');
        $stmt->execute([$run]);

        return (int) $stmt->fetchColumn();
    }

    private function memoire(int $run): MapStore
    {
        return new MapStore(self::$pdo, $this->carte($run));
    }

    /** Whether TWIN_V9_DIR holds an engine with the stigmergy, of T16 or after, and its oracle's 16-test-mode. */
    private static function moteur(): bool
    {
        return is_file(self::$dir . '/php/src/Stigmergie.php') && is_dir(self::$dir . '/php/protocole')
            && is_file(self::$dir . '/oracle/scenarios/' . self::SCENARIO . '/calls.jsonl');
    }

    /** RESPIRE as the platform gives it to the engine (T16): drawn from the base, at the version of the v9.8. */
    private static function referentiel(): array
    {
        return (new ReferentielMoteur(self::$pdo))->bloc('respire', '7.0.0');
    }

    /** @return array<string, array<string, string>> the oracle's calls, by id */
    private static function record(string $fichier): array
    {
        $record = [];
        foreach (file($fichier) ?: [] as $ligne) {
            $d = json_decode($ligne, true, 512, JSON_THROW_ON_ERROR);
            $record[$d['artifact'] ?? $d['label']] = ['step' => $d['step'], 'model' => $d['model'],
                                                      'sha256' => $d['prompt_sha256']]
                + (isset($d['failure']) ? ['failure' => $d['failure']] : ['response' => $d['response']]);
        }

        return $record;
    }

    /**
     * The engine's set as the platform imports it (php/protocole, T16), each
     * template by its path without ".md", its bytes as they are.
     *
     * @return array<string, string>
     */
    private static function gabarits(): array
    {
        $racine = self::$dir . '/php/protocole';
        $gabarits = [];
        $fichiers = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($racine, \FilesystemIterator::SKIP_DOTS));
        foreach ($fichiers as $f) {
            if (str_ends_with($f->getFilename(), '.md')) {
                $gabarits[substr($f->getPathname(), \strlen($racine) + 1, -3)] = (string) file_get_contents($f->getPathname());
            }
        }
        ksort($gabarits, SORT_STRING);

        return $gabarits;
    }

    private function utilisateur(string $email): int
    {
        self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([$email, 'x', $email]);
        $id = (int) self::$pdo->lastInsertId();
        (new CreditService(self::$pdo))->adjust($id, 1_000_000_000, 'crédit des tests');

        return $id;
    }
}
