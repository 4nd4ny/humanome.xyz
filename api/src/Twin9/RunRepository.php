<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Twin9\Fournisseurs\Arret;
use PDO;
use stdClass;

/**
 * Twin9 runs on the server (ADR-011 §2, migration 025): a run keeps a copy of
 * its settings — the profile (call settings, lane, parallelism, key) and the
 * v9.8's settings the engine reads — with its portfolio, its template set and
 * its clock, frozen when it is created; its map is its owner's, its
 * portfolio's, its referential's and its template set's. Settings, portfolio,
 * templates and outputs are kept compressed (zlib).
 *
 * The tick advances the runs in progress (Worker\Twin9Slice), the oldest of
 * each map only: two runs of one map would write one memory. A run done
 * keeps its counters, its journal goes (ADR-011 §5).
 */
final class RunRepository
{
    /**
     * The settings travel as JSON, their numbers as the engine reads them:
     * 1.0 stays a float, as in Python, where it is not 1.
     */
    private const JSON = JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION;

    /** A period of the run ends: its seconds join those of the periods before (T10). */
    private const ACTIF = 'actif_s = actif_s + GREATEST(0, TIMESTAMPDIFF(SECOND, COALESCE(debut_at, created_at), NOW()))';

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * A new run, in progress.
     *
     * @param stdClass $profil the copy of its profile (twin9-profil, complete)
     * @param stdClass $moteur the v9.8's settings the engine reads: config, roster, and the options jours, rescan,
     *                         test, memoire
     * @param string $journal the portfolio's name for the map (the journal the engine reads in it)
     * @param array<string, string> $gabarits its template set, each template by name
     * @param string|null $sortie the run's output as the v9.8 sees it (the layers' ids carry a hash of it);
     *                            null: one of its own
     * @param int $reserveFusion what it keeps for its merge, in micro-USD: its days' calls never eat into it (T8)
     * @param int $engagement what its launch granted it on its owner's credit, in micro-USD: their other runs never
     *                        eat into what it may still spend of it (T8)
     * @param array<string, mixed>|null $configuration its configuration block (P0-1, RunConfiguration), kept as it
     *                                                 is, never changed; null: none (tests)
     */
    public function creer(int $userId, stdClass $profil, stdClass $moteur, string $portfolioNom, string $portfolio,
                          string $journal, array $gabarits, \DateTimeImmutable $horloge, ?string $sortie = null,
                          int $reserveFusion = 0, int $engagement = 0, ?array $configuration = null): int
    {
        $referentiel = (string) ($profil->referentiel->id ?? '');
        $jeu = (string) ($profil->gabarits ?? '');
        $this->pdo->prepare(
            'INSERT IGNORE INTO twin9_cartes (user_id, portfolio, referentiel, gabarits) VALUES (?, ?, ?, ?)'
        )->execute([$userId, $journal, $referentiel, $jeu]);
        $stmt = $this->pdo->prepare(
            'SELECT id FROM twin9_cartes WHERE user_id = ? AND portfolio = ? AND referentiel = ? AND gabarits = ?'
        );
        $stmt->execute([$userId, $journal, $referentiel, $jeu]);
        $carteId = (int) $stmt->fetchColumn();

        $this->pdo->prepare(
            'INSERT INTO twin9_runs (user_id, carte_id, reglages, portfolio, gabarits, horloge, debut_at,
                                     reserve_fusion_microusd, engagement_microusd, configuration)
             VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?)'
        )->execute([
            $userId,
            $carteId,
            self::pack(['profil' => $profil, 'moteur' => $moteur,
                        'sortie' => $sortie ?? 'twin9/runs/' . bin2hex(random_bytes(8))]),
            self::pack(['nom' => $portfolioNom, 'texte' => $portfolio]),
            self::pack((object) $gabarits),
            $horloge->format('Y-m-d H:i:s'),
            max(0, $reserveFusion),
            max(0, $engagement),
            $configuration === null ? null : self::pack($configuration),
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    /**
     * What a run launched from the platform was launched with (T9): its
     * attestation, who reads its results, when its owner agreed.
     *
     * @param array<string, mixed> $attestation its profile, template set, referential and engine
     */
    public function attester(int $id, array $attestation, string $visibilite, \DateTimeImmutable $accord): void
    {
        $this->pdo->prepare('UPDATE twin9_runs SET attestation = ?, visibilite = ?, accord_at = ? WHERE id = ?')
            ->execute([json_encode($attestation, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                       $visibilite, $accord->format('Y-m-d H:i:s'), $id]);
    }

    /**
     * The runs a slice advances, $n at most: in progress, the oldest of each
     * map only, the least recently advanced first; those of one user only
     * when the page of their run advances them (T9).
     *
     * @return list<int>
     */
    public function aAvancer(int $n, ?int $userId = null): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT r.id FROM twin9_runs r
              WHERE r.statut = "en_cours"' . ($userId === null ? '' : ' AND r.user_id = ?') . '
                AND NOT EXISTS (SELECT 1 FROM twin9_runs o
                                 WHERE o.carte_id = r.carte_id AND o.statut = "en_cours" AND o.id < r.id)
              ORDER BY r.avance_at IS NOT NULL, r.avance_at, r.id
              LIMIT ' . max(1, $n)
        );
        $stmt->execute($userId === null ? [] : [$userId]);

        return array_map(intval(...), $stmt->fetchAll(PDO::FETCH_COLUMN));
    }

    /**
     * A user's runs, newest first, as their list shows them: no portfolio, no
     * output.
     *
     * @return list<array{id: int, journal: string, statut: string, attente: string|null, visibilite: string,
     *                    profil: string|null, mode: string, created_at: string, finished_at: string|null}>
     */
    public function duProprietaire(int $userId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT r.id, c.portfolio AS journal, r.statut, r.attente, r.visibilite, r.attestation, r.reglages,
                    r.created_at, r.finished_at
               FROM twin9_runs r JOIN twin9_cartes c ON c.id = r.carte_id
              WHERE r.user_id = ? ORDER BY r.id DESC'
        );
        $stmt->execute([$userId]);
        $runs = [];
        foreach ($stmt->fetchAll() as $row) {
            $attestation = $row['attestation'] === null ? null : json_decode((string) $row['attestation'], false, 512,
                JSON_THROW_ON_ERROR);
            $runs[] = [
                'id' => (int) $row['id'],
                'journal' => (string) $row['journal'],
                'statut' => (string) $row['statut'],
                'attente' => $row['attente'] === null ? null : (string) $row['attente'],
                'visibilite' => (string) $row['visibilite'],
                'profil' => $attestation?->profil?->nom ?? null,
                'mode' => (string) self::unpack((string) $row['reglages'])->profil->mode,
                'created_at' => (string) $row['created_at'],
                'finished_at' => $row['finished_at'] === null ? null : (string) $row['finished_at'],
            ];
        }

        return $runs;
    }

    /**
     * A run as its page follows it (T9): its status and what holds it back,
     * its progress read in its journal — calls by state, days done, batches
     * at Anthropic, an earlier run of its map it waits for —, its
     * attestation, its configuration's fingerprint (P0-1: its blocks
     * themselves come with its results, the page asks this one often) and,
     * once done, its counters. No portfolio, no output.
     *
     * @return array<string, mixed>|null
     */
    public function suivi(int $id): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT r.id, r.user_id, r.carte_id, c.portfolio AS journal, r.statut, r.attente, r.visibilite,
                    r.attestation, r.configuration, r.reglages, r.compteurs, r.created_at, r.avance_at, r.finished_at,
                    r.accord_at
               FROM twin9_runs r JOIN twin9_cartes c ON c.id = r.carte_id WHERE r.id = ?'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if ($row === false) {
            return null;
        }
        $profil = self::unpack((string) $row['reglages'])->profil;

        // what its calls cost its owner (RunCosts::facture()): with the instance's key, never beyond what each held
        $stmt = $this->pdo->prepare(
            'SELECT statut, COUNT(*) AS n, SUM(COALESCE(' . RunCosts::facture('', ($profil->cle ?? 'instance') === 'instance')
                . ', 0)) AS cout FROM twin9_appels WHERE run_id = ? GROUP BY statut'
        );
        $stmt->execute([$id]);
        $appels = ['envoye' => 0, 'attente' => 0, 'repondu' => 0, 'panne' => 0];
        $depense = 0;
        foreach ($stmt->fetchAll() as $ligne) {
            $appels[(string) $ligne['statut']] = (int) $ligne['n'];
            $depense += (int) $ligne['cout'];
        }
        $stmt = $this->pdo->prepare(
            'SELECT SUM(chemin LIKE "journees/%/carto_jour.json"), SUM(chemin = "carto_evolutive.json")
               FROM twin9_resultats WHERE run_id = ?'
        );
        $stmt->execute([$id]);
        [$journees, $fusion] = $stmt->fetch(PDO::FETCH_NUM);
        $stmt = $this->pdo->prepare(
            'SELECT COUNT(*) FROM twin9_lots WHERE run_id = ? AND statut IN ("soumission", "en_cours")'
        );
        $stmt->execute([$id]);
        $lots = (int) $stmt->fetchColumn();
        $stmt = $this->pdo->prepare(
            'SELECT COUNT(*) FROM twin9_runs WHERE carte_id = ? AND statut = "en_cours" AND id < ?'
        );
        $stmt->execute([(int) $row['carte_id'], $id]);
        $avant = (int) $stmt->fetchColumn();
        $compteurs = $row['compteurs'] === null ? null : json_decode((string) $row['compteurs'], true, 512,
            JSON_THROW_ON_ERROR);
        $attente = $row['attente'] === null ? null : (string) $row['attente'];
        // what holds it back or stopped it, in words: an earlier run of its map, what the slice
        // noted (the provider's rate, a batch at Anthropic, the key, its caps), its turn not yet come; a stop's reason
        $retard = match ((string) $row['statut']) {
            'en_cours' => match (true) {
                $avant > 0 => 'Un run précédent du même portfolio doit finir d’abord',
                $attente !== null => ucfirst($attente),
                $row['avance_at'] === null => 'En attente de son premier tour',
                default => null,
            },
            'echoue' => $attente === null ? null : ucfirst($attente),
            default => null,
        };

        return [
            'id' => (int) $row['id'],
            'user_id' => (int) $row['user_id'],
            'journal' => (string) $row['journal'],
            'statut' => (string) $row['statut'],
            'attente' => $attente,
            'retard' => $retard,
            'visibilite' => (string) $row['visibilite'],
            'mode' => (string) $profil->mode,
            'voie' => (string) $profil->voie,
            'attestation' => $row['attestation'] === null ? null : json_decode((string) $row['attestation'], true,
                512, JSON_THROW_ON_ERROR),
            'configuration_empreinte' => $row['configuration'] === null ? null
                : (string) self::unpack((string) $row['configuration'])->empreinte,
            'progression' => [
                'appels' => $appels,
                'journees' => (int) $journees,
                'fusion' => (int) $fusion > 0,
                'lots' => $lots,
                'runs_avant' => $avant,
            ],
            // what it cost its owner so far (the cost of its calls, margin included with the instance's key — never
            // beyond what each held: the excess is the instance's, RunCosts::facture()), and its caps (T10); a run
            // done before the counters kept it, its real cost
            'cout' => [
                'depense_microusd' => (int) ($compteurs === null ? $depense
                    : ($compteurs['facture_microusd'] ?? $compteurs['cout_microusd'] ?? $depense)),
                'budget_usd' => $profil->budget_usd ?? null,
                'duree_minutes' => $profil->duree_minutes ?? null,
            ],
            'compteurs' => $compteurs,
            'created_at' => (string) $row['created_at'],
            'avance_at' => $row['avance_at'] === null ? null : substr((string) $row['avance_at'], 0, 19),
            'finished_at' => $row['finished_at'] === null ? null : (string) $row['finished_at'],
            'accord_at' => $row['accord_at'] === null ? null : (string) $row['accord_at'],
        ];
    }

    /**
     * Who reads a run: its owner, and the cartographes they linked when it says so.
     *
     * @return array{user_id: int, visibilite: string, statut: string, carte_id: int}|null
     */
    public function acces(int $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT user_id, visibilite, statut, carte_id FROM twin9_runs WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        return $row === false ? null : ['user_id' => (int) $row['user_id'], 'visibilite' => (string) $row['visibilite'],
                                        'statut' => (string) $row['statut'], 'carte_id' => (int) $row['carte_id']];
    }

    /**
     * Since when a run's calls are held back by a model longer than the
     * slices it gets (twin9_runs.retenu_depuis, migration 033): kept while
     * $retenu, cleared otherwise.
     *
     * @return float the seconds since, by the database's clock; 0 when not held
     */
    public function retenu(int $id, bool $retenu): float
    {
        $this->pdo->prepare('UPDATE twin9_runs SET retenu_depuis = IF(?, COALESCE(retenu_depuis, NOW(3)), NULL)
                              WHERE id = ?')->execute([$retenu ? 1 : 0, $id]);
        if (!$retenu) {
            return 0.0;
        }
        $stmt = $this->pdo->prepare('SELECT TIMESTAMPDIFF(MICROSECOND, retenu_depuis, NOW(3)) FROM twin9_runs WHERE id = ?');
        $stmt->execute([$id]);

        return max(0.0, (float) $stmt->fetchColumn() / 1_000_000);
    }

    /**
     * The runs no longer in progress (cancelled, stopped) whose calls still
     * hold a worst case outside a batch at Anthropic: cancelled between two
     * slices, or left so by a tick that died. The slice settles them
     * (RunCosts::liberer()) before any other work, under the worker's lock:
     * none of their calls is in flight then.
     *
     * @param int|null $userId those of one user only (the page of their run, T9)
     * @return list<int>
     */
    public function aSolder(int $n, ?int $userId = null): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT r.id FROM twin9_runs r
              WHERE r.statut IN ("annule", "echoue")' . ($userId === null ? '' : ' AND r.user_id = ?') . '
                AND EXISTS (SELECT 1 FROM twin9_appels a
                             WHERE a.run_id = r.id AND a.reserve_microusd IS NOT NULL
                               AND NOT (a.statut = "envoye" AND a.lot_id IS NOT NULL))
              ORDER BY r.id LIMIT ' . max(1, $n)
        );
        $stmt->execute($userId === null ? [] : [$userId]);

        return array_map(intval(...), $stmt->fetchAll(PDO::FETCH_COLUMN));
    }

    /**
     * Its owner stops a run in progress: the tick no longer advances it,
     * cancels its batches at Anthropic and collects them (Twin9Lots); what
     * its calls hold that no slice has in flight goes back at once (the
     * route: RunCosts::libererHorsVol()), its calls in flight once back, at
     * their real cost (Twin9Slice). Its journal stays, for a resumption.
     * False when it was not in progress.
     */
    public function annuler(int $id, int $userId): bool
    {
        $stmt = $this->pdo->prepare(
            'UPDATE twin9_runs SET statut = "annule", attente = NULL, retenu_depuis = NULL, finished_at = NOW(), ' . self::ACTIF . '
              WHERE id = ? AND user_id = ? AND statut = "en_cours"'
        );
        $stmt->execute([$id, $userId]);

        return $stmt->rowCount() === 1;
    }

    /**
     * Its owner resumes a run cancelled or stopped: it goes on from its
     * journal, where it stopped, its duration counted again from now (T10).
     * A run its budget stopped goes on under a new one, given here: a number
     * of dollars, or null for none. Admitted again (T8): what it may still
     * spend of its owner's credit never goes beyond what their other runs in
     * progress leave free. False when it was neither cancelled nor stopped.
     *
     * @param array{budget_usd?: float|int|null} $plafonds
     */
    public function reprendre(int $id, int $userId, array $plafonds = []): bool
    {
        return $this->sousVerrou($userId, fn (): bool => $this->reprendreAdmis($id, $userId, $plafonds));
    }

    /**
     * Its configuration stays as it was launched (P0-1); its execution block
     * keeps the resumption, when and under which budget.
     *
     * @param array{budget_usd?: float|int|null} $plafonds
     */
    private function reprendreAdmis(int $id, int $userId, array $plafonds): bool
    {
        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare('SELECT reglages, execution, NOW() AS maintenant FROM twin9_runs
                                          WHERE id = ? AND user_id = ? AND statut IN ("annule", "echoue") FOR UPDATE');
            $stmt->execute([$id, $userId]);
            $row = $stmt->fetch();
            if ($row === false) {
                $this->pdo->rollBack();

                return false;
            }
            $copie = self::unpack((string) $row['reglages']);
            $reglages = null;
            if (\array_key_exists('budget_usd', $plafonds)) {
                $reglages = $copie;
                $reglages->profil->budget_usd = $plafonds['budget_usd'];
            }
            $execution = self::executionGardee($row['execution']);
            $execution->reprises[] = ['at' => (string) $row['maintenant'], 'budget_usd' => $copie->profil->budget_usd ?? null];
            // what it has committed, and what the owner's other runs in progress leave free
            $stmt = $this->pdo->prepare(
                'SELECT COALESCE(SUM(' . RunCosts::impute() . '), 0) FROM twin9_appels WHERE run_id = ?'
            );
            $stmt->execute([$id]);
            $engage = (int) $stmt->fetchColumn();
            ['solde' => $solde, 'autres' => $autres] = $this->disponible($userId, $id);
            $this->pdo->prepare(
                'UPDATE twin9_runs SET statut = "en_cours", attente = NULL, retenu_depuis = NULL, finished_at = NULL,
                        debut_at = NOW(),
                        reglages = COALESCE(?, reglages), engagement_microusd = LEAST(engagement_microusd, ?),
                        execution = ?
                  WHERE id = ?'
            )->execute([$reglages === null ? null : self::pack($reglages), $engage + max(0, $solde - $autres),
                        json_encode($execution, self::JSON), $id]);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return true;
    }

    /** Who reads the run's results besides its owner. False when it is not theirs. */
    public function rendreVisible(int $id, int $userId, string $visibilite): bool
    {
        if (($this->acces($id)['user_id'] ?? null) !== $userId) {
            return false;
        }
        $this->pdo->prepare('UPDATE twin9_runs SET visibilite = ? WHERE id = ? AND user_id = ?')
            ->execute([$visibilite, $id, $userId]);

        return true;
    }

    /**
     * A run as the slice plays it, or null.
     *
     * @return array{id: int, user_id: int, carte_id: int, statut: string, profil: stdClass, moteur: string,
     *               sortie: string, portfolio_nom: string, portfolio: string, gabarits: array<string, string>,
     *               horloge: \DateTimeImmutable, debut: float}|null debut: when its current period began (unix time)
     */
    public function charger(int $id): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT r.*, UNIX_TIMESTAMP(COALESCE(r.debut_at, r.created_at)) AS debut FROM twin9_runs r WHERE r.id = ?'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if ($row === false) {
            return null;
        }
        $reglages = self::unpack((string) $row['reglages']);
        $portfolio = self::unpack((string) $row['portfolio']);

        return [
            'id' => (int) $row['id'],
            'user_id' => (int) $row['user_id'],
            'carte_id' => (int) $row['carte_id'],
            'statut' => (string) $row['statut'],
            'profil' => $reglages->profil,
            'moteur' => json_encode($reglages->moteur, self::JSON),
            'sortie' => (string) $reglages->sortie,
            'portfolio_nom' => (string) $portfolio->nom,
            'portfolio' => (string) $portfolio->texte,
            'gabarits' => array_map('strval', (array) self::unpack((string) $row['gabarits'])),
            'horloge' => new \DateTimeImmutable((string) $row['horloge']),
            'debut' => (float) $row['debut'],
            'reserve_fusion' => (int) $row['reserve_fusion_microusd'],
        ];
    }

    /**
     * What a slice reads of a run before playing it: its owner, its status,
     * what holds it back and its profile, without its portfolio nor its
     * templates.
     *
     * @return array{user_id: int, statut: string, attente: string|null, profil: stdClass}|null
     */
    public function tete(int $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT user_id, statut, attente, reglages FROM twin9_runs WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if ($row === false) {
            return null;
        }

        return [
            'user_id' => (int) $row['user_id'],
            'statut' => (string) $row['statut'],
            'attente' => $row['attente'] === null ? null : (string) $row['attente'],
            'profil' => self::unpack((string) $row['reglages'])->profil,
        ];
    }

    public function statut(int $id): ?string
    {
        $stmt = $this->pdo->prepare('SELECT statut FROM twin9_runs WHERE id = ?');
        $stmt->execute([$id]);
        $statut = $stmt->fetchColumn();

        return $statut === false ? null : (string) $statut;
    }

    /** The slice touched the run: when, and what holds it back, if anything. */
    public function avance(int $id, ?string $attente): void
    {
        $this->pdo->prepare('UPDATE twin9_runs SET avance_at = NOW(3), attente = ? WHERE id = ?')
            ->execute([$attente === null ? null : mb_substr($attente, 0, 255), $id]);
    }

    /**
     * The engine's passes a slice played of a run, with their time (P0-1,
     * P0-4), counted as soon as each one is played: a tick that dies — killed,
     * out of time or memory, or an exception out of the slice — loses only
     * the pass it was playing, never those before it; the run's final pass is
     * counted before terminer() freezes them.
     */
    public function compter(int $id, int $passes, int $moteurMs): void
    {
        if ($passes <= 0 && $moteurMs <= 0) {
            return;
        }
        $this->pdo->prepare('UPDATE twin9_runs SET passes = passes + ?, moteur_ms = moteur_ms + ? WHERE id = ?')
            ->execute([max(0, $passes), max(0, $moteurMs), $id]);
    }

    /** An output of the run, as the engine writes it. */
    public function ecrireSortie(int $runId, string $chemin, string $contenu): void
    {
        $this->pdo->prepare(
            'INSERT INTO twin9_resultats (run_id, chemin, contenu) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE contenu = VALUES(contenu)'
        )->execute([$runId, $chemin, self::compress($contenu)]);
    }

    /** @return array<string, string> the run's outputs, by path */
    public function sorties(int $runId): array
    {
        $stmt = $this->pdo->prepare('SELECT chemin, contenu FROM twin9_resultats WHERE run_id = ? ORDER BY chemin');
        $stmt->execute([$runId]);
        $sorties = [];
        foreach ($stmt->fetchAll() as $row) {
            $sorties[(string) $row['chemin']] = self::uncompress((string) $row['contenu']);
        }

        return $sorties;
    }

    /**
     * The run is done: its journal becomes its counters, and its evaluation,
     * without any content, joins those that foresee the next runs (T8,
     * Evaluations) — a failure to record it never keeps the run from ending;
     * its execution block is frozen (P0-1, RunExecution), its resumptions
     * kept — a failure to freeze it leaves it null, and never keeps the run
     * from ending either. False when it was no longer in progress (cancelled
     * meanwhile).
     *
     * @param array<string, int> $octets the days of its map, in order — those it took, then those its memory
     *        keeps —: each day's size in bytes, by its id
     * @param float $marge the instance's margin its costs include; 1.0 with its owner's own key
     */
    public function terminer(int $id, array $octets = [], float $marge = 1.0): bool
    {
        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare(
                'SELECT statut, user_id, reglages, gabarits, configuration, execution, passes, moteur_ms, created_at,
                        NOW() AS maintenant
                   FROM twin9_runs WHERE id = ? FOR UPDATE'
            );
            $stmt->execute([$id]);
            $run = $stmt->fetch();
            if ($run === false || $run['statut'] !== 'en_cours') {
                $this->pdo->rollBack();

                return false;
            }
            $compteurs = $this->compteurs($id);
            $this->pdo->exec('SAVEPOINT evaluation');
            try {
                $reglages = self::unpack((string) $run['reglages']);
                $referentiel = $reglages->moteur->referentiel ?? null;
                (new Evaluations($this->pdo))->consigner($id, (int) $run['user_id'], $reglages->profil,
                    Lancement::empreinte((array) self::unpack((string) $run['gabarits'])), $octets, $marge,
                    $compteurs['duree_s'], $referentiel === null ? '' : ReferentielMoteur::empreinte($referentiel));
            } catch (\Throwable $e) {
                try {
                    $this->pdo->exec('ROLLBACK TO SAVEPOINT evaluation');
                } catch (\Throwable) {
                    throw $e; // the transaction itself is lost (a deadlock): the run ends at the next slice
                }
                error_log('[twin9] évaluation du run ' . $id . ' non consignée : ' . $e::class);
            }
            // its execution, frozen before its journal goes (P0-1); unreadable, null — the class only in the log
            $execution = null;
            $this->pdo->exec('SAVEPOINT execution');
            try {
                $configuration = $run['configuration'] === null ? null : self::unpack((string) $run['configuration']);
                $execution = json_encode((new RunExecution($this->pdo))->bloc($id, 'fige', [
                    'statut' => 'termine',
                    'debut_at' => (string) $run['created_at'],
                    'fin_at' => (string) $run['maintenant'],
                    'duree_active_s' => (int) $compteurs['duree_s'],
                    // its passes, its final one included: each counted as it was played (compter())
                    'passes' => (int) $run['passes'],
                    'moteur_ms' => (int) $run['moteur_ms'],
                    'commit_debut' => $configuration?->moteur?->commit ?? null,
                    'commit_fin' => EngineLoader::commit(),
                    'partiel' => $configuration === null,
                    'reprises' => self::executionGardee($run['execution'])->reprises,
                ], $compteurs), self::JSON);
            } catch (\Throwable $e) {
                try {
                    $this->pdo->exec('ROLLBACK TO SAVEPOINT execution');
                } catch (\Throwable) {
                    throw $e; // the transaction itself is lost (a deadlock): the run ends at the next slice
                }
                $execution = null;
                error_log('[twin9] exécution du run ' . $id . ' non figée : ' . $e::class);
            }
            $this->pdo->prepare('DELETE FROM twin9_appels WHERE run_id = ?')->execute([$id]);
            // its batches deleted at Anthropic go with the journal; one still there waits for the tick
            $this->pdo->prepare('DELETE FROM twin9_lots WHERE run_id = ? AND statut = "supprime"')->execute([$id]);
            $this->pdo->prepare(
                'UPDATE twin9_runs SET statut = "termine", attente = NULL, retenu_depuis = NULL, compteurs = ?, execution = ?,
                        finished_at = ?, '
                    . self::ACTIF . ' WHERE id = ?'
            )->execute([json_encode($compteurs, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), $execution,
                        (string) $run['maintenant'], $id]);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return true;
    }

    /**
     * An owner's credit, and what their runs in progress may still spend of
     * it (T8): for each, what its launch granted it, less what it has
     * committed — the worst cases its calls hold, the real costs of those
     * settled —; the run asking left out. One statement, one snapshot: a
     * call's hold, or its settlement, moves the credit and its run's
     * commitment together.
     *
     * @return array{solde: int, autres: int} in micro-USD
     */
    public function disponible(int $userId, int $sauf = 0): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT (SELECT COALESCE(MAX(balance_microusd), 0) FROM twin9_credits WHERE user_id = ?),
                    (SELECT COALESCE(SUM(GREATEST(0, CAST(r.engagement_microusd AS SIGNED)
                              - (SELECT COALESCE(SUM(' . RunCosts::impute('a.') . '), 0)
                                   FROM twin9_appels a WHERE a.run_id = r.id))), 0)
                       FROM twin9_runs r
                      WHERE r.user_id = ? AND r.statut = "en_cours" AND r.engagement_microusd > 0 AND r.id <> ?)'
        );
        $stmt->execute([$userId, $userId, $sauf]);
        [$solde, $autres] = $stmt->fetch(PDO::FETCH_NUM);

        return ['solde' => (int) $solde, 'autres' => (int) $autres];
    }

    /**
     * $f under its owner's admission lock (T8): one launch, or resumption,
     * at a time, for the next to count what the previous was granted.
     *
     * @template T
     * @param \Closure(): T $f
     * @return T
     * @throws Twin9Exception 503 when another one keeps the lock
     */
    public function sousVerrou(int $userId, \Closure $f): mixed
    {
        $verrou = $this->pdo->quote('twin9_admission_' . $userId);
        if ((int) $this->pdo->query('SELECT GET_LOCK(' . $verrou . ', 10)')->fetchColumn() !== 1) {
            throw new Twin9Exception('Un autre lancement est en cours : réessayez dans un instant', 503);
        }
        try {
            return $f();
        } finally {
            $this->pdo->query('SELECT RELEASE_LOCK(' . $verrou . ')');
        }
    }

    /**
     * The run stops — the engine failed on it, or it reached its budget, its
     * duration or its owner's credit (T10) —, its journal kept, for a
     * resumption. False when it was no longer in progress.
     */
    public function echouer(int $id, string $raison): bool
    {
        $stmt = $this->pdo->prepare(
            'UPDATE twin9_runs SET statut = "echoue", attente = ?, retenu_depuis = NULL, finished_at = NOW(), ' . self::ACTIF . '
              WHERE id = ? AND statut = "en_cours"'
        );
        $stmt->execute([mb_substr($raison, 0, 255), $id]);

        return $stmt->rowCount() === 1;
    }

    /** @return array<string, mixed>|null the counters of a run done */
    public function compteursDe(int $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT compteurs FROM twin9_runs WHERE id = ?');
        $stmt->execute([$id]);
        $json = $stmt->fetchColumn();

        return \is_string($json) ? json_decode($json, true, 512, JSON_THROW_ON_ERROR) : null;
    }

    /**
     * A run's configuration block (P0-1, RunConfiguration), as its launch
     * wrote it, its objects objects; null for a run launched before
     * migration 031.
     */
    public function configuration(int $id): ?stdClass
    {
        $stmt = $this->pdo->prepare('SELECT configuration FROM twin9_runs WHERE id = ?');
        $stmt->execute([$id]);
        $blob = $stmt->fetchColumn();

        return \is_string($blob) ? self::unpack($blob) : null;
    }

    /**
     * A run's execution block (P0-1, RunExecution), its objects objects: as
     * frozen once it is done (null when that failed, for a run done before
     * migration 031, or one a previous release ended — rolled back to
     * (ADR-008), it leaves the column as it found it, its resumptions only:
     * figee()); otherwise from its journal, with the resumptions it keeps.
     * Null for an unknown run.
     */
    public function execution(int $id): ?stdClass
    {
        $stmt = $this->pdo->prepare(
            'SELECT statut, configuration, execution, passes, moteur_ms, created_at, finished_at,
                    actif_s + IF(statut = "en_cours",
                                 GREATEST(0, TIMESTAMPDIFF(SECOND, COALESCE(debut_at, created_at), NOW())), 0) AS actif
               FROM twin9_runs WHERE id = ?'
        );
        $stmt->execute([$id]);
        $run = $stmt->fetch();
        if ($run === false) {
            return null;
        }
        if ($run['statut'] === 'termine') {
            return self::figee($run['execution']);
        }
        $configuration = $run['configuration'] === null ? null : self::unpack((string) $run['configuration']);
        $bloc = (new RunExecution($this->pdo))->bloc($id, 'journal', [
            'statut' => (string) $run['statut'],
            'debut_at' => (string) $run['created_at'],
            'fin_at' => $run['finished_at'] === null ? null : (string) $run['finished_at'],
            'duree_active_s' => (int) $run['actif'],
            'passes' => (int) $run['passes'],
            'moteur_ms' => (int) $run['moteur_ms'],
            'commit_debut' => $configuration?->moteur?->commit ?? null,
            'commit_fin' => null,
            'partiel' => $configuration === null,
            'reprises' => self::executionGardee($run['execution'])->reprises,
        ], $this->compteurs($id));

        return json_decode(json_encode($bloc, self::JSON), false, 512, JSON_THROW_ON_ERROR);
    }

    /**
     * A run's execution column read as its frozen block (terminer()): the
     * block only when it is one — of its schema, frozen —; null otherwise,
     * the resumptions alone a previous release left there included, which
     * no reader takes for an execution (its results, the export, the
     * account's archive, which would be invalid).
     */
    private static function figee(mixed $json): ?stdClass
    {
        $bloc = $json === null ? null : json_decode((string) $json, false, 512, JSON_THROW_ON_ERROR);

        return $bloc instanceof stdClass && ($bloc->schema ?? null) === RunExecution::SCHEMA
            && ($bloc->source ?? null) === 'fige' ? $bloc : null;
    }

    /**
     * What a run's execution column holds: its frozen block, or before it
     * is done its resumptions only; nothing yet, none.
     *
     * @throws \UnexpectedValueException for anything else
     */
    private static function executionGardee(mixed $json): stdClass
    {
        $gardee = $json === null ? (object) ['reprises' => []] : json_decode((string) $json, false, 512,
            JSON_THROW_ON_ERROR);
        if (!$gardee instanceof stdClass) {
            throw new \UnexpectedValueException('Exécution du run illisible');
        }
        $gardee->reprises ??= [];
        if (!\is_array($gardee->reprises)) {
            throw new \UnexpectedValueException('Reprises du run illisibles');
        }

        return $gardee;
    }

    /**
     * The counters a run keeps of its journal: calls, attempts, failures —
     * those of an output cut, by its budget or by the model's context, also
     * counted apart (`tronques`, P0-2), each stop read in its provider's
     * table —, the cuts the slices' ends made (`coupures`), tokens, cost and
     * time, by step and by provider (P1-5), the models served and its
     * batches; the days it instructed and how long it was active. Its cost
     * is the real one (`cout_microusd`); what it cost its owner apart
     * (`facture_microusd`, RunCosts::facture(): never beyond what each call
     * held with the instance's key, the excess being the instance's).
     *
     * @return array<string, mixed>
     */
    private function compteurs(int $id): array
    {
        $stmt = $this->pdo->prepare('SELECT reglages FROM twin9_runs WHERE id = ?');
        $stmt->execute([$id]);
        $reglages = $stmt->fetchColumn();
        $credits = $reglages === false || (self::unpack((string) $reglages)->profil->cle ?? 'instance') === 'instance';
        $stmt = $this->pdo->prepare('SELECT COUNT(*) FROM twin9_lots WHERE run_id = ?');
        $stmt->execute([$id]);
        $lots = (int) $stmt->fetchColumn();
        $stmt = $this->pdo->prepare(
            'SELECT COUNT(DISTINCT SUBSTRING_INDEX(appel, "/", 2)) FROM twin9_appels
              WHERE run_id = ? AND appel LIKE "journees/%"'
        );
        $stmt->execute([$id]);
        $journees = (int) $stmt->fetchColumn();
        $stmt = $this->pdo->prepare(
            'SELECT actif_s + GREATEST(0, TIMESTAMPDIFF(SECOND, COALESCE(debut_at, created_at), NOW()))
               FROM twin9_runs WHERE id = ?'
        );
        $stmt->execute([$id]);
        $dureeS = (int) $stmt->fetchColumn();
        $stmt = $this->pdo->prepare(
            'SELECT etape, fournisseur, statut, stop_reason, COUNT(*) AS n, SUM(tentatives) AS tentatives,
                    SUM(coupures) AS coupures, SUM(jetons_entree) AS entree, SUM(jetons_sortie) AS sortie,
                    SUM(cout_microusd) AS cout, SUM(' . RunCosts::facture('', $credits) . ') AS facture,
                    SUM(duree_ms) AS duree
               FROM twin9_appels WHERE run_id = ? GROUP BY etape, fournisseur, statut, stop_reason
              ORDER BY etape, fournisseur, statut'
        );
        $stmt->execute([$id]);
        $total = ['appels' => 0, 'pannes' => 0, 'tronques' => 0, 'tentatives' => 0, 'coupures' => 0,
                  'jetons_entree' => 0, 'jetons_sortie' => 0, 'cout_microusd' => 0, 'facture_microusd' => 0,
                  'duree_ms' => 0];
        $parEtape = [];
        $parFournisseur = [];
        foreach ($stmt->fetchAll() as $row) {
            $etape = (string) $row['etape'];
            $fournisseur = (string) $row['fournisseur'];
            $n = (int) $row['n'];
            $parEtape[$etape] ??= ['appels' => 0, 'pannes' => 0, 'tronques' => 0, 'cout_microusd' => 0];
            $parFournisseur[$fournisseur] ??= ['appels' => 0, 'pannes' => 0, 'tronques' => 0, 'coupures' => 0,
                                               'cout_microusd' => 0];
            $parEtape[$etape]['appels'] += $n;
            $parEtape[$etape]['cout_microusd'] += (int) $row['cout'];
            $parFournisseur[$fournisseur]['appels'] += $n;
            $parFournisseur[$fournisseur]['coupures'] += (int) $row['coupures'];
            $parFournisseur[$fournisseur]['cout_microusd'] += (int) $row['cout'];
            $total['appels'] += $n;
            if ($row['statut'] === 'panne') {
                $parEtape[$etape]['pannes'] += $n;
                $parFournisseur[$fournisseur]['pannes'] += $n;
                $total['pannes'] += $n;
                // its stop, in its provider's table (the journal keeps each call's)
                if (Arret::tronquee($fournisseur, $row['stop_reason'] === null ? null : (string) $row['stop_reason'])) {
                    $parEtape[$etape]['tronques'] += $n;
                    $parFournisseur[$fournisseur]['tronques'] += $n;
                    $total['tronques'] += $n;
                }
            }
            $total['tentatives'] += (int) $row['tentatives'];
            $total['coupures'] += (int) $row['coupures'];
            $total['jetons_entree'] += (int) $row['entree'];
            $total['jetons_sortie'] += (int) $row['sortie'];
            $total['cout_microusd'] += (int) $row['cout'];
            $total['facture_microusd'] += (int) $row['facture'];
            $total['duree_ms'] += (int) $row['duree'];
        }
        ksort($parFournisseur, SORT_STRING);
        $stmt = $this->pdo->prepare(
            'SELECT modele_servi, COUNT(*) FROM twin9_appels WHERE run_id = ? AND modele_servi IS NOT NULL
              GROUP BY modele_servi ORDER BY modele_servi'
        );
        $stmt->execute([$id]);

        return $total + ['lots' => $lots, 'journees' => $journees, 'duree_s' => $dureeS, 'par_etape' => $parEtape,
                         'par_fournisseur' => $parFournisseur,
                         'modeles_servis' => array_map(intval(...), $stmt->fetchAll(PDO::FETCH_KEY_PAIR))];
    }

    /** The map of an owner's portfolio, referential and template set, if a run made it. */
    public function carte(int $userId, string $journal, string $referentiel, string $gabarits): ?int
    {
        $stmt = $this->pdo->prepare(
            'SELECT id FROM twin9_cartes WHERE user_id = ? AND portfolio = ? AND referentiel = ? AND gabarits = ?'
        );
        $stmt->execute([$userId, $journal, $referentiel, $gabarits]);
        $id = $stmt->fetchColumn();

        return $id === false ? null : (int) $id;
    }

    public static function compress(string $text): string
    {
        return (string) gzcompress($text, 6);
    }

    public static function uncompress(string $blob): string
    {
        $text = gzuncompress($blob);
        if ($text === false) {
            throw new \RuntimeException('Donnée compressée illisible');
        }

        return $text;
    }

    private static function pack(mixed $value): string
    {
        return self::compress(json_encode($value, self::JSON));
    }

    private static function unpack(string $blob): mixed
    {
        return json_decode(self::uncompress($blob), false, 512, JSON_THROW_ON_ERROR);
    }
}
