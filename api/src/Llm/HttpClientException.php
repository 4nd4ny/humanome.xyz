<?php

declare(strict_types=1);

namespace Humanome\Llm;

/**
 * Network-level HTTP failure (DNS, connect, timeout). Messages must stay
 * generic: they can end up in API responses and MUST never carry secrets
 * (no headers, no request body).
 *
 * $requestSent (2026-10-21): the request had gone out whole when the network
 * failed — the provider may have received it, and billed it. A failure to
 * resolve, connect or hand the request over leaves it false: nothing reached
 * the provider.
 */
final class HttpClientException extends \RuntimeException
{
    public function __construct(
        string $message,
        public readonly bool $timedOut = false,
        public readonly bool $requestSent = false,
    ) {
        parent::__construct($message);
    }
}
