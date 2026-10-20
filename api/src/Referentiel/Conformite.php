<?php

declare(strict_types=1);

namespace Humanome\Referentiel;

use Humanome\Validation;
use InvalidArgumentException;

/**
 * The conformity of a cartography to the referential it maps (2026-10-20,
 * docs/contrats.md §11). JS twin: engine/src/conformite.js — same rules, same
 * messages, same pointers.
 *
 * The schemas no longer impose a structure (neither « RESPIRE = 7 poles » nor
 * « P.NN » codes): a document conforms to the VERSION of the referential it
 * maps, which its context knows (the run, the mass job, the stored
 * cartography). The guard stays: a day or a merge missing a pole of its
 * version — a model that lost it on the way — is refused, as is a code the
 * version does not know.
 *
 * Day: exactly the referential's poles (or its declared perimeter,
 * `perimetre.partiel`), each once; codes of the referential, each in its pole
 * (and in the perimeter when it lists its competences); a kairos that links
 * only codes of the referential. Merge: one domain per pole of the
 * referential, each once, codes of that pole; an ipsative profile keyed by its
 * poles. A document that names another referential than this one (none:
 * RESPIRE) does not conform. The `perimetre` marker is the document's own:
 * only a caller that set it (PoleAssembler) may rely on it.
 */
final class Conformite
{
    /** The referential of a document that names none (T17). */
    public const REFERENTIEL_PAR_DEFAUT = 'respire';

    private const KAIROS = [
        ['connexionsTransversales', 'codesRelies'],
        ['noeudsConceptuels', 'codesRelies'],
        ['competencesOrphelines', 'enRelationAvecCodes'],
    ];

    /**
     * @param string $kind 'cartographie-jour' or 'cartographie-merge'
     * @param array<string, mixed> $document a document already valid against its schema
     * @param array<string, mixed> $referentiel {id?, poles: [{num}], competences: [{code, pole}]}
     * @return array{valid: bool, errors: array<string, list<string>>} errors keyed by JSON pointer
     */
    public static function verifier(string $kind, array $document, array $referentiel): array
    {
        if (!\is_array($referentiel['poles'] ?? null) || !\is_array($referentiel['competences'] ?? null)) {
            throw new InvalidArgumentException('Conformite: referential { poles[], competences[] } required');
        }
        $errors = [];
        $add = static function (string $path, string $message) use (&$errors): void {
            $errors[$path][] = $message;
        };
        $poles = [];
        foreach ($referentiel['poles'] as $p) {
            $num = self::numero(\is_array($p) ? ($p['num'] ?? null) : null);
            if ($num !== null) {
                $poles[$num] = true;
            }
        }
        $poleDuCode = [];
        foreach ($referentiel['competences'] as $c) {
            $c = \is_array($c) ? $c : [];
            $poleDuCode[self::texte($c['code'] ?? null)] = self::numero($c['pole'] ?? null);
        }

        self::identite($document, $referentiel, $add);
        match ($kind) {
            'cartographie-jour' => self::journee($document, $poles, $poleDuCode, $add),
            'cartographie-merge' => self::fusion($document, $poles, $poleDuCode, $add),
            default => throw new InvalidArgumentException(sprintf('Conformite: kind "%s" not supported', $kind)),
        };

        return ['valid' => $errors === [], 'errors' => $errors];
    }

    /**
     * The schema, then — when it passes — the conformity to the referential.
     * The `perimetre` marker of a partial day (extractDay, the bench) is not
     * the schema's (additionalProperties false): the schema checks the day
     * without it, the conformity reads it (its poles, its competences).
     *
     * @param array<string, mixed> $document
     * @param array<string, mixed> $referentiel
     * @return array{valid: bool, errors: array<string, list<string>>}
     */
    public static function valider(string $kind, array $document, array $referentiel): array
    {
        $pourLeSchema = $document;
        if ($kind === 'cartographie-jour') {
            unset($pourLeSchema['perimetre']);
        }
        $schema = Validation::validate($kind, $pourLeSchema);
        if (!$schema['valid']) {
            return $schema;
        }

        return self::verifier($kind, $document, $referentiel);
    }

