<?php

declare(strict_types=1);

namespace Humanome\Llm;

/**
 * 'mock' provider: canned answers from schemas/fixtures/ for local dev and
 * integration WITHOUT any API key (DEMO_PROVIDER=mock).
 *
 * When the prompt carries a pole marker (the extraction prompts built by
 * engine/src/pipeline/extract.js contain both `Pôle <n> —` and
 * `"poleNum": "<n>"`), the matching pole object of an existing
 * cartographie-jour fixture is returned as JSON — enough for the engine
 * pipeline to run end-to-end. A kairos synthesis prompt (marker
 * `SYNTHÈSE KAIROS`, buildKairosExtractionPrompt) gets the fixture's kairos
 * field as JSON (`null` or object — both valid per the schema). If a fixture
 * day date (2026-01-05..07) appears in the prompt, that day's fixture is
 * used; otherwise the first one. Otherwise, a generic text is returned.
 *
 * Any referential (2026-10-20): the fixtures are RESPIRE v7's. When the
 * prompt's referential is not — the codes the extraction prompt asks for
 * (« les N codes … dans cet ordre »), those of its referential block for the
 * kairos —, the answer is the fixture's, its codes replaced by the prompt's,
 * in order; a pole beyond the fixture's seven borrows one of them. For
 * RESPIRE v7 the answers are the fixtures', byte for byte.
 *
 * Usage tokens are estimated with the engine heuristic (~3.6 chars/token
 * for French, engine/src/providers/estimate.js).
 */
final class MockProvider
{
    private const CHARS_PER_TOKEN = 3.6;
    private const FIXTURE_DAYS = ['2026-01-05', '2026-01-06', '2026-01-07'];
    private const JSON_FLAGS = JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT;

    /** Where a kairos links codes (as Conformite reads them). */
    private const KAIROS_LISTS = [
        ['connexionsTransversales', 'codesRelies'],
        ['noeudsConceptuels', 'codesRelies'],
        ['competencesOrphelines', 'enRelationAvecCodes'],
    ];

    public function __construct(private readonly ?string $fixturesDir = null)
    {
    }

    /** @return array{text: string, usage: array{inputTokens: int, outputTokens: int}, model: string} */
    public function complete(string $model, ?string $system, string $prompt, int $maxTokens): array
    {
        $input = ($system ?? '') . $prompt;
        // Kairos FIRST: the kairos prompt embeds the whole referentiel block
        // (« Pôle 1 — … », « Pôle 2 — … ») and would match the pole marker.
        $text = $this->kairosAnswer($prompt)
            ?? $this->poleAnswer($prompt)
            ?? 'Réponse simulée du fournisseur mock (aucun marqueur de pôle détecté dans le prompt).';

        return [
            'text' => $text,
            'usage' => [
                'inputTokens' => (int) ceil(mb_strlen($input) / self::CHARS_PER_TOKEN),
                'outputTokens' => (int) ceil(mb_strlen($text) / self::CHARS_PER_TOKEN),
            ],
            'model' => 'mock',
        ];
    }

    /** JSON of the requested pole from a cartographie-jour fixture, or null. */
    private function poleAnswer(string $prompt): ?string
    {
        if (preg_match('/"poleNum":\s*"?(\d+)"?/u', $prompt, $m) !== 1
            && preg_match('/P[ôo]le\s+(\d+)\b/u', $prompt, $m) !== 1) {
            return null;
        }
        $poleNum = $m[1];

        $document = $this->fixtureDocument($prompt);
        $poles = array_values(array_filter((array) ($document['poles'] ?? []), 'is_array'));
        if ($poles === []) {
            return null;
        }
        $pole = null;
        foreach ($poles as $candidate) {
            if ((string) ($candidate['poleNum'] ?? '') === $poleNum) {
                $pole = $candidate;
                break;
            }
        }
        $codes = self::requestedCodes($prompt);
        if ($codes === null) {
            return $pole === null ? null : json_encode($pole, self::JSON_FLAGS);
        }
        $pole ??= $poles[max(0, (int) $poleNum - 1) % \count($poles)];
        $fixtureCodes = array_map(static fn (array $c): string => (string) ($c['code'] ?? ''), (array) $pole['competences']);
        if ((string) $pole['poleNum'] === $poleNum && array_diff($fixtureCodes, $codes) === []) {
            return json_encode($pole, self::JSON_FLAGS); // the fixture's own referential (RESPIRE v7)
        }

        $pole['poleNum'] = $poleNum;
        $competences = [];
        foreach (array_values((array) $pole['competences']) as $i => $competence) {
            if (!isset($codes[$i])) {
                break;
            }
            $competences[] = ['code' => $codes[$i]] + $competence;
        }
        $pole['competences'] = $competences;

        return json_encode($pole, self::JSON_FLAGS);
    }

