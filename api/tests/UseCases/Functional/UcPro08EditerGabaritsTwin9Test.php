<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Db;
use Humanome\Llm\LlmRuntime;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\CartographeTestCase;
use Humanome\Tests\LlmFakeHttpClient;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\TwinSupport;
use Humanome\Twin9\Twin9Config;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-PRO-08 — Éditer les gabarits du Golden Prompt Twin9 : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/promptologue/UC-PRO-08-editer-gabarits-twin9.md
 *
 * L'atelier est rejoué à travers l'API HTTP (Slim en processus, vraie base
 * MySQL) avec les chemins EXACTS qu'envoie le front : jeu, puis nom
 * hiérarchique encodé « lourd%2F20-greffier ». L'import technique (script de
 * déploiement, X-Migrate-Token) écrit le jeu v9.8, précondition et scénario
 * alternatif ; l'atelier le lit, en fait une copie et n'écrit que celle-ci
 * (T14). L'effet d'une copie éditée sur le prompt d'un run (F09) se rejoue
 * dans api/tests/Twin9/JeuxGabaritsTest.php, où le moteur factice est chargé.
 * Tous les gabarits sont FICTIFS ; aucun appel réseau (faux client HTTP).
 */
final class UcPro08EditerGabaritsTwin9Test extends CartographeTestCase
{
    private const TOKEN = 'migrate-token-uc-pro-08';
    private const ENC = 'lourd%2F20-greffier';

    /** @var array{id: int, csrf: string, sid: string} */
    private array $atelier;

    protected function setUp(): void
    {
        parent::setUp();
        $pdo = Db::get();
        $pdo->exec('DELETE FROM twin9_protocole_versions');
        $pdo->exec('DELETE FROM twin9_protocole');
        $pdo->exec('DELETE FROM twin9_jeux');
        $pdo->exec("DELETE FROM settings WHERE name IN ('twin9_config', 'twin9_referentiel', 'twin9_gabarits_defaut')");
        TestDb::setEnv('MIGRATE_TOKEN', self::TOKEN);
        $this->atelier = $this->registerAs('camille@example.org', 'Camille', ['admin', 'promptologue']);
    }

    protected function tearDown(): void
    {
        LlmRuntime::setHttpClient(null);
        parent::tearDown();
    }

    /** Précondition : le script d'import scripts/twin9/import-protocole.mjs (X-Migrate-Token) importe les gabarits (A4). */
    private function importer(array $files, array $extra = []): ResponseInterface
    {
        $this->cookieSid = null;

        return $this->request('POST', '/api/admin/twin9/import', array_merge(['files' => $files], $extra), ['X-Migrate-Token' => self::TOKEN]);
    }

    /** A route of the atelier, under /api/twin9/admin/jeux: « /essai/protocole/… », « /v9.8/tester »… */
    private function atelier(string $method, string $path, ?array $body = null, ?array $user = null): ResponseInterface
    {
        return $this->as_($user ?? $this->atelier, $method, '/api/twin9/admin/jeux' . $path, $body);
    }

    /** « Copier le jeu v9.8 » : la copie « essai », celle de l'atelier. */
    private function copier(): void
    {
        self::assertSame(201, $this->atelier('POST', '', ['id' => 'essai'])->getStatusCode());
    }

