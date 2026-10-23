# Glossaire des rôles — habilitations et rôles RESPIRE déclarés

**Sources :** cahier des charges §2 (glossaire des rôles du site) ; `TODO_LIST.md`,
sprint 8 (rôles RESPIRE) ; `api/src/Auth/DeclaredRoles.php` (catalogue servi
par l'API) ; [matrice d'autorisations](autorisations.md), principe 7 ; fiches
[UC-CPT-07](cas-utilisation/compte/UC-CPT-07-declarer-roles-respire.md) et
[UC-ADM-01](cas-utilisation/administration/UC-ADM-01-gerer-comptes-roles.md).

Depuis le sprint 8 (migration 035), humanome.xyz distingue deux notions que le
mot « rôle » recouvrait. Décision de Christian, prise par délégation : les
séparer, pour qu'aucune auto-attribution n'ouvre de données d'élèves ni ne
donne une voix au vote du référentiel.

## Deux notions distinctes

| | Habilitation | Rôle déclaré |
|---|---|---|
| Ce que c'est | Un droit : ouvrir un espace, lire des runs partagés, voter, éditer | Une identité RESPIRE : ce que la personne se reconnaît |
| Qui l'attribue | L'administrateur seul (`#/admin/roles`, `POST /api/admin/users/{id}/roles`), jamais la personne elle-même ; `apprenant` est donné à l'inscription | La personne elle-même, dans `#/compte`, bloc « Mes rôles RESPIRE » (`PUT /api/auth/me/declared-roles`) |
| Ce qu'il ouvre | Les gardes de l'API (`RequireRole`, `RoleGuard`), les familles du menu (`web/src/nav.js`), le mode d'affichage expert par défaut (`web/src/lib/ui-mode.js`), l'électorat du référentiel, la lecture d'un run Twin9 partagé aux cartographes | **Rien** : aucune garde, aucune famille du menu, aucun mode par défaut, aucun vote ne le lit |
| Où il se voit | Profil (ligne « Habilitations »), administration (colonne « Habilitations »), archive de compte (`account.roles`) | Profil (bloc « Mes rôles RESPIRE »), administration (colonne « Rôles déclarés »), archive de compte (`account.declaredRoles`) |
| Stockage | `user_roles` | `user_declared_roles`, `users.founding_circle` |
| Suppression | Avec le compte (purge réelle) | Avec le compte (purge réelle) |

Le visiteur n'est ni l'un ni l'autre : c'est l'absence de session.

## Les sept habilitations

Les rôles du cahier des charges §2, attribués par l'administrateur.

| Habilitation | Ce qu'elle ouvre aujourd'hui |
|---|---|
| `apprenant` | La famille « Ma cartographie » : tableau de bord, portfolio, cartographies, analyse approfondie |
| `cartographe` | La famille « Encadrer et garantir » (file de relecture, comparer, consistance) ; la lecture des runs Twin9 partagés aux cartographes |
| `promptologue` | Dans « Faire évoluer », l'atelier de prompts ; avec `admin`, l'atelier Twin9 |
| `epistemiarque` | Dans « Faire évoluer », l'édition du référentiel ; une voix au vote des référentiels (l'électorat est fait des épistémiarques) |
| `employeur` | Aucune garde ni famille aujourd'hui : un lien partagé se consulte sans compte |
| `etablissement` | La famille « Piloter mon organisation » : cohortes, budget, runs de masse. Depuis l'ADR-013 : le seul compte dont le serveur garde une clé d'API (pour ses élèves) et le seul qui achète des crédits (packs PayPal) ; depuis le lot S6b, l'école qui paie les usages payants des membres de ses cohortes — sur son crédit, à sa surtaxe (3,5 % à 10 %), ou sur sa clé Anthropic — sous un plafond par élève et par mois, et voit ce que chacun a engagé, en montants seulement (« Mon école », `#/etablissement`) |
| `admin` | La famille « Administrer » et la supervision Twin9 ; pas un super-rôle : chaque garde le liste explicitement |

Les habilitations de travail (`cartographe`, `promptologue`, `epistemiarque`,
`etablissement`, `admin`) mettent l'affichage en mode expert par défaut ; un
rôle déclaré ne le fait jamais.

