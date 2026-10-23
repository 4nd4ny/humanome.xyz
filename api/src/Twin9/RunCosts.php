<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Etablissement\GrandLivreLocal;
use Humanome\Etablissement\PlafondAtteintException;
use Humanome\Twin9\Fournisseurs\Fournisseurs;
use PDO;
use stdClass;

/**
 * What a Twin9 run costs, and where it stops (Twin_v9's docs/plan-twin9-php.md,
 * lot 2, T10; ADR-010 §3, ADR-011 §6).
 *
 * - Before a call leaves, directly or in a batch, its worst case is held: its
 *   prompt's bytes as input tokens (a tokenizer never makes more tokens than
 *   there are bytes), its output budget as output tokens, at its model's
 *   price — the long prompt tier above it, half price in a batch —, the
 *   margin included with the instance's key. With the instance's key it is
 *   debited from its owner's credits, conditionally (CreditService); with
 *   either key it counts against the run's budget. A call keeps it from one
 *   attempt to the next.
 * - Another provider than Anthropic (ADR-012 §6): its model's grid entry,
 *   « provider:model », says the caps its worst case counts — its prompt's
 *   bytes and a fixed overhead of the provider (Fournisseurs::REGISTRE,
 *   `surcout_entree`) in, its output budget and the entry's
 *   `plafond_reflexion` out (xAI leaves the reasoning out of its output
 *   cap; Mistral and OpenRouter do not say they count it) —, never by
 *   batches. Without its caps, it has no price.
 * - Its outcome settles it: the real cost, from the usage the provider
 *   returns, stays; the rest goes back. Never more than the call held: a
 *   real cost beyond it is counted (`depassements`), logged with its model
 *   and the amounts, and the instance pays the excess — never its owner's
 *   credit, nor their budget (impute()); another provider's model is then
 *   marked « pire cas insuffisant » for the administrator, and refused at
 *   launch until its caps change (Twin9Config::marquerPireCasInsuffisant()). A run stopped, cancelled or done
 *   gives back what its calls still hold, but for the calls of a batch still
 *   at Anthropic, settled once their batch is collected or cancelled.
 * - What a run has committed — the worst cases held, the costs settled as
 *   its owner pays them (impute()) — never exceeds its budget: a call whose worst case would go beyond it does
 *   not leave, nor any new one after it, and the run stops once nothing it
 *   sent is still out. Its owner's credit stops it the same way; its
 *   duration too, every call held back. The calls of its days never eat into
 *   what it keeps for its merge, nor its calls into what its owner's other
 *   runs in progress may still spend (T8, strategy A: Lancement::prevoir()).
 *
 * The ledger (twin9_credit_events) gets a reservation by call, and a
 * reconciliation or a refund by model each time calls are settled, with
 * their real tokens. Counters only, never content.
 *
 * Who pays (ADR-013 §3, §4, §6; RunPayeur): its owner, on their remaining
 * balance, at the instance's contribution; or its school, at the factor its
 * launch froze — 1 + its surtax on its credit (the instance's key), 1.0 on
 * its key (its provider bills it) —, each call's worst case held on the
 * learner's cap for the month, then on the school's credit, in the
 * transaction that writes the call (the schools' ledger, GrandLivreEcoles:
 * the cap's row first, then the credit's, then the calls'); settled in the
 * month it was taken (twin9_appels.mois_reserve), the school's events naming
 * the learner. A cap or a credit short stops the run the same way.
 */
final class RunCosts
{
    /** Why a run stops (twin9_runs.attente), as its page says it. */
    public const BUDGET = 'budget atteint : carte incomplète';

    public const DUREE = 'durée atteinte : carte incomplète';

    public const CREDIT = 'crédit insuffisant : carte incomplète';

    /**
     * A day's call would eat into the merge's reserve (T8, strategy A), of its
     * budget or of its owner's credit: the estimate of its days fell short.
     */
    public const RESERVE_BUDGET = 'budget atteint (fusion réservée) : carte incomplète';

