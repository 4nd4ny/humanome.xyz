<?php

declare(strict_types=1);

namespace Humanome\Keys;

/**
 * The server refuses to keep a key: the account is not a school's (ADR-013
 * §1, R1). Its message is the one the user reads.
 */
final class KeyRefused extends \RuntimeException
{
}
