<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\Twin9\BatchApi;
use Humanome\Worker\Twin9Lots;

/**
 * Anthropic's Message Batches API replaced by the oracle of the v9.8
 * (Twin_v9's oracle/), for the batch lane (T8): each request must be a call
 * the oracle recorded, by its custom_id, with its prompt; it is answered with
 * the oracle's response once its batch has ended, at the first look. A
 * request sent twice, or one the oracle does not know, stops the test. A
 * creation may make the tick die, before its batch leaves ('tue') or once it
 * has left without its answer ('tue_apres').
 */
final class ReplayBatchApi implements BatchApi
{
    /** @var array<string, int> the calls sent, by id */
    public array $envois = [];

    /** @var list<string> the batches deleted */
    public array $supprimes = [];

    /** @var array<string, string> the oracle's calls, by custom_id */
    private array $parCustomId = [];

    /** @var array<string, array{requetes: list<array<string, mixed>>, cree: float}> */
    private array $lots = [];

    private int $creations = 0;

    /**
     * @param array<string, array{step: string, model: string, sha256: string, response?: string, failure?: string}> $record
     * @param array<int, string> $incidents by creation (1 = the first): 'tue' or 'tue_apres'
     */
    public function __construct(private readonly array $record, private readonly array $incidents = [])
    {
        foreach (array_keys($record) as $id) {
            $this->parCustomId[Twin9Lots::customId((string) $id)] = (string) $id;
        }
    }

    public function verifier(string $cle, array $reglage, float $fin): array
    {
        return ['ok' => true, 'http' => 200];
    }

    public function creer(string $cle, string $corps, float $fin): array
    {
        $n = ++$this->creations;
        if (($this->incidents[$n] ?? null) === 'tue') {
            throw new \RuntimeException('tick tué');
        }
        $requetes = json_decode($corps, true, 512, JSON_THROW_ON_ERROR)['requests'];
        foreach ($requetes as $r) {
            $id = $this->parCustomId[$r['custom_id']] ?? null;
            if ($id === null) {
                throw new \LogicException("Requête inconnue de l'oracle : {$r['custom_id']}");
            }
            if (hash('sha256', (string) $r['params']['messages'][0]['content']) !== $this->record[$id]['sha256']) {
                throw new \LogicException("Appel $id : le prompt n'est pas celui de l'oracle");
            }
            if (isset($this->envois[$id])) {
                throw new \LogicException("Appel envoyé deux fois : $id");
            }
            $this->envois[$id] = 1;
        }
        $id = sprintf('msgbatch_%05d', $n);
        $this->lots[$id] = ['requetes' => $requetes, 'cree' => microtime(true)];
        if (($this->incidents[$n] ?? null) === 'tue_apres') {
            throw new \RuntimeException('tick tué');
        }

        return ['ok' => true, 'lot' => $this->decrire($id)];
    }

    public function etat(string $cle, string $id, float $fin): array
    {
        return isset($this->lots[$id]) ? ['ok' => true, 'lot' => $this->decrire($id)]
            : ['ok' => false, 'http' => 404, 'erreur' => 'lot inconnu'];
    }

    public function resultats(string $cle, string $id, float $fin): array
    {
        if (!isset($this->lots[$id])) {
            return ['ok' => false, 'http' => 404, 'erreur' => 'lot inconnu'];
        }
        $lignes = [];
        foreach (array_reverse($this->lots[$id]['requetes']) as $r) {
            $o = $this->record[$this->parCustomId[$r['custom_id']]];
            $lignes[] = json_encode(['custom_id' => $r['custom_id'], 'result' => FakeBatchApi::message(
                (string) ($o['response'] ?? ''), (string) $r['params']['model'], 0, 0)],
                JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
        }

        return ['ok' => true, 'jsonl' => implode("\n", $lignes)];
    }

    public function annuler(string $cle, string $id, float $fin): array
    {
        return $this->etat($cle, $id, $fin);
    }

    public function supprimer(string $cle, string $id, float $fin): array
    {
        if (isset($this->lots[$id])) {
            unset($this->lots[$id]);
            $this->supprimes[] = $id;
        }

        return ['ok' => true];
    }

    public function lister(string $cle, float $depuis, float $fin): array
    {
        $lots = [];
        foreach (array_reverse(array_keys($this->lots)) as $id) {
            if ($this->lots[$id]['cree'] >= $depuis) {
                $lots[] = $this->decrire($id);
            }
        }

        return ['ok' => true, 'lots' => $lots];
    }

    /** @return list<string> the batches still at Anthropic */
    public function restants(): array
    {
        return array_keys($this->lots);
    }

    /** @return array<string, mixed> an ended batch, as the API describes it */
    private function decrire(string $id): array
    {
        $t = $this->lots[$id]['cree'];

        return ['id' => $id, 'type' => 'message_batch', 'processing_status' => 'ended',
                'request_counts' => ['processing' => 0, 'succeeded' => \count($this->lots[$id]['requetes']),
                                     'errored' => 0, 'canceled' => 0, 'expired' => 0],
                'created_at' => gmdate('Y-m-d\TH:i:s', (int) $t) . sprintf('.%06dZ', (int) (($t - floor($t)) * 1e6))];
    }
}
