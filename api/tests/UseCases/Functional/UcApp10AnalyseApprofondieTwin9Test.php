<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Keys\KeyVault;
use Humanome\Llm\LlmRuntime;
use Humanome\Packages\SettingsRepository;
use Humanome\Referentiel\ContentHash;
use Humanome\Referentiel\ReferentielRepository;
use Humanome\Tests\CartographeTestCase;
use Humanome\Tests\TestDb;
use Humanome\Tests\Twin9\FakeMultiHttpClient;
use Humanome\Tests\UseCases\Support\ReferentielsFictifs;
use Humanome\Tests\UseCases\Support\RunsTwin9Factices;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\Lancement;
use Humanome\Twin9\RunRepository;
use Humanome\Twin9\Twin9Config;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunTestsInSeparateProcesses;
use PHPUnit\Framework\Attributes\TestDox;

/**
 * UC-APP-10 — Lancer une analyse approfondie (Twin9) : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/apprenant/UC-APP-10-analyse-approfondie-twin9.md
 *
 * Le scénario documenté rejoué par l'API HTTP (application Slim en processus,
 * vraie base MySQL) : aperçu, lancement, avance par la page du run,
 * annulation, reprise, visibilité, résultats filtrés. Le moteur est le moteur
 * factice, public (`api/tests/fixtures/twin9-factice`), l'amont l'Anthropic
 * simulé de l'instance (`WORKER_PROVIDER=mock`), ou un faux Anthropic quand le
 * test choisit ses réponses (E7). Chaque test tourne dans un processus à lui :
 * le vrai moteur de `TWIN_V9_DIR` peut être chargé dans les autres.
 */
#[RunTestsInSeparateProcesses]
#[PreserveGlobalState(false)]
final class UcApp10AnalyseApprofondieTwin9Test extends CartographeTestCase
{
    use RunsTwin9Factices;

    /** Le message d'un lancement sans accord (RG1). */
    private const ACCORD_REQUIS = 'Accord requis : votre portfolio et l’état du run restent sur le serveur '
        . 'jusqu’à ce que vous les effaciez';

    protected function setUp(): void
    {
        parent::setUp();
        $this->moteurFactice();
    }

    protected function tearDown(): void
    {
        LlmRuntime::setMultiHttpClient(null);
        parent::tearDown();
    }

    /** Un crédit sur le compte, que la clé de l'instance débite. */
    private function crediter(array $user, int $microusd): void
    {
        (new CreditService(self::$pdo))->adjust($user['id'], $microusd, 'crédit des tests');
    }

    /** Ce que coûte une journée d'après le run de référence (RESPIRE, sept pôles), contribution comprise. */
    private static function parJour(float $marge = 1.2): int
    {
        return (int) round(Lancement::REFERENCE_MICROUSD * 7 * $marge);
    }

    /** Des micro-dollars comme un refus les dit : au centime supérieur. */
    private static function dollars(int $microusd): string
    {
        return number_format(ceil($microusd / 10_000) / 100, 2, ',', '') . ' $';
    }

    private static function runs(): int
    {
        return (int) self::$pdo->query('SELECT COUNT(*) FROM twin9_runs')->fetchColumn();
    }

    /** Un référentiel fictif, publié. @param array<string, mixed> $doc */
    private static function publier(array $doc): void
    {
        (new ReferentielRepository(self::$pdo))->importPublishedDocument(
            ['contentHash' => ContentHash::compute($doc)] + $doc, 'Publié');
    }

