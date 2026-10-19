<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use PDO;

/**
 * Store of the CONFIDENTIAL Twin9 prompt templates (ADR-010), by template set.
 *
 * The v9.8's set lives in the `twin9_protocole` table, keyed by a
 * hierarchical name ('lourd/20-greffier'), as the import writes it; the
 * copies the promptologues make of it (T14, TemplateSets) live in
 * `twin9_jeux_gabarits`, under their set's id. Every overwrite archives the
 * previous content first — `twin9_protocole_versions`, or
 * `twin9_jeux_versions` for a copy — with a per-name counter, so the atelier
 * can roll back. Who may write which set is TemplateSets' business: this
 * class writes the set it is given.
 *
 * Placeholders use the exact Twin9 Python syntax: {$VAR} where VAR matches
 * [A-Z_][A-Z0-9_]* (templates.py). Rendering is NON-STRICT like the Python:
 * unknown placeholders are left verbatim and reported, never an error that
 * could leak template content.
 *
 * list() deliberately returns metadata WITHOUT content: the content is only
 * exposed by get(), which the routes reserve to the atelier.
 */
final class ProtocoleRepository
{
    /** Same extraction regex as Twin9 templates.py: {$VAR}. */
    public const VARIABLE_PATTERN = '/\{\$([A-Z_][A-Z0-9_]*)\}/';

    /** Hierarchical name: segments of [a-z0-9_-], '/'-separated. */
    public const NAME_PATTERN = '#^[a-z0-9][a-z0-9_\-]*(?:/[a-z0-9][a-z0-9_\-]*)*$#i';

    public const MAX_CONTENT_BYTES = 262144; // 256 Ko

    /** The v9.8's set: the templates the import writes, read-only in the atelier (T14). */
    public const V98 = 'v9.8';

    /** Where the set's templates live, and their archived versions. */
    private readonly string $gabarits;

    private readonly string $versions;

    /** The SQL condition that selects the set's rows: the v9.8's tables hold its rows alone. */
    private readonly string $du;

    /** For a copy, its id as the first column of an insert, and its quoted value. */
    private readonly string $colonne;

    private readonly string $valeur;

    /** @param string $jeu the set: the v9.8's, or a copy's id (TemplateSets::ID_PATTERN) */
    public function __construct(private readonly PDO $pdo, string $jeu = self::V98)
    {
        if ($jeu === self::V98) {
            [$this->gabarits, $this->versions, $this->du, $this->colonne, $this->valeur]
                = ['twin9_protocole', 'twin9_protocole_versions', 'TRUE', '', ''];

            return;
        }
        if (preg_match(TemplateSets::ID_PATTERN, $jeu) !== 1) {
            throw new Twin9Exception('Jeu de gabarits introuvable', 404);
        }
        $cle = $pdo->quote($jeu);
        [$this->gabarits, $this->versions, $this->du, $this->colonne, $this->valeur]
            = ['twin9_jeux_gabarits', 'twin9_jeux_versions', 'jeu = ' . $cle, 'jeu, ', $cle . ', '];
    }

    /**
     * Metadata of every template — name, content length, extracted variables,
     * last update — WITHOUT the content itself.
     *
     * @return list<array{name: string, longueur: int, variables: list<string>, updated_at: string}>
     */
    public function list(): array
    {
        $rows = $this->pdo->query(
            "SELECT name, CHAR_LENGTH(content) AS longueur, variables, updated_at
             FROM {$this->gabarits} WHERE {$this->du} ORDER BY name"
        )->fetchAll();

        return array_map(static fn (array $row): array => [
            'name' => (string) $row['name'],
            'longueur' => (int) $row['longueur'],
            'variables' => self::decodeVariables((string) $row['variables']),
            'updated_at' => (string) $row['updated_at'],
        ], $rows);
    }

