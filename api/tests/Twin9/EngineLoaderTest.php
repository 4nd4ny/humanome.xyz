<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\Bootstrap;
use Humanome\Tests\TestDb;
use Humanome\Twin9\EngineLoader;
use PHPUnit\Framework\TestCase;
use Slim\Psr7\Factory\ServerRequestFactory;

/**
 * Loading the private Twin9 engine (ADR-011): TWIN_V9_DIR/php/src in PSR-4
 * when present, otherwise server-side Twin9 stays disabled; the platform
 * starts either way. Fake engines are throwaway directories; the real one
 * is only checked where Twin_v9 is cloned, and skipped elsewhere (public CI).
 */
final class EngineLoaderTest extends TestCase
{
    private ?string $fake = null;

    protected function tearDown(): void
    {
        TestDb::restoreEnv();
        if ($this->fake !== null) {
            array_map('unlink', glob($this->fake . '/php/src/*.php') ?: []);
            rmdir($this->fake . '/php/src');
            rmdir($this->fake . '/php');
            rmdir($this->fake);
        }
    }

    /**
     * The engine's commit, for a run's attestation (T9): its checkout's HEAD,
     * through a branch, packed or not, or a worktree's; else the COMMIT file a
     * copy without git keeps; else nothing.
     */
    public function testTheEnginesCommitIsItsCheckoutsHeadElseItsCommitFile(): void
    {
        $sha = str_repeat('a1b2c3d4e5', 4);
        $racine = sys_get_temp_dir() . '/twin_v9-commit-' . bin2hex(random_bytes(4));
        $ecrire = static function (string $chemin, string $texte) use ($racine): void {
            @mkdir(\dirname($racine . '/' . $chemin), 0777, true);
            file_put_contents($racine . '/' . $chemin, $texte);
        };
        try {
            self::assertNull(EngineLoader::commit($racine . '/rien'));

            $ecrire('clone/.git/HEAD', "ref: refs/heads/main\n");
            $ecrire('clone/.git/refs/heads/main', $sha . "\n");
            self::assertSame($sha, EngineLoader::commit($racine . '/clone'));

            $ecrire('emballe/.git/HEAD', "ref: refs/heads/main\n");
            $ecrire('emballe/.git/packed-refs', "# pack-refs with: peeled\n$sha refs/heads/main\n");
            self::assertSame($sha, EngineLoader::commit($racine . '/emballe'));

            $ecrire('clone/.git/worktrees/t9/HEAD', "ref: refs/heads/main\n");
            $ecrire('clone/.git/worktrees/t9/commondir', "../..\n");
            $ecrire('arbre/.git', 'gitdir: ' . $racine . "/clone/.git/worktrees/t9\n");
            self::assertSame($sha, EngineLoader::commit($racine . '/arbre'));

            $ecrire('copie/COMMIT', "$sha\n");
            self::assertSame($sha, EngineLoader::commit($racine . '/copie'));
        } finally {
            exec('rm -rf ' . escapeshellarg($racine));
        }
    }

    public function testDirectoryDefaultsToTwinV9NextToTheRepository(): void
    {
        TestDb::setEnv('TWIN_V9_DIR', '');
        self::assertSame(\dirname(__DIR__, 4) . '/Twin_v9', EngineLoader::directory());

        TestDb::setEnv('TWIN_V9_DIR', '/srv/twin_v9');
        self::assertSame('/srv/twin_v9', EngineLoader::directory());
    }

    public function testThePlatformLoadsTheEngineFoundInTwinV9Dir(): void
    {
        $class = $this->fakeEngine();
        TestDb::setEnv('TWIN_V9_DIR', (string) $this->fake);

        self::assertSame(200, $this->health());
        self::assertTrue(EngineLoader::isLoaded());
        self::assertTrue(class_exists($class));

        $autoloaders = \count(spl_autoload_functions());
        self::assertTrue(EngineLoader::load());
        self::assertCount($autoloaders, spl_autoload_functions(), 'one autoloader per engine directory');
    }

    public function testWithoutTheEngineTwin9StaysDisabledAndThePlatformStarts(): void
    {
        TestDb::setEnv('TWIN_V9_DIR', sys_get_temp_dir() . '/twin_v9-absent-' . bin2hex(random_bytes(4)));
        $autoloaders = \count(spl_autoload_functions());

        self::assertSame(200, $this->health());
        self::assertFalse(EngineLoader::isLoaded());
        self::assertFalse(EngineLoader::load());
        self::assertCount($autoloaders, spl_autoload_functions());
    }

    public function testTheRealEngineLoadsWhereTwinV9IsCloned(): void
    {
        if (!is_dir(EngineLoader::directory() . '/php/src')) {
            self::markTestSkipped('Twin_v9 not cloned next to this repository (TWIN_V9_DIR): private engine not loaded.');
        }

        self::assertTrue(EngineLoader::load());
        self::assertTrue(EngineLoader::isLoaded());
        self::assertTrue(class_exists(EngineLoader::PREFIX . 'Engine'));
    }

    /** Starts the platform and asks it for /api/health. */
    private function health(): int
    {
        $request = (new ServerRequestFactory())->createServerRequest('GET', '/api/health');

        return Bootstrap::createApp()->handle($request)->getStatusCode();
    }

    /** A throwaway engine directory holding one class; returns its name. */
    private function fakeEngine(): string
    {
        $this->fake = sys_get_temp_dir() . '/twin_v9-fake-' . bin2hex(random_bytes(4));
        mkdir($this->fake . '/php/src', 0777, true);
        $name = 'Probe' . bin2hex(random_bytes(4));
        file_put_contents(
            $this->fake . '/php/src/' . $name . '.php',
            "<?php\n\nnamespace Twin9;\n\nfinal class {$name}\n{\n}\n",
        );

        return EngineLoader::PREFIX . $name;
    }
}
