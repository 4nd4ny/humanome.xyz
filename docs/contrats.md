# Contrats de données (P1)

Les schémas JSON de `schemas/` (draft 2020-12) sont **le contrat entre tous les
modules** (cahier §4.3, §4.5, §6). Doctrine : les schémas se déduisent des
exemples réels, pas l'inverse — on ne « corrige » jamais une donnée réelle pour
la faire rentrer dans un schéma, et on ne renomme pas un champ pour contourner
une friction : toute friction se documente ici.

Validation croisée de tout le corpus :

```
npm run validate:corpus          # à la racine (ou dans web/)
# = node scripts/validate-corpus.mjs
```

Le script valide, via `engine/src/validation.js` (ajv), les 59 documents jour
réels, `merge.json`, le référentiel réel et toutes les fixtures de
`schemas/fixtures/` (et `schemas/fixtures/carto/`). État actuel : **69 fichiers, 69 OK**. Le jumeau PHP
(`api/src/Validation.php`, opis/json-schema) charge les mêmes fichiers de
schémas ; les deux runtimes sont testés (`engine/src/validation.test.js`,
`api/tests/ValidationTest.php`) sur des documents jumeaux.

## 1. Rôle de chaque schéma

| Schéma | `kind` | Rôle |
|---|---|---|
| `referentiel.schema.json` | `referentiel` | Référentiel de compétences de toute structure depuis T15 (§9) : des pôles numérotés de 1 à N, les niveaux qu'il déclare avec le motif de leurs codes, ses compétences et leurs éléments plus fins ; RESPIRE v7 (7 pôles, 61 compétences « P.NN ») garde sa structure par une clause du schéma. Versionné semver + `contentHash` SHA-256, édité par les épistémiarques, historisé (cahier §4.1). Document réel : `web/public/data/referentiel/respire-v7.json`. |
| `cartographie-jour.schema.json` | `cartographie-jour` | Résultat de la cartographie d'UNE feuille de portfolio (une journée) : 7 pôles (pièces, examen adversarial du pédagogue, verdicts, rapport narratif) + synthèse kairos. Documents réels : `web/public/data/demo/jours/<date>.json` (59 feuilles). |
| `cartographie-merge.schema.json` | `cartographie-merge` | Agrégat chronologique de TOUTES les feuilles (merge évolutif v3) : séries temporelles par pôle et par compétence, archétypes, profil ipsatif, narratifs HTML. Source du sunburst. Document réel : `web/public/data/demo/merge.json`. |
| `prompt-package.schema.json` | `prompt-package` | Paquet promptologue : textes de prompts + variables + code JS d'orchestration (sandbox Web Worker) + métadonnées (version, auteur, modèle cible, référentiel compatible, changelog). |
| `competency-map-master.schema.json` | `competency-map-master` | Archive de l'interface de cartographie (`#/cartographie`, master v4, `schemaVersion` 4.x) : référentiel embarqué, journées et variantes (verdicts résumés), détail par journée (extraits, ancres, jury, portfolio du jour), délibérations de run, état de l'apprenant (cases, étiquettes, choix de variante, ensembles, réponses au jury, repères, notes, carnet du dialogue, préférences). Produite par l'espace Export de l'interface et embarquée par l'archive de compte. Fixture : `schemas/fixtures/carto/competency-map-master-exemple.json`, sortie EXACTE de l'interface (`web/scripts/carto-master-fixture.mjs`). |
| `archive-export.schema.json` | `archive-export` | Format pivot de portabilité (ADR-006) : archive autoporteuse embarquant portfolios en texte intégral, référentiels et prompt-packages COMPLETS, cartographies produites, jeux de l'interface de cartographie (`jeuxCartographie`, depuis la 1.1.0), analyses approfondies Twin9 du compte (`analysesTwin9`, depuis la 1.2.0, §8.5) et journal d'audit. Sert l'export/suppression RGPD, l'import de compte et le seed d'instance. Référence les 5 autres schémas par `$ref` sur leur `$id` absolu. |
| `twin9-profil.schema.json` | `twin9-profil` | Profil d'un run Twin9, décrit de bout en bout (`docs/plan-twin9-php.md` de `Twin_v9`, lot 4a, T12) : paramètres d'algorithme de la v9.8, troncatures comprises, collège des lecteurs, modèle et réglages de chaque étape, voie, plafonds, clé, gabarits, référentiel. Rangé dans `twin9_profils` (migration 024) ; document de référence : le profil v9.8, `api/config/twin9-profil-v98.json`. Validé côté PHP seulement (`ProfilRepository`) ; voir §7. |
| `twin9-protocole-contrat.json` | — | Pas un schéma : les variables que le moteur fournit à chaque gabarit du jeu v9.8, par son nom (noms seuls, ADR-010 §2). Une copie du jeu n'en emploie pas d'autre (§8.6, T14). Lu par `TemplateSets`, livré avec la release (`scripts/deploy/stage-api.sh`). |

Chaque document porte `schemaVersion` (semver du schéma d'enveloppe : « 1.0.0 »
partout, sauf l'archive de compte, « 1.1.0 » depuis le 2026-10-14 et « 1.2.0 »
depuis T10, un référentiel d'une autre structure que RESPIRE, « 2.0.0 »
depuis T15 (RESPIRE reste en 1.0.0, valide tel quel), et le master
de l'interface de cartographie, « 4.x ») et `kind` (discriminant, `const` dans
chaque schéma) — c'est la clé de dispatch de `validateDocument(kind, data)` des
deux runtimes.

Philosophie de fermeture : les **enveloppes** construites par nos
convertisseurs sont fermées (`additionalProperties: false`) ; les **blocs de
sortie LLM recopiés tels quels** (contenu de `poles[]`, `kairos`, `domains`,
`profilMeta`…) sont ouverts (`additionalProperties: true`) — seuls les champs
décrits sont garantis, de futurs runs peuvent en ajouter sans casser le
contrat.

## 2. Mapping formats legacy → schémas

### 2.1 `carto-data.js` (10 consts) → document `cartographie-merge`

Convertisseur : `scripts/convert/carto-data-to-merge-json.mjs` (parser :
`scripts/convert/lib/carto-data-parser.mjs`). Entrée :
`assets-existants/merge-prototype/carto-data.js` (lecture seule absolue),
sortie : `web/public/data/demo/merge.json`. Les constantes amont sont
**recopiées telles quelles, sans renommage de champ** ; l'enveloppe
(`schemaVersion`, `kind`, `generatedAt`, `source`, `periode`, `narratifs`,
`reserved`) est construite par le convertisseur.

| Const legacy | Destination dans le document merge |
|---|---|
| `domainsData` | `domains` (verbatim — 7 pôles, compétences agrégées, `parFeuille`, `rapport_html`, tendances) |
| `profilMeta` | `profilMeta` (verbatim) **et** enveloppe : `generatedAt` = `date_construction ?? null`, `source.protocole` = `source_protocole ?? null`, `source.journalId` = `journal_id ?? null`, `periode` = `{premiere_date, derniere_date, nb_feuilles}` |
| `kairosHtml` | `narratifs.kairosHtml` |
| `rapportHtml` | `narratifs.rapportHtml` (dans `carto-data.js` c'est littéralement `const rapportHtml = kairosHtml;` — le parser résout l'alias ; champ conservé distinct car le viewer hérité lit les deux) |
| `profilIpsatif` | `profilIpsatif` (verbatim — dictionnaire indexé « 1 » à « 7 ») |
| `feuillesData` | `feuilles` (verbatim, y compris `carto_day_url` — voir §2.3) |
| `connexionsData` | `reserved.connexionsData` (tableau vide dans le corpus) |
| `noeudsConceptuels` | `reserved.noeudsConceptuels` (tableau vide dans le corpus) |
| `patternTemporel` | `reserved.patternTemporel` (`{pattern: "", description: ""}` dans le corpus) |
| `piecesData` | `reserved.piecesData` (objet vide dans le corpus) |

### 2.2 `extracted/<date>/*.json` → document `cartographie-jour`

Convertisseur : `scripts/convert/extracted-to-day-json.mjs`. Entrée :
`assets-existants/merge-prototype/extracted/<date>/` (8 fichiers par journée :
`carto_P1.json` … `carto_P7.json` + `kairos.json` — sorties LLM brutes du
protocole Aurora v3), sortie : `web/public/data/demo/jours/<date>.json` +
`index.json`.

| Fichier amont | Destination dans le document jour |
|---|---|
| `carto_P<n>.json` (n = 1…7) | `poles[n-1]` (verbatim ; les 7 sont obligatoires, l'absence d'un pôle fait échouer la conversion) |
| `kairos.json` | `kairos` (verbatim ; `null` si le fichier est absent — prévu par le convertisseur, non observé dans le corpus : les 59 feuilles ont un kairos) |
| — | Enveloppe construite : `schemaVersion`, `kind`, `date` (= nom du dossier, AAAA-MM-JJ) |

`index.json` (hors schéma, fichier de service pour le fetch paresseux) liste
`{date, iso, label JJ/MM/AAAA, ordre}` par journée ; `feuilles[]` du merge a la
même forme plus `carto_day_url`.

### 2.3 Liens `feuilles/<date>/carto-day.html` → routes `#/jour/<iso>?focus=<code>`

Le HTML narratif hérité (les `feedback` de compétences du merge en contiennent
1262, plus `feuilles[].carto_day_url`) pointe vers des pages
`feuilles/<date>/carto-day.html?focus=<code>` du prototype **qui n'existent pas
dans les assets**. Décision (plan-fusion-visu, ADR-009) :

- les données sont conservées **telles quelles** dans `merge.json` (on ne
  réécrit pas la donnée) ;
- les liens sont **réécrits au rendu**, après sanitization DOMPurify, vers la
  route hash `#/jour/<iso>?focus=<code>` de la vue Journée reconstruite depuis
  les documents `cartographie-jour`.

## 3. Écarts observés entre exemples réels et schémas, et traitement

Écarts relevés lors de la déduction des schémas depuis le corpus réel
(59 feuilles, 413 pôles, 3590 verdicts), tous absorbés par le schéma — la
donnée réelle est la vérité :

