<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Llm\HttpClient;
use Humanome\Llm\HttpClientException;
use Humanome\Twin9\Fournisseurs\AnthropicAppelant;

/**
 * Twin9's batch lane over Anthropic's Message Batches API (ADR-011 §3, T8),
 * at the locked address of ADR-010 §2. Every URL is built here: a results_url
 * the API hands back is never followed, the key going with every request.
 * Each request is bounded by the slice, and carries a trace that is not
 * sampled, as a direct call does (AnthropicAppelant::traceparent(), ADR-012
 * §4): an OpenTelemetry export « Full content » on the key's account
 * receives none of the batch's prompts nor of its results.
 *
 * Messages stay generic, as AnthropicCaller's: an upstream error text may
 * quote a request, which carries templates and a portfolio. The check of a
 * run's settings is the one exception: its request carries nothing but them
 * and a fixed sentence, and the API's reason is what the profile's owner
 * needs to mend it.
 */
final class AnthropicBatches implements BatchApi
{
    private const LOTS = AnthropicCaller::BASE_URL . '/v1/messages/batches';

    /** The prompt of the check: nothing from a template nor from a portfolio. */
    public const VERIFICATION = 'Réponds seulement : ok.';

    /** A batch's id, as the API gives it. */
    private const ID = '/^[A-Za-z0-9_-]{1,64}$/';

    /** The listing's pages read at most, a hundred batches each. */
    private const PAGES = 5;

    public function __construct(private readonly HttpClient $http)
    {
    }

    public function verifier(string $cle, array $reglage, float $fin): array
    {
        $requete = AnthropicCaller::requete($cle, $reglage['modele'], self::VERIFICATION, $reglage['budget_sortie'],
            $reglage['reflexion'], $reglage['effort']);
        $r = $this->appel('POST', AnthropicCaller::BASE_URL . '/v1/messages', $cle, $requete['body'], $fin, 60);
        if (($r['http'] ?? null) === 400) {
            $raison = $r['data']['error']['message'] ?? null;
            if (\is_string($raison) && trim($raison) !== '') {
                $r['erreur'] = self::propre($raison);
            }
        }

        return self::issue($r);
    }

    public function creer(string $cle, string $corps, float $fin): array
    {
        $r = $this->appel('POST', self::LOTS, $cle, $corps, $fin, 120);
        if (!$r['ok']) {
            return self::issue($r);
        }
        $lot = $r['data'];
        if (!\is_array($lot) || !self::valide($lot['id'] ?? null)) {
            // answered, but not readably: the batch may exist all the same, it is to find
            return ['ok' => false, 'erreur' => 'réponse illisible du fournisseur'];
        }

        return ['ok' => true, 'lot' => $lot];
    }

    public function etat(string $cle, string $id, float $fin): array
    {
        return $this->lot('GET', $cle, $id, '', null, $fin);
    }

    public function resultats(string $cle, string $id, float $fin): array
    {
        if (!self::valide($id)) {
            return ['ok' => false, 'http' => 404, 'erreur' => 'lot inconnu'];
        }
        $r = $this->appel('GET', self::LOTS . '/' . $id . '/results', $cle, null, $fin, 120);

        return $r['ok'] ? ['ok' => true, 'jsonl' => (string) $r['corps']] : self::issue($r);
    }

    public function annuler(string $cle, string $id, float $fin): array
    {
        return $this->lot('POST', $cle, $id, '/cancel', '', $fin);
    }

    public function supprimer(string $cle, string $id, float $fin): array
    {
        if (!self::valide($id)) {
            return ['ok' => true];
        }
        $r = $this->appel('DELETE', self::LOTS . '/' . $id, $cle, null, $fin, 30);

        return $r['ok'] || ($r['http'] ?? null) === 404 ? ['ok' => true] : self::issue($r);
    }

    public function lister(string $cle, float $depuis, float $fin): array
    {
        $lots = [];
        $apres = null;
        for ($page = 0; $page < self::PAGES; $page++) {
            $r = $this->appel('GET', self::LOTS . '?limit=100' . ($apres === null ? '' : '&after_id=' . $apres), $cle,
                null, $fin, 30);
            if (!$r['ok']) {
                return self::issue($r);
            }
            foreach ((array) ($r['data']['data'] ?? []) as $lot) {
                if (!\is_array($lot) || !self::valide($lot['id'] ?? null)) {
                    continue;
                }
                $cree = self::instant($lot['created_at'] ?? null);
                if ($cree !== null && $cree < $depuis) {
                    return ['ok' => true, 'lots' => $lots]; // newest first: the rest is older
                }
                $lots[] = $lot;
            }
            $dernier = $r['data']['last_id'] ?? null;
            if (empty($r['data']['has_more']) || !self::valide($dernier)) {
                break;
            }
            $apres = $dernier;
        }

        return ['ok' => true, 'lots' => $lots];
    }

