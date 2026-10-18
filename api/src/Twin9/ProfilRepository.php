<?php

declare(strict_types=1);

namespace Humanome\Twin9;

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
 * the batch lane. A user's own profiles are rows of twin9_profils, written
 * only once valid.
 *
 * A missing setting takes the default the schema gives it, as the v9.8 reads
 * its config.json with .get(key, default); a setting without default is
 * required. The stored profile is complete: the engine reads it as it is.
 *
 * A profile travels as decoded JSON objects (stdClass) or as JSON text, never
 * as a PHP array, where an empty object ({}) and an empty list ([]) would be
 * one and the same.
 */
final class ProfilRepository
{
    public const KIND = 'twin9-profil';

    public const MAX_NOM = 120;

    /** Errors quoted in the message of a refused profile. */
    private const MAX_ERREURS = 5;

    public function __construct(private readonly PDO $pdo)
    {
    }

    /** The v9.8 profile, a fresh copy at each call. */
    public static function v98(): stdClass
    {
        $path = \dirname(__DIR__, 2) . '/config/twin9-profil-v98.json';

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

        return $profil;
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
