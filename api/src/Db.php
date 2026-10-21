<?php

declare(strict_types=1);

namespace Humanome;

use PDO;

/**
 * PDO singleton configured from the environment (DB_HOST/DB_NAME/DB_USER/
 * DB_PASSWORD, optional DB_PORT). Plain PDO, prepared statements — no ORM.
 *
 * The static site must keep working without a database: callers check
 * isConfigured() before get() and degrade gracefully.
 */
final class Db
{
    private static ?PDO $pdo = null;

    public static function isConfigured(): bool
    {
        return Env::get('DB_HOST') !== '';
    }

    public static function get(): PDO
    {
        if (self::$pdo === null) {
            $dsn = sprintf(
                'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
                Env::get('DB_HOST'),
                Env::get('DB_PORT', '3306'),
                Env::get('DB_NAME'),
            );
            self::$pdo = new PDO($dsn, Env::get('DB_USER'), Env::get('DB_PASSWORD'), [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        }

        return self::$pdo;
    }

    /** Drop the cached connection (tests, or after changing env config). */
    public static function reset(): void
    {
        self::$pdo = null;
    }

    /**
     * Runs $travail on the connection, and once more on a fresh one when the
     * server had dropped it while it sat idle (MySQL 2006, « server has gone
     * away » — after a long upstream call, 2026-10-21). A query that fails so
     * never ran: running it again cannot apply it twice.
     *
     * @template T
     * @param callable(PDO): T $travail
     * @return T
     */
    public static function avecReconnexion(callable $travail): mixed
    {
        try {
            return $travail(self::get());
        } catch (\PDOException $e) {
            if ((int) ($e->errorInfo[1] ?? 0) !== 2006) {
                throw $e;
            }
            self::reset();

            return $travail(self::get());
        }
    }
}
