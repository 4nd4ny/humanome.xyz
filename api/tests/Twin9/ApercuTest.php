<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\Packages\SettingsRepository;
use Humanome\Referentiel\ReferentielRepository;
use Humanome\Tests\CartographeTestCase;
use Humanome\Tests\TestDb;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\Evaluations;
use Humanome\Twin9\Lancement;
use Humanome\Twin9\ProfilRepository;
use Humanome\Twin9\ProtocoleRepository;
use Humanome\Twin9\Twin9Config;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunTestsInSeparateProcesses;

/**
 * Before a launch (T10, Twin_v9's docs/plan-twin9-php.md, lot 2, « Coûts et
 * plafonds », « Relancer »): the launch page learns which days the run would
 * instruct — a portfolio already evaluated instructs its days new or changed
 * only —, and what it would cost and last: at the least, on average and at
 * the most, by the size of its days and of its map, as the evaluations of the
 * same settings say (T8), failing those the real run of PLANT-01, in test
 * mode, times the referential's poles. A launch takes the days its owner's
 * credit, or its budget, lets in with its merge and room for the worst case
 * of their calls (T8, strategy A), or is refused, saying what it would take.
 * The engine is the fake one, the provider the local instance's simulated
 * Anthropic. Each test runs in a process of its own.
 */
#[RunTestsInSeparateProcesses]
#[PreserveGlobalState(false)]
final class ApercuTest extends CartographeTestCase
{
    private const GABARITS = [
        'factice/lecture' => "[appel:{\$APPEL}] Lis la journée {\$JOUR} en lecteur {\$LECTEUR} :\n{\$TEXTE}",
        'factice/etape' => "[appel:{\$APPEL}] Étape {\$ETAPE} de {\$JOUR}, après : {\$PRECEDENT}",
        'factice/fusion' => "[appel:{\$APPEL}] Fusionne :\n{\$JOURS}",
    ];

    private const PORTFOLIO = "## 2026-01-05\nPremier jour : j'ai monté le capteur.\n"
        . "## 2026-01-06\nDeuxième jour : j'ai lu les mesures.\n";

    protected function setUp(): void
    {
        parent::setUp();
        TestDb::setEnv('TWIN_V9_DIR', \dirname(__DIR__) . '/fixtures/twin9-factice');
        TestDb::setEnv('WORKER_PROVIDER', 'mock');
        TestDb::setEnv('ANTHROPIC_API_KEY', 'sk-ant-instance-test');
        TestDb::setEnv('WORKER_TICK_BUDGET_SECONDS', '2');
        self::$pdo->exec('DELETE FROM referentiel_versions');
        self::$pdo->exec('DELETE FROM twin9_protocole_versions');
        self::$pdo->exec('DELETE FROM twin9_protocole');
        $doc = json_decode((string) file_get_contents(\dirname(__DIR__, 3) . '/web/public/data/referentiel/respire-v7.json'),
            true, 512, JSON_THROW_ON_ERROR);
        (new ReferentielRepository(self::$pdo))->importPublishedDocument($doc, 'Import initial RESPIRE v7');
        TestDb::fichesRespire(self::$pdo); // the engine reads RESPIRE's fiches from the base (T16)
        $protocole = new ProtocoleRepository(self::$pdo);
        foreach (self::GABARITS as $nom => $contenu) {
            $protocole->put($nom, $contenu, null);
        }
        // the referential's seven poles, as the set's fiches carry them: a set of before T16, whose pole files
        // describe RESPIRE v7's structure — the one it serves (2026-10-20)
        foreach (JeuAvantT16::fiches($doc) as $nom => $contenu) {
            $protocole->put($nom, $contenu, null);
        }
    }

