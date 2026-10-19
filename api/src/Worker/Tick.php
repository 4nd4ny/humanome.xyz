<?php

declare(strict_types=1);

namespace Humanome\Worker;

use Humanome\Env;
use Humanome\Etablissement\CohorteRepository;
use Humanome\Etablissement\ConfigRepository;
use Humanome\Keys\KeyVault;
use Humanome\Llm\AnthropicProvider;
use Humanome\Llm\CurlHttpClient;
use Humanome\Llm\LlmRuntime;
use Humanome\Llm\MockProvider;
use Humanome\Llm\Pricing;
use Humanome\Packages\PromptPackageRepository;
use Humanome\Packages\SettingsRepository;
use Humanome\Referentiel\ReferentielRepository;
use Humanome\Twin9\CallSender;
use Humanome\Twin9\DirectCalls;
use Humanome\Twin9\EngineLoader;
use Humanome\Twin9\RunKey;
use Humanome\Twin9\Twin9Config;
use PDO;

/**
 * One bounded worker tick (ADR-005, docs/plan-masse.md §2-3): serialized by
 * GET_LOCK('humanome_worker'). First the Twin9 runs (ADR-011 §2): at most N
 * advance within the slice (Twin9Slice), N and the slice's length being the
 * administrator's (Twin9Config, 45 s at most). Then the mass cartography with
 * the time left: reserves the oldest workable job, advances it POLE BY POLE
 * (checkpoint after EACH successful LLM call), verifies the budget BEFORE
 * each call, and hands control back once the time budget is spent. Invoked
 * by the OVH cron (php scripts/worker.php) and by POST
 * /api/admin/worker-tick (routes/worker.php).
 *
 * Engine lessons applied (M5, STATUS.md): stop_reason max_tokens fails loudly
 * (truncated JSON poisons documents); one immediate retry per call (stochastic
 * malformations); persistent kairos failure DEGRADES to null (schema-valid)
 * instead of losing the 7 pole documents.
 *
 * Logging: counters only, never content (cahier §6.5).
 */
final class Tick
{
    public const LOCK_NAME = 'humanome_worker';
    public const CHARS_PER_TOKEN = 3.6; // engine/src/providers/estimate.js heuristic

    /** A slice lasts 45 seconds at most (OVH, ADR-005 and ADR-011). */
    public const MAX_SECONDS = 45;

    private readonly int $budgetSeconds;
    private readonly int $maxCalls;
    private readonly int $maxTokens;
    /** @var callable(array<string, mixed>): object */
    private $providerFactory;

    private readonly ?CallSender $twin9Sender;
    private readonly ?int $twin9Runs;
    /** @var list<float>|null */
    private readonly ?array $twin9Pauses;

    private readonly JobQueue $queue;
    private readonly ConfigRepository $configs;
    private readonly CohorteRepository $cohortes;
    /** @var array<string, ?PromptRunner> cache per (package, referentiel) pair */
    private array $runners = [];
    /** @var array<int, object> provider cache per establishment */
    private array $providers = [];

    private float $startedAt = 0.0;
    /** @var array<string, int> */
    private array $counters = [];
    /** Twin9 runs had the slice: the mass gets no guaranteed call past its end. */
    private bool $twin9Ran = false;

    /**
     * @param array{budgetSeconds?: int, maxCalls?: int, maxTokens?: int,
     *              providerFactory?: callable(array<string, mixed>): object,
     *              twin9Sender?: CallSender, twin9Runs?: int, twin9Pauses?: list<float>} $options
     *        twin9*: tests — the sender of the Twin9 calls, the runs a tick advances, the pauses between attempts
     */
    public function __construct(private readonly PDO $pdo, array $options = [])
    {
        $this->budgetSeconds = min(self::MAX_SECONDS, $options['budgetSeconds'] ?? $this->configuredSeconds());
        // WORKER_TICK_MAX_CALLS bounds a CLI tick by calls, like the HTTP
        // tick's maxCalls option — the operational DoD rehearsal relies on it
        // (a mock call costs ~0.2 ms: a time-bounded tick would drain the
        // whole queue in one go, leaving nothing to interrupt/resume).
        $envMaxCalls = (int) (Env::get('WORKER_TICK_MAX_CALLS', '0') ?: 0);
        $this->maxCalls = $options['maxCalls'] ?? ($envMaxCalls > 0 ? $envMaxCalls : PHP_INT_MAX);
        $this->maxTokens = $options['maxTokens'] ?? (int) (Env::get('WORKER_MAX_TOKENS', '8192') ?: 8192);
        $this->providerFactory = $options['providerFactory'] ?? $this->defaultProviderFactory(...);
        $this->twin9Sender = $options['twin9Sender'] ?? null;
        $this->twin9Runs = $options['twin9Runs'] ?? null;
        $this->twin9Pauses = $options['twin9Pauses'] ?? null;
        $this->queue = new JobQueue($pdo);
        $this->configs = new ConfigRepository($pdo, KeyVault::masterKeyFromEnv());
        $this->cohortes = new CohorteRepository($pdo);
    }

