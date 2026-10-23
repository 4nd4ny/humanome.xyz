<?php

declare(strict_types=1);

namespace Humanome\Etablissement;

/**
 * A learner's cap for the month would be exceeded (ADR-013 §4): what their
 * school still lets them commit this month does not cover the worst case of
 * the call. Nothing was reserved, nothing debited.
 */
final class PlafondAtteintException extends \RuntimeException
{
    public function __construct(private readonly int $resteMicrousd, private readonly int $requisMicrousd)
    {
        parent::__construct('Plafond de votre école atteint pour ce mois');
    }

    /** What remains of the cap this month, in micro-USD. */
    public function reste(): int
    {
        return $this->resteMicrousd;
    }

    /** What the call would hold, in micro-USD. */
    public function requis(): int
    {
        return $this->requisMicrousd;
    }
}
