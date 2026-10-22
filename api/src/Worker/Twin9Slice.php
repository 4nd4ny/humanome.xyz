<?php

declare(strict_types=1);

namespace Humanome\Worker;

use Humanome\Twin9\BatchApi;
use Humanome\Twin9\CallJournal;
use Humanome\Twin9\CallSender;
use Humanome\Twin9\CallSettings;
use Humanome\Twin9\Fournisseurs\Fournisseurs;
use Humanome\Twin9\MapStore;
use Humanome\Twin9\RunCosts;
use Humanome\Twin9\RunKey;
use Humanome\Twin9\RunRepository;
use Humanome\Twin9\SoldeInsuffisantException;
use Humanome\Twin9\Twin9Config;
use PDO;
use Twin9\Plateforme;
use Twin9\Run\Call;
use Twin9\Run\Pending;

/**
 * The Twin9 part of a tick (ADR-011 §2, Twin_v9's docs/plan-twin9-php.md, lot
 * 1): at most N runs advance within the slice. Each pass replays a run from
 * its start, its answers taken from the journal, its days done from the
 * memory; the calls it waits for leave, concurrently, and each answer is
 * written as it comes back; a place an answer frees goes to a call the last
 * pass already knows, and a new pass is played, its calls sent at once, only
 * when those cannot fill it (P0-4, Twin9Run::aRejouer). A call is written to
 * the journal before it leaves and after it comes back; no transaction stays
 * open while one waits.
 *
 * Attempts are the v9.8's (three, two then four seconds apart), within the
 * slice: a rate refusal waits its Retry-After without spending one, a 429
 * without one (a spending cap) holds the run back, a refusal of the model is
 * a failure, and so is an output cut by its budget or by the model's context
 * (P0-2, counted in `tronques`). A call the slice's end cuts leaves again in
 * the next one; when it had at least half a slice, the cut counts as an
 * attempt, so that a call too long for any slice ends as a failure instead
 * of being paid again and again. A tick that dies leaves its calls in flight
 * sent: the next takes them up, their attempt counted.
 *
 * By direct calls, only the oldest days a run has under way send their calls
 * (the days led abreast, parallelisme.journees), at most
 * parallelisme.appels_directs at a time; by batches, all its days (T8). The
 * key is read for each call. Logging: counters only. Each pass the slice
 * plays of a run is counted as soon as it is played, with the engine's time
 * (twin9_runs.passes, moteur_ms: its execution block's, P0-1): a tick that
 * dies loses only the pass it was playing.
 *
 * A run by batches (T8, Twin9Lots) is opened only when its batches call for
 * it: one has ended, nothing is at Anthropic any more, or calls are still to
 * submit; otherwise the slice only asks Anthropic where its batches stand,
 * and it does not count among the N runs. Played, its pass's calls leave in
 * bounded batches. The batches of runs no longer in progress are collected
 * first, once ended — cancelled before, for a run its owner cancelled —,
 * their answers written with their cost, then deleted (Twin9Lots::menage).
 *
 * Each call goes its own route (P1-5, ADR-012): by batches when its provider
 * is Anthropic and its profile's lane « lots », directly otherwise. A run
 * with a direct route is opened at every slice, its batches collected
 * first. Its batches leave once a slice, at its head, before its direct
 * calls — the calls by batches a later pass reveals go at the next slice —;
 * while a request of the batch lane waits, the slice reads the direct calls
 * in flight. The direct loop never sends a call by batches. A provider is
 * suspended alone (its key, its spending cap, closed on the instance): it
 * never holds another's calls back, nor the batches. The guard — the
 * providers the instance opens, the instance's key of a third party, never a
 * personal key beyond Anthropic — is read again as each slice opens a run.
 * Another provider's call leaves only if its model's longest call
 * (duree_max_s, the price grid's) fits in what remains of the slice: cut, it
 * may be billed all the same; each cut is counted in the journal. After a
 * 429, the instance's key rests from that provider for every run of the
 * slice; refused (HTTP 401, 403: revoked, mistyped), its calls wait as on a
 * spending cap, no attempt spent — counted for the administrator
 * (`clesRefusees`), never said on a run's page. A third party refusing a
 * call's settings (HTTP 400), a run held more than thirty minutes by a third
 * party's spending cap or its key refused, a batch refused,
 * a price missing, the engine failing: the run stops, deferred — nothing
 * more leaves, the calls in flight come back or are cut, written with their
 * cost, then it stops and what its calls hold goes back; its batch still at
 * Anthropic is collected once ended, never cancelled (Twin9Lots::menage).
 *
 * A call leaves holding its worst case (T10, RunCosts): debited from its
 * owner's credits with the instance's key, counted against the run's budget.
 * A call whose worst case its budget or its owner's credit cannot hold does
 * not leave, nor any new one after it; a day's call does not eat into what
 * the run keeps for its merge either, nor any call into what its owner's
 * other runs in progress may still spend (T8, Twin9Run::retenue()); once its
 * duration has ended, none leaves. The slice settles what its calls'
 * outcomes free, and a run held back that has nothing out any more stops, its
 * map incomplete, to resume. A run done leaves its evaluation (T8,
 * Evaluations).
 */
