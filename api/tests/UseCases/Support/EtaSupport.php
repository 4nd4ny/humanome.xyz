<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Support;

use Humanome\Auth\Users;
use Humanome\Etablissement\CohorteRepository;
use Humanome\Packages\PromptPackageRepository;
use Humanome\Referentiel\ReferentielRepository;
use PDO;

/**
 * Outils partagés du lot « Établissement et traitement de masse »
 * (UC-ETA-01..04, UC-SYS-01 — docs/cas-utilisation/etablissement/,
 * docs/cas-utilisation/systeme/UC-SYS-01-traiter-file-jobs.md).
 *
 * - Semis SQL directs pour les tests UNITAIRES (comptes, cohortes, membres,
 *   dépôts, runs, jobs) : les classes du domaine sont ensuite appelées sans
 *   couche HTTP.
 * - Surcharge temporaire de variables d'environnement (WORKER_PROVIDER,
 *   MIGRATE_TOKEN, SODIUM_MASTER_KEY…) restaurée quoi qu'il arrive : les
 *   bases de test partagent le processus PHPUnit.
 * - Fixtures : référentiel RESPIRE v7 (instantané versionné
 *   schemas/fixtures/referentiel-respire-v7.json), paquet par défaut construit
 *   depuis les gabarits du moteur (build/, généré — précondition vérifiée),
 *   documents jour du schéma.
 * - Verrou du worker : GET_LOCK('humanome_worker') est global au serveur
 *   MySQL (UC-SYS-01, RG1) ; untilUnlocked() relance un tick tant qu'un AUTRE
 *   processus PHPUnit (autre base de test) le tient.
 */
trait EtaSupport
{
    /** Racine du dépôt (api/tests/UseCases/Support -> ../../../..). */
    protected static function repoRoot(): string
    {
        return \dirname(__DIR__, 4);
    }

    /** @return array<string, mixed> document cartographie-jour réel (schemas/fixtures) */
    protected static function dayDocument(string $date = '2026-01-05'): array
    {
        $path = self::repoRoot() . '/schemas/fixtures/cartographie-jour-' . $date . '.json';

        return json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }

    /**
     * @return array<string, mixed> référentiel RESPIRE v7 — instantané VERSIONNÉ
     *   de web/public/data/referentiel/respire-v7.json (fichier généré, absent
     *   d'un checkout neuf) ; seul le champ `source` diffère, même contentHash.
     */
    protected static function respireReferentiel(): array
    {
        $path = self::repoRoot() . '/schemas/fixtures/referentiel-respire-v7.json';

        return json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }

    /** @return array<string, mixed> paquet par défaut construit depuis les gabarits du moteur */
    protected static function defaultPackage(): array
    {
        $path = self::repoRoot() . '/build/prompt-packages/aurora-v3-reconstruit-1.0.0.json';
        self::assertFileExists($path, 'run: node scripts/build-default-prompt-package.mjs');

        return json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }

    /**
     * Relance $run (un tick) tant qu'il répond {locked: true} parce qu'un AUTRE
     * processus tient le verrou global du worker (≤ 30 s). À ne pas utiliser
     * quand le test tient lui-même le verrou (A6).
     *
     * @param callable(): array<string, mixed> $run
     * @return array<string, mixed>
     */
    protected static function untilUnlocked(callable $run): array
    {
        for ($try = 1; ; $try++) {
            $counters = $run();
            if (($counters['locked'] ?? false) !== true || $try >= 300) {
                return $counters;
            }
            usleep(100_000);
        }
    }

