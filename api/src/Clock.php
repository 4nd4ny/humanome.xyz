<?php

declare(strict_types=1);

namespace Humanome;

/**
 * The time a request reads once (independent review of 2026-10-23). A route
 * that decides, then writes what it decided, takes its $now here a single
 * time and hands it down — never time() again halfway: at the turn of a
 * month, a sign-up refused under October would otherwise be dated November,
 * and wait until December. Tests set it (setOverride): a frozen time, or a
 * clock that moves at each reading.
 */
final class Clock
{
    private static ?\Closure $override = null;

    /** The current Unix time (UTC by nature). */
    public static function now(): int
    {
        return self::$override !== null ? (int) (self::$override)() : time();
    }

    /** Tests only: the clock to read (called at each reading), or null for the real one. */
    public static function setOverride(?\Closure $clock): void
    {
        self::$override = $clock;
    }
}
