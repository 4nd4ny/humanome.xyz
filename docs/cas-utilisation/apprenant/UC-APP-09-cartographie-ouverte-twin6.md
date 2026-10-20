# UC-APP-09 — Lancer une cartographie ouverte (Twin6)

| Champ | Valeur |
|---|---|
| **Acteur principal** | Apprenant (tout compte connecté) |
| **Acteurs secondaires** | Fournisseur LLM (Anthropic) ; plateforme (clé plateforme et crédit prépayé, UC-APP-11) ; administrateur (tarifs et contribution, UC-ADM-05) |
| **Portée** | humanome.xyz — vue `#/twin6-ouverte`, moteur navigateur `engine/src/twin6/`, proxy facturé `POST /api/twin6/appel` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.2 (déclencher une cartographie), §4.3 (module cartographie), §5 (clé API personnelle), §6.1-6.2 (RGPD), §7 (modèle économique) ; ADR-001, ADR-004, ADR-010 §3 |
| **Statut** | Implémenté (cartographie ouverte Twin6, contribution +10 %) |

## Objectif

Permettre à un apprenant d'obtenir une cartographie de ses compétences avec le
protocole **ouvert** Twin6 — un scan par pôle du référentiel choisi (RESPIRE par
défaut, ou tout référentiel publié) puis une synthèse « kairos », sur le
portfolio **entier** — et de la voir dans le même sunburst
évolutif que toute cartographie. Le protocole est **open source** : ses prompts
sont publics et téléchargeables. L'usage du modèle est payé soit par la **clé
API personnelle** de l'apprenant (gratuit pour la plateforme), soit par son
**crédit prépayé** (coût réel des tokens + 10 % de contribution).

## Déclencheur

L'apprenant ouvre `#/twin6-ouverte`, colle son portfolio et clique sur
« Lancer la cartographie ouverte ».

## Préconditions

- L'apprenant a un compte actif et une session (UC-CPT-01, UC-CPT-02).
- Le paquet public `data/twin6/twin6-ouverte-1.1.0.json` est servi par le site
  (scanPole, kairos, fiches P1..P7). Ce fichier n'est **pas versionné**
  (`web/public/data/` est ignoré par git) : il est **construit** avant chaque
  build du front (`prebuild` de `web/package.json`) — `scripts/generate-fiches.mjs`
  régénère les fiches `P1.md`..`P7.md` de `web/public/data/twin6/prompts/` depuis
  le corpus versionné `scripts/data/fiches-v7.json`, puis
  `scripts/build-twin6-package.mjs` assemble ces fiches avec les gabarits
  `1-scan-pole.md`, `2-kairos-final.md` et `0-mega-prompt.md`, versionnés dans
  `scripts/data/twin6/` (modèle cible par défaut `claude-sonnet-5`), en deux
  versions : 1.0.0, le paquet déployé à l'octet, et 1.1.0, dont les gabarits
  lisent le référentiel (RG10). Le même corpus alimente les paquets **publiés**
  et forkables `twin6-ouverte` 1.0.0 et 1.1.0 de l'atelier promptologue
  (`scripts/build-twin6-prompt-package.mjs`, régénéré par
  `scripts/deploy/stage-api.sh` dans `build/prompt-packages/`, marqués réservés),
  aux textes identiques octet pour octet. Ces constructions sont techniques,
  hors parcours de l'apprenant : elles relèvent de UC-SYS-04
  (`docs/cas-utilisation/systeme/UC-SYS-04-construire-artefacts-derives.md`).
- Un référentiel publié, RESPIRE par défaut, lisible dans l'export statique
  `data/referentiel/` (index et une version par fichier, UC-VIS-02) ; sans
  index (copie hors ligne), le RESPIRE embarqué. Pour RESPIRE, la structure
  servie par `GET /api/twin9/meta` (importée, UC-PRO-08 A4 : noms de pôle
  accentués) est celle des documents Twin6 tant qu'elle compte exactement les
  pôles et les compétences de la version choisie (RG9).
- Voie crédits : la clé plateforme `ANTHROPIC_API_KEY` est configurée et le
  solde prépayé couvre le run (UC-APP-11). Voie clé perso : l'apprenant saisit
  une clé Anthropic ou en a enregistré une dans son profil (UC-CPT-04).

## Garanties en cas de succès

- Un document `cartographie-merge` est produit **dans le navigateur** et rendu
  par `MergeView` (sunburst, feuilles de portfolio) ; il est exportable en JSON.
- Voie crédits : le solde est débité du **coût réel** de chacun des appels
  (un par pôle du référentiel, plus le kairos : 8 pour RESPIRE v7), à la
  contribution Twin6 (×1,10), et rien d'autre.
- Voie clé perso : aucun appel ne passe par l'API humanome, rien n'est débité.

## Garanties minimales (en cas d'échec)

- Aucun document partiel n'est affiché ; le formulaire reste disponible.
- Un appel **refusé** (401, 403, 413, 422, 402) n'atteint pas l'amont et
  n'est pas facturé ; un appel dont l'**amont échoue** (E11) est intégralement
  remboursé (réserve rendue).
