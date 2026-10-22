<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Twin9\Fournisseurs\Fournisseurs;
use Humanome\Validation;
use JsonException;
use PDO;
use PDOException;
use stdClass;

/**
 * Twin9 run profiles (Twin_v9's docs/plan-twin9-php.md, lot 4a): a profile
 * describes a run from end to end, as schemas/twin9-profil.schema.json
 * defines it (correspondence with the v9.8: docs/contrats.md §7).
 *
 * The v9.8 profile is the read-only default (api/config/twin9-profil-v98.json):
 * Haiku for the readers and the fast analysis, Sonnet for the deep analysis,
 * the batch lane, the stigmergy off. A preset, read-only too, is a starting
 * point a new profile copies (PREDEFINIS): the stigmergy's trial, the v9.8
 * profile with the stigmergy on, the archived layers out of the consensus
 * and every day read again (api/config/twin9-profil-stigmergie.json, Twin_v9's
 * docs/twin9/spec-stigmergie.md §11.3). A user's own profiles are rows of
 * twin9_profils, written only once valid.
 *
 * A missing setting takes the default the schema gives it, as the v9.8 reads
 * its config.json with .get(key, default); a setting without default is
 * required. The stored profile is complete: the engine reads it as it is.
 *
 * A profile travels as decoded JSON objects (stdClass) or as JSON text, never
 * as a PHP array, where an empty object ({}) and an empty list ([]) would be
 * one and the same. A setting the schema types as a number keeps a float's
 * form (1.0, not 1), as Python reads the v9.8's config.json, whatever form
 * the page sent it in (T13); one it types as an integer is an integer (5, not
 * 5.0, which the schema admits as an integer): the stigmergy's settings refuse
 * a float where they want an integer (Stigmergie::reglages()).
 *
 * Beyond the schema, the API's own rules: thinking cut refuses the efforts
 * xhigh and max, for any step the settings resolve to (T13); and the
 * providers' (ADR-012): an object that names a provider other than the one
 * it inherits names its model too — the second instance, whatever provider
 * it names —, each call's model follows its provider's pattern, and a call
 * that leaves Anthropic carries no effort, not even its stage's.
 */
final class ProfilRepository
{
    public const KIND = 'twin9-profil';

    public const MAX_NOM = 120;

    /**
     * The presets, by id, and their names: each the profile of
     * api/config/twin9-profil-<id>.json, read-only, which a new profile copies.
     */
    public const PREDEFINIS = ['stigmergie' => 'Stigmergie (essai)'];

    /** Errors quoted in the message of a refused profile. */
    private const MAX_ERREURS = 5;

    /** The efforts the API refuses with thinking cut. */
    private const EFFORTS_REFLECHIS = ['xhigh', 'max'];

    /** What a refused model id should look like, by provider (the registry's patterns, said); the others': */
    private const MOTIFS_LISIBLES = [
        'anthropic' => '« claude-… »',
        'google' => 'ni « / » ni « : »',
        'openrouter' => '« éditeur/modèle », sans suffixe « : »',
    ];
    private const MOTIF_LISIBLE = '« claude-… » est réservé à Anthropic';

    public function __construct(private readonly PDO $pdo)
    {
    }

    /** The v9.8 profile, a fresh copy at each call. */
    public static function v98(): stdClass
    {
        $path = \dirname(__DIR__, 2) . '/config/twin9-profil-v98.json';

        return json_decode((string) file_get_contents($path), false, 512, JSON_THROW_ON_ERROR);
    }

    /** A preset (PREDEFINIS), a fresh copy at each call; InvalidArgumentException for an unknown one. */
    public static function predefini(string $id): stdClass
    {
        if (!isset(self::PREDEFINIS[$id])) {
            throw new \InvalidArgumentException('Profil prédéfini inconnu : ' . $id);
        }
        $path = \dirname(__DIR__, 2) . '/config/twin9-profil-' . $id . '.json';

        return json_decode((string) file_get_contents($path), false, 512, JSON_THROW_ON_ERROR);
    }

