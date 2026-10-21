<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Auth\Audit;
use Humanome\Llm\HttpClient;
use Humanome\Llm\HttpClientException;
use Humanome\Llm\Pricing;
use Humanome\Packages\SettingsRepository;
use PDO;

/**
 * The price grid follows Anthropic's list prices, read once a day (2026-10-21,
 * Christian: « Corrige la surfacturation de Sonnet et prévois une mise à jour
 * quotidienne de la grille de tarification »).
 *
 * The source is the markdown of Anthropic's pricing page (SOURCE). Its table
 * « Model pricing » gives each model's base input and output prices per
 * million tokens; a model priced by prompt length (Haiku 5.5) has two rows,
 * « for prompts up to N tokens » and « for prompts over N tokens ». The columns
 * are found by their headers, a model's id from its name (« Claude Haiku 4.5 »
 * → claude-haiku-4-5), and a dated id of the grid (claude-haiku-4-5-20251001)
 * matches it without its date.
 *
 * Only the grid's models are written — which models are offered stays the
 * administrator's choice —: their prices and their long prompt tier, as the
 * page gives them; a correction made by hand holds until the next reading. A
 * model the page does not list keeps its prices, and the reading names it. A
 * page that cannot be read (network, HTTP status, table or columns not
 * found, a price out of bounds) changes nothing: the state says why.
 *
 * The worker's tick reads it (POST /api/admin/worker-tick, routes/worker.php),
 * after its slice, once per UTC day, an hour between two failed attempts,
 * under a MySQL lock — and only where the platform's Anthropic key is set: an
 * instance that bills no call on it has nothing to price. The state lives in
 * settings ('twin9_tarifs'); a price changed leaves an audit event
 * (twin9_tarifs_mis_a_jour). Prices only, never any user data.
 */
final class TarifsAnthropic
{
    public const SOURCE = 'https://platform.claude.com/docs/en/about-claude/pricing.md';

    public const SETTING_KEY = 'twin9_tarifs';

    /** Seconds between two attempts, after a failed one. */
    public const REESSAI = 3600;

    private const LOCK = 'humanome_tarifs';

    private const TIMEOUT = 10;

    private const MAX_OCTETS = 2_000_000;

    /** No list price goes beyond it (USD per million tokens): past it, a column was misread. */
    private const PRIX_MAX = 1000.0;

    /** Fewer models than this: not the table of all Claude models. */
    private const MODELES_MIN = 3;

    /**
     * Reads the page and updates the grid, when it is due (du()). Null when
     * it is not, or when another process holds the reading; its state
     * otherwise.
     *
     * @return array<string, mixed>|null
     */
    public static function releverSiDu(PDO $pdo, HttpClient $http, ?int $now = null): ?array
    {
        $now ??= time();
        $settings = new SettingsRepository($pdo);
        if (!self::du($settings->get(self::SETTING_KEY), $now)) {
            return null;
        }
        if ((int) $pdo->query('SELECT GET_LOCK(' . $pdo->quote(self::LOCK) . ', 0)')->fetchColumn() !== 1) {
            return null;
        }
        try {
            // Another process may have read it between the check and the lock.
            return self::du($settings->get(self::SETTING_KEY), $now) ? self::relever($pdo, $http, $now) : null;
        } finally {
            $pdo->query('SELECT RELEASE_LOCK(' . $pdo->quote(self::LOCK) . ')')->fetchColumn();
        }
    }

    /**
     * Due: no reading succeeded on this UTC day, and the last attempt, if it
     * failed, is an hour old.
     */
    public static function du(mixed $etat, int $now): bool
    {
        if (!\is_array($etat)) {
            return true;
        }
        if (($etat['jour'] ?? null) === gmdate('Y-m-d', $now)) {
            return false;
        }
        $tentative = $etat['tentative_at'] ?? null;

        return !\is_int($tentative) || $now - $tentative >= self::REESSAI;
    }

