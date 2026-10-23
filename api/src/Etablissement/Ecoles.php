<?php

declare(strict_types=1);

namespace Humanome\Etablissement;

use PDO;

/**
 * What a school settles for its learners (ADR-013 §3, lot S6b): the surtax
 * it pays on the instance's key, the cap each of its learners may commit in
 * a month, and who its learners are.
 *
 * - The school is the account that holds the `etablissement` habilitation
 *   (Ecole::est(), read from the database: a habilitation withdrawn applies
 *   at once). Its settings live in `ecoles` (migration 037), one row written
 *   at its first write; without one, the defaults: a surtax of 3.50 %, a cap
 *   of 0 — nothing paid for its learners until it sets one.
 * - The surtax is chosen by the school between 3.50 % (the fees of Stripe and
 *   PayPal) and 10 %, to the hundredth (R4). It applies on the instance's key
 *   only: the real cost × (1 + surtax), instead of the contribution of
 *   private persons. On its own key, the school pays its provider and
 *   nothing to the platform (factor 1.0).
 * - Its learners are the members of its cohorts (cohorte_membres ->
 *   cohortes.etablissement_id), the row being their consent; the school
 *   itself is its own payer, without a cap.
 * - The month is UTC ('YYYY-MM', gmdate), the clock of the ledger of the
 *   credits offered (S7a), never MySQL's.
 */
final class Ecoles
{
    public const SURTAXE_MIN = 3.5;

    public const SURTAXE_MAX = 10.0;

    public const SURTAXE_DEFAUT = 3.5;

    /** A cap per learner and per month, at most: 100,000 $ (a typing error, not a policy). */
    public const PLAFOND_MAX_MICROUSD = 100_000_000_000;

    public const SURTAXE_INVALIDE = 'Surtaxe invalide : un pourcentage entre 3,5 et 10, au centième';

    public const PLAFOND_INVALIDE = 'Plafond par élève invalide : un montant en dollars, de 0 à 100 000, au centième';

    public function __construct(private readonly PDO $pdo)
    {
    }

    /** The UTC month of a moment ('YYYY-MM'): that of a reservation, settled in it. */
    public static function mois(?int $instant = null): string
    {
        return gmdate('Y-m', $instant ?? time());
    }

    /**
     * A surtax as a request gives it, checked: a number between 3.5 and 10,
     * to the hundredth; null when it is not one.
     */
    public static function surtaxe(mixed $valeur): ?float
    {
        if (!\is_int($valeur) && !\is_float($valeur)) {
            return null;
        }
        $valeur = (float) $valeur;
        if (!is_finite($valeur) || $valeur < self::SURTAXE_MIN || $valeur > self::SURTAXE_MAX
            || abs($valeur * 100 - round($valeur * 100)) > 1e-9) {
            return null;
        }

        return round($valeur, 2);
    }

    /**
     * A cap per learner as a request gives it, in dollars to the cent:
     * micro-USD, or null when it is not one.
     */
    public static function plafond(mixed $valeur): ?int
    {
        if (!\is_int($valeur) && !\is_float($valeur)) {
            return null;
        }
        $valeur = (float) $valeur;
        if (!is_finite($valeur) || $valeur < 0 || abs($valeur * 100 - round($valeur * 100)) > 1e-9) {
            return null;
        }
        $microusd = (int) round($valeur * 100) * 10_000;

        return $microusd > self::PLAFOND_MAX_MICROUSD ? null : $microusd;
    }

    /**
     * A school's settings, its defaults without a row.
     *
     * @return array{surtaxe_pct: float, plafond_eleve_microusd: int, respire_numero: int|null}
     */
    public function reglages(int $ecoleId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT surtaxe_pct, plafond_eleve_microusd, respire_numero FROM ecoles WHERE user_id = ?'
        );
        $stmt->execute([$ecoleId]);
        $row = $stmt->fetch();
        if ($row === false) {
            return ['surtaxe_pct' => self::SURTAXE_DEFAUT, 'plafond_eleve_microusd' => 0, 'respire_numero' => null];
        }