final class Twin9Slice
{
    /** The v9.8's attempts of a call (aurora/backends.py: RETRIES = 2). */
    public const TENTATIVES = 3;

    /** The v9.8's pauses between attempts, in seconds: 2 × (attempt + 1). */
    public const PAUSES = [2.0, 4.0];

    /** A spending cap answers 429 without Retry-After: the run's calls wait this long. */
    public const PAUSE_PLAFOND = 60.0;

    /** A run held this long, in seconds, by another provider's spending cap stops, its reserve given back (P1-5). */
    public const PLAFOND_MAX = 1800.0;

    /** Another provider's longest call, in seconds, when its grid entry says none (Twin9Config: duree_max_s). */
    public const DUREE_MAX = 30;

    /** Why a run cancelled during the slice sends nothing more (Twin9Run::$arret); never written: it is cancelled. */
    private const ANNULE = 'annulé par son auteur';

    /** The runs by batches a slice may look at beyond its N, their batches still at Anthropic. */
    private const SURVOLS = 20;

    private readonly RunRepository $runs;

    private readonly RunCosts $couts;

    private readonly Twin9Lots $lots;

    /** @var list<float> */
    private readonly array $pauses;

    /** @var array<int, Twin9Run> the runs of the slice, by id */
    private array $etats = [];

    /** @var array<string, int> */
    private array $compteurs = [];

    private float $debut = 0.0;

    private float $fin = 0.0;

    private float $dernierDepart = 0.0;

    /** @var array<string, float> by provider: until when the instance's key rests from it after a 429 (P1-5) */
    private array $repos = [];

    /** @var array<string, array<string, mixed>>|null the price grid, read once a slice */
    private ?array $grille = null;

    /** @var list<string>|null the providers the instance opens, read once a slice */
    private ?array $actifs = null;

    /** @var array<string, true> the calls held back by their model's longest call (« run:call »), counted once */
    private array $gardes = [];

    /** @param array{pauses?: list<float>, octets?: int, fenetre?: float} $options tests: shorter pauses, smaller batches, a shorter window to find a lost batch */
    public function __construct(
        private readonly PDO $pdo,
        private readonly CallSender $sender,
        private readonly RunKey $cles,
        private readonly Twin9Config $config,
        BatchApi $lots,
        array $options = [],
    ) {
        $this->runs = new RunRepository($pdo);
        $this->couts = new RunCosts($pdo, $config);
        $this->lots = new Twin9Lots($pdo, $lots, $cles, $this->couts, $options['octets'] ?? Twin9Lots::OCTETS,
            $options['fenetre'] ?? Twin9Lots::FENETRE);
        $this->pauses = $options['pauses'] ?? self::PAUSES;
    }

