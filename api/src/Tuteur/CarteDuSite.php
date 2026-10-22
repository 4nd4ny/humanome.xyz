<?php

declare(strict_types=1);

namespace Humanome\Tuteur;

use Humanome\Env;

/**
 * The site map the tutor reads (scripts/data/site-map.json, docs/contrats.md
 * §12): generated with its digest by scripts/build-tuteur-digest.mjs, from
 * the same sources, and shipped in the API release by stage-api.sh.
 *
 * Sprint 11, lot A (closes UC-VIS-05 AN1): the `rubrique` the panel sends is
 * the name of the route the person is on (`route.name`). It reaches the
 * system prompt only when the map names that page, and then as the page's
 * title and address, followed by the help of that page alone (variant V1, on
 * top of the digest, which holds the help of every page: V2). Anything else —
 * an unknown name, an internal route (#/activer, a redirect: no help, not in
 * the digest), a line of free text — is dropped: a client can no longer add
 * a line to the system prompt.
 *
 * Read per request, like the digest. A missing, unreadable or malformed file
 * is no error: the tutor answers as it did before the map, the route name
 * alone — and only something shaped like a route name.
 */
final class CarteDuSite
{
    /** A route name of web/src/router.js: lowercase letters, digits, hyphens. */
    private const FORME_DE_ROUTE = '/^[a-z][a-z0-9-]{0,63}\z/';

    /**
     * @param array<string, array{href: string, titre: string, resume: string, points: list<string>}> $pages
     *   by route name: the pages that have help
     */
    private function __construct(private readonly array $pages)
    {
    }

    /**
     * The map of the release (www/api/scripts/data) or of a dev checkout
     * (scripts/data), or the one TUTEUR_SITE_MAP names — then that file
     * alone, present or not (tests). Null when there is none to read.
     */
    public static function charger(): ?self
    {
        $chemin = Env::get('TUTEUR_SITE_MAP');
        $chemins = $chemin !== '' ? [$chemin] : [
            \dirname(__DIR__, 2) . '/scripts/data/site-map.json', // release
            \dirname(__DIR__, 3) . '/scripts/data/site-map.json', // dev repo
        ];
        foreach ($chemins as $fichier) {
            if (is_file($fichier)) {
                $json = @file_get_contents($fichier);

                return \is_string($json) ? self::depuisJson($json) : null;
            }
        }

        return null;
    }

    /** Null when $json is not a site map: version 1, with a list of pages. */
    public static function depuisJson(string $json): ?self
    {
        try {
            $data = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return null;
        }
        if (!\is_array($data) || ($data['version'] ?? null) !== 1 || !\is_array($data['pages'] ?? null)) {
            return null;
        }
        $pages = [];
        foreach ($data['pages'] as $page) {
            if (!\is_array($page) || ($page['interne'] ?? false) === true) {
                continue;
            }
            $route = $page['route'] ?? null;
            $href = $page['href'] ?? null;
            $titre = $page['titre'] ?? null;
            if (!\is_string($route) || !\is_string($href) || !\is_string($titre) || trim($titre) === '') {
                continue;
            }
            $pages[$route] = [
                'href' => $href,
                'titre' => trim($titre),
                'resume' => \is_string($page['resume'] ?? null) ? trim($page['resume']) : '',
                'points' => \is_array($page['points'] ?? null)
                    ? array_values(array_filter(array_map(
                        static fn (mixed $point): string => \is_string($point) ? trim($point) : '',
                        $page['points'],
                    ), static fn (string $point): bool => $point !== ''))
                    : [],
            ];
        }

        return new self($pages);
    }

    /**
     * The page named $route: its address, title and help. Null when the map
     * does not name it, or names an internal route.
     *
     * @return array{href: string, titre: string, resume: string, points: list<string>}|null
     */
    public function page(string $route): ?array
    {
        return $this->pages[$route] ?? null;
    }

    /**
     * The system prompt's lines for the page the person is on: none when
     * $rubrique (what the client sent, any value) names no page.
     *
     * @return list<string>
     */
    public static function lignesRubrique(?self $carte, mixed $rubrique): array
    {
        if (!\is_string($rubrique)) {
            return [];
        }
        $rubrique = trim($rubrique);
        if ($carte === null) {
            // No map: the route name, as before the map — never free text.
            return preg_match(self::FORME_DE_ROUTE, $rubrique) === 1
                ? ['Elle consulte actuellement : ' . $rubrique . '.']
                : [];
        }
        $page = $carte->page($rubrique);
        if ($page === null) {
            return [];
        }
        $lignes = ['Elle consulte actuellement : ' . $page['titre'] . ' (' . $page['href'] . ').'];
        if ($page['resume'] !== '' || $page['points'] !== []) {
            $lignes[] = 'Aide de cette page :';
            if ($page['resume'] !== '') {
                $lignes[] = $page['resume'];
            }
            foreach ($page['points'] as $point) {
                $lignes[] = '- ' . $point;
            }
        }

        return $lignes;
    }
}
