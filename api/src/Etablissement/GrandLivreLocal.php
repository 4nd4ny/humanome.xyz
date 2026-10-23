<?php

declare(strict_types=1);

namespace Humanome\Etablissement;

use Humanome\Twin9\CreditService;
use Humanome\Twin9\SoldeInsuffisantException;
use PDO;

/**
 * The schools' ledger on this server (ADR-013 §4, §9): the school's credit is
 * its twin9_credits row (CreditService: a conditional debit, one ledger event
 * per move, the learner named as its beneficiary), each learner's cap a row
 * of ecole_consommations per month.
 *
 * Lock order, everywhere: the cap's row, then the credit's, then the calls'
 * (RunCosts::solder() locks them so before the calls it settles), so that two
 * transactions never wait on each other in a cycle.
 */
final class GrandLivreLocal implements GrandLivreEcoles
{
    private readonly CreditService $credits;

    public function __construct(private readonly PDO $pdo)
    {
        $this->credits = new CreditService($pdo);
    }

    public function reserver(int $ecole, ?int $eleve, string $mois, int $montant, bool $credit, string $libelle,
                             ?string $modele = null): void
    {
        if ($montant <= 0) {
            throw new \InvalidArgumentException('reserver() amount must be > 0 micro-USD');
        }
        $own = !$this->pdo->inTransaction();
        if ($own) {
            $this->pdo->beginTransaction();
        }
        try {
            if ($eleve !== null) {
                // the month's row, locked exclusively at once (an INSERT IGNORE would take a shared lock on an existing
                // row, and two reservations upgrading theirs would deadlock)
                $this->pdo->prepare(
                    'INSERT INTO ecole_consommations (ecole_id, eleve_id, mois, engage_microusd) VALUES (?, ?, ?, 0)
                     ON DUPLICATE KEY UPDATE engage_microusd = engage_microusd'
                )->execute([$ecole, $eleve, $mois]);
                // the cap as the school sets it now, its default 0 without a row: nothing paid until it sets one
                $stmt = $this->pdo->prepare(
                    'UPDATE ecole_consommations
                        SET engage_microusd = engage_microusd + ?
                      WHERE ecole_id = ? AND eleve_id = ? AND mois = ?
                        AND engage_microusd + ? <= (SELECT COALESCE(MAX(e.plafond_eleve_microusd), 0) FROM ecoles e
                                                     WHERE e.user_id = ?)'
                );
                $stmt->execute([$montant, $ecole, $eleve, $mois, $montant, $ecole]);
                if ($stmt->rowCount() === 0) {
                    $reste = $this->reste($ecole, $eleve, $mois);
                    if ($own) {
                        $this->pdo->rollBack();
                    }

                    throw new PlafondAtteintException($reste, $montant);
                }
            }
            if ($credit) {
                // in this transaction: a short credit undoes the cap's hold with it (the caller's rollback, or ours)
                $this->credits->debit($ecole, $montant, $libelle, $modele, beneficiaire: $eleve);
            }
            if ($own) {
                $this->pdo->commit();
            }
        } catch (PlafondAtteintException $e) {
            throw $e;
        } catch (SoldeInsuffisantException $e) {
            if ($own && $this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        } catch (\Throwable $e) {
            if ($own && $this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    public function regler(int $ecole, ?int $eleve, string $mois, int $rendu, bool $credit, string $libelle,
                           ?string $modele = null, ?int $entree = null, ?int $sortie = null): void
    {
        if ($rendu === 0) {
            return;
        }
        $own = !$this->pdo->inTransaction();
        if ($own) {
            $this->pdo->beginTransaction();
        }
        try {
            if ($eleve !== null) {
                $this->pdo->prepare(
                    'UPDATE ecole_consommations SET engage_microusd = GREATEST(0, engage_microusd - ?)
                      WHERE ecole_id = ? AND eleve_id = ? AND mois = ?'
                )->execute([$rendu, $ecole, $eleve, $mois]);
            }
            if ($credit) {
                // a learner erased meanwhile (a call of the open cartography in flight while their account went): the
                // school gets its credit back all the same, the event naming no one — as the purge leaves the others
                // (SET NULL). Their row read in share mode: a purge under way finishes first.
                $this->credits->adjust($ecole, $rendu, $libelle, $modele, $entree, $sortie,
                    $eleve !== null && $this->existe($eleve) ? $eleve : null);
            }
            if ($own) {
                $this->pdo->commit();
            }
        } catch (\Throwable $e) {
            if ($own && $this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /** Whether an account is still there, its row held in share mode until the transaction ends. */
    private function existe(int $userId): bool
    {
        $stmt = $this->pdo->prepare('SELECT 1 FROM users WHERE id = ? FOR SHARE');
        $stmt->execute([$userId]);

        return $stmt->fetchColumn() !== false;
    }

    public function solde(int $ecole): int
    {
        return $this->credits->balance($ecole);
    }

    public function reste(int $ecole, int $eleve, string $mois): int
    {
        return (new Ecoles($this->pdo))->reste($ecole, $eleve, $mois);
    }

    /**
     * Locks, in the caller's transaction, the rows a settlement of $ecole's
     * reservations for $eleve will write — their caps', then the school's
     * credit's —, before the calls (the lock order above).
     */
    public function verrouiller(?int $ecole, ?int $eleve, ?int $compte): void
    {
        if ($ecole !== null && $eleve !== null) {
            $stmt = $this->pdo->prepare('SELECT mois FROM ecole_consommations WHERE ecole_id = ? AND eleve_id = ? FOR UPDATE');
            $stmt->execute([$ecole, $eleve]);
            $stmt->fetchAll();
        }
        if ($compte !== null) {
            $stmt = $this->pdo->prepare('SELECT balance_microusd FROM twin9_credits WHERE user_id = ? FOR UPDATE');
            $stmt->execute([$compte]);
            $stmt->fetchAll();
        }
    }
}
