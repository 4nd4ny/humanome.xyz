<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Support;

use Humanome\Auth\Users;
use Humanome\Etablissement\CohorteRepository;
use Humanome\Etablissement\Ecoles;
use Humanome\Twin9\CreditService;
use PDO;

/**
 * Outils partagés des tests de l'école (sprint 6, lot S6b — ADR-013 ;
 * UC-ETA-05, UC-APP-10, UC-APP-11) : des écoles, des élèves, leurs
 * cohortes, les réglages d'une école et son crédit, posés directement en
 * base. Aucune donnée réelle : des noms et des adresses fictifs
 * (example.org).
 */
trait EcolesSupport
{
    /**
     * Un compte créé directement en base, avec ses habilitations.
     *
     * @param list<string> $roles
     */
    protected static function compte(PDO $pdo, string $nom, array $roles = ['apprenant']): int
    {
        $pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([uniqid('ecole', true) . '@example.org', Users::hashPassword('x-password-ecole'), $nom]);
        $id = (int) $pdo->lastInsertId();
        $bind = $pdo->prepare('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE name = ?');
        foreach ($roles as $role) {
            $bind->execute([$id, $role]);
        }

        return $id;
    }

    /** Une école : le compte qui porte l'habilitation etablissement, ses réglages, son crédit. */
    protected static function ecole(PDO $pdo, string $nom, float $surtaxe = 3.5, float $plafondUsd = 0.0,
                                    int $creditMicrousd = 0): int
    {
        $id = self::compte($pdo, $nom, ['etablissement']);
        (new Ecoles($pdo))->regler($id, $surtaxe, (int) round($plafondUsd * 1_000_000));
        if ($creditMicrousd !== 0) {
            (new CreditService($pdo))->adjust($id, $creditMicrousd, 'crédit des tests');
        }

        return $id;
    }

    /** L'élève rejoint une cohorte de l'école (créée au besoin) : la ligne est son consentement. */
    protected static function inscrire(PDO $pdo, int $ecoleId, int $eleveId, string $cohorte = 'Cohorte des tests'): int
    {
        $stmt = $pdo->prepare('SELECT id FROM cohortes WHERE etablissement_id = ? AND nom = ?');
        $stmt->execute([$ecoleId, $cohorte]);
        $id = $stmt->fetchColumn();
        $repo = new CohorteRepository($pdo);
        $id = $id === false ? $repo->create($ecoleId, $cohorte)['id'] : (int) $id;
        $repo->join($id, $eleveId);

        return $id;
    }

    /** Ce que l'élève a engagé de l'école ce mois-ci. */
    protected static function engage(PDO $pdo, int $ecoleId, int $eleveId): int
    {
        return (new Ecoles($pdo))->engage($ecoleId, $eleveId, Ecoles::mois());
    }

    protected static function solde(PDO $pdo, int $compte): int
    {
        return (new CreditService($pdo))->balance($compte);
    }
}
