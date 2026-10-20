<?php

declare(strict_types=1);

/**
 * Twin9 server routes (T3a admin surface + T3b user surface, ADR-010).
 *
 * The templates stored in twin9_protocole (the v9.8's set) and
 * twin9_jeux_gabarits (its copies) are the platform's industrial secret: this
 * file is the ONLY place where their content leaves the database, and every
 * such route is gated by RequireRole::all('admin', 'promptologue') (ADR-010
 * §2/§6, AD-D2 — anyone else gets 403). Error messages stay generic: no
 * template fragment, ever.
 *
 * Template sets (T14, Twin_v9's docs/plan-twin9-php.md, lot 4b): the v9.8's,
 * which the import writes and the atelier only reads, and the copies the
 * promptologues make of it ({jeu} = "v9.8" or a copy's id):
 *   GET  /api/twin9/admin/jeux                      admin: the sets, the default (no content)
 *   PUT  /api/twin9/admin/jeux/defaut               admin: {jeu} the instance's default set
 *   POST /api/twin9/admin/jeux                      atelier: {id} copy the v9.8's set
 *   GET  /api/twin9/admin/jeux/{jeu}/protocole                 list (metadata, no content)
 *   GET  /api/twin9/admin/jeux/{jeu}/protocole/{name}/versions edit history (metadata)
 *   GET  /api/twin9/admin/jeux/{jeu}/protocole/{name}/versions/{v} one archived version WITH content
 *   POST /api/twin9/admin/jeux/{jeu}/protocole/{name}/restore  {version} — a copy's author
 *   GET  /api/twin9/admin/jeux/{jeu}/protocole/{name}          one template WITH content
 *   PUT  /api/twin9/admin/jeux/{jeu}/protocole/{name}          {content} — a copy's author, edit + version
 *   POST /api/twin9/admin/jeux/{jeu}/tester                    {name, variables{}} -> {rendu, non_resolues}
 * The atelier is admin ∧ promptologue (AD-D2): only it reads a template.
 *
 * Admin routes:
 *   GET  /api/twin9/admin/config                    Twin9Config (admin shape)
 *   PUT  /api/twin9/admin/config                    partial update, 422 on bounds
 *   POST /api/admin/twin9/import                    X-Migrate-Token (deploy script): the v9.8's set
 *
 * User routes (T3b — any logged-in user, ADR-010 §3/§4). The proxied call of
 * the browser's engine, POST /api/twin9/appel, left with that engine (T11):
 * the runs execute on the server (ADR-011, routes/twin9-runs.php).
 *   POST /api/twin6/appel                  open cartography (Twin6) on credits
 *   GET  /api/twin9/meta                   what the credit page and Twin6 read (no content)
 *   GET  /api/twin9/credit                 balance + last ledger events
 *   GET  /api/twin9/facture?annee=&mois=   monthly recap invoice (own account)
 *   GET  /api/twin9/depenses               spend tracking per month (own account)
 *   GET  /api/twin9/admin/comptes          admin: balances/totals of all accounts
 *   POST /api/twin9/credit/paypal/creer    {pack_index} -> {approve_url, order_id}
 *   POST /api/twin9/credit/paypal/capturer {order_id} -> {solde_microusd}
 *
 * {name} is hierarchical ('lourd/20-greffier'): the routes use a greedy
 * {name:.+} pattern, and the /versions routes are registered FIRST so
 * FastRoute matches them before the greedy catch-all.
 */

use Humanome\Auth\RateLimiter;
use Humanome\Auth\Session;
use Humanome\Db;
use Humanome\Env;
use Humanome\Keys\KeyVault;
use Humanome\Llm\HttpClientException;
use Humanome\Llm\LlmRuntime;
use Humanome\Middleware\RequireRole;
use Humanome\Packages\SettingsRepository;
use Humanome\Twin9\AnthropicCaller;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\FactureService;
use Humanome\Twin9\PayPalClient;
use Humanome\Twin9\ProtocoleRepository;
use Humanome\Twin9\SoldeInsuffisantException;
use Humanome\Twin9\TemplateSets;
use Humanome\Twin9\Twin9Config;
use Humanome\Twin9\Twin9Exception;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;

/** Per-user cap on the PayPal endpoints (2026-07-15 review) — each spends live
 * PayPal creds. Guarded define(): route files are require'd once per app
 * instance, and the test suite builds several apps in one process. */
