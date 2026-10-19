<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\Keys\KeyVault;
use Humanome\MigrationRunner;
use Humanome\Packages\SettingsRepository;
use Humanome\Referentiel\ReferentielRepository;
use Humanome\Tests\TestDb;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\DirectCalls;
use Humanome\Twin9\EngineLoader;
use Humanome\Twin9\ProfilPolicy;
use Humanome\Twin9\ProfilRepository;
use Humanome\Twin9\RunCosts;
use Humanome\Twin9\RunExport;
use Humanome\Twin9\RunRepository;
use Humanome\Twin9\Twin9Config;
use Humanome\Twin9\Twin9Exception;
use Humanome\Worker\Tick;
use PDO;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunTestsInSeparateProcesses;
use PHPUnit\Framework\TestCase;
use stdClass;

/**
 * What a Twin9 run costs, and where it stops (T10, Twin_v9's
 * docs/plan-twin9-php.md, lot 2, « Coûts et plafonds », « Une clé par run »),
 * with the fake engine of tests/fixtures/twin9-factice: every call debits
 * its owner's credits at its real cost, margin included, half price by
 * batches; its worst case held before it leaves, a run never goes beyond its
 * budget, and stops at it, its map incomplete, to resume; its owner's credit
 * and its duration stop it the same way; the run's own key pays nothing
 * here; no key is ever written. Each test runs in a process of its own.
 */
#[RunTestsInSeparateProcesses]
#[PreserveGlobalState(false)]
final class CoutsTest extends TestCase
{
    private const GABARITS = [
        'factice/lecture' => "[appel:{\$APPEL}] Lis la journée {\$JOUR} en lecteur {\$LECTEUR} :\n{\$TEXTE}",
        'factice/etape' => "[appel:{\$APPEL}] Étape {\$ETAPE} de {\$JOUR}, après : {\$PRECEDENT}",
        'factice/fusion' => "[appel:{\$APPEL}] Fusionne :\n{\$JOURS}",
    ];

    private const PORTFOLIO = "## J1\nPremier jour.\n## J2\nDeuxième jour.\n## J3\nTroisième jour.\n";

    /** Every stage on Sonnet 5.5 (2 $ and 10 $ the million tokens), 20,000 tokens of output at most. */
    private const SONNET = [
        '/etages/lecteurs/modele' => 'claude-sonnet-5-5', '/etages/lecteurs/budget_sortie' => 20000,
        '/etages/rapide/modele' => 'claude-sonnet-5-5', '/etages/rapide/budget_sortie' => 20000,
        '/etages/profond/budget_sortie' => 20000,
    ];

    /** What each answer says it used: half its prompt's bytes in, 15,000 tokens out. */
    private const SORTIE = 15000;

    private const CREDIT = 1_000_000_000;

    private PDO $pdo;

    private int $user;

    protected function setUp(): void
    {
        $this->pdo = TestDb::fresh();
        (new MigrationRunner($this->pdo, MigrationRunner::defaultMigrationsDir()))->run();
        TestDb::setEnv('TWIN_V9_DIR', \dirname(__DIR__) . '/fixtures/twin9-factice');
        self::assertTrue(EngineLoader::load());
        TestDb::setEnv('ANTHROPIC_API_KEY', 'sk-ant-instance-cle-secrete-1');
        TestDb::setEnv('WORKER_TICK_BUDGET_SECONDS', '');
        $this->user = $this->utilisateur('apprenant@example.test');
    }

    protected function tearDown(): void
    {
        TestDb::restoreEnv();
    }