        return [
            'surtaxe_pct' => (float) $row['surtaxe_pct'],
            'plafond_eleve_microusd' => (int) $row['plafond_eleve_microusd'],
            'respire_numero' => $row['respire_numero'] === null ? null : (int) $row['respire_numero'],
        ];
    }

    /**
     * The school sets its surtax and its cap per learner (checked by
     * surtaxe() and plafond()); its row is written at its first write. A run
     * in progress keeps the surtax of its launch.
     *
     * @return array{surtaxe_pct: float, plafond_eleve_microusd: int, respire_numero: int|null}
     */
    public function regler(int $ecoleId, float $surtaxe, int $plafondMicrousd): array
    {
        if (self::surtaxe($surtaxe) === null) {
            throw new \InvalidArgumentException(self::SURTAXE_INVALIDE);
        }
        if ($plafondMicrousd < 0 || $plafondMicrousd > self::PLAFOND_MAX_MICROUSD) {
            throw new \InvalidArgumentException(self::PLAFOND_INVALIDE);
        }
        $this->pdo->prepare(
            'INSERT INTO ecoles (user_id, surtaxe_pct, plafond_eleve_microusd) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE surtaxe_pct = VALUES(surtaxe_pct),
                                     plafond_eleve_microusd = VALUES(plafond_eleve_microusd)'
        )->execute([$ecoleId, number_format($surtaxe, 2, '.', ''), $plafondMicrousd]);

        return $this->reglages($ecoleId);
    }

    /**
     * The price factor of a school's run, frozen at its launch: 1 + its
     * surtax on the instance's key, paid from its credit; 1.0 on its own key,
     * which it pays its provider.
     *
     * @param string $cle the lane: "instance" or "ecole"
     */
    public function facteur(int $ecoleId, string $cle): float
    {
        return $cle === 'ecole' ? 1.0 : round(1 + $this->reglages($ecoleId)['surtaxe_pct'] / 100, 4);
    }

    /**
     * The schools that pay for an account: the accounts holding the
     * `etablissement` habilitation one of whose cohorts counts it among its
     * members, and itself when it is a school — then first.
     *
     * @return list<array{id: int, nom: string, soi: bool}>
     */
    public function de(int $userId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT u.id, u.display_name FROM users u
              WHERE u.id IN (SELECT c.etablissement_id FROM cohorte_membres m JOIN cohortes c ON c.id = m.cohorte_id
                              WHERE m.user_id = ?
                             UNION SELECT ?)
                AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                             WHERE ur.user_id = u.id AND r.name = ?)
              ORDER BY u.id = ? DESC, u.id'
        );
        $stmt->execute([$userId, $userId, Ecole::HABILITATION, $userId]);

        return array_map(static fn (array $row): array => [
            'id' => (int) $row['id'],
            'nom' => (string) $row['display_name'],
            'soi' => (int) $row['id'] === $userId,
        ], $stmt->fetchAll());
    }

    /**
     * Whether a school still pays for an account: it holds the habilitation,
     * and the account is itself or a member of one of its cohorts.
     */
    public function paiePour(int $ecoleId, int $userId): bool
    {
        foreach ($this->de($userId) as $ecole) {
            if ($ecole['id'] === $ecoleId) {
                return true;
            }
        }

        return false;
    }

    /** What a learner has committed of a school's credit or key in a month, in micro-USD. */
    public function engage(int $ecoleId, int $eleveId, string $mois): int
    {
        $stmt = $this->pdo->prepare(
            'SELECT engage_microusd FROM ecole_consommations WHERE ecole_id = ? AND eleve_id = ? AND mois = ?'
        );
        $stmt->execute([$ecoleId, $eleveId, $mois]);
        $engage = $stmt->fetchColumn();

        return $engage === false ? 0 : max(0, (int) $engage);
    }

    /** What remains of a learner's cap in a month, in micro-USD. */
    public function reste(int $ecoleId, int $eleveId, string $mois): int
    {
        return max(0, $this->reglages($ecoleId)['plafond_eleve_microusd'] - $this->engage($ecoleId, $eleveId, $mois));
    }

    /**
     * The school's learners, as its page lists them: each member of its
     * cohorts, once, with their cohorts, what they committed this month and
     * in all (amounts only, ADR-013 §7). A learner who left its cohorts —
     * their consent withdrawn (registre §9) — is no longer named: their
     * amounts count among those who left (partis()), without a name nor an
     * id; back in a cohort, they are named again, with their months.
     *
     * @return list<array{userId: int, displayName: string, cohortes: list<string>, membre: bool,
     *                    moisMicrousd: int, totalMicrousd: int}>
     */
    public function eleves(int $ecoleId, string $mois): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT u.id, u.display_name,
                    (SELECT GROUP_CONCAT(c.nom ORDER BY c.id SEPARATOR "\n") FROM cohorte_membres m
                       JOIN cohortes c ON c.id = m.cohorte_id
                      WHERE m.user_id = u.id AND c.etablissement_id = ?) AS cohortes,
                    COALESCE((SELECT SUM(GREATEST(0, e.engage_microusd)) FROM ecole_consommations e
                               WHERE e.ecole_id = ? AND e.eleve_id = u.id AND e.mois = ?), 0) AS mois,
                    COALESCE((SELECT SUM(GREATEST(0, e.engage_microusd)) FROM ecole_consommations e
                               WHERE e.ecole_id = ? AND e.eleve_id = u.id), 0) AS total
               FROM users u
              WHERE u.id IN (SELECT m.user_id FROM cohorte_membres m JOIN cohortes c ON c.id = m.cohorte_id
                              WHERE c.etablissement_id = ?)
              ORDER BY u.display_name, u.id'
        );
        $stmt->execute([$ecoleId, $ecoleId, $mois, $ecoleId, $ecoleId]);

        return array_map(static fn (array $row): array => [
            'userId' => (int) $row['id'],
            'displayName' => (string) $row['display_name'],
            'cohortes' => $row['cohortes'] === null ? [] : explode("\n", (string) $row['cohortes']),
            'membre' => $row['cohortes'] !== null,
            'moisMicrousd' => (int) $row['mois'],
            'totalMicrousd' => (int) $row['total'],
        ], $stmt->fetchAll());
    }

    /**
     * What the learners who left its cohorts committed, together — how many
     * they are, this month and in all —, never who: their consent withdrawn,
     * the school keeps its totals, not their names (ADR-013 §7, registre §6
     * ter). Their rows stay, for the cap of the month (a learner who comes
     * back finds it as it was), until their account or the school goes.
     *
     * @return array{nombre: int, moisMicrousd: int, totalMicrousd: int}
     */
    public function partis(int $ecoleId, string $mois): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT COUNT(DISTINCT e.eleve_id), COALESCE(SUM(IF(e.mois = ?, GREATEST(0, e.engage_microusd), 0)), 0),
                    COALESCE(SUM(GREATEST(0, e.engage_microusd)), 0)
               FROM ecole_consommations e
              WHERE e.ecole_id = ? AND e.eleve_id <> e.ecole_id
                AND NOT EXISTS (SELECT 1 FROM cohorte_membres m JOIN cohortes c ON c.id = m.cohorte_id
                                 WHERE c.etablissement_id = e.ecole_id AND m.user_id = e.eleve_id)'
        );
        $stmt->execute([$mois, $ecoleId]);
        [$nombre, $moisMicrousd, $total] = array_map('intval', $stmt->fetch(PDO::FETCH_NUM));

        return ['nombre' => $nombre, 'moisMicrousd' => $moisMicrousd, 'totalMicrousd' => $total];
    }
}
