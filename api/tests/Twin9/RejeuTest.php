<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\Worker\Twin9Run;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * P0-4, the rule of the direct lane's passes (Twin9Run::aRejouer), without
 * MySQL nor an engine: a pass is played again when answers have arrived and
 * the calls already known could not fill every place — neither the calls in
 * flight nor the cap decide it any more. Where a sending sets `plein`
 * (Twin9Slice::envoyer), and passes against calls, TrancheTest plays in
 * slices.
 */
final class RejeuTest extends TestCase
{
    /** @return iterable<string, array{0: bool, 1: bool, 2: bool}> answers arrived, places filled by the calls known => replay */
    public static function cas(): iterable
    {
        yield 'rien de nouveau' => [false, false, false];
        yield 'rien de nouveau, les places remplies' => [false, true, false];
        yield 'des réponses, les places remplies par les appels connus' => [true, true, false];
        // a place left empty, or nothing sent now (suspended, held back, past the last departure): the final pass too
        yield 'des réponses, une place que les appels connus ne remplissent pas' => [true, false, true];
    }

    #[DataProvider('cas')]
    public function testTheTruthTableOfTheReplay(bool $nouvelles, bool $plein, bool $rejouer): void
    {
        $run = self::unRun(6);
        $run->passes = 1;
        $run->nouvelles = $nouvelles;
        $run->plein = $plein;

        self::assertSame($rejouer, $run->aRejouer());
    }

    /**
     * The calls in flight decide nothing: every place taken, the last call
     * known having taken the last one (`plein` stays false), a pass comes
     * with the next answer; no call in flight, the places it knows filled,
     * none comes.
     */
    public function testTheCallsInFlightDecideNothing(): void
    {
        $run = self::unRun(6);
        $run->passes = 1;
        $run->nouvelles = true;
        for ($i = 1; $i <= 6; $i++) {
            $run->enVol["journees/J$i/tags_a_P1.json"] = 1;
        }
        self::assertTrue($run->aRejouer(), 'toutes les places prises, aucun appel connu de reste');

        $run->enVol = [];
        $run->plein = true;
        self::assertFalse($run->aRejouer(), 'rien en vol, les places remplies par les appels connus');
    }

    /** A run of a slice, its engine, journal and memory left out: the rule reads none of them. */
    private static function unRun(int $appelsDirects): Twin9Run
    {
        $run = (new \ReflectionClass(Twin9Run::class))->newInstanceWithoutConstructor();
        \Closure::bind(function (int $n): void {
            $this->appelsDirects = $n;
        }, $run, Twin9Run::class)($appelsDirects);

        return $run;
    }
}
