<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Auth\DeclaredRoles;
use Humanome\Auth\Users;
use Humanome\MigrationRunner;
use Humanome\Referentiel\Electorate;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\AdmSupport;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-CPT-07 — Déclarer ses rôles RESPIRE : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/compte/UC-CPT-07-declarer-roles-respire.md
 *
 * Auth\DeclaredRoles appelée directement, sans couche HTTP : le catalogue
 * (neuf rôles, cercle des fondateurs, habilitations correspondantes), la
 * validation d'une déclaration, son remplacement transactionnel, la lecture
 * groupée de l'administration, les habilitations qu'elle appelle — et la
 * propriété du sprint 8 au niveau des briques : une déclaration ne touche ni
 * user_roles, ni Users::rolesOf, ni l'électorat.
 */
final class UcCpt07DeclarerRolesTest extends TestCase
{
    private const NEUF = ['cartographe', 'promptologue', 'promptagogue', 'eclaireur', 'architecte', 'epistemiarque',
                          'mediateur', 'noesiologue', 'maitre-du-grimoire'];

    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    public static function tearDownAfterClass(): void
    {
        TestDb::restoreEnv();
    }

    protected function setUp(): void
    {
        TestDb::overrideEnv();
        self::$pdo->exec('DELETE FROM users');
    }

    private static function declared(): DeclaredRoles
    {
        return new DeclaredRoles(self::$pdo);
    }

    private static function rows(string $sql): int
    {
        return (int) self::$pdo->query($sql)->fetchColumn();
    }

    /** @return array<string, string> the fields validate() refuses */
    private static function refused(mixed $body): array
    {
        $checked = DeclaredRoles::validate($body);
        self::assertNull($checked['declaration'], json_encode($body, JSON_INVALID_UTF8_SUBSTITUTE));
        self::assertNotSame([], $checked['fields']);

        return $checked['fields'];
    }

    #[TestDox('UC-CPT-07-U01 — catalogue : les neuf rôles de la liste RESPIRE dans son ordre, slugs ASCII, libellé et définition d’une ligne, jamais « admin »')]
    public function testU01TheCatalogueIsTheNineRolesOfTheList(): void
    {
        self::assertSame(self::NEUF, array_keys(DeclaredRoles::CATALOGUE));
        $catalogue = DeclaredRoles::catalogue();
        self::assertSame(self::NEUF, array_column($catalogue, 'id'));
        foreach ($catalogue as $entry) {
            self::assertSame(['id', 'label', 'definition', 'habilitation', 'foundingCircleEligible'], array_keys($entry));
            self::assertMatchesRegularExpression('/^[a-z]+(-[a-z]+)*$/', $entry['id']);
            self::assertLessThanOrEqual(32, \strlen($entry['id']), 'VARCHAR(32) de la migration 035');
            self::assertNotSame('', $entry['label']);
            self::assertStringNotContainsString("\n", $entry['definition']);
            self::assertLessThanOrEqual(140, mb_strlen($entry['definition']), 'une ligne');
        }
        self::assertSame(['Cartographe', 'Promptologue', 'Promptagogue', 'Éclaireur', 'Architecte', 'Épistémiarque',
                          'Médiateur', 'Noèsiologue', 'Maître du grimoire'], array_column($catalogue, 'label'));
        self::assertArrayNotHasKey('admin', DeclaredRoles::CATALOGUE);
        self::assertSame('Membre du cercle des fondateurs', DeclaredRoles::FOUNDING_CIRCLE_LABEL);
    }

    #[TestDox('UC-CPT-07-U02 — cercle des fondateurs : promptagogue, épistémiarque et maître du grimoire seuls ; habilitations : cartographe, promptologue, épistémiarque, chacune un rôle de la table roles, aucune « admin »')]
    public function testU02FoundingCircleAndHabilitations(): void
    {
        self::assertSame(['promptagogue', 'epistemiarque', 'maitre-du-grimoire'], DeclaredRoles::FOUNDING_CIRCLE_ELIGIBLE);
        self::assertSame(DeclaredRoles::FOUNDING_CIRCLE_ELIGIBLE,
            array_column(array_filter(DeclaredRoles::catalogue(), static fn (array $e): bool => $e['foundingCircleEligible']), 'id'));

        self::assertSame(['cartographe' => 'cartographe', 'promptologue' => 'promptologue', 'epistemiarque' => 'epistemiarque'],
            DeclaredRoles::HABILITATIONS);
        $roles = self::$pdo->query('SELECT name FROM roles')->fetchAll(PDO::FETCH_COLUMN);
        foreach (DeclaredRoles::HABILITATIONS as $declaration => $habilitation) {
            self::assertArrayHasKey($declaration, DeclaredRoles::CATALOGUE);
            self::assertContains($habilitation, $roles);
            self::assertNotSame('admin', $habilitation);
        }
        $sans = array_column(array_filter(DeclaredRoles::catalogue(), static fn (array $e): bool => $e['habilitation'] === null), 'id');
        self::assertSame(['promptagogue', 'eclaireur', 'architecte', 'mediateur', 'noesiologue', 'maitre-du-grimoire'], $sans,
            'les autres déclarations n’ont pas d’habilitation aujourd’hui');
    }

