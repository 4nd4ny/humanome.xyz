<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Keys\KeyVault;
use Humanome\Referentiel\ReferentielRepository;
use PDO;
use stdClass;

/**
 * What a profile may choose on this instance (T13, docs/autorisations.md,
 * « Configuration Twin9 »): a published referential, a template set the
 * instance has, the personal key only where the administrator opened it,
 * models the instance prices (T10). The schema says what a profile is; this
 * says what its owner may pick.
 */
final class ProfilPolicy
{
    /** The template sets a profile may choose: the v9.8's, until T14 brings the promptologues' copies. */
    public const JEUX = ['v9.8'];

    public function __construct(private readonly PDO $pdo, private readonly Twin9Config $config)
    {
    }

    /** @throws Twin9Exception 422 naming the choice refused */
    public function admettre(stdClass $profil): void
    {
        if ($profil->cle === 'personnelle' && !$this->config->clePersoOuverte()) {
            throw new Twin9Exception('Profil refusé — /cle : les clés personnelles ne sont pas ouvertes sur cette instance',
                422);
        }
        if (!\in_array($profil->gabarits, self::JEUX, true)) {
            throw new Twin9Exception('Profil refusé — /gabarits : jeu de gabarits inconnu', 422);
        }
        $versions = (new ReferentielRepository($this->pdo))->publishedSemvers()[$profil->referentiel->id] ?? null;
        if ($versions === null) {
            throw new Twin9Exception('Profil refusé — /referentiel/id : aucun référentiel publié sous ce nom', 422);
        }
        if ($profil->referentiel->version !== null && !\in_array($profil->referentiel->version, $versions, true)) {
            throw new Twin9Exception('Profil refusé — /referentiel/version : version non publiée', 422);
        }
        // every call of a run is priced, its worst case held before it leaves (T10)
        $prix = $this->config->modeles();
        foreach ((new CallSettings($profil))->combinaisons() as $reglage) {
            if (!isset($prix[$reglage['modele']])) {
                throw new Twin9Exception('Profil refusé — ' . $reglage['modele'] . ' : aucun prix pour ce modèle sur '
                    . 'cette instance', 422);
            }
        }
    }

    /**
     * What the configuration page offers its user: the published
     * referentials and their versions, the template sets, the personal key.
     *
     * @return array{referentiels: list<array{id: string, versions: list<string>}>, gabarits: list<string>,
     *               cle_perso_ouverte: bool, cle_perso_enregistree: bool}
     */
    public function choix(int $userId): array
    {
        $referentiels = [];
        foreach ((new ReferentielRepository($this->pdo))->publishedSemvers() as $id => $versions) {
            $referentiels[] = ['id' => (string) $id, 'versions' => $versions];
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
            'gabarits' => self::JEUX,
            'cle_perso_ouverte' => $this->config->clePersoOuverte(),
            'cle_perso_enregistree' => $enregistree,
        ];
    }
}
