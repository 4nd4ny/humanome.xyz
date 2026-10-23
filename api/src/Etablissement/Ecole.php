<?php

declare(strict_types=1);

namespace Humanome\Etablissement;

use Humanome\Auth\Users;
use PDO;

/**
 * A school (ADR-013 §2 h, §3): the account that holds the `etablissement`
 * habilitation, which only the administrator grants (migration 001,
 * docs/roles.md) — never a role declared in #/compte (sprint 8, migration
 * 035). No second identity: what a school may do that another account may
 * not is asked here, read from the database on every request, so that a
 * habilitation withdrawn applies at once.
 *
 * Since ADR-013 (lot S6a), only a school keeps a key on the server — its
 * own, for its learners (R1, KeyVault) — and only a school buys credits:
 * selling to a private person would ask to check the learners' age (R2).
 */
final class Ecole
{
    public const HABILITATION = 'etablissement';

    /** What an account that is not a school reads when it tries to buy (ADR-013 §5). */
    public const ACHAT_REFUSE = 'Seule une école achète des crédits.';

    /** Why, for the credit page (ADR-013 §5). */
    public const ACHAT_POURQUOI = 'Pour ne pas avoir à vérifier l’âge des apprenants, seules les écoles achètent des '
        . 'crédits : utilisez votre propre clé, dans votre navigateur, ou le crédit de votre école. Votre solde '
        . 'restant reste utilisable jusqu’à épuisement, et remboursable sur demande.';

    /** Whether the account is a school's: it holds the habilitation the administrator grants. */
    public static function est(PDO $pdo, int $userId): bool
    {
        return \in_array(self::HABILITATION, Users::rolesOf($pdo, $userId), true);
    }
}