| Écart observé | Traitement dans le schéma |
|---|---|
| `poles[].rapport` absent de la sortie LLM sur 8 pôles / 413 | `rapport` requis mais nullable (`oneOf` null) |
| `pedagogue: null` sur toutes les compétences court-circuitées **et** sur 40 compétences non court-circuitées | `pedagogue` requis mais nullable ; `courtCircuit` reste le discriminant du profil de verdict |
| Deux profils de `verdict` : complet (`motif`, `prescription`) après examen du pédagogue vs court-circuit (`raison`, `prescriptionMinimale`, 0 preuve / 0 indice) | les 4 champs textuels sont optionnels ; seuls `statut`, `confiance`, `nombrePreuves`, `nombreIndices` sont requis |
| `passagesSaillants[].auteur` présent sur 2942/3042 passages, `feuille` sur 2654/3042 | champs optionnels |
| `pieces[].auteur` présent sur 304/4098 pièces, `extraitVerbatim` sur 238/4098 (sinon l'extrait se retrouve via `pid`) | champs optionnels |
| `generatedAt` / `date_construction` sans fuseau horaire (`AAAA-MM-JJThh:mm:ss`) | pattern dédié, pas de `format: date-time` |
| `tendance_temporelle` : 3 valeurs observées seulement (`presence_reguliere`, `pic_milieu`, `crescendo`) | pas d'enum (vocabulaire non fermé), valeurs en `examples` |
| `domains[].competences[].statut` : seule « présence établie » observée (le merge ne retient que les compétences établies) | enum complet des 3 statuts conservé (contrat plus général que le corpus) |
| `archetype` : 6 valeurs toutes observées | enum fermé |
| `profilMeta.ponderation_temporelle` **absente du corpus** mais lue par le viewer historique (`cartographie.html` affiche « -X %/an ») | champ **optionnel** documenté dans le schéma (`decote_annuelle` seul champ consommé) — voir §4 |
| Fixtures `referentiel-mini.json` et référentiel embarqué dans `archive-export-exemple.json` : 2 pôles / 4 compétences, en contradiction assumée avec le schéma (7/61) | **fixtures corrigées** (2026-07) : remplacées par un instantané du référentiel réel RESPIRE v7 (`schemas/fixtures/referentiel-respire-v7.json`) ; références alignées (`referentielCompatible`, `referentielId: "respire"`, `referentielVersion: "7.0.0"`, exemples de variables). Le schéma n'a pas été assoupli : 7 pôles / 61 compétences sont une propriété structurelle de RESPIRE v7, cohérente avec le document réel ; un référentiel de forme différente imposera une révision majeure conjointe schéma + référentiel. **T15 a fait cette révision** (schéma 2.0.0, §9) : toute structure, et RESPIRE gardé à 7/61 par une clause du schéma. |

Notes de cohérence hors de portée de JSON Schema (vérifiées par le code, pas
par les schémas) : jointures `pid` → `passagesSaillants`, `pieceId` →
`pieces[].numero`, cohérence `type`/`document` des cartographies d'archive
(clauses if/then), cohérence référentielle des archives
(`referentielId`/`referentielVersion` → `referentiels[]`), et `contentHash` du
référentiel = SHA-256 de `JSON.stringify({poles, competences})` tel que calculé
par `scripts/extract-referentiel.mjs`.

## 4. Décisions

1. **Noms de champs français conservés tels quels.** Les sorties LLM et les
   constantes legacy nomment leurs champs en français (`passagesSaillants`,
   `courtCircuit`, `presomptionSycophantie`, `score_cumule`…), et mélangent
   camelCase (jour) et snake_case (merge). C'est le contrat réel : aucun
   renommage, aucune normalisation de casse. Les conventions « code en
   anglais » s'appliquent au code, pas aux données.
2. **HTML narratif pré-rendu stocké en chaîne, sanitizé au rendu (ADR-007).**
   `narratifs.kairosHtml`, `narratifs.rapportHtml`, `domains[].rapport_html`,
   `competences[].feedback` sont du HTML hérité stocké tel quel dans les
   documents. Le schéma ne contraint pas leur contenu ; ils passent par
   DOMPurify côté client avant toute injection, et la réécriture des liens
   (§2.3) se fait après sanitization.
3. **`rapportHtml` est un alias de `kairosHtml` dans le corpus actuel**
   (`const rapportHtml = kairosHtml;` dans `carto-data.js`). Les deux champs
   restent distincts dans le schéma (requis tous les deux) car le viewer lit
   les deux et qu'ils pourront diverger.
4. **Champs réservés vides conservés** (`reserved.connexionsData`,
   `reserved.noeudsConceptuels`, `reserved.patternTemporel`,
   `reserved.piecesData`) : constantes amont vides mais présentes dans le
   contrat du viewer hérité. Regroupées sous `reserved` (structure interne non
   garantie) plutôt que supprimées, pour compatibilité et pour accueillir de
   futurs merges qui les rempliraient.
5. **`ponderation_temporelle` optionnelle, absente du corpus.** Le viewer
   historique sait l'afficher, aucun document réel ne la porte : elle est
   spécifiée optionnelle dans `profilMeta` (avec `decote_annuelle` requis quand
   elle est présente) au lieu d'être inventée dans les données.
6. **Corpus démo intouchable.** `web/public/data/**` est régénéré uniquement
   par les convertisseurs depuis `assets-existants/` (lecture seule absolue) :
   `node scripts/convert/carto-data-to-merge-json.mjs && node
   scripts/convert/extracted-to-day-json.mjs && node
   scripts/extract-referentiel.mjs`. Un artefact bogué se corrige dans le
   convertisseur, jamais dans le JSON produit.
7. **`PUT /api/prompt-packages/drafts/{draftId}` accepte deux formes de corps**
   (friction M7 constatée à l'intégration) : la notation `{document}` du
   contrat M7 a été lue « enveloppe `{"document": …}` » côté front (analogie
   avec `POST /api/cartographies/{id}/revisions {document, note}`) et
   « le corps EST le document » côté API (analogie avec l'import admin). Les
   deux implémentations étant testées et livrées, la route désambiguïse au
   lieu de renommer : si le corps porte une clé `document` objet, c'est
   l'enveloppe (un prompt-package valide n'a jamais de champ `document`
   objet) ; sinon le corps est le document nu. Réponses inchangées.

8. **Twin6 dans l'atelier : paquet PUBLIÉ « twin6-ouverte », immuable, réservé
   (D1/AD-D1).** Le protocole open source Twin6 alimente DEUX artefacts depuis
   un SEUL corpus (`web/public/data/twin6/prompts/*.md`) : le paquet statique
   public servi par `#/twin6-ouverte` (`scripts/build-twin6-package.mjs`) et un
   document `prompt-package` importé publié en base
   (`scripts/build-twin6-prompt-package.mjs`, `build/prompt-packages/`), forkable
   dans l'atelier promptologue au même titre qu'`aurora-v3-reconstruit`. Les
   textes scan-pole / kairos / fiches P1..P7 sont **byte-identiques** entre les
   deux (source unique, prouvé par `twin6-prompt-package.test.js`).
   - **Sémantique de version.** Une version publiée de `twin6-ouverte` est
     **immuable** : une évolution du référentiel/corpus produit
     `twin6-ouverte@1.1.0`, etc. (jamais une réécriture de `1.0.0`). L'import est
     idempotent par hash de contenu ; un contenu DIFFÉRENT sous un couple
     (id, version) existant est un 409.
   - **Réservation.** `metadata.reserved: true` marque le paquet comme propriété
     du **pipeline source-unique**. Un promptologue ne peut pas republier sous le
     nom `twin6-ouverte` : `POST /api/prompt-packages/drafts` exige alors un
     `toId` (nouveau nom de paquet, slug frais) — le fork est SA copie, publiée
     sous son propre nom. Le drapeau `reserved` remonte dans
     `GET /api/prompt-packages` pour piloter l'UI.
   - **Exécution déléguée au moteur.** `code.orchestration` porte le marqueur
     `engine://…(twin6)` : le banc d'essai et `#/twin6-ouverte` appellent
     `executerTwin6` sur le portfolio **entier** (7 scan-pôle + kairos →
     `cartographie-merge`), jamais l'extraction par jour d'aurora.

9. **Archive de compte 1.1.0 : les jeux de l'interface de cartographie
   (2026-10-14, journal de la cartographie D-25, question 10 : « tout
   sauvegarder »).** `archive-export` gagne une propriété OPTIONNELLE,
   `jeuxCartographie[]` : chaque jeu de données de l'interface (`#/cartographie`,
   son propre stockage IndexedDB) y est embarqué en archive complète du master
   v4 (`competency-map-master`), portfolio et carnet du dialogue compris ; la
   démonstration publique (`origin: "demo"`) n'y est pas tant qu'elle est
   intacte (dès que la personne y ajoute quelque chose, elle part ; journal
   D-41). Ajout rétro-compatible
   en lecture : une archive 1.0.0 reste valide et s'importe ; en revanche une
   instance 1.0.0 refuserait une archive 1.1.0 (racine fermée) — sans objet
   tant qu'il n'existe qu'une instance, à garder en tête pour le seed d'une
   instance clonée.
   - **Schéma du master v4 ouvert à la racine, contrairement aux enveloppes.**
     Le master est l'état vivant d'une interface qui évolue, et l'archive de
     compte, qui l'embarque, sert la portabilité RGPD : un champ inattendu ne
     doit jamais faire échouer l'export de quelqu'un. Le schéma type donc
     strictement l'ossature dont dépendent les calculs (journées, variantes,
     verdicts, traces, énumérations de statut, de rôle et de choix de variante,
     confiances dans [0 ; 1], compteurs entiers) et l'état de l'apprenant
     (réponses, ensembles, repères, carnet), et laisse ouverts la racine
     (version 4.x ultérieure) et les contenus produits par les analyses
     (réflexions du jury, rapports de pôle, kairos, délibérations), dont la
     forme varie selon la chaîne (Aurora v3, AuroraCore, site, fusion).
   - **Stockage illisible ≠ export bloqué.** Si le stockage de l'interface ne
     peut pas être lu, l'archive part sans les jeux et le compte rendu le dit
     (« exportez-les depuis l'espace Export de la cartographie »). De même,
     chaque jeu est validé seul : un jeu non conforme (un master édité à la
     main, puis importé) est laissé de côté et nommé, le reste de l'archive
     part (relecture du 2026-10-14, journal D-41).

10. **Master v4 : une exception au « sans perte », les textes complets qui
    redisent leurs rubriques (2026-10-16, journal de la cartographie D-66).**
    Christian : « Élimine toutes les redondances d'informations dans les
    fichiers construits. » Une analyse Aurora v3 livre, à côté des rubriques
    du portrait kairos (`portrait`, `formeProfil`, `ceQuiRelieLesPoles`,
    `ceQuiEmergeEntreLesLignes`, `invitationsPourLaSuite`) et du rapport de
    pôle (`portraitPole`, `territoiresDenses`, `territoiresNonVisites`,
    `emergencesPole`, `pistes`), un texte complet rédigé
    (`syntheseCompleteMarkdown`, `rapportCompletMarkdown`) qui les redit. À
    l'import (Aurora v3, master V3) et à la relecture d'une archive, ce texte
    n'est gardé que s'il ajoute au moins une phrase à ses rubriques
    (`web/src/carto/core/restatement.js` : une phrase est « déjà dite » quand
    chacun de ses mots s'y retrouve, dans une suite de quatre, à la
    typographie et au balisage près ; seules les étiquettes d'un extrait et
    une coquille sont pardonnées, jamais une négation, un nombre ou un mot
    changé) ; sinon le champ `markdown` du détail vaut `null`. Les champs gardent leurs noms et leurs types, aucun n'est
    renommé : une archive 4.x reste lisible dans les deux sens. Une archive
    réimportée perd donc ce texte-là, et seulement lui ; les fichiers
    d'analyse d'origine, eux, ne sont pas touchés. Mesuré sur la
    démonstration : les 59 synthèses complètes ne disent rien de plus que
    leurs rubriques ; 174 rapports complets de pôle sur 405 non plus.
    - **Pas fait** (question 40 du journal, non retenu le 2026-10-16) : un
      extrait est encore gardé jusqu'à trois fois par journée — dans les
      passages saillants, dans les pièces du Greffier et dans chaque trace
      qui les cite (avec son contexte et ses ancres, 1,6 Mo sur 15,8 Mo pour
      la démonstration). Ne le garder qu'une fois, la trace renvoyant à sa
      pièce, retire `extract` des traces : c'est un changement de contrat
      (un lecteur 4.x lit `traces[id].extract`), donc une version 5 du
      master, avec sa conversion.

11. **Master v4 lu à la demande : un index et ses fichiers (2026-10-16,
    journal de la cartographie D-67).** Une archive (`buildArchive`) se
    découpe (`web/src/carto/core/split.js`, script
    `web/scripts/carto-demo-split.mjs`) en un **index** — l'archive elle-même,
    `details` et `runDetails` vides — et des fichiers statiques rangés par ce
    que l'interface ouvre, sous un dossier de version (`v-` + douze
    caractères hexadécimaux de l'empreinte du contenu) :
    `jours/<date>.json` (`{date, variants: {<id>: ce qui ne tient qu'à la
    journée}}`, avec `passageOrder` — le pôle de chaque passage, dans l'ordre
    d'origine — quand cet ordre n'est pas celui des pôles), `portfolio/<date>.json` (`{date, portfolio}`),
    `competences/<code>.json` (`{code, days: {<date>: {<id>: verdict}}}`),
    `poles/<n>.json` (`{pole, days: {<date>: {<id>: {report?, audit?,
    passages?}}}}`), `lectures/<clé>.json` (`{key, value}`). L'index dit où
    est chaque fichier dans une propriété facultative, `remote` (`{version,
    base, days, portfolio, codes, poles, runs}` : clé → chemin relatif à
    `base`), typée dans le schéma (ajout 4.x). Chaque information est dans un
    fichier, un seul ; remontée à partir des fichiers, chaque journée est
    celle de l'archive (`assembleDay`). Aucun champ renommé ni déplacé dans
    le détail d'une journée : un lecteur 4.x qui ne connaît pas `remote` voit
    une archive sans détails.
    - **Un index n'est pas une archive à fusionner** : il ne s'ouvre que par
      le chargeur de la démonstration du site (importé d'un fichier : refusé,
      compte rendu bloquant `index-a-la-demande`), et seulement dans un jeu
      neuf — un jeu qui a déjà une journée, un passage sans date, une
      synthèse ou une seconde lecture n'en prend rien. `base` est un dossier
      relatif, sur le même site (ni adresse, ni chemin absolu, ni « .. ») :
      un autre renvoi n'est pas suivi. Exporté, un jeu lu à la demande rend
      l'archive complète, sans `remote`.
    - **Un jeu où la personne a mis quelque chose à elle devient d'ici** :
      ses fichiers sont copiés dans son navigateur (`materialize`), `remote`
      disparaît de son index et n'y revient jamais (un enregistrement qui le
      porterait encore le perd) ; un échec se retente au retour du réseau,
      puis à chaque ouverture. Un dossier de version peut donc se retirer du
      site quand la place manque (100 Mo pour l'hébergement gratuit, 20 par
      version) : une démonstration intacte se met à jour d'elle-même (D-57).
    - **Ce que la personne ajoute** à un tel jeu (un passage, une analyse)
      est rangé dans son navigateur et lu par-dessus les fichiers ; un texte
      de journée qu'elle n'a pas changé reste celui du site.

