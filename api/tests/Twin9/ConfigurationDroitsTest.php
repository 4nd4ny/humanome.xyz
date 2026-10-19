<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\Referentiel\ReferentielRepository;
use Humanome\Tests\CartographeTestCase;
use Humanome\Tests\TestDb;
use Humanome\Twin9\ProfilRepository;
use Humanome\Twin9\ProtocoleRepository;
use stdClass;

/**
 * The rights of Twin9's configuration (T13), one test per line of the matrix
 * written in docs/autorisations.md, « Configuration Twin9 »: each account
 * sets its own profiles, and only them; its budget, duration, key, published
 * referential and template set (T14: the v9.8's, the default, its own copies
 * in the atelier); the administrator sets the instance's prices, its default
 * template set, and opens the personal keys; the instance's key comes from
 * the environment, never from the interface.
 */
final class ConfigurationDroitsTest extends CartographeTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        self::$pdo->exec('DELETE FROM referentiel_versions');
        self::$pdo->exec('DELETE FROM twin9_protocole');
        self::$pdo->exec('DELETE FROM twin9_jeux');
        self::$pdo->exec("DELETE FROM settings WHERE name = 'twin9_gabarits_defaut'");
        $doc = json_decode((string) file_get_contents(\dirname(__DIR__, 3) . '/web/public/data/referentiel/respire-v7.json'),
            true, 512, JSON_THROW_ON_ERROR);
        (new ReferentielRepository(self::$pdo))->importPublishedDocument($doc, 'Import initial RESPIRE v7');
    }

    public function testAVisitorSetsNothing(): void
    {
        $this->cookieSid = null;
        foreach ([['GET', '/api/twin9/configuration'], ['POST', '/api/twin9/profils'], ['GET', '/api/twin9/profils/1'],
                  ['PUT', '/api/twin9/profils/1'], ['DELETE', '/api/twin9/profils/1']] as [$method, $path]) {
            $body = $method === 'POST' || $method === 'PUT' ? ['nom' => 'x', 'profil' => ProfilRepository::v98()] : null;
            self::assertContains($this->request($method, $path, $body)->getStatusCode(), [401, 403], "$method $path");
        }
    }

    /** Each account, whatever its roles, creates, reads, changes and deletes its own profiles. */
    public function testEachAccountSetsItsOwnProfiles(): void
    {
        foreach ([['apprenant@example.org', []], ['admin@example.org', ['admin']]] as [$email, $roles]) {
            $compte = $this->registerAs($email, 'Compte', $roles);
            $profil = ProfilRepository::v98();
            $profil->mode = 'test';

            $cree = $this->as_($compte, 'POST', '/api/twin9/profils', ['nom' => 'Essai', 'profil' => $profil]);
            self::assertSame(201, $cree->getStatusCode(), $email);
            $id = self::json($cree)['id'];
            self::assertSame('test', self::json($cree)['profil']['mode']);

            $configuration = self::json($this->as_($compte, 'GET', '/api/twin9/configuration'));
            self::assertSame(['Essai'], array_column($configuration['profils'], 'nom'));

            $profil->mode = 'complet';
            $modifie = $this->as_($compte, 'PUT', "/api/twin9/profils/$id", ['nom' => 'Complet', 'profil' => $profil]);
            self::assertSame(200, $modifie->getStatusCode());
            self::assertSame(['Complet', 'complet'], [self::json($modifie)['nom'], self::json($modifie)['profil']['mode']]);
            self::assertSame('Complet', self::json($this->as_($compte, 'GET', "/api/twin9/profils/$id"))['nom']);

            self::assertSame(204, $this->as_($compte, 'DELETE', "/api/twin9/profils/$id")->getStatusCode());
            self::assertSame(404, $this->as_($compte, 'GET', "/api/twin9/profils/$id")->getStatusCode());
        }
    }

    /** Another's profile is not found, whoever asks, and stays as it was. */
    public function testAnothersProfileIsNotFound(): void
    {
        $alice = $this->registerAs('alice@example.org', 'Alice');
        $bob = $this->registerAs('bob@example.org', 'Bob', ['admin']);
        $id = self::json($this->as_($alice, 'POST', '/api/twin9/profils',
            ['nom' => 'Le mien', 'profil' => ProfilRepository::v98()]))['id'];

        self::assertSame(404, $this->as_($bob, 'GET', "/api/twin9/profils/$id")->getStatusCode());
        self::assertSame(404, $this->as_($bob, 'PUT', "/api/twin9/profils/$id",
            ['nom' => 'Pris', 'profil' => ProfilRepository::v98()])->getStatusCode());
        self::assertSame(404, $this->as_($bob, 'DELETE', "/api/twin9/profils/$id")->getStatusCode());
        self::assertSame([], self::json($this->as_($bob, 'GET', '/api/twin9/configuration'))['profils']);
        self::assertSame('Le mien', self::json($this->as_($alice, 'GET', "/api/twin9/profils/$id"))['nom']);
    }

    /** The v9.8 profile is read by everyone, and changed by no one: a change is a copy, one's own. */
    public function testTheV98ProfileIsReadOnly(): void
    {
        $compte = $this->registerAs('lecteur@example.org', 'Lecteur');
        $configuration = self::json($this->as_($compte, 'GET', '/api/twin9/configuration'));

        self::assertEquals(json_decode(json_encode(ProfilRepository::v98()), true), $configuration['defaut']);
        self::assertSame(404, $this->as_($compte, 'PUT', '/api/twin9/profils/0',
            ['profil' => ProfilRepository::v98()])->getStatusCode());
    }

    public function testEachAccountSetsTheBudgetAndDurationOfItsRuns(): void
    {
        $compte = $this->registerAs('budget@example.org', 'Budget');
        $profil = ProfilRepository::v98();
        $profil->budget_usd = 12.5;
        $profil->duree_minutes = 90;

        $cree = self::json($this->as_($compte, 'POST', '/api/twin9/profils', ['nom' => 'Plafonné', 'profil' => $profil]));
        self::assertSame([12.5, 90], [$cree['profil']['budget_usd'], $cree['profil']['duree_minutes']]);

        $profil->budget_usd = 0;
        self::assertSame(422, $this->as_($compte, 'POST', '/api/twin9/profils', ['nom' => 'Nul', 'profil' => $profil])
            ->getStatusCode());
    }

    /** The personal key, only where the administrator opened it. */
    public function testThePersonalKeyOnlyWhereTheAdministratorOpenedIt(): void
    {
        $compte = $this->registerAs('cle@example.org', 'Clé');
        $admin = $this->registerAs('ouvre@example.org', 'Admin', ['admin']);
        $profil = ProfilRepository::v98();
        $profil->cle = 'personnelle';

        $refuse = $this->as_($compte, 'POST', '/api/twin9/profils', ['nom' => 'Perso', 'profil' => $profil]);
        self::assertSame(422, $refuse->getStatusCode());
        self::assertStringContainsString('/cle', self::json($refuse)['error']);
        self::assertFalse(self::json($this->as_($compte, 'GET', '/api/twin9/configuration'))['cle_perso_ouverte']);

        self::assertSame(200, $this->as_($admin, 'PUT', '/api/twin9/admin/config', ['twin9_cle_perso_ouverte' => true])
            ->getStatusCode());
        self::assertSame(201, $this->as_($compte, 'POST', '/api/twin9/profils', ['nom' => 'Perso', 'profil' => $profil])
            ->getStatusCode());
        self::assertTrue(self::json($this->as_($compte, 'GET', '/api/twin9/configuration'))['cle_perso_ouverte']);
    }

    /** One's personal key itself: in one's own vault; the page only learns whether it is there. */
    public function testEachAccountKeepsItsOwnPersonalKey(): void
    {
        TestDb::setEnv('SODIUM_MASTER_KEY', str_repeat('5a', 32));
        $alice = $this->registerAs('coffre@example.org', 'Coffre');
        $voisin = $this->registerAs('voisin@example.org', 'Voisin');
        $cle = ['provider' => 'anthropic', 'apiKey' => 'sk-ant-api03-coffre-de-test'];

        $this->cookieSid = null;
        self::assertContains($this->request('PUT', '/api/keys', $cle)->getStatusCode(), [401, 403]);

        self::assertSame(204, $this->as_($alice, 'PUT', '/api/keys', $cle)->getStatusCode());
        $configuration = $this->as_($alice, 'GET', '/api/twin9/configuration');
        self::assertTrue(self::json($configuration)['cle_perso_enregistree']);
        self::assertStringNotContainsString('coffre-de-test', (string) $configuration->getBody());
        self::assertFalse(self::json($this->as_($voisin, 'GET', '/api/twin9/configuration'))['cle_perso_enregistree']);
    }

    /** A published referential, its latest version or a published one. */
    public function testOnlyAPublishedReferential(): void
    {
        $compte = $this->registerAs('ref@example.org', 'Référentiel');
        self::assertSame([['id' => 'respire', 'versions' => ['7.0.0']]],
            self::json($this->as_($compte, 'GET', '/api/twin9/configuration'))['referentiels']);

        foreach ([['respire', null, 201], ['respire', '7.0.0', 201], ['respire', '9.9.9', 422], ['inconnu', null, 422]]
                 as $n => [$id, $version, $statut]) {
            $profil = ProfilRepository::v98();
            $profil->referentiel = (object) ['id' => $id, 'version' => $version];
            self::assertSame($statut, $this->as_($compte, 'POST', '/api/twin9/profils',
                ['nom' => "Référentiel $n", 'profil' => $profil])->getStatusCode(), "$id $version");
        }
    }

    /**
     * The template set (T14): every account chooses the v9.8's or the
     * instance's default; an account of the atelier, its own copies too,
     * while it belongs to it; another's copy, no one.
     */
    public function testTheTemplateSetsAProfileChooses(): void
    {
        (new ProtocoleRepository(self::$pdo))->put('lourd/21a-accusation', 'Accusation FICTIVE de {$CODE}', null);
        $compte = $this->registerAs('jeu@example.org', 'Jeu');
        $atelier = $this->registerAs('atelier@example.org', 'Atelier', ['admin', 'promptologue']);
        $autre = $this->registerAs('autre@example.org', 'Autre', ['admin', 'promptologue']);
        foreach ([[$atelier, 'mienne'], [$autre, 'sienne']] as [$auteur, $id]) {
            self::assertSame(201, $this->as_($auteur, 'POST', '/api/twin9/admin/jeux', ['id' => $id])->getStatusCode());
        }
        $choisir = function (array $user, string $jeu): int {
            $profil = ProfilRepository::v98();
            $profil->gabarits = $jeu;

            return $this->as_($user, 'POST', '/api/twin9/profils', ['nom' => "Jeu $jeu", 'profil' => $profil])
                ->getStatusCode();
        };
        $offerts = fn (array $user): array => self::json($this->as_($user, 'GET', '/api/twin9/configuration'))['gabarits'];

        self::assertSame(['v9.8'], $offerts($compte));
        self::assertSame(['v9.8', 'mienne'], $offerts($atelier));
        foreach ([[$compte, 'v9.8', 201], [$compte, 'mienne', 422], [$compte, 'le mien', 422],
                  [$atelier, 'mienne', 201], [$atelier, 'sienne', 422]] as [$user, $jeu, $statut]) {
            self::assertSame($statut, $choisir($user, $jeu), "{$user['id']} $jeu");
        }

        // the administrator's default: everyone's, and the default profile's
        self::assertSame(200, $this->as_($autre, 'PUT', '/api/twin9/admin/jeux/defaut', ['jeu' => 'sienne'])->getStatusCode());
        self::assertSame(['v9.8', 'sienne'], $offerts($compte));
        self::assertSame('sienne', self::json($this->as_($compte, 'GET', '/api/twin9/configuration'))['defaut']['gabarits']);
        self::assertSame(201, $choisir($compte, 'sienne'));

        // out of the atelier, one's copies are no longer offered
        self::setRoles($atelier['id'], ['admin']);
        self::assertSame(['v9.8', 'sienne'], $offerts($atelier));
        self::assertSame(422, $choisir($atelier, 'mienne'));

        // the default changed back, a profile saved on the former one keeps it, refused until it chooses another
        self::assertSame(200, $this->as_($autre, 'PUT', '/api/twin9/admin/jeux/defaut', ['jeu' => 'v9.8'])->getStatusCode());
        $ancien = array_values(array_filter(self::json($this->as_($compte, 'GET', '/api/twin9/configuration'))['profils'],
            static fn (array $p): bool => $p['nom'] === 'Jeu sienne'))[0]['id'];
        self::assertSame('sienne', self::json($this->as_($compte, 'GET', "/api/twin9/profils/$ancien"))['profil']['gabarits']);
        $profil = ProfilRepository::v98();
        $profil->gabarits = 'sienne';
        $refus = $this->as_($compte, 'PUT', "/api/twin9/profils/$ancien", ['nom' => 'Jeu sienne', 'profil' => $profil]);
        self::assertSame(422, $refus->getStatusCode());
        self::assertSame('Profil refusé — /gabarits : ce jeu de gabarits ne vous est pas proposé', self::json($refus)['error']);
        $profil->gabarits = 'v9.8';
        self::assertSame(200, $this->as_($compte, 'PUT', "/api/twin9/profils/$ancien", ['nom' => 'Jeu sienne', 'profil' => $profil])
            ->getStatusCode());
    }

    /** The instance's prices, margin, personal keys and slices: the administrator's alone. */
    public function testTheInstanceSettingsAreTheAdministrators(): void
    {
        $compte = $this->registerAs('simple@example.org', 'Simple');
        $admin = $this->registerAs('reglages@example.org', 'Admin', ['admin']);

        self::assertSame(403, $this->as_($compte, 'GET', '/api/twin9/admin/config')->getStatusCode());
        self::assertSame(403, $this->as_($compte, 'PUT', '/api/twin9/admin/config', ['marge' => 2])->getStatusCode());
        self::assertSame(200, $this->as_($admin, 'PUT', '/api/twin9/admin/config',
            ['marge' => 2, 'runs_par_tick' => 5, 'secondes_par_tranche' => 30])->getStatusCode());
        $config = self::json($this->as_($admin, 'GET', '/api/twin9/admin/config'));
        self::assertSame([2, 5, 30], [$config['marge'], $config['runs_par_tick'], $config['secondes_par_tranche']]);
    }

    /** The instance's key: set at installation (ANTHROPIC_API_KEY), never through the interface, never shown. */
    public function testTheInstanceKeyNeverPassesThroughTheInterface(): void
    {
        TestDb::setEnv('ANTHROPIC_API_KEY', 'sk-ant-factice-instance');
        $admin = $this->registerAs('instance@example.org', 'Admin', ['admin']);

        foreach (['cle', 'cle_instance', 'anthropic_api_key', 'ANTHROPIC_API_KEY'] as $champ) {
            self::assertSame(422, $this->as_($admin, 'PUT', '/api/twin9/admin/config', [$champ => 'sk-ant-api03-autre'])
                ->getStatusCode(), $champ);
        }
        foreach (['/api/twin9/admin/config', '/api/twin9/configuration'] as $route) {
            self::assertStringNotContainsString('factice-instance', (string) $this->as_($admin, 'GET', $route)->getBody(), $route);
        }
    }

    /** The API refuses the efforts xhigh and max with thinking cut: so does the profile, naming the step. */
    public function testCutThinkingRefusesTheHighestEfforts(): void
    {
        $compte = $this->registerAs('effort@example.org', 'Effort');
        $profil = ProfilRepository::v98();
        $profil->etapes = (object) ['greffier' => (object) ['effort' => 'xhigh']];

        $refuse = $this->as_($compte, 'POST', '/api/twin9/profils', ['nom' => 'Effort', 'profil' => $profil]);
        self::assertSame(422, $refuse->getStatusCode());
        self::assertStringContainsString('greffier', self::json($refuse)['error']);

        $profil->etapes->greffier->reflexion = 'adaptative';
        self::assertSame(201, $this->as_($compte, 'POST', '/api/twin9/profils', ['nom' => 'Effort', 'profil' => $profil])
            ->getStatusCode());
    }

    /** A number keeps a float's form, as the v9.8 reads it, whatever form the page sent it in. */
    public function testANumberStaysAFloat(): void
    {
        $compte = $this->registerAs('flottant@example.org', 'Flottant');
        $profil = ProfilRepository::v98();
        $profil->etapes = new stdClass();

        $id = self::json($this->as_($compte, 'POST', '/api/twin9/profils', ['nom' => 'Flottant', 'profil' => $profil]))['id'];

        $stocke = (string) self::$pdo->query("SELECT profil FROM twin9_profils WHERE id = $id")->fetchColumn();
        self::assertStringContainsString('"poids":1.0', str_replace(' ', '', $stocke));
        self::assertStringContainsString('"etapes":{}', str_replace(' ', '', $stocke), 'un objet vide reste un objet');
    }
}