    /**
     * The DoD: a first run instructs every day; once done, a day added is the
     * only one new, and the next run instructs it alone, the merge made
     * again; a day changed is the only one to read again.
     */
    public function testAnAddedDayIsTheOnlyOneInstructed(): void
    {
        $alice = $this->registerAs('relance@example.org', 'Alice');
        $profil = $this->profil($alice);

        $avant = $this->apercu($alice, $profil, self::PORTFOLIO);
        self::assertSame(['total' => 2, 'nouvelles' => 2, 'changees' => 0], $avant['journees']);
        $premier = $this->lancer($alice, $profil, self::PORTFOLIO);
        self::assertSame(2, $this->jusquAuBout($alice, $premier)['compteurs']['journees']);

        $ajoute = self::PORTFOLIO . "## 2026-01-07\nTroisième jour : j'ai présenté.\n";
        self::assertSame(['total' => 3, 'nouvelles' => 1, 'changees' => 0],
            $this->apercu($alice, $profil, $ajoute)['journees']);
        $second = $this->lancer($alice, $profil, $ajoute);
        $compteurs = $this->jusquAuBout($alice, $second)['compteurs'];
        self::assertSame(1, $compteurs['journees'], 'la journée ajoutée seule');
        self::assertSame(3, $compteurs['appels'], 'ses deux appels, et la fusion refaite');

        $change = str_replace('lu les mesures', 'relu les mesures', $ajoute);
        self::assertSame(['total' => 3, 'nouvelles' => 0, 'changees' => 1],
            $this->apercu($alice, $profil, $change)['journees']);
        self::assertSame(['total' => 3, 'nouvelles' => 0, 'changees' => 0],
            $this->apercu($alice, $profil, $ajoute)['journees'], 'rien de neuf : la fusion seule se refait');
    }

    /**
     * The estimate: without an evaluation of the same settings, the real run
     * of PLANT-01 times the referential's poles, for each day instructed and a
     * day's worth for the merge, the margin with the instance's key, half
     * price by batches whose time it cannot say; the merge's reserve, a day's
     * worth more for the worst case of its calls. Then as the evaluations say
     * (T8): a day instructed by its size, the merge by the size of its map,
     * its reserve with the largest worst case observed.
     */
    public function testTheEstimateComesFromTheEvaluationsElseFromTheReferenceRun(): void
    {
        $alice = $this->registerAs('estimation@example.org', 'Alice');
        $profil = $this->profil($alice);

        $e = $this->apercu($alice, $profil, self::PORTFOLIO);
        $parJour = Lancement::REFERENCE_MICROUSD * 7 * 1.2;
        self::assertSame(['reference' => 'PLANT-01', 'poles' => 7], array_intersect_key($e['estimation'],
            ['reference' => 1, 'poles' => 1]));
        $usd = round($parJour * 3 / 1_000_000, 6);
        self::assertSame([$usd, $usd, $usd], [$e['estimation']['min_usd'], $e['estimation']['cout_usd'],
                                               $e['estimation']['max_usd']], 'deux journées et la fusion');
        self::assertSame(round(2 * $parJour / 1_000_000, 6), $e['estimation']['reserve_usd'], 'la fusion et un pire cas');
        self::assertSame(Lancement::REFERENCE_SECONDES * 7 * 2, $e['estimation']['duree_s']);
        self::assertSame(['budget_usd' => null, 'duree_minutes' => null], $e['plafonds']);
        self::assertSame(['directe', 'instance', 1000.0], [$e['voie'], $e['cle'], $e['credit_usd']]);
        self::assertSame(['journees' => 2, 'total' => 2, 'limite' => 'credit', 'instruites' => 2, 'en_attente' => 0,
                          'changees_en_attente' => 0, 'autres_usd' => 0.0, 'refus' => null], $e['admission']);

        $v98 = $this->apercu($alice, null, self::PORTFOLIO);
        self::assertSame('lots', $v98['voie']);
        self::assertSame(round($parJour / 2 * 3 / 1_000_000, 6), $v98['estimation']['cout_usd'], 'à moitié prix');
        self::assertNull($v98['estimation']['duree_s'], 'par lots, la durée est celle d’Anthropic');

        $essai = $this->profil($alice, 'Essai', ['mode' => 'test']);
        $t = $this->apercu($alice, $essai, self::PORTFOLIO);
        self::assertSame(['total' => 1, 'nouvelles' => 1, 'changees' => 0], $t['journees'], 'la première journée');
        self::assertSame(1, $t['estimation']['poles'], 'le vrai run de PLANT-01 était un essai');

        $run = $this->lancer($alice, $profil, self::PORTFOLIO);
        $this->jusquAuBout($alice, $run);
        $ajout = "## 2026-01-07\nUn de plus.\n";
        $apres = $this->apercu($alice, $profil, self::PORTFOLIO . $ajout);
        self::assertSame(1, $apres['estimation']['evaluations']);
        // as its one evaluation says: its days' line for the day added, its merge by the size of the map
        $ev = self::$pdo->query('SELECT signature, journees, cout_fusion_microusd FROM twin9_evaluations')->fetch();
        $modele = (new Evaluations(self::$pdo))->modele((string) $ev['signature'], false, 1.2);
        $ko = array_sum(array_column(json_decode((string) $ev['journees'], true), 'ko')) + Evaluations::ko(\strlen('Un de plus.'));
        $jour = Evaluations::selon($modele['journee'], Evaluations::ko(\strlen('Un de plus.')));
        $fusion = Evaluations::selon($modele['fusion'], $ko);
        self::assertSame(array_map(static fn (string $b): float => round(($jour[$b] + $fusion[$b]) / 1_000_000, 6),
            ['cout_usd' => 'moyenne', 'min_usd' => 'min', 'max_usd' => 'max']),
            array_intersect_key($apres['estimation'], ['cout_usd' => 1, 'min_usd' => 1, 'max_usd' => 1]));
        self::assertGreaterThanOrEqual(round(($fusion['max'] + $modele['pire_cas']['fusion']) / 1_000_000, 6),
            $apres['estimation']['reserve_usd'], 'la fusion au plus haut, et au moins le plus grand pire cas d’un de ses appels');
        self::assertGreaterThan(0.0, $apres['estimation']['cout_usd']);
        self::assertGreaterThan(0.0, $fusion['moyenne']);
        self::assertGreaterThan(0.0, $modele['pire_cas']['journee']);

        // a day removed stays in the map, and the merge reads it (the map is additive)
        $retire = "## 2026-01-05\nPremier jour : j'ai monté le capteur.\n" . $ajout;
        $sans = $this->apercu($alice, $profil, $retire);
        self::assertSame(['total' => 2, 'nouvelles' => 1, 'changees' => 0], $sans['journees']);
        // the preview names the days its map keeps beyond those it takes (the launch page names those Twin9 no longer
        // reads in the text it sends, sprint 4, T0)
        self::assertSame(['2026-01-06'], $sans['memoire']);
        self::assertSame([], $apres['memoire'], 'every day of the map is in the portfolio');
        $ko = Evaluations::ko(\strlen("Deuxième jour : j'ai lu les mesures.")) + Evaluations::ko(\strlen("Premier jour : j'ai monté le capteur."))
            + Evaluations::ko(\strlen('Un de plus.'));
        $fusion = Evaluations::selon($modele['fusion'], $ko);
        self::assertSame(round(($jour['moyenne'] + $fusion['moyenne']) / 1_000_000, 6), $sans['estimation']['cout_usd'],
            'la journée retirée, gardée par la mémoire');

        // evaluations that say nothing of what a day costs: a day to instruct is the reference's, and the estimate says so
        self::$pdo->exec("UPDATE twin9_evaluations SET journees = JSON_ARRAY(JSON_OBJECT('ko', 0.03, 'cout_microusd', NULL),
                                                                         JSON_OBJECT('ko', 0.03, 'cout_microusd', NULL))");
        $sansJours = $this->apercu($alice, $profil, self::PORTFOLIO . $ajout)['estimation'];
        self::assertSame(['reference' => 'PLANT-01', 'poles' => 7], array_intersect_key($sansJours, ['reference' => 1, 'poles' => 1]));
        self::assertArrayNotHasKey('evaluations', $sansJours);
        self::assertSame(1, $this->apercu($alice, $essai, self::PORTFOLIO)['estimation']['poles'],
            'un run complet ne sert pas l’estimation d’un essai');
    }

