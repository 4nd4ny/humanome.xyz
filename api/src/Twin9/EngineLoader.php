<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Composer\Autoload\ClassLoader;
use Humanome\Env;

/**
 * Loads the private Twin9 engine (ADR-011). Its PHP sources live in the
 * private repository 4nd4ny/Twin_v9, folder php/src (PSR-4, prefix Twin9\),
 * cloned next to this one: TWIN_V9_DIR, by default ../Twin_v9 from the
 * repository root. Nothing of the engine is ever copied into this repository;
 * a release (ADR-008) embeds its sources and its commit in its own Twin_v9/
 * folder, outside the webroot (scripts/deploy/stage-twin9.mjs, T18).
 *
 * Without php/src the platform starts and runs as before: server-side Twin9
 * stays disabled (isLoaded() is false) and the tests that need the engine
 * skip.
 */
final class EngineLoader
{
    /** PSR-4 prefix of the engine, as declared by Twin_v9/php/composer.json. */
    public const PREFIX = 'Twin9\\';

    /** A full commit name: 40 hex digits in SHA-1, 64 in SHA-256 (git init --object-format=sha256). */
    private const OBJECT_NAME = '(?:[0-9a-f]{40}|[0-9a-f]{64})';

    /** @var array<string, ClassLoader> registered autoloaders, by source directory */
    private static array $loaders = [];

    /**
     * The Twin_v9 checkout: TWIN_V9_DIR; else the copy a release embeds,
     * <release>/Twin_v9 (T18); else Twin_v9 next to the repository.
     *
     * @param string|null $racine the root of the code, the release's in production (tests)
     */
    public static function directory(?string $racine = null): string
    {
        $directory = Env::get('TWIN_V9_DIR');
        if ($directory !== '') {
            return $directory;
        }
        $embarque = ($racine ?? \dirname(__DIR__, 2)) . '/Twin_v9';

        return is_dir($embarque . '/php/src') ? $embarque : \dirname(__DIR__, 4) . '/Twin_v9';
    }

    /**
     * Registers the PSR-4 autoloader of <directory>/php/src when it exists,
     * once per source directory. Returns whether the engine is loaded.
     */
    public static function load(?string $directory = null): bool
    {
        $source = self::sourceDirectory($directory ?? self::directory());
        if ($source === null) {
            return false;
        }
        if (!isset(self::$loaders[$source])) {
            $loader = new ClassLoader();
            $loader->addPsr4(self::PREFIX, $source);
            $loader->register();
            self::$loaders[$source] = $loader;
        }

        return true;
    }

    /** Server-side Twin9 is enabled only once the configured engine is loaded. */
    public static function isLoaded(): bool
    {
        $source = self::sourceDirectory(self::directory());

        return $source !== null && isset(self::$loaders[$source]);
    }

    /**
     * The engine's commit, which a run's attestation keeps (T9): the HEAD of
     * the Twin_v9 checkout, read in git's files or, in the reftable format,
     * asked to git; else the first line of its COMMIT file (a copy without
     * git, as the deployment leaves it); else null.
     */
    public static function commit(?string $directory = null): ?string
    {
        $directory ??= self::directory();
        $git = $directory . '/.git';
        // A worktree: its .git file names the whole gitdir, spaces included (git writes it unquoted).
        if (is_file($git) && preg_match('/^gitdir:\s*(.+)$/', self::firstLine($git), $m) === 1) {
            $git = str_starts_with($m[1], '/') ? $m[1] : $directory . '/' . $m[1];
        }
        $head = is_file($git . '/HEAD') ? trim((string) file_get_contents($git . '/HEAD')) : '';
        if (str_starts_with($head, 'ref: ')) {
            $head = self::reference($git, substr($head, 5)) ?? '';
        }
        if (preg_match('/^' . self::OBJECT_NAME . '$/', $head) === 1) {
            return $head;
        }
        $head = self::reftableHead($git);
        if ($head !== null) {
            return $head;
        }
        $fichier = $directory . '/COMMIT';
        $commit = is_file($fichier) ? trim(strtok((string) file_get_contents($fichier), "\n") ?: '') : '';

        // A full name, or one abbreviated to at least 7 digits.
        return preg_match('/^[0-9a-f]{7,64}$/', $commit) === 1 ? $commit : null;
    }

    /** A reference's commit: its file, else packed-refs; in a worktree, the common directory holds both. */
    private static function reference(string $git, string $ref): ?string
    {
        foreach (self::refDirectories($git) as $dir) {
            if (is_file($dir . '/' . $ref)) {
                return trim((string) file_get_contents($dir . '/' . $ref));
            }
            if (is_file($dir . '/packed-refs')
                && preg_match('/^(' . self::OBJECT_NAME . ') ' . preg_quote($ref, '/') . '\r?$/m',
                    (string) file_get_contents($dir . '/packed-refs'), $m) === 1) {
                return $m[1];
            }
        }

        return null;
    }

    /**
     * The HEAD of a repository in the reftable format (git init
     * --ref-format=reftable, git 3.0's default), whose refs are binary tables
     * only git reads: asked to git, without a shell, on that gitdir alone
     * (--git-dir), so that a .git git refuses never yields the commit of a
     * repository around it. Null in the files format (read above), without
     * proc_open or git, or when git names no commit.
     */
    private static function reftableHead(string $git): ?string
    {
        $reftable = array_filter(self::refDirectories($git), static fn (string $dir): bool => is_dir($dir . '/reftable'));
        if ($reftable === [] || !\function_exists('proc_open')) {
            return null;
        }
        $process = @proc_open(
            ['git', '--git-dir=' . $git, 'rev-parse', '--verify', '--quiet', 'HEAD'],
            [0 => ['file', '/dev/null', 'r'], 1 => ['pipe', 'w'], 2 => ['file', '/dev/null', 'w']],
            $pipes,
        );
        if (!\is_resource($process)) {
            return null;
        }
        $head = trim((string) stream_get_contents($pipes[1]));
        fclose($pipes[1]);

        return proc_close($process) === 0 && preg_match('/^' . self::OBJECT_NAME . '$/', $head) === 1 ? $head : null;
    }

    /**
     * Where a gitdir's refs live: itself, and in a worktree its common
     * directory (absolute or relative).
     *
     * @return list<string>
     */
    private static function refDirectories(string $git): array
    {
        $dirs = [$git];
        if (is_file($git . '/commondir')) {
            $commun = trim((string) file_get_contents($git . '/commondir'));
            $dirs[] = str_starts_with($commun, '/') ? $commun : $git . '/' . $commun;
        }

        return $dirs;
    }

    /** A file's first line, without its line end (CRLF included) nor its trailing blanks. */
    private static function firstLine(string $file): string
    {
        return rtrim(explode("\n", (string) file_get_contents($file), 2)[0]);
    }

    private static function sourceDirectory(string $directory): ?string
    {
        $source = realpath($directory . '/php/src');

        return $source !== false && is_dir($source) ? $source : null;
    }
}
