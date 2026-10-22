<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\Llm\HttpClientException;
use Humanome\Tests\LlmFakeHttpClient;
use Humanome\Twin9\AnthropicBatches;
use Humanome\Twin9\AnthropicCaller;
use PHPUnit\Framework\TestCase;

/**
 * The requests of Twin9's batch lane to the Message Batches API (T8,
 * ADR-011 §3): each one at the locked address, with the key and the API's
 * version, never at a URL the API hands back; each answer read without
 * relaying the API's text, the check of a run's settings aside.
 */
final class AnthropicBatchesTest extends TestCase
{
    private const LOTS = 'https://api.anthropic.com/v1/messages/batches';

    public function testEachRequestGoesToTheLockedAddress(): void
    {
        $http = new LlmFakeHttpClient();
        $lots = new AnthropicBatches($http);
        $fin = microtime(true) + 30;
        $lot = ['id' => 'msgbatch_01', 'type' => 'message_batch', 'processing_status' => 'ended',
                'results_url' => 'https://ailleurs.example/results'];
        $http->queueResponse(['body' => json_encode($lot)]);
        $http->queueResponse(['body' => json_encode($lot)]);
        $http->queueResponse(['body' => "{\"custom_id\":\"a\",\"result\":{\"type\":\"expired\"}}\n"]);
        $http->queueResponse(['body' => json_encode($lot)]);
        $http->queueResponse(['status' => 200, 'body' => '{"id":"msgbatch_01","type":"message_batch_deleted"}']);

        self::assertSame(['ok' => true, 'lot' => $lot], $lots->creer('sk-ant-test', '{"requests":[]}', $fin));
        self::assertSame(['ok' => true, 'lot' => $lot], $lots->etat('sk-ant-test', 'msgbatch_01', $fin));
        self::assertSame(['ok' => true, 'jsonl' => "{\"custom_id\":\"a\",\"result\":{\"type\":\"expired\"}}\n"],
            $lots->resultats('sk-ant-test', 'msgbatch_01', $fin));
        self::assertTrue($lots->annuler('sk-ant-test', 'msgbatch_01', $fin)['ok']);
        self::assertSame(['ok' => true], $lots->supprimer('sk-ant-test', 'msgbatch_01', $fin));

        self::assertSame([
            ['POST', self::LOTS, '{"requests":[]}'],
            ['GET', self::LOTS . '/msgbatch_01', null],
            ['GET', self::LOTS . '/msgbatch_01/results', null],
            ['POST', self::LOTS . '/msgbatch_01/cancel', ''],
            ['DELETE', self::LOTS . '/msgbatch_01', null],
        ], array_map(static fn (array $r): array => [$r['method'], $r['url'], $r['body']], $http->requests),
            'jamais l\'adresse que rend l\'API');
        foreach ($http->requests as $r) {
            self::assertSame(AnthropicCaller::entetes('sk-ant-test'), $r['headers']);
            self::assertLessThanOrEqual(120, $r['timeout']);
        }
    }

    /**
     * A request whose bound leaves no second never leaves, and says so
     * (non_envoye): a creation that never left is no batch to look for.
     */
    public function testARequestWithoutTimeNeverLeaves(): void
    {
        $http = new LlmFakeHttpClient();
        $lots = new AnthropicBatches($http);

        $issue = $lots->creer('sk-ant-test', '{"requests":[]}', microtime(true) + 0.5);
        self::assertSame(['ok' => false, 'erreur' => 'plus de temps dans la tranche', 'non_envoye' => true], $issue);
        self::assertSame([], $http->requests, 'aucune requête');
    }

    /** An id that is not one is never requested; a batch already gone is deleted. */
    public function testAnIdThatIsNotOneIsNeverRequested(): void
    {
        $http = new LlmFakeHttpClient();
        $lots = new AnthropicBatches($http);
        $fin = microtime(true) + 30;

        self::assertSame(404, $lots->etat('k', '../../v1/models', $fin)['http']);
        self::assertSame(404, $lots->resultats('k', 'msgbatch_01?x=1', $fin)['http']);
        self::assertSame([], $http->requests);

        $http->queueResponse(['status' => 404, 'body' => '{"type":"error"}']);
        self::assertSame(['ok' => true], $lots->supprimer('k', 'msgbatch_02', $fin));
    }

