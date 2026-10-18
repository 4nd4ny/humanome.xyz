<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Composer\Autoload\ClassLoader;
use Humanome\Env;

/**
 * Loads the private Twin9 engine (ADR-011). Its PHP sources live in the
 * private repository 4nd4ny/Twin_v9, folder php/src (PSR-4, prefix Twin9\),
 * cloned next to this one: TWIN_V9_DIR, by default ../Twin_v9 from the
 * repository root. Nothing of the engine is ever copied into this repository.
 *
 * Without php/src the platform starts and runs as before: server-side Twin9
 * stays disabled (isLoaded() is false) and the tests that need the engine
 * skip.
 */
final class EngineLoader
{
    /** PSR-4 prefix of the engine, as declared by Twin_v9/php/composer.json. */
    public const PREFIX = 'Twin9\\';

    /** @var array<string, ClassLoader> registered autoloaders, by source directory */
    private static array $loaders = [];

    /** The Twin_v9 checkout: TWIN_V9_DIR, else Twin_v9 next to the repository. */
    public static function directory(): string
    {
        $directory = Env::get('TWIN_V9_DIR');

        return $directory !== '' ? $directory : \dirname(__DIR__, 4) . '/Twin_v9';
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

    private static function sourceDirectory(string $directory): ?string
    {
        $source = realpath($directory . '/php/src');

        return $source !== false && is_dir($source) ? $source : null;
    }
}
