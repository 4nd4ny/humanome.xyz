<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\Llm\LlmRuntime;
use Humanome\Referentiel\ReferentielRepository;
use Humanome\Tests\CartographeTestCase;
use Humanome\Tests\TestDb;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\EngineLoader;
use Humanome\Twin9\ProfilRepository;
use Humanome\Twin9\ProtocoleRepository;
use Humanome\Twin9\RunRepository;
use Humanome\Twin9\TemplateSets;
use Humanome\Worker\Tick;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunTestsInSeparateProcesses;

/**
 * The promptologues' template sets in the runs (T14, Twin_v9's
 * docs/plan-twin9-php.md, lot 4b): a word changed in a copy is in the prompt
 * of a run whose profile chooses the copy (UC-PRO-08-F09), and the v9.8's
 * set never changes; the default profile takes the instance's default set;
 * each set keeps its own map. The engine is the fake one, public, or the real
 * one of TWIN_V9_DIR when it is there. Each test runs in a process of its
 * own: the two engines cannot be loaded together.
 */
#[RunTestsInSeparateProcesses]
#[PreserveGlobalState(false)]
final class JeuxGabaritsTest extends CartographeTestCase
{
    private const GABARITS = [
        'factice/lecture' => "[appel:{\$APPEL}] Lis la journée {\$JOUR} en lecteur {\$LECTEUR} :\n{\$TEXTE}",
        'factice/etape' => "[appel:{\$APPEL}] Étape {\$ETAPE} de {\$JOUR}, après : {\$PRECEDENT}",
        'factice/fusion' => "[appel:{\$APPEL}] Fusionne :\n{\$JOURS}",
    ];

    private const PORTFOLIO = "## 2026-01-05\nPremier jour : j'ai monté le capteur.\n"
        . "## 2026-01-06\nDeuxième jour : j'ai lu les mesures.\n";

    /** The engine of TWIN_V9_DIR, when the test runs with one: the real one. */
    private string $reel;

    protected function setUp(): void
    {
        parent::setUp();
        $this->reel = EngineLoader::directory();
        TestDb::setEnv('TWIN_V9_DIR', \dirname(__DIR__) . '/fixtures/twin9-factice');
        TestDb::setEnv('ANTHROPIC_API_KEY', 'sk-ant-instance-test');
        TestDb::setEnv('WORKER_TICK_BUDGET_SECONDS', '2');
        foreach (['referentiel_versions', 'twin9_protocole_versions', 'twin9_protocole', 'twin9_jeux'] as $table) {
            self::$pdo->exec("DELETE FROM $table");
        }
        self::$pdo->exec("DELETE FROM settings WHERE name = 'twin9_gabarits_defaut'");
        $doc = json_decode((string) file_get_contents(\dirname(__DIR__, 3) . '/web/public/data/referentiel/respire-v7.json'),
            true, 512, JSON_THROW_ON_ERROR);
        (new ReferentielRepository(self::$pdo))->importPublishedDocument($doc, 'Import initial RESPIRE v7');
        TestDb::fichesRespire(self::$pdo); // the engine reads RESPIRE's fiches from the base (T16)
    }

    protected function tearDown(): void
    {
        LlmRuntime::setMultiHttpClient(null);
        parent::tearDown();
    }

    /** Every account of these tests has credit: the instance's key pays from it (T10). */
    protected function registerAs(string $email, string $name, array $roles = ['apprenant']): array
    {
        $user = parent::registerAs($email, $name, $roles);
        (new CreditService(self::$pdo))->adjust($user['id'], 1_000_000_000, 'crédit des tests');

        return $user;
    }

