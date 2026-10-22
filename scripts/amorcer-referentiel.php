<?php

declare(strict_types=1);

/**
 * Seeds a converted referential (S5, lot B: the Humanome V18 of
 * respire.school) as a PUBLISHED version, without a vote — Christian's
 * decision of 2026-10-22 (S5 Q1). Run on a workstation:
 *
 *     node scripts/convertir-humanome.mjs <humanome_v18.yaml>
 *     php scripts/amorcer-referentiel.php build/referentiels/humanome-v18.0.0-proposition.1.json
 *
 * from the repository root, .env.dev exported (INSTALL.md §2). The guards
 * (RESPIRE and invalid ids refused, idempotent on the whole document but its
 * provenance) are Humanome\Referentiel\AmorcageReferentiel's, which
 * production reaches through POST /api/admin/import-referentiel
 * (docs/referentiel-humanome.md §5).
 *
 * Config via env: DB_HOST, DB_NAME, DB_USER, DB_PASSWORD (optional DB_PORT).
 * Output: one line. Exit code 0 (seeded, or already there), 1 (refused).
 */

$root = \dirname(__DIR__);
$autoload = $root . '/api/vendor/autoload.php';
if (!is_file($autoload)) {
    fwrite(STDERR, "Erreur : autoload introuvable — lancer : cd api && composer install\n");
    exit(1);
}
require $autoload;

use Humanome\Db;
use Humanome\Referentiel\AmorcageReferentiel;
use Humanome\Referentiel\ConflictException;
use Humanome\Referentiel\InvalidDocumentException;

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
if (!Db::isConfigured()) {
    fwrite(STDERR, "Erreur : DB_HOST n'est pas défini (DB_HOST, DB_NAME, DB_USER, DB_PASSWORD attendus dans l'environnement).\n");
    exit(1);
}

try {
    $doc = json_decode((string) file_get_contents($file), true, 512, JSON_THROW_ON_ERROR);
    if (!\is_array($doc) || array_is_list($doc)) {
        throw new \RuntimeException('le JSON n’est pas un objet');
    }
    $result = AmorcageReferentiel::amorcer(Db::get(), $doc);
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
