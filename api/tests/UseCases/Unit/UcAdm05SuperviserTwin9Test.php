<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Auth\Users;
use Humanome\MigrationRunner;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\TestDb;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\FactureService;
use Humanome\Twin9\Twin9Config;
use Humanome\Twin9\Twin9Exception;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-ADM-05 — Superviser Twin9 : tests UNITAIRES (API).
 *
 * Fiche : docs/cas-utilisation/administration/UC-ADM-05-superviser-twin9.md
 *
 * Twin9Config (lecture effective, mise à jour partielle validée, bornes) et
 * FactureService::comptes (table de supervision) sont appelés directement,
 * sur la base de test dédiée.
 */
final class UcAdm05SuperviserTwin9Test extends TestCase
{
    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    protected function setUp(): void
    {
        self::$pdo->exec('DELETE FROM users');
        self::$pdo->exec("DELETE FROM settings WHERE name = 'twin9_config'");
    }

    private static function config(): Twin9Config
    {
        return new Twin9Config(new SettingsRepository(self::$pdo));
    }

    private static function stored(): ?array
    {
        return (new SettingsRepository(self::$pdo))->get(Twin9Config::SETTING_KEY);
    }

    #[TestDox('UC-ADM-05-U08 — mise à jour PARTIELLE : fusion avec l’existant, persistance de la configuration COMPLÈTE (défauts figés) dans settings, clés inconnues refusées sans rien écrire')]
    public function testU08PartialUpdateIsMergedAndPersisted(): void
    {
        self::assertNull(self::stored(), 'aucun réglage stocké : défauts');
        $next = self::config()->update(['marge' => 1.5, 'twin9_cle_perso_ouverte' => true]);
        self::assertSame(1.5, $next['marge']);
        self::assertSame(1.1, $next['marge_twin6'], 'clé non fournie conservée');
        self::assertSame(1.5, self::config()->marge());
        self::assertTrue(self::config()->clePersoOuverte());
        self::assertSame(1.5, self::stored()['marge']);
        // La configuration effective COMPLÈTE est persistée, défauts compris : une
        // évolution ultérieure de defaults() ne s'appliquera plus à ces clés.
        self::assertEqualsCanonicalizing(array_keys(Twin9Config::defaults()), array_keys(self::stored()));
        self::assertEquals(Twin9Config::defaults()['packs'], self::stored()['packs']);

        try {
            self::config()->update(['marge' => 2.0, 'surtaxe' => 3]);
            self::fail('clé inconnue acceptée');
        } catch (Twin9Exception $e) {
            self::assertSame([422, 'Clé de configuration inconnue : surtaxe'], [$e->getStatusCode(), $e->getMessage()]);
        }
        self::assertSame(1.5, self::config()->marge(), 'rien écrit');
    }

    #[TestDox('UC-ADM-05-U09 — bornes : contributions 1 à 5, packs 1 à 500 USD avec libellé, prix > 0, booléen ; un modèle ne porte que ses prix ; les réglages retirés le 2026-10-20 (interrupteur, rythme, pipeline) sont des clés inconnues')]
    public function testU09Bounds(): void
    {
        foreach ([
            ['marge' => 1],
            ['marge' => 5.0],
            ['marge_twin6' => 1.0],
            ['packs' => [['montant_usd' => 1, 'libelle' => 'min'], ['montant_usd' => 500, 'libelle' => 'max']]],
            ['modeles' => ['m' => ['prix_usd_mtok' => [0.25, 1.25], 'palier_long' => ['au_dela_de' => 1000, 'prix_usd_mtok' => [1, 2]]]]],
            ['modeles' => ['m' => ['prix_usd_mtok' => [0.25, 1.25]]]],
        ] as $ok) {
            self::config()->update($ok);
        }
        $valide = self::stored();

        $ko = [
            [['marge' => 0.99], 'Marge hors bornes (entre 1 et 5)'],
            [['marge' => 5.01], 'Marge hors bornes (entre 1 et 5)'],
            [['marge' => '1.5'], 'Marge invalide : nombre attendu'],
            [['marge_twin6' => 6], 'Marge Twin6 hors bornes (entre 1 et 5)'],
            [['twin9_cle_perso_ouverte' => 1], 'Champ twin9_cle_perso_ouverte invalide : booléen attendu'],
            [['packs' => []], 'Packs invalides : liste non vide attendue'],
            [['packs' => ['a' => ['montant_usd' => 10, 'libelle' => 'x']]], 'Packs invalides : liste non vide attendue'],
            [['packs' => [['montant_usd' => 10, 'libelle' => '  ']]], 'Pack invalide : libellé requis'],
            [['modeles' => []], 'Modèles invalides : au moins un modèle requis'],
            [['modeles' => ['m' => ['prix_usd_mtok' => [1]]]], 'Prix invalide : [entrée, sortie] attendu'],
            [['modeles' => ['m' => ['prix_usd_mtok' => [1, -2]]]], 'Prix invalide : nombre strictement positif attendu'],
            [['modeles' => ['m' => ['prix_usd_mtok' => [1, 2], 'etages' => ['taggers']]]], 'Modèle m : clé inconnue etages'],
            [['modeles' => ['m' => ['prix_usd_mtok' => [1, 2], 'etages' => ['taggers'], 'note' => 'x']]], 'Modèle m : clés inconnues etages, note'],
            [['enabled' => true], 'Clé de configuration inconnue : enabled'],
            [['appels_par_minute' => 30], 'Clé de configuration inconnue : appels_par_minute'],
            [['pipeline' => []], 'Clé de configuration inconnue : pipeline'],
        ];
        foreach ($ko as [$partial, $message]) {
            try {
                self::config()->update($partial);
                self::fail('accepté : ' . json_encode($partial));
            } catch (Twin9Exception $e) {
                self::assertSame([422, $message], [$e->getStatusCode(), $e->getMessage()], json_encode($partial));
            }
        }
        self::assertSame(['m' => ['prix_usd_mtok' => [0.25, 1.25]]], self::config()->modeles(), 'dernier état valide conservé');
        // Configuration ENTIÈRE inchangée par les refus (colonne JSON : assertEquals).
        self::assertEquals($valide, self::stored());
    }

