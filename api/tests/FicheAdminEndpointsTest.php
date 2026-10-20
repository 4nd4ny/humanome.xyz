<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;
use Humanome\Referentiel\CompetenceSeeder;
use Psr\Http\Message\ResponseInterface;

/**
 * SOURCE UNIQUE des fiches (exigence 2026-07-16) : l'endpoint admin de la
 * boucle base → corpus.
 *
 *  - GET /api/admin/dump-fiches resert la base en forme CORPUS {poleHeaders,
 *    fiches} (l'inverse du seed), pour re-synchroniser scripts/data/
 *    fiches-v7.json après une édition gouvernée dans l'atelier (chemin Twin6).
 *  - POST /api/admin/generate-fiches, qui régénérait depuis la base la copie
 *    des fiches gardée pour Twin9 (setting twin9_fiches), est parti avec elle
 *    le 2026-10-20 : aucun run ne la lisait depuis T16, les runs lisent les
 *    fiches dans la base (ReferentielMoteur, FicheGenerator).
 *
 * Même modèle de confiance que /admin/migrate : 404 sans MIGRATE_TOKEN
 * configuré, 403 sur mauvais jeton, 503 sans base.
 */
final class FicheAdminEndpointsTest extends CompetenceTestCase
{
    private const TOKEN = 'test_migrate_token_fiches_0123456789';

    /** @var array{poleHeaders: array<int|string,string>, fiches: array<string,string>} */
    private static array $corpus;

    public static function setUpBeforeClass(): void
    {
        parent::setUpBeforeClass();
        self::$corpus = json_decode(
            (string) file_get_contents(\dirname(__DIR__, 2) . '/scripts/data/fiches-v7.json'),
            true, 512, JSON_THROW_ON_ERROR,
        );
    }

    protected function setUp(): void
    {
        parent::setUp();
        TestDb::setEnv('MIGRATE_TOKEN', self::TOKEN);
    }

    /** Seed complet base ← corpus committé (le même chemin que le déploiement). */
    private function seedFromCorpus(): void
    {
        self::importRespire();
        $rich = json_decode(
            (string) file_get_contents(\dirname(__DIR__, 2) . '/scripts/data/competences-v7.json'),
            true, 512, JSON_THROW_ON_ERROR,
        )['competences'];
        (new CompetenceSeeder(Db::get()))->seed($rich, self::$corpus);
    }

    /** Édition GOUVERNÉE de content.fiche : fork 1.1.0 → édition CAS → vote → publication. */
    private function publishGovernedFicheEdit(string $code, string $newFiche): void
    {
        $draft = self::compRepo()->createDraft($code, '1.1.0');
        self::assertNotNull($draft);
        $content = $draft['content'];
        $content['fiche'] = $newFiche;
        self::compRepo()->updateDraft($draft['id'], $content, $draft['contentHash']);
        self::adoptAndPublishCompetence($draft['id']);
    }

    private function getDump(?string $token = self::TOKEN): ResponseInterface
    {
        return $this->requestWithHeaders(
            'GET',
            '/admin/dump-fiches',
            null,
            $token === null ? [] : ['X-Migrate-Token' => $token],
        );
    }

    // ------------------------------------------------------------- gates

    public function testGenerateFichesIsGone(): void
    {
        // Le bon jeton n'ouvre plus rien : la route est partie (2026-10-20).
        $previousLog = ini_set('error_log', '/dev/null'); // le middleware d'erreurs journalise la HttpNotFoundException
        try {
            $response = $this->requestWithHeaders('POST', '/admin/generate-fiches', ['force' => true],
                ['X-Migrate-Token' => self::TOKEN]);
        } finally {
            ini_set('error_log', $previousLog === false ? '' : $previousLog);
        }
        self::assertSame(404, $response->getStatusCode());
    }

    public function testDumpFichesGates(): void
    {
        TestDb::setEnv('MIGRATE_TOKEN', '');
        self::assertSame(404, $this->getDump()->getStatusCode());

        TestDb::setEnv('MIGRATE_TOKEN', self::TOKEN);
        self::assertSame(403, $this->getDump(null)->getStatusCode(), 'en-tête absent');
        self::assertSame(403, $this->getDump('wrong_token')->getStatusCode(), 'mauvais jeton');

        TestDb::setEnv('DB_HOST', '');
        Db::reset();
        self::assertSame(503, $this->getDump()->getStatusCode());
    }

    // ------------------------------------------------------------ dump-fiches

    public function testDumpFichesReturnsSeededCorpusThenTracksGovernedEdit(): void
    {
        $this->seedFromCorpus();

        // Le dump === le corpus seedé, clés et octets compris (c'est LA
        // condition de la byte-stabilité de scripts/dump-fiches.mjs).
        $response = $this->getDump();
        self::assertSame(200, $response->getStatusCode());
        $body = self::body($response);
        self::assertCount(7, $body['poleHeaders']);
        self::assertCount(61, $body['fiches']);
        self::assertSame(self::$corpus['poleHeaders'], $body['poleHeaders']);
        self::assertSame(self::$corpus['fiches'], $body['fiches']);

        // Après une édition gouvernée publiée (1.1.0), le dump suit LA BASE :
        // la fiche dumpée est la 1.1.0, les 60 autres restent byte-identiques.
        $code = '1.01';
        $newFiche = substr(self::$corpus['fiches'][$code], 0, -\strlen("\n\n---"))
            . "\n\n*Enrichissement entériné par le vote (test dump).*\n\n---";
        $this->publishGovernedFicheEdit($code, $newFiche);

        $afterEdit = self::body($this->getDump());
        self::assertSame($newFiche, $afterEdit['fiches'][$code], 'le dump reflète la version publiée 1.1.0');
        foreach (self::$corpus['fiches'] as $other => $fiche) {
            if ($other !== $code) {
                self::assertSame($fiche, $afterEdit['fiches'][$other], "fiche {$other} intacte");
            }
        }
        self::assertSame(self::$corpus['poleHeaders'], $afterEdit['poleHeaders']);
    }
}
