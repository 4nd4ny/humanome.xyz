<?php

declare(strict_types=1);

namespace Humanome\Llm;

/**
 * Concurrent HTTP requests (Twin9's direct calls, T7): started one by one,
 * collected as they finish, never past a deadline. curl_multi in production,
 * a fake in tests (LlmRuntime). Like HttpClient, it never follows redirects.
 */
interface MultiHttpClient
{
    /**
     * Starts a request; its outcome comes back from wait() under $id.
     *
     * @param array<string, string> $headers request headers (name => value)
     */
    public function start(string $id, string $method, string $url, array $headers, ?string $body,
                          float $timeoutSeconds): void;

    /**
     * Waits until at least one request is done, or until $deadline
     * (microtime) passes.
     *
     * @return array<string, array{status: int, headers: array<string, string>, body: string}|HttpClientException>
     *         the requests done, by id; response headers in lower case
     */
    public function wait(float $deadline): array;

    /** @return list<string> the requests still running, cut */
    public function abort(): array;

    /** The requests running. */
    public function running(): int;
}
