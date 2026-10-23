# UC-EPI-05 — Importer un référentiel d'une autre structure

| Champ | Valeur |
|---|---|
| **Acteur principal** | Épistémiarque (ou administrateur : garde « épistémiarque ou admin ») |
| **Acteurs secondaires** | Membres épistémiarques (vote, UC-EPI-02 A5) ; chaque compte, qui choisit un référentiel publié dans son profil Twin9 (UC-APP-10, page Configuration), au lancement d'une analyse approfondie (UC-APP-10 A11, depuis S5 lot C) ou d'une cartographie standard, ouverte ou de masse ; l'auteur d'un brouillon, pour ses runs d'essai |
| **Portée** | Atelier `#/epistemiarque/referentiels` (section « Autres référentiels » : import d'un JSON ou d'un texte Markdown, modèles, export en Markdown) ; API `POST /api/referentiel/import`, `GET /api/referentiels`, `GET /api/referentiels/{id}/versions/{semver}`, et le cycle du grain document (`/api/referentiel/drafts…`, `/api/referentiel/proposals…`, UC-EPI-04) ; hors vote, l'amorçage de l'Humanome V18 converti de son YAML (`scripts/convertir-humanome.mjs`, `scripts/amorcer-referentiel.php`, S5, A6) |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.5, §4.1 ; T15 (dépôt `Twin_v9`, `docs/plan-twin9-php.md`, lot 4c, première tâche) ; schéma `referentiel` 2.1.0 (`docs/contrats.md` §9 et §11) |
| **Statut** | Implémenté (T15) ; le moteur lit le référentiel du run depuis T16, la cartographie depuis T17 (`docs/contrats.md` §10) ; conversion et amorçage de l'Humanome V18 depuis S5 (A6) ; écriture en Markdown, modèles et export depuis S5, lot D (A7 à A9) ; revue du lot D (2026-10-22) : codes faits de chiffres refusés, lecture CommonMark et Unicode des titres, aller-retour exact ou refus nommé, motifs PCRE, aperçu au niveau choisi, accessibilité de l'import |

## Objectif

Faire entrer par l'atelier un référentiel d'une autre structure que RESPIRE —
un autre nombre de pôles, des codes lettrés, plusieurs niveaux comme les
capacités et les facettes de l'Humanome V18 — en choisissant le niveau qui
tient lieu de compétence, puis le faire voter et publier comme une version,
sans que RESPIRE change.

## Déclencheur

Un épistémiarque dispose du référentiel au format JSON du schéma
`referentiel` (2.1.0 ; un document écrit pour 2.0.0 y reste valide), par
exemple converti depuis sa source, et veut le proposer aux membres. Le YAML
de l'Humanome V18 (https://respire.school/referentiel) se convertit par
`scripts/convertir-humanome.mjs` (A6, `docs/referentiel-humanome.md`).
Depuis S5 (lot D), il peut aussi l'écrire en Markdown, au format des fiches
de pôle, en partant d'un modèle ou d'un référentiel publié exporté (A7 à A9).

## Préconditions

- Session ouverte, rôle `epistemiarque` ou `admin` ; jeton CSRF.
- Le document déclare ses niveaux et le motif des codes de chacun (`niveaux`),
  sauf s'il n'a qu'un niveau au motif de RESPIRE (`\d\.\d{2}`). Écrit en
  Markdown, la page déduit les motifs des codes (RG12).

## Garanties en cas de succès

- Un brouillon (`draft`) du référentiel, dont l'importateur est l'auteur
  (`created_by`), lu au niveau choisi : les éléments de ce niveau sont ses
  compétences, chacune sous le pôle de sa compétence d'origine, ses éléments
  plus fins dessous ; ses `niveaux` commencent au niveau choisi.
- Après le vote et la publication, la version est servie (`GET /api/referentiels`
  la liste, `GET /api/referentiels/{id}/versions/{semver}` son document, à
  tous, en lecture seule) et proposée à chaque compte : dans son profil Twin9,
  au lancement d'une analyse approfondie (menu « Référentiel », S5 lot C,
  UC-APP-10 A11) et, depuis le 2026-10-20, au choix du référentiel de la
  cartographie standard, de la cartographie ouverte (Twin6) et des
  cartographies de masse.
  Depuis S5 (2026-10-22), ces trois menus la lisent dans la base, dès sa
  publication : plus besoin d'un export statique ni d'un redéploiement. Ses
  fiches de scan s'écrivent depuis son document, sans rien à générer (RG10).
  La page publique `#/referentiel` la montre aussi depuis S5, lot E : au menu
  « Référentiel », à l'adresse `#/referentiel?id=<id>`, avec sa provenance
  (UC-VIS-02, A7 à A9).
