# UC-ADM-04 — Configurer la démo publique

| Champ | Valeur |
|---|---|
| **Acteur principal** | Administrateur (rôle `admin`, session ouverte — typiquement depuis un smartphone) |
| **Acteurs secondaires** | Visiteur de la démo et compte qui fait l'essai gratuit de la cartographie ouverte (subissent l'effet : UC-VIS-03, UC-VIS-05, UC-APP-09 A6) ; exploitant qui règle l'environnement serveur (`~/app/shared/.env`) |
| **Portée** | humanome.xyz — `#/admin/reglages` (bloc « Démo publique »), `#/admin/config` ; API de session `/api/admin/demo-config` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.1 (démo sans compte, garde-fous anti-abus), §3.8 et §4.10 (configuration simple) ; principe RGPD n°5 — journalisation minimale (`CLAUDE.md`, `docs/rgpd-registre.md`) ; `docs/administration.md` §3-4, `api/config/demo.php` |
| **Statut** | Implémenté (P12.1 ; édition en ligne : chantier A ; plafond mensuel des crédits offerts : sprint 7, S7a) |

## Objectif

Permettre à l'administrateur d'**allumer ou éteindre** la démonstration
publique (proxy LLM des visiteurs sans compte) et d'en régler le **modèle**
(un Haiku, RG9) et les **plafonds** (taille d'entrée, quota par IP, plafond
global de tokens et budget quotidiens, difficulté de la preuve de travail,
délai amont), avec effet **immédiat et sans redéploiement**, sans jamais
exposer ni rendre modifiables la clé plateforme et le fournisseur. La sortie
d'un appel n'est plus un réglage depuis le 2026-10-21 : c'est le maximum du
modèle, et la réservation du pire cas sur le budget du jour la borne (RG8).

## Déclencheur

L'administrateur ouvre `#/admin/reglages` (menu « Administrer » → « Réglages »),
par exemple juste avant ou juste après une présentation.

## Préconditions

- Compte `admin` connecté (session + jeton CSRF), API et base joignables.
- Les couches inférieures existent : `api/config/demo.php` (versionné,
  « fichier ») et, en production, les variables `DEMO_*` de
  `~/app/shared/.env` (« env »). La clé `ANTHROPIC_API_KEY` ne vit que dans
  l'environnement.

## Garanties en cas de succès

- Les valeurs envoyées sont **validées puis fusionnées** dans
  `settings["demo_overrides"]` (couche « base ») ; la réponse donne pour chaque
  champ sa valeur **effective** et son **origine** (`base`, `env`, `fichier`,
  `defaut`).
