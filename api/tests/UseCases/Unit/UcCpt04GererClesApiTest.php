<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Auth\Users;
use Humanome\Keys\KeyRefused;
use Humanome\Keys\KeyVault;
use Humanome\Keys\UserKeysPurge;
use Humanome\Mail\MemoryMailer;
use Humanome\MigrationRunner;
use Humanome\Tests\StoredKeys;
use Humanome\Tests\TestDb;
use Humanome\Tests\Twin9\FakeBatchApi;
use Humanome\Twin9\BatchApi;
use Humanome\Twin9\RunRepository;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-CPT-04 — Gérer ses clés API : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/compte/UC-CPT-04-gerer-cles-api.md
 *
 * KeyVault appelé directement : lecture de la clé maîtresse ; depuis
 * l'ADR-013, il ne garde que la clé d'une école (format du chiffré, nonce ||
 * secretbox, remplacement), et refuse celle de tout autre compte ; les clés
 * gardées avant (écrites ici comme le coffre les écrivait, StoredKeys) sont
 * listées sans matériau de clé, révélées au seul propriétaire, réellement
 * supprimées. UserKeysPurge, l'outil d'administration de leur purge : les
 * comptages, l'avis, la purge.
 */
final class UcCpt04GererClesApiTest extends TestCase
{
    private const MASTER_HEX = '89b1b60f0a26f73b63f9df20a9c58ab24905b48b2bd45a01b344cee69d7e3a55';
    private const API_KEY = 'sk-ant-api03-EXEMPLE-cle-personnelle';

    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    public static function tearDownAfterClass(): void
    {
        TestDb::restoreEnv();
    }

    protected function setUp(): void
    {
        self::$pdo->exec('DELETE FROM users');
    }

    private static function vault(string $hex = self::MASTER_HEX): KeyVault
    {
        return new KeyVault(self::$pdo, sodium_hex2bin($hex));
    }

    private static function newUser(string $email): int
    {
        return Users::create(self::$pdo, $email, Users::hashPassword('correct horse battery'), 'U');
    }

    /** A school's account: the habilitation the administrator grants (ADR-013 §2 h). */
    private static function newSchool(string $email): int
    {
        $id = self::newUser($email);
        Users::assignRole(self::$pdo, $id, 'etablissement');

        return $id;
    }

    /** A key stored before ADR-013, as the vault wrote it. */
    private static function legacy(int $userId, string $provider, string $apiKey, ?string $avis = null): void
    {
        StoredKeys::seed(self::$pdo, $userId, $provider, $apiKey, sodium_hex2bin(self::MASTER_HEX), $avis);
    }

    private static function blob(int $userId, string $provider): string
    {
        $stmt = self::$pdo->prepare('SELECT encrypted_key FROM user_api_keys WHERE user_id = ? AND provider = ?');
        $stmt->execute([$userId, $provider]);

        return (string) $stmt->fetchColumn();
    }

    #[TestDox('UC-CPT-04-U01 — masterKeyFromEnv : 64 hexadécimaux (casse indifférente) → 32 octets ; vide, courte, non hexadécimale ou trop longue → null')]
    public function testU01MasterKeyFromEnv(): void
    {
        TestDb::setEnv('SODIUM_MASTER_KEY', self::MASTER_HEX);
        self::assertSame(sodium_hex2bin(self::MASTER_HEX), KeyVault::masterKeyFromEnv());
        self::assertSame(SODIUM_CRYPTO_SECRETBOX_KEYBYTES, \strlen((string) KeyVault::masterKeyFromEnv()));

        foreach (['', substr(self::MASTER_HEX, 1), 'zz' . substr(self::MASTER_HEX, 2), self::MASTER_HEX . '00'] as $bad) {
            TestDb::setEnv('SODIUM_MASTER_KEY', $bad);
            self::assertNull(KeyVault::masterKeyFromEnv(), var_export($bad, true));
        }
        TestDb::setEnv('SODIUM_MASTER_KEY', strtoupper(self::MASTER_HEX));
        self::assertNotNull(KeyVault::masterKeyFromEnv(), 'majuscules acceptées');
    }