    /**
     * T8, strategy A: a launch takes the first days its owner's credit lets
     * in at the most with the merge of their map, which the run keeps in
     * reserve, and room for the worst case of a call of a day and of the
     * merge (without evaluations, a day's worth each); the others wait for a
     * next run. Without room for a day and its merge, it is refused, saying
     * what it would take; a profile's budget bounds it the same way.
     */
    public function testALaunchTakesTheDaysThatFitWithTheMergesReserve(): void
    {
        $alice = $this->registerAs('admission@example.org', 'Alice');
        $profil = $this->profil($alice);
        $trois = self::PORTFOLIO . "## 2026-01-07\nTroisième jour : j'ai présenté.\n";
        $parJour = (int) round(Lancement::REFERENCE_MICROUSD * 7 * 1.2);

        // not even a day and its merge, with the worst case of a call of each: refused, saying what it would take
        $this->credit($alice, 4 * $parJour - 1);
        self::assertSame(0, $this->apercu($alice, $profil, $trois)['admission']['journees']);
        $refus = $this->as_($alice, 'POST', '/api/twin9/runs', ['profil' => $profil, 'accord' => true,
            'portfolio' => ['nom' => 'journal-factice.md', 'texte' => $trois]]);
        self::assertSame(422, $refus->getStatusCode());
        self::assertSame('Votre crédit ne couvre pas une carte, même d’une journée : il faudrait '
            . self::dollars(4 * $parJour) . ' (une journée et sa fusion, d’après le run de référence, réserves des appels '
            . 'comprises)', self::json($refus)['error']);
        self::assertSame(self::json($refus)['error'], $this->apercu($alice, $profil, $trois)['admission']['refus'],
            'l’aperçu le dit d’avance');
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM twin9_runs')->fetchColumn());

        // the profile's budget, lower than the credit, bounds it the same way
        $this->credit($alice, 1_000_000_000);
        $budget = $this->profil($alice, 'Budget', ['budget_usd' => 5.0]);
        self::assertSame(['journees' => 1, 'total' => 3, 'limite' => 'budget', 'instruites' => 1, 'en_attente' => 2,
                          'changees_en_attente' => 0, 'autres_usd' => 0.0, 'refus' => null],
            $this->apercu($alice, $budget, $trois)['admission']);

        // a day and its merge fit, not two days and the merge: the first day goes, the others wait
        $this->credit($alice, 5_000_000);
        $e = $this->apercu($alice, $profil, $trois);
        self::assertSame([1, 2], [$e['admission']['journees'], $e['admission']['en_attente']]);
        self::assertSame(round(2 * $parJour / 1_000_000, 6), $e['estimation']['cout_usd'], 'la journée admise et sa fusion');
        $run = $this->lancer($alice, $profil, $trois);
        $ligne = self::$pdo->query("SELECT reserve_fusion_microusd, engagement_microusd, attestation FROM twin9_runs WHERE id = $run")
            ->fetch();
        self::assertSame([2 * $parJour, 4 * $parJour], [(int) $ligne['reserve_fusion_microusd'], (int) $ligne['engagement_microusd']],
            'la fusion de sa carte et un pire cas ; ce qui lui est accordé');
        self::assertEquals(['journees' => 1, 'total' => 3, 'limite' => 'credit', 'instruites' => 1, 'en_attente' => 2,
                            'changees_en_attente' => 0, 'autres_usd' => 0.0, 'reserve_microusd' => 2 * $parJour,
                            'engagement_microusd' => 4 * $parJour],
            json_decode((string) $ligne['attestation'], true)['admission'], 'l’attestation le garde');
        self::assertSame(1, $this->jusquAuBout($alice, $run)['compteurs']['journees'], 'sa première journée seule');
    }

