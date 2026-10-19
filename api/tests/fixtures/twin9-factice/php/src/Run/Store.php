<?php

declare(strict_types=1);

namespace Twin9\Run;

/** The memory of a map at rest, as the platform keeps it: the contract of the real engine. */
interface Store
{
    public function read(string $key): ?string;

    /** @return list<string> */
    public function keys(string $prefix): array;

    public function write(string $key, string $text): void;
}
