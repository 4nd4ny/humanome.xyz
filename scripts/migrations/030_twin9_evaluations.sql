-- 030 — What a Twin9 run leaves to foresee the next ones, and what it keeps
-- for its merge (Twin_v9's docs/plan-twin9-php.md, lot 2, T8: the strategy A,
-- chosen by Christian on 2026-10-19).
--
-- twin9_evaluations: one row by run done, never its content — the person
--   evaluated (user_id); each day of its map, in kilobytes, with what the run
--   paid for it (null: taken back from the memory, without a call; `panne`: a
--   call of it failed, the next run maps it again); what its merge cost; the
--   largest worst case a call of its days, and of its merge, held before
--   leaving (T10); its final cost, what its owner paid, the instance's margin
--   included with the instance's key (its factor kept in `reglages`); its
--   active duration; and the settings its profile chose — the models and the
--   performance (stages, steps and readers: model, output budget, effort,
--   reflection, passes), the algorithm's parameters and the template set,
--   with its mode, lane, key and referential. `signature` hashes what the
--   forecasts compare: all but the lane, the key, the caps and the
--   parallelism. A row outlives its run.
-- twin9_runs.reserve_fusion_microusd: what a run keeps for its merge, which
--   the calls of its days never eat into (strategy A).
-- twin9_runs.engagement_microusd: what the launch granted the run on its
--   owner's credit (the instance's key): its days and its merge at the most,
--   the worst cases of their calls included. What a run in progress may still
--   spend of it, the owner's other runs never eat into.
-- twin9_appels.pire_cas_microusd: the worst case a call held when it left,
--   kept once it is settled, for its run's evaluation.
--
-- RGPD (registre §13, §13 bis): sizes, amounts, times and settings, never
-- content; the account purge anonymizes the evaluations (user_id SET NULL):
-- they keep serving the forecasts, no longer anyone's.
--
-- Forward-only, expand pattern (ADR-008): defaulted or nullable columns and a
-- new table, which the previously pointed release simply ignores.

ALTER TABLE twin9_runs
    ADD COLUMN reserve_fusion_microusd BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER actif_s,
    ADD COLUMN engagement_microusd BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER reserve_fusion_microusd;

ALTER TABLE twin9_appels
    ADD COLUMN pire_cas_microusd BIGINT UNSIGNED NULL AFTER reserve_microusd;

CREATE TABLE twin9_evaluations (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    run_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NULL DEFAULT NULL,
    signature CHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    reglages JSON NOT NULL,
    journees JSON NOT NULL,
    cout_journees_microusd BIGINT UNSIGNED NOT NULL,
    cout_fusion_microusd BIGINT UNSIGNED NOT NULL,
    pire_cas_journee_microusd BIGINT UNSIGNED NULL,
    pire_cas_fusion_microusd BIGINT UNSIGNED NULL,
    cout_microusd BIGINT UNSIGNED NOT NULL,
    duree_s INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_twin9_evaluations_run (run_id),
    KEY idx_twin9_evaluations_signature (signature, id),
    KEY idx_twin9_evaluations_user (user_id),
    CONSTRAINT fk_twin9_evaluations_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