    public const RESERVE_CREDIT = 'crédit insuffisant (fusion réservée) : carte incomplète';

    /** A call would eat into what its owner's other runs in progress may still spend (T8). */
    public const AUTRES = 'crédit insuffisant (engagé par vos autres analyses) : carte incomplète';

    /** The same, when a school pays (ADR-013 §4): its credit, the learner's cap for the month. */
    public const CREDIT_ECOLE = 'crédit de votre école insuffisant : carte incomplète';

    public const RESERVE_CREDIT_ECOLE = 'crédit de votre école insuffisant (fusion réservée) : carte incomplète';

    public const AUTRES_ECOLE = 'crédit de votre école insuffisant (engagé par d’autres analyses) : carte incomplète';

    public const PLAFOND = 'plafond de votre école atteint : carte incomplète';

    public const RESERVE_PLAFOND = 'plafond de votre école atteint (fusion réservée) : carte incomplète';

    private readonly CreditService $credits;

    public function __construct(private readonly PDO $pdo, private readonly Twin9Config $config)
    {
        $this->credits = new CreditService($pdo);
    }

    /**
     * A run's caps, from the copy of its profile: its budget in micro-USD,
     * and when its duration ends (unix time), counted from the start of its
     * current period; null: none.
     *
     * @return array{budget: int|null, limite: float|null}
     */
    public static function plafonds(stdClass $profil, float $debut): array
    {
        $budget = $profil->budget_usd ?? null;
        $duree = $profil->duree_minutes ?? null;

        return [
            'budget' => $budget === null ? null : (int) round((float) $budget * 1_000_000),
            'limite' => $duree === null ? null : $debut + 60.0 * (int) $duree,
        ];
    }

    /**
     * The worst case of a call, in micro-USD; null for a model without a price on this instance.
     *
     * @param bool|float $marge its price (RunPayeur::prix()): true the contribution, false the list price, a float
     *                          a school's factor
     */
    public function pireCas(string $fournisseur, string $modele, string $prompt, int $budgetSortie, bool $parLots,
                            bool|float $marge): ?int
    {
        return self::pireCasDe($this->config->read(), $fournisseur, $modele, \strlen($prompt), $budgetSortie,
            $parLots, $marge);
    }

    /**
     * The worst case of a call on a configuration already read
     * (Twin9Config::read()), in micro-USD: at Anthropic, its prompt's bytes
     * in and its output budget out, half price by batches; at another
     * provider, its bytes and the provider's overhead in, its budget and its
     * model's `plafond_reflexion` out, never by batches. Null for a model
     * without a price — at another provider, without its caps.
     *
     * @param array<string, mixed> $config
     * @param bool|float $marge as pireCas() takes it
     */
    public static function pireCasDe(array $config, string $fournisseur, string $modele, int $octets, int $budgetSortie,
                                     bool $parLots, bool|float $marge): ?int
    {
        if (!Fournisseurs::connu($fournisseur)) {
            return null;
        }
        $cle = Fournisseurs::clePrix($fournisseur, $modele);
        if ($fournisseur !== Fournisseurs::DEFAUT) {
            $entree = $config['modeles'][$cle] ?? null;
            if (!\is_array($entree) || !\is_int($entree['plafond_reflexion'] ?? null)) {
                return null;
            }
            $octets += (int) Fournisseurs::REGISTRE[$fournisseur]['surcout_entree'];
            $budgetSortie += $entree['plafond_reflexion'];
            $parLots = false;
        }
        $cout = Twin9Config::cout($config, $cle, max(0, $octets), max(0, $budgetSortie), 'twin9', $parLots,
            $marge !== false, \is_float($marge) ? $marge : null);

        return $cout === null ? null : max(1, $cout);
    }

