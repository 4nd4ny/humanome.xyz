<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Auth\Users;
use Humanome\Keys\KeyVault;
use Humanome\MigrationRunner;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\RunsTwin9Factices;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\EngineLoader;
use Humanome\Twin9\Lancement;
use Humanome\Twin9\ProfilPolicy;
use Humanome\Twin9\ProfilRepository;
use Humanome\Twin9\Resultats;
use Humanome\Twin9\RunRepository;
use Humanome\Twin9\Twin9Config;
use Humanome\Twin9\Twin9Exception;
use PDO;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunTestsInSeparateProcesses;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;
use stdClass;

/**
 * UC-APP-10 — Lancer une analyse approfondie (Twin9) : tests UNITAIRES (API).
 *
 * Fiche : docs/cas-utilisation/apprenant/UC-APP-10-analyse-approfondie-twin9.md
 *
 * Le domaine des runs du serveur appelé directement, sans couche HTTP, sur la
 * base de test dédiée : Lancement (accord, aperçu, empreinte), ProfilPolicy
 * (ce qu'un profil peut choisir), RunRepository (actions du propriétaire,
 * suivi), Resultats (sorties filtrées). Le moteur est le moteur factice,
 * public (`api/tests/fixtures/twin9-factice`) ; chaque test tourne dans un
 * processus à lui : le vrai moteur de `TWIN_V9_DIR` peut être chargé dans les
 * autres.
 */
