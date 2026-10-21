<?php

declare(strict_types=1);

namespace Humanome\Llm;

/**
 * Rough USD cost estimation for the daily budget circuit breaker
 * (api/config/demo.php: dailyBudgetUsd). Prices in USD per million tokens,
 * longest model-id prefix wins; unknown models fall back to a conservative
 * (expensive) default so the breaker errs on the safe side.
 *
 * Mirrors engine/src/providers/estimate.js (MODEL_PRICING_USD_PER_MTOK).
 */
final class Pricing
{
    /**
     * @var array<string, array{0: float, 1: float}> [input, output] USD/MTok.
     * Haiku 5.5 is the demo's model since 2026-10-21 (Twin9Config's grid, T10).
     */
    private const USD_PER_MTOK = [
        'claude-haiku-4-5' => [1.0, 5.0],
        'claude-haiku-5-5' => [0.1, 0.5],
        'claude-sonnet' => [3.0, 15.0],
        'claude-opus' => [5.0, 25.0],
        'mock' => [0.0, 0.0],
    ];

    /**
     * @var array<string, array{0: int, 1: float, 2: float}> [threshold, input, output]:
     * past `threshold` prompt tokens, the whole call is billed at the tier's
     * rates. Haiku 5.5 is the only model priced by prompt length (Anthropic's
     * pricing page, read on 2026-10-21; Twin9Config's palier_long). A demo call
     * reaches it: the Twin6 trial's synthesis can carry 100 000 tokens of French
     * (420 000 characters at most), and a dense script (CJK, emoji) crosses it
     * in far fewer characters.
     */
    private const LONG_PROMPT_TIER = [
        'claude-haiku-5-5' => [100_000, 0.5, 2.5],
    ];

    private const DEFAULT_USD_PER_MTOK = [5.0, 25.0];

    public static function estimateUsd(string $model, int $inputTokens, int $outputTokens): float
    {
        [$in, $out] = self::rates($model);
        $tier = self::longest(self::LONG_PROMPT_TIER, $model);
        if ($tier !== null && $inputTokens > $tier[0]) {
            [, $in, $out] = $tier;
        }

        return ($inputTokens * $in + $outputTokens * $out) / 1_000_000;
    }

    /** @return array{0: float, 1: float} */
    private static function rates(string $model): array
    {
        return self::longest(self::USD_PER_MTOK, $model) ?? self::DEFAULT_USD_PER_MTOK;
    }

    /**
     * The entry of the longest model-id prefix of $model, or null.
     *
     * @template T
     * @param array<string, T> $table
     * @return T|null
     */
    private static function longest(array $table, string $model): mixed
    {
        $best = null;
        $bestLen = -1;
        foreach ($table as $prefix => $entry) {
            if (str_starts_with($model, $prefix) && \strlen($prefix) > $bestLen) {
                $best = $entry;
                $bestLen = \strlen($prefix);
            }
        }

        return $best;
    }
}
