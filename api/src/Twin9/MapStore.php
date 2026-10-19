<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use PDO;
use Twin9\Run\Store;

/**
 * The memory of a map at rest (twin9_memoire): a JSON text by key, kept
 * compressed, read entry by entry as the engine asks. The engine decides what
 * it writes and when (a day done at once, the rest at the end of the run).
 *
 * A store serves one run for one slice, and a map advances one run at a time
 * (RunRepository::aAvancer): what it read stays true until it writes, so it
 * keeps it, and the passes of the slice do not read it again.
 */
final class MapStore implements Store
{
    /** @var array<string, string|null> the entries read or written, by key */
    private array $textes = [];

    /** @var array<string, true>|null the keys of the map */
    private ?array $cles = null;

    public function __construct(private readonly PDO $pdo, private readonly int $carteId)
    {
    }

    public function read(string $key): ?string
    {
        if (!\array_key_exists($key, $this->textes)) {
            $stmt = $this->pdo->prepare('SELECT valeur FROM twin9_memoire WHERE carte_id = ? AND cle = ?');
            $stmt->execute([$this->carteId, $key]);
            $blob = $stmt->fetchColumn();
            $this->textes[$key] = $blob === false ? null : RunRepository::uncompress((string) $blob);
        }

        return $this->textes[$key];
    }

    public function keys(string $prefix): array
    {
        if ($this->cles === null) {
            $stmt = $this->pdo->prepare('SELECT cle FROM twin9_memoire WHERE carte_id = ?');
            $stmt->execute([$this->carteId]);
            $this->cles = array_fill_keys(array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN)), true);
        }
        $keys = array_values(array_filter(array_map('strval', array_keys($this->cles)),
            static fn (string $k): bool => str_starts_with($k, $prefix)));
        sort($keys, SORT_STRING);

        return $keys;
    }

    public function write(string $key, string $text): void
    {
        $this->pdo->prepare(
            'INSERT INTO twin9_memoire (carte_id, cle, valeur) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE valeur = VALUES(valeur)'
        )->execute([$this->carteId, $key, RunRepository::compress($text)]);
        $this->textes[$key] = $text;
        if ($this->cles !== null) {
            $this->cles[$key] = true;
        }
    }
}
