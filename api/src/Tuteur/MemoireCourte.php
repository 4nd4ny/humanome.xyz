<?php

declare(strict_types=1);

namespace Humanome\Tuteur;

/**
 * Sprint 11, lot C: the tutor's short memory. The panel keeps the
 * conversation in the tab (sessionStorage) and sends its last two exchanges
 * with each question, so that a follow-up (« et ensuite ? ») keeps its
 * context; the server stores none of it (UC-VIS-05 RG3).
 *
 * What the client sends is untrusted. Only a question immediately followed by
 * its answer makes an exchange: roles `user` then `assistant`, non-empty
 * text; any other role (`system` included), any other shape, an unanswered
 * question (a failed call leaves one in the tab) breaks the pair and is
 * dropped. The last two exchanges are kept, each message cut to 750
 * characters, the oldest exchange dropped while the whole exceeds 1,500. They
 * become earlier turns of the conversation (the request's `messages`), never
 * part of the system prompt.
 *
 * The browser applies the same rule (web/src/lib/tuteur.js, memoireCourte),
 * on the same vectors (api/tests/fixtures/tuteur/memoire-courte.json): what
 * an honest panel sends is never cut here.
 */
final class MemoireCourte
{
    /** Exchanges kept: a question and its answer each. */
    public const ECHANGES = 2;

    /** Characters (code points) of all the kept messages together. */
    public const MAX_CARACTERES = 1500;

    /** Characters of one message: an exchange always fits in the whole. */
    public const MAX_PAR_MESSAGE = 750;

    /** Items read from the end of what was sent: two exchanges among strays. */
    private const LUS = 16;

    /**
     * @param mixed $historique the request's `historique`: [{role, text}, …]
     * @return list<array{role: 'user'|'assistant', content: string}>
     */
    public static function borner(mixed $historique): array
    {
        if (!\is_array($historique) || !array_is_list($historique)) {
            return [];
        }
        $echanges = [];
        $question = null;
        foreach (\array_slice($historique, -self::LUS) as $message) {
            $role = \is_array($message) ? ($message['role'] ?? null) : null;
            $texte = \is_array($message) && \is_string($message['text'] ?? null) ? trim($message['text']) : '';
            if ($texte === '' || ($role !== 'user' && $role !== 'assistant')) {
                $question = null;
            } elseif ($role === 'user') {
                $question = $texte;
            } elseif ($question !== null) {
                $echanges[] = [self::couper($question), self::couper($texte)];
                $question = null;
            }
        }
        $echanges = \array_slice($echanges, -self::ECHANGES);
        while (\count($echanges) > 1 && self::longueur($echanges) > self::MAX_CARACTERES) {
            array_shift($echanges);
        }

        $messages = [];
        foreach ($echanges as [$question, $reponse]) {
            $messages[] = ['role' => 'user', 'content' => $question];
            $messages[] = ['role' => 'assistant', 'content' => $reponse];
        }

        return $messages;
    }

    private static function couper(string $texte): string
    {
        return mb_strlen($texte) > self::MAX_PAR_MESSAGE
            ? mb_substr($texte, 0, self::MAX_PAR_MESSAGE - 1) . '…'
            : $texte;
    }

    /** @param list<array{0: string, 1: string}> $echanges */
    private static function longueur(array $echanges): int
    {
        $total = 0;
        foreach ($echanges as [$question, $reponse]) {
            $total += mb_strlen($question) + mb_strlen($reponse);
        }

        return $total;
    }
}
