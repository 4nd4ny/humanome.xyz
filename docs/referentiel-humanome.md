# Le référentiel Humanome V18 (respire.school)

*S5, lot B, 22 octobre 2026.* Comment le référentiel publié sur
https://respire.school/referentiel entre dans la plateforme : sa conversion en
document du schéma `referentiel`, son amorçage hors vote, et ce que la
conversion a relevé dans la source.

## 1. Ce que c'est

- **Deux référentiels, deux identifiants.**
  - `respire` est **RESPIRE v7**, le référentiel de la plateforme : 7 pôles
    numérotés et 61 compétences `1.01`…`7.NN`.
  - respire.school/referentiel publie l'**Humanome V18** : identifiant
    `humanome`, version `18.0.0-proposition.1` du 29 septembre 2026, 5 pôles
    lettrés A à E, 20 capacités `A1`…`E4` et 64 facettes `A1.1`…`E4.4`.
    Licence CC-BY-SA, Harmonia Éducation.
- **Le nom du fichier source trompe.** La copie de travail de `humanotwin`
  s'appelle `docs/Referentiel_Respire_v8.18.yml` (une copie identique à l'octet :
  `docs/référentiel_humanome_v8.18.yaml`), mais elle contient `humanome`
  18.0.0-proposition.1.
- **L'Humanome ne s'importe jamais sous l'identifiant `respire`.**
  - Sa version passerait devant 7.1.0 : il deviendrait le référentiel par
    défaut de tous les parcours.
  - Les prompts l'appelleraient « RESPIRE ».
  - Le convertisseur et le script d'amorçage le refusent.
- **Dans l'interface**, son libellé est « Humanome V18 », que les prompts
  abrègent en « Humanome ». La mention de respire.school, la licence et
  l'empreinte du fichier converti sont dans le champ `source`.

## 2. Décisions de Christian (22 octobre 2026)

| Question (S5 §10) | Décision |
|---|---|
| Q1. Par le vote ou par l'amorçage ? | **Amorçage** : un script d'import idempotent, lancé en local. En production, Christian le fait (§5) ou passe par l'atelier |
| Q2. Niveau par défaut | **Capacité** : 20 compétences, les 64 facettes en éléments, que les fiches montrent sous chaque capacité |
| Q3. Rubriques versées | Les rubriques descriptives et observables présentes dans le YAML, sans rien inventer : définition, situation et relance comprises ; l'ancrage obligatoire aussi |
| Q4. Couleurs | La palette fixe par rang de la cartographie (`POLE_PALETTE`, 12 couleurs) |
| Q5. Jury propre à l'Humanome | Non, plus tard |
| Q6. Incohérence de l'en-tête `structure` | La signaler ici (§6) |

## 3. La conversion

`engine/src/referentiel-humanome.js` (`convertirHumanome`), sans DOM ni accès
au disque, et `scripts/convertir-humanome.mjs`, qui lit le fichier, le parse
(paquet `yaml`, dépendance de développement du moteur) et calcule l'empreinte.

