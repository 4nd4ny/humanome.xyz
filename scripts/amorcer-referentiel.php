<?php

declare(strict_types=1);

/**
 * Seeds a converted referential (S5, lot B: the Humanome V18 of
 * respire.school, by scripts/convertir-humanome.mjs) as a PUBLISHED version,
 * without a vote — Christian's decision of 2026-10-22 (S5 Q1); the governed
 * path stays the épistémiarques' atelier (UC-EPI-05). Run on a workstation:
 *
 *     node scripts/convertir-humanome.mjs <humanome_v18.yaml>
 *     php scripts/amorcer-referentiel.php build/referentiels/humanome-v18.0.0-proposition.1.json
 *
 * from the repository root, .env.dev exported (INSTALL.md §2). Production
 * (FTP-only, no shell, ADR-008) has no CLI: docs/referentiel-humanome.md says
 * how the same document reaches it (POST /api/admin/import-referentiel, or the
 * atelier).
 *
 * Stricter than ReferentielRepository::importPublishedDocument, which it
 * calls (schema, integrity, declared contentHash):
 *  - RESPIRE is never seeded here (scripts/import-referentiel.php seeds it):
 *    under its id, another referential would become every flow's default
 *    (S5, E1); an id outside ReferentielRepository::ID_PATTERN is refused;
 *  - idempotent on the WHOLE document, not only on its contentHash, which
 *    leaves descriptions, levels and elements out: the same version already
 *    published with other descriptions is a conflict (a published version is
 *    immutable — a new semver is needed), never a silent « unchanged ». Only
 *    `source`, the provenance prose, is left out of the comparison: the same
 *    YAML converted under another file name or --url is the same version,
 *    and the published row keeps the provenance of its first seeding.
 *
 * Output: one line. Exit code 0 (seeded, or already there), 1 (refused).
 */

namespace Humanome\Amorcage;

use Humanome\Referentiel\ConflictException;
use Humanome\Referentiel\ContentHash;
use Humanome\Referentiel\InvalidDocumentException;
use Humanome\Referentiel\ReferentielRepository;
use PDO;

final class AmorcageReferentiel
{
    /** The release note of a seeded version: published without a vote. */
    public const NOTE = 'Amorçage hors vote (S5) : scripts/amorcer-referentiel.php';

    /**
     * @param array<string, mixed> $doc a referential document, contentHash declared
     * @return array{status: 'imported'|'unchanged', id: int, referentiel: string, semver: string, label: string, contentHash: string}
     * @throws ConflictException RESPIRE, a declared hash that is not the content's, the version there with another content
     * @throws InvalidDocumentException an invalid id or document
     */
    public static function amorcer(PDO $pdo, array $doc): array
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

        $result = $repository->importPublishedDocument($doc, self::NOTE);

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

// ---------------------------------------------------------------------------
// CLI: php scripts/amorcer-referentiel.php <fichier.json>  (workstation only)
// ---------------------------------------------------------------------------

if (PHP_SAPI === 'cli' && isset($argv[0]) && realpath($argv[0]) === realpath(__FILE__)) {
    $root = \dirname(__DIR__);
    $autoload = $root . '/api/vendor/autoload.php';
    if (!is_file($autoload)) {
        fwrite(STDERR, "Erreur : autoload introuvable — lancer : cd api && composer install\n");
        exit(1);
    }
    require $autoload;

    $file = $argv[1] ?? null;
    if ($file === null || \count($argv) !== 2) {
        fwrite(STDERR, "Usage : php scripts/amorcer-referentiel.php <fichier.json>\n"
            . "        (le document converti : node scripts/convertir-humanome.mjs <fichier.yaml>)\n");
        exit(1);
    }
    if (!is_file($file)) {
        fwrite(STDERR, "Erreur : fichier introuvable : {$file}\n");
        exit(1);
    }
    if (!\Humanome\Db::isConfigured()) {
        fwrite(STDERR, "Erreur : DB_HOST n'est pas défini (DB_HOST, DB_NAME, DB_USER, DB_PASSWORD attendus dans l'environnement).\n");
        exit(1);
    }

    try {
        $doc = json_decode((string) file_get_contents($file), true, 512, JSON_THROW_ON_ERROR);
        if (!\is_array($doc) || array_is_list($doc)) {
            throw new \RuntimeException('le JSON n’est pas un objet');
        }
        $result = AmorcageReferentiel::amorcer(\Humanome\Db::get(), $doc);
    } catch (InvalidDocumentException $e) {
        fwrite(STDERR, 'Document refusé : ' . $e->getMessage() . "\n");
        foreach ($e->getErrors() as $pointer => $messages) {
            fwrite(STDERR, sprintf("  %s : %s\n", $pointer, implode(' | ', $messages)));
        }
        exit(1);
    } catch (ConflictException $e) {
        fwrite(STDERR, 'Refusé : ' . $e->getMessage() . "\n");
        exit(1);
    } catch (\Throwable $e) {
        fwrite(STDERR, 'Échec de l’amorçage : ' . $e->getMessage() . "\n");
        exit(1);
    }

    printf(
        "%s : « %s » (%s %s), publié hors vote (hash %s)%s\n",
        $result['status'] === 'unchanged' ? 'déjà amorcé' : 'amorcé',
        $result['label'],
        $result['referentiel'],
        $result['semver'],
        substr($result['contentHash'], 0, 12),
        $result['status'] === 'unchanged' ? ', rien à faire.' : '.',
    );
    exit(0);
}
