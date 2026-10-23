<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Env;
use Humanome\Packages\SettingsRepository;
use Humanome\Twin9\Fournisseurs\Fournisseurs;

/**
 * Twin9 platform configuration, persisted as JSON in the `settings` table
 * (key 'twin9_config', SettingsRepository) — ADR-010 §3/§6.
 *
 * Shape (all keys optional in storage, defaults below):
 *   marge     float, margin multiplier applied to Anthropic list prices (1..5)
 *   packs     list of {montant_usd (1..500), libelle} PayPal top-up offers
 *   modeles   map model_id => {prix_usd_mtok: [in, out] (>0), palier_long?:
 *             {au_dela_de: prompt tokens (>0), prix_usd_mtok: [in, out] (>0)}}
 *             — the long prompt tier some models bill above a prompt size
 *             (Haiku 5.5, T10); a profile asks a model for its price only.
 *             Anthropic's list prices: TarifsAnthropic reads them again once
 *             a day and writes them over the grid's models (2026-10-21).
 *             Another provider's model is keyed « provider:model »
 *             (Fournisseurs::clePrix(), ADR-012 §6), its prices entered by
 *             the administrator, never by the daily reading, and carries its
 *             caps: plafond_sortie (output tokens, > 0; 32,768 at most at
 *             Google), plafond_reflexion (reasoning tokens its worst case
 *             adds, ≥ 0; > 0 at xAI), duree_max_s (1..45 seconds), and at
 *             OpenAI and Google reflexion_param, the lowest reasoning setting
 *             the model admits (REFLEXION_PARAMS); refused on Anthropic's
 *   runs_par_tick         int, the Twin9 runs a tick advances at most (1..20,
 *                         default 3 — ADR-011 §2)
 *   secondes_par_tranche  int, the length of a tick's slice in seconds
 *                         (5..45, default 40 — OVH: 45 s at most)
 *   twin9_fournisseurs_ouverts   list of the providers a Twin9 run may reach
 *                         (Fournisseurs::REGISTRE ids, default ['anthropic'] —
 *                         ADR-012)
 *   twin9_fournisseurs_non_rgpd  bool, whether a provider tagged « non » may be
 *                         opened (default false: closed)
 *
 * publicView() is the ONLY shape the front ever sees of it: the Twin6 prices
 * WITH margin applied (the raw list price and the margin stay admin-only).
 *
 * Gone on 2026-10-20, with the browser's engine they served (T11): the
 * switch `enabled` and the protocol settings `pipeline` the import wrote, the
 * offer's model tiers (`etages`) the supervision edited, the rate
 * `appels_par_minute` that bounded the open cartography's paid calls. Gone
 * on 2026-10-22 with the personal lane of Twin9 (ADR-013 §6): the promotion
 * `twin9_cle_perso_ouverte`, a free Twin9 on the user's own key — no new run
 * leaves on a personal key. A value of them still stored is ignored on read
 * and leaves at the next save. No migration erases them yet: that is a
 * contraction, which waits until the release that stops reading them is
 * stable (ADR-008; STATUS.md).
 */
final class Twin9Config
{
    public const SETTING_KEY = 'twin9_config';

    /**
     * The third parties' models whose worst case fell short (RunCosts::
     * solder()), kept apart from 'twin9_config': the worker writes them, an
     * administrator's save never clobbers them, nor they it.
     */
    public const PIRE_CAS_KEY = 'twin9_pire_cas_insuffisant';

    /**
     * The slice the external trigger asks (POST /api/admin/worker-tick), kept
     * apart from 'twin9_config' as the route writes it: {secondes, at}.
     */
    public const DECLENCHEUR_KEY = 'twin9_tranche_declencheur';

