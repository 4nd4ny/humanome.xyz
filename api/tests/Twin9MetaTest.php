<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;
use Humanome\Llm\LlmRuntime;
use Humanome\Packages\SettingsRepository;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\ProtocoleRepository;
use Humanome\Twin9\Twin9Config;

/**
 * GET /api/twin9/meta (ADR-010 §2/§3) — what the credit page and the open
 * cartography (Twin6) read: the Twin6 offer, the packs, PayPal's
 * availability, the referential's structure, the own balance and whether
 * the account may buy — a school only (ADR-013 §5) —, with why not. Never a
 * template, never a fiche; since ADR-013, nor whether a private key is
 * stored, which no run reads any more.
 *
 * T11 removed the browser's engine and its proxy, POST /api/twin9/appel: the
 * meta no longer lists the steps, the Twin9 offer or the pipeline's settings,
 * which only that engine read, and the proxy answers as an unknown route. The
 * promotion's state, which no view read, left it on 2026-10-20.
 *
 * SECRECY IMPERATIVE (ADR-010): every template here is a MADE-UP fixture —
 * no real Twin9 content in tests, ever.
 */
final class Twin9MetaTest extends CartographeTestCase
{
    private const MASTER_KEY_HEX = 'aa11bb22cc33dd44ee55ff6600112233445566778899aabbccddeeff00112233';

    /** Entirely fictional template with a distinctive phrase. */
    private const FAKE_GABARIT = "Consigne FICTIVE : le perroquet bleu compte les nuages violets au-dessus du volcan endormi chaque matin.\nAnalyse {\$TEXTE_JOURNEE} pour {\$PRENOM}.";

    private LlmFakeHttpClient $http;

    /** @var array{id: int, csrf: string, sid: string} */
    private array $user;

    protected function setUp(): void
    {
        parent::setUp(); // wipes users (credits cascade) and rate_limits
        $pdo = Db::get();
        $pdo->exec('DELETE FROM twin9_protocole_versions');
        $pdo->exec('DELETE FROM twin9_protocole');
        $pdo->exec("DELETE FROM settings WHERE name IN ('twin9_config', 'twin9_referentiel')");

        TestDb::setEnv('ANTHROPIC_API_KEY', 'sk-ant-platform-test-key');
        TestDb::setEnv('SODIUM_MASTER_KEY', self::MASTER_KEY_HEX);
        TestDb::setEnv('PAYPAL_CLIENT_ID', '');

        $this->http = new LlmFakeHttpClient();
        LlmRuntime::setHttpClient($this->http);

        (new ProtocoleRepository($pdo))->put('fictif/01-essai', self::FAKE_GABARIT, null);

        $this->user = $this->registerAs('ada@example.org', 'Ada', ['apprenant']);
    }

    protected function tearDown(): void
    {
        LlmRuntime::setHttpClient(null);
        parent::tearDown();
    }

    public function testRequiresSession(): void
    {
        $this->cookieSid = null;
        self::assertSame(401, $this->request('GET', '/api/twin9/meta')->getStatusCode());
    }

