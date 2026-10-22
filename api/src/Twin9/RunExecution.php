<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Twin9\Fournisseurs\Arret;
use Humanome\Twin9\Fournisseurs\Fournisseurs;
use PDO;
use stdClass;

/**
 * A Twin9 run's execution block (P0-1, docs/contrats.md §8.9): how it went,
 * read in its journal — its calls in total and by lane, provider and model
 * (its price key: Fournisseurs::clePrix()), their stops in one vocabulary
 * (Arret, each in its provider's table), the cuts the slices' ends made,
 * their tokens and costs, the models served for each model asked; its
 * batches, its passes and the engine's time, its active duration, the
 * engine's commit at its launch and at its end, its resumptions.
 *
 * Frozen when the run ends (`source: "fige"`, RunRepository::terminer(),
 * before its journal goes); computed from the journal for a run in
 * progress, stopped or cancelled (`source: "journal"`). Its totals are those
 * of the run's counters (RunRepository::compteurs()). A run launched before
 * migration 031 has no configuration, and its passes, engine time and first
 * commit are partial: its block says so (`partiel`).
 *
 * Every table keyed by name is a JSON object, empty or not ({} and never
 * []). Counters only, never content.
 */
final class RunExecution
{
    /** The block's schema, which a change of its shape changes (schemas/twin9-run.schema.json). */
    public const SCHEMA = 'twin9-execution/1';

    /** The classes of a stop (Arret), each counted. */
    private const ARRETS = ['end', 'max_tokens', 'context_window', 'refusal', 'other'];

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * The block of a run, from its journal and its counters.
     *
     * @param 'fige'|'journal' $source
     * @param array{statut: string, debut_at: string|null, fin_at: string|null, duree_active_s: int, passes: int,
     *              moteur_ms: int, commit_debut: string|null, commit_fin: string|null, partiel: bool,
     *              reprises: list<mixed>} $run
     * @param array<string, mixed> $compteurs RunRepository::compteurs() of the same journal: its totals
     * @return array<string, mixed>
     */
    public function bloc(int $id, string $source, array $run, array $compteurs): array
    {
        return self::depuis($source, $run, $compteurs, $this->lignes($id));
    }

