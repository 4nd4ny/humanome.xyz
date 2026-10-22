<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\MigrationRunner;
use Humanome\Tests\TestDb;
use Humanome\Twin9\CallSettings;
use Humanome\Twin9\EngineLoader;
use Humanome\Twin9\ProfilRepository;
use Humanome\Twin9\Twin9Exception;
use PDO;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use stdClass;

/**
 * The profile of a Twin9 run (Twin_v9's docs/plan-twin9-php.md, lot 4a, T12):
 * the schema holds every algorithm parameter of the v9.8, the v9.8 profile is
 * valid, an invalid profile is refused, a valid one is stored and read back
 * by its owner. The checks against the v9.8 itself read TWIN_V9_DIR and skip
 * without it (public CI).
 */
final class ProfilTest extends TestCase
{
    /** config.json keys that are not algorithm parameters, and why. */
    private const HORS_PROFIL = [
        'backend_tribunal' => 'backend (étage profond : etages.profond)',
        'backend_rapide' => 'backend (étage rapide : etages.rapide)',
        'backend_tribunal_local' => 'backend local (--donnees-reelles), sans objet sur la plateforme',
        'max_workers' => 'exécution : parallelisme.appels_directs',
        'parallel_jures' => 'exécution : parallelisme.appels_directs',
        '_note' => 'commentaire',
    ];

    /** The options of twin9.py that set the algorithm, and their setting. */
    private const OPTIONS = [
        '--jours' => '/jours',
        '--sans-relectures' => '/merge/relectures',
        '--rescan' => '/rescan',
        '--sans-etat' => '/memoire',
        '--models' => '/college',
        '--modele-tribunal' => '/etages/profond/modele',
        '--modele-rapide' => '/etages/rapide/modele',
        '--jury' => '/jury/mode',
        '--jury-taille' => '/jury/taille_aleatoire',
        '--leger-passes' => '/juge_leger/passes',
        '--sans-contre-lecture' => '/juge_leger/contre_lecture',
        '--scan-global' => '/scan_global/enabled',
    ];

    /** The other options of twin9.py: files, simulation, sensitive-data guard. */
    private const OPTIONS_HORS_PROFIL = [
        '--portfolio', '--out', '--roster', '--config', '--etat', '--mock', '--salt', '--donnees-reelles',
    ];

    private static PDO $pdo;

    private ProfilRepository $profils;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    protected function setUp(): void
    {
        self::$pdo->exec('DELETE FROM users');   // their profiles cascade
        $this->profils = new ProfilRepository(self::$pdo);
    }

    public function testTheV98ProfileIsValidWithTheChoicesOfThePlan(): void
    {
        $v98 = ProfilRepository::validate(ProfilRepository::v98());

        self::assertSame('complet', $v98->mode);
        self::assertSame('lots', $v98->voie);
        self::assertSame('claude-haiku-5-5', $v98->etages->lecteurs->modele);
        self::assertSame('claude-haiku-5-5', $v98->etages->rapide->modele);
        self::assertSame('claude-sonnet-5-5', $v98->etages->profond->modele);
        self::assertSame('anthropic', $v98->college[0]->famille);
        self::assertSame('coupee', $v98->etages->profond->reflexion);
    }

    /** Every default of the schema is the value the v9.8 profile carries. */
    public function testTheV98ProfileIsTheSchemasDefaults(): void
    {
        $schema = self::schema();
        $v98 = ProfilRepository::v98();
        foreach (self::defaults($schema, $schema) as $pointer => $default) {
            self::assertEquals($default, self::at($v98, $pointer), $pointer);
        }
        self::assertCount(48, (array) self::flatten($v98->troncatures), 'les 48 troncatures de la v9.8');
    }

    public function testNoAlgorithmParameterOfTheV98ConfigIsMissing(): void
    {
        $config = json_decode((string) file_get_contents(self::twinV9() . '/config.json'), false, 512, JSON_THROW_ON_ERROR);
        $v98 = ProfilRepository::v98();
        $schema = self::schema();
        foreach ((array) $config as $key => $value) {
            if (isset(self::HORS_PROFIL[$key])) {
                continue;
            }
            self::assertObjectHasProperty($key, $schema->properties, "$key manque au schéma");
            // the v9.8 profile carries config.json's own values
            self::assertEquals($value, $v98->{$key}, $key);
        }
        foreach (array_keys(self::HORS_PROFIL) as $key) {
            self::assertObjectNotHasProperty($key, $schema->properties, $key);
        }
    }