    /**
     * Decodes, completes with the schema's defaults and validates a profile;
     * Twin9Exception 422 naming the first errors when it is refused. The
     * profile given is left untouched.
     */
    public static function validate(string|stdClass $profil): stdClass
    {
        if (\is_string($profil)) {
            try {
                $profil = json_decode($profil, false, 512, JSON_THROW_ON_ERROR);
            } catch (JsonException) {
                throw new Twin9Exception('Profil illisible : JSON invalide', 422);
            }
            if (!$profil instanceof stdClass) {
                throw new Twin9Exception('Profil invalide : objet JSON attendu', 422);
            }
        }
        $profil = self::copy($profil);
        $schema = json_decode(
            (string) file_get_contents(Validation::schemaPath(self::KIND)), false, 512, JSON_THROW_ON_ERROR,
        );
        self::complete($profil, $schema, $schema);
        $profil = self::nombres($profil, $schema, $schema);

        $result = Validation::validate(self::KIND, $profil);
        if (!$result['valid']) {
            $erreurs = [];
            foreach ($result['errors'] as $pointer => $messages) {
                $erreurs[] = ($pointer === '' ? '/' : $pointer) . ' : ' . implode(', ', $messages);
            }
            throw new Twin9Exception(
                'Profil invalide — ' . implode(' ; ', \array_slice($erreurs, 0, self::MAX_ERREURS)),
                422,
            );
        }

        $noms = [];
        foreach ($profil->college as $lecteur) {
            if (isset($noms[$lecteur->nom])) {
                throw new Twin9Exception(
                    'Profil invalide — /college : deux lecteurs portent le nom « ' . $lecteur->nom . ' »',
                    422,
                );
            }
            $noms[$lecteur->nom] = true;
        }

        self::fournisseurs($profil);
        foreach ((new CallSettings($profil))->parEtape() as $etape => $reglage) {
            if ($reglage['reflexion'] === 'coupee' && \in_array($reglage['effort'], self::EFFORTS_REFLECHIS, true)) {
                throw new Twin9Exception('Profil invalide — ' . $etape . ' : l\'effort « ' . $reglage['effort']
                    . ' » demande la réflexion adaptative, que l\'API exige à cet effort', 422);
            }
        }

        return $profil;
    }

    /**
     * The providers' rules (ADR-012), on a profile the schema admits: what
     * each object names, then what each call resolves to (CallSettings).
     *
     * @throws Twin9Exception 422 naming the step
     */
    private static function fournisseurs(stdClass $profil): void
    {
        $herite = static fn (string $etage): string
            => (string) ($profil->etages->{$etage}->fournisseur ?? Fournisseurs::DEFAUT);
        $objets = [];
        foreach ((array) $profil->etapes as $etape => $reglage) {
            // the second instance spans both stages: whatever provider it names, it names the model
            $objets[(string) $etape] = $etape === 'second_ressort'
                ? [$reglage, null, 'un fournisseur nommé au second ressort']
                : [$reglage, $herite(CallSettings::ETAGES[$etape]), 'un autre fournisseur que celui de son étage'];
        }
        foreach ($profil->college as $lecteur) {
            $objets['lecteur ' . $lecteur->nom] = [$lecteur, $herite('lecteurs'),
                                                   'un autre fournisseur que celui de l’étage des lecteurs'];
        }
        foreach ($objets as $nom => [$reglage, $fournisseur, $quoi]) {
            if (isset($reglage->fournisseur) && $reglage->fournisseur !== $fournisseur && !isset($reglage->modele)) {
                throw new Twin9Exception('Profil invalide — ' . $nom . ' : ' . $quoi . ' ('
                    . self::libelle((string) $reglage->fournisseur) . ') demande son modèle, dans le même réglage', 422);
            }
        }

        foreach ((new CallSettings($profil))->parEtape() as $etape => $reglage) {
            $fournisseur = $reglage['fournisseur'];
            if (preg_match(Fournisseurs::REGISTRE[$fournisseur]['motif_modele'], $reglage['modele']) !== 1) {
                throw new Twin9Exception('Profil invalide — ' . $etape . ' : « ' . $reglage['modele'] . ' » n’est pas '
                    . 'un identifiant de modèle chez ' . self::libelle($fournisseur) . ' ('
                    . (self::MOTIFS_LISIBLES[$fournisseur] ?? self::MOTIF_LISIBLE) . ')', 422);
            }
            if ($fournisseur !== Fournisseurs::DEFAUT && $reglage['effort'] !== null) {
                throw new Twin9Exception('Profil invalide — ' . $etape . ' : l’effort est propre à Anthropic ; un appel '
                    . 'chez ' . self::libelle($fournisseur) . ' n’en a aucun, pas même celui de son étage', 422);
            }
        }
    }