    /**
     * One reading: the page, its prices, the grid's models updated. The state
     * keeps the last success (its day, its changes, the models the page did
     * not list) through a failure.
     *
     * @return array<string, mixed> the reading's state, as stored
     */
    public static function relever(PDO $pdo, HttpClient $http, int $now): array
    {
        $settings = new SettingsRepository($pdo);
        $etat = $settings->get(self::SETTING_KEY);
        $etat = (\is_array($etat) ? $etat : []);
        $etat['source'] = self::SOURCE;
        $etat['tentative_at'] = $now;
        try {
            $tarifs = self::lire(self::telecharger($http));
            $config = new Twin9Config($settings);
            $lecture = self::appliquer($config->modeles(), $tarifs);
            if ($lecture['changements'] !== []) {
                // The grid's own checks hold: a price must be positive, a tier well formed.
                $config->update(['modeles' => $lecture['modeles']]);
                Audit::record($pdo, null, 'twin9_tarifs_mis_a_jour', [
                    'source' => self::SOURCE,
                    'changements' => $lecture['changements'],
                ]);
            }
            $etat = array_merge($etat, [
                'statut' => 'ok',
                'erreur' => null,
                'jour' => gmdate('Y-m-d', $now),
                'releve_at' => $now,
                'changements' => $lecture['changements'],
                'absents' => $lecture['absents'],
            ]);
        } catch (\UnexpectedValueException|HttpClientException|Twin9Exception $e) {
            $etat = array_merge($etat, ['statut' => 'echec', 'erreur' => $e->getMessage()]);
        }
        $settings->set(self::SETTING_KEY, $etat);

        return $etat;
    }

    /**
     * The state of the last reading (admin view), or null before the first.
     *
     * @return array<string, mixed>|null
     */
    public static function etat(SettingsRepository $settings): ?array
    {
        $etat = $settings->get(self::SETTING_KEY);

        return \is_array($etat) ? $etat : null;
    }

    /**
     * The prices of the table « Model pricing », by model id.
     *
     * @return array<string, array{prix_usd_mtok: array{0: float, 1: float},
     *   palier_long?: array{au_dela_de: int, prix_usd_mtok: array{0: float, 1: float}}}>
     *
     * @throws \UnexpectedValueException when the table cannot be read
     */
    public static function lire(string $markdown): array
    {
        $lignes = preg_split('/\R/', $markdown) ?: [];
        $debut = null;
        foreach ($lignes as $i => $ligne) {
            if (preg_match('/^##\s+Model pricing\s*$/i', trim($ligne)) === 1) {
                $debut = $i;
                break;
            }
        }
        if ($debut === null) {
            throw new \UnexpectedValueException('page des prix illisible : section « Model pricing » introuvable');
        }
        $table = [];
        foreach (\array_slice($lignes, $debut + 1) as $ligne) {
            $ligne = trim($ligne);
            if (str_starts_with($ligne, '#')) {
                break;
            }
            if (str_starts_with($ligne, '|')) {
                $table[] = $ligne;
            } elseif ($table !== []) {
                break;
            }
        }
        if (\count($table) < 3) {
            throw new \UnexpectedValueException('page des prix illisible : tableau des modèles introuvable');
        }

        $entetes = array_map('strtolower', self::cellules($table[0]));
        $colModele = array_search('model', $entetes, true);
        $colEntree = array_search('base input tokens', $entetes, true);
        $colSortie = array_search('output tokens', $entetes, true);
        if ($colModele === false || $colEntree === false || $colSortie === false) {
            throw new \UnexpectedValueException(
                'page des prix illisible : colonnes « Model », « Base input tokens » ou « Output tokens » introuvables');
        }

        $tarifs = [];
        $paliers = [];
        foreach (\array_slice($table, 2) as $ligne) {
            $cellules = self::cellules($ligne);
            // A link in parentheses (« (retired, …) », « (limited availability) ») is not part of the name.
            $nom = trim((string) preg_replace('/\(\[[^\]]*\]\([^)]*\)\)/', '', $cellules[$colModele] ?? ''));
            $palier = null;
            if (preg_match('/\(for prompts (up to|over) ([\d,]+) tokens\)/i', $nom, $m) === 1) {
                $palier = [strtolower($m[1]), (int) str_replace(',', '', $m[2])];
            }
            $nom = trim((string) preg_replace('/\s*\(.*$/', '', $nom));
            if (preg_match('/^Claude ([A-Za-z]+) (\d+(?:\.\d+)*)$/', $nom, $m) !== 1) {
                continue;
            }
            $id = 'claude-' . strtolower($m[1]) . '-' . str_replace('.', '-', $m[2]);
            $prix = [self::prix($cellules[$colEntree] ?? '', $nom), self::prix($cellules[$colSortie] ?? '', $nom)];
            if ($palier !== null && $palier[0] === 'over') {
                $paliers[$id] = ['au_dela_de' => $palier[1], 'prix_usd_mtok' => $prix];
            } else {
                $tarifs[$id] = ['prix_usd_mtok' => $prix];
            }
        }
        foreach ($paliers as $id => $palier) {
            if (!isset($tarifs[$id])) {
                throw new \UnexpectedValueException('page des prix illisible : palier long sans prix de base pour ' . $id);
            }
            $tarifs[$id]['palier_long'] = $palier;
        }
        if (\count($tarifs) < self::MODELES_MIN) {
            throw new \UnexpectedValueException('page des prix illisible : ' . \count($tarifs) . ' modèle(s) lu(s)');
        }

        return $tarifs;
    }

