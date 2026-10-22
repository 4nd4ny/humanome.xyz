<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\Llm\HttpClientException;
use Humanome\Llm\MockMultiHttpClient;
use Humanome\Twin9\AnthropicCaller;
use Humanome\Twin9\CallSettings;
use Humanome\Twin9\Fournisseurs\AnthropicAppelant;
use Humanome\Twin9\Fournisseurs\Appelant;
use Humanome\Twin9\Fournisseurs\Arret;
use Humanome\Twin9\Fournisseurs\ChatCompletionsAppelant;
use Humanome\Twin9\Fournisseurs\Fournisseurs;
use Humanome\Twin9\Fournisseurs\GeminiAppelant;
use Humanome\Twin9\Fournisseurs\Registre;
use Humanome\Twin9\ProfilRepository;
use Humanome\Twin9\Twin9Config;
use PHPUnit\Framework\TestCase;

/**
 * The providers' registry (P1-5): six providers known, Anthropic alone open
 * by default and alone with a batch lane, each with its locked endpoint, its
 * key's variable and its GDPR tag; the providers the instance opened; the
 * price grid's keys, bare for Anthropic, « provider:model » otherwise.
 *
 * Their callers (ADR-012 §4), without network nor database: each request at
 * its provider's locked address, the key in a header only, with the
 * parameters each provider must get (store: false, data_collection: deny,
 * an unsampled traceparent…); each response read in one vocabulary, a cut
 * or an unknown stop a failure, and nothing the provider writes in an
 * outcome (the canary). The stops' tables are the shared fixture's.
 */