    #[TestDox('UC-ADM-05-U10 — ANOMALIE figée : un pack au-delà de 500 USD est refusé avec un message annonçant « entre 1 et 100 USD »')]
    public function testU10PackBoundMessageIsStale(): void
    {
        try {
            self::config()->update(['packs' => [['montant_usd' => 501, 'libelle' => 'trop']]]);
            self::fail('pack de 501 USD accepté');
        } catch (Twin9Exception $e) {
            self::assertSame('Pack hors bornes : montant entre 1 et 100 USD', $e->getMessage());
        }
        // … alors que 500 USD est accepté (et proposé par défaut).
        self::assertSame(500, self::config()->update(['packs' => [['montant_usd' => 500, 'libelle' => 'ok']]])['packs'][0]['montant_usd']);
        self::assertSame([10, 20, 50, 100, 200, 500], array_column(Twin9Config::defaults()['packs'], 'montant_usd'));
    }

    #[TestDox('UC-ADM-05-U11 — lecture effective : défauts complétés, clés stockées inconnues ignorées, dont les réglages retirés et les étages d’un modèle ; vue publique sans marge, prix catalogue ni promotion')]
    public function testU11EffectiveReadAndPublicView(): void
    {
        (new SettingsRepository(self::$pdo))->set(Twin9Config::SETTING_KEY, [
            'marge_twin6' => 1.3,
            'cle_obsolete' => 'x',
            // ce qu'avait stocké une instance d'avant le 2026-10-20
            'enabled' => true,
            'appels_par_minute' => 30,
            'pipeline' => ['jury' => ['taille' => 5]],
            'modeles' => ['claude-sonnet-5' => ['etages' => ['tribunal'], 'prix_usd_mtok' => [3, 15]]],
        ]);
        $read = self::config()->read();
        self::assertSame(1.3, $read['marge_twin6']);
        self::assertArrayNotHasKey('cle_obsolete', $read);
        self::assertSame(array_keys(Twin9Config::defaults()), array_keys($read));
        self::assertSame(['claude-sonnet-5' => ['prix_usd_mtok' => [3, 15]]], $read['modeles']);
        // …et la prochaine mise à jour enregistre la configuration sans eux (la
        // colonne JSON range ses clés à sa façon : on compare les ensembles).
        self::config()->update(['marge' => 1.4]);
        self::assertEqualsCanonicalizing(array_keys(Twin9Config::defaults()), array_keys(self::stored()));
        self::assertEquals(['prix_usd_mtok' => [3, 15]], self::stored()['modeles']['claude-sonnet-5']);

        $public = self::config()->publicView();
        self::assertSame([3.9, 19.5], $public['modeles_twin6']['claude-sonnet-5']);
        foreach (['marge', 'marge_twin6', 'twin9_cle_perso_ouverte'] as $cleAdmin) {
            self::assertArrayNotHasKey($cleAdmin, $public);
        }
        // l'offre Twin9 a quitté la vue publique avec le moteur du navigateur (T11)
        self::assertArrayNotHasKey('modeles', $public);
    }

    #[TestDox('UC-ADM-05-U12 — table des comptes : seuls les comptes ayant une activité, solde, cumuls, dernière activité d’abord (anomalie figée : un remboursement compte en consommé)')]
    public function testU12AccountsOversight(): void
    {
        $ids = [];
        foreach (['ecole@example.org' => 'École fictive', 'lea@example.org' => 'Léa', 'inactif@example.org' => 'Inactif'] as $email => $nom) {
            self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
                ->execute([$email, Users::hashPassword('x-password'), $nom]);
            $ids[$nom] = (int) self::$pdo->lastInsertId();
        }
        $credits = new CreditService(self::$pdo);
        $credits->topup($ids['École fictive'], 200_000_000, 'ORDER-ECOLE', 'Recharge PayPal');
        $credits->debit($ids['École fictive'], 50_000_000, 'tagger/1-tag-pole (réserve)', 'claude-sonnet-5');
        $credits->topup($ids['Léa'], 10_000_000, 'ORDER-LEA', 'Recharge PayPal');
        $credits->recordCapture($ids['Léa'], 'CAP-LEA', 'ORDER-LEA', 10_000_000);
        $credits->appliquerRemboursement($ids['Léa'], 'CAP-LEA', 4_000_000);
        self::$pdo->exec("UPDATE twin9_credit_events SET created_at = '2026-07-01 10:00:00' WHERE user_id = " . $ids['École fictive']);
        self::$pdo->exec("UPDATE twin9_credit_events SET created_at = '2026-07-05 10:00:00' WHERE user_id = " . $ids['Léa']);

        self::assertSame([
            ['user_id' => $ids['Léa'], 'email' => 'lea@example.org', 'nom' => 'Léa', 'solde_microusd' => 6_000_000, 'recharges_microusd' => 10_000_000, 'consomme_microusd' => 4_000_000, 'derniere_activite' => '2026-07-05 10:00:00'],
            ['user_id' => $ids['École fictive'], 'email' => 'ecole@example.org', 'nom' => 'École fictive', 'solde_microusd' => 150_000_000, 'recharges_microusd' => 200_000_000, 'consomme_microusd' => 50_000_000, 'derniere_activite' => '2026-07-01 10:00:00'],
        ], (new FactureService(self::$pdo))->comptes());
    }
}
