-- 026 — Twin9's batch lane (Twin_v9's docs/plan-twin9-php.md, lot 1, T8;
-- ADR-011 §3): the calls a run waits for leave together through Anthropic's
-- Message Batches API, at half price; a slice submits the batch, a later one
-- collects it.
--
-- twin9_lots: a run's batches. A row is written before its batch leaves
--   (`soumission`), so that a batch whose answer a crash lost is found again;
--   it holds Anthropic's id once known (`en_cours`), until the batch is
--   collected (`releve`), then deleted at Anthropic (`supprime`); the batches
--   of a run stopped are cancelled first (`annulation`). `cle` says which key
--   submitted it (the instance's or its owner's), never the key.
-- twin9_appels: a call in a batch carries the batch and its custom_id, a short
--   fingerprint of its id (Anthropic's custom_id: 64 characters at most,
--   letters, digits, - and _).
--
-- RGPD (registre §13): ids and counts only, never content; account purge
-- removes everything (CASCADE through the run).
--
-- Forward-only, expand pattern (ADR-008): a new table and two nullable
-- columns, which the previously pointed release simply ignores.

CREATE TABLE twin9_lots (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    run_id INT UNSIGNED NOT NULL,
    lot VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    statut ENUM('soumission', 'en_cours', 'releve', 'annulation', 'supprime') NOT NULL,
    cle ENUM('instance', 'personnelle') NOT NULL,
    requetes INT UNSIGNED NOT NULL,
    octets INT UNSIGNED NOT NULL,
    soumis_at DATETIME(3) NOT NULL,
    fini_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_twin9_lots_lot (lot),
    KEY idx_twin9_lots_run (run_id, statut),
    CONSTRAINT fk_twin9_lots_run FOREIGN KEY (run_id)
        REFERENCES twin9_runs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

ALTER TABLE twin9_appels
    ADD COLUMN lot_id INT UNSIGNED NULL AFTER statut,
    ADD COLUMN custom_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER lot_id,
    ADD KEY idx_twin9_appels_lot (lot_id, custom_id),
    ADD CONSTRAINT fk_twin9_appels_lot FOREIGN KEY (lot_id)
        REFERENCES twin9_lots (id) ON DELETE SET NULL;
