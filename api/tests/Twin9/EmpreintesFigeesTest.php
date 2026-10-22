<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\Twin9\CallSettings;
use Humanome\Twin9\Evaluations;
use Humanome\Twin9\MoteurReglages;
use Humanome\Twin9\ProfilRepository;
use PHPUnit\Framework\TestCase;
use stdClass;

/**
 * The fingerprints a run leaves, frozen as they were before the per-call
 * route (C0) and the providers (P1-5): the memory takes a day back only
 * under the same CallSettings::empreinte and the same engine settings, the
 * forecasts read the evaluations of the same Evaluations::signature. A value
 * that changes here throws away every memory and every forecast of the v9.8
 * profile — never refresh these literals to make a change pass: the change
 * is what is wrong.
 *
 * Computed on the v9.8 profile as the platform keeps it (validated, its
 * defaults filled), with an invented template set and an invented
 * referential: nothing of a real template nor of a real fingerprint here.
 */
final class EmpreintesFigeesTest extends TestCase
{
    /** An invented template set; the merge's re-readings are left out of the fingerprint. */
    private const GABARITS = ['lourd/20-greffier' => 'g', 'tagger/P1' => 'fiche', 'merge/04-rapporteur' => 'r'];

    public function testTheFingerprintOfTheV98Settings(): void
    {
        $profil = self::v98();

        self::assertSame('23581e37fa185176',
            CallSettings::empreinte($profil, $profil->troncatures, self::GABARITS, self::referentiel()));
        self::assertSame('cd9d4e95e0e87fc3', CallSettings::empreinte($profil, $profil->troncatures, self::GABARITS),
            'un run d’avant T16, sans référentiel');

        $direct = ProfilRepository::v98();
        $direct->voie = 'directe';
        $direct = ProfilRepository::validate($direct);
        self::assertSame(CallSettings::empreinte($profil, $profil->troncatures, self::GABARITS, self::referentiel()),
            CallSettings::empreinte($direct, $direct->troncatures, self::GABARITS, self::referentiel()),
            'la voie n’y entre pas');
    }

    public function testTheEngineSettingsOfTheV98Profile(): void
    {
        $moteur = MoteurReglages::depuis(self::v98(), self::referentiel());

        self::assertSame('1d28b544d1d1c5370f7659f25de513096366cd319bbf9ee53ab141e142760d5b',
            hash('sha256', json_encode($moteur, JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION)));
    }

    public function testTheSignatureOfTheV98Evaluations(): void
    {
        self::assertSame('d04d49de011e21fc', Evaluations::signature(self::v98(), 'a1b2c3d4e5f60718', '0f1e2d3c4b5a6978'));
        self::assertSame('55958e6947daec8c', Evaluations::signature(self::v98(), 'a1b2c3d4e5f60718'),
            'un run d’avant T16');
    }

    private static function v98(): stdClass
    {
        return ProfilRepository::validate(ProfilRepository::v98());
    }

    /**
     * An invented referential, as ReferentielMoteur::bloc() gives it to the engine.
     *
     * @return array<string, mixed>
     */
    private static function referentiel(): array
    {
        return ['id' => 'fictif', 'version' => '1.0.0', 'label' => 'Fictif', 'motif' => '[A-B][1-2]',
                'poles' => [['num' => 1, 'nom' => 'A', 'entete' => "# Pôle 1 — A\n",
                             'competences' => [['code' => 'A1', 'nom' => 'Une', 'fiche' => '## A1 — Une'],
                                               ['code' => 'A2', 'nom' => 'Deux', 'fiche' => '## A2 — Deux']]],
                            ['num' => 2, 'nom' => 'B', 'entete' => "# Pôle 2 — B\n",
                             'competences' => [['code' => 'B1', 'nom' => 'Trois', 'fiche' => '## B1 — Trois']]]]];
    }
}
