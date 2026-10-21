<?php

declare(strict_types=1);

namespace Humanome\Llm;

/**
 * An HttpStream over a client that cannot stream (HttpClient::request()):
 * the whole body arrives at the first read(). Lets the streamed calls run on
 * any HttpClient — a test's own, a future one — with the same outcome, minus
 * the progress.
 */
final class RequestHttpStream implements HttpStream
{
    private string $body = '';

    private int $status = 0;

    /** @var array<string, string> */
    private array $headers = [];

    private ?HttpClientException $error = null;

    private bool $read = false;

    /** @param array<string, string> $headers */
    public function __construct(HttpClient $http, string $method, string $url, array $headers, ?string $body,
                                int $timeoutSeconds)
    {
        try {
            $response = $http->request($method, $url, $headers, $body, $timeoutSeconds);
            $this->status = $response['status'];
            $this->headers = $response['headers'];
            $this->body = $response['body'];
        } catch (HttpClientException $e) {
            $this->error = $e;
        }
    }

    /**
     * The client's stream when it has one, this one otherwise.
     *
     * @param array<string, string> $headers
     * @throws HttpClientException
     */
    public static function open(HttpClient $http, string $method, string $url, array $headers, ?string $body,
                                int $timeoutSeconds): HttpStream
    {
        return $http instanceof StreamingHttpClient
            ? $http->open($method, $url, $headers, $body, $timeoutSeconds)
            : new self($http, $method, $url, $headers, $body, $timeoutSeconds);
    }

    public function read(float $waitSeconds): string
    {
        if ($this->read) {
            return '';
        }
        $this->read = true;

        return $this->body;
    }

    public function finished(): bool
    {
        return $this->read || $this->error !== null;
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
        return $this->error;
    }

    public function close(): void
    {
        $this->read = true;
    }
}
