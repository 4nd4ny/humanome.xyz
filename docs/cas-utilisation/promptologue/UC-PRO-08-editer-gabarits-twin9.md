# UC-PRO-08 — Éditer les gabarits du Golden Prompt Twin9

| Champ | Valeur |
|---|---|
| **Acteur principal** | Administrateur-promptologue (compte portant **les deux** rôles `admin` et `promptologue`) |
| **Acteurs secondaires** | Script d'import `scripts/twin9/import-protocole.mjs` (manuel, jeton `X-Migrate-Token`), seul à écrire le jeu v9.8 ; garde-fou de publication `scripts/check-publiable.mjs` (hook `.githooks/pre-commit`, à activer par clone, et job CI `check-publiable` de `.github/workflows/publiable.yml`) ; script de déploiement (régénère les fiches confidentielles, UC-SYS-02) ; administrateur (fixe le jeu par défaut, UC-ADM-05) ; apprenants (leurs runs prennent le jeu que leur profil choisit, UC-APP-10) |
| **Portée** | humanome.xyz — vue `#/twin9-atelier`, routes `/api/twin9/admin/jeux*`, `POST /api/admin/twin9/import` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.4 (éditer et versionner le système de prompts), §3.8 et §4.10 (Golden Prompt privé), §7 ; ADR-010 §2 et §6 ; décision AD-D2 (`docs/autorisations.md`) ; plan du moteur PHP de `Twin_v9`, lot 4b (T14) |
| **Statut** | Implémenté (AD-D2 : conjonction des rôles ; D13 : lecture et restauration des versions ; T14 : jeux de gabarits, le jeu v9.8 en lecture seule) |

## Objectif

Permettre aux seuls administrateurs-promptologues de faire évoluer les gabarits
**confidentiels** du Golden Prompt Twin9 — le secret industriel de la
plateforme — sans jamais toucher au jeu v9.8 : le lire, le copier sous un nom,
modifier sa copie en texte brut, garder l'historique de chaque version, revenir
en arrière sans rien perdre, vérifier le rendu d'un gabarit avec des variables
d'exemple sans appel au modèle, puis choisir sa copie dans un profil de run.

## Déclencheur

L'administrateur-promptologue ouvre « Faire évoluer » → « Atelier Twin9 »
(`#/twin9-atelier`).

## Préconditions

- Le compte porte les rôles `admin` **et** `promptologue` (UC-ADM-01).
- Les gabarits du jeu v9.8 ont été importés en base par le script d'import
  (A4), qui lit `TWIN_V9_DIR` (par défaut `../Twin_v9`, **hors du dépôt**) ;
  ils ne sont jamais dans le dépôt : `.gitignore` écarte `golden-twin9/` et
  `engine/test/twin9-oracles/`, et le garde-fou de publication refuse tout
  fichier suivi sous ces répertoires ou sous `golden-prompt/` (RG8).

## Garanties en cas de succès

- Le gabarit modifié de la copie devient **immédiatement** celui que rend tout
  run dont le profil choisit la copie — ou le profil par défaut, si
  l'administrateur en a fait le jeu par défaut (UC-ADM-05).
- Le contenu précédent est archivé comme nouvelle version de la copie,
  attribuée à son auteur ; aucune version n'est jamais réécrite ni supprimée.
- Le jeu v9.8 ne change pas : ni son contenu, ni ses versions.
- Le contenu n'a transité que vers un client portant les deux rôles.

## Garanties minimales (en cas d'échec)

- Atelier (`/api/twin9/admin/*`) : rien n'est écrit si la saisie est invalide ;
  un refus (401, 403, 404, 409, 422) ne contient jamais le moindre fragment de
  gabarit ni de métadonnée.
- Exception, l'import technique (A4, réservé au détenteur du jeton) : son `422`
  cite le **nom** du fichier fautif, et l'écriture peut être **partielle**
  (anomalie 1).

## Scénario nominal

1. L'utilisateur ouvre `#/twin9-atelier` ; le shell lui a fourni ses rôles et la
   vue vérifie la conjonction admin ∧ promptologue (sinon E1).
2. La vue charge les jeux, `GET /api/twin9/admin/jeux` : le jeu v9.8 d'abord,
   puis les copies, chacune avec son auteur, son nombre de gabarits et le jeu
   par défaut — **sans contenu**. Elle ouvre la première copie de
   l'utilisateur (sans copie : A6) et liste ses gabarits, `GET
   /api/twin9/admin/jeux/{jeu}/protocole` : **métadonnées seules** (nom
   hiérarchique, longueur en caractères, variables `{$VAR}`, date) sous
   l'avertissement « Contenu confidentiel — ne pas divulguer ».
3. Il ouvre un gabarit : `GET /api/twin9/admin/jeux/{jeu}/protocole/{nom}` (nom
   encodé, ex. `lourd%2F20-greffier`) ; le contenu s'affiche en **texte brut**
   dans un éditeur (jamais interprété comme HTML).
4. Il modifie le texte et clique « Enregistrer » : `PUT
   /api/twin9/admin/jeux/{jeu}/protocole/{nom} {content}` (jeton CSRF, vérifié
   par `CsrfMiddleware` avant la route, E6). Le serveur vérifie que la copie est
   la sienne et qu'elle a ce gabarit (E2, E7), valide le contenu et ses
   variables (E3), archive l'ancien contenu comme version `n+1` (au nom de son
   auteur), écrit le nouveau contenu attribué à l'utilisateur, ré-extrait les
   variables et répond `{name, variables, status: "updated"}`. Côté IHM,
   « Enregistrer » est désactivé tant que le contenu est vide ou blanc.
5. La vue affiche « Gabarit « {nom} » enregistré (nouvelle version archivée). »
   et relit la liste.
6. Il choisit sa copie dans un profil (`#/configuration`) : dès lors, un run
   lancé avec ce profil en prend le contenu, dans chaque prompt que ce gabarit
   rend (UC-APP-10).

