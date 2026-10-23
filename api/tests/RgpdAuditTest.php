<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;
use Humanome\Rgpd\RgpdAudit;

require_once \dirname(__DIR__, 2) . '/scripts/rgpd-audit.php';

/**
 * RGPD transverse (P12.2, cahier §6.3): the account-deletion guarantee proven
 * against the LIVE schema by scripts/rgpd-audit.php, plus an end-to-end purge
 * of a broadly-populated account.
 *
 * The per-module cascades are already locked by AuthAccountDeletionTest,
 * CartographiesPurgeTest, CartographePurgeTest and MasseRgpdPurgeTest; this
 * suite adds the TRANSVERSE net the audit tool exists for:
 *   - no user-identifying column exists without a governing foreign key
 *     (the "forgotten table" that a purge would silently miss);
 *   - the ON DELETE rule of every reference to `users` matches the registre
 *     (docs/rgpd-registre.md) — a future migration flipping one goes red;
 *   - on a populated account, the tool's footprint is non-empty before the
 *     purge and strictly empty after (CASCADE rows gone, SET NULL ids nulled).
 */
final class RgpdAuditTest extends MasseTestCase
{
    /**
     * Expected ON DELETE rule of every foreign key REFERENCING users, from the
     * migrations 001-011. CASCADE = real erasure; SET NULL = documented
     * anonymisation of collective/immutable or trace data (registre §3,§10 +
     * the referentiel/prompt note).
     *
     * @var array<string, string>
     */
    private const EXPECTED_USER_FK_RULES = [
        // --- real erasure (the person's own data) ---
        'user_roles.user_id' => 'CASCADE',
        'sessions.user_id' => 'CASCADE',
        'cartographies.user_id' => 'CASCADE',
        'training_progress.user_id' => 'CASCADE',
        'user_api_keys.user_id' => 'CASCADE',
        'cartographe_invitations.apprenant_id' => 'CASCADE',
        'cartographe_links.apprenant_id' => 'CASCADE',
        'cartographe_links.cartographe_id' => 'CASCADE',
        'cartography_annotations.author_id' => 'CASCADE',
        'cartography_garanties.cartographe_id' => 'CASCADE',
        'cohortes.etablissement_id' => 'CASCADE',
        'cohorte_membres.user_id' => 'CASCADE',
        'cohorte_portfolios.user_id' => 'CASCADE',
        'etablissement_config.user_id' => 'CASCADE',
        'mass_runs.etablissement_id' => 'CASCADE',
        'mass_jobs.user_id' => 'CASCADE',
        'golden_grants.user_id' => 'CASCADE', // migration 010 (P12.1 admin)
        'twin9_credits.user_id' => 'CASCADE', // migration 011 (T3a, registre §11)
        'twin9_credit_events.user_id' => 'CASCADE', // migration 011 (T3a, registre §11)
        'twin9_paypal_orders.user_id' => 'CASCADE', // migration 012 (durcissement 2026-07-15 : lien order→user)
        'twin9_paypal_captures.user_id' => 'CASCADE', // migration 013 (remboursement à la demande)
        'referentiel_votes.user_id' => 'CASCADE', // migration 015 (gouvernance : le vote d'un membre purgé disparaît)
        'competence_votes.user_id' => 'CASCADE', // migration 016 (vote par compétence : idem)
        'carto_publication_requests.apprenant_id' => 'CASCADE', // migration 023 (demande de publication garantie : à l'apprenant)
        'twin9_profils.user_id' => 'CASCADE', // migration 024 (T12 : les profils Twin9 appartiennent à leur auteur, registre §12)
        'twin9_cartes.user_id' => 'CASCADE', // migration 025 (T7 : la mémoire d'une carte Twin9, registre §13)
        'twin9_runs.user_id' => 'CASCADE', // migration 025 (T7 : le run, son portfolio, son journal et ses sorties, registre §13)
        'user_declared_roles.user_id' => 'CASCADE', // migration 035 (sprint 8 : les rôles RESPIRE déclarés, registre §1 ter)
        'ecoles.user_id' => 'CASCADE', // migration 037 (S6b : les réglages de l'école, registre §6 ter)
        'ecole_cles.ecole_id' => 'CASCADE', // migration 037 (S6b : la clé de l'école part avec elle, registre §6 bis)
        'ecole_consommations.ecole_id' => 'CASCADE', // migration 037 (S6b : ce que l'école a payé, avec elle)
        'ecole_consommations.eleve_id' => 'CASCADE', // migration 037 (S6b : et avec l'élève, registre §6 ter)
        'twin9_lots_a_effacer.ecole_id' => 'CASCADE', // migration 037 (S6b : sa clé partie, le lot reste chez Anthropic)
        // --- documented anonymisation (SET NULL) ---
        'audit_events.user_id' => 'SET NULL',
        'referentiel_versions.created_by' => 'SET NULL',
        'referentiel_versions.submitted_by' => 'SET NULL', // migration 015 (proposant anonymisé, la proposition survit)
        'competence_versions.created_by' => 'SET NULL', // migration 016 (auteur anonymisé, la version survit)
        'competence_versions.submitted_by' => 'SET NULL', // migration 016 (proposant anonymisé)
        'prompt_versions.created_by' => 'SET NULL',
        'cartographe_invitations.accepted_by' => 'SET NULL',
        'cartography_revisions.author_id' => 'SET NULL',
        'golden_grants.granted_by' => 'SET NULL', // migration 010 (P12.1 admin)
        'twin9_protocole.updated_by' => 'SET NULL', // migration 011 (T3a): platform template survives its editor
        'twin9_protocole_versions.created_by' => 'SET NULL', // migration 011 (T3a)
        'twin9_jeux.user_id' => 'SET NULL', // migration 029 (T14): a copy of the v9.8's templates survives its author
        'twin9_jeux_gabarits.updated_by' => 'SET NULL', // migration 029 (T14)
        'twin9_jeux_versions.created_by' => 'SET NULL', // migration 029 (T14)
        'twin9_evaluations.user_id' => 'SET NULL', // migration 030 (T8): an evaluation serves the forecasts, no longer anyone's
        'twin9_runs.payeur_id' => 'SET NULL', // migration 037 (S6b): the run is the learner's, its school may go first
        'twin9_credit_events.beneficiaire_id' => 'SET NULL', // migration 037 (S6b): the school's ledger, its learner anonymised
    ];

