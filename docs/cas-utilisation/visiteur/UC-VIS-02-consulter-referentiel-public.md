# UC-VIS-02 — Consulter le référentiel public de compétences

| Champ | Valeur |
|---|---|
| **Acteur principal** | Visiteur (aucun compte requis) |
| **Acteurs secondaires** | Épistémiarques (auteurs des versions publiées, UC-EPI-01 à 04 ; d'autres référentiels, UC-EPI-05) ; exploitation (export statique manuel, le repli de la page : UC-EPI-03 étape 8 et limite L1) ; tout client de l'API publique |
| **Portée** | humanome.xyz — page `#/referentiel[/<code>][?id=<id>]` ; API publique `GET /api/referentiels`, `/referentiels/{id}/versions/{semver}` (que la page lit depuis S5, lot E), `GET /api/referentiel`, `/referentiel/versions`, `/referentiel/versions/{semver}`, `/referentiel/diff/{from}/{to}` ; `GET /api/competences`, `/competences/{code}`, `/competences/{code}/versions` (les `GET …/drafts` et `…/proposals` sont réservés aux épistémiarques : 401/403) |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §4.1 (référentiel public en lecture, modifiable par les seuls épistémiarques, historisé), §3.5, §3.1 |
| **Statut** | Implémenté (P4 ; compétences atomiques migration 016) ; tout référentiel publié, lu dans la base d'abord, depuis S5, lot E (A7 à A9) |

## Objectif

Permettre à quiconque de lire le référentiel RESPIRE sur lequel reposent
toutes les cartographies : ses 7 pôles et 61 compétences, leurs définitions,
avec un permalien par compétence ; et, par l'API, d'en lire l'historique
immuable (versions publiées, différences, versions de chaque compétence).
Depuis S5 (lot E), la page montre de même tout autre référentiel publié —
l'Humanome V18 de respire.school, s'il l'est —, choisi dans un menu ou nommé
par l'adresse, avec sa provenance et sa licence.
L'**édition** du référentiel est hors de ce cas (UC-EPI-01 à 05).

## Déclencheur

Le visiteur choisit « Référentiel » dans la famille « Découvrir » du menu, suit
un permalien `#/referentiel/<code>` ou un lien profond
`#/referentiel[/<code>]?id=<id>` (A8), ou un client appelle l'API publique.

## Préconditions

- Au moins une version du référentiel est **publiée** (`referentiel_versions`,
  statut `published`) — import initial RESPIRE v7 puis releases entérinées.
- Pour la page : la base sert ses versions publiées par l'API publique
  (`GET /api/referentiels`, `/api/referentiels/{id}/versions/{semver}`, S5,
  lot A). En repli seulement (API injoignable, A9) : l'export statique
  `data/referentiel/index.json` + un fichier par version, produit **à la
  main** par `php scripts/export-referentiel-static.php` (`StaticExporter`)
  contre la base **locale** à laquelle il est connecté, avant `npm run build`
  puis le déploiement statique ; `scripts/deploy/deploy.mjs` n'exporte rien
  (il se contente d'importer 7.0.0 et 7.1.0 en base). À défaut de l'une et de
  l'autre, le référentiel embarqué dans le bundle (A6).

## Garanties en cas de succès

- Le visiteur lit la dernière version **publiée dans la base** de chaque
  référentiel (jamais un brouillon ni une version soumise au vote, pas même
  à son auteur), dès sa publication ; en repli seulement, celle de l'export
  statique déployé, qui peut retarder sur la base (limite L1).
- Depuis S5 (lot E), la **lecture** du référentiel par la page passe par les
  lectures publiques de l'API (`GET /api/referentiels`,
  `/api/referentiels/{id}/versions/{semver}`), en lecture seule et sans
  session ; elle ne se fait plus « sans PHP » (RG4). Elle n'attend l'API
  que 5 s : passé ce délai, sa requête est abandonnée et l'export statique
  répond (A9), si bien qu'une API qui pend ne la bloque pas. Le shell de
  l'application sonde la session par `GET /api/auth/me`, qui répond `401`
  sans cookie et n'ouvre aucune session.
- Un autre référentiel que RESPIRE s'affiche avec sa **provenance** (le
  `source` de son document : d'où il vient, sa licence — l'attribution
  CC-BY-SA de l'Humanome V18, S5, E9), qu'il soit lu dans la base ou dans
  l'export statique (RG7).

## Garanties minimales (en cas d'échec)

- La page s'affiche toujours (repli embarqué, v7) ; un permalien inconnu **et
  bien encodé** est signalé sans empêcher la lecture (un permalien au
  pourcentage mal formé fait planter l'application, anomalie AN1) ; un
  référentiel que l'adresse nomme et qui ne se charge pas est dit, et
  RESPIRE s'affiche à sa place (E5).
- L'API répond par un statut explicite (404, 503 ; `500` « Internal error »,
  sans détail SQL, sur erreur PDO).
- Aucune écriture n'est possible sans rôle épistémiarque (401/403).

## Scénario nominal

1. Le visiteur ouvre `#/referentiel` (menu « Découvrir » → « Référentiel » ;
   sur l'accueil, la tuile du plan du site porte l'indice « les compétences,
   pôle par pôle » — sans chiffres depuis le 2026-10-20 : c'est la version
   publiée qui dit ses pôles et ses compétences). La page affiche
   « Chargement du référentiel… ».
2. Le navigateur lit RESPIRE par son identifiant, comme les parcours
   (`loadPublishedReferentiel({id: 'respire'})`, S5, lot E) : le catalogue de
   la base (`GET /api/referentiels`) en donne la dernière version, que sert
   `GET /api/referentiels/respire/versions/{semver}` ; le document doit être
   la version demandée, de la forme attendue (`poles[]`, `competences[]`).
   L'API est attendue 5 s au plus (`API_TIMEOUT_MS`), et le catalogue
   qu'elle sert vaut 10 s (`CATALOGUE_TTL_MS`) : le menu de l'étape 3 ne le
   redemande pas. Sinon, l'export statique (A9), puis le référentiel
   embarqué (A6). Le
   résultat — y compris le **repli** — est mis en cache pour toute la durée
   de la page.
3. La page affiche l'en-tête « Référentiel de compétences », le menu
   « Référentiel » (les référentiels publiés, chacun à sa dernière version,
   RESPIRE d'abord et choisi ; sa liste vient aussi de la base, l'index
   statique en repli), le libellé et la
   version (« <libellé> — version 7.1.0 · 7 pôles, 61 compétences. Public en
   lecture, édité par les épistémiarques, versionné… » ; libellé de
   production : « RESPIRE v7.1 », les tests utilisent « RESPIRE v7.1.0 »),
   l'encart vers
   l'espace participatif Decidim, puis un bloc par pôle (couleur du pôle) listant
   ses compétences : code (permalien), nom, définition éventuelle (ses
   retours à la ligne gardés).
4. Le visiteur tape dans « Rechercher une compétence » (exemple du champ : le
   premier code du référentiel affiché, « Code ou nom — ex. 1.01 » pour
   RESPIRE, 2026-10-20) : le filtre porte sur le
   code, le nom et la définition, sans tenir compte des accents ni de la casse ;
   le compteur annonce « n compétence(s) sur 61 pour « … » » et les pôles vides
   sont masqués. Effacer la recherche rétablit les 61.

## Scénarios alternatifs

- **A1 — Version antérieure** (API) : `GET /api/referentiel/versions/{semver}`
  sert le contenu d'une version **publiée** donnée.
- **A2 — Différences entre versions** (API) :
  `GET /api/referentiel/diff/{from}/{to}` sert la différence **structurelle**
  (pôles ajoutés/retirés/modifiés — nom, couleur —, compétences ajoutées,
  retirées, renommées, déplacées ; `identical`, `summary`).
- **A3 — Compétences atomiques** (API) : `GET /api/competences` liste la
  dernière version publiée de chaque compétence (métadonnées, triées par code) ;
  `GET /api/competences/{code}` sert sa fiche riche (`content` :
  identité, protocole…) ; `GET /api/competences/{code}/versions` son historique
  publié, plus récent d'abord.
- **A4 — Lecture par l'API** (étape 2) : `GET /api/referentiel` sert le
  document de la dernière version publiée — le même contenu que le fichier
  statique ; `GET /api/referentiel/versions` liste les versions publiées
  (métadonnées sans contenu).
- **A5 — Permalien** (étape 3) : `#/referentiel/<code>` surligne la compétence
  (`aria-current`) et la fait défiler au centre de l'écran.
- **A6 — Hors ligne / copie statique** (étape 2) : sur `file://` (aucune
  lecture tentée), sans réseau, ou quand ni l'API ni l'export ne servent
  RESPIRE (index vide, illisible ou au JSON invalide, nom de fichier
  dangereux `../x.json`, fichier absent ou de forme inattendue) : la page
  utilise en silence le référentiel RESPIRE v7 embarqué dans le bundle ;
  sans aucun référentiel listé, sans menu.
- **A7 — Un autre référentiel** (étape 3, S5, lot E) : le visiteur choisit
  un autre référentiel publié dans le menu. L'adresse devient
  `#/referentiel?id=<id>`, **remplacée** (aucune entrée d'historique de plus,
  le code d'une compétence retiré) ; la page lit ce référentiel par son
  identifiant, la base d'abord (étape 2), et montre son libellé, sa version,
  ses pôles (leur couleur, celle par défaut sans), ses compétences et leurs
  définitions, sa provenance sous l'en-tête (RG7) ; ses permaliens portent
  `?id=<id>`, l'exemple de la recherche est son premier code. Le document
  précédent reste affiché le temps du chargement (page dite occupée,
  `aria-busy`). Au pointeur, le choix s'affiche aussitôt ; au clavier, les
  flèches parcourent les options sans rien charger, et l'option parcourue
  s'affiche à sa validation : Entrée, la sortie du menu, ou une seconde
  sans autre touche (RG6). RESPIRE choisi de nouveau ramène à
  `#/referentiel`.
- **A8 — Lien profond** (étape 1) : `#/referentiel?id=<id>` ouvre
  directement ce référentiel, à sa dernière version publiée, et
  `#/referentiel/<code>?id=<id>` y surligne la compétence (A5) ; le menu le
  montre choisi. `?id=respire` vaut `#/referentiel`. Dans la cartographie,
  « Voir dans le référentiel » mène à la page du référentiel de la carte
  (`DetailPanel`), plus à RESPIRE d'office.
- **A9 — API indisponible** (étape 2) : l'API injoignable, sans réponse
  dans les 5 s (sa requête est alors abandonnée), en erreur, vide
  ou malformée, ou un document qui n'est pas la version demandée : le menu
  et les documents viennent de l'export statique (`index.json` au format
  `StaticExporter`, plus récent d'abord ; `fichier` au nom sûr,
  `^[A-Za-z0-9._-]+\.json$`). L'index ne porte pas la provenance : elle vient
  du document (RG7).

## Scénarios d'erreur

- **E1 — Compétence inconnue** (A3) : `GET /api/competences/9.99` → `404`
  « Compétence introuvable » ; un code mal formé (`1.1`, `abc`) ne correspond à
  aucune route → `404`.
- **E2 — Aucune version publiée** (A4) : `GET /api/referentiel` → `404`
  « No published referentiel version » ; `/versions` renvoie `[]` ;
  `/versions/{semver}` et `/diff/…` sur une version non publiée (brouillon
  compris) ou inconnue → `404` « Unknown published version ».
- **E3 — Base non configurée** : toutes les lectures publiques → `503`
  « Database not configured ».
- **E4 — Permalien inconnu** (A5) : pour un code bien encodé, « Compétence
  « X » introuvable dans cette version du référentiel. » ; l'arbre complet
  reste affiché. Un pourcentage mal formé (`#/referentiel/%`, `%E9`…) n'est
  pas couvert (anomalie AN1).
- **E5 — Référentiel introuvable** (A8) : un identifiant que ni la base ni
  l'export ne publient, ou hors forme (`?id=../x`) : « Le référentiel « X »
  n'a pas pu être chargé : RESPIRE s'affiche à sa place. », et RESPIRE
  s'affiche, ses permaliens sans identifiant, sans autre alerte (le code
  était celui du référentiel introuvable). Le menu montre RESPIRE, le
  référentiel affiché (sur une base sans RESPIRE publié, le premier
  référentiel publié devient le choix, comme sans identifiant) ; y choisir
  de nouveau le référentiel qui n'a pas pu être chargé le redemande. Le mot
  « RESPIRE » de l'alerte est un lien vers `#/referentiel`, qui rend
  l'adresse sans l'identifiant. Un identifiant hors forme n'est demandé ni à
  l'API ni comme fichier.

