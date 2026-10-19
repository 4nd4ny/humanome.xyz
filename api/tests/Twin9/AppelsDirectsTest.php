<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\Twin9\AnthropicCaller;
use Humanome\Twin9\CallSettings;
use Humanome\Twin9\ProfilRepository;
use PHPUnit\Framework\TestCase;
use stdClass;

/**
 * Twin9's direct calls (T7, ADR-011 §3): each request is the one its step
 * sets — model, output budget, effort when set, thinking cut in the form the
 * model accepts, never a temperature — and each response is read as the v9.8
 * reads it, a refusal of the model being a failure and a rate refusal giving
 * its Retry-After.
 */
final class AppelsDirectsTest extends TestCase
{
    public function testTheRequestOfAStep(): void
    {
        $r = AnthropicCaller::requete('sk-ant-test', 'claude-haiku-5-5', 'Le prompt.', 16000);
        self::assertSame(['x-api-key' => 'sk-ant-test', 'anthropic-version' => '2023-06-01',
                          'content-type' => 'application/json'], $r['headers']);
        self::assertSame(['model' => 'claude-haiku-5-5', 'max_tokens' => 16000, 'thinking' => ['type' => 'disabled'],
                          'messages' => [['role' => 'user', 'content' => 'Le prompt.']]],
            json_decode($r['body'], true));

        $r = json_decode(AnthropicCaller::requete('k', 'claude-sonnet-5-5', 'p', 999, 'coupee', 'low')['body'], true);
        self::assertSame(['type' => 'between_tools'], $r['thinking'], 'Sonnet 5.5 refuse disabled');
        self::assertSame(['effort' => 'low'], $r['output_config']);
        self::assertSame(999, $r['max_tokens']);
        self::assertArrayNotHasKey('temperature', $r);
    }

    public function testThinkingTakesTheFormEachModelAccepts(): void
    {
        self::assertSame(['type' => 'disabled'], AnthropicCaller::reflexion('claude-haiku-5-5', 'coupee'));
        self::assertSame(['type' => 'between_tools'], AnthropicCaller::reflexion('claude-sonnet-5-5', 'coupee'));
        self::assertSame(['type' => 'between_tools'], AnthropicCaller::reflexion('claude-sonnet-5-5-20261001', 'coupee'));
        self::assertSame(['type' => 'disabled'], AnthropicCaller::reflexion('claude-sonnet-5', 'coupee'));
        self::assertSame(['type' => 'adaptive'], AnthropicCaller::reflexion('claude-sonnet-5-5', 'adaptative'));
        self::assertSame(['type' => 'adaptive'], AnthropicCaller::reflexion('claude-haiku-5-5', 'adaptative'));
    }

    public function testAResponseIsReadAsTheV98ReadsIt(): void
    {
        $lu = AnthropicCaller::lire(200, [], (string) json_encode([
            'model' => 'claude-haiku-5-5-20261001', 'stop_reason' => 'max_tokens',
            'content' => [['type' => 'thinking', 'thinking' => 'à part'], ['type' => 'text', 'text' => 'un '],
                          ['type' => 'text', 'text' => 'texte']],
            'usage' => ['input_tokens' => 12, 'output_tokens' => 34],
        ]));
        self::assertSame(['ok' => true, 'texte' => 'un texte', 'tokens_in' => 12, 'tokens_out' => 34,
                          'stop_reason' => 'max_tokens', 'modele_servi' => 'claude-haiku-5-5-20261001'], $lu,
            'une sortie tronquée n\'est pas une panne, comme dans la v9.8');
    }

    public function testARefusalOfTheModelIsAFailure(): void
    {
        $lu = AnthropicCaller::lire(200, [], (string) json_encode([
            'model' => 'claude-sonnet-5-5', 'stop_reason' => 'refusal', 'stop_details' => ['category' => 'cyber'],
            'content' => [], 'usage' => ['input_tokens' => 5, 'output_tokens' => 0],
        ]));
        self::assertFalse($lu['ok']);
        self::assertTrue($lu['refus']);
        self::assertSame('refus du modèle (cyber)', $lu['erreur']);
        self::assertSame(5, $lu['tokens_in']);
    }

    public function testRateRefusalsAndErrors(): void
    {
        self::assertSame(['ok' => false, 'debit' => true, 'http' => 429, 'attendre' => 12.0,
                          'erreur' => 'débit du fournisseur (HTTP 429)'],
            AnthropicCaller::lire(429, ['retry-after' => '12'], '{}'));
        self::assertNull(AnthropicCaller::lire(429, [], '{}')['attendre'], 'un plafond de dépense');
        self::assertSame(529, AnthropicCaller::lire(529, [], '{}')['http']);
        self::assertSame(['ok' => false, 'erreur' => 'erreur du fournisseur (HTTP 500)'],
            AnthropicCaller::lire(500, [], '{"error":{"message":"le prompt cité"}}'), 'jamais le texte amont');
        self::assertSame(['ok' => false, 'erreur' => 'réponse illisible du fournisseur'],
            AnthropicCaller::lire(200, [], 'pas du json'));
    }

