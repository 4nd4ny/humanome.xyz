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

    public int $passes = 0;

    /** What holds the run back, for its page; null: nothing. */
    public ?string $attente = null;

    /** No more sending in this slice (no key, the provider's spending cap). */
    public bool $suspendu = false;

    /** When the first call it holds back (attempts, Retry-After) may leave; null: none. */
    public ?float $reveil = null;

    /** By batches: the calls of its pass have gone to their batches in this slice. */
    public bool $soumis = false;

    /** What it has committed (RunCosts): the worst cases its calls hold, the real costs settled, in micro-USD. */
    public int $engage = 0;

    /** Why no new call of it leaves (RunCosts: its budget, its duration, its owner's credit); null: nothing. */
    public ?string $bloque = null;

    /** What its owner's other runs in progress may still spend of their credit (T8), in micro-USD: none eats into it. */
    public int $engagementsAutres = 0;

    /** Calls it sent in this slice, directly or in batches: while any, it does not stop. */
    public int $envoyes = 0;

    /**
     * @param string $cle "instance" (its owner's credits pay, margin included) or "personnelle"
     * @param int|null $budget its budget in micro-USD (T10); null: none
     * @param float|null $limite when its duration ends (unix time); null: none
     * @param int $reserveFusion what it keeps for its merge, in micro-USD (T8, strategy A)
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
        public readonly bool $parLots = false,
        public readonly ?int $budget = null,
        public readonly ?float $limite = null,
        public readonly int $reserveFusion = 0,
    ) {
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

    /** Whether to play a pass: none yet, or answers arrived and a call may leave. */
    public function aJouer(): bool
    {
        return $this->passes === 0 || ($this->nouvelles && \count($this->enVol) < $this->appelsDirects);
    }

    /**
     * The days whose calls may leave: by direct calls, the oldest the run has
     * under way, as many as it leads abreast (parallelisme.journees); by
     * batches, all of them (T8, strategy A: each wave waits a whole batch).
     *
     * @return array<string, true>
     */
    public function joursDeFront(): array
    {
        $jours = [];
        foreach ($this->attendus as $call) {
            $jour = self::jour($call->id);
            if ($jour !== null && !isset($jours[$jour]) && ($this->parLots || \count($jours) < $this->journeesDeFront)) {
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
     * otherwise, or for the debit to check alone), would go below what it may
     * not eat into — for a day's call, its run's merge reserve; for the
     * credit, what its owner's other runs in progress may still spend too.
     */
    public function retenue(Call $call, int $reserve, ?int $solde): ?string
    {
        $propre = $this->plancher($call);
        if ($this->budget !== null && $this->engage + $reserve > $this->budget - $propre) {
            return $this->engage + $reserve > $this->budget ? RunCosts::BUDGET : RunCosts::RESERVE_BUDGET;
        }

        return match (true) {
            $solde === null => null,
            $reserve > $solde => RunCosts::CREDIT,
            $reserve > $solde - $propre => RunCosts::RESERVE_CREDIT,
            $reserve > $solde - $propre - $this->engagementsAutres => RunCosts::AUTRES,
            default => null,
        };
    }

    /** The day a call belongs to ("journees/<day>/"), or null for the merge's. */
    public static function jour(string $id): ?string
    {
        return preg_match('#^journees/[^/]+/#', $id, $m) === 1 ? $m[0] : null;
    }
}
