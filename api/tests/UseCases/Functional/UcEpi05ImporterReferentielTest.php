<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Tests\UseCases\Support\EpiSupport;
use Humanome\Tests\UseCases\Support\ReferentielsFictifs;
use PHPUnit\Framework\Attributes\TestDox;

/**
 * UC-EPI-05 — Importer un référentiel d'une autre structure : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/epistemiarque/UC-EPI-05-importer-referentiel.md
 *
 * T15 (Twin_v9, docs/plan-twin9-php.md, lot 4c) : un épistémiarque importe un
 * référentiel de toute structure au niveau qui tient lieu de compétence ; il
 * se vote et se publie comme une version de RESPIRE au grain document. Comptes
 * réels (session + CSRF) : Alix et Bao, membres épistémiarques (seuil 2).
 * État initial : RESPIRE 7.0.0 publié, qui ne change pas. Référentiels FICTIFS.
 */
final class UcEpi05ImporterReferentielTest extends EpiSupport
{
    /** @var array{id: int, csrf: string, sid: string} */
    private array $alix;

    /** @var array{id: int, csrf: string, sid: string} */
    private array $bao;

    protected function setUp(): void
    {
        parent::setUp();
        self::importRespire();
        $this->alix = $this->member('alix@example.org', 'Alix');
        $this->bao = $this->member('bao@example.org', 'Bao');
    }

    /** @return array<string, mixed> le brouillon importé par Alix */
    private function import(array $document, ?string $niveau = null): array
    {
        $response = $this->as_($this->alix, 'POST', '/api/referentiel/import',
            ['document' => $document] + ($niveau === null ? [] : ['niveau' => $niveau]));
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        return self::json($response);
    }

    /** Soumission + « pour » d'Alix et Bao, puis publication. */
    private function voteAndPublish(int $id): void
    {
        self::assertSame(200, $this->as_($this->alix, 'POST', '/api/referentiel/drafts/' . $id . '/submit', [])->getStatusCode());
        foreach ([$this->alix, $this->bao] as $voter) {
            self::assertSame(200, $this->as_($voter, 'POST', '/api/referentiel/proposals/' . $id . '/votes',
                ['vote' => 'pour'])->getStatusCode());
        }
        $published = $this->as_($this->alix, 'POST', '/api/referentiel/drafts/' . $id . '/publish',
            ['releaseNote' => 'Entérinée par le vote des membres.']);
        self::assertSame(200, $published->getStatusCode(), (string) $published->getBody());
        self::assertSame('published', self::json($published)['status']);
    }

    private static function versionCount(): int
    {
        return (int) self::$pdo->query('SELECT COUNT(*) FROM referentiel_versions')->fetchColumn();
    }

    #[TestDox('UC-EPI-05-F01 — DoD : un référentiel à 5 pôles lettrés, importé au niveau capacité (A1 à E4, leurs facettes dessous), s’enregistre, se vote et se publie')]
    public function testF01LetteredPolesAreImportedVotedAndPublished(): void
    {
        $draft = $this->import(ReferentielsFictifs::lettre(), 'capacité');
        self::assertSame(['fictif-lettre', '1.0.0', 'draft'], [$draft['referentielId'], $draft['semver'], $draft['status']]);
        $codes = array_column($draft['content']['competences'], 'code');
        self::assertSame(['A1', 'A2', 'A3', 'A4', 'B1'], \array_slice($codes, 0, 5));
        self::assertSame('E4', $codes[19]);
        self::assertSame(['A1.1', 'A1.2'], array_column($draft['content']['competences'][0]['elements'], 'code'));
        self::assertSame(['capacité', 'facette'], array_column($draft['content']['niveaux'], 'nom'));
        self::assertSame(['A · Pôle fictif A', 'E · Pôle fictif E'],
            [$draft['content']['poles'][0]['nom'], $draft['content']['poles'][4]['nom']]);

        // the workbench lists it beside RESPIRE's drafts, then as a proposal
        self::assertSame(['fictif-lettre'], array_column(self::json($this->as_($this->alix, 'GET', '/api/referentiel/drafts')), 'referentielId'));
        $this->voteAndPublish($draft['id']);

        self::assertSame([
            ['id' => 'fictif-lettre', 'label' => 'Fictif lettré', 'versions' => ['1.0.0']],
            ['id' => 'respire', 'label' => 'RESPIRE v7', 'versions' => ['7.0.0']],
        ], self::json($this->anonymous('GET', '/api/referentiels')));
        // RESPIRE's public reads stay RESPIRE's
        self::assertSame('respire', self::json($this->anonymous('GET', '/api/referentiel'))['id']);
    }