    #[TestDox('UC-APP-10-F01 — nominal (API) : liste vide et analyse disponible ; aperçu ; lancement 201 avec son attestation ; la page fait avancer le run jusqu’au bout ; résultats du propriétaire avec le référentiel du run ; liste ; débit au coût réel')]
    public function testF01Nominal(): void
    {
        $lea = $this->registerAs('lea@example.org', 'Léa');
        $this->crediter($lea, 1_000_000_000);

        // Étape 1 : l'analyse tourne sur cette instance, le compte n'a pas encore de run.
        self::assertSame(['disponible' => true, 'runs' => []], self::json($this->as_($lea, 'GET', '/api/twin9/runs')));
        $profil = $this->profilDirect($lea);

        // Étape 4 : l'aperçu, d'après le run de référence, pour les sept pôles de RESPIRE.
        $apercu = $this->apercu($lea, $profil);
        self::assertSame(['journal-factice', 'complet', 'directe', 'instance'],
            [$apercu['journal'], $apercu['mode'], $apercu['voie'], $apercu['cle']]);
        self::assertSame(['total' => 2, 'nouvelles' => 2, 'changees' => 0], $apercu['journees']);
        self::assertSame(['reference' => 'PLANT-01', 'poles' => 7],
            array_intersect_key($apercu['estimation'], ['reference' => 1, 'poles' => 1]));
        self::assertSame(round(self::parJour() * 3 / 1_000_000, 6), $apercu['estimation']['cout_usd'], 'deux journées et la fusion');
        self::assertSame(['journees' => 2, 'instruites' => 2, 'en_attente' => 0, 'refus' => null],
            array_intersect_key($apercu['admission'], ['journees' => 1, 'instruites' => 1, 'en_attente' => 1, 'refus' => 1]));
        self::assertSame(0, self::runs(), 'l’aperçu ne garde rien');

        // Étape 5 : le lancement.
        $run = $this->lancer($lea, $profil);
        self::assertSame(['en_cours', 'privee', 'journal-factice', 'En attente de son premier tour'],
            [$run['statut'], $run['visibilite'], $run['journal'], $run['retard']]);
        self::assertNotNull($run['accord_at']);
        $attestation = $run['attestation'];
        self::assertSame(['id' => $profil, 'nom' => 'Direct', 'mode' => 'complet'], $attestation['profil']);
        self::assertSame([2, 2, 0], [$attestation['admission']['journees'], $attestation['admission']['instruites'],
                                     $attestation['admission']['en_attente']]);
        self::assertSame('v9.8', $attestation['gabarits']['jeu']);
        $versions = $attestation['gabarits']['versions'];
        ksort($versions);
        self::assertSame(['factice/consigne' => 1, 'factice/etape' => 1, 'factice/fusion' => 1, 'factice/lecture' => 1], $versions);
        self::assertMatchesRegularExpression('/^[0-9a-f]{16}$/', $attestation['gabarits']['empreinte']);
        self::assertSame(['respire', '7.0.0'], [$attestation['referentiel']['id'], $attestation['referentiel']['version']]);
        self::assertArrayHasKey('empreinte', $attestation['referentiel']);
        self::assertArrayHasKey('commit', $attestation['moteur']);
        self::assertStringNotContainsString('monté le capteur', json_encode($run, JSON_UNESCAPED_UNICODE), 'le portfolio ne revient pas');

        // Étape 6 : la page du run le fait avancer jusqu'au bout.
        $suivi = $this->jusquAuBout($lea, $run['id']);
        self::assertSame(['termine', null], [$suivi['statut'], $suivi['retard']]);
        self::assertSame([2, true], [$suivi['progression']['journees'], $suivi['progression']['fusion']]);
        self::assertSame(5, $suivi['compteurs']['appels'], 'une lecture et une étape par journée, puis la fusion');
        // RG6 : le crédit n'est débité que du coût réel de ses appels.
        self::assertGreaterThan(0, $suivi['cout']['depense_microusd']);
        self::assertSame(1_000_000_000 - $suivi['cout']['depense_microusd'],
            (new CreditService(self::$pdo))->balance($lea['id']));

        // Étape 7 : ses résultats, filtrés, avec le référentiel avec lequel se lit sa carte.
        $resultats = $this->as_($lea, 'GET', '/api/twin9/runs/' . $run['id'] . '/resultats');
        self::assertSame(200, $resultats->getStatusCode());
        $r = self::json($resultats);
        self::assertSame('proprietaire', $r['lecteur']);
        self::assertSame(['id' => $run['id'], 'journal' => 'journal-factice', 'statut' => 'termine'],
            array_intersect_key($r['run'], ['id' => 1, 'journal' => 1, 'statut' => 1]));
        self::assertSame(['carto_evolutive.json', 'journees/2026-01-05/carto_jour.json',
                          'journees/2026-01-06/carto_jour.json'], array_keys($r['sorties']));
        self::assertSame([], $r['memoire']);
        self::assertSame(['respire', '7.0.0', 7, 61], [$r['referentiel']['id'], $r['referentiel']['version'],
                                                      \count($r['referentiel']['poles']), \count($r['referentiel']['competences'])]);
        $jour = json_decode($r['sorties']['journees/2026-01-05/carto_jour.json'], true);
        self::assertSame('présence établie', $jour['verdicts']['1.01']['statut']);
        self::assertArrayHasKey('deliberation', $jour['verdicts']['1.01'], 'délibérations comprises');
        self::assertStringNotContainsString('monté le capteur', json_encode($r['run'], JSON_UNESCAPED_UNICODE));

        // Étape 8 : « Mes analyses ».
        self::assertSame([[$run['id'], 'journal-factice', 'termine', 'Direct', 'complet']], array_map(
            static fn (array $x): array => [$x['id'], $x['journal'], $x['statut'], $x['profil'], $x['mode']],
            self::json($this->as_($lea, 'GET', '/api/twin9/runs'))['runs']));
    }

