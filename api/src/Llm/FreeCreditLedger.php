<?php

declare(strict_types=1);

namespace Humanome\Llm;

use PDO;

/**
 * The monthly ledger of the credits the instance offers (sprint 7, S7a;
 * table free_credit_monthly, migration 034): one row per UTC month, every
 * free call together — what the instance pays without billing anyone, POST
 * /api/llm (the Essayer, the Twin6 trial, the « Service humanome », the
 * prompt bench) and POST /api/tuteur. A call paid by a bought credit, a
 * personal key or a school's key never comes here (Christian, by
 * delegation, 2026-10-22).
 *
 * « La somme totale des crédits offerts par mois ne doit pas dépasser
 * 20 USD » : each free call RESERVES its worst case before it leaves, on top
 * of its daily budget (UsageCounters), then settles it to its real cost, or
 * gives it back when the provider bills nothing. The reservation is one
 * conditional UPDATE of the month's row, which InnoDB locks: concurrent calls
 * reserve one after the other, so together they never pass the cap. Nothing
 * ever checks the cap again once a call has left: an answer in progress is
 * never cut, and a real cost beyond its reservation is counted as it is.
 *
 * The month is UTC, like the daily budgets' day (gmdate, never MySQL's
 * CURDATE()/NOW(), which follow the server's local time): it opens on the
 * 1st at 00:00 UTC, 01:00 or 02:00 in Paris. A call settles or gives back in
 * the month it reserved in ($now taken once, when it starts). Amounts in
 * integer micro-USD. COUNTERS ONLY: no content, no user (cahier §6.5).
 */
final class FreeCreditLedger
{
    /** The cap when no layer sets one (Christian, TODO sprint 7: 20 USD a month). */
    public const DEFAULT_CAP_USD = 20.0;

    /** The refusal's code, beside its message, on POST /api/llm and POST /api/tuteur. */
    public const REFUSAL_CODE = 'offerts_epuises';

