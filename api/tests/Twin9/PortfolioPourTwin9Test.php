<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\Tests\TestDb;
use Humanome\Twin9\EngineLoader;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunInSeparateProcess;
use PHPUnit\Framework\TestCase;

/**
 * The portfolio the platform sends to Twin9 (carto sprint 4, T0; journal of
 * the cartography D-73). The launch page rewrites the text so that the
 * engine's days are the interface's (web/src/lib/twin9/portfolio-pour-twin9.js):
 * its test pins what it makes of the eleven header forms of the sprint 4
 * study, schemas/fixtures/twin9-portfolio/formes-sortie.md. Here the real
 * engine of TWIN_V9_DIR, loaded by EngineLoader, cuts that same text: the
 * ten days the interface reads, one feuille each, where the raw text gave
 * six — one the interface does not have. Skipped without the engine (public
 * CI), in a process of its own, for the fake engine may be loaded in the
 * others.
 */
final class PortfolioPourTwin9Test extends TestCase
{
    private const FIXTURES = __DIR__ . '/../../../schemas/fixtures/twin9-portfolio/';

    protected function tearDown(): void
    {
        TestDb::restoreEnv();
    }

    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testTheEngineCutsTheTextSentToItIntoTheInterfacesDays(): void
    {
        $reel = EngineLoader::directory();
        if (!is_file($reel . '/php/src/Portfolio.php')) {
            self::markTestSkipped('Twin_v9 absent (TWIN_V9_DIR) : le vrai moteur n’est pas là');
        }
        TestDb::setEnv('TWIN_V9_DIR', $reel);
        self::assertTrue(EngineLoader::load());

        $feuilles = static fn (string $fichier): array => \Twin9\Portfolio::split(
            (string) file_get_contents(self::FIXTURES . $fichier), $fichier)['feuilles'];

        // as typed: « 1er », #### and # titles, bold and spelled-out dates go unread, a dated title inside a day is read
        self::assertSame(['2026-01-24', '2026-01-25', '2026-01-26', '2026-01-31', '2026-02-09', '2026-02-10'],
            array_column($feuilles('formes-entree.md'), 'id'));

        // as sent: the interface's ten days, each its own date, none twice
        $envoyees = $feuilles('formes-sortie.md');
        $dix = ['2026-01-24', '2026-01-25', '2026-01-27', '2026-01-28', '2026-01-29', '2026-01-30', '2026-01-31',
            '2026-02-01', '2026-02-09', '2026-02-10'];
        self::assertSame($dix, array_column($envoyees, 'id'));
        self::assertSame($dix, array_column($envoyees, 'date'));
        // the 27th keeps its own text, the dated title read on the 26th neutralized in it
        $vingtSept = $envoyees[array_search('2026-01-27', $dix, true)]['texte'];
        self::assertStringStartsWith("### 2026-01-27\n\n### Mardi 27 janvier 2026\n", $vingtSept);
        self::assertStringContainsString("\n— ### Retour sur la séance du 26.01.2026\n", $vingtSept);
    }
}