    /**
     * The DoD: a promptologue copies the v9.8's set and changes a word in
     * their copy; a run whose profile chooses the copy sends that word, in
     * each prompt its template renders. A run of the v9.8's set sends the
     * v9.8's: it has a map of its own, and instructs the days again.
     */
    public function testAWordChangedInACopyIsInTheRenderedPrompt(): void
    {
        $this->importer();
        $atelier = $this->registerAs('atelier@example.org', 'Atelier', ['admin', 'promptologue']);
        $this->copier($atelier, 'essai');
        $chemin = '/api/twin9/admin/jeux/essai/protocole/factice%2Flecture';
        $lecture = self::json($this->as_($atelier, 'GET', $chemin))['content'];
        $edite = $this->as_($atelier, 'PUT', $chemin,
            ['content' => str_replace('Lis la journée', 'Relis attentivement la journée', $lecture)]);
        self::assertSame(200, $edite->getStatusCode(), (string) $edite->getBody());

        $http = new FakeMultiHttpClient(static fn (array $r): array =>
            ['body' => FakeMultiHttpClient::message('vu ' . FakeMultiHttpClient::appel($r))]);
        LlmRuntime::setMultiHttpClient($http);
        $copie = $this->lancer($atelier, $this->profil($atelier, 'essai'));
        self::assertSame('essai', $copie['attestation']['gabarits']['jeu']);
        self::assertSame('termine', $this->jusquAuBout($atelier, $copie['id'])['statut']);

        $lectures = self::lectures($http);
        self::assertCount(2, $lectures, 'une lecture par journée');
        foreach ($lectures as $prompt) {
            self::assertStringStartsWith('Relis attentivement la journée 2026-01-0', $prompt);
        }

        // the v9.8's set: its own map, its own words
        $http->requests = [];
        $v98 = $this->lancer($atelier, $this->profil($atelier, 'v9.8'));
        self::assertSame('termine', $this->jusquAuBout($atelier, $v98['id'])['statut']);
        $lectures = self::lectures($http);
        self::assertCount(2, $lectures, 'la carte du jeu v9.8 n’a pas la mémoire de celle de la copie');
        foreach ($lectures as $prompt) {
            self::assertStringStartsWith('Lis la journée 2026-01-0', $prompt);
        }
        self::assertSame(2, (int) self::$pdo->query('SELECT COUNT(*) FROM twin9_cartes')->fetchColumn());
    }

    /**
     * The DoD: the v9.8's set never changes — through a whole session of the
     * atelier (copies, edits, restorations, refusals, a default set) and the
     * runs of its copies. The import alone writes it.
     */
    public function testTheV98SetNeverChanges(): void
    {
        $this->importer();
        $avant = self::v98();
        $atelier = $this->registerAs('atelier@example.org', 'Atelier', ['admin', 'promptologue']);
        $autre = $this->registerAs('autre@example.org', 'Autre', ['admin', 'promptologue']);
        $this->copier($atelier, 'essai');
        $this->copier($autre, 'autre');
        foreach (['factice/lecture', 'factice/etape', 'factice/fusion'] as $nom) {
            $chemin = '/api/twin9/admin/jeux/essai/protocole/' . rawurlencode($nom);
            self::assertSame(200, $this->as_($atelier, 'PUT', $chemin,
                ['content' => self::GABARITS[$nom] . "\nRetouche."])->getStatusCode());
            self::assertSame(200, $this->as_($atelier, 'POST', $chemin . '/restore', ['version' => 1])->getStatusCode());
            self::assertSame(200, $this->as_($atelier, 'PUT', $chemin, ['content' => self::GABARITS[$nom] . "\nEncore."])
                ->getStatusCode());
            $v98 = '/api/twin9/admin/jeux/v9.8/protocole/' . rawurlencode($nom);
            foreach ([$atelier, $autre] as $user) {
                self::assertSame(403, $this->as_($user, 'PUT', $v98, ['content' => 'Écrasé.'])->getStatusCode());
                self::assertSame(403, $this->as_($user, 'POST', $v98 . '/restore', ['version' => 1])->getStatusCode());
            }
        }
        self::assertSame(200, $this->as_($atelier, 'PUT', '/api/twin9/admin/jeux/defaut', ['jeu' => 'essai'])->getStatusCode());
        $http = new FakeMultiHttpClient(static fn (array $r): array =>
            ['body' => FakeMultiHttpClient::message('vu ' . FakeMultiHttpClient::appel($r))]);
        LlmRuntime::setMultiHttpClient($http);
        $run = $this->lancer($atelier, $this->profil($atelier, 'essai'));
        self::assertSame('termine', $this->jusquAuBout($atelier, $run['id'])['statut']);

        self::assertSame($avant, self::v98(), 'le jeu v9.8 ne change jamais');
        // the import, alone, writes it — and the comparison would see it
        (new ProtocoleRepository(self::$pdo))->put('factice/fusion', "[appel:{\$APPEL}] Réimporté :\n{\$JOURS}", null);
        self::assertNotSame($avant, self::v98());
    }

