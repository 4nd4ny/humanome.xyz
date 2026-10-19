<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Auth\Users;
use Humanome\Packages\SettingsRepository;
use PDO;
use PDOException;

/**
 * The promptologues' template sets (T14, Twin_v9's docs/plan-twin9-php.md,
 * lot 4b; ADR-010 §6). The v9.8's set is the one the import writes: the
 * atelier reads it and never writes it. A promptologue of the atelier copies
 * it, and edits their copy with the versions and the rollback the atelier
 * already has (ProtocoleRepository); they alone write it. A copy has the
 * v9.8's templates and no other, and a template there takes only the
 * variables its step is given: those the contract names for it
 * (schemas/twin9-protocole-contrat.json), and those its v9.8 original uses.
 *
 * A profile chooses its set (`gabarits`): the v9.8's, the instance's default,
 * which the administrator fixes, or a copy of its owner's while they belong to
 * the atelier. The atelier is AD-D2's conjunction, admin ∧ promptologue
 * (ATELIER), until the question « Qui voit les gabarits ? » is settled.
 */
final class TemplateSets
{
    public const V98 = ProtocoleRepository::V98;

    /** A copy's id, its name: lowercase letters, digits, « . », « _ » and « - », 64 at most. */
    public const ID_PATTERN = '/^[a-z0-9][a-z0-9._-]{0,63}$/D';

    /** The roles of the atelier, who see the templates and copy them (AD-D2: both). */
    public const ATELIER = ['admin', 'promptologue'];

    /** The setting that keeps the instance's default set. */
    public const DEFAUT_KEY = 'twin9_gabarits_defaut';

    /** The variables the engine gives each template, in schemas/. */
    public const CONTRAT = 'twin9-protocole-contrat.json';

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * The sets of the instance, the v9.8's first, then the copies by id: each
     * with its author (null for the v9.8's, or an author whose account is
     * gone), its templates, and whether it is the default. No content.
     *
     * @return list<array{id: string, auteur_id: int|null, auteur: string|null, gabarits: int,
     *                    created_at: string|null, defaut: bool}>
     */
    public function lister(): array
    {
        $defaut = $this->defaut();
        $jeux = [[
            'id' => self::V98, 'auteur_id' => null, 'auteur' => null,
            'gabarits' => (int) $this->pdo->query('SELECT COUNT(*) FROM twin9_protocole')->fetchColumn(),
            'created_at' => null, 'defaut' => $defaut === self::V98,
        ]];
        $copies = $this->pdo->query(
            'SELECT j.id, j.user_id, u.display_name, j.created_at,
                    (SELECT COUNT(*) FROM twin9_jeux_gabarits g WHERE g.jeu = j.id) AS gabarits
             FROM twin9_jeux j LEFT JOIN users u ON u.id = j.user_id ORDER BY j.id'
        )->fetchAll();
        foreach ($copies as $copie) {
            $jeux[] = [
                'id' => (string) $copie['id'],
                'auteur_id' => $copie['user_id'] === null ? null : (int) $copie['user_id'],
                'auteur' => $copie['display_name'] === null ? null : (string) $copie['display_name'],
                'gabarits' => (int) $copie['gabarits'],
                'created_at' => (string) $copie['created_at'],
                'defaut' => $defaut === (string) $copie['id'],
            ];
        }

        return $jeux;
    }

    public function existe(string $id): bool
    {
        return $id === self::V98 || $this->auteur($id) !== false;
    }

    /**
     * Copies the v9.8's set under a new id, its author's: each template as it
     * is now, without its history.
     *
     * @return array{id: string, gabarits: int}
     * @throws Twin9Exception 422 for an invalid id; 409 for an id taken, or nothing to copy
     */
    public function copier(string $id, int $userId): array
    {
        if (preg_match(self::ID_PATTERN, $id) !== 1) {
            throw new Twin9Exception('Nom de copie invalide : minuscules, chiffres, « . », « _ » ou « - », '
                . '64 caractères au plus', 422);
        }
        if ($id === self::V98) {
            throw new Twin9Exception('Ce nom est déjà pris', 409);
        }
        $this->pdo->beginTransaction();
        try {
            $this->pdo->prepare('INSERT INTO twin9_jeux (id, user_id) VALUES (?, ?)')->execute([$id, $userId]);
            $copie = $this->pdo->prepare(
                'INSERT INTO twin9_jeux_gabarits (jeu, name, content, variables, updated_by)
                 SELECT ?, name, content, variables, ? FROM twin9_protocole'
            );
            $copie->execute([$id, $userId]);
            $gabarits = $copie->rowCount();
            if ($gabarits === 0) {
                throw new Twin9Exception('Aucun gabarit v9.8 à copier : ils n’ont pas encore été importés', 409);
            }
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            // 23000 + MySQL 1062: the id is taken
            if ($e instanceof PDOException && $e->getCode() === '23000' && str_contains($e->getMessage(), '1062')) {
                throw new Twin9Exception('Ce nom est déjà pris', 409);
            }
            throw $e;
        }

        return ['id' => $id, 'gabarits' => $gabarits];
    }

    /** The instance's default set: the one the administrator fixed, the v9.8's otherwise. */
    public function defaut(): string
    {
        $id = (new SettingsRepository($this->pdo))->get(self::DEFAUT_KEY)['jeu'] ?? self::V98;

        return \is_string($id) && $this->existe($id) ? $id : self::V98;
    }

    /** @throws Twin9Exception 404 for a set the instance does not have */
    public function fixerDefaut(string $id): void
    {
        if (!$this->existe($id)) {
            throw new Twin9Exception('Jeu de gabarits introuvable', 404);
        }
        (new SettingsRepository($this->pdo))->set(self::DEFAUT_KEY, ['jeu' => $id]);
    }

