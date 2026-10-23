<?php

declare(strict_types=1);

namespace Humanome\Auth;

use Humanome\Llm\AnthropicProvider;
use Humanome\Llm\DemoConfig;
use Humanome\Llm\FreeCreditLedger;
use Humanome\Llm\Pricing;
use Humanome\Packages\SettingsRepository;
use Humanome\Twin9\Twin9Config;
use PDO;

/**
 * The waiting list of the sign-ups (sprint 7, S7a-2; users.waitlisted_at,
 * migration 034). « La somme totale des crédits offerts par mois ne doit pas
 * dépasser 20 USD [...]. Après, mettre les inscriptions sur liste d'attente. »
 *
 * - When the month's offered credits are spent (FreeCreditLedger::signupsOpen:
 *   what is left under the cap no longer pays the smallest Essayer call), a
 *   NEW sign-up is created on the waiting list: waitlisted_at set, no code
 *   sent (the activation by code is deferred), a mail and the response say
 *   so; it cannot log in. The existing accounts are never touched.
 * - The list is lifted on the 1st of the next month, in sign-up order (id),
 *   by batches, at the month's first authentication request (register,
 *   login, resend), at the tick (POST /api/admin/worker-tick,
 *   scripts/worker.php) and when the administrator opens it; and by the
 *   administrator, one by one or all. A lifted account becomes an ordinary
 *   pending one: its code leaves by mail (ActivationMail, $afterWaitlist).
 * - A lift whose mail the transport refuses (mail() false: the host's quota,
 *   sendmail down) puts the account back on the list, at its date and without
 *   a code (review of 2026-10-23): it is « mail_failed », never « lifted »,
 *   and the next lift tries again. The month's lift then stops, and holds
 *   back for MAIL_BACKOFF_SECONDS (a counter of rate_limits, no address):
 *   neither every request nor every tick retries a batch of mails, each with
 *   a fresh code. The administrator's lifts, explicit, always try.
 *
 * Clock: waitlisted_at is written in UTC by PHP (gmdate), never by MySQL's
 * NOW(), which follows the server's local time; an account is due once its
 * date is before the 1st of the current UTC month, 00:00 — the month of the
 * ledger (FreeCreditLedger::month). Every method takes $now (tests freeze it).
 *
 * Each lift is one conditional UPDATE (waitlisted_at IS NOT NULL): two
 * concurrent lifts of the same account send one mail. RGPD: a date, nothing
 * more than a sign-up keeps; it leaves with the account's row.
 */
final class Waitlist
{
    /** Accounts lifted by one request or one tick, at most: the month's first request stays short. */
    public const LIFT_BATCH = 50;

    /** Accounts lifted by one « Tout lever » of the administrator, at most (one mail each). */
    public const ADMIN_BATCH = 200;

    /** Accounts listed to the administrator, at most (in sign-up order). */
    public const LIST_LIMIT = 200;

    /** Audit of a sign-up put on the waiting list (no details). */
    public const AUDIT_WAITLISTED = 'account_waitlisted';

    /** Audit of a lift: {targetUserId}, by the administrator (user_id) or the month (user_id NULL). */
    public const AUDIT_LIFTED = 'waitlist_lifted';

    /** lift(): the account left the list and its code left by mail. */
    public const LIFTED = 'lifted';

    /** lift(): the account was not (or no longer) on the list; nothing sent. */
    public const UNCHANGED = 'unchanged';

    /** lift(): the transport refused the mail; the account stays on the list. */
    public const MAIL_FAILED = 'mail_failed';

    /** What the login of a due account answers when its lift's mail was refused. */
    public const MAIL_FAILED_MESSAGE = 'Votre attente est finie, mais le courriel de votre code d\'activation n\'a pas pu '
        . 'partir : réessayez de vous connecter dans quelques minutes.';

    /** How long the month's lift holds back after a refused mail (5 minutes). */
    public const MAIL_BACKOFF_SECONDS = 300;

    /** The rate_limits bucket of that hold (a counter, no address). */
    private const MAIL_BACKOFF_BUCKET = 'waitlist:mail-refused';

    public function __construct(private readonly PDO $pdo)
    {
    }

    /** True for an account on the waiting list (waitlisted_at set). @param array<string, mixed>|null $user */
    public static function isWaitlisted(?array $user): bool
    {
        return \is_array($user) && ($user['waitlisted_at'] ?? null) !== null;
    }

    /** True for an account waitlisted before the current UTC month: its wait is over. @param array<string, mixed> $user */
    public static function isDue(array $user, ?int $now = null): bool
    {
        return self::isWaitlisted($user) && (string) $user['waitlisted_at'] < self::monthStart($now);
    }

