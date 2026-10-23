# UC-CPT-07 — Déclarer ses rôles RESPIRE

| Champ | Valeur |
|---|---|
| **Acteur principal** | Tout utilisateur inscrit et connecté |
| **Acteurs secondaires** | Administrateur (voit les déclarations à côté des habilitations et habilite d'un clic, UC-ADM-01 A7) |
| **Portée** | humanome.xyz — bloc « Mes rôles RESPIRE » de `#/compte`, à côté du bloc « Affichage » ; `GET` et `PUT /api/auth/me/declared-roles` ; la colonne « Rôles déclarés » de `#/admin/roles` (UC-ADM-01 A7) ; l'archive de compte (UC-APP-06 RG11) |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §2 (glossaire des rôles) ; `TODO_LIST.md`, sprint 8 ; décision de Christian (prise par délégation) : séparer le rôle déclaré de l'habilitation ; `docs/autorisations.md` principe 7 ; [glossaire des rôles](../../roles.md) ; registre RGPD §1 ter |
| **Statut** | Implémenté (sprint 8 : serveur et migration 035 au lot S8-1, IHM de `#/compte` et de `#/admin/roles` au lot S8-2) |

## Objectif

Permettre à chacun de dire quels rôles de l'écosystème RESPIRE il se
reconnaît — cartographe, promptologue, promptagogue, éclaireur, architecte,
épistémiarque, médiateur, noèsiologue, maître du grimoire, et « membre du
cercle des fondateurs » pour les promptagogues, épistémiarques et maîtres du
grimoire — **sans qu'aucune déclaration n'ouvre de droit**. Les droits restent
les habilitations, attribuées par l'administrateur (UC-ADM-01) : un
cartographe habilité lit les runs partagés aux cartographes, un épistémiarque
habilité vote. Se déclarer ne fait ni l'un ni l'autre.

## Déclencheur

L'utilisateur connecté ouvre `#/compte` (menu « Mon compte » → « Profil et
rôles ») : le bloc « Mes rôles RESPIRE » suit le profil et sa ligne
« Affichage ».

## Préconditions

- Session ouverte (UC-CPT-02) ; le client dispose du jeton CSRF.

## Garanties en cas de succès

- La déclaration du compte (`user_declared_roles`, `users.founding_circle`)
  est **remplacée en entier** par celle reçue, dans une transaction, sous le
  verrou de la ligne `users`.
- `user_roles` n'est jamais touché : `GET /api/auth/me` rend les mêmes
  `roles`, les gardes, le menu, l'électorat et la lecture des runs partagés
  ne changent pas.
- Dans l'IHM, ni les familles du menu, ni leurs liens, ni le mode
  d'affichage par défaut, ni les gardes de vue ne changent, à l'enregistrement
  comme après rechargement (RG6).

## Garanties minimales (en cas d'échec)

- Rien n'est écrit (`422`, `401`, `403`) : la déclaration précédente reste.
- Aucune déclaration ne contient `admin`, une autre habilitation, un rôle
  hors des neuf, ou la case du cercle sans rôle qui la porte.

## Scénario nominal