    /**
     * Paquet dont les gabarits d'extraction LISENT le référentiel (2026-10-20),
     * dérivé en mémoire du paquet par défaut 1.0.0 : « RESPIRE », « 7 pôles »,
     * « 1.01 » et « 4.02 », qu'il écrit en toutes lettres, deviennent
     * {{referentiel_nom}}, {{nb_poles}}, {{code_exemple_1}}, {{code_exemple_2}},
     * déclarées — ce que fait la 1.1.0 du paquet par défaut. Pour RESPIRE v7,
     * ses prompts sont ceux de 1.0.0, à l'octet.
     *
     * @return array<string, mixed>
     */
    protected static function packageReadingTheReferentiel(string $id = 'aurora-lit-referentiel'): array
    {
        $replace = static function (string $texte, array $pairs): string {
            foreach ($pairs as $from => $to) {
                self::assertStringContainsString($from, $texte, 'gabarit 1.0.0 inattendu');
                $texte = str_replace($from, $to, $texte);
            }

            return $texte;
        };
        $declare = static fn (array $noms): array => array_map(
            static fn (string $nom): array => ['nom' => $nom, 'description' => "Valeur lue dans le référentiel ({$nom})."],
            $noms,
        );
        $doc = self::defaultPackage();
        $doc['id'] = $id;
        $doc['version'] = '1.0.0';
        $doc['changelog'] = [['version' => '1.0.0', 'description' => 'Paquet de test : les gabarits d’extraction lisent le référentiel.']];
        foreach ($doc['prompts'] as &$prompt) {
            if ($prompt['role'] === 'extraction-pole') {
                $prompt['texte'] = $replace($prompt['texte'], ['du référentiel RESPIRE' => 'du référentiel {{referentiel_nom}}']);
                $prompt['variables'] = [...$prompt['variables'], ...$declare(['referentiel_nom'])];
            } elseif ($prompt['role'] === 'kairos') {
                $prompt['texte'] = $replace($prompt['texte'], [
                    'Les 7 pôles de la feuille' => 'Les {{nb_poles}} pôles de la feuille',
                    '# Référentiel RESPIRE (' => '# Référentiel {{referentiel_nom}} (',
                    '"1.01"' => '"{{code_exemple_1}}"',
                    '"4.02"' => '"{{code_exemple_2}}"',
                ]);
                $prompt['variables'] = [...$prompt['variables'], ...$declare(['referentiel_nom', 'code_exemple_1', 'code_exemple_2'])];
            }
        }
        unset($prompt);

        return $doc;
    }

    /**
     * Une journée conforme à un autre référentiel, tirée de la fixture du
     * corpus : son pôle k emprunte le pôle de rang k de la fixture (en
     * boucle), ses compétences prennent les premiers codes du pôle k ; pas de
     * kairos ; le document nomme son référentiel (T17).
     *
     * @param array<string, mixed> $referentiel
     * @return array<string, mixed>
     */
    protected static function dayDocumentFor(array $referentiel, string $date = '2026-01-05'): array
    {
        $fixture = self::dayDocument($date);
        $nums = array_map(static fn (array $p): int => (int) $p['num'], $referentiel['poles']);
        sort($nums);
        $poles = [];
        foreach ($nums as $rang => $num) {
            $codes = [];
            foreach ($referentiel['competences'] as $c) {
                if ((int) $c['pole'] === $num) {
                    $codes[] = (string) $c['code'];
                }
            }
            sort($codes, SORT_STRING);
            $pole = $fixture['poles'][$rang % \count($fixture['poles'])];
            $pole['poleNum'] = (string) $num;
            $pole['competences'] = array_map(
                static fn (array $c, string $code): array => ['code' => $code] + $c,
                \array_slice($pole['competences'], 0, \count($codes)),
                \array_slice($codes, 0, \count($pole['competences'])),
            );
            $poles[] = $pole;
        }

        return ['schemaVersion' => '1.0.0', 'kind' => 'cartographie-jour', 'referentiel' => (string) $referentiel['id'],
            'date' => $date, 'poles' => $poles, 'kairos' => null];
    }

    /** Publie un document de référentiel (empreinte calculée), une version de RESPIRE ou un autre. */
    protected static function publishReferentielDocument(PDO $pdo, array $doc, string $note = 'Import UC-ETA'): void
    {
        $repo = new ReferentielRepository($pdo);
        $doc['contentHash'] = $repo->validateDocument($doc)['contentHash'];
        $repo->importPublishedDocument($doc, $note);
    }

