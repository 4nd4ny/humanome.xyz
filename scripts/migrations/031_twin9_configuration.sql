-- 031 — What a Twin9 run was launched with, and how it went (P0-1, the
-- run's configuration and execution blocks; docs/contrats.md §8.9).
--
-- configuration: the run's configuration block, written once at launch and
--   never changed (a resumption included): the engine's versions, the
--   profile's call settings as each call is sent (provider, lane, model,
--   output budget, effort, thinking), the college, the algorithm's
--   parameters, the referential and the template set by version and
--   fingerprint, the prices as billed. A whitelist: never a template, a
--   fiche, a key nor the margin. Compressed JSON (zlib), as `reglages`:
--   its bytes and its 1.0 kept, its fingerprint read again from them. NULL
--   for a run launched before this migration.
-- execution: the run's execution block, frozen when it ends (`termine`):
--   its calls by lane, provider and model, its stops, its tokens and costs,
--   its passes and engine time, its resumptions. Before that it holds only
--   its resumptions; the rest is computed from the journal on demand.
-- passes, moteur_ms: the engine's passes of the run and their time, in
--   milliseconds, each counted as it is played (P0-4's measure; a tick that
--   dies loses only the pass it was playing); partial for a run that began
--   before this migration.
--
-- RGPD (registre §13): settings, versions, counters and amounts, never
-- content; account purge removes them with the run (CASCADE).
--
-- Forward-only, expand pattern (ADR-008): nullable or defaulted columns,
-- which the previously pointed release simply ignores.

ALTER TABLE twin9_runs
    ADD COLUMN configuration MEDIUMBLOB NULL AFTER attestation,
    ADD COLUMN execution JSON NULL AFTER configuration,
    ADD COLUMN passes INT UNSIGNED NOT NULL DEFAULT 0 AFTER execution,
    ADD COLUMN moteur_ms BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER passes;
