<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\Twin9\CallSender;
use Twin9\Run\Call;

/**
 * Anthropic replaced by the oracle of the v9.8 (Twin_v9's oracle/): each call
 * the tick sends must be one the oracle recorded, with its step, model and
 * prompt; it is answered with the oracle's response. The answers come back in
 * a shuffled order, a share of the calls in flight at a time, as real ones
 * would. A call sent twice, or one the oracle does not know, stops the test;
 * a killer may make the tick die as a call is about to leave.
 */
final class ReplaySender implements CallSender
{
    /** @var array<string, int> the calls sent, by run and id */
    public array $envois = [];

    /** @var list<array{0: int, 1: Call, 2: float}> */
    private array $enVol = [];

    private readonly \Random\Randomizer $hasard;

    /**
     * @param array<string, array{step: string, model: string, sha256: string, response?: string, failure?: string}> $record
     * @param float $part the share of the calls in flight answered at each wait, one at least
     * @param (\Closure(string): bool)|null $tueur whether the tick dies as this call is about to leave
     * @param bool $strict false: a call the oracle knows under another prompt (a run the oracle did not make) is
     *                     answered with the oracle's response all the same, one it does not know with an empty text
     */
    public function __construct(private readonly array $record, int $graine = 1, private readonly float $part = 1.0,
                                private readonly ?\Closure $tueur = null, private readonly bool $strict = true)
    {
        $this->hasard = new \Random\Randomizer(new \Random\Engine\Mt19937($graine));
    }

    public function send(int $run, Call $call, array $reglage, string $cle, float $fin): void
    {
        if ($this->tueur !== null && ($this->tueur)($call->id)) {
            $this->enVol = [];
            throw new \RuntimeException('tick tué');
        }
        $o = $this->record[$call->id] ?? null;
        if ($this->strict) {
            if ($o === null) {
                throw new \LogicException("Appel inconnu de l'oracle : {$call->id}");
            }
            foreach (['step' => $call->step, 'model' => $call->model, 'sha256' => $call->sha256] as $k => $v) {
                if ($o[$k] !== $v) {
                    throw new \LogicException("Appel {$call->id} : $k $v, l'oracle attend {$o[$k]}");
                }
            }
        }
        $cleEnvoi = $run . ':' . $call->id;
        if (isset($this->envois[$cleEnvoi])) {
            throw new \LogicException("Appel envoyé deux fois : {$call->id}");
        }
        $this->envois[$cleEnvoi] = 1;
        $this->enVol[] = [$run, $call, microtime(true)];
    }

    public function wait(float $jusqua): array
    {
        if ($this->enVol === []) {
            return [];
        }
        $vol = $this->hasard->shuffleArray($this->enVol);
        $n = max(1, (int) round(\count($vol) * $this->part));
        $this->enVol = \array_slice($vol, $n);
        $issues = [];
        foreach (\array_slice($vol, 0, $n) as [$run, $call, $debut]) {
            $o = $this->record[$call->id] ?? ['response' => '', 'model' => $call->model];
            $issues[] = ['run' => $run, 'appel' => $call, 'duree' => microtime(true) - $debut] + (isset($o['failure'])
                ? ['ok' => false, 'refus' => true, 'erreur' => $o['failure']]
                : ['ok' => true, 'texte' => $o['response'], 'tokens_in' => 0, 'tokens_out' => 0,
                   'stop_reason' => 'end_turn', 'modele_servi' => $o['model']]);
        }

        return $issues;
    }

    /**
     * The slice's end cuts the calls still in flight: they leave again in the
     * next slice. A replayed call has not been running (its answer is there
     * at once): no attempt is counted.
     */
    public function abort(): array
    {
        $coupes = array_map(static fn (array $v): array => ['run' => $v[0], 'appel' => $v[1], 'duree' => 0.0],
            $this->enVol);
        foreach ($coupes as $c) {
            unset($this->envois[$c['run'] . ':' . $c['appel']->id]); // cut before its answer: it leaves again
        }
        $this->enVol = [];

        return $coupes;
    }

    public function running(): int
    {
        return \count($this->enVol);
    }
}