1. L'utilisateur ouvre `#/compte`. Après la vérification de session
   d'`AccountView`, `DeclaredRolesSection` lit
   `GET /api/auth/me/declared-roles` : `200 {roles: [], foundingCircle:
   false, catalogue}` pour un compte qui n'a rien déclaré ; `catalogue` liste
   les neuf rôles dans l'ordre de la liste RESPIRE, chacun `{id, label,
   definition, habilitation, foundingCircleEligible}`.
2. Le bloc « Mes rôles RESPIRE » affiche la mention « **Une déclaration ne
   donne pas d'accès ; l'administrateur habilite.** », le nom des
   déclarations qui ont une habilitation du même nom, puis une case par rôle
   du catalogue, avec sa définition ; la déclaration courante est cochée.
   « Enregistrer mes rôles » reste inactif tant que rien ne change
   (`aria-disabled`, pas `disabled` : il reste dans l'ordre de tabulation et
   garde le focus pendant et après l'enregistrement). Plus
   haut, la ligne « Habilitations » du profil liste les habilitations
   attribuées par l'administrateur (« Aucune habilitation pour l'instant »
   sinon) ; l'aide de la page dit de même « habilitation » pour ce que
   l'administrateur attribue, « rôle » pour ce qui se déclare.
3. L'utilisateur coche ses rôles. Dès que promptagogue, épistémiarque ou
   maître du grimoire est coché, la case « Membre du cercle des fondateurs »
   apparaît ; il peut la cocher.
4. Il clique « Enregistrer mes rôles » : le client envoie
   `PUT /api/auth/me/declared-roles {roles, foundingCircle}` (rôles dans
   l'ordre du catalogue) avec l'en-tête `X-CSRF-Token`. Pendant l'envoi, le
   bouton s'annonce « Enregistrement… » et un second envoi ne part pas.
5. `DeclaredRoles::validate` vérifie la déclaration entière (RG1 à RG4) ;
   `DeclaredRoles::replace` la revérifie et l'écrit.
6. `200 {roles, foundingCircle, catalogue}` : les rôles dans l'ordre du
   catalogue. Le bloc affiche « Rôles RESPIRE enregistrés. Vos accès ne
   changent pas : seul l'administrateur habilite. » Les habilitations du
   compte ne bougent pas, et la session n'est pas relue (RG6).

## Scénarios alternatifs

- **A1 — Changer sa déclaration** (étape 4) : le `PUT` remplace tout ; un rôle
  décoché n'est plus déclaré ; la case absente vaut « décochée ».
- **A2 — Ne plus rien déclarer** (étape 4) : tout décocher envoie
  `{roles: [], foundingCircle: false}`, qui efface la déclaration.
- **A3 — L'administrateur habilite** (hors de ce cas, UC-ADM-01 A7) : la
  déclaration reste telle quelle ; retirer l'habilitation ne la touche pas.
  C'est l'habilitation qui, à la session suivante, ajoute la famille du menu
  et passe l'affichage en mode expert par défaut (UC-CPT-07-F11).
- **A4 — Décocher le dernier rôle éligible** (étape 3) : la case du cercle
  disparaît et se décoche ; le `PUT` part avec `foundingCircle: false`. Avec
  deux rôles éligibles cochés, elle reste tant que l'un d'eux reste.

## Scénarios d'erreur

- **E1 — Case du cercle sans rôle éligible** (étape 5) : `422 {error:
  "Validation échouée", fields: {foundingCircle}}`, y compris quand le `PUT`
  retire le dernier rôle éligible en gardant la case.
- **E2 — Déclaration refusée** (étape 5) : `admin` (« ne se déclare pas :
  seul un administrateur l'attribue »), une autre habilitation (`apprenant`,
  `employeur`, `etablissement`), un rôle inconnu ou d'une autre graphie
  (`Cartographe`, `épistémiarque`), un doublon, une liste absente ou mal
  formée, un rôle non textuel, une case non booléenne, un corps qui n'est pas
  un objet JSON → `422 {error, fields}` ; rien n'est écrit. Un rôle qui n'est
  pas de l'UTF-8 valide (un corps de formulaire `roles[]=%C3`, que Slim
  analyse aussi) est refusé sans être cité (« Chaque rôle est un identifiant
  en UTF-8 valide ») : cité, il rendrait le `422` impossible à encoder en JSON
  (un `500` sous PHP 8.2).
- **E3 — Visiteur** : `401 « Authentification requise »` en lecture comme en
  écriture (et pour la session d'un compte purgé) ; `#/compte` montre alors
  la connexion, sans le bloc.
- **E4 — Jeton CSRF absent ou faux, session disparue** (étape 4) : `403` du
  middleware global, rien n'est écrit ; le bloc affiche le message du serveur
  (« Jeton CSRF absent ou invalide ») en alerte et garde la saisie. Un refus
  `422` (E1, E2) s'affiche de même, avec le message de chaque champ.
