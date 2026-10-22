<?php
/**
 * Relais du tick d'humanome.xyz, pour une tâche planifiée (cron) d'un AUTRE
 * hébergement OVH — l'offre gratuite d'humanome.xyz n'a pas de cron.
 *
 * Le cron d'OVH ne lance une tâche qu'une fois par heure, et l'arrête au bout
 * de 60 minutes. Ce script appelle donc le tick (POST /api/admin/worker-tick)
 * chaque minute pendant 55 minutes, puis s'arrête avant la limite : la tâche
 * horaire suivante prend le relais. Le tick fait avancer les runs Twin9 et la
 * masse, et relève les prix d'Anthropic une fois par jour UTC. Deux relais qui
 * se chevauchent ne se gênent pas : le serveur tient un verrou ({"locked":true}).
 *
 * Installation (hors du dossier www/, jamais servi par le web) :
 *   cron/humanome-tick.php    ce fichier
 *   cron/humanome-tick.jeton  la valeur de WORKER_TICK_TOKEN (~/app/shared/.env
 *                             d'humanome.xyz), seule sur sa ligne ; droits 600
 * Tâche planifiée : commande cron/humanome-tick.php, langage PHP 8, chaque heure.
 * Essai d'une minute en SSH ou à la main : php humanome-tick.php --duree=60
 *
 * Sortie : une ligne par tick qui a fait quelque chose ou qui a échoué, puis un
 * bilan — des compteurs seulement, jamais de contenu. Code de sortie 1 si le
 * jeton manque ou est refusé (après 10 échecs, OVH désactive la tâche : c'est
 * voulu, un jeton faux ne se corrige pas seul) ; 0 sinon, même si un tick a
 * échoué en route (un serveur lent, une coupure).
 *
 * La maintenance quotidienne : humanome-maintenance.php, à côté, même jeton.
 * Documentation : docs/deploiement.md, « Depuis un autre hébergement OVH ».
 */

$url = 'https://humanome.xyz/api/admin/worker-tick';
$fichierJeton = __DIR__ . '/humanome-tick.jeton';
$duree = 55 * 60;   // secondes : sous les 60 minutes d'OVH
$periode = 60;      // secondes entre deux débuts de tick
$delaiHttp = 90;    // secondes : une tranche dure 40 s par défaut, 45 au plus

foreach (array_slice($argv ?? [], 1) as $option) {
    if (preg_match('/^--duree=(\d+)$/', $option, $m)) {
        $duree = (int) $m[1];
    } elseif (preg_match('/^--periode=(\d+)$/', $option, $m)) {
        $periode = max(1, (int) $m[1]);
    } elseif (preg_match('/^--url=(\S+)$/', $option, $m)) {
        $url = $m[1];
    }
}

$jeton = is_readable($fichierJeton) ? trim((string) file_get_contents($fichierJeton)) : '';
if ($jeton === '') {
    echo "humanome-tick : jeton absent ou illisible ($fichierJeton)\n";
    exit(1);
}

$debut = time();
$ticks = 0;
$echecs = 0;
$refus = 0;
$verrouilles = 0;
$cumul = [];
$interessants = ['twin9Runs', 'twin9Passes', 'twin9Appels', 'twin9Termines', 'twin9Echoues', 'twin9Lots', 'calls', 'jobsTouched'];

while (time() - $debut < $duree) {
    $t0 = microtime(true);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => '{}',
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Worker-Tick-Token: ' . $jeton],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT => $delaiHttp,
    ]);
    $corps = curl_exec($ch);
    $statut = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $erreur = curl_error($ch);
    $ticks++;
    $heure = gmdate('H:i:s');

    if ($statut === 403 || $statut === 404) {
        $refus++;
        echo "$heure tick refusé (HTTP $statut) : jeton faux, ou absent du .env d'humanome.xyz\n";
        break;
    }
    $donnees = is_string($corps) ? json_decode($corps, true) : null;
    if ($statut !== 200 || !is_array($donnees)) {
        $echecs++;
        echo "$heure tick en échec (HTTP $statut" . ($erreur !== '' ? ", $erreur" : '') . ")\n";
    } elseif (!empty($donnees['locked'])) {
        $verrouilles++;
    } else {
        $actif = [];
        foreach ($interessants as $cle) {
            $valeur = (int) ($donnees[$cle] ?? 0);
            $cumul[$cle] = ($cumul[$cle] ?? 0) + $valeur;
            if ($valeur > 0) {
                $actif[] = "$cle=$valeur";
            }
        }
        if (isset($donnees['tarifs'])) {
            $actif[] = 'tarifs=' . $donnees['tarifs'];
        }
        if ($actif !== []) {
            echo "$heure " . implode(' ', $actif) . "\n";
        }
    }

    $attente = (int) ceil($periode - (microtime(true) - $t0));
    $reste = $duree - (time() - $debut);
    if ($attente > 0 && $reste > 0) {
        sleep(min($attente, $reste));
    }
}

$bilan = [];
foreach ($cumul as $cle => $valeur) {
    if ($valeur > 0) {
        $bilan[] = "$cle=$valeur";
    }
}
echo 'bilan : ' . $ticks . ' ticks en ' . round((time() - $debut) / 60) . ' min ; ' . $echecs . ' en échec ; '
    . $verrouilles . ' verrouillés' . ($bilan !== [] ? ' ; ' . implode(' ', $bilan) : '') . "\n";
exit($refus > 0 ? 1 : 0);