## Scénarios alternatifs

- **A1 — Contenu inchangé** (étape 4) : `status: "unchanged"`, aucune version
  créée ; « Contenu inchangé — aucune nouvelle version. »
- **A2 — Historique et retour arrière** (étape 3) : « Voir les versions » →
  `GET …/{nom}/versions` (métadonnées, plus récente d'abord ; la version 1 d'un
  gabarit d'une copie est le contenu copié du jeu v9.8) ; « Voir » → `GET
  …/{nom}/versions/{v}` (contenu archivé en lecture seule) ; « Restaurer » →
  `POST …/{nom}/restore {version}` : le contenu vivant est d'abord archivé,
  puis la version choisie redevient vivante (`restored_from`) ; restaurer un
  contenu identique au vivant ne crée rien (« La version N est identique au
  gabarit vivant — rien à restaurer. »).
- **A3 — Banc d'essai** (à tout moment, sur le jeu ouvert) : choix d'un
  gabarit, un champ par variable, « Rendre le gabarit » → `POST
  /api/twin9/admin/jeux/{jeu}/tester {name, variables}` → `{rendu,
  non_resolues}` affiché en texte brut ; **aucun appel LLM, aucun débit** ; les
  fiches confidentielles n'y sont pas injectées.
- **A4 — Import technique** (précondition, par le script manuel
  `scripts/twin9/import-protocole.mjs`, distinct de `deploy.mjs`) : le script lit
  les gabarits `php/protocole/**/*.md` de `TWIN_V9_DIR` (nommés par leur chemin
  relatif, `/` comme séparateur, sans `.md` ; les autres fichiers sont ignorés)
  — depuis T16, ceux de la v9.8 tels que les lit le moteur PHP : le référentiel
  y est en variables (`{$NB_COMPETENCES}`, `{$FORMAT_CODE}`, `{$REFERENTIEL}`,
  `{$LISTE_COMPETENCES}`), et les fichiers de pôle n'y sont plus, la base donnant
  les fiches (`docs/contrats.md` §8.8) ; un Twin_v9 d'avant T16, sans
  `php/protocole`, est refusé (sortie 1) —, ne retient de `config.json` que les
  réglages du protocole (`seuils_consensus`, `jury`, `juge_leger`, `merge`,
  `scan_global` — jamais les backends ni les
  workers Python), et fait extraire par le Twin_v9 lui-même (`python3`, module
  `aurora.referentiel`) la structure **non secrète** du référentiel (num/nom,
  code/nom) et, à part, les fiches **confidentielles** (en-tête de pôle,
  `fiche_md`) ; si l'extraction échoue, il avertit et les omet (le serveur
  conserve alors ceux qu'il détient). Il ne journalise que des noms et des tailles, jamais un contenu ;
  `--dry-run` s'arrête là. Sinon, `POST {base}/api/admin/twin9/import {files,
  config?, referentiel?, fiches?}` avec `X-Migrate-Token` (variable
  `MIGRATE_TOKEN`, sinon `.env.deploy` ; base : `--base-url`, sinon `SITE_URL`
  de `.env.deploy`, sinon `https://humanome.xyz`) ; toute réponse non 2xx fait
  échouer le script (sortie 1). Côté serveur : chaque fichier est écrit dans
  le **jeu v9.8** (auteur nul, versions archivées, réimport identique sans
  effet) ; un import **complet** — tous les gabarits que nomme le contrat des
  variables, ce qu'envoie le script — **remplace** le jeu : un gabarit qu'il
  ne porte pas en sort, son dernier contenu archivé parmi ses versions (T16 :
  les fichiers de pôle `tagger/P1` à `P7`), les noms comparés sans la casse ;
  un import partiel n'ôte rien ; les réglages du pipeline, la structure du référentiel (nettoyée :
  num/nom, code/nom) et les fiches confidentielles sont stockés ; Twin9 est
  **activé** ; réponse `{imported, retires}`. Les copies déjà faites ne changent
  pas. Depuis T11, aucun run ne lit plus les réglages du pipeline,
  l'activation ni les fiches ainsi stockées : ils servaient le moteur du
  navigateur ; les runs prennent leurs réglages dans leur profil, et leurs
  fiches dans la base (T16).