    #[TestDox('UC-CPT-04-U02 — store (clé d’une école) : chiffré = nonce aléatoire de 24 octets || secretbox, déchiffrable avec la clé maîtresse, jamais en clair')]
    public function testU02CiphertextFormat(): void
    {
        $userId = self::newSchool('ecole@example.org');
        self::vault()->store($userId, 'anthropic', self::API_KEY);

        $blob = self::blob($userId, 'anthropic');
        self::assertStringNotContainsString(self::API_KEY, $blob);
        self::assertSame(
            SODIUM_CRYPTO_SECRETBOX_NONCEBYTES + \strlen(self::API_KEY) + SODIUM_CRYPTO_SECRETBOX_MACBYTES,
            \strlen($blob),
        );
        $clear = sodium_crypto_secretbox_open(
            substr($blob, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES),
            substr($blob, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES),
            sodium_hex2bin(self::MASTER_HEX),
        );
        self::assertSame(self::API_KEY, $clear);
    }

    #[TestDox('UC-CPT-04-U03 — store une seconde fois (même fournisseur, une école) : une seule entrée, nouveau nonce, nouvelle clé')]
    public function testU03StoreIsAnUpsert(): void
    {
        $userId = self::newSchool('ecole@example.org');
        $vault = self::vault();
        $vault->store($userId, 'openai', 'sk-premiere-cle');
        $first = self::blob($userId, 'openai');

        $vault->store($userId, 'openai', 'sk-seconde-cle');

        self::assertSame(1, (int) self::$pdo->query('SELECT COUNT(*) FROM user_api_keys WHERE user_id = ' . $userId)->fetchColumn());
        self::assertNotSame(substr($first, 0, 24), substr(self::blob($userId, 'openai'), 0, 24), 'nonce renouvelé');
        self::assertSame('sk-seconde-cle', $vault->reveal($userId, 'openai'));
    }

    #[TestDox('UC-CPT-04-U04 — listForUser : fournisseurs du seul propriétaire, triés, date ISO, date de l’avis de purge (null avant), aucun matériau de clé')]
    public function testU04ListNeverCarriesKeys(): void
    {
        $ada = self::newUser('ada@example.org');
        $bob = self::newUser('bob@example.org');
        $vault = self::vault();
        self::legacy($ada, 'openai', 'sk-openai-ada', '2026-10-22 08:00:00');
        self::legacy($ada, 'anthropic', self::API_KEY);
        self::legacy($bob, 'google', 'AIza-bob-google');

        $list = $vault->listForUser($ada);

        self::assertSame(['anthropic', 'openai'], array_column($list, 'provider'));
        self::assertSame([null, '2026-10-22T08:00:00'], array_column($list, 'avisPurgeAt'));
        foreach ($list as $entry) {
            self::assertSame(['provider', 'createdAt', 'avisPurgeAt'], array_keys($entry));
            self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', $entry['createdAt']);
        }
        self::assertStringNotContainsString('sk-', json_encode($list, JSON_THROW_ON_ERROR));
        self::assertSame([], $vault->listForUser(999_999));
    }

    #[TestDox('UC-CPT-04-U05 — reveal : propriétaire seul ; fournisseur absent, clé maîtresse changée ou chiffré tronqué → null')]
    public function testU05RevealFailsClosed(): void
    {
        $ada = self::newUser('ada@example.org');
        $bob = self::newUser('bob@example.org');
        self::legacy($ada, 'anthropic', self::API_KEY);

        self::assertSame(self::API_KEY, self::vault()->reveal($ada, 'anthropic'));
        self::assertNull(self::vault()->reveal($bob, 'anthropic'), 'pas la clé d’un autre compte');
        self::assertNull(self::vault()->reveal($ada, 'openai'));
        self::assertNull(self::vault(strrev(self::MASTER_HEX))->reveal($ada, 'anthropic'), 'rotation : échec fermé');

        self::$pdo->prepare('UPDATE user_api_keys SET encrypted_key = ? WHERE user_id = ?')
            ->execute([substr(self::blob($ada, 'anthropic'), 0, 20), $ada]);
        self::assertNull(self::vault()->reveal($ada, 'anthropic'), 'chiffré tronqué');
    }

