<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\Twin9\CallSettings;
use Humanome\Twin9\Evaluations;
use Humanome\Twin9\Fournisseurs\Fournisseurs;
use Humanome\Twin9\Lancement;
use Humanome\Twin9\MoteurReglages;
use Humanome\Twin9\ProfilRepository;
use Humanome\Twin9\ReferentielMoteur;
use Humanome\Twin9\RunConfiguration;
use Humanome\Twin9\RunExecution;
use Humanome\Validation;
use PHPUnit\Framework\TestCase;
use stdClass;

/**
 * A run's configuration and execution blocks (P0-1, docs/contrats.md §8.9),
 * without MySQL nor an engine: the configuration, a whitelist of the run's
 * settings — each call's as it is sent, the prices as billed, never the
 * margin, a template, a fiche nor a provider's text —, its fingerprint
 * stable, the engine's versions as the caller read them; the execution, its
 * tables objects even empty; what a cartographe reads of either; the
 * contract (schemas/twin9-run.schema.json) and its fixture, invented.
 */
final class RunConfigurationTest extends TestCase
{
    /** An invented template set, a confidential instruction in it. */
    private const GABARITS = [
        'exemple/etape' => 'Consigne FICTIVE du gabarit, que rien ne doit citer.',
        'exemple/lecture' => 'Lis {$TEXTE}',
    ];

    /** An invented salt, as Lancement draws one. */
    private const SEL = '00112233445566778899aabbccddeeff';

    /** An invented fiche of the invented referential. */
    private const FICHE = 'Fiche FICTIVE de la capacité A1, jamais recopiée.';

    /** An invented price grid, its margin and a model no call uses. */
    private const GRILLE = [
        'marge' => 1.5,
        'modeles' => [
            'claude-haiku-5-5' => ['prix_usd_mtok' => [2, 10],
                                   'palier_long' => ['au_dela_de' => 1000, 'prix_usd_mtok' => [4, 20]]],
            'claude-sonnet-5-5' => ['prix_usd_mtok' => [3, 15]],
            'claude-inutilise' => ['prix_usd_mtok' => [9, 9]],
        ],
    ];

