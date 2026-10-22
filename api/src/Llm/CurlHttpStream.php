<?php

declare(strict_types=1);

namespace Humanome\Llm;

/**
 * HttpStream over curl_multi (ext-curl, on OVH as in development): the
 * transfer advances each time read() is called, so the caller can relay what
 * arrives while it arrives. HTTPS only, no redirect, the whole transfer
 * bounded by its timeout (CURLOPT_TIMEOUT) — and by a deadline of our own a
 * little later, should curl_multi itself stall or fail.
 */
final class CurlHttpStream implements HttpStream
{
    private ?\CurlMultiHandle $multi;

    private ?\CurlHandle $handle;

    private string $buffer = '';

    /** @var array<string, string> */
    private array $headers = [];

    private int $status = 0;

    private bool $done = false;

    private ?HttpClientException $error = null;

    private readonly int $bodyLength;

    private readonly float $deadline;

    /**
     * @param array<string, string> $headers
     * @throws HttpClientException
     */
    public function __construct(string $method, string $url, array $headers, ?string $body, int $timeoutSeconds)
    {
        $handle = curl_init();
        if ($handle === false) {
            throw new HttpClientException('curl init failed');
        }
        // No « Expect: 100-continue » on a large body: the first status is the answer's.
        $lines = ['Expect:'];
        foreach ($headers as $name => $value) {
            $lines[] = $name . ': ' . $value;
        }
        curl_setopt_array($handle, [
            CURLOPT_URL => $url,
            CURLOPT_CUSTOMREQUEST => strtoupper($method),
            CURLOPT_HTTPHEADER => $lines,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_CONNECTTIMEOUT => min(10, $timeoutSeconds),
            CURLOPT_TIMEOUT => $timeoutSeconds,
            CURLOPT_HEADERFUNCTION => function ($handle, string $line): int {
                $parts = explode(':', $line, 2);
                if (\count($parts) === 2) {
                    $this->headers[strtolower(trim($parts[0]))] = trim($parts[1]);
                }

                return \strlen($line);
            },
            CURLOPT_WRITEFUNCTION => function ($handle, string $chunk): int {
                $this->buffer .= $chunk;

                return \strlen($chunk);
            },
        ]);
        if ($body !== null) {
            curl_setopt($handle, CURLOPT_POSTFIELDS, $body);
        }
        $this->bodyLength = \strlen($body ?? '');
        $this->deadline = microtime(true) + $timeoutSeconds + 5;
        $this->multi = curl_multi_init();
        curl_multi_add_handle($this->multi, $handle);
        $this->handle = $handle;
    }

    public function read(float $waitSeconds): string
    {
        if (!$this->done) {
            $this->advance();
            if (!$this->done && $this->buffer === '' && $waitSeconds > 0 && $this->multi !== null) {
                if (curl_multi_select($this->multi, $waitSeconds) === -1) {
                    usleep((int) min(100_000, $waitSeconds * 1_000_000));
                }
                $this->advance();
            }
        }
        $chunk = $this->buffer;
        $this->buffer = '';

        return $chunk;
    }

    public function finished(): bool
    {
        return $this->done;
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
        if ($this->handle !== null) {
            if ($this->multi !== null) {
                curl_multi_remove_handle($this->multi, $this->handle);
            }
            $this->handle = null;
        }
        if ($this->multi !== null) {
            curl_multi_close($this->multi);
            $this->multi = null;
        }
        $this->done = true;
    }

    public function __destruct()
    {
        $this->close();
    }

    /** A generic message only: never the URL, a header or the body. */
    private function failure(string $what, bool $timedOut): HttpClientException
    {
        return new HttpClientException('network error (' . $what . ')', timedOut: $timedOut,
            requestSent: $this->bodyLength > 0 && $this->handle !== null
                && (int) curl_getinfo($this->handle, CURLINFO_SIZE_UPLOAD_T) >= $this->bodyLength);
    }

    private function advance(): void
    {
        if ($this->multi === null || $this->handle === null) {
            return;
        }
        do {
            $code = curl_multi_exec($this->multi, $active);
        } while ($code === CURLM_CALL_MULTI_PERFORM);
        $this->status = (int) curl_getinfo($this->handle, CURLINFO_RESPONSE_CODE);
        while (($info = curl_multi_info_read($this->multi)) !== false) {
            if ($info['result'] !== CURLE_OK) {
                $this->error = $this->failure('curl ' . $info['result'], $info['result'] === CURLE_OPERATION_TIMEDOUT);
            }
            $this->status = (int) curl_getinfo($this->handle, CURLINFO_RESPONSE_CODE);
            $this->done = true;
        }
        if (!$this->done && ($code !== CURLM_OK || microtime(true) > $this->deadline)) {
            // curl_multi failed, or stalled past the transfer's own timeout.
            $this->error = $this->failure($code !== CURLM_OK ? 'curl multi ' . $code : 'curl 28', $code === CURLM_OK);
            $this->done = true;
        }
        if ($this->done) {
            $buffer = $this->buffer;
            $this->close();
            $this->buffer = $buffer;
        }
    }
}
