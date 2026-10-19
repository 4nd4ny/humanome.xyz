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
 *
 * Its outputs have the v9.8's shape where the platform reads them (T9): a
 * day map names its day and judges one competence (1.01) with a jury and a
 * deliberation drawn from its calls' answers; the merge attests that
 * competence on each day, names each day ("journee"), and carries a story,
 * a pole report and a kairos. The memory keeps a day's map as « carto ».
 * Before a run, apercu() says which days it would instruct (T10).
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
     * Before a run (T10), as the real engine says it: the days it takes, each
     * new, changed or unchanged in the memory of the map; and the poles, one
     * by tagger/P<n> fiche of the set, one without any.
     *
     * @return array{journees: list<array{id: string, date: ?string, titre: ?string, etat: string}>, poles: int}
     */
    public function apercu(Store $memoire): array
    {
        $prefixe = $this->reglages['test'] ? 'test/' : '';
        $journees = [];
        foreach ($this->jours as $jour) {
            $entree = $this->reglages['memoire']
                ? json_decode((string) $memoire->read($prefixe . 'journees/' . $jour['id']), true) : null;
            $etat = match (true) {
                !\is_array($entree) => 'nouvelle',
                $entree['empreinte'] === sha1($jour['texte']) && $entree['reglages'] === $this->empreinte => 'inchangee',
                default => 'changee',
            };
            $journees[] = ['id' => $jour['id'], 'date' => preg_match('/^\d{4}-\d{2}-\d{2}$/', $jour['id']) === 1
                ? $jour['id'] : null, 'titre' => null, 'etat' => $etat];
        }

        return ['journees' => $journees,
                'poles' => max(1, \count(preg_grep('#^tagger/P\d+$#', array_keys($this->gabarits))))];
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
                $cartes[] = $entree['carto'];
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
            $sortie('journees/' . $jour['id'] . '/carto_jour.json',
                json_encode($carte, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION));
            if ($memoire !== null && !$carte['panne']) {
                $memoire->write($cle, json_encode(['empreinte' => sha1($jour['texte']), 'reglages' => $this->empreinte,
                                                   'texte' => $jour['texte'], 'carto' => $carte], JSON_UNESCAPED_UNICODE));
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
            'sortie' => $this->sortie, 'jours' => $cartes, 'fusion' => $fusion] + $this->fusionV98($cartes, (string) $fusion),
            JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION));
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

        $date = preg_match('/^\d{4}-\d{2}-\d{2}$/', $jour['id']) === 1 ? $jour['id'] : null;
        $dernier = $etapes === [] ? '' : (string) end($etapes);

        return ['jour' => $jour['id'], 'lectures' => $lectures, 'etapes' => $etapes, 'panne' => $panne,
                'horodatage' => $this->horloge->format('c'),
                // the v9.8's day map, where the platform reads it: one competence judged by a jury of one
                'journee' => $jour['id'], 'date' => $date, 'titre' => null,
                'verdicts' => ['1.01' => [
                    'code' => '1.01', 'nom' => 'Compétence factice', 'dossier_vide' => false,
                    'statut' => 'présence établie', 'score_preuves' => 1, 'score_indices' => 0, 'confiance' => 0.8,
                    'etage' => 'tribunal',
                    'traces_probantes' => [['piece' => 1, 'extrait' => mb_substr($jour['texte'], 0, 80), 'date' => $date,
                                            'type' => 'journal', 'role' => 'preuve']],
                    'prescription' => ['pour_apprenant' => $dernier, 'pour_cartographe' => null],
                    'jury' => ['mode' => 'factice', 'composition' => ['Lecteur'], 'positions_r1' => ['Lecteur' => 'présence'],
                               'positions_finales' => ['Lecteur' => 'présence'], 'consensus' => true, 'dissidences' => [],
                               'second_tour' => false],
                    'deliberation' => [
                        'greffier_md' => implode("\n\n", $lectures),
                        'arene' => ['accusation_md' => $etapes[0] ?? '', 'defense_md' => $etapes[1] ?? '',
                                    'replique_md' => null, 'briefing_md' => null],
                        'jures' => ['Lecteur' => ['r1_md' => $lectures[0] ?? '', 'r2_md' => null, 'position_r1' => 'présence',
                                                  'position_finale' => 'présence', 'pieces' => [1], 'piege' => null]],
                        'relance_md' => null, 'gardiens' => ['support_md' => null, 'raisonnement_md' => null],
                        'president_md' => $dernier,
                    ],
                ]],
        ];
    }

    /**
     * The v9.8's merge, where the platform reads it: competence 1.01 attested
     * on each day, each day named; a story, a pole report, a kairos.
     *
     * @param list<array<string, mixed>> $cartes
     * @return array<string, mixed>
     */
    private function fusionV98(array $cartes, string $fusion): array
    {
        $attestations = [];
        foreach (array_values($cartes) as $i => $c) {
            $attestations[] = ['jour_index' => $i, 'journee' => $c['jour'], 'date' => $c['date'] ?? null,
                               'etage' => 'tribunal', 'confiance' => 0.8, 'score_preuves' => 1, 'score_indices' => 0,
                               'citations' => []];
        }
        $dates = array_values(array_filter(array_column($cartes, 'date')));

        return [
            'journal_id' => $this->journal,
            'periode' => ['debut' => $dates[0] ?? null, 'fin' => $dates === [] ? null : end($dates),
                          'n_journees' => \count($cartes)],
            'competences' => ['1.01' => ['code' => '1.01', 'nom' => 'Compétence factice', 'pole' => 1,
                                         'attestations' => $attestations, 'signaux' => []]],
            'histoires' => ['1.01' => $fusion],
            'rapports_poles' => ['1' => $fusion],
            'kairos_evolutif' => $fusion,
        ];
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
