<?php

declare(strict_types=1);

namespace Humanome\Llm;

use Psr\Http\Message\StreamInterface;

/**
 * The body of an answer relayed to the browser as it comes
 * (text/event-stream, 2026-10-21): each chunk is produced when the response
 * emitter reads it, and pushed out at once — unless the hosting holds the
 * stream back, in which case everything arrives at the end, which works too.
 *
 * When the browser leaves before the end, the emitter stops reading: the
 * destructor then cuts the call and bills what it produced (`$abandon`), so
 * that nothing the provider billed goes unbilled. The routes that relay ask
 * PHP to finish their script whatever the browser does (ignore_user_abort).
 */
final class RelaisSse implements StreamInterface
{
    private bool $fini = false;

    /**
     * @param \Closure(): ?string $suivant the next chunk; null once the call is over and billed
     * @param \Closure(): void $abandon the browser left: cut the call, bill what it produced
     */
    public function __construct(private readonly \Closure $suivant, private readonly \Closure $abandon)
    {
    }

    public function read(int $length): string
    {
        self::pousser();
        if ($this->fini) {
            return '';
        }
        $morceau = ($this->suivant)();
        if ($morceau === null) {
            $this->fini = true;

            return '';
        }

        return $morceau;
    }

    public function eof(): bool
    {
        return $this->fini;
    }

    public function __toString(): string
    {
        $tout = '';
        while (!$this->fini) {
            $tout .= $this->read(8192);
        }

        return $tout;
    }

    public function getContents(): string
    {
        return $this->__toString();
    }

    public function close(): void
    {
        $this->abandonner();
    }

    public function detach()
    {
        $this->abandonner();

        return null;
    }

    public function getSize(): ?int
    {
        return null;
    }

    public function tell(): int
    {
        throw new \RuntimeException('Flux relayé : position inconnue');
    }

    public function isSeekable(): bool
    {
        return false;
    }

    public function seek(int $offset, int $whence = SEEK_SET): void
    {
        throw new \RuntimeException('Flux relayé : pas de retour en arrière');
    }

    public function rewind(): void
    {
        throw new \RuntimeException('Flux relayé : pas de retour en arrière');
    }

    public function isWritable(): bool
    {
        return false;
    }

    public function write(string $string): int
    {
        throw new \RuntimeException('Flux relayé : lecture seule');
    }

    public function isReadable(): bool
    {
        return true;
    }

    public function getMetadata(?string $key = null)
    {
        return $key === null ? [] : null;
    }

    public function __destruct()
    {
        $this->abandonner();
    }

    private function abandonner(): void
    {
        if (!$this->fini) {
            $this->fini = true;
            ($this->abandon)();
        }
    }

    /** Sends out what the emitter echoed so far — not under the CLI, where the tests capture output. */
    private static function pousser(): void
    {
        if (\PHP_SAPI === 'cli') {
            return;
        }
        while (ob_get_level() > 0 && @ob_end_flush()) {
        }
        @flush();
    }
}
