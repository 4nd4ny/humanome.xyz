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
 *   POST /api/twin9/runs/apercu              {profil, portfolio, referentiel?, payeur?}: the days new or changed, the
 *                                            estimated cost and duration, the caps, the referential read, who would
 *                                            pay and who may, before a launch (T10, ADR-013 §4)
 *   POST /api/twin9/runs                     {profil: id|null, portfolio: {nom, texte}, accord: {fournisseurs: [ids]}
 *                                            (true for a profile all Anthropic), visibilite?, referentiel?:
 *                                            {id, version?}|null — another referential than its profile's, chosen at
 *                                            the launch (S5, lot C) —, payeur?: "personnel"|id of a school|null
 *                                            (ADR-013 §4: by default their school, when they have one only)} -> 201
 *   POST /api/twin9/runs/avancer             the page advances its owner's runs (never the tick's token)
 *   GET  /api/twin9/runs/{id}                its progress, read in its journal, and its cost (owner)
 *   POST /api/twin9/runs/{id}/annuler        stop it (owner)
 *   POST /api/twin9/runs/{id}/reprendre      resume it, cancelled or stopped, {budget_usd?} a new budget, {payeur?}
 *                                            its payer chosen again (owner); its providers available again
 *                                            (ProfilPolicy::admettreAuLancement), its school still paying
 *   PUT  /api/twin9/runs/{id}/visibilite     {visibilite: privee|cartographe} (owner)
 *   GET  /api/twin9/runs/{id}/resultats      its results, filtered (owner; a linked cartographe if visible)
 *   GET  /api/twin9/mes-analyses             the account's runs, journals, outputs and maps, which its archive
 *                                            carries (T10)
 *   GET  /api/twin9/admin/runs               every run's counters, never its content (admin)
 *
 * Anyone else's run is not found (404), whoever asks. Writes carry the CSRF
 * token (global middleware).
 */

