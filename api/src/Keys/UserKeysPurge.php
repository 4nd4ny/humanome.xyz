<?php

declare(strict_types=1);

namespace Humanome\Keys;

use Humanome\Auth\Audit;
use Humanome\Env;
use Humanome\Etablissement\Ecole;
use Humanome\Mail\Mailer;
use Humanome\Twin9\BatchApi;
use Humanome\Twin9\RunPurge;
use Humanome\Twin9\RunRepository;
use PDO;

/**
 * The purge of the user keys stored before ADR-013 (§2 a, §8): an
 * administration tool, run by hand only — never by the worker, a scheduled
 * task nor a deployment. Its CLI is scripts/purger-cles-utilisateurs.php;
 * the day of the purge, and how it runs in production (no SSH on the OVH
 * hosting, ADR-008), are Christian's to decide.
 *
 * Since ADR-013 no route writes a user key (PUT /api/keys answers 410): every
 * row of user_api_keys is a key stored before, which serves no new run.
 *
 * Three steps, each asked for explicitly:
 *   - count(): numbers only, never a key nor an address (§8, step 1) — the
 *     default of the CLI, which changes nothing;
 *   - notify(): writes to each account that still has a key and was not told
 *     yet, then dates the notice (user_api_keys.avis_purge_at, migration
 *     036). An account is never told twice; a mail the transport refused
 *     leaves it untold, for the next time;
 *   - purge(): deletes the keys notified DELAI_JOURS days ago at least, for
 *     an account that has no run in progress on its personal key (such a run
 *     ends on it, §8 step 3): its batches submitted with that key are first
 *     cancelled, then deleted at Anthropic while the key is there (RunPurge::
 *     lotsPersonnels(), §8 step 4). One audit event per account, naming its
 *     providers, never a key.
 */
final class UserKeysPurge
{
    /** Days between the notice and the purge (ADR-013 §8, step 6). */
    public const DELAI_JOURS = 30;

    public const AUDIT_AVIS = 'api_keys_purge_notice';
    public const AUDIT_PURGE = 'api_keys_purged';

    public function __construct(
        private readonly PDO $pdo,
        private readonly Mailer $mailer,
        private readonly ?BatchApi $api = null,
    ) {
    }

    /**
     * What there is before the deployment of S6a, or before a notice or a
     * purge (ADR-013 §8, step 1): numbers only.
     *
     * @return array{comptes_avec_cle: int, cles_par_fournisseur: array<string, int>, comptes_avises: int,
     *               comptes_purgeables: int, runs_en_cours_cle_personnelle: int, profils_cle_personnelle: int,
     *               comptes_solde_positif: int, ecoles_solde_positif: int}
     */
    public function count(): array
    {
        $parFournisseur = [];
        foreach ($this->pdo->query('SELECT provider, COUNT(*) AS n FROM user_api_keys GROUP BY provider ORDER BY provider')
                     ->fetchAll() as $row) {
            $parFournisseur[(string) $row['provider']] = (int) $row['n'];
        }
        $positifs = $this->pdo->query(
            'SELECT c.user_id FROM twin9_credits c WHERE c.balance_microusd > 0'
        )->fetchAll(PDO::FETCH_COLUMN);
        $ecoles = 0;
        foreach ($positifs as $userId) {
            $ecoles += Ecole::est($this->pdo, (int) $userId) ? 1 : 0;
        }
        $enCours = 0;
        foreach ($this->runsEnCoursPersonnels() as $runs) {
            $enCours += $runs;
        }

        return [
            'comptes_avec_cle' => (int) $this->pdo->query('SELECT COUNT(DISTINCT user_id) FROM user_api_keys')
                ->fetchColumn(),
            'cles_par_fournisseur' => $parFournisseur,
            'comptes_avises' => (int) $this->pdo->query(
                'SELECT COUNT(DISTINCT user_id) FROM user_api_keys WHERE avis_purge_at IS NOT NULL'
            )->fetchColumn(),
            'comptes_purgeables' => \count($this->purgeables()),
            'runs_en_cours_cle_personnelle' => $enCours,
            'profils_cle_personnelle' => (int) $this->pdo->query(
                'SELECT COUNT(*) FROM twin9_profils WHERE JSON_UNQUOTE(JSON_EXTRACT(profil, "$.cle")) = "personnelle"'
            )->fetchColumn(),
            'comptes_solde_positif' => \count($positifs),
            'ecoles_solde_positif' => $ecoles,
        ];
    }

