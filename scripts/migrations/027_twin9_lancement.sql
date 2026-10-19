-- 027 — Launching Twin9 runs (Twin_v9's docs/plan-twin9-php.md, lot 2, T9;
-- ADR-011 §5): a run launched from the platform keeps its attestation, its
-- visibility and the date of its owner's consent.
--
-- attestation: what the run was launched with besides its settings — its
--   profile (id and name), the versions of its template set, its referential
--   (id and version, frozen at launch), the engine's commit. No content.
-- visibilite: who reads its results — its owner alone (`privee`), or also
--   the cartographes its owner linked (`cartographe`).
-- accord_at: when its owner agreed, at launch, that their portfolio and the
--   run's state stay on the server until they erase them. NULL for a run
--   not launched from the platform (tests).
--
-- RGPD (registre §13): no new content; account purge removes everything
-- (CASCADE through the user).
--
-- Forward-only, expand pattern (ADR-008): three columns, nullable or with a
-- default, which the previously pointed release simply ignores.

ALTER TABLE twin9_runs
    ADD COLUMN attestation JSON NULL AFTER reglages,
    ADD COLUMN visibilite ENUM('privee', 'cartographe') NOT NULL DEFAULT 'privee' AFTER statut,
    ADD COLUMN accord_at DATETIME NULL AFTER visibilite;
