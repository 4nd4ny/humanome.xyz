<?php

declare(strict_types=1);

namespace Humanome\Etablissement;

/**
 * Who pays a usage (ADR-013 §3, §4), as a launch resolves it (Payeurs): its
 * owner on their remaining balance (`personnel`, with the instance's
 * contribution), or a school (`ecole`), its factor frozen — 1 + its surtax
 * on its credit, 1.0 on its key.
 */
final class Payeur
{
    public const PERSONNEL = 'personnel';

    public const ECOLE = 'ecole';

    private function __construct(
        public readonly string $type,
        public readonly ?int $ecoleId,
        public readonly ?float $facteur,
        public readonly ?string $nom = null,
    ) {
    }

    public static function personnel(): self
    {
        return new self(self::PERSONNEL, null, null);
    }

    public static function ecole(int $ecoleId, float $facteur, string $nom = ''): self
    {
        return new self(self::ECOLE, $ecoleId, $facteur, $nom);
    }

    public function estEcole(): bool
    {
        return $this->type === self::ECOLE;
    }
}
