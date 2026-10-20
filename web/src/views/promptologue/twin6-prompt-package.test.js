// D1/AD-D1 — le paquet prompt-package « twin6-ouverte » importé publié dans
// l'atelier DÉRIVE DU MÊME CORPUS que le paquet statique public servi par
// #/twin6-ouverte : les textes scan-pole / kairos / fiches P1..P7 sont
// byte-identiques (source unique, aucune dérive), version par version — la
// 1.0.0 déployée et la 1.1.0, dont les gabarits lisent le référentiel
// (2026-10-20). Le paquet est marqué réservé.
import { describe, expect, it } from 'vitest'
import static100 from '../../../public/data/twin6/twin6-ouverte-1.0.0.json'
import static110 from '../../../public/data/twin6/twin6-ouverte-1.1.0.json'
import { buildTwin6PromptPackageDoc } from '../../../../scripts/build-twin6-prompt-package.mjs'

describe.each([
  ['1.0.0', static100],
  ['1.1.0', static110],
])('twin6-ouverte %s : paquet atelier byte-identique au paquet statique', (version, staticPkg) => {
  const doc = buildTwin6PromptPackageDoc(version)
  const byRole = Object.fromEntries(doc.prompts.map((p) => [p.role, p.texte]))

  it('conforme au schéma prompt-package (kind, id, code)', () => {
    expect(doc.kind).toBe('prompt-package')
    expect(doc.id).toBe('twin6-ouverte')
    expect(doc.version).toBe(version)
    expect(staticPkg.version).toBe(version)
    expect(doc.code.entrypoint).toBe('executerTwin6')
    // Marqueur d'exécution déléguée au moteur Twin6 (jamais l'extraction aurora).
    expect(doc.code.orchestration).toContain('(twin6)')
  })

  it('est marqué réservé au pipeline source-unique', () => {
    expect(doc.metadata.reserved).toBe(true)
  })

  it('scan-pole, kairos et mega-prompt sont byte-identiques au paquet statique', () => {
    expect(byRole['twin6-scan-pole']).toBe(staticPkg.scanPole)
    expect(byRole['twin6-kairos']).toBe(staticPkg.kairos)
    expect(byRole['twin6-mega-prompt']).toBe(staticPkg.megaPrompt)
  })

  it('les 7 fiches sont byte-identiques au paquet statique', () => {
    for (let n = 1; n <= 7; n += 1) {
      expect(byRole[`twin6-fiche-${n}`]).toBe(staticPkg.fiches[String(n)])
    }
  })
})

describe('twin6-ouverte 1.1.0 : les gabarits lisent le référentiel', () => {
  it('scan-pole et kairos portent les variables du référentiel, et non plus RESPIRE v7 en toutes lettres', () => {
    expect(static110.scanPole).toContain("Le numéro d'un des ${NB_POLES} pôles du **référentiel ${REFERENTIEL}** `${POLE}`")
    expect(static110.kairos).toContain('les ${NB_COMPETENCES} verdicts')
    for (const texte of [static110.scanPole, static110.kairos]) {
      expect(texte).not.toContain('RESPIRE')
      expect(texte).not.toContain('X.YY')
    }
    // Le méga-prompt, que le moteur n'exécute pas, reste le protocole manuel de RESPIRE v7.
    expect(static110.megaPrompt).toBe(static100.megaPrompt)
  })
})
