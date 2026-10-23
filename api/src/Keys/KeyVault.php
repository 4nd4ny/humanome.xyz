<?php

declare(strict_types=1);

namespace Humanome\Keys;

use Humanome\Etablissement\Ecole;
use PDO;

/**
 * LLM API keys encrypted at rest (AD-4, cahier §6.2), since ADR-013 a
 * school's only.
 *
 * A user's keys stay in their browser and are never kept on the server
 * (ADR-013 §1, R1): store() accepts a key only from an account holding the
 * `etablissement` habilitation, which the administrator grants — never a
 * declared role (ADR-013 §2 h) —, the school keeping its own for its
 * learners (lot S6b). The keys of other accounts stored before ADR-013 serve
 * no new run: they are listed « à supprimer » on the account page, revealed
 * to their owner alone so that they may copy them into their browser before
 * deleting them, and purged after a notice by scripts/purger-cles-
 * utilisateurs.php, never run automatically (ADR-013 §8).
 *
 * Cipher: sodium crypto_secretbox (XSalsa20-Poly1305). The master key comes
 * from the environment (SODIUM_MASTER_KEY, 64 hex chars = 32 bytes, stored in
 * ~/app/shared/.env outside the webroot in production). Each entry gets its
 * own random 24-byte nonce, stored as the prefix of the encrypted_key BLOB:
 *
 *     encrypted_key = nonce (24 bytes) || secretbox(apiKey, nonce, masterKey)
 *
 * The list never carries key material, and nothing here is ever logged.
 */
final class KeyVault
{
    /**
     * Providers accepted for storage — mirror of the engine abstraction. Not
     * Mistral AI, though a provider of Twin9's calls (ADR-012): no path uses
     * its key — a Twin9 run reaches it with the instance's, the assistant
     * has no adapter for it —, and a secret without a purpose is not
     * collected (RGPD art. 5.1.c, 2026-10-22).
     */
    public const PROVIDERS = ['anthropic', 'openai', 'google', 'openrouter', 'xai', 'ollama', 'mock'];

    /** What a user is told when the server refuses their key (ADR-013 §5). */
    public const REFUS = 'Vos clés restent dans votre navigateur : humanome ne les garde plus sur ses serveurs.';

    public function __construct(private readonly PDO $pdo, private readonly string $masterKey)
    {
    }

    /**
     * Master key from SODIUM_MASTER_KEY (64 hex chars), null when absent or
     * malformed — routes answer an explicit 503 in that case.
     */
    public static function masterKeyFromEnv(): ?string
    {
        $hex = \Humanome\Env::get('SODIUM_MASTER_KEY');
        if (!\is_string($hex) || preg_match('/^[0-9a-fA-F]{64}$/', $hex) !== 1) {
            return null;
        }
        $binary = sodium_hex2bin($hex);

        return \strlen($binary) === SODIUM_CRYPTO_SECRETBOX_KEYBYTES ? $binary : null;
    }

    /** Whether the server may keep this account's keys: a school's only (ADR-013 §1, R1). */
    public function accepte(int $userId): bool
    {
        return Ecole::est($this->pdo, $userId);
    }

    /**
     * Encrypt + upsert, a school's key only. created_at reflects the LAST
     * write of the entry.
     *
     * @throws KeyRefused for an account without the `etablissement` habilitation: nothing is written
     */
    public function store(int $userId, string $provider, string $apiKey): void
    {
        if (!$this->accepte($userId)) {
            sodium_memzero($apiKey);
            throw new KeyRefused(self::REFUS);
        }
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $blob = $nonce . sodium_crypto_secretbox($apiKey, $nonce, $this->masterKey);
        sodium_memzero($apiKey);

        $stmt = $this->pdo->prepare(
            'INSERT INTO user_api_keys (user_id, provider, encrypted_key, created_at)
             VALUES (?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE encrypted_key = VALUES(encrypted_key), created_at = NOW()'
        );
        $stmt->execute([$userId, $provider, $blob]);
    }

    /**
     * Providers stored for the user — NEVER any key material (M6 contract) —,
     * with the date of the notice of their purge (ADR-013 §8), null before.
     *
     * @return list<array{provider: string, createdAt: string, avisPurgeAt: string|null}>
     */
    public function listForUser(int $userId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT provider, created_at, avis_purge_at FROM user_api_keys WHERE user_id = ? ORDER BY provider'
        );
        $stmt->execute([$userId]);

        return array_map(static fn (array $row): array => [
            'provider' => (string) $row['provider'],
            'createdAt' => str_replace(' ', 'T', (string) $row['created_at']),
            'avisPurgeAt' => $row['avis_purge_at'] === null ? null : str_replace(' ', 'T', (string) $row['avis_purge_at']),
        ], $stmt->fetchAll());
    }

    /**
     * Decrypted key of the authenticated owner: for the account page, which
     * copies it into the browser before deleting it, and for the runs
     * launched on it before ADR-013, until they end (RunKey). Null: no entry, or ciphertext that no longer authenticates (rotated
     * master key, truncated blob) — callers answer 404 either way.
     */
    public function reveal(int $userId, string $provider): ?string
    {
        $stmt = $this->pdo->prepare(
            'SELECT encrypted_key FROM user_api_keys WHERE user_id = ? AND provider = ?'
        );
        $stmt->execute([$userId, $provider]);
        $blob = $stmt->fetchColumn();
        if (!\is_string($blob) || \strlen($blob) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES) {
            return null;
        }

        $nonce = substr($blob, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $cipher = substr($blob, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $clear = sodium_crypto_secretbox_open($cipher, $nonce, $this->masterKey);

        return $clear === false ? null : $clear;
    }

    /** Real deletion of the entry. False when nothing was stored. */
    public function delete(int $userId, string $provider): bool
    {
        $stmt = $this->pdo->prepare(
            'DELETE FROM user_api_keys WHERE user_id = ? AND provider = ?'
        );
        $stmt->execute([$userId, $provider]);

        return $stmt->rowCount() > 0;
    }
}