    /**
     * Advances at most $n runs from $debut until $fin (microtime).
     *
     * @param int|null $utilisateur those of one user only: the page of their run advances them (T9)
     * @return array<string, int> the slice's counters
     */
    public function advanceUntil(int $n, float $debut, float $fin, ?int $utilisateur = null): array
    {
        $this->debut = $debut;
        $this->fin = $fin;
        $this->dernierDepart = $debut + self::dureeAdmise($fin - $debut);
        $this->repos = [];
        $this->grille = null;
        $this->actifs = null;
        $this->gardes = [];
        $this->compteurs = ['runs' => 0, 'passes' => 0, 'moteurMs' => 0, 'appels' => 0, 'reponses' => 0, 'pannes' => 0,
                            'tronques' => 0, 'reprises' => 0, 'coupes' => 0, 'gardes' => 0, 'termines' => 0,
                            'echoues' => 0, 'lots' => 0, 'releves' => 0, 'verifications' => 0, 'annules' => 0,
                            'depassements' => 0, 'clesRefusees' => 0];
        $this->lots->menage($this->dernierDepart, $this->compteurs, $utilisateur);
        // the runs cancelled (or stopped) between two slices, or whose tick died: what their calls hold goes back, at
        // its real cost for a call answered — no slice holds their calls in flight now (the worker's lock)
        foreach ($this->runs->aSolder(self::SURVOLS, $utilisateur) as $id) {
            $this->depasse($this->couts->liberer($id));
        }
        foreach ($this->runs->aAvancer($n + self::SURVOLS, $utilisateur) as $id) {
            if ($this->compteurs['runs'] >= $n || microtime(true) >= $this->dernierDepart) {
                break;
            }
            $run = $this->ouvrir($id);
            if ($run !== null) {
                $this->etats[$id] = $run;
                $this->compteurs['runs']++;
            }
        }

        while ($this->etats !== [] && microtime(true) < $this->fin) {
            foreach ($this->etats as $run) {
                if ($run->passes === 0) {
                    $this->passer($run);
                }
            }
            foreach ($this->etats as $run) {
                $this->envoyer($run);
                // the calls known could not fill the places the answers freed (P0-4): a pass, and its calls leave now
                if (isset($this->etats[$run->id]) && $run->aRejouer()) {
                    $this->passer($run);
                    if (isset($this->etats[$run->id])) {
                        $this->envoyer($run);
                    }
                }
            }
            $reveil = $this->reveil();
            if ($this->sender->running() === 0) {
                if ($reveil === null || $reveil >= $this->dernierDepart) {
                    break;
                }
                usleep(max(0, (int) ((min($reveil, $this->fin) - microtime(true)) * 1_000_000)));
                continue;
            }
            foreach ($this->sender->wait(min($this->fin, $reveil ?? $this->fin)) as $issue) {
                $this->inscrire($issue);
            }
        }
        $this->couper();
        foreach ($this->etats as $run) {
            if ($this->runs->statut($run->id) !== 'en_cours') {
                // cancelled meanwhile, its calls in flight now back or cut: what they hold is settled, at its real
                // cost for an answer
                $this->depasse($this->couts->liberer($run->id));
                continue;
            }
            // to stop, its calls in flight now back or cut, written with their cost (deferred stop)
            if ($run->arret !== null) {
                $this->arreter($run->id, $run->arret);
                continue;
            }
            $this->depasse($this->couts->regler($run->id));
            // held back with nothing out any more: it stops, its map incomplete, to resume
            if ($run->bloque !== null && $run->envoyes === 0 && $this->lots->enVol($run->id) === 0) {
                $this->arreter($run->id, $run->bloque);
                continue;
            }
            $this->runs->avance($run->id, $run->bloque ?? $run->attente());
        }
        $this->compteurs['gardes'] = \count($this->gardes);

        return $this->compteurs;
    }

    private function ouvrir(int $id): ?Twin9Run
    {
        $tete = $this->runs->tete($id);
        if ($tete === null || $tete['statut'] !== 'en_cours') {
            return null;
        }
        // its routes (P1-5): Anthropic's calls by batches when its profile says so, every other directly
        $routes = new CallSettings($tete['profil']);
        $routeLots = ($tete['profil']->voie ?? null) === 'lots' && $routes->combinaisons('lots') !== [];
        $routeDirecte = $routes->combinaisons('directe') !== [];
        $attenteLots = null;
        if ($routeLots) {
            $releve = $this->lots->relever($id, $tete['user_id'], $tete['attente'], $this->fin, $this->compteurs);
            // by batches alone, it is played only when its batches call for it; with a direct route, at every slice
            if (!$releve['jouer'] && !$routeDirecte) {
                $this->runs->avance($id, $releve['attente']);

                return null;
            }
            $attenteLots = $routeDirecte ? $releve['attente'] : null;
        }
        $r = $this->runs->charger($id);
        if ($r === null) {
            return null;
        }
        $profil = $r['profil'];
        $journal = new CallJournal($this->pdo, $id);
        $this->compteurs['reprises'] += $journal->reprendreLesCoupes(self::TENTATIVES);
        $this->depasse($this->couts->regler($id));
        $plafonds = RunCosts::plafonds($profil, $r['debut']);
        try {
            $moteur = json_decode($r['moteur'], false, 512, JSON_THROW_ON_ERROR);
            $plateforme = new Plateforme($r['moteur'], $r['portfolio_nom'], $r['portfolio'], $r['gabarits'],
                $r['sortie'], $r['horloge'],
                CallSettings::empreinte($profil, $moteur->config->troncatures ?? null, $r['gabarits'],
                    $moteur->referentiel ?? null));
        } catch (\Throwable $e) {
            $this->echec($id, $e, 'réglages, portfolio ou gabarits illisibles par le moteur');

            return null;
        }

        $run = new Twin9Run(
            $id,
            $r['user_id'],
            $plateforme,
            $journal,
            new MapStore($this->pdo, $r['carte_id']),
            fn (string $chemin, string $contenu) => $this->runs->ecrireSortie($id, $chemin, $contenu),
            new CallSettings($profil),
            (string) $profil->cle,
            max(1, (int) $profil->parallelisme->appels_directs),
            max(1, (int) $profil->parallelisme->journees),
            $routeLots,
            $plafonds['budget'],
            $plafonds['limite'],
            $r['reserve_fusion'],
            $routeDirecte,
        );
        $run->engage = $this->couts->engage($id);
        $run->attenteLots = $attenteLots;
        $this->garder($run);

        return $run;
    }

