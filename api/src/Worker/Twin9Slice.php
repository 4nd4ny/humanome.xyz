<?php

declare(strict_types=1);

namespace Humanome\Worker;

use Humanome\Twin9\BatchApi;
use Humanome\Twin9\CallJournal;
use Humanome\Twin9\CallSender;
use Humanome\Twin9\CallSettings;
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
 * written as it comes back; a new pass follows as soon as a call may leave
 * again. A call is written to the journal before it leaves and after it
 * comes back; no transaction stays open while one waits.
 *
 * Attempts are the v9.8's (three, two then four seconds apart), within the
 * slice: a rate refusal waits its Retry-After without spending one, a 429
 * without one (a spending cap) holds the run back, a refusal of the model is
 * a failure. A call the slice's end cuts leaves again in the next one; when
 * it had at least half a slice, the cut counts as an attempt, so that a call
 * too long for any slice ends as a failure instead of being paid again and
 * again. A tick that dies leaves its calls in flight sent: the next takes
 * them up, their attempt counted.
 *
 * By direct calls, only the oldest days a run has under way send their calls
 * (the days led abreast, parallelisme.journees), at most
 * parallelisme.appels_directs at a time; by batches, all its days (T8). The
 * key is read for each call. Logging: counters only.
 *
 * A run by batches (T8, Twin9Lots) is opened only when its batches call for
 * it: one has ended, nothing is at Anthropic any more, or calls are still to
 * submit; otherwise the slice only asks Anthropic where its batches stand,
 * and it does not count among the N runs. Played, its pass's calls leave in
 * bounded batches. The batches of runs no longer in progress are cancelled
 * and deleted first.
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
        $this->dernierDepart = $fin - min(5.0, 0.1 * ($fin - $debut));
        $this->compteurs = ['runs' => 0, 'passes' => 0, 'moteurMs' => 0, 'appels' => 0, 'reponses' => 0, 'pannes' => 0,
                            'reprises' => 0, 'coupes' => 0, 'termines' => 0, 'echoues' => 0, 'lots' => 0,
                            'releves' => 0, 'verifications' => 0, 'annules' => 0];
        $this->lots->menage($this->dernierDepart, $this->compteurs, $utilisateur);
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
                if ($run->aJouer()) {
                    $this->passer($run);
                }
            }
            foreach ($this->etats as $run) {
                $this->envoyer($run);
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
                $this->couts->liberer($run->id); // cancelled meanwhile: what its calls hold goes back
                continue;
            }
            $this->couts->regler($run->id);
            // held back with nothing out any more: it stops, its map incomplete, to resume
            if ($run->bloque !== null && $run->envoyes === 0 && $this->lots->enVol($run->id) === 0) {
                $this->arreter($run->id, $run->bloque);
                continue;
            }
            $this->runs->avance($run->id, $run->bloque ?? $run->attente);
        }

        return $this->compteurs;
    }

    private function ouvrir(int $id): ?Twin9Run
    {
        $tete = $this->runs->tete($id);
        if ($tete === null || $tete['statut'] !== 'en_cours') {
            return null;
        }
        $parLots = ($tete['profil']->voie ?? null) === 'lots';
        if ($parLots) {
            $releve = $this->lots->relever($id, $tete['user_id'], $tete['attente'], $this->fin, $this->compteurs);
            if (!$releve['jouer']) {
                $this->runs->avance($id, $releve['attente']);

                return null;
            }
        }
        $r = $this->runs->charger($id);
        if ($r === null) {
            return null;
        }
        $profil = $r['profil'];
        $journal = new CallJournal($this->pdo, $id);
        $this->compteurs['reprises'] += $journal->reprendreLesCoupes(self::TENTATIVES);
        $this->couts->regler($id);
        $plafonds = RunCosts::plafonds($profil, $r['debut']);
        try {
            $moteur = json_decode($r['moteur'], false, 512, JSON_THROW_ON_ERROR);
            $plateforme = new Plateforme($r['moteur'], $r['portfolio_nom'], $r['portfolio'], $r['gabarits'],
                $r['sortie'], $r['horloge'],
                CallSettings::empreinte($profil, $moteur->config->troncatures ?? null, $r['gabarits']));
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
            $parLots,
            $plafonds['budget'],
            $plafonds['limite'],
            $r['reserve_fusion'],
        );
        $run->engage = $this->couts->engage($id);

        return $run;
    }

    /** One pass of a run: done, or the calls it waits for. */
    private function passer(Twin9Run $run): void
    {
        if ($this->runs->statut($run->id) !== 'en_cours') {
            unset($this->etats[$run->id]); // cancelled meanwhile

            return;
        }
        $run->nouvelles = false;
        $run->passes++;
        $this->compteurs['passes']++;
        $debut = hrtime(true);
        try {
            $run->plateforme->passe($run->journal, $run->memoire, $run->sortie);
        } catch (Pending $p) {
            $run->attendus = $p->calls;

            return;
        } catch (\Throwable $e) {
            unset($this->etats[$run->id]);
            $this->echec($run->id, $e, 'erreur du moteur');

            return;
        } finally {
            $this->compteurs['moteurMs'] += intdiv(hrtime(true) - $debut, 1_000_000);
        }
        unset($this->etats[$run->id]);
        $this->couts->liberer($run->id);
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

    /** The calls of a run that may leave now: directly, or into its batches once a pass. */
    private function envoyer(Twin9Run $run): void
    {
        $run->reveil = null;
        if ($run->suspendu || microtime(true) >= $this->dernierDepart) {
            return;
        }
        if ($run->parLots) {
            if ($run->passes > 0 && !$run->soumis) {
                $refus = $this->lots->soumettre($run, $this->debut, $this->dernierDepart, $this->fin, $this->compteurs);
                if ($refus !== null) {
                    unset($this->etats[$run->id]);
                    $this->arreter($run->id, $refus);
                }
            }

            return;
        }
        if ($run->horsDuree()) {
            $run->bloque = RunCosts::DUREE;

            return;
        }
        $jours = $run->joursDeFront();
        foreach ($run->attendus as $call) {
            if (\count($run->enVol) >= $run->appelsDirects) {
                return;
            }
            $jour = Twin9Run::jour($call->id);
            if (isset($run->enVol[$call->id]) || ($jour !== null && !isset($jours[$jour]))) {
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
            $reglage = $run->reglages->pour($call->step, $call->id);
            // a call already holding its worst case leaves with it; a new one holds its own, if it can
            $reserve = null;
            if ($detenu === null) {
                if ($run->bloque !== null) {
                    continue;
                }
                $reserve = $this->couts->pireCas($reglage['modele'], $call->prompt, $reglage['budget_sortie'], false,
                    $run->credits());
                if ($reserve === null) {
                    unset($this->etats[$run->id]);
                    $this->arreter($run->id, 'aucun prix pour ' . $reglage['modele'] . ' sur cette instance');

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
            $cle = $this->cles->pour($run->userId, $run->cle);
            if ($cle === null) {
                $run->attente = 'clé Anthropic indisponible';
                $run->suspendu = true;

                return;
            }
            if (!$this->partir($run, $call, $reglage['modele'], $tentative, $reserve)) {
                continue;
            }
            $this->sender->send($run->id, $call, $reglage, $cle, $this->fin);
            $run->enVol[$call->id] = $tentative;
            $run->envoyes++;
            $this->compteurs['appels']++;
        }
    }

    /**
     * A call written as sent, with the worst case it newly holds, debited
     * from its owner's credits with the instance's key, in one transaction.
     * False when the credit does not cover it: it does not leave.
     */
    private function partir(Twin9Run $run, Call $call, string $modele, int $tentative, ?int $reserve): bool
    {
        if ($reserve === null) {
            $run->journal->envoye($call, $modele, $tentative);

            return true;
        }
        $this->pdo->beginTransaction();
        try {
            if ($run->credits()) {
                $this->couts->debiter($run->userId, $run->id, $call->step, $modele, $reserve);
            }
            $run->journal->envoye($call, $modele, $tentative, null, null, $reserve);
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
        $modele = $run->reglages->pour($call->step, $call->id)['modele'];
        $mesure = [
            'modele_servi' => $issue['modele_servi'] ?? null,
            'stop_reason' => $issue['stop_reason'] ?? null,
            'tokens_in' => $issue['tokens_in'] ?? null,
            'tokens_out' => $issue['tokens_out'] ?? null,
            'cout_microusd' => isset($issue['tokens_in'])
                ? $this->couts->cout($modele, (int) $issue['tokens_in'], (int) ($issue['tokens_out'] ?? 0), false,
                    $run->credits())
                : null,
            'duree_ms' => (int) round(((float) $issue['duree']) * 1000),
        ];
        if ($issue['ok']) {
            $run->journal->repondu($call, (string) $issue['texte'], $mesure);
            $run->nouvelles = true;
            $this->compteurs['reponses']++;

            return;
        }
        if (!empty($issue['refus'])) {
            $run->journal->panne($call, (string) $issue['erreur'], $mesure);
            $run->nouvelles = true;
            $this->compteurs['pannes']++;

            return;
        }
        if (!empty($issue['debit']) && ($issue['attendre'] !== null || ($issue['http'] ?? null) === 429)) {
            // a rate refusal spends no attempt; without Retry-After, a 429 is a spending cap
            $plafond = $issue['attendre'] === null;
            $run->journal->plusTard($call, microtime(true) + ($plafond ? self::PAUSE_PLAFOND : (float) $issue['attendre']),
                $tentative - 1);
            if ($plafond) {
                $run->attente = 'plafond de dépense atteint chez le fournisseur';
                $run->suspendu = true;
            } else {
                $run->attente = 'débit du fournisseur';
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
                $run->journal->plusTard($call, microtime(true), $compte ? $tentative : $tentative - 1);
            }
            $this->compteurs['coupes']++;
        }
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
        $this->couts->liberer($id);
    }
}
