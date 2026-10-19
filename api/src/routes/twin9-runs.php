<?php

declare(strict_types=1);

/**
 * Twin9 runs on the server (T9, Twin_v9's docs/plan-twin9-php.md, lot 2,
 * « Lancer et suivre », « Lire les résultats »; ADR-011): a user launches a
 * run, follows it, cancels or resumes it, and reads its results; their page
 * advances their runs while it is open. Rights in docs/autorisations.md,
 * « Runs Twin9 ».
 *
 *   GET  /api/twin9/runs                     own runs, and whether Twin9 runs on this instance
 *   POST /api/twin9/runs                     {profil: id|null, portfolio: {nom, texte}, accord, visibilite?} -> 201
 *   POST /api/twin9/runs/avancer             the page advances its owner's runs (never the tick's token)
 *   GET  /api/twin9/runs/{id}                its progress, read in its journal (owner)
 *   POST /api/twin9/runs/{id}/annuler        stop it (owner)
 *   POST /api/twin9/runs/{id}/reprendre      resume it, cancelled or failed (owner)
 *   PUT  /api/twin9/runs/{id}/visibilite     {visibilite: privee|cartographe} (owner)
 *   GET  /api/twin9/runs/{id}/resultats      its results, filtered (owner; a linked cartographe if visible)
 *   GET  /api/twin9/admin/runs               every run's counters, never its content (admin)
 *
 * Anyone else's run is not found (404), whoever asks. Writes carry the CSRF
 * token (global middleware).
 */

use Humanome\Auth\Session;
use Humanome\Auth\Users;
use Humanome\Cartographe\Links;
use Humanome\Db;
use Humanome\Middleware\RequireRole;
use Humanome\Packages\SettingsRepository;
use Humanome\Twin9\EngineLoader;
use Humanome\Twin9\Lancement;
use Humanome\Twin9\Resultats;
use Humanome\Twin9\RunRepository;
use Humanome\Twin9\Twin9Config;
use Humanome\Twin9\Twin9Exception;
use Humanome\Worker\Tick;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;

