-- 032 — The provider of each Twin9 call, and what the slice measures of
-- the other providers' direct calls (P1-5, ADR-012; docs/contrats.md §8.1,
-- §8.3, §8.9).
--
-- twin9_appels.fournisseur: the provider the call was sent to, an id of the
--   registry (Twin9\Fournisseurs\Fournisseurs::REGISTRE). Its price key, its
--   stop's table and its counts by provider (the run's counters, its
--   execution block, its evaluation) read it. A row written before this
--   migration was Anthropic's: the default says so.
-- twin9_appels.coupures: how many times the slice's end cut the call while
--   it was in flight (a non-streamed request cut by the client may be billed
--   all the same: OpenRouter documents it); counted by provider in the
--   run's counters and its execution block.
-- twin9_appels.plafond_depuis: since when the call meets its provider's
--   spending cap (a 402, a quota spent, a 429 without Retry-After at
--   Anthropic), kept from one try to the next, cleared by its outcome. A run
--   held more than thirty minutes on another provider's cap stops, its
--   reserve given back.
--
-- No twin9_runs column: a run with a direct route is opened at every tick,
-- a run by batches alone as before (spec P1-5, « voie mixte »).
--
-- RGPD (registre §13): an id, counters and a time, never content; account
-- purge removes them with the run (CASCADE).
--
-- Forward-only, expand pattern (ADR-008): defaulted or nullable columns,
-- which the previously pointed release simply ignores.

ALTER TABLE twin9_appels
    ADD COLUMN fournisseur VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'anthropic'
        AFTER modele_envoye,
    ADD COLUMN coupures SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER tentatives,
    ADD COLUMN plafond_depuis DATETIME(3) NULL AFTER reprise_at;