    public function testTheBlockIsAWhitelistOfTheRunsSettings(): void
    {
        $profil = self::v98();
        $bloc = self::bloc($profil);
        $json = json_encode($bloc, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);

        self::assertSame(['schema', 'empreinte', 'sel', 'lance_at', 'moteur', 'profil', 'execution_prevue',
                          'fournisseurs', 'appels', 'college', 'backends', 'algorithme', 'referentiel', 'gabarits',
                          'prix'], array_keys($bloc));
        self::assertSame('twin9-configuration/1', $bloc['schema']);
        self::assertSame(self::SEL, $bloc['sel']);
        self::assertSame('2026-01-05 09:00:00', $bloc['lance_at']);
        // each call's settings as it is sent: CallSettings::resume(), its tables objects, which says every one
        // parEtape() gives
        $reglages = new CallSettings($profil);
        $resume = $reglages->resume();
        self::assertSame(['etages', 'etapes', 'second_ressort', 'lecteurs', 'defaut'], array_keys($bloc['appels']));
        foreach (['etages', 'etapes', 'second_ressort', 'lecteurs'] as $table) {
            self::assertInstanceOf(stdClass::class, $bloc['appels'][$table], $table);
            self::assertSame($resume[$table], (array) $bloc['appels'][$table], $table);
        }
        self::assertSame($resume['defaut'], $bloc['appels']['defaut']);
        $tous = [...array_values((array) $bloc['appels']['etages']), ...array_values((array) $bloc['appels']['etapes']),
                 ...array_values((array) $bloc['appels']['second_ressort']),
                 ...array_values((array) $bloc['appels']['lecteurs']), $bloc['appels']['defaut']];
        foreach ($reglages->parEtape() as $etape => $reglage) {
            self::assertContains($reglage, $tous, $etape);
        }
        self::assertSame(['fournisseur' => 'anthropic', 'voie' => 'lots', 'modele' => 'claude-sonnet-5-5',
                          'budget_sortie' => 16000, 'effort' => null, 'reflexion' => 'coupee'],
            $bloc['appels']['etages']->profond);
        self::assertEquals((object) ['anthropic' => ['libelle' => 'Anthropic', 'rgpd' => 'sous_conditions', 'voie' => 'lots']],
            $bloc['fournisseurs']);
        self::assertSame(['id' => 12, 'nom' => 'Mon profil', 'mode' => 'complet', 'empreinte_reglages' => 'aaaabbbbccccdddd',
                          'signature_evaluations' => Evaluations::signature($profil, Lancement::empreinte(self::GABARITS),
                              ReferentielMoteur::empreinte(self::referentiel()))],
            $bloc['profil']);
        self::assertSame(['voie_anthropic' => 'lots', 'cle' => 'instance',
                          'parallelisme' => ['appels_directs' => 6, 'journees' => 10],
                          'plafonds' => ['budget_usd' => null, 'duree_minutes' => null],
                          'jours' => null, 'rescan' => false, 'memoire' => true], $bloc['execution_prevue']);
        self::assertSame([['nom' => 'haiku', 'famille' => 'anthropic', 'passes' => 3, 'poids' => 1.0]], $bloc['college']);
        self::assertEquals(['tribunal' => (object) ['kind' => 'anthropic', 'model' => 'claude-sonnet-5-5',
                                                    'model_mini' => 'claude-haiku-5-5'],
                            'rapide' => (object) ['kind' => 'anthropic', 'model' => 'claude-haiku-5-5']],
            $bloc['backends']);
        self::assertSame(MoteurReglages::ALGORITHME, array_keys($bloc['algorithme']));
        self::assertSame(['id' => 'fictif', 'version' => '1.0.0', 'label' => 'Fictif',
                          'empreinte' => ReferentielMoteur::empreinte(self::referentiel())], $bloc['referentiel']);
        self::assertEquals(['jeu' => 'v9.8', 'versions' => (object) ['exemple/etape' => 2, 'exemple/lecture' => 1],
                            'empreinte' => Lancement::empreinte(self::GABARITS)], $bloc['gabarits']);

        // the prices as billed — the margin's factor with the instance's key —, of the models its calls use only;
        // the reading of the grid without its error's text
        self::assertEquals(['base' => 'facture', 'unite' => 'USD/MTok', 'remise_lots' => 0.5,
                            'releve' => ['jour' => '2026-01-05', 'statut' => 'echec', 'source' => 'https://prix.exemple.test'],
                            'grille' => (object) [
                                'claude-haiku-5-5' => ['entree' => 3.0, 'sortie' => 15.0,
                                                       'palier_long' => ['au_dela_de' => 1000, 'entree' => 6.0, 'sortie' => 30.0]],
                                'claude-sonnet-5-5' => ['entree' => 4.5, 'sortie' => 22.5]]],
            $bloc['prix']);
        $perso = clone $profil;
        $perso->cle = 'personnelle';
        self::assertSame(['entree' => 3.0, 'sortie' => 15.0],
            (array) self::bloc($perso)['prix']['grille']->{'claude-sonnet-5-5'}, 'sa propre clé : le prix catalogue');

        // never the margin, a template, a fiche, the referential's block nor a provider's text
        self::assertSame([], self::cles(json_decode($json), 'marge'));
        foreach ([self::FICHE, self::GABARITS['exemple/etape'], 'Pôle 1 — A', 'texte du fournisseur', 'claude-inutilise',
                  '"motif"', '"poles"'] as $secret) {
            self::assertStringNotContainsString($secret, $json, $secret);
        }

        // the contract: the block validates, as the run's in the document of the interface
        self::assertSame([], self::valider(json_decode($json)));
    }