return function (App $app): void {
    $json = function (Response $response, mixed $payload, int $status = 200): Response {
        $response->getBody()->write(json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE
            | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION));

        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    };

    // Session guard without a role requirement: 401 for a visitor, the handler gets the user's id.
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
                error_log('[twin9-runs] ' . $e->getMessage());

                return $json($response, ['error' => 'Erreur interne'], 500);
            }
        };
    };

    $disponible = static fn (): bool => EngineLoader::isLoaded() && class_exists(\Twin9\Plateforme::class);

    /** @return array<string, mixed> the body, decoded as an array, or 422 */
    $corps = static function (Request $request): array {
        $corps = json_decode((string) $request->getBody(), true);
        if (!\is_array($corps)) {
            throw new Twin9Exception('Corps JSON invalide : objet attendu', 422);
        }

        return $corps;
    };

    /** The run, its owner's: 404 for anyone else. */
    $sien = static function (int $id, int $userId): void {
        if (((new RunRepository(Db::get()))->acces($id)['user_id'] ?? null) !== $userId) {
            throw new Twin9Exception('Run introuvable', 404);
        }
    };

    /** A run as its page follows it. */
    $suivi = static function (int $id): array {
        $run = (new RunRepository(Db::get()))->suivi($id);
        unset($run['user_id']);

        return $run;
    };

    $app->get('/twin9/runs', $wrap(
        function (Request $request, Response $response, array $args, int $userId) use ($json, $disponible): Response {
            return $json($response, ['disponible' => $disponible(),
                                     'runs' => (new RunRepository(Db::get()))->duProprietaire($userId)]);
        }
    ));

    $app->post('/twin9/runs', $wrap(
        function (Request $request, Response $response, array $args, int $userId) use ($json, $corps, $suivi): Response {
            $c = $corps($request);
            $profil = $c['profil'] ?? null;
            if ($profil !== null && !\is_int($profil)) {
                throw new Twin9Exception('Profil invalide : identifiant ou null (le profil v9.8)', 422);
            }
            $portfolio = $c['portfolio'] ?? null;
            if (!\is_array($portfolio) || !\is_string($portfolio['nom'] ?? null) || !\is_string($portfolio['texte'] ?? null)) {
                throw new Twin9Exception('Portfolio requis : {nom, texte}', 422);
            }
            $visibilite = $c['visibilite'] ?? 'privee';
            $id = (new Lancement(Db::get(), new Twin9Config(new SettingsRepository(Db::get()))))->lancer(
                $userId, $profil, $portfolio['nom'], $portfolio['texte'], ($c['accord'] ?? false) === true,
                \is_string($visibilite) ? $visibilite : '');

            return $json($response, $suivi($id), 201);
        }
    ));

    // The page of a run advances its owner's runs while it is open (ADR-011 §2): a slice of the
    // tick's length, under its lock, their runs only, never the tick's token nor the mass jobs;
    // it ends early once their runs wait on nothing.
    $app->post('/twin9/runs/avancer', $wrap(
        function (Request $request, Response $response, array $args, int $userId) use ($json, $disponible): Response {
            $stmt = Db::get()->prepare('SELECT COUNT(*) FROM twin9_runs WHERE user_id = ? AND statut = "en_cours"');
            $stmt->execute([$userId]);
            if (!$disponible() || (int) $stmt->fetchColumn() === 0) {
                return $json($response, ['avance' => false, 'locked' => false]);
            }
            // a slice under way ends even if the page goes away: its calls are paid for
            ignore_user_abort(true);
            $resultat = (new Tick(Db::get(), ['twin9Utilisateur' => $userId]))->run();

            return $json($response, ['avance' => !$resultat['locked'], 'locked' => (bool) $resultat['locked']]);
        }
    ));

    $app->get('/twin9/runs/{id:[0-9]+}', $wrap(
        function (Request $request, Response $response, array $args, int $userId) use ($json, $sien, $suivi): Response {
            $sien((int) $args['id'], $userId);

            return $json($response, $suivi((int) $args['id']));
        }
    ));

    $app->post('/twin9/runs/{id:[0-9]+}/annuler', $wrap(
        function (Request $request, Response $response, array $args, int $userId) use ($json, $sien, $suivi): Response {
            $id = (int) $args['id'];
            $sien($id, $userId);
            if (!(new RunRepository(Db::get()))->annuler($id, $userId)) {
                throw new Twin9Exception('Ce run n’est pas en cours', 409);
            }

            return $json($response, $suivi($id));
        }
    ));

    $app->post('/twin9/runs/{id:[0-9]+}/reprendre', $wrap(
        function (Request $request, Response $response, array $args, int $userId) use ($json, $sien, $suivi): Response {
            $id = (int) $args['id'];
            $sien($id, $userId);
            if (!(new RunRepository(Db::get()))->reprendre($id, $userId)) {
                throw new Twin9Exception('Seul un run annulé ou arrêté reprend', 409);
            }

            return $json($response, $suivi($id));
        }
    ));

    $app->put('/twin9/runs/{id:[0-9]+}/visibilite', $wrap(
        function (Request $request, Response $response, array $args, int $userId) use ($json, $corps, $sien, $suivi): Response {
            $id = (int) $args['id'];
            $sien($id, $userId);
            $visibilite = $corps($request)['visibilite'] ?? null;
            if (!\in_array($visibilite, Lancement::VISIBILITES, true)) {
                throw new Twin9Exception('Visibilité inconnue : privee ou cartographe', 422);
            }
            (new RunRepository(Db::get()))->rendreVisible($id, $userId, $visibilite);

            return $json($response, $suivi($id));
        }
    ));

    // Its owner reads a run's results; a cartographe they linked, when the run is visible to them.
    // Anyone else, the administrator included, finds nothing.
    $app->get('/twin9/runs/{id:[0-9]+}/resultats', $wrap(
        function (Request $request, Response $response, array $args, int $userId) use ($json): Response {
            $id = (int) $args['id'];
            $pdo = Db::get();
            $run = (new RunRepository($pdo))->acces($id);
            $lecteur = match (true) {
                $run === null => null,
                $run['user_id'] === $userId => 'proprietaire',
                $run['visibilite'] === 'cartographe' && \in_array('cartographe', Users::rolesOf($pdo, $userId), true)
                    && (new Links($pdo))->isLinked($run['user_id'], $userId) => 'cartographe',
                default => null,
            };
            if ($lecteur === null) {
                throw new Twin9Exception('Run introuvable', 404);
            }
            $suivi = (new RunRepository($pdo))->suivi($id);

            return $json($response, [
                'run' => ['id' => $id, 'journal' => $suivi['journal'], 'statut' => $suivi['statut'],
                          'mode' => $suivi['mode'], 'attestation' => $suivi['attestation'],
                          'created_at' => $suivi['created_at'], 'finished_at' => $suivi['finished_at']],
                'lecteur' => $lecteur,
            ] + (new Resultats($pdo))->lire($id, $userId));
        }
    ));

    // The administrator sees every run's counters, never its portfolio nor its results (ADR-011 §5).
    $app->get('/twin9/admin/runs', $wrap(
        function (Request $request, Response $response, array $args, int $userId) use ($json): Response {
            $stmt = Db::get()->query(
                'SELECT id, user_id, statut, attente, created_at, finished_at, compteurs
                   FROM twin9_runs ORDER BY id DESC LIMIT 200'
            );
            $runs = array_map(static fn (array $r): array => [
                'id' => (int) $r['id'], 'user_id' => (int) $r['user_id'], 'statut' => (string) $r['statut'],
                'attente' => $r['attente'], 'created_at' => (string) $r['created_at'],
                'finished_at' => $r['finished_at'],
                'compteurs' => $r['compteurs'] === null ? null : json_decode((string) $r['compteurs'], true),
            ], $stmt->fetchAll());

            return $json($response, ['runs' => $runs]);
        }
    ))->add(RequireRole::any('admin'));
};

