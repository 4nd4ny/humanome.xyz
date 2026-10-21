<?php

declare(strict_types=1);

namespace Humanome\Llm;

/**
 * One call to Anthropic's Messages API, streamed (« stream »: true) and read
 * as it arrives (2026-10-21, Christian: « Si on passe en appel en flux, alors
 * on voit la réponse arriver au fur et à mesure ? […] Si oui, alors c'est mon
 * choix », and « Je ne peux pas prendre à charge les coûts extra »).
 *
 * The HTTP status comes first: an error status is a call Anthropic refused,
 * which bills nothing. Then, event by event: the input tokens (message_start),
 * the text or the forced tool's JSON, the characters received so far — the
 * progress the browser shows —, the stop reason and the output tokens
 * (message_delta, cumulative), the end (message_stop) or an error event.
 *
 * A call cut short — the timeout, a network failure, an error event, a body
 * that cannot be read — is billed for what it produced (usageAFacturer): its
 * input as Anthropic counted it at message_start (the caller's bound before
 * that), and its output bounded by the bytes received, plus a margin for the
 * tokens still in flight. Anthropic stops generating when a stream is closed
 * and bills what was generated: its documentation does not say so, others do
 * (read on 2026-10-21) — OpenRouter's streaming reference (« For supported
 * providers, this immediately stops model processing and billing »,
 * Anthropic listed), claudelab.net (5 to 34 tokens generated past the cut,
 * measured), TrueFoundry's gateway (cancels Anthropic streams, bills the
 * partial output at about 3.5 characters a token). One token per byte, plus
 * 1,024, overestimates all of these. Where the bytes received cannot bound what was generated
 * — a thinking block, whose text may come summarised or not at all; an answer
 * that is not a stream of events — the output's worst case is billed. The
 * site never pays for a call it cannot bill.
 *
 * A whole JSON message instead of events — a client that cannot stream, a
 * test's canned answer — is read as the non-streamed answer it is.
 */
final class AnthropicFlux
{
    /** Output tokens that may still be in flight when a stream is cut. */
    public const MARGE_SORTIE = 1024;

    private string $tampon = '';

    private string $ligne = '';

    private ?string $evenement = null;

    private string $donnees = '';

    private ?bool $sse = null;

    private string $brut = '';

    private string $corpsErreur = '';

    private bool $fini = false;

    private ?int $tokensEntree = null;

    private ?int $tokensSortie = null;

    private string $raisonArret = '';

    private ?string $modele = null;

    private string $texte = '';

    private string $outil = '';

    private ?int $indexOutil = null;

    private ?string $outilEntier = null;

    private int $octetsSortie = 0;

    private int $caracteres = 0;

    private bool $arrete = false;

    private bool $stop = false;

    private bool $reflexion = false;

    /** @var array<string, mixed>|null */
    private ?array $evenementErreur = null;

    private function __construct(private readonly HttpStream $flux)
    {
    }

    /**
     * Sends the call with « stream »: true and waits for its status (the
     * answer's headers). An error answer is then read whole (corpsErreur()).
     *
     * @param array<string, string> $entetes
     * @param array<string, mixed> $corps the Messages API body, without « stream »
     * @throws HttpClientException when the request cannot even start
     */
    public static function ouvrir(HttpClient $http, string $url, array $entetes, array $corps, int $delai): self
    {
        $flux = RequestHttpStream::open($http, 'POST', $url, $entetes,
            json_encode($corps + ['stream' => true], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), $delai);
        $appel = new self($flux);
        $avant = '';
        while ($flux->status() === 0 && !$flux->finished()) {
            $avant .= $flux->read(0.5);
        }
        if ($appel->accepte()) {
            $appel->nourrir($avant);
            if ($flux->finished()) {
                $appel->conclure();
            }
        } else {
            // A refusal (or no answer at all): its body is a small JSON, read whole.
            while (!$flux->finished()) {
                $avant .= $flux->read(0.5);
            }
            $appel->corpsErreur = $avant;
            $appel->fini = true;
        }

        return $appel;
    }

