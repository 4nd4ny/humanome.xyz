<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use PDO;
use stdClass;

/**
 * The evaluations Twin9 runs leave, to foresee the next ones (Twin_v9's
 * docs/plan-twin9-php.md, lot 2, T8: the strategy A, chosen by Christian on
 * 2026-10-19).
 *
 * A run done is recorded without any of its content (consigner()): the person
 * evaluated, the size of each day of its map with what the run paid for it —
 * nothing for a day taken back from the memory —, what its merge cost, the
 * largest worst case a call of its days, and of its merge, held before
 * leaving (T10), its final cost and its active duration, and the settings its
 * profile chose, with its template set's fingerprint. A row outlives its run;
 * the account purge anonymizes it.
 *
 * The forecasts (modele(), selon()) read the latest evaluations of the same
 * settings (signature()), each converted to the lane and the key of the run
 * foreseen: half price by batches, the margin with the instance's key. A day
 * instructed costs a fixed part — its pole's fiches fill most of each reading
 * prompt — and a part by kilobyte, a merge the same by the kilobytes of the
 * map it reads, neither part below zero (droite()): between the sizes
 * observed, the line through them and the gaps around it; beyond them, what
 * such a cost allows, at the least and at the most.
 */
final class Evaluations
{
    private const JSON = JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION;

    /** What a reader's settings say of its cost: its provider too, when it names one. */
    private const LECTEUR = ['fournisseur', 'modele', 'budget_sortie', 'effort', 'reflexion', 'passes'];

    /** The algorithm's parameters: they change a run's calls, their number or their size. */
    private const ALGORITHME = ['seuils_consensus', 'juge_leger', 'jury', 'premiere_impression', 'calques', 'merge',
                                'scan_global', 'troncatures'];

    /** The evaluations a forecast reads, the latest: prices and models change. */
    public const RECENTES = 200;

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * What the forecasts compare: the mode, the referential, its version and
     * its fiches as the engine reads them, the template set and its content,
     * the models and the performance, the algorithm's parameters — all a
     * run's calls depend on, but its lane and its key, which a forecast
     * converts, its caps and its parallelism.
     *
     * @param string $jeu the template set's fingerprint (Lancement::empreinte()): an edited set is another one
     * @param string $referentiel the fingerprint of the referential the engine reads (ReferentielMoteur::empreinte(),
     *                            T16): its fiches make its prompts' size; '' for a run that read the set's
     */
    public static function signature(stdClass $profil, string $jeu, string $referentiel = ''): string
    {
        return substr(hash('sha256', json_encode(CallSettings::canonique(self::comparables($profil, $jeu, $referentiel)),
            self::JSON)), 0, 16);
    }

    /** A size as the evaluations keep it, and as the forecasts read it: in kilobytes, to the hundredth. */
    public static function ko(int $octets): float
    {
        return round($octets / 1024, 2);
    }

    /**
     * A run done, from its journal, in the transaction of the caller that
     * deletes the journal next (RunRepository::terminer). A day with calls
     * that the map's days do not name keeps its cost, its size unknown; a day
     * where a call failed says so (`panne`): the next run maps it again.
     *
     * @param string $jeu its template set's fingerprint (Lancement::empreinte())
     * @param array<string, int> $octets the days of its map, in order — those the run took, then those its memory
     *        keeps —: each day's size in bytes, by its id
     * @param float $marge the instance's margin its costs include; 1.0 with its owner's own key
     * @param string $referentiel the fingerprint of the referential its engine read (T16), as signature() takes it
     */
    public function consigner(int $runId, int $userId, stdClass $profil, string $jeu, array $octets, float $marge,
                              int $dureeS, string $referentiel = ''): void
    {
        $stmt = $this->pdo->prepare(
            'SELECT appel, statut, COALESCE(cout_microusd, 0), pire_cas_microusd FROM twin9_appels WHERE run_id = ?'
        );
        $stmt->execute([$runId]);
        $parJour = [];
        $pannes = [];
        $pireCas = ['journee' => null, 'fusion' => null];
        $total = 0;
        foreach ($stmt->fetchAll(PDO::FETCH_NUM) as [$appel, $statut, $cout, $pire]) {
            $total += (int) $cout;
            $jour = preg_match('#^journees/([^/]+)/#', (string) $appel, $m) === 1 ? $m[1] : null;
            if ($jour !== null) {
                $parJour[$jour] = ($parJour[$jour] ?? 0) + (int) $cout;
                $pannes[$jour] = ($pannes[$jour] ?? false) || $statut === 'panne';
            }
            if ($pire !== null) {
                $cote = $jour === null ? 'fusion' : 'journee';
                $pireCas[$cote] = max($pireCas[$cote] ?? 0, (int) $pire);
            }
        }
        $journee = static fn (?float $ko, ?int $cout, bool $panne): array
            => ['ko' => $ko, 'cout_microusd' => $cout] + ($panne ? ['panne' => true] : []);
        $journees = [];
        foreach ($octets as $id => $n) {
            $journees[] = $journee(self::ko($n), $parJour[$id] ?? null, $pannes[$id] ?? false);
        }
        foreach (array_diff_key($parJour, $octets) as $id => $cout) {
            $journees[] = $journee(null, $cout, $pannes[$id] ?? false);
        }
        $coutJournees = array_sum($parJour);
        $this->pdo->prepare(
            'INSERT INTO twin9_evaluations (run_id, user_id, signature, reglages, journees, cout_journees_microusd,
                                            cout_fusion_microusd, pire_cas_journee_microusd, pire_cas_fusion_microusd,
                                            cout_microusd, duree_s)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([$runId, $userId, self::signature($profil, $jeu, $referentiel),
                    json_encode(self::reglages($profil, $jeu, $marge, $referentiel), self::JSON),
                    json_encode($journees, self::JSON), $coutJournees, $total - $coutJournees, $pireCas['journee'],
                    $pireCas['fusion'], $total, $dureeS]);
    }