    #[TestDox('UC-EPI-05-F02 — DoD : un référentiel à 9 pôles s’enregistre, se vote et se publie')]
    public function testF02NinePolesAreImportedVotedAndPublished(): void
    {
        $draft = $this->import(ReferentielsFictifs::neufPoles());
        self::assertCount(9, $draft['content']['poles']);
        self::assertSame(['1.01', '9.02'], [$draft['content']['competences'][0]['code'], $draft['content']['competences'][17]['code']]);
        $this->voteAndPublish($draft['id']);

        self::assertContains(['id' => 'fictif-neuf', 'label' => 'Fictif à neuf pôles', 'versions' => ['1.0.0']],
            self::json($this->anonymous('GET', '/api/referentiels')));
    }

    #[TestDox('UC-EPI-05-F03 — A1 : au niveau facette, les 40 facettes deviennent les compétences, sous le pôle de leur capacité')]
    public function testF03TheFacetLevel(): void
    {
        $draft = $this->import(ReferentielsFictifs::lettre(), 'facette');
        $competences = $draft['content']['competences'];
        self::assertCount(40, $competences);
        self::assertSame(['A1.1', 1], [$competences[0]['code'], $competences[0]['pole']]);
        self::assertSame(['E4.2', 5], [$competences[39]['code'], $competences[39]['pole']]);
        self::assertSame([['nom' => 'facette', 'motif' => '[A-E][1-4]\.[1-9]']], $draft['content']['niveaux']);
    }

    #[TestDox('UC-EPI-05-F04 — A2 : une nouvelle version d’un référentiel publié se forke comme celle de RESPIRE ; son auteur la retrouve dans l’atelier')]
    public function testF04ANewVersionForks(): void
    {
        $this->voteAndPublish($this->import(ReferentielsFictifs::neufPoles())['id']);

        $fork = $this->as_($this->bao, 'POST', '/api/referentiel/drafts',
            ['referentiel' => 'fictif-neuf', 'from' => '1.0.0', 'semver' => '1.1.0']);
        self::assertSame(201, $fork->getStatusCode(), (string) $fork->getBody());
        self::assertSame(['fictif-neuf', '1.1.0', 'draft'], [self::json($fork)['referentielId'], self::json($fork)['semver'],
            self::json($fork)['status']]);
        self::assertSame(404, $this->as_($this->bao, 'POST', '/api/referentiel/drafts',
            ['referentiel' => 'fictif-neuf', 'from' => '9.9.9', 'semver' => '9.9.10'])->getStatusCode());
        // another spelling of an id would file the version apart from its referential
        $avant = self::versionCount();
        foreach ([['FICTIF-NEUF', '1.0.0'], ['Respire', '7.0.0'], ['respire ', '7.0.0'], [7, '1.0.0']] as [$referentiel, $from]) {
            $refus = $this->as_($this->bao, 'POST', '/api/referentiel/drafts',
                ['referentiel' => $referentiel, 'from' => $from, 'semver' => '8.0.0']);
            self::assertSame(422, $refus->getStatusCode(), (string) $referentiel);
        }
        self::assertSame($avant, self::versionCount());
    }

    #[TestDox('UC-EPI-05-F05 — E1 : code hors motif, motif illisible, pôles avec un trou, élément d’un niveau non déclaré, niveau inconnu → 422 avec le code fautif ; rien d’écrit')]
    public function testF05RefusedDocuments(): void
    {
        $avant = self::versionCount();
        $horsMotif = ReferentielsFictifs::lettre();
        $horsMotif['competences'][19]['code'] = 'E9';
        $illisible = ReferentielsFictifs::lettre();
        $illisible['niveaux'][0]['motif'] = '[A-E';
        $trou = ReferentielsFictifs::neufPoles();
        $trou['poles'][8]['num'] = 10;
        foreach ($trou['competences'] as $i => $c) {
            if ($c['pole'] === 9) {
                $trou['competences'][$i]['pole'] = 10;
            }
        }
        $tropFin = ReferentielsFictifs::neufPoles();
        $tropFin['competences'][0]['elements'] = [['code' => '1.01a', 'nom' => 'Sans niveau']];
        $sansFacettes = ReferentielsFictifs::lettre();
        unset($sansFacettes['competences'][4]['elements']);

        foreach ([
            [$horsMotif, null, '« E9 » ne suit pas le motif [A-E][1-4] du niveau « capacité »'],
            [$illisible, null, 'Motif illisible : [A-E'],
            [$trou, null, 'Les pôles se numérotent de 1 à 9, sans trou'],
            [$tropFin, null, 'Élément d’un niveau que le référentiel ne déclare pas (il en déclare 1)'],
            [ReferentielsFictifs::lettre(), 'manifestation', 'Niveau inconnu : « manifestation » (le référentiel déclare : capacité, facette)'],
            [$sansFacettes, 'facette', 'Sans élément au niveau « facette », ces éléments disparaîtraient de l’import : B1'],
        ] as [$document, $niveau, $message]) {
            $response = $this->as_($this->alix, 'POST', '/api/referentiel/import',
                ['document' => $document] + ($niveau === null ? [] : ['niveau' => $niveau]));
            self::assertSame(422, $response->getStatusCode(), $message);
            self::assertContains($message, array_merge(...array_values(self::json($response)['errors'])), $message);
        }
        self::assertSame($avant, self::versionCount());
    }

