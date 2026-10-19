<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use stdClass;

/**
 * What each call of a run is sent with, from the copy of its profile
 * (docs/contrats.md §7.2): the model, the output budget, the effort and the
 * thinking of its step, over those of the step's stage; a reader of the
 * college over the readers' stage; a setting of second_ressort over every call
 * of the second instance.
 */
final class CallSettings
{
    /** The engine's steps (the v9.8's tasks), and the step of the profile each one follows. */
    public const ETAPES = [
        'premiere_impression' => 'premiere_impression',
        'greffier' => 'greffier',
        'leger' => 'juge_leger',
        'contre_lecture' => 'contre_lecture',
        'accusation' => 'accusation',
        'defense' => 'defense',
        'replique' => 'replique',
        'briefing' => 'briefing',
        'jure' => 'jures',
        'relance' => 'relance',
        'jure2' => 'second_tour',
        'gardien_support' => 'gardien_support',
        'gardien_raisonnement' => 'gardien_raisonnement',
        'president' => 'president',
        'merge_kairos' => 'relectures',
        'merge_pole' => 'relectures',
        'merge_competence' => 'relectures',
        'merge_rapporteur' => 'relectures',
        'condense' => 'arpenteur',
        'arpenteur' => 'arpenteur',
        'retour_sources' => 'arpenteur',
    ];

    /** The stage each step of the profile follows, as in the v9.8. */
    private const ETAGES = [
        'premiere_impression' => 'rapide',
        'greffier' => 'rapide',
        'juge_leger' => 'rapide',
        'contre_lecture' => 'rapide',
        'accusation' => 'profond',
        'defense' => 'profond',
        'replique' => 'profond',
        'briefing' => 'profond',
        'jures' => 'profond',
        'relance' => 'profond',
        'second_tour' => 'profond',
        'gardien_support' => 'rapide',
        'gardien_raisonnement' => 'profond',
        'president' => 'profond',
        'second_ressort' => 'profond',
        'relectures' => 'profond',
        'arpenteur' => 'profond',
    ];

    private const CHAMPS = ['modele', 'budget_sortie', 'effort', 'reflexion'];

    public function __construct(private readonly stdClass $profil)
    {
    }

    /**
     * The settings of one call, by its step and its id.
     *
     * @return array{modele: string, budget_sortie: int, effort: string|null, reflexion: string}
     */
    public function pour(string $step, string $id): array
    {
        $etages = $this->profil->etages;
        if ($step === 'tagger') {
            $reglage = self::sur((array) $etages->lecteurs, $this->lecteur($id));
        } else {
            $etape = self::ETAPES[$step] ?? null;
            $reglage = (array) $etages->{self::ETAGES[$etape] ?? 'profond'};
            if ($etape !== null) {
                $reglage = self::sur($reglage, $this->profil->etapes->{$etape} ?? null);
            }
            if (str_starts_with($id, 'second_ressort/')) {
                $reglage = self::sur($reglage, $this->profil->etapes->second_ressort ?? null);
            }
        }

        return [
            'modele' => (string) $reglage['modele'],
            'budget_sortie' => (int) $reglage['budget_sortie'],
            'effort' => isset($reglage['effort']) ? (string) $reglage['effort'] : null,
            'reflexion' => (string) $reglage['reflexion'],
        ];
    }

    /**
     * Every combination of model and settings a call of the run may be sent
     * with: each reader, each step, each step of the second instance, a step
     * the profile does not know. The batch lane checks them all before the
     * run's first batch (T8).
     *
     * @return list<array{modele: string, budget_sortie: int, effort: string|null, reflexion: string}>
     */
    public function combinaisons(): array
    {
        $reglages = [$this->pour('tagger', '')];
        foreach ($this->profil->college as $lecteur) {
            $reglages[] = $this->pour('tagger', '/tags_' . $lecteur->nom . '_P1.json');
        }
        foreach ([...array_keys(self::ETAPES), ''] as $step) {
            $reglages[] = $this->pour($step, '');
            $reglages[] = $this->pour($step, 'second_ressort/');
        }
        $uniques = [];
        foreach ($reglages as $reglage) {
            $uniques[json_encode($reglage, JSON_THROW_ON_ERROR)] = $reglage;
        }

        return array_values($uniques);
    }

    /**
     * The fingerprint of what in a run's settings changes a response the
     * memory keeps, and that the v9.8's own fingerprints leave out (ADR-011
     * §2): the call settings of the stages, steps and readers, the
     * truncations, the templates and fiches of the set (the merge's re-readings
     * aside: the memory does not keep them).
     *
     * @param array<string, string> $gabarits the template set, by name
     */
    public static function empreinte(stdClass $profil, mixed $troncatures, array $gabarits): string
    {
        $lecteurs = [];
        foreach ($profil->college as $lecteur) {
            $lecteurs[(string) $lecteur->nom] = array_intersect_key((array) $lecteur, array_flip(self::CHAMPS));
        }
        ksort($gabarits, SORT_STRING);
        $jeu = hash_init('sha256');
        foreach ($gabarits as $nom => $contenu) {
            if (!str_starts_with((string) $nom, 'merge/')) {
                hash_update($jeu, $nom . "\0" . $contenu . "\0");
            }
        }

        return substr(hash('sha256', json_encode(self::canonique([
            'etages' => $profil->etages, 'etapes' => $profil->etapes, 'lecteurs' => $lecteurs,
            'troncatures' => $troncatures, 'gabarits' => hash_final($jeu),
        ]), JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION)), 0, 16);
    }

    /** The reader of a call: tags_<name>#<pass>_P<n>.json gives <name>. */
    private function lecteur(string $id): ?stdClass
    {
        if (preg_match('#/tags_(.+?)(?:\#\d+)?_P\d+\.json$#', $id, $m) !== 1) {
            return null;
        }
        foreach ($this->profil->college as $lecteur) {
            if ($lecteur->nom === $m[1]) {
                return $lecteur;
            }
        }

        return null;
    }

    /**
     * @param array<string, mixed> $base
     * @return array<string, mixed>
     */
    private static function sur(array $base, ?stdClass $dessus): array
    {
        foreach (self::CHAMPS as $champ) {
            if ($dessus !== null && isset($dessus->{$champ})) {
                $base[$champ] = $dessus->{$champ};
            }
        }

        return $base;
    }

    /** Objects' keys sorted, at every depth: the same settings, the same fingerprint. */
    private static function canonique(mixed $valeur): mixed
    {
        if ($valeur instanceof stdClass || (\is_array($valeur) && !array_is_list($valeur))) {
            $valeur = (array) $valeur;
            ksort($valeur, SORT_STRING);

            return (object) array_map(self::canonique(...), $valeur);
        }

        return \is_array($valeur) ? array_map(self::canonique(...), $valeur) : $valeur;
    }
}
