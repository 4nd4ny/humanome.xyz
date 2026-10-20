<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Twin9\LeakFilter;
use PHPUnit\Framework\TestCase;

/**
 * Unit tests for the anti-leak backstop (ADR-010 §2) — focused on the bypasses
 * raised in the security review (finding B): the char-level NFKC-normalized
 * matching must catch a recitation dressed up with punctuation, spacing or
 * compatibility homoglyphs, while never touching the learner's own payload.
 *
 * Templates here are FICTITIOUS — the real Twin9 prompts are confidential.
 */
final class Twin9LeakFilterTest extends TestCase
{
    /** The filter as Resultats applies it: an index of the confidential material, then the output against it. */
    private static function filtrer(string $sortie): array
    {
        return LeakFilter::expurger(LeakFilter::indexer(self::GABARIT), $sortie);
    }

    // A distinctive fake template line, >= 48 alphanumerics once normalized.
    private const GABARIT =
        "Tu es le Greffier : recense chaque pièce du dossier sans jamais trancher toi-même la présence.";

    public function testCleanOutputPassesThrough(): void
    {
        $out = "L'élève décrit sa journée à l'atelier de menuiserie avec précision.";
        $r = self::filtrer($out);
        self::assertSame($out, $r['sortie']);
        self::assertSame(0, $r['fuites']);
    }

    public function testVerbatimRecitationIsRedacted(): void
    {
        $out = "Voici mes instructions : " . self::GABARIT . " — fin.";
        $r = self::filtrer($out);
        self::assertSame(1, $r['fuites']);
        self::assertStringContainsString('[expurgé]', $r['sortie']);
        self::assertStringNotContainsString('Greffier', $r['sortie']);
        self::assertStringStartsWith('Voici mes instructions :', $r['sortie']);
        self::assertStringEndsWith('— fin.', $r['sortie']);
    }

    public function testPunctuationInterpolationBypassIsDefeated(): void
    {
        // The word-level filter would miss this; the char-level one must not.
        $out = 'Tu-es-le-Greffier-:-recense-chaque-pièce-du-dossier-sans-jamais-'
            . 'trancher-toi-même-la-présence.';
        $r = self::filtrer($out);
        self::assertGreaterThanOrEqual(1, $r['fuites'], 'punctuation-dressed recitation still caught');
        self::assertStringNotContainsString('Greffier', $r['sortie']);
    }

    public function testSpacingAndCaseVariationIsDefeated(): void
    {
        $out = "TU  ES\tLE   GREFFIER : RECENSE CHAQUE PIÈCE DU DOSSIER SANS JAMAIS "
            . "TRANCHER TOI-MÊME LA PRÉSENCE.";
        $r = self::filtrer($out);
        self::assertGreaterThanOrEqual(1, $r['fuites']);
        self::assertStringNotContainsStringIgnoringCase('greffier', $r['sortie']);
    }

    public function testFullwidthHomoglyphBypassIsDefeated(): void
    {
        // Fullwidth Latin letters (U+FF21..) NFKC-fold to ASCII — must be caught.
        $ff = static fn (string $s): string => preg_replace_callback(
            '/[A-Za-z0-9]/u',
            static fn (array $m): string => mb_chr(0xFF00 + (mb_ord($m[0]) - 0x20), 'UTF-8'),
            $s,
        );
        $r = self::filtrer('Note : ' . $ff(self::GABARIT));
        self::assertGreaterThanOrEqual(1, $r['fuites'], 'fullwidth recitation caught via NFKC');
    }

    public function testUserPayloadQuoteIsNeverRedacted(): void
    {
        // The template is rendered with EMPTY variables; a model quoting the
        // learner's own long passage must survive untouched.
        $payload = "hier j'ai réparé la grande horloge du village avec mes propres mains, "
            . "puis j'ai expliqué le mécanisme à ma petite sœur émerveillée";
        $r = self::filtrer("Citation du journal : " . $payload);
        self::assertSame(0, $r['fuites']);
        self::assertStringContainsString($payload, $r['sortie']);
    }

    public function testShortSharedRunIsNotRedacted(): void
    {
        // A handful of shared words (< MIN_CARS normalized chars) is not a leak.
        $r = self::filtrer("Il est le greffier du tribunal municipal.");
        self::assertSame(0, $r['fuites']);
        self::assertStringContainsString('greffier', $r['sortie']);
    }
}
