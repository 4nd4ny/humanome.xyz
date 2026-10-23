# ADR-014 — Trois interfaces au choix du visiteur : épistémiarque, noèsiologue, technomancien

## Statut

Accepté — 2026-10-23 (sprint 9 de `TODO_LIST.md`, charte graphique ; humanome.xyz seulement).
Rien n'est déployé.

Le choix des trois interfaces et leurs noms sont de Christian. Les modalités (§2 à §6) ont été
prises par délégation et lui sont signalées : le défaut, le stockage, les polices, la place du
sélecteur, ce qui reste hors des jetons. Le numéro 013 est pris par l'ADR des écoles, des clés et
des crédits du sprint 6 (branche `feat/ecoles`, pas encore fusionnée).

## Contexte

Le sprint 9 a produit trois propositions de charte, relues et livrées avec leurs jetons clair et
sombre, une maquette, un relevé de contrastes et une note de migration par site : A « Atelier du
savoir » (papier chaud, encre brune, un seul accent terre cuite), B « Vivant » (crème, la voix
bleue d'humanome) et C « Voie de la machine » (ardoise contrastée, accent bleu). Christian, le
2026-10-23 :

> « Les trois propositions d'interface sont excellentes. Nous allons les conserver toutes les
> trois et proposer leur attribuer les noms des filières aux interfaces, c'est à dire :
> épistémiarque pour l'interface A, noèsiologue pour l'interface B, technomacien [sic] pour
> l'interface C, qui correspondent toutes les trois parfaitement à l'esprit de leurs filières
> respectives. »

(L'orthographe retenue dans les contenus est « Technomancien ». Une valeur `technomacien` écrite
à la main dans le navigateur est inconnue : elle ramène au défaut, UC-VIS-07 E1.)

Trois contraintes cadrent la mise en œuvre :

- **Le site existant** : environ 9 500 lignes de CSS lisent des variables historiques (`--ink`,
  `--paper`, `--card`, `--accent`…), et l'en-tête porte déjà un thème clair, sombre ou système,
  posé avant le premier rendu par un script en ligne autorisé par son sha256 dans la CSP.
- **La CSP de production** (`web/public/.htaccess`) : `font-src 'self'`, `script-src` sans
  `'unsafe-inline'`.
- **Les données** : les pôles RESPIRE, les palettes de la cartographie (D-60 à D-64), les familles
  d'intention et les séries du monitoring sont des couleurs de DONNÉES, choisies et validées pour
  elles-mêmes (daltonisme, surface de la visualisation).

## Décision

### 1. Trois interfaces, chacune en clair et en sombre

Chaque visiteur choisit son interface : **épistémiarque** (proposition A, défaut),
**noèsiologue** (B) ou **technomancien** (C). Chacune existe en clair et en sombre, et le thème
reste au choix : Clair, Sombre, ou Système (sans choix, `prefers-color-scheme` décide). Interface
et thème sont indépendants : six combinaisons, plus le suivi du système.

### 2. Un réglage d'affichage, gardé dans le navigateur

L'interface n'est jamais un droit : aucune vue ni le serveur ne la lisent, le menu et les pages
sont les mêmes dans les trois, rien n'est envoyé ni mesuré. Elle est gardée dans ce navigateur
(`localStorage` `humanome-interface` : `epistemiarque`, `noesiologue`, `technomancien`), à côté
de `humanome-theme`. Le défaut n'est jamais écrit : seul un choix l'est. Comme le mode expert
(UC-VIS-06), la préférence ne suit pas le compte d'un appareil à l'autre.

Le script anti-FOUC de `web/index.html` pose toujours `data-interface` sur `<html>` (la valeur
stockée si elle est connue, sinon l'épistémiarque) et `data-theme` si un thème a été choisi, avant
le bundle. Son nouveau sha256 remplace l'ancien dans la CSP de `.htaccess`, dans
`docs/securite-checklist.md` et dans `web/src/anti-fouc.test.js`, qui exécute le script et garde
les clés et la liste alignées sur `web/src/lib/theme.js`.

Le sélecteur (listes « Interface » et « Thème », 44 px) est au bas du tiroir, sous « Mode
expert », et dans la ligne « Affichage » de `#/compte` ; le bouton soleil/lune de l'en-tête reste
et pose un thème explicite. Les trois commandes restent synchronisées.

### 3. Les jetons remplacent les valeurs, pas les noms

`web/src/styles/global.css` déclare les jetons `--ds-*` de chaque interface dans trois blocs :
clair, sombre du système, sombre choisi (deux copies identiques). L'épistémiarque vit sur
`:root` ; les deux autres sur `:root[data-interface=…]`, d'une spécificité supérieure. Chaque bloc
déclare le **même** jeu de jetons : aucune valeur d'une interface ne peut fuir dans une autre.
Les variables historiques deviennent des alias des jetons, sans renommage : leurs consommateurs ne
changent pas. Trois alias nouveaux servent l'accessibilité : `--line-strong` (bordure de champ,
3:1), `--on-accent` (encre posée sur un aplat d'accent : blanc, ou encre sombre quand l'aplat
s'éclaircit en sombre) et `--focus` (l'anneau de l'interface : bleu de Prusse, violet ou cyan).

Les couleurs littérales d'interface passent aux jetons (blancs en dur sur les boutons pleins,
`timeline.css`, `twin9-credit.css`). Les couleurs de données (§ Contexte), la surface de la
visualisation et l'aperçu imprimable (du papier) ne dépendent pas de l'interface.

### 4. Des polices auto-hébergées, chargées par l'interface en vigueur

| Interface | Titres | Texte | Chasse fixe |
|---|---|---|---|
| Épistémiarque | Source Serif 4 (600) | Source Sans 3 | celle du système |
| Noèsiologue | Fredoka (1,125 rem et plus ; en dessous, Nunito gras) | Nunito | celle du système |
| Technomancien | Space Grotesk | Space Grotesk | JetBrains Mono |

Fichiers woff2 des paquets npm Fontsource (licence SIL OFL 1.1, livrée avec chaque famille dans
`web/public/fonts/<famille>/`), sous-ensembles latin et latin-ext seulement, `font-display:
swap`. Chaque interface a ses piles (`--font-body`, `--font-heading`, `--font-mono`, et
`--font-subheading` pour un titre qu'un composant ramène sous 1,125 rem : la police des titres en
épistémiarque et en technomancien, Nunito gras en noèsiologue, comme le veut la proposition B) et
son échelle (`--fs-*`, `--fw-*`, `--lh-*`), qui ne nomment aucune famille d'une autre interface : le
navigateur ne télécharge que les polices de l'interface en vigueur (latin, sur une page
française : environ 50 Ko pour l'épistémiarque, 69 Ko pour la noèsiologue, 22 Ko pour le
technomancien, 40 Ko de plus quand une page montre du code). Pas de `preload`, qui chargerait
celles des trois. iA Writer Quattro n'est plus employée ; ses fichiers restent dans
`web/public/fonts/quattro/` jusqu'à la décision de Christian.