    /**
     * Une version de RESPIRE en six pôles (sans son pôle 7 : les pôles se
     * numérotent de 1 à N, T15), publiable — RESPIRE n'a plus de structure
     * imposée (2026-10-20).
     *
     * @return array<string, mixed>
     */
    protected static function respireSixPoles(string $version = '8.0.0'): array
    {
        $doc = self::respireReferentiel();
        unset($doc['contentHash']);
        $doc['version'] = $version;
        $doc['label'] = 'RESPIRE v8 (six pôles)';
        $doc['poles'] = array_values(array_filter($doc['poles'], static fn (array $p): bool => (int) $p['num'] !== 7));
        $doc['competences'] = array_values(array_filter($doc['competences'], static fn (array $c): bool => (int) $c['pole'] !== 7));

        return $doc;
    }

    /** Référentiel v7 + paquet par défaut publiés en base (préconditions d'un run). */
    protected static function seedPublishedVersions(PDO $pdo): void
    {
        $pdo->exec('DELETE FROM referentiel_versions');
        $pdo->exec('DELETE FROM prompt_packages');
        (new ReferentielRepository($pdo))->importPublishedDocument(self::respireReferentiel(), 'Import UC-ETA');
        (new PromptPackageRepository($pdo))->importPublishedDocument(self::defaultPackage());
    }

    /**
     * Compte créé directement en base, avec ses rôles.
     *
     * @param list<string> $roles
     */
    protected static function seedUser(PDO $pdo, string $displayName, array $roles = ['apprenant']): int
    {
        $pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([uniqid('eta', true) . '@example.org', Users::hashPassword('x-password-eta'), $displayName]);
        $userId = (int) $pdo->lastInsertId();
        $bind = $pdo->prepare('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE name = ?');
        foreach ($roles as $role) {
            $bind->execute([$userId, $role]);
        }

        return $userId;
    }

    /**
     * Membre consenti ayant déposé un portfolio segmenté (journées données).
     *
     * @param list<string> $dates
     * @return int identifiant du dépôt (cohorte_portfolios.id)
     */
    protected static function seedDepositor(PDO $pdo, int $cohorteId, int $userId, array $dates, string $titre = 'Portfolio'): int
    {
        $repo = new CohorteRepository($pdo);
        $repo->join($cohorteId, $userId);
        $segments = [];
        foreach ($dates as $i => $date) {
            $segments[] = ['date' => $date, 'texte' => "Feuille {$i} : j'ai animé le conseil de classe puis noté ce que j'en retire."];
        }

        return $repo->depositPortfolio($cohorteId, $userId, $titre, null, $segments);
    }

    /** Configuration LLM/budget posée directement (provider, plafond, dépense). */
    protected static function seedConfig(
        PDO $pdo,
        int $etablissementId,
        float $budgetCapUsd,
        string $provider = 'humanome',
        ?string $model = 'claude-sonnet-4-5',
        float $spentUsd = 0.0,
        ?string $endpointUrl = null,
    ): void {
        $pdo->prepare(
            'INSERT INTO etablissement_config (user_id, provider, endpoint_url, model, budget_cap_usd, spent_usd)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE provider = VALUES(provider), endpoint_url = VALUES(endpoint_url),
                 model = VALUES(model), budget_cap_usd = VALUES(budget_cap_usd), spent_usd = VALUES(spent_usd)'
        )->execute([$etablissementId, $provider, $endpointUrl, $model, $budgetCapUsd, $spentUsd]);
    }

    /** Valeur d'une colonne (première ligne) — lecture de contrôle. */
    protected static function scalar(PDO $pdo, string $sql, array $params = []): mixed
    {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        return $stmt->fetchColumn();
    }

    /**
     * Exécute $fn avec des variables d'environnement surchargées ($_ENV,
     * première couche lue par Env::get), puis restaure l'état exact d'avant.
     *
     * @param array<string, string> $vars
     */
    protected static function withEnv(array $vars, callable $fn): mixed
    {
        $saved = [];
        foreach ($vars as $key => $value) {
            $saved[$key] = \array_key_exists($key, $_ENV) ? [$_ENV[$key]] : null;
            $_ENV[$key] = $value;
        }
        try {
            return $fn();
        } finally {
            foreach ($saved as $key => $previous) {
                if ($previous === null) {
                    unset($_ENV[$key]);
                } else {
                    $_ENV[$key] = $previous[0];
                }
            }
        }
    }
}