    /** @param array<string, mixed> $document @param array<string, mixed> $referentiel */
    private static function identite(array $document, array $referentiel, callable $add): void
    {
        $id = $referentiel['id'] ?? null;
        if (!\is_string($id) || $id === '') {
            return;
        }
        $nomme = \is_string($document['referentiel'] ?? null) && $document['referentiel'] !== ''
            ? $document['referentiel']
            : self::REFERENTIEL_PAR_DEFAUT;
        if ($nomme !== $id) {
            $add('/referentiel', sprintf('le document cartographie le référentiel « %s », pas « %s »', $nomme, $id));
        }
    }

    /**
     * @param array<string, mixed> $document
     * @param array<int, true> $poles
     * @param array<array-key, ?int> $poleDuCode
     */
    private static function journee(array $document, array $poles, array $poleDuCode, callable $add): void
    {
        $perimetre = \is_array($document['perimetre'] ?? null) ? $document['perimetre'] : [];
        $partiel = ($perimetre['partiel'] ?? null) === true;
        $attendus = $poles;
        if ($partiel && self::estListe($perimetre['poles'] ?? null)) {
            $attendus = [];
            foreach ($perimetre['poles'] as $i => $valeur) {
                $num = self::numero($valeur);
                if ($num === null || !isset($poles[$num])) {
                    $add("/perimetre/poles/{$i}", sprintf('le pôle %s du périmètre n\'est pas un pôle du référentiel', self::texte($valeur)));
                } else {
                    $attendus[$num] = true;
                }
            }
        }
        $duPerimetre = null;
        if ($partiel && self::estListe($perimetre['competences'] ?? null)) {
            $duPerimetre = array_fill_keys(array_map(self::texte(...), $perimetre['competences']), true);
        }

        $vus = [];
        foreach (self::liste($document['poles'] ?? null) as $i => $pole) {
            $pole = \is_array($pole) ? $pole : [];
            $num = self::numero($pole['poleNum'] ?? null);
            if ($num === null || !isset($poles[$num])) {
                $add("/poles/{$i}/poleNum", sprintf('le pôle %s n\'est pas un pôle du référentiel', self::texte($pole['poleNum'] ?? null)));
            } elseif (!isset($attendus[$num])) {
                $add("/poles/{$i}/poleNum", sprintf('le pôle %d est hors du périmètre', $num));
            } elseif (isset($vus[$num])) {
                $add("/poles/{$i}/poleNum", sprintf('le pôle %d figure deux fois', $num));
            }
            if ($num !== null) {
                $vus[$num] = true;
            }
            foreach (self::liste($pole['competences'] ?? null) as $j => $c) {
                $path = "/poles/{$i}/competences/{$j}/code";
                $valeur = \is_array($c) ? ($c['code'] ?? null) : null;
                self::codeDuPole($valeur, $num, $path, $poleDuCode, $add);
                $code = self::texte($valeur);
                if ($duPerimetre !== null && \array_key_exists($code, $poleDuCode) && !isset($duPerimetre[$code])) {
                    $add($path, sprintf('la compétence %s est hors du périmètre', $code));
                }
            }
        }
        self::manquants($attendus, $vus, '/poles', $add);

        $kairos = \is_array($document['kairos'] ?? null) ? $document['kairos'] : [];
        $emergences = $kairos['emergencesCrossPoles'] ?? null;
        if (\is_array($emergences) && !array_is_list($emergences)) {
            foreach (self::KAIROS as [$nom, $champ]) {
                foreach (self::liste($emergences[$nom] ?? null) as $i => $entree) {
                    foreach (self::liste(\is_array($entree) ? ($entree[$champ] ?? null) : null) as $j => $code) {
                        if (!\array_key_exists(self::texte($code), $poleDuCode)) {
                            $add("/kairos/emergencesCrossPoles/{$nom}/{$i}/{$champ}/{$j}",
                                sprintf('le code %s n\'est pas une compétence du référentiel', self::texte($code)));
                        }
                    }
                }
            }
        }
    }

