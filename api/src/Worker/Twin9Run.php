<?php

declare(strict_types=1);

namespace Humanome\Worker;

use Humanome\Twin9\CallJournal;
use Humanome\Twin9\CallSettings;
use Humanome\Twin9\MapStore;
use Humanome\Twin9\RunCosts;
use Twin9\Plateforme;
use Twin9\Run\Call;

/** A Twin9 run during one slice (Twin9Slice): its engine, journal and memory, and where it stands. */
final class Twin9Run
{
    /** @var list<Call> the calls the last pass waits for */
    public array $attendus = [];

    /** @var array<string, int> the calls in flight, by id: their attempt */
    public array $enVol = [];

    /** Answers arrived since the last pass. */
    public bool $nouvelles = false;

    /**
     * By direct calls: its last sending took every place while calls it
     * knows were still to look at (P0-4); false as each sending starts, and
     * when it sends nothing (suspended, past the last departure, by batches).
     */
    public bool $plein = false;

    /** Its passes in this slice. */
    public int $passes = 0;

    /** What holds its direct calls back, for its page (a rate refusal, a key, a cap); null: nothing. */
    public ?string $attente = null;

    /**
     * What its batches say, for its page (Twin9Lots: a batch at Anthropic,
     * calls still to submit, a lost batch, the key…); null: nothing. Its
     * sentinel Twin9Lots::A_SOUMETTRE is never composed with another reason.
     */
    public ?string $attenteLots = null;

    /**
     * What sends nothing more in this slice, with why: a provider (no key,
     * its spending cap, closed on the instance), a provider's model alone
     * (its price key: longer than the slice) or « lots », its batches
     * (Twin9Lots). A provider suspended never holds back another's calls.
     *
     * @var array<string, string>
     */
    public array $suspendus = [];

    /** @var array<string, true> the providers whose guard this slice read (Twin9Slice::garde()) */
    public array $gardes = [];

    /** When the first call it holds back (attempts, Retry-After) may leave; null: none. */
    public ?float $reveil = null;

    /** By batches: the pass whose calls went to their batches in this slice (one submission a slice); 0: none yet. */
    public int $passeSoumise = 0;

    /**
     * Why it stops (P1-5, deferred stop): nothing more leaves, nor is a pass
     * played; the calls in flight come back, or the slice's end cuts them,
     * and are written with their cost; then the slice stops it. Null: it goes on.
     */
    public ?string $arret = null;

    /** What it has committed (RunCosts): the worst cases its calls hold, the real costs settled, in micro-USD. */
    public int $engage = 0;

    /** Why no new call of it leaves (RunCosts: its budget, its duration, its owner's credit); null: nothing. */
    public ?string $bloque = null;


    /**
     * The price key of another provider's model whose call this slice held
     * back, its longest call (duree_max_s) outlasting what the slice leaves
     * it (a trigger's shorter slice): the slice keeps since when
     * (twin9_runs.retenu_depuis); null: none held so.
     */
    public ?string $tropLong = null;

    /** Calls it sent in this slice, directly or in batches: while any, it does not stop. */
    public int $envoyes = 0;

    /**
     * @param string $cle "instance" (its owner's credits pay, margin included) or "personnelle"
     * @param bool $routeLots some of its calls go by batches: Anthropic's, its profile's lane « lots » (P1-5)
     * @param int|null $budget its budget in micro-USD (T10); null: none
     * @param float|null $limite when its duration ends (unix time); null: none
     * @param int $reserveFusion what it keeps for its merge, in micro-USD (T8, strategy A)
     * @param bool $routeDirecte some of its calls go directly: another provider's, or Anthropic's by the « directe » lane
     */
    public function __construct(
        public readonly int $id,
        public readonly int $userId,
        public readonly Plateforme $plateforme,
        public readonly CallJournal $journal,
        public readonly MapStore $memoire,
        public readonly \Closure $sortie,
        public readonly CallSettings $reglages,
        public readonly string $cle,
        public readonly int $appelsDirects,
        public readonly int $journeesDeFront,
        public readonly bool $routeLots = false,
        public readonly ?int $budget = null,
        public readonly ?float $limite = null,
        public readonly int $reserveFusion = 0,
        public readonly bool $routeDirecte = true,
    ) {
    }

    /**
     * A provider, or « lots » (its batches), sends nothing more in this
     * slice; $raison, when given, is what its page reads (its batches' or
     * its direct calls').
     */
    public function suspendre(string $voie, ?string $raison = null): void
    {
        $this->suspendus[$voie] = $raison ?? ($this->suspendus[$voie] ?? '');
        if ($raison !== null) {
            if ($voie === 'lots') {
                $this->attenteLots = $raison;
            } else {
                $this->attente = $raison;
            }
        }
    }

