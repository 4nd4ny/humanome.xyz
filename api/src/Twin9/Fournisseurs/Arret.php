<?php

declare(strict_types=1);

namespace Humanome\Twin9\Fournisseurs;

/**
 * Why a call's output stopped (P0-2): the raw value a provider gives, as the
 * journal keeps it (twin9_appels.stop_reason), and its class, one vocabulary
 * for every provider — `end`, `max_tokens` (the output budget reached),
 * `context_window` (the model's context full), `refusal`, `other`, or null
 * when the stop is absent.
 *
 * The raw value is the provider's text: before it is stored, anything but a
 * short identifier becomes `other` (assainir()), so that nothing the
 * provider writes leaves through the journal or the export, and a value cut
 * to the column's 32 characters is never classed as another.
 *
 * Only Anthropic's table is known here (its seven values, Messages API);
 * the other formats come with their callers.
 */
final class Arret
{
    /** The classes of a stop that cut the output: a failure (P0-2). */
    public const TRONQUEES = ['max_tokens', 'context_window'];

    /** A raw value kept as it is: a short identifier. */
    private const MOTIF = '/^[A-Za-z_]{1,32}$/';

    /** @var array<string, array<string, string>> by format: raw value => class */
    private const TABLES = [
        'anthropic' => [
            'end_turn' => 'end',
            'stop_sequence' => 'end',
            'tool_use' => 'end',
            'max_tokens' => 'max_tokens',
            'model_context_window_exceeded' => 'context_window',
            'refusal' => 'refusal',
            'pause_turn' => 'other',
        ],
    ];

    /** The classes, which class as themselves. */
    private const CLASSES = ['end', 'max_tokens', 'context_window', 'refusal', 'other'];

    /**
     * The raw value as it may be stored: a short identifier as it is, any
     * other text `other`; null when the stop is absent (null or empty).
     */
    public static function assainir(?string $brut): ?string
    {
        if ($brut === null || $brut === '') {
            return null;
        }

        return preg_match(self::MOTIF, $brut) === 1 ? $brut : 'other';
    }

    /**
     * The class of a raw value in a format: `other` for a value the table
     * does not know, null for an absent one. A class classes as itself.
     */
    public static function classe(string $format, ?string $brut): ?string
    {
        $brut = self::assainir($brut);
        if ($brut === null) {
            return null;
        }
        $classe = self::TABLES[$format][$brut] ?? null;
        if ($classe !== null) {
            return $classe;
        }

        return \in_array($brut, self::CLASSES, true) ? $brut : 'other';
    }

    /** Whether a raw value in a format says the output was cut. */
    public static function tronquee(string $format, ?string $brut): bool
    {
        return \in_array(self::classe($format, $brut), self::TRONQUEES, true);
    }
}
