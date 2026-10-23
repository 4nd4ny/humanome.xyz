<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Tests\CartographeTestCase;
use Humanome\Tests\StoredKeys;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\AdmSupport;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-CPT-04 — Gérer ses clés API : tests FONCTIONNELS (API et CLI).
 *
 * Fiche : docs/cas-utilisation/compte/UC-CPT-04-gerer-cles-api.md
 *
 * Volet serveur depuis l'ADR-013 : aucune clé d'utilisateur n'est plus
 * écrite (PUT /api/keys répond 410 à tout compte, une école comprise) ; une
 * clé gardée avant (écrite ici comme le coffre l'écrivait, StoredKeys) est
 * listée « à supprimer », rendue à son seul propriétaire pour la recopier
 * dans son navigateur, et supprimée ; le script d'administration de la purge
 * (php scripts/purger-cles-utilisateurs.php) compte, et ne purge que sur
 * demande explicite. Le volet navigateur (la clé reste dans le navigateur)
 * est couvert par les tests IHM du même UC.
 */
final class UcCpt04GererClesApiTest extends CartographeTestCase
{
    private const MASTER_HEX = '89b1b60f0a26f73b63f9df20a9c58ab24905b48b2bd45a01b344cee69d7e3a55';
    private const API_KEY = 'sk-ant-api03-EXEMPLE-jamais-en-clair';
    private const REFUS = 'Vos clés restent dans votre navigateur : humanome ne les garde plus sur ses serveurs.';

    /** @var array{id: int, csrf: string, sid: string} */
    private array $ada;

    protected function setUp(): void
    {
        parent::setUp();
        TestDb::setEnv('SODIUM_MASTER_KEY', self::MASTER_HEX);
        $this->ada = $this->registerAs('ada@example.org', 'Ada');
    }

    private function store(array $user, string $provider, string $apiKey): ResponseInterface
    {
        return $this->as_($user, 'PUT', '/api/keys', ['provider' => $provider, 'apiKey' => $apiKey]);
    }

    /** A key of $user's stored before ADR-013. */
    private static function stored(array $user, string $provider, string $apiKey, ?string $avis = null): void
    {
        StoredKeys::seed(self::$pdo, $user['id'], $provider, $apiKey, sodium_hex2bin(self::MASTER_HEX), $avis);
    }

    private static function rowCount(): int
    {
        return (int) self::$pdo->query('SELECT COUNT(*) FROM user_api_keys')->fetchColumn();
    }

    #[TestDox('UC-CPT-04-F01 — E3, RG1 : un apprenant qui envoie sa clé → 410 « Vos clés restent dans votre navigateur… », rien n’est écrit, la clé ne revient pas dans la réponse')]
    public function testF01ALearnersKeyIsNeverStored(): void
    {
        self::assertSame([], self::json($this->as_($this->ada, 'GET', '/api/keys')));

        $response = $this->store($this->ada, 'anthropic', self::API_KEY);

        self::assertSame(410, $response->getStatusCode());
        self::assertSame(self::REFUS, self::json($response)['error']);
        self::assertStringContainsString('Seule une école garde la sienne sur le serveur', self::json($response)['detail']);
        self::assertStringNotContainsString(self::API_KEY, (string) $response->getBody());
        self::assertSame(0, self::rowCount());
        self::assertSame([], self::json($this->as_($this->ada, 'GET', '/api/keys')));
    }

    #[TestDox('UC-CPT-04-F02 — A1, A2 : une clé gardée avant l’ADR-013 est listée « à supprimer » {provider, createdAt, avisPurgeAt} sans la clé ; sur un autre navigateur, son propriétaire la relit en clair (no-store) pour la recopier')]
    public function testF02AStoredKeyIsListedThenCopied(): void
    {
        self::stored($this->ada, 'anthropic', self::API_KEY, '2026-10-22 08:00:00');

        $list = $this->as_($this->ada, 'GET', '/api/keys');
        self::assertSame(200, $list->getStatusCode());
        $entries = self::json($list);
        self::assertCount(1, $entries);
        self::assertSame('anthropic', $entries[0]['provider']);
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', $entries[0]['createdAt']);
        self::assertSame('2026-10-22T08:00:00', $entries[0]['avisPurgeAt']);
        self::assertStringNotContainsString(self::API_KEY, (string) $list->getBody());

        // Nouveau navigateur : nouvelle session par login.
        $this->cookieSid = null;
        self::assertSame(200, $this->login('ada@example.org', self::PASSWORD)->getStatusCode());
        $response = $this->request('GET', '/api/keys/anthropic');

        self::assertSame(200, $response->getStatusCode());
        self::assertSame(['apiKey' => self::API_KEY], self::json($response));
        self::assertSame('no-store', $response->getHeaderLine('Cache-Control'));
    }

    #[TestDox('UC-CPT-04-F03 — A5 : une école reçoit aussi 410 sur /api/keys, renvoyée à son espace établissement ; rien n’est écrit')]
    public function testF03ASchoolIsPointedToItsSpace(): void
    {
        $ecole = $this->registerAs('ecole@example.org', 'École', ['etablissement']);

        $response = $this->store($ecole, 'anthropic', self::API_KEY);

        self::assertSame(410, $response->getStatusCode());
        self::assertSame(self::REFUS, self::json($response)['error']);
        self::assertSame('La clé de votre école, pour ses élèves, se règle dans votre espace établissement.',
            self::json($response)['detail']);
        self::assertSame(0, self::rowCount());
    }

    #[TestDox('UC-CPT-04-F04 — A3 : « Supprimer du serveur » → 204, liste vide, lecture 404, nouvelle suppression 404')]
    public function testF04DeleteKey(): void
    {
        self::stored($this->ada, 'google', 'AIza-cle-google-ada');

        self::assertSame(204, $this->as_($this->ada, 'DELETE', '/api/keys/google')->getStatusCode());

        self::assertSame(0, self::rowCount(), 'suppression réelle');
        self::assertSame([], self::json($this->as_($this->ada, 'GET', '/api/keys')));
        foreach (['GET', 'DELETE'] as $method) {
            $response = $this->as_($this->ada, $method, '/api/keys/google');
            self::assertSame(404, $response->getStatusCode(), $method);
            self::assertSame(['error' => 'Aucune clé enregistrée pour ce fournisseur'], self::json($response));
        }
    }

    #[TestDox('UC-CPT-04-F05 — E1 : clé maîtresse absente ou malformée → 503 explicite sur toutes les routes, avant même l’authentification')]
    public function testF05StorageNotConfigured(): void
    {
        self::stored($this->ada, 'anthropic', self::API_KEY);
        foreach (['', 'pas-une-cle-hex'] as $master) {
            TestDb::setEnv('SODIUM_MASTER_KEY', $master);
            foreach ([['PUT', '/api/keys', ['provider' => 'openai', 'apiKey' => 'sk-12345678']], ['GET', '/api/keys', null], ['GET', '/api/keys/anthropic', null], ['DELETE', '/api/keys/anthropic', null]] as [$method, $path, $body]) {
                $response = $this->as_($this->ada, $method, $path, $body);
                self::assertSame(503, $response->getStatusCode(), $method . ' ' . $path);
                self::assertSame(['error' => 'Stockage de clés non configuré'], self::json($response));
            }
            $this->cookieSid = null;
            self::assertSame(503, $this->request('GET', '/api/keys')->getStatusCode(), 'visiteur : 503 aussi');
            // Sur une mutation, la garde CSRF (middleware global) passe AVANT la route :
            // un cookie de session sans jeton reçoit 403, pas 503.
            $this->cookieSid = $this->ada['sid'];
            self::assertSame(403, $this->request('DELETE', '/api/keys/anthropic')->getStatusCode(), 'CSRF avant 503');
        }
        self::assertSame(1, self::rowCount(), 'rien n’a été effacé');
        self::assertSame(200, $this->as_($this->ada, 'GET', '/api/auth/me')->getStatusCode(), 'le reste de l’API répond');
    }

    #[TestDox('UC-CPT-04-F06 — E2 : sans session → 401 sur les quatre routes (avant le 410 de PUT)')]
    public function testF06AuthenticationRequired(): void
    {
        foreach ([['PUT', '/api/keys', ['provider' => 'openai', 'apiKey' => 'sk-12345678']], ['GET', '/api/keys', null], ['GET', '/api/keys/openai', null], ['DELETE', '/api/keys/openai', null]] as [$method, $path, $body]) {
            $this->cookieSid = null;
            $response = $this->request($method, $path, $body);
            self::assertSame(401, $response->getStatusCode(), $method . ' ' . $path);
            self::assertSame(['error' => 'Authentification requise'], self::json($response));
        }
        self::assertSame(0, self::rowCount());
    }

    #[TestDox('UC-CPT-04-F07 — E3 : le corps de PUT n’est jamais lu — fournisseur inconnu, Mistral AI, clé trop courte, trop longue, avec caractère de contrôle ou absente → le même 410, rien d’écrit')]
    public function testF07TheBodyIsNeverRead(): void
    {
        $cases = [
            ['provider' => 'mistral', 'apiKey' => 'sk-12345678'],
            ['provider' => 'deepseek', 'apiKey' => 'sk-12345678'],
            ['provider' => 'openai', 'apiKey' => 'sk-1234'],
            ['provider' => 'openai', 'apiKey' => str_repeat('k', 4097)],
            ['provider' => 'openai', 'apiKey' => "sk-1234\n5678"],
            [],
        ];
        foreach ($cases as $body) {
            $response = $this->as_($this->ada, 'PUT', '/api/keys', $body);
            self::assertSame(410, $response->getStatusCode(), json_encode($body));
            self::assertSame(self::REFUS, self::json($response)['error']);
        }
        self::assertSame(0, self::rowCount());
    }

    #[TestDox('UC-CPT-04-F08 — E5 : clé maîtresse changée (rotation) → la clé gardée n’est plus lisible : 404, jamais 500 ni fuite ; l’entrée reste listée et peut être supprimée')]
    public function testF08RotatedMasterKey(): void
    {
        self::stored($this->ada, 'anthropic', self::API_KEY);
        TestDb::setEnv('SODIUM_MASTER_KEY', strrev(self::MASTER_HEX));

        $response = $this->as_($this->ada, 'GET', '/api/keys/anthropic');

        self::assertSame(404, $response->getStatusCode());
        self::assertStringNotContainsString(self::API_KEY, (string) $response->getBody());
        self::assertSame(['anthropic'], array_column(self::json($this->as_($this->ada, 'GET', '/api/keys')), 'provider'), 'l’entrée reste listée');
        // la suppression ne déchiffre rien
        self::assertSame(204, $this->as_($this->ada, 'DELETE', '/api/keys/anthropic')->getStatusCode());
        self::assertSame(0, self::rowCount());
    }

    #[TestDox('UC-CPT-04-F09 — E6 : PUT ou DELETE sans jeton CSRF → 403, rien n’est écrit ni effacé')]
    public function testF09CsrfRequired(): void
    {
        self::stored($this->ada, 'anthropic', self::API_KEY);
        $this->cookieSid = $this->ada['sid'];

        self::assertSame(403, $this->request('PUT', '/api/keys', ['provider' => 'openai', 'apiKey' => 'sk-forgee-123'])->getStatusCode());
        self::assertSame(403, $this->request('DELETE', '/api/keys/anthropic')->getStatusCode());

        self::assertSame(['anthropic'], array_column(self::json($this->as_($this->ada, 'GET', '/api/keys')), 'provider'));
    }

    #[TestDox('UC-CPT-04-F10 — RG5 : un autre compte ne voit, ne lit ni ne supprime la clé d’Ada')]
    public function testF10OwnerIsolation(): void
    {
        self::stored($this->ada, 'anthropic', self::API_KEY);
        $bob = $this->registerAs('bob@example.org', 'Bob');

        self::assertSame([], self::json($this->as_($bob, 'GET', '/api/keys')));
        self::assertSame(404, $this->as_($bob, 'GET', '/api/keys/anthropic')->getStatusCode());
        self::assertSame(404, $this->as_($bob, 'DELETE', '/api/keys/anthropic')->getStatusCode());
        self::assertSame(self::API_KEY, self::json($this->as_($this->ada, 'GET', '/api/keys/anthropic'))['apiKey']);
    }

    #[TestDox('UC-CPT-04-F11 — A7 : php scripts/purger-cles-utilisateurs.php, sans argument, compte sur la base de test et ne change rien ; « purger » sans --confirmer aussi ; un mode inconnu sort en 2')]
    public function testF11ThePurgeScriptCountsByDefault(): void
    {
        $ancien = (string) self::$pdo->query('SELECT NOW() - INTERVAL 31 DAY')->fetchColumn();
        self::stored($this->ada, 'anthropic', self::API_KEY, $ancien);

        foreach ([[], ['purger']] as $args) {
            $out = self::script($args);
            self::assertSame(0, $out['exit'], $out['stderr']);
            $json = json_decode(trim($out['stdout']), true, 512, JSON_THROW_ON_ERROR);
            self::assertSame('compter', $json['mode']);
            self::assertSame(1, $json['comptes_avec_cle']);
            self::assertSame(['anthropic' => 1], $json['cles_par_fournisseur']);
            self::assertSame(1, $json['comptes_purgeables']);
            self::assertStringNotContainsString(self::API_KEY, $out['stdout']);
            self::assertStringNotContainsString('@', $out['stdout']);
        }
        self::assertSame(1, self::rowCount(), 'rien n’a été purgé');

        $out = self::script(['effacer-tout']);
        self::assertSame(2, $out['exit']);
        self::assertSame(1, self::rowCount());
    }

    #[TestDox('UC-CPT-04-F12 — A7 : « purger --confirmer » supprime les clés avisées depuis 30 jours au moins, garde les autres, et ne dit que des compteurs')]
    public function testF12ThePurgeScriptPurgesOnlyOnConfirmation(): void
    {
        $bob = $this->registerAs('bob@example.org', 'Bob');
        $ancien = (string) self::$pdo->query('SELECT NOW() - INTERVAL 31 DAY')->fetchColumn();
        self::stored($this->ada, 'anthropic', self::API_KEY, $ancien);
        self::stored($bob, 'openai', 'sk-openai-bob-fictive');

        $out = self::script(['purger', '--confirmer']);

        self::assertSame(0, $out['exit'], $out['stderr']);
        self::assertSame(['mode' => 'purger', 'comptes' => 1, 'cles' => 1, 'reportes' => 0],
            json_decode(trim($out['stdout']), true, 512, JSON_THROW_ON_ERROR));
        self::assertSame([$bob['id']], array_map('intval',
            self::$pdo->query('SELECT user_id FROM user_api_keys')->fetchAll(\PDO::FETCH_COLUMN)));
    }

    /**
     * The script in a subprocess, on the test database only: its secrets are
     * read from a temporary directory (the first place it looks), never from
     * a local api/.env.
     *
     * @param list<string> $args
     * @return array{exit: int, stdout: string, stderr: string}
     */
    private static function script(array $args): array
    {
        $shared = sys_get_temp_dir() . '/uc-cpt-04-shared-' . bin2hex(random_bytes(4));
        mkdir($shared);
        file_put_contents($shared . '/.env', '');
        try {
            return AdmSupport::runPhp('scripts/purger-cles-utilisateurs.php', $args, AdmSupport::cliEnv([
                'HUMANOME_SHARED_DIR' => $shared,
                'SODIUM_MASTER_KEY' => self::MASTER_HEX,
            ]));
        } finally {
            unlink($shared . '/.env');
            rmdir($shared);
        }
    }
}