    /**
     * Referentiel STRUCTURE (pole num/nom + competence code/nom) the client
     * engine needs to assemble artefacts — NOT secret (codes and names are the
     * public RESPIRE referentiel; only the accented pole names differ from the
     * static respire-v7.json, which is why we serve the exact structure the
     * imported templates were parsed from). Stored under its own settings key,
     * written by the import (X-Migrate-Token), never by the admin PUT. It is
     * RESPIRE's as the import knows it: the open cartography (Twin6) reads it
     * for RESPIRE only, and only while it has the poles and codes of the
     * version chosen (2026-10-20, web/src/api/twin6.js referentielTwin6) —
     * another referential, or another structure of RESPIRE, it reads from
     * its published document.
     */
    public const REFERENTIEL_KEY = 'twin9_referentiel';

    private const MARGE_MIN = 1.0;
    private const MARGE_MAX = 5.0;
    private const PACK_MIN_USD = 1.0;
    private const PACK_MAX_USD = 500.0;

    /** The fields of another provider's model entry (ADR-012 §6), refused on Anthropic's. */
    private const CHAMPS_TIERS = ['plafond_sortie', 'plafond_reflexion', 'duree_max_s', 'reflexion_param'];

    /**
     * The reasoning settings a model entry may name, by provider: OpenAI's
     * `reasoning_effort` and Gemini's `thinkingLevel`, as their documentations
     * list them (2026-10-22). Not every model admits every value: a wrong one
     * is a 400, which the administrator mends in the grid.
     */
    public const REFLEXION_PARAMS = [
        'openai' => ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
        'google' => ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'],
    ];

    /** Gemini's output tokens of a non-streamed request, at most. */
    private const SORTIE_MAX_GEMINI = 32768;

    public function __construct(private readonly SettingsRepository $settings)
    {
    }

    /** @return array<string, mixed> */
    public static function defaults(): array
    {
        return [
            // Owner decision (2026-07-15): CONTRIBUTION per protocole. Twin9 is
            // the proprietary Golden Prompt (R&D) → +20 %; Twin6 is open source
            // → +10 % (operational cost recovery: PayPal fee + OVH/domain +
            // Haiku demo). `marge` is the Twin9 rate (the server runs');
            // `marge_twin6` the open-cartography rate. Both « contribution »,
            // never « surtaxe ». The PayPal FIXED fee (≈ 0.30-0.49 USD/capture)
            // is why packs start at 10 USD (see 'packs').
            'marge' => 1.2,
            'marge_twin6' => 1.1,
            // Owner choice (2026-07-16): recharge grid 10/20/50/100/200/500 USD
            // (« Pas d'abonnement, mais une recharge de 10$ 20$ 50$ 100$ 200$
            // 500$ le cas échéant »). No subscription; a large portfolio can
            // need a 200–500 USD run, hence the high packs and PACK_MAX_USD.
            'packs' => [
                ['montant_usd' => 10, 'libelle' => 'Pack découverte — 10 $'],
                ['montant_usd' => 20, 'libelle' => 'Pack standard — 20 $'],
                ['montant_usd' => 50, 'libelle' => 'Pack intensif — 50 $'],
                ['montant_usd' => 100, 'libelle' => 'Pack pro — 100 $'],
                ['montant_usd' => 200, 'libelle' => 'Pack cohorte — 200 $'],
                ['montant_usd' => 500, 'libelle' => 'Pack établissement — 500 $'],
            ],
            // Anthropic's list prices, which TarifsAnthropic reads again every
            // day and writes over these (2026-10-21). Sonnet 5 costs 2 / 10 since
            // its launch: the rise to 3 / 15 announced for 2026-09-01 did not
            // happen, and the grid billed it half again too much until then.
            'modeles' => [
                'claude-haiku-4-5-20251001' => [
                    'prix_usd_mtok' => [1, 5],
                ],
                'claude-sonnet-5' => [
                    'prix_usd_mtok' => [2, 10],
                ],
                'claude-opus-4-8' => [
                    'prix_usd_mtok' => [5, 25],
                ],
                // The v9.8 profile's models (T10), at Anthropic's list prices read on 2026-10-21
                // (platform.claude.com/docs/en/about-claude/pricing): Haiku 5.5 bills a prompt
                // over 100,000 tokens at its long prompt tier.
                'claude-haiku-5-5' => [
                    'prix_usd_mtok' => [0.1, 0.5],
                    'palier_long' => ['au_dela_de' => 100000, 'prix_usd_mtok' => [0.5, 2.5]],
                ],
                'claude-sonnet-5-5' => [
                    'prix_usd_mtok' => [2, 10],
                ],
            ],
            'runs_par_tick' => 3,
            'secondes_par_tranche' => 40,
            // The providers a run may reach (ADR-012): Anthropic alone until the administrator opens another;
            // one tagged « non » (Google, xAI, OpenRouter) only once the second switch is on — closed by default.
            'twin9_fournisseurs_ouverts' => [Fournisseurs::DEFAUT],
            'twin9_fournisseurs_non_rgpd' => false,
        ];
    }