use Humanome\Auth\Session;
use Humanome\Auth\Users;
use Humanome\Cartographe\Links;
use Humanome\Db;
use Humanome\Etablissement\Payeurs;
use Humanome\Middleware\RequireRole;
use Humanome\Packages\SettingsRepository;
use Humanome\Referentiel\ReferentielRepository;
use Humanome\Referentiel\Semver;
use Humanome\Twin9\CallSettings;
use Humanome\Twin9\EngineLoader;
use Humanome\Twin9\Lancement;
use Humanome\Twin9\ProfilPolicy;
use Humanome\Twin9\Resultats;
use Humanome\Twin9\RunConfiguration;
use Humanome\Twin9\RunCosts;
use Humanome\Twin9\RunExecution;
use Humanome\Twin9\RunExport;
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
    // a launch also needs an engine that reads the run's referential (T16, Lancement): the page offers one only then,
    // while the runs launched before go on advancing
    $lancable = static fn (): bool => $disponible() && class_exists(\Twin9\ReferentielInvalide::class);

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
        function (Request $request, Response $response, array $args, int $userId) use ($json, $lancable): Response {
            return $json($response, ['disponible' => $lancable(),
                                     'runs' => (new RunRepository(Db::get()))->duProprietaire($userId)]);
        }
    ));

    /**
     * The profile, the portfolio and the referential a body names, or 422. The referential (S5, lot C): absent or
     * null, its profile's; {id, version?}, another one chosen at the launch, its version null for its latest
     * published (Lancement::preparer()).
     *
     * @return array{0: int|null, 1: array{nom: string, texte: string}, 2: array{id: string, version: string|null}|null}
     */
    $choix = static function (array $c): array {
        $profil = $c['profil'] ?? null;
        if ($profil !== null && !\is_int($profil)) {
            throw new Twin9Exception('Profil invalide : identifiant ou null (le profil v9.8)', 422);
        }
        $portfolio = $c['portfolio'] ?? null;
        if (!\is_array($portfolio) || !\is_string($portfolio['nom'] ?? null) || !\is_string($portfolio['texte'] ?? null)) {
            throw new Twin9Exception('Portfolio requis : {nom, texte}', 422);
        }
        $referentiel = $c['referentiel'] ?? null;
        if ($referentiel !== null) {
            $id = \is_array($referentiel) ? ($referentiel['id'] ?? null) : null;
            $version = \is_array($referentiel) ? ($referentiel['version'] ?? null) : null;
            if (!\is_string($id) || preg_match(ReferentielRepository::ID_PATTERN, $id) !== 1
                || array_diff(array_keys($referentiel), ['id', 'version']) !== []
                || ($version !== null && (!\is_string($version) || !Semver::isValid($version)))) {
                throw new Twin9Exception('Référentiel invalide : {id, version?} (version semver, ou null pour la '
                    . 'dernière publiée), ou null pour celui du profil', 422);
            }
            $referentiel = ['id' => $id, 'version' => $version];
        }

        return [$profil, $portfolio, $referentiel];
    };

    $lancement = static fn (): Lancement => new Lancement(Db::get(), new Twin9Config(new SettingsRepository(Db::get())));

    // Before a launch (T10): what the run would instruct — the portfolio's days new or changed since the
    // map's memory —, what it would cost and last, and its caps. Nothing is kept.
    $app->post('/twin9/runs/apercu', $wrap(
        function (Request $request, Response $response, array $args, int $userId) use ($json, $corps, $choix,
                                                                                        $lancement): Response {
            $c = $corps($request);
            [$profil, $portfolio, $referentiel] = $choix($c);

            return $json($response, $lancement()->apercu($userId, $profil, $portfolio['nom'], $portfolio['texte'],
                $referentiel, $c['payeur'] ?? null));
        }
    ));

    $app->post('/twin9/runs', $wrap(
        function (Request $request, Response $response, array $args, int $userId) use ($json, $corps, $choix,
                                                                                        $lancement, $suivi): Response {
            $c = $corps($request);
            [$profil, $portfolio, $referentiel] = $choix($c);
            $visibilite = $c['visibilite'] ?? 'privee';
            // the consent as sent: {fournisseurs: [ids]}, or true for a profile all Anthropic (Lancement)
            $id = $lancement()->lancer($userId, $profil, $portfolio['nom'], $portfolio['texte'],
                $c['accord'] ?? false, \is_string($visibilite) ? $visibilite : '', null, $referentiel,
                $c['payeur'] ?? null);

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
            // what its calls hold that no slice has in flight goes back now; a call still sent, at the slice that
            // has it in flight — written with its cost when it comes back — or at the next tick (Twin9Slice); its
            // batches, once collected (Twin9Lots)
            (new RunCosts(Db::get(), new Twin9Config(new SettingsRepository(Db::get()))))->libererHorsVol($id);

            return $json($response, $suivi($id));
        }
    ));

    $app->post('/twin9/runs/{id:[0-9]+}/reprendre', $wrap(
        function (Request $request, Response $response, array $args, int $userId) use ($json, $sien, $suivi): Response {
            $id = (int) $args['id'];
            $sien($id, $userId);
            // a new budget, when its budget stopped it: dollars, or null for none
            $c = json_decode((string) $request->getBody(), true);
            $plafonds = [];
            if (\is_array($c) && \array_key_exists('budget_usd', $c)) {
                $budget = $c['budget_usd'];
                if ($budget !== null && ((!\is_int($budget) && !\is_float($budget)) || $budget <= 0)) {
                    throw new Twin9Exception('Budget invalide : un nombre de dollars positif, ou null pour aucun', 422);
                }
                $plafonds['budget_usd'] = $budget;
            }
            // the guard of its providers, read again (ADR-012): one closed since, or without its key, keeps it stopped;
            // a run on the personal key no longer resumes (ADR-013 §6): it ended there, or its owner stopped it
            $copie = (new RunRepository(Db::get()))->tete($id);
            $payeur = null;
            $voie = null;
            if ($copie !== null && \in_array($copie['statut'], ['annule', 'echoue'], true)) {
                ProfilPolicy::refuserClePersonnelle($copie['profil']);
                (new ProfilPolicy(Db::get(), new Twin9Config(new SettingsRepository(Db::get()))))
                    ->admettreAuLancement($copie['profil']);
                // who pays (ADR-013 §4): chosen again when the body says so, its factor frozen again — and the lane
                // with it: its school's key when the school chosen has one and the run reaches Anthropic alone, else
                // the instance's, paid from that school's credit or its owner's balance (Payeurs::pourRun()); else
                // its school, if one paid, still paying — never its owner's balance in its place
                $payeurs = new Payeurs(Db::get());
                $cle = (string) ($copie['profil']->cle ?? 'instance');
                if (\is_array($c) && \array_key_exists('payeur', $c)) {
                    ['payeur' => $payeur, 'cle' => $voie] = $payeurs->pourRun($userId, $c['payeur'], 'instance',
                        (new CallSettings($copie['profil']))->fournisseurs());
                } elseif ($copie['payeur'] === 'ecole' && $payeurs->encorePaie($userId, $copie['payeur_id'], $cle,
                        $copie['facteur_prix']) !== null) {
                    throw new Twin9Exception('Votre école ne paie plus cette analyse : choisissez qui la paie pour la '
                        . 'reprendre', 422);
                }
            }
            if (!(new RunRepository(Db::get()))->reprendre($id, $userId, $plafonds, $payeur, $voie ?? null)) {
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
            $runs = new RunRepository($pdo);
            $suivi = $runs->suivi($id);
            // its configuration and its execution (P0-1, docs/contrats.md §8.9); a cartographe reads neither what
            // its owner pays nor how: no price, cost, cap nor key
            $configuration = $runs->configuration($id);
            $execution = $runs->execution($id);
            if ($lecteur === 'cartographe') {
                $configuration = $configuration === null ? null : RunConfiguration::pourCartographe($configuration);
                $execution = $execution === null ? null : RunExecution::pourCartographe($execution);
            }

            return $json($response, [
                'run' => ['id' => $id, 'journal' => $suivi['journal'], 'statut' => $suivi['statut'],
                          'retard' => $suivi['retard'], 'mode' => $suivi['mode'],
                          'attestation' => $suivi['attestation'],
                          'configuration' => $configuration, 'execution' => $execution,
                          'created_at' => $suivi['created_at'], 'finished_at' => $suivi['finished_at']],
                'lecteur' => $lecteur,
            ] + (new Resultats($pdo))->lire($id, $userId));
        }
    ));

    // The account's runs, which its archive carries (T10, ADR-011 §5; UC-APP-06, read in the browser like
    // mes-documents-masse): settings, portfolio, journal, outputs, and the memory of its maps, filtered as its
    // results are; written a run at a time.
    $app->get('/twin9/mes-analyses', $wrap(
        function (Request $request, Response $response, array $args, int $userId): Response {
            $corps = $response->getBody();
            (new RunExport(Db::get()))->ecrire($userId, static function (string $morceau) use ($corps): void {
                $corps->write($morceau);
            });

            return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
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