    /**
     * The guard of a run's providers, read again as each slice opens it
     * (P1-5, ADR-012), for each provider its calls reach.
     */
    private function garder(Twin9Run $run): void
    {
        foreach ($run->reglages->fournisseurs() as $fournisseur) {
            $this->garde($run, $fournisseur);
        }
    }

    /**
     * Whether a run's calls may go to a provider in this slice, read once a
     * slice for each (as the slice opens the run, and for any provider a
     * call names besides): a provider the instance no longer opens, a third
     * party its owner's personal key would reach, or one whose instance key
     * is missing sends nothing — the run waits; its other providers go on.
     * Its page says the provider is unavailable on this instance, the same
     * words whether it is closed or its instance key missing: nobody learns
     * which keys the instance holds (ProfilPolicy) — the administrator reads
     * both on their page. Anthropic's key is read as each call or batch
     * leaves, as before.
     */
    private function garde(Twin9Run $run, string $fournisseur): bool
    {
        if (!isset($run->gardes[$fournisseur])) {
            $run->gardes[$fournisseur] = true;
            $this->actifs ??= $this->config->fournisseursActifs();
            $nom = Fournisseurs::REGISTRE[$fournisseur]['libelle'] ?? $fournisseur;
            if (!\in_array($fournisseur, $this->actifs, true)) {
                $run->suspendre($fournisseur, self::indisponible($fournisseur));
                if ($fournisseur === Fournisseurs::DEFAUT) {
                    $run->suspendre('lots', self::indisponible($fournisseur));
                }
            } elseif ($fournisseur !== Fournisseurs::DEFAUT && !$run->credits()) {
                $run->suspendre($fournisseur, 'clé personnelle refusée chez ' . $nom);
            } elseif ($fournisseur !== Fournisseurs::DEFAUT
                && $this->cles->pour($run->userId, $run->cle, $fournisseur) === null) {
                $run->suspendre($fournisseur, self::indisponible($fournisseur));
            }
        }

        return !$run->suspendu($fournisseur);
    }

    /**
     * What a run's page says of a provider its calls may not reach on this
     * instance: closed, its instance key missing or refused — one sentence,
     * never which.
     */
    public static function indisponible(string $fournisseur): string
    {
        return 'fournisseur ' . (Fournisseurs::REGISTRE[$fournisseur]['libelle'] ?? $fournisseur)
            . ' indisponible sur cette instance';
    }

