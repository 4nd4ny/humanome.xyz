<?php
/**
 * Relais de la maintenance quotidienne d'humanome.xyz, pour une tâche planifiée
 * (cron) d'un AUTRE hébergement OVH — l'offre gratuite d'humanome.xyz n'a pas
 * de cron. Le pendant de humanome-tick.php, à côté.
 *
 * Appelle une fois POST /api/admin/maintenance avec le jeton du tick (le même
 * fichier que humanome-tick.php ; la route l'accepte depuis le 2026-10-22). La
 * route purge ce qui a expiré — les liens de partage morts depuis plus de 30
 * jours, les compteurs de la démo des jours passés, les défis anti-abus
 * expirés — et rend ses compteurs. Rejouée, elle ne fait rien de plus.
 *
 * Installation : dans le dossier cron/ de humanome-tick.php, hors de www/.
 * Tâche planifiée : commande cron/humanome-maintenance.php, langage PHP 8,
 * une fois par jour.
 *
 * Sortie : les compteurs, ou l'erreur. Code de sortie 0 sur la réponse 200 de
 * la route, 1 sinon (après 10 échecs de suite, dix jours, OVH désactive la
 * tâche).
 *
 * Documentation : docs/deploiement.md, « Depuis un autre hébergement OVH ».
 */

$url = 'https://humanome.xyz/api/admin/maintenance';
$fichierJeton = __DIR__ . '/humanome-tick.jeton';

foreach (array_slice($argv ?? [], 1) as $option) {
    if (preg_match('/^--url=(\S+)$/', $option, $m)) {
        $url = $m[1];
    }
}

$jeton = is_readable($fichierJeton) ? trim((string) file_get_contents($fichierJeton)) : '';
if ($jeton === '') {
    echo "humanome-maintenance : jeton absent ou illisible ($fichierJeton)\n";
    exit(1);
}

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => '',
    CURLOPT_HTTPHEADER => ['X-Worker-Tick-Token: ' . $jeton],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 15,
    CURLOPT_TIMEOUT => 60,
]);
$corps = curl_exec($ch);
$statut = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$erreur = curl_error($ch);
curl_close($ch);

if ($statut === 200) {
    echo 'maintenance : ' . trim((string) $corps) . "\n";
    exit(0);
}
echo 'maintenance en échec (HTTP ' . $statut . ($erreur !== '' ? ", $erreur" : '') . ')'
    . ($statut === 403 ? ' : jeton refusé — le même que celui du tick, dans le .env d’humanome.xyz ?' : '')
    . "\n";
exit(1);
