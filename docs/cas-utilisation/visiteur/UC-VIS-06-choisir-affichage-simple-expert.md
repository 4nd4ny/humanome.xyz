# UC-VIS-06 — Choisir l'affichage simple ou expert

| Champ | Valeur |
|---|---|
| **Acteur principal** | Visiteur (aucun compte requis) — le même réglage vaut pour tout utilisateur connecté |
| **Acteurs secondaires** | Tout rôle connecté (défaut selon les rôles de la session) |
| **Portée** | humanome.xyz — interrupteur « Mode expert » au bas du menu, ligne « Affichage » de `#/compte` ; éléments masqués en mode simple : menu (`nav.js`), assistant standard (`#/espace/nouveau-run`), Twin6 (`#/twin6-ouverte`), interface de cartographie (`#/cartographie`) et son espace Export, aide « ? » ; choix gardé dans le navigateur (`localStorage` `humanome-mode`), sans API |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | Sprint 1 (TODO_LIST) : « réfléchir à l'ergonomie du site ; ne pas hésiter à masquer des fonctionnalités en créant un mode expert » ; décisions D1 à D5 du 2026-10-22 |
| **Statut** | Implémenté (lot 1, 2026-10-22 ; le lot 2, la page `#/twin9`, suivra la fusion des lots Twin9 en cours) ; `docs/ergonomie-navigation.md` §5ter |

## Objectif

Laisser chacun choisir la densité de l'affichage : le mode **simple** retire
de la vue des réglages avancés (profils Twin9, versions de prompt, modèles,
espace « Comparaison », réglages fins de l'encodage, outil d'anonymisation),
le mode **expert** les montre tous. Le mode est un réglage d'affichage, jamais
un droit : il ne masque aucune famille de rôle, et toute adresse reste
valide.

## Déclencheur

L'utilisateur ouvre le menu et bascule « Mode expert », ou la ligne
« Affichage » de son compte.

## Préconditions

Aucune. Le mode fonctionne sans compte ni API ; il est lu au montage de
l'application (`web/src/App.jsx`).

## Garanties en cas de succès

- Le choix explicite est gardé dans **ce navigateur** (`humanome-mode` :
  `simple` ou `expert`) et prime sur le défaut des rôles, aux chargements
  suivants comme après une connexion ou une déconnexion.
- L'effet est immédiat, sans rechargement : menu, tuiles de l'accueil, aide
  et pages ouvertes se recalculent ; le tiroir reste ouvert.
- Rien n'est envoyé au serveur ni mesuré (ni télémétrie, ni statistique).

## Garanties minimales (en cas d'échec)

- Stockage illisible ou valeur inconnue : le défaut des rôles s'applique,
  sans erreur (A3).
- Un composant rendu hors du shell (test, copie autonome de la cartographie)
  affiche tout : le défaut du contexte est « expert ».

## Scénario nominal

1. Un visiteur ouvre le site. Sans choix enregistré, il est en mode
   **simple** (défaut d'une session sans rôle de travail).
2. Il ouvre le menu : au bas du tiroir, entre les familles et la
   déconnexion, l'interrupteur « Mode expert » (rôle `switch`, éteint), et sa
   précision « profils Twin9, versions de prompt, modèles, comparaison,
   réglages fins ».
3. Sur `#/cartographie`, l'interface de cartographie liste ses espaces sans
   « Comparaison » ; « Panneaux » ne propose pas « Réglages » ; l'espace
   Export ne propose pas « Préparer une démo ».
4. Il active « Mode expert » : le choix est écrit (`humanome-mode` =
   `expert`), le tiroir reste ouvert, et « Comparaison », « Réglages » et
   « Préparer une démo » paraissent aussitôt.
5. Il recharge la page : le mode expert est toujours actif.

## Scénarios alternatifs

- **A1 — Défaut selon les rôles** (étape 1) : sans choix enregistré, le mode
  est **expert** dès qu'un rôle de travail est en session (cartographe,
  promptologue, épistémiarque, établissement, admin), **simple** sinon
  (visiteur, apprenant seul, employeur, compte sans rôle). Tant que la
  session n'a pas répondu, les rôles valent `[]` : un cartographe passe de
  simple à expert à la réponse de `auth/me`. Le défaut n'est jamais écrit :
  seul un basculement l'est. En mode simple, un apprenant voit « Ma
  cartographie » sans « Cartographie ouverte » (Twin6) ni « Mes profils
  Twin9 » : l'échelle Essayer → Cartographier mes écrits → Analyse
  approfondie reste lisible (D1, option A). En mode expert, « Mes profils
  Twin9 » (`#/configuration`) suit « Analyse approfondie ». L'aperçu d'un
  profil sur l'accueil (« Voir les profils d'utilisateurs ») montre ce que
  ce profil verrait, à son mode par défaut, quel que soit le mode de la
  personne qui regarde.
