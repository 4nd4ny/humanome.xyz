# Matrice d'autorisations — rôles → routes API

**Source :** cahier des charges §2 (glossaire des rôles) et §3 (cas d'utilisation par profil).
**Implémentation :** `api/src/Middleware/RequireRole.php` (P3.3) — garde par rôle posée route par route :

```php
$app->post('/referentiel/versions', $handler)
    ->add(RequireRole::any('epistemiarque', 'admin'));
```

## Principes

1. **Le visiteur est l'absence de session** (cahier §2). Il n'existe pas de rôle
   `visiteur` en base : une route « visiteur » est une route sans garde.
2. **401 vs 403** : `401` = pas de session authentifiée (visiteur) ;
   `403` = session valide mais aucun des rôles requis (ou jeton CSRF invalide).
3. **Les rôles sont cumulables** (table `user_roles`, n-n) et relus en base à
   chaque requête : une attribution ou une révocation est effective immédiatement.
4. **`admin` n'est pas un super-rôle implicite** : chaque garde liste
   explicitement les rôles admis (`RequireRole::any(..., 'admin')` quand le
   cahier le justifie).
5. **Le rôle ne suffit pas toujours** : les routes sur des ressources possédées
   (cartographies, clés API, progression) vérifient EN PLUS la propriété
   (`user_id` de la ressource = utilisateur de la session). Le rôle ouvre la
   porte, la propriété délimite la pièce.
6. **CSRF** (P3.3, `api/src/Middleware/CsrfMiddleware.php`) : toute méthode
   mutante (POST/PUT/PATCH/DELETE) sur `/api/**` exige l'en-tête
   `X-CSRF-Token` égal au jeton de session (double-submit, `hash_equals`).
   Exceptions : `/api/admin/migrate` et `/api/admin/import-*` (jeton propre
   `X-Migrate-Token`, ADR-008), `login`/`register` (pas encore de session
   porteuse de jeton ; protégés par rate-limit), et `POST /api/llm` (M6) :
   route visiteur déjà défendue par ses propres gardes (preuve de travail à
   usage unique, honeypot, quotas IP/horaire et budget quotidien — P6) ; un
   utilisateur connecté doit pouvoir l'appeler exactement comme un visiteur,
   sans en-tête CSRF. Exemption sûre : la route ne lit ni n'écrit AUCUN état
   de compte (la session n'y confère rien), donc un tir forgé cross-site n'y
   gagne rien de plus qu'un tir anonyme. Le jeton est délivré par
   `GET /api/auth/me` et à l'ouverture de session (réponses de `login` et
   `register`).
7. **Un rôle déclaré n'ouvre rien** (sprint 8, migration 035). Deux notions
   distinctes :
   - l'**habilitation** est un rôle de la table `user_roles` (les sept du
     cahier §2) : elle seule ouvre des droits — gardes `RequireRole` et
     `RoleGuard`, familles du menu (`web/src/nav.js`), électorat du référentiel
     (`Referentiel\Electorate`), lecture d'un run Twin9 partagé aux
     cartographes (`routes/twin9-runs.php`, `GET /twin9/runs/{id}/resultats`).
     Elle est attribuée par un administrateur seulement
     (`POST /api/admin/users/{id}/roles`), jamais par la personne elle-même ;
   - le **rôle déclaré** est une identité RESPIRE que la personne se donne
     dans `#/compte` (`user_declared_roles`, `Auth\DeclaredRoles`) : neuf
     rôles (cartographe, promptologue, promptagogue, éclaireur, architecte,
     épistémiarque, médiateur, noèsiologue, maître du grimoire) et la case
     « membre du cercle des fondateurs », acceptée par le serveur avec
     promptagogue, épistémiarque ou maître du grimoire seulement. `admin` et
     les autres habilitations ne se déclarent pas (`422`). Aucune garde, aucun
     menu, aucun vote ne lit cette table ; elle est visible de la personne, de
     l'administrateur et dans l'archive de compte.

   L'administrateur voit les déclarations à côté des habilitations et habilite
   d'un clic celle qu'une déclaration appelle (cartographe → `cartographe`,
   promptologue → `promptologue`, épistémiarque → `epistemiarque` ; les autres
   déclarations n'ont pas d'habilitation aujourd'hui). Propriété vérifiée par
   UC-CPT-07-F06 à F08 : un compte qui se déclare cartographe ne lit pas un
   run partagé aux cartographes, même lié ; un compte qui se déclare
   épistémiarque ne vote pas et n'entre pas dans l'électorat ; aucun compte ne
   s'habilite lui-même, `admin` compris.

## Routes actuelles (P0–P3)

| Route | Méthode | Accès | Garde |
|---|---|---|---|
| `/api/health` | GET | Public (visiteur) | — |
| `/api/admin/migrate` | POST | Technique (script de déploiement, ADR-008) | Jeton `MIGRATE_TOKEN` dédié, hors rôles |
| `/api/auth/register` | POST | Visiteur | Rate-limit par IP (10/h) ; rôle `apprenant` attribué par défaut |
| `/api/auth/login` | POST | Visiteur | Rate-limit par IP+email (5 / 15 min, puis 429 à délai progressif) |
| `/api/auth/logout` | POST | Tout utilisateur connecté | Session + CSRF |
| `/api/auth/me` | GET | Tout utilisateur connecté | Session (401 sinon) |
| `/api/auth/account` | DELETE | Tout utilisateur connecté (son propre compte) | Session + CSRF ; purge réelle + audit anonymisé (§6.3) |
| `/api/auth/me/declared-roles` | GET | Tout utilisateur connecté (sa propre déclaration) | Session (401 sinon) ; `{roles, foundingCircle, catalogue}` — rôles RESPIRE déclarés, **aucun droit** (principe 7) |
| `/api/auth/me/declared-roles` | PUT | Tout utilisateur connecté (sa propre déclaration) | Session + CSRF ; `{roles, foundingCircle?}` remplace la déclaration entière ; `422` pour `admin`, une autre habilitation, un rôle hors des neuf, un doublon, ou la case du cercle sans promptagogue, épistémiarque ni maître du grimoire ; n'écrit jamais `user_roles` |

## Routes actuelles (P8 — M6) : espace apprenant

Toutes les routes mutantes passent le CSRF global (sauf exemptions du
principe 6). « Propriétaire » = `user_id` de la ressource = utilisateur de la
session ; un id étranger répond `404` exactement comme un id inexistant
(pas d'oracle d'existence).

| Route | Méthode | Accès | Garde |
|---|---|---|---|
| `/api/cartographies` | POST | `apprenant` | Rôle + CSRF ; **le POST est l'opt-in stockage serveur** (`opt_in_at = NOW()` posé par l'INSERT, §6.2). Type `partage` (version partagée de l'interface ultime, §12) : **403 `adult_required` sans attestation de majorité** (relue sous verrou de la ligne `users`, dans la transaction de l'insertion), visibilité `privee` imposée, titre = celui du document, ni `runMeta` ni versions de paquet/référentiel, document vérifié par liste blanche de champs et de types (`Share\SharedVersion`) |
| `/api/cartographies` | GET | `apprenant` | Rôle ; liste de métadonnées, **jamais** le document |
| `/api/cartographies/{id}` | GET | `apprenant`, propriétaire | Rôle + propriété ; document inclus |
| `/api/cartographies/{id}` | PATCH | `apprenant`, propriétaire | Rôle + propriété + CSRF ; titre/visibilité uniquement (une version partagée est figée : ni titre, ni visibilité autre que `privee`) |
| `/api/cartographies/{id}` | DELETE | `apprenant`, propriétaire | Rôle + propriété + CSRF ; purge réelle (ligne + share_links par FK) |
| `/api/cartographies/{id}/document` | PUT | `apprenant`, propriétaire | Version partagée seulement (422 sinon, 404 si absente ou d'un autre compte) : nouvelle version publiée **à la place** (même lien, ancien document effacé) ; rôle + propriété + CSRF, **403 `adult_required`** sans attestation (relue sous verrou, même transaction que la mise à jour), liste blanche `Share\SharedVersion` ; **retire la garantie** d'une version publiée par un cartographe (le document change d'une autre main, §8) ; audit `shared_version_replaced` (ids seulement, `garantieRemoved` le cas échéant) |
| `/api/cartographies/{id}/share` | POST | `apprenant`, propriétaire | Rôle + propriété + CSRF ; **version partagée seulement** depuis le 2026-10-14 (ancien partage retiré, journal de la cartographie D-43) : tout autre type → **422 `share_retired`**, rien n'est écrit ; **403 `adult_required` sans attestation** (relue sous verrou, même transaction que l'insertion) ; jeton stocké haché (sha256), mot de passe facultatif en `password_hash` (URL `…/ouvert` sans mot de passe ; un mot de passe non textuel est refusé, 422) ; audit `share_created` (ids seulement). Les liens créés avant vers les autres types restent servis, listés et révocables jusqu'à leur expiration |
| `/api/cartographies/{id}/shares` | GET | `apprenant`, propriétaire | Rôle + propriété ; jamais le jeton en clair |
| `/api/shares/{shareId}` | DELETE | `apprenant`, propriétaire | Rôle + propriété + CSRF ; révocation (`revoked_at`) ; audit `share_revoked` |
| `/api/shares/{shareId}/consultations` | GET | `apprenant`, propriétaire | Rôle + propriété (404 sinon) ; journal des accès : dates des consultations réussies (`share_consulted`), ni IP ni navigateur |
| `/api/auth/me/adult` | GET / PUT | `apprenant` (le sien) | Rôle (+ CSRF sur PUT) ; auto-attestation de majorité (§12.1) ; `false` **efface** les versions partagées du compte, leurs liens et garanties, et ses demandes de publication garantie en attente, dans une transaction (`deletedVersions`) ; audit `adult_attested` / `adult_attestation_withdrawn` (compteur seulement) |
| `/api/partage/versions` | GET | `apprenant` (les siennes) | Rôle ; ses versions partagées, sans document, avec leur garantie `{par, date}` ou `null` |
| `/api/partage/demandes` | POST | `apprenant` | Rôle + CSRF ; **demande de publication garantie** (journal de la cartographie D-42) : case `adult: true` exigée (422) **et** attestation du compte relue sous verrou (403 `adult_required`) ; `replacesId` = une de SES versions partagées (422 sinon) ; 5 demandes en attente au plus (429) → 201 `{code, createdAt, expiresAt, replaces}` (code à usage unique, 10 caractères A-Z2-9, 30 jours) ; audit `publication_request_created` (ids seulement, jamais le code) |
| `/api/partage/demandes` | GET | `apprenant` (les siennes) | Rôle ; ses demandes en attente (les expirées sont effacées) |
| `/api/partage/demandes/{code}` | DELETE | `apprenant` (la sienne) | Rôle + CSRF ; annulation ; 404 si ce n'est pas une de ses demandes ; audit `publication_request_cancelled` |
| `/api/share/open` | GET (sans mdp) | **Public** | Lien SANS mot de passe d'une version partagée (§12) : jeton dans l'en-tête `X-Share-Token`, **jamais dans l'URL** (pas de trace dans les journaux d'accès) ; même quota IP que le POST, 404 homogène, 401 `password_required` si le lien a un mot de passe ; `X-Robots-Tag: noindex, nofollow, noarchive` et `Cache-Control: no-store` sur toutes les réponses publiques de partage |
| `/api/share/{token}` | POST (mdp) | **Public** (employeur, §3.6 — pas de compte) | Rate-limit IP (buckets hachés, /64 IPv6 via `ClientIp`) ; 404 homogène inconnu/expiré/révoqué (anti-énumération, vérif factice du mdp) ; 403 mauvais mdp ; depuis P9, `garantie` = état figé `{par, date, revisionId}` ou `null`, et le document servi est **celui de la révision garantie** quand `revisionId` est présent (§8). Si le navigateur porte une session, le SPA joint son jeton CSRF comme partout |
| `/api/training/progress` | GET/PUT | Connecté (tout rôle), sa propre progression | Session (+ CSRF sur PUT) |
| `/api/keys` | PUT | Connecté, ses propres clés | Session + CSRF ; chiffrement sodium `crypto_secretbox`, nonce par entrée, clé maîtresse `SODIUM_MASTER_KEY` (hors webroot) ; 503 explicite si non configurée |
| `/api/keys` | GET | Connecté, ses propres clés | Session ; `[{provider, createdAt}]`, **jamais** la clé |
| `/api/keys/{provider}` | GET | Connecté, **propriétaire authentifié seulement** | Session ; renvoie la clé déchiffrée — synchronisation AD-4 : le run s'exécute dans le navigateur (ADR-001) et a besoin de la clé côté client |
| `/api/keys/{provider}` | DELETE | Connecté, ses propres clés | Session + CSRF ; suppression réelle |
| `/api/prompt-packages`, `/api/prompt-packages/{id}/{version}` | GET | Public (comme le référentiel) | — ; versions **publiées** uniquement : un paquet publié est un artefact de méthode, sans donnée d'apprenant (la matrice P10 ci-dessous garde « connecté » pour l'atelier complet) |
| `/api/admin/import-prompt-package` | POST | Technique (script de déploiement, ADR-008) | Jeton `MIGRATE_TOKEN` dédié, hors rôles ; import idempotent par hash |