- En revanche, un appel **abouti** côté serveur est facturé au coût réel, même
  si le moteur échoue ensuite sur sa sortie : l'appel tronqué de E5, et tous les
  appels déjà aboutis d'un run qui s'arrête en cours (E4, E5, RG6, E11, JSON
  illisible), restent débités. Aucun document partiel n'est produit et il n'y a
  **pas de reprise** : relancer refacture tous les appels.
- Ni le portfolio, ni les prompts, ni les sorties ne sont conservés côté
  serveur : le grand-livre ne porte que des compteurs.

## Scénario nominal (voie crédits)

1. L'apprenant ouvre `#/twin6-ouverte`. La vue vérifie la session
   (`GET /api/auth/me`, qui sème aussi le jeton CSRF).
2. La vue charge en parallèle le paquet PUBLIC (`GET data/twin6/twin6-ouverte-1.1.0.json`,
   contrôlé : scanPole, kairos, fiches) et l'offre (`GET /api/twin9/meta` :
   prix Twin6 déjà margés `modeles_twin6`, référentiel, solde) ; en parallèle
   encore (effets séparés), elle lit la liste des clés enregistrées
   (`GET /api/keys`), dont l'échec est ignoré silencieusement, et le référentiel
   choisi — RESPIRE, sa dernière version publiée, par défaut
   (`GET data/referentiel/index.json` puis son fichier ; RESPIRE embarqué à
   défaut). Le choix « Référentiel » liste les référentiels publiés, chacun à sa
   dernière version, RESPIRE en tête (aucun choix sans index). Le modèle cible
   par défaut du paquet est présélectionné ; le décompte des appels s'affiche
   (« 8 appels au modèle (7 pôles + synthèse) » pour RESPIRE v7) ; un lien
   « Télécharger les prompts » (AGPL) est affiché.
3. L'apprenant colle son portfolio (feuilles `### AAAA-MM-JJ`, plus de 40
   caractères), choisit le modèle, garde RESPIRE (ou choisit un autre
   référentiel, A4) et garde la voie « Avec nos crédits ».
4. Au clic, la vue vérifie que le solde couvre le **poids** du portfolio
   (RG5), puis lance le moteur `executerTwin6` avec un provider « crédits »,
   le référentiel du run (RG9) et une fiche par pôle (RG6).
