<?php

declare(strict_types=1);

namespace Twin9;

use Twin9\Run\Call;
use Twin9\Run\Journal;
use Twin9\Run\Pending;
use Twin9\Run\Store;

/**
 * A fake Twin9 engine, public, loaded by EngineLoader as the real one is
 * (ADR-011, Twin_v9's docs/plan-twin9-php.md, T7): the same contract —
 * Plateforme, Call, Pending, Journal, Store — and a run small enough to read,
 * for the platform's tests of the tick, the journal, the memory and the
 * resumption without the v9.8.
 *
 * Its settings (JSON): lecteurs (readers, called together on each day),
 * etapes (steps called one after the other, each prompt quoting the previous
 * answer), modele, fusion (one call over the days, at the end), jours, test,
 * memoire. A portfolio's days start with "## <day>". The prompts come from
 * the set's templates factice/lecture, factice/etape and factice/fusion, and
 * carry their call's id.
 *
 * As the real engine: a day done enters the memory at once, unless one of
 * its calls failed, and the next passes take it back; the rest ("faisceaux",
 * a count of the runs merged) enters it when the run completes; outputs are
 * told as they are written.
 */
final class Plateforme
{
    private readonly array $reglages;

    /** @var list<array{id: string, texte: string}> */
    private readonly array $jours;

    private readonly string $journal;

    /** @param array<string, string> $gabarits */
    public function __construct(string $reglages, string $portfolioNom, string $portfolio,
                                private readonly array $gabarits, private readonly string $sortie,
                                private readonly \DateTimeImmutable $horloge, private readonly string $empreinte = '')
    {
        $r = json_decode($reglages, true, 64, JSON_THROW_ON_ERROR);
        $this->reglages = $r + ['lecteurs' => ['a'], 'etapes' => ['greffier'], 'modele' => 'factice', 'fusion' => true,
                                'jours' => null, 'test' => false, 'memoire' => true];
        foreach (['factice/lecture', 'factice/etape', 'factice/fusion'] as $nom) {
            if (!isset($gabarits[$nom])) {
                throw new \RuntimeException("Gabarit absent : $nom");
            }
        }
        preg_match_all('/^## ([^\n]+)\R(.*?)(?=^## |\z)/msu', $portfolio, $m, PREG_SET_ORDER);
        $jours = array_map(static fn (array $x): array => ['id' => trim($x[1]), 'texte' => trim($x[2])], $m);
        if ($this->reglages['test']) {
            $jours = \array_slice($jours, 0, 1);
        } elseif ($this->reglages['jours'] !== null) {
            $jours = \array_slice($jours, 0, (int) $this->reglages['jours']);
        }
        $this->jours = $jours;
        $this->journal = (string) preg_replace('/[^A-Za-z0-9_-]+/', '_', pathinfo($portfolioNom, PATHINFO_FILENAME));
    }

    public function journal(): string
    {
        return $this->journal;
    }