    /**
     * JSON of the day's kairos synthesis (engine buildKairosExtractionPrompt,
     * marker `SYNTHÈSE KAIROS`), or null when the prompt is not a kairos one.
     * The fixture's kairos may be JSON `null` — valid per the schema and
     * understood by the engine's parseExtractionResponse.
     */
    private function kairosAnswer(string $prompt): ?string
    {
        if (!str_contains($prompt, 'SYNTHÈSE KAIROS') && !str_contains($prompt, 'kairos.apprenant')) {
            return null;
        }
        $document = $this->fixtureDocument($prompt);
        if ($document === null || !\array_key_exists('kairos', $document)) {
            return null;
        }
        $kairos = $document['kairos'];
        $codes = self::referentielCodes($prompt);
        if (\is_array($kairos) && $codes !== null && array_diff(self::kairosCodes($kairos), $codes) !== []) {
            $kairos = self::withCodes($kairos, $codes);
        }

        return json_encode($kairos, self::JSON_FLAGS);
    }

    /**
     * The codes the extraction prompt orders (« competences DOIT contenir les
     * N codes\nA, B dans cet ordre »), or null when it states none.
     *
     * @return list<string>|null
     */
    private static function requestedCodes(string $prompt): ?array
    {
        if (preg_match('/contenir les \d+ codes\s+(.+?) dans cet ordre/su', $prompt, $m) !== 1) {
            return null;
        }
        $codes = array_values(array_filter(array_map('trim', explode(',', $m[1])), static fn (string $c): bool => $c !== ''));

        return $codes === [] ? null : $codes;
    }

    /**
     * The codes of the kairos prompt's referential block (« # Référentiel … »
     * then « Pôle N — nom » and «   CODE — nom » lines), or null.
     *
     * @return list<string>|null
     */
    private static function referentielCodes(string $prompt): ?array
    {
        if (preg_match('/^# Référentiel[^\n]*\n(.*?)(?=^# |\z)/msu', $prompt, $m) !== 1
            || preg_match_all('/^  (\S+) — /mu', $m[1], $found) < 1) {
            return null;
        }

        return array_values(array_unique($found[1]));
    }

    /** @return list<string> the codes a kairos links */
    private static function kairosCodes(array $kairos): array
    {
        $codes = [];
        foreach (self::KAIROS_LISTS as [$liste, $champ]) {
            foreach ((array) ($kairos['emergencesCrossPoles'][$liste] ?? []) as $entree) {
                foreach ((array) ($entree[$champ] ?? []) as $code) {
                    $codes[] = (string) $code;
                }
            }
        }

        return array_values(array_unique($codes));
    }

    /**
     * The fixture kairos with its codes replaced by the referential's: the
     * i-th distinct code it links becomes the i-th code of the list (cycling).
     *
     * @param list<string> $codes
     */
    private static function withCodes(array $kairos, array $codes): array
    {
        $map = [];
        foreach (self::kairosCodes($kairos) as $i => $code) {
            $map[$code] = $codes[$i % \count($codes)];
        }
        foreach (self::KAIROS_LISTS as [$liste, $champ]) {
            foreach ((array) ($kairos['emergencesCrossPoles'][$liste] ?? []) as $j => $entree) {
                if (\is_array($entree[$champ] ?? null)) {
                    $kairos['emergencesCrossPoles'][$liste][$j][$champ] = array_map(
                        static fn (mixed $code): string => $map[(string) $code] ?? (string) $code,
                        $entree[$champ],
                    );
                }
            }
        }

        return $kairos;
    }

    /** Fixture document whose date appears in the prompt (default: first day). */
    private function fixtureDocument(string $prompt): ?array
    {
        $day = self::FIXTURE_DAYS[0];
        foreach (self::FIXTURE_DAYS as $candidate) {
            if (str_contains($prompt, $candidate)) {
                $day = $candidate;
                break;
            }
        }

        $file = $this->fixturesDirectory() . '/cartographie-jour-' . $day . '.json';
        if (!is_file($file)) {
            return null;
        }
        $document = json_decode((string) file_get_contents($file), true);

        return \is_array($document) ? $document : null;
    }

    private function fixturesDirectory(): string
    {
        // Repo layout: api/src/Llm -> <repo>/schemas/fixtures.
        return $this->fixturesDir ?? \dirname(__DIR__, 3) . '/schemas/fixtures';
    }
}