- **A5 — Lire le jeu v9.8 ou la copie d'un autre** (étape 2, liste des jeux) :
  la vue l'ouvre en lecture seule — éditeur en lecture, ni « Enregistrer » ni
  « Restaurer », et la mention « Le jeu v9.8 est en lecture seule : copiez-le
  pour le modifier. » ou « Lecture seule : cette copie est celle de {auteur}. ».
  Le banc d'essai et l'historique restent ouverts.
- **A6 — Copier le jeu v9.8** (étape 2 ; sans copie, la vue ouvre le jeu v9.8) :
  un nom, « Copier » → `POST /api/twin9/admin/jeux {id}` (jeton CSRF) : chaque
  gabarit du jeu v9.8 tel qu'il est, sans son histoire, dans une copie qui
  appartient à l'utilisateur → `201 {id, gabarits}` ; la vue relit les jeux,
  ouvre la copie et dit « Copie « {nom} » créée ({n} gabarits). Choisissez-la
  dans un profil de la page Configuration. »

## Scénarios d'erreur

- **E1 — Rôles insuffisants** (étape 1) : sans les deux rôles, la vue affiche
  « Cet atelier est réservé aux administrateurs-promptologues » sans aucun appel
  et la navigation ne propose pas le lien ; l'API répond `401` sans session et
  `403 {"error": "Rôle insuffisant"}` à un promptologue seul **comme** à un
  administrateur seul, sur toutes les routes de contenu et sur la copie.
- **E2 — Jeu, gabarit ou version inconnus** (étapes 3-4, A2, A3) : `404` « Jeu
  de gabarits introuvable » / « Gabarit introuvable » / « Version
  introuvable » — y compris pour un nom **hors format** (le gabarit est cherché
  avant toute validation du nom), et pour un `PUT` sur un nom que la copie n'a
  pas : une copie a les gabarits du jeu v9.8, aucun autre.
- **E3 — Saisie invalide** : à l'étape 4, contenu absent, vide ou ≥ 256 Ko, ou
  variable qu'aucune étape ne fournit au gabarit (RG10 : « Variable qu’aucune
  étape ne fournit à ce gabarit : {$X} ») → `422` ; en A2, version absente ou
  non entière → `422` ; au banc d'essai (A3), nom absent → `422` ; en A6, nom
  de copie invalide → `422` ; rien n'est écrit. Côté IHM, « Enregistrer » est
  désactivé pour un contenu vide ou blanc : le `422` n'est visible que pour les
  autres causes ; la vue affiche alors le message et garde le texte saisi.
