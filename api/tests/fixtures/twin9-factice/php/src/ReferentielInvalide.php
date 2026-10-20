<?php

declare(strict_types=1);

namespace Twin9;

/**
 * The real engine's refusal of a referential it cannot read (T16): its mark
 * of an engine that reads the run's referential, without which the platform
 * launches nothing (Lancement). The fake engine reads the referential as the
 * real one does, its poles counted, and never refuses one.
 */
final class ReferentielInvalide extends \InvalidArgumentException
{
}
