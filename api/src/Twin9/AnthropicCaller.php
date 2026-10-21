<?php

declare(strict_types=1);

namespace Humanome\Twin9;

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
 * Twin9 runs on the server send through DirectCalls, which reads responses
 * with lire() and retries within the slice. The open cartography's credits
 * route (/twin6/appel) sends the same request streamed (Llm\AnthropicFlux,
 * 2026-10-21) and never retries: the client engine owns resumption, a
 * server-side retry would bill twice.
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
}
