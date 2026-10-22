<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\Twin9\BatchApi;

/**
 * A simulated Anthropic for Twin9's batch lane (T8): batches kept in memory,
 * in progress for a number of looks at their state (asked for, or listed),
 * then ended, each request answered by a responder; cancelled and deleted as
 * the Message Batches API does, its results given in an order of their own.
 * Everything asked of it is recorded. A creation may go wrong: the tick dies
 * before the batch leaves, or once it has left; or the batch leaves and its
 * answer is lost.
 */
final class FakeBatchApi implements BatchApi
{
    /**
     * @var array<string, array{cle: string, requetes: list<array<string, mixed>>, octets: int, statut: string,
     *                         regards: int, cree: float, fini: float|null, resultats: list<array<string, mixed>>|null}>
     */
    public array $lots = [];

    /** @var list<array{custom_id: string, params: array<string, mixed>}> every request submitted, in order */
    public array $requetes = [];

    /** @var list<array{0: string, 1: string}> what was asked, in order: [operation, batch or model] */
    public array $journal = [];

    /** @var list<array<string, mixed>> the settings checked, with the key */
    public array $verifications = [];

    /** @var list<string> the batches deleted */
    public array $supprimes = [];

    /** @var list<string> the batches cancelled */
    public array $annules = [];

    /** @var array<string, int> every batch created, by id: its size in bytes */
    public array $tailles = [];

    /** @var list<float> each creation asked: the seconds its bound left it */
    public array $delais = [];

    private int $creations = 0;

    /** @var array<int, string> by creation (1 = the first): 'tue', 'tue_apres', 'perdu' or 'sans_temps' */
    private array $incidents = [];

    /**
     * @param \Closure(array{custom_id: string, params: array<string, mixed>}): array<string, mixed> $repondeur
     *        a request's result: FakeBatchApi::message(…), or {type: errored|expired…}
     * @param int $regards the looks at a batch's state that find it in progress before it ends
     * @param (\Closure(array<string, mixed>): array<string, mixed>)|null $verifieur a check's answer, ok by default
     */
    public function __construct(private readonly \Closure $repondeur, private readonly int $regards = 1,
                                private readonly ?\Closure $verifieur = null)
    {
    }

    /**
     * The n-th creation goes wrong: 'tue', the tick dies before the batch
     * leaves; 'tue_apres', it dies once the batch has left; 'perdu', the
     * batch leaves and its answer is lost; 'sans_temps', its bound leaves no
     * second, and no request leaves (AnthropicBatches: « plus de temps »).
     */
    public function incident(int $n, string $quoi): self
    {
        $this->incidents[$n] = $quoi;

        return $this;
    }

    /** A request answered. @return array<string, mixed> */
    public static function message(string $texte, string $modele = 'claude-haiku-5-5', int $entree = 100,
                                   int $sortie = 20, string $stop = 'end_turn'): array
    {
        return ['type' => 'succeeded', 'message' => [
            'id' => 'msg_lot', 'type' => 'message', 'role' => 'assistant', 'model' => $modele,
            'content' => [['type' => 'text', 'text' => $texte]], 'stop_reason' => $stop, 'stop_sequence' => null,
            'usage' => ['input_tokens' => $entree, 'output_tokens' => $sortie],
        ]];
    }

    /** The call a request is for, which the fake engine's prompts carry. */
    public static function appel(array $requete): string
    {
        preg_match('/\[appel:([^\]]+)\]/', (string) $requete['params']['messages'][0]['content'], $m);

        return $m[1] ?? '';
    }

    public function verifier(string $cle, array $reglage, float $fin): array
    {
        $this->journal[] = ['verifier', $reglage['modele']];
        $this->verifications[] = $reglage + ['cle' => $cle];

        return $this->verifieur === null ? ['ok' => true, 'http' => 200] : ($this->verifieur)($reglage);
    }

    public function creer(string $cle, string $corps, float $fin): array
    {
        $this->delais[] = $fin - microtime(true);
        $n = ++$this->creations;
        $incident = $this->incidents[$n] ?? null;
        if ($incident === 'tue') {
            throw new \RuntimeException('tick tué');
        }
        if ($incident === 'sans_temps') {
            $this->journal[] = ['creer', ''];

            return ['ok' => false, 'erreur' => 'plus de temps dans la tranche', 'non_envoye' => true];
        }
        $requetes = json_decode($corps, true, 512, JSON_THROW_ON_ERROR)['requests'];
        $id = sprintf('msgbatch_%04d', $n);
        $this->lots[$id] = ['cle' => $cle, 'requetes' => $requetes, 'octets' => \strlen($corps), 'statut' => 'in_progress',
                            'regards' => 0, 'cree' => microtime(true), 'fini' => null, 'resultats' => null];
        array_push($this->requetes, ...$requetes);
        $this->tailles[$id] = \strlen($corps);
        $this->journal[] = ['creer', $id];
        if ($incident === 'tue_apres') {
            throw new \RuntimeException('tick tué');
        }
        if ($incident === 'perdu') {
            return ['ok' => false, 'erreur' => 'délai dépassé'];
        }

        return ['ok' => true, 'lot' => $this->decrire($id)];
    }

