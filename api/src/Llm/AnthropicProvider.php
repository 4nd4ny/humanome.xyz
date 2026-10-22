<?php

declare(strict_types=1);

namespace Humanome\Llm;

/**
 * Anthropic Messages API upstream (raw HTTP over the injectable HttpClient —
 * a proxy must not pull an SDK dependency, CLAUDE.md convention). The demo's
 * calls stream since 2026-10-21 (ouvrirFlux(), AnthropicFlux): the browser
 * sees the answer come, and a call cut short is counted for what it produced.
 * complete() stays for the tutor, whose answers are a few sentences.
 *
 * The API key travels in the x-api-key request header ONLY: never in a URL,
 * never logged, never echoed in any response or exception message.
 */
final class AnthropicProvider
{
    public const BASE_URL = 'https://api.anthropic.com';
    public const API_VERSION = '2023-06-01';

    /**
     * Input tokens a request costs besides its system and prompt: the system
     * prompt Anthropic adds for a forced tool (406 tokens for Haiku 5.5, 474
     * for Sonnet 5, 588 for Haiku 4.5 — pricing page, read on 2026-10-21), the
     * tool's definition and the message framing. The demo's worst-case
     * reservation (routes/llm.php) adds it to the prompt's bytes.
     */
    public const REQUEST_OVERHEAD_TOKENS = 1024;

    /**
     * Past this many bytes, a prompt's bound in bytes (one token per byte at
     * worst) overshoots its tokens by four or so, and decides Haiku 5.5's long
     * prompt tier wrongly: the demo asks Anthropic for the count instead
     * (countTokens(), 2026-10-21). Under it, the bound costs a cent at most.
     */
    public const COMPTE_AU_DELA = 100_000;

    /**
     * A count is quick: the call it precedes keeps its own timeout, and the
     * two together stay under what the hosting gives a script (165 s on
     * OVH, the call's 150 s by default).
     */
    private const COUNT_TIMEOUT = 5;

    public function __construct(
        private readonly HttpClient $http,
        private readonly string $apiKey,
        private readonly int $timeoutSeconds = 60,
        private readonly string $baseUrl = self::BASE_URL,
    ) {
    }