    #[TestDox('UC-CPT-07-U03 — validate : rôles remis dans l’ordre du catalogue, case absente = false, liste vide acceptée')]
    public function testU03ValidateNormalizes(): void
    {
        self::assertSame(['declaration' => ['roles' => ['cartographe', 'maitre-du-grimoire'], 'foundingCircle' => true], 'fields' => []],
            DeclaredRoles::validate(['roles' => ['maitre-du-grimoire', 'cartographe'], 'foundingCircle' => true]));
        self::assertSame(['roles' => ['mediateur'], 'foundingCircle' => false],
            DeclaredRoles::validate(['roles' => ['mediateur']])['declaration']);
        self::assertSame(['roles' => [], 'foundingCircle' => false],
            DeclaredRoles::validate(['roles' => [], 'foundingCircle' => false])['declaration']);
        self::assertSame(self::NEUF, DeclaredRoles::validate(['roles' => array_reverse(self::NEUF)])['declaration']['roles']);
    }

    #[TestDox('UC-CPT-07-U04 — validate : corps non objet, liste absente ou non liste, rôle non textuel ou en UTF-8 invalide (jamais cité), « admin », autres habilitations, inconnu, casse ou accent, doublon, case non booléenne → refusés')]
    public function testU04ValidateRefuses(): void
    {
        foreach ([null, 'cartographe', 42, ['cartographe']] as $body) {
            self::assertArrayHasKey('body', self::refused($body));
        }
        foreach ([[], ['roles' => 'cartographe'], ['roles' => null], ['roles' => ['a' => 'cartographe']]] as $body) {
            self::assertSame('Liste de rôles attendue (vide pour aucun)', self::refused($body)['roles']);
        }
        self::assertSame('Chaque rôle est un identifiant (chaîne)', self::refused(['roles' => [['cartographe']]])['roles']);
        self::assertSame('Le rôle « admin » ne se déclare pas : seul un administrateur l’attribue',
            self::refused(['roles' => ['cartographe', 'admin']])['roles']);
        foreach (['apprenant', 'employeur', 'etablissement', 'visiteur', 'fondateur', 'Cartographe', 'cartographe ',
                  'épistémiarque', 'maître-du-grimoire', 'maitre_du_grimoire', ''] as $role) {
            self::assertStringStartsWith('Rôle non déclarable « ', self::refused(['roles' => [$role]])['roles'], $role);
        }
        self::assertSame('Rôle « mediateur » en double', self::refused(['roles' => ['mediateur', 'architecte', 'mediateur']])['roles']);
        // un identifiant qui n'est pas de l'UTF-8 valide n'est jamais cité (le 422 resterait de l'UTF-8 invalide, que
        // json_encode refuse : un 500 sous PHP 8.2, où mb_substr copie les octets bruts)
        foreach (["\xC3", "cartographe\xFF", "\xED\xA0\x80"] as $role) {
            $message = self::refused(['roles' => [$role]])['roles'];
            self::assertSame('Chaque rôle est un identifiant en UTF-8 valide', $message, bin2hex($role));
            self::assertTrue(mb_check_encoding($message, 'UTF-8'));
        }
        foreach (['true', 1, null, []] as $box) {
            self::assertSame(['foundingCircle' => 'Case attendue (true ou false)'],
                self::refused(['roles' => ['epistemiarque'], 'foundingCircle' => $box]), json_encode($box));
        }
    }

