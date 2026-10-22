<?php

declare(strict_types=1);

namespace Humanome\Twin9\Fournisseurs;

/**
 * Twin9's calls to Google's Gemini API, `generateContent`, not streamed
 * (ADR-012 §4; facts read on Google's documentation, 2026-10-22).
 *
 * The request: at the locked address, the model in its path (its id has
 * neither « / » nor « : », rawurlencode'd all the same), the key in the
 * `x-goog-api-key` header only; the prompt as the one user content; the
 * output budget as `generationConfig.maxOutputTokens` (the thinking
 * included; 32,768 at most per non-streamed request, which the grid's
 * plafond_sortie bounds); `thinkingConfig.thinkingLevel` only when the
 * model's grid entry names one (reflexion_param), under `generationConfig`;
 * and `store: false` at the top level, which takes precedence over a
 * project's logging. The instance's key must be a paid one: Google's terms
 * allow only paid services for an application offered in the EEA.
 *
 * The response: the first candidate's parts, those of the model's thought
 * (`thought: true`) left out; its finishReason classed by Arret —
 * CONTINUATION, a non-streamed answer cut at the request's cap, is a cut
 * like MAX_TOKENS —; a prompt blocked (`promptFeedback.blockReason`, no
 * candidate) a refusal. Output tokens are those billed: the candidates'
 * and the thoughts'. A 402 is a cap, never retried at once, though it shares
 * its status RESOURCE_EXHAUSTED with a 429: the HTTP code decides.
 */
final class GeminiAppelant implements Appelant
{
    public function fournisseur(): string
    {
        return 'google';
    }

    public function requete(string $cle, array $reglage, string $prompt): array
    {
        $generation = ['maxOutputTokens' => $reglage['budget_sortie']];
        $param = $reglage['reflexion_param'] ?? null;
        if (\is_string($param) && $param !== '') {
            $generation['thinkingConfig'] = ['thinkingLevel' => $param];
        }
        $corps = [
            'contents' => [['role' => 'user', 'parts' => [['text' => $prompt]]]],
            'generationConfig' => $generation,
            'store' => false,
        ];

        return [
            'url' => Fournisseurs::REGISTRE['google']['url'] . rawurlencode($reglage['modele']) . ':generateContent',
            'headers' => ['x-goog-api-key' => $cle, 'content-type' => 'application/json'],
            'body' => json_encode($corps, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ];
    }

    public function lire(int $status, array $headers, string $body): array
    {
        if ($status < 200 || $status >= 300) {
            return Reponses::refus('google', $status, $headers);
        }
        $data = json_decode($body, true);
        if (!\is_array($data)) {
            return Reponses::illisible('google');
        }
        if (!isset($data['candidates']) && isset($data['error'])) {
            return Reponses::erreurDansLaReponse('google');
        }
        $usage = \is_array($data['usageMetadata'] ?? null) ? $data['usageMetadata'] : [];
        $bloque = \is_array($data['promptFeedback'] ?? null) ? ($data['promptFeedback']['blockReason'] ?? null) : null;
        $candidat = \is_array($data['candidates'] ?? null) ? ($data['candidates'][0] ?? null) : null;
        $fin = \is_array($candidat) && \is_string($candidat['finishReason'] ?? null) ? $candidat['finishReason'] : null;
        $lu = [
            'tokens_in' => (int) ($usage['promptTokenCount'] ?? 0),
            'tokens_out' => max(0, (int) ($usage['candidatesTokenCount'] ?? 0) + (int) ($usage['thoughtsTokenCount'] ?? 0)),
            'stop_reason' => Arret::assainir($fin),
            'arret' => Arret::classe('google', $fin),
            'modele_servi' => Reponses::modele($data['modelVersion'] ?? null),
        ];
        if ($bloque !== null && $bloque !== '') {
            return ['ok' => false, 'refus' => true, 'texte' => '',
                    'erreur' => 'prompt bloqué par Google (Gemini)'] + $lu;
        }
        if (!\is_array($candidat)) {
            return Reponses::illisible('google');
        }
        $texte = '';
        $parts = \is_array($candidat['content'] ?? null) ? ($candidat['content']['parts'] ?? []) : [];
        foreach (\is_array($parts) ? $parts : [] as $part) {
            if (\is_array($part) && ($part['thought'] ?? false) !== true && \is_string($part['text'] ?? null)) {
                $texte .= $part['text'];
            }
        }

        return Reponses::issue('google', $texte, $lu);
    }
}