    /**
     * The DoD: capped at 1 $, a run stops before it goes beyond, and says
     * so; what it spent is its owner's credits' only debit. Resumed under a
     * new budget, it goes to its end, at the real cost of its calls.
     */
    public function testARunCappedAtOneDollarStopsBeforeGoingBeyondAndSaysSo(): void
    {
        $id = $this->nouveauRun(self::SONNET + ['/budget_usd' => 1.0]);
        $http = self::anthropic();

        $this->jusquALArret($http);

        $runs = new RunRepository($this->pdo);
        $suivi = $runs->suivi($id);
        self::assertSame('echoue', $suivi['statut']);
        self::assertSame(RunCosts::BUDGET, $suivi['attente']);
        self::assertSame('Budget atteint : carte incomplète', $suivi['retard'], 'sa page le dit');
        [$appels, $cout, $detenu] = $this->journal($id);
        self::assertSame(5, $appels, 'cinq appels tiennent dans 1 $, pas six');
        self::assertLessThanOrEqual(1_000_000, $cout);
        self::assertSame($this->attendu($http->requests), $cout, 'le coût réel, marge comprise');
        self::assertSame(0, $detenu, 'plus rien de réservé');
        self::assertSame(['depense_microusd' => $cout, 'budget_usd' => 1.0, 'duree_minutes' => null], $suivi['cout']);
        self::assertSame(self::CREDIT - $cout, (new CreditService($this->pdo))->balance($this->user),
            'le crédit ne paie que l’usage réel');
        self::assertSame(5, $this->evenements('debit'), 'une réserve par appel');

        self::assertTrue($runs->reprendre($id, $this->user, ['budget_usd' => 5]));
        $this->jusquALArret($http);

        self::assertSame('termine', $runs->statut($id));
        $compteurs = $runs->compteursDe($id);
        self::assertSame(13, $compteurs['appels']);
        self::assertSame(3, $compteurs['journees']);
        self::assertSame($this->attendu($http->requests), $compteurs['cout_microusd']);
        self::assertLessThanOrEqual(5_000_000, $compteurs['cout_microusd']);
        self::assertSame(self::CREDIT - $compteurs['cout_microusd'],
            (new CreditService($this->pdo))->balance($this->user));
    }

    /** By batches: half price, and a batch holds no more than the budget leaves room for. */
    public function testByBatchesACallCostsHalfAndABatchHoldsWhatTheBudgetLeaves(): void
    {
        $id = $this->nouveauRun(self::SONNET + ['/voie' => 'lots', '/budget_usd' => 0.6]);
        $lots = new FakeBatchApi(static fn (array $r): array => FakeBatchApi::message('vu', 'claude-sonnet-5-5',
            intdiv(\strlen((string) $r['params']['messages'][0]['content']), 2), self::SORTIE));

        $this->tickLots($lots);
        // six readers wait; each holds about 0.12 $ by batches: the budget leaves room for four
        self::assertCount(4, $lots->requetes, 'le premier lot ne prend que ce que le budget tient');
        for ($n = 0; $n < 30 && (new RunRepository($this->pdo))->statut($id) === 'en_cours'; $n++) {
            $this->tickLots($lots);
        }

        $runs = new RunRepository($this->pdo);
        self::assertSame('echoue', $runs->statut($id));
        self::assertSame(RunCosts::BUDGET, $runs->suivi($id)['attente']);
        $config = new Twin9Config(new SettingsRepository($this->pdo));
        $attendu = 0;
        foreach ($lots->requetes as $r) {
            $attendu += (int) $config->coutMicrousd('claude-sonnet-5-5',
                intdiv(\strlen((string) $r['params']['messages'][0]['content']), 2), self::SORTIE, parLots: true);
        }
        [$appels, $cout, $detenu] = $this->journal($id);
        self::assertSame(\count($lots->requetes), $appels);
        self::assertSame($attendu, $cout, 'à moitié prix, marge comprise');
        self::assertLessThanOrEqual(600_000, $cout);
        self::assertSame(0, $detenu);
        self::assertSame(self::CREDIT - $cout, (new CreditService($this->pdo))->balance($this->user));
    }

