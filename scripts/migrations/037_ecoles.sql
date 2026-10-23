-- 037 — The school: its settings, its key, the cap per learner, and who pays
-- a Twin9 run (sprint 6, lot S6b, 2026-10-22;
-- docs/decisions/ADR-013-ecoles-cles-credits.md §3, §4, §6, §10).
--
-- The school is the account that holds the `etablissement` habilitation,
-- which only the administrator grants (ADR-013 §2 h): no second identity.
-- Its credit is its twin9_credits row, with the same ledger, invoices and
-- idempotent top-up; nothing to migrate. Its learners are the members of its
-- cohorts (cohorte_membres -> cohortes.etablissement_id), no table more.
--
-- ecoles: one row of settings per school, written at its first write; a
--   school without one has the defaults.
--   surtaxe_pct: what a school on the instance's key pays on top of the real
--     cost, which it chooses between 3.50 % (the fees of Stripe and PayPal)
--     and 10 %, to the hundredth (R4); 3.50 by default. A run keeps the
--     surtax of its launch (twin9_runs.facteur_prix).
--   plafond_eleve_microusd: what each of its learners may commit of its
--     credit or of its key in a UTC month; 0 by default, nothing paid for its
--     learners until the school sets it.
--   respire_numero: NULL for a school that is not RESPIRE, 0 for RESPIRE#0
--     (the demonstration school, created in the database only, R5), 1 for
--     RESPIRE#1; unique. Nothing reads it yet: it prepares the consent of
--     lot S7b.
-- ecole_cles: the school's key, for its learners (R1): encrypted like
--   KeyVault (nonce of 24 bytes followed by the secretbox, master key
--   SODIUM_MASTER_KEY outside the webroot); written and erased, never read
--   back by a route, not even by the school; read by RunKey and by the open
--   cartography as each call leaves. Anthropic only (ADR-013 §6). Purged with
--   the school's account (CASCADE).
-- ecole_consommations: one row per (school, learner, UTC month 'YYYY-MM',
--   computed in PHP with gmdate, the clock of free_credit_monthly — never
--   MySQL's NOW()): what the learner has committed of the school's credit or
--   key that month — the worst cases their calls hold, the real costs of
--   those settled. A reservation guards the cap with a conditional UPDATE of
--   this row, locked first, in the transaction that writes the call; it is
--   settled in the month it was taken (twin9_appels.mois_reserve). CASCADE
--   from the school and from the learner. Amounts only.
-- twin9_runs.payeur: who pays the run, frozen at its launch — `personnel`
--   (its owner, on their remaining balance, as before; every run of before)
--   or `ecole`. The type is authoritative: a NULL payeur_id never stands for
--   it, a run of type `ecole` whose school is gone stops (« votre école ne
--   paie plus cette analyse ») and never falls back on its owner's balance.
--   payeur_id: the school that pays (SET NULL at its purge, never CASCADE:
--   the runs are the learner's). facteur_prix: the school's price factor at
--   the launch — 1 + its surtax on its credit, 1.0 on its key —; NULL for an
--   owner who pays, who keeps the instance's contribution.
-- twin9_credit_events.beneficiaire_id: the learner whose run wrote this event
--   in their school's ledger, so that the school sees what each spent, in
--   amounts only; SET NULL at the learner's purge.
-- twin9_appels.mois_reserve: the UTC month in which a call took the worst
--   case it holds, so that its settlement adjusts that month's row.
-- twin9_lots.cle: `ecole`, a batch submitted with the school's key.
-- twin9_lots_a_effacer.ecole_id: the school whose key submitted a batch of an
--   account erased; NULL: the instance's. The tick reads that key to cancel
--   and delete the batch; gone with the school (CASCADE), its batch stays at
--   Anthropic until Anthropic erases it, 29 days at most.
--
-- RGPD (registre §6, §9, §13): an encrypted key, amounts, months and ids;
-- never a portfolio, an output or a prompt. The school sees what each of its
-- learners committed, in amounts only (ADR-013 §7).
--
-- Forward-only, expand pattern (ADR-008): new tables, nullable or defaulted
-- columns, a value appended at the end of an enumeration; the previously
-- pointed release reads this schema without an error — but not its data: it
-- knows no payer, and would take a run its school pays for its learner's (its
-- settlements giving the learner what the school advanced, its next calls
-- debiting the learner), and send a run of the `ecole` lane on the instance's
-- key, free. Before any rollback over 037: the procedure of
-- docs/administration.md (« Avant un retour arrière par-dessus la migration
-- 037 »).

CREATE TABLE ecoles (
    user_id INT UNSIGNED NOT NULL,
    surtaxe_pct DECIMAL(4,2) NOT NULL DEFAULT 3.50,
    plafond_eleve_microusd BIGINT UNSIGNED NOT NULL DEFAULT 0,
    respire_numero SMALLINT UNSIGNED NULL DEFAULT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    UNIQUE KEY uq_ecoles_respire (respire_numero),
    CONSTRAINT ck_ecoles_surtaxe CHECK (surtaxe_pct BETWEEN 3.50 AND 10.00),
    CONSTRAINT fk_ecoles_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ecole_cles (
    ecole_id INT UNSIGNED NOT NULL,
    fournisseur VARCHAR(32) NOT NULL,
    encrypted_key VARBINARY(512) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ecole_id, fournisseur),
    CONSTRAINT fk_ecole_cles_ecole FOREIGN KEY (ecole_id)
        REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ecole_consommations (
    ecole_id INT UNSIGNED NOT NULL,
    eleve_id INT UNSIGNED NOT NULL,
    mois CHAR(7) NOT NULL,
    engage_microusd BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (ecole_id, eleve_id, mois),
    KEY idx_ecole_consommations_eleve (eleve_id),
    CONSTRAINT fk_ecole_consommations_ecole FOREIGN KEY (ecole_id)
        REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_ecole_consommations_eleve FOREIGN KEY (eleve_id)
        REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE twin9_runs
    ADD COLUMN payeur ENUM('personnel', 'ecole') NOT NULL DEFAULT 'personnel',
    ADD COLUMN payeur_id INT UNSIGNED NULL DEFAULT NULL,
    ADD COLUMN facteur_prix DECIMAL(6,4) NULL DEFAULT NULL,
    ADD KEY idx_twin9_runs_payeur (payeur_id, statut),
    ADD CONSTRAINT fk_twin9_runs_payeur FOREIGN KEY (payeur_id)
        REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE twin9_credit_events
    ADD COLUMN beneficiaire_id INT UNSIGNED NULL DEFAULT NULL,
    ADD KEY idx_twin9_credit_events_beneficiaire (beneficiaire_id),
    ADD CONSTRAINT fk_twin9_credit_events_beneficiaire FOREIGN KEY (beneficiaire_id)
        REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE twin9_appels
    ADD COLUMN mois_reserve CHAR(7) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL;

ALTER TABLE twin9_lots
    MODIFY cle ENUM('instance', 'personnelle', 'ecole') NOT NULL;

ALTER TABLE twin9_lots_a_effacer
    ADD COLUMN ecole_id INT UNSIGNED NULL DEFAULT NULL,
    ADD CONSTRAINT fk_twin9_lots_a_effacer_ecole FOREIGN KEY (ecole_id)
        REFERENCES users (id) ON DELETE CASCADE;
