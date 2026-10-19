<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;
use Humanome\Packages\SettingsRepository;
use Humanome\Twin9\ProtocoleRepository;
use Humanome\Twin9\Twin9Config;

/**
 * T3a (ADR-010) — twin9 template store, admin routes, config bounds and the
 * X-Migrate-Token import; T14 — the template sets: the v9.8's, read-only in
 * the atelier, the copies its promptologues make of it, the default.
 *
 * SECRECY IMPERATIVE (ADR-010): every template used here is a MADE-UP test
 * fixture — no real Twin9 content may ever appear in tests, fixtures,
 * error messages or logs.
 */
final class Twin9ProtocoleTest extends CartographeTestCase
{
    private const TOKEN = 'test-migrate-token-twin9';

    /** Entirely fictional template, invented for the tests. */
    private const FAKE_GABARIT = "Gabarit FICTIF de test.\nBonjour {\$PRENOM}, examine {\$TEXTE_JOURNEE} pour le pôle {\$POLE_ID}.\nRappel: {\$PRENOM} n'est pas {\$POLE_ID}.";

    protected function setUp(): void
    {
        parent::setUp(); // wipes users (+ credit cascades) and audit_events
        TestDb::setEnv('MIGRATE_TOKEN', self::TOKEN);
        $pdo = Db::get();
        $pdo->exec('DELETE FROM twin9_protocole_versions');
        $pdo->exec('DELETE FROM twin9_protocole');
        $pdo->exec('DELETE FROM twin9_jeux');
        $pdo->exec("DELETE FROM settings WHERE name IN ('twin9_config', 'twin9_gabarits_defaut')");
    }

    // ==================================================================
    // Import (X-Migrate-Token, pattern import-prompt-package)
    // ==================================================================

    public function testImportRequiresToken(): void
    {
        $body = ['files' => ['fictif/01-essai' => self::FAKE_GABARIT]];

        // Endpoint "does not exist" while MIGRATE_TOKEN is unconfigured.
        TestDb::setEnv('MIGRATE_TOKEN', '');
        $response = $this->request('POST', '/api/admin/twin9/import', $body);
        self::assertSame(404, $response->getStatusCode());

        // Wrong or missing header: forbidden.
        TestDb::setEnv('MIGRATE_TOKEN', self::TOKEN);
        $response = $this->request('POST', '/api/admin/twin9/import', $body);
        self::assertSame(403, $response->getStatusCode());
        $response = $this->request('POST', '/api/admin/twin9/import', $body, ['X-Migrate-Token' => 'wrong']);
        self::assertSame(403, $response->getStatusCode());

        // Nothing was written.
        self::assertSame(0, (int) Db::get()->query('SELECT COUNT(*) FROM twin9_protocole')->fetchColumn());
    }

    public function testImportUpsertsVersionsAndEnables(): void
    {
        $config = new Twin9Config(new SettingsRepository(Db::get()));
        self::assertFalse($config->isEnabled(), 'disabled until imported');

        $response = $this->request('POST', '/api/admin/twin9/import', [
            'files' => [
                'fictif/01-essai' => self::FAKE_GABARIT,
                'fictif/02-autre' => 'Deuxième gabarit FICTIF : {$SUJET}.',
            ],
            'config' => ['jury' => ['taille' => 5], 'seuils_consensus' => [0.5, 0.8]],
        ], ['X-Migrate-Token' => self::TOKEN]);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        self::assertSame(['imported' => 2, 'retires' => 0], self::json($response));

        self::assertTrue($config->isEnabled(), 'import flips enabled=true');
        self::assertSame(['taille' => 5], $config->pipeline()['jury']);

        // Idempotent re-import: same content, no version archived.
        $deux = ['fictif/01-essai' => self::FAKE_GABARIT, 'fictif/02-autre' => 'Deuxième gabarit FICTIF : {$SUJET}.'];
        $response = $this->request('POST', '/api/admin/twin9/import', ['files' => $deux], ['X-Migrate-Token' => self::TOKEN]);
        self::assertSame(200, $response->getStatusCode());
        self::assertSame(0, (int) Db::get()->query('SELECT COUNT(*) FROM twin9_protocole_versions')->fetchColumn());

        // Changed content: previous content archived as version 1.
        $response = $this->request('POST', '/api/admin/twin9/import', [
            'files' => ['fictif/01-essai' => 'Gabarit FICTIF modifié : {$PRENOM}.'] + $deux,
        ], ['X-Migrate-Token' => self::TOKEN]);
        self::assertSame(200, $response->getStatusCode());
        $stmt = Db::get()->query("SELECT version, content FROM twin9_protocole_versions WHERE name = 'fictif/01-essai'");
        $versions = $stmt->fetchAll();
        self::assertCount(1, $versions);
        self::assertSame(1, (int) $versions[0]['version']);
        self::assertSame(self::FAKE_GABARIT, (string) $versions[0]['content']);
    }

