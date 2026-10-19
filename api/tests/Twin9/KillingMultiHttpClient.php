<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\Llm\MultiHttpClient;

/**
 * A process that dies: the tick stops on an exception, as when OVH kills it,
 * either as the n-th request is about to leave (between two calls: the
 * previous answer written, the next call not sent) or while the n-th request
 * is in flight (its answer lost). Counted over the whole test.
 */
final class KillingMultiHttpClient implements MultiHttpClient
{
    private int $departs = 0;

    /**
     * @param list<int> $auDepart the requests (1 = the first) before which the process dies
     * @param list<int> $enVol the requests during which it dies
     */
    public function __construct(private readonly MultiHttpClient $http, private array $auDepart = [],
                                private array $enVol = [])
    {
    }

    public function start(string $id, string $method, string $url, array $headers, ?string $body,
                          float $timeoutSeconds): void
    {
        $n = ++$this->departs;
        if (\in_array($n, $this->auDepart, true)) {
            $this->auDepart = array_values(array_diff($this->auDepart, [$n]));
            --$this->departs;
            throw new \RuntimeException('tick tué');
        }
        $this->http->start($id, $method, $url, $headers, $body, $timeoutSeconds);
        if (\in_array($n, $this->enVol, true)) {
            $this->enVol = array_values(array_diff($this->enVol, [$n]));
            $this->http->abort();
            throw new \RuntimeException('tick tué');
        }
    }

    public function wait(float $deadline): array
    {
        return $this->http->wait($deadline);
    }

    public function abort(): array
    {
        return $this->http->abort();
    }

    public function running(): int
    {
        return $this->http->running();
    }
}
