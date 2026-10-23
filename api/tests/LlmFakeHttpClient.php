<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Llm\HttpClient;
use Humanome\Llm\HttpClientException;
use Humanome\Llm\HttpStream;
use Humanome\Llm\StreamingHttpClient;

/**
 * Fake HttpClient for the LLM/gdoc tests: records every request, replays
 * queued responses. No network access ever happens in the test suite.
 *
 * Streamed calls (open(), 2026-10-21) replay the same queue: a queued
 * exception becomes a stream that fails before any answer (status 0); a
 * queued response is delivered one server-sent event per read() — a whole
 * JSON body at once —; queueStream() gives the chunks, and how the stream
 * ends, explicitly, and what happens while it is in progress ($pendant, run
 * before its second chunk).
 */
final class LlmFakeHttpClient implements HttpClient, StreamingHttpClient
{
    /** @var list<array{method: string, url: string, headers: array<string, string>, body: ?string, timeout: int, maxBytes: int}> */
    public array $requests = [];

    /** @var list<array<string, mixed>|HttpClientException> */
    private array $queue = [];

    /** @param array{status?: int, headers?: array<string, string>, body?: string, overflow?: bool} $response */
    public function queueResponse(array $response): void
    {
        $this->queue[] = [
            'status' => $response['status'] ?? 200,
            'headers' => $response['headers'] ?? [],
            'body' => $response['body'] ?? '',
            'overflow' => $response['overflow'] ?? false,
        ];
    }

    public function queueException(HttpClientException $exception): void
    {
        $this->queue[] = $exception;
    }

    /**
     * A streamed answer: its chunks, one per read(), then its end — clean,
     * or the network failure given (a timeout mid-stream).
     *
     * @param list<string> $chunks
     */
    public function queueStream(array $chunks, int $status = 200, ?HttpClientException $fin = null,
                                ?\Closure $pendant = null): void
    {
        $this->queue[] = ['stream' => $chunks, 'status' => $status, 'fin' => $fin, 'pendant' => $pendant];
    }

    public function open(string $method, string $url, array $headers, ?string $body, int $timeoutSeconds): HttpStream
    {
        $this->requests[] = [
            'method' => $method,
            'url' => $url,
            'headers' => $headers,
            'body' => $body,
            'timeout' => $timeoutSeconds,
            'maxBytes' => 0,
        ];

        $next = array_shift($this->queue);
        if ($next === null) {
            throw new \LogicException('LlmFakeHttpClient: no queued response for ' . $method . ' ' . $url);
        }
        if ($next instanceof HttpClientException) {
            return new FakeHttpStream(0, [], [], $next);
        }
        // The content-type Anthropic gives: an event stream, or a whole JSON body.
        $flux = ['content-type' => 'text/event-stream; charset=utf-8'];
        if (isset($next['stream'])) {
            return new FakeHttpStream($next['status'], $flux, $next['stream'], $next['fin'], $next['pendant']);
        }
        $json = str_starts_with(ltrim($next['body']), '{') || $next['status'] !== 200;
        $chunks = $json
            ? [$next['body']]
            : array_map(static fn (string $e): string => $e . "\n\n",
                array_values(array_filter(explode("\n\n", $next['body']), static fn (string $e): bool => trim($e) !== '')));

        return new FakeHttpStream($next['status'], $next['headers'] + ($json ? ['content-type' => 'application/json'] : $flux),
            $chunks, null);
    }

    public function request(
        string $method,
        string $url,
        array $headers = [],
        ?string $body = null,
        int $timeoutSeconds = 30,
        int $maxBytes = 0,
    ): array {
        $this->requests[] = [
            'method' => $method,
            'url' => $url,
            'headers' => $headers,
            'body' => $body,
            'timeout' => $timeoutSeconds,
            'maxBytes' => $maxBytes,
        ];

        $next = array_shift($this->queue);
        if ($next === null) {
            throw new \LogicException('LlmFakeHttpClient: no queued response for ' . $method . ' ' . $url);
        }
        if ($next instanceof HttpClientException) {
            throw $next;
        }

        return $next;
    }
}
