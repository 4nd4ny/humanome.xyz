# UC-EPI-05 — Importer un référentiel d'une autre structure

| Champ | Valeur |
|---|---|
| **Acteur principal** | Épistémiarque (ou administrateur : garde « épistémiarque ou admin ») |
| **Acteurs secondaires** | Membres épistémiarques (vote, UC-EPI-02 A5) ; chaque compte, qui choisit un référentiel publié dans son profil Twin9 (UC-APP-10, page Configuration) ou au lancement d'une cartographie standard, ouverte ou de masse ; l'auteur d'un brouillon, pour ses runs d'essai |
| **Portée** | Atelier `#/epistemiarque/referentiels` (section « Autres référentiels ») ; API `POST /api/referentiel/import`, `GET /api/referentiels`, `GET /api/referentiels/{id}/versions/{semver}`, et le cycle du grain document (`/api/referentiel/drafts…`, `/api/referentiel/proposals…`, UC-EPI-04) ; hors vote, l'amorçage de l'Humanome V18 converti de son YAML (`scripts/convertir-humanome.mjs`, `scripts/amorcer-referentiel.php`, S5, A6) |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.5, §4.1 ; T15 (dépôt `Twin_v9`, `docs/plan-twin9-php.md`, lot 4c, première tâche) ; schéma `referentiel` 2.1.0 (`docs/contrats.md` §9 et §11) |
| **Statut** | Implémenté (T15) ; le moteur lit le référentiel du run depuis T16, la cartographie depuis T17 (`docs/contrats.md` §10) ; conversion et amorçage de l'Humanome V18 depuis S5 (A6) |

## Objectif

Faire entrer par l'atelier un référentiel d'une autre structure que RESPIRE —
un autre nombre de pôles, des codes lettrés, plusieurs niveaux comme les
capacités et les facettes de l'Humanome V18 — en choisissant le niveau qui
tient lieu de compétence, puis le faire voter et publier comme une version,
sans que RESPIRE change.

## Déclencheur

Un épistémiarque dispose du référentiel au format JSON du schéma
`referentiel` (2.1.0 ; un document écrit pour 2.0.0 y reste valide), par
exemple converti depuis sa source, et veut le proposer aux membres. Le YAML
de l'Humanome V18 (https://respire.school/referentiel) se convertit par
`scripts/convertir-humanome.mjs` (A6, `docs/referentiel-humanome.md`).

## Préconditions

- Session ouverte, rôle `epistemiarque` ou `admin` ; jeton CSRF.
- Le document déclare ses niveaux et le motif des codes de chacun (`niveaux`),
  sauf s'il n'a qu'un niveau au motif de RESPIRE (`\d\.\d{2}`).

## Garanties en cas de succès

- Un brouillon (`draft`) du référentiel, dont l'importateur est l'auteur
  (`created_by`), lu au niveau choisi : les éléments de ce niveau sont ses
  compétences, chacune sous le pôle de sa compétence d'origine, ses éléments
  plus fins dessous ; ses `niveaux` commencent au niveau choisi.
- Après le vote et la publication, la version est servie (`GET /api/referentiels`
  la liste, `GET /api/referentiels/{id}/versions/{semver}` son document, à
  tous, en lecture seule) et proposée à chaque compte : dans son profil Twin9
  et, depuis le 2026-10-20, au choix du référentiel de la cartographie
  standard, de la cartographie ouverte (Twin6) et des cartographies de masse.
  Depuis S5 (2026-10-22), ces trois menus la lisent dans la base, dès sa
  publication : plus besoin d'un export statique ni d'un redéploiement. Ses
  fiches de scan s'écrivent depuis son document, sans rien à générer (RG10).