    #[TestDox('UC-APP-10-F02 — A1 : une journée ajoutée — l’aperçu ne compte qu’elle, le run n’instruit qu’elle, les autres viennent de la mémoire ; rien de neuf : seule la fusion se refait')]
    public function testF02AnEvaluatedPortfolioInstructsItsNewDaysOnly(): void
    {
        $lea = $this->registerAs('memoire@example.org', 'Léa');
        $this->crediter($lea, 1_000_000_000);
        $profil = $this->profilDirect($lea);
        $this->jusquAuBout($lea, $this->lancer($lea, $profil)['id']);

        $trois = self::$portfolioFactice . "## 2026-01-07\nTroisième jour : j'ai présenté.\n";
        self::assertSame(['total' => 3, 'nouvelles' => 1, 'changees' => 0], $this->apercu($lea, $profil, $trois)['journees']);
        $second = $this->lancer($lea, $profil, $trois);
        $suivi = $this->jusquAuBout($lea, $second['id']);
        self::assertSame('termine', $suivi['statut']);
        self::assertSame([1, 3], [$suivi['compteurs']['journees'], $suivi['compteurs']['appels']],
            'la journée ajoutée seule, et la fusion refaite');

        $r = self::json($this->as_($lea, 'GET', '/api/twin9/runs/' . $second['id'] . '/resultats'));
        self::assertSame(['2026-01-05', '2026-01-06'], $r['memoire']);
        self::assertSame(['carto_evolutive.json', 'journees/2026-01-05/carto_jour.json', 'journees/2026-01-06/carto_jour.json',
                          'journees/2026-01-07/carto_jour.json'], array_keys($r['sorties']));

        // Rien de neuf : aucune journée à instruire, seule la fusion se refait.
        self::assertSame(['total' => 3, 'nouvelles' => 0, 'changees' => 0], $this->apercu($lea, $profil, $trois)['journees']);
        $troisieme = $this->jusquAuBout($lea, $this->lancer($lea, $profil, $trois)['id']);
        self::assertSame([0, 1], [$troisieme['compteurs']['journees'], $troisieme['compteurs']['appels']]);
    }

    #[TestDox('UC-APP-10-F03 — A2 : un crédit pour une journée sur deux — le run prend la première avec sa fusion, l’autre attend une prochaine analyse ; l’attestation le dit')]
    public function testF03ACreditForOneDayTakesTheFirstDay(): void
    {
        $lea = $this->registerAs('admission@example.org', 'Léa');
        // une journée et sa fusion, avec le pire cas d'un appel de chacune, tiennent ; deux journées, non
        $this->crediter($lea, (int) (4.5 * self::parJour()));
        $profil = $this->profilDirect($lea);

        $apercu = $this->apercu($lea, $profil);
        self::assertSame(['journees' => 1, 'total' => 2, 'limite' => 'credit', 'instruites' => 1, 'en_attente' => 1,
                          'changees_en_attente' => 0, 'autres_usd' => 0.0, 'refus' => null], $apercu['admission']);
        self::assertSame(round(2 * self::parJour() / 1_000_000, 6), $apercu['estimation']['cout_usd'],
            'la journée admise et sa fusion');

        $run = $this->lancer($lea, $profil);
        // relue de sa colonne JSON, l'attestation a ses clés dans l'ordre de MySQL : assertEquals
        self::assertEquals(['journees' => 1, 'total' => 2, 'instruites' => 1, 'en_attente' => 1],
            array_intersect_key($run['attestation']['admission'], ['journees' => 1, 'total' => 1, 'instruites' => 1,
                                                                   'en_attente' => 1]));
        $suivi = $this->jusquAuBout($lea, $run['id']);
        self::assertSame(['termine', 1], [$suivi['statut'], $suivi['compteurs']['journees']]);
        self::assertSame(['carto_evolutive.json', 'journees/2026-01-05/carto_jour.json'],
            array_keys(self::json($this->as_($lea, 'GET', '/api/twin9/runs/' . $run['id'] . '/resultats'))['sorties']));
    }

