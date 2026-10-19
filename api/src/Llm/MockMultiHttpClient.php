<?php

declare(strict_types=1);

namespace Humanome\Llm;

/**
 * A simulated Anthropic for the Twin9 runs of a local instance
 * (WORKER_PROVIDER=mock, like the mass worker's mock): every request to the
 * Messages API is answered at once, with a fixed text and the usage its
 * prompt would count. Never in production — no key leaves, nothing is
 * analysed: it lets a run go to its end without an API (end-to-end tests,
 * with the fake engine).
 */
final class MockMultiHttpClient implements MultiHttpClient
{
    public const TEXTE = 'Réponse simulée.';

    /** @var array<string, array{status: int, headers: array<string, string>, body: string}> */
    private array $faits = [];

    public function start(string $id, string $method, string $url, array $headers, ?string $body,
                          float $timeoutSeconds): void
    {
        $requete = json_decode((string) $body, true) ?: [];
        $contenu = $requete['messages'][0]['content'] ?? '';
        $prompt = \is_string($contenu) ? $contenu : (string) json_encode($contenu);
        $this->faits[$id] = ['status' => 200, 'headers' => [], 'body' => json_encode([
            'id' => 'msg_simule_' . substr(hash('sha256', $id), 0, 12),
            'type' => 'message',
            'role' => 'assistant',
            'model' => (string) ($requete['model'] ?? 'simule'),
            'stop_reason' => 'end_turn',
            'content' => [['type' => 'text', 'text' => self::TEXTE]],
            'usage' => ['input_tokens' => max(1, intdiv(mb_strlen($prompt), 4)), 'output_tokens' => 4],
        ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE)];
    }

    public function wait(float $deadline): array
    {
        $faits = $this->faits;
        $this->faits = [];

        return $faits;
    }

    public function abort(): array
    {
        $coupes = array_keys($this->faits);
        $this->faits = [];

        return array_map('strval', $coupes);
    }

    public function running(): int
    {
        return \count($this->faits);
    }
}
