<?php

declare(strict_types=1);

namespace Humanome\Llm;

/**
 * An HttpClient that can also hand a response's body over as it arrives
 * (HttpStream). Same rules as HttpClient: no redirect followed, generic
 * error messages, nothing secret in them.
 */
interface StreamingHttpClient
{
    /**
     * Sends the request; its response is read through the stream returned.
     * The transfer runs until the body is complete, it fails, it has lasted
     * $timeoutSeconds in all (the stream's error() then says timedOut), or
     * close() stops it.
     *
     * @param array<string, string> $headers request headers (name => value)
     * @throws HttpClientException when the request cannot be started
     */
    public function open(string $method, string $url, array $headers, ?string $body, int $timeoutSeconds): HttpStream;
}