final class FournisseursTest extends TestCase
{
    public function testSixProvidersAreKnownAndAnthropicAloneIsOpenByDefault(): void
    {
        self::assertSame(['anthropic', 'openai', 'mistral', 'google', 'xai', 'openrouter'],
            array_keys(Fournisseurs::REGISTRE));
        self::assertSame(['anthropic'], Fournisseurs::actifs(Twin9Config::defaults()));
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

    /**
     * The providers open are the instance's setting, in the registry's
     * order; one tagged « non » only while its switch is on, whatever is
     * stored; an unknown id never (ADR-012).
     */
    public function testTheProvidersOpenAreTheInstancesSetting(): void
    {
        $config = static fn (array $ouverts, bool $nonRgpd): array => ['twin9_fournisseurs_ouverts' => $ouverts,
                                                                         'twin9_fournisseurs_non_rgpd' => $nonRgpd];

        self::assertSame(['anthropic', 'mistral'], Fournisseurs::actifs($config(['mistral', 'anthropic'], false)));
        self::assertSame(['anthropic', 'mistral'], Fournisseurs::actifs($config(['google', 'mistral', 'anthropic'], false)),
            'Google, étiqueté « non », reste fermé tant que l’interrupteur l’est');
        self::assertSame(['anthropic', 'mistral', 'google'],
            Fournisseurs::actifs($config(['google', 'mistral', 'anthropic'], true)));
        self::assertSame(['openai'], Fournisseurs::actifs($config(['openai', 'ollama'], true)), 'Twin6 seulement');
        self::assertSame([], Fournisseurs::actifs($config([], true)), 'Anthropic aussi se ferme');
        self::assertSame([], Fournisseurs::actifs([]));
        self::assertSame([], Fournisseurs::actifs(['twin9_fournisseurs_ouverts' => 'anthropic']));
    }

    /** The profile's providers are the registry's. */
    public function testTheProfileSchemaKnowsTheRegistrysProviders(): void
    {
        $schema = json_decode((string) file_get_contents(\dirname(__DIR__, 3) . '/schemas/twin9-profil.schema.json'),
            true, 512, JSON_THROW_ON_ERROR);

        self::assertSame(array_keys(Fournisseurs::REGISTRE), $schema['$defs']['fournisseur']['enum']);
        self::assertArrayNotHasKey('default', $schema['$defs']['fournisseur'], 'absent, il s’hérite');
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
    /** The stops' tables are the shared fixture's, both ways, its edge cases included (P0-3, the engine's too). */
    public function testTheStopTablesAreTheSharedFixtures(): void
    {
        $fixture = json_decode((string) file_get_contents(\dirname(__DIR__, 3)
            . '/schemas/fixtures/arrets/arrets-fournisseurs.json'), true, 512, JSON_THROW_ON_ERROR);
        $tables = [];
        foreach ($fixture['arrets'] as $ligne) {
            $tables[$ligne['format']][$ligne['brut']] = $ligne['classe'];
        }
        self::assertSame($tables, (new \ReflectionClassConstant(Arret::class, 'TABLES'))->getValue(),
            'les mêmes valeurs brutes, les mêmes classes');
        foreach ([...$fixture['arrets'], ...$fixture['cas_limites']] as $ligne) {
            self::assertSame($ligne['classe'], Arret::classe($ligne['format'], $ligne['brut']),
                $ligne['format'] . ' ' . var_export($ligne['brut'], true));
        }
        self::assertEqualsCanonicalizing(array_keys(Fournisseurs::REGISTRE), array_keys($tables), 'une table par fournisseur');
        self::assertTrue(Arret::tronquee('google', 'CONTINUATION'), 'une réponse à continuer est coupée');
        self::assertTrue(Arret::tronquee('mistral', 'model_length'));
        self::assertFalse(Arret::tronquee('openai', 'stop'));
    }

    /** The registry's callers: one per provider, by its format; a caller never filed under another provider. */
    public function testTheRegistryGivesEachProviderItsCaller(): void
    {
        $registre = new Registre();
        foreach (Fournisseurs::REGISTRE as $id => $f) {
            $appelant = $registre->appelant($id);
            self::assertSame($id, $appelant->fournisseur());
            self::assertInstanceOf(['anthropic' => AnthropicAppelant::class, 'chat' => ChatCompletionsAppelant::class,
                                    'gemini' => GeminiAppelant::class][$f['format']], $appelant, $id);
        }
        try {
            new Registre(['openai' => new ChatCompletionsAppelant('mistral')]);
            self::fail('un appelant rangé sous un autre fournisseur');
        } catch (\InvalidArgumentException) {
        }
        try {
            new ChatCompletionsAppelant('google');
            self::fail('Gemini n’est pas un fournisseur Chat Completions');
        } catch (\InvalidArgumentException) {
        }
        $this->expectException(\DomainException::class);
        (new Registre(['anthropic' => new AnthropicAppelant()]))->appelant('openai');
    }

    /**
     * Each request goes to its provider's locked address, never with the key
     * in it, the key in its header only; it carries the prompt as the one
     * user message, the output budget in the field the provider caps it with,
     * never a temperature, a top_p, a stop.
     */
    public function testEachRequestGoesToItsLockedAddressWithTheKeyInAHeaderOnly(): void
    {
        $registre = new Registre();
        $modeles = ['anthropic' => 'claude-haiku-5-5', 'openai' => 'modele-fictif-1', 'mistral' => 'modele-fictif-2',
                    'google' => 'gemini-fictif-1', 'xai' => 'modele-fictif-3', 'openrouter' => 'editeur/modele-fictif'];
        $champs = ['anthropic' => 'max_tokens', 'openai' => 'max_completion_tokens', 'mistral' => 'max_tokens',
                   'xai' => 'max_completion_tokens', 'openrouter' => 'max_tokens'];
        foreach ($modeles as $f => $modele) {
            $cle = 'cle-' . $f . '-factice';
            $r = $registre->appelant($f)->requete($cle, self::reglage($modele), 'Le prompt.');
            self::assertStringStartsWith(Fournisseurs::REGISTRE[$f]['url'], $r['url'], $f);
            self::assertStringNotContainsString($cle, $r['url'], $f);
            self::assertNull(parse_url($r['url'], PHP_URL_QUERY), $f);
            self::assertStringNotContainsString($cle, $r['body'], $f);
            self::assertSame([['anthropic' => 'x-api-key', 'google' => 'x-goog-api-key'][$f] ?? 'authorization'],
                array_keys(array_filter($r['headers'], static fn (string $v): bool => str_contains($v, $cle))),
                "$f : la clé dans son seul en-tête");
            self::assertSame('application/json', $r['headers']['content-type'], $f);
            $corps = json_decode($r['body'], true, 64, JSON_THROW_ON_ERROR);
            foreach (['temperature', 'top_p', 'stop', 'presence_penalty', 'frequency_penalty'] as $interdit) {
                self::assertArrayNotHasKey($interdit, $corps, "$f $interdit");
            }
            if ($f !== 'google') {
                self::assertSame($modele, $corps['model'], $f);
                self::assertSame([['role' => 'user', 'content' => 'Le prompt.']], $corps['messages'], $f);
                self::assertSame(1234, $corps[$champs[$f]], $f);
            }
        }

        $anthropic = $registre->appelant('anthropic');
        $r = $anthropic->requete('sk-ant-factice', self::reglage('claude-haiku-5-5'), 'Le prompt.');
        self::assertSame(AnthropicCaller::entetes('sk-ant-factice'), array_diff_key($r['headers'], ['traceparent' => 1]),
            'les en-têtes de l’appelant actuel');
        self::assertSame(AnthropicCaller::requete('sk-ant-factice', 'claude-haiku-5-5', 'Le prompt.', 1234)['body'],
            $r['body'], 'la requête de l’appelant actuel, inchangée');
        self::assertMatchesRegularExpression('/^00-(?!0{32})[0-9a-f]{32}-(?!0{16})[0-9a-f]{16}-00$/',
            $r['headers']['traceparent'], 'une trace non échantillonnée');
        self::assertNotSame($r['headers']['traceparent'],
            $anthropic->requete('k', self::reglage('claude-haiku-5-5'), 'p')['headers']['traceparent'], 'aléatoire');

        $chat = static fn (string $f, array $reglage = []): array => json_decode($registre->appelant($f)
            ->requete('k', self::reglage('modele-fictif-1') + $reglage, 'p')['body'], true);
        self::assertSame(['authorization' => 'Bearer cle-openai-factice', 'content-type' => 'application/json'],
            $registre->appelant('openai')->requete('cle-openai-factice', self::reglage('m'), 'p')['headers']);
        self::assertFalse($chat('openai')['store'], 'OpenAI garderait la complétion');
        self::assertArrayNotHasKey('max_tokens', $chat('openai'), 'déprécié chez OpenAI');
        self::assertArrayNotHasKey('reasoning_effort', $chat('openai'), 'le défaut du modèle, sans réglage de la grille');
        self::assertSame('low', $chat('openai', ['reflexion_param' => 'low'])['reasoning_effort']);
        self::assertArrayNotHasKey('store', $chat('mistral'));
        self::assertArrayNotHasKey('reasoning_effort', $chat('xai', ['reflexion_param' => 'low']),
            'un réglage que la grille ne pose que chez OpenAI et Google');
        self::assertSame(['data_collection' => 'deny', 'allow_fallbacks' => false], $chat('openrouter')['provider'],
            'jamais un fournisseur qui garde les données, jamais un autre modèle');
        self::assertArrayNotHasKey('provider', $chat('openai'));
        self::assertArrayNotHasKey('effort', $chat('openai', ['effort' => 'high']));

        $gemini = $registre->appelant('google');
        $r = $gemini->requete('cle-google-factice', self::reglage('gemini-fictif-1.5'), 'Le prompt.');
        self::assertSame('https://generativelanguage.googleapis.com/v1beta/models/gemini-fictif-1.5:generateContent',
            $r['url']);
        self::assertSame(['x-goog-api-key' => 'cle-google-factice', 'content-type' => 'application/json'], $r['headers']);
        self::assertSame(['contents' => [['role' => 'user', 'parts' => [['text' => 'Le prompt.']]]],
                          'generationConfig' => ['maxOutputTokens' => 1234], 'store' => false],
            json_decode($r['body'], true), 'store: false l’emporte sur la journalisation du projet');
        self::assertSame(['maxOutputTokens' => 1234, 'thinkingConfig' => ['thinkingLevel' => 'LOW']],
            json_decode($gemini->requete('k', self::reglage('g') + ['reflexion_param' => 'LOW'], 'p')['body'], true)
                ['generationConfig']);
        self::assertStringEndsWith('/models/a%2Fb%3Fc:generateContent', $gemini->requete('k', self::reglage('a/b?c'), 'p')['url'],
            'le modèle encodé dans le chemin, jamais ailleurs');
    }

    /** Chat Completions, answered: the first choice's text, its usage billed, its stop classed, the model served. */
    public function testAChatCompletionIsRead(): void
    {
        $lu = (new ChatCompletionsAppelant('openai'))->lire(200, [], (string) json_encode([
            'model' => 'modele-fictif-1-2026', 'choices' => [['message' => ['role' => 'assistant', 'content' => 'un texte',
                'refusal' => null], 'finish_reason' => 'stop']],
            'usage' => ['prompt_tokens' => 12, 'completion_tokens' => 34, 'total_tokens' => 46,
                        'completion_tokens_details' => ['reasoning_tokens' => 30]],
        ]));
        self::assertSame(['ok' => true, 'texte' => 'un texte', 'tokens_in' => 12, 'tokens_out' => 34, 'stop_reason' => 'stop',
                          'arret' => 'end', 'modele_servi' => 'modele-fictif-1-2026'], $lu,
            'la réflexion comprise dans les jetons de sortie d’OpenAI');

        $xai = (new ChatCompletionsAppelant('xai'))->lire(200, [], (string) json_encode([
            'model' => 'modele-fictif-3', 'choices' => [['message' => ['content' => 'vu'], 'finish_reason' => 'end_turn']],
            'usage' => ['prompt_tokens' => 32, 'completion_tokens' => 9, 'total_tokens' => 135,
                        'completion_tokens_details' => ['reasoning_tokens' => 94]],
        ]));
        self::assertSame([true, 'end', 103], [$xai['ok'], $xai['arret'], $xai['tokens_out']],
            'chez xAI, le raisonnement hors des jetons de complétion, mais facturé');

        $mistral = (new ChatCompletionsAppelant('mistral'))->lire(200, [], (string) json_encode([
            'model' => 'modele-fictif-2', 'choices' => [['finish_reason' => 'stop', 'message' => ['content' => [
                ['type' => 'thinking', 'thinking' => [['type' => 'text', 'text' => 'à part']]],
                ['type' => 'text', 'text' => 'la '], ['type' => 'text', 'text' => 'réponse']]]]],
            'usage' => ['prompt_tokens' => 5, 'completion_tokens' => 7, 'total_tokens' => 12],
        ]));
        self::assertSame([true, 'la réponse', 7], [$mistral['ok'], $mistral['texte'], $mistral['tokens_out']],
            'les blocs de texte, jamais la réflexion');

        foreach (['openai' => 'length', 'xai' => 'length', 'mistral' => 'model_length', 'openrouter' => 'length'] as $f => $stop) {
            $lu = (new ChatCompletionsAppelant($f))->lire(200, [], (string) json_encode([
                'model' => 'm', 'choices' => [['message' => ['content' => 'un début coupé'], 'finish_reason' => $stop]],
                'usage' => ['prompt_tokens' => 5, 'completion_tokens' => 7, 'total_tokens' => 12]]));
            self::assertSame([false, true, '', 5, 7], [$lu['ok'], $lu['tronque'], $lu['texte'], $lu['tokens_in'],
                                                       $lu['tokens_out']], "$f : une sortie tronquée est une panne, payée");
            self::assertStringStartsWith('réponse tronquée', $lu['erreur']);
        }
        foreach (['tool_calls', 'error', null, 'end_turn'] as $stop) {
            $lu = (new ChatCompletionsAppelant('mistral'))->lire(200, [], (string) json_encode([
                'model' => 'm', 'choices' => [['message' => ['content' => 'du texte'], 'finish_reason' => $stop]]]));
            self::assertSame([false, true, ''], [$lu['ok'], $lu['panne'], $lu['texte']],
                var_export($stop, true) . ' : un arrêt qui n’est pas une fin est une panne');
        }
        $refus = (new ChatCompletionsAppelant('openai'))->lire(200, [], (string) json_encode([
            'model' => 'm', 'choices' => [['message' => ['content' => null, 'refusal' => 'je refuse'],
                                           'finish_reason' => 'stop']]]));
        self::assertSame([false, true, '', 'refus du modèle'], [$refus['ok'], $refus['refus'], $refus['texte'], $refus['erreur']],
            'un refus du modèle, quelle que soit la fin');
        $filtre = (new ChatCompletionsAppelant('openrouter'))->lire(200, [], (string) json_encode([
            'model' => 'm', 'choices' => [['message' => ['content' => ''], 'finish_reason' => 'content_filter']]]));
        self::assertSame([true, 'refus du modèle (content_filter)'], [$filtre['refus'], $filtre['erreur']]);
        self::assertSame(['ok' => false, 'panne' => true, 'texte' => '', 'erreur' => 'échec du fournisseur OpenRouter en cours de réponse'],
            (new ChatCompletionsAppelant('openrouter'))->lire(200, [], '{"error":{"code":502,"message":"amont"}}'),
            'une erreur dans une réponse 200');
        self::assertSame(['ok' => false, 'erreur' => 'réponse illisible du fournisseur OpenAI'],
            (new ChatCompletionsAppelant('openai'))->lire(200, [], 'pas du json'));
        self::assertSame(['ok' => false, 'erreur' => 'réponse illisible du fournisseur OpenAI'],
            (new ChatCompletionsAppelant('openai'))->lire(200, [], '{"choices":[]}'));
    }

    /**
     * A refusal by status: a rate refusal waits its Retry-After, ten
     * seconds without one; a spent credit, spending limit or quota is a cap
     * (402; at OpenAI, a 429 whose code says so), never retried at once; a
     * 400 is the call's settings refused; a 401 the key refused.
     */
    public function testARefusalByStatus(): void
    {
        $openai = new ChatCompletionsAppelant('openai');
        self::assertSame(['ok' => false, 'debit' => true, 'plafond' => false, 'http' => 429, 'attendre' => 12.0,
                          'erreur' => 'débit du fournisseur OpenAI (HTTP 429)'],
            $openai->lire(429, ['retry-after' => '12'], '{"error":{"type":"rate_limit_error","code":"slow_down"}}'));
        self::assertSame(10.0, $openai->lire(429, [], '{}')['attendre'], 'sans Retry-After, dix secondes');
        foreach (['credit_balance_exhausted', 'organization_spend_limit_exceeded', 'project_spend_limit_exceeded',
                  'organization_usage_limit_exceeded', 'insufficient_quota'] as $code) {
            $lu = $openai->lire(429, ['retry-after' => '5'], (string) json_encode(['error' => ['code' => $code]]));
            self::assertSame([true, true, null], [$lu['debit'], $lu['plafond'], $lu['attendre']], $code);
        }
        self::assertTrue($openai->lire(429, [], '{"error":{"type":"insufficient_quota","code":null}}')['plafond']);
        self::assertFalse((new ChatCompletionsAppelant('mistral'))->lire(429, [], '{"error":{"code":"insufficient_quota"}}')
            ['plafond'], 'un code d’OpenAI, lu chez OpenAI seulement');
        foreach (['mistral', 'openrouter'] as $f) {
            self::assertSame([true, true, 402], array_values(array_intersect_key(
                (new ChatCompletionsAppelant($f))->lire(402, ['retry-after' => '3'], '{}'),
                ['debit' => 1, 'plafond' => 1, 'http' => 1])), "$f : 402, jamais réessayé aussitôt");
        }
        $gemini = new GeminiAppelant();
        $epuise = '{"error":{"code":429,"message":"x","status":"RESOURCE_EXHAUSTED"}}';
        self::assertSame([false, 10.0], [$gemini->lire(429, [], $epuise)['plafond'], $gemini->lire(429, [], $epuise)['attendre']]);
        self::assertSame([true, null], [$gemini->lire(402, [], str_replace('429', '402', $epuise))['plafond'],
                                        $gemini->lire(402, [], $epuise)['attendre']], 'le code HTTP décide, pas le statut');
        self::assertSame(['ok' => false, 'configuration' => true, 'http' => 400,
                          'erreur' => 'Mistral AI refuse les réglages de l’appel (HTTP 400)'],
            (new ChatCompletionsAppelant('mistral'))->lire(400, [], '{"message":"le prompt cité"}'));
        self::assertSame('clé refusée par Google (Gemini) (HTTP 403)', $gemini->lire(403, [], '{}')['erreur']);
        self::assertSame(['ok' => false, 'debit' => true, 'plafond' => false, 'http' => 503, 'attendre' => null,
                          'erreur' => 'xAI (Grok) saturé (HTTP 503)'], (new ChatCompletionsAppelant('xai'))->lire(503, [], ''));
        self::assertSame(['ok' => false, 'http' => 500, 'erreur' => 'erreur du fournisseur OpenRouter (HTTP 500)'],
            (new ChatCompletionsAppelant('openrouter'))->lire(500, [], '{"error":{"message":"le prompt cité"}}'));

        $anthropic = new AnthropicAppelant();
        self::assertSame([true, null], [$anthropic->lire(429, [], '{}')['plafond'], $anthropic->lire(429, [], '{}')['attendre']],
            'chez Anthropic, une 429 sans Retry-After est un plafond');
        self::assertFalse($anthropic->lire(429, ['retry-after' => '4'], '{}')['plafond']);
        self::assertFalse($anthropic->lire(529, [], '{}')['plafond']);
    }

    /** Gemini, answered: its parts but the thoughts, its tokens billed (candidates and thoughts), its stop classed. */
    public function testAGeminiAnswerIsRead(): void
    {
        $gemini = new GeminiAppelant();
        $reponse = static fn (array $candidat, array $plus = []): string => (string) json_encode($plus + [
            'candidates' => [$candidat], 'modelVersion' => 'gemini-fictif-1-001',
            'usageMetadata' => ['promptTokenCount' => 11, 'candidatesTokenCount' => 22, 'thoughtsTokenCount' => 33,
                                'totalTokenCount' => 66]]);
        $parts = ['content' => ['role' => 'model', 'parts' => [['text' => 'pensée', 'thought' => true],
                                                               ['text' => 'la '], ['text' => 'réponse']]]];
        self::assertSame(['ok' => true, 'texte' => 'la réponse', 'tokens_in' => 11, 'tokens_out' => 55, 'stop_reason' => 'STOP',
                          'arret' => 'end', 'modele_servi' => 'gemini-fictif-1-001'],
            $gemini->lire(200, [], $reponse($parts + ['finishReason' => 'STOP'])), 'jamais la pensée du modèle');
        foreach (['MAX_TOKENS', 'CONTINUATION'] as $stop) {
            $lu = $gemini->lire(200, [], $reponse($parts + ['finishReason' => $stop]));
            self::assertSame([false, true, '', 55], [$lu['ok'], $lu['tronque'], $lu['texte'], $lu['tokens_out']], $stop);
        }
        self::assertSame('réponse tronquée : plafond d’une requête atteint (CONTINUATION)',
            $gemini->lire(200, [], $reponse($parts + ['finishReason' => 'CONTINUATION']))['erreur']);
        $lu = $gemini->lire(200, [], $reponse($parts + ['finishReason' => 'SAFETY']));
        self::assertSame([false, true, 'refus du modèle (SAFETY)'], [$lu['ok'], $lu['refus'], $lu['erreur']]);
        self::assertTrue($gemini->lire(200, [], $reponse($parts + ['finishReason' => 'OTHER']))['panne']);
        $bloque = $gemini->lire(200, [], (string) json_encode(['promptFeedback' => ['blockReason' => 'PROHIBITED_CONTENT'],
            'usageMetadata' => ['promptTokenCount' => 9]]));
        self::assertSame([false, true, 9, 0, 'prompt bloqué par Google (Gemini)'],
            [$bloque['ok'], $bloque['refus'], $bloque['tokens_in'], $bloque['tokens_out'], $bloque['erreur']]);
        self::assertSame(['ok' => false, 'erreur' => 'réponse illisible du fournisseur Google (Gemini)'], $gemini->lire(200, [], '{}'));
    }

    /**
     * The canary: whatever text a provider puts in a response — a refusal,
     * an error message, a finish message, stop details, a stop or a model
     * that are not identifiers —, none of it is in the outcome.
     */
    public function testNothingAProviderWritesLeavesThroughAnOutcome(): void
    {
        $canari = 'CANARI du gabarit secret';
        $erreurs = [
            (string) json_encode(['error' => ['message' => $canari, 'type' => $canari, 'code' => $canari,
                                              'metadata' => ['raw' => $canari]], 'message' => $canari]),
            $canari,
        ];
        $statuts = [400, 401, 402, 403, 404, 429, 500, 503, 529];
        $appelants = [new AnthropicAppelant(), new GeminiAppelant(), ...array_map(
            static fn (string $f): Appelant => new ChatCompletionsAppelant($f), ['openai', 'mistral', 'xai', 'openrouter'])];
        $reponses = [
            'anthropic' => [['model' => $canari, 'stop_reason' => 'refusal',
                             'stop_details' => ['type' => 'refusal', 'category' => $canari, 'explanation' => $canari],
                             'content' => [['type' => 'text', 'text' => $canari]]],
                            ['model' => $canari, 'stop_reason' => $canari, 'content' => [['type' => 'text', 'text' => 'x']]]],
            'google' => [['promptFeedback' => ['blockReason' => 'SAFETY', 'blockReasonMessage' => $canari], 'modelVersion' => $canari],
                         ['candidates' => [['finishReason' => 'SAFETY', 'finishMessage' => $canari,
                                            'content' => ['parts' => [['text' => $canari]]]]], 'modelVersion' => $canari],
                         ['candidates' => [['finishReason' => $canari, 'content' => ['parts' => [['text' => $canari]]]]]],
                         ['error' => ['message' => $canari]]],
            'chat' => [['model' => $canari, 'choices' => [['message' => ['content' => $canari, 'refusal' => $canari],
                                                           'finish_reason' => 'stop', 'native_finish_reason' => $canari]]],
                       ['model' => $canari, 'choices' => [['message' => ['content' => $canari], 'finish_reason' => $canari]]],
                       ['model' => $canari, 'choices' => [['message' => ['content' => $canari], 'finish_reason' => 'length',
                                                           'error' => ['message' => $canari]]]],
                       ['error' => ['message' => $canari, 'metadata' => ['raw' => $canari]]]],
        ];
        foreach ($appelants as $appelant) {
            $f = $appelant->fournisseur();
            $lus = [];
            foreach ($statuts as $statut) {
                foreach ($erreurs as $corps) {
                    $lus[] = $appelant->lire($statut, ['retry-after' => $canari], $corps);
                }
            }
            foreach ($reponses[$f === 'anthropic' || $f === 'google' ? $f : 'chat'] as $corps) {
                $lus[] = $appelant->lire(200, ['retry-after' => $canari], (string) json_encode($corps));
            }
            foreach ($lus as $i => $lu) {
                self::assertStringNotContainsStringIgnoringCase('canari', (string) json_encode($lu, JSON_UNESCAPED_UNICODE),
                    "$f, cas $i");
                if (!$lu['ok']) {
                    self::assertIsString($lu['erreur'], "$f, cas $i");
                }
            }
        }
    }

    /**
     * The simulated providers of a local instance (WORKER_PROVIDER=mock)
     * answer each provider in its format, which its caller reads as an
     * answer; any other address fails.
     */
    public function testTheSimulatedProvidersAnswerEachInItsFormat(): void
    {
        $mock = new MockMultiHttpClient();
        $registre = new Registre();
        $modeles = ['anthropic' => 'claude-haiku-5-5', 'openai' => 'modele-fictif-1', 'mistral' => 'modele-fictif-2',
                    'google' => 'gemini-fictif-1', 'xai' => 'modele-fictif-3', 'openrouter' => 'editeur/modele-fictif'];
        foreach ($modeles as $f => $modele) {
            $r = $registre->appelant($f)->requete('k', self::reglage($modele), str_repeat('x', 40));
            $mock->start($f, 'POST', $r['url'], $r['headers'], $r['body'], 5.0);
        }
        $mock->start('ailleurs', 'POST', 'https://ailleurs.example/v1/messages', [], '{}', 5.0);
        $reponses = $mock->wait(microtime(true) + 1);
        self::assertInstanceOf(HttpClientException::class, $reponses['ailleurs']);
        foreach (array_keys($modeles) as $f) {
            $lu = $registre->appelant($f)->lire($reponses[$f]['status'], $reponses[$f]['headers'], $reponses[$f]['body']);
            self::assertSame([true, MockMultiHttpClient::TEXTE, 10], [$lu['ok'], $lu['texte'], $lu['tokens_in']], $f);
        }
        self::assertSame(0, $mock->running());
    }

    /** @return array{fournisseur: string, voie: string, modele: string, budget_sortie: int, effort: null, reflexion: string} */
    private static function reglage(string $modele): array
    {
        return ['fournisseur' => 'x', 'voie' => 'directe', 'modele' => $modele, 'budget_sortie' => 1234, 'effort' => null,
                'reflexion' => 'coupee'];
    }
}
