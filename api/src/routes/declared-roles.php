<?php

declare(strict_types=1);

/**
 * Declared RESPIRE roles (sprint 8, migration 035) — the identity an account
 * gives itself in #/compte, apart from its habilitations:
 *
 *   GET /api/auth/me/declared-roles  -> {roles, foundingCircle, catalogue}
 *   PUT /api/auth/me/declared-roles  {roles: list<slug>, foundingCircle?: bool}
 *                                    -> the same; replaces the whole declaration
 *
 * Any account with a session declares its own roles, and only its own. A
 * declaration opens NOTHING (docs/autorisations.md, principle 7): no guard,
 * menu family, vote nor shared run reads it — they read the habilitations
 * (`user_roles`), which an administrator alone grants (routes/admin.php),
 * `admin` never declarable. The PUT rides the global CSRF middleware
 * (routes/auth.php); the founding circle box is checked by the server on
 * every write (Auth\DeclaredRoles::validate).
 *
 * RGPD (registre §1 ter): read by the person and by the administrator,
 * in the account archive, purged with the account. Not audited: a
 * self-declaration opens no right, and the journal stays minimal (§6.5).
 */

use Humanome\Auth\DeclaredRoles;
use Humanome\Auth\Session;
use Humanome\Auth\Users;
use Humanome\Db;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;

return function (App $app): void {
    $json = function (Response $response, mixed $payload, int $status = 200): Response {
        $response->getBody()->write(json_encode(
            $payload,
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES,
        ));

        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withStatus($status);
    };

    // The session's account, or null: no session, or the stale session of a purged account.
    $currentUserId = static function (): ?int {
        if (!Db::isConfigured() || !Session::exists()) {
            return null;
        }
        Session::start();
        $userId = Session::userId();

        return $userId !== null && Users::findById(Db::get(), $userId) !== null ? $userId : null;
    };

    $wrap = function (callable $handler) use ($json, $currentUserId): callable {
        return function (Request $request, Response $response) use ($handler, $json, $currentUserId): Response {
            if (!Db::isConfigured()) {
                return $json($response, ['error' => 'Service indisponible'], 503);
            }
            try {
                $userId = $currentUserId();
                if ($userId === null) {
                    return $json($response, ['error' => 'Authentification requise'], 401);
                }

                return $handler($request, $response, $userId);
            } catch (PDOException $e) {
                error_log('[declared-roles] ' . $e->getMessage());

                return $json($response, ['error' => 'Erreur interne'], 500);
            }
        };
    };

    $payload = static fn (array $declaration): array => $declaration + ['catalogue' => DeclaredRoles::catalogue()];

    $app->get('/auth/me/declared-roles', $wrap(
        function (Request $request, Response $response, int $userId) use ($json, $payload): Response {
            return $json($response, $payload((new DeclaredRoles(Db::get()))->of($userId)));
        }
    ));

    $app->put('/auth/me/declared-roles', $wrap(
        function (Request $request, Response $response, int $userId) use ($json, $payload): Response {
            $checked = DeclaredRoles::validate($request->getParsedBody());
            if ($checked['declaration'] === null) {
                return $json($response, ['error' => 'Validation échouée', 'fields' => $checked['fields']], 422);
            }
            $declared = new DeclaredRoles(Db::get());
            if (!$declared->replace($userId, $checked['declaration'])) {
                return $json($response, ['error' => 'Authentification requise'], 401);
            }

            return $json($response, $payload($declared->of($userId)));
        }
    ));
};