    #[TestDox('UC-PRO-08-F08 — nominal : jeu v9.8 lu → copie → liste sans contenu → lecture (nom encodé %2F) → édition versionnée → historique → version archivée → restauration → banc d’essai ; le jeu v9.8 ne bouge pas')]
    public function testF08NominalEditingSession(): void
    {
        $this->importer(['lourd/20-greffier' => TwinSupport::GABARIT_GREFFIER, 'tagger/1-tag-pole' => TwinSupport::GABARIT_TAG]);

        $jeux = self::json($this->atelier('GET', ''));
        self::assertSame(['v9.8', [['v9.8', 2, false]]], [$jeux['defaut'],
            array_map(static fn (array $j): array => [$j['id'], $j['gabarits'], $j['mien']], $jeux['jeux'])]);
        $liste = self::json($this->atelier('GET', '/v9.8/protocole'));
        self::assertSame(['lourd/20-greffier', 'tagger/1-tag-pole'], array_column($liste['protocole'], 'name'));
        self::assertStringNotContainsString('Greffier FICTIF', json_encode($liste, JSON_UNESCAPED_UNICODE));
        self::assertSame(TwinSupport::GABARIT_GREFFIER, self::json($this->atelier('GET', '/v9.8/protocole/' . self::ENC))['content']);

        $this->copier();
        self::assertSame(['lourd/20-greffier', 'tagger/1-tag-pole'],
            array_column(self::json($this->atelier('GET', '/essai/protocole'))['protocole'], 'name'));
        $lu = self::json($this->atelier('GET', '/essai/protocole/' . self::ENC));
        self::assertSame(TwinSupport::GABARIT_GREFFIER, $lu['content']);

        $nouveau = TwinSupport::GABARIT_GREFFIER . "\nPôle nommé : {\$POLE_NOM}";
        $put = self::json($this->atelier('PUT', '/essai/protocole/' . self::ENC, ['content' => $nouveau]));
        self::assertSame(['name' => 'lourd/20-greffier', 'variables' => ['COMPETENCE_FICHE', 'POLE_FICHES', 'CODE', 'EXTRAIT', 'POLE_NOM'], 'status' => 'updated'], $put);
        // A1 : même contenu renvoyé → « unchanged », aucune version créée.
        self::assertSame('unchanged', self::json($this->atelier('PUT', '/essai/protocole/' . self::ENC, ['content' => $nouveau]))['status']);

        $versions = self::json($this->atelier('GET', '/essai/protocole/' . self::ENC . '/versions'));
        self::assertSame('lourd/20-greffier', $versions['name']);
        self::assertSame([1], array_column($versions['versions'], 'version'));
        self::assertSame(TwinSupport::GABARIT_GREFFIER, self::json($this->atelier('GET', '/essai/protocole/' . self::ENC . '/versions/1'))['content']);

        $restore = self::json($this->atelier('POST', '/essai/protocole/' . self::ENC . '/restore', ['version' => 1]));
        self::assertSame(['updated', 1], [$restore['status'], $restore['restored_from']]);
        self::assertSame(TwinSupport::GABARIT_GREFFIER, self::json($this->atelier('GET', '/essai/protocole/' . self::ENC))['content']);
        self::assertSame([2, 1], array_column(self::json($this->atelier('GET', '/essai/protocole/' . self::ENC . '/versions'))['versions'], 'version'));
        // A2 : restaurer une version identique au vivant ne crée rien.
        $encore = self::json($this->atelier('POST', '/essai/protocole/' . self::ENC . '/restore', ['version' => 1]));
        self::assertSame(['unchanged', 1], [$encore['status'], $encore['restored_from']]);
        self::assertSame([2, 1], array_column(self::json($this->atelier('GET', '/essai/protocole/' . self::ENC . '/versions'))['versions'], 'version'));

        // A3 : le banc d'essai ne fait AUCUN appel au modèle et ne débite rien.
        $http = new LlmFakeHttpClient();
        LlmRuntime::setHttpClient($http);
        $rendu = self::json($this->atelier('POST', '/essai/tester', ['name' => 'lourd/20-greffier', 'variables' => ['CODE' => '1.01', 'EXTRAIT' => 'x']]));
        self::assertStringContainsString('Code 1.01 — extrait : x', $rendu['rendu']);
        self::assertSame(['COMPETENCE_FICHE', 'POLE_FICHES'], $rendu['non_resolues'], 'le banc d’essai n’injecte pas les fiches');
        self::assertSame([], $http->requests);
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM twin9_credit_events')->fetchColumn());
        self::assertSame($this->atelier['id'], (int) self::$pdo->query("SELECT updated_by FROM twin9_jeux_gabarits WHERE name = 'lourd/20-greffier'")->fetchColumn(), 'édition attribuée');

        // le jeu v9.8 n'a pas bougé : ni contenu, ni version, ni auteur
        self::assertSame([['lourd/20-greffier', TwinSupport::GABARIT_GREFFIER, null], ['tagger/1-tag-pole', TwinSupport::GABARIT_TAG, null]],
            self::$pdo->query('SELECT name, content, updated_by FROM twin9_protocole ORDER BY name')->fetchAll(\PDO::FETCH_NUM));
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM twin9_protocole_versions')->fetchColumn());
    }