    #[TestDox('UC-CPT-04-U06 — delete : suppression réelle (true), puis false ; l’entrée d’un autre compte est intacte')]
    public function testU06DeleteIsRealAndScoped(): void
    {
        $ada = self::newUser('ada@example.org');
        $bob = self::newUser('bob@example.org');
        $vault = self::vault();
        self::legacy($ada, 'xai', 'xai-cle-ada-123');
        self::legacy($bob, 'xai', 'xai-cle-bob-123');

        self::assertFalse($vault->delete($bob, 'openai'));
        self::assertTrue($vault->delete($ada, 'xai'));
        self::assertFalse($vault->delete($ada, 'xai'));
        self::assertSame('', self::blob($ada, 'xai'));
        self::assertSame('xai-cle-bob-123', $vault->reveal($bob, 'xai'));
    }

    #[TestDox('UC-CPT-04-U07 — fournisseurs acceptés par le coffre : les six de l’interface + « mock » (tests) ; aucune clé Mistral AI, qu’aucun parcours n’emploie')]
    public function testU07Providers(): void
    {
        self::assertSame(['anthropic', 'openai', 'google', 'openrouter', 'xai', 'ollama', 'mock'], KeyVault::PROVIDERS);
    }
    #[TestDox('UC-CPT-04-U15 — store refuse la clé de tout compte qui n’est pas une école (KeyRefused, message R1, rien d’écrit) ; un rôle déclaré n’ouvre rien, seule l’habilitation etablissement')]
    public function testU15TheVaultKeepsASchoolsKeyOnly(): void
    {
        $ada = self::newUser('ada@example.org');
        $vault = self::vault();
        foreach ([[], ['architecte'], ['cartographe', 'promptologue']] as $declares) {
            foreach ($declares as $role) {
                self::$pdo->prepare('INSERT IGNORE INTO user_declared_roles (user_id, role) VALUES (?, ?)')
                    ->execute([$ada, $role]);
            }
            self::assertFalse($vault->accepte($ada));
            try {
                $vault->store($ada, 'anthropic', self::API_KEY);
                self::fail('la clé d’un apprenant ne se garde pas');
            } catch (KeyRefused $e) {
                self::assertSame('Vos clés restent dans votre navigateur : humanome ne les garde plus sur ses serveurs.',
                    $e->getMessage());
            }
        }
        Users::assignRole(self::$pdo, $ada, 'apprenant');
        self::assertFalse($vault->accepte($ada));
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM user_api_keys')->fetchColumn());

        Users::assignRole(self::$pdo, $ada, 'etablissement');
        self::assertTrue($vault->accepte($ada));
        $vault->store($ada, 'anthropic', self::API_KEY);
        self::assertSame(self::API_KEY, $vault->reveal($ada, 'anthropic'));
    }

