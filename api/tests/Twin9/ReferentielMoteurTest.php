<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\Referentiel\ContentHash;
use Humanome\Referentiel\ReferentielRepository;
use Humanome\Tests\CartographeTestCase;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\ReferentielsFictifs;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\EngineLoader;
use Humanome\Twin9\ProfilRepository;
use Humanome\Twin9\ProtocoleRepository;
use Humanome\Twin9\ReferentielMoteur;
use Humanome\Twin9\Twin9Exception;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunInSeparateProcess;

/**
 * The run's referential as the engine reads it (T16, docs/contrats.md §8.8):
 * drawn from the base at its version; RESPIRE's preambles and fiches those
 * the base keeps, another referential's written from its document, its
 * competences in the natural order of their codes; its fingerprint the same
 * however it is decoded. With the real engine of TWIN_V9_DIR — skipped
 * without it, each such test in a process of its own, for the fake engine
 * may be loaded in the others —, RESPIRE's block reads as the v9.8's pole
 * files, and a referential the engine cannot read is refused at launch.
 */
final class ReferentielMoteurTest extends CartographeTestCase
{
    /** The engine of TWIN_V9_DIR, when the tests run with one: the real one. */
    private string $reel;

    protected function setUp(): void
    {
        parent::setUp();
        $this->reel = EngineLoader::directory();
        self::$pdo->exec('DELETE FROM referentiel_versions');
        $doc = json_decode((string) file_get_contents(\dirname(__DIR__, 3) . '/web/public/data/referentiel/respire-v7.json'),
            true, 512, JSON_THROW_ON_ERROR);
        (new ReferentielRepository(self::$pdo))->importPublishedDocument($doc, 'Import initial RESPIRE v7');
        TestDb::fichesRespire(self::$pdo);
    }

    /** RESPIRE's block: its preambles and fiches are those the base keeps, its 61 competences in its own order. */
    public function testRespiresBlockIsWhatTheBaseKeeps(): void
    {
        $bloc = (new ReferentielMoteur(self::$pdo))->bloc('respire', '7.0.0');
        $corpus = json_decode((string) file_get_contents(\dirname(__DIR__, 3) . '/scripts/data/fiches-v7.json'), true,
            512, JSON_THROW_ON_ERROR);

        self::assertSame(['respire', '7.0.0', 'RESPIRE v7', ReferentielRepository::MOTIF_PAR_DEFAUT],
            [$bloc['id'], $bloc['version'], $bloc['label'], $bloc['motif']]);
        self::assertSame(range(1, 7), array_column($bloc['poles'], 'num'));
        $codes = [];
        foreach ($bloc['poles'] as $pole) {
            self::assertSame($corpus['poleHeaders'][(string) $pole['num']], $pole['entete']);
            foreach ($pole['competences'] as $c) {
                self::assertSame($corpus['fiches'][$c['code']], $c['fiche'], $c['code']);
                self::assertStringStartsWith($pole['num'] . '.', $c['code']);
                $codes[] = $c['code'];
            }
        }
        $tries = array_keys($corpus['fiches']);
        sort($tries, SORT_STRING);
        self::assertSame($tries, $codes);
        self::assertCount(61, $codes);
    }

