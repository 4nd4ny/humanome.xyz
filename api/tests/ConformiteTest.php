<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Referentiel\Conformite;
use PHPUnit\Framework\TestCase;

/**
 * The conformity of a cartography to its referential version (docs/contrats.md
 * §11) — twin of engine/src/conformite.test.js, on the same public fixtures
 * (schemas/fixtures): RESPIRE v7, a day with its kairos, the merge of three.
 */
final class ConformiteTest extends TestCase
{
    /** @return array<string, mixed> */
    private static function lire(string $nom): array
    {
        return json_decode((string) file_get_contents(\dirname(__DIR__, 2) . '/schemas/fixtures/' . $nom), true,
            512, JSON_THROW_ON_ERROR);
    }

    /** @return array<string, mixed> RESPIRE in a 6-pole version: its 7th pole and competences removed */
    private static function respireSixPoles(): array
    {
        $ref = self::lire('referentiel-respire-v7.json');
        $ref['version'] = '8.0.0';
        $ref['poles'] = array_values(array_filter($ref['poles'], static fn (array $p): bool => $p['num'] !== 7));
        $ref['competences'] = array_values(array_filter($ref['competences'], static fn (array $c): bool => $c['pole'] !== 7));

        return $ref;
    }

    /** @return array<string, mixed> the day without its 7th pole, its kairos linking only codes of the others */
    private static function jourSixPoles(): array
    {
        $doc = self::lire('cartographie-jour-2026-01-07.json');
        $doc['poles'] = array_values(array_filter($doc['poles'], static fn (array $p): bool => $p['poleNum'] !== '7'));
        $garde = static fn (array $codes): array => array_values(array_filter($codes,
            static fn ($c): bool => !str_starts_with((string) $c, '7.')));
        foreach (['connexionsTransversales' => 'codesRelies', 'noeudsConceptuels' => 'codesRelies',
                  'competencesOrphelines' => 'enRelationAvecCodes'] as $liste => $champ) {
            foreach ($doc['kairos']['emergencesCrossPoles'][$liste] ?? [] as $i => $entree) {
                $doc['kairos']['emergencesCrossPoles'][$liste][$i][$champ] = $garde($entree[$champ]);
            }
        }

        return $doc;
    }

    public function testARespireV7DayConformsToRespireV7(): void
    {
        self::assertSame(['valid' => true, 'errors' => []],
            Conformite::valider('cartographie-jour', self::lire('cartographie-jour-2026-01-07.json'),
                self::lire('referentiel-respire-v7.json')));
    }

    public function testTheGuardStaysADayThatLostAPoleMissesIt(): void
    {
        $doc = self::lire('cartographie-jour-2026-01-07.json');
        $doc['poles'] = \array_slice($doc['poles'], 0, 6);
        self::assertSame(['valid' => false, 'errors' => ['/poles' => ['il manque le pôle 7 du référentiel']]],
            Conformite::valider('cartographie-jour', $doc, self::lire('referentiel-respire-v7.json')));
    }

    public function testASixPoleRespireVersionTakesItsSixPoleDayAndRefusesASevenPoleOne(): void
    {
        $six = self::respireSixPoles();
        self::assertSame(['valid' => true, 'errors' => []], Conformite::valider('cartographie-jour', self::jourSixPoles(), $six));
        $r = Conformite::verifier('cartographie-jour', self::lire('cartographie-jour-2026-01-07.json'), $six);
        self::assertFalse($r['valid']);
        self::assertSame(['le pôle 7 n\'est pas un pôle du référentiel'], $r['errors']['/poles/6/poleNum']);
    }

    public function testAnUnknownCodeACodeOfAnotherPoleAndATwicePoleAreNamed(): void
    {
        $doc = self::lire('cartographie-jour-2026-01-07.json');
        $doc['poles'][0]['competences'][0]['code'] = '9.99';
        $doc['poles'][1]['competences'][0]['code'] = '1.01';
        $doc['poles'][] = $doc['poles'][2];
        self::assertSame([
            '/poles/0/competences/0/code' => ['le code 9.99 n\'est pas une compétence du référentiel'],
            '/poles/1/competences/0/code' => ['la compétence 1.01 est du pôle 1, pas du pôle 2'],
            '/poles/7/poleNum' => ['le pôle 3 figure deux fois'],
        ], Conformite::verifier('cartographie-jour', $doc, self::lire('referentiel-respire-v7.json'))['errors']);
    }

    public function testAKairosLinkingAnUnknownCodeIsNamedAtItsPath(): void
    {
        $doc = self::lire('cartographie-jour-2026-01-07.json');
        $doc['kairos']['emergencesCrossPoles']['connexionsTransversales'][0]['codesRelies'][] = '8.01';
        $i = \count($doc['kairos']['emergencesCrossPoles']['connexionsTransversales'][0]['codesRelies']) - 1;
        self::assertSame(["/kairos/emergencesCrossPoles/connexionsTransversales/0/codesRelies/{$i}"],
            array_keys(Conformite::verifier('cartographie-jour', $doc, self::lire('referentiel-respire-v7.json'))['errors']));
    }

