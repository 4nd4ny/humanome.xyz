-- 025 — Twin9 runs on the server, by slices (Twin_v9's docs/plan-twin9-php.md,
-- lot 1, T7; ADR-011 §2 and §5).
--
-- twin9_cartes: the memory of a map belongs to a user, a portfolio (its
--   journal), a referential and a template set; twin9_memoire holds it, key by
--   key (the days, their archived layers, the bundles, the Arpenteur), each
--   value a JSON text compressed with zlib.
-- twin9_runs: a run keeps a copy of its settings (the profile, the v9.8's
--   settings), its portfolio and its template set, compressed, and its clock,
--   frozen at its creation: each pass recomputes the same prompts. `attente`
--   says what holds a running run back (its key, the provider, another run of
--   the same map), for the run's page.
-- twin9_appels: the journal of calls, written before and after each call. It
--   is part of the run's state, under the learner's consent (ADR-011 §5), not
--   a log: never the prompt (its SHA-256 only) nor the key; a finished run
--   keeps its counters only (twin9_runs.compteurs) and its rows go.
-- twin9_resultats: the run's outputs, compressed.
--
-- RGPD (registre §13): portfolio and run state stay on the server until their
-- owner deletes them; account purge removes everything (CASCADE).
--
-- Forward-only, expand pattern (ADR-008): new tables, which the previously
-- pointed release simply ignores.

CREATE TABLE twin9_cartes (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    portfolio VARCHAR(190) NOT NULL,
    referentiel VARCHAR(64) NOT NULL,
    gabarits VARCHAR(64) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_twin9_cartes (user_id, portfolio, referentiel, gabarits),
    CONSTRAINT fk_twin9_cartes_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE twin9_memoire (
    carte_id INT UNSIGNED NOT NULL,
    cle VARCHAR(190) NOT NULL,
    valeur MEDIUMBLOB NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (carte_id, cle),
    CONSTRAINT fk_twin9_memoire_carte FOREIGN KEY (carte_id)
        REFERENCES twin9_cartes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE twin9_runs (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    carte_id INT UNSIGNED NOT NULL,
    statut ENUM('en_cours', 'termine', 'echoue', 'annule') NOT NULL DEFAULT 'en_cours',
    reglages MEDIUMBLOB NOT NULL,
    portfolio MEDIUMBLOB NOT NULL,
    gabarits MEDIUMBLOB NOT NULL,
    horloge DATETIME NOT NULL,
    attente VARCHAR(255) NULL,
    compteurs JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    avance_at DATETIME(3) NULL,
    finished_at DATETIME NULL,
    PRIMARY KEY (id),
    KEY idx_twin9_runs_file (statut, avance_at),
    KEY idx_twin9_runs_carte (carte_id, statut),
    CONSTRAINT fk_twin9_runs_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_twin9_runs_carte FOREIGN KEY (carte_id)
        REFERENCES twin9_cartes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE twin9_appels (
    run_id INT UNSIGNED NOT NULL,
    appel VARCHAR(255) NOT NULL,
    etape VARCHAR(40) NOT NULL,
    modele VARCHAR(80) NOT NULL,
    modele_envoye VARCHAR(80) NULL,
    modele_servi VARCHAR(80) NULL,
    sha256 CHAR(64) NOT NULL,
    statut ENUM('envoye', 'attente', 'repondu', 'panne') NOT NULL,
    tentatives TINYINT UNSIGNED NOT NULL DEFAULT 0,
    reprise_at DATETIME(3) NULL,
    reponse MEDIUMBLOB NULL,
    panne VARCHAR(255) NULL,
    stop_reason VARCHAR(32) NULL,
    jetons_entree INT UNSIGNED NULL,
    jetons_sortie INT UNSIGNED NULL,
    cout_microusd BIGINT UNSIGNED NULL,
    duree_ms INT UNSIGNED NULL,
    envoye_at DATETIME(3) NULL,
    repondu_at DATETIME(3) NULL,
    PRIMARY KEY (run_id, appel),
    CONSTRAINT fk_twin9_appels_run FOREIGN KEY (run_id)
        REFERENCES twin9_runs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE twin9_resultats (
    run_id INT UNSIGNED NOT NULL,
    chemin VARCHAR(255) NOT NULL,
    contenu MEDIUMBLOB NOT NULL,
    PRIMARY KEY (run_id, chemin),
    CONSTRAINT fk_twin9_resultats_run FOREIGN KEY (run_id)
        REFERENCES twin9_runs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