- **E5 — Déclaration illisible** (étape 1) : `404` d'une API antérieure,
  `500`, API injoignable ou catalogue vide → le message discret « Vos rôles
  RESPIRE ne peuvent pas être chargés pour le moment. Réessayez plus tard. »,
  sans alerte ni formulaire (il écraserait la déclaration du serveur) ; la
  mention reste, le reste du profil reste utilisable.

## Règles de gestion

- **RG1** — Neuf rôles déclarables, identifiants ASCII comparés à la lettre
  (`ascii_bin`) : `cartographe`, `promptologue`, `promptagogue`, `eclaireur`,
  `architecte`, `epistemiarque`, `mediateur`, `noesiologue`,
  `maitre-du-grimoire`. Jamais `admin`.
- **RG2** — La case « membre du cercle des fondateurs » n'est acceptée qu'avec
  promptagogue, épistémiarque ou maître du grimoire déclaré ; le serveur le
  vérifie à chaque écriture (validate, puis replace).
- **RG3** — Le `PUT` remplace la déclaration entière ; les rôles sont rendus
  dans l'ordre du catalogue.
- **RG4** — **Une déclaration n'ouvre rien** : aucune garde (`RequireRole`,
  `RoleGuard`), aucune famille du menu, aucun vote (`Electorate`), aucune
  lecture de run partagé ne lit `user_declared_roles` : hors de
  `DeclaredRoles`, seules la route de la déclaration et la liste de
  l'administration la lisent (UC-CPT-07-U22, sur le code de `api/src`).
  Trois déclarations ont
  une habilitation du même nom que l'administrateur accorde d'un clic
  (cartographe, promptologue, épistémiarque) ; les six autres n'en ont pas
  aujourd'hui.
- **RG5** — Aucun journal d'audit pour une déclaration (elle n'ouvre rien ;
  journalisation minimale, cahier §6.5) ; l'habilitation qui suit, elle, est
  auditée (`role_granted`).
- **RG6** — Côté IHM, le menu (`navGroups`), le mode d'affichage par défaut
  (`defaultMode`) et les gardes de vue ne lisent que les habilitations
  (`user.roles` de `GET /api/auth/me`). Enregistrer une déclaration n'émet
  aucun événement de session (`humanome:auth`) : le shell ne relit rien.
  Propriété vérifiée sur l'application entière pour six jeux
  d'habilitations (UC-CPT-07-F10), avec son contrôle positif (F11).

## Libellés et définitions (à relire par Christian)

