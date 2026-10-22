<?php

declare(strict_types=1);

namespace Humanome\Twin9;

/**
 * Anthropic, for Twin9's batch lane (ADR-011 §3, T8): the Message Batches
 * API, and the minimal direct call that checks a run's settings before its
 * first batch, a batch being validated only once it has ended.
 * AnthropicBatches in production, a simulated provider in the tests.
 *
 * Every method answers rather than throws: `ok`, or why not — the HTTP
 * status (`http`, absent when no answer came back), a rate refusal's wait in
 * seconds (`attendre`), a generic message (`erreur`), never the prompt nor
 * the key. A batch is described as Anthropic describes it: id,
 * processing_status (in_progress, canceling, ended), request_counts,
 * created_at, ended_at.
 */
interface BatchApi
{
    /**
     * A minimal direct call with these settings.
     *
     * @param array{fournisseur: string, voie: string, modele: string, budget_sortie: int, effort: string|null,
     *              reflexion: string} $reglage as CallSettings::pour() gives it
     * @param float $fin when it must be done at the latest (microtime)
     * @return array{ok: bool, http?: int, attendre?: float|null, erreur?: string}
     *         http 400: the API refuses these settings, `erreur` says why
     */
    public function verifier(string $cle, array $reglage, float $fin): array;

    /**
     * Submits a batch, its body ({"requests": [...]}) as written.
     *
     * @return array{ok: bool, lot?: array<string, mixed>, http?: int, attendre?: float|null, erreur?: string,
     *               non_envoye?: true}
     *         without `http`, no answer came back: the batch may exist at Anthropic all the same — unless
     *         `non_envoye` says no request left (its bound left no second)
     */
    public function creer(string $cle, string $corps, float $fin): array;

    /** @return array{ok: bool, lot?: array<string, mixed>, http?: int, attendre?: float|null, erreur?: string} */
    public function etat(string $cle, string $id, float $fin): array;

    /**
     * The results of an ended batch: its JSONL, one line per request
     * ({custom_id, result}), in any order.
     *
     * @return array{ok: bool, jsonl?: string, http?: int, attendre?: float|null, erreur?: string}
     */
    public function resultats(string $cle, string $id, float $fin): array;

    /** @return array{ok: bool, lot?: array<string, mixed>, http?: int, attendre?: float|null, erreur?: string} */
    public function annuler(string $cle, string $id, float $fin): array;

    /**
     * Deletes an ended batch, its results with it. A batch already gone is
     * deleted too (ok).
     *
     * @return array{ok: bool, http?: int, attendre?: float|null, erreur?: string}
     */
    public function supprimer(string $cle, string $id, float $fin): array;

    /**
     * The batches of the key's workspace created since $depuis (Unix time),
     * newest first.
     *
     * @return array{ok: bool, lots?: list<array<string, mixed>>, http?: int, attendre?: float|null, erreur?: string}
     */
    public function lister(string $cle, float $depuis, float $fin): array;
}