## Routes prévues (P4–P12) — matrice cible

Légende : ✔ = accessible (avec vérification de propriété le cas échéant),
— = refusé. « Connecté » = tout rôle. Statut : **prévu**, à confirmer au
moment du prompt correspondant.

### P4 — Référentiel (cahier §4.1, §3.5)

| Route | Méthode | Visiteur | Apprenant | Cartographe | Promptologue | Épistémiarque | Employeur | Établissement | Admin |
|---|---|---|---|---|---|---|---|---|---|
| `/api/referentiel` (dernière version publiée) | GET | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `/api/referentiel/versions`, `/versions/{v}`, diff | GET | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `/api/referentiels` (référentiels publiés, leurs versions, T15) | GET | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `/api/referentiels/{id}/versions/{semver}` (document d'une version **publiée** de tout référentiel, S5 ; brouillon et proposition : `404`, même à leur auteur) | GET | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Brouillons : création, édition, relecture (tous les référentiels depuis T15) | POST/PUT | — | — | — | — | ✔ | — | — | ✔ |
| Import d'un référentiel d'une autre structure, en brouillon (`/api/referentiel/import`, T15 ; RESPIRE refusé, 409) | POST | — | — | — | — | ✔ | — | — | ✔ |
| Publication d'une version (immuable) | POST | — | — | — | — | ✔ | — | — | ✔ |

### P6 — Proxy LLM et démo (cahier §3.1)

| Route | Méthode | Accès |
|---|---|---|
| `/api/llm` (proxy plateforme) | POST | Visiteur et connectés — garde-fous anti-abus (quotas IP/global, preuve de travail), pas de rôle |

### P8 — Espace apprenant (cahier §3.2, §6) — **implémenté en M6**, voir la matrice « Routes actuelles (P8) » ci-dessus

Écarts au prévisionnel, actés par le contrat d'API M6 :
- l'édition d'une cartographie est un `PATCH` (titre/visibilité), pas un `PUT` ;
- la révocation d'un lien est `DELETE /api/shares/{shareId}` (le lien a sa
  propre identité), pas un DELETE sur `/cartographies/{id}/share` ;