12. **Secondes lectures, `readings` (2026-10-16, journal de la cartographie
    D-68).** Ajout 4.x facultatif : `readings[]`, une entrée par analyse
    jointe aux compétences sans faire le soleil — `{id, source, journal,
    analysedAt, importedAt, codes: {<code>: {status, rawStatus, confidence,
    proofs, hints}}, poles: [n]}`. Aujourd'hui, un run AuroraCore importé
    dans un jeu qui a ses analyses par journée (ou qui en reçoit dans le même
    lot) : ses délibérations restent dans `runDetails` sous « <id>|<code> »
    et « <id>|pole:<n> », ses verdicts n'entrent dans aucune journée, ses
    feuilles n'ajoutent aucune journée. Un run déjà réparti sur les journées
    (importé seul, avant) n'est pas joint une seconde fois. Les calculs
    (soleil, heatmap, comparaison) ne lisent pas `readings`. Une archive
    réimportée joint ses lectures par identifiant, sans doublon ; celles qui
    sont déjà là gagnent.

13. **Archive de compte 1.2.0 : les analyses approfondies Twin9 (T10,
    ADR-011 §5).** `archive-export` gagne une seconde propriété OPTIONNELLE,
    `analysesTwin9` : les runs Twin9 du compte et la mémoire de leurs cartes,
    qui vivent sur le serveur, tels que `GET /api/twin9/mes-analyses` les rend
    (§8.5). Le schéma type leur ossature (`runs[]` : `id`, `journal`,
    `statut`, `profil`, `portfolio {nom, texte}`, `appels[]`, `sorties` ;
    `cartes[]` : `journal`, `referentiel`, `gabarits`, `memoire`) et laisse
    ouverts leurs contenus, ceux du moteur. Absente quand le compte n'a aucun
    run ; jamais réimportée : un run se relance. Ajout rétro-compatible en
    lecture, comme la 1.1.0.

## 5. Note d'outillage

`engine/src/validation.js` importe les schémas en imports JSON « nus »
(compatibles Vite, sans `with { type: 'json' }`, non supportés par toutes les
chaînes). Node ≥ 17.5 les refuse : `scripts/validate-corpus.mjs` enregistre
donc un hook de loader (`node:module` `register`) qui sert les `.json` comme
modules ES, ce qui permet de valider le corpus avec **exactement** le même code
que l'application, sans dupliquer la configuration ajv.

## 6. Frictions de format relevées par les cas d'utilisation (2026-09)

L'analyse des cas d'utilisation (`docs/cas-utilisation/`) a mis au jour des
écarts de format **entre modules**. Conformément à la règle du dépôt, aucun
champ n'a été renommé pour les contourner : chacun est décrit ici et dans la
fiche concernée (section « Anomalies constatées »), et le comportement actuel
est figé par un test vert commenté comme tel.

| Producteur → consommateur | Écart | Effet | Fiche |
|---|---|---|---|
| Assistant de run (`web/src/lib/run-launcher.js`) → archive (`web/src/lib/archive.js`, schéma `archive-export`) | `runMeta` écrit `{mode, provider, model, generatedAt, usage}` ; l'archive n'accepte que `{modele, dateRun, tokens?, coutEstime?}` | À l'export, `modele` devient « inconnu » et les jetons mesurés sont perdus | UC-APP-06 (A-02) |
| Runner Node (`scripts/runner-node/runner.mjs`) → `POST /api/worker/jobs/{id}/result` (`api/src/routes/worker.php`) | Le runner envoie `tokens: {inputTokens, outputTokens}` ; la route lit `tokens.input` / `tokens.output` | Les jetons des journées traitées par le runner sont enregistrés à 0 | UC-SYS-01 |
| `GET /api/referentiel/versions` (`ReferentielRepository::metadata`) → banc d'essai et rétrospective (`web/src/views/promptologue/BancEssaiSection.jsx`, `retro.js`) | L'API renvoie la clé `semver` ; le front filtre sur `version` | Seul le référentiel embarqué est proposé au banc ; la rétrospective ne propose jamais de référentiel plus récent | UC-PRO-05, UC-PRO-06 (AN-1) |
| `GET /api/cartographies` → `RetroSection.jsx` | L'API renvoie `type` ; le front affiche `kind` | Le type des cartographies n'apparaît pas dans la liste | UC-PRO-06 |
| Schéma `cartographie-jour` → `DayView.jsx` (`findDayNode`) | `poleNum` est une **chaîne** (`"1"`…`"7"`) ; la vue le compare à un **nombre** | Le rapport d'un pôle n'est jamais affiché sur un document conforme | UC-VIS-01 (AN1) |
| Corps JSON décodé en tableaux PHP → `Validation::validate` | Un objet vide `{}` (ex. `reserved.piecesData` des documents merge) devient `[]` et le schéma, qui exige un objet, le refuse | Révision d'un parcours (merge) réel refusée en 422 | UC-CAR-04 (AN3) |
| Colonnes `JSON` MySQL → diff de configuration Twin9 (`web/src/views/admin/Twin9Section.jsx`) | MySQL réordonne les clés des objets stockés | Après le premier enregistrement, le diff signale des changements fictifs | UC-ADM-05 |