    #[TestDox('UC-PRO-08-F10 — A4 : import technique (X-Migrate-Token) — gabarits et structure du référentiel ; les réglages et les fiches qu’enverrait un ancien script sont ignorés, rien n’est gardé d’eux ; réimport identique sans nouvelle version, chaque gabarit déjà là à l’octet (inchanges)')]
    public function testF10TechnicalImport(): void
    {
        $response = $this->importer(
            ['lourd/20-greffier' => TwinSupport::GABARIT_GREFFIER, 'tagger/1-tag-pole' => TwinSupport::GABARIT_TAG],
            ['config' => ['jury' => ['taille_aleatoire' => 5]], 'referentiel' => TwinSupport::referentielFictif(), 'fiches' => TwinSupport::fichesFictives()],
        );
        self::assertSame(['imported' => 2, 'inchanges' => 0, 'retires' => 0], self::json($response));

        // Depuis le 2026-10-20, ni réglages du pipeline, ni interrupteur, ni fiches :
        // les runs prennent les leurs dans leur profil (T12) et dans la base (T16).
        self::assertSame(0, (int) self::$pdo->query(
            "SELECT COUNT(*) FROM settings WHERE name IN ('twin9_config', 'twin9_fiches')")->fetchColumn());
        self::assertSame(['lourd/20-greffier', 'tagger/1-tag-pole'],
            self::$pdo->query('SELECT name FROM twin9_protocole ORDER BY name')->fetchAll(\PDO::FETCH_COLUMN));
        $apprenant = $this->registerAs('lea@example.org', 'Léa', ['apprenant']);
        $metaRaw = (string) $this->as_($apprenant, 'GET', '/api/twin9/meta')->getBody();
        $meta = json_decode($metaRaw, true);
        self::assertSame('CŒUR — Relier & Naviguer', $meta['referentiel'][1]['nom']);
        self::assertStringNotContainsString('FICHE FICTIVE', $metaRaw, 'aucune fiche servie');
        self::assertStringNotContainsString('lourd/20-greffier', $metaRaw, 'les noms des gabarits non plus, depuis T11');

        self::assertSame(['imported' => 2, 'inchanges' => 2, 'retires' => 0], self::json($this->importer(['lourd/20-greffier' => TwinSupport::GABARIT_GREFFIER, 'tagger/1-tag-pole' => TwinSupport::GABARIT_TAG])));
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM twin9_protocole_versions')->fetchColumn());
    }

