<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\Auth\Users;
use Humanome\Etablissement\EcoleCles;
use Humanome\Etablissement\Ecoles;
use Humanome\Etablissement\Payeur;
use Humanome\Etablissement\Payeurs;
use Humanome\Keys\KeyVault;
use Humanome\MigrationRunner;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\EcolesSupport;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\DirectCalls;
use Humanome\Twin9\EngineLoader;
use Humanome\Twin9\ProfilRepository;
use Humanome\Twin9\RunCosts;
use Humanome\Twin9\RunPurge;
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
 * A school pays its learners' Twin9 runs (sprint 6, lot S6b; ADR-013 §2 d,
 * §3, §4, §6), with the fake engine of tests/fixtures/twin9-factice: on the
 * instance's key, its credit is debited the real cost × (1 + its surtax),
 * never its learner's balance; each learner's cap for the month stops the
 * run the same way a credit does; on its own key, its provider bills it and
 * the platform nothing, the cap counting the list price; a run whose school
 * no longer pays stops, never falling back on its learner's balance, and
 * its resumption chooses its payer again; a learner erased leaves the
 * batches of their school's key to the tick, which deletes them with that
 * key. Fictitious keys and accounts only. Each test runs in a process of
 * its own.
 */
#[RunTestsInSeparateProcesses]
#[PreserveGlobalState(false)]
final class EcolesTest extends TestCase
{
    use EcolesSupport;

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

    private const CREDIT_ECOLE = 100_000_000;

    private const CLE_INSTANCE = 'sk-ant-instance-fictive-1';

    private const CLE_ECOLE = 'sk-ant-ecole-fictive-2';

    private PDO $pdo;

    private int $ecole;

    private int $eleve;

    protected function setUp(): void
    {
        $this->pdo = TestDb::fresh();
        (new MigrationRunner($this->pdo, MigrationRunner::defaultMigrationsDir()))->run();
        TestDb::setEnv('TWIN_V9_DIR', \dirname(__DIR__) . '/fixtures/twin9-factice');
        self::assertTrue(EngineLoader::load());
        TestDb::setEnv('ANTHROPIC_API_KEY', self::CLE_INSTANCE);
        TestDb::setEnv('SODIUM_MASTER_KEY', str_repeat('cd', 32));
        TestDb::setEnv('WORKER_TICK_BUDGET_SECONDS', '');
        $this->ecole = self::ecole($this->pdo, 'École des Tilleuls', 5.0, 50.0, self::CREDIT_ECOLE);
        $this->eleve = self::compte($this->pdo, 'Léa');
        self::inscrire($this->pdo, $this->ecole, $this->eleve);
    }

    protected function tearDown(): void
    {
        TestDb::restoreEnv();
    }

