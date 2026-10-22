<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\Twin9\AnthropicCaller;
use Humanome\Twin9\CallSettings;
use Humanome\Twin9\Fournisseurs\Fournisseurs;
use Humanome\Twin9\ProfilRepository;
use PHPUnit\Framework\TestCase;

/**
 * The providers' registry (P1-5): six providers known, Anthropic alone open
 * and alone with a batch lane, each with its locked endpoint, its key's
 * variable and its GDPR tag; the price grid's keys, bare for Anthropic,
 * « provider:model » otherwise.
 */
final class FournisseursTest extends TestCase
{
    public function testSixProvidersAreKnownAndAnthropicAloneIsOpen(): void
    {
        self::assertSame(['anthropic', 'openai', 'mistral', 'google', 'xai', 'openrouter'],
            array_keys(Fournisseurs::REGISTRE));
        self::assertSame(['anthropic'], Fournisseurs::actifs());
        self::assertSame('anthropic', Fournisseurs::DEFAUT);
        self::assertSame(['anthropic'], array_keys(array_filter(Fournisseurs::REGISTRE,
            static fn (array $f): bool => $f['lots'])), 'les lots : Anthropic seul');
        self::assertTrue(Fournisseurs::connu('mistral'));
        self::assertFalse(Fournisseurs::connu('ollama'), 'Twin6 seulement');

        foreach (Fournisseurs::REGISTRE as $id => $f) {
            self::assertSame(['libelle', 'rgpd', 'lots', 'env', 'url', 'format', 'motif_modele', 'surcout_entree'],
                array_keys($f), $id);
            self::assertContains($f['format'], ['anthropic', 'chat', 'gemini'], $id);
            self::assertSame(strtoupper($id) . '_API_KEY', $f['env']);
            self::assertStringStartsWith('https://', $f['url'], $id);
            self::assertSame('', (string) parse_url($f['url'], PHP_URL_QUERY), 'jamais une clé dans l’URL');
        }
        self::assertSame(['anthropic' => 'sous_conditions', 'openai' => 'sous_conditions', 'mistral' => 'oui',
                          'google' => 'non', 'xai' => 'non', 'openrouter' => 'non'],
            array_map(static fn (array $f): string => $f['rgpd'], Fournisseurs::REGISTRE));
    }

    public function testTheAnthropicEndpointIsTheCallersLockedOne(): void
    {
        self::assertSame(AnthropicCaller::BASE_URL . '/v1/messages',
            Fournisseurs::REGISTRE['anthropic']['url']);
    }

    /** Each model id of the v9.8 profile is an Anthropic one; the patterns cap ids at 80 characters (the journal's). */
    public function testTheModelPatterns(): void
    {
        $motif = static fn (string $f): string => Fournisseurs::REGISTRE[$f]['motif_modele'];
        foreach ((new CallSettings(ProfilRepository::validate(ProfilRepository::v98())))->combinaisons() as $r) {
            self::assertMatchesRegularExpression($motif('anthropic'), $r['modele']);
        }
        self::assertDoesNotMatchRegularExpression($motif('anthropic'), 'claude-' . str_repeat('a', 74));
        self::assertMatchesRegularExpression($motif('anthropic'), 'claude-' . str_repeat('a', 73));
        self::assertDoesNotMatchRegularExpression($motif('openai'), 'claude-sonnet-5-5', 'un modèle Claude ailleurs');
        self::assertMatchesRegularExpression($motif('mistral'), 'modele-fictif-1.0');
        self::assertDoesNotMatchRegularExpression($motif('google'), 'modele/fictif', 'le modèle est dans le chemin');
        self::assertDoesNotMatchRegularExpression($motif('google'), 'modele:fictif');
        self::assertMatchesRegularExpression($motif('openrouter'), 'editeur/modele-fictif');
        self::assertDoesNotMatchRegularExpression($motif('openrouter'), 'editeur/modele-fictif:free', 'aucun suffixe');
        self::assertDoesNotMatchRegularExpression($motif('openrouter'), 'modele-fictif', 'un slug éditeur/modèle');
        self::assertDoesNotMatchRegularExpression($motif('openrouter'), 'e/' . str_repeat('m', 79));
    }

    public function testThePriceKeys(): void
    {
        self::assertSame('claude-haiku-5-5', Fournisseurs::clePrix('anthropic', 'claude-haiku-5-5'));
        self::assertSame('openai:modele-fictif', Fournisseurs::clePrix('openai', 'modele-fictif'));
        self::assertSame(['anthropic', 'claude-haiku-5-5'], Fournisseurs::depuisClePrix('claude-haiku-5-5'));
        self::assertSame(['openai', 'modele-fictif'], Fournisseurs::depuisClePrix('openai:modele-fictif'));
        self::assertSame(['openrouter', 'editeur/modele:variante'],
            Fournisseurs::depuisClePrix('openrouter:editeur/modele:variante'), 'au premier « : » seulement');
        self::assertSame(['anthropic', 'inconnu:modele'], Fournisseurs::depuisClePrix('inconnu:modele'));
        self::assertSame(['anthropic', 'anthropic:modele'], Fournisseurs::depuisClePrix('anthropic:modele'),
            'Anthropic n’a pas de préfixe');
        foreach (['anthropic' => 'claude-haiku-5-5', 'mistral' => 'modele-fictif', 'openrouter' => 'editeur/modele']
                 as $f => $m) {
            self::assertSame([$f, $m], Fournisseurs::depuisClePrix(Fournisseurs::clePrix($f, $m)));
        }
    }

    public function testTheDefaultFamily(): void
    {
        self::assertSame('anthropic', Fournisseurs::familleDefaut('anthropic', 'claude-haiku-5-5'));
        self::assertSame('mistral', Fournisseurs::familleDefaut('mistral', 'modele-fictif'));
        self::assertSame('editeur', Fournisseurs::familleDefaut('openrouter', 'editeur/modele-fictif'),
            'l’éditeur du slug');
        self::assertSame('openrouter', Fournisseurs::familleDefaut('openrouter', 'sans-editeur'));
    }
}
