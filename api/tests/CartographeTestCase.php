<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Referentiel\ContentHash;
use Humanome\Referentiel\ReferentielRepository;
use Psr\Http\Message\ResponseInterface;

/**
 * Shared plumbing for the P9 cartographe tests: multi-account browser
 * simulation (each account keeps its session cookie + CSRF token), role
 * arrangement via SQL (pattern ReferentielTestCase::createUser), invitation
 * flow helper and real schema fixtures.
 */
abstract class CartographeTestCase extends AuthTestBase
{
    protected function setUp(): void
    {
        parent::setUp();
        self::$pdo->exec('DELETE FROM users');
        self::$pdo->exec('DELETE FROM audit_events');
    }

    /**
     * Registers an account through the API then arranges its roles via SQL.
     * Returns the acting identity {id, csrf, sid}.
     *
     * @param list<string> $roles final role set (register grants `apprenant`)
     * @return array{id: int, csrf: string, sid: string}
     */
    protected function registerAs(string $email, string $name, array $roles = ['apprenant']): array
    {
        $this->cookieSid = null;
        // register() = inscription + activation (D5) : le compte est utilisable,
        // la session est ouverte par /auth/activate (200, {user, csrfToken}).
        $response = $this->register($email, self::PASSWORD, $name);
        self::assertSame(200, $response->getStatusCode(), 'register+activate ' . $email);
        $body = self::json($response);

        $userId = (int) $body['user']['id'];
        self::setRoles($userId, $roles);

        return [
            'id' => $userId,
            'csrf' => (string) $body['csrfToken'],
            'sid' => (string) $this->cookieSid,
        ];
    }

    /** @param list<string> $roles */
    protected static function setRoles(int $userId, array $roles): void
    {
        self::$pdo->prepare('DELETE FROM user_roles WHERE user_id = ?')->execute([$userId]);
        $bind = self::$pdo->prepare(
            'INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE name = ?'
        );
        foreach ($roles as $role) {
            $bind->execute([$userId, $role]);
        }
    }

    /**
     * One request AS the given account (session cookie + CSRF on mutations).
     *
     * @param array{id: int, csrf: string, sid: string} $user
     * @param array<string, mixed>|null $body
     */
    protected function as_(array $user, string $method, string $path, ?array $body = null): ResponseInterface
    {
        $this->cookieSid = $user['sid'];
        $headers = \in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)
            ? ['X-CSRF-Token' => $user['csrf']]
            : [];

