<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Auth\Users;
use Humanome\Llm\LlmRuntime;
use Humanome\Referentiel\Electorate;
use Humanome\Tests\UseCases\Support\EpiSupport;
use Humanome\Tests\UseCases\Support\RunsTwin9Factices;
use Humanome\Twin9\CreditService;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunInSeparateProcess;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-CPT-07 — Déclarer ses rôles RESPIRE : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/compte/UC-CPT-07-declarer-roles-respire.md
 *
 * Les scénarios passent par l'API HTTP (application Slim en processus, vraie
 * base MySQL, navigateurs simulés avec cookie de session et jeton CSRF) :
 * GET et PUT /api/auth/me/declared-roles, puis la PROPRIÉTÉ du sprint 8, vue
 * des routes qui ouvrent des droits : une déclaration n'ouvre rien — ni la
 * lecture d'un run partagé aux cartographes, ni le vote des épistémiarques,
 * ni aucune garde, ni « admin » — et l'habilitation de l'administrateur, elle,
 * ouvre (contrôle positif de chaque propriété). La base des tests est celle
 * des épistémiarques (EpiSupport : les gardes du référentiel lisent la
 * session comme sur le serveur web) ; le run Twin9 est celui du moteur
 * factice, dans un processus à lui.
 */
final class UcCpt07DeclarerRolesTest extends EpiSupport
{
    use RunsTwin9Factices;

    private const ROUTE = '/api/auth/me/declared-roles';

    private const NEUF = ['cartographe', 'promptologue', 'promptagogue', 'eclaireur', 'architecte', 'epistemiarque',
                          'mediateur', 'noesiologue', 'maitre-du-grimoire'];

    protected function tearDown(): void
    {
        LlmRuntime::setMultiHttpClient(null);
        parent::tearDown();
    }

    /** @param array{id: int, csrf: string, sid: string} $who */
    private function declare(array $who, mixed $roles, mixed $foundingCircle = null): ResponseInterface
    {
        $body = ['roles' => $roles];
        if ($foundingCircle !== null) {
            $body['foundingCircle'] = $foundingCircle;
        }

        return $this->as_($who, 'PUT', self::ROUTE, $body);
    }

    /**
     * @param array{id: int, csrf: string, sid: string} $who
     * @return array{roles: list<string>, foundingCircle: bool}
     */
    private function declaration(array $who): array
    {
        $r = $this->as_($who, 'GET', self::ROUTE);
        self::assertSame(200, $r->getStatusCode(), (string) $r->getBody());
        $body = self::json($r);

        return ['roles' => $body['roles'], 'foundingCircle' => $body['foundingCircle']];
    }

    /** @param array{id: int, csrf: string, sid: string} $who @return list<string> its habilitations, as /auth/me says them */
    private function habilitations(array $who): array
    {
        return self::json($this->as_($who, 'GET', '/api/auth/me'))['user']['roles'];
    }

    private static function declaredRows(int $userId): int
    {
        $stmt = self::$pdo->prepare('SELECT COUNT(*) FROM user_declared_roles WHERE user_id = ?');
        $stmt->execute([$userId]);

        return (int) $stmt->fetchColumn();
    }

    #[TestDox('UC-CPT-07-F01 — nominal : le compte lit le catalogue, déclare cartographe et maître du grimoire avec la case du cercle, relit sa déclaration ; ses habilitations ne changent pas')]
    public function testF01NominalDeclaration(): void
    {
        $dora = $this->registerAs('dora@example.org', 'Dora');

        $vide = self::json($this->as_($dora, 'GET', self::ROUTE));
        self::assertSame([], $vide['roles']);
        self::assertFalse($vide['foundingCircle']);
        self::assertSame(self::NEUF, array_column($vide['catalogue'], 'id'));
        self::assertSame('Maître du grimoire', $vide['catalogue'][8]['label']);
        self::assertSame(['cartographe', 'promptologue', null, null, null, 'epistemiarque', null, null, null],
            array_column($vide['catalogue'], 'habilitation'));
        self::assertSame(['promptagogue', 'epistemiarque', 'maitre-du-grimoire'],
            array_column(array_filter($vide['catalogue'], static fn (array $e): bool => $e['foundingCircleEligible']), 'id'));

        $put = $this->declare($dora, ['maitre-du-grimoire', 'cartographe'], true);
        self::assertSame(200, $put->getStatusCode(), (string) $put->getBody());
        self::assertSame(['cartographe', 'maitre-du-grimoire'], self::json($put)['roles'], 'ordre du catalogue');
        self::assertTrue(self::json($put)['foundingCircle']);
        self::assertSame(self::NEUF, array_column(self::json($put)['catalogue'], 'id'));

        self::assertSame(['roles' => ['cartographe', 'maitre-du-grimoire'], 'foundingCircle' => true], $this->declaration($dora));
        self::assertSame(['apprenant'], $this->habilitations($dora), 'une déclaration n’est pas une habilitation');
    }