    /**
     * The lines of a batch's results, decoded one at a time; a line that does
     * not decode is skipped (its call, without a result, leaves again).
     *
     * @return \Generator<int, array<string, mixed>>
     */
    public static function lignes(string $jsonl): \Generator
    {
        $debut = 0;
        $longueur = \strlen($jsonl);
        while ($debut < $longueur) {
            $fin = strpos($jsonl, "\n", $debut);
            $fin = $fin === false ? $longueur : $fin;
            $ligne = json_decode(substr($jsonl, $debut, $fin - $debut), true);
            $debut = $fin + 1;
            if (\is_array($ligne)) {
                yield $ligne;
            }
        }
    }

    /** A time the API gives (RFC 3339), as Unix time; null when it is not one. */
    public static function instant(mixed $date): ?float
    {
        if (!\is_string($date) || $date === '') {
            return null;
        }
        try {
            return (float) (new \DateTimeImmutable($date))->format('U.u');
        } catch (\Exception) {
            return null;
        }
    }

    /** @return array{ok: bool, lot?: array<string, mixed>, http?: int, attendre?: float|null, erreur?: string} */
    private function lot(string $methode, string $cle, string $id, string $suite, ?string $corps, float $fin): array
    {
        if (!self::valide($id)) {
            return ['ok' => false, 'http' => 404, 'erreur' => 'lot inconnu'];
        }
        $r = $this->appel($methode, self::LOTS . '/' . $id . $suite, $cle, $corps, $fin, 30);
        if (!$r['ok']) {
            return self::issue($r);
        }

        return \is_array($r['data']) ? ['ok' => true, 'lot' => $r['data']]
            : ['ok' => false, 'http' => $r['http'], 'erreur' => 'réponse illisible du fournisseur'];
    }

    /**
     * One request to the API, bounded by the slice and by $max seconds.
     *
     * @return array{ok: bool, http?: int, data?: array<string, mixed>|null, corps?: string, attendre?: float|null,
     *               erreur?: string, non_envoye?: true} non_envoye: no second left, no request made
     */
    private function appel(string $methode, string $url, string $cle, ?string $corps, float $fin, int $max): array
    {
        $delai = (int) floor(min((float) $max, $fin - microtime(true)));
        if ($delai < 1) {
            // no request leaves: nothing reached Anthropic (a creation so refused is no batch to look for)
            return ['ok' => false, 'erreur' => 'plus de temps dans la tranche', 'non_envoye' => true];
        }
        try {
            $reponse = $this->http->request($methode, $url,
                AnthropicCaller::entetes($cle) + ['traceparent' => AnthropicAppelant::traceparent()], $corps, $delai);
        } catch (HttpClientException $e) {
            return ['ok' => false, 'erreur' => $e->timedOut ? 'délai dépassé' : 'fournisseur injoignable'];
        }
        $status = $reponse['status'];
        $data = json_decode($reponse['body'], true);
        $data = \is_array($data) ? $data : null;
        if ($status >= 200 && $status < 300) {
            return ['ok' => true, 'http' => $status, 'data' => $data, 'corps' => $reponse['body']];
        }
        $retry = $reponse['headers']['retry-after'] ?? null;

        return ['ok' => false, 'http' => $status, 'data' => $data]
            + (\is_string($retry) && is_numeric($retry) ? ['attendre' => max(0.0, (float) $retry)] : [])
            + ['erreur' => match ($status) {
                429 => 'débit du fournisseur (HTTP 429)',
                529 => 'fournisseur saturé (HTTP 529)',
                default => 'erreur du fournisseur (HTTP ' . $status . ')',
            }];
    }

    /**
     * @param array<string, mixed> $r
     * @return array{ok: bool, http?: int, attendre?: float|null, erreur?: string, non_envoye?: true}
     */
    private static function issue(array $r): array
    {
        return array_intersect_key($r, ['ok' => true, 'http' => true, 'attendre' => true, 'erreur' => true,
                                        'non_envoye' => true]);
    }

    private static function valide(mixed $id): bool
    {
        return \is_string($id) && preg_match(self::ID, $id) === 1;
    }

    /** The API's reason, as one short line. */
    private static function propre(string $raison): string
    {
        return mb_substr(trim((string) preg_replace('/\s+/u', ' ', (string) preg_replace('/[\x00-\x1F\x7F]/u', ' ', $raison))),
            0, 200);
    }
}