## Règles de gestion

- **RG1** — Seules les versions au statut `published` sont publiques ; elles
  sont immuables (toute écriture → 409, UC-EPI).
- **RG2** — « Dernière version » = précédence **semver** (`Semver::compare` :
  7.10.0 > 7.9.0), ni l'ordre lexical, ni l'ordre d'insertion, ni la date.
- **RG3** — Le contenu relu de MySQL est remis sous forme canonique
  (`ContentHash::normalize` : ordre des clés fixe, pôles triés par `num`,
  compétences par `code`, clés annexes conservées **après** les clés cœur).
  `contentHash` = SHA-256 du corps **structurel** canonique
  `{poles: [{num, nom, couleur}], competences: [{code, nom, pole}]}` :
  définitions, libellé et version en sont exclus, si bien que deux versions
  qui ne diffèrent que par leurs définitions (7.0.0 et 7.1.0 en production)
  partagent la même empreinte.
- **RG4** — Depuis S5 (lot E), la page publique lit comme les parcours : la
  base par l'API publique d'abord, l'export statique en repli, RESPIRE
  embarqué en dernier (`loadPublishedReferentiel({id})`, la règle du lot A).
  Elle était « zéro PHP » jusque-là : choix de Christian (S5), pour qu'un
  référentiel publié s'y voie dès sa publication. La branche sans identifiant
  du chargeur, celle de l'interface de cartographie, reste statique. L'API
  est attendue 5 s au plus (`API_TIMEOUT_MS`, revue du lot E) : une API qui
  ne répond ni ne refuse (PHP-FPM saturé, verrou MySQL) ne tient pas la page
  sur « Chargement du référentiel… », sa requête est abandonnée et l'export
  statique répond. Le catalogue lu dans la base sert 10 s
  (`CATALOGUE_TTL_MS`) : la page, qui charge un référentiel puis liste le
  menu, ne le demande qu'une fois ; une version publiée entre-temps se voit
  passé ce délai.
