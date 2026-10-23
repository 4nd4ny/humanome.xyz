<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Env;
use Humanome\Etablissement\EcoleCles;
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
 *
 * The `ecole` lane (ADR-013 §6, lot S6b): the key of the school that pays
 * the run (EcoleCles), read as each call leaves, kept nowhere else; at
 * Anthropic only — the guard of ADR-012 §5, now the school's, the holder of
 * its key —, null for any other provider, and null once the school has
 * withdrawn it.
 */
final class RunKey
{
    public function __construct(private readonly PDO $pdo, private readonly Twin9Config $config)
    {
    }

    /**
     * @param int $titulaire the account whose key it is (RunPayeur::titulaire()): the school that pays on the
     *                       `ecole` lane, the run's owner on the personal one; unread for the instance's
     * @param string $cle the run's choice: "instance", "ecole", or "personnelle" for a run launched before ADR-013
     * @param string $fournisseur the provider the call goes to (its settings' `fournisseur`)
     * @return string|null the key, or null when there is none to use
     */
    public function pour(int $titulaire, string $cle, string $fournisseur = Fournisseurs::DEFAUT): ?string
    {
        if (!Fournisseurs::connu($fournisseur)) {
            return null;
        }
        if ($cle === 'ecole') {
            $master = KeyVault::masterKeyFromEnv();
            if ($fournisseur !== Fournisseurs::DEFAUT || $master === null || $titulaire <= 0) {
                return null;
            }

            return (new EcoleCles($this->pdo, $master))->lire($titulaire, Fournisseurs::DEFAUT);
        }
        if ($cle === 'personnelle') {
            $master = KeyVault::masterKeyFromEnv();
            if ($fournisseur !== Fournisseurs::DEFAUT || $master === null) {
                return null;
            }

            return (new KeyVault($this->pdo, $master))->reveal($titulaire, Fournisseurs::DEFAUT);
        }
        $cle = Env::get(Fournisseurs::REGISTRE[$fournisseur]['env']);

        return $cle === '' ? null : $cle;
    }
}
