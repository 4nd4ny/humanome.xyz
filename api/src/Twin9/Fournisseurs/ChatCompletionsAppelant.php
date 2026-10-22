<?php

declare(strict_types=1);

namespace Humanome\Twin9\Fournisseurs;

/**
 * Twin9's calls to the Chat Completions API of OpenAI, Mistral AI, xAI and
 * OpenRouter (ADR-012 §4; OpenAI by Chat Completions rather than Responses,
 * so that one caller serves four providers). Written for Twin9 alone: the
 * mass worker's OpenAiCompatibleProvider, which takes a free address and
 * copies the provider's errors, is neither reused nor extended.
 *
 * The request (facts read on the official documentations, 2026-10-22):
 *   - at the provider's locked address, the key as a Bearer header only;
 *   - the prompt as the one user message; the output budget in the field
 *     each provider caps it with: `max_completion_tokens` at OpenAI (the
 *     reasoning included; `max_tokens` is deprecated there) and xAI (the
 *     reasoning excluded), `max_tokens` at Mistral and OpenRouter;
 *   - OpenAI: `store: false` (completions are stored by default for new
 *     accounts, and listed with the same key), and `reasoning_effort` only
 *     when the model's grid entry names one (reflexion_param: the values a
 *     model admits vary, a wrong one is a 400);
 *   - OpenRouter: `provider: {data_collection: "deny", allow_fallbacks:
 *     false}` — only providers that keep nothing, never another model;
 *   - never a temperature, a top_p, a stop, a penalty: reasoning models
 *     refuse them.
 *
 * The response: the first choice's text (Mistral may give a list of blocks:
 * its `text` blocks only, never its thinking), its finish_reason classed by
 * Arret, the model served. A `message.refusal` is a refusal whatever the
 * finish; an error inside a 200 without choices (OpenRouter) a failure.
 * Output tokens are those billed: `completion_tokens` (the reasoning
 * included at OpenAI and OpenRouter), plus the reasoning tokens at xAI,
 * whose completion tokens leave them out. At OpenAI, a 429 whose code says
 * the credit, the spending limit or the quota is spent is a cap.
 */
final class ChatCompletionsAppelant implements Appelant
{
    /** The field of the output budget, by provider. */
    private const CHAMP_SORTIE = [
        'openai' => 'max_completion_tokens',
        'mistral' => 'max_tokens',
        'xai' => 'max_completion_tokens',
        'openrouter' => 'max_tokens',
    ];

    /** OpenAI's codes and type of a 429 that retrying does not mend (its error codes guide). */
    private const QUOTAS = ['insufficient_quota', 'credit_balance_exhausted', 'organization_spend_limit_exceeded',
                            'project_spend_limit_exceeded', 'organization_usage_limit_exceeded'];

    private readonly string $url;

    public function __construct(private readonly string $fournisseur)
    {
        if (!isset(self::CHAMP_SORTIE[$fournisseur]) || Fournisseurs::REGISTRE[$fournisseur]['format'] !== 'chat') {
            throw new \InvalidArgumentException('Pas un fournisseur Chat Completions : ' . $fournisseur);
        }
        $this->url = Fournisseurs::REGISTRE[$fournisseur]['url'];
    }

    public function fournisseur(): string
    {
        return $this->fournisseur;
    }

    public function requete(string $cle, array $reglage, string $prompt): array
    {
        $corps = [
            'model' => $reglage['modele'],
            'messages' => [['role' => 'user', 'content' => $prompt]],
            self::CHAMP_SORTIE[$this->fournisseur] => $reglage['budget_sortie'],
        ];
        if ($this->fournisseur === 'openai') {
            $corps['store'] = false;
            $param = $reglage['reflexion_param'] ?? null;
            if (\is_string($param) && $param !== '') {
                $corps['reasoning_effort'] = $param;
            }
        }
        if ($this->fournisseur === 'openrouter') {
            $corps['provider'] = ['data_collection' => 'deny', 'allow_fallbacks' => false];
        }

        return [
            'url' => $this->url,
            'headers' => ['authorization' => 'Bearer ' . $cle, 'content-type' => 'application/json'],
            'body' => json_encode($corps, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ];
    }

    public function lire(int $status, array $headers, string $body): array
    {
        $data = json_decode($body, true);
        if ($status < 200 || $status >= 300) {
            $erreur = \is_array($data) && \is_array($data['error'] ?? null) ? $data['error'] : [];
            $quota = $this->fournisseur === 'openai' && (\in_array($erreur['code'] ?? null, self::QUOTAS, true)
                || ($erreur['type'] ?? null) === 'insufficient_quota');

            return Reponses::refus($this->fournisseur, $status, $headers, $quota);
        }
        if (!\is_array($data)) {
            return Reponses::illisible($this->fournisseur);
        }
        if (!isset($data['choices']) && isset($data['error'])) {
            return Reponses::erreurDansLaReponse($this->fournisseur);
        }
        $choix = \is_array($data['choices'] ?? null) ? ($data['choices'][0] ?? null) : null;
        if (!\is_array($choix)) {
            return Reponses::illisible($this->fournisseur);
        }
        $message = \is_array($choix['message'] ?? null) ? $choix['message'] : [];
        $fin = \is_string($choix['finish_reason'] ?? null) ? $choix['finish_reason'] : null;
        $usage = \is_array($data['usage'] ?? null) ? $data['usage'] : [];
        $lu = [
            'tokens_in' => (int) ($usage['prompt_tokens'] ?? 0),
            'tokens_out' => $this->sortie($usage),
            'stop_reason' => Arret::assainir($fin),
            'arret' => Arret::classe($this->fournisseur, $fin),
            'modele_servi' => Reponses::modele($data['model'] ?? null),
        ];
        $refusal = $message['refusal'] ?? null;

        return Reponses::issue($this->fournisseur, self::texte($message['content'] ?? null), $lu,
            \is_string($refusal) && $refusal !== '');
    }

    /**
     * The output tokens billed: the completion's, the reasoning's at xAI
     * (left out of its completion tokens); never fewer than the total less
     * the prompt.
     *
     * @param array<string, mixed> $usage
     */
    private function sortie(array $usage): int
    {
        $sortie = (int) ($usage['completion_tokens'] ?? 0);
        if ($this->fournisseur === 'xai') {
            $sortie += (int) ($usage['completion_tokens_details']['reasoning_tokens'] ?? 0);
        }
        if (isset($usage['total_tokens'], $usage['prompt_tokens'])) {
            $sortie = max($sortie, (int) $usage['total_tokens'] - (int) $usage['prompt_tokens']);
        }

        return max(0, $sortie);
    }

    /** A message's text: a string, or its `text` blocks (Mistral), never a thinking block. */
    private static function texte(mixed $contenu): string
    {
        if (\is_string($contenu)) {
            return $contenu;
        }
        $texte = '';
        foreach (\is_array($contenu) ? $contenu : [] as $bloc) {
            if (\is_array($bloc) && ($bloc['type'] ?? null) === 'text' && \is_string($bloc['text'] ?? null)) {
                $texte .= $bloc['text'];
            }
        }

        return $texte;
    }
}
