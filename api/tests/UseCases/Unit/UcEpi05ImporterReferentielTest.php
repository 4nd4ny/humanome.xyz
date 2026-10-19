<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\MigrationRunner;
use Humanome\Referentiel\ConflictException;
use Humanome\Referentiel\ContentHash;
use Humanome\Referentiel\InvalidDocumentException;
use Humanome\Referentiel\ReferentielRepository;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\ReferentielsFictifs;
use Humanome\Validation;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-EPI-05 — Importer un référentiel d'une autre structure : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/epistemiarque/UC-EPI-05-importer-referentiel.md
 *
 * Logique appelée directement : ReferentielRepository (niveaux, motifs,
 * lecture à un niveau, contrôles, import en brouillon, catalogue, brouillons
 * d'un auteur), ContentHash (niveaux et éléments gardés hors de l'empreinte),
 * le schéma 2.0.0. Référentiels FICTIFS (ReferentielsFictifs) ; RESPIRE par
 * son instantané versionné, qui ne change pas.
 */
final class UcEpi05ImporterReferentielTest extends TestCase
{
    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    protected function setUp(): void
    {
        foreach (['referentiel_snapshot_competences', 'referentiel_votes', 'referentiel_versions', 'user_roles', 'users'] as $table) {
            self::$pdo->exec('DELETE FROM ' . $table);
        }
    }

    private static function repo(): ReferentielRepository
    {
        return new ReferentielRepository(self::$pdo);
    }

    /** @return array<string, mixed> RESPIRE v7 (instantané versionné schemas/fixtures) */
    private static function respire(): array
    {
        return json_decode((string) file_get_contents(\dirname(__DIR__, 4) . '/schemas/fixtures/referentiel-respire-v7.json'),
            true, 512, JSON_THROW_ON_ERROR);
    }

    private static function createUser(): int
    {
        self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([uniqid('epi', true) . '@example.org', 'x', 'Membre']);

        return (int) self::$pdo->lastInsertId();
    }

    /** @return array<string, list<string>> the errors of a refused document */
    private static function errors(array $doc): array
    {
        try {
            self::repo()->validateDocument($doc);
        } catch (InvalidDocumentException $e) {
            return $e->getErrors();
        }
        self::fail('document accepté');
    }

    #[TestDox('UC-EPI-05-U01 — RESPIRE ne change pas : son document se valide tel quel, même empreinte, même forme ; le schéma garde ses 7 pôles, ses 61 compétences « P.NN » et son seul niveau')]
    public function testU01RespireIsUnchanged(): void
    {
        $doc = self::respire();
        $normalized = self::repo()->validateDocument($doc);

        self::assertSame($doc['contentHash'], $normalized['contentHash']);
        self::assertSame(ContentHash::encode(ContentHash::normalize($doc)), ContentHash::encode($normalized));
        self::assertArrayNotHasKey('niveaux', $normalized);
        self::assertSame([['nom' => 'compétence', 'motif' => '\d\.\d{2}']], ReferentielRepository::niveaux($normalized));
        self::assertTrue(Validation::validate('referentiel', $doc)['valid']);
        // its structure is the schema's: a lettered code (sorted last), a competence less, a declared level
        $lettre = $doc;
        $lettre['competences'][0]['code'] = 'A1';
        $moins = $doc;
        array_pop($moins['competences']);
        $niveaux = ['niveaux' => [['nom' => 'capacité', 'motif' => '\d\.\d{2}']]] + $doc;
        foreach ([[$lettre, '/competences/60/code'], [$moins, '/competences'], [$niveaux, '/']] as [$refuse, $pointeur]) {
            try {
                self::repo()->validateDocument($refuse);
                self::fail('RESPIRE modifié accepté : ' . $pointeur);
            } catch (InvalidDocumentException $e) {
                self::assertSame('Document does not conform to the referentiel schema', $e->getMessage());
                self::assertArrayHasKey($pointeur, $e->getErrors(), json_encode($e->getErrors(), JSON_UNESCAPED_UNICODE));
            }
        }
    }