    /** ADR-013 §2 d: the school's credit pays the real cost × (1 + its surtax); the learner pays nothing. */
    public function testASchoolPaysItsLearnersRunAtTheRealCostTimesOnePlusItsSurtax(): void
    {
        $id = $this->nouveauRun(self::SONNET, Payeur::ecole($this->ecole, 1.05));
        $http = self::anthropic();

        $this->jusquALArret($http);

        $runs = new RunRepository($this->pdo);
        self::assertSame('termine', $runs->statut($id));
        $cout = $runs->compteursDe($id)['cout_microusd'];
        self::assertSame($this->attendu($http->requests, 1.05), $cout, 'le coût réel × 1,05, pas la contribution');
        self::assertNotSame($this->attendu($http->requests, null), $cout);
        self::assertSame(self::CREDIT_ECOLE - $cout, self::solde($this->pdo, $this->ecole));
        self::assertSame(0, self::solde($this->pdo, $this->eleve), 'l’élève ne paie rien');
        self::assertSame(0, $this->evenements($this->eleve), 'aucun événement sur son grand livre');
        self::assertSame($cout, self::engage($this->pdo, $this->ecole, $this->eleve), 'son plafond compte ce que l’école paie');
        $stmt = $this->pdo->prepare('SELECT COUNT(*), SUM(beneficiaire_id = ?) FROM twin9_credit_events
                                      WHERE user_id = ? AND label LIKE "Twin9 run%"');
        $stmt->execute([$this->eleve, $this->ecole]);
        [$n, $nommes] = array_map(intval(...), $stmt->fetch(PDO::FETCH_NUM));
        self::assertGreaterThan(0, $n);
        self::assertSame($n, $nommes, 'chaque événement nomme l’élève');
        foreach ($http->requests as $r) {
            self::assertSame(self::CLE_INSTANCE, $r['headers']['x-api-key']);
        }
        self::assertSame(['type' => 'ecole', 'id' => $this->ecole, 'nom' => 'École des Tilleuls'], $runs->suivi($id)['payeur']);
    }

    /** ADR-013 §4: the learner's cap for the month stops the run, its map incomplete, as a credit short does. */
    public function testTheCapPerLearnerStopsTheRun(): void
    {
        (new Ecoles($this->pdo))->regler($this->ecole, 5.0, 500_000);
        $id = $this->nouveauRun(self::SONNET, Payeur::ecole($this->ecole, 1.05));
        $http = self::anthropic();

        $this->jusquALArret($http);

        $runs = new RunRepository($this->pdo);
        self::assertSame('echoue', $runs->statut($id));
        self::assertSame(RunCosts::PLAFOND, $runs->suivi($id)['attente']);
        self::assertSame('Plafond de votre école atteint : carte incomplète', $runs->suivi($id)['retard']);
        [$appels, $cout, $detenu] = $this->journal($id);
        self::assertGreaterThan(0, $appels);
        self::assertSame(0, $detenu, 'plus rien de réservé');
        self::assertLessThanOrEqual(500_000, self::engage($this->pdo, $this->ecole, $this->eleve));
        self::assertSame($cout, self::engage($this->pdo, $this->ecole, $this->eleve));
        self::assertSame(self::CREDIT_ECOLE - $cout, self::solde($this->pdo, $this->ecole));
        self::assertSame(0, self::solde($this->pdo, $this->eleve));
    }

    /**
     * ADR-013 §2 d, §6: on its own key, the school's provider bills it — its credit untouched, the platform paid
     * nothing —, the cap counting the list price; the key is the school's, at every call.
     */
    public function testOnItsKeyTheSchoolPaysItsProviderAndTheCapCountsTheListPrice(): void
    {
        (new EcoleCles($this->pdo, (string) KeyVault::masterKeyFromEnv()))->poser($this->ecole, 'anthropic', self::CLE_ECOLE);
        $id = $this->nouveauRun(self::SONNET + ['/cle' => 'ecole'], Payeur::ecole($this->ecole, 1.0));
        $http = self::anthropic();

        $this->jusquALArret($http);

        $runs = new RunRepository($this->pdo);
        self::assertSame('termine', $runs->statut($id));
        $cout = $runs->compteursDe($id)['cout_microusd'];
        self::assertSame($this->attendu($http->requests, 1.0), $cout, 'le prix de la grille, sans marge ni surtaxe');
        self::assertSame(self::CREDIT_ECOLE, self::solde($this->pdo, $this->ecole), 'son crédit n’est pas touché');
        self::assertSame(0, $this->evenements($this->ecole, 'Twin9 run%'));
        self::assertSame($cout, self::engage($this->pdo, $this->ecole, $this->eleve));
        foreach ($http->requests as $r) {
            self::assertSame(self::CLE_ECOLE, $r['headers']['x-api-key'], 'la clé de l’école');
        }
    }

    /** ADR-013 §3, §4: a run whose school no longer pays stops, and never falls back on its learner's balance. */
    public function testARunWhoseSchoolNoLongerPaysStopsNeverOnTheLearnersBalance(): void
    {
        (new CreditService($this->pdo))->adjust($this->eleve, 50_000_000, 'solde acheté avant');
        // one call at a time, slow enough that a slice does not finish it
        $id = $this->nouveauRun(self::SONNET + ['/parallelisme/appels_directs' => 1], Payeur::ecole($this->ecole, 1.05));
        $http = self::anthropic(0.4);
        $this->tick($http);
        self::assertSame('en_cours', (new RunRepository($this->pdo))->statut($id));
        self::assertGreaterThan(0, $this->journal($id)[0], 'des appels déjà payés par l’école');

        $this->pdo->prepare('DELETE m FROM cohorte_membres m JOIN cohortes c ON c.id = m.cohorte_id
                              WHERE c.etablissement_id = ? AND m.user_id = ?')->execute([$this->ecole, $this->eleve]);
        $this->jusquALArret($http);

        $runs = new RunRepository($this->pdo);
        self::assertSame('echoue', $runs->statut($id));
        self::assertSame(Payeurs::NE_PAIE_PLUS, $runs->suivi($id)['attente']);
        self::assertSame(50_000_000, self::solde($this->pdo, $this->eleve), 'son solde n’a pas bougé');
        [, $cout, $detenu] = $this->journal($id);
        self::assertSame(0, $detenu, 'sa réserve rendue à l’école');
        self::assertSame(self::CREDIT_ECOLE - $cout, self::solde($this->pdo, $this->ecole));

        // its resumption chooses its payer again: their own balance, now at the contribution
        self::assertTrue($runs->reprendre($id, $this->eleve, [], Payeur::personnel()));
        $this->jusquALArret($http);
        self::assertSame('termine', $runs->statut($id));
        self::assertSame(['type' => 'personnel'], $runs->suivi($id)['payeur']);
        self::assertLessThan(50_000_000, self::solde($this->pdo, $this->eleve), 'son solde paie ce qu’il a choisi');
        self::assertSame(self::CREDIT_ECOLE - $cout, self::solde($this->pdo, $this->ecole), 'l’école, rien de plus');
    }

    /** ADR-013 §6: by batches on its key — the key the batches carry —, the cap holds at half the list price. */
    public function testByBatchesTheSchoolsKeySubmitsAndTheCapHolds(): void
    {
        (new EcoleCles($this->pdo, (string) KeyVault::masterKeyFromEnv()))->poser($this->ecole, 'anthropic', self::CLE_ECOLE);
        $id = $this->nouveauRun(self::SONNET + ['/cle' => 'ecole', '/voie' => 'lots'], Payeur::ecole($this->ecole, 1.0));
        $lots = new FakeBatchApi(static fn (array $r): array => FakeBatchApi::message('vu', 'claude-sonnet-5-5',
            intdiv(\strlen((string) $r['params']['messages'][0]['content']), 2), self::SORTIE));

        for ($n = 0; $n < 30 && (new RunRepository($this->pdo))->statut($id) === 'en_cours'; $n++) {
            $this->tickLots($lots);
        }

        self::assertSame('termine', (new RunRepository($this->pdo))->statut($id));
        self::assertNotEmpty($lots->tailles);
        foreach ($lots->verifications as $v) {
            self::assertSame(self::CLE_ECOLE, $v['cle']);
        }
        $config = new Twin9Config(new SettingsRepository($this->pdo));
        $attendu = 0;
        foreach ($lots->requetes as $r) {
            $attendu += (int) $config->coutMicrousd('claude-sonnet-5-5',
                intdiv(\strlen((string) $r['params']['messages'][0]['content']), 2), self::SORTIE, parLots: true,
                facteur: 1.0);
        }
        self::assertSame($attendu, (new RunRepository($this->pdo))->compteursDe($id)['cout_microusd']);
        self::assertSame($attendu, self::engage($this->pdo, $this->ecole, $this->eleve));
        self::assertSame(self::CREDIT_ECOLE, self::solde($this->pdo, $this->ecole));
    }

    /**
     * ADR-013 §6: a learner erased hands the batches of their school's key to the tick with the school, which
     * deletes them at Anthropic with that key.
     */
    public function testAnErasedLearnersBatchesOnTheSchoolsKeyAreDeletedWithIt(): void
    {
        (new EcoleCles($this->pdo, (string) KeyVault::masterKeyFromEnv()))->poser($this->ecole, 'anthropic', self::CLE_ECOLE);
        $this->nouveauRun(self::SONNET + ['/cle' => 'ecole', '/voie' => 'lots'], Payeur::ecole($this->ecole, 1.0));
        $lots = new FakeBatchApi(static fn (array $r): array => FakeBatchApi::message('vu', 'claude-sonnet-5-5'),
            regards: 5);
        $this->tickLots($lots);
        $soumis = $lots->restants();
        self::assertCount(1, $soumis);

        $this->pdo->beginTransaction();
        (new RunPurge($this->pdo))->confier($this->eleve);
        Users::purge($this->pdo, $this->eleve);
        $this->pdo->commit();
        $stmt = $this->pdo->query('SELECT lot, ecole_id FROM twin9_lots_a_effacer');
        self::assertSame([['lot' => $soumis[0], 'ecole_id' => $this->ecole]], array_map(
            static fn (array $l): array => ['lot' => (string) $l['lot'], 'ecole_id' => (int) $l['ecole_id']], $stmt->fetchAll()));

        for ($n = 0; $n < 5 && $lots->restants() !== []; $n++) {
            $this->tickLots($lots);
        }
        self::assertSame([], $lots->restants(), 'annulé puis supprimé chez Anthropic, avec la clé de l’école');
        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM twin9_lots_a_effacer')->fetchColumn());
    }

    /** A new payer while a call still holds its worst case on the former one: 409, nothing changed. */
    public function testANewPayerWaitsForTheFormersReservesToSettle(): void
    {
        (new Ecoles($this->pdo))->regler($this->ecole, 5.0, 500_000);
        $id = $this->nouveauRun(self::SONNET, Payeur::ecole($this->ecole, 1.05));
        $this->jusquALArret(self::anthropic());
        $this->pdo->prepare('UPDATE twin9_appels SET reserve_microusd = 10 WHERE run_id = ? LIMIT 1')->execute([$id]);

        try {
            (new RunRepository($this->pdo))->reprendre($id, $this->eleve, [], Payeur::personnel());
            self::fail('changé de payeur sous une réserve');
        } catch (Twin9Exception $e) {
            self::assertSame(409, $e->getStatusCode());
        }
        self::assertSame('echoue', (new RunRepository($this->pdo))->statut($id));
        self::assertSame(['type' => 'ecole', 'id' => $this->ecole, 'nom' => 'École des Tilleuls'],
            (new RunRepository($this->pdo))->suivi($id)['payeur']);
    }

    /** Anthropic, answering each call after $delai seconds: half its prompt's bytes in, 15,000 tokens out. */
    private static function anthropic(float $delai = 0.02): FakeMultiHttpClient
    {
        return new FakeMultiHttpClient(static function (array $r) use ($delai): array {
            $message = FakeMultiHttpClient::message('vu ' . FakeMultiHttpClient::appel($r), (string) $r['body']['model']);
            $message['usage'] = ['input_tokens' => intdiv(\strlen((string) $r['body']['messages'][0]['content']), 2),
                                 'output_tokens' => self::SORTIE];

            return ['body' => $message, 'delai' => $delai];
        });
    }

    /**
     * The real cost of the calls answered, by direct calls, at a school's factor ($facteur), or at the
     * contribution (null).
     *
     * @param list<array<string, mixed>> $requetes
     */
    private function attendu(array $requetes, ?float $facteur): int
    {
        $config = new Twin9Config(new SettingsRepository($this->pdo));
        $total = 0;
        foreach ($requetes as $r) {
            $total += (int) $config->coutMicrousd((string) $r['body']['model'],
                intdiv(\strlen((string) $r['body']['messages'][0]['content']), 2), self::SORTIE, facteur: $facteur);
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

    private function evenements(int $compte, string $libelle = '%'): int
    {
        $stmt = $this->pdo->prepare('SELECT COUNT(*) FROM twin9_credit_events WHERE user_id = ? AND label LIKE ?');
        $stmt->execute([$compte, $libelle]);

        return (int) $stmt->fetchColumn();
    }

    private function tick(FakeMultiHttpClient $http): void
    {
        (new Tick($this->pdo, ['budgetSeconds' => 2, 'twin9Sender' => new DirectCalls($http),
                               'twin9Pauses' => [0.05, 0.1]]))->run();
    }

    /** Slices until no run is in progress. */
    private function jusquALArret(FakeMultiHttpClient $http, int $max = 30): void
    {
        for ($n = 1; $n <= $max; $n++) {
            $this->tick($http);
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
    private function nouveauRun(array $profil, Payeur $payeur): int
    {
        return (new RunRepository($this->pdo))->creer(
            $this->eleve,
            $this->profil($profil),
            (object) ['lecteurs' => ['a', 'b'], 'etapes' => ['greffier', 'president'], 'fusion' => true],
            'journal-factice.md',
            self::PORTFOLIO,
            'journal-factice',
            self::GABARITS,
            new \DateTimeImmutable('2026-10-18T12:00:00+00:00'),
            payeur: $payeur,
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
}