Les autres anomalies (comportements, gardes, messages) sont indexées dans
[`docs/cas-utilisation/README.md`](cas-utilisation/README.md#index-des-anomalies-de-production).

## 7. Le profil Twin9 (`twin9-profil`, T12)

Un profil décrit un run Twin9 de bout en bout ; le moteur l'exécute tel quel
(`docs/plan-twin9-php.md` de `Twin_v9`, lot 4a). Le schéma est
`schemas/twin9-profil.schema.json` ; `api/src/Twin9/ProfilRepository.php`
valide et range les profils.

- **Le profil v9.8**, `api/config/twin9-profil-v98.json`, est le profil par
  défaut, en lecture seule : Haiku 5.5 aux lecteurs (un lecteur en trois
  passes) et à l'analyse rapide, Sonnet 5.5 à l'analyse profonde, la voie
  par lots, et pour tout le reste les valeurs du `config.json` de la v9.8.
  Chacun range ses propres profils (`twin9_profils`), partis d'une copie.
- **Fermé** : toute clé inconnue est refusée, à tous les niveaux. Aucune
  température : les modèles 5.5 la refusent.
- **Valeurs par défaut** : un réglage absent prend la valeur que le schéma
  lui donne (`default`), comme la v9.8 lit son `config.json` avec
  `.get(clé, défaut)` ; un réglage sans valeur par défaut est obligatoire
  (le collège, les étages, la famille d'un lecteur…). Le profil rangé est
  complet : le moteur n'a rien à deviner. Le validateur PHP (opis) ne
  vérifie pas `required` pour une propriété dotée d'un `default` (option
  `allowDefaults`) : `ProfilRepository` complète donc le profil avant de le
  valider.
- **Objets JSON** : un profil voyage décodé en objets (`stdClass`) ou en
  texte JSON, jamais en tableau PHP, où `{}` et `[]` se confondraient (§6,
  UC-CAR-04). MySQL réordonne les clés d'un profil rangé (§6, UC-ADM-05) ;
  rien n'en dépend.
- **Validation** : PHP seulement. Le profil n'est pas un document que le
  moteur du navigateur produit ou lit ; `scripts/build-validators.mjs` ne le
  compile pas. La page `#/configuration` (T13) se construit depuis le schéma
  et laisse au serveur la validation, dont elle affiche le message.
- **Nombres** : un réglage que le schéma type `number` garde la forme d'un
  flottant (`1.0`, non `1`), quelle que soit la forme reçue : le navigateur
  ne distingue pas `1` de `1.0`, et la v9.8 lit `1.0` (T13).
- **Règle de l'API** (T13) : la réflexion coupée refuse les efforts `xhigh`
  et `max`, pour toute étape où les réglages se combinent ainsi
  (`CallSettings::parEtape`) ; le profil est refusé, l'étape nommée.
- **Choix admis** (`ProfilPolicy`, T13) : un référentiel publié et, s'il est
  donné, une de ses versions publiées ; un jeu de gabarits que son
  propriétaire peut choisir (T14, §8.6 : le jeu v9.8, le jeu par défaut, ses
  copies tant qu'il est de l'atelier) ; la clé personnelle là où
  l'administrateur l'a ouverte. Les droits sont au chapitre « Configuration
  Twin9 » de `docs/autorisations.md`. Le profil par défaut, que sert
  `GET /api/twin9/configuration` (`defaut`) et que prend un run lancé sans
  profil, est celui de la v9.8 avec le jeu de gabarits par défaut.

### 7.1 Ce que la v9.8 règle, et où le profil le range

| `config.json` de la v9.8 | Profil |
|---|---|
| `seuils_consensus`, `juge_leger`, `jury`, `premiere_impression`, `calques`, `merge`, `scan_global` | mêmes clés, mêmes valeurs dans le profil v9.8 (`ProfilTest` le vérifie sur le `config.json` de `TWIN_V9_DIR`) |
| `max_workers`, `parallel_jures` | `parallelisme.appels_directs` : réglages d'exécution, sans effet sur aucun prompt |
| `backend_tribunal`, `backend_rapide` | `etages.profond`, `etages.rapide` (modèle Claude, budget de sortie, effort, réflexion) |
| `backend_tribunal_local` | sans objet : le backend local de `--donnees-reelles` ; l'accord de l'apprenant le remplace (ADR-011) |

| Option de `twin9.py` | Profil |
|---|---|
| `--jours N` | `jours` (`null` : toutes) |
| `--sans-relectures` | `merge.relectures` |
| `--rescan` | `rescan` |
| `--sans-etat` | `memoire` |
| `--models nom:N` | `college` (un lecteur et ses `passes`) |
| `--modele-tribunal`, `--modele-rapide` | `etages.profond.modele`, `etages.rapide.modele` |
| `--jury`, `--jury-taille` | `jury.mode`, `jury.taille_aleatoire` |
| `--leger-passes`, `--sans-contre-lecture` | `juge_leger.passes`, `juge_leger.contre_lecture` |
| `--scan-global` | `scan_global.enabled` |
| `--portfolio`, `--out`, `--roster`, `--config`, `--etat`, `--mock`, `--salt`, `--donnees-reelles` | hors profil : fichiers, simulé, garde des données sensibles |

S'y ajoutent ce que la plateforme règle : `mode` (« test » : la première
journée du portfolio et le premier pôle du référentiel ; « complet » par
défaut), `voie` (« directe » ou « lots »), `parallelisme.journees` (journées
menées de front par appels directs ; par lots, toutes le sont, §8.7),
`budget_usd` et `duree_minutes` (`null` : aucun plafond),
`cle` (« instance » ou « personnelle »), `gabarits` (l'identifiant du jeu :
« v9.8 », valeur du schéma, ou le nom d'une copie, §8.6) et `referentiel`
(`id`, et `version`, `null` pour la dernière publiée, figée dans la copie du
profil au lancement).

### 7.2 Étages et étapes

Chaque étage (`etages.lecteurs`, `etages.rapide`, `etages.profond`) donne un
modèle Claude, un budget de sortie (`max_tokens`, réflexion comprise), un
effort facultatif (absent : celui du modèle) et une réflexion : « coupee »,
sous la forme que le modèle accepte (`disabled` pour Haiku 5.5,
`between_tools` pour Sonnet 5.5), ou « adaptative ». Un lecteur du collège
et une étape (`etapes.<étape>`) ne portent que ce qu'ils changent à leur
étage. Les étapes, et l'étage qu'elles suivent comme dans la v9.8 :

| Étape | Étage | Appels |
|---|---|---|
| `premiere_impression` | rapide | première impression (le Lecteur) |
| `greffier` | rapide | greffier |
| `juge_leger` | rapide | juge léger, chacune de ses passes |
| `contre_lecture` | rapide | contre-lecture |
| `accusation` | profond | accusation |
| `defense` | profond | défense |
| `replique` | profond | réplique |
| `briefing` | profond | briefing |
| `jures` | profond | jurés, premier tour |
| `relance` | profond | relance |
| `second_tour` | profond | jurés, second tour |
| `gardien_support` | rapide | gardien du support |
| `gardien_raisonnement` | profond | gardien du raisonnement |
| `president` | profond | président |
| `second_ressort` | profond | tous les appels du procès d'un faisceau |
| `relectures` | profond | relectures de la fusion : kairos, pôles, compétences, rapporteur |
| `arpenteur` | profond | l'Arpenteur : condensés, lecture globale, retours aux sources |

Les deux gardiens sont deux étapes, puisque la v9.8 les place sur deux
étages. Le second ressort rejoue le procès d'une journée sur un faisceau :
sans réglage, chacun de ses appels suit son étape (accusation, jurés…) ;
un réglage de `second_ressort` vaut pour tous.

### 7.3 Les troncatures

Les troncatures écrites dans le code de la v9.8 font partie de l'algorithme :
elles deviennent des réglages, à leurs valeurs d'origine. Un nombre de
caractères pour un extrait, un nombre d'éléments pour une liste. Les seuils
des règles (statut temporel, alertes de pôle, diversité du collège) restent
dans le moteur : ce ne sont pas des troncatures. L'endroit de chacune dans
la v9.8 est inventorié dans `Twin_v9`, avec le moteur PHP qui les lit.

| `troncatures.journee` | Défaut | Ce qui est tronqué |
|---|---:|---|
| `justification_tag` | 400 | justification d'un tag de lecteur |
| `alerte_lecteur` | 300 | alerte d'instructions embarquées, signalée par un lecteur |
| `rejet_extrait` | 200 | extrait d'un tag que l'ancrage rejette |
| `span_caracteres` | 1200 | longueur d'un surlignage ancré, au-delà tronqué |
| `calques_extrait` | 240 | extrait d'un surlignage dans le bloc des calques du greffier |
| `calques_lignes` | 10 | lignes du bloc des calques |
| `trace_extrait` | 400 | extrait d'une trace probante (juge léger, tribunal) |
| `traces_par_verdict` | 5 | traces probantes d'un verdict |
| `ecarte_extrait` | 300 | extrait d'une pièce écartée par le juge léger |
| `ecartes_par_verdict` | 2 | pièces écartées gardées par verdict |
| `suspicion_extrait` | 300 | extrait d'une suspicion du registre |
| `suspicions_minoritaires` | 2 | suspicions « minoritaire » par compétence et par journée |
| `suspicions_sous_seuil` | 2 | suspicions « sous-seuil » par compétence et par journée |

| `troncatures.tribunal` | Défaut | Ce qui est tronqué |
|---|---:|---|
| `piege` | 200 | piège nommé par un juré |
| `piece_extrait` | 600 | extrait d'une pièce du greffier |
| `dossier_vide_entete` | 400 | début du dossier où chercher « DOSSIER VIDE » |
| `citations_cartographe` | 5 | citations du dossier préparé pour le cartographe |
| `citation_cartographe` | 300 | une citation de ce dossier |
| `prescription` | 800 | prescription du président, pour l'apprenant ou le cartographe |
| `faisceau_pieces` | 8 | suspicions versées au dossier d'un faisceau |
| `faisceau_extrait` | 400 | extrait d'une suspicion dans ce dossier |

| `troncatures.fusion` | Défaut | Ce qui est tronqué |
|---|---:|---|
| `attestation_citations` | 3 | citations d'une attestation (journée ou faisceau) |
| `attestation_citation` | 300 | une citation d'attestation |
| `profil_top_competences` | 5 | compétences de la concentration du profil ipsatif (top 5) |
| `resume_jour_etablies` | 4 | compétences citées par journée dans le résumé du kairos |
| `resume_jour_citation` | 160 | une citation de ce résumé |
| `registre_tenu_lignes` | 15 | lignes du registre des signaux ténus |
| `registre_tenu_extrait` | 120 | extrait d'une ligne de ce registre |
| `question_lecteur` | 160 | question spontanée du Lecteur, reprise par le kairos |
| `scan_orpheline_extraits` | 2 | extraits d'une orpheline de l'Arpenteur, repris par le kairos |
| `scan_orpheline_extrait` | 120 | un de ces extraits |
| `scan_continuite_extrait` | 100 | extrait d'une continuité de l'Arpenteur, repris par le kairos |
| `histoire_citation` | 120 | citation d'une attestation dans le prompt d'une histoire |
| `histoire` | 900 | histoire d'une compétence |
| `rapporteur_citation` | 220 | citation d'un territoire dense pour le rapporteur |
| `rapporteur_non_trouvees` | 6 | non-trouvées significatives transmises au rapporteur |
| `rapporteur_kairos` | 4000 | observations du kairos transmises au rapporteur |

| `troncatures.rapport` | Défaut | Ce qui est tronqué (dans `rapport_evolutif.md`) |
|---|---:|---|
| `citation` | 80 | dernière citation d'une compétence dans la carte additive |
| `scan_extrait` | 200 | extrait d'une orpheline ou d'une continuité |
| `continuite_extraits` | 4 | extraits d'une continuité |
| `emergences` | 3 | orphelines, connexions et nœuds du kairos, chacun |
| `kairos_extrait` | 300 | évidence du pattern temporel, divergences impressions et verdicts |
| `pole_competences` | 4 | compétences citées par pôle du profil ipsatif |
| `graine_extrait` | 160 | extrait d'une graine du registre |
| `signalements` | 20 | signalements du gardien des formulations |
| `cahier_citations` | 3 | citations d'un dossier du cahier du cartographe |
| `cahier_citation` | 200 | une de ces citations |

| `troncatures.arpenteur` | Défaut | Ce qui est tronqué |
|---|---:|---|
| `verbatim` | 300 | verbatim ancré au retour aux sources |

Les plafonds déjà réglables dans le `config.json` restent à leur place :
`calques.max_archives`, `merge.max_histoires`,
`scan_global.retour_max_caracteres`.

## 8. Le moteur Twin9 et la plateforme (T7)

Un run Twin9 s'exécute sur le serveur, par tranches (ADR-011 §2). La
plateforme ne connaît du moteur, chargé depuis `TWIN_V9_DIR` (ADR-011 §4), que
ce contrat ; le moteur factice des tests (`api/tests/fixtures/twin9-factice`,
public) l'implémente aussi.

- **`Twin9\Plateforme`**, construite une fois par run et par tranche avec :
  les réglages de la v9.8 en JSON (`config` et `roster` effectifs, options
  `jours`, `rescan`, `test`, `memoire`), le nom et le texte du portfolio, le
  jeu de gabarits (chaque gabarit par son nom, `lourd/20-greffier`, les fiches
  `tagger/P1` à `P7` comprises), la sortie du run (`--out` : les identifiants
  des calques en portent une empreinte), son horloge, figée à sa création, et
  l'empreinte de ses réglages (ci-dessous).
- **`passe(journal, memoire, sortie)`** rejoue le run depuis son début : la
  passe qui finit rend la main, les autres lèvent `Twin9\Run\Pending`, dont
  les `calls` sont les appels attendus (`Twin9\Run\Call` : `id`, `step`,
  `label`, `model`, `prompt`, `sha256`).
- **Le journal** (`Twin9\Run\Journal`, `CallJournal`) : `outcome(id)` rend
  `{sha256, response}` ou `{sha256, failure}`. Une réponse ne sert que si
  l'empreinte du prompt recalculé est la même.
- **La mémoire** (`Twin9\Run\Store`, `MapStore`) : un texte JSON par clé,
  lu entrée par entrée. Le moteur écrit une journée finie aussitôt (`journees/<jour>`
  et `calques/<jour>`, sous `test/` en mode test), si aucun de ses appels n'a
  échoué ; le reste (`faisceaux`, `scan_global`, les marques que la fusion
  laisse dans les journées) à la fin du run, comme la v9.8 écrit son état. Un
  faisceau du second ressort ne se relit donc pas en cours de run : la
  « chose jugée » de la v9.8 ne marque pas les graines comme le fait un premier
  jugement, et la carte changerait. Il se rejoue depuis le journal, sans
  qu'aucun appel reparte.
- **Les sorties** arrivent par `sortie(chemin, contenu)` dès qu'elles sont
  écrites : `journees/<jour>/carto_jour.json` à la fin de chaque journée,
  puis `carto_evolutive.json`, `profil_ipsatif.json`, `rapport.md`,
  `rapport_evolutif.md`, `scan_global.json`. Une journée reprise de la
  mémoire n'a pas de carte du jour, comme dans la v9.8.
- **`apercu(memoire)`** (T10), avant un run : les journées qu'il prendrait
  (la première en mode essai, les N premières sous `jours`), chacune
  `{id, date, titre, etat}`, `etat` valant `nouvelle` (absente de la
  mémoire), `changee` (son texte, ses lecteurs ou l'empreinte des réglages ont
  changé, ou `rescan` la relit) ou `inchangee` (reprise sans appel, comme
  `passe` la reprendrait) ; et `poles`, les pôles du référentiel du jeu.
  Rien n'est écrit.

### 8.1 Les réglages d'un run

`twin9_runs.reglages` garde la copie du profil (`profil`, §7 : réglages
d'appel, voie, parallélisme, clé, référentiel et jeu de gabarits) et les
réglages de la v9.8 que lit le moteur (`moteur`). Au lancement (T9, §8.4),
`MoteurReglages` les tire de la copie du profil, et de rien d'autre : les
paramètres d'algorithme sous leurs noms du `config.json`, troncatures
comprises ; `backend_tribunal` et `backend_rapide`, de type `anthropic`, aux
modèles des étages profond et rapide (le rapide servant aussi de
`model_mini`) ; `max_workers`, l'appel direct simultané du profil, et
`parallel_jures`, vrai ; le collège développé comme le fait `twin9.py`, chaque
passe un lecteur (`haiku#1`…), avec sa graine (`stable_hash("haiku|passe1")`
modulo 2³¹−1) et son sel (`|passe1`) ; les options `jours`, `rescan`,
`test` (le mode essai) et `memoire`. Le profil v9.8 donne ainsi les réglages
du scénario `02-cloud` de l'oracle, au type des backends près (`mock` sous
`--mock`), et un run qu'ils conduisent est celui de l'oracle, appel par appel
(`PariteTest::testTheV98ProfileDrivesTheEngine`). Les autres tests de parité
y mettent les réglages de leur scénario, que le profil ne sait pas tous dire
(collèges de plusieurs familles). Les nombres gardent leur forme : `1.0` reste un
flottant, comme en Python, où il n'est pas `1` (`JSON_PRESERVE_ZERO_FRACTION`).

Chaque appel part avec les réglages de son étape (`CallSettings`) : l'étape
du moteur (`Call::step`, la tâche de la v9.8) donne l'étape du profil, puis
son étage, comme au §7.2.

| `step` du moteur | Étape du profil |
|---|---|
| `tagger` | le lecteur du collège (par son nom, `tags_<nom>#<passe>_P<n>.json`), sinon l'étage des lecteurs |
| `premiere_impression`, `greffier`, `contre_lecture`, `accusation`, `defense`, `replique`, `briefing`, `relance`, `gardien_support`, `gardien_raisonnement`, `president` | la même |
| `leger` | `juge_leger` |
| `jure`, `jure2` | `jures`, `second_tour` |
| `merge_kairos`, `merge_pole`, `merge_competence`, `merge_rapporteur` | `relectures` |
| `condense`, `arpenteur`, `retour_sources` | `arpenteur` |
| tout appel sous `second_ressort/` | son étape, puis `second_ressort` par-dessus |

La réflexion coupée part sous la forme que le modèle accepte : `disabled`,
`between_tools` pour Sonnet 5.5 ; « adaptative » part en `adaptive`.
L'effort, s'il est réglé, part en `output_config.effort`. Jamais de
température.

### 8.2 L'empreinte des réglages

Une entrée de la mémoire (journée, faisceau, condensé et arpentage de
l'Arpenteur) ne se reprend que sous les mêmes réglages : à côté de
l'empreinte de la v9.8, elle garde celle de la plateforme
(`CallSettings::empreinte`), qui couvre ce que la v9.8 ne compte pas et qui
change une réponse : les réglages d'appel des étages, des étapes et des
lecteurs, les troncatures, les gabarits et les fiches du jeu (hors `merge/` :
la mémoire ne garde pas les relectures). Les sorties gardent l'empreinte de
la v9.8.

### 8.3 La voie par lots (T8)

Un run dont le profil dit `voie : "lots"` envoie ses appels par l'API Message
Batches d'Anthropic, à moitié prix (ADR-011 §3). Une tranche soumet le lot,
une suivante le relève.

- **Le lot.** Les appels qu'attend une passe partent ensemble, ceux de toutes
  les journées du run (T8, stratégie A, §8.7 : chaque vague attend un lot
  entier ; `parallelisme.journees` ne règle que la voie directe). Le moteur
  lance aussi ensemble les appels de la fusion qui ne lisent pas la réponse
  les uns des autres — faisceaux du second ressort, relectures avant le
  rapporteur, condensés et retours aux sources de l'Arpenteur (`Twin_v9`,
  T8) : PLANT-01 passe de 286 vagues à 27, de 310 à 30 avec l'Arpenteur.
  Un lot ne dépasse pas une dizaine
  de mégaoctets (`Twin9Lots::OCTETS`) : au-delà, la vague se répartit en
  plusieurs lots. Chaque requête porte, en `params`, le corps qu'aurait
  l'appel direct (`AnthropicCaller::params`), et en `custom_id` les
  32 premiers caractères hexadécimaux du SHA-256 de l'identifiant de l'appel.
  Le journal garde ce `custom_id` avec le lot (`twin9_appels.custom_id`,
  `lot_id`).
- **La vérification.** Avant le premier lot d'un run, un appel direct minimal
  (une phrase fixe, `AnthropicBatches::VERIFICATION`) part pour chaque
  combinaison de modèle, budget de sortie, effort et réflexion que le profil
  peut employer (`CallSettings::combinaisons`). Un refus (HTTP 400) arrête le
  run, avec la raison que donne l'API ; une erreur du fournisseur le fait
  attendre.
- **La vie d'un lot** (`twin9_lots`) : `soumission`, la ligne écrite avant
  que le lot parte ; `en_cours`, son identifiant Anthropic connu ; `releve`,
  ses résultats écrits au journal ; `supprime`, supprimé chez Anthropic.
  `annulation` vaut pour un run qui n'est plus en cours.
- **Le relevé.** La tranche demande où en est chaque lot. Un lot fini voit ses
  résultats entrer au journal comme ceux des appels directs
  (`AnthropicCaller::lireMessage`), au coût de l'usage rendu, à moitié prix.
  Une requête en erreur repart dans un lot suivant, sa tentative comptée
  (trois, puis la panne) ; une requête expirée aussi, sa tentative rendue.
  Le lot est ensuite supprimé chez Anthropic.
- **Un lot perdu**, parti sans que sa réponse arrive, est cherché parmi les
  lots de l'espace de la clé : même nombre de requêtes, créé dans les dix
  minutes autour de son départ, puis, une fois fini, les mêmes `custom_id`.
  Introuvable dix minutes après son départ, il n'est jamais parti, et ses
  appels repartent.
- **Un run qui n'est plus en cours** (annulé, en échec ou fini) voit ses lots
  en cours annulés, leurs appels rendus, puis supprimés une fois finis.
- **Entre deux lots**, le run n'est pas rejoué : la tranche demande seulement
  où en sont ses lots, et il ne compte pas parmi ses N runs.

### 8.4 Lancer, suivre, lire (T9)

- **Le lancement** (`Twin9\Lancement`, `POST /api/twin9/runs`) : le profil
  choisi, un des siens ou celui par défaut (celui de la v9.8, avec le jeu de
  gabarits par défaut, T14), est revalidé (§7) et admis (`ProfilPolicy`) ;
  sa version de référentiel, nulle, devient la dernière publiée, figée dans
  la copie. Le jeu de gabarits que choisit le profil (§8.6) devient
  l'instantané du run. Le moteur construit une fois sa `Plateforme`
  pour lire le portfolio : le nom de son journal range la carte. Le run garde
  son **attestation** (`twin9_runs.attestation`) : `profil` (`id`, nul pour
  celui de la v9.8, `nom`, et `mode` depuis T10), `gabarits` (`jeu`, `versions` de chaque gabarit
  — ses versions archivées plus une —, `empreinte` du jeu), `referentiel`
  (`id`, `version`), `moteur` (`commit` : la tête du dépôt `TWIN_V9_DIR`, sinon
  la première ligne de son fichier `COMMIT`, sinon nul). Il garde aussi sa
  visibilité (`privee` ou `cartographe`) et la date de l'accord (`accord_at`),
  sans lequel rien ne part.
- **Le suivi** (`GET /api/twin9/runs/{id}`) lit le journal : appels par état,
  journées finies (cartes du jour écrites), fusion faite, lots chez Anthropic,
  run antérieur de la même carte encore en cours ; `retard` dit en mots ce qui
  le retient (un run précédent du même portfolio, le débit du fournisseur, un
  lot chez Anthropic, la clé, son premier tour pas encore venu) ou ce qui l'a
  arrêté. La page du run le fait avancer par `POST /api/twin9/runs/avancer` :
  une tranche de la durée de celles du tick (`secondes_par_tranche`), sous
  son verrou, pour les seuls runs de la session (`Tick` : `twin9Utilisateur`),
  sans les jobs de masse ; elle finit plus tôt quand ces runs n'attendent plus
  rien. Annuler arrête un run en cours
  (ses lots sont annulés puis supprimés, §8.3) ; reprendre relance un run
  annulé ou arrêté, depuis son journal.
- **Les résultats** (`Twin9\Resultats`, `GET /api/twin9/runs/{id}/resultats`) :
  ses sorties, et pour chaque journée que sa fusion nomme (`journee`) sans
  qu'il en ait écrit la carte, la carte que la mémoire garde (`journees/<jour>`,
  sous `test/` en mode essai), sans le texte de la journée. Chaque texte passe
  le filtre de fuite (ADR-010 §2) contre tout le jeu de gabarits du run, fiches
  comprises, variables vides ; les sorties rangées restent celles du moteur.