    /**
     * The default profile, the v9.8's, takes the instance's default set: the
     * configuration page starts from it, a launch without a profile runs it.
     */
    public function testTheDefaultProfileTakesTheInstancesDefaultSet(): void
    {
        $this->importer();
        $atelier = $this->registerAs('atelier@example.org', 'Atelier', ['admin', 'promptologue']);
        $alice = $this->registerAs('alice@example.org', 'Alice');
        $this->copier($atelier, 'essai');
        $chemin = '/api/twin9/admin/jeux/essai/protocole/factice%2Ffusion';
        self::assertSame(200, $this->as_($atelier, 'PUT', $chemin, ['content' => "[appel:{\$APPEL}] Réunis :\n{\$JOURS}"])
            ->getStatusCode());

        self::assertSame('v9.8', self::json($this->as_($alice, 'GET', '/api/twin9/configuration'))['defaut']['gabarits']);
        self::assertSame(200, $this->as_($atelier, 'PUT', '/api/twin9/admin/jeux/defaut', ['jeu' => 'essai'])->getStatusCode());
        self::assertSame('essai', self::json($this->as_($alice, 'GET', '/api/twin9/configuration'))['defaut']['gabarits']);

        $run = $this->lancer($alice, null);
        self::assertSame(['id' => null, 'nom' => 'Profil v9.8', 'mode' => 'complet'], $run['attestation']['profil']);
        self::assertSame('essai', $run['attestation']['gabarits']['jeu']);
        self::assertSame(['factice/etape' => 1, 'factice/fusion' => 2, 'factice/lecture' => 1],
            $run['attestation']['gabarits']['versions']);
        $copie = (new RunRepository(self::$pdo))->charger($run['id']);
        self::assertSame("[appel:{\$APPEL}] Réunis :\n{\$JOURS}", $copie['gabarits']['factice/fusion'], 'l’instantané du run');
    }

