<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Bootstrap;
use Humanome\Env;
use Humanome\Referentiel\AmorcageReferentiel;
use Psr\Http\Message\ResponseInterface;
use Slim\Psr7\Factory\ServerRequestFactory;

final class AdminImportReferentielTest extends ReferentielTestCase
{
    private function postImport(?string $token, mixed $body): ResponseInterface
    {
        $request = (new ServerRequestFactory())
            ->createServerRequest('POST', '/api/admin/import-referentiel');
        $request->getBody()->write(\is_string($body) ? $body : json_encode($body, JSON_THROW_ON_ERROR));
        $request->getBody()->rewind();
        if ($token !== null) {
            $request = $request->withHeader('X-Migrate-Token', $token);
        }

        return Bootstrap::createApp()->handle($request);
    }

    private static function token(): string
    {
        return Env::get('MIGRATE_TOKEN', 'dev_migrate_token');
    }

    public function testRejectsMissingOrWrongToken(): void
    {
        self::assertSame(403, $this->postImport(null, self::respireDocument())->getStatusCode());
        self::assertSame(403, $this->postImport('wrong', self::respireDocument())->getStatusCode());
    }

    public function testImportsThenIsIdempotent(): void
    {
        $first = $this->postImport(self::token(), self::respireDocument());
        self::assertSame(200, $first->getStatusCode());
        self::assertSame('imported', self::body($first)['status']);

        $second = $this->postImport(self::token(), self::respireDocument());
        self::assertSame(200, $second->getStatusCode());
        self::assertSame('unchanged', self::body($second)['status']);
    }

    public function testRejectsGarbageAndHashMismatch(): void
    {
        self::assertSame(400, $this->postImport(self::token(), 'not json')->getStatusCode());

        $doc = self::respireDocument();
        $doc['contentHash'] = str_repeat('0', 64);
        self::assertSame(409, $this->postImport(self::token(), $doc)->getStatusCode());
    }

    /**
     * Another referential than RESPIRE (S5, lot B: the converted Humanome,
     * here the FICTIONAL fixture) is seeded through the route — production's
     * only path without a vote — with the seed's guards
     * (AmorcageReferentiel): idempotent on the whole document but its
     * provenance, so the same version re-converted with another description
     * is a conflict, never a silent « unchanged ».
     */
    public function testAnotherReferentialIsSeededWithTheSeedsGuards(): void
    {
        $doc = json_decode((string) file_get_contents(
            \dirname(__DIR__, 2) . '/schemas/fixtures/referentiel-humanome-fictif.json'
        ), true, 512, JSON_THROW_ON_ERROR);

        $first = $this->postImport(self::token(), $doc);
        self::assertSame(200, $first->getStatusCode(), (string) $first->getBody());
        self::assertSame(['imported', 'fictif-humanome', '2.0.0-proposition.1', $doc['contentHash']],
            [self::body($first)['status'], self::body($first)['referentiel'], self::body($first)['semver'], self::body($first)['contentHash']]);
        $version = self::repo()->findVersion('fictif-humanome', '2.0.0-proposition.1');
        self::assertSame(['published', AmorcageReferentiel::NOTE_ROUTE], [$version['status'], $version['releaseNote']]);

        $renomme = $doc;
        $renomme['source'] = str_replace('Converti depuis referentiel-humanome-fictif.yaml', 'Converti depuis humanome_v18.yaml', $doc['source']);
        foreach ([$doc, $renomme] as $again) {
            $response = $this->postImport(self::token(), $again);
            self::assertSame(200, $response->getStatusCode());
            self::assertSame('unchanged', self::body($response)['status']);
        }

        $redige = $doc;
        $redige['competences'][0]['description'] .= "\n\n**Relance** : une autre.";
        $conflict = $this->postImport(self::token(), $redige);
        self::assertSame(409, $conflict->getStatusCode());
        self::assertStringContainsString('immuable', self::body($conflict)['error']);
        self::assertSame($doc, self::body($this->request('GET', '/referentiels/fictif-humanome/versions/2.0.0-proposition.1')));

        $faux = $doc;
        $faux['version'] = '2.0.1';
        $faux['contentHash'] = str_repeat('0', 64);
        self::assertSame(409, $this->postImport(self::token(), $faux)->getStatusCode());
        $invalide = $doc;
        $invalide['id'] = 'Fictif Humanome';
        $refus = $this->postImport(self::token(), $invalide);
        self::assertSame(422, $refus->getStatusCode());
        self::assertArrayHasKey('/id', self::body($refus)['details']);
    }
}
