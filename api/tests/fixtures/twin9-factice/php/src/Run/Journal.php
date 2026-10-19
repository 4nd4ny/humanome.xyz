<?php

declare(strict_types=1);

namespace Twin9\Run;

/** The run's journal of calls, as the platform gives it: the contract of the real engine. */
interface Journal
{
    /** @return array{sha256: string, response?: string, failure?: string}|null */
    public function outcome(string $id): ?array;
}