    public function testEveryAlgorithmOptionOfTheCommandLineHasItsSetting(): void
    {
        preg_match_all('/add_argument\("(--[a-z-]+)"/', (string) file_get_contents(self::twinV9() . '/twin9.py'), $m);
        $options = $m[1];
        sort($options);
        $connues = array_merge(array_keys(self::OPTIONS), self::OPTIONS_HORS_PROFIL);
        sort($connues);
        self::assertSame($connues, $options, 'chaque option de twin9.py est rangée');

        $v98 = ProfilRepository::v98();
        foreach (self::OPTIONS as $option => $pointer) {
            self::assertTrue(self::has($v98, $pointer), "$option : $pointer");
        }
    }

    /** @return iterable<string, array{0: callable(stdClass): void}> */
    public static function unknownKeys(): iterable
    {
        yield 'à la racine' => [static function (stdClass $p): void { $p->inconnue = true; }];
        yield 'une température' => [static function (stdClass $p): void { $p->etages->rapide->temperature = 1; }];
        yield 'dans une étape' => [static function (stdClass $p): void { $p->etapes->greffier = (object) ['seed' => 3]; }];
        yield 'une étape inconnue' => [static function (stdClass $p): void { $p->etapes->huissier = new stdClass(); }];
        yield 'dans un lecteur' => [static function (stdClass $p): void { $p->college[0]->seed = 7; }];
        yield 'dans le jury' => [static function (stdClass $p): void { $p->jury->taille = 4; }];
        yield 'une troncature' => [static function (stdClass $p): void { $p->troncatures->journee->titre = 80; }];
        yield 'dans la stigmergie' => [static function (stdClass $p): void { $p->stigmergie->rho = 0.3; }];
        yield 'la stigmergie dans les calques' => [static function (stdClass $p): void {
            $p->calques->stigmergie = (object) ['enabled' => false];
        }];
    }

    /** @param callable(stdClass): void $change */
    #[DataProvider('unknownKeys')]
    public function testAnUnknownKeyIsRefused(callable $change): void
    {
        $profil = ProfilRepository::v98();
        $change($profil);

        $this->expectException(Twin9Exception::class);
        $this->expectExceptionMessage('Profil invalide');
        ProfilRepository::validate($profil);
    }

    /** @return iterable<string, array{0: string, 1: mixed}> */
    public static function invalidValues(): iterable
    {
        yield 'mode' => ['/mode', 'rapide'];
        yield 'voie' => ['/voie', 'postale'];
        yield 'effort' => ['/etages/profond/effort', 'extreme'];
        yield 'réflexion' => ['/etages/rapide/reflexion', 'desactivee'];
        yield 'modèle hors Claude' => ['/etages/lecteurs/modele', 'gpt-4o'];
        yield 'modèle en majuscules' => ['/etages/rapide/modele', 'Claude-haiku-5-5'];
        yield 'modèle de 81 caractères' => ['/etages/rapide/modele', 'claude-' . str_repeat('a', 74)];
        yield 'fournisseur inconnu' => ['/etages/rapide/fournisseur', 'ollama'];
        yield 'budget de sortie nul' => ['/etages/rapide/budget_sortie', 0];
        yield 'collège vide' => ['/college', []];
        yield 'famille vide' => ['/college', [(object) ['nom' => 'haiku', 'famille' => '']]];
        yield 'nom de lecteur avec dièse' => ['/college', [(object) ['nom' => 'haiku#1', 'famille' => 'anthropic']]];
        yield 'appels directs au-delà de 32' => ['/parallelisme/appels_directs', 33];
        yield 'zéro passe du juge léger' => ['/juge_leger/passes', 0];
        yield 'seuil hors de [0, 1]' => ['/seuils_consensus/conf_min', 1.5];
        yield 'mode de jury' => ['/jury/mode', 'majorite'];
        yield 'jury aléatoire de 7' => ['/jury/taille_aleatoire', 7];
        yield 'troncature nulle' => ['/troncatures/fusion/histoire', 0];
        yield 'budget nul' => ['/budget_usd', 0];
        yield 'durée nulle' => ['/duree_minutes', 0];
        yield 'clé inconnue' => ['/cle', 'voisin'];
        yield 'version de référentiel' => ['/referentiel/version', '7'];
        yield 'zéro journée' => ['/jours', 0];
        yield 'version du schéma' => ['/schemaVersion', '2.0.0'];
        yield 'autre document' => ['/kind', 'referentiel'];
        // the stigmergy (Twin_v9's spec-stigmergie.md §2): the engine converts nothing, a string or a float for an
        // integer would fail the run; ρ below 0.2 lets a trace vanish at once
        yield 'stigmergie sans enabled' => ['/stigmergie', (object) ['evaporation' => 0.3]];
        yield 'stigmergie en booléen' => ['/stigmergie', true];
        yield 'enabled en chaîne' => ['/stigmergie', (object) ['enabled' => 'true']];
        yield 'enabled en entier' => ['/stigmergie', (object) ['enabled' => 1]];
        yield 'évaporation sous 0,2' => ['/stigmergie', (object) ['enabled' => true, 'evaporation' => 0.1]];
        yield 'évaporation nulle' => ['/stigmergie', (object) ['enabled' => true, 'evaporation' => 0]];
        yield 'évaporation au-delà de 1' => ['/stigmergie', (object) ['enabled' => true, 'evaporation' => 1.5]];
        yield 'évaporation en chaîne' => ['/stigmergie', (object) ['enabled' => true, 'evaporation' => '0.3']];
        yield 'exploration négative' => ['/stigmergie', (object) ['enabled' => true, 'exploration' => -0.1]];
        yield 'exploration au-delà de 1' => ['/stigmergie', (object) ['enabled' => true, 'exploration' => 1.01]];
        yield 'exploration booléenne' => ['/stigmergie', (object) ['enabled' => true, 'exploration' => true]];
        yield 'graine fractionnaire' => ['/stigmergie', (object) ['enabled' => true, 'graine' => 1.5]];
        yield 'graine en chaîne' => ['/stigmergie', (object) ['enabled' => true, 'graine' => '1']];
        yield 'lignes au-delà de 10' => ['/stigmergie', (object) ['enabled' => true, 'lignes' => 11]];
        yield 'lignes négatives' => ['/stigmergie', (object) ['enabled' => true, 'lignes' => -1]];
        yield 'lignes en liste' => ['/stigmergie', (object) ['enabled' => true, 'lignes' => [5]]];
    }

