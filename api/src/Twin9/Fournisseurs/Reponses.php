<?php

declare(strict_types=1);

namespace Humanome\Twin9\Fournisseurs;

/**
 * What the callers of the other providers than Anthropic read alike
 * (ChatCompletionsAppelant, GeminiAppelant): a refusal by its HTTP status,
 * a Retry-After, the model served. Every label is written here, with the
 * provider's name from the registry: nothing the provider writes is copied.
 */
final class Reponses
{
    /** A rate refusal without a Retry-After waits this long (xAI and Gemini document none). */
    public const ATTENTE_DEBIT = 10.0;

    /** A model id as a provider says it served it: kept if it is an id, else null. */
    private const MODELE = '/^[A-Za-z0-9][A-Za-z0-9._:\/@-]{0,79}$/';

    /** The model a provider says it served: an id, or null. */
    public static function modele(mixed $modele): ?string
    {
        return \is_string($modele) && preg_match(self::MODELE, $modele) === 1 ? $modele : null;
    }

    /** @param array<string, string> $headers the seconds a Retry-After asks, or null */
    public static function attente(array $headers): ?float
    {
        $retry = $headers['retry-after'] ?? null;

        return \is_string($retry) && is_numeric($retry) ? max(0.0, (float) $retry) : null;
    }

    /**
     * What a status outside 2xx says. 429: a rate refusal, waiting its
     * Retry-After (by default ATTENTE_DEBIT), or a cap when $quota (the
     * provider's code says the credit, the spending limit or the quota is
     * spent); 402: a cap, never retried at once (Gemini, Mistral, OpenRouter:
     * the credit is spent). 400: the provider refuses the call's settings, a
     * configuration error. 503: saturated, with its Retry-After if any.
     * Anything else: a generic error, which the run may try again.
     *
     * @param array<string, string> $headers
     * @return array<string, mixed> an outcome (Appelant)
     */
    public static function refus(string $fournisseur, int $status, array $headers, bool $quota = false): array
    {
        $nom = self::nom($fournisseur);
        if ($status === 402 || ($status === 429 && $quota)) {
            return ['ok' => false, 'debit' => true, 'plafond' => true, 'http' => $status, 'attendre' => null,
                    'erreur' => 'crédit, plafond de dépense ou quota épuisé chez ' . $nom . ' (HTTP ' . $status . ')'];
        }
        if ($status === 429) {
            return ['ok' => false, 'debit' => true, 'plafond' => false, 'http' => 429,
                    'attendre' => self::attente($headers) ?? self::ATTENTE_DEBIT,
                    'erreur' => 'débit du fournisseur ' . $nom . ' (HTTP 429)'];
        }
        if ($status === 503) {
            return ['ok' => false, 'debit' => true, 'plafond' => false, 'http' => 503,
                    'attendre' => self::attente($headers), 'erreur' => $nom . ' saturé (HTTP 503)'];
        }
        if ($status === 400) {
            return ['ok' => false, 'configuration' => true, 'http' => 400,
                    'erreur' => $nom . ' refuse les réglages de l’appel (HTTP 400)'];
        }
        if ($status === 401 || $status === 403) {
            return ['ok' => false, 'http' => $status, 'erreur' => 'clé refusée par ' . $nom . ' (HTTP ' . $status . ')'];
        }

        return ['ok' => false, 'http' => $status, 'erreur' => 'erreur du fournisseur ' . $nom . ' (HTTP ' . $status . ')'];
    }

    /**
     * What an answer says once its text, its usage and its stop are read:
     * an end is an answer; a refusal, a cut (P0-2) or any other stop a
     * failure, its usage kept — it is paid —, never its text.
     *
     * @param array{tokens_in: int, tokens_out: int, stop_reason: string|null, arret: string|null,
     *              modele_servi: string|null} $lu
     * @return array<string, mixed> an outcome (Appelant)
     */
    public static function issue(string $fournisseur, string $texte, array $lu, bool $refus = false): array
    {
        if ($refus || $lu['arret'] === 'refusal') {
            // the stop's raw value, when it says the refusal, is one of Arret's table: an id the code knows
            $pourquoi = $lu['arret'] === 'refusal' && $lu['stop_reason'] !== null ? ' (' . $lu['stop_reason'] . ')' : '';

            return ['ok' => false, 'refus' => true, 'texte' => '', 'erreur' => 'refus du modèle' . $pourquoi] + $lu;
        }
        if (\in_array($lu['arret'], Arret::TRONQUEES, true)) {
            return ['ok' => false, 'tronque' => true, 'texte' => '', 'erreur' => match (true) {
                $lu['arret'] === 'context_window' => 'réponse tronquée : fenêtre de contexte pleine',
                $lu['stop_reason'] === 'CONTINUATION' => 'réponse tronquée : plafond d’une requête atteint (CONTINUATION)',
                default => 'réponse tronquée : budget de sortie atteint',
            }] + $lu;
        }
        if ($lu['arret'] !== 'end') {
            return ['ok' => false, 'panne' => true, 'texte' => '',
                    'erreur' => 'arrêt inattendu de la réponse du fournisseur ' . self::nom($fournisseur)] + $lu;
        }

        return ['ok' => true, 'texte' => $texte] + $lu;
    }

    /** @return array<string, mixed> an answer that does not read */
    public static function illisible(string $fournisseur): array
    {
        return ['ok' => false, 'erreur' => 'réponse illisible du fournisseur ' . self::nom($fournisseur)];
    }

    /** @return array<string, mixed> an error the provider put in a 200 (OpenRouter documents it): a failure */
    public static function erreurDansLaReponse(string $fournisseur): array
    {
        return ['ok' => false, 'panne' => true, 'texte' => '',
                'erreur' => 'échec du fournisseur ' . self::nom($fournisseur) . ' en cours de réponse'];
    }

    private static function nom(string $fournisseur): string
    {
        return Fournisseurs::REGISTRE[$fournisseur]['libelle'] ?? $fournisseur;
    }
}
