<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Twin9\Fournisseurs\Fournisseurs;
use stdClass;

/**
 * The v9.8's settings the engine reads, drawn from a run's profile (T9,
 * docs/contrats.md §7.1 and §8.1): the engine reads nothing else, and no
 * config.json. The effective config and roster are the v9.8's once its
 * options are applied: the profile's algorithm parameters under their
 * config.json names; the backends of the two stages, whose providers and
 * models are the stages' (the platform's CallSettings decides what each call
 * is sent with); the college's readers, each pass a reader of its own, as
 * twin9.py expands them (`_charger_roster`), each of its provider and of its
 * family, declared or its provider's (ADR-012); the options jours, rescan,
 * test and memoire; and the run's referential, drawn from the base (T16,
 * ReferentielMoteur). The engine reads a backend's kind and a reader's family
 * in its fingerprints, and the families for the college's diversity: an
 * Anthropic profile keeps « anthropic » for both.
 */
final class MoteurReglages
{
    /** The profile's parameters that are config.json's, under the same names (troncatures: the v9.8's code). */
    public const ALGORITHME = [
        'seuils_consensus', 'juge_leger', 'jury', 'premiere_impression', 'calques', 'merge', 'scan_global',
        'troncatures',
    ];

    /** The kind of a backend or a reader that names no provider: Anthropic's. */
    public const KIND = Fournisseurs::DEFAUT;

    /**
     * @param stdClass $profil a complete, valid profile (ProfilRepository::validate)
     * @param array<string, mixed>|null $referentiel the run's referential (ReferentielMoteur::bloc()); none: the
     *                                                engine reads RESPIRE from the pole files of the set
     * @return stdClass {config, roster, jours, rescan, test, memoire[, referentiel]}
     */
    public static function depuis(stdClass $profil, ?array $referentiel = null): stdClass
    {
        $config = new stdClass();
        foreach (self::ALGORITHME as $cle) {
            $config->{$cle} = self::copie($profil->{$cle});
        }
        // execution settings: they change no prompt
        $config->max_workers = $profil->parallelisme->appels_directs;
        $config->parallel_jures = true;
        // the deep analysis (tribunal, second instance, rereadings, Arpenteur) and the quick one
        $config->backend_tribunal = (object) ['kind' => self::kind($profil->etages->profond),
                                              'model' => $profil->etages->profond->modele,
                                              'model_mini' => $profil->etages->rapide->modele];
        $config->backend_rapide = (object) ['kind' => self::kind($profil->etages->rapide),
                                            'model' => $profil->etages->rapide->modele];

        $moteur = (object) [
            'config' => $config,
            'roster' => self::roster($profil),
            'jours' => $profil->jours,
            'rescan' => $profil->rescan,
            'test' => $profil->mode === 'test',
            'memoire' => $profil->memoire,
        ];
        if ($referentiel !== null) {
            $moteur->referentiel = $referentiel;
        }

        return $moteur;
    }

    /**
     * The college as the v9.8 expands it: a reader of several passes sits
     * once per pass (« haiku#1 », « haiku#2 »…), each pass decorrelated by its
     * seed and its salt.
     *
     * @return list<stdClass>
     */
    private static function roster(stdClass $profil): array
    {
        $roster = [];
        $reglages = new CallSettings($profil);
        foreach ($profil->college as $lecteur) {
            $reglage = $reglages->pour('tagger', self::appel($lecteur));
            $entree = [
                'name' => $lecteur->nom,
                'kind' => $reglage['fournisseur'],
                'model' => $lecteur->modele ?? $profil->etages->lecteurs->modele,
                'family' => self::famille($profil, $lecteur),
                'weight' => (float) $lecteur->poids,
                'enabled' => true,
            ];
            $passes = (int) $lecteur->passes;
            if ($passes <= 1) {
                $roster[] = (object) $entree;
                continue;
            }
            for ($k = 1; $k <= $passes; $k++) {
                $roster[] = (object) ([...$entree, 'name' => $lecteur->nom . '#' . $k, 'passe' => $k,
                                       'seed' => self::seed($lecteur->nom . '|passe' . $k), 'salt' => '|passe' . $k]);
            }
        }

        return $roster;
    }

    /**
     * A reader's family: the one its profile declares, else its provider's
     * (Fournisseurs::familleDefaut(): OpenRouter's vendor), never null — the
     * engine sorts the families.
     */
    public static function famille(stdClass $profil, stdClass $lecteur): string
    {
        if (isset($lecteur->famille)) {
            return (string) $lecteur->famille;
        }
        $reglage = (new CallSettings($profil))->pour('tagger', self::appel($lecteur));

        return Fournisseurs::familleDefaut($reglage['fournisseur'], $reglage['modele']);
    }

    /** A stage's provider, Anthropic when it names none. */
    private static function kind(stdClass $etage): string
    {
        return (string) ($etage->fournisseur ?? self::KIND);
    }

    /** The id of a reading call of a reader, as CallSettings reads it back: its first pole. */
    private static function appel(stdClass $lecteur): string
    {
        return '/tags_' . $lecteur->nom . '_P1.json';
    }

    /** stable_hash(s) % (2**31 - 1), as twin9.py seeds a pass: the first 12 hex digits of the MD5. */
    private static function seed(string $s): int
    {
        return (int) hexdec(substr(md5($s), 0, 12)) % (2 ** 31 - 1);
    }

    /** A deep copy: the run's settings never share an object with its profile. */
    private static function copie(mixed $valeur): mixed
    {
        return $valeur instanceof stdClass || \is_array($valeur) ? unserialize(serialize($valeur)) : $valeur;
    }
}