    /**
     * Runs one tick. Returns its counters (the only thing ever logged):
     * locked, jobsTouched, jobsCompleted, jobsFailed, jobsReleased, calls,
     * callErrors, budgetBlocked, elapsedMs, and those of the Twin9 runs,
     * prefixed twin9, when the engine is loaded.
     *
     * @return array<string, int|bool>
     */
    public function run(): array
    {
        $this->startedAt = microtime(true);
        $this->counters = [
            'jobsTouched' => 0, 'jobsCompleted' => 0, 'jobsFailed' => 0,
            'jobsReleased' => 0, 'calls' => 0, 'callErrors' => 0, 'budgetBlocked' => 0,
        ];

        $lock = $this->pdo->query('SELECT GET_LOCK(' . $this->pdo->quote(self::LOCK_NAME) . ', 0)')->fetchColumn();
        if ((int) $lock !== 1) {
            return ['locked' => true, 'elapsedMs' => $this->elapsedMs()] + $this->counters;
        }

        try {
            $this->counters += $this->advanceTwin9();
            while (!$this->exhausted()) {
                $jobs = $this->queue->reserve(1);
                if ($jobs === []) {
                    break;
                }
                $this->counters['jobsTouched']++;
                if (!$this->processJob($jobs[0])) {
                    break; // time/call budget spent mid-job (job released)
                }
            }
        } finally {
            $this->pdo->query('SELECT RELEASE_LOCK(' . $this->pdo->quote(self::LOCK_NAME) . ')')->fetchColumn();
        }

        return ['locked' => false, 'elapsedMs' => $this->elapsedMs()] + $this->counters;
    }

    // ------------------------------------------------------------ Twin9 runs

    /**
     * The Twin9 runs of the slice, when the engine is loaded (ADR-011 §4):
     * they keep a reserve of the slice to wind down in.
     *
     * @return array<string, int> their counters, prefixed twin9
     */
    private function advanceTwin9(): array
    {
        if (!EngineLoader::isLoaded() || !class_exists(\Twin9\Plateforme::class)) {
            return [];
        }
        $config = new Twin9Config(new SettingsRepository($this->pdo));
        $slice = new Twin9Slice(
            $this->pdo,
            $this->twin9Sender ?? new DirectCalls(LlmRuntime::multiHttpClient()),
            new RunKey($this->pdo, $config),
            $config,
            $this->twin9Pauses === null ? [] : ['pauses' => $this->twin9Pauses],
        );
        $reserve = min(1.0, max(0.25, 0.1 * $this->budgetSeconds));
        $counters = [];
        foreach ($slice->advanceUntil($this->twin9Runs ?? $config->runsParTick(), $this->startedAt,
            $this->startedAt + $this->budgetSeconds - $reserve) as $name => $value) {
            $counters['twin9' . ucfirst($name)] = $value;
        }
        $this->twin9Ran = $counters['twin9Runs'] > 0;

        return $counters;
    }

    /**
     * The slice's length: WORKER_TICK_BUDGET_SECONDS where a CLI tick sets it,
     * otherwise the administrator's (Twin9Config).
     */
    private function configuredSeconds(): int
    {
        $env = (int) (Env::get('WORKER_TICK_BUDGET_SECONDS', '') ?: 0);
        if ($env > 0) {
            return $env;
        }
        try {
            return (new Twin9Config(new SettingsRepository($this->pdo)))->secondesParTranche();
        } catch (\Throwable) {
            return 40;
        }
    }

    // -------------------------------------------------------------- one job

