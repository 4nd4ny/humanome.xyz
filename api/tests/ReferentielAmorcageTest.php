<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Amorcage\AmorcageReferentiel;
use Humanome\Db;
use Humanome\Env;
use Humanome\Referentiel\ConflictException;
use Humanome\Referentiel\ContentHash;
use Humanome\Referentiel\InvalidDocumentException;
use Humanome\Referentiel\ReferentielRepository;

require_once \dirname(__DIR__, 2) . '/scripts/amorcer-referentiel.php';

/**
 * S5, lot B: a referential converted from the Humanome YAML
 * (scripts/convertir-humanome.mjs) is seeded as a published version, without
 * a vote (scripts/amorcer-referentiel.php, Christian's decision Q1), and the
 * flows' menus see it (the public routes of lot A). On the FICTIONAL fixture
 * the converter writes (schemas/fixtures/referentiel-humanome-fictif*.json,
 * from referentiel-humanome-fictif.yaml): no real referential in the
 * repository.
 */
final class ReferentielAmorcageTest extends ReferentielTestCase
{
    private const ID = 'fictif-humanome';
    private const VERSION = '2.0.0-proposition.1';

    /** @return array<string, mixed> */
    private static function fixture(string $suffixe = ''): array
    {
        $path = \dirname(__DIR__, 2) . "/schemas/fixtures/referentiel-humanome-fictif{$suffixe}.json";

        return json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }

    private static function versions(): int
    {
        $stmt = Db::get()->prepare('SELECT COUNT(*) FROM referentiel_versions WHERE referentiel_id = ?');
        $stmt->execute([self::ID]);

        return (int) $stmt->fetchColumn();
    }

    /**
     * The converter's hash is the server's (ContentHash, byte-identical to
     * scripts/extract-referentiel.mjs), and the document it writes is already
     * in the canonical order the database keeps.
     */
    public function testTheConvertedDocumentHasTheServersHashAndOrder(): void
    {
        foreach (['', '-facette'] as $suffixe) {
            $doc = self::fixture($suffixe);
            self::assertSame($doc['contentHash'], ContentHash::compute($doc), $suffixe);
            self::assertSame($doc, ContentHash::normalize($doc), $suffixe);
            self::assertSame($doc, self::repo()->validateDocument($doc), $suffixe);
        }
    }

    /** The converter's facette level is the repository's (auNiveau): the two must not drift. */
    public function testTheFacetteLevelIsTheRepositorysReading(): void
    {
        $repo = self::repo();
        $auNiveau = $repo->validateDocument(ReferentielRepository::auNiveau($repo->validateDocument(self::fixture()), 1));
        $facette = $repo->validateDocument(self::fixture('-facette'));
        // only the provenance says which level was converted
        self::assertStringContainsString('niveau capacité', $auNiveau['source']);
        self::assertStringContainsString('niveau facette', $facette['source']);
        unset($auNiveau['source'], $facette['source']);
        self::assertSame($auNiveau, $facette);
    }

    public function testSeedingPublishesWithoutAVoteThenIsIdempotentAndTheMenusSeeIt(): void
    {
        self::importRespire();
        $doc = self::fixture();

        $first = AmorcageReferentiel::amorcer(Db::get(), $doc);
        self::assertSame(['imported', self::ID, self::VERSION, 'Fictif V2', $doc['contentHash']],
            [$first['status'], $first['referentiel'], $first['semver'], $first['label'], $first['contentHash']]);
        $version = self::repo()->findVersion(self::ID, self::VERSION);
        self::assertSame(['published', AmorcageReferentiel::NOTE, null],
            [$version['status'], $version['releaseNote'], $version['createdBy']]);
        self::assertNotNull($version['publishedAt']);

        $second = AmorcageReferentiel::amorcer(Db::get(), $doc);
        self::assertSame('unchanged', $second['status']);
        self::assertSame($first['id'], $second['id']);
        self::assertSame(1, self::versions());

        // the flows' menus (lot A): listed by the public catalogue, served by id and version, to anyone
        self::assertSame([
            ['id' => self::ID, 'label' => 'Fictif V2', 'versions' => [self::VERSION]],
            ['id' => self::RESPIRE, 'label' => 'RESPIRE v7', 'versions' => ['7.0.0']],
        ], self::body($this->request('GET', '/referentiels')));
        $served = $this->request('GET', '/referentiels/' . self::ID . '/versions/' . self::VERSION);
        self::assertSame(200, $served->getStatusCode(), (string) $served->getBody());
        self::assertSame($doc, self::body($served));
        // RESPIRE stays the default: the latest of its own id
        self::assertSame('7.0.0', self::repo()->latestPublished(self::RESPIRE)['semver']);
    }

