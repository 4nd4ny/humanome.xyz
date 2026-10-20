<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\MigrationRunner;
use Humanome\Referentiel\ReferentielRepository;
use Humanome\Tests\TestDb;
use Humanome\Twin9\CallSettings;
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

/**
 * The oracle through the tick (T7, Twin_v9's docs/plan-twin9-php.md, lot 1,
 * « L'oracle en continu »): four simulated scenarios of the v9.8 — the
 * Arpenteur, a random jury, the test mode, a resumption on a map's memory —
 * and T2's real run go through the platform as a run does: the MySQL journal
 * and memory, slices, answers in a shuffled order, the engine of TWIN_V9_DIR.
 * Each call leaves once, with the v9.8's prompt; the outputs are the
 * oracle's, compared as decoded JSON. By batches too (T8): a run by batches
 * sends the prompts a direct run sends. Since T16, as the platform runs
 * them: the set of php/protocole, the referential's variables in its
 * templates and no pole file, and RESPIRE drawn from the base into the
 * engine's settings; a run launched before T16 — the v9.8's protocole/, its
 * pole files, no referential — replays too. Without Twin_v9, these tests
 * skip.
 */
final class PariteTest extends TestCase
{
    private const HORLOGE = '2026-10-18T12:00:00';

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
        // T16: RESPIRE and its fiches in the base, which the engine reads from the run's settings
        $doc = json_decode((string) file_get_contents(\dirname(__DIR__, 3) . '/web/public/data/referentiel/respire-v7.json'),
            true, 512, JSON_THROW_ON_ERROR);
        (new ReferentielRepository(self::$pdo))->importPublishedDocument($doc, 'Import initial RESPIRE v7');
        TestDb::fichesRespire(self::$pdo);
    }

    protected function setUp(): void
    {
        if (!self::moteur()) {
            self::markTestSkipped('Twin_v9 absent (TWIN_V9_DIR), ou d’avant T16 : ni le moteur ni son oracle ne sont là');
        }
        self::assertTrue(EngineLoader::load());
        TestDb::setEnv('ANTHROPIC_API_KEY', 'sk-ant-parite');
        TestDb::setEnv('WORKER_TICK_BUDGET_SECONDS', '');
    }

    protected function tearDown(): void
    {
        TestDb::restoreEnv();
    }

    public function testTheArpenteur(): void
    {
        $this->rejouer('03-scan-default', $this->utilisateur('arpenteur@example.test'));
    }

    public function testARandomJury(): void
    {
        $this->rejouer('12-jury-random', $this->utilisateur('jury@example.test'));
    }

    public function testTheTestMode(): void
    {
        $this->rejouer('16-test-mode', $this->utilisateur('essai@example.test'), part: 0.5);
    }

    /**
     * 10-resume: the map remembers 01-default, its memory as the engine
     * leaves it (played in one pass, with the oracle's answers, into the
     * map's store): every day is taken back, only the merge is played again.
     */
    public function testAResumptionOnTheMemoryOfAMap(): void
    {
        $user = $this->utilisateur('reprise@example.test');
        $this->rejouer('10-resume', $user, avant: function (int $carte): void {
            $dir = self::$dir . '/oracle/scenarios/01-default';
            [$scenario, $moteur, $portfolio, $sortie] = $this->scenario($dir);
            $record = self::record($dir . '/calls.jsonl');
            $journal = new class ($record) implements \Twin9\Run\Journal {
                public function __construct(private readonly array $record)
                {
                }

                public function outcome(string $id): ?array
                {
                    return $this->record[$id] ?? null;
                }
            };
            $moteur->referentiel = self::referentiel();
            (new \Twin9\Plateforme(json_encode($moteur, JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR),
                basename($portfolio), (string) file_get_contents($portfolio), self::gabarits(), $sortie,
                new \DateTimeImmutable(self::HORLOGE), $this->empreinte($moteur)))
                ->passe($journal, new MapStore(self::$pdo, $carte), static function (): void {
                });
            self::assertNotEmpty((new MapStore(self::$pdo, $carte))->keys('journees/'));
        });
    }

    /**
     * Killed in the middle of a tribunal, as its first juror is about to be
     * asked: the run resumes and goes to its end, no call twice.
     */
    public function testKilledInTheMiddleOfATribunalItResumes(): void
    {
        $tueur = static function (string $id): bool {
            static $tue = false;
            if (!$tue && preg_match('#/tribunal/[^/]+/23-#', $id) === 1) {
                return $tue = true;
            }

            return false;
        };
        $this->rejouer('16-test-mode', $this->utilisateur('tue@example.test'), tueur: $tueur);
    }

    /**
     * A run launched before T16 — no referential in its settings, the v9.8's
     * set with its pole files — goes on as it began: its run is the
     * oracle's.
     */
    public function testARunOfBeforeT16ReplaysTheOracle(): void
    {
        $this->rejouer('16-test-mode', $this->utilisateur('avant@example.test'), part: 0.5, avantT16: true);
    }

    /**
     * A juror that fails leaves its day out of the memory: the next run of
     * the map plays the day again, and its run is the oracle's.
     */
    public function testAFailedJurorIsPlayedAgainByTheNextRun(): void
    {
        $user = $this->utilisateur('jure@example.test');
        $dir = self::$dir . '/oracle/scenarios/16-test-mode';
        $record = self::record($dir . '/calls.jsonl');
        $jure = array_values(array_filter(array_keys($record), static fn (string $id): bool =>
            preg_match('#/tribunal/[^/]+/23-#', $id) === 1))[0];
        $enPanne = $record;
        unset($enPanne[$jure]['response']);
        $enPanne[$jure]['failure'] = 'Backend anthropic : échec après 3 tentatives : HTTP 529';
        $premier = $this->rejouer('16-test-mode', $user, record: $enPanne, comparer: false);
        $stmt = self::$pdo->prepare(
            'SELECT m.cle FROM twin9_memoire m JOIN twin9_runs r ON r.carte_id = m.carte_id WHERE r.id = ? ORDER BY m.cle'
        );
        $stmt->execute([$premier]);
        self::assertSame([], array_values(array_filter($stmt->fetchAll(PDO::FETCH_COLUMN),
            static fn (string $k): bool => str_contains($k, 'journees/') || str_contains($k, 'calques/'))),
            'la journée du juré en panne n\'entre pas en mémoire');
        self::assertSame(1, (new RunRepository(self::$pdo))->compteursDe($premier)['pannes']);

        $this->rejouer('16-test-mode', $user);
    }

    /**
     * By batches (T8): each wave of calls leaves in a batch, each call once,
     * with the v9.8's prompt. Killed as its second batch is about to leave,
     * then as its fourth has left without its answer, the run resumes,
     * nothing is paid twice, and its outputs are the oracle's.
     */
    public function testTheTestModeByBatchesKilledBetweenTwoBatches(): void
    {
        $this->rejouer('16-test-mode', $this->utilisateur('lots@example.test'), parLots: true,
            incidents: [2 => 'tue', 4 => 'tue_apres']);
    }

    /**
     * The engine reads the profile's settings, and nothing else (T9): drawn
     * from the v9.8 profile, they are the oracle's cloud settings — the
     * backends' kind aside, « mock » under --mock — and the run they drive is
     * the oracle's, call by call.
     */
    public function testTheV98ProfileDrivesTheEngine(): void
    {
        [, $oracle] = $this->scenario(self::$dir . '/oracle/scenarios/02-cloud');
        $moteur = MoteurReglages::depuis(ProfilRepository::validate(ProfilRepository::v98()), self::referentiel());
        foreach ([$moteur->config->backend_tribunal, $moteur->config->backend_rapide, ...$moteur->roster] as $b) {
            $b->kind = 'mock';   // --mock
        }

        foreach ((array) $oracle->config as $cle => $valeur) {
            if (\in_array($cle, ['_note', 'backend_tribunal_local'], true)) {
                continue;   // a comment; the local backend of --donnees-reelles (consent replaces it, ADR-011)
            }
            $attendu = str_starts_with($cle, 'backend_')
                ? array_intersect_key((array) $valeur, array_flip(['kind', 'model', 'model_mini'])) : $valeur;
            self::assertEquals($attendu, \is_object($moteur->config->{$cle}) && str_starts_with($cle, 'backend_')
                ? (array) $moteur->config->{$cle} : $moteur->config->{$cle}, $cle);
        }
        $lus = ['name', 'kind', 'model', 'family', 'weight', 'enabled', 'passe', 'seed', 'salt'];
        self::assertSame(
            array_map(static fn (\stdClass $m): array => array_intersect_key((array) $m, array_flip($lus)), $oracle->roster),
            array_map(static fn (\stdClass $m): array => array_intersect_key((array) $m, array_flip($lus)), $moteur->roster),
        );
        self::assertSame([null, false, true], [$moteur->jours, $moteur->test, $moteur->memoire]);
        self::assertSame(self::referentiel(), $moteur->referentiel);

        $this->rejouer('02-cloud', $this->utilisateur('profil@example.test'), moteur: $moteur);
    }

    public function testTheRealRun(): void
    {
        if (!is_file(self::$dir . '/oracle/reel/calls.jsonl')) {
            self::markTestSkipped('oracle/reel absent de Twin_v9');
        }
        $this->rejouer('reel', $this->utilisateur('reel@example.test'), part: 0.5);
    }

    /**
     * A scenario through the tick, on the map of $user; $avant gets the
     * run's map before the first slice.
     *
     * @param (\Closure(int): void)|null $avant
     * @param array<string, array<string, string>>|null $record the answers, the oracle's by default
     * @param (\Closure(string): bool)|null $tueur whether the tick dies as this call is about to leave
     * @param bool $comparer whether the calls and outputs must be the oracle's
     * @param bool $parLots by batches (ReplayBatchApi), rather than directly
     * @param array<int, string> $incidents by batches: the creations that make the tick die ('tue', 'tue_apres')
     * @param \stdClass|null $moteur the engine's settings, the oracle's with RESPIRE drawn from the base by default
     * @param bool $avantT16 as a run launched before T16: the v9.8's protocole/, its pole files, no referential
     * @return int the run
     */
    private function rejouer(string $id, int $user, float $part = 1.0, ?\Closure $avant = null, ?array $record = null,
                             ?\Closure $tueur = null, bool $comparer = true, bool $parLots = false,
                             array $incidents = [], ?\stdClass $moteur = null, bool $avantT16 = false): int
    {
        $dir = self::$dir . ($id === 'reel' ? '/oracle/reel' : '/oracle/scenarios/' . $id);
        [$scenario, $oracle, $portfolio, $sortie] = $this->scenario($dir);
        if ($moteur === null) {
            $moteur = $oracle;
            if (!$avantT16) {
                $moteur->referentiel = self::referentiel();
            }
        }
        $record ??= self::record($dir . '/calls.jsonl');
        // a test that failed may have left its run in progress: it must not take this one's slices
        self::$pdo->exec('UPDATE twin9_runs SET statut = "annule" WHERE statut = "en_cours"');
        $runs = new RunRepository(self::$pdo);
        $run = $runs->creer($user, self::profil($parLots), $moteur, basename($portfolio), (string) file_get_contents($portfolio),
            pathinfo($portfolio, PATHINFO_FILENAME), self::gabarits($avantT16), new \DateTimeImmutable(self::HORLOGE),
            $sortie);
        if ($avant !== null) {
            $stmt = self::$pdo->prepare('SELECT carte_id FROM twin9_runs WHERE id = ?');
            $stmt->execute([$run]);
            $avant((int) $stmt->fetchColumn());
        }

        $envoi = new ReplaySender($record, part: $part, tueur: $tueur, strict: $comparer);
        $lots = new ReplayBatchApi($record, $incidents);
        $morts = 0;
        for ($tranches = 1; $runs->statut($run) === 'en_cours'; $tranches++) {
            self::assertLessThan(100, $tranches, "$id : le run ne va pas au bout");
            try {
                (new Tick(self::$pdo, ['budgetSeconds' => 5, 'twin9Sender' => $envoi, 'twin9Lots' => $lots,
                                       'twin9Runs' => 1, 'twin9Fenetre' => 0.2]))->run();
            } catch (\RuntimeException $e) {
                self::assertSame('tick tué', $e->getMessage());
                $morts++;
            }
        }
        self::assertSame(\count($incidents) + ($tueur === null ? 0 : 1), $morts);

        self::assertSame('termine', $runs->statut($run), $id);
        if (!$comparer) {
            return $run;
        }
        $envoyes = $parLots ? array_map('strval', array_keys($lots->envois))
            : array_map(static fn (string $k): string => substr($k, strpos($k, ':') + 1), array_keys($envoi->envois));
        if ($parLots) {
            self::assertSame([], $lots->restants(), "$id : chaque lot relevé est supprimé");
        }
        sort($envoyes, SORT_STRING);
        $attendus = array_keys($record);
        sort($attendus, SORT_STRING);
        self::assertSame($attendus, $envoyes, "$id : chaque appel de l'oracle, une fois");

        $sorties = $runs->sorties($run);
        foreach ($scenario->outputs as $chemin) {
            self::assertArrayHasKey($chemin, $sorties, "$id : $chemin");
            $attendu = (string) file_get_contents($dir . '/outputs/' . $chemin);
            str_ends_with($chemin, '.json')
                ? self::assertSame(json_decode($attendu, true, 512, JSON_THROW_ON_ERROR),
                    json_decode($sorties[$chemin], true, 512, JSON_THROW_ON_ERROR), "$id : $chemin")
                : self::assertSame($attendu, $sorties[$chemin], "$id : $chemin");
        }
        if ($id !== 'reel') {
            $chemins = array_map('strval', $scenario->outputs);
            sort($chemins, SORT_STRING);
            self::assertSame($chemins, array_keys($sorties), "$id : les sorties de l'oracle, rien d'autre");
        }

        return $run;
    }

    /**
     * A scenario's settings as a run keeps them.
     *
     * @return array{0: \stdClass, 1: \stdClass, 2: string, 3: string} the scenario, the v9.8's settings, the
     *         portfolio's file, the run's output
     */
    private function scenario(string $dir): array
    {
        $scenario = json_decode((string) file_get_contents($dir . '/scenario.json'), false, 512, JSON_THROW_ON_ERROR);
        $commande = $scenario->command;
        $option = static function (string $nom) use ($commande): ?string {
            $i = array_search($nom, $commande, true);

            return $i === false ? null : (string) $commande[$i + 1];
        };
        $jours = $option('--jours');
        $moteur = (object) ['config' => $scenario->settings->config, 'roster' => $scenario->settings->roster,
                            'jours' => $jours === null ? null : (int) $jours, 'test' => isset($scenario->test_mode),
                            'memoire' => $scenario->state !== 'none'];

        return [$scenario, $moteur, self::$dir . '/' . $option('--portfolio'), (string) $option('--out')];
    }

    /** The profile of the parity runs: the v9.8's, directly (every call of a pass at once) or by batches. */
    private static function profil(bool $parLots = false): \stdClass
    {
        $profil = ProfilRepository::v98();
        $profil->voie = $parLots ? 'lots' : 'directe';
        $profil->parallelisme->appels_directs = 10000;

        return ProfilRepository::validate($profil);
    }

    /** Whether TWIN_V9_DIR holds the engine, of T16 or after (php/protocole), and its oracle. */
    private static function moteur(): bool
    {
        return is_file(self::$dir . '/php/src/Plateforme.php') && is_dir(self::$dir . '/php/protocole')
            && is_dir(self::$dir . '/oracle/scenarios');
    }

    /** The fingerprint of the settings, as the tick computes it for a parity run. */
    private function empreinte(\stdClass $moteur): string
    {
        return CallSettings::empreinte(self::profil(), $moteur->config->troncatures ?? null, self::gabarits(),
            $moteur->referentiel ?? null);
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
     * The v9.8's set as the platform imports it
     * (scripts/twin9/import-protocole.mjs): since T16, php/protocole, the
     * referential's variables in its templates and no pole file; before, the
     * v9.8's protocole/ itself. Each template by its path without ".md", its
     * bytes as they are.
     *
     * @return array<string, string>
     */
    private static function gabarits(bool $avantT16 = false): array
    {
        $racine = self::$dir . ($avantT16 ? '/protocole' : '/php/protocole');
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
        // the instance's key pays from its owner's credits (T10)
        (new CreditService(self::$pdo))->adjust($id, 1_000_000_000, 'crédit des tests');

        return $id;
    }
}