    #[TestDox('UC-CPT-07-U05 — validate : la case du cercle des fondateurs n’est acceptée qu’avec promptagogue, épistémiarque ou maître du grimoire')]
    public function testU05FoundingCircleNeedsAnEligibleRole(): void
    {
        foreach (DeclaredRoles::FOUNDING_CIRCLE_ELIGIBLE as $role) {
            self::assertTrue(DeclaredRoles::validate(['roles' => [$role, 'cartographe'], 'foundingCircle' => true])['declaration']['foundingCircle']);
        }
        $nonEligibles = array_values(array_diff(self::NEUF, DeclaredRoles::FOUNDING_CIRCLE_ELIGIBLE));
        foreach ([[], ['cartographe'], $nonEligibles] as $roles) {
            self::assertSame(['foundingCircle'], array_keys(self::refused(['roles' => $roles, 'foundingCircle' => true])),
                json_encode($roles));
        }
        self::assertFalse(DeclaredRoles::validate(['roles' => $nonEligibles, 'foundingCircle' => false])['declaration']['foundingCircle']);
    }

    #[TestDox('UC-CPT-07-U06 — replace puis of : la déclaration entière est remplacée, user_roles intact ; compte inconnu ou supprimé → false, rien d’écrit')]
    public function testU06ReplaceReplacesTheWholeDeclaration(): void
    {
        $ada = AdmSupport::user(self::$pdo, 'ada@example.org', 'Ada', ['apprenant']);
        self::assertSame(['roles' => [], 'foundingCircle' => false], self::declared()->of($ada), 'rien de déclaré');

        self::assertTrue(self::declared()->replace($ada, ['roles' => ['maitre-du-grimoire', 'cartographe'], 'foundingCircle' => true]));
        self::assertSame(['roles' => ['cartographe', 'maitre-du-grimoire'], 'foundingCircle' => true], self::declared()->of($ada));

        self::assertTrue(self::declared()->replace($ada, ['roles' => ['architecte'], 'foundingCircle' => false]));
        self::assertSame(['roles' => ['architecte'], 'foundingCircle' => false], self::declared()->of($ada));
        self::assertSame(1, self::rows("SELECT COUNT(*) FROM user_declared_roles WHERE user_id = $ada"));
        self::assertSame(['apprenant'], Users::rolesOf(self::$pdo, $ada), 'les habilitations ne bougent pas');

        self::assertTrue(self::declared()->replace($ada, ['roles' => [], 'foundingCircle' => false]));
        self::assertSame(0, self::rows("SELECT COUNT(*) FROM user_declared_roles WHERE user_id = $ada"));

        $parti = AdmSupport::user(self::$pdo, 'parti@example.org', 'Parti');
        self::$pdo->exec("UPDATE users SET deleted_at = NOW() WHERE id = $parti");
        foreach ([$parti, $parti + 1000] as $absent) {
            self::assertFalse(self::declared()->replace($absent, ['roles' => ['mediateur'], 'foundingCircle' => false]));
        }
        self::assertSame(0, self::rows('SELECT COUNT(*) FROM user_declared_roles'));
        self::assertFalse(self::$pdo->inTransaction());
    }

    #[TestDox('UC-CPT-07-U07 — replace revérifie : une déclaration que validate refuse (« admin », cercle sans rôle éligible) lève une erreur, rien n’est écrit')]
    public function testU07ReplaceChecksAgain(): void
    {
        $ada = AdmSupport::user(self::$pdo, 'ada@example.org', 'Ada', ['apprenant']);
        self::declared()->replace($ada, ['roles' => ['epistemiarque'], 'foundingCircle' => true]);
        foreach ([['roles' => ['admin'], 'foundingCircle' => false], ['roles' => ['cartographe'], 'foundingCircle' => true]] as $refusee) {
            try {
                self::declared()->replace($ada, $refusee);
                self::fail('déclaration refusée écrite : ' . json_encode($refusee));
            } catch (\InvalidArgumentException) {
            }
            self::assertSame(['roles' => ['epistemiarque'], 'foundingCircle' => true], self::declared()->of($ada));
        }
        self::assertSame(['apprenant'], Users::rolesOf(self::$pdo, $ada));
    }