    #[TestDox('UC-APP-10-F04 — A3 / E8 : annuler puis reprendre jusqu’au bout ; 409 pour annuler un run qui n’est pas en cours ou reprendre un run ni annulé ni arrêté')]
    public function testF04CancelThenResume(): void
    {
        $lea = $this->registerAs('reprise@example.org', 'Léa');
        $this->crediter($lea, 1_000_000_000);
        $id = $this->lancer($lea, $this->profilDirect($lea))['id'];

        $annule = $this->as_($lea, 'POST', "/api/twin9/runs/$id/annuler");
        self::assertSame(200, $annule->getStatusCode());
        self::assertSame(['annule', null], [self::json($annule)['statut'], self::json($annule)['retard']]);
        $encore = $this->as_($lea, 'POST', "/api/twin9/runs/$id/annuler");
        self::assertSame(409, $encore->getStatusCode());
        self::assertSame(['error' => 'Ce run n’est pas en cours'], self::json($encore));
        self::assertFalse(self::json($this->as_($lea, 'POST', '/api/twin9/runs/avancer'))['avance'],
            'un run annulé n’avance plus');

        $repris = $this->as_($lea, 'POST', "/api/twin9/runs/$id/reprendre");
        self::assertSame(200, $repris->getStatusCode());
        self::assertSame('en_cours', self::json($repris)['statut']);
        $deux = $this->as_($lea, 'POST', "/api/twin9/runs/$id/reprendre");
        self::assertSame(409, $deux->getStatusCode());
        self::assertSame(['error' => 'Seul un run annulé ou arrêté reprend'], self::json($deux));

        self::assertSame('termine', $this->jusquAuBout($lea, $id)['statut']);
        self::assertSame(409, $this->as_($lea, 'POST', "/api/twin9/runs/$id/reprendre")->getStatusCode(), 'un run fini');
        self::assertSame(409, $this->as_($lea, 'POST', "/api/twin9/runs/$id/annuler")->getStatusCode(), 'un run fini');
    }

    #[TestDox('UC-APP-10-F05 — A4 / E8 : reprise sous un nouveau budget, puis sans budget, jusqu’au bout ; un budget invalide → 422')]
    public function testF05ResumeUnderANewBudget(): void
    {
        $lea = $this->registerAs('budget@example.org', 'Léa');
        $this->crediter($lea, 1_000_000_000);
        $id = $this->lancer($lea, $this->profilDirect($lea, 'Plafonné', ['budget_usd' => 50.0]))['id'];
        self::assertSame(50.0, self::json($this->as_($lea, 'GET', "/api/twin9/runs/$id"))['cout']['budget_usd']);
        $this->as_($lea, 'POST', "/api/twin9/runs/$id/annuler");

        foreach ([0, -3, 'beaucoup', [12]] as $invalide) {
            $refus = $this->as_($lea, 'POST', "/api/twin9/runs/$id/reprendre", ['budget_usd' => $invalide]);
            self::assertSame(422, $refus->getStatusCode(), json_encode($invalide));
            self::assertSame(['error' => 'Budget invalide : un nombre de dollars positif, ou null pour aucun'], self::json($refus));
        }
        self::assertSame('annule', (new RunRepository(self::$pdo))->statut($id), 'rien n’a repris');

        $repris = self::json($this->as_($lea, 'POST', "/api/twin9/runs/$id/reprendre", ['budget_usd' => 20.5]));
        self::assertSame(['en_cours', 20.5], [$repris['statut'], $repris['cout']['budget_usd']]);
        self::assertSame(20.5, (new RunRepository(self::$pdo))->charger($id)['profil']->budget_usd, 'la copie du profil le garde');

        $this->as_($lea, 'POST', "/api/twin9/runs/$id/annuler");
        $sans = self::json($this->as_($lea, 'POST', "/api/twin9/runs/$id/reprendre", ['budget_usd' => null]));
        self::assertSame(['en_cours', null], [$sans['statut'], $sans['cout']['budget_usd']]);
        self::assertSame('termine', $this->jusquAuBout($lea, $id)['statut']);
    }

    #[TestDox('UC-APP-10-F06 — A5 : privé, le cartographe lié ne lit rien ; visible, lui seul lit les résultats, sans suivre ni commander le run ; visibilité inconnue → 422')]
    public function testF06ResultsForTheLinkedCartographe(): void
    {
        $lea = $this->registerAs('apprenante@example.org', 'Léa');
        $carto = $this->registerAs('cartographe@example.org', 'Carl', ['cartographe']);
        $autre = $this->registerAs('autre-carto@example.org', 'Autre', ['cartographe']);
        $this->link($lea, $carto);
        $this->crediter($lea, 1_000_000_000);
        $profil = $this->profilDirect($lea);
        $id = $this->lancer($lea, $profil)['id'];
        $this->jusquAuBout($lea, $id);

        self::assertSame(404, $this->as_($carto, 'GET', "/api/twin9/runs/$id/resultats")->getStatusCode(), 'privé');
        $visible = $this->as_($lea, 'PUT', "/api/twin9/runs/$id/visibilite", ['visibilite' => 'cartographe']);
        self::assertSame(200, $visible->getStatusCode());
        self::assertSame('cartographe', self::json($visible)['visibilite']);

        $lu = $this->as_($carto, 'GET', "/api/twin9/runs/$id/resultats");
        self::assertSame(200, $lu->getStatusCode());
        self::assertSame('cartographe', self::json($lu)['lecteur']);
        self::assertSame(404, $this->as_($autre, 'GET', "/api/twin9/runs/$id/resultats")->getStatusCode(), 'non lié');
        self::assertSame(404, $this->as_($carto, 'GET', "/api/twin9/runs/$id")->getStatusCode(), 'il ne suit pas le run');
        self::assertSame(404, $this->as_($carto, 'POST', "/api/twin9/runs/$id/reprendre")->getStatusCode(), 'ni ne le commande');
        self::assertSame(404, $this->as_($carto, 'PUT', "/api/twin9/runs/$id/visibilite", ['visibilite' => 'privee'])
            ->getStatusCode());

        $inconnue = $this->as_($lea, 'PUT', "/api/twin9/runs/$id/visibilite", ['visibilite' => 'publique']);
        self::assertSame(422, $inconnue->getStatusCode());
        self::assertSame(['error' => 'Visibilité inconnue : privee ou cartographe'], self::json($inconnue));

        // Étape 2 : la case cochée au lancement.
        $second = $this->as_($lea, 'POST', '/api/twin9/runs', ['visibilite' => 'cartographe'] + $this->lancement($profil,
            "## 2026-02-01\nUn autre jour.\n"));
        self::assertSame(201, $second->getStatusCode(), (string) $second->getBody());
        self::assertSame('cartographe', self::json($second)['visibilite']);
    }

