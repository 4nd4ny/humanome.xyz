<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Llm\HttpClient;
use Humanome\Llm\HttpClientException;

/**
 * Server-side Anthropic Messages API call for Twin9 (T3b, ADR-010 §1/§2;
 * T7, ADR-011 §3).
 *
 * Same upstream conventions as Llm\AnthropicProvider (raw HTTP, x-api-key
 * header only), with deliberate differences:
 *
 *   * The base URL is a LOCKED constant — ADR-010 §2, threat « clé privée
 *     pointée vers un serveur attaquant » : no constructor parameter, no env
 *     override, nothing the user (or an admin setting) can redirect. Tests
 *     inject a fake at the HttpClient seam (LlmRuntime), never a URL.
 *   * No forced tool use: the Twin9 templates specify their own output
 *     formats and the engine parses the model text verbatim, like the Python
 *     reference does.
 *   * The request carries what each step of a run sets (requete()): model,
 *     output budget, effort when set, and thinking in the one form the model
 *     accepts — cut by default: disabled, or between_tools for Sonnet 5.5,
 *     which refuses disabled; adaptive otherwise. Never a temperature: the
 *     5.5 models refuse it.
 *
 * appeler() serves the routes of the browser engine: no automatic retry (the
 * client engine owns resumption, a server-side retry would double-bill).
 * Twin9 runs on the server send through DirectCalls, which reads responses
 * with lire() and retries within the slice.
 *
 * Errors carry a GENERIC French message: never the prompt, never the
 * rendered template, never upstream error text (which could quote request
 * content back — ADR-010 §2, « fuite par messages d'erreur »).
 */
final class AnthropicCaller
{
    /** LOCKED (ADR-010 §2): the ONLY upstream Twin9 calls may reach. */
    public const BASE_URL = 'https://api.anthropic.com';
    public const API_VERSION = '2023-06-01';

    /** The models whose thinking is cut by between_tools: Sonnet 5.5 refuses disabled. */
    private const ENTRE_OUTILS = ['claude-sonnet-5-5'];

    public function __construct(
        private readonly HttpClient $http,
        private readonly string $apiKey,
        private readonly int $timeoutSeconds = 150,
    ) {
    }