    /**
     * Another referential's preambles and fiches are written from its
     * document: « # Pôle N — name », then its description; « ## CODE —
     * name », its description, then each finer element one level down.
     */
    public function testAnotherReferentialIsWrittenFromItsDocument(): void
    {
        self::publier(ReferentielsFictifs::lettre());
        self::publier(ReferentielsFictifs::neufPoles());
        $referentiels = new ReferentielMoteur(self::$pdo);

        $lettre = $referentiels->bloc('fictif-lettre', '1.0.0');
        self::assertSame(['fictif-lettre', '1.0.0', 'Fictif lettré', '[A-E][1-4]'],
            [$lettre['id'], $lettre['version'], $lettre['label'], $lettre['motif']], 'le motif de son premier niveau');
        self::assertSame(range(1, 5), array_column($lettre['poles'], 'num'));
        $a = $lettre['poles'][0];
        self::assertSame(['A · Pôle fictif A', "# Pôle 1 — A · Pôle fictif A\n\nCe que cherche le pôle fictif A.\n"],
            [$a['nom'], $a['entete']]);
        self::assertSame(['A1', 'A2', 'A3', 'A4'], array_column($a['competences'], 'code'));
        self::assertSame(['code' => 'A1', 'nom' => 'Capacité fictive A1', 'fiche' => "## A1 — Capacité fictive A1\n\n"
            . "Définition fictive de la capacité A1.\n\n**Frontière** : fictive.\n\n"
            . "### A1.1 — Facette fictive A1.1\n\nDescription fictive.\n\n- Manifestation fictive.\n\n**Faux positif** : fictif.\n\n"
            . '### A1.2 — Facette fictive A1.2'], $a['competences'][0]);

        $neuf = $referentiels->bloc('fictif-neuf', '1.0.0');
        self::assertSame(range(1, 9), array_column($neuf['poles'], 'num'));
        self::assertSame("# Pôle 9 — Pôle fictif 9\n", $neuf['poles'][8]['entete'], 'sans description');
        self::assertSame(['code' => '9.02', 'nom' => 'Compétence fictive 9.02', 'fiche' => '## 9.02 — Compétence fictive 9.02'],
            $neuf['poles'][8]['competences'][1]);
    }

    /** A pole's competences come in the natural order of their codes (A2 before A10), its poles in their order. */
    public function testCompetencesComeInTheNaturalOrderOfTheirCodes(): void
    {
        $doc = ['schemaVersion' => '2.0.0', 'kind' => 'referentiel', 'id' => 'fictif-ordre', 'version' => '1.0.0',
                'label' => 'Fictif ordonné', 'source' => 'Fixture de test (T16) : des codes à un et deux chiffres, fictifs',
                'niveaux' => [['nom' => 'compétence', 'motif' => '[AB]\d{1,2}']],
                'poles' => [['num' => 2, 'nom' => 'B', 'couleur' => null], ['num' => 1, 'nom' => 'A', 'couleur' => null]],
                'competences' => []];
        foreach (['B1' => 2, 'A10' => 1, 'A2' => 1, 'A1' => 1] as $code => $pole) {
            $doc['competences'][] = ['code' => $code, 'nom' => 'Compétence fictive ' . $code, 'pole' => $pole];
        }
        self::publier($doc);

        $bloc = (new ReferentielMoteur(self::$pdo))->bloc('fictif-ordre', '1.0.0');
        self::assertSame([1, 2], array_column($bloc['poles'], 'num'));
        self::assertSame(['A1', 'A2', 'A10'], array_column($bloc['poles'][0]['competences'], 'code'));
    }

    /**
     * RESPIRE without its fiches in the base cannot be read: 503, which says
     * what seeds them; a version the base does not have, 422.
     */
    public function testRespireWithoutItsFichesIsRefused(): void
    {
        $referentiels = new ReferentielMoteur(self::$pdo);
        try {
            $referentiels->bloc('respire', '9.9.9');
            self::fail('une version absente');
        } catch (Twin9Exception $e) {
            self::assertSame([422, 'Référentiel introuvable : respire 9.9.9'], [$e->getStatusCode(), $e->getMessage()]);
        }
        foreach (['referentiel_snapshot_competences', 'competence_votes', 'competence_versions', 'referentiel_poles'] as $table) {
            self::$pdo->exec("DELETE FROM $table");
        }
        try {
            $referentiels->bloc('respire', '7.0.0');
            self::fail('RESPIRE sans ses fiches');
        } catch (Twin9Exception $e) {
            self::assertSame([503, 'Les fiches du référentiel RESPIRE ne sont pas dans la base de cette instance : '
                . 'l’analyse approfondie ne peut partir (php scripts/seed-competences.php les y verse)'],
                [$e->getStatusCode(), $e->getMessage()]);
        }
    }