- les clés vivent sous `/api/keys` (et non `/api/account/api-keys`) ;
- l'archive export/import (AD-6) reste **locale au navigateur** (client-first,
  §6.1) : pas de routes `/api/account/export|import` en v1 — l'archive se
  construit côté client depuis le portfolio local + les cartographies.

### P9 — Espace cartographe (cahier §3.3, §8) — **implémenté en M7**

Principe d'accès : « cartographe lié » = lien `cartographe_links` créé par
l'acceptation d'un code d'invitation émis par l'apprenant, **et** cartographie
en visibilité `cartographe` ou `publique` (l'apprenant reste maître : un
retour à `privee` coupe l'accès immédiatement). Tout refus (id inconnu,
apprenant non lié, visibilité `privee`) répond le **même 404** (pas d'oracle
d'existence). Codes d'invitation : 10 caractères A-Z2-9, 30 jours, usage
unique, homogènes en 404 (inconnu = expiré = déjà utilisé = auto-lien).

| Route | Méthode | Accès | Garde |
|---|---|---|---|
| `/api/cartographe/invitations` | POST | `apprenant` | Rôle + CSRF ; plafond de 10 codes en attente (429 au-delà) → 201 `{code, expiresAt}` |
| `/api/cartographe/invitations` | GET | `apprenant` | Rôle ; ses codes avec statut (`en_attente`/`acceptee`/`expiree`) |
| `/api/cartographe/invitations/{code}/accept` | POST | `cartographe` | Rôle + CSRF ; 404 homogène ; auto-lien refusé ; idempotent sur lien existant ; audit `invitation_accepted` (ids seulement) |
| `/api/cartographe/apprentis` | GET | `cartographe` | Rôle ; ses apprenants liés |
| `/api/cartographe/cartographies` | GET | `cartographe` | Rôle ; file des cartos des apprenants liés, visibilité `cartographe`/`publique` ; métadonnées, **jamais** le document |
| `/api/cartographe/cartographies/{id}` | GET | `cartographe` lié | Rôle + lien + visibilité ; document + annotations + révisions (méta) + garantie |
| `/api/cartographies/{id}/annotations` | POST/GET | Propriétaire **ou** `cartographe` lié | Accès résolu par `Links::access()` (+ CSRF sur POST) ; `{competenceCode, type: commentaire\|hallucination\|oubli, texte}` |
| `/api/annotations/{annotationId}` | DELETE | **Auteur seul** | + CSRF ; annotation étrangère = 404 comme inexistante |
| `/api/cartographies/{id}/revisions` | POST | Propriétaire **ou** `cartographe` lié | + CSRF ; document **validé au schéma serveur** (`Validation.php`, type identique à la carto, 422 sinon) ; une nouvelle révision **retire la garantie** en place (§8, audit `garantie_retiree`) |
| `/api/cartographies/{id}/revisions` | GET | Propriétaire **ou** `cartographe` lié | Métadonnées seulement |
| `/api/revisions/{revisionId}` | GET | Propriétaire **ou** `cartographe` lié | Document ; l'accès suit la cartographie parente |
| `/api/cartographies/{id}/garantie` | POST | `cartographe` **lié uniquement** | + CSRF ; jamais le propriétaire (on ne garantit pas sa propre carto, §8 — 404), jamais automatique ; fige `{par, date, revisionId?}` ; 409 si déjà garantie par un **autre** cartographe (une signature humaine ne s'écrase pas en silence) ; re-pose par le même = remplacement ; audit `garantie_posee` |
| `/api/cartographies/{id}/garantie` | DELETE | Le cartographe **signataire** | + CSRF ; toujours possible (c'est son nom) même si la visibilité a changé ; audit `garantie_retiree` |
| `/api/cartographe/demandes/{code}` | GET | `cartographe` **porteur du code** | Rôle ; ouvre la demande qu'une personne lui a remise (journal de la cartographie D-42) : `{apprenant: {displayName}, garant: {displayName}, createdAt, expiresAt, replaces: {titre} \| null}` ; inconnu, mal formé, expiré, consommé ou **sa propre demande** (on ne garantit jamais sa propre cartographie) : même 404 ; 30 essais de code par heure et par cartographe (429) — le code est la seule clé, aucun lien `cartographe_links` n'est requis |
| `/api/cartographe/demandes/{code}/publier` | POST | `cartographe` **porteur du code** | Rôle + CSRF + même quota ; `garant: true` exigé (422) ; document vérifié par la liste blanche de la version partagée (`Share\SharedVersion`) ; **attestation de majorité de l'apprenant** relue sous verrou de sa ligne `users` (403 `adult_required`, rien n'est écrit) ; publie **dans le compte de l'apprenant** une version partagée privée, sans lien (ou remplace celle que vise la demande : mêmes liens), y pose la garantie du cartographe (`cartography_garanties`, nom figé), consomme la demande — une transaction ; le cartographe ne reçoit pas l'identifiant de la version et n'y a plus accès ; audit `shared_version_guaranteed` (ids seulement) |

Purge RGPD (migration 008) : suppression du compte **apprenant** → cascade
cartographies → annotations/révisions/garanties + invitations + liens ;
suppression du compte **cartographe** → liens, ses annotations et sa garantie
purgés, les révisions restent à l'apprenant **anonymisées** (`author_id` SET
NULL — le document corrigé est une donnée de l'apprenant), invitations
anonymisées (`accepted_by` SET NULL).

### P10 — Espace promptologue (cahier §3.4)

| Route | Méthode | Accès |
|---|---|---|
| `/api/prompts` (packages et versions publiées) | GET | Connecté (sélection d'une version pour un run) |
| Brouillons : création, édition, banc d'essai | POST/PUT | `promptologue` — un brouillon ne tourne que chez son auteur |
| Publication d'une version (immuable) | POST | `promptologue` |
| Version par défaut proposée aux apprenants | POST | `promptologue` (proposition) + `admin` (validation) |
| Comparaison au Golden Prompt | POST | `promptologue` — si autorisée par `admin` (§7) |

### P11 — Établissements et masse (cahier §3.7, §4.9, §7) — **implémenté en M8**

Principes d'accès (docs/plan-masse.md §6-7) : « sa cohorte » = cohorte dont
`etablissement_id` = utilisateur de la session ; tout id étranger répond le
**même 404** qu'un id inexistant. Le consentement de l'apprenant est à DEUX
étages : rejoindre la cohorte (consentement explicite `{"consentement": true}`
dans le corps + texte affiché — « l'établissement verra les cartographies
produites dans ce cadre ») puis **déposer son portfolio** (opt-in de fait au
traitement serveur : seuls les déposants sont enfilés). Quitter la cohorte
retire le consentement : adhésion + dépôt purgés, jobs en attente annulés ;
les documents produits restent à l'apprenant et sortent du champ de
l'établissement (l'accès exige l'adhésion active).

| Route | Méthode | Accès | Garde |
|---|---|---|---|
| `/api/etablissement/cohortes` | POST/GET | `etablissement` | Rôle (+ CSRF sur POST) ; code d'invitation 10 caractères A-Z2-9 |
| `/api/etablissement/cohortes/{id}` | GET | `etablissement`, propriétaire | Membres : `consentAt`, dépôt, avancement jobs — jamais de contenu de portfolio |
| `/api/etablissement/cohortes/{id}` | DELETE | `etablissement`, propriétaire | + CSRF ; purge réelle en cascade (membres, dépôts, runs, jobs) |
| `/api/cohortes` | GET | `apprenant` | Ses propres adhésions uniquement (consentement daté, établissement, état du dépôt) — jamais le code d'invitation |
| `/api/cohortes/{code}/rejoindre` | POST | `apprenant` | Rôle + CSRF ; **422 sans `{"consentement": true}`** ; `consent_at` horodaté ; re-jointure idempotente (200, consentement d'origine conservé) ; audit `cohorte_joined` (ids) |
| `/api/cohortes/{id}/portfolio` | POST | `apprenant`, **membre consenti** | Rôle + CSRF + adhésion (404 sinon) ; segments journaliers validés (dates ISO uniques, 4 Mo max) ; re-dépôt = remplacement ; audit = compteurs seulement (§6.5) |
| `/api/cohortes/{id}/quitter` | DELETE | `apprenant`, membre | + CSRF ; retrait du consentement (voir principes) ; audit `cohorte_quit` |
| `/api/etablissement/config` | PUT/GET | `etablissement`, son compte | + CSRF sur PUT ; clé endpoint chiffrée sodium (AD-4), **jamais relue** (`hasApiKey`) ; hausse du plafond = réactivation des jobs `budget_exceeded` |
| `/api/etablissement/worker-token` | POST | `etablissement`, son compte | + CSRF ; jeton en clair **une seule fois** (`no-store`), stocké sha256 |
| `/api/etablissement/cohortes/{id}/runs` | POST | `etablissement`, propriétaire | + CSRF ; versions paquet/référentiel **publiées** figées sur le run ; enfile (membre consenti AYANT déposé × journée) ; audit `mass_run_created` (compteurs) |
| `/api/etablissement/runs/{runId}` | GET | `etablissement`, propriétaire | Jobs par statut, coût cumulé, erreurs (jamais de contenu) |
| `/api/etablissement/runs/{runId}/annuler` | POST | `etablissement`, propriétaire | + CSRF ; jobs non terminaux → `cancelled` (écritures worker conditionnelles : l'annulation gagne) |
| `/api/etablissement/membres/{userId}/documents` | GET | `etablissement` | Documents jour `done` de SES cohortes, **adhésion active exigée** ; 404 homogène (membre inconnu, étranger, parti, ou rien de produit) |
| `/api/worker/jobs` | GET | **Machine** (runner de l'établissement) | Jeton `X-Worker-Token` (haché en base), hors rôles et hors CSRF (aucune session, donc aucun crédit ambiant) ; réserve avec bail 5 min, jobs de SON établissement uniquement ; refus si plafond consommé |
| `/api/worker/jobs/{id}/checkpoint` | POST | Machine, son job | Jeton ; persiste l'avancement par pôle + renouvelle le bail ; 409 si le job n'est plus `running` |
| `/api/worker/jobs/{id}/result` | POST | Machine, son job | Jeton ; document **re-validé au schéma côté serveur**, coût déclaré borné, `spent_usd` incrémenté ; 409 en rejeu |
| `/api/admin/worker-tick` | POST | Technique (ADR-008, ADR-011) | Jeton `WORKER_TICK_TOKEN` (`X-Worker-Tick-Token`), qui n'ouvre que cette route et la maintenance, ou `X-Migrate-Token` ; un tick borné (runs Twin9, puis masse), réponse = compteurs uniquement |
| `/api/admin/maintenance` | POST | Technique (ADR-008) | `X-Migrate-Token`, ou le jeton du tick (`X-Worker-Tick-Token`, 2026-10-22) ; purge ce qui a expiré (liens de partage morts depuis 30 jours, compteurs de démo des jours passés, défis expirés), réponse = compteurs uniquement |

### P12 — Administration (cahier §3.8, §4.10)

| Route | Méthode | Accès |
|---|---|---|
| Golden Prompt (import, autorisations d'accès) | GET/POST | `admin` |
| Clés plateforme, plafonds démo, config | GET/PUT | `admin` |
| Attribution / révocation des rôles (les habilitations) ; la liste `GET /api/admin/users` montre à côté les rôles déclarés de chaque compte et `grantable`, les habilitations que ses déclarations appellent (sprint 8, principe 7) | GET/POST/DELETE | `admin` |
| **Gabarits Twin9 — CONTENU** (`/api/twin9/admin/jeux/{jeu}/protocole**`, `/api/twin9/admin/jeux/{jeu}/tester`) et copie du jeu v9.8 (`POST /api/twin9/admin/jeux`) | GET/PUT/POST | **`admin` ∧ `promptologue`** (les DEUX rôles, `RequireRole::all`, AD-D2) ; écrire (`PUT`, `…/restore`) : l'auteur de la copie seul, jamais le jeu v9.8 (403, T14) |
| Jeux de gabarits Twin9 — liste sans contenu (`GET /api/twin9/admin/jeux`) et jeu par défaut (`PUT /api/twin9/admin/jeux/defaut`) | GET/PUT | `admin` (T14) |
| Twin9 supervision (config, contribution, promo, comptes) | GET/PUT | `admin` |

> **AD-D2.** L'édition des gabarits du Golden Prompt Twin9 (lecture ET écriture du
> contenu, versions, banc d'essai de rendu) exige la **conjonction** admin ∧
> promptologue : un administrateur non-promptologue n'en voit plus le contenu
> (403). La supervision commerciale (contribution, promo « Twin9 gratuit »,
> comptes) reste `admin` seul. Front : l'éditeur vit sous « Faire évoluer » →
> `#/twin9-atelier` (visible seulement avec les deux rôles) ; `#/admin/twin9`
> garde la supervision. Depuis T14, l'atelier lit le jeu v9.8 sans l'écrire —
> l'import seul l'écrit — et chacun y écrit ses copies, et elles seules ; la
> question « Qui voit les gabarits ? » restant ouverte, D2 s'applique
> (`TemplateSets::ATELIER`).

### Configuration Twin9 (T13, `#/configuration`)

Chacun règle les profils de ses runs, et seulement les siens. L'administrateur
fixe ce qui vaut pour toute l'instance. Chaque ligne de la matrice a son test dans
`api/tests/Twin9/ConfigurationDroitsTest.php`.

| Ce que l'on règle | Visiteur | Compte | `admin` |
|---|---|---|---|
| Ses profils : créer, lire, modifier, supprimer | — | ✔ les siens | ✔ les siens |
| Le profil d'un autre | — | — (404) | — (404) |
| Le profil v9.8, par défaut | — | lecture (une modification en fait une copie, la sienne) | idem |
| Les profils prédéfinis (« Stigmergie (essai) », proposé en mode expert) | — | lecture (on le copie dans un nouveau profil, le sien) | idem |
| Le budget et la durée de ses runs | — | ✔ | ✔ |
| Sa clé : celle de l'instance ou la sienne | — | ✔ ; la sienne si l'administrateur l'a ouverte, et chez Anthropic seulement (ADR-012) | idem |
| Le fournisseur de chaque étage, étape ou lecteur de ses profils (ADR-012) | — | ✔ parmi les six du registre ; un fournisseur que l'administrateur n'a pas ouvert s'enregistre, mais ne s'estime ni ne se lance | idem |
| Sa clé personnelle elle-même (son coffre, `#/compte`) | — | ✔ | ✔ |
| Le référentiel de ses runs | — | parmi les publiés ; avec `epistemiarque`, ses propres brouillons aussi, pour ses runs d'essai (T15), tant qu'il l'est | idem (un `admin` écrit aussi des brouillons) |
| Le jeu de gabarits de ses runs (T14) | — | le jeu v9.8 ou le jeu par défaut | idem ; avec `promptologue` (atelier), ses copies aussi, tant qu'il en est |
| Le jeu v9.8 (T14) | — | — | lecture dans l'atelier (`admin` ∧ `promptologue`) ; seul l'import l'écrit |
| Copier le jeu v9.8, éditer sa copie, ses versions, son retour arrière (T14) | — | — | `admin` ∧ `promptologue` : ✔ la sienne ; la copie d'un autre se lit (403 en écriture) ; `admin` seul : — (403) |
| Le jeu de gabarits par défaut, celui du profil par défaut (T14) | — | — (403) | ✔ (`#/admin/twin9`, `/api/twin9/admin/jeux/defaut`) |
| Prix, marge, ouverture des clés personnelles | — | — (403) | ✔ (`#/admin/twin9`, `/api/twin9/admin/config`) |
| Ouverture des fournisseurs (`twin9_fournisseurs_ouverts`, Anthropic seul par défaut) et des fournisseurs étiquetés « non » au regard du RGPD (`twin9_fournisseurs_non_rgpd`, fermé par défaut), prix et plafonds de leurs modèles — ADR-012 | — | — (403) | ✔ (`#/admin/twin9`, `/api/twin9/admin/config`) |
| Savoir quelles clés d'instance sont posées | — | — : la page de configuration ne lit qu'un booléen `disponible` par fournisseur, sans sa cause | ✔ (`fournisseurs[].cle_instance` de `/api/twin9/admin/config`, un booléen, jamais la clé) |
| Runs par tick, durée d'une tranche (T7) | — | — (403) | ✔ (`/api/twin9/admin/config`, pas encore à l'écran) |
| La clé de l'instance | — | — | à l'installation (`ANTHROPIC_API_KEY` et, pour les autres fournisseurs, `OPENAI_API_KEY`, `MISTRAL_API_KEY`, `GOOGLE_API_KEY`, `XAI_API_KEY`, `OPENROUTER_API_KEY` : `api/.env.example`), jamais par l'interface |

Les jeux de gabarits des promptologues (T14) y ont leurs lignes, testées dans
`ConfigurationDroitsTest.php` (le jeu de ses runs), `Twin9ProtocoleTest.php` et
`UcPro08EditerGabaritsTwin9Test.php` (le jeu v9.8, les copies, le jeu par
défaut) ; les brouillons de référentiel (T15) y ont la leur, testée dans
`ConfigurationDroitsTest.php` (`testADraftServesOnlyItsAuthorsTestRuns`) ;
depuis T16, un run sur un autre référentiel que RESPIRE part, son moteur
lisant le référentiel du profil (`RunsTest.php`,
`testARunReadsTheReferentialItsProfileNames`). Les fournisseurs (ADR-012)
ont les leurs : leur ouverture (`testTheProvidersAreOpenedByTheAdministrator`),
les clés d'instance que lit l'administrateur seul (`testTheAdministratorReadsWhichInstanceKeysAreSet`),
les fournisseurs de chaque profil que l'accord nomme (`testTheConfigurationNamesEachProfilesProviders`),
les profils prédéfinis (`testThePresetsAreReadOnly`), la stigmergie, que
l'accumulation des calques fait refuser (`testTheStigmergyRefusesTheArchivedLayersInTheConsensus`),
un profil qui nomme un fournisseur fermé (`testAProviderNotOpenYetIsSavedNotLaunched`),
la clé personnelle, Anthropic seulement
(`testThePersonalKeyOnlyWhereTheAdministratorOpenedIt`), et le lancement
refusé (`RunsTest.php`, `testAProviderNotOpenLaunchesNothing`).

| Route | Méthode | Accès |
|---|---|---|
| `/api/twin9/configuration` | GET | Compte : ses profils (sans leur document), le profil par défaut (celui de la v9.8, avec le jeu de gabarits par défaut), les profils prédéfinis (`predefinis`, de même), les référentiels publiés et leurs versions, ses propres brouillons (T15), les jeux de gabarits qu'il peut choisir, sa clé personnelle (ouverte, enregistrée) |
| `/api/twin9/profils` | POST | Compte, + CSRF. Le profil doit être valide (schéma, règles de l'API, dont celles des fournisseurs) et admis (référentiel publié, ou son brouillon en mode essai, T15 ; jeu qu'il peut choisir ; clé personnelle ouverte, et seulement pour un profil tout Anthropic) |
| `/api/twin9/profils/{id}` | GET/PUT/DELETE | Son propriétaire, + CSRF sur PUT et DELETE ; 404 pour tout autre |

### Runs Twin9 (T9, `#/twin9`)

Chacun lance, suit et lit ses runs, et seulement les siens. Il choisit qui
d'autre lit leurs résultats : personne, ou le cartographe auquel il est lié.
L'administrateur ne voit que des compteurs. Chaque ligne de la matrice a son
test dans `api/tests/Twin9/RunsTest.php` ; l'aperçu, dans `ApercuTest.php` ;
l'export, dans `PurgeExportTest.php` (T10).

| Ce que l'on fait | Visiteur | Compte | Cartographe lié | `admin` |
|---|---|---|---|---|
| Voir avant de lancer les journées à instruire, le coût et la durée estimés (rien n'est gardé) | — (401) | ✔ avec un de ses profils ou celui de la v9.8 | comme tout compte | comme tout compte |
| Lancer un run : un de ses profils ou celui de la v9.8, son portfolio, son accord | — (401) | ✔ (accord exigé, qui nomme les fournisseurs du run, 422 sans lui ou s'il en nomme d'autres ; 422 si le profil atteint un fournisseur que l'administrateur n'a pas ouvert, ou sans sa clé d'instance, ou un modèle tiers sans prix ni plafonds) | comme tout compte | comme tout compte |
| Lancer, ou voir avant de lancer, sur un autre référentiel que celui du profil (S5, lot C) | — (401) | ✔ un référentiel publié ; avec `epistemiarque`, son propre brouillon, pour un run d'essai, tant qu'il l'est (422 sinon, comme pour un profil) | comme tout compte | comme tout compte (un `admin` écrit aussi des brouillons) |
| Lancer avec le profil d'un autre | — | — (404) | — (404) | — (404) |
| Suivre ses runs, les annuler, les reprendre (sous un nouveau budget), régler leur visibilité | — (401) | ✔ les siens | — (404) | — (404) |
| Exporter ses runs, leurs journaux et la mémoire de ses cartes | — (401) | ✔ les siens | — | — |
| Faire avancer ses runs par la page du run (route de session) | — (401) | ✔ les siens seulement, jamais avec le jeton du tick | — | — |
| Lire les résultats d'un run (filtrés, ADR-010 §2) | — (401) | ✔ les siens | ✔ si le run lui est visible (`cartographe`) | — (404) |
| Voir les compteurs de tous les runs, sans contenu | — (401) | — (403) | — (403) | ✔ |

| Route | Méthode | Accès |
|---|---|---|
| `/api/twin9/runs` | GET | Compte : ses runs (sans portfolio ni résultat), et si Twin9 tourne sur l'instance |
| `/api/twin9/runs/apercu` | POST | Compte, + CSRF : `{profil, portfolio, referentiel?}` ; les journées nouvelles ou changées, le coût et la durée estimés, les plafonds, son crédit, le référentiel lu et le jury retiré (S5, lot C) ; 404 pour le profil d'un autre ; rien n'est gardé |
| `/api/twin9/runs` | POST | Compte, + CSRF : `{profil, portfolio: {nom, texte}, accord: {fournisseurs}, visibilite, referentiel?}` (`accord: true` pour un profil tout Anthropic ; `referentiel: {id, version?}`, un autre que celui du profil, écrit dans sa copie avant son admission, S5 lot C) ; le profil est revalidé et admis (`ProfilPolicy` : modèles au prix de l'instance compris), son référentiel figé ; jusqu'à T16, un autre référentiel que RESPIRE est refusé (422), à l'aperçu aussi |
| `/api/twin9/runs/avancer` | POST | Compte, + CSRF : une tranche, de la durée de celles du tick et sous son verrou, pour ses seuls runs |
| `/api/twin9/runs/{id}` | GET | Son propriétaire : sa progression, lue dans son journal ; 404 pour tout autre |
| `/api/twin9/runs/{id}/annuler`, `/reprendre` | POST | Son propriétaire, + CSRF ; `/reprendre` accepte `{budget_usd}`, un nouveau budget, et relit la garde de ses fournisseurs (422 pour un fournisseur fermé depuis ou sans sa clé d'instance) ; 409 hors de l'état voulu |
| `/api/twin9/runs/{id}/visibilite` | PUT | Son propriétaire, + CSRF : `privee` ou `cartographe` |
| `/api/twin9/runs/{id}/resultats` | GET | Son propriétaire ; le cartographe lié si le run lui est visible, la configuration et l'exécution du run sans prix, coût, plafond ni clé (P0-1, `docs/contrats.md` §8.9) ; 404 pour tout autre, administrateur compris |
| `/api/twin9/mes-analyses` | GET | Compte : ses runs (copie du profil, portfolio, journal, sorties, filtrés) et la mémoire de ses cartes, pour l'archive de compte |
| `/api/twin9/admin/runs` | GET | `admin` : compteurs, statut, dates ; jamais de portfolio ni de résultat |

### Backlog (hors v1, annexe B du plan)

Marketplace employeur (bibliothèque payante des cartographies consenties,
§4.8) : accès `employeur` payant — la v1 se limite au lien individuel
`/api/share/{token}`, qui ne requiert aucun compte.

## Traçabilité

- Rôles en base : migration `scripts/migrations/001_users_roles.sql`
  (7 rôles seedés ; le visiteur est l'absence de session).
- Rôles déclarés (sprint 8, principe 7) : migration
  `scripts/migrations/035_roles_declares.sql` ; domaine
  `api/src/Auth/DeclaredRoles.php` ; routes `api/src/routes/declared-roles.php`
  et la liste de `api/src/Admin/UserDirectory.php` ; tests
  `api/tests/UseCases/{Unit,Functional}/UcCpt07DeclarerRolesTest.php`
  (propriété « une déclaration n'ouvre rien » : F06 à F08, U10) et UC-ADM-01
  U28, F26.
- Sessions : `api/src/DbSessionHandler.php` (cookie HttpOnly, SameSite=Lax,
  Secure hors dev, régénération d'ID à la connexion).
- Garde : `api/src/Middleware/RequireRole.php` ; CSRF :
  `api/src/Middleware/CsrfMiddleware.php` ; routes :
  `api/src/routes/auth.php`.
- P8 (M6) : routes `api/src/routes/{cartographies,share,training,keys,packages}.php` ;
  domaine `api/src/Cartographies/`, `api/src/Share/`, `api/src/Keys/`,
  `api/src/Packages/` ; migration `scripts/migrations/007_cartographies_run_meta.sql` ;
  paquet par défaut `scripts/build-default-prompt-package.mjs` +
  `scripts/import-prompt-packages.php`.
- Interface ultime, P6 (spécification §12) : une version partagée (type
  `partage`) est hors du module de relecture — `Links::access` la refuse, donc
  annotations, révisions et garantie répondent 404 (403 pour la garantie, faute
  de rôle cartographe) ; routes `api/src/routes/partage.php`
  (attestation), `share.php` (mot de passe facultatif, GET public, journal
  des accès), `cartographies.php` (type `partage`) ; domaine
  `api/src/Share/SharedVersion.php` ; migration
  `scripts/migrations/022_carto_partage_adultes.sql` ; tests
  `api/tests/CartoPartageTest.php`. Version garantie (journal D-42) : une
  version publiée par un cartographe, à la demande de l'apprenant, porte sa
  garantie (`cartography_garanties`, posée à la publication, jamais par le
  module de relecture) ; domaine `api/src/Share/PublicationRequests.php` ;
  migration `scripts/migrations/023_carto_publication_garantie.sql` ; tests
  `api/tests/CartoGarantieTest.php`.
- P9 (M7) : routes `api/src/routes/{cartographe,annotations}.php` (+ garantie
  dans `share.php`) ; domaine `api/src/Cartographe/` (`Invitations`, `Links`,
  `Annotations`, `Revisions`, `Garanties`) ; migration
  `scripts/migrations/008_cartographe_garanties_settings.sql`.
- Tests : `api/tests/AuthRoutesTest.php`, `AuthCsrfTest.php`,
  `AuthRateLimitTest.php`, `AuthRequireRoleTest.php`,
  `AuthAccountDeletionTest.php` ; P8 : `CartographiesTest.php`,
  `CartographiesCsrfTest.php` (matrice CSRF + exemption `/api/llm`),
  `CartographiesPurgeTest.php` (purge RGPD croisée avec 004/005),
  `ShareTest.php`, `TrainingTest.php`, `KeysTest.php`, `PackagesTest.php` ;
  P9 : `CartographeInvitationsTest.php`, `CartographeQueueTest.php`,
  `AnnotationsTest.php`, `CartographeRevisionsTest.php`,
  `CartographeGarantieTest.php` (partage public avec garantie),
  `CartographePurgeTest.php` (purge RGPD croisée avec 008).
