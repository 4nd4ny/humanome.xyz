# Administration (P12.1)

Module d'administration de humanome.xyz : cahier des charges §3.8 (rôle
administrateur), §4.10 (module administration), §6 (RGPD) et §7 (modèle
économique / Golden Prompt). Livré au jalon M9.

L'administration se présente sous deux formes complémentaires :

1. **Une UI d'administration** (`#/admin`), servie par une **API SESSION admin**
   (`RequireRole::any('admin')`), pour les opérations courantes : rôles, Golden
   Prompt, réglages.
2. **Un fichier de configuration versionnable** (`api/config/app.php`) pour la
   configuration serveur — conforme à la note du cahier « une interface
   d'administration simple (un fichier de configuration édité à la main) suffit
   en v1 ».

> ⚠️ Ne pas confondre avec l'outillage de **déploiement** (`routes/system.php`,
> `routes/packages.php`, `routes/worker.php`) protégé par le jeton
> `X-Migrate-Token` (ADR-008, script de déploiement uniquement) :
> `POST /api/admin/migrate`, `/api/admin/grant-role`, `/api/admin/default-package`,
> `/api/admin/import-*`, `/api/admin/worker-tick` et `/api/admin/maintenance` (qui
> acceptent aussi le jeton du déclencheur externe, `WORKER_TICK_TOKEN` ; la
> maintenance depuis le 2026-10-22). Ces routes existent pour le
> pilotage hors-navigateur d'un hébergement sans SSH ; l'UI d'administration,
> elle, s'appuie sur une **vraie session** avec le rôle `admin` et le CSRF.

Le rôle `admin` **n'est pas un super-rôle implicite** ailleurs dans
l'application (voir `docs/autorisations.md`) : les routes `/api/admin/*` de
session ci-dessous sont l'unique surface d'administration.

---

## 1. Rôles — comptes et attribution

Section `#/admin/roles`. Permet de lister les comptes et leurs rôles, puis
d'attribuer ou de retirer les **rôles du référentiel §2** (`apprenant`,
`cartographe`, `promptologue`, `epistemiarque`, `employeur`, `etablissement`,
`admin` — le « visiteur » est l'absence de session, jamais un rôle attribuable).

| Méthode | Route | Effet |
|---|---|---|
| `GET` | `/api/admin/users?query=&page=` | Comptes + rôles, recherche e-mail/nom, pagination (20/page). |
| `POST` | `/api/admin/users/{id}/roles` `{role}` | Attribue un rôle (idempotent). |
| `DELETE` | `/api/admin/users/{id}/roles/{role}` | Retire un rôle (idempotent). |

- Les rôles sont relus en base **à chaque requête** : un changement de rôle est
  effectif immédiatement (aucune reconnexion nécessaire).
- **Anti-verrouillage** : un administrateur **ne peut pas retirer son propre
  rôle admin** (409). La plateforme conserve donc toujours au moins
  l'administrateur agissant. Un admin peut retirer le rôle admin d'un *autre*
  compte, et peut retirer un rôle *non-admin* de lui-même. L'UI masque le
  bouton de retrait correspondant (🔒).
- **Audit (§6.5)** : chaque attribution/retrait laisse un événement
  (`role_granted` / `role_revoked`) contenant l'identifiant cible et le nom du
  rôle (valeur du référentiel §2, non-PII) — **jamais l'e-mail**. L'acteur est
  l'administrateur de la session (contrairement à l'outillage jeton, qui laisse
  l'acteur nul).

### Amorçage : créer le premier administrateur

L'UI d'administration (`#/admin`) exige déjà un compte `admin` en session ;
mais **aucun compte n'est admin par défaut** (le premier inscrit reçoit
`apprenant`, et `admin` n'est pas un super-rôle implicite). Le tout premier
administrateur se crée donc **hors navigateur**, avec l'outillage de
déploiement à jeton `X-Migrate-Token` (le même que les migrations, ADR-008).

1. Créer d'abord le compte normalement sur le site (inscription → e-mail +
   mot de passe).
2. Attribuer le rôle `admin` à cet e-mail. Le jeton `MIGRATE_TOKEN` est celui
   de `~/app/shared/.env` en production (jamais dans le dépôt ; en local, il est
   dans `.env.deploy`) :

   ```bash
   curl -X POST https://humanome.xyz/api/admin/grant-role \
     -H "X-Migrate-Token: $MIGRATE_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"email":"vous@exemple.org","role":"admin"}'
   ```

   Réponses : `{"status":"granted"}` (attribué), `{"status":"unchanged"}` (déjà
   en place), `404` (compte inconnu — vérifier l'inscription), `403` (mauvais
   jeton), `422` (rôle inconnu).
