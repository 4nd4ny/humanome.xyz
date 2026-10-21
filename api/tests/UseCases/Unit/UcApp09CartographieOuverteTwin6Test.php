<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Auth\Users;
use Humanome\Llm\AnthropicFlux;
use Humanome\Llm\HttpClientException;
use Humanome\MigrationRunner;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\AnthropicSse;
use Humanome\Tests\LlmFakeHttpClient;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\TwinSupport;
use Humanome\Twin9\AnthropicCaller;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\SoldeInsuffisantException;
use Humanome\Twin9\Twin9Config;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-APP-09 — Lancer une cartographie ouverte (Twin6) : tests UNITAIRES (API).
 *
 * Fiche : docs/cas-utilisation/apprenant/UC-APP-09-cartographie-ouverte-twin6.md
 *
 * Les classes sollicitées par POST /api/twin6/appel (voie « crédits ») sont
 * appelées directement, sans couche HTTP : tarification à la contribution
 * Twin6 (Twin9Config, protocole 'twin6'), réserve pire-cas puis réconciliation
 * (CreditService), refus de découvert (SoldeInsuffisantException) et appel
 * amont verrouillé, en flux (AnthropicCaller::params, AnthropicFlux, via le
 * faux client HTTP).
 */
final class UcApp09CartographieOuverteTwin6Test extends TestCase
{
    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    protected function setUp(): void
    {
        self::$pdo->exec('DELETE FROM users'); // crédits et grand-livre en cascade
        self::$pdo->exec("DELETE FROM settings WHERE name = 'twin9_config'");
    }

    private static function user(string $email = 'lea@example.org'): int
    {
        self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([$email, Users::hashPassword('x-password'), 'Léa']);

        return (int) self::$pdo->lastInsertId();
    }

    private static function config(): Twin9Config
    {
        return new Twin9Config(new SettingsRepository(self::$pdo));
    }

    #[TestDox('UC-APP-09-U21 — coût réel Twin6 = tokens × prix catalogue × 1,10, arrondi au micro-USD supérieur, moins cher que Twin9 (× 1,20)')]
    public function testU21Twin6CostUsesItsOwnContribution(): void
    {
        $config = self::config();
        // Sonnet 5 à 2 / 10 (page des prix d'Anthropic, 2026-10-21) : 1000×2×1,1 + 200×10×1,1 = 4 400 µUSD.
        self::assertSame(4400, $config->coutMicrousd('claude-sonnet-5', 1000, 200, 'twin6'));
        // Une fraction de µUSD est arrondie AU-DESSUS (jamais en faveur de l'apprenant) :
        // 1001×2,2 = 2 202,2 → 2 203, plus 201×11 = 2 211.
        self::assertSame(4414, $config->coutMicrousd('claude-sonnet-5', 1001, 201, 'twin6'));
        self::assertSame(4800, $config->coutMicrousd('claude-sonnet-5', 1000, 200, 'twin9'));
        self::assertSame(4800, $config->coutMicrousd('claude-sonnet-5', 1000, 200), 'protocole par défaut = twin9');
        self::assertSame(0, $config->coutMicrousd('claude-sonnet-5', 0, 0, 'twin6'));
        self::assertNull($config->coutMicrousd('modele-fantome', 1000, 200, 'twin6'));
        self::assertSame(1.1, $config->marge('twin6'));
        self::assertSame(1.2, $config->marge('twin9'));
    }

    #[TestDox('UC-APP-09-U22 — réserve pire-cas Twin6 (octets du prompt + max_tokens) : toujours ≥ au coût réel')]
    public function testU22WorstCaseReserveCoversAnyRealCost(): void
    {
        $config = self::config();
        $promptBytes = \strlen("Analyse le pôle 1 — portfolio d’Élise : « j’ai recoupé »");
        $reserve = $config->reserveMicrousd('claude-sonnet-5', $promptBytes, 8192, 'twin6');
        self::assertSame($config->coutMicrousd('claude-sonnet-5', $promptBytes, 8192, 'twin6'), $reserve);
        foreach ([[1, 1], [$promptBytes, 8192], [(int) ($promptBytes / 3), 4000]] as [$in, $out]) {
            self::assertGreaterThanOrEqual($config->coutMicrousd('claude-sonnet-5', $in, $out, 'twin6'), $reserve);
        }
        self::assertSame(0, $config->reserveMicrousd('claude-sonnet-5', -5, -1, 'twin6'), 'bornes négatives ramenées à 0');
        self::assertNull($config->reserveMicrousd('modele-fantome', 10, 10, 'twin6'));
    }

