<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\Packages\SettingsRepository;
use Humanome\Tests\TestDb;
use Humanome\Twin9\AnthropicCaller;
use Humanome\Twin9\CallSettings;
use Humanome\Twin9\DirectCalls;
use Humanome\Twin9\EngineLoader;
use Humanome\Twin9\Evaluations;
use Humanome\Twin9\Fournisseurs\Appelant;
use Humanome\Twin9\Fournisseurs\Arret;
use Humanome\Twin9\Fournisseurs\Fournisseurs;
use Humanome\Twin9\Fournisseurs\Registre;
use Humanome\Twin9\MoteurReglages;
use Humanome\Twin9\ProfilRepository;
use Humanome\Twin9\RunKey;
use Humanome\Twin9\Twin9Config;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunInSeparateProcess;
use PHPUnit\Framework\TestCase;
use stdClass;
use Twin9\Run\Call;

/**
 * Twin9's direct calls (T7, ADR-011 §3): each request is the one its step
 * sets — model, output budget, effort when set, thinking cut in the form the
 * model accepts, never a temperature — and each response is read as the v9.8
 * reads it, a refusal of the model being a failure and a rate refusal giving
 * its Retry-After; a cut output is a failure too (P0-2), and the stop reason
 * is kept as a short identifier.
 *
 * Each call goes to its own provider (ADR-012): its settings name it once,
 * the key is that provider's (RunKey), the request its caller's at its
 * locked address (DirectCalls, Fournisseurs\Registre) — each host gets its
 * own key and never another's.
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
            'model' => 'claude-haiku-5-5-20261001', 'stop_reason' => 'end_turn',
            'content' => [['type' => 'thinking', 'thinking' => 'à part'], ['type' => 'text', 'text' => 'un '],
                          ['type' => 'text', 'text' => 'texte']],
            'usage' => ['input_tokens' => 12, 'output_tokens' => 34],
        ]));
        self::assertSame(['ok' => true, 'texte' => 'un texte', 'tokens_in' => 12, 'tokens_out' => 34,
                          'stop_reason' => 'end_turn', 'modele_servi' => 'claude-haiku-5-5-20261001'], $lu,
            'les blocs de texte, la réflexion à part');
    }

    /**
     * P0-2: an output cut by its budget, or by the model's full context, is
     * a failure — unlike the v9.8, which takes the cut text as an answer —,
     * its usage kept (it is paid), its text never, its error the code's.
     */
    public function testACutOutputIsAFailure(): void
    {
        $message = [
            'model' => 'claude-haiku-5-5-20261001', 'stop_reason' => 'max_tokens',
            'content' => [['type' => 'thinking', 'thinking' => 'à part'], ['type' => 'text', 'text' => 'un début '],
                          ['type' => 'text', 'text' => 'coupé']],
            'usage' => ['input_tokens' => 12, 'output_tokens' => 34],
        ];
        self::assertSame(['ok' => false, 'tronque' => true, 'texte' => '',
                          'erreur' => 'réponse tronquée : budget de sortie atteint (max_tokens)',
                          'tokens_in' => 12, 'tokens_out' => 34, 'stop_reason' => 'max_tokens',
                          'modele_servi' => 'claude-haiku-5-5-20261001'],
            AnthropicCaller::lire(200, [], (string) json_encode($message)),
            'une sortie tronquée est une panne, à l\'inverse de la v9.8');

        $message['stop_reason'] = 'model_context_window_exceeded';
        self::assertSame(['ok' => false, 'tronque' => true, 'texte' => '',
                          'erreur' => 'réponse tronquée : fenêtre de contexte pleine',
                          'tokens_in' => 12, 'tokens_out' => 34, 'stop_reason' => 'model_context_window_exceeded',
                          'modele_servi' => 'claude-haiku-5-5-20261001'],
            AnthropicCaller::lireMessage($message), 'la fenêtre de contexte pleine aussi, par lots comme en direct');
        self::assertArrayNotHasKey('refus', AnthropicCaller::lireMessage($message));

        foreach (['end_turn', 'stop_sequence', 'pause_turn'] as $stop) {
            $message['stop_reason'] = $stop;
            self::assertTrue(AnthropicCaller::lireMessage($message)['ok'], $stop);
        }
    }

    /**
     * The stop reason is kept as a short identifier, never as a provider's
     * text, and classed in one vocabulary: Anthropic's seven values, a class
     * as itself, anything else `other`, nothing null.
     */
    public function testTheStopReasonIsSanitisedAndClassed(): void
    {
        self::assertSame('end_turn', Arret::assainir('end_turn'));
        self::assertSame('model_context_window_exceeded', Arret::assainir('model_context_window_exceeded'));
        self::assertSame('ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcde', Arret::assainir('ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcde'), '32');
        self::assertSame('other', Arret::assainir('ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdef'), '33 caractères');
        self::assertSame('other', Arret::assainir('end-turn'));
        self::assertSame('other', Arret::assainir('arrêt'));
        self::assertSame('other', Arret::assainir('max_tokens: le prompt cité'));
        self::assertNull(Arret::assainir(''), 'absent');
        self::assertNull(Arret::assainir(null));

        $classes = ['end_turn' => 'end', 'stop_sequence' => 'end', 'tool_use' => 'end', 'max_tokens' => 'max_tokens',
                    'model_context_window_exceeded' => 'context_window', 'refusal' => 'refusal',
                    'pause_turn' => 'other', 'end' => 'end', 'context_window' => 'context_window',
                    'other' => 'other', 'inconnu' => 'other', 'max_tokens (cité)' => 'other'];
        foreach ($classes as $brut => $classe) {
            self::assertSame($classe, Arret::classe('anthropic', $brut), $brut);
        }
        self::assertNull(Arret::classe('anthropic', null));
        self::assertTrue(Arret::tronquee('anthropic', 'max_tokens'));
        self::assertTrue(Arret::tronquee('anthropic', 'model_context_window_exceeded'));
        self::assertFalse(Arret::tronquee('anthropic', 'end_turn'));
        self::assertFalse(Arret::tronquee('anthropic', 'refusal'));
        self::assertFalse(Arret::tronquee('anthropic', null));
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
        $haiku = ['fournisseur' => 'anthropic', 'voie' => 'lots', 'modele' => 'claude-haiku-5-5', 'budget_sortie' => 16000,
                  'effort' => null, 'reflexion' => 'coupee'];
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
        self::assertSame(['fournisseur', 'voie', 'modele', 'budget_sortie', 'effort', 'reflexion'],
            array_keys($s->pour('jure', 'x')));
    }

    /** A step the profile does not know reads the deep stage, without indexing the stages by null (PHP 8.5). */
    public function testAnUnknownStepReadsTheDeepStageCleanly(): void
    {
        $s = new CallSettings(ProfilRepository::validate(ProfilRepository::v98()));
        set_error_handler(static function (int $niveau, string $message): never {
            throw new \ErrorException($message, 0, $niveau);
        });
        try {
            self::assertSame('claude-sonnet-5-5', $s->pour('inconnue', 'x')['modele']);
            self::assertSame('claude-sonnet-5-5', $s->pour('', '')['modele']);
        } finally {
            restore_error_handler();
        }
    }

    /**
     * Each call is routed by its own settings: by batches when it goes to
     * Anthropic and the profile chose them, directly otherwise. Every call
     * of a profile goes to Anthropic: its lane is the profile's.
     */
    public function testEachCallIsRoutedByItsOwnSettings(): void
    {
        $lots = new CallSettings(ProfilRepository::validate(ProfilRepository::v98()));
        $profil = ProfilRepository::v98();
        $profil->voie = 'directe';
        $direct = new CallSettings(ProfilRepository::validate($profil));

        foreach ([[$lots, 'lots'], [$direct, 'directe']] as [$s, $voie]) {
            foreach ($s->parEtape() as $etape => $reglage) {
                self::assertSame(['anthropic', $voie], [$reglage['fournisseur'], $reglage['voie']], $etape);
            }
            self::assertSame($s->combinaisons(), $s->combinaisons($voie));
            self::assertSame([], $s->combinaisons($voie === 'lots' ? 'directe' : 'lots'));
        }
        self::assertSame(array_map(static fn (array $r): array => array_replace($r, ['voie' => 'directe']),
            $lots->combinaisons()), $direct->combinaisons(), 'les mêmes réglages, une autre voie');
    }

    /**
     * The summary of a run's calls: each stage as the profile sets it — a
     * step's setting never shows in its stage —, each step, each under the
     * second instance, each reader, and a step the profile does not know.
     */
    public function testTheSummaryOfTheCalls(): void
    {
        $profil = ProfilRepository::v98();
        $profil->voie = 'directe';
        $profil->etapes = (object) [
            'greffier' => (object) ['budget_sortie' => 1000],
            'second_ressort' => (object) ['modele' => 'claude-opus-4-8'],
        ];
        $profil->college[0]->reflexion = 'adaptative';
        $s = new CallSettings(ProfilRepository::validate($profil));
        $resume = $s->resume();
        $haiku = ['fournisseur' => 'anthropic', 'voie' => 'directe', 'modele' => 'claude-haiku-5-5',
                  'budget_sortie' => 16000, 'effort' => null, 'reflexion' => 'coupee'];
        $sonnet = array_replace($haiku, ['modele' => 'claude-sonnet-5-5']);

        self::assertSame(['etages', 'etapes', 'second_ressort', 'lecteurs', 'defaut'], array_keys($resume));
        self::assertSame(['lecteurs' => $haiku, 'rapide' => $haiku, 'profond' => $sonnet], $resume['etages'],
            'l\'étage rapide garde son budget, que le greffier surcharge');
        self::assertSame(array_values(array_unique(CallSettings::ETAPES)), array_keys($resume['etapes']));
        self::assertSame(array_keys($resume['etapes']), array_keys($resume['second_ressort']));
        self::assertSame(array_replace($haiku, ['budget_sortie' => 1000]), $resume['etapes']['greffier']);
        self::assertSame($haiku, $resume['etapes']['juge_leger']);
        self::assertSame($sonnet, $resume['etapes']['relectures']);
        self::assertSame(array_replace($haiku, ['modele' => 'claude-opus-4-8', 'budget_sortie' => 1000]),
            $resume['second_ressort']['greffier']);
        self::assertSame(array_replace($sonnet, ['modele' => 'claude-opus-4-8']), $resume['second_ressort']['jures']);
        self::assertSame(['haiku' => array_replace($haiku, ['reflexion' => 'adaptative'])], $resume['lecteurs']);
        self::assertSame($sonnet, $resume['defaut']);
        foreach ($s->combinaisons() as $reglage) {
            self::assertContains($reglage, [...array_values($resume['etages']), ...array_values($resume['etapes']),
                ...array_values($resume['second_ressort']), ...array_values($resume['lecteurs']), $resume['defaut']]);
        }
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

        // T16: the referential the engine reads is in it, decoded as arrays or as objects; a run without one keeps it
        $bloc = ['id' => 'fictif', 'version' => '1.0.0', 'label' => 'Fictif', 'motif' => '[A-B][1-2]',
                 'poles' => [['num' => 1, 'nom' => 'A', 'entete' => "# Pôle 1 — A\n",
                              'competences' => [['code' => 'A1', 'nom' => 'Une', 'fiche' => '## A1 — Une']]]]];
        self::assertSame($base, CallSettings::empreinte($profil, null, $gabarits, null));
        $avec = CallSettings::empreinte($profil, null, $gabarits, $bloc);
        self::assertNotSame($base, $avec);
        self::assertSame($avec, CallSettings::empreinte($profil, null, $gabarits, json_decode(json_encode($bloc))));
        $fiche = $bloc;
        $fiche['poles'][0]['competences'][0]['fiche'] .= ' : une fiche changée';
        self::assertNotSame($avec, CallSettings::empreinte($profil, null, $gabarits, $fiche));
    }

    /**
     * A provider named where it is inherited anyway — Anthropic on a stage,
     * a step's stage's, the readers' stage's on a reader — changes none of
     * the fingerprints, nor the engine's settings (ADR-012): the v9.8
     * profile, Anthropic written everywhere, keeps its memory and its
     * forecasts.
     */
    public function testAnInheritedProviderLeavesTheFingerprints(): void
    {
        $gabarits = ['lourd/20-greffier' => 'g', 'tagger/P1' => 'fiche'];
        $empreintes = static fn (stdClass $p): array => [
            CallSettings::empreinte($p, $p->troncatures, $gabarits),
            Evaluations::signature($p, 'a1b2c3d4e5f60718'),
            json_encode(MoteurReglages::depuis($p), JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION),
        ];
        $nu = ProfilRepository::v98();
        $nu->etapes->greffier = (object) ['budget_sortie' => 1000];
        $ecrit = ProfilRepository::v98();
        foreach ($ecrit->etages as $etage) {
            $etage->fournisseur = 'anthropic';
        }
        $ecrit->college[0]->fournisseur = 'anthropic';
        $ecrit->etapes->greffier = (object) ['fournisseur' => 'anthropic', 'budget_sortie' => 1000];
        $ecritValide = ProfilRepository::validate($ecrit);

        self::assertSame($empreintes(ProfilRepository::validate($nu)), $empreintes($ecritValide));
        self::assertSame('anthropic', $ecritValide->etages->profond->fournisseur, 'le profil lui-même le garde');

        // the same at another provider: the step names its stage's provider, the reader the readers' stage's
        $mistral = static function (bool $ecrit): stdClass {
            $p = ProfilRepository::v98();
            foreach (['lecteurs', 'profond'] as $etage) {
                $p->etages->{$etage} = (object) ['fournisseur' => 'mistral', 'modele' => 'modele-fictif',
                                                 'budget_sortie' => 900, 'reflexion' => 'coupee'];
            }
            $p->etapes->accusation = (object) (['budget_sortie' => 800] + ($ecrit ? ['fournisseur' => 'mistral'] : []));
            if ($ecrit) {
                $p->college[0]->fournisseur = 'mistral';
            }

            return ProfilRepository::validate($p);
        };
        self::assertSame($empreintes($mistral(false)), $empreintes($mistral(true)));
        self::assertNotSame($empreintes(ProfilRepository::validate($nu))[0], $empreintes($mistral(false))[0]);
    }

    /**
     * The second instance keeps the provider it names: over a step of
     * another provider than its stage's, naming the stage's is not inheriting
     * it. Two profiles whose calls go to two providers never share a
     * fingerprint, and the memory never takes one's day back for the other.
     */
    public function testTheSecondInstancesProviderStaysInTheFingerprints(): void
    {
        $profil = static function (bool $nomme): stdClass {
            $p = ProfilRepository::v98();
            foreach (['lecteurs', 'rapide', 'profond'] as $etage) {
                $p->etages->{$etage} = (object) ['fournisseur' => 'mistral', 'modele' => 'modele-fictif',
                                                 'budget_sortie' => 900, 'reflexion' => 'coupee'];
            }
            $p->etapes->jures = (object) ['fournisseur' => 'openai', 'modele' => 'modele-fictif-o'];
            $p->etapes->second_ressort = (object) (['modele' => 'modele-fictif-2'] + ($nomme ? ['fournisseur' => 'mistral'] : []));

            return ProfilRepository::validate($p);
        };
        $a = $profil(true);
        $b = $profil(false);

        self::assertSame(['mistral', 'modele-fictif-2'],
            array_values(array_intersect_key((new CallSettings($a))->pour('jure', 'second_ressort/1.01/23-historien.md'),
                ['fournisseur' => 0, 'modele' => 0])));
        self::assertSame(['openai', 'modele-fictif-2'],
            array_values(array_intersect_key((new CallSettings($b))->pour('jure', 'second_ressort/1.01/23-historien.md'),
                ['fournisseur' => 0, 'modele' => 0])), 'sans fournisseur, le second ressort suit celui de l’étape');
        $gabarits = ['tagger/P1' => 'fiche'];
        self::assertNotSame(CallSettings::empreinte($a, $a->troncatures, $gabarits),
            CallSettings::empreinte($b, $b->troncatures, $gabarits));
        self::assertNotSame(Evaluations::signature($a, 'a1b2c3d4e5f60718'), Evaluations::signature($b, 'a1b2c3d4e5f60718'));
    }

    /**
     * One decision per call: its settings' provider. Its key is that
     * provider's instance key (RunKey), its request goes to that provider's
     * address (DirectCalls), each host getting its own fake key, never
     * another's; each response is read by its provider's caller.
     */
    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testEachHostGetsItsOwnKeyAndNeverAnothers(): void
    {
        self::assertTrue(EngineLoader::load(\dirname(__DIR__) . '/fixtures/twin9-factice'));
        $cles = [];
        foreach (Fournisseurs::REGISTRE as $f => $registre) {
            $cles[$f] = 'cle-' . $f . '-factice-' . bin2hex(random_bytes(4));
            TestDb::setEnv($registre['env'], $cles[$f]);
        }
        $modeles = ['anthropic' => 'claude-haiku-5-5', 'openai' => 'modele-fictif-1', 'mistral' => 'modele-fictif-2',
                    'google' => 'gemini-fictif-1', 'xai' => 'modele-fictif-3', 'openrouter' => 'editeur/modele-fictif'];
        $formats = ['anthropic' => 'anthropic', 'google' => 'gemini'];
        $http = new FakeMultiHttpClient(static function (array $r) use ($modeles, $formats): array {
            foreach (Fournisseurs::REGISTRE as $f => $registre) {
                if (str_starts_with($r['url'], $registre['url'])) {
                    return ['body' => FakeMultiHttpClient::message('vu ' . FakeMultiHttpClient::appel($r), $modeles[$f],
                        format: $formats[$f] ?? 'chat')];
                }
            }
            throw new \LogicException('hôte hors du registre : ' . $r['url']);
        });
        $pdo = $this->createStub(\PDO::class);
        $runKey = new RunKey($pdo, new Twin9Config(new SettingsRepository($pdo)));
        $direct = new DirectCalls($http);
        try {
            foreach ($modeles as $f => $modele) {
                $reglage = ['fournisseur' => $f, 'voie' => 'directe', 'modele' => $modele, 'budget_sortie' => 100,
                            'effort' => null, 'reflexion' => 'coupee'];
                $direct->send(1, new Call('appel-' . $f, 'greffier', 'greffier', $modele, "[appel:$f] Un prompt."), $reglage,
                    (string) $runKey->pour(1, 'instance', $f), microtime(true) + 5);
            }
            $issues = [];
            while ($direct->running() > 0) {
                foreach ($direct->wait(microtime(true) + 5) as $issue) {
                    $issues[$issue['appel']->id] = $issue;
                }
            }
        } finally {
            TestDb::restoreEnv();
        }

        self::assertCount(6, $http->requests);
        foreach ($http->requests as $r) {
            $f = substr($r['id'], \strlen('1:appel-'));
            self::assertSame(parse_url(Fournisseurs::REGISTRE[$f]['url'], PHP_URL_HOST), parse_url($r['url'], PHP_URL_HOST), $f);
            $entetes = (string) json_encode($r['headers']);
            foreach ($cles as $autre => $cle) {
                self::assertSame($autre === $f, str_contains($entetes, $cle), "$f reçoit la clé de $autre ?");
                self::assertStringNotContainsString($cle, $r['url'] . json_encode($r['body']), "$f : $autre");
            }
            self::assertSame("[appel:$f] Un prompt.", FakeMultiHttpClient::prompt($r), $f);
            self::assertTrue($issues['appel-' . $f]['ok'], $f);
            self::assertSame('vu ' . $f, $issues['appel-' . $f]['texte'], "$f : lu par l’appelant de son fournisseur");
            self::assertSame($modeles[$f], $issues['appel-' . $f]['modele_servi'], $f);
        }
    }

    /**
     * The key of a call: the instance's, from its provider's variable; a
     * personal key at Anthropic only — refused for any other provider,
     * whatever the vault holds, before anything is read —; an unknown
     * provider, none.
     */
    public function testAPersonalKeyNeverLeavesAnthropic(): void
    {
        $pdo = $this->createStub(\PDO::class);
        $runKey = new RunKey($pdo, new Twin9Config(new SettingsRepository($pdo)));
        TestDb::setEnv('SODIUM_MASTER_KEY', str_repeat('ab', 32));
        TestDb::setEnv('OPENAI_API_KEY', 'cle-openai-factice');
        TestDb::setEnv('MISTRAL_API_KEY', '');
        try {
            foreach (array_keys(Fournisseurs::REGISTRE) as $f) {
                if ($f !== 'anthropic') {
                    self::assertNull($runKey->pour(7, 'personnelle', $f), "$f : jamais une clé personnelle");
                }
            }
            self::assertSame('cle-openai-factice', $runKey->pour(7, 'instance', 'openai'));
            self::assertNull($runKey->pour(7, 'instance', 'mistral'), 'sans clé de l’instance, aucune');
            self::assertNull($runKey->pour(7, 'instance', 'ollama'), 'un fournisseur inconnu');
        } finally {
            TestDb::restoreEnv();
        }
    }

    /** A request whose address is not its provider's never leaves. */
    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testARequestOutsideItsProvidersAddressNeverLeaves(): void
    {
        self::assertTrue(EngineLoader::load(\dirname(__DIR__) . '/fixtures/twin9-factice'));
        $detourne = new class implements Appelant {
            public function fournisseur(): string
            {
                return 'openai';
            }

            public function requete(string $cle, array $reglage, string $prompt): array
            {
                return ['url' => 'https://ailleurs.example/v1/chat/completions', 'headers' => ['authorization' => 'Bearer ' . $cle],
                        'body' => '{}'];
            }

            public function lire(int $status, array $headers, string $body): array
            {
                return ['ok' => false, 'erreur' => 'x'];
            }
        };
        $http = new FakeMultiHttpClient(static fn (array $r): array => ['body' => '{}']);
        $direct = new DirectCalls($http, new Registre(['openai' => $detourne]));
        try {
            $direct->send(1, new Call('a', 'greffier', 'greffier', 'm', 'p'), ['fournisseur' => 'openai', 'modele' => 'm',
                'budget_sortie' => 1, 'effort' => null, 'reflexion' => 'coupee', 'voie' => 'directe'], 'k', microtime(true) + 5);
            self::fail('une adresse hors du registre');
        } catch (\LogicException) {
        }
        self::assertSame([], $http->requests);
        self::assertSame(0, $direct->running());
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