    #[TestDox('UC-PRO-08-F11 — E1 : visiteur 401 ; promptologue SEUL et admin SEUL 403 — sur toutes les routes de contenu et la copie, sans aucun fragment')]
    public function testF11ConjunctionIsRequiredEverywhere(): void
    {
        $this->importer(['lourd/20-greffier' => TwinSupport::GABARIT_GREFFIER]);
        $this->copier();
        $this->atelier('PUT', '/essai/protocole/' . self::ENC, ['content' => 'Greffier FICTIF modifié']);
        $routes = [
            ['GET', '/v9.8/protocole', null],
            ['GET', '/essai/protocole/' . self::ENC, null],
            ['GET', '/essai/protocole/' . self::ENC . '/versions', null],
            ['GET', '/essai/protocole/' . self::ENC . '/versions/1', null],
            ['PUT', '/essai/protocole/' . self::ENC, ['content' => 'piratage']],
            ['POST', '/essai/protocole/' . self::ENC . '/restore', ['version' => 1]],
            ['POST', '/essai/tester', ['name' => 'lourd/20-greffier']],
            ['POST', '', ['id' => 'autre']],
        ];
        $promptologue = $this->registerAs('promptologue@example.org', 'Prompto', ['promptologue']);
        $admin = $this->registerAs('admin@example.org', 'Admin', ['admin']);
        foreach ($routes as [$method, $path, $body]) {
            $this->cookieSid = null;
            self::assertSame(401, $this->request($method, '/api/twin9/admin/jeux' . $path, $body)->getStatusCode(), "visiteur $method $path");
            foreach ([$promptologue, $admin] as $user) {
                $response = $this->atelier($method, $path, $body, $user);
                self::assertSame(403, $response->getStatusCode(), "$method $path");
                self::assertSame(['error' => 'Rôle insuffisant'], self::json($response));
            }
        }
        self::assertSame('Greffier FICTIF modifié', (string) self::$pdo->query("SELECT content FROM twin9_jeux_gabarits WHERE name = 'lourd/20-greffier'")->fetchColumn());
        self::assertSame(['essai'], self::$pdo->query('SELECT id FROM twin9_jeux')->fetchAll(\PDO::FETCH_COLUMN));
    }

    #[TestDox('UC-PRO-08-F12 — E2 : jeu, gabarit ou version inconnus → 404 générique (lecture, historique, restauration, banc d’essai, y compris nom hors format) ; une copie ne crée aucun gabarit (404) ; E7 : le jeu v9.8 et la copie d’un autre ne s’écrivent pas (403)')]
    public function testF12UnknownTemplateOrVersion(): void
    {
        $this->importer(['lourd/20-greffier' => TwinSupport::GABARIT_GREFFIER]);
        $this->copier();
        foreach ([
            ['GET', '/inconnu/protocole', null, 'Jeu de gabarits introuvable'],
            ['GET', '/inconnu/protocole/' . self::ENC, null, 'Jeu de gabarits introuvable'],
            ['PUT', '/inconnu/protocole/' . self::ENC, ['content' => 'x'], 'Jeu de gabarits introuvable'],
            ['POST', '/inconnu/tester', ['name' => 'lourd/20-greffier'], 'Jeu de gabarits introuvable'],
            ['GET', '/essai/protocole/lourd%2Finconnu', null, 'Gabarit introuvable'],
            ['GET', '/v9.8/protocole/lourd%2Finconnu/versions', null, 'Gabarit introuvable'],
            ['GET', '/essai/protocole/' . self::ENC . '/versions/3', null, 'Version introuvable'],
            ['POST', '/essai/protocole/' . self::ENC . '/restore', ['version' => 3], 'Version introuvable'],
            ['POST', '/essai/protocole/lourd%2Finconnu/restore', ['version' => 1], 'Gabarit introuvable'],
            ['POST', '/essai/tester', ['name' => 'lourd/inconnu'], 'Gabarit introuvable'],
            // Nom HORS FORMAT : restauration et banc d'essai répondent 404 (get() avant toute validation), pas 422.
            ['POST', '/essai/protocole/lourd%2F%2Fdouble/restore', ['version' => 1], 'Gabarit introuvable'],
            ['POST', '/essai/tester', ['name' => 'lourd//double'], 'Gabarit introuvable'],
            // Une copie a les gabarits du jeu v9.8, aucun autre : un PUT ne crée rien.
            ['PUT', '/essai/protocole/lourd%2Finconnu', ['content' => 'Gabarit FICTIF créé par l’API {$CODE}'], 'Gabarit introuvable'],
            ['PUT', '/essai/protocole/lourd%2F%2Fdouble', ['content' => 'x'], 'Gabarit introuvable'],
        ] as [$method, $path, $body, $message]) {
            $response = $this->atelier($method, $path, $body);
            self::assertSame(404, $response->getStatusCode(), "$method $path");
            self::assertSame(['error' => $message], self::json($response));
        }
        self::assertSame(1, (int) self::$pdo->query('SELECT COUNT(*) FROM twin9_jeux_gabarits')->fetchColumn());

        // E7 : le jeu v9.8 est en lecture seule ; la copie d'un autre aussi.
        $autre = $this->registerAs('autre@example.org', 'Autre', ['admin', 'promptologue']);
        foreach ([
            ['PUT', '/v9.8/protocole/' . self::ENC, ['content' => 'x'], null, 'Le jeu v9.8 est en lecture seule : copiez-le pour le modifier'],
            ['POST', '/v9.8/protocole/' . self::ENC . '/restore', ['version' => 1], null, 'Le jeu v9.8 est en lecture seule : copiez-le pour le modifier'],
            ['PUT', '/essai/protocole/' . self::ENC, ['content' => 'x'], $autre, 'Seul l’auteur d’une copie la modifie'],
            ['POST', '/essai/protocole/' . self::ENC . '/restore', ['version' => 1], $autre, 'Seul l’auteur d’une copie la modifie'],
        ] as [$method, $path, $body, $user, $message]) {
            $response = $this->atelier($method, $path, $body, $user);
            self::assertSame(403, $response->getStatusCode(), "$method $path");
            self::assertSame(['error' => $message], self::json($response));
        }
        self::assertSame(TwinSupport::GABARIT_GREFFIER, (string) self::$pdo->query('SELECT content FROM twin9_protocole')->fetchColumn());
        self::assertSame(TwinSupport::GABARIT_GREFFIER, (string) self::$pdo->query('SELECT content FROM twin9_jeux_gabarits')->fetchColumn());
    }

