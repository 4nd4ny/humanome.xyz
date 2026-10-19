<?php

declare(strict_types=1);

namespace Humanome\Twin9;

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
     */
    public function creer(int $userId, stdClass $profil, stdClass $moteur, string $portfolioNom, string $portfolio,
                          string $journal, array $gabarits, \DateTimeImmutable $horloge, ?string $sortie = null): int
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
            'INSERT INTO twin9_runs (user_id, carte_id, reglages, portfolio, gabarits, horloge) VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([
            $userId,
            $carteId,
            self::pack(['profil' => $profil, 'moteur' => $moteur,
                        'sortie' => $sortie ?? 'twin9/runs/' . bin2hex(random_bytes(8))]),
            self::pack(['nom' => $portfolioNom, 'texte' => $portfolio]),
            self::pack((object) $gabarits),
            $horloge->format('Y-m-d H:i:s'),
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    /**
     * The runs a slice advances, $n at most: in progress, the oldest of each
     * map only, the least recently advanced first.
     *
     * @return list<int>
     */
    public function aAvancer(int $n): array
    {
        $stmt = $this->pdo->query(
            'SELECT r.id FROM twin9_runs r
              WHERE r.statut = "en_cours"
                AND NOT EXISTS (SELECT 1 FROM twin9_runs o
                                 WHERE o.carte_id = r.carte_id AND o.statut = "en_cours" AND o.id < r.id)
              ORDER BY r.avance_at IS NOT NULL, r.avance_at, r.id
              LIMIT ' . max(1, $n)
        );

        return array_map(intval(...), $stmt->fetchAll(PDO::FETCH_COLUMN));
    }

    /**
     * A run as the slice plays it, or null.
     *
     * @return array{id: int, user_id: int, carte_id: int, statut: string, profil: stdClass, moteur: string,
     *               sortie: string, portfolio_nom: string, portfolio: string, gabarits: array<string, string>,
     *               horloge: \DateTimeImmutable}|null
     */
    public function charger(int $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM twin9_runs WHERE id = ?');
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
     * The run is done: its journal becomes its counters. False when it was no
     * longer in progress (cancelled meanwhile).
     */
    public function terminer(int $id): bool
    {
        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare('SELECT statut FROM twin9_runs WHERE id = ? FOR UPDATE');
            $stmt->execute([$id]);
            if ($stmt->fetchColumn() !== 'en_cours') {
                $this->pdo->rollBack();

                return false;
            }
            $compteurs = $this->compteurs($id);
            $this->pdo->prepare('DELETE FROM twin9_appels WHERE run_id = ?')->execute([$id]);
            // its batches deleted at Anthropic go with the journal; one still there waits for the tick
            $this->pdo->prepare('DELETE FROM twin9_lots WHERE run_id = ? AND statut = "supprime"')->execute([$id]);
            $this->pdo->prepare(
                'UPDATE twin9_runs SET statut = "termine", attente = NULL, compteurs = ?, finished_at = NOW() WHERE id = ?'
            )->execute([json_encode($compteurs, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), $id]);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return true;
    }

    /** The engine failed on this run: it stops, its journal kept, for a resumption once mended. */
    public function echouer(int $id, string $raison): void
    {
        $this->pdo->prepare(
            'UPDATE twin9_runs SET statut = "echoue", attente = ?, finished_at = NOW() WHERE id = ? AND statut = "en_cours"'
        )->execute([mb_substr($raison, 0, 255), $id]);
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
     * The counters a run keeps of its journal: calls, attempts, failures,
     * tokens, cost and time, by step, the models served and its batches.
     *
     * @return array<string, mixed>
     */
    private function compteurs(int $id): array
    {
        $stmt = $this->pdo->prepare('SELECT COUNT(*) FROM twin9_lots WHERE run_id = ?');
        $stmt->execute([$id]);
        $lots = (int) $stmt->fetchColumn();
        $stmt = $this->pdo->prepare(
            'SELECT etape, statut, COUNT(*) AS n, SUM(tentatives) AS tentatives, SUM(jetons_entree) AS entree,
                    SUM(jetons_sortie) AS sortie, SUM(cout_microusd) AS cout, SUM(duree_ms) AS duree
               FROM twin9_appels WHERE run_id = ? GROUP BY etape, statut ORDER BY etape, statut'
        );
        $stmt->execute([$id]);
        $total = ['appels' => 0, 'pannes' => 0, 'tentatives' => 0, 'jetons_entree' => 0, 'jetons_sortie' => 0,
                  'cout_microusd' => 0, 'duree_ms' => 0];
        $parEtape = [];
        foreach ($stmt->fetchAll() as $row) {
            $etape = (string) $row['etape'];
            $parEtape[$etape] ??= ['appels' => 0, 'pannes' => 0, 'cout_microusd' => 0];
            $parEtape[$etape]['appels'] += (int) $row['n'];
            $parEtape[$etape]['cout_microusd'] += (int) $row['cout'];
            $total['appels'] += (int) $row['n'];
            if ($row['statut'] === 'panne') {
                $parEtape[$etape]['pannes'] += (int) $row['n'];
                $total['pannes'] += (int) $row['n'];
            }
            $total['tentatives'] += (int) $row['tentatives'];
            $total['jetons_entree'] += (int) $row['entree'];
            $total['jetons_sortie'] += (int) $row['sortie'];
            $total['cout_microusd'] += (int) $row['cout'];
            $total['duree_ms'] += (int) $row['duree'];
        }
        $stmt = $this->pdo->prepare(
            'SELECT modele_servi, COUNT(*) FROM twin9_appels WHERE run_id = ? AND modele_servi IS NOT NULL
              GROUP BY modele_servi ORDER BY modele_servi'
        );
        $stmt->execute([$id]);

        return $total + ['lots' => $lots, 'par_etape' => $parEtape, 'modeles_servis' => array_map(intval(...),
            $stmt->fetchAll(PDO::FETCH_KEY_PAIR))];
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
