-- 034 — Sprint 7 (S7a): the monthly ledger of the credits the instance
-- offers, and the waiting list of the sign-ups once they are spent.
--
-- « La somme totale des crédits offerts par mois ne doit pas dépasser 20 USD
-- pour tous les utilisateurs anonymes et enregistrés du site. Après, mettre
-- les inscriptions sur liste d'attente. » (TODO_LIST.md, sprint 7.)
--
-- free_credit_monthly: ONE row per month, every free call of the instance
--   together — what the instance pays without billing anyone: POST /api/llm
--   (the Essayer, the Twin6 trial, the « Service humanome », the prompt
--   bench and its retro-engineering) and POST /api/tuteur. A call paid by a
--   bought credit, a personal key or a school's key never comes here. Each
--   free call RESERVES its worst case before it leaves (a conditional UPDATE
--   on the month's row, which InnoDB locks: concurrent calls never pass the
--   cap together), then settles it to its real cost, or gives it back when
--   the provider bills nothing (Llm/FreeCreditLedger). On top of the daily
--   budgets (llm_usage_daily, tuteur_usage_daily), which stay.
--   Amounts in integer micro-USD, like the Twin9 credits: exact comparisons,
--   even under a cap of 0.01 USD (10 000 µUSD).
--   `month` is the UTC month 'YYYY-MM', computed in PHP (gmdate), the same
--   clock as the daily budgets (UTC day): never MySQL's CURDATE()/NOW(),
--   which follow the server's local time (the UTC/local gap of the
--   monitoring between 00:00 and 02:00, Paris time). A month thus opens on
--   the 1st at 00:00 UTC — 01:00 (winter) or 02:00 (summer) in Paris.
--   COUNTERS ONLY: no content, no user, no IP (cahier §6.5). Never pruned:
--   one row a month.
--
-- users.waitlisted_at: since when a new account waits for the next month's
--   credits (S7a, lot 2: the sign-ups made once the month's credits are
--   spent; NULL for every other account, the existing ones included). A
--   date, nothing more than a sign-up keeps (RGPD, registre §1); the account
--   purge removes it with the row.
--
-- Forward-only, expand pattern (ADR-008): a new table and a nullable column,
-- which the previously pointed release simply ignores.

CREATE TABLE free_credit_monthly (
    month CHAR(7) NOT NULL,
    spent_microusd BIGINT UNSIGNED NOT NULL DEFAULT 0,
    reserved_microusd BIGINT UNSIGNED NOT NULL DEFAULT 0,
    calls INT UNSIGNED NOT NULL DEFAULT 0,
    refusals INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE users
    ADD COLUMN waitlisted_at DATETIME NULL DEFAULT NULL AFTER email_verified_at;

CREATE INDEX idx_users_waitlisted ON users (waitlisted_at);
