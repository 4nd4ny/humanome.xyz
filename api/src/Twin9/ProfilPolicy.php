<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Auth\Users;
use Humanome\Env;
use Humanome\Keys\KeyVault;
use Humanome\Referentiel\ReferentielRepository;
use Humanome\Twin9\Fournisseurs\Fournisseurs;
use Humanome\Worker\Tick;
use Humanome\Worker\Twin9Slice;
use PDO;
use stdClass;

/**
 * What a profile may choose on this instance (T13, docs/autorisations.md,
 * « Configuration Twin9 »): a published referential, or a draft of its
 * owner's for a test run (T15: a draft serves only its author's test runs,
 * while they author drafts — AUTEURS), a template set its owner may choose
 * (T14: the v9.8's, the instance's default, a copy of theirs while they
 * belong to the atelier — TemplateSets::pour), the personal key only where
 * the administrator opened it and only for Anthropic (ADR-012), the
 * Anthropic models the instance prices (T10). The schema says what a profile
 * is; this says what its owner may pick (admettre(), at its registration and
 * at its launch), and what a launch — or a resumption — asks besides
 * (admettreAuLancement()): every provider its calls reach open on the
 * instance, with its instance key, and another provider's model priced with
 * its caps. A profile may name a provider not open yet: it is saved, not
 * launched. The default profile, the v9.8's, takes the instance's default
 * set, as the presets do (ProfilRepository::PREDEFINIS). The greffier's
 * stigmergy refuses the archived layers in the consensus (Twin_v9's
 * docs/twin9/spec-stigmergie.md, Q3): they vote there already, its traces
 * would count twice.
 */
final class ProfilPolicy
{
    /** Who writes a referential's drafts, and so may run their own in test mode (T15): the guard of the drafts. */
    public const AUTEURS = ['epistemiarque', 'admin'];

    public function __construct(private readonly PDO $pdo, private readonly Twin9Config $config)
    {
    }

    /** The default profile: the v9.8's, with the instance's default template set (T14). */
    public function defaut(): stdClass
    {
        $profil = ProfilRepository::v98();
        $profil->gabarits = (new TemplateSets($this->pdo))->defaut();

        return $profil;
    }

    /**
     * The presets (ProfilRepository::PREDEFINIS), each with the instance's
     * default template set, as the default profile: what a new profile
     * copies.
     *
     * @return list<array{id: string, nom: string, profil: stdClass}>
     */
    public function predefinis(): array
    {
        $defaut = (new TemplateSets($this->pdo))->defaut();
        $predefinis = [];
        foreach (ProfilRepository::PREDEFINIS as $id => $nom) {
            $profil = ProfilRepository::predefini($id);
            $profil->gabarits = $defaut;
            $predefinis[] = ['id' => $id, 'nom' => $nom, 'profil' => $profil];
        }

        return $predefinis;
    }

    /**
     * @param int $userId the profile's owner, whose template sets it may choose
     * @throws Twin9Exception 422 naming the choice refused
     */
    public function admettre(stdClass $profil, int $userId): void
    {
        if ($profil->cle === 'personnelle' && !$this->config->clePersoOuverte()) {
            throw new Twin9Exception('Profil refusé — /cle : les clés personnelles ne sont pas ouvertes sur cette instance',
                422);
        }
        // the archived layers vote at the consensus already: the stigmergy's traces would count twice (Q3)
        if (MoteurReglages::stigmergie($profil) && ($profil->calques->accumulation ?? true) !== false) {
            throw new Twin9Exception('Profil refusé — /stigmergie : la stigmergie demande calques.accumulation à false ; '
                . 'les calques archivés votent déjà au consensus, ses traces y compteraient deux fois', 422);
        }
        $combinaisons = (new CallSettings($profil))->combinaisons();
        // the holder of a key reads what is sent with it: a third party gets the platform's prompts with the
        // instance's key only (ADR-012)
        if ($profil->cle === 'personnelle') {
            foreach ($combinaisons as $reglage) {
                if ($reglage['fournisseur'] !== Fournisseurs::DEFAUT) {
                    throw new Twin9Exception('Profil refusé — /cle : la clé personnelle ne sert que chez Anthropic ; un '
                        . 'profil qui appelle ' . self::libelle($reglage['fournisseur']) . ' ne part qu’avec les clés '
                        . 'de l’instance', 422);
                }
            }
        }
        // a set no longer offered (a former default, a copy out of the atelier) refuses its profile, as a
        // closed personal key does: the profile keeps it until its owner chooses another
        if (!\in_array($profil->gabarits, (new TemplateSets($this->pdo))->pour($userId), true)) {
            throw new Twin9Exception('Profil refusé — /gabarits : ce jeu de gabarits ne vous est pas proposé', 422);
        }
        $this->admettreReferentiel($profil, $userId);
        // every call of a run is priced, its worst case held before it leaves (T10); another provider's prices are
        // a launch's matter, as its opening is
        $prix = $this->config->modeles();
        foreach ($combinaisons as $reglage) {
            if ($reglage['fournisseur'] === Fournisseurs::DEFAUT && !isset($prix[$reglage['modele']])) {
                throw new Twin9Exception('Profil refusé — ' . $reglage['modele'] . ' : aucun prix pour ce modèle sur '
                    . 'cette instance', 422);
            }
        }
    }

