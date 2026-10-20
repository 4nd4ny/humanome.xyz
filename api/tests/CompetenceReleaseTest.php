<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;
use Humanome\Referentiel\InvalidDocumentException;
use Humanome\Referentiel\SnapshotAssembler;
use PDOException;

/**
 * Exigence (cahier §3.5, coupe de release) : la coupe assemble les compétences
 * entérinées en un snapshot immuable, avec GATE DE COMPLÉTUDE (la structure de
 * la dernière version publiée), semver strict, SANS second vote, et un lockfile release↔versions
 * (provenance indestructible). Le hash STRUCTUREL du snapshot reste b246101c…
 * (parité oracles intacte) — pinné ici en LITTÉRAL pour qu'une régénération
 * silencieuse de la fixture ne déplace pas l'oracle sans faire échouer un test.
 */
final class CompetenceReleaseTest extends CompetenceTestCase
{
    /** Hash structurel gelé du référentiel RESPIRE v7 (oracle moteur/Twin9). */
    private const ORACLE = 'b246101cab241ac3842bcdc8bc2d1672457d13b2cbff74cf734da67fa416b6b1';

    /** Seed les 7 pôles publiés (sans les 61 compétences). */
    private static function seedPoles(): void
    {
        $stmt = Db::get()->prepare('INSERT INTO referentiel_poles (num, nom, couleur) VALUES (?, ?, ?)');
        foreach (self::respireDocument()['poles'] as $pole) {
            $stmt->execute([$pole['num'], $pole['nom'], $pole['couleur'] ?? null]);
        }
    }

    // ------------------------------------------- gate de complétude en échec

    public function testIncompleteCorpusIsRefusedByTheCompletenessGate(): void
    {
        // 7 pôles mais 2 compétences publiées seulement : corpus incomplet. Le
        // schéma ne fixe plus 61/7 (2026-10-20) : le gate est la structure de la
        // dernière version publiée, que le modèle atomique ne change pas.
        self::seedPoles();
        self::seedCompetence('1.01', 'Pensée Critique', 1);
        self::seedCompetence('2.01', 'Écoute', 2);

        // Sans version publiée, rien à compléter : refusée.
        $doc = (new SnapshotAssembler(Db::get()))->assembleDocument('7.2.0', 'RESPIRE v7.2', 'test');
        try {
            self::repo()->cutReleaseFromDocument($doc);
            self::fail('Expected InvalidDocumentException (no published version)');
        } catch (InvalidDocumentException $e) {
            self::assertSame(['/version'], array_keys($e->getErrors()));
        }
        self::assertNull(self::repo()->latestPublished(self::RESPIRE), 'aucune release fantôme');

        // Face à la 7.0.0 publiée : les 59 compétences manquantes sont nommées.
        self::importRespire();
        try {
            self::repo()->cutReleaseFromDocument($doc);
            self::fail('Expected InvalidDocumentException (completeness gate)');
        } catch (InvalidDocumentException $e) {
            self::assertSame(['/competences'], array_keys($e->getErrors()));
            self::assertCount(59, $e->getErrors()['/competences']);
            self::assertContains('La compétence 1.02 de la version 7.0.0 manque', $e->getErrors()['/competences']);
        }
        self::assertSame('7.0.0', self::repo()->latestPublished(self::RESPIRE)['semver'], 'aucune release fantôme');
    }

    public function testMissingPolesAreRefusedByTheCompletenessGate(): void
    {
        // 2 compétences publiées et AUCUN pôle seedé : les deux gates échouent,
        // celui des pôles (minItems 7) doit être signalé.
        self::seedCompetence('1.01', 'Pensée Critique', 1);
        self::seedCompetence('2.01', 'Écoute', 2);

        $doc = (new SnapshotAssembler(Db::get()))->assembleDocument('7.2.0', 'RESPIRE v7.2', 'test');
        try {
            self::repo()->cutReleaseFromDocument($doc);
            self::fail('Expected InvalidDocumentException (poles minItems gate)');
        } catch (InvalidDocumentException $e) {
            self::assertStringContainsString(
                'poles',
                implode(' ', array_keys($e->getErrors())),
                'Le schéma (minItems 7) doit pointer les pôles manquants',
            );
        }
    }

    public function testIncompleteCorpusIs422OverHttp(): void
    {
        self::seedPoles();
        self::seedCompetence('1.01', 'Pensée Critique', 1);
        self::loginAs(self::createUser('epistemiarque'));

        $response = $this->request('POST', '/competences/release', ['semver' => '7.2.0']);
        self::assertSame(422, $response->getStatusCode());
        self::assertArrayHasKey('errors', self::body($response));
    }