    #[TestDox('UC-EPI-05-U02 — d’autres structures s’enregistrent : 5 pôles lettrés à deux niveaux, 9 pôles ; leur empreinte ne compte que pôles et compétences')]
    public function testU02OtherStructuresAreValid(): void
    {
        $lettre = self::repo()->validateDocument(ReferentielsFictifs::lettre());
        self::assertCount(5, $lettre['poles']);
        self::assertCount(20, $lettre['competences']);
        self::assertSame(['schemaVersion', 'kind', 'id', 'version', 'label', 'contentHash', 'source', 'niveaux', 'poles',
                          'competences'], array_keys($lettre));
        self::assertSame(['code', 'nom', 'pole', 'description', 'elements'], array_keys($lettre['competences'][0]));
        self::assertSame(['code', 'nom', 'description'], array_keys($lettre['competences'][0]['elements'][0]));

        $neuf = self::repo()->validateDocument(ReferentielsFictifs::neufPoles());
        self::assertCount(9, $neuf['poles']);
        self::assertCount(18, $neuf['competences']);

        // a pole numbered 1.0 (an integer for JSON Schema) is pole 1
        $flottant = ReferentielsFictifs::neufPoles();
        $flottant['poles'][0]['num'] = 1.0;
        $flottant['competences'][0]['pole'] = 1.0;
        self::assertCount(9, self::repo()->validateDocument($flottant)['poles']);

        // niveaux, pole descriptions and elements stay out of the hash
        $nu = ReferentielsFictifs::lettre();
        unset($nu['niveaux']);
        foreach ($nu['poles'] as $i => $p) {
            unset($nu['poles'][$i]['description']);
        }
        foreach ($nu['competences'] as $i => $c) {
            unset($nu['competences'][$i]['elements'], $nu['competences'][$i]['description']);
        }
        self::assertSame(ContentHash::compute($nu), $lettre['contentHash']);
    }

    #[TestDox('UC-EPI-05-U03 — motifs : un code suit celui de son niveau en entier ; un motif illisible n’a pas d’expression')]
    public function testU03Motifs(): void
    {
        $regex = ReferentielRepository::regexDuMotif('[A-E][1-4]');
        self::assertNotNull($regex);
        self::assertSame(1, preg_match($regex, 'A1'));
        foreach (['A5', 'A1.1', 'xA1', "A1\n", 'a1'] as $code) {
            self::assertSame(0, preg_match($regex, $code), $code);
        }
        self::assertSame(1, preg_match((string) ReferentielRepository::regexDuMotif('a/b'), 'a/b'));
        self::assertNull(ReferentielRepository::regexDuMotif('[A-E'));
        // a motif stays inside its anchors: one that would close the group early, or
        // a verb that ends the match before the end anchor, would let every code through
        foreach (['Z)|(?:', '(*ACCEPT)Z', 'Z(*COMMIT)', '(*pla:A)A1', 'Z\\'] as $motif) {
            self::assertNull(ReferentielRepository::regexDuMotif($motif), $motif);
        }
    }

    #[TestDox('UC-EPI-05-U04 — contrôles : code hors motif, élément d’un niveau non déclaré, code en double, pôles avec un trou, motif illisible, chacun à son pointeur')]
    public function testU04Checks(): void
    {
        $doc = ReferentielsFictifs::lettre();
        $doc['competences'][0]['code'] = 'A9';
        $errors = self::errors($doc);
        // the pointers are the document's sorted by code, as every check's: A9 comes after A4
        self::assertSame(['« A9 » ne suit pas le motif [A-E][1-4] du niveau « capacité »'], $errors['/competences/3/code'] ?? null);

        $doc = ReferentielsFictifs::lettre();
        $doc['competences'][0]['elements'][0]['code'] = 'A1-1';
        self::assertArrayHasKey('/competences/0/elements/0/code', self::errors($doc));

        $doc = ReferentielsFictifs::lettre();
        $doc['competences'][0]['elements'][0]['elements'] = [['code' => 'A1.1.a', 'nom' => 'Trop fin']];
        self::assertStringContainsString('ne déclare pas', implode(' ', self::errors($doc)['/competences/0/elements/0/elements/0']));

        $doc = ReferentielsFictifs::lettre();
        $doc['competences'][1]['elements'][0]['code'] = 'A1.1';
        self::assertSame(['Code dupliqué : A1.1'], self::errors($doc)['/competences/1/elements/0/code'] ?? null);

        $doc = ReferentielsFictifs::neufPoles();
        array_splice($doc['poles'], 4, 1);
        $doc['competences'] = array_values(array_filter($doc['competences'], static fn (array $c): bool => $c['pole'] !== 5));
        self::assertSame(['Les pôles se numérotent de 1 à 8, sans trou'], self::errors($doc)['/poles'] ?? null);

        $doc = ReferentielsFictifs::lettre();
        $doc['niveaux'][1]['motif'] = '[A-E';
        self::assertSame(['Motif illisible : [A-E'], self::errors($doc)['/niveaux/1/motif'] ?? null);
        $doc = ReferentielsFictifs::lettre();
        $doc['niveaux'][0]['motif'] = 'Z)|(?:';
        self::assertSame(['Motif illisible : Z)|(?:'], self::errors($doc)['/niveaux/0/motif'] ?? null);

        // a motif of catastrophic backtracking on its codes (A100001. : seven \w, then a dot)
        // is refused once, at its pointer, instead of costing a million steps for each of
        // them; the PCRE limit is restored after
        $limite = ini_get('pcre.backtrack_limit');
        $doc = ReferentielsFictifs::lettre();
        $doc['niveaux'][1]['motif'] = '(?:\w|\w|\w|\w|\w|\w|\w|\w|\w|\w)*';
        foreach ($doc['competences'] as $i => $c) {
            foreach ($c['elements'] as $j => $facette) {
                $doc['competences'][$i]['elements'][$j]['code'] = $c['code'] . '0000' . ($j + 1) . '.';
            }
        }
        $errors = self::errors($doc);
        self::assertSame(['Motif trop coûteux à évaluer : (?:\w|\w|\w|\w|\w|\w|\w|\w|\w|\w)*'],
            $errors['/niveaux/1/motif'] ?? null, json_encode($errors, JSON_UNESCAPED_UNICODE));
        self::assertSame(['/niveaux/1/motif'], array_keys($errors));
        self::assertSame($limite, ini_get('pcre.backtrack_limit'));

        // a code longer than 8 characters, or of other characters, is outside the schema
        $doc = ReferentielsFictifs::neufPoles();
        $doc['competences'][0]['code'] = '1 01';
        try {
            self::repo()->validateDocument($doc);
            self::fail('code à espace accepté');
        } catch (InvalidDocumentException $e) {
            self::assertSame('Document does not conform to the referentiel schema', $e->getMessage());
        }
    }