    /**
     * What a launch, or a resumption, asks beyond admettre() (ADR-012,
     * P1-5), for each provider the run's calls reach (CallSettings::
     * atteints()): it is available — open on this instance
     * (twin9_fournisseurs_ouverts, and twin9_fournisseurs_non_rgpd for a
     * provider tagged « non ») and, for another provider than Anthropic,
     * with its instance key —, one message for both, so that nobody learns
     * which keys the instance holds; Anthropic's own key is read as each
     * call leaves, never asked here. Another provider's model has its price
     * and its caps in the grid, a worst case not marked insufficient
     * (Twin9Config::pireCasInsuffisants()), an output budget within its
     * plafond_sortie,
     * and a longest call (duree_max_s) that the shortest slice of this
     * instance leaves room for at its head (dureeAdmise()).
     *
     * @throws Twin9Exception 422 naming the step and the provider, or the model
     */
    public function admettreAuLancement(stdClass $profil): void
    {
        $grille = $this->config->read();
        $actifs = Fournisseurs::actifs($grille);
        $insuffisants = $this->config->pireCasInsuffisants();
        // what the shortest slice of this instance leaves a third party's call at its head: the slice's own rule
        $admise = self::dureeAdmise($this->config);
        foreach ((new CallSettings($profil))->atteints() as $etape => $reglage) {
            $fournisseur = $reglage['fournisseur'];
            if (!\in_array($fournisseur, $actifs, true) || !$this->disponible($fournisseur)) {
                throw new Twin9Exception('Profil refusé — ' . $etape . ' : le fournisseur '
                    . self::libelle($fournisseur) . ' n’est pas disponible sur cette instance', 422);
            }
            if ($fournisseur === Fournisseurs::DEFAUT) {
                continue;
            }
            $cle = Fournisseurs::clePrix($fournisseur, $reglage['modele']);
            $entree = $grille['modeles'][$cle] ?? null;
            if (!\is_array($entree) || RunCosts::pireCasDe($grille, $fournisseur, $reglage['modele'], 1,
                    $reglage['budget_sortie'], false, false) === null) {
                throw new Twin9Exception('Profil refusé — ' . $etape . ' : aucun prix pour ' . $cle
                    . ' sur cette instance', 422);
            }
            if (isset($insuffisants[$cle])) {
                // a call of it cost more than its reserve, which the instance paid: its caps first (ADR-012 §6)
                throw new Twin9Exception('Profil refusé — ' . $etape . ' : le pire cas de ' . $cle . ' s’est révélé '
                    . 'insuffisant (un appel a coûté plus que sa réserve) : ses plafonds sont à revoir dans la grille '
                    . 'de l’instance', 422);
            }
            if ($reglage['budget_sortie'] > (int) ($entree['plafond_sortie'] ?? 0)) {
                throw new Twin9Exception('Profil refusé — ' . $etape . ' : un budget de sortie de '
                    . $reglage['budget_sortie'] . ' jetons dépasse le plafond de ' . $cle . ' ('
                    . (int) ($entree['plafond_sortie'] ?? 0) . ')', 422);
            }
            // a call leaves only if it may end within the slice (Twin9Slice): longer than a slice leaves it, never
            $duree = (int) ($entree['duree_max_s'] ?? Twin9Slice::DUREE_MAX);
            if ($duree > $admise) {
                throw new Twin9Exception('Profil refusé — ' . $etape . ' : un appel à ' . $cle . ' peut durer '
                    . $duree . ' s, plus que ne lui en laisse une tranche de cette instance ('
                    . (int) floor($admise) . ' s)', 422);
            }
        }
    }

    /**
     * What the shortest slice this instance serves (Twin9Config::
     * secondesServies(): its own, or its trigger's if shorter) leaves a third
     * party's call at its head, in seconds: the slice's own rule
     * (Twin9Slice::dureeAdmise(), Tick::longueurTwin9()) — 35.1 s for 40 s,
     * 21.6 s for the 25 s of cron-job.org.
     */
    public static function dureeAdmise(Twin9Config $config): float
    {
        return Twin9Slice::dureeAdmise(Tick::longueurTwin9($config->secondesServies()));
    }