    #[DataProvider('invalidValues')]
    public function testAnInvalidValueIsRefused(string $pointer, mixed $value): void
    {
        $profil = ProfilRepository::v98();
        self::set($profil, $pointer, $value);

        $this->expectException(Twin9Exception::class);
        $this->expectExceptionMessage('Profil invalide');
        ProfilRepository::validate($profil);
    }

    public function testTwoReadersCannotShareAName(): void
    {
        $profil = ProfilRepository::v98();
        $profil->college[] = (object) ['nom' => 'haiku', 'famille' => 'anthropic'];

        $this->expectExceptionMessage('deux lecteurs portent le nom « haiku »');
        ProfilRepository::validate($profil);
    }

    /** As the v9.8 reads its config.json with .get(key, default). */
    public function testAMissingSettingTakesItsDefault(): void
    {
        $profil = ProfilRepository::v98();
        unset($profil->voie, $profil->troncatures->tribunal->prescription, $profil->college[0]->poids,
            $profil->jury->graine, $profil->referentiel->version);

        $complet = ProfilRepository::validate($profil);
        self::assertEquals(ProfilRepository::v98(), $complet);
        self::assertSame(800, $complet->troncatures->tribunal->prescription);
        self::assertSame(1.0, $complet->college[0]->poids);
        self::assertObjectNotHasProperty('voie', $profil, 'the profile given is left untouched');
    }

    /**
     * The greffier's stigmergy, off by default (Twin_v9's spec-stigmergie.md
     * §2): the v9.8 profile says so; a profile stored before it, without the
     * key, gets {enabled: false}, nothing more — its settings have no
     * default in the schema, the engine's apply.
     */
    public function testTheStigmergyIsOffByDefault(): void
    {
        self::assertEquals((object) ['enabled' => false], ProfilRepository::v98()->stigmergie);
        self::assertNotContains('stigmergie', self::schema()->required, 'hors de required');

        $avant = ProfilRepository::v98();
        unset($avant->stigmergie);
        $complet = ProfilRepository::validate($avant);
        self::assertEquals((object) ['enabled' => false], $complet->stigmergie);
        self::assertEquals(ProfilRepository::validate(ProfilRepository::v98()), $complet);

        $allumee = ProfilRepository::v98();
        $allumee->stigmergie = (object) ['enabled' => true];
        self::assertEquals((object) ['enabled' => true], ProfilRepository::validate($allumee)->stigmergie);

        // the bounds, reached
        $allumee->stigmergie = (object) ['enabled' => true, 'evaporation' => 0.2, 'exploration' => 0, 'graine' => -3,
                                         'lignes' => 0];
        self::assertSame(['enabled' => true, 'evaporation' => 0.2, 'exploration' => 0.0, 'graine' => -3, 'lignes' => 0],
            (array) ProfilRepository::validate($allumee)->stigmergie);
        $allumee->stigmergie = (object) ['enabled' => true, 'evaporation' => 1, 'exploration' => 1, 'lignes' => 10];
        self::assertSame(['enabled' => true, 'evaporation' => 1.0, 'exploration' => 1.0, 'lignes' => 10],
            (array) ProfilRepository::validate($allumee)->stigmergie);
    }

