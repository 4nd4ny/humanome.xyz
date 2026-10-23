-- 036 — The notice before the purge of the user keys still stored (sprint 6,
-- lot S6a, 2026-10-22; docs/decisions/ADR-013-ecoles-cles-credits.md §8).
--
-- Since ADR-013, a user's API keys stay in their browser: the server writes
-- none any more (PUT /api/keys answers 410), and no new run reads one. Those
-- stored before are shown « à supprimer » on the account page, until the
-- administration script scripts/purger-cles-utilisateurs.php purges them,
-- never run automatically: in mode `aviser` it writes to each account that
-- still has one and dates the notice here, so that no account is told twice;
-- in mode `purger` it deletes the keys notified 30 days ago at least.
--
-- user_api_keys.avis_purge_at: when the account was told its stored keys
--   would go; NULL, not yet. No key material, a date only.
--
-- Forward-only, expand pattern (ADR-008): a nullable column, which the
-- previously pointed release simply ignores. The table itself leaves with the
-- contraction, once no user key is left (ADR-013 §8, step 10).

ALTER TABLE user_api_keys
    ADD COLUMN avis_purge_at DATETIME NULL DEFAULT NULL;
