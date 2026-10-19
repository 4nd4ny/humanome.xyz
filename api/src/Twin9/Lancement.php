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
 * attestation keeps what the run was launched with: its profile and its
 * mode, the versions of its template set, its referential, the engine's
 * commit.
 *
 * Before a launch (T10, apercu()): the portfolio's days the run would
 * instruct — new or changed since its map's memory; it takes the others back
 * without a call —, and what it would cost and last: the average by day of
 * the runs done of the same profile in the same mode, failing those the real
 * run of PLANT-01 (T2), made in test mode, times the referential's poles for
 * a complete run; with its caps. This replaces ADR-010's quote by a
 * simulated run (ADR-011 §6).
 */
final class Lancement
{
    /** Who reads a run's results besides its owner: no one, or the cartographes they linked. */
    public const VISIBILITES = ['privee', 'cartographe'];

    /** A portfolio's size, at most: the run keeps it, compressed, in a MEDIUMBLOB. */
    public const PORTFOLIO_OCTETS = 2_000_000;

    /**
     * The real run of PLANT-01 (T2, Twin_v9's oracle/README.md), the estimate
     * when no run of the profile is done: in test mode — its first day, the
     * referential's first pole —, by direct calls, at Anthropic's list
     * prices: 0.1344 $ and 94 s of wall time.
     */
    public const REFERENCE_MICROUSD = 134_400;

    public const REFERENCE_SECONDES = 94;

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
        $horloge = $maintenant ?? new \DateTimeImmutable();
        $sortie = 'twin9/runs/' . bin2hex(random_bytes(8));
        ['profil' => $profil, 'nom' => $nom, 'moteur' => $moteur, 'jeu' => $jeu, 'plateforme' => $plateforme]
            = $this->preparer($userId, $profilId, $portfolioNom, $portfolio, $horloge, $sortie);

        $runs = new RunRepository($this->pdo);
        $id = $runs->creer($userId, $profil, $moteur, trim($portfolioNom), $portfolio, $plateforme->journal(),
            $jeu['gabarits'], $horloge, $sortie);
        $runs->attester($id, [
            'profil' => ['id' => $profilId, 'nom' => $nom, 'mode' => $profil->mode],
            'gabarits' => ['jeu' => $profil->gabarits, 'versions' => $jeu['versions'],
                           'empreinte' => self::empreinte($jeu['gabarits'])],
            'referentiel' => ['id' => $profil->referentiel->id, 'version' => $profil->referentiel->version],
            'moteur' => ['commit' => EngineLoader::commit()],
        ], $visibilite, $horloge);

        return $id;
    }

    /**
     * What a launch would do, before it (T10): the portfolio's days the run
     * would instruct, new or changed since its map's memory; what it would
     * cost and last; its caps; its owner's credit when the instance's key
     * pays. Nothing is kept.
     *
     * @return array<string, mixed>
     * @throws Twin9Exception as lancer() does
     */
    public function apercu(int $userId, ?int $profilId, string $portfolioNom, string $portfolio): array
    {
        ['profil' => $profil, 'plateforme' => $plateforme]
            = $this->preparer($userId, $profilId, $portfolioNom, $portfolio, new \DateTimeImmutable(), 'twin9/apercu');
        if (!method_exists($plateforme, 'apercu')) {
            throw new Twin9Exception('L’aperçu demande une version plus récente du moteur', 503);
        }
        $runs = new RunRepository($this->pdo);
        $carte = $runs->carte($userId, $plateforme->journal(), (string) $profil->referentiel->id,
            (string) $profil->gabarits);
        $vue = $plateforme->apercu(new MapStore($this->pdo, $carte ?? 0));
        $etats = array_count_values(array_column($vue['journees'], 'etat'));
        $nouvelles = $etats['nouvelle'] ?? 0;
        $changees = $etats['changee'] ?? 0;

        $instance = $profil->cle === 'instance';
        $passes = $runs->passes($profilId, (string) $profil->mode);
        if ($passes !== null) {
            $parJour = ['cout_microusd' => intdiv($passes['cout_microusd'], $passes['journees']),
                        'duree_s' => intdiv($passes['duree_s'], $passes['journees'])];
            $source = ['runs' => $passes['runs']];
        } else {
            // the reference run read one pole: a complete run reads the referential's
            $poles = $profil->mode === 'test' ? 1 : max(1, (int) $vue['poles']);
            $parJour = [
                'cout_microusd' => (int) round(self::REFERENCE_MICROUSD * $poles * ($profil->voie === 'lots' ? 0.5 : 1.0)
                    * ($instance ? $this->config->marge() : 1.0)),
                // by batches, the time is Anthropic's: the reference, made by direct calls, says nothing of it
                'duree_s' => $profil->voie === 'lots' ? null : self::REFERENCE_SECONDES * $poles,
            ];
            $source = ['reference' => 'PLANT-01', 'poles' => $poles];
        }
        // the merge is made again at each run: at least a day's worth
        $jours = max(1, $nouvelles + $changees);

        return [
            'journal' => $plateforme->journal(),
            'mode' => (string) $profil->mode,
            'voie' => (string) $profil->voie,
            'cle' => (string) $profil->cle,
            'journees' => ['total' => \count($vue['journees']), 'nouvelles' => $nouvelles, 'changees' => $changees],
            'estimation' => [
                'cout_usd' => round($parJour['cout_microusd'] * $jours / 1_000_000, 2),
                'duree_s' => $parJour['duree_s'] === null ? null : $parJour['duree_s'] * $jours,
                'par_journee' => ['cout_usd' => round($parJour['cout_microusd'] / 1_000_000, 4),
                                  'duree_s' => $parJour['duree_s']],
            ] + $source,
            'plafonds' => ['budget_usd' => $profil->budget_usd ?? null, 'duree_minutes' => $profil->duree_minutes ?? null],
            'credit_usd' => $instance ? round((new CreditService($this->pdo))->balance($userId) / 1_000_000, 2) : null,
        ];
    }

    /**
     * What a launch and its preview share: the portfolio checked, the
     * profile copied and admitted, the engine and the template set present,
     * the engine's settings drawn from the copy, and the platform built over
     * them as the slices build it.
     *
     * @return array{profil: stdClass, nom: string, moteur: stdClass,
     *               jeu: array{gabarits: array<string, string>, versions: array<string, int>},
     *               plateforme: \Twin9\Plateforme}
     */
    private function preparer(int $userId, ?int $profilId, string $portfolioNom, string $portfolio,
                              \DateTimeImmutable $horloge, string $sortie): array
    {
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
        try {
            $plateforme = new \Twin9\Plateforme(json_encode($moteur, self::JSON), $portfolioNom, $portfolio,
                $jeu['gabarits'], $sortie, $horloge,
                CallSettings::empreinte($profil, $moteur->config->troncatures ?? null, $jeu['gabarits']));
        } catch (\InvalidArgumentException|\RuntimeException $e) {
            error_log('[twin9-lancement] ' . $e->getMessage());
            throw new Twin9Exception('Portfolio illisible par le moteur', 422);
        }

        return ['profil' => $profil, 'nom' => $nom, 'moteur' => $moteur, 'jeu' => $jeu, 'plateforme' => $plateforme];
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