Le [glossaire des rôles](../../roles.md) les donne, mot pour mot comme le
catalogue de l'API (`DeclaredRoles::CATALOGUE`, concordance vérifiée par
UC-CPT-07-U21), avec leur source : le cahier §2 et `content/formation` pour
cartographe, promptologue et épistémiarque ; une source indirecte
(`content/formation/noesiologie`, ch. 1) pour médiateur, noèsiologue et maître
du grimoire ; aucune pour promptagogue, éclaireur et architecte, dont la
définition est neutre. L'IHM affiche le catalogue servi par l'API ; le front
n'en garde que les libellés, pour la liste d'administration (UC-CPT-07-U15).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Rôles déclarés | `user_declared_roles` (CASCADE à la purge du compte) ; visibles de la personne et de l'administrateur |
| Case du cercle des fondateurs | `users.founding_circle`, purgée avec la ligne |
| Export | Archive de compte 1.3.0, `account.declaredRoles` (UC-APP-06 RG11) ; jamais réimportée |
| Journal | Aucun événement d'audit (RG5) |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Base | `scripts/migrations/035_roles_declares.sql` | `user_declared_roles`, `users.founding_circle` |
| Domaine | `api/src/Auth/DeclaredRoles.php` — `CATALOGUE`, `FOUNDING_CIRCLE_ELIGIBLE`, `HABILITATIONS`, `catalogue`, `validate`, `of`, `ofUsers`, `replace`, `grantable` | Catalogue, validation, écriture transactionnelle, lecture groupée, habilitations appelées |
| API | `api/src/routes/declared-roles.php` — `GET`/`PUT /auth/me/declared-roles` | Session, `422 {error, fields}`, `401` |
| API | `api/src/Middleware/CsrfMiddleware.php` | `403` sans jeton sur le `PUT` |
| Domaine | `api/src/Admin/UserDirectory.php` — `list` | Les déclarations à côté des habilitations (UC-ADM-01 A7) |
| Front | `web/src/lib/archive.js` — `defaultGetAccount` | `account.declaredRoles` dans l'archive 1.3.0 |
| Front | `web/src/api/declared-roles.js` — `fetchDeclaredRoles`, `saveDeclaredRoles`, `normalizeDeclaration`, `DECLARED_ROLES`, `FOUNDING_CIRCLE_ELIGIBLE`, `FOUNDING_CIRCLE_LABEL`, `declaredRoleLabel` | Client de la route (sans événement de session), copie des libellés |
| Front | `web/src/views/account/DeclaredRolesSection.jsx` | Bloc « Mes rôles RESPIRE » : mention, catalogue, case du cercle conditionnelle, enregistrement, refus, lecture impossible |
| Front | `web/src/views/AccountView.jsx` | Le bloc après le profil ; la ligne « Habilitations » |
| Front | `web/src/App.jsx`, `web/src/nav.js` — `navGroups`, `web/src/lib/ui-mode.js` — `defaultMode` | Menu et mode par défaut tirés des seules habilitations (RG6) |
| Doc | `docs/roles.md` | Glossaire des rôles, concordant avec le catalogue |
| RGPD | `scripts/rgpd-audit.php` — `EXPORT_COVERAGE` | `user_declared_roles` : `archive` |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-CPT-07-U01 | `DeclaredRoles::CATALOGUE`, `catalogue` | Neuf rôles dans l'ordre de la liste, slugs ASCII ≤ 32, libellés, définitions d'une ligne, jamais `admin` | `api/tests/UseCases/Unit/UcCpt07DeclarerRolesTest.php` |
| UC-CPT-07-U02 | `FOUNDING_CIRCLE_ELIGIBLE`, `HABILITATIONS` | Trois rôles éligibles ; trois habilitations, chacune un rôle de `roles`, aucune `admin` ; six déclarations sans habilitation | idem |
| UC-CPT-07-U03 | `validate` | Ordre du catalogue, case absente = `false`, liste vide | idem |
| UC-CPT-07-U04 | `validate` | Refus : corps non objet, liste absente ou non liste, rôle non textuel, rôle en UTF-8 invalide (jamais cité), `admin`, autres habilitations, inconnu, casse, accent, doublon, case non booléenne (RG1) | idem |
| UC-CPT-07-U05 | `validate` | Case du cercle avec chacun des trois rôles éligibles seulement (RG2) | idem |
| UC-CPT-07-U06 | `replace`, `of` | Remplacement entier, `user_roles` intact ; compte inconnu ou supprimé → `false`, rien d'écrit (RG3) | idem |
| UC-CPT-07-U07 | `replace` | Revérification : déclaration refusée → exception, rien d'écrit | idem |
| UC-CPT-07-U08 | `ofUsers` | Lecture groupée ; drapeau resté sans rôle éligible non rapporté | idem |
| UC-CPT-07-U09 | `grantable` | Habilitations appelées et non détenues ; jamais `admin` | idem |
| UC-CPT-07-U10 | `replace`, `Users::rolesOf`, `Electorate::ids` | Propriété : tout déclarer ne change ni `user_roles`, ni les rôles, ni l'électorat (RG4) | idem |
| UC-CPT-07-U11 | `Users::purge` | Déclaration et case purgées avec le compte, celles d'autrui intactes | idem |
| UC-CPT-07-U22 | code de `api/src` | Propriété, structure : hors de `DeclaredRoles`, seuls `routes/declared-roles.php` et `Admin/UserDirectory.php` citent `user_declared_roles`, `founding_circle` ou `DeclaredRoles` (commentaires exclus) ; aucune garde, ni l'électorat, ni la lecture d'un run (RG4) | idem |
| UC-CPT-07-U12 | `exportArchive` | `account.declaredRoles` à part de `account.roles`, archive 1.3.0 conforme, lecture seule | `web/test/usecases/unit/uc-cpt-07-declarer-roles-respire.test.js` |
| UC-CPT-07-U13 | `exportArchive`, schéma `archive-export` | Déclaration illisible (404, 500, mal formée) → omise, l'export part ; déclaration mal formée refusée par le schéma | idem |
| UC-CPT-07-U14 | `importArchive` | Une archive 1.3.0 s'importe, la déclaration n'est pas réimportée (aucun appel réseau) | idem |
| UC-CPT-07-U15 | `DECLARED_ROLES`, `FOUNDING_CIRCLE_ELIGIBLE`, `FOUNDING_CIRCLE_LABEL`, `declaredRoleLabel` | Copie du front = catalogue PHP (lu dans `DeclaredRoles.php`) : ordre, libellés, rôles éligibles, libellé de la case ; aucune habilitation sans déclaration | idem |
| UC-CPT-07-U16 | `fetchDeclaredRoles`, `saveDeclaredRoles`, `normalizeDeclaration` | `GET` normalisé, `PUT {roles, foundingCircle}` avec CSRF, `422` porteur des champs ; aucun événement `humanome:auth` (contrôle : `updateProfile` en émet un) | idem |
| UC-CPT-07-U21 | `docs/roles.md` | Le glossaire reprend le catalogue mot pour mot : identifiants dans l'ordre, libellés, définitions, habilitations, case du cercle | idem |
| UC-CPT-07-U25 | `HELP_ENTRIES.account` (`web/src/help/registry.js`) | Vocabulaire de l'aide de `#/compte` : l'habilitation s'attribue (« L'habilitation « apprenant » est attribuée par défaut… »), le rôle se déclare ; aucun point ne dit un rôle « attribué » | idem |
| UC-CPT-07-U17 | `DeclaredRolesSection` | Mention, neuf cases dans l'ordre décrites par leur définition, déclaration courante cochée, bouton inactif sans changement | `web/test/usecases/unit/uc-cpt-07-declarer-roles-respire-vue.test.jsx` |
| UC-CPT-07-U18 | `DeclaredRolesSection` | Case du cercle avec chacun des trois rôles éligibles, jamais avec les six autres ; retirée et décochée avec le dernier (A4) | idem |
| UC-CPT-07-U19 | `DeclaredRolesSection` | Déclaration entière dans l'ordre du catalogue, message « vos accès ne changent pas » ; `422` et `403` : message en alerte, saisie gardée | idem |
| UC-CPT-07-U20 | `DeclaredRolesSection` | Lecture impossible (`404`, `500`, API injoignable, catalogue vide) : message discret, ni alerte ni formulaire (E5) | idem |
| UC-CPT-07-U23 | `DeclaredRolesSection`, `global.css` | Définitions et note du cercle (0,85rem, annoncées par `aria-describedby`) à 4,5:1 au moins sur la surface de leur carte, dans les trois thèmes (clair, sombre du système, sombre choisi) | idem |
| UC-CPT-07-U24 | `DeclaredRolesSection` | Au clavier : le bouton garde le focus inactif, pendant et après l'enregistrement (`aria-disabled`, jamais `disabled`) ; « Enregistrement… » pendant l'envoi ; inactif, l'activer n'envoie rien | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-CPT-07-F01 | Nominal | API | Catalogue, déclaration avec la case, relecture ordonnée ; `/auth/me` garde ses `roles` | `api/tests/UseCases/Functional/UcCpt07DeclarerRolesTest.php` |
| UC-CPT-07-F02 | A1, A2 | API | Remplacement entier, case absente décochée, liste vide | idem |
| UC-CPT-07-F03 | E1 | API | Case sans rôle éligible → `422`, rien d'écrit, y compris en retirant le rôle qui la portait | idem |
| UC-CPT-07-F04 | E2 | API | `admin` (message), autres habilitations, inconnu, graphies, doublon, formes invalides, corps non objet, JSON malformé, corps de formulaire `roles[]=%C3` (UTF-8 invalide, jamais `500`) → `422` ; rien d'écrit | idem |
| UC-CPT-07-F05 | E3, E4 | API | Visiteur `401` ; `PUT` sans CSRF `403`, rien d'écrit | idem |
| UC-CPT-07-F06 | RG4 | API | Les neuf rôles et la case déclarés : `403` sur les espaces cartographe, promptologue, épistémiarque et admin, aucune auto-habilitation ; contrôle : chaque appel refusé, rejoué par un compte qui détient l'habilitation, passe la garde (`200`, ou `404` sur une invitation ou une proposition qui n'existe pas) | idem |
| UC-CPT-07-F07 | RG4 | API | Épistémiarque déclarée : vote `403`, aucun bulletin, hors de l'électorat ; contrôle : habilitée d'un clic, elle vote | idem |
| UC-CPT-07-F08 | RG4 | API | Cartographe déclarée, même liée : run Twin9 partagé aux cartographes `404` ; contrôle : habilitée, elle le lit (moteur factice, processus séparé) | idem |
| UC-CPT-07-F09 | RGPD | API | Suppression du compte : déclaration et case effacées, celles d'autrui intactes | idem |
| UC-CPT-07-F10 | RG6, RG4 | IHM | Propriété, six jeux d'habilitations : déclarer les neuf rôles et la case ne change ni les familles du menu, ni ses liens, ni le mode par défaut, à l'enregistrement comme après rechargement ; menu = `navGroups` des habilitations ; session non relue | `web/test/usecases/functional/uc-cpt-07-declarer-roles-respire.test.jsx` |
| UC-CPT-07-F11 | RG4, A3 | IHM | Contrôle positif : cartographe déclarée → ni « Encadrer et garantir », ni `#/cartographe` ; habilitée par l'administrateur → la famille et le mode expert à la session suivante | idem |
| UC-CPT-07-F12 | Nominal, A2 | IHM | Mention, catalogue, ligne « Habilitations » ; promptagogue, architecte et la case → `PUT` entier avec CSRF, confirmation, relu au rechargement ; tout décocher efface | idem |
| UC-CPT-07-F13 | A4, E1 | IHM | La case disparaît avec le dernier rôle éligible, le serveur ne la reçoit jamais seule ; `422` forcé → message du champ, rien d'écrit | idem |
| UC-CPT-07-F14 | E4, E5 | IHM | Session disparue → `403` affiché, rien d'écrit ; lecture en `500` → message discret, sans alerte, le profil et les clés restent utilisables | idem |

