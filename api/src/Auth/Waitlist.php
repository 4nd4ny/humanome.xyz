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
     * activation code leaves by mail. False, and nothing sent, when it was not
     * (or no longer) on the list.
     *
     * @param int|null $adminId the administrator who lifts it, null for the month
     */
    public function lift(int $userId, ?int $adminId = null): bool
    {
        $update = $this->pdo->prepare(
            'UPDATE users SET waitlisted_at = NULL WHERE id = ? AND waitlisted_at IS NOT NULL AND deleted_at IS NULL'
        );
        $update->execute([$userId]);
        if ($update->rowCount() !== 1) {
            return false;
        }
        Audit::record($this->pdo, $adminId, self::AUDIT_LIFTED, ['targetUserId' => $userId]);
        $email = $this->pdo->prepare('SELECT email FROM users WHERE id = ?');
        $email->execute([$userId]);
        ActivationMail::send($this->pdo, $userId, (string) $email->fetchColumn(), true);

        return true;
    }

    /**
     * The month's lift: the accounts waitlisted before the current UTC month,
     * in sign-up order, $limit at most (the rest at the next request or
     * tick). Returns how many this call lifted.
     */
    public function liftDue(?int $now = null, int $limit = self::LIFT_BATCH): int
    {
        $stmt = $this->pdo->prepare(
            'SELECT id FROM users WHERE waitlisted_at IS NOT NULL AND waitlisted_at < ? AND deleted_at IS NULL
              ORDER BY id LIMIT ' . max(1, $limit)
        );
        $stmt->execute([self::monthStart($now)]);
        $lifted = 0;
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $id) {
            $lifted += $this->lift((int) $id) ? 1 : 0;
        }

        return $lifted;
    }

    /**
     * « Tout lever » (the administrator): the whole list, in sign-up order,
     * ADMIN_BATCH accounts at most per call.
     *
     * @return array{lifted: int, remaining: int}
     */
    public function liftAll(int $adminId, int $limit = self::ADMIN_BATCH): array
    {
        $stmt = $this->pdo->query(
            'SELECT id FROM users WHERE waitlisted_at IS NOT NULL AND deleted_at IS NULL ORDER BY id LIMIT ' . max(1, $limit)
        );
        $lifted = 0;
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $id) {
            $lifted += $this->lift((int) $id, $adminId) ? 1 : 0;
        }

        return ['lifted' => $lifted, 'remaining' => $this->count()];
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