    /** One pass of a run, counted as soon as it is played (P0-1): done, or the calls it waits for. */
    private function passer(Twin9Run $run): void
    {
        if ($this->annule($run)) {
            return;
        }
        $run->nouvelles = false;
        $run->passes++;
        $this->compteurs['passes']++;
        $debut = hrtime(true);
        $erreur = null;
        try {
            $run->plateforme->passe($run->journal, $run->memoire, $run->sortie);
        } catch (Pending $p) {
            $run->attendus = $p->calls;

            return;
        } catch (\Throwable $e) {
            $erreur = $e;
        } finally {
            $ms = intdiv(hrtime(true) - $debut, 1_000_000);
            $this->compteurs['moteurMs'] += $ms;
            // before anything else of the slice, which may die: its final pass before terminer() freezes them
            $this->runs->compter($run->id, 1, $ms);
        }
        if ($erreur !== null && $run->enVol !== []) {
            // its calls in flight come back first, written with their cost (deferred stop); the class only in the log
            error_log(sprintf('[twin9] run %d : %s (%s)', $run->id, 'erreur du moteur', $erreur::class));
            $run->arret ??= 'erreur du moteur';

            return;
        }
        unset($this->etats[$run->id]);
        if ($erreur !== null) {
            $this->echec($run->id, $erreur, 'erreur du moteur');

            return;
        }
        $this->depasse($this->couts->liberer($run->id));
        // its evaluation (T8): the size of each day of its map — those it took, those its memory keeps —, as the
        // engine reads them; unknown, its costs alone
        try {
            $vue = method_exists($run->plateforme, 'apercu') ? $run->plateforme->apercu($run->memoire) : null;
            $octets = $vue === null ? [] : array_column([...$vue['journees'], ...($vue['memoire'] ?? [])], 'octets', 'id');
        } catch (\Throwable $e) {
            error_log('[twin9-slice] taille des journées : ' . $e::class);
            $octets = [];
        }
        if ($this->runs->terminer($run->id, array_map(intval(...), $octets),
            $run->credits() ? $this->config->marge() : 1.0)) {
            $this->compteurs['termines']++;
        }
    }

    /**
     * The calls of a run that may leave now: into its batches once a slice,
     * at its head (P1-5: at most one submission a run and a slice, the calls
     * by batches its first pass knows), then directly — never a call by
     * batches. Directly, whether they took every place (Twin9Run::$plein).
     * A run to stop sends nothing more.
     */
    private function envoyer(Twin9Run $run): void
    {
        $run->reveil = null;
        $run->plein = false;
        if ($run->arret !== null || microtime(true) >= $this->dernierDepart || $this->annule($run)) {
            return;
        }
        if ($run->routeLots && $run->passes > 0 && $run->passeSoumise === 0 && !$run->suspendu('lots')) {
            $refus = $this->lots->soumettre($run, $this->debut, $this->dernierDepart, $this->fin, $this->compteurs,
                fn () => $this->pendant());
            if ($refus !== null) {
                $run->arret ??= $refus; // its direct calls in flight come back first

                return;
            }
        }
        if (!$run->routeDirecte || microtime(true) >= $this->dernierDepart) {
            return;
        }
        if ($run->horsDuree()) {
            $run->bloque = RunCosts::DUREE;

            return;
        }
        $jours = $run->joursDeFront();
        foreach ($run->attendus as $call) {
            if (\count($run->enVol) >= $run->appelsDirects) {
                $run->plein = true;

                return;
            }
            $jour = Twin9Run::jour($call->id);
            if (isset($run->enVol[$call->id]) || ($jour !== null && !isset($jours[$jour]))) {
                continue;
            }
            $reglage = $run->reglages->pour($call->step, $call->id);
            // the call's provider, decided once: its route, its key, its price, its caller (Fournisseurs\Registre); a
            // call by batches is the batch lane's alone, a provider suspended sends nothing more
            $fournisseur = $reglage['fournisseur'];
            if ($reglage['voie'] === 'lots' || $run->suspendu($fournisseur) || !$this->garde($run, $fournisseur)) {
                continue;
            }
            $tentative = 1;
            $detenu = null;
            $etat = $run->journal->etat($call->id);
            if ($etat !== null && $etat['sha256'] === $call->sha256) {
                if ($etat['statut'] === 'repondu' || $etat['statut'] === 'panne') {
                    continue;
                }
                if ($etat['reprise_at'] !== null && $etat['reprise_at'] > microtime(true)) {
                    $run->reveil = min($run->reveil ?? INF, $etat['reprise_at']);
                    continue;
                }
                $tentative = $etat['tentatives'] + 1;
                $detenu = $etat['reserve'];
            }
            // the instance's key rests from a provider after its 429, for every run of the slice
            $repos = $run->credits() ? ($this->repos[$fournisseur] ?? null) : null;
            if ($repos !== null && $repos > microtime(true)) {
                $run->reveil = min($run->reveil ?? INF, $repos);
                continue;
            }
            $tiers = $fournisseur !== Fournisseurs::DEFAUT;
            $entree = $tiers ? ($this->grille()[Fournisseurs::clePrix($fournisseur, $reglage['modele'])] ?? []) : [];
            // another provider's call leaves only if its longest may end within the slice: cut, it may be billed all
            // the same (OpenRouter documents it); it leaves at the next slice — never, longer than a slice
            $duree = $tiers ? (float) ($entree['duree_max_s'] ?? self::DUREE_MAX) : 0.0;
            if ($tiers && $this->dernierDepart - $this->debut < $duree) {
                $run->suspendre($fournisseur, 'un appel à ' . Fournisseurs::clePrix($fournisseur, $reglage['modele'])
                    . ' peut durer plus qu’une tranche (duree_max_s de la grille)');
                continue;
            }
            if ($tiers && $this->fin - microtime(true) < $duree) {
                $this->gardes[$run->id . ':' . $call->id] = true;
                continue;
            }
            // a call already holding its worst case leaves with it; a new one holds its own, if it can
            $reserve = null;
            if ($detenu === null) {
                if ($run->bloque !== null) {
                    continue;
                }
                $reserve = $this->couts->pireCas($fournisseur, $reglage['modele'], $call->prompt,
                    $reglage['budget_sortie'], false, $run->credits());
                if ($reserve === null) {
                    // its calls in flight come back first (deferred stop)
                    $run->arret ??= 'aucun prix pour ' . Fournisseurs::clePrix($fournisseur, $reglage['modele'])
                        . ' sur cette instance';

                    return;
                }
                // never into the merge's reserve for a day's call, nor into what the owner's other runs may
                // still spend (T8): the credit and their commitments read together, as they are now
                ['solde' => $solde, 'autres' => $autres] = $run->credits()
                    ? $this->runs->disponible($run->userId, $run->id) : ['solde' => null, 'autres' => 0];
                $retenue = $run->retenue($call, $reserve, $solde, $autres);
                if ($retenue !== null) {
                    $run->bloque = $retenue;
                    continue;
                }
            }
            $cle = $this->cles->pour($run->userId, $run->cle, $fournisseur);
            if ($cle === null) {
                // Anthropic's, as before (a personal key may be its owner's to set); another's, never why
                $run->suspendre($fournisseur, $tiers ? self::indisponible($fournisseur) : 'clé Anthropic indisponible');
                continue;
            }
            // its owner may cancel it at any moment: read before each departure, nothing leaves once cancelled
            if ($this->annule($run)) {
                return;
            }
            if (!$this->partir($run, $call, $fournisseur, $reglage['modele'], $tentative, $reserve)) {
                continue;
            }
            // the reasoning setting of its model's grid entry, if the administrator named one (ADR-012 §6)
            $param = $entree['reflexion_param'] ?? null;
            if (\is_string($param)) {
                $reglage['reflexion_param'] = $param;
            }
            $this->sender->send($run->id, $call, $reglage, $cle, $this->fin);
            $run->enVol[$call->id] = $tentative;
            $run->envoyes++;
            $this->compteurs['appels']++;
        }
    }