    /** The 1st of the current UTC month, 00:00, as a DATETIME string. */
    public static function monthStart(?int $now = null): string
    {
        return gmdate('Y-m-01 00:00:00', $now ?? time());
    }

    /** The 1st of the next UTC month, 'YYYY-MM-01': the next lift. */
    public static function nextLift(?int $now = null): string
    {
        $now ??= time();

        return gmdate('Y-m-01', gmmktime(0, 0, 0, (int) gmdate('n', $now) + 1, 1, (int) gmdate('Y', $now)));
    }

    /** What the sign-up and the login of a waitlisted account answer. */
    public static function signupMessage(?int $now = null): string
    {
        return 'Les crédits offerts de ce mois sont épuisés : votre inscription est en liste d\'attente. '
            . 'Vous recevrez votre code d\'activation par email le ' . FreeCreditLedger::nextMonthLabel($now)
            . ' (plus tôt si l\'administrateur lève la liste).';
    }

    /**
     * The smallest worst case an Essayer call reserves (POST /api/llm): the
     * request's own overhead and the model's whole output, priced on the grid
     * like the reservation itself. Every real call reserves at least this.
     */
    public function floorMicrousd(?DemoConfig $config = null): int
    {
        $config ??= DemoConfig::load();
        $grille = (new Twin9Config(new SettingsRepository($this->pdo)))->modeles();

        return FreeCreditLedger::microusd(Pricing::estimateUsd(
            $config->model,
            AnthropicProvider::REQUEST_OVERHEAD_TOKENS,
            $config->sortieMax(),
            $grille,
        ));
    }

    /** Whether a new sign-up is taken now, or waitlisted (FreeCreditLedger::signupsOpen). */
    public function signupsOpen(?int $now = null, ?DemoConfig $config = null): bool
    {
        $config ??= DemoConfig::load();

        return (new FreeCreditLedger($this->pdo))->signupsOpen(
            FreeCreditLedger::capMicrousd($config->monthlyFreeUsd),
            $this->floorMicrousd($config),
            $now,
        );
    }

    /** Puts a new account on the waiting list (UTC date). */
    public function enlist(int $userId, ?int $now = null): void
    {
        $this->pdo->prepare('UPDATE users SET waitlisted_at = ? WHERE id = ? AND deleted_at IS NULL')
            ->execute([gmdate('Y-m-d H:i:s', $now ?? time()), $userId]);
    }

