# UC-VIS-07 — Choisir son interface et son thème

| Champ | Valeur |
|---|---|
| **Acteur principal** | Visiteur (aucun compte requis) — le même réglage vaut pour tout utilisateur connecté |
| **Acteurs secondaires** | Aucun |
| **Portée** | humanome.xyz — listes « Interface » et « Thème » au bas du menu (sous « Mode expert ») et dans la ligne « Affichage » de `#/compte` ; bascule soleil/lune de l'en-tête (UC-VIS-04 A5) ; choix gardés dans le navigateur (`localStorage` `humanome-interface`, `humanome-theme`), posés sur `<html>` (`data-interface`, `data-theme`) avant le premier rendu par le script anti-FOUC de `web/index.html` ; sans API |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | Sprint 9 (TODO_LIST, charte graphique) : décision de Christian du 2026-10-23 — « Les trois propositions d'interface sont excellentes. Nous allons les conserver toutes les trois » —, chacune nommée d'après une filière : épistémiarque (proposition A), noèsiologue (B), technomancien (C) |
| **Statut** | Implémenté (lot S9-1, 2026-10-23 : jetons de couleur, sélecteur, persistance ; lot S9-2 : polices et échelle typographique de chaque interface, couleurs littérales hors données passées aux jetons ; lot S9-3 : contrastes prouvés sur les règles des feuilles du site, anneau de focus de l'interface, bordures de champ à 3:1, captures ; correctifs de relecture : encres héritées d'une règle de base, zone du diagramme, champs visés par leur classe, petits intertitres) ; décision : [ADR-014](../../decisions/ADR-014-trois-interfaces.md) |

## Objectif

Laisser chacun choisir l'habillage du site parmi trois interfaces, chacune
en clair et en sombre, ou qui suit le système :

- **Épistémiarque** (défaut) : papier chaud, encre brune, un seul accent
  terre cuite, focus bleu de Prusse ;
- **Noèsiologue** : crème, encre brune, la voix bleue d'humanome, focus
  violet ;
- **Technomancien** : ardoise contrastée, accent bleu d'humanome, focus cyan.

