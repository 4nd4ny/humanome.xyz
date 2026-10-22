// Les fournisseurs d'un profil Twin9 lus côté page (ADR-012) : ce que la
// configuration montre et ce que l'accord du lancement nommera doit dire ce
// que le serveur fera. Les tables recopiées du PHP (étage de chaque étape,
// libellés et motifs de modèle du registre) sont comparées aux fichiers PHP
// versionnés, comme UC-CPT-04-U12 lit KeyVault::PROVIDERS.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import v98 from '../../../../api/config/twin9-profil-v98.json'
import {
  ETAPES,
  FOURNISSEURS,
  LIBELLES_FOURNISSEURS,
  MOTIFS_MODELE,
  REFLEXION_PARAMS,
  RGPD_FOURNISSEURS,
  clePrix,
  depuisClePrix,
  etageDeLEtape,
  familleDefaut,
  fournisseurDe,
  fournisseurHerite,
  fournisseursDuProfil,
  libelleChoix,
  libelleRgpd,
  modeleAdmis,
  objetDe,
  suivreLeFournisseur,
} from './profilSchema.js'

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const php = (chemin) => readFileSync(resolve(racine, chemin), 'utf8')

/** Fournisseurs::REGISTRE : identifiant → {libelle, rgpd, motif}, dans son ordre. */
function registre() {
  const source = php('api/src/Twin9/Fournisseurs/Fournisseurs.php')
  const entrees = [
    ...source.matchAll(/'(\w+)' => \[\s*'libelle' => '([^']+)', 'rgpd' => '(\w+)'[\s\S]*?'motif_modele' => '([^']+)'/g),
  ]
  if (entrees.length === 0) throw new Error('Fournisseurs::REGISTRE introuvable')
  return entrees.map(([, id, libelle, rgpd, motif]) => ({ id, libelle, rgpd, motif: motif.slice(1, -1) }))
}

/** Twin9Config::REFLEXION_PARAMS : fournisseur → valeurs. */
function reflexionParams() {
  const bloc = /const REFLEXION_PARAMS = \[([\s\S]*?)\];/.exec(php('api/src/Twin9/Twin9Config.php'))
  if (!bloc) throw new Error('Twin9Config::REFLEXION_PARAMS introuvable')
  return Object.fromEntries(
    [...bloc[1].matchAll(/'(\w+)' => \[([^\]]*)\]/g)].map(([, f, valeurs]) => [f, [...valeurs.matchAll(/'(\w+)'/g)].map((v) => v[1])]),
  )
}

/** CallSettings::ETAGES : étape → étage. */
function etagesPhp() {
  const bloc = /const ETAGES = \[([^\]]*)\]/.exec(php('api/src/Twin9/CallSettings.php'))
  if (!bloc) throw new Error('CallSettings::ETAGES introuvable')
  return Object.fromEntries([...bloc[1].matchAll(/'(\w+)' => '(\w+)'/g)].map(([, etape, etage]) => [etape, etage]))
}

const copie = () => structuredClone(v98)