    /**
     * Lifts one account: it becomes an ordinary pending account and its
     * activation code leaves by mail — LIFTED, audited once the transport
     * has taken the mail. UNCHANGED, and nothing sent, when it was not (or no
     * longer) on the list. MAIL_FAILED when the transport refused the mail:
     * the account is put back on the list, at its date and without a code,
     * and the month's lift holds back (MAIL_BACKOFF_SECONDS). The account is
     * claimed first by a conditional UPDATE: two concurrent lifts send one
     * mail.
     *
     * @param int|null $adminId the administrator who lifts it, null for the month
     * @return self::LIFTED|self::UNCHANGED|self::MAIL_FAILED
     */
    public function lift(int $userId, ?int $adminId = null, ?int $now = null): string
    {
        $stmt = $this->pdo->prepare(
            'SELECT email, waitlisted_at FROM users WHERE id = ? AND waitlisted_at IS NOT NULL AND deleted_at IS NULL'
        );
        $stmt->execute([$userId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!\is_array($row)) {
            return self::UNCHANGED;
        }
        $claim = $this->pdo->prepare(
            'UPDATE users SET waitlisted_at = NULL WHERE id = ? AND waitlisted_at = ? AND deleted_at IS NULL'
        );
        $claim->execute([$userId, $row['waitlisted_at']]);
        if ($claim->rowCount() !== 1) {
            return self::UNCHANGED; // lifted meanwhile
        }
        try {
            $sent = ActivationMail::send($this->pdo, $userId, (string) $row['email'], true);
        } catch (\Throwable $e) {
            try {
                $this->putBack($userId, (string) $row['waitlisted_at']);
            } catch (\Throwable) {
                // the original failure says more
            }
            throw $e;
        }
        if (!$sent) {
            $this->putBack($userId, (string) $row['waitlisted_at']);
            (new RateLimiter($this->pdo, 1, self::MAIL_BACKOFF_SECONDS))->hit(self::MAIL_BACKOFF_BUCKET, $now);
            error_log('[waitlist] activation mail refused by the transport'); // no address

            return self::MAIL_FAILED;
        }
        Audit::record($this->pdo, $adminId, self::AUDIT_LIFTED, ['targetUserId' => $userId]);

        return self::LIFTED;
    }

    /**
     * The month's lift: the accounts waitlisted before the current UTC month,
     * in sign-up order, $limit at most (the rest at the next request or
     * tick). It stops at the first refused mail, and does nothing while the
     * hold that follows lasts (MAIL_BACKOFF_SECONDS).
     *
     * @return array{lifted: int, failed: int} what this call lifted, and refused mails (0 or 1)
     */
    public function liftDue(?int $now = null, int $limit = self::LIFT_BATCH): array
    {
        if ((new RateLimiter($this->pdo, 1, self::MAIL_BACKOFF_SECONDS))->isBlocked(self::MAIL_BACKOFF_BUCKET, $now)) {
            return ['lifted' => 0, 'failed' => 0];
        }
        $stmt = $this->pdo->prepare(
            'SELECT id FROM users WHERE waitlisted_at IS NOT NULL AND waitlisted_at < ? AND deleted_at IS NULL
              ORDER BY id LIMIT ' . max(1, $limit)
        );
        $stmt->execute([self::monthStart($now)]);

        return $this->liftEach($stmt->fetchAll(PDO::FETCH_COLUMN), null, $now);
    }

    /**
     * « Tout lever » (the administrator): the whole list, in sign-up order,
     * ADMIN_BATCH accounts at most per call; it stops at the first refused
     * mail (failed: 1).
     *
     * @return array{lifted: int, failed: int, remaining: int}
     */
    public function liftAll(int $adminId, int $limit = self::ADMIN_BATCH): array
    {
        $stmt = $this->pdo->query(
            'SELECT id FROM users WHERE waitlisted_at IS NOT NULL AND deleted_at IS NULL ORDER BY id LIMIT ' . max(1, $limit)
        );

        return $this->liftEach($stmt->fetchAll(PDO::FETCH_COLUMN), $adminId, null) + ['remaining' => $this->count()];
    }

    /**
     * Lifts the accounts in order, until a refused mail.
     *
     * @param list<int|string> $ids
     * @return array{lifted: int, failed: int}
     */
    private function liftEach(array $ids, ?int $adminId, ?int $now): array
    {
        $lifted = 0;
        foreach ($ids as $id) {
            $status = $this->lift((int) $id, $adminId, $now);
            if ($status === self::MAIL_FAILED) {
                return ['lifted' => $lifted, 'failed' => 1];
            }
            $lifted += $status === self::LIFTED ? 1 : 0;
        }

        return ['lifted' => $lifted, 'failed' => 0];
    }

    /**
     * A lift whose mail did not leave: the account back on the list, at its
     * date, without the code that never left — as long as it is still a
     * pending account (never activated, never deleted meanwhile).
     */
    private function putBack(int $userId, string $waitlistedAt): void
    {
        $this->pdo->prepare(
            'UPDATE users SET waitlisted_at = ?, verification_code_hash = NULL, verification_expires_at = NULL,
                    verification_attempts = 0
              WHERE id = ? AND waitlisted_at IS NULL AND email_verified_at IS NULL AND deleted_at IS NULL'
        )->execute([$waitlistedAt, $userId]);
    }

    /** Accounts on the waiting list. */
    public function count(): int
    {
        return (int) $this->pdo->query(
            'SELECT COUNT(*) FROM users WHERE waitlisted_at IS NOT NULL AND deleted_at IS NULL'
        )->fetchColumn();
    }

    /**
     * GET /api/admin/waitlist: the due accounts lifted first (opening the list
     * is a request of the month), then the list in sign-up order.
     *
     * @return array{month: string, signupsOpen: bool, nextLift: string, total: int,
     *   accounts: list<array{id: int, email: string, displayName: string, createdAt: string, waitlistedAt: string}>}
     */
    public function overview(?int $now = null): array
    {
        $this->liftDue($now);
        $rows = $this->pdo->query(
            'SELECT id, email, display_name, created_at, waitlisted_at FROM users
              WHERE waitlisted_at IS NOT NULL AND deleted_at IS NULL ORDER BY id LIMIT ' . self::LIST_LIMIT
        )->fetchAll(PDO::FETCH_ASSOC);

        return [
            'month' => FreeCreditLedger::month($now),
            'signupsOpen' => $this->signupsOpen($now),
            'nextLift' => self::nextLift($now),
            'total' => $this->count(),
            'accounts' => array_map(static fn (array $r): array => [
                'id' => (int) $r['id'],
                'email' => (string) $r['email'],
                'displayName' => (string) $r['display_name'],
                'createdAt' => str_replace(' ', 'T', (string) $r['created_at']),
                // UTC, said so: the browser reads it as such.
                'waitlistedAt' => str_replace(' ', 'T', (string) $r['waitlisted_at']) . 'Z',
            ], $rows),
        ];
    }
}
