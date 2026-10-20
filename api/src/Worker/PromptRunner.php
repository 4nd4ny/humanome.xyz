<?php

declare(strict_types=1);

namespace Humanome\Worker;

use Humanome\Referentiel\Conformite;

/**
 * Instantiates the extraction prompts of a prompt-package by substituting the
 * {{placeholders}} of its templates (roles 'extraction-pole' and 'kairos') —
 * the M8 architecture decision (docs/plan-masse.md §0): the PHP worker NEVER
 * re-implements the JS engine; the prompt text lives in the package (data),
 * PHP only reproduces the formatting of the injected variables.
 *
 * The formatting helpers are byte-for-byte twins of the engine, source cited:
 * - referentielBloc / poleBloc  -> engine/src/pipeline/extract.js referentielBloc()
 * - formatDateFr                -> engine/src/pipeline/narrative-prompts.js formatDateFr()
 * - the variable list matches scripts/build-default-prompt-package.mjs
 * Parity is asserted by tests against goldens generated THROUGH the engine
 * (api/tests/MasseGolden/).
 */
final class PromptRunner
{
    /** @var array<string, array<string, mixed>> templates by role */
    private array $templates = [];

    /**
     * @param array<string, mixed> $package decoded prompt-package document
     * @param array<string, mixed> $referentiel decoded referentiel document
     *                             (poles[], competences[])
     */
    public function __construct(array $package, private readonly array $referentiel)
    {
        foreach ((array) ($package['prompts'] ?? []) as $prompt) {
            if (\is_array($prompt) && \is_string($prompt['role'] ?? null)) {
                $this->templates[$prompt['role']] = $prompt;
            }
        }
        if (!\is_array($referentiel['poles'] ?? null) || !\is_array($referentiel['competences'] ?? null)) {
            throw new \InvalidArgumentException('PromptRunner: referentiel with poles[] and competences[] required');
        }
    }

    public function hasExtractionTemplates(): bool
    {
        return isset($this->templates['extraction-pole'], $this->templates['kairos']);
    }