    private const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
        'septembre', 'octobre', 'novembre', 'décembre'];

    public function __construct(private readonly PDO $pdo)
    {
    }

    /** A cost in micro-USD, rounded up (never below what it costs); 0 for nothing. */
    public static function microusd(float $usd): int
    {
        return $usd > 0 ? (int) ceil(round($usd * 1_000_000, 6)) : 0;
    }

    /**
     * Reserves a call's worst case under the month's cap, atomically, before
     * it leaves: false, and nothing reserved, when the spent amount, the
     * reservations in flight and this one together would pass the cap (the
     * refusal is counted). At least one micro-USD: a reservation of nothing
     * would change no row, and read as a refusal.
     *
     * @param int $microusd the call's worst case
     * @param int $capMicrousd the month's cap (capMicrousd())
     */
    public function reserve(int $microusd, int $capMicrousd, ?int $now = null): bool
    {
        $month = self::month($now);
        $microusd = max(1, $microusd);
        $this->pdo->prepare(
            'INSERT INTO free_credit_monthly (month) VALUES (?) ON DUPLICATE KEY UPDATE month = month'
        )->execute([$month]);
        $stmt = $this->pdo->prepare(
            'UPDATE free_credit_monthly SET reserved_microusd = reserved_microusd + ?
             WHERE month = ? AND spent_microusd + reserved_microusd + ? <= ?'
        );
        $stmt->execute([$microusd, $month, $microusd, $capMicrousd]);
        if ($stmt->rowCount() === 1) {
            return true;
        }
        $this->pdo->prepare('UPDATE free_credit_monthly SET refusals = refusals + 1 WHERE month = ?')
            ->execute([$month]);

        return false;
    }

    /** Counts a refusal decided before any reservation: the month already spent (the tutor's first check). */
    public function refuse(?int $now = null): void
    {
        $month = self::month($now);
        $this->pdo->prepare(
            'INSERT INTO free_credit_monthly (month, refusals) VALUES (?, 1) ON DUPLICATE KEY UPDATE refusals = refusals + 1'
        )->execute([$month]);
    }

    /**
     * Replaces a reservation with the call's real cost, and counts the call.
     * Unconditional: the call has been answered, whatever the cap says now.
     */
    public function settle(int $reservedMicrousd, int $costMicrousd, ?int $now = null): void
    {
        $this->giveBack(max(1, $reservedMicrousd), max(0, $costMicrousd), 1, $now);
    }

    /** Gives a reservation back: the call did not leave, or the provider refused it and bills nothing. */
    public function release(int $reservedMicrousd, ?int $now = null): void
    {
        $this->giveBack(max(1, $reservedMicrousd), 0, 0, $now);
    }

    /**
     * The month's figures, for the administrator and the status booleans.
     *
     * @return array{month: string, capMicrousd: int, spentMicrousd: int, reservedMicrousd: int,
     *   remainingMicrousd: int, calls: int, refusals: int, exhausted: bool}
     */
    public function state(int $capMicrousd, ?int $now = null): array
    {
        $month = self::month($now);
        $stmt = $this->pdo->prepare(
            'SELECT spent_microusd, reserved_microusd, calls, refusals FROM free_credit_monthly WHERE month = ?'
        );
        $stmt->execute([$month]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
        $spent = (int) ($row['spent_microusd'] ?? 0);
        $reserved = (int) ($row['reserved_microusd'] ?? 0);

        return [
            'month' => $month,
            'capMicrousd' => $capMicrousd,
            'spentMicrousd' => $spent,
            'reservedMicrousd' => $reserved,
            'remainingMicrousd' => max(0, $capMicrousd - $spent - $reserved),
            'calls' => (int) ($row['calls'] ?? 0),
            'refusals' => (int) ($row['refusals'] ?? 0),
            'exhausted' => $spent + $reserved >= $capMicrousd,
        ];
    }

    /**
     * Whether a NEW sign-up is still taken (sprint 7, S7a-2): what the month
     * has SPENT leaves at least the floor — the smallest worst case an
     * Essayer call reserves (Auth\Waitlist::floorMicrousd) — under the cap.
     * Below it, no free call of the Essayer can pass any more, even with
     * nothing in flight, and a new account waits for the next month
     * (« Après, mettre les inscriptions sur liste d'attente »).
     *
     * The reservations in flight do not count: a sign-up's fate is decided
     * once, and a call that settles cheaply a moment later would have
     * waitlisted it for nothing. A cap of 0 waitlists every sign-up.
     */
    public function signupsOpen(int $capMicrousd, int $floorMicrousd, ?int $now = null): bool
    {
        $stmt = $this->pdo->prepare('SELECT spent_microusd FROM free_credit_monthly WHERE month = ?');
        $stmt->execute([self::month($now)]);
        $spent = (int) ($stmt->fetchColumn() ?: 0);

        return $capMicrousd - $spent >= max(1, $floorMicrousd);
    }

    /** The cap in micro-USD; a negative or non-finite one closes everything. */
    public static function capMicrousd(float $capUsd): int
    {
        return is_finite($capUsd) && $capUsd > 0 ? (int) round($capUsd * 1_000_000) : 0;
    }

    /** The UTC month 'YYYY-MM' of a time (now by default). */
    public static function month(?int $now = null): string
    {
        return gmdate('Y-m', $now ?? time());
    }

    /**
     * The refusal, in the words decided (« les crédits offerts de ce mois
     * sont épuisés ; revenez le 1er »), with the next month named: « Les
     * crédits offerts de ce mois sont épuisés ; revenez le 1er novembre. »
     */
    public static function refusalMessage(?int $now = null): string
    {
        return 'Les crédits offerts de ce mois sont épuisés ; revenez le ' . self::nextMonthLabel($now) . '.';
    }

    /** « 1er novembre »: the first day of the next UTC month, in French. */
    public static function nextMonthLabel(?int $now = null): string
    {
        $next = (int) gmdate('n', $now ?? time()) % 12; // 0-based index of the next month

        return '1er ' . self::MOIS[$next];
    }

    private function giveBack(int $reservedMicrousd, int $costMicrousd, int $calls, ?int $now): void
    {
        // GREATEST keeps the unsigned column from underflowing should the
        // month's row no longer hold the reservation.
        $this->pdo->prepare(
            'UPDATE free_credit_monthly
             SET reserved_microusd = GREATEST(reserved_microusd, ?) - ?,
                 spent_microusd = spent_microusd + ?,
                 calls = calls + ?
             WHERE month = ?'
        )->execute([$reservedMicrousd, $reservedMicrousd, $costMicrousd, $calls, self::month($now)]);
    }
}