        return $this->request($method, $path, $body, $headers);
    }

    /**
     * Opt-in cartography for the account; 'cartographe' visibility default
     * (the P9 queue subject).
     *
     * @param array{id: int, csrf: string, sid: string} $owner
     * @param array<string, mixed> $overrides
     */
    protected function createCarto(array $owner, array $overrides = []): int
    {
        $response = $this->as_($owner, 'POST', '/api/cartographies', array_merge([
            'type' => 'jour',
            'titre' => 'Feuille à relire',
            'visibility' => 'cartographe',
            'document' => ['kind' => 'cartographie-jour', 'date' => '2026-01-05', 'poles' => []],
        ], $overrides));
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        return (int) self::json($response)['id'];
    }

    /**
     * Full invitation flow through the API: the learner mints a code, the
     * cartographe accepts it.
     *
     * @param array{id: int, csrf: string, sid: string} $apprenant
     * @param array{id: int, csrf: string, sid: string} $cartographe
     */
    protected function link(array $apprenant, array $cartographe): void
    {
        $created = $this->as_($apprenant, 'POST', '/api/cartographe/invitations');
        self::assertSame(201, $created->getStatusCode());
        $code = (string) self::json($created)['code'];

        $accepted = $this->as_($cartographe, 'POST', '/api/cartographe/invitations/' . $code . '/accept');
        self::assertSame(201, $accepted->getStatusCode(), (string) $accepted->getBody());
    }

    /** @return array<string, mixed> real, schema-valid cartographie-jour document */
    protected static function jourDocument(): array
    {
        $path = dirname(__DIR__, 2) . '/schemas/fixtures/cartographie-jour-2026-01-05.json';
        self::assertFileExists($path);

        return json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }

    /** @return array<string, mixed> RESPIRE v7, the public fixture (schemas/fixtures) */
    protected static function respireV7(): array
    {
        return json_decode((string) file_get_contents(dirname(__DIR__, 2) . '/schemas/fixtures/referentiel-respire-v7.json'),
            true, 512, JSON_THROW_ON_ERROR);
    }

    /**
     * RESPIRE v7 as the only published RESPIRE (2026-10-20): a review reads its
     * codes and checks its revisions against a published version — the one a
     * cartography stored, else the newest its document conforms to, else the
     * latest. Other test classes may leave other RESPIRE versions behind: none
     * stays.
     */
    protected static function publierRespireV7(): void
    {
        self::$pdo->exec("DELETE FROM referentiel_versions WHERE referentiel_id = 'respire'");
        (new ReferentielRepository(self::$pdo))->importPublishedDocument(self::respireV7(), 'Import initial');
    }

    /**
     * Publishes a referential document as is (its contentHash computed).
     *
     * @param array<string, mixed> $referentiel
     */
    protected static function publierReferentiel(array $referentiel): void
    {
        unset($referentiel['contentHash']);
        (new ReferentielRepository(self::$pdo))->importPublishedDocument(
            ['contentHash' => ContentHash::compute($referentiel)] + $referentiel,
            'Publié',
        );
    }

    /**
     * A schema-valid day of any referential, built on the real one: each pole of
     * the referential, its first competence short-circuited; the document names
     * its referential unless it is RESPIRE (T17).
     *
     * @param array<string, mixed> $referentiel
     * @return array<string, mixed>
     */
    protected static function jourDocumentPour(array $referentiel): array
    {
        $base = self::jourDocument();
        $modele = $base['poles'][0];
        $competence = $modele['competences'][0]; // a short-circuit
        $doc = $base;
        $doc['poles'] = [];
        foreach ($referentiel['poles'] as $pole) {
            $codes = array_values(array_map(
                static fn (array $c): string => (string) $c['code'],
                array_filter($referentiel['competences'], static fn (array $c): bool => (int) $c['pole'] === (int) $pole['num']),
            ));
            $doc['poles'][] = ['poleNum' => (string) $pole['num']] + array_merge($modele, [
                'competences' => [['code' => $codes[0]] + $competence],
                'auditPole' => ['competencesTotales' => 1, 'courtCircuits' => 1, 'competencesNonCourtCircuit' => 0,
                                'presencesEtablies' => 0, 'nonEtablies' => 1, 'renvoisCartographe' => 0],
            ]);
        }
        if (($referentiel['id'] ?? 'respire') !== 'respire') {
            $doc['referentiel'] = $referentiel['id'];
        }

        return $doc;
    }

    /**
     * RESPIRE in a six-pole version: its seventh pole and its competences gone.
     *
     * @return array<string, mixed>
     */
    protected static function respireSixPoles(string $version = '8.0.0'): array
    {
        $ref = self::respireV7();
        $ref['version'] = $version;
        $ref['label'] = 'RESPIRE v8';
        $ref['poles'] = array_values(array_filter($ref['poles'], static fn (array $p): bool => (int) $p['num'] !== 7));
        $ref['competences'] = array_values(array_filter($ref['competences'], static fn (array $c): bool => (int) $c['pole'] !== 7));

        return $ref;
    }

    /** Latest audit event of a type: [user_id, details] or null. */
    protected static function lastAudit(string $type): ?array
    {
        $stmt = self::$pdo->prepare(
            'SELECT user_id, details FROM audit_events WHERE type = ? ORDER BY id DESC LIMIT 1'
        );
        $stmt->execute([$type]);
        $row = $stmt->fetch();

        return $row === false
            ? null
            : [
                'userId' => $row['user_id'] === null ? null : (int) $row['user_id'],
                'details' => $row['details'] === null ? null : json_decode((string) $row['details'], true),
            ];
    }
}