- **E4 — Import refusé** (A4) : jeton non configuré → `404` ; jeton absent ou
  faux (une session, même d'atelier, ne suffit pas) → `403` ; sans fichier →
  `400` ; fichier invalide → `422 « Fichier invalide : <nom> »` (voir
  l'anomalie 1). Le script sort alors en `1` (« twin9 import failed »), après
  avoir journalisé le statut et le début de la réponse. Il s'arrête **avant tout
  envoi** (sortie `1`) sur une option inconnue, un répertoire
  `TWIN_V9_DIR/protocole` absent, un protocole sans aucun `.md`, ou un jeton
  introuvable.
- **E5 — API indisponible ou liste refusée** (étape 2) : copie statique →
  message d'indisponibilité ; tout autre échec de la liste des jeux (par ex.
  `403` si les rôles ont été retirés côté serveur) → « Chargement
  impossible. » ; aucun contenu.
- **E6 — Jeton CSRF absent ou faux** (étape 4, A2, A3, A6) : avec une session
  d'atelier valide mais sans `X-CSRF-Token` correct → `403 {"error": "Jeton
  CSRF absent ou invalide"}` ; rien n'est écrit.
- **E7 — Écriture refusée** (étape 4, A2) : sur le jeu v9.8 → `403` « Le jeu
  v9.8 est en lecture seule : copiez-le pour le modifier » ; sur la copie d'un
  autre → `403` « Seul l’auteur d’une copie la modifie » ; rien n'est écrit.
- **E8 — Copie impossible** (A6) : nom déjà pris, « v9.8 » compris → `409` « Ce
  nom est déjà pris » ; jeu v9.8 pas encore importé → `409` « Aucun gabarit
  v9.8 à copier : ils n’ont pas encore été importés » ; rien n'est écrit.

## Règles de gestion

- **RG1 — Conjonction AD-D2** : lire ou écrire le contenu, les versions, la
  restauration, le banc d'essai et la copie exigent `admin` ∧ `promptologue`
  (`RequireRole::all`, `TemplateSets::ATELIER`) ; la liste des jeux (noms,
  auteurs, sans contenu) est à l'administrateur, comme la supervision
  (UC-ADM-05). Depuis T11, `GET /api/twin9/meta` ne liste plus les gabarits
  du jeu v9.8 (noms, longueurs, variables) à tout utilisateur connecté : seul
  le moteur du navigateur les lisait. Restent visibles, du propriétaire d'un
  run et du cartographe lié, les noms des gabarits et leurs versions dans
  l'attestation du run (UC-APP-10) — résidu assumé, sans contenu (ADR-010 §2).
- **RG2 — Nom** : segments `[a-z0-9][a-z0-9_-]*` séparés par `/` (insensible à la
  casse), 190 caractères au plus (un saut de ligne final passe : anomalie 3).
- **RG3 — Contenu** : non vide (hors blancs), strictement inférieur à 256 Ko ;
  affiché et édité en texte brut uniquement.
- **RG4 — Versions** : toute écriture qui change le contenu archive l'ancien
  contenu (numéro croissant par jeu et par gabarit, auteur conservé) ; une
  restauration est une écriture comme une autre ; l'historique n'est jamais
  réécrit.
- **RG5 — Variables** : `{$VAR}` avec `VAR = [A-Z_][A-Z0-9_]*`, dans l'ordre de
  première apparition, sans doublon (syntaxe du Twin9 Python).
- **RG6 — Rendu du banc d'essai** : non strict, en une passe ; les variables
  absentes restent telles quelles ; `non_resolues` liste les motifs `{$…}`
  restant dans le **rendu**, y compris ceux apportés par les valeurs saisies
  (anomalie 2).
- **RG7 — Messages génériques** : aucune erreur des routes de l'atelier ne cite
  un gabarit (l'import, lui, cite le nom du fichier fautif, E4 ; un refus de
  variable cite la variable saisie, E3).
- **RG8 — Garde-fou de publication** (`scripts/check-publiable.mjs`, dépôt
  miroité en public) : sur les fichiers **suivis** par git, tout chemin sous
  `golden-twin9/`, `twin9-oracles/` ou `golden-prompt/` est refusé quel que soit
  son contenu, comme un `.env` réel, un cache `.pyc`, une clé Anthropic, un
  secret PayPal, un mot de passe hors fichiers de test, un chemin local absolu ou
  un identifiant d'hébergement ; sortie `1` avec la liste « [règle]
  fichier:ligne », sans recopier le contenu ; sortie `0` sinon. Voir Limites.
- **RG9 — Jeux** (T14) : le jeu v9.8 ne s'écrit que par l'import (A4) ; une
  copie porte un nom `[a-z0-9][a-z0-9._-]*` de 64 caractères au plus, unique,
  qui est son identifiant ; elle a les gabarits du jeu v9.8 au moment de la
  copie, et aucun autre ; seul son auteur l'écrit ; tout atelier la lit.
- **RG10 — Variables fournies** (T14) : un gabarit d'une copie n'emploie que
  les variables que son étape lui fournit, celles que le contrat
  (`schemas/twin9-protocole-contrat.json`) nomme pour ce gabarit et celles que
  son original du jeu v9.8 emploie ; un gabarit que ni l'un ni l'autre ne nomme
  (les fiches `tagger/P1` à `P7`) n'en reçoit aucune. Une restauration rend un
  contenu que la copie a déjà eu.
- **RG11 — Choix d'un jeu** (T14) : un profil choisit le jeu v9.8, le jeu par
  défaut, que fixe l'administrateur (UC-ADM-05), ou une copie de son
  propriétaire tant que celui-ci est de l'atelier (`ProfilPolicy`,
  `TemplateSets::pour`) ; le profil par défaut prend le jeu par défaut. Un
  profil qui nomme un jeu que son propriétaire ne peut plus choisir est
  refusé, à l'enregistrement comme au lancement (`422`), jusqu'à ce qu'il en
  choisisse un autre. Un run garde l'instantané du jeu de son profil et son
  attestation (le jeu, la version de chaque gabarit) ; chaque jeu a sa propre
  mémoire de carte.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Gabarits (secret industriel) | En base : le jeu v9.8 dans `twin9_protocole`, les copies dans `twin9_jeux_gabarits` ; jamais dans le dépôt ; le **contenu** n'est jamais envoyé à un client sans les deux rôles ; depuis T11, `/api/twin9/meta` ne liste plus les **métadonnées** (noms, longueurs, variables) ; seuls les noms des gabarits d'un run, avec leurs versions, figurent dans son attestation, que lisent son propriétaire et le cartographe lié ; la liste des jeux, sans contenu, est à l'administrateur |
