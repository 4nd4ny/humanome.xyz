<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Tests\UseCases\Support\ReferentielsFictifs;
use Humanome\Validation;

/**
 * P9 — revisions: the correction history. Every stored document is
 * SERVER-VALIDATED against schemas/cartographie-<type> (422 with
 * pointer-keyed errors otherwise, type mismatch included) then against the
 * referential version the cartography is reviewed against (2026-10-20: a
 * revision cannot lose a pole), the metadata list never carries documents,
 * and a new revision on a guaranteed cartography removes the garantie
 * (cahier §8).
 */
final class CartographeRevisionsTest extends CartographeTestCase
{
    /** @var array{id: int, csrf: string, sid: string} */
    private array $maya;
    /** @var array{id: int, csrf: string, sid: string} */
    private array $carl;
    private int $cartoId;

    protected function setUp(): void
    {
        parent::setUp();
        self::publierRespireV7();
        $this->maya = $this->registerAs('maya@example.org', 'Maya');
        $this->carl = $this->registerAs('carl@example.org', 'Carl', ['cartographe']);
        $this->link($this->maya, $this->carl);
        $this->cartoId = $this->createCarto($this->maya);
    }

    public function testLinkedCartographePostsASchemaValidRevision(): void
    {
        $document = self::jourDocument();
        $response = $this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/revisions', [
            'document' => $document,
            'note' => 'Hallucination 1.03 retirée, verdict 7.04 ajouté.',
        ]);
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());
        $revisionId = self::json($response)['revisionId'];
        self::assertIsInt($revisionId);

        // Metadata list: note + author, NEVER the document.
        $meta = self::json($this->as_($this->maya, 'GET', '/api/cartographies/' . $this->cartoId . '/revisions'));
        self::assertCount(1, $meta);
        self::assertSame($revisionId, $meta[0]['id']);
        self::assertSame('Hallucination 1.03 retirée, verdict 7.04 ajouté.', $meta[0]['note']);
        self::assertSame('Carl', $meta[0]['author']['displayName']);
        self::assertArrayNotHasKey('document', $meta[0]);

        // Single revision endpoint: the full stored document. assertEquals:
        // the MySQL JSON type does not preserve object key order.
        $full = self::json($this->as_($this->maya, 'GET', '/api/revisions/' . $revisionId));
        self::assertSame($this->cartoId, $full['cartographieId']);
        self::assertEquals($document, $full['document']);
    }

    public function testOwnerMayReviseTheirOwnCartography(): void
    {
        $response = $this->as_($this->maya, 'POST', '/api/cartographies/' . $this->cartoId . '/revisions', [
            'document' => self::jourDocument(),
        ]);
        self::assertSame(201, $response->getStatusCode());

        $meta = self::json($this->as_($this->carl, 'GET', '/api/cartographies/' . $this->cartoId . '/revisions'));
        self::assertSame('Maya', $meta[0]['author']['displayName']);
        self::assertNull($meta[0]['note']);
    }

    public function testSchemaInvalidDocumentIsRejected422(): void
    {
        $broken = self::jourDocument();
        unset($broken['poles']); // required by the schema
        $broken['date'] = 'pas-une-date';

        $response = $this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/revisions', [
            'document' => $broken,
        ]);
        self::assertSame(422, $response->getStatusCode());
        $body = self::json($response);
        self::assertStringContainsString('cartographie-jour', $body['error']);
        self::assertNotEmpty($body['fields']);

        // Shape-level garbage is refused before schema validation.
        foreach ([['document' => 'texte'], ['document' => ['a', 'b']], []] as $i => $payload) {
            self::assertSame(
                422,
                $this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/revisions', $payload)->getStatusCode(),
                'case #' . $i,
            );
        }
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM cartography_revisions')->fetchColumn());
    }

    /**
     * T17: a revision is of its cartography's referential — RESPIRE's when the
     * cartography names none. Naming another, a schema-valid document of eight
     * poles would escape RESPIRE's checks: refused.
     */
    public function testARevisionNamingAnotherReferentialIsRejected422(): void
    {
        $autre = ['referentiel' => 'fictif-neuf'] + self::jourDocument();
        $autre['poles'][] = ['poleNum' => '8'] + $autre['poles'][6];
        self::assertTrue(Validation::validate('cartographie-jour', $autre)['valid']);

        $response = $this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/revisions', [
            'document' => $autre,
        ]);
        self::assertSame(422, $response->getStatusCode());
        self::assertSame(['Le document est du référentiel de la cartographie, « respire »'],
            self::json($response)['fields']['/referentiel']);
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM cartography_revisions')->fetchColumn());

        // RESPIRE named as such stays RESPIRE.
        $respire = ['referentiel' => 'respire'] + self::jourDocument();
        self::assertSame(201, $this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/revisions', [
            'document' => $respire,
        ])->getStatusCode());
    }

    /**
     * 2026-10-20: the schema no longer pins RESPIRE at seven poles; the guard
     * stays, against the version the cartography is reviewed against — here
     * RESPIRE v7: a day that lost its seventh pole is refused, the pole named.
     */
    public function testARevisionThatLostAPoleOfItsVersionIsRejected422(): void
    {
        $sixPoles = self::jourDocument();
        array_pop($sixPoles['poles']);
        self::assertTrue(Validation::validate('cartographie-jour', $sixPoles)['valid'], 'the schema no longer refuses it');

        $response = $this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/revisions', [
            'document' => $sixPoles,
        ]);
        self::assertSame(422, $response->getStatusCode());
        $body = self::json($response);
        self::assertSame('Document non conforme au référentiel « respire » 7.0.0', $body['error']);
        self::assertSame(['/poles' => ['il manque le pôle 7 du référentiel']], $body['fields']);

        $autrePole = self::jourDocument();
        $autrePole['poles'][0]['competences'][0]['code'] = '2.01';
        $response = $this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/revisions', [
            'document' => $autrePole,
        ]);
        self::assertSame(422, $response->getStatusCode());
        self::assertSame(['la compétence 2.01 est du pôle 2, pas du pôle 1'],
            self::json($response)['fields']['/poles/0/competences/0/code']);
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM cartography_revisions')->fetchColumn());
    }

    /**
     * 2026-10-20: a RESPIRE of six poles, a referential of lettered poles —
     * each cartography is revised by a day of its own version's structure;
     * a RESPIRE v7 cartography that stored no version stays revised against v7,
     * the newest version its document conforms to, once v8 is the latest.
     */
    public function testEveryReferentialVersionIsRevisedWithItsOwnStructure(): void
    {
        $six = self::respireSixPoles();
        self::publierReferentiel($six);
        $lettre = ReferentielsFictifs::lettre();
        self::$pdo->exec("DELETE FROM referentiel_versions WHERE referentiel_id = 'fictif-lettre'");
        self::publierReferentiel($lettre);
        $reviser = fn (int $cartoId, array $document): array => [
            ($r = $this->as_($this->carl, 'POST', "/api/cartographies/$cartoId/revisions", ['document' => $document]))
                ->getStatusCode(),
            self::json($r),
        ];

        // RESPIRE v8, six poles: its six-pole day passes, a seven-pole day does not
        $cartoSix = $this->createCarto($this->maya, ['document' => self::jourDocumentPour($six)]);
        self::assertSame(201, $reviser($cartoSix, self::jourDocumentPour($six))[0]);
        [$status, $body] = $reviser($cartoSix, self::jourDocument());
        self::assertSame(422, $status);
        self::assertSame('Document non conforme au référentiel « respire » 8.0.0', $body['error']);
        self::assertSame(['le pôle 7 n\'est pas un pôle du référentiel'], $body['fields']['/poles/6/poleNum']);

        // RESPIRE v7 day, no version stored: still v7 once v8 is the latest
        $cartoSept = $this->createCarto($this->maya, ['document' => self::jourDocument()]);
        self::assertSame(201, $reviser($cartoSept, self::jourDocument())[0]);
        self::assertSame(422, $reviser($cartoSept, self::jourDocumentPour($six))[0]);

        // five lettered poles: a lettered day, of its referential
        $cartoLettre = $this->createCarto($this->maya, ['document' => self::jourDocumentPour($lettre)]);
        self::assertSame(201, $reviser($cartoLettre, self::jourDocumentPour($lettre))[0]);
        $sansE = self::jourDocumentPour($lettre);
        array_pop($sansE['poles']);
        [$status, $body] = $reviser($cartoLettre, $sansE);
        self::assertSame(422, $status);
        self::assertSame(['/poles' => ['il manque le pôle 5 du référentiel']], $body['fields']);
    }

    /** 2026-10-20: a referential with no published version leaves nothing to check a revision against. */
    public function testAReferentialWithNoPublishedVersionRefusesTheRevision(): void
    {
        self::$pdo->exec("DELETE FROM referentiel_versions WHERE referentiel_id = 'fictif-neuf'");
        $neuf = self::jourDocumentPour(ReferentielsFictifs::neufPoles());
        $cartoNeuf = $this->createCarto($this->maya, ['document' => $neuf]);
        $response = $this->as_($this->carl, 'POST', "/api/cartographies/$cartoNeuf/revisions", ['document' => $neuf]);
        self::assertSame(422, $response->getStatusCode());
        self::assertSame(
            ['/referentiel' => ['Aucune version publiée du référentiel « fictif-neuf » : la révision ne peut pas être vérifiée']],
            self::json($response)['fields'],
        );
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM cartography_revisions')->fetchColumn());
    }

    public function testTypeMismatchIsRejected422(): void
    {
        // A merge cartography refuses a (valid) JOUR document: the revision
        // type must be identical to the cartography type (M7 contract) —
        // the schema's `kind` const enforces it.
        $mergeCarto = $this->createCarto($this->maya, ['type' => 'merge', 'titre' => 'Merge']);

        $response = $this->as_($this->carl, 'POST', '/api/cartographies/' . $mergeCarto . '/revisions', [
            'document' => self::jourDocument(),
        ]);
        self::assertSame(422, $response->getStatusCode());
        self::assertStringContainsString('cartographie-merge', self::json($response)['error']);
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM cartography_revisions')->fetchColumn());
    }

    public function testRevisionAccessMatrixCollapsesInto404(): void
    {
        $revisionId = (int) self::json($this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/revisions', [
            'document' => self::jourDocument(),
        ]))['revisionId'];

        $zoe = $this->registerAs('zoe@example.org', 'Zoé');
        $rita = $this->registerAs('rita@example.org', 'Rita', ['cartographe']);

        foreach ([$zoe, $rita] as $i => $actor) {
            self::assertSame(404, $this->as_($actor, 'POST', '/api/cartographies/' . $this->cartoId . '/revisions', [
                'document' => self::jourDocument(),
            ])->getStatusCode(), 'POST case #' . $i);
            self::assertSame(
                404,
                $this->as_($actor, 'GET', '/api/cartographies/' . $this->cartoId . '/revisions')->getStatusCode(),
                'list case #' . $i,
            );
            self::assertSame(
                404,
                $this->as_($actor, 'GET', '/api/revisions/' . $revisionId)->getStatusCode(),
                'document case #' . $i,
            );
        }
        self::assertSame(404, $this->as_($this->carl, 'GET', '/api/revisions/999999')->getStatusCode());

        // Visibility back to privee: the revision document follows the
        // cartography — the linked cartographe loses it too.
        self::assertSame(200, $this->as_($this->maya, 'PATCH', '/api/cartographies/' . $this->cartoId, [
            'visibility' => 'privee',
        ])->getStatusCode());
        self::assertSame(404, $this->as_($this->carl, 'GET', '/api/revisions/' . $revisionId)->getStatusCode());
        // ... while the owner keeps the full history.
        self::assertSame(200, $this->as_($this->maya, 'GET', '/api/revisions/' . $revisionId)->getStatusCode());
    }

    public function testNewRevisionRemovesTheStandingGarantie(): void
    {
        // Garantie posed by the linked cartographe...
        self::assertSame(201, $this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/garantie')->getStatusCode());
        self::assertSame(1, (int) self::$pdo->query('SELECT COUNT(*) FROM cartography_garanties')->fetchColumn());

        // ... then the OWNER posts a new revision: the guaranteed state no
        // longer reflects the document — the garantie must fall (cahier §8).
        $response = $this->as_($this->maya, 'POST', '/api/cartographies/' . $this->cartoId . '/revisions', [
            'document' => self::jourDocument(),
            'note' => 'Correction après garantie',
        ]);
        self::assertSame(201, $response->getStatusCode());

        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM cartography_garanties')->fetchColumn());
        $audit = self::lastAudit('garantie_retiree');
        self::assertNotNull($audit);
        self::assertSame($this->maya['id'], $audit['userId']);
        self::assertSame('nouvelle_revision', $audit['details']['cause']);
        self::assertSame($this->cartoId, $audit['details']['cartographieId']);

        // The review view agrees.
        $detail = self::json($this->as_($this->carl, 'GET', '/api/cartographe/cartographies/' . $this->cartoId));
        self::assertNull($detail['garantie']);
        self::assertCount(1, $detail['revisions']);
    }
}
