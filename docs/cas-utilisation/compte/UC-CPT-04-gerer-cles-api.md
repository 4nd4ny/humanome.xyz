# UC-CPT-04 — Gérer ses clés API (dans le navigateur ; supprimer celles gardées sur le serveur)

| Champ | Valeur |
|---|---|
| **Acteur principal** | Tout utilisateur qui lance des cartographies avec sa propre clé de fournisseur LLM (apprenant le plus souvent) ; un compte qui avait gardé une clé sur le serveur avant l'ADR-013 |
| **Acteurs secondaires** | Fournisseur LLM choisi (Anthropic, OpenAI, Google, OpenRouter, xAI, Ollama local), appelé **directement par le navigateur** ; administrateur, pour la purge des clés gardées (script d'administration, A7) |
| **Portée** | humanome.xyz — étape « Fournisseur » de l'assistant `#/espace/nouveau-run` ; voie « clé perso » de `#/twin6-ouverte` (UC-APP-09) ; section « Clés API » de `#/compte` ; `GET /api/keys`, `GET`/`DELETE /api/keys/{provider}`, `PUT /api/keys` (`410`) ; `scripts/purger-cles-utilisateurs.php` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §4.5 (« clé API personnelle optionnelle »), §5, §6.2 ; ADR-001 (exécution dans le navigateur), ADR-004 (amendé), **ADR-013** §1 (règle R1 de Christian), §2 a, §5, §7, §8 |
| **Statut** | Implémenté (P8) ; politique de l'ADR-013 depuis le 2026-10-22 (sprint 6, lot S6a) : la clé reste dans le navigateur, plus aucune n'est écrite sur le serveur, celles gardées avant sont « à supprimer » |

## Objectif

Utiliser sa propre clé API pour cartographier sans la ressaisir, **sans que
humanome ne la garde jamais** : la clé vit dans ce navigateur et ne part que
vers le fournisseur choisi (règle R1 de Christian, ADR-013). Seule une école
garde la sienne sur le serveur, pour ses élèves (UC-ETA-02, lot S6b). Les clés
qu'un compte avait gardées sur le serveur avant ce changement ne servent plus à
aucune analyse : la page du compte les montre « à supprimer », permet de les
recopier dans ce navigateur puis de les supprimer, et un script
d'administration les purge après un avis par courriel.

## Déclencheur

L'utilisateur arrive à l'étape « Fournisseur » de l'assistant de run en mode
« Clé personnelle » (ou à la voie « clé perso » de la cartographie ouverte) ;
ou il ouvre la section « Clés API » de son profil ; ou l'administrateur lance
le script de purge (A7).

## Préconditions

- Clé dans le navigateur : aucune (fonctionne sans compte).
- Section du profil : session ouverte (UC-CPT-02) et clé maîtresse
  `SODIUM_MASTER_KEY` configurée hors webroot (pour lire les clés gardées).

## Garanties en cas de succès

- La clé est dans `localStorage['humanome-keys']` (table fournisseur → clé) et
  ne quitte le navigateur que vers le fournisseur choisi ; aucune requête vers
  humanome ne la porte.
- Une clé gardée avant l'ADR-013 est recopiée dans ce navigateur **avant**
  d'être supprimée du serveur, ou supprimée tout de suite : la suppression est
  réelle.
- La purge n'efface que les clés avisées depuis 30 jours au moins, d'un compte
  sans run en cours sur elle, après l'annulation puis l'effacement chez
  Anthropic des lots soumis avec elle.

## Garanties minimales (en cas d'échec)

- Jamais de clé en clair en base, dans une liste, dans un journal, dans un
  cache HTTP ni dans un courriel.
- Aucune clé d'utilisateur n'est plus écrite sur le serveur : `PUT /api/keys`
  répond `410` à tout compte, le corps jamais lu.
- Une recopie qui échoue (clé illisible, navigateur qui ne la garde pas) ne
  supprime rien du serveur.
- Stockage non configuré : `503` explicite sur les routes des clés, le reste
  de l'API fonctionne. Un chiffré illisible donne `404`, jamais `500` ni fuite.

## Scénario nominal — la clé dans le navigateur (assistant de run)

1. À l'étape « Fournisseur », mode « Clé personnelle », l'utilisateur choisit
   un fournisseur ; le champ « Clé API » (masqué) est pré-rempli depuis
   `localStorage['humanome-keys']`.
2. La page dit : « Votre clé reste dans ce navigateur : humanome ne la garde
   jamais sur ses serveurs. Seule une école peut y garder la sienne, pour ses
   élèves. » Elle ne propose plus ni de la synchroniser sur le serveur ni de
   l'y récupérer.
3. « Mémoriser la clé dans ce navigateur » est coché par défaut ; au
   lancement, la clé est mémorisée localement puis transmise au seul
   fournisseur (appel direct depuis le navigateur). Aucun appel à `/api/keys`,
   connecté ou non.

## Scénarios alternatifs

- **A1 — Les clés gardées avant, « à supprimer »** (page du compte) : la section
  « Clés API » dit la règle R1 (étape 2) et qu'une clé se saisit au lancement ;
  elle n'a plus de formulaire d'ajout. Elle appelle `GET /api/keys` et liste
  chaque clé encore gardée — « à supprimer — gardée le AAAA-MM-JJ », et, si
  l'avis de purge est parti (`avisPurgeAt`), « supprimée d'office à partir du
  AAAA-MM-JJ » (30 jours après l'avis) —, ou « Aucune clé gardée sur le
  serveur. ». Ces clés ne servent plus à aucune analyse.
- **A2 — Recopier dans ce navigateur, puis supprimer** : `GET
  /api/keys/{provider}` (propriétaire seul, `no-store`) ; la clé est écrite dans
  `localStorage['humanome-keys']`, relue pour vérifier, puis `DELETE
  /api/keys/{provider}` ; « Clé <fournisseur> recopiée dans ce navigateur, puis
  supprimée du serveur. », liste rechargée. L'assistant de run et la
  cartographie ouverte la pré-remplissent ensuite.
- **A3 — Supprimer du serveur** : `DELETE /api/keys/{provider}` → `204` ;
  « Clé <fournisseur> supprimée du serveur. », liste rechargée. La clé locale
  éventuelle n'est pas touchée.
- **A4 — La cartographie ouverte** (UC-APP-09 A2) : la voie « clé perso »
  pré-remplit la clé Anthropic mémorisée dans ce navigateur, dit la règle R1,
  propose « Mémoriser la clé dans ce navigateur », et ne lit plus aucune clé
  gardée sur le serveur.
- **A5 — Une école** : `PUT /api/keys` lui répond aussi `410`, renvoyée à son
  espace établissement (« La clé de votre école, pour ses élèves, se règle dans
  votre espace établissement. », lot S6b) ; une clé d'école n'est jamais rendue
  par une route. Le coffre (`KeyVault::store`) n'accepte plus que la clé d'un
  compte qui a l'habilitation `etablissement` (UC-ETA-02 RG8).
- **A6 — Twin9 et les clés** (ADR-013 §6) : l'analyse approfondie, qui tourne
  sur le serveur, ne peut pas garder la clé du navigateur : elle part avec la
  clé de la plateforme (UC-APP-10 A6) ; la section le dit. Elle ne demande
  aucune clé, Mistral AI comprise (minimisation, 2026-10-22).
- **A7 — La purge des clés gardées** (administrateur, ADR-013 §8) :
  `php scripts/purger-cles-utilisateurs.php`, lancé à la main seulement —
  jamais par le worker, une tâche planifiée ni le déploiement.
  - sans argument (`compter`), il ne change rien et rend des nombres : comptes
    avec clé, clés par fournisseur, comptes avisés et purgeables, runs en cours
    et profils sur la clé personnelle, soldes positifs (dont d'écoles) ;
  - `aviser` écrit à chaque compte qui garde une clé et n'a pas été avisé — ses
    fournisseurs, pourquoi elle part, à partir de quand, comment la recopier ou
    la supprimer, jamais la clé —, puis date l'avis (`avis_purge_at`) ; jamais
    deux fois ; un envoi refusé laisse le compte à aviser ;
  - `purger --confirmer` efface les clés avisées depuis 30 jours au moins,
    compte par compte, après l'annulation puis l'effacement chez Anthropic des
    lots soumis avec elles ; un compte dont un run est en cours sur sa clé
    personnelle est reporté ; un événement d'audit par compte, ses fournisseurs
    sans la clé ; sans `--confirmer`, il ne fait que compter.
  Le jour de la purge et la façon de la lancer en production (pas de SSH sur
  l'hébergement) sont des décisions de Christian.

## Scénarios d'erreur

- **E1 — Stockage serveur non configuré** (A1-A3) : `SODIUM_MASTER_KEY`
  absente ou malformée → `503 « Stockage de clés non configuré »` sur toutes
  les routes, **avant** le contrôle de session — mais **après** la garde CSRF
  globale : un `PUT`/`DELETE` portant un cookie de session sans jeton reçoit
  `403`. La section l'affiche. La même clé maîtresse chiffre les clés
  d'établissement (UC-ETA-02).
- **E2 — Pas de session** : `401` sur les quatre routes (avant le `410` de
  `PUT`).
- **E3 — Envoyer une clé au serveur** : `PUT /api/keys` → `410 {error: "Vos
  clés restent dans votre navigateur : humanome ne les garde plus sur ses
  serveurs.", detail}`, quel que soit le corps — fournisseur inconnu, clé trop
  courte ou trop longue, caractère de contrôle, Mistral AI, corps vide —, jamais
  lu ni écrit. L'interface n'envoie plus ce `PUT`.
- **E4 — Aucune clé pour ce fournisseur** (A2, A3) : `404 « Aucune clé
  enregistrée pour ce fournisseur »`, affiché par la section ; une recopie dont
  la clé a disparu ne supprime rien.
- **E5 — Clé maîtresse changée** : le chiffré ne s'authentifie plus → `404`
  (échec fermé) ; l'entrée reste listée et peut être supprimée.
- **E6 — Jeton CSRF absent** (A2, A3) : `403`, rien n'est effacé ; pour un
  `403` ou un `401` (session disparue), la section dit « Votre session a
  expiré : reconnectez-vous, puis réessayez. ».
- **E7 — Le navigateur ne garde pas la clé** (A2) : stockage plein ou bloqué →
  « Ce navigateur n'a pas pu garder la clé : rien n'a été supprimé du
  serveur. », la clé reste gardée.

## Règles de gestion

- **RG1** — La clé d'un utilisateur reste dans son navigateur (ADR-013, R1) ;
  elle ne part que vers le fournisseur choisi. La page le dit partout où l'on
  saisit une clé.
- **RG2** — Le serveur ne garde la clé que d'une école, pour ses élèves
  (`KeyVault::store` refuse tout autre compte, `KeyRefused`) ; aucune route
  n'écrit plus une clé d'utilisateur (`410`).
- **RG3** — Chiffrement authentifié `crypto_secretbox` (XSalsa20-Poly1305),
  nonce aléatoire par écriture, clé maîtresse hors webroot.
- **RG4** — La liste ne porte jamais de matériau de clé ; la révélation est
  réservée au propriétaire authentifié, marquée `no-store`, et ne sert qu'à la
  recopie dans ce navigateur (aucun chemin de run ne l'appelle) ; elle part
  avec la contraction (ADR-013 §8, pas 10).
- **RG5** — Chaque route n'agit que sur les clés du compte de la session.
- **RG6** — Fournisseurs : l'assistant propose les six de la liste ; le coffre
  accepte en plus `mock` (tests). Pas de clé `mistral` (minimisation,
  2026-10-22). Ollama n'exige pas de clé.
- **RG7** — La purge (A7) : un avis par compte, jamais deux ; 30 jours entre
  l'avis et la purge ; jamais pendant un run en cours sur la clé ; jamais
  automatique.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Clé dans le navigateur | `localStorage['humanome-keys']`, jamais transmise à humanome |
| Clé gardée avant l'ADR-013 | `user_api_keys.encrypted_key` (chiffré), `created_at` ; plus aucune collecte ; listée « à supprimer », recopiée puis supprimée par son propriétaire, ou purgée après avis (A7) ; CASCADE à la suppression du compte ; non réexportée |
| Date de l'avis de purge | `user_api_keys.avis_purge_at` (migration 036), une date, aucune matière de clé |
| Courriel d'avis | Ses fournisseurs, la date de purge, comment recopier ou supprimer — jamais la clé |
| Audit | `api_keys_purge_notice` et `api_keys_purged` `{providers}` par compte, jamais la clé |
| Clé d'école | Hors de ce cas : UC-ETA-02, lot S6b |
| Journaux | Aucune clé journalisée |

### Ce qui lit encore une clé gardée

- La page du compte, pour la recopier dans ce navigateur (A2).
- Les runs Twin9 lancés **avant** l'ADR-013 sur la clé personnelle, jusqu'à
  leur fin, chez Anthropic seulement (`RunKey`, UC-APP-10 A6) ; et, avant la
  suppression du compte ou la purge, l'annulation puis l'effacement de leurs
  lots chez Anthropic (`RunPurge::lotsPersonnels`).
- Plus rien d'autre : ni l'assistant de run, ni la cartographie ouverte, ni
  `GET /api/twin9/meta` (qui ne dit plus si une clé est gardée), ni
  `GET /api/twin9/configuration`.

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/lib/local-keys.js` — `readLocalKeys`, `getLocalKey`, `setLocalKey`, `KEYS_STORAGE_KEY`, `KEY_STAYS_IN_BROWSER` (réexportés par `web/src/lib/run-launcher.js`) | Clés dans ce navigateur, message R1 ; sans dépendance |
| Front | `web/src/components/RunWizard.jsx` — étape « Fournisseur », `launch` | Pré-remplissage, mémorisation, message R1 |
| Front | `web/src/views/Twin6OuverteView.jsx` — voie « clé perso » | Pré-remplissage, mémorisation, message R1 (A4) |
| Front | `web/src/views/account/ApiKeysSection.jsx` | Message R1, liste « à supprimer », recopie puis suppression, suppression, messages |
| Front | `web/src/api/keys.js` — `listKeys`, `revealKey`, `deleteKey`, `KEY_PROVIDERS`, `providerLabel` | Client `/api/keys` (plus d'écriture) |
| Front | `web/src/api/client.js` — `apiFetch`, `ApiError` (`serverMessage`) | Jeton CSRF sur DELETE, message serveur affiché par la section |
| API | `api/src/routes/keys.php` — `PUT` (`410`), `GET /api/keys`, `GET`/`DELETE /api/keys/{provider}` | Garde 503/401, refus, orchestration |
| API | `api/src/Middleware/CsrfMiddleware.php` | Garde CSRF des mutations (E6), passe avant la garde 503 (logique unitaire : UC-CPT-02-U07) |
| Domaine | `api/src/Keys/KeyVault.php` — `masterKeyFromEnv`, `accepte`, `store`, `listForUser`, `reveal`, `delete`, `PROVIDERS`, `REFUS` ; `api/src/Keys/KeyRefused.php` | Chiffrement, refus des comptes qui ne sont pas une école, persistance |
| Domaine | `api/src/Etablissement/Ecole.php` — `est` | L'habilitation `etablissement` (RG2) |
| Domaine | `api/src/Keys/UserKeysPurge.php` — `count`, `notify`, `purge`, `corps` | La purge (A7) |
| Script | `scripts/purger-cles-utilisateurs.php` | Le point d'entrée de la purge, à la main seulement |
| Base | `scripts/migrations/036_cles_avis_purge.sql` | `user_api_keys.avis_purge_at` |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-CPT-04-U01 | `KeyVault::masterKeyFromEnv` | 64 hex (casse indifférente) → 32 octets ; vide, court, non hex, trop long → `null` | `api/tests/UseCases/Unit/UcCpt04GererClesApiTest.php` |
| UC-CPT-04-U02 | `KeyVault::store` | Clé d'une école : format nonce ‖ secretbox, déchiffrable, jamais en clair (RG3) | idem |
| UC-CPT-04-U03 | `KeyVault::store` | Clé d'une école : remplacement, une entrée, nouveau nonce | idem |
| UC-CPT-04-U04 | `KeyVault::listForUser` | Propriétaire seul, tri, dates ISO, `avisPurgeAt` (null avant l'avis), pas de clé (RG4) | idem |
| UC-CPT-04-U05 | `KeyVault::reveal` | Autre compte, fournisseur absent, rotation, blob tronqué → `null` (E5) | idem |
| UC-CPT-04-U06 | `KeyVault::delete` | Suppression réelle, bornée au compte | idem |
| UC-CPT-04-U07 | `KeyVault::PROVIDERS` | Six fournisseurs + `mock`, sans `mistral` (RG6) | idem |
| UC-CPT-04-U15 | `KeyVault::accepte`, `store` | La clé d'un compte qui n'est pas une école refusée (`KeyRefused`, message R1, rien d'écrit), rôles déclarés et `apprenant` compris ; l'habilitation `etablissement` l'accepte (RG2) | idem |
| UC-CPT-04-U16 | `UserKeysPurge::count` | Des nombres seulement : comptes avec clé, par fournisseur, avisés, purgeables, runs en cours et profils sur la clé personnelle, soldes positifs dont écoles ; ni clé ni adresse (A7) | idem |
| UC-CPT-04-U17 | `UserKeysPurge::notify` | Un courriel par compte (ses fournisseurs, la date de purge, comment recopier ou supprimer, jamais la clé), l'avis daté, un audit `{providers}` ; jamais deux fois ; un envoi refusé laisse le compte à aviser (A7, RG7) | idem |
| UC-CPT-04-U18 | `UserKeysPurge::purge` | Les clés avisées depuis 30 jours au moins ; un lot de la clé annulé chez Anthropic avant ; un run en cours sur la clé personnelle reporte le compte ; un audit `{providers}` par compte ; rejouée, rien (A7, RG7) | idem |
| UC-CPT-04-U19 | `scripts/purger-cles-utilisateurs.php` | Jamais lancé automatiquement : ni `api/src`, ni le déploiement, ni le cron, ni `docker`, ni la CI, ni le worker, ni la maintenance ne le nomment dans leur code ; inclus, il ne fait rien (A7) | idem |
| UC-CPT-04-U08 | `setLocalKey`, `getLocalKey`, `readLocalKeys` | Table `humanome-keys`, effacement (RG1) | `web/test/usecases/unit/uc-cpt-04-gerer-cles-api.test.jsx` |
| UC-CPT-04-U09 | idem | Stockage corrompu ou plein toléré | idem |
| UC-CPT-04-U10 | `run-launcher.js`, `keys.js`, `KEY_STAYS_IN_BROWSER` | Plus de `syncKeyToServer`, `fetchKeyFromServer` ni `storeKey` ; le message R1 (RG1) | idem |
| UC-CPT-04-U11 | `local-keys.js` | Sans dépendance, la table que réexporte `run-launcher.js` | idem |
| UC-CPT-04-U12 | `KEY_PROVIDERS`, `PROVIDERS`, `providerLabel` | Les six mêmes fournisseurs au profil et dans l'assistant, tous dans `KeyVault::PROVIDERS` (lu dans `api/src/Keys/KeyVault.php`), sans Mistral AI ; Ollama sans clé (RG6) | idem |
| UC-CPT-04-U13 | `ApiKeysSection` (seul, coutures `deps`) | Message serveur ou repli générique, pas de rechargement après un échec, rechargement après un succès ; un chargement réussi efface l'alerte (AN1 corrigée) | idem |
| UC-CPT-04-U14 | `listKeys`, `revealKey`, `deleteKey` | URL (fournisseur encodé), méthode, `X-CSRF-Token` sur DELETE seulement ; plus de PUT | idem |
| UC-CPT-04-U20 | `ApiKeysSection` — recopie | La clé écrite dans `humanome-keys` **avant** la suppression ; un stockage qui refuse → rien de supprimé (A2, E7) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-CPT-04-F01 | E3, RG1 | API | Un apprenant : `PUT` → `410` et le message R1, rien d'écrit, la clé absente de la réponse | `api/tests/UseCases/Functional/UcCpt04GererClesApiTest.php` |
| UC-CPT-04-F02 | A1, A2 | API | Une clé gardée avant : listée `{provider, createdAt, avisPurgeAt}` sans la clé ; sur un autre navigateur, relue en clair (`no-store`) pour la recopier | idem |
| UC-CPT-04-F03 | A5 | API | Une école : `PUT` → `410` aussi, renvoyée à son espace établissement ; rien d'écrit | idem |
| UC-CPT-04-F04 | A3 | API | DELETE `204` réel ; GET/DELETE ensuite `404` | idem |
| UC-CPT-04-F05 | E1 | API | `503` sur les quatre routes (même en visiteur) ; mutation sans jeton → `403` CSRF avant le `503` ; rien effacé ; reste de l'API OK | idem |
| UC-CPT-04-F06 | E2 | API | `401` sur les quatre routes | idem |
| UC-CPT-04-F07 | E3 | API | Corps invalides (Mistral AI, fournisseur inconnu, longueurs, contrôle, vide) : le même `410`, rien d'écrit | idem |
| UC-CPT-04-F08 | E5 | API | Rotation → `404` sans fuite, entrée toujours listée, supprimable | idem |
| UC-CPT-04-F09 | E6 | API | PUT/DELETE sans jeton → `403`, rien ne change | idem |
| UC-CPT-04-F10 | RG5 | API | Un autre compte ne voit, ne lit ni ne supprime la clé | idem |
| UC-CPT-04-F11 | A7 | CLI | `php scripts/purger-cles-utilisateurs.php` sur la base de test : sans argument et `purger` sans `--confirmer`, des compteurs, rien de purgé ; un mode inconnu sort en 2 | idem |
| UC-CPT-04-F12 | A7 | CLI | `purger --confirmer` : la clé avisée il y a 31 jours effacée, celle non avisée gardée ; des compteurs seulement | idem |
| UC-CPT-04-F13 | Nominal | IHM | Assistant sans compte : clé locale pré-remplie, message R1, ni synchronisation ni récupération, run avec la clé, mémorisée, aucun appel `/api/keys` | `web/test/usecases/functional/uc-cpt-04-gerer-cles-api.test.jsx` |
| UC-CPT-04-F14 | RG1 | IHM | Assistant connecté, avec une clé gardée sur le serveur : elle n'est pas lue, aucun appel `/api/keys`, la clé saisie gardée localement | idem |
| UC-CPT-04-F15 | A1, A3, E4 | IHM | `<App/>` : message R1, plus de formulaire, clés « à supprimer » et date de purge ; 404 affiché ; « Supprimer du serveur » → DELETE + CSRF ; clé locale intacte ; aucune clé affichée | idem |
| UC-CPT-04-F16 | A2 | IHM | « Recopier dans ce navigateur, puis supprimer » : GET puis DELETE, la clé dans `humanome-keys`, plus rien sur le serveur | idem |
| UC-CPT-04-F17 | E4 | IHM | Recopie d'une clé disparue (`404`) : message, rien de supprimé ni d'écrit | idem |
| UC-CPT-04-F18 | E1 | IHM | `503` affiché dans la section | idem |
| UC-CPT-04-F19 | A6 | IHM | La section dit que Twin9 part avec la clé de la plateforme ; elle ne demande aucune clé (ni fournisseur, ni champ) | idem |

Les tests F13 et F14 jouent l'assistant dans la vue `#/espace/nouveau-run`
(`EspaceView`) : la session (connecté, anonyme, jeton CSRF) est dérivée par la
vraie sonde `GET /api/auth/me` contre le faux serveur ; seules les coutures de
l'assistant (portfolio, référentiel, fournisseur LLM simulé) sont injectées.
F11 et F12 lancent le script dans un sous-processus PHP, sur la base de test
seulement (secrets lus dans un répertoire temporaire, jamais dans un
`api/.env` local).

### Tests existants liés (non-régression)

- `api/tests/KeysTest.php` — `410` à tout compte avant toute validation, coffre réservé aux écoles, relecture du propriétaire, liste sans clé, suppression, `503`, rotation.
- `api/tests/AuthAccountDeletionTest.php`, `api/tests/CartographiesPurgeTest.php` — purge de `user_api_keys` avec le compte.
- `web/src/api/keys.test.js`, `web/src/views/account/ApiKeysSection.test.jsx` — client et composant isolés ; plus d'écriture ; recopie et refus d'un stockage plein.
- `web/src/components/RunWizard.test.jsx` — la clé saisie est mémorisée localement au lancement.
- `web/src/views/Twin6OuverteView.test.jsx` — la clé de ce navigateur pré-remplie, mémorisée sur demande, jamais une clé gardée lue (A4).

### Exécuter

```sh
(cd api && vendor/bin/phpunit --filter UcCpt04)
cd web && npx vitest run test/usecases --testNamePattern UC-CPT-04
```

## Anomalies constatées

- **AN1 — Alerte de chargement persistante — corrigée le 2026-10-22.** Dans
  `ApiKeysSection`, `loadError` n'était jamais remis à `null` : après un
  premier chargement en échec, l'ancienne alerte restait à côté de la liste
  rechargée. Un chargement réussi l'efface désormais (UC-CPT-04-U13).

## Limites

- Aucune commande de l'interface n'efface la clé **locale** (`humanome-keys`) :
  l'assistant refuse de continuer avec un champ vide, et décocher « Mémoriser »
  n'efface pas une clé déjà mémorisée. Il faut vider les données du site dans
  le navigateur ; la suppression du compte ne la touche pas non plus
  (UC-CPT-06).
- La clé locale n'est pas chiffrée dans le navigateur : quiconque a accès à ce
  navigateur peut la lire.
- Les écrans du banc d'essai et de la rétrospective du promptologue (UC-PRO-05,
  UC-PRO-06) saisissent aussi une clé dans le navigateur, sans le message R1.
- La purge (A7) n'a pas de route : en production, faute de SSH, le moyen de la
  lancer reste à décider (ADR-013 §8) ; aucun avis ni aucune purge n'a été fait.
