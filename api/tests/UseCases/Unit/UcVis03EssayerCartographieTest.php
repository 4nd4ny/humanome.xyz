<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Db;
use Humanome\Llm\AnthropicFlux;
use Humanome\Llm\AnthropicProvider;
use Humanome\Llm\DemoConfig;
use Humanome\Llm\FreeCreditLedger;
use Humanome\Llm\HttpClientException;
use Humanome\Llm\MockProvider;
use Humanome\Llm\PowChallenge;
use Humanome\Llm\Pricing;
use Humanome\Llm\RelaisAppel;
use Humanome\Llm\UpstreamException;
use Humanome\Llm\UsageCounters;
use Humanome\MigrationRunner;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\AnthropicSse;
use Humanome\Tests\LlmFakeHttpClient;
use Humanome\Tests\TestDb;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-VIS-03 — Essayer la cartographie en direct, sans compte : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/visiteur/UC-VIS-03-essayer-cartographie-en-direct.md
 *
 * Les garde-fous et services du proxy POST /api/llm sont appelés directement :
 * preuve de travail sans état (PowChallenge), compteurs journaliers
 * (UsageCounters), grand livre mensuel des crédits offerts (FreeCreditLedger,
 * sprint 7), estimation de coût (Pricing), configuration à précédence
 * (DemoConfig), fournisseurs mock et Anthropic (ce dernier sur un faux client
 * HTTP : aucun appel réseau réel).
 */
final class UcVis03EssayerCartographieTest extends TestCase
{
    private const SECRET = 'uc-vis-03-secret';

    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    protected function setUp(): void
    {
        TestDb::overrideEnv();
        self::$pdo->exec('DELETE FROM llm_usage_daily');
        self::$pdo->exec('DELETE FROM tuteur_usage_daily');
        self::$pdo->exec('DELETE FROM free_credit_monthly');
        self::$pdo->exec("DELETE FROM settings WHERE name = 'demo_overrides'");
    }

    protected function tearDown(): void
    {
        TestDb::restoreEnv();
    }

    /** Premier nonce satisfaisant (ou non) la difficulté. */
    private static function nonce(string $challenge, int $bits, bool $strong = true): string
    {
        for ($n = 0; $n < 1_000_000; $n++) {
            $ok = PowChallenge::leadingZeroBits(hash('sha256', $challenge . ':' . $n)) >= $bits;
            if ($ok === $strong) {
                return (string) $n;
            }
        }
        throw new \LogicException('aucun nonce');
    }

    #[TestDox('UC-VIS-03-U01 — PowChallenge::issue : défi v1.<expiration>.<aléa>.<hmac>, valable 5 minutes, aucun état stocké')]
    public function testU01IssueProducesSignedExpiringChallenge(): void
    {
        $now = 1_800_000_000;
        $issued = (new PowChallenge(self::SECRET, 8))->issue($now);

        self::assertSame(8, $issued['difficultyBits']);
        self::assertSame($now + 300, $issued['expiresAt']);
        self::assertMatchesRegularExpression('/^v1\.' . ($now + 300) . '\.[0-9a-f]{16}\.[0-9a-f]{64}$/', $issued['challenge']);
        [$v, $exp, $rand, $mac] = explode('.', $issued['challenge']);
        self::assertSame(hash_hmac('sha256', "{$v}.{$exp}.{$rand}", self::SECRET), $mac);
        self::assertNotSame($issued['challenge'], (new PowChallenge(self::SECRET, 8))->issue($now)['challenge']);
    }

    #[TestDox('UC-VIS-03-U02 — PowChallenge::verify : OK, falsifié, autre secret, expiré, preuve trop faible')]
    public function testU02VerifyCoversEveryVerdict(): void
    {
        $pow = new PowChallenge(self::SECRET, 8);
        $now = 1_800_000_000;
        $challenge = $pow->issue($now)['challenge'];

        self::assertSame(PowChallenge::OK, $pow->verify($challenge, self::nonce($challenge, 8), $now + 10));
        self::assertSame(PowChallenge::WEAK, $pow->verify($challenge, self::nonce($challenge, 8, false), $now + 10));
        self::assertSame(PowChallenge::EXPIRED, $pow->verify($challenge, self::nonce($challenge, 8), $now + 301));
        $forged = preg_replace('/^v1\.(\d+)\./', 'v1.' . ($now + 99999) . '.', $challenge);
        self::assertSame(PowChallenge::INVALID, $pow->verify($forged, '0', $now));
        self::assertSame(PowChallenge::INVALID, (new PowChallenge('autre-secret', 8))->verify($challenge, self::nonce($challenge, 8), $now));
        self::assertSame(PowChallenge::INVALID, $pow->verify('pas-un-defi', '0', $now));
        self::assertSame(PowChallenge::INVALID, $pow->verify('v2.1.a.b', '0', $now));
    }

    #[TestDox('UC-VIS-03-U03 — secret de la preuve : POW_SECRET, sinon dérivé de MIGRATE_TOKEN, sinon indisponible ; bits à zéro comptés')]
    public function testU03SecretPrecedenceAndLeadingZeroBits(): void
    {
        TestDb::setEnv('POW_SECRET', 'explicite');
        TestDb::setEnv('MIGRATE_TOKEN', 'jeton-migration');
        self::assertSame('explicite', PowChallenge::secretFromEnv());
        TestDb::setEnv('POW_SECRET', '');
        self::assertSame(hash('sha256', 'pow:jeton-migration'), PowChallenge::secretFromEnv());
        TestDb::setEnv('MIGRATE_TOKEN', '');
        self::assertSame('', PowChallenge::secretFromEnv());

        self::assertSame(0, PowChallenge::leadingZeroBits('f' . str_repeat('0', 63)));
        self::assertSame(3, PowChallenge::leadingZeroBits('1abc'));
        self::assertSame(6, PowChallenge::leadingZeroBits('03ff'));
        self::assertSame(9, PowChallenge::leadingZeroBits('004f'));
        self::assertSame(256, PowChallenge::leadingZeroBits(str_repeat('0', 64)));
    }

