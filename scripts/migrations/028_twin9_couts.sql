-- 028 — What a Twin9 run costs, and where it stops (Twin_v9's
-- docs/plan-twin9-php.md, lot 2, T10; ADR-010 §3, ADR-011 §5 and §6).
--
-- twin9_appels.reserve_microusd: the worst case held for a call before it
--   leaves, directly or in a batch — debited from its owner's credits when
--   the run uses the instance's key, counted against the run's budget in
--   any case —, until its outcome settles it at the real cost (the rest
--   refunded), or the run stops (all of it refunded).
-- twin9_runs.debut_at: when the run's current period began (its launch, or
--   its last resumption): the run's duration counts from it.
-- twin9_runs.actif_s: the seconds of its periods already ended, for the
--   average duration by day shown before a launch.
-- settings.twin9_config: the price grid covers the v9.8 profile's models — an
--   instance whose administrator saved the Twin9 configuration before gets
--   Haiku 5.5 and Sonnet 5.5 at Anthropic's list prices, Haiku 5.5's long
--   prompt tier included, unless it prices them already (JSON_INSERT never
--   overwrites); an instance that never saved it reads the new defaults.
-- twin9_lots_a_effacer: the batches still at Anthropic of an account erased,
--   submitted with the instance's key: Anthropic's id alone, no owner, no
--   content; the tick cancels and deletes them at Anthropic, then the row
--   goes. A batch submitted with its owner's own key is cancelled and
--   deleted when the account is, while the key still exists.
--
-- RGPD (registre §13): amounts, times and ids only; account purge removes
-- the rest (CASCADE through the run).
--
-- Forward-only, expand pattern (ADR-008): nullable or defaulted columns and a
-- new table, which the previously pointed release simply ignores.

ALTER TABLE twin9_appels
    ADD COLUMN reserve_microusd BIGINT UNSIGNED NULL AFTER cout_microusd;

ALTER TABLE twin9_runs
    ADD COLUMN debut_at DATETIME NULL AFTER accord_at,
    ADD COLUMN actif_s INT UNSIGNED NOT NULL DEFAULT 0 AFTER debut_at;

UPDATE twin9_runs SET debut_at = created_at WHERE debut_at IS NULL;

CREATE TABLE twin9_lots_a_effacer (
    lot VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    depose_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (lot)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

UPDATE settings
   SET value = JSON_INSERT(value,
           '$.modeles."claude-haiku-5-5"', JSON_OBJECT(
               'prix_usd_mtok', JSON_ARRAY(0.1, 0.5),
               'palier_long', JSON_OBJECT('au_dela_de', 100000, 'prix_usd_mtok', JSON_ARRAY(0.5, 2.5)),
               'etages', JSON_ARRAY('taggers', 'rapide')),
           '$.modeles."claude-sonnet-5-5"', JSON_OBJECT(
               'prix_usd_mtok', JSON_ARRAY(2, 10),
               'etages', JSON_ARRAY('taggers', 'rapide', 'tribunal')))
 WHERE name = 'twin9_config' AND JSON_CONTAINS_PATH(value, 'one', '$.modeles');
