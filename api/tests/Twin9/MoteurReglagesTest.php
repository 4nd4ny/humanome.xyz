<?php

declare(strict_types=1);

namespace Humanome\Tests\Twin9;

use Humanome\Twin9\MoteurReglages;
use Humanome\Twin9\ProfilRepository;
use PHPUnit\Framework\TestCase;

/**
 * The engine's settings drawn from a profile (T9, docs/contrats.md §7.1 and
 * §8.1), without the engine: the oracle's comparison is PariteTest's
 * (testTheV98ProfileDrivesTheEngine), which needs Twin_v9.
 */
final class MoteurReglagesTest extends TestCase
{
    public function testTheV98ProfileGivesTheV98Settings(): void
    {
        $profil = ProfilRepository::validate(ProfilRepository::v98());
        $moteur = MoteurReglages::depuis($profil);

        foreach (MoteurReglages::ALGORITHME as $cle) {
            self::assertEquals($profil->{$cle}, $moteur->config->{$cle}, $cle);
        }
        self::assertEquals((object) ['kind' => 'anthropic', 'model' => 'claude-sonnet-5-5', 'model_mini' => 'claude-haiku-5-5'],
            $moteur->config->backend_tribunal);
        self::assertEquals((object) ['kind' => 'anthropic', 'model' => 'claude-haiku-5-5'], $moteur->config->backend_rapide);
        self::assertSame([6, true], [$moteur->config->max_workers, $moteur->config->parallel_jures]);
        self::assertSame([null, false, false, true], [$moteur->jours, $moteur->rescan, $moteur->test, $moteur->memoire]);
    }

    /** Each pass of a reader is a reader of its own, seeded as twin9.py seeds it (the oracle's 02-cloud seeds). */
    public function testTheCollegeIsExpandedAsTheV98ExpandsIt(): void
    {
        $roster = MoteurReglages::depuis(ProfilRepository::validate(ProfilRepository::v98()))->roster;

        self::assertSame(['haiku#1', 'haiku#2', 'haiku#3'], array_column(array_map('get_object_vars', $roster), 'name'));
        self::assertSame([312772185, 1156190753], [$roster[0]->seed, $roster[1]->seed]);
        self::assertSame(['|passe1', 1, 'claude-haiku-5-5', 'anthropic', 1.0],
            [$roster[0]->salt, $roster[0]->passe, $roster[0]->model, $roster[0]->family, $roster[0]->weight]);
    }

    public function testEachSettingComesFromTheProfile(): void
    {
        $profil = ProfilRepository::v98();
        $profil->mode = 'test';
        $profil->jours = 2;
        $profil->memoire = false;
        $profil->jury->mode = 'aleatoire';
        $profil->etages->profond->modele = 'claude-opus-5-5';
        $profil->college = [(object) ['nom' => 'seul', 'famille' => 'anthropic', 'poids' => 2, 'passes' => 1,
                                      'modele' => 'claude-sonnet-5-5']];
        $moteur = MoteurReglages::depuis(ProfilRepository::validate($profil));

        self::assertSame([2, true, false], [$moteur->jours, $moteur->test, $moteur->memoire]);
        self::assertSame('aleatoire', $moteur->config->jury->mode);
        self::assertSame('claude-opus-5-5', $moteur->config->backend_tribunal->model);
        self::assertEquals([(object) ['name' => 'seul', 'kind' => 'anthropic', 'model' => 'claude-sonnet-5-5',
                                      'family' => 'anthropic', 'weight' => 2.0, 'enabled' => true]], $moteur->roster);
        self::assertNotSame($profil->jury, $moteur->config->jury, 'une copie, jamais le profil lui-même');
    }

    /**
     * A backend's kind is its stage's provider, a reader's its own, resolved
     * as its calls are (CallSettings); a reader's family is the one it
     * declares, else its provider's — OpenRouter's vendor, the slug's prefix
     * (ADR-012). The models are invented.
     */
    public function testAMixedProfileGivesEachBackendAndReaderItsProvider(): void
    {
        $profil = ProfilRepository::v98();
        $profil->etages->profond = (object) ['fournisseur' => 'mistral', 'modele' => 'modele-fictif',
                                             'budget_sortie' => 8000, 'reflexion' => 'coupee'];
        $profil->etages->lecteurs = (object) ['fournisseur' => 'openrouter', 'modele' => 'editeur/modele-fictif',
                                              'budget_sortie' => 8000, 'reflexion' => 'coupee'];
        $profil->college = [
            (object) ['nom' => 'herite', 'passes' => 2],
            (object) ['nom' => 'claude', 'fournisseur' => 'anthropic', 'modele' => 'claude-haiku-5-5'],
            (object) ['nom' => 'declare', 'fournisseur' => 'openai', 'modele' => 'modele-fictif-2', 'famille' => 'maison'],
        ];
        $valide = ProfilRepository::validate($profil);
        $moteur = MoteurReglages::depuis($valide);

        self::assertEquals((object) ['kind' => 'mistral', 'model' => 'modele-fictif', 'model_mini' => 'claude-haiku-5-5'],
            $moteur->config->backend_tribunal);
        self::assertEquals((object) ['kind' => 'anthropic', 'model' => 'claude-haiku-5-5'], $moteur->config->backend_rapide);
        $lus = array_map(static fn (\stdClass $m): array => [$m->name, $m->kind, $m->model, $m->family], $moteur->roster);
        self::assertSame([
            ['herite#1', 'openrouter', 'editeur/modele-fictif', 'editeur'],
            ['herite#2', 'openrouter', 'editeur/modele-fictif', 'editeur'],
            ['claude', 'anthropic', 'claude-haiku-5-5', 'anthropic'],
            ['declare', 'openai', 'modele-fictif-2', 'maison'],
        ], $lus);
        self::assertSame(['editeur', 'anthropic', 'maison'],
            array_map(static fn (\stdClass $l): string => MoteurReglages::famille($valide, $l), $valide->college));
    }
}