    /**
     * A call written as sent, with the worst case it newly holds, debited
     * from its owner's credits with the instance's key, in one transaction,
     * under its model's price key. False when the credit does not cover it:
     * it does not leave.
     */
    private function partir(Twin9Run $run, Call $call, string $fournisseur, string $modele, int $tentative,
                            ?int $reserve): bool
    {
        if ($reserve === null) {
            $run->journal->envoye($call, $modele, $tentative, null, null, null, $fournisseur);

            return true;
        }
        $this->pdo->beginTransaction();
        try {
            if ($run->credits()) {
                $this->couts->debiter($run->userId, $run->id, $call->step, Fournisseurs::clePrix($fournisseur, $modele),
                    $reserve);
            }
            $run->journal->envoye($call, $modele, $tentative, null, null, $reserve, $fournisseur);
            $this->pdo->commit();
        } catch (SoldeInsuffisantException) {
            $this->pdo->rollBack();
            $run->bloque = RunCosts::CREDIT;

            return false;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            $run->journal->oublier();
            throw $e;
        }
        $run->engage += $reserve;

        return true;
    }

    /**
     * Whether its owner cancelled the run meanwhile (the route, which frees
     * nothing itself). With calls in flight, it stays in the slice, sending
     * nothing more (deferred, as a stop): they come back, or the slice's end
     * cuts them, written with their cost, and the slice's end settles what
     * they hold at their real cost — never lost, never free. Without, it
     * leaves the slice, which settles it as well.
     */
    private function annule(Twin9Run $run): bool
    {
        if ($this->runs->statut($run->id) === 'en_cours') {
            return false;
        }
        if ($run->enVol !== []) {
            $run->arret ??= self::ANNULE;
        } else {
            unset($this->etats[$run->id]);
            $this->depasse($this->couts->liberer($run->id));
        }

        return true;
    }

