-- 029 — The promptologues' template sets (Twin_v9's docs/plan-twin9-php.md,
-- lot 4b, T14; ADR-010 §6).
--
-- The v9.8's set stays where the import writes it, twin9_protocole and
-- twin9_protocole_versions: the atelier reads it and never writes it again.
-- The copies a promptologue makes of it live here:
--   twin9_jeux: a copy, its id (its name: what a profile chooses as its
--     `gabarits`, what keys a map's memory, twin9_cartes.gabarits, and a run's
--     attestation) and its author, the one account that edits it;
--   twin9_jeux_gabarits: each of its templates, the v9.8's names, its content
--     and {$VAR} as twin9_protocole has them;
--   twin9_jeux_versions: the archived versions of each, as
--     twin9_protocole_versions keeps the v9.8's.
--
-- RGPD (registre, « contenus collectifs »): a copy is platform content, no
-- personal data. Its author and its editors go to NULL with their account
-- (SET NULL), as the v9.8's editors do: the copy survives, editable by no one.
--
-- Forward-only, expand pattern (ADR-008): new tables, which the previously
-- pointed release simply ignores — its atelier and its runs keep reading the
-- v9.8's set, unchanged.

CREATE TABLE twin9_jeux (
    id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id INT UNSIGNED NULL DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_twin9_jeux_user (user_id),
    CONSTRAINT fk_twin9_jeux_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE twin9_jeux_gabarits (
    jeu VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    name VARCHAR(190) NOT NULL,
    content MEDIUMTEXT NOT NULL,
    variables JSON NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by INT UNSIGNED NULL DEFAULT NULL,
    PRIMARY KEY (jeu, name),
    KEY idx_twin9_jeux_gabarits_updated_by (updated_by),
    CONSTRAINT fk_twin9_jeux_gabarits_jeu FOREIGN KEY (jeu)
        REFERENCES twin9_jeux (id) ON DELETE CASCADE,
    CONSTRAINT fk_twin9_jeux_gabarits_updated_by FOREIGN KEY (updated_by)
        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE twin9_jeux_versions (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    jeu VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    name VARCHAR(190) NOT NULL,
    version INT UNSIGNED NOT NULL,
    content MEDIUMTEXT NOT NULL,
    variables JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INT UNSIGNED NULL DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_twin9_jeux_versions (jeu, name, version),
    KEY idx_twin9_jeux_versions_created_by (created_by),
    CONSTRAINT fk_twin9_jeux_versions_jeu FOREIGN KEY (jeu)
        REFERENCES twin9_jeux (id) ON DELETE CASCADE,
    CONSTRAINT fk_twin9_jeux_versions_created_by FOREIGN KEY (created_by)
        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
