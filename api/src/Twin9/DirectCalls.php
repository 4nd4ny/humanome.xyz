<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Llm\HttpClientException;
use Humanome\Llm\MultiHttpClient;
use Humanome\Twin9\Fournisseurs\Appelant;
use Humanome\Twin9\Fournisseurs\Fournisseurs;
use Humanome\Twin9\Fournisseurs\Registre;
use Twin9\Run\Call;

/**
 * Twin9's direct calls (ADR-011 §3, ADR-012 §4): concurrent requests, each
 * bounded by the slice, each to its provider — the one its settings name
 * (`fournisseur`) — by that provider's caller (Fournisseurs\Registre), at its
 * locked address, read by the same caller. A request whose address is not
 * its provider's never leaves. The v9.8's own timeout (600 s) applies when
 * the slice is longer.
 */
final class DirectCalls implements CallSender
{
    /** The v9.8's timeout of a call (aurora/backends.py, DEFAULT_TIMEOUT). */
    public const DELAI_V98 = 600.0;

    private readonly Registre $appelants;

    /** @var array<string, array{0: int, 1: Call, 2: float, 3: Appelant}> the calls running, by request: run, call, start, caller */
    private array $calls = [];

    /** @param Registre|null $appelants the providers' callers; null: the registry's own */
    public function __construct(private readonly MultiHttpClient $http, ?Registre $appelants = null)
    {
        $this->appelants = $appelants ?? new Registre();
    }

    public function send(int $run, Call $call, array $reglage, string $cle, float $fin): void
    {
        $fournisseur = (string) $reglage['fournisseur'];
        $appelant = $this->appelants->appelant($fournisseur);
        $requete = $appelant->requete($cle, $reglage, $call->prompt);
        if (!str_starts_with($requete['url'], Fournisseurs::REGISTRE[$fournisseur]['url'])) {
            throw new \LogicException('Adresse hors du registre pour le fournisseur ' . $fournisseur);
        }
        $id = $run . ':' . $call->id;
        $this->http->start($id, 'POST', $requete['url'], $requete['headers'], $requete['body'],
            max(0.1, min(self::DELAI_V98, $fin - microtime(true))));
        $this->calls[$id] = [$run, $call, microtime(true), $appelant];
    }

    public function wait(float $jusqua): array
    {
        $issues = [];
        foreach ($this->http->wait($jusqua) as $id => $reponse) {
            [$run, $call, $debut, $appelant] = $this->calls[$id];
            unset($this->calls[$id]);
            $issue = $reponse instanceof HttpClientException
                ? ['ok' => false, 'erreur' => $reponse->timedOut ? 'délai dépassé' : 'fournisseur injoignable']
                : $appelant->lire($reponse['status'], $reponse['headers'], $reponse['body']);
            $issues[] = ['run' => $run, 'appel' => $call, 'duree' => microtime(true) - $debut] + $issue;
        }

        return $issues;
    }

    public function abort(): array
    {
        $coupes = [];
        foreach ($this->http->abort() as $id) {
            [$run, $call, $debut] = $this->calls[$id];
            $coupes[] = ['run' => $run, 'appel' => $call, 'duree' => microtime(true) - $debut];
        }
        $this->calls = [];

        return $coupes;
    }

    public function running(): int
    {
        return \count($this->calls);
    }
}