    /**
     * The Messages API request of one call: headers and JSON body.
     *
     * @param 'coupee'|'adaptative' $reflexion thinking: cut, in the form the model accepts, or adaptive
     * @param string|null $effort output_config.effort; null: the model's own
     * @return array{headers: array<string, string>, body: string}
     */
    public static function requete(string $apiKey, string $model, string $prompt, int $maxTokens,
                                   string $reflexion = 'coupee', ?string $effort = null, ?string $system = null): array
    {
        return [
            'headers' => self::entetes($apiKey),
            'body' => json_encode(self::params($model, $prompt, $maxTokens, $reflexion, $effort, $system),
                JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
        ];
    }

    /**
     * The body of one call, which a batch carries as its request's params:
     * the same in both lanes.
     *
     * @return array<string, mixed>
     */
    public static function params(string $model, string $prompt, int $maxTokens, string $reflexion = 'coupee',
                                  ?string $effort = null, ?string $system = null): array
    {
        $payload = [
            'model' => $model,
            'max_tokens' => $maxTokens,
            'thinking' => self::reflexion($model, $reflexion),
        ];
        if ($effort !== null) {
            $payload['output_config'] = ['effort' => $effort];
        }
        if ($system !== null && $system !== '') {
            $payload['system'] = $system;
        }
        $payload['messages'] = [['role' => 'user', 'content' => $prompt]];

        return $payload;
    }

    /** @return array<string, string> the headers of every request to the API */
    public static function entetes(string $apiKey): array
    {
        return [
            'x-api-key' => $apiKey,
            'anthropic-version' => self::API_VERSION,
            'content-type' => 'application/json',
        ];
    }

    /**
     * The thinking of a call: cut in the form the model accepts (disabled;
     * between_tools for Sonnet 5.5), or adaptive.
     *
     * @return array{type: string}
     */
    public static function reflexion(string $model, string $reflexion): array
    {
        if ($reflexion === 'adaptative') {
            return ['type' => 'adaptive'];
        }
        foreach (self::ENTRE_OUTILS as $prefix) {
            if ($model === $prefix || str_starts_with($model, $prefix . '-')) {
                return ['type' => 'between_tools'];
            }
        }

        return ['type' => 'disabled'];
    }

    /**
     * What a response says. Answered: the text (its text blocks, as the v9.8
     * reads them), the usage, the stop reason, the model served. Refused by
     * the model (stop_reason « refusal »): a failure, never retried. A rate
     * refusal (429, 529): `debit`, with its Retry-After in seconds when the
     * API gives one (a 429 without one is a spending cap). Anything else: a
     * generic error, which the run may try again.
     *
     * @param array<string, string> $headers lower-case names
     * @return array{ok: bool, texte?: string, tokens_in?: int, tokens_out?: int, stop_reason?: string,
     *               modele_servi?: string|null, refus?: bool, debit?: bool, http?: int, attendre?: float|null,
     *               erreur?: string}
     */
    public static function lire(int $status, array $headers, string $body): array
    {
        if ($status === 429 || $status === 529) {
            $retry = $headers['retry-after'] ?? null;

            return ['ok' => false, 'debit' => true, 'http' => $status,
                    'attendre' => \is_string($retry) && is_numeric($retry) ? max(0.0, (float) $retry) : null,
                    'erreur' => $status === 429 ? 'débit du fournisseur (HTTP 429)' : 'fournisseur saturé (HTTP 529)'];
        }
        if ($status < 200 || $status >= 300) {
            return ['ok' => false, 'erreur' => 'erreur du fournisseur (HTTP ' . $status . ')'];
        }
        $data = json_decode($body, true);
        if (!\is_array($data)) {
            return ['ok' => false, 'erreur' => 'réponse illisible du fournisseur'];
        }

        return self::lireMessage($data);
    }

    /**
     * What a message says, answered directly or in a batch's results: the
     * text, the usage, the stop reason, the model served; a refusal of the
     * model is a failure.
     *
     * @param array<string, mixed> $data a Messages API message
     * @return array{ok: bool, texte: string, tokens_in: int, tokens_out: int, stop_reason: string,
     *               modele_servi: string|null, refus?: bool, erreur?: string}
     */
    public static function lireMessage(array $data): array
    {
        $texte = '';
        foreach ((array) ($data['content'] ?? []) as $block) {
            if (\is_array($block) && ($block['type'] ?? '') === 'text') {
                $texte .= (string) ($block['text'] ?? '');
            }
        }
        $lu = [
            'tokens_in' => (int) ($data['usage']['input_tokens'] ?? 0),
            'tokens_out' => (int) ($data['usage']['output_tokens'] ?? 0),
            'stop_reason' => (string) ($data['stop_reason'] ?? ''),
            'modele_servi' => \is_string($data['model'] ?? null) ? $data['model'] : null,
        ];
        if ($lu['stop_reason'] === 'refusal') {
            $categorie = $data['stop_details']['category'] ?? null;

            return ['ok' => false, 'refus' => true, 'texte' => $texte, 'erreur' => 'refus du modèle'
                . (\is_string($categorie) && preg_match('/^[a-z_]{1,40}$/', $categorie) === 1 ? ' (' . $categorie . ')' : '')]
                + $lu;
        }

        return ['ok' => true, 'texte' => $texte] + $lu;
    }

    /**
     * One Messages API completion, thinking cut.
     *
     * @return array{texte: string, tokens_in: int, tokens_out: int, stop_reason: string}
     *               tokens_* are the REAL usage counters returned by the API
     *               (the billing basis, ADR-010 §3), never an estimate.
     *
     * @throws Twin9Exception generic French message + HTTP status for the route
     */
    public function appeler(string $model, ?string $system, string $prompt, int $maxTokens): array
    {
        // Thinking tokens count against max_tokens without reaching the text
        // blocks (observed live on the P6 demo): cut, the steps keep the whole
        // budget as parseable text.
        $requete = self::requete($this->apiKey, $model, $prompt, $maxTokens, 'coupee', null, $system);
        try {
            $response = $this->http->request(
                'POST',
                self::BASE_URL . '/v1/messages',
                $requete['headers'],
                $requete['body'],
                $this->timeoutSeconds,
            );
        } catch (HttpClientException $e) {
            throw new Twin9Exception(
                $e->timedOut
                    ? 'Le fournisseur LLM ne répond pas, réessayez plus tard.'
                    : 'Le fournisseur LLM est injoignable, réessayez plus tard.',
                $e->timedOut ? 504 : 502,
            );
        }

        $status = $response['status'];
        if ($status === 429) {
            throw new Twin9Exception('Le fournisseur LLM est saturé, réessayez plus tard.', 429);
        }
        if ($status === 401 || $status === 403) {
            // Useful signal in cle_privee mode (revoked/typo'd key) — still
            // generic, nothing from the request is echoed.
            throw new Twin9Exception('Clé API refusée par le fournisseur LLM.', 502);
        }
        if ($status < 200 || $status >= 300) {
            // Upstream error text is NOT relayed: it may quote request
            // content, and the request contains the rendered template.
            throw new Twin9Exception('Erreur du fournisseur LLM, réessayez plus tard.', 502);
        }
        $lu = self::lire($status, $response['headers'], $response['body']);
        if (!$lu['ok'] && !isset($lu['refus'])) {
            throw new Twin9Exception('Réponse du fournisseur LLM illisible.', 502);
        }

        return [
            'texte' => $lu['texte'] ?? '',
            'tokens_in' => $lu['tokens_in'] ?? 0,
            'tokens_out' => $lu['tokens_out'] ?? 0,
            // 'max_tokens' = truncated generation: the client engine fails
            // loudly instead of parsing a fragmentary document (P6 lesson).
            'stop_reason' => $lu['stop_reason'] ?? '',
        ];
    }
}