    public function testEachCallFollowsItsStepOverItsStage(): void
    {
        $profil = ProfilRepository::v98();
        $profil->etapes = (object) [
            'greffier' => (object) ['budget_sortie' => 1000],
            'jures' => (object) ['effort' => 'medium'],
            'second_ressort' => (object) ['modele' => 'claude-opus-4-8'],
        ];
        $profil->college = [(object) ['nom' => 'haiku', 'famille' => 'anthropic', 'passes' => 3,
                                      'reflexion' => 'adaptative'],
                            (object) ['nom' => 'autre', 'famille' => 'x', 'modele' => 'claude-sonnet-5-5']];
        $s = new CallSettings(ProfilRepository::validate($profil));
        $haiku = ['modele' => 'claude-haiku-5-5', 'budget_sortie' => 16000, 'effort' => null, 'reflexion' => 'coupee'];
        $sonnet = array_replace($haiku, ['modele' => 'claude-sonnet-5-5']);

        self::assertSame(array_replace($haiku, ['reflexion' => 'adaptative']),
            $s->pour('tagger', 'journees/2026-03-02/tags_haiku#2_P1.json'), 'un lecteur et ses passes');
        self::assertSame(array_replace($haiku, ['modele' => 'claude-sonnet-5-5']), $s->pour('tagger', 'journees/J/tags_autre_P7.json'));
        self::assertSame($haiku, $s->pour('tagger', 'journees/J/tags_inconnu_P1.json'), 'l\'étage des lecteurs');
        self::assertSame(array_replace($haiku, ['budget_sortie' => 1000]), $s->pour('greffier', 'journees/J/tribunal/1.01/20-greffier.md'));
        self::assertSame($haiku, $s->pour('leger', 'journees/J/tribunal/1.01/20b-leger-1.md'));
        self::assertSame($haiku, $s->pour('gardien_support', 'journees/J/tribunal/1.01/25a-gardien-support.md'));
        self::assertSame(array_replace($sonnet, ['effort' => 'medium']), $s->pour('jure', 'journees/J/tribunal/1.01/23-historien.md'));
        self::assertSame($sonnet, $s->pour('jure2', 'journees/J/tribunal/1.01/23c-historien.md'), 'le second tour');
        self::assertSame($sonnet, $s->pour('merge_rapporteur', 'merge_rapporteur'));
        self::assertSame($sonnet, $s->pour('condense', 'condense_2026-03-02'));
        self::assertSame(array_replace($sonnet, ['modele' => 'claude-opus-4-8', 'effort' => 'medium']),
            $s->pour('jure', 'second_ressort/1.01/23-historien.md'), 'un réglage du second ressort vaut pour tous');
        self::assertSame(array_replace($haiku, ['modele' => 'claude-opus-4-8', 'budget_sortie' => 1000]),
            $s->pour('greffier', 'second_ressort/1.01/20-greffier.md'));
        self::assertSame($sonnet, $s->pour('inconnue', 'x'), 'l\'étage profond à défaut');
    }

    /** Every step the engine names has its step in the profile. */
    public function testEveryEngineStepHasItsProfileStep(): void
    {
        $schema = json_decode((string) file_get_contents(\dirname(__DIR__, 3) . '/schemas/twin9-profil.schema.json'));
        $etapes = array_keys((array) $schema->properties->etapes->properties);
        self::assertSame([], array_values(array_diff(array_unique(CallSettings::ETAPES), $etapes)));
        self::assertSame(['second_ressort'], array_values(array_diff($etapes, CallSettings::ETAPES)),
            'le second ressort n\'est pas une étape du moteur : il en rejoue les appels');
    }

    public function testTheFingerprintOfTheSettings(): void
    {
        $gabarits = ['lourd/20-greffier' => 'g', 'tagger/P1' => 'fiche', 'merge/04-rapporteur' => 'r'];
        $profil = ProfilRepository::v98();
        $base = CallSettings::empreinte($profil, null, $gabarits);

        self::assertSame($base, CallSettings::empreinte(self::melange($profil), null, array_reverse($gabarits)),
            'l\'ordre des clés n\'y fait rien');
        self::assertSame($base, CallSettings::empreinte($profil, null, ['merge/04-rapporteur' => 'autre'] + $gabarits),
            'les relectures de la fusion ne sont pas gardées');
        self::assertNotSame($base, CallSettings::empreinte($profil, null, ['tagger/P1' => 'autre'] + $gabarits));
        self::assertNotSame($base, CallSettings::empreinte($profil, (object) ['journee' => (object) ['rejet_extrait' => 100]],
            $gabarits));
        $autre = ProfilRepository::v98();
        $autre->etages->rapide->effort = 'low';
        self::assertNotSame($base, CallSettings::empreinte($autre, null, $gabarits));
        $autre = ProfilRepository::v98();
        $autre->college[0]->budget_sortie = 100;
        self::assertNotSame($base, CallSettings::empreinte($autre, null, $gabarits));
    }

    /** The same profile, its keys in another order, as MySQL may give them back. */
    private static function melange(mixed $v): mixed
    {
        if ($v instanceof stdClass) {
            $a = array_reverse((array) $v, true);

            return (object) array_map(self::melange(...), $a);
        }

        return \is_array($v) ? array_map(self::melange(...), $v) : $v;
    }
}