3. Se **reconnecter** : la rubrique `#/admin` apparaît (les rôles sont relus à
   chaque requête, mais la nav du client se recalcule à la connexion).

Les rôles suivants (`cartographe`, `promptologue`, `epistemiarque`,
`etablissement`, et d'autres `admin`) se donnent de la même façon en changeant
`role`, **ou**, une fois un premier admin en place, depuis l'UI
`#/admin/roles` (section 1 ci-dessus) — plus besoin du jeton.

> Sécurité : cette route existe pour l'amorçage d'un hébergement **sans SSH**.
> Elle n'expose jamais d'e-mail dans l'audit (seuls l'identifiant cible et le
> nom du rôle). Ne partagez pas `MIGRATE_TOKEN` ; il donne aussi accès aux
> migrations et aux imports.

---

## 2. Golden Prompt (cahier §7)

Section `#/admin/golden`. Le **Golden Prompt** est la version « haut de gamme »
du prompt de cartographie, longuement travaillée, gardée **privée** jusqu'à
constitution du capital de la Fondation (cahier §7).

**Modélisation.** Un Golden Prompt est un `prompt_packages` normal, marqué
`is_private = 1` (migration 010). La confidentialité est une propriété du
*paquet* (toutes ses versions la partagent).

**Importé hors git.** Son contenu ne vit **que** dans la base de données ; il
n'est jamais commité dans le dépôt. L'import se fait par
`POST /api/admin/golden {document}` (coller le document prompt-package dans
l'UI). Idempotent par hash de contenu ; une version publiée est immuable (409
si un contenu différent réutilise `(id, version)`). Refuse de masquer un paquet
public partageant le slug (409).

**Jamais exposé.** Tous les chemins de lecture publics du module prompt-package
filtrent `is_private = 0`, donc un Golden Prompt est **structurellement
invisible** :

- `GET /api/prompt-packages` — non listé ;
- `GET /api/prompt-packages/default` — jamais servi comme défaut ;
- `GET /api/prompt-packages/{id}/{version}` — 404 ;
- `POST …/propose-default` (via `isPublished`) — 404, non proposable ;
- lancement de masse (`isPublished`/`findPublished`) — non exécutable ;
- `POST /api/prompt-packages/drafts` (dérivation) — **non dérivable** par un
  promptologue (404 à la source).

**Autorisation au cas par cas.** L'administrateur autorise un promptologue
donné via `POST /api/admin/golden/{id}/grant {userId}` (le compte cible doit
porter le rôle `promptologue`, 422 sinon). L'autorisation est enregistrée dans
`golden_grants` ; `GET /api/admin/golden` liste les Golden et leurs
promptologues autorisés. Audit : `golden_imported`, `golden_access_granted`.

> La *consommation* d'un Golden autorisé (comparaison au banc d'essai
> promptologue, cahier §3.4) se branche sur `golden_grants` — le modèle
> d'autorisation est livré ici ; l'endpoint de lecture contrôlé par grant est un
> ajout ultérieur côté promptologue.