    /**
     * What the schema says of the stigmergy is what the engine does
     * (Stigmergie::DEFAUTS, LIGNES_MAX): its settings, absent, take the
     * engine's values, which their descriptions give; the preset writes
     * them. Without the engine's stigmergy, this test skips.
     */
    public function testTheStigmergysValuesAreTheEngines(): void
    {
        if (!EngineLoader::load() || !class_exists(\Twin9\Stigmergie::class)) {
            self::markTestSkipped('Twin_v9 absent (TWIN_V9_DIR), ou sans la stigmergie');
        }
        $noeud = self::schema()->properties->stigmergie;
        $ecrites = [];
        foreach (\Twin9\Stigmergie::DEFAUTS as $cle => $valeur) {
            self::assertSame(1, preg_match('/Absent : ([0-9,]+), la valeur du moteur/', $noeud->properties->{$cle}->description,
                $m), $cle);
            $ecrites[$cle] = str_contains($m[1], ',') ? (float) str_replace(',', '.', $m[1]) : (int) $m[1];
            self::assertObjectNotHasProperty('default', $noeud->properties->{$cle}, "$cle : la valeur du moteur, pas du schéma");
        }
        self::assertSame(\Twin9\Stigmergie::DEFAUTS, $ecrites);
        self::assertSame(\Twin9\Stigmergie::LIGNES_MAX, $noeud->properties->lignes->maximum);
        self::assertSame(\Twin9\Stigmergie::DEFAUTS, array_diff_key((array) ProfilRepository::predefini('stigmergie')->stigmergie,
            ['enabled' => true]));
    }

    /**
     * An integer the schema wants is an integer, whatever form it came in:
     * the schema admits 5.0 as an integer, the engine's stigmergy does not
     * (Stigmergie::reglages(): TypeError); as a number stays a float.
     */
    public function testAnIntegerStaysAnInteger(): void
    {
        $profil = ProfilRepository::v98();
        $profil->stigmergie = (object) ['enabled' => true, 'graine' => 5.0, 'lignes' => 4.0];
        $profil->jury->graine = 2.0;
        $profil->jours = 3.0;
        $profil->troncatures->journee->calques_extrait = 240.0;

        $valide = ProfilRepository::validate($profil);
        self::assertSame([5, 4, 2, 3, 240], [$valide->stigmergie->graine, $valide->stigmergie->lignes, $valide->jury->graine,
                                             $valide->jours, $valide->troncatures->journee->calques_extrait]);
        self::assertSame(1.0, $valide->college[0]->poids);
        self::assertStringContainsString('"graine":5,"lignes":4', json_encode($valide->stigmergie, JSON_PRESERVE_ZERO_FRACTION));
    }

    /**
     * The trial preset of the stigmergy, a starting point a new profile
     * copies: valid, and the v9.8 profile but for the stigmergy on with the
     * engine's values written, the archived layers out of the consensus
     * (Q3) and every day read again (rescan: the reinforcement asks for it,
     * spec-stigmergie.md §11.3) — the v9.8 profile changed, the preset
     * follows.
     */
    public function testTheStigmergyPresetIsTheV98ProfileWithTheStigmergyOn(): void
    {
        self::assertSame(['stigmergie' => 'Stigmergie (essai)'], ProfilRepository::PREDEFINIS);
        $essai = ProfilRepository::predefini('stigmergie');
        self::assertEquals($essai, ProfilRepository::validate($essai), 'complet et valide');

        $v98 = self::feuilles(ProfilRepository::v98());
        $feuilles = self::feuilles($essai);
        $diff = [];
        foreach ($feuilles + $v98 as $pointer => $_) {
            if (($v98[$pointer] ?? null) !== ($feuilles[$pointer] ?? null)) {
                $diff[$pointer] = $feuilles[$pointer] ?? null;
            }
        }
        ksort($diff);
        self::assertSame(['/calques/accumulation' => false, '/rescan' => true, '/stigmergie/enabled' => true,
                          '/stigmergie/evaporation' => 0.3, '/stigmergie/exploration' => 0.2, '/stigmergie/graine' => 1,
                          '/stigmergie/lignes' => 5], $diff);
        self::assertNotSame($essai, ProfilRepository::predefini('stigmergie'), 'une copie à chaque appel');

        $this->expectException(\InvalidArgumentException::class);
        ProfilRepository::predefini('v98');
    }