    /**
     * Advances one reserved job as far as the budgets allow. Returns false
     * when the tick must stop (time/call budget spent — job put back in
     * line, checkpoint kept), true to continue with the next job.
     */
    private function processJob(array $job): bool
    {
        $jobId = (int) $job['id'];
        $etablissementId = (int) $job['etablissement_id'];
        $date = (string) $job['day_date'];

        try {
            $config = $this->configs->find($etablissementId);
            if ($config === null) {
                $this->queue->failHard($jobId, 'configuration établissement absente');
                $this->counters['jobsFailed']++;

                return true;
            }

            // The platform tick serves ONLY the 'humanome' provider (reserve()
            // filters on it). Re-assert here: the config may have flipped
            // humanome->endpoint between the reservation SELECT and this read.
            // Without this guard the tick would build an HTTP client against
            // the establishment-controlled endpoint_url (only validated
            // ^https?://), i.e. an SSRF sink reachable through that race. An
            // 'endpoint' job belongs to the machine runner (/api/worker/*): put
            // it back in line (the cron's own reserve() filters it out now, the
            // runner claims it) — never fetch its endpoint from OVH (§5).
            if (($config['provider'] ?? 'humanome') !== 'humanome') {
                $this->queue->release($jobId);

                return true;
            }

            if ($job['portfolio_id'] === null) {
                $this->queue->failHard($jobId, 'portfolio retiré (consentement révoqué)');
                $this->counters['jobsFailed']++;

                return true;
            }
            $dayText = $this->cohortes->segmentText((int) $job['portfolio_id'], $date);
            if ($dayText === null || trim($dayText) === '') {
                $this->queue->failHard($jobId, "segment du {$date} introuvable dans le portfolio déposé");
                $this->counters['jobsFailed']++;

                return true;
            }

            $runner = $this->runnerFor($job);
            if ($runner === null) {
                $this->queue->failHard($jobId, sprintf(
                    'paquet %s@%s ou référentiel %s@%s indisponible/incomplet',
                    $job['prompt_package_slug'],
                    $job['prompt_package_semver'],
                    $job['referentiel_id'],
                    $job['referentiel_semver'],
                ));
                $this->counters['jobsFailed']++;

                return true;
            }

            return $this->advance($job, $config, $runner, $dayText);
        } catch (\Throwable $e) {
            // Defensive net: no exception may kill the tick loop.
            $this->queue->fail($jobId, 'erreur worker : ' . $e->getMessage());
            $this->counters['callErrors']++;

            return true;
        }
    }

    /** Pole-by-pole progress + kairos + assembly for one job. */
    private function advance(array $job, array $config, PromptRunner $runner, string $dayText): bool
    {
        $jobId = (int) $job['id'];
        $etablissementId = (int) $job['etablissement_id'];
        $date = (string) $job['day_date'];
        $model = $this->modelFor($config);
        $provider = $this->providerFor($etablissementId, $config);

        $checkpoint = \is_string($job['checkpoint'] ?? null) ? json_decode((string) $job['checkpoint'], true) : null;
        $poles = \is_array($checkpoint['poles'] ?? null) ? $checkpoint['poles'] : [];

        foreach ($runner->poleNums() as $num) {
            if (isset($poles[(string) $num])) {
                continue; // checkpointed pole: NEVER re-called (plan-masse §3)
            }
            if (!$this->mayStartCall($jobId)) {
                return false;
            }
            $prompt = $runner->polePrompt($num, $dayText, $date);
            if (!$this->budgetAllows($config, $prompt)) {
                $this->queue->markBudgetExceeded($etablissementId, $jobId);
                $this->counters['budgetBlocked']++;

                return true;
            }

            try {
                [$answer, $tokensIn, $tokensOut, $cost] = $this->callWithRetry(
                    $provider,
                    $model,
                    $prompt,
                    $config,
                    fn (string $text): array => PoleAssembler::assemblePole(
                        $this->parseObject($text),
                        $num,
                        $date,
                    ),
                );
            } catch (\Throwable $e) {
                $this->queue->fail($jobId, "pôle {$num} ({$date}) — " . $e->getMessage());
                $this->counters['callErrors']++;

                return true;
            }

            $poles[(string) $num] = $answer;
            $this->configs->addSpentUsd($etablissementId, $cost);
            if (!$this->queue->saveCheckpoint($jobId, ['poles' => $poles], $tokensIn, $tokensOut, $cost)) {
                return true; // cancelled/reclaimed under us: abandon silently
            }
        }

        // ----- kairos (1 call) + final assembly ---------------------------
        if (!$this->mayStartCall($jobId)) {
            return false;
        }
        $prompt = $runner->kairosPrompt($dayText, $date);
        if (!$this->budgetAllows($config, $prompt)) {
            $this->queue->markBudgetExceeded($etablissementId, $jobId);
            $this->counters['budgetBlocked']++;

            return true;
        }

        $polesByNum = [];
        foreach ($poles as $num => $pole) {
            $polesByNum[(int) $num] = $pole;
        }

        $kairos = null;
        $note = null;
        $tokensIn = 0;
        $tokensOut = 0;
        $cost = 0.0;
        try {
            [$kairos, $tokensIn, $tokensOut, $cost] = $this->callWithRetry(
                $provider,
                $model,
                $prompt,
                $config,
                function (string $text) use ($polesByNum, $date): mixed {
                    $parsed = PoleAssembler::parse($text);
                    PoleAssembler::validateKairos($parsed, $polesByNum, $date);

                    return $parsed;
                },
            );
        } catch (\Throwable $e) {
            // The 7 pole documents carry the value; the schema accepts null
            // (extractDay kairosOptional semantics — plan-masse §2).
            $kairos = null;
            $note = "kairos dégradé à null ({$date}) — " . $e->getMessage();
            $this->counters['callErrors']++;
        }
        $this->configs->addSpentUsd($etablissementId, $cost);

        try {
            $document = PoleAssembler::assembleDay($polesByNum, $kairos, $date);
        } catch (\Throwable $e) {
            $this->queue->fail($jobId, "assemblage ({$date}) — " . $e->getMessage());
            $this->counters['callErrors']++;

            return true;
        }

        if ($this->queue->complete($jobId, $document, $tokensIn, $tokensOut, $cost, $note)) {
            $this->counters['jobsCompleted']++;
        }

        return true;
    }