describe('profilSchema — fournisseurs (ADR-012)', () => {
  it('reprend le registre PHP : ses fournisseurs dans son ordre, leurs libellés, leurs motifs de modèle', () => {
    const r = registre()
    expect(FOURNISSEURS).toEqual(r.map((f) => f.id))
    expect(LIBELLES_FOURNISSEURS).toEqual(Object.fromEntries(r.map((f) => [f.id, f.libelle])))
    expect(RGPD_FOURNISSEURS).toEqual(Object.fromEntries(r.map((f) => [f.id, f.rgpd])))
    expect(REFLEXION_PARAMS).toEqual(reflexionParams())
    expect(Object.fromEntries(Object.entries(MOTIFS_MODELE).map(([id, motif]) => [id, motif.source]))).toEqual(
      Object.fromEntries(r.map((f) => [f.id, f.motif])),
    )
    expect(libelleChoix('mistral')).toBe('Mistral AI')
    expect(libelleRgpd('sous_conditions')).toBe('RGPD : sous conditions')
  })

  it('la clé d’un modèle dans la grille des prix : nue chez Anthropic, « fournisseur:modèle » sinon, comme Fournisseurs::clePrix', () => {
    expect(clePrix('anthropic', 'claude-haiku-5-5')).toBe('claude-haiku-5-5')
    expect(clePrix('mistral', 'modele-fictif')).toBe('mistral:modele-fictif')
    expect(depuisClePrix('mistral:modele-fictif')).toEqual(['mistral', 'modele-fictif'])
    expect(depuisClePrix('openrouter:editeur/modele')).toEqual(['openrouter', 'editeur/modele'])
    expect(depuisClePrix('claude-haiku-5-5')).toEqual(['anthropic', 'claude-haiku-5-5'])
    expect(depuisClePrix('inconnu:modele')).toEqual(['anthropic', 'inconnu:modele'])
    expect(depuisClePrix('anthropic:modele')).toEqual(['anthropic', 'anthropic:modele'])
  })

  it('lit l’étage de chaque étape dans le schéma, comme CallSettings::ETAGES', () => {
    const etages = etagesPhp()
    expect(Object.keys(etages).sort()).toEqual([...ETAPES].sort())
    for (const etape of ETAPES) expect(etageDeLEtape(etape), etape).toBe(etages[etape])
  })

  it('un modèle suit le motif de son fournisseur : claude-… chez Anthropic seul, un slug sans suffixe chez OpenRouter', () => {
    expect(modeleAdmis('anthropic', 'claude-haiku-5-5')).toBe(true)
    expect(modeleAdmis('openai', 'claude-haiku-5-5')).toBe(false)
    expect(modeleAdmis('mistral', 'modele-fictif')).toBe(true)
    expect(modeleAdmis('google', 'modele/fictif')).toBe(false)
    expect(modeleAdmis('openrouter', 'editeur/modele-fictif')).toBe(true)
    expect(modeleAdmis('openrouter', 'editeur/modele-fictif:free')).toBe(false)
    expect(modeleAdmis('inconnu', 'modele')).toBe(false)
    expect(familleDefaut('openrouter', 'editeur/modele-fictif')).toBe('editeur')
    expect(familleDefaut('mistral', 'modele-fictif')).toBe('mistral')
  })

  it('l’héritage : Anthropic pour un étage, son étage pour une étape, l’étage des lecteurs pour un lecteur, aucun au second ressort', () => {
    const profil = copie()
    profil.etages.rapide.fournisseur = 'mistral'
    profil.etages.lecteurs.fournisseur = 'openai'
    expect(objetDe(['etapes', 'greffier', 'fournisseur'])).toEqual(['etapes', 'greffier'])
    expect(objetDe(['college', 0, 'modele'])).toEqual(['college', 0])
    expect(objetDe(['voie'])).toBeNull()
    expect(fournisseurHerite(profil, ['etages', 'rapide'])).toBe('anthropic')
    expect(fournisseurDe(profil, ['etapes', 'greffier'])).toBe('mistral')
    expect(fournisseurDe(profil, ['etapes', 'president'])).toBe('anthropic')
    expect(fournisseurDe(profil, ['college', 0])).toBe('openai')
    expect(fournisseurHerite(profil, ['etapes', 'second_ressort'])).toBeNull()
  })

  it('les fournisseurs atteints, dans l’ordre du registre, avec leur voie ; l’étage des lecteurs seul n’en ajoute aucun', () => {
    expect(fournisseursDuProfil(v98)).toEqual([{ id: 'anthropic', voie: 'lots' }])
    const profil = copie()
    profil.voie = 'directe'
    expect(fournisseursDuProfil(profil)).toEqual([{ id: 'anthropic', voie: 'directe' }])

    // les lecteurs tous ailleurs : l'étage des lecteurs, qu'aucun appel ne prend, ne compte pas
    profil.voie = 'lots'
    profil.etages.lecteurs = { ...profil.etages.lecteurs, fournisseur: 'openai', modele: 'modele-fictif' }
    profil.college[0] = { nom: 'haiku', fournisseur: 'anthropic', modele: 'claude-haiku-5-5' }
    expect(fournisseursDuProfil(profil)).toEqual([{ id: 'anthropic', voie: 'lots' }])

    // un lecteur, une étape et le second ressort ailleurs
    profil.college.push({ nom: 'tiers', fournisseur: 'openrouter', modele: 'editeur/modele-fictif' })
    profil.etapes = { greffier: { fournisseur: 'mistral', modele: 'modele-fictif' }, second_ressort: { fournisseur: 'xai', modele: 'modele-fictif' } }
    expect(fournisseursDuProfil(profil)).toEqual([
      { id: 'anthropic', voie: 'lots' },
      { id: 'mistral', voie: 'directe' },
      { id: 'xai', voie: 'directe' },
      { id: 'openrouter', voie: 'directe' },
    ])
  })

  it('un lecteur qui change de fournisseur perd la famille qui suivait l’ancien et un modèle que le nouveau n’admet pas', () => {
    const avant = copie()
    avant.college[0] = { ...avant.college[0], modele: 'claude-haiku-5-5', effort: 'low' }
    const apres = structuredClone(avant)
    apres.college[0].fournisseur = 'mistral'
    const suite = suivreLeFournisseur(avant, apres, ['college', 0], v98)
    expect(suite.college[0]).toEqual({ nom: 'haiku', poids: 1.0, passes: 3, fournisseur: 'mistral' })

    // une famille choisie, autre que celle du fournisseur, reste ; un modèle admis aussi
    const garde = structuredClone(avant)
    garde.college[0] = { nom: 'a', famille: 'famille-choisie', modele: 'modele-fictif' }
    const change = structuredClone(garde)
    change.college[0].fournisseur = 'mistral'
    expect(suivreLeFournisseur(garde, change, ['college', 0], v98).college[0]).toEqual({
      nom: 'a',
      famille: 'famille-choisie',
      modele: 'modele-fictif',
      fournisseur: 'mistral',
    })
  })

  it('un étage garde un modèle, qu’il requiert : à choisir ailleurs qu’Anthropic, celui du profil v9.8 au retour', () => {
    const avant = copie()
    avant.etages.rapide.effort = 'low'
    const tiers = structuredClone(avant)
    tiers.etages.rapide.fournisseur = 'mistral'
    const chezMistral = suivreLeFournisseur(avant, tiers, ['etages', 'rapide'], v98)
    expect(chezMistral.etages.rapide).toEqual({ fournisseur: 'mistral', modele: '', budget_sortie: 16000, reflexion: 'coupee' })

    const retour = structuredClone(chezMistral)
    delete retour.etages.rapide.fournisseur
    expect(suivreLeFournisseur(chezMistral, retour, ['etages', 'rapide'], v98).etages.rapide).toEqual(v98.etages.rapide)
  })

  it('le même fournisseur, nommé ou hérité, ne change rien', () => {
    const avant = copie()
    const apres = structuredClone(avant)
    apres.etapes.greffier = { fournisseur: 'anthropic' }
    expect(suivreLeFournisseur(avant, apres, ['etapes', 'greffier'], v98)).toBe(apres)
  })
})
