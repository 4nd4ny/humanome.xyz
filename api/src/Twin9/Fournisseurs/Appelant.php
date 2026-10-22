<?php

declare(strict_types=1);

namespace Humanome\Twin9\Fournisseurs;

/**
 * How Twin9 calls one provider directly (P1-5, ADR-012 §4): the request of
 * a call, at the provider's LOCKED address (Fournisseurs::REGISTRE, never a
 * parameter), the key in a header only; and what a response says, in one
 * vocabulary for every provider.
 *
 * Nothing the provider writes leaves through an outcome: its error messages,
 * its refusal texts, its stop details are never copied — `erreur` is a label
 * the code writes, `stop_reason` a short identifier (Arret::assainir()),
 * `modele_servi` an id or null. A provider's error code may be READ to class
 * a refusal, never copied.
 *
 * The outcome (lire()):
 *   ok            the answer is there: `texte` is its text
 *   texte         the answer's text (empty unless ok)
 *   tokens_in, tokens_out   the usage billed: output tokens count the
 *                 reasoning wherever the provider bills it as output
 *   stop_reason   the raw stop value, sanitized; null when absent
 *   arret         its class (Arret::classe())
 *   modele_servi  the model the provider says it served, an id; or null
 *   refus         refused by the model or the provider: a failure, never retried
 *   tronque       the output cut (P0-2): a failure, never retried, its usage paid
 *   panne         any other final failure of an answered call (a stop the
 *                 code does not take for an end, an error inside a 200)
 *   debit         a rate refusal: `attendre` seconds before the next try, or
 *                 `plafond` — a spending cap or a quota, never retried at once
 *   configuration the provider refused the request's settings (HTTP 400)
 *   http          the HTTP status of a refusal
 *   erreur        the label of a failure, in French, written by the code
 */
interface Appelant
{
    /** The provider it calls, an id of Fournisseurs::REGISTRE. */
    public function fournisseur(): string;

    /**
     * The request of one call.
     *
     * @param array{modele: string, budget_sortie: int, effort?: string|null, reflexion?: string,
     *              reflexion_param?: string|null} $reglage the call's settings (CallSettings::pour()), with the
     *              reasoning setting of its model's grid entry for another provider than Anthropic
     * @return array{url: string, headers: array<string, string>, body: string}
     */
    public function requete(string $cle, array $reglage, string $prompt): array;

    /**
     * What a response says.
     *
     * @param array<string, string> $headers lower-case names
     * @return array<string, mixed> the outcome (class doc)
     */
    public function lire(int $status, array $headers, string $body): array;
}