    // ------------------------------------------------------------- plumbing

    /**
     * One LLM call with the M5 single-retry policy (stochastic malformations:
     * a clean second attempt almost always suffices; beyond that the failure
     * is structural). $validate parses AND validates, throwing to trigger the
     * retry. Returns [validated, tokensIn, tokensOut, costUsd] (cumulated
     * over both attempts — retries are paid for).
     *
     * @param callable(string): mixed $validate
     * @return array{0: mixed, 1: int, 2: int, 3: float}
     */
    private function callWithRetry(object $provider, string $model, string $prompt, array $config, callable $validate): array
    {
        $tokensIn = 0;
        $tokensOut = 0;
        $cost = 0.0;
        $lastError = null;
        for ($attempt = 1; $attempt <= 2; $attempt++) {
            if ($attempt > 1 && !$this->budgetAllows($config, $prompt, $cost)) {
                break; // no budget left for the retry
            }
            $this->counters['calls']++;
            $res = $provider->complete($model, null, $prompt, $this->maxTokens);
            $tokensIn += (int) ($res['usage']['inputTokens'] ?? 0);
            $tokensOut += (int) ($res['usage']['outputTokens'] ?? 0);
            $cost += $this->actualCost($config, $model, $res);
            try {
                if (($res['stopReason'] ?? '') === 'max_tokens') {
                    throw new \RuntimeException('réponse tronquée (budget de sortie atteint)');
                }

                return [$validate((string) ($res['text'] ?? '')), $tokensIn, $tokensOut, $cost];
            } catch (\Throwable $e) {
                $lastError = $e;
            }
        }

        throw new \RuntimeException($lastError?->getMessage() ?? 'appel LLM en échec', 0, $lastError);
    }

    /** Non-null object required (poles). */
    private function parseObject(string $text): array
    {
        $parsed = PoleAssembler::parse($text);
        if ($parsed === null) {
            throw new \RuntimeException('réponse null, objet pôle attendu');
        }

        return $parsed;
    }

    /**
     * Budget circuit breaker (plan-masse §4): conservative pre-call estimate
     * — input at the engine heuristic, output at the full budget. Provider
     * 'endpoint' costs the platform nothing (the establishment pays its own
     * infrastructure): never blocked.
     */
    private function budgetAllows(array $config, string $prompt, float $alreadySpentInCall = 0.0): bool
    {
        if (($config['provider'] ?? 'humanome') !== 'humanome') {
            return true;
        }
        $inputTokens = (int) ceil(mb_strlen($prompt) / self::CHARS_PER_TOKEN);
        $estimate = Pricing::estimateUsd($this->modelFor($config), $inputTokens, $this->maxTokens);

        return $this->configs->allowsSpending((int) $config['user_id'], $estimate + $alreadySpentInCall);
    }

