<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Env;
use Humanome\Keys\KeyVault;
use PDO;

/**
 * The key of a run's calls (ADR-011 §3): the instance's, or its owner's own,
 * from their vault (ADR-004), when the setting twin9_cle_perso_ouverte allows
 * it. Read when a call leaves, kept nowhere else.
 */
final class RunKey
{
    public function __construct(private readonly PDO $pdo, private readonly Twin9Config $config)
    {
    }

    /**
     * @param string $cle the profile's choice: "instance" or "personnelle"
     * @return string|null the key, or null when there is none to use
     */
    public function pour(int $userId, string $cle): ?string
    {
        if ($cle === 'personnelle') {
            $master = KeyVault::masterKeyFromEnv();
            if ($master === null || !$this->config->clePersoOuverte()) {
                return null;
            }

            return (new KeyVault($this->pdo, $master))->reveal($userId, 'anthropic');
        }
        $cle = Env::get('ANTHROPIC_API_KEY');

        return $cle === '' ? null : $cle;
    }
}