    #[TestDox('UC-CPT-04-U16 — UserKeysPurge::count : des nombres seulement (comptes avec clé, par fournisseur, avisés, purgeables, runs en cours et profils sur la clé personnelle, soldes positifs dont écoles), jamais une clé ni une adresse')]
    public function testU16CountsNumbersOnly(): void
    {
        $ada = self::newUser('ada@example.org');
        $bob = self::newUser('bob@example.org');
        $ecole = self::newSchool('ecole@example.org');
        self::legacy($ada, 'anthropic', self::API_KEY);
        self::legacy($ada, 'openai', 'sk-openai-ada', '2026-01-01 00:00:00');
        self::legacy($bob, 'anthropic', 'sk-ant-bob-fictive', '2026-01-01 00:00:00');
        self::runSur($bob, 'personnelle', 'en_cours');
        self::runSur($ada, 'personnelle', 'termine');
        self::runSur($ada, 'instance', 'en_cours');
        self::$pdo->prepare('INSERT INTO twin9_profils (user_id, nom, profil) VALUES (?, ?, ?), (?, ?, ?)')
            ->execute([$ada, 'Ma clé', '{"cle":"personnelle"}', $ada, 'Instance', '{"cle":"instance"}']);
        self::$pdo->prepare('INSERT INTO twin9_credits (user_id, balance_microusd) VALUES (?, 5), (?, 0), (?, 7)')
            ->execute([$ada, $bob, $ecole]);

        $comptes = (new UserKeysPurge(self::$pdo, new MemoryMailer()))->count();

        self::assertSame([
            'comptes_avec_cle' => 2,
            'cles_par_fournisseur' => ['anthropic' => 2, 'openai' => 1],
            'comptes_avises' => 2,
            'comptes_purgeables' => 2,
            'runs_en_cours_cle_personnelle' => 1,
            'profils_cle_personnelle' => 1,
            'comptes_solde_positif' => 2,
            'ecoles_solde_positif' => 1,
        ], $comptes);
        self::assertStringNotContainsString('sk-', json_encode($comptes, JSON_THROW_ON_ERROR));
        self::assertStringNotContainsString('@', json_encode($comptes, JSON_THROW_ON_ERROR));
    }

    #[TestDox('UC-CPT-04-U17 — UserKeysPurge::notify : un courriel par compte qui garde une clé, ses fournisseurs et la date de purge, jamais la clé ; la date de l’avis notée ; jamais deux fois ; un envoi refusé laisse le compte à aviser')]
    public function testU17NotifiesEachAccountOnce(): void
    {
        $ada = self::newUser('ada@example.org');
        $bob = self::newUser('bob@example.org');
        self::newUser('sans-cle@example.org');
        self::legacy($ada, 'anthropic', self::API_KEY);
        self::legacy($ada, 'openai', 'sk-openai-ada');
        self::legacy($bob, 'google', 'AIza-bob-google');

        $mailer = new MemoryMailer();
        $mailer->refuse = true;
        self::assertSame(['avises' => 0, 'refuses' => 2], (new UserKeysPurge(self::$pdo, $mailer))->notify());
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM user_api_keys WHERE avis_purge_at IS NOT NULL')
            ->fetchColumn());

        $mailer = new MemoryMailer();
        $purge = new UserKeysPurge(self::$pdo, $mailer);
        self::assertSame(['avises' => 2, 'refuses' => 0], $purge->notify());
        self::assertSame(['ada@example.org', 'bob@example.org'], array_column($mailer->sent, 'to'));
        $date = (string) self::$pdo->query('SELECT DATE_FORMAT(NOW() + INTERVAL 30 DAY, "%d/%m/%Y")')->fetchColumn();
        $corps = $mailer->sent[0]['body'];
        self::assertStringContainsString('(anthropic, openai)', $corps);
        self::assertStringContainsString('à partir du ' . $date, $corps);
        self::assertStringContainsString('Recopier dans ce navigateur, puis supprimer', $corps);
        self::assertStringContainsString('Supprimer du serveur', $corps);
        self::assertStringNotContainsString(self::API_KEY, $corps);
        self::assertStringNotContainsString('sk-openai-ada', $corps);
        self::assertSame(3, (int) self::$pdo->query('SELECT COUNT(*) FROM user_api_keys WHERE avis_purge_at IS NOT NULL')
            ->fetchColumn());
        $audit = self::$pdo->query('SELECT user_id, details FROM audit_events WHERE type = "api_keys_purge_notice" ORDER BY id')
            ->fetchAll();
        self::assertSame([[$ada, '{"providers": ["anthropic", "openai"]}'], [$bob, '{"providers": ["google"]}']],
            array_map(static fn (array $r): array => [(int) $r['user_id'], (string) $r['details']], $audit));

