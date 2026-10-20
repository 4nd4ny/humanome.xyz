<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

/**
 * The pole files of a set of before T16 (« tagger/P1 » to « tagger/PN »),
 * FICTIVE: each « ## CODE — Fiche FICTIVE » section a competence of one of a
 * referential's poles. Such a set serves RESPIRE alone, in the structure its
 * pole files describe — the same poles, the same codes in each (2026-10-20).
 */
final class JeuAvantT16
{
    /**
     * @param array<string, mixed> $referentiel a referential document
     * @return array<string, string> template name => content
     */
    public static function fiches(array $referentiel): array
    {
        $fiches = [];
        foreach ($referentiel['poles'] as $pole) {
            $num = (int) $pole['num'];
            $texte = "# Pôle $num — FICTIF\n\n";
            foreach ($referentiel['competences'] as $c) {
                if ((int) $c['pole'] === $num) {
                    $texte .= '## ' . $c['code'] . " — Fiche FICTIVE\n\n";
                }
            }
            $fiches['tagger/P' . $num] = $texte;
        }

        return $fiches;
    }
}
