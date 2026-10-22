<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Env;
use Humanome\Keys\KeyVault;
use Humanome\Twin9\Fournisseurs\Fournisseurs;
use PDO;

/**
 * The key of a run's calls to a provider (ADR-011 §3, ADR-012 §5): the
 * instance's, from the provider's variable in the registry
 * (Fournisseurs::REGISTRE, `env`); or, at Anthropic only, its owner's own,
 * from their vault (ADR-004), when the setting twin9_cle_perso_ouverte allows
 * it. A personal key never reaches another provider, whose account holder
 * could read back what was sent with it: refused call by call, closed by
 * default. Read when a call leaves, kept nowhere else.
 */
final class RunKey
{
    public function __construct(private readonly PDO $pdo, private readonly Twin9Config $config)
    {
    }

    /**
     * @param string $cle the profile's choice: "instance" or "personnelle"
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
            if ($fournisseur !== Fournisseurs::DEFAUT || $master === null || !$this->config->clePersoOuverte()) {
                return null;
            }

            return (new KeyVault($this->pdo, $master))->reveal($userId, Fournisseurs::DEFAUT);
        }
        $cle = Env::get(Fournisseurs::REGISTRE[$fournisseur]['env']);

        return $cle === '' ? null : $cle;
    }
}
