<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\MigrationRunner;
use Humanome\Tests\TestDb;
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
        yield 'budget de sortie nul' => ['/etages/rapide/budget_sortie', 0];
        yield 'collège vide' => ['/college', []];
        yield 'lecteur sans famille' => ['/college', [(object) ['nom' => 'haiku', 'passes' => 3]]];
        yield 'nom de lecteur avec dièse' => ['/college', [(object) ['nom' => 'haiku#1', 'famille' => 'anthropic']]];
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

    /** @return iterable<string, array{0: string}> */
    public static function settingsWithoutDefault(): iterable
    {
        yield 'le collège' => ['/college'];
        yield 'un étage' => ['/etages/rapide'];
        yield 'le modèle d’un étage' => ['/etages/profond/modele'];
        yield 'le jury entier' => ['/jury'];
        yield 'la famille d’un lecteur' => ['/college/0/famille'];
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