### 5. Pas de refonte de la mise en page

Les cibles de 44 px et les points de rupture du sprint 1 restent. L'échelle typographique ne
s'applique qu'au corps, aux titres de base, aux commandes et au code ; les tailles en rem des
composants restent celles d'avant. Les autres chantiers des notes de migration (contraste élevé
`forced-colors`, tiroir en `<dialog>`, champs à 16 px, cibles de la cartographie, rose de
l'en-tête, anneau de 3 px des propositions A et B) ne font pas partie de cette décision.

### 6. La preuve : des contrastes calculés sur les règles, et des captures

Dans les neuf contextes (trois interfaces × clair, sombre du système, sombre choisi), calculés sur
`global.css` et les feuilles du site (`web/test/usecases/support/global-css.js`) :

- les jetons (UC-VIS-07-U06) : texte courant, doux, discret, accent et états à 4,5:1 sur leurs
  fonds ; bordure de commande, anneau de focus et aplat d'accent à 3:1 ;
- les règles qui les emploient (lot S9-3, étendu aux correctifs de relecture) : chaque couple
  texte et fond à 4,5:1, 3:1 pour un grand texte, qu'il soit déclaré dans une même règle ou
  qu'un état ou un modificateur (`:hover`, `[aria-pressed]`, `.is-*`, `.x--y`) ne change que le
  fond sous l'encre de sa règle de base, et un modificateur qui change le fond de sa base garde le
  sien au survol (U09) ; chaque règle `:focus`, et l'élément actif d'un composite porté par une
  classe (`.is-focus`), trace `--focus`, ou l'encre de la visualisation sur sa surface claire, à
  3:1 sur tout fond où l'anneau peut tomber (U10) ; chaque champ, visé par sa balise ou par une
  classe que le JSX lui pose, est bordé de `--line-strong` à 3:1, ou, dans le lecteur de
  timeline, de l'encre douce de la visualisation (U11) ; dans la zone du diagramme, claire dans
  les deux thèmes, chaque couleur d'interface tracée atteint 3:1 (4,5:1 pour un texte) sur
  `--viz-surface` (U12) ;
