<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Twin9\Run\Call;

/**
 * Where the slice sends a run's calls (Worker\Twin9Slice): to Anthropic,
 * concurrently (DirectCalls); in the parity tests, to a replay of the oracle.
 *
 * Calls go by run: two runs may ask calls of the same id. An outcome is what
 * AnthropicCaller::lire() says of a response (ok, refus, debit and attendre,
 * erreur…), with the run, the call and its duration in seconds.
 */
interface CallSender
{
    /**
     * Sends a call; its outcome comes back from wait().
     *
     * @param array{modele: string, budget_sortie: int, effort: string|null, reflexion: string} $reglage
     * @param float $fin when the call must be done at the latest (microtime)
     */
    public function send(int $run, Call $call, array $reglage, string $cle, float $fin): void;

    /**
     * Waits until at least one call is done, or until $jusqua (microtime).
     *
     * @return list<array<string, mixed>> the outcomes, each with 'run', 'appel' (the Call) and 'duree' (seconds)
     */
    public function wait(float $jusqua): array;

    /** @return list<array{run: int, appel: Call, duree: float}> the calls still running, cut */
    public function abort(): array;

    public function running(): int;
}
