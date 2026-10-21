<?php

declare(strict_types=1);

namespace Humanome\Llm;

/**
 * Non-2xx answer from the upstream LLM provider — or, from AnthropicProvider,
 * a 2xx answer whose body is not JSON, with its own status: the provider
 * billed that call. The message is provider error text only (never a header,
 * never the API key) and is safe to relay.
 */
final class UpstreamException extends \RuntimeException
{
    public function __construct(
        public readonly int $status,
        string $message,
        public readonly ?string $retryAfter = null,
    ) {
        parent::__construct($message);
    }
}