    #[TestDox('UC-CPT-07-F02 — A1/A2 : un PUT remplace la déclaration entière ; case absente = décochée ; liste vide = plus aucun rôle déclaré')]
    public function testF02APutReplacesTheWholeDeclaration(): void
    {
        $dora = $this->registerAs('dora@example.org', 'Dora');
        $this->declare($dora, ['epistemiarque', 'noesiologue'], true);

        self::assertSame(200, $this->declare($dora, ['mediateur'])->getStatusCode());
        self::assertSame(['roles' => ['mediateur'], 'foundingCircle' => false], $this->declaration($dora));

        self::assertSame(200, $this->declare($dora, [], false)->getStatusCode());
        self::assertSame(['roles' => [], 'foundingCircle' => false], $this->declaration($dora));
        self::assertSame(0, self::declaredRows($dora['id']));
    }

    #[TestDox('UC-CPT-07-F03 — E1 : la case du cercle des fondateurs sans promptagogue, épistémiarque ni maître du grimoire → 422, rien n’est écrit (y compris en retirant le rôle qui la portait)')]
    public function testF03TheFoundingCircleNeedsAnEligibleRole(): void
    {
        $dora = $this->registerAs('dora@example.org', 'Dora');
        $refus = $this->declare($dora, ['cartographe', 'architecte'], true);
        self::assertSame(422, $refus->getStatusCode());
        self::assertSame(['foundingCircle'], array_keys(self::json($refus)['fields']));
        self::assertSame(0, self::declaredRows($dora['id']));

        $this->declare($dora, ['promptagogue', 'cartographe'], true);
        // retirer promptagogue en gardant la case : refusé, la déclaration précédente reste
        self::assertSame(422, $this->declare($dora, ['cartographe'], true)->getStatusCode());
        self::assertSame(['roles' => ['cartographe', 'promptagogue'], 'foundingCircle' => true], $this->declaration($dora));
        // la case décochée avec lui : accepté
        self::assertSame(200, $this->declare($dora, ['cartographe'], false)->getStatusCode());
        self::assertSame(['roles' => ['cartographe'], 'foundingCircle' => false], $this->declaration($dora));
    }

    #[TestDox('UC-CPT-07-F04 — E2 : « admin », les autres habilitations, un rôle inconnu, une graphie voisine, un doublon, une liste ou une case mal formées, un corps non objet, un rôle en UTF-8 invalide (corps de formulaire) → 422 ; rien n’est écrit, aucune habilitation ne bouge')]
    public function testF04RefusedDeclarations(): void
    {
        $dora = $this->registerAs('dora@example.org', 'Dora');
        $this->declare($dora, ['architecte']);

        $admin = $this->declare($dora, ['admin']);
        self::assertSame(422, $admin->getStatusCode());
        self::assertSame(['error' => 'Validation échouée',
                          'fields' => ['roles' => 'Le rôle « admin » ne se déclare pas : seul un administrateur l’attribue']],
            self::json($admin));
        foreach ([['apprenant'], ['employeur'], ['etablissement'], ['visiteur'], ['Cartographe'], ['épistémiarque'],
                  ['mediateur', 'mediateur'], 'cartographe', [42], ['roles' => 'x']] as $roles) {
            $r = $this->declare($dora, $roles);
            self::assertSame(422, $r->getStatusCode(), json_encode($roles));
            self::assertArrayHasKey('roles', self::json($r)['fields']);
        }
        self::assertSame(422, $this->declare($dora, ['epistemiarque'], 'true')->getStatusCode(), 'case non booléenne');
        self::assertSame(422, $this->as_($dora, 'PUT', self::ROUTE, [])->getStatusCode(), 'liste absente');
        self::assertSame(422, $this->rawAs($dora, 'PUT', self::ROUTE, '["cartographe"]')->getStatusCode(), 'corps non objet');
        self::assertSame(422, $this->rawAs($dora, 'PUT', self::ROUTE, '{"roles": [')->getStatusCode(), 'JSON malformé');
        // corps de formulaire (Slim l'analyse aussi) portant un octet qui n'est pas de l'UTF-8 : 422, jamais 500
        $form = $this->rawAs($dora, 'PUT', self::ROUTE, 'roles[]=%C3', 'application/x-www-form-urlencoded');
        self::assertSame(422, $form->getStatusCode(), (string) $form->getBody());
        self::assertSame(['error' => 'Validation échouée', 'fields' => ['roles' => 'Chaque rôle est un identifiant en UTF-8 valide']],
            self::json($form));

        self::assertSame(['roles' => ['architecte'], 'foundingCircle' => false], $this->declaration($dora));
        self::assertSame(['apprenant'], $this->habilitations($dora));
    }

