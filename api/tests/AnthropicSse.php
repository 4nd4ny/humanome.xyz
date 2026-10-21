<?php

declare(strict_types=1);

namespace Humanome\Tests;

/** The server-sent events of a streamed Anthropic answer, for the fakes (2026-10-21). */
final class AnthropicSse
{
    /** @param array<string, mixed> $data */
    public static function evenement(string $type, array $data): string
    {
        return 'event: ' . $type . "\ndata: "
            . json_encode(['type' => $type] + $data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE) . "\n\n";
    }

    /**
     * The beginning of an answer: message_start, the content block's start,
     * then its content in $morceaux deltas — text, or the forced tool's JSON.
     *
     * @return list<string>
     */
    public static function debut(string $contenu, int $entree, string $modele = 'claude-sonnet-5', bool $outil = false,
                                 int $morceaux = 3): array
    {
        $chunks = [
            self::evenement('message_start', ['message' => [
                'id' => 'msg_flux', 'type' => 'message', 'role' => 'assistant', 'content' => [], 'model' => $modele,
                'stop_reason' => null, 'usage' => ['input_tokens' => $entree, 'output_tokens' => 1],
            ]]),
            self::evenement('content_block_start', ['index' => 0, 'content_block' => $outil
                ? ['type' => 'tool_use', 'id' => 'toolu_flux', 'name' => 'emettre_document', 'input' => new \stdClass()]
                : ['type' => 'text', 'text' => '']]),
        ];
        foreach (self::decouper($contenu, $morceaux) as $morceau) {
            $chunks[] = self::evenement('content_block_delta', ['index' => 0, 'delta' => $outil
                ? ['type' => 'input_json_delta', 'partial_json' => $morceau]
                : ['type' => 'text_delta', 'text' => $morceau]]);
        }

        return $chunks;
    }

    /**
     * A whole answer: debut(), then the block's end, message_delta (stop
     * reason, cumulative output tokens) and message_stop.
     *
     * @return list<string>
     */
    public static function complet(string $contenu, int $entree, int $sortie, string $modele = 'claude-sonnet-5',
                                   string $arret = 'end_turn', bool $outil = false, int $morceaux = 3): array
    {
        return [
            ...self::debut($contenu, $entree, $modele, $outil, $morceaux),
            self::evenement('content_block_stop', ['index' => 0]),
            self::evenement('message_delta', ['delta' => ['stop_reason' => $arret, 'stop_sequence' => null],
                'usage' => ['output_tokens' => $sortie]]),
            self::evenement('message_stop', []),
        ];
    }

    /** @return list<string> */
    private static function decouper(string $texte, int $morceaux): array
    {
        if ($texte === '') {
            return [''];
        }
        $caracteres = mb_str_split($texte, 1, 'UTF-8');
        $taille = max(1, (int) ceil(\count($caracteres) / max(1, $morceaux)));

        return array_map(static fn (array $c): string => implode('', $c), array_chunk($caracteres, $taille));
    }
}
