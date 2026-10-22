// Catalogue des routes (sprint 11) — une ligne par nom de route de router.js.
//
// parseHash est impératif (une suite d'expressions) : on ne peut pas
// l'énumérer. La liste est donc DÉCLARÉE ici, puis confrontée par des tests au
// routeur (chaque adresse se résout vers son nom), au `switch` d'App.jsx, au
// menu (nav.js, les deux modes d'affichage) et à l'aide (help/registry.js).
// Elle alimente la carte du site (scripts/lib/site-map.mjs) : le digest de
// l'assistant tuteur, llms.txt, llms-full.txt et sitemap.xml.
//
// Le menu reste la source de l'audience et des badges ; ce catalogue ne dit
// que ce que le menu ne sait pas : les adresses hors menu, leurs modèles, et
// la page d'aide de chaque route. Module pur, sans import (lu par Node au
// build).

/**
 * @typedef {object} RouteEntry
 * @property {string} name nom de route (router.js)
 * @property {string} exemple adresse concrète qui se résout vers `name`
 * @property {string} [modele] adresse telle qu'on l'écrit pour une personne,
 *   quand `exemple` porte une valeur d'exemple (date, jeton) : seule elle est
 *   publiée
 * @property {string[]} [variantes] autres adresses concrètes du même nom
 * @property {Array<{modele: string, exemple: string}>} [modeles] sous-adresses
 *   à compléter (permalien d'une compétence…), avec un exemple concret
 * @property {string | null} aide clé de l'entrée d'aide (HELP_ENTRIES), null
 *   pour une route interne
 * @property {boolean} public la page s'ouvre à un visiteur sans compte (toute
 *   route du menu d'un visiteur l'est ; d'autres aussi, hors de son menu) ;
 *   faux : un compte, un rôle ou un lien reçu est nécessaire
 * @property {boolean} [interne] jamais publiée (lien d'un courriel, ancienne
 *   adresse redirigée)
 */

/** @type {RouteEntry[]} */
export const ROUTE_CATALOGUE = [
  { name: 'home', exemple: '#/', aide: 'home', public: true },
  {
    name: 'cartographie',
    exemple: '#/cartographie',
    variantes: [
      '#/cartographie/gestionnaire',
      '#/cartographie/comparaison',
      '#/cartographie/tableau-de-bord',
      '#/cartographie/dialogue',
      '#/cartographie/export',
      '#/cartographie/partage',
    ],
    modeles: [{ modele: '#/cartographie/jour/AAAA-MM-JJ', exemple: '#/cartographie/jour/2026-03-15' }],
    aide: 'cartographie',
    public: true,
  },
  { name: 'essayer', exemple: '#/essayer', aide: 'essayer', public: true },
  {
    name: 'referentiel',
    exemple: '#/referentiel',
    modeles: [{ modele: '#/referentiel/<code de compétence>', exemple: '#/referentiel/1.01' }],
    aide: 'referentiel',
    public: true,
  },
  { name: 'guides', exemple: '#/guides', aide: 'guides', public: true },
  { name: 'espace', exemple: '#/espace', variantes: ['#/espace/nouveau-run'], aide: 'espace', public: false },
  // Le portfolio reste dans le navigateur, et Twin6 offre un essai sans
  // compte : ouverts à un visiteur, bien que le menu les range sous l'apprenant.
  { name: 'portfolio', exemple: '#/portfolio', aide: 'portfolio', public: true },
  { name: 'twin6ouverte', exemple: '#/twin6-ouverte', aide: 'twin6ouverte', public: true },
  { name: 'twin9', exemple: '#/twin9', aide: 'twin9', public: false },
  // Profils des runs Twin9 (T13) : listé au menu en mode expert seulement,
  // l'adresse reste valide en mode simple (le mode n'est jamais un droit).
  { name: 'configuration', exemple: '#/configuration', aide: 'configuration', public: false },
  { name: 'cartographe', exemple: '#/cartographe', aide: 'cartographe', public: false },
  { name: 'etablissement', exemple: '#/etablissement', aide: 'etablissement', public: false },
  { name: 'promptologue', exemple: '#/promptologue', aide: 'promptologue', public: false },
  { name: 'twin9atelier', exemple: '#/twin9-atelier', aide: 'twin9atelier', public: false },
  { name: 'epistemiarque', exemple: '#/epistemiarque', aide: 'epistemiarque', public: false },
  { name: 'admin', exemple: '#/admin', aide: 'admin', public: false },
  { name: 'account', exemple: '#/compte', variantes: ['#/compte/credit'], aide: 'account', public: true },
  { name: 'confidentialite', exemple: '#/confidentialite', aide: 'confidentialite', public: true },
  // Vue d'une journée de la démonstration, ouverte depuis la cartographie.
  { name: 'day', exemple: '#/jour/2026-03-15', modele: '#/jour/AAAA-MM-JJ', aide: 'day', public: true },
  // Lien de partage qu'une personne transmet (employeur) : sans lui, rien à voir.
  { name: 'share', exemple: '#/partage/AAAAAAAAAA', modele: '#/partage/<jeton reçu>', aide: 'share', public: false },
  // Lien du courriel de confirmation (D5).
  { name: 'activer', exemple: '#/activer', aide: null, public: false, interne: true },
  // Anciennes adresses de l'interface V3, retirées le 2026-10-14.
  { name: 'redirect', exemple: '#/merge', variantes: ['#/cartographie-v3'], aide: null, public: false, interne: true },
]

/**
 * Entrées d'aide qui ne sont pas des routes : l'employeur est un profil des
 * tuiles de l'accueil (components/FamilyTiles.jsx), sans page propre.
 */
export const AIDE_SANS_ROUTE = ['employeur']