    /**
     * Effective configuration: stored values over defaults (admin view).
     *
     * @return array<string, mixed>
     */
    public function read(): array
    {
        $stored = $this->settings->get(self::SETTING_KEY) ?? [];
        $config = array_merge(self::defaults(), array_intersect_key(
            $stored,
            self::defaults(),
        ));
        // A model's tiers, stored before 2026-10-20, are ignored like the
        // keys that left (class doc).
        if (\is_array($config['modeles'])) {
            foreach ($config['modeles'] as $id => $modele) {
                if (\is_array($modele)) {
                    unset($config['modeles'][$id]['etages']);
                }
            }
        }

        return $config;
    }

    /**
     * Marks another provider's model whose worst case fell short — a call's
     * real cost beyond its reserve, which the instance paid (ADR-012 §6):
     * with the caps its grid entry has now, the largest excess, its calls
     * so marked and since when. The mark holds as long as those caps stay as
     * they are (pireCasInsuffisants()): the administrator mends them, it
     * lapses. An Anthropic model is never marked: its worst case bounds its
     * real cost at its sending's price (an excess there is a price changed
     * meanwhile). Marks that no longer hold go at the next write.
     *
     * @param int $excedent the largest excess of these calls, in micro-USD
     * @param int $appels the calls whose real cost went beyond their reserve
     */
    public function marquerPireCasInsuffisant(string $cle, int $excedent, int $appels = 1): void
    {
        $config = $this->read();
        $entree = $config['modeles'][$cle] ?? null;
        if (!str_contains($cle, ':') || !\is_array($entree)) {
            return;
        }
        $marques = self::marquesActives($config, $this->settings->get(self::PIRE_CAS_KEY) ?? []);
        $avant = $marques[$cle] ?? null;
        $marques[$cle] = [
            'plafond_sortie' => $entree['plafond_sortie'] ?? null,
            'plafond_reflexion' => $entree['plafond_reflexion'] ?? null,
            'excedent_max_microusd' => max($excedent, (int) ($avant['excedent_max_microusd'] ?? 0)),
            'appels' => (int) ($avant['appels'] ?? 0) + $appels,
            'depuis' => $avant['depuis'] ?? gmdate('Y-m-d\TH:i:s\Z'),
        ];
        ksort($marques, SORT_STRING);
        $this->settings->set(self::PIRE_CAS_KEY, $marques);
    }

    /**
     * The marks that hold (marquerPireCasInsuffisant()): their model still
     * in the grid, its caps those of the mark — for the administrator's page,
     * and refused at launch (ProfilPolicy::admettreAuLancement()).
     *
     * @return array<string, array{plafond_sortie: int|null, plafond_reflexion: int|null,
     *                             excedent_max_microusd: int, appels: int, depuis: string}>
     */
    public function pireCasInsuffisants(): array
    {
        return self::marquesActives($this->read(), $this->settings->get(self::PIRE_CAS_KEY) ?? []);
    }

