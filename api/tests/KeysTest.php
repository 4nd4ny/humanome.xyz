<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Auth\Users;
use Humanome\Keys\KeyRefused;
use Humanome\Keys\KeyVault;

/**
 * The API keys on the server since ADR-013 (§5; P8, AD-4 before): a user's
 * keys stay in their browser — PUT answers 410 to every account and writes
 * nothing —, the vault keeps a school's only; the keys stored before are
 * listed « à supprimer », revealed to their owner alone (no-store) to be
 * copied into the browser, and really deleted; explicit 503 when
 * SODIUM_MASTER_KEY is absent or malformed.
 */
final class KeysTest extends AuthTestBase
{
    private const MASTER_KEY_HEX = '89b1b60f0a26f73b63f9df20a9c58ab24905b48b2bd45a01b344cee69d7e3a55';
    private const API_KEY = 'sk-ant-api03-EXEMPLE-jamais-en-clair-en-base';

    private string $csrf = '';

    protected function setUp(): void
    {
        parent::setUp();
        self::$pdo->exec('DELETE FROM users');
        TestDb::setEnv('SODIUM_MASTER_KEY', self::MASTER_KEY_HEX);

        $response = $this->register('maya@example.org', self::PASSWORD, 'Maya');
        $this->csrf = (string) self::json($response)['csrfToken'];
    }

    private function maya(): int
    {
        return (int) self::$pdo->query("SELECT id FROM users WHERE email = 'maya@example.org'")->fetchColumn();
    }

    /** A key Maya stored before ADR-013. */
    private function stored(string $provider = 'anthropic', string $apiKey = self::API_KEY): void
    {
        StoredKeys::seed(self::$pdo, $this->maya(), $provider, $apiKey, (string) hex2bin(self::MASTER_KEY_HEX));
    }

    private function putKey(string $provider = 'anthropic', string $apiKey = self::API_KEY): \Psr\Http\Message\ResponseInterface
    {
        return $this->request('PUT', '/api/keys', [
            'provider' => $provider,
            'apiKey' => $apiKey,
        ], ['X-CSRF-Token' => $this->csrf]);
    }

    private function rows(): int
    {
        return (int) self::$pdo->query('SELECT COUNT(*) FROM user_api_keys')->fetchColumn();
    }

    /** R1: no account's key is written by the API any more — a learner's nor a school's. */
    public function testPutAnswers410ToEveryAccountAndWritesNothing(): void
    {
        $response = $this->putKey();
        self::assertSame(410, $response->getStatusCode());
        self::assertSame(KeyVault::REFUS, self::json($response)['error']);
        self::assertStringContainsString('Seule une école', self::json($response)['detail']);
        self::assertSame(0, $this->rows());

        // a school too: its key for its learners is written in its establishment space (lot S6b)
        Users::assignRole(self::$pdo, $this->maya(), 'etablissement');
        $response = $this->putKey();
        self::assertSame(410, $response->getStatusCode());
        self::assertStringContainsString('espace établissement', self::json($response)['detail']);
        self::assertSame(0, $this->rows());
        self::assertStringNotContainsString(self::API_KEY, (string) $response->getBody());
    }

    /** The body is never read: an invalid one, a Mistral AI key included, gets the same 410. */
    public function testPutRefusesBeforeAnyValidation(): void
    {
        self::assertNotContains('mistral', KeyVault::PROVIDERS);
        foreach ([['mistral', 'cle-mistral-EXEMPLE-0123'], ['skynet', self::API_KEY], ['anthropic', 'court'],
                  ['anthropic', "avec\ncontrole"]] as [$provider, $key]) {
            self::assertSame(410, $this->putKey($provider, $key)->getStatusCode(), $provider);
        }
        self::assertSame([], self::json($this->request('GET', '/api/keys')));
    }

    /** A key stored before: ciphertext at rest, revealed to its owner in clear, never cached. */
    public function testAStoredKeyIsRevealedToItsOwnerToBeCopied(): void
    {
        $this->stored();

        $blob = self::$pdo->query('SELECT encrypted_key FROM user_api_keys')->fetchColumn();
        self::assertIsString($blob);
        self::assertStringNotContainsString(self::API_KEY, $blob);

        $response = $this->request('GET', '/api/keys/anthropic');
        self::assertSame(200, $response->getStatusCode());
        self::assertSame(self::API_KEY, self::json($response)['apiKey']);
        self::assertStringContainsString('no-store', $response->getHeaderLine('Cache-Control'));
    }

    /** The list says what is still stored, « à supprimer », and since when it was notified — never a key. */
    public function testListNeverContainsKeyMaterial(): void
    {
        $this->stored();

        $response = $this->request('GET', '/api/keys');
        self::assertSame(200, $response->getStatusCode());
        $list = self::json($response);
        self::assertSame('anthropic', $list[0]['provider']);
        self::assertSame(['provider', 'createdAt', 'avisPurgeAt'], array_keys($list[0]));
        self::assertNull($list[0]['avisPurgeAt']);
        self::assertStringNotContainsString(self::API_KEY, (string) $response->getBody());

        StoredKeys::seed(self::$pdo, $this->maya(), 'openai', 'sk-openai-EXEMPLE-0123456789',
            (string) hex2bin(self::MASTER_KEY_HEX), '2026-10-20 09:30:00');
        self::assertSame('2026-10-20T09:30:00', self::json($this->request('GET', '/api/keys'))[1]['avisPurgeAt']);
    }

