<?php

declare(strict_types=1);

/**
 * The purge of the user API keys stored before ADR-013 (§2 a, §8) — an
 * administration script, run by hand only: neither the worker, nor a
 * scheduled task, nor the deployment calls it. The logic is
 * Humanome\Keys\UserKeysPurge (api/src/Keys/UserKeysPurge.php), which the
 * tests exercise; this file only reads the arguments.
 *
 *     php scripts/purger-cles-utilisateurs.php                     # counts, changes nothing
 *     php scripts/purger-cles-utilisateurs.php aviser              # mails the accounts not told yet
 *     php scripts/purger-cles-utilisateurs.php purger --confirmer  # deletes the keys notified 30 days ago
 *
 * Without `--confirmer`, `purger` only says what it would delete. The day of
 * the purge, and how it runs in production (no SSH on the OVH hosting,
 * ADR-008), are Christian's to decide (ADR-013, « À signaler à Christian »).
 *
 * Output: the counters, as one JSON line. Never a key nor an address.
 */

if (PHP_SAPI !== 'cli' || !isset($argv[0]) || realpath($argv[0]) !== realpath(__FILE__)) {
    return;
}

$root = \dirname(__DIR__);
foreach ([$root . '/api/vendor/autoload.php', $root . '/vendor/autoload.php'] as $autoload) {
    if (is_file($autoload)) {
        require $autoload;
        break;
    }
}
if (!class_exists(\Humanome\Db::class)) {
    fwrite(STDERR, "[purger-cles] autoload introuvable (vendor/)\n");
    exit(1);
}

// Same secrets resolution as scripts/worker.php and scripts/maintenance.php.
foreach ([
    getenv('HUMANOME_SHARED_DIR') ?: null,
    $root . '/../shared',
    $root . '/api',
] as $dir) {
    if ($dir !== null && $dir !== '' && is_file($dir . '/.env')) {
        \Dotenv\Dotenv::createImmutable($dir)->safeLoad();
        break;
    }
}
if (!\Humanome\Db::isConfigured()) {
    fwrite(STDERR, "[purger-cles] base de données non configurée\n");
    exit(1);
}

$mode = $argv[1] ?? 'compter';
$confirme = in_array('--confirmer', array_slice($argv, 2), true);
if (!in_array($mode, ['compter', 'aviser', 'purger'], true)) {
    fwrite(STDERR, "[purger-cles] mode inconnu : compter (défaut), aviser, ou purger --confirmer\n");
    exit(2);
}

try {
    $purge = new \Humanome\Keys\UserKeysPurge(\Humanome\Db::get(), \Humanome\Mail\MailerFactory::default());
    $resultat = match (true) {
        $mode === 'aviser' => $purge->notify(),
        $mode === 'purger' && $confirme => $purge->purge(microtime(true) + 300.0),
        default => $purge->count(),
    };
} catch (\Throwable $e) {
    fwrite(STDERR, '[purger-cles] échec : ' . $e->getMessage() . "\n");
    exit(1);
}

echo json_encode(['mode' => $mode === 'purger' && !$confirme ? 'compter' : $mode] + $resultat,
    JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), "\n";
exit(0);