    /** @param array<string, mixed> $issue an outcome of the sender */
    private function inscrire(array $issue): void
    {
        $run = $this->etats[$issue['run']] ?? null;
        $call = $issue['appel'];
        if ($run === null) {
            return;
        }
        $tentative = $run->enVol[$call->id] ?? 1;
        unset($run->enVol[$call->id]);
        $reglage = $run->reglages->pour($call->step, $call->id);
        $mesure = [
            'modele_servi' => $issue['modele_servi'] ?? null,
            'stop_reason' => $issue['stop_reason'] ?? null,
            'tokens_in' => $issue['tokens_in'] ?? null,
            'tokens_out' => $issue['tokens_out'] ?? null,
            'cout_microusd' => isset($issue['tokens_in'])
                ? $this->couts->cout($reglage['fournisseur'], $reglage['modele'], (int) $issue['tokens_in'],
                    (int) ($issue['tokens_out'] ?? 0), false, $run->credits())
                : null,
            'duree_ms' => (int) round(((float) $issue['duree']) * 1000),
        ];
        if ($issue['ok']) {
            $run->journal->repondu($call, (string) $issue['texte'], $mesure);
            $run->nouvelles = true;
            $this->compteurs['reponses']++;

            return;
        }
        if (!empty($issue['refus']) || !empty($issue['tronque']) || !empty($issue['panne'])) {
            // refused, cut (P0-2) or stopped otherwise: the same prompt would be again, at the same cost — never
            // retried
            $run->journal->panne($call, (string) $issue['erreur'], $mesure);
            $run->nouvelles = true;
            $this->compteurs['pannes']++;
            if (!empty($issue['tronque'])) {
                $this->compteurs['tronques']++;
            }

            return;
        }
        $fournisseur = $reglage['fournisseur'];
        $tiers = $fournisseur !== Fournisseurs::DEFAUT;
        $nom = Fournisseurs::REGISTRE[$fournisseur]['libelle'];
        if ($tiers && !empty($issue['cle_refusee'])) {
            // the instance's key refused by another provider (revoked, mistyped): every call to it would be — the
            // call waits, its attempt given back, as on a spending cap, the instance's key resting from the provider
            // for every run of the slice; the page says it unavailable, never why; held thirty minutes, it stops
            $reprise = microtime(true) + self::PAUSE_PLAFOND;
            $this->repos[$fournisseur] = max($this->repos[$fournisseur] ?? 0.0, $reprise);
            $depuis = $run->journal->plafond($call, $reprise, $tentative - 1);
            $run->suspendre($fournisseur, self::indisponible($fournisseur));
            if ($depuis >= self::PLAFOND_MAX) {
                $run->arret ??= self::indisponible($fournisseur) . ' depuis plus de '
                    . (int) round(self::PLAFOND_MAX / 60) . ' minutes : le run s’arrête, sa réserve est rendue';
            }
            $this->compteurs['clesRefusees']++;

            return;
        }
        if ($tiers && !empty($issue['configuration'])) {
            // another provider refuses the call's settings (HTTP 400): the same request would be refused again — the
            // call waits, its attempt given back, and the run stops once its calls in flight are back (deferred stop),
            // to resume once its settings or the grid are mended
            $run->journal->plusTard($call, microtime(true), $tentative - 1);
            $run->arret ??= $nom . ' refuse les réglages de l’appel au modèle ' . $reglage['modele']
                . ' (HTTP 400) : le run s’arrête, à reprendre une fois ses réglages ou ceux de la grille corrigés';
            $this->compteurs['reprises']++;

            return;
        }
        // a spending cap or a quota, as the provider's caller reads it; at Anthropic, a 429 without Retry-After
        $plafond = (bool) ($issue['plafond']
            ?? (($issue['http'] ?? null) === 429 && ($issue['attendre'] ?? null) === null));
        if (!empty($issue['debit']) && ($plafond || ($issue['attendre'] ?? null) !== null)) {
            // a rate refusal spends no attempt
            $reprise = microtime(true) + ($plafond ? self::PAUSE_PLAFOND : (float) $issue['attendre']);
            if ($run->credits() && ($plafond || ($issue['http'] ?? null) === 429)) {
                // the instance's key: every run of the slice rests from this provider as long
                $this->repos[$fournisseur] = max($this->repos[$fournisseur] ?? 0.0, $reprise);
            }
            if ($plafond) {
                $depuis = $run->journal->plafond($call, $reprise, $tentative - 1);
                $run->suspendre($fournisseur, 'plafond de dépense atteint chez ' . ($tiers ? $nom : 'le fournisseur'));
                if ($tiers && $depuis >= self::PLAFOND_MAX) {
                    // held this long by a third party's cap: it stops, what its calls hold given back (deferred stop)
                    $run->arret ??= 'plafond de dépense atteint chez ' . $nom . ' depuis plus de '
                        . (int) round(self::PLAFOND_MAX / 60) . ' minutes : le run s’arrête, sa réserve est rendue';
                }
            } else {
                $run->journal->plusTard($call, $reprise, $tentative - 1);
                $run->attente = 'débit du fournisseur' . ($tiers ? ' ' . $nom : '');
            }
            $this->compteurs['reprises']++;

            return;
        }
        if ($tentative >= self::TENTATIVES) {
            $run->journal->panne($call, 'échec après ' . self::TENTATIVES . ' tentatives : ' . $issue['erreur'], $mesure);
            $run->nouvelles = true;
            $this->compteurs['pannes']++;

            return;
        }
        $run->journal->plusTard($call, microtime(true) + $this->pauses[$tentative - 1], $tentative);
        $this->compteurs['reprises']++;
    }