5. Le moteur enchaîne **un appel scan-pole par pôle** du référentiel (pôles
   triés par numéro, 1→7 pour RESPIRE v7 : gabarit public où `${POLE}` devient
   le numéro et dont les variables du référentiel sont rendues, RG10, fiche du
   pôle et portfolio attachés) puis **1 appel kairos** (les
   `carto_pole` de tous les pôles + le portfolio). Chaque appel est un
   `POST /api/twin6/appel {model, prompt, system, max_tokens}` avec le jeton CSRF ;
   la progression « étape n/N » (N = pôles + 1, 8 pour RESPIRE v7) et la
   contribution cumulée (« … débités jusqu'ici ») s'affichent. Une sortie
   tronquée est détectée **ici**, dès le premier appel concerné (E5).
6. Pour chaque appel, le serveur : vérifie le jeton CSRF de la session (403,
   E12), exige la session (401), la clé plateforme
   (503), borne le corps à 2 Mo (413), valide modèle, prompt et `max_tokens`
   (422), **réserve** atomiquement le
   pire-cas au tarif Twin6 (402 sinon), appelle Anthropic sur l'URL verrouillée,
   **réconcilie** la réserve au coût réel et renvoie
   `{text, usage, model, stopReason, cout_microusd}` (aucun rendu, aucun filtre :
   le prompt est public).
7. Le moteur extrait le JSON de chaque sortie, puis `twin6ToMergeDocument`
   décompose chaque `carto_pole` en instantanés **par feuille** (date des
   passages) et réutilise le pipeline de merge : niveaux, ipsatif, narratifs
   (rapport de pôle, kairos, histoire synthétisée) sans appel supplémentaire.
   Le document suit le référentiel du run (ses pôles, ses compétences) et le
   nomme (`referentiel`) s'il n'est pas RESPIRE (T17).
8. La vue affiche « Cartographie ouverte terminée — X $ de contribution », le
   bouton « Exporter le JSON » et le sunburst ; « Compétences établies » se
   compte sur les compétences du référentiel du run (« X / 61 » pour RESPIRE v7).

## Scénarios alternatifs

- **A1 — Voie clé perso, clé saisie** (étapes 3-6) : l'apprenant choisit « Avec
  ma propre clé API » et saisit sa clé (le bouton reste désactivé sans clé). Le
  provider est **direct** : chaque appel part du navigateur vers
  `https://api.anthropic.com/v1/messages` avec la clé en en-tête ; aucun appel à
  `/api/twin6/appel`, aucun débit, aucun garde-fou de solde (RG5) ; le message
  final indique « (avec votre clé) ». Contrairement à la voie crédits, le
  transport direct **réessaie automatiquement** (3 tentatives au plus sur 429,
  5xx ou erreur réseau, `Retry-After` honoré).
- **A2 — Clé enregistrée au profil** (étape 3) : si `GET /api/keys` liste une clé
  `anthropic`, l'option « Utiliser ma clé Anthropic enregistrée » est cochée par
  défaut ; au lancement la clé est révélée une fois (`GET /api/keys/anthropic`,
  propriétaire seul) puis utilisée comme en A1, sans ressaisie.
- **A3 — Plafond de sortie hors bornes** (étape 6) : `max_tokens` (ou l'alias
  `maxTokens`) est ramené dans [256, 16 000] ; un arrêt `max_tokens` est relayé
  tel quel (`stopReason`) pour que le moteur échoue explicitement (E5).
- **A4 — Autre référentiel publié** (étapes 2-3, 2026-10-20) : l'apprenant
  choisit un autre référentiel dans « Référentiel » ; la vue charge sa dernière
  version et le décompte suit ses pôles (« 6 appels au modèle (5 pôles +
  synthèse) » pour cinq pôles). Le run lit son document : un scan par pôle, la
  fiche de chaque pôle écrite depuis le document (celles du paquet décrivent
  RESPIRE v7, RG6) ; le document produit le nomme et « Compétences établies »
  se compte sur ses compétences.
- **A5 — Version de RESPIRE d'une autre structure** (étapes 2-5) : la dernière
  version publiée de RESPIRE (ou celle choisie) n'a plus exactement les pôles
  et les compétences de `/api/twin9/meta` (six pôles, une compétence déplacée,
  UC-EPI-04) : le run lit le document de cette version (noms de pôle sans
  accent du document publié), un scan par pôle ; les fiches du paquet servent
  les pôles qu'elles décrivent encore à l'identique, les autres s'écrivent
  depuis le document. Le document reste un document de RESPIRE (sans
  `referentiel`).

## Scénarios d'erreur

- **E1 — Visiteur sans session, ou erreur serveur sur `/auth/me`** (étape 1) :
  la vue invite à se connecter (« Connectez-vous ») ; ni paquet ni offre ne sont
  chargés. Toute erreur non-401 de `GET /api/auth/me` (500, 503…) produit le même
  écran, y compris pour un utilisateur connecté.
- **E2 — Copie statique sans API** (étape 1) : « Cette fonctionnalité nécessite le
  serveur (indisponible sur cette copie statique) ».
- **E3 — Solde trop bas pour le poids du portfolio** (étape 4, voie crédits) :
  alerte « Solde insuffisant pour ce portfolio (~N $ estimés, solde S $).
  Rechargez votre crédit ou utilisez votre propre clé API. » — aucun appel.
- **E4 — Réserve non couverte** (étape 6) : `402 {error: "Solde insuffisant",
  solde_microusd, requis_estime_microusd}` ; l'amont n'est pas appelé ; la vue
  arrête le run et affiche le message ; le bouton redevient cliquable. Les
  appels déjà aboutis du run restent facturés.
- **E5 — Sortie tronquée** (étape 5, dès le premier appel tronqué) :
  `stopReason = max_tokens` → le moteur lève « sortie tronquée (max_tokens) à
  l'étape … » ; aucun document partiel. L'appel tronqué est un `200` côté
  serveur : il est facturé au coût réel, comme les appels aboutis avant lui.
- **E6 — Paquet public introuvable ou invalide, offre illisible** (étape 2) :
  « Paquet Twin6 introuvable (404) » ou « Paquet Twin6 invalide
  (scanPole/kairos/fiches attendus) » ; idem si l'offre `/api/twin9/meta` ne
  peut être lue (message du serveur) ; le formulaire n'est pas proposé.
- **E7 — Appel sans session** (étape 6) : `401 {error: "Authentification requise"}`.
- **E8 — Clé plateforme non configurée** (étape 6) : `503 Service indisponible`.
- **E9 — Requête invalide** (étape 6) : corps non JSON ou JSON scalaire →
  `400` ; corps > 2 Mo → `413` ; modèle hors offre (« Modèle non proposé »),
  prompt vide ou `max_tokens` non entier → `422` ; une liste JSON ou un corps
  vide sont traités comme un objet sans champ → `422` (modèle absent) ; rien
  n'est débité.
- ~~**E10 — Rythme dépassé**~~ : retiré le 2026-10-20 avec le réglage
  `appels_par_minute`, qui ne bornait plus que la cartographie ouverte depuis
  T11, à la demande de Christian ; la dépense reste bornée par le solde prépayé
  (RG3), le débit d'un compte ne l'est plus (voir Limites).
- **E11 — Échec du fournisseur** (étape 6) : erreur amont → `502` (ou `504` sur
  délai, `429` si saturé) au message **générique** ; la réserve est rendue
  (événement « twin6/cartographie (remboursement échec) »).
- **E12 — Jeton CSRF absent ou invalide** (étape 6) : avec un cookie de session
  mais sans `X-CSRF-Token` valide → `403 {error: "Jeton CSRF absent ou
  invalide"}` (`CsrfMiddleware`, avant la route) ; rien n'est appelé ni débité.
- **E13 — Référentiel choisi illisible** (étapes 2-3, A4) : sa version ne se
  charge pas (« Le référentiel « id » version n'a pas pu être chargé ») : alerte,
  le bouton reste désactivé ; RESPIRE retombe sur le RESPIRE embarqué.

## Règles de gestion

- **RG1** — Twin6 est **open source** (AGPL) : prompts publics, aucun gabarit
  rendu côté serveur, aucune fiche confidentielle injectée, **aucun filtre
  anti-fuite** (contrairement à Twin9, UC-APP-10).
- **RG2** — Contribution Twin6 = `marge_twin6` (×1,10 par défaut, 1 à 5,
  réglable par l'administrateur), distincte de Twin9 (×1,20). Coût réel d'un
  appel en µUSD = ⌈tokens_in × prix_in × marge⌉ + ⌈tokens_out × prix_out × marge⌉
  (jamais arrondi en faveur de l'apprenant, au plus 2 µUSD au-dessus du montant
  exact).
- **RG3** — Réserve pire-cas **atomique** avant l'appel : entrée = octets du
  prompt (+ système), sortie = `max_tokens` ; débit conditionnel sans découvert
  (402 sinon) ; réconciliation au coût réel après l'appel ; remboursement
  intégral si l'appel échoue.
- **RG4** — Bornes serveur : corps ≤ 2 Mo ; `max_tokens` (ou `maxTokens`)
  entier ramené dans [256, 16 000] (8 192 si les deux sont absents) ; modèle ∈
  offre ; prompt non vide.
- **RG5** — Garde-fou client avant un run sur crédits : solde ≥ max(1,
  ⌈octets du portfolio / 1 024⌉) USD (heuristique « ~1 ko = 1 $ ») ; aucune garde
  sur la voie clé perso.
- **RG6** — Un run = un appel scan-pole par pôle du référentiel du run (pôles
  triés par numéro) + 1 kairos — 8 pour RESPIRE v7 (`twin6CallsFor`). La fiche
  d'un pôle est celle du paquet public quand ses titres « ## CODE — »
  nomment exactement les compétences du pôle (RESPIRE v7 : P1..P7 à
  l'identique), sinon écrite depuis le document du référentiel — « # Pôle N —
  nom », sa description, puis chaque compétence (`fichesPourTwin6`). Le moteur,
  lui, arrête le run avant l'appel d'un pôle sans fiche (UC-APP-09-U06) ; la
  vue lui en donne toujours une.
- **RG7** — Twin6 ne dépend ni de l'import de Twin9 ni de la promotion
  « Twin9 gratuit » (UC-ADM-05). (L'interrupteur `enabled` qu'écrivait l'import
  est parti le 2026-10-20.)
- **RG8** — Projection : une compétence n'est « présente » sur une feuille que si
  une de ses traces retenues renvoie à un passage de cette feuille ; le verdict
  d'une feuille n'est jamais promu au-dessus du verdict global.
- **RG9** — Référentiel du run (2026-10-20, `referentielTwin6`) : le document
  publié choisi ; pour RESPIRE, la structure de `/api/twin9/meta` (noms de pôle
  accentués de l'import, ceux des documents Twin6 d'avant) tant qu'elle a
  exactement les pôles et les compétences de la version choisie. Un document
  d'un autre référentiel le nomme (`referentiel`), un document de RESPIRE non
  (T17) ; la version n'est pas dans le document.
- **RG10** — Gabarits du paquet servi (1.1.0, 2026-10-20) : ce qu'écrit en
  toutes lettres la 1.0.0 de RESPIRE v7 — « un des 7 pôles du référentiel
  RESPIRE », « les 61 verdicts », la forme `X.YY`, quatre codes d'exemple — y
  est une variable (`${REFERENTIEL}`, `${NB_POLES}`, `${NB_COMPETENCES}`,
  `${FORMAT_CODE}`, `${PRECISION_FORMAT_CODE}`, `${CODES_EXEMPLE}`) que
  `executerTwin6` rend depuis le référentiel du run avant tout appel
  (`variablesTwin6`). Pour RESPIRE v7, les prompts sont ceux de 1.0.0 à
  l'octet (UC-APP-09-U33).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Texte du portfolio | Voie crédits : transite par le serveur et Anthropic le temps de l'appel, **jamais stocké** ; voie clé perso : ne passe que du navigateur au fournisseur |
| Clé API personnelle | Saisie : reste dans le navigateur ; enregistrée : coffre chiffré (ADR-004), révélée au seul propriétaire |
| Prompts | Publics (paquet AGPL téléchargeable) |
| Grand-livre | `twin9_credit_events` : montants, modèle, tokens, libellé d'étape — jamais de contenu |
| Document produit | Reste dans le navigateur (export JSON à la demande) |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash` | Route `#/twin6-ouverte` |
| Front | `web/src/views/Twin6OuverteView.jsx` | Garde de session, formulaire, voies de paiement, garde-fou de solde, progression, résultat |
| Front | `web/src/api/twin6.js` — `loadTwin6Package`, `makeCreditsProvider`, `makeOwnKeyProvider`, `fetchTwin6Offer` | Paquet public, provider proxy facturé, provider direct, offre |
| Front | `web/src/api/twin6.js` — `referentielTwin6` | Référentiel du run (RG9) — unitaire : UC-APP-09-U32 |
| Front | `web/src/components/ReferentielChoice.jsx`, `web/src/data/referentiel.js` — `listPublishedReferentiels`, `loadPublishedReferentiel` | Choix et chargement du référentiel publié (étape 2, A4, E13) |
| Front | `web/src/api/twin9.js` — `referentielPourMoteur`, `formatUsd` | Adaptation du référentiel de `/meta`, montants |
| Front | `web/src/api/keys.js` — `listKeys`, `revealKey` | Clé enregistrée au profil |
| Front | `web/src/api/client.js` — `fetchMe`, `apiFetch`, `ApiError`, `ApiUnavailableError` | Session et amorçage du jeton CSRF (étape 1), jeton sur chaque mutation, erreurs typées (E1, E2, E4) — unitaires : UC-APP-09-U15, U16 ; copie statique : UC-CPT-02-U12 |
| Build | `scripts/build-twin6-package.mjs` (après `scripts/generate-fiches.mjs`, `prebuild` du front) | Construit le paquet public servi à l'étape 2 (précondition) — relève de UC-SYS-04 : rejoué en sous-processus dans un miroir temporaire par UC-SYS-04-F11 (fiches absentes, puis entrées versionnées seules) et F12 (1.0.0 et 1.1.0, dérive d'un gabarit) |
| Build | `scripts/build-twin6-prompt-package.mjs` — `buildTwin6PromptPackageDoc` | Paquet publié forkable `twin6-ouverte` (même corpus) — relève de UC-SYS-04 : rejoué en sous-processus dans un miroir temporaire par UC-SYS-04-F11 et F12 ; test historique `web/src/views/promptologue/twin6-prompt-package.test.js` |
| Front | `web/src/views/MergeView.jsx`, `web/src/components/StatBadges.jsx`, `web/src/lib/download-json.js` | Rendu sunburst commun, total « Compétences établies » du référentiel du run, export JSON (étape 8) — composants partagés (unitaires relevant de UC-APP-03 et UC-APP-12), rendus ici fonctionnellement (UC-APP-09-F01, F21, F22) |
| Moteur | `engine/src/twin6/index.js` — `buildScanPolePrompt`, `buildKairosPrompt`, `extractJson`, `executerTwin6`, `TWIN6_CALLS`, `twin6CallsFor` | Orchestration : un scan par pôle + le kairos |
| Moteur | `engine/src/twin6/fiches.js` — `fichesPourTwin6`, `fichesDuReferentiel` | La fiche de chaque pôle (RG6) |
| Moteur | `engine/src/twin6/variables.js` — `variablesTwin6`, `rendreGabaritTwin6` | Les variables du référentiel dans les gabarits (RG10) |
| Build | `scripts/twin6-gabarits.mjs` — `gabaritsTwin6` | Gabarits versionnés : 1.0.0 tels quels, 1.1.0 par remplacements vérifiés (RG10) — relève de UC-SYS-04 |
| Moteur | `engine/src/twin6/mapper.js` — `twin6ToMergeDocument` | Projection vers `cartographie-merge` |
| Moteur | `engine/src/providers/index.js` — `createProvider` (direct) | Voie clé perso |
| API | `POST /api/twin6/appel` — `api/src/routes/twin9.php` | Proxy facturé (voie crédits) |
| API | `api/src/Middleware/CsrfMiddleware.php` | Jeton CSRF des mutations (E12) — logique unitaire couverte par UC-CPT-02-U07 |
| API | `GET /api/keys/anthropic` — `api/src/routes/keys.php`, `api/src/Keys/KeyVault.php` | Révélation de la clé enregistrée (A2) — garde propriétaire et chiffrement couverts par UC-CPT-04 |
| API | `GET /api/twin9/meta` — `api/src/routes/twin9.php` | Offre (prix Twin6, référentiel, solde) |
| Domaine | `api/src/Twin9/Twin9Config.php` — `coutMicrousd`, `reserveMicrousd`, `publicView`, `marge`, `modeles` | Tarification Twin6, bornes |
| Domaine | `api/src/Twin9/CreditService.php` — `debit`, `adjust` ; `SoldeInsuffisantException` | Réserve, réconciliation, remboursement |
| Domaine | `api/src/Twin9/AnthropicCaller.php` | Appel amont verrouillé, erreurs génériques |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-APP-09-U01 | `buildScanPolePrompt` | Toutes les occurrences de `${POLE}` remplacées ; fiche puis portfolio attachés | `engine/test/usecases/unit/uc-app-09-cartographie-ouverte-twin6.test.js` |
| UC-APP-09-U02 | `buildKairosPrompt` | Blocs `carto_P<n>` JSON dans l'ordre reçu, portfolio original | idem |
| UC-APP-09-U03 | `extractJson` | Bloc ```json prioritaire, préambule toléré, erreurs explicites | idem |
| UC-APP-09-U04 | `executerTwin6` | Entrées invalides refusées avant tout appel | idem |
| UC-APP-09-U05 | `executerTwin6` | 8 appels, pôles triés, `poleNum` complété, progression, usage, document valide | idem |
| UC-APP-09-U06 | `executerTwin6` | Fiche manquante → arrêt avant l'appel du pôle (RG6) | idem |
| UC-APP-09-U07 | `executerTwin6` | `stopReason max_tokens` → échec nommant l'étape (E5) | idem |
| UC-APP-09-U08 | `twin6ToMergeDocument` | Feuilles par date, renvoi jamais promu, narratifs rattachés ; un pôle sur deux feuilles : chaque compétence n'est présente que là où ses traces renvoient (RG8) | idem |
| UC-APP-09-U09 | `twin6ToMergeDocument` | **Anomalie figée** : pôle sans présence → domaine vide non conforme au schéma | idem |
| UC-APP-09-U10 | `twin6ToMergeDocument` | Entrées vides refusées | idem |
| UC-APP-09-U11 | `createProvider` direct (A1) | Appel direct à api.anthropic.com ; **anomalie figée** : `stopReason` non relayé | idem |
| UC-APP-09-U12 | `executerTwin6` | **Limite figée** : référentiel vide → 1 appel kairos puis échec | idem |
| UC-APP-09-U31 | `executerTwin6`, `twin6CallsFor`, `fichesPourTwin6`, `twin6ToMergeDocument` | Tout référentiel : cinq pôles lettrés → 6 appels, fiches écrites depuis le document, document qui le nomme et lui est conforme ; RESPIRE à six pôles → 7 appels, document de RESPIRE conforme à sa version (A4, A5, RG6, RG9) | idem |
| UC-APP-09-U33 | `executerTwin6`, `gabaritsTwin6`, `variablesTwin6` | Paquet servi (1.1.0) : pour RESPIRE v7, les huit prompts de 1.0.0 à l'octet ; pour cinq pôles lettrés, son nom, ses pôles, ses compétences et la forme de ses codes, sans variable restante (RG10) | idem |
| UC-APP-09-U13 | `parseHash` | `#/twin6-ouverte` → vue `twin6ouverte` | `web/test/usecases/unit/uc-app-09-cartographie-ouverte-twin6.test.jsx` |
| UC-APP-09-U14 | `loadTwin6Package` | URL publique, modèle par défaut, HTTP en échec ou paquet incomplet → message (E6) | idem |
| UC-APP-09-U15 | `makeCreditsProvider` | Corps, jeton CSRF de session, contrat moteur, contribution remontée | idem |
| UC-APP-09-U16 | `makeCreditsProvider` | Replis sûrs ; 402 → `ApiError`, aucune contribution | idem |
| UC-APP-09-U17 | `makeOwnKeyProvider` | Transport direct, jamais `/api`, clé exigée | idem |
| UC-APP-09-U18 | `fetchTwin6Offer` | Prix Twin6, promo, référentiel, solde, replis | idem |
| UC-APP-09-U19 | `referentielPourMoteur` | Pôles et compétences aplaties | idem |
| UC-APP-09-U20 | `formatUsd` | µUSD → « x,yy $ », 4 décimales sous le centime | idem |
| UC-APP-09-U32 | `referentielTwin6` | RESPIRE : la structure de `/meta` tant qu'elle est celle de la version (ordre indifférent) ; compétence déplacée, pôle en moins, `/meta` vide, autre référentiel → le document (RG9) | idem |
| UC-APP-09-U28 | `listKeys`, `revealKey` | Liste sans la clé, révélation `GET api/keys/anthropic` (A2) ; la garde propriétaire relève de UC-CPT-04 | idem |
| UC-APP-09-U29 | `Twin6OuverteView` (isolée) | Garde-fou : ⌈octets / 1024⌉ $ comparé au solde avant tout provider (RG5, E3) | idem |
| UC-APP-09-U21 | `Twin9Config::coutMicrousd` | Coût Twin6 ×1,10 arrondi au-dessus, < Twin9 ×1,20 (RG2) | `api/tests/UseCases/Unit/UcApp09CartographieOuverteTwin6Test.php` |
| UC-APP-09-U22 | `Twin9Config::reserveMicrousd` | Réserve ≥ tout coût réel possible (RG3) | idem |
| UC-APP-09-U23 | `Twin9Config::publicView` | Prix Twin6 margés exposés, marges jamais | idem |
| UC-APP-09-U24 | `CreditService::debit`, `adjust` | Réserve + réconciliation = coût réel ; remboursement d'échec | idem |
| UC-APP-09-U25 | `CreditService::debit`, `SoldeInsuffisantException` | Aucun découvert, montants portés par l'exception | idem |
| UC-APP-09-U26 | `AnthropicCaller::appeler` | URL verrouillée, système transmis, réflexion désactivée, usage réel | idem |
| UC-APP-09-U27 | `AnthropicCaller::appeler` | Erreurs amont → 504/502/429 génériques | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-APP-09-F01 | Nominal | IHM | `<App/>` : RESPIRE par défaut, « 8 appels au modèle (7 pôles + synthèse) » ; progression « étape 1/8 » et contribution cumulée pendant le run ; 8 appels via `/api/twin6/appel` avec CSRF, la fiche du paquet telle quelle, contribution finale, secteurs du sunburst, export JSON (`cartographie-merge` sans `referentiel`, noms de pôle de `/meta`, `.json`, aucun envoi réseau) ; « Compétences établies » sur les compétences du référentiel du run (anomalie 3 corrigée) ; portfolio envoyé nulle part ailleurs | `web/test/usecases/functional/uc-app-09-cartographie-ouverte-twin6.test.jsx` |
| UC-APP-09-F02 | A1, RG5 | IHM | Clé saisie, solde nul : 8 appels directs au fournisseur, aucun passage par l'API, aucun garde-fou de solde | idem |
| UC-APP-09-F03 | A2 | IHM | Clé du profil révélée une fois, 8 appels directs avec elle, aucun appel à `/api/twin6/appel` (voie crédits câblée en échec), « (avec votre clé) » | idem |
| UC-APP-09-F04 | E1 | IHM | Anonyme : invitation à se connecter, rien chargé | idem |
| UC-APP-09-F05 | E2 | IHM | Copie statique : fonctionnalité indisponible | idem |
| UC-APP-09-F06 | E3 | IHM | Solde < poids du portfolio : blocage avant tout appel | idem |
| UC-APP-09-F07 | E4 | IHM | 402 en cours de run : arrêt, message, bouton réutilisable | idem |
| UC-APP-09-F08 | E5 | IHM | Sortie tronquée : échec explicite, pas d'export | idem |
| UC-APP-09-F09 | E6 | IHM | Paquet public introuvable, ou offre `/meta` en erreur : erreur de chargement, formulaire absent | idem |
| UC-APP-09-F21 | A4 | IHM | Autre référentiel publié choisi : décompte « 6 appels (5 pôles + synthèse) », 6 appels, fiches écrites depuis son document, export qui le nomme, total de ses compétences | idem |
| UC-APP-09-F22 | A5 | IHM | Dernière version de RESPIRE à six pôles : 7 appels, document de RESPIRE aux pôles de cette version (noms du document publié), total de ses compétences | idem |
| UC-APP-09-F10 | Nominal | API | 8 appels : contrat, `text` amont intact et `model`, coût 6 602 µUSD chacun, prompt public transmis tel quel, grand-livre réserve/réconciliation | `api/tests/UseCases/Functional/UcApp09CartographieOuverteTwin6Test.php` |
| UC-APP-09-F11 | Nominal (étape 2), RG7 | API | `/api/twin9/meta` : prix Twin6, référentiel, solde ; Twin6 fonctionne sans Twin9 importé | idem |
| UC-APP-09-F12 | E7 | API | 401 sans session, aucun appel amont | idem |
| UC-APP-09-F13 | E8 | API | 503 sans clé plateforme, rien débité | idem |
| UC-APP-09-F14 | E9 | API | 422 / 413 / 400 (JSON scalaire ou illisible) ; liste JSON ou corps vide → 422 ; avant tout débit | idem |
| UC-APP-09-F15 | E4 | API | 402 avec montants (réserve exacte), solde intact | idem |
| UC-APP-09-F17 | E11 | API | 502 / 504 génériques, réserves rendues | idem |
| UC-APP-09-F18 | A3, E5 | API | `max_tokens` borné (alias accepté, 8 192 par défaut), `stopReason max_tokens` relayé ; l'appel tronqué est facturé au coût réel (solde = recharge − somme des coûts) | idem |
| UC-APP-09-F19 | RGPD | API | Sortie relayée non filtrée à l'apprenant ; grand-livre et audit sans prompt ni sortie | idem |
| UC-APP-09-F20 | E12 | API | Session sans jeton CSRF ou avec un jeton faux → 403, amont non appelé, solde intact | idem |

### Tests existants liés (non-régression)

- `api/tests/Twin6AppelTest.php` — session, 503, validation, 402, facturation à +10 %.
- `web/src/views/Twin6OuverteView.test.jsx` — vue isolée (voies, clé du profil, garde-fou, export).
- `web/src/api/twin6.test.js` — client du paquet, providers, offre.
- `engine/src/twin6/index.test.js`, `engine/src/twin6/mapper.test.js` — moteur et projection, sur RESPIRE et
  sur d'autres structures (cinq pôles lettrés, RESPIRE à six pôles).
- `engine/src/twin6/fiches.test.js` — la fiche de chaque pôle pour tout référentiel (RG6).
- `web/src/components/StatBadges.test.jsx`, `web/src/views/MergeView.test.jsx` — total des compétences établies lu
  dans le référentiel, jamais 61 supposé.
- `engine/src/providers/index.test.js` — transport direct Anthropic.
- `api/tests/PackagesTwin6Test.php`, `web/src/views/promptologue/twin6-prompt-package.test.js` — paquet Twin6 côté atelier promptologue.

### Exécuter

```sh
(cd api && vendor/bin/phpunit --filter UcApp09 --testdox)
cd web && npx vitest run test/usecases/unit/uc-app-09 test/usecases/functional/uc-app-09
cd engine && npx vitest run test/usecases/unit/uc-app-09
```

## Anomalies constatées

1. **Voie clé perso : troncature non détectée explicitement.** Le provider direct
   Anthropic (`engine/src/providers/anthropic.js`, `parseResponse`) ne relaie pas
   `stop_reason` ; la garde « sortie tronquée (max_tokens) » d'`executerTwin6` ne
   se déclenche donc que sur la voie crédits. Sur la voie clé perso, une sortie
   tronquée échoue plus loin, au parsing JSON, avec un message moins explicite
   (figé par UC-APP-09-U11).
2. **Pôle sans aucune présence établie → document non conforme au schéma.**
   `twin6ToMergeDocument` émet alors un domaine sans compétence, ce que le schéma
   `cartographie-merge` refuse (`domains[].competences` : `minItems 1`). Le viewer
   le tolère, mais le JSON exporté ne se revalide pas : le rechargement d'un fichier
   utilisateur (`web/src/data/load.js`, validation ajv) le refuse. Le test
   historique du mapper Twin6 qualifie ces domaines vides de « légitimes » sans
   en produire aucun (figé par UC-APP-09-U09).
3. ~~**Dénominateur « Compétences établies » figé à 61.**~~ Corrigée le
   2026-10-20 : `Twin6OuverteView` passe à `MergeView` le référentiel du run
   (`{poles, competences}`), et `MergeView` / `StatBadges` ne supposent plus 61 —
   sans référentiel, le compte s'affiche seul. Avec le référentiel fictif à 7
   compétences, l'écran affiche « X / 7 » (UC-APP-09-F01).

## Limites

- Un run n'est pas reprenable : une interruption (402, sortie tronquée, fiche
  manquante, échec amont, JSON illisible) laisse facturés les appels déjà
  aboutis, et une relance refacture tous les appels (UC-APP-09-F07, UC-APP-09-F18).
- Au niveau du moteur, un référentiel sans pôle lance un unique appel kairos
  (facturé sur la voie crédits) puis échoue au mapping (figé par
  UC-APP-09-U12). La vue n'y mène plus : depuis le 2026-10-20, si
  `/api/twin9/meta` n'a jamais été importé, le run lit le document publié de
  RESPIRE (RG9).
- Le méga-prompt du paquet (`0-mega-prompt.md`), un protocole manuel que le
  moteur n'exécute pas, décrit RESPIRE v7 (P1..P7) dans ses deux versions.
- Un pôle du référentiel où le run n'établit aucune présence produit un domaine
  vide, que le schéma refuse (anomalie 2) : plus un référentiel compte de
  pôles, plus le cas est probable.
- La construction du paquet public (précondition) n'est pas testée au titre de
  ce cas mais de UC-SYS-04 : `scripts/build-twin6-package.mjs` (qui écrit
  `web/public/data/twin6/twin6-ouverte-1.0.0.json` et `-1.1.0.json`) et
  `scripts/build-twin6-prompt-package.mjs` y sont rejoués dans un miroir
  temporaire (UC-SYS-04-F11, F12), depuis les gabarits versionnés
  (`scripts/data/twin6/`, depuis le 2026-10-20). Les tests de ce cas utilisent
  un paquet fictif de même forme, sauf UC-APP-09-U33, qui lit les gabarits
  versionnés.
- Aucun rythme ne borne plus les appels d'un compte (E10, retiré le
  2026-10-20) : un compte crédité peut en lancer en parallèle sur la clé de la
  plateforme, chacun occupant un processus PHP jusqu'à la réponse et les quotas
  Anthropic de l'instance, que partagent les runs Twin9 à clé d'instance. Le
  parcours de la vue (un appel après l'autre) n'en approche pas l'ancien seuil
  (30 par minute). Une limite fixe dans le code reste à décider.
- Le garde-fou de solde (RG5) est une heuristique client ; seul le refus 402
  serveur (réserve pire-cas) est opposable. Son message arrondit le solde au
  centime avec un point décimal : un solde de 1,999999 $ s'affiche « solde
  2.00 $ » face à « ~2 $ estimés » (UC-APP-09-U29).
