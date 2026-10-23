// UC-CPT-07 — Déclarer ses rôles RESPIRE : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/compte/UC-CPT-07-declarer-roles-respire.md
//
// L'export RGPD (web/src/lib/archive.js, archive 1.3.0) appelé directement,
// réseau simulé : la déclaration du compte, lue par
// GET api/auth/me/declared-roles, part dans `account.declaredRoles`, à part
// des habilitations (`account.roles`) ; illisible, elle est omise sans
// empêcher l'export ; jamais réimportée. Puis le client de la route
// (web/src/api/declared-roles.js) : sa copie des libellés comparée au
// catalogue PHP, la normalisation, le PUT, et l'absence d'événement de
// session (le shell n'a rien à rafraîchir). La section du profil a ses tests
// dans uc-cpt-07-declarer-roles-respire-vue.test.jsx.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateDocument } from '@engine/validation.js'
import { ApiError, fetchMe, resetApiClient, updateProfile } from '../../../src/api/client.js'
import {
  DECLARED_ROLES,
  FOUNDING_CIRCLE_ELIGIBLE,
  FOUNDING_CIRCLE_LABEL,
  declaredRoleLabel,
  fetchDeclaredRoles,
  normalizeDeclaration,
  saveDeclaredRoles,
} from '../../../src/api/declared-roles.js'
import { phpDeclaredRoles } from '../support/declared-roles-php.js'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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

describe('UC-CPT-07 — le client de la route (web/src/api/declared-roles.js)', () => {
  afterEach(() => resetApiClient())

  it('UC-CPT-07-U15 — la copie des libellés du front est le catalogue PHP (DeclaredRoles::CATALOGUE) : neuf rôles dans l’ordre, mêmes libellés, mêmes rôles éligibles au cercle, même libellé de la case ; jamais une habilitation sans déclaration', () => {
    const php = phpDeclaredRoles()
    expect(php.catalogue).toHaveLength(9)
    expect(DECLARED_ROLES).toEqual(php.catalogue.map(({ id, label }) => ({ id, label })))
    expect([...FOUNDING_CIRCLE_ELIGIBLE]).toEqual(php.eligible)
    expect(FOUNDING_CIRCLE_LABEL).toBe(php.foundingCircleLabel)
    expect(php.catalogue.every((entry) => entry.definition.length > 0 && !entry.definition.includes('\n'))).toBe(true)
    for (const habilitation of ['admin', 'apprenant', 'employeur', 'etablissement']) {
      expect(DECLARED_ROLES.some((role) => role.id === habilitation)).toBe(false)
    }
    expect(Object.values(php.habilitations)).not.toContain('admin')
    expect(declaredRoleLabel('maitre-du-grimoire')).toBe('Maître du grimoire')
    expect(declaredRoleLabel('inconnu')).toBe('inconnu')
  })

  it('UC-CPT-07-U16 — fetchDeclaredRoles / saveDeclaredRoles : GET puis PUT {roles, foundingCircle} avec le jeton CSRF, réponse normalisée, 422 porteur des champs ; aucun événement de session (contrôle : updateProfile en émet un)', async () => {
    const catalogue = phpDeclaredRoles().catalogue
    const calls = []
    const fetchFn = vi.fn(async (url, init = {}) => {
      calls.push({ url, init })
      if (url === 'api/auth/me') return jsonResponse(200, { user: MAYA, csrfToken: 'csrf-7' })
      if (url === 'api/auth/me/declared-roles' && (init.method ?? 'GET') === 'GET') {
        return jsonResponse(200, { roles: ['cartographe', 42], foundingCircle: 'oui', catalogue: [...catalogue, { id: '' }, null] })
      }
      if (url === 'api/auth/me/declared-roles' && init.method === 'PUT') {
        const body = JSON.parse(init.body)
        if (body.foundingCircle && !body.roles.includes('promptagogue')) {
          return jsonResponse(422, { error: 'Validation échouée', fields: { foundingCircle: 'Réservé.' } })
        }
        return jsonResponse(200, { ...body, catalogue })
      }
      if (url === 'api/auth/me' && init.method === 'PATCH') return jsonResponse(200, { user: MAYA })
      return jsonResponse(404, { error: 'absent' })
    })
    await fetchMe({ fetchFn })
    const events = []
    const listener = (event) => events.push(event.type)
    window.addEventListener('humanome:auth', listener)
    try {
      const read = await fetchDeclaredRoles({ fetchFn })
      expect(read.roles).toEqual(['cartographe'])
      expect(read.foundingCircle).toBe(false)
      expect(read.catalogue.map((entry) => entry.id)).toEqual(catalogue.map((entry) => entry.id))
      expect(read.catalogue[0]).toEqual(catalogue[0])

      const saved = await saveDeclaredRoles({ roles: ['promptagogue'], foundingCircle: true }, { fetchFn })
      expect(saved).toEqual(normalizeDeclaration({ roles: ['promptagogue'], foundingCircle: true, catalogue }))
      const put = calls.find((c) => c.init.method === 'PUT')
      expect(JSON.parse(put.init.body)).toEqual({ roles: ['promptagogue'], foundingCircle: true })
      expect(put.init.headers['X-CSRF-Token']).toBe('csrf-7')

      const refused = await saveDeclaredRoles({ roles: [], foundingCircle: true }, { fetchFn }).catch((e) => e)
      expect(refused).toBeInstanceOf(ApiError)
      expect(refused.status).toBe(422)
      expect(refused.fields).toEqual({ foundingCircle: 'Réservé.' })
      // Ni la lecture, ni l'écriture, ni le refus ne préviennent le shell.
      expect(events).toEqual([])

      await updateProfile({ displayName: 'Maya' }, { fetchFn })
      expect(events).toEqual(['humanome:auth'])
    } finally {
      window.removeEventListener('humanome:auth', listener)
    }
  })
})

describe('UC-CPT-07 — le glossaire des rôles (docs/roles.md)', () => {
  it('UC-CPT-07-U21 — le glossaire reprend mot pour mot le catalogue de l’API : une ligne par rôle déclarable, dans l’ordre, avec son libellé, sa définition, son habilitation et la case du cercle', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const doc = readFileSync(resolve(here, '../../../../docs/roles.md'), 'utf8')
    const { catalogue } = phpDeclaredRoles()
    const rows = doc.split('\n').filter((line) => /^\| `[a-z-]+` \| [^|]+ \| [^|]+ \| [^|]+ \| [^|]+ \| [^|]+ \|$/.test(line))
    expect(rows.map((line) => line.split(' | ')[0].slice(3, -1))).toEqual(catalogue.map((entry) => entry.id))
    for (const [index, entry] of catalogue.entries()) {
      const cells = rows[index].split(' | ')
      expect(cells[1]).toBe(entry.label)
      expect(cells[2]).toBe(entry.definition)
      expect(cells[3]).toBe(entry.habilitation ? `\`${entry.habilitation}\`` : 'aucune')
      expect(cells[4]).toBe(entry.foundingCircleEligible ? 'proposée' : '—')
    }
  })
})