    /**
     * The real cost of a call's outcome, in micro-USD; null for a model without a price.
     *
     * @param bool|float $marge as pireCas() takes it
     */
    public function cout(string $fournisseur, string $modele, int $tokensIn, int $tokensOut, bool $parLots,
                         bool|float $marge): ?int
    {
        return $this->config->coutMicrousd(Fournisseurs::clePrix($fournisseur, $modele), $tokensIn, $tokensOut,
            'twin9', $fournisseur === Fournisseurs::DEFAUT && $parLots, $marge !== false,
            \is_float($marge) ? $marge : null);
    }

    /**
     * What a run has committed: the worst cases its calls hold, the costs of
     * those settled as its owner pays them (impute()).
     */
    public function engage(int $runId): int
    {
        $stmt = $this->pdo->prepare(
            'SELECT COALESCE(SUM(' . self::impute('', $this->payeur($runId)?->reserve() ?? true) . '), 0)
               FROM twin9_appels WHERE run_id = ?'
        );
        $stmt->execute([$runId]);

        return (int) $stmt->fetchColumn();
    }

    /**
     * What a call weighs on its run's budget and its owner's credit, as an
     * SQL expression over twin9_appels ($a: the table's alias and its dot):
     * the worst case it holds; settled, its real cost — when a ledger held
     * it (the instance's key, or a learner's cap: RunPayeur::reserve()), at
     * most the worst case it held (pire_cas_microusd, its reserve: solder()
     * never debits beyond, the excess is the instance's). With a key of its
     * own ($credits false), its real cost, which its holder pays its
     * provider.
     */
    public static function impute(string $a = '', bool $credits = true): string
    {
        return 'COALESCE(' . $a . 'reserve_microusd, ' . self::facture($a, $credits) . ', 0)';
    }

    /**
     * What a call settled cost its owner, as an SQL expression over
     * twin9_appels (null before its outcome): with the instance's key, its
     * real cost at most the worst case it held; with their own key, its
     * real cost (impute()).
     */
    public static function facture(string $a = '', bool $credits = true): string
    {
        return $credits ? 'LEAST(' . $a . 'cout_microusd, COALESCE(' . $a . 'pire_cas_microusd, ' . $a . 'cout_microusd))'
            : $a . 'cout_microusd';
    }

    /** Who pays a run's calls, as its row says it (RunPayeur); null for a run not found. */
    public function payeur(int $runId): ?RunPayeur
    {
        $stmt = $this->pdo->prepare('SELECT user_id, reglages, payeur, payeur_id, facteur_prix FROM twin9_runs WHERE id = ?');
        $stmt->execute([$runId]);
        $row = $stmt->fetch();
        if ($row === false) {
            return null;
        }

        return RunPayeur::depuis($row, json_decode(RunRepository::uncompress((string) $row['reglages']), false, 512,
            JSON_THROW_ON_ERROR)->profil);
    }

    /**
     * The worst case of a call held before it leaves, in the caller's
     * transaction, which writes the call with it: its owner's credit on the
     * instance's key; its school's — the learner's cap for $mois first, then
     * the school's credit on the instance's key, the cap alone on the
     * school's key (ADR-013 §4). $modele labels it: its price key
     * (Fournisseurs::clePrix()).
     *
     * @param string $mois the UTC month of the reservation (Ecoles::mois()), which the call keeps
     * @throws SoldeInsuffisantException the credit does not cover it
     * @throws PlafondAtteintException the learner's cap for the month does not cover it
     */
    public function debiter(RunPayeur $payeur, int $runId, string $etape, string $modele, int $reserve,
                            string $mois): void
    {
        $libelle = self::libelle($runId, $etape . ' (réserve)');
        if ($payeur->ecole()) {
            if ($payeur->ecoleId !== null && $payeur->reserve()) {
                (new GrandLivreLocal($this->pdo))->reserver($payeur->ecoleId, $payeur->eleve(), $mois, $reserve,
                    $payeur->compte() !== null, $libelle, $modele);
            }

            return;
        }
        if ($payeur->compte() !== null) {
            $this->credits->debit($payeur->compte(), $reserve, $libelle, $modele);
        }
    }

