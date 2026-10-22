<?php

declare(strict_types=1);

namespace Humanome\Twin9;

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
 *   credit. A run stopped, cancelled or done gives back what its calls
 *   still hold, but for the calls of a batch still at Anthropic, settled
 *   once their batch is collected or cancelled.
 * - What a run has committed — the worst cases held, the real costs settled —
 *   never exceeds its budget: a call whose worst case would go beyond it does
 *   not leave, nor any new one after it, and the run stops once nothing it
 *   sent is still out. Its owner's credit stops it the same way; its
 *   duration too, every call held back. The calls of its days never eat into
 *   what it keeps for its merge, nor its calls into what its owner's other
 *   runs in progress may still spend (T8, strategy A: Lancement::prevoir()).
 *
 * The ledger (twin9_credit_events) gets a reservation by call, and a
 * reconciliation or a refund by model each time calls are settled, with
 * their real tokens. Counters only, never content.
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

    /** The worst case of a call, in micro-USD; null for a model without a price on this instance. */
    public function pireCas(string $fournisseur, string $modele, string $prompt, int $budgetSortie, bool $parLots,
                            bool $marge): ?int
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
     */
    public static function pireCasDe(array $config, string $fournisseur, string $modele, int $octets, int $budgetSortie,
                                     bool $parLots, bool $marge): ?int
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
        $cout = Twin9Config::cout($config, $cle, max(0, $octets), max(0, $budgetSortie), 'twin9', $parLots, $marge);

        return $cout === null ? null : max(1, $cout);
    }

    /** The real cost of a call's outcome, in micro-USD; null for a model without a price. */
    public function cout(string $fournisseur, string $modele, int $tokensIn, int $tokensOut, bool $parLots,
                         bool $marge): ?int
    {
        return $this->config->coutMicrousd(Fournisseurs::clePrix($fournisseur, $modele), $tokensIn, $tokensOut,
            'twin9', $fournisseur === Fournisseurs::DEFAUT && $parLots, $marge);
    }

    /** What a run has committed: the worst cases its calls hold, the real costs of those settled. */
    public function engage(int $runId): int
    {
        $stmt = $this->pdo->prepare(
            'SELECT COALESCE(SUM(COALESCE(reserve_microusd, cout_microusd, 0)), 0) FROM twin9_appels WHERE run_id = ?'
        );
        $stmt->execute([$runId]);

        return (int) $stmt->fetchColumn();
    }

    /**
     * The worst case of a call debited from its owner's credits, before it
     * leaves with the instance's key; in the caller's transaction, which
     * writes the call with it. $modele labels it: its price key
     * (Fournisseurs::clePrix()).
     *
     * @throws SoldeInsuffisantException the credit does not cover it
     */
    public function debiter(int $userId, int $runId, string $etape, string $modele, int $reserve): void
    {
        $this->credits->debit($userId, $reserve, self::libelle($runId, $etape . ' (réserve)'), $modele);
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
     * Settles what a run's calls hold: each call's real cost, at most what
     * it held — the excess is the instance's, counted and logged (the model
     * and the amounts only) —, the rest given back.
     */
    private function solder(int $runId, bool $tout): int
    {
        $stmt = $this->pdo->prepare('SELECT user_id, reglages FROM twin9_runs WHERE id = ?');
        $stmt->execute([$runId]);
        $run = $stmt->fetch();
        if ($run === false) {
            return 0;
        }
        $credits = (json_decode(RunRepository::uncompress((string) $run['reglages']), false, 512,
            JSON_THROW_ON_ERROR)->profil->cle ?? 'instance') === 'instance';

        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare(
                'SELECT appel, statut, COALESCE(modele_envoye, modele) AS modele, reserve_microusd AS reserve,
                        COALESCE(cout_microusd, 0) AS cout, COALESCE(jetons_entree, 0) AS entree,
                        COALESCE(jetons_sortie, 0) AS sortie
                   FROM twin9_appels
                  WHERE run_id = ? AND reserve_microusd IS NOT NULL
                    AND (statut IN ("repondu", "panne")'
                    . ($tout ? ' OR NOT (statut = "envoye" AND lot_id IS NOT NULL)' : '') . ')
                  FOR UPDATE'
            );
            $stmt->execute([$runId]);
            $rendus = [];
            $appels = [];
            $depassements = [];
            foreach ($stmt->fetchAll() as $row) {
                $final = $row['statut'] === 'repondu' || $row['statut'] === 'panne';
                $cle = ($final ? 'réconciliation' : 'remboursement') . "\0" . $row['modele'];
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
            if ($credits) {
                ksort($rendus, SORT_STRING);
                foreach ($rendus as $cle => [$montant, $entree, $sortie]) {
                    [$nature, $modele] = explode("\0", $cle, 2);
                    if ($montant !== 0) {
                        $this->credits->adjust((int) $run['user_id'], $montant,
                            self::libelle($runId, $nature), $modele,
                            $nature === 'réconciliation' ? $entree : null,
                            $nature === 'réconciliation' ? $sortie : null);
                    }
                }
            }
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
        foreach ($depassements as [$modele, $excedent]) {
            error_log(sprintf('[twin9-couts] run %d, %s : coût réel au-delà de la réserve de %d µUSD, payés par l’instance',
                $runId, $modele, $excedent));
        }

        return \count($depassements);
    }

    /** A ledger label: the run and what the event is, never content. */
    private static function libelle(int $runId, string $quoi): string
    {
        return 'Twin9 run ' . $runId . ' · ' . $quoi;
    }
}