    /**
     * Whether a provider open on this instance may serve a run: Anthropic
     * always (its key is read as each call leaves, a missing one makes the
     * run wait); another provider with its instance key only (a personal
     * key never leaves Anthropic).
     */
    private function disponible(string $fournisseur): bool
    {
        return $fournisseur === Fournisseurs::DEFAUT
            || Env::get((string) Fournisseurs::REGISTRE[$fournisseur]['env']) !== '';
    }

    private static function libelle(string $fournisseur): string
    {
        return (string) (Fournisseurs::REGISTRE[$fournisseur]['libelle'] ?? $fournisseur);
    }

    /**
     * A published version of the referential, its latest when the profile
     * names none; or a draft (or a proposal under vote) of its owner's, for
     * a test run, while they author drafts (T15).
     *
     * @throws Twin9Exception 422 naming the choice refused
     */
    private function admettreReferentiel(stdClass $profil, int $userId): void
    {
        $repo = new ReferentielRepository($this->pdo);
        $id = (string) $profil->referentiel->id;
        $version = $profil->referentiel->version;
        $publiees = $repo->publishedSemvers()[$id] ?? null;
        if ($version !== null && ($publiees === null || !\in_array($version, $publiees, true))) {
            $brouillon = $repo->findVersion($id, (string) $version);
            if ($brouillon !== null && $brouillon['status'] !== 'published') {
                if ($brouillon['createdBy'] !== $userId || $profil->mode !== 'test' || !$this->auteur($userId)) {
                    throw new Twin9Exception('Profil refusé — /referentiel/version : un brouillon ne sert qu’aux runs '
                        . 'd’essai de son auteur', 422);
                }
                return;
            }
        }
        if ($publiees === null) {
            throw new Twin9Exception('Profil refusé — /referentiel/id : aucun référentiel publié sous ce nom', 422);
        }
        if ($version !== null && !\in_array($version, $publiees, true)) {
            throw new Twin9Exception('Profil refusé — /referentiel/version : version non publiée', 422);
        }
    }

    /** Whether the user writes drafts of a referential (T15). */
    private function auteur(int $userId): bool
    {
        return array_intersect(self::AUTEURS, Users::rolesOf($this->pdo, $userId)) !== [];
    }

    /**
     * What the configuration page offers its user: the published
     * referentials and their versions, their own drafts for a test run
     * (T15), the template sets they may choose, the personal key, and each
     * provider with its GDPR tag and whether a run may reach it now — one
     * boolean, never why (closed, or its instance key missing: nobody
     * learns which keys the instance holds).
     *
     * @return array{referentiels: list<array{id: string, versions: list<string>, brouillons: list<string>}>,
     *               gabarits: list<string>, cle_perso_ouverte: bool, cle_perso_enregistree: bool,
     *               fournisseurs: list<array{id: string, libelle: string, rgpd: string, disponible: bool}>}
     */
    public function choix(int $userId): array
    {
        $repo = new ReferentielRepository($this->pdo);
        $brouillons = $this->auteur($userId) ? $repo->brouillonsDe($userId) : [];
        $referentiels = [];
        foreach ($repo->publishedSemvers() as $id => $versions) {
            $referentiels[] = ['id' => (string) $id, 'versions' => $versions, 'brouillons' => $brouillons[$id] ?? []];
            unset($brouillons[$id]);
        }
        // a referential with drafts only, never published: its author's test runs read it
        foreach ($brouillons as $id => $semvers) {
            $referentiels[] = ['id' => (string) $id, 'versions' => [], 'brouillons' => $semvers];
        }
        $enregistree = false;
        $master = KeyVault::masterKeyFromEnv();
        if ($master !== null) {
            foreach ((new KeyVault($this->pdo, $master))->listForUser($userId) as $cle) {
                $enregistree = $enregistree || $cle['provider'] === 'anthropic';
            }
        }

        $actifs = $this->config->fournisseursActifs();
        $fournisseurs = [];
        foreach (Fournisseurs::REGISTRE as $id => $registre) {
            $fournisseurs[] = ['id' => $id, 'libelle' => (string) $registre['libelle'], 'rgpd' => (string) $registre['rgpd'],
                               'disponible' => \in_array($id, $actifs, true) && $this->disponible($id)];
        }

        return [
            'referentiels' => $referentiels,
            'gabarits' => (new TemplateSets($this->pdo))->pour($userId),
            'cle_perso_ouverte' => $this->config->clePersoOuverte(),
            'cle_perso_enregistree' => $enregistree,
            'fournisseurs' => $fournisseurs,
        ];
    }
}
