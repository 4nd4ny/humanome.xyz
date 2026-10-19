<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\Llm\HttpClientException;
use Humanome\Llm\MultiHttpClient;

/**
 * A fake of Anthropic for Twin9's direct calls: each request is answered by
 * a responder after the delay it says, in real time, never past the
 * request's own timeout. Every request is recorded, its body decoded.
 */
final class FakeMultiHttpClient implements MultiHttpClient
{
    /** @var list<array{id: string, url: string, headers: array<string, string>, body: array<string, mixed>, at: float}> */
    public array $requests = [];

    /** @var array<string, array{fin: float, reponse: array<string, mixed>|HttpClientException}> */
    private array $running = [];

    /**
     * @param \Closure(array{id: string, url: string, headers: array<string, string>, body: array<string, mixed>}): array{status?: int, headers?: array<string, string>, body?: string|array<string, mixed>, delai?: float, reseau?: bool} $repondeur
     */
    public function __construct(private readonly \Closure $repondeur)
    {
    }

    /** A response of the Messages API, answered. @return array<string, mixed> */
    public static function message(string $texte, string $modele = 'claude-haiku-5-5', string $stop = 'end_turn'): array
    {
        return ['type' => 'message', 'model' => $modele, 'stop_reason' => $stop,
                'content' => [['type' => 'text', 'text' => $texte]],
                'usage' => ['input_tokens' => 100, 'output_tokens' => 20]];
    }

    public function start(string $id, string $method, string $url, array $headers, ?string $body,
                          float $timeoutSeconds): void
    {
        $requete = ['id' => $id, 'url' => $url, 'headers' => $headers,
                    'body' => json_decode((string) $body, true, 64, JSON_THROW_ON_ERROR)];
        $this->requests[] = $requete + ['at' => microtime(true)];
        $r = ($this->repondeur)($requete);
        $delai = (float) ($r['delai'] ?? 0.0);
        if ($delai > $timeoutSeconds) {
            $this->running[$id] = ['fin' => microtime(true) + $timeoutSeconds,
                                   'reponse' => new HttpClientException('network error (curl 28)', timedOut: true)];

            return;
        }
        $corps = $r['body'] ?? '';
        $this->running[$id] = ['fin' => microtime(true) + $delai, 'reponse' => !empty($r['reseau'])
            ? new HttpClientException('network error (curl 7)')
            : ['status' => $r['status'] ?? 200, 'headers' => $r['headers'] ?? [],
               'body' => \is_array($corps) ? json_encode($corps, JSON_THROW_ON_ERROR) : $corps]];
    }

    public function wait(float $deadline): array
    {
        while ($this->running !== []) {
            $now = microtime(true);
            $done = [];
            foreach ($this->running as $id => $r) {
                if ($r['fin'] <= $now) {
                    $done[$id] = $r['reponse'];
                    unset($this->running[$id]);
                }
            }
            if ($done !== [] || $now >= $deadline) {
                return $done;
            }
            $prochain = min(array_column($this->running, 'fin'));
            usleep(max(1000, (int) ((min($prochain, $deadline) - $now) * 1_000_000)));
        }

        return [];
    }

    public function abort(): array
    {
        $ids = array_map('strval', array_keys($this->running));
        $this->running = [];

        return $ids;
    }

    public function running(): int
    {
        return \count($this->running);
    }

    /** The call a request is for, which the fake engine's prompts carry. */
    public static function appel(array $requete): string
    {
        preg_match('/\[appel:([^\]]+)\]/', (string) $requete['body']['messages'][0]['content'], $m);

        return $m[1] ?? '';
    }
}