    public function testAucuneColonneUtilisateurSansCleEtrangere(): void
    {
        // THE forgotten-table guard: every column named like a user reference
        // must be governed by a FK to users (CASCADE or SET NULL). A non-empty
        // result would be a purge-proof leak.
        $orphans = RgpdAudit::unconstrainedUserColumns(Db::get());
        self::assertSame(
            [],
            $orphans,
            'Colonne(s) identifiant un utilisateur sans FK vers users : ' . json_encode($orphans),
        );
    }

    public function testGrapheDeSuppressionConformeAuRegistre(): void
    {
        $actual = [];
        foreach (RgpdAudit::foreignKeysToUsers(Db::get()) as $fk) {
            $actual[$fk['table'] . '.' . $fk['column']] = $fk['deleteRule'];
        }
        ksort($actual);

        $expected = self::EXPECTED_USER_FK_RULES;
        ksort($expected);

        // Exact match: catches a new user FK added without a decided rule AND a
        // rule silently flipped by a migration.
        self::assertSame($expected, $actual);
    }

    public function testEmpreinteEtPurgeSurComptePeuple(): void
    {
        // Broad fixture: establishment + enrolled learner whose day is produced
        // to `done` (cohorte_membres, cohorte_portfolios, mass_jobs), plus a
        // stored cartography, a share link, an encrypted API key and training
        // progress attached to the learner.
        $etab = $this->registerEtablissement();
        $this->configure($etab, 100.0);
        $cohorte = $this->createCohorte($etab);
        $learner = $this->enrolLearner($cohorte['code'], $cohorte['id'], 1, ['2026-01-05']);
        $this->launchRun($etab, $cohorte['id']);
        $this->tickUntilDrained();

        $uid = $learner['id'];
        $pdo = Db::get();
        $this->attachStoredCartography($pdo, $uid);
        $pdo->prepare('INSERT INTO user_api_keys (user_id, provider, encrypted_key) VALUES (?, ?, ?)')
            ->execute([$uid, 'anthropic', random_bytes(48)]);
        $pdo->prepare('INSERT INTO training_progress (user_id, parcours, chapitre) VALUES (?, ?, ?)')
            ->execute([$uid, 'apprenant', '01-introduction']);
        $pdo->prepare('INSERT INTO user_declared_roles (user_id, role) VALUES (?, ?)')
            ->execute([$uid, 'mediateur']);

        // Footprint: the tool sees the learner across every populated table
        // (direct columns + the share_links chain).
        $footprint = RgpdAudit::footprint($pdo, $uid);
        foreach ([
            'user_roles.user_id',
            'cartographies.user_id',
            'user_api_keys.user_id',
            'training_progress.user_id',
            'user_declared_roles.user_id',
            'cohorte_membres.user_id',
            'cohorte_portfolios.user_id',
            'mass_jobs.user_id',
            'audit_events.user_id', // register/join/deposit events
            'share_links',          // indirect chain via cartographies
        ] as $key) {
            self::assertArrayHasKey($key, $footprint, "empreinte manquante : {$key}");
            self::assertGreaterThan(0, $footprint[$key]);
        }

        // Real purge (CSRF-protected one-click deletion).
        self::assertSame(204, $this->as_($learner, 'DELETE', '/api/auth/account')->getStatusCode());

        // No direct reference to the id survives: CASCADE rows gone, SET NULL
        // ids nulled. residualReferences must be strictly empty.
        self::assertSame([], RgpdAudit::residualReferences($pdo, $uid));

        // The anonymised audit trail SURVIVES (registre §10): the account_deleted
        // event exists with a NULL user_id — dated, but attributable to no one.
        $deleted = (int) $pdo->query(
            "SELECT COUNT(*) FROM audit_events WHERE type = 'account_deleted' AND user_id IS NULL"
        )->fetchColumn();
        self::assertSame(1, $deleted);
    }

    /** Stores a cartography for the learner and shares it (opt-in + share link). */
    private function attachStoredCartography(\PDO $pdo, int $uid): void
    {
        $pdo->prepare(
            "INSERT INTO cartographies (user_id, type, titre, visibility, document, opt_in_at)
             VALUES (?, 'jour', 'Journée test', 'publique', ?, NOW())"
        )->execute([$uid, json_encode(['competences' => []], JSON_THROW_ON_ERROR)]);
        $cid = (int) $pdo->lastInsertId();

        $pdo->prepare(
            'INSERT INTO share_links (cartographie_id, token_hash, password_hash) VALUES (?, ?, ?)'
        )->execute([$cid, hash('sha256', 'jeton-test'), password_hash('secret-partage', PASSWORD_DEFAULT)]);
    }
}
