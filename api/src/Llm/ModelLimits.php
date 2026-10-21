<?php

declare(strict_types=1);

namespace Humanome\Llm;

/**
 * What an Anthropic model allows the site to ask of it (2026-10-21).
 *
 * - The output of one call (max_tokens): the model's maximum, never less.
 *   Christian, 2026-10-21: « Ok pour lever le plafond des tokens de sortie
 *   (...) si le prompt est déjà passé et les tokens déjà dépensés, ne pas
 *   limiter sur la longueur de la sortie ». A cut answer is paid and lost;
 *   what bounds the spending is a reservation made before the call (the
 *   demo's dollar, the credits), never a ceiling on the answer. Synchronous
 *   Messages API, read on the models' pages on 2026-10-21: 128,000 tokens for
 *   the models with a 1M-token window (Fable and Mythos 5.x, Opus 5.x and 4.6
 *   to 4.8, Sonnet 5.x and 4.6, Haiku 5.5); 64,000 for Haiku 4.5, Sonnet 4.5
 *   and Opus 4.5. A Claude model this table does not know gets 64,000, which
 *   every model of the current lines accepts.
 * - Haiku alone for what the site gives (the demo's proxy, the tutor):
 *   « On garde Haiku pour les démos. Sonnet et Opus disponibles uniquement
 *   pour les comptes ayant acheté suffisamment de crédits API ou bien
 *   utilisant leur propre clé. »
 *
 * Mirrors engine/src/providers/limits.js.
 */
final class ModelLimits
{
    /** The output of a Claude model the table does not know. */
    public const SORTIE_PAR_DEFAUT = 64_000;

    /** @var array<string, int> model-id prefix => max output tokens (the longest prefix wins) */
    private const SORTIE_MAX = [
        'claude-fable-5' => 128_000,
        'claude-mythos-5' => 128_000,
        'claude-opus-5' => 128_000,
        'claude-opus-4-8' => 128_000,
        'claude-opus-4-7' => 128_000,
        'claude-opus-4-6' => 128_000,
        'claude-opus-4-5' => 64_000,
        'claude-sonnet-5' => 128_000,
        'claude-sonnet-4-6' => 128_000,
        'claude-sonnet-4-5' => 64_000,
        'claude-haiku-5' => 128_000,
        'claude-haiku-4-5' => 64_000,
    ];

    /** The default model of what the site gives: the demo, and its fallback. */
    public const HAIKU_PAR_DEFAUT = 'claude-haiku-5-5';

    /** The most output tokens one call to $model may ask for. */
    public static function sortieMax(string $model): int
    {
        $best = null;
        $bestLen = -1;
        foreach (self::SORTIE_MAX as $prefix => $max) {
            if (str_starts_with($model, $prefix) && \strlen($prefix) > $bestLen) {
                $best = $max;
                $bestLen = \strlen($prefix);
            }
        }

        return $best ?? self::SORTIE_PAR_DEFAUT;
    }

    /** A Haiku: the only models the site pays for what it gives. */
    public static function estHaiku(string $model): bool
    {
        return str_starts_with($model, 'claude-haiku-');
    }
}
