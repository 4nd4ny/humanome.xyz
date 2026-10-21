<?php

declare(strict_types=1);

namespace Humanome\Llm;

/**
 * The body of a response, read as it arrives (2026-10-21). The paid calls of
 * the open cartography and the demo's calls to Anthropic stream: a call cut
 * short is billed for what it produced — never refunded on a guess, never
 * charged its worst case —, and its progress reaches the browser.
 * Christian: « Je ne peux pas prendre à charge les coûts extra ».
 */
interface HttpStream
{
    /**
     * Waits at most $waitSeconds for more of the body and returns what came
     * since the last call ('' when nothing did, and once finished()).
     */
    public function read(float $waitSeconds): string;

    /** The transfer is over: the body is complete, or it failed (error()). */
    public function finished(): bool;

    /** The HTTP status, 0 before the response's headers arrived. */
    public function status(): int;

    /** @return array<string, string> the response headers, lowercase names */
    public function headers(): array;

    /** Null while running and after a complete body; the network failure otherwise, a timeout included. */
    public function error(): ?HttpClientException;

    /** Stops the transfer and closes the connection; finished() becomes true. */
    public function close(): void;
}
