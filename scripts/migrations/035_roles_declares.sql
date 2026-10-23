-- 035 — Declared RESPIRE roles (sprint 8, 2026-10-22; docs/autorisations.md,
-- « Rôles déclarés et habilitations »).
--
-- A DECLARED role is an identity the account gives itself in #/compte, among
-- the nine of the RESPIRE list (Humanome\Auth\DeclaredRoles::CATALOGUE). It
-- grants NOTHING: no route guard, no menu family, no vote, no reading of a
-- shared run reads these rows. Rights stay HABILITATIONS, the `user_roles` an
-- administrator grants (migration 001). The two live in separate tables so
-- that no query that opens a right can ever meet a declaration: `role` here
-- is a slug the server whitelists, never a foreign key to `roles`.
--
-- user_declared_roles: one row per role the account declares. ASCII binary
--   collation: a slug matches to the letter, never case- or accent-folded
--   (the habilitations' utf8mb4_unicode_ci folding is UC-ADM-01 AN-1).
-- users.founding_circle: the « membre du cercle des fondateurs » box, which
--   the server accepts only with promptagogue, epistemiarque or
--   maitre-du-grimoire declared, checked again on every write.
--
-- RGPD (registre §1 ter): declared by the person, read by them and by the
-- administrator, in the account archive (archive-export 1.3.0); account
-- purge removes both (CASCADE, column of the `users` row).
--
-- Forward-only, expand pattern (ADR-008): a new table and a column with a
-- default, which the previously pointed release simply ignores.

CREATE TABLE user_declared_roles (
    user_id INT UNSIGNED NOT NULL,
    role VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (user_id, role),
    CONSTRAINT fk_user_declared_roles_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE users
    ADD COLUMN founding_circle TINYINT(1) NOT NULL DEFAULT 0;