        self::assertSame(['avises' => 0, 'refuses' => 0], $purge->notify(), 'jamais deux fois');
        self::assertCount(2, $mailer->sent);
    }

    #[TestDox('UC-CPT-04-U18 — UserKeysPurge::purge : les clés avisées depuis 30 jours au moins, après l’annulation puis l’effacement chez Anthropic de leurs lots ; un compte dont un run est en cours sur la clé personnelle est reporté ; un événement d’audit par compte, ses fournisseurs sans la clé')]
    public function testU18PurgesTheKeysNotified30DaysAgo(): void
    {
        TestDb::setEnv('SODIUM_MASTER_KEY', self::MASTER_HEX);
        $ada = self::newUser('ada@example.org');
        $bob = self::newUser('bob@example.org');
        $cleo = self::newUser('cleo@example.org');
        $dan = self::newUser('dan@example.org');
        $ancien = (string) self::$pdo->query('SELECT NOW() - INTERVAL 31 DAY')->fetchColumn();
        $recent = (string) self::$pdo->query('SELECT NOW() - INTERVAL 29 DAY')->fetchColumn();
        self::legacy($ada, 'anthropic', 'sk-ant-ada-fictive', $ancien);
        self::legacy($ada, 'openai', 'sk-openai-ada', $ancien);
        self::legacy($bob, 'anthropic', 'sk-ant-bob-fictive', $recent);
        self::legacy($cleo, 'anthropic', 'sk-ant-cleo-fictive', $ancien);
        self::legacy($dan, 'anthropic', 'sk-ant-dan-fictive');
        self::runSur($cleo, 'personnelle', 'en_cours');
        // a batch of Ada's, submitted with her key by a run of before ADR-013, still at Anthropic
        $api = new FakeBatchApi(static fn (array $r): array => FakeBatchApi::message('vu'), regards: 5);
        $corps = '{"requests":[{"custom_id":"x","params":{"model":"claude-haiku-5-5","max_tokens":1,'
            . '"messages":[{"role":"user","content":"?"}]}}]}';
        $lot = $api->creer('sk-ant-ada-fictive', $corps, microtime(true) + 5)['lot']['id'];
        self::$pdo->prepare('INSERT INTO twin9_lots (run_id, lot, statut, cle, requetes, octets, soumis_at)
                             VALUES (?, ?, "en_cours", "personnelle", 1, 10, NOW(3))')
            ->execute([self::runSur($ada, 'personnelle', 'annule'), $lot]);

        $resultat = (new UserKeysPurge(self::$pdo, new MemoryMailer(), $api))->purge(microtime(true) + 10);

        self::assertSame(['comptes' => 1, 'cles' => 2, 'reportes' => 1], $resultat);
        self::assertContains($lot, $api->annules);
        $restantes = self::$pdo->query('SELECT user_id FROM user_api_keys ORDER BY user_id')->fetchAll(PDO::FETCH_COLUMN);
        self::assertSame([$bob, $cleo, $dan], array_map('intval', $restantes), 'avisé il y a 29 jours, run en cours, pas avisé');
        $audit = self::$pdo->query('SELECT user_id, details FROM audit_events WHERE type = "api_keys_purged"')->fetchAll();
        self::assertSame([[$ada, '{"providers": ["anthropic", "openai"]}']],
            array_map(static fn (array $r): array => [(int) $r['user_id'], (string) $r['details']], $audit));
        self::assertStringNotContainsString('sk-', (string) self::$pdo->query('SELECT GROUP_CONCAT(details) FROM audit_events')
            ->fetchColumn());

        // nothing left to do: a second purge is a no-op
        self::assertSame(['comptes' => 0, 'cles' => 0, 'reportes' => 1],
            (new UserKeysPurge(self::$pdo, new MemoryMailer(), $api))->purge(microtime(true) + 10));
    }

    #[TestDox('UC-CPT-04-U21 — UserKeysPurge::purge garde la clé d’un compte dont un lot reste chez Anthropic (injoignable, ou une annulation pas encore finie) : reporté, la clé sert à l’effacer la fois suivante ; un lot qu’Anthropic ne connaît plus (effacé après 29 jours) ne retient rien')]
    public function testU21AKeyStaysWhileItsBatchesAreStillAtAnthropic(): void
    {
        TestDb::setEnv('SODIUM_MASTER_KEY', self::MASTER_HEX);
        $ancien = (string) self::$pdo->query('SELECT NOW() - INTERVAL 31 DAY')->fetchColumn();
        $fake = new FakeBatchApi(static fn (array $r): array => FakeBatchApi::message('vu'), regards: 5);
        // Anthropic unreachable for one batch, a cancellation that takes its time for another
        $api = new class($fake) implements BatchApi {
            /** @var list<string> */
            public array $injoignables = [];

            /** @var list<string> */
            public array $lents = [];

            public function __construct(private readonly FakeBatchApi $fake)
            {
            }

            public function verifier(string $cle, array $reglage, float $fin): array
            {
                return $this->fake->verifier($cle, $reglage, $fin);
            }

            public function creer(string $cle, string $corps, float $fin): array
            {
                return $this->fake->creer($cle, $corps, $fin);
            }

            public function etat(string $cle, string $id, float $fin): array
            {
                if (\in_array($id, $this->injoignables, true)) {
                    return ['ok' => false, 'http' => 503, 'erreur' => 'erreur du fournisseur (HTTP 503)'];
                }
                if (\in_array($id, $this->lents, true) && \in_array($id, $this->fake->annules, true)) {
                    return ['ok' => true, 'lot' => ['id' => $id, 'processing_status' => 'canceling']];
                }

                return $this->fake->etat($cle, $id, $fin);
            }

            public function resultats(string $cle, string $id, float $fin): array
            {
                return $this->fake->resultats($cle, $id, $fin);
            }

            public function annuler(string $cle, string $id, float $fin): array
            {
                return $this->fake->annuler($cle, $id, $fin);
            }

            public function supprimer(string $cle, string $id, float $fin): array
            {
                return $this->fake->supprimer($cle, $id, $fin);
            }

            public function lister(string $cle, float $depuis, float $fin): array
            {
                return $this->fake->lister($cle, $depuis, $fin);
            }
        };
        $comptes = [];
        $lots = [];
        foreach (['ada' => 'injoignable', 'bob' => 'lent', 'cleo' => 'oublie'] as $nom => $cas) {
            $userId = self::newUser($nom . '@example.org');
            self::legacy($userId, 'anthropic', 'sk-ant-' . $nom . '-fictive', $ancien);
            $corps = '{"requests":[{"custom_id":"x","params":{"model":"claude-haiku-5-5","max_tokens":1,'
                . '"messages":[{"role":"user","content":"?"}]}}]}';
            // Cléo's batch, Anthropic no longer knows (erased 29 days after its creation, at the latest)
            $lot = $cas === 'oublie' ? 'msgbatch_oublie_u21' : $fake->creer('sk-ant-' . $nom . '-fictive', $corps,
                microtime(true) + 5)['lot']['id'];
            self::$pdo->prepare('INSERT INTO twin9_lots (run_id, lot, statut, cle, requetes, octets, soumis_at)
                                 VALUES (?, ?, "en_cours", "personnelle", 1, 10, NOW(3))')
                ->execute([self::runSur($userId, 'personnelle', 'annule'), $lot]);
            $comptes[$nom] = $userId;
            $lots[$nom] = $lot;
        }
        $api->injoignables[] = $lots['ada'];
        $api->lents[] = $lots['bob'];

        $resultat = (new UserKeysPurge(self::$pdo, new MemoryMailer(), $api))->purge(microtime(true) + 10);

        self::assertSame(['comptes' => 1, 'cles' => 1, 'reportes' => 2], $resultat);
        $restantes = self::$pdo->query('SELECT user_id FROM user_api_keys ORDER BY user_id')->fetchAll(PDO::FETCH_COLUMN);
        self::assertSame([$comptes['ada'], $comptes['bob']], array_map('intval', $restantes),
            'leurs clés restent : elles seules peuvent encore effacer leurs lots');
        self::assertSame(['ada' => 'en_cours', 'bob' => 'en_cours', 'cleo' => 'supprime'], array_map(
            static fn (string $lot): string => (string) self::$pdo->query('SELECT statut FROM twin9_lots WHERE lot = '
                . self::$pdo->quote($lot))->fetchColumn(), $lots));

        // later: Anthropic answers, Bob's cancellation has ended — both batches deleted, then the keys
        $api->injoignables = [];
        $api->lents = [];
        self::assertSame(['comptes' => 2, 'cles' => 2, 'reportes' => 0],
            (new UserKeysPurge(self::$pdo, new MemoryMailer(), $api))->purge(microtime(true) + 10));
        self::assertSame([], $fake->restants(), 'effacés chez Anthropic avant leurs clés');
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM user_api_keys')->fetchColumn());
    }

    #[TestDox('UC-CPT-04-U19 — le script de purge n’est jamais lancé automatiquement : ni le worker, ni la maintenance, ni une route, ni le déploiement, ni le cron, ni la CI ne le nomment ; inclus, il ne fait rien')]
    public function testU19ThePurgeScriptIsNeverRunAutomatically(): void
    {
        $racine = \dirname(__DIR__, 4);
        $fichiers = [];
        foreach (['api/src', 'scripts/deploy', 'docker', '.github'] as $dossier) {
            $iterateur = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($racine . '/' . $dossier,
                \FilesystemIterator::SKIP_DOTS));
            foreach ($iterateur as $fichier) {
                if ($fichier->isFile() && !str_contains($fichier->getPathname(), '/node_modules/')) {
                    $fichiers[] = $fichier->getPathname();
                }
            }
        }
        $fichiers = array_merge($fichiers, [$racine . '/scripts/worker.php', $racine . '/scripts/maintenance.php',
                                            $racine . '/docker-compose.yml', $racine . '/package.json']);
        self::assertGreaterThan(20, \count($fichiers));
        foreach ($fichiers as $fichier) {
            $code = (string) file_get_contents($fichier);
            // a PHP file may name it in a comment (what it is, who runs it); its code, never
            if (str_ends_with($fichier, '.php')) {
                $code = implode('', array_map(
                    static fn (mixed $t): string => \is_array($t) ? (\in_array($t[0], [T_COMMENT, T_DOC_COMMENT], true) ? '' : $t[1]) : $t,
                    token_get_all($code),
                ));
            }
            self::assertStringNotContainsString('purger-cles-utilisateurs', $code, $fichier);
            self::assertStringNotContainsString('UserKeysPurge', str_ends_with($fichier, 'UserKeysPurge.php') ? '' : $code,
                $fichier);
        }

        // included rather than run (not its own entry point): it returns before reading any argument
        self::assertNull(require $racine . '/scripts/purger-cles-utilisateurs.php');
    }

    /** A run of $userId's on this key, in this status (its profile reduced to what the purge reads). */
    private static function runSur(int $userId, string $cle, string $statut): int
    {
        $id = (new RunRepository(self::$pdo))->creer($userId,
            (object) ['cle' => $cle, 'referentiel' => (object) ['id' => 'respire-fictif'], 'gabarits' => 'v9.8'],
            new \stdClass(), 'journal.md', "## J1\nUn jour.\n", 'journal-' . bin2hex(random_bytes(4)), [],
            new \DateTimeImmutable('2026-10-18T12:00:00+00:00'));
        self::$pdo->prepare('UPDATE twin9_runs SET statut = ? WHERE id = ?')->execute([$statut, $id]);

        return $id;
    }
}