**RGPD (`golden_grants`).** `package_id`/`user_id` en CASCADE (le grant meurt
avec le paquet ou le compte purgé) ; `granted_by` en SET NULL (l'admin peut
être purgé, la trace datée survit sans l'identifier).

---

## 3. Réglages plateforme

Section `#/admin/reglages`. `GET /api/admin/settings` renvoie un instantané
(affichage), `POST /api/admin/settings/default-package {id, version}` valide le
paquet par défaut, et la **démo publique s'édite** via `/api/admin/demo-config`
(chantier A).

- **Version de prompt par défaut** (réutilise `settings.default_prompt_package`,
  P10) : le promptologue **propose** (`propose-default`), l'administrateur
  **valide**. La cible doit être **publiée et non-privée** (un Golden ne peut
  jamais devenir le défaut, 404 sinon). L'instantané expose la valeur stockée,
  la proposition en attente, et la résolution effective (défaut = dernier
  publié non-privé). Audit : `default_package_set`.
- **Démo publique — éditable, effet immédiat** (chantier A) : les réglages
  sont stockés dans `settings["demo_overrides"]` et **gagnent sur tout le
  reste** (`base > env DEMO_* > config/demo.php > défauts codés`), sans
  redéploiement. Cas d'usage : activer/désactiver la démo d'un geste depuis
  un smartphone (grand interrupteur en tête de section). Fail-safe : base
  absente ou injoignable → retour silencieux à env/fichier (la démo ne tombe
  jamais à cause de cette couche).
- **Liste d'attente des inscriptions** (sprint 7, S7a-2) : sous le grand
  livre du mois, l'état des inscriptions (ouvertes, ou en liste d'attente
  quand le plafond moins le dépensé ne couvre plus le plus petit appel de
  l'Essayer), les comptes qui attendent dans l'ordre d'inscription, « Lever »
  un compte et « Tout lever » ; chaque compte levé reçoit son code
  d'activation par courriel. Sans geste, la liste est levée au 1er du mois
  suivant (UTC). API ci-dessous ; contrat : `docs/contrats.md` §13.1.
- **État du worker de masse** : dérivé de `mass_jobs` — « jobs en file »
  (en attente + en cours), compte par statut, runs actifs, et **dernière
  activité** (`MAX(updated_at)`, approximation du « dernier tick » : les ticks
  ADR-005 ne tiennent pas de journal, ils ne renvoient que des compteurs).

### API démo publique (session admin + CSRF)

| Méthode | Route | Effet |
|---|---|---|
| `GET` | `/api/admin/demo-config` | `{effective, sources, modelRefuse, allowedModels, apiKeyConfigured, freeCreditsMonth}`. |
| `PUT` | `/api/admin/demo-config` `{champs partiels}` | Valide (bornes ci-dessous, 422 sinon) et **fusionne** dans `demo_overrides`. Renvoie le nouvel état. Audit : `demo_config_updated` (noms de champs seulement). |
| `DELETE` | `/api/admin/demo-config` | Supprime `demo_overrides` (retour env/fichier). Audit : `demo_config_reset`. |

- `effective` : valeurs réellement appliquées par le proxy (`enabled`, `provider`,
  `model`, `maxInputChars`, `perIpPerHour`, `dailyGlobalTokens`,
  `dailyBudgetUsd`, `powDifficultyBits`, `upstreamTimeoutSeconds`,
  `monthlyFreeUsd`), et `sortieMax`, qui n'est pas un réglage : la sortie que chaque appel demande, le
  maximum du modèle (128 000 jetons pour Haiku 5.5, `Llm\ModelLimits`), sans
  plafond depuis le 2026-10-21 — son pire cas est réservé sur le budget du jour
  avant l'appel (`docs/securite-demo.md`, angle 3).
- `sources` : origine de chaque valeur — `base` (réglage admin), `env`,
  `fichier` (`config/demo.php`) ou `defaut`. L'UI l'affiche en badge.
- `monthlyFreeUsd` (sprint 7) : le plafond **mensuel** des crédits offerts,
  ce que l'instance paie sans le facturer sur un mois UTC — tout
  `POST /api/llm` et l'assistant tuteur ensemble —, en plus des budgets du
  jour ; 20 $ par défaut (`OFFERTS_MENSUEL_USD`) ; 0 ferme tout ce qui est
  offert. `freeCreditsMonth` en donne le grand livre du mois :
  `{month, capUsd, spentUsd, reservedUsd, remainingUsd, calls, refusals,
  exhausted, signupsOpen, signupFloorUsd}` (`docs/contrats.md` §13) :
  `signupsOpen` faux, une nouvelle inscription part en liste d'attente, dès
  que le plafond moins le dépensé est sous `signupFloorUsd`, le pire cas du
  plus petit appel de l'Essayer (§13.1). `reservedUsd` : les appels en cours ;
  une réserve que son processus n'a jamais réglée (tué en route) expire au bout
  de 15 minutes et passe dans `spentUsd`, à son pire cas (§13).
- `modelRefuse` : les modèles des couches qui ne sont pas un Haiku
  (`[{valeur, source}]`), refusés ; la démo prend le premier Haiku des couches,
  sinon Haiku 5.5, et l'UI nomme le modèle refusé. C'est le cas du `.env` de
  production de juillet, qui nomme Sonnet 5.
- **Bornes** (422 hors bornes ou type invalide) : `dailyBudgetUsd` 0–1000 ;
  `monthlyFreeUsd` 0–1000 ;
  `perIpPerHour` 1–1000 ; `powDifficultyBits` 8–24 ; `dailyGlobalTokens`
  10000–50000000 ; `upstreamTimeoutSeconds` 10–300 (sous les 165 s qu'OVH
  laisse à un script tant que la recette n'a pas mesuré mieux : un script arrêté
  avant son issue garde sa réservation entière ; coupé par ce délai, un appel
  compte ce qu'il a produit) ; `maxInputChars`
  1000–4000000 ; `model` non vide (lettres/chiffres/points/tirets, ≤ 100
  caractères) **et un Haiku** — un Sonnet ou un Opus reçoit un 422 : ils sont
  réservés aux comptes qui ont acheté des crédits ou qui utilisent leur propre
  clé (Christian, 2026-10-21). `maxTokensPerRequest` n'existe plus : 422, et une
  valeur restée en base part au prochain enregistrement.
- `allowedModels` : les Haiku proposés en menu déroulant ; l'UI offre aussi
  « autre… » (texte libre, un Haiku aussi) — un nouveau Haiku est utilisable le
  jour de sa sortie, sans redéploiement.
- **Non éditables, volontairement** : `provider` (la démo utilise la clé
  plateforme Anthropic ; `mock` = dev uniquement) et `ANTHROPIC_API_KEY`
  (environnement serveur exclusivement — l'API ne renvoie que le booléen
  `apiKeyConfigured`, jamais la valeur).

### API liste d'attente des inscriptions (session admin + CSRF, sprint 7)

| Méthode | Route | Effet |
|---|---|---|
| `GET` | `/api/admin/waitlist` | Lève d'abord les comptes dont l'attente est finie (c'est une requête du mois), puis `{month, signupsOpen, nextLift, total, accounts}` (200 comptes au plus, ordre d'inscription). |
| `POST` | `/api/admin/waitlist/{id}/lift` | Lève un compte : `{id, status: lifted\|unchanged}`, 404 « Compte introuvable ». Son code part par courriel. Audit : `waitlist_lifted` `{targetUserId}`. |
| `POST` | `/api/admin/waitlist/lift` | « Tout lever », dans l'ordre d'inscription, 200 comptes au plus par appel : `{lifted, remaining}`. |

Le monitoring (`GET /api/admin/monitoring`) ne fait que compter la liste
(`utilisateurs.enListeAttente`) : il n'écrit rien.

---

## 4. Configuration serveur versionnable (`api/config/app.php`)

Section `#/admin/config`. Le fichier `api/config/app.php` documente, en un seul
endroit versionné, les variables d'environnement lues par l'application et
leurs valeurs par défaut. Chaque valeur est surchargeable par variable
d'environnement (`~/app/shared/.env` hors webroot en prod ; `.env.dev` exporté
en dev, `INSTALL.md` §2) — la variable, si non vide, gagne.

`TWIN6_UPSTREAM_TIMEOUT` (150 s, de 10 à 900) y règle le délai d'un appel de la
cartographie ouverte sur crédits : coupé, l'appel est facturé pour ce qu'il a
produit (UC-APP-09 E11, RG12) ; sous les 165 s qu'OVH laisse à un script tant
que la recette n'a pas mesuré mieux (`docs/recette-twin9.md`, 5.3c), comme celui
de la démo.

**Le fichier ne contient jamais de secret.** Les secrets (mot de passe MySQL,
`ANTHROPIC_API_KEY`, `MIGRATE_TOKEN`, `WORKER_TICK_TOKEN`, `POW_SECRET`, `SODIUM_MASTER_KEY`) et le
**Golden Prompt** restent hors git, dans `~/app/shared/.env` et la base. Pour
les entrées secrètes, `GET /api/admin/settings` et l'UI n'exposent que l'état
`configuré`/`absent`, **jamais la valeur**.

---

## Migration 010

`scripts/migrations/010_admin_golden.sql` (forward-only, expand — ADR-008) :

- `ALTER TABLE prompt_packages ADD COLUMN is_private TINYINT(1) NOT NULL
  DEFAULT 0` : tous les paquets existants restent publics ; seul l'import
  Golden pose `is_private = 1`.
- `CREATE TABLE golden_grants (package_id, user_id, granted_by, created_at)`.

## Tests

- PHP : `AdminUsersTest` (liste/recherche/pagination, grant/revoke, garde de
  rôle 401/403, anti-verrouillage, audit), `AdminGoldenTest` (import privé,
  **non-exposition sur les 5 chemins publics**, grant promptologue, audit),
  `AdminSettingsTest` (instantané, défaut publié/non-privé, secrets masqués),
  `AdminDemoConfigTest` (précédence base > env > fichier, PUT partiel + effet
  sur `DemoConfig::load()`, bornes 422, DELETE/reset, toggle `enabled`, garde
  401/403, clé API jamais exposée).
- Web : `AdminView.test.jsx` (garde de rôle), `admin/RolesSection.test.jsx`
  (tableau, attribution, retrait, anti-verrouillage),
  `admin/ReglagesSection.test.jsx` (interrupteur démo, modèle menu + texte
  libre, PUT partiel, 422, badges d'origine, réinitialisation).
