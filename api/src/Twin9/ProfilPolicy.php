<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Auth\Users;
use Humanome\Keys\KeyVault;
use Humanome\Referentiel\ReferentielRepository;
use Humanome\Twin9\Fournisseurs\Fournisseurs;
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
 * at its launch), and what a launch asks besides: providers the instance
 * opened (admettreAuLancement()). A profile may name a provider not open yet:
 * it is saved, not launched. The default profile, the v9.8's, takes the
 * instance's default set.
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
     * @param int $userId the profile's owner, whose template sets it may choose
     * @throws Twin9Exception 422 naming the choice refused
     */
    public function admettre(stdClass $profil, int $userId): void
    {
        if ($profil->cle === 'personnelle' && !$this->config->clePersoOuverte()) {
            throw new Twin9Exception('Profil refusé — /cle : les clés personnelles ne sont pas ouvertes sur cette instance',
                422);
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
     * What a launch asks beyond admettre() (ADR-012): every provider the
     * run's calls may reach is open on this instance (Twin9Config:
     * twin9_fournisseurs_ouverts, and twin9_fournisseurs_non_rgpd for a
     * provider tagged « non »).
     *
     * @throws Twin9Exception 422 naming the step and the provider
     */
    public function admettreAuLancement(stdClass $profil): void
    {
        $actifs = $this->config->fournisseursActifs();
        foreach ((new CallSettings($profil))->parEtape() as $etape => $reglage) {
            if (!\in_array($reglage['fournisseur'], $actifs, true)) {
                throw new Twin9Exception('Profil refusé — ' . $etape . ' : le fournisseur '
                    . self::libelle($reglage['fournisseur']) . ' n’est pas encore ouvert sur cette instance', 422);
            }
        }
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
     * (T15), the template sets they may choose, the personal key.
     *
     * @return array{referentiels: list<array{id: string, versions: list<string>, brouillons: list<string>}>,
     *               gabarits: list<string>, cle_perso_ouverte: bool, cle_perso_enregistree: bool}
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

        return [
            'referentiels' => $referentiels,
            'gabarits' => (new TemplateSets($this->pdo))->pour($userId),
            'cle_perso_ouverte' => $this->config->clePersoOuverte(),
            'cle_perso_enregistree' => $enregistree,
        ];
    }
}
