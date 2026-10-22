-- 033 — Since when a Twin9 run's calls are held back by a model longer than
-- the slices it gets (P1-5, 2026-10-22; docs/contrats.md §8.1).
--
-- twin9_runs.retenu_depuis: set by the slice that holds back a call of
--   another provider's model whose longest call (duree_max_s, the price
--   grid's) outlasts what the slice leaves it at its head — a trigger's
--   shorter slice (cron-job.org's 25 s, docs/deploiement.md) —, kept while
--   the following slices hold one back, cleared by a slice that holds none
--   (a longer one, its page open) and by a resumption. Thirty minutes so,
--   the run stops, what its calls hold given back: it no longer stays in
--   progress without end, its owner's credit engaged.
--
-- RGPD (registre §13): a time, never content; account purge removes it with
-- the run.
--
-- Forward-only, expand pattern (ADR-008): a nullable column, which the
-- previously pointed release simply ignores.

ALTER TABLE twin9_runs
    ADD COLUMN retenu_depuis DATETIME(3) NULL AFTER attente;