    /**
     * What the latest evaluations of a signature say (RECENTES), each
     * converted to a lane and a margin (half price by batches; its own margin
     * out, this one in): what a day instructed costs by its size, and a merge
     * by the size of the map it reads (droite()) — a day where a call failed
     * left out —; the largest worst case a call of a day, and of a merge,
     * held; and, by direct calls, the active seconds of a run by day
     * instructed, its merge included, on average. Null for what no
     * evaluation says.
     *
     * @return array{evaluations: int, journee: array<string, float>|null, fusion: array<string, float>|null,
     *               pire_cas: array{journee: float|null, fusion: float|null},
     *               secondes_par_journee: float|null}|null in micro-USD; null: no evaluation
     */
    public function modele(string $signature, bool $parLots, float $marge): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT reglages, journees, cout_fusion_microusd, pire_cas_journee_microusd, pire_cas_fusion_microusd, duree_s
               FROM twin9_evaluations WHERE signature = ? ORDER BY id DESC LIMIT ' . self::RECENTES
        );
        $stmt->execute([$signature]);
        $lignes = $stmt->fetchAll();
        if ($lignes === []) {
            return null;
        }
        $points = ['journee' => [], 'fusion' => []];
        $pireCas = ['journee' => null, 'fusion' => null];
        $secondes = [0, 0];
        foreach ($lignes as $ligne) {
            $reglages = json_decode((string) $ligne['reglages'], true, 64, JSON_THROW_ON_ERROR);
            $lots = ($reglages['voie'] ?? '') === 'lots';
            $facteur = $marge / max(0.000001, (float) ($reglages['marge'] ?? 1.0))
                * ($lots === $parLots ? 1.0 : ($parLots ? 0.5 : 2.0));
            $carte = 0.0;
            $instruites = 0;
            foreach (json_decode((string) $ligne['journees'], true, 64, JSON_THROW_ON_ERROR) as $jour) {
                $instruites += $jour['cout_microusd'] === null ? 0 : 1;
                if ($jour['ko'] === null) {
                    continue;
                }
                $carte += (float) $jour['ko'];
                // a day where a call failed is mapped again: its cost is not a day's
                if ($jour['cout_microusd'] !== null && !($jour['panne'] ?? false)) {
                    $points['journee'][] = [(float) $jour['ko'], $jour['cout_microusd'] * $facteur];
                }
            }
            if ($carte > 0) {
                $points['fusion'][] = [round($carte, 2), (int) $ligne['cout_fusion_microusd'] * $facteur];
            }
            foreach (['journee', 'fusion'] as $cote) {
                $pire = $ligne['pire_cas_' . $cote . '_microusd'];
                if ($pire !== null) {
                    $pireCas[$cote] = max($pireCas[$cote] ?? 0.0, (int) $pire * $facteur);
                }
            }
            if (!$lots && $instruites > 0) {
                $secondes[0] += (int) $ligne['duree_s'];
                $secondes[1] += $instruites;
            }
        }

        return ['evaluations' => \count($lignes),
                'journee' => $points['journee'] === [] ? null : self::droite($points['journee']),
                'fusion' => $points['fusion'] === [] ? null : self::droite($points['fusion']),
                'pire_cas' => $pireCas,
                'secondes_par_journee' => $secondes[1] > 0 ? (float) $secondes[0] / $secondes[1] : null];
    }

    /**
     * What a day, or a merge, of this size would cost by a line of modele():
     * on average, the line; at the least and at the most, between the sizes
     * observed, the line and its gaps. Beyond them, what a fixed part and a
     * part by kilobyte, neither below zero, allow: below the smallest size, at
     * most what it cost, at least its share by kilobyte; above the largest, at
     * least what it cost, at most as much again by kilobyte. Never below zero.
     *
     * @param array{fixe: float, par_ko: float, ecart_min: float, ecart_max: float, ko_min: float, ko_max: float} $droite
     * @return array{min: float, moyenne: float, max: float} in micro-USD
     */
    public static function selon(array $droite, float $ko): array
    {
        $ligne = static fn (float $x): float => $droite['fixe'] + $droite['par_ko'] * $x;
        [$bas, $haut] = [$droite['ko_min'], $droite['ko_max']];
        [$min, $max] = match (true) {
            $ko < $bas => [($ligne($bas) + $droite['ecart_min']) * $ko / $bas, $ligne($bas) + $droite['ecart_max']],
            $ko > $haut && $haut > 0 => [$ligne($haut) + $droite['ecart_min'],
                                         ($ligne($haut) + $droite['ecart_max']) * $ko / $haut],
            default => [$ligne($ko) + $droite['ecart_min'], $ligne($ko) + $droite['ecart_max']],
        };

        return ['min' => max(0.0, $min), 'moyenne' => max(0.0, $ligne($ko)), 'max' => max(0.0, $max)];
    }

    /**
     * The line through costs by size: a fixed part and a part by kilobyte,
     * neither below zero. With two sizes or more, by least squares — a part
     * by kilobyte below zero, the cost does not grow with the size: their
     * average; a fixed part below zero, the cost by kilobyte alone. With a
     * single size, which says nothing of the split, half of each. The gaps of
     * the points to it, at the least (zero or below) and at the most (zero or
     * above), and the sizes observed.
     *
     * @param non-empty-list<array{0: float, 1: float}> $points each size in kilobytes, to the hundredth, and its cost
     * @return array{fixe: float, par_ko: float, ecart_min: float, ecart_max: float, ko_min: float, ko_max: float}
     */
    private static function droite(array $points): array
    {
        $xs = array_column($points, 0);
        $n = \count($points);
        $mx = array_sum($xs) / $n;
        $my = array_sum(array_column($points, 1)) / $n;
        [$bas, $haut] = [min($xs), max($xs)];
        if ($bas === $haut) {
            [$fixe, $parKo] = $haut > 0 ? [$my / 2, $my / (2 * $haut)] : [$my, 0.0];
        } else {
            $sxx = 0.0;
            $sxy = 0.0;
            foreach ($points as [$x, $y]) {
                $sxx += ($x - $mx) ** 2;
                $sxy += ($x - $mx) * ($y - $my);
            }
            $parKo = $sxy / $sxx;
            $fixe = $my - $parKo * $mx;
            if ($parKo < 0) {
                [$fixe, $parKo] = [$my, 0.0];
            } elseif ($fixe < 0) {
                $x2 = array_sum(array_map(static fn (array $p): float => $p[0] ** 2, $points));
                [$fixe, $parKo] = [0.0, array_sum(array_map(static fn (array $p): float => $p[0] * $p[1], $points)) / $x2];
            }
        }
        $ecarts = array_map(static fn (array $p): float => $p[1] - ($fixe + $parKo * $p[0]), $points);

        return ['fixe' => $fixe, 'par_ko' => $parKo, 'ecart_min' => min(0.0, ...$ecarts),
                'ecart_max' => max(0.0, ...$ecarts), 'ko_min' => $bas, 'ko_max' => $haut];
    }

    /** @return array<string, mixed> its lane, key and margin, with what the forecasts compare */
    private static function reglages(stdClass $profil, string $jeu, float $marge, string $referentiel): array
    {
        return ['voie' => (string) $profil->voie, 'cle' => (string) $profil->cle, 'marge' => $marge]
            + self::comparables($profil, $jeu, $referentiel);
    }

    /**
     * @return array<string, mixed> the mode, the referential, its version and its fingerprint (T16), the template
     *         set and its fingerprint, the models and the performance (stages, steps, readers: a provider named
     *         where it is inherited anyway left out, CallSettings::sansFournisseurHerite()), the algorithm's
     *         parameters
     */
    private static function comparables(stdClass $profil, string $jeu, string $referentiel): array
    {
        $appels = CallSettings::sansFournisseurHerite($profil);
        $lecteurs = [];
        foreach ($appels['college'] as $lecteur) {
            $lecteurs[] = array_intersect_key((array) $lecteur, array_flip(self::LECTEUR));
        }
        $reglages = ['mode' => (string) $profil->mode, 'referentiel' => (string) ($profil->referentiel->id ?? ''),
                     'version_referentiel' => (string) ($profil->referentiel->version ?? ''),
                     'empreinte_referentiel' => $referentiel,
                     'gabarits' => (string) ($profil->gabarits ?? ''), 'empreinte_gabarits' => $jeu,
                     'etages' => $appels['etages'], 'etapes' => $appels['etapes'], 'lecteurs' => $lecteurs];
        foreach (self::ALGORITHME as $cle) {
            $reglages[$cle] = $profil->{$cle} ?? null;
        }

        return $reglages;
    }
}
