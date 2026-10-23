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
 * Each reservation in flight is also a dated row (free_credit_reservations,
 * independent review of 2026-10-23): a process that dies before settling —
 * the host's kill, a redeploy, a fatal error — would otherwise hold its worst
 * case until the end of the month, the free calls refused before the cap
 * while the sign-ups stayed open. Past RESERVATION_TTL_SECONDS, such an
 * orphan expires into its month's spent amount at its worst case
 * (expireStale(), run before every reservation and every reading). The
 * month's row is always locked first, then its reservations: one order for
 * reserve(), settle(), release() and expireStale(), no deadlock between them.
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

    /**
     * How long a reservation may stay in flight before it expires into the
     * spent amount: 15 minutes, well past the longest call the configuration
     * allows — the upstream timeout (300 s at most in the administration,
     * DemoConfigService), the token count before it (5 s), the stream's own
     * deadline (5 s) — so that only an orphan ever reaches it.
     */
    public const RESERVATION_TTL_SECONDS = 900;

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
     * would change no row, and read as a refusal. The conditional UPDATE and
     * the reservation's dated row in one transaction: a process killed
     * between the two leaves neither.
     *
     * @param int $microusd the call's worst case
     * @param int $capMicrousd the month's cap (capMicrousd())
     */
    public function reserve(int $microusd, int $capMicrousd, ?int $now = null): bool
    {
        $now ??= time();
        $month = self::month($now);
        $microusd = max(1, $microusd);
        $this->expireStale($now);
        $this->pdo->prepare(
            'INSERT INTO free_credit_monthly (month) VALUES (?) ON DUPLICATE KEY UPDATE month = month'
        )->execute([$month]);
        $reserved = $this->atomically(function () use ($month, $microusd, $capMicrousd, $now): bool {
            $stmt = $this->pdo->prepare(
                'UPDATE free_credit_monthly SET reserved_microusd = reserved_microusd + ?
                 WHERE month = ? AND spent_microusd + reserved_microusd + ? <= ?'
            );
            $stmt->execute([$microusd, $month, $microusd, $capMicrousd]);
            if ($stmt->rowCount() !== 1) {
                return false;
            }
            $this->pdo->prepare(
                'INSERT INTO free_credit_reservations (month, microusd, reserved_at) VALUES (?, ?, ?)'
            )->execute([$month, $microusd, $now]);

            return true;
        });
        if ($reserved) {
            return true;
        }
        $this->pdo->prepare('UPDATE free_credit_monthly SET refusals = refusals + 1 WHERE month = ?')
            ->execute([$month]);

        return false;
    }

    /**
     * Expires the reservations left in flight past RESERVATION_TTL_SECONDS —
     * orphans, whose process died before settling them — into their month's
     * spent amount, at their worst case, each counted as a call: it may have
     * reached the provider, and been billed. Their sum stays counted against
     * the cap; it only moves from reserved to spent, where the sign-ups'
     * criterion sees it (signupsOpen) and the administrator no longer reads
     * it « in flight ». Returns how many expired.
     */
    public function expireStale(?int $now = null): int
    {
        $before = ($now ?? time()) - self::RESERVATION_TTL_SECONDS;
        $months = $this->pdo->prepare('SELECT DISTINCT month FROM free_credit_reservations WHERE reserved_at < ?');
        $months->execute([$before]);
        $expired = 0;
        foreach ($months->fetchAll(PDO::FETCH_COLUMN) as $month) {
            $expired += $this->atomically(function () use ($month, $before): int {
                $this->lockMonth((string) $month);
                $stale = $this->pdo->prepare(
                    'SELECT id, microusd FROM free_credit_reservations WHERE month = ? AND reserved_at < ? FOR UPDATE'
                );
                $stale->execute([$month, $before]);
                $rows = $stale->fetchAll(PDO::FETCH_ASSOC);
                if ($rows === []) {
                    return 0; // settled meanwhile
                }
                $sum = array_sum(array_map(static fn (array $r): int => (int) $r['microusd'], $rows));
                $ids = array_map(static fn (array $r): int => (int) $r['id'], $rows);
                $this->pdo->prepare('DELETE FROM free_credit_reservations WHERE id IN ('
                    . implode(',', array_fill(0, \count($ids), '?')) . ')')->execute($ids);
                $this->pdo->prepare(
                    'UPDATE free_credit_monthly
                     SET reserved_microusd = GREATEST(reserved_microusd, ?) - ?,
                         spent_microusd = spent_microusd + ?,
                         calls = calls + ?
                     WHERE month = ?'
                )->execute([$sum, $sum, $sum, \count($rows), $month]);

                return \count($rows);
            });
        }

        return $expired;
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
     * A reservation that has already expired (expireStale) has its worst case
     * spent and its call counted: only what the real cost exceeds it by is
     * added.
     */
    public function settle(int $reservedMicrousd, int $costMicrousd, ?int $now = null): void
    {
        $this->giveBack(max(1, $reservedMicrousd), max(0, $costMicrousd), 1, $now);
    }

    /**
     * Gives a reservation back: the call did not leave, or the provider
     * refused it and bills nothing. One that has already expired gives
     * nothing back: its worst case stays spent (the prudent side).
     */
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
        $this->expireStale($now);
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
     * waitlisted it for nothing. An orphan, which never settles, counts once
     * it has expired into the spent amount (expireStale, run first): past
     * RESERVATION_TTL_SECONDS, never for the rest of the month. A cap of 0
     * waitlists every sign-up.
     */
    public function signupsOpen(int $capMicrousd, int $floorMicrousd, ?int $now = null): bool
    {
        $this->expireStale($now);
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

    /**
     * Settles or gives back one reservation of this amount in the month: its
     * dated row leaves, then the month's row. Reservations of the same amount
     * are interchangeable — whichever row leaves, the month's sums end the
     * same. No such row: it has expired (expireStale), its worst case spent
     * and its call counted; only the cost beyond it is left to add.
     */
    private function giveBack(int $reservedMicrousd, int $costMicrousd, int $calls, ?int $now): void
    {
        $month = self::month($now);
        $this->atomically(function () use ($month, $reservedMicrousd, $costMicrousd, $calls): void {
            $this->lockMonth($month);
            $row = $this->pdo->prepare(
                'DELETE FROM free_credit_reservations WHERE month = ? AND microusd = ? ORDER BY id LIMIT 1'
            );
            $row->execute([$month, $reservedMicrousd]);
            if ($row->rowCount() !== 1) {
                $this->pdo->prepare('UPDATE free_credit_monthly SET spent_microusd = spent_microusd + ? WHERE month = ?')
                    ->execute([max(0, $costMicrousd - $reservedMicrousd), $month]);

                return;
            }
            // GREATEST keeps the unsigned column from underflowing should the
            // month's row no longer hold the reservation.
            $this->pdo->prepare(
                'UPDATE free_credit_monthly
                 SET reserved_microusd = GREATEST(reserved_microusd, ?) - ?,
                     spent_microusd = spent_microusd + ?,
                     calls = calls + ?
                 WHERE month = ?'
            )->execute([$reservedMicrousd, $reservedMicrousd, $costMicrousd, $calls, $month]);
        });
    }

    /** Locks the month's row, first in every transaction of the ledger (one lock order). */
    private function lockMonth(string $month): void
    {
        $lock = $this->pdo->prepare('SELECT month FROM free_credit_monthly WHERE month = ? FOR UPDATE');
        $lock->execute([$month]);
        $lock->fetchAll();
    }

    /**
     * Runs $work in a transaction of its own, or in the caller's when one is
     * open (it then commits or rolls back with it).
     *
     * @template T
     * @param callable(): T $work
     * @return T
     */
    private function atomically(callable $work): mixed
    {
        if ($this->pdo->inTransaction()) {
            return $work();
        }
        $this->pdo->beginTransaction();
        try {
            $result = $work();
            $this->pdo->commit();

            return $result;
        } catch (\Throwable $e) {
            try {
                if ($this->pdo->inTransaction()) {
                    $this->pdo->rollBack();
                }
            } catch (\Throwable) {
                // the connection is gone: the server rolled the transaction back
            }
            throw $e;
        }
    }
}
