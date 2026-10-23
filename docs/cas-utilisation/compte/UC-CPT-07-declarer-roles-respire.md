# UC-CPT-07 — Déclarer ses rôles RESPIRE

| Champ | Valeur |
|---|---|
| **Acteur principal** | Tout utilisateur inscrit et connecté |
| **Acteurs secondaires** | Administrateur (voit les déclarations à côté des habilitations et habilite d'un clic, UC-ADM-01 A7) |
| **Portée** | humanome.xyz — `GET` et `PUT /api/auth/me/declared-roles` ; à côté du bloc « Affichage » de `#/compte` (IHM : lot suivant du sprint 8) ; l'archive de compte (UC-APP-06 RG11) |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §2 (glossaire des rôles) ; `TODO_LIST.md`, sprint 8 ; décision de Christian (prise par délégation) : séparer le rôle déclaré de l'habilitation ; `docs/autorisations.md` principe 7 ; registre RGPD §1 ter |
| **Statut** | Implémenté côté serveur (sprint 8, lot S8-1, migration 035) ; l'IHM de `#/compte` et de `#/admin/roles` vient au lot suivant |

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

L'utilisateur connecté ouvre `#/compte` et coche ses rôles (IHM du lot
suivant) ; côté API, le client appelle `PUT /api/auth/me/declared-roles`.

## Préconditions

- Session ouverte (UC-CPT-02) ; le client dispose du jeton CSRF.

## Garanties en cas de succès

- La déclaration du compte (`user_declared_roles`, `users.founding_circle`)
  est **remplacée en entier** par celle reçue, dans une transaction, sous le
  verrou de la ligne `users`.
- `user_roles` n'est jamais touché : `GET /api/auth/me` rend les mêmes
  `roles`, les gardes, le menu, l'électorat et la lecture des runs partagés
  ne changent pas.

## Garanties minimales (en cas d'échec)

- Rien n'est écrit (`422`, `401`, `403`) : la déclaration précédente reste.
- Aucune déclaration ne contient `admin`, une autre habilitation, un rôle
  hors des neuf, ou la case du cercle sans rôle qui la porte.

## Scénario nominal

1. Le client lit `GET /api/auth/me/declared-roles` : `200 {roles: [],
   foundingCircle: false, catalogue}` pour un compte qui n'a rien déclaré ;
   `catalogue` liste les neuf rôles dans l'ordre de la liste RESPIRE, chacun
   `{id, label, definition, habilitation, foundingCircleEligible}`.
2. L'utilisateur choisit ses rôles et, s'il a déclaré promptagogue,
   épistémiarque ou maître du grimoire, coche « Membre du cercle des
   fondateurs ».
3. Le client envoie `PUT /api/auth/me/declared-roles {roles,
   foundingCircle}` avec l'en-tête `X-CSRF-Token`.
4. `DeclaredRoles::validate` vérifie la déclaration entière (RG1 à RG4) ;
   `DeclaredRoles::replace` la revérifie et l'écrit.
5. `200 {roles, foundingCircle, catalogue}` : les rôles dans l'ordre du
   catalogue. Les habilitations du compte ne bougent pas.

## Scénarios alternatifs

- **A1 — Changer sa déclaration** (étape 3) : le `PUT` remplace tout ; un rôle
  absent de la liste n'est plus déclaré ; la case absente vaut « décochée ».
- **A2 — Ne plus rien déclarer** (étape 3) : `{roles: []}` efface la
  déclaration.
- **A3 — L'administrateur habilite** (hors de ce cas, UC-ADM-01 A7) : la
  déclaration reste telle quelle ; retirer l'habilitation ne la touche pas.

## Scénarios d'erreur

- **E1 — Case du cercle sans rôle éligible** (étape 4) : `422 {error:
  "Validation échouée", fields: {foundingCircle}}`, y compris quand le `PUT`
  retire le dernier rôle éligible en gardant la case.