    /**
     * @param \Closure(string, string): void $sortie
     * @return array{reprises: int}
     * @throws Pending
     */
    public function passe(Journal $journal, Store $memoire, \Closure $sortie): array
    {
        $prefixe = $this->reglages['test'] ? 'test/' : '';
        $memoire = $this->reglages['memoire'] ? $memoire : null;
        $attendus = [];
        $cartes = [];
        $reprises = 0;
        foreach ($this->jours as $jour) {
            $cle = $prefixe . 'journees/' . $jour['id'];
            $entree = $memoire === null ? null : json_decode((string) $memoire->read($cle), true);
            if (\is_array($entree) && $entree['empreinte'] === sha1($jour['texte'])
                && $entree['reglages'] === $this->empreinte) {
                $cartes[] = $entree['carte'];
                $reprises++;
                continue;
            }
            try {
                $carte = $this->journee($journal, $jour);
            } catch (Pending $p) {
                array_push($attendus, ...$p->calls);
                continue;
            }
            $cartes[] = $carte;
            $sortie('journees/' . $jour['id'] . '/carto_jour.json', json_encode($carte, JSON_UNESCAPED_UNICODE));
            if ($memoire !== null && !$carte['panne']) {
                $memoire->write($cle, json_encode(['empreinte' => sha1($jour['texte']), 'reglages' => $this->empreinte,
                                                   'carte' => $carte], JSON_UNESCAPED_UNICODE));
            }
        }
        if ($attendus !== []) {
            throw new Pending($attendus);
        }

        $fusion = null;
        if ($this->reglages['fusion']) {
            $resume = implode("\n", array_map(static fn (array $c): string => $c['jour'] . ' : '
                . ($c['etapes'] === [] ? '' : end($c['etapes'])), $cartes));
            [$fusion] = $this->appel($journal, 'fusion', 'merge_rapporteur', 'factice/fusion', ['JOURS' => $resume]);
        }
        $sortie('carto_evolutive.json', json_encode(['journal' => $this->journal, 'horloge' => $this->horloge->format('c'),
            'sortie' => $this->sortie, 'jours' => $cartes, 'fusion' => $fusion], JSON_UNESCAPED_UNICODE));
        if ($memoire !== null) {
            $avant = json_decode((string) $memoire->read($prefixe . 'faisceaux'), true);
            $memoire->write($prefixe . 'faisceaux', json_encode(['runs' => (\is_array($avant) ? $avant['runs'] : 0) + 1]));
        }

        return ['reprises' => $reprises];
    }

    /** A day: its readers together, then its steps one after the other. */
    private function journee(Journal $journal, array $jour): array
    {
        $panne = false;
        $lectures = [];
        $attendus = [];
        foreach ($this->reglages['lecteurs'] as $lecteur) {
            try {
                [$texte, $echec] = $this->appel($journal, 'journees/' . $jour['id'] . '/tags_' . $lecteur . '_P1.json',
                    'tagger', 'factice/lecture', ['JOUR' => $jour['id'], 'LECTEUR' => $lecteur, 'TEXTE' => $jour['texte']]);
                $lectures[] = $texte;
                $panne = $panne || $echec;
            } catch (Pending $p) {
                array_push($attendus, ...$p->calls);
            }
        }
        if ($attendus !== []) {
            throw new Pending($attendus);
        }
        $precedent = implode(' | ', $lectures);
        $etapes = [];
        foreach ($this->reglages['etapes'] as $n => $etape) {
            [$texte, $echec] = $this->appel($journal, 'journees/' . $jour['id'] . '/' . ($n + 1) . '-' . $etape . '.md',
                $etape, 'factice/etape', ['JOUR' => $jour['id'], 'ETAPE' => $etape, 'PRECEDENT' => $precedent]);
            $panne = $panne || $echec;
            $etapes[] = $texte;
            $precedent = $texte;
        }

        return ['jour' => $jour['id'], 'lectures' => $lectures, 'etapes' => $etapes, 'panne' => $panne,
                'horodatage' => $this->horloge->format('c')];
    }

    /**
     * One call: its answer, or '' when it failed (as the v9.8 goes on without
     * the answer of a call failed).
     *
     * @param array<string, string> $variables
     * @return array{0: string, 1: bool} the answer, and whether the call failed
     */
    private function appel(Journal $journal, string $id, string $step, string $gabarit, array $variables): array
    {
        $prompt = $this->gabarits[$gabarit];
        foreach (['APPEL' => $id] + $variables as $k => $v) {
            $prompt = str_replace('{$' . $k . '}', $v, $prompt);
        }
        $call = new Call($id, $step, $step . '_' . $id, (string) $this->reglages['modele'], $prompt);
        $issue = $journal->outcome($id);
        if ($issue === null || $issue['sha256'] !== $call->sha256) {
            throw new Pending([$call]);
        }

        return \array_key_exists('failure', $issue) ? ['', true] : [(string) $issue['response'], false];
    }
}
