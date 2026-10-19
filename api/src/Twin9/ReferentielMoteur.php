<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Referentiel\FicheGenerator;
use Humanome\Referentiel\ReferentielRepository;
use PDO;

/**
 * The run's referential as the engine reads it (T16, Twin_v9's
 * docs/plan-twin9-php.md; docs/contrats.md §8.8): drawn from the base, at
 * the version its profile freezes, into the engine's settings —
 * {id, version, label, motif, poles: [{num, nom, entete, competences:
 * [{code, nom, fiche}]}]}. The engine draws from it what the v9.8 wrote of
 * RESPIRE: the poles' names and keys, the number of competences, the form
 * of their codes, their order, the referential's name.
 *
 * RESPIRE's preambles and fiches are those the base keeps (FicheGenerator,
 * the source unique of July 2026), the bytes of the v9.8's pole files;
 * another referential's are written from its document: a pole's preamble,
 * « # Pôle N — its name », then its description; a competence's fiche,
 * « ## CODE — its name », its description, then its finer elements, each
 * under a title one level down, with its description. A pole's competences
 * come in the natural order of their codes (A2 before A10), the order the
 * engine sorts them in; RESPIRE's is its own.
 */
final class ReferentielMoteur
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * @return array{id: string, version: string, label: string, motif: string,
     *               poles: list<array{num: int, nom: string, entete: string,
     *                                 competences: list<array{code: string, nom: string, fiche: string}>}>}
     * @throws Twin9Exception 422 for a version the base does not have; 503 for RESPIRE without its fiches
     */
    public function bloc(string $id, string $version): array
    {
        $v = (new ReferentielRepository($this->pdo))->findVersion($id, $version)
            ?? throw new Twin9Exception('Référentiel introuvable : ' . $id . ' ' . $version, 422);
        $doc = $v['content'];
        $parPole = [];
        foreach ($doc['competences'] as $c) {
            $parPole[(int) $c['pole']][] = $c;
        }
        foreach ($parPole as &$competences) {
            usort($competences, static fn (array $a, array $b): int => strnatcmp((string) $a['code'], (string) $b['code']));
        }
        unset($competences);
        $base = $id === ReferentielRepository::DEFAULT_REFERENTIEL_ID ? $this->fichesDeLaBase() : null;
        $poles = $doc['poles'];
        usort($poles, static fn (array $a, array $b): int => (int) $a['num'] <=> (int) $b['num']);

        $bloc = [];
        foreach ($poles as $p) {
            $num = (int) $p['num'];
            $competences = [];
            foreach ($parPole[$num] ?? [] as $c) {
                $code = (string) $c['code'];
                $fiche = $base === null ? self::fiche($c) : ($base['fiches'][$code] ?? null);
                $competences[] = ['code' => $code, 'nom' => (string) $c['nom'], 'fiche' => $fiche ?? throw self::sansFiches()];
            }
            $entete = $base === null ? self::entete($p) : (string) ($base['poleHeaders'][(string) $num] ?? '');
            if ($entete === '') {
                throw self::sansFiches();
            }
            $bloc[] = ['num' => $num, 'nom' => (string) $p['nom'], 'entete' => $entete, 'competences' => $competences];
        }

        return ['id' => $id, 'version' => $version, 'label' => (string) $v['label'],
                'motif' => ReferentielRepository::niveaux($doc)[0]['motif'], 'poles' => $bloc];
    }

    /**
     * The fingerprint of a referential the engine reads: of all it changes in
     * a prompt — fiches, preambles, names, motif, label —, decoded as objects
     * or as arrays.
     */
    public static function empreinte(mixed $bloc): string
    {
        return substr(hash('sha256', json_encode(CallSettings::canonique(self::objets($bloc)),
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)), 0, 16);
    }

    /**
     * What the leak filter indexes of a referential the engine reads: each
     * preamble and each fiche (Resultats::index()).
     *
     * @return list<string>
     */
    public static function textes(mixed $bloc): array
    {
        $textes = [];
        foreach (self::objets($bloc)->poles ?? [] as $pole) {
            $textes[] = (string) ($pole->entete ?? '');
            foreach ($pole->competences ?? [] as $c) {
                $textes[] = (string) ($c->fiche ?? '');
            }
        }

        return array_values(array_filter($textes, static fn (string $t): bool => $t !== ''));
    }

    /**
     * The size of what a reader reads of each pole, in bytes: its preamble
     * and its fiches, as the engine joins them (T8: a call's worst case).
     *
     * @return list<int>
     */
    public static function tailles(mixed $bloc): array
    {
        $tailles = [];
        foreach (self::objets($bloc)->poles ?? [] as $pole) {
            $taille = \strlen((string) ($pole->entete ?? '')) + 2;
            foreach ($pole->competences ?? [] as $c) {
                $taille += \strlen((string) ($c->fiche ?? '')) + \strlen("\n\n---\n\n");
            }
            $tailles[] = $taille;
        }

        return $tailles;
    }

    /** A block decoded as objects, as the engine's settings read back give it. */
    private static function objets(mixed $bloc): \stdClass
    {
        $objet = json_decode(json_encode($bloc, JSON_THROW_ON_ERROR), false, 512, JSON_THROW_ON_ERROR);

        return $objet instanceof \stdClass ? $objet : new \stdClass();
    }

    /**
     * RESPIRE's preambles and fiches, as the base keeps them.
     *
     * @return array{poleHeaders: array<string, string>, fiches: array<string, string>}
     */
    private function fichesDeLaBase(): array
    {
        $corpus = (new FicheGenerator($this->pdo))->corpus();

        return $corpus['fiches'] === [] ? throw self::sansFiches() : $corpus;
    }

    private static function sansFiches(): Twin9Exception
    {
        return new Twin9Exception('Les fiches du référentiel RESPIRE ne sont pas dans la base de cette instance : '
            . 'l’analyse approfondie ne peut partir (php scripts/seed-competences.php les y verse)', 503);
    }

    /** @param array<string, mixed> $pole */
    private static function entete(array $pole): string
    {
        $description = trim((string) ($pole['description'] ?? ''));

        return '# Pôle ' . (int) $pole['num'] . ' — ' . trim((string) $pole['nom']) . "\n"
            . ($description === '' ? '' : "\n" . $description . "\n");
    }

    /**
     * A competence's fiche, or an element's at a finer level: its title, its
     * description, then its elements one level down.
     *
     * @param array<string, mixed> $noeud
     */
    private static function fiche(array $noeud, int $niveau = 2): string
    {
        $description = trim((string) ($noeud['description'] ?? ''));
        $fiche = str_repeat('#', min(6, $niveau)) . ' ' . $noeud['code'] . ' — ' . trim((string) $noeud['nom'])
            . ($description === '' ? '' : "\n\n" . $description);
        foreach ($noeud['elements'] ?? [] as $element) {
            $fiche .= "\n\n" . self::fiche($element, $niveau + 1);
        }

        return $fiche;
    }
}