- **A2 — Lien direct vers un élément masqué** : `#/twin6-ouverte`,
  `#/configuration` et `#/cartographie/comparaison` s'ouvrent en mode simple ;
  l'onglet « Comparaison » s'affiche (marqué courant) tant qu'il est l'espace
  ouvert, puis disparaît quand on en sort.
- **A3 — Stockage bloqué** (navigation privée stricte, accès refusé) : la
  lecture échoue en silence, le défaut des rôles s'applique ; la bascule
  vaut pour la session ouverte et n'est pas gardée.
- **A4 — Aide « ? »** : en mode simple, l'aide de l'espace apprenant
  (`espace`), de la cartographie et de Twin6 ajoute « Des réglages avancés
  existent : activez le « Mode expert » au bas du menu. » ; pas en mode
  expert, pas sur les autres rubriques (Twin9 : avec le lot 2).
- **A5 — Depuis « Mon compte »** : la ligne « Affichage » du profil
  (`#/compte`, à côté de « Rôles » : ce que je fais, ce que je vois) porte la
  même case « Mode expert » ; les deux commandes restent synchronisées. Le
  réglage reste celui du navigateur, pas du compte (D4, V1).
- **A6 — Pages réduites en mode simple** : l'assistant standard (étape 2
  « Référentiel », sans liste de versions de prompt, et étape 3 sans champ
  « Modèle » : UC-APP-02 A8) ; Twin6, sans liste des modèles (UC-APP-09 A8) ;
  l'interface de cartographie (UC-VIS-01 A8) ; « Préparer une démo »
  (UC-APP-06 A6).

## Scénarios d'erreur

- **E1 — Valeur stockée inconnue** (étape 1, une valeur écrite à la main
  dans le navigateur) : ignorée, le défaut des rôles s'applique ; la
  prochaine bascule la remplace.

## Règles de gestion

- **RG1** — Le mode n'est jamais un droit : aucune garde de vue ni du
  serveur ne le lit ; il ne retire jamais une famille de rôle (pour toute
  session, les familles du menu sont les mêmes dans les deux modes) ; un
  visiteur en mode expert garde le menu d'un visiteur.
- **RG2** — Ne sont jamais masqués : le Gestionnaire de la cartographie et
  son point « anomalies à traiter », les espaces Dialogue et Export (ses
  quatre formats), le choix du référentiel (assistant standard, Twin6),
  l'accord, le consentement et l'estimation de coût, les familles de rôle.
  Les écrans des clés personnelles ne passent pas en mode expert : c'est une
  question de conformité (sprint 6).
- **RG3** — Résolution : `mode = choix stocké ?? (un rôle de travail ? expert
  : simple)`. Seul le shell (`App.jsx`) choisit ; la valeur par défaut du
  contexte et de `navGroups` est « expert ».