    /**
     * The journal of a run, grouped by lane, provider, model asked, model
     * served, status and stop.
     *
     * @return list<array<string, mixed>>
     */
    public function lignes(int $id): array
    {
        // the lane by custom_id, which a batch's call keeps (lot_id goes back to NULL with its batch); the model
        // sent, else the engine's
        $stmt = $this->pdo->prepare(
            'SELECT IF(custom_id IS NULL, "directe", "lots") AS voie_appel, fournisseur,
                    COALESCE(modele_envoye, modele) AS modele_appel, modele_servi, statut, stop_reason, COUNT(*) AS n,
                    SUM(coupures) AS coupures, SUM(jetons_entree) AS entree, SUM(jetons_sortie) AS sortie,
                    SUM(cout_microusd) AS cout
               FROM twin9_appels WHERE run_id = ?
              GROUP BY voie_appel, fournisseur, modele_appel, modele_servi, statut, stop_reason
              ORDER BY voie_appel, fournisseur, modele_appel, modele_servi, statut, stop_reason'
        );
        $stmt->execute([$id]);

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * The block, from the journal's lines (lignes()) and the run's counters.
     *
     * @param 'fige'|'journal' $source
     * @param array<string, mixed> $run as bloc() takes it
     * @param array<string, mixed> $compteurs
     * @param list<array<string, mixed>> $lignes
     * @return array<string, mixed>
     */
    public static function depuis(string $source, array $run, array $compteurs, array $lignes): array
    {
        $parVoie = [];
        $parFournisseur = [];
        $parModele = [];
        $servis = [];
        $arrets = array_fill_keys(self::ARRETS, 0);
        $repondus = 0;
        $refus = 0;
        foreach ($lignes as $l) {
            $n = (int) $l['n'];
            // a line written before the journal kept its provider is Anthropic's (migration 032)
            $fournisseur = (string) ($l['fournisseur'] ?? Fournisseurs::DEFAUT);
            $modele = Fournisseurs::clePrix($fournisseur, (string) $l['modele_appel']);
            $classe = Arret::classe($fournisseur, $l['stop_reason'] === null ? null : (string) $l['stop_reason']);
            $panne = $l['statut'] === 'panne';
            $tronque = $panne && \in_array($classe, Arret::TRONQUEES, true);
            self::compter($parVoie, (string) $l['voie_appel'], $l, $panne, $tronque);
            self::compter($parFournisseur, $fournisseur, $l, $panne, $tronque);
            self::compter($parModele, $modele, $l, $panne, $tronque);
            if ($l['modele_servi'] !== null) {
                $servi = (string) $l['modele_servi'];
                $servis[$modele][$servi] = ($servis[$modele][$servi] ?? 0) + $n;
            }
            if ($classe !== null) {
                $arrets[$classe] += $n;
            }
            $repondus += $l['statut'] === 'repondu' ? $n : 0;
            $refus += $panne && $classe === 'refusal' ? $n : 0;
        }
        ksort($parVoie, SORT_STRING);
        ksort($parFournisseur, SORT_STRING);
        ksort($parModele, SORT_STRING);
        ksort($servis, SORT_STRING);

        return [
            'schema' => self::SCHEMA,
            'source' => $source,
            'partiel' => (bool) $run['partiel'],
            'statut' => (string) $run['statut'],
            'debut_at' => $run['debut_at'],
            'fin_at' => $run['fin_at'],
            'duree_active_s' => (int) $run['duree_active_s'],
            'passes' => (int) $run['passes'],
            'moteur_ms' => (int) $run['moteur_ms'],
            'appels' => [
                'total' => (int) $compteurs['appels'],
                'repondus' => $repondus,
                'pannes' => (int) $compteurs['pannes'],
                'tronques' => (int) $compteurs['tronques'],
                'refus' => $refus,
                'tentatives' => (int) $compteurs['tentatives'],
            ],
            'jetons' => ['entree' => (int) $compteurs['jetons_entree'], 'sortie' => (int) $compteurs['jetons_sortie']],
            'cout_microusd' => (int) $compteurs['cout_microusd'],
            'lots' => (int) $compteurs['lots'],
            'par_voie' => (object) $parVoie,
            'par_fournisseur' => (object) $parFournisseur,
            'par_modele' => (object) $parModele,
            'servis' => (object) array_map(static fn (array $m): object => (object) $m, $servis),
            'arrets' => $arrets,
            'moteur' => ['commit_debut' => $run['commit_debut'], 'commit_fin' => $run['commit_fin']],
            'reprises' => array_values($run['reprises']),
        ];
    }

    /**
     * A line of the journal in a breakdown: its calls, failures, cut outputs,
     * cuts by the slices' ends, tokens and cost under its key.
     *
     * @param array<string, array<string, int>> $table
     * @param array<string, mixed> $ligne
     */
    private static function compter(array &$table, string $cle, array $ligne, bool $panne, bool $tronque): void
    {
        $n = (int) $ligne['n'];
        $table[$cle] ??= ['appels' => 0, 'pannes' => 0, 'tronques' => 0, 'coupures' => 0, 'jetons_entree' => 0,
                          'jetons_sortie' => 0, 'cout_microusd' => 0];
        $table[$cle]['appels'] += $n;
        $table[$cle]['pannes'] += $panne ? $n : 0;
        $table[$cle]['tronques'] += $tronque ? $n : 0;
        $table[$cle]['coupures'] += (int) ($ligne['coupures'] ?? 0);
        $table[$cle]['jetons_entree'] += (int) $ligne['entree'];
        $table[$cle]['jetons_sortie'] += (int) $ligne['sortie'];
        $table[$cle]['cout_microusd'] += (int) $ligne['cout'];
    }

    /**
     * The block as a cartographe the run's owner linked reads it: without
     * what its owner paid nor the budgets of its resumptions.
     */
    public static function pourCartographe(stdClass $bloc): stdClass
    {
        $copie = json_decode(json_encode($bloc, JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION), false, 512,
            JSON_THROW_ON_ERROR);
        unset($copie->cout_microusd);
        foreach (['par_voie', 'par_fournisseur', 'par_modele'] as $table) {
            foreach ((array) ($copie->{$table} ?? []) as $compte) {
                if ($compte instanceof stdClass) {
                    unset($compte->cout_microusd);
                }
            }
        }
        foreach ($copie->reprises ?? [] as $reprise) {
            if ($reprise instanceof stdClass) {
                unset($reprise->budget_usd);
            }
        }

        return $copie;
    }
}