    /**
     * @param array<string, mixed> $config Twin9Config::read()
     * @param array<string, mixed> $marques as stored
     * @return array<string, array<string, mixed>>
     */
    private static function marquesActives(array $config, array $marques): array
    {
        return array_filter($marques, static function (mixed $marque, string|int $cle) use ($config): bool {
            $entree = $config['modeles'][$cle] ?? null;

            return \is_array($marque) && \is_array($entree)
                && ($marque['plafond_sortie'] ?? null) === ($entree['plafond_sortie'] ?? null)
                && ($marque['plafond_reflexion'] ?? null) === ($entree['plafond_reflexion'] ?? null);
        }, ARRAY_FILTER_USE_BOTH);
    }

    /**
     * Validate and persist a partial update (unknown keys rejected, bounds
     * enforced — Twin9Exception 422 in French on any violation).
     *
     * @param array<string, mixed> $partial
     * @return array<string, mixed> the new effective configuration
     */
    public function update(array $partial): array
    {
        $known = self::defaults();
        foreach (array_keys($partial) as $key) {
            if (!\array_key_exists($key, $known)) {
                throw new Twin9Exception('Clé de configuration inconnue : ' . (string) $key, 422);
            }
        }

        $next = array_merge($this->read(), $partial);
        self::validate($next);
        $this->settings->set(self::SETTING_KEY, $next);

        return $next;
    }

    /**
     * The stored referentiel structure /meta serves the open cartography
     * (Twin6), or [] if none imported yet. Shape: [{num:int, nom:string,
     * competences:[{code, nom}]}], as many poles as the import gave.
     *
     * @return list<array<string, mixed>>
     */
    public function referentiel(): array
    {
        $stored = $this->settings->get(self::REFERENTIEL_KEY);

        return \is_array($stored) && isset($stored['poles']) && \is_array($stored['poles'])
            ? $stored['poles']
            : [];
    }

    /**
     * Store the referentiel structure (import only). Keeps ONLY the non-secret
     * structure — num/nom of poles, code/nom of competences — dropping anything
     * else (a fiche's body would be confidential and is never needed here).
     *
     * @param list<array<string, mixed>> $poles
     */
    public function setReferentiel(array $poles): void
    {
        $clean = [];
        foreach ($poles as $p) {
            if (!\is_array($p)) {
                continue;
            }
            $comps = [];
            foreach ((array) ($p['competences'] ?? []) as $c) {
                if (\is_array($c) && isset($c['code'], $c['nom'])) {
                    $comps[] = ['code' => (string) $c['code'], 'nom' => (string) $c['nom']];
                }
            }
            $clean[] = [
                'num' => (int) ($p['num'] ?? 0),
                'nom' => (string) ($p['nom'] ?? ''),
                'competences' => $comps,
            ];
        }
        $this->settings->set(self::REFERENTIEL_KEY, ['poles' => $clean]);
    }

    /** Contribution margin for a protocole: twin6 → marge_twin6, else twin9 marge. */
    public function marge(string $protocole = 'twin9'): float
    {
        $config = $this->read();

        return $protocole === 'twin6'
            ? (float) $config['marge_twin6']
            : (float) $config['marge'];
    }

    /**
     * The providers a run may reach on this instance (ADR-012).
     *
     * @return list<string>
     */
    public function fournisseursActifs(): array
    {
        return Fournisseurs::actifs($this->read());
    }

    /** The Twin9 runs a tick advances at most (ADR-011 §2). */
    public function runsParTick(): int
    {
        return (int) $this->read()['runs_par_tick'];
    }

    /** The length of a tick's slice, in seconds (45 at most). */
    public function secondesParTranche(): int
    {
        return (int) $this->read()['secondes_par_tranche'];
    }

    /**
     * Keeps the length of the slices the external trigger asks (its
     * budgetSeconds: cron-job.org's 25 s, docs/deploiement.md), written
     * only when it changes: a launch is measured on the shortest slice the
     * instance serves (secondesServies()).
     */
    public function noterTrancheDuDeclencheur(int $secondes): void
    {
        if ($this->secondesDeclencheur() !== $secondes) {
            $this->settings->set(self::DECLENCHEUR_KEY, ['secondes' => $secondes, 'at' => gmdate('Y-m-d\TH:i:s\Z')]);
        }
    }