    private static function libelle(string $fournisseur): string
    {
        return (string) (Fournisseurs::REGISTRE[$fournisseur]['libelle'] ?? $fournisseur);
    }

    /** Stores a valid profile for its owner; the new profile's id. */
    public function create(int $userId, string $nom, string|stdClass $profil): int
    {
        $doc = self::validate($profil);
        $stmt = $this->pdo->prepare('INSERT INTO twin9_profils (user_id, nom, profil) VALUES (?, ?, ?)');
        try {
            $stmt->execute([$userId, self::nom($nom), self::encode($doc)]);
        } catch (PDOException $e) {
            throw self::conflit($e);
        }

        return (int) $this->pdo->lastInsertId();
    }

    /**
     * One profile, the document decoded into objects.
     *
     * @return array{id: int, user_id: int, nom: string, profil: stdClass, created_at: string, updated_at: string}|null
     */
    public function get(int $id): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT id, user_id, nom, profil, created_at, updated_at FROM twin9_profils WHERE id = ?'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row === false) {
            return null;
        }

        return [
            'id' => (int) $row['id'],
            'user_id' => (int) $row['user_id'],
            'nom' => (string) $row['nom'],
            'profil' => json_decode((string) $row['profil'], false, 512, JSON_THROW_ON_ERROR),
            'created_at' => (string) $row['created_at'],
            'updated_at' => (string) $row['updated_at'],
        ];
    }

    /**
     * Replaces a profile of its owner, and its name if given; 404 when the
     * profile is not this user's.
     */
    public function update(int $id, int $userId, string|stdClass $profil, ?string $nom = null): void
    {
        $doc = self::validate($profil);
        $this->owned($id, $userId);
        $stmt = $this->pdo->prepare(
            'UPDATE twin9_profils SET profil = ?, nom = COALESCE(?, nom) WHERE id = ? AND user_id = ?'
        );
        try {
            $stmt->execute([self::encode($doc), $nom === null ? null : self::nom($nom), $id, $userId]);
        } catch (PDOException $e) {
            throw self::conflit($e);
        }
    }

    /** Deletes a profile of its owner; false when there was none. */
    public function delete(int $id, int $userId): bool
    {
        $stmt = $this->pdo->prepare('DELETE FROM twin9_profils WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $userId]);

        return $stmt->rowCount() === 1;
    }

    /**
     * A user's profiles, without their documents, by name.
     *
     * @return list<array{id: int, nom: string, updated_at: string}>
     */
    public function listForUser(int $userId): array
    {
        $stmt = $this->pdo->prepare('SELECT id, nom, updated_at FROM twin9_profils WHERE user_id = ? ORDER BY nom, id');
        $stmt->execute([$userId]);

        return array_map(static fn (array $row): array => [
            'id' => (int) $row['id'],
            'nom' => (string) $row['nom'],
            'updated_at' => (string) $row['updated_at'],
        ], $stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    /**
     * A user's profiles' documents, by id, decoded into objects: what the
     * configuration's route reads the providers of each from (ADR-012).
     *
     * @return array<int, stdClass>
     */
    public function documentsDe(int $userId): array
    {
        $stmt = $this->pdo->prepare('SELECT id, profil FROM twin9_profils WHERE user_id = ?');
        $stmt->execute([$userId]);
        $documents = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $documents[(int) $row['id']] = json_decode((string) $row['profil'], false, 512, JSON_THROW_ON_ERROR);
        }

        return $documents;
    }

    /** Gives each missing setting that has a default in the schema its default. */
    private static function complete(stdClass $doc, stdClass $node, stdClass $schema): void
    {
        $node = self::resolve($node, $schema);
        foreach ((array) ($node->properties ?? []) as $key => $child) {
            $child = self::resolve($child, $schema);
            if (!property_exists($doc, $key)) {
                if (property_exists($child, 'default')) {
                    $doc->{$key} = self::copy($child->default);
                }
            } elseif ($doc->{$key} instanceof stdClass) {
                self::complete($doc->{$key}, $child, $schema);
            } elseif (\is_array($doc->{$key}) && isset($child->items)) {
                foreach ($doc->{$key} as $item) {
                    if ($item instanceof stdClass) {
                        self::complete($item, $child->items, $schema);
                    }
                }
            }
        }
    }

    /**
     * Each integer where the schema wants a number becomes a float: the v9.8
     * reads 1.0, not 1. Each float without a fraction where it wants an
     * integer only becomes an integer: 5.0 is one for the schema, not for
     * the engine.
     */
    private static function nombres(mixed $valeur, stdClass $node, stdClass $schema): mixed
    {
        $node = self::resolve($node, $schema);
        $types = (array) ($node->type ?? []);
        if (\is_int($valeur) && \in_array('number', $types, true)) {
            return (float) $valeur;
        }
        if (\is_float($valeur) && \in_array('integer', $types, true) && !\in_array('number', $types, true)
            && floor($valeur) === $valeur && abs($valeur) <= 2 ** 53) {
            return (int) $valeur;
        }
        if ($valeur instanceof stdClass) {
            foreach ((array) ($node->properties ?? []) as $cle => $enfant) {
                if (property_exists($valeur, $cle)) {
                    $valeur->{$cle} = self::nombres($valeur->{$cle}, $enfant, $schema);
                }
            }
        } elseif (\is_array($valeur) && isset($node->items)) {
            foreach ($valeur as $i => $item) {
                $valeur[$i] = self::nombres($item, $node->items, $schema);
            }
        }

        return $valeur;
    }

    /** A node of the schema with its local $ref (#/$defs/…) merged in. */
    private static function resolve(stdClass $node, stdClass $schema): stdClass
    {
        if (!isset($node->{'$ref'})) {
            return $node;
        }
        $name = substr((string) strrchr((string) $node->{'$ref'}, '/'), 1);

        return (object) array_merge((array) $schema->{'$defs'}->{$name}, (array) $node);
    }

    private static function copy(mixed $value): mixed
    {
        return json_decode(json_encode($value, JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR), false);
    }

    private function owned(int $id, int $userId): void
    {
        $stmt = $this->pdo->prepare('SELECT 1 FROM twin9_profils WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $userId]);
        if ($stmt->fetchColumn() === false) {
            throw new Twin9Exception('Profil introuvable', 404);
        }
    }

    private static function nom(string $nom): string
    {
        $nom = trim($nom);
        if ($nom === '' || mb_strlen($nom) > self::MAX_NOM) {
            throw new Twin9Exception('Nom de profil invalide : 1 à ' . self::MAX_NOM . ' caractères', 422);
        }

        return $nom;
    }

    private static function encode(stdClass $doc): string
    {
        return json_encode(
            $doc,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR,
        );
    }

    private static function conflit(PDOException $e): Twin9Exception|PDOException
    {
        // 23000 + MySQL 1062: the (user, name) pair already exists
        if ($e->getCode() === '23000' && str_contains($e->getMessage(), '1062')) {
            return new Twin9Exception('Un profil porte déjà ce nom', 409);
        }

        return $e;
    }
}
