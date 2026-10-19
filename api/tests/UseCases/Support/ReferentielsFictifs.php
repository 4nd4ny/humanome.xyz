<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Support;

/**
 * Two FICTIONAL referentials of other structures than RESPIRE's (T15, UC-EPI-05):
 * nothing of a real referential enters the repository, the Humanome V18
 * included, which enters by the épistémiarques' atelier.
 *
 *  - lettre(): the shape of the Humanome V18 — five lettered poles A to E,
 *    four capacities each (A1 to E4), two facets under each (A1.1, A1.2),
 *    two declared levels, each with the motif of its codes;
 *  - neufPoles(): nine numbered poles, two competences each (1.01 to 9.02),
 *    one level, which it declares.
 */
final class ReferentielsFictifs
{
    public const LETTRES = ['A', 'B', 'C', 'D', 'E'];

    /** @return array<string, mixed> */
    public static function lettre(string $version = '1.0.0'): array
    {
        $poles = [];
        $competences = [];
        foreach (self::LETTRES as $i => $lettre) {
            $poles[] = ['num' => $i + 1, 'nom' => $lettre . ' · Pôle fictif ' . $lettre, 'couleur' => null,
                        'description' => 'Ce que cherche le pôle fictif ' . $lettre . '.'];
            for ($n = 1; $n <= 4; $n++) {
                $code = $lettre . $n;
                $competences[] = [
                    'code' => $code,
                    'nom' => 'Capacité fictive ' . $code,
                    'pole' => $i + 1,
                    'description' => "Définition fictive de la capacité {$code}.\n\n**Frontière** : fictive.",
                    'elements' => [
                        ['code' => $code . '.1', 'nom' => 'Facette fictive ' . $code . '.1',
                         'description' => "Description fictive.\n\n- Manifestation fictive.\n\n**Faux positif** : fictif."],
                        ['code' => $code . '.2', 'nom' => 'Facette fictive ' . $code . '.2'],
                    ],
                ];
            }
        }

        return [
            'schemaVersion' => '2.0.0',
            'kind' => 'referentiel',
            'id' => 'fictif-lettre',
            'version' => $version,
            'label' => 'Fictif lettré',
            'source' => 'Fixture de test (T15) : cinq pôles lettrés, leurs capacités et leurs facettes, fictifs',
            'niveaux' => [
                ['nom' => 'capacité', 'motif' => '[A-E][1-4]'],
                ['nom' => 'facette', 'motif' => '[A-E][1-4]\.[1-9]'],
            ],
            'poles' => $poles,
            'competences' => $competences,
        ];
    }

    /** @return array<string, mixed> */
    public static function neufPoles(string $version = '1.0.0'): array
    {
        $poles = [];
        $competences = [];
        for ($p = 1; $p <= 9; $p++) {
            $poles[] = ['num' => $p, 'nom' => 'Pôle fictif ' . $p, 'couleur' => null];
            for ($n = 1; $n <= 2; $n++) {
                $code = sprintf('%d.%02d', $p, $n);
                $competences[] = ['code' => $code, 'nom' => 'Compétence fictive ' . $code, 'pole' => $p];
            }
        }

        return [
            'schemaVersion' => '2.0.0',
            'kind' => 'referentiel',
            'id' => 'fictif-neuf',
            'version' => $version,
            'label' => 'Fictif à neuf pôles',
            'source' => 'Fixture de test (T15) : neuf pôles numérotés, deux compétences chacun, fictifs',
            'niveaux' => [['nom' => 'compétence', 'motif' => '[1-9]\.\d{2}']],
            'poles' => $poles,
            'competences' => $competences,
        ];
    }
}
