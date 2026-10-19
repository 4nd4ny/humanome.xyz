<?php

declare(strict_types=1);

namespace Humanome\Llm;

/**
 * Production MultiHttpClient over curl_multi (ext-curl, available on OVH):
 * HTTPS only, no redirect, each request bounded by its own timeout.
 */
final class CurlMultiHttpClient implements MultiHttpClient
{
    private ?\CurlMultiHandle $multi = null;

    /** @var array<string, array{0: \CurlHandle, 1: \stdClass}> the requests running, by id */
    private array $running = [];

    /** @var array<int, string> request ids, by curl handle */
    private array $ids = [];

    public function start(string $id, string $method, string $url, array $headers, ?string $body,
                          float $timeoutSeconds): void
    {
        $this->multi ??= curl_multi_init();
        $ch = curl_init();
        if ($ch === false) {
            throw new HttpClientException('curl init failed');
        }
        $state = new \stdClass();
        $state->headers = [];
        $state->body = '';
        $lines = [];
        foreach ($headers as $name => $value) {
            $lines[] = $name . ': ' . $value;
        }
        $timeoutMs = max(1, (int) ($timeoutSeconds * 1000));
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_CUSTOMREQUEST => strtoupper($method),
            CURLOPT_HTTPHEADER => $lines,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_CONNECTTIMEOUT_MS => min(10000, $timeoutMs),
            CURLOPT_TIMEOUT_MS => $timeoutMs,
            CURLOPT_HEADERFUNCTION => static function ($ch, string $line) use ($state): int {
                $parts = explode(':', $line, 2);
                if (\count($parts) === 2) {
                    $state->headers[strtolower(trim($parts[0]))] = trim($parts[1]);
                }

                return \strlen($line);
            },
            CURLOPT_WRITEFUNCTION => static function ($ch, string $chunk) use ($state): int {
                $state->body .= $chunk;

                return \strlen($chunk);
            },
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }
        curl_multi_add_handle($this->multi, $ch);
        $this->running[$id] = [$ch, $state];
        $this->ids[spl_object_id($ch)] = $id;
    }

    public function wait(float $deadline): array
    {
        $done = [];
        while ($this->running !== [] && $this->multi !== null) {
            do {
                $status = curl_multi_exec($this->multi, $active);
            } while ($status === CURLM_CALL_MULTI_PERFORM);
            while (($info = curl_multi_info_read($this->multi)) !== false) {
                $ch = $info['handle'];
                $id = $this->ids[spl_object_id($ch)];
                $state = $this->running[$id][1];
                // generic message only: never the URL, a header or the body
                $done[$id] = $info['result'] === CURLE_OK
                    ? ['status' => (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE), 'headers' => $state->headers,
                       'body' => $state->body]
                    : new HttpClientException('network error (curl ' . $info['result'] . ')',
                        timedOut: $info['result'] === CURLE_OPERATION_TIMEDOUT);
                $this->close($id);
            }
            $left = $deadline - microtime(true);
            if ($done !== [] || $left <= 0) {
                break;
            }
            if (curl_multi_select($this->multi, min(1.0, $left)) === -1) {
                usleep(10_000);
            }
        }

        return $done;
    }

    public function abort(): array
    {
        $ids = array_map('strval', array_keys($this->running));
        foreach ($ids as $id) {
            $this->close($id);
        }

        return $ids;
    }

    public function running(): int
    {
        return \count($this->running);
    }

    private function close(string $id): void
    {
        [$ch] = $this->running[$id];
        if ($this->multi !== null) {
            curl_multi_remove_handle($this->multi, $ch);
        }
        curl_close($ch);
        unset($this->running[$id], $this->ids[spl_object_id($ch)]);
    }
}