- **Le document `twin9-run`** que la page remet à l'interface de cartographie
  (`twin9RunFiles`, `web/src/lib/interface-handoff.js`) : `kind: "twin9-run"`,
  `run` (`id`, `journal`, `mode`, `attestation`, dates), `referentiel` (le
  publié), `carto_evolutive` (la fusion), `journees` (chaque carte du jour,
  par journée) et `memoire` (les journées reprises). L'interface en fait une
  journée par carte du jour, ses verdicts établis, renvoyés ou jugés, chacun
  avec son dossier (`twin9Dossier`, `engine/src/twin9/mapper.js`) ; la
  délibération d'un verdict jugé se lit dans sa journée (`runScope:
  "journee"`), et les synthèses viennent de la fusion
  (`carto/core/importers/twin9-run.js`).

### 8.5 Coûts, plafonds, relance, purge et export (T10)

- **Le coût d'un appel** est ce qu'il coûte à son auteur
  (`twin9_appels.cout_microusd`, `Twin9Config::coutMicrousd`) : l'usage que
  rend Anthropic, au prix de son modèle dans la grille de l'administrateur
  (`modeles`), au palier des longs prompts au-delà de son seuil
  (`palier_long {au_dela_de, prix_usd_mtok}` : Haiku 5.5, 0,50 $ et 2,50 $
  le million au-delà de 100 000 jetons de prompt), à moitié prix par lots,
  la marge comprise avec la clé de l'instance, sans elle avec la clé de
  l'utilisateur. Un profil dont un modèle n'a pas de prix est refusé
  (`ProfilPolicy`).
- **Avant chaque envoi**, direct ou par lot, l'appel réserve son pire cas
  (`RunCosts::pireCas`, `twin9_appels.reserve_microusd`) : les octets de son
  prompt comme jetons d'entrée, son budget de sortie comme jetons de sortie,
  au même prix. Avec la clé de l'instance, la réserve est débitée du crédit
  de l'auteur, dans la transaction qui écrit l'appel (`CreditService` rejoint
  la transaction ouverte), une réserve par appel au grand-livre
  (`Twin9 run <id> · <étape> (réserve)`). Un appel garde sa réserve d'une
  tentative à l'autre. Sa réponse la solde à la tranche suivante au plus
  tard : le coût réel reste, le reste revient (`… · réconciliation`, par
  modèle, avec les jetons réels). Un run arrêté, annulé ou fini rend tout ce
  que ses appels tiennent encore (`… · remboursement`), sauf les appels d'un
  lot encore chez Anthropic, soldés quand le lot est relevé ou annulé.
- **Les plafonds** viennent de la copie du profil : `budget_usd` et
  `duree_minutes`, `null` pour aucun. Ce qu'un run a engagé — réserves
  tenues, coûts réels soldés — ne dépasse jamais son budget : un appel dont
  la réserve le dépasserait ne part pas, ni aucun nouvel appel après lui
  dans la tranche ; un lot ne prend que ce que le budget et le crédit
  laissent. Sa durée compte depuis son lancement ou sa dernière reprise
  (`twin9_runs.debut_at`) ; passée, aucun appel ne part. Retenu ainsi et sans
  plus rien dehors, le run s'arrête (`echoue`), sa raison dans `attente` :
  `budget atteint : carte incomplète`, `durée atteinte : carte incomplète`,
  `crédit insuffisant : carte incomplète`, et, T8 (§8.7), `crédit
  insuffisant (fusion réservée) : …`, `budget atteint (fusion réservée) :
  …`, `crédit insuffisant (engagé par vos autres analyses) : …`. Ce qui est
  parti finit : un lot
  chez Anthropic est relevé avant l'arrêt. `POST /api/twin9/runs/{id}/reprendre`
  accepte `{budget_usd}`, des dollars ou `null`, le nouveau budget de la
  copie du profil. Le suivi donne `cout` : `depense_microusd` (le coût réel
  de ses appels), `budget_usd`, `duree_minutes`.
- **Les compteurs** d'un run fini gagnent `journees` (les journées qu'il a
  instruites) et `duree_s` (ses secondes actives, période par période :
  `twin9_runs.actif_s`).
- **L'aperçu** (`POST /api/twin9/runs/apercu`, `{profil, portfolio}`, ce que
  demande un lancement, l'accord excepté ; rien n'est gardé) rend
  `{journal, mode, voie, cle, journees: {total, nouvelles, changees},
  estimation: {cout_usd, min_usd, max_usd, reserve_usd, duree_s,
  evaluations | reference, poles}, admission: {journees, total, limite,
  instruites, en_attente, changees_en_attente, autres_usd, refus},
  plafonds: {budget_usd, duree_minutes}, credit_usd}`. L'estimation et
  l'admission sont au §8.7 (T8). À défaut d'évaluation, la référence est le
  vrai run de PLANT-01 de T2, en mode essai, 0,1344 $ et 94 s, fois les
  pôles du référentiel pour un run complet, à moitié prix par lots, la
  marge avec la clé de l'instance ; par lots, la durée est nulle (celle
  d'Anthropic). `credit_usd`, avec la clé de l'instance.
- **Une carte incomplète** : la page d'un run arrêté avec des journées finies
  l'ouvre dans la cartographie. Le document `twin9-run` porte alors
  `incomplete: true`, et `carto_evolutive` peut être nul ; l'import le dit
  (`twin9-incomplete`, avertissement) et le jeu s'intitule « … — carte
  incomplète ».
- **La purge** (`DELETE /api/auth/account`, `Twin9\RunPurge`) : les lignes du
  moteur partent avec le compte (CASCADE). Avant, ses lots chez Anthropic
  soumis avec sa propre clé sont annulés, puis supprimés une fois finis ;
  ceux de la clé de l'instance laissent leur seul identifiant Anthropic dans
  `twin9_lots_a_effacer`, que le tick annule puis supprime (`Twin9Lots`).
- **L'export** (`GET /api/twin9/mes-analyses`, `Twin9\RunExport`) rend `{runs,
  cartes}` : chaque run avec `id`, `journal`, `statut`, `attente`,
  `visibilite`, ses dates, `attestation`, `profil` (sa copie), `portfolio
  {nom, texte}`, `compteurs`, `appels[]` (son journal : `appel`, `etape`,
  `modele`, `modele_envoye`, `modele_servi`, `statut`, `tentatives`,
  `reponse`, `panne`, `stop_reason`, jetons, `cout_microusd`, `duree_ms`,
  dates ; jamais un prompt ni une clé), `sorties` (par chemin) et
  `evaluation` (son évaluation, §8.7 ; nulle tant qu'il n'est pas fini) ; chaque
  carte avec `journal`, `referentiel`, `gabarits`, `created_at` et `memoire`
  (le texte JSON de chaque clé). Ce que le moteur et les modèles ont écrit
  passe le filtre de fuite contre tous les jeux de gabarits des runs du
  compte. L'archive de compte l'embarque (`analysesTwin9`, §4, point 13).

### 8.6 Les jeux de gabarits (T14)

- **Le jeu v9.8** est celui qu'écrit l'import (`POST /api/admin/twin9/import`,
  `twin9_protocole`, `twin9_protocole_versions`) : l'atelier le lit, ne
  l'écrit jamais (`403`). Son identifiant est « v9.8 ».
- **Une copie** (`TemplateSets::copier`, `POST /api/twin9/admin/jeux {id}`,
  atelier) prend chaque gabarit du jeu v9.8 tel qu'il est, sans son histoire
  (migration 029 : `twin9_jeux`, `twin9_jeux_gabarits`, `twin9_jeux_versions`).
  Son nom est son identifiant : `[a-z0-9][a-z0-9._-]*`, 64 caractères au
  plus, unique, « v9.8 » compris ; ni renommé, ni supprimé. Elle a les
  gabarits du jeu v9.8 et aucun autre : un `PUT` sur un nom qu'elle n'a pas
  répond `404`. Son auteur seul l'écrit (`403` pour tout autre), avec les
  versions et le retour arrière de `ProtocoleRepository`, rangés par jeu ;
  tout atelier la lit.
- **Les variables fournies** : un gabarit d'une copie n'emploie que celles
  que son étape lui fournit — celles que `schemas/twin9-protocole-contrat.json`
  nomme pour ce gabarit, et celles que son original du jeu v9.8 emploie —,
  sinon `422` « Variable qu’aucune étape ne fournit à ce gabarit : {$X} ». Un
  gabarit que ni l'un ni l'autre ne nomme (les fiches `tagger/P1` à `P7`) n'en
  reçoit aucune. Le contrat reprend celui de `Twin_v9`
  (`engine/src/twin9/protocole-contrat.json`), complété de `MA_POSITION_R1`
  (relance, second tour) et `LISTE_61` (Arpenteur), que le moteur fournit et
  que les gabarits v9.8 emploient ; un test le vérifie sur les gabarits de
  `TWIN_V9_DIR` (`JeuxGabaritsTest`).
- **Le choix d'un profil** (`gabarits`, `TemplateSets::pour`) : le jeu v9.8,
  le jeu par défaut, et, tant que son propriétaire est de l'atelier
  (`TemplateSets::ATELIER`, `admin` ∧ `promptologue` selon AD-D2), ses
  copies. **Le jeu par défaut** (`twin9_gabarits_defaut`, `PUT
  /api/twin9/admin/jeux/defaut {jeu}`, administrateur ; « v9.8 » sans choix)
  est celui du profil par défaut. Un profil enregistré ne change pas : s'il
  nomme un jeu que son propriétaire ne peut plus choisir (un ancien jeu par
  défaut, une copie de quelqu'un sorti de l'atelier), il est refusé, à
  l'enregistrement comme au lancement (`422` « … ce jeu de gabarits ne vous
  est pas proposé »), comme l'est une clé personnelle que l'administrateur a
  fermée, jusqu'à ce qu'il en choisisse un autre ; la page Configuration le
  montre, sans le proposer.
- **Dans un run** : l'instantané est le jeu du profil
  (`ProtocoleRepository::jeu`), son attestation en garde le nom et la version
  de chaque gabarit, et l'empreinte des réglages le contenu (§8.2). La
  mémoire d'une carte est rangée par jeu (`twin9_cartes.gabarits`) : un run
  d'un autre jeu ne reprend pas les journées d'un premier. Le lancement et
  l'aperçu refusent (`422`) une copie à qui manque un gabarit du jeu v9.8
  (ajouté par un import après la copie), et un jeu que le moteur ne lit pas
  (une fiche du référentiel mal formée : le moteur lit les pôles dans
  `tagger/P1` à `P7`), sans citer le gabarit ; le journal du serveur ne
  garde que la classe de l'erreur du moteur.
- **`GET /api/twin9/admin/jeux`** (administrateur) rend `{defaut, jeux}`,
  chaque jeu avec `id`, `auteur` (nom affiché, nul pour le jeu v9.8 ou un
  compte supprimé), `mien`, `gabarits` (leur nombre), `created_at` et
  `defaut` ; jamais un contenu. Les routes de contenu sont celles de l'atelier,
  par jeu : `/api/twin9/admin/jeux/{jeu}/protocole{/nom}{/versions{/v}|/restore}`
  et `/api/twin9/admin/jeux/{jeu}/tester`.

### 8.7 Prévoir et admettre : la stratégie A (T8)

Décision de Christian du 2026-10-19 : par lots, toutes les journées d'un run
sont de front (§8.3), et un lancement ne prend que les journées que le
crédit, ou le budget, permet de finir avec leur fusion.

- **L'évaluation** (`twin9_evaluations`, migration 030,
  `Twin9\Evaluations`) : un run fini laisse, dans la transaction qui efface
  son journal, une ligne sans aucun contenu — `user_id` (la personne
  évaluée ; `NULL` une fois son compte supprimé, la ligne restant pour les
  prévisions) ; `journees` (`[{ko, cout_microusd, panne?}]` : chaque
  journée de sa carte, dans l'ordre — celles que le run a prises, puis
  celles que la mémoire garde au-delà, la carte étant additive —, sa taille
  en Ko au centième, celle que donne le moteur (`Plateforme::apercu()`,
  `octets`), et ce que le run a payé pour elle ; `null` pour une journée
  reprise de la mémoire, ou une taille inconnue ; `panne: true` quand un de
  ses appels a échoué : le run suivant la refait) ; `cout_journees_microusd`,
  `cout_fusion_microusd` et `cout_microusd` (le coût final, ce que la
  personne a payé, la marge de l'instance comprise avec la clé de
  l'instance) ; `pire_cas_journee_microusd` et `pire_cas_fusion_microusd`
  (le plus grand pire cas qu'un appel d'une journée, de la fusion, a
  réservé avant de partir, T10 ; `twin9_appels.pire_cas_microusd` le garde
  une fois l'appel réglé) ; `duree_s` (ses secondes actives) ; `reglages`
  (`voie`, `cle`, `marge` — le facteur que ses coûts comprennent, 1 avec la
  clé personnelle —, et ce que les prévisions comparent : `mode`,
  `referentiel`, `gabarits`, les modèles et la performance — `etages`,
  `etapes`, `lecteurs`, avec modèle, budget de sortie, effort, réflexion et
  passes — et les paramètres de l'algorithme : `seuils_consensus`,
  `juge_leger`, `jury`, `premiere_impression`, `calques`, `merge`,
  `scan_global`, `troncatures`) ; `signature` (16 caractères hexadécimaux
  du SHA-256 de ce que les prévisions comparent, en JSON canonique : tout ce
  dont dépendent les appels d'un run, sauf sa voie et sa clé, que la
  prévision convertit, ses plafonds et son parallélisme). Un échec de la
  consignation n'empêche jamais le run de finir : il est journalisé, sans
  contenu. L'export du compte porte l'évaluation avec son run (§8.5).
- **La prévision** (`Evaluations::modele`, `Evaluations::selon`) lit les 200
  dernières évaluations de même signature, chacune convertie à la voie et à
  la marge du run prévu (moitié prix par lots ; sa marge retirée, celle du
  run prévu appliquée). Une journée instruite coûte une part fixe — les
  fiches de son pôle font l'essentiel de chaque prompt de lecture — et une
  part par Ko, ni l'une ni l'autre négative : la droite des moindres carrés
  par les journées instruites (leur taille, leur coût ; une journée en
  panne laissée de côté) ; une fusion de même, par les Ko de la carte
  qu'elle relit, chaque évaluation un point. Une pente négative : le coût
  ne croît pas avec la taille, leur moyenne ; une part fixe négative : le
  coût par Ko seul ; une seule taille, qui ne dit rien du partage : moitié
  l'une, moitié l'autre. Entre les tailles observées, au plus bas et au
  plus haut, la droite décalée des écarts extrêmes observés. Au-delà, ce
  qu'un tel coût permet : sous la plus petite, au plus ce qu'elle a coûté,
  au moins sa part au Ko ; au-dessus de la plus grande, au moins ce qu'elle
  a coûté, au plus autant au Ko. Jamais sous zéro. Une taille se lit comme
  elle se consigne, en Ko au centième (`Evaluations::ko`). Le pire cas
  d'un appel : le plus grand observé. Par appels directs, les secondes
  actives d'un run par journée instruite, fusion comprise, en moyenne.
  Sans évaluation, la référence (§8.5) : par journée instruite, une journée
  pour la fusion, et une journée pour le pire cas d'un appel de chacune.
- **La carte que relit la fusion** : les journées que le run prend, et
  celles que la mémoire garde au-delà — les journées du portfolio qu'il ne
  prend pas, celles de runs passés absentes du portfolio (`apercu()`,
  `memoire`, avec la taille de leur texte gardé). Une journée changée
  au-delà de la coupe y reste dans sa version déjà évaluée, jusqu'à la
  prochaine analyse.
- **L'admission** (`Lancement::prevoir`) : les premières journées du
  portfolio, dans l'ordre, tant que ce qu'elles demandent tient dans la plus
  basse des limites (`admission.limite` : `credit`, `budget`, ou `null`
  sans limite) — le crédit de la personne avec la clé de l'instance, moins
  ce que ses autres analyses en cours peuvent encore en dépenser
  (`autres_usd`), et le budget du profil : leur coût au plus haut, la
  fusion de leur carte au plus haut comprise, et de quoi réserver le pire
  cas d'un appel d'une journée et d'un appel de la fusion (T10 : chacun le
  réserve avant de partir). Les autres attendent une prochaine analyse : la
  copie du profil du run reçoit `jours` (ses N premières journées), et la
  mémoire garde celles finies. Un profil qui relit toutes ses journées à
  chaque analyse (`rescan`, ou sans `memoire`) prend tout ou rien.
  L'aperçu rend `admission` : `journees` (N), `total`, `limite`,
  `instruites` (les journées à instruire qu'il prend), `en_attente` (celles
  qui attendent), `changees_en_attente` (dont changées), `autres_usd`,
  `refus`. Refusé — pas même une journée à instruire et sa fusion, ou,
  rien à instruire, pas même la fusion, ou pas tout le portfolio pour un
  profil qui relit tout —, `refus` dit ce qu'il faudrait, au cent
  supérieur, et le lancement répond `422` avec ce texte : « Votre crédit ne
  couvre pas une carte, même d'une journée : il faudrait X $[, en plus des
  Y $ que vos analyses en cours peuvent encore dépenser] (une journée et sa
  fusion, au coût le plus haut observé | d'après le run de référence,
  réserves des appels comprises) », « … ne couvre pas la fusion de la
  carte … », « Ce profil relit toutes ses journées à chaque analyse, et
  votre crédit ne couvre pas le portfolio entier … » (« le budget du
  profil… »). Un lancement à la fois par personne (`GET_LOCK`), pour que le
  suivant compte ce que le précédent a obtenu. L'attestation garde
  `admission`, `refus` excepté, avec `reserve_microusd` et
  `engagement_microusd`.
- **La réserve de la fusion** (`twin9_runs.reserve_fusion_microusd`) : la
  fusion de la carte admise au plus haut, et le pire cas d'un de ses
  appels. Un appel d'une journée ne l'entame jamais : ni le crédit ni le
  budget ne descendent pour lui sous elle (`Twin9Run::retenue`) ; retenu, le
  run s'arrête, `crédit insuffisant (fusion réservée) : carte incomplète`
  (ou `budget atteint (fusion réservée) : …`), et se reprend comme après un
  arrêt par le crédit (une fois rechargé) ou par le budget (sous un nouveau,
  §8.5). Les appels de la fusion la dépensent.
- **L'engagement** (`twin9_runs.engagement_microusd`) : avec la clé de
  l'instance, ce que le lancement a accordé au run sur le crédit, ce que
  demandent ses journées admises et leur fusion. Ce qu'un run en cours
  peut encore en dépenser — son engagement, moins ce qu'il a engagé : pires
  cas réservés, coûts réglés (`RunRepository::engagementsEnCours`) —, les
  autres runs de la même personne ne l'entament jamais ; retenu, un run
  s'arrête, `crédit insuffisant (engagé par vos autres analyses) : carte
  incomplète`.
- **L'estimation** de l'aperçu est celle du run tel qu'il partirait, ses
  journées admises et leur fusion (refusé, ce que dit le refus) :
  `min_usd`, `cout_usd` (la moyenne), `max_usd`, `reserve_usd`, en dollars
  au micro-dollar, que la page arrondit au cent ; `duree_s` (nulle par
  lots) ; et sa source, `evaluations` (leur nombre) ou `reference` et
  `poles`. La page dit les journées admises ou le refus, qu'elle ne laisse
  pas lancer.

## 9. Plusieurs référentiels (T15)

Le schéma `referentiel` passe en **2.0.0** (`docs/plan-twin9-php.md` de
`Twin_v9`, lot 4c, première tâche ; cas UC-EPI-05). Un document 1.0.0 — RESPIRE
— y reste valide tel quel, avec la même empreinte.

- **Les pôles** : de 1 à N, numérotés de 1 à N sans trou (`num`, contrôlé par
  `ReferentielRepository::validateDocument`) ; un pôle lettré (A à E) porte son
  rang (1 à 5), sa lettre étant celle de ses codes et de son nom. Une
  `description` facultative (Markdown) dit ce que cherche le pôle.
- **Les niveaux** (`niveaux`, facultatif) : du plus large au plus fin, chacun
  `{nom, motif}` ; le premier tient lieu de compétence (les entrées de
  `competences`), le suivant est celui de leurs `elements`, et ainsi de suite.
  Le motif est une expression PCRE sans ancres (100 caractères au plus, sans
  caractère de contrôle) ; un code la suit **en entier**
  (`ReferentielRepository::regexDuMotif` : `^(?:motif)$`), sans quoi le
  moteur ne le retrouverait pas et sa compétence disparaîtrait sans bruit du
  run. Un motif reste entre ses ancres : il compile seul (aucun groupe fermé
  avant l'heure, comme `Z)|(?:`) et n'use d'aucun verbe `(*…)` (`(*ACCEPT)`
  finirait la correspondance avant l'ancre de fin) ; sinon, « Motif
  illisible ». Les codes s'y confrontent sous une limite de retour arrière de
  10 000 pas (un code a 8 caractères) : un motif qui la dépasse est refusé
  une fois, à son pointeur (« Motif trop coûteux à évaluer »), et n'est plus
  évalué. Sans `niveaux` : un niveau, « compétence », au motif de RESPIRE
  `\d\.\d{2}` (`NIVEAU_PAR_DEFAUT`, `MOTIF_PAR_DEFAUT`). Exemple, l'Humanome
  V18 : `[{"nom": "capacité", "motif": "[A-E][1-4]"}, {"nom": "facette",
  "motif": "[A-E][1-4]\\.[1-9]"}]`.
- **Les codes** : 1 à 8 caractères (lettres, chiffres, `.`, `_`, `-`, le
  premier lettre ou chiffre), uniques dans tout le référentiel ; 8, la taille
  des colonnes qui les rangent (`cartography_annotations.competence_code`).
- **Les éléments** (`elements` d'une compétence, et d'un élément) :
  `{code, nom, description?, elements?}` ; un élément d'un niveau que le
  référentiel ne déclare pas est refusé. Une description est du texte libre
  (Markdown) : les manifestations ou le faux positif d'une facette y vont.
- **L'empreinte** ne change pas de définition : pôles `{num, nom, couleur}`
  et compétences `{code, nom, pole}` ; niveaux, descriptions et éléments sont
  gardés dans le document, hors d'elle (`ContentHash::normalize` les range
  dans un ordre fixe, éléments compris, quoi qu'en fasse le JSON de MySQL).
- **RESPIRE garde sa structure** : une clause du schéma (`allOf` : si
  `id` vaut `respire`) lui impose 7 pôles, 61 compétences au format `P.NN` et
  aucun niveau déclaré. Tout chemin vers une de ses versions passe par elle :
  fork et édition au grain document, publication, coupe de release depuis
  ses compétences (UC-EPI-03, dont c'était déjà le contrôle de complétude),
  import initial. Il ne s'importe pas par l'atelier (`409`).
- **L'import** (`POST /api/referentiel/import {document, niveau?}`,
  épistémiarque ou administrateur) valide le document tel quel, le lit au
  niveau choisi (`ReferentielRepository::auNiveau` : les éléments de ce
  niveau deviennent les compétences, sous le pôle de leur compétence
  d'origine, leurs éléments plus fins dessous ; les niveaux plus larges ne
  sont pas gardés ; une branche qui s'arrête au-dessus de ce niveau, qui
  disparaîtrait, est refusée et nommée, comme un niveau sans élément), le
  valide de nouveau et l'enregistre en brouillon, dont l'importateur est
  l'auteur. Identifiant d'un référentiel importé :
  `[a-z0-9][a-z0-9._-]{0,63}`. Les pointeurs d'un refus désignent le document
  trié par code ; le message nomme le code fautif. Le reste du cycle est
  celui du grain document (UC-EPI-04), ouvert à tous les référentiels : les
  listes `GET /api/referentiel/drafts` et `/proposals` les couvrent tous, un
  fork prend `referentiel` (défaut `respire` ; un identifiant de la même
  forme, la nouvelle version gardant celui de sa source : la colonne ignore
  la casse). `GET /api/referentiels`
  (public) rend les référentiels publiés : `[{id, label, versions}]`, le
  libellé de la dernière version, les versions de la plus récente à la plus
  ancienne. Les lectures publiques de `/api/referentiel` restent celles de
  RESPIRE.
- **Le profil Twin9** (§7) : `referentiel.version` peut désigner un brouillon
  (ou une proposition au vote) si le propriétaire du profil en est l'auteur,
  qu'il est épistémiarque ou administrateur (`ProfilPolicy::AUTEURS`) et que
  le profil est en mode essai ; sinon `422` « Profil refusé —
  /referentiel/version : un brouillon ne sert qu’aux runs d’essai de son
  auteur ». `GET /api/twin9/configuration` rend, pour chaque référentiel,
  `{id, versions, brouillons}` : ses versions publiées et ses propres
  brouillons, un référentiel jamais publié n'y figurant que pour son auteur.
- **Le lancement** (§8.4) : jusqu'à ce que le moteur reçoive le référentiel
  de son run (T16), il lit les fiches RESPIRE de son jeu de gabarits, quel
  que soit le profil ; un run ou son aperçu sur un autre référentiel est donc
  refusé (`422` « L’analyse approfondie ne lit encore que le référentiel
  RESPIRE »). Un brouillon de RESPIRE sert le run d'essai de son auteur.
- **Les annotations** (`POST /api/cartographies/{id}/annotations`) : une
  cartographie qui désigne une version de référentiel
  (`referentiel_version_id`) n'accepte que ses codes ; sans référentiel
  désigné, la forme de RESPIRE (`[1-7].NN`), comme avant.
- **Hors T15** : le moteur (T16) et la cartographie (T17) ne lisent encore que
  RESPIRE et ses 7 pôles ; la page publique `#/referentiel` ne montre que
  lui ; `ReferentielDiff` ignore niveaux et éléments.