    public function testRevealIsOwnerOnly(): void
    {
        $this->stored();

        $this->cookieSid = null;
        $this->register('other@example.org', self::PASSWORD, 'Other');
        $response = $this->request('GET', '/api/keys/anthropic');
        self::assertSame(404, $response->getStatusCode(), 'another account must not see the key');
        self::assertStringNotContainsString(self::API_KEY, (string) $response->getBody());
    }

    public function testDeleteRemovesTheEntry(): void
    {
        $this->stored();
        self::assertSame(204, $this->request('DELETE', '/api/keys/anthropic', null, ['X-CSRF-Token' => $this->csrf])->getStatusCode());
        self::assertSame(0, $this->rows());
        self::assertSame(404, $this->request('DELETE', '/api/keys/anthropic', null, ['X-CSRF-Token' => $this->csrf])->getStatusCode());
        self::assertSame(404, $this->request('GET', '/api/keys/anthropic')->getStatusCode());
    }

    /**
     * Guard branch 401: every /api/keys route requires a session. The master
     * key IS configured here (setUp), so a failure cannot be confused with
     * the 503 « stockage non configuré » branch. Without a session cookie the
     * CSRF middleware passes through (no ambient credentials) — the guard
     * itself must answer 401, before the 410 of PUT.
     */
    public function testAuthenticationRequiredWithoutSession(): void
    {
        foreach ([
            ['GET', '/api/keys', null],
            ['PUT', '/api/keys', ['provider' => 'anthropic', 'apiKey' => self::API_KEY]],
            ['GET', '/api/keys/anthropic', null],
            ['DELETE', '/api/keys/anthropic', null],
        ] as [$method, $path, $body]) {
            $this->cookieSid = null; // anonymous browser: no session cookie

            $response = $this->request($method, $path, $body);
            self::assertSame(401, $response->getStatusCode(), $method . ' ' . $path);
            self::assertSame('Authentification requise', self::json($response)['error']);
        }
    }

    public function testMissingMasterKeyIsAnExplicit503EverywhereOnKeys(): void
    {
        $this->stored(); // stored while configured

        TestDb::setEnv('SODIUM_MASTER_KEY', '');
        foreach ([
            ['PUT', '/api/keys', ['provider' => 'anthropic', 'apiKey' => self::API_KEY]],
            ['GET', '/api/keys', null],
            ['GET', '/api/keys/anthropic', null],
            ['DELETE', '/api/keys/anthropic', null],
        ] as [$method, $path, $body]) {
            $response = $this->request($method, $path, $body, ['X-CSRF-Token' => $this->csrf]);
            self::assertSame(503, $response->getStatusCode(), $method . ' ' . $path);
            self::assertSame('Stockage de clés non configuré', self::json($response)['error']);
        }

        // Malformed key (odd length / non-hex) behaves like absent.
        TestDb::setEnv('SODIUM_MASTER_KEY', 'zz' . substr(self::MASTER_KEY_HEX, 2));
        self::assertSame(503, $this->request('GET', '/api/keys')->getStatusCode());

        // And the REST of the API is unaffected.
        self::assertSame(200, $this->request('GET', '/api/auth/me')->getStatusCode());

        // Restored key: the stored entry decrypts again.
        TestDb::setEnv('SODIUM_MASTER_KEY', self::MASTER_KEY_HEX);
        self::assertSame(self::API_KEY, self::json($this->request('GET', '/api/keys/anthropic'))['apiKey']);
    }

    public function testRotatedMasterKeyFailsClosed(): void
    {
        $this->stored();
        TestDb::setEnv('SODIUM_MASTER_KEY', strrev(self::MASTER_KEY_HEX));

        $response = $this->request('GET', '/api/keys/anthropic');
        self::assertSame(404, $response->getStatusCode(), 'undecryptable blob must not 500 nor leak');
    }

    /** The vault keeps a school's keys only (ADR-013 §1, R1): a learner's is refused, nothing written. */
    public function testTheVaultKeepsASchoolsKeyOnly(): void
    {
        $vault = new KeyVault(self::$pdo, (string) hex2bin(self::MASTER_KEY_HEX));
        $maya = $this->maya();

        self::assertFalse($vault->accepte($maya));
        try {
            $vault->store($maya, 'google', 'AIza-EXEMPLE-0123456789');
            self::fail('a learner\'s key must be refused');
        } catch (KeyRefused $e) {
            self::assertSame(KeyVault::REFUS, $e->getMessage());
        }
        self::assertSame(0, $this->rows());

        // a declared role opens nothing (ADR-013 §2 h): only the habilitation the administrator grants
        self::$pdo->prepare('INSERT INTO user_declared_roles (user_id, role) VALUES (?, ?)')->execute([$maya, 'architecte']);
        self::assertFalse($vault->accepte($maya));

        Users::assignRole(self::$pdo, $maya, 'etablissement');
        self::assertTrue($vault->accepte($maya));
        $vault->store($maya, 'google', 'AIza-EXEMPLE-0123456789');
        $vault->store($maya, 'anthropic', self::API_KEY);
        self::assertSame('AIza-EXEMPLE-0123456789', $vault->reveal($maya, 'google'));
        self::assertNull($vault->reveal($maya, 'openai'));

        $nonces = array_map(
            static fn (string $blob): string => substr($blob, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES),
            self::$pdo->query('SELECT encrypted_key FROM user_api_keys ORDER BY provider')->fetchAll(\PDO::FETCH_COLUMN),
        );
        self::assertNotSame($nonces[0], $nonces[1], 'nonce must be per entry');

        self::assertTrue($vault->delete($maya, 'google'));
        self::assertFalse($vault->delete($maya, 'google'));
    }
}