- **RG4** — Le mode simple n'enregistre que ce qu'il exécute : l'assistant
  standard enregistre le paquet embarqué (`aurora-v3-reconstruit@1.1.0`) et
  le modèle par défaut du fournisseur, Twin6 lance le modèle cible du
  paquet, même si un autre choix avait été fait en mode expert.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Choix du mode (`humanome-mode`) | `localStorage` du navigateur seulement ; jamais envoyé, jamais mesuré ; écrit au basculement |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/lib/ui-mode.js` — `MODE_KEY`, `WORK_ROLES`, `storedMode`, `defaultMode`, `resolvedMode`, `storeMode`, `UiModeContext`, `useUiMode` | Lecture, défaut, résolution, écriture, contexte (RG3, A3, E1) |
| Front | `web/src/App.jsx` | Choix du mode, interrupteur du tiroir, contexte autour des vues, mode transmis au menu, à l'accueil, à l'aide et à la cartographie |
| Front | `web/src/nav.js` — `navGroups({expert})`, attribut d'item `expert` | Items du mode expert (« Cartographie ouverte », « Mes profils Twin9 ») (A1, RG1) |
| Front | `web/src/views/HomeView.jsx`, `web/src/components/FamilyTiles.jsx` | Tuiles au mode de la session ; aperçu d'un profil à son mode par défaut (A1) |
| Front | `web/src/help/registry.js` — `helpFor`, `SIMPLE_MODE_POINT` | Point d'aide du mode simple (A4) |
| Front | `web/src/carto/ui/CartoApp.jsx`, `web/src/carto/ui/ExportPanel.jsx` | « Comparaison », « Réglages », « Préparer une démo » (étape 3, A2, RG2) |
| Front | `web/src/components/RunWizard.jsx`, `web/src/views/Twin6OuverteView.jsx` | Étapes 2 et 3 de l'assistant, liste des modèles de Twin6 (A6, RG4) |
| Front | `web/src/views/AccountView.jsx` — `DisplayModeRow` | Ligne « Affichage » (A5) |
| Front | `web/src/styles/global.css` — `.app-nav-mode` | Interrupteur, cible de 44 px |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-VIS-06-U01 | `defaultMode`, `resolvedMode`, `storedMode`, `storeMode` | Défaut de chacun des 7 rôles, rôle de travail cumulé ; choix stocké qui prime ; stockage qui lève une exception, valeur inconnue (RG3, A1, A3, E1) | `web/test/usecases/unit/uc-vis-06-choisir-affichage-simple-expert.test.jsx` |
| UC-VIS-06-U02 | `navGroups`, `FAMILIES` | Items `expert` (Twin6, profils Twin9) ; pour toute session, mêmes familles et mêmes items hors `expert` ; défaut expert (RG1, A1) | idem |
| UC-VIS-06-U03 | `helpFor` | Point du mode simple sur `cartographie`, `espace`, `twin6ouverte` seulement, absent en mode expert (A4) | idem |
| UC-VIS-06-U04 | `FamilyTiles` | Tuiles au mode de la session ; aperçu de l'apprenant en simple, du cartographe en expert, depuis un visiteur en mode expert (A1) | idem |
| UC-VIS-06-U05 | `CartoApp` | Mode simple : espaces sans « Comparaison », « Panneaux » sans « Réglages », Gestionnaire et son point d'anomalies ; mode expert : tout (étape 3, RG2) | idem |
| UC-VIS-06-U06 | `CartoApp` | `#/cartographie/comparaison` en mode simple : affiché, onglet marqué courant, retiré à la sortie (A2) | idem |
| UC-VIS-06-U07 | `CartoApp`, `ExportPanel` | Export en mode simple : quatre formats, pas « Préparer une démo » ; en mode expert, la carte et son bouton (étape 3) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-VIS-06-F01 | Nominal | IHM | Visiteur, démonstration ouverte : pas de « Comparaison » ; interrupteur éteint et sa précision ; bascule → « Comparaison » aussitôt, tiroir ouvert, `humanome-mode` = `expert` ; nouveau montage : mode expert | `web/test/usecases/functional/uc-vis-06-choisir-affichage-simple-expert.test.jsx` |
| UC-VIS-06-F02 | A1 | IHM | Apprenant seul : simple, « Ma cartographie » sans Twin6 ni profils Twin9, tuiles idem ; apprenant + cartographe : expert, les deux liens ; rien n'est écrit ; bascule en simple : le choix prime, la famille de rôle reste | idem |
| UC-VIS-06-F03 | A2 | IHM | Mode simple : `#/cartographie/comparaison` s'ouvre, onglet marqué courant ; `#/twin6-ouverte` s'ouvre, sans lien au menu | idem |
| UC-VIS-06-F04 | A3 | IHM | `localStorage` qui lève une exception : défaut simple, bascule effective pour la session, menu mis à jour, rien de gardé | idem |
| UC-VIS-06-F05 | A4 | IHM | Aide de `#/espace` en mode simple : le point ; `#/referentiel` : non ; après bascule : non | idem |
| UC-VIS-06-F06 | A5 | IHM | `#/compte` : ligne « Affichage », case « Mode expert » ; la cocher bascule l'interrupteur du tiroir et l'écrit ; l'inverse aussi | idem |
| UC-VIS-06-F07 | RG1 | IHM | Visiteur en mode expert : menu d'un visiteur ; `#/configuration` : la garde du serveur (« … pour régler vos runs Twin9 ») | idem |
| UC-VIS-06-F08 | RG2 | IHM | Mode simple : Gestionnaire présent, « Panneaux » sans « Réglages », qui revient au passage en mode expert | idem |