    /**
     * With the real engine (TWIN_V9_DIR): a word changed in a copy of the
     * v9.8's templates is in the prompt the engine renders, the tagger's of
     * the first day; the v9.8's set renders its own.
     */
    public function testAWordChangedInACopyReachesTheRealEnginesPrompt(): void
    {
        if (!is_file($this->reel . '/php/src/Plateforme.php') || !is_dir($this->reel . '/php/protocole')) {
            self::markTestSkipped('Twin_v9 absent (TWIN_V9_DIR) : le vrai moteur et ses gabarits ne sont pas là');
        }
        TestDb::setEnv('TWIN_V9_DIR', $this->reel);
        self::assertTrue(EngineLoader::load());
        $v98 = new ProtocoleRepository(self::$pdo);
        foreach (self::gabaritsV98($this->reel) as $nom => $contenu) {
            $v98->put($nom, $contenu, null);
        }
        $atelier = $this->registerAs('atelier@example.org', 'Atelier', ['admin', 'promptologue']);
        $this->copier($atelier, 'essai');
        $tag = (new ProtocoleRepository(self::$pdo, 'essai'))->get('tagger/1-tag-pole')['content'];
        // a word of its prose, outside its {$VARIABLES}
        $mot = '/(?<![{$\p{L}_])\p{L}{5,}(?![\p{L}_])/u';
        self::assertSame(1, preg_match($mot, $tag, $original));
        $chemin = '/api/twin9/admin/jeux/essai/protocole/tagger%2F1-tag-pole';
        self::assertSame(200, $this->as_($atelier, 'PUT', $chemin,
            ['content' => preg_replace($mot, 'MOTTEMOIN', $tag, 1)])->getStatusCode());
        $portfolio = (string) file_get_contents($this->reel . '/tests/portfolios/PLANT-01.md');

        $prompts = [];
        foreach (['essai', 'v9.8'] as $jeu) {
            $profil = $this->profil($atelier, $jeu, mode: 'test');
            $lance = $this->as_($atelier, 'POST', '/api/twin9/runs', ['profil' => $profil, 'accord' => true,
                'portfolio' => ['nom' => 'PLANT-01.md', 'texte' => $portfolio]]);
            self::assertSame(201, $lance->getStatusCode(), (string) $lance->getBody());
            $capteur = new PromptCapteur();
            (new Tick(self::$pdo, ['budgetSeconds' => 5, 'twin9Sender' => $capteur, 'twin9Runs' => 1]))->run();
            self::$pdo->exec('UPDATE twin9_runs SET statut = "annule" WHERE statut = "en_cours"');
            $prompts[$jeu] = array_values(array_filter($capteur->prompts, static fn (string $p, string $id): bool =>
                str_contains($id, '/tags_'), ARRAY_FILTER_USE_BOTH));
        }
        self::assertNotEmpty($prompts['essai'], 'les taggers du premier jour');
        self::assertSame(\count($prompts['essai']), \count($prompts['v9.8']));
        foreach ($prompts['essai'] as $prompt) {
            self::assertStringContainsString('MOTTEMOIN', $prompt);
        }
        foreach ($prompts['v9.8'] as $prompt) {
            self::assertStringNotContainsString('MOTTEMOIN', $prompt);
            self::assertStringContainsString($original[0], $prompt);
        }
    }

    /**
     * A copy made before an import added a template to the v9.8's set lacks
     * it: its runs are refused at launch, before a call leaves, rather than
     * stopped on it.
     */
    public function testACopyLackingATemplateOfTheV98SetIsRefusedAtLaunch(): void
    {
        $this->importer();
        $atelier = $this->registerAs('atelier@example.org', 'Atelier', ['admin', 'promptologue']);
        $this->copier($atelier, 'essai');
        $profil = $this->profil($atelier, 'essai');
        (new ProtocoleRepository(self::$pdo))->put('factice/nouveau', 'Gabarit FICTIF importé après la copie.', null);

        foreach (['/api/twin9/runs/apercu', '/api/twin9/runs'] as $route) {
            $refus = $this->as_($atelier, 'POST', $route, ['profil' => $profil, 'accord' => true,
                'portfolio' => ['nom' => 'journal-factice.md', 'texte' => self::PORTFOLIO]]);
            self::assertSame(422, $refus->getStatusCode(), $route);
            self::assertSame('Le jeu de gabarits « essai » n’a pas tous les gabarits du jeu v9.8 : il faut en refaire une copie',
                self::json($refus)['error']);
        }
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM twin9_runs')->fetchColumn());
    }

    /**
     * The contract gives each template of the v9.8's set the variables it
     * uses (TWIN_V9_DIR/php/protocole, T16): a copy of it, saved as it is,
     * passes.
     */
    public function testTheContractGivesEveryV98TemplateItsVariables(): void
    {
        if (!is_dir($this->reel . '/php/protocole')) {
            self::markTestSkipped('Twin_v9 absent (TWIN_V9_DIR) : ses gabarits ne sont pas là');
        }
        $contrat = TemplateSets::contrat();
        foreach (self::gabaritsV98($this->reel) as $nom => $contenu) {
            self::assertSame([], array_values(array_diff(ProtocoleRepository::extractVariables($contenu), $contrat[$nom] ?? [])),
                $nom);
        }
        self::assertSame([], array_values(array_diff(array_keys($contrat), array_keys(self::gabaritsV98($this->reel)))),
            'le contrat ne nomme que des gabarits du jeu v9.8');
    }

