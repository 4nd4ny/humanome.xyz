<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Llm\MockProvider;
use Humanome\Tests\UseCases\Support\ReferentielsFictifs;
use Humanome\Worker\PoleAssembler;
use Humanome\Worker\PromptRunner;
use PHPUnit\Framework\TestCase;

/**
 * 'mock' provider: canned pole answers from schemas/fixtures/ (engine
 * integration without any key), generic text otherwise. Pure unit test —
 * no database, no HTTP.
 */
final class LlmMockProviderTest extends TestCase
{
    private MockProvider $provider;

    protected function setUp(): void
    {
        $this->provider = new MockProvider();
    }

    public function testPoleMarkerReturnsTheFixturePoleAsJson(): void
    {
        // Shape of the engine extraction prompt (engine/src/pipeline/extract.js).
        $prompt = "# Pôle 2 — Relations\nFeuille du 2026-01-05.\n\"poleNum\": \"2\"";

        $result = $this->provider->complete('claude-haiku-4-5-20251001', null, $prompt, 512);

        $pole = json_decode($result['text'], true);
        self::assertIsArray($pole);
        self::assertSame('2', $pole['poleNum']);
        self::assertArrayHasKey('competences', $pole);
        self::assertSame('mock', $result['model']);
        self::assertGreaterThan(0, $result['usage']['inputTokens']);
        self::assertGreaterThan(0, $result['usage']['outputTokens']);
    }

    public function testFixtureDayIsPickedFromThePrompt(): void
    {
        $day05 = $this->provider->complete('m', null, 'Pôle 3 — journée du 2026-01-05', 512);
        $day07 = $this->provider->complete('m', null, 'Pôle 3 — journée du 2026-01-07', 512);

        self::assertNotSame($day05['text'], $day07['text']);
        self::assertSame('3', json_decode($day07['text'], true)['poleNum']);
    }

    public function testKairosPromptReturnsTheFixtureKairosField(): void
    {
        // Shape of the engine kairos prompt (buildKairosExtractionPrompt):
        // marker « SYNTHÈSE KAIROS », day date present. Day 07 has an object.
        $prompt = "Tu produis maintenant la\nSYNTHÈSE KAIROS transversale de la journée.\n"
            . "# Feuille de portfolio du mercredi 7 janvier 2026 (2026-01-07)";

        $result = $this->provider->complete('m', null, $prompt, 512);

        $kairos = json_decode($result['text'], true);
        self::assertIsArray($kairos);
        self::assertArrayHasKey('kairos', $kairos);
        self::assertArrayHasKey('emergencesCrossPoles', $kairos);
    }

    public function testKairosPromptOnANullKairosDayReturnsJsonNull(): void
    {
        // Day 05's fixture kairos is null — valid per the cartographie-jour
        // schema, parsed as null by the engine's parseExtractionResponse.
        $prompt = "SYNTHÈSE KAIROS transversale — journée du 2026-01-05";

        $result = $this->provider->complete('m', null, $prompt, 512);

        self::assertSame('null', $result['text']);
    }

    public function testPromptWithoutPoleMarkerGetsGenericText(): void
    {
        $result = $this->provider->complete('m', 'Tu es concis.', 'Résume ce texte librement.', 512);

        self::assertStringContainsString('mock', $result['text']);
        self::assertNull(json_decode($result['text'], true));
        self::assertGreaterThan(0, $result['usage']['inputTokens']);
    }

    /**
     * Any referential (2026-10-20): RESPIRE v7's prompts get the fixtures'
     * answers byte for byte; another referential's get them with ITS codes —
     * answers its job's assembly accepts, a pole beyond the seventh included.
     */
    public function testAnswersFitTheReferentialOfThePrompt(): void
    {
        $root = \dirname(__DIR__, 2);
        $package = json_decode((string) file_get_contents($root . '/build/prompt-packages/aurora-v3-reconstruit-1.0.0.json'), true, 512, JSON_THROW_ON_ERROR);
        $respire = json_decode((string) file_get_contents($root . '/schemas/fixtures/referentiel-respire-v7.json'), true, 512, JSON_THROW_ON_ERROR);
        $fixture = json_decode((string) file_get_contents($root . '/schemas/fixtures/cartographie-jour-2026-01-07.json'), true, 512, JSON_THROW_ON_ERROR);

        $runner = new PromptRunner($package, $respire);
        $pole3 = $this->provider->complete('m', null, $runner->polePrompt(3, 'Feuille.', '2026-01-07'), 512);
        self::assertSame(json_encode($fixture['poles'][2], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), $pole3['text']);
        $kairos = $this->provider->complete('m', null, $runner->kairosPrompt('Feuille.', '2026-01-07'), 512);
        self::assertSame(json_encode($fixture['kairos'], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), $kairos['text']);

        foreach ([ReferentielsFictifs::neufPoles(), ReferentielsFictifs::lettre()] as $referentiel) {
            $runner = new PromptRunner($package, $referentiel);
            $poles = [];
            foreach ($runner->poleNums() as $num) {
                $answer = json_decode($this->provider->complete('m', null, $runner->polePrompt($num, 'Feuille.', '2026-01-07'), 512)['text'], true);
                self::assertSame((string) $num, $answer['poleNum']);
                $poles[$num] = PoleAssembler::assemblePole($answer, $num, '2026-01-07', $referentiel);
            }
            $answer = json_decode($this->provider->complete('m', null, $runner->kairosPrompt('Feuille.', '2026-01-07'), 512)['text'], true);
            PoleAssembler::validateKairos($answer, $poles, '2026-01-07', $referentiel);
            $document = PoleAssembler::assembleDay($poles, $answer, '2026-01-07', $referentiel);
            self::assertSame($referentiel['id'], $document['referentiel']);
            self::assertCount(\count($referentiel['poles']), $document['poles']);
        }
    }

    public function testMissingFixturesDirectoryFallsBackToGenericText(): void
    {
        $provider = new MockProvider('/nonexistent/fixtures');

        $result = $provider->complete('m', null, 'Pôle 1 — "poleNum": "1"', 512);

        self::assertStringContainsString('mock', $result['text']);
    }
}
