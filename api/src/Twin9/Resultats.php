<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Auth\Audit;
use PDO;
use stdClass;

/**
 * What the readers of a Twin9 run see of it (T9, Twin_v9's
 * docs/plan-twin9-php.md, lot 2, « Lire les résultats »): its outputs — the
 * merge, the ipsative profile, the reports, the day maps with their
 * deliberations — and, for the days its merge took back from its map's
 * memory, their day maps as the memory keeps them: the complete dossier.
 * Never its portfolio, nor the day texts the memory keeps beside the maps.
 *
 * Everything shown passes the leak filter (ADR-010 §2) against the whole
 * template set and the fiches of the referential (T16) of every run of its
 * map, as each took them: the days the map's memory gives were judged by
 * earlier runs, under their own. A model that recited a template or a fiche
 * sees its recitation redacted. The count of redactions stays server-side,
 * in the audit, never in the answer.
 */
final class Resultats
{
    /** The outputs a reader sees. */
    private const SORTIES = '#^(carto_evolutive\.json|profil_ipsatif\.json|rapport\.md|rapport_evolutif\.md'
        . '|scan_global\.json|journees/[^/]+/carto_jour\.json)$#';

    /** The JSON of what is shown: 1.0 stays a float, as the engine wrote it. */
    private const JSON = JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        | JSON_PRESERVE_ZERO_FRACTION;

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * @param int $lecteurId who reads, for the audit of a redaction
     * @return array{sorties: array<string, string>, memoire: list<string>} the outputs by path, filtered; the
     *         days taken back from the map's memory
     */
    public function lire(int $runId, int $lecteurId): array
    {
        $runs = new RunRepository($this->pdo);
        $run = $runs->charger($runId);
        if ($run === null) {
            throw new Twin9Exception('Run introuvable', 404);
        }
        $sorties = array_filter($runs->sorties($runId),
            static fn (string $chemin): bool => preg_match(self::SORTIES, $chemin) === 1, ARRAY_FILTER_USE_KEY);

        // the days its merge counts that this run did not write: their maps are in the map's memory
        $memoire = [];
        if (isset($sorties['carto_evolutive.json'])) {
            $prefixe = $run['profil']->mode === 'test' ? 'test/' : '';
            foreach (self::journees(json_decode($sorties['carto_evolutive.json'], false, 512, JSON_THROW_ON_ERROR))
                     as $jour) {
                $chemin = 'journees/' . $jour . '/carto_jour.json';
                if (isset($sorties[$chemin])) {
                    continue;
                }
                $carto = $this->carteDuJour($run['carte_id'], $prefixe . 'journees/' . $jour);
                if ($carto !== null) {
                    $sorties[$chemin] = json_encode($carto, self::JSON);
                    $memoire[] = $jour;
                }
            }
        }
        ksort($sorties, SORT_STRING);
        sort($memoire, SORT_STRING);

        $index = self::index($this->confidentiels($runId, (int) $run['carte_id']));
        $fuites = 0;
        foreach ($sorties as $chemin => $texte) {
            $sorties[$chemin] = self::filtrer($index, $texte, str_ends_with($chemin, '.json'), $fuites);
        }
        if ($fuites > 0) {
            Audit::record($this->pdo, $lecteurId, 'twin9_fuite_expurgee', ['run' => $runId, 'fuites' => $fuites]);
        }

        return ['sorties' => $sorties, 'memoire' => $memoire];
    }

    /**
     * The leak filter's index of confidential texts: each template with its
     * variables empty — the fiches (tagger/P*) among them, for a run whose
     * engine read RESPIRE from its set —, each preamble and fiche of a
     * referential an engine read (T16).
     *
     * @param array<string, string> $textes confidentiels()'s, RunExport's
     * @return array<mixed> LeakFilter::indexer()'s
     */
    public static function index(array $textes): array
    {
        return LeakFilter::indexer(implode("\n\n", array_map(
            static fn (string $contenu): string => (string) preg_replace(ProtocoleRepository::VARIABLE_PATTERN, '',
                $contenu),
            array_values($textes),
        )));
    }