    /** With its owner's own key, a run debits nothing here; its cost is Anthropic's, without the margin. */
    public function testWithItsOwnersKeyARunDebitsNothingAndCostsWithoutTheMargin(): void
    {
        TestDb::setEnv('SODIUM_MASTER_KEY', str_repeat('ab', 32));
        (new Twin9Config(new SettingsRepository($this->pdo)))->update(['twin9_cle_perso_ouverte' => true]);
        (new KeyVault($this->pdo, (string) KeyVault::masterKeyFromEnv()))->store($this->user, 'anthropic',
            'sk-ant-perso-cle-secrete-2');
        $id = $this->nouveauRun(self::SONNET + ['/cle' => 'personnelle', '/budget_usd' => 50.0]);
        $http = self::anthropic();

        $this->jusquALArret($http);

        $runs = new RunRepository($this->pdo);
        self::assertSame('termine', $runs->statut($id));
        self::assertSame($this->attendu($http->requests, marge: false), $runs->compteursDe($id)['cout_microusd']);
        self::assertSame(self::CREDIT, (new CreditService($this->pdo))->balance($this->user));
        self::assertSame(0, $this->evenements('debit') + $this->evenements('adjust', 'Twin9 run%'));
        foreach ($http->requests as $r) {
            self::assertSame('sk-ant-perso-cle-secrete-2', $r['headers']['x-api-key']);
        }
    }

    /** Its owner's credit spent, a run stops the same way, then resumes once topped up. */
    public function testWithoutCreditARunStopsAndResumesOnceToppedUp(): void
    {
        $this->pdo->prepare('UPDATE twin9_credits SET balance_microusd = 300000 WHERE user_id = ?')
            ->execute([$this->user]);
        $id = $this->nouveauRun(self::SONNET);
        $http = self::anthropic();

        $this->jusquALArret($http);

        $runs = new RunRepository($this->pdo);
        self::assertSame('echoue', $runs->statut($id));
        self::assertSame('Crédit insuffisant : carte incomplète', $runs->suivi($id)['retard']);
        [$appels, $cout] = $this->journal($id);
        self::assertSame(1, $appels);
        self::assertSame(300000 - $cout, (new CreditService($this->pdo))->balance($this->user));

        (new CreditService($this->pdo))->adjust($this->user, 100_000_000, 'recharge');
        self::assertTrue($runs->reprendre($id, $this->user));
        $this->jusquALArret($http);
        self::assertSame('termine', $runs->statut($id));
    }

    /** Its duration ended, no call leaves and the run stops; resumed, its duration counts again from then. */
    public function testItsDurationStopsARunAndCountsAgainOnceResumed(): void
    {
        $id = $this->nouveauRun(['/duree_minutes' => 1]);
        $this->pdo->prepare('UPDATE twin9_runs SET debut_at = NOW() - INTERVAL 2 MINUTE WHERE id = ?')->execute([$id]);
        $http = self::anthropic();

        $this->jusquALArret($http);

        $runs = new RunRepository($this->pdo);
        self::assertSame('echoue', $runs->statut($id));
        self::assertSame(RunCosts::DUREE, $runs->suivi($id)['attente']);
        self::assertSame([], $http->requests);

        self::assertTrue($runs->reprendre($id, $this->user));
        $this->jusquALArret($http);
        self::assertSame('termine', $runs->statut($id));
        self::assertGreaterThanOrEqual(0, $runs->compteursDe($id)['duree_s']);
    }

    /** The price grid: Haiku 5.5's long prompts at their tier, half price by batches, the margin with the instance's key. */
    public function testThePriceGridHasTheLongPromptTierOfHaiku(): void
    {
        $config = new Twin9Config(new SettingsRepository($this->pdo));
        self::assertSame(12_000 + 600, $config->coutMicrousd('claude-haiku-5-5', 100_000, 1_000));
        self::assertSame(60_001 + 3_000, $config->coutMicrousd('claude-haiku-5-5', 100_001, 1_000));
        self::assertSame(30_001 + 1_500, $config->coutMicrousd('claude-haiku-5-5', 100_001, 1_000, parLots: true));
        self::assertSame(50_001 + 2_500, $config->coutMicrousd('claude-haiku-5-5', 100_001, 1_000, avecMarge: false));
        self::assertSame(2_400 + 12_000, $config->coutMicrousd('claude-sonnet-5-5', 1_000, 1_000));
        self::assertNull($config->coutMicrousd('claude-inconnu-1', 1, 1));

        $this->pdo->exec('DELETE FROM referentiel_versions');
        (new ReferentielRepository($this->pdo))->importPublishedDocument(json_decode((string) file_get_contents(
            \dirname(__DIR__, 3) . '/web/public/data/referentiel/respire-v7.json'), true, 512, JSON_THROW_ON_ERROR),
            'Import initial RESPIRE v7');
        $politique = new ProfilPolicy($this->pdo, $config);
        $politique->admettre(ProfilRepository::validate(ProfilRepository::v98()), $this->user);
        $profil = ProfilRepository::v98();
        $profil->etapes->president = (object) ['modele' => 'claude-inconnu-1'];
        try {
            $politique->admettre(ProfilRepository::validate($profil), $this->user);
            self::fail('un modèle sans prix est refusé');
        } catch (Twin9Exception $e) {
            self::assertSame(422, $e->getStatusCode());
            self::assertStringContainsString('claude-inconnu-1 : aucun prix', $e->getMessage());
        }
    }