    #[TestDox('UC-APP-09-U23 — offre publique : prix Twin6 margés (+10 %) exposés, marges et prix catalogue jamais')]
    public function testU23PublicViewExposesTwin6PricesOnly(): void
    {
        $view = self::config()->publicView();
        self::assertSame([2.2, 11.0], $view['modeles_twin6']['claude-sonnet-5']); // 2 / 10 × 1,10
        self::assertSame([1.1, 5.5], $view['modeles_twin6']['claude-haiku-4-5-20251001']);
        self::assertSame([5.5, 27.5], $view['modeles_twin6']['claude-opus-4-8']);
        self::assertArrayNotHasKey('marge', $view);
        self::assertArrayNotHasKey('marge_twin6', $view);

        self::config()->update(['marge_twin6' => 1.5]);
        self::assertSame([3.0, 15.0], self::config()->publicView()['modeles_twin6']['claude-sonnet-5']); // 2 / 10 × 1,5
    }

    #[TestDox('UC-APP-09-U24 — réserve puis réconciliation : le débit NET est exactement le coût réel ; en cas d’échec amont la réserve est rendue')]
    public function testU24ReserveThenReconcileNetsToRealCost(): void
    {
        $userId = self::user();
        $credits = new CreditService(self::$pdo);
        $credits->topup($userId, 1_000_000, 'ORDER-UC-APP-09', 'Recharge PayPal');

        $reserve = 155_000;
        $cout = 6602;
        self::assertSame(1_000_000 - $reserve, $credits->debit($userId, $reserve, 'twin6/cartographie (réserve)', 'claude-sonnet-5'));
        self::assertSame(1_000_000 - $cout, $credits->adjust($userId, $reserve - $cout, 'twin6/cartographie (réconciliation)', 'claude-sonnet-5', 1000, 200));

        // Échec amont : la réserve est intégralement rendue (remboursement échec).
        $credits->debit($userId, $reserve, 'twin6/cartographie (réserve)', 'claude-sonnet-5');
        self::assertSame(1_000_000 - $cout, $credits->adjust($userId, $reserve, 'twin6/cartographie (remboursement échec)', 'claude-sonnet-5'));

        $events = $credits->events($userId);
        self::assertSame(
            ['adjust', 'debit', 'adjust', 'debit', 'topup'],
            array_column($events, 'kind'),
        );
        self::assertSame([1000, 200], [$events[2]['tokens_in'], $events[2]['tokens_out']], 'la réconciliation porte les tokens réels');
    }

    #[TestDox('UC-APP-09-U25 — débit conditionnel : solde insuffisant → SoldeInsuffisantException (montants), solde et grand-livre intacts')]
    public function testU25DebitNeverOverdraws(): void
    {
        $userId = self::user();
        $credits = new CreditService(self::$pdo);

        try {
            $credits->debit($userId, 10, 'twin6/cartographie (réserve)', 'claude-sonnet-5');
            self::fail('débit sans ligne de crédit accepté');
        } catch (SoldeInsuffisantException $e) {
            self::assertSame(0, $e->getBalanceMicrousd());
            self::assertSame(10, $e->getRequestedMicrousd());
            self::assertSame('Solde insuffisant', $e->getMessage());
        }

        $credits->topup($userId, 12_000, 'ORDER-UC-APP-09-B');
        try {
            $credits->debit($userId, 12_001, 'twin6/cartographie (réserve)', 'claude-sonnet-5');
            self::fail('découvert accepté');
        } catch (SoldeInsuffisantException $e) {
            self::assertSame(12_000, $e->getBalanceMicrousd());
            self::assertSame(12_001, $e->getRequestedMicrousd());
        }
        self::assertSame(12_000, $credits->balance($userId));
        self::assertCount(1, $credits->events($userId), 'aucun événement pour un débit refusé');
    }

