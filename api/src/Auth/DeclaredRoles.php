<?php

declare(strict_types=1);

namespace Humanome\Auth;

use PDO;

/**
 * Declared RESPIRE roles (sprint 8, migration 035): the identity an account
 * gives itself in #/compte, among the nine of the RESPIRE list, with the
 * « membre du cercle des fondateurs » box for promptagogues, épistémiarques
 * and maîtres du grimoire only.
 *
 * A declaration grants NOTHING (docs/autorisations.md, principle 7). Rights
 * are HABILITATIONS — `user_roles`, granted by an administrator
 * (Admin\UserDirectory) — and every guard, the menu, the electorate and the
 * reading of a shared run read those alone (Users::rolesOf). This class
 * never writes `user_roles`, and `admin` is never declarable. Three
 * declarations have a habilitation of the same name an administrator may
 * grant in one click (HABILITATIONS); the others have none today.
 *
 * Labels and definitions (catalogue()) are those of the cahier des charges
 * §2 and of content/formation where they exist; the others are neutral lines
 * awaiting Christian's review (each entry says which).
 */
final class DeclaredRoles
{
    /**
     * The nine declarable roles, in the order of the RESPIRE list. Slugs are
     * ASCII, matched to the letter (migration 035: ascii_bin).
     */
    public const CATALOGUE = [
        // cahier §2 « Cartographe » ; content/formation/cartographe
        'cartographe' => [
            'label' => 'Cartographe',
            'definition' => 'Relit, commente, corrige, valide et garantit la cartographie produite pour un apprenant.',
        ],
        // cahier §2 « Promptologue » ; content/formation/promptologue
        'promptologue' => [
            'label' => 'Promptologue',
            'definition' => 'Conçoit, teste, versionne et enrichit les prompts qui transforment un portfolio réflexif en cartographie de compétences.',
        ],
        // no definition in the repository (cahier §2: mentioned, postponed; a role of EduChat): neutral, to review
        'promptagogue' => [
            'label' => 'Promptagogue',
            'definition' => 'Accompagne les apprenants dans l’usage pédagogique des assistants d’IA.',
        ],
        // no definition in the repository: neutral, to review
        'eclaireur' => [
            'label' => 'Éclaireur',
            'definition' => 'Repère et partage de nouvelles pistes pour la communauté RESPIRE.',
        ],
        // no definition in the repository: neutral, to review
        'architecte' => [
            'label' => 'Architecte',
            'definition' => 'Conçoit et fait évoluer l’organisation de l’écosystème RESPIRE.',
        ],
        // cahier §2 « Épistémiarque » ; content/formation/epistemiarque
        'epistemiarque' => [
            'label' => 'Épistémiarque',
            'definition' => 'Édite collectivement le référentiel de compétences, en s’appuyant sur les échanges avec la société civile.',
        ],
        // indirect: « médiateurs en formation » of the RESPIRE schools (content/formation/noesiologie, ch. 1): to review
        'mediateur' => [
            'label' => 'Médiateur',
            'definition' => 'Accompagne les apprenants sur le terrain, dans les écoles RESPIRE.',
        ],
        // indirect: content/formation/noesiologie, ch. 1 (the study of the functions of the mind): to review
        'noesiologue' => [
            'label' => 'Noèsiologue',
            'definition' => 'Étudie et pratique la noèsiologie, l’étude des fonctions de l’esprit.',
        ],
        // indirect: the Grimoire of De Humani Cerebri Fabrica (content/formation/noesiologie, ch. 1): to review
        'maitre-du-grimoire' => [
            'label' => 'Maître du grimoire',
            'definition' => 'Fait vivre le Grimoire, le répertoire des fonctions cognitives de la noèsiologie.',
        ],
    ];

    /** The roles with which the founding circle box is offered, and accepted. */
    public const FOUNDING_CIRCLE_ELIGIBLE = ['promptagogue', 'epistemiarque', 'maitre-du-grimoire'];

    public const FOUNDING_CIRCLE_LABEL = 'Membre du cercle des fondateurs';

    /**
     * Declaration => the habilitation of the same name an administrator may
     * grant in one click. The other declarations have none today; none maps
     * to `admin`.
     */
    public const HABILITATIONS = [
        'cartographe' => 'cartographe',
        'promptologue' => 'promptologue',
        'epistemiarque' => 'epistemiarque',
    ];

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * The catalogue as the account page and the administration read it.
     *
     * @return list<array{id: string, label: string, definition: string, habilitation: string|null, foundingCircleEligible: bool}>
     */
    public static function catalogue(): array
    {
        $out = [];
        foreach (self::CATALOGUE as $id => $entry) {
            $out[] = [
                'id' => $id,
                'label' => $entry['label'],
                'definition' => $entry['definition'],
                'habilitation' => self::HABILITATIONS[$id] ?? null,
                'foundingCircleEligible' => \in_array($id, self::FOUNDING_CIRCLE_ELIGIBLE, true),
            ];
        }

        return $out;
    }

