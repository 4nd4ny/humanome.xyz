<?php

declare(strict_types=1);

namespace Twin9\Run;

/** The calls a pass of the fake engine waits for: the contract of the real one. */
final class Pending extends \Exception
{
    /** @param list<Call> $calls */
    public function __construct(public readonly array $calls)
    {
        parent::__construct(\count($calls) . ' appel(s) en attente');
    }
}