    /** Actual cost of one answer — priced on the model we REQUESTED (billing basis). */
    private function actualCost(array $config, string $model, array $res): float
    {
        if (($config['provider'] ?? 'humanome') !== 'humanome') {
            return 0.0;
        }

        return Pricing::estimateUsd(
            $model,
            (int) ($res['usage']['inputTokens'] ?? 0),
            (int) ($res['usage']['outputTokens'] ?? 0),
        );
    }

    /**
     * May a NEW LLM call start? At least one call per tick is guaranteed
     * (progress even under a mis-tuned budget), unless Twin9 runs had the
     * slice; beyond that the time and call budgets rule. On refusal the job
     * goes back in line (checkpoint kept) and the tick winds down.
     */
    private function mayStartCall(int $jobId): bool
    {
        if ($this->counters['calls'] === 0 && !$this->twin9Ran) {
            return true;
        }
        if ($this->counters['calls'] >= $this->maxCalls || $this->exhausted()) {
            $this->queue->release($jobId);
            $this->counters['jobsReleased']++;

            return false;
        }

        return true;
    }

    private function exhausted(): bool
    {
        return (microtime(true) - $this->startedAt) >= $this->budgetSeconds
            || $this->counters['calls'] >= $this->maxCalls;
    }

    private function elapsedMs(): int
    {
        return (int) round((microtime(true) - $this->startedAt) * 1000);
    }

    private function modelFor(array $config): string
    {
        $model = (string) ($config['model'] ?? '');

        return $model !== '' ? $model : (Env::get('WORKER_MODEL', 'claude-sonnet-4-5') ?: 'claude-sonnet-4-5');
    }

    /** PromptRunner for the job's FROZEN package + referentiel versions. */
    private function runnerFor(array $job): ?PromptRunner
    {
        $key = implode('|', [
            (string) $job['prompt_package_slug'],
            (string) $job['prompt_package_semver'],
            (string) $job['referentiel_id'],
            (string) $job['referentiel_semver'],
        ]);
        if (\array_key_exists($key, $this->runners)) {
            return $this->runners[$key];
        }

        $package = (new PromptPackageRepository($this->pdo))
            ->findPublished((string) $job['prompt_package_slug'], (string) $job['prompt_package_semver']);
        $referentielRow = (new ReferentielRepository($this->pdo))
            ->findPublished((string) $job['referentiel_id'], (string) $job['referentiel_semver']);
        $referentiel = \is_array($referentielRow['content'] ?? null) ? $referentielRow['content'] : null;
        if (\is_string($referentielRow['content'] ?? null)) {
            $referentiel = json_decode($referentielRow['content'], true);
        }

        $runner = null;
        if (\is_array($package) && \is_array($referentiel)) {
            $candidate = new PromptRunner($package, $referentiel);
            $runner = $candidate->hasExtractionTemplates() ? $candidate : null;
        }

        return $this->runners[$key] = $runner;
    }

    private function providerFor(int $etablissementId, array $config): object
    {
        return $this->providers[$etablissementId] ??= ($this->providerFactory)($config);
    }

    /**
     * Production providers (plan-masse §5): 'humanome' = platform key
     * (ANTHROPIC_API_KEY env, AnthropicProvider with forced tool_use);
     * 'endpoint' = the establishment's OpenAI-compatible URL + optional
     * decrypted key. WORKER_PROVIDER=mock short-circuits for local dev.
     * Upstream timeout stays under the tick margin (plan-masse §2).
     */
    private function defaultProviderFactory(array $config): object
    {
        if (Env::get('WORKER_PROVIDER') === 'mock') {
            return new MockProvider();
        }

        $remaining = max(5, min(45, (int) ($this->budgetSeconds + 8 - (microtime(true) - $this->startedAt))));
        if (($config['provider'] ?? 'humanome') === 'endpoint') {
            $url = (string) ($config['endpoint_url'] ?? '');
            if ($url === '') {
                throw new \RuntimeException('endpoint_url manquant dans la configuration établissement');
            }

            return new OpenAiCompatibleProvider(
                new CurlHttpClient(),
                $url,
                $this->configs->revealApiKey((int) $config['user_id']),
                $remaining,
            );
        }

        $apiKey = Env::get('ANTHROPIC_API_KEY');
        if ($apiKey === '') {
            throw new \RuntimeException('ANTHROPIC_API_KEY non configurée (fournisseur humanome)');
        }

        return new AnthropicProvider(new CurlHttpClient(), $apiKey, $remaining);
    }
}