    #[TestDox('UC-EPI-05-U05 — lecture à un niveau : les facettes deviennent les compétences, sous le pôle de leur capacité ; les niveaux plus larges partent')]
    public function testU05ReadingAtALevel(): void
    {
        $doc = self::repo()->validateDocument(ReferentielsFictifs::lettre());
        self::assertSame($doc, ReferentielRepository::auNiveau($doc, 0));

        $facettes = ReferentielRepository::auNiveau($doc, 1);
        self::assertCount(40, $facettes['competences']);
        self::assertSame(['code' => 'A1.1', 'nom' => 'Facette fictive A1.1', 'pole' => 1,
                          'description' => "Description fictive.\n\n- Manifestation fictive.\n\n**Faux positif** : fictif."],
            $facettes['competences'][0]);
        self::assertSame(['code' => 'E4.2', 'nom' => 'Facette fictive E4.2', 'pole' => 5], $facettes['competences'][39]);
        self::assertSame([['nom' => 'facette', 'motif' => '[A-E][1-4]\.[1-9]']], $facettes['niveaux']);
        $normalized = self::repo()->validateDocument($facettes);
        self::assertSame('A1.1', $normalized['competences'][0]['code']);

        // a branch that stops above the level would vanish: refused, named; a level without elements too
        $sansFacettes = $doc;
        foreach ($sansFacettes['competences'] as $i => $c) {
            if (\in_array($c['code'], ['B1', 'D3'], true)) {
                unset($sansFacettes['competences'][$i]['elements']);
            }
        }
        $vide = $doc;
        foreach ($vide['competences'] as $i => $c) {
            $vide['competences'][$i]['elements'] = [];
        }
        foreach ([
            [$sansFacettes, 'Sans élément au niveau « facette », ces éléments disparaîtraient de l’import : B1, D3'],
            [$vide, 'Aucun élément au niveau « facette »'],
        ] as [$refuse, $message]) {
            try {
                ReferentielRepository::auNiveau($refuse, 1);
                self::fail('lu au niveau facette : ' . $message);
            } catch (InvalidDocumentException $e) {
                self::assertSame(['/niveau' => [$message]], $e->getErrors());
            }
        }
    }

