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
| `cartographie-merge.schema.json` | `cartographie-merge` | Agrégat chronologique de TOUTES les feuilles (merge évolutif v3) : séries temporelles par pôle et par compétence, archétypes, profil ipsatif, narratifs HTML. Source du sunburst. Document réel : `web/public/data/demo/merge.json`. Depuis la 1.1.0 (2026-10-22), un document de la cartographie ouverte Twin6 porte en plus sa `configuration` et son `execution` (§4, point 8). |
| `prompt-package.schema.json` | `prompt-package` | Paquet promptologue : textes de prompts + variables + code JS d'orchestration (sandbox Web Worker) + métadonnées (version, auteur, modèle cible, référentiel compatible, changelog). |
| `competency-map-master.schema.json` | `competency-map-master` | Archive de l'interface de cartographie (`#/cartographie`, master v4, `schemaVersion` 4.x) : référentiel embarqué, journées et variantes (verdicts résumés), détail par journée (extraits, ancres, jury, portfolio du jour), délibérations de run, état de l'apprenant (cases, étiquettes, choix de variante, ensembles, réponses au jury, repères, notes, carnet du dialogue, préférences). Produite par l'espace Export de l'interface et embarquée par l'archive de compte. Fixture : `schemas/fixtures/carto/competency-map-master-exemple.json`, sortie EXACTE de l'interface (`web/scripts/carto-master-fixture.mjs`). |
| `archive-export.schema.json` | `archive-export` | Format pivot de portabilité (ADR-006) : archive autoporteuse embarquant portfolios en texte intégral, référentiels et prompt-packages COMPLETS, cartographies produites, jeux de l'interface de cartographie (`jeuxCartographie`, depuis la 1.1.0), analyses approfondies Twin9 du compte (`analysesTwin9`, depuis la 1.2.0, §8.5) et journal d'audit. Sert l'export/suppression RGPD, l'import de compte et le seed d'instance. Référence les 5 autres schémas par `$ref` sur leur `$id` absolu. |
| `twin9-profil.schema.json` | `twin9-profil` | Profil d'un run Twin9, décrit de bout en bout (`docs/plan-twin9-php.md` de `Twin_v9`, lot 4a, T12) : paramètres d'algorithme de la v9.8, troncatures comprises, collège des lecteurs, modèle et réglages de chaque étape, voie, plafonds, clé, gabarits, référentiel. Rangé dans `twin9_profils` (migration 024) ; document de référence : le profil v9.8, `api/config/twin9-profil-v98.json`. Validé côté PHP seulement (`ProfilRepository`) ; voir §7. |
| `twin9-protocole-contrat.json` | — | Pas un schéma : les variables que le moteur fournit à chaque gabarit du jeu v9.8, par son nom (noms seuls, ADR-010 §2). Une copie du jeu n'en emploie pas d'autre (§8.6, T14). Lu par `TemplateSets`, livré avec la release (`scripts/deploy/stage-api.sh`). |