    /** For the tests of the parser: a stream already received, in the pieces given. */
    public static function depuis(string ...$morceaux): self
    {
        $appel = new self(new class implements HttpStream {
            public function read(float $waitSeconds): string
            {
                return '';
            }

            public function finished(): bool
            {
                return true;
            }

            public function status(): int
            {
                return 200;
            }

            public function headers(): array
            {
                return [];
            }

            public function error(): ?HttpClientException
            {
                return null;
            }

            public function close(): void
            {
            }
        });
        foreach ($morceaux as $morceau) {
            $appel->nourrir($morceau);
        }
        $appel->conclure();

        return $appel;
    }

    public function statut(): int
    {
        return $this->flux->status();
    }

    /** @return array<string, string> */
    public function entetes(): array
    {
        return $this->flux->headers();
    }

    /** The body of an error answer (a status other than 2xx). */
    public function corpsErreur(): string
    {
        return $this->corpsErreur;
    }

    /**
     * The call reached Anthropic, which may have billed it: its answer began
     * (a 2xx status), or the request had gone out whole when the network
     * failed. Otherwise — a refusal (an error status: Anthropic bills
     * nothing), or a request that never left — nothing is billed.
     */
    public function parvenu(): bool
    {
        return $this->accepte() || ($this->statut() === 0 && ($this->erreurReseau()?->requestSent ?? false));
    }

    /**
     * Reads what has come, waiting at most $attente seconds for something.
     * False once the stream is over (complete, failed or closed).
     */
    public function pomper(float $attente): bool
    {
        if ($this->fini) {
            return false;
        }
        $this->nourrir($this->flux->read($attente));
        if ($this->flux->finished()) {
            $this->conclure();

            return false;
        }

        return true;
    }

    /** Cuts the stream: Anthropic stops generating; the call is then billed for what it produced. */
    public function fermer(): void
    {
        if (!$this->fini) {
            $this->flux->close();
            $this->arrete = true;
            $this->conclure();
        }
    }

    public function termine(): bool
    {
        return $this->fini;
    }

    /** The whole message arrived (message_stop, or a whole JSON message), with no error event. */
    public function complet(): bool
    {
        return $this->fini && $this->sse !== null && $this->evenementErreur === null && $this->stop;
    }

    /** The network failure that ended the stream (a timeout included), if any. */
    public function erreurReseau(): ?HttpClientException
    {
        return $this->flux->error();
    }

    /** The stream was closed by fermer(). */
    public function arrete(): bool
    {
        return $this->arrete;
    }

    /** @return array<string, mixed>|null an `error` event's error object */
    public function evenementErreur(): ?array
    {
        return $this->evenementErreur;
    }

    /** The characters of text or JSON received so far: the progress. */
    public function caracteres(): int
    {
        return $this->caracteres;
    }

    /** The text blocks, concatenated. */
    public function texte(): string
    {
        return $this->texte;
    }

    /** The forced tool's input as compact JSON, as the non-streamed answer gives it; null without a tool block. */
    public function document(): ?string
    {
        if ($this->outilEntier !== null) {
            return $this->outilEntier;
        }
        if ($this->indexOutil === null) {
            return null;
        }
        $decode = json_decode($this->outil === '' ? '{}' : $this->outil, true);

        return \is_array($decode) ? json_encode($decode, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE) : $this->outil;
    }

    public function raisonArret(): string
    {
        return $this->raisonArret;
    }

    public function modele(string $defaut): string
    {
        return $this->modele ?? $defaut;
    }

    /** The input tokens as Anthropic counted them, once message_start came. */
    public function tokensEntree(): ?int
    {
        return $this->tokensEntree;
    }

    /** The output tokens as Anthropic reported them (message_delta, cumulative). */
    public function tokensSortie(): ?int
    {
        return $this->tokensSortie;
    }

