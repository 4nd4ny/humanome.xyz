<?php

declare(strict_types=1);

namespace Humanome\Llm;

use Humanome\Db;
use Humanome\Env;
use Humanome\Packages\SettingsRepository;

/**
 * Admin configuration of the public demo (cahier §3.8).
 *
 * Precedence, highest first (see api/config/demo.php for the documentation
 * of every key):
 *
 *   1. base     — settings["demo_overrides"] (JSON), edited live from the
 *                 admin UI (#/admin/reglages, PUT /api/admin/demo-config).
 *                 Immediate effect, no redeploy. FAIL-SAFE: if the database
 *                 is not configured or unreachable, this layer is silently
 *                 skipped and the demo keeps running on env/file values.
 *   2. env      — DEMO_* environment variables (~/app/shared/.env in prod).
 *   3. fichier  — api/config/demo.php.
 *   4. defaut   — coded defaults below, the file's (2026-10-21: 1 USD a day,
 *                 Haiku 5.5 — see the file).
 *
 * `provider` is NEVER overridable from the database: the demo runs on the
 * platform Anthropic key (ANTHROPIC_API_KEY, env only — never stored in the
 * database, never exposed), and 'mock' is a dev-only mode that must not be
 * switchable from a web UI. The API key itself follows the same rule.
 *
 * Since 2026-10-21 (Christian: « On garde Haiku pour les démos »), the model
 * is a Haiku whatever the layers say: the first Haiku of base > env > fichier,
 * else Haiku 5.5; a Sonnet or an Opus met on the way is refused and reported
 * (modelRefuse) — the production .env of July still names Sonnet 5. And a
 * call's output is no longer capped: it is the model's maximum (sortieMax(),
 * ModelLimits), its worst case reserved on the day's budget before the call
 * (routes/llm.php). The former maxTokensPerRequest, DEMO_MAX_TOKENS_PER_REQUEST
 * included, is read nowhere.
 */
final class DemoConfig
{
    /** settings table key holding the admin overrides (JSON object). */
    public const OVERRIDES_KEY = 'demo_overrides';

    /** Fields the admin UI may override in the database (NOT provider). */
    public const OVERRIDABLE_FIELDS = [
        'enabled',
        'model',
        'maxInputChars',
        'perIpPerHour',
        'dailyGlobalTokens',
        'dailyBudgetUsd',
        'powDifficultyBits',
        'upstreamTimeoutSeconds',
    ];

    /**
     * @param array<string, string> $sources per-field origin of the
     *   effective value: 'base' | 'env' | 'fichier' | 'defaut'
     * @param list<array{valeur: string, source: string}> $modelRefuse the
     *   models of the layers that are not a Haiku, refused
     */
    private function __construct(
        public readonly bool $enabled,
        public readonly string $provider,
        public readonly string $model,
        public readonly int $maxInputChars,
        public readonly int $perIpPerHour,
        public readonly int $dailyGlobalTokens,
        public readonly float $dailyBudgetUsd,
        public readonly int $powDifficultyBits,
        public readonly int $upstreamTimeoutSeconds,
        public readonly array $sources = [],
        public readonly array $modelRefuse = [],
    ) {
    }

    /** The output a call may ask for: the model's maximum, never capped (2026-10-21). */
    public function sortieMax(): int
    {
        return ModelLimits::sortieMax($this->model);
    }

