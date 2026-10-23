// UC-CPT-07 — Déclarer ses rôles RESPIRE : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/compte/UC-CPT-07-declarer-roles-respire.md
//
// L'export RGPD (web/src/lib/archive.js, archive 1.3.0) appelé directement,
// réseau simulé : la déclaration du compte, lue par
// GET api/auth/me/declared-roles, part dans `account.declaredRoles`, à part
// des habilitations (`account.roles`) ; illisible, elle est omise sans
// empêcher l'export ; jamais réimportée.
import { describe, expect, it, vi } from 'vitest'
import { validateDocument } from '@engine/validation.js'
import { ARCHIVE_SCHEMA_VERSION, exportArchive, importArchive } from '../../../src/lib/archive.js'
import { createMemoryAdapter as cartoMemory, createCartoStore } from '../../../src/lib/carto-store.js'
import { createMemoryAdapter as portfolioMemory, createPortfolioStore } from '../../../src/lib/portfolio-store.js'
import { createCartoStore as createInterfaceStore, createMemoryAdapter as interfaceMemory } from '../../../src/carto/core/store.js'
import referentiel from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import { jsonResponse, routedFetch } from '../support/appl-http.js'

const MAYA = { id: 7, email: 'maya@example.org', displayName: 'Maya', roles: ['apprenant'], hasAvatar: false }

function stores() {
  return {
    cartoStore: createCartoStore(cartoMemory(), { now: () => '2026-01-08T10:00:00.000Z' }),
    portfolioStore: createPortfolioStore(portfolioMemory(), { now: () => '2026-01-08T09:00:00.000Z' }),
    interfaceStore: createInterfaceStore({ adapter: interfaceMemory() }),
  }
}

/** Export par le compte de la session ; le réseau simulé sert /auth/me et, si donnée, la déclaration. */
async function exportWith(declared) {
  const routes = [['api/auth/me', () => jsonResponse(200, { user: MAYA, csrfToken: 'c' })]]
  if (declared !== undefined) routes.push(['api/auth/me/declared-roles', declared])
  const fetchFn = routedFetch(routes)
  const out = await exportArchive({
    ...stores(),
    fetchFn,
    getReferentiel: async () => ({ doc: referentiel }),
    getPromptPackages: async () => [],
    getMassDocuments: async () => [],
    getTwin9: async () => ({ data: null, error: null }),
    download: vi.fn(),
    now: () => new Date('2026-10-22T08:30:00.000Z'),
  })
  return { ...out, fetchFn }
}

describe('UC-CPT-07 — l’export RGPD porte les rôles déclarés (archive 1.3.0)', () => {
  it('UC-CPT-07-U12 — exportArchive : la déclaration dans account.declaredRoles, à part des habilitations (account.roles) ; archive conforme, lecture seule', async () => {
    const { archive, fetchFn } = await exportWith(() =>
      jsonResponse(200, {
        roles: ['cartographe', 'maitre-du-grimoire'],
        foundingCircle: true,
        catalogue: [{ id: 'cartographe', label: 'Cartographe' }],
      }),
    )

    expect(ARCHIVE_SCHEMA_VERSION).toBe('1.3.0')
    expect(archive.schemaVersion).toBe('1.3.0')
    expect(archive.account).toEqual({
      roles: ['apprenant'],
      email: 'maya@example.org',
      displayName: 'Maya',
      declaredRoles: { roles: ['cartographe', 'maitre-du-grimoire'], foundingCircle: true },
    })
    expect(validateDocument('archive-export', archive)).toEqual({ valid: true, errors: [] })
    expect(fetchFn.calls.map((c) => c.url)).toContain('api/auth/me/declared-roles')
    expect(fetchFn.calls.every((c) => (c.init.method ?? 'GET') === 'GET')).toBe(true)
  })

  it('UC-CPT-07-U13 — exportArchive : déclaration illisible (404 d’une API antérieure, 500, réponse mal formée) → champ omis, l’export part ; le schéma refuse une déclaration mal formée', async () => {
    for (const declared of [
      undefined, // route absente : 404 du réseau simulé
      () => jsonResponse(500, { error: 'Erreur interne' }),
      () => jsonResponse(200, { roles: 'cartographe', foundingCircle: true }),
      () => jsonResponse(200, { roles: ['cartographe'] }),
    ]) {
      const { archive } = await exportWith(declared)
      expect(archive.account).toEqual({ roles: ['apprenant'], email: 'maya@example.org', displayName: 'Maya' })
      expect(validateDocument('archive-export', archive).valid).toBe(true)
    }

    const { archive } = await exportWith(() => jsonResponse(200, { roles: [], foundingCircle: false }))
    expect(archive.account.declaredRoles).toEqual({ roles: [], foundingCircle: false })
    for (const declaredRoles of [
      { roles: ['cartographe'] },
      { roles: ['cartographe', 'cartographe'], foundingCircle: false },
      { roles: ['cartographe'], foundingCircle: 'oui' },
      { roles: ['cartographe'], foundingCircle: false, catalogue: [] },
    ]) {
      expect(validateDocument('archive-export', { ...archive, account: { ...archive.account, declaredRoles } }).valid).toBe(false)
    }
  })

  it('UC-CPT-07-U14 — importArchive : une archive 1.3.0 avec déclaration s’importe ; la déclaration n’est pas réimportée (aucune écriture serveur)', async () => {
    const { archive } = await exportWith(() => jsonResponse(200, { roles: ['epistemiarque'], foundingCircle: true }))
    const fetchFn = vi.fn()
    vi.stubGlobal('fetch', fetchFn)
    try {
      const report = await importArchive(JSON.stringify(archive), stores())
      expect(report).toBeTruthy()
      expect(fetchFn).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
