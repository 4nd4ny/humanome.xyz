<?php

declare(strict_types=1);

/**
 * Worker routes (P11, ADR-005, docs/plan-masse.md §7):
 *
 * - /api/worker/*: the MACHINE runner of an establishment (Node CLI on their
 *   own hardware, targeting their own LLM). Bearer auth via X-Worker-Token
 *   (etablissement_config.worker_token_hash, sha256). No session, therefore
 *   naturally outside the CSRF double-submit (no ambient credentials).
 *   The runner only ever sees ITS establishment's jobs.
 * - POST /api/admin/worker-tick: one bounded PHP tick on demand — external
 *   trigger without SSH. Its own token, WORKER_TICK_TOKEN (X-Worker-Tick-Token),
 *   opens no other route: the trigger never holds the migration token, which
 *   also grants roles and imports templates (ADR-011 §2). X-Migrate-Token
 *   still opens it (ADR-008 trust model). After its slice, once a UTC day,
 *   it reads Anthropic's prices into the grid (Twin9\TarifsAnthropic) where
 *   the platform's key is set: the trigger's minute brings the daily update
 *   (2026-10-21), with no gesture of its own. Then, on the 1st of a month, it
 *   lifts a batch of the sign-ups' waiting list (sprint 7, Auth\Waitlist).
 *
 * Logging: counters only, never portfolio or document content (§6.5).
 */

use Humanome\Auth\Waitlist;
use Humanome\Db;
use Humanome\Env;
use Humanome\Etablissement\CohorteRepository;
use Humanome\Etablissement\ConfigRepository;
use Humanome\Keys\KeyVault;
use Humanome\Referentiel\Conformite;
use Humanome\Referentiel\ReferentielRepository;
use Humanome\Packages\SettingsRepository;
use Humanome\Twin9\TarifsAnthropic;
use Humanome\Twin9\Twin9Config;
use Humanome\Validation;
use Humanome\Worker\JobQueue;
use Humanome\Worker\Tick;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;