    #[TestDox('UC-APP-10-F07 — A6 : clé personnelle (promotion ouverte, clé enregistrée) — estimation sans contribution, le crédit nul ne borne rien ; run au bout, crédit intact, aucun événement au grand-livre')]
    public function testF07APersonalKeyDebitsNothing(): void
    {
        TestDb::setEnv('SODIUM_MASTER_KEY', str_repeat('ab', 32));
        (new Twin9Config(new SettingsRepository(self::$pdo)))->update(['twin9_cle_perso_ouverte' => true]);
        $lea = $this->registerAs('cle@example.org', 'Léa');
        (new KeyVault(self::$pdo, (string) KeyVault::masterKeyFromEnv()))->store($lea['id'], 'anthropic', 'sk-ant-perso-fictive');
        $profil = $this->profilDirect($lea, 'Ma clé', ['cle' => 'personnelle']);

        $apercu = $this->apercu($lea, $profil);
        self::assertSame(['personnelle', null], [$apercu['cle'], $apercu['credit_usd']]);
        self::assertSame(round(self::parJour(1.0) * 3 / 1_000_000, 6), $apercu['estimation']['cout_usd'], 'sans contribution');
        self::assertSame([null, null, 2], [$apercu['admission']['limite'], $apercu['admission']['refus'],
                                          $apercu['admission']['instruites']]);

        $suivi = $this->jusquAuBout($lea, $this->lancer($lea, $profil)['id']);
        self::assertSame('termine', $suivi['statut']);
        self::assertGreaterThan(0, $suivi['cout']['depense_microusd'], 'son coût, celui d’Anthropic');
        self::assertSame(0, (new CreditService(self::$pdo))->balance($lea['id']));
        $stmt = self::$pdo->prepare('SELECT COUNT(*) FROM twin9_credit_events WHERE user_id = ?');
        $stmt->execute([$lea['id']]);
        self::assertSame(0, (int) $stmt->fetchColumn(), 'aucun événement au grand-livre');
    }

    #[TestDox('UC-APP-10-F08 — A7 : un autre référentiel publié — le run va au bout, ses résultats portent ses pôles et ses compétences, sans fiche ni description')]
    public function testF08AnotherReferential(): void
    {
        self::publier(ReferentielsFictifs::lettre());
        $lea = $this->registerAs('lettre@example.org', 'Léa');
        $this->crediter($lea, 1_000_000_000);
        $profil = $this->profilDirect($lea, 'Lettré', ['referentiel' => (object) ['id' => 'fictif-lettre', 'version' => null]]);

        self::assertSame(5, $this->apercu($lea, $profil)['estimation']['poles']);
        $run = $this->lancer($lea, $profil);
        self::assertSame(['fictif-lettre', '1.0.0'], [$run['attestation']['referentiel']['id'],
                                                     $run['attestation']['referentiel']['version']]);
        self::assertSame('termine', $this->jusquAuBout($lea, $run['id'])['statut']);

        $r = self::json($this->as_($lea, 'GET', '/api/twin9/runs/' . $run['id'] . '/resultats'));
        $ref = $r['referentiel'];
        self::assertSame(['fictif-lettre', '1.0.0', 'Fictif lettré', 5, 20],
            [$ref['id'], $ref['version'], $ref['label'], \count($ref['poles']), \count($ref['competences'])]);
        self::assertSame(['num' => 1, 'nom' => 'A · Pôle fictif A', 'couleur' => null], $ref['poles'][0]);
        self::assertSame(['code' => 'A1', 'nom' => 'Capacité fictive A1', 'pole' => 1], $ref['competences'][0]);
        self::assertStringNotContainsString('Définition fictive', json_encode($ref, JSON_UNESCAPED_UNICODE));
        self::assertStringNotContainsString('Ce que cherche le pôle', json_encode($ref, JSON_UNESCAPED_UNICODE));
        $jour = json_decode($r['sorties']['journees/2026-01-05/carto_jour.json'], true);
        self::assertSame(['A1', 'B1', 'C1', 'D1', 'E1'], array_keys($jour['verdicts']), 'la première capacité de chaque pôle');
    }