### Tests existants liés (non-régression)

- `api/tests/RgpdAuditTest.php` — règle CASCADE de `user_declared_roles.user_id`, empreinte d'un compte peuplé.
- `api/tests/UseCases/Functional/UcAdm01GererComptesRolesTest.php` (F26) et `…/Unit/UcAdm01GererComptesRolesTest.php` (U01, U28) — la liste de l'administration ; côté IHM, UC-ADM-01-U29, U30 et F27 (colonne « Rôles déclarés », « Habiliter »).
- `web/src/views/AccountView.test.jsx` — la lecture de la déclaration, hors de la file ordonnée des réponses d'authentification.
- `web/test/usecases/support/declared-roles-php.js` — catalogue, validation et `grantable` lus dans `DeclaredRoles.php`, pour les faux serveurs `cpt.js` et `adm.js`.

### Exécuter

```sh
(cd api && vendor/bin/phpunit --filter UcCpt07 --testdox)
cd web && npx vitest run test/usecases/unit/uc-cpt-07 test/usecases/functional/uc-cpt-07
```

## Limites

- Les rôles partagés avec EduChat (autre dépôt) n'en font pas partie.
- Les libellés et définitions sans source dans le dépôt sont neutres, à faire
  relire par Christian ([glossaire](../../roles.md)).
- La case « membre du cercle des fondateurs » est une déclaration comme les
  autres : personne ne la vérifie (aucune liste des fondateurs côté serveur),
  et elle n'ouvre rien.
- L'enregistrement remplace la déclaration entière sans contrôle de version :
  deux onglets ouverts sur `#/compte`, le dernier enregistré l'emporte.
