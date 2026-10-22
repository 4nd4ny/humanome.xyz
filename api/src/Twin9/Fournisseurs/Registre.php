<?php

declare(strict_types=1);

namespace Humanome\Twin9\Fournisseurs;

/**
 * The caller of each provider (ADR-012 §4): built from Fournisseurs::REGISTRE
 * by its format — Anthropic's, Chat Completions (OpenAI, Mistral AI, xAI,
 * OpenRouter), Gemini — or given (tests).
 *
 * A call's provider is decided once, by its settings (CallSettings::pour(),
 * `fournisseur`): the slice reads its key for it (RunKey::pour(), the
 * registry's variable of that provider), DirectCalls sends it with the
 * caller registered for it, at the registry's address of that provider —
 * never another's, which DirectCalls checks before anything leaves.
 */
final class Registre
{
    /** @var array<string, Appelant> by provider */
    private readonly array $appelants;

    /** @param array<string, Appelant>|null $appelants by provider; null: one for each provider of the registry */
    public function __construct(?array $appelants = null)
    {
        $appelants ??= self::parDefaut();
        foreach ($appelants as $fournisseur => $appelant) {
            if (!Fournisseurs::connu((string) $fournisseur) || $appelant->fournisseur() !== $fournisseur) {
                throw new \InvalidArgumentException('Appelant mal rangé : ' . $fournisseur);
            }
        }
        $this->appelants = $appelants;
    }

    /** @throws \DomainException for a provider without a caller */
    public function appelant(string $fournisseur): Appelant
    {
        return $this->appelants[$fournisseur]
            ?? throw new \DomainException('Aucun appelant pour le fournisseur ' . $fournisseur);
    }

    /** @return array<string, Appelant> */
    private static function parDefaut(): array
    {
        $appelants = [];
        foreach (Fournisseurs::REGISTRE as $id => $fournisseur) {
            $appelants[$id] = match ($fournisseur['format']) {
                'anthropic' => new AnthropicAppelant(),
                'chat' => new ChatCompletionsAppelant($id),
                'gemini' => new GeminiAppelant(),
            };
        }

        return $appelants;
    }
}
