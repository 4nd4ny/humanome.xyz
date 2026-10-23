<?php

declare(strict_types=1);

namespace Humanome\Etablissement;

use PDO;

/**
 * A school's API key, for its learners (ADR-013 §1 R1, §3, §5, §7; migration
 * 037): the only key the server keeps since ADR-013 — a user's stays in
 * their browser.
 *
 * - Encrypted at rest exactly as KeyVault does (AD-4): nonce (24 bytes) ||
 *   secretbox(key, nonce, masterKey), the master key from SODIUM_MASTER_KEY,
 *   outside the webroot in production.
 * - Written and erased by the school (its establishment space), never read
 *   back by a route, not even by the school: liste() says which providers
 *   have one and since when, never any key material. Only RunKey (a Twin9
 *   run on the `ecole` lane) and the open cartography (a call its school
 *   pays) read it, as each call leaves; it is kept nowhere else, never
 *   logged.
 * - Anthropic only (ADR-013 §6): a school's key never reaches another
 *   provider, whose account holder could read back what was sent with it —
 *   the guard of ADR-012 §5, now the school's, as the school is the holder
 *   of its key. The results of a batch sent with it stay readable in the
 *   school's Anthropic Console: the launch tells the learner.
 * - Purged with the school's account (CASCADE).
 */
final class EcoleCles
{
    /** The providers a school's key serves: Anthropic only (ADR-013 §6). */
    public const FOURNISSEURS = ['anthropic'];

    /** A key's length, at most, in bytes (KeyVault's VARBINARY(512) less the nonce and the MAC). */
    public const LONGUEUR_MAX = 400;

    public function __construct(private readonly PDO $pdo, private readonly string $masterKey)
    {
    }

    /** Whether a school has a key for a provider; read without the master key. */
    public static function presente(PDO $pdo, int $ecoleId, string $fournisseur = 'anthropic'): bool
    {
        $stmt = $pdo->prepare('SELECT 1 FROM ecole_cles WHERE ecole_id = ? AND fournisseur = ?');
        $stmt->execute([$ecoleId, $fournisseur]);

        return $stmt->fetchColumn() !== false;
    }

    /**
     * The providers a school has a key for, and since when — never any key material.
     *
     * @return list<array{fournisseur: string, poseeLe: string}>
     */
    public static function liste(PDO $pdo, int $ecoleId): array
    {
        $stmt = $pdo->prepare('SELECT fournisseur, created_at FROM ecole_cles WHERE ecole_id = ? ORDER BY fournisseur');
        $stmt->execute([$ecoleId]);

        return array_map(static fn (array $row): array => [
            'fournisseur' => (string) $row['fournisseur'],
            'poseeLe' => str_replace(' ', 'T', (string) $row['created_at']),
        ], $stmt->fetchAll());
    }

    /** Encrypt and upsert a school's key; the caller checked the school and the provider. */
    public function poser(int $ecoleId, string $fournisseur, string $cle): void
    {
        if (!\in_array($fournisseur, self::FOURNISSEURS, true)) {
            sodium_memzero($cle);
            throw new \InvalidArgumentException('Fournisseur non pris en charge pour une clé d’école');
        }
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $blob = $nonce . sodium_crypto_secretbox($cle, $nonce, $this->masterKey);
        sodium_memzero($cle);
        $this->pdo->prepare(
            'INSERT INTO ecole_cles (ecole_id, fournisseur, encrypted_key, created_at) VALUES (?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE encrypted_key = VALUES(encrypted_key), created_at = NOW()'
        )->execute([$ecoleId, $fournisseur, $blob]);
    }

    /** Real deletion. False when nothing was kept. */
    public static function retirer(PDO $pdo, int $ecoleId, string $fournisseur): bool
    {
        $stmt = $pdo->prepare('DELETE FROM ecole_cles WHERE ecole_id = ? AND fournisseur = ?');
        $stmt->execute([$ecoleId, $fournisseur]);

        return $stmt->rowCount() > 0;
    }

    /**
     * The decrypted key, for a call that leaves on it (RunKey, the open
     * cartography) — never for a route. Null: none, or a ciphertext that no
     * longer authenticates (a master key rotated).
     */
    public function lire(int $ecoleId, string $fournisseur = 'anthropic'): ?string
    {
        $stmt = $this->pdo->prepare('SELECT encrypted_key FROM ecole_cles WHERE ecole_id = ? AND fournisseur = ?');
        $stmt->execute([$ecoleId, $fournisseur]);
        $blob = $stmt->fetchColumn();
        if (!\is_string($blob) || \strlen($blob) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES) {
            return null;
        }
        $clair = sodium_crypto_secretbox_open(substr($blob, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES),
            substr($blob, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), $this->masterKey);

        return $clair === false ? null : $clair;
    }
}