    /**
     * Whether both extraction templates declare « referentiel_nom » (2026-10-20):
     * such templates read the referential's name, its pole count and two
     * example codes from its document, so they serve every referential.
     */
    public function readsTheReferentiel(): bool
    {
        foreach (['extraction-pole', 'kairos'] as $role) {
            $names = array_map(
                static fn (mixed $v): string => \is_array($v) ? (string) ($v['nom'] ?? '') : '',
                (array) ($this->templates[$role]['variables'] ?? []),
            );
            if (!\in_array('referentiel_nom', $names, true)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Why this package's templates cannot cartograph this referential, or null
     * when they can (2026-10-20). Templates that do not read the referential —
     * aurora-v3-reconstruit 1.0.0, written for RESPIRE v7 — spell « RESPIRE »,
     * « 7 pôles » and the example codes « 1.01 » and « 4.02 » out: they admit
     * only a referential of which these words are true.
     */
    public function referentielRefusal(): ?string
    {
        if ($this->readsTheReferentiel()) {
            return null;
        }
        $poleOf = [];
        foreach ($this->referentiel['competences'] as $c) {
            $poleOf[(string) $c['code']] = (int) $c['pole'];
        }
        $id = $this->referentiel['id'] ?? Conformite::REFERENTIEL_PAR_DEFAUT;
        if ($id === Conformite::REFERENTIEL_PAR_DEFAUT
            && \count($this->referentiel['poles']) === 7
            && isset($poleOf['1.01'], $poleOf['4.02'])
            && $poleOf['1.01'] !== $poleOf['4.02']) {
            return null;
        }

        return 'Les gabarits de ce paquet écrivent en toutes lettres « RESPIRE », « 7 pôles » et les codes '
            . '« 1.01 » et « 4.02 » : ils ne cartographient que RESPIRE à sept pôles. Choisissez une version '
            . 'du paquet dont les gabarits lisent le référentiel (variable referentiel_nom).';
    }

    /**
     * The referential's name as the prompts give it — twin of
     * nomCourtReferentiel() in engine/src/referentiel.js: « RESPIRE » for the id
     * « respire », whatever its label; else its label without its final
     * version (« Humanome V18 » -> « Humanome »), else its id.
     *
     * @param array<string, mixed> $referentiel
     */
    public static function referentielName(array $referentiel): string
    {
        $id = \is_string($referentiel['id'] ?? null) ? trim($referentiel['id']) : '';
        if ($id === '' || $id === Conformite::REFERENTIEL_PAR_DEFAUT) {
            return 'RESPIRE';
        }
        $label = \is_string($referentiel['label'] ?? null)
            ? trim((string) preg_replace('/(?:^|\s+)[vV]\d+(?:\.\d+)*(?:-[0-9A-Za-z.-]+)?$/u', '', trim($referentiel['label'])))
            : '';

        return $label !== '' ? $label : $id;
    }

    /**
     * Two example codes for the output templates — twin of codesExemples() in
     * engine/src/referentiel.js: the referential's first code, and the second
     * of its fourth pole if there is one, else its last code (RESPIRE v7:
     * 1.01, 4.02).
     *
     * @param array<string, mixed> $referentiel
     * @return array{0: string, 1: string}
     */
    public static function exampleCodes(array $referentiel): array
    {
        $nums = array_map(static fn (array $p): int => (int) $p['num'], $referentiel['poles']);
        sort($nums);
        $codesOf = static function (int $num) use ($referentiel): array {
            $codes = [];
            foreach ($referentiel['competences'] as $c) {
                if ((int) $c['pole'] === $num) {
                    $codes[] = (string) $c['code'];
                }
            }
            usort($codes, static fn (string $a, string $b): int => strcmp($a, $b) < 0 ? -1 : 1);

            return $codes;
        };
        $all = array_merge(...array_map($codesOf, $nums));
        if ($all === []) {
            throw new \InvalidArgumentException('PromptRunner: referentiel without any competence');
        }
        $fourth = \count($nums) >= 4 ? $codesOf($nums[3]) : [];

        return [$all[0], $fourth[1] ?? $all[\count($all) - 1]];
    }

    /** Pole numbers of the referentiel, ascending (the 8-call plan minus kairos). */
    public function poleNums(): array
    {
        $nums = array_map(static fn (array $p): int => (int) $p['num'], $this->referentiel['poles']);
        sort($nums);

        return $nums;
    }

    /** Prompt for one pole of one day (template role 'extraction-pole'). */
    public function polePrompt(int $poleNum, string $dayText, string $date): string
    {
        $pole = null;
        foreach ($this->referentiel['poles'] as $candidate) {
            if ((int) $candidate['num'] === $poleNum) {
                $pole = $candidate;
                break;
            }
        }
        if ($pole === null) {
            throw new \InvalidArgumentException("PromptRunner: pole {$poleNum} absent from the referentiel");
        }
        $codes = $this->poleCodes($poleNum);

        return $this->substitute('extraction-pole', [
            'date_fr' => self::formatDateFr($date),
            'date_iso' => $date,
            'portfolio_texte' => trim($dayText), // extractDay injects dayText.trim()
            'pole_num' => (string) $poleNum,
            'pole_nom' => (string) $pole['nom'],
            'referentiel_nom' => self::referentielName($this->referentiel),
            'referentiel_pole_bloc' => $this->referentielBloc($poleNum),
            'nb_competences_pole' => (string) \count($codes),
            'codes_liste' => implode(', ', $codes),
            'premier_code' => (string) ($codes[0] ?? ''),
        ]);
    }

    /** Prompt for the day's transversal kairos synthesis (template role 'kairos'). */
    public function kairosPrompt(string $dayText, string $date): string
    {
        return $this->substitute('kairos', [
            'date_fr' => self::formatDateFr($date),
            'date_iso' => $date,
            'portfolio_texte' => trim($dayText),
            'nb_poles' => (string) \count($this->referentiel['poles']),
            'nb_competences' => (string) \count($this->referentiel['competences']),
            'referentiel_bloc' => $this->referentielBloc(null),
            'referentiel_nom' => self::referentielName($this->referentiel),
            'code_exemple_1' => self::exampleCodes($this->referentiel)[0],
            'code_exemple_2' => self::exampleCodes($this->referentiel)[1],
        ]);
    }

    /** Sorted competence codes of a pole (extract.js: (a.code < b.code ? -1 : 1)). */
    private function poleCodes(int $poleNum): array
    {
        $codes = [];
        foreach ($this->referentiel['competences'] as $c) {
            if ((int) $c['pole'] === $poleNum) {
                $codes[] = (string) $c['code'];
            }
        }
        usort($codes, static fn (string $a, string $b): int => $a < $b ? -1 : 1);

        return $codes;
    }

    /**
     * Twin of referentielBloc() in engine/src/pipeline/extract.js:
     * « Pôle N — nom » lines followed by «   code — nom » competence lines,
     * poles ascending, codes string-sorted.
     */
    private function referentielBloc(?int $poleNum): string
    {
        $poles = $this->referentiel['poles'];
        usort($poles, static fn (array $a, array $b): int => (int) $a['num'] <=> (int) $b['num']);

        $lignes = [];
        foreach ($poles as $pole) {
            $num = (int) $pole['num'];
            if ($poleNum !== null && $num !== $poleNum) {
                continue;
            }
            $lignes[] = sprintf('Pôle %d — %s', $num, (string) $pole['nom']);
            $comps = array_values(array_filter(
                $this->referentiel['competences'],
                static fn (array $c): bool => (int) $c['pole'] === $num,
            ));
            usort($comps, static fn (array $a, array $b): int => ((string) $a['code']) < ((string) $b['code']) ? -1 : 1);
            foreach ($comps as $c) {
                $lignes[] = sprintf('  %s — %s', (string) $c['code'], (string) $c['nom']);
            }
        }

        return implode("\n", $lignes);
    }

    /** Twin of formatDateFr() in engine/src/pipeline/narrative-prompts.js. */
    public static function formatDateFr(string $iso): string
    {
        [$y, $m, $d] = explode('-', $iso);

        return "{$d}/{$m}/{$y}";
    }

    /**
     * Replace every declared {{variable}} of the template. Checks run on the
     * TEMPLATE (declared variables all valued, no undeclared placeholder),
     * then a SINGLE strtr() pass substitutes — replaced text is never
     * re-scanned, so a portfolio containing "{{date_iso}}" cannot inject
     * anything (nor trip the checks).
     *
     * @param array<string, string> $values
     */
    private function substitute(string $role, array $values): string
    {
        $template = $this->templates[$role] ?? null;
        if ($template === null) {
            throw new \RuntimeException("PromptRunner: template role \"{$role}\" absent from the package");
        }

        $text = (string) $template['texte'];
        $declared = [];
        foreach ((array) ($template['variables'] ?? []) as $variable) {
            $name = \is_array($variable) ? (string) ($variable['nom'] ?? '') : '';
            if ($name === '') {
                continue;
            }
            if (!\array_key_exists($name, $values)) {
                throw new \RuntimeException("PromptRunner: no value for declared variable \"{$name}\" ({$role})");
            }
            $declared['{{' . $name . '}}'] = $values[$name];
        }

        preg_match_all('/\{\{([a-z0-9_]+)\}\}/', $text, $found);
        foreach ($found[1] as $placeholder) {
            if (!isset($declared['{{' . $placeholder . '}}'])) {
                throw new \RuntimeException("PromptRunner: undeclared placeholder \"{{{$placeholder}}}\" in template \"{$role}\"");
            }
        }

        return strtr($text, $declared);
    }
}