- la typographie (`web/src/styles/fonts.test.js`) : un titre h1 à h3 qu'un composant ramène
  sous 1,125 rem lit `--font-subheading`.

Écrire la preuve sur les règles a trouvé trois écarts, corrigés au lot S9-3 : les anneaux de
focus traçaient l'accent (`--accent-strong`, `--accent`) et non l'anneau de l'interface ; 34
règles de champ étaient bordées du filet décoratif `--line` (1,2 à 1,6:1) ; le badge « env » de
l'administration (`.admin-source-env`) tombait à 4,26:1 sur le fond d'alerte de l'épistémiarque.

La relecture du sprint a montré que cette preuve laissait passer des cas ; étendue, elle a trouvé
et fait corriger : le bouton « Confirmer : tout supprimer » de la cartographie
(`.carto-btn--danger`), blanc sur le danger éclairci du sombre de l'épistémiarque (2,48:1), et
rendu à l'aplat d'accent au survol (désormais le cramoisi en encre et en filet sur la carte, le
fond de danger au survol, comme le bouton Supprimer de la proposition A) ; le survol des boutons
de démonstration de l'administration, blanc sur `--accent-strong` (1,94:1) ; le repère de la
feuille courante de la heatmap, à l'aplat d'accent, tombé à 2,69:1 sur la surface blanche du
diagramme en noèsiologue et en technomancien sombres (désormais `--viz-ink`) ; la case active au
clavier de la heatmap de la cartographie, à l'accent (désormais `--focus`) ; trois champs bordés
sous 3:1 (la liste « Vitesse de lecture » du lecteur, deux zones de texte) ; les petits
intertitres en Fredoka.

Des captures Playwright (accueil, cartographie de démonstration, `#/compte` ; 375 et 1 280 px ;
clair et sombre ; les trois interfaces, soit 36 images) montrent le rendu réel. Elles ne sont pas
dans le dépôt.

## Conséquences

- **Une quatrième interface** coûterait trois blocs de jetons, un bloc typographique, ses polices
  et une entrée dans `INTERFACES` (`lib/theme.js`) et dans le script anti-FOUC (donc un nouveau
  sha256 dans la CSP) ; les tests de parité, de contraste et de polices la couvrent d'office.
- **Un jeton nouveau** doit être déclaré dans les neuf blocs (UC-VIS-07-U04 échoue sinon) ; une
  couleur d'interface écrite en dur, une bordure de champ en `--line` ou un anneau qui n'est pas
  `--focus` font échouer U08, U11 ou U10 ; un accent d'interface tracé sur la zone du diagramme,
  U12.
- **Le script anti-FOUC** a changé : la CSP du serveur doit porter son nouveau sha256 au
  déploiement (le fichier `.htaccess` du dépôt le porte déjà).
- **Les captures et les contrastes** sont calculés, pas mesurés à l'écran par un outil
  d'audit : un composant qui pose son texte sur un fond hérité d'un PARENT n'est couvert qu'au
  niveau des jetons (U06) ; sur un même élément, l'encre héritée de la règle de base est mesurée
  sous le fond de l'état ou du modificateur (U09), mais pas l'inverse (un état qui ne change que
  l'encre sur le fond de sa base) ; la base est trouvée par le sélecteur (états ôtés, puis
  modificateur BEM), pas par le JSX.
- **Les repères de la heatmap de la cartographie** (date courante `.is-t`, plage brossée
  `.is-brushed`) tracent encore l'accent ; aucun trait d'une seule couleur, accent ou anneau,
  n'atteint 3:1 sur toutes les cases de niveau 5 des pôles (la case active, à `--focus`, l'atteint
  sur la surface, dans l'espace entre les cases) : il faudrait un repère à deux tons.
- **EduChat et la Fabrica** ne sont pas touchés : les notes de migration des trois propositions
  les décrivent, la décision de les appliquer reste à prendre.

## Code et tests

- `web/src/styles/global.css` (jetons, alias, typographie, `@font-face`, anneau de focus),
  `web/src/lib/theme.js`, `web/index.html`, `web/public/.htaccess`,
  `web/src/components/DisplaySelects.jsx`, `web/src/App.jsx`, `web/src/views/AccountView.jsx`,
  `web/public/fonts/`.
- Cas d'utilisation : [UC-VIS-07](../cas-utilisation/visiteur/UC-VIS-07-choisir-interface-theme.md)
  (U01 à U12, F01 à F07) ; `web/src/styles/fonts.test.js`, `web/src/anti-fouc.test.js`,
  `web/src/lib/theme.test.js`.
- Ergonomie : `docs/ergonomie-navigation.md` §5quater.