- Un brouillon ou une proposition ne sont jamais servis par ces routes, pas
  même à leur auteur (ils ne servent que ses runs d'essai, RG7).
- Un texte Markdown importé (A7) devient le même brouillon que le JSON qu'il
  décrit : la page envoie ce document par la même route, que le serveur
  contrôle de la même façon.
- Un référentiel publié exporté en Markdown (A9), relu avec les mêmes
  identifiant, libellé et version, redonne son document : pôles et leurs
  couleurs, compétences, descriptions, éléments, provenance, noms des
  niveaux, donc la même empreinte ; seuls les motifs se déduisent de
  nouveau (RG12). L'aller-retour est exact pour un texte composé (NFC),
  aux blancs près qui entourent une description ou la provenance (la fiche
  du moteur les retire) ; ce que le Markdown ne peut pas écrire est refusé
  à l'export, nommé (E7), jamais perdu en silence. Relu puis réécrit, le
  texte revient octet pour octet (vérifié sur RESPIRE, sur la fixture
  fictive à la forme Humanome et sur les cas limites de U24 et U25).

## Garanties minimales (en cas d'échec)

- Aucun document invalide n'est enregistré ; RESPIRE n'est jamais modifié
  par un import. Aucun code fait de chiffres seulement n'est enregistré
  (RG2) : le moteur Twin9 refuserait le référentiel à chaque lancement.
- Un texte Markdown dont l'aperçu montre une erreur ne part pas ; refusé par
  le serveur, il reste dans la page, à corriger sur place.

## Scénario nominal

1. L'épistémiarque ouvre l'atelier (`#/epistemiarque`) et suit le lien
   « Autres référentiels » (`#/epistemiarque/referentiels`).
2. Il choisit le fichier du référentiel. S'il déclare plusieurs niveaux, la
   page propose le « Niveau qui tient lieu de compétence » (le premier par
   défaut) ; il choisit, par exemple, la capacité plutôt que la facette.
3. « Importer » : `POST /api/referentiel/import` `{document, niveau?}`. Le
   serveur refuse RESPIRE et un identifiant invalide, valide le document tel
   quel (schéma puis contrôles : motifs, niveaux, pôles 1 à N, codes uniques),
   le lit au niveau choisi, le valide de nouveau, refuse une version qui
   existe déjà et l'enregistre en brouillon → `201`. La page dit « Brouillon
   « id » version importé : N compétences en M pôles. » et se recharge.
4. Il soumet le brouillon au vote (« Soumettre au vote »,
   `POST /api/referentiel/drafts/{id}/submit`) ; les membres lisent le
   document (« Voir » : ses pôles et leurs compétences,
   `GET /api/referentiel/drafts/{id}`) et votent (« Pour », « Contre »,
   « Abstention », `POST /api/referentiel/proposals/{id}/votes`).
5. À la majorité, « Publier » (`POST /api/referentiel/drafts/{id}/publish`) :
   la version est immuable, listée parmi les publiés
   (`GET /api/referentiels`), et proposée dans la page Configuration de chacun.

## Scénarios alternatifs

- **A1 — Niveau facette** (étape 2) : les facettes deviennent les compétences
  (40 pour le référentiel fictif des tests), sous le pôle de leur capacité ;
  le niveau capacité n'est pas gardé.
- **A2 — Nouvelle version** : `POST /api/referentiel/drafts`
  `{referentiel, from, semver}` forke une version d'un autre référentiel comme
  celle de RESPIRE (UC-EPI-04) ; ou l'épistémiarque importe le fichier sous
  une nouvelle version. `referentiel` est un identifiant
  (`[a-z0-9][a-z0-9._-]{0,63}`, sinon `422`) ; la nouvelle version garde
  celui de sa source.
- **A3 — Un seul niveau** (étape 2) : sans choix à faire, le document est lu à
  son premier niveau.
- **A4 — Administrateur** (étapes 3 à 5) : un `admin` non membre importe,
  soumet, retire et publie ; il ne vote pas (UC-EPI-04 A4).
- **A5 — Run d'essai sur son brouillon** : son auteur, tant qu'il est
  épistémiarque ou administrateur, le désigne dans un profil Twin9 en mode
  essai (page Configuration : « version (brouillon, run d'essai) »), ou le
  choisit au lancement d'un tel profil, en mode expert (« … (brouillon, run
  d'essai) », UC-APP-10 A11) ; nul autre, et pas en mode complet. Depuis
  T16, le moteur lit le référentiel du run, le brouillon compris (RG8).
- **A6 — L'Humanome V18, converti et amorcé hors vote** (S5, décision de
  Christian du 2026-10-22 ; `docs/referentiel-humanome.md`). Sur le poste :
  `node scripts/convertir-humanome.mjs <humanome_v18.yaml>` écrit le document
  au niveau capacité (20 compétences, les 64 facettes en éléments ; `--niveau
  facette` en option) dans `build/referentiels/`, en avertissant des écarts
  entre l'en-tête `structure` du YAML et son contenu ; puis
  `php scripts/amorcer-referentiel.php <document.json>` le publie sans vote,
  idempotent sur le document entier, hors sa provenance (`source` : le même
  YAML sous un autre nom de fichier ou une autre URL est la même version).
  Il refuse RESPIRE, un identifiant invalide, une version déjà en base avec
  un autre contenu ou tenue par l'atelier. La version est ensuite servie par les routes publiques et
  proposée par les menus des parcours, comme une version votée. En
  production, sans shell : par l'atelier (étapes 1 à 5), ou par
  `POST /api/admin/import-referentiel`, qui applique les mêmes garde-fous à
  tout autre identifiant que `respire` (`docs/referentiel-humanome.md` §5).
- **A7 — Écrire le référentiel en Markdown** (S5, lot D ; étapes 2 et 3).
  Dans le bloc « En Markdown », l'épistémiarque colle ou écrit le texte, ou
  choisit un fichier `.md` (« Fichier Markdown »), au format des fiches de
  pôle que le moteur écrit (RG10, RG11). Il saisit l'identifiant, le libellé
  et la version dans trois champs. À chaque frappe, la page lit le texte
  (`web/src/lib/referentiel-markdown.js`) et montre :
  - l'aperçu : nombre de pôles, de compétences et d'éléments plus fins, puis
    chaque pôle avec son nombre de compétences, comptés au niveau qui tient
    lieu de compétence (« 3 compétences au niveau « facette » ») : ceux du
    brouillon que créera le serveur (RG4) ;
  - chaque niveau, avec son nom (celui du commentaire « niveaux », sinon
    « compétence », « élément », « sous-élément ») et le motif déduit de ses
    codes (RG12), tous deux modifiables ; « Reprendre le motif déduit »
    annule une saisie ;
  - les erreurs, chacune à sa ligne (E6), et les avertissements, qui
    n'empêchent rien (RG13).
  Avec plusieurs niveaux, il choisit le niveau qui tient lieu de compétence.
  Un nouveau fichier repart des noms et des motifs de son texte
  (l'identifiant, le libellé et la version restent) ; le même fichier,
  corrigé, se choisit de nouveau.
  « Importer le Markdown » envoie le document par `POST /api/referentiel/import`
  (étape 3), sans `contentHash`, que le serveur calcule ; la page se recharge
  et le formulaire se vide.
- **A8 — Partir d'un modèle.** « Télécharger un modèle » : en Markdown
  (`modele-referentiel.md`, avec ses commentaires facultatifs et l'écueil
  des noms de pôle de RESPIRE, RG13) ou en JSON (`modele-referentiel.json`,
  le même référentiel fictif, commenté champ par champ dans la page, sous
  « Le modèle JSON, champ par champ »). Le modèle Markdown se lit sans
  erreur ; le JSON s'importe comme en A3.
- **A9 — Exporter en Markdown.** Le bloc « Exporter en Markdown » propose
  chaque version publiée de tout référentiel, RESPIRE compris. La page lit
  son document (`GET /api/referentiels/{id}/versions/{semver}`) et le
  télécharge en `{id}-v{version}.md` : la fiche de chaque pôle, octet pour
  octet celle du moteur (`fichesDuReferentiel`), la couleur du pôle sous son
  titre, la provenance et les noms des niveaux en tête. Le texte se
  réimporte (A7) sous un autre identifiant, ou sous une nouvelle version du
  même ; RESPIRE, lui, ne s'importe pas (E2) et s'édite dans son atelier.

## Scénarios d'erreur

- **E1 — Document refusé** (étape 3) : un code qui ne suit pas le motif de son
  niveau (« « E9 » ne suit pas le motif [A-E][1-4] du niveau « capacité » »),
  un motif illisible ou trop coûteux à évaluer (RG2), des pôles qui ne se
  numérotent pas de 1 à N sans trou, un élément d'un niveau que le
  référentiel ne déclare pas, un code en double ou fait de chiffres
  seulement (RG2), un niveau inconnu, une
  branche qui s'arrête au-dessus du niveau choisi (RG4), un document hors
  schéma → `422` avec, par pointeur, la raison ; la page les liste et écarte
  le fichier : choisi de nouveau, c'est sa version corrigée qui part. Rien
  n'est écrit.
- **E2 — Import refusé** (étape 3) : RESPIRE (`respire`) → `409` « RESPIRE
  s'édite compétence par compétence dans son atelier : il ne s'importe pas » ;
  une version qui existe → `409` ; un identifiant hors de
  `[a-z0-9][a-z0-9._-]{0,63}` → `422` (`/id`) ; un document absent ou qui
  n'est pas un objet → `422`.
- **E3 — Accès** : sans session `401`, sans rôle `403`, sans jeton CSRF `403`.
- **E4 — Fichier illisible** (étape 2) : un fichier qui n'est pas du JSON est
  dit dans la page ; rien ne part.
- **E5 — Brouillon d'un autre** (A5) : un profil qui désigne le brouillon d'un
  autre, ou le sien en mode complet → `422` « Profil refusé —
  /referentiel/version : un brouillon ne sert qu'aux runs d'essai de son
  auteur ».
- **E6 — Markdown refusé dans la page** (A7) : « Importer le Markdown »
  reste indisponible (`aria-disabled` : il reste dans l'ordre de
  tabulation) tant que l'aperçu liste une erreur, chacune à sa ligne, dans
  l'ordre du texte. Un résumé visible, relié au bouton, le dit (« 2 erreurs
  empêchent l'import ») ; activer le bouton porte le focus sur la liste des
  erreurs ; un champ fautif (identifiant, libellé, version) est marqué
  `aria-invalid` et relié à son erreur. Les erreurs :
  - texte avant le premier pôle, compétence avant tout pôle ;
  - titre de pôle ou de compétence mal formé (« # Pôle N — Nom »,
    « ## CODE — Nom ») ;
  - pôles qui ne se numérotent pas 1, 2, 3… dans l'ordre, pôle sans
    compétence ;
  - niveau sauté (« #### » sous « ## ») ;
  - code invalide (lettres sans accent), en double, ou fait de chiffres
    seulement (RG2) ;
  - couleur illisible, commentaire jamais refermé, aucun pôle ;
  - texte qui n'est pas en UTF-8 (un caractère « � », dit une fois, à sa
    première ligne) ;
  - code qui ne suit pas le motif, saisi, de son niveau ; motif vide, de
    plus de 100 caractères, à caractère de contrôle ou à verbe « (*… »
    (RG2) ; nom de niveau vide, en double, ou qui contient une virgule ou
    « --> » ;
  - identifiant absent, invalide ou `respire` ; version absente, hors semver
    ou de plus de 32 caractères ; libellé absent ou de plus de 190 caractères
    (UC-EPI-04 AN2, évité ici) ;
  - enfin, ce que le schéma refuserait encore.
  Les éléments d'un titre refusé ne font pas d'autre erreur. Un motif saisi
  que la page ne lit pas en JavaScript (une syntaxe propre à PCRE :
  quantificateur possessif, groupe atomique, « (?i) ») n'est qu'un
  avertissement : ses codes ne sont pas vérifiés dans la page, le serveur
  tranche. Un refus du serveur s'affiche par pointeur, comme en E1, et le
  texte reste.
- **E7 — Export impossible** (A9) : une version que l'API ne sert pas
  (`404`), un document plus profond que « ###### », un document que le
  Markdown ne peut pas écrire (un nom sur plusieurs lignes ou entouré de
  blancs, un nom de niveau qui contient une virgule ou « --> », une
  provenance qui contient « --> »), un navigateur sans téléchargement : la
  page le dit, rien ne part.

## Règles de gestion

- **RG1** — Un référentiel déclare ses niveaux, du plus large au plus fin,
  chacun avec le motif de ses codes ; le premier tient lieu de compétence.
  Sans déclaration : un niveau, « compétence », au motif de RESPIRE
  `\d\.\d{2}`.
- **RG2** — Un code suit **en entier** le motif de son niveau (expression
  `^(?:motif)$`), sans quoi le moteur ne le retrouverait pas et sa compétence
  disparaîtrait sans bruit du run. Le motif reste entre ses ancres : il
  compile seul et n'use d'aucun verbe `(*…)`, sinon « Motif illisible ». Il
  s'évalue sous une limite de 10 000 pas de retour arrière : au-delà, il est
  refusé une fois (« Motif trop coûteux à évaluer »). Un code a 1 à 8
  caractères (lettres sans accent, chiffres, `.`, `_`, `-`), unique dans
  tout le référentiel, et n'est jamais fait de chiffres seulement (« 11 ») :
  le moteur Twin9 refuse une compétence ainsi codée, et tout niveau peut
  tenir lieu de compétence. Le serveur le refuse à tout niveau, à son
  pointeur (`CHIFFRES_SEULS`, depuis la revue du lot D), la page Markdown à
  sa ligne ; une version enregistrée avant ce contrôle est refusée par ce
  qui la revalide (soumission, publication, fork) et au lancement (RG8).
  Le motif est lu en PCRE par le serveur et le moteur ; la page le lit en
  JavaScript (drapeau `u` d'abord) et n'avertit que d'un motif qu'elle ne
  lit pas (E6).
- **RG3** — Les pôles se numérotent de 1 à N, sans trou ; un pôle lettré
  (A à E) porte son rang (1 à 5).
- **RG4** — Lire à un niveau : ses éléments deviennent les compétences, sous
  le pôle de leur compétence d'origine, leurs éléments plus fins dessous ; les
  niveaux plus larges ne sont pas gardés. Une branche qui s'arrête plus haut
  (une capacité sans facette, lue au niveau facette) disparaîtrait : l'import
  est refusé et la nomme, comme un niveau sans élément.
- **RG5** — L'empreinte (`contentHash`) ne compte que les pôles et les
  compétences, comme celle de RESPIRE ; niveaux, descriptions (des pôles, des
  compétences, des éléments) et éléments sont gardés hors d'elle.
- **RG6** — RESPIRE ne s'importe pas : il s'édite compétence par compétence
  (UC-EPI-01 à 03) ou comme un document (UC-EPI-04). Depuis le 2026-10-20, le
  schéma ne garde plus sa structure : une de ses versions peut compter
  d'autres pôles et d'autres compétences, comme tout référentiel ; sans niveaux
  déclarés, ses codes suivent le motif par défaut `\d\.\d{2}`. La coupe de
  sa release garde la structure de sa dernière version publiée (UC-EPI-03 E6).
- **RG7** — Un brouillon (ou une proposition au vote) ne sert qu'aux runs
  d'essai de son auteur, tant qu'il est épistémiarque ou administrateur ;
  publié, le référentiel est à tous (`ProfilPolicy`, matrice « Configuration
  Twin9 » de `docs/autorisations.md`).
- **RG8** — Depuis T16, le moteur lit le référentiel du profil, tiré de la
  base à sa version (`docs/contrats.md` §8.8) : un run ou son aperçu sur un
  autre référentiel part ; un référentiel que le moteur ne lit pas (un code
  fait de chiffres seulement, par exemple) est refusé au lancement (`422`
  « Le référentiel « id » ne se lit pas : … »). De T15 à T16, le moteur lisait
  les fiches RESPIRE de son jeu, et un autre référentiel était refusé.
- **RG9** — Une annotation d'une cartographie qui désigne une version de
  référentiel porte un code de ce référentiel ; sans référentiel désigné, la
  forme de RESPIRE (`[1-7].NN`).
- **RG10** — Un référentiel importé n'a pas de fiches à rédiger ni à générer :
  l'analyse approfondie (Twin9, depuis T16) et la cartographie ouverte (Twin6,
  depuis le 2026-10-20) écrivent la fiche de chaque pôle depuis son document,
  au moment du run — « # Pôle N — nom », puis la description du pôle ; pour
  chaque compétence, « ## CODE — nom », sa description, puis ses éléments plus
  fins, chacun un niveau de titre plus bas avec sa description. Ces fiches ne
  sont donc riches que de ce que le document décrit : le schéma n'a pas
  d'autre champ pour elles. La cartographie standard et la masse ne lisent que
  les pôles, les codes et les noms. RESPIRE, lui, garde ses fiches rédigées,
  dans la base (UC-EPI-01 à 03, UC-EPI-04 L3).
- **RG11** — Le texte Markdown de l'atelier (S5, lot D) est celui de ces
  fiches, mises bout à bout :
  - « # Pôle N — Nom » ouvre un pôle, numéroté 1, 2, 3… dans l'ordre ;
  - « ## CODE — Nom » ouvre une compétence de ce pôle ;
  - « ### CODE — Nom » ouvre un élément plus fin du titre au-dessus, et
    ainsi de suite jusqu'à « ###### », sans sauter de niveau ;
  - le texte sous un titre le décrit ; un « --- » entre deux fiches est
    facultatif et n'entre dans aucune description ;
  - « – » et « - » se lisent comme « — » ; le BOM et les fins de ligne CRLF
    ou CR sont admis ;
  - comme en CommonMark, un titre peut être précédé de trois espaces au
    plus (quatre font du code, donc du texte), et une suite finale de « # »
    précédée d'un blanc le ferme sans être du nom (« ## A1 — Nom ## ») ;
  - une espace insécable (U+00A0, U+202F) sépare les mots d'un titre comme
    une autre, comme le lit le moteur ; le texte se lit composé (NFC), si
    bien qu'un « Pôle » décomposé est un « Pôle » ; un caractère « � »,
    celui d'un fichier qui n'est pas en UTF-8, le fait refuser (E6).
  Trois commentaires facultatifs gardent ce que les fiches ne disent pas :
  « <!-- couleur : #rrggbb --> » sur la ligne qui suit le titre d'un pôle ;
  « <!-- source : … --> » et « <!-- niveaux : capacité, facette --> » avant
  le premier pôle, où tout autre commentaire est ignoré. Dans une
  description, une ligne qui se lirait comme un titre, un séparateur ou un
  commentaire (« <!-- … », comme celui de la couleur sous le titre d'un
  pôle) s'écrit précédée d'une barre oblique inverse, que la lecture
  retire ; un nom qui finit par « # » précédé d'un blanc s'écrit « … \# »,
  dont la lecture retire la barre.
  L'identifiant, le libellé et la version ne sont pas dans le texte. Sans
  commentaire « source », la provenance est « Écrit en Markdown dans
  l'atelier des épistémiarques ».
- **RG12** — Le motif de chaque niveau se déduit de ses codes, le plus
  étroit compatible : position par position, le caractère que tous les codes
  y partagent, sinon la plage des leurs (`[A-E]`, `[1-4]`, `\d` pour tous
  les chiffres, des plages disjointes comme `[A-BD]`). Des classes
  identiques qui se suivent se comptent (`\d{2}`). Une suite de longueur
  variable prend la plage de ses caractères et ses longueurs (`A[0-2]{1,2}`
  pour A2 et A10). Des codes de formes différentes donnent l'alternative de
  leurs motifs. Au-delà de 100 caractères, la forme générale d'un code
  `[A-Za-z0-9._-]{1,8}`. Exemples :
  - les capacités A1 à E4 donnent `[A-E][1-4]` ;
  - RESPIRE v7 donne `[1-7]\.[0-1]\d`, plus étroit que son motif par défaut
    `\d\.\d{2}` (RG1).
  Le moteur ne se sert du motif que pour valider les codes : un motif étroit
  attrape une faute de frappe (A9 parmi A1…E4) sans rien changer au run.
- **RG13** — Un pôle dont le premier mot est, en capitales et sans accents,
  la clé d'un pôle de RESPIRE (TETE, COEUR, MAIN, AME, RACINES, CITE,
  FLAMBEAU) reçoit dans l'analyse approfondie les jurés de ce pôle de
  RESPIRE, quel que soit son numéro (S5, E5) ; deux pôles de même clé n'en
  ont plus (le moteur les numérote). L'aperçu du Markdown en avertit, et le
  modèle le dit.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Document du référentiel | Public par nature ; aucune donnée personnelle |
| Auteur | `referentiel_versions.created_by`, remis à `NULL` si le compte est purgé (son brouillon ne sert alors plus à personne) |
| Bulletins | Voir UC-EPI-02 |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/epistemiarque/ReferentielsSection.jsx`, `web/src/views/EpistemiarqueView.jsx` (section `referentiels`, lien de l'atelier) | Import, niveau, lecture, vote, publication ; modèles, Markdown et son aperçu, export (A7 à A9) |
| Front | `web/src/lib/referentiel-markdown.js` — `analyserMarkdown`, `deduireMotif`, `referentielDepuisMarkdown`, `referentielEnMarkdown`, `MODELE_MARKDOWN`, `MODELE_JSON` | Le Markdown lu en document et le document écrit en Markdown (RG11 à RG13), sans dépendance ; l'écriture passe par `fichesDuReferentiel` du moteur, la dernière vérification par ses validateurs compilés |
| Front | `web/src/views/epistemiarque/api.js` — `importReferentiel`, `listCatalogue`, `getDraft`, `getPublishedVersion` ; `web/src/api/client.js` (`ApiError.errors`) ; `web/src/lib/download-json.js` (`downloadBlob`) | Client, détail d'un refus, téléchargement de l'export |
| Front | `web/src/views/ConfigurationView.jsx` | Brouillons proposés en version |
| API | `api/src/routes/referentiel.php` — `POST /referentiel/import`, `GET /referentiels`, `GET /referentiels/{id}/versions/{semver}` (S5), listes de tous les référentiels, fork d'un autre | Orchestration, lectures publiques des versions publiées |
| Front | `web/src/data/referentiel.js` — `listPublishedReferentiels`, `loadPublishedReferentiel` ; `web/src/components/ReferentielChoice.jsx` | Menus des parcours : la base par l'API publique d'abord, l'export statique en repli (S5) |
| Domaine | `api/src/Referentiel/ReferentielRepository.php` — `importDraft`, `auNiveau`, `niveaux`, `regexDuMotif`, `validateDocument`, `controlerCode` (`CHIFFRES_SEULS`), `catalogue`, `brouillonsDe`, `findVersion`, `editableVersions` | Import, contrôles, lectures |
| Domaine | `api/src/Referentiel/ContentHash.php` | Niveaux et éléments gardés hors de l'empreinte |
| Domaine | `api/src/Twin9/ProfilPolicy.php`, `api/src/Twin9/Lancement.php`, `api/src/Twin9/ReferentielMoteur.php` | RG7, RG8, RG10 |
| Moteur | `engine/src/twin6/fiches.js` — `fichesDuReferentiel`, `fichesPourTwin6` | Fiches de Twin6 écrites depuis le document (RG10) |
| Moteur | `engine/src/referentiel-humanome.js` — `convertirHumanome`, `corpsDuHash` | Le YAML de l'Humanome en document du schéma (A6) |
| Script | `scripts/convertir-humanome.mjs` (paquet `yaml`, dépendance de développement du moteur) ; `scripts/amorcer-referentiel.php` — `AmorcageReferentiel::amorcer` | Conversion sur le poste ; amorçage hors vote, idempotent (A6) |
| API | `api/src/routes/annotations.php` | RG9 |
| Contrat | `schemas/referentiel.schema.json` (2.1.0), `engine/src/validation-compiled.js` | Format |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-EPI-05-U01 | `validateDocument`, schéma | RESPIRE se valide tel quel, même empreinte, motif par défaut ; une compétence en moins, un niveau déclaré passent ; un code lettré hors de son motif est refusé par l'intégrité (RG6) | `api/tests/UseCases/Unit/UcEpi05ImporterReferentielTest.php` |
| UC-EPI-05-U02 | `validateDocument`, `ContentHash` | 5 pôles lettrés à deux niveaux, 9 pôles valides ; un pôle numéroté `1.0` est le pôle 1 ; ordre canonique ; niveaux, descriptions et éléments hors empreinte (RG5) | idem |
| UC-EPI-05-U03 | `regexDuMotif` | Code entier, ancres, `/` dans un motif, motif illisible ; un motif qui sortirait de ses ancres (groupe fermé avant l'heure, verbe `(*…)`) n'a pas d'expression (RG2) | idem |
| UC-EPI-05-U04 | `validateDocument` | Code hors motif, élément d'un niveau non déclaré, code en double, pôles avec un trou, motif illisible ou qui sortirait de ses ancres, motif au retour arrière catastrophique (refusé une fois, limite PCRE rétablie), code hors schéma, chacun à son pointeur (RG2, RG3) | idem |
| UC-EPI-05-U05 | `auNiveau` | Niveau facette : 40 compétences, pôle hérité, niveaux tranchés ; une branche qui s'arrête plus haut refusée et nommée, un niveau vide refusé (RG4) | idem |
| UC-EPI-05-U06 | `importDraft` | Brouillon de son auteur au niveau choisi ; RESPIRE 409, identifiant 422, niveau inconnu 422, version existante 409 | idem |
| UC-EPI-05-U07 | `catalogue`, `brouillonsDe`, `findVersion`, `editableVersions` | Lectures des publiés, des brouillons d'un auteur, d'une version, des éditables de tous les référentiels | idem |
| UC-EPI-05-U08 | `createEpistemiarqueApi` | `importReferentiel` (niveau facultatif), `listCatalogue` | `web/test/usecases/unit/uc-epi-05-importer-referentiel.test.js` |
| UC-EPI-05-U09 | `apiFetch` | Un refus garde son détail par pointeur (`errors`), une autre erreur non | idem |
| UC-EPI-05-U10 | `createDraft` | La nouvelle version garde l'identifiant de sa source, quelle que soit la graphie demandée (casse, espace final) | `api/tests/UseCases/Unit/UcEpi05ImporterReferentielTest.php` |
| UC-EPI-05-U11 | `convertirHumanome` | Sur la fixture fictive à la forme Humanome, au niveau capacité : le document attendu, valide au schéma (A6) | `engine/src/referentiel-humanome.test.js` |
| UC-EPI-05-U12 | `scripts/convertir-humanome.mjs` | Écrit le document attendu avec ses avertissements, aux niveaux capacité et facette ; relancé, « déjà à jour » ; refuse d'écraser une version tirée d'un autre fichier (A6) | idem |
| UC-EPI-05-U13 | `ContentHash` | Le document converti, aux deux niveaux, a l'empreinte et l'ordre canonique du serveur (A6) | `api/tests/ReferentielAmorcageTest.php` |
| UC-EPI-05-U14 | `createEpistemiarqueApi` | `getPublishedVersion` : `GET referentiels/{id}/versions/{semver}`, segments encodés (A9) | `web/test/usecases/unit/uc-epi-05-importer-referentiel.test.js` |
| UC-EPI-05-U15 | `referentielEnMarkdown`, `referentielDepuisMarkdown` | RESPIRE 7.1.0 et 7.0.0 tels que publiés (`web/public/data/referentiel/`) : le texte est celui des fiches du moteur, couleur sous le titre, provenance en tête ; relu, mêmes pôles, compétences, provenance, même empreinte (`b246101c…`), valide au schéma ; réécrit, octet pour octet (A9) | `web/src/lib/referentiel-markdown.test.js` |
| UC-EPI-05-U16 | idem | La fixture fictive à la forme Humanome, aux niveaux capacité et facette : niveaux nommés par le commentaire, facettes un titre plus bas, aller-retour exact ; ses motifs saisis, le document est celui de la fixture hors empreinte (A9) | idem |
| UC-EPI-05-U17 | `deduireMotif` | Le motif le plus étroit : `[A-E][1-4]`, `[1-7]\.[0-1]\d` pour RESPIRE, plages disjointes, classes comptées (`\d{2}`), longueurs variables, séparateurs, formes différentes en alternative, repli au-delà de 100 caractères ; chaque code le suit ; avec le motif déduit de A1…E4, « A9 » refusé à sa ligne (RG12) | idem |
| UC-EPI-05-U18 | `analyserMarkdown`, `referentielDepuisMarkdown` | Chaque erreur à sa ligne : texte avant le premier pôle, compétence hors pôle, couleur illisible, niveau sauté, titre mal formé, doublon, code invalide (« É1 » : lettres sans accent), numérotation, pôle vide, commentaire non refermé, aucun pôle ; sous un titre refusé, pas d'autre erreur ; code hors du motif saisi, motif vide, nom de niveau vide ou en double ; un motif que JavaScript ne lit pas (« A)\|(B ») n'est qu'un avertissement ; les trois champs (E6) | idem |
| UC-EPI-05-U19 | idem | BOM, CRLF, CR, « – » et « - », « --- » facultatif : le même document ; lignes de description échappées, aller-retour exact ; plus de six niveaux de titre refusés à l'écriture (RG11) | idem |
| UC-EPI-05-U20 | `MODELE_MARKDOWN`, `MODELE_JSON`, avertissements | Le modèle Markdown se lit sans erreur ni avertissement ; le modèle JSON est le même référentiel, valide au schéma une fois l'empreinte calculée ; un pôle au premier mot d'un pôle de RESPIRE est signalé, pas deux pôles de même clé (A8, RG13) | idem |
| UC-EPI-05-U21 | `analyserMarkdown`, `referentielDepuisMarkdown` | Un code fait de chiffres seulement refusé à sa ligne, à tout niveau ; sous un titre refusé, pas d'autre erreur ; un chiffre avec une lettre, un point ou un tiret passe (RG2) | `web/src/lib/referentiel-markdown.test.js` |
| UC-EPI-05-U22 | `validateDocument` | Le même refus côté serveur, à son pointeur, pour une compétence ou un élément, même quand le motif l'admet (RG2) | `api/tests/UseCases/Unit/UcEpi05ImporterReferentielTest.php` |
| UC-EPI-05-U23 | `referentielDepuisMarkdown` | Espaces insécables (U+00A0, U+202F) dans les titres, « Pôle » et noms décomposés (NFD) : le même document ; un texte Windows-1252 lu en UTF-8 refusé une fois, à sa première ligne (RG11, E6) | `web/src/lib/referentiel-markdown.test.js` |
| UC-EPI-05-U24 | `referentielDepuisMarkdown`, `referentielEnMarkdown` | Titres indentés d'une à trois espaces (quatre : du texte), « # » de fermeture retirés ; un nom qui finit par « # », des lignes de description indentées qui se liraient comme un titre ou un séparateur : écrits échappés, relus tels quels (RG11) | idem |
| UC-EPI-05-U25 | `referentielEnMarkdown` | Une description qui commence par des blancs puis « # » ou par un commentaire (de couleur), une provenance vide : relues ; une provenance à « --> », un nom de niveau à virgule, un nom sur deux lignes ou entouré de blancs : refusés à l'export, nommés (E7) ; un nom de niveau saisi à virgule refusé | idem |
| UC-EPI-05-U26 | `referentielDepuisMarkdown` | Un motif saisi propre à PCRE (possessif, atomique, « (?i) ») : avertissement, import possible ; « \p{Lu} » lu ; vide, plus de 100 caractères, verbe, caractère de contrôle : erreurs (RG2, E6) | idem |
| UC-EPI-05-U27 | `MODELE_JSON`, `referentielDepuisMarkdown`, `deduireMotif` | `schemas/fixtures/markdown/referentiel-markdown-contrat.json` est ce que la page envoie (le modèle, la fixture à la forme Humanome relue en Markdown) et les motifs qu'elle déduit (ceux de U17) ; `ECRIRE_CONTRAT=1` le réécrit | idem |
| UC-EPI-05-U28 | `validateDocument`, `auNiveau`, `regexDuMotif` | Chaque document de ce contrat se valide à chacun de ses niveaux ; chaque motif se compile en PCRE et y retrouve ses codes | `api/tests/UseCases/Unit/UcEpi05ImporterReferentielTest.php` |
| UC-EPI-05-U29 | `convertirHumanome` | Identité (`schemaVersion`, `kind`, `id`, version), libellé, `nomCourt`, niveaux déduits avec leurs motifs, pôles et leur palette, codes des compétences et des éléments (A6) | `engine/src/referentiel-humanome.test.js` |
| UC-EPI-05-U30 | `convertirHumanome` | Descriptions composées des seules rubriques du YAML, dans un ordre fixe ; une rubrique absente n'est pas inventée ; hors du document ce que le schéma ne représente pas (A6) | idem |
| UC-EPI-05-U31 | `convertirHumanome` | La provenance (`source`) : titre, version, date, URL (sans URL : la page qui publie l'Humanome), fichier, sha256, convertisseur, niveau, licence (A6) | idem |
| UC-EPI-05-U32 | `convertirHumanome` | Compte dans le contenu et avertit d'un en-tête `structure` qui le contredit, d'une rubrique absente, d'une licence non déclarée ; aucun avertissement sur un YAML juste (A6) | idem |
| UC-EPI-05-U33 | `convertirHumanome`, `corpsDuHash` | L'empreinte est celle de l'extracteur (sha256 du JSON compact `{poles, competences}`) ; sans fonction de hachage, pas d'empreinte (A6) | idem |
| UC-EPI-05-U34 | `convertirHumanome` (niveau facette) | Les facettes deviennent les compétences, sous le pôle de leur capacité ; document attendu, valide ; niveau inconnu refusé ; une capacité sans facette refusée (A6) | idem |
| UC-EPI-05-U35 | `convertirHumanome` | Refuse ce que le schéma ou le moteur ne liraient pas (repères hors forme ou en double, version, identifiant, titres, limites, listes vides), chaque erreur à son chemin (A6) | idem |
| UC-EPI-05-U36 | `fichesDuReferentiel` | Les fiches de scan écrites depuis le document converti montrent les facettes sous leur capacité, rubriques en gras, jamais en titre (A6) | idem |
| UC-EPI-05-U37 | `scripts/convertir-humanome.mjs` | Refuse un YAML illisible, un YAML refusé, un niveau inconnu, un appel sans fichier, sans rien écrire (A6) | idem |
| UC-EPI-05-U38 | `auNiveau` | Le niveau facette du convertisseur est celui d'`auNiveau` : seule la provenance les distingue (A6) | `api/tests/ReferentielAmorcageTest.php` |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-EPI-05-F01 | Nominal, DoD | API | 5 pôles lettrés importés au niveau capacité (A1 à E4, facettes dessous), listés, votés, publiés, au catalogue ; RESPIRE servi | `api/tests/UseCases/Functional/UcEpi05ImporterReferentielTest.php` |
| UC-EPI-05-F02 | DoD | API | 9 pôles importés, votés, publiés | idem |
| UC-EPI-05-F03 | A1 | API | Niveau facette : 40 compétences sous le pôle de leur capacité | idem |
| UC-EPI-05-F04 | A2 | API | Fork d'une version d'un autre référentiel publié ; source inconnue 404 ; `referentiel` qui n'est pas un identifiant (une autre graphie) → 422, rien d'écrit | idem |
| UC-EPI-05-F05 | E1 | API | Code hors motif, motif illisible, trou, niveau non déclaré, niveau inconnu, branche qui s'arrête au-dessus du niveau → 422 avec la raison ; rien d'écrit | idem |
| UC-EPI-05-F06 | E2 | API | RESPIRE 409, version existante 409, identifiant 422, document absent 422 | idem |
| UC-EPI-05-F07 | E3, A4 | API | 401, 403, CSRF 403 ; un admin importe et soumet, ne vote pas | idem |
| UC-EPI-05-F08 | RG6, DoD | API | RESPIRE ne change pas : version, empreinte, versions publiées ; son brouillon refuse un code lettré hors de son motif, accepte six pôles | idem |
| UC-EPI-05-F09 | Nominal | IHM | Fichier à deux niveaux, niveau choisi, import, message, rechargement | `web/test/usecases/functional/uc-epi-05-importer-referentiel.test.jsx` |
| UC-EPI-05-F10 | A3, E4 | IHM | Un seul niveau, sans choix ; fichier illisible dit | idem |
| UC-EPI-05-F11 | E1 | IHM | Refus du serveur affiché avec ses pointeurs, sans rechargement ; le fichier écarté, choisi de nouveau, part corrigé | idem |
| UC-EPI-05-F12 | Étapes 4–5 | IHM | Soumettre, voter, retirer, publier une proposition adoptée ; RESPIRE absent de la section | idem |
| UC-EPI-05-F13 | A4 | IHM | Un administrateur non membre : pas de vote, publication possible | idem |
| UC-EPI-05-F14 | Étape 1 | IHM | Le lien de l'atelier ; section vide dite | idem |
| UC-EPI-05-F15 | Étape 4 | IHM | « Voir » : le document au vote, pôle par pôle, avant le vote ; « Masquer » ; un brouillon aussi | idem |
| UC-EPI-05-F16 | A6 | API | Amorçage publié sans vote puis « déjà amorcé », servi par `GET /api/referentiels` et par sa version | `api/tests/ReferentielAmorcageTest.php` |
| UC-EPI-05-F17 | A6 | IHM | Le référentiel amorcé est proposé au menu des parcours et se charge tel que la base le sert | `web/src/components/ReferentielChoice.test.jsx` |
| UC-EPI-05-F18 | A6 | API | En production, `POST /api/admin/import-referentiel` amorce un autre référentiel que RESPIRE avec les garde-fous du script : publié (note « Amorçage hors vote (S5) »), puis « unchanged », sous une autre provenance aussi ; une autre description sous la même version ou une empreinte fausse → `409`, rien d'écrit ; un identifiant invalide → `422` | `api/tests/AdminImportReferentielTest.php` |
| UC-EPI-05-F19 | A7, E6 | IHM | Un fichier `.md` remplit le texte ; aperçu (pôles, compétences, éléments, accordés) au niveau choisi ; sans les trois champs, les erreurs le disent, le bouton indisponible (`aria-disabled`) décrit par le résumé, chaque champ `aria-invalid` relié à son erreur, le focus porté sur les erreurs, rien d'envoyé ; motifs déduits affichés, l'un élargi à la main ; niveau choisi, l'aperçu le suit ; le document envoyé est celui attendu ; message, rechargement, formulaire vidé | `web/test/usecases/functional/uc-epi-05-importer-referentiel.test.jsx` |
| UC-EPI-05-F20 | E6 | IHM | Niveau sauté, pôle vide, doublon, à leur ligne, import indisponible, sans alerte ; un code hors du motif saisi, puis « Reprendre le motif déduit » ; un refus du serveur par pointeur, le texte gardé, rien rechargé | idem |
| UC-EPI-05-F21 | A8 | IHM | Les deux modèles se téléchargent (nom, contenu) ; le JSON commenté champ par champ ; l'écueil des noms de pôle de RESPIRE dit ; le modèle Markdown collé se lit sans erreur et s'importe comme le modèle JSON | idem |
| UC-EPI-05-F22 | A9, E7 | IHM | Toutes les versions publiées, RESPIRE compris, proposées ; l'export lit la version par l'API et télécharge `{id}-v{version}.md`, le texte de `referentielEnMarkdown` ; un `404` est dit, rien ne part | idem |
| UC-EPI-05-F23 | A6 | API | Un autre contenu sous la même version (description, niveaux, structure) est refusé, rien d'écrit | `api/tests/ReferentielAmorcageTest.php` |
| UC-EPI-05-F24 | A6 | API | Le même contenu sous une autre provenance est « déjà amorcé », la première gardée | idem |
| UC-EPI-05-F25 | A6 | API | Une version que l'atelier tient en brouillon n'est pas publiée par-dessus | idem |
| UC-EPI-05-F26 | A6 | API | RESPIRE, un identifiant ou un code invalides sont refusés, rien d'écrit | idem |
| UC-EPI-05-F27 | A6 | API | La ligne de commande amorce une fois, puis dit que la version est là ; un refus sort en 1 | idem |
| UC-EPI-05-F28 | A6 | IHM | La provenance d'un autre référentiel que RESPIRE (`source`, servie par `GET /api/referentiels`) s'affiche sous le menu, liée par `aria-describedby` ; rien pour RESPIRE ni sans provenance connue | `web/src/components/ReferentielChoice.test.jsx` |

### Tests existants liés (non-régression)

- `api/tests/Twin9/ConfigurationDroitsTest.php` — `testADraftServesOnlyItsAuthorsTestRuns` (RG7, la ligne de la matrice), `testOnlyAPublishedReferential`.
- UC-APP-10-F26 (`api/tests/UseCases/Functional/UcApp10AnalyseApprofondieTwin9Test.php`) — un brouillon choisi au lancement Twin9 : le run d'essai de son auteur va au bout ; en mode complet, pour un autre compte, sans version : `422` (RG7, A5).
- `api/tests/Twin9/RunsTest.php` — `testARunReadsTheReferentialItsProfileNames` (RG8 : un run sur un autre référentiel part, ses réglages portent son référentiel ; un brouillon RESPIRE sert le run d'essai de son auteur).
- `engine/src/twin6/fiches.test.js` — les fiches de Twin6 d'un autre référentiel, écrites depuis son document (RG10).
- `api/tests/Twin9/ReferentielMoteurTest.php` — le référentiel que lit le moteur (RG8, RG10) : fiches de RESPIRE prises dans la base, celles d'un autre écrites depuis son document, ordre naturel des codes ; avec le vrai moteur, un référentiel qu'il ne lit pas (des codes faits de chiffres, une version écrite telle quelle comme enregistrée avant le contrôle de RG2) est refusé au lancement.
- `api/tests/AnnotationsTest.php` — `testACartographyOfAnotherReferentialTakesItsCodes` (RG9).
- `web/src/views/ConfigurationView.test.jsx` — les brouillons proposés en version.
- `api/tests/ReferentielApiTest.php` — `testAnyPublishedReferentialIsServedByIdAndVersion` (S5) : une version publiée de tout référentiel servie à tous par son identifiant ; brouillon, proposition (même à leur auteur), identifiant ou version inconnus, autre graphie (casse, espace final) → `404` ; lecture seule (`405`) ; le catalogue ne liste que la publiée.
- `web/src/data/referentiel.test.js` (« API d'abord, export statique en repli ») ; `web/src/components/ReferentielChoice.test.jsx` ; UC-APP-02-F27, UC-APP-09-F16, UC-ETA-03-F30 — les menus des parcours lisent la base.
- UC-VIS-02-U12 à U14, U19, U20, F18 à F21 (S5, lot E) — la page publique montre un référentiel publié autre que RESPIRE, lu dans la base, avec sa provenance, par le menu ou un lien profond ; un identifiant introuvable est dit (L4).
- UC-EPI-03 (coupe de release : complétude, la structure de la dernière version publiée), UC-EPI-04 (grain document), `ReferentielApiTest`, `ReferentielImportExportTest`, `CompetenceReleaseTest`, `engine/test/usecases/unit/uc-sys-04-chaine-artefacts-derives.test.js` (validateurs compilés).
- `web/src/views/epistemiarque/ReferentielsSection.test.jsx` (S5, lot D) — le détail de la section : l'aperçu suit chaque frappe et compte au niveau choisi (une capacité et trois facettes : 1 puis 3 compétences), un nom de niveau saisi nomme le choix et le document, un nouveau fichier repart des noms et motifs de son texte et vide le champ, l'aperçu n'est ni une alerte ni un statut, un avertissement n'empêche pas l'import, un fichier illisible est dit, un export sans téléchargement possible ou trop profond est dit, rien à exporter sans référentiel publié.

### Exécuter

```sh
(cd api && vendor/bin/phpunit --filter 'UcEpi05|ReferentielAmorcageTest|AdminImportReferentielTest|testADraftServesOnlyItsAuthorsTestRuns|testARunReadsRespireOnly|testACartographyOfAnotherReferential' --testdox)
(cd engine && npx vitest run src/referentiel-humanome.test.js)
cd web && npx vitest run test/usecases/unit/uc-epi-05 test/usecases/functional/uc-epi-05 src/components/ReferentielChoice.test.jsx \
  src/lib/referentiel-markdown.test.js src/views/epistemiarque/ReferentielsSection.test.jsx
```

## Anomalies constatées

Aucune.

## Limites

- **L1** — Les pointeurs d'un refus désignent le document trié par code,
  comme pour toute écriture du grain document : le message nomme le code
  fautif.
- **L2** — L'import lit du JSON au format du schéma, ou, depuis S5 (lot D),
  un texte Markdown au format des fiches de pôle (A7, RG11) : un référentiel
  publié sous une autre forme se convertit d'abord. Le YAML de l'Humanome V18
  a son convertisseur, sur le poste (A6) ; l'atelier ne lit pas le YAML. Le
  Markdown a ses propres bornes :
  - il ne porte ni l'identifiant, ni le libellé, ni la version, saisis dans
    la page ;
  - un motif saisi n'y est pas gardé : relu, le texte redonne les motifs
    déduits (RG12) ;
  - les blancs qui entourent une description ou la provenance ne sont pas
    gardés, et un texte décomposé (NFD) revient composé (NFC) ; ce qu'il ne
    peut pas écrire est refusé à l'export (E7) ;
  - un bloc de code (« ``` ») d'une description n'y est pas reconnu : ses
    lignes « # … » se lisent comme des titres ;
  - il n'écrit pas plus de six niveaux de titre (E7) ;
  - aucun éditeur riche ni formulaire pôle par pôle, une zone de texte avec
    son aperçu.
- **L6** — L'amorçage (A6) publie sans vote : c'est un choix de Christian
  pour l'Humanome V18 (S5, Q1). En production, il passe par
  `POST /api/admin/import-referentiel`, avec les garde-fous du script pour
  tout autre identifiant que `respire` ; RESPIRE y garde l'import du
  déploiement, qui ne compare que l'empreinte et laisse les descriptions de
  côté (`docs/referentiel-humanome.md` §5).
- **L3** — Le libellé et la version suivent UC-EPI-04 AN2 : trop longs, ils
  donnent un `500` au lieu d'un `422`.
- **L4** — La page publique `#/referentiel` montre tout référentiel publié
  depuis S5, lot E (UC-VIS-02, A7 à A9) : chacun à sa dernière version
  seulement, ses compétences sans leurs éléments, les définitions en texte
  (le Markdown n'y est pas rendu). Un brouillon ou une proposition n'y
  paraissent jamais, pas même pour leur auteur. (Le moteur lit le
  référentiel du run depuis T16, la cartographie depuis T17 : la carte d'un
  run s'ouvre avec lui, et son lien « Voir dans le référentiel » mène à sa
  page.)
- **L5** — La comparaison de deux versions (`ReferentielDiff`) ignore les
  niveaux et les éléments.