if (!defined('PAYPAL_PAR_MINUTE')) {
    define('PAYPAL_PAR_MINUTE', 20);
}

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

    // Db guard + uniform error mapping (pattern routes/admin.php):
    // Twin9Exception carries its own status and a generic French message;
    // PDO detail stays in the server log only (never a template fragment).
    $wrap = function (callable $handler) use ($json): callable {
        return function (Request $request, Response $response, array $args) use ($handler, $json): Response {
            if (!Db::isConfigured()) {
                return $json($response, ['error' => 'Service indisponible'], 503);
            }
            try {
                return $handler($request, $response, $args);
            } catch (SoldeInsuffisantException $e) {
                // Safety net (/twin6/appel pre-checks and answers its own
                // 402): amounts only, never content.
                return $json($response, [
                    'error' => 'Solde insuffisant',
                    'solde_microusd' => $e->getBalanceMicrousd(),
                    'requis_estime_microusd' => $e->getRequestedMicrousd(),
                ], 402);
            } catch (Twin9Exception $e) {
                return $json($response, ['error' => $e->getMessage()], $e->getStatusCode());
            } catch (HttpClientException $e) {
                // Defense in depth: callers normally wrap network failures
                // into Twin9Exception themselves.
                return $json($response, ['error' => 'Service amont injoignable, réessayez plus tard.'], 502);
            } catch (PDOException $e) {
                error_log('[twin9] ' . $e->getMessage());

                return $json($response, ['error' => 'Erreur interne'], 500);
            }
        };
    };

    /** @return array<string, mixed>|null null when the body is not a JSON object */
    $parseBody = function (Request $request): ?array {
        $raw = (string) $request->getBody();
        if (trim($raw) === '') {
            return [];
        }
        $decoded = json_decode($raw, true);

        return \is_array($decoded) ? $decoded : null;
    };

    $admin = RequireRole::any('admin');
    // AD-D2 : le CONTENU des gabarits Twin9 (lecture ET écriture, y compris le
    // rendu du banc d'essai) exige la CONJONCTION admin ∧ promptologue. Un admin
    // non-promptologue ne voit plus le contenu (403) ; la supervision (config,
    // promo, comptes) reste admin seul. Le contenu ne transite JAMAIS vers un
    // client sans les deux rôles.
    $atelier = RequireRole::all('admin', 'promptologue');

    // ==================================================================
    // 1. Template sets (T14) and their templates — the list and the default:
    //    admin (no content); a copy, the content, its versions, its rollback
    //    and the test bench: the atelier, admin ∧ promptologue (AD-D2). The
    //    v9.8's set is read-only; a copy is written by its author alone.
    // ==================================================================

    $jeux = static fn (): TemplateSets => new TemplateSets(Db::get());

    // GET /api/twin9/admin/jeux — the sets, the v9.8's first: id, author,
    // whether the session's, number of templates, date, the default. No content.
    $app->get('/twin9/admin/jeux', $wrap(function (Request $request, Response $response) use ($json, $jeux): Response {
        $moi = (int) $request->getAttribute('userId');
        $sets = $jeux();

        return $json($response, ['defaut' => $sets->defaut(), 'jeux' => array_map(static fn (array $j): array => [
            'id' => $j['id'], 'auteur' => $j['auteur'], 'mien' => $j['auteur_id'] === $moi,
            'gabarits' => $j['gabarits'], 'created_at' => $j['created_at'], 'defaut' => $j['defaut'],
        ], $sets->lister())]);
    }))->add($admin);

    // PUT /api/twin9/admin/jeux/defaut {jeu} — the instance's default set: the
    // default profile's, which a new profile starts from (404 unknown).
    $app->put('/twin9/admin/jeux/defaut', $wrap(function (Request $request, Response $response) use ($json, $parseBody, $jeux): Response {
        $body = $parseBody($request);
        $jeu = \is_array($body) && \is_string($body['jeu'] ?? null) ? $body['jeu'] : '';
        if ($jeu === '') {
            return $json($response, ['error' => 'Champ requis : jeu'], 422);
        }
        $sets = $jeux();
        $sets->fixerDefaut($jeu);

        return $json($response, ['defaut' => $sets->defaut()]);
    }))->add($admin);

    // POST /api/twin9/admin/jeux {id} — copies the v9.8's set under the name
    // given, the session's to edit (422 invalid name, 409 taken or nothing to copy).
    $app->post('/twin9/admin/jeux', $wrap(function (Request $request, Response $response) use ($json, $parseBody, $jeux): Response {
        $body = $parseBody($request);
        $id = \is_array($body) && \is_string($body['id'] ?? null) ? $body['id'] : '';

        return $json($response, $jeux()->copier($id, (int) $request->getAttribute('userId')), 201);
    }))->add($atelier);

    $set = '/twin9/admin/jeux/{jeu:[a-z0-9][a-z0-9._-]*}';

    // GET …/{jeu}/protocole — metadata list (noms des gabarits : révèle la
    // structure du protocole, gardé comme le contenu).
    $app->get($set . '/protocole', $wrap(function (Request $request, Response $response, array $args) use ($json, $jeux): Response {
        return $json($response, ['protocole' => $jeux()->lire((string) $args['jeu'])->list()]);
    }))->add($atelier);

    // GET …/{jeu}/protocole/{name}/versions — edit history. Registered BEFORE
    // the greedy {name:.+} routes (FastRoute matches in registration order).
    $app->get($set . '/protocole/{name:.+}/versions', $wrap(function (Request $request, Response $response, array $args) use ($json, $jeux): Response {
        $repo = $jeux()->lire((string) $args['jeu']);
        $name = (string) $args['name'];
        if ($repo->get($name) === null) {
            return $json($response, ['error' => 'Gabarit introuvable'], 404);
        }

        return $json($response, ['name' => $name, 'versions' => $repo->versions($name)]);
    }))->add($atelier);

    // GET …/{jeu}/protocole/{name}/versions/{version} — one ARCHIVED version
    // WITH content (D13 : lecture avant restauration).
    $app->get($set . '/protocole/{name:.+}/versions/{version:[0-9]+}', $wrap(function (Request $request, Response $response, array $args) use ($json, $jeux): Response {
        $archived = $jeux()->lire((string) $args['jeu'])->version((string) $args['name'], (int) $args['version']);
        if ($archived === null) {
            return $json($response, ['error' => 'Version introuvable'], 404);
        }

        return $json($response, $archived);
    }))->add($atelier);

    // POST …/{jeu}/protocole/{name}/restore {version} — restaure une version
    // archivée d'une copie, par son auteur (D13, ADR-010 §6). Jamais
    // destructif : le contenu courant est archivé d'abord. Restaurer un
    // contenu identique au vivant = no-op. Le jeu v9.8 : 403.
    $app->post($set . '/protocole/{name:.+}/restore', $wrap(function (Request $request, Response $response, array $args) use ($json, $parseBody, $jeux): Response {
        $body = $parseBody($request);
        $version = \is_array($body) && \is_int($body['version'] ?? null) ? $body['version'] : 0;
        if ($version < 1) {
            return $json($response, ['error' => 'Champ requis : version (entier >= 1)'], 422);
        }

        return $json($response, $jeux()->restaurer((string) $args['jeu'], (string) $args['name'], $version,
            (int) $request->getAttribute('userId')));
    }))->add($atelier);

    // GET …/{jeu}/protocole/{name} — WITH content. This route is THE point
    // where an admin-promptologue (and no one else) reads a template.
    $app->get($set . '/protocole/{name:.+}', $wrap(function (Request $request, Response $response, array $args) use ($json, $jeux): Response {
        $template = $jeux()->lire((string) $args['jeu'])->get((string) $args['name']);
        if ($template === null) {
            return $json($response, ['error' => 'Gabarit introuvable'], 404);
        }

        return $json($response, $template);
    }))->add($atelier);

    // PUT …/{jeu}/protocole/{name} {content} — edit a template of a copy, by
    // its author (previous content archived as a version). 403: the v9.8's
    // set, or another's copy; 404: a template the copy does not have; 422:
    // empty or >= 256 Ko, or a variable no step gives the template.
    $app->put($set . '/protocole/{name:.+}', $wrap(function (Request $request, Response $response, array $args) use ($json, $parseBody, $jeux): Response {
        $body = $parseBody($request);
        $content = \is_array($body) && \is_string($body['content'] ?? null) ? $body['content'] : '';
        if ($content === '') {
            return $json($response, ['error' => 'Champ requis : content (texte non vide)'], 422);
        }

        return $json($response, $jeux()->ecrire((string) $args['jeu'], (string) $args['name'], $content,
            (int) $request->getAttribute('userId')));
    }))->add($atelier);

    // ==================================================================
    // 2. Configuration — admin only (supervision commerciale, AD-D2)
    // ==================================================================

    // GET /api/twin9/admin/config — effective config (admin shape: raw list
    // prices + margin; the front only ever sees Twin9Config::publicView()).
    $app->get('/twin9/admin/config', $wrap(function (Request $request, Response $response) use ($json): Response {
        return $json($response, (new Twin9Config(new SettingsRepository(Db::get())))->read());
    }))->add($admin);

    // PUT /api/twin9/admin/config {champs partiels} — 422 out of bounds
    // (marge 1..5, prix > 0, packs 1..500 USD) or for an unknown key.
    $app->put('/twin9/admin/config', $wrap(function (Request $request, Response $response) use ($json, $parseBody): Response {
        $body = $parseBody($request);
        if (!\is_array($body)) {
            return $json($response, ['error' => 'Corps JSON invalide : objet attendu'], 400);
        }

        return $json($response, (new Twin9Config(new SettingsRepository(Db::get())))->update($body));
    }))->add($admin);

    // ==================================================================
    // 3. Test bench — atelier : admin ∧ promptologue (le rendu CONTIENT le
    //    gabarit), rendering WITHOUT any LLM call, a template of any set
    // ==================================================================

    // POST /api/twin9/admin/jeux/{jeu}/tester {name, variables{}} -> {rendu, non_resolues}
    $app->post($set . '/tester', $wrap(function (Request $request, Response $response, array $args) use ($json, $parseBody, $jeux): Response {
        $body = $parseBody($request);
        $name = \is_array($body) && \is_string($body['name'] ?? null) ? $body['name'] : '';
        $variables = \is_array($body) && \is_array($body['variables'] ?? null) ? $body['variables'] : [];
        if ($name === '') {
            return $json($response, ['error' => 'Champ requis : name'], 422);
        }

        return $json($response, $jeux()->lire((string) $args['jeu'])->render($name, $variables));
    }))->add($atelier);

    // ==================================================================
    // 4. User surface (T3b) — any logged-in user, ADR-010 §1/§3/§4.
    //    The CSRF middleware covers every POST here (session-borne).
    // ==================================================================

    // Session guard without a role requirement (« tout utilisateur
    // connecté ») — pattern routes/keys.php. 401 exactly like RequireRole.
    $sessionUserId = function (): ?int {
        if (!Session::exists()) {
            return null;
        }
        Session::start();

        return Session::userId();
    };

    // Twin6 (open cartography) carries the WHOLE portfolio in every scan-pole
    // prompt (one call per pole re-reads it), so its billed proxy accepts a larger body.
    $twin6MaxPayloadBytes = 2_000_000;

    // PayPal redirect targets (ADR-010 §3). No webhook at the MVP: the FRONT
    // calls /capturer when PayPal redirects back — the capture is idempotent
    // (PayPal-side and by the UNIQUE paypal_order_id in the ledger), so a
    // double click or a replayed redirect converges instead of double
    // crediting. PayPal appends its own '&token=<order_id>' to the return
    // URL (the '?' already present inside the fragment makes it land in the
    // hash query, readable by the hash router — ADR-009).
    $paypalReturnUrl = 'https://humanome.xyz/#/compte/credit?paypal=retour';
    $paypalCancelUrl = 'https://humanome.xyz/#/compte/credit?paypal=annule';

    // ------------------------------------------------------------------
    // POST /api/twin6/appel — « Cartographie ouverte Twin6 » CREDITS path.
    // Twin6 is OPEN SOURCE: the prompt is PUBLIC, so there is no template to
    // render server-side, no confidential fiche to inject, and NO LeakFilter.
    // The client (engine executerTwin6 with a proxy provider) sends a fully
    // built prompt; we call Anthropic with the PLATFORM key and bill the
    // prepaid balance at the Twin6 contribution (+10 %). Own-key Twin6 does NOT
    // come here — it runs client-side with the user's own key (free).
    // Response matches the engine proxy-provider contract {text, usage, model,
    // stopReason} (providers/index.js).
    // ------------------------------------------------------------------
    $app->post('/twin6/appel', $wrap(function (Request $request, Response $response) use ($json, $parseBody, $sessionUserId, $twin6MaxPayloadBytes): Response {
        $userId = $sessionUserId();
        if ($userId === null) {
            return $json($response, ['error' => 'Authentification requise'], 401);
        }
        $apiKey = Env::get('ANTHROPIC_API_KEY');
        if ($apiKey === '') {
            return $json($response, ['error' => 'Service indisponible'], 503);
        }

        $raw = (string) $request->getBody();
        if (\strlen($raw) > $twin6MaxPayloadBytes) {
            return $json($response, ['error' => 'Requête trop volumineuse (2 Mo maximum)'], 413);
        }
        $body = $parseBody($request);
        if (!\is_array($body)) {
            return $json($response, ['error' => 'Corps JSON invalide : objet attendu'], 400);
        }

        $config = new Twin9Config(new SettingsRepository(Db::get()));
        $modele = \is_string($body['model'] ?? null) ? $body['model'] : '';
        if (($config->modeles()[$modele] ?? null) === null) {
            return $json($response, ['error' => 'Modèle non proposé'], 422);
        }
        $prompt = \is_string($body['prompt'] ?? null) ? $body['prompt'] : '';
        if (trim($prompt) === '') {
            return $json($response, ['error' => 'Champ requis : prompt'], 422);
        }
        $system = \is_string($body['system'] ?? null) ? $body['system'] : null;
        $maxTokens = $body['max_tokens'] ?? $body['maxTokens'] ?? 8192;
        if (!\is_int($maxTokens)) {
            return $json($response, ['error' => 'Champ max_tokens invalide : entier attendu'], 422);
        }
        $maxTokens = max(256, min(16000, $maxTokens));

        // Worst-case reservation at the TWIN6 margin (+10 %), atomic (no
        // overdraft), reconciled to the real cost after (security finding A),
        // priced with the 'twin6' protocole.
        $credits = new CreditService(Db::get());
        $promptBytes = \strlen($prompt) + ($system !== null ? \strlen($system) : 0);
        $reserve = max(1, (int) $config->reserveMicrousd($modele, $promptBytes, $maxTokens, 'twin6'));
        try {
            $credits->debit($userId, $reserve, 'twin6/cartographie (réserve)', $modele);
        } catch (SoldeInsuffisantException $e) {
            return $json($response, [
                'error' => 'Solde insuffisant',
                'solde_microusd' => $e->getBalanceMicrousd(),
                'requis_estime_microusd' => $reserve,
            ], 402);
        }

        try {
            $result = (new AnthropicCaller(LlmRuntime::httpClient(), $apiKey))
                ->appeler($modele, $system, $prompt, $maxTokens);
        } catch (\Throwable $e) {
            $credits->adjust($userId, $reserve, 'twin6/cartographie (remboursement échec)', $modele);
            throw $e;
        }

        $cout = (int) $config->coutMicrousd($modele, $result['tokens_in'], $result['tokens_out'], 'twin6');
        $delta = $reserve - $cout;
        if ($delta !== 0) {
            $credits->adjust($userId, $delta, 'twin6/cartographie (réconciliation)', $modele, $result['tokens_in'], $result['tokens_out']);
        }

        // Engine proxy-provider contract. No leak filter: nothing is secret.
        return $json($response, [
            'text' => $result['texte'],
            'usage' => ['inputTokens' => $result['tokens_in'], 'outputTokens' => $result['tokens_out']],
            'model' => $modele,
            'stopReason' => $result['stop_reason'],
            'cout_microusd' => $cout,
        ]);
    }));

    // ------------------------------------------------------------------
    // GET /api/twin9/meta — what the credit page and the open cartography
    // (Twin6) read: the Twin6 offer (margined prices), the packs, whether
    // PayPal is configured, the referential's structure, the own balance and
    // whether a private key is stored. NEVER content. Since T11 it no longer
    // lists the steps, the Twin9 offer or the pipeline's settings, which only
    // the browser's engine read; since 2026-10-20, nor the promotion's state,
    // which no view read (the configuration page has it, ProfilPolicy).
    // ------------------------------------------------------------------
    $app->get('/twin9/meta', $wrap(function (Request $request, Response $response) use ($json, $sessionUserId): Response {
        $userId = $sessionUserId();
        if ($userId === null) {
            return $json($response, ['error' => 'Authentification requise'], 401);
        }

        $config = new Twin9Config(new SettingsRepository(Db::get()));
        $view = $config->publicView();

        $masterKey = KeyVault::masterKeyFromEnv();
        $clePrivee = $masterKey !== null
            && (new KeyVault(Db::get(), $masterKey))->reveal($userId, 'anthropic') !== null;

        return $json($response, [
            'modeles_twin6' => $view['modeles_twin6'],
            'packs' => $view['packs'],
            // The referential's non-secret structure (codes and names, accented
            // pole names), which the open cartography assembles RESPIRE's
            // documents with while it is the chosen version's (2026-10-20).
            'referentiel' => $config->referentiel(),
            'paypalConfigured' => $view['paypalConfigured'],
            'solde_microusd' => (new CreditService(Db::get()))->balance($userId),
            'cle_privee_disponible' => $clePrivee,
        ]);
    }));

    // ------------------------------------------------------------------
    // GET /api/twin9/credit — own balance + last 50 ledger events
    // (counters only: kind, amounts, tokens, labels — cahier §6.5).
    // ------------------------------------------------------------------
    $app->get('/twin9/credit', $wrap(function (Request $request, Response $response) use ($json, $sessionUserId): Response {
        $userId = $sessionUserId();
        if ($userId === null) {
            return $json($response, ['error' => 'Authentification requise'], 401);
        }
        $credits = new CreditService(Db::get());

        return $json($response, [
            'solde_microusd' => $credits->balance($userId),
            'evenements' => array_map(static fn (array $event): array => [
                'kind' => $event['kind'],
                'montant_microusd' => $event['amount_microusd'],
                'label' => $event['label'],
                'model' => $event['model'],
                'tokens_in' => $event['tokens_in'],
                'tokens_out' => $event['tokens_out'],
                'date' => $event['created_at'],
            ], $credits->events($userId, 50)),
        ]);
    }));

    // ------------------------------------------------------------------
    // GET /api/twin9/facture?annee=&mois= — monthly recap invoice of the
    // prepaid usage (owner request: individuals AND établissement accounts,
    // same ledger). Deterministic aggregation, stable number — the front
    // renders it as a printable document. Own account only.
    // ------------------------------------------------------------------
    $app->get('/twin9/facture', $wrap(function (Request $request, Response $response) use ($json, $sessionUserId): Response {
        $userId = $sessionUserId();
        if ($userId === null) {
            return $json($response, ['error' => 'Authentification requise'], 401);
        }
        $query = $request->getQueryParams();
        $annee = (int) ($query['annee'] ?? 0);
        $mois = (int) ($query['mois'] ?? 0);
        if ($annee < 2026 || $annee > 2100 || $mois < 1 || $mois > 12) {
            return $json($response, ['error' => 'Période invalide (annee, mois requis)'], 422);
        }

        return $json($response, (new FactureService(Db::get()))->facture($userId, $annee, $mois));
    }));

    // ------------------------------------------------------------------
    // GET /api/twin9/depenses — spend tracking per month (12 last), the data
    // behind the quota/spend dashboard. Own account only.
    // ------------------------------------------------------------------
    $app->get('/twin9/depenses', $wrap(function (Request $request, Response $response) use ($json, $sessionUserId): Response {
        $userId = $sessionUserId();
        if ($userId === null) {
            return $json($response, ['error' => 'Authentification requise'], 401);
        }
        $credits = new CreditService(Db::get());

        return $json($response, [
            'solde_microusd' => $credits->balance($userId),
            'mois' => (new FactureService(Db::get()))->depensesParMois($userId),
        ]);
    }));

    // ------------------------------------------------------------------
    // GET /api/twin9/admin/comptes — admin oversight: balances and lifetime
    // totals of every account with ledger activity (support + établissements).
    // ------------------------------------------------------------------
    $app->get('/twin9/admin/comptes', $wrap(function (Request $request, Response $response) use ($json): Response {
        return $json($response, ['comptes' => (new FactureService(Db::get()))->comptes()]);
    }))->add($admin);

    // ------------------------------------------------------------------
    // POST /api/twin9/credit/paypal/creer {pack_index} — create the PayPal
    // order for one pack. NO intermediate state stored: the capture creates
    // the (idempotent) ledger event, an abandoned order simply expires at
    // PayPal's.
    // ------------------------------------------------------------------
    $app->post('/twin9/credit/paypal/creer', $wrap(function (Request $request, Response $response) use ($json, $parseBody, $sessionUserId, $paypalReturnUrl, $paypalCancelUrl): Response {
        $userId = $sessionUserId();
        if ($userId === null) {
            return $json($response, ['error' => 'Authentification requise'], 401);
        }
        // Rate limit (2026-07-15 review, finding LOW): each call spends the
        // platform's live PayPal credentials — cap the loop.
        $rl = new RateLimiter(Db::get(), PAYPAL_PAR_MINUTE, 60);
        if ($rl->hit('twin9:paypal:creer:' . $userId) > PAYPAL_PAR_MINUTE) {
            return $json($response, ['error' => 'Trop de tentatives, réessayez plus tard.'], 429)
                ->withHeader('Retry-After', (string) $rl->retryAfter(PAYPAL_PAR_MINUTE + 1));
        }
        $paypal = PayPalClient::fromEnv(LlmRuntime::httpClient());
        if ($paypal === null) {
            return $json($response, ['error' => 'Recharge PayPal non configurée'], 503);
        }

        $body = $parseBody($request);
        $packIndex = \is_array($body) && \is_int($body['pack_index'] ?? null) ? $body['pack_index'] : -1;
        $packs = (new Twin9Config(new SettingsRepository(Db::get())))->packs();
        $pack = $packs[$packIndex] ?? null;
        if ($packIndex < 0 || $pack === null) {
            return $json($response, ['error' => 'Pack inconnu'], 422);
        }

        $order = $paypal->createOrder(
            (float) $pack['montant_usd'],
            $paypalReturnUrl,
            $paypalCancelUrl,
        );
        // Bind the order to its creator so /capturer can refuse anyone else
        // (2026-07-15 review, finding MEDIUM — credit misattribution).
        if (\is_array($order) && \is_string($order['order_id'] ?? null) && $order['order_id'] !== '') {
            (new CreditService(Db::get()))->recordPaypalOrder($userId, $order['order_id']);
        }

        return $json($response, $order);
    }));

    // ------------------------------------------------------------------
    // POST /api/twin9/credit/paypal/capturer {order_id} — capture after the
    // redirect back, then credit the CAPTURED amount (PayPal's figure ×1e6
    // micro-USD, never a client-provided one). Idempotent by order id.
    // ------------------------------------------------------------------
    $app->post('/twin9/credit/paypal/capturer', $wrap(function (Request $request, Response $response) use ($json, $parseBody, $sessionUserId): Response {
        $userId = $sessionUserId();
        if ($userId === null) {
            return $json($response, ['error' => 'Authentification requise'], 401);
        }
        $rl = new RateLimiter(Db::get(), PAYPAL_PAR_MINUTE, 60);
        if ($rl->hit('twin9:paypal:capturer:' . $userId) > PAYPAL_PAR_MINUTE) {
            return $json($response, ['error' => 'Trop de tentatives, réessayez plus tard.'], 429)
                ->withHeader('Retry-After', (string) $rl->retryAfter(PAYPAL_PAR_MINUTE + 1));
        }
        $paypal = PayPalClient::fromEnv(LlmRuntime::httpClient());
        if ($paypal === null) {
            return $json($response, ['error' => 'Recharge PayPal non configurée'], 503);
        }

        $body = $parseBody($request);
        $orderId = \is_array($body) && \is_string($body['order_id'] ?? null) ? $body['order_id'] : '';
        if (preg_match('/^[A-Za-z0-9_-]{1,64}$/', $orderId) !== 1) {
            return $json($response, ['error' => 'Champ requis : order_id'], 422);
        }

        // Ownership (2026-07-15 review, finding MEDIUM): only the account that
        // created the order (recorded at /creer) may capture it — a client can
        // otherwise credit itself with someone else's approved order_id. A
        // legitimate flow always recorded the order before the PayPal redirect,
        // so an order absent from the binding table is refused too.
        $credits = new CreditService(Db::get());
        if ($credits->paypalOrderOwner($orderId) !== $userId) {
            return $json($response, ['error' => 'Cet ordre de paiement ne vous appartient pas.'], 403);
        }

        $capture = $paypal->captureOrder($orderId); // 422 FR si non approuvé
        if ($capture['status'] !== 'COMPLETED') {
            return $json($response, ['error' => 'Paiement non finalisé côté PayPal, réessayez.'], 422);
        }
        $microusd = (int) round(((float) $capture['montant_usd']) * 1_000_000);
        if ($microusd <= 0) {
            return $json($response, ['error' => 'Montant PayPal invalide'], 502);
        }

        $result = $credits->topup($userId, $microusd, $orderId, 'Recharge PayPal');
        // Record the CAPTURE (id + amount) so this top-up can be refunded on
        // request later (a refund goes against a capture, not an order). Idempotent.
        $credits->recordCapture($userId, (string) ($capture['capture_id'] ?? ''), $orderId, $microusd);

        return $json($response, ['solde_microusd' => $result['balance']]);
    }));

    // ------------------------------------------------------------------
    // POST /api/twin9/credit/rembourser {montant_microusd?} — refund unused
    // balance ON REQUEST (never automatic: by default users keep their balance
    // for next time). Refunds against the user's own captures, most recent
    // first, in whole cents (µUSD dust below one cent stays as balance), each
    // capped at its remaining room. Idempotent per portion (PayPal-Request-Id).
    // ------------------------------------------------------------------
    $app->post('/twin9/credit/rembourser', $wrap(function (Request $request, Response $response) use ($json, $parseBody, $sessionUserId): Response {
        $userId = $sessionUserId();
        if ($userId === null) {
            return $json($response, ['error' => 'Authentification requise'], 401);
        }
        $rl = new RateLimiter(Db::get(), PAYPAL_PAR_MINUTE, 60);
        if ($rl->hit('twin9:rembourser:' . $userId) > PAYPAL_PAR_MINUTE) {
            return $json($response, ['error' => 'Trop de tentatives, réessayez plus tard.'], 429)
                ->withHeader('Retry-After', (string) $rl->retryAfter(PAYPAL_PAR_MINUTE + 1));
        }
        $paypal = PayPalClient::fromEnv(LlmRuntime::httpClient());
        if ($paypal === null) {
            return $json($response, ['error' => 'Remboursement PayPal non configuré'], 503);
        }

        $credits = new CreditService(Db::get());
        $remboursable = $credits->soldeRemboursable($userId);
        if ($remboursable <= 0) {
            return $json($response, ['error' => 'Aucun solde remboursable pour le moment.'], 422);
        }
        $body = $parseBody($request);
        $demande = \is_array($body) && \is_int($body['montant_microusd'] ?? null)
            ? $body['montant_microusd']
            : $remboursable;
        $aRembourser = max(1, min($demande, $remboursable));

        $totalRembourse = 0;
        $reste = $aRembourser;
        foreach ($credits->refundableCaptures($userId) as $c) {
            if ($reste <= 0) {
                break;
            }
            // Whole cents only (PayPal refunds in 2-decimal USD); sub-cent dust stays.
            $partCents = intdiv(min($c['room_microusd'], $reste), 10_000);
            if ($partCents <= 0) {
                continue;
            }
            $partMicrousd = $partCents * 10_000;
            $usd = number_format($partCents / 100, 2, '.', '');
            // Idempotency key unique per refunded portion (offset = amount already
            // refunded from this capture): a retry of a failed portion replays the
            // SAME id (PayPal moves money once); the next portion gets a new id.
            $requestId = 'rf-' . $userId . '-' . $c['capture_id'] . '-' . $c['rembourse_microusd'];
            $refund = $paypal->refundCapture($c['capture_id'], $usd, $requestId);
            if (!\in_array($refund['status'] ?? '', ['COMPLETED', 'PENDING'], true)) {
                return $json($response, [
                    'error' => 'Le remboursement PayPal n’a pas abouti, réessayez plus tard.',
                    'rembourse_microusd' => $totalRembourse,
                ], 502);
            }
            $credits->appliquerRemboursement($userId, $c['capture_id'], $partMicrousd);
            $totalRembourse += $partMicrousd;
            $reste -= $partMicrousd;
        }

        return $json($response, [
            'rembourse_microusd' => $totalRembourse,
            'solde_microusd' => $credits->balance($userId),
        ]);
    }));

    // ==================================================================
    // 5. Import — deploy script only (X-Migrate-Token, pattern
    //    /api/admin/import-prompt-package in routes/packages.php)
    // ==================================================================

    // POST /api/admin/twin9/import {files: {name: content}, referentiel?: [...]}
    // -> writes each template into the v9.8's set in twin9_protocole
    // (archiving versions); a complete import — every template the contract
    // of the variables names — replaces the set: a template it does not carry
    // leaves it, archived (the pole files left it so in T16), whereas a
    // partial one takes nothing away (a set of before T16 keeps its pole
    // files, which tell it). Names compare as the table does, case aside.
    // Until 2026-10-20 it also stored the protocol settings (`config`), flipped
    // an `enabled` switch and kept the fiches (`fiches`, setting twin9_fiches):
    // all three served the browser's engine (T11), and no run reads them —
    // the runs take their settings from their profile (T12) and their fiches
    // from the referential in the base (T16). Such fields are now ignored.
    $app->post('/admin/twin9/import', function (Request $request, Response $response) use ($json): Response {
        $token = Env::get('MIGRATE_TOKEN');
        if ($token === '') {
            // Endpoint does not exist unless explicitly configured (ADR-008).
            return $json($response, ['error' => 'Not found'], 404);
        }
        $given = $request->getHeaderLine('X-Migrate-Token');
        if ($given === '' || !hash_equals($token, $given)) {
            return $json($response, ['error' => 'Forbidden'], 403);
        }
        if (!Db::isConfigured()) {
            return $json($response, ['error' => 'Database not configured'], 503);
        }

        $body = json_decode((string) $request->getBody(), true);
        $files = \is_array($body) && \is_array($body['files'] ?? null) ? $body['files'] : null;
        if ($files === null || $files === []) {
            return $json($response, ['error' => 'Body must contain a non-empty files map'], 400);
        }

        try {
            $repo = new ProtocoleRepository(Db::get());
            // read before anything is written: without it, nothing is
            $nommes = array_change_key_case(TemplateSets::contrat());
            $imported = 0;
            foreach ($files as $name => $content) {
                if (!\is_string($name) || !\is_string($content)) {
                    throw new Twin9Exception('Fichier invalide : ' . (string) $name, 422);
                }
                $repo->put($name, $content, null);
                ++$imported;
            }
            $retires = 0;
            $portes = array_fill_keys(array_map(static fn (int|string $n): string => strtolower((string) $n),
                array_keys($files)), true);
            if (array_diff_key($nommes, $portes) === []) {
                foreach (array_column($repo->list(), 'name') as $name) {
                    if (!isset($portes[strtolower((string) $name)])) {
                        $retires += $repo->retirer((string) $name) ? 1 : 0;
                    }
                }
            }

            // The non-secret referentiel structure (pole/competence names) that
            // /meta serves the open cartography (Twin6) — stored apart from the
            // validated admin config.
            if (\is_array($body['referentiel'] ?? null)) {
                (new Twin9Config(new SettingsRepository(Db::get())))->setReferentiel($body['referentiel']);
            }
        } catch (Twin9Exception $e) {
            return $json($response, ['error' => $e->getMessage()], $e->getStatusCode());
        } catch (\Throwable $e) {
            error_log('[twin9-import] ' . $e->getMessage());

            return $json($response, ['error' => 'Import failed, see server log'], 500);
        }

        return $json($response, ['imported' => $imported, 'retires' => $retires]);
    });
};
