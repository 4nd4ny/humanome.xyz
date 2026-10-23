# Vérification RGPD — suppression, export, journalisation

**Portée :** P12.2 (cahier §6). Croise **chaque table** du schéma (migrations
`001` à `010`) avec (a) son sort à la suppression de compte, (b) sa présence
dans l'export/l'accès de la personne, et documente (c) la minimisation des
journaux. Les garanties sont **prouvées sur la base vivante** par
`scripts/rgpd-audit.php` (introspection `information_schema`) et verrouillées
par `api/tests/RgpdAuditTest.php` + les tests de purge par module.

> **Note de numérotation :** l'énoncé parle des « migrations 001-010 ». Le
> schéma en compte effectivement **dix** (`001`…`010`) : `010_admin_golden.sql`
> (module d'administration P12.1) ajoute la colonne `prompt_packages.is_private`
> et la table `golden_grants`. Toutes deux sont couvertes ci-dessous.

## Méthode

`scripts/rgpd-audit.php` lit, sans liste écrite à la main :

1. **toutes** les colonnes dont le nom identifie un utilisateur (`user_id`,
   `author_id`, `apprenant_id`, `cartographe_id`, `accepted_by`, `created_by`,
   `granted_by`, `etablissement_id`), sur **toutes** les tables ;
2. la règle `ON DELETE` (`DELETE_RULE`) de chaque clé étrangère vers `users`.

Le croisement des deux donne le contrôle décisif : **une colonne identifiant un
utilisateur sans clé étrangère vers `users` survivrait à une purge**. La sortie
actuelle est :

```
== Colonnes identifiant un utilisateur SANS clé étrangère vers users ==
  aucune — toute référence utilisateur est régie par une FK (CASCADE/SET NULL).
```

**Résultat : aucune table oubliée par la purge.** 23 clés étrangères vers
`users`, toutes en `CASCADE` (effacement réel) ou `SET NULL` (anonymisation
documentée).

## (a)+(b) Croisement table par table

Légende **suppression** : `CASCADE` = ligne effacée ; `SET NULL` = identifiant
mis à NULL (anonymisation) ; `chaîne` = effacée via une FK vers une table
elle-même en CASCADE ; `—` = pas de donnée personnelle du titulaire.
Légende **export** : `local` = restituée par l'archive client (source = stores
navigateur) ; `via` = récupérable par un autre point d'accès mais **hors**
archive ; `aucun` = non récupérable par la personne elle-même ; `—` = non
applicable.

