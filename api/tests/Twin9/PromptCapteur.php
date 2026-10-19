<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\Twin9\CallSender;
use Twin9\Run\Call;

/**
 * Anthropic, as the real engine's first calls reach it: each prompt kept by
 * its call's id, answered with an empty text.
 */
final class PromptCapteur implements CallSender
{
    /** @var array<string, string> */
    public array $prompts = [];

    /** @var list<array{0: int, 1: Call}> */
    private array $enVol = [];

    public function send(int $run, Call $call, array $reglage, string $cle, float $fin): void
    {
        $this->prompts[$call->id] = $call->prompt;
        $this->enVol[] = [$run, $call];
    }

    public function wait(float $jusqua): array
    {
        $issues = array_map(static fn (array $v): array => ['run' => $v[0], 'appel' => $v[1], 'duree' => 0.0, 'ok' => true,
            'texte' => '', 'tokens_in' => 0, 'tokens_out' => 0, 'stop_reason' => 'end_turn',
            'modele_servi' => $v[1]->model], $this->enVol);
        $this->enVol = [];

        return $issues;
    }

    public function abort(): array
    {
        $coupes = array_map(static fn (array $v): array => ['run' => $v[0], 'appel' => $v[1], 'duree' => 0.0], $this->enVol);
        $this->enVol = [];

        return $coupes;
    }

    public function running(): int
    {
        return \count($this->enVol);
    }
}
