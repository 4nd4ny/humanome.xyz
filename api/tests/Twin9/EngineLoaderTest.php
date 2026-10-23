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

    /**
     * Paths holding a space ("13. Cartographie"), which git writes as they
     * are: a worktree's .git file names its whole gitdir, not its first word,
     * absolute or relative; its HEAD, detached or on a branch that only the
     * common directory's packed-refs holds. Line ends in CRLF and a trailing
     * blank (a checkout touched on Windows) change nothing.
     */
    public function testTheEnginesCommitSurvivesPathsWithASpaceAndCrlf(): void
    {
        $detache = str_repeat('0123456789', 4);
        $branche = str_repeat('fedcba9876', 4);
        $racine = sys_get_temp_dir() . '/twin v9-commit-' . bin2hex(random_bytes(4));
        $ecrire = static function (string $chemin, string $texte) use ($racine): void {
            @mkdir(\dirname($racine . '/' . $chemin), 0777, true);
            file_put_contents($racine . '/' . $chemin, $texte);
        };
        $clone = '13. Cartographie/Twin_v9/.git';
        try {
            $ecrire("$clone/HEAD", "ref: refs/heads/main\n");
            $ecrire("$clone/packed-refs", "# pack-refs with: peeled fully-peeled sorted\n$branche refs/heads/main\n");
            self::assertSame($branche, EngineLoader::commit("$racine/13. Cartographie/Twin_v9"), 'the clone itself');

            $ecrire("$clone/worktrees/t9 s2/HEAD", "$detache\n");
            $ecrire("$clone/worktrees/t9 s2/commondir", "../..\n");
            $ecrire('t9 s2/.git', "gitdir: $racine/$clone/worktrees/t9 s2\n");
            self::assertSame($detache, EngineLoader::commit("$racine/t9 s2"), 'a detached worktree');

            $ecrire("$clone/worktrees/branche/HEAD", "ref: refs/heads/main\n");
            $ecrire("$clone/worktrees/branche/commondir", "../..\n");
            $ecrire('branche/.git', "gitdir: $racine/$clone/worktrees/branche\n");
            self::assertSame($branche, EngineLoader::commit("$racine/branche"), 'a worktree on a packed branch');

            $ecrire('relatif/.git', "gitdir: ../$clone/worktrees/branche\n");
            self::assertSame($branche, EngineLoader::commit("$racine/relatif"), 'a relative gitdir');

            $windows = '14. Copie Windows/Twin_v9/.git';
            $ecrire("$windows/packed-refs", "# pack-refs with: peeled\r\n$branche refs/heads/main\r\n");
            $ecrire("$windows/worktrees/w/HEAD", "ref: refs/heads/main\r\n");
            $ecrire("$windows/worktrees/w/commondir", "$racine/$windows\r\n");
            $ecrire('crlf/.git', "gitdir: $racine/$windows/worktrees/w \r\n");
            self::assertSame($branche, EngineLoader::commit("$racine/crlf"), 'CRLF, absolute commondir');
        } finally {
            exec('rm -rf ' . escapeshellarg($racine));
        }
    }

    /**
     * A repository in SHA-256 (git init --object-format=sha256) names its
     * commits with 64 hex digits, not 40: its HEAD, detached or on a branch,
     * loose or packed, and the COMMIT file a release copies from it.
     */
    public function testTheEnginesCommitMayBeASha256(): void
    {
        $sha = str_repeat('0123456789abcdef', 4);
        $racine = sys_get_temp_dir() . '/twin v9-sha256-' . bin2hex(random_bytes(4));
        $ecrire = static function (string $chemin, string $texte) use ($racine): void {
            @mkdir(\dirname($racine . '/' . $chemin), 0777, true);
            file_put_contents($racine . '/' . $chemin, $texte);
        };
        try {
            $ecrire('detache/.git/HEAD', "$sha\n");
            self::assertSame($sha, EngineLoader::commit("$racine/detache"), 'a detached HEAD');

            $ecrire('isolee/.git/HEAD', "ref: refs/heads/main\n");
            $ecrire('isolee/.git/refs/heads/main', "$sha\n");
            self::assertSame($sha, EngineLoader::commit("$racine/isolee"), 'a loose branch');

            $ecrire('emballe/.git/HEAD', "ref: refs/heads/main\n");
            $ecrire('emballe/.git/packed-refs', "# pack-refs with: peeled\r\n$sha refs/heads/main\r\n");
            self::assertSame($sha, EngineLoader::commit("$racine/emballe"), 'a packed branch, CRLF');

            $ecrire('copie/COMMIT', "$sha\n");
            self::assertSame($sha, EngineLoader::commit("$racine/copie"), 'a copy without git');
        } finally {
            exec('rm -rf ' . escapeshellarg($racine));
        }
    }

    /**
     * A repository in the reftable format (git init --ref-format=reftable,
     * git 3.0's default) keeps its refs in binary tables, its HEAD file naming
     * refs/heads/.invalid: its commit, on a branch or in a detached worktree,
     * under a path with a space, is the one git reads there; never the commit
     * of a repository around a directory whose .git git refuses. Skipped where
     * git does not know the format.
     */
    public function testTheEnginesCommitInAReftableRepositoryIsTheOneGitReads(): void
    {
        $racine = sys_get_temp_dir() . '/twin v9-reftable-' . bin2hex(random_bytes(4));
        $depot = "$racine/13. Cartographie/Twin_v9";
        $git = static function (string ...$arguments): ?string {
            $sortie = [];
            $code = 1;
            exec('GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 git -c user.name=Test -c user.email=test@example.invalid '
                . '-c commit.gpgsign=false -c core.hooksPath=/dev/null '
                . implode(' ', array_map('escapeshellarg', $arguments)) . ' 2>/dev/null', $sortie, $code);

            return $code === 0 ? trim(implode("\n", $sortie)) : null;
        };
        try {
            mkdir($depot, 0777, true);
            if ($git('init', '-q', '--ref-format=reftable', '-b', 'main', $depot) === null) {
                self::markTestSkipped('git does not know the reftable format here (git >= 2.45).');
            }
            $git('-C', $depot, 'commit', '-q', '--allow-empty', '-m', 'engine');
            $sha = (string) $git('-C', $depot, 'rev-parse', 'HEAD');
            self::assertMatchesRegularExpression('/^[0-9a-f]{40}$/', $sha);
            self::assertSame("ref: refs/heads/.invalid\n", file_get_contents("$depot/.git/HEAD"), 'the reftable format');

            self::assertSame($sha, EngineLoader::commit($depot), 'the clone, on a branch');

            self::assertNotNull($git('-C', $depot, 'worktree', 'add', '-q', '--detach', "$racine/t9 s2"));
            self::assertSame($sha, EngineLoader::commit("$racine/t9 s2"), 'a detached worktree');

            mkdir("$depot/factice/.git/reftable", 0777, true);
            file_put_contents("$depot/factice/.git/HEAD", "ref: refs/heads/.invalid\n");
            self::assertNull(EngineLoader::commit("$depot/factice"), 'not the commit of the repository around it');
        } finally {
            exec('rm -rf ' . escapeshellarg($racine));
        }
    }

    /**
     * Where Twin_v9 is a git checkout (TWIN_V9_DIR, a worktree or a clone),
     * the commit the attestation keeps is the HEAD git itself reads there.
     */
    public function testTheRealEnginesCommitIsTheHeadGitReads(): void
    {
        $directory = EngineLoader::directory();
        $sortie = [];
        $code = 1;
        if (file_exists($directory . '/.git')) {
            exec('git -C ' . escapeshellarg($directory) . ' rev-parse HEAD 2>/dev/null', $sortie, $code);
        }
        if ($code !== 0 || preg_match('/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/', $sortie[0] ?? '') !== 1) {
            self::markTestSkipped('Twin_v9 is not a git checkout here (TWIN_V9_DIR): its commit is not checked.');
        }

        self::assertSame($sortie[0], EngineLoader::commit($directory));
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