    /**
     * The import replaces the v9.8's set (T16): a template it no longer
     * carries — the pole files, whose fiches the base now gives — leaves the
     * set, its last content archived among its versions; carried again, it
     * comes back with its history.
     */
    public function testImportReplacesTheSetAndArchivesWhatItDrops(): void
    {
        $fiche = '# Pôle 1 — FICTIF' . "\n\n## 1.01 — Fiche FICTIVE\n";
        $response = $this->request('POST', '/api/admin/twin9/import', [
            'files' => ['fictif/01-essai' => self::FAKE_GABARIT, 'tagger/P1' => $fiche],
        ], ['X-Migrate-Token' => self::TOKEN]);
        self::assertSame(['imported' => 2, 'retires' => 0], self::json($response));

        $response = $this->request('POST', '/api/admin/twin9/import', ['files' => ['fictif/01-essai' => self::FAKE_GABARIT]],
            ['X-Migrate-Token' => self::TOKEN]);
        self::assertSame(['imported' => 1, 'retires' => 1], self::json($response));
        $repo = new ProtocoleRepository(Db::get());
        self::assertSame(['fictif/01-essai'], array_column($repo->list(), 'name'));
        self::assertNull($repo->get('tagger/P1'));
        self::assertSame($fiche, $repo->version('tagger/P1', 1)['content'] ?? null, 'gardé parmi ses versions');

        $this->request('POST', '/api/admin/twin9/import', ['files' => ['fictif/01-essai' => self::FAKE_GABARIT,
            'tagger/P1' => $fiche]], ['X-Migrate-Token' => self::TOKEN]);
        self::assertSame($fiche, $repo->get('tagger/P1')['content'] ?? null);
        self::assertSame([1], array_column($repo->versions('tagger/P1'), 'version'));
    }

    public function testImportStoresReferentielStructureServedByMeta(): void
    {
        // The import carries the non-secret referentiel structure (accented
        // pole names + codes/names) the client engine needs; only the clean
        // structure is kept and it surfaces through /api/twin9/meta.
        $response = $this->request('POST', '/api/admin/twin9/import', [
            'files' => ['fictif/01-essai' => self::FAKE_GABARIT],
            'referentiel' => [
                ['num' => 1, 'nom' => 'TÊTE — Penser & Comprendre', 'competences' => [
                    ['code' => '1.01', 'nom' => 'Pensée Critique & Anti-Hallucination', 'fiche' => 'SECRET À NE PAS STOCKER'],
                ]],
                ['num' => 2, 'nom' => 'CŒUR — Relier & Naviguer', 'competences' => []],
            ],
        ], ['X-Migrate-Token' => self::TOKEN]);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());

        $stored = (new Twin9Config(new SettingsRepository(Db::get())))->referentiel();
        self::assertSame('TÊTE — Penser & Comprendre', $stored[0]['nom'], 'accented pole name kept');
        self::assertSame('1.01', $stored[0]['competences'][0]['code']);
        self::assertArrayNotHasKey('fiche', $stored[0]['competences'][0], 'only code/nom kept, never fiche text');