    public function testServesWhatTheCreditPageAndTwin6ReadButNeverContent(): void
    {
        (new CreditService(Db::get()))->topup($this->user['id'], 2_500_000, 'PAYPAL-TEST-5');

        $response = $this->as_($this->user, 'GET', '/api/twin9/meta');
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        $body = self::json($response);

        // Exactly these fields: the steps, the Twin9 offer, the pipeline's
        // settings and the enabled flag left with the browser's engine (T11),
        // the promotion's state, which no view read, on 2026-10-20, whether a
        // private key is stored with the personal lane (ADR-013); who may pay its paid usage (ADR-013 §4, S6b).
        self::assertSame(['modeles_twin6', 'packs', 'referentiel', 'paypalConfigured',
            'solde_microusd', 'peut_acheter', 'achat_pourquoi', 'payeurs'], array_keys($body));
        // Twin6 (open) prices at its own +10 % contribution (list [2, 10] × 1.1), margin itself absent.
        self::assertSame([2.2, 11], $body['modeles_twin6']['claude-sonnet-5']); // 11.0 travels as 11 in JSON
        self::assertSame([10, 20, 50, 100, 200, 500], array_column($body['packs'], 'montant_usd'));
        self::assertSame([], $body['referentiel']); // none imported
        self::assertFalse($body['paypalConfigured']);
        self::assertSame(2_500_000, $body['solde_microusd']);
        // a learner does not buy; the balance it has is its to spend down (ADR-013 §2 c, e)
        self::assertFalse($body['peut_acheter']);
        self::assertStringStartsWith('Pour ne pas avoir à vérifier l’âge des apprenants, seules les écoles achètent',
            $body['achat_pourquoi']);

        // THE secrecy assertion: nothing of the template leaves, not even its name.
        self::assertStringNotContainsString('perroquet', (string) $response->getBody());
        self::assertStringNotContainsString('fictif/01-essai', (string) $response->getBody());

        // a key stored before: the meta says nothing of it
        StoredKeys::seed(Db::get(), $this->user['id'], 'anthropic', 'sk-ant-user-private-key');
        self::assertArrayNotHasKey('cle_privee_disponible', self::json($this->as_($this->user, 'GET', '/api/twin9/meta')));

        // a school may buy, without a why
        $ecole = $this->registerAs('ecole@example.org', 'École', ['etablissement']);
        $deLEcole = self::json($this->as_($ecole, 'GET', '/api/twin9/meta'));
        self::assertTrue($deLEcole['peut_acheter']);
        self::assertNull($deLEcole['achat_pourquoi']);
    }

    public function testFichesAreNeverExposed(): void
    {
        // The referential's structure /meta serves keeps names and codes only: a
        // preamble or a fiche given along with it never leaves (since 2026-10-20
        // the import sends no fiche, and no setting keeps one).
        (new Twin9Config(new SettingsRepository(Db::get())))->setReferentiel([
            ['num' => 1, 'nom' => 'TÊTE — Penser', 'header' => 'PRÉAMBULE SECRET', 'competences' => [
                ['code' => '1.01', 'nom' => 'Pensée', 'fiche_md' => 'FICHE ULTRA CONFIDENTIELLE'],
            ]],
        ]);
        $raw = (string) $this->as_($this->user, 'GET', '/api/twin9/meta')->getBody();
        self::assertStringContainsString('Pensée', $raw);
        self::assertStringNotContainsString('CONFIDENTIELLE', $raw);
        self::assertStringNotContainsString('PRÉAMBULE SECRET', $raw);
        self::assertStringNotContainsString('fiche_md', $raw);
    }

    public function testTheBrowserEnginesProxyIsGone(): void
    {
        (new CreditService(Db::get()))->topup($this->user['id'], 5_000_000, 'PAYPAL-TEST-6');

        $previousLog = ini_set('error_log', '/dev/null'); // the error middleware logs the HttpNotFoundException
        try {
            $response = $this->as_($this->user, 'POST', '/api/twin9/appel', [
                'etape' => 'fictif/01-essai',
                'variables' => ['TEXTE_JOURNEE' => 'Journal du jour.', 'PRENOM' => 'Ada'],
                'modele' => 'claude-sonnet-5',
                'etage' => 'rapide',
                'facturation' => 'platform',
            ]);
        } finally {
            ini_set('error_log', $previousLog === false ? '' : $previousLog);
        }

        self::assertSame(404, $response->getStatusCode(), (string) $response->getBody());
        self::assertStringNotContainsString('perroquet', (string) $response->getBody());
        self::assertSame([], $this->http->requests, 'nothing reaches the provider');
        self::assertSame(5_000_000, (new CreditService(Db::get()))->balance($this->user['id']), 'nothing is debited');
    }
}