| Cible | Source | Règle |
|---|---|---|
| `schemaVersion`, `kind` | — | `2.1.0`, `referentiel` |
| `id` | `referentiel.id` | Tel quel : `humanome`. Refus de `respire` et de tout identifiant hors de `[a-z0-9][a-z0-9._-]{0,63}` |
| `version` | `referentiel.version` | Telle quelle : `18.0.0-proposition.1`. Refus si elle manque ou n'est pas un semver |
| `label` | `referentiel.titre` | Le titre sans « Référentiel » ni sa version finale, puis « V » et la majeure : `Humanome V18` |
| `source` | — | Titre, version et date ; l'URL (`--url`, sinon la page https://respire.school/referentiel) ; le nom du fichier converti et son sha256 ; le convertisseur, sa version et le niveau ; la licence. Sans `--url`, l'URL est celle de la page qui publie le référentiel (l'attribution), pas l'origine vérifiée du fichier : c'est le sha256 qui identifie le fichier converti |
| `niveaux` | — | `capacité` `[A-E][1-4]`, puis `facette` `[A-E][1-4]\.[1-9]` : lettres et rangs déduits du contenu, puis vérifiés sur chaque code |
| `poles[]` | `dimensions[]` | `num` = rang de la lettre (A=1 … E=5 ; refus si les lettres ne se suivent pas depuis A) ; `nom` = `A · titre` ; `description` = `orientation` ; `couleur` = `POLE_PALETTE` au rang du pôle |
| `competences[]` | `dimensions[].competences[]` | `code` = `repere` (une lettre du pôle, un chiffre) ; `nom` = `titre` ; `pole` = rang ; `description` (voir ci-dessous) |
| `…elements[]` | `…facettes[]` | `code` = `repere` (celui de la capacité, un point, un chiffre) ; `nom` = `titre` ; `description` (voir ci-dessous) |

**Les descriptions** sont en Markdown, composées des seules rubriques
présentes, dans cet ordre :

- **une capacité** : la définition, puis **Finalité**, **Savoirs pratiques**,
  **Participation avec l'IA**, **Frontière**, **Limites** (liste),
  **Situation**, **Relance**, **Ancrage obligatoire** ;
- **une facette** : sa description, puis **Manifestations** (liste) et
  **Faux positif**.

Chaque rubrique est un libellé en gras, jamais un titre `#` : les fiches de
scan et l'import Markdown lisent les titres comme la structure du référentiel.
Une rubrique absente est omise, et le script le dit.

**Ce qui reste hors du document** :

- les identifiants sémantiques (`id`, `cle`) et les images des pôles ;
- `provenance_*` et `revision_*` ;
- `charte`, `principes_d_usage`, `contrat_d_analyse`, `parcours`, `sources` et
  les autres textes de cadrage, que le schéma ne représente pas (S5, E8).

**Les contrôles** :

- **refus**, avec le chemin dans le YAML :
  - un pôle qui ne suit pas la lettre attendue ;
  - un repère hors de sa forme ou de son pôle, en double, ou absent ;
  - un titre absent ;
  - une rubrique qui n'est ni un texte ni une liste de textes ;
  - un pôle sans capacité ;
  - au niveau facette, une capacité sans facette ;
- **avertissements**, sans refus :
  - chaque rubrique de `referentiel.structure` que le contenu dément ;
  - les rubriques attendues absentes ;
  - une licence absente.

**L'empreinte** (`contentHash`) est celle de `ContentHash::compute` : le JSON
compact des pôles `{num, nom, couleur}` et des compétences `{code, nom, pole}`.
Le document écrit est déjà dans l'ordre canonique que la base garde.

**Le niveau facette** (`--niveau facette`) : les 64 facettes deviennent les
compétences, sous le pôle de leur capacité, comme
`ReferentielRepository::auNiveau`. Ce document a la même identité
(`humanome` 18.0.0-proposition.1) et une autre structure : une version ne
s'amorce qu'à un niveau, et l'autre serait refusée (version immuable).

## 4. Amorcer la base de développement

Depuis la racine du dépôt, `.env.dev` exporté (`INSTALL.md` §2 et §3) :

```bash
node scripts/convertir-humanome.mjs "<chemin>/humanome_v18.yaml"
php scripts/amorcer-referentiel.php build/referentiels/humanome-v18.0.0-proposition.1.json
```

- **La conversion** écrit dans `build/referentiels/`, gitignoré et jamais
  déployé. Elle n'écrit pas dans `web/public/data/referentiel/`, que
  `deploy.mjs static` envoie et que l'export statique récrit.
  - Elle refuse d'écraser un fichier de même version tiré d'un autre YAML
    (autre sha256) : il faut une nouvelle version.
  - Relancée sur le même fichier, elle dit « déjà à jour ».
- **L'amorçage** publie la version **sans vote** (note de version « Amorçage
  hors vote (S5) »).
  - Il refuse RESPIRE et un identifiant invalide, puis valide le document
    (schéma, intégrité, empreinte déclarée).
  - Il est idempotent **sur le document entier**, pas seulement sur
    l'empreinte, qui laisse les descriptions de côté. La même version déjà en
    base avec un autre contenu est refusée : une version publiée est immuable,
    il en faut une nouvelle. Une version que tient l'atelier (brouillon,
    proposition) est refusée aussi.
  - Seul `source`, la provenance, reste hors de la comparaison. Le même YAML
    converti sous un autre nom (le `humanome_v18.yaml` de respire.school
    après la copie de `humanotwin`), avec une autre `--url` ou par une autre
    version du convertisseur est la même version. La ligne publiée garde la
    provenance du premier amorçage.
  - Relancé, il dit « déjà amorcé ».
