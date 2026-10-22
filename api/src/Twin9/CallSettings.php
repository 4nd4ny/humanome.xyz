<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Twin9\Fournisseurs\Fournisseurs;
use stdClass;

/**
 * What each call of a run is sent with, from the copy of its profile
 * (docs/contrats.md §7.2): the provider, the model, the output budget, the
 * effort and the thinking of its step, over those of the step's stage; a
 * reader of the college over the readers' stage; a setting of second_ressort
 * over every call of the second instance. Each call is routed by its own
 * settings: by batches when its provider is Anthropic and the profile's lane
 * is « lots », directly otherwise. A stage that names no provider is
 * Anthropic's; a step, a reader or the second instance that names none takes
 * the one beneath it (ADR-012).
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
    public const ETAGES = [
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

    private const CHAMPS = ['fournisseur', 'modele', 'budget_sortie', 'effort', 'reflexion'];

    /**
     * The entries of parEtape() no call of the engine is sent with: the
     * readers' stage itself — each reader of the college is its own entry,
     * the stage only what it inherits — and a step the profile does not know.
     */
    private const NON_ATTEINTS = ['lecteurs', 'autre étape'];

    public function __construct(private readonly stdClass $profil)
    {
    }

    /**
     * The settings of one call, by its step and its id, and its lane.
     *
     * @return array{fournisseur: string, voie: 'lots'|'directe', modele: string, budget_sortie: int,
     *               effort: string|null, reflexion: string}
     */
    public function pour(string $step, string $id): array
    {
        $etages = $this->profil->etages;
        if ($step === 'tagger') {
            $reglage = self::sur((array) $etages->lecteurs, $this->lecteur($id));
        } else {
            $etape = self::ETAPES[$step] ?? null;
            $reglage = (array) $etages->{$etape === null ? 'profond' : (self::ETAGES[$etape] ?? 'profond')};
            if ($etape !== null) {
                $reglage = self::sur($reglage, $this->profil->etapes->{$etape} ?? null);
            }
            if (str_starts_with($id, 'second_ressort/')) {
                $reglage = self::sur($reglage, $this->profil->etapes->second_ressort ?? null);
            }
        }

        return $this->reglage($reglage);
    }

    /**
     * What each step of the run is sent with, by step: the readers' stage,
     * each reader, each step of the profile, each under the second instance,
     * and a step the profile does not know.
     *
     * @return array<string, array{fournisseur: string, voie: 'lots'|'directe', modele: string, budget_sortie: int,
     *                             effort: string|null, reflexion: string}>
     */
    public function parEtape(): array
    {
        $reglages = ['lecteurs' => $this->pour('tagger', '')];
        foreach ($this->profil->college as $lecteur) {
            $reglages['lecteur ' . $lecteur->nom] = $this->pour('tagger', '/tags_' . $lecteur->nom . '_P1.json');
        }
        foreach (self::ETAPES as $step => $etape) {
            $reglages[$etape] = $this->pour($step, '');
            $reglages[$etape . ' au second ressort'] = $this->pour($step, 'second_ressort/');
        }
        $reglages['autre étape'] = $this->pour('', '');

        return $reglages;
    }

    /**
     * What the calls of the run are sent with, by step, as parEtape() gives
     * it, but for what no call of the engine reaches (NON_ATTEINTS): the
     * readers' stage itself and a step the profile does not know.
     *
     * @return array<string, array{fournisseur: string, voie: 'lots'|'directe', modele: string, budget_sortie: int,
     *                             effort: string|null, reflexion: string}>
     */
    public function atteints(): array
    {
        return array_diff_key($this->parEtape(), array_flip(self::NON_ATTEINTS));
    }

    /**
     * Every combination of provider, lane, model and settings a call of the
     * run is sent with (atteints(), once each), of one lane when it is given.
     * The batch lane checks its own before the run's first batch (T8); the
     * launch, the consent and the slice's guard read the providers they
     * reach (fournisseurs()).
     *
     * @param 'lots'|'directe'|null $voie
     * @return list<array{fournisseur: string, voie: 'lots'|'directe', modele: string, budget_sortie: int,
     *                    effort: string|null, reflexion: string}>
     */
    public function combinaisons(?string $voie = null): array
    {
        $uniques = [];
        foreach ($this->atteints() as $reglage) {
            if ($voie === null || $reglage['voie'] === $voie) {
                $uniques[json_encode($reglage, JSON_THROW_ON_ERROR)] = $reglage;
            }
        }

        return array_values($uniques);
    }

    /**
     * The providers the run's calls reach (combinaisons()), of one lane when
     * it is given, in the registry's order.
     *
     * @param 'lots'|'directe'|null $voie
     * @return list<string>
     */
    public function fournisseurs(?string $voie = null): array
    {
        $atteints = array_flip(array_column($this->combinaisons($voie), 'fournisseur'));

        return array_values(array_filter(array_keys(Fournisseurs::REGISTRE),
            static fn (string $f): bool => isset($atteints[$f])));
    }

    /**
     * The run's lane as it goes (P1-5): « lots » when every call it sends goes
     * by batches, « directe » when none does, « mixte » otherwise.
     *
     * @return 'lots'|'directe'|'mixte'
     */
    public function voieEffective(): string
    {
        $voies = array_unique(array_column($this->combinaisons(), 'voie'));

        return \count($voies) > 1 ? 'mixte' : ($voies === ['lots'] ? 'lots' : 'directe');
    }

    /**
     * What the calls of the run are sent with, in the run's own terms: each
     * stage as the profile sets it (read from the stage itself: a step's
     * setting never shows in its stage), each step of the profile, each
     * under the second instance, each reader of the college, and a step the
     * profile does not know — each as pour() gives it.
     *
     * @return array{etages: array<string, array<string, mixed>>, etapes: array<string, array<string, mixed>>,
     *               second_ressort: array<string, array<string, mixed>>, lecteurs: array<string, array<string, mixed>>,
     *               defaut: array<string, mixed>}
     */
    public function resume(): array
    {
        $etages = [];
        foreach ((array) $this->profil->etages as $etage => $reglage) {
            $etages[(string) $etage] = $this->reglage((array) $reglage);
        }
        $etapes = [];
        $second = [];
        foreach (self::ETAPES as $step => $etape) {
            $etapes[$etape] ??= $this->pour($step, '');
            $second[$etape] ??= $this->pour($step, 'second_ressort/');
        }
        $lecteurs = [];
        foreach ($this->profil->college as $lecteur) {
            $lecteurs[(string) $lecteur->nom] = $this->pour('tagger', '/tags_' . $lecteur->nom . '_P1.json');
        }

        return ['etages' => $etages, 'etapes' => $etapes, 'second_ressort' => $second, 'lecteurs' => $lecteurs,
                'defaut' => $this->pour('', '')];
    }

    /**
     * The fingerprint of what in a run's settings changes a response the
     * memory keeps, and that the v9.8's own fingerprints leave out (ADR-011
     * §2): the call settings of the stages, steps and readers, the
     * truncations, the templates of the set (the merge's re-readings aside:
     * the memory does not keep them), and the referential the engine reads
     * (T16: its fiches, preambles, names, motif, label), lest the memory take
     * back a day judged against other fiches. A run without one — launched
     * before T16, its fiches in its set — keeps its fingerprint. A provider
     * named where it is inherited anyway leaves it (sansFournisseurHerite()).
     *
     * @param array<string, string> $gabarits the template set, by name
     * @param mixed $referentiel the referential in the engine's settings (ReferentielMoteur::bloc()), or null
     */
    public static function empreinte(stdClass $profil, mixed $troncatures, array $gabarits, mixed $referentiel = null): string
    {
        $reglages = self::sansFournisseurHerite($profil);
        $lecteurs = [];
        foreach ($reglages['college'] as $lecteur) {
            $lecteurs[(string) $lecteur->nom] = array_intersect_key((array) $lecteur, array_flip(self::CHAMPS));
        }
        ksort($gabarits, SORT_STRING);
        $jeu = hash_init('sha256');
        foreach ($gabarits as $nom => $contenu) {
            if (!str_starts_with((string) $nom, 'merge/')) {
                hash_update($jeu, $nom . "\0" . $contenu . "\0");
            }
        }

        $champs = ['etages' => $reglages['etages'], 'etapes' => $reglages['etapes'], 'lecteurs' => $lecteurs,
                   'troncatures' => $troncatures, 'gabarits' => hash_final($jeu)];
        if ($referentiel !== null) {
            $champs['referentiel'] = ReferentielMoteur::empreinte($referentiel);
        }

        return substr(hash('sha256', json_encode(self::canonique($champs),
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION)), 0, 16);
    }

    /**
     * The call settings of a profile as its fingerprints read them
     * (empreinte(), Evaluations::signature()): its stages, its steps and its
     * readers, without a provider that only repeats the one they inherit —
     * Anthropic for a stage, its stage's for a step, the readers' stage's for
     * a reader —, so that naming it changes nothing (ADR-012); a step left
     * without setting stays, an empty object. The second instance keeps the
     * provider it names: it spans steps of both stages, of several providers,
     * and no single one of them is what it inherits.
     *
     * @return array{etages: stdClass, etapes: stdClass, college: list<stdClass>} copies: the profile is left untouched
     */
    public static function sansFournisseurHerite(stdClass $profil): array
    {
        $herite = static fn (string $etage): mixed => $profil->etages->{$etage}->fournisseur ?? Fournisseurs::DEFAUT;
        $sans = static function (mixed $reglage, mixed $herite): void {
            if ($reglage instanceof stdClass && isset($reglage->fournisseur) && $reglage->fournisseur === $herite) {
                unset($reglage->fournisseur);
            }
        };
        $etages = self::copie($profil->etages);
        foreach ((array) $etages as $reglage) {
            $sans($reglage, Fournisseurs::DEFAUT);
        }
        $etapes = self::copie($profil->etapes ?? new stdClass());
        foreach ((array) $etapes as $etape => $reglage) {
            if ($etape !== 'second_ressort') {
                $sans($reglage, $herite(self::ETAGES[$etape] ?? 'profond'));
            }
        }
        $college = self::copie($profil->college ?? []);
        foreach ($college as $lecteur) {
            $sans($lecteur, $herite('lecteurs'));
        }

        return ['etages' => $etages, 'etapes' => $etapes, 'college' => $college];
    }

    /** A deep copy: a fingerprint's settings never share an object with the profile. */
    private static function copie(mixed $valeur): mixed
    {
        return unserialize(serialize($valeur));
    }

    /**
     * A call's settings, its provider Anthropic when none is set, its lane
     * the batches when its provider has them and the profile chose them.
     *
     * @param array<string, mixed> $reglage
     * @return array{fournisseur: string, voie: 'lots'|'directe', modele: string, budget_sortie: int,
     *               effort: string|null, reflexion: string}
     */
    private function reglage(array $reglage): array
    {
        $fournisseur = (string) ($reglage['fournisseur'] ?? Fournisseurs::DEFAUT);
        $parLots = (Fournisseurs::REGISTRE[$fournisseur]['lots'] ?? false) && ($this->profil->voie ?? null) === 'lots';

        return [
            'fournisseur' => $fournisseur,
            'voie' => $parLots ? 'lots' : 'directe',
            'modele' => (string) $reglage['modele'],
            'budget_sortie' => (int) $reglage['budget_sortie'],
            'effort' => isset($reglage['effort']) ? (string) $reglage['effort'] : null,
            'reflexion' => (string) $reglage['reflexion'],
        ];
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

    /** Objects' keys sorted, at every depth: the same settings, the same fingerprint (Evaluations' too). */
    public static function canonique(mixed $valeur): mixed
    {
        if ($valeur instanceof stdClass || (\is_array($valeur) && !array_is_list($valeur))) {
            $valeur = (array) $valeur;
            ksort($valeur, SORT_STRING);

            return (object) array_map(self::canonique(...), $valeur);
        }

        return \is_array($valeur) ? array_map(self::canonique(...), $valeur) : $valeur;
    }
}