    #[TestDox('UC-VIS-03-U04 — UsageCounters : incrément atomique par jour UTC, coupe-circuit tokens OU budget, table sur liste blanche')]
    public function testU04UsageCountersDailyBreaker(): void
    {
        // Jour UTC, quel que soit le fuseau du serveur : à Kiritimati (UTC+14),
        // 23 h 30 UTC le 10 mars est déjà le 11 mars en heure locale.
        $timezone = date_default_timezone_get();
        date_default_timezone_set('Pacific/Kiritimati');
        try {
            $lateUtc = gmmktime(23, 30, 0, 3, 10, 2026);
            self::assertSame('2026-03-11', date('Y-m-d', $lateUtc));
            (new UsageCounters(self::$pdo))->record(1, 1, 0.0, $lateUtc);
            self::assertSame('2026-03-10', (string) self::$pdo->query('SELECT usage_date FROM llm_usage_daily')->fetchColumn());
        } finally {
            date_default_timezone_set($timezone);
        }
        self::$pdo->exec('DELETE FROM llm_usage_daily');

        $counters = new UsageCounters(self::$pdo);
        $day = gmmktime(12, 0, 0, 3, 10, 2026);
        $counters->record(100, 50, 0.25, $day);
        $counters->record(10, 5, 0.25, $day + 3600);

        self::assertSame(
            ['requests' => 2, 'inputTokens' => 110, 'outputTokens' => 55, 'estimatedCostUsd' => 0.5],
            $counters->today($day),
        );
        self::assertSame(0, $counters->today($day + 86400)['requests'], 'nouveau jour UTC');
        self::assertFalse($counters->isExhausted(1000, 1.0, $day));
        self::assertTrue($counters->isExhausted(165, 1.0, $day), 'plafond de tokens atteint');
        self::assertTrue($counters->isExhausted(1000, 0.5, $day), 'plafond budgétaire atteint');
        // Le compteur de la démo ignore celui du tuteur (budgets séparés).
        (new UsageCounters(self::$pdo, 'tuteur_usage_daily'))->record(1, 1, 9.0, $day);
        self::assertFalse($counters->isExhausted(1000, 1.0, $day));

        $this->expectException(\InvalidArgumentException::class);
        new UsageCounters(self::$pdo, 'users');
    }

    #[TestDox('UC-VIS-03-U25 — UsageCounters::reserve : le pire cas réservé d’un coup sous les deux plafonds, puis réglé au réel ou rendu ; à plusieurs, jamais au-delà')]
    public function testU25ReservationsNeverPassTheCaps(): void
    {
        $counters = new UsageCounters(self::$pdo);
        $day = gmmktime(12, 0, 0, 3, 10, 2026);
        $reserve = fn (int $in, int $out, float $usd): bool => $counters->reserve($in, $out, $usd, 100_000, 1.0, $day);

        // Deux appels en vol : 0,75 $ réservés sous un budget de 1 $ ; un troisième n'a plus la place.
        self::assertTrue($reserve(3000, 1000, 0.375));
        self::assertTrue($reserve(3000, 1000, 0.375));
        self::assertFalse($reserve(3000, 1000, 0.375), 'budget : 1,125 $ > 1 $');
        self::assertFalse($reserve(90_000, 2001, 0.125), 'tokens : 100 001 > 100 000');
        self::assertSame(['requests' => 0, 'inputTokens' => 6000, 'outputTokens' => 2000, 'estimatedCostUsd' => 0.75],
            $counters->today($day), 'un refus ne réserve rien');
        self::assertTrue($reserve(90_000, 2000, 0.25), 'pile aux deux plafonds : accepté');
        self::assertFalse($reserve(1, 0, 0.0), 'plus un token');

        // Réglée, une réservation fait place à l'usage réel et compte la requête ;
        // rendue (le fournisseur a refusé l'appel), elle ne laisse rien.
        $counters->settle(3000, 1000, 0.375, 1200, 300, 0.125, $day);
        $counters->release(3000, 1000, 0.375, $day);
        $counters->release(90_000, 2000, 0.25, $day);
        self::assertSame(['requests' => 1, 'inputTokens' => 1200, 'outputTokens' => 300, 'estimatedCostUsd' => 0.125],
            $counters->today($day));
        self::assertTrue($reserve(98_000, 500, 0.875), 'la place rendue resservit');
        self::assertSame(0, $counters->today($day + 86400)['requests'], 'jour UTC suivant intact');
    }

