# UC-VIS-07 — Choisir son interface et son thème

| Champ | Valeur |
|---|---|
| **Acteur principal** | Visiteur (aucun compte requis) — le même réglage vaut pour tout utilisateur connecté |
| **Acteurs secondaires** | Aucun |
| **Portée** | humanome.xyz — listes « Interface » et « Thème » au bas du menu (sous « Mode expert ») et dans la ligne « Affichage » de `#/compte` ; bascule soleil/lune de l'en-tête (UC-VIS-04 A5) ; choix gardés dans le navigateur (`localStorage` `humanome-interface`, `humanome-theme`), posés sur `<html>` (`data-interface`, `data-theme`) avant le premier rendu par le script anti-FOUC de `web/index.html` ; sans API |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | Sprint 9 (TODO_LIST, charte graphique) : décision de Christian du 2026-10-23 — « Les trois propositions d'interface sont excellentes. Nous allons les conserver toutes les trois » —, chacune nommée d'après une filière : épistémiarque (proposition A), noèsiologue (B), technomancien (C) |
| **Statut** | Implémenté (lot S9-1, 2026-10-23 : jetons de couleur, sélecteur, persistance). Polices des interfaces et passage des couleurs littérales restantes aux jetons : lots suivants du sprint 9 |

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
  l'anneau de focus et l'aplat d'accent 3:1.
- **RG5** — Les couleurs de données (familles d'intention, séries du
  monitoring, surface des visualisations, badges gratuit / premium, pôles et
  palettes de la cartographie) ne dépendent pas de l'interface.

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
| UC-VIS-07-U07 | `DisplaySelects` | Deux listes nommées, options dans l'ordre, valeurs du contexte, précision annoncée, aucun groupe ; un changement appelle le réglage seul (étapes 2 et 3) | idem |

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
- `web/src/App.test.jsx` (bascule de thème de l'en-tête, groupes du tiroir),
  UC-VIS-06-F06 (ligne « Affichage » du compte), UC-CPT-07-U23 (contrastes
  des définitions de rôle, désormais dans les neuf contextes).

### Exécuter

```sh
cd web && npx vitest run test/usecases/unit/uc-vis-07 test/usecases/functional/uc-vis-07 src/lib/theme.test.js src/anti-fouc.test.js
```

## Limites

- **Persistance par navigateur** : comme le mode d'affichage (UC-VIS-06), le
  choix ne suit pas le compte d'un appareil à l'autre.
- **Affichage réel** : jsdom n'applique pas les styles ; les contrastes sont
  calculés sur les jetons, pas mesurés à l'écran. Vérifié à la main le
  2026-10-23 dans Chromium, sur le bundle construit servi sous la CSP de
  production : les trois interfaces × (sans choix, clair, sombre) × système
  clair ou sombre, plus une valeur inconnue, posent les bons attributs et les
  bonnes couleurs avant le bundle, sans violation de CSP.
- **Lot S9-1 seulement** : les polices propres à chaque interface (Source
  Serif 4 et Source Sans 3, Fredoka et Nunito, Space Grotesk et JetBrains
  Mono) et le passage aux jetons des couleurs littérales restantes (blancs
  écrits en dur sur les aplats d'accent, `timeline.css`, `twin9-credit.css`)
  viennent aux lots suivants. D'ici là, en noèsiologue et en technomancien
  sombres, le texte blanc écrit en dur sur un aplat d'accent éclairci reste
  sous 4,5:1 : `--on-accent` (encre sombre) existe, les règles ne le lisent
  pas encore.

## Anomalies constatées

Aucune.