    /** The slices the external trigger last asked, in seconds; null before it ran. */
    public function secondesDeclencheur(): ?int
    {
        $declencheur = $this->settings->get(self::DECLENCHEUR_KEY);

        return \is_int($declencheur['secondes'] ?? null) ? $declencheur['secondes'] : null;
    }

    /**
     * The shortest slice the instance serves, in seconds: its own
     * (secondes_par_tranche, a run's page's), or its trigger's if shorter.
     */
    public function secondesServies(): int
    {
        return min($this->secondesParTranche(), $this->secondesDeclencheur() ?? PHP_INT_MAX);
    }

    /** @return list<array{montant_usd: float|int, libelle: string}> */
    public function packs(): array
    {
        return $this->read()['packs'];
    }

    /** @return array<string, array{prix_usd_mtok: array{float|int, float|int}, palier_long?: array<string, mixed>}> */
    public function modeles(): array
    {
        return $this->read()['modeles'];
    }

    /**
     * Charged price of one model in MICRO-USD per token [in, out] — list
     * price × margin, the number the CreditService debits with (T3b).
     * Null for a model absent from the offer.
     *
     * @return array{int, int}|null
     */
    public function prixMicrousdParToken(string $modelId): ?array
    {
        $config = $this->read();
        $modele = $config['modeles'][$modelId] ?? null;
        if (!\is_array($modele)) {
            return null;
        }
        [$in, $out] = $modele['prix_usd_mtok'];
        $marge = (float) $config['marge'];

        // USD per Mtok -> micro-USD per token: ×1e6 (micro) / 1e6 (Mtok) = ×1.
        return [
            (int) ceil((float) $in * $marge),
            (int) ceil((float) $out * $marge),
        ];
    }

    /**
     * REAL charged cost of one call in micro-USD (ADR-010 §3): real token
     * counts × list price × margin, each component rounded UP to the
     * micro-USD (never in the user's favour, never more than 2 micro-USD
     * above the exact figure — unlike prixMicrousdParToken(), which rounds
     * per token and would overbill fractional prices by up to 33 %).
     * USD/Mtok × tokens = micro-USD exactly (1e6/1e6). Null: unknown model.
     * A call made in a batch costs half (the Message Batches API's price, T8);
     * a prompt over a model's long prompt tier is billed at that tier's price
     * (T10); without the margin, the cost is Anthropic's (a run on its owner's
     * key, T10).
     */
    public function coutMicrousd(string $modelId, int $tokensIn, int $tokensOut, string $protocole = 'twin9',
                                 bool $parLots = false, bool $avecMarge = true): ?int
    {
        return self::cout($this->read(), $modelId, $tokensIn, $tokensOut, $protocole, $parLots, $avecMarge);
    }

    /**
     * coutMicrousd() on a configuration already read (read()): many costs for
     * one query, as an admission computes them (T8).
     *
     * @param array<string, mixed> $config
     */
    public static function cout(array $config, string $modelId, int $tokensIn, int $tokensOut, string $protocole = 'twin9',
                                bool $parLots = false, bool $avecMarge = true): ?int
    {
        $modele = $config['modeles'][$modelId] ?? null;
        if (!\is_array($modele)) {
            return null;
        }
        $palier = $modele['palier_long'] ?? null;
        [$in, $out] = \is_array($palier) && $tokensIn > (int) $palier['au_dela_de']
            ? $palier['prix_usd_mtok'] : $modele['prix_usd_mtok'];
        $marge = !$avecMarge ? 1.0
            : ($protocole === 'twin6' ? (float) $config['marge_twin6'] : (float) $config['marge']);
        $part = $parLots ? 0.5 : 1.0;

        return (int) ceil($tokensIn * (float) $in * $part * $marge)
            + (int) ceil($tokensOut * (float) $out * $part * $marge);
    }

