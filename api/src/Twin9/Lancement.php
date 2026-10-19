<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Referentiel\ReferentielRepository;
use PDO;
use stdClass;

/**
 * Launching a Twin9 run from the platform (T9, Twin_v9's docs/plan-twin9-php.md,
 * lot 2, « Lancer et suivre »): its owner from the session; a profile of theirs,
 * or the v9.8's, valid and admitted again, copied into the run with its
 * referential's version frozen; the engine's settings drawn from that copy
 * (MoteurReglages), never from a config.json; the live template set, as the
 * run's snapshot; the portfolio its owner sends; their consent to keep it,
 * and the run's state, on the server until they erase them (ADR-011 §5). The
 * attestation keeps what the run was launched with: its profile, the
 * versions of its template set, its referential, the engine's commit.
 */
final class Lancement
{
    /** Who reads a run's results besides its owner: no one, or the cartographes they linked. */
    public const VISIBILITES = ['privee', 'cartographe'];

    /** A portfolio's size, at most: the run keeps it, compressed, in a MEDIUMBLOB. */
    public const PORTFOLIO_OCTETS = 2_000_000;

    /** The JSON of the engine's settings: 1.0 stays a float, as the v9.8 reads it. */
    private const JSON = JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION;

    public function __construct(private readonly PDO $pdo, private readonly Twin9Config $config)
    {
    }

    /**
     * @param int|null $profilId a profile of its owner's; null: the v9.8's
     * @param string $portfolioNom the portfolio's file name: its stem names the journal, and the map
     * @param bool $accord the owner's consent, which every launch asks
     * @return int the run
     * @throws Twin9Exception 422 naming what is refused, 404 for another's profile, 503 without the engine
     */
    public function lancer(int $userId, ?int $profilId, string $portfolioNom, string $portfolio, bool $accord,
                           string $visibilite = 'privee', ?\DateTimeImmutable $maintenant = null): int
    {
        if (!$accord) {
            throw new Twin9Exception('Accord requis : votre portfolio et l’état du run restent sur le serveur '
                . 'jusqu’à ce que vous les effaciez', 422);
        }
        if (!\in_array($visibilite, self::VISIBILITES, true)) {
            throw new Twin9Exception('Visibilité inconnue : privee ou cartographe', 422);
        }
        $portfolioNom = trim($portfolioNom);
        if ($portfolioNom === '' || \strlen($portfolioNom) > 255 || preg_match('#[/\\\\\x00-\x1f]#', $portfolioNom) === 1) {
            throw new Twin9Exception('Nom de portfolio invalide', 422);
        }
        if (trim($portfolio) === '' || \strlen($portfolio) > self::PORTFOLIO_OCTETS || !mb_check_encoding($portfolio, 'UTF-8')) {
            throw new Twin9Exception('Portfolio invalide : un texte UTF-8 non vide, de 2 Mo au plus', 422);
        }
        if (!EngineLoader::isLoaded() || !class_exists(\Twin9\Plateforme::class)) {
            throw new Twin9Exception('L’analyse approfondie n’est pas disponible sur cette instance', 503);
        }

        [$profil, $nom] = $this->profil($userId, $profilId);
        $politique = new ProfilPolicy($this->pdo, $this->config);
        $politique->admettre($profil);
        if ($profil->cle === 'personnelle' && !$politique->choix($userId)['cle_perso_enregistree']) {
            throw new Twin9Exception('Profil refusé — /cle : aucune clé Anthropic personnelle n’est enregistrée', 422);
        }
        // the referential's version, frozen in the run's copy of its profile
        $profil->referentiel->version ??= (new ReferentielRepository($this->pdo))
            ->publishedSemvers()[$profil->referentiel->id][0];

        $jeu = (new ProtocoleRepository($this->pdo))->jeu();
        if ($jeu['gabarits'] === []) {
            throw new Twin9Exception('Aucun gabarit sur cette instance : l’analyse approfondie ne peut partir', 503);
        }
        $moteur = MoteurReglages::depuis($profil);
        $horloge = $maintenant ?? new \DateTimeImmutable();
        $sortie = 'twin9/runs/' . bin2hex(random_bytes(8));
        try {
            $journal = (new \Twin9\Plateforme(json_encode($moteur, self::JSON), $portfolioNom, $portfolio,
                $jeu['gabarits'], $sortie, $horloge))->journal();
        } catch (\InvalidArgumentException|\RuntimeException $e) {
            error_log('[twin9-lancement] ' . $e->getMessage());
            throw new Twin9Exception('Portfolio illisible par le moteur', 422);
        }

        $runs = new RunRepository($this->pdo);
        $id = $runs->creer($userId, $profil, $moteur, $portfolioNom, $portfolio, $journal, $jeu['gabarits'], $horloge,
            $sortie);
        $runs->attester($id, [
            'profil' => ['id' => $profilId, 'nom' => $nom],
            'gabarits' => ['jeu' => $profil->gabarits, 'versions' => $jeu['versions'],
                           'empreinte' => self::empreinte($jeu['gabarits'])],
            'referentiel' => ['id' => $profil->referentiel->id, 'version' => $profil->referentiel->version],
            'moteur' => ['commit' => EngineLoader::commit()],
        ], $visibilite, $horloge);

        return $id;
    }

    /**
     * The profile a run copies, valid under today's rules: its owner's, or the v9.8's.
     *
     * @return array{0: stdClass, 1: string} the profile and its name
     */
    private function profil(int $userId, ?int $profilId): array
    {
        if ($profilId === null) {
            return [ProfilRepository::validate(ProfilRepository::v98()), 'Profil v9.8'];
        }
        $ligne = (new ProfilRepository($this->pdo))->get($profilId);
        if ($ligne === null || $ligne['user_id'] !== $userId) {
            throw new Twin9Exception('Profil introuvable', 404);
        }

        return [ProfilRepository::validate($ligne['profil']), $ligne['nom']];
    }

    /** The template set's fingerprint: each name and content, in name order. */
    private static function empreinte(array $gabarits): string
    {
        ksort($gabarits, SORT_STRING);
        $contexte = hash_init('sha256');
        foreach ($gabarits as $nom => $contenu) {
            hash_update($contexte, $nom . "\0" . $contenu . "\0");
        }

        return substr(hash_final($contexte), 0, 16);
    }
}
