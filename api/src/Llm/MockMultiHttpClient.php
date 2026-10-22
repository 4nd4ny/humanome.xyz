<?php

declare(strict_types=1);

namespace Humanome\Llm;

use Humanome\Twin9\Fournisseurs\Fournisseurs;

/**
 * Simulated providers for the Twin9 runs of a local instance
 * (WORKER_PROVIDER=mock, like the mass worker's mock): every request to a
 * provider's locked address (Fournisseurs::REGISTRE) is answered at once, in
 * that provider's format — Anthropic's Messages, Chat Completions, Gemini's
 * generateContent —, with a fixed text and the usage its prompt would count.
 * A request to any other address fails. Never in production — no key
 * leaves, nothing is analysed: it lets a run go to its end without an API
 * (end-to-end tests, with the fake engine).
 */
final class MockMultiHttpClient implements MultiHttpClient
{
    public const TEXTE = 'Réponse simulée.';

    /** @var array<string, array{status: int, headers: array<string, string>, body: string}|HttpClientException> */
    private array $faits = [];

    public function start(string $id, string $method, string $url, array $headers, ?string $body,
                          float $timeoutSeconds): void
    {
        $format = null;
        foreach (Fournisseurs::REGISTRE as $fournisseur) {
            if (str_starts_with($url, $fournisseur['url'])) {
                $format = $fournisseur['format'];
                break;
            }
        }
        if ($format === null) {
            $this->faits[$id] = new HttpClientException('simulated providers: unknown address');

            return;
        }
        $requete = json_decode((string) $body, true) ?: [];
        $contenu = $format === 'gemini'
            ? ($requete['contents'][0]['parts'][0]['text'] ?? '')
            : ($requete['messages'][0]['content'] ?? '');
        $prompt = \is_string($contenu) ? $contenu : (string) json_encode($contenu);
        $entree = max(1, intdiv(mb_strlen($prompt), 4));
        $simule = 'simule_' . substr(hash('sha256', $id), 0, 12);
        $reponse = match ($format) {
            'anthropic' => [
                'id' => 'msg_' . $simule,
                'type' => 'message',
                'role' => 'assistant',
                'model' => (string) ($requete['model'] ?? 'simule'),
                'stop_reason' => 'end_turn',
                'content' => [['type' => 'text', 'text' => self::TEXTE]],
                'usage' => ['input_tokens' => $entree, 'output_tokens' => 4],
            ],
            'chat' => [
                'id' => 'chatcmpl_' . $simule,
                'object' => 'chat.completion',
                'model' => (string) ($requete['model'] ?? 'simule'),
                'choices' => [['index' => 0, 'message' => ['role' => 'assistant', 'content' => self::TEXTE],
                               'finish_reason' => 'stop']],
                'usage' => ['prompt_tokens' => $entree, 'completion_tokens' => 4, 'total_tokens' => $entree + 4],
            ],
            'gemini' => [
                'candidates' => [['content' => ['role' => 'model', 'parts' => [['text' => self::TEXTE]]],
                                  'finishReason' => 'STOP']],
                'usageMetadata' => ['promptTokenCount' => $entree, 'candidatesTokenCount' => 4,
                                    'totalTokenCount' => $entree + 4],
                'modelVersion' => 'simule',
            ],
        };
        $this->faits[$id] = ['status' => 200, 'headers' => [],
                             'body' => json_encode($reponse, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE)];
    }

    public function wait(float $deadline): array
    {
        $faits = $this->faits;
        $this->faits = [];

        return $faits;
    }

    public function abort(): array
    {
        $coupes = array_keys($this->faits);
        $this->faits = [];

        return array_map('strval', $coupes);
    }

    public function running(): int
    {
        return \count($this->faits);
    }
}