    /**
     * The check of a run's settings: the minimal direct call carries them and
     * a fixed sentence; a refusal says the API's reason, a provider's error
     * stays generic.
     */
    public function testTheCheckSendsTheSettingsAndSaysWhyTheyAreRefused(): void
    {
        $http = new LlmFakeHttpClient();
        $lots = new AnthropicBatches($http);
        $reglage = ['modele' => 'claude-haiku-5-5', 'budget_sortie' => 16000, 'effort' => 'xhigh', 'reflexion' => 'coupee'];
        $http->queueResponse(['status' => 400, 'body' => json_encode(['type' => 'error', 'error' => [
            'type' => 'invalid_request_error', 'message' => "effort 'xhigh' requires\nthinking"]])]);
        $http->queueResponse(['status' => 500, 'body' => '{"type":"error","error":{"message":"un détail interne"}}']);
        $http->queueResponse(['status' => 200, 'body' => json_encode(FakeMultiHttpClient::message('ok'))]);

        $fin = microtime(true) + 30;
        self::assertSame(['ok' => false, 'http' => 400, 'erreur' => "effort 'xhigh' requires thinking"],
            $lots->verifier('sk-ant-test', $reglage, $fin));
        self::assertSame(['ok' => false, 'http' => 500, 'erreur' => 'erreur du fournisseur (HTTP 500)'],
            $lots->verifier('sk-ant-test', $reglage, $fin));
        self::assertTrue($lots->verifier('sk-ant-test', $reglage, $fin)['ok']);

        $r = $http->requests[0];
        self::assertSame(['POST', 'https://api.anthropic.com/v1/messages'], [$r['method'], $r['url']]);
        self::assertSame(AnthropicCaller::params('claude-haiku-5-5', AnthropicBatches::VERIFICATION, 16000, 'coupee',
            'xhigh'), json_decode((string) $r['body'], true));
    }

    /** No answer, or one that does not read: the batch may have left all the same. A rate refusal says its wait. */
    public function testASubmissionWithoutAReadableAnswerIsToFind(): void
    {
        $http = new LlmFakeHttpClient();
        $lots = new AnthropicBatches($http);
        $fin = microtime(true) + 30;
        $http->queueException(new HttpClientException('network error (curl 28)', timedOut: true));
        $http->queueResponse(['status' => 200, 'body' => '<html>']);
        $http->queueResponse(['status' => 429, 'headers' => ['retry-after' => '30'], 'body' => '{}']);

        self::assertSame(['ok' => false, 'erreur' => 'délai dépassé'], $lots->creer('k', '{}', $fin));
        self::assertSame(['ok' => false, 'erreur' => 'réponse illisible du fournisseur'], $lots->creer('k', '{}', $fin));
        self::assertSame(['ok' => false, 'http' => 429, 'attendre' => 30.0, 'erreur' => 'débit du fournisseur (HTTP 429)'],
            $lots->creer('k', '{}', $fin));
        self::assertSame(['ok' => false, 'erreur' => 'plus de temps dans la tranche', 'non_envoye' => true],
            $lots->creer('k', '{}', microtime(true) + 0.5), 'aucune requête quand la tranche finit');
        self::assertCount(3, $http->requests);
    }

    /** The listing goes from page to page, newest first, until the batches are older than asked. */
    public function testTheListingStopsAtTheBatchesOlderThanAsked(): void
    {
        $http = new LlmFakeHttpClient();
        $lots = new AnthropicBatches($http);
        $lot = static fn (string $id, string $date): array => ['id' => $id, 'created_at' => $date];
        $http->queueResponse(['body' => json_encode(['data' => [$lot('msgbatch_3', '2026-10-19T10:00:02.5Z'),
            $lot('msgbatch_2', '2026-10-19T10:00:01Z')], 'has_more' => true, 'last_id' => 'msgbatch_2'])]);
        $http->queueResponse(['body' => json_encode(['data' => [$lot('msgbatch_1', '2026-10-19T09:00:00Z'),
            $lot('msgbatch_0', '2026-10-19T08:00:00Z')], 'has_more' => true, 'last_id' => 'msgbatch_0'])]);

        $liste = $lots->lister('k', (float) strtotime('2026-10-19T09:30:00Z'), microtime(true) + 30);

        self::assertSame(['msgbatch_3', 'msgbatch_2'], array_column($liste['lots'], 'id'));
        self::assertSame([self::LOTS . '?limit=100', self::LOTS . '?limit=100&after_id=msgbatch_2'],
            array_column($http->requests, 'url'));
        self::assertEqualsWithDelta(strtotime('2026-10-19T10:00:02Z') + 0.5, AnthropicBatches::instant('2026-10-19T10:00:02.5Z'),
            0.001);
    }

    /** The results, one line at a time; a line that does not decode is skipped. */
    public function testTheResultsAreReadLineByLine(): void
    {
        $jsonl = "{\"custom_id\":\"a\",\"result\":{\"type\":\"succeeded\"}}\n\n{tronqué\n{\"custom_id\":\"b\",\"result\":{\"type\":\"expired\"}}";

        self::assertSame(['a', 'b'], array_column(iterator_to_array(AnthropicBatches::lignes($jsonl), false), 'custom_id'));
    }
}
