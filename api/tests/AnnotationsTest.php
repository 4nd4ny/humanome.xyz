<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Referentiel\ContentHash;
use Humanome\Referentiel\ReferentielRepository;
use Humanome\Tests\UseCases\Support\ReferentielsFictifs;

/**
 * P9 — per-competence annotations: owner and linked cartographe may write
 * and read; deletion is author-only; every unauthorized access answers the
 * same 404 (IDOR matrix).
 */
final class AnnotationsTest extends CartographeTestCase
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

    /** @param array<string, mixed> $overrides */
    private static function annotation(array $overrides = []): array
    {
        return array_merge([
            'competenceCode' => '1.01',
            'type' => 'commentaire',
            'texte' => 'Belle progression sur cette compétence.',
        ], $overrides);
    }

    public function testOwnerAndLinkedCartographeAnnotateAndRead(): void
    {
        $mine = $this->as_($this->maya, 'POST', '/api/cartographies/' . $this->cartoId . '/annotations', self::annotation());
        self::assertSame(201, $mine->getStatusCode());

        $his = $this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/annotations', self::annotation([
            'competenceCode' => '7.04',
            'type' => 'oubli',
            'texte' => 'Le passage du 5 janvier montre aussi 7.04, non cartographiée.',
        ]));
        self::assertSame(201, $his->getStatusCode());

        foreach ([$this->maya, $this->carl] as $reader) {
            $list = self::json($this->as_($reader, 'GET', '/api/cartographies/' . $this->cartoId . '/annotations'));
            self::assertCount(2, $list);
            self::assertSame('Maya', $list[0]['author']['displayName']);
            self::assertSame('commentaire', $list[0]['type']);
            self::assertSame('Carl', $list[1]['author']['displayName']);
            self::assertSame('oubli', $list[1]['type']);
            self::assertSame('7.04', $list[1]['competenceCode']);
        }
    }

    public function testValidationRejectsMalformedAnnotations(): void
    {
        $bad = [
            self::annotation(['competenceCode' => '8.01']), // pole out of range
            self::annotation(['competenceCode' => '1.1']),
            self::annotation(['competenceCode' => 'x']),
            self::annotation(['type' => 'bravo']),
            self::annotation(['texte' => '']),
            self::annotation(['texte' => str_repeat('a', 5001)]),
        ];
        foreach ($bad as $i => $body) {
            $response = $this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/annotations', $body);
            self::assertSame(422, $response->getStatusCode(), 'case #' . $i);
        }
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM cartography_annotations')->fetchColumn());
    }

    /**
     * T15: a cartography that names its referential version takes that
     * version's codes, whatever its structure. 2026-10-20: one that names none
     * takes the codes of the referential its document names — RESPIRE's when it
     * names none —, never a code « form » any more.
     */
    public function testACartographyOfAnotherReferentialTakesItsCodes(): void
    {
        self::$pdo->exec('DELETE FROM referentiel_versions');
        $repo = new ReferentielRepository(self::$pdo);
        $lettre = ReferentielsFictifs::lettre();
        $repo->importPublishedDocument(['contentHash' => ContentHash::compute($lettre)] + $lettre, 'Publié');
        $respire = json_decode((string) file_get_contents(\dirname(__DIR__, 2) . '/schemas/fixtures/referentiel-respire-v7.json'),
            true, 512, JSON_THROW_ON_ERROR);
        $repo->importPublishedDocument($respire, 'Import initial');
        $lier = function (int $cartoId, string $referentiel): void {
            self::$pdo->prepare('UPDATE cartographies SET referentiel_version_id = (SELECT id FROM referentiel_versions
                WHERE referentiel_id = ?) WHERE id = ?')->execute([$referentiel, $cartoId]);
        };
        $annoter = fn (int $cartoId, string $code): array => [
            ($r = $this->as_($this->carl, 'POST', "/api/cartographies/$cartoId/annotations",
                self::annotation(['competenceCode' => $code])))->getStatusCode(),
            self::json($r)['fields']['competenceCode'] ?? null,
        ];
        $inconnu = 'Code de compétence inconnu du référentiel de la cartographie';

        $lier($this->cartoId, 'fictif-lettre');
        self::assertSame([201, null], $annoter($this->cartoId, 'A1'));
        self::assertSame([201, null], $annoter($this->cartoId, 'E4'));
        foreach (['1.01', 'A1.1', 'F1'] as $code) {
            self::assertSame([422, $inconnu], $annoter($this->cartoId, $code), $code);
        }

        $autre = $this->createCarto($this->maya);
        $lier($autre, 'respire');
        self::assertSame([201, null], $annoter($autre, '7.04'));
        self::assertSame([422, $inconnu], $annoter($autre, '7.99'));
        self::assertSame([422, $inconnu], $annoter($autre, 'A1'));

        // a cartography that names no version: the referential its document names, RESPIRE's when none —
        // a code of RESPIRE's form that RESPIRE does not know is refused
        $libre = $this->createCarto($this->maya);
        self::assertSame([201, null], $annoter($libre, '7.04'));
        self::assertSame([422, $inconnu], $annoter($libre, '7.99'));
        self::assertSame([422, $inconnu], $annoter($libre, 'A1'));
        $lettree = $this->createCarto($this->maya, ['document' => self::jourDocumentPour($lettre)]);
        self::assertSame([201, null], $annoter($lettree, 'C3'));
        self::assertSame([422, $inconnu], $annoter($lettree, '1.01'));
    }

    /**
     * 2026-10-20: a version of RESPIRE may count six poles. Its cartographies
     * take its codes; a cartography of RESPIRE v7 that names no version keeps
     * the codes of v7, the newest version its document conforms to.
     */
    public function testASixPoleRespireVersionAndTheVersionADocumentConformsTo(): void
    {
        self::publierReferentiel(self::respireSixPoles());
        $annoter = fn (int $cartoId, string $code): int => $this->as_($this->carl, 'POST',
            "/api/cartographies/$cartoId/annotations", self::annotation(['competenceCode' => $code]))->getStatusCode();

        // no version named, a document of no version: the latest, six poles
        self::assertSame(201, $annoter($this->cartoId, '6.01'));
        self::assertSame(422, $annoter($this->cartoId, '7.04'));
        // no version named, a RESPIRE v7 day: v7's codes
        $v7 = $this->createCarto($this->maya, ['document' => self::jourDocument()]);
        self::assertSame(201, $annoter($v7, '7.04'));
        // a six-pole day: v8's
        $six = $this->createCarto($this->maya, ['document' => self::jourDocumentPour(self::respireSixPoles())]);
        self::assertSame(422, $annoter($six, '7.04'));
        self::assertSame(201, $annoter($six, '6.01'));
    }

    /** 2026-10-20: a referential with no published version leaves nothing to check a code against: refused. */
    public function testAReferentialWithNoPublishedVersionRefusesTheCode(): void
    {
        self::$pdo->exec("DELETE FROM referentiel_versions WHERE referentiel_id = 'fictif-neuf'");
        $neuf = $this->createCarto($this->maya, ['document' => self::jourDocumentPour(ReferentielsFictifs::neufPoles())]);
        $response = $this->as_($this->carl, 'POST', "/api/cartographies/$neuf/annotations", self::annotation(['competenceCode' => '9.01']));
        self::assertSame(422, $response->getStatusCode());
        self::assertSame('Aucune version publiée du référentiel « fictif-neuf » : le code ne peut pas être vérifié',
            self::json($response)['fields']['competenceCode']);

        self::publierReferentiel(ReferentielsFictifs::neufPoles());
        self::assertSame(201, $this->as_($this->carl, 'POST', "/api/cartographies/$neuf/annotations",
            self::annotation(['competenceCode' => '9.01']))->getStatusCode());
    }

    public function testAccessMatrixCollapsesInto404(): void
    {
        // A stranger learner, an UNLINKED cartographe, and the linked
        // cartographe on a privee cartography: same 404 as a missing id.
        $zoe = $this->registerAs('zoe@example.org', 'Zoé');
        $rita = $this->registerAs('rita@example.org', 'Rita', ['cartographe']);
        $privee = $this->createCarto($this->maya, ['visibility' => 'privee']);

        $cases = [
            [$zoe, $this->cartoId],
            [$rita, $this->cartoId],
            [$this->carl, $privee],
            [$this->carl, 999999],
        ];
        foreach ($cases as $i => [$actor, $cartoId]) {
            $post = $this->as_($actor, 'POST', '/api/cartographies/' . $cartoId . '/annotations', self::annotation());
            self::assertSame(404, $post->getStatusCode(), 'POST case #' . $i);
            $get = $this->as_($actor, 'GET', '/api/cartographies/' . $cartoId . '/annotations');
            self::assertSame(404, $get->getStatusCode(), 'GET case #' . $i);
        }
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM cartography_annotations')->fetchColumn());

        // Visitor: 401 (no session at all).
        $this->cookieSid = null;
        self::assertSame(401, $this->request('GET', '/api/cartographies/' . $this->cartoId . '/annotations')->getStatusCode());
    }

    public function testDeletionIsAuthorOnly(): void
    {
        $id = (int) self::json(
            $this->as_($this->maya, 'POST', '/api/cartographies/' . $this->cartoId . '/annotations', self::annotation()),
        )['id'];

        // The linked cartographe reads it but cannot delete it.
        $foreign = $this->as_($this->carl, 'DELETE', '/api/annotations/' . $id);
        self::assertSame(404, $foreign->getStatusCode());
        self::assertSame(1, (int) self::$pdo->query('SELECT COUNT(*) FROM cartography_annotations')->fetchColumn());

        $own = $this->as_($this->maya, 'DELETE', '/api/annotations/' . $id);
        self::assertSame(204, $own->getStatusCode());
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM cartography_annotations')->fetchColumn());

        $again = $this->as_($this->maya, 'DELETE', '/api/annotations/' . $id);
        self::assertSame(404, $again->getStatusCode());
    }

    public function testAnnotationMutationsRequireCsrf(): void
    {
        $this->cookieSid = $this->carl['sid'];
        $noToken = $this->request('POST', '/api/cartographies/' . $this->cartoId . '/annotations', self::annotation());
        self::assertSame(403, $noToken->getStatusCode());
        self::assertStringContainsString('CSRF', (string) $noToken->getBody());
    }
}
