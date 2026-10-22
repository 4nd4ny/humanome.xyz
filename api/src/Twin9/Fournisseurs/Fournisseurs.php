<?php

declare(strict_types=1);

namespace Humanome\Twin9\Fournisseurs;

/**
 * The providers a Twin9 call may be sent to (P1-5), and what the platform
 * knows of each: its label, its GDPR tag (not a legal opinion: the platform
 * comparison's research of July 2026), whether it has a batch lane here, the
 * environment variable of the instance's key, its LOCKED endpoint (ADR-010
 * §2: no parameter, no environment override, no admin setting), the format
 * of its API, the pattern of its model ids (80 characters at most: the
 * journal's columns) and the input tokens it may add to a prompt's.
 *
 * Only Anthropic is open (actifs()): no other provider is wired to a caller
 * yet, and a call of a profile always goes to Anthropic (CallSettings).
 */
final class Fournisseurs
{
    /** The provider of a stage, a step or a reader that names none. */
    public const DEFAUT = 'anthropic';

    /** The providers open on this instance: Anthropic alone, until the other callers are wired. */
    private const OUVERTS = ['anthropic'];

    public const REGISTRE = [
        'anthropic' => [
            'libelle' => 'Anthropic', 'rgpd' => 'sous_conditions', 'lots' => true, 'env' => 'ANTHROPIC_API_KEY',
            'url' => 'https://api.anthropic.com/v1/messages', 'format' => 'anthropic',
            'motif_modele' => '/^claude-[a-z0-9][a-z0-9.-]{0,72}$/', 'surcout_entree' => 0,
        ],
        'openai' => [
            'libelle' => 'OpenAI', 'rgpd' => 'sous_conditions', 'lots' => false, 'env' => 'OPENAI_API_KEY',
            'url' => 'https://api.openai.com/v1/chat/completions', 'format' => 'chat',
            'motif_modele' => '/^(?!claude-)[a-z0-9][a-z0-9._-]{0,79}$/', 'surcout_entree' => 64,
        ],
        'mistral' => [
            'libelle' => 'Mistral AI', 'rgpd' => 'oui', 'lots' => false, 'env' => 'MISTRAL_API_KEY',
            'url' => 'https://api.mistral.ai/v1/chat/completions', 'format' => 'chat',
            'motif_modele' => '/^(?!claude-)[a-z0-9][a-z0-9._-]{0,79}$/', 'surcout_entree' => 64,
        ],
        // the model is in the path (…/models/{model}:generateContent): neither « / » nor « : » in its id
        'google' => [
            'libelle' => 'Google (Gemini)', 'rgpd' => 'non', 'lots' => false, 'env' => 'GOOGLE_API_KEY',
            'url' => 'https://generativelanguage.googleapis.com/v1beta/models/', 'format' => 'gemini',
            'motif_modele' => '/^[a-z0-9][a-z0-9.-]{0,79}$/', 'surcout_entree' => 64,
        ],
        'xai' => [
            'libelle' => 'xAI (Grok)', 'rgpd' => 'non', 'lots' => false, 'env' => 'XAI_API_KEY',
            'url' => 'https://api.x.ai/v1/chat/completions', 'format' => 'chat',
            'motif_modele' => '/^(?!claude-)[a-z0-9][a-z0-9._-]{0,79}$/', 'surcout_entree' => 64,
        ],
        // a slug « vendor/model », without a catalogue suffix (« :free », « :online »…): never a fallback
        'openrouter' => [
            'libelle' => 'OpenRouter', 'rgpd' => 'non', 'lots' => false, 'env' => 'OPENROUTER_API_KEY',
            'url' => 'https://openrouter.ai/api/v1/chat/completions', 'format' => 'chat',
            'motif_modele' => '/^(?=.{3,80}$)[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/', 'surcout_entree' => 64,
        ],
    ];

    /**
     * The providers a profile may use on this instance.
     *
     * @return list<string>
     */
    public static function actifs(): array
    {
        return self::OUVERTS;
    }

    /** Whether the platform knows this provider. */
    public static function connu(string $fournisseur): bool
    {
        return isset(self::REGISTRE[$fournisseur]);
    }

    /** The key of a model in the price grid (Twin9Config::modeles()): Anthropic's bare, « provider:model » otherwise. */
    public static function clePrix(string $fournisseur, string $modele): string
    {
        return $fournisseur === self::DEFAUT ? $modele : $fournisseur . ':' . $modele;
    }

    /**
     * The provider and the model of a key of the price grid, cut at its
     * first « : » only when what precedes it is another provider's id; a
     * bare key is Anthropic's.
     *
     * @return array{0: string, 1: string}
     */
    public static function depuisClePrix(string $cle): array
    {
        $deux = explode(':', $cle, 2);
        if (\count($deux) === 2 && $deux[0] !== self::DEFAUT && self::connu($deux[0])) {
            return [$deux[0], $deux[1]];
        }

        return [self::DEFAUT, $cle];
    }

    /** A reader's family when its profile names none: OpenRouter's vendor (the slug's prefix), else the provider. */
    public static function familleDefaut(string $fournisseur, string $modele): string
    {
        if ($fournisseur === 'openrouter' && str_contains($modele, '/')) {
            return explode('/', $modele, 2)[0];
        }

        return $fournisseur;
    }
}