    #[TestDox('UC-PRO-08-F13 — E3 : saisies invalides → 422 (contenu vide ou ≥ 256 Ko, variable qu’aucune étape ne fournit, version manquante, banc sans nom, nom de copie invalide) ; rien n’est écrit')]
    public function testF13InvalidInputs(): void
    {
        $this->importer(['lourd/20-greffier' => TwinSupport::GABARIT_GREFFIER]);
        $this->copier();
        $nomInvalide = 'Nom de copie invalide : minuscules, chiffres, « . », « _ » ou « - », 64 caractères au plus';
        foreach ([
            ['PUT', '/essai/protocole/' . self::ENC, [], 'Champ requis : content (texte non vide)'],
            ['PUT', '/essai/protocole/' . self::ENC, ['content' => ''], 'Champ requis : content (texte non vide)'],
            ['PUT', '/essai/protocole/' . self::ENC, ['content' => " \n "], 'Contenu de gabarit requis'],
            ['PUT', '/essai/protocole/' . self::ENC, ['content' => str_repeat('a', 262144)], 'Gabarit trop volumineux (maximum 256 Ko)'],
            ['PUT', '/essai/protocole/' . self::ENC, ['content' => 'Greffier FICTIF {$CODE} {$PIECES}'], 'Variable qu’aucune étape ne fournit à ce gabarit : {$PIECES}'],
            ['POST', '/essai/protocole/' . self::ENC . '/restore', [], 'Champ requis : version (entier >= 1)'],
            ['POST', '/essai/protocole/' . self::ENC . '/restore', ['version' => '1'], 'Champ requis : version (entier >= 1)'],
            ['POST', '/essai/protocole/' . self::ENC . '/restore', ['version' => 0], 'Champ requis : version (entier >= 1)'],
            ['POST', '/essai/tester', ['variables' => ['CODE' => '1.01']], 'Champ requis : name'],
            ['POST', '', ['id' => 'Essai Majuscule'], $nomInvalide],
            ['POST', '', [], $nomInvalide],
        ] as [$method, $path, $body, $message]) {
            $response = $this->atelier($method, $path, $body);
            self::assertSame(422, $response->getStatusCode(), $message);
            self::assertSame($message, self::json($response)['error']);
        }
        self::assertSame(TwinSupport::GABARIT_GREFFIER, (string) self::$pdo->query("SELECT content FROM twin9_jeux_gabarits WHERE name = 'lourd/20-greffier'")->fetchColumn());
        self::assertSame(['essai'], self::$pdo->query('SELECT id FROM twin9_jeux')->fetchAll(\PDO::FETCH_COLUMN));
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM twin9_jeux_versions')->fetchColumn());
    }

