<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Llm\AnthropicProvider;
use Humanome\Llm\HttpClientException;
use Humanome\Llm\PowChallenge;
use Humanome\Llm\Pricing;
use Humanome\Llm\UsageCounters;
use Humanome\Tests\LlmTestCase;
use Humanome\Tests\TestDb;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-VIS-03 — Essayer la cartographie en direct, sans compte : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/visiteur/UC-VIS-03-essayer-cartographie-en-direct.md
 *
 * Le navigateur du visiteur (aucun cookie de session) rejoue le déroulé de la
 * page « Essayer » à travers l'API HTTP : une cartographie = 7 appels « pôle »
 * + 1 appel « kairos », chacun précédé d'un défi GET /api/llm/challenge résolu
 * (preuve de travail à 8 bits en test). Fournisseur « mock » (réponses tirées
 * de schemas/fixtures/) ou Anthropic simulé par LlmFakeHttpClient : jamais de
 * réseau réel.
 */
final class UcVis03EssayerCartographieTest extends LlmTestCase
{
    private const TEXT = 'Journée du 2026-01-06 : atelier vélo, j’ai écouté les désaccords et proposé un vote.';

    protected function setUp(): void
    {
        parent::setUp();
        $this->cookieSid = null; // visiteur sans compte
        $this->clientIp = '198.51.100.20';
    }

    private const SYSTEM = 'Tu es le cartographe.';

    /** Le prompt d'un appel du moteur (pôle n ou kairos). */
    private static function prompt(?int $pole): string
    {
        return $pole === null
            ? "SYNTHÈSE KAIROS de la journée 2026-01-06.\n" . self::TEXT
            : "Pôle {$pole} — instruction.\n{\"poleNum\": \"{$pole}\"}\n" . self::TEXT;
    }

    /** Un appel du moteur (pôle n ou kairos), défi frais résolu. */
    private function engineCall(?int $pole, string $ip = '198.51.100.20', array $extra = []): ResponseInterface
    {
        $this->clientIp = $ip;

        return $this->postLlm(array_merge(['system' => self::SYSTEM, 'prompt' => self::prompt($pole)], $extra));
    }

    /** @return array{requests: int, inputTokens: int, outputTokens: int, estimatedCostUsd: float} */
    private static function usage(): array
    {
        return (new UsageCounters(self::$pdo))->today();
    }