| Historique | `twin9_protocole_versions`, `twin9_jeux_versions` ; auteur mis à `NULL` si son compte est supprimé (le gabarit appartient à la plateforme) |
| Copies | `twin9_jeux` (nom, auteur, date) ; son auteur mis à `NULL` si son compte est supprimé : la copie survit, que personne ne modifie plus |
| Auteur d'une édition | `updated_by` / `created_by` (identifiant de compte) |
| Contrat des variables | `schemas/twin9-protocole-contrat.json` : noms de gabarits et de variables seulement, non secret (ADR-010 §2) |
| Fiches confidentielles | Réglage `twin9_fiches`, écrit par l'import **et** régénéré à chaque déploiement depuis la base (`/api/admin/generate-fiches`, garde-fou 409, UC-SYS-02) ; jamais exposé |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash` | Route `#/twin9-atelier` |
| Front | `web/src/nav.js` — `navGroups` (`allRoles`) | Lien visible seulement avec les deux rôles |
| Front | `web/src/views/Twin9AtelierView.jsx` | Garde, jeux (choix, copie), liste, éditeur texte brut (en lecture pour le jeu v9.8 et la copie d'un autre), historique, aperçu, restauration, banc d'essai |
| Front | `web/src/api/twin9.js` — `fetchJeux`, `copierJeu`, `fetchProtocoleList`, `fetchProtocole`, `saveProtocole`, `fetchProtocoleVersions`, `fetchProtocoleVersion`, `restoreProtocoleVersion`, `testerProtocole` | Client de l'atelier (jeu, puis noms encodés) |
| API | `GET/POST /api/twin9/admin/jeux`, `GET/PUT /api/twin9/admin/jeux/{jeu}/protocole{/nom}`, `…/versions{/v}`, `…/restore`, `POST /api/twin9/admin/jeux/{jeu}/tester` — `api/src/routes/twin9.php` | Routes de l'atelier (conjonction ; la liste, administrateur) |
| API | `POST /api/admin/twin9/import` — `api/src/routes/twin9.php` | Import technique (le jeu v9.8) |
| API | `api/src/Middleware/CsrfMiddleware.php` | Jeton CSRF des écritures de l'atelier (E6) — logique unitaire couverte par UC-CPT-02-U07 |
| Domaine | `api/src/Twin9/TemplateSets.php` — `lister`, `copier`, `lire`, `ecrire`, `restaurer`, `variablesRefusees`, `contrat`, `pour`, `defaut`, `fixerDefaut` | Les jeux : copie, écriture réservée à l'auteur, variables fournies, jeux d'un profil, jeu par défaut |
| Domaine | `api/src/Twin9/ProtocoleRepository.php` — `list`, `jeu`, `get`, `put`, `versions`, `version`, `restore`, `render`, `extractVariables`, `assertValidName`, `assertValidContent` | Dépôt versionné des gabarits d'un jeu |
| Domaine | `api/src/Twin9/ProfilPolicy.php`, `api/src/Twin9/Lancement.php` | Jeu choisi par un profil, profil par défaut, instantané et attestation du run |
| Domaine | `api/src/Middleware/RequireRole.php` — `all` | Garde conjonctive |
| Domaine | `api/src/Twin9/Twin9Config.php`, `api/src/Twin9/FicheStore.php` | Activation, réglages, référentiel, fiches (import) |
| Contrat | `schemas/twin9-protocole-contrat.json` (livré avec la release, `scripts/deploy/stage-api.sh`) | Variables fournies à chaque gabarit (RG10) |
| Script | `scripts/twin9/import-protocole.mjs` | Acteur technique de A4 : lecture de `TWIN_V9_DIR`, filtre des réglages, extraction python du référentiel et des fiches, envoi avec `X-Migrate-Token` — script sans export, exécuté dès son chargement : couvert fonctionnellement seulement, en sous-processus (UC-PRO-08-F19 à F22) |
| Script | `scripts/check-publiable.mjs` (+ `.githooks/pre-commit`, `.github/workflows/publiable.yml`) | Garde anti-fuite : aucun gabarit Twin9 ni secret dans les fichiers suivis (RG8) — script sans export, exécuté dès son chargement : couvert fonctionnellement seulement, en sous-processus (UC-PRO-08-F17, F18) |

## Jeux de tests

Les deux scripts techniques (`check-publiable.mjs`, `import-protocole.mjs`)
s'exécutent dès leur chargement et n'exportent rien : ils sont rejoués par leur
interface en ligne de commande, en **sous-processus**, sur des dossiers
temporaires fictifs (`os.tmpdir()`) — tests fonctionnels de niveau « CLI »
(UC-PRO-08-F17 à F22), rangés avec les tests du moteur
(`engine/test/usecases/unit/`, exécutés par la CI de publication) comme ceux
de UC-SYS-04. L'effet d'une copie sur le prompt d'un run (UC-PRO-08-F09) se
rejoue avec le moteur factice, chargé dans un processus à part, comme les
autres tests de runs.

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-PRO-08-U01 | `parseHash` | `#/twin9-atelier` distinct de `#/admin/twin9` | `web/test/usecases/unit/uc-pro-08-editer-gabarits-twin9.test.jsx` |
| UC-PRO-08-U02 | `navGroups` | Lien « Atelier Twin9 » seulement avec les deux rôles (RG1) | idem |
| UC-PRO-08-U03 | client API de l'atelier | Jeux, copie, jeu par défaut ; jeu puis noms hiérarchiques encodés, méthodes, corps, CSRF | idem |
| UC-PRO-08-U04 | `Twin9AtelierView` | Contenu et rendu en texte brut, champs par variable (RG3) | idem |
| UC-PRO-08-U05 | `ProtocoleRepository::put`, `versions`, `version` | created / updated / unchanged, archivage attribué (RG4) ; compte supprimé → auteur `NULL`, versions intactes (RGPD) | `api/tests/UseCases/Unit/UcPro08EditerGabaritsTwin9Test.php` |
| UC-PRO-08-U06 | `ProtocoleRepository::restore` | Restauration non destructive, 404 | idem |
| UC-PRO-08-U07 | `assertValidName`, `assertValidContent` | Bornes du nom et du contenu, rien d'écrit (RG2-RG3) ; **anomalie 3 figée** (saut de ligne final) | idem |
| UC-PRO-08-U08 | `extractVariables`, `list` | Variables ordonnées ; métadonnées sans contenu (RG5) | idem |
| UC-PRO-08-U09 | `RequireRole::all` | Sans session → 401 ; admin seul, promptologue seul → 403 ; les deux → passage avec `userId` et rôles ; au moins un rôle | idem |
| UC-PRO-08-U10 | `ProtocoleRepository::render` | Banc d'essai : une passe, variables saisies seules, fiches non injectées, absentes listées (RG6) ; **anomalie 2 figée** | idem |
| UC-PRO-08-U11 | `FicheStore::store`, `Twin9Config::update`, `setReferentiel` | Briques de l'import : fiches nettoyées, référentiel réduit à num/nom et code/nom (ni fiche ni en-tête), pipeline, activation (A4) | idem |
| UC-PRO-08-U12 | `TemplateSets::copier` | Copie du jeu v9.8 telle quelle, sans histoire, à son auteur ; noms invalides (422) ou pris (409) ; rien à copier (409) ; le jeu v9.8 intact ; compte supprimé → copie sans auteur (RG9) | idem |
| UC-PRO-08-U13 | `TemplateSets::ecrire`, `restaurer`, `variablesRefusees`, `contrat` | L'auteur seul, les gabarits de la copie seuls, les variables fournies (contrat + original) ; jeu v9.8 en lecture seule (RG9, RG10) | idem |
| UC-PRO-08-U14 | `TemplateSets::pour`, `defaut`, `fixerDefaut`, `lister` | Jeux d'un compte : v9.8, défaut, ses copies tant qu'il est de l'atelier ; jeu par défaut parmi ceux qui existent (RG11) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-PRO-08-F01 | Nominal | IHM | `<App/>` : jeux, copie ouverte, liste, ouverture, édition, PUT avec CSRF, message, liste relue | `web/test/usecases/functional/uc-pro-08-editer-gabarits-twin9.test.jsx` |
| UC-PRO-08-F02 | A1 | IHM | Contenu identique : « aucune nouvelle version » | idem |
| UC-PRO-08-F03 | A2 | IHM | Historique, aperçu d'une version, restauration, historique relu ; restauration d'une version identique → « rien à restaurer » | idem |
| UC-PRO-08-F04 | A3 | IHM | Banc d'essai : rendu, non résolues, aucun appel LLM | idem |
| UC-PRO-08-F05 | E1 | IHM | Admin seul : atelier réservé, aucun appel, pas de lien | idem |
| UC-PRO-08-F06 | E3 | IHM | Contenu vide ou blanc : « Enregistrer » désactivé, aucun PUT ; 422 (variable qu'aucune étape ne fournit) à l'enregistrement : message, texte conservé | idem |
| UC-PRO-08-F07 | E5 | IHM | API indisponible : message ; liste des jeux refusée (403) : « Chargement impossible. » ; aucun contenu | idem |
| UC-PRO-08-F08 | Nominal, A1, A2, A3, A6 | API | Jeux → jeu v9.8 lu → copie → liste → lecture `%2F` → édition → PUT identique « unchanged » → versions → restauration → restauration identique « unchanged » → banc d'essai sans appel au modèle ni débit ; le jeu v9.8 intact | `api/tests/UseCases/Functional/UcPro08EditerGabaritsTwin9Test.php` |
| UC-PRO-08-F09 | Nominal (étape 6) | API | Un mot changé dans une copie se retrouve dans le prompt de chaque lecture d'un run dont le profil la choisit ; un run du jeu v9.8, sur sa propre carte, garde les mots du jeu v9.8 (moteur factice) ; avec le vrai moteur de `TWIN_V9_DIR`, sauté sans lui, dans le prompt du tagger | `api/tests/Twin9/JeuxGabaritsTest.php` |
| UC-PRO-08-F10 | A4 | API | Import : gabarits, réglages, référentiel servi par `/meta`, fiches gardées sur le serveur (jamais servies) ; `/meta` ne nomme plus les gabarits ; activation, idempotence | `api/tests/UseCases/Functional/UcPro08EditerGabaritsTwin9Test.php` |
| UC-PRO-08-F11 | E1 | API | 401 visiteur ; 403 promptologue seul et admin seul, sans fragment, copie comprise | idem |
| UC-PRO-08-F12 | E2, E7 | API | 404 (statut et message) jeu, gabarit, version inconnus, nom hors format, PUT sur un nom que la copie n'a pas ; 403 sur le jeu v9.8 et la copie d'un autre | idem |
| UC-PRO-08-F13 | E3 | API | 422 sur chaque saisie invalide, variable refusée et nom de copie compris, rien d'écrit | idem |
| UC-PRO-08-F14 | E4 | API | 404 / 403 / 400 (statuts et messages) à l'import ; **anomalie 1 figée** : import partiel, au premier import comme au réimport (Twin9 reste activé, gabarits mélangés) | idem |
| UC-PRO-08-F15 | E6 | API | Sans jeton CSRF ou jeton faux → 403 sur la copie, le PUT, la restauration, le banc d'essai ; rien d'écrit | idem |
| UC-PRO-08-F16 | Anomalies 3-5 | API | Clé d'import numérique refusée ; nom à saut de ligne final accepté ; gabarit « …/versions » importé mais illisible | idem |
| UC-PRO-08-F17 | RG8 | CLI | `scripts/check-publiable.mjs` dans un dépôt git temporaire : répertoires de gabarits refusés quel que soit le contenu, `.env` réel, clé, mot de passe hors tests → sortie 1 et liste sans contenu ; gabarit rangé ailleurs, ligne à marqueur, binaire, fichier non suivi : non relevés ; dépôt propre → sortie 0 | `engine/test/usecases/unit/uc-pro-08-editer-gabarits-twin9.test.js` |
| UC-PRO-08-F18 | RG8 (Limites) | CLI | **Limite figée** : chemins lus dans l'index mais contenu lu sur le disque — clé indexée puis effacée du disque non relevée ; répertoire de gabarits supprimé du disque mais indexé toujours refusé | idem |
| UC-PRO-08-F19 | A4, E4 | CLI | `scripts/twin9/import-protocole.mjs --dry-run` (copie en miroir temporaire, faux `TWIN_V9_DIR`) : `.md` de `php/protocole` seuls, noms hiérarchiques sans `.md`, réglages filtrés, noms et tailles journalisés sans contenu, rien envoyé ; répertoire absent, protocole vide, Twin_v9 d'avant T16 (sans `php/protocole`), option inconnue (avec `--dry-run`) → sortie 1 | idem |
| UC-PRO-08-F20 | A4, E4 | CLI + HTTP simulé | Faux serveur `127.0.0.1` : `POST /api/admin/twin9/import`, `X-Migrate-Token`, corps `{files, config}` sans référentiel ni fiches non extraits ; refus 403 → sortie 1 « twin9 import failed » | idem |
| UC-PRO-08-F21 | A4 | CLI + HTTP simulé | Faux module `aurora` (`python3`, sauté sans) : référentiel non secret (num/nom, code/nom) et fiches confidentielles (en-tête, `fiche_md`) envoyés séparément, pôles triés, aucun texte de fiche journalisé | idem |
| UC-PRO-08-F22 | E4 | CLI + HTTP simulé | Jeton introuvable (ni `MIGRATE_TOKEN`, ni `.env.deploy` dans le miroir) → sortie 1 « MIGRATE_TOKEN missing (.env.deploy or environment) », aucune requête reçue par le faux serveur | idem |
| UC-PRO-08-F23 | A6 | IHM | Sans copie, le jeu v9.8 ouvert en lecture ; « Copier » → POST avec CSRF → la copie ouverte, éditable | `web/test/usecases/functional/uc-pro-08-editer-gabarits-twin9.test.jsx` |
| UC-PRO-08-F24 | A5, E7 | IHM | Liste des jeux (lecture seule, la sienne, le défaut) ; la copie d'un autre ouverte en lecture : ni « Enregistrer » ni « Restaurer », aucune écriture | idem |

### Tests existants liés (non-régression)

- `api/tests/Twin9ProtocoleTest.php` — import (complet, il remplace le jeu v9.8 et archive ce qu'il n'y porte plus ; partiel, il n'ôte rien, T16), matrice de rôles complète, jeux (copie, lecture seule, variables, jeu par défaut), versions, restauration, banc d'essai, extraction.
- `api/tests/Twin9/JeuxGabaritsTest.php` — le jeu v9.8 ne change jamais au fil d'une session d'atelier et des runs de ses copies ; le profil par défaut prend le jeu par défaut ; une copie incomplète est refusée au lancement ; le contrat couvre les variables des gabarits du jeu v9.8, ceux de `php/protocole` (sauté sans `TWIN_V9_DIR`).
- `api/tests/Twin9/ConfigurationDroitsTest.php` — les jeux qu'un profil choisit (RG11).
- `web/src/views/Twin9AtelierView.test.jsx` — garde, jeux, copie, lecture seule, édition, versions, banc d'essai (noms plats).
- `web/src/nav.test.js` — conjonction des rôles dans la navigation.
- Job CI `check-publiable` (`.github/workflows/publiable.yml`) — applique `scripts/check-publiable.mjs` au dépôt lui-même à chaque push sur `main` et à chaque pull request (aucun gabarit Twin9 dans les fichiers publiables).

### Exécuter

```sh
(cd api && vendor/bin/phpunit --filter 'UcPro08|JeuxGabaritsTest' --testdox)
cd web && npx vitest run test/usecases/unit/uc-pro-08 test/usecases/functional/uc-pro-08
cd engine && npx vitest run test/usecases/unit/uc-pro-08
```

## Anomalies constatées

1. **Import non atomique.** `POST /api/admin/twin9/import` écrit les fichiers un
   par un sans transaction : si un fichier du lot est invalide, la réponse est
   `422` mais les fichiers valides qui le précèdent sont **déjà** écrits ; la
   configuration, le référentiel et les fiches ne sont pas mis à jour, et Twin9
   garde son état d'activation antérieur. Au premier import il reste désactivé ;
   lors d'un **réimport** (cas normal en production) il reste **activé** et sert
   aux apprenants un mélange de gabarits neufs et anciens. Figé par
   UC-PRO-08-F14.
2. **Variables « non résolues » calculées sur le rendu.**
   `ProtocoleRepository::render` cherche les motifs `{$X}` dans le texte
   **rendu** et non dans le gabarit : une valeur saisie contenant `{$X}` fait
   apparaître `X` dans `non_resolues`, même si `X` a été fourni. Au banc
   d'essai, le rapport est faux ; jusqu'à T11, le proxy du moteur du
   navigateur, `/api/twin9/appel`, qui partageait `render()`, en bloquait
   l'analyse payante. Figé par UC-PRO-08-U10.
3. **Nom à saut de ligne final accepté.** `NAME_PATTERN` se termine par `$` sans
   le modificateur `D` : en PCRE, `$` accepte un saut de ligne final, donc
   `assertValidName("lourd/20-greffier\n")` passe, contrairement à RG2. Par
   l'import (dont les noms sont les clés JSON), on peut stocker dans le jeu
   v9.8 un gabarit distinct de « lourd/20-greffier ». Figé par UC-PRO-08-U07 et
   UC-PRO-08-F16.
4. **Clé d'import purement numérique refusée.** `json_decode(…, true)`
   transforme une clé comme « 20 » en entier : l'import répond `422 « Fichier
   invalide : 20 »` pour un nom pourtant valide selon RG2. Figé par
   UC-PRO-08-F16.
5. **Gabarit « …/versions » inaccessible.** Les routes `GET
   …/{nom}/versions` et `…/versions/{v}`, déclarées avant la route générique,
   captent un gabarit dont le dernier segment est « versions » (« x/versions ») :
   l'import peut l'écrire dans le jeu v9.8, et une copie l'emporterait, mais
   l'atelier ne le relit jamais — il renvoie les versions de « x » ou `404` —,
   ni ne l'édite. Figé par UC-PRO-08-F16.

## Limites

- Le front encode le `/` des noms hiérarchiques (`%2F`) ; Slim le décode et les
  tests en processus passent, mais un serveur Apache configuré avec
  `AllowEncodedSlashes Off` (valeur par défaut) refuse ces URL avant PHP — à
  vérifier sur l'hébergement (non vérifiable ici).
- Le banc d'essai n'injecte pas les fiches confidentielles : `COMPETENCE_FICHE`
  et `POLE_FICHES` y apparaissent comme non résolues (UC-PRO-08-F08).
- Les éditions de l'atelier ne sont pas journalisées dans l'audit : seule
  l'attribution `updated_by` / `created_by` garde la trace de l'auteur.
- Une copie ne se renomme ni ne se supprime. Un gabarit qu'un import ultérieur
  ajoute au jeu v9.8 n'entre pas dans les copies déjà faites : un run qui
  choisit l'une d'elles est refusé au lancement (`422`, « … n’a pas tous les
  gabarits du jeu v9.8 : il faut en refaire une copie »).
- Depuis T16, les fiches du référentiel viennent de la base, plus du jeu : les
  fichiers de pôle (`tagger/P1` à `P7`) qu'une copie faite avant T16 garde
  encore n'y sont plus lus, et les y éditer reste sans effet sur un run. Une
  telle copie garde aussi les gabarits d'avant T16, où la v9.8 écrit RESPIRE en
  toutes lettres (« 61 », « X.YY », « référentiel RESPIRE ») : elle sert
  RESPIRE, ses prompts ceux de la v9.8 ; un run sur un autre référentiel est
  refusé au lancement (`422`, « … précède T16 … il faut refaire une copie du
  jeu v9.8 », ou d'abord le réimporter s'il précède T16 lui aussi).
- Le contrat ne nomme, pour chaque gabarit, que les variables qu'emploient les
  gabarits du jeu v9.8 : une variable que le moteur fournit à une étape sans
  que la v9.8 s'en serve y est refusée.
- Le script d'import `scripts/twin9/import-protocole.mjs` s'exécute dès son
  chargement et n'exporte aucune fonction : il est testé en sous-processus,
  copié dans un miroir temporaire (sans `.env.deploy` : le fichier du poste
  n'est jamais lu), sur un faux `TWIN_V9_DIR` et contre un faux serveur local
  (UC-PRO-08-F19 à F22) ; la route qu'il appelle l'est par ailleurs
  (UC-PRO-08-F10, F14, F16).
- Le garde-fou de publication (RG8) ne reconnaît les gabarits Twin9 qu'à leur
  **répertoire** : un gabarit versionné sous un autre chemin (par exemple
  `protocole/lourd/20-greffier.md`) n'est pas relevé, faute d'empreinte de
  contenu (UC-PRO-08-F17). Ses règles de contenu ignorent toute ligne portant
  un marqueur de valeur factice (« test », « jamais », « example », « ... »
  (trois points ASCII), `<…>`, `_dev`, `dev_`/`dev-`, `= dev`…) : une vraie clé
  commentée « jamais en production » passe (UC-PRO-08-F17).
- Le hook pre-commit n'est actif qu'après `git config core.hooksPath .githooks`
  (une fois par clone). Il relève les **chemins** de l'index mais lit le
  **contenu** sur le disque : un secret ajouté à l'index puis effacé de la copie
  de travail n'est pas relevé et partirait avec le commit (UC-PRO-08-F18) ; le
  job CI, qui analyse la copie extraite du commit, le relèverait à un push sur
  `main` ou dans une pull request (pas sur un push d'une autre branche sans
  pull request).