    /** The v9.8's set, as the import writes it. */
    private function importer(): void
    {
        $v98 = new ProtocoleRepository(self::$pdo);
        foreach (self::GABARITS as $nom => $contenu) {
            $v98->put($nom, $contenu, null);
        }
    }

    private function copier(array $user, string $id): void
    {
        $copie = $this->as_($user, 'POST', '/api/twin9/admin/jeux', ['id' => $id]);
        self::assertSame(201, $copie->getStatusCode(), (string) $copie->getBody());
    }

    /** A profile of the user's, the v9.8's by the direct lane, choosing a template set. */
    private function profil(array $user, string $jeu, string $mode = 'complet'): int
    {
        $profil = ProfilRepository::v98();
        $profil->voie = 'directe';
        $profil->mode = $mode;
        $profil->gabarits = $jeu;
        $cree = $this->as_($user, 'POST', '/api/twin9/profils', ['nom' => "Jeu $jeu", 'profil' => $profil]);
        self::assertSame(201, $cree->getStatusCode(), (string) $cree->getBody());

        return self::json($cree)['id'];
    }

    /** @return array<string, mixed> the run launched */
    private function lancer(array $user, ?int $profil): array
    {
        $lance = $this->as_($user, 'POST', '/api/twin9/runs', ['profil' => $profil, 'accord' => true,
            'portfolio' => ['nom' => 'journal-factice.md', 'texte' => self::PORTFOLIO]]);
        self::assertSame(201, $lance->getStatusCode(), (string) $lance->getBody());

        return self::json($lance);
    }

    /** @return array<string, mixed> the run's progress, once done */
    private function jusquAuBout(array $user, int $id): array
    {
        for ($n = 0; $n < 20; $n++) {
            $suivi = self::json($this->as_($user, 'GET', "/api/twin9/runs/$id"));
            if ($suivi['statut'] !== 'en_cours') {
                return $suivi;
            }
            self::assertSame(200, $this->as_($user, 'POST', '/api/twin9/runs/avancer')->getStatusCode());
        }
        self::fail('le run ne va pas au bout');
    }

    /** @return list<string> the prompts of the readings sent, their call's id taken off */
    private static function lectures(FakeMultiHttpClient $http): array
    {
        $lectures = [];
        foreach ($http->requests as $r) {
            if (str_contains(FakeMultiHttpClient::appel($r), '/tags_')) {
                $lectures[] = (string) preg_replace('/^\[appel:[^\]]+\] /', '', $r['body']['messages'][0]['content']);
            }
        }

        return $lectures;
    }

    /** @return list<array<string, mixed>> the v9.8's set, its templates and their versions, as stored */
    private static function v98(): array
    {
        return [self::$pdo->query('SELECT * FROM twin9_protocole ORDER BY name')->fetchAll(),
                self::$pdo->query('SELECT * FROM twin9_protocole_versions ORDER BY id')->fetchAll()];
    }

    /** @return array<string, string> the v9.8's templates of a Twin_v9 checkout, by name */
    private static function gabaritsV98(string $dir): array
    {
        // T16: the platform's v9.8's set, the templates naming their referential, without the pole files
        $racine = $dir . '/php/protocole';
        $gabarits = [];
        foreach (new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($racine, \FilesystemIterator::SKIP_DOTS)) as $f) {
            if (str_ends_with($f->getFilename(), '.md')) {
                $gabarits[substr($f->getPathname(), \strlen($racine) + 1, -3)] = (string) file_get_contents($f->getPathname());
            }
        }
        ksort($gabarits, SORT_STRING);

        return $gabarits;
    }
}