    public function etat(string $cle, string $id, float $fin): array
    {
        $this->journal[] = ['etat', $id];
        if (!$this->connu($cle, $id)) {
            return ['ok' => false, 'http' => 404, 'erreur' => 'lot inconnu'];
        }
        $this->regarder($id);

        return ['ok' => true, 'lot' => $this->decrire($id)];
    }

    public function resultats(string $cle, string $id, float $fin): array
    {
        $this->journal[] = ['resultats', $id];
        if (!$this->connu($cle, $id)) {
            return ['ok' => false, 'http' => 404, 'erreur' => 'lot inconnu'];
        }
        if ($this->lots[$id]['statut'] !== 'ended') {
            return ['ok' => false, 'http' => 400, 'erreur' => 'erreur du fournisseur (HTTP 400)'];
        }
        $lignes = array_map(static fn (array $r): string => json_encode($r, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
            array_reverse($this->lots[$id]['resultats']));

        return ['ok' => true, 'jsonl' => implode("\n", $lignes) . "\n"];
    }

    public function annuler(string $cle, string $id, float $fin): array
    {
        $this->journal[] = ['annuler', $id];
        if (!$this->connu($cle, $id)) {
            return ['ok' => false, 'http' => 404, 'erreur' => 'lot inconnu'];
        }
        if ($this->lots[$id]['statut'] !== 'in_progress') {
            return ['ok' => false, 'http' => 400, 'erreur' => 'erreur du fournisseur (HTTP 400)'];
        }
        $this->lots[$id]['statut'] = 'canceling';
        $this->annules[] = $id;

        return ['ok' => true, 'lot' => $this->decrire($id)];
    }

    public function supprimer(string $cle, string $id, float $fin): array
    {
        $this->journal[] = ['supprimer', $id];
        if (!$this->connu($cle, $id)) {
            return ['ok' => true];
        }
        if ($this->lots[$id]['statut'] !== 'ended') {
            return ['ok' => false, 'http' => 409, 'erreur' => 'erreur du fournisseur (HTTP 409)'];
        }
        unset($this->lots[$id]);
        $this->supprimes[] = $id;

        return ['ok' => true];
    }

    public function lister(string $cle, float $depuis, float $fin): array
    {
        $this->journal[] = ['lister', ''];
        $lots = [];
        foreach (array_reverse(array_keys($this->lots)) as $id) {
            if ($this->lots[$id]['cle'] === $cle && $this->lots[$id]['cree'] >= $depuis) {
                $this->regarder($id);
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

    /** @return list<string> the operations asked, in order, for one batch */
    public function operations(string $id): array
    {
        return array_values(array_map(static fn (array $o): string => $o[0],
            array_filter($this->journal, static fn (array $o): bool => $o[1] === $id)));
    }

    private function connu(string $cle, string $id): bool
    {
        return isset($this->lots[$id]) && $this->lots[$id]['cle'] === $cle;
    }

    /** A look at a batch's state: in progress for $regards looks, then ended; a cancel ends it at once. */
    private function regarder(string $id): void
    {
        $lot = &$this->lots[$id];
        if ($lot['statut'] === 'canceling' || ($lot['statut'] === 'in_progress' && ++$lot['regards'] > $this->regards)) {
            $this->finir($id);
        }
    }

    private function finir(string $id): void
    {
        $lot = &$this->lots[$id];
        $annule = $lot['statut'] === 'canceling';
        $lot['statut'] = 'ended';
        $lot['fini'] = microtime(true);
        $lot['resultats'] = array_map(fn (array $r): array => ['custom_id' => $r['custom_id'],
            'result' => $annule ? ['type' => 'canceled'] : ($this->repondeur)($r)], $lot['requetes']);
    }

    /** @return array<string, mixed> a batch as the API describes it */
    private function decrire(string $id): array
    {
        $lot = $this->lots[$id];
        $comptes = ['processing' => 0, 'succeeded' => 0, 'errored' => 0, 'canceled' => 0, 'expired' => 0];
        if ($lot['resultats'] === null) {
            $comptes['processing'] = \count($lot['requetes']);
        } else {
            foreach ($lot['resultats'] as $r) {
                $comptes[$r['result']['type']]++;
            }
        }

        return ['id' => $id, 'type' => 'message_batch', 'processing_status' => $lot['statut'],
                'request_counts' => $comptes, 'created_at' => self::date($lot['cree']),
                'ended_at' => $lot['fini'] === null ? null : self::date($lot['fini']), 'results_url' => null];
    }

    private static function date(float $t): string
    {
        return gmdate('Y-m-d\TH:i:s', (int) $t) . sprintf('.%06dZ', (int) (($t - floor($t)) * 1_000_000));
    }
}