    #[TestDox('UC-CPT-07-F05 — E3/E4 : visiteur → 401 en lecture et en écriture ; PUT sans jeton CSRF → 403, rien n’est écrit')]
    public function testF05VisitorAndCsrf(): void
    {
        self::assertSame(401, $this->anonymous('GET', self::ROUTE)->getStatusCode());
        self::assertSame(401, $this->anonymous('PUT', self::ROUTE, ['roles' => ['cartographe']])->getStatusCode());

        $dora = $this->registerAs('dora@example.org', 'Dora');
        self::assertSame(403, $this->withoutCsrf($dora, 'PUT', self::ROUTE, ['roles' => ['cartographe']])->getStatusCode());
        self::assertSame(0, self::declaredRows($dora['id']));
    }

    #[TestDox('UC-CPT-07-F06 — propriété : un compte qui déclare les neuf rôles et la case garde ses habilitations ; 403 partout où une habilitation est exigée (cartographe, promptologue, épistémiarque, admin), et il ne s’habilite pas lui-même')]
    public function testF06ADeclarationOpensNoGuard(): void
    {
        $dora = $this->registerAs('dora@example.org', 'Dora');
        self::assertSame(200, $this->declare($dora, self::NEUF, true)->getStatusCode());

        self::assertSame(['apprenant'], $this->habilitations($dora));
        self::assertSame(['apprenant'], Users::rolesOf(self::$pdo, $dora['id']));
        foreach ([
            ['GET', '/api/cartographe/apprentis', null],
            ['GET', '/api/cartographe/cartographies', null],
            ['POST', '/api/cartographe/invitations/ABCDEFGH23/accept', []],
            ['GET', '/api/prompt-packages/drafts', null],
            ['GET', '/api/competences/proposals', null],
            ['GET', '/api/referentiel/drafts', null],
            ['POST', '/api/referentiel/proposals/1/votes', ['vote' => 'pour']],
            ['GET', '/api/admin/users', null],
            ['POST', '/api/admin/users/' . $dora['id'] . '/roles', ['role' => 'admin']],
            ['POST', '/api/admin/users/' . $dora['id'] . '/roles', ['role' => 'cartographe']],
        ] as [$method, $path, $body]) {
            self::assertSame(403, $this->as_($dora, $method, $path, $body)->getStatusCode(), "$method $path");
        }
        self::assertSame(['apprenant'], Users::rolesOf(self::$pdo, $dora['id']), 'aucune habilitation, admin compris');
    }

    #[TestDox('UC-CPT-07-F07 — propriété : un compte qui se déclare épistémiarque ne vote pas (403, aucun bulletin) et n’entre pas dans l’électorat ; habilité d’un clic par l’administrateur, il vote')]
    public function testF07ADeclaredEpistemiarqueDoesNotVote(): void
    {
        self::seedCompetence('1.01', 'Pensée Critique', 1, '1.0.0', self::competenceContent('1.01', 'Pensée Critique'));
        $alix = $this->member('alix@example.org', 'Alix');
        $id = $this->openCompetenceProposal($alix, '1.01', '1.1.0', static function (array $content): array {
            $content['identite']['definition'] = 'Douter méthodiquement, y compris de soi.';

            return $content;
        });
        $dora = $this->registerAs('dora@example.org', 'Dora');
        self::assertSame(200, $this->declare($dora, ['epistemiarque'], true)->getStatusCode());

        $vote = $this->as_($dora, 'POST', '/api/competences/proposals/' . $id . '/votes', ['vote' => 'pour']);
        self::assertSame(403, $vote->getStatusCode());
        self::assertSame(0, self::competenceBallots($id));
        self::assertSame([$alix['id']], Electorate::ids(self::$pdo));
        self::assertSame(1, self::json($this->as_($alix, 'GET', '/api/competences/proposals/' . $id))['tally']['electorateSize']);

        // contrôle : l'habilitation que sa déclaration appelle, accordée par l'administrateur, ouvre le vote
        $root = $this->registerAs('root@example.org', 'Root', ['admin']);
        $ligne = array_values(array_filter(self::json($this->as_($root, 'GET', '/api/admin/users'))['users'],
            static fn (array $u): bool => $u['id'] === $dora['id']))[0];
        self::assertSame(['epistemiarque'], $ligne['grantable']);
        self::assertSame(200, $this->as_($root, 'POST', '/api/admin/users/' . $dora['id'] . '/roles',
            ['role' => $ligne['grantable'][0]])->getStatusCode());

        $vote = $this->as_($dora, 'POST', '/api/competences/proposals/' . $id . '/votes', ['vote' => 'pour']);
        self::assertSame(200, $vote->getStatusCode(), (string) $vote->getBody());
        self::assertSame(2, self::json($vote)['tally']['electorateSize']);
        self::assertSame(1, self::competenceBallots($id));
    }

