<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Llm\HttpClientException;
use Humanome\Llm\HttpStream;

/** The stream LlmFakeHttpClient::open() replays: one chunk per read(), then its end. */
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
    ) {
    }

    public function read(float $waitSeconds): string
    {
        if ($this->closed || $this->next >= \count($this->chunks)) {
            return '';
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