## Les neuf rôles RESPIRE déclarables

Dans l'ordre de la liste de Christian. Libellés et définitions repris mot pour
mot du catalogue de l'API (`DeclaredRoles::CATALOGUE`). Ils viennent du
cahier §2 et de `content/formation` quand ces sources existent ; sinon, ce
sont des définitions neutres d'une ligne. **Toutes sont à faire relire par
Christian.**

| Identifiant | Libellé | Définition | Habilitation du même nom | Case du cercle | Source de la définition |
|---|---|---|---|---|---|
| `cartographe` | Cartographe | Relit, commente, corrige, valide et garantit la cartographie produite pour un apprenant. | `cartographe` | — | cahier §2, `content/formation/cartographe` |
| `promptologue` | Promptologue | Conçoit, teste, versionne et enrichit les prompts qui transforment un portfolio réflexif en cartographie de compétences. | `promptologue` | — | cahier §2, `content/formation/promptologue` |
| `promptagogue` | Promptagogue | Accompagne les apprenants dans l’usage pédagogique des assistants d’IA. | aucune | proposée | aucune dans le dépôt (cahier §2 : rôle mentionné, repoussé) — neutre |
| `eclaireur` | Éclaireur | Repère et partage de nouvelles pistes pour la communauté RESPIRE. | aucune | — | aucune — neutre |
| `architecte` | Architecte | Conçoit et fait évoluer l’organisation de l’écosystème RESPIRE. | aucune | — | aucune — neutre |
| `epistemiarque` | Épistémiarque | Édite collectivement le référentiel de compétences, en s’appuyant sur les échanges avec la société civile. | `epistemiarque` | proposée | cahier §2, `content/formation/epistemiarque` |
| `mediateur` | Médiateur | Accompagne les apprenants sur le terrain, dans les écoles RESPIRE. | aucune | — | indirecte (« médiateurs en formation », `content/formation/noesiologie`, ch. 1) |
| `noesiologue` | Noèsiologue | Étudie et pratique la noèsiologie, l’étude des fonctions de l’esprit. | aucune | — | indirecte (`content/formation/noesiologie`, ch. 1) |
| `maitre-du-grimoire` | Maître du grimoire | Fait vivre le Grimoire, le répertoire des fonctions cognitives de la noèsiologie. | aucune | proposée | indirecte (le Grimoire de *De Humani Cerebri Fabrica*, même chapitre) |

`admin` et les autres habilitations (`apprenant`, `employeur`,
`etablissement`) ne se déclarent pas : le serveur répond `422`.

## La case « membre du cercle des fondateurs »

- Proposée, dans `#/compte`, seulement quand promptagogue, épistémiarque ou
  maître du grimoire est coché ; décocher le dernier de ces rôles la retire et
  la décoche.
- Le serveur la revérifie à chaque écriture : sans l'un de ces trois rôles, la
  déclaration est refusée (`422`).
- Comme les rôles déclarés, elle n'ouvre rien.

## Habiliter d'un clic

Trois déclarations ont une habilitation du même nom : cartographe →
`cartographe`, promptologue → `promptologue`, épistémiarque →
`epistemiarque`. Les six autres n'en ont pas aujourd'hui.

Dans `#/admin/roles`, la colonne « Rôles déclarés » montre la déclaration de
chaque compte. Pour chaque habilitation qu'elle appelle et que le compte n'a
pas encore (`grantable`), un bouton « Habiliter » l'attribue. C'est le même
`POST` que « Attribuer », audité de la même façon (`role_granted`).

- Retirer l'habilitation ne retire pas la déclaration : le bouton revient.
- L'administrateur ne modifie jamais les déclarations.

## Hors de ce glossaire

- **Les rôles partagés avec EduChat** (`is_promptagogue`, `is_teacher`, autre
  dépôt) n'en font pas partie : décision laissée à Christian.
- **Une habilitation obtenue après un parcours d'exerciseurs** (sprint 10)
  n'existe pas encore : aujourd'hui, seul l'administrateur habilite.
