<?php

declare(strict_types=1);

namespace Humanome\Llm;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * How a streamed call (AnthropicFlux) reaches the browser (2026-10-21). A
 * browser that asks for it (Accept: text/event-stream) gets the answer as it
 * comes — server-sent events: `progression` {caracteres} while the call
 * streams, `: attente` comments while it is silent, then `resultat` with the
 * JSON the route would have answered, or `erreur` {status, error, …}. Any
 * other client gets that JSON at the end, with its status.
 *
 * The call's outcome — billing included — is the route's `$conclure`
 * (array{0: int, 1: array}: status, body), run once, at the end of the
 * stream or when the browser leaves (the call is then cut first).
 */
final class RelaisAppel
{
    /** Seconds between two progress events. */
    private const PAS = 0.5;

    /** Seconds of silence before a keep-alive comment (an idle proxy may cut). */
    private const SILENCE = 10.0;

    /**
     * Writes the session before a call that may last minutes: no other
     * request of the same browser waits on it meanwhile.
     */
    public static function libererSession(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }
    }

    public static function demande(Request $request): bool
    {
        return str_contains(strtolower($request->getHeaderLine('Accept')), 'text/event-stream');
    }

    /** @param array<string, mixed> $donnees */
    public static function evenement(string $nom, array $donnees): string
    {
        return 'event: ' . $nom . "\ndata: "
            . json_encode($donnees, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE) . "\n\n";
    }

    /**
     * Runs the call to its end, then its outcome: for a client that does not relay.
     *
     * @param \Closure(): array{0: int, 1: array<string, mixed>} $conclure
     * @return array{0: int, 1: array<string, mixed>}
     */
    public static function jusquauBout(AnthropicFlux $appel, \Closure $conclure): array
    {
        while ($appel->pomper(1.0)) {
        }

        return $conclure();
    }

    /**
     * The relayed response (status 200, text/event-stream).
     *
     * @param \Closure(): array{0: int, 1: array<string, mixed>} $conclure
     */
    public static function reponse(Response $response, AnthropicFlux $appel, \Closure $conclure): Response
    {
        // The call is billed whatever the browser does: PHP finishes the script.
        ignore_user_abort(true);
        if (\PHP_SAPI !== 'cli') {
            @ini_set('zlib.output_compression', '0');
        }
        $etat = new \stdClass();
        $etat->envoyes = 0;
        $etat->dernier = microtime(true);
        $etat->termine = false;
        $issue = static function () use ($conclure): array {
            try {
                return $conclure();
            } catch (\Throwable $e) {
                error_log('[relais] ' . $e::class); // never content

                return [500, ['error' => 'Erreur interne']];
            }
        };
        $suivant = static function () use ($appel, $issue, $etat): ?string {
            if ($etat->termine) {
                return null;
            }
            while ($appel->pomper(self::PAS)) {
                $maintenant = microtime(true);
                $caracteres = $appel->caracteres();
                if ($caracteres > $etat->envoyes && ($etat->envoyes === 0 || $maintenant - $etat->dernier >= self::PAS)) {
                    $etat->envoyes = $caracteres;
                    $etat->dernier = $maintenant;

                    return self::evenement('progression', ['caracteres' => $caracteres]);
                }
                if ($maintenant - $etat->dernier >= self::SILENCE) {
                    $etat->dernier = $maintenant;

                    return ": attente\n\n";
                }
            }
            $etat->termine = true;
            [$statut, $donnees] = $issue();

            return $statut === 200
                ? self::evenement('resultat', $donnees)
                : self::evenement('erreur', ['status' => $statut] + $donnees);
        };
        $abandon = static function () use ($appel, $issue, $etat): void {
            if ($etat->termine) {
                return;
            }
            $etat->termine = true;
            $appel->fermer();
            $issue();
        };

        return $response
            ->withStatus(200)
            ->withHeader('Content-Type', 'text/event-stream; charset=utf-8')
            ->withHeader('Cache-Control', 'no-cache, no-transform')
            ->withHeader('X-Accel-Buffering', 'no')
            ->withBody(new RelaisSse($suivant, $abandon));
    }
}
