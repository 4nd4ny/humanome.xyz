<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Twin9\Fournisseurs\Fournisseurs;
use stdClass;

/**
 * A Twin9 run's configuration block (P0-1, docs/contrats.md §8.9): what it
 * was launched with, built once at launch and never changed after — a
 * resumption included (twin9_runs.configuration, migration 031).
 *
 * Its fingerprint covers a salt drawn at launch, which only its owner
 * reads: a cartographe they linked reads the fingerprint without what the
 * block hides from them (the prices, the key, the caps), and without the
 * salt could find those again by trying candidates — they are few.
 *
 * A whitelist, field by field: the engine's versions; the profile, its
 * settings' fingerprint and its evaluations' signature; how it was to run
 * (the lane of Anthropic's calls, the key, the parallelism, the caps, the
 * days the admission took); the providers its calls reach, with their GDPR
 * tag and lane; each call's settings as it is sent (CallSettings::resume());
 * the college, the backends, the algorithm's parameters; the referential and
 * the template set by id, version and fingerprint; the prices as billed (the
 * margin included with the instance's key), for the models its calls use.
 * Never the referential's block (its fiches, its preambles), a template, a
 * key, the margin nor a list price.
 *
 * Pure: the engine's versions come from the caller, read under their guards
 * (Lancement), as the price grid and its reading do.
 */
final class RunConfiguration
{
    /** The block's schema, which a change of its shape changes (schemas/twin9-run.schema.json). */
    public const SCHEMA = 'twin9-configuration/1';

    /** The salt of a block: 16 random bytes, in hex, drawn by the caller at launch (Lancement). */
    public const SEL = '/^[0-9a-f]{32}$/';

    /** The share of the price a call in a batch costs (the Message Batches API's, T8). */
    public const REMISE_LOTS = 0.5;

    private const JSON = JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION;