    #[TestDox('UC-VIS-03-F01 — nominal : statut, puis 7 appels pôle + 1 kairos, un défi par appel, compteurs seulement')]
    public function testF01NominalRunOfEightCalls(): void
    {
        $status = self::json($this->request('GET', '/api/llm/status'));
        self::assertSame(['enabled' => true, 'remainingToday' => true], $status);

        $fixture = json_decode((string) file_get_contents(\dirname(__DIR__, 4) . '/schemas/fixtures/cartographie-jour-2026-01-06.json'), true);
        foreach (range(1, 7) as $pole) {
            $response = $this->engineCall($pole);
            self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
            $body = self::json($response);
            self::assertSame(['text', 'usage', 'model', 'stopReason'], array_keys($body));
            self::assertSame('mock', $body['model']);
            self::assertEquals($fixture['poles'][$pole - 1], json_decode($body['text'], true), "pôle {$pole}");
        }
        $kairos = self::json($this->engineCall(null));
        self::assertEquals($fixture['kairos'], json_decode($kairos['text'], true));

        // Défis à usage unique : 8 défis consommés, conservés HACHÉS seulement.
        $redeemed = self::$pdo->query('SELECT challenge_hash FROM llm_pow_challenges')->fetchAll(\PDO::FETCH_COLUMN);
        self::assertCount(8, $redeemed);
        foreach ($redeemed as $hash) {
            self::assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $hash);
        }
        // Compteurs journaliers : 8 requêtes, des tokens, coût nul (mock).
        $usage = self::$pdo->query('SELECT requests, input_tokens, output_tokens, estimated_cost_usd FROM llm_usage_daily')->fetch();
        self::assertSame(8, (int) $usage['requests']);
        self::assertGreaterThan(0, (int) $usage['input_tokens']);
        self::assertEquals(0.0, (float) $usage['estimated_cost_usd']);
        self::assertNull($this->cookieSid, 'aucune session ouverte');
    }

    #[TestDox('UC-VIS-03-F02 — RGPD : ni le texte ni la réponse ne sont stockés, ni l’IP en clair (compteurs et empreintes seulement)')]
    public function testF02NothingButCountersIsStored(): void
    {
        $response = $this->engineCall(3, '203.0.113.77');
        self::assertSame(200, $response->getStatusCode());
        // Un extrait distinctif de la RÉPONSE du modèle (mock : fixture du pôle 3).
        $answer = json_decode(self::json($response)['text'], true, 512, JSON_THROW_ON_ERROR);
        $fromAnswer = (string) $answer['competences'][0]['verdict']['prescriptionMinimale'];
        self::assertGreaterThan(30, mb_strlen($fromAnswer));

        // Toutes les tables de la base, pas seulement celles de la démo.
        $tables = self::$pdo->query('SHOW TABLES')->fetchAll(\PDO::FETCH_COLUMN);
        self::assertGreaterThan(10, \count($tables));
        foreach ($tables as $table) {
            $values = [];
            foreach (self::$pdo->query('SELECT * FROM `' . $table . '`')->fetchAll(\PDO::FETCH_NUM) as $row) {
                foreach ($row as $value) {
                    $values[] = (string) $value;
                }
            }
            $dump = implode("\n", $values);
            self::assertStringNotContainsString('atelier vélo', $dump, $table);
            self::assertStringNotContainsString($fromAnswer, $dump, $table);
            self::assertStringNotContainsString('203.0.113.77', $dump, $table);
        }
        $bucket = (string) self::$pdo->query('SELECT bucket FROM rate_limits')->fetchColumn();
        self::assertMatchesRegularExpression('/^llm:[0-9a-f]{64}$/', $bucket);
    }

    #[TestDox('UC-VIS-03-F03 — A1 : fournisseur réel (Anthropic simulé) — modèle et sortie (le maximum du modèle) imposés par le serveur, coût estimé compté, clé jamais renvoyée')]
    public function testF03RealProviderIsServerImposed(): void
    {
        TestDb::setEnv('DEMO_PROVIDER', 'anthropic');
        $this->http->queueResponse(['status' => 200, 'body' => self::anthropicBody('{"poleNum":"1"}', 1000, 200)]);

        $response = $this->engineCall(1, '198.51.100.20', ['provider' => 'openai', 'model' => 'gpt-5', 'maxTokens' => 999999]);

        self::assertSame(200, $response->getStatusCode());
        self::assertStringNotContainsString(self::API_KEY, (string) $response->getBody());
        $upstream = json_decode((string) $this->http->requests[0]['body'], true);
        self::assertSame('claude-haiku-4-5-20251001', $upstream['model'], 'indication du client ignorée');
        self::assertSame(64000, $upstream['max_tokens'], 'toute la sortie du modèle, quoi que dise le client');
        self::assertSame(self::API_KEY, $this->http->requests[0]['headers']['x-api-key']);
        $cost = (float) self::$pdo->query('SELECT estimated_cost_usd FROM llm_usage_daily')->fetchColumn();
        self::assertEqualsWithDelta(0.002, $cost, 1e-6); // 1000 × 1 $ + 200 × 5 $ par million
    }

    #[TestDox('UC-VIS-03-F04 — E1 : champ piège rempli (robot) → 400 banal, sans compteur ni défi consommé')]
    public function testF04HoneypotLooksLikeAPlainValidationError(): void
    {
        $issued = $this->fetchChallenge();
        $nonce = $this->solve($issued['challenge'], $issued['difficultyBits']);

        $trap = $this->request('POST', '/api/llm', [
            'prompt' => 'Bonjour', 'challenge' => $issued['challenge'], 'nonce' => $nonce, 'website' => 'https://spam.example',
        ]);
        self::assertSame(400, $trap->getStatusCode());
        self::assertSame(['error' => 'Requête invalide'], self::json($trap));
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM llm_usage_daily')->fetchColumn());
        // Le défi n'a pas été consommé : un humain peut encore s'en servir.
        $human = $this->request('POST', '/api/llm', ['prompt' => 'Bonjour', 'challenge' => $issued['challenge'], 'nonce' => $nonce, 'website' => '']);
        self::assertSame(200, $human->getStatusCode());
    }

    #[TestDox('UC-VIS-03-F05 — E2 : preuve de travail absente, falsifiée, trop faible, expirée ou rejouée → refus codés (400/429)')]
    public function testF05ProofOfWorkFailures(): void
    {
        $missing = $this->request('POST', '/api/llm', ['prompt' => 'x']);
        self::assertSame(400, $missing->getStatusCode());
        self::assertSame('pow_required', self::json($missing)['code']);

        $issued = $this->fetchChallenge();
        $forged = substr($issued['challenge'], 0, -1) . (str_ends_with($issued['challenge'], 'a') ? 'b' : 'a');
        self::assertSame('pow_invalid', self::json($this->request('POST', '/api/llm', ['prompt' => 'x', 'challenge' => $forged, 'nonce' => '1']))['code']);
        $weak = $this->request('POST', '/api/llm', ['prompt' => 'x', 'challenge' => $issued['challenge'], 'nonce' => $this->weakNonce($issued['challenge'], 8)]);
        self::assertSame('pow_invalid', self::json($weak)['code']);

        // Défi expiré (signé avec le bon secret, émis il y a plus de 5 minutes) :
        // refusé sans être consommé.
        $expiredChallenge = (new PowChallenge(self::POW_SECRET, 8))->issue(time() - 400)['challenge'];
        $expired = $this->request('POST', '/api/llm', ['prompt' => 'x', 'challenge' => $expiredChallenge, 'nonce' => $this->solve($expiredChallenge, 8)]);
        self::assertSame(400, $expired->getStatusCode());
        self::assertSame('pow_expired', self::json($expired)['code']);
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM llm_pow_challenges')->fetchColumn());

        $nonce = $this->solve($issued['challenge'], 8);
        self::assertSame(200, $this->request('POST', '/api/llm', ['prompt' => 'x', 'challenge' => $issued['challenge'], 'nonce' => $nonce])->getStatusCode());
        $replay = $this->request('POST', '/api/llm', ['prompt' => 'x', 'challenge' => $issued['challenge'], 'nonce' => $nonce]);
        self::assertSame(429, $replay->getStatusCode());
        self::assertSame('pow_reused', self::json($replay)['code']);
        self::assertSame('1', $replay->getHeaderLine('Retry-After'));
    }

    #[TestDox('UC-VIS-03-F06 — E3 : texte absent (422) ou trop long (413), refusé avant toute preuve de travail')]
    public function testF06InputValidation(): void
    {
        TestDb::setEnv('DEMO_MAX_INPUT_CHARS', '50');
        self::assertSame(422, $this->request('POST', '/api/llm', ['prompt' => '   '])->getStatusCode());
        $long = $this->request('POST', '/api/llm', ['prompt' => str_repeat('é', 51)]);
        self::assertSame(413, $long->getStatusCode());
        self::assertStringContainsString('50 caractères maximum', self::json($long)['error']);
        self::assertSame(422, $this->request('POST', '/api/llm', ['prompt' => 'ok', 'system' => ['pas une chaîne']])->getStatusCode());
    }

    #[TestDox('UC-VIS-03-F07 — E4 : quota horaire par IP dépassé → 429 + Retry-After ; une autre IP n’est pas pénalisée')]
    public function testF07HourlyQuotaPerIp(): void
    {
        TestDb::setEnv('DEMO_PER_IP_PER_HOUR', '3');
        foreach ([1, 2, 3] as $pole) {
            self::assertSame(200, $this->engineCall($pole, '192.0.2.40')->getStatusCode());
        }
        $blocked = $this->engineCall(4, '192.0.2.40');
        self::assertSame(429, $blocked->getStatusCode());
        self::assertSame('Quota horaire atteint, réessayez plus tard.', self::json($blocked)['error']);
        self::assertGreaterThanOrEqual(30, (int) $blocked->getHeaderLine('Retry-After'));

        self::assertSame(200, $this->engineCall(4, '192.0.2.41')->getStatusCode());
    }

    #[TestDox('UC-VIS-03-F08 — E5 : budget du jour épuisé → 503 « revenez demain » ; le statut public passe à remainingToday=false')]
    public function testF08DailyBudgetExhausted(): void
    {
        TestDb::setEnv('DEMO_DAILY_GLOBAL_TOKENS', '100');
        self::$pdo->prepare('INSERT INTO llm_usage_daily (usage_date, requests, input_tokens, output_tokens, estimated_cost_usd) VALUES (?, 1, 90, 10, 0)')
            ->execute([gmdate('Y-m-d')]);

        $response = $this->engineCall(1);
        self::assertSame(503, $response->getStatusCode());
        self::assertSame('Démo épuisée pour aujourd’hui, revenez demain.', self::json($response)['error']);
        self::assertSame(['enabled' => true, 'remainingToday' => false], self::json($this->request('GET', '/api/llm/status')));
    }

    #[TestDox('UC-VIS-03-F09 — E6 : démo désactivée (ou sans secret) → défi et appel en 503, statut enabled=false')]
    public function testF09DemoDisabledOrUnconfigured(): void
    {
        TestDb::setEnv('DEMO_ENABLED', '0');
        self::assertSame(['enabled' => false, 'remainingToday' => false], self::json($this->request('GET', '/api/llm/status')));
        self::assertSame(503, $this->request('GET', '/api/llm/challenge')->getStatusCode());
        $post = $this->request('POST', '/api/llm', ['prompt' => 'x']);
        self::assertSame(503, $post->getStatusCode());
        self::assertSame('La démonstration est désactivée pour le moment.', self::json($post)['error']);

        TestDb::setEnv('DEMO_ENABLED', '1');
        TestDb::setEnv('POW_SECRET', '');
        TestDb::setEnv('MIGRATE_TOKEN', '');
        self::assertSame(['error' => 'Service indisponible'], self::json($this->request('GET', '/api/llm/challenge')));
    }

    #[TestDox('UC-VIS-03-F10 — E7 : fournisseur saturé (429 relayé), en erreur (502) ou injoignable (504) ; clé absente → 503')]
    public function testF10UpstreamFailures(): void
    {
        TestDb::setEnv('DEMO_PROVIDER', 'anthropic');
        $this->http->queueResponse(['status' => 429, 'headers' => ['retry-after' => '45'], 'body' => '{}']);
        $saturated = $this->engineCall(1);
        self::assertSame(429, $saturated->getStatusCode());
        self::assertSame('45', $saturated->getHeaderLine('Retry-After'));

        $this->http->queueResponse(['status' => 500, 'body' => '{"error":{"message":"overloaded"}}']);
        $failed = $this->engineCall(2);
        self::assertSame(502, $failed->getStatusCode());
        self::assertSame('Erreur du fournisseur LLM : overloaded', self::json($failed)['error']);

        // Refusés par le fournisseur, qui ne les facture pas : rien de compté.
        self::assertSame(['requests' => 0, 'inputTokens' => 0, 'outputTokens' => 0, 'estimatedCostUsd' => 0.0], self::usage());

        $this->http->queueException(new HttpClientException('timeout', true));
        self::assertSame(504, $this->engineCall(3)->getStatusCode());
        // Délai dépassé : le fournisseur a pu facturer l'appel, son pire cas reste réservé (RG4).
        $kept = self::usage();
        self::assertSame(\strlen(self::SYSTEM . self::prompt(3)) + AnthropicProvider::REQUEST_OVERHEAD_TOKENS, $kept['inputTokens']);
        self::assertSame(64000, $kept['outputTokens'], 'toute la sortie de Haiku 4.5');
        self::assertSame(0, $kept['requests']);

        TestDb::setEnv('ANTHROPIC_API_KEY', '');
        self::assertSame(503, $this->engineCall(4)->getStatusCode());
        self::assertSame($kept, self::usage(), 'sans clé, refus avant toute réservation');
    }

    #[TestDox('UC-VIS-03-F25 — RG4 : le pire cas d’un appel est réservé avant qu’il parte ; sans la place, 503 et rien n’est envoyé ; le budget du jour tient, appels en vol compris')]
    public function testF25WorstCaseIsReservedBeforeTheCallLeaves(): void
    {
        TestDb::setEnv('DEMO_PROVIDER', 'anthropic');
        TestDb::setEnv('DEMO_DAILY_BUDGET_USD', '0.8');
        // Pire cas d'un appel pôle 1 : un token par octet du prompt, le surcoût
        // de la requête, et toute la sortie du modèle (64 000 pour Haiku 4.5,
        // 2026-10-21), au tarif de Haiku 4.5 : 0,32 $ de sortie.
        $worstIn = \strlen(self::SYSTEM . self::prompt(1)) + AnthropicProvider::REQUEST_OVERHEAD_TOKENS;
        $worstUsd = Pricing::estimateUsd('claude-haiku-4-5-20251001', $worstIn, 64000);
        self::assertEqualsWithDelta(0.32 + $worstIn / 1_000_000, $worstUsd, 1e-9);

        // Un autre appel est en vol et tient 0,50 $ : celui-ci n'a pas la place.
        $counters = new UsageCounters(self::$pdo);
        self::assertTrue($counters->reserve(1000, 64000, 0.5, 6_000_000, 0.8));
        $refused = $this->engineCall(1);
        self::assertSame(503, $refused->getStatusCode());
        self::assertSame('Démo épuisée pour aujourd’hui, revenez demain.', self::json($refused)['error']);
        self::assertSame([], $this->http->requests, 'rien n’est parti chez le fournisseur');

        // L'autre appel est refusé par le fournisseur : sa place revient, celui-ci passe
        // et son usage réel (1 000 + 200 tokens, 0,002 $) remplace sa réservation.
        $counters->release(1000, 64000, 0.5);
        $this->http->queueResponse(['status' => 200, 'body' => self::anthropicBody('{"poleNum":"1"}', 1000, 200)]);
        self::assertSame(200, $this->engineCall(1)->getStatusCode());
        $settled = self::usage();
        self::assertSame([1, 1000, 200], [$settled['requests'], $settled['inputTokens'], $settled['outputTokens']]);
        self::assertEqualsWithDelta(0.002, $settled['estimatedCostUsd'], 1e-6);

        // Réponse 2xx illisible : facturée, le pire cas reste. Puis le délai
        // dépassé, de même. Le budget suivant n'a plus la place d'un pire cas.
        $this->http->queueResponse(['status' => 200, 'body' => 'pas du JSON']);
        self::assertSame(502, $this->engineCall(1)->getStatusCode());
        self::assertEqualsWithDelta(0.002 + $worstUsd, self::usage()['estimatedCostUsd'], 1e-6);
        $this->http->queueException(new HttpClientException('timeout', true));
        self::assertSame(504, $this->engineCall(1)->getStatusCode());
        self::assertEqualsWithDelta(0.002 + 2 * $worstUsd, self::usage()['estimatedCostUsd'], 1e-6);
        self::assertSame(503, $this->engineCall(1)->getStatusCode(), '0,64 $ + 0,32 $ > 0,80 $');
        self::assertCount(3, $this->http->requests);
        self::assertLessThanOrEqual(0.8, self::usage()['estimatedCostUsd']);
    }

    #[TestDox('UC-VIS-03-F26 — RG4 : au-delà de 100 000 octets, la réserve prend le compte d’Anthropic (count_tokens, +2 % et 64), pas les octets — le palier long de Haiku 5.5 ne frappe plus un prompt qui ne l’atteint pas ; sans compte, les octets, et le budget tient')]
    public function testF26LargePromptIsCountedByAnthropic(): void
    {
        TestDb::setEnv('DEMO_PROVIDER', 'anthropic');
        TestDb::setEnv('DEMO_MODEL', 'claude-haiku-5-5');
        TestDb::setEnv('DEMO_MAX_INPUT_CHARS', '400000');
        TestDb::setEnv('DEMO_DAILY_BUDGET_USD', '0.2');
        // 156 000 octets : comptés par octets, plus de 100 000 tokens, tout l'appel
        // au palier long — 0,40 $ de pire cas, plus que le budget du jour.
        $prompt = str_repeat('Une journée de portfolio. ', 6000);
        $octets = \strlen(self::SYSTEM . $prompt) + AnthropicProvider::REQUEST_OVERHEAD_TOKENS;
        self::assertGreaterThan(0.2, Pricing::estimateUsd('claude-haiku-5-5', $octets, 128000));

        // Anthropic en compte 40 000 : la réserve en garde 40 864, au tarif de base.
        $this->http->queueResponse(['status' => 200, 'body' => json_encode(['input_tokens' => 40000], JSON_THROW_ON_ERROR)]);
        $this->http->queueResponse(['status' => 200, 'body' => self::anthropicBody('{"ok":true}', 40000, 300, 'claude-haiku-5-5')]);
        $answer = $this->postLlm(['system' => self::SYSTEM, 'prompt' => $prompt]);

        self::assertSame(200, $answer->getStatusCode(), (string) $answer->getBody());
        [$compte, $appel] = $this->http->requests;
        self::assertSame('https://api.anthropic.com/v1/messages/count_tokens', $compte['url']);
        $corpsCompte = json_decode((string) $compte['body'], true, 512, JSON_THROW_ON_ERROR);
        $corpsAppel = json_decode((string) $appel['body'], true, 512, JSON_THROW_ON_ERROR);
        self::assertArrayNotHasKey('max_tokens', $corpsCompte);
        self::assertSame(128000, $corpsAppel['max_tokens']);
        unset($corpsAppel['max_tokens']);
        self::assertSame($corpsAppel, $corpsCompte, 'le compte porte la requête même : outil forcé, réflexion, système');
        self::assertSame(self::API_KEY, $compte['headers']['x-api-key']);
        $reel = self::usage();
        self::assertSame([1, 40000, 300], [$reel['requests'], $reel['inputTokens'], $reel['outputTokens']]);
        self::assertEqualsWithDelta(0.00415, $reel['estimatedCostUsd'], 1e-9);

        // Le compte échoue : la réserve retombe sur les octets, qui ne tiennent pas.
        $this->http->queueResponse(['status' => 529, 'body' => '{}']);
        $refused = $this->postLlm(['system' => self::SYSTEM, 'prompt' => $prompt]);
        self::assertSame(503, $refused->getStatusCode());
        self::assertCount(3, $this->http->requests, 'le compte, et rien d’autre');
        self::assertSame($reel, self::usage());

        // Sous 100 000 octets, pas de compte : les octets suffisent.
        $this->http->queueResponse(['status' => 200, 'body' => self::anthropicBody('{"ok":true}', 30, 10, 'claude-haiku-5-5')]);
        self::assertSame(200, $this->postLlm(['system' => self::SYSTEM, 'prompt' => 'Court.'])->getStatusCode());
        self::assertSame('https://api.anthropic.com/v1/messages', $this->http->requests[3]['url']);
    }
}
