<?php

declare(strict_types=1);

namespace Humanome\Cartographe;

use Humanome\Referentiel\Conformite;
use Humanome\Referentiel\ReferentielRepository;
use PDO;

/**
 * The referential version a cartography is reviewed against (2026-10-20):
 * its annotations take that version's codes, its revisions must conform to
 * it — the guard against a lost pole no longer comes from a schema pinned on
 * RESPIRE v7 (docs/contrats.md §11).
 *
 *  1. the version the cartography stored (`referentiel_version_id`);
 *  2. else, among the published versions of the referential its document
 *     names (« respire » when it names none), the most recent one its
 *     document conforms to — a cartography of RESPIRE v7 stays read against
 *     v7 once a RESPIRE of another structure is published — and, when its
 *     document conforms to none, the latest published;
 *  3. none when that referential has no published version: there is then
 *     nothing to check a code or a revision against.
 */
final class ReviewReferentiel
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * @return array{id: string, version: string|null, document: array<string, mixed>|null}|null
     *   null for an unknown cartography; `version` and `document` null when the
     *   referential it names has no published version
     */
    public function forCartography(int $cartoId): ?array
    {
        $stmt = $this->pdo->prepare('SELECT c.type, c.document, rv.referentiel_id, rv.semver, rv.content
            FROM cartographies c
            LEFT JOIN referentiel_versions rv ON rv.id = c.referentiel_version_id
            WHERE c.id = ?');
        $stmt->execute([$cartoId]);
        $row = $stmt->fetch();
        if ($row === false) {
            return null;
        }
        if ($row['referentiel_id'] !== null) {
            $content = json_decode((string) $row['content'], true);

            return [
                'id' => (string) $row['referentiel_id'],
                'version' => (string) $row['semver'],
                'document' => \is_array($content) ? $content : null,
            ];
        }

        $document = $row['document'] === null ? null : json_decode((string) $row['document'], true);
        $id = self::namedBy($document);
        $versions = (new ReferentielRepository($this->pdo))->publishedVersions($id);
        if ($versions === []) {
            return ['id' => $id, 'version' => null, 'document' => null];
        }
        $kind = 'cartographie-' . (string) $row['type'];
        if (\is_array($document) && \in_array($kind, ['cartographie-jour', 'cartographie-merge'], true)) {
            foreach ($versions as $version) {
                try {
                    if (Conformite::verifier($kind, $document, (array) $version['content'])['valid']) {
                        return self::shape($version);
                    }
                } catch (\InvalidArgumentException) {
                    // a malformed legacy version: not this one
                }
            }
        }

        return self::shape($versions[0]);
    }

    /**
     * The reference alone, for the review view: {id, version}, version null
     * when the referential has no published version; null for an unknown
     * cartography.
     *
     * @return array{id: string, version: string|null}|null
     */
    public function reference(int $cartoId): ?array
    {
        $found = $this->forCartography($cartoId);

        return $found === null ? null : ['id' => $found['id'], 'version' => $found['version']];
    }

    /** The referential a document names (T17): its `referentiel`, « respire » when it names none. */
    private static function namedBy(mixed $document): string
    {
        $named = \is_array($document) ? ($document['referentiel'] ?? null) : null;

        return \is_string($named) && $named !== '' ? $named : Conformite::REFERENTIEL_PAR_DEFAUT;
    }

    /**
     * @param array<string, mixed> $version a ReferentielRepository row
     * @return array{id: string, version: string, document: array<string, mixed>}
     */
    private static function shape(array $version): array
    {
        return [
            'id' => (string) $version['referentielId'],
            'version' => (string) $version['semver'],
            'document' => (array) $version['content'],
        ];
    }
}
