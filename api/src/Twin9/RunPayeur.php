<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Etablissement\Payeur;
use stdClass;

/**
 * Who pays a Twin9 run's calls, and with which key, as its row says it
 * (ADR-013 §3, §6; migration 037) — three questions `cle === "instance"`
 * answered at once before the schools:
 *
 * - the key its calls leave with (titulaire(), instance()): the instance's,
 *   its school's on the `ecole` lane, its owner's for a run launched on it
 *   before ADR-013;
 * - the account whose credit is debited (compte()): its owner's on the
 *   instance's key, its school's when its school pays; none on a key of its
 *   own or of its school;
 * - the learner whose cap counts (eleve()), when a school pays for one;
 * - its price (prix()): the instance's contribution, live, for an owner who
 *   pays; the factor its school's launch froze (1 + surtax on its credit,
 *   1.0 on its key); the list price on a personal key.
 *
 * The type (`personnel` or `ecole`) is authoritative: a run of type `ecole`
 * whose school is gone has no account to debit and never falls back on its
 * owner's balance — the slice stops it (Twin9Slice, Payeurs::encorePaie()).
 */
final class RunPayeur
{
    /**
     * @param string $cle the profile's: instance, ecole, or personnelle (a run of before ADR-013)
     * @param string $type personnel or ecole
     */
    public function __construct(
        public readonly int $proprietaire,
        public readonly string $cle,
        public readonly string $type = Payeur::PERSONNEL,
        public readonly ?int $ecoleId = null,
        public readonly ?float $facteur = null,
    ) {
    }

    /**
     * From a run's row: user_id, payeur, payeur_id, facteur_prix, and its profile's `cle`.
     *
     * @param array<string, mixed> $row
     */
    public static function depuis(array $row, stdClass|string $profil): self
    {
        $type = (string) ($row['payeur'] ?? Payeur::PERSONNEL);

        return new self(
            (int) $row['user_id'],
            \is_string($profil) ? $profil : (string) ($profil->cle ?? 'instance'),
            $type === Payeur::ECOLE ? Payeur::ECOLE : Payeur::PERSONNEL,
            ($row['payeur_id'] ?? null) === null ? null : (int) $row['payeur_id'],
            ($row['facteur_prix'] ?? null) === null ? null : (float) $row['facteur_prix'],
        );
    }

    public function ecole(): bool
    {
        return $this->type === Payeur::ECOLE;
    }

    /** Whether its calls leave with the instance's key: its rests after a 429 are the instance's, for every run. */
    public function instance(): bool
    {
        return $this->cle === 'instance';
    }

    /** The account whose credit its calls debit, or null: none (a key of its own, of its school, or its school gone). */
    public function compte(): ?int
    {
        if ($this->cle !== 'instance') {
            return null;
        }

        return $this->ecole() ? $this->ecoleId : $this->proprietaire;
    }

    /** The learner whose cap counts its calls: its owner when a school pays for them; null otherwise. */
    public function eleve(): ?int
    {
        return $this->ecole() && $this->ecoleId !== null && $this->ecoleId !== $this->proprietaire
            ? $this->proprietaire : null;
    }

    /** Whether a ledger holds each call's worst case: a credit, or a learner's cap. */
    public function reserve(): bool
    {
        return $this->compte() !== null || $this->eleve() !== null;
    }

    /**
     * Its calls' price: true, the instance's contribution, live (an owner who
     * pays); false, the list price (a personal key); a float, the factor its
     * school's launch froze. A school's run without its factor is priced at
     * the contribution, the prudent side, until the slice stops it.
     */
    public function prix(): bool|float
    {
        if ($this->ecole()) {
            return $this->facteur ?? true;
        }

        return $this->cle === 'instance';
    }

    /** The factor its evaluation records (Evaluations: the price it converts by). */
    public function marge(Twin9Config $config): float
    {
        $prix = $this->prix();

        return \is_float($prix) ? $prix : ($prix ? $config->marge() : 1.0);
    }

    /** The account whose key its calls leave with: its school's on the `ecole` lane, its owner's otherwise. */
    public function titulaire(): int
    {
        return $this->cle === 'ecole' ? (int) ($this->ecoleId ?? 0) : $this->proprietaire;
    }
}
