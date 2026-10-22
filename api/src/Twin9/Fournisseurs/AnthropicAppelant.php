<?php

declare(strict_types=1);

namespace Humanome\Twin9\Fournisseurs;

use Humanome\Twin9\AnthropicCaller;

/**
 * Twin9's direct calls to Anthropic, through AnthropicCaller unchanged: the
 * same request — model, output budget, effort when set, thinking cut in the
 * form the model accepts —, at its locked address, read the same way.
 *
 * It adds a `traceparent` header whose sampled flag is off (W3C, flags 00):
 * an administrator of the key's organization may send its OpenTelemetry
 * traces, « full content » included, to a destination of theirs; for a
 * request whose trace is not sampled, the API emits no span (Anthropic's
 * OpenTelemetry documentation, 2026-10-22). The trace and span ids are
 * random, never zero, and say nothing of the call.
 *
 * The outcome gains the stop's class (Arret), the stop reason sanitized, the
 * model served kept only as an id, a failure's text emptied, and `plafond`
 * on a rate refusal: a 429 without Retry-After is a spending cap, as the
 * slice has always read it.
 */
final class AnthropicAppelant implements Appelant
{
    public function fournisseur(): string
    {
        return 'anthropic';
    }

    public function requete(string $cle, array $reglage, string $prompt): array
    {
        $requete = AnthropicCaller::requete($cle, $reglage['modele'], $prompt, $reglage['budget_sortie'],
            $reglage['reflexion'] ?? 'coupee', $reglage['effort'] ?? null);

        return [
            'url' => Fournisseurs::REGISTRE['anthropic']['url'],
            'headers' => $requete['headers'] + ['traceparent' => self::traceparent()],
            'body' => $requete['body'],
        ];
    }

    public function lire(int $status, array $headers, string $body): array
    {
        $lu = AnthropicCaller::lire($status, $headers, $body);
        if (!$lu['ok'] && \array_key_exists('texte', $lu)) {
            $lu['texte'] = ''; // a refusal's text is never an answer, nor kept
        }
        if (\array_key_exists('stop_reason', $lu)) {
            $lu['arret'] = Arret::classe('anthropic', $lu['stop_reason']);
            $lu['stop_reason'] = Arret::assainir($lu['stop_reason']);
        }
        if (\array_key_exists('modele_servi', $lu)) {
            $lu['modele_servi'] = Reponses::modele($lu['modele_servi']);
        }
        if (!empty($lu['debit'])) {
            $lu['plafond'] = ($lu['http'] ?? null) === 429 && ($lu['attendre'] ?? null) === null;
        }

        return $lu;
    }

    /** A W3C trace context whose trace is not sampled: version 00, random ids never zero, flags 00. */
    public static function traceparent(): string
    {
        do {
            $trace = random_bytes(16);
        } while ($trace === str_repeat("\0", 16));
        do {
            $span = random_bytes(8);
        } while ($span === str_repeat("\0", 8));

        return '00-' . bin2hex($trace) . '-' . bin2hex($span) . '-00';
    }
}