    /** @return iterable<string, array{0: string}> */
    public static function settingsWithoutDefault(): iterable
    {
        yield 'le collège' => ['/college'];
        yield 'un étage' => ['/etages/rapide'];
        yield 'le modèle d’un étage' => ['/etages/profond/modele'];
        yield 'le jury entier' => ['/jury'];
    }

    #[DataProvider('settingsWithoutDefault')]
    public function testAMissingSettingWithoutDefaultIsRefused(string $pointer): void
    {
        $profil = ProfilRepository::v98();
        $keys = explode('/', ltrim($pointer, '/'));
        $last = array_pop($keys);
        $node = $profil;
        foreach ($keys as $key) {
            $node = \is_array($node) ? $node[(int) $key] : $node->{$key};
        }
        unset($node->{$last});

        $this->expectExceptionMessage('Profil invalide');
        ProfilRepository::validate($profil);
    }

    /**
     * A profile names the provider of a stage, a step, a reader or the
     * second instance, or inherits it (ADR-012): the schema gives it no
     * default, a reader's family is optional, and each call resolves to its
     * provider and its model.
     */
    public function testAProfileNamesItsProviders(): void
    {
        $profil = self::mixte();

        $valide = ProfilRepository::validate($profil);
        self::assertObjectNotHasProperty('fournisseur', $valide->etages->lecteurs, 'aucune valeur par défaut injectée');
        self::assertObjectNotHasProperty('fournisseur', $valide->college[0]);
        self::assertObjectNotHasProperty('famille', $valide->college[1]);
        $s = new CallSettings($valide);
        self::assertSame(['mistral', 'modele-fictif'], self::fm($s->pour('accusation', 'x')));
        self::assertSame(['mistral', 'modele-fictif'], self::fm($s->pour('defense', 'x')),
            'le fournisseur de son étage, sans modèle');
        self::assertSame(['openai', 'modele-fictif-2'], self::fm($s->pour('greffier', 'x')));
        self::assertSame(['anthropic', 'claude-haiku-5-5'], self::fm($s->pour('leger', 'x')));
        self::assertSame(['openrouter', 'editeur/modele-fictif'], self::fm($s->pour('greffier', 'second_ressort/x')));
        self::assertSame(['google', 'modele-fictif-3'], self::fm($s->pour('tagger', 'journees/J/tags_lecteur-b_P2.json')));
        self::assertSame(['anthropic', 'claude-haiku-5-5'], self::fm($s->pour('tagger', 'journees/J/tags_haiku#1_P1.json')));
        self::assertSame('directe', $s->pour('greffier', 'x')['voie'], 'hors Anthropic, toujours en direct');
        self::assertSame('lots', $s->pour('leger', 'x')['voie']);
    }