    /** Whether a provider, or « lots », sends nothing more in this slice. */
    public function suspendu(string $voie): bool
    {
        return isset($this->suspendus[$voie]);
    }

    /**
     * What holds it back, for its page: its batches' reason, then each
     * provider's suspended and its direct calls' latest; null: nothing.
     * Calls still to submit (Twin9Lots::A_SOUMETTRE) say only that: the
     * next slice reads it exactly, to play the run again.
     */
    public function attente(): ?string
    {
        if ($this->attenteLots === Twin9Lots::A_SOUMETTRE) {
            return Twin9Lots::A_SOUMETTRE;
        }
        $raisons = [$this->attenteLots];
        foreach ($this->suspendus as $voie => $raison) {
            if ($voie !== 'lots') {
                $raisons[] = $raison;
            }
        }
        $raisons[] = $this->attente;
        $raisons = array_values(array_unique(array_filter($raisons,
            static fn (?string $r): bool => $r !== null && $r !== '')));

        return $raisons === [] ? null : implode(' ; ', $raisons);
    }

    /** Whether its owner's credits pay its calls, the margin included: the instance's key. */
    public function credits(): bool
    {
        return $this->cle === 'instance';
    }

    /** Whether its duration has ended. */
    public function horsDuree(): bool
    {
        return $this->limite !== null && microtime(true) >= $this->limite;
    }

    /**
     * Whether to play a pass again (P0-4): answers arrived since the last
     * one, and the calls it already knows did not fill every place — its
     * last sending left one empty, or it sends nothing now (suspended, held
     * back, past the last departure), which lets the final pass come. The
     * slice plays it at once and sends its calls in the same round; a run's
     * first pass of a slice is the slice's to play. While the calls known
     * fill the places, no pass is played: as many calls are in flight, only
     * the order of their departures changes — a day done enters the memory a
     * little later, the oldest days are no longer served first.
     *
     * A variant, ready should a latency show (chains whose next calls wait
     * for the known ones to run out): count the answers since the last pass
     * (Twin9Slice::inscrire) and replay as well once half the places have
     * turned over —
     *     return $this->reponses > 0
     *         && (!$this->plein || $this->reponses >= max(1, intdiv($this->appelsDirects, 2)));
     * a bound of about two passes per appelsDirects answers. (`plein` is read
     * right after the sending that sets it, all places taken then: a term
     * on the calls in flight alone would never add a pass.)
     */
    public function aRejouer(): bool
    {
        return $this->nouvelles && !$this->plein && $this->arret === null;
    }

    /**
     * The days whose calls may leave: by direct calls, the oldest the run has
     * under way, as many as it leads abreast (parallelisme.journees); with
     * calls by batches, all of them (T8, strategy A: each wave waits a whole
     * batch), its direct calls bounded by appels_directs alone.
     *
     * @return array<string, true>
     */
    public function joursDeFront(): array
    {
        $jours = [];
        foreach ($this->attendus as $call) {
            $jour = self::jour($call->id);
            if ($jour !== null && !isset($jours[$jour]) && ($this->routeLots || \count($jours) < $this->journeesDeFront)) {
                $jours[$jour] = true;
            }
        }

        return $jours;
    }

    /** What a call may not eat into: the merge's reserve for a day's (T8, strategy A), nothing for the merge's. */
    public function plancher(Call $call): int
    {
        return self::jour($call->id) !== null ? $this->reserveFusion : 0;
    }

    /**
     * Why a new call may not hold its worst case now (T10, T8), or null: its
     * budget, or its owner's credit ($solde, with the instance's key; null
     * otherwise), would go below what it may not eat into — for a day's call,
     * its run's merge reserve; for the credit, what its owner's other runs in
     * progress may still spend too ($autres, read with $solde:
     * RunRepository::disponible()).
     */
    public function retenue(Call $call, int $reserve, ?int $solde, int $autres = 0): ?string
    {
        $propre = $this->plancher($call);
        if ($this->budget !== null && $this->engage + $reserve > $this->budget - $propre) {
            return $this->engage + $reserve > $this->budget ? RunCosts::BUDGET : RunCosts::RESERVE_BUDGET;
        }

        return match (true) {
            $solde === null => null,
            $reserve > $solde => RunCosts::CREDIT,
            $reserve > $solde - $propre => RunCosts::RESERVE_CREDIT,
            $reserve > $solde - $propre - $autres => RunCosts::AUTRES,
            default => null,
        };
    }

    /** The day a call belongs to ("journees/<day>/"), or null for the merge's. */
    public static function jour(string $id): ?string
    {
        return preg_match('#^journees/[^/]+/#', $id, $m) === 1 ? $m[0] : null;
    }
}