    #[TestDox('UC-APP-09-U26 — l’appel de la voie crédits (AnthropicCaller::params, AnthropicFlux) : URL verrouillée, prompt système transmis, réflexion coupée, réponse en flux demandée ; texte et usage RÉELS relus du flux, la réflexion jamais dans le texte')]
    public function testU26CreditsCallIsLockedAndStreamed(): void
    {
        $http = new LlmFakeHttpClient();
        $http->queueStream([
            AnthropicSse::debut('', 1234)[0],
            AnthropicSse::evenement('content_block_start', ['index' => 0, 'content_block' => ['type' => 'thinking', 'thinking' => '']]),
            AnthropicSse::evenement('content_block_delta', ['index' => 0, 'delta' => ['type' => 'thinking_delta', 'thinking' => 'ignoré']]),
            AnthropicSse::evenement('content_block_start', ['index' => 1, 'content_block' => ['type' => 'text', 'text' => '']]),
            AnthropicSse::evenement('content_block_delta', ['index' => 1, 'delta' => ['type' => 'text_delta', 'text' => '{"poleNum":']]),
            AnthropicSse::evenement('content_block_delta', ['index' => 1, 'delta' => ['type' => 'text_delta', 'text' => '1}']]),
            AnthropicSse::evenement('message_delta', ['delta' => ['stop_reason' => 'end_turn'], 'usage' => ['output_tokens' => 56]]),
            AnthropicSse::evenement('message_stop', []),
        ]);

        $appel = AnthropicFlux::ouvrir($http, AnthropicCaller::BASE_URL . '/v1/messages', AnthropicCaller::entetes(TwinSupport::PLATFORM_KEY),
            AnthropicCaller::params('claude-sonnet-5', 'Analyse le pôle 1.', 8192, 'coupee', null, 'Tu es un cartographe.'), 150);
        while ($appel->pomper(0.0)) {
        }

        self::assertTrue($appel->complet());
        self::assertSame(['{"poleNum":1}', [1234, 56], 'end_turn'], [$appel->texte(), $appel->usageAFacturer(1, 1), $appel->raisonArret()]);
        $request = $http->requests[0];
        self::assertSame('https://api.anthropic.com/v1/messages', $request['url']);
        self::assertSame([TwinSupport::PLATFORM_KEY, '2023-06-01'], [$request['headers']['x-api-key'], $request['headers']['anthropic-version']]);
        self::assertSame(150, $request['timeout']);
        $payload = json_decode((string) $request['body'], true);
        self::assertSame('Tu es un cartographe.', $payload['system']);
        self::assertSame(['type' => 'disabled'], $payload['thinking']);
        self::assertSame(8192, $payload['max_tokens']);
        self::assertTrue($payload['stream']);
        self::assertSame([['role' => 'user', 'content' => 'Analyse le pôle 1.']], $payload['messages']);
    }

    #[TestDox('UC-APP-09-U27 — AnthropicFlux::parvenu : un refus d’Anthropic (statut d’erreur, son corps lu entier) ou une requête qui n’est jamais partie ne se facture pas ; une réponse commencée (2xx), ou une requête partie entière avant la panne du réseau, oui')]
    public function testU27OnlyACallAnthropicReceivedIsBilled(): void
    {
        $cas = [
            'refus 500' => [['status' => 500, 'body' => '{"error":{"message":"prompt: Analyse le pôle 1."}}'], false, 500],
            'refus 429' => [['status' => 429, 'body' => '{}'], false, 429],
            'connexion refusée' => [new HttpClientException('network error (curl 7)'), false, 0],
            'délai de connexion' => [new HttpClientException('network error (curl 28)', true), false, 0],
            'délai après l’envoi' => [new HttpClientException('network error (curl 28)', true, true), true, 0],
            'réponse commencée' => [AnthropicSse::debut('{"poleNum"', 900), true, 200],
        ];
        foreach ($cas as $nom => [$amont, $facture, $statut]) {
            $http = new LlmFakeHttpClient();
            match (true) {
                $amont instanceof HttpClientException => $http->queueException($amont),
                isset($amont['status']) => $http->queueResponse($amont),
                default => $http->queueStream($amont),
            };
            $appel = AnthropicFlux::ouvrir($http, AnthropicCaller::BASE_URL . '/v1/messages', AnthropicCaller::entetes('sk-ant-x'),
                AnthropicCaller::params('claude-sonnet-5', 'Analyse le pôle 1.', 256), 150);
            self::assertSame([$facture, $statut], [$appel->parvenu(), $appel->statut()], $nom);
            if ($statut >= 400) {
                self::assertSame($amont['body'], $appel->corpsErreur(), $nom . ' : le corps du refus, lu entier');
            }
        }
    }
}
