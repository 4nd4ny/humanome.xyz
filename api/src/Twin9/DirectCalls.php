<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Llm\HttpClientException;
use Humanome\Llm\MultiHttpClient;
use Twin9\Run\Call;

/**
 * Twin9's direct calls to Anthropic (ADR-011 §3): concurrent requests to the
 * locked address, each bounded by the slice, read by AnthropicCaller::lire().
 * The v9.8's own timeout (600 s) applies when the slice is longer.
 */
final class DirectCalls implements CallSender
{
    /** The v9.8's timeout of a call (aurora/backends.py, DEFAULT_TIMEOUT). */
    public const DELAI_V98 = 600.0;

    /** @var array<string, array{0: int, 1: Call, 2: float}> the calls running, by request: run, call, start */
    private array $calls = [];

    public function __construct(private readonly MultiHttpClient $http)
    {
    }

    public function send(int $run, Call $call, array $reglage, string $cle, float $fin): void
    {
        $requete = AnthropicCaller::requete($cle, $reglage['modele'], $call->prompt, $reglage['budget_sortie'],
            $reglage['reflexion'], $reglage['effort']);
        $id = $run . ':' . $call->id;
        $this->http->start($id, 'POST', AnthropicCaller::BASE_URL . '/v1/messages', $requete['headers'],
            $requete['body'], max(0.1, min(self::DELAI_V98, $fin - microtime(true))));
        $this->calls[$id] = [$run, $call, microtime(true)];
    }

    public function wait(float $jusqua): array
    {
        $issues = [];
        foreach ($this->http->wait($jusqua) as $id => $reponse) {
            [$run, $call, $debut] = $this->calls[$id];
            unset($this->calls[$id]);
            $issue = $reponse instanceof HttpClientException
                ? ['ok' => false, 'erreur' => $reponse->timedOut ? 'délai dépassé' : 'fournisseur injoignable']
                : AnthropicCaller::lire($reponse['status'], $reponse['headers'], $reponse['body']);
            $issues[] = ['run' => $run, 'appel' => $call, 'duree' => microtime(true) - $debut] + $issue;
        }

        return $issues;
    }

    public function abort(): array
    {
        $coupes = [];
        foreach ($this->http->abort() as $id) {
            [$run, $call, $debut] = $this->calls[$id];
            $coupes[] = ['run' => $run, 'appel' => $call, 'duree' => microtime(true) - $debut];
        }
        $this->calls = [];

        return $coupes;
    }

    public function running(): int
    {
        return \count($this->calls);
    }
}
