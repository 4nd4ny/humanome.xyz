<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Etablissement\EcoleCles;
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
 * - Those of a learner submitted with their school's key (ADR-013 §6): the
 *   same, the school kept with the id, so that the tick reads its key.
 * - A school erased, or its key withdrawn (retirerCleEcole()): the batches
 *   submitted with its key — its learners' runs' and its own —, cancelled
 *   and deleted while its key is there, as a personal key's are
 *   (lotsEcole()); the tick then gives back what their calls held, no key
 *   being left to collect them (Twin9Lots).
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
     * Before the account goes, or its key (UserKeysPurge): its batches
     * submitted with its own key, cancelled and deleted at Anthropic while
     * the key is there, until $fin. Each one gone from Anthropic — deleted,
     * or no longer known there — is marked so (`supprime`), its calls given
     * back: what is left is still there, for restants() to say.
     */
    public function lotsPersonnels(int $userId, float $fin): void
    {
        $lots = $this->lignes($userId, 'personnelle');
        $master = KeyVault::masterKeyFromEnv();
        if ($lots === [] || $master === null) {
            return;
        }
        $partis = $this->annulerEtEffacer(array_column($lots, 'lot'),
            (new KeyVault($this->pdo, $master))->reveal($userId, 'anthropic'), $fin);
        foreach ($lots as $lot) {
            if (\in_array($lot['lot'], $partis, true)) {
                // its calls given back as CallJournal::rendreLeLot() does — without the engine, which neither the
                // account's route nor the purge script loads
                $this->pdo->prepare(
                    'UPDATE twin9_appels SET statut = "attente", tentatives = GREATEST(tentatives, 1) - 1,
                            reprise_at = NOW(3), lot_id = NULL
                      WHERE run_id = ? AND lot_id = ? AND statut = "envoye"'
                )->execute([$lot['run_id'], $lot['id']]);
                $this->pdo->prepare('UPDATE twin9_lots SET statut = "supprime", fini_at = COALESCE(fini_at, NOW(3))
                                      WHERE id = ?')->execute([$lot['id']]);
            }
        }
    }

    /**
     * How many batches of an account, submitted with its own key, may still
     * be at Anthropic (known by their id, not marked gone): its key stays as
     * long as there is one, the only key that can delete it (ADR-013 §8,
     * step 4; UserKeysPurge).
     */
    public function restants(int $userId): int
    {
        return \count($this->lignes($userId, 'personnelle'));
    }

    /**
     * Before a school's account goes (ADR-013 §6): the batches submitted with
     * its key — of its learners' runs it paid, of its own —, cancelled and
     * deleted at Anthropic while the key is there, until $fin.
     */
    public function lotsEcole(int $ecoleId, float $fin): void
    {
        $stmt = $this->pdo->prepare(
            'SELECT l.lot FROM twin9_lots l JOIN twin9_runs r ON r.id = l.run_id
              WHERE r.payeur = "ecole" AND r.payeur_id = ? AND l.cle = "ecole" AND l.lot IS NOT NULL
                AND l.statut <> "supprime" ORDER BY l.id'
        );
        $stmt->execute([$ecoleId]);
        $lots = array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN));
        $master = KeyVault::masterKeyFromEnv();
        if ($lots === [] || $master === null) {
            return;
        }
        $this->annulerEtEffacer($lots, (new EcoleCles($this->pdo, $master))->lire($ecoleId), $fin);
    }

    /**
     * A school's key withdrawn — by the school, or with its habilitation
     * (ADR-013 §6): the batches submitted with it, cancelled and deleted at
     * Anthropic while it is there (lotsEcole(), until $fin), then the key
     * erased. A batch no key can collect afterwards is lost for the tick,
     * which gives its calls back (Twin9Lots). $fournisseur null: every key of
     * the school.
     *
     * @return list<string> the providers whose key was erased
     */
    public function retirerCleEcole(int $ecoleId, ?string $fournisseur, float $fin): array
    {
        $stmt = $this->pdo->prepare('SELECT fournisseur FROM ecole_cles WHERE ecole_id = ? ORDER BY fournisseur');
        $stmt->execute([$ecoleId]);
        $fournisseurs = array_values(array_filter(array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN)),
            static fn (string $f): bool => $fournisseur === null || $f === $fournisseur));
        if (\in_array('anthropic', $fournisseurs, true)) {
            $this->lotsEcole($ecoleId, $fin);
        }

        return array_values(array_filter($fournisseurs,
            fn (string $f): bool => EcoleCles::retirer($this->pdo, $ecoleId, $f)));
    }

    /**
     * Anthropic ids, cancelled then deleted with $cle, until $fin.
     *
     * @param list<string> $lots
     * @return list<string> those gone from Anthropic: deleted, or no longer known there (404, erased 29 days after
     *                      their creation at the latest) — never one unreachable, still cancelling, or left for want
     *                      of time
     */
    private function annulerEtEffacer(array $lots, ?string $cle, float $fin): array
    {
        if ($cle === null) {
            return [];
        }
        $api = $this->api ?? new AnthropicBatches(LlmRuntime::httpClient());
        $partis = [];
        foreach ($lots as $lot) {
            if (microtime(true) >= $fin) {
                break;
            }
            $etat = $api->etat($cle, $lot, $fin);
            if (!$etat['ok']) {
                if (($etat['http'] ?? null) === 404) {
                    $partis[] = $lot; // gone already
                }
                continue; // else unreachable: still there for what humanome knows
            }
            if (($etat['lot']['processing_status'] ?? '') !== 'ended') {
                $api->annuler($cle, $lot, $fin);
                $etat = $api->etat($cle, $lot, $fin);
                if (!$etat['ok'] || ($etat['lot']['processing_status'] ?? '') !== 'ended') {
                    continue;
                }
            }
            if ($api->supprimer($cle, $lot, $fin)['ok']) {
                $partis[] = $lot;
            }
        }

        return $partis;
    }

    /**
     * With the account, in its purge's transaction: its batches submitted
     * with the instance's key, for the tick — and those submitted with its
     * school's key, the school kept with them (ADR-013 §6).
     */
    public function confier(int $userId): void
    {
        $this->pdo->prepare(
            'INSERT IGNORE INTO twin9_lots_a_effacer (lot, ecole_id)
             SELECT l.lot, IF(l.cle = "ecole", r.payeur_id, NULL) FROM twin9_lots l JOIN twin9_runs r ON r.id = l.run_id
              WHERE r.user_id = ? AND l.lot IS NOT NULL AND l.statut <> "supprime"
                AND (l.cle = "instance" OR (l.cle = "ecole" AND r.payeur_id IS NOT NULL AND r.payeur_id <> r.user_id))'
        )->execute([$userId]);
    }

    /** @return list<array{id: int, run_id: int, lot: string}> an account's batches still there, submitted with this key */
    private function lignes(int $userId, string $cle): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT l.id, l.run_id, l.lot FROM twin9_lots l JOIN twin9_runs r ON r.id = l.run_id
              WHERE r.user_id = ? AND l.cle = ? AND l.lot IS NOT NULL AND l.statut <> "supprime" ORDER BY l.id'
        );
        $stmt->execute([$userId, $cle]);

        return array_map(static fn (array $l): array => ['id' => (int) $l['id'], 'run_id' => (int) $l['run_id'],
                                                         'lot' => (string) $l['lot']], $stmt->fetchAll());
    }
}
