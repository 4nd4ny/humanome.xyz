<?php

declare(strict_types=1);

namespace Humanome\Referentiel;

use PDO;

/**
 * Seeds a converted referential (S5, lot B: the Humanome V18 of
 * respire.school, by scripts/convertir-humanome.mjs) as a PUBLISHED version,
 * without a vote — Christian's decision of 2026-10-22 (S5 Q1); the governed
 * path stays the épistémiarques' atelier (UC-EPI-05). Two entries, the same
 * guards:
 *  - a workstation: scripts/amorcer-referentiel.php <document.json>;
 *  - production (FTP-only, no shell, ADR-008): POST /api/admin/import-referentiel
 *    (X-Migrate-Token), for any id but RESPIRE's, which keeps the deploy
 *    script's path (importPublishedDocument).
 *
 * Stricter than ReferentielRepository::importPublishedDocument, which it
 * calls (schema, integrity, declared contentHash):
 *  - RESPIRE is never seeded here (scripts/import-referentiel.php and the
 *    deploy script seed it): under its id, another referential would become
 *    every flow's default (S5, E1); an id outside
 *    ReferentielRepository::ID_PATTERN is refused;
 *  - idempotent on the WHOLE document, not only on its contentHash, which
 *    leaves descriptions, levels and elements out: the same version already
 *    published with other descriptions is a conflict (a published version is
 *    immutable — a new semver is needed), never a silent « unchanged ». Only
 *    `source`, the provenance prose, is left out of the comparison: the same
 *    YAML converted under another file name or --url is the same version,
 *    and the published row keeps the provenance of its first seeding.
 */
final class AmorcageReferentiel
{
    /** The release note of a version seeded from a workstation: published without a vote. */
    public const NOTE = 'Amorçage hors vote (S5) : scripts/amorcer-referentiel.php';

    /** The release note of a version seeded through the deploy route (production). */
    public const NOTE_ROUTE = 'Amorçage hors vote (S5) : POST /api/admin/import-referentiel';

    /**
     * @param array<string, mixed> $doc a referential document, contentHash declared
     * @param string $note the release note of the published version
     * @return array{status: 'imported'|'unchanged', id: int, referentiel: string, semver: string, label: string, contentHash: string}
     * @throws ConflictException RESPIRE, a declared hash that is not the content's, the version there with another content
     * @throws InvalidDocumentException an invalid id or document
     */
    public static function amorcer(PDO $pdo, array $doc, string $note = self::NOTE): array
    {
        $id = $doc['id'] ?? null;
        if ($id === ReferentielRepository::DEFAULT_REFERENTIEL_ID) {
            throw new ConflictException('RESPIRE ne s’amorce pas ici (scripts/import-referentiel.php) : '
                . 'sous son identifiant, un autre référentiel deviendrait celui de tous les parcours');
        }
        if (!\is_string($id) || preg_match(ReferentielRepository::ID_PATTERN, $id) !== 1) {
            throw new InvalidDocumentException('Identifiant de référentiel invalide', ['/id' => [
                'Minuscules, chiffres, « . », « _ » ou « - », 64 caractères au plus']]);
        }

        $repository = new ReferentielRepository($pdo);
        $normalized = $repository->validateDocument($doc);
        $declared = $doc['contentHash'] ?? null;
        if ($declared !== $normalized['contentHash']) {
            throw new ConflictException(sprintf(
                'contentHash mismatch: document declares %s but canonical content hashes to %s',
                \is_string($declared) ? $declared : '(missing)',
                $normalized['contentHash'],
            ));
        }
        $existing = $repository->findVersion($id, $normalized['version']);
        if ($existing !== null) {
            if ($existing['referentielId'] === $id
                && $existing['status'] === 'published'
                && self::sansProvenance($existing['content']) === self::sansProvenance($normalized)) {
                return [
                    'status' => 'unchanged',
                    'id' => $existing['id'],
                    'referentiel' => $id,
                    'semver' => $existing['semver'],
                    'label' => $existing['label'],
                    'contentHash' => $existing['contentHash'],
                ];
            }
            throw new ConflictException(sprintf(
                'La version %s du référentiel « %s » existe déjà (%s) avec un autre contenu : '
                . 'une version publiée est immuable, il faut une nouvelle version',
                $existing['semver'],
                $existing['referentielId'],
                $existing['status'],
            ));
        }

        $result = $repository->importPublishedDocument($doc, $note);

        return [
            'status' => $result['status'],
            'id' => $result['id'],
            'referentiel' => $id,
            'semver' => $result['semver'],
            'label' => (string) $normalized['label'],
            'contentHash' => $result['contentHash'],
        ];
    }

    /**
     * What a published version holds: the whole canonical document but its
     * `source`, the provenance prose (file name, URL, converter), which a
     * re-conversion of the same YAML may word otherwise.
     *
     * @param array<string, mixed> $doc a normalized document
     */
    private static function sansProvenance(array $doc): string
    {
        unset($doc['source']);

        return ContentHash::encode($doc);
    }
}