    /** The slice ends: the calls still running are cut, and leave again in the next one. */
    private function couper(): void
    {
        foreach ($this->sender->abort() as $coupe) {
            $run = $this->etats[$coupe['run']] ?? null;
            if ($run === null) {
                continue;
            }
            $call = $coupe['appel'];
            $tentative = $run->enVol[$call->id] ?? 1;
            unset($run->enVol[$call->id]);
            $compte = $coupe['duree'] >= ($this->fin - $this->debut) / 2;
            if ($compte && $tentative >= self::TENTATIVES) {
                $run->journal->panne($call, 'délai dépassé : l\'appel ne tient pas dans une tranche');
                $this->compteurs['pannes']++;
            } else {
                // counted among its cuts, by provider in the run's counters and its execution
                $run->journal->plusTard($call, microtime(true), $compte ? $tentative : $tentative - 1, true);
            }
            $this->compteurs['coupes']++;
        }
    }

    /**
     * What a slice of this length leaves another provider's call, in
     * seconds, at its head: the slice, less the margin of its last
     * departure (min(5 s, a tenth) — what the slice spends before its first
     * departures, at the least: its batches collected, a pass played). A
     * model whose longest call (duree_max_s) is longer never leaves — the
     * slice suspends its provider and says why —, and a launch admits none
     * (ProfilPolicy::admettreAuLancement(), Tick::longueurTwin9()).
     */
    public static function dureeAdmise(float $longueur): float
    {
        return $longueur - min(5.0, 0.1 * $longueur);
    }

    /**
     * While a synchronous request of the batch lane waits (Twin9Lots: a
     * check, a submission), the direct calls in flight are read as they come
     * back, never blocking.
     */
    private function pendant(): void
    {
        if ($this->sender->running() === 0) {
            return;
        }
        foreach ($this->sender->wait(microtime(true)) as $issue) {
            $this->inscrire($issue);
        }
    }

    /** @return array<string, array<string, mixed>> the price grid, read once a slice */
    private function grille(): array
    {
        return $this->grille ??= $this->config->modeles();
    }

    /** The earliest moment a call held back may leave, if any. */
    private function reveil(): ?float
    {
        $reveil = null;
        foreach ($this->etats as $run) {
            if ($run->reveil !== null) {
                $reveil = min($reveil ?? INF, $run->reveil);
            }
        }

        return $reveil;
    }

    private function echec(int $id, \Throwable $e, string $raison): void
    {
        // the class only: an engine's message may quote a template or the portfolio
        error_log(sprintf('[twin9] run %d : %s (%s)', $id, $raison, $e::class));
        $this->arreter($id, $raison);
    }

    /** A run stops, for a resumption: what its calls hold goes back (RunCosts). */
    private function arreter(int $id, string $raison): void
    {
        if ($this->runs->echouer($id, $raison)) {
            $this->compteurs['echoues']++;
        }
        $this->depasse($this->couts->liberer($id));
    }

    /** Real costs beyond what their calls held, which the instance pays (RunCosts::solder()), counted. */
    private function depasse(int $n): void
    {
        $this->compteurs['depassements'] = ($this->compteurs['depassements'] ?? 0) + $n;
    }
}