- **E2 — Déclaration refusée** (étape 4) : `admin` (« ne se déclare pas :
  seul un administrateur l'attribue »), une autre habilitation (`apprenant`,
  `employeur`, `etablissement`), un rôle inconnu ou d'une autre graphie
  (`Cartographe`, `épistémiarque`), un doublon, une liste absente ou mal
  formée, un rôle non textuel, une case non booléenne, un corps qui n'est pas
  un objet JSON → `422 {error, fields}` ; rien n'est écrit.
- **E3 — Visiteur** : `401 « Authentification requise »` en lecture comme en
  écriture (et pour la session d'un compte purgé).
- **E4 — Jeton CSRF absent ou faux** (étape 3) : `403` du middleware global,
  rien n'est écrit.

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
  lecture de run partagé ne lit `user_declared_roles`. Trois déclarations ont
  une habilitation du même nom que l'administrateur accorde d'un clic
  (cartographe, promptologue, épistémiarque) ; les six autres n'en ont pas
  aujourd'hui.
- **RG5** — Aucun journal d'audit pour une déclaration (elle n'ouvre rien ;
  journalisation minimale, cahier §6.5) ; l'habilitation qui suit, elle, est
  auditée (`role_granted`).

## Libellés et définitions (à relire par Christian)

| Rôle | Libellé | Définition | Source |
|---|---|---|---|
| `cartographe` | Cartographe | Relit, commente, corrige, valide et garantit la cartographie produite pour un apprenant. | cahier §2, `content/formation/cartographe` |
| `promptologue` | Promptologue | Conçoit, teste, versionne et enrichit les prompts qui transforment un portfolio réflexif en cartographie de compétences. | cahier §2, `content/formation/promptologue` |
| `promptagogue` | Promptagogue | Accompagne les apprenants dans l'usage pédagogique des assistants d'IA. | aucune dans le dépôt (cahier §2 : rôle mentionné, repoussé ; rôle d'EduChat) — définition neutre |
| `eclaireur` | Éclaireur | Repère et partage de nouvelles pistes pour la communauté RESPIRE. | aucune — définition neutre |
| `architecte` | Architecte | Conçoit et fait évoluer l'organisation de l'écosystème RESPIRE. | aucune — définition neutre |
| `epistemiarque` | Épistémiarque | Édite collectivement le référentiel de compétences, en s'appuyant sur les échanges avec la société civile. | cahier §2, `content/formation/epistemiarque` |
| `mediateur` | Médiateur | Accompagne les apprenants sur le terrain, dans les écoles RESPIRE. | indirecte (« médiateurs en formation », `content/formation/noesiologie`, ch. 1) |
| `noesiologue` | Noèsiologue | Étudie et pratique la noèsiologie, l'étude des fonctions de l'esprit. | indirecte (`content/formation/noesiologie`, ch. 1) |
| `maitre-du-grimoire` | Maître du grimoire | Fait vivre le Grimoire, le répertoire des fonctions cognitives de la noèsiologie. | indirecte (le Grimoire de *De Humani Cerebri Fabrica*, même chapitre) |

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
| RGPD | `scripts/rgpd-audit.php` — `EXPORT_COVERAGE` | `user_declared_roles` : `archive` |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-CPT-07-U01 | `DeclaredRoles::CATALOGUE`, `catalogue` | Neuf rôles dans l'ordre de la liste, slugs ASCII ≤ 32, libellés, définitions d'une ligne, jamais `admin` | `api/tests/UseCases/Unit/UcCpt07DeclarerRolesTest.php` |
| UC-CPT-07-U02 | `FOUNDING_CIRCLE_ELIGIBLE`, `HABILITATIONS` | Trois rôles éligibles ; trois habilitations, chacune un rôle de `roles`, aucune `admin` ; six déclarations sans habilitation | idem |
| UC-CPT-07-U03 | `validate` | Ordre du catalogue, case absente = `false`, liste vide | idem |
| UC-CPT-07-U04 | `validate` | Refus : corps non objet, liste absente ou non liste, rôle non textuel, `admin`, autres habilitations, inconnu, casse, accent, doublon, case non booléenne (RG1) | idem |
| UC-CPT-07-U05 | `validate` | Case du cercle avec chacun des trois rôles éligibles seulement (RG2) | idem |
| UC-CPT-07-U06 | `replace`, `of` | Remplacement entier, `user_roles` intact ; compte inconnu ou supprimé → `false`, rien d'écrit (RG3) | idem |
| UC-CPT-07-U07 | `replace` | Revérification : déclaration refusée → exception, rien d'écrit | idem |
| UC-CPT-07-U08 | `ofUsers` | Lecture groupée ; drapeau resté sans rôle éligible non rapporté | idem |
| UC-CPT-07-U09 | `grantable` | Habilitations appelées et non détenues ; jamais `admin` | idem |
| UC-CPT-07-U10 | `replace`, `Users::rolesOf`, `Electorate::ids` | Propriété : tout déclarer ne change ni `user_roles`, ni les rôles, ni l'électorat (RG4) | idem |
| UC-CPT-07-U11 | `Users::purge` | Déclaration et case purgées avec le compte, celles d'autrui intactes | idem |
| UC-CPT-07-U12 | `exportArchive` | `account.declaredRoles` à part de `account.roles`, archive 1.3.0 conforme, lecture seule | `web/test/usecases/unit/uc-cpt-07-declarer-roles-respire.test.js` |
| UC-CPT-07-U13 | `exportArchive`, schéma `archive-export` | Déclaration illisible (404, 500, mal formée) → omise, l'export part ; déclaration mal formée refusée par le schéma | idem |
| UC-CPT-07-U14 | `importArchive` | Une archive 1.3.0 s'importe, la déclaration n'est pas réimportée (aucun appel réseau) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-CPT-07-F01 | Nominal | API | Catalogue, déclaration avec la case, relecture ordonnée ; `/auth/me` garde ses `roles` | `api/tests/UseCases/Functional/UcCpt07DeclarerRolesTest.php` |
| UC-CPT-07-F02 | A1, A2 | API | Remplacement entier, case absente décochée, liste vide | idem |
| UC-CPT-07-F03 | E1 | API | Case sans rôle éligible → `422`, rien d'écrit, y compris en retirant le rôle qui la portait | idem |
| UC-CPT-07-F04 | E2 | API | `admin` (message), autres habilitations, inconnu, graphies, doublon, formes invalides, corps non objet, JSON malformé → `422` ; rien d'écrit | idem |
| UC-CPT-07-F05 | E3, E4 | API | Visiteur `401` ; `PUT` sans CSRF `403`, rien d'écrit | idem |
| UC-CPT-07-F06 | RG4 | API | Les neuf rôles et la case déclarés : `403` sur les espaces cartographe, promptologue, épistémiarque et admin, aucune auto-habilitation | idem |
| UC-CPT-07-F07 | RG4 | API | Épistémiarque déclarée : vote `403`, aucun bulletin, hors de l'électorat ; contrôle : habilitée d'un clic, elle vote | idem |
| UC-CPT-07-F08 | RG4 | API | Cartographe déclarée, même liée : run Twin9 partagé aux cartographes `404` ; contrôle : habilitée, elle le lit (moteur factice, processus séparé) | idem |
| UC-CPT-07-F09 | RGPD | API | Suppression du compte : déclaration et case effacées, celles d'autrui intactes | idem |

### Tests existants liés (non-régression)

- `api/tests/RgpdAuditTest.php` — règle CASCADE de `user_declared_roles.user_id`, empreinte d'un compte peuplé.
- `api/tests/UseCases/Functional/UcAdm01GererComptesRolesTest.php` (F26) et `…/Unit/UcAdm01GererComptesRolesTest.php` (U01, U28) — la liste de l'administration.

### Exécuter

```sh
(cd api && vendor/bin/phpunit --filter UcCpt07 --testdox)
cd web && npx vitest run test/usecases/unit/uc-cpt-07
```

## Limites

- L'IHM (`#/compte`, `#/admin/roles`) et le test du menu « une déclaration ne
  change aucune famille » viennent au lot suivant du sprint 8.
- Les rôles partagés avec EduChat (autre dépôt) n'en font pas partie.
- Les libellés et définitions sans source dans le dépôt sont neutres, à faire
  relire par Christian.