    /**
     * LOW pre-call estimate in micro-USD for the balance pre-check (T3b):
     * prompt tokens estimated at chars/4 × input price × margin, rounded
     * DOWN (a low bound by design — the REAL debit happens after the call,
     * this figure only refuses obviously unfunded calls). Null: unknown model.
     */
    public function estimationBasseMicrousd(string $modelId, int $promptChars): ?int
    {
        $config = $this->read();
        $modele = $config['modeles'][$modelId] ?? null;
        if (!\is_array($modele)) {
            return null;
        }
        [$in] = $modele['prix_usd_mtok'];

        return (int) floor(intdiv($promptChars, 4) * (float) $in * (float) $config['marge']);
    }

    /**
     * WORST-CASE reservation in micro-USD, held atomically BEFORE the call
     * (security review finding A — closes the balance race + unbounded
     * overdraft). Over-estimates BOTH sides so the real cost can ONLY be lower,
     * which makes the post-call reconciliation a pure REFUND (never a further
     * debit that could drive the balance negative — 2026-07-15 review):
     *   - input tokens = prompt BYTE length. A BPE tokenizer never emits more
     *     tokens than there are UTF-8 bytes (worst case = 1-token-per-byte
     *     fallback), so bytes is a HARD upper bound on real input_tokens —
     *     unlike the former ceil(chars/3), which dense/multibyte prompts could
     *     exceed and thus overdraw on reconciliation.
     *   - output tokens = max_tokens (the full ceiling the model may emit).
     * The route debits this conditionally (no overdraft → 402 if the balance
     * can't cover it), then reconciles down to the real cost after the call.
     * Null: unknown model.
     */
    public function reserveMicrousd(string $modelId, int $promptBytes, int $maxTokens, string $protocole = 'twin9'): ?int
    {
        return $this->coutMicrousd($modelId, max(0, $promptBytes), max(0, $maxTokens), $protocole);
    }

    /**
     * The PUBLIC shape for the front (ADR-010 §3), as /meta serves it to the
     * credit page and the open cartography: the Twin6 prices WITH margin
     * applied, packs, PayPal availability. Neither the raw list prices nor the
     * margin itself ever leave the admin view. The Twin9 offer and the
     * pipeline's settings left it with the browser's engine (T11), the
     * promotion's state on 2026-10-20 (no view read it).
     *
     * @return array<string, mixed>
     */
    public function publicView(): array
    {
        $config = $this->read();
        $margeTwin6 = (float) $config['marge_twin6'];
        $modelesTwin6 = [];
        foreach ($config['modeles'] as $modelId => $modele) {
            if (str_contains((string) $modelId, ':')) {
                continue; // another provider's (ADR-012): Twin9's alone, never the open cartography's
            }
            [$in, $out] = $modele['prix_usd_mtok'];
            // Twin6 (open cartography) prices at its own +10 % contribution.
            $modelesTwin6[$modelId] = [round((float) $in * $margeTwin6, 4), round((float) $out * $margeTwin6, 4)];
        }

        return [
            'paypalConfigured' => Env::get('PAYPAL_CLIENT_ID') !== '',
            'packs' => $config['packs'],
            'modeles_twin6' => $modelesTwin6,
        ];
    }

