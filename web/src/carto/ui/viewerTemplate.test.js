// Modèle de la copie autonome : lu à côté d'index.html (carto/viewer-template.html),
// donc indisponible depuis une copie du site ouverte en file:// (INSTALL.md §4).
import { describe, expect, it, vi } from 'vitest'
import { DATA_SLOT } from '../core/standalone.js'
import { TEMPLATE_URL, loadViewerTemplate } from './viewerTemplate.js'

const templateFetch = () => vi.fn(async () => ({ ok: true, status: 200, text: async () => `<!doctype html><html><body>${DATA_SLOT}</body></html>` }))

describe('loadViewerTemplate', () => {
  it('lit le modèle à côté d’index.html, une fois par fonction de lecture', async () => {
    const fetchFn = templateFetch()
    expect(await loadViewerTemplate(fetchFn, { protocol: 'https:' })).toContain(DATA_SLOT)
    expect(await loadViewerTemplate(fetchFn, { protocol: 'https:' })).toContain(DATA_SLOT)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn).toHaveBeenCalledWith(TEMPLATE_URL)
  })

  it('file:// : dit que la copie se prépare sur le site en ligne ou via un serveur local, sans tenter la lecture', async () => {
    const fetchFn = templateFetch()
    await expect(loadViewerTemplate(fetchFn, { protocol: 'file:' })).rejects.toThrow(
      /^elle se prépare sur le site en ligne ou via un serveur local \(son modèle ne peut pas être lu depuis un fichier ouvert directement\)$/,
    )
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
