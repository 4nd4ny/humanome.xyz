<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Llm\HttpClientException;
use Humanome\Llm\HttpStream;

/**
 * The stream LlmFakeHttpClient::open() replays: one chunk per read(), then
 * its end. $pendant, if given, runs once, just before the second chunk is
 * delivered: the answer has begun, and is not finished (sprint 7: what
 * happens elsewhere while a call is in progress).
 */
final class FakeHttpStream implements HttpStream
{
    private int $next = 0;

    private bool $closed = false;

    /**
     * @param array<string, string> $headers
     * @param list<string> $chunks
     */
    public function __construct(
        private readonly int $status,
        private readonly array $headers,
        private readonly array $chunks,
        private readonly ?HttpClientException $end,
        private ?\Closure $pendant = null,
    ) {
    }

    public function read(float $waitSeconds): string
    {
        if ($this->closed || $this->next >= \count($this->chunks)) {
            return '';
        }
        if ($this->next === 1 && $this->pendant !== null) {
            $pendant = $this->pendant;
            $this->pendant = null;
            $pendant();
        }

        return $this->chunks[$this->next++];
    }

    public function finished(): bool
    {
        return $this->closed || $this->next >= \count($this->chunks);
    }

    public function status(): int
    {
        return $this->status;
    }

    public function headers(): array
    {
        return $this->headers;
    }

    public function error(): ?HttpClientException
    {
        return $this->finished() && !$this->closed ? $this->end : null;
    }

    public function close(): void
    {
        $this->closed = true;
    }

    /** The chunks the reader has taken. */
    public function delivered(): int
    {
        return $this->next;
    }
}
