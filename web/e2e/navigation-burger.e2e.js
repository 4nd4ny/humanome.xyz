// Traçabilité — exigence « refonte ergonomie/navigation » : ce scénario prouve
// les comportements PUREMENT CSS invisibles en jsdom (Vitest) :
//   • point 1 : survol de la zone du bouton Menu -> le panneau s'ouvre en
//     desktop (@media hover: hover), tap en mobile ;
//   • point 2 : tiroir qui glisse depuis le bord GAUCHE (translateX), hors
//     écran au repos, clic/tap extérieur referme ;
//   • point 3 : épinglé, le contenu est docké (padding-left) à >= 921 px,
//     superposé en dessous ; l'épinglage survit à un rechargement (localStorage) ;
//   • point 4 : la grappe .app-header-actions (thème + ? + Menu) reste fixe
//     au défilement ;
//   • sprint 1 (2026-10-22), au doigt : cibles de 44 px (@media pointer:
//     coarse), croix « Fermer le menu » à la place de la punaise sous 921 px,
//     espaces de la cartographie sur une ligne qui défile sous 768 px.
// LOCAL UNIQUEMENT (docs/tests-e2e.md) : joué contre le dev-server Vite lancé
// par Playwright (webServer). Session anonyme : aucun état serveur requis.

import { test, expect } from '@playwright/test'

const PANEL = '.app-nav-panel'

/**
 * Sur un écran à survol, le tiroir rétracté laisse dépasser une languette de
 * 10 px au bord gauche (repère visuel, `189f20e`) ; sans survol (tactile), il
 * est entièrement hors écran.
 */
const SLIVER = 10

/** Bord gauche du panneau, une fois sa transition terminée. */
const panelLeft = async (page) => (await page.locator(PANEL).boundingBox()).x

/** Bord droit du panneau en px : <= ~0 = complètement hors écran (rétracté). */
async function panelRightEdge(page) {
  const box = await page.locator(PANEL).boundingBox()
  return box.x + box.width
}