    /**
     * The calls of a run that have their outcome settle what they hold.
     *
     * @return int the calls whose real cost went beyond what they held (depassements)
     */
    public function regler(int $runId): int
    {
        return $this->solder($runId, false);
    }

    /**
     * A run stopped, cancelled or done: what its calls still hold is settled,
     * at the real cost for those that have their outcome, given back entirely
     * for the others; a batch still at Anthropic keeps its calls'.
     *
     * @return int the calls whose real cost went beyond what they held (depassements)
     */
    public function liberer(int $runId): int
    {
        return $this->solder($runId, true);
    }

    /**
     * A run its owner cancels (the route, while a slice may hold it): what
     * its calls hold that no slice has in flight is settled at once — a
     * call waiting given back, an outcome at its real cost —; a call still
     * sent, direct or in a batch, keeps its worst case for the slice that
     * has it in flight, or for the next tick (Twin9Slice, Twin9Lots).
     *
     * @return int the calls whose real cost went beyond what they held (depassements)
     */
    public function libererHorsVol(int $runId): int
    {
        return $this->solder($runId, true, true);
    }

    /**
     * An account about to be erased (ADR-013 §7), in the purge's transaction,
     * before its runs go with it (CASCADE): what the calls of its runs that a
     * school pays for it still hold goes back to that school — a call
     * answered at its real cost, every other one entirely, those of a batch
     * still at Anthropic too, whose results will never be collected (the
     * batch itself goes to the tick, RunPurge::confier()). Without it, the
     * school's reservations would stay debited for good, and its ledger
     * without their counterpart. A run its owner pays, or a school for
     * itself, goes with the credit that paid it.
     *
     * @return int the calls whose real cost went beyond what they held (depassements)
     */
    public function rendreAvantLaPurge(int $userId): int
    {
        $stmt = $this->pdo->prepare(
            'SELECT id FROM twin9_runs
              WHERE user_id = ? AND payeur = "ecole" AND payeur_id IS NOT NULL AND payeur_id <> user_id ORDER BY id'
        );
        $stmt->execute([$userId]);
        $depassements = 0;
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $runId) {
            $depassements += $this->solder((int) $runId, true, false, true);
        }

