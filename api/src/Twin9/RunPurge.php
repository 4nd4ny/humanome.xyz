<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Keys\KeyVault;
use Humanome\Llm\LlmRuntime;
use PDO;

/**
 * An account erased takes its Twin9 runs with it (T10, ADR-011 §5): its
 * runs, their journals and outputs, its maps and their memory go with the
 * account (CASCADE); its batches still at Anthropic are cancelled, then
 * deleted there.
 *
 * - Those submitted with the account's own key, before the key goes with
 *   it: cancelled, and deleted once ended. One still cancelling when the
 *   account goes stays at Anthropic until Anthropic erases it, 29 days after
 *   its creation at the latest (docs/confidentialite.md).
 * - Those submitted with the instance's key: their Anthropic ids alone go to
 *   twin9_lots_a_effacer, in the purge's transaction; the tick cancels and
 *   deletes them (Twin9Lots).
 *
 * A batch whose submission went unanswered (no id known yet) is out of
 * reach: Anthropic erases it at the latest 29 days after its creation.
 */
final class RunPurge
{
    public function __construct(private readonly PDO $pdo, private readonly ?BatchApi $api = null)
    {
    }

    /**
     * Before the account goes: its batches submitted with its own key,
     * cancelled and deleted at Anthropic while the key is there, until $fin.
     */
    public function lotsPersonnels(int $userId, float $fin): void
    {
        $lots = $this->lots($userId, 'personnelle');
        $master = KeyVault::masterKeyFromEnv();
        if ($lots === [] || $master === null) {
            return;
        }
        $cle = (new KeyVault($this->pdo, $master))->reveal($userId, 'anthropic');
        if ($cle === null) {
            return;
        }
        $api = $this->api ?? new AnthropicBatches(LlmRuntime::httpClient());
        foreach ($lots as $lot) {
            if (microtime(true) >= $fin) {
                return;
            }
            $etat = $api->etat($cle, $lot, $fin);
            if (!$etat['ok']) {
                continue; // gone, or unreachable
            }
            if (($etat['lot']['processing_status'] ?? '') !== 'ended') {
                $api->annuler($cle, $lot, $fin);
                $etat = $api->etat($cle, $lot, $fin);
                if (!$etat['ok'] || ($etat['lot']['processing_status'] ?? '') !== 'ended') {
                    continue;
                }
            }
            $api->supprimer($cle, $lot, $fin);
        }
    }

    /** With the account, in its purge's transaction: its batches submitted with the instance's key, for the tick. */
    public function confier(int $userId): void
    {
        $this->pdo->prepare(
            'INSERT IGNORE INTO twin9_lots_a_effacer (lot)
             SELECT l.lot FROM twin9_lots l JOIN twin9_runs r ON r.id = l.run_id
              WHERE r.user_id = ? AND l.cle = "instance" AND l.lot IS NOT NULL AND l.statut <> "supprime"'
        )->execute([$userId]);
    }

    /** @return list<string> the Anthropic ids of an account's batches still there, submitted with this key */
    private function lots(int $userId, string $cle): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT l.lot FROM twin9_lots l JOIN twin9_runs r ON r.id = l.run_id
              WHERE r.user_id = ? AND l.cle = ? AND l.lot IS NOT NULL AND l.statut <> "supprime" ORDER BY l.id'
        );
        $stmt->execute([$userId, $cle]);

        return array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }
}