- Un brouillon ou une proposition ne sont jamais servis par ces routes, pas
  même à leur auteur (ils ne servent que ses runs d'essai, RG7).

## Garanties minimales (en cas d'échec)

- Aucun document invalide n'est enregistré ; RESPIRE n'est jamais modifié
  par un import.

## Scénario nominal

1. L'épistémiarque ouvre l'atelier (`#/epistemiarque`) et suit le lien
   « Autres référentiels » (`#/epistemiarque/referentiels`).
2. Il choisit le fichier du référentiel. S'il déclare plusieurs niveaux, la
   page propose le « Niveau qui tient lieu de compétence » (le premier par
   défaut) ; il choisit, par exemple, la capacité plutôt que la facette.
3. « Importer » : `POST /api/referentiel/import` `{document, niveau?}`. Le
   serveur refuse RESPIRE et un identifiant invalide, valide le document tel
   quel (schéma puis contrôles : motifs, niveaux, pôles 1 à N, codes uniques),
   le lit au niveau choisi, le valide de nouveau, refuse une version qui
   existe déjà et l'enregistre en brouillon → `201`. La page dit « Brouillon
   « id » version importé : N compétences en M pôles. » et se recharge.
4. Il soumet le brouillon au vote (« Soumettre au vote »,
   `POST /api/referentiel/drafts/{id}/submit`) ; les membres lisent le
   document (« Voir » : ses pôles et leurs compétences,
   `GET /api/referentiel/drafts/{id}`) et votent (« Pour », « Contre »,
   « Abstention », `POST /api/referentiel/proposals/{id}/votes`).
5. À la majorité, « Publier » (`POST /api/referentiel/drafts/{id}/publish`) :
   la version est immuable, listée parmi les publiés
   (`GET /api/referentiels`), et proposée dans la page Configuration de chacun.

## Scénarios alternatifs

- **A1 — Niveau facette** (étape 2) : les facettes deviennent les compétences
  (40 pour le référentiel fictif des tests), sous le pôle de leur capacité ;
  le niveau capacité n'est pas gardé.
- **A2 — Nouvelle version** : `POST /api/referentiel/drafts`
  `{referentiel, from, semver}` forke une version d'un autre référentiel comme
  celle de RESPIRE (UC-EPI-04) ; ou l'épistémiarque importe le fichier sous
  une nouvelle version. `referentiel` est un identifiant
  (`[a-z0-9][a-z0-9._-]{0,63}`, sinon `422`) ; la nouvelle version garde
  celui de sa source.
- **A3 — Un seul niveau** (étape 2) : sans choix à faire, le document est lu à
  son premier niveau.
- **A4 — Administrateur** (étapes 3 à 5) : un `admin` non membre importe,
  soumet, retire et publie ; il ne vote pas (UC-EPI-04 A4).
- **A5 — Run d'essai sur son brouillon** : son auteur, tant qu'il est
  épistémiarque ou administrateur, le désigne dans un profil Twin9 en mode
  essai (page Configuration : « version (brouillon, run d'essai) ») ; nul
  autre, et pas en mode complet. Depuis T16, le moteur lit le référentiel
  du run, le brouillon compris (RG8).
- **A6 — L'Humanome V18, converti et amorcé hors vote** (S5, décision de
  Christian du 2026-10-22 ; `docs/referentiel-humanome.md`). Sur le poste :
  `node scripts/convertir-humanome.mjs <humanome_v18.yaml>` écrit le document
  au niveau capacité (20 compétences, les 64 facettes en éléments ; `--niveau
  facette` en option) dans `build/referentiels/`, en avertissant des écarts
  entre l'en-tête `structure` du YAML et son contenu ; puis
  `php scripts/amorcer-referentiel.php <document.json>` le publie sans vote,
  idempotent sur le document entier, hors sa provenance (`source` : le même
  YAML sous un autre nom de fichier ou une autre URL est la même version).
  Il refuse RESPIRE, un identifiant invalide, une version déjà en base avec
  un autre contenu ou tenue par l'atelier. La version est ensuite servie par les routes publiques et
  proposée par les menus des parcours, comme une version votée. En
  production, sans shell : par l'atelier (étapes 1 à 5), ou par
  `POST /api/admin/import-referentiel`, qui applique les mêmes garde-fous à
  tout autre identifiant que `respire` (`docs/referentiel-humanome.md` §5).

## Scénarios d'erreur

- **E1 — Document refusé** (étape 3) : un code qui ne suit pas le motif de son
  niveau (« « E9 » ne suit pas le motif [A-E][1-4] du niveau « capacité » »),
  un motif illisible ou trop coûteux à évaluer (RG2), des pôles qui ne se
  numérotent pas de 1 à N sans trou, un élément d'un niveau que le
  référentiel ne déclare pas, un code en double, un niveau inconnu, une
  branche qui s'arrête au-dessus du niveau choisi (RG4), un document hors
  schéma → `422` avec, par pointeur, la raison ; la page les liste et écarte
  le fichier : choisi de nouveau, c'est sa version corrigée qui part. Rien
  n'est écrit.
- **E2 — Import refusé** (étape 3) : RESPIRE (`respire`) → `409` « RESPIRE
  s'édite compétence par compétence dans son atelier : il ne s'importe pas » ;
  une version qui existe → `409` ; un identifiant hors de
  `[a-z0-9][a-z0-9._-]{0,63}` → `422` (`/id`) ; un document absent ou qui
  n'est pas un objet → `422`.
- **E3 — Accès** : sans session `401`, sans rôle `403`, sans jeton CSRF `403`.
- **E4 — Fichier illisible** (étape 2) : un fichier qui n'est pas du JSON est
  dit dans la page ; rien ne part.
- **E5 — Brouillon d'un autre** (A5) : un profil qui désigne le brouillon d'un
  autre, ou le sien en mode complet → `422` « Profil refusé —
  /referentiel/version : un brouillon ne sert qu'aux runs d'essai de son
  auteur ».

## Règles de gestion

- **RG1** — Un référentiel déclare ses niveaux, du plus large au plus fin,
  chacun avec le motif de ses codes ; le premier tient lieu de compétence.
  Sans déclaration : un niveau, « compétence », au motif de RESPIRE
  `\d\.\d{2}`.
- **RG2** — Un code suit **en entier** le motif de son niveau (expression
  `^(?:motif)$`), sans quoi le moteur ne le retrouverait pas et sa compétence
  disparaîtrait sans bruit du run. Le motif reste entre ses ancres : il
  compile seul et n'use d'aucun verbe `(*…)`, sinon « Motif illisible ». Il
  s'évalue sous une limite de 10 000 pas de retour arrière : au-delà, il est
  refusé une fois (« Motif trop coûteux à évaluer »). Un code a 1 à 8
  caractères (lettres, chiffres, `.`, `_`, `-`), unique dans tout le
  référentiel.
- **RG3** — Les pôles se numérotent de 1 à N, sans trou ; un pôle lettré
  (A à E) porte son rang (1 à 5).
- **RG4** — Lire à un niveau : ses éléments deviennent les compétences, sous
  le pôle de leur compétence d'origine, leurs éléments plus fins dessous ; les
  niveaux plus larges ne sont pas gardés. Une branche qui s'arrête plus haut
  (une capacité sans facette, lue au niveau facette) disparaîtrait : l'import
  est refusé et la nomme, comme un niveau sans élément.
- **RG5** — L'empreinte (`contentHash`) ne compte que les pôles et les
  compétences, comme celle de RESPIRE ; niveaux, descriptions (des pôles, des
  compétences, des éléments) et éléments sont gardés hors d'elle.
- **RG6** — RESPIRE ne s'importe pas : il s'édite compétence par compétence
  (UC-EPI-01 à 03) ou comme un document (UC-EPI-04). Depuis le 2026-10-20, le
  schéma ne garde plus sa structure : une de ses versions peut compter
  d'autres pôles et d'autres compétences, comme tout référentiel ; sans niveaux
  déclarés, ses codes suivent le motif par défaut `\d\.\d{2}`. La coupe de
  sa release garde la structure de sa dernière version publiée (UC-EPI-03 E6).
- **RG7** — Un brouillon (ou une proposition au vote) ne sert qu'aux runs
  d'essai de son auteur, tant qu'il est épistémiarque ou administrateur ;
  publié, le référentiel est à tous (`ProfilPolicy`, matrice « Configuration
  Twin9 » de `docs/autorisations.md`).
- **RG8** — Depuis T16, le moteur lit le référentiel du profil, tiré de la
  base à sa version (`docs/contrats.md` §8.8) : un run ou son aperçu sur un
  autre référentiel part ; un référentiel que le moteur ne lit pas (un code
  fait de chiffres seulement, par exemple) est refusé au lancement (`422`
  « Le référentiel « id » ne se lit pas : … »). De T15 à T16, le moteur lisait
  les fiches RESPIRE de son jeu, et un autre référentiel était refusé.
- **RG9** — Une annotation d'une cartographie qui désigne une version de
  référentiel porte un code de ce référentiel ; sans référentiel désigné, la
  forme de RESPIRE (`[1-7].NN`).
- **RG10** — Un référentiel importé n'a pas de fiches à rédiger ni à générer :
  l'analyse approfondie (Twin9, depuis T16) et la cartographie ouverte (Twin6,
  depuis le 2026-10-20) écrivent la fiche de chaque pôle depuis son document,
  au moment du run — « # Pôle N — nom », puis la description du pôle ; pour
  chaque compétence, « ## CODE — nom », sa description, puis ses éléments plus
  fins, chacun un niveau de titre plus bas avec sa description. Ces fiches ne
  sont donc riches que de ce que le document décrit : le schéma n'a pas
  d'autre champ pour elles. La cartographie standard et la masse ne lisent que
  les pôles, les codes et les noms. RESPIRE, lui, garde ses fiches rédigées,
  dans la base (UC-EPI-01 à 03, UC-EPI-04 L3).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Document du référentiel | Public par nature ; aucune donnée personnelle |
| Auteur | `referentiel_versions.created_by`, remis à `NULL` si le compte est purgé (son brouillon ne sert alors plus à personne) |
| Bulletins | Voir UC-EPI-02 |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/epistemiarque/ReferentielsSection.jsx`, `web/src/views/EpistemiarqueView.jsx` (section `referentiels`, lien de l'atelier) | Import, niveau, lecture, vote, publication |
| Front | `web/src/views/epistemiarque/api.js` — `importReferentiel`, `listCatalogue`, `getDraft` ; `web/src/api/client.js` (`ApiError.errors`) | Client, détail d'un refus |
| Front | `web/src/views/ConfigurationView.jsx` | Brouillons proposés en version |
| API | `api/src/routes/referentiel.php` — `POST /referentiel/import`, `GET /referentiels`, `GET /referentiels/{id}/versions/{semver}` (S5), listes de tous les référentiels, fork d'un autre | Orchestration, lectures publiques des versions publiées |
| Front | `web/src/data/referentiel.js` — `listPublishedReferentiels`, `loadPublishedReferentiel` ; `web/src/components/ReferentielChoice.jsx` | Menus des parcours : la base par l'API publique d'abord, l'export statique en repli (S5) |
| Domaine | `api/src/Referentiel/ReferentielRepository.php` — `importDraft`, `auNiveau`, `niveaux`, `regexDuMotif`, `validateDocument`, `catalogue`, `brouillonsDe`, `findVersion`, `editableVersions` | Import, contrôles, lectures |
| Domaine | `api/src/Referentiel/ContentHash.php` | Niveaux et éléments gardés hors de l'empreinte |
| Domaine | `api/src/Twin9/ProfilPolicy.php`, `api/src/Twin9/Lancement.php`, `api/src/Twin9/ReferentielMoteur.php` | RG7, RG8, RG10 |
| Moteur | `engine/src/twin6/fiches.js` — `fichesDuReferentiel`, `fichesPourTwin6` | Fiches de Twin6 écrites depuis le document (RG10) |
| Moteur | `engine/src/referentiel-humanome.js` — `convertirHumanome`, `corpsDuHash` | Le YAML de l'Humanome en document du schéma (A6) |
| Script | `scripts/convertir-humanome.mjs` (paquet `yaml`, dépendance de développement du moteur) ; `scripts/amorcer-referentiel.php` — `AmorcageReferentiel::amorcer` | Conversion sur le poste ; amorçage hors vote, idempotent (A6) |
| API | `api/src/routes/annotations.php` | RG9 |
| Contrat | `schemas/referentiel.schema.json` (2.1.0), `engine/src/validation-compiled.js` | Format |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-EPI-05-U01 | `validateDocument`, schéma | RESPIRE se valide tel quel, même empreinte, motif par défaut ; une compétence en moins, un niveau déclaré passent ; un code lettré hors de son motif est refusé par l'intégrité (RG6) | `api/tests/UseCases/Unit/UcEpi05ImporterReferentielTest.php` |
| UC-EPI-05-U02 | `validateDocument`, `ContentHash` | 5 pôles lettrés à deux niveaux, 9 pôles valides ; un pôle numéroté `1.0` est le pôle 1 ; ordre canonique ; niveaux, descriptions et éléments hors empreinte (RG5) | idem |
| UC-EPI-05-U03 | `regexDuMotif` | Code entier, ancres, `/` dans un motif, motif illisible ; un motif qui sortirait de ses ancres (groupe fermé avant l'heure, verbe `(*…)`) n'a pas d'expression (RG2) | idem |
| UC-EPI-05-U04 | `validateDocument` | Code hors motif, élément d'un niveau non déclaré, code en double, pôles avec un trou, motif illisible ou qui sortirait de ses ancres, motif au retour arrière catastrophique (refusé une fois, limite PCRE rétablie), code hors schéma, chacun à son pointeur (RG2, RG3) | idem |
| UC-EPI-05-U05 | `auNiveau` | Niveau facette : 40 compétences, pôle hérité, niveaux tranchés ; une branche qui s'arrête plus haut refusée et nommée, un niveau vide refusé (RG4) | idem |
| UC-EPI-05-U06 | `importDraft` | Brouillon de son auteur au niveau choisi ; RESPIRE 409, identifiant 422, niveau inconnu 422, version existante 409 | idem |
| UC-EPI-05-U07 | `catalogue`, `brouillonsDe`, `findVersion`, `editableVersions` | Lectures des publiés, des brouillons d'un auteur, d'une version, des éditables de tous les référentiels | idem |
| UC-EPI-05-U08 | `createEpistemiarqueApi` | `importReferentiel` (niveau facultatif), `listCatalogue` | `web/test/usecases/unit/uc-epi-05-importer-referentiel.test.js` |
| UC-EPI-05-U09 | `apiFetch` | Un refus garde son détail par pointeur (`errors`), une autre erreur non | idem |
| UC-EPI-05-U10 | `createDraft` | La nouvelle version garde l'identifiant de sa source, quelle que soit la graphie demandée (casse, espace final) | `api/tests/UseCases/Unit/UcEpi05ImporterReferentielTest.php` |
| UC-EPI-05-U11 | `convertirHumanome` | Sur la fixture fictive à la forme Humanome : document attendu, valide au schéma ; libellé, `nomCourt`, niveaux déduits, palette, codes ; rubriques composées dans l'ordre, absentes omises, hors du document ce que le schéma ne représente pas ; provenance ; avertissements (`structure`, rubriques) ; empreinte de l'extracteur ; niveau facette ; refus à leur chemin ; fiches de scan (A6) | `engine/src/referentiel-humanome.test.js` |
| UC-EPI-05-U12 | `scripts/convertir-humanome.mjs` | Écrit le document attendu ; relancé, « déjà à jour » ; refuse d'écraser une version tirée d'un autre fichier, un YAML illisible ou refusé, un niveau inconnu (A6) | idem |
| UC-EPI-05-U13 | `ContentHash`, `auNiveau` | Le document converti a l'empreinte et l'ordre du serveur ; son niveau facette est celui d'`auNiveau` (A6) | `api/tests/ReferentielAmorcageTest.php` |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-EPI-05-F01 | Nominal, DoD | API | 5 pôles lettrés importés au niveau capacité (A1 à E4, facettes dessous), listés, votés, publiés, au catalogue ; RESPIRE servi | `api/tests/UseCases/Functional/UcEpi05ImporterReferentielTest.php` |
| UC-EPI-05-F02 | DoD | API | 9 pôles importés, votés, publiés | idem |
| UC-EPI-05-F03 | A1 | API | Niveau facette : 40 compétences sous le pôle de leur capacité | idem |
| UC-EPI-05-F04 | A2 | API | Fork d'une version d'un autre référentiel publié ; source inconnue 404 ; `referentiel` qui n'est pas un identifiant (une autre graphie) → 422, rien d'écrit | idem |
| UC-EPI-05-F05 | E1 | API | Code hors motif, motif illisible, trou, niveau non déclaré, niveau inconnu, branche qui s'arrête au-dessus du niveau → 422 avec la raison ; rien d'écrit | idem |
| UC-EPI-05-F06 | E2 | API | RESPIRE 409, version existante 409, identifiant 422, document absent 422 | idem |
| UC-EPI-05-F07 | E3, A4 | API | 401, 403, CSRF 403 ; un admin importe et soumet, ne vote pas | idem |
| UC-EPI-05-F08 | RG6, DoD | API | RESPIRE ne change pas : version, empreinte, versions publiées ; son brouillon refuse un code lettré hors de son motif, accepte six pôles | idem |
| UC-EPI-05-F09 | Nominal | IHM | Fichier à deux niveaux, niveau choisi, import, message, rechargement | `web/test/usecases/functional/uc-epi-05-importer-referentiel.test.jsx` |
| UC-EPI-05-F10 | A3, E4 | IHM | Un seul niveau, sans choix ; fichier illisible dit | idem |
| UC-EPI-05-F11 | E1 | IHM | Refus du serveur affiché avec ses pointeurs, sans rechargement ; le fichier écarté, choisi de nouveau, part corrigé | idem |
| UC-EPI-05-F12 | Étapes 4–5 | IHM | Soumettre, voter, retirer, publier une proposition adoptée ; RESPIRE absent de la section | idem |
| UC-EPI-05-F13 | A4 | IHM | Un administrateur non membre : pas de vote, publication possible | idem |
| UC-EPI-05-F14 | Étape 1 | IHM | Le lien de l'atelier ; section vide dite | idem |
| UC-EPI-05-F15 | Étape 4 | IHM | « Voir » : le document au vote, pôle par pôle, avant le vote ; « Masquer » ; un brouillon aussi | idem |
| UC-EPI-05-F16 | A6 | API | Amorçage publié sans vote puis « déjà amorcé », servi par `GET /api/referentiels` et par sa version ; même contenu sous une autre provenance « déjà amorcé », la première gardée ; autre contenu sous la même version (description, niveaux, structure), brouillon de l'atelier, RESPIRE, identifiant ou code invalides refusés, rien d'écrit ; la ligne de commande | `api/tests/ReferentielAmorcageTest.php` |
| UC-EPI-05-F17 | A6 | IHM | Le référentiel amorcé est proposé au menu des parcours et se charge tel que la base le sert ; sa provenance (`source`, servie par `GET /api/referentiels`) s'affiche sous le menu | `web/src/components/ReferentielChoice.test.jsx` |
| UC-EPI-05-F18 | A6 | API | En production, `POST /api/admin/import-referentiel` amorce un autre référentiel que RESPIRE avec les garde-fous du script : publié (note « Amorçage hors vote (S5) »), puis « unchanged », sous une autre provenance aussi ; une autre description sous la même version ou une empreinte fausse → `409`, rien d'écrit ; un identifiant invalide → `422` | `api/tests/AdminImportReferentielTest.php` |

### Tests existants liés (non-régression)

- `api/tests/Twin9/ConfigurationDroitsTest.php` — `testADraftServesOnlyItsAuthorsTestRuns` (RG7, la ligne de la matrice), `testOnlyAPublishedReferential`.
- `api/tests/Twin9/RunsTest.php` — `testARunReadsTheReferentialItsProfileNames` (RG8 : un run sur un autre référentiel part, ses réglages portent son référentiel ; un brouillon RESPIRE sert le run d'essai de son auteur).
- `engine/src/twin6/fiches.test.js` — les fiches de Twin6 d'un autre référentiel, écrites depuis son document (RG10).
- `api/tests/Twin9/ReferentielMoteurTest.php` — le référentiel que lit le moteur (RG8, RG10) : fiches de RESPIRE prises dans la base, celles d'un autre écrites depuis son document, ordre naturel des codes ; avec le vrai moteur, un référentiel qu'il ne lit pas est refusé au lancement.
- `api/tests/AnnotationsTest.php` — `testACartographyOfAnotherReferentialTakesItsCodes` (RG9).
- `web/src/views/ConfigurationView.test.jsx` — les brouillons proposés en version.
- `api/tests/ReferentielApiTest.php` — `testAnyPublishedReferentialIsServedByIdAndVersion` (S5) : une version publiée de tout référentiel servie à tous par son identifiant ; brouillon, proposition (même à leur auteur), identifiant ou version inconnus, autre graphie (casse, espace final) → `404` ; lecture seule (`405`) ; le catalogue ne liste que la publiée.
- `web/src/data/referentiel.test.js` (« API d'abord, export statique en repli ») ; `web/src/components/ReferentielChoice.test.jsx` ; UC-APP-02-F27, UC-APP-09-F31, UC-ETA-03-F30 — les menus des parcours lisent la base.
- UC-EPI-03 (coupe de release : complétude, la structure de la dernière version publiée), UC-EPI-04 (grain document), `ReferentielApiTest`, `ReferentielImportExportTest`, `CompetenceReleaseTest`, `engine/test/usecases/unit/uc-sys-04-chaine-artefacts-derives.test.js` (validateurs compilés).

### Exécuter

```sh
(cd api && vendor/bin/phpunit --filter 'UcEpi05|ReferentielAmorcageTest|testADraftServesOnlyItsAuthorsTestRuns|testARunReadsRespireOnly|testACartographyOfAnotherReferential' --testdox)
(cd engine && npx vitest run src/referentiel-humanome.test.js)
cd web && npx vitest run test/usecases/unit/uc-epi-05 test/usecases/functional/uc-epi-05 src/components/ReferentielChoice.test.jsx
```

## Anomalies constatées

Aucune.

## Limites

- **L1** — Les pointeurs d'un refus désignent le document trié par code,
  comme pour toute écriture du grain document : le message nomme le code
  fautif.
- **L2** — L'import lit du JSON au format du schéma : un référentiel publié
  sous une autre forme se convertit d'abord. Le YAML de l'Humanome V18 a son
  convertisseur, sur le poste (A6) ; l'atelier ne lit pas le YAML.
- **L6** — L'amorçage (A6) publie sans vote : c'est un choix de Christian
  pour l'Humanome V18 (S5, Q1). En production, il passe par
  `POST /api/admin/import-referentiel`, avec les garde-fous du script pour
  tout autre identifiant que `respire` ; RESPIRE y garde l'import du
  déploiement, qui ne compare que l'empreinte et laisse les descriptions de
  côté (`docs/referentiel-humanome.md` §5).
- **L3** — Le libellé et la version suivent UC-EPI-04 AN2 : trop longs, ils
  donnent un `500` au lieu d'un `422`.
- **L4** — La page publique `#/referentiel` ne montre que RESPIRE. (Le
  moteur lit le référentiel du run depuis T16, la cartographie depuis T17 :
  la carte d'un run s'ouvre avec lui.)
- **L5** — La comparaison de deux versions (`ReferentielDiff`) ignore les
  niveaux et les éléments.