Chaque document porte `schemaVersion` (semver du schéma d'enveloppe : « 1.0.0 »
partout, sauf l'archive de compte, « 1.1.0 » depuis le 2026-10-14 et « 1.2.0 »
depuis T10, un référentiel d'une autre structure que RESPIRE, « 2.0.0 »
depuis T15 (RESPIRE reste en 1.0.0, valide tel quel), une cartographie
fusionnée qui porte sa configuration (Twin6), « 1.1.0 » depuis le 2026-10-22
(toute autre reste en 1.0.0, à l'octet), et le master
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
   un SEUL corpus (ses gabarits, versionnés dans `scripts/data/twin6/` depuis
   le 2026-10-20, et les fiches `web/public/data/twin6/prompts/P*.md`
   régénérées du corpus des fiches) : le paquet statique
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
   - **1.1.0 (2026-10-20) : les gabarits lisent le référentiel.** Ceux de 1.0.0
     écrivent RESPIRE v7 en toutes lettres (« un des 7 pôles du référentiel
     RESPIRE », « les 61 verdicts », la forme `X.YY`, quatre codes d'exemple).
     Ceux de 1.1.0 portent à leur place `${REFERENTIEL}`, `${NB_POLES}`,
     `${NB_COMPETENCES}`, `${FORMAT_CODE}`, `${PRECISION_FORMAT_CODE}` et
     `${CODES_EXEMPLE}`, que `executerTwin6` rend depuis le référentiel employé
     avant tout appel (`engine/src/twin6/variables.js`) ; un gabarit sans elles
     passe inchangé. Rendus pour RESPIRE v7, ils redonnent 1.0.0 à l'octet.
     1.1.0 se tire de 1.0.0 par des remplacements exacts, chacun vérifié
     (`scripts/twin6-gabarits.mjs`) : un gabarit qui a dérivé arrête la
     construction. `#/twin6-ouverte` sert la 1.1.0 ; son méga-prompt, que le
     moteur n'exécute pas, reste le protocole manuel de RESPIRE v7.
   - **Sortie tronquée, refus (2026-10-22, point 14).** Sur toutes les
     voies (clé personnelle, crédits, essai), une sortie tronquée arrête le
     run au premier appel concerné : « executerTwin6: sortie tronquée
     (max_tokens) à l'étape … », sans nouvel essai ; l'erreur porte
     l'étape, l'usage du run (l'appel tronqué, payé, compris) et ses
     appels. Un refus du fournisseur l'arrête de même (« le fournisseur a
     refusé de répondre à l'étape … »). Chaque appel consigne son arrêt
     (`calls[].stopReason`, `stopReasonRaw`).
   - **Le document dit comment il a été produit (2026-10-22, P0-1c :
     `cartographie-merge` 1.1.0).** Un run lancé depuis `#/twin6-ouverte`
     exporte deux blocs de plus, juste après `source` :
     `configuration` (`twin6-configuration/1`) et `execution`
     (`twin6-execution/1`), décrits par `$defs/configurationTwin6` et
     `$defs/executionTwin6` du schéma. Seul un document qui les porte passe
     en `schemaVersion` 1.1.0 ; sans eux (banc d'essai, runs Aurora,
     Twin9, cohortes, corpus), `buildMergeDocument` rend le document d'hier
     à l'octet (`scripts/parity/parity-document.mjs` inchangé).
     - `configuration` : la vue pose ce qu'elle seule sait — `paquet`
       (`id`, `version`, et `sha256`, l'empreinte hexadécimale des
       **octets servis** du paquet, calculée avant toute lecture du JSON :
       avec le référentiel et l'origine des fiches, elle détermine les
       prompts envoyés, à version du moteur égale), `referentiel` (`id`,
       `version`, `contentHash` du document publié choisi — `null` pour un
       document qui n'en porte pas —, et `structure` : `meta` quand le
       moteur lit les pôles de RESPIRE dans `/api/twin9/meta`, `document`
       sinon), `fiches` (numéro du pôle → `paquet` ou `document`, selon que
       sa fiche est celle du paquet ou écrite depuis le document), `acces`
       (`cle_perso`, `credits` ou `essai` ; la voie « demo » de la vue
       s'écrit `essai`). `executerTwin6` complète, par liste blanche :
       `fournisseur` (le registre `PROVIDER_INFO` de
       `engine/src/providers/index.js` ; un fournisseur qu'il ne connaît
       pas vaut `null`), `voie` (toujours `directe` : Twin6 enchaîne ses
       appels depuis le navigateur), `transport` (`direct` ou `proxy`),
       `modele` (le modèle demandé : `demo` pour l'essai), `maxTokens` (le
       budget de sortie résolu), `temperature` (`null` sans réglage) et
       `rgpd`, le tag du fournisseur au registre : `sous_conditions` pour
       Anthropic et OpenAI, `oui` pour Mistral, `non` pour Google, xAI et
       OpenRouter, `local` pour Ollama. Aucune clé, aucun gabarit, rien qui
       dérive d'une clé. Le schéma refuse `voie: lots` pour un autre
       fournisseur qu'Anthropic (règle commune avec Twin9).
     - `execution` : `debut` et `fin` (UTC sans fuseau, comme
       `generatedAt` ; horloge injectable `options.now`), et pour chaque
       appel son étape (`scan-pole/N`, `kairos`), le modèle **servi** (celui
       que nomme la réponse : l'essai impose le sien), l'arrêt normalisé
       (`stopReason`, une classe du point 14, et `stopReasonRaw`, un
       identifiant court ou `null`) et ses jetons ; puis l'usage total et
       `modelesServis`. `coutMicrousd` vaut `null` : le moteur ne connaît
       pas le montant débité, qui reste au relevé du compte — un document
       se partage. `execution` n'existe pas sans `configuration`
       (`dependentRequired`) : `buildMergeDocument` ignore une `execution`
       qu'on lui passe seule, et le document reste en 1.0.0.
     - **Importeur** (`web/src/carto/core/importers/merge.js`) : la
       provenance de chaque variante prend pour `model` le premier modèle
       servi (à défaut le modèle demandé) et garde `configuration` réduite à
       sa liste blanche de champs scalaires (sans `fiches` ni coût).
     - Fixtures partagées JS/PHP (valeurs inventées) :
       `schemas/fixtures/twin6/configuration-execution.json`, greffée sur
       `cartographie-merge-3-jours.json`, et les cas refusés de
       `configuration-invalides.json` (`engine/src/validation.test.js`,
       `api/tests/ValidationTest.php`). L'archive de compte, qui fait `$ref`
       vers ce schéma, accepte un document configuré tel quel.
       **Déploiement** : l'API (ses schémas) avant le front, sans quoi un
       document 1.1.0 que le serveur valide au schéma (une révision de
       cartographie, `annotations.php`) y serait refusé.

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
    sont déjà là gagnent. Depuis le sprint 4 (C4, 2026-10-23, journal D-73),
    le **second ressort d'un run Twin9** est aussi une seconde lecture :
    `source: "twin9"`, `id` « twin9:<run>:second-ressort », ses seules
    compétences « établie par faisceau (second ressort) » (`rawStatus`), et
    par compétence `dates`, les journées de ses traces (tableau de dates,
    facultatif) ; `poles` vide ; ses délibérations sous « <id>|<code> »
    (décision du président, jury, débat, pièces, traces `{pieceId, role,
    pieceType, extract, date}`). Elle se joint toujours, même au jeu qui
    reçoit ses journées dans le même lot : elle n'est d'aucune journée.

13. **Archive de compte 1.2.0 : les analyses approfondies Twin9 (T10,
    ADR-011 §5).** `archive-export` gagne une seconde propriété OPTIONNELLE,
    `analysesTwin9` : les runs Twin9 du compte et la mémoire de leurs cartes,
    qui vivent sur le serveur, tels que `GET /api/twin9/mes-analyses` les rend
    (§8.5). Le schéma type leur ossature (`runs[]` : `id`, `journal`,
    `statut`, `profil`, `portfolio {nom, texte}`, `appels[]`, `sorties` ;
    `cartes[]` : `journal`, `referentiel`, `gabarits`, `memoire`) et laisse
    ouverts leurs contenus, ceux du moteur. Absente quand le compte n'a aucun
    run ; jamais réimportée : un run se relance. Ajout rétro-compatible en
    lecture, comme la 1.1.0. Depuis P0-1 (§8.9), chaque run peut porter
    `configuration` et `execution`, typés par le schéma `twin9-run`
    (`$defs.configuration`, `$defs.execution`, référencés par `$ref`) :
    facultatives, **absentes** — jamais nulles — pour un run lancé avant
    elles ou fini avant elles, si bien qu'un run ancien ne rend jamais
    l'archive invalide. Sans changement de version de l'archive.

14. **Pourquoi une génération s'arrête : un vocabulaire pour tous les
    fournisseurs, et une sortie tronquée est une erreur (P0-3,
    2026-10-22).** Chaque fournisseur dit à sa façon pourquoi il s'arrête
    (`stop_reason` d'Anthropic, `finish_reason` des API compatibles OpenAI,
    `finishReason` de Gemini, `done_reason` d'Ollama). Le moteur JS n'en lit
    qu'une **classe** : `end` (réponse finie), `max_tokens` (budget de
    sortie atteint), `context_window` (fenêtre de contexte pleine), `refusal`
    (refus du fournisseur ou du modèle), `other` (tout le reste, y compris
    une valeur que personne n'a vérifiée), ou `null` (aucun arrêt donné).
    `max_tokens` garde son nom, que testent les gardes existantes.
    - **La table est partagée** : `schemas/fixtures/arrets/arrets-fournisseurs.json`
      (`format`, `brut`, `classe` ; `format` est l'identifiant du
      fournisseur, car les fournisseurs compatibles OpenAI n'ont pas les
      mêmes valeurs documentées). N'y figurent que les valeurs relevées sur
      les documentations officielles le 2026-10-22 ; `engine/src/providers/stop.js`
      la reflète exactement (`stop.test.js` vérifie dans les deux sens), le
      PHP la lira. **Ollama n'a aucune valeur vérifiée** : tous ses arrêts
      valent `other`, une réponse Ollama coupée n'est pas encore détectée.
      Le relais du serveur rend la valeur brute d'Anthropic ou une valeur
      déjà normalisée : la classification est idempotente sur les classes.
      Une valeur brute qui n'est pas un identifiant court
      (`^[A-Za-z_]{1,32}$`) n'est jamais gardée : elle devient `other`.
      Deux décisions : un appel d'outil Anthropic (`tool_use`) est une fin
      normale (la démo et les crédits forcent un outil) ; `CONTINUATION` de
      Gemini (plafond d'une requête non streamée) vaut `max_tokens`. Le refus
      d'OpenAI (`message.refusal`) et le prompt bloqué de Gemini
      (`promptFeedback.blockReason`) donnent `refusal`, sans que leur texte
      ne sorte jamais de l'adaptateur.
    - **Le résultat de `complete()`** (accès direct, relais, fournisseur
      « crédits », mock) : `{text, usage, model, stopReason, stopReasonRaw,
      truncated}`, `truncated` valant vrai pour `max_tokens` et
      `context_window`. Gemini : les parts de réflexion (`thought: true`)
      sont exclues du texte, et la sortie comptée est
      `candidatesTokenCount + thoughtsTokenCount`, ce qui est facturé.
    - **Une sortie tronquée est une erreur.** Elle est payée et son texte est
      un fragment : `complete()` lève une `OutputTruncatedError`
      (`engine/src/providers/errors.js` : `code: 'sortie_tronquee'`,
      `status: 200`, `retryable: false`, `stopReason`, `stopReasonRaw`,
      `limit` — `sortie` ou `contexte` —, `usage`, `maxTokens`,
      `textLength`), en dehors des reprises : aucun second appel. Le
      fragment n'est gardé que dans une propriété non énumérable, et le
      message ne porte aucun contenu. Un appelant qui veut le fragment passe
      `allowTruncated: true`. Le fournisseur « crédits » de Twin6 compte le
      coût de l'appel (`onCout`) avant de lever. Un refus est classé, jamais
      levé : l'appelant décide.
    - **Ce que fait chaque appelant** : `executerTwin6` lève une erreur qui
      nomme l'étape et joint `etape`, `usageRun` (l'appel tronqué compris) et
      `calls`, et fait d'un refus une erreur explicite (`code: 'refus'`) ;
      `extractDay` ne refait jamais un appel tronqué (un second appel, au
      maximum de sortie du modèle, serait coupé et payé de nouveau), garde
      sa consigne « réduisez le texte de la journée », et un kairos tronqué
      se dégrade en `null` sous `kairosOptional` ; le banc d'essai, le
      lanceur de runs et le runner Node comptent l'usage de l'appel tronqué,
      et le banc le montre même quand le run échoue : `runVersionOnDays`
      joint à l'erreur l'usage cumulé jusqu'à elle (`usageRun`, avec ses
      `mesures`), que l'IHM affiche avec son coût sous le message ;
      la démo ne le refait pas (statut 200) et dit « Votre texte est trop
      long pour l'essai » ; la relance du dialogue de la cartographie dit
      « Relance coupée » ; le bac à sable rend au paquet tiers un
      `llm-error`, jamais le fragment. Aucun n'emploie `allowTruncated`.

15. **Master v4 : la date du passage d'une trace dans l'index, `at`
    (2026-10-22, sprint 4, T2 ; journal de la cartographie D-72).** Ajout 4.x
    facultatif. Une analyse rangée à une journée peut retenir des passages
    écrits d'autres jours du portfolio (dans la démonstration, l'analyse du
    10 février en retient 175 du 1er au 9) : chaque trace de l'index
    (`days[].variants[].verdicts[].traces[]`, jusqu'ici `{id, role}`) porte
    alors `at`, la date de son passage — la `sourceDate` de son détail —, et
    rien quand c'est la date de la journée (jamais `at: null`). Les calculs ne
    le lisent pas : la trace compte toujours dans la journée de son analyse
    (répartir par date de passage, T3, est une décision laissée à
    Christian). Il permet, sans lire aucun détail (D-67), de dire à la
    journée du passage quelle analyse l'a relevée.
    - **Qui l'écrit** : l'import, pour toute variante qui arrive avec son
      détail, quel que soit l'importeur (`mergeIntoDataset`, qui le lit dans
      la `sourceDate` des traces du détail) — dans un jeu neuf comme dans un
      jeu déjà passé (`passageDates` ci-dessous). Les importeurs d'un
      document-jour, d'une journée Aurora v3 ou d'une feuille de Merge v2
      (`aurora-day.js`) et d'un master V3 (`v3-master.js`) l'écrivent déjà
      eux-mêmes ; celui d'un run Twin9 (`twin9-run.js`) ne garde que `{id,
      role}`, l'import le complète (la `date` de la trace, lue par le
      greffier, peut différer de celle de la carte) ; AuroraCore et Twin6
      datent leurs traces de leur journée.
    - **Ce qui se lit sans lui** : une archive, un index ou un jeu d'avant le
      reçoivent de leurs détails — à l'import d'une archive
      (`importArchive`), au découpage (`splitArchive`, la version change
      donc), et, pour un jeu rangé dans le navigateur avant T2, par une
      passe unique à son ouverture (`store.addPassageDates` : tous ses
      détails lus une fois, dans la même transaction que l'écriture de
      l'index), dont la version est gardée à la racine du jeu,
      `passageDates` (entier, facultatif, aujourd'hui 1). Cette passe ne
      sert qu'aux variantes rangées avant que l'import n'écrive `at` : elle
      ne se refait pas, et une variante importée ensuite l'a déjà. Un jeu lu
      à la demande n'a pas ses détails ici : il ne passe pas, il se met à
      jour avec la démonstration (D-57) ; devenu d'ici, il passe à
      l'ouverture suivante. Une variante garde son
      identifiant (calculé sur le contenu de l'analyse, pas sur l'index) :
      réimporter une archive d'avant n'ajoute rien.
    - Schéma : `at` (`isoDate`) dans la trace résumée, `passageDates` à la
      racine ; validateurs régénérés. Un lecteur 4.x qui les ignore lit le
      même jeu.

16. **Master v4 : les traces de la stigmergie du greffier d'une analyse
    Twin9, `stigmergie` (2026-10-23, sprint 3, S3-3).** Ajout 4.x
    facultatif, présent seulement pour une analyse dont la carte du jour
    porte le bloc `stigmergie` (spec-stigmergie.md §9 de Twin_v9, §7.4
    ci-dessous). L'importeur d'un run (`twin9-run.js`) en garde, par liste
    blanche (`core/stigmergie.js`) :
    - dans le **détail** de la variante (`details[date].variants[id].stigmergie`) :
      `analyse` (le rang k de l'analyse dans l'histoire de la journée),
      `run`, `conservee` et `traces` — chacune `{id, code, start, end,
      extrait, tau, incertitude, statut, voie, role, source, analyses}`,
      valeurs simples seulement ; une trace sans code ni extrait, d'une
      incertitude hors de `faible`, `moyenne`, `forte`, `écartée`, ou d'une
      intensité qui n'est pas un nombre fini n'entre pas. Jamais les dépôts,
      les rejets, les traces lues, les explorateurs ni les runs des traces ;
    - dans l'**index** (`days[].variants[].stigmergie`) : `{analyse, traces,
      conservee}`, pour dire sans lire le détail (D-67) qu'une journée a des
      traces et proposer le portfolio surligné. Un jeu lu à la demande range
      le bloc du détail dans le fichier de la journée (`jours/<date>.json`).
    - **`conservee`** : `true` quand les résultats du run le disent
      (`traces_conservees`, §8.4) ou pour une journée que sa mémoire a
      reprise ; `false` quand ils disent l'analyse absente du journal de la
      mémoire de la carte, sans en dire la cause : une journée dont un appel
      est en panne (une panne n'est jamais un verdict), un texte modifié
      depuis, qui remet le journal à zéro (§7.4), une analyse sortie des
      dernières qu'il garde ; `null` quand rien ne le dit. Une archive
      réimportée garde la valeur qu'elle porte, telle quelle (une projection
      d'affichage, que le serveur ne confirme pas : §7.4). Seul `true` se
      montre « conservé » ; le rapport d'import dit les autres
      (`twin9-traces-non-conservees`, `twin9-traces-non-confirmees`).
    - Les calculs ne le lisent pas ; l'identifiant et l'empreinte de la
      variante ne le comptent pas (réimporter le même run ne l'ajoute pas
      deux fois). Schéma : `stigmergie` dans la variante résumée et dans le
      détail, incertitude par énumération ; validateurs régénérés.

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
  (le collège, les étages, le modèle d'un étage…), sauf s'il est
  facultatif : le fournisseur, qui s'hérite (§7.2), la famille d'un lecteur
  (ADR-012). Le profil rangé est complet : le moteur n'a rien à deviner.
  Le validateur PHP (opis) ne vérifie pas `required` pour une propriété
  dotée d'un `default` (option `allowDefaults`) : `ProfilRepository`
  complète donc le profil avant de le valider.
- **Objets JSON** : un profil voyage décodé en objets (`stdClass`) ou en
  texte JSON, jamais en tableau PHP, où `{}` et `[]` se confondraient (§6,
  UC-CAR-04). MySQL réordonne les clés d'un profil rangé (§6, UC-ADM-05) ;
  rien n'en dépend.
- **Validation** : PHP seulement. Le profil n'est pas un document que le
  moteur de cartographie du navigateur (`engine/`) produit ou lit ;
  `scripts/build-validators.mjs` ne le
  compile pas. La page `#/configuration` (T13) se construit depuis le schéma
  et laisse au serveur la validation, dont elle affiche le message.
- **Nombres** : un réglage que le schéma type `number` garde la forme d'un
  flottant (`1.0`, non `1`), quelle que soit la forme reçue : le navigateur
  ne distingue pas `1` de `1.0`, et la v9.8 lit `1.0` (T13). Un réglage
  qu'il type `integer` seulement est un entier (`5`, non `5.0`, que le
  schéma admet pourtant comme entier), jusqu'à 2^53 en valeur absolue :
  au-delà, un flottant (`1e21`, ou un entier de plus de 19 chiffres, que
  PHP décode en flottant) le reste ; le schéma borne donc tout entier que
  le moteur exige tel (`stigmergie.graine`, §7.4) : les réglages de la
  stigmergie refusent un flottant là où ils attendent un entier.
- **Règles de l'API** : la réflexion coupée refuse les efforts `xhigh`
  et `max`, pour toute étape où les réglages se combinent ainsi
  (`CallSettings::parEtape`, T13) ; et celles des fournisseurs (ADR-012,
  §7.2) : un réglage qui nomme un autre fournisseur que celui dont il hérite
  nomme aussi son modèle, au second ressort tout fournisseur nommé le
  demande ; le modèle de chaque appel suit le motif de son fournisseur
  (`motif_modele` du registre) ; un appel qui part ailleurs que chez
  Anthropic n'a pas d'effort, pas même celui de son étage. Le profil est
  refusé, l'étape nommée.
- **Choix admis** (`ProfilPolicy`, T13) : un référentiel publié et, s'il est
  donné, une de ses versions publiées ; un jeu de gabarits que son
  propriétaire peut choisir (T14, §8.6 : le jeu v9.8, le jeu par défaut, ses
  copies tant qu'il est de l'atelier) ; la clé personnelle là où
  l'administrateur l'a ouverte, et chez Anthropic seulement : un profil dont
  un appel part ailleurs n'admet que les clés de l'instance (ADR-012 §5) ;
  un prix pour chaque modèle Anthropic. Au lancement, à l'aperçu et à la
  reprise s'y ajoute (`ProfilPolicy::admettreAuLancement`), pour chaque
  fournisseur que ses appels atteignent (`CallSettings::atteints()` : ses
  étapes et ses lecteurs) : il est **disponible** — ouvert sur l'instance
  (§8.1) et, hors d'Anthropic, avec sa clé d'instance ; un seul message pour
  les deux, « Profil refusé — <étape> : le fournisseur <F> n’est pas
  disponible sur cette instance », pour que personne n'apprenne quelles clés
  l'instance détient ; la clé d'Anthropic n'est pas exigée (elle se lit à
  chaque appel, un run sans elle attend) — ; hors d'Anthropic, son modèle a
  son prix et ses plafonds dans la grille (« aucun prix pour
  <fournisseur:modèle> »), un budget de sortie dans son `plafond_sortie`, et
  une durée maximale (`duree_max_s`) que la tranche **la plus courte** que
  sert l'instance lui laisse en tête (`ProfilPolicy::dureeAdmise` : la
  tranche, réserve du tick ôtée, moins la marge de son dernier départ — 35 s
  pour une tranche de 40 s, 21 s pour les 25 s de cron-job.org), la règle
  même de la tranche ; la plus courte est celle de l'instance
  (`secondes_par_tranche`, celle de la page d'un run), ou celle que demande
  le déclencheur (`budgetSeconds` de `POST /api/admin/worker-tick`, gardé
  dans le réglage `twin9_tranche_declencheur` quand il change, 2026-10-22),
  si elle est plus courte ; `GET /api/twin9/admin/config` rend l'une
  (`secondes_declencheur`) et ce qu'elle laisse (`duree_max_admise`). Un
  modèle au pire cas insuffisant est refusé de même (§8.5). Un profil qui ne passe pas s'enregistre,
  mais ne s'estime, ne se lance ni ne reprend. `GET
  /api/twin9/configuration` porte `fournisseurs` : chaque fournisseur du
  registre, `{id, libelle, rgpd, disponible}`, un booléen sans sa cause ; et,
  pour l'accord du lancement, qui les nomme avant tout aperçu (l'aperçu
  emporte déjà le portfolio), les fournisseurs qu'atteignent les appels de
  chaque profil (`profils[].fournisseurs`) et du profil par défaut
  (`defaut_fournisseurs`) : `[{id, libelle, rgpd, voie}]` dans l'ordre du
  registre, comme l'aperçu (`Lancement::fournisseurs`, `voie` : `lots`,
  `directe` ou `mixte`) ; `null` pour un profil rangé que le schéma n'admet
  plus (son lancement est refusé de toute façon). Depuis le sprint 5, lot C
  (phase D, 2026-10-22), chaque profil y nomme aussi son référentiel
  (`profils[].referentiel` : `{id, version}`, `null` pour un profil rangé
  sans référentiel lisible), que la page de lancement propose par défaut
  (§8.4). La page `#/configuration`
  les recalcule en direct depuis le profil édité (`fournisseursDuProfil`,
  `web/src/views/configuration/profilSchema.js`, dont l'étage de chaque
  étape, les libellés, les étiquettes et les motifs de modèle sont comparés
  aux fichiers PHP par un test). Les droits sont au
  chapitre « Configuration Twin9 » de `docs/autorisations.md`. Le profil
  par défaut, que sert `GET /api/twin9/configuration` (`defaut`) et que
  prend un run lancé sans profil, est celui de la v9.8 avec le jeu de
  gabarits par défaut.
- **Profils prédéfinis** (`ProfilRepository::PREDEFINIS`) : des points de
  départ en lecture seule, qu'un nouveau profil copie, comme celui de la
  v9.8 ; `GET /api/twin9/configuration` les sert (`predefinis` :
  `[{id, nom, profil, fournisseurs}]`, chacun avec le jeu de gabarits par
  défaut et les fournisseurs qu'atteignent ses appels). Un seul aujourd'hui,
  « Stigmergie (essai) » (`stigmergie`,
  `api/config/twin9-profil-stigmergie.json`, §7.4), que la page
  `#/configuration` ne propose qu'en mode expert. Un run se lance avec un
  profil de son propriétaire ou celui de la v9.8 : un profil prédéfini se
  copie d'abord.

### 7.1 Ce que la v9.8 règle, et où le profil le range

| `config.json` de la v9.8 | Profil |
|---|---|
| `seuils_consensus`, `juge_leger`, `jury`, `premiere_impression`, `calques`, `merge`, `scan_global` | mêmes clés, mêmes valeurs dans le profil v9.8 (`ProfilTest` le vérifie sur le `config.json` de `TWIN_V9_DIR`) |
| `max_workers`, `parallel_jures` | `parallelisme.appels_directs` : réglages d'exécution, sans effet sur aucun prompt |
| `backend_tribunal`, `backend_rapide` | `etages.profond`, `etages.rapide` (fournisseur, modèle, budget de sortie, effort, réflexion) |
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
défaut), `voie` (celle des appels Anthropic, « directe » ou « lots » ; les
autres fournisseurs partent toujours en direct), `parallelisme.appels_directs`
(32 au plus), `parallelisme.journees` (journées menées de front quand aucun
appel ne part par lots ; dès qu'un appel part par lots, toutes le sont, §8.7),
`budget_usd` et `duree_minutes` (`null` : aucun plafond),
`cle` (« instance » ou « personnelle », Anthropic seulement), `gabarits` (l'identifiant du jeu :
« v9.8 », valeur du schéma, ou le nom d'une copie, §8.6) et `referentiel`
(`id`, et `version`, `null` pour la dernière publiée, figée dans la copie du
profil au lancement).

### 7.2 Étages et étapes

Chaque étage (`etages.lecteurs`, `etages.rapide`, `etages.profond`) donne un
fournisseur (absent : Anthropic), un modèle, un budget de sortie
(`max_tokens` chez Anthropic, réflexion comprise), un effort facultatif
(absent : celui du modèle) et une réflexion : « coupee », sous la forme que
le modèle accepte (`disabled` pour Haiku 5.5, `between_tools` pour Sonnet
5.5), ou « adaptative ». Un lecteur du collège et une étape
(`etapes.<étape>`) ne portent que ce qu'ils changent à leur étage.

Le fournisseur (ADR-012) est l'un des six du registre
`Twin9\Fournisseurs\Fournisseurs` : `anthropic`, `openai`, `mistral`,
`google`, `xai`, `openrouter` ; le schéma ne lui donne pas de valeur par
défaut. Absent, il s'hérite : Anthropic pour un étage, son étage pour une
étape, l'étage des lecteurs pour un lecteur. Qui nomme un autre fournisseur
que celui dont il hérite nomme aussi son modèle, dans le même objet. Le
schéma admet tout identifiant de 80 caractères au plus
(`^[a-z0-9][a-z0-9._:/-]{0,79}$`) ; l'API vérifie, appel par appel, le motif
du fournisseur : `claude-…` chez Anthropic et nulle part ailleurs, ni `/` ni
`:` chez Google, un slug `éditeur/modèle` sans suffixe `:` chez OpenRouter.
L'effort et la réflexion sont des réglages d'Anthropic : un appel qui part
ailleurs n'a pas d'effort, et son raisonnement suit l'entrée de la grille de
l'instance pour son modèle. La famille d'un lecteur, absente, est son
fournisseur, ou chez OpenRouter l'éditeur du modèle.

Les étapes, et l'étage qu'elles suivent comme dans la v9.8 :

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
un réglage de `second_ressort` vaut pour tous. Il couvre des étapes des deux
étages, et de leurs fournisseurs : un fournisseur qu'il nomme, quel qu'il
soit, demande son modèle.

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

### 7.4 La stigmergie du greffier (sprint 3)

Un écart voulu du moteur PHP, sans équivalent dans la v9.8 ni oracle
(`docs/twin9/spec-stigmergie.md` de `Twin_v9`, §2 et §11.3) : les passages
que valident le juge léger ou le tribunal déposent une trace dans la
mémoire de la carte (`stigmergie/<jour>`, sous `test/` en mode essai), qui
s'évapore d'une analyse de la journée à l'autre ; seul le greffier la lit,
dans le bloc des calques de son dossier. Aucun appel en plus.

- **Le réglage** : `stigmergie`, une clé **de premier niveau** du profil,
  jamais une clé de `calques` (`PariteTest` compare `calques` clé à clé avec
  l'oracle), **hors de `required`**, de valeur par défaut
  `{"enabled": false}` : un profil rangé avant elle la reçoit à sa
  complétion (`ProfilRepository::validate`), rien de plus. Le profil v9.8
  la porte, explicitement désactivée.

  | Clé | Type | Bornes du schéma | Absente |
  |---|---|---|---|
  | `enabled` | booléen, requis dans l'objet | — | — |
  | `evaporation` | `number` | [0,2 ; 1] | 0,3, la valeur du moteur |
  | `exploration` | `number` | [0 ; 1] | 0,2 |
  | `graine` | `integer` | [−(2^53 − 1) ; 2^53 − 1] | 1 |
  | `lignes` | `integer` | [0 ; 10] | 5 |

  Les quatre réglages n'ont pas de valeur par défaut au schéma : absents,
  ils prennent celle du moteur (`Stigmergie::DEFAUTS`), que leur
  description dit et que `ProfilTest` compare au moteur de `TWIN_V9_DIR`.
  Les types sont stricts : le moteur ne convertit rien, une chaîne, un
  booléen ou un flottant pour un entier ferait échouer le run ; l'API
  ramène un flottant sans partie décimale à un entier là où le schéma
  attend un entier (§7, « Nombres »), jusqu'à 2^53 en valeur absolue :
  d'où les bornes de `graine`, sans quoi `1e21`, que le schéma admet comme
  entier, arriverait en flottant au moteur (une `TypeError`, la
  spécification du moteur, §2, demandant au schéma de l'empêcher). Le
  plancher de l'évaporation est
  celui que conseille la spécification du moteur : en dessous de 0,2, une
  trace peut disparaître d'un coup quand son analyse sort des 16 que lit un
  run.
- **Ce que reçoit le moteur** (`MoteurReglages`, §8.1) : `config.stigmergie`,
  l'objet du profil recopié tel quel, **seulement si `enabled` est le
  booléen `true`** ; sinon aucune clé, et la config du profil v9.8 reste
  celle de la v9.8 à l'octet (`PariteTest`, `EmpreintesFigeesTest`
  inchangés). Ni `CallSettings::empreinte` (§8.2) ni
  `Evaluations::signature` (§8.7) ne la comptent : elle n'ajoute aucun
  appel. Le moteur la compte dans l'empreinte de la journée : l'activer, ou
  changer ses réglages, fait relire les journées de la carte, ce que
  l'aperçu montre.
- **Ce que la plateforme admet** (`ProfilPolicy::admettre`, à
  l'enregistrement, à l'aperçu et au lancement) : activée, elle demande
  `calques.accumulation` à `false` — les calques archivés votent déjà au
  consensus, les traces y compteraient deux fois — ; sinon « Profil refusé
  — /stigmergie : la stigmergie demande calques.accumulation à false ; les
  calques archivés votent déjà au consensus, ses traces y compteraient deux
  fois ». Le renforcement d'une analyse à l'autre demande `rescan` : sans
  lui, une journée inchangée est reprise de la mémoire, sans nouvelle
  analyse. Un moteur qui n'a pas la stigmergie (`Twin9\Stigmergie`)
  l'ignorerait : l'aperçu et le lancement d'un profil qui l'active sont
  alors refusés (« Profil refusé — /stigmergie : le moteur de cette
  instance ne connaît pas la stigmergie (Twin_v9 à mettre à jour) »).
- **Le profil d'essai** « Stigmergie (essai) »
  (`api/config/twin9-profil-stigmergie.json`) : le profil v9.8, la
  stigmergie activée avec les valeurs du moteur écrites
  (`{"enabled": true, "evaporation": 0.3, "exploration": 0.2, "graine": 1,
  "lignes": 5}`), `calques.accumulation` à `false` et `rescan` à `true` ;
  rien d'autre (`ProfilTest` le vérifie, et le suit quand le profil v9.8
  change). Il reste en mode complet : le mode essai ne lit que le premier
  pôle et la première journée, où le greffier n'est souvent pas convoqué.
- **La page `#/configuration`** ne règle la stigmergie qu'en mode expert
  (`lib/ui-mode.js`) ; en mode simple sa partie est masquée, sauf dans un
  profil qui l'active. Elle dit à côté du réglage ce que le serveur
  refuserait (l'accumulation des calques) et ce que fait `rescan`.
- **Ce que le moteur produit**, que la plateforme lit sans code nouveau :
  le journal `stigmergie/<jour>` de la mémoire de la carte (exporté et
  purgé avec elle), le bloc `stigmergie` en dernière clé de
  `carto_jour.json` (spec du moteur, §9), et `configuration.algorithme.stigmergie`
  dans le bloc de configuration du run (§8.9). `StigmergieTest` mène deux
  runs d'une carte par le tick, sur le scénario 16-test-mode de l'oracle :
  la première analyse fait les appels de l'oracle et dépose, la seconde,
  sous `rescan`, relit la première ; un troisième test met en panne le
  président d'un tribunal de la journée.
- **Ce que la plateforme en montre** (S3-3) :
  - **Conservées ou non.** Les résultats d'un run (§8.4) disent, par
    journée dont la carte porte le bloc, si son analyse est au journal de la
    mémoire de la carte (`traces_conservees`). Une journée dont un appel est
    en panne écrit sa carte avec le bloc, mais son analyse n'entre jamais au
    journal (`failedUnder` du moteur) : ses traces sont dites non
    conservées. Le signal se lit dans la mémoire, et non dans le journal des
    appels du run, effacé à sa fin (`RunRepository::terminer`).
  - **Dans la cartographie** (`carto/ui/Stigmergie.jsx`), sous les verdicts
    de la modale du jour : chaque trace de l'analyse qui compte, sa
    compétence, sa nature (l'incertitude calculée par la procédure, en mots
    et par la marque de son surlignage : `carto-hl--trace-faible`,
    `-moyenne`, `-forte`, `-ecartee`, une couleur et un trait), son dernier
    verdict, ce qu'en fait le greffier suivant, son passage ; « Ouvrir dans
    le portfolio » le surligne de sa marque, retrouvé par son extrait
    (coupé à 240 caractères par le moteur : un long passage ne se surligne
    qu'en tête). Son **intensité** (`tau`, de 0 à 3) ne se lit qu'en mode
    expert et pour le cartographe (`intensitesVisibles` : jamais sans
    session ni dans une copie autonome), et n'est jamais appelée « score ».
  - **Le portfolio surligné** (Export de l'interface, quand une journée a
    des traces conservées) : le portfolio en Markdown, chaque passage d'une
    trace conservée entouré, ligne par ligne, d'un `<mark
    data-twin9-code="…" data-incertitude="…">` (et `data-intensite` quand
    l'intensité se montre), chaque journée suivie du tableau de ses traces
    entre `<!-- twin9-traces -->` et `<!-- /twin9-traces -->`.
  - **À l'import** (`lib/twin9/marques.js`) : l'import d'un portfolio dans
    l'interface, la page « Mon portfolio » (fichier, Google Docs, texte
    collé ou écrit), la restauration d'une archive (bornes des journées
    ramenées) et le texte que la page Twin9 envoie retirent les éléments
    qui portent `data-twin9-*`, `data-incertitude` ou `data-intensite`
    (leurs balises, pas leur texte) et le tableau des traces : réimporté,
    le portfolio surligné redonne à l'octet le portfolio sans marques, et
    aucune trace n'entre par le texte d'un fichier. Le texte rendu d'un
    portfolio n'en montre aucune.
  - **Les traces du jeu, une projection d'affichage** (sprint 3, §6.4) : le
    bloc `stigmergie` des variantes (§4 point 16), `conservee` compris,
    n'est qu'une copie, côté navigateur, de ce qu'ont dit les résultats ; le
    moteur ne le lit jamais. Une archive réimportée, ou un document
    `twin9-run` déposé à la main dans l'Import, le reprend tel qu'il est
    écrit : un fichier modifié peut le forger, et la modale du jour le
    montrerait conservé. Seule la remise depuis la page du run
    (`twin9RunFiles`) porte ce que le serveur dit.

## 8. Le moteur Twin9 et la plateforme (T7)

Un run Twin9 s'exécute sur le serveur, par tranches (ADR-011 §2). La
plateforme ne connaît du moteur, chargé depuis `TWIN_V9_DIR` (ADR-011 §4), que
ce contrat ; le moteur factice des tests (`api/tests/fixtures/twin9-factice`,
public) l'implémente aussi.

- **`Twin9\Plateforme`**, construite une fois par run et par tranche avec :
  les réglages de la v9.8 en JSON (`config` et `roster` effectifs, options
  `jours`, `rescan`, `test`, `memoire`, et, depuis T16, `referentiel`, le
  référentiel du run, §8.8), le nom et le texte du portfolio, le jeu de
  gabarits (chaque gabarit par son nom, `lourd/20-greffier` ; sans
  `referentiel`, le moteur y lit RESPIRE dans les fiches `tagger/P1` à `P7`,
  comme avant T16), la sortie du run (`--out` : les identifiants
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
  `passe` la reprendrait) ; et `poles`, les pôles du référentiel du run
  (avant T16, ceux du jeu). Rien n'est écrit.

**Une sortie tronquée est une panne** (P0-2, 2026-10-22). Une réponse
qu'Anthropic arrête sur `max_tokens` (le budget de sortie de l'étape est
atteint) ou sur `model_context_window_exceeded` (la fenêtre de contexte du
modèle est pleine) entre au journal comme une panne
(`AnthropicCaller::lireMessage`, en direct comme par lots), au même titre
qu'un refus du modèle :

- **jamais relancée** : avec le même prompt et le même budget, la troncature
  se reproduirait, et la sortie entière serait payée une seconde fois. La
  seule tentative est celle comptée au départ ; par lots, l'appel n'est pas
  resoumis ;
- **payée** : son coût est celui de l'usage que rend Anthropic, jetons de
  sortie compris, réconcilié avec sa réserve comme celui d'une réponse
  (§8.5) ;
- **sans texte** : le début de réponse n'est jamais journalisé ; la raison
  de la panne (`twin9_appels.panne`) est un libellé du code, court et stable,
  `réponse tronquée : budget de sortie atteint (max_tokens)` ou `réponse
  tronquée : fenêtre de contexte pleine`, puisque le moteur la transmet aux
  cartographes et au prompt d'un rapporteur ;
- **comptée** à part : `tronques`, au total et par étape, dans les compteurs
  du run (`RunRepository`, sous-ensemble de `pannes`), et dans ceux de la
  tranche (`twin9Tronques`).

C'est un **écart voulu avec la v9.8**, dont `AnthropicBackend`
(`aurora/backends.py`) prend le texte coupé pour une réponse sans regarder
`stop_reason` : un texte tronqué ne peut plus entrer dans une carte, ni être
repris plus tard comme « inchangé ». La parité n'en est pas touchée :
l'oracle 02-cloud n'enregistre aucun arrêt, et ses rejeux répondent
`end_turn`. **Effet mémoire** : une journée dont un appel est en panne
n'entre pas dans la mémoire de la carte ; le run suivant la réinstruit,
avec ses appels. **Effet sur le moteur** : après une panne, le moteur peut
redemander l'artefact sous `<id>#2` (un greffier, par exemple) ; ce second
appel, facturé lui aussi, a toutes les chances d'être coupé de même. Le
remède n'est donc pas de relancer le run tel quel : **augmentez le
`budget_sortie` de l'étape** dans le profil (§7.2), puis relancez. **Ce
remède a un coût** : le budget de sortie entre dans l'empreinte des réglages
(§8.2, `CallSettings::empreinte` hache étages et étapes) ; l'empreinte
changée, le run suivant instruit de nouveau, et paie, **toutes** les
journées de la carte que porte le portfolio, pas seulement celle en panne
— l'aperçu du lancement le dit (« N journées sur M à instruire (… changées) »)
et en prévoit le coût. Un appel tronqué de la fusion (relectures,
arpenteur) n'est d'aucune journée : la fusion se refait à chaque run. La
page du run nomme les étapes des sorties tronquées quand les compteurs
d'un run fini les donnent (`compteurs.par_etape`, ses étapes du moteur
rapportées à celles du profil), et le dit.

L'arrêt brut reste dans `twin9_appels.stop_reason`, **assaini** avant
d'être écrit (`Fournisseurs\Arret::assainir`) : un identifiant court
(`^[A-Za-z_]{1,32}$`) tel quel, toute autre valeur `other`, un arrêt absent
`NULL` ; jamais un texte du fournisseur. Sa classe (`Arret::classe`) suit un
vocabulaire commun à tous les fournisseurs : `end` (`end_turn`,
`stop_sequence`, `tool_use`), `max_tokens`, `context_window`
(`model_context_window_exceeded`), `refusal`, `other` (`pause_turn`, toute
valeur inconnue), ou nulle. Les tables des autres fournisseurs (P1-5) sont
celles de `schemas/fixtures/arrets/arrets-fournisseurs.json`, que `Arret`
reflète exactement, comme le moteur JS (`FournisseursTest`) : `CONTINUATION`
(Gemini) et `model_length` (Mistral AI) y sont des sorties tronquées.

### 8.1 Les réglages d'un run

`twin9_runs.reglages` garde la copie du profil (`profil`, §7 : réglages
d'appel, voie, parallélisme, clé, référentiel et jeu de gabarits) et les
réglages de la v9.8 que lit le moteur (`moteur`). Au lancement (T9, §8.4),
`MoteurReglages` les tire de la copie du profil et du référentiel qu'elle
nomme (T16), de rien d'autre : les
paramètres d'algorithme sous leurs noms du `config.json`, troncatures
comprises ; `backend_tribunal` et `backend_rapide`, du type du fournisseur
de leur étage (`anthropic` quand il n'en nomme pas), aux modèles des étages
profond et rapide (le rapide servant aussi de `model_mini`) ; `max_workers`,
l'appel direct simultané du profil, et `parallel_jures`, vrai ; le collège développé comme le fait `twin9.py`, chaque
passe un lecteur (`haiku#1`…), du type de son fournisseur résolu et de sa
famille (déclarée, sinon celle de son fournisseur), avec sa graine
(`stable_hash("haiku|passe1")` modulo 2³¹−1) et son sel (`|passe1`) ; les
options `jours`, `rescan`, `test` (le mode essai) et `memoire` ; `referentiel`, le référentiel du run
tiré de la base à sa version (T16, §8.8) ; et `config.stigmergie`, la
stigmergie du greffier du profil, **seulement si elle est activée** (§7.4). Le profil v9.8 donne ainsi les réglages
du scénario `02-cloud` de l'oracle, au type des backends près (`mock` sous
`--mock`), et un run qu'ils conduisent est celui de l'oracle, appel par appel
(`PariteTest::testTheV98ProfileDrivesTheEngine`). Les autres tests de parité
y mettent les réglages de leur scénario, que le profil ne sait pas tous dire
(collèges de plusieurs familles). Les nombres gardent leur forme : `1.0` reste un
flottant, comme en Python, où il n'est pas `1` (`JSON_PRESERVE_ZERO_FRACTION`).

Chaque appel part avec les réglages de son étape (`CallSettings`) : l'étape
du moteur (`Call::step`, la tâche de la v9.8) donne l'étape du profil, puis
son étage, comme au §7.2. Ces réglages nomment aussi le fournisseur de
l'appel et sa voie, appel par appel : `lots` si le fournisseur est Anthropic et
que le profil a choisi `voie: lots`, `directe` sinon. Le profil peut nommer
le fournisseur de chaque étage, étape ou lecteur (§7.2) ; un run n'atteint
que ceux que l'administrateur a ouverts (ADR-012) : `twin9_fournisseurs_ouverts`
dans la configuration Twin9, `["anthropic"]` par défaut, un fournisseur
étiqueté `non` (Google, xAI, OpenRouter) n'y figurant que si
`twin9_fournisseurs_non_rgpd` vaut `true` (`false` par défaut). `GET` et
`PUT /api/twin9/admin/config` portent en plus, en lecture seule comme
`releve_tarifs`, `fournisseurs` : chaque fournisseur du registre,
`{id, libelle, rgpd, lots, env, cle_instance}` — `env`, le nom de la
variable de la clé de l'instance, `cle_instance`, si elle est posée, un
booléen, jamais la clé (`Fournisseurs::pourAdministrateur`) ; un `PUT` qui
l'envoie est refusé (clé inconnue). La page d'administration
(`#/admin/twin9`, UC-ADM-05) ouvre les fournisseurs et tarifie leurs
modèles avec leurs plafonds. Chaque
appel direct part chez le fournisseur que nomment ses réglages, par
l'appelant du registre (`Twin9\Fournisseurs\Registre`), avec la clé de ce
fournisseur (`RunKey`, ci-dessous). Le journal garde le fournisseur de
chaque appel (`twin9_appels.fournisseur`, migration
`032_twin9_fournisseurs.sql`, `anthropic` pour une ligne d'avant) : sa clé
de prix, la table de son arrêt et les comptes par fournisseur le lisent.

**La voie mixte** (P1-5) : dans un même run, les appels d'Anthropic partent
par lots (si le profil dit `voie: lots`) et ceux des autres fournisseurs en
direct, dans la même tranche (`Worker\Twin9Slice`).

- Un run qui a une route directe est **ouvert à chaque tranche**, ses lots
  relevés d'abord ; un run tout par lots ne l'est que quand ses lots
  l'appellent (§8.3). Il mène toutes ses journées de front, ses appels
  directs bornés par `appels_directs`.
- Ses lots partent **une fois par tranche au plus**, en tête de tranche,
  avant ses appels directs : tous les appels par lots que sa première passe
  connaît (`Twin9Lots::candidats`, ceux de voie `lots` seulement) ; ceux
  qu'une passe suivante révèle partent à la tranche suivante. Pendant chaque
  requête synchrone des lots (vérification, création), bornée par le
  dernier départ de la tranche, la tranche lit les réponses directes en vol
  (`sender->wait(maintenant)`). La boucle directe ne part jamais avec un
  appel par lots. La sentinelle `lots à soumettre` reste une valeur exacte
  de `attente`, jamais composée.
- **Suspensions** par fournisseur, ou pour les lots : une clé absente, un
  plafond de dépense, un fournisseur fermé ne retiennent que les appels de
  ce fournisseur ; une clé OpenAI absente ne retient pas le lot d'Anthropic.
  La page du run lit les raisons, jointes par « ; ».
- **La garde** est relue à l'ouverture de chaque tranche, et pour tout
  fournisseur qu'un appel nomme : un fournisseur que l'instance n'ouvre plus,
  une clé personnelle vers un tiers, une clé d'instance tierce absente
  suspendent ce fournisseur ; le run attend. Sa page dit « fournisseur OpenAI
  indisponible sur cette instance », les mêmes mots pour un fournisseur fermé
  et pour une clé d'instance absente (ou refusée) : personne n'apprend quelles
  clés l'instance détient (§8.4, `docs/autorisations.md`), l'administrateur
  lit l'un et l'autre sur sa page (2026-10-22) ; « clé personnelle refusée
  chez … » pour la clé de l'auteur lui-même.
- **Durée d'un appel tiers** : il ne part que si la durée maximale de son
  modèle (`duree_max_s` de la grille, 30 s à défaut) tient dans ce qui reste
  de la tranche — coupé, il peut être facturé quand même (OpenRouter le
  documente) ; il part en tête de la tranche suivante (compteur
  `twin9Gardes` du worker). Un modèle plus long que ce que la tranche lui
  laisse en tête (`Twin9Slice::dureeAdmise`) — un run lancé avant que le
  déclencheur ne raccourcisse ses tranches — ne part pas dans cette
  tranche : ses appels seuls attendent (les autres modèles du même
  fournisseur partent), et la page dit qu'il attend une tranche plus longue,
  que donne sa page ouverte ; retenu ainsi **plus de 30 minutes**
  (`twin9_runs.retenu_depuis`, migration `033_twin9_retenue.sql`, remis à
  zéro par une tranche qui ne retient rien et par une reprise), le run
  s'arrête, sa réserve rendue (2026-10-22 ; avant, tout le fournisseur
  restait suspendu et le run en cours sans fin, son engagement gardé).
  Chaque coupure d'un appel par la fin d'une
  tranche est comptée dans le journal (`twin9_appels.coupures`), puis par
  fournisseur dans les compteurs et l'exécution (§8.5, §8.9).
- **Repos commun** : après une 429 d'un fournisseur (ou son plafond), la
  clé de l'instance se repose de ce fournisseur pour tous les runs de la
  tranche, le temps que dit son `Retry-After` (60 s pour un plafond).
- **Arrêt différé** : quand un run doit s'arrêter alors que des appels
  directs sont en vol — un tiers qui refuse les réglages d'un appel (HTTP
  400 : « OpenAI refuse les réglages de l'appel au modèle … (HTTP 400) : le
  run s'arrête, à reprendre une fois ses réglages ou ceux de la grille
  corrigés », l'appel refusé attendant sans perdre de tentative), un lot
  refusé, un prix absent, le moteur en échec, un run retenu **plus de
  30 minutes** par le plafond de dépense d'un tiers, ou par le refus de la
  clé de l'instance chez un tiers (`twin9_appels.plafond_depuis`, gardé d'un
  essai à l'autre) —, plus rien
  ne part ni ne se rejoue ; ses appels en vol reviennent (ou la fin de
  tranche les coupe) et sont écrits avec leur coût ; puis il s'arrête
  (`echoue`), et ce que tiennent ses appels revient (§8.5) ; son lot encore
  chez Anthropic n'est pas annulé : relevé une fois fini, ses réponses
  écrites et payées (§8.3). Aucun texte d'un
  fournisseur n'entre dans ces raisons.

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
température. Chaque requête de Twin9 à Anthropic — appel direct, et chaque
requête de la voie par lots (vérification, création, état, résultats,
annulation, suppression, liste ; 2026-10-22) — porte en plus un en-tête
`traceparent` dont la trace n'est pas échantillonnée (`00-<trace>-<span>-00`,
identifiants aléatoires, une trace par requête) : un export OpenTelemetry
« contenu complet » configuré sur le compte de la clé ne reçoit rien de ses
prompts (ADR-012 §4). `/twin6/appel` ne le porte pas : ses prompts sont ceux,
publics, de Twin6. Avec une clé personnelle, les lots restent visibles du
titulaire dans sa Console (faits d'API, §7) : l'en-tête n'y change rien.

Les appels aux autres fournisseurs (ADR-012 §4 ; faits lus sur leurs
documentations officielles le 2026-10-22) partent à l'adresse verrouillée de
leur fournisseur (`Fournisseurs::REGISTRE`, `url`), la clé dans un en-tête
seulement (`authorization: Bearer` ; `x-goog-api-key` chez Google), sans
température ni `top_p`, ni séquence d'arrêt. OpenAI, Mistral AI, xAI et
OpenRouter par Chat Completions (`ChatCompletionsAppelant`) : le prompt en
message utilisateur, le budget de sortie au §8.5 ; `store: false` chez
OpenAI ; `provider: {data_collection: "deny", allow_fallbacks: false}`
chez OpenRouter. Google par `generateContent` (`GeminiAppelant`) : le modèle
dans le chemin, `generationConfig.maxOutputTokens`,
`generationConfig.thinkingConfig.thinkingLevel` si la grille le règle,
`store: false` au premier niveau. Chaque réponse se lit dans le même
vocabulaire (`Fournisseurs\Appelant`) : seule une fin (classe `end`) est
une réponse ; un refus (`message.refusal`, `content_filter`, un prompt
bloqué, `SAFETY`…), une sortie tronquée (`length`, `model_length`,
`MAX_TOKENS`, `CONTINUATION`), tout autre arrêt et une erreur dans une
réponse 200 (OpenRouter) sont des pannes, jamais rejouées ; une 429 attend
son `Retry-After`, 10 s sans lui ; une 402, ou une 429 d'OpenAI dont le code
dit le crédit, le plafond ou le quota épuisé, est un plafond (`plafond`) ;
une 400 dit que le fournisseur refuse les réglages (`configuration`) ; une
401 ou une 403, qu'il refuse la clé de l'instance (`cle_refusee` : révoquée,
mal recopiée) — l'appel attend comme sur un plafond, sans perdre de
tentative, la clé de l'instance se repose de ce fournisseur pour toute la
tranche, la page du run le dit indisponible sans dire pourquoi, le worker le
compte (`twin9ClesRefusees`) ; trente minutes ainsi, le run s'arrête, sa
réserve rendue (2026-10-22 ; avant, chaque appel tombait en panne après trois
tentatives, et la carte sortait sans ce fournisseur). Les
textes des fournisseurs ne sortent jamais : erreurs écrites par le code,
arrêt brut assaini (§8), modèle servi gardé s'il est un identifiant. La
clé (`RunKey::pour`, par fournisseur) : celle de l'instance, lue dans la
variable du registre (`OPENAI_API_KEY`, `MISTRAL_API_KEY`, `GOOGLE_API_KEY`,
`XAI_API_KEY`, `OPENROUTER_API_KEY`, des secrets de `api/config/app.php`) ;
une clé personnelle, chez Anthropic seulement, refusée appel par appel pour
tout autre fournisseur.

### 8.2 L'empreinte des réglages

Une entrée de la mémoire (journée, faisceau, condensé et arpentage de
l'Arpenteur) ne se reprend que sous les mêmes réglages : à côté de
l'empreinte de la v9.8, elle garde celle de la plateforme
(`CallSettings::empreinte`), qui couvre ce que la v9.8 ne compte pas et qui
change une réponse : les réglages d'appel des étages, des étapes et des
lecteurs, les troncatures, les gabarits du jeu (hors `merge/` : la mémoire ne
garde pas les relectures) et, depuis T16, le référentiel que lit le moteur
(`ReferentielMoteur::empreinte`, §8.8 : ses fiches, préambules, noms, motif et
libellé). Un run sans référentiel — d'avant T16, ses fiches dans son jeu —
garde son empreinte. Un fournisseur nommé là où il s'hérite de toute façon
— Anthropic sur un étage, celui de son étage sur une étape, celui de l'étage
des lecteurs sur un lecteur — n'y entre pas
(`CallSettings::sansFournisseurHerite`), ni dans la signature des évaluations
(§8.7) : un profil tout Anthropic garde ses empreintes, que
`EmpreintesFigeesTest` fige. Celui du second ressort y entre toujours, sans
quoi deux profils dont les appels partent chez deux fournisseurs
partageraient une empreinte (ADR-012 §2). Les sorties gardent l'empreinte de
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
  peut employer par lots (`CallSettings::combinaisons('lots')`). Un refus
  (HTTP 400) arrête le run, avec la raison que donne l'API ; une erreur du
  fournisseur le fait attendre.
- **La vie d'un lot** (`twin9_lots`) : `soumission`, la ligne écrite avant
  que le lot parte ; `en_cours`, son identifiant Anthropic connu ; `releve`,
  ses résultats écrits au journal ; `supprime`, supprimé chez Anthropic.
  `annulation` vaut pour un run annulé, son lot annulé chez Anthropic et
  pas encore relevé (relevé aussi par un run repris entre-temps).
- **Le relevé.** La tranche demande où en est chaque lot. Un lot fini voit ses
  résultats entrer au journal comme ceux des appels directs
  (`AnthropicCaller::lireMessage`), au coût de l'usage rendu, à moitié prix ;
  un résultat tronqué est une panne, jamais resoumise (§8, P0-2).
  Une requête en erreur repart dans un lot suivant, sa tentative comptée
  (trois, puis la panne) ; une requête expirée aussi, sa tentative rendue.
  Le lot est ensuite supprimé chez Anthropic.
- **La soumission** a, pour la création d'un lot, au moins le temps d'une
  soumission (le quart de la tranche, huit secondes au plus) avant le
  dernier départ de la tranche, qui borne la requête : venue plus tard
  (après une longue vérification), elle attend la tranche suivante. Une
  création qui n'a pas pu partir quand même (plus une seconde : aucune
  requête, `non_envoye`) n'est pas un lot perdu : ses appels attendent, leur
  tentative rendue, et partent à la tranche suivante (2026-10-22).
- **Un lot perdu**, parti sans que sa réponse arrive, est cherché parmi les
  lots de l'espace de la clé : même nombre de requêtes, créé dans les dix
  minutes autour de son départ, puis, une fois fini, les mêmes `custom_id`.
  Introuvable dix minutes après son départ, il n'est jamais parti, et ses
  appels repartent.
- **Un run qui n'est plus en cours** (annulé, en échec ou fini) : ses lots
  sont relevés une fois finis, comme ceux d'un run en cours — chaque réponse
  écrite avec son coût réel et débitée, une requête en erreur, expirée ou
  annulée rendue (elle repart à une reprise) —, ce que tenaient leurs appels
  soldé (`RunCosts::liberer`), puis supprimés. Seul un run **annulé** par son
  auteur voit d'abord son lot en cours annulé chez Anthropic ; les réponses
  qui arrivent malgré l'annulation sont lues et payées de même. Un run en
  échec garde son lot chez Anthropic jusqu'à sa fin : une requête traitée est
  facturée (faits d'API, §8), sa réponse est gardée et payée une fois,
  jamais supprimée sans être lue (2026-10-22, revue de la voie mixte). Un
  lot perdu, une fois retrouvé, de même.
- **Entre deux lots**, le run n'est pas rejoué : la tranche demande seulement
  où en sont ses lots, et il ne compte pas parmi ses N runs. Un run mixte
  (§8.1, P1-5) l'est à chaque tranche, pour ses appels directs ; ses lots,
  qui ne portent que ses appels d'Anthropic, partent une fois par tranche
  au plus, en tête.

### 8.4 Lancer, suivre, lire (T9)

- **Le lancement** (`Twin9\Lancement`, `POST /api/twin9/runs`) : le profil
  choisi, un des siens ou celui par défaut (celui de la v9.8, avec le jeu de
  gabarits par défaut, T14), est revalidé (§7) et admis (`ProfilPolicy`) ;
  sa version de référentiel, nulle, devient la dernière publiée, figée dans
  la copie ; le référentiel, à cette version, est tiré de la base dans les
  réglages du moteur (T16, §8.8 : un moteur ou un jeu d'avant T16 y sont
  refusés). Le jeu de gabarits que choisit le profil (§8.6) devient
  l'instantané du run. Le moteur construit une fois sa `Plateforme`
  pour lire le portfolio : le nom de son journal range la carte. Le run garde
  son **attestation** (`twin9_runs.attestation`) : `profil` (`id`, nul pour
  celui de la v9.8, `nom`, et `mode` depuis T10), `gabarits` (`jeu`, `versions` de chaque gabarit
  — ses versions archivées plus une —, `empreinte` du jeu), `referentiel`
  (`id`, `version`, et depuis T16 `empreinte`, §8.8), `moteur` (`commit` : la
  tête du dépôt `TWIN_V9_DIR`, sinon
  la première ligne de son fichier `COMMIT`, sinon nul). Il garde aussi sa
  visibilité (`privee` ou `cartographe`) et la date de l'accord (`accord_at`),
  sans lequel rien ne part. Depuis la voie mixte (P1-5, ADR-012), l'accord
  nomme les fournisseurs : `accord: {fournisseurs: [ids]}`, comparé à ceux
  qu'atteignent les appels du run (`CallSettings::fournisseurs()`, l'aperçu
  les donne), `422` « Accord requis : il nomme les fournisseurs auxquels ce
  run envoie votre portfolio — … » s'ils diffèrent ; `true` reste admis pour
  un profil tout Anthropic. La page de lancement (`#/twin9`) envoie toujours
  la liste, même d'Anthropic seul : son texte d'accord nomme chaque
  fournisseur, sa voie et son étiquette RGPD, lus dans la configuration
  (`profils[].fournisseurs`, `defaut_fournisseurs`, §7) avant tout aperçu, et
  l'accord donné tombe quand le profil choisi en atteint d'autres ou par une
  autre voie. La liste, triée, est gardée dans la
  configuration (`accord.fournisseurs`, §8.9). Une reprise relit la garde
  de ses fournisseurs (§7.2, `admettreAuLancement`) : un fournisseur fermé
  depuis, ou sans sa clé d'instance, la refuse en `422`. Depuis P0-1, il garde aussi sa **configuration**
  (§8.9), écrite au lancement et jamais modifiée, distincte de l'attestation.
- **Le référentiel choisi au lancement** (sprint 5, lot C ; phase D,
  2026-10-22). `POST /api/twin9/runs` et `POST /api/twin9/runs/apercu`
  acceptent `referentiel: {id, version?} | null`, facultatif : absent ou
  nul, celui du profil ; sinon `id` au motif des identifiants de
  référentiel (`ReferentielRepository::ID_PATTERN`) et `version` semver ou
  nulle (la dernière publiée), aucune autre clé, sans quoi `422`
  « Référentiel invalide : {id, version?} (version semver, ou null pour la
  dernière publiée), ou null pour celui du profil ». `Lancement::preparer`
  l'écrit dans la **copie** du profil, juste après l'avoir lue et avant
  `ProfilPolicy::admettre` : tout ce qui vaut pour le référentiel d'un
  profil vaut pour lui — un brouillon ne sert que le run d'essai de son
  auteur (§9), un référentiel ou une version non publiés sont refusés
  (`422` « Profil refusé — /referentiel/id : … » ou « …/version : … »), la
  version est figée dans la copie, un jeu d'avant T16 le refuse (§8.8) —,
  et il entre dans l'empreinte des réglages, l'attestation
  (`referentiel`), la configuration (§8.9) et la carte (sa mémoire est
  celle de ce référentiel). Le profil enregistré ne change pas.
  **Garde du jury** : quand l'identifiant choisi n'est pas celui du profil,
  `jury.specialistes` (un spécialiste par numéro de pôle) et
  `jury.par_competence` (par code), réglés pour le référentiel du profil,
  sont vidés dans la copie (`{}`, leur défaut) ; l'aperçu nomme ceux qu'il
  a vidés (`jury_retire`). La page de lancement (`#/twin9`) propose un menu
  « Référentiel » : « Celui du profil » par défaut, chaque référentiel
  publié (sa dernière version, `version` nulle) et, en mode expert, ses
  brouillons ; toujours en mode expert, en mode simple dès que plus d'un
  référentiel est publié. Elle n'envoie `referentiel` que pour un autre
  choix que celui du profil.
- **Le portfolio envoyé** (sprint 4, T0 ; journal de la cartographie
  D-73). Le moteur découpe le texte à sa façon (`Twin_v9/php/src/Portfolio.php` :
  un titre `##` ou `###` qui porte une date, sinon une date Google Docs,
  sinon rien de daté), l'interface par `segmentText` ; ils divergent
  (« 1er.02.2026 », `####`, un titre daté au milieu d'une journée, deux
  entrées du même jour en `_b`). La page de lancement n'envoie donc pas le
  texte brut, à l'aperçu comme au lancement, mais `portfolioPourTwin9(texte,
  {segments}).texte` (`web/src/lib/twin9/portfolio-pour-twin9.js`) : les
  journées de la fiche du portfolio (ses `segments`, retouches à la main
  comprises), sinon de `segmentText`, une par date ; un en-tête que le moteur
  lit à la même date est gardé, sinon `### AAAA-MM-JJ` s'ajoute en tête de la
  journée ; toute autre ligne qu'il lirait comme un titre daté, ou que
  l'interface lirait comme l'en-tête d'une autre journée, est précédée de
  « — » ; les passages sans date passent en tête, où le moteur ne lit rien.
  Un texte que le moteur lit déjà en ces journées, chacune avec son texte,
  part à l'octet, comme un texte de moins de deux journées datées : le
  moteur ne date pas une journée seule. Il peut pourtant y lire deux titres
  datés d'autres jours (« ### Retour sur la séance du 26.01.2026 ») ; `autres`
  dit alors les journées qu'il y lit et que l'interface n'a pas, `nonLues`
  celle de l'interface qu'il n'y lit pas (avant son premier titre daté), et
  l'aperçu les nomme ; neutraliser ces titres est à décider. Un texte
  qu'il lit en mode Google Docs le reste : une journée y reçoit
  « JJ.MM.AAAA », une ligne vide et un trait, jamais un titre daté (deux
  titres datés le feraient changer de mode, et toutes les journées
  changeraient). L'aperçu
  dit les journées dont le texte, tel que le moteur le lit, change
  (`retouchees`) : évaluées sur le texte brut, leur empreinte change et la
  mémoire de la carte les instruit de nouveau, une fois (le texte envoyé
  ensuite est le même). `disparues` dit les journées que le moteur lisait
  dans le texte brut et qu'il ne lit plus dans le texte envoyé (leurs
  identifiants : un `<date>_b` réuni à sa date, un « Retour sur la séance
  du … » rendu à sa journée, une date corrigée dans la fiche) : lue par un
  run précédent, une telle journée reste dans la mémoire de la carte, qui
  est additive (`Journees.php` du moteur), et sa fusion la compte encore,
  avec le même passage dans la journée qui l'a reçu ; l'aperçu nomme
  celles que la carte garde (son `memoire`). Rien ne les retire de la
  carte. Les expressions du moteur sont copiées, documentées,
  dans le module ; `api/tests/Twin9/PortfolioPourTwin9Test.php` passe le
  texte qu'il rend (`schemas/fixtures/twin9-portfolio/`) au `Portfolio` du
  vrai moteur. Le serveur ne change pas : il range et analyse le texte reçu,
  et le run garde ce texte tel qu'il a été envoyé (son portfolio, que
  l'archive du compte exporte, §4 point 13).
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
  (ses lots sont annulés, relevés puis supprimés, §8.3) : la route rend
  aussitôt ce que tiennent ses appels qu'aucune tranche n'a en vol (un appel
  en attente rendu, une issue soldée au coût réel :
  `RunCosts::libererHorsVol`) ; la tranche qui le tient n'envoie plus rien (le
  statut est relu avant chaque départ), ses appels en vol reviennent, écrits
  avec leur coût, et sa fin solde ce qu'ils tiennent au coût réel ; un appel
  laissé envoyé par un tick mort l'est en tête du tick suivant
  (`RunRepository::aSolder`, 2026-10-22). Un appel parti à l'instant même de
  l'annulation, sa réserve déjà rendue, est payé par l'instance ; reprendre relance un run
  annulé ou arrêté, depuis son journal. Depuis P0-1, le suivi porte
  `configuration_empreinte` (l'empreinte de sa configuration, §8.9 ; nulle
  pour un run d'avant elle), et rien d'autre de ses blocs : la page
  l'interroge sans cesse.
- **Les résultats** (`Twin9\Resultats`, `GET /api/twin9/runs/{id}/resultats`) :
  ses sorties, et pour chaque journée que sa fusion nomme (`journee`) sans
  qu'il en ait écrit la carte, la carte que la mémoire garde (`journees/<jour>`,
  sous `test/` en mode essai), sans le texte de la journée. Chaque texte passe
  le filtre de fuite (ADR-010 §2) contre tous les jeux de gabarits des runs
  de sa carte, variables vides, et les préambules et fiches des référentiels
  que leur moteur a lus (T16, §8.8) : les journées de la mémoire ont été
  jugées par ces runs-là. Les sorties rangées restent celles du moteur.
  Depuis T17 (§10), la réponse porte aussi `referentiel`, celui avec lequel
  se lit sa carte : les pôles et les compétences que son moteur a lus,
  `{id, version, label, poles: [{num, nom, couleur}], competences: [{code,
  nom, pole}]}`, jamais une fiche, un préambule ni une description ; nul pour
  un run d'avant T16. Depuis P0-1, `run` porte `configuration` et
  `execution` (§8.9), nuls pour un run d'avant elles ; un cartographe lié
  les lit sans prix, coût, plafond ni clé. Depuis S3-3 (§7.4), la réponse
  porte aussi `traces_conservees` : un objet par journée dont la carte du
  jour (du run ou de la mémoire) porte le bloc `stigmergie` du greffier,
  `true` si son analyse (`stigmergie.run`) est au journal de la journée dans
  la mémoire de la carte (`stigmergie/<jour>`, sous `test/` en mode essai),
  `false` sinon ; `{}` sans bloc. Une journée en panne n'y dépose rien : sa
  carte garde le bloc, la réponse le dit non conservé, même après la fin du
  run, quand son journal d'appels est effacé. Elle est lue à chaque fois
  contre la mémoire du moment : un run suivant sur un texte modifié (qui
  remet le journal à zéro), ou dix-sept analyses plus tard (le journal ne
  garde que les dernières), un ancien run se lit non conservé, sans panne ;
  la réponse ne dit pas la cause, l'interface non plus.
- **Le document `twin9-run`** que la page remet à l'interface de cartographie
  (`twin9RunFiles`, `web/src/lib/interface-handoff.js` ; schéma
  `schemas/twin9-run.schema.json` depuis P0-1, racine souple : `kind` et
  `run` imposés) : `kind: "twin9-run"`,
  `run` (`id`, `journal`, `mode`, `attestation`, dates ; depuis P0-1
  `configuration` et `execution`, §8.9), `referentiel` (celui
  du run depuis T17, §10 ; le publié avant), `carto_evolutive` (la fusion), `journees` (chaque carte du jour,
  par journée) et `memoire` (les journées reprises). L'interface en fait une
  journée par carte du jour, ses verdicts établis, renvoyés ou jugés, chacun
  avec son dossier (`twin9Dossier`, `web/src/lib/twin9/mapper.js` depuis T11) ; la
  délibération d'un verdict jugé se lit dans sa journée (`runScope:
  "journee"`), et les synthèses viennent de la fusion
  (`carto/core/importers/twin9-run.js`). Depuis T17, la page le remet pour
  un run de tout référentiel (§10) ; de T16 à T17, pour un run de RESPIRE
  seul. Depuis P0-1, l'interface ne garde de `run.configuration` et
  `run.execution` qu'une liste blanche (§8.9), et chaque journée dit ses
  modèles et son jeu de gabarits (`provenance.model`, `provenance.prompt`,
  `provenance.configurationRef`). Depuis S3-3, le document porte
  `traces_conservees` des résultats (nul quand ils ne le disent pas), et
  l'interface garde le bloc `stigmergie` de chaque carte du jour par liste
  blanche (§4, point 16). Depuis le sprint 4 (C3, C4 ; journal de la
  cartographie D-73) : deux cartes du jour de même `date` (une seconde
  entrée du même jour, que le moteur range sous `<date>_b`) font une
  journée — à code égal, le verdict au statut le plus fort (établi, renvoyé,
  non établi ; puis la confiance, puis la première carte) l'emporte avec son
  dossier et reçoit les traces de l'autre, sans doublon ; leurs traces de
  la stigmergie sont réunies, conservées si toutes le sont — et le rapport
  d'import le dit (`twin9-journee-dupliquee`, avertissement) ; une
  compétence « établie par faisceau (second ressort) » de la fusion entre
  en seconde lecture (§4, point 12), et aucune journée, carte du jour ou
  journée sans carte que donne la fusion, ne la porte. Dans la fusion
  (`twin9ToMergeDocument`), une attestation du second ressort
  (`etage: "faisceau"`) ne sert plus à dater un `jour_index` : son repli 0
  déplaçait la première journée, sa date « - » en ouvrait une.

### 8.5 Coûts, plafonds, relance, purge et export (T10)

- **Le coût d'un appel** est ce qu'il coûte à son auteur
  (`twin9_appels.cout_microusd`, `Twin9Config::coutMicrousd`) : l'usage que
  rend Anthropic, au prix de son modèle dans la grille de l'administrateur
  (`modeles`) — que le déclencheur du worker récrit chaque jour aux prix de la
  page d'Anthropic (`Twin9\TarifsAnthropic`, 2026-10-21, UC-ADM-05 A6) —, au
  palier des longs prompts au-delà de son seuil
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
  lot encore chez Anthropic, soldés quand le lot est relevé, annulé ou non (§8.3).
- **Un appel ne débite jamais plus que sa réserve** (ADR-012 §6) : un coût
  réel au-delà — un fournisseur qui facture plus de sortie que le pire cas
  n'en comptait, une grille qui a changé entre l'envoi et la réponse — est
  payé par l'instance, jamais par le crédit de l'auteur, ni par son budget :
  ce qu'un appel soldé engage (`RunCosts::impute`, que lisent le budget du
  run, ce que ses autres runs peuvent encore dépenser et la reprise) est son
  coût réel plafonné au pire cas qu'il tenait (`pire_cas_microusd`) avec la
  clé de l'instance — son coût réel avec la clé de l'auteur, qui le paie à
  son fournisseur. Les compteurs gardent les deux : `cout_microusd`, le coût
  réel, et `facture_microusd`, ce que le run a coûté à son auteur, que le
  suivi rend en `cout.depense_microusd` (2026-10-22 ; un run fini avant,
  son coût réel). Le journal garde le
  coût réel (`cout_microusd`) ; l'excédent est compté par tranche
  (`depassements`, compteur `twin9Depassements` du worker) et journalisé
  (`[twin9-couts] run <id>, <clé de prix> : …`, le modèle et les montants
  seulement). Le modèle d'un autre fournisseur est alors **marqué « pire cas
  insuffisant »** (réglage `twin9_pire_cas_insuffisant`, à part de
  `twin9_config` : le worker l'écrit, une sauvegarde de l'administrateur ne
  l'écrase pas) avec les plafonds de son entrée de grille, le plus grand
  excédent, ses appels et depuis quand ; `GET /api/twin9/admin/config` le
  rend (`pire_cas_insuffisants`, qu'aucun `PUT` ne prend), la page
  d'administration le signale sur la ligne du modèle, et le lancement (comme
  la reprise) refuse ce modèle en `422` tant que ses plafonds
  (`plafond_sortie`, `plafond_reflexion`) n'ont pas changé : corrigés, la
  marque ne tient plus (2026-10-22). Un modèle d'Anthropic n'est jamais
  marqué. Depuis la voie mixte, les soldes du grand-livre
  (réconciliation, remboursement) sont rangés, comme les réserves, sous la
  clé de prix de chaque appel (`fournisseur:modèle` hors d'Anthropic). Pour Anthropic, le pire cas majore toujours le coût réel au
  prix de l'envoi : rien ne change.
- **Les autres fournisseurs** (ADR-012 §6, P1-5) ont leurs prix dans la même
  grille, sous la clé `fournisseur:modèle` (`Fournisseurs::clePrix`),
  saisis par l'administrateur, jamais par le relevé quotidien des prix
  d'Anthropic (`TarifsAnthropic::appliquer` les laisse tels quels, ni changés
  ni « absents »), jamais servis à la cartographie ouverte (`publicView`,
  `/twin6/appel` refuse un modèle à `:`). Une entrée tierce porte, en plus de
  `prix_usd_mtok` (et d'un `palier_long` facultatif) :
  `plafond_sortie` (entier > 0 ; 32 768 au plus chez Google, plafond d'une
  requête non streamée), `plafond_reflexion` (entier ≥ 0 ; > 0 chez xAI, dont
  le raisonnement ne se coupe pas et sort du plafond de sortie),
  `duree_max_s` (1 à 45 secondes) et, chez OpenAI et Google seulement,
  `reflexion_param`, le réglage de raisonnement le plus bas que le modèle
  admet (`reasoning_effort` : `none`, `minimal`, `low`, `medium`, `high`,
  `xhigh`, `max` ; `thinkingLevel` : `MINIMAL`, `LOW`, `MEDIUM`, `HIGH`),
  envoyé avec chaque appel du modèle ; absent, le défaut du modèle.
  `Twin9Config` refuse ces quatre champs sur un modèle d'Anthropic, une clé
  dont le préfixe n'est pas un autre fournisseur, un modèle hors du motif de
  son fournisseur. Le pire cas d'un appel tiers : les octets du prompt plus
  le surcoût d'entrée du fournisseur (`surcout_entree`, 64 jetons) en
  entrée, `budget_sortie + plafond_reflexion` en sortie, jamais à moitié
  prix ; sans entrée de grille, pas de prix. Le budget part dans le champ de
  plafond de chaque fournisseur (`max_completion_tokens` chez OpenAI et xAI,
  `max_tokens` chez Mistral AI et OpenRouter, `maxOutputTokens` chez
  Google) ; le coût réel compte en sortie ce que le fournisseur facture
  comme tel : la réflexion comprise (les jetons de raisonnement de xAI, hors
  de ses jetons de complétion ; les pensées de Gemini). La réserve est
  débitée sous la clé de prix du modèle (`model` du grand-livre).
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
  `twin9_runs.actif_s`), et, depuis P0-2 (§8), `tronques`, au total et dans
  `par_etape` : les pannes d'une sortie tronquée. Depuis la voie mixte
  (P1-5), chaque arrêt se lit dans la table de son fournisseur, et ils
  gagnent `coupures` (les coupures par la fin d'une tranche) et
  `par_fournisseur` (`{appels, pannes, tronques, coupures, cout_microusd}`
  par fournisseur).
- **L'aperçu** (`POST /api/twin9/runs/apercu`, `{profil, portfolio,
  referentiel?}`, ce que demande un lancement, l'accord excepté ; rien n'est
  gardé) rend
  `{journal, mode, voie, cle, fournisseurs, journees: {total, nouvelles, changees},
  estimation: {cout_usd, min_usd, max_usd, reserve_usd, duree_s,
  evaluations | reference, poles}, admission: {journees, total, limite,
  instruites, en_attente, changees_en_attente, autres_usd, refus},
  plafonds: {budget_usd, duree_minutes}, credit_usd, referentiel: {id,
  version, label}, jury_retire, memoire}` ; `memoire` (sprint 4, T0) : les
  identifiants des journées que la mémoire de sa carte garde au-delà de
  celles que le run prend (la carte est additive : sa fusion les lit), que
  la page de lancement croise avec les journées que le moteur ne lit plus
  dans le texte envoyé ; `referentiel` (sprint 5, lot C) est celui
  que le run lirait, du profil ou choisi (§8.4), sa version figée ;
  `jury_retire`, la liste des réglages du jury que ce choix vide
  (`specialistes`, `par_competence`), vide sinon. L'estimation et
  l'admission sont au §8.7 (T8). À défaut d'évaluation, la référence est le
  vrai run de PLANT-01 de T2, en mode essai, 0,1344 $ et 94 s, fois les
  pôles du référentiel pour un run complet, à moitié prix quand tous ses
  appels partent par lots, la marge avec la clé de l'instance ; dès qu'une
  route part par lots, la durée est nulle (celle d'Anthropic). Le pire cas
  d'un appel se compte par combinaison, au prix de son fournisseur et par
  sa route (`RunCosts::pireCasDe`). `fournisseurs` (P1-5) : ceux
  qu'atteignent ses appels, `[{id, libelle, rgpd, voie}]` (`voie` : `lots`,
  `directe` ou `mixte`), que l'accord nomme. `credit_usd`, avec la clé de
  l'instance.
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
  `reponse`, `panne`, `stop_reason` — assaini, §8 —, jetons, `cout_microusd`,
  `duree_ms`, dates ; jamais un prompt ni une clé), `sorties` (par chemin) et
  `evaluation` (son évaluation, §8.7 ; nulle tant qu'il n'est pas fini), et
  depuis P0-1 `configuration` et `execution` (§8.9), chacune **omise** quand
  le run n'en a pas ; chaque
  carte avec `journal`, `referentiel`, `gabarits`, `created_at` et `memoire`
  (le texte JSON de chaque clé). Ce que le moteur et les modèles ont écrit
  passe le filtre de fuite contre tous les jeux de gabarits des runs du
  compte et les préambules et fiches des référentiels que leur moteur a lus
  (T16). L'archive de compte l'embarque (`analysesTwin9`, §4, point 13).

### 8.6 Les jeux de gabarits (T14)

- **Le jeu v9.8** est celui qu'écrit l'import (`POST /api/admin/twin9/import`,
  `twin9_protocole`, `twin9_protocole_versions`) : l'atelier le lit, ne
  l'écrit jamais (`403`). Son identifiant est « v9.8 ». Depuis T16, un
  import complet — tous les gabarits que nomme le contrat des variables — le
  remplace : il y écrit ceux de `php/protocole` de `TWIN_V9_DIR`, et un
  gabarit qu'il ne porte pas en sort, son dernier contenu archivé parmi ses
  versions (les fichiers de pôle `tagger/P1` à `P7`, dont la base donne
  désormais les fiches, §8.8). Un import partiel ne fait qu'écrire les siens
  et n'ôte rien : un jeu d'avant T16 garde ses fichiers de pôle, qui le
  disent. Les noms s'y comparent comme dans la table, sans la casse ; le
  contrat se lit avant toute écriture. L'import répond `{imported, inchanges,
  retires}` — `inchanges`, depuis T18 : les gabarits reçus déjà en base à
  l'octet.
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
  reçoit aucune. Le contrat reprend celui du portage JavaScript
  (`engine/src/twin9/protocole-contrat.json`, retiré au T11), complété de `MA_POSITION_R1`
  (relance, second tour) et `LISTE_61` (Arpenteur), que le moteur fournit et
  que les gabarits v9.8 emploient, et, depuis T16, des variables du
  référentiel (§8.8) : `REFERENTIEL` et `FORMAT_CODE` (lecture d'un pôle),
  `NB_COMPETENCES` et `FORMAT_CODE` (relectures de la fusion),
  `NB_COMPETENCES`, `FORMAT_CODE` et `LISTE_COMPETENCES` (Arpenteur) ; un
  test le vérifie sur les gabarits de `TWIN_V9_DIR/php/protocole`
  (`JeuxGabaritsTest`).
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
  (ajouté par un import après la copie). Depuis T16, le référentiel vient de
  la base (§8.8) : les fichiers de pôle qu'une copie faite avant garde encore
  ne sont plus lus, et disent seulement qu'elle précède T16 ; un moteur
  d'avant T16 est refusé (§8.8). Une erreur imprévue du moteur à la lecture
  d'un lancement répond `422` « Le moteur ne lit pas ce lancement (jeu de
  gabarits « … ») », le journal du serveur n'en gardant que la classe.
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
  (`voie` — depuis la voie mixte, celle par laquelle le run est passé :
  `directe`, `lots` ou `mixte`, `CallSettings::voieEffective()` —, `cle`,
  `marge` — le facteur que ses coûts comprennent, 1 avec la clé
  personnelle —, `part_anthropique` — depuis la voie mixte, `{journee,
  fusion}`, la part d'Anthropic dans le coût de ses journées et de sa
  fusion, nulle sans coût —, et ce que les prévisions comparent : `mode`,
  `referentiel`, `version_referentiel` et `empreinte_referentiel` (T16 :
  celle du référentiel que lit le moteur, §8.8 ; vide pour un run d'avant,
  qui lisait les fiches de son jeu), `gabarits` et
  `empreinte_gabarits` — l'empreinte du jeu, celle de l'attestation : un jeu
  modifié est un autre jeu —, les modèles et la performance — `etages`,
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
  la marge du run prévu (sa marge retirée, celle du run prévu appliquée ;
  par lots, seule la part d'Anthropic de chaque phase change de prix,
  `Evaluations::facteur` : d'une évaluation par lots ou mixte vers un run
  direct, `1 + a` ; d'une évaluation directe vers un run par lots,
  `1 − a/2` ; une ligne d'avant la voie mixte, tout Anthropic, `a = 1` :
  le double, ou la moitié). Une journée instruite coûte une part fixe — les
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
  d'un appel : le plus grand observé, et au moins ce que les réglages
  d'appel du run réservent sur un prompt deux fois plus grand que le plus
  grand gabarit du jeu ou le plus grand pôle que lisent ses lecteurs (T16 :
  son préambule et ses fiches, §8.8), avec la plus grande journée à
  instruire (la carte, pour la fusion), chaque combinaison au prix de son
  fournisseur et par sa route. Des runs passés par appels directs seuls
  (voie `directe`), les secondes actives par journée instruite, fusion
  comprise, en moyenne. Sans
  évaluation, la référence
  (§8.5) : par journée instruite, une journée pour la fusion, et une journée
  pour le pire cas d'un appel de chacune, au moins ce que disent ses
  réglages. L'estimation dit sa source : les évaluations quand elles disent
  tout ce qu'il lui faut (la fusion, et les journées s'il y en a à
  instruire), sinon la référence.
- **La carte que relit la fusion** : les journées que le run prend, et
  celles que la mémoire garde au-delà — les journées du portfolio qu'il ne
  prend pas, comptées à la taille de leur texte actuel, et celles de runs
  passés absentes du portfolio (`apercu()`, `memoire`), à la taille de leur
  texte gardé. Une journée changée au-delà de la coupe y reste dans sa
  version déjà évaluée, jusqu'à la prochaine analyse ; sa taille actuelle
  approche celle-ci.
- **L'admission** (`Lancement::prevoir`) : les premières journées du
  portfolio, dans l'ordre, tant que ce qu'elles demandent tient dans la plus
  basse des limites (`admission.limite` : `credit`, `budget`, ou `null`
  sans limite) — le crédit de la personne avec la clé de l'instance, moins
  ce que ses autres analyses en cours peuvent encore en dépenser
  (`autres_usd`, lus ensemble en une requête :
  `RunRepository::disponible`), et le budget du profil : leur coût au plus haut, la
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
  profil… »). Un lancement, ou une reprise, à la fois par personne
  (`GET_LOCK`, `RunRepository::sousVerrou`), pour que le suivant compte ce
  que le précédent a obtenu. L'attestation garde
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
  cas réservés, coûts réglés —, les autres runs de la même personne ne
  l'entament jamais : chaque appel le lit avec le crédit, en une requête
  (`RunRepository::disponible`), si bien qu'une réservation ou un règlement
  d'un autre run, qui déplace les deux d'autant, ne compte jamais deux fois.
  Retenu, un run s'arrête, `crédit insuffisant (engagé par vos autres
  analyses) : carte incomplète`. Repris, un run est admis de nouveau : son
  engagement ne dépasse plus ce qu'il a engagé et ce que les autres runs en
  cours laissent libre.
- **L'estimation** de l'aperçu est celle du run tel qu'il partirait, ses
  journées admises et leur fusion (refusé, ce que dit le refus) :
  `min_usd`, `cout_usd` (la moyenne), `max_usd`, `reserve_usd`, en dollars
  au micro-dollar, que la page arrondit au cent ; `duree_s` (nulle par
  lots) ; et sa source, `evaluations` (leur nombre) ou `reference` et
  `poles`. La page dit les journées admises ou le refus, qu'elle ne laisse
  pas lancer.

### 8.8 Le référentiel du run (T16)

Le moteur lit le référentiel du run, et non plus celui de la v9.8 (`Twin_v9`,
T16, plan validé par Christian le 2026-10-20).

- **Le bloc** (`Twin9\ReferentielMoteur::bloc`), tiré de la base au lancement
  et à l'aperçu, à la version que fige la copie du profil (§8.4) — publiée,
  ou brouillon de son auteur pour un run d'essai (§9) —, entre dans les
  réglages du moteur (`moteur.referentiel`, §8.1) : `{id, version, label,
  motif, poles: [{num, nom, entete, competences: [{code, nom, fiche}]}]}`.
  `motif` est celui du premier niveau du document (§9) ; les pôles viennent
  dans l'ordre de leurs numéros, les compétences d'un pôle dans l'ordre
  naturel de leurs codes (`A2` avant `A10`), celui où le moteur les range.
  - **RESPIRE** : préambules et fiches sont ceux que garde la base
    (`FicheGenerator::corpus()`, la source unique de juillet 2026 :
    `referentiel_poles.header` et la fiche de la dernière version publiée de
    chaque compétence), les octets des fichiers de pôle de la v9.8 ; le vrai
    moteur les lit comme il lit ceux-ci (`ReferentielMoteurTest`). Sans eux,
    le lancement et l'aperçu répondent `503` « Les fiches du référentiel
    RESPIRE ne sont pas dans la base de cette instance : l’analyse
    approfondie ne peut partir (php scripts/seed-competences.php les y
    verse) ». Depuis le 2026-10-20 (§11), une version de RESPIRE peut avoir
    une autre structure : la base fournit la fiche d'un code qu'elle connaît
    dans le même pôle, et le préambule d'un pôle dont elle connaît exactement
    les mêmes codes ; le reste s'écrit depuis le document, comme pour un autre
    référentiel (un code que la base ne connaît pas ne répond plus `422`).
    RESPIRE v7 se lit comme avant, à l'octet.
  - **Un autre référentiel** : préambule et fiches s'écrivent depuis son
    document — le préambule, « # Pôle N — nom », puis sa description ; la
    fiche, « ## CODE — nom », sa description, puis ses éléments plus fins,
    chacun sous un titre d'un niveau plus bas (jusqu'à `######`), avec sa
    description.
- **Le moteur** (`Twin9\Referentiel::depuisBloc`) en tire ce que la v9.8
  écrivait de RESPIRE : le nom d'un pôle (le titre de son préambule, « NOM :
  sous-titre » lu « NOM — sous-titre » ; à défaut, le nom du bloc) et sa clé
  (le premier mot de ce nom en capitales, accents ôtés, sinon `P` et son
  numéro ; pour RESPIRE, celle de la v9.8, quel que soit son préambule),
  celle du profil ipsatif et du jury ; le nombre de compétences
  (« 61 »), la forme de leurs codes (`X.YY` ; `XY` pour `A1`), le nom du
  référentiel (« RESPIRE » pour `respire`, quel que soit son libellé ; pour
  un autre, son libellé sans sa version : « Humanome V18 » donne
  « Humanome »), l'ordre des codes. Il refuse un référentiel qu'il ne lit
  pas — pôles qui ne se numérotent pas de 1 à N, pôle sans compétence, code
  absent, fait de chiffres seulement, hors du motif ou en double, nom ou
  fiche absent, motif illisible — : le lancement et l'aperçu répondent `422`
  « Le référentiel « id » ne se lit pas : … », le pôle ou le code fautif
  nommé, jamais une fiche ; aucun run n'est écrit.
- **Un moteur d'avant T16** ignorerait le référentiel et lirait RESPIRE dans
  le jeu, quel que soit le profil : sans `Twin9\ReferentielInvalide`, sa
  marque, le lancement et l'aperçu répondent `503` « L’analyse approfondie
  n’est pas disponible sur cette instance : son moteur précède T16 et ne lit
  pas le référentiel du run (Twin_v9 à mettre à jour) », et la page des
  analyses n'en propose pas (`GET /api/twin9/runs` : `disponible` faux) ;
  les runs lancés avant continuent d'avancer.
- **Un jeu d'avant T16** — le jeu v9.8 pas encore réimporté, ou une copie
  faite avant — écrit RESPIRE en toutes lettres dans ses gabarits (« 61 »,
  « X.YY », « référentiel RESPIRE ») ; ses fichiers de pôle (`tagger/P1`…)
  le disent. Il sert RESPIRE dans la structure que décrivent ses fichiers de
  pôle — mêmes pôles, mêmes codes (« ## CODE — » de `tagger/PN`) ; une
  version de RESPIRE d'une autre structure (§11) est refusée, `422` « … ses
  gabarits écrivent RESPIRE en toutes lettres, tel que le décrivent ses
  fiches (7 pôles, 61 compétences). Pour une autre structure de RESPIRE, il
  faut … » ; pour un autre référentiel, le lancement et l'aperçu répondent `422` « Le
  jeu de gabarits « … » précède T16 : ses gabarits écrivent RESPIRE en
  toutes lettres. Pour un autre référentiel, il faut réimporter le jeu
  v9.8 » (pour une copie, « refaire une copie du jeu v9.8 », ou, si le jeu
  v9.8 lui-même précède T16, « réimporter le jeu v9.8, puis en refaire une
  copie »).
- **Le jury** garde ses sièges sur tout référentiel (décision de Christian du
  2026-10-20) : un pôle de RESPIRE, reconnu à sa clé, assoit le spécialiste
  et la paire de la v9.8 ; un autre, le « Spécialiste du pôle », qui lit son
  domaine, et la paire (Spécialiste du pôle, Historien) — cinq sièges en
  `socle4+1`, quatre en `socle2+2`. `jury.specialistes` du profil l'emporte,
  sauf quand le lancement choisit un autre référentiel que celui du profil :
  il est alors vidé dans la copie, comme `jury.par_competence` (§8.4, garde
  du jury).
  Sa lentille n'est pas dans la banque dont les journées gardent l'empreinte
  (`Tribunal::infosPersonas`) : un référentiel dont un pôle n'est pas de
  RESPIRE la garde avec l'empreinte des réglages de ses journées
  (`|specialiste:…`, même quand le profil assoit un autre spécialiste), pour
  qu'une journée jugée sous une autre soit relue ; celles de RESPIRE n'en
  ont pas.
- **Les gabarits** : le jeu v9.8 est celui de `php/protocole` (§8.6), où les
  mots de RESPIRE sont devenus des variables — `{$NB_COMPETENCES}` (« 61 »),
  `{$FORMAT_CODE}` (« X.YY »), `{$REFERENTIEL}` (« RESPIRE »),
  `{$LISTE_COMPETENCES}` (`{$LISTE_61}`) —, sans les fichiers de pôle. Pour
  RESPIRE, ils rendent le texte de la v9.8 : un run de RESPIRE donné par ce
  bloc rejoue les dix-sept scénarios de l'oracle octet pour octet (`Twin_v9`,
  `OracleTest`). Jusqu'à T11, l'appel du moteur du navigateur (`POST
  /api/twin9/appel`) les recevait aux valeurs de RESPIRE ; il est parti avec
  ce moteur.
- **Les empreintes** : celle du référentiel (`ReferentielMoteur::empreinte`,
  16 caractères hexadécimaux du SHA-256 de son JSON canonique, la même qu'il
  soit relu en tableaux ou en objets) entre dans l'empreinte des réglages
  (§8.2), l'attestation (`referentiel.empreinte`, §8.4) et ce que comparent
  les prévisions (`empreinte_referentiel`, §8.7).
- **Le filtre de fuite** indexe ses préambules et ses fiches, qui ne sont plus
  dans le jeu, pour les résultats (§8.4) comme pour l'export (§8.5) ; pour
  les résultats, ceux de chaque run de la carte, dont la mémoire donne des
  journées jugées sous d'autres fiches.
- **La prévision** : le pire cas d'un appel compte le plus grand pôle que lit
  un lecteur, son préambule et ses fiches joints comme le moteur les joint
  (§8.7).
- **La cartographie** ne lit encore que RESPIRE (T17) : la page d'un run sur
  un autre référentiel ne propose pas « Ouvrir dans la cartographie », et le
  dit ; ses résultats et l'archive du compte le gardent.
- **Limites.**
  - Les fiches de RESPIRE sont celles que la base publie au lancement, non
    celles de l'instantané de la version figée
    (`referentiel_snapshot_competences`) : une compétence publiée depuis
    entre dans le run. L'empreinte du référentiel dit lesquelles il a lues.
  - La mémoire d'une carte est rangée par référentiel, non par version
    (`twin9_cartes.referentiel`) : une journée que la carte garde au-delà de
    celles du run, lue sous une version ancienne, entre telle quelle dans la
    fusion, même si un de ses codes a quitté la version nouvelle (à reprendre
    avec T17).
  - L'import de T16 change l'empreinte des réglages (jeu sans fichiers de
    pôle, gabarits en variables, référentiel) : chaque journée que garde la
    mémoire d'une carte sera relue une fois.
  - Sans évaluation, la référence (§8.5) reste le run de PLANT-01 de T2, fois
    les pôles : elle ignore la taille des fiches d'un autre référentiel.
  - Le moteur ne refuse un référentiel qu'au lancement : sa publication (§9)
    ne vérifie pas qu'il le lit. Le schéma 2.0.0 admet ainsi un pôle sans
    compétence, un nom de pôle ou de compétence fait d'espaces : publié, voté,
    un tel référentiel est refusé à chaque aperçu et à chaque lancement. Les
    codes faits de chiffres seulement (« 11 »), eux, sont refusés à
    l'enregistrement depuis la revue de S5 (§9, « Les codes ») ; une version
    publiée avant reste refusée au lancement.
  - La lentille du « Spécialiste du pôle » est écrite dans le code du moteur :
    son empreinte suit son texte, pas une version déclarée comme celle de la
    banque (`PERSONAS_VERSION`).

### 8.9 Configuration et exécution d'un run (P0-1)

Deux blocs, à côté de l'attestation (§8.4), qu'ils ne remplacent pas
(migration `031_twin9_configuration.sql`, schéma `schemas/twin9-run.schema.json`,
`$defs.configuration` et `$defs.execution`, stricts : toute clé inconnue est
refusée ; fixture inventée `schemas/fixtures/twin9-configuration-exemple.json`).

- **La configuration** (`Twin9\RunConfiguration`, `twin9_runs.configuration`,
  JSON compressé comme `reglages` : octets et `1.0` gardés) est ce avec quoi
  le run a été lancé. Elle est écrite **une fois**, au lancement, dans le
  verrou d'admission, après que l'admission a fixé les journées (`jours` est
  celui que lit le moteur) ; une reprise ne la change pas. Construite champ
  par champ (liste blanche), elle porte :
  - `schema` (`twin9-configuration/1`), `empreinte`, `sel` (16 octets tirés
    au hasard au lancement, en hexadécimal), `lance_at` (l'horloge du run) ;
  - `moteur` : `commit`, `protocole` (`Journee::VERSION_PROTOCOLE`),
    `personas` (`{version, empreinte}` de la banque des jurés), `scan`
    (`Arpenteur::VERSION_SCAN`) — lus par l'appelant (`Lancement`), chacun
    sous garde, nuls quand le moteur ne les donne pas (le moteur factice des
    tests) ;
  - `profil` : `id`, `nom`, `mode`, `empreinte_reglages`
    (`CallSettings::empreinte`, §8.2, celle de la plateforme du lancement),
    `signature_evaluations` (`Evaluations::signature`, §8.7) ;
  - `execution_prevue` : `voie_anthropic` (la voie du profil), `cle`
    (`instance` ou `personnelle`, jamais la clé), `parallelisme`,
    `plafonds {budget_usd, duree_minutes}`, `jours`, `rescan`, `memoire` ;
  - `fournisseurs` : chaque fournisseur qu'atteignent ses appels
    (`CallSettings::combinaisons()` : ses étapes et ses lecteurs, jamais
    l'étage des lecteurs seul ni une étape que le profil ne connaît pas),
    `{libelle, rgpd, voie}` (`mixte` s'il a les deux voies) ;
  - `accord` (depuis la voie mixte, P1-5) : `{fournisseurs}`, ceux que
    nommait l'accord de son propriétaire, triés ; absent d'un run lancé
    avant ;
  - `appels` : `CallSettings::resume()` — `etages`, `etapes`,
    `second_ressort`, `lecteurs` (chacune un **objet**, quelles que soient
    ses clés : un lecteur nommé « 0 », que le motif du profil admet, n'en
    fait pas une liste), `defaut` —, chaque réglage
    `{fournisseur, voie, modele, budget_sortie, effort, reflexion}` tel que
    l'appel part (`budget_sortie` est le `max_tokens` envoyé) ;
  - `college` (`nom`, `famille`, `passes`, `poids`), `backends`
    (`tribunal`, `rapide` : `kind`, `model`, `model_mini`), `algorithme`
    (les paramètres de `MoteurReglages::ALGORITHME`, et `stigmergie` : la
    stigmergie du greffier telle que le moteur la lit, `config.stigmergie`
    quand elle est activée, `{"enabled": false}` sinon, §7.4 ; absente du
    bloc d'un run lancé avant elle, qui reste valide) ;
  - `referentiel` (`id`, `version`, `label`, `empreinte`) et `gabarits`
    (`jeu`, `versions`, `empreinte`), jamais le bloc du référentiel (fiches,
    préambules) ni un gabarit ;
  - `prix` : `{base: "facture", unite: "USD/MTok", remise_lots: 0.5,
    releve: {jour, statut, source} | null, grille}`, la grille ne gardant
    que les modèles qu'emploient ses appels, **tels que facturés** (prix
    catalogue × marge avec la clé de l'instance, prix catalogue avec la clé
    de l'utilisateur), palier des longs prompts compris. Jamais la marge ni
    le prix catalogue en tant que tels ; jamais le message d'erreur d'un
    relevé.

  Son `empreinte` vaut `substr(sha256(json(canonique(bloc sans empreinte ni
  lance_at))), 0, 16)`, clés triées à toute profondeur, `1.0` gardé flottant,
  son `sel` compris : relue depuis ce que garde le run, elle est la même. Le
  suivi n'en sert que cette empreinte (`configuration_empreinte`, §8.4). Le
  **sel** n'est lu que du propriétaire : un cartographe lié lit la même
  empreinte, mais sans ce que le bloc lui cache (`prix`, la clé, les
  plafonds), qui tient en peu de valeurs (deux clés, une marge au centième,
  des montants ronds, un relevé daté de la veille) ; sans le sel, il les
  retrouverait par essais, en recalculant l'empreinte de chaque candidat.
- **L'exécution** (`Twin9\RunExecution`) dit comment le run s'est déroulé :
  `schema` (`twin9-execution/1`), `source` (`fige` : figée par `terminer()`,
  avant que le journal ne parte ; `journal` : calculée à la demande depuis le
  journal, pour un run en cours, arrêté ou annulé), `partiel` (vrai pour un
  run lancé avant la migration 031 : sans configuration, ses passes, son
  temps de moteur et son premier commit sont incomplets), `statut`,
  `debut_at`, `fin_at`, `duree_active_s`, `passes` et `moteur_ms` (les passes
  du moteur et leur temps, `twin9_runs.passes` et `moteur_ms`, comptés
  chacune dès qu'elle est jouée, la passe finale avant que `terminer()` ne
  les fige : un tick qui meurt — tué, à court de temps ou de mémoire, ou
  une exception sortie de la tranche — ne perd que la passe qu'il jouait ;
  ce sont donc des minimums, d'une passe au plus par tick mort, sans que
  `partiel` le dise), `appels {total, repondus, pannes,
  tronques, refus, tentatives}`, `jetons {entree, sortie}`, `cout_microusd`,
  `lots`, puis `par_voie`, `par_fournisseur`, `par_modele` (chacun
  `{appels, pannes, tronques, coupures, jetons_entree, jetons_sortie,
  cout_microusd}` ; `coupures`, les coupures par la fin d'une tranche,
  depuis la voie mixte, absentes d'un bloc figé avant elle ; `par_modele`
  sous la clé de prix), `servis` (modèles servis par modèle demandé, sous sa
  clé de prix), `arrets` (les classes d'arrêt
  du §8 : `end`, `max_tokens`, `context_window`, `refusal`, `other`),
  `moteur {commit_debut, commit_fin}` (`commit_fin` nul tant qu'il n'est pas
  fini) et `reprises[] {at, budget_usd}` (chaque reprise ajoute la sienne,
  dans la transaction de la reprise ; avant la fin, la colonne
  `twin9_runs.execution` ne garde qu'elles). Ses totaux sont ceux de
  `compteurs` (§8.5). La voie se lit à `custom_id` (qu'un appel d'un lot
  garde, `lot_id` repassant à NULL avec son lot) ; le fournisseur, à
  `twin9_appels.fournisseur` (`anthropic` pour une ligne d'avant la
  migration 032), et l'arrêt dans la table de ce fournisseur. Toute table par nom est un
  **objet**, vide ou non (`{}`, jamais `[]`). Figer ne retient jamais un
  run : en cas d'échec (sous SAVEPOINT), le run finit, son exécution reste
  nulle, et seule la classe de l'exception est journalisée. Un run fini
  n'a d'exécution que si sa colonne porte un bloc figé (`schema`
  `twin9-execution/1`, `source: "fige"`, `RunRepository::figee`) : un run
  qu'une release précédente a fini, après un retour arrière (ADR-008), y
  laisse les reprises qu'avait écrites celle-ci, et son exécution est nulle
  — jamais servie, ni exportée, comme un bloc.
- **Qui les lit.** Le propriétaire, entières, dans `resultats.run` (§8.4)
  et dans l'export (§8.5), où chacune est omise quand elle est nulle. Un
  cartographe lié (visibilité `cartographe`) les lit sans ce que paie le
  propriétaire ni comment : ni `prix`, ni `execution_prevue.plafonds`, ni
  `execution_prevue.cle`, ni aucun `cout_microusd`, ni le `budget_usd` des
  reprises ; ni le `sel` de l'empreinte. L'administrateur n'en voit rien
  (§8.4 : des compteurs).
- **La page du run** (`web/src/views/twin9/ConfigurationDuRun.jsx`), celle
  de son seul propriétaire (le suivi répond 404 à tout autre) : le suivi
  n'en portant que l'empreinte, « Configuration », présente pour **tout**
  run, lit les deux blocs dans les résultats quand on l'ouvre, de nouveau à
  chaque ouverture tant que le run est en cours (ses comptes avancent ;
  jamais au rythme du suivi : les résultats portent les sorties), et quand
  son statut change ; elle dit chaque réglage de `appels` (rôle,
  fournisseur et son étiquette RGPD, voie, modèle, budget de sortie), le jeu
  de gabarits, le référentiel, la clé, puis l'exécution (appels, pannes,
  tronqués par fournisseur et par voie, passes, coût), d'où viennent ses
  comptes (figés ; lus dans le journal d'un run en cours, ou arrêté), et le
  conseil des sorties tronquées (§8). Un run lancé avant P0-1 n'a pas de
  configuration : elle le dit, et montre son exécution, partielle (un run
  en cours au déploiement de la migration 031). Un cartographe lié lit les
  blocs filtrés dans les résultats (l'API) ; la vue, chaque ligne tenant à
  la présence de son champ (sans `cle` ni `cout_microusd`, elle manque),
  s'y prête si on la réutilise, mais aucune page ne la lui montre.
- **Le jeu de cartographie** (`importTwin9Run`, document `twin9-run`, §8.4)
  se partage et s'archive : il ne garde des deux blocs qu'une **liste
  blanche**, champ par champ et en valeurs simples, sous la clé
  `<run>|configuration` de `runDetails` (`kind: "twin9-run-meta"`, jamais
  comptée comme une délibération) : `configuration {empreinte,
  fournisseurs {libelle, rgpd, voie}, appels (les six champs de chaque
  réglage), referentiel {id, version, label, empreinte}, gabarits {jeu}}` et
  `execution {statut, source, partiel, passes, appels {total, repondus,
  pannes, tronques, refus}, par_fournisseur, par_voie {appels, pannes,
  tronques}}`. Jamais `prix`, `execution_prevue` (clé, plafonds), le `sel`,
  un coût, des jetons, les reprises, l'admission de l'attestation ni
  l'empreinte du jeu de gabarits. Chaque journée du run porte `provenance.model`
  (« profond: …, rapide: …, lecteurs: … », le fournisseur devant un modèle
  tiers), `provenance.prompt` (« gabarits <jeu> »), `configurationRef` et
  `configuration {empreinte, fournisseurs, voies}` ; `variantId` et `digest`
  n'en dépendent pas. Sans configuration, l'import est celui d'avant P0-1.
- **Écart signalé, non corrigé ici** : `attestation.admission` porte déjà
  `reserve_microusd` et `engagement_microusd`, que lit aussi un cartographe
  lié.

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
  Jamais faits de chiffres seulement (« 11 ») : le moteur Twin9 refuse une
  compétence ainsi codée, et tout niveau peut tenir lieu de compétence ; le
  schéma l'admet, l'intégrité (`validateDocument`, `CHIFFRES_SEULS`) le
  refuse à tout niveau, à son pointeur, depuis la revue de S5 (2026-10-22),
  et la page Markdown de l'atelier à sa ligne. Un tel code d'une version
  enregistrée avant fait refuser ce qui la revalide (soumission, publication,
  fork).
- **Les éléments** (`elements` d'une compétence, et d'un élément) :
  `{code, nom, description?, elements?}` ; un élément d'un niveau que le
  référentiel ne déclare pas est refusé. Une description est du texte libre
  (Markdown) : les manifestations ou le faux positif d'une facette y vont.
- **L'empreinte** ne change pas de définition : pôles `{num, nom, couleur}`
  et compétences `{code, nom, pole}` ; niveaux, descriptions et éléments sont
  gardés dans le document, hors d'elle (`ContentHash::normalize` les range
  dans un ordre fixe, éléments compris, quoi qu'en fasse le JSON de MySQL).
- **RESPIRE n'a plus de structure imposée** (depuis le 2026-10-20, §11) :
  une clause du schéma (`allOf` : si `id` vaut `respire`) lui imposait 7
  pôles, 61 compétences au format `P.NN` et aucun niveau déclaré, sur tout
  chemin vers une de ses versions (fork et édition au grain document,
  publication, coupe de release, import initial). Elle est retirée (schéma
  2.1.0) : une version de RESPIRE peut compter six pôles, ou neuf, comme tout
  référentiel ; sans `niveaux`, ses codes suivent toujours le motif par
  défaut. La coupe de release depuis ses compétences (UC-EPI-03) garde la
  structure de sa dernière version publiée (§11). Il ne s'importe pas par
  l'atelier (`409`).
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
  (public) rend les référentiels publiés : `[{id, label, versions, source}]`,
  le libellé et la provenance (`source`, `null` si elle manque, S5) de la
  dernière version, les versions de la plus récente à la plus ancienne, les
  référentiels rangés par identifiant.
  `GET /api/referentiels/{id}/versions/{semver}` (public, lecture seule, S5)
  rend le document d'une version **publiée** de tout référentiel, RESPIRE
  compris, tel que la base le garde (`content`) ; un brouillon, une
  proposition, un identifiant ou une version inconnus → `404` « Unknown
  published version ». La colonne ignorant la casse et les espaces finaux, la
  route refuse aussi (`404`) un identifiant hors de la forme ci-dessus et
  toute autre graphie de l'identifiant ou de la version. Les lectures
  publiques de `/api/referentiel` restent celles de RESPIRE.
- **Le profil Twin9** (§7) : `referentiel.version` peut désigner un brouillon
  (ou une proposition au vote) si le propriétaire du profil en est l'auteur,
  qu'il est épistémiarque ou administrateur (`ProfilPolicy::AUTEURS`) et que
  le profil est en mode essai ; sinon `422` « Profil refusé —
  /referentiel/version : un brouillon ne sert qu’aux runs d’essai de son
  auteur ». `GET /api/twin9/configuration` rend, pour chaque référentiel,
  `{id, label, versions, brouillons}` : son libellé (celui de sa dernière
  version publiée, `ReferentielRepository::catalogue()` ; pour un
  référentiel qui n'a que des brouillons, celui du plus récent ; depuis le
  sprint 5, lot C, pour le menu « Référentiel » du lancement Twin9), ses
  versions publiées et ses propres brouillons, un référentiel jamais publié
  n'y figurant que pour son auteur.
- **Le lancement** (§8.4) : le moteur lit le référentiel de son run (T16,
  §8.8) ; un run ou son aperçu sur un autre référentiel, publié, part. Un
  brouillon sert le run d'essai de son auteur. Depuis le sprint 5, lot C, le
  lancement et l'aperçu peuvent choisir un autre référentiel que celui du
  profil (`referentiel: {id, version?}`), soumis aux mêmes règles. (De T15 à T16, le moteur
  lisait les fiches RESPIRE de son jeu, et un autre référentiel était refusé,
  `422`.)
- **Les annotations** (`POST /api/cartographies/{id}/annotations`) : une
  cartographie qui désigne une version de référentiel
  (`referentiel_version_id`) n'accepte que ses codes ; sans référentiel
  désigné, la forme de RESPIRE (`[1-7].NN`) jusqu'au 2026-10-20 — depuis,
  les codes de la version que lit sa relecture (§11).
- **L'Humanome V18** (S5, lot B) : le YAML que publie
  https://respire.school/referentiel se convertit en document de ce schéma
  sur le poste (`scripts/convertir-humanome.mjs`, `engine/src/referentiel-humanome.js`) :
  identifiant `humanome`, libellé « Humanome V18 », niveaux `capacité`
  `[A-E][1-4]` puis `facette` `[A-E][1-4]\.[1-9]`, les capacités pour
  compétences et leurs facettes pour éléments, des descriptions composées des
  rubriques du YAML, la couleur de la palette par rang, l'empreinte calculée
  comme ci-dessus. `scripts/amorcer-referentiel.php` le publie hors vote,
  idempotent sur le document entier hors `source`, la provenance
  (`importPublishedDocument` ne compare que l'empreinte), et refuse `respire` ;
  en production, `POST /api/admin/import-referentiel` applique les mêmes règles
  (`AmorcageReferentiel`) à tout autre identifiant que `respire`, RESPIRE
  gardant l'import du déploiement, idempotent sur l'empreinte. Le schéma ne
  change pas. Règles, procédure en production et écarts relevés dans la
  source : `docs/referentiel-humanome.md`.
- **Hors T15** : la page publique `#/referentiel` ne montrait que RESPIRE ;
  elle montre tout référentiel publié depuis S5, lot E (§10, UC-VIS-02).
  `ReferentielDiff` ignore niveaux et éléments. (La cartographie, qui ne
  lisait que RESPIRE et ses 7 pôles, lit le référentiel de chaque run depuis
  T17, §10 ; le moteur, depuis T16, §8.8.)

## 10. La cartographie de tout référentiel (T17)

Le chemin d'un run vers la cartographie n'admettait que les 7 pôles de RESPIRE
et ses codes `P.NN` (`docs/plan-twin9-php.md` de `Twin_v9`, lot 4c, dernière
tâche). Il admet tout référentiel de la plateforme (§9) : 5 pôles lettrés aux
capacités `A1` à `E4`, 9 pôles… Les changements de format, un par un :

| Où | Avant | Depuis T17 |
|---|---|---|
| `cartographie-jour`, `cartographie-merge` : `referentiel` | — | facultatif : l'identifiant du référentiel du document (schéma `referentiel`, `id`, en minuscules : `^[a-z0-9][a-z0-9._-]{0,63}$`) ; absent ou `respire`, RESPIRE |
| `cartographie-jour` : `poles`, `poleNum` | exactement 7 ; `"1"` à `"7"` | RESPIRE : de même ; un autre référentiel : 1 pôle au moins, numérotés de `"1"` à `"N"` (`^[1-9][0-9]*$`) |
| `cartographie-merge` : `domains`, clés de `profilIpsatif`, `pole_num` | exactement 7 ; `1` à `7` | RESPIRE : de même ; un autre : 1 au moins ; `1` à N |
| codes (`codeCompetence`) des deux documents | `^[1-7]\.\d{2}$` | RESPIRE : de même (`codeRespire` : verdicts, kairos, domaines, profil) ; un autre : le code d'un référentiel (schéma `referentiel`, `$defs/code` : `^[A-Za-z0-9][A-Za-z0-9._-]{0,7}$`) |
| `competence` : `identite.code` | `^\d\.\d{2}$` | le code d'un référentiel, comme ci-dessus |
| `cartographie-merge` : `color` d'un domaine | la couleur RESPIRE de son numéro (`POLE_COLORS`, 1 à 7 ; rien au-delà) | la couleur de son rang (`POLE_PALETTE`, ci-dessous) |
| réponse de `GET /api/twin9/runs/{id}/resultats` | `run`, `lecteur`, `sorties`, `memoire` | et `referentiel` (§8.4) |
| document `twin9-run` : `referentiel` | le référentiel publié | celui du run |

Aucun champ n'est renommé. De T17 au 2026-10-20, **RESPIRE gardait sa
structure**, comme dans le schéma `referentiel` (§9) : une clause des deux
schémas (`allOf` : si `referentiel` est absent ou vaut `respire`) imposait à
son document 7 pôles et des codes `P.NN` — les lignes « RESPIRE : de même » du
tableau. Elle est retirée : les schémas ne fixent plus de structure, et la
garantie que ces lignes donnaient (un document de 6 pôles, un pôle « 99 » ou
un code « 1.1 » refusés) vient désormais de la conformité du document à la
version de son référentiel (§11), pour RESPIRE comme pour tout autre. Ses
documents ne nomment toujours pas de référentiel et restent valides tels
quels. Les deux routes qui valident un document venu d'un client refusent
qu'il nomme un autre référentiel que le sien (`422`, pointeur `/referentiel`) :
le dépôt d'une journée par la masse (`POST /api/worker/jobs/{id}/result`, le
référentiel de son run) et la révision d'une cartographie (`POST
/api/cartographies/{id}/revisions`, le référentiel qu'elle désigne, RESPIRE à
défaut) — c'est la règle d'identité de la conformité. Un document d'un autre référentiel le
nomme : l'adaptateur Twin9 (`twin9ToMergeDocument`) le fait pour ses
documents-jour et sa fusion (`buildMergeDocument`, `meta.referentiel`), dès
que le référentiel qu'il reçoit a un autre identifiant que `respire`. La
fusion de RESPIRE ne change pas d'un octet : les 7 premières couleurs de la
palette sont les siennes, dans l'ordre de ses pôles (parité du document :
100 %). Le modèle atomique d'une compétence (`competence`,
`competence_versions`) reste celui de RESPIRE, la colonne du code fixant
celui du contenu ; son motif s'élargit pour ne plus être, à lui seul, un
verrou.

- **La palette des pôles** (`POLE_PALETTE`, `poleColor(rang)`,
  `engine/src/pipeline/merge-document.js`) : les 7 couleurs de RESPIRE, puis
  `#909def`, `#913c5b`, `#8eb608`, `#835106`, `#90209b`. Telles que
  l'interface les affiche, dans ses 5 palettes (D-64) et ses 2 thèmes, elles
  passent le script de la skill dataviz (`validate_palette.js`) sur les
  voisins du soleil, de 8 à 12 pôles, bouclage du dernier au premier compris :
  écart pour les daltoniens ≥ 8 (ΔE OKLab ×100), en vision normale ≥ 15 ;
  dans la palette Contrastée (par défaut), bande de luminance, chroma et 3:1
  sur la surface aussi. Au-delà de 12 pôles, couleurs et marques reprennent
  au début : les noms des pôles les distinguent. En deçà de 8, ce sont les
  couleurs de RESPIRE, dont le bouclage n'est validé qu'à 7 (et passe à 3 et
  5) : à 4 pôles, le dernier (violet) touche le premier (bleu), que les
  daltoniens confondent ; à 6, hors de la palette Contrastée, le bleu-vert
  touche le bleu de trop près en vision normale. Un tel référentiel l'évite en
  déclarant ses couleurs.
  Les libellés qui comptaient « sept pôles » (le radar du tableau de bord et
  celui de la comparaison) comptent ceux du référentiel.
- **Le référentiel de l'interface** (`web/src/carto/core/referential.js`) :
  un pôle sans couleur déclarée (`couleur: null`, comme les référentiels de
  test) prend celle de son rang — il prenait un gris unique ; une couleur
  déclarée reste la sienne. Un pôle **lettré** (`num: "A"`, 1 à 8 lettres,
  un document venu d'ailleurs que la plateforme, qui numérote les siens, §9)
  reçoit son numéro d'ordre : dès qu'un pôle porte une lettre, chacun reçoit
  son rang dans le fichier (1, 2…), et ses compétences le suivent par sa
  lettre (`pole: "A"`). Un pôle sans numéro entier (`3`, `"3"`) ni lettre est
  refusé (`"3.5"`, `""`, `null` : `null` passait pour le pôle 0). Le nom
  court d'un pôle lettré est sa lettre (« A · Percevoir » → « A »), comme
  celui d'un pôle de RESPIRE son mot-clé (« TETE »). Les
  **marques** (symbole et motif des distinctions renforcées, §6.1 de la
  spécification) passent de 8 à 12 : `▼` zigzag, `◐` anneaux, `✦` triangles,
  `✖` croix courtes (motifs dans `Sun.jsx`).
- **Le référentiel d'un run** (`Resultats::referentiel`) : les pôles et
  compétences du bloc que son moteur a lu (§8.8), gardé dans ses réglages —
  dans l'ordre du moteur, tels qu'il les a lus, même si leur version (un
  brouillon) a changé depuis —, chaque pôle avec la couleur que sa version a
  dans la base (celle d'aujourd'hui pour un brouillon retouché depuis). Ni
  fiche, ni préambule, ni description : les fiches en sont
  faites, et le filtre de fuite les tient pour confidentielles (§8.8). La
  page du run (`twin9RunFiles`) y ajoute les descriptions du référentiel
  publié de même identifiant que le site charge (RESPIRE) ; l'importeur
  (`importTwin9Run`) le rend — illisible, il le dit et le jeu garde le
  sien —, et le jeu neuf qui reçoit le run l'adopte
  (« Référentiel … adopté ») ; le titre du jeu porte son libellé
  (`Twin9 · <journal> · <libellé>`). Un run d'avant T16, sans référentiel
  dans ses réglages, s'ouvre avec le référentiel publié : il a lu RESPIRE.
- **Les numéros de pôle d'une fusion** : pour un run Twin9, `importSiteMerge`
  reçoit ceux du référentiel du run, dans l'ordre des domaines
  (`buildMergeDocument` rend tous ses pôles, dans l'ordre de leurs numéros) :
  la synthèse évolutive d'un pôle se range sous son numéro, quels que soient
  ses codes (« 21 » au pôle 2). Pour une fusion du site, sans référentiel, le
  numéro se lit toujours au début du code de la première compétence (`1.01`
  → 1), à défaut au rang du domaine.
- **Une carte par référentiel** (recette, `web/e2e/twin9-referentiels.e2e.js`) :
  sur un même portfolio, RESPIRE et deux référentiels de test ont chacun leur
  carte (`twin9_cartes`, par portfolio, référentiel et jeu de gabarits), donc
  leur mémoire (`twin9_memoire` : journées, calques, faisceaux), et chaque
  run la copie de son profil et son attestation ; leurs trois jeux coexistent
  dans la cartographie.
- **Le moteur factice** (`api/tests/fixtures/twin9-factice`) : son tribunal
  juge la première compétence de chaque pôle du référentiel du run (1.01
  seule sans référentiel), avec le nom qu'il lui donne ; sa fusion porte
  leurs histoires et les rapports de leurs pôles.

## 11. La conformité au référentiel (2026-10-20)

Christian a demandé pourquoi une journée de RESPIRE à six pôles était refusée,
et s'il faudrait tout recoder le jour où promptologues et épistémiarques
définiraient un référentiel de six pôles. Il l'aurait fallu : depuis T15 et T17,
les schémas figeaient RESPIRE à 7 pôles, 61 compétences et des codes `P.NN`
(§9, §10). RESPIRE redevient un référentiel comme un autre : une de ses
versions peut compter six pôles, ou neuf. Le garde-fou contre un pôle perdu
demeure, mais contre la **version** de référentiel que le document cartographie,
plus contre le chiffre 7. Aucun champ n'est renommé.

- **Les schémas** ne fixent plus de structure. `referentiel` passe en 2.1.0 :
  sa clause RESPIRE (7 pôles, 61 compétences, codes `P.NN`, aucun niveau) part ;
  un document 1.0.0 ou 2.0.0 y reste valide tel quel, avec la même empreinte.
  `cartographie-jour` et `cartographie-merge` perdent la leur (et `codeRespire`) :
  ils exigent au moins un pôle (un domaine), des numéros de pôle `^[1-9][0-9]*$`,
  des codes `codeCompetence` ; c'est tout ce qu'un schéma peut savoir d'un
  document sans son référentiel.
- **La conformité** (`engine/src/conformite.js`,
  `api/src/Referentiel/Conformite.php`, implémentations jumelles, mêmes
  messages, mêmes pointeurs JSON) confronte un document à la version de
  référentiel qu'il cartographie, après le schéma
  (`validateDocumentPourReferentiel`, `Conformite::valider` ; `validateConformite`,
  `Conformite::verifier` pour elle seule) :
  - identité : `referentiel` du document (absent : `respire`) = `id` du
    référentiel (`/referentiel`) ;
  - journée : chaque pôle attendu — ceux du référentiel, ou ceux de
    `perimetre.poles` quand `perimetre.partiel` est vrai, chacun pôle du
    référentiel — figure une fois et une seule (`/poles`, « il manque le pôle
    7 du référentiel », `/poles/i/poleNum`) ; chaque compétence est un code du
    référentiel, du pôle où elle figure, et du périmètre s'il nomme ses
    compétences ; les codes du kairos (connexions, nœuds, orphelines) sont des
    codes du référentiel. Le marqueur `perimetre` d'une journée partielle
    (`extractDay`, banc d'essai) n'est pas du schéma (`additionalProperties`
    faux) : le schéma se vérifie sans lui, la conformité le lit. Seul un
    appelant qui pose lui-même ce marqueur peut s'y fier (`extractDay`,
    `PoleAssembler`, le banc — qui lit aussi celui d'une référence importée,
    où il ne restreint que la comparaison) : le bac à sable ôte celui que
    poserait le code d'un paquet, et valide sa journée contre le référentiel
    qu'il lui a transmis, restreint au périmètre pour un run partiel ;
    ailleurs — dépôt d'un runner, révision (au serveur comme dans la
    relecture), importeurs —, le schéma se vérifie sur le document entier, et
    un marqueur le fait échouer ;
  - fusion : un domaine par pôle du référentiel (son pôle se déduit de ses
    compétences), chacun une fois (`/domains`, « il manque le pôle 7 du
    référentiel »), ses compétences de ce pôle ; pas plus de domaines que de
    pôles ; les clés du profil ipsatif sont des numéros de pôle canoniques du
    référentiel, et ses codes, des compétences de ce pôle. C'est la règle des
    7 domaines de RESPIRE, rapportée à la version (T17 admettait un
    sous-ensemble pour les autres référentiels : aucun producteur n'en rend,
    `buildMergeDocument` rendant un domaine par pôle). Un domaine sans
    compétence établie reste refusé par le schéma : « Fusion non
    constructible » (UC-APP-02 A6, UC-ETA-04 A5) demeure, pour tout
    référentiel.

  C'est plus strict que l'ancien schéma, RESPIRE compris : il ne vérifiait que
  la forme d'un code (`[1-7].NN`) ; un code que la version ne connaît pas, ou
  d'un autre pôle, est désormais refusé — à l'extraction, l'appel échoue puis
  son nouvel essai ; un kairos qui en relie un est refait, puis ramené à
  `null` quand le kairos est facultatif.
- **Quelle version.** Elle n'est pas dans le document (T17) : le contexte la
  connaît.

  | Parcours | Version lue |
  |---|---|
  | Cartographie standard (assistant) | celle choisie (« Référentiel » ; RESPIRE à sa dernière version publiée par défaut), enregistrée avec la cartographie (`referentielId`, `referentielVersion`) |
  | Essayer | RESPIRE, sa dernière version publiée (la copie embarquée en repli) |
  | Banc d'essai, bac à sable | le référentiel de la branche ; au périmètre, celui que le paquet reçoit |
  | Rétrospective | le référentiel de l'original (celui de sa version stockée, sinon celui que nomme le document, sinon RESPIRE), à la version — la sienne ou une plus récente — que l'on choisit pour régénérer |
  | Run de masse | celle que le run fige au lancement : `referentielId` / `referentielVersion` (facultatifs) de `POST /api/etablissement/cohortes/{id}/runs`, sinon la dernière publiée de RESPIRE ; ses jobs, le dépôt d'une journée par un runner (`POST /api/worker/jobs/{id}/result`) et la fusion d'un membre la lisent |
  | Cartographie ouverte (Twin6) | celle choisie (RESPIRE par défaut) ; pour RESPIRE, la structure de `/api/twin9/meta` (noms de pôle accentués) tant qu'elle a les pôles et les codes de la version choisie ; ses gabarits (paquet 1.1.0) en lisent le nom, les pôles, les compétences et la forme des codes (§8) |
  | Analyse approfondie (Twin9) | celle du profil du run (§8.8) |
  | Relecture : annotations, révisions (`ReviewReferentiel`) | la version stockée ; sinon, parmi les versions publiées du référentiel que nomme le document (RESPIRE à défaut), la plus récente à laquelle il est conforme — une journée de RESPIRE v7 reste relue contre v7 quand une version d'une autre structure paraît —, sinon la dernière ; sans version publiée, refus `422` |
  | Visionneuses, partage, archive, remise à l'interface (`chargerReferentielDuDocument`) | la version notée ; sinon, parmi les versions publiées du référentiel que nomme le document (la base par l'API, l'index statique en repli, S5), la plus récente à laquelle il est conforme — la règle de la relecture —, à défaut la dernière ; RESPIRE embarqué en repli pour un document qui n'en nomme pas ; un autre référentiel introuvable est dit, jamais lu avec RESPIRE |
  | Corpus de démonstration (`#/jour`, `validate-corpus.mjs`) | RESPIRE v7 |

  Le choix d'un référentiel publié (`ReferentielChoice`) lit la base
  (`GET /api/referentiels`, S5, 2026-10-22), à défaut l'index statique
  `data/referentiel/index.json` : la dernière version de chacun, RESPIRE
  d'abord ; sans l'une ni l'autre (copie hors ligne), aucun choix n'est
  offert. Le document d'une version
  (`loadPublishedReferentiel({id, version})`) se lit de même :
  `GET /api/referentiels/{id}/versions/{semver}`, à défaut l'export statique,
  enfin, pour RESPIRE, la copie embarquée ; sans choix, les parcours chargent
  ainsi la dernière RESPIRE publiée (`{id: 'respire'}`), celle que le menu
  présélectionne. Une liste sans RESPIRE (une base qui ne l'a pas publié)
  présélectionne son premier référentiel, et le menu en fait le choix
  (`onChange`, jamais sous un run en cours) : le parcours charge le
  référentiel affiché, et la masse l'envoie (`referentielId`). Sous le menu,
  la provenance (`source`) du référentiel affiché, s'il n'est pas RESPIRE :
  d'où il vient et sa licence (S5, E1 et E9 ; l'Humanome V18 est celui de
  respire.school, sous CC-BY-SA). L'index statique ne la porte pas : en
  repli, rien ne s'affiche. L'aide des trois parcours (`espace`,
  `twin6ouverte`, `etablissement`) dit ce qu'est l'Humanome V18, s'il est
  proposé. Une réponse de l'API vide,
  malformée, en erreur, ou un document qui n'est pas la version demandée
  cèdent la place à l'export statique. La page publique `#/referentiel`
  suit la même règle depuis S5, lot E : elle charge `{id: 'respire'}` par
  défaut, ou le référentiel que nomme son adresse (`#/referentiel[/<code>]?id=<id>`,
  RESPIRE sans `id`), propose les autres au même menu (la provenance, elle,
  sous l'en-tête, depuis le `source` du document), et dit un identifiant
  qu'elle ne peut charger, RESPIRE affiché à sa place (UC-VIS-02, A7 à A9,
  E5). Seule la branche sans identifiant (`loadPublishedReferentiel()`,
  l'interface de cartographie) reste statique. Le lien « Voir dans le
  référentiel » d'une carte nomme le référentiel de la carte.
- **Les routes**, ce qui change :
  - `POST /api/etablissement/cohortes/{id}/runs` : `referentielId`,
    `referentielVersion` facultatifs ; version non publiée ou identifiant
    inconnu → `422` « Version publiée du référentiel introuvable : … » ;
    version sans identifiant → `422` ; un paquet qui ne sait pas
    cartographier ce référentiel (ci-dessous) → `422` avec la raison ;
  - `POST /api/worker/jobs/{id}/result` : le contrôle d'identité de T17
    devient la conformité à la version du run → `422` « Document non
    conforme au référentiel de son run » (`details`) ;
  - `POST /api/cartographies/{id}/annotations` : le code est une compétence
    de la version que lit la relecture (plus de repli sur la forme
    `[1-7].NN`) ; sans version publiée → `422` ;
  - `POST /api/cartographies/{id}/revisions` : schéma, identité, puis
    conformité → `422` « Document non conforme au référentiel « id »
    version » (`fields`) ; sans version publiée → `422` ;
  - `GET /api/cartographe/cartographies/{id}` : un champ de plus,
    `referentiel: {id, version}`, la version que lit la relecture (version
    `null` sans version publiée).
- **Les prompts** lisent le référentiel. Nom : « RESPIRE » pour l'id
  `respire`, quel que soit son libellé ; sinon le libellé sans sa version
  finale, à défaut l'id (`nomCourtReferentiel`, `PromptRunner::referentielName`,
  comme `Referentiel::nomCourt` du moteur Twin9). Codes d'exemple : le premier
  code du référentiel, et le deuxième de son quatrième pôle s'il existe, sinon
  son dernier code (`codesExemples`, `PromptRunner::exampleCodes` ; RESPIRE
  v7 : `1.01`, `4.02`). Pour RESPIRE v7, les prompts sont ceux d'hier, à
  l'octet.
  - Variables offertes aux gabarits d'extraction d'un paquet, en plus des
    anciennes : `referentiel_nom` (les deux gabarits), `code_exemple_1`,
    `code_exemple_2` (kairos). Un paquet dont les deux gabarits déclarent
    `referentiel_nom` cartographie tout référentiel ; un autre — comme
    `aurora-v3-reconstruit` 1.0.0, qui écrit « RESPIRE », « 7 pôles », « 1.01 »
    et « 4.02 » en toutes lettres — seulement RESPIRE à sept pôles où ces
    deux codes existent, dans deux pôles distincts
    (`PromptRunner::referentielRefusal`, appliqué au lancement d'un run de
    masse). Dans le navigateur, le site ne rend lui-même aucun gabarit de
    paquet : le paquet embarqué exécute les constructeurs du moteur, qui
    lisent le référentiel, et un paquet du bac à sable rend les siens dans son
    propre code (le banc avertit quand ce code écrit un référentiel en dur).
  - `scripts/build-default-prompt-package.mjs` écrit deux versions :
    1.0.0, inchangée à l'octet (publiée, immuable), et 1.1.0, dont les
    gabarits d'extraction déclarent ces variables (et « Les {{nb_poles}}
    pôles de la feuille du jour »). Rendue pour RESPIRE v7 par
    `PromptRunner`, 1.1.0 donne les prompts de 1.0.0 à l'octet (goldens de
    masse inchangés) ; pour un référentiel lettré, ceux du moteur
    (`DefaultPackageParityTest`). Le paquet embarqué du navigateur passe à
    1.1.0 ; l'identifiant d'un run standard porte désormais aussi `id@version`
    du référentiel. `referentielCompatible` reste déclaratif.
- **Les comptes** : un run complet fait un appel par pôle et un kairos par
  journée (`callsPerDayFor`), et un récit par compétence, par pôle et un
  kairos à la fusion (`mergeNarrativeCallsFor`) ; Twin6, un scan par pôle et
  le kairos (`twin6CallsFor`). RESPIRE v7 : 8, 69 et 8, les constantes
  d'hier, qui restent.
- **Les fiches de Twin6** (`fichesPourTwin6`) : celle du paquet public pour
  un pôle dont elle nomme exactement les codes (RESPIRE v7 : P1 à P7, à
  l'identique), sinon écrite depuis le document comme le fait
  `ReferentielMoteur` (« # Pôle N — nom », puis « ## CODE — nom », sa
  description, ses éléments un niveau plus bas, compétences dans l'ordre
  naturel de leurs codes, jointes par « --- »).
- **La release depuis le modèle atomique** (UC-EPI-03) : son contrôle de
  complétude n'était plus « 61 compétences, 7 pôles » que par le schéma ; c'est
  désormais la structure de la dernière version publiée de RESPIRE — mêmes
  pôles, mêmes codes dans les mêmes pôles (`/poles`, `/competences`). Le modèle
  atomique ne peut donc pas défaire une version publiée d'une autre structure
  (UC-EPI-04 AN1, corrigé en partie) ; sans version publiée, la coupe est
  refusée (`/version`).
- **Ce qui reste propre à RESPIRE** : le modèle atomique des compétences
  (`competence_versions`, `referentiel_poles`, l'atelier compétence par
  compétence) — une version de RESPIRE d'une autre structure s'édite comme un
  document (UC-EPI-04) ; les textes qui décrivent RESPIRE v7 (accueil, aide,
  formation) ; l'outillage de corpus et de parité (`scripts/convert`,
  `scripts/parity`, fiches et paquet public de Twin6 tirés du corpus) ; le
  motif par défaut d'un référentiel sans `niveaux`, `\d\.\d{2}`
  (`MOTIF_PAR_DEFAUT`) — une version de RESPIRE à dix pôles ou plus déclare
  ses niveaux. Les gabarits scan-pôle et kairos de Twin6, versionnés depuis,
  écrivent bien RESPIRE v7 en toutes lettres dans leur version 1.0.0 : la 1.1.0
  les lit dans le référentiel (§8).

## 12. La carte du site (`scripts/data/site-map.json`, sprint 11)

Fichier généré (gitignoré) par `scripts/build-tuteur-digest.mjs`, livré dans
la release de l'API avec le digest de l'assistant (`stage-api.sh` copie
`scripts/data/`). Il n'a pas de schéma JSON : il n'est pas échangé entre le
navigateur et le serveur, seulement lu par le serveur, qui le reçoit du même
commit. Produit par `collectSiteMap` (`scripts/lib/site-map.mjs`, UC-SYS-04
RG8), déterministe, sans date et sans corps de chapitre.

- `version` : 1.
- `site` : `{url, titre, resume}` ; `url` vient de `SITE_URL` (défaut
  `https://humanome.xyz`), `resume` est l'intro de l'aide de l'accueil.
- `familles[]` : le menu (`navGroups` d'un compte qui a tous les rôles en mode
  expert, puis d'un visiteur), `{id, label, intent, audience, roles, items[]}`.
  Chaque item porte `{href, label, route, section, badge, hint, roles,
  allRoles, expert, visiteur, connecte}` : `visiteur` et `connecte` disent
  dans quelle session il paraît, `expert` qu'il n'est listé qu'en mode expert.
- `pages[]` : **une page par nom de route** du catalogue
  (`web/src/routes-catalogue.js`), dans l'ordre du menu puis du catalogue,
  `{route, href, modele, variantes, modeles, titre, resume, points, navLabel,
  hint, badges, audience, familles, dansMenu, expert, public, interne}`.
  `route` est le nom que rend `parseHash` (et qu'envoie l'assistant comme
  rubrique) ; `href` est l'adresse à donner à une personne (un modèle à
  compléter quand `modele` est vrai) ; `titre`, `resume` et `points` sont
  l'entrée de l'aide (`HELP_ENTRIES`) : pour une route interne, `titre` et
  `resume` sont nuls et `points` est vide.
- `aideSansRoute[]` : `{cle, titre, resume, points}`, les entrées d'aide sans
  page (le profil employeur des tuiles de l'accueil).
- `guides[]` : `{parcours, titre, href, publie, chapitres[{slug, titre, ordre,
  href, fichier, source}]}` ; `fichier` est l'URL du `.md` publié, nulle si le
  parcours n'est pas dans `PARCOURS_PUBLIES`.
- `legal[]` : `{cle, titre, maj, href, fichier, source}`.
- `roles` : les libellés des rôles (`ROLE_LABELS`).

**Ce que l'API en lit** (`POST /api/tuteur`, `api/src/Tuteur/CarteDuSite.php`,
sprint 11 lot A, UC-VIS-05 RG1) : `version`, qui doit valoir 1, et, de chaque
page, `route`, `href`, `titre`, `resume`, `points` et `interne`. La rubrique
qu'envoie l'assistant n'entre dans sa consigne que si c'est le `route` d'une
page non interne qui a un `titre` : « Elle consulte actuellement : <titre>
(<href>). », puis le `resume` et les `points` de cette seule page. Un fichier
absent, illisible, d'une autre version ou sans `pages` vaut absence de carte :
la rubrique est alors vidée, même un nom de route. Toute évolution de ces
champs ou de leur sens touche donc aussi l'API (même commit, même release).
UC-SYS-04-F18 vérifie ce contrat sur la carte générée, et que la carte fictive
des tests PHP (`api/tests/fixtures/tuteur/site-map.json`) a la même forme.
