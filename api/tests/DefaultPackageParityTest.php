<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Tests\UseCases\Support\ReferentielsFictifs;
use Humanome\Worker\PromptRunner;
use PHPUnit\Framework\TestCase;

/**
 * The default package's two versions (2026-10-20, scripts/build-default-prompt-package.mjs).
 * 1.0.0's extraction templates spell RESPIRE v7 out; 1.1.0's read the
 * referential ({{referentiel_nom}}, {{nb_poles}}, {{code_exemple_1}},
 * {{code_exemple_2}}). Rendered by PromptRunner for RESPIRE v7, 1.1.0 gives the
 * prompts of 1.0.0 byte for byte — the mass goldens (tests/MasseGolden/,
 * generated through the engine) are unchanged and pass for both. For another
 * referential, 1.1.0 rendered by PromptRunner gives the engine's prompts byte
 * for byte (goldens in tests/DefaultPackageGolden/, regenerated through the
 * engine by its regenerer.mjs).
 */
final class DefaultPackageParityTest extends TestCase
{
    /** @return array<string, mixed> */
    private static function package(string $version): array
    {
        $path = dirname(__DIR__, 2) . "/build/prompt-packages/aurora-v3-reconstruit-{$version}.json";
        self::assertFileExists($path, 'run: node scripts/build-default-prompt-package.mjs');

        return json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }

    /** @return array<string, mixed> */
    private static function respire(): array
    {
        $path = dirname(__DIR__, 2) . '/web/public/data/referentiel/respire-v7.json';
        self::assertFileExists($path);

        return json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }

    private static function dayText(): string
    {
        return (string) file_get_contents(__DIR__ . '/MasseGolden/day-text.txt');
    }

    /**
     * 1.0.0 is published, hence immutable: the build must give its bytes again
     * (sha256 of the file as built before 2026-10-20). A drift would otherwise
     * surface at deploy only, as a PackageConflictException on import.
     */
    public function testLaVersion100PublieeSeReconstruitALOctet(): void
    {
        $path = dirname(__DIR__, 2) . '/build/prompt-packages/aurora-v3-reconstruit-1.0.0.json';
        self::assertFileExists($path, 'run: node scripts/build-default-prompt-package.mjs');
        self::assertSame('4bd550fcccea1b0ebe6630380451e77baa17612b2aab4943442ca7e2e4c24c56', hash_file('sha256', $path));
    }

    public function testLaVersion110RendPourRespireV7LesPromptsDe100OctetPourOctet(): void
    {
        $respire = self::respire();
        $ancien = new PromptRunner(self::package('1.0.0'), $respire);
        $nouveau = new PromptRunner(self::package('1.1.0'), $respire);
        $dayText = self::dayText();

        foreach (['2026-01-05', '2026-01-06', '2026-03-27'] as $date) {
            foreach ($nouveau->poleNums() as $num) {
                self::assertSame($ancien->polePrompt($num, $dayText, $date), $nouveau->polePrompt($num, $dayText, $date), "pôle {$num}, {$date}");
            }
            self::assertSame($ancien->kairosPrompt($dayText, $date), $nouveau->kairosPrompt($dayText, $date), "kairos, {$date}");
        }

        // Les goldens de masse, générés à travers le moteur, inchangés.
        self::assertSame((string) file_get_contents(__DIR__ . '/MasseGolden/extraction-pole-3.golden.txt'), $nouveau->polePrompt(3, $dayText, '2026-01-06'));
        self::assertSame((string) file_get_contents(__DIR__ . '/MasseGolden/kairos.golden.txt'), $nouveau->kairosPrompt($dayText, '2026-01-06'));
    }

    public function testLaVersion110LitLeReferentielEtLesAdmetTous(): void
    {
        self::assertFalse((new PromptRunner(self::package('1.0.0'), self::respire()))->readsTheReferentiel());

        $six = self::respire();
        $six['poles'] = array_values(array_filter($six['poles'], static fn (array $p): bool => (int) $p['num'] !== 7));
        $six['competences'] = array_values(array_filter($six['competences'], static fn (array $c): bool => (int) $c['pole'] !== 7));
        foreach ([self::respire(), $six, ReferentielsFictifs::lettre(), ReferentielsFictifs::neufPoles()] as $referentiel) {
            $runner = new PromptRunner(self::package('1.1.0'), $referentiel);
            self::assertTrue($runner->readsTheReferentiel());
            self::assertNull($runner->referentielRefusal(), (string) ($referentiel['id'] ?? ''));
        }

        $kairos = (new PromptRunner(self::package('1.1.0'), $six))->kairosPrompt(self::dayText(), '2026-01-06');
        self::assertStringContainsString('Les 6 pôles de la feuille du jour', $kairos);
        self::assertStringContainsString('# Référentiel RESPIRE (6 pôles, ', $kairos);
    }

    public function testPourUnAutreReferentielLaVersion110RendLesPromptsDuMoteur(): void
    {
        $dir = __DIR__ . '/DefaultPackageGolden';
        $referentiel = json_decode((string) file_get_contents($dir . '/fictif-lettre.json'), true, 512, JSON_THROW_ON_ERROR);
        self::assertSame(ReferentielsFictifs::lettre(), $referentiel, 'la fixture des goldens est ReferentielsFictifs::lettre()');

        $runner = new PromptRunner(self::package('1.1.0'), $referentiel);
        self::assertSame([1, 2, 3, 4, 5], $runner->poleNums());
        $pole = $runner->polePrompt(4, self::dayText(), '2026-01-06');
        $kairos = $runner->kairosPrompt(self::dayText(), '2026-01-06');
        self::assertSame((string) file_get_contents($dir . '/fictif-lettre-pole-4.golden.txt'), $pole);
        self::assertSame((string) file_get_contents($dir . '/fictif-lettre-kairos.golden.txt'), $kairos);

        self::assertStringContainsString('pour UN pôle du référentiel Fictif lettré, en jouant', $pole);
        self::assertStringContainsString('les 4 codes' . "\n" . 'D1, D2, D3, D4', $pole);
        self::assertStringContainsString('# Référentiel Fictif lettré (5 pôles, 20 compétences)', $kairos);
        self::assertStringContainsString('"codesRelies": [ "A1", "D2" ]', $kairos);
        self::assertStringNotContainsString('RESPIRE', $pole . $kairos);
    }
}