    /**
     * The tokens to bill: Anthropic's own counts for a complete call; for a
     * call cut short, its input as counted (else $entreeBornee) and its
     * output bounded by the bytes received plus MARGE_SORTIE, never past
     * $sortieMax (the max_tokens sent).
     *
     * @return array{0: int, 1: int} [input, output]
     */
    public function usageAFacturer(int $entreeBornee, int $sortieMax): array
    {
        if ($this->complet() && $this->tokensEntree !== null && $this->tokensSortie !== null) {
            return [$this->tokensEntree, $this->tokensSortie];
        }
        $entree = $this->tokensEntree ?? $entreeBornee;
        if ($this->reflexion || $this->sse === false) {
            // What came cannot bound what was generated (class doc): the worst case.
            return [$entree, $sortieMax];
        }

        return [$entree, min($sortieMax, max($this->tokensSortie ?? 0, $this->octetsSortie + self::MARGE_SORTIE))];
    }

    private function accepte(): bool
    {
        return $this->statut() >= 200 && $this->statut() < 300;
    }

    /** Feeds received bytes to the parser. */
    private function nourrir(string $octets): void
    {
        if ($octets === '') {
            return;
        }
        if ($this->sse === null) {
            $this->tampon .= $octets;
            $debut = ltrim($this->tampon);
            if ($debut === '') {
                return;
            }
            $this->sse = $debut[0] !== '{';
            $octets = $this->tampon;
            $this->tampon = '';
        }
        if (!$this->sse) {
            $this->brut .= $octets;

            return;
        }
        $this->ligne .= $octets;
        while (($fin = strpos($this->ligne, "\n")) !== false) {
            $ligne = rtrim(substr($this->ligne, 0, $fin), "\r");
            $this->ligne = substr($this->ligne, $fin + 1);
            $this->lireLigne($ligne);
        }
    }

    private function lireLigne(string $ligne): void
    {
        if ($ligne === '') {
            $this->expedier();

            return;
        }
        if (str_starts_with($ligne, ':')) {
            return; // a comment
        }
        [$champ, $valeur] = array_pad(explode(':', $ligne, 2), 2, '');
        if (str_starts_with($valeur, ' ')) {
            $valeur = substr($valeur, 1);
        }
        if ($champ === 'event') {
            $this->evenement = $valeur;
        } elseif ($champ === 'data') {
            $this->donnees .= ($this->donnees === '' ? '' : "\n") . $valeur;
        }
    }

    private function expedier(): void
    {
        $donnees = $this->donnees;
        $nom = $this->evenement;
        $this->donnees = '';
        $this->evenement = null;
        if ($donnees === '') {
            return;
        }
        $evenement = json_decode($donnees, true);
        if (!\is_array($evenement)) {
            return;
        }
        $type = \is_string($evenement['type'] ?? null) ? $evenement['type'] : $nom;
        switch ($type) {
            case 'message_start':
                $message = \is_array($evenement['message'] ?? null) ? $evenement['message'] : [];
                if (\is_string($message['model'] ?? null)) {
                    $this->modele = $message['model'];
                }
                $this->lireUsage(\is_array($message['usage'] ?? null) ? $message['usage'] : [], false);
                break;
            case 'content_block_start':
                $bloc = \is_array($evenement['content_block'] ?? null) ? $evenement['content_block'] : [];
                if (($bloc['type'] ?? '') === 'tool_use' && $this->indexOutil === null) {
                    $this->indexOutil = (int) ($evenement['index'] ?? 0);
                }
                if (\in_array($bloc['type'] ?? '', ['thinking', 'redacted_thinking'], true)) {
                    $this->reflexion = true;
                }
                break;
            case 'content_block_delta':
                $this->lireDelta((int) ($evenement['index'] ?? 0),
                    \is_array($evenement['delta'] ?? null) ? $evenement['delta'] : []);
                break;
            case 'message_delta':
                $delta = \is_array($evenement['delta'] ?? null) ? $evenement['delta'] : [];
                if (\is_string($delta['stop_reason'] ?? null)) {
                    $this->raisonArret = $delta['stop_reason'];
                }
                $this->lireUsage(\is_array($evenement['usage'] ?? null) ? $evenement['usage'] : [], true);
                break;
            case 'message_stop':
                $this->raisonArret = $this->raisonArret === '' ? 'end_turn' : $this->raisonArret;
                $this->stop = true;
                break;
            case 'error':
                $this->evenementErreur = \is_array($evenement['error'] ?? null) ? $evenement['error'] : ['type' => 'error'];
                break;
            default:
                break; // ping, content_block_stop, and the events to come
        }
    }

