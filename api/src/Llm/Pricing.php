<?php

declare(strict_types=1);

namespace Humanome\Llm;

/**
 * USD cost of a call, for the daily budgets (the demo's, the tutor's) and the
 * mass worker's spending (api/config/demo.php: dailyBudgetUsd; Worker\Tick).
 *
 * The price grid comes first (2026-10-21): the one the credits are billed with
 * (Twin9Config 'modeles', list prices without margin), which follows
 * Anthropic's pricing page day by day (Twin9\TarifsAnthropic). A model the grid
 * does not offer falls back to the table below — longest model-id prefix wins,
 * an unknown model gets the most expensive known rate, so a budget errs on the
 * safe side.
 *
 * Mirrors engine/src/providers/estimate.js (MODEL_PRICING_USD_PER_MTOK).
 */
final class Pricing
{
    /**
     * @var array<string, array{0: float, 1: float}> [input, output] USD/MTok,
     * Anthropic's list prices read on 2026-10-21. Sonnet 5 and 5.5 cost 2 / 10
     * (the rise to 3 / 15 announced for 2026-09-01 did not happen); the Sonnet
     * and Opus of the 4 line keep 3 / 15 and 5 / 25.
     */
    private const USD_PER_MTOK = [
        'claude-haiku-4-5' => [1.0, 5.0],
        'claude-haiku-5-5' => [0.1, 0.5],
        'claude-sonnet' => [3.0, 15.0],
        'claude-sonnet-5' => [2.0, 10.0],
        'claude-opus' => [5.0, 25.0],
        'claude-opus-5-5' => [4.0, 20.0],
        'claude-fable' => [10.0, 50.0],
        'claude-mythos' => [10.0, 50.0],
        'mock' => [0.0, 0.0],
    ];

    /**
     * @var array<string, array{0: int, 1: float, 2: float}> [threshold, input, output]:
     * past `threshold` prompt tokens, the whole call is billed at the tier's
     * rates. Haiku 5.5 is the only model priced by prompt length (Anthropic's
     * pricing page, read on 2026-10-21; Twin9Config's palier_long). A demo call
     * reaches it: the Twin6 trial's synthesis carries the seven scans' outputs,
     * and a dense script (CJK, emoji) crosses it in far fewer characters.
     */
    private const LONG_PROMPT_TIER = [
        'claude-haiku-5-5' => [100_000, 0.5, 2.5],
    ];

    /** The most expensive known rate (Fable, Mythos): an unknown model errs on the safe side. */
    private const DEFAULT_USD_PER_MTOK = [10.0, 50.0];

    /**
     * @param array<string, mixed> $grille the price grid (Twin9Config::modeles()):
     *   model id => {prix_usd_mtok: [in, out], palier_long?: {au_dela_de, prix_usd_mtok}};
     *   empty: the table alone
     */
    public static function estimateUsd(string $model, int $inputTokens, int $outputTokens, array $grille = []): float
    {
        $tarif = self::tarifDeLaGrille($grille, $model);
        if ($tarif !== null) {
            [$in, $out] = $tarif['prix_usd_mtok'];
            $palier = $tarif['palier_long'] ?? null;
            if (\is_array($palier) && $inputTokens > (int) $palier['au_dela_de']) {
                [$in, $out] = $palier['prix_usd_mtok'];
            }

            return ($inputTokens * (float) $in + $outputTokens * (float) $out) / 1_000_000;
        }

        [$in, $out] = self::rates($model);
        $tier = self::longest(self::LONG_PROMPT_TIER, $model);
        if ($tier !== null && $inputTokens > $tier[0]) {
            [, $in, $out] = $tier;
        }

        return ($inputTokens * $in + $outputTokens * $out) / 1_000_000;
    }

    /**
     * The grid's entry for $model: its own id, or the same id without its date
     * (claude-haiku-4-5-20251001 and claude-haiku-4-5 are one model). Null:
     * not offered, or not readable as a price.
     *
     * @param array<string, mixed> $grille
     * @return array{prix_usd_mtok: array{0: float|int, 1: float|int}, palier_long?: mixed}|null
     */
    private static function tarifDeLaGrille(array $grille, string $model): ?array
    {
        $tarif = $grille[$model] ?? null;
        if ($tarif === null) {
            $sansDate = self::sansDate($model);
            foreach ($grille as $id => $entree) {
                if (self::sansDate((string) $id) === $sansDate) {
                    $tarif = $entree;
                    break;
                }
            }
        }
        $prix = \is_array($tarif) ? ($tarif['prix_usd_mtok'] ?? null) : null;

        return \is_array($prix) && \count($prix) === 2 ? $tarif : null;
    }

    /** A model id without its snapshot date: claude-haiku-4-5-20251001 -> claude-haiku-4-5. */
    public static function sansDate(string $model): string
    {
        return (string) preg_replace('/-\d{8}$/', '', $model);
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