    /**
     * @param stdClass $profil the run's copy of its profile, admitted (Lancement)
     * @param int|null $profilId its profile's id; null for the default one, the v9.8's
     * @param string $nom its profile's name
     * @param stdClass $moteur the engine's settings the run reads (MoteurReglages::depuis()), its days as the
     *                         admission left them
     * @param array{gabarits: array<string, string>, versions: array<string, int>} $jeu its template set: only its
     *        versions and its fingerprint are kept
     * @param array<string, mixed> $referentiel the referential the engine reads (ReferentielMoteur::bloc()): only its
     *        label and its fingerprint are kept
     * @param string $empreinteReglages CallSettings::empreinte() of the run, as its platform was built with it
     * @param array<string, mixed> $grille the Twin9 configuration (Twin9Config::read()): its prices and its margin
     * @param array<string, mixed>|null $releve the last reading of Anthropic's prices (TarifsAnthropic::etat())
     * @param array{commit?: string|null, protocole?: string|null, personas?: array{version: string, empreinte: string}|null,
     *              scan?: string|null} $versions the engine's, read by the caller; null when the engine has none
     * @param string $sel the block's salt (SEL), drawn by the caller: bin2hex(random_bytes(16))
     * @return array<string, mixed>
     */
    public static function depuis(stdClass $profil, ?int $profilId, string $nom, stdClass $moteur, array $jeu,
                                  array $referentiel, string $empreinteReglages, array $grille, ?array $releve,
                                  array $versions, \DateTimeImmutable $horloge, string $sel): array
    {
        if (preg_match(self::SEL, $sel) !== 1) {
            throw new \InvalidArgumentException('Sel de configuration invalide');
        }
        $reglages = new CallSettings($profil);
        $combinaisons = $reglages->combinaisons();
        $empreinteJeu = Lancement::empreinte($jeu['gabarits']);
        $empreinteReferentiel = ReferentielMoteur::empreinte($referentiel);

        // the providers its calls reach, each with its lane: both lanes, « mixte »
        $voies = [];
        foreach ($combinaisons as $c) {
            $voies[$c['fournisseur']][$c['voie']] = true;
        }
        ksort($voies, SORT_STRING);
        $fournisseurs = [];
        foreach ($voies as $fournisseur => $lesVoies) {
            $fournisseurs[$fournisseur] = [
                'libelle' => (string) (Fournisseurs::REGISTRE[$fournisseur]['libelle'] ?? $fournisseur),
                'rgpd' => Fournisseurs::REGISTRE[$fournisseur]['rgpd'] ?? null,
                'voie' => \count($lesVoies) === 1 ? (string) array_key_first($lesVoies) : 'mixte',
            ];
        }

        $college = [];
        foreach ($profil->college as $lecteur) {
            $college[] = ['nom' => (string) $lecteur->nom, 'famille' => (string) $lecteur->famille,
                          'passes' => (int) $lecteur->passes, 'poids' => (float) $lecteur->poids];
        }
        $backend = static fn (mixed $b): array => array_intersect_key((array) $b, ['kind' => 0, 'model' => 0,
                                                                                    'model_mini' => 0]);
        $algorithme = [];
        foreach (MoteurReglages::ALGORITHME as $cle) {
            $algorithme[$cle] = self::copie($moteur->config->{$cle} ?? null);
        }
        $versionsJeu = $jeu['versions'];
        ksort($versionsJeu, SORT_STRING);

        $versionPersonas = $versions['personas'] ?? null;
        $bloc = [
            'schema' => self::SCHEMA,
            'empreinte' => '',
            'sel' => $sel,
            'lance_at' => $horloge->format('Y-m-d H:i:s'),
            'moteur' => [
                'commit' => self::texte($versions['commit'] ?? null),
                'protocole' => self::texte($versions['protocole'] ?? null),
                'personas' => \is_array($versionPersonas)
                    ? ['version' => (string) ($versionPersonas['version'] ?? ''),
                       'empreinte' => (string) ($versionPersonas['empreinte'] ?? '')]
                    : null,
                'scan' => self::texte($versions['scan'] ?? null),
            ],
            'profil' => [
                'id' => $profilId,
                'nom' => $nom,
                'mode' => (string) $profil->mode,
                'empreinte_reglages' => $empreinteReglages,
                'signature_evaluations' => Evaluations::signature($profil, $empreinteJeu, $empreinteReferentiel),
            ],
            'execution_prevue' => [
                'voie_anthropic' => (string) $profil->voie,
                'cle' => (string) $profil->cle,
                'parallelisme' => ['appels_directs' => (int) $profil->parallelisme->appels_directs,
                                   'journees' => (int) $profil->parallelisme->journees],
                'plafonds' => ['budget_usd' => $profil->budget_usd ?? null,
                               'duree_minutes' => $profil->duree_minutes ?? null],
                // the days the engine reads: those its admission took (T8)
                'jours' => isset($moteur->jours) ? (int) $moteur->jours : null,
                'rescan' => (bool) ($moteur->rescan ?? false),
                'memoire' => (bool) ($moteur->memoire ?? true),
            ],
            'fournisseurs' => (object) $fournisseurs,
            'appels' => self::tables($reglages->resume()),
            'college' => $college,
            'backends' => ['tribunal' => (object) $backend($moteur->config->backend_tribunal ?? null),
                           'rapide' => (object) $backend($moteur->config->backend_rapide ?? null)],
            'algorithme' => $algorithme,
            'referentiel' => ['id' => (string) $profil->referentiel->id,
                              'version' => (string) $profil->referentiel->version,
                              'label' => (string) ($referentiel['label'] ?? ''),
                              'empreinte' => $empreinteReferentiel],
            'gabarits' => ['jeu' => (string) $profil->gabarits, 'versions' => (object) $versionsJeu,
                           'empreinte' => $empreinteJeu],
            'prix' => [
                'base' => 'facture',
                'unite' => 'USD/MTok',
                'remise_lots' => self::REMISE_LOTS,
                'releve' => $releve === null ? null : ['jour' => self::texte($releve['jour'] ?? null),
                                                       'statut' => self::texte($releve['statut'] ?? null),
                                                       'source' => self::texte($releve['source'] ?? null)],
                'grille' => (object) self::grille($combinaisons, $grille, $profil->cle === 'instance'),
            ],
        ];
        $bloc['empreinte'] = self::empreinte($bloc);

        return $bloc;
    }

