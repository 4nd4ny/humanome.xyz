<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Auth\Users;
use Humanome\MigrationRunner;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\TestDb;
use Humanome\Twin9\CreditService;
use Humanome\Tests\LlmFakeHttpClient;
use Humanome\Twin9\FactureService;
use Humanome\Twin9\TarifsAnthropic;
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
        self::$pdo->exec("DELETE FROM settings WHERE name IN ('twin9_config', 'twin9_tarifs')");
        self::$pdo->exec('DELETE FROM audit_events');
    }

    /** La page des prix d'Anthropic, réduite (fixture). */
    private static function page(): string
    {
        return (string) file_get_contents(\dirname(__DIR__, 2) . '/fixtures/tarifs-anthropic.md');
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
        $next = self::config()->update(['marge' => 1.5, 'runs_par_tick' => 4]);
        self::assertSame(1.5, $next['marge']);
        self::assertSame(1.1, $next['marge_twin6'], 'clé non fournie conservée');
        self::assertSame(1.5, self::config()->marge());
        self::assertSame(4, self::config()->runsParTick());
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

    #[TestDox('UC-ADM-05-U09 — bornes : contributions 1 à 5, packs 1 à 500 USD avec libellé, prix > 0 ; un modèle ne porte que ses prix ; les réglages retirés le 2026-10-20 (interrupteur, rythme, pipeline) et la promotion de la clé personnelle (ADR-013) sont des clés inconnues')]
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
            [['twin9_cle_perso_ouverte' => true], 'Clé de configuration inconnue : twin9_cle_perso_ouverte'],
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

    #[TestDox('UC-ADM-05-U11 — lecture effective : défauts complétés, clés stockées inconnues ignorées, dont les réglages retirés (la promotion de la clé personnelle comprise, ADR-013) et les étages d’un modèle ; vue publique sans marge, prix catalogue ni promotion')]
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
            // et une d'avant l'ADR-013 (2026-10-22)
            'twin9_cle_perso_ouverte' => true,
        ]);
        $read = self::config()->read();
        self::assertSame(1.3, $read['marge_twin6']);
        self::assertArrayNotHasKey('cle_obsolete', $read);
        self::assertArrayNotHasKey('twin9_cle_perso_ouverte', $read);
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

    #[TestDox('UC-ADM-05-U15 — relevé des prix (RG9) : le tableau « Model pricing » de la page d’Anthropic, colonnes trouvées par leurs titres — un identifiant par nom, les liens et notes ôtés, le palier long de Haiku 5.5 ; le tableau d’une autre section jamais lu')]
    public function testU15PricingPageIsRead(): void
    {
        $tarifs = TarifsAnthropic::lire(self::page());

        self::assertSame([
            'claude-fable-5-1', 'claude-mythos-5-1', 'claude-opus-5-5', 'claude-opus-4-8', 'claude-opus-4-1',
            'claude-sonnet-5-5', 'claude-sonnet-5', 'claude-haiku-5-5', 'claude-haiku-4-5',
        ], array_keys($tarifs));
        self::assertSame(['prix_usd_mtok' => [2.0, 10.0]], $tarifs['claude-sonnet-5'], 'la note 3 ôtée, pas la colonne des lots');
        self::assertSame(['prix_usd_mtok' => [10.0, 50.0]], $tarifs['claude-mythos-5-1'], 'son lien « limited availability » ôté');
        self::assertSame([
            'prix_usd_mtok' => [0.1, 0.5],
            'palier_long' => ['au_dela_de' => 100000, 'prix_usd_mtok' => [0.5, 2.5]],
        ], $tarifs['claude-haiku-5-5']);
        self::assertSame(['prix_usd_mtok' => [1.0, 5.0]], $tarifs['claude-haiku-4-5'], 'pas le prix par lots de la section suivante');
    }

    #[TestDox('UC-ADM-05-U16 — relevé des prix (RG9) : une page qu’on ne sait pas lire est refusée en entier — section, tableau ou colonnes absents, prix illisible ou hors bornes, palier sans prix de base, un modèle deux fois (un libellé de palier qu’on ne reconnaît plus), trop peu de modèles')]
    public function testU16UnreadablePageIsRefused(): void
    {
        $page = self::page();
        $cas = [
            'section « Model pricing » introuvable' => str_replace('## Model pricing', '## Prices', $page),
            'colonnes « Model », « Base input tokens » ou « Output tokens » introuvables'
                => str_replace('| Output tokens          |', '| Sortie                 |', $page),
            'prix introuvable pour Claude Opus 4.8' => str_replace('| $5 / MTok             | $6.25', '| cinq dollars          | $6.25', $page),
            'prix hors bornes pour Claude Fable 5.1' => str_replace('| $50 / MTok             |', '| $5000 / MTok           |', $page),
            'palier long sans prix de base pour claude-haiku-5-5'
                => preg_replace('/^\| Claude Haiku 5\.5 \(for prompts up to.*\R/m', '', $page),
            // Un libellé de palier que le code ne reconnaît plus : la ligne « au-delà » aurait écrasé le prix de base.
            'claude-haiku-5-5 y figure deux fois'
                => str_replace(['(for prompts up to 100,000 tokens)', '(for prompts over 100,000 tokens)'],
                    ['(prompts ≤ 100K tokens)          ', '(prompts > 100K tokens)          '], $page),
            '2 modèle(s) lu(s)' => preg_replace('/^\| Claude (Fable|Mythos|Opus|Sonnet).*\R/m', '', $page),
        ];
        foreach ($cas as $raison => $texte) {
            try {
                TarifsAnthropic::lire((string) $texte);
                self::fail('page acceptée : ' . $raison);
            } catch (\UnexpectedValueException $e) {
                self::assertSame('page des prix illisible : ' . $raison, $e->getMessage());
            }
        }
    }

    #[TestDox('UC-ADM-05-U17 — relevé des prix (RG9) : seuls les modèles de la grille sont récrits, prix et palier long tels que la page les donne (un identifiant daté retrouve son modèle) ; un modèle absent de la page garde ses prix et est nommé ; 2 et 2,0 sont un même prix ; un palier long que la page ne donne plus fait échouer le relevé')]
    public function testU17OnlyTheGridsModelsAreUpdated(): void
    {
        $grille = [
            'claude-haiku-4-5-20251001' => ['prix_usd_mtok' => [1, 5]],
            'claude-sonnet-5' => ['prix_usd_mtok' => [3, 15]],
            'claude-haiku-5-5' => ['prix_usd_mtok' => [0.1, 0.5]],
            'claude-opus-4-8' => ['prix_usd_mtok' => [6, 30]],
            'claude-maison-1' => ['prix_usd_mtok' => [7, 8]],
        ];

        $lecture = TarifsAnthropic::appliquer($grille, TarifsAnthropic::lire(self::page()));

        self::assertSame([
            'claude-haiku-4-5-20251001' => ['prix_usd_mtok' => [1, 5]],
            'claude-sonnet-5' => ['prix_usd_mtok' => [2.0, 10.0]],
            'claude-haiku-5-5' => [
                'prix_usd_mtok' => [0.1, 0.5],
                'palier_long' => ['au_dela_de' => 100000, 'prix_usd_mtok' => [0.5, 2.5]],
            ],
            'claude-opus-4-8' => ['prix_usd_mtok' => [5.0, 25.0]],
            'claude-maison-1' => ['prix_usd_mtok' => [7, 8]],
        ], $lecture['modeles'], 'Haiku 4.5 inchangé : 1 et 1,0 sont un même prix');
        self::assertSame(['claude-sonnet-5', 'claude-haiku-5-5', 'claude-opus-4-8'],
            array_column($lecture['changements'], 'modele'));
        self::assertSame([
            'modele' => 'claude-sonnet-5',
            'avant' => ['prix_usd_mtok' => [3, 15]],
            'apres' => ['prix_usd_mtok' => [2.0, 10.0]],
        ], $lecture['changements'][0]);
        self::assertSame(['claude-maison-1'], $lecture['absents']);
        self::assertArrayNotHasKey('claude-fable-5-1', $lecture['modeles'], 'l’offre reste celle de l’administrateur');

        // Un palier de la grille que la page ne donne plus (passé dans un autre tableau ?) : le relevé
        // échoue plutôt que de l'ôter, ce qui tarifierait les longs prompts au cinquième de leur prix.
        $grille['claude-opus-4-8'] = ['prix_usd_mtok' => [5, 25], 'palier_long' => ['au_dela_de' => 200000, 'prix_usd_mtok' => [10, 37.5]]];
        try {
            TarifsAnthropic::appliquer($grille, TarifsAnthropic::lire(self::page()));
            self::fail('palier ôté sans un mot');
        } catch (\UnexpectedValueException $e) {
            self::assertSame('page des prix illisible : le palier des longs prompts de claude-opus-4-8 n’y figure plus', $e->getMessage());
        }
    }

    #[TestDox('UC-ADM-05-U18 — relevé des prix (RG9) : dû une fois par jour UTC, une heure entre deux tentatives après un échec ; un échec garde le dernier relevé réussi et ne touche pas la grille')]
    public function testU18ReadingIsDueOncePerUtcDay(): void
    {
        $lundi = gmmktime(6, 0, 0, 10, 19, 2026);
        self::assertTrue(TarifsAnthropic::du(null, $lundi), 'jamais relevé');

        $http = new LlmFakeHttpClient();
        $http->queueResponse(['status' => 200, 'body' => self::page()]);
        $etat = TarifsAnthropic::relever(self::$pdo, $http, $lundi);
        self::assertSame('ok', $etat['statut']);
        self::assertSame('2026-10-19', $etat['jour']);
        self::assertSame(TarifsAnthropic::SOURCE, $http->requests[0]['url']);
        self::assertSame([2, 10], self::config()->modeles()['claude-sonnet-5']['prix_usd_mtok'], 'le défaut est déjà 2 / 10');
        self::assertSame([], $etat['changements']);
        self::assertNull(self::stored(), 'rien à changer : la grille n’est pas récrite');

        self::assertFalse(TarifsAnthropic::du($etat, gmmktime(23, 59, 59, 10, 19, 2026)), 'même jour UTC');
        $mardi = gmmktime(0, 0, 1, 10, 20, 2026);
        self::assertTrue(TarifsAnthropic::du($etat, $mardi), 'le jour suivant');

        // La page ne répond pas : la grille garde ses prix, l'état garde lundi.
        self::config()->update(['modeles' => ['claude-sonnet-5' => ['prix_usd_mtok' => [3, 15]]]]);
        $http->queueResponse(['status' => 503, 'body' => 'indisponible']);
        $echec = TarifsAnthropic::relever(self::$pdo, $http, $mardi);
        self::assertSame(['echec', 'page des prix : HTTP 503', '2026-10-19', $mardi],
            [$echec['statut'], $echec['erreur'], $echec['jour'], $echec['tentative_at']]);
        self::assertSame([3, 15], self::config()->modeles()['claude-sonnet-5']['prix_usd_mtok']);
        self::assertSame($echec, (new SettingsRepository(self::$pdo))->get(TarifsAnthropic::SETTING_KEY));
        self::assertFalse(TarifsAnthropic::du($echec, $mardi + TarifsAnthropic::REESSAI - 1), 'moins d’une heure après');
        self::assertTrue(TarifsAnthropic::du($echec, $mardi + TarifsAnthropic::REESSAI));

        // Une heure plus tard : relevé, 3 / 15 redevient 2 / 10, l'audit le dit.
        $http->queueResponse(['status' => 200, 'body' => self::page()]);
        $repris = TarifsAnthropic::releverSiDu(self::$pdo, $http, $mardi + TarifsAnthropic::REESSAI);
        self::assertSame(['ok', null, '2026-10-20'], [$repris['statut'], $repris['erreur'], $repris['jour']]);
        self::assertEquals([2, 10], self::config()->modeles()['claude-sonnet-5']['prix_usd_mtok']);
        self::assertSame(['claude-sonnet-5'], array_column($repris['changements'], 'modele'));
        $audit = self::$pdo->query("SELECT user_id, details FROM audit_events WHERE type = 'twin9_tarifs_mis_a_jour'")->fetchAll();
        self::assertCount(1, $audit);
        self::assertNull($audit[0]['user_id']);
        self::assertSame('claude-sonnet-5', json_decode((string) $audit[0]['details'], true)['changements'][0]['modele']);
        self::assertNull(TarifsAnthropic::releverSiDu(self::$pdo, $http, $mardi + TarifsAnthropic::REESSAI + 60), 'plus dû ce jour');
        self::assertCount(3, $http->requests);
    }
}