    /**
     * The grid with the page's prices: each model the page lists gets its
     * prices and its long prompt tier (none if the page gives none); the
     * others keep theirs and are named in `absents`.
     *
     * @param array<string, array<string, mixed>> $modeles the grid (Twin9Config::modeles())
     * @param array<string, array<string, mixed>> $tarifs what lire() gave
     * @return array{modeles: array<string, array<string, mixed>>,
     *   changements: list<array{modele: string, avant: array<string, mixed>, apres: array<string, mixed>}>,
     *   absents: list<string>}
     */
    public static function appliquer(array $modeles, array $tarifs): array
    {
        $changements = [];
        $absents = [];
        foreach ($modeles as $id => $modele) {
            $id = (string) $id;
            $tarif = $tarifs[$id] ?? $tarifs[Pricing::sansDate($id)] ?? null;
            if (!\is_array($tarif) || !\is_array($modele)) {
                $absents[] = $id;
                continue;
            }
            $avant = array_intersect_key($modele, ['prix_usd_mtok' => true, 'palier_long' => true]);
            $apres = array_intersect_key($tarif, ['prix_usd_mtok' => true, 'palier_long' => true]);
            // 2 and 2.0 are one price: loose comparison, on purpose.
            if ($avant != $apres) {
                $modeles[$id] = $apres;
                $changements[] = ['modele' => $id, 'avant' => $avant, 'apres' => $apres];
            }
        }

        return ['modeles' => $modeles, 'changements' => $changements, 'absents' => $absents];
    }

    /** The page's markdown. @throws \UnexpectedValueException|HttpClientException */
    private static function telecharger(HttpClient $http): string
    {
        $reponse = $http->request('GET', self::SOURCE, ['accept' => 'text/markdown, text/plain'], null,
            self::TIMEOUT, self::MAX_OCTETS);
        if ($reponse['overflow']) {
            throw new \UnexpectedValueException('page des prix trop volumineuse');
        }
        if ($reponse['status'] !== 200) {
            throw new \UnexpectedValueException('page des prix : HTTP ' . $reponse['status']);
        }

        return $reponse['body'];
    }

    /** @return list<string> the cells of a markdown table row */
    private static function cellules(string $ligne): array
    {
        return array_map('trim', explode('|', trim(trim($ligne), '|')));
    }

    /** « $0.10 / MTok<sup>2</sup> » → 0.1. @throws \UnexpectedValueException */
    private static function prix(string $cellule, string $nom): float
    {
        if (preg_match('/\$\s*(\d+(?:\.\d+)?)\s*\/\s*MTok/i', $cellule, $m) !== 1) {
            throw new \UnexpectedValueException('page des prix illisible : prix introuvable pour ' . $nom);
        }
        $prix = (float) $m[1];
        if ($prix <= 0.0 || $prix > self::PRIX_MAX) {
            throw new \UnexpectedValueException('page des prix illisible : prix hors bornes pour ' . $nom);
        }

        return $prix;
    }
}