test.describe('desktop (survol)', () => {
  test('le survol du bouton Menu ouvre le tiroir gauche, la sortie le rétracte après le délai de grâce', async ({
    page,
  }) => {
    await page.goto('/#/')

    // Au repos : tiroir hors écran à gauche, seule sa languette dépasse.
    expect(await panelRightEdge(page)).toBeLessThanOrEqual(SLIVER + 1)

    await page.getByRole('button', { name: 'Menu de navigation' }).hover()
    await expect.poll(() => panelRightEdge(page)).toBeGreaterThan(300)
    // Ouvert, le tiroir affleure le bord GAUCHE de l'écran (fin de la transition).
    await expect.poll(() => panelLeft(page)).toBe(0)
    await expect(
      page.locator(PANEL).getByRole('link', { name: 'Référentiel', exact: true }),
    ).toBeVisible()

    // Sortie du survol : rétraction après le délai de grâce (0,32 s + 0,2 s).
    await page.mouse.move(640, 500)
    await expect.poll(() => panelRightEdge(page)).toBeLessThanOrEqual(SLIVER + 1)
  })

  test('épinglé : contenu docké à 1280 px, superposé à 920 px ; l’épinglage survit au rechargement', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/#/')

    await page.getByRole('button', { name: 'Menu de navigation' }).click()
    await page.getByRole('button', { name: 'Épingler le panneau ouvert' }).click()

    const paddingLeft = () =>
      page.locator('.app-main').evaluate((el) => getComputedStyle(el).paddingLeft)

    // >= 921 px : le tiroir devient une vraie barre latérale, le contenu est décalé.
    await expect.poll(paddingLeft).toBe('320px')
    expect((await page.locator(PANEL).boundingBox()).x).toBe(0)
    // La punaise suffit : pas de croix « Fermer le menu » à cette largeur.
    await expect(page.getByRole('button', { name: 'Fermer le menu' })).toBeHidden()

    // Persistance (localStorage 'humanome-menu-pinned') : survit au rechargement.
    await page.reload()
    await expect.poll(paddingLeft).toBe('320px')
    expect(
      await page
        .getByRole('button', { name: 'Détacher le panneau' })
        .getAttribute('aria-pressed'),
    ).toBe('true')

    // Sous le seuil (920 px) : toujours épinglé/ouvert mais EN SUPERPOSITION.
    await page.setViewportSize({ width: 920, height: 800 })
    expect(parseFloat(await paddingLeft())).toBeLessThan(30)
    expect((await page.locator(PANEL).boundingBox()).x).toBe(0)
    // Sans dock, la punaise cède la place à la croix, qui détache et referme.
    await expect(page.getByRole('button', { name: 'Détacher le panneau' })).toBeHidden()
    await page.getByRole('button', { name: 'Fermer le menu' }).click()
    await expect.poll(() => panelRightEdge(page)).toBeLessThanOrEqual(SLIVER + 1)
  })

  test('au défilement, la grappe d’actions (thème + aide + Menu) reste visible en haut à droite', async ({
    page,
  }) => {
    await page.goto('/#/referentiel')
    await expect(
      page.getByRole('heading', { name: 'Référentiel de compétences' }),
    ).toBeVisible()

    await page.evaluate(() => window.scrollTo(0, 1600))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(600)

    // position: fixed — la grappe reste dans la fenêtre, collée en haut.
    const box = await page.locator('.app-header-actions').boundingBox()
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeLessThan(60)
    await expect(page.getByRole('button', { name: 'Menu de navigation' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Passer au thème/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Aide sur cette rubrique' })).toBeVisible()
  })
})

test.describe('mobile (tap)', () => {
  // Émulation mobile chromium : (hover: none) -> pas d'ouverture au survol,
  // le tap sur le bouton est la seule entrée ; tap extérieur referme.
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('le tap ouvre le tiroir depuis le bord gauche, un tap extérieur le referme', async ({
    page,
  }) => {
    await page.goto('/#/')
    expect(await panelRightEdge(page)).toBeLessThanOrEqual(1)

    await page.getByRole('button', { name: 'Menu de navigation' }).tap()
    await expect.poll(() => panelRightEdge(page)).toBeGreaterThan(300)
    await expect.poll(() => panelLeft(page)).toBe(0)

    // Tap hors du panneau (le tiroir fait 320 px de large) -> fermeture.
    await page.touchscreen.tap(370, 500)
    await expect.poll(() => panelRightEdge(page)).toBeLessThanOrEqual(1)
  })

  // Sprint 1, améliorations 1 et 2 : au doigt, chaque commande de l'en-tête et
  // du tiroir fait au moins 44 px ; sous 921 px, la croix « Fermer le menu »
  // remplace la punaise (pas de dock possible) et rend le focus au bouton Menu.
  test('au doigt : cibles de 44 px, croix « Fermer le menu » à la place de la punaise', async ({ page }) => {
    await page.goto('/#/')
    // Précondition : l'émulation mobile expose bien un pointeur grossier.
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)

    const header = [
      page.getByRole('button', { name: 'Menu de navigation' }),
      page.getByRole('button', { name: /Passer au thème/ }),
      page.getByRole('button', { name: 'Aide sur cette rubrique' }),
      page.getByRole('button', { name: 'Assistant : poser une question sur le site' }),
    ]
    for (const control of header) {
      const box = await control.boundingBox()
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.width).toBeGreaterThanOrEqual(44)
    }
    // La grappe tient dans la largeur, sans déborder à gauche.
    expect((await page.locator('.app-header-actions').boundingBox()).x).toBeGreaterThan(0)

    await page.getByRole('button', { name: 'Menu de navigation' }).tap()
    await expect.poll(() => panelLeft(page)).toBe(0)
    await expect(page.locator('.app-pin')).toBeHidden()
    const close = page.getByRole('button', { name: 'Fermer le menu' })
    await expect(close).toBeVisible()
    const closeBox = await close.boundingBox()
    expect(closeBox.height).toBeGreaterThanOrEqual(44)
    expect(closeBox.width).toBeGreaterThanOrEqual(44)
    const link = await page.locator(PANEL).getByRole('link', { name: 'Référentiel', exact: true }).boundingBox()
    expect(link.height).toBeGreaterThanOrEqual(44)
    // L'interrupteur « Mode expert », au bas du tiroir (UC-VIS-06), a la même cible.
    const modeSwitch = await page.locator(PANEL).getByRole('switch', { name: 'Mode expert' }).boundingBox()
    expect(modeSwitch.height).toBeGreaterThanOrEqual(44)

    await close.tap()
    await expect.poll(() => panelRightEdge(page)).toBeLessThanOrEqual(1)
    await expect(page.getByRole('button', { name: 'Menu de navigation' })).toBeFocused()
  })

  test('un épinglage gardé d’un grand écran se referme par la croix sur un téléphone', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('humanome-menu-pinned', '1'))
    await page.goto('/#/')
    // Sous 921 px : épinglé = superposé, jamais docké.
    await expect.poll(() => panelLeft(page)).toBe(0)
    await page.getByRole('button', { name: 'Fermer le menu' }).tap()
    await expect.poll(() => panelRightEdge(page)).toBeLessThanOrEqual(1)
    expect(await page.evaluate(() => localStorage.getItem('humanome-menu-pinned'))).toBeNull()
  })

  // Sprint 1, amélioration 3 : les espaces de la cartographie tiennent sur une
  // ligne qui défile de côté, au lieu de s'empiler sur deux ou trois lignes.
  test('cartographie : les espaces tiennent sur une ligne qui défile, onglets de 44 px', async ({ page }) => {
    await page.goto('/#/cartographie')
    // Sans fichiers à soi : la démonstration (données servies par Vite).
    await page.getByRole('button', { name: 'Explorer la démonstration' }).tap()
    const spaces = page.getByRole('navigation', { name: 'Espaces de la cartographie' })
    await expect(spaces.getByRole('link', { name: 'Export' })).toBeAttached()

    const tops = await spaces.getByRole('link').evaluateAll((links) => links.map((a) => a.getBoundingClientRect().top))
    // Visiteur en mode simple (UC-VIS-06) : cinq espaces, « Comparaison » n'est pas listé.
    expect(tops.length).toBeGreaterThanOrEqual(5)
    expect(new Set(tops).size).toBe(1)
    for (const box of await spaces.getByRole('link').evaluateAll((links) => links.map((a) => a.getBoundingClientRect().height))) {
      expect(box).toBeGreaterThanOrEqual(44)
    }

    // La bande défile : plus large que l'écran, la page, elle, ne déborde pas.
    const { scrollWidth, clientWidth } = await spaces.evaluate((nav) => ({ scrollWidth: nav.scrollWidth, clientWidth: nav.clientWidth }))
    expect(scrollWidth).toBeGreaterThan(clientWidth)
    await spaces.evaluate((nav) => nav.scrollTo({ left: nav.scrollWidth }))
    await expect.poll(() => spaces.evaluate((nav) => nav.scrollLeft)).toBeGreaterThan(0)
    await spaces.getByRole('link', { name: 'Export' }).tap()
    await expect(page).toHaveURL(/#\/cartographie\/export$/)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})