    /**
     * T8: the days to instruct beyond what fits wait, a changed one kept in
     * its version already evaluated meanwhile; what the owner's other runs in
     * progress may still spend is deducted from their credit; a profile that
     * reads every day again takes all or none; with nothing to instruct, the
     * merge alone must fit.
     */
    public function testWhatWaitsWhatOtherRunsHoldAndWhatTakesAllOrNone(): void
    {
        $alice = $this->registerAs('attente@example.org', 'Alice');
        $profil = $this->profil($alice);
        $parJour = (int) round(Lancement::REFERENCE_MICROUSD * 7 * 1.2);
        $this->jusquAuBout($alice, $this->lancer($alice, $profil, self::PORTFOLIO));
        $trois = self::PORTFOLIO . "## 2026-01-07\nTroisième jour : j'ai présenté.\n";

        // other settings, without evaluations: its days are changed, the reference says what they cost
        $etages = ProfilRepository::v98()->etages;
        $etages->profond->effort = 'low';
        $autre = $this->profil($alice, 'Autre', ['etages' => $etages]);
        $this->credit($alice, (int) (4.5 * $parJour));
        $e = $this->apercu($alice, $autre, $trois);
        self::assertSame(['total' => 3, 'nouvelles' => 1, 'changees' => 2], $e['journees']);
        self::assertSame(['journees' => 1, 'total' => 3, 'limite' => 'credit', 'instruites' => 1, 'en_attente' => 2,
                          'changees_en_attente' => 1, 'autres_usd' => 0.0, 'refus' => null], $e['admission']);

        // a run in progress holds what it was granted: another launch counts without it
        $this->credit($alice, 6 * $parJour);
        $en = $this->lancer($alice, $autre, self::PORTFOLIO);
        self::assertSame(5 * $parJour, (int) self::$pdo->query("SELECT engagement_microusd FROM twin9_runs WHERE id = $en")
            ->fetchColumn(), 'deux journées, la fusion, deux pires cas');
        $deux = "## 2026-02-01\nUn autre journal.\n## 2026-02-02\nSa suite.\n";
        $r = $this->as_($alice, 'POST', '/api/twin9/runs/apercu',
            ['profil' => $autre, 'portfolio' => ['nom' => 'autre-journal.md', 'texte' => $deux]]);
        $a = self::json($r)['admission'];
        self::assertSame(round(5 * $parJour / 1_000_000, 6), $a['autres_usd']);
        self::assertSame('Votre crédit ne couvre pas une carte, même d’une journée : il faudrait ' . self::dollars(4 * $parJour)
            . ', en plus des ' . self::dollars(5 * $parJour) . ' que vos analyses en cours peuvent encore dépenser (une journée '
            . 'et sa fusion, d’après le run de référence, réserves des appels comprises)', $a['refus']);
        $this->as_($alice, 'POST', "/api/twin9/runs/$en/annuler");

        // a profile without memory takes all or none
        $sansMemoire = $this->profil($alice, 'Sans mémoire', ['etages' => $etages, 'memoire' => false]);
        $this->credit($alice, (int) (4.5 * $parJour));
        self::assertSame('Ce profil relit toutes ses journées à chaque analyse, et votre crédit ne couvre pas le portfolio '
            . 'entier : il faudrait ' . self::dollars(5 * $parJour) . ' (ses journées et leur fusion, d’après le run de '
            . 'référence, réserves des appels comprises)', $this->apercu($alice, $sansMemoire, self::PORTFOLIO)['admission']['refus']);

        // nothing to instruct: the merge alone, which does not fit
        $this->credit($alice, 1);
        $refus = $this->apercu($alice, $profil, self::PORTFOLIO)['admission']['refus'];
        self::assertStringStartsWith('Votre crédit ne couvre pas la fusion de la carte : il faudrait ', $refus);
        self::assertStringEndsWith(' $ (au coût le plus haut observé, réserve de ses appels comprise)', $refus);
    }