    /** @return iterable<string, array{0: callable(stdClass): void, 1: string}> */
    public static function providerRules(): iterable
    {
        yield 'une étape change de fournisseur sans modèle' => [static function (stdClass $p): void {
            $p->etapes->greffier = (object) ['fournisseur' => 'openai'];
        }, 'greffier : un autre fournisseur que celui de son étage (OpenAI) demande son modèle, dans le même réglage'];
        yield 'un lecteur change de fournisseur sans modèle' => [static function (stdClass $p): void {
            $p->college[0]->fournisseur = 'mistral';
        }, 'lecteur haiku : un autre fournisseur que celui de l’étage des lecteurs (Mistral AI) demande son modèle'];
        yield 'le second ressort nomme un fournisseur sans modèle, même celui de son étage' => [
            static function (stdClass $p): void {
                $p->etapes->second_ressort = (object) ['fournisseur' => 'anthropic'];
            }, 'second_ressort : un fournisseur nommé au second ressort (Anthropic) demande son modèle'];
        yield 'un modèle Claude ailleurs' => [static function (stdClass $p): void {
            $p->etapes->greffier = (object) ['fournisseur' => 'openai', 'modele' => 'claude-sonnet-5-5'];
        }, 'greffier : « claude-sonnet-5-5 » n’est pas un identifiant de modèle chez OpenAI (« claude-… » est réservé '
            . 'à Anthropic)'];
        yield 'un modèle d’ailleurs chez Anthropic' => [static function (stdClass $p): void {
            $p->etapes->president = (object) ['modele' => 'modele-fictif'];
        }, 'president : « modele-fictif » n’est pas un identifiant de modèle chez Anthropic (« claude-… »)'];
        yield 'un étage d’un autre fournisseur garde un modèle Claude' => [static function (stdClass $p): void {
            $p->etages->profond->fournisseur = 'mistral';
        }, '« claude-sonnet-5-5 » n’est pas un identifiant de modèle chez Mistral AI'];
        yield 'un lecteur hérite d’un fournisseur qui ne sert pas son modèle' => [static function (stdClass $p): void {
            $p->etages->lecteurs = (object) ['fournisseur' => 'xai', 'modele' => 'modele-fictif', 'budget_sortie' => 100,
                                             'reflexion' => 'coupee'];
            $p->college[0]->modele = 'claude-haiku-5-5';
        }, 'lecteur haiku : « claude-haiku-5-5 » n’est pas un identifiant de modèle chez xAI (Grok)'];
        yield 'un suffixe OpenRouter' => [static function (stdClass $p): void {
            $p->etapes->greffier = (object) ['fournisseur' => 'openrouter', 'modele' => 'editeur/modele-fictif:free'];
        }, 'chez OpenRouter (« éditeur/modèle », sans suffixe « : »)'];
        yield 'un slug OpenRouter sans éditeur' => [static function (stdClass $p): void {
            $p->etapes->greffier = (object) ['fournisseur' => 'openrouter', 'modele' => 'modele-fictif'];
        }, 'chez OpenRouter'];
        yield 'un modèle Gemini dans un chemin' => [static function (stdClass $p): void {
            $p->etapes->greffier = (object) ['fournisseur' => 'google', 'modele' => 'editeur/modele-fictif'];
        }, 'chez Google (Gemini) (ni « / » ni « : »)'];
        yield 'un modèle Gemini avec un deux-points' => [static function (stdClass $p): void {
            $p->etapes->greffier = (object) ['fournisseur' => 'google', 'modele' => 'modele:fictif'];
        }, 'chez Google (Gemini)'];
        yield 'un effort hors Anthropic' => [static function (stdClass $p): void {
            $p->etapes->greffier = (object) ['fournisseur' => 'mistral', 'modele' => 'modele-fictif', 'effort' => 'low'];
        }, 'greffier : l’effort est propre à Anthropic ; un appel chez Mistral AI n’en a aucun'];
        yield 'un effort hérité de son étage hors Anthropic' => [static function (stdClass $p): void {
            $p->etages->rapide->effort = 'low';
            $p->etapes->greffier = (object) ['fournisseur' => 'mistral', 'modele' => 'modele-fictif'];
        }, 'greffier : l’effort est propre à Anthropic ; un appel chez Mistral AI n’en a aucun, pas même celui de son étage'];
        yield 'un effort au second ressort d’une étape tierce' => [static function (stdClass $p): void {
            $p->etapes->greffier = (object) ['fournisseur' => 'mistral', 'modele' => 'modele-fictif'];
            $p->etapes->second_ressort = (object) ['effort' => 'low'];
        }, 'greffier au second ressort : l’effort est propre à Anthropic'];
    }

    /** @param callable(stdClass): void $change */
    #[DataProvider('providerRules')]
    public function testTheProvidersRules(callable $change, string $message): void
    {
        $profil = ProfilRepository::v98();
        $change($profil);

        try {
            ProfilRepository::validate($profil);
            self::fail('profil admis');
        } catch (Twin9Exception $e) {
            self::assertSame(422, $e->getStatusCode());
            self::assertStringStartsWith('Profil invalide — ', $e->getMessage());
            self::assertStringContainsString($message, $e->getMessage());
        }
    }

    /** A provider named where it is inherited anyway needs no model; a family, absent, is its provider's. */
    public function testAnInheritedProviderNeedsNoModel(): void
    {
        $profil = ProfilRepository::v98();
        $profil->etages->rapide->fournisseur = 'anthropic';
        $profil->etapes->greffier = (object) ['fournisseur' => 'anthropic', 'budget_sortie' => 1000];
        $profil->college[0]->fournisseur = 'anthropic';
        unset($profil->college[0]->famille);

        $valide = ProfilRepository::validate($profil);
        self::assertSame('anthropic', $valide->etapes->greffier->fournisseur);
        self::assertObjectNotHasProperty('famille', $valide->college[0]);
    }

