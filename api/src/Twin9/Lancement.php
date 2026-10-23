<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Etablissement\Ecoles;
use Humanome\Etablissement\Payeur;
use Humanome\Etablissement\Payeurs;
use Humanome\Packages\SettingsRepository;
use Humanome\Referentiel\ReferentielRepository;
use Humanome\Twin9\Fournisseurs\Fournisseurs;
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
 * and the run's state, on the server until they erase them (ADR-011 §5), and
 * to send it to the providers its calls reach, which the consent names
 * (ADR-012, P1-5): {fournisseurs: [ids]}, compared with those the run
 * reaches, kept in its configuration; a bare true still serves a profile
 * all Anthropic, whose consent named Anthropic alone. The
 * attestation keeps what the run was launched with: its profile and its
 * mode, the days it took (T8), the versions of its template set, its
 * referential, the engine's commit. Its configuration block (P0-1,
 * RunConfiguration) keeps, once and for good, how each of its calls is sent
 * and what it was launched with.
 *
 * Before a launch (T10, apercu()): the portfolio's days the run would
 * instruct — new or changed since its map's memory; it takes the others back
 * without a call —, and what it would cost and last (prevoir()): at the
 * least, on average and at the most, by the size of its days and of its map,
 * as the evaluations of the same settings say (T8, Evaluations), failing
 * those the real run of PLANT-01 (T2), made in test mode, times the
 * referential's poles for a complete run; with its caps; and the providers
 * its calls reach, each with its lane and its GDPR tag, which its consent
 * names. This replaces ADR-010's quote by a simulated run (ADR-011 §6).
 *
 * The engine reads the run's referential from its settings, drawn from the
 * base at the version its profile freezes (T16, ReferentielMoteur): any
 * referential published, or a draft its author tries; the attestation keeps
 * its fingerprint. The launch, and its preview, may choose another
 * referential than the profile's (S5, lot C: choisirReferentiel()), in the
 * run's copy of its profile before its admission: every rule of a profile's
 * referential holds for it, and the jury's overrides, keyed by the numbers
 * and the codes of the profile's referential, are dropped when its id
 * changes. A profile with the greffier's stigmergy on is launched
 * only by an engine that has it (Twin9\Stigmergie): another one would ignore
 * it.
 *
 * A launch takes the days its owner's credit, or its budget, lets in with
 * its merge (T8, the strategy A): the first days of the portfolio, as long as
 * they fit at the most with the merge of their map, which the run keeps in
 * reserve; the others wait for a next run. Refused, it says what it would
 * take. One launch of an owner at a time: the next one counts what the
 * previous was granted.
 *
 * Who pays (ADR-013 §4, Payeurs): the payer the launch names, checked again —
 * one of its owner's schools, or their remaining balance —, by default their
 * school when they have only one; frozen in the run with the school's factor
 * (1 + its surtax on its credit, 1.0 on its key, lane `ecole`). A school's
 * credit bounds the run less what all its runs in progress may still spend,
 * the learner's cap for the month too; one launch at a time per credit that
 * pays, the school's for all its learners.
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

    /** A launch its school's cap refuses, the school not having set it yet (0, its default; ADR-013 §3). */
    public const PLAFOND_NON_REGLE = 'Votre école n’a pas encore réglé le plafond qu’elle vous accorde chaque mois '
        . '(0 $ par défaut) : demandez-le-lui avant de lancer une analyse qu’elle paie';

    /** The JSON of the engine's settings: 1.0 stays a float, as the v9.8 reads it. */
    private const JSON = JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION;

    public function __construct(private readonly PDO $pdo, private readonly Twin9Config $config)
    {
    }

    /**
     * @param int|null $profilId a profile of its owner's; null: the default one, the v9.8's
     * @param string $portfolioNom the portfolio's file name: its stem names the journal, and the map
     * @param mixed $accord the owner's consent, which every launch asks: {fournisseurs: [ids]}, the providers the
     *                      run's calls reach, as the page showed them; true for a profile all Anthropic
     * @param array{id: string, version: string|null}|null $referentielChoisi another referential than the profile's,
     *                                                                         chosen at the launch (S5, lot C); null:
     *                                                                         the profile's
     * @param mixed $payeurChoisi who pays, as the request names it (ADR-013 §4): null (the default), "personnel" or
     *                            one of its owner's schools' id
     * @return int the run
     * @throws Twin9Exception 422 naming what is refused, 404 for another's profile, 503 without the engine
     */
    public function lancer(int $userId, ?int $profilId, string $portfolioNom, string $portfolio, mixed $accord,
                           string $visibilite = 'privee', ?\DateTimeImmutable $maintenant = null,
                           ?array $referentielChoisi = null, mixed $payeurChoisi = null): int
    {
        $accordes = self::accordes($accord);
        if ($accordes === null) {
            throw new Twin9Exception('Accord requis : votre portfolio et l’état du run restent sur le serveur '
                . 'jusqu’à ce que vous les effaciez', 422);
        }
        if (!\in_array($visibilite, self::VISIBILITES, true)) {
            throw new Twin9Exception('Visibilité inconnue : privee ou cartographe', 422);
        }
        $horloge = $maintenant ?? new \DateTimeImmutable();
        $sortie = 'twin9/runs/' . bin2hex(random_bytes(8));
        ['profil' => $profil, 'nom' => $nom, 'moteur' => $moteur, 'jeu' => $jeu, 'referentiel' => $referentiel,
         'plateforme' => $plateforme, 'empreinte_reglages' => $empreinteReglages]
            = $this->preparer($userId, $profilId, $portfolioNom, $portfolio, $horloge, $sortie, $referentielChoisi);
        // the consent names the providers the run reaches, no more, no fewer (ADR-012)
        $atteints = (new CallSettings($profil))->fournisseurs();
        if ($accordes === true ? $atteints !== [Fournisseurs::DEFAUT] : $accordes !== self::trie($atteints)) {
            throw new Twin9Exception('Accord requis : il nomme les fournisseurs auxquels ce run envoie votre '
                . 'portfolio — ' . implode(', ', array_map(
                    static fn (string $f): string => (string) Fournisseurs::REGISTRE[$f]['libelle'], $atteints)), 422);
        }
        // who pays, checked again (ADR-013 §4): its school's factor frozen in the run — and the lane of its calls, in
        // the run's copy of its profile: a school that has its own Anthropic key pays with it, nothing to the platform
        // (§2 d), for a run that reaches Anthropic alone
        ['payeur' => $payeur, 'cle' => $profil->cle] = (new Payeurs($this->pdo))->pourRun($userId, $payeurChoisi,
            (string) $profil->cle, $atteints);
        // what its configuration block keeps besides its settings (P0-1): the prices and their reading, the engine's
        // versions
        $grille = $this->config->read();
        $releve = TarifsAnthropic::etat(new SettingsRepository($this->pdo));
        $versions = self::versionsDuMoteur();

        $runs = new RunRepository($this->pdo);
        // T8, strategy A: the days that fit with the merge's reserve; the others wait for a next run. One launch
        // at a time per credit that pays — its owner's, or its school's —, for the next to count what this one is
        // granted
        $compte = $payeur->estEcole() ? (int) $payeur->ecoleId : $userId;
        [$id, $admission, $reserve, $engagement] = $runs->sousVerrou($compte, function () use (
            $runs, $userId, $profil, $moteur, $portfolioNom, $portfolio, $plateforme, $jeu, $referentiel, $horloge,
            $sortie, $profilId, $nom, $empreinteReglages, $grille, $releve, $versions, $atteints, $payeur
        ): array {
            $admission = null;
            $reserve = 0;
            $engagement = 0;
            if (method_exists($plateforme, 'apercu')) {
                $carte = $runs->carte($userId, $plateforme->journal(), (string) $profil->referentiel->id,
                    (string) $profil->gabarits);
                ['admission' => $admission, 'reserve' => $reserve, 'engagement' => $engagement] = $this->prevoir(
                    $userId, $profil, $jeu['gabarits'], $referentiel,
                    $plateforme->apercu(new MapStore($this->pdo, $carte ?? 0)), $payeur);
                if ($admission['refus'] !== null) {
                    throw new Twin9Exception($admission['refus'], 422);
                }
                if ($admission['journees'] < $admission['total']) {
                    $profil->jours = $admission['journees'];
                    $moteur = MoteurReglages::depuis($profil, $referentiel);
                }
            }
            // its configuration (P0-1), here only: $moteur is captured by value, the one the admission redrew lives
            // in this closure
            $configuration = RunConfiguration::depuis($profil, $profilId, $nom, $moteur, $jeu, $referentiel,
                $empreinteReglages, $grille, $releve, $versions, $horloge, bin2hex(random_bytes(16)),
                self::trie($atteints), $payeur);

            return [$runs->creer($userId, $profil, $moteur, trim($portfolioNom), $portfolio, $plateforme->journal(),
                $jeu['gabarits'], $horloge, $sortie, $reserve, $engagement, $configuration, $payeur), $admission,
                    $reserve, $engagement];
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
     * pays; the referential it would read, the one its profile names or the
     * one chosen (S5, lot C), and the jury's overrides that choice drops;
     * the days its map's memory keeps beyond those it takes, which its merge
     * reads (the launch page names those of them Twin9 no longer reads in
     * the text it sends: sprint 4, T0). Nothing is kept.
     *
     * @param array{id: string, version: string|null}|null $referentielChoisi as lancer() takes it
     * @param mixed $payeurChoisi as lancer() takes it
     * @return array<string, mixed>
     * @throws Twin9Exception as lancer() does
     */
    public function apercu(int $userId, ?int $profilId, string $portfolioNom, string $portfolio,
                           ?array $referentielChoisi = null, mixed $payeurChoisi = null): array
    {
        ['profil' => $profil, 'jeu' => $jeu, 'referentiel' => $referentiel, 'plateforme' => $plateforme,
         'jury_retire' => $juryRetire]
            = $this->preparer($userId, $profilId, $portfolioNom, $portfolio, new \DateTimeImmutable(), 'twin9/apercu',
                $referentielChoisi);
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

        $payeurs = new Payeurs($this->pdo);
        // who would pay, and on which lane: its school's key when it has one (Payeurs::pourRun(), as lancer() does)
        ['payeur' => $payeur, 'cle' => $profil->cle] = $payeurs->pourRun($userId, $payeurChoisi, (string) $profil->cle,
            (new CallSettings($profil))->fournisseurs());
        ['estimation' => $estimation, 'admission' => $admission]
            = $this->prevoir($userId, $profil, $jeu['gabarits'], $referentiel, $vue, $payeur);

        return [
            'journal' => $plateforme->journal(),
            'mode' => (string) $profil->mode,
            'voie' => (string) $profil->voie,
            'cle' => (string) $profil->cle,
            // the providers its calls reach, which its consent names (ADR-012)
            'fournisseurs' => self::fournisseurs($profil),
            'journees' => ['total' => \count($vue['journees']), 'nouvelles' => $nouvelles, 'changees' => $changees],
            'estimation' => $estimation,
            'admission' => $admission,
            'plafonds' => ['budget_usd' => $profil->budget_usd ?? null, 'duree_minutes' => $profil->duree_minutes ?? null],
            // its owner's own balance when they pay; a school's never shows to its learner
            'credit_usd' => $profil->cle === 'instance' && !$payeur->estEcole()
                ? round((new CreditService($this->pdo))->balance($userId) / 1_000_000, 2) : null,
            // who would pay (ADR-013 §4), and who may: the page lets them choose; « payé par votre école : elle voit
            // le montant »
            'payeur' => $payeur->estEcole()
                ? ['type' => Payeur::ECOLE, 'id' => $payeur->ecoleId, 'nom' => $payeur->nom,
                   'soi' => $payeur->ecoleId === $userId]
                : ['type' => Payeur::PERSONNEL],
            'payeurs' => $payeurs->possibles($userId),
            // the referential the run would read, its version frozen; the jury's overrides its choice drops (S5, lot C)
            'referentiel' => ['id' => (string) $profil->referentiel->id, 'version' => (string) $profil->referentiel->version,
                              'label' => (string) ($referentiel['label'] ?? $profil->referentiel->id)],
            'jury_retire' => $juryRetire,
            // the days its map's memory keeps beyond those it takes (the map is additive): its merge reads them
            'memoire' => array_values(array_map('strval', array_column($vue['memoire'] ?? [], 'id'))),
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
     * margin with the instance's key; a mixed run's evaluations converted by
     * the share of Anthropic in each phase (Evaluations::modele()), the
     * reference at half price only when every call goes by batches.
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
     * Who pays (ADR-013 §4): its owner's credit, or its school's — less what
     * all its runs in progress may still spend, at its frozen factor —, and
     * the learner's cap for the month, what remains of it (`plafond`); on
     * its school's key, the cap alone.
     *
     * @return array{estimation: array<string, mixed>, admission: array<string, mixed>, reserve: int, engagement: int}
     */
    private function prevoir(int $userId, stdClass $profil, array $gabarits, array $referentiel, array $vue,
                             ?Payeur $payeur = null): array
    {
        $payeur ??= Payeur::personnel();
        $instance = $profil->cle === 'instance';
        $ecole = $payeur->estEcole();
        // its price: the contribution for an owner who pays, its school's factor, the list price on a key of its own
        $prix = $ecole ? (float) $payeur->facteur : $instance;
        $compte = $ecole ? (int) $payeur->ecoleId : $userId;
        $eleve = $ecole && $payeur->ecoleId !== $userId ? $userId : null;
        // the lane of its Anthropic calls; its calls' routes, each by its provider (P1-5)
        $parLots = $profil->voie === 'lots';
        $reglages = new CallSettings($profil);
        $toutLots = $reglages->voieEffective() === 'lots';
        $aLots = $reglages->combinaisons('lots') !== [];
        $marge = \is_float($prix) ? $prix : ($prix ? $this->config->marge() : 1.0);
        // by size, when the engine gives each day's (T8); an older engine, by the reference
        $tailles = array_filter($vue['journees'], static fn (array $j): bool => !isset($j['octets'])) === [];
        $modele = $tailles ? (new Evaluations($this->pdo))->modele(Evaluations::signature($profil,
            self::empreinte($gabarits), ReferentielMoteur::empreinte($referentiel)), $parLots, $marge) : null;
        // the reference run read one pole: a complete run reads the referential's
        $poles = $profil->mode === 'test' ? 1 : max(1, (int) $vue['poles']);
        $reference = self::REFERENCE_MICROUSD * $poles * ($toutLots ? 0.5 : 1.0) * $marge;
        $bornes = ['min', 'moyenne', 'max'];

        // what bounds it: the credit that pays with the instance's key — its owner's, or its school's —, less what
        // the runs in progress it pays may still spend of it, read together; the learner's cap for the month when a
        // school pays for them; its budget; the lowest of them
        ['solde' => $solde, 'autres' => $autres] = $instance
            ? (new RunRepository($this->pdo))->disponible($compte) : ['solde' => 0, 'autres' => 0];
        $limites = [];
        if ($instance) {
            $limites['credit'] = $solde - $autres;
        }
        // a cap its school has not set yet (0, its default): the refusal says so, rather than an amount to reach
        $plafondNul = false;
        if ($eleve !== null) {
            $ecoles = new Ecoles($this->pdo);
            $limites['plafond'] = $ecoles->reste($compte, $eleve, Ecoles::mois());
            $plafondNul = $ecoles->reglages($compte)['plafond_eleve_microusd'] === 0;
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
        $combinaisons = $reglages->combinaisons();
        $grille = $this->config->read();
        // each combination at its provider's price, by its own route (half price by batches)
        $pireCas = static function (?float $observe, int $octets) use ($reference, $gabarit, $combinaisons, $grille,
                                                                       $prix): float {
            $pire = $observe ?? $reference;
            foreach ($combinaisons as $c) {
                $pire = max($pire, (float) (RunCosts::pireCasDe($grille, $c['fournisseur'], $c['modele'], $gabarit + $octets,
                    $c['budget_sortie'], $c['voie'] === 'lots', $prix) ?? 0));
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
        // by batches, the time is Anthropic's — as soon as one route goes by batches: the reference, made by direct
        // calls, says nothing of it
        $secondes = $modele['secondes_par_journee'] ?? (float) (self::REFERENCE_SECONDES * $poles);
        // the evaluations say it all only when they say what its days and its merge cost
        $observe = ($modele['fusion'] ?? null) !== null && ($retenu['instruites'] === 0 || ($modele['journee'] ?? null) !== null);

        return [
            'estimation' => [
                'cout_usd' => $usd($retenu['jours']['moyenne'] + $retenu['fusion']['moyenne']),
                'min_usd' => $usd($retenu['jours']['min'] + $retenu['fusion']['min']),
                'max_usd' => $usd($retenu['jours']['max'] + $retenu['fusion']['max']),
                'reserve_usd' => $usd($retenu['fusion']['max'] + $retenu['pire_fusion']),
                'duree_s' => $aLots ? null : (int) round($secondes * max(1, $retenu['instruites'])),
            ] + ($observe ? ['evaluations' => $modele['evaluations']] : ['reference' => 'PLANT-01', 'poles' => $poles]),
            'admission' => [
                'journees' => $admises,
                'total' => $total,
                'limite' => $limite,
                'instruites' => $refus === null ? $retenu['instruites'] : 0,
                'en_attente' => $refus === null ? $retenu['attente']['nouvelle'] + $retenu['attente']['changee'] : $aInstruire,
                'changees_en_attente' => $refus === null ? $retenu['attente']['changee'] : $etats[0]['attente']['changee'],
                // what its other runs may still spend of the credit: its owner's own, never a school's to its learner
                'autres_usd' => $limite === 'credit' && $eleve === null ? $usd($autres) : 0.0,
                'refus' => $refus === null ? null : self::refus($refus, (string) $limite, $retenu['besoin'],
                    $limite === 'credit' && $eleve === null ? $autres : 0, $observe, $ecole, $plafondNul),
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
    private static function refus(string $quoi, string $limite, float $besoin, int $autres, bool $observe,
                                  bool $ecole = false, bool $plafondNul = false): string
    {
        if ($limite === 'plafond' && $plafondNul) {
            // its default, 0: nothing paid for its learners until it sets one (ADR-013 §3) — the learner can do
            // nothing but ask it
            return self::PLAFOND_NON_REGLE;
        }
        $sujet = match ($limite) {
            'budget' => 'le budget du profil',
            'plafond' => 'le plafond que votre école vous accorde ce mois-ci',
            default => $ecole ? 'le crédit de votre école' : 'votre crédit',
        };
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
     * The providers a launch's consent names, as its body says them:
     * {fournisseurs: [ids]}, sorted; true, a profile all Anthropic's; null:
     * no consent.
     *
     * @return list<string>|true|null
     */
    private static function accordes(mixed $accord): array|bool|null
    {
        if ($accord === true) {
            return true;
        }
        $liste = \is_array($accord) ? ($accord['fournisseurs'] ?? null) : null;
        if (!\is_array($liste) || $liste === [] || !array_is_list($liste)) {
            return null;
        }
        foreach ($liste as $f) {
            if (!\is_string($f) || !Fournisseurs::connu($f)) {
                return null;
            }
        }

        return self::trie(array_values(array_unique($liste)));
    }

    /** @param list<string> $ids @return list<string> */
    private static function trie(array $ids): array
    {
        sort($ids, SORT_STRING);

        return $ids;
    }

    /**
     * The providers a run's calls reach (CallSettings::fournisseurs()), as a
     * launch's preview shows them for its consent — and the configuration's
     * route for each profile, before any preview (the consent names them
     * before the portfolio leaves the page): each with its label, its GDPR
     * tag and its lane — « mixte » when it has both.
     *
     * @return list<array{id: string, libelle: string, rgpd: string, voie: string}>
     */
    public static function fournisseurs(stdClass $profil): array
    {
        $voies = [];
        foreach ((new CallSettings($profil))->combinaisons() as $c) {
            $voies[$c['fournisseur']][$c['voie']] = true;
        }
        $fournisseurs = [];
        foreach (Fournisseurs::REGISTRE as $id => $registre) {
            if (isset($voies[$id])) {
                $fournisseurs[] = ['id' => $id, 'libelle' => (string) $registre['libelle'],
                                   'rgpd' => (string) $registre['rgpd'],
                                   'voie' => \count($voies[$id]) === 1 ? (string) array_key_first($voies[$id]) : 'mixte'];
            }
        }

        return $fournisseurs;
    }

    /**
     * What a launch and its preview share: the portfolio checked, the
     * profile copied — with the referential chosen at the launch, if any
     * (choisirReferentiel()) — and admitted, the engine and the template set
     * present, the engine's settings drawn from the copy, and the platform
     * built over them as the slices build it.
     *
     * @param array{id: string, version: string|null}|null $referentielChoisi
     * @return array{profil: stdClass, nom: string, moteur: stdClass,
     *               jeu: array{gabarits: array<string, string>, versions: array<string, int>},
     *               referentiel: array<string, mixed>, plateforme: \Twin9\Plateforme, empreinte_reglages: string,
     *               jury_retire: list<string>}
     */
    private function preparer(int $userId, ?int $profilId, string $portfolioNom, string $portfolio,
                              \DateTimeImmutable $horloge, string $sortie, ?array $referentielChoisi = null): array
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
        // T16: an engine before T16 would ignore the run's referential and read RESPIRE's in the set, whatever the
        // profile names; its refusal of a referential is its mark
        if (!class_exists(\Twin9\ReferentielInvalide::class)) {
            throw new Twin9Exception('L’analyse approfondie n’est pas disponible sur cette instance : son moteur précède '
                . 'T16 et ne lit pas le référentiel du run (Twin_v9 à mettre à jour)', 503);
        }

        $politique = new ProfilPolicy($this->pdo, $this->config);
        [$profil, $nom] = $this->profil($userId, $profilId, $politique);
        // S5, lot C: the referential chosen at the launch, in the copy, before its admission — the drafts' rule, a
        // referential not published refused, its version frozen below, a set of before T16 refused, the attestation
        $juryRetire = $referentielChoisi === null ? [] : self::choisirReferentiel($profil, $referentielChoisi);
        $politique->admettre($profil, $userId);
        $politique->admettreAuLancement($profil);
        // an engine without the stigmergy would ignore config.stigmergie: the run, its configuration saying it on,
        // would be the v9.8's
        if (MoteurReglages::stigmergie($profil) && !class_exists(\Twin9\Stigmergie::class)) {
            throw new Twin9Exception('Profil refusé — /stigmergie : le moteur de cette instance ne connaît pas la '
                . 'stigmergie (Twin_v9 à mettre à jour)', 422);
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
        // T16: a set of before T16, the pole files in it, writes RESPIRE in its templates (« 61 », « X.YY »,
        // « référentiel RESPIRE »), the RESPIRE its pole files describe: another referential's readers would be
        // asked for RESPIRE's codes. Since a version of RESPIRE may have another structure (2026-10-20), it serves
        // RESPIRE alone, in the structure of its pole files: the same poles, the same codes in each
        $decrite = self::structureDesFiches($jeu['gabarits']);
        if ($decrite !== null) {
            $respire = $profil->referentiel->id === ReferentielRepository::DEFAULT_REFERENTIEL_ID;
            $version = $respire ? (new ReferentielRepository($this->pdo))->findVersion(
                (string) $profil->referentiel->id, (string) $profil->referentiel->version) : null;
            if (!$respire || ($version !== null && self::structure($version['content']) !== $decrite)) {
                // a copy of a v9.8's set itself before T16 would be refused again: the v9.8's set first
                $remede = $profil->gabarits === TemplateSets::V98 ? 'réimporter le jeu v9.8'
                    : ((new ProtocoleRepository($this->pdo))->get('tagger/P1') !== null
                        ? 'réimporter le jeu v9.8, puis en refaire une copie' : 'refaire une copie du jeu v9.8');
                throw new Twin9Exception('Le jeu de gabarits « ' . $profil->gabarits . ' » précède T16 : ses gabarits '
                    . 'écrivent RESPIRE en toutes lettres' . ($respire ? sprintf(', tel que le décrivent ses fiches '
                        . '(%d pôles, %d compétences)', \count($decrite), array_sum(array_map('count', $decrite))) : '')
                    . '. Pour ' . ($respire ? 'une autre structure de RESPIRE' : 'un autre référentiel') . ', il faut '
                    . $remede, 422);
            }
        }
        // T16: the run's referential, drawn from the base at its frozen version, which the engine reads
        $referentiel = (new ReferentielMoteur($this->pdo))->bloc((string) $profil->referentiel->id,
            (string) $profil->referentiel->version);
        $moteur = MoteurReglages::depuis($profil, $referentiel);
        $empreinteReglages = CallSettings::empreinte($profil, $moteur->config->troncatures ?? null, $jeu['gabarits'],
            $referentiel);
        try {
            $plateforme = new \Twin9\Plateforme(json_encode($moteur, self::JSON), $portfolioNom, $portfolio,
                $jeu['gabarits'], $sortie, $horloge, $empreinteReglages);
        } catch (\Twin9\ReferentielInvalide $e) {
            // the engine names the pole or the code at fault, never a fiche (T16)
            throw new Twin9Exception('Le référentiel « ' . $profil->referentiel->id . ' » ne se lit pas : '
                . preg_replace('/^Référentiel du moteur invalide : /u', '', $e->getMessage()), 422);
        } catch (\ValueError|\RuntimeException $e) {
            // unforeseen since T16 (the fiches come from the base, the set is read lazily, an engine before T16 is
            // refused above); the class only in the log, an engine's message may quote a template
            error_log('[twin9-lancement] ' . $e::class);
            throw new Twin9Exception('Le moteur ne lit pas ce lancement (jeu de gabarits « ' . $profil->gabarits
                . ' »)', 422);
        } catch (\InvalidArgumentException $e) {
            error_log('[twin9-lancement] ' . $e::class);
            throw new Twin9Exception('Portfolio illisible par le moteur', 422);
        }

        return ['profil' => $profil, 'nom' => $nom, 'moteur' => $moteur, 'jeu' => $jeu, 'referentiel' => $referentiel,
                'plateforme' => $plateforme, 'empreinte_reglages' => $empreinteReglages, 'jury_retire' => $juryRetire];
    }

    /**
     * The referential chosen at a launch (S5, lot C), written in the run's
     * copy of its profile: its id, and its version, null for its latest
     * published, which preparer() freezes. When the id is not the profile's,
     * the jury's overrides — a specialist by pole number (jury.specialistes),
     * by competence code (jury.par_competence), both of the profile's
     * referential — would seat a juror on another pole, or on no code: they
     * are emptied, as their default is.
     *
     * @param array{id: string, version: string|null} $choix
     * @return list<string> the overrides emptied, those the profile set: specialistes, par_competence
     */
    private static function choisirReferentiel(stdClass $profil, array $choix): array
    {
        $retire = [];
        if ($choix['id'] !== (string) $profil->referentiel->id) {
            foreach (['specialistes', 'par_competence'] as $cle) {
                if (isset($profil->jury->{$cle}) && (array) $profil->jury->{$cle} !== []) {
                    $profil->jury->{$cle} = new stdClass();
                    $retire[] = $cle;
                }
            }
        }
        $profil->referentiel = (object) ['id' => $choix['id'], 'version' => $choix['version']];

        return $retire;
    }

    /**
     * The engine's versions a run's configuration keeps (P0-1): its commit,
     * the v9.8 protocol's, the jurors' bank's, the scan's — each read under
     * its guard, null when the engine has none (an older one, the tests'
     * fake one).
     *
     * @return array{commit: string|null, protocole: string|null,
     *               personas: array{version: string, empreinte: string}|null, scan: string|null}
     */
    private static function versionsDuMoteur(): array
    {
        $constante = static fn (string $nom): ?string => \defined($nom) && \is_string(\constant($nom))
            ? \constant($nom) : null;
        $personas = null;
        if (method_exists(\Twin9\Tribunal::class, 'infosPersonas')) {
            $infos = \Twin9\Tribunal::infosPersonas();
            if (\is_object($infos) && method_exists($infos, 'get')) {
                $personas = ['version' => (string) $infos->get('version'), 'empreinte' => (string) $infos->get('empreinte')];
            }
        }

        return [
            'commit' => EngineLoader::commit(),
            'protocole' => $constante(\Twin9\Journee::class . '::VERSION_PROTOCOLE'),
            'personas' => $personas,
            'scan' => $constante(\Twin9\Arpenteur::class . '::VERSION_SCAN'),
        ];
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
     * What the pole files of a set of before T16 describe (« tagger/P1 » to
     * « tagger/PN », each « ## CODE — Nom » section a competence of its pole),
     * as structure() writes it; null for a set without pole files.
     *
     * @param array<string, string> $gabarits
     * @return array<int, list<string>>|null
     */
    private static function structureDesFiches(array $gabarits): ?array
    {
        $structure = [];
        foreach ($gabarits as $nom => $contenu) {
            if (preg_match('#^tagger/P([1-9][0-9]*)$#i', (string) $nom, $m) === 1) {
                preg_match_all('/^##[ \t]+(\S+?)[ \t]*—/mu', (string) $contenu, $codes);
                $structure[(int) $m[1]] = $codes[1];
            }
        }

        return $structure === [] ? null : self::normaliser($structure);
    }

    /**
     * A referential's structure: its poles, in order, each with its codes.
     *
     * @param array<string, mixed> $document
     * @return array<int, list<string>>
     */
    private static function structure(array $document): array
    {
        $structure = array_fill_keys(array_map(static fn (array $p): int => (int) $p['num'], $document['poles']), []);
        foreach ($document['competences'] as $c) {
            $structure[(int) $c['pole']][] = (string) $c['code'];
        }

        return self::normaliser($structure);
    }

    /**
     * @param array<int, list<string>> $structure
     * @return array<int, list<string>>
     */
    private static function normaliser(array $structure): array
    {
        ksort($structure);
        foreach ($structure as &$codes) {
            sort($codes, SORT_STRING);
        }

        return $structure;
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