| Migration | Table | Personnelle ? | Suppression du compte | Export / accès |
|---|---|---|---|---|
| 001 | `users` | oui (email, nom, empreinte mdp) | **DELETE** direct | `local` (bloc compte) |
| 001 | `roles` | non (référence) | — | — |
| 001 | `user_roles` | oui (rôles) | CASCADE `user_id` | — |
| 002 | `sessions` | oui (session) | CASCADE `user_id` | — |
| 002 | `rate_limits` | non (buckets hachés, sans `user_id`) | — (expire) | — |
| 003 | `referentiel_versions` | non (contenu collectif immuable) | SET NULL `created_by` | — |
| 003 | `prompt_packages` | non (contenu collectif) | — | — |
| 003 | `prompt_versions` | non (contenu collectif) | SET NULL `created_by` | — |
| 004 | `cartographies` | oui (document opt-in + méta) | CASCADE `user_id` | `local` (store cartographies) |
| 004 | `share_links` | empreintes seules (jamais de clair) | chaîne via `cartographies` (validité 90 j déf., 1-365) | `—` (hachages) |
| 005 | `training_progress` | oui (avancement) | CASCADE `user_id` | `local` (store formation) |
| 005 | `user_api_keys` | oui (clé chiffrée ; plus collectée depuis l'ADR-013, purgée après avis, `avis_purge_at` — migration 036) | CASCADE `user_id` | `aucun` (secret, jamais réexporté — choix de conception) |
| 005 | `audit_events` | trace | SET NULL `user_id` (anonymisée) ; les `details` d'un autre acteur (`role_granted`, `role_revoked`, `invitation_accepted`, `golden_access_granted`, `waitlist_lifted`…) gardent l'identifiant numérique d'un compte supprimé, pseudonyme orphelin hors clé étrangère | `—` |
| 006 | `llm_usage_daily` | non (compteurs anonymes) | — (entretien) | — |
| 006 | `llm_pow_challenges` | non (empreintes anti-rejeu) | — (TTL 2 min) | — |
| 034 | `free_credit_monthly` | non (compteurs anonymes du mois : dépense, réserve, appels, refus des crédits offerts, sprint 7) | — (une ligne par mois, gardée) | — |
| 034 | `free_credit_reservations` | non (compteurs anonymes : le montant et l'heure d'une réserve en cours, sans compte ni contenu) | — (retirée au règlement, ou à son expiration après 15 minutes ; part avec la ligne de son mois) | — |
| 034 | `users.waitlisted_at` | oui (une date : la mise en liste d'attente d'une inscription, sprint 7 ; nulle pour tout autre compte, effacée à la levée) | avec la ligne `users` | `—` (un compte en attente ne se connecte pas ; levé, la date est effacée) |
| 007 | `cartographies.run_meta` | oui (compteurs de run) | avec `cartographies` | `local` |
| 008 | `cartographe_invitations` | oui (invitation) | CASCADE `apprenant_id` / SET NULL `accepted_by` | `—` |
| 008 | `cartographe_links` | oui (lien apprenant↔cartographe) | CASCADE (deux côtés) | `—` |
| 008 | `cartography_annotations` | oui (expression du cartographe) | CASCADE `author_id` + chaîne `cartographie_id` | `via` (espace cartographe) |
| 008 | `cartography_revisions` | oui (données de l'apprenant, révisées) | SET NULL `author_id` + chaîne `cartographie_id` | `via` (lien de partage / cartographe) |
| 008 | `cartography_garanties` | oui (signature, nom figé) | CASCADE `cartographe_id` + chaîne | `via` |
| 008 | `settings` | non (config plateforme) | — | — |
| 009 | `cohortes` | oui (côté établissement) | CASCADE `etablissement_id` | `—` |
| 009 | `cohorte_membres` | oui (consentement) | CASCADE `user_id` | `via` (`GET /api/cohortes`) |
| 009 | `cohorte_portfolios` | **oui (texte du portfolio)** | CASCADE `user_id` | `local` (déposé depuis le store local) — voir limite 1 |
| 009 | `etablissement_config` | oui (clé/budget établissement) | CASCADE `user_id` | `aucun` (secret) |
| 009 | `mass_runs` | oui (côté établissement) | CASCADE `etablissement_id` | `—` |
| 009 | `mass_jobs` | **oui (cartographies produites)** | CASCADE `user_id` ; `portfolio_id` SET NULL | `aucun` côté apprenant — voir limite 2 |
| 010 | `prompt_packages.is_private` | non (drapeau) | — | — |
| 010 | `golden_grants` | oui (autorisation d'accès) | CASCADE `user_id` / SET NULL `granted_by` | `—` |

**Conclusion suppression :** toute donnée personnelle du titulaire est soit
réellement effacée (CASCADE / chaîne), soit anonymisée par un `SET NULL`
**documenté et légitime** (trace d'audit, contenu collectif immuable, révision
appartenant à l'apprenant). Vérifié de bout en bout par
`RgpdAuditTest::testEmpreinteEtPurgeSurComptePeuple` (empreinte non vide avant,
strictement vide après) et par les tests de purge de chaque module
(`AuthAccountDeletionTest`, `CartographiesPurgeTest`, `CartographePurgeTest`,
`MasseRgpdPurgeTest`).

### Twin9 sur le serveur (migrations 024 à 029, T10 et T14)

Les runs Twin9 gardent sur le serveur, avec l'accord de la personne, son
portfolio et l'état de ses runs (ADR-011 §5, registre §13). Légende de la
colonne export : `archive` = dans l'archive « un clic », lu par
`GET /api/twin9/mes-analyses` (`analysesTwin9`, schéma 1.2.0).

| Migration | Table | Personnelle ? | Suppression du compte | Export / accès |
|---|---|---|---|---|
| 024 | `twin9_profils` | oui (réglages, sans contenu) | CASCADE `user_id` | `via` (`GET /api/twin9/profils/{id}`) |
| 025 | `twin9_cartes` | oui (carte d'un portfolio) | CASCADE `user_id` | `archive` |
| 025 | `twin9_memoire` | **oui (journées, textes compris)** | chaîne via `twin9_cartes` | `archive` |
| 025 | `twin9_runs` | **oui (copie du portfolio, réglages)** | CASCADE `user_id` | `archive` |
| 025 | `twin9_appels` | **oui (réponses des modèles)** | chaîne via `twin9_runs` | `archive` |
| 025 | `twin9_resultats` | oui (sorties du run) | chaîne via `twin9_runs` | `archive` |
| 026 | `twin9_lots` | non (identifiants, compteurs) | chaîne via `twin9_runs` ; le lot chez Anthropic : ci-dessous | `—` |
| 028 | `twin9_lots_a_effacer` | non (identifiant Anthropic seul, sans propriétaire) | — (vidée par le tick) | `—` |
| 029 | `twin9_jeux` | non (une copie des gabarits v9.8, contenu de plateforme) | SET NULL `user_id` : la copie survit, sans auteur | `—` |
| 029 | `twin9_jeux_gabarits`, `twin9_jeux_versions` | non (gabarits et leurs versions) | SET NULL `updated_by` / `created_by` | `—` |
| 030 | `twin9_evaluations` ; `twin9_runs.reserve_fusion_microusd`, `engagement_microusd` ; `twin9_appels.pire_cas_microusd` | évaluation : oui tant qu'elle nomme la personne (tailles, coûts, pires cas, réglages ; aucun contenu) ; colonnes : montants seuls | évaluation : SET NULL `user_id`, elle sert les prévisions sans plus appartenir à personne ; colonnes : CASCADE avec leur run | `archive` (avec son run) |

### Rôles RESPIRE déclarés (migration 035, sprint 8)

La personne se déclare des rôles de la liste RESPIRE dans `#/compte`, à part
de ses habilitations (`user_roles`) : une déclaration n'ouvre aucun droit
(registre §1 ter, `docs/autorisations.md` principe 7).

| Migration | Table | Personnelle ? | Suppression du compte | Export / accès |
|---|---|---|---|---|
| 035 | `user_declared_roles` | oui (rôles que la personne se déclare) | CASCADE `user_id` | `archive` (`account.declaredRoles`, schéma 1.3.0, lu par `GET /api/auth/me/declared-roles`) |
| 035 | `users.founding_circle` | oui (case « membre du cercle des fondateurs ») | avec la ligne `users` | `archive` (`account.declaredRoles.foundingCircle`) |

Preuves : `RgpdAuditTest` (règle CASCADE attendue, empreinte d'un compte
peuplé), UC-CPT-07-U11 et UC-CPT-07-F09 (purge), UC-CPT-07-U12 (export).

### L'école paie pour ses élèves (migration 037, sprint 6, lot S6b)

L'école — le compte qui porte l'habilitation `etablissement` — paie les usages
payants des membres de ses cohortes (registre §6 bis, §6 ter ; ADR-013 §3, §7).
Des montants, des mois et des identifiants : jamais un portfolio, une sortie ni
un prompt. Légende comme ci-dessus ; `via` = lu par l'école dans
`GET /api/etablissement/ecole`, par l'élève dans `GET /api/twin9/meta`.

| Migration | Table | Personnelle ? | Suppression du compte | Export / accès |
|---|---|---|---|---|
| 037 | `ecoles` | non pour l'élève (réglages de l'école : surtaxe, plafond, numéro RESPIRE) | CASCADE `user_id` (l'école) | `via` |
| 037 | `ecole_cles` | non (la clé de l'école, chiffrée, un secret) | CASCADE `ecole_id` ; ses lots chez Anthropic annulés et effacés avant (`RunPurge::lotsEcole`) | `none` (jamais rendue, comme `user_api_keys`) |
| 037 | `ecole_consommations` | oui (ce que l'élève a engagé de son école, par mois : un montant) | CASCADE `ecole_id` et `eleve_id` | `via` |
| 037 | `twin9_credit_events.beneficiaire_id` | oui (l'élève qu'un événement du grand livre de l'école nomme) | SET NULL `beneficiaire_id` : l'événement reste à l'école, anonyme | `—` (le grand livre est celui de l'école) |
| 037 | `twin9_runs.payeur`, `payeur_id`, `facteur_prix` ; `twin9_appels.mois_reserve` | non (qui paie le run, son facteur ; le mois d'une réserve) | avec le run (CASCADE `user_id`) ; SET NULL `payeur_id` à la purge de l'école | `archive` pour le seul type de payeur, dans la configuration du run (`execution_prevue.payeur`) ; les colonnes elles-mêmes ne sont pas exportées |
| 037 | `twin9_lots_a_effacer.ecole_id` | non (l'école dont la clé efface le lot) | CASCADE `ecole_id` | `—` |

Preuves : `RgpdAuditTest` (règles attendues, colonnes gouvernées),
`api/tests/Twin9/EcolesTest.php` (le lot d'un élève purgé, confié au tick avec
son école, effacé avec la clé de l'école), UC-ETA-05-U05 à U13.

**Les lots encore chez Anthropic** (`DELETE /api/auth/account`,
`Twin9\RunPurge`) : ceux de la clé personnelle sont annulés, puis supprimés
une fois finis, avant la suppression du compte, tant que la clé existe ;
ceux de la clé de l'instance laissent leur identifiant Anthropic dans
`twin9_lots_a_effacer`, dans la transaction de la purge, et le tick les
annule puis les supprime (`Twin9Lots`). Résidu : un lot de la clé
personnelle encore en cours d'annulation, ou un lot dont la soumission n'a
pas eu de réponse (son identifiant inconnu), reste chez Anthropic jusqu'à ce
qu'Anthropic l'efface, 29 jours après sa création au plus.

Preuves : `api/tests/Twin9/PurgeExportTest.php` — après la purge, aucune
ligne du compte dans les tables du moteur, son lot confié au tick, celui
d'un autre compte intact ; les lots annulés puis supprimés, de la clé de
l'instance par le tick, de la clé personnelle à la purge ; l'export contient
les runs, leurs journaux et la mémoire des cartes, filtrés. Aucune clé
n'est écrite dans ces tables ni dans l'export : `CoutsTest::testNoKeyIsWrittenAnywhere`.

## Limites d'accès/portabilité identifiées (pas des bugs de purge)

Ces deux points concernent l'**accès/portabilité** (RGPD art. 15/20), pas
l'effacement (art. 17, qui est complet) : les données ci-dessous **sont bien
purgées** à la suppression du compte, mais leur **récupération par l'apprenant
lui-même** n'est pas offerte par l'archive « un clic ».

1. **`cohorte_portfolios` (texte déposé en cohorte).** Aucun point d'accès
   apprenant ne re-sert le texte déposé (le dépôt est `POST` uniquement).
   Impact atténué : le dépôt provient du **portfolio local** de l'apprenant,
   toujours présent dans son navigateur et couvert par l'archive locale ; le
   dépôt serveur est une copie de traitement transitoire, effacée au départ de
   la cohorte. Récupérabilité de fait : **oui, via la source locale**.

2. **`mass_jobs.document` (cartographies journalières produites en masse).**
   Ces documents « appartiennent à l'apprenant » (le commentaire de la
   migration 009 le dit, et `user_id` est en CASCADE), mais le **seul** point
   d'accès est `GET /api/etablissement/membres/{membreId}/documents`, réservé au
   rôle `etablissement`. **Il n'existe aucun point d'accès apprenant** pour que
   la personne récupère ses propres cartographies de masse. Preuve dans le code
   et les tests : `MasseRgpdPurgeTest::testDepartRetireLAccesDeLEtablissement…`
   affirme « the produced cartography leaves the establishment's reach » au
   départ, « but it stays with the learner » — or *stays* ne signifie pas
   *accessible* : la ligne subsiste en base sans aucune route pour l'apprenant.
   Requête qui l'objective (aucune route apprenant ne la sélectionne) :

   ```sql
   -- Documents de masse d'un apprenant : produits, purgés à la suppression du
   -- compte (user_id CASCADE), mais illisibles par l'apprenant lui-même —
   -- servis UNIQUEMENT à l'établissement (etablissement.php, RequireRole
   -- 'etablissement'). Aucun handler côté rôle 'apprenant' ne fait ce SELECT.
   SELECT j.id, j.day_date
     FROM mass_jobs j
     JOIN mass_runs r ON r.id = j.run_id
    WHERE j.user_id = :apprenant_id AND j.status = 'done';
   ```

   Ce n'était **pas un bug de purge** (la donnée disparaît bien à la suppression
   du compte) et **pas** un manquement à l'effacement, mais une **lacune de
   portabilité** (art. 15/20).

   **✅ Corrigé (2026-07-12).** Ajout de `GET /api/mes-documents-masse`
   (`RequireRole 'apprenant'`, api/src/routes/etablissement.php) : l'apprenant
   récupère ses propres documents de masse `status='done'` avec leur traçabilité
   (cohorte, prompt-package, référentiel), **y compris après avoir quitté la
   cohorte** (art. 15 : l'accès à ses propres données ne dépend pas de
   l'adhésion — l'établissement, lui, perd l'accès). Ces documents entrent
   désormais dans l'archive d'export « un clic » (web/src/lib/archive.js,
   `defaultGetMassDocuments` → `cartographies[]`). Tests :
   `api/tests/MasseLearnerAccessTest.php` (accès, survie au départ, cas vide) et
   `web/src/lib/archive.test.js` (inclusion + archive valide au schéma). La
   colonne export de `mass_jobs` passe donc de `aucun` à **`via /api/mes-documents-masse`**.

3. **Jeux de données de l'interface de cartographie (stockage local
   `humanome-carto-v4`).** Données locales (jamais sur le serveur, sauf une
   version partagée composée par l'apprenant adulte, table `cartographies`),
   mais absentes de l'archive « un clic » jusqu'au 2026-10-14 : elles ne se
   sauvegardaient que jeu par jeu, depuis l'espace Export de l'interface.
   **✅ Couvert (2026-10-14, archive 1.1.0).** « Exporter toutes mes données »
   embarque chaque jeu en archive complète (`jeuxCartographie`, schéma
   `competency-map-master`) — portfolio, réponses au jury, carnet du dialogue
   compris ; la démonstration publique exceptée tant que la personne n'y a
   rien ajouté — et l'import les restaure sans écraser ce qui est déjà là ;
   un jeu illisible n'empêche pas l'export des autres (journal de la
   cartographie, D-25 et D-41 ; UC-APP-06, F17, U19). Les brouillons des
   versions partagées (`localStorage`, extraits et noms remplacés) quittent
   le navigateur avec le jeu, avec le compte, et avec la version retirée
   ailleurs (D-33, D-41 ; UC-CPT-06, F12).

## (c) Minimisation des journaux (cahier §6.5)

Revue exhaustive de tous les points de journalisation de `api/src`.

### `error_log` — messages d'exception uniquement

Tous les appels sont de la forme `error_log('[module] ' . $e->getMessage())`
(plus `error_log('[worker-tick] ' . json_encode($counters))` — compteurs
seuls). Ce qui pourrait fuiter par un message d'exception PDO :

- **Valeur d'une contrainte d'unicité en doublon.** MySQL renvoie la valeur
  fautive (`Duplicate entry 'x' for key '…'`). Les clés uniques du schéma sont :
  `users.email` (la **seule** PII), et par ailleurs `roles.name`,
  `referentiel_versions(referentiel_id,semver)`, slugs de paquets,
  `share_links.token_hash`, `cartographe_invitations.code`, `cohortes.code`,
  `etablissement_config.worker_token_hash`, `mass_jobs(run_id,user_id,day_date)`
  — soit des hachages, des codes aléatoires ou des entiers, **non sensibles**.
  Le **seul** `INSERT INTO users` (email) est `Auth\Users::create`, appelé par
  `POST /api/auth/register`, dont le `catch` traite le code `23000`
  (email en doublon) par une réponse **409 sans journalisation** ; le `throw`
  n'atteint jamais un `error_log`. Aucun chemin ne journalise donc un email.
- **Valeurs de paramètres liés.** `Db.php` fixe `PDO::ATTR_EMULATE_PREPARES =
  false` : les paramètres partent séparément de la requête et **n'apparaissent
  jamais** dans le texte de l'exception. Un « data too long / truncated » cite
  le **nom** de la colonne, jamais la valeur.

**Conclusion :** aucun `error_log` ne peut journaliser de contenu de portfolio/
cartographie, de mot de passe, de clé d'API ou de jeton.

### `audit_events` — faits structurés minuscules

Tous les `Audit::record(...)` n'écrivent que des identifiants entiers, des
compteurs et des valeurs de **liste blanche** (`role` parmi les rôles §2 ;
`provider` ∈ {`humanome`,`endpoint`} ; `cause` ∈ {`retrait`,
`nouvelle_revision`}). Jamais d'email, de contenu, de mot de passe, de clé ni de
jeton. Le nouveau `POST /api/admin/maintenance` ne journalise que des compteurs
(liens purgés, jours de démo, défis) en cas de succès, un message d'exception
générique en cas d'échec.

## Entretien périodique (application des durées)

`scripts/maintenance.php` (classe canonique) et `POST /api/admin/maintenance`
(entrée de production, `X-Migrate-Token`, même modèle que le worker-tick —
aucun script shell n'est livré à la release OVH, ADR-008) appliquent :

- **purge des liens de partage morts** au-delà de 30 jours de grâce (`expires_at`
  ou `revoked_at` antérieurs à `NOW() - 30 jours`) — mise en œuvre de la
  politique d'expiration exigée par P12. À distinguer de la **validité** d'un
  lien, fixée par l'apprenant à sa création (`share.php` `expiresInDays` :
  **90 jours par défaut**, bornée à 1-365) ; le lien devient inopérant à
  l'expiration, la purge n'efface que la ligne dormante 30 jours plus tard ;
- **remise à zéro des compteurs démo journaliers** : suppression des lignes
  `llm_usage_daily` des jours UTC passés (la **ligne du jour** est conservée
  pour ne pas réinitialiser le coupe-circuit budgétaire en cours de journée) et
  des défis anti-rejeu expirés. Le grand livre mensuel des crédits offerts
  (`free_credit_monthly`, migration 034) n'est pas purgé : une ligne de
  compteurs anonymes par mois.

**Fréquence recommandée : quotidienne** (cron OVH). Idempotent. Couvert par
`api/tests/MaintenanceTest.php` (classe **et** route, effets identiques).