    public function testAProfileIsStoredReadAndChangedByItsOwner(): void
    {
        $ada = self::user('ada');
        $profil = ProfilRepository::v98();
        $profil->etapes->president = (object) ['modele' => 'claude-opus-5-5', 'reflexion' => 'adaptative'];
        $id = $this->profils->create($ada, 'Mon profil', $profil);

        $lu = $this->profils->get($id);
        self::assertNotNull($lu);
        self::assertSame($ada, $lu['user_id']);
        self::assertSame('Mon profil', $lu['nom']);
        self::assertEquals($profil, $lu['profil']);
        // what a PHP array would lose: a float stays a float, an empty object stays an object
        self::assertIsFloat($lu['profil']->college[0]->poids);
        self::assertInstanceOf(stdClass::class, $lu['profil']->jury->specialistes);

        $profil->voie = 'directe';
        $profil->mode = 'test';
        $this->profils->update($id, $ada, $profil, 'Essais');
        $lu = $this->profils->get($id);
        self::assertNotNull($lu);
        self::assertSame('Essais', $lu['nom']);
        self::assertSame('directe', $lu['profil']->voie);
        self::assertSame('test', $lu['profil']->mode);
        self::assertSame([['id' => $id, 'nom' => 'Essais', 'updated_at' => $lu['updated_at']]],
            $this->profils->listForUser($ada));
    }

    public function testNobodyElseChangesOrDeletesAProfile(): void
    {
        $ada = self::user('ada');
        $bob = self::user('bob');
        $id = $this->profils->create($ada, 'Mon profil', ProfilRepository::v98());

        self::assertFalse($this->profils->delete($id, $bob));
        self::assertSame([], $this->profils->listForUser($bob));
        try {
            $this->profils->update($id, $bob, ProfilRepository::v98());
            self::fail('Bob a modifié le profil d’Ada');
        } catch (Twin9Exception $e) {
            self::assertSame(404, $e->getStatusCode());
        }
        self::assertTrue($this->profils->delete($id, $ada));
        self::assertNull($this->profils->get($id));
    }

    public function testAnInvalidProfileIsNeverWritten(): void
    {
        $ada = self::user('ada');
        $profil = ProfilRepository::v98();
        $profil->voie = 'postale';
        try {
            $this->profils->create($ada, 'Mon profil', $profil);
            self::fail('profil invalide enregistré');
        } catch (Twin9Exception $e) {
            self::assertSame(422, $e->getStatusCode());
        }
        self::assertSame([], $this->profils->listForUser($ada));

        $id = $this->profils->create($ada, 'Mon profil', ProfilRepository::v98());
        try {
            $this->profils->update($id, $ada, $profil);
            self::fail('profil invalide enregistré');
        } catch (Twin9Exception $e) {
            self::assertSame(422, $e->getStatusCode());
        }
        self::assertSame('lots', $this->profils->get($id)['profil']->voie ?? null);
    }

    public function testAProfileArrivesAsJsonTextToo(): void
    {
        $ada = self::user('ada');
        $id = $this->profils->create($ada, 'Texte', json_encode(ProfilRepository::v98(), JSON_PRESERVE_ZERO_FRACTION));
        self::assertEquals(ProfilRepository::v98(), $this->profils->get($id)['profil'] ?? null);

        foreach (['{"mode":' => 'Profil illisible', '[]' => 'objet JSON attendu'] as $texte => $message) {
            try {
                ProfilRepository::validate($texte);
                self::fail($texte);
            } catch (Twin9Exception $e) {
                self::assertStringContainsString($message, $e->getMessage());
            }
        }
    }

    public function testNamesAreUniquePerOwnerAndBounded(): void
    {
        $ada = self::user('ada');
        $bob = self::user('bob');
        $this->profils->create($ada, 'Mon profil', ProfilRepository::v98());
        $this->profils->create($bob, 'Mon profil', ProfilRepository::v98());
        foreach (['Mon profil' => 409, '   ' => 422, str_repeat('é', 121) => 422] as $nom => $status) {
            try {
                $this->profils->create($ada, $nom, ProfilRepository::v98());
                self::fail($nom);
            } catch (Twin9Exception $e) {
                self::assertSame($status, $e->getStatusCode(), $nom);
            }
        }
    }

