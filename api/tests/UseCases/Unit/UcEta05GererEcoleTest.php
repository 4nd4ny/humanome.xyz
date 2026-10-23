<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Env;
use Humanome\Etablissement\EcoleCles;
use Humanome\Etablissement\Ecoles;
use Humanome\Etablissement\GrandLivreLocal;
use Humanome\Etablissement\Payeur;
use Humanome\Etablissement\Payeurs;
use Humanome\Etablissement\PlafondAtteintException;
use Humanome\MigrationRunner;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\EcolesSupport;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\RunPayeur;
use Humanome\Twin9\SoldeInsuffisantException;
use Humanome\Twin9\Twin9Config;
use Humanome\Twin9\Twin9Exception;
use Humanome\Packages\SettingsRepository;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-ETA-05 — Gérer son école (crédit, surtaxe, plafond par élève, clé) :
 * tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/etablissement/UC-ETA-05-gerer-ecole.md
 *
 * Les classes de l'école (sprint 6, lot S6b — ADR-013 §3, §4) sont appelées
 * directement, sans couche HTTP : Ecoles (surtaxe bornée, plafond, écoles
 * d'un compte, élèves et dépenses), EcoleCles (clé chiffrée, jamais rendue),
 * GrandLivreLocal (plafond puis crédit, atomiquement, dans le mois de la
 * réserve ; sous des processus concurrents), Payeurs (qui paie, élève de deux
 * écoles), RunPayeur (ce que paie un run). Aucune donnée réelle, aucune vraie
 * clé : des valeurs inventées.
 */
final class UcEta05GererEcoleTest extends TestCase
{
    use EcolesSupport;

    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    protected function setUp(): void
    {
        self::$pdo->exec('DELETE FROM users');
    }

    #[TestDox('UC-ETA-05-U01 — surtaxe bornée : de 3,5 % à 10 %, au centième ; 3,49, 10,01, 3,555, une chaîne, NaN refusés')]
    public function testU01TheSurtaxIsBounded(): void
    {
        foreach ([3.5, 4, 10, 7.25, 10.0, 3.51] as $ok) {
            self::assertNotNull(Ecoles::surtaxe($ok), (string) $ok);
        }
        self::assertSame(3.5, Ecoles::surtaxe(3.5));
        self::assertNull(Ecoles::surtaxe(3), '3 % est sous le plancher');
        foreach ([3.49, 10.01, 3.555, 0, -5, 11, '5', null, NAN, INF, true] as $refus) {
            self::assertNull(Ecoles::surtaxe($refus), var_export($refus, true));
        }
    }

    #[TestDox('UC-ETA-05-U02 — plafond par élève : en dollars au centime, de 0 à 100 000 ; négatif, millième, au-delà refusés')]
    public function testU02TheCapPerLearner(): void
    {
        self::assertSame(0, Ecoles::plafond(0));
        self::assertSame(12_340_000, Ecoles::plafond(12.34));
        self::assertSame(100_000_000_000, Ecoles::plafond(100000));
        foreach ([-0.01, 1.234, 100000.01, '5', null, NAN] as $refus) {
            self::assertNull(Ecoles::plafond($refus), var_export($refus, true));
        }
    }

    #[TestDox('UC-ETA-05-U03 — réglages : défauts sans ligne (3,5 %, plafond 0) ; écrits à la première écriture ; la base refuse une surtaxe hors bornes ; le facteur d’un run : 1 + surtaxe sur le crédit, 1,0 sur la clé')]
    public function testU03SettingsDefaultsAndFactor(): void
    {
        $ecole = self::compte(self::$pdo, 'École des Tilleuls', ['etablissement']);
        $ecoles = new Ecoles(self::$pdo);
        self::assertSame(['surtaxe_pct' => 3.5, 'plafond_eleve_microusd' => 0, 'respire_numero' => null],
            $ecoles->reglages($ecole));
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM ecoles')->fetchColumn(), 'aucune ligne avant');
        self::assertSame(1.035, $ecoles->facteur($ecole, 'instance'));

        self::assertSame(['surtaxe_pct' => 7.25, 'plafond_eleve_microusd' => 5_000_000, 'respire_numero' => null],
            $ecoles->regler($ecole, 7.25, 5_000_000));
        self::assertSame(1.0725, $ecoles->facteur($ecole, 'instance'));
        self::assertSame(1.0, $ecoles->facteur($ecole, 'ecole'), 'sur sa clé, l’école ne paie rien à la plateforme');

        try {
            $ecoles->regler($ecole, 3.49, 0);
            self::fail('3,49 % accepté');
        } catch (\InvalidArgumentException) {
        }
        // the base itself refuses it (CHECK of migration 037)
        try {
            self::$pdo->prepare('UPDATE ecoles SET surtaxe_pct = 10.01 WHERE user_id = ?')->execute([$ecole]);
            self::fail('la base accepte 10,01 %');
        } catch (\PDOException $e) {
            self::assertSame('HY000', $e->getCode());
        }
        self::assertSame(7.25, $ecoles->reglages($ecole)['surtaxe_pct']);
    }

    #[TestDox('UC-ETA-05-U04 — écoles d’un compte : celles dont une cohorte le compte (habilitation en vigueur), lui-même d’abord s’il est une école ; une habilitation retirée l’exclut')]
    public function testU04TheSchoolsOfAnAccount(): void
    {
        $a = self::ecole(self::$pdo, 'École A');
        $b = self::ecole(self::$pdo, 'École B');
        $eleve = self::compte(self::$pdo, 'Léa');
        $ecoles = new Ecoles(self::$pdo);
        self::assertSame([], $ecoles->de($eleve));

        self::inscrire(self::$pdo, $a, $eleve);
        self::inscrire(self::$pdo, $b, $eleve, 'BTS');
        self::inscrire(self::$pdo, $b, $eleve, 'Licence');
        self::assertSame([['id' => $a, 'nom' => 'École A', 'soi' => false], ['id' => $b, 'nom' => 'École B', 'soi' => false]],
            $ecoles->de($eleve), 'une école par école, quelles que soient ses cohortes');
        self::assertTrue($ecoles->paiePour($b, $eleve));
        self::assertSame([['id' => $a, 'nom' => 'École A', 'soi' => true]], $ecoles->de($a), 'une école paie pour elle-même');

        // the administrator withdraws B's habilitation: it no longer pays, at once
        self::$pdo->prepare('DELETE FROM user_roles WHERE user_id = ?')->execute([$b]);
        self::assertSame([$a], array_column($ecoles->de($eleve), 'id'));
        self::assertFalse($ecoles->paiePour($b, $eleve));
    }

    #[TestDox('UC-ETA-05-U05 — réserve d’une école : le plafond de l’élève d’abord, puis le crédit ; l’événement nomme l’élève ; plafond 0 par défaut : rien ne passe')]
    public function testU05AReservationHoldsTheCapThenTheCredit(): void
    {
        $ecole = self::ecole(self::$pdo, 'École des Tilleuls', 5.0, 0.0, 10_000_000);
        $eleve = self::compte(self::$pdo, 'Léa');
        self::inscrire(self::$pdo, $ecole, $eleve);
        $grandLivre = new GrandLivreLocal(self::$pdo);
        $mois = Ecoles::mois();

        try {
            $grandLivre->reserver($ecole, $eleve, $mois, 1, true, 'essai (réserve)');
            self::fail('un plafond de 0 laisse passer');
        } catch (PlafondAtteintException $e) {
            self::assertSame([0, 1], [$e->reste(), $e->requis()]);
        }
        self::assertSame(10_000_000, self::solde(self::$pdo, $ecole), 'rien débité');

        (new Ecoles(self::$pdo))->regler($ecole, 5.0, 3_000_000);
        $grandLivre->reserver($ecole, $eleve, $mois, 2_000_000, true, 'essai (réserve)', 'claude-sonnet-5');
        self::assertSame([2_000_000, 8_000_000], [self::engage(self::$pdo, $ecole, $eleve), self::solde(self::$pdo, $ecole)]);
        $event = self::$pdo->query('SELECT user_id, kind, amount_microusd, beneficiaire_id FROM twin9_credit_events
                                     ORDER BY id DESC LIMIT 1')->fetch();
        self::assertSame([$ecole, 'debit', -2_000_000, $eleve], [(int) $event['user_id'], $event['kind'],
            (int) $event['amount_microusd'], (int) $event['beneficiaire_id']], 'l’école voit ce que l’élève a engagé');
        self::assertSame(0, self::solde(self::$pdo, $eleve), 'l’élève ne paie rien');

        // beyond the cap: refused, nothing held, nothing debited
        try {
            $grandLivre->reserver($ecole, $eleve, $mois, 1_000_001, true, 'essai (réserve)');
            self::fail('au-delà du plafond');
        } catch (PlafondAtteintException $e) {
            self::assertSame(1_000_000, $e->reste());
        }
        self::assertSame([2_000_000, 8_000_000], [self::engage(self::$pdo, $ecole, $eleve), self::solde(self::$pdo, $ecole)]);
    }

    #[TestDox('UC-ETA-05-U06 — crédit de l’école insuffisant : le plafond n’est pas tenu non plus (une seule transaction) ; sur la clé de l’école, le plafond seul ; une école pour elle-même n’a pas de plafond')]
    public function testU06BothOrNeither(): void
    {
        $ecole = self::ecole(self::$pdo, 'École des Tilleuls', 3.5, 100.0, 1_000_000);
        $eleve = self::compte(self::$pdo, 'Léa');
        self::inscrire(self::$pdo, $ecole, $eleve);
        $grandLivre = new GrandLivreLocal(self::$pdo);
        $mois = Ecoles::mois();

        try {
            $grandLivre->reserver($ecole, $eleve, $mois, 2_000_000, true, 'essai (réserve)');
            self::fail('crédit insuffisant accepté');
        } catch (SoldeInsuffisantException) {
        }
        self::assertSame([0, 1_000_000], [self::engage(self::$pdo, $ecole, $eleve), self::solde(self::$pdo, $ecole)],
            'ni le plafond ni le crédit');

        // on its own key: the cap alone, the credit untouched
        $grandLivre->reserver($ecole, $eleve, $mois, 2_000_000, false, 'essai (réserve)');
        self::assertSame([2_000_000, 1_000_000], [self::engage(self::$pdo, $ecole, $eleve), self::solde(self::$pdo, $ecole)]);

        // a school for itself: its credit alone, no cap row
        $grandLivre->reserver($ecole, null, $mois, 400_000, true, 'essai (réserve)');
        self::assertSame(600_000, self::solde(self::$pdo, $ecole));
        self::assertSame(1, (int) self::$pdo->query('SELECT COUNT(*) FROM ecole_consommations')->fetchColumn());

        // a caller's transaction rolled back undoes both
        self::$pdo->beginTransaction();
        $grandLivre->reserver($ecole, $eleve, $mois, 100_000, true, 'essai (réserve)');
        self::$pdo->rollBack();
        self::assertSame([2_000_000, 600_000], [self::engage(self::$pdo, $ecole, $eleve), self::solde(self::$pdo, $ecole)]);
    }

    #[TestDox('UC-ETA-05-U07 — règlement : rendu sur le plafond du mois de la réserve et sur le crédit, avec les jetons ; jamais sous zéro')]
    public function testU07SettlementInTheMonthOfTheReservation(): void
    {
        $ecole = self::ecole(self::$pdo, 'École des Tilleuls', 3.5, 10.0, 10_000_000);
        $eleve = self::compte(self::$pdo, 'Léa');
        self::inscrire(self::$pdo, $ecole, $eleve);
        $grandLivre = new GrandLivreLocal(self::$pdo);
        $mois = Ecoles::mois();
        $avant = Ecoles::mois(strtotime(gmdate('Y-m-01') . ' -1 day UTC'));
        self::assertNotSame($mois, $avant);
        $grandLivre->reserver($ecole, $eleve, $avant, 3_000_000, true, 'essai (réserve)');
        $grandLivre->reserver($ecole, $eleve, $mois, 1_000_000, true, 'essai (réserve)');

        $grandLivre->regler($ecole, $eleve, $avant, 2_500_000, true, 'essai (réconciliation)', 'claude-sonnet-5', 100, 20);
        $ecoles = new Ecoles(self::$pdo);
        self::assertSame([500_000, 1_000_000], [$ecoles->engage($ecole, $eleve, $avant), $ecoles->engage($ecole, $eleve, $mois)],
            'le mois de la réserve, pas le mois courant');
        self::assertSame(10_000_000 - 4_000_000 + 2_500_000, self::solde(self::$pdo, $ecole));
        $event = self::$pdo->query('SELECT kind, tokens_in, tokens_out, beneficiaire_id FROM twin9_credit_events
                                     ORDER BY id DESC LIMIT 1')->fetch();
        self::assertSame(['adjust', 100, 20, $eleve], [$event['kind'], (int) $event['tokens_in'], (int) $event['tokens_out'],
            (int) $event['beneficiaire_id']]);
        $grandLivre->regler($ecole, $eleve, $avant, 9_000_000, false, 'essai (remboursement)');
        self::assertSame(0, $ecoles->engage($ecole, $eleve, $avant), 'jamais sous zéro');
    }

    #[TestDox('UC-ETA-05-U08 — concurrence du débit : quatre processus, vingt réserves sur un plafond de dix → dix passent, ni plafond ni crédit dépassés ; crédit pour sept → sept passent, le plafond suit')]
    public function testU08ConcurrentReservationsNeverOvershoot(): void
    {
        $montant = 100_000;
        $ecole = self::ecole(self::$pdo, 'École des Tilleuls', 3.5, 1.0, 50 * $montant); // plafond : 10 réserves
        $eleve = self::compte(self::$pdo, 'Léa');
        self::inscrire(self::$pdo, $ecole, $eleve);
        $mois = Ecoles::mois();

        $issues = self::enParallele(4, $ecole, $eleve, $mois, $montant, 5);
        self::assertSame(20, array_sum(array_column($issues, 'passes')) + array_sum(array_column($issues, 'refus')));
        self::assertSame(10, array_sum(array_column($issues, 'passes')), 'exactement ce que le plafond tient');
        self::assertSame(10 * $montant, self::engage(self::$pdo, $ecole, $eleve));
        self::assertSame(40 * $montant, self::solde(self::$pdo, $ecole));
        self::assertSame(10, (int) self::$pdo->query("SELECT COUNT(*) FROM twin9_credit_events WHERE kind = 'debit'")
            ->fetchColumn(), 'un événement par réserve passée');

        // the credit binding: seven pass, and the cap holds what passed only
        $ecole2 = self::ecole(self::$pdo, 'École des Platanes', 3.5, 100.0, 7 * $montant);
        self::inscrire(self::$pdo, $ecole2, $eleve);
        $issues = self::enParallele(4, $ecole2, $eleve, $mois, $montant, 5);
        self::assertSame(7, array_sum(array_column($issues, 'passes')));
        self::assertSame([7 * $montant, 0], [self::engage(self::$pdo, $ecole2, $eleve), self::solde(self::$pdo, $ecole2)]);
    }

    /**
     * $processus PHP processes on their own connections, started together,
     * each holding $n reservations (tests/fixtures/ecoles/reserver.php).
     *
     * @return list<array{passes: int, refus: int}>
     */
    private static function enParallele(int $processus, int $ecole, int $eleve, string $mois, int $montant, int $n): array
    {
        $script = \dirname(__DIR__, 2) . '/fixtures/ecoles/reserver.php';
        $depart = microtime(true) + 1.5;
        $env = ['DB_TEST_NAME' => TestDb::name(), 'DB_HOST' => Env::get('DB_HOST', 'mysql'),
                'DB_PORT' => Env::get('DB_PORT', '3306'), 'DB_ROOT_PASSWORD' => Env::get('DB_ROOT_PASSWORD', 'root_dev'),
                'PATH' => (string) getenv('PATH')];
        $enfants = [];
        for ($i = 0; $i < $processus; $i++) {
            $tubes = [];
            $p = proc_open([PHP_BINARY, $script, (string) $ecole, (string) $eleve, $mois, (string) $montant, (string) $n,
                sprintf('%.3f', $depart)], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $tubes, null, $env);
            self::assertIsResource($p);
            $enfants[] = [$p, $tubes];
        }
        $issues = [];
        foreach ($enfants as [$p, $tubes]) {
            $sortie = (string) stream_get_contents($tubes[1]);
            $erreurs = (string) stream_get_contents($tubes[2]);
            fclose($tubes[1]);
            fclose($tubes[2]);
            self::assertSame(0, proc_close($p), $erreurs);
            $issues[] = json_decode($sortie, true, 512, JSON_THROW_ON_ERROR);
        }

        return $issues;
    }

    #[TestDox('UC-ETA-05-U09 — clé de l’école : chiffrée au repos, relue pour un appel seulement, listée sans matériau ; Anthropic seul ; retirée pour de bon')]
    public function testU09TheSchoolsKey(): void
    {
        $ecole = self::ecole(self::$pdo, 'École des Tilleuls');
        $master = random_bytes(SODIUM_CRYPTO_SECRETBOX_KEYBYTES);
        $cles = new EcoleCles(self::$pdo, $master);
        self::assertFalse(EcoleCles::presente(self::$pdo, $ecole));

        $cles->poser($ecole, 'anthropic', 'sk-ant-ecole-fictive-0001');
        self::assertTrue(EcoleCles::presente(self::$pdo, $ecole));
        $liste = EcoleCles::liste(self::$pdo, $ecole);
        self::assertSame(['fournisseur', 'poseeLe'], array_keys($liste[0]));
        self::assertStringNotContainsString('sk-ant', json_encode($liste, JSON_THROW_ON_ERROR));
        $blob = (string) self::$pdo->query('SELECT encrypted_key FROM ecole_cles')->fetchColumn();
        self::assertStringNotContainsString('sk-ant-ecole', $blob);
        self::assertSame('sk-ant-ecole-fictive-0001', $cles->lire($ecole));
        self::assertNull((new EcoleCles(self::$pdo, random_bytes(SODIUM_CRYPTO_SECRETBOX_KEYBYTES)))->lire($ecole),
            'une clé maîtresse tournée ne la déchiffre plus');

        try {
            $cles->poser($ecole, 'openai', 'sk-fictive');
            self::fail('une clé d’école chez OpenAI');
        } catch (\InvalidArgumentException) {
        }
        self::assertTrue(EcoleCles::retirer(self::$pdo, $ecole, 'anthropic'));
        self::assertFalse(EcoleCles::retirer(self::$pdo, $ecole, 'anthropic'));
        self::assertNull($cles->lire($ecole));
    }

    #[TestDox('UC-ETA-05-U10 — qui paie : son école par défaut quand il n’en a qu’une, sinon son solde ; deux écoles : il choisit (422 sans choix) ; une école qui ne paie pas pour lui, la clé d’école sans clé ou sans école : 422')]
    public function testU10WhoPays(): void
    {
        $a = self::ecole(self::$pdo, 'École A', 4.0);
        $b = self::ecole(self::$pdo, 'École B', 10.0);
        $autre = self::ecole(self::$pdo, 'École C');
        $eleve = self::compte(self::$pdo, 'Léa');
        $payeurs = new Payeurs(self::$pdo);

        self::assertSame(Payeur::PERSONNEL, $payeurs->resoudre($eleve, null, 'instance')->type, 'sans école, son solde');
        self::inscrire(self::$pdo, $a, $eleve);
        $payeur = $payeurs->resoudre($eleve, null, 'instance');
        self::assertSame([Payeur::ECOLE, $a, 1.04, 'École A'], [$payeur->type, $payeur->ecoleId, $payeur->facteur, $payeur->nom]);
        self::assertSame(Payeur::PERSONNEL, $payeurs->resoudre($eleve, 'personnel', 'instance')->type, 'son solde, s’il le choisit');

        // a learner of two schools chooses (ADR-013 §4)
        self::inscrire(self::$pdo, $b, $eleve);
        self::refuse(fn () => $payeurs->resoudre($eleve, null, 'instance'), Payeurs::CHOISIR);
        self::assertSame([$b, 1.1], [$payeurs->resoudre($eleve, $b, 'instance')->ecoleId,
            $payeurs->resoudre($eleve, $b, 'instance')->facteur]);
        self::refuse(fn () => $payeurs->resoudre($eleve, $autre, 'instance'), Payeurs::NE_PAIE_PAS);
        self::refuse(fn () => $payeurs->resoudre($eleve, '12', 'instance'), Payeurs::INVALIDE);

        // the school's lane: a school with a key; never its own balance
        self::refuse(fn () => $payeurs->resoudre($eleve, $a, 'ecole'), Payeurs::SANS_CLE);
        self::refuse(fn () => $payeurs->resoudre($eleve, 'personnel', 'ecole'), Payeurs::CLE_SANS_ECOLE);
        (new EcoleCles(self::$pdo, random_bytes(SODIUM_CRYPTO_SECRETBOX_KEYBYTES)))->poser($b, 'anthropic', 'sk-ant-fictive-b');
        $payeur = $payeurs->resoudre($eleve, null, 'ecole');
        self::assertSame([$b, 1.0], [$payeur->ecoleId, $payeur->facteur], 'la seule de ses écoles qui a une clé, à 1,0');

        // the open cartography: the school's key when it has one, else the instance's from its credit
        self::assertSame(['ecole', 1.0], [$payeurs->pourCartographieOuverte($eleve, $b)['cle'],
            $payeurs->pourCartographieOuverte($eleve, $b)['payeur']->facteur]);
        self::assertSame(['instance', 1.04], [$payeurs->pourCartographieOuverte($eleve, $a)['cle'],
            $payeurs->pourCartographieOuverte($eleve, $a)['payeur']->facteur]);
    }

    #[TestDox('UC-ETA-05-U11 — l’école paie encore ? sa disparition, son habilitation retirée, l’élève parti, sa clé retirée sur la voie école, un facteur manquant : non, avec la raison')]
    public function testU11StillPaying(): void
    {
        $ecole = self::ecole(self::$pdo, 'École des Tilleuls');
        $eleve = self::compte(self::$pdo, 'Léa');
        $cohorte = self::inscrire(self::$pdo, $ecole, $eleve);
        $payeurs = new Payeurs(self::$pdo);
        self::assertNull($payeurs->encorePaie($eleve, $ecole, 'instance', 1.035));
        self::assertSame(Payeurs::NE_PAIE_PLUS, $payeurs->encorePaie($eleve, null, 'instance', 1.035), 'école purgée');
        self::assertSame(Payeurs::NE_PAIE_PLUS, $payeurs->encorePaie($eleve, $ecole, 'instance', null), 'sans facteur');
        self::assertSame(Payeurs::NE_PAIE_PLUS . ' : elle a retiré sa clé', $payeurs->encorePaie($eleve, $ecole, 'ecole', 1.0));
        self::$pdo->prepare('DELETE FROM cohorte_membres WHERE cohorte_id = ? AND user_id = ?')->execute([$cohorte, $eleve]);
        self::assertSame(Payeurs::NE_PAIE_PLUS, $payeurs->encorePaie($eleve, $ecole, 'instance', 1.035), 'l’élève a quitté');
        self::assertNull($payeurs->encorePaie($ecole, $ecole, 'instance', 1.035), 'une école pour elle-même');
    }

    #[TestDox('UC-ETA-05-U12 — ce que paie un run : son propriétaire (marge vivante), son école sur son crédit (facteur figé, plafond de l’élève), sur sa clé (1,0, plafond seul, sa clé), une école pour elle-même (sans plafond), une école disparue (rien à débiter)')]
    public function testU12WhatARunPays(): void
    {
        $config = new Twin9Config(new SettingsRepository(self::$pdo));
        $perso = new RunPayeur(7, 'instance');
        self::assertSame([7, null, true, true, 7], [$perso->compte(), $perso->eleve(), $perso->prix(), $perso->reserve(),
            $perso->titulaire()]);
        self::assertSame($config->marge(), $perso->marge($config));
        $ecole = new RunPayeur(7, 'instance', Payeur::ECOLE, 3, 1.035);
        self::assertSame([3, 7, 1.035, true, 7], [$ecole->compte(), $ecole->eleve(), $ecole->prix(), $ecole->reserve(),
            $ecole->titulaire()]);
        $cle = new RunPayeur(7, 'ecole', Payeur::ECOLE, 3, 1.0);
        self::assertSame([null, 7, 1.0, true, 3, false], [$cle->compte(), $cle->eleve(), $cle->prix(), $cle->reserve(),
            $cle->titulaire(), $cle->instance()]);
        $soi = new RunPayeur(3, 'ecole', Payeur::ECOLE, 3, 1.0);
        self::assertSame([null, null, false], [$soi->compte(), $soi->eleve(), $soi->reserve()], 'sa clé, son affaire');
        $partie = new RunPayeur(7, 'instance', Payeur::ECOLE, null, 1.035);
        self::assertSame([null, null, false], [$partie->compte(), $partie->eleve(), $partie->reserve()],
            'jamais le solde de l’élève à sa place');
        $personnelle = new RunPayeur(7, 'personnelle');
        self::assertSame([null, false, 1.0], [$personnelle->compte(), $personnelle->prix(), $personnelle->marge($config)]);
    }

    #[TestDox('UC-ETA-05-U13 — élèves d’une école : chaque membre une fois, ses cohortes, ce qu’il a engagé ce mois-ci et en tout ; possibles d’un élève : ce que son école peut encore payer, jamais son solde')]
    public function testU13LearnersAndTheirSpend(): void
    {
        $ecole = self::ecole(self::$pdo, 'École des Tilleuls', 3.5, 5.0, 3_000_000);
        $lea = self::compte(self::$pdo, 'Léa');
        $noe = self::compte(self::$pdo, 'Noé');
        self::inscrire(self::$pdo, $ecole, $lea, 'BTS');
        self::inscrire(self::$pdo, $ecole, $lea, 'Licence');
        self::inscrire(self::$pdo, $ecole, $noe, 'BTS');
        $grandLivre = new GrandLivreLocal(self::$pdo);
        $grandLivre->reserver($ecole, $lea, Ecoles::mois(), 1_200_000, true, 'essai (réserve)');
        $grandLivre->reserver($ecole, $lea, '2026-01', 300_000, false, 'essai (réserve)');

        $eleves = (new Ecoles(self::$pdo))->eleves($ecole, Ecoles::mois());
        self::assertSame([
            ['userId' => $lea, 'displayName' => 'Léa', 'cohortes' => ['BTS', 'Licence'], 'membre' => true,
             'moisMicrousd' => 1_200_000, 'totalMicrousd' => 1_500_000],
            ['userId' => $noe, 'displayName' => 'Noé', 'cohortes' => ['BTS'], 'membre' => true,
             'moisMicrousd' => 0, 'totalMicrousd' => 0],
        ], $eleves);

        $possibles = (new Payeurs(self::$pdo))->possibles($lea);
        self::assertCount(1, $possibles, 'sans solde, son école seule');
        self::assertSame(['type' => 'ecole', 'id' => $ecole, 'nom' => 'École des Tilleuls', 'soi' => false, 'cle' => false,
                          'mois' => Ecoles::mois(), 'plafond_microusd' => 5_000_000, 'engage_microusd' => 1_200_000,
                          'reste_credit_microusd' => 1_800_000, 'reste_cle_microusd' => 3_800_000], $possibles[0],
            'son plafond restant, borné par le crédit de l’école — jamais le crédit lui-même');
        (new CreditService(self::$pdo))->adjust($lea, 2_000_000, 'solde acheté avant');
        self::assertSame(['type' => 'personnel', 'solde_microusd' => 2_000_000], (new Payeurs(self::$pdo))->possibles($lea)[1]);
        self::assertSame([['type' => 'ecole', 'soi' => true]], array_map(
            static fn (array $p): array => ['type' => $p['type'], 'soi' => $p['soi']],
            (new Payeurs(self::$pdo))->possibles($ecole)), 'une école paie pour elle-même, comme une école');
    }

    #[TestDox('UC-ETA-05-U18 — règlement après le départ de l’élève (son compte supprimé pendant un appel de la cartographie ouverte) : le crédit de l’école est rendu quand même, l’événement sans bénéficiaire')]
    public function testU18ASettlementOutlivesTheLearnersAccount(): void
    {
        $ecole = self::ecole(self::$pdo, 'École des Tilleuls', 3.5, 10.0, 10_000_000);
        $eleve = self::compte(self::$pdo, 'Léa');
        self::inscrire(self::$pdo, $ecole, $eleve);
        $grandLivre = new GrandLivreLocal(self::$pdo);
        $grandLivre->reserver($ecole, $eleve, Ecoles::mois(), 1_000_000, true, 'twin6/cartographie (réserve)');
        self::$pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$eleve]);

        $grandLivre->regler($ecole, $eleve, Ecoles::mois(), 600_000, true, 'twin6/cartographie (réconciliation)',
            'claude-sonnet-5', 100, 20);

        self::assertSame(10_000_000 - 400_000, self::solde(self::$pdo, $ecole), 'rendu à l’école');
        $event = self::$pdo->query('SELECT amount_microusd, beneficiaire_id FROM twin9_credit_events ORDER BY id DESC LIMIT 1')
            ->fetch();
        self::assertSame([600_000, null], [(int) $event['amount_microusd'], $event['beneficiaire_id']]);
    }

    private static function refuse(\Closure $f, string $message): void
    {
        try {
            $f();
            self::fail('accepté : ' . $message);
        } catch (Twin9Exception $e) {
            self::assertSame([422, $message], [$e->getStatusCode(), $e->getMessage()]);
        }
    }
}