return function (App $app): void {
    $maxDeclaredCostUsd = 1000.0; // sanity bound on one declared job cost

    $json = function (Response $response, mixed $payload, int $status = 200): Response {
        $response->getBody()->write(json_encode(
            $payload,
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES,
        ));

        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withStatus($status);
    };

    $wrap = function (callable $handler) use ($json): callable {
        return function (Request $request, Response $response, array $args) use ($handler, $json): Response {
            if (!Db::isConfigured()) {
                return $json($response, ['error' => 'Service indisponible'], 503);
            }
            try {
                return $handler($request, $response, $args);
            } catch (PDOException $e) {
                error_log('[worker] ' . $e->getMessage());

                return $json($response, ['error' => 'Erreur interne'], 500);
            }
        };
    };

    /** Establishment id for the X-Worker-Token header, or null (-> 401). */
    $authenticate = static function (Request $request): ?int {
        $token = $request->getHeaderLine('X-Worker-Token');
        if ($token === '') {
            return null;
        }

        return (new ConfigRepository(Db::get()))->etablissementIdForWorkerToken($token);
    };

    // ------------------------------------------------------------------
    // GET /api/worker/jobs?limit=n — reserve workable jobs (lease 5 min).
    // Includes everything the runner needs: day text, checkpoint, frozen
    // package/referentiel versions (fetched via the public endpoints).
    // Refuses when the budget cap is already consumed (plan-masse §4).
    // ------------------------------------------------------------------
    $app->get('/worker/jobs', $wrap(function (Request $request, Response $response) use ($json, $authenticate): Response {
        $etablissementId = $authenticate($request);
        if ($etablissementId === null) {
            return $json($response, ['error' => 'Jeton worker invalide'], 401);
        }

        $configs = new ConfigRepository(Db::get(), KeyVault::masterKeyFromEnv());
        $queue = new JobQueue(Db::get());
        if (!$configs->allowsSpending($etablissementId, 0.0)) {
            $queue->markBudgetExceeded($etablissementId);

            return $json($response, ['jobs' => [], 'budget' => 'exceeded']);
        }

        $limit = (int) ($request->getQueryParams()['limit'] ?? 1);
        $cohortes = new CohorteRepository(Db::get());
        $config = $configs->find($etablissementId);

        // The runner executes the ENGINE extraction on its own machine: it
        // needs the FULL referentiel document (poles + competences), not the
        // frozen version ids alone (docs/runner-node.md contract). The batch
        // shares one document at response level (the common case: one frozen
        // version per establishment); a job frozen on ANOTHER version carries
        // its own full document. Version metadata stays in referentielVersion.
        $referentiels = new ReferentielRepository(Db::get());
        $fullByVersion = [];
        $resolveReferentiel = static function (string $id, string $semver) use ($referentiels, &$fullByVersion): ?array {
            $key = $id . '@' . $semver;
            if (!\array_key_exists($key, $fullByVersion)) {
                $row = $referentiels->findPublished($id, $semver);
                $fullByVersion[$key] = \is_array($row['content'] ?? null) ? $row['content'] : null;
            }

            return $fullByVersion[$key];
        };

        // LLM config carried by the job (runner resolveProviderConfig): the
        // establishment's own endpoint travels (WITHOUT its key — the runner
        // takes the key from its CLI/env); 'humanome' travels as such so the
        // runner can explain why the platform key never leaves the server.
        $providerInfo = ['provider' => $config === null ? 'humanome' : (string) $config['provider']];
        if ($providerInfo['provider'] === 'endpoint') {
            $providerInfo['endpointUrl'] = (string) ($config['endpoint_url'] ?? '');
            if ($config !== null && $config['model'] !== null && (string) $config['model'] !== '') {
                $providerInfo['model'] = (string) $config['model'];
            }
        }

        $jobs = [];
        $shared = null;
        $sharedKey = null;
        foreach ($queue->reserve($limit, $etablissementId) as $row) {
            $jobId = (int) $row['id'];
            if ($row['portfolio_id'] === null) {
                $queue->failHard($jobId, 'portfolio retiré (consentement révoqué)');
                continue;
            }
            $dayText = $cohortes->segmentText((int) $row['portfolio_id'], (string) $row['day_date']);
            if ($dayText === null || trim($dayText) === '') {
                $queue->failHard($jobId, sprintf('segment du %s introuvable dans le portfolio déposé', $row['day_date']));
                continue;
            }
            $versionKey = $row['referentiel_id'] . '@' . $row['referentiel_semver'];
            $full = $resolveReferentiel((string) $row['referentiel_id'], (string) $row['referentiel_semver']);
            if ($full === null) {
                $queue->failHard($jobId, sprintf('référentiel %s indisponible (version figée non publiée)', $versionKey));
                continue;
            }
            if ($sharedKey === null) {
                $sharedKey = $versionKey;
                $shared = $full;
            }
            $job = [
                'id' => $jobId,
                'runId' => (int) $row['run_id'],
                'cohorteId' => (int) $row['cohorte_id'],
                'userId' => (int) $row['user_id'],
                'date' => (string) $row['day_date'],
                'dayText' => $dayText,
                'checkpoint' => \is_string($row['checkpoint'] ?? null) ? json_decode((string) $row['checkpoint'], true) : null,
                'promptPackage' => ['id' => (string) $row['prompt_package_slug'], 'version' => (string) $row['prompt_package_semver']],
                'referentielVersion' => ['id' => (string) $row['referentiel_id'], 'version' => (string) $row['referentiel_semver']],
                'provider' => $providerInfo,
                'model' => $config === null || $config['model'] === null ? null : (string) $config['model'],
                'leaseSeconds' => JobQueue::LEASE_SECONDS,
            ];
            if ($versionKey !== $sharedKey) {
                $job['referentiel'] = $full; // full document for the odd version out
            }
            $jobs[] = $job;
        }

        $payload = ['jobs' => $jobs];
        if ($jobs !== [] && $shared !== null) {
            $payload['referentiel'] = $shared;
        }

        return $json($response, $payload);
    }));

    // ------------------------------------------------------------------
    // POST /api/worker/jobs/{id}/checkpoint {checkpoint} — persists the
    // runner's per-pole progress AND renews the lease (plan-masse §3).
    // ------------------------------------------------------------------
    $app->post('/worker/jobs/{id:[0-9]+}/checkpoint', $wrap(function (Request $request, Response $response, array $args) use ($json, $authenticate): Response {
        $etablissementId = $authenticate($request);
        if ($etablissementId === null) {
            return $json($response, ['error' => 'Jeton worker invalide'], 401);
        }

        $queue = new JobQueue(Db::get());
        $job = $queue->jobRow((int) $args['id']);
        if ($job === null || (int) $job['etablissement_id'] !== $etablissementId) {
            return $json($response, ['error' => 'Job introuvable'], 404);
        }

        $data = (array) ($request->getParsedBody() ?? []);
        $checkpoint = $data['checkpoint'] ?? null;
        if (!\is_array($checkpoint) || array_is_list($checkpoint)
            || \strlen(json_encode($checkpoint, JSON_UNESCAPED_UNICODE) ?: '') > 2 * 1024 * 1024) {
            return $json($response, ['error' => 'checkpoint requis (objet JSON, 2 Mo maximum)'], 422);
        }

        if (!$queue->saveCheckpoint((int) $job['id'], $checkpoint, 0, 0, 0.0)) {
            // Not running anymore: cancelled, or lease reclaimed elsewhere.
            return $json($response, ['error' => 'Job plus en cours (annulé ou bail repris)'], 409);
        }

        return $json($response, ['id' => (int) $job['id'], 'leaseSeconds' => JobQueue::LEASE_SECONDS]);
    }));

    // ------------------------------------------------------------------
    // POST /api/worker/jobs/{id}/result {document | erreur, tokens?, coutUsd?}
    // The document is re-validated SERVER-SIDE (Validation.php), then checked
    // against the referential version its run froze (Conformite: its poles,
    // each once, its codes, its name); the declared cost is bounded and
    // increments the establishment's own spent_usd.
    // ------------------------------------------------------------------
    $app->post('/worker/jobs/{id:[0-9]+}/result', $wrap(function (Request $request, Response $response, array $args) use ($json, $authenticate, $maxDeclaredCostUsd): Response {
        $etablissementId = $authenticate($request);
        if ($etablissementId === null) {
            return $json($response, ['error' => 'Jeton worker invalide'], 401);
        }

        $queue = new JobQueue(Db::get());
        $job = $queue->jobRow((int) $args['id']);
        if ($job === null || (int) $job['etablissement_id'] !== $etablissementId) {
            return $json($response, ['error' => 'Job introuvable'], 404);
        }

        $data = (array) ($request->getParsedBody() ?? []);
        $tokens = \is_array($data['tokens'] ?? null) ? $data['tokens'] : [];
        $tokensIn = max(0, (int) ($tokens['input'] ?? 0));
        $tokensOut = max(0, (int) ($tokens['output'] ?? 0));
        $cost = $data['coutUsd'] ?? 0;
        $cost = \is_int($cost) || \is_float($cost) ? min($maxDeclaredCostUsd, max(0.0, (float) $cost)) : 0.0;

        $document = $data['document'] ?? null;
        $erreur = $data['erreur'] ?? null;
        if (($document === null) === ($erreur === null)) {
            return $json($response, ['error' => 'Fournir soit document, soit erreur'], 422);
        }

        if ($erreur !== null) {
            if (!\is_string($erreur) || trim($erreur) === '') {
                return $json($response, ['error' => 'erreur doit être une chaîne non vide'], 422);
            }
            $queue->fail((int) $job['id'], 'runner : ' . trim($erreur));
            (new ConfigRepository(Db::get()))->addSpentUsd($etablissementId, $cost);

            return $json($response, ['id' => (int) $job['id'], 'status' => 'recorded']);
        }

        if (!\is_array($document) || array_is_list($document)) {
            return $json($response, ['error' => 'document doit être un objet JSON cartographie-jour'], 422);
        }
        if (($document['date'] ?? null) !== (string) $job['day_date']) {
            return $json($response, ['error' => sprintf('document.date doit valoir %s', $job['day_date'])], 422);
        }
        $result = Validation::validate('cartographie-jour', $document);
        if (!$result['valid']) {
            return $json($response, [
                'error' => 'Document invalide au schéma cartographie-jour',
                'details' => \array_slice($result['errors'], 0, 5, true),
            ], 422);
        }
        // the document conforms to its run's referential version: naming another
        // (T17), losing one of its poles or a code it does not know is refused
        $referentiel = (new ReferentielRepository(Db::get()))
            ->findPublished((string) $job['referentiel_id'], (string) $job['referentiel_semver']);
        if (!\is_array($referentiel['content'] ?? null)) {
            return $json($response, ['error' => sprintf('Référentiel %s@%s du run indisponible',
                $job['referentiel_id'], $job['referentiel_semver'])], 422);
        }
        $conformite = Conformite::verifier('cartographie-jour', $document, $referentiel['content']);
        if (!$conformite['valid']) {
            return $json($response, [
                'error' => 'Document non conforme au référentiel de son run',
                'details' => \array_slice($conformite['errors'], 0, 5, true),
            ], 422);
        }

        $completed = $queue->complete((int) $job['id'], $document, $tokensIn, $tokensOut, $cost);
        if (!$completed) {
            // cancelled/reclaimed since reservation: no double accounting.
            return $json($response, ['error' => 'Job plus en cours (annulé ou bail repris)'], 409);
        }
        (new ConfigRepository(Db::get()))->addSpentUsd($etablissementId, $cost);

        return $json($response, ['id' => (int) $job['id'], 'status' => 'done']);
    }));

    // ------------------------------------------------------------------
    // POST /api/admin/worker-tick — one bounded tick, external trigger
    // without SSH: X-Worker-Tick-Token (WORKER_TICK_TOKEN, this route's
    // alone), or X-Migrate-Token (ADR-008). A trigger that hangs up does not
    // stop the slice (ignore_user_abort).
    // Body (optional): {budgetSeconds?: 1..45, maxCalls?: 1..50}.
    // ------------------------------------------------------------------
    $app->post('/admin/worker-tick', $wrap(function (Request $request, Response $response) use ($json): Response {
        $tickToken = Env::get('WORKER_TICK_TOKEN');
        $migrateToken = Env::get('MIGRATE_TOKEN');
        if ($tickToken === '' && $migrateToken === '') {
            return $json($response, ['error' => 'Not found'], 404);
        }
        $given = $request->getHeaderLine('X-Worker-Tick-Token');
        $givenMigrate = $request->getHeaderLine('X-Migrate-Token');
        $allowed = ($tickToken !== '' && $given !== '' && hash_equals($tickToken, $given))
            || ($migrateToken !== '' && $givenMigrate !== '' && hash_equals($migrateToken, $givenMigrate));
        if (!$allowed) {
            return $json($response, ['error' => 'Forbidden'], 403);
        }
        ignore_user_abort(true);
        // PHP's own limit (CPU time on Linux) must not cut a slice either.
        // Raised where there is one, never imposed where there is none (CLI):
        // it would outlive the request and end the process later.
        $limit = (int) ini_get('max_execution_time');
        if ($limit > 0) {
            @set_time_limit(max($limit, Tick::MAX_SECONDS + 15));
        }

        $data = (array) ($request->getParsedBody() ?? []);
        $options = [];
        if (\is_int($data['budgetSeconds'] ?? null)) {
            $options['budgetSeconds'] = max(1, min(45, $data['budgetSeconds']));
        }
        if (\is_int($data['maxCalls'] ?? null)) {
            $options['maxCalls'] = max(1, min(50, $data['maxCalls']));
        }

        try {
            $tick = new Tick(Db::get(), $options);
            // the slices this trigger asks: a launch is measured on the shortest one served (ProfilPolicy), never
            // failing the tick
            try {
                (new Twin9Config(new SettingsRepository(Db::get())))->noterTrancheDuDeclencheur($tick->budgetSeconds());
            } catch (\Throwable $e) {
                error_log('[worker-tick] tranche du déclencheur non notée : ' . $e::class);
            }
            $counters = $tick->run();
        } catch (\Throwable $e) {
            error_log('[worker-tick] ' . $e->getMessage());

            return $json($response, ['error' => 'Tick failed, see server log'], 500);
        }
        // Anthropic's prices, after the slice, once a UTC day, where the
        // platform's key is set — as the cron does (scripts/worker.php). Its
        // failure never fails the tick.
        $tarifs = TarifsAnthropic::releverApresTranche(Db::get());
        if ($tarifs !== null) {
            $counters['tarifs'] = $tarifs;
        }
        // The waiting list of the sign-ups, on the 1st of the month (sprint 7,
        // Auth\Waitlist): a batch, in sign-up order. Its failure never fails the tick.
        try {
            $levees = (new Waitlist(Db::get()))->liftDue();
            if ($levees > 0) {
                $counters['listeAttenteLevees'] = $levees;
            }
        } catch (\Throwable $e) {
            error_log('[worker-tick] liste d\'attente non levée : ' . $e::class);
        }
        error_log('[worker-tick] ' . json_encode($counters)); // counters only

        return $json($response, $counters);
    }));
};