        // Served to the client engine via meta.
        $admin = $this->registerAs('admin@example.org', 'Root Admin', ['admin']);
        $meta = self::json($this->as_($admin, 'GET', '/api/twin9/meta'));
        self::assertSame('CŒUR — Relier & Naviguer', $meta['referentiel'][1]['nom']);
    }

    // ==================================================================
    // The atelier: template sets (T14), authz
    // ==================================================================

    /** admin ∧ promptologue — les DEUX rôles requis pour voir et éditer les gabarits (AD-D2). */
    private function registerAsAtelier(string $email = 'atelier@example.org'): array
    {
        return $this->registerAs($email, 'Admin Prompto', ['admin', 'promptologue']);
    }

    /** The v9.8's set, as the import writes it: one made-up template. */
    private function seed(): void
    {
        (new ProtocoleRepository(Db::get()))->put('fictif/01-essai', self::FAKE_GABARIT, null);
    }

    /** A copy of the v9.8's set, its author's. */
    private function copie(array $atelier, string $id = 'essai'): void
    {
        $copie = $this->as_($atelier, 'POST', '/api/twin9/admin/jeux', ['id' => $id]);
        self::assertSame(201, $copie->getStatusCode(), (string) $copie->getBody());
    }

    private const COPIE = '/api/twin9/admin/jeux/essai/protocole/';

    /**
     * AD-D2 — matrice de rôles COMPLÈTE sur les routes de gabarits Twin9 : le
     * CONTENU (lecture ET écriture, versions, banc d'essai) et la copie du jeu
     * v9.8 exigent la CONJONCTION admin ∧ promptologue ; la SUPERVISION
     * (config, liste des jeux, jeu par défaut) reste admin seul. Le gabarit
     * ne fuite JAMAIS dans un refus.
     */
    public function testTemplateRoutesRequireAdminAndPromptologue(): void
    {
        $this->seed();
        $atelier = $this->registerAsAtelier();
        $this->copie($atelier);

        // Routes de CONTENU des gabarits et copie (les deux rôles requis).
        $contentRoutes = [
            ['GET', '/api/twin9/admin/jeux/v9.8/protocole', null],
            ['GET', '/api/twin9/admin/jeux/v9.8/protocole/fictif/01-essai', null],
            ['GET', '/api/twin9/admin/jeux/v9.8/protocole/fictif/01-essai/versions', null],
            ['GET', self::COPIE . 'fictif/01-essai', null],
            ['PUT', self::COPIE . 'fictif/01-essai', ['content' => 'x {$PRENOM}']],
            ['POST', '/api/twin9/admin/jeux/essai/tester', ['name' => 'fictif/01-essai']],
            ['POST', '/api/twin9/admin/jeux', ['id' => 'autre']],
        ];

        // 1. Visiteur (aucune session) -> 401 partout.
        $this->cookieSid = null;
        foreach ($contentRoutes as [$method, $path, $body]) {
            self::assertSame(401, $this->request($method, $path, $body)->getStatusCode(), "$method $path (visiteur)");
        }

        // 2. Promptologue SEUL -> 403 sur tout le contenu, aucun fragment fuité.
        $promptologue = $this->registerAs('promptologue@example.org', 'Promteur', ['promptologue']);
        foreach ($contentRoutes as [$method, $path, $body]) {
            $resp = $this->as_($promptologue, $method, $path, $body);
            self::assertSame(403, $resp->getStatusCode(), "$method $path (promptologue seul)");
            self::assertStringNotContainsString('FICTIF', (string) $resp->getBody(), 'no template fragment in the refusal');
            self::assertStringNotContainsString('updated_at', (string) $resp->getBody(), 'no metadata in the refusal');
        }

        // 3. Admin SEUL (non-promptologue) -> 403 sur le contenu des gabarits
        //    (le changement AD-D2 : un admin ne voit plus le contenu), aucun leak.
        $admin = $this->registerAs('admin@example.org', 'Root Admin', ['admin']);
        foreach ($contentRoutes as [$method, $path, $body]) {
            $resp = $this->as_($admin, $method, $path, $body);
            self::assertSame(403, $resp->getStatusCode(), "$method $path (admin seul)");
            self::assertStringNotContainsString('FICTIF', (string) $resp->getBody(), 'no template fragment in the refusal');
        }

        // 4. Admin ∧ promptologue -> 2xx sur le contenu.
        foreach ($contentRoutes as [$method, $path, $body]) {
            $resp = $this->as_($atelier, $method, $path, $body);
            self::assertContains($resp->getStatusCode(), [200, 201], "$method $path (admin ∧ promptologue) : " . (string) $resp->getBody());
        }

        // SUPERVISION (config, liste des jeux, jeu par défaut) : reste admin
        // seul — l'admin seul PASSE, le promptologue seul est refusé, et un
        // refus n'ouvre pas la promo.
        self::assertSame(200, $this->as_($admin, 'GET', '/api/twin9/admin/config')->getStatusCode());
        self::assertSame(200, $this->as_($admin, 'GET', '/api/twin9/admin/jeux')->getStatusCode());
        self::assertSame(200, $this->as_($admin, 'PUT', '/api/twin9/admin/jeux/defaut', ['jeu' => 'essai'])->getStatusCode());
        self::assertSame(403, $this->as_($promptologue, 'GET', '/api/twin9/admin/config')->getStatusCode());
        self::assertSame(403, $this->as_($promptologue, 'GET', '/api/twin9/admin/jeux')->getStatusCode());
        self::assertSame(403, $this->as_($promptologue, 'PUT', '/api/twin9/admin/jeux/defaut', ['jeu' => 'v9.8'])->getStatusCode());
        $putConfig = $this->as_($promptologue, 'PUT', '/api/twin9/admin/config', ['twin9_cle_perso_ouverte' => true]);
        self::assertSame(403, $putConfig->getStatusCode());
        self::assertFalse(
            (new Twin9Config(new SettingsRepository(Db::get())))->clePersoOuverte(),
            'the refused PUT must not have opened the promo',
        );
    }

    // ==================================================================
    // A copy: extraction, list without content, versions
    // ==================================================================

    public function testPutExtractsVariablesAndListsWithoutContent(): void
    {
        $this->seed();
        $atelier = $this->registerAsAtelier();
        $this->copie($atelier);

        $nouveau = "Gabarit FICTIF retouché.\nBonjour {\$PRENOM}, examine {\$TEXTE_JOURNEE} pour le pôle {\$POLE_ID}, {\$PRENOM}.";
        $put = $this->as_($atelier, 'PUT', self::COPIE . 'fictif/01-essai', ['content' => $nouveau]);
        self::assertSame(200, $put->getStatusCode(), (string) $put->getBody());
        $body = self::json($put);
        self::assertSame('updated', $body['status']);
        // Order of first appearance, duplicates collapsed ({$PRENOM} twice).
        self::assertSame(['PRENOM', 'TEXTE_JOURNEE', 'POLE_ID'], $body['variables']);

        // List: metadata only, never the content.
        $list = self::json($this->as_($atelier, 'GET', '/api/twin9/admin/jeux/essai/protocole'));
        self::assertCount(1, $list['protocole']);
        $entry = $list['protocole'][0];
        self::assertSame('fictif/01-essai', $entry['name']);
        self::assertSame(mb_strlen($nouveau), $entry['longueur']);
        self::assertSame(['PRENOM', 'TEXTE_JOURNEE', 'POLE_ID'], $entry['variables']);
        self::assertArrayHasKey('updated_at', $entry);
        self::assertArrayNotHasKey('content', $entry);

        // Detail (atelier-only content read) returns the content; the v9.8's is as it was.
        self::assertSame($nouveau, self::json($this->as_($atelier, 'GET', self::COPIE . 'fictif/01-essai'))['content']);
        self::assertSame(self::FAKE_GABARIT,
            self::json($this->as_($atelier, 'GET', '/api/twin9/admin/jeux/v9.8/protocole/fictif/01-essai'))['content']);

        // Unknown template, unknown set: generic 404.
        self::assertSame(404, $this->as_($atelier, 'GET', self::COPIE . 'fictif/inconnu')->getStatusCode());
        $inconnu = $this->as_($atelier, 'GET', '/api/twin9/admin/jeux/inconnu/protocole');
        self::assertSame(404, $inconnu->getStatusCode());
        self::assertSame('Jeu de gabarits introuvable', self::json($inconnu)['error']);
    }

    public function testPutValidation(): void
    {
        $this->seed();
        $atelier = $this->registerAsAtelier();
        $this->copie($atelier);

        self::assertSame(422, $this->as_($atelier, 'PUT', self::COPIE . 'fictif/01-essai', ['content' => ''])->getStatusCode());
        self::assertSame(422, $this->as_($atelier, 'PUT', self::COPIE . 'fictif/01-essai', ['content' => '   '])->getStatusCode());
        $huge = str_repeat('a', 262144);
        self::assertSame(422, $this->as_($atelier, 'PUT', self::COPIE . 'fictif/01-essai', ['content' => $huge])->getStatusCode());
        // A copy has the v9.8's templates and no other: no name is created.
        self::assertSame(404, $this->as_($atelier, 'PUT', self::COPIE . 'fictif//double', ['content' => 'x'])->getStatusCode());
        self::assertSame(404, $this->as_($atelier, 'PUT', self::COPIE . 'fictif/02-nouveau', ['content' => 'x'])->getStatusCode());
        self::assertSame(1, (int) Db::get()->query("SELECT COUNT(*) FROM twin9_jeux_gabarits WHERE jeu = 'essai'")->fetchColumn());
    }

    /**
     * A variable no step gives the template is refused: its step is given
     * those the contract names and those its v9.8 original uses.
     */
    public function testAVariableNoStepGivesIsRefused(): void
    {
        $this->seed();
        (new ProtocoleRepository(Db::get()))->put('lourd/21a-accusation', 'Accusation FICTIVE de {$CODE} : {$DOSSIER}', null);
        (new ProtocoleRepository(Db::get()))->put('tagger/P1', '# Pôle FICTIF', null);
        $atelier = $this->registerAsAtelier();
        $this->copie($atelier);

        // the v9.8 original's variables, and the contract's for the step (lourd/21a-accusation: NOM, COMPETENCE_FICHE…)
        self::assertSame(200, $this->as_($atelier, 'PUT', self::COPIE . 'fictif/01-essai',
            ['content' => 'FICTIF {$POLE_ID} {$PRENOM}'])->getStatusCode());
        self::assertSame(200, $this->as_($atelier, 'PUT', self::COPIE . 'lourd/21a-accusation',
            ['content' => 'Accusation FICTIVE de {$CODE} ({$NOM}) : {$DOSSIER} {$COMPETENCE_FICHE}'])->getStatusCode());

        $refus = $this->as_($atelier, 'PUT', self::COPIE . 'lourd/21a-accusation',
            ['content' => 'Accusation FICTIVE de {$CODE} : {$PLAIDOIRIE} {$CODEE}']);
        self::assertSame(422, $refus->getStatusCode());
        self::assertSame('Variables qu’aucune étape ne fournit à ce gabarit : {$PLAIDOIRIE}, {$CODEE}',
            self::json($refus)['error']);
        $refus = $this->as_($atelier, 'PUT', self::COPIE . 'fictif/01-essai', ['content' => 'FICTIF {$NOM}']);
        self::assertSame('Variable qu’aucune étape ne fournit à ce gabarit : {$NOM}', self::json($refus)['error']);
        // a fiche of the referential is given none
        self::assertSame(422, $this->as_($atelier, 'PUT', self::COPIE . 'tagger/P1',
            ['content' => '# Pôle FICTIF {$POLE_NOM}'])->getStatusCode());
        self::assertSame(200, $this->as_($atelier, 'PUT', self::COPIE . 'tagger/P1',
            ['content' => '# Pôle FICTIF retouché'])->getStatusCode());
        self::assertSame(['CODE', 'NOM', 'DOSSIER', 'COMPETENCE_FICHE'],
            self::json($this->as_($atelier, 'GET', self::COPIE . 'lourd/21a-accusation'))['variables']);
    }

    public function testEditArchivesVersions(): void
    {
        $this->seed();
        $atelier = $this->registerAsAtelier();
        $this->copie($atelier);
        $chemin = self::COPIE . 'fictif/01-essai';

        $this->as_($atelier, 'PUT', $chemin, ['content' => 'V1 fictif {$PRENOM}']);
        $this->as_($atelier, 'PUT', $chemin, ['content' => 'V2 fictif {$PRENOM} {$POLE_ID}']);
        $put3 = $this->as_($atelier, 'PUT', $chemin, ['content' => 'V3 fictif {$TEXTE_JOURNEE}']);
        self::assertSame('updated', self::json($put3)['status']);

        $versions = self::json($this->as_($atelier, 'GET', $chemin . '/versions'));
        self::assertSame('fictif/01-essai', $versions['name']);
        self::assertSame([3, 2, 1], array_column($versions['versions'], 'version'), 'most recent first');
        self::assertSame([['PRENOM', 'POLE_ID'], ['PRENOM'], ['PRENOM', 'TEXTE_JOURNEE', 'POLE_ID']],
            array_column($versions['versions'], 'variables'), 'the copy\'s history starts with the v9.8\'s content');
        self::assertArrayNotHasKey('content', $versions['versions'][0], 'history list is metadata only');

        // Unchanged PUT: no-op, no new version.
        $again = $this->as_($atelier, 'PUT', $chemin, ['content' => 'V3 fictif {$TEXTE_JOURNEE}']);
        self::assertSame('unchanged', self::json($again)['status']);
        self::assertSame(3, (int) Db::get()->query('SELECT COUNT(*) FROM twin9_jeux_versions')->fetchColumn());
        self::assertSame(0, (int) Db::get()->query('SELECT COUNT(*) FROM twin9_protocole_versions')->fetchColumn());

        self::assertSame(404, $this->as_($atelier, 'GET', self::COPIE . 'fictif/inconnu/versions')->getStatusCode());
    }

    public function testVersionContentAndRestoreNeverRewriteHistory(): void
    {
        // D13 (ADR-010 §6 « retour arrière ») : lecture d'une version archivée
        // puis restauration NON destructive (le vivant est archivé d'abord).
        $this->seed();
        $atelier = $this->registerAsAtelier();
        $this->copie($atelier);
        $chemin = self::COPIE . 'fictif/01-essai';

        $this->as_($atelier, 'PUT', $chemin, ['content' => 'V2 fictif {$PRENOM}']);

        // Contenu d'une version archivée (v1 = le contenu copié du jeu v9.8).
        $v1 = self::json($this->as_($atelier, 'GET', $chemin . '/versions/1'));
        self::assertSame(self::FAKE_GABARIT, $v1['content']);
        self::assertSame(['PRENOM', 'TEXTE_JOURNEE', 'POLE_ID'], $v1['variables']);
        self::assertSame(404, $this->as_($atelier, 'GET', $chemin . '/versions/9')->getStatusCode());

        // Restauration de v1 : le vivant redevient V1, l'ex-vivant (V2) est archivé.
        $restore = self::json($this->as_($atelier, 'POST', $chemin . '/restore', ['version' => 1]));
        self::assertSame('updated', $restore['status']);
        self::assertSame(1, $restore['restored_from']);
        self::assertSame(self::FAKE_GABARIT, self::json($this->as_($atelier, 'GET', $chemin))['content']);
        // Historique COMPLET : v1 (l'original) + v2 (l'ex-vivant V2) — rien d'écrasé.
        $versions = self::json($this->as_($atelier, 'GET', $chemin . '/versions'));
        self::assertSame([2, 1], array_column($versions['versions'], 'version'));

        // Restaurer une version identique au vivant : no-op annoncé, pas de version en plus.
        $noop = self::json($this->as_($atelier, 'POST', $chemin . '/restore', ['version' => 1]));
        self::assertSame('unchanged', $noop['status']);
        self::assertSame(2, (int) Db::get()->query('SELECT COUNT(*) FROM twin9_jeux_versions')->fetchColumn());

        // Validation : version manquante/invalide -> 422 ; gabarit inconnu -> 404.
        self::assertSame(422, $this->as_($atelier, 'POST', $chemin . '/restore', [])->getStatusCode());
        self::assertSame(404, $this->as_($atelier, 'POST', self::COPIE . 'fictif/inconnu/restore', ['version' => 1])->getStatusCode());
    }

    public function testVersionAndRestoreRequireBothRoles(): void
    {
        // Même garde conjonctive que le contenu vivant : un admin SEUL n'a pas
        // accès au contenu archivé et ne peut pas restaurer.
        $this->seed();
        $atelier = $this->registerAsAtelier();
        $this->copie($atelier);
        $this->as_($atelier, 'PUT', self::COPIE . 'fictif/01-essai', ['content' => 'V2 fictif']);

        $adminSeul = $this->registerAs('admin-seul@example.org', 'Admin Seul', ['admin']);
        self::assertSame(403, $this->as_($adminSeul, 'GET', self::COPIE . 'fictif/01-essai/versions/1')->getStatusCode());
        self::assertSame(403, $this->as_($adminSeul, 'POST', self::COPIE . 'fictif/01-essai/restore', ['version' => 1])->getStatusCode());
    }

    /**
     * The v9.8's set is read-only in the atelier: no edit, no restore, by
     * anyone; another's copy is read, never written; the import alone writes
     * the v9.8's set.
     */
    public function testTheV98SetIsReadOnlyAndACopyIsItsAuthors(): void
    {
        $this->seed();
        (new ProtocoleRepository(Db::get()))->put('fictif/01-essai', 'Ancien FICTIF {$PRENOM}', null);
        (new ProtocoleRepository(Db::get()))->put('fictif/01-essai', self::FAKE_GABARIT, null);
        $avant = Db::get()->query('SELECT * FROM twin9_protocole')->fetchAll();
        $versionsAvant = Db::get()->query('SELECT * FROM twin9_protocole_versions')->fetchAll();
        $atelier = $this->registerAsAtelier();
        $autre = $this->registerAsAtelier('autre@example.org');
        $this->copie($atelier);

        $v98 = '/api/twin9/admin/jeux/v9.8/protocole/fictif/01-essai';
        foreach ([$atelier, $autre] as $user) {
            $refus = $this->as_($user, 'PUT', $v98, ['content' => 'Piratage FICTIF {$PRENOM}']);
            self::assertSame(403, $refus->getStatusCode());
            self::assertSame('Le jeu v9.8 est en lecture seule : copiez-le pour le modifier', self::json($refus)['error']);
            self::assertSame(403, $this->as_($user, 'POST', $v98 . '/restore', ['version' => 1])->getStatusCode());
        }
        // another's copy: read, never written
        self::assertSame(200, $this->as_($autre, 'GET', self::COPIE . 'fictif/01-essai')->getStatusCode());
        $refus = $this->as_($autre, 'PUT', self::COPIE . 'fictif/01-essai', ['content' => 'Pris FICTIF {$PRENOM}']);
        self::assertSame(403, $refus->getStatusCode());
        self::assertSame('Seul l’auteur d’une copie la modifie', self::json($refus)['error']);
        self::assertSame(403, $this->as_($autre, 'POST', self::COPIE . 'fictif/01-essai/restore', ['version' => 1])
            ->getStatusCode());
        // the author edits and restores their copy
        self::assertSame(200, $this->as_($atelier, 'PUT', self::COPIE . 'fictif/01-essai', ['content' => 'Mien FICTIF'])
            ->getStatusCode());
        self::assertSame(200, $this->as_($atelier, 'POST', self::COPIE . 'fictif/01-essai/restore', ['version' => 1])
            ->getStatusCode());

        self::assertSame($avant, Db::get()->query('SELECT * FROM twin9_protocole')->fetchAll(), 'le jeu v9.8 ne change pas');
        self::assertSame($versionsAvant, Db::get()->query('SELECT * FROM twin9_protocole_versions')->fetchAll());
    }

    /** A copy: a valid name, free, of a v9.8's set that is there; its author's. */
    public function testACopyOfTheV98Set(): void
    {
        $atelier = $this->registerAsAtelier();
        $vide = $this->as_($atelier, 'POST', '/api/twin9/admin/jeux', ['id' => 'essai']);
        self::assertSame(409, $vide->getStatusCode(), 'nothing imported, nothing to copy');
        self::assertSame(0, (int) Db::get()->query('SELECT COUNT(*) FROM twin9_jeux')->fetchColumn());

        $this->seed();
        (new ProtocoleRepository(Db::get()))->put('fictif/02-autre', 'Deuxième gabarit FICTIF : {$SUJET}.', null);
        $copie = $this->as_($atelier, 'POST', '/api/twin9/admin/jeux', ['id' => 'essai-1.b_c']);
        self::assertSame(201, $copie->getStatusCode());
        self::assertSame(['id' => 'essai-1.b_c', 'gabarits' => 2], self::json($copie));
        foreach (['', 'Essai', 'é', '-essai', 'a b', str_repeat('a', 65), 'a/b'] as $invalide) {
            self::assertSame(422, $this->as_($atelier, 'POST', '/api/twin9/admin/jeux', ['id' => $invalide])->getStatusCode(),
                $invalide);
        }
        foreach (['v9.8', 'essai-1.b_c'] as $pris) {
            $refus = $this->as_($atelier, 'POST', '/api/twin9/admin/jeux', ['id' => $pris]);
            self::assertSame(409, $refus->getStatusCode(), $pris);
            self::assertSame('Ce nom est déjà pris', self::json($refus)['error']);
        }

        $jeux = self::json($this->as_($atelier, 'GET', '/api/twin9/admin/jeux'));
        self::assertSame('v9.8', $jeux['defaut']);
        self::assertSame([
            ['id' => 'v9.8', 'auteur' => null, 'mien' => false, 'gabarits' => 2, 'defaut' => true],
            ['id' => 'essai-1.b_c', 'auteur' => 'Admin Prompto', 'mien' => true, 'gabarits' => 2, 'defaut' => false],
        ], array_map(static fn (array $j): array => array_diff_key($j, ['created_at' => 1]), $jeux['jeux']));
        // the copy's templates are the v9.8's, without their history
        $copies = Db::get()->query("SELECT name, content FROM twin9_jeux_gabarits WHERE jeu = 'essai-1.b_c' ORDER BY name")
            ->fetchAll(\PDO::FETCH_KEY_PAIR);
        self::assertSame(Db::get()->query('SELECT name, content FROM twin9_protocole ORDER BY name')->fetchAll(\PDO::FETCH_KEY_PAIR),
            $copies);
        self::assertSame(0, (int) Db::get()->query('SELECT COUNT(*) FROM twin9_jeux_versions')->fetchColumn());
    }

    /** The administrator fixes the instance's default set among those it has. */
    public function testTheAdministratorFixesTheDefaultSet(): void
    {
        $this->seed();
        $atelier = $this->registerAsAtelier();
        $this->copie($atelier);
        $admin = $this->registerAs('admin@example.org', 'Root Admin', ['admin']);

        self::assertSame(['defaut' => 'essai'],
            self::json($this->as_($admin, 'PUT', '/api/twin9/admin/jeux/defaut', ['jeu' => 'essai'])));
        self::assertSame('essai', self::json($this->as_($admin, 'GET', '/api/twin9/admin/jeux'))['defaut']);
        self::assertSame(404, $this->as_($admin, 'PUT', '/api/twin9/admin/jeux/defaut', ['jeu' => 'inconnu'])->getStatusCode());
        self::assertSame(422, $this->as_($admin, 'PUT', '/api/twin9/admin/jeux/defaut', [])->getStatusCode());
        self::assertSame(['defaut' => 'v9.8'],
            self::json($this->as_($admin, 'PUT', '/api/twin9/admin/jeux/defaut', ['jeu' => 'v9.8'])));
    }

    // ==================================================================
    // Rendering (tester bench) — missing variables stay verbatim
    // ==================================================================

    public function testTesterRendersAndReportsUnresolved(): void
    {
        $this->seed();
        $atelier = $this->registerAsAtelier();
        $this->copie($atelier);
        $this->as_($atelier, 'PUT', self::COPIE . 'fictif/01-essai', ['content' => 'Salut {$PRENOM}, pôle {$POLE_ID}.']);

        $response = $this->as_($atelier, 'POST', '/api/twin9/admin/jeux/v9.8/tester', [
            'name' => 'fictif/01-essai',
            'variables' => ['PRENOM' => 'Ada', 'POLE_ID' => 'pole-7'],
        ]);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        $body = self::json($response);

        self::assertStringContainsString('Bonjour Ada', $body['rendu']);
        self::assertStringContainsString('pôle pole-7', $body['rendu']);
        // Non-strict like templates.py: the absent variable stays verbatim.
        self::assertStringContainsString('{$TEXTE_JOURNEE}', $body['rendu']);
        self::assertSame(['TEXTE_JOURNEE'], $body['non_resolues']);

        // the copy's template, in the copy's bench
        $copie = self::json($this->as_($atelier, 'POST', '/api/twin9/admin/jeux/essai/tester', [
            'name' => 'fictif/01-essai', 'variables' => ['PRENOM' => 'Ada', 'POLE_ID' => 'pole-7'],
        ]));
        self::assertSame(['rendu' => 'Salut Ada, pôle pole-7.', 'non_resolues' => []], $copie);

        self::assertSame(404, $this->as_($atelier, 'POST', '/api/twin9/admin/jeux/essai/tester', ['name' => 'fictif/inconnu'])->getStatusCode());
        self::assertSame(422, $this->as_($atelier, 'POST', '/api/twin9/admin/jeux/essai/tester', ['variables' => []])->getStatusCode());
    }

    public function testExtractionRegexMatchesPythonTemplates(): void
    {
        // {$VAR} with VAR = [A-Z_][A-Z0-9_]* — lowercase/edge forms ignored.
        $content = 'a {$OK} b {$_AUSSI_OK2} c {$pas_ok} d {$2PAS} e {VAR} f {$OK}';
        self::assertSame(['OK', '_AUSSI_OK2'], ProtocoleRepository::extractVariables($content));
    }

    // ==================================================================
    // Config: defaults, bounds (422), public view with margin
    // ==================================================================

    public function testConfigDefaultsAndBoundedUpdate(): void
    {
        $admin = $this->registerAs('admin@example.org', 'Root Admin', ['admin']);

        $config = self::json($this->as_($admin, 'GET', '/api/twin9/admin/config'));
        // Contribution per protocole (owner decision 2026-07-15): Twin9 +20 %
        // (proprietary R&D), Twin6 +10 % (open, cost recovery); packs start at
        // 10 USD so the PayPal FIXED fee stays well below the margin.
        self::assertSame(1.2, $config['marge']);
        self::assertSame(1.1, $config['marge_twin6']);
        self::assertFalse($config['twin9_cle_perso_ouverte']); // promo closed by default
        self::assertFalse($config['enabled']);
        self::assertSame([10, 20, 50, 100, 200, 500], array_column($config['packs'], 'montant_usd'));
        self::assertSame([1, 5], $config['modeles']['claude-haiku-4-5-20251001']['prix_usd_mtok']);
        self::assertSame(['taggers', 'rapide'], $config['modeles']['claude-haiku-4-5-20251001']['etages']);
        self::assertSame(['taggers', 'rapide', 'tribunal'], $config['modeles']['claude-sonnet-5']['etages']);
        self::assertSame(['tribunal'], $config['modeles']['claude-opus-4-8']['etages']);

        // Out-of-bounds updates: 422, nothing persisted.
        foreach ([
            ['marge' => 0.5],
            ['marge' => 5.1],
            ['marge' => 'deux'],
            ['marge_twin6' => 0.5],
            ['marge_twin6' => 5.1],
            ['twin9_cle_perso_ouverte' => 'oui'],
            ['packs' => []],
            ['packs' => [['montant_usd' => 0.5, 'libelle' => 'trop petit']]],
            ['packs' => [['montant_usd' => 750, 'libelle' => 'trop gros']]],
            ['packs' => [['montant_usd' => 5, 'libelle' => '']]],
            ['modeles' => []],
            ['modeles' => ['m' => ['prix_usd_mtok' => [0, 5], 'etages' => ['taggers']]]],
            ['modeles' => ['m' => ['prix_usd_mtok' => [1, 5], 'etages' => ['penthouse']]]],
            ['enabled' => 'oui'],
            ['inconnue' => true],
        ] as $invalid) {
            $response = $this->as_($admin, 'PUT', '/api/twin9/admin/config', $invalid);
            self::assertSame(422, $response->getStatusCode(), json_encode($invalid));
        }
        self::assertSame(1.2, self::json($this->as_($admin, 'GET', '/api/twin9/admin/config'))['marge']);

        // Valid partial update persists (incl. the promo toggle).
        $response = $this->as_($admin, 'PUT', '/api/twin9/admin/config', ['marge' => 2.5, 'twin9_cle_perso_ouverte' => true]);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        $after = self::json($this->as_($admin, 'GET', '/api/twin9/admin/config'));
        self::assertSame(2.5, $after['marge']);
        self::assertTrue($after['twin9_cle_perso_ouverte']);
    }

    public function testPublicViewAppliesMarginAndPaypalFlag(): void
    {
        $config = new Twin9Config(new SettingsRepository(Db::get()));
        $config->update(['marge' => 2.0]);

        TestDb::setEnv('PAYPAL_CLIENT_ID', '');
        $view = $config->publicView();
        self::assertFalse($view['enabled']);
        self::assertFalse($view['paypalConfigured']);
        // List price [3, 15] × margin 2 — the raw price and the margin are absent.
        self::assertSame([6.0, 30.0], $view['modeles']['claude-sonnet-5']['prix_usd_mtok']);
        self::assertArrayNotHasKey('marge', $view);

        TestDb::setEnv('PAYPAL_CLIENT_ID', 'sandbox-client-id');
        self::assertTrue($config->publicView()['paypalConfigured']);

        // Per-token charged price for the debit path: micro-USD, ceil.
        self::assertSame([6, 30], $config->prixMicrousdParToken('claude-sonnet-5'));
        self::assertNull($config->prixMicrousdParToken('modele-inconnu'));
    }
}