    /**
     * The set as a run takes it (T9): each template's content by name —
     * server-side only, the run keeps it as its snapshot — and the version of
     * each, its archived versions plus the live one.
     *
     * @return array{gabarits: array<string, string>, versions: array<string, int>}
     */
    public function jeu(): array
    {
        $gabarits = [];
        foreach ($this->pdo->query("SELECT name, content FROM {$this->gabarits} WHERE {$this->du} ORDER BY name")
                     ->fetchAll() as $row) {
            $gabarits[(string) $row['name']] = (string) $row['content'];
        }
        $versions = array_fill_keys(array_keys($gabarits), 1);
        $archives = $this->pdo->query(
            "SELECT name, MAX(version) AS v FROM {$this->versions} WHERE {$this->du} GROUP BY name"
        );
        foreach ($archives->fetchAll() as $row) {
            if (isset($versions[(string) $row['name']])) {
                $versions[(string) $row['name']] = (int) $row['v'] + 1;
            }
        }

        return ['gabarits' => $gabarits, 'versions' => $versions];
    }

    /**
     * One template WITH its content (atelier-only exposure — routes/twin9.php).
     *
     * @return array{name: string, content: string, variables: list<string>, updated_at: string}|null
     */
    public function get(string $name): ?array
    {
        $stmt = $this->pdo->prepare(
            "SELECT name, content, variables, updated_at FROM {$this->gabarits} WHERE {$this->du} AND name = ?"
        );
        $stmt->execute([$name]);
        $row = $stmt->fetch();
        if ($row === false) {
            return null;
        }

        return [
            'name' => (string) $row['name'],
            'content' => (string) $row['content'],
            'variables' => self::decodeVariables((string) $row['variables']),
            'updated_at' => (string) $row['updated_at'],
        ];
    }

    /**
     * Create or overwrite a template of the set. The previous content (if
     * different) is archived among the set's versions first, attributed to
     * its own author. Unchanged content is a no-op (idempotent re-imports do
     * not pollute the history).
     *
     * @return array{name: string, variables: list<string>, status: 'created'|'updated'|'unchanged'}
     */
    public function put(string $name, string $content, ?int $userId): array
    {
        self::assertValidName($name);
        self::assertValidContent($content);
        $variables = self::extractVariables($content);
        $variablesJson = json_encode($variables, JSON_THROW_ON_ERROR);

        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare(
                "SELECT content, variables, updated_by FROM {$this->gabarits} WHERE {$this->du} AND name = ? FOR UPDATE"
            );
            $stmt->execute([$name]);
            $existing = $stmt->fetch();

            if ($existing === false) {
                $this->pdo->prepare(
                    "INSERT INTO {$this->gabarits} ({$this->colonne}name, content, variables, updated_by)
                     VALUES ({$this->valeur}?, ?, ?, ?)"
                )->execute([$name, $content, $variablesJson, $userId]);
                $status = 'created';
            } elseif ((string) $existing['content'] === $content) {
                $status = 'unchanged';
            } else {
                $this->archiveVersion(
                    $name,
                    (string) $existing['content'],
                    (string) $existing['variables'],
                    $existing['updated_by'] === null ? null : (int) $existing['updated_by'],
                );
                $this->pdo->prepare(
                    "UPDATE {$this->gabarits} SET content = ?, variables = ?, updated_by = ? WHERE {$this->du} AND name = ?"
                )->execute([$content, $variablesJson, $userId, $name]);
                $status = 'updated';
            }
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return ['name' => $name, 'variables' => $variables, 'status' => $status];
    }