    /**
     * The block's fingerprint: of all of it but its fingerprint and its
     * launch's date — its salt included —, keys sorted at every depth, its
     * numbers as written (1.0 stays a float) — the same when read again from
     * what the run keeps.
     *
     * @param array<string, mixed>|stdClass $bloc
     */
    public static function empreinte(array|stdClass $bloc): string
    {
        $bloc = (array) $bloc;
        unset($bloc['empreinte'], $bloc['lance_at']);

        return substr(hash('sha256', json_encode(CallSettings::canonique($bloc), self::JSON)), 0, 16);
    }

    /**
     * The block as a cartographe the run's owner linked reads it (its
     * results, visibility « cartographe »): without what its owner pays nor
     * how — the prices, the caps, the key —, nor its salt, without which its
     * fingerprint, the same as its owner's, tells nothing of them.
     */
    public static function pourCartographe(stdClass $bloc): stdClass
    {
        $copie = self::copie($bloc);
        unset($copie->prix, $copie->sel);
        if (($copie->execution_prevue ?? null) instanceof stdClass) {
            unset($copie->execution_prevue->plafonds, $copie->execution_prevue->cle);
        }

        return $copie;
    }

    /**
     * The prices of the models its calls use, as its owner is billed: the
     * list price times the margin with the instance's key, the list price
     * with their own; a long prompt's tier with its own.
     *
     * @param list<array{fournisseur: string, modele: string}> $combinaisons
     * @param array<string, mixed> $grille
     * @return array<string, array<string, mixed>>
     */
    private static function grille(array $combinaisons, array $grille, bool $instance): array
    {
        $facteur = $instance ? (float) ($grille['marge'] ?? 1.0) : 1.0;
        $facture = static fn (array $mtok): array => ['entree' => round((float) $mtok[0] * $facteur, 6),
                                                      'sortie' => round((float) $mtok[1] * $facteur, 6)];
        $prix = [];
        foreach ($combinaisons as $c) {
            $cle = Fournisseurs::clePrix($c['fournisseur'], $c['modele']);
            $modele = $grille['modeles'][$cle] ?? null;
            if (isset($prix[$cle]) || !\is_array($modele) || !\is_array($modele['prix_usd_mtok'] ?? null)) {
                continue;
            }
            $entree = $facture($modele['prix_usd_mtok']);
            $palier = $modele['palier_long'] ?? null;
            if (\is_array($palier) && \is_array($palier['prix_usd_mtok'] ?? null)) {
                $entree['palier_long'] = ['au_dela_de' => (int) $palier['au_dela_de']] + $facture($palier['prix_usd_mtok']);
            }
            $prix[$cle] = $entree;
        }
        ksort($prix, SORT_STRING);

        return $prix;
    }

    /**
     * The call settings' tables as JSON objects, whatever their keys: a
     * reader named « 0 » (the profile's pattern admits it) would otherwise
     * make the readers a list, `[…]`, which the contract refuses — the
     * block, the account's archive and the map's importer with it.
     * CallSettings::empreinte() keeps its own: it is the memory's.
     *
     * @param array<string, mixed> $appels CallSettings::resume()
     * @return array<string, mixed>
     */
    private static function tables(array $appels): array
    {
        foreach (['etages', 'etapes', 'second_ressort', 'lecteurs'] as $table) {
            $appels[$table] = (object) $appels[$table];
        }

        return $appels;
    }

    private static function texte(mixed $valeur): ?string
    {
        return \is_string($valeur) && $valeur !== '' ? $valeur : null;
    }

    /** A deep copy, its objects objects: an empty one stays {}. */
    private static function copie(mixed $valeur): mixed
    {
        return $valeur instanceof stdClass || \is_array($valeur)
            ? json_decode(json_encode($valeur, self::JSON), false, 512, JSON_THROW_ON_ERROR) : $valeur;
    }
}