    public function testAPartialPerimeterItsPolesItsCompetencesPolesOfTheReferential(): void
    {
        $ref = self::lire('referentiel-respire-v7.json');
        $doc = self::lire('cartographie-jour-2026-01-07.json');
        $pole3 = array_values(array_filter($doc['poles'], static fn (array $p): bool => $p['poleNum'] === '3'))[0];
        $codes3 = array_column($pole3['competences'], 'code');
        $doc['poles'] = [$pole3];
        $doc['kairos'] = null;
        $doc['perimetre'] = ['partiel' => true, 'poles' => [3], 'competences' => array_column(array_values(array_filter(
            $ref['competences'], static fn (array $c): bool => $c['pole'] === 3)), 'code')];
        self::assertSame(['valid' => true, 'errors' => []], Conformite::verifier('cartographie-jour', $doc, $ref));

        $doc['perimetre'] = ['partiel' => true, 'poles' => [3, 12], 'competences' => \array_slice($codes3, 1)];
        self::assertSame([
            '/perimetre/poles/1' => ['le pôle 12 du périmètre n\'est pas un pôle du référentiel'],
            '/poles/0/competences/0/code' => [sprintf('la compétence %s est hors du périmètre', $codes3[0])],
        ], Conformite::verifier('cartographie-jour', $doc, $ref)['errors']);

        $doc['perimetre'] = ['partiel' => true, 'poles' => [4]];
        self::assertSame([
            '/poles/0/poleNum' => ['le pôle 3 est hors du périmètre'],
            '/poles' => ['il manque le pôle 4 du référentiel'],
        ], Conformite::verifier('cartographie-jour', $doc, $ref)['errors']);
    }

    public function testADocumentNamesItsReferentialNoneIsRespire(): void
    {
        $autre = ['id' => 'fictif-lettre', 'poles' => [['num' => 1]], 'competences' => [['code' => 'A1', 'pole' => 1]]];
        $doc = ['schemaVersion' => '1.0.0', 'kind' => 'cartographie-jour', 'date' => '2026-01-05', 'poles' => [], 'kairos' => null];
        self::assertSame(['le document cartographie le référentiel « respire », pas « fictif-lettre »'],
            Conformite::verifier('cartographie-jour', $doc, $autre)['errors']['/referentiel']);
        $nomme = self::lire('cartographie-jour-2026-01-07.json') + ['referentiel' => 'fictif-lettre'];
        self::assertSame(['le document cartographie le référentiel « fictif-lettre », pas « respire »'],
            Conformite::verifier('cartographie-jour', $nomme, self::lire('referentiel-respire-v7.json'))['errors']['/referentiel']);
    }

    public function testTheSchemaFirst(): void
    {
        $r = Conformite::valider('cartographie-jour', ['kind' => 'cartographie-jour'], self::lire('referentiel-respire-v7.json'));
        self::assertFalse($r['valid']);
        self::assertArrayNotHasKey('/poles', $r['errors']);
    }

    /** The partial day's `perimetre` marker is not the schema's: valider() checks the day without it, the conformity reads it. */
    public function testThePerimeterMarkerEscapesTheSchemaNotTheConformity(): void
    {
        $ref = self::lire('referentiel-respire-v7.json');
        $jour = self::lire('cartographie-jour-2026-01-07.json');
        $pole3 = array_values(array_filter($jour['poles'], static fn (array $p): bool => $p['poleNum'] === '3'));
        $partiel = array_merge($jour, ['poles' => $pole3, 'kairos' => null, 'perimetre' => ['partiel' => true, 'poles' => [3]]]);
        self::assertSame(['valid' => true, 'errors' => []], Conformite::valider('cartographie-jour', $partiel, $ref));
        $sansMarqueur = $partiel;
        unset($sansMarqueur['perimetre']);
        self::assertSame(['/poles' => ['il manque les pôles 1, 2, 4, 5, 6, 7 du référentiel']],
            Conformite::valider('cartographie-jour', $sansMarqueur, $ref)['errors']);
        $horsPerimetre = array_merge($partiel, ['perimetre' => ['partiel' => true, 'poles' => [2]]]);
        self::assertSame([
            '/poles/0/poleNum' => ['le pôle 3 est hors du périmètre'],
            '/poles' => ['il manque le pôle 2 du référentiel'],
        ], Conformite::valider('cartographie-jour', $horsPerimetre, $ref)['errors']);
    }

    public function testAReadableReferentialAndAKnownKindAreRequired(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        Conformite::verifier('cartographie-jour', [], ['poles' => []]);
    }

    public function testAnUnknownKindIsRefused(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        Conformite::verifier('referentiel', [], self::lire('referentiel-respire-v7.json'));
    }