    #[TestDox('UC-APP-10-F09 — A8 : un profil en mode essai — une journée lue, un pôle estimé ; « test » dans la liste et dans l’attestation')]
    public function testF09TestMode(): void
    {
        $lea = $this->registerAs('essai@example.org', 'Léa');
        $this->crediter($lea, 1_000_000_000);
        $profil = $this->profilDirect($lea, 'Essai', ['mode' => 'test']);

        $apercu = $this->apercu($lea, $profil);
        self::assertSame(['total' => 1, 'nouvelles' => 1, 'changees' => 0], $apercu['journees'], 'la première journée');
        self::assertSame([1, 'test'], [$apercu['estimation']['poles'], $apercu['mode']]);
        $run = $this->lancer($lea, $profil);
        self::assertSame(['id' => $profil, 'nom' => 'Essai', 'mode' => 'test'], $run['attestation']['profil']);
        $suivi = $this->jusquAuBout($lea, $run['id']);
        self::assertSame(['termine', 1, 'test'], [$suivi['statut'], $suivi['compteurs']['journees'], $suivi['mode']]);
        self::assertSame('test', self::json($this->as_($lea, 'GET', '/api/twin9/runs'))['runs'][0]['mode']);
        self::assertSame(['carto_evolutive.json', 'journees/2026-01-05/carto_jour.json'],
            array_keys(self::json($this->as_($lea, 'GET', '/api/twin9/runs/' . $run['id'] . '/resultats'))['sorties']));
    }

    #[TestDox('UC-APP-10-F10 — E1 : sans session, 401 sur chaque route du cas ; avec une session, une écriture sans jeton CSRF ou avec un faux → 403, rien ne part')]
    public function testF10WithoutSession(): void
    {
        $this->cookieSid = null;
        foreach ([['GET', '/api/twin9/runs'], ['POST', '/api/twin9/runs/apercu'], ['POST', '/api/twin9/runs'],
                  ['POST', '/api/twin9/runs/avancer'], ['GET', '/api/twin9/runs/1'],
                  ['POST', '/api/twin9/runs/1/annuler'], ['POST', '/api/twin9/runs/1/reprendre'],
                  ['PUT', '/api/twin9/runs/1/visibilite'], ['GET', '/api/twin9/runs/1/resultats'],
                  ['GET', '/api/twin9/admin/runs']] as [$method, $path]) {
            $this->cookieSid = null;
            self::assertSame(401, $this->request($method, $path, $method === 'GET' ? null : $this->lancement(null))
                ->getStatusCode(), "$method $path");
        }

        $lea = $this->registerAs('csrf@example.org', 'Léa');
        $this->crediter($lea, 1_000_000_000);
        foreach ([[], ['X-CSRF-Token' => 'jeton-faux']] as $entetes) {
            $this->cookieSid = $lea['sid'];
            $refus = $this->request('POST', '/api/twin9/runs', $this->lancement(null), $entetes);
            self::assertSame(403, $refus->getStatusCode());
            self::assertSame(['error' => 'Jeton CSRF absent ou invalide'], self::json($refus));
        }
        self::assertSame(0, self::runs());
    }

    #[TestDox('UC-APP-10-F11 — E2 : sans moteur, l’analyse n’est pas disponible (liste), l’aperçu et le lancement répondent 503 ; sans gabarit, le lancement répond 503')]
    public function testF11WithoutEngineOrTemplates(): void
    {
        $lea = $this->registerAs('indispo@example.org', 'Léa');
        $this->crediter($lea, 1_000_000_000);

        TestDb::setEnv('TWIN_V9_DIR', sys_get_temp_dir() . '/twin9-absent-' . bin2hex(random_bytes(6)));
        self::assertSame(['disponible' => false, 'runs' => []], self::json($this->as_($lea, 'GET', '/api/twin9/runs')));
        foreach (['/api/twin9/runs/apercu', '/api/twin9/runs'] as $route) {
            $refus = $this->as_($lea, 'POST', $route, $this->lancement(null));
            self::assertSame(503, $refus->getStatusCode(), $route);
            self::assertSame(['error' => 'L’analyse approfondie n’est pas disponible sur cette instance'], self::json($refus));
        }

        // Le moteur revenu, un jeu de gabarits vide.
        TestDb::setEnv('TWIN_V9_DIR', \dirname(__DIR__, 2) . '/fixtures/twin9-factice');
        self::$pdo->exec('DELETE FROM twin9_protocole_versions');
        self::$pdo->exec('DELETE FROM twin9_protocole');
        $vide = $this->as_($lea, 'POST', '/api/twin9/runs', $this->lancement(null));
        self::assertSame(503, $vide->getStatusCode());
        self::assertSame(['error' => 'Aucun gabarit sur cette instance : l’analyse approfondie ne peut partir'], self::json($vide));
        self::assertSame(0, self::runs());
    }