    #[TestDox('UC-CPT-07-F08 — propriété : un compte qui se déclare cartographe, même lié à l’apprenante, ne lit pas son run Twin9 partagé aux cartographes (404) ; habilité, il le lit')]
    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testF08ADeclaredCartographeReadsNoSharedRun(): void
    {
        $this->moteurFactice();
        $alice = $this->registerAs('apprenante@example.org', 'Alice');
        (new CreditService(self::$pdo))->adjust($alice['id'], 1_000_000_000, 'crédit des tests');
        $dora = $this->registerAs('dora@example.org', 'Dora');
        self::assertSame(200, $this->declare($dora, ['cartographe'])->getStatusCode());

        // accepter une invitation exige l'habilitation : sa déclaration n'y suffit pas
        $code = (string) self::json($this->as_($alice, 'POST', '/api/cartographe/invitations'))['code'];
        self::assertSame(403, $this->as_($dora, 'POST', '/api/cartographe/invitations/' . $code . '/accept')->getStatusCode());
        // le lien posé quand même (une habilitation retirée depuis, par exemple) : la déclaration n'ouvre toujours rien
        self::$pdo->prepare('INSERT INTO cartographe_links (apprenant_id, cartographe_id) VALUES (?, ?)')
            ->execute([$alice['id'], $dora['id']]);

        $id = $this->lancer($alice, $this->profilDirect($alice))['id'];
        $this->jusquAuBout($alice, $id);
        $visible = $this->as_($alice, 'PUT', "/api/twin9/runs/$id/visibilite", ['visibilite' => 'cartographe']);
        self::assertSame('cartographe', self::json($visible)['visibilite']);

        self::assertSame(404, $this->as_($dora, 'GET', "/api/twin9/runs/$id/resultats")->getStatusCode());

        // contrôle : habilitée cartographe par l'administrateur, elle le lit en cartographe
        $root = $this->registerAs('root@example.org', 'Root', ['admin']);
        self::assertSame(200, $this->as_($root, 'POST', '/api/admin/users/' . $dora['id'] . '/roles',
            ['role' => 'cartographe'])->getStatusCode());
        $lu = $this->as_($dora, 'GET', "/api/twin9/runs/$id/resultats");
        self::assertSame(200, $lu->getStatusCode(), (string) $lu->getBody());
        self::assertSame('cartographe', self::json($lu)['lecteur']);
    }

    #[TestDox('UC-CPT-07-F09 — RGPD : la suppression du compte efface ses rôles déclarés et la case ; ceux d’un autre compte restent')]
    public function testF09AccountDeletionRemovesTheDeclaration(): void
    {
        $dora = $this->registerAs('dora@example.org', 'Dora');
        $bao = $this->registerAs('bao@example.org', 'Bao');
        $this->declare($dora, ['epistemiarque', 'noesiologue'], true);
        $this->declare($bao, ['noesiologue']);

        self::assertSame(204, $this->as_($dora, 'DELETE', '/api/auth/account')->getStatusCode());

        self::assertSame(0, self::declaredRows($dora['id']));
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM users WHERE id = ' . $dora['id'])->fetchColumn());
        self::assertSame(401, $this->as_($dora, 'GET', self::ROUTE)->getStatusCode(), 'session purgée');
        self::assertSame(['roles' => ['noesiologue'], 'foundingCircle' => false], $this->declaration($bao));
    }
}