    /**
     * A version of RESPIRE that names a code the base has no fiche for — a
     * draft that renames one — cannot be read: 422, the code named; not the
     * instance's 503 (review of T16).
     */
    public function testACodeOfRespireWithoutItsFicheIsRefused(): void
    {
        $doc = json_decode((string) file_get_contents(\dirname(__DIR__, 3) . '/web/public/data/referentiel/respire-v7.json'),
            true, 512, JSON_THROW_ON_ERROR);
        unset($doc['contentHash']);
        $doc['version'] = '7.9.0';
        $doc['competences'][0]['code'] = '1.99';
        self::publier($doc);
        try {
            (new ReferentielMoteur(self::$pdo))->bloc('respire', '7.9.0');
            self::fail('un code sans fiche');
        } catch (Twin9Exception $e) {
            self::assertSame([422, 'Le référentiel « respire » ne se lit pas : la compétence 1.99 n’a pas de fiche dans la base'],
                [$e->getStatusCode(), $e->getMessage()]);
        }
    }

    /**
     * The fingerprint covers what changes a prompt — a fiche, a preamble, a
     * name, the motif, the label — however the block is decoded; the leak
     * filter indexes its preambles and fiches; a reader reads a pole's
     * preamble and fiches as the engine joins them.
     */
    public function testTheFingerprintTextsAndSizesOfABlock(): void
    {
        self::publier(ReferentielsFictifs::lettre());
        $bloc = (new ReferentielMoteur(self::$pdo))->bloc('fictif-lettre', '1.0.0');
        $empreinte = ReferentielMoteur::empreinte($bloc);

        self::assertMatchesRegularExpression('/^[0-9a-f]{16}$/', $empreinte);
        self::assertSame($empreinte, ReferentielMoteur::empreinte(json_decode(json_encode($bloc, JSON_THROW_ON_ERROR))),
            'décodé en objets, comme le relisent les réglages du run');
        self::assertSame($empreinte, ReferentielMoteur::empreinte(array_reverse($bloc, true)), 'l’ordre des clés n’y fait rien');
        foreach ([['poles', 0, 'competences', 0, 'fiche'], ['poles', 0, 'entete'], ['poles', 1, 'nom'], ['motif'], ['label']]
                 as $chemin) {
            $change = $bloc;
            $champ = &$change;
            foreach ($chemin as $cle) {
                $champ = &$champ[$cle];
            }
            $champ .= ' changé';
            unset($champ);
            self::assertNotSame($empreinte, ReferentielMoteur::empreinte($change), implode('.', $chemin));
        }

        $textes = ReferentielMoteur::textes($bloc);
        self::assertCount(5 + 20, $textes, 'cinq préambules, vingt fiches');
        self::assertSame([$bloc['poles'][0]['entete'], $bloc['poles'][0]['competences'][0]['fiche']], \array_slice($textes, 0, 2));
        self::assertSame(ReferentielMoteur::textes($bloc), ReferentielMoteur::textes(json_decode(json_encode($bloc))));
        $a = $bloc['poles'][0];
        self::assertSame(\strlen($a['entete']) + 2 + array_sum(array_map(static fn (array $c): int => \strlen($c['fiche']) + 7,
            $a['competences'])), ReferentielMoteur::tailles($bloc)[0]);
        self::assertCount(5, ReferentielMoteur::tailles($bloc));
    }

    /**
     * With the real engine: RESPIRE's block, drawn from the base, reads as
     * the v9.8 reads its pole files — the same poles, preambles, competences,
     * fiches, names and keys —, its name RESPIRE, its codes X.YY.
     */
    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testTheRealEngineReadsRespiresBlockAsTheV98sPoleFiles(): void
    {
        if (!is_file($this->reel . '/php/src/Referentiel.php') || !is_dir($this->reel . '/protocole/tagger')) {
            self::markTestSkipped('Twin_v9 absent (TWIN_V9_DIR) : le vrai moteur et ses fichiers de pôle ne sont pas là');
        }
        TestDb::setEnv('TWIN_V9_DIR', $this->reel);
        self::assertTrue(EngineLoader::load());
        $bloc = \Twin9\Py\Json::loads(json_encode((new ReferentielMoteur(self::$pdo))->bloc('respire', '7.0.0'),
            JSON_THROW_ON_ERROR));
        self::assertInstanceOf(\Twin9\Py\Dict::class, $bloc);

        $lus = \Twin9\Referentiel::depuisBloc($bloc);
        $v98 = array_values(\Twin9\Referentiel::load($this->reel . '/protocole/tagger'));
        self::assertSame(array_map(self::pole(...), $v98), array_map(self::pole(...), $lus));
        self::assertSame(['RESPIRE', 'X.YY'], [\Twin9\Referentiel::nomCourt($bloc), \Twin9\Referentiel::formatCode($lus)]);
    }

