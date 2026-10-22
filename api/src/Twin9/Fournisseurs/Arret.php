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
 * The tables are keyed by provider id — the Chat Completions providers do
 * not share their values — and mirror schemas/fixtures/arrets/
 * arrets-fournisseurs.json exactly, as the engine's (engine/src/providers/
 * stop.js) does: only the raw values checked on the providers' official
 * documentation (2026-10-22). A value they do not know, or a provider they
 * do not know, is `other`; Gemini's CONTINUATION (a non-streamed answer cut
 * at the request's cap) and Mistral's model_length are cuts like the others.
 */
final class Arret
{
    /** The classes of a stop that cut the output: a failure (P0-2). */
    public const TRONQUEES = ['max_tokens', 'context_window'];

    /** A raw value kept as it is: a short identifier. */
    private const MOTIF = '/^[A-Za-z_]{1,32}$/';

    /** @var array<string, array<string, string>> by provider: raw value => class */
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
        'openai' => [
            'stop' => 'end',
            'length' => 'max_tokens',
            'content_filter' => 'refusal',
            'tool_calls' => 'other',
            'function_call' => 'other',
        ],
        'xai' => [
            'stop' => 'end',
            'end_turn' => 'end',
            'length' => 'max_tokens',
        ],
        'openrouter' => [
            'stop' => 'end',
            'length' => 'max_tokens',
            'content_filter' => 'refusal',
            'tool_calls' => 'other',
            'error' => 'other',
        ],
        'mistral' => [
            'stop' => 'end',
            'length' => 'max_tokens',
            'model_length' => 'context_window',
            'tool_calls' => 'other',
            'error' => 'other',
        ],
        'google' => [
            'STOP' => 'end',
            'MAX_TOKENS' => 'max_tokens',
            'CONTINUATION' => 'max_tokens',
            'SAFETY' => 'refusal',
            'RECITATION' => 'refusal',
            'BLOCKLIST' => 'refusal',
            'PROHIBITED_CONTENT' => 'refusal',
            'SPII' => 'refusal',
            'IMAGE_SAFETY' => 'refusal',
            'IMAGE_PROHIBITED_CONTENT' => 'refusal',
            'IMAGE_RECITATION' => 'refusal',
            'FINISH_REASON_UNSPECIFIED' => 'other',
            'LANGUAGE' => 'other',
            'OTHER' => 'other',
            'MALFORMED_FUNCTION_CALL' => 'other',
            'IMAGE_OTHER' => 'other',
            'NO_IMAGE' => 'other',
            'UNEXPECTED_TOOL_CALL' => 'other',
            'TOO_MANY_TOOL_CALLS' => 'other',
            'MISSING_THOUGHT_SIGNATURE' => 'other',
            'MALFORMED_RESPONSE' => 'other',
            'ESCALATION' => 'other',
            'PUP_LIMITED_DISABLED' => 'other',
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
     * The class of a raw value of a provider (its id, the shared table's
     * « format »): `other` for a value its table does not know, null for an
     * absent one. A class classes as itself.
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

    /** Whether a raw value of a provider says the output was cut. */
    public static function tronquee(string $format, ?string $brut): bool
    {
        return \in_array(self::classe($format, $brut), self::TRONQUEES, true);
    }
}