L'interface est un réglage d'affichage, jamais un droit : elle ne change ni
le menu, ni les pages, ni les données. Les couleurs de données (pôles,
palettes de la cartographie, familles d'intention, séries du monitoring) sont
les mêmes dans les trois.

## Déclencheur

L'utilisateur ouvre le menu et change la liste « Interface » ou « Thème », ou
la ligne « Affichage » de son compte ; ou il bascule le thème par le bouton
soleil/lune de l'en-tête.

## Préconditions

Aucune. Les réglages fonctionnent sans compte ni API.

## Garanties en cas de succès

- Le choix explicite est gardé dans **ce navigateur** (`humanome-interface` :
  `epistemiarque`, `noesiologue` ou `technomancien` ; `humanome-theme` :
  `light` ou `dark`, absent pour « Système »).
- Au chargement suivant, le script en ligne de `web/index.html` les pose sur
  `<html>` pendant l'analyse du `<head>`, avant le bundle : pas d'éclair de
  la mauvaise interface ni du mauvais thème. Ce script est autorisé par son
  sha256 dans la CSP de production (`web/public/.htaccess`), jamais par
  `'unsafe-inline'`.
- L'effet est immédiat, sans rechargement ; le tiroir reste ouvert.
- Rien n'est envoyé au serveur ni mesuré.

## Garanties minimales (en cas d'échec)

- Valeur stockée inconnue ou stockage illisible : l'épistémiarque s'affiche,
  sans erreur (A3, E1) ; le thème suit le système.
- Une interface déclare tous ses jetons de couleur dans chaque thème : aucune
  valeur d'une autre interface ne peut y fuir (RG4).

## Scénario nominal

1. Un visiteur ouvre le site. Sans choix enregistré, `<html>` porte
   `data-interface="epistemiarque"` dès le premier rendu, et pas de
   `data-theme` : le thème suit le système.
2. Il ouvre le menu : sous « Mode expert », la liste « Interface »
   (Épistémiarque, Noèsiologue, Technomancien ; Épistémiarque sélectionnée),
   la liste « Thème » (Système, Clair, Sombre ; Système sélectionné) et leur
   précision « gardés dans ce navigateur ; ils ne changent aucun droit ».
3. Il choisit « Noèsiologue » : `<html>` passe à
   `data-interface="noesiologue"`, les couleurs du site changent aussitôt, le
   choix est écrit (`humanome-interface` = `noesiologue`), le tiroir reste
   ouvert.
4. Il recharge la page : la noèsiologue est posée avant le premier rendu, et
   la liste l'affiche.

## Scénarios alternatifs

- **A1 — Thème** (étape 2) : « Clair » ou « Sombre » posent un choix explicite
  (`data-theme`, `humanome-theme`) qui prime sur le système ; « Système » les
  retire, et le site suit de nouveau le système et ses changements. Le bouton
  soleil/lune de l'en-tête pose un choix explicite ; la liste du tiroir le
  reflète, et inversement.
- **A2 — Interface et thème indépendants** : chacun garde sa clé ; changer
  l'un ne touche pas l'autre (six combinaisons, plus le suivi du système).
- **A3 — Stockage bloqué** (navigation privée stricte, accès refusé) : la
  lecture échoue en silence, l'épistémiarque s'affiche ; un choix vaut pour la
  session ouverte et n'est pas gardé.
- **A4 — Depuis « Mon compte »** : la ligne « Affichage » du profil (sous
  « Mode expert ») porte les mêmes listes, avec la précision « Interface et
  thème : gardés dans ce navigateur ; ils ne changent aucun droit. » ; elles
  restent synchronisées avec celles du tiroir. Le réglage reste celui du
  navigateur, pas du compte.

## Scénarios d'erreur

- **E1 — Valeur stockée inconnue** (écrite à la main, ou orthographe
  fautive comme `technomacien`) : ignorée dès le script en ligne,
  l'épistémiarque s'affiche ; la valeur reste dans le stockage jusqu'au
  prochain choix, qui la remplace.

## Règles de gestion

- **RG1** — L'interface n'est jamais un droit : aucune vue ni le serveur ne la
  lisent ; le menu et les pages sont les mêmes dans les trois interfaces ;
  aucune requête ne part au changement.
- **RG2** — Résolution : `interface = valeur stockée connue ?? épistémiarque`.
  Le défaut n'est jamais écrit : seul un choix l'est. Le script anti-FOUC et
  `lib/theme.js` partagent les deux clés et la liste des interfaces, gardées
  alignées par `web/src/anti-fouc.test.js`.
- **RG3** — Thème : `data-theme` absent = suivi du système ; `light` / `dark`
  = choix explicite. Interface et thème sont deux attributs de `<html>`.
- **RG4** — Jetons (`web/src/styles/global.css`) : chaque interface définit,
  en clair et dans ses deux copies sombres identiques (système, choisi), le
  même jeu de jetons `--ds-*` ; les variables historiques du site (`--ink`,
  `--paper`, `--accent`…) en sont des alias, sans renommage. Dans les neuf
  contextes, le texte atteint 4,5:1 sur ses fonds, la bordure de commande,
  l'anneau de focus et l'aplat d'accent 3:1. Les couleurs d'interface ne
  s'écrivent plus en dur : le texte d'un aplat d'accent lit `--on-accent`
  (blanc, ou encre sombre quand l'aplat s'éclaircit en sombre), les
  bandeaux d'état les jetons d'état ; le lecteur de timeline, posé sur la
  surface claire de la visualisation, en prend les encres (`--viz-*`).
- **RG7** — Contrastes en usage (lot S9-3, étendu aux correctifs de
  relecture) : dans les neuf contextes, chaque règle des feuilles du site qui
  pose un texte sur un fond atteint 4,5:1 (3:1 pour un grand texte : aucune
  règle n'en a besoin), que la couleur et le fond soient déclarés dans la
  même règle ou qu'un état ou un modificateur (`:hover`, `[aria-pressed]`,
  `.is-*`, `.x--y`) ne change que le fond sous l'encre de sa règle de base ;
  un modificateur qui change le fond de sa base garde le sien au survol ;
  l'anneau de focus est celui de l'interface (`--focus` : bleu de Prusse,
  violet ou cyan, 2 px décalés de 2 px, sur les liens, boutons, résumés,
  éléments focalisables et champs, et sur l'élément actif d'un composite
  marqué par une classe, `.is-focus`), ou l'encre de la visualisation sur sa
  surface claire, et il atteint 3:1 sur tout fond où il peut tomber ; la zone
  du diagramme et la feuille imprimable, claires dans les deux thèmes, posent
  leur propre anneau ; dans la zone du diagramme, toute couleur d'interface
  tracée atteint 3:1 (4,5:1 pour un texte) sur sa surface blanche ; chaque
  champ (`input`, `select`, `textarea`, visé par sa balise ou par une classe
  que le JSX lui pose) est bordé de `--line-strong` (3:1), ou, dans le
  lecteur de timeline, de l'encre douce de la visualisation, jamais du filet
  décoratif `--line` ni d'un mélange.
- **RG5** — Les couleurs de données (familles d'intention, séries du
  monitoring, surface des visualisations, badges gratuit / premium, pôles et
  palettes de la cartographie) ne dépendent pas de l'interface.
- **RG6** — Polices : chaque interface a les siennes, auto-hébergées (CSP
  `font-src 'self'`, licence OFL) : Source Serif 4 et Source Sans 3
  (épistémiarque), Fredoka et Nunito (noèsiologue), Space Grotesk et
  JetBrains Mono (technomancien). Ses piles (`--font-body`, `--font-heading`,
  `--font-mono`) et son échelle (`--fs-*`, `--fw-*`, `--lh-*`) ne dépendent
  pas du thème et ne nomment aucune famille d'une autre interface : le
  navigateur ne télécharge que les polices de l'interface en vigueur, et
  seulement les sous-ensembles (latin, latin-ext) que la page emploie. Un
  titre h1 à h3 qu'un composant ramène sous 1,125 rem lit
  `--font-subheading` : la police des titres en épistémiarque et en
  technomancien, Nunito gras en noèsiologue (la proposition B réserve
  Fredoka aux titres de 1,125 rem et plus).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Interface (`humanome-interface`) | `localStorage` du navigateur seulement ; jamais envoyée, jamais mesurée ; écrite au choix |
| Thème (`humanome-theme`) | Idem (UC-VIS-04 A5) ; retirée au choix « Système » |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/index.html` (script anti-FOUC) ; `web/public/.htaccess` (sha256 dans `script-src`) | Interface et thème posés avant le premier rendu (étape 4, A3, E1) |
| Front | `web/src/lib/theme.js` — `INTERFACES`, `DEFAULT_INTERFACE`, `INTERFACE_LABELS`, `INTERFACE_KEY`, `isInterface`, `storedInterface`, `resolvedInterface`, `applyInterface`, `THEME_CHOICES`, `themeChoice`, `clearTheme`, `applyThemeChoice`, `DisplayContext`, `useDisplay` | Lecture, résolution, écriture, contexte (RG2, RG3, A1, A3, E1) |
| Front | `web/src/components/DisplaySelects.jsx` | Les deux listes (étapes 2 et 3, A4) |
| Front | `web/src/App.jsx` | État de l'interface et du choix de thème, contexte autour du shell, listes du tiroir, bascule de l'en-tête synchronisée, attribut reposé au montage |
| Front | `web/src/views/AccountView.jsx` — `DisplayModeRow` | Ligne « Affichage » (A4) |
| Front | `web/src/styles/global.css` — jetons `--ds-*` des trois interfaces, alias, `.display-select` | Couleurs des interfaces (RG4, RG5) ; listes de 44 px |
| Front | `web/src/styles/global.css` — `@font-face` et blocs typographiques `html[data-interface]` ; `web/public/fonts/<famille>/` (woff2 Fontsource et `OFL.txt`) | Polices et échelle de chaque interface (RG6) |
| Front | `web/src/styles/global.css` (règle de focus commune, `.diagram-zone`, `.heatmap-day-current`, champs, survol de `.admin-demo-actions`), `web/src/carto/ui/carto.css` (anneaux de la cartographie, case active de la heatmap, `.carto-btn--danger`, `.carto-print-sheet`, champs), `timeline.css` (liste « Vitesse de lecture »), `configuration.css`, `twin9-credit.css` (champs) | Anneau de focus de l'interface, bordures de champ, contrastes en usage (RG7) |
| Front | `web/src/styles/global.css`, `carto.css`, `twin9-credit.css` — `--font-subheading`, `--fw-subheading` et les intertitres de composants sous 1,125 rem | Petits intertitres (RG6) |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-VIS-07-U01 | `INTERFACES`, `resolvedInterface`, `storedInterface`, `applyInterface` | Trois interfaces et leurs libellés, défaut épistémiarque ; valeur stockée qui prime ; valeur inconnue et stockage illisible : le défaut ; interface inconnue refusée sans rien écrire (RG2, A3, E1) | `web/test/usecases/unit/uc-vis-07-choisir-interface-theme.test.jsx` |
| UC-VIS-07-U02 | `themeChoice`, `applyThemeChoice` | « Système » sans choix ; Clair et Sombre explicites ; « Système » retire attribut et clé ; deux clés indépendantes (RG3) | idem |
| UC-VIS-07-U03 | Script anti-FOUC | Interface toujours posée (la choisie, sinon le défaut, stockage illisible compris) ; thème seulement s'il est choisi (étape 4, A3, E1) | idem |
| UC-VIS-07-U04 | `global.css` | Neuf contextes au même jeu de jetons `--ds-*` ; copies sombres identiques ; trois interfaces distinctes (RG4) | idem |
| UC-VIS-07-U05 | `global.css` | Variables historiques en alias des jetons, jamais redéfinies par une interface ; couleurs de données identiques dans les trois interfaces (RG5) | idem |
| UC-VIS-07-U06 | `global.css` | Contrastes WCAG dans les neuf contextes : texte 4,5:1, texte sur l'aplat d'accent 4,5:1, bordure de commande, focus et aplat 3:1 (RG4) | idem |
| UC-VIS-07-U07 | `DisplaySelects` | Deux listes nommées, options dans l'ordre, valeurs du contexte, précision annoncée, aucun groupe ; un changement appelle le réglage seul ; l'intitulé ne se coupe pas au milieu du mot (étapes 2 et 3, A4) | idem |
| UC-VIS-07-U08 | Feuilles du site (`global.css`, `configuration.css`, `carto.css`, `twin9-credit.css`, `timeline.css`…) | Aucun texte blanc écrit en dur hors impression ; sur l'aplat d'accent, l'encre est `--on-accent` ; plus aucune couleur littérale dans `timeline.css` ni `twin9-credit.css` (RG4) | idem |
| UC-VIS-07-U09 | Feuilles du site | Chaque règle qui pose un texte sur un fond (144) : 4,5:1, 3:1 pour un grand texte, dans les neuf contextes ; chaque état ou modificateur qui ne change que le fond (14), sous l'encre de sa règle de base ; un modificateur qui change le fond de sa base garde le sien au survol ; couleurs posées par élément (pôles, couleurs calculées, familles, tuiles V3) hors de l'interface ; règles de `carto.css` sur la surface de la cartographie (sombre avec le site) ou sur la feuille imprimable (RG7, RG5) | idem |
| UC-VIS-07-U10 | Feuilles du site | Chaque règle `:focus`, et l'élément actif marqué `.is-focus` (14 anneaux), trace `--focus`, ou `--viz-ink` sur la visualisation ; 3:1 sur le fond, la carte, la surface secondaire, l'encart d'information et la surface de la cartographie ; règle commune étendue aux champs ; `--focus` de la zone du diagramme et de la feuille imprimable (RG7) | idem |
| UC-VIS-07-U11 | Feuilles du site, JSX | Chaque champ, visé par sa balise ou par une classe que le JSX lui pose (39 bordures), en `--line-strong`, ou en couleur de danger s'il est invalide, ou en encre douce de la visualisation dans le lecteur de timeline ; aucun mélange ; deux champs sans cadre à dessein au plus ; `--line-strong` à 3:1 sur le fond, la carte et la surface secondaire, l'encre douce sur la surface de la visualisation (RG7) | idem |
| UC-VIS-07-U12 | `global.css`, `timeline.css` | Zone du diagramme (soleil, heatmap, lecteur de timeline) : chaque couleur d'interface tracée (16) atteint 3:1, 4,5:1 pour un texte, sur `--viz-surface` dans les neuf contextes ; un mélange n'y lit que les encres `--viz-*` (RG4, RG7) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-VIS-07-F01 | Nominal | IHM | Épistémiarque sans choix et sans écriture ; « Noèsiologue » : `<html>`, clé, tiroir ouvert ; rechargement : posée par le script avant le montage | `web/test/usecases/functional/uc-vis-07-choisir-interface-theme.test.jsx` |
| UC-VIS-07-F02 | A1 | IHM | « Système » par défaut ; « Sombre » puis bascule de l'en-tête synchronisées ; retour à « Système » : attribut et clé retirés | idem |
| UC-VIS-07-F03 | A2 | IHM | Six combinaisons interface × thème, chacune gardée ; « Système » garde l'interface | idem |
| UC-VIS-07-F04 | A3 | IHM | `localStorage` qui lève une exception : épistémiarque au premier rendu, choix effectif pour la session, rien de gardé | idem |
| UC-VIS-07-F05 | A4 | IHM | `#/compte` : listes dans la ligne « Affichage » et leur précision, synchronisées avec le tiroir dans les deux sens | idem |
| UC-VIS-07-F06 | E1 | IHM | `technomacien` stocké : épistémiarque au premier rendu, valeur ignorée puis remplacée au choix suivant | idem |
| UC-VIS-07-F07 | RG1 | IHM | Visiteur et apprenant : même menu dans les trois interfaces, aucune requête au changement | idem |

### Tests existants liés (non-régression)

- `web/src/lib/theme.test.js` — thème, « Système », interface ;
  `web/src/anti-fouc.test.js` — script en ligne exécuté contre des doublures,
  clés et liste alignées sur `lib/theme.js`, sha256 présent dans la CSP, dans
  son commentaire et dans `docs/securite-checklist.md`.
- `web/src/styles/fonts.test.js` — chaque `@font-face` (woff2 présent,
  licence OFL, `swap`, `unicode-range`), mêmes variables typographiques dans
  les trois interfaces, aucune famille partagée, aucune origine tierce ;
  chaque titre h1 à h3 ramené sous 1,125 rem (32) lit `--font-subheading`
  (RG6).
- `web/src/App.test.jsx` (bascule de thème de l'en-tête, groupes du tiroir),
  UC-VIS-06-F06 (ligne « Affichage » du compte), UC-CPT-07-U23 (contrastes
  des définitions de rôle, désormais dans les neuf contextes).

### Exécuter

```sh
cd web && npx vitest run test/usecases/unit/uc-vis-07 test/usecases/functional/uc-vis-07 src/lib/theme.test.js src/anti-fouc.test.js src/styles/fonts.test.js
```

## Limites

- **Persistance par navigateur** : comme le mode d'affichage (UC-VIS-06), le
  choix ne suit pas le compte d'un appareil à l'autre.
- **Affichage réel** : jsdom n'applique pas les styles ; les contrastes sont
  calculés sur les jetons et sur les règles qui les emploient, pas mesurés à
  l'écran : un texte posé sur un fond hérité d'un PARENT n'est couvert qu'au
  niveau des jetons (U06) ; sur un même élément, l'encre de la règle de base
  est mesurée sous le fond d'un état ou d'un modificateur (U09), pas l'inverse
  (un état qui ne change que l'encre, sur le fond de sa base), et la base est
  trouvée par le sélecteur, pas par le JSX. Vérifié à la main le 2026-10-23 dans Chromium, sur
  le bundle construit servi sous la CSP de production : les trois interfaces
  × (sans choix, clair, sombre) × système clair ou sombre, plus une valeur
  inconnue, posent les bons attributs et les bonnes couleurs avant le bundle,
  sans violation de CSP.
- **Captures (lot S9-3, 2026-10-23)** : script Playwright temporaire (hors du
  dépôt), sur le serveur de développement, API simulée (un compte inventé
  pour `#/compte`) ; le choix est posé dans le stockage avant tout script,
  donc par le vrai chemin du script anti-FOUC. Accueil, cartographie de
  démonstration et `#/compte`, à 375 et 1 280 px, en clair et en sombre,
  pour chaque interface : 36 images, gardées hors du dépôt. Sur chacune, les
  bons attributs, aucun débordement horizontal, aucune erreur de page, et
  seules les polices de l'interface chargées. Elles ont montré l'intitulé
  « Interface » coupé en « Interfac / e » à 375 px (corrigé, U07) ; reste,
  non corrigé ici, « Apprenant » coupé en « Apprena / nt » dans la ligne
  « Habilitations » de `#/compte` à 375 px, dans les trois interfaces : la
  ligne et sa règle (le `dd` coupe partout, pour les longues adresses) sont
  antérieures au sprint 9 ; le rendu d'avant n'a pas été capturé.
- **Anneau de focus** : 2 px partout ; les propositions A et B en prévoyaient
  3. Le contraste élevé (`forced-colors`) n'a pas de règle propre.
- **Heatmap de la cartographie** : la date courante (`.is-t`) et la plage
  brossée (`.is-brushed`) tracent encore l'accent. Aucun trait d'une seule
  couleur (accent ou anneau) n'atteint 3:1 sur toutes les cases de niveau 5
  des pôles ; la case active (`.is-focus`, `--focus`) l'atteint sur la
  surface, dans l'espace entre les cases. Un repère à deux tons reste à
  décider.
- **Boutons du lecteur de timeline** : leur filet (mélange de l'encre douce,
  environ 2,3:1) n'est pas une limite de champ ; leur glyphe, à l'encre de la
  visualisation, les signale. Non changé.
- **Couleurs laissées hors des jetons, à dessein** : les couleurs de données
  (RG5 : surface sombre et encres de la cartographie `--viz-*` / `--hm-*` de
  `carto.css`, surlignages des traces, comparaison, jauges de confiance,
  hachures du soleil), l'aperçu imprimable et les règles d'impression (du
  papier, blanc), et la surface autonome `.v3-root` de `v3.css` (spécification
  §15, non montée par le site, figée par UC-APP-12) : dans le site, les tuiles
  V3 lisent déjà les variables du site (`.carto-tiles`, `.carto-dashboard`).
- **Échelle typographique** : appliquée au corps, aux titres de base, aux
  commandes et au code ; les tailles en rem des composants restent celles
  d'avant (pas de refonte de la mise en page).

## Anomalies constatées

Aucune en production (rien n'est déployé). Trouvés et corrigés avant
livraison par les tests du lot S9-3 : anneaux de focus à la couleur de
l'accent, 34 champs bordés du filet décoratif (1,2 à 1,6:1), badge « env »
de l'administration à 4,26:1 sur le fond d'alerte de l'épistémiarque.
Trouvés à la relecture du sprint, puis par les tests étendus (U09 à U12,
`fonts.test.js`), et corrigés : le bouton « Confirmer : tout supprimer » de
la cartographie, blanc sur le danger du sombre de l'épistémiarque (2,48:1),
et rendu à l'aplat d'accent au survol ; le survol des boutons de
démonstration de l'administration (1,94:1 dans le même contexte) ; le repère
de la feuille courante de la heatmap, à 2,69:1 sur la surface blanche du
diagramme en noèsiologue et en technomancien sombres ; la case active de la
heatmap de la cartographie, à l'accent et non à l'anneau ; trois champs
bordés sous 3:1 (« Vitesse de lecture », les zones de texte de la vue
épistémiarque et du portfolio) ; 32 petits intertitres en Fredoka.