    public static function load(): self
    {
        $file = self::configFile();
        /** @var array<string, mixed> $raw */
        $raw = is_file($file) ? (require $file) : [];
        $base = self::databaseOverrides();

        $sources = [];
        $bool = function (string $field, string $env, bool $default) use ($raw, $base, &$sources): bool {
            if (\array_key_exists($field, $base) && \is_bool($base[$field])) {
                $sources[$field] = 'base';

                return $base[$field];
            }

            return self::envBool($env, $raw, $field, $default, $sources);
        };
        $int = function (string $field, string $env, int $default) use ($raw, $base, &$sources): int {
            if (\array_key_exists($field, $base) && \is_int($base[$field])) {
                $sources[$field] = 'base';

                return $base[$field];
            }

            return self::envInt($env, $raw, $field, $default, $sources);
        };
        $float = function (string $field, string $env, float $default) use ($raw, $base, &$sources): float {
            if (\array_key_exists($field, $base) && (\is_float($base[$field]) || \is_int($base[$field]))) {
                $sources[$field] = 'base';

                return (float) $base[$field];
            }

            return self::envFloat($env, $raw, $field, $default, $sources);
        };

        // The model: the first Haiku of the layers, a Sonnet or an Opus refused.
        $modelRefuse = [];
        $model = function () use ($raw, $base, &$sources, &$modelRefuse): string {
            foreach (['base' => $base['model'] ?? null, 'env' => Env::get('DEMO_MODEL'), 'fichier' => $raw['model'] ?? null]
                as $source => $valeur) {
                if (!\is_string($valeur) || trim($valeur) === '') {
                    continue;
                }
                if (!ModelLimits::estHaiku($valeur)) {
                    $modelRefuse[] = ['valeur' => $valeur, 'source' => $source];
                    continue;
                }
                $sources['model'] = $source;

                return $valeur;
            }
            $sources['model'] = 'defaut';

            return ModelLimits::HAIKU_PAR_DEFAUT;
        };

        return new self(
            enabled: $bool('enabled', 'DEMO_ENABLED', true),
            // provider: env > fichier > defaut ONLY (never from the database).
            provider: self::envString('DEMO_PROVIDER', $raw, 'provider', 'anthropic', $sources),
            model: $model(),
            maxInputChars: $int('maxInputChars', 'DEMO_MAX_INPUT_CHARS', 2000000),
            perIpPerHour: $int('perIpPerHour', 'DEMO_PER_IP_PER_HOUR', 20),
            dailyGlobalTokens: $int('dailyGlobalTokens', 'DEMO_DAILY_GLOBAL_TOKENS', 6000000),
            dailyBudgetUsd: $float('dailyBudgetUsd', 'DEMO_DAILY_BUDGET_USD', 1.0),
            powDifficultyBits: $int('powDifficultyBits', 'DEMO_POW_DIFFICULTY_BITS', 20),
            upstreamTimeoutSeconds: $int('upstreamTimeoutSeconds', 'DEMO_UPSTREAM_TIMEOUT', 150),
            sources: $sources,
            modelRefuse: $modelRefuse,
        );
    }

    /**
     * Admin overrides stored in settings["demo_overrides"]. Fail-safe by
     * design: any database problem (not configured, connection refused,
     * missing table mid-migration) silently degrades to env/file values so
     * the demo endpoint never 500s because of this layer.
     *
     * @return array<string, mixed>
     */
    private static function databaseOverrides(): array
    {
        if (!Db::isConfigured()) {
            return [];
        }
        try {
            $stored = (new SettingsRepository(Db::get()))->get(self::OVERRIDES_KEY);
        } catch (\Throwable $e) {
            error_log('[demo-config] overrides unavailable, falling back to env/file: ' . $e->getMessage());

            return [];
        }

        return \is_array($stored) ? $stored : [];
    }

    /** Repo layout: api/src/Llm -> api/config; release layout is identical. */
    private static function configFile(): string
    {
        return \dirname(__DIR__, 2) . '/config/demo.php';
    }

    /** @param array<string, mixed> $raw @param array<string, string> $sources */
    private static function envString(string $env, array $raw, string $field, string $default, array &$sources): string
    {
        $value = Env::get($env);
        if ($value !== '') {
            $sources[$field] = 'env';

            return $value;
        }
        if (\array_key_exists($field, $raw)) {
            $sources[$field] = 'fichier';

            return (string) $raw[$field];
        }
        $sources[$field] = 'defaut';

        return $default;
    }

    /** @param array<string, mixed> $raw @param array<string, string> $sources */
    private static function envInt(string $env, array $raw, string $field, int $default, array &$sources): int
    {
        $value = Env::get($env);
        if ($value !== '' && is_numeric($value)) {
            $sources[$field] = 'env';

            return (int) $value;
        }
        if (\array_key_exists($field, $raw)) {
            $sources[$field] = 'fichier';

            return (int) $raw[$field];
        }
        $sources[$field] = 'defaut';

        return $default;
    }

    /** @param array<string, mixed> $raw @param array<string, string> $sources */
    private static function envFloat(string $env, array $raw, string $field, float $default, array &$sources): float
    {
        $value = Env::get($env);
        if ($value !== '' && is_numeric($value)) {
            $sources[$field] = 'env';

            return (float) $value;
        }
        if (\array_key_exists($field, $raw)) {
            $sources[$field] = 'fichier';

            return (float) $raw[$field];
        }
        $sources[$field] = 'defaut';

        return $default;
    }

    /** @param array<string, mixed> $raw @param array<string, string> $sources */
    private static function envBool(string $env, array $raw, string $field, bool $default, array &$sources): bool
    {
        $value = strtolower(Env::get($env));
        if ($value !== '') {
            $sources[$field] = 'env';

            return !\in_array($value, ['0', 'false', 'off', 'no'], true);
        }
        if (\array_key_exists($field, $raw)) {
            $sources[$field] = 'fichier';

            return (bool) $raw[$field];
        }
        $sources[$field] = 'defaut';

        return $default;
    }
}