    /**
     * The sets a user may choose in their profiles: the v9.8's, the default,
     * and their own copies while they belong to the atelier.
     *
     * @return list<string>
     */
    public function pour(int $userId): array
    {
        $jeux = array_values(array_unique([self::V98, $this->defaut()]));
        if (array_diff(self::ATELIER, Users::rolesOf($this->pdo, $userId)) === []) {
            $stmt = $this->pdo->prepare('SELECT id FROM twin9_jeux WHERE user_id = ? ORDER BY id');
            $stmt->execute([$userId]);
            foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $id) {
                if (!\in_array((string) $id, $jeux, true)) {
                    $jeux[] = (string) $id;
                }
            }
        }

        return $jeux;
    }

    /**
     * A set to read from the atelier.
     *
     * @throws Twin9Exception 404 for a set the instance does not have
     */
    public function lire(string $jeu): ProtocoleRepository
    {
        if (!$this->existe($jeu)) {
            throw new Twin9Exception('Jeu de gabarits introuvable', 404);
        }

        return new ProtocoleRepository($this->pdo, $jeu);
    }

    /**
     * Writes a template of a copy from the atelier: by its author, a template
     * the copy has, its content valid, its variables among those its step is
     * given (variablesRefusees). The previous content is archived.
     *
     * @return array{name: string, variables: list<string>, status: 'created'|'updated'|'unchanged'}
     * @throws Twin9Exception 403 the v9.8's set or another's copy; 404 an unknown set or template; 422 the content
     */
    public function ecrire(string $jeu, string $name, string $content, int $userId): array
    {
        $gabarits = $this->modifiable($jeu, $userId);
        if ($gabarits->get($name) === null) {
            throw new Twin9Exception('Gabarit introuvable', 404);
        }
        ProtocoleRepository::assertValidContent($content);
        $refusees = $this->variablesRefusees($name, $content);
        if ($refusees !== []) {
            $liste = implode(', ', array_map(static fn (string $v): string => '{$' . $v . '}', $refusees));
            throw new Twin9Exception((\count($refusees) > 1 ? 'Variables qu’aucune étape ne fournit'
                : 'Variable qu’aucune étape ne fournit') . ' à ce gabarit : ' . $liste, 422);
        }

        return $gabarits->put($name, $content, $userId);
    }

    /**
     * Restores an archived version of a template of a copy, by its author: a
     * content the copy has had (ProtocoleRepository::restore).
     *
     * @return array{name: string, variables: list<string>, status: 'created'|'updated'|'unchanged', restored_from: int}
     * @throws Twin9Exception as ecrire() does
     */
    public function restaurer(string $jeu, string $name, int $version, int $userId): array
    {
        return $this->modifiable($jeu, $userId)->restore($name, $version, $userId);
    }

    /**
     * The variables of a template's content that its step is not given: its
     * step is given those the contract names for the template, and those its
     * v9.8 original uses, which the v9.8's runs render. A template neither
     * names — the fiches tagger/P1 to P7 — is given none.
     *
     * @return list<string>
     */
    public function variablesRefusees(string $name, string $content): array
    {
        $original = (new ProtocoleRepository($this->pdo))->get($name);
        $fournies = [...self::contrat()[$name] ?? [], ...$original['variables'] ?? []];

        return array_values(array_diff(ProtocoleRepository::extractVariables($content), $fournies));
    }

    /**
     * The contract: the variables the engine gives each template, by name.
     *
     * @return array<string, list<string>>
     */
    public static function contrat(): array
    {
        static $contrat = null;
        if ($contrat === null) {
            // the repository's schemas/, or a release's (ADR-008, scripts/deploy/stage-api.sh)
            foreach ([\dirname(__DIR__, 3), \dirname(__DIR__, 2)] as $racine) {
                if (is_file($racine . '/schemas/' . self::CONTRAT)) {
                    $doc = json_decode((string) file_get_contents($racine . '/schemas/' . self::CONTRAT), true, 8,
                        JSON_THROW_ON_ERROR);
                    $contrat = array_map(static fn (array $v): array => array_map('strval', $v), $doc['gabarits']);
                    break;
                }
            }
        }

        return $contrat ?? throw new Twin9Exception('Le contrat des variables des gabarits manque à cette instance', 503);
    }

    /**
     * The author of a copy, or null when their account is gone; false: no such copy.
     */
    private function auteur(string $id): int|null|false
    {
        if (preg_match(self::ID_PATTERN, $id) !== 1) {
            return false;
        }
        $stmt = $this->pdo->prepare('SELECT user_id FROM twin9_jeux WHERE id = ?');
        $stmt->execute([$id]);
        $copie = $stmt->fetch();
        if ($copie === false) {
            return false;
        }

        return $copie['user_id'] === null ? null : (int) $copie['user_id'];
    }

    /**
     * A set its user may write: a copy of theirs.
     *
     * @throws Twin9Exception 403 the v9.8's set or another's copy; 404 an unknown set
     */
    private function modifiable(string $jeu, int $userId): ProtocoleRepository
    {
        if ($jeu === self::V98) {
            throw new Twin9Exception('Le jeu v9.8 est en lecture seule : copiez-le pour le modifier', 403);
        }
        $auteur = $this->auteur($jeu);
        if ($auteur === false) {
            throw new Twin9Exception('Jeu de gabarits introuvable', 404);
        }
        if ($auteur !== $userId) {
            throw new Twin9Exception('Seul l’auteur d’une copie la modifie', 403);
        }

        return new ProtocoleRepository($this->pdo, $jeu);
    }
}
