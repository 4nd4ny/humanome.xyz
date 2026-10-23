<?php

declare(strict_types=1);

namespace Humanome\Etablissement;

use Humanome\Twin9\SoldeInsuffisantException;

/**
 * The ledger of the schools (ADR-013 §4, §9): what a school pays for its
 * learners — its credit, on the instance's key, and the cap of each learner,
 * on either key. The seam where lot S6c, a ledger shared with EduChat on its
 * server, will plug in: reserve, settle, balance, what remains of a cap.
 * Its only implementation is local (GrandLivreLocal: the credit of the
 * school's account and ecole_consommations); nothing here calls another
 * server. S6c would reserve a run's allocation there at its launch, and
 * keep these per-call reservations local within it (ADR-013 §9).
 *
 * Amounts are integer micro-USD. $eleve is the learner whose cap counts —
 * null for a school paying for itself, which has no cap —; $credit says
 * whether the school's credit pays (the instance's key) or not (its own key:
 * the cap alone). $mois is the UTC month of the reservation ('YYYY-MM',
 * Ecoles::mois()), in which it is settled.
 */
interface GrandLivreEcoles
{
    /**
     * Holds $montant, atomically: the learner's cap first (a conditional
     * update of their row of the month, locked first), then the school's
     * credit (a conditional debit). Either one short: nothing is held.
     * Joins the caller's transaction when one is open — that which writes
     * the call —, and leaves its commit or rollback to it.
     *
     * @throws PlafondAtteintException the learner's cap for the month does not cover it
     * @throws SoldeInsuffisantException the school's credit does not cover it
     */
    public function reserver(int $ecole, ?int $eleve, string $mois, int $montant, bool $credit, string $libelle,
                             ?string $modele = null): void;

    /**
     * Gives back $rendu of what was held in $mois (the worst case less the
     * real cost; all of it for a call that never cost), on the cap and, with
     * $credit, on the school's credit, with the real tokens for a
     * reconciliation. Signed: a negative amount takes more (never done by
     * the runs, whose excess is the instance's). In the caller's transaction
     * when one is open.
     */
    public function regler(int $ecole, ?int $eleve, string $mois, int $rendu, bool $credit, string $libelle,
                           ?string $modele = null, ?int $entree = null, ?int $sortie = null): void;

    /** The school's credit, in micro-USD. */
    public function solde(int $ecole): int;

    /** What remains of a learner's cap in a month, in micro-USD. */
    public function reste(int $ecole, int $eleve, string $mois): int;
}