#[RunTestsInSeparateProcesses]
#[PreserveGlobalState(false)]
final class UcApp10AnalyseApprofondieTwin9Test extends TestCase
{
    use RunsTwin9Factices;

    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
        TestDb::overrideEnv();
    }

    public static function tearDownAfterClass(): void
    {
        TestDb::restoreEnv();
    }

    protected function setUp(): void
    {
        TestDb::overrideEnv();
        self::$pdo->exec('DELETE FROM users');
        self::$pdo->exec('DELETE FROM audit_events');
        self::$pdo->exec("DELETE FROM settings WHERE name = 'twin9_config'");
        $this->moteurFactice();
        self::assertTrue(EngineLoader::load(), 'le moteur factice se charge');
    }

    private static function config(): Twin9Config
    {
        return new Twin9Config(new SettingsRepository(self::$pdo));
    }

    private static function lancement(): Lancement
    {
        return new Lancement(self::$pdo, self::config());
    }

    /** Un compte, crédité de $microusd (la clé de l'instance le débite). */
    private static function utilisateur(string $email, int $microusd = 1_000_000_000): int
    {
        self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([$email, Users::hashPassword('x-password'), strstr($email, '@', true)]);
        $id = (int) self::$pdo->lastInsertId();
        if ($microusd !== 0) {
            (new CreditService(self::$pdo))->adjust($id, $microusd, 'crédit des tests');
        }

        return $id;
    }

    /** Un profil de $userId, par la voie directe, avec ces changements. @param array<string, mixed> $changes */
    private static function profil(int $userId, string $nom = 'Direct', array $changes = []): int
    {
        $profil = ProfilRepository::v98();
        $profil->voie = 'directe';
        foreach ($changes as $cle => $valeur) {
            $profil->{$cle} = $valeur;
        }

        return (new ProfilRepository(self::$pdo))->create($userId, $nom, $profil);
    }

    /** Lancé avec le profil v9.8, son accord donné. */
    private static function lancer(int $userId): int
    {
        return self::lancement()->lancer($userId, null, 'journal-factice.md', self::$portfolioFactice, true);
    }

    private static function compte(string $table): int
    {
        return (int) self::$pdo->query("SELECT COUNT(*) FROM $table")->fetchColumn();
    }

    /** Le refus (422) qu'une opération lève : son message. */
    private static function refus(callable $operation): string
    {
        try {
            $operation();
        } catch (Twin9Exception $e) {
            self::assertSame(422, $e->getStatusCode(), $e->getMessage());

            return $e->getMessage();
        }
        self::fail('aucun refus');
    }

    #[TestDox('UC-APP-10-U07 — Lancement::lancer : sans accord, ou avec une visibilité inconnue → 422, et rien n’est créé (RG1, E3)')]
    public function testU07ALaunchWithoutConsentCreatesNothing(): void
    {
        $lea = self::utilisateur('lea@example.org');
        foreach ([false, true] as $accord) {
            self::assertSame($accord ? 'Visibilité inconnue : privee ou cartographe'
                : 'Accord requis : votre portfolio et l’état du run restent sur le serveur jusqu’à ce que vous les effaciez',
                self::refus(static fn (): int => self::lancement()->lancer($lea, null, 'journal-factice.md',
                    self::$portfolioFactice, $accord, $accord ? 'publique' : 'privee')));
        }
        foreach (['twin9_runs', 'twin9_cartes', 'twin9_memoire'] as $table) {
            self::assertSame(0, self::compte($table), $table);
        }
    }

    #[TestDox('UC-APP-10-U08 — ProfilPolicy::admettre : le profil v9.8 est admis ; clé personnelle fermée, jeu de gabarits non proposé, référentiel ou version non publiés, modèle sans prix → 422 qui nomme le choix (RG2, E4)')]
    public function testU08WhatAProfileMayChoose(): void
    {
        $lea = self::utilisateur('lea@example.org');
        $politique = new ProfilPolicy(self::$pdo, self::config());
        $v98 = ProfilRepository::validate($politique->defaut());
        $politique->admettre($v98, $lea);
        self::assertSame('v9.8', $v98->gabarits);

        $modifie = static function (stdClass $profil, string $champ, mixed $valeur): stdClass {
            $copie = json_decode((string) json_encode($profil));
            $copie->{$champ} = $valeur;

            return $copie;
        };
        foreach ([
            ['cle', 'personnelle', 'Profil refusé — /cle : les clés personnelles ne sont pas ouvertes sur cette instance'],
            ['gabarits', 'copie-inconnue', 'Profil refusé — /gabarits : ce jeu de gabarits ne vous est pas proposé'],
            ['referentiel', (object) ['id' => 'inexistant', 'version' => null],
             'Profil refusé — /referentiel/id : aucun référentiel publié sous ce nom'],
            ['referentiel', (object) ['id' => 'respire', 'version' => '9.9.9'],
             'Profil refusé — /referentiel/version : version non publiée'],
        ] as [$champ, $valeur, $message]) {
            self::assertSame($message, self::refus(static fn () => $politique->admettre($modifie($v98, $champ, $valeur), $lea)),
                $champ);
        }

        // Le profil v9.8 nomme Sonnet 5.5 à l'étage profond : une offre sans lui le refuse.
        self::config()->update(['modeles' => ['claude-haiku-5-5' => ['prix_usd_mtok' => [0.1, 0.5], 'etages' => ['taggers']]]]);
        self::assertSame('Profil refusé — claude-sonnet-5-5 : aucun prix pour ce modèle sur cette instance',
            self::refus(static fn () => $politique->admettre($v98, $lea)));
    }

    #[TestDox('UC-APP-10-U09 — Lancement::apercu : sans évaluation, le run de référence × les pôles × la contribution, la moitié par lots, sans contribution avec sa clé personnelle ; rien n’est gardé (RG4)')]
    public function testU09TheEstimateWithoutEvaluations(): void
    {
        $lea = self::utilisateur('lea@example.org');
        $parJour = static fn (float $facteur): float => Lancement::REFERENCE_MICROUSD * 7 * $facteur;

        $direct = self::lancement()->apercu($lea, self::profil($lea), 'journal-factice.md', self::$portfolioFactice);
        self::assertSame(['directe', 'instance', 1000.0], [$direct['voie'], $direct['cle'], $direct['credit_usd']]);
        self::assertSame(['total' => 2, 'nouvelles' => 2, 'changees' => 0], $direct['journees']);
        self::assertSame(['cout_usd' => round(3 * $parJour(1.2) / 1_000_000, 6), 'duree_s' => Lancement::REFERENCE_SECONDES * 7 * 2,
                          'reference' => 'PLANT-01', 'poles' => 7],
            array_intersect_key($direct['estimation'], ['cout_usd' => 1, 'duree_s' => 1, 'reference' => 1, 'poles' => 1]));

        // Le profil v9.8, par lots : à moitié prix, la durée est celle d'Anthropic.
        $lots = self::lancement()->apercu($lea, null, 'journal-factice.md', self::$portfolioFactice);
        self::assertSame('lots', $lots['voie']);
        self::assertSame(round(3 * $parJour(1.2 * 0.5) / 1_000_000, 6), $lots['estimation']['cout_usd']);
        self::assertNull($lots['estimation']['duree_s']);

        // Sa clé personnelle : sans contribution, et son crédit ne borne rien.
        TestDb::setEnv('SODIUM_MASTER_KEY', str_repeat('cd', 32));
        self::config()->update(['twin9_cle_perso_ouverte' => true]);
        (new KeyVault(self::$pdo, (string) KeyVault::masterKeyFromEnv()))->store($lea, 'anthropic', 'sk-ant-perso-fictive');
        $perso = self::lancement()->apercu($lea, self::profil($lea, 'Ma clé', ['cle' => 'personnelle']), 'journal-factice.md',
            self::$portfolioFactice);
        self::assertSame(['personnelle', null, null], [$perso['cle'], $perso['credit_usd'], $perso['admission']['limite']]);
        self::assertSame(round(3 * $parJour(1.0) / 1_000_000, 6), $perso['estimation']['cout_usd']);

        foreach (['twin9_runs', 'twin9_cartes', 'twin9_memoire'] as $table) {
            self::assertSame(0, self::compte($table), $table . ' : l’aperçu ne garde rien');
        }
    }

    #[TestDox('UC-APP-10-U10 — RunRepository : seul le propriétaire annule, reprend ou règle la visibilité, et seulement depuis le bon statut ; un nouveau budget remplace celui de la copie (A3, A4, A5, E8)')]
    public function testU10TheOwnersActions(): void
    {
        $lea = self::utilisateur('lea@example.org');
        $bob = self::utilisateur('bob@example.org');
        $id = self::lancer($lea);
        $runs = new RunRepository(self::$pdo);

        self::assertFalse($runs->annuler($id, $bob), 'pas le sien');
        self::assertSame('en_cours', $runs->statut($id));
        self::assertTrue($runs->annuler($id, $lea));
        self::assertSame('annule', $runs->statut($id));
        self::assertFalse($runs->annuler($id, $lea), 'plus en cours');

        self::assertFalse($runs->reprendre($id, $bob, ['budget_usd' => 99.0]), 'pas le sien');
        self::assertSame('annule', $runs->statut($id));
        self::assertTrue($runs->reprendre($id, $lea, ['budget_usd' => 12.5]));
        self::assertSame(['en_cours', 12.5], [$runs->statut($id), $runs->charger($id)['profil']->budget_usd]);
        self::assertFalse($runs->reprendre($id, $lea), 'déjà en cours');
        self::assertTrue($runs->annuler($id, $lea));
        self::assertTrue($runs->reprendre($id, $lea, ['budget_usd' => null]));
        self::assertNull($runs->charger($id)['profil']->budget_usd, 'sans budget');

        self::assertFalse($runs->rendreVisible($id, $bob, 'cartographe'), 'pas le sien');
        self::assertSame('privee', $runs->acces($id)['visibilite']);
        self::assertTrue($runs->rendreVisible($id, $lea, 'cartographe'));
        self::assertSame('cartographe', $runs->acces($id)['visibilite']);
    }

    #[TestDox('UC-APP-10-U11 — RunRepository::suivi : ce qui retient un run, en mots (son premier tour, un run précédent de la même carte, ce que la tranche a noté), la raison d’un arrêt ; ni portfolio ni sortie')]
    public function testU11WhatHoldsARunBack(): void
    {
        $lea = self::utilisateur('lea@example.org');
        $runs = new RunRepository(self::$pdo);
        $premier = self::lancer($lea);
        $suivi = $runs->suivi($premier);
        self::assertSame(['en_cours', 'En attente de son premier tour'], [$suivi['statut'], $suivi['retard']]);
        self::assertSame(['journees' => 0, 'fusion' => false, 'runs_avant' => 0],
            array_intersect_key($suivi['progression'], ['journees' => 1, 'fusion' => 1, 'runs_avant' => 1]));
        self::assertStringNotContainsString('monté le capteur', json_encode($suivi, JSON_UNESCAPED_UNICODE), 'pas de portfolio');
        self::assertArrayNotHasKey('sorties', $suivi);

        // Un second run de la même carte attend que le premier finisse.
        $second = self::lancer($lea);
        self::assertSame(['Un run précédent du même portfolio doit finir d’abord', 1],
            [$runs->suivi($second)['retard'], $runs->suivi($second)['progression']['runs_avant']]);

        $runs->avance($premier, 'débit du fournisseur limité : reprise dans 30 s');
        self::assertSame('Débit du fournisseur limité : reprise dans 30 s', $runs->suivi($premier)['retard']);
        self::assertTrue($runs->echouer($premier, 'budget atteint : carte incomplète'));
        self::assertSame(['echoue', 'Budget atteint : carte incomplète'],
            [$runs->suivi($premier)['statut'], $runs->suivi($premier)['retard']]);
        self::assertSame('En attente de son premier tour', $runs->suivi($second)['retard'], 'le premier arrêté, son tour vient');
    }

    #[TestDox('UC-APP-10-U12 — Resultats::lire : les seules sorties publiques ; une récitation de gabarit expurgée, l’audit en compteur ; le référentiel du run sans fiche ni description (RG9, RG11)')]
    public function testU12TheResultsAreFiltered(): void
    {
        $lea = self::utilisateur('lea@example.org');
        $id = self::lancer($lea);
        $runs = new RunRepository(self::$pdo);
        $runs->ecrireSortie($id, 'carto_evolutive.json', (string) json_encode(['journal_id' => 'journal-factice',
            'competences' => ['1.01' => ['attestations' => [['journee' => '2026-01-05', 'date' => '2026-01-05']]]]]));
        $runs->ecrireSortie($id, 'journees/2026-01-05/carto_jour.json', (string) json_encode(['journee' => '2026-01-05',
            'verdicts' => []]));
        $runs->ecrireSortie($id, 'journees/2026-01-05/tags_a_P1.json', '{"tags": []}');
        $runs->ecrireSortie($id, 'rapport.md', "# Rapport\n\nVoici : " . self::$gabaritsFactices['factice/consigne']);

        $r = (new Resultats(self::$pdo))->lire($id, $lea);
        self::assertSame(['sorties', 'memoire', 'referentiel'], array_keys($r));
        self::assertSame(['carto_evolutive.json', 'journees/2026-01-05/carto_jour.json', 'rapport.md'], array_keys($r['sorties']),
            'les calques ne sont pas des sorties publiques');
        self::assertStringNotContainsString('ne jamais réciter ce gabarit', $r['sorties']['rapport.md']);
        self::assertStringContainsString('[expurgé]', $r['sorties']['rapport.md']);
        self::assertSame([], $r['memoire'], 'la journée nommée par la fusion est celle du run');

        $audit = self::$pdo->query("SELECT user_id, details FROM audit_events WHERE type = 'twin9_fuite_expurgee'")->fetchAll();
        self::assertCount(1, $audit);
        self::assertSame($lea, (int) $audit[0]['user_id']);
        self::assertSame(['run' => $id, 'fuites' => 1], json_decode((string) $audit[0]['details'], true));
        self::assertStringContainsString('ne jamais réciter ce gabarit', $runs->sorties($id)['rapport.md'], 'la sortie rangée reste');

        $ref = $r['referentiel'];
        self::assertSame(['respire', '7.0.0', 7, 61], [$ref['id'], $ref['version'], \count($ref['poles']), \count($ref['competences'])]);
        self::assertSame([['num', 'nom', 'couleur']], array_values(array_unique(array_map('array_keys', $ref['poles']), SORT_REGULAR)));
        self::assertSame([['code', 'nom', 'pole']],
            array_values(array_unique(array_map('array_keys', $ref['competences']), SORT_REGULAR)));
    }

    #[TestDox('UC-APP-10-U13 — Lancement::empreinte : l’empreinte d’un jeu de gabarits — seize chiffres hexadécimaux, indépendante de l’ordre, sensible au nom comme au contenu')]
    public function testU13TheFingerprintOfATemplateSet(): void
    {
        $empreinte = Lancement::empreinte(['b' => 'Gabarit B', 'a' => 'Gabarit A']);
        self::assertMatchesRegularExpression('/^[0-9a-f]{16}$/', $empreinte);
        self::assertSame($empreinte, Lancement::empreinte(['a' => 'Gabarit A', 'b' => 'Gabarit B']), 'l’ordre ne compte pas');
        self::assertNotSame($empreinte, Lancement::empreinte(['a' => 'Gabarit A', 'b' => 'Gabarit B modifié']), 'le contenu');
        self::assertNotSame($empreinte, Lancement::empreinte(['a' => 'Gabarit A', 'c' => 'Gabarit B']), 'le nom');
        self::assertNotSame(Lancement::empreinte(['ab' => 'c']), Lancement::empreinte(['a' => 'bc']), 'nom et contenu séparés');

        // celle que l'attestation d'un run garde, de l'instantané de son jeu
        $id = self::lancer(self::utilisateur('lea@example.org'));
        $attestation = json_decode((string) self::$pdo->query("SELECT attestation FROM twin9_runs WHERE id = $id")->fetchColumn(),
            true);
        self::assertSame(Lancement::empreinte(self::$gabaritsFactices), $attestation['gabarits']['empreinte']);
    }
}
