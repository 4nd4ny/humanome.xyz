<?php

declare(strict_types=1);

/**
 * The user API keys stored before ADR-013 (P8, AD-4; ADR-013 §5). A user's
 * keys stay in their browser and are never kept on the server: PUT answers
 * 410 to every account — a school's too, whose key for its learners is
 * written in its establishment space (lot S6b) and returned by no route —,
 * and nothing writes a user key any more. What remains serves the account
 * page, which shows the keys still stored « à supprimer » until the purge
 * (scripts/purger-cles-utilisateurs.php, after a notice, never run
 * automatically): the list, the owner's reveal to copy a key into this
 * browser before deleting it, and the deletion. No run path calls the
 * reveal any more. Encryption model in src/Keys/KeyVault.php.
 *
 * Access: any logged-in user, own keys only. The list never carries key
 * material; the reveal answers no-store; keys are never logged.
 *
 * Without a valid SODIUM_MASTER_KEY every route answers an explicit 503
 * (« stockage de clés non configuré ») and the rest of the API is unaffected.
 * Order of the guards: CSRF (global middleware), 503, 401, then 410.
 */

use Humanome\Auth\Session;
use Humanome\Db;
use Humanome\Keys\KeyVault;
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

    $currentUserId = function (): ?int {
        if (!Db::isConfigured() || !Session::exists()) {
            return null;
        }
        Session::start();

        return Session::userId();
    };

    /**
     * Shared guard: 503 when key storage is unconfigured, 401 without a
     * session; otherwise hands (userId, vault) to the handler.
     */
    $withVault = function (callable $handler) use ($json, $currentUserId): callable {
        return function (Request $request, Response $response, array $args) use ($handler, $json, $currentUserId): Response {
            if (!Db::isConfigured()) {
                return $json($response, ['error' => 'Service indisponible'], 503);
            }
            $masterKey = KeyVault::masterKeyFromEnv();
            if ($masterKey === null) {
                return $json($response, ['error' => 'Stockage de clés non configuré'], 503);
            }
            $userId = $currentUserId();
            if ($userId === null) {
                return $json($response, ['error' => 'Authentification requise'], 401);
            }

            return $handler($request, $response, $args, $userId, new KeyVault(Db::get(), $masterKey));
        };
    };

    // ------------------------------------------------------------------
    // PUT /api/keys — gone (ADR-013 §5): 410 to every account, before any
    // look at the body, which is never read nor stored. A school is pointed
    // to its establishment space (CSRF via global middleware).
    // ------------------------------------------------------------------
    $app->put('/keys', $withVault(function (Request $request, Response $response, array $args, int $userId, KeyVault $vault) use ($json): Response {
        return $json($response, [
            'error' => KeyVault::REFUS,
            'detail' => $vault->accepte($userId)
                ? 'La clé de votre école, pour ses élèves, se règle dans votre espace établissement.'
                : 'Saisissez votre clé dans le navigateur, au lancement d’une cartographie : elle y reste. Seule une '
                    . 'école garde la sienne sur le serveur, pour ses élèves.',
        ], 410);
    }));

    // ------------------------------------------------------------------
    // GET /api/keys — [{provider, createdAt, avisPurgeAt}], NEVER the keys:
    // the keys still stored, « à supprimer » (ADR-013 §5).
    // ------------------------------------------------------------------
    $app->get('/keys', $withVault(function (Request $request, Response $response, array $args, int $userId, KeyVault $vault) use ($json): Response {
        return $json($response, $vault->listForUser($userId));
    }));

    // ------------------------------------------------------------------
    // GET /api/keys/{provider} — {apiKey} decrypted, OWNER ONLY, until the
    // purge: for the one action of the account page that copies a stored key
    // into this browser before deleting it (ADR-013 §5), so that nobody loses
    // a key kept nowhere else. No run path calls it. The body carries a
    // cleartext secret: mark it no-store so no browser disk cache or shared
    // proxy retains the decrypted key (cf. gdoc-text). It leaves with the
    // contraction (ADR-013 §8, step 10).
    // ------------------------------------------------------------------
    $app->get('/keys/{provider:[a-z]+}', $withVault(function (Request $request, Response $response, array $args, int $userId, KeyVault $vault) use ($json): Response {
        $apiKey = $vault->reveal($userId, (string) $args['provider']);
        if ($apiKey === null) {
            return $json($response, ['error' => 'Aucune clé enregistrée pour ce fournisseur'], 404);
        }

        return $json($response, ['apiKey' => $apiKey])->withHeader('Cache-Control', 'no-store');
    }));

    // ------------------------------------------------------------------
    // DELETE /api/keys/{provider} — real deletion (CSRF via middleware).
    // ------------------------------------------------------------------
    $app->delete('/keys/{provider:[a-z]+}', $withVault(function (Request $request, Response $response, array $args, int $userId, KeyVault $vault) use ($json): Response {
        if (!$vault->delete($userId, (string) $args['provider'])) {
            return $json($response, ['error' => 'Aucune clé enregistrée pour ce fournisseur'], 404);
        }

        return $response->withStatus(204);
    }));
};