    /**
     * With the real engine: a referential the platform publishes but the
     * engine cannot read — its codes digits only — is refused at the preview
     * and at the launch, 422, the code at fault named; no run is written.
     */
    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testAReferentialTheEngineCannotReadIsRefusedAtLaunch(): void
    {
        if (!is_file($this->reel . '/php/src/Plateforme.php') || !is_dir($this->reel . '/php/protocole')) {
            self::markTestSkipped('Twin_v9 absent (TWIN_V9_DIR) : le vrai moteur et ses gabarits ne sont pas là');
        }
        TestDb::setEnv('TWIN_V9_DIR', $this->reel);
        TestDb::setEnv('ANTHROPIC_API_KEY', 'sk-ant-instance-test');
        self::assertTrue(EngineLoader::load());
        self::$pdo->exec('DELETE FROM twin9_protocole');
        $v98 = new ProtocoleRepository(self::$pdo);
        $racine = $this->reel . '/php/protocole/';
        foreach (new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($racine, \FilesystemIterator::SKIP_DOTS))
                 as $fichier) {
            if (str_ends_with((string) $fichier, '.md')) {
                $v98->put(substr((string) $fichier, \strlen($racine), -3), (string) file_get_contents((string) $fichier), null);
            }
        }
        $doc = ['schemaVersion' => '2.0.0', 'kind' => 'referentiel', 'id' => 'fictif-chiffres', 'version' => '1.0.0',
                'label' => 'Fictif chiffré', 'source' => 'Fixture de test (T16) : des codes faits de chiffres, fictifs',
                'niveaux' => [['nom' => 'compétence', 'motif' => '[1-2][1-2]']],
                'poles' => [['num' => 1, 'nom' => 'Pôle fictif 1', 'couleur' => null],
                            ['num' => 2, 'nom' => 'Pôle fictif 2', 'couleur' => null]],
                'competences' => []];
        foreach (['11', '12', '21', '22'] as $code) {
            $doc['competences'][] = ['code' => $code, 'nom' => 'Compétence fictive ' . $code, 'pole' => (int) $code[0]];
        }
        self::publier($doc);
        $alice = $this->registerAs('chiffres@example.org', 'Alice');
        (new CreditService(self::$pdo))->adjust($alice['id'], 1_000_000_000, 'crédit des tests');
        $profil = ProfilRepository::v98();
        $profil->voie = 'directe';
        $profil->referentiel = (object) ['id' => 'fictif-chiffres', 'version' => null];
        $cree = $this->as_($alice, 'POST', '/api/twin9/profils', ['nom' => 'Chiffres', 'profil' => $profil]);
        self::assertSame(201, $cree->getStatusCode(), (string) $cree->getBody());

        foreach (['/api/twin9/runs/apercu', '/api/twin9/runs'] as $route) {
            $refus = $this->as_($alice, 'POST', $route, ['profil' => self::json($cree)['id'], 'accord' => true,
                'portfolio' => ['nom' => 'journal-factice.md', 'texte' => "## 2026-01-05\nUn jour fictif.\n"]]);
            self::assertSame(422, $refus->getStatusCode(), $route . ' : ' . $refus->getBody());
            self::assertSame('Le référentiel « fictif-chiffres » ne se lit pas : code fait de chiffres seulement : 11',
                self::json($refus)['error']);
        }
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM twin9_runs')->fetchColumn());
    }

    /** @param array<string, mixed> $doc a referential, published */
    private static function publier(array $doc): void
    {
        (new ReferentielRepository(self::$pdo))->importPublishedDocument(['contentHash' => ContentHash::compute($doc)] + $doc,
            'Publié');
    }

    /** @return array<string, mixed> what a reader of the pole reads of it */
    private static function pole(\Twin9\Pole $p): array
    {
        return ['num' => $p->num, 'nom' => $p->nom, 'cle' => $p->cle, 'header' => $p->header, 'competences' => $p->competences];
    }
}