    /** @param array<string, mixed> $delta */
    private function lireDelta(int $index, array $delta): void
    {
        $type = $delta['type'] ?? '';
        if ($type === 'text_delta' && \is_string($delta['text'] ?? null)) {
            $this->texte .= $delta['text'];
            $this->compter($delta['text']);
        } elseif ($type === 'input_json_delta' && \is_string($delta['partial_json'] ?? null)) {
            if ($index === $this->indexOutil) {
                $this->outil .= $delta['partial_json'];
            }
            $this->compter($delta['partial_json']);
        } elseif ($type === 'thinking_delta' && \is_string($delta['thinking'] ?? null)) {
            $this->octetsSortie += \strlen($delta['thinking']);
        } else {
            // A delta of a kind to come: its whole encoding, an upper bound of its tokens.
            $this->octetsSortie += \strlen((string) json_encode($delta, JSON_UNESCAPED_UNICODE));
        }
    }

    private function compter(string $morceau): void
    {
        $this->octetsSortie += \strlen($morceau);
        $this->caracteres += mb_strlen($morceau, 'UTF-8');
    }

    /** @param array<string, mixed> $usage */
    private function lireUsage(array $usage, bool $cumul): void
    {
        $entree = 0;
        $vu = false;
        foreach (['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'] as $champ) {
            if (\is_int($usage[$champ] ?? null)) {
                $entree += $usage[$champ];
                $vu = true;
            }
        }
        if ($vu && ($entree > 0 || !$cumul)) {
            $this->tokensEntree = max($this->tokensEntree ?? 0, $entree);
        }
        if ($cumul && \is_int($usage['output_tokens'] ?? null)) {
            $this->tokensSortie = max($this->tokensSortie ?? 0, $usage['output_tokens']);
        }
    }

    /** The end of the transfer: the last line, or the whole JSON message. */
    private function conclure(): void
    {
        if ($this->fini) {
            return;
        }
        $this->fini = true;
        if ($this->sse === true) {
            if ($this->ligne !== '') {
                $this->lireLigne(rtrim($this->ligne, "\r"));
                $this->ligne = '';
            }
            $this->expedier();

            return;
        }
        if ($this->sse === false) {
            $this->lireMessageEntier();
        }
    }

    private function lireMessageEntier(): void
    {
        $message = json_decode($this->brut, true);
        if (!\is_array($message) || !\is_array($message['content'] ?? null)) {
            return;
        }
        foreach ($message['content'] as $bloc) {
            if (!\is_array($bloc)) {
                continue;
            }
            if (($bloc['type'] ?? '') === 'tool_use' && \array_key_exists('input', $bloc) && $this->outilEntier === null) {
                $this->outilEntier = json_encode($bloc['input'], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
                $this->compter($this->outilEntier);
            }
            if (($bloc['type'] ?? '') === 'text') {
                $texte = (string) ($bloc['text'] ?? '');
                $this->texte .= $texte;
                $this->compter($texte);
            }
        }
        if (\is_string($message['model'] ?? null)) {
            $this->modele = $message['model'];
        }
        $usage = \is_array($message['usage'] ?? null) ? $message['usage'] : [];
        $this->lireUsage($usage, false);
        $this->lireUsage($usage, true);
        $this->raisonArret = (string) ($message['stop_reason'] ?? '');
        $this->stop = true;
    }
}