    public function testAccountPurgeRemovesItsProfiles(): void
    {
        $ada = self::user('ada');
        $id = $this->profils->create($ada, 'Mon profil', ProfilRepository::v98());
        self::$pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$ada]);

        self::assertNull($this->profils->get($id));
    }

    /**
     * A mixed profile, its providers' models invented: the deep stage at
     * Mistral, the greffier at OpenAI, the second instance at OpenRouter, a
     * reader of its own at Google, without family; the rest Anthropic's.
     */
    private static function mixte(): stdClass
    {
        $profil = ProfilRepository::v98();
        $profil->etages->profond = (object) ['fournisseur' => 'mistral', 'modele' => 'modele-fictif',
                                             'budget_sortie' => 8000, 'reflexion' => 'coupee'];
        $profil->etapes->greffier = (object) ['fournisseur' => 'openai', 'modele' => 'modele-fictif-2'];
        $profil->etapes->defense = (object) ['fournisseur' => 'mistral'];
        $profil->etapes->second_ressort = (object) ['fournisseur' => 'openrouter', 'modele' => 'editeur/modele-fictif'];
        $profil->college[] = (object) ['nom' => 'lecteur-b', 'fournisseur' => 'google', 'modele' => 'modele-fictif-3'];

        return $profil;
    }

    /**
     * @param array{fournisseur: string, modele: string} $reglage
     * @return array{0: string, 1: string}
     */
    private static function fm(array $reglage): array
    {
        return [$reglage['fournisseur'], $reglage['modele']];
    }

    private static function user(string $name): int
    {
        self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([$name . '@test.invalid', 'x', $name]);

        return (int) self::$pdo->lastInsertId();
    }

    private static function twinV9(): string
    {
        $dir = EngineLoader::directory();
        if (!is_file($dir . '/config.json') || !is_file($dir . '/twin9.py')) {
            self::markTestSkipped('Twin_v9 absent (TWIN_V9_DIR) : la v9.8 n’est pas là pour comparer');
        }

        return $dir;
    }

    private static function schema(): stdClass
    {
        return json_decode(
            (string) file_get_contents(\dirname(__DIR__, 3) . '/schemas/twin9-profil.schema.json'),
            false, 512, JSON_THROW_ON_ERROR,
        );
    }

    /**
     * The defaults the schema declares, by JSON pointer.
     *
     * @return array<string, mixed>
     */
    private static function defaults(stdClass $node, stdClass $schema, string $pointer = ''): array
    {
        if (isset($node->{'$ref'})) {
            $target = $schema->{'$defs'}->{basename($node->{'$ref'})};
            $node = (object) array_merge((array) $target, (array) $node);
        }
        if (property_exists($node, 'default') && $pointer !== '') {
            return [$pointer => $node->default];
        }
        $out = [];
        foreach ((array) ($node->properties ?? []) as $key => $child) {
            if (\in_array($key, (array) ($node->required ?? []), true)) {
                $out += self::defaults($child, $schema, $pointer . '/' . $key);
            }
        }

        return $out;
    }

    private static function at(stdClass $doc, string $pointer): mixed
    {
        self::assertTrue(self::has($doc, $pointer), "$pointer absent du profil v9.8");
        $node = $doc;
        foreach (explode('/', ltrim($pointer, '/')) as $key) {
            $node = $node->{$key};
        }

        return $node;
    }

    private static function has(stdClass $doc, string $pointer): bool
    {
        $node = $doc;
        foreach (explode('/', ltrim($pointer, '/')) as $key) {
            if (!\is_object($node) || !property_exists($node, $key)) {
                return false;
            }
            $node = $node->{$key};
        }

        return true;
    }

    private static function set(stdClass $doc, string $pointer, mixed $value): void
    {
        $keys = explode('/', ltrim($pointer, '/'));
        $last = array_pop($keys);
        $node = $doc;
        foreach ($keys as $key) {
            $node = $node->{$key};
        }
        $node->{$last} = $value;
    }

    /**
     * A document's leaves, by JSON pointer.
     *
     * @return array<string, mixed>
     */
    private static function feuilles(mixed $valeur, string $pointer = ''): array
    {
        if (!$valeur instanceof stdClass && !\is_array($valeur)) {
            return [$pointer => $valeur];
        }
        $out = [];
        foreach ((array) $valeur as $cle => $enfant) {
            $out += self::feuilles($enfant, $pointer . '/' . $cle);
        }

        return $out;
    }

    /** @return array<string, int> the leaves of the truncations, by group/name */
    private static function flatten(stdClass $troncatures): array
    {
        $out = [];
        foreach ((array) $troncatures as $groupe => $valeurs) {
            foreach ((array) $valeurs as $nom => $valeur) {
                $out["$groupe/$nom"] = $valeur;
            }
        }

        return $out;
    }
}