    /** Micro-dollars as a refusal says them: to the cent above. */
    private static function dollars(int $microusd): string
    {
        return number_format(ceil($microusd / 10_000) / 100, 2, ',', '') . ' $';
    }

    private function credit(array $user, int $microusd): void
    {
        self::$pdo->prepare('UPDATE twin9_credits SET balance_microusd = ? WHERE user_id = ?')->execute([$microusd, $user['id']]);
    }

    /**
     * A mixed profile's forecast (P1-5): each combination at its provider's
     * price, by its own route — another provider's worst case at its grid
     * price, never by batches —; the reference at half price only when
     * every call goes by batches; no duration as soon as one route goes by
     * batches. A profile whose lane says « lots » but whose calls all leave
     * Anthropic goes directly: full price, and its duration.
     */
    public function testAMixedForecastPricesEachCombinationByItsRoute(): void
    {
        TestDb::setEnv('OPENAI_API_KEY', 'cle-openai-factice-apercu');
        $config = new Twin9Config(new SettingsRepository(self::$pdo));
        // an invented price, high enough for its worst case to outweigh the reference's
        $config->update(['twin9_fournisseurs_ouverts' => ['anthropic', 'openai'],
                         'modeles' => $config->modeles() + ['openai:modele-fictif-1' => [
                             'prix_usd_mtok' => [1000, 1000], 'plafond_sortie' => 30000, 'plafond_reflexion' => 0,
                             'duree_max_s' => 1]]]);
        $alice = $this->registerAs('mixte@example.org', 'Alice');
        $parJour = Lancement::REFERENCE_MICROUSD * 7 * 1.2;
        $openai = (object) ['fournisseur' => 'openai', 'modele' => 'modele-fictif-1'];

        $mixte = $this->apercu($alice, $this->profil($alice, 'Mixte', ['voie' => 'lots',
            'etapes' => (object) ['greffier' => $openai]]), self::PORTFOLIO);
        self::assertSame(['anthropic' => 'lots', 'openai' => 'directe'],
            array_column($mixte['fournisseurs'], 'voie', 'id'));
        self::assertSame(round($parJour * 3 / 1_000_000, 6), $mixte['estimation']['cout_usd'],
            'pas à moitié prix : un de ses appels part en direct');
        self::assertNull($mixte['estimation']['duree_s'], 'une route par lots : la durée est celle d’Anthropic');
        self::assertGreaterThan(16000 * 1000 * 1.2 / 1_000_000 + $parJour / 1_000_000, $mixte['estimation']['reserve_usd'],
            'le pire cas de son appel chez OpenAI, au prix de la grille, avec la marge');

        $etage = (object) ['fournisseur' => 'openai', 'modele' => 'modele-fictif-1', 'budget_sortie' => 16000,
                           'reflexion' => 'coupee'];
        $tiers = $this->apercu($alice, $this->profil($alice, 'Tiers', ['voie' => 'lots',
            'etages' => (object) ['lecteurs' => $etage, 'rapide' => clone $etage, 'profond' => clone $etage]]),
            self::PORTFOLIO);
        self::assertSame([['id' => 'openai', 'libelle' => 'OpenAI', 'rgpd' => 'sous_conditions', 'voie' => 'directe']],
            $tiers['fournisseurs']);
        self::assertSame(round($parJour * 3 / 1_000_000, 6), $tiers['estimation']['cout_usd']);
        self::assertSame(Lancement::REFERENCE_SECONDES * 7 * 2, $tiers['estimation']['duree_s'],
            'sans appel d’Anthropic, tout part en direct : sa durée');
    }

