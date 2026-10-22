<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Twin9\Fournisseurs\Arret;
use Humanome\Twin9\Fournisseurs\Fournisseurs;
use PDO;
use Twin9\Run\Call;
use Twin9\Run\Journal;

/**
 * The journal of a run's calls (ADR-011 §2, twin9_appels): written before
 * each call (its id, step, models, the SHA-256 of its prompt, its attempt)
 * and after (the response or the failure, tokens, cost, time, model served).
 * The engine reads the outcomes; the slice reads what is still to send.
 * Never the prompt, never the key.
 *
 * Loaded by parts, as the engine asks: the calls of a day together, the
 * merge's together, so that a day the memory gives back is never loaded.
 *
 * A call in a batch (T8) carries its batch and its custom_id, and stays sent
 * from slice to slice until its batch is collected.
 *
 * A call holds its worst case from the moment it leaves (T10, RunCosts): an
 * attempt that brings no outcome keeps it for the next, an outcome leaves it
 * for RunCosts to settle.
 *
 * The stop reason is kept raw, a short identifier only (Arret::assainir):
 * never a provider's text; it reads in its provider's table, which the
 * journal keeps with each call (P1-5), with the cuts the slice's end made
 * and since when it meets a spending cap.
 */
final class CallJournal implements Journal
{
    /** @var array<string, array<string, mixed>> the rows loaded, by call id */
    private array $rows = [];

    /** @var array<string, true> the parts loaded */
    private array $parts = [];

    public function __construct(private readonly PDO $pdo, private readonly int $runId)
    {
    }

    public function outcome(string $id): ?array
    {
        $row = $this->row($id);
        if ($row === null) {
            return null;
        }
        if ($row['statut'] === 'repondu') {
            $row['reponse'] ??= RunRepository::uncompress((string) $row['blob']);
            $this->rows[$id] = $row;

            return ['sha256' => $row['sha256'], 'response' => $row['reponse']];
        }
        if ($row['statut'] === 'panne') {
            return ['sha256' => $row['sha256'], 'failure' => (string) $row['panne']];
        }

        return null;
    }

    /**
     * Where a call stands: its status ('envoye', 'attente', 'repondu',
     * 'panne'), its prompt's SHA-256, its attempts, when it may leave again
     * and the worst case it holds (T10); null for a call never sent.
     *
     * @return array{statut: string, sha256: string, tentatives: int, reprise_at: float|null, reserve: int|null}|null
     */
    public function etat(string $id): ?array
    {
        $row = $this->row($id);

        return $row === null ? null : ['statut' => $row['statut'], 'sha256' => $row['sha256'],
                                       'tentatives' => $row['tentatives'], 'reprise_at' => $row['reprise_at'],
                                       'reserve' => $row['reserve']];
    }

