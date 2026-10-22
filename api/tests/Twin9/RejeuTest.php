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
 * flight nor the cap decide it any more. TrancheTest plays it in slices.
 */
final class RejeuTest extends TestCase
{
    /** @return iterable<string, array{0: bool, 1: bool, 2: int, 3: bool}> answers arrived, places filled, calls in flight (of 6) => replay */
    public static function cas(): iterable
    {
        yield 'rien de nouveau' => [false, false, 0, false];
        yield 'rien de nouveau, une place libre' => [false, false, 3, false];
        yield 'rien de nouveau, les places remplies' => [false, true, 6, false];
        yield 'des réponses, les places remplies par les appels connus' => [true, true, 6, false];
        yield 'des réponses, une place que les appels connus ne remplissent pas' => [true, false, 3, true];
        yield 'des réponses, plus rien en vol : la passe finale' => [true, false, 0, true];
        // the last call known took the last place: no call left to send, the pass comes while the others fly
        yield 'des réponses, la dernière place prise par le dernier appel connu' => [true, false, 6, true];
    }

    #[DataProvider('cas')]
    public function testTheTruthTableOfTheReplay(bool $nouvelles, bool $plein, int $enVol, bool $rejouer): void
    {
        $run = self::unRun(6);
        $run->passes = 1;
        $run->nouvelles = $nouvelles;
        $run->plein = $plein;
        for ($i = 1; $i <= $enVol; $i++) {
            $run->enVol["journees/J$i/tags_a_P1.json"] = 1;
        }

        self::assertSame($rejouer, $run->aRejouer());
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
