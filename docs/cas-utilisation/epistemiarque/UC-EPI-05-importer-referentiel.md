# UC-EPI-05 — Importer un référentiel d'une autre structure

| Champ | Valeur |
|---|---|
| **Acteur principal** | Épistémiarque (ou administrateur : garde « épistémiarque ou admin ») |
| **Acteurs secondaires** | Membres épistémiarques (vote, UC-EPI-02 A5) ; chaque compte, qui choisit un référentiel publié dans son profil Twin9 (UC-APP-10, page Configuration) ; l'auteur d'un brouillon, pour ses runs d'essai |
| **Portée** | Atelier `#/epistemiarque/referentiels` (section « Autres référentiels ») ; API `POST /api/referentiel/import`, `GET /api/referentiels`, et le cycle du grain document (`/api/referentiel/drafts…`, `/api/referentiel/proposals…`, UC-EPI-04) |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.5, §4.1 ; T15 (dépôt `Twin_v9`, `docs/plan-twin9-php.md`, lot 4c, première tâche) ; schéma `referentiel` 2.0.0 (`docs/contrats.md` §9) |
| **Statut** | Implémenté (T15) ; le moteur ne lit encore que RESPIRE (T16), la cartographie que ses 7 pôles (T17) |

## Objectif

Faire entrer par l'atelier un référentiel d'une autre structure que RESPIRE —
un autre nombre de pôles, des codes lettrés, plusieurs niveaux comme les
capacités et les facettes de l'Humanome V18 — en choisissant le niveau qui
tient lieu de compétence, puis le faire voter et publier comme une version,
sans que RESPIRE change.

## Déclencheur

Un épistémiarque dispose du référentiel au format JSON du schéma
`referentiel` 2.0.0 (par exemple converti depuis sa source) et veut le
proposer aux membres.

## Préconditions

- Session ouverte, rôle `epistemiarque` ou `admin` ; jeton CSRF.
- Le document déclare ses niveaux et le motif des codes de chacun (`niveaux`),
  sauf s'il n'a qu'un niveau au motif de RESPIRE (`\d\.\d{2}`).

## Garanties en cas de succès

- Un brouillon (`draft`) du référentiel, dont l'importateur est l'auteur
  (`created_by`), lu au niveau choisi : les éléments de ce niveau sont ses
  compétences, chacune sous le pôle de sa compétence d'origine, ses éléments
  plus fins dessous ; ses `niveaux` commencent au niveau choisi.
- Après le vote et la publication, la version est servie (`GET /api/referentiels`)
  et proposée à chaque compte dans son profil Twin9.

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
  autre, et pas en mode complet. Jusqu'à T16, le lancement n'accepte que
  RESPIRE (RG8).

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
- **RG6** — RESPIRE ne change pas : il ne s'importe pas, et le schéma garde
  sa structure (7 pôles, 61 compétences au format `P.NN`, sans niveaux
  déclarés) sur tout chemin vers une de ses versions, la coupe de sa release
  comprise.
- **RG7** — Un brouillon (ou une proposition au vote) ne sert qu'aux runs
  d'essai de son auteur, tant qu'il est épistémiarque ou administrateur ;
  publié, le référentiel est à tous (`ProfilPolicy`, matrice « Configuration
  Twin9 » de `docs/autorisations.md`).
- **RG8** — Jusqu'à T16, le moteur lit les fiches RESPIRE de son jeu de
  gabarits, quel que soit le référentiel du profil : un run ou son aperçu sur
  un autre référentiel est refusé (`422` « L'analyse approfondie ne lit
  encore que le référentiel RESPIRE »).