- **Ensuite**, sans export statique ni redéploiement, la version est servie
  par `GET /api/referentiels` et `GET /api/referentiels/humanome/versions/18.0.0-proposition.1`,
  et proposée par les menus des parcours (S5, lot A).
- **Ne pas lancer `export-referentiel-static.php` ensuite** pour le déployer :
  l'index statique tiré de la base de développement proposerait l'Humanome là
  où la production ne l'a pas (S5, E10).

Fait le 22 octobre 2026 sur la base de développement du poste, alors vide :
migrations, RESPIRE 7.0.0 et 7.1.0 (`INSTALL.md` §3), puis l'Humanome. Les
routes publiques le servent, tel que converti.

## 5. En production (non exécuté)

La production n'a pas de shell (OVH mutualisé, ADR-008) : le script
d'amorçage n'y tourne pas. Deux chemins, au choix de Christian.

**(a) L'atelier, par le vote** (UC-EPI-05) :

1. ouvrir `#/epistemiarque/referentiels` ;
2. choisir le JSON converti en local, niveau « capacité » ;
3. « Importer », « Soumettre au vote », vote ;
4. « Publier ».

Ce chemin exige au moins un épistémiarque membre (S5, P1).

**(b) L'amorçage, sans vote**, par la route du déploiement
(`POST /api/admin/import-referentiel`, jeton `MIGRATE_TOKEN` de `.env.deploy`) :

```bash
curl -sS -X POST https://humanome.xyz/api/admin/import-referentiel \
  -H "X-Migrate-Token: <MIGRATE_TOKEN>" -H 'Content-Type: application/json' \
  --data-binary @build/referentiels/humanome-v18.0.0-proposition.1.json
```

- `{"status":"imported", …}` la première fois, `"unchanged"` ensuite.
- **Cette route est moins stricte que le script.** Elle ne refuse pas
  l'identifiant `respire` (le document converti ne le porte jamais) et ne
  compare que l'empreinte : la même version, d'autres descriptions, y passerait
  pour « unchanged ».
  - Vérifier donc d'abord que la version n'y est pas, par
    `GET /api/referentiels`.
  - Ne la réenvoyer qu'à l'identique.
- **Ne pas ajouter le fichier à `refFiles` de `deploy.mjs`** : chaque
  déploiement l'amorcerait, sans geste de Christian.
- **Pas de retour arrière par l'interface.** Une version publiée est
  immuable : la retirer demande du SQL à la main.
- **Vérifier ensuite** : `GET /api/referentiels` liste « Humanome V18 », et
  l'aperçu Twin9 d'un profil qui le désigne, à 0 appel, valide le jeu de
  gabarits (S5, P2).

## 6. Ce que la conversion a relevé dans la source (Q6)

Sur la copie de `humanotwin` (sha256
`3a5a318d631deaf7b1d3b761e8eec78ec05dc81135c0ef3f25529c4803c8b7f5`), le bloc
`referentiel.structure` ne décrit pas le contenu :

| Rubrique de `referentiel.structure` | Annoncé | Contenu |
|---|---|---|
| `poles` | 5 | 5 |
| `competences` | 18 | 20 |
| `facettes` | 57 | 64 |
| `competences_par_pole` | 3, 4, 4, 4, 3 | 4, 4, 4, 4, 4 |
| `facettes_par_pole` | 9, 14, 12, 12, 10 | 12, 14, 12, 12, 14 |
| `reperes_de_manifestation` | 114 | 128 |

