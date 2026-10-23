<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Keys\KeyVault;
use PDO;

/**
 * A user key stored before ADR-013, as the tests need one: since then the
 * vault keeps a school's keys only (KeyVault::store() refuses any other
 * account) and no route writes a user key. The row is written as the vault
 * wrote it — nonce (24 bytes) || secretbox(key, nonce, master key) — so that
 * KeyVault::reveal() reads it back. Fictitious keys only.
 */
final class StoredKeys
{
    /**
     * @param string|null $master the 32-byte master key, SODIUM_MASTER_KEY's when null
     * @param string|null $avis the date of the notice of its purge (avis_purge_at), none when null
     */
    public static function seed(PDO $pdo, int $userId, string $provider, string $apiKey, ?string $master = null,
                                ?string $avis = null): void
    {
        $master ??= KeyVault::masterKeyFromEnv();
        if ($master === null) {
            throw new \LogicException('SODIUM_MASTER_KEY is not set for this test');
        }
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $pdo->prepare(
            'INSERT INTO user_api_keys (user_id, provider, encrypted_key, created_at, avis_purge_at)
             VALUES (?, ?, ?, NOW(), ?)
             ON DUPLICATE KEY UPDATE encrypted_key = VALUES(encrypted_key), created_at = NOW(),
                                     avis_purge_at = VALUES(avis_purge_at)'
        )->execute([$userId, $provider, $nonce . sodium_crypto_secretbox($apiKey, $nonce, $master), $avis]);
    }
}