- **RG9** — Une annotation d'une cartographie qui désigne une version de
  référentiel porte un code de ce référentiel ; sans référentiel désigné, la
  forme de RESPIRE (`[1-7].NN`).

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
| API | `api/src/routes/referentiel.php` — `POST /referentiel/import`, `GET /referentiels`, listes de tous les référentiels, fork d'un autre | Orchestration |
| Domaine | `api/src/Referentiel/ReferentielRepository.php` — `importDraft`, `auNiveau`, `niveaux`, `regexDuMotif`, `validateDocument`, `catalogue`, `brouillonsDe`, `findVersion`, `editableVersions` | Import, contrôles, lectures |
| Domaine | `api/src/Referentiel/ContentHash.php` | Niveaux et éléments gardés hors de l'empreinte |
| Domaine | `api/src/Twin9/ProfilPolicy.php`, `api/src/Twin9/Lancement.php` | RG7, RG8 |
| API | `api/src/routes/annotations.php` | RG9 |
| Contrat | `schemas/referentiel.schema.json` (2.0.0), `engine/src/validation-compiled.js` | Format, RESPIRE gardé |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-EPI-05-U01 | `validateDocument`, schéma | RESPIRE se valide tel quel, même empreinte ; son code lettré, sa compétence en moins, ses niveaux déclarés refusés par le schéma (RG6) | `api/tests/UseCases/Unit/UcEpi05ImporterReferentielTest.php` |
| UC-EPI-05-U02 | `validateDocument`, `ContentHash` | 5 pôles lettrés à deux niveaux, 9 pôles valides ; un pôle numéroté `1.0` est le pôle 1 ; ordre canonique ; niveaux, descriptions et éléments hors empreinte (RG5) | idem |
| UC-EPI-05-U03 | `regexDuMotif` | Code entier, ancres, `/` dans un motif, motif illisible ; un motif qui sortirait de ses ancres (groupe fermé avant l'heure, verbe `(*…)`) n'a pas d'expression (RG2) | idem |
| UC-EPI-05-U04 | `validateDocument` | Code hors motif, élément d'un niveau non déclaré, code en double, pôles avec un trou, motif illisible ou qui sortirait de ses ancres, motif au retour arrière catastrophique (refusé une fois, limite PCRE rétablie), code hors schéma, chacun à son pointeur (RG2, RG3) | idem |
| UC-EPI-05-U05 | `auNiveau` | Niveau facette : 40 compétences, pôle hérité, niveaux tranchés ; une branche qui s'arrête plus haut refusée et nommée, un niveau vide refusé (RG4) | idem |
| UC-EPI-05-U06 | `importDraft` | Brouillon de son auteur au niveau choisi ; RESPIRE 409, identifiant 422, niveau inconnu 422, version existante 409 | idem |
| UC-EPI-05-U07 | `catalogue`, `brouillonsDe`, `findVersion`, `editableVersions` | Lectures des publiés, des brouillons d'un auteur, d'une version, des éditables de tous les référentiels | idem |
| UC-EPI-05-U08 | `createEpistemiarqueApi` | `importReferentiel` (niveau facultatif), `listCatalogue` | `web/test/usecases/unit/uc-epi-05-importer-referentiel.test.js` |
| UC-EPI-05-U09 | `apiFetch` | Un refus garde son détail par pointeur (`errors`), une autre erreur non | idem |
| UC-EPI-05-U10 | `createDraft` | La nouvelle version garde l'identifiant de sa source, quelle que soit la graphie demandée (casse, espace final) | `api/tests/UseCases/Unit/UcEpi05ImporterReferentielTest.php` |

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
| UC-EPI-05-F08 | RG6, DoD | API | RESPIRE ne change pas : version, empreinte, versions publiées ; son brouillon refuse un code lettré | idem |
| UC-EPI-05-F09 | Nominal | IHM | Fichier à deux niveaux, niveau choisi, import, message, rechargement | `web/test/usecases/functional/uc-epi-05-importer-referentiel.test.jsx` |
| UC-EPI-05-F10 | A3, E4 | IHM | Un seul niveau, sans choix ; fichier illisible dit | idem |
| UC-EPI-05-F11 | E1 | IHM | Refus du serveur affiché avec ses pointeurs, sans rechargement ; le fichier écarté, choisi de nouveau, part corrigé | idem |
| UC-EPI-05-F12 | Étapes 4–5 | IHM | Soumettre, voter, retirer, publier une proposition adoptée ; RESPIRE absent de la section | idem |
| UC-EPI-05-F13 | A4 | IHM | Un administrateur non membre : pas de vote, publication possible | idem |
| UC-EPI-05-F14 | Étape 1 | IHM | Le lien de l'atelier ; section vide dite | idem |
| UC-EPI-05-F15 | Étape 4 | IHM | « Voir » : le document au vote, pôle par pôle, avant le vote ; « Masquer » ; un brouillon aussi | idem |

### Tests existants liés (non-régression)

- `api/tests/Twin9/ConfigurationDroitsTest.php` — `testADraftServesOnlyItsAuthorsTestRuns` (RG7, la ligne de la matrice), `testOnlyAPublishedReferential`.
- `api/tests/Twin9/RunsTest.php` — `testARunReadsRespireOnlyUntilTheEngineReceivesItsReferential` (RG8 ; un brouillon RESPIRE sert le run d'essai de son auteur).
- `api/tests/AnnotationsTest.php` — `testACartographyOfAnotherReferentialTakesItsCodes` (RG9).
- `web/src/views/ConfigurationView.test.jsx` — les brouillons proposés en version.
- UC-EPI-03 (coupe de release : complétude gardée par le schéma), UC-EPI-04 (grain document), `ReferentielApiTest`, `ReferentielImportExportTest`, `CompetenceReleaseTest`, `engine/test/usecases/unit/uc-sys-04-chaine-artefacts-derives.test.js` (validateurs compilés).

### Exécuter

```sh
(cd api && vendor/bin/phpunit --filter 'UcEpi05|testADraftServesOnlyItsAuthorsTestRuns|testARunReadsRespireOnly|testACartographyOfAnotherReferential' --testdox)
cd web && npx vitest run test/usecases/unit/uc-epi-05 test/usecases/functional/uc-epi-05
```

## Anomalies constatées

Aucune.

## Limites

- **L1** — Les pointeurs d'un refus désignent le document trié par code,
  comme pour toute écriture du grain document : le message nomme le code
  fautif.
- **L2** — L'import lit du JSON au format du schéma : un référentiel publié
  sous une autre forme (le Markdown ou le YAML de l'Humanome V18, par
  exemple) se convertit d'abord.
- **L3** — Le libellé et la version suivent UC-EPI-04 AN2 : trop longs, ils
  donnent un `500` au lieu d'un `422`.
- **L4** — Le moteur (T16) et la cartographie (T17) ne lisent encore que
  RESPIRE ; la page publique `#/referentiel` ne montre que lui.
- **L5** — La comparaison de deux versions (`ReferentielDiff`) ignore les
  niveaux et les éléments.