    #[TestDox('UC-APP-10-F12 — E3 / E4 : accord absent, portfolio invalide, profil invalide ou d’un autre, profil refusé (clé personnelle absente) → 422 ou 404 qui nomme le refus ; aucun run')]
    public function testF12RefusedLaunches(): void
    {
        $lea = $this->registerAs('refus@example.org', 'Léa');
        $bob = $this->registerAs('bob@example.org', 'Bob');
        $this->crediter($lea, 1_000_000_000);

        // E3 : l'accord, à chaque lancement.
        foreach ([false, null, 'oui'] as $accord) {
            $refus = $this->as_($lea, 'POST', '/api/twin9/runs', ['accord' => $accord] + $this->lancement(null));
            self::assertSame(422, $refus->getStatusCode(), json_encode($accord));
            self::assertSame(['error' => self::ACCORD_REQUIS], self::json($refus));
        }

        // E4 : le portfolio, le profil.
        foreach ([
            [['profil' => null, 'accord' => true], 422, 'Portfolio requis : {nom, texte}'],
            [['portfolio' => ['nom' => 'a/b.md', 'texte' => self::$portfolioFactice]] + $this->lancement(null), 422,
             'Nom de portfolio invalide'],
            [['portfolio' => ['nom' => 'vide.md', 'texte' => "  \n"]] + $this->lancement(null), 422,
             'Portfolio invalide : un texte UTF-8 non vide, de 2 Mo au plus'],
            [['profil' => 'le mien'] + $this->lancement(null), 422, 'Profil invalide : identifiant ou null (le profil v9.8)'],
            [$this->lancement($this->profilDirect($bob, 'De Bob')), 404, 'Profil introuvable'],
        ] as [$corps, $statut, $message]) {
            $refus = $this->as_($lea, 'POST', '/api/twin9/runs', $corps);
            self::assertSame($statut, $refus->getStatusCode(), $message);
            self::assertSame(['error' => $message], self::json($refus));
        }

        // Un profil refusé : sa clé personnelle, ouverte par la promotion, n'est pas enregistrée.
        (new Twin9Config(new SettingsRepository(self::$pdo)))->update(['twin9_cle_perso_ouverte' => true]);
        $perso = $this->profilDirect($lea, 'Ma clé', ['cle' => 'personnelle']);
        foreach (['/api/twin9/runs/apercu', '/api/twin9/runs'] as $route) {
            $refus = $this->as_($lea, 'POST', $route, $this->lancement($perso));
            self::assertSame(422, $refus->getStatusCode(), $route);
            self::assertSame(['error' => 'Profil refusé — /cle : aucune clé Anthropic personnelle n’est enregistrée'],
                self::json($refus));
        }
        self::assertSame(0, self::runs());
    }

    #[TestDox('UC-APP-10-F13 — E5 : sans crédit, l’aperçu dit ce qu’il faudrait ; le lancement est refusé du même message ; aucun run')]
    public function testF13RefusedAdmission(): void
    {
        $lea = $this->registerAs('sans-credit@example.org', 'Léa');
        $profil = $this->profilDirect($lea);
        $message = 'Votre crédit ne couvre pas une carte, même d’une journée : il faudrait ' . self::dollars(4 * self::parJour())
            . ' (une journée et sa fusion, d’après le run de référence, réserves des appels comprises)';

        $apercu = $this->apercu($lea, $profil);
        self::assertSame([0, 0, 2, $message], [$apercu['admission']['journees'], $apercu['admission']['instruites'],
                                              $apercu['admission']['en_attente'], $apercu['admission']['refus']]);
        self::assertSame(0.0, $apercu['credit_usd']);
        $refus = $this->as_($lea, 'POST', '/api/twin9/runs', $this->lancement($profil));
        self::assertSame(422, $refus->getStatusCode());
        self::assertSame(['error' => $message], self::json($refus));
        self::assertSame(0, self::runs());
    }

