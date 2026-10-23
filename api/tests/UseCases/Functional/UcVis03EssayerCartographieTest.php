<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Bootstrap;
use Humanome\Llm\AnthropicFlux;
use Humanome\Llm\AnthropicProvider;
use Humanome\Llm\FreeCreditLedger;
use Humanome\Llm\HttpClientException;
use Humanome\Llm\PowChallenge;
use Humanome\Llm\Pricing;
use Humanome\Llm\UsageCounters;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\AnthropicSse;
use Humanome\Tests\LlmTestCase;
use Humanome\Tests\TestDb;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;
use Slim\Psr7\Factory\ServerRequestFactory;

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

    /** Un appel du moteur qui demande la réponse en flux (Accept: text/event-stream), défi frais résolu. */
    private function relais(?int $pole): ResponseInterface
    {
        $issued = $this->fetchChallenge();

        return $this->request('POST', '/api/llm', [
            'system' => self::SYSTEM,
            'prompt' => self::prompt($pole),
            'challenge' => $issued['challenge'],
            'nonce' => $this->solve($issued['challenge'], $issued['difficultyBits']),
        ], ['Accept' => 'text/event-stream']);
    }

    /**
     * Les événements d'une réponse relayée, commentaires ôtés.
     *
     * @return list<array{0: string, 1: array<string, mixed>}>
     */
    private static function evenements(string $flux): array
    {
        $evenements = [];
        foreach (explode("\n\n", $flux) as $bloc) {
            if (preg_match('/^event: (\S+)\ndata: (.+)$/s', trim($bloc), $m) === 1) {
                $evenements[] = [$m[1], json_decode($m[2], true, 512, JSON_THROW_ON_ERROR)];
            }
        }

        return $evenements;
    }

    #[TestDox('UC-VIS-03-F01 — nominal : statut, puis 7 appels pôle + 1 kairos, un défi par appel, compteurs seulement')]
    public function testF01NominalRunOfEightCalls(): void
    {
        $status = self::json($this->request('GET', '/api/llm/status'));
        self::assertSame(['enabled' => true, 'remainingToday' => true, 'remainingThisMonth' => true], $status);

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

    #[TestDox('UC-VIS-03-F06 — E3 : texte absent (422), hors UTF-8 (422) ou trop long (413), refusé avant toute preuve de travail et toute réservation')]
    public function testF06InputValidation(): void
    {
        TestDb::setEnv('DEMO_MAX_INPUT_CHARS', '50');
        self::assertSame(422, $this->request('POST', '/api/llm', ['prompt' => '   '])->getStatusCode());
        $long = $this->request('POST', '/api/llm', ['prompt' => str_repeat('é', 51)]);
        self::assertSame(413, $long->getStatusCode());
        self::assertStringContainsString('50 caractères maximum', self::json($long)['error']);
        self::assertSame(422, $this->request('POST', '/api/llm', ['prompt' => 'ok', 'system' => ['pas une chaîne']])->getStatusCode());

        // Un corps de formulaire porte des octets bruts : hors UTF-8, la requête
        // amont ne pourrait pas les porter — 422, avant la preuve et toute réservation.
        $formulaire = (new ServerRequestFactory())->createServerRequest('POST', '/api/llm', ['REMOTE_ADDR' => $this->clientIp])
            ->withParsedBody(['prompt' => "Journée du 6 janvier \xFF\xFE"]);
        $illisible = Bootstrap::createApp()->handle($formulaire);
        self::assertSame([422, ['error' => 'Texte illisible : UTF-8 attendu.']], [$illisible->getStatusCode(), self::json($illisible)]);
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM llm_pow_challenges')->fetchColumn());
        self::assertSame(0, self::usage()['inputTokens']);
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
        self::assertSame(['enabled' => true, 'remainingToday' => false, 'remainingThisMonth' => true], self::json($this->request('GET', '/api/llm/status')));
    }

    #[TestDox('UC-VIS-03-F09 — E6 : démo désactivée (ou sans secret) → défi et appel en 503, statut enabled=false')]
    public function testF09DemoDisabledOrUnconfigured(): void
    {
        TestDb::setEnv('DEMO_ENABLED', '0');
        self::assertSame(['enabled' => false, 'remainingToday' => false, 'remainingThisMonth' => false], self::json($this->request('GET', '/api/llm/status')));
        self::assertSame(503, $this->request('GET', '/api/llm/challenge')->getStatusCode());
        $post = $this->request('POST', '/api/llm', ['prompt' => 'x']);
        self::assertSame(503, $post->getStatusCode());
        self::assertSame('La démonstration est désactivée pour le moment.', self::json($post)['error']);

        TestDb::setEnv('DEMO_ENABLED', '1');
        TestDb::setEnv('POW_SECRET', '');
        TestDb::setEnv('MIGRATE_TOKEN', '');
        self::assertSame(['error' => 'Service indisponible'], self::json($this->request('GET', '/api/llm/challenge')));
    }

    #[TestDox('UC-VIS-03-F10 — E7 : fournisseur saturé (429 relayé), en erreur (502) ou injoignable (502, 504 au délai) : rien n’est compté s’il n’a rien reçu ; un délai dépassé après l’envoi compte l’entrée et 1 024 tokens de sortie ; clé absente → 503')]
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

        // Partis sans être reçus — la connexion refusée, son délai dépassé : rien de compté non plus.
        $this->http->queueException(new HttpClientException('network error (curl 7)'));
        self::assertSame(502, $this->engineCall(2)->getStatusCode());
        $this->http->queueException(new HttpClientException('network error (curl 28)', true));
        $silence = $this->engineCall(2);
        self::assertSame(504, $silence->getStatusCode());
        self::assertSame('Le fournisseur LLM ne répond pas, réessayez plus tard.', self::json($silence)['error']);

        // Refusés par le fournisseur, qui ne les facture pas : rien de compté.
        self::assertSame(['requests' => 0, 'inputTokens' => 0, 'outputTokens' => 0, 'estimatedCostUsd' => 0.0], self::usage());

        // Délai dépassé APRÈS l'envoi : le fournisseur a pu facturer l'entrée, et
        // ce qu'il a produit avant que l'appel ne soit coupé (RG4, 2026-10-21).
        $this->http->queueException(new HttpClientException('network error (curl 28)', true, true));
        $coupe = $this->engineCall(3);
        self::assertSame(504, $coupe->getStatusCode());
        self::assertSame(['error' => 'La réponse a dépassé le délai de 5 s : elle est coupée.', 'code' => 'coupe'], self::json($coupe));
        $kept = self::usage();
        self::assertSame(\strlen(self::SYSTEM . self::prompt(3)) + AnthropicProvider::REQUEST_OVERHEAD_TOKENS, $kept['inputTokens']);
        self::assertSame(AnthropicFlux::MARGE_SORTIE, $kept['outputTokens'], 'rien reçu : la marge seule');
        self::assertSame(1, $kept['requests']);

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

        // Une réponse 2xx qui n'est pas un flux, illisible : rien ne borne ce qu'elle a
        // produit, son pire cas est compté. Un délai dépassé après l'envoi compte ce
        // qu'il a pu produire — l'entrée, 1 024 tokens. Un second pire cas compté, et
        // le budget n'a plus la place du suivant.
        $this->http->queueResponse(['status' => 200, 'body' => '{"content":[{"type":"text","text":"tronq']);
        self::assertSame(502, $this->engineCall(1)->getStatusCode());
        self::assertEqualsWithDelta(0.002 + $worstUsd, self::usage()['estimatedCostUsd'], 1e-6);
        $this->http->queueException(new HttpClientException('timeout', true, true));
        self::assertSame(504, $this->engineCall(1)->getStatusCode());
        $coupe = Pricing::estimateUsd('claude-haiku-4-5-20251001', $worstIn, AnthropicFlux::MARGE_SORTIE);
        self::assertEqualsWithDelta(0.002 + $worstUsd + $coupe, self::usage()['estimatedCostUsd'], 1e-6);
        $this->http->queueResponse(['status' => 200, 'body' => '{"content":[{"type":"text","text":"tronq']);
        self::assertSame(502, $this->engineCall(1)->getStatusCode());
        self::assertSame(503, $this->engineCall(1)->getStatusCode(), '0,65 $ + 0,32 $ > 0,80 $');
        self::assertCount(4, $this->http->requests);
        self::assertLessThanOrEqual(0.8, self::usage()['estimatedCostUsd']);
    }

    #[TestDox('UC-VIS-03-F26 — RG4 : au-delà de 100 000 octets, la réserve prend le compte d’Anthropic (count_tokens, +10 % et 64), pas les octets — le palier long de Haiku 5.5 ne frappe plus un prompt qui ne l’atteint pas ; un compte absent, nul, illisible ou au-dessus des octets laisse les octets ; le budget tient')]
    public function testF26LargePromptIsCountedByAnthropic(): void
    {
        TestDb::setEnv('DEMO_PROVIDER', 'anthropic');
        TestDb::setEnv('DEMO_MODEL', 'claude-haiku-5-5');
        TestDb::setEnv('DEMO_MAX_INPUT_CHARS', '400000');
        // 156 000 octets : comptés par octets, plus de 100 000 tokens, tout l'appel
        // au palier long — 0,40 $ de pire cas, plus que le budget du jour.
        $prompt = str_repeat('Une journée de portfolio. ', 6000);
        $octets = \strlen(self::SYSTEM . $prompt) + AnthropicProvider::REQUEST_OVERHEAD_TOKENS;
        self::assertGreaterThan(0.2, Pricing::estimateUsd('claude-haiku-5-5', $octets, 128000));

        // La marge, au jeton près : 40 000 comptés réservent ceil(40 000 × 1,10) + 64 = 44 064
        // tokens d'entrée et toute la sortie, 0,0684064 $ ; 41 000 en réserveraient 0,0685164 $.
        $reserve = static fn (int $entree): float => Pricing::estimateUsd('claude-haiku-5-5', $entree, 128000);
        self::assertEqualsWithDelta(0.0684064, $reserve(44_064), 1e-12);
        TestDb::setEnv('DEMO_DAILY_BUDGET_USD', '0.0685');
        $this->http->queueResponse(['status' => 200, 'body' => json_encode(['input_tokens' => 41000], JSON_THROW_ON_ERROR)]);
        self::assertSame(503, $this->postLlm(['system' => self::SYSTEM, 'prompt' => $prompt])->getStatusCode(),
            '45 164 tokens réservés : 0,0685164 $ > 0,0685 $');
        self::assertCount(1, $this->http->requests, 'le compte seul : l’appel n’est pas parti');

        // Anthropic en compte 40 000 : la réserve tient, au tarif de base.
        $this->http->queueResponse(['status' => 200, 'body' => json_encode(['input_tokens' => 40000], JSON_THROW_ON_ERROR)]);
        $this->http->queueResponse(['status' => 200, 'body' => self::anthropicBody('{"ok":true}', 40000, 300, 'claude-haiku-5-5')]);
        $answer = $this->postLlm(['system' => self::SYSTEM, 'prompt' => $prompt]);

        self::assertSame(200, $answer->getStatusCode(), (string) $answer->getBody());
        [, $compte, $appel] = $this->http->requests;
        self::assertSame('https://api.anthropic.com/v1/messages/count_tokens', $compte['url']);
        $corpsCompte = json_decode((string) $compte['body'], true, 512, JSON_THROW_ON_ERROR);
        $corpsAppel = json_decode((string) $appel['body'], true, 512, JSON_THROW_ON_ERROR);
        self::assertArrayNotHasKey('max_tokens', $corpsCompte);
        self::assertSame(128000, $corpsAppel['max_tokens']);
        self::assertTrue($corpsAppel['stream'], 'l’appel arrive en flux ; le compte, non');
        self::assertTrue($corpsAppel['tools'][0]['eager_input_streaming'], 'qui ne change aucun token : le compte ne le porte pas');
        unset($corpsAppel['max_tokens'], $corpsAppel['stream'], $corpsAppel['tools'][0]['eager_input_streaming']);
        self::assertSame($corpsAppel, $corpsCompte, 'le compte porte la requête même : outil forcé, réflexion, système');
        self::assertSame(self::API_KEY, $compte['headers']['x-api-key']);
        $reel = self::usage();
        self::assertSame([1, 40000, 300], [$reel['requests'], $reel['inputTokens'], $reel['outputTokens']]);
        self::assertEqualsWithDelta(0.00415, $reel['estimatedCostUsd'], 1e-9);

        // Un compte qu'on ne peut pas croire laisse les octets, qui ne tiennent pas : rien d'autre ne part.
        TestDb::setEnv('DEMO_DAILY_BUDGET_USD', '0.2');
        $mauvais = [
            'refusé' => ['status' => 529, 'body' => '{}'],
            'nul' => ['status' => 200, 'body' => '{"input_tokens":0}'],
            'négatif' => ['status' => 200, 'body' => '{"input_tokens":-5}'],
            'en texte' => ['status' => 200, 'body' => '{"input_tokens":"40000"}'],
            'au-dessus des octets' => ['status' => 200, 'body' => json_encode(['input_tokens' => $octets * 2], JSON_THROW_ON_ERROR)],
        ];
        foreach ($mauvais as $cas => $reponse) {
            $avant = \count($this->http->requests);
            $this->http->queueResponse($reponse);
            self::assertSame(503, $this->postLlm(['system' => self::SYSTEM, 'prompt' => $prompt])->getStatusCode(), $cas);
            self::assertCount($avant + 1, $this->http->requests, $cas . ' : le compte, et rien d’autre');
        }
        $this->http->queueException(new HttpClientException('timeout', true));
        self::assertSame(503, $this->postLlm(['system' => self::SYSTEM, 'prompt' => $prompt])->getStatusCode(), 'compte sans réponse');
        self::assertSame($reel, self::usage());

        // Sous 100 000 octets, pas de compte : les octets suffisent.
        $avant = \count($this->http->requests);
        $this->http->queueResponse(['status' => 200, 'body' => self::anthropicBody('{"ok":true}', 30, 10, 'claude-haiku-5-5')]);
        self::assertSame(200, $this->postLlm(['system' => self::SYSTEM, 'prompt' => 'Court.'])->getStatusCode());
        self::assertSame('https://api.anthropic.com/v1/messages', $this->http->requests[$avant]['url']);
    }

    #[TestDox('UC-VIS-03-F27 — RG4, RG6, E7 : la réponse arrive en flux (Accept: text/event-stream), le JSON de l’outil à mesure qu’il s’écrit — progression en caractères, puis le résultat que donnerait la route ; une erreur avant que la réponse commence est un refus, rien de compté ; coupée en route (délai, erreur du fournisseur, navigateur parti), elle est comptée pour ce qu’elle a produit : l’entrée annoncée, les octets reçus et 1 024 tokens')]
    public function testF27AnswerStreamsAndACutCallCountsWhatItProduced(): void
    {
        TestDb::setEnv('DEMO_PROVIDER', 'anthropic');
        $document = '{"poleNum":"1","competences":[{"nom":"Écouter"}]}';
        $this->http->queueStream(AnthropicSse::complet($document, 900, 40, 'claude-haiku-4-5-20251001', 'tool_use', true));
        $flux = $this->relais(1);
        self::assertSame(200, $flux->getStatusCode());
        self::assertSame('text/event-stream; charset=utf-8', $flux->getHeaderLine('Content-Type'));
        self::assertSame('no', $flux->getHeaderLine('X-Accel-Buffering'));
        $evenements = self::evenements((string) $flux->getBody());
        self::assertSame(['resultat', ['text' => $document, 'usage' => ['inputTokens' => 900, 'outputTokens' => 40],
            'model' => 'claude-haiku-4-5-20251001', 'stopReason' => 'tool_use']], array_pop($evenements));
        self::assertNotSame([], $evenements, 'au moins une progression avant le résultat');
        foreach ($evenements as [$nom, $donnees]) {
            self::assertSame('progression', $nom);
            self::assertGreaterThan(0, $donnees['caracteres']);
            self::assertLessThanOrEqual(mb_strlen($document), $donnees['caracteres']);
        }
        $corps = json_decode((string) $this->http->requests[0]['body'], true, 512, JSON_THROW_ON_ERROR);
        self::assertTrue($corps['stream']);
        // Le JSON de l'outil vient à mesure qu'il s'écrit, sans quoi rien ne viendrait avant
        // chaque valeur entière, et les octets reçus d'un appel coupé ne borneraient rien.
        self::assertTrue($corps['tools'][0]['eager_input_streaming']);
        $usage = self::usage();
        self::assertSame([1, 900, 40], [$usage['requests'], $usage['inputTokens'], $usage['outputTokens']]);

        // Une erreur avant que la réponse commence : un refus, rien de compté.
        $this->http->queueStream([AnthropicSse::evenement('error', ['error' => ['type' => 'overloaded_error', 'message' => 'Overloaded']])]);
        $refus = self::evenements((string) $this->relais(1)->getBody());
        self::assertSame(['erreur', ['status' => 502, 'error' => 'Erreur du fournisseur LLM : Overloaded']], end($refus));
        self::assertSame($usage, self::usage());

        // Délai dépassé en route : l'erreur arrive par le flux, l'appel compte l'entrée
        // annoncée et les octets reçus, plus la marge — pas son pire cas.
        $partiel = '{"poleNum":"2","competences":[{"nom":"Arg';
        $this->http->queueStream(AnthropicSse::debut($partiel, 700, 'claude-haiku-4-5-20251001', true), 200,
            new HttpClientException('network error (curl 28)', true, true));
        $coupe = self::evenements((string) $this->relais(2)->getBody());
        self::assertSame(['erreur', ['status' => 504, 'error' => 'La réponse a dépassé le délai de 5 s : elle est coupée.',
            'code' => 'coupe']], end($coupe));
        $usage = self::usage();
        self::assertSame([2, 900 + 700, 40 + \strlen($partiel) + AnthropicFlux::MARGE_SORTIE],
            [$usage['requests'], $usage['inputTokens'], $usage['outputTokens']]);

        // Une erreur du fournisseur en route (surcharge) : de même, en 502.
        $this->http->queueStream([...AnthropicSse::debut($partiel, 650, 'claude-haiku-4-5-20251001', true),
            AnthropicSse::evenement('error', ['error' => ['type' => 'overloaded_error', 'message' => 'Overloaded']])]);
        $surcharge = self::evenements((string) $this->relais(3)->getBody());
        self::assertSame(['erreur', ['status' => 502, 'error' => 'Le fournisseur LLM a interrompu sa réponse, réessayez plus tard.',
            'code' => 'coupe']], end($surcharge));
        $usage = self::usage();
        self::assertSame([3, 900 + 700 + 650, 40 + 2 * (\strlen($partiel) + AnthropicFlux::MARGE_SORTIE)],
            [$usage['requests'], $usage['inputTokens'], $usage['outputTokens']]);

        // Le navigateur part après la première progression : l'appel est coupé, et
        // compté pour ce qui était arrivé — le premier morceau du document.
        $this->http->queueStream(AnthropicSse::complet($document, 600, 40, 'claude-haiku-4-5-20251001', 'tool_use', true));
        $parti = $this->relais(4)->getBody();
        self::assertSame('progression', self::evenements($parti->read(8192))[0][0]);
        $parti->close();
        $premier = mb_substr($document, 0, (int) ceil(mb_strlen($document) / 3));
        $usage = self::usage();
        self::assertSame([4, 900 + 700 + 650 + 600, 40 + 2 * (\strlen($partiel) + AnthropicFlux::MARGE_SORTIE)
            + \strlen($premier) + AnthropicFlux::MARGE_SORTIE], [$usage['requests'], $usage['inputTokens'], $usage['outputTokens']]);
        self::assertSame('', $parti->read(8192), 'rien de plus après le départ');
        self::assertSame(4, self::usage()['requests'], 'compté une fois');
    }

    /** The month's ledger of the offered credits, under a cap (USD). @return array<string, mixed> */
    private static function mois(float $capUsd): array
    {
        return (new FreeCreditLedger(self::$pdo))->state(FreeCreditLedger::capMicrousd($capUsd));
    }

    #[TestDox('UC-VIS-03-F28 — RG7, E8 : plafond du mois simulé à 0,01 $, fournisseur mock — le pire cas d’un appel (toute la sortie de Haiku 4.5, ≈ 0,32 $) n’y tient pas : 503 « Les crédits offerts de ce mois sont épuisés ; revenez le 1er … », code offerts_epuises, rien de réservé, rien au jour ; le mois passe avant le jour ; sous un plafond qui le couvre, l’appel passe et se règle au coût réel ; un mois dépensé ailleurs (le tuteur) refuse le suivant ; le statut public le dit')]
    public function testF28MonthlyCapRefusesClearlyBeforeTheDay(): void
    {
        TestDb::setEnv('OFFERTS_MENSUEL_USD', '0.01');
        $refused = $this->engineCall(1);
        self::assertSame(503, $refused->getStatusCode());
        self::assertSame(['error' => FreeCreditLedger::refusalMessage(), 'code' => 'offerts_epuises'], self::json($refused));
        self::assertStringStartsWith('Les crédits offerts de ce mois sont épuisés ; revenez le 1er ', self::json($refused)['error']);
        self::assertSame(['requests' => 0, 'inputTokens' => 0, 'outputTokens' => 0, 'estimatedCostUsd' => 0.0], self::usage(),
            'le budget du jour n’a rien vu');
        self::assertSame([0, 0, 0, 1], [self::mois(0.01)['spentMicrousd'], self::mois(0.01)['reservedMicrousd'],
            self::mois(0.01)['calls'], self::mois(0.01)['refusals']]);

        // Le jour épuisé lui aussi : c'est le mois qui répond (« revenez le 1er », pas « demain »).
        TestDb::setEnv('DEMO_DAILY_BUDGET_USD', '0');
        self::assertSame('offerts_epuises', self::json($this->engineCall(2))['code'] ?? null);
        TestDb::setEnv('DEMO_DAILY_BUDGET_USD', '5');

        // Sous 0,40 $, le pire cas (0,32 $ et l'entrée) tient : l'appel passe, et sa
        // réserve se règle au coût réel — nul pour le mock.
        TestDb::setEnv('OFFERTS_MENSUEL_USD', '0.40');
        self::assertSame(200, $this->engineCall(1)->getStatusCode());
        self::assertSame([0, 0, 1], [self::mois(0.40)['spentMicrousd'], self::mois(0.40)['reservedMicrousd'], self::mois(0.40)['calls']]);

        // 0,10 $ dépensés ailleurs ce mois-ci (le tuteur partage le plafond) : 0,10 + 0,32 > 0,40.
        $ledger = new FreeCreditLedger(self::$pdo);
        self::assertTrue($ledger->reserve(100_000, 400_000));
        $ledger->settle(100_000, 100_000);
        self::assertSame(['error' => FreeCreditLedger::refusalMessage(), 'code' => 'offerts_epuises'],
            self::json($this->engineCall(3)));
        self::assertSame(1, self::usage()['requests'], 'aucun appel de plus');
        self::assertSame(['enabled' => true, 'remainingToday' => true, 'remainingThisMonth' => true],
            self::json($this->request('GET', '/api/llm/status')), 'il reste 0,30 $ : moins qu’un pire cas, mais pas rien');

        // Le mois entier dépensé : le statut public passe à remainingThisMonth=false, /api/status aussi.
        self::assertTrue($ledger->reserve(300_000, 400_000));
        $ledger->settle(300_000, 300_000);
        self::assertSame(['enabled' => true, 'remainingToday' => true, 'remainingThisMonth' => false],
            self::json($this->request('GET', '/api/llm/status')));
        self::assertFalse(self::json($this->request('GET', '/api/status'))['demo']['remainingThisMonth']);
    }

    #[TestDox('UC-VIS-03-F29 — RG7 : un échec libère la réserve du mois — 429, erreur du fournisseur, connexion refusée, délai avant l’envoi, erreur avant que la réponse commence, refus du budget du jour : rien ne reste ; une réponse rendue se règle au coût réel, une réponse coupée après l’envoi à ce qu’elle a produit ; sans clé, rien n’est réservé')]
    public function testF29AFailureReleasesTheMonthsReservation(): void
    {
        TestDb::setEnv('DEMO_PROVIDER', 'anthropic');
        $vide = static fn (): array => [self::mois(20.0)['spentMicrousd'], self::mois(20.0)['reservedMicrousd'], self::mois(20.0)['calls']];

        $this->http->queueResponse(['status' => 429, 'headers' => ['retry-after' => '45'], 'body' => '{}']);
        self::assertSame(429, $this->engineCall(1)->getStatusCode());
        $this->http->queueResponse(['status' => 500, 'body' => '{"error":{"message":"overloaded"}}']);
        self::assertSame(502, $this->engineCall(1)->getStatusCode());
        $this->http->queueException(new HttpClientException('network error (curl 7)'));
        self::assertSame(502, $this->engineCall(1)->getStatusCode());
        $this->http->queueException(new HttpClientException('network error (curl 28)', true));
        self::assertSame(504, $this->engineCall(1)->getStatusCode());
        $this->http->queueStream([AnthropicSse::evenement('error', ['error' => ['type' => 'overloaded_error', 'message' => 'Overloaded']])]);
        $refus = self::evenements((string) $this->relais(1)->getBody());
        self::assertSame(['erreur', ['status' => 502, 'error' => 'Erreur du fournisseur LLM : Overloaded']], end($refus));
        self::assertSame([0, 0, 0], $vide(), 'refusés par le fournisseur, qui ne facture rien : rien ne reste');

        // Le budget du jour refuse après le mois : la réserve du mois revient aussi.
        TestDb::setEnv('DEMO_DAILY_BUDGET_USD', '0.0001');
        self::assertSame('Démo épuisée pour aujourd’hui, revenez demain.', self::json($this->engineCall(1))['error']);
        self::assertSame([0, 0, 0], $vide());
        TestDb::setEnv('DEMO_DAILY_BUDGET_USD', '5');

        // Rendue : 1 000 + 200 tokens de Haiku 4.5, 0,002 $ = 2 000 µ$.
        $this->http->queueResponse(['status' => 200, 'body' => self::anthropicBody('{"poleNum":"1"}', 1000, 200)]);
        self::assertSame(200, $this->engineCall(1)->getStatusCode());
        self::assertSame([2_000, 0, 1], $vide());

        // Coupée par le délai APRÈS l'envoi : l'entrée et la marge, comme au jour.
        $this->http->queueException(new HttpClientException('network error (curl 28)', true, true));
        self::assertSame(504, $this->engineCall(3)->getStatusCode());
        $worstIn = \strlen(self::SYSTEM . self::prompt(3)) + AnthropicProvider::REQUEST_OVERHEAD_TOKENS;
        $coupe = FreeCreditLedger::microusd(Pricing::estimateUsd('claude-haiku-4-5-20251001', $worstIn, AnthropicFlux::MARGE_SORTIE));
        self::assertSame([2_000 + $coupe, 0, 2], $vide());

        TestDb::setEnv('ANTHROPIC_API_KEY', '');
        self::assertSame(503, $this->engineCall(4)->getStatusCode());
        self::assertSame([2_000 + $coupe, 0, 2, 0], [...$vide(), self::mois(20.0)['refusals']], 'sans clé, refus avant toute réservation');
    }

    #[TestDox('UC-VIS-03-F30 — RG7 : une réponse en cours n’est jamais coupée — pendant qu’elle arrive en flux, l’administrateur ferme les crédits offerts (plafond à 0) et le mois est dépensé ailleurs : elle arrive entière, se règle au coût réel ; l’appel suivant est refusé ; de même sans relais (JSON)')]
    public function testF30AnAnswerInProgressIsNeverCut(): void
    {
        TestDb::setEnv('DEMO_PROVIDER', 'anthropic');
        TestDb::setEnv('OFFERTS_MENSUEL_USD', '0.40');
        $document = '{"poleNum":"1","competences":[{"nom":"Écouter"}]}';
        $pendant = static function (): void {
            (new SettingsRepository(self::$pdo))->set('demo_overrides', ['monthlyFreeUsd' => 0]);
            self::$pdo->exec('UPDATE free_credit_monthly SET spent_microusd = spent_microusd + 400000');
        };
        $this->http->queueStream(AnthropicSse::complet($document, 900, 40, 'claude-haiku-4-5-20251001', 'tool_use', true),
            200, null, $pendant);
        $evenements = self::evenements((string) $this->relais(1)->getBody());
        self::assertSame(['resultat', ['text' => $document, 'usage' => ['inputTokens' => 900, 'outputTokens' => 40],
            'model' => 'claude-haiku-4-5-20251001', 'stopReason' => 'tool_use']], array_pop($evenements));
        $reel = FreeCreditLedger::microusd(Pricing::estimateUsd('claude-haiku-4-5-20251001', 900, 40));
        self::assertSame([400_000 + $reel, 0, 1], [self::mois(0.0)['spentMicrousd'], self::mois(0.0)['reservedMicrousd'],
            self::mois(0.0)['calls']]);
        self::assertSame('offerts_epuises', self::json($this->engineCall(2))['code'] ?? null);
        self::assertCount(1, $this->http->requests, 'l’appel suivant n’est pas parti');

        // Sans relais : la route lit le flux jusqu'au bout, puis répond en JSON.
        self::$pdo->exec('DELETE FROM free_credit_monthly');
        (new SettingsRepository(self::$pdo))->delete('demo_overrides');
        $this->http->queueStream(AnthropicSse::complet($document, 900, 40, 'claude-haiku-4-5-20251001', 'tool_use', true),
            200, null, $pendant);
        $entiere = $this->engineCall(1);
        self::assertSame(200, $entiere->getStatusCode());
        self::assertSame($document, self::json($entiere)['text']);
        self::assertSame([400_000 + $reel, 0, 1], [self::mois(0.0)['spentMicrousd'], self::mois(0.0)['reservedMicrousd'],
            self::mois(0.0)['calls']]);
        (new SettingsRepository(self::$pdo))->delete('demo_overrides');
    }
}