    /** The DoD: no key in the journal, the outputs, the memory, the batches, the ledger nor the export. */
    public function testNoKeyIsWrittenAnywhere(): void
    {
        TestDb::setEnv('SODIUM_MASTER_KEY', str_repeat('ab', 32));
        (new Twin9Config(new SettingsRepository($this->pdo)))->update(['twin9_cle_perso_ouverte' => true]);
        (new KeyVault($this->pdo, (string) KeyVault::masterKeyFromEnv()))->store($this->user, 'anthropic',
            'sk-ant-perso-cle-secrete-2');
        $direct = $this->nouveauRun([], portfolio: "## J1\nUn jour.\n");
        $perso = $this->nouveauRun(['/cle' => 'personnelle'], portfolio: "## J1\nUn autre jour.\n",
            journal: 'autre-journal');
        $lots = $this->nouveauRun(['/voie' => 'lots'], portfolio: "## J1\nUn jour par lots.\n", journal: 'par-lots');
        $http = self::anthropic();
        $api = new FakeBatchApi(static fn (array $r): array => FakeBatchApi::message('vu'), regards: 3);

        // mid-run: the journal is there, a batch at Anthropic
        (new Tick($this->pdo, ['budgetSeconds' => 2, 'twin9Sender' => new DirectCalls($http), 'twin9Lots' => $api,
                               'twin9Runs' => 3, 'twin9Pauses' => [0.05, 0.1]]))->run();
        self::assertGreaterThan(0, (int) $this->pdo->query('SELECT COUNT(*) FROM twin9_appels')->fetchColumn());
        self::assertGreaterThan(0, (int) $this->pdo->query('SELECT COUNT(*) FROM twin9_lots')->fetchColumn());
        $this->aucuneCle();

        for ($n = 0; $n < 20 && (int) $this->pdo->query('SELECT COUNT(*) FROM twin9_runs WHERE statut = "en_cours"')
            ->fetchColumn() > 0; $n++) {
            (new Tick($this->pdo, ['budgetSeconds' => 2, 'twin9Sender' => new DirectCalls($http), 'twin9Lots' => $api,
                                   'twin9Runs' => 3, 'twin9Pauses' => [0.05, 0.1]]))->run();
        }
        $runs = new RunRepository($this->pdo);
        self::assertSame(['termine', 'termine', 'termine'], [$runs->statut($direct), $runs->statut($perso),
                                                             $runs->statut($lots)]);
        $this->aucuneCle();
        $export = '';
        (new RunExport($this->pdo))->ecrire($this->user, static function (string $morceau) use (&$export): void {
            $export .= $morceau;
        });
        self::assertStringNotContainsString('cle-secrete', $export);
    }

    /** Every text column of the engine's tables, uncompressed where it is: no key. */
    private function aucuneCle(): void
    {
        foreach (['twin9_runs', 'twin9_appels', 'twin9_resultats', 'twin9_lots', 'twin9_cartes', 'twin9_memoire',
                  'twin9_lots_a_effacer', 'twin9_credit_events'] as $table) {
            foreach ($this->pdo->query("SELECT * FROM $table")->fetchAll() as $ligne) {
                foreach ($ligne as $colonne => $valeur) {
                    if (!\is_string($valeur)) {
                        continue;
                    }
                    $clair = @gzuncompress($valeur);
                    foreach ([$valeur, \is_string($clair) ? $clair : ''] as $texte) {
                        self::assertStringNotContainsString('cle-secrete', $texte, "$table.$colonne");
                    }
                }
            }
        }
    }