    #[TestDox('UC-CPT-07-U08 — ofUsers : plusieurs comptes en deux requêtes ; sans déclaration → vide ; inconnu absent ; un drapeau resté sans rôle éligible n’est pas rapporté')]
    public function testU08OfUsersReadsSeveralAccounts(): void
    {
        $ada = AdmSupport::user(self::$pdo, 'ada@example.org', 'Ada');
        $bob = AdmSupport::user(self::$pdo, 'bob@example.org', 'Bob');
        $cleo = AdmSupport::user(self::$pdo, 'cleo@example.org', 'Cléo');
        self::declared()->replace($ada, ['roles' => ['promptagogue', 'eclaireur'], 'foundingCircle' => true]);
        self::$pdo->exec("INSERT INTO user_declared_roles (user_id, role) VALUES ($cleo, 'mediateur')");
        self::$pdo->exec("UPDATE users SET founding_circle = 1 WHERE id = $cleo"); // hors de replace()

        self::assertSame([
            $ada => ['roles' => ['promptagogue', 'eclaireur'], 'foundingCircle' => true],
            $bob => ['roles' => [], 'foundingCircle' => false],
            $cleo => ['roles' => ['mediateur'], 'foundingCircle' => false],
        ], self::declared()->ofUsers([$ada, $bob, $cleo, $cleo + 1000]));
        self::assertSame([], self::declared()->ofUsers([]));
    }

    #[TestDox('UC-CPT-07-U09 — grantable : les habilitations que les déclarations appellent et que le compte n’a pas ; jamais « admin »')]
    public function testU09Grantable(): void
    {
        self::assertSame(['promptologue', 'epistemiarque'],
            DeclaredRoles::grantable(['mediateur', 'epistemiarque', 'promptologue', 'cartographe'], ['apprenant', 'cartographe']));
        self::assertSame([], DeclaredRoles::grantable(['cartographe'], ['cartographe']));
        self::assertSame([], DeclaredRoles::grantable(['promptagogue', 'eclaireur', 'architecte', 'mediateur', 'noesiologue',
                                                       'maitre-du-grimoire'], []));
        self::assertSame([], DeclaredRoles::grantable([], []));
        self::assertSame(['cartographe', 'promptologue', 'epistemiarque'], DeclaredRoles::grantable(self::NEUF, ['admin']));
    }

    #[TestDox('UC-CPT-07-U10 — propriété : tout déclarer (cercle compris) ne change ni user_roles, ni Users::rolesOf, ni l’électorat (Electorate::ids)')]
    public function testU10ADeclarationOpensNothing(): void
    {
        $membre = AdmSupport::user(self::$pdo, 'membre@example.org', 'Membre', ['epistemiarque']);
        $dora = AdmSupport::user(self::$pdo, 'dora@example.org', 'Dora', ['apprenant']);
        $habilitations = self::$pdo->query('SELECT user_id, role_id FROM user_roles ORDER BY user_id, role_id')->fetchAll();

        self::declared()->replace($dora, ['roles' => self::NEUF, 'foundingCircle' => true]);

        self::assertSame($habilitations, self::$pdo->query('SELECT user_id, role_id FROM user_roles ORDER BY user_id, role_id')->fetchAll());
        self::assertSame(['apprenant'], Users::rolesOf(self::$pdo, $dora));
        self::assertSame([$membre], Electorate::ids(self::$pdo), 'une déclaration ne fait pas voter');
        self::assertSame(9, self::rows("SELECT COUNT(*) FROM user_declared_roles WHERE user_id = $dora"));
    }

    #[TestDox('UC-CPT-07-U11 — Users::purge : les rôles déclarés (CASCADE) et la case (colonne de la ligne users) partent avec le compte, ceux d’autrui restent')]
    public function testU11PurgeRemovesTheDeclaration(): void
    {
        $ada = AdmSupport::user(self::$pdo, 'ada@example.org', 'Ada');
        $bob = AdmSupport::user(self::$pdo, 'bob@example.org', 'Bob');
        self::declared()->replace($ada, ['roles' => ['epistemiarque', 'noesiologue'], 'foundingCircle' => true]);
        self::declared()->replace($bob, ['roles' => ['noesiologue'], 'foundingCircle' => false]);

        Users::purge(self::$pdo, $ada);

        self::assertSame(0, self::rows("SELECT COUNT(*) FROM user_declared_roles WHERE user_id = $ada"));
        self::assertSame(0, self::rows("SELECT COUNT(*) FROM users WHERE id = $ada"));
        self::assertSame(['roles' => ['noesiologue'], 'foundingCircle' => false], self::declared()->of($bob));
    }
}