    /**
     * Its fingerprint: of all the block but its fingerprint and its launch's
     * date, its keys in any order, the same read again from what the run
     * keeps; another setting, another fingerprint.
     */
    public function testItsFingerprint(): void
    {
        $bloc = self::bloc(self::v98());
        self::assertMatchesRegularExpression('/^[0-9a-f]{16}$/', $bloc['empreinte']);
        self::assertSame($bloc['empreinte'], RunConfiguration::empreinte($bloc));
        $relu = json_decode(json_encode($bloc, JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION), false);
        self::assertSame($bloc['empreinte'], RunConfiguration::empreinte($relu), 'relu tel que le run le garde');
        self::assertSame($bloc['empreinte'], RunConfiguration::empreinte(self::melange($relu)), 'ses clés mélangées');
        self::assertSame($bloc['empreinte'], self::bloc(self::v98(), '2026-02-01 10:00:00')['empreinte'],
            'sa date n’y entre pas');

        $autre = self::v98();
        $autre->etages->profond->budget_sortie = 8000;
        self::assertNotSame($bloc['empreinte'], self::bloc($autre)['empreinte']);
        $direct = self::v98();
        $direct->voie = 'directe';
        self::assertNotSame($bloc['empreinte'], self::bloc($direct)['empreinte'], 'la voie y entre, contrairement aux réglages');
        self::assertNotSame($bloc['empreinte'], self::bloc(self::v98(), sel: str_repeat('ab', 16))['empreinte'],
            'son sel y entre');
        $this->expectException(\InvalidArgumentException::class);
        self::bloc(self::v98(), sel: 'pas-un-sel');
    }