    /** Anthropic, answering each call: half its prompt's bytes in, 15,000 tokens out, from Sonnet 5.5. */
    private static function anthropic(): FakeMultiHttpClient
    {
        return new FakeMultiHttpClient(static function (array $r): array {
            $message = FakeMultiHttpClient::message('vu ' . FakeMultiHttpClient::appel($r), (string) $r['body']['model']);
            $message['usage'] = ['input_tokens' => intdiv(\strlen((string) $r['body']['messages'][0]['content']), 2),
                                 'output_tokens' => self::SORTIE];

            return ['body' => $message, 'delai' => 0.02];
        });
    }

    /**
     * The real cost of the calls answered, each at its model's price, by direct calls.
     *
     * @param list<array<string, mixed>> $requetes
     */
    private function attendu(array $requetes, bool $marge = true): int
    {
        $config = new Twin9Config(new SettingsRepository($this->pdo));
        $total = 0;
        foreach ($requetes as $r) {
            $total += (int) $config->coutMicrousd((string) $r['body']['model'],
                intdiv(\strlen((string) $r['body']['messages'][0]['content']), 2), self::SORTIE, avecMarge: $marge);
        }

        return $total;
    }

    /** @return array{0: int, 1: int, 2: int} a run's calls answered, their real cost, what its calls still hold */
    private function journal(int $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT SUM(statut = "repondu"), COALESCE(SUM(cout_microusd), 0), COALESCE(SUM(reserve_microusd), 0)
               FROM twin9_appels WHERE run_id = ?'
        );
        $stmt->execute([$id]);

        return array_map(intval(...), $stmt->fetch(PDO::FETCH_NUM));
    }

    private function evenements(string $sorte, string $libelle = '%'): int
    {
        $stmt = $this->pdo->prepare('SELECT COUNT(*) FROM twin9_credit_events WHERE kind = ? AND label LIKE ?');
        $stmt->execute([$sorte, $libelle]);

        return (int) $stmt->fetchColumn();
    }

    /** Slices until no run is in progress. */
    private function jusquALArret(FakeMultiHttpClient $http, int $max = 30): void
    {
        for ($n = 1; $n <= $max; $n++) {
            (new Tick($this->pdo, ['budgetSeconds' => 2, 'twin9Sender' => new DirectCalls($http),
                                   'twin9Pauses' => [0.05, 0.1]]))->run();
            if ((int) $this->pdo->query('SELECT COUNT(*) FROM twin9_runs WHERE statut = "en_cours"')->fetchColumn() === 0) {
                return;
            }
        }
        self::fail("le run ne s'arrête pas en $max tranches");
    }

    private function tickLots(FakeBatchApi $lots): void
    {
        $interdit = new FakeMultiHttpClient(static function (): array {
            throw new \LogicException('aucun appel direct dans la voie par lots');
        });
        (new Tick($this->pdo, ['budgetSeconds' => 2, 'twin9Lots' => $lots, 'twin9Sender' => new DirectCalls($interdit)]))
            ->run();
    }

    /** @param array<string, mixed> $profil changes to the v9.8 profile (JSON pointer => value), by direct calls */
    private function nouveauRun(array $profil = [], string $portfolio = self::PORTFOLIO,
                                string $journal = 'journal-factice'): int
    {
        return (new RunRepository($this->pdo))->creer(
            $this->user,
            $this->profil($profil),
            (object) ['lecteurs' => ['a', 'b'], 'etapes' => ['greffier', 'president'], 'fusion' => true],
            $journal . '.md',
            $portfolio,
            $journal,
            self::GABARITS,
            new \DateTimeImmutable('2026-10-18T12:00:00+00:00'),
        );
    }

    /** @param array<string, mixed> $changes */
    private function profil(array $changes): stdClass
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

    private function utilisateur(string $email): int
    {
        $this->pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([$email, 'x', $email]);
        $id = (int) $this->pdo->lastInsertId();
        (new CreditService($this->pdo))->adjust($id, self::CREDIT, 'crédit des tests');

        return $id;
    }
}
