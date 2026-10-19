<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\Referentiel\ReferentielRepository;
use Humanome\Tests\CartographeTestCase;
use Humanome\Tests\TestDb;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\Lancement;
use Humanome\Twin9\ProfilRepository;
use Humanome\Twin9\ProtocoleRepository;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunTestsInSeparateProcesses;

/**
 * Before a launch (T10, Twin_v9's docs/plan-twin9-php.md, lot 2, « Coûts et
 * plafonds », « Relancer »): the launch page learns which days the run would
 * instruct — a portfolio already evaluated instructs its days new or changed
 * only —, and what it would cost and last: the average by day of the runs
 * done of the same profile in the same mode, failing those the real run of
 * PLANT-01, in test mode, times the referential's poles. The engine is the
 * fake one, the provider the local instance's simulated Anthropic. Each test
 * runs in a process of its own.
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
        $protocole = new ProtocoleRepository(self::$pdo);
        foreach (self::GABARITS as $nom => $contenu) {
            $protocole->put($nom, $contenu, null);
        }
        // the referential's seven poles, as the set's fiches carry them
        for ($p = 1; $p <= 7; $p++) {
            $protocole->put('tagger/P' . $p, 'Fiche du pôle ' . $p . '.', null);
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
     * The estimate: without a run done of the profile in its mode, the real
     * run of PLANT-01 times the referential's poles, the margin with the
     * instance's key, half price by batches whose time it cannot say; then
     * the average by day of the runs done.
     */
    public function testTheEstimateComesFromThePastRunsElseFromTheReferenceRun(): void
    {
        $alice = $this->registerAs('estimation@example.org', 'Alice');
        $profil = $this->profil($alice);

        $e = $this->apercu($alice, $profil, self::PORTFOLIO);
        $parJour = Lancement::REFERENCE_MICROUSD * 7 * 1.2;
        self::assertSame(['reference' => 'PLANT-01', 'poles' => 7], array_intersect_key($e['estimation'],
            ['reference' => 1, 'poles' => 1]));
        self::assertSame(round($parJour * 2 / 1_000_000, 2), $e['estimation']['cout_usd']);
        self::assertSame(Lancement::REFERENCE_SECONDES * 7 * 2, $e['estimation']['duree_s']);
        self::assertSame(['budget_usd' => null, 'duree_minutes' => null], $e['plafonds']);
        self::assertSame(['directe', 'instance', 1000.0], [$e['voie'], $e['cle'], $e['credit_usd']]);

        $v98 = $this->apercu($alice, null, self::PORTFOLIO);
        self::assertSame('lots', $v98['voie']);
        self::assertSame(round($parJour / 2 * 2 / 1_000_000, 2), $v98['estimation']['cout_usd'], 'à moitié prix');
        self::assertNull($v98['estimation']['duree_s'], 'par lots, la durée est celle d’Anthropic');

        $essai = $this->profil($alice, 'Essai', ['mode' => 'test']);
        $t = $this->apercu($alice, $essai, self::PORTFOLIO);
        self::assertSame(['total' => 1, 'nouvelles' => 1, 'changees' => 0], $t['journees'], 'la première journée');
        self::assertSame(1, $t['estimation']['poles'], 'le vrai run de PLANT-01 était un essai');

        $run = $this->lancer($alice, $profil, self::PORTFOLIO);
        $compteurs = $this->jusquAuBout($alice, $run)['compteurs'];
        $apres = $this->apercu($alice, $profil, self::PORTFOLIO . "## 2026-01-07\nUn de plus.\n");
        self::assertSame(1, $apres['estimation']['runs']);
        self::assertSame(round(intdiv($compteurs['cout_microusd'], 2) / 1_000_000, 4),
            $apres['estimation']['par_journee']['cout_usd']);
        self::assertSame(intdiv($compteurs['duree_s'], 2), $apres['estimation']['par_journee']['duree_s']);
        self::assertSame(1, $this->apercu($alice, $essai, self::PORTFOLIO)['estimation']['poles'],
            'un run complet ne sert pas l’estimation d’un essai');
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