- La requête suivante d'un visiteur applique les nouvelles valeurs :
  `POST /api/llm` — l'Essayer, l'essai gratuit de la cartographie ouverte
  (UC-APP-09 A6), le Service humanome (UC-APP-02), le banc et la
  rétro-ingénierie du promptologue, qui partagent le budget du jour —,
  `GET /api/llm/challenge`
  et `GET /api/llm/status` (tous les champs) ; `GET /api/gdoc-text` (quota
  `perIpPerHour` partagé) ;
  `POST /api/tuteur`, qui n'applique que `enabled`, `powDifficultyBits` et
  `perIpPerHour` (dans son propre seau `tuteur:`), ses modèle (un Haiku aussi,
  UC-VIS-05), `maxTokens`, taille de question et budget venant de ses
  constantes `TUTEUR_*` ;
  `GET /api/status`, servi avec `Cache-Control: public, max-age=30` (l'effet
  peut y paraître jusqu'à 30 s plus tard côté navigateur ou proxy).
- Un audit `demo_config_updated` (noms des champs **envoyés** dans le patch,
  même inchangés — **jamais les valeurs**) ou `demo_config_reset` est écrit,
  acteur = l'administrateur.

## Garanties minimales (en cas d'échec)

- Un patch invalide n'écrit **rien** (tout ou rien), ni surcharge ni audit.
- Si la base est absente ou injoignable, `DemoConfig::load` ignore la couche
  « base » en silence (fail-safe) : la **lecture** de la configuration ne
  provoque jamais de `500`. Les routes qui ont elles-mêmes besoin de la base
  échouent en revanche (voir A3).
- La clé API n'est jamais renvoyée (seulement `apiKeyConfigured`, booléen) ; le
  fournisseur ne peut pas être changé depuis le web.

## Scénario nominal

1. L'administrateur ouvre `#/admin/reglages`. `AdminView` vérifie la session
   (rôle `admin`), puis `ReglagesSection` charge en parallèle
   `GET /api/admin/settings`, `GET /api/prompt-packages` et
   `GET /api/admin/demo-config`.
2. `DemoConfigService::read` renvoie `200 {effective, sources, modelRefuse,
   allowedModels, apiKeyConfigured}` : dix valeurs effectives (`enabled`,
   `provider`, `model`, `sortieMax`, `maxInputChars`, `perIpPerHour`,
   `dailyGlobalTokens`, `dailyBudgetUsd`, `powDifficultyBits`,
   `upstreamTimeoutSeconds`) calculées par `DemoConfig::load` (précédence
   **base > env > fichier > défaut**) — `sortieMax`, la sortie que demande
   chaque appel, est le maximum du modèle (`Llm\ModelLimits`), en lecture
   seule ; `modelRefuse` nomme les modèles des couches qui ne sont pas un Haiku
   (RG9).
3. L'IHM affiche le grand interrupteur « Démo publique : activée /
   désactivée » (`role="switch"`), le fournisseur (« non modifiable »), l'état de
   la clé API (« configurée » / « absente »), puis le formulaire : modèle (liste
   des Haiku + « autre… » en saisie libre), la note « La démo reste sur Haiku :
   Sonnet et Opus sont réservés aux comptes qui ont acheté des crédits ou
   utilisent leur propre clé. », la ligne « Sortie par appel : le maximum du
   modèle, 128 000 jetons, sans plafond — son pire cas est réservé sur le
   budget du jour avant l'appel. », et six plafonds, chacun avec ses bornes et
   un badge d'origine (« réglage base », « env », « fichier », « défaut »).
4. **Interrupteur** : un clic envoie `PUT /api/admin/demo-config {enabled}`
   (+ `X-CSRF-Token`). Le serveur valide, fusionne, audite et renvoie le nouvel
   état ; l'IHM affiche « Démo publique désactivée. » (ou « activée. ») et
   l'interrupteur bascule. Dès la requête suivante, le visiteur reçoit `503
   « La démonstration est désactivée pour le moment. »` sur `POST /api/llm` et
   `GET /api/llm/challenge`, l'assistant tuteur répond `503 « L’assistant est
   indisponible pour le moment. »`, et `GET /api/llm/status` /
   `GET /api/status` annoncent `enabled: false`.
5. **Réglages** : l'administrateur modifie le modèle et/ou des plafonds puis
   clique « Enregistrer ». L'IHM calcule un **PUT partiel** ne contenant que les
   champs dont la valeur diffère de l'effectif (nombres convertis) ; le serveur
   répond `200` avec l'état complet ; message « Réglages de la démo enregistrés
   (effet immédiat). », badges « réglage base » sur les champs posés.
6. La démo applique aussitôt les nouvelles valeurs : difficulté du défi
   (`difficultyBits`), `413` au-delà de `maxInputChars`, `429 « Quota horaire
   atteint »` au-delà de `perIpPerHour` (quota partagé avec `GET /api/gdoc-text`),
   modèle, `max_tokens` (le maximum du modèle) et délai amont imposés au
   fournisseur (quoi que le client envoie), coupe-circuit journalier
   (`dailyGlobalTokens`, `dailyBudgetUsd`, comparaison `≥`, et le pire cas de
   l'appel réservé avant qu'il parte, UC-VIS-03 RG4).

## Scénarios alternatifs

- **A1 — Budget ou plafond global atteint** (étape 6) : un budget quotidien à
  `0` (borne autorisée) ou un plafond de tokens dépassé rend la démo « épuisée »
  pour le jour UTC dès que le cumul **atteint** le plafond (`≥`) :
  `remainingToday: false` et `503 « Démo épuisée pour aujourd’hui, revenez
  demain. »` sur `POST /api/llm`.
- **A2 — Réinitialiser** (étape 5) : « Réinitialiser (revenir aux valeurs
  env/fichier) » envoie `DELETE /api/admin/demo-config` : toutes les surcharges
  sont supprimées, l'état revient à env/fichier (message « Réglages de la démo
  réinitialisés (valeurs env/fichier). »), audit `demo_config_reset`. Une
  surcharge « base » gagne toujours sur une variable `DEMO_*` tant qu'elle
  existe.
- **A3 — Base injoignable** (étape 6) : `DemoConfig::load` ignore la couche
  « base » (journal serveur `[demo-config] overrides unavailable…`) :
  `GET /api/llm/status` et `GET /api/llm/challenge` répondent sur env/fichier
  (`remainingToday: false`, `remainingThisMonth: false`, compteurs illisibles). `POST /api/llm` et
  `POST /api/tuteur`, qui ont besoin de la base (preuve de travail à usage
  unique, quotas, compteurs), échouent en `500` ; `GET /api/status` annonce
  `db: "error"` et `demo {enabled: false, remainingToday: null, remainingThisMonth: null}` (en
  contradiction avec `/api/llm/status`) ; l'administration elle-même (étape 2)
  est indisponible (`500` : la session admin vit en base). Les surcharges
  réapparaissent au retour de la base.
- **A4 — Consulter la configuration serveur** : `#/admin/config`
  (`ConfigSection`, `GET /api/admin/settings` → `config`) liste les variables
  versionnées de `api/config/app.php` avec leur valeur effective (ou « (défaut :
  …) ») ; les secrets (`ANTHROPIC_API_KEY`, `POW_SECRET`, `MIGRATE_TOKEN`…)
  n'apparaissent que comme « configuré » / « absent ». La garantie est
  **serveur** : `PlatformStatus::config` réduit toute entrée `secret` à
  `{env, description, secret, configured}`, sans valeur.
- **A5 — Rien à enregistrer** (étape 5) : aucun champ modifié → « Aucune
  modification à enregistrer. », aucune requête.
- **A6 — Modèle hors liste** (étape 3) : un modèle effectif absent de
  `allowedModels` présélectionne « autre… » avec sa valeur ; tout Haiku au bon
  format est accepté (nouveau Haiku utilisable le jour de sa sortie).
- **A7 — Un Sonnet ou un Opus dans une couche** (étape 3, RG9) : un modèle
  qui n'est pas un Haiku, posé en base, en environnement (le `.env` de
  production de juillet nomme Sonnet 5) ou dans le fichier, n'est pas appliqué :
  la démo prend le premier Haiku des couches, sinon Haiku 5.5, et l'IHM affiche
  en alerte « Modèle refusé : claude-sonnet-5 (env) — la démo emploie
  claude-haiku-5-5. ».