    /**
     * A version of RESPIRE of another structure is published as a document
     * (UC-EPI-04, possible since 2026-10-20); the atomic model, which keeps the
     * 7 poles and 61 competences it was seeded with, cannot undo it.
     */
    public function testAReleaseThatWouldUndoAPublishedStructureIsRefused(): void
    {
        self::seedFullCorpus();
        $six = self::respireDocument();
        $six['version'] = '8.0.0';
        $six['label'] = 'RESPIRE v8';
        $six['poles'] = array_values(array_filter($six['poles'], static fn (array $p): bool => $p['num'] !== 7));
        $six['competences'] = array_values(array_filter($six['competences'], static fn (array $c): bool => $c['pole'] !== 7));
        $six['contentHash'] = \Humanome\Referentiel\ContentHash::compute($six);
        self::repo()->importPublishedDocument($six, 'RESPIRE en six pôles');

        $doc = (new SnapshotAssembler(Db::get()))->assembleDocument('8.1.0', 'RESPIRE v8.1', 'test');
        try {
            self::repo()->cutReleaseFromDocument($doc);
            self::fail('Expected InvalidDocumentException (structure of 8.0.0)');
        } catch (InvalidDocumentException $e) {
            self::assertSame(['Le pôle 7 n’est pas dans la version 8.0.0'], $e->getErrors()['/poles']);
            self::assertContains('La compétence 7.01 n’est pas dans la version 8.0.0', $e->getErrors()['/competences']);
        }
        self::assertSame('8.0.0', self::repo()->latestPublished(self::RESPIRE)['semver']);
    }

    // ------------------------------------------------- coupe réussie (HTTP)

    public function testHttpReleaseCutSucceedsAndPopulatesTheLockfile(): void
    {
        self::seedFullCorpus();
        self::loginAs(self::createUser('epistemiarque'));

        $response = $this->request('POST', '/competences/release', ['semver' => '7.2.0']);
        self::assertSame(201, $response->getStatusCode());
        $body = self::body($response);
        self::assertSame('imported', $body['status']);
        self::assertSame('7.2.0', $body['semver']);
        // Structure inchangée : le hash publié reste l'ORACLE gelé.
        self::assertSame(self::ORACLE, $body['contentHash']);

        // Lockfile : la release référence les 61 versions de compétence composées.
        $stmt = Db::get()->prepare(
            'SELECT COUNT(*) FROM referentiel_snapshot_competences WHERE snapshot_version_id = ?'
        );
        $stmt->execute([$body['id']]);
        self::assertSame(61, (int) $stmt->fetchColumn());
        self::assertSame('7.2.0', self::repo()->latestPublished(self::RESPIRE)['semver']);
    }

    // -------------------------------------------------- traçabilité oracle

    public function testStructuralHashMatchesTheFrozenOracleLiteral(): void
    {
        $publishedHash = self::seedFullCorpus();

        // Le hash publié ET le hash assemblé valent le LITTÉRAL gelé — pas
        // seulement l'un l'autre (une régénération de la fixture respire-v7.json
        // déplacerait l'oracle transitif sans faire échouer aucun test).
        self::assertSame(self::ORACLE, $publishedHash);
        self::assertSame(self::ORACLE, (new SnapshotAssembler(Db::get()))->structuralHash());
    }

    // ------------------------------------------------- lockfile indestructible

    public function testLockfileRestrictPreventsDeletingAReferencedCompetenceVersion(): void
    {
        self::seedFullCorpus();
        $pdo = Db::get();
        $doc = (new SnapshotAssembler($pdo))->assembleDocument('7.2.0', 'RESPIRE v7.2', 'test');
        $result = self::repo()->cutReleaseFromDocument($doc);

        $stmt = $pdo->prepare(
            'SELECT competence_version_id FROM referentiel_snapshot_competences
             WHERE snapshot_version_id = ? LIMIT 1'
        );
        $stmt->execute([$result['id']]);
        $referencedId = (int) $stmt->fetchColumn();
        self::assertGreaterThan(0, $referencedId);

        // FK RESTRICT : une version de compétence référencée par un snapshot ne
        // peut pas disparaître — la provenance de la release est indestructible.
        try {
            $pdo->prepare('DELETE FROM competence_versions WHERE id = ?')->execute([$referencedId]);
            self::fail('Expected PDOException (FK RESTRICT on the lockfile)');
        } catch (PDOException $e) {
            self::assertSame('23000', $e->getCode());
        }
        $check = $pdo->prepare('SELECT COUNT(*) FROM competence_versions WHERE id = ?');
        $check->execute([$referencedId]);
        self::assertSame(1, (int) $check->fetchColumn());
    }
}