    #[TestDox('UC-PRO-08-F14 — E4 : import refusé (jeton non configuré 404, mauvais 403, sans fichier 400) ; ANOMALIE figée : fichier invalide → 422 mais import PARTIEL')]
    public function testF14ImportRefusalsAndPartialImport(): void
    {
        TestDb::setEnv('MIGRATE_TOKEN', '');
        self::assertSame(404, $this->importer(['lourd/20-greffier' => 'x'])->getStatusCode());
        TestDb::setEnv('MIGRATE_TOKEN', self::TOKEN);
        $this->cookieSid = null;
        $faux = $this->request('POST', '/api/admin/twin9/import', ['files' => ['a' => 'x']], ['X-Migrate-Token' => 'faux']);
        self::assertSame(403, $faux->getStatusCode());
        self::assertSame(['error' => 'Forbidden'], self::json($faux));
        // Une session d'atelier ne remplace pas le jeton de déploiement.
        $session = $this->as_($this->atelier, 'POST', '/api/admin/twin9/import', ['files' => ['a' => 'x']]);
        self::assertSame(403, $session->getStatusCode());
        self::assertSame(['error' => 'Forbidden'], self::json($session));
        $vide = $this->importer([]);
        self::assertSame(400, $vide->getStatusCode());
        self::assertSame(['error' => 'Body must contain a non-empty files map'], self::json($vide));
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM twin9_protocole')->fetchColumn());

        // Comportement ACTUEL (premier import) : les fichiers valides AVANT le
        // fichier invalide sont écrits (pas de transaction) ; le 422 cite le NOM du
        // fichier fautif (destiné au détenteur du jeton).
        $partiel = $this->importer(['tagger/1-tag-pole' => TwinSupport::GABARIT_TAG, 'lourd/20-greffier' => ['pas', 'une', 'chaine']]);
        self::assertSame(422, $partiel->getStatusCode());
        self::assertSame('Fichier invalide : lourd/20-greffier', self::json($partiel)['error']);
        self::assertSame(['tagger/1-tag-pole'], self::$pdo->query('SELECT name FROM twin9_protocole')->fetchAll(\PDO::FETCH_COLUMN));

        // RÉIMPORT (cas courant en production) : le jeu sert un mélange de gabarits
        // neufs et anciens ; référentiel non mis à jour.
        self::assertSame(200, $this->importer(
            ['tagger/1-tag-pole' => 'Tag FICTIF v1 {$TEXTE_JOURNEE}', 'lourd/20-greffier' => 'Greffier FICTIF v1 {$CODE}', 'merge/04-rapporteur' => 'Rapporteur FICTIF v1'],
            ['referentiel' => TwinSupport::referentielFictif()],
        )->getStatusCode());
        $second = $this->importer(
            ['tagger/1-tag-pole' => 'Tag FICTIF v2 {$TEXTE_JOURNEE}', 'lourd/20-greffier' => 42, 'merge/04-rapporteur' => 'Rapporteur FICTIF v2'],
            ['referentiel' => [['num' => 9, 'nom' => 'PÔLE FICTIF NEUF', 'competences' => []]]],
        );
        self::assertSame(422, $second->getStatusCode());
        $config = new Twin9Config(new SettingsRepository(Db::get()));
        $contenus = self::$pdo->query('SELECT name, content FROM twin9_protocole ORDER BY name')->fetchAll(\PDO::FETCH_KEY_PAIR);
        self::assertSame([
            'lourd/20-greffier' => 'Greffier FICTIF v1 {$CODE}',
            'merge/04-rapporteur' => 'Rapporteur FICTIF v1',
            'tagger/1-tag-pole' => 'Tag FICTIF v2 {$TEXTE_JOURNEE}',
        ], $contenus);
        self::assertSame('TÊTE — Penser & Comprendre', $config->referentiel()[0]['nom'], 'référentiel inchangé');
    }