- **RG5** — La différence est **structurelle** : une définition ajoutée ou
  modifiée n'en fait pas partie.
- **RG6** — RESPIRE est le défaut : son adresse ne nomme aucun identifiant
  (`?id=respire` vaut `#/referentiel`). Le menu propose chaque référentiel
  publié à sa **dernière** version (aucune autre) et remplace l'adresse ;
  l'adresse ne nomme pas de version. Le menu montre toujours le référentiel
  affiché. Un choix au pointeur s'affiche aussitôt ; au clavier, où Chrome
  et Firefox sous Windows émettent un « change » à chaque flèche d'un menu
  fermé, l'option parcourue ne s'affiche qu'à sa validation (Entrée, la
  sortie du menu, ou une seconde sans autre touche : sous macOS, Entrée
  choisit dans la liste déroulante, hors de la page), pas à chaque flèche
  (WCAG 3.2.2).
- **RG7** — Sous l'en-tête d'un autre référentiel que RESPIRE, sa provenance :
  le `source` de son document (requis par le schéma), une fois ; le menu de
  la page ne la répète pas (`provenance={false}`).

## Données et RGPD

Aucune donnée personnelle : le référentiel est un contenu public. Les
métadonnées exposées (`releaseNote`, `publishedAt`, `decidimUrl`) ne
contiennent pas l'auteur du brouillon.

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash`, `referentielHash` | Routes `#/referentiel[/<code>][?id=<id>]` (RG6) |
| Front | `web/src/views/ReferentielView.jsx` ; `web/src/App.jsx` (`route.referentiel`) | Arbre, recherche, permalien, encart Decidim ; menu, lien profond, provenance, référentiel introuvable (A7, A8, E5, RG7) |
| Front | `web/src/components/ReferentielChoice.jsx` | Le menu des référentiels publiés ; un choix nommé sans version (sa dernière), `provenance={false}` |
| Front | `web/src/data/referentiel.js` — `loadPublishedReferentiel({id})`, `listPublishedReferentiels` | L'API d'abord, l'export statique en repli (gardes), RESPIRE embarqué, cache (RG4) |
| Front | `web/src/data/load.js` — `getReferentiel` | Référentiel RESPIRE v7 embarqué (repli) |
| Front | `web/src/carto/ui/DetailPanel.jsx` | « Voir dans le référentiel » : la page du référentiel de la carte (A8) |
| Front | `web/src/help/registry.js` — entrée `referentiel` | L'aide dit ce qu'est l'Humanome V18, s'il est proposé (S5, E1, E9) |
| Front | `web/src/nav.js` — `FAMILIES` ; `web/src/components/FamilyTiles.jsx` | Entrée « Référentiel » de la famille « Découvrir », indice de la tuile |
| API | `GET /api/referentiels`, `/referentiels/{id}/versions/{semver}` (S5, lot A), `GET /api/referentiel`, `/referentiel/versions`, `/referentiel/versions/{semver}`, `/referentiel/diff/{from}/{to}` — `api/src/routes/referentiel.php` | Lectures publiques des référentiels ; les deux premières, celles de la page |
| API | `GET /api/competences`, `/competences/{code}`, `/competences/{code}/versions` — `api/src/routes/competences.php` (motif de route `{code:[0-9]\.[0-9]{2}}`) | Lectures publiques des compétences ; garde des codes |
| API | `api/src/Referentiel/RoleGuard.php` — `any` | Écritures et ateliers réservés (401/403, garantie minimale) |
| Domaine | `api/src/Referentiel/ReferentielRepository.php` — `latestPublished`, `publishedVersions`, `findPublished`, `metadata` | Versions publiées, précédence semver |
| Domaine | `api/src/Referentiel/ContentHash.php` — `normalize`, `compute` | Forme canonique et empreinte structurelle (RG3) |
| Domaine | `api/src/Referentiel/Semver.php` — `compare` | Précédence semver (RG2) |
| Domaine | `api/src/Referentiel/ReferentielDiff.php` — `compute` | Différence structurelle |
| Domaine | `api/src/Referentiel/StaticExporter.php` — `export` ; `scripts/export-referentiel-static.php` (CLI manuel) | Fichiers statiques, le repli de la page (A9) |
| Domaine | `api/src/Referentiel/CompetenceRepository.php` — `latestPublishedByCode`, `latestPublished`, `publishedVersions`, `metadata` | Compétences atomiques publiées |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-VIS-02-U01 | `ReferentielRepository::publishedVersions`, `latestPublished`, `Semver::compare` | Plus récente d'abord (7.10.0 > 7.9.0, insérées en ordre inverse et à dates inversées), brouillon exclu (RG1, RG2) | `api/tests/UseCases/Unit/UcVis02ConsulterReferentielTest.php` |
| UC-VIS-02-U02 | `ReferentielRepository::findPublished` | Brouillon ou inconnue → `null` | idem |
| UC-VIS-02-U03 | `mapRow` → `ContentHash::normalize`, `ReferentielRepository::metadata` | Ordre canonique des clés (document, pôles, compétences, clé annexe `description` après les clés cœur), empreinte cohérente, métadonnées sans contenu (RG3) | idem |
| UC-VIS-02-U04 | `ReferentielDiff::compute`, `ContentHash::normalize` | Renommage détecté ; définition seule = identique (RG5) et même `contentHash` (RG3) | idem |
| UC-VIS-02-U05 | `StaticExporter::export` | Un fichier par version publiée + index (plus récente d'abord), brouillon non exporté (RG4) | idem |
| UC-VIS-02-U06 | `CompetenceRepository::latestPublishedByCode`, `publishedVersions`, `latestPublished` | Dernière publiée par code, tri, brouillons exclus | idem |
| UC-VIS-02-U07 | `CompetenceRepository::latestPublished`, `metadata` | Contenu riche relu, métadonnées sans contenu (la garde des codes est le motif de route, F07) | idem |
| UC-VIS-02-U08 | `parseHash`, `referentielHash` | Routes et permaliens | `web/test/usecases/unit/uc-vis-02-consulter-referentiel-public.test.js` |
| UC-VIS-02-U09 | `loadPublishedReferentiel` (sans identifiant, celui de l'interface de cartographie depuis le lot E) | Index au format `StaticExporter`, préférence `respire`, première entrée sinon, cache | idem |
| UC-VIS-02-U10 | `loadPublishedReferentiel` | Index vide, en erreur HTTP, forme inattendue, version absente (404) → repli embarqué, jamais de rejet (A6) | idem |
| UC-VIS-02-U11 | `parseHash` | **Comportement actuel figé** — anomalie AN1 (permalien mal encodé → `URIError`) | idem |
| UC-VIS-02-U12 | `parseHash`, `referentielHash` | `?id=<id>` avec ou sans code ; `?id=respire`, vide ou absent : pas de clé `referentiel` ; un identifiant quelconque passe tel quel ; encodage, aller-retour (A8, RG6) | idem |
| UC-VIS-02-U13 | `ReferentielView` (coutures `load`, `list`, `replaceHash`) | RESPIRE chargé par son identifiant ; le menu remplace l'adresse sans le code, RESPIRE de nouveau ne la change pas ; l'autre chargé par le sien, sa provenance une fois, ses permaliens `?id=` ; introuvable : dit, RESPIRE à sa place, une alerte (A7, A8, E5, RG6, RG7) | `web/src/views/ReferentielView.test.jsx` |
| UC-VIS-02-U14 | `ReferentielChoice` | Nommé sans version, un référentiel est montré à sa dernière ; inconnu, le défaut, sans choix imposé ; `provenance={false}` tait la ligne (RG6, RG7) | `web/src/components/ReferentielChoice.test.jsx` |
| UC-VIS-02-U15 | `loadPublishedReferentiel({id})`, `listPublishedReferentiels` | Une API qui ne répond pas : passé le délai, sa requête abandonnée (signal), l'export statique répond au chargeur comme au menu ; délai par défaut 5 s (A9, RG4) | `web/test/usecases/unit/uc-vis-02-consulter-referentiel-public.test.js` |
| UC-VIS-02-U16 | `ReferentielView` | Un référentiel au catalogue qui ne se charge pas : le menu montre RESPIRE, affiché ; le choisir de nouveau le redemande, il s'affiche (E5, RG6) | `web/src/views/ReferentielView.test.jsx` |
| UC-VIS-02-U17 | `ReferentielView` | Au clavier, les flèches ne chargent rien et le menu montre l'option parcourue ; Entrée, la sortie du menu ou un instant sans touche l'affichent ; au pointeur, aussitôt (A7, RG6) | idem |
| UC-VIS-02-U18 | `loadPublishedReferentiel` | `file://` (aucune lecture), nom de fichier dangereux (garde `SAFE_FILE_RE`), index au JSON invalide → repli embarqué (A6) | `web/test/usecases/unit/uc-vis-02-consulter-referentiel-public.test.js` |
| UC-VIS-02-U19 | `ReferentielView` | Un chargement plus lent, d'un choix déjà quitté, n'écrase pas le référentiel demandé ; pendant le chargement, l'ancien document affiché, `aria-busy`, sans alerte (A7, RG6) | `web/src/views/ReferentielView.test.jsx` |
| UC-VIS-02-U20 | `ReferentielView` | Une base sans RESPIRE publié : le menu choisit le premier référentiel, l'adresse est remplacée une fois, sans entrée d'historique (RG6, RG7) | idem |
| UC-VIS-02-U21 | `loadPublishedReferentiel({id})`, `listPublishedReferentiels` | La page qui charge un référentiel puis liste le menu ne demande le catalogue de la base qu'une fois ; un échec n'est pas gardé, un catalogue plus vieux que sa durée se relit (A9, RG4) | `web/test/usecases/unit/uc-vis-02-consulter-referentiel-public.test.js` |
| UC-VIS-02-U22 | `ReferentielView` | Une base sans RESPIRE publié et un identifiant introuvable : le premier référentiel devient le choix, le menu ne montre pas un autre référentiel que celui affiché (E5, RG6) | `web/src/views/ReferentielView.test.jsx` |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-VIS-02-F01 | A4 | API | `GET /api/referentiel` → 7.1.0 (pas le brouillon) ; aucune session PHP active, aucun `Set-Cookie` | `api/tests/UseCases/Functional/UcVis02ConsulterReferentielTest.php` |
| UC-VIS-02-F02 | A4 | API | `/versions` : métadonnées seules, plus récente d'abord, aucune session | idem |
| UC-VIS-02-F03 | A1, E2 | API | `/versions/7.0.0` ; version soumise au vote et inconnue → 404 « Unknown published version » ; la version au vote n'est pas servie par `/referentiel` | idem |
| UC-VIS-02-F04 | A2, E2 | API | `/diff/7.0.0/7.1.0` ; version au vote / inconnue → 404 « Unknown published version » | idem |
| UC-VIS-02-F05 | A3 | API | `/competences` : dernière publiée par code, sans contenu, aucune session | idem |
| UC-VIS-02-F06 | A3 | API | `/competences/{code}` (fiche riche) et `/versions` (historique) | idem |
| UC-VIS-02-F07 | E1 | API | Inconnue → 404 ; mal formée → 404 ; historique inconnu → `[]` | idem |
| UC-VIS-02-F08 | E2 | API | Aucune version publiée → 404 et liste vide | idem |
| UC-VIS-02-F09 | E3 | API | Base non configurée → 503 partout | idem |
| UC-VIS-02-F10 | A4, RG4 | API | Script CLI `export-referentiel-static.php` (processus séparé, base de test) : export = contenu de l'API au moment de l'export ; nom de fichier sûr (contrat avec le front) | idem |
| UC-VIS-02-F11 | Garantie minimale | API | Le visiteur ne peut rien écrire (401) | idem |
| UC-VIS-02-F12 | Nominal (1-3) | IHM | Shell réel (sans session injectée) : indice de la tuile (« les compétences, pôle par pôle »), clic sur « Référentiel » du menu, « Chargement du référentiel… » tant que la base n'a pas répondu, 7.1.0, 7 pôles (couleur), 61 compétences, définition, Decidim ; le menu (RESPIRE d'abord et choisi), sans provenance ; lecture = `api/referentiels` et `api/referentiels/respire/versions/7.1.0`, aucun fichier statique (RG4) | `web/test/usecases/functional/uc-vis-02-consulter-referentiel-public.test.jsx` |
| UC-VIS-02-F13 | Nominal (4) | IHM | Recherche sans accents sur code, nom, définition ; aucun résultat ; retour aux 61 compétences et 7 pôles rendus (recherche blanche puis vide) | idem |
| UC-VIS-02-F14 | A5 | IHM | Permalien : surbrillance, `aria-current`, défilement de la ligne 7.03 | idem |
| UC-VIS-02-F15 | A6 | IHM | Hors ligne → référentiel embarqué v7, aucun menu | idem |
| UC-VIS-02-F16 | E4 | IHM | Code inconnu → message, arbre intact | idem |
| UC-VIS-02-F17 | A6 | IHM | Index désignant `../x.json` → fichier jamais lu (l'index seul, par le chargeur et le menu), référentiel embarqué v7, 61 compétences, aucun menu | idem |
| UC-VIS-02-F18 | A7, RG6, RG7 | IHM | Le fictif à la forme Humanome choisi au menu : adresse `?id=` remplacée (historique inchangé), libellé, version, 2 pôles, 3 compétences, couleur, provenance et licence une fois, définition, permaliens `?id=`, exemple « A1 », recherche ; lu dans la base, aucun fichier statique ; RESPIRE de nouveau : `#/referentiel`, 61 compétences, sans provenance | idem |
| UC-VIS-02-F19 | A8, A5 | IHM | Lien profond `#/referentiel/A2?id=…` : le référentiel, A2 surligné et amené à l'écran, le menu le montre ; RESPIRE au menu : adresse sans code, plus de surbrillance | idem |
| UC-VIS-02-F20 | A9, RG7 | IHM | API absente : le menu (deux référentiels) et les documents viennent de l'export statique ; la provenance, du document | idem |
| UC-VIS-02-F21 | E5 | IHM | `?id=inconnu` (avec un code) : l'alerte et son lien vers `#/referentiel`, RESPIRE 7.1.0, une seule alerte, menu sur RESPIRE, permaliens sans identifiant, aucun document demandé pour lui ; `?id=../../x` : l'alerte, rien de demandé qui contienne `..` | idem |

### Tests existants liés (non-régression)

- `api/tests/ReferentielApiTest.php`, `api/tests/CompetenceApiTest.php` — lectures publiques et cycle d'édition.
- `api/tests/ReferentielUnitTest.php` — empreinte de contenu, semver, diff.
- `api/tests/ReferentielImportExportTest.php` — import idempotent, export statique.
- `web/src/views/ReferentielView.test.jsx`, `web/src/data/referentiel.test.js` (« API d'abord, export statique en repli », S5), `web/src/data/referentiel-v710.test.js`, `web/src/App.test.jsx` (route `#/referentiel`).
- `api/tests/ReferentielApiTest.php` — `testAnyPublishedReferentialIsServedByIdAndVersion` (S5, lot A) : les deux routes que lit la page, versions publiées seules.
- `web/src/components/ReferentielChoice.test.jsx` (le menu, UC-EPI-05-F17 et F28) ; `web/src/carto/ui/Referentiels.test.jsx` (« Voir dans le référentiel » d'une carte à pôles lettrés : `#/referentiel/A1?id=fictif-lettre`, A8) ; `web/src/help/registry.test.js` (l'aide de la page dit ce qu'est l'Humanome V18).

### Exécuter

```sh
(cd api && DB_TEST_NAME=humanome_test_vis vendor/bin/phpunit --filter UcVis02 --testdox)
cd web && npx vitest run test/usecases/unit/uc-vis-02 test/usecases/functional/uc-vis-02 \
  src/views/ReferentielView.test.jsx src/components/ReferentielChoice.test.jsx
```

## Anomalies constatées

- **AN1 — Permalien mal encodé : l'application plante.** `parseHash`
  (`web/src/router.js`) applique `decodeURIComponent` au segment du permalien
  sans `try/catch` : `#/referentiel/%`, `#/referentiel/100%` ou
  `#/referentiel/%E9` lèvent une `URIError`. `App` calculant sa route
  initiale par `useState(currentRoute)`, sans frontière d'erreur, la page
  reste **blanche** au lieu du message E4. Les motifs `#/compte/…`,
  `#/espace/…`, `#/guides/…`, `#/admin/…`… ont le même défaut. Comportement
  actuel figé par UC-VIS-02-U11.

## Limites

- La page publique ne montre que la dernière version de chaque référentiel
  (RG6) : l'historique et les différences ne sont consultables que par l'API
  (pas d'IHM publique).
- Pour un autre référentiel, la page montre ses compétences, pas leurs
  éléments (les facettes de l'Humanome V18) ; une définition est un texte,
  ses retours à la ligne gardés, son Markdown non rendu (les `**` se voient).
- La différence entre versions ignore les définitions (RG5) : une release qui
  n'ajoute que des définitions est annoncée `identical: true`.
- `GET /api/competences/{code}/versions` répond `200 []` pour un code inconnu,
  là où `GET /api/competences/{code}` répond `404`.
- **L1** — Depuis S5 (lot E), une release coupée dans l'atelier de
  **production**, ou un autre référentiel publié, s'affiche aussitôt sur la
  page publique, qui lit la base. En **repli** seulement (API injoignable,
  A9), la page lit l'export statique, qui en reste privé tant qu'il n'y a
  pas eu ré-export (`scripts/export-referentiel-static.php`, contre la base
  locale) puis redéploiement (voir UC-EPI-03, L1) : aucun déploiement ni
  build n'exécute l'export.
- Un repli pris sur une panne passagère reste en cache jusqu'au rechargement
  de la page (la page reste en v7.0.0 embarquée).
- De même, une API qui répond après plus de 5 s (RG4) laisse la page sur
  l'export statique, gardé en cache jusqu'au rechargement : une version
  publiée depuis le dernier export ne s'y voit qu'au rechargement suivant,
  si l'API répond alors à temps.