    /**
     * @param array<string, mixed> $document
     * @param array<int, true> $poles
     * @param array<array-key, ?int> $poleDuCode
     */
    private static function fusion(array $document, array $poles, array $poleDuCode, callable $add): void
    {
        $domaines = self::liste($document['domains'] ?? null);
        $vus = [];
        foreach ($domaines as $i => $domaine) {
            $domaine = \is_array($domaine) ? $domaine : [];
            $poleDuDomaine = null;
            foreach (self::liste($domaine['competences'] ?? null) as $j => $c) {
                $code = self::texte(\is_array($c) ? ($c['code'] ?? null) : null);
                $path = "/domains/{$i}/competences/{$j}/code";
                if (!\array_key_exists($code, $poleDuCode)) {
                    $add($path, sprintf('le code %s n\'est pas une compétence du référentiel', $code));
                } elseif ($poleDuDomaine === null) {
                    $poleDuDomaine = $poleDuCode[$code];
                } elseif ($poleDuCode[$code] !== $poleDuDomaine) {
                    $add($path, sprintf('la compétence %s est du pôle %s, pas du pôle %s de ce domaine',
                        $code, self::texte($poleDuCode[$code]), self::texte($poleDuDomaine)));
                }
            }
            if ($poleDuDomaine !== null) {
                if (isset($vus[$poleDuDomaine])) {
                    $add("/domains/{$i}", sprintf('le pôle %d figure dans deux domaines', $poleDuDomaine));
                }
                $vus[$poleDuDomaine] = true;
            }
        }
        self::manquants($poles, $vus, '/domains', $add);
        if (\count($domaines) > \count($poles)) {
            $add('/domains', sprintf('%d domaines pour %d pôles dans le référentiel', \count($domaines), \count($poles)));
        }

        $profil = $document['profilIpsatif'] ?? null;
        if (\is_array($profil) && !array_is_list($profil)) {
            foreach ($profil as $cle => $entree) {
                $num = self::numero((string) $cle);
                if ($num === null || !isset($poles[$num])) {
                    $add("/profilIpsatif/{$cle}", sprintf('le pôle %s n\'est pas un pôle du référentiel', (string) $cle));
                    continue;
                }
                foreach (self::liste(\is_array($entree) ? ($entree['competences'] ?? null) : null) as $j => $c) {
                    self::codeDuPole(\is_array($c) ? ($c['code'] ?? null) : null, $num,
                        "/profilIpsatif/{$cle}/competences/{$j}/code", $poleDuCode, $add);
                }
            }
        }
    }

    /**
     * « il manque le pôle N du référentiel »: the expected poles the document lacks.
     *
     * @param array<int, true> $attendus
     * @param array<int, true> $vus
     */
    private static function manquants(array $attendus, array $vus, string $path, callable $add): void
    {
        $absents = array_values(array_diff(array_keys($attendus), array_keys($vus)));
        sort($absents);
        if ($absents !== []) {
            $add($path, sprintf('il manque %s %s du référentiel',
                \count($absents) > 1 ? 'les pôles' : 'le pôle', implode(', ', $absents)));
        }
    }

    /** @param array<array-key, ?int> $poleDuCode */
    private static function codeDuPole(mixed $valeur, ?int $num, string $path, array $poleDuCode, callable $add): void
    {
        $code = self::texte($valeur);
        if (!\array_key_exists($code, $poleDuCode)) {
            $add($path, sprintf('le code %s n\'est pas une compétence du référentiel', $code));
        } elseif ($num !== null && $poleDuCode[$code] !== $num) {
            $add($path, sprintf('la compétence %s est du pôle %s, pas du pôle %d', $code, self::texte($poleDuCode[$code]), $num));
        }
    }

    /** A pole number: a positive integer, or its canonical string (« 3 »); null otherwise — twin of numero(). */
    private static function numero(mixed $valeur): ?int
    {
        if (\is_int($valeur)) {
            return $valeur > 0 ? $valeur : null;
        }
        if (\is_float($valeur)) {
            return $valeur > 0 && floor($valeur) === $valeur && $valeur <= PHP_INT_MAX ? (int) $valeur : null;
        }

        return \is_string($valeur) && preg_match('/^[1-9][0-9]*$/D', $valeur) === 1 ? (int) $valeur : null;
    }

    /** A list, or nothing: what is not a JSON array is not walked — twin of liste(). */
    private static function liste(mixed $valeur): array
    {
        return self::estListe($valeur) ? $valeur : [];
    }

    private static function estListe(mixed $valeur): bool
    {
        return \is_array($valeur) && array_is_list($valeur);
    }

    /** A value in a message or a code key, as the JS twin writes it (texte()). */
    private static function texte(mixed $valeur): string
    {
        if (\is_float($valeur) && floor($valeur) === $valeur && abs($valeur) < 1e15) {
            return (string) (int) $valeur;
        }

        return \is_scalar($valeur) ? (string) $valeur
            : (json_encode($valeur, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '');
    }
}