    /**
     * A reader named « 0 », which the profile's pattern admits: the readers
     * stay an object (`{"0": …}`, never a list), the block valid — the
     * account's archive, which references it, with it —, its fingerprint
     * the same read again.
     */
    public function testAReaderNamedZeroKeepsTheReadersAnObject(): void
    {
        $brut = ProfilRepository::v98();
        $brut->college[0]->nom = '0';
        $profil = ProfilRepository::validate($brut);
        $profil->referentiel = (object) ['id' => 'fictif', 'version' => '1.0.0'];
        self::assertTrue(array_is_list((new CallSettings($profil))->resume()['lecteurs']), 'une liste, en PHP');

        $bloc = self::bloc($profil);
        $json = json_encode($bloc, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
        self::assertStringContainsString('"lecteurs":{"0":{"fournisseur":"anthropic"', $json);
        $relu = json_decode($json, false, 512, JSON_THROW_ON_ERROR);
        self::assertSame([], self::valider($relu));
        self::assertSame($bloc['empreinte'], RunConfiguration::empreinte($relu), 'relu tel que le run le garde');
    }

    /** The engine's versions are those the caller read, under its guards: none, null; a wrong type, null. */
    public function testTheEnginesVersionsAsTheCallerReadThem(): void
    {
        self::assertSame(['commit' => null, 'protocole' => null, 'personas' => null, 'scan' => null],
            self::bloc(self::v98())['moteur'], 'le moteur factice n’en donne aucune');
        self::assertSame(['commit' => 'abc1234', 'protocole' => 'protocole-exemple',
                          'personas' => ['version' => 'personas-exemple', 'empreinte' => '1a2b'], 'scan' => null],
            self::bloc(self::v98(), versions: ['commit' => 'abc1234', 'protocole' => 'protocole-exemple',
                'personas' => ['version' => 'personas-exemple', 'empreinte' => '1a2b'], 'scan' => 7])['moteur']);
    }

    /**
     * A cartographe reads neither the prices, nor the caps, nor the key, nor
     * the salt; the fingerprint they read, their owner's, does not let them
     * find those again by trying candidates: what they read, the hidden
     * fields guessed right, still misses the salt.
     */
    public function testACartographeReadsNeitherPricesNorCapsNorTheKey(): void
    {
        $bloc = json_decode(json_encode(self::bloc(self::v98()), JSON_PRESERVE_ZERO_FRACTION), false);
        $lu = RunConfiguration::pourCartographe($bloc);

        self::assertObjectNotHasProperty('prix', $lu);
        self::assertObjectNotHasProperty('sel', $lu);
        self::assertSame(['voie_anthropic', 'parallelisme', 'jours', 'rescan', 'memoire'],
            array_keys((array) $lu->execution_prevue));
        self::assertObjectHasProperty('prix', $bloc, 'le bloc du propriétaire reste entier');
        self::assertSame($bloc->empreinte, $lu->empreinte, 'la même empreinte que son propriétaire');
        self::assertSame([], self::valider($lu));

        // a search that guessed every hidden field right: the margin's prices, the key, the caps
        $devine = json_decode(json_encode($lu, JSON_PRESERVE_ZERO_FRACTION), false);
        $devine->prix = $bloc->prix;
        $devine->execution_prevue->cle = $bloc->execution_prevue->cle;
        $devine->execution_prevue->plafonds = $bloc->execution_prevue->plafonds;
        self::assertNotSame($bloc->empreinte, RunConfiguration::empreinte($devine), 'sans le sel, rien ne se vérifie');
        $devine->sel = $bloc->sel;
        self::assertSame($bloc->empreinte, RunConfiguration::empreinte($devine), 'le sel seul lui manquait');
    }

    /**
     * The execution, from the journal's lines: its breakdowns, its stops,
     * its tables objects even empty — a run without a call yet —; a
     * cartographe reads neither its costs nor its resumptions' budgets.
     */
    public function testTheExecutionsTablesAreObjectsEvenEmpty(): void
    {
        $run = ['statut' => 'en_cours', 'debut_at' => '2026-01-05 09:00:00', 'fin_at' => null, 'duree_active_s' => 12,
                'passes' => 1, 'moteur_ms' => 3, 'commit_debut' => null, 'commit_fin' => null, 'partiel' => false,
                'reprises' => []];
        $zero = ['appels' => 0, 'pannes' => 0, 'tronques' => 0, 'tentatives' => 0, 'jetons_entree' => 0,
                 'jetons_sortie' => 0, 'cout_microusd' => 0, 'lots' => 0];
        $vide = json_encode(RunExecution::depuis('journal', $run, $zero, []), JSON_THROW_ON_ERROR);
        foreach (['par_voie', 'par_fournisseur', 'par_modele', 'servis'] as $table) {
            self::assertStringContainsString('"' . $table . '":{}', $vide, $table);
        }
        self::assertStringContainsString('"reprises":[]', $vide);
        self::assertSame([], self::valider(null, json_decode($vide)));

        $lignes = [
            ['voie_appel' => 'lots', 'modele_appel' => 'claude-haiku-5-5', 'modele_servi' => 'claude-haiku-5-5-servi',
             'statut' => 'repondu', 'stop_reason' => 'end_turn', 'n' => 3, 'entree' => 30, 'sortie' => 9, 'cout' => 6],
            ['voie_appel' => 'lots', 'modele_appel' => 'claude-haiku-5-5', 'modele_servi' => 'claude-haiku-5-5-servi',
             'statut' => 'panne', 'stop_reason' => 'max_tokens', 'n' => 1, 'entree' => 10, 'sortie' => 50, 'cout' => 4],
            ['voie_appel' => 'lots', 'modele_appel' => 'claude-sonnet-5-5', 'modele_servi' => null,
             'statut' => 'panne', 'stop_reason' => 'refusal', 'n' => 1, 'entree' => 5, 'sortie' => 0, 'cout' => 1],
            ['voie_appel' => 'lots', 'modele_appel' => 'claude-sonnet-5-5', 'modele_servi' => null,
             'statut' => 'envoye', 'stop_reason' => null, 'n' => 2, 'entree' => null, 'sortie' => null, 'cout' => null],
        ];
        $compteurs = ['appels' => 7, 'pannes' => 2, 'tronques' => 1, 'tentatives' => 8, 'jetons_entree' => 45,
                      'jetons_sortie' => 59, 'cout_microusd' => 11, 'lots' => 2];
        $bloc = RunExecution::depuis('journal', ['reprises' => [['at' => '2026-01-05 10:00:00', 'budget_usd' => 2.5]]] + $run,
            $compteurs, $lignes);
        self::assertSame(['total' => 7, 'repondus' => 3, 'pannes' => 2, 'tronques' => 1, 'refus' => 1, 'tentatives' => 8],
            $bloc['appels']);
        self::assertSame(['end' => 3, 'max_tokens' => 1, 'context_window' => 0, 'refusal' => 1, 'other' => 0],
            $bloc['arrets']);
        self::assertEquals((object) ['lots' => ['appels' => 7, 'pannes' => 2, 'tronques' => 1, 'jetons_entree' => 45,
                                                'jetons_sortie' => 59, 'cout_microusd' => 11]], $bloc['par_voie']);
        self::assertEquals((object) ['anthropic' => ['appels' => 7, 'pannes' => 2, 'tronques' => 1, 'jetons_entree' => 45,
                                                     'jetons_sortie' => 59, 'cout_microusd' => 11]], $bloc['par_fournisseur']);
        self::assertSame(['claude-haiku-5-5', 'claude-sonnet-5-5'], array_keys((array) $bloc['par_modele']));
        self::assertSame(['appels' => 3, 'pannes' => 1, 'tronques' => 0, 'jetons_entree' => 5, 'jetons_sortie' => 0,
                          'cout_microusd' => 1], $bloc['par_modele']->{'claude-sonnet-5-5'});
        self::assertEquals((object) ['claude-haiku-5-5' => (object) ['claude-haiku-5-5-servi' => 4]], $bloc['servis']);

        $lu = RunExecution::pourCartographe(json_decode(json_encode($bloc), false));
        $texte = json_encode($lu);
        self::assertStringNotContainsString('cout_microusd', $texte);
        self::assertStringNotContainsString('budget_usd', $texte);
        self::assertSame('2026-01-05 10:00:00', $lu->reprises[0]->at);
        self::assertSame([], self::valider(null, $lu));
    }

    /** The contract's providers and GDPR tags are the registry's. */
    public function testTheSchemaKnowsTheRegistrysProviders(): void
    {
        $defs = self::schema()['$defs'];
        self::assertSame(array_keys(Fournisseurs::REGISTRE), $defs['fournisseur']['enum']);
        $tags = array_values(array_unique(array_column(Fournisseurs::REGISTRE, 'rgpd')));
        sort($tags);
        $enum = $defs['rgpd']['enum'];
        sort($enum);
        self::assertSame($tags, $enum);
    }

    /**
     * The fixture, invented, is a valid twin9-run document, its fingerprint
     * its own; its blocks are valid in an account's archive too — the
     * archive references the run's schema.
     */
    public function testTheFixtureIsAValidRunAndItsBlocksAValidArchivesRun(): void
    {
        $racine = \dirname(__DIR__, 3) . '/schemas/fixtures/';
        $doc = json_decode((string) file_get_contents($racine . 'twin9-configuration-exemple.json'), false, 512,
            JSON_THROW_ON_ERROR);
        self::assertSame(['valid' => true, 'errors' => []], Validation::validate('twin9-run', $doc));
        self::assertSame($doc->run->configuration->empreinte, RunConfiguration::empreinte($doc->run->configuration));

        $archive = json_decode((string) file_get_contents($racine . 'archive-export-exemple.json'), false, 512,
            JSON_THROW_ON_ERROR);
        $archive->schemaVersion = '1.2.0';
        $run = (object) ['id' => 42, 'journal' => 'journal-exemple', 'statut' => 'termine', 'profil' => new stdClass(),
                         'portfolio' => (object) ['nom' => 'journal-exemple.md', 'texte' => '## J1'], 'appels' => [],
                         'sorties' => new stdClass(), 'configuration' => $doc->run->configuration,
                         'execution' => $doc->run->execution];
        $archive->analysesTwin9 = (object) ['runs' => [$run], 'cartes' => []];
        self::assertSame(['valid' => true, 'errors' => []], Validation::validate('archive-export', $archive));

        // whole or absent: a null block is not an archive's
        $run->execution = null;
        self::assertFalse(Validation::validate('archive-export', $archive)['valid']);
        unset($run->execution);
        self::assertTrue(Validation::validate('archive-export', $archive)['valid']);
    }

    /** @param array<string, mixed> $versions */
    private static function bloc(stdClass $profil, string $horloge = '2026-01-05 09:00:00', array $versions = [],
                                 string $sel = self::SEL): array
    {
        return RunConfiguration::depuis($profil, 12, 'Mon profil', MoteurReglages::depuis($profil, self::referentiel()),
            ['gabarits' => self::GABARITS, 'versions' => ['exemple/lecture' => 1, 'exemple/etape' => 2]],
            self::referentiel(), 'aaaabbbbccccdddd', self::GRILLE,
            ['jour' => '2026-01-05', 'statut' => 'echec', 'erreur' => 'texte du fournisseur', 'releve_at' => 1,
             'source' => 'https://prix.exemple.test', 'changements' => ['claude-inutilise' => 'x']],
            $versions, new \DateTimeImmutable($horloge), $sel);
    }

    /** The v9.8 profile, its referential the invented one, frozen at its version as a launch freezes it. */
    private static function v98(): stdClass
    {
        $profil = ProfilRepository::validate(ProfilRepository::v98());
        $profil->referentiel = (object) ['id' => 'fictif', 'version' => '1.0.0'];

        return $profil;
    }

    /**
     * An invented referential, as ReferentielMoteur::bloc() gives it to the engine.
     *
     * @return array<string, mixed>
     */
    private static function referentiel(): array
    {
        return ['id' => 'fictif', 'version' => '1.0.0', 'label' => 'Fictif', 'motif' => '[A-B][1-2]',
                'poles' => [['num' => 1, 'nom' => 'A', 'entete' => "# Pôle 1 — A\n",
                             'competences' => [['code' => 'A1', 'nom' => 'Une', 'fiche' => self::FICHE]]]]];
    }

    /**
     * The errors of a run's blocks in the document of the interface.
     *
     * @return array<string, list<string>>
     */
    private static function valider(?stdClass $configuration, ?stdClass $execution = null): array
    {
        return Validation::validate('twin9-run', (object) ['kind' => 'twin9-run', 'run' => (object) [
            'id' => 1, 'journal' => 'journal-fictif', 'statut' => 'en_cours', 'configuration' => $configuration,
            'execution' => $execution]])['errors'];
    }

    /** @return array<string, mixed> */
    private static function schema(): array
    {
        return json_decode((string) file_get_contents(\dirname(__DIR__, 3) . '/schemas/twin9-run.schema.json'), true,
            512, JSON_THROW_ON_ERROR);
    }

    /**
     * Where a key appears, at any depth.
     *
     * @return list<string>
     */
    private static function cles(mixed $valeur, string $cle, string $chemin = ''): array
    {
        $trouves = [];
        if ($valeur instanceof stdClass || \is_array($valeur)) {
            foreach ((array) $valeur as $k => $v) {
                if ((string) $k === $cle) {
                    $trouves[] = $chemin . '/' . $k;
                }
                $trouves = [...$trouves, ...self::cles($v, $cle, $chemin . '/' . $k)];
            }
        }

        return $trouves;
    }

    /** Every object's keys in reverse order, at every depth. */
    private static function melange(mixed $v): mixed
    {
        if ($v instanceof stdClass) {
            return (object) array_map(self::melange(...), array_reverse((array) $v, true));
        }

        return \is_array($v) ? array_map(self::melange(...), $v) : $v;
    }
}