- **A8 — Le plafond mensuel des crédits offerts** (étape 3, RG10, sprint 7) :
  le champ « Crédits offerts / mois (USD) » (0 à 1 000, origine affichée)
  règle ce que l'instance offre en un mois UTC, l'Essayer, la démo et le
  tuteur ensemble ; une ligne dit le grand livre du mois : « Crédits offerts
  ce mois-ci (2026-10, mois UTC) : 3.20 $ dépensés, 0.32 $ réservés par les
  appels en cours, 16.48 $ restants sur 20.00 $ — 41 appels, 0 refus. », et
  « Épuisés : … » une fois le plafond atteint. À 0, effet immédiat : l'Essayer
  et le tuteur répondent « Les crédits offerts de ce mois sont épuisés ;
  revenez le 1er … » ; une réponse déjà en cours finit (UC-VIS-03 RG7).

## Scénarios d'erreur

- **E1 — Visiteur sans session** : `401` sur `GET/PUT/DELETE
  /api/admin/demo-config` ; IHM : espace réservé.
- **E2 — Compte sans rôle admin** : `403 « Rôle insuffisant »` ; IHM : espace
  réservé, aucune lecture de la configuration.
- **E3 — Valeur invalide** (étape 5) : `422` avec un message français précis,
  rien n'est appliqué — bornes (« maxInputChars doit être compris entre 1000
  et 4000000. »), type (« perIpPerHour doit être un entier. », « enabled doit
  être un booléen. », « dailyBudgetUsd doit être un nombre. »), modèle (« Le
  modèle ne peut pas être vide. », « Identifiant de modèle invalide … », « La
  démo reste sur Haiku : Sonnet et Opus sont réservés aux comptes qui ont
  acheté des crédits ou qui utilisent leur propre clé. »), sortie (« La sortie
  n’est plus plafonnée : chaque appel peut rendre le maximum du modèle (128 000
  jetons pour Haiku 5.5), et le budget du jour le borne. », pour
  `maxTokensPerRequest`), champ inconnu (« Champ inconnu : … »), fournisseur
  (« Le fournisseur n’est pas modifiable : … »), patch vide (« Aucun champ à
  modifier. »). L'IHM affiche le
  message en alerte. Côté client, avant tout envoi : un champ vidé est refusé
  (« Champ vide : <libellé>. »), un modèle libre vide aussi (« Le modèle ne
  peut pas être vide. ») et un brouillon non numérique (ex. valeur serveur
  nulle) donne « Valeur invalide pour « <libellé> ». ». Le code convertit une
  virgule décimale en point, mais la valeur d'un `<input type="number">` est
  assainie selon la spécification HTML (une chaîne qui n'est pas un nombre
  flottant valide, comme « 2,5 », devient vide) : ce remplacement n'est donc
  pas atteint depuis ces champs, et « 2,5 » y donne « Champ vide » (vérifié
  sous jsdom).