    /**
     * What the results of a run may recite: the templates every run of its
     * map took, and the preambles and fiches of the referentials their engine
     * read (T16), once each — the days of the map's memory were judged by
     * those runs.
     *
     * @return array<string, string>
     */
    private function confidentiels(int $runId, int $carteId): array
    {
        $stmt = $this->pdo->prepare('SELECT gabarits, reglages FROM twin9_runs WHERE carte_id = ? OR id = ?');
        $stmt->execute([$carteId, $runId]);

        return self::textes($stmt->fetchAll());
    }

    /**
     * The templates and the referential's texts of runs, once each, from
     * their rows (twin9_runs.gabarits and reglages): RunExport's too.
     *
     * @param list<array{gabarits: string, reglages: string}> $runs
     * @return array<string, string>
     */
    public static function textes(array $runs): array
    {
        $textes = [];
        foreach ($runs as $run) {
            foreach ((array) json_decode(RunRepository::uncompress((string) $run['gabarits']), true, 512,
                JSON_THROW_ON_ERROR) as $nom => $contenu) {
                $textes[hash('sha256', $nom . "\0" . $contenu)] = (string) $contenu;
            }
            $referentiel = json_decode(RunRepository::uncompress((string) $run['reglages']), false, 512,
                JSON_THROW_ON_ERROR)->moteur->referentiel ?? null;
            foreach ($referentiel === null ? [] : ReferentielMoteur::textes($referentiel) as $texte) {
                $textes[hash('sha256', "referentiel\0" . $texte)] = $texte;
            }
        }

        return $textes;
    }

    /**
     * A text the engine or a model wrote, filtered: every string of a JSON
     * document, or the whole text.
     *
     * @param array<mixed> $index index()'s
     * @param int $fuites the redactions, counted
     */
    public static function filtrer(array $index, string $texte, bool $json, int &$fuites): string
    {
        return $json
            ? json_encode(self::expurger($index, json_decode($texte, false, 512, JSON_THROW_ON_ERROR), $fuites),
                self::JSON)
            : self::expurger($index, $texte, $fuites);
    }

    /** Every string of a decoded JSON document, filtered; the rest as it is. */
    private static function expurger(array $index, mixed $valeur, int &$fuites): mixed
    {
        if (\is_string($valeur)) {
            if (mb_strlen($valeur) < LeakFilter::MIN_CARS) {
                return $valeur;
            }
            $filtre = LeakFilter::expurger($index, $valeur);
            $fuites += $filtre['fuites'];

            return $filtre['sortie'];
        }
        if ($valeur instanceof stdClass) {
            foreach (get_object_vars($valeur) as $cle => $v) {
                $valeur->{$cle} = self::expurger($index, $v, $fuites);
            }
        } elseif (\is_array($valeur)) {
            foreach ($valeur as $i => $v) {
                $valeur[$i] = self::expurger($index, $v, $fuites);
            }
        }

        return $valeur;
    }

    /** @return list<string> the days a merge names (its « journee » fields) */
    private static function journees(mixed $doc): array
    {
        $jours = [];
        $marcher = static function (mixed $v) use (&$marcher, &$jours): void {
            if ($v instanceof stdClass) {
                foreach (get_object_vars($v) as $cle => $w) {
                    if ($cle === 'journee' && \is_string($w) && preg_match('#^[^/\\\\]{1,190}$#', $w) === 1) {
                        $jours[$w] = true;
                    } else {
                        $marcher($w);
                    }
                }
            } elseif (\is_array($v)) {
                foreach ($v as $w) {
                    $marcher($w);
                }
            }
        };
        $marcher($doc);

        return array_map('strval', array_keys($jours));
    }

    /** The day map the memory keeps under this key, without the day's text. */
    private function carteDuJour(int $carteId, string $cle): ?stdClass
    {
        $stmt = $this->pdo->prepare('SELECT valeur FROM twin9_memoire WHERE carte_id = ? AND cle = ?');
        $stmt->execute([$carteId, $cle]);
        $blob = $stmt->fetchColumn();
        if ($blob === false) {
            return null;
        }
        $entree = json_decode(RunRepository::uncompress((string) $blob), false, 512, JSON_THROW_ON_ERROR);

        return ($entree->carto ?? null) instanceof stdClass ? $entree->carto : null;
    }
}
