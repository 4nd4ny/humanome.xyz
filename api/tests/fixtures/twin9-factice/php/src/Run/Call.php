<?php

declare(strict_types=1);

namespace Twin9\Run;

/**
 * The fake engine's call (humanome's tests): the contract of the real one —
 * its id, step, label, the model asked for, the prompt and its SHA-256.
 */
final class Call
{
    public readonly string $sha256;

    public function __construct(
        public readonly string $id,
        public readonly string $step,
        public readonly string $label,
        public readonly string $model,
        public readonly string $prompt,
    ) {
        $this->sha256 = hash('sha256', $prompt);
    }
}