- **E4 — Corps illisible** : un corps qui n'est pas du JSON → `400 « Corps JSON
  invalide : objet attendu »` ; un corps vide → `422`.
- **E5 — Jeton CSRF absent ou invalide** : `403 « Jeton CSRF absent ou
  invalide »`, configuration intacte ; l'IHM affiche le message et
  l'interrupteur ne bouge pas.

## Règles de gestion

- **RG1** — Précédence par champ : `base` (surcharge admin) > `env` (`DEMO_*`) >
  `fichier` (`api/config/demo.php`) > `defaut` (codé). Une valeur de base au
  mauvais type (chaîne pour un entier, modèle vide, chaîne pour un booléen) est
  ignorée **champ par champ** ; un entier est accepté pour le budget (réel).
- **RG2** — Bornes, contrôlées par `DemoConfigService::update` (couche
  « base ») **uniquement** : `maxInputChars` 1000–4000000 ; `perIpPerHour`
  1–1000 ; `dailyGlobalTokens` 10000–50000000 ; `powDifficultyBits` 8–24 ;
  `upstreamTimeoutSeconds` 10–300 (entiers stricts) ; `dailyBudgetUsd` 0–1000
  (réel) ; `model` rogné, motif `[A-Za-z0-9][A-Za-z0-9._-]{0,99}`, et un Haiku
  (RG9). Les valeurs env/fichier ne sont pas bornées (L5), le modèle excepté.
- **RG3** — `provider` n'est **jamais** lu depuis la base ni modifiable par
  l'API (env/fichier seulement, `mock` = développement) ; `ANTHROPIC_API_KEY`
  n'est jamais stockée ni renvoyée.
- **RG4** — Variables d'environnement : `DEMO_ENABLED` vaut « éteint » pour
  `0`, `false`, `off`, `no` (sans casse) et « allumé » pour toute autre valeur
  non vide ; une variable entière non numérique est ignorée.
- **RG5** — PUT partiel : les champs non envoyés conservent leur surcharge ; un
  patch est validé en entier avant toute écriture.
- **RG6** — L'interrupteur `enabled` coupe la démo LLM **et** l'assistant
  tuteur ; `perIpPerHour` est un quota partagé (même seau `llm:`) avec
  `GET /api/gdoc-text`, refusé avant tout appel amont ; le tuteur applique
  aussi `powDifficultyBits` et `perIpPerHour`, mais dans un seau distinct
  (`tuteur:`) et avec ses propres modèle (un Haiku), `maxTokens` et budget
  (`TUTEUR_*`).
- **RG7** — Journalisation minimale : l'audit ne porte que les **noms** des
  champs envoyés dans le patch (même inchangés) ; un champ renvoyé à
  l'identique devient pourtant une surcharge « base » (qui masquera une
  future variable `DEMO_*`).
- **RG8** — Valeurs du fichier (2026-10-21, à la demande de Christian : « 1 USD
  par jour pour tous les utilisateurs anonymes ou connectés, mais pas plus de
  dépense journalière ») : `dailyBudgetUsd` 1, que partage tout ce qui passe
  par `POST /api/llm`, et que le pire cas de chaque appel, réservé avant qu'il
  parte, ne laisse jamais dépasser (UC-VIS-03 RG4) ; `model` `claude-haiku-5-5`
  (0,10 $ / 0,50 $ le million de jetons, 0,50 $ / 2,50 $ au-delà de 100 000
  jetons d'entrée, pour tout l'appel — le plus haut de la grille des crédits,
  relevée chaque jour, UC-ADM-05 A6, et de la table de `Pricing`) ; `maxInputChars` 2 000 000 — l'appel
  entier, gabarit compris : la synthèse de Twin6 porte les sorties des sept
  scans, qu'aucun plafond ne borne plus, et des scans de 64 000 jetons chacun y
  tiennent (UC-APP-09-U35) —, le texte du visiteur étant borné à 5 000
  caractères par les deux pages ; `perIpPerHour` 20 ; `dailyGlobalTokens`
  6 000 000, un garde-fou qui ne dépend pas des tarifs ; `powDifficultyBits`
  20 ; `upstreamTimeoutSeconds` 150. Une variable `DEMO_*` ou une surcharge
  « base » les remplace (RG1) : en juillet, la production réglait la démo par
  son environnement (Sonnet 5, 8 $ par jour) — le modèle n'y est plus pris
  (RG9). Plus de plafond de sortie (Christian, 2026-10-21 : « Ok pour lever le
  plafond des tokens de sortie. Du moment qu'un utilisateur ne dépense pas plus
  que le budget global alloué au site. Mais si le prompt est déjà passé et les
  tokens déjà dépensés, ne pas limiter sur la longueur de la sortie ») : chaque
  appel demande le maximum du modèle — 128 000 jetons pour Haiku 5.5, 64 000
  pour Haiku 4.5 —, dont le pire cas, ≈ 0,064 $ au tarif de base de Haiku 5.5,
  est réservé avant l'appel ; une réponse n'est jamais coupée pour tenir le
  budget, un appel qu'il ne couvre plus ne part pas. Le réglage
  `maxTokensPerRequest` (16 000 le matin même) n'existe plus, ni
  `DEMO_MAX_TOKENS_PER_REQUEST` ; une valeur restée en base n'est plus lue et
  part au prochain enregistrement.
- **RG9** — Un Haiku seulement (2026-10-21, Christian : « On garde Haiku pour
  les démos. Sonnet et Opus disponibles uniquement pour les comptes ayant
  acheté suffisamment de crédits API ou bien utilisant leur propre clé ») :
  `DemoConfig::load` prend le premier Haiku de base > env > fichier, sinon
  Haiku 5.5, et signale les autres (`modelRefuse`, A7) ; `PUT` d'un modèle qui
  n'est pas un Haiku → `422`. Un Haiku est un identifiant qui commence par
  `claude-haiku-` (`ModelLimits::estHaiku`).
- **RG10** — Le plafond mensuel des crédits offerts (sprint 7, S7a ; TODO :
  « La somme totale des crédits offerts par mois ne doit pas dépasser 20 USD
  pour tous les utilisateurs anonymes et enregistrés du site ») :
  `monthlyFreeUsd`, un nombre de 0 à 1 000 (USD), base >
  `OFFERTS_MENSUEL_USD` > `api/config/demo.php` (20) > 20. Il borne,
  ensemble, tout ce qui passe par `POST /api/llm` et `POST /api/tuteur` sur
  un mois UTC (`Llm\FreeCreditLedger`, UC-VIS-03 RG7, UC-VIS-05 RG8), en plus
  des budgets du jour de la démo et du tuteur, qui restent (jusqu'à 2 $ par
  jour à eux deux, environ 60 $ par mois, quand le plafond en tient 20). Lu à
  chaque requête : un changement s'applique à l'appel suivant, jamais à une
  réponse en cours. `GET /api/admin/demo-config` le rend dans `effective` et
  `sources`, avec `freeCreditsMonth` `{month, capUsd, spentUsd, reservedUsd,
  remainingUsd, calls, refusals, exhausted}`, au mois UTC du serveur
  (`gmdate`, jamais `CURDATE()`).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Surcharges de la démo | `settings.demo_overrides` (JSON), aucune donnée personnelle |
| Clé plateforme Anthropic | Environnement serveur uniquement ; exposée comme booléen |
| Trace des modifications | `audit_events` : `demo_config_updated {fields}`, `demo_config_reset` |
| Visiteurs de la démo | Quotas par seau d'IP haché (`rate_limits`), compteurs journaliers sans contenu (`llm_usage_daily`), grand livre du mois des crédits offerts sans contenu ni compte (`free_credit_monthly`, RG10) |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/admin/ReglagesSection.jsx` — `DemoSettings` | Interrupteur, formulaire, PUT partiel, badges d'origine, messages, état occupé |
| Front | `web/src/views/admin/ConfigSection.jsx` | Configuration serveur versionnée, secrets « configuré / absent » |
| Front | `web/src/views/admin/admin-api.js` — `fetchDemoConfig`, `saveDemoConfig`, `resetDemoConfig`, `toggleDemo`, `fetchSettings` | Appels HTTP |
| Front | `web/src/views/AdminView.jsx`, `web/src/api/client.js` | Garde de rôle, CSRF, erreurs typées |
| API | `api/src/routes/admin.php` — `GET/PUT/DELETE /admin/demo-config`, `GET /admin/settings` | Orchestration, `400` corps illisible, mapping `AdminException` |
| Domaine | `api/src/Admin/DemoConfigService.php` — `read`, `update`, `reset` | Validation, fusion, audit |
| Domaine | `api/src/Llm/DemoConfig.php` — `load`, `sortieMax` | Précédence, origine par champ, fail-safe ; un Haiku seulement (RG9) ; la sortie du modèle |
| Domaine | `api/src/Llm/ModelLimits.php` — `sortieMax`, `estHaiku` | Sortie maximale de chaque modèle Claude, reconnaissance d'un Haiku |
| Domaine | `api/src/Packages/SettingsRepository.php` | Stockage `demo_overrides` |
| Domaine | `api/src/Admin/PlatformStatus.php` — `snapshot` | Instantané `demo` et `config` de `/admin/settings` (secrets réduits à `configured`) |
| Domaine | `api/src/Middleware/RequireRole.php` | Garde `401 « Authentification requise »` / `403 « Rôle insuffisant »` (E1, E2) |
| Domaine | `api/src/Middleware/CsrfMiddleware.php` | `403 « Jeton CSRF absent ou invalide »` (E5) |
| Domaine | `api/src/Llm/UsageCounters.php` — `isExhausted`, `record` | Coupe-circuit journalier (`≥` plafond de tokens ou budget, A1) |
| Domaine | `api/src/Llm/FreeCreditLedger.php` — `state`, `capMicrousd` | Grand livre du mois des crédits offerts, montré à l'administrateur (A8, RG10) |
| Domaine | `api/src/Llm/PowChallenge.php` | Défi de preuve de travail (`difficultyBits`, étape 6) |
| Domaine | `api/src/Auth/RateLimiter.php` | Quota horaire par seau d'IP haché (`perIpPerHour`) |
| Domaine | `api/src/Auth/Audit.php` | Journal `demo_config_updated` / `demo_config_reset` |
| API (effet) | `api/src/routes/llm.php`, `api/src/routes/tuteur.php`, `api/src/routes/system.php` (`/status`) | Application des réglages côté visiteur |
| Config | `api/config/demo.php`, `api/config/app.php` | Couche « fichier », documentation des variables |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-ADM-04-U01 | `DemoConfigService::read` | 10 valeurs (dont la sortie, en lecture seule), origines, modèles refusés, liste de Haiku, clé en booléen seulement | `api/tests/UseCases/Unit/UcAdm04ConfigurerDemoTest.php` |
| UC-ADM-04-U02 | `DemoConfigService::update` | Fusion de patchs partiels, modèle rogné, audit des noms (RG5, RG7) | idem |
| UC-ADM-04-U03 | `DemoConfigService::update` | Bornes entières inclusives, hors bornes et non-entiers → 422 (RG2) | idem |
| UC-ADM-04-U04 | `DemoConfigService::update` | Budget réel 0–1000, entier converti | idem |
| UC-ADM-04-U05 | `DemoConfigService::update` | Modèle libre s'il est un Haiku, motif, 100 caractères max, jamais vide ; Sonnet, Opus ou Fable → 422 (RG9) | idem |
| UC-ADM-04-U06 | `DemoConfigService::update` | Booléen, champ inconnu, fournisseur, patch vide ; tout ou rien | idem |
| UC-ADM-04-U07 | `DemoConfigService::reset` | Retour env/fichier, audit, idempotent | idem |
| UC-ADM-04-U08 | `DemoConfig::load` | Précédence base > env > fichier par champ (RG1) | idem |
| UC-ADM-04-U09 | `DemoConfig::load` | Lecture de `DEMO_ENABLED`, entier non numérique ignoré, `DEMO_PROVIDER` (RG4) | idem |
| UC-ADM-04-U10 | `DemoConfig::load` | Types invalides en base ignorés, `provider` en base ignoré (RG1, RG3) | idem |
| UC-ADM-04-U11 | `DemoConfig::load` | Base non configurée → pas de couche base, sans erreur | idem |
| UC-ADM-04-U12 | `PlatformStatus::snapshot` (AN-1) | Comportement actuel : `demo.editableInUi = false` | idem |
| UC-ADM-04-U21 | `PlatformStatus::snapshot` (A4) | Secrets de `config/app.php` réduits à `configured`, jamais de `value` ; clé et jeton absents du JSON | idem |
| UC-ADM-04-U22 | `DemoConfig::databaseOverrides` (A3) | Base configurée mais injoignable (127.0.0.1:1) : exception captée, journal `[demo-config] overrides unavailable`, repli env/fichier | idem |
| UC-ADM-04-U23 | `DemoConfig::load` (L5) | Comportement actuel : `DEMO_*` non bornées (0 bit, `-1`, `12.7` → 12) | idem |
| UC-ADM-04-U24 | `DemoConfigService::update` (RG7) | Champ renvoyé à l'identique : surcharge « base » créée, audit `{fields}` quand même | idem |
| UC-ADM-04-U28 | `DemoConfig::load` (RG9) | Un Haiku seulement : le premier Haiku des couches, sinon Haiku 5.5 ; un Sonnet ou un Opus d'une couche refusé et signalé | idem |
| UC-ADM-04-U29 | `DemoConfig::sortieMax`, `DemoConfigService::update` (RG8) | La sortie est le maximum du modèle (128 000 pour Haiku 5.5, 64 000 pour Haiku 4.5) ; `maxTokensPerRequest`, en base ou en env, n'est plus lu et quitte la base au prochain enregistrement | idem |
| UC-ADM-04-U30 | `DemoConfig::load`, `DemoConfigService::update`, `read` (RG10) | `monthlyFreeUsd` : 20 $ du fichier, `OFFERTS_MENSUEL_USD` par-dessus (une valeur non numérique ignorée), la base par-dessus tout ; de 0 à 1 000, un nombre ; `read($now)` rend le grand livre du mois UTC en dollars (dépensé, réservé, restant, appels, refus), un mois neuf le 1er à 0 h UTC | `api/tests/UseCases/Unit/UcAdm04ConfigurerDemoTest.php` |
| UC-ADM-04-U13 | `fetchDemoConfig`, `saveDemoConfig`, `resetDemoConfig` | URL, méthodes, corps, CSRF sur mutations | `web/test/usecases/unit/uc-adm-04-configurer-demo.test.jsx` |
| UC-ADM-04-U14 | `toggleDemo` | `PUT api/admin/demo-config` (méthode et URL vérifiées) avec `{enabled}` booléen seul | idem |
| UC-ADM-04-U31 | `ReglagesSection` (A8, RG10) | Champ « Crédits offerts / mois (USD) » (valeur, bornes 0 – 1000, pas de 0,01), PUT partiel `{monthlyFreeUsd: 0}` ; la ligne du grand livre du mois, « Épuisés » au plafond ; une API qui ne le donne pas ne montre ni le champ ni la ligne | `web/test/usecases/unit/uc-adm-04-configurer-demo.test.jsx` |
| UC-ADM-04-U15 | `ReglagesSection` | PUT partiel des seuls champs modifiés, nombres | idem |
| UC-ADM-04-U16 | `ReglagesSection` | Modèle hors liste → « autre… » ; rien à enregistrer | idem |
| UC-ADM-04-U17 | `ReglagesSection` | État occupé : interrupteur et boutons inactifs | idem |
| UC-ADM-04-U18 | `ReglagesSection` (L2) | Comportement actuel : décimale tronquée dans un champ entier | idem |
| UC-ADM-04-U19 | `ConfigSection` | Groupes, secrets « configuré / absent », défaut affiché | idem |
| UC-ADM-04-U20 | `ConfigSection` | Erreurs de chargement (copie statique, erreur serveur) | idem |
| UC-ADM-04-U25 | `ReglagesSection` (E3 client) | « autre… » + identifiant vidé → « Le modèle ne peut pas être vide. », aucun PUT | idem |
| UC-ADM-04-U26 | `ReglagesSection` (E3 client) | Brouillon non numérique → « Valeur invalide pour « … » » ; « 2,5 » dans un champ number assaini en vide → « Champ vide » | idem |
| UC-ADM-04-U27 | `ReglagesSection` (AN-2) | Comportement actuel : basculer l'interrupteur écrase la saisie non enregistrée | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-ADM-04-F01 | Nominal (1-3, 5) | API | Lecture, PUT partiel, origine « base », audit | `api/tests/UseCases/Functional/UcAdm04ConfigurerDemoTest.php` |
| UC-ADM-04-F02 | Nominal (4) | API | Interrupteur : `503` démo + tuteur, status/santé, puis rallumage | idem |
| UC-ADM-04-F03 | Nominal (6) | API | PoW 8 bits, `413` taille, appel mock `200`, `429` quota, puis `429` sur `GET /api/gdoc-text` (quota partagé, RG6) | idem |
| UC-ADM-04-F04 | A1 | API | Budget 0 → `remainingToday` faux, `503` « Démo épuisée » | idem |
| UC-ADM-04-F05 | A2 | API | Base > env, puis DELETE → env/fichier, démo rallumée, audit | idem |
| UC-ADM-04-F06 | A3 | API | Base injoignable (127.0.0.1:1, sans DNS) → `/api/llm/status` et `/api/llm/challenge` `200` sur env/fichier ; `POST /api/llm`, `/api/tuteur`, admin → `500` ; `/api/status` `db: "error"` ; surcharge conservée | idem |
| UC-ADM-04-F07 | E1, E2 | API | `401 « Authentification requise »` / `403 « Rôle insuffisant »` sur GET, PUT et DELETE ; rien d'écrit ni supprimé | idem |
| UC-ADM-04-F08 | E3 | API | `422` + message exact pour 9 patchs invalides (dont `maxTokensPerRequest` et un Opus), rien d'écrit | idem |
| UC-ADM-04-F09 | E4 | API | `400` corps non JSON, `422` corps vide | idem |
| UC-ADM-04-F10 | E5 | API | `403 « Jeton CSRF absent ou invalide »` sans jeton et avec un jeton faux, sur PUT et DELETE ; configuration intacte | idem |
| UC-ADM-04-F20 | Nominal (6) | API | Fournisseur `anthropic` + client HTTP simulé : `model` et délai amont de la requête = réglages de l'admin, `max_tokens` = toute la sortie du modèle | idem |
| UC-ADM-04-F21 | A1 | API | `dailyGlobalTokens` 10 000 : 9 999 consommés → reste ; 10 000 → `remainingToday` faux, `503` | idem |
| UC-ADM-04-F22 | A4 | API | `GET /api/admin/settings` : secrets `configured` sans valeur, clé absente du corps ; non-admin → `403` | idem |
| UC-ADM-04-F23 | A7, RG9 | API | Le Sonnet 5 du `.env` de juillet est refusé et nommé, la démo appelle Haiku 5.5 avec toute sa sortie ; un `PUT` Sonnet ou Opus → `422`, rien d'écrit | idem |
| UC-ADM-04-F24 | A8, RG10 | API | Plafond mensuel : 20 $ (fichier), `OFFERTS_MENSUEL_USD` (env), `PUT {monthlyFreeUsd: 0}` (base) → l'Essayer et le tuteur répondent aussitôt `503` « Les crédits offerts de ce mois sont épuisés ; revenez le 1er … » (`offerts_epuises`), `remainingThisMonth` faux ; `GET` montre le grand livre (1 appel, 2 refus, épuisé) ; 1 000,01, −1, texte, `null` → `422` ; Réinitialiser → l'environnement | `api/tests/UseCases/Functional/UcAdm04ConfigurerDemoTest.php` |
| UC-ADM-04-F11 | Nominal (1-4) | IHM | `<App/>` : interrupteur → PUT `{enabled:false}` + CSRF, message, badge | `web/test/usecases/functional/uc-adm-04-configurer-demo.test.jsx` |
| UC-ADM-04-F12 | Nominal (5) | IHM | Modèle (un Haiku) + entrée max → PUT partiel, message, badges « réglage base », sortie du modèle affichée | idem |
| UC-ADM-04-F13 | A2 | IHM | Réinitialiser → DELETE, message, retour au fichier | idem |
| UC-ADM-04-F14 | E3 | IHM | `422` serveur → alerte, rien appliqué | idem |
| UC-ADM-04-F15 | E3 (client) | IHM | Champ vide → alerte locale, aucun PUT | idem |
| UC-ADM-04-F16 | E5 | IHM | CSRF refusé → alerte, interrupteur inchangé | idem |
| UC-ADM-04-F17 | A4 | IHM | `#/admin/config` : secrets « configuré / absent », défaut affiché | idem |
| UC-ADM-04-F18 | E1, E2 | IHM | Visiteur (« Vous n'êtes pas connecté ») puis compte non admin : espace réservé, aucune lecture | idem |
| UC-ADM-04-F19 | A6, A5 | IHM | Modèle hors liste → « autre… » + valeur ; Enregistrer sans modification → « Aucune modification à enregistrer. », aucun PUT | idem |

### Tests existants liés (non-régression)

- `api/tests/AdminDemoConfigTest.php` — précédence, PUT partiel, bornes, reset, fail-safe, CSRF, audit sans valeurs.
- `api/tests/AdminSettingsTest.php` — instantané `/admin/settings`, secrets masqués.
- `api/tests/LlmProxyTest.php`, `api/tests/LlmPowTest.php`, `api/tests/TuteurTest.php` — garde-fous de la démo et du tuteur.
- `api/tests/StatusTest.php` — page de santé publique.
- `web/src/views/admin/ReglagesSection.test.jsx` (dont le modèle refusé, A7, et la sortie du modèle), `web/src/views/AdminView.test.jsx`.

### Exécuter

```sh
(cd api && vendor/bin/phpunit --filter UcAdm04 --testdox)
cd web && npx vitest run test/usecases/unit/uc-adm-04 test/usecases/functional/uc-adm-04
```

## Anomalies constatées

- **AN-1 — Instantané des réglages obsolète.** `GET /api/admin/settings`
  (`PlatformStatus::snapshot`) renvoie `demo.editableInUi: false` et un bloc
  `demo` sans `upstreamTimeoutSeconds`, vestiges de la v1 « démo réglée par
  l'environnement », alors que la démo est éditable (`/admin/demo-config`).
  Sans effet visible (l'IHM lit `/admin/demo-config`), mais trompeur pour un
  client de l'API. Figé par UC-ADM-04-U12.
- **AN-2 — Basculer l'interrupteur efface les saisies non enregistrées.** Dans
  `ReglagesSection`, chaque réponse de mutation (interrupteur,
  réinitialisation) remplace `config`, et l'effet
  `useEffect(() => setDraft(draftFrom(config)), [config])` réécrit tout le
  brouillon du formulaire : un administrateur qui modifie le modèle ou des
  plafonds sans enregistrer, puis bascule l'interrupteur, perd ses saisies sans
  avertissement (le `PUT` ne porte que `{enabled}`). Correctif suggéré : ne
  réinitialiser que les champs non modifiés, ou avertir avant la bascule.
  Figé par UC-ADM-04-U27.

## Limites

- **L1** — L'origine `defaut` est inatteignable avec le fichier versionné :
  `api/config/demo.php` définit toutes les clés, donc sans surcharge ni
  variable, chaque champ vient du « fichier ».
- **L2** — Le formulaire convertit les champs entiers par `parseInt` : une
  saisie décimale (`12.7`) part tronquée (`12`) sans avertissement (figé par
  UC-ADM-04-U18) ; les bornes affichées ne sont que des repères (`noValidate`),
  la validation fait foi côté serveur.
- **L3** — La section charge `/admin/settings`, `/prompt-packages` et
  `/admin/demo-config` ensemble : l'échec de l'un masque tout le bloc
  (« Chargement impossible. »).
- **L4** — `DEMO_ENABLED` : toute valeur non vide autre que `0/false/off/no`
  allume la démo (ex. `non`), à connaître en éditant le `.env`.
- **L5** — Les variables `DEMO_*` numériques (et le fichier) ne sont pas
  bornées : `DemoConfig::load` accepte toute valeur `is_numeric` convertie par
  `(int)`/`(float)` — `DEMO_POW_DIFFICULTY_BITS=0` neutralise la preuve de
  travail, une valeur négative passe, `DEMO_PER_IP_PER_HOUR=12.7` donne `12`
  (figé par UC-ADM-04-U23). Seule la couche « base » est validée (RG2).