    /**
     * Writes to each account that has a key and was not told yet, then dates
     * the notice of all its keys.
     *
     * @return array{avises: int, refuses: int}
     */
    public function notify(): array
    {
        $comptes = $this->pdo->query(
            'SELECT u.id, u.email, GROUP_CONCAT(k.provider ORDER BY k.provider) AS providers
               FROM user_api_keys k JOIN users u ON u.id = k.user_id
              GROUP BY u.id, u.email
             HAVING SUM(k.avis_purge_at IS NOT NULL) = 0
              ORDER BY u.id'
        )->fetchAll();
        $date = $this->pdo->query('SELECT DATE_FORMAT(NOW() + INTERVAL ' . self::DELAI_JOURS . ' DAY, "%d/%m/%Y")')
            ->fetchColumn();
        $avises = 0;
        $refuses = 0;
        foreach ($comptes as $compte) {
            $userId = (int) $compte['id'];
            $providers = explode(',', (string) $compte['providers']);
            if (!$this->mailer->send((string) $compte['email'], self::sujet(), self::corps($providers, (string) $date))) {
                $refuses++;
                continue;
            }
            $this->pdo->prepare('UPDATE user_api_keys SET avis_purge_at = NOW() WHERE user_id = ? AND avis_purge_at IS NULL')
                ->execute([$userId]);
            Audit::record($this->pdo, $userId, self::AUDIT_AVIS, ['providers' => $providers]);
            $avises++;
        }

        return ['avises' => $avises, 'refuses' => $refuses];
    }

    /**
     * Deletes the keys notified DELAI_JOURS days ago at least, account by
     * account, until $fin; an account with a run in progress on its personal
     * key is put off.
     *
     * @param float $fin when it must stop at the latest (microtime): what is left waits for the next time
     * @return array{comptes: int, cles: int, reportes: int}
     */
    public function purge(float $fin): array
    {
        $enCours = $this->runsEnCoursPersonnels();
        $comptes = 0;
        $cles = 0;
        $reportes = 0;
        foreach ($this->purgeables() as $userId => $providers) {
            if (microtime(true) >= $fin) {
                break;
            }
            if (($enCours[$userId] ?? 0) > 0) {
                $reportes++;
                continue;
            }
            // its batches submitted with its key, cancelled then deleted at Anthropic while the key is there
            (new RunPurge($this->pdo, $this->api))->lotsPersonnels($userId, $fin);
            $stmt = $this->pdo->prepare(
                'DELETE FROM user_api_keys WHERE user_id = ? AND avis_purge_at IS NOT NULL
                    AND avis_purge_at <= NOW() - INTERVAL ' . self::DELAI_JOURS . ' DAY'
            );
            $stmt->execute([$userId]);
            if ($stmt->rowCount() === 0) {
                continue;
            }
            Audit::record($this->pdo, $userId, self::AUDIT_PURGE, ['providers' => $providers]);
            $comptes++;
            $cles += $stmt->rowCount();
        }

        return ['comptes' => $comptes, 'cles' => $cles, 'reportes' => $reportes];
    }

    /** @return array<int, list<string>> the providers of each account whose keys may go, by account */
    private function purgeables(): array
    {
        $comptes = [];
        foreach ($this->pdo->query(
            'SELECT user_id, provider FROM user_api_keys
              WHERE avis_purge_at IS NOT NULL AND avis_purge_at <= NOW() - INTERVAL ' . self::DELAI_JOURS . ' DAY
              ORDER BY user_id, provider'
        )->fetchAll() as $row) {
            $comptes[(int) $row['user_id']][] = (string) $row['provider'];
        }

        return $comptes;
    }

    /** @return array<int, int> the runs in progress on the personal key, by owner — an owner without any is absent */
    private function runsEnCoursPersonnels(): array
    {
        $runs = new RunRepository($this->pdo);
        $parCompte = [];
        foreach ($this->pdo->query('SELECT id FROM twin9_runs WHERE statut = "en_cours" ORDER BY id')
                     ->fetchAll(PDO::FETCH_COLUMN) as $id) {
            $tete = $runs->tete((int) $id);
            if ($tete !== null && ($tete['profil']->cle ?? 'instance') === 'personnelle') {
                $parCompte[$tete['user_id']] = ($parCompte[$tete['user_id']] ?? 0) + 1;
            }
        }

        return $parCompte;
    }

    public static function sujet(): string
    {
        return 'humanome.xyz — vos clés API enregistrées seront supprimées';
    }

    /**
     * The notice (ADR-013 §7): what is kept, why it goes, from which date,
     * how to copy it into the browser or delete it now. Never the key.
     *
     * @param list<string> $providers
     */
    public static function corps(array $providers, string $date): string
    {
        $site = rtrim(Env::get('SITE_URL', 'https://humanome.xyz'), '/');

        return implode("\n", [
            'Bonjour,',
            '',
            'Vous aviez enregistré sur humanome.xyz une clé API (' . implode(', ', $providers) . '), chiffrée.',
            '',
            'humanome ne garde plus les clés de ses utilisateurs sur ses serveurs : vos clés restent dans votre',
            'navigateur. Seule une école garde la sienne, pour ses élèves. La clé que vous aviez enregistrée ne',
            'sert plus à aucune analyse.',
            '',
            'Elle sera supprimée du serveur à partir du ' . $date . '. D\'ici là, dans « Mon compte »',
            '(' . $site . '/#/compte), section « Clés API » :',
            '- « Recopier dans ce navigateur, puis supprimer » la recopie dans votre navigateur avant de la',
            '  supprimer du serveur ;',
            '- « Supprimer du serveur » la supprime tout de suite.',
            '',
            'Si vous ne souhaitez pas la garder, vous n\'avez rien à faire.',
            '',
            '— L\'équipe humanome.xyz',
        ]);
    }
}
