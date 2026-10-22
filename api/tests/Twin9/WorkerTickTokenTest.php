<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\Tests\AuthTestBase;
use Humanome\Tests\TestDb;
use Humanome\Worker\Tick;

/**
 * The external trigger's token (T7, ADR-011 §2): WORKER_TICK_TOKEN opens
 * POST /api/admin/worker-tick and nothing else, so that the trigger never
 * holds the migration token, which also grants roles and imports templates.
 */
final class WorkerTickTokenTest extends AuthTestBase
{
    private const TICK = 'jeton-du-declencheur-de-test';
    private const MIGRATE = 'jeton-des-migrations-de-test';

    /** Every route the migration token opens, worker-tick aside. */
    private const ROUTES_DU_JETON_DES_MIGRATIONS = [
        ['POST', '/api/admin/migrate'],
        ['POST', '/api/admin/import-referentiel'],
        ['POST', '/api/admin/seed-competences'],
        ['GET', '/api/admin/dump-fiches'],
        ['POST', '/api/admin/grant-role'],
        ['POST', '/api/admin/default-package'],
        ['POST', '/api/admin/maintenance'],
        ['POST', '/api/admin/import-prompt-package'],
        ['POST', '/api/admin/twin9/import'],
    ];

    /** Besides the tick, the tick's token opens the daily maintenance (2026-10-22, UC-SYS-03-F11). */
    private const AUSSI_PAR_LE_JETON_DU_TICK = [['POST', '/api/admin/maintenance']];

    private string|false $errorLog = false;

    protected function setUp(): void
    {
        parent::setUp();
        TestDb::setEnv('WORKER_TICK_TOKEN', self::TICK);
        TestDb::setEnv('MIGRATE_TOKEN', self::MIGRATE);
        TestDb::setEnv('WORKER_PROVIDER', 'mock');
        // No network: without the platform's key the tick reads no prices (UC-ADM-05-F19, F20 test that).
        TestDb::setEnv('ANTHROPIC_API_KEY', '');
        $this->errorLog = ini_set('error_log', (string) tempnam(sys_get_temp_dir(), 'tick-log-')); // the tick's counters
    }

    protected function tearDown(): void
    {
        $log = (string) ini_get('error_log');
        ini_set('error_log', $this->errorLog === false ? '' : $this->errorLog);
        @unlink($log);
        parent::tearDown();
    }

    public function testTheTickTokenOpensTheTick(): void
    {
        $response = $this->request('POST', '/api/admin/worker-tick', ['budgetSeconds' => 1],
            ['X-Worker-Tick-Token' => self::TICK]);
        self::assertSame(200, $response->getStatusCode());
        self::assertFalse(self::json($response)['locked']);

        self::assertSame(403, $this->request('POST', '/api/admin/worker-tick', ['budgetSeconds' => 1],
            ['X-Worker-Tick-Token' => 'autre'])->getStatusCode());
        self::assertSame(403, $this->request('POST', '/api/admin/worker-tick', ['budgetSeconds' => 1])->getStatusCode());
        self::assertSame(403, $this->request('POST', '/api/admin/worker-tick', ['budgetSeconds' => 1],
            ['X-Migrate-Token' => self::TICK])->getStatusCode());
        self::assertSame(200, $this->request('POST', '/api/admin/worker-tick', ['budgetSeconds' => 1],
            ['X-Migrate-Token' => self::MIGRATE])->getStatusCode(), 'le jeton des migrations l\'ouvre toujours');
    }

    public function testTheTickTokenOpensNoOtherRouteThanTheMaintenance(): void
    {
        foreach (self::ROUTES_DU_JETON_DES_MIGRATIONS as $route) {
            [$method, $path] = $route;
            foreach (['X-Migrate-Token', 'X-Worker-Tick-Token'] as $header) {
                $status = $this->request($method, $path, [], [$header => self::TICK])->getStatusCode();
                if ($header === 'X-Worker-Tick-Token' && \in_array($route, self::AUSSI_PAR_LE_JETON_DU_TICK, true)) {
                    self::assertSame(200, $status, "$method $path ($header)");
                } else {
                    self::assertContains($status, [401, 403], "$method $path ($header) : $status");
                }
            }
        }
    }

    /**
     * The slice gets the time it needs where PHP has a limit, and the route
     * never sets one where there is none: in the test suite (CLI), such a
     * limit ended the whole run a minute later.
     */
    public function testTheRouteRaisesTheTimeLimitButNeverSetsOne(): void
    {
        $tick = fn () => self::assertSame(200, $this->request('POST', '/api/admin/worker-tick',
            ['budgetSeconds' => 1], ['X-Worker-Tick-Token' => self::TICK])->getStatusCode());
        $avant = (int) ini_get('max_execution_time');
        try {
            set_time_limit(0);
            $tick();
            self::assertSame('0', ini_get('max_execution_time'));

            set_time_limit(30);
            $tick();
            self::assertSame((string) (Tick::MAX_SECONDS + 15), ini_get('max_execution_time'));

            set_time_limit(300);
            $tick();
            self::assertSame('300', ini_get('max_execution_time'));
        } finally {
            set_time_limit($avant);
        }
    }

    public function testWithoutAnyTokenConfiguredTheTickDoesNotExist(): void
    {
        TestDb::setEnv('WORKER_TICK_TOKEN', '');
        TestDb::setEnv('MIGRATE_TOKEN', '');
        self::assertSame(404, $this->request('POST', '/api/admin/worker-tick', [],
            ['X-Worker-Tick-Token' => self::TICK])->getStatusCode());

        TestDb::setEnv('WORKER_TICK_TOKEN', self::TICK);
        self::assertSame(200, $this->request('POST', '/api/admin/worker-tick', ['budgetSeconds' => 1],
            ['X-Worker-Tick-Token' => self::TICK])->getStatusCode(), 'son jeton suffit, sans celui des migrations');
    }
}
