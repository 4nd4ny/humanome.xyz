-- 024 — Twin9 run profiles (Twin_v9's docs/plan-twin9-php.md, lot 4a, T12).
-- A profile describes a Twin9 run from end to end and is validated against
-- schemas/twin9-profil.schema.json before it is written. The v9.8 profile,
-- the read-only default, lives in api/config/twin9-profil-v98.json: the rows
-- here are the users' own profiles, copied from it and edited.
--
-- RGPD (registre §12): settings only — models, thresholds, truncations —
-- never portfolio content, prompt text or a key (the profile names which key
-- to use, "instance" or "personnelle", never the key itself). The profile
-- belongs to its owner: account purge removes it (CASCADE).
--
-- Forward-only, expand pattern (ADR-008): a new table, which the previously
-- pointed release simply ignores.

CREATE TABLE twin9_profils (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    nom VARCHAR(120) NOT NULL,
    profil JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_twin9_profils_user_nom (user_id, nom),
    CONSTRAINT fk_twin9_profils_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