- **Ce que le contenu confirme.** Les pages du site disent aussi 20
  capacités et 64 facettes, et la rubrique `identifiants` du YAML parle des
  « 20 capacités et des 64 facettes ».
- **Ce que fait le convertisseur.** Il compte dans le contenu et avertit de
  chaque écart.
- **À signaler en amont** (Stéphane, Harmonia Éducation) : le bloc ne suit
  plus le contenu, et un outil qui s'y fierait compterait 18 capacités.

**Provenance.** Le fichier converti est la copie de `humanotwin` : même
identifiant, même version, même date que celui de respire.school. Il n'a pas
été comparé à l'octet au fichier en ligne, qui n'a pas été téléchargé. Le
sha256 du fichier converti est écrit dans `source`, avec l'URL de la page
respire.school/referentiel, faute de `--url` : l'attribution, pas la preuve
que le fichier en vient.

## 7. Ce que donne le document converti

| Mesure | Humanome V18 (niveau capacité) | RESPIRE v7 |
|---|---|---|
| Pôles, compétences, éléments | 5, 20, 64 | 7, 61, 0 |
| Fiche de scan par pôle (`fichesDuReferentiel`) | 17,4 à 20,3 Ko | 12,9 à 19,2 Ko |
| Description d'une capacité | 2,1 à 3,8 Ko | — |
| Document JSON | 104 Ko | 7 Ko (7.0.0), 17 Ko (7.1.0) |

- **Twin9** réserve le pire cas de ses appels d'après la taille réelle des
  fiches (`ReferentielMoteur::tailles`) : il en tient compte de lui-même.
- **Les fiches d'un référentiel public** sont indexées comme matériel
  confidentiel par le filtre de fuite de Twin9 : une réponse qui en cite un
  long passage sera caviardée (S5, E4). À observer au premier run.

## 8. Limites

- **Le contrat de lecture** de l'Humanome (`contrat_d_analyse`, `charte`) ne
  passe pas dans le schéma. Un run sur l'Humanome suit le protocole v9.8 ou
  Twin6 (S5, E8).
- **Le jury.** Les pôles A à E reçoivent le « Spécialiste du pôle » générique
  (S5, E5 ; Q5 : plus tard).
- **Une seule version, immuable.** Un YAML corrigé sous la même version est
  refusé : il faut `18.0.0-proposition.2`, par exemple (S5, E3). Aucune
  synchronisation automatique avec respire.school.
- **Le choix au lancement de Twin9** (lot C) et la création simple d'un
  référentiel (lot D) viendront dans une PR suivante. D'ici là, Twin9 lit le
  référentiel d'un profil de `#/configuration`.

## 9. Tests

| Fichier | Vérifie |
|---|---|
| `engine/src/referentiel-humanome.test.js` | Sur la fixture **fictive** `schemas/fixtures/referentiel-humanome-fictif.yaml` : document attendu et valide au schéma ; libellé, `nomCourt`, niveaux, palette, codes ; composition et ordre des rubriques, rien d'inventé ; hors du document ; provenance ; avertissements ; empreinte de l'extracteur ; niveau facette ; refus, chacun à son chemin ; fiches de scan ; le script (écriture, « déjà à jour », refus d'écraser, YAML illisible) |
| `api/tests/ReferentielAmorcageTest.php` | Empreinte et ordre du serveur sur le document converti ; niveau facette identique à `auNiveau` ; amorçage publié sans vote puis idempotent, servi par les routes publiques ; même contenu sous une autre provenance (nom de fichier, URL) « déjà amorcé » ; autre contenu sous la même version, brouillon de l'atelier, RESPIRE, identifiant ou code invalides refusés ; la ligne de commande |
| `web/src/components/ReferentielChoice.test.jsx` | Le référentiel amorcé est proposé au menu et se charge tel que la base le sert |