### Tests existants liés (non-régression)

- `web/src/lib/ui-mode.test.js` — lecture, écriture, défaut, résolution, contexte.
- `web/src/nav.test.js` (bloc « mode simple / expert »), `web/src/help/registry.test.js` (bloc « mode simple »), `web/src/App.test.jsx` (bloc « mode simple / expert » : interrupteur, persistance, défaut selon le rôle, choix stocké, lien direct).
- `web/src/components/RunWizard.test.jsx`, `web/src/views/Twin6OuverteView.test.jsx` (blocs « mode simple ») ; UC-APP-02-F29, UC-APP-09-F32, UC-APP-06-F18.
- UC-VIS-04-U13 (plan du site exhaustif dans les deux modes), UC-VIS-04-F20 (« Mes profils Twin9 » d'un compte de travail).
- `web/e2e/navigation-burger.e2e.js` (cible de 44 px de l'interrupteur au doigt), `web/e2e/parcours-apprenant.e2e.js` (étape « Référentiel » du mode simple) ; `carto-export.e2e.js` et `carto-soleil.e2e.js` posent le mode expert.

### Exécuter

```sh
cd web && npx vitest run test/usecases/unit/uc-vis-06 test/usecases/functional/uc-vis-06 src/lib/ui-mode.test.js
```

## Limites

- **Persistance par navigateur (V1, D4)** : sur un ordinateur partagé, le
  choix d'une personne vaut pour la suivante ; la persistance par compte
  (V2 : colonne `users.ui_mode`, `uiMode` dans `GET /api/auth/me`, export
  RGPD) est reportée au sprint 8.
- **Lot 2** : la page `#/twin9` (liste des profils, « Régler mes profils »)
  ignore encore le mode ; elle le lira après la fusion des lots Twin9 en
  cours.
- **Affichage réel** : jsdom n'applique pas les styles ; la cible de 44 px
  de l'interrupteur n'est vérifiée qu'en e2e local (Playwright).
- Le mot « mode expert » sert aussi au titre de la formation apprenant
  (« Formation apprenant — mode expert », « Suivre la formation « mode
  expert » ») : sans rapport avec ce réglage ; à renommer si la confusion se
  confirme.

## Anomalies constatées

Aucune.