    /**
     * The repository's import compares the contentHash only, which leaves the
     * descriptions out: the seed compares the whole document, so that a
     * re-conversion of the same version never passes for « unchanged ».
     */
    public function testSeedingRefusesAnotherContentUnderTheSameVersion(): void
    {
        $doc = self::fixture();
        AmorcageReferentiel::amorcer(Db::get(), $doc);

        $redige = $doc;
        $redige['competences'][0]['description'] .= "\n\n**Relance** : une autre.";
        self::assertSame($doc['contentHash'], ContentHash::compute($redige), 'a description stays out of the hash');
        self::assertSame('unchanged', self::repo()->importPublishedDocument($redige, 'x')['status'],
            'the repository alone would have said unchanged');
        $niveaux = $doc;
        $niveaux['niveaux'][1]['motif'] = '[A-B][1-2]\.[1-4]';
        $structure = $doc;
        $structure['competences'][0]['nom'] = 'Autre nom fictif';
        $structure['contentHash'] = ContentHash::compute($structure);
        foreach (['description' => $redige, 'niveaux' => $niveaux, 'structure' => $structure] as $cas => $autre) {
            try {
                AmorcageReferentiel::amorcer(Db::get(), $autre);
                self::fail("{$cas}: accepted");
            } catch (ConflictException $e) {
                self::assertStringContainsString('immuable', $e->getMessage(), $cas);
            }
        }
        self::assertSame(1, self::versions());
        self::assertSame($doc, self::body($this->request('GET', '/referentiels/' . self::ID . '/versions/' . self::VERSION)));

        // a declared hash that is not the content's
        $faux = self::fixture();
        $faux['version'] = '2.0.1';
        $faux['contentHash'] = str_repeat('0', 64);
        $this->expectException(ConflictException::class);
        $this->expectExceptionMessage('contentHash mismatch');
        AmorcageReferentiel::amorcer(Db::get(), $faux);
    }

    /** A draft of the same version (the atelier's path) is not published over. */
    public function testSeedingRefusesAVersionTheAtelierHolds(): void
    {
        $author = self::createUser('epistemiarque');
        self::repo()->importDraft(self::fixture(), 'capacité', $author);
        try {
            AmorcageReferentiel::amorcer(Db::get(), self::fixture());
            self::fail('accepted over a draft');
        } catch (ConflictException $e) {
            self::assertStringContainsString('(draft)', $e->getMessage());
        }
        self::assertSame('draft', self::repo()->findVersion(self::ID, self::VERSION)['status']);
    }

    /** Never under RESPIRE's id (S5, E1), never an id the atelier would refuse. */
    public function testSeedingRefusesRespireAndInvalidIds(): void
    {
        $respire = self::fixture();
        $respire['id'] = self::RESPIRE;
        try {
            AmorcageReferentiel::amorcer(Db::get(), $respire);
            self::fail('RESPIRE seeded');
        } catch (ConflictException $e) {
            self::assertStringContainsString('RESPIRE', $e->getMessage());
        }
        foreach (['Fictif-Humanome', 'fictif humanome', '', null, 42] as $id) {
            $doc = self::fixture();
            $doc['id'] = $id;
            try {
                AmorcageReferentiel::amorcer(Db::get(), $doc);
                self::fail('accepted id ' . var_export($id, true));
            } catch (InvalidDocumentException $e) {
                self::assertArrayHasKey('/id', $e->getErrors());
            }
        }
        $invalide = self::fixture();
        $invalide['competences'][0]['code'] = 'A9';
        $invalide['contentHash'] = ContentHash::compute($invalide);
        try {
            AmorcageReferentiel::amorcer(Db::get(), $invalide);
            self::fail('accepted a code outside its motif');
        } catch (InvalidDocumentException $e) {
            self::assertNotSame([], $e->getErrors());
        }
        $count = Db::get()->query('SELECT COUNT(*) FROM referentiel_versions')->fetchColumn();
        self::assertSame(0, (int) $count);
    }

    /** The command line, as a workstation runs it: seeded, then already there; refusals exit 1. */
    public function testTheCommandLineSeedsOnceThenSaysItIsThere(): void
    {
        $fixture = \dirname(__DIR__, 2) . '/schemas/fixtures/referentiel-humanome-fictif.json';
        [$code, $out, $err] = self::cli([$fixture]);
        self::assertSame(0, $code, $err);
        self::assertSame("amorcé : « Fictif V2 » (fictif-humanome 2.0.0-proposition.1), publié hors vote (hash "
            . substr(self::fixture()['contentHash'], 0, 12) . ").\n", $out);
        [$code, $out] = self::cli([$fixture]);
        self::assertSame(0, $code);
        self::assertStringStartsWith('déjà amorcé : « Fictif V2 »', $out);
        self::assertSame(1, self::versions());

        $respire = self::fixture();
        $respire['id'] = self::RESPIRE;
        $tmp = tempnam(sys_get_temp_dir(), 'amorcer');
        file_put_contents($tmp, json_encode($respire, JSON_THROW_ON_ERROR));
        try {
            [$code, , $err] = self::cli([$tmp]);
            self::assertSame(1, $code);
            self::assertStringStartsWith('Refusé : RESPIRE ne s’amorce pas ici', $err);
            file_put_contents($tmp, '[1, 2]');
            self::assertSame(1, self::cli([$tmp])[0]);
        } finally {
            unlink($tmp);
        }
        self::assertSame(1, self::cli([$fixture . '.absent'])[0]);
        self::assertSame(1, self::cli([])[0]);
    }

    /**
     * @param list<string> $args
     * @return array{int, string, string} exit code, stdout, stderr
     */
    private static function cli(array $args): array
    {
        $env = getenv();
        foreach (['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'] as $key) {
            $value = Env::get($key);
            if ($value !== '') {
                $env[$key] = $value;
            }
        }
        // never the development database: the test one, as TestDb points the app at it
        self::assertSame(TestDb::name(), $env['DB_NAME'] ?? null);
        $script = \dirname(__DIR__, 2) . '/scripts/amorcer-referentiel.php';
        $process = proc_open([PHP_BINARY, $script, ...$args], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, $env);
        self::assertIsResource($process);
        $out = (string) stream_get_contents($pipes[1]);
        $err = (string) stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);

        return [proc_close($process), $out, $err];
    }
}