        return $depassements;
    }

    /**
     * Settles what a run's calls hold: each call's real cost, at most what
     * it held — the excess is the instance's, counted and logged (the model
     * and the amounts only) —, the rest given back. $lots: the calls of a
     * batch still at Anthropic too (rendreAvantLaPurge()). In the caller's
     * transaction when one is open.
     */
    private function solder(int $runId, bool $tout, bool $horsVol = false, bool $lots = false): int
    {
        $payeur = $this->payeur($runId);
        if ($payeur === null) {
            return 0;
        }
        $grandLivre = new GrandLivreLocal($this->pdo);

        $own = !$this->pdo->inTransaction();
        if ($own) {
            $this->pdo->beginTransaction();
        }
        try {
            // the lock order of the schools' ledger: the learner's caps, then the credit, then the calls
            $grandLivre->verrouiller($payeur->ecoleId, $payeur->eleve(), $payeur->compte());
            $stmt = $this->pdo->prepare(
                // each call under its price key (Fournisseurs::clePrix()), as its reserve was debited
                'SELECT appel, statut, IF(fournisseur = "anthropic", COALESCE(modele_envoye, modele),
                        CONCAT(fournisseur, ":", COALESCE(modele_envoye, modele))) AS modele, reserve_microusd AS reserve,
                        COALESCE(cout_microusd, 0) AS cout, COALESCE(jetons_entree, 0) AS entree,
                        COALESCE(jetons_sortie, 0) AS sortie, mois_reserve AS mois
                   FROM twin9_appels
                  WHERE run_id = ? AND reserve_microusd IS NOT NULL
                    AND (statut IN ("repondu", "panne")'
                    . ($lots ? ' OR TRUE' : ($tout ? ($horsVol ? ' OR statut <> "envoye"'
                        : ' OR NOT (statut = "envoye" AND lot_id IS NOT NULL)') : '')) . ')
                  FOR UPDATE'
            );
            $stmt->execute([$runId]);
            $rendus = [];
            $appels = [];
            $depassements = [];
            foreach ($stmt->fetchAll() as $row) {
                $final = $row['statut'] === 'repondu' || $row['statut'] === 'panne';
                // by the month its reserve was taken in: a learner's cap is settled in it
                $cle = ($final ? 'réconciliation' : 'remboursement') . "\0" . $row['modele'] . "\0" . (string) $row['mois'];
                $reserve = (int) $row['reserve'];
                $cout = $final ? (int) $row['cout'] : 0;
                if ($cout > $reserve) {
                    // the worst case fell short (a third party's reasoning, a grid that changed): the instance pays
                    $depassements[] = [(string) $row['modele'], $cout - $reserve];
                    $cout = $reserve;
                }
                $rendus[$cle] ??= [0, 0, 0];
                $rendus[$cle][0] += $reserve - $cout;
                $rendus[$cle][1] += $final ? (int) $row['entree'] : 0;
                $rendus[$cle][2] += $final ? (int) $row['sortie'] : 0;
                $appels[] = (string) $row['appel'];
            }
            foreach (array_chunk($appels, 500) as $lot) {
                $this->pdo->prepare('UPDATE twin9_appels SET reserve_microusd = NULL WHERE run_id = ? AND appel IN ('
                    . implode(',', array_fill(0, \count($lot), '?')) . ')')->execute([$runId, ...$lot]);
            }
            ksort($rendus, SORT_STRING);
            foreach ($rendus as $cle => [$montant, $entree, $sortie]) {
                [$nature, $modele, $mois] = explode("\0", $cle, 3);
                if ($montant === 0) {
                    continue;
                }
                $tokensIn = $nature === 'réconciliation' ? $entree : null;
                $tokensOut = $nature === 'réconciliation' ? $sortie : null;
                if ($payeur->ecole()) {
                    // its school's: the learner's cap of the month it was taken in, and its credit on the instance's key
                    if ($payeur->ecoleId !== null) {
                        $grandLivre->regler($payeur->ecoleId, $mois === '' ? null : $payeur->eleve(), $mois, $montant,
                            $payeur->compte() !== null, self::libelle($runId, $nature), $modele, $tokensIn, $tokensOut);
                    }
                } elseif ($payeur->compte() !== null) {
                    $this->credits->adjust($payeur->compte(), $montant, self::libelle($runId, $nature), $modele,
                        $tokensIn, $tokensOut);
                }
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
        $parModele = [];
        foreach ($depassements as [$modele, $excedent]) {
            error_log(sprintf('[twin9-couts] run %d, %s : coût réel au-delà de la réserve de %d µUSD, payés par l’instance',
                $runId, $modele, $excedent));
            $parModele[$modele] = [max($excedent, $parModele[$modele][0] ?? 0), ($parModele[$modele][1] ?? 0) + 1];
        }
        // another provider's model whose worst case fell short: marked for the administrator, refused at launch
        // until its caps change (Twin9Config::marquerPireCasInsuffisant())
        foreach ($parModele as $modele => [$excedent, $appels]) {
            $this->config->marquerPireCasInsuffisant((string) $modele, $excedent, $appels);
        }

        return \count($depassements);
    }

    /** A ledger label: the run and what the event is, never content. */
    private static function libelle(int $runId, string $quoi): string
    {
        return 'Twin9 run ' . $runId . ' · ' . $quoi;
    }
}
