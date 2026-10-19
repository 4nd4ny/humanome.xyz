<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Referentiel\ReferentielRepository;
use PDO;
use stdClass;

/**
 * Launching a Twin9 run from the platform (T9, Twin_v9's docs/plan-twin9-php.md,
 * lot 2, « Lancer et suivre »): its owner from the session; a profile of theirs,
 * or the default one, the v9.8's, valid and admitted again, copied into the
 * run with its referential's version frozen; the engine's settings drawn from
 * that copy (MoteurReglages), never from a config.json; the profile's template
 * set (T14: the v9.8's, the instance's default or a copy of a promptologue's),
 * as the run's snapshot; the portfolio its owner sends; their consent to keep it,
 * and the run's state, on the server until they erase them (ADR-011 §5). The
 * attestation keeps what the run was launched with: its profile and its
 * mode, the days it took (T8), the versions of its template set, its
 * referential, the engine's commit.
 *
 * Before a launch (T10, apercu()): the portfolio's days the run would
 * instruct — new or changed since its map's memory; it takes the others back
 * without a call —, and what it would cost and last (prevoir()): at the
 * least, on average and at the most, by the size of its days and of its map,
 * as the evaluations of the same settings say (T8, Evaluations), failing
 * those the real run of PLANT-01 (T2), made in test mode, times the
 * referential's poles for a complete run; with its caps. This replaces
 * ADR-010's quote by a simulated run (ADR-011 §6).
 *
 * The engine reads the run's referential from its settings, drawn from the
 * base at the version its profile freezes (T16, ReferentielMoteur): any
 * referential published, or a draft its author tries; the attestation keeps
 * its fingerprint.
 *
 * A launch takes the days its owner's credit, or its budget, lets in with
 * its merge (T8, the strategy A): the first days of the portfolio, as long as
 * they fit at the most with the merge of their map, which the run keeps in
 * reserve; the others wait for a next run. Refused, it says what it would
 * take. One launch of an owner at a time: the next one counts what the
 * previous was granted.
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
     * @param int|null $profilId a profile of its owner's; null: the default one, the v9.8's
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
        ['profil' => $profil, 'nom' => $nom, 'moteur' => $moteur, 'jeu' => $jeu, 'referentiel' => $referentiel,
         'plateforme' => $plateforme] = $this->preparer($userId, $profilId, $portfolioNom, $portfolio, $horloge, $sortie);

        $runs = new RunRepository($this->pdo);
        // T8, strategy A: the days that fit with the merge's reserve; the others wait for a next run. One launch
        // of an owner at a time, for the next to count what this one is granted
        [$id, $admission, $reserve, $engagement] = $runs->sousVerrou($userId, function () use (
            $runs, $userId, $profil, $moteur, $portfolioNom, $portfolio, $plateforme, $jeu, $referentiel, $horloge,
            $sortie
        ): array {
            $admission = null;
            $reserve = 0;
            $engagement = 0;
            if (method_exists($plateforme, 'apercu')) {
                $carte = $runs->carte($userId, $plateforme->journal(), (string) $profil->referentiel->id,
                    (string) $profil->gabarits);
                ['admission' => $admission, 'reserve' => $reserve, 'engagement' => $engagement] = $this->prevoir(
                    $userId, $profil, $jeu['gabarits'], $referentiel,
                    $plateforme->apercu(new MapStore($this->pdo, $carte ?? 0)));
                if ($admission['refus'] !== null) {
                    throw new Twin9Exception($admission['refus'], 422);
                }
                if ($admission['journees'] < $admission['total']) {
                    $profil->jours = $admission['journees'];
                    $moteur = MoteurReglages::depuis($profil, $referentiel);
                }
            }

            return [$runs->creer($userId, $profil, $moteur, trim($portfolioNom), $portfolio, $plateforme->journal(),
                $jeu['gabarits'], $horloge, $sortie, $reserve, $engagement), $admission, $reserve, $engagement];
        });
        $runs->attester($id, [
            'profil' => ['id' => $profilId, 'nom' => $nom, 'mode' => $profil->mode],
            'admission' => $admission === null ? null : array_diff_key($admission, ['refus' => true])
                + ['reserve_microusd' => $reserve, 'engagement_microusd' => $engagement],
            'gabarits' => ['jeu' => $profil->gabarits, 'versions' => $jeu['versions'],
                           'empreinte' => self::empreinte($jeu['gabarits'])],
            'referentiel' => ['id' => $profil->referentiel->id, 'version' => $profil->referentiel->version,
                              'empreinte' => ReferentielMoteur::empreinte($referentiel)],
            'moteur' => ['commit' => EngineLoader::commit()],
        ], $visibilite, $horloge);

        return $id;
    }

    /**
     * What a launch would do, before it (T10): the portfolio's days the run
     * would instruct, new or changed since its map's memory; what it would
     * cost and last, and the days its owner's credit or its budget lets in
     * (T8, prevoir()); its caps; its owner's credit when the instance's key
     * pays. Nothing is kept.
     *
     * @return array<string, mixed>
     * @throws Twin9Exception as lancer() does
     */
    public function apercu(int $userId, ?int $profilId, string $portfolioNom, string $portfolio): array
    {
        ['profil' => $profil, 'jeu' => $jeu, 'referentiel' => $referentiel, 'plateforme' => $plateforme]
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

        ['estimation' => $estimation, 'admission' => $admission]
            = $this->prevoir($userId, $profil, $jeu['gabarits'], $referentiel, $vue);

        return [
            'journal' => $plateforme->journal(),
            'mode' => (string) $profil->mode,
            'voie' => (string) $profil->voie,
            'cle' => (string) $profil->cle,
            'journees' => ['total' => \count($vue['journees']), 'nouvelles' => $nouvelles, 'changees' => $changees],
            'estimation' => $estimation,
            'admission' => $admission,
            'plafonds' => ['budget_usd' => $profil->budget_usd ?? null, 'duree_minutes' => $profil->duree_minutes ?? null],
            'credit_usd' => $profil->cle === 'instance'
                ? round((new CreditService($this->pdo))->balance($userId) / 1_000_000, 2) : null,
        ];
    }

    /**
     * What a run would cost, and which of its days it takes (T8, the strategy A).
     *
     * Its cost, at the least, on average and at the most, as the latest
     * evaluations of the same settings say it (Evaluations): a day instructed
     * by its size, the merge by the size of the map it reads — the days the
     * run takes and those its memory keeps beyond them, the map being additive
     * —; failing those, the real run of PLANT-01 (T2), made in test mode,
     * times the referential's poles for a complete run, for each day
     * instructed and a day's worth for the merge. Half price by batches, the
     * margin with the instance's key.
     *
     * The days it takes: the first days of the portfolio, in order, as long as
     * what they need fits in the lowest of its limits — its owner's credit
     * with the instance's key, less what their other runs in progress may
     * still spend of it (read together: RunRepository::disponible()), and its
     * budget: their cost at the most, the merge of their map at the most
     * included, and room for the worst case a call holds before leaving
     * (T10), one of a day's and one of the merge's — the largest observed
     * (failing that, a day's worth each), and at least what the run's call
     * settings hold on a prompt twice as large as the larger of its largest
     * template and the largest pole its readers read (T16: a pole's
     * preamble and fiches), with its largest day to instruct (the map, for
     * the merge's). The others
     * wait for a next run, the memory keeping those done; a profile that reads
     * every day again at each run (rescan, or no memory) takes all or none.
     * Refused — not even a day to instruct and its merge fit, nor the merge
     * alone with nothing to instruct —, it says what it would take, to the
     * cent above. The estimate is the run's as it would go, or as the refusal
     * says it; its source, the evaluations when they say all it needs, else
     * the reference.
     *
     * Its reserve is the merge of its map at the most, with the worst case of a
     * call of it: its days' calls never eat into it. Its engagement, with the
     * instance's key, is what it was granted: what it needs.
     *
     * @param array<string, string> $gabarits its template set, each template by name
     * @param array<string, mixed> $referentiel its referential, as the engine reads it (ReferentielMoteur::bloc())
     * @param array{journees: list<array{id: string, etat: string, octets?: int}>,
     *              memoire?: list<array{id: string, octets: int}>, poles: int} $vue the engine's preview
     * @return array{estimation: array<string, mixed>, admission: array<string, mixed>, reserve: int, engagement: int}
     */
    private function prevoir(int $userId, stdClass $profil, array $gabarits, array $referentiel, array $vue): array
    {
        $instance = $profil->cle === 'instance';
        $parLots = $profil->voie === 'lots';
        $marge = $instance ? $this->config->marge() : 1.0;
        // by size, when the engine gives each day's (T8); an older engine, by the reference
        $tailles = array_filter($vue['journees'], static fn (array $j): bool => !isset($j['octets'])) === [];
        $modele = $tailles ? (new Evaluations($this->pdo))->modele(Evaluations::signature($profil,
            self::empreinte($gabarits), ReferentielMoteur::empreinte($referentiel)), $parLots, $marge) : null;
        // the reference run read one pole: a complete run reads the referential's
        $poles = $profil->mode === 'test' ? 1 : max(1, (int) $vue['poles']);
        $reference = self::REFERENCE_MICROUSD * $poles * ($parLots ? 0.5 : 1.0) * $marge;
        $bornes = ['min', 'moyenne', 'max'];

        // what bounds it: its owner's credit with the instance's key, less what their runs in progress may still
        // spend of it, read together; its budget; the lower of them
        ['solde' => $solde, 'autres' => $autres] = $instance
            ? (new RunRepository($this->pdo))->disponible($userId) : ['solde' => 0, 'autres' => 0];
        $limites = [];
        if ($instance) {
            $limites['credit'] = $solde - $autres;
        }
        if (($profil->budget_usd ?? null) !== null) {
            $limites['budget'] = (int) round((float) $profil->budget_usd * 1_000_000);
        }
        asort($limites);
        $limite = array_key_first($limites);

        // a day instructed, the merge of a map: by the evaluations' lines, else the reference's day; room for the
        // worst case of a call of each
        $parJour = static fn (float $ko): array => ($modele['journee'] ?? null) === null
            ? array_fill_keys($bornes, $reference) : Evaluations::selon($modele['journee'], $ko);
        $parCarte = static fn (float $ko): array => ($modele['fusion'] ?? null) === null
            ? array_fill_keys($bornes, $reference) : Evaluations::selon($modele['fusion'], $ko);
        // the worst case a call holds: the largest observed, else a day's worth; at least what its settings hold on
        // a prompt twice the set's largest template or the largest pole its readers read, and this many bytes
        $gabarit = 2 * max(0, 0, ...array_map('strlen', array_values($gabarits)),
            ...ReferentielMoteur::tailles($referentiel));
        $combinaisons = (new CallSettings($profil))->combinaisons();
        $grille = $this->config->read();
        $pireCas = static function (?float $observe, int $octets) use ($reference, $gabarit, $combinaisons, $grille,
                                                                       $parLots, $instance): float {
            $pire = $observe ?? $reference;
            foreach ($combinaisons as $c) {
                $pire = max($pire, (float) (Twin9Config::cout($grille, $c['modele'], $gabarit + $octets, $c['budget_sortie'],
                    'twin9', $parLots, $instance) ?? 0));
            }

            return $pire;
        };
        $pireJour = static fn (int $octets): float => $pireCas($modele['pire_cas']['journee'] ?? null, $octets);
        $pireFusion = static fn (float $ko): float => $pireCas($modele['pire_cas']['fusion'] ?? null, (int) ceil($ko * 1024));

        // the map the merge reads: the days of the memory, and the new days as the run takes them
        $ko = 0.0;
        foreach ($vue['memoire'] ?? [] as $jour) {
            $ko += Evaluations::ko($jour['octets']);
        }
        $attente = ['nouvelle' => 0, 'changee' => 0];
        foreach ($vue['journees'] as $jour) {
            $ko += $jour['etat'] === 'nouvelle' ? 0.0 : Evaluations::ko($jour['octets'] ?? 0);
            $attente[$jour['etat']] = ($attente[$jour['etat']] ?? 0) + 1;
        }
        unset($attente['inchangee']);
        $etat = static fn (array $jours, float $ko, int $instruites, int $octets, array $attente): array => [
            'jours' => $jours, 'fusion' => $parCarte($ko), 'instruites' => $instruites, 'attente' => $attente,
            'pire_fusion' => $pireFusion($ko), 'besoin' => $jours['max'] + ($instruites > 0 ? $pireJour($octets) : 0.0)
                + $parCarte($ko)['max'] + $pireFusion($ko)];

        // what each first days of the portfolio cost, and need
        $jours = array_fill_keys($bornes, 0.0);
        $instruites = 0;
        $plusGrande = 0;
        $etats = [$etat($jours, $ko, 0, 0, $attente)];
        foreach ($vue['journees'] as $jour) {
            $taille = Evaluations::ko($jour['octets'] ?? 0);
            $ko += $jour['etat'] === 'nouvelle' ? $taille : 0.0;
            if ($jour['etat'] !== 'inchangee') {
                $instruites++;
                $attente[$jour['etat']]--;
                $plusGrande = max($plusGrande, (int) ($jour['octets'] ?? 0));
                foreach ($parJour($taille) as $b => $cout) {
                    $jours[$b] += $cout;
                }
            }
            $etats[] = $etat($jours, $ko, $instruites, $plusGrande, $attente);
        }
        $total = \count($vue['journees']);
        $admises = 0;
        while ($admises < $total && ($limite === null || $etats[$admises + 1]['besoin'] <= $limites[$limite])) {
            $admises++;
        }

        // refused: what it would take
        $aInstruire = $etats[0]['attente']['nouvelle'] + $etats[0]['attente']['changee'];
        $sansSuite = ($profil->rescan ?? false) || !($profil->memoire ?? true);
        $refus = match (true) {
            $total === 0 => null,
            $sansSuite && $admises < $total => 'portfolio',
            $aInstruire > 0 && $etats[$admises]['instruites'] === 0 => 'journee',
            $admises === 0 => 'fusion',
            default => null,
        };
        $retenu = match ($refus) {
            'portfolio' => $etats[$total],
            'journee' => current(array_filter($etats, static fn (array $e): bool => $e['instruites'] === 1)),
            'fusion' => $etats[1],
            default => $etats[$admises],
        };

        // in dollars, to the micro-dollar: the page rounds them
        $usd = static fn (float $microusd): float => round($microusd / 1_000_000, 6);
        // by batches, the time is Anthropic's: the reference, made by direct calls, says nothing of it
        $secondes = $modele['secondes_par_journee'] ?? (float) (self::REFERENCE_SECONDES * $poles);
        // the evaluations say it all only when they say what its days and its merge cost
        $observe = ($modele['fusion'] ?? null) !== null && ($retenu['instruites'] === 0 || ($modele['journee'] ?? null) !== null);

        return [
            'estimation' => [
                'cout_usd' => $usd($retenu['jours']['moyenne'] + $retenu['fusion']['moyenne']),
                'min_usd' => $usd($retenu['jours']['min'] + $retenu['fusion']['min']),
                'max_usd' => $usd($retenu['jours']['max'] + $retenu['fusion']['max']),
                'reserve_usd' => $usd($retenu['fusion']['max'] + $retenu['pire_fusion']),
                'duree_s' => $parLots ? null : (int) round($secondes * max(1, $retenu['instruites'])),
            ] + ($observe ? ['evaluations' => $modele['evaluations']] : ['reference' => 'PLANT-01', 'poles' => $poles]),
            'admission' => [
                'journees' => $admises,
                'total' => $total,
                'limite' => $limite,
                'instruites' => $refus === null ? $retenu['instruites'] : 0,
                'en_attente' => $refus === null ? $retenu['attente']['nouvelle'] + $retenu['attente']['changee'] : $aInstruire,
                'changees_en_attente' => $refus === null ? $retenu['attente']['changee'] : $etats[0]['attente']['changee'],
                'autres_usd' => $limite === 'credit' ? $usd($autres) : 0.0,
                'refus' => $refus === null ? null : self::refus($refus, (string) $limite, $retenu['besoin'],
                    $limite === 'credit' ? $autres : 0, $observe),
            ],
            'reserve' => $refus === null ? (int) ceil($retenu['fusion']['max'] + $retenu['pire_fusion']) : 0,
            'engagement' => $refus === null && $instance ? (int) ceil($retenu['besoin']) : 0,
        ];
    }

    /**
     * Why a launch is refused, and what it would take, to the cent above:
     * not even a day to instruct and its merge, the merge alone with nothing
     * to instruct, or a whole portfolio for a profile that reads every day
     * again (prevoir()).
     */
    private static function refus(string $quoi, string $limite, float $besoin, int $autres, bool $observe): string
    {
        $sujet = $limite === 'budget' ? 'le budget du profil' : 'votre crédit';
        $montant = number_format(ceil($besoin / 10_000) / 100, 2, ',', '') . ' $';
        $ailleurs = $autres > 0 ? ', en plus des ' . number_format(ceil($autres / 10_000) / 100, 2, ',', '')
            . ' $ que vos analyses en cours peuvent encore dépenser' : '';
        $source = $observe ? 'au coût le plus haut observé' : 'd’après le run de référence';

        return match ($quoi) {
            'journee' => ucfirst($sujet) . ' ne couvre pas une carte, même d’une journée : il faudrait ' . $montant
                . $ailleurs . ' (une journée et sa fusion, ' . $source . ', réserves des appels comprises)',
            'fusion' => ucfirst($sujet) . ' ne couvre pas la fusion de la carte : il faudrait ' . $montant . $ailleurs
                . ' (' . $source . ', réserve de ses appels comprise)',
            default => 'Ce profil relit toutes ses journées à chaque analyse, et ' . $sujet . ' ne couvre pas le '
                . 'portfolio entier : il faudrait ' . $montant . $ailleurs . ' (ses journées et leur fusion, '
                . $source . ', réserves des appels comprises)',
        };
    }

    /**
     * What a launch and its preview share: the portfolio checked, the
     * profile copied and admitted, the engine and the template set present,
     * the engine's settings drawn from the copy, and the platform built over
     * them as the slices build it.
     *
     * @return array{profil: stdClass, nom: string, moteur: stdClass,
     *               jeu: array{gabarits: array<string, string>, versions: array<string, int>},
     *               referentiel: array<string, mixed>, plateforme: \Twin9\Plateforme}
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

        $politique = new ProfilPolicy($this->pdo, $this->config);
        [$profil, $nom] = $this->profil($userId, $profilId, $politique);
        $politique->admettre($profil, $userId);
        if ($profil->cle === 'personnelle' && !$politique->choix($userId)['cle_perso_enregistree']) {
            throw new Twin9Exception('Profil refusé — /cle : aucune clé Anthropic personnelle n’est enregistrée', 422);
        }
        // the referential's version, frozen in the run's copy of its profile
        $profil->referentiel->version ??= (new ReferentielRepository($this->pdo))
            ->publishedSemvers()[$profil->referentiel->id][0];

        $jeu = (new ProtocoleRepository($this->pdo, (string) $profil->gabarits))->jeu();
        if ($jeu['gabarits'] === []) {
            throw new Twin9Exception('Aucun gabarit sur cette instance : l’analyse approfondie ne peut partir', 503);
        }
        // a copy made before an import added a template to the v9.8's set lacks it: the run would stop on it (T14)
        if ($profil->gabarits !== ProtocoleRepository::V98 && array_diff(
            array_column((new ProtocoleRepository($this->pdo))->list(), 'name'), array_keys($jeu['gabarits'])) !== []) {
            throw new Twin9Exception('Le jeu de gabarits « ' . $profil->gabarits . ' » n’a pas tous les gabarits du jeu '
                . 'v9.8 : il faut en refaire une copie', 422);
        }
        // T16: the run's referential, drawn from the base at its frozen version, which the engine reads
        $referentiel = (new ReferentielMoteur($this->pdo))->bloc((string) $profil->referentiel->id,
            (string) $profil->referentiel->version);
        $moteur = MoteurReglages::depuis($profil, $referentiel);
        try {
            $plateforme = new \Twin9\Plateforme(json_encode($moteur, self::JSON), $portfolioNom, $portfolio,
                $jeu['gabarits'], $sortie, $horloge,
                CallSettings::empreinte($profil, $moteur->config->troncatures ?? null, $jeu['gabarits'], $referentiel));
        } catch (\Twin9\ReferentielInvalide $e) {
            // the engine names the pole or the code at fault, never a fiche (T16)
            throw new Twin9Exception('Le référentiel « ' . $profil->referentiel->id . ' » ne se lit pas : '
                . preg_replace('/^Référentiel du moteur invalide : /u', '', $e->getMessage()), 422);
        } catch (\ValueError|\RuntimeException $e) {
            // an engine before T16 reads RESPIRE's fiches from the set (T14: a copy's may be malformed), which the
            // import of T16 no longer carries; the class only in the log, an engine's message may quote a template
            error_log('[twin9-lancement] ' . $e::class);
            throw new Twin9Exception('Le jeu de gabarits « ' . $profil->gabarits . ' » ne se lit pas : un gabarit y '
                . 'manque, ou une fiche y est mal formée', 422);
        } catch (\InvalidArgumentException $e) {
            error_log('[twin9-lancement] ' . $e::class);
            throw new Twin9Exception('Portfolio illisible par le moteur', 422);
        }

        return ['profil' => $profil, 'nom' => $nom, 'moteur' => $moteur, 'jeu' => $jeu, 'referentiel' => $referentiel,
                'plateforme' => $plateforme];
    }

    /**
     * The profile a run copies, valid under today's rules: its owner's, or the
     * default one, the v9.8's with the instance's default template set.
     *
     * @return array{0: stdClass, 1: string} the profile and its name
     */
    private function profil(int $userId, ?int $profilId, ProfilPolicy $politique): array
    {
        if ($profilId === null) {
            return [ProfilRepository::validate($politique->defaut()), 'Profil v9.8'];
        }
        $ligne = (new ProfilRepository($this->pdo))->get($profilId);
        if ($ligne === null || $ligne['user_id'] !== $userId) {
            throw new Twin9Exception('Profil introuvable', 404);
        }

        return [ProfilRepository::validate($ligne['profil']), $ligne['nom']];
    }

    /**
     * The template set's fingerprint: each name and content, in name order.
     *
     * @param array<string, string> $gabarits
     */
    public static function empreinte(array $gabarits): string
    {
        ksort($gabarits, SORT_STRING);
        $contexte = hash_init('sha256');
        foreach ($gabarits as $nom => $contenu) {
            hash_update($contexte, $nom . "\0" . $contenu . "\0");
        }

        return substr(hash_final($contexte), 0, 16);
    }
}
