<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\MigrationRunner;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\TestDb;
use Humanome\Twin9\CallSettings;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\DirectCalls;
use Humanome\Twin9\EngineLoader;
use Humanome\Twin9\ProfilRepository;
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
 * Twin9's batch lane (T8, ADR-011 §3), with the fake engine and a simulated
 * Anthropic (FakeBatchApi): a slice submits a batch, a later one collects it;
 * a run by batches sends the prompts it sends directly; killed between two
 * batches, it resumes without paying anything twice; a lost batch is found
 * again; a collected or cancelled batch is deleted. Each test runs in a
 * process of its own: the real engine may be loaded in the others.
 */
#[RunTestsInSeparateProcesses]
#[PreserveGlobalState(false)]
final class LotsTest extends TestCase
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

    /** The same run, directly and by batches: each call leaves with the same request, and the outputs are the same. */
    public function testABatchRunSendsThePromptsADirectRunSends(): void
    {
        $direct = $this->nouveauRun(['/voie' => 'directe']);
        $http = new FakeMultiHttpClient(static fn (array $r): array =>
            ['body' => FakeMultiHttpClient::message('vu ' . FakeMultiHttpClient::appel($r))]);
        for ($n = 0; $n < 20 && (new RunRepository($this->pdo))->statut($direct) === 'en_cours'; $n++) {
            (new Tick($this->pdo, ['budgetSeconds' => 2, 'twin9Sender' => new DirectCalls($http)]))->run();
        }
        $lots = new FakeBatchApi(static fn (array $r): array => FakeBatchApi::message('vu ' . FakeBatchApi::appel($r)),
            regards: 0);
        $parLots = $this->nouveauRun(user: $this->utilisateur('lots@example.test'));
        $this->jusquAuBout($lots);

        $directes = [];
        foreach ($http->requests as $r) {
            $directes[FakeMultiHttpClient::appel($r)] = $r['body'];
        }
        $enLots = [];
        foreach ($lots->requetes as $r) {
            $enLots[FakeBatchApi::appel($r)] = $r['params'];
            self::assertSame(Twin9Lots::customId(FakeBatchApi::appel($r)), $r['custom_id']);
            self::assertMatchesRegularExpression('/^[a-zA-Z0-9_-]{1,64}$/', $r['custom_id']);
        }
        ksort($directes);
        ksort($enLots);
        self::assertCount(13, $enLots);
        self::assertSame($directes, $enLots, 'chaque appel part avec la même requête');
        $runs = new RunRepository($this->pdo);
        self::assertSame('termine', $runs->statut($parLots));
        self::assertSame($runs->sorties($direct), $runs->sorties($parLots));
        self::assertSame(4, $runs->compteursDe($parLots)['lots'], 'une vague, un lot');
    }

    /**
     * A slice submits the batch, a later one collects it; meanwhile the run
     * is not played. The settings are checked before the first batch only.
     */
    public function testASliceSubmitsTheBatchALaterOneCollectsIt(): void
    {
        $id = $this->nouveauRun();
        $lots = new FakeBatchApi(static fn (array $r): array => FakeBatchApi::message('vu ' . FakeBatchApi::appel($r)),
            regards: 1);

        $c = $this->tick($lots);
        self::assertSame(1, $c['twin9Lots']);
        self::assertSame(6, $c['twin9Appels'], 'les lecteurs des trois journées partent ensemble');
        $appels = $this->pdo->query('SELECT appel, statut, custom_id, lot_id FROM twin9_appels ORDER BY appel')->fetchAll();
        self::assertCount(6, $appels);
        foreach ($appels as $a) {
            self::assertSame('envoye', $a['statut']);
            self::assertSame(Twin9Lots::customId($a['appel']), $a['custom_id'], 'le journal garde le custom_id');
            self::assertNotNull($a['lot_id']);
        }
        self::assertSame([['msgbatch_0001', 'en_cours']], $this->pdo->query('SELECT lot, statut FROM twin9_lots')
            ->fetchAll(PDO::FETCH_NUM));
        self::assertSame(Twin9Lots::EN_COURS, $this->attente($id));

        $c = $this->tick($lots);
        self::assertSame([0, 0, 0], [$c['twin9Runs'], $c['twin9Passes'], $c['twin9Lots']], 'le lot est en cours : rien à jouer');

        $c = $this->tick($lots);
        self::assertSame([1, 1, 1], [$c['twin9Releves'], $c['twin9Passes'], $c['twin9Lots']]);
        self::assertSame(6, $c['twin9Reponses']);
        self::assertSame(['creer', 'etat', 'etat', 'resultats', 'supprimer'], $lots->operations('msgbatch_0001'),
            'relevé, puis supprimé');

        $this->jusquAuBout($lots);
        self::assertSame('termine', (new RunRepository($this->pdo))->statut($id));
        self::assertSame([], $lots->restants(), 'chaque lot relevé est supprimé chez Anthropic');
        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM twin9_lots')->fetchColumn());
        $premier = array_search(['creer', 'msgbatch_0001'], $lots->journal, true);
        $verifs = array_keys(array_filter($lots->journal, static fn (array $o): bool => $o[0] === 'verifier'));
        self::assertNotSame([], $verifs);
        self::assertLessThan($premier, max($verifs), 'les réglages se vérifient avant le premier lot, et seulement là');
        $combinaisons = (new CallSettings($this->profil()))->combinaisons();
        self::assertSame($combinaisons, array_map(static fn (array $v): array => array_diff_key($v, ['cle' => 1]),
            $lots->verifications), 'un appel direct minimal par combinaison de modèle et de réglages');
        self::assertSame(['faisceaux', 'journees/J1', 'journees/J2', 'journees/J3'], $this->cles($id));
    }

    /**
     * Killed as its second batch is about to leave, then as another has just
     * left: the run resumes, the first batch lost is submitted again once
     * the window to find it is past, the second is found; no request twice.
     */
    public function testKilledBetweenTwoBatchesItResumesWithoutPayingAgain(): void
    {
        $id = $this->nouveauRun();
        $lots = (new FakeBatchApi(static fn (array $r): array =>
            FakeBatchApi::message('vu ' . FakeBatchApi::appel($r)), regards: 0))
            ->incident(2, 'tue')->incident(5, 'tue_apres');
        $morts = 0;
        for ($n = 0; $n < 40 && (new RunRepository($this->pdo))->statut($id) === 'en_cours'; $n++) {
            try {
                $this->tick($lots, ['twin9Octets' => 900, 'twin9Fenetre' => 0.3]);
            } catch (\RuntimeException $e) {
                self::assertSame('tick tué', $e->getMessage());
                $morts++;
            }
            usleep(100_000);
        }

        self::assertSame(2, $morts);
        self::assertSame('termine', (new RunRepository($this->pdo))->statut($id));
        $ids = array_column($lots->requetes, 'custom_id');
        self::assertCount(13, $ids);
        self::assertSame(array_values(array_unique($ids)), $ids, 'aucune requête payée deux fois');
        self::assertArrayNotHasKey('msgbatch_0002', $lots->tailles, 'le deuxième lot n\'est jamais parti');
        self::assertContains('msgbatch_0005', $lots->supprimes, 'le cinquième, parti sans réponse, est retrouvé');
        self::assertSame([], $lots->restants(), 'chaque lot est supprimé chez Anthropic');
        foreach ($lots->tailles as $octets) {
            self::assertLessThanOrEqual(900, $octets);
        }
    }

    /** A batch whose answer was lost is found among the workspace's batches once ended, and never submitted again. */
    public function testALostBatchIsFoundAgain(): void
    {
        $id = $this->nouveauRun();
        $lots = (new FakeBatchApi(static fn (array $r): array =>
            FakeBatchApi::message('vu ' . FakeBatchApi::appel($r)), regards: 1))->incident(1, 'perdu');

        $this->tick($lots);
        self::assertSame(Twin9Lots::PERDU, $this->attente($id));
        self::assertSame([[null, 'soumission']], $this->pdo->query('SELECT lot, statut FROM twin9_lots')
            ->fetchAll(PDO::FETCH_NUM));

        $this->jusquAuBout($lots);
        self::assertSame('termine', (new RunRepository($this->pdo))->statut($id));
        $ids = array_column($lots->requetes, 'custom_id');
        self::assertCount(13, $ids, 'le lot retrouvé n\'est pas soumis à nouveau');
        self::assertSame(array_values(array_unique($ids)), $ids);
        self::assertContains('msgbatch_0001', $lots->supprimes);
        self::assertSame([], $lots->restants());
    }

    /**
     * A request in error leaves again, its attempt spent: the third error is
     * a failure, which keeps its day out of the memory. An expired one leaves
     * again, its attempt given back.
     */
    public function testRequestsInErrorOrExpiredLeaveAgain(): void
    {
        $id = $this->nouveauRun();
        $vus = [];
        $lots = new FakeBatchApi(static function (array $r) use (&$vus): array {
            $appel = FakeBatchApi::appel($r);
            $n = $vus[$appel] = ($vus[$appel] ?? 0) + 1;
            $erreur = ['type' => 'errored', 'error' => ['type' => 'error', 'error' => ['type' => 'api_error',
                       'message' => 'Le prompt cité ici ne doit jamais sortir.']]];

            return match (true) {
                $appel === 'journees/J1/tags_a_P1.json' && $n === 1 => $erreur,
                $appel === 'journees/J2/tags_a_P1.json' && $n === 1 => ['type' => 'expired'],
                $appel === 'journees/J3/1-greffier.md' => $erreur,
                default => FakeBatchApi::message('vu ' . $appel),
            };
        }, regards: 0);

        $this->jusquAuBout($lots);

        self::assertSame(2, $vus['journees/J1/tags_a_P1.json']);
        self::assertSame(2, $vus['journees/J2/tags_a_P1.json']);
        self::assertSame(3, $vus['journees/J3/1-greffier.md'], 'trois tentatives, puis la panne');
        $compteurs = (new RunRepository($this->pdo))->compteursDe($id);
        self::assertSame(13, $compteurs['appels']);
        self::assertSame(1, $compteurs['pannes']);
        self::assertSame(13 + 1 + 2, $compteurs['tentatives'], 'l\'erreur compte une tentative, l\'expiration non');
        self::assertSame(['faisceaux', 'journees/J1', 'journees/J2'], $this->cles($id));
        self::assertSame([], $lots->restants());
    }

    /**
     * The API refuses a run's settings: the run fails before its first
     * batch, and says why. A check the provider cannot answer waits.
     */
    public function testRefusedSettingsStopTheRunBeforeItsFirstBatch(): void
    {
        $id = $this->nouveauRun(['/etages/profond/modele' => 'claude-opus-4-8']);
        $sature = true;
        $lots = new FakeBatchApi(static fn (array $r): array => FakeBatchApi::message('vu'), regards: 0,
            verifieur: static function (array $reglage) use (&$sature): array {
                if ($sature) {
                    return ['ok' => false, 'http' => 529, 'erreur' => 'fournisseur saturé (HTTP 529)'];
                }

                return $reglage['modele'] === 'claude-opus-4-8'
                    ? ['ok' => false, 'http' => 400, 'erreur' => 'thinking.type: disabled is not supported for this model']
                    : ['ok' => true, 'http' => 200];
            });

        $this->tick($lots);
        self::assertSame('en_cours', (new RunRepository($this->pdo))->statut($id));
        self::assertSame('vérification des réglages : fournisseur saturé (HTTP 529)', $this->attente($id));

        $sature = false;
        $c = $this->tick($lots);
        self::assertSame(1, $c['twin9Echoues']);
        self::assertSame('echoue', (new RunRepository($this->pdo))->statut($id));
        self::assertSame('l\'API refuse les réglages de claude-opus-4-8 : thinking.type: disabled is not supported for '
            . 'this model', $this->attente($id));
        self::assertSame([], $lots->requetes, 'aucun lot ne part');
    }

    /** A run cancelled: its batch in progress is cancelled, then deleted once ended; its calls are given back. */
    public function testACancelledRunCancelsThenDeletesItsBatches(): void
    {
        $id = $this->nouveauRun();
        $lots = new FakeBatchApi(static fn (array $r): array => FakeBatchApi::message('vu'), regards: 100);
        $this->tick($lots);
        self::assertSame(['msgbatch_0001'], $lots->restants());

        $this->pdo->prepare('UPDATE twin9_runs SET statut = "annule" WHERE id = ?')->execute([$id]);
        $c = $this->tick($lots);
        self::assertSame(1, $c['twin9Annules']);
        self::assertSame(['msgbatch_0001'], $lots->annules);
        self::assertSame(6, (int) $this->pdo->query('SELECT COUNT(*) FROM twin9_appels WHERE statut = "attente"')
            ->fetchColumn(), 'les appels du lot annulé sont rendus');
        self::assertSame([], $lots->restants(), 'annulé, puis supprimé une fois fini');
        self::assertSame(['creer', 'annuler', 'etat', 'supprimer'], $lots->operations('msgbatch_0001'));
        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM twin9_lots')->fetchColumn());
    }

    /** Batches stay within their bound; a call in a batch costs its usage at half price. */
    public function testBatchesAreBoundedAndCostHalfPrice(): void
    {
        $modele = 'claude-sonnet-5';
        $id = $this->nouveauRun(['/etages/lecteurs/modele' => $modele, '/etages/rapide/modele' => $modele,
                                 '/etages/profond/modele' => $modele]);
        $lots = new FakeBatchApi(static fn (array $r): array => FakeBatchApi::message('vu ' . FakeBatchApi::appel($r),
            $modele, 1000, 200), regards: 0);
        for ($n = 0; $n < 30 && (new RunRepository($this->pdo))->statut($id) === 'en_cours'; $n++) {
            $this->tick($lots, ['twin9Octets' => 1200]);
        }

        self::assertSame('termine', (new RunRepository($this->pdo))->statut($id));
        self::assertGreaterThan(4, \count($lots->tailles), 'une vague trop grosse se répartit en plusieurs lots');
        foreach ($lots->tailles as $octets) {
            self::assertLessThanOrEqual(1200, $octets);
        }
        $config = new Twin9Config(new SettingsRepository($this->pdo));
        $demi = $config->coutMicrousd($modele, 1000, 200, parLots: true);
        self::assertSame(13 * $demi, (new RunRepository($this->pdo))->compteursDe($id)['cout_microusd']);
        self::assertEqualsWithDelta($config->coutMicrousd($modele, 1000, 200) / 2, $demi, 2, 'à moitié prix');
    }

    /** @param array<string, mixed> $options @return array<string, mixed> the tick's counters */
    private function tick(FakeBatchApi $lots, array $options = []): array
    {
        $interdit = new FakeMultiHttpClient(static function (): array {
            throw new \LogicException('aucun appel direct dans la voie par lots');
        });

        return (new Tick($this->pdo, ['budgetSeconds' => 2, 'twin9Lots' => $lots,
                                      'twin9Sender' => new DirectCalls($interdit)] + $options))->run();
    }

    private function jusquAuBout(FakeBatchApi $lots, int $max = 40): void
    {
        for ($n = 1; $n <= $max; $n++) {
            $debut = microtime(true);
            $this->tick($lots);
            self::assertLessThanOrEqual(2, microtime(true) - $debut, 'la tranche tient dans sa durée');
            if ((int) $this->pdo->query('SELECT COUNT(*) FROM twin9_runs WHERE statut = "en_cours"')->fetchColumn() === 0) {
                return;
            }
        }
        self::fail("le run n'est pas allé au bout en $max tranches");
    }

    /** @param array<string, mixed> $profil changes to the v9.8 profile (JSON pointer => value), by batches */
    private function nouveauRun(array $profil = [], ?int $user = null): int
    {
        return (new RunRepository($this->pdo))->creer(
            $user ?? $this->user,
            $this->profil($profil),
            (object) ['lecteurs' => ['a', 'b'], 'etapes' => ['greffier', 'president'], 'fusion' => true],
            'journal-factice.md',
            self::PORTFOLIO,
            'journal-factice',
            self::GABARITS,
            new \DateTimeImmutable('2026-10-18T12:00:00+00:00'),
            'twin9/runs/lots',
        );
    }

    /** The v9.8 profile, its lane by batches, with these changes (JSON pointer => value). @param array<string, mixed> $changes */
    private function profil(array $changes = []): stdClass
    {
        $profil = ProfilRepository::v98();
        $profil->voie = 'lots';
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

    private function attente(int $run): ?string
    {
        $stmt = $this->pdo->prepare('SELECT attente FROM twin9_runs WHERE id = ?');
        $stmt->execute([$run]);
        $attente = $stmt->fetchColumn();

        return $attente === null || $attente === false ? null : (string) $attente;
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