    public function testTheRespireV7MergeConformsAMergeThatLostPolesDoesNot(): void
    {
        $ref = self::lire('referentiel-respire-v7.json');
        $fusion = self::lire('cartographie-merge-3-jours.json');
        // verifier, not valider: decoded as PHP arrays, its empty objects ({}) would read as lists for the schema
        self::assertSame(['valid' => true, 'errors' => []], Conformite::verifier('cartographie-merge', $fusion, $ref));
        $fusion['domains'] = \array_slice($fusion['domains'], 0, 5);
        self::assertSame(['/domains' => ['il manque les pôles 6, 7 du référentiel']],
            Conformite::verifier('cartographie-merge', $fusion, $ref)['errors']);
    }

    /** Twin of the JS case: off-schema inputs read the same on both sides. */
    public function testOffSchemaCasesReadAsInJs(): void
    {
        $ref = [
            'id' => 'fictif',
            'poles' => [['num' => 1], ['num' => 2]],
            'competences' => [['code' => '101', 'pole' => 1], ['code' => 'B1', 'pole' => 2]],
        ];
        $jour = [
            'referentiel' => 'fictif',
            'poles' => [
                ['poleNum' => '1abc', 'competences' => [['code' => '101']]],
                ['poleNum' => 1.5, 'competences' => []],
                ['poleNum' => '1', 'competences' => [['code' => 101], ['code' => null]]],
            ],
            'kairos' => ['emergencesCrossPoles' => ['connexionsTransversales' => ['0' => ['codesRelies' => ['X9']], 'x' => []]]],
        ];
        self::assertSame([
            '/poles/0/poleNum' => ['le pôle 1abc n\'est pas un pôle du référentiel'],
            '/poles/1/poleNum' => ['le pôle 1.5 n\'est pas un pôle du référentiel'],
            '/poles/2/competences/1/code' => ['le code null n\'est pas une compétence du référentiel'],
            '/poles' => ['il manque le pôle 2 du référentiel'],
        ], Conformite::verifier('cartographie-jour', $jour, $ref)['errors']);
        $partiel = ['referentiel' => 'fictif', 'poles' => [], 'kairos' => null,
            'perimetre' => ['partiel' => true, 'poles' => ['1abc', 1.5, [2]], 'competences' => ['B1']]];
        self::assertSame([
            '/perimetre/poles/0' => ['le pôle 1abc du périmètre n\'est pas un pôle du référentiel'],
            '/perimetre/poles/1' => ['le pôle 1.5 du périmètre n\'est pas un pôle du référentiel'],
            '/perimetre/poles/2' => ['le pôle [2] du périmètre n\'est pas un pôle du référentiel'],
        ], Conformite::verifier('cartographie-jour', $partiel, $ref)['errors']);
        $competencesSeules = ['referentiel' => 'fictif', 'poles' => [['poleNum' => '2', 'competences' => [['code' => 'B1']]]],
            'kairos' => null, 'perimetre' => ['partiel' => true, 'competences' => ['B1']]];
        self::assertSame(['/poles' => ['il manque le pôle 1 du référentiel']],
            Conformite::verifier('cartographie-jour', $competencesSeules, $ref)['errors']);
        $fusion = [
            'referentiel' => 'fictif',
            'domains' => [['competences' => [['code' => '101']]], ['competences' => [['code' => 'B1']]]],
            'profilIpsatif' => ['01' => ['competences' => []], '2' => ['competences' => [['code' => 'B1']]]],
        ];
        self::assertSame(['/profilIpsatif/01' => ['le pôle 01 n\'est pas un pôle du référentiel']],
            Conformite::verifier('cartographie-merge', $fusion, $ref)['errors']);
    }

    public function testAMixedDomainATwiceDomainAndAnUnknownProfilePoleAreNamed(): void
    {
        $doc = self::lire('cartographie-merge-3-jours.json');
        $doc['domains'][0]['competences'][] = $doc['domains'][1]['competences'][0];
        $doc['domains'][] = $doc['domains'][2];
        $doc['profilIpsatif']['9'] = $doc['profilIpsatif']['1'];
        $code = $doc['domains'][1]['competences'][0]['code'];
        $n = \count($doc['domains'][0]['competences']) - 1;
        self::assertSame([
            "/domains/0/competences/{$n}/code" => [sprintf('la compétence %s est du pôle 2, pas du pôle 1 de ce domaine', $code)],
            '/domains/7' => ['le pôle 3 figure dans deux domaines'],
            '/domains' => ['8 domaines pour 7 pôles dans le référentiel'],
            '/profilIpsatif/9' => ['le pôle 9 n\'est pas un pôle du référentiel'],
        ], Conformite::verifier('cartographie-merge', $doc, self::lire('referentiel-respire-v7.json'))['errors']);
    }

    public function testTheRespireV7MergeDoesNotConformToASixPoleVersion(): void
    {
        $r = Conformite::verifier('cartographie-merge', self::lire('cartographie-merge-3-jours.json'), self::respireSixPoles());
        self::assertFalse($r['valid']);
        self::assertContains('le pôle 7 n\'est pas un pôle du référentiel', array_merge(...array_values($r['errors'])));
    }
}