    /** @param array<string, mixed> $config */
    private static function validate(array $config): void
    {
        foreach (['marge' => 'Marge', 'marge_twin6' => 'Marge Twin6'] as $key => $label) {
            $m = $config[$key];
            if (!\is_int($m) && !\is_float($m)) {
                throw new Twin9Exception($label . ' invalide : nombre attendu', 422);
            }
            if ((float) $m < self::MARGE_MIN || (float) $m > self::MARGE_MAX) {
                throw new Twin9Exception($label . ' hors bornes (entre 1 et 5)', 422);
            }
        }
        if (!\is_array($config['packs']) || $config['packs'] === [] || !array_is_list($config['packs'])) {
            throw new Twin9Exception('Packs invalides : liste non vide attendue', 422);
        }
        foreach ($config['packs'] as $pack) {
            $montant = \is_array($pack) ? ($pack['montant_usd'] ?? null) : null;
            $libelle = \is_array($pack) ? ($pack['libelle'] ?? null) : null;
            if ((!\is_int($montant) && !\is_float($montant))
                || (float) $montant < self::PACK_MIN_USD || (float) $montant > self::PACK_MAX_USD) {
                throw new Twin9Exception('Pack hors bornes : montant entre 1 et 100 USD', 422);
            }
            if (!\is_string($libelle) || trim($libelle) === '') {
                throw new Twin9Exception('Pack invalide : libellé requis', 422);
            }
        }

        if (!\is_array($config['modeles']) || $config['modeles'] === []) {
            throw new Twin9Exception('Modèles invalides : au moins un modèle requis', 422);
        }
        foreach ($config['modeles'] as $modelId => $modele) {
            if (!\is_string($modelId) || trim($modelId) === '' || !\is_array($modele)) {
                throw new Twin9Exception('Modèle invalide', 422);
            }
            $prix = $modele['prix_usd_mtok'] ?? null;
            if (!\is_array($prix) || \count($prix) !== 2 || !array_is_list($prix)) {
                throw new Twin9Exception('Prix invalide : [entrée, sortie] attendu', 422);
            }
            foreach ($prix as $p) {
                if ((!\is_int($p) && !\is_float($p)) || (float) $p <= 0) {
                    throw new Twin9Exception('Prix invalide : nombre strictement positif attendu', 422);
                }
            }
            $tiers = str_contains($modelId, ':');
            $reserves = $tiers ? [] : array_values(array_intersect(array_keys($modele), self::CHAMPS_TIERS));
            if ($reserves !== []) {
                throw new Twin9Exception('Modèle ' . $modelId . ' : ' . implode(', ', $reserves)
                    . ' ne vaut que pour le modèle d’un autre fournisseur (clé fournisseur:modèle)', 422);
            }
            $inconnues = array_diff(array_keys($modele),
                ['prix_usd_mtok', 'palier_long', ...($tiers ? self::CHAMPS_TIERS : [])]);
            if ($inconnues !== []) {
                throw new Twin9Exception('Modèle ' . $modelId . ' : ' . (\count($inconnues) === 1 ? 'clé inconnue ' : 'clés inconnues ')
                    . implode(', ', $inconnues), 422);
            }
            if (\array_key_exists('palier_long', $modele)) {
                $palier = $modele['palier_long'];
                $seuil = \is_array($palier) ? ($palier['au_dela_de'] ?? null) : null;
                $prixLong = \is_array($palier) ? ($palier['prix_usd_mtok'] ?? null) : null;
                if (!\is_int($seuil) || $seuil <= 0 || !\is_array($prixLong) || \count($prixLong) !== 2
                    || !array_is_list($prixLong)
                    || array_filter($prixLong, static fn ($p): bool => (!\is_int($p) && !\is_float($p)) || (float) $p <= 0)
                        !== []) {
                    throw new Twin9Exception('Palier des longs prompts invalide : {au_dela_de, prix_usd_mtok} attendu',
                        422);
                }
            }
            if ($tiers) {
                self::validerTiers($modelId, $modele);
            }
        }

        $runs = $config['runs_par_tick'];
        if (!\is_int($runs) || $runs < 1 || $runs > 20) {
            throw new Twin9Exception('Runs par tick hors bornes (1 à 20)', 422);
        }
        $secondes = $config['secondes_par_tranche'];
        if (!\is_int($secondes) || $secondes < 5 || $secondes > 45) {
            throw new Twin9Exception('Durée de tranche hors bornes (5 à 45 secondes)', 422);
        }

        if (!\is_bool($config['twin9_fournisseurs_non_rgpd'])) {
            throw new Twin9Exception('Champ twin9_fournisseurs_non_rgpd invalide : booléen attendu', 422);
        }
        $ouverts = $config['twin9_fournisseurs_ouverts'];
        if (!\is_array($ouverts) || !array_is_list($ouverts)) {
            throw new Twin9Exception('Fournisseurs ouverts invalides : liste d’identifiants attendue', 422);
        }
        foreach ($ouverts as $i => $id) {
            if (!\is_string($id) || !Fournisseurs::connu($id)) {
                throw new Twin9Exception('Fournisseurs ouverts invalides : fournisseur inconnu', 422);
            }
            if (array_search($id, $ouverts, true) !== $i) {
                throw new Twin9Exception('Fournisseurs ouverts invalides : ' . $id . ' figure deux fois', 422);
            }
            if (Fournisseurs::REGISTRE[$id]['rgpd'] === 'non' && $config['twin9_fournisseurs_non_rgpd'] !== true) {
                throw new Twin9Exception('Fournisseurs ouverts invalides : ' . Fournisseurs::REGISTRE[$id]['libelle']
                    . ', étiqueté « non » au regard du RGPD, ne s’ouvre que si twin9_fournisseurs_non_rgpd l’est aussi',
                    422);
            }
        }
    }

