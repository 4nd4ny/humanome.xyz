<?php

declare(strict_types=1);

/**
 * Worker — CLI entry point (P11, ADR-005, docs/plan-masse.md; Twin9 runs,
 * ADR-011). One BOUNDED tick per invocation, made for a cron (no long
 * processes on shared hosting):
 *
 *     php scripts/worker.php
 *
 * The same tick is reachable without SSH through POST /api/admin/worker-tick
 * (X-Worker-Tick-Token or X-Migrate-Token, api/src/routes/worker.php).
 *
 * Environment knobs (all optional): WORKER_TICK_BUDGET_SECONDS (default: the
 * Twin9 configuration's slice, 40 s; 45 at most), TWIN_V9_DIR (the Twin9 engine),
 * WORKER_TICK_MAX_CALLS (bound a tick by LLM calls — dev/rehearsal tool),
 * WORKER_MAX_TOKENS (8192), WORKER_MODEL (claude-sonnet-4-5),
 * WORKER_PROVIDER=mock (local dev without a key), ANTHROPIC_API_KEY
 * (provider 'humanome'), SODIUM_MASTER_KEY (endpoint keys at rest).
 *
 * After the slice, once a UTC day where ANTHROPIC_API_KEY is set, it reads
 * Anthropic's prices into the grid, as the route does (Twin9\TarifsAnthropic,
 * 2026-10-22). Then it lifts a batch of the sign-ups' waiting list once a new
 * UTC month has begun (sprint 7, Auth\Waitlist), as the route does too.
 *
 * Output: the tick counters as one JSON line — counters only, never any
 * portfolio or document content (cahier §6.5) —, with `tarifs` (ok, echec)
 * when the prices were read and `listeAttenteLevees` when accounts left the
 * waiting list.
 */

$root = dirname(__DIR__);

// Repo layout (scripts/ next to api/) or release layout (ADR-008: the api
// contents live at the release root, scripts/ next to src/ and vendor/).
foreach ([$root . '/api/vendor/autoload.php', $root . '/vendor/autoload.php'] as $autoload) {
    if (is_file($autoload)) {
        require $autoload;
        break;
    }
}
if (!class_exists(\Humanome\Worker\Tick::class)) {
    fwrite(STDERR, "[worker] autoload introuvable (vendor/)\n");
    exit(1);
}

// Same secrets resolution as Bootstrap::envDir(): ~/app/shared on OVH
// (outside the webroot), api/.env when present, else plain env vars (dev:
// .env.dev exported, INSTALL.md §2).
$envCandidates = [
    getenv('HUMANOME_SHARED_DIR') ?: null,
    $root . '/../shared', // OVH: ~/app/releases/<ts>/scripts -> ~/app/shared
    $root . '/api',
];
foreach ($envCandidates as $dir) {
    if ($dir !== null && $dir !== '' && is_file($dir . '/.env')) {
        \Dotenv\Dotenv::createImmutable($dir)->safeLoad();
        break;
    }
}

if (!\Humanome\Db::isConfigured()) {
    fwrite(STDERR, "[worker] base de données non configurée\n");
    exit(1);
}

// The private Twin9 engine (ADR-011), when TWIN_V9_DIR holds it: its runs advance too.
\Humanome\Twin9\EngineLoader::load();

try {
    $counters = (new \Humanome\Worker\Tick(\Humanome\Db::get()))->run();
} catch (\Throwable $e) {
    fwrite(STDERR, '[worker] tick en échec : ' . $e->getMessage() . "\n");
    exit(1);
}

// Anthropic's prices, once a UTC day: their failure never fails the tick.
$tarifs = \Humanome\Twin9\TarifsAnthropic::releverApresTranche(\Humanome\Db::get());
if ($tarifs !== null) {
    $counters['tarifs'] = $tarifs;
}

// The sign-ups' waiting list, on the 1st of the month (sprint 7): a batch, in
// sign-up order; its failure never fails the tick either.
try {
    $levees = (new \Humanome\Auth\Waitlist(\Humanome\Db::get()))->liftDue();
    if ($levees > 0) {
        $counters['listeAttenteLevees'] = $levees;
    }
} catch (\Throwable $e) {
    fwrite(STDERR, '[worker] liste d\'attente non levée : ' . $e::class . "\n");
}

echo json_encode($counters, JSON_THROW_ON_ERROR), "\n";
exit(0);