    #[TestDox('UC-EPI-05-U06 — importDraft : un brouillon de son auteur, au niveau choisi ; RESPIRE, un identifiant invalide, un niveau inconnu ou une version qui existe refusés')]
    public function testU06ImportDraft(): void
    {
        $auteur = self::createUser();
        $draft = self::repo()->importDraft(ReferentielsFictifs::lettre(), null, $auteur);
        self::assertSame(['fictif-lettre', '1.0.0', 'draft', $auteur], [$draft['referentielId'], $draft['semver'],
            $draft['status'], $draft['createdBy']]);
        self::assertCount(20, $draft['content']['competences']);
        self::assertCount(2, $draft['content']['niveaux']);

        $facettes = self::repo()->importDraft(ReferentielsFictifs::lettre('1.1.0'), 'facette', $auteur);
        self::assertCount(40, $facettes['content']['competences']);
        self::assertSame('facette', $facettes['content']['niveaux'][0]['nom']);

        $refus = [
            [self::respire(), null, ConflictException::class, 'compétence par compétence'],
            [['id' => 'Fictif Lettré'] + ReferentielsFictifs::lettre('2.0.0'), null, InvalidDocumentException::class, 'Identifiant'],
            [ReferentielsFictifs::lettre('2.0.0'), 'manifestation', InvalidDocumentException::class, 'Niveau inconnu'],
            [ReferentielsFictifs::lettre(), null, ConflictException::class, 'existe déjà'],
        ];
        foreach ($refus as [$doc, $niveau, $classe, $message]) {
            try {
                self::repo()->importDraft($doc, $niveau, $auteur);
                self::fail($message . ' : accepté');
            } catch (ConflictException|InvalidDocumentException $e) {
                self::assertInstanceOf($classe, $e);
                self::assertStringContainsString($message, $e instanceof InvalidDocumentException
                    ? $e->getMessage() . ' ' . json_encode($e->getErrors(), JSON_UNESCAPED_UNICODE) : $e->getMessage());
            }
        }
        self::assertSame(2, (int) self::$pdo->query('SELECT COUNT(*) FROM referentiel_versions')->fetchColumn());
    }

    #[TestDox('UC-EPI-05-U07 — lectures : catalogue des publiés, brouillons d’un auteur, une version quel que soit son statut, éditables de tous les référentiels')]
    public function testU07Reads(): void
    {
        $auteur = self::createUser();
        $autre = self::createUser();
        self::repo()->importPublishedDocument(self::respire(), 'Import initial');
        $neuf = self::repo()->importPublishedDocument(
            ['contentHash' => ContentHash::compute(ReferentielsFictifs::neufPoles())] + ReferentielsFictifs::neufPoles(), 'Publié');
        self::assertSame('imported', $neuf['status']);
        $brouillon = self::repo()->importDraft(ReferentielsFictifs::lettre(), null, $auteur);
        self::repo()->createDraft('fictif-neuf', '1.0.0', '1.1.0', null, $autre);

        self::assertSame([
            ['id' => 'fictif-neuf', 'label' => 'Fictif à neuf pôles', 'versions' => ['1.0.0']],
            ['id' => 'respire', 'label' => 'RESPIRE v7', 'versions' => ['7.0.0']],
        ], self::repo()->catalogue());
        self::assertSame(['fictif-lettre' => ['1.0.0']], self::repo()->brouillonsDe($auteur));
        self::assertSame(['fictif-neuf' => ['1.1.0']], self::repo()->brouillonsDe($autre));
        self::assertSame($brouillon['id'], self::repo()->findVersion('fictif-lettre', '1.0.0')['id']);
        self::assertSame('published', self::repo()->findVersion('fictif-neuf', '1.0.0')['status']);
        self::assertNull(self::repo()->findVersion('fictif-lettre', '9.9.9'));
        self::assertSame(['fictif-neuf', 'fictif-lettre'], array_column(self::repo()->editableVersions(), 'referentielId'));
        self::assertSame(['fictif-lettre'], array_column(self::repo()->editableVersions('fictif-lettre'), 'referentielId'));
    }

    #[TestDox('UC-EPI-05-U10 — createDraft : la nouvelle version garde l’identifiant de sa source, quelle que soit la graphie demandée')]
    public function testU10AForkKeepsItsSourcesId(): void
    {
        self::repo()->importPublishedDocument(
            ['contentHash' => ContentHash::compute(ReferentielsFictifs::neufPoles())] + ReferentielsFictifs::neufPoles(), 'Publié');
        // the column ignores case and trailing spaces (utf8mb4_unicode_ci): the source is found under either
        foreach ([['FICTIF-NEUF', '1.1.0'], ['fictif-neuf ', '1.2.0']] as [$graphie, $semver]) {
            $fork = self::repo()->createDraft($graphie, '1.0.0', $semver);
            self::assertSame(['fictif-neuf', 'fictif-neuf'], [$fork['referentielId'], $fork['content']['id']], $graphie);
        }
        self::assertSame(['fictif-neuf', 'fictif-neuf'], array_column(self::repo()->editableVersions(), 'referentielId'));
    }
}