    /**
     * Another provider's model entry (ADR-012 §6): its key « provider:model »,
     * a known provider other than Anthropic and a model of its pattern; its
     * caps; its reasoning setting where the provider has one.
     *
     * @param array<string, mixed> $modele
     */
    private static function validerTiers(string $cle, array $modele): void
    {
        [$fournisseur, $id] = Fournisseurs::depuisClePrix($cle);
        if ($fournisseur === Fournisseurs::DEFAUT
            || preg_match(Fournisseurs::REGISTRE[$fournisseur]['motif_modele'], $id) !== 1) {
            throw new Twin9Exception('Modèle ' . $cle . ' invalide : fournisseur:modèle attendu, un fournisseur autre '
                . 'qu’Anthropic et un modèle qui suit son motif', 422);
        }
        $sortie = $modele['plafond_sortie'] ?? null;
        if (!\is_int($sortie) || $sortie <= 0) {
            throw new Twin9Exception('Modèle ' . $cle . ' : plafond_sortie requis, entier strictement positif', 422);
        }
        if ($fournisseur === 'google' && $sortie > self::SORTIE_MAX_GEMINI) {
            throw new Twin9Exception('Modèle ' . $cle . ' : plafond_sortie de 32768 au plus (requête non streamée '
                . 'de Gemini)', 422);
        }
        $reflexion = $modele['plafond_reflexion'] ?? null;
        if (!\is_int($reflexion) || $reflexion < 0) {
            throw new Twin9Exception('Modèle ' . $cle . ' : plafond_reflexion requis, entier positif ou nul', 422);
        }
        if ($fournisseur === 'xai' && $reflexion === 0) {
            throw new Twin9Exception('Modèle ' . $cle . ' : plafond_reflexion strictement positif chez xAI, dont le '
                . 'raisonnement ne se coupe pas et sort du plafond de sortie', 422);
        }
        $duree = $modele['duree_max_s'] ?? null;
        if (!\is_int($duree) || $duree < 1 || $duree > 45) {
            throw new Twin9Exception('Modèle ' . $cle . ' : duree_max_s requise, de 1 à 45 secondes', 422);
        }
        if (\array_key_exists('reflexion_param', $modele)) {
            $admis = self::REFLEXION_PARAMS[$fournisseur] ?? null;
            if ($admis === null) {
                throw new Twin9Exception('Modèle ' . $cle . ' : reflexion_param ne se règle que chez OpenAI et Google',
                    422);
            }
            if (!\in_array($modele['reflexion_param'], $admis, true)) {
                throw new Twin9Exception('Modèle ' . $cle . ' : reflexion_param parmi ' . implode(', ', $admis), 422);
            }
        }
    }
}
