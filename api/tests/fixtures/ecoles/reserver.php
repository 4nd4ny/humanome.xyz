<?php

declare(strict_types=1);

/**
 * One of the concurrent processes of UC-ETA-05-U08 (ADR-013 §4, « concurrence
 * du débit »): on its own connection to the test database, it waits for the
 * moment its parent named, then holds $n reservations on a learner's cap and
 * their school's credit (GrandLivreLocal), and prints how many passed and
 * how many were refused, as JSON. Tests only: no network, no real data.
 *
 * Usage: php reserver.php <ecole> <eleve|0> <mois> <montant> <n> <depart (unix time, float)>
 */

use Humanome\Etablissement\GrandLivreLocal;
use Humanome\Etablissement\PlafondAtteintException;
use Humanome\Tests\TestDb;
use Humanome\Twin9\SoldeInsuffisantException;

require dirname(__DIR__, 3) . '/vendor/autoload.php';

[, $ecole, $eleve, $mois, $montant, $n, $depart] = $argv;
$pdo = TestDb::pdo();
$grandLivre = new GrandLivreLocal($pdo);
// together with the other processes; one started late leaves at once (time_sleep_until would warn on stdout)
if ((float) $depart > microtime(true)) {
    time_sleep_until((float) $depart);
}
$passes = 0;
$refus = 0;
for ($i = 0; $i < (int) $n; $i++) {
    try {
        $grandLivre->reserver((int) $ecole, (int) $eleve === 0 ? null : (int) $eleve, $mois, (int) $montant, true,
            'concurrence (réserve)');
        $passes++;
    } catch (PlafondAtteintException|SoldeInsuffisantException) {
        $refus++;
    }
}
echo json_encode(['passes' => $passes, 'refus' => $refus], JSON_THROW_ON_ERROR);