    #[TestDox('UC-APP-10-F14 — E6 / RG10 : le run d’un autre → 404 pour tous, l’administrateur compris, qui ne lit que des compteurs ; la page n’avance que les runs de son compte')]
    public function testF14NobodyElseReadsARun(): void
    {
        $lea = $this->registerAs('proprietaire@example.org', 'Léa');
        $bob = $this->registerAs('voisin@example.org', 'Bob');
        $admin = $this->registerAs('admin@example.org', 'Admin', ['admin']);
        $this->crediter($lea, 1_000_000_000);
        $this->crediter($bob, 1_000_000_000);
        $id = $this->lancer($lea, $this->profilDirect($lea))['id'];
        $deBob = $this->lancer($bob, $this->profilDirect($bob))['id'];

        foreach ([$bob, $admin] as $autre) {
            foreach ([['GET', "/api/twin9/runs/$id", null], ['POST', "/api/twin9/runs/$id/annuler", []],
                      ['POST', "/api/twin9/runs/$id/reprendre", []],
                      ['PUT', "/api/twin9/runs/$id/visibilite", ['visibilite' => 'cartographe']],
                      ['GET', "/api/twin9/runs/$id/resultats", null]] as [$method, $path, $body]) {
                $reponse = $this->as_($autre, $method, $path, $body);
                self::assertSame(404, $reponse->getStatusCode(), "$method $path");
                self::assertSame(['error' => 'Run introuvable'], self::json($reponse));
            }
        }
        self::assertSame([$deBob], array_column(self::json($this->as_($bob, 'GET', '/api/twin9/runs'))['runs'], 'id'));
        self::assertSame(['en_cours', 'privee'], [(new RunRepository(self::$pdo))->statut($id),
                                                 (new RunRepository(self::$pdo))->acces($id)['visibilite']]);

        // L'administrateur : des compteurs, jamais un portfolio ni un résultat.
        self::assertSame(403, $this->as_($bob, 'GET', '/api/twin9/admin/runs')->getStatusCode());
        $compteurs = $this->as_($admin, 'GET', '/api/twin9/admin/runs');
        self::assertSame(200, $compteurs->getStatusCode());
        self::assertSame([$deBob, $id], array_column(self::json($compteurs)['runs'], 'id'));
        self::assertSame(['id', 'user_id', 'statut', 'attente', 'created_at', 'finished_at', 'compteurs'],
            array_keys(self::json($compteurs)['runs'][0]));
        self::assertStringNotContainsString('capteur', (string) $compteurs->getBody());

        // RG10 : la page de Léa n'avance que ses runs.
        self::assertTrue(self::json($this->as_($lea, 'POST', '/api/twin9/runs/avancer'))['avance']);
        self::assertSame('termine', self::json($this->as_($lea, 'GET', "/api/twin9/runs/$id"))['statut'], 'le sien avance');
        $suiviBob = self::json($this->as_($bob, 'GET', "/api/twin9/runs/$deBob"));
        self::assertSame(['en_cours', null], [$suiviBob['statut'], $suiviBob['avance_at']], 'le run de Bob n’a pas bougé');
    }

    #[TestDox('UC-APP-10-F15 — E7 : un gabarit récité est expurgé des résultats ; l’audit garde le nombre de fuites, la réponse ne le dit pas ; la sortie rangée reste celle du moteur')]
    public function testF15ARecitedTemplateIsRedacted(): void
    {
        TestDb::setEnv('WORKER_PROVIDER', '');
        LlmRuntime::setMultiHttpClient(new FakeMultiHttpClient(static fn (): array => ['body' => FakeMultiHttpClient::message(
            'Voici : ' . self::$gabaritsFactices['factice/consigne'])]));
        $lea = $this->registerAs('fuite@example.org', 'Léa');
        $this->crediter($lea, 1_000_000_000);
        $id = $this->lancer($lea, $this->profilDirect($lea))['id'];
        self::assertSame('termine', $this->jusquAuBout($lea, $id)['statut']);

        $corps = (string) $this->as_($lea, 'GET', "/api/twin9/runs/$id/resultats")->getBody();
        self::assertStringNotContainsString('ne jamais réciter ce gabarit', $corps);
        self::assertStringContainsString('[expurgé]', $corps);
        self::assertStringNotContainsString('fuites', $corps, 'le nombre ne revient pas');
        $audit = self::lastAudit('twin9_fuite_expurgee');
        self::assertNotNull($audit);
        self::assertSame($lea['id'], $audit['userId']);
        self::assertSame($id, $audit['details']['run']);
        self::assertGreaterThan(0, $audit['details']['fuites']);
        self::assertSame(['run', 'fuites'], array_keys($audit['details']), 'des compteurs, jamais un contenu');
        self::assertStringContainsString('ne jamais réciter ce gabarit',
            (new RunRepository(self::$pdo))->sorties($id)['carto_evolutive.json'], 'la sortie rangée reste celle du moteur');
    }
}