    /**
     * Before a call leaves, directly or in a batch: its row, its provider,
     * its attempt counted, and the worst case it holds — $reserve, newly
     * held, or the one it already holds (null); a worst case newly held is
     * kept once settled (pire_cas_microusd), for its run's evaluation (T8).
     * Its cuts and the time it has met a spending cap are kept from one try
     * to the next.
     *
     * @param string $fournisseur its provider (CallSettings::pour()), an id of Fournisseurs::REGISTRE
     */
    public function envoye(Call $call, string $modele, int $tentative, ?int $lotId = null, ?string $customId = null,
                           ?int $reserve = null, string $fournisseur = Fournisseurs::DEFAUT): void
    {
        $this->pdo->prepare(
            'INSERT INTO twin9_appels (run_id, appel, etape, modele, modele_envoye, fournisseur, sha256, statut, lot_id,
                    custom_id, tentatives, reprise_at, reponse, panne, reserve_microusd, pire_cas_microusd, envoye_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, "envoye", ?, ?, ?, NULL, NULL, NULL, ?, ?, NOW(3))
             ON DUPLICATE KEY UPDATE etape = VALUES(etape), modele = VALUES(modele),
                    modele_envoye = VALUES(modele_envoye), fournisseur = VALUES(fournisseur), sha256 = VALUES(sha256),
                    statut = "envoye", lot_id = VALUES(lot_id), custom_id = VALUES(custom_id),
                    tentatives = VALUES(tentatives), reprise_at = NULL, reponse = NULL, panne = NULL,
                    reserve_microusd = COALESCE(VALUES(reserve_microusd), reserve_microusd),
                    pire_cas_microusd = COALESCE(VALUES(pire_cas_microusd), pire_cas_microusd), envoye_at = NOW(3)'
        )->execute([$this->runId, $call->id, $call->step, $call->model, $modele, $fournisseur, $call->sha256, $lotId,
                    $customId, $tentative, $reserve, $reserve]);
        $this->rows[$call->id] = ['statut' => 'envoye', 'sha256' => $call->sha256, 'tentatives' => $tentative,
                                  'reprise_at' => null, 'panne' => null, 'blob' => null, 'reponse' => null,
                                  'reserve' => $reserve ?? $this->rows[$call->id]['reserve'] ?? null];
    }

    /**
     * After: the response.
     *
     * @param array{modele_servi?: string|null, stop_reason?: string, tokens_in?: int, tokens_out?: int,
     *              cout_microusd?: int|null, duree_ms?: int} $mesure
     */
    public function repondu(Call $call, string $reponse, array $mesure): void
    {
        $this->apres($call->id, 'repondu', $mesure, $reponse, null);
        $this->rows[$call->id] = ['statut' => 'repondu', 'sha256' => $call->sha256,
                                  'tentatives' => $this->rows[$call->id]['tentatives'] ?? 1, 'reprise_at' => null,
                                  'panne' => null, 'blob' => null, 'reponse' => $reponse,
                                  'reserve' => $this->rows[$call->id]['reserve'] ?? null];
    }

    /**
     * After: a failure, which the engine sees as the v9.8 sees a call failed
     * after its attempts.
     *
     * @param array<string, mixed> $mesure
     */
    public function panne(Call $call, string $raison, array $mesure = []): void
    {
        $this->apres($call->id, 'panne', $mesure, null, $raison);
        $this->rows[$call->id] = ['statut' => 'panne', 'sha256' => $call->sha256,
                                  'tentatives' => $this->rows[$call->id]['tentatives'] ?? 1, 'reprise_at' => null,
                                  'panne' => $raison, 'blob' => null, 'reponse' => null,
                                  'reserve' => $this->rows[$call->id]['reserve'] ?? null];
    }

    /**
     * After: the call leaves again later, its attempts as given — cut by
     * the slice's end ($coupe), counted among its cuts. It no longer meets a
     * spending cap.
     */
    public function plusTard(Call $call, float $repriseAt, int $tentatives, bool $coupe = false): void
    {
        $this->pdo->prepare(
            'UPDATE twin9_appels SET statut = "attente", tentatives = ?, reprise_at = FROM_UNIXTIME(?),
                    plafond_depuis = NULL, coupures = coupures + ?
              WHERE run_id = ? AND appel = ?'
        )->execute([$tentatives, sprintf('%.3F', $repriseAt), $coupe ? 1 : 0, $this->runId, $call->id]);
        $this->attendre($call, $repriseAt, $tentatives);
    }

    /**
     * After: the call met its provider's spending cap (a 402, a quota
     * spent, at Anthropic a 429 without Retry-After): it leaves again later,
     * its attempts as given, and the time it has met the cap since its first
     * refusal is kept from one try to the next.
     *
     * @return float the seconds since it first met the cap, by the database's clock
     */
    public function plafond(Call $call, float $repriseAt, int $tentatives): float
    {
        $this->pdo->prepare(
            'UPDATE twin9_appels SET statut = "attente", tentatives = ?, reprise_at = FROM_UNIXTIME(?),
                    plafond_depuis = COALESCE(plafond_depuis, NOW(3))
              WHERE run_id = ? AND appel = ?'
        )->execute([$tentatives, sprintf('%.3F', $repriseAt), $this->runId, $call->id]);
        $this->attendre($call, $repriseAt, $tentatives);
        $stmt = $this->pdo->prepare(
            'SELECT TIMESTAMPDIFF(MICROSECOND, plafond_depuis, NOW(3)) FROM twin9_appels WHERE run_id = ? AND appel = ?'
        );
        $stmt->execute([$this->runId, $call->id]);

        return max(0.0, (float) $stmt->fetchColumn() / 1_000_000);
    }

    /** The row of a call that waits, as the journal keeps it until it is read again. */
    private function attendre(Call $call, float $repriseAt, int $tentatives): void
    {
        $this->rows[$call->id] = ['statut' => 'attente', 'sha256' => $call->sha256, 'tentatives' => $tentatives,
                                  'reprise_at' => $repriseAt, 'panne' => null, 'blob' => null, 'reponse' => null,
                                  'reserve' => $this->rows[$call->id]['reserve'] ?? null];
    }

    /**
     * The direct calls a tick left sent without an outcome, which died with
     * it: each leaves again, its attempt counted; its last attempt spent, it
     * fails. A call in a batch waits for its batch. Called before the journal
     * is read.
     *
     * @return int the calls taken up again
     */
    public function reprendreLesCoupes(int $tentativesMax): int
    {
        $this->pdo->prepare(
            'UPDATE twin9_appels SET statut = "panne", panne = "délai dépassé : le tick s\'est arrêté pendant l\'appel",
                    repondu_at = NOW(3)
              WHERE run_id = ? AND statut = "envoye" AND lot_id IS NULL AND tentatives >= ?'
        )->execute([$this->runId, $tentativesMax]);
        $stmt = $this->pdo->prepare(
            'UPDATE twin9_appels SET statut = "attente", reprise_at = FROM_UNIXTIME(?)
              WHERE run_id = ? AND statut = "envoye" AND lot_id IS NULL'
        );
        $stmt->execute([sprintf('%.3F', microtime(true)), $this->runId]);
        $this->oublier();

        return $stmt->rowCount();
    }

    /**
     * The calls of a batch, by custom_id: each with its id, its prompt's
     * SHA-256, its attempts, its status and the model it was sent to.
     *
     * @return array<string, array{appel: string, sha256: string, tentatives: int, statut: string, modele: string}>
     */
    public function duLot(int $lotId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT appel, custom_id, sha256, tentatives, statut, COALESCE(modele_envoye, modele) AS modele
               FROM twin9_appels WHERE run_id = ? AND lot_id = ?'
        );
        $stmt->execute([$this->runId, $lotId]);
        $appels = [];
        foreach ($stmt->fetchAll() as $row) {
            $appels[(string) $row['custom_id']] = ['appel' => (string) $row['appel'], 'sha256' => (string) $row['sha256'],
                                                   'tentatives' => (int) $row['tentatives'],
                                                   'statut' => (string) $row['statut'], 'modele' => (string) $row['modele']];
        }

        return $appels;
    }

    /**
     * A batch collected: one of its calls answered.
     *
     * @param array<string, mixed> $mesure
     */
    public function reponseDuLot(string $appel, string $reponse, array $mesure): void
    {
        $this->apres($appel, 'repondu', $mesure, $reponse, null);
        $this->invalider($appel);
    }

    /**
     * A batch collected: one of its calls failed.
     *
     * @param array<string, mixed> $mesure
     */
    public function panneDuLot(string $appel, string $raison, array $mesure = []): void
    {
        $this->apres($appel, 'panne', $mesure, null, $raison);
        $this->invalider($appel);
    }

    /** A call of a batch leaves again in a next one, its attempts as given. */
    public function aResoumettre(string $appel, int $tentatives): void
    {
        $this->pdo->prepare(
            'UPDATE twin9_appels SET statut = "attente", tentatives = ?, reprise_at = NOW(3) WHERE run_id = ? AND appel = ?'
        )->execute([max(0, $tentatives), $this->runId, $appel]);
        $this->invalider($appel);
    }

    /**
     * A batch that did not leave, or that left without its answers: its
     * calls still sent wait again, their attempt given back.
     *
     * @return int the calls given back
     */
    public function rendreLeLot(int $lotId): int
    {
        $stmt = $this->pdo->prepare(
            'UPDATE twin9_appels SET statut = "attente", tentatives = GREATEST(tentatives, 1) - 1, reprise_at = NOW(3),
                    lot_id = NULL
              WHERE run_id = ? AND lot_id = ? AND statut = "envoye"'
        );
        $stmt->execute([$this->runId, $lotId]);
        $this->oublier();

        return $stmt->rowCount();
    }

    /** Rows written elsewhere: the journal is read again. */
    public function oublier(): void
    {
        $this->rows = [];
        $this->parts = [];
    }

    /** A row written without what the cache keeps of it: read again when asked. */
    private function invalider(string $appel): void
    {
        unset($this->rows[$appel], $this->parts[self::part($appel)]);
    }

    /** @param array<string, mixed> $mesure */
    private function apres(string $id, string $statut, array $mesure, ?string $reponse, ?string $panne): void
    {
        $this->pdo->prepare(
            'UPDATE twin9_appels SET statut = ?, reponse = ?, panne = ?, modele_servi = ?, stop_reason = ?,
                    jetons_entree = ?, jetons_sortie = ?, cout_microusd = ?, duree_ms = ?, reprise_at = NULL,
                    plafond_depuis = NULL, repondu_at = NOW(3)
              WHERE run_id = ? AND appel = ?'
        )->execute([
            $statut,
            $reponse === null ? null : RunRepository::compress($reponse),
            $panne === null ? null : mb_substr($panne, 0, 255),
            isset($mesure['modele_servi']) ? mb_substr((string) $mesure['modele_servi'], 0, 80) : null,
            isset($mesure['stop_reason']) ? Arret::assainir((string) $mesure['stop_reason']) : null,
            $mesure['tokens_in'] ?? null,
            $mesure['tokens_out'] ?? null,
            $mesure['cout_microusd'] ?? null,
            $mesure['duree_ms'] ?? null,
            $this->runId,
            $id,
        ]);
    }

    /** @return array<string, mixed>|null */
    private function row(string $id): ?array
    {
        $part = self::part($id);
        if (!isset($this->parts[$part])) {
            $this->load($part);
        }

        return $this->rows[$id] ?? null;
    }

    /** The part of the journal a call belongs to: its day ("journees/<day>/"), or the merge's (""). */
    private static function part(string $id): string
    {
        return preg_match('#^journees/[^/]+/#', $id, $m) === 1 ? $m[0] : '';
    }

    private function load(string $part): void
    {
        $sql = 'SELECT appel, statut, sha256, tentatives, UNIX_TIMESTAMP(reprise_at) AS reprise_at, panne, reponse,
                       reserve_microusd
                  FROM twin9_appels WHERE run_id = ? AND ';
        if ($part === '') {
            $stmt = $this->pdo->prepare($sql . 'LEFT(appel, 9) <> "journees/"');
            $stmt->execute([$this->runId]);
        } else {
            $stmt = $this->pdo->prepare($sql . 'LEFT(appel, CHAR_LENGTH(?)) = ?');
            $stmt->execute([$this->runId, $part, $part]);
        }
        foreach ($stmt->fetchAll() as $row) {
            $id = (string) $row['appel'];
            if (isset($this->rows[$id])) {
                continue; // written by this slice: newer than the table read
            }
            $this->rows[$id] = [
                'statut' => (string) $row['statut'],
                'sha256' => (string) $row['sha256'],
                'tentatives' => (int) $row['tentatives'],
                'reprise_at' => $row['reprise_at'] === null ? null : (float) $row['reprise_at'],
                'panne' => $row['panne'],
                'blob' => $row['reponse'],
                'reponse' => null,
                'reserve' => $row['reserve_microusd'] === null ? null : (int) $row['reserve_microusd'],
            ];
        }
        $this->parts[$part] = true;
    }
}