    /**
     * Edit history of a template, most recent first — metadata only.
     *
     * @return list<array{version: int, longueur: int, variables: list<string>, created_at: string}>
     */
    public function versions(string $name): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT version, CHAR_LENGTH(content) AS longueur, variables, created_at
             FROM {$this->versions} WHERE {$this->du} AND name = ? ORDER BY version DESC"
        );
        $stmt->execute([$name]);

        return array_map(static fn (array $row): array => [
            'version' => (int) $row['version'],
            'longueur' => (int) $row['longueur'],
            'variables' => self::decodeVariables((string) $row['variables']),
            'created_at' => (string) $row['created_at'],
        ], $stmt->fetchAll());
    }

    /**
     * One ARCHIVED version WITH its content (atelier-only exposure, D13 —
     * same confidentiality as get(): the routes guard it admin ∧ promptologue).
     *
     * @return array{name: string, version: int, content: string, variables: list<string>, created_at: string}|null
     */
    public function version(string $name, int $version): ?array
    {
        $stmt = $this->pdo->prepare(
            "SELECT name, version, content, variables, created_at
             FROM {$this->versions} WHERE {$this->du} AND name = ? AND version = ?"
        );
        $stmt->execute([$name, $version]);
        $row = $stmt->fetch();
        if ($row === false) {
            return null;
        }

        return [
            'name' => (string) $row['name'],
            'version' => (int) $row['version'],
            'content' => (string) $row['content'],
            'variables' => self::decodeVariables((string) $row['variables']),
            'created_at' => (string) $row['created_at'],
        ];
    }

    /**
     * Restores an archived version as the LIVE template (D13, ADR-010 §6
     * « retour arrière »). NEVER rewrites history: a restore is just a new
     * edit whose content comes from the archive — put() archives the current
     * live content first, so the pre-restore state stays recoverable too.
     * Restoring content identical to the live template is a no-op.
     *
     * @return array{name: string, variables: list<string>, status: 'created'|'updated'|'unchanged', restored_from: int}
     */
    public function restore(string $name, int $version, ?int $userId): array
    {
        if ($this->get($name) === null) {
            throw new Twin9Exception('Gabarit introuvable', 404);
        }
        $archived = $this->version($name, $version);
        if ($archived === null) {
            throw new Twin9Exception('Version introuvable', 404);
        }

        return $this->put($name, $archived['content'], $userId) + ['restored_from' => $version];
    }

    /**
     * Render a template: every {$VAR} present in $vars is substituted, the
     * absent ones are LEFT VERBATIM (non-strict, like Twin9 templates.py)
     * and reported in 'non_resolues'. Single-pass substitution (strtr):
     * placeholder-looking text inside a VALUE is never re-substituted.
     *
     * @param array<string, mixed> $vars
     * @return array{rendu: string, non_resolues: list<string>}
     */
    public function render(string $name, array $vars): array
    {
        $template = $this->get($name);
        if ($template === null) {
            throw new Twin9Exception('Gabarit introuvable', 404);
        }

        $replacements = [];
        foreach ($vars as $var => $value) {
            if (!\is_string($var) || preg_match('/^[A-Z_][A-Z0-9_]*$/', $var) !== 1) {
                continue; // silently ignore non-placeholder keys, non-strict
            }
            $replacements['{$' . $var . '}'] = self::stringify($value);
        }
        $rendu = strtr($template['content'], $replacements);

        preg_match_all(self::VARIABLE_PATTERN, $rendu, $matches);
        $nonResolues = array_values(array_unique($matches[1]));

        return ['rendu' => $rendu, 'non_resolues' => $nonResolues];
    }

    /**
     * The {$VAR} placeholders of a template, in order of first appearance.
     *
     * @return list<string>
     */
    public static function extractVariables(string $content): array
    {
        preg_match_all(self::VARIABLE_PATTERN, $content, $matches);

        return array_values(array_unique($matches[1]));
    }

    public static function assertValidName(string $name): void
    {
        if ($name === '' || \strlen($name) > 190 || preg_match(self::NAME_PATTERN, $name) !== 1) {
            throw new Twin9Exception('Nom de gabarit invalide', 422);
        }
    }

    public static function assertValidContent(string $content): void
    {
        if (trim($content) === '') {
            throw new Twin9Exception('Contenu de gabarit requis', 422);
        }
        if (\strlen($content) >= self::MAX_CONTENT_BYTES) {
            throw new Twin9Exception('Gabarit trop volumineux (maximum 256 Ko)', 422);
        }
    }

    private function archiveVersion(string $name, string $content, string $variablesJson, ?int $authorId): void
    {
        $this->pdo->prepare(
            "INSERT INTO {$this->versions} ({$this->colonne}name, version, content, variables, created_by)
             SELECT {$this->valeur}?, COALESCE(MAX(version), 0) + 1, ?, ?, ?
             FROM {$this->versions} WHERE {$this->du} AND name = ?"
        )->execute([$name, $content, $variablesJson, $authorId, $name]);
    }

    /** @return list<string> */
    private static function decodeVariables(string $json): array
    {
        $decoded = json_decode($json, true);

        return \is_array($decoded) ? array_values(array_map('strval', $decoded)) : [];
    }

    private static function stringify(mixed $value): string
    {
        if (\is_string($value)) {
            return $value;
        }
        if (\is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        if (\is_int($value) || \is_float($value)) {
            return (string) $value;
        }
        if ($value === null) {
            return '';
        }

        return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '';
    }
}