    /**
     * Same result contract as the engine providers (engine/src/providers):
     *
     * @param bool $forceJsonDocument When true (default), forces generic tool
     *   use so the reply is a GUARANTEED-valid JSON document (cartographie
     *   demo/Twin9). When false, the model answers in FREE TEXT — required by
     *   the tutor assistant (D9), which wants prose, not a JSON document (a
     *   forced empty-schema tool otherwise yields « [] »).
     * @param list<array{role: 'user'|'assistant', content: string}> $precedents
     *   earlier turns of the conversation, sent before $prompt: the tutor's
     *   short memory (sprint 11, Tuteur\MemoireCourte, already bounded and
     *   alternating from a `user` turn). None for every other caller, whose
     *   payload is unchanged.
     *
     * @return array{text: string, usage: array{inputTokens: int, outputTokens: int}, model: string}
     *
     * @throws UpstreamException   on non-2xx upstream status
     * @throws HttpClientException on network failure
     */
    public function complete(string $model, ?string $system, string $prompt, int $maxTokens, bool $forceJsonDocument = true,
                             array $precedents = []): array
    {
        $payload = ['model' => $model, 'max_tokens' => $maxTokens]
            + self::requestBody($system, $prompt, $forceJsonDocument, false, $precedents);

        $response = $this->http->request(
            'POST',
            rtrim($this->baseUrl, '/') . '/v1/messages',
            $this->headers(),
            json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
            $this->timeoutSeconds,
        );

        if ($response['status'] < 200 || $response['status'] >= 300) {
            throw new UpstreamException(
                $response['status'],
                self::errorDetail($response['body']),
                $response['headers']['retry-after'] ?? null,
            );
        }

        $data = json_decode($response['body'], true);
        if (!\is_array($data)) {
            // The answer's own 2xx status: the provider billed the call (the
            // demo keeps its reservation, routes/llm.php).
            throw new UpstreamException($response['status'], 'réponse amont non-JSON');
        }

        // Forced tool use: the parsed JSON document arrives as the tool_use
        // input — re-serialized compactly for the {text} contract. Text
        // blocks remain the fallback (models without tool support, tests).
        $text = '';
        foreach ((array) ($data['content'] ?? []) as $block) {
            if (!\is_array($block)) {
                continue;
            }
            if (($block['type'] ?? '') === 'tool_use' && \array_key_exists('input', $block)) {
                $text = json_encode($block['input'], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
                break;
            }
            if (($block['type'] ?? '') === 'text') {
                $text .= (string) ($block['text'] ?? '');
            }
        }

        return [
            'text' => $text,
            'usage' => [
                'inputTokens' => (int) ($data['usage']['input_tokens'] ?? 0),
                'outputTokens' => (int) ($data['usage']['output_tokens'] ?? 0),
            ],
            'model' => (string) ($data['model'] ?? $model),
            // Relayed so clients can distinguish a truncated generation
            // ('max_tokens') from a natural stop — silent truncation produced
            // unparseable or fragmentary JSON downstream.
            'stopReason' => (string) ($data['stop_reason'] ?? ''),
        ];
    }

    /**
     * The same call as complete(), streamed: the status first, then the
     * answer as it comes (AnthropicFlux), within this provider's timeout.
     *
     * @throws HttpClientException when the request cannot even start
     */
    public function ouvrirFlux(string $model, ?string $system, string $prompt, int $maxTokens,
                               bool $forceJsonDocument = true): AnthropicFlux
    {
        return AnthropicFlux::ouvrir(
            $this->http,
            rtrim($this->baseUrl, '/') . '/v1/messages',
            $this->headers(),
            ['model' => $model, 'max_tokens' => $maxTokens] + self::requestBody($system, $prompt, $forceJsonDocument, true),
            $this->timeoutSeconds,
        );
    }

    /** The provider's message in an error answer's body — never any request data. */
    public static function detailErreur(string $body): string
    {
        return self::errorDetail($body);
    }

    /**
     * The input tokens of the call complete() would make, as Anthropic counts
     * them (POST /v1/messages/count_tokens: free, its own rate limit). An
     * estimate, which may include tokens Anthropic adds and does not bill.
     * Null when it cannot be had — network, status, body —: the caller then
     * bounds the prompt by its bytes.
     */
    public function countTokens(string $model, ?string $system, string $prompt, bool $forceJsonDocument = true): ?int
    {
        try {
            $response = $this->http->request(
                'POST',
                rtrim($this->baseUrl, '/') . '/v1/messages/count_tokens',
                $this->headers(),
                json_encode(['model' => $model] + self::requestBody($system, $prompt, $forceJsonDocument),
                    JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
                min($this->timeoutSeconds, self::COUNT_TIMEOUT),
            );
        } catch (HttpClientException) {
            return null;
        }
        if ($response['status'] !== 200) {
            return null;
        }
        $data = json_decode($response['body'], true);
        $tokens = \is_array($data) ? ($data['input_tokens'] ?? null) : null;

        return \is_int($tokens) && $tokens > 0 ? $tokens : null;
    }

    /**
     * What a call sends besides its model and output: thinking, the forced
     * tool, the system prompt, the message — the same for the call and for
     * its count, but for how a streamed call delivers the tool's JSON
     * ($flux: eager_input_streaming), which changes no token. $precedents:
     * the earlier turns complete() may send before the message.
     *
     * @param list<array{role: 'user'|'assistant', content: string}> $precedents
     * @return array<string, mixed>
     */
    private static function requestBody(?string $system, string $prompt, bool $forceJsonDocument,
                                        bool $flux = false, array $precedents = []): array
    {
        $body = [
            // Some models reason by default; thinking tokens count against
            // max_tokens while never reaching the text blocks we extract —
            // observed live: 6144 output tokens for 5444 chars of truncated
            // text. The demo needs the whole budget as text.
            'thinking' => ['type' => 'disabled'],
            // No temperature: rejected as deprecated by current models
            // (« `temperature` is deprecated for this model », observed live).
            'messages' => array_merge($precedents, [['role' => 'user', 'content' => $prompt]]),
        ];
        if ($forceJsonDocument) {
            // Forced generic tool use: free-text generations showed a high
            // malformation rate live (key emitted without its value, twice on
            // the same pole). The tool input becomes `text`. Its JSON streams
            // as Claude writes it (eager_input_streaming, 2026-10-21): without
            // it, the API buffers each parameter value until it is complete —
            // « nothing prints for a large parameter until Claude has finished
            // generating it » (Anthropic, fine-grained tool streaming) —, the
            // page would see nothing come, and the bytes a cut call received
            // would not bound what it generated (AnthropicFlux). The JSON is
            // then not validated before it streams: the engine validates it,
            // and tries once more.
            $body['tools'] = [[
                'name' => 'emettre_document',
                'description' => 'Émet le document JSON strict demandé par la consigne.',
                'input_schema' => ['type' => 'object'],
            ] + ($flux ? ['eager_input_streaming' => true] : [])];
            $body['tool_choice'] = ['type' => 'tool', 'name' => 'emettre_document'];
        }
        if ($system !== null && $system !== '') {
            $body['system'] = $system;
        }

        return $body;
    }

    /** @return array<string, string> the key travels here only */
    private function headers(): array
    {
        return [
            'x-api-key' => $this->apiKey,
            'anthropic-version' => self::API_VERSION,
            'content-type' => 'application/json',
        ];
    }

    /** Provider error message from the body — never any request data. */
    private static function errorDetail(string $body): string
    {
        $data = json_decode($body, true);
        $detail = \is_array($data) ? ($data['error']['message'] ?? '') : '';

        return \is_string($detail) && $detail !== '' ? $detail : 'erreur du fournisseur amont';
    }
}
