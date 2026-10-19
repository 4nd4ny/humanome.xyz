<?php

declare(strict_types=1);

/**
 * Twin9's configuration (T13, Twin_v9's docs/plan-twin9-php.md, lot 4d): a
 * user's run profiles, which the page #/configuration edits. Any logged-in
 * user sets their own profiles, and only theirs (docs/autorisations.md,
 * « Configuration Twin9 »); the administrator's settings (prices, margin,
 * personal keys, slices) stay at /api/twin9/admin/config.
 *
 *   GET    /api/twin9/configuration  the page's start: own profiles (no document), the default profile (the
 *                                     v9.8's, with the instance's default template set), the choices
 *   POST   /api/twin9/profils        {nom, profil} -> 201 {id, nom, profil}
 *   GET    /api/twin9/profils/{id}   own profile -> {id, nom, profil}
 *   PUT    /api/twin9/profils/{id}   {nom?, profil} -> {id, nom, profil}
 *   DELETE /api/twin9/profils/{id}   -> 204
 *
 * A profile is valid (the schema, the API's rules) and admitted (ProfilPolicy:
 * a published referential, a template set its owner may choose, the personal
 * key where it is opened) before it is written; it is answered completed, as stored. Another
 * user's profile is not found (404), whoever asks.
 */

use Humanome\Auth\Session;
use Humanome\Db;
use Humanome\Packages\SettingsRepository;
use Humanome\Twin9\ProfilPolicy;
use Humanome\Twin9\ProfilRepository;
use Humanome\Twin9\Twin9Config;
use Humanome\Twin9\Twin9Exception;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;

return function (App $app): void {
    // Floats keep their form (1.0): a profile goes back as it is stored.
    $json = function (Response $response, mixed $payload, int $status = 200): Response {
        $response->getBody()->write(json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE
            | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION));

        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    };

    // Session guard without a role requirement (pattern routes/twin9.php):
    // 401 for a visitor, the handler gets the user's id.
    $wrap = function (callable $handler) use ($json): callable {
        return function (Request $request, Response $response, array $args) use ($handler, $json): Response {
            if (!Db::isConfigured()) {
                return $json($response, ['error' => 'Service indisponible'], 503);
            }
            $userId = null;
            if (Session::exists()) {
                Session::start();
                $userId = Session::userId();
            }
            if ($userId === null) {
                return $json($response, ['error' => 'Authentification requise'], 401);
            }
            try {
                return $handler($request, $response, $args, $userId);
            } catch (Twin9Exception $e) {
                return $json($response, ['error' => $e->getMessage()], $e->getStatusCode());
            } catch (PDOException $e) {
                error_log('[twin9-configuration] ' . $e->getMessage());

                return $json($response, ['error' => 'Erreur interne'], 500);
            }
        };
    };

    $politique = static fn (): ProfilPolicy => new ProfilPolicy(Db::get(), new Twin9Config(new SettingsRepository(Db::get())));

    /**
     * The body's profile, valid and admitted for its owner, and its name:
     * decoded as objects, an empty object staying one.
     *
     * @return array{0: string|null, 1: stdClass}
     */
    $corps = function (Request $request, int $userId) use ($politique): array {
        $corps = json_decode((string) $request->getBody(), false);
        if (!$corps instanceof stdClass || !isset($corps->profil)) {
            throw new Twin9Exception('Corps invalide : {nom, profil} attendu', 422);
        }
        $nom = $corps->nom ?? null;
        if ($nom !== null && !\is_string($nom)) {
            throw new Twin9Exception('Nom de profil invalide', 422);
        }
        $profil = ProfilRepository::validate($corps->profil instanceof stdClass ? $corps->profil
            : throw new Twin9Exception('Profil invalide : objet JSON attendu', 422));
        $politique()->admettre($profil, $userId);

        return [$nom, $profil];
    };

    /** @return array{id: int, nom: string, profil: stdClass} the user's profile, or 404 */
    $sien = function (int $id, int $userId): array {
        $profil = (new ProfilRepository(Db::get()))->get($id);
        if ($profil === null || $profil['user_id'] !== $userId) {
            throw new Twin9Exception('Profil introuvable', 404);
        }

        return ['id' => $profil['id'], 'nom' => $profil['nom'], 'profil' => $profil['profil']];
    };

    $app->get('/twin9/configuration', $wrap(
        function (Request $request, Response $response, array $args, int $userId) use ($json, $politique): Response {
            return $json($response, [
                'profils' => (new ProfilRepository(Db::get()))->listForUser($userId),
                'defaut' => $politique()->defaut(),
            ] + $politique()->choix($userId));
        }
    ));

    $app->post('/twin9/profils', $wrap(
        function (Request $request, Response $response, array $args, int $userId) use ($json, $corps, $sien): Response {
            [$nom, $profil] = $corps($request, $userId);
            $id = (new ProfilRepository(Db::get()))->create($userId, $nom ?? '', $profil);

            return $json($response, $sien($id, $userId), 201);
        }
    ));

    $app->get('/twin9/profils/{id:[0-9]+}', $wrap(
        function (Request $request, Response $response, array $args, int $userId) use ($json, $sien): Response {
            return $json($response, $sien((int) $args['id'], $userId));
        }
    ));

    $app->put('/twin9/profils/{id:[0-9]+}', $wrap(
        function (Request $request, Response $response, array $args, int $userId) use ($json, $corps, $sien): Response {
            $id = (int) $args['id'];
            $sien($id, $userId);
            [$nom, $profil] = $corps($request, $userId);
            (new ProfilRepository(Db::get()))->update($id, $userId, $profil, $nom);

            return $json($response, $sien($id, $userId));
        }
    ));

    $app->delete('/twin9/profils/{id:[0-9]+}', $wrap(
        function (Request $request, Response $response, array $args, int $userId) use ($sien): Response {
            $id = (int) $args['id'];
            $sien($id, $userId);
            (new ProfilRepository(Db::get()))->delete($id, $userId);

            return $response->withStatus(204);
        }
    ));
};