    #[TestDox('UC-EPI-05-F06 — E2 : RESPIRE ne s’importe pas (409), une version qui existe non plus (409) ; identifiant invalide, document absent → 422')]
    public function testF06Refusals(): void
    {
        $respire = $this->as_($this->alix, 'POST', '/api/referentiel/import', ['document' => self::respireDocument()]);
        self::assertSame(409, $respire->getStatusCode());
        self::assertSame('RESPIRE s’édite compétence par compétence dans son atelier : il ne s’importe pas',
            self::json($respire)['error']);

        $this->import(ReferentielsFictifs::neufPoles());
        $deux = $this->as_($this->alix, 'POST', '/api/referentiel/import', ['document' => ReferentielsFictifs::neufPoles()]);
        self::assertSame(409, $deux->getStatusCode());
        self::assertSame('La version 1.0.0 du référentiel « fictif-neuf » existe déjà', self::json($deux)['error']);

        $id = $this->as_($this->alix, 'POST', '/api/referentiel/import',
            ['document' => ['id' => 'Neuf Pôles'] + ReferentielsFictifs::neufPoles('2.0.0')]);
        self::assertSame(422, $id->getStatusCode());
        self::assertArrayHasKey('/id', self::json($id)['errors']);
        foreach ([[], ['document' => 'texte'], ['document' => [1, 2]]] as $body) {
            self::assertSame(422, $this->as_($this->alix, 'POST', '/api/referentiel/import', $body)->getStatusCode());
        }
    }

    #[TestDox('UC-EPI-05-F07 — E3 : sans session → 401, sans rôle → 403, sans jeton CSRF → 403 ; un administrateur importe sans voter')]
    public function testF07Guards(): void
    {
        $body = ['document' => ReferentielsFictifs::neufPoles()];
        $maya = $this->member('maya@example.org', 'Maya', ['apprenant', 'promptologue']);
        self::assertSame(401, $this->anonymous('POST', '/api/referentiel/import', $body)->getStatusCode());
        self::assertSame(403, $this->as_($maya, 'POST', '/api/referentiel/import', $body)->getStatusCode());
        self::assertSame(403, $this->withoutCsrf($this->alix, 'POST', '/api/referentiel/import', $body)->getStatusCode());
        self::assertSame(0, (int) self::$pdo->query("SELECT COUNT(*) FROM referentiel_versions WHERE referentiel_id = 'fictif-neuf'")->fetchColumn());

        $admin = $this->member('admin@example.org', 'Admin', ['admin']);
        $imported = $this->as_($admin, 'POST', '/api/referentiel/import', $body);
        self::assertSame(201, $imported->getStatusCode());
        $id = self::json($imported)['id'];
        self::assertSame(200, $this->as_($admin, 'POST', '/api/referentiel/drafts/' . $id . '/submit', [])->getStatusCode());
        self::assertSame(403, $this->as_($admin, 'POST', '/api/referentiel/proposals/' . $id . '/votes', ['vote' => 'pour'])->getStatusCode());
    }

    #[TestDox('UC-EPI-05-F08 — DoD : RESPIRE ne change pas — sa version publiée, son empreinte, ses lectures ; un brouillon RESPIRE refuse toujours un code lettré (schéma)')]
    public function testF08RespireIsUnchanged(): void
    {
        $avant = self::json($this->anonymous('GET', '/api/referentiel'));
        $this->voteAndPublish($this->import(ReferentielsFictifs::lettre())['id']);
        $this->voteAndPublish($this->import(ReferentielsFictifs::neufPoles())['id']);

        $apres = self::json($this->anonymous('GET', '/api/referentiel'));
        self::assertSame($avant, $apres);
        self::assertSame(self::respireDocument()['contentHash'], $apres['contentHash']);
        self::assertSame(['7.0.0'], array_column(self::json($this->anonymous('GET', '/api/referentiel/versions')), 'semver'));

        $fork = self::json($this->as_($this->alix, 'POST', '/api/referentiel/drafts', ['from' => '7.0.0', 'semver' => '7.1.0']));
        $doc = $fork['content'];
        $doc['competences'][0]['code'] = 'A1';
        $refus = $this->as_($this->alix, 'PUT', '/api/referentiel/drafts/' . $fork['id'], $doc);
        self::assertSame(422, $refus->getStatusCode());
        self::assertSame('Document does not conform to the referentiel schema', self::json($refus)['error']);
    }
}