    #[TestDox('UC-VIS-03-U31 — FreeCreditLedger : le pire cas réservé d’un coup sous le plafond du mois, en micro-dollars entiers ; un refus ne réserve rien et se compte ; réglée, la réserve fait place au coût réel, même au-delà (jamais refusé après coup) ; rendue, elle ne laisse rien (RG7)')]
    public function testU31MonthlyLedgerReservesSettlesAndReleases(): void
    {
        $ledger = new FreeCreditLedger(self::$pdo);
        $now = gmmktime(12, 0, 0, 10, 15, 2026);
        $cap = 10_000; // 0,01 $

        self::assertTrue($ledger->reserve(4_000, $cap, $now));
        self::assertTrue($ledger->reserve(4_000, $cap, $now));
        self::assertFalse($ledger->reserve(4_000, $cap, $now), '12 000 µ$ > 10 000 µ$');
        self::assertTrue($ledger->reserve(2_000, $cap, $now), 'pile au plafond : accepté');
        self::assertFalse($ledger->reserve(0, $cap, $now), 'une réserve de rien compte pour un micro-dollar');
        self::assertSame(['month' => '2026-10', 'capMicrousd' => 10_000, 'spentMicrousd' => 0, 'reservedMicrousd' => 10_000,
            'remainingMicrousd' => 0, 'calls' => 0, 'refusals' => 2, 'exhausted' => true], $ledger->state($cap, $now));

        // Réglée au réel (1 500 µ$) ; rendue (le fournisseur a refusé l'appel) ; réglée
        // au-delà de sa réserve : le coût réel est compté tel quel, le plafond n'y peut rien.
        $ledger->settle(4_000, 1_500, $now);
        $ledger->release(4_000, $now);
        $ledger->settle(2_000, 9_000, $now);
        self::assertSame(['month' => '2026-10', 'capMicrousd' => 10_000, 'spentMicrousd' => 10_500, 'reservedMicrousd' => 0,
            'remainingMicrousd' => 0, 'calls' => 2, 'refusals' => 2, 'exhausted' => true], $ledger->state($cap, $now));
        self::assertFalse($ledger->reserve(1, $cap, $now), 'au-delà du plafond, plus rien ne part');
        self::assertTrue($ledger->reserve(1, 20_000, $now), 'un plafond relevé rouvre aussitôt');
        $ledger->release(5, $now);
        self::assertSame(0, $ledger->state($cap, $now)['reservedMicrousd'], 'rendre plus que la réserve ne descend pas sous zéro');

        // Les conversions : vers le haut, jamais sous ce que coûte l'appel ; un plafond nul, négatif ou non fini ferme tout.
        self::assertSame([300, 1, 0, 0, 320_065], [FreeCreditLedger::microusd(0.0003), FreeCreditLedger::microusd(1e-9),
            FreeCreditLedger::microusd(0.0), FreeCreditLedger::microusd(-1.0), FreeCreditLedger::microusd(0.320065)]);
        self::assertSame([20_000_000, 10_000, 0, 0, 0], [FreeCreditLedger::capMicrousd(20.0), FreeCreditLedger::capMicrousd(0.01),
            FreeCreditLedger::capMicrousd(0.0), FreeCreditLedger::capMicrousd(-5.0), FreeCreditLedger::capMicrousd(NAN)]);
        self::assertFalse($ledger->reserve(1, 0, $now + 1), 'plafond à 0 : rien d’offert');
        // Un refus décidé avant toute réserve (le mois déjà dépensé) se compte aussi, même sans ligne du mois.
        $ledger->refuse($now);
        $ledger->refuse(gmmktime(12, 0, 0, 12, 15, 2026));
        self::assertSame([5, 1], [$ledger->state($cap, $now)['refusals'], $ledger->state($cap, gmmktime(0, 0, 0, 12, 1, 2026))['refusals']]);

        // Compteurs seulement : ni contenu, ni utilisateur, ni IP.
        self::assertSame(['month', 'spent_microusd', 'reserved_microusd', 'calls', 'refusals'], self::$pdo->query(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = 'free_credit_monthly' ORDER BY ORDINAL_POSITION")->fetchAll(PDO::FETCH_COLUMN));
    }

    #[TestDox('UC-VIS-03-U32 — FreeCreditLedger : le mois est UTC, comme le jour des budgets, sous tout fuseau du serveur ; à horloge figée, le 31 à 23 h 59 min 59 s UTC est encore octobre, le 1er à 0 h UTC un mois neuf ; un appel se règle au mois où il a réservé ; le refus nomme le 1er du mois suivant (RG7)')]
    public function testU32TheMonthIsUtcAndAFrozenClockCrossesIt(): void
    {
        $ledger = new FreeCreditLedger(self::$pdo);
        $late = gmmktime(23, 59, 59, 10, 31, 2026);
        $first = gmmktime(0, 0, 0, 11, 1, 2026);
        $timezone = date_default_timezone_get();
        try {
            foreach (['Pacific/Kiritimati', 'Europe/Paris', 'America/Los_Angeles'] as $zone) {
                date_default_timezone_set($zone);
                self::assertSame(['2026-10', '2026-11'], [FreeCreditLedger::month($late), FreeCreditLedger::month($first)], $zone);
            }
            // À Paris, le mois s'ouvre le 1er à 1 h (heure d'hiver) : à 0 h 30, c'est encore octobre.
            date_default_timezone_set('Europe/Paris');
            $minuitEtDemie = mktime(0, 30, 0, 11, 1, 2026);
            self::assertSame('2026-11-01 00:30', date('Y-m-d H:i', $minuitEtDemie));
            self::assertSame('2026-10', FreeCreditLedger::month($minuitEtDemie));
            date_default_timezone_set('Pacific/Kiritimati');
            self::assertSame('2026-11-01', date('Y-m-d', $late), 'déjà le 1er à Kiritimati');

            // Octobre plein : 10 000 µ$ réservés par un appel parti à 23 h 59 min 59 s.
            self::assertTrue($ledger->reserve(10_000, 10_000, $late));
            self::assertFalse($ledger->reserve(1, 10_000, $late));
            // Une seconde plus tard, novembre a toute sa place.
            self::assertTrue($ledger->reserve(10_000, 10_000, $first));
            // L'appel d'octobre finit en novembre : il se règle en octobre, avec son $now.
            $ledger->settle(10_000, 2_500, $late);
            self::assertSame([2_500, 0, 1], [$ledger->state(10_000, $late)['spentMicrousd'],
                $ledger->state(10_000, $late)['reservedMicrousd'], $ledger->state(10_000, $late)['calls']]);
            self::assertSame([0, 10_000, 0], [$ledger->state(10_000, $first)['spentMicrousd'],
                $ledger->state(10_000, $first)['reservedMicrousd'], $ledger->state(10_000, $first)['calls']]);
        } finally {
            date_default_timezone_set($timezone);
        }
        self::assertSame(['2026-10', '2026-11'], self::$pdo->query('SELECT month FROM free_credit_monthly ORDER BY month')
            ->fetchAll(PDO::FETCH_COLUMN));

        self::assertSame('Les crédits offerts de ce mois sont épuisés ; revenez le 1er novembre.',
            FreeCreditLedger::refusalMessage($late));
        self::assertSame('Les crédits offerts de ce mois sont épuisés ; revenez le 1er janvier.',
            FreeCreditLedger::refusalMessage(gmmktime(23, 59, 59, 12, 31, 2026)));
        self::assertSame('Les crédits offerts de ce mois sont épuisés ; revenez le 1er février.',
            FreeCreditLedger::refusalMessage(gmmktime(0, 0, 0, 1, 1, 2027)));
    }

    #[TestDox('UC-VIS-03-U33 — FreeCreditLedger::reserve sous concurrence : une réserve en cours dans une autre connexion verrouille la ligne du mois, la seconde attend puis voit qu’elle n’a plus la place ; deux processus qui réservent ensemble ne passent jamais le plafond (RG7)')]
    public function testU33ConcurrentReservationsNeverPassTheCap(): void
    {
        // 1. Un second processus réserve 6 000 µ$ dans une transaction qu'il garde
        // ouverte 2 s : la ligne du mois est verrouillée. La réserve d'ici attend.
        $now = gmmktime(12, 0, 0, 5, 10, 2026);
        $lock = self::child(<<<'PHP'
            $pdo = \Humanome\Tests\TestDb::pdo();
            $pdo->beginTransaction();
            $ok = (new \Humanome\Llm\FreeCreditLedger($pdo))->reserve(6000, 10000, (int) $argv[2]);
            fwrite(STDOUT, $ok ? "locked\n" : "refused\n");
            fflush(STDOUT);
            sleep(2);
            $pdo->commit();
            fwrite(STDOUT, "committed\n");
            PHP, [(string) $now]);
        try {
            self::assertSame("locked\n", fgets($lock['pipes'][1]));
            $started = microtime(true);
            $mine = (new FreeCreditLedger(self::$pdo))->reserve(6_000, 10_000, $now);
            $waited = microtime(true) - $started;
        } finally {
            [$exit, $out, $errors] = self::finish($lock);
        }
        self::assertSame(0, $exit, $errors);
        self::assertSame("committed\n", $out);
        self::assertGreaterThan(1.0, $waited, 'la réserve a attendu la fin de la transaction concurrente');
        self::assertFalse($mine, '6 000 + 6 000 > 10 000 : refusée');
        $state = (new FreeCreditLedger(self::$pdo))->state(10_000, $now);
        self::assertSame([6_000, 1], [$state['reservedMicrousd'], $state['refusals']]);

        // 2. Deux processus partent au même instant, 20 réserves de 1 000 µ$ chacun,
        // sous un plafond de 15 000 µ$ : 15 passent en tout, jamais une de plus.
        $month = gmmktime(12, 0, 0, 6, 10, 2026);
        $start = (string) (microtime(true) + 1.0);
        $hammer = <<<'PHP'
            $pdo = \Humanome\Tests\TestDb::pdo();
            $ledger = new \Humanome\Llm\FreeCreditLedger($pdo);
            while (microtime(true) < (float) $argv[3]) {
                usleep(1000);
            }
            $ok = 0;
            for ($i = 0; $i < 20; $i++) {
                $ok += $ledger->reserve(1000, 15000, (int) $argv[2]) ? 1 : 0;
            }
            fwrite(STDOUT, (string) $ok);
            PHP;
        $children = [self::child($hammer, [(string) $month, $start]), self::child($hammer, [(string) $month, $start])];
        $passed = 0;
        foreach ($children as $child) {
            [$exit, $out, $errors] = self::finish($child);
            self::assertSame(0, $exit, $errors);
            $passed += (int) $out;
        }
        self::assertSame(15, $passed);
        $state = (new FreeCreditLedger(self::$pdo))->state(15_000, $month);
        self::assertSame([15_000, 25, true], [$state['reservedMicrousd'], $state['refusals'], $state['exhausted']]);
    }

    /**
     * A PHP process on its own MySQL connection (the test database), running
     * $code with the autoloader in $argv[1] and $args after it.
     *
     * @param list<string> $args
     * @return array{process: resource, pipes: array<int, resource>}
     */
    private static function child(string $code, array $args): array
    {
        $env = getenv();
        $env['DB_TEST_NAME'] = TestDb::name();
        $process = proc_open(
            [PHP_BINARY, '-r', 'require $argv[1];' . $code, \dirname(__DIR__, 3) . '/vendor/autoload.php', ...$args],
            [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes,
            null,
            $env,
        );
        self::assertIsResource($process);

        return ['process' => $process, 'pipes' => $pipes];
    }

    /**
     * Waits for a child: its exit code, the rest of its output, its errors.
     *
     * @param array{process: resource, pipes: array<int, resource>} $child
     * @return array{0: int, 1: string, 2: string}
     */
    private static function finish(array $child): array
    {
        $out = (string) stream_get_contents($child['pipes'][1]);
        $errors = (string) stream_get_contents($child['pipes'][2]);
        fclose($child['pipes'][1]);
        fclose($child['pipes'][2]);

        return [proc_close($child['process']), $out, $errors];
    }

    #[TestDox('UC-VIS-03-U05 — Pricing : tarif du préfixe le plus long, Haiku 5.5 au sien et à son palier long, Sonnet 5 et 5.5 à 2 / 10, mock gratuit, modèle inconnu au tarif le plus cher connu')]
    public function testU05PricingEstimate(): void
    {
        self::assertEqualsWithDelta(0.0006, Pricing::estimateUsd('claude-haiku-4-5-20251001', 100, 100), 1e-12);
        // le modèle de la démo depuis le 2026-10-21 : 0,10 $ / 0,50 $ le million, pas le tarif prudent
        self::assertEqualsWithDelta(0.00006, Pricing::estimateUsd('claude-haiku-5-5', 100, 100), 1e-12);
        // jusqu'à 100 000 tokens de prompt ; au-delà, tout l'appel à 0,50 $ / 2,50 $ (page des prix, 2026-10-21)
        self::assertEqualsWithDelta(0.0105, Pricing::estimateUsd('claude-haiku-5-5', 100_000, 1000), 1e-12);
        self::assertEqualsWithDelta(0.0525005, Pricing::estimateUsd('claude-haiku-5-5-20261001', 100_001, 1000), 1e-12);
        self::assertEqualsWithDelta(1.0, Pricing::estimateUsd('claude-haiku-4-5', 1_000_000, 0), 1e-12, 'Haiku 4.5 : pas de palier');
        self::assertEqualsWithDelta(0.018, Pricing::estimateUsd('claude-sonnet-4-5', 1000, 1000), 1e-12);
        // Sonnet 5 et 5.5 : 2 $ / 10 $ (la hausse à 3 / 15 du 2026-09-01 n'a pas eu lieu), Opus 5.5 : 4 / 20.
        self::assertEqualsWithDelta(0.012, Pricing::estimateUsd('claude-sonnet-5', 1000, 1000), 1e-12);
        self::assertEqualsWithDelta(0.012, Pricing::estimateUsd('claude-sonnet-5-5', 1000, 1000), 1e-12);
        self::assertEqualsWithDelta(0.024, Pricing::estimateUsd('claude-opus-5-5', 1000, 1000), 1e-12);
        self::assertEqualsWithDelta(0.03, Pricing::estimateUsd('claude-opus-4-8', 1000, 1000), 1e-12);
        self::assertEqualsWithDelta(0.06, Pricing::estimateUsd('claude-fable-5-1', 1000, 1000), 1e-12);
        self::assertSame(0.0, Pricing::estimateUsd('mock', 5000, 5000));
        self::assertEqualsWithDelta(0.06, Pricing::estimateUsd('modele-inconnu', 1000, 1000), 1e-12, 'au prix de Fable');
    }

    #[TestDox('UC-VIS-03-U26 — Pricing : le plus haut de la grille des crédits et de la table — la grille quand elle est plus chère (son prix, son palier long, un identifiant daté ou non), la table et son palier quand la grille est moins chère ou l’a perdu ; un modèle de la grille seule à son prix, d’aucune au plus cher')]
    public function testU26PricingTakesTheHigherOfGridAndTable(): void
    {
        $grille = [
            'claude-haiku-4-5-20251001' => ['prix_usd_mtok' => [2, 6]],
            'claude-haiku-5-5' => [
                'prix_usd_mtok' => [0.2, 1],
                'palier_long' => ['au_dela_de' => 1000, 'prix_usd_mtok' => [1, 3]],
            ],
            'illisible' => ['prix_usd_mtok' => 'gratuit'],
        ];
        // La grille plus chère que la table (une hausse que la table ne connaît pas) : la grille.
        self::assertEqualsWithDelta(0.008, Pricing::estimateUsd('claude-haiku-4-5-20251001', 1000, 1000, $grille), 1e-12);
        self::assertEqualsWithDelta(0.008, Pricing::estimateUsd('claude-haiku-4-5', 1000, 1000, $grille), 1e-12,
            'l’identifiant sans date est le même modèle');
        self::assertEqualsWithDelta(0.0012, Pricing::estimateUsd('claude-haiku-5-5', 1000, 1000, $grille), 1e-12);
        self::assertEqualsWithDelta(0.004001, Pricing::estimateUsd('claude-haiku-5-5', 1001, 1000, $grille), 1e-12,
            'au-delà du palier de la grille, tout l’appel à son prix');
        self::assertEqualsWithDelta(0.012, Pricing::estimateUsd('claude-sonnet-5', 1000, 1000, $grille), 1e-12,
            'hors grille : la table');
        self::assertEqualsWithDelta(0.06, Pricing::estimateUsd('illisible', 1000, 1000, $grille), 1e-12,
            'un prix illisible ne vaut rien : la table, au plus cher');

        // La grille moins chère, ou sans le palier de Haiku 5.5 (saisi à la main, page mal lue) :
        // la table tient, palier compris — 0,079 $ au lieu de 0,395 $ laisserait passer cinq fois le budget.
        $basse = [
            'claude-sonnet-5' => ['prix_usd_mtok' => [1, 5]],
            'claude-haiku-5-5' => ['prix_usd_mtok' => [0.1, 0.5]],
            'claude-lyra-1' => ['prix_usd_mtok' => [3, 15]],
        ];
        self::assertEqualsWithDelta(0.012, Pricing::estimateUsd('claude-sonnet-5', 1000, 1000, $basse), 1e-12);
        self::assertEqualsWithDelta(0.395, Pricing::estimateUsd('claude-haiku-5-5', 150_000, 128_000, $basse), 1e-12);
        self::assertEqualsWithDelta(0.018, Pricing::estimateUsd('claude-lyra-1', 1000, 1000, $basse), 1e-12,
            'un modèle que seule la grille connaît : son prix, pas le plus cher');
        // Un palier de grille mal formé n'est pas lu.
        self::assertEqualsWithDelta(0.0006, Pricing::estimateUsd('claude-haiku-5-5', 1000, 1000,
            ['claude-haiku-5-5' => ['prix_usd_mtok' => [0.1, 0.5], 'palier_long' => ['au_dela_de' => 10]]]), 1e-12);
    }

    #[TestDox('UC-VIS-03-U27 — AnthropicFlux : une réponse en flux lue par morceaux coupés n’importe où — texte ou JSON de l’outil forcé (compact, comme la réponse entière), entrée au message_start, sortie cumulée au message_delta, commentaires, ping et événements inconnus ignorés, un message JSON entier lu tel quel ; un appel coupé ou en erreur se facture à son entrée comptée (sinon la borne) et aux octets reçus plus 1 024, jamais au-delà de max_tokens ; à toute sa sortie quand ces octets ne bornent rien (réflexion, réponse dont le type n’est pas un flux) ; un événement inconnu compte ses données ; une erreur avant tout début est un refus')]
    public function testU27StreamedAnswerIsReadAsItComes(): void
    {
        // Une réponse complète, en CRLF, entourée d'un commentaire, d'un ping et
        // d'un événement inconnu, livrée par morceaux de 7 octets (un « é » coupé en deux).
        $sse = ": attente\n\nevent: ping\ndata: {\"type\": \"ping\"}\n\n"
            . implode('', AnthropicSse::complet('Bonjour, élève !', 120, 9, 'claude-haiku-5-5'))
            . "event: bientot\ndata: {\"type\":\"bientot\"}\n\n";
        $appel = AnthropicFlux::depuis(...str_split(str_replace("\n", "\r\n", $sse), 7));
        self::assertTrue($appel->complet());
        self::assertSame('Bonjour, élève !', $appel->texte());
        self::assertNull($appel->document());
        self::assertSame([120, 9, 'end_turn', 'claude-haiku-5-5', 16],
            [$appel->tokensEntree(), $appel->tokensSortie(), $appel->raisonArret(), $appel->modele('x'), $appel->caracteres()]);
        self::assertSame([120, 9], $appel->usageAFacturer(5000, 64000), 'complet : les comptes d’Anthropic');

        // L'outil forcé : son JSON, compact et sans échappement, comme la réponse non diffusée.
        $outil = AnthropicFlux::depuis(...AnthropicSse::complet("{\"poles\": [{\"num\": 1}],\n \"é\": \"x\"}", 300, 40,
            'claude-haiku-5-5', 'tool_use', true));
        self::assertSame('{"poles":[{"num":1}],"é":"x"}', $outil->document());
        self::assertSame('', $outil->texte());

        // Coupé après trois morceaux de texte : entrée comptée, sortie bornée par les octets reçus.
        $debut = AnthropicSse::debut('Une réponse longue, coupée', 800);
        $coupe = AnthropicFlux::depuis(...$debut);
        self::assertFalse($coupe->complet());
        self::assertSame([800, \strlen('Une réponse longue, coupée') + AnthropicFlux::MARGE_SORTIE], $coupe->usageAFacturer(5000, 64000));
        self::assertSame([800, 500], $coupe->usageAFacturer(5000, 500), 'jamais au-delà de max_tokens');

        // Un événement d'erreur en cours de route : incomplet, facturé de même.
        $erreur = AnthropicFlux::depuis(...[...$debut, AnthropicSse::evenement('error', ['error' => ['type' => 'overloaded_error', 'message' => 'Overloaded']])]);
        self::assertFalse($erreur->complet());
        self::assertSame('overloaded_error', $erreur->evenementErreur()['type']);
        self::assertSame($coupe->usageAFacturer(5000, 64000), $erreur->usageAFacturer(5000, 64000));

        // Rien de lisible : l'entrée bornée par l'appelant, la marge pour la sortie.
        $illisible = AnthropicFlux::depuis('pas du SSE');
        self::assertFalse($illisible->complet());
        self::assertSame([5000, AnthropicFlux::MARGE_SORTIE], $illisible->usageAFacturer(5000, 64000));

        // Un delta d'un genre à venir compte pour tout son encodage.
        $inconnu = ['type' => 'citations_delta', 'citation' => ['cited_text' => 'é']];
        $avecInconnu = AnthropicFlux::depuis(...[...$debut,
            AnthropicSse::evenement('content_block_delta', ['index' => 0, 'delta' => $inconnu])]);
        self::assertSame([800, \strlen('Une réponse longue, coupée') + \strlen(json_encode($inconnu, JSON_UNESCAPED_UNICODE))
            + AnthropicFlux::MARGE_SORTIE], $avecInconnu->usageAFacturer(5000, 64000));

        // Ce qui est arrivé ne borne pas ce qui a été produit — un bloc de réflexion (son texte
        // peut venir résumé, ou pas du tout), une réponse qui n'est pas un flux d'événements
        // coupée en route — : coupé, l'appel est facturé à toute sa sortie.
        $reflexion = AnthropicFlux::depuis(
            AnthropicSse::debut('', 800)[0],
            AnthropicSse::evenement('content_block_start', ['index' => 0, 'content_block' => ['type' => 'thinking', 'thinking' => '']]),
            AnthropicSse::evenement('content_block_delta', ['index' => 0, 'delta' => ['type' => 'thinking_delta', 'thinking' => 'Résumé.']]),
        );
        self::assertSame([800, 64000], $reflexion->usageAFacturer(5000, 64000));
        $tronque = AnthropicFlux::depuis('{"type":"message","content":[{"type":"text","text":"tronq');
        self::assertFalse($tronque->complet());
        self::assertSame([5000, 64000], $tronque->usageAFacturer(5000, 64000));

        // Le type de la réponse décide d'un flux : un corps 2xx qui n'en est pas un ne borne rien.
        $page = AnthropicFlux::depuisReponse(['content-type' => 'text/html; charset=utf-8'], '<html>une page</html>');
        self::assertFalse($page->complet());
        self::assertSame([5000, 64000], $page->usageAFacturer(5000, 64000));
        self::assertTrue(AnthropicFlux::depuisReponse(['content-type' => 'text/event-stream'],
            ...AnthropicSse::complet('ok', 10, 2))->complet());

        // Un événement d'un genre à venir compte pour toutes ses données.
        $evenementAVenir = AnthropicSse::evenement('content_block_extra', ['index' => 0, 'bloc' => 'du texte à venir']);
        $aVenir = AnthropicFlux::depuis(...[...$debut, $evenementAVenir]);
        $donnees = substr(trim($evenementAVenir), \strlen("event: content_block_extra\ndata: "));
        self::assertSame([800, \strlen('Une réponse longue, coupée') + \strlen($donnees) + AnthropicFlux::MARGE_SORTIE],
            $aVenir->usageAFacturer(5000, 64000));

        // Une erreur avant que la réponse commence est un refus — rien à facturer ; après, un appel coupé.
        $refus = AnthropicFlux::depuis(AnthropicSse::evenement('error', ['error' => ['type' => 'overloaded_error', 'message' => 'Overloaded']]));
        self::assertTrue($refus->refuseEnFlux());
        self::assertFalse($erreur->refuseEnFlux());
        self::assertFalse($coupe->refuseEnFlux());

        // Un message JSON entier (un client qui ne diffuse pas) se lit comme la réponse entière.
        $entier = AnthropicFlux::depuis(json_encode(['type' => 'message', 'model' => 'claude-sonnet-5',
            'content' => [['type' => 'tool_use', 'input' => ['a' => 'é']]], 'stop_reason' => 'tool_use',
            'usage' => ['input_tokens' => 70, 'output_tokens' => 12]], JSON_THROW_ON_ERROR));
        self::assertTrue($entier->complet());
        self::assertSame(['{"a":"é"}', [70, 12], 'tool_use'], [$entier->document(), $entier->usageAFacturer(1, 1), $entier->raisonArret()]);
    }

    #[TestDox('UC-VIS-03-U30 — RelaisAppel : la réponse relayée (text/event-stream, ni cache ni transformation, ni tampon de proxy) donne la progression — la première tout de suite —, puis l’issue, calculée une fois ; une issue qui échoue devient une erreur 500 générique ; le navigateur parti, l’appel est coupé et son issue calculée une fois, sans rien relayer de plus')]
    public function testU30RelayStreamsProgressThenTheOutcomeOnce(): void
    {
        $relais = static function (array $morceaux, \Closure $issue): array {
            $http = new LlmFakeHttpClient();
            $http->queueStream($morceaux);
            $appel = AnthropicFlux::ouvrir($http, 'https://api.anthropic.com/v1/messages', [], [], 5);
            $calculs = new \ArrayObject();
            $reponse = RelaisAppel::reponse(new \Slim\Psr7\Response(), $appel, static function () use ($appel, $issue, $calculs): array {
                $calculs[] = $appel->arrete();

                return $issue($appel);
            });

            return [$reponse, $calculs, $appel];
        };
        $resultat = static fn (AnthropicFlux $a): array => [200, ['text' => $a->texte()]];

        [$reponse, $calculs] = $relais(AnthropicSse::complet('Bonjour, élève !', 120, 9), $resultat);
        self::assertSame([200, 'text/event-stream; charset=utf-8', 'no-cache, no-transform', 'no'], [$reponse->getStatusCode(),
            $reponse->getHeaderLine('Content-Type'), $reponse->getHeaderLine('Cache-Control'), $reponse->getHeaderLine('X-Accel-Buffering')]);
        $corps = $reponse->getBody();
        self::assertSame(RelaisAppel::evenement('progression', ['caracteres' => 6]), $corps->read(8192), 'le premier morceau (« Bonjou »), tout de suite');
        self::assertCount(0, $calculs);
        self::assertStringEndsWith(RelaisAppel::evenement('resultat', ['text' => 'Bonjour, élève !']), (string) $corps);
        self::assertTrue($corps->eof());
        self::assertSame('', $corps->read(8192));
        $corps->close();
        unset($corps, $reponse);
        self::assertSame([false], $calculs->getArrayCopy(), 'l’issue, une fois');

        // Une issue qui échoue : une erreur générique, jamais son détail.
        [$reponse] = $relais(AnthropicSse::complet('x', 1, 1), static function (): array {
            throw new \RuntimeException('détail interne');
        });
        $journal = ini_set('error_log', '/dev/null');
        try {
            self::assertStringEndsWith(RelaisAppel::evenement('erreur', ['status' => 500, 'error' => 'Erreur interne']), (string) $reponse->getBody());
        } finally {
            ini_set('error_log', (string) $journal);
        }

        // Le navigateur part après la première progression : l'appel est coupé, son issue calculée une fois.
        [$reponse, $calculs, $appel] = $relais(AnthropicSse::complet('Une réponse longue', 300, 40), $resultat);
        $corps = $reponse->getBody();
        $corps->read(8192);
        $corps->close();
        self::assertSame([true], $calculs->getArrayCopy());
        self::assertTrue($appel->arrete());
        self::assertSame('', $corps->read(8192), 'rien de plus');
        unset($corps, $reponse);
        self::assertSame([true], $calculs->getArrayCopy());
    }

    #[TestDox('UC-VIS-03-U06 — DemoConfig : base > env > fichier > défaut ; le fournisseur ne vient jamais de la base')]
    public function testU06DemoConfigPrecedence(): void
    {
        foreach (['DEMO_ENABLED', 'DEMO_PROVIDER', 'DEMO_MODEL', 'DEMO_PER_IP_PER_HOUR', 'DEMO_POW_DIFFICULTY_BITS'] as $env) {
            TestDb::setEnv($env, '');
        }
        $file = DemoConfig::load();
        self::assertSame('fichier', $file->sources['perIpPerHour']);
        self::assertSame(20, $file->perIpPerHour);
        self::assertSame('anthropic', $file->provider);

        TestDb::setEnv('DEMO_PER_IP_PER_HOUR', '7');
        TestDb::setEnv('DEMO_PROVIDER', 'mock');
        $env = DemoConfig::load();
        self::assertSame(7, $env->perIpPerHour);
        self::assertSame('env', $env->sources['perIpPerHour']);

        (new SettingsRepository(Db::get()))->set(DemoConfig::OVERRIDES_KEY, [
            'perIpPerHour' => 3, 'enabled' => false, 'provider' => 'anthropic', 'model' => 'claude-haiku-4-5-x',
        ]);
        $base = DemoConfig::load();
        self::assertSame(3, $base->perIpPerHour);
        self::assertFalse($base->enabled);
        self::assertSame('claude-haiku-4-5-x', $base->model);
        self::assertSame('base', $base->sources['enabled']);
        self::assertSame('mock', $base->provider, 'provider : env/fichier seulement');
        self::assertNotContains('provider', DemoConfig::OVERRIDABLE_FIELDS);

        // Base configurée mais injoignable (connexion refusée) : la branche
        // catch(\Throwable) ignore la couche « base » en silence (fail-safe).
        TestDb::setEnv('DB_NAME', 'uc_vis_03_base_inexistante');
        Db::reset();
        $previousLog = ini_set('error_log', '/dev/null');
        try {
            $down = DemoConfig::load();
            self::assertSame(7, $down->perIpPerHour);
            self::assertSame('env', $down->sources['perIpPerHour']);
            self::assertTrue($down->enabled, 'le « enabled: false » de la base n’est plus lu');
        } finally {
            ini_set('error_log', (string) $previousLog);
            TestDb::setEnv('DB_NAME', TestDb::name());
            Db::reset();
        }
        // Base non configurée (DB_HOST vide) : couche ignorée aussi.
        TestDb::setEnv('DB_HOST', '');
        self::assertSame(7, DemoConfig::load()->perIpPerHour);
    }

    #[TestDox('UC-VIS-03-U07 — MockProvider : pôle demandé de la journée de fixture, kairos, texte générique ; tokens estimés')]
    public function testU07MockProviderAnswers(): void
    {
        $mock = new MockProvider();
        $pole = $mock->complete('ignoré', 'Système', 'Journée du 2026-01-06. Pôle 2 — COEUR. "poleNum": "2"', 100);
        $decoded = json_decode($pole['text'], true, 512, JSON_THROW_ON_ERROR);
        self::assertSame('2', $decoded['poleNum']);
        self::assertSame('mock', $pole['model']);
        self::assertSame((int) ceil(mb_strlen('Système' . 'Journée du 2026-01-06. Pôle 2 — COEUR. "poleNum": "2"') / 3.6), $pole['usage']['inputTokens']);
        self::assertSame((int) ceil(mb_strlen($pole['text']) / 3.6), $pole['usage']['outputTokens']);
        $fixture = json_decode((string) file_get_contents(\dirname(__DIR__, 4) . '/schemas/fixtures/cartographie-jour-2026-01-06.json'), true);
        self::assertEquals($fixture['poles'][1], $decoded);

        $kairos = $mock->complete('m', null, 'SYNTHÈSE KAIROS — Pôle 1 — … 2026-01-05', 100);
        self::assertEquals(
            json_decode((string) file_get_contents(\dirname(__DIR__, 4) . '/schemas/fixtures/cartographie-jour-2026-01-05.json'), true)['kairos'],
            json_decode($kairos['text'], true),
        );
        self::assertStringStartsWith('Réponse simulée du fournisseur mock', $mock->complete('m', null, 'Bonjour', 10)['text']);
    }

    #[TestDox('UC-VIS-03-U08 — AnthropicProvider : modèle et plafond imposés, clé en en-tête seulement, erreurs amont typées')]
    public function testU08AnthropicProviderContract(): void
    {
        $http = new LlmFakeHttpClient();
        $http->queueResponse(['status' => 200, 'body' => json_encode([
            'model' => 'claude-haiku-4-5-20251001',
            'content' => [['type' => 'tool_use', 'input' => ['poleNum' => '1']]],
            'usage' => ['input_tokens' => 120, 'output_tokens' => 30],
            'stop_reason' => 'tool_use',
        ])]);
        $provider = new AnthropicProvider($http, 'sk-ant-secret', 5);

        $result = $provider->complete('claude-haiku-4-5-20251001', 'Consigne', 'Texte', 512);
        self::assertSame('{"poleNum":"1"}', $result['text']);
        self::assertSame(['inputTokens' => 120, 'outputTokens' => 30], $result['usage']);
        $sent = $http->requests[0];
        self::assertSame('https://api.anthropic.com/v1/messages', $sent['url']);
        self::assertSame('sk-ant-secret', $sent['headers']['x-api-key']);
        self::assertSame(5, $sent['timeout']);
        $payload = json_decode((string) $sent['body'], true);
        self::assertSame('claude-haiku-4-5-20251001', $payload['model']);
        self::assertSame(['type' => 'disabled'], $payload['thinking']);
        self::assertSame(512, $payload['max_tokens']);
        self::assertSame('Consigne', $payload['system']);
        self::assertSame('emettre_document', $payload['tool_choice']['name']);
        self::assertStringNotContainsString('sk-ant-secret', (string) $sent['body']);

        $http->queueResponse(['status' => 429, 'headers' => ['retry-after' => '40'], 'body' => '{"error":{"message":"rate limited"}}']);
        try {
            $provider->complete('m', null, 'p', 10);
            self::fail('429 attendu');
        } catch (UpstreamException $e) {
            self::assertSame(429, $e->status);
            self::assertSame('40', $e->retryAfter);
            self::assertStringNotContainsString('sk-ant-secret', $e->getMessage());
        }
        $http->queueException(new HttpClientException('timeout', true));
        $this->expectException(HttpClientException::class);
        $provider->complete('m', null, 'p', 10);
    }
}