    /**
     * Checks a whole declaration, as PUT /api/auth/me/declared-roles receives
     * it: `roles` a list of distinct catalogue slugs (`admin` and the other
     * habilitations refused), `foundingCircle` an optional boolean (false when
     * absent), true only with an eligible role.
     *
     * @return array{declaration: array{roles: list<string>, foundingCircle: bool}|null, fields: array<string, string>}
     */
    public static function validate(mixed $body): array
    {
        if (!\is_array($body) || ($body !== [] && array_is_list($body))) {
            return ['declaration' => null, 'fields' => ['body' => 'Objet JSON attendu : {roles, foundingCircle}']];
        }
        $fields = [];

        $roles = $body['roles'] ?? null;
        $declared = [];
        if (!\is_array($roles) || !array_is_list($roles)) {
            $fields['roles'] = 'Liste de rôles attendue (vide pour aucun)';
        } else {
            foreach ($roles as $role) {
                if (!\is_string($role)) {
                    $fields['roles'] = 'Chaque rôle est un identifiant (chaîne)';
                    break;
                }
                if ($role === 'admin') {
                    $fields['roles'] = 'Le rôle « admin » ne se déclare pas : seul un administrateur l’attribue';
                    break;
                }
                if (!isset(self::CATALOGUE[$role])) {
                    $fields['roles'] = sprintf(
                        'Rôle non déclarable « %s » (rôles RESPIRE : %s)',
                        mb_substr($role, 0, 32),
                        implode(', ', array_keys(self::CATALOGUE)),
                    );
                    break;
                }
                if (isset($declared[$role])) {
                    $fields['roles'] = sprintf('Rôle « %s » en double', $role);
                    break;
                }
                $declared[$role] = true;
            }
        }

        $foundingCircle = \array_key_exists('foundingCircle', $body) ? $body['foundingCircle'] : false;
        if (!\is_bool($foundingCircle)) {
            $fields['foundingCircle'] = 'Case attendue (true ou false)';
        } elseif ($foundingCircle && !isset($fields['roles'])
            && array_intersect(array_keys($declared), self::FOUNDING_CIRCLE_ELIGIBLE) === []) {
            $fields['foundingCircle'] = 'Le cercle des fondateurs est réservé aux promptagogues, épistémiarques '
                . 'et maîtres du grimoire : déclarez l’un de ces rôles';
        }

        if ($fields !== []) {
            return ['declaration' => null, 'fields' => $fields];
        }

        return ['declaration' => [
            'roles' => self::ordered(array_keys($declared)),
            'foundingCircle' => $foundingCircle,
        ], 'fields' => []];
    }

    /**
     * The account's declaration (nothing declared: no role, no box).
     *
     * @return array{roles: list<string>, foundingCircle: bool}
     */
    public function of(int $userId): array
    {
        return $this->ofUsers([$userId])[$userId] ?? ['roles' => [], 'foundingCircle' => false];
    }

    /**
     * Declarations of several accounts at once (the administration's list).
     *
     * @param list<int> $userIds
     * @return array<int, array{roles: list<string>, foundingCircle: bool}>
     */
    public function ofUsers(array $userIds): array
    {
        if ($userIds === []) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, \count($userIds), '?'));

        $declared = [];
        $stmt = $this->pdo->prepare("SELECT user_id, role FROM user_declared_roles WHERE user_id IN ({$placeholders})");
        $stmt->execute($userIds);
        foreach ($stmt->fetchAll() as $row) {
            $declared[(int) $row['user_id']][] = (string) $row['role'];
        }

        $out = [];
        $stmt = $this->pdo->prepare("SELECT id, founding_circle FROM users WHERE id IN ({$placeholders})");
        $stmt->execute($userIds);
        foreach ($stmt->fetchAll() as $row) {
            $id = (int) $row['id'];
            $roles = self::ordered($declared[$id] ?? []);
            $out[$id] = [
                'roles' => $roles,
                // never reported without the role that carries it (checked on write)
                'foundingCircle' => (bool) $row['founding_circle']
                    && array_intersect($roles, self::FOUNDING_CIRCLE_ELIGIBLE) !== [],
            ];
        }

        return $out;
    }

    /**
     * Replaces the account's whole declaration, in one transaction under the
     * lock of its `users` row (two concurrent writes serialize). Checked
     * again here: no path writes a declaration validate() refuses.
     *
     * @param array{roles: list<string>, foundingCircle: bool} $declaration
     * @return bool false when the account no longer exists
     * @throws \InvalidArgumentException a declaration validate() refuses
     */
    public function replace(int $userId, array $declaration): bool
    {
        $checked = self::validate($declaration);
        if ($checked['declaration'] === null) {
            throw new \InvalidArgumentException('Invalid declaration: ' . json_encode($checked['fields'], JSON_UNESCAPED_UNICODE));
        }
        $declaration = $checked['declaration'];

        $this->pdo->beginTransaction();
        try {
            $lock = $this->pdo->prepare('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL FOR UPDATE');
            $lock->execute([$userId]);
            if ($lock->fetchColumn() === false) {
                $this->pdo->rollBack();

                return false;
            }
            $this->pdo->prepare('DELETE FROM user_declared_roles WHERE user_id = ?')->execute([$userId]);
            $insert = $this->pdo->prepare('INSERT INTO user_declared_roles (user_id, role) VALUES (?, ?)');
            foreach ($declaration['roles'] as $role) {
                $insert->execute([$userId, $role]);
            }
            $this->pdo->prepare('UPDATE users SET founding_circle = ? WHERE id = ?')
                ->execute([$declaration['foundingCircle'] ? 1 : 0, $userId]);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }

        return true;
    }

    /**
     * The habilitations an administrator may grant in one click: those its
     * declarations name, that the account does not hold yet.
     *
     * @param list<string> $declared its declared roles
     * @param list<string> $habilitations its roles (`user_roles`)
     * @return list<string>
     */
    public static function grantable(array $declared, array $habilitations): array
    {
        $out = [];
        foreach (self::ordered($declared) as $role) {
            $habilitation = self::HABILITATIONS[$role] ?? null;
            if ($habilitation !== null && !\in_array($habilitation, $habilitations, true)) {
                $out[] = $habilitation;
            }
        }

        return $out;
    }

    /**
     * Known slugs in catalogue order (a slug the catalogue no longer has is
     * left out).
     *
     * @param list<string> $roles
     * @return list<string>
     */
    private static function ordered(array $roles): array
    {
        return array_values(array_intersect(array_keys(self::CATALOGUE), $roles));
    }
}
