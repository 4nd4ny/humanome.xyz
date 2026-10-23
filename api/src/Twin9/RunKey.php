<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Env;
use Humanome\Keys\KeyVault;
use Humanome\Twin9\Fournisseurs\Fournisseurs;
use PDO;

/**
 * The key of a run's calls to a provider (ADR-011 §3, ADR-012 §5, ADR-013
 * §6): the instance's, from the provider's variable in the registry
 * (Fournisseurs::REGISTRE, `env`). Read when a call leaves, kept nowhere
 * else.
 *
 * No new run leaves on a personal key since ADR-013: a server run cannot
 * keep the key of a browser, and a user's keys are no longer kept on the
 * server. The profile refuses `personnelle` at its registration, its launch
 * and its resumption (ProfilPolicy). What remains of the personal lane
 * serves only the runs launched on it before, until they end (ADR-013 §8,
 * step 3): at Anthropic only — a personal key never reaches another
 * provider, whose account holder could read back what was sent with it —,
 * its owner's key stored before, while it is there. It leaves with the
 * contraction (ADR-013 §8, step 10).
 */
final class RunKey
{
    public function __construct(private readonly PDO $pdo, private readonly Twin9Config $config)
    {
    }

    /**
     * @param string $cle the run's choice: "instance", or "personnelle" for a run launched before ADR-013
     * @param string $fournisseur the provider the call goes to (its settings' `fournisseur`)
     * @return string|null the key, or null when there is none to use
     */
    public function pour(int $userId, string $cle, string $fournisseur = Fournisseurs::DEFAUT): ?string
    {
        if (!Fournisseurs::connu($fournisseur)) {
            return null;
        }
        if ($cle === 'personnelle') {
            $master = KeyVault::masterKeyFromEnv();
            if ($fournisseur !== Fournisseurs::DEFAUT || $master === null) {
                return null;
            }

            return (new KeyVault($this->pdo, $master))->reveal($userId, Fournisseurs::DEFAUT);
        }
        $cle = Env::get(Fournisseurs::REGISTRE[$fournisseur]['env']);

        return $cle === '' ? null : $cle;
    }
}
