// UC-SYS-04 — Construire les données et artefacts dérivés : la carte du site,
// côté front. Fiche : docs/cas-utilisation/systeme/UC-SYS-04-construire-artefacts-derives.md
//
// Le reste de la carte du site est testé dans
// engine/test/usecases/unit/uc-sys-04-carte-du-site.test.js. Ce test-ci a
// besoin du contenu des guides tel que le bundle l'embarque
// (formation-content.js, import.meta.glob : sous Vite seulement).
import { describe, expect, it } from 'vitest'
import { PARCOURS_PUBLIES } from '../../../../scripts/lib/site-map.mjs'
import { FORMATION_META, FORMATION_PARCOURS } from '../../../src/views/espace/formation-content.js'

describe('UC-SYS-04 — carte du site : parcours publiés', () => {
  it('UC-SYS-04-U09 — PARCOURS_PUBLIES : les parcours du hub #/guides (FORMATION_PARCOURS), tous publiés par défaut (décision du 2026-10-22), dans l’ordre du hub (FORMATION_META.ordre)', () => {
    expect([...PARCOURS_PUBLIES].sort()).toEqual([...FORMATION_PARCOURS].sort())
    const hubOrder = [...FORMATION_PARCOURS].sort((a, b) => FORMATION_META[a].ordre - FORMATION_META[b].ordre)
    expect(PARCOURS_PUBLIES).toEqual(hubOrder)
  })
})