    /** The preview keeps nothing, and asks what a launch asks, but the consent. */
    public function testThePreviewKeepsNothing(): void
    {
        $alice = $this->registerAs('rien@example.org', 'Alice');
        $profil = $this->profil($alice);
        $this->apercu($alice, $profil, self::PORTFOLIO);
        foreach (['twin9_runs', 'twin9_cartes', 'twin9_memoire'] as $table) {
            self::assertSame(0, (int) self::$pdo->query("SELECT COUNT(*) FROM $table")->fetchColumn(), $table);
        }
        $bob = $this->registerAs('autre@example.org', 'Bob');
        self::assertSame(404, $this->as_($bob, 'POST', '/api/twin9/runs/apercu',
            ['profil' => $profil, 'portfolio' => ['nom' => 'journal.md', 'texte' => self::PORTFOLIO]])->getStatusCode());
        self::assertSame(422, $this->as_($alice, 'POST', '/api/twin9/runs/apercu',
            ['profil' => $profil, 'portfolio' => ['nom' => 'journal.md', 'texte' => '']])->getStatusCode());
    }

    /** Every account of these tests has credit: the instance's key pays from it. */
    protected function registerAs(string $email, string $name, array $roles = ['apprenant']): array
    {
        $user = parent::registerAs($email, $name, $roles);
        (new CreditService(self::$pdo))->adjust($user['id'], 1_000_000_000, 'crédit des tests');

        return $user;
    }

    /** @return array<string, mixed> */
    private function apercu(array $user, ?int $profil, string $portfolio): array
    {
        $r = $this->as_($user, 'POST', '/api/twin9/runs/apercu',
            ['profil' => $profil, 'portfolio' => ['nom' => 'journal-factice.md', 'texte' => $portfolio]]);
        self::assertSame(200, $r->getStatusCode(), (string) $r->getBody());

        return self::json($r);
    }

    private function lancer(array $user, int $profil, string $portfolio): int
    {
        $r = $this->as_($user, 'POST', '/api/twin9/runs', ['profil' => $profil, 'accord' => true,
            'portfolio' => ['nom' => 'journal-factice.md', 'texte' => $portfolio]]);
        self::assertSame(201, $r->getStatusCode(), (string) $r->getBody());

        return self::json($r)['id'];
    }

    /** @return array<string, mixed> its progress, done */
    private function jusquAuBout(array $user, int $id): array
    {
        for ($n = 0; $n < 20; $n++) {
            $suivi = self::json($this->as_($user, 'GET', "/api/twin9/runs/$id"));
            if ($suivi['statut'] !== 'en_cours') {
                self::assertSame('termine', $suivi['statut'], (string) $suivi['retard']);

                return $suivi;
            }
            $this->as_($user, 'POST', '/api/twin9/runs/avancer');
        }
        self::fail('le run ne va pas au bout');
    }

    /** A profile of $user's, by the direct lane, with these changes. @param array<string, mixed> $changes */
    private function profil(array $user, string $nom = 'Direct', array $changes = []): int
    {
        $profil = ProfilRepository::v98();
        $profil->voie = 'directe';
        foreach ($changes as $cle => $valeur) {
            $profil->{$cle} = $valeur;
        }
        $cree = $this->as_($user, 'POST', '/api/twin9/profils', ['nom' => $nom, 'profil' => $profil]);
        self::assertSame(201, $cree->getStatusCode(), (string) $cree->getBody());

        return self::json($cree)['id'];
    }
}