    #[TestDox('UC-PRO-08-F15 — E6 : session d’atelier valide mais jeton CSRF absent ou faux → 403 sur la copie, le PUT, la restauration et le banc d’essai ; rien n’est écrit')]
    public function testF15CsrfTokenIsRequiredOnAtelierWrites(): void
    {
        $this->importer(['lourd/20-greffier' => TwinSupport::GABARIT_GREFFIER]);
        $this->copier();
        $this->atelier('PUT', '/essai/protocole/' . self::ENC, ['content' => 'Greffier FICTIF v2']);
        foreach ([
            ['POST', '', ['id' => 'autre']],
            ['PUT', '/essai/protocole/' . self::ENC, ['content' => 'écrasement']],
            ['POST', '/essai/protocole/' . self::ENC . '/restore', ['version' => 1]],
            ['POST', '/essai/tester', ['name' => 'lourd/20-greffier', 'variables' => []]],
        ] as [$method, $path, $body]) {
            foreach ([[], ['X-CSRF-Token' => 'jeton-faux']] as $entetes) {
                $this->cookieSid = $this->atelier['sid'];
                $response = $this->request($method, '/api/twin9/admin/jeux' . $path, $body, $entetes);
                self::assertSame(403, $response->getStatusCode(), "$method $path");
                self::assertSame(['error' => 'Jeton CSRF absent ou invalide'], self::json($response));
            }
        }
        self::assertSame('Greffier FICTIF v2', (string) self::$pdo->query("SELECT content FROM twin9_jeux_gabarits WHERE name = 'lourd/20-greffier'")->fetchColumn());
        self::assertSame(1, (int) self::$pdo->query('SELECT COUNT(*) FROM twin9_jeux_versions')->fetchColumn());
        self::assertSame(['essai'], self::$pdo->query('SELECT id FROM twin9_jeux')->fetchAll(\PDO::FETCH_COLUMN));
    }

    #[TestDox('UC-PRO-08-F16 — ANOMALIES figées des noms : clé d’import purement numérique refusée (422) ; nom finissant par un saut de ligne accepté ; gabarit « …/versions » importé mais illisible dans l’atelier')]
    public function testF16NameEdgeCases(): void
    {
        // json_decode transforme la clé « 20 » en entier : refusée, bien que valide selon RG2.
        $numerique = $this->importer(['20' => 'Gabarit FICTIF numérique']);
        self::assertSame(422, $numerique->getStatusCode());
        self::assertSame(['error' => 'Fichier invalide : 20'], self::json($numerique));

        // NAME_PATTERN se termine par « $ » sans /D : un saut de ligne final passe.
        self::assertSame(['imported' => 1, 'inchanges' => 0, 'retires' => 0], self::json($this->importer(["lourd/20-greffier\n" => 'Gabarit FICTIF à saut de ligne'])));
        self::assertSame(["lourd/20-greffier\n"], self::$pdo->query('SELECT name FROM twin9_protocole')->fetchAll(\PDO::FETCH_COLUMN));

        // Un gabarit dont le dernier segment est « versions » est capté par la route
        // d'historique (enregistrée d'abord) : importé, mais jamais relu. Partiel,
        // l'import n'ôte rien (T16) : celui à saut de ligne reste.
        self::assertSame(['imported' => 1, 'inchanges' => 0, 'retires' => 0], self::json($this->importer(['x/versions' => 'Gabarit FICTIF masqué'])));
        $lu = $this->atelier('GET', '/v9.8/protocole/x%2Fversions');
        self::assertSame(404, $lu->getStatusCode());
        self::assertSame(['error' => 'Gabarit introuvable'], self::json($lu));
    }
}
