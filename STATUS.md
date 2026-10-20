# STATUS — journal de bord

## État : v1.1.0 + interface ultime de cartographie — EN PRODUCTION

Les 14 prompts P0→P13 (v1.0) puis les 11 chantiers v1.1 (D1→D11) sont appliqués, intégrés,
déployés sur https://humanome.xyz et vérifiés en ligne. Code public :
https://github.com/4nd4ny/humanome.xyz (`main` + tags `v1.0.0`/`v1.1.0`). Voir « Actions restantes
(utilisateur) » en fin de fichier.

Interface ultime de cartographie (branche `feat/ultimate-cartography`) : validée par Christian,
**déployée le 2026-10-14** (`health` → `v1.1.0-106-gc6a0231`, migrations 022 et 023) puis fusionnée
dans `main` (entrée du 2026-10-14 ci-dessous).

Chantier en cours : le moteur Twin9 v9.8 en PHP, exécuté sur le serveur (ADR-011), planifié et
développé dans le dépôt privé `4nd4ny/Twin_v9` (`docs/plan-twin9-php.md`, prompts T0 → T18, une
conversation chacun ; entrées du 2026-10-17). T0 à T17 sont fusionnés : le moteur
passe l'oracle complet dans `Twin_v9`, le profil est ici, les runs tournent sur le serveur par
tranches, par appels directs ou par lots, se lancent, se suivent, se lisent et se paient — la base
commune et la stratégie A de T8 comprises —, sur des jeux de gabarits et des référentiels de toute
structure, que le moteur lit (T16) et que la cartographie affiche (T17) ; le moteur du navigateur
est retiré (T11, fusionné le 2026-10-20). Vient ensuite T18.

Hors planning, à la demande de Christian (2026-10-20) : le référentiel dynamique — RESPIRE n'a
plus de structure imposée, et tous les parcours lisent la structure du référentiel qu'ils emploient
(#15, fusionnée le 2026-10-20) ; puis les gabarits Twin6 versionnés et les vestiges de T11 retirés
(#16, arrivée dans `main` le 2026-10-21 avec la documentation des fiches des référentiels
importés). Entrées du 2026-10-20.

## Fait

- 2026-10-20 — **Gabarits Twin6 versionnés, vestiges de T11 retirés (branche
  `feat/gabarits-twin6-et-vestiges`, posée sur `feat/referentiel-dynamique`).** Christian a
  fourni la sauvegarde de Twin6 du site déployé (« Tu pourrais également l'importer dans le dépôt
  GitHub pour la prochaine fois ? »), puis demandé de retirer les six vestiges notés à T11 :
  « Peux-tu les supprimer et nettoyer le code de ce qui ne sert plus ? ». Deux commits.
  - Twin6 : les trois gabarits publics (`0-mega-prompt`, `1-scan-pole`, `2-kairos-final`) sont
    versionnés dans `scripts/data/twin6/`, tirés de sa sauvegarde ; le paquet statique qu'ils
    rebâtissent est identique à l'octet au paquet servi, et le paquet publié 1.0.0 inchangé
    (UC-SYS-04 AN-2 corrigée : un clone neuf construit le front et la release). Ils répondent à la
    question que laissait la branche précédente : ils écrivaient RESPIRE v7 en toutes lettres
    (« un des 7 pôles du référentiel RESPIRE », « les 61 verdicts », codes `X.YY`, quatre codes
    d'exemple). `twin6-ouverte` 1.1.0 en fait des variables que le moteur rend depuis le
    référentiel employé (`engine/src/twin6/variables.js` : `REFERENTIEL`, `NB_POLES`,
    `NB_COMPETENCES`, `FORMAT_CODE` comme `Referentiel::formatCode` du moteur Twin9,
    `PRECISION_FORMAT_CODE`, `CODES_EXEMPLE`) ; rendus pour RESPIRE v7, ses prompts sont ceux de
    1.0.0 à l'octet. `#/twin6-ouverte` sert 1.1.0 ; le méga-prompt, que le moteur n'exécute pas,
    reste le protocole manuel de RESPIRE v7.
  - Vestiges : retirés l'interrupteur `enabled` et le `pipeline` qu'écrivait l'import, les étages
    des modèles de l'offre (formulaire de supervision et son style compris), le rythme
    `appels_par_minute`, le magasin `twin9_fiches` avec `FicheStore`, la route `POST
    /api/admin/generate-fiches`, l'étape du déploiement qui l'appelait et `FICHES_FORCE`,
    `LeakFilter::redact`, la promotion dans `/meta` et `fetchTwin6Offer`. L'import n'envoie plus
    que les gabarits et la structure du référentiel ; il ignore les réglages et les fiches d'un
    ancien script. Rien n'est effacé de la base : la lecture ignore ces clés, que l'enregistrement
    suivant de la supervision retire du réglage stocké, et plus rien ne lit `twin9_fiches`. Les
    effacer est une contraction, qu'ADR-008 réserve à une release stabilisée (« Dettes
    techniques »). Les runs lisent leurs réglages dans leur profil (T12) et leurs fiches dans la
    base (T16).
  - Conséquences à connaître : (1) les appels payants de la cartographie ouverte ne sont plus
    limités par minute — la dépense reste bornée par le solde prépayé (UC-APP-09 E10 retiré), mais
    plus rien ne borne le débit d'un compte crédité (voir « À décider ») ;
    (2) un premier déploiement passe d'une traite, et une fiche entérinée atteint le run Twin9
    suivant sans déploiement ; (3) un `deploy.mjs` d'avant ce commit s'arrêterait sur le `404` de
    `generate-fiches` : déployer depuis le dépôt à jour ; (4) envoyées au `PUT` de supervision, ces
    clés sont refusées (`422 « Clé de configuration inconnue : … »`, « Modèle … : clé inconnue
    etages ») ; (5) la page Configuration lit la promotion dans `/api/twin9/configuration`, comme
    avant.
  - Tests : la parité des fiches passe par le bloc que lit le moteur (`ReferentielMoteur`) au lieu
    du magasin ; UC-EPI-03-F20 vérifie qu'une fiche entérinée est celle du bloc, sans déploiement ;
    UC-SYS-02 perd F12 et F13 avec la route, F18 montre le refus de Twin9 (`503`) après AN-6, et le
    test de l'outil (F21) s'arrête sur un seed en échec au lieu du garde-fou ; la route partie
    répond `404`.
  - Documentation : UC-ADM-05, UC-SYS-02 (étape 7, A4, E6 barrés ; AN-1 sans objet, AN-2 ne vise
    plus que le seed), UC-EPI-03, UC-PRO-08, UC-APP-09, note de révision d'ADR-010, catalogue. La
    ligne « Total » du catalogue, en retard depuis avant `feat/referentiel-dynamique` (944, 1111,
    205), est recalculée sur ses lignes : 956 tests unitaires, 1124 fonctionnels, 198 anomalies.
  - Revue indépendante (un agent neuf, sur toute la branche) : un point bloquant, corrigé —
    UC-APP-10-U08 envoyait encore des étages à la supervision, refusés désormais (`422`). Corrigé
    aussi : la migration prévue pour effacer `twin9_fiches` et les trois clés était une
    contraction, qu'ADR-008 interdit tant que la release précédente peut revenir par `rollback`
    (elle lit encore l'interrupteur, les fiches et le rythme) — non livrée, notée en dette ; deux
    références périmées (`fetchTwin9Meta`, `stage-api.sh`) ; UC-SYS-02-U08 vérifie tous les pôles,
    comme il l'annonce ; le rendu des variables Twin6 se fait en une passe (une valeur n'est jamais
    relue).
  - À décider (Christian) : le rythme `appels_par_minute` bornait aussi l'abus. Sans lui, un compte
    crédité peut lancer des appels Twin6 en parallèle sur la clé de la plateforme ; chacun garde un
    processus PHP du mutualisé jusqu'à la réponse et consomme les quotas Anthropic de l'instance,
    que partagent les runs Twin9 à clé d'instance. Le parcours normal (8 appels l'un après l'autre)
    n'approchait pas les 30 par minute. S'il le veut, une limite fixe dans le code, sans réglage
    (comme celle des routes PayPal), le remplacerait.
  - En attente de Christian : le script d'import extrait encore la structure du référentiel par le
    Python de `Twin_v9` (`aurora.referentiel`) ; le parseur JavaScript des fiches de pôle
    (`parsePole`) pourrait le remplacer. **À faire avant le déploiement** : valider la version
    par défaut du paquet (UC-ADM-03). La production n'en a pas : `GET /api/prompt-packages/default`
    y sert le plus récent paquet publié, `twin6-ouverte` 1.0.0 (relevé le 2026-10-20, UC-PRO-01
    AN-2) ; le déploiement importe les paquets dans l'ordre de leurs noms, et ce serait ensuite
    `twin6-ouverte` 1.1.0.
  - Fusion : #16 visait `feat/referentiel-dynamique`, sa base, que la fusion de #15 n'avait pas
    supprimée ; elle y a été fusionnée. Une PR de `docs/fiches-referentiels` l'amène dans `main`,
    avec une mise à jour d'UC-EPI-05 que Christian a demandée : un référentiel importé n'a pas de
    fiches à rédiger ni à générer — Twin6 et Twin9 les écrivent depuis son document (RG10).
  - Vérifié, sur l'arbre du commit : PHP `OK (1703 tests, 17825 assertions)` (Twin_v9 présent,
    PHP 8.3 local) ; front 2740 tests verts, ses 258 fichiers chargés ; moteur 413 ; bout en bout
    19/19 (le scénario promptologue rejoué après la remise à zéro documentée des compteurs de la
    démo, épuisés par les runs du jour : `503 « Démo épuisée »`) ; `check-publiable` OK ; catalogue
    recompté sur les fichiers de tests ; paquet publié `twin6-ouverte` 1.0.0 identique à l'octet
    (sha256 `732f18d7…`).

- 2026-10-20 — **Référentiel dynamique : RESPIRE n'a plus de structure imposée (branche
  `feat/referentiel-dynamique`, posée sur T11).** Christian a demandé pourquoi une journée de
  RESPIRE à six pôles était refusée, et s'il faudrait tout recoder pour un référentiel de six
  pôles ; puis : « Corrige directement sans autre. » Le verrou venait de T15 et T17 : les schémas
  figeaient RESPIRE à 7 pôles, 61 compétences, codes `P.NN`. Contrat : `docs/contrats.md` §11.
  - Lecture retenue : RESPIRE redevient un référentiel comme un autre (un pôle au moins, sans
    plafond ; 12 n'est que la limite de lisibilité de l'affichage). Le garde-fou contre un pôle
    perdu demeure, contre la version de référentiel que le document cartographie : la
    conformité (`engine/src/conformite.js`, `api/src/Referentiel/Conformite.php`, jumelles) — ses
    pôles chacun une fois, ses codes dans leur pôle, son identité. Chaque parcours lit la structure
    dans le JSON du référentiel qu'il emploie ; la cartographie standard, Twin6 et la masse offrent
    le choix d'un référentiel publié, RESPIRE par défaut.
  - Fondation : schémas déverrouillés (`referentiel` 2.1.0), conformité, chargement et choix d'un
    référentiel publié, fiches Twin6 de tout référentiel, nom et codes d'exemple des prompts,
    nombre d'appels par référentiel ; la coupe d'une release depuis le modèle atomique garde la
    structure de la dernière version publiée (UC-EPI-04 AN1 corrigée en partie).
  - Cartographie standard, Essayer, banc, bac à sable, rétrospective : prompts et validations lus
    dans le référentiel (la sonde à sept clones disparaît) ; choix du référentiel dans l'assistant.
    Paquet par défaut : 1.0.0 inchangée à l'octet (même empreinte, reconstruite depuis le commit
    précédent), et 1.1.0 dont les gabarits d'extraction lisent le référentiel (`referentiel_nom`,
    `nb_poles`, `code_exemple_1`, `code_exemple_2`) ; pour RESPIRE v7, ses prompts sont ceux de
    1.0.0 à l'octet ; le paquet embarqué passe à 1.1.0.
  - Masse : le run fige le référentiel publié choisi (`referentielId`, `referentielVersion`) ; un
    paquet qui ne sait pas le cartographier est refusé (1.0.0 ne sert que RESPIRE à sept pôles) ;
    le worker, le runner et la fusion d'un membre valident par la conformité.
  - Twin6 et Twin9 : un scan par pôle du référentiel choisi ; fiches du paquet pour les pôles
    qu'elles décrivent, sinon écrites depuis le document ; `ReferentielMoteur` écrit depuis le
    document ce que la base ne décrit pas d'une version de RESPIRE ; un jeu de gabarits d'avant T16
    ne sert RESPIRE que dans la structure de ses fichiers de pôle.
  - Relecture, visionneuses, importeurs, atelier : la version relue est celle stockée, sinon la
    plus récente version publiée du référentiel nommé à laquelle le document est conforme ; une
    annotation nomme un code de cette version, une révision lui est conforme ; les visionneuses
    lisent le référentiel que nomme le document ; `validate-corpus.mjs` vérifie aussi la
    conformité du corpus à RESPIRE v7.
  - Changements visibles, à connaître : (1) plus strict, RESPIRE compris — l'ancien schéma ne
    vérifiait que la forme d'un code (`[1-7].NN`) ; un code inconnu de la version, ou d'un autre
    pôle, fait désormais échouer l'appel d'extraction puis son nouvel essai, et un kairos qui en
    relie un est refait puis ramené à `null` ; (2) l'atelier épistémiarque affiche les noms de
    pôle du RESPIRE publié (« TETE — … », sans accent) au lieu d'une constante (« TÊTE ») ;
    (3) l'identifiant d'un run standard porte le référentiel, et le paquet embarqué passe à
    1.1.0 : un run commencé avant ne se reprend pas ; (4) là où aucune version par défaut du
    paquet n'est réglée, `GET /api/prompt-packages/default` rendra 1.1.0 après l'import du
    déploiement ; (5) une base sans RESPIRE publié refuse annotations et révisions (`422`) ;
    (6) le détail du cartographe porte `referentiel: {id, version}` ; (7) une base qui n'a pas
    importé 1.1.0 refuse la copie serveur d'une cartographie standard (`422` « Paquet de prompts
    publié introuvable ») : le déploiement l'importe (`deploy.mjs`, `build/prompt-packages`), un
    environnement de développement existant la régénère et l'importe (`docs/tests-e2e.md`) ;
    (8) la recherche de `#/referentiel` dit « Code ou nom — ex. 1.01 » (sans « pensée
    critique »).
  - Anomalies corrigées en passant : UC-PRO-07 AN-2, UC-PRO-06 AN-2, UC-APP-09 AN3 (« X / 61 »
    quel que soit le référentiel), UC-VIS-01 AN1, UC-CAR-06 AN17.
  - Hors périmètre, noté (règle 6) : le modèle atomique des compétences reste celui de RESPIRE
    (une version d'une autre structure s'édite comme un document, UC-EPI-04) ; les textes qui
    décrivent RESPIRE v7 (accueil, aide, formation) ; l'outillage de corpus et de parité ;
    `referentielCompatible` des paquets reste déclaratif ; une version de RESPIRE à dix pôles ou
    plus déclare ses niveaux (motif par défaut `\d\.\d{2}`). **À vérifier par Christian** : les
    gabarits scan-pôle et kairos de Twin6 ne sont pas versionnés (UC-SYS-04 AN-2) ; s'ils écrivent
    « RESPIRE » ou « 7 pôles » en toutes lettres, un run Twin6 sur un autre référentiel garde ces
    mots, même si la fiche jointe et le nombre d'appels suivent le référentiel. (Réglé le
    2026-10-20 : entrée « Gabarits Twin6 versionnés… ».)
  - Méthode : une fondation, puis quatre lots en parallèle (standard et banc ; masse ; Twin6 et
    Twin9 ; relecture et visionneuses), relus un par un, puis réunis en un seul commit : pris
    seuls, les commits de lot laissaient rouges les tests d'un lot pas encore commité.
  - Revue indépendante (un agent neuf, sur toute la branche) : aucun point bloquant ; RESPIRE v7
    vérifié identique à l'octet (prompts, paquet 1.0.0, documents). Corrigé : (1) le bac à sable
    se fiait au marqueur `perimetre` que le code d'un paquet pose sur sa journée — une journée
    qui avait perdu des pôles passait en se disant partielle ; il l'ôte et valide contre le
    référentiel qu'il a transmis (UC-PRO-07-U18) ; (2) la conformité d'une fusion admettait un
    sous-ensemble de domaines — une révision de fusion pouvait perdre un pôle, ce que l'ancien
    schéma interdisait pour RESPIRE : une fusion compte désormais tous les pôles de sa version
    (UC-CAR-04-F05) ; (3) sans version connue, les visionneuses, le partage et l'archive lisaient la
    dernière version publiée, la relecture la plus récente à laquelle le document est conforme :
    même règle partout (une journée de RESPIRE v7 reste lue avec la v7 quand une v8 d'une autre
    structure paraît) ; (4) parité JS ↔ PHP durcie hors schéma (numéros de pôle canoniques,
    listes, messages), cas jumeaux ajoutés ; (5) l'empreinte de 1.0.0 est figée par un test ;
    (6) refus non testés couverts (version non textuelle au lancement de masse, version figée
    illisible au dépôt d'un runner, révision sans référentiel chargé) ; documentation et
    commentaires périmés. Laissé à décider (Christian) : (a) un seul code inconnu dans le kairos
    fait perdre toute la synthèse (après un nouvel essai) ; on pourrait plutôt écarter les codes
    inconnus des émergences ; (b) l'assistant enregistre la version de paquet choisie (1.0.0
    publiée comprise) alors que le moteur rend toujours les prompts de l'embarqué (limite v1
    notée dans UC-APP-02) ; (c) l'atelier épistémiarque nomme les pôles d'après la dernière
    version publiée de RESPIRE, non d'après le modèle atomique ; (d) la fusion d'un membre dont
    les journées viennent de plusieurs référentiels échoue (UC-ETA-04 A5) avec un message qui
    parle des pôles.
  - Relecture finale, après la revue : la relecture vérifiait une révision comme une journée
    partielle — le schéma sans le marqueur `perimetre`, puis une conformité qui s'y fiait —,
    quand le serveur la vérifie entière et refuse ce marqueur. Elle fait désormais comme lui
    (test de `RelectureSection`) ; rien ne passait pour autant, le serveur refusant l'envoi.
  - Vérifié, sur l'arbre du commit : PHP `OK (1709 tests, 17986 assertions)` (Twin_v9 présent,
    PHP 8.3 local) ; front 2731 tests verts — un fichier ne se charge pas, faute des gabarits Twin6
    non versionnés (`twin6-prompt-package.test.js`, UC-SYS-04 AN-2), comme avant la branche ;
    moteur 403 ; bout en bout 19/19 ; `check-publiable` OK ; `validate-corpus.mjs` 69 OK sur 69 ;
    paquet 1.0.0 identique à l'octet (sha256 `4bd550fc…`, figé par `DefaultPackageParityTest`).

- 2026-10-20 — **Moteur Twin9 en PHP, T11 : retirer le moteur du navigateur (branche
  `feat/twin9-t11-retrait` ; `Twin_v9` : `feat/twin9-t11-retrait`).** L'analyse approfondie tourne
  sur le serveur depuis T9 ; ce qui servait encore le moteur du navigateur part, et l'entrée de
  navigation revient. T17 (#13 ; `Twin_v9` #18) a été fusionné le 2026-10-20.
  - Dans le front : l'adaptateur d'une carte Twin9 (`mapper.js`) et le parseur des fiches de pôle
    (`parsePole`, qu'importent `extract-fiches.mjs` et donc `generate-fiches.mjs`) passent de
    `engine/src/twin9/` à `web/src/lib/twin9/`, avec `pyText`, `pyStr` et le `pyRound` qu'il importe,
    et leurs tests. De `referentiel.js` ne restent que `parsePole`, la classe `Pole` qu'il rend et
    les noms des pôles : `permutation`, `loadReferentiel`, `polesFromStructure`, `allCompetences` et
    `ficheComplete` servaient le moteur du navigateur et partent avec lui, comme `stableHash` et
    `md5`, que seule `permutation` appelait. Le cas réel de l'adaptateur lit la carte du scénario
    cloud de l'oracle de `Twin_v9` au lieu du vecteur du portage JavaScript. Ces tests tournent
    désormais dans la suite front, locale ; la CI moteur garde `parsePole` par UC-SYS-04-F10, qui
    exécute `extract-fiches.mjs`. `check-publiable` refuse tout `engine/src/twin9/`.
  - Retirés : `POST /api/twin9/appel`, son test (`Twin9AppelTest`), `makeServerBackend`,
    `FicheStore::injecter` ; la route répond désormais comme une route inconnue (`Twin9MetaTest`).
    `GET /api/twin9/meta` ne sert plus que ce que lisent la page du crédit et la cartographie
    ouverte : offre Twin6, promotion, packs, PayPal, structure du référentiel, solde, clé privée ;
    plus les étapes, l'offre Twin9, l'interrupteur ni le pipeline (`Twin9Config::publicView`). Le
    reste du moteur du navigateur avait quitté ce dépôt le 2026-10-17 ; il quitte aussi `Twin_v9`
    (code, vecteurs et leurs générateurs, `gen-oracles.sh`, `run-helpers.js`), dont les
    spécifications `docs/twin9/` deviennent celles du moteur PHP.
  - Rétablie : l'entrée « Analyse approfondie » (premium) de « Ma cartographie », masquée « jusqu'au
    lot 3 » le 2026-10-17.
  - Cas d'utilisation : UC-APP-10 réécrit pour l'analyse sur le serveur (lancement, aperçu,
    admission, suivi, annulation, reprise, plafonds, visibilité, clé personnelle, autre
    référentiel, mode essai), avec ses tests sur le moteur factice : 13 unitaires et 19
    fonctionnels (7 et 15 sur l'API, 6 et 4 sur l'interface) au lieu des 45 et 28 du moteur du
    navigateur ; ses sept anomalies quittent l'index, avec le code qu'elles décrivaient. UC-ADM-05
    vérifie chaque réglage par son effet sur les runs (estimation, profils) au lieu du proxy ;
    UC-PRO-08 et UC-APP-09 suivent ; UC-APP-11, UC-CPT-04, UC-APP-01, UC-APP-03, UC-APP-04,
    UC-APP-06, UC-SYS-04 et le catalogue mis à jour. ADR-010 révisé (§1, §2) ;
    `docs/contrats.md`, `docs/strategie-tests.md`, `docs/securite-checklist.md`, `INSTALL.md`,
    `CLAUDE.md`.
  - Vestiges laissés en place, à décider (règle 6) : les réglages `enabled` et `pipeline`, que
    l'import écrit et que plus rien ne lit ; les étages des modèles de l'offre, que la supervision
    édite et que plus rien ne lit (un profil ne demande à un modèle qu'un prix) ; le rythme
    `appels_par_minute`, qui ne borne plus que la cartographie ouverte ; le magasin des fiches
    `twin9_fiches`, que l'import écrit et que le déploiement régénère, qu'aucun run ne lit (T16) ;
    `LeakFilter::redact`, que ses seuls tests appellent ; `twin9_cle_perso_ouverte` dans `/meta`,
    que lit `fetchTwin6Offer` sans qu'aucune vue s'en serve. Les retirer touche l'import, la
    supervision, le déploiement et leurs cas d'utilisation (UC-PRO-08, UC-ADM-05, UC-SYS-02).
    (Retirés le 2026-10-20, à la demande de Christian : entrée « Gabarits Twin6 versionnés… ».)
  - Limite notée : la page de l'analyse (`#/twin9`) n'a pas de titre de niveau 1, comme
    Configuration.
  - Régression de T17, réparée dans un commit à part : les scénarios bout en bout de la
    cartographie chargent `carto/core/model.js` sous Node, par leurs fixtures ; il importe
    `referential.js`, où T17 a ajouté l'import de `poleColor` par l'alias `@engine` de Vite, que
    Node ne résout pas — la suite e2e s'arrêtait avant son premier test. Il l'importe par son
    chemin ; seule la suite e2e, locale, le garde.
  - Revue indépendante (un agent neuf, sur les deux branches) : aucun point bloquant ; ses
    corrections sont faites — ADR-010 et UC-PRO-08 disaient qu'aucun nom de gabarit ne sort plus,
    or l'attestation d'un run nomme les siens pour son propriétaire et le cartographe lié ; les
    tests front de l'oracle lisent `TWIN_V9_DIR` ; UC-APP-10-F14 ne dépend plus de la durée d'une
    tranche ; des commentaires et des dates.
  - Vérifié : suites moteur (362 verts), front (2 681 verts ; `twin6-prompt-package.test.js` ne se
    charge pas sans le paquet Twin6, comme avant T11) et PHP (1 670 verts, aucun sauté, avec
    `TWIN_V9_DIR`) ; `check-publiable` vert ; bout en bout, les 19 scénarios passent, moteur
    factice pour Twin9 — deux relancés seuls : `twin9-run`, que le quota local d'inscriptions
    (dix par heure) arrêtait après des passages précédents, et `parcours-promptologue`, derrière
    un routeur (ci-dessous). Reste à confirmer, ici impossible : `npm run build`, dont le
    `prebuild` s'arrête, comme avant T11, à `build-twin6-package.mjs`, faute des gabarits Twin6
    (`web/public/data/`, non versionné) ; `generate-fiches`, `build-viewer` et `vite build`
    passent.
  - Constaté, hors T11 (règle 6, noté) : `php -S localhost:8080 -t api/public`, la commande
    d'INSTALL.md et de `docs/tests-e2e.md`, prend pour un fichier toute URL dont le dernier
    segment porte un point (`…/1.0.0`, une version de paquet) et répond 404 sans passer par
    `index.php` : `parcours-promptologue` échoue au diff. Derrière un routeur (`php -S
    localhost:8080 -t api/public api/public/index.php`), comme derrière Apache en production, il
    passe.

- 2026-10-20 — **Moteur Twin9 en PHP, T17 : plusieurs référentiels, la cartographie (branche
  `feat/twin9-t17-cartographie`).** La carte d'un run s'ouvre dans la cartographie avec son
  référentiel, RESPIRE ou celui d'une autre structure (`docs/contrats.md` §10). T8 (base commune et
  stratégie A, #11) et T16 (#12 ; `Twin_v9` #17) ont été fusionnés le 2026-10-20.
  - Formats : un document `cartographie-jour` ou `cartographie-merge` d'un autre référentiel le
    nomme (`referentiel`, facultatif) et compte alors 1 à N pôles, aux codes de ce référentiel (le
    `$defs/code` du schéma `referentiel`) ; sans nom, RESPIRE garde sa structure (7 pôles, codes
    `P.NN`), comme dans le schéma `referentiel` : les validations de l'extraction, de la masse, du
    banc et de la relecture gardent leur garantie. Le code d'une compétence (`competence`)
    s'élargit de même. Validateurs compilés régénérés ; chaque changement est noté dans
    `docs/contrats.md` §10. Un document de RESPIRE reste valide tel quel, et sa fusion identique à
    l'octet (parité du document : 100 %).
  - Couleurs et marques : `POLE_PALETTE` (moteur) prolonge les 7 couleurs de RESPIRE de 5 autres,
    choisies et validées avec le script de la skill dataviz telles que l'interface les affiche, dans
    ses 5 palettes et ses 2 thèmes, sur les voisins du soleil de 8 à 12 pôles (bouclage compris) ;
    un pôle sans couleur déclarée prend celle de son rang (il prenait un gris unique : les pôles des
    référentiels de test se confondaient). Les marques des distinctions renforcées passent de 8 à 12
    (quatre motifs nouveaux dans `Sun.jsx`). Un pôle lettré (`num: "A"`) d'un document venu
    d'ailleurs reçoit son numéro d'ordre ; ceux de la plateforme sont déjà numérotés (T15).
  - Serveur : les résultats d'un run portent son référentiel (`Resultats::referentiel`) — les pôles et
    compétences que son moteur a lus, gardés dans ses réglages, avec les couleurs de leur version ;
    ni fiche, ni préambule, ni description.
  - Front : « Ouvrir dans la cartographie » vaut pour tout référentiel (la restriction de T16 est
    levée) ; le document `twin9-run` porte le référentiel du run, complété des descriptions du
    référentiel publié de même identifiant (RESPIRE) ; le jeu neuf l'adopte ; son titre le nomme
    (`Twin9 · <journal> · <libellé>`).
  - Moteur factice : son tribunal juge la première compétence de chaque pôle du référentiel du run
    (1.01 seule sans référentiel), pour que chaque pôle ait son secteur.
  - Tests : schémas (moteur et PHP), adaptateur Twin9 (5 pôles lettrés, 9 pôles, schéma strict),
    référentiel et importeur de l'interface, cartographie (`Referentiels.test.jsx` : la carte
    lettrée, celle à 9 pôles, leurs couleurs et leurs motifs, les deux jeux qui coexistent), page du
    run, résultats (`RunsTest` : le référentiel porté ; deux cartes sur un même portfolio, qui ne
    partagent ni carte, ni mémoire, ni copie du profil). Recette de bout en bout
    `web/e2e/twin9-referentiels.e2e.js` : RESPIRE, le référentiel lettré et celui à 9 pôles sur un
    même portfolio — chacun ses deux journées à instruire, sa carte avec les noms de ses pôles, sa
    mémoire, son attestation —, trois jeux qui coexistent (`docs/tests-e2e.md`, « T17 »).
  - Revue indépendante (un agent qui n'avait pas écrit le lot), sans point bloquant ; corrigés avec
    leurs tests : le dépôt d'une journée par la masse et la révision d'une cartographie acceptaient
    un document qui nommait un autre référentiel que le leur, ce qui le sortait des contrôles de
    RESPIRE (désormais `422`) ; un identifiant de référentiel s'écrit en minuscules (« RESPIRE »
    n'en nomme aucun) ; la synthèse évolutive d'un pôle se rangeait sous le début du code de sa
    première compétence (« 21 » au pôle 2 donnait le pôle 21 : désormais les numéros du
    référentiel du run) ; les radars comptaient « sept pôles » ; un numéro de pôle « 3.5 » ou nul
    passait pour une lettre ou le pôle 0 ; un référentiel du run illisible était ignoré sans le
    dire ; le nom court d'un pôle lettré est sa lettre. Documentés : la couleur d'un pôle est celle
    que sa version a dans la base (un brouillon retouché donne la sienne) ; en deçà de 8 pôles, le
    bouclage des couleurs n'est validé qu'à 3, 5 et 7 (`docs/contrats.md` §10).
  - Reste hors T17 : la page publique `#/referentiel` ne montre que RESPIRE.

- 2026-10-20 — **Moteur Twin9 en PHP, T16 : plusieurs référentiels, le moteur (branche
  `feat/twin9-t16-moteur`, sur celle de T8 ; `Twin_v9` : `feat/twin9-t16-moteur`).** Le moteur lit
  le référentiel du run, tiré de la base, et non plus celui de la v9.8 (`docs/contrats.md` §8.8).
  Plan validé par Christian le 2026-10-20 : « Pas de modification du nombre de jurés dans le
  Twin_V9. Ok avec tout le reste du plan pour T16. »
  - Moteur (`Twin_v9`) : `Referentiel::depuisBloc` lit le référentiel que donne la plateforme
    (`{id, version, label, motif, poles: [{num, nom, entete, competences: [{code, nom, fiche}]}]}`) et
    en tire ce que la v9.8 écrivait de RESPIRE : noms et clés des pôles (profil ipsatif, jury), nombre
    de compétences, forme des codes, nom du référentiel, ordre des codes. Il refuse un pôle sans
    compétence, des pôles qui ne se numérotent pas de 1 à N, un code hors du motif, en double ou fait
    de chiffres seulement (PHP en ferait un nombre). Sans référentiel, il lit RESPIRE dans les
    fichiers de pôle du jeu, comme l'oracle. Le jury garde ses sièges : un pôle de RESPIRE, reconnu à
    sa clé, assoit les spécialistes de la v9.8 ; un autre, le « Spécialiste du pôle ».
  - Gabarits : `php/protocole/` copie les 22 gabarits de la v9.8, sans les fichiers de pôle, avec
    `{$NB_COMPETENCES}`, `{$FORMAT_CODE}`, `{$REFERENTIEL}` et `{$LISTE_COMPETENCES}` là où elle
    écrivait « 61 », « X.YY », « RESPIRE » et `{$LISTE_61}` ; l'original reste intact pour l'oracle.
    Pour RESPIRE, la copie rend le texte de la v9.8, et RESPIRE donné comme le donne la plateforme,
    à travers elle, rejoue les dix-sept scénarios de l'oracle, appels, prompts et sorties, octet pour
    octet.
  - Fournisseur simulé minimal (`php/tests/Simule.php`) : la plus petite réponse valide de chaque
    étape. Un référentiel à 5 pôles lettrés (A1 à E4) et un autre à 9 pôles traversent journées,
    tribunal (cinq sièges, dont le spécialiste du pôle), second ressort, Arpenteur et fusion, sans
    « RESPIRE », « 61 » ni « X.YY » dans leurs prompts (DoD).
  - Plateforme : `Twin9\ReferentielMoteur` tire le référentiel de la base à la version que fige le
    profil — RESPIRE avec les fiches de `FicheGenerator` (le vrai moteur les lit comme les fichiers
    de pôle de la v9.8, testé), un autre avec des fiches écrites depuis son document, codes dans leur
    ordre naturel — et le met dans les réglages du moteur ; son empreinte entre dans celle des
    réglages (la mémoire), l'attestation et la signature des évaluations ; le filtre de fuite indexe
    ses fiches (résultats et export) ; la prévision compte le plus grand pôle. Le refus de T15 est
    levé ; un référentiel que le moteur ne lit pas est refusé au lancement (`422`, le code fautif
    nommé) ; RESPIRE sans ses fiches dans la base, `503` (INSTALL.md §3 les sème désormais).
  - Import : il lit `php/protocole` ; complet (tous les gabarits que nomme le contrat des
    variables), il remplace le jeu v9.8 : un gabarit qu'il ne porte pas en sort, archivé (les
    fichiers de pôle) ; partiel, il n'ôte rien. Il répond `{imported, retires}`. L'appel du
    navigateur reçoit les nouvelles variables aux valeurs de RESPIRE ; le contrat des variables les
    nomme.
  - Front : « Ouvrir dans la cartographie » reste à RESPIRE jusqu'à T17 ; pour un autre
    référentiel, la page du run le dit.
  - Revue indépendante (un agent qui n'avait pas écrit le lot), ses constats corrigés chacun avec
    un test qui échouait sans lui : un moteur d'avant T16 ignorait le référentiel et, avec un jeu qui
    garde ses fichiers de pôle, faisait payer un run de RESPIRE attesté sur un autre référentiel
    (désormais `503`, le moteur reconnu à `ReferentielInvalide`) ; un jeu d'avant T16 — le jeu v9.8
    pas encore réimporté, une copie faite avant — demandait les codes de RESPIRE sur un autre
    référentiel (désormais `422`, RESPIRE seul servi) ; le nom de RESPIRE dans les prompts suivait son
    libellé (« RESPIRE v8.0.0-rc.1 », « RESPIRE 2027 ») et l'aurait fait sortir de la v9.8 ; un import
    partiel ôtait des gabarits du protocole, et un nom écrit à une autre casse pouvait ôter ce qu'il
    venait d'écrire ; un code de RESPIRE sans fiche donnait le `503` de l'instance (désormais `422`,
    le code nommé) ; la lentille du « Spécialiste du pôle » n'entrait dans aucune empreinte des
    journées ; les journées de la mémoire d'une carte n'étaient filtrées que contre les fiches du
    dernier run ; la parité de la plateforme rejouait encore l'oracle avec les fichiers de pôle
    (désormais avec `php/protocole` et RESPIRE tiré de la base, l'ancien chemin gardé pour les runs
    d'avant T16). Reste documenté (§8.8) : ce que la publication accepte sans que le moteur le lise.
  - Seconde revue indépendante, sur ces corrections, sans point bloquant ; corrigés avec leurs
    tests : un import partiel ôtait les fichiers de pôle d'un jeu d'avant T16, qui ne se disait plus
    tel (désormais seul un import complet remplace le jeu) ; le remède proposé pour une copie d'avant
    T16 ne valait pas quand le jeu v9.8 lui-même précède T16 ; la page des analyses proposait de
    lancer avec un moteur d'avant T16 (désormais non, les runs déjà lancés avançant toujours) ; le
    contrat des variables se lisait après l'écriture des gabarits ; le message d'une erreur imprévue
    du moteur parlait encore de fiches du jeu ; les clés des pôles de RESPIRE suivaient les titres
    de leurs préambules, que la base garde (désormais celles de la v9.8). Sans objet, le schéma
    gardant à toute version de RESPIRE 7 pôles et 61 codes « X.YY » : une version de RESPIRE à
    62 compétences servie par un jeu d'avant T16, ou un pôle 8 de RESPIRE sans préambule dans la
    base.
  - Textes : `docs/contrats.md` (§8 à §8.7, nouveau §8.8, §9), UC-PRO-08 (A4, limites), UC-EPI-05
    (RG8, L4), `docs/autorisations.md`, `docs/tests-e2e.md`, INSTALL.md, STATUS ; `Twin_v9` : le
    plan.
  - Tests : dans `Twin_v9`, `ReferentielsTest` (la copie rend l'original ; RESPIRE par le bloc ;
    autres structures ; douze refus ; sièges du jury), `SimuleTest` (la DoD), `OracleTest` (la copie
    et le bloc rejouent l'oracle), `PlateformeTest` ; ici, `ReferentielMoteurTest` (RESPIRE pris dans
    la base et lu par le vrai moteur comme les fichiers de pôle, fiches écrites depuis le document,
    ordre naturel, `503`, un code sans fiche, empreinte, et, avec le vrai moteur, le refus au
    lancement), `RunsTest` (un run sur 9 pôles, son attestation ; une fiche récitée, expurgée, même
    gardée par la mémoire sous une version ancienne ; un moteur ou un jeu d'avant T16 refusés),
    `PurgeExportTest` (de même à l'export), `AppelsDirectsTest` (l'empreinte), `Twin9ProtocoleTest`
    et UC-PRO-08 (complet, l'import remplace le jeu ; partiel, il n'ôte rien), `JeuxGabaritsTest` (le
    jeu de `php/protocole`), `PariteTest` (l'oracle par les tranches, comme la plateforme le lance
    depuis T16, et un run d'avant), `Twin9View.test`, bout en bout `twin9-run.e2e.js` (les fiches
    semées).
  - Déploiement (T18) : la plateforme de T16 demande un `Twin_v9` d'après T16 sur le serveur (sans
    lui, le lancement répond `503`), puis l'import du jeu de T16 et RESPIRE avec ses fiches dans la
    base (`seed-competences`).
  - Limites (§8.8) : les fiches de RESPIRE sont celles que la base publie au lancement, non celles
    de l'instantané de la version figée ; la mémoire d'une carte est rangée par référentiel, non par
    version : une journée gardée sous une version ancienne entre telle quelle dans la fusion ;
    l'import de T16 change l'empreinte des réglages, et la mémoire relira chaque journée une fois ;
    sans évaluation, la référence ignore la taille des fiches d'un autre référentiel ; un référentiel
    que le moteur ne lit pas (codes faits de chiffres, pôle sans compétence, nom fait d'espaces) se
    publie, et n'est refusé qu'au lancement ; la lentille du spécialiste du pôle a l'empreinte de son
    texte, pas une version déclarée.
  - Idées, non codées (règle 6) : lire les fiches de RESPIRE dans l'instantané de la version figée
    (`referentiel_snapshot_competences`) ; vérifier à la publication qu'un référentiel se lit par le
    moteur ; ranger la mémoire d'une carte par version de référentiel, ou écarter à la fusion les
    codes qui l'ont quittée (avec T17).

- 2026-10-19 — **Moteur Twin9 en PHP, T8 : la base commune et la stratégie A, choisies par Christian
  (branche `feat/twin9-t8-strategie-a`, sur celle de T15 ; `Twin_v9` : `feat/twin9-t8-vagues`, sur
  celle de T10).** Par lots, chaque vague d'appels attend un lot entier : il faut en faire le moins
  possible, sans épuiser le crédit d'une personne avant qu'une carte soit finie (`docs/contrats.md`
  §8.3 et §8.7).
  - Moteur (`Twin_v9`) : la fusion lance ensemble ce que la v9.8 enchaîne sans que les appels se
    lisent (faisceaux du second ressort, relectures avant le rapporteur, condensés et retours aux
    sources de l'Arpenteur) ; la passe qui finit les joue dans l'ordre de la v9.8, et l'oracle reste
    identique à l'octet. PLANT-01 passe de 286 vagues à 27, de 310 à 30 avec l'Arpenteur (un test
    le fixe). L'aperçu du moteur donne la taille de chaque journée, et les journées que la mémoire
    garde au-delà de celles qu'un run prend (la carte est additive : la fusion les relit).
  - Par lots, toutes les journées du run sont de front ; `parallelisme.journees` ne règle plus que
    la voie directe.
  - Historique des évaluations (migration 030, `Twin9\Evaluations`) : un run fini laisse, sans
    aucun contenu, la personne évaluée, la taille en Ko de chaque journée de sa carte avec ce qu'elle
    a coûté (rien pour une journée reprise de la mémoire ; marquée quand un appel a échoué), le coût
    de la fusion, le plus grand pire cas réservé par un appel d'une journée et de la fusion, le coût
    final, la durée, et les réglages du profil : modèles et performance, paramètres de l'algorithme,
    jeu de gabarits. La suppression du compte anonymise la ligne (SET NULL), qui reste pour les
    prévisions ; l'export du compte la porte avec son run. Un échec de la consignation n'empêche
    jamais le run de finir.
  - Prévision : une journée coûte une part fixe (les fiches de son pôle, dans chaque prompt de
    lecture) et une part par Ko, ni l'une ni l'autre négative, une fusion de même par les Ko de sa
    carte : la droite des moindres carrés des 200 dernières évaluations de mêmes réglages, converties
    à la voie et à la marge du run. Entre les tailles observées, au plus bas et au plus haut, les
    écarts extrêmes ; au-delà, ce qu'un tel coût permet (sous la plus petite taille, au plus ce
    qu'elle a coûté ; au-dessus de la plus grande, au plus autant au Ko). À défaut, le vrai run de
    PLANT-01. Elle remplace la moyenne par journée des runs du même profil.
  - Admission (stratégie A) : un lancement prend les premières journées que le crédit — moins ce que
    les autres analyses en cours de la personne peuvent encore en dépenser — ou le budget tient, au
    coût le plus haut, avec la fusion de leur carte et de quoi réserver le pire cas d'un appel (T10) ;
    les autres attendent une prochaine analyse, une journée changée restant d'ici là dans sa version
    déjà évaluée. Un profil qui relit tout (`rescan`, sans mémoire) prend tout ou rien. Le run garde
    la fusion en réserve, et ce qui lui est accordé (`engagement`) : un appel d'une journée n'entame
    jamais la réserve, ni aucun appel ce que les autres runs en cours peuvent encore dépenser
    (`crédit insuffisant (fusion réservée)`, `budget atteint (fusion réservée)`, `crédit insuffisant
    (engagé par vos autres analyses)`, qui se reprennent comme les arrêts par le crédit ou le budget).
    Refusé, le lancement dit ce qu'il faudrait ; la page le dit d'avance et ne laisse pas lancer. Un
    lancement à la fois par personne. La page de lancement dit la fourchette et les journées admises,
    la page du run son admission.
  - Deux revues indépendantes du lot (des agents qui ne l'avaient pas écrit). La première, quatorze
    points, corrigés chacun avec un test qui échouait sans lui : la fusion d'une carte coupée
    sous-estimée (droite par l'origine) ; la carte relue par la fusion comptée sans les journées de
    la mémoire ; les autres runs en cours ignorés ; un arrêt par la réserve sans issue sur la page ;
    les pires cas réservés avant chaque appel absents de l'admission ; une seule taille mal reconnue
    par arrondi ; une signature sans les paramètres de l'algorithme ni le jeu de gabarits ; les
    profils qui relisent tout ; les journées en panne comptées comme des journées ; toutes les
    évaluations relues ; un échec de consignation qui bloquait le run ; les textes « observé » sans
    observation ; le bouton de lancement actif sur un refus ; le cache de mémoire de l'oracle nourri
    par le test par passes. La seconde, sur ces corrections : ce que les autres runs peuvent encore
    dépenser, figé en début de tranche quand le crédit était lu à chaque appel (désormais lus
    ensemble, à chaque appel) ; le pire cas d'un appel qui peut dépasser celui observé ou la
    journée de référence (désormais au moins ce que disent ses réglages) ; une reprise sans
    admission ; la signature, qui ne voyait ni le contenu du jeu de gabarits ni la version du
    référentiel ; la source « observé » quand une part venait de la référence ; une perte de
    transaction pendant la consignation. La suite complète a ajouté la couverture d'export de
    l'audit RGPD.
  - Textes : `docs/contrats.md` (§7.1, §8.3, §8.5, §8.7), registre RGPD (§13, §13 bis) et
    vérification RGPD, schéma d'archive (description), `docs/tests-e2e.md`, STATUS. UC-APP-10 décrit
    encore le moteur du navigateur (T11) : il n'est pas repris ici.
  - Tests : `EvaluationsTest` (consignation sans contenu ni identifiant de journée, carte additive,
    panne, pires cas, anonymisation, échec de consignation ; droites, écarts, au-delà des tailles
    observées, une seule taille, conversion par lots et marge, 200 dernières, signature),
    `ApercuTest` (estimation et sa source, carte gardée par la mémoire, admission, refus et ses
    trois formes, budget, journées changées en attente, autres analyses en cours), `CoutsTest` (la
    réserve, en direct et par lots ; l'engagement d'un autre run, lu avec le crédit dans la même
    tranche ; la reprise admise de nouveau), `LotsTest` (toutes les journées de front),
    `PurgeExportTest`, `RgpdAuditTest`, `Twin9View.test`, bout en bout `twin9-run.e2e.js` ; dans
    `Twin_v9`, l'oracle, le compte des vagues et l'aperçu.
  - À valider : la base légale proposée pour l'historique, l'intérêt légitime (registre §13 bis) ; le
    coût le plus haut observé pour admettre (plutôt que la moyenne), et la place gardée pour le pire
    cas d'un appel ; l'anonymisation plutôt que l'effacement à la suppression du compte ; la droite
    (part fixe et part par Ko) et ses bornes ; ce que l'historique garde en plus de la liste demandée
    (coût de chaque journée et de la fusion, pires cas, paramètres de l'algorithme et jeu de
    gabarits), pour tracer ces droites et comparer ce qui est comparable.

- 2026-10-19 — **Moteur Twin9 en PHP, T15 : plusieurs référentiels, la gouvernance (branche
  `feat/twin9-t15-referentiels`, sur celle de T14 ; `Twin_v9` : `feat/twin9-t15-referentiels`).**
  La gouvernance accepte un référentiel de toute structure : l'épistémiarque l'importe et choisit le
  niveau qui tient lieu de compétence ; un code hors du motif de son niveau est refusé ; un brouillon
  sert aux runs d'essai de son auteur (`docs/contrats.md` §9, UC-EPI-05). Plan validé par Christian
  avec ses trois choix : le lancement refuse un autre référentiel que RESPIRE jusqu'à T16, une section
  d'atelier, des codes de 8 caractères au plus. Le référentiel alternatif consulté
  (respire.school/referentiel, l'Humanome V18 : 5 pôles A à E, 20 capacités, 64 facettes) a guidé le
  format ; rien de lui n'entre dans le dépôt, les tests prennent deux référentiels fictifs.
  - Schéma `referentiel` 2.0.0 : pôles numérotés de 1 à N, `niveaux` déclarés avec le motif de leurs
    codes (sans eux, le niveau et le motif de RESPIRE), `elements` des niveaux plus fins, descriptions
    en Markdown ; l'empreinte ne change pas de définition. RESPIRE garde sa structure par une clause du
    schéma (7 pôles, 61 compétences « P.NN », aucun niveau déclaré) : tout chemin vers une de ses
    versions la respecte, la coupe de sa release comprise. Validateurs compilés régénérés.
  - Import (`POST /api/referentiel/import`, épistémiarque ou admin) : validé tel quel, lu au niveau
    choisi (`ReferentielRepository::auNiveau`), validé de nouveau, brouillon de l'importateur ; RESPIRE
    refusé (`409`). Le cycle du grain document s'ouvre à tous les référentiels (listes, fork avec
    `referentiel`) ; `GET /api/referentiels` rend les publiés.
  - Profils et runs : `ProfilPolicy` admet le brouillon de son auteur en mode essai (tant qu'il est
    épistémiarque ou admin), la page Configuration le propose ; le lancement et l'aperçu refusent un
    autre référentiel que RESPIRE tant que le moteur lit les fiches de son jeu de gabarits (T16).
  - Annotations : le code d'une annotation appartient au référentiel que la cartographie désigne ;
    sans référentiel désigné, la forme de RESPIRE.
  - Front : section « Autres référentiels » de l'atelier épistémiarque (`#/epistemiarque/referentiels` :
    importer un fichier et choisir son niveau, lire le document (« Voir »), soumettre, voter, retirer,
    publier ; un refus montre ses pointeurs et écarte le fichier) ; brouillons proposés dans la page
    Configuration ; aide de l'atelier.
  - Revue indépendante du lot, ses constats corrigés avec leurs tests : un motif reste entre ses
    ancres (il compile seul, aucun verbe `(*…)`) et s'évalue sous une limite de retour arrière (un
    motif catastrophique coûtait une minute de calcul pour 2 000 codes) ; une branche qui s'arrête
    au-dessus du niveau choisi est refusée et nommée au lieu de disparaître ; un fork prend un
    `referentiel` de la forme d'un identifiant et garde celui de sa source (la colonne ignore la casse :
    « Respire » aurait classé une version de RESPIRE à part) ; un pôle numéroté `1.0` ne donne plus un
    `500` ; le document au vote se lit avant le vote.
  - Textes : UC-EPI-05 (nouveau), UC-EPI-03 et UC-EPI-04, le catalogue des cas et `SUMMARY.md`,
    `docs/autorisations.md` (P4, « Configuration Twin9 », runs), `docs/contrats.md` (§1, §3, §9).
  - Tests : UC-EPI-05 (U01-U10, F01-F15, dont la DoD : un référentiel à 5 pôles lettrés, A1 à E4,
    s'enregistre, se vote et se publie, un autre à 9 pôles aussi ; RESPIRE ne change pas),
    `ConfigurationDroitsTest` (la ligne de la matrice), `RunsTest` (le refus du lancement),
    `AnnotationsTest`, `ConfigurationView.test`.
  - À trancher (T8, voie par lots) : mesuré sur l'oracle de PLANT-01 (10 journées, toutes de front),
    un run fait 286 vagues d'appels, dont 15 pour les journées et 271 pour la fusion, que la v9.8
    enchaîne un appel après l'autre (25 faisceaux du second ressort, 21 relectures) ; par lots,
    chaque vague attend un lot. Base commune proposée : lancer ensemble les appels indépendants de la
    fusion (aucun prompt ne change) : 27 vagues. Puis A, toutes les journées de front avec une réserve
    de crédit pour finir la carte, ou B, des lots chronologiques de journées, une carte à chaque lot.
    Regrouper ou découper les journées changerait le protocole sans raccourcir le run. Tranché par
    Christian le 2026-10-19 : la base commune et A (entrée T8 ci-dessus).
  - Pas encore : le moteur (T16) et la cartographie (T17) ne lisent que RESPIRE ; la page publique du
    référentiel ne montre que lui ; l'import lit du JSON au format du schéma (le Markdown de la V18 se
    convertit d'abord) ; UC-EPI-04 AN2 (libellé ou version trop longs : `500`) vaut aussi à l'import ;
    l'attestation d'un run désigne son référentiel par `id@version`, et un brouillon peut changer
    ensuite : quand le moteur lira ce référentiel (T16), elle devra aussi en garder l'empreinte.

- 2026-10-19 — **Moteur Twin9 en PHP, T14 : les jeux de gabarits (branche
  `feat/twin9-t14-template-sets`, sur celle de T10 ; `Twin_v9` : `feat/twin9-t14-template-sets`).** Un
  promptologue de l'atelier copie le jeu v9.8, qui reste en lecture seule, édite sa copie avec les
  versions et le retour arrière de l'atelier, et la choisit dans son profil ; l'administrateur fixe le
  jeu par défaut (`docs/contrats.md` §8.6). Sans réponse à « Qui voit les gabarits ? », D2
  s'applique : l'atelier reste aux comptes à la fois administrateur et promptologue
  (`TemplateSets::ATELIER`).
  - Migration 029 : `twin9_jeux` (une copie, son nom, son auteur), `twin9_jeux_gabarits`,
    `twin9_jeux_versions` ; le jeu v9.8 reste dans `twin9_protocole`, que seul l'import écrit.
  - `ProtocoleRepository` travaille sur un jeu (le jeu v9.8 par défaut) ; `TemplateSets` copie le
    jeu v9.8 (chaque gabarit tel quel, sans son histoire), réserve l'écriture d'une copie à son auteur
    et à ses gabarits, dit les jeux qu'un compte choisit (le jeu v9.8, le jeu par défaut, ses copies
    tant qu'il est de l'atelier) et garde le jeu par défaut (`twin9_gabarits_defaut`).
  - Une variable qu'aucune étape ne fournit est refusée à l'enregistrement : le contrat des
    variables, repris de `Twin_v9`, complété de `MA_POSITION_R1` et `LISTE_61` que le moteur fournit,
    entre dans `schemas/twin9-protocole-contrat.json` (livré avec la release, `stage-api.sh`) ;
    s'y ajoutent les variables de l'original v9.8 du gabarit.
  - Routes : l'atelier passe par jeu, `/api/twin9/admin/jeux/{jeu}/protocole…` et `…/tester`, et
    copie par `POST /api/twin9/admin/jeux` (admin ∧ promptologue) ; l'administrateur lit les jeux
    (`GET /api/twin9/admin/jeux`, sans contenu) et fixe le jeu par défaut (`PUT
    /api/twin9/admin/jeux/defaut`). Les anciennes routes `/api/twin9/admin/protocole…` partent.
  - Profils et runs : `ProfilPolicy` admet un jeu que le propriétaire peut choisir (un profil resté
    sur un jeu qui ne lui est plus proposé est refusé, comme une clé personnelle fermée) ; le profil
    par défaut prend le jeu par défaut ; un run prend le jeu de son profil comme instantané, son
    attestation le nomme, et chaque jeu a sa mémoire de carte. Le lancement refuse (`422`) une copie
    à qui manque un gabarit du jeu v9.8 et un jeu que le moteur ne lit pas (fiche mal formée), au
    lieu d'une erreur du serveur.
  - Front : `#/twin9-atelier` choisit le jeu (le vôtre, en lecture seule pour le jeu v9.8 et la copie
    d'un autre), copie le jeu v9.8 sous un nom ; `#/admin/twin9` fixe le jeu par défaut ; aide de
    l'atelier.
  - Textes : UC-PRO-08 et UC-ADM-05 (scénarios, règles, tests), `docs/autorisations.md` (matrice
    « Configuration Twin9 », P12, AD-D2), `docs/contrats.md` (§7, §8.4, §8.6), registre RGPD et
    `docs/rgpd-verification.md` (migration 029), `rgpd-audit`.
  - Tests : `JeuxGabaritsTest` (dont la DoD : un mot changé dans une copie se retrouve dans le prompt
    rendu, moteur factice et vrai moteur de `TWIN_V9_DIR` ; le jeu v9.8 ne change jamais ; les copies
    incomplètes ou illisibles refusées au lancement ; le contrat couvre les gabarits v9.8),
    `Twin9ProtocoleTest` et UC-PRO-08 réécrits par jeu (U12-U14, F23-F24), `ConfigurationDroitsTest`
    (les jeux d'un profil, dont un ancien jeu par défaut), UC-ADM-05 (U14, F18), `RgpdAuditTest`,
    UC-SYS-03-U07 ; front : `Twin9AtelierView.test` (dont une réponse tardive d'un jeu quitté),
    `ConfigurationView.test` (un jeu qui n'est plus proposé).

- 2026-10-19 — **Moteur Twin9 en PHP, T10 : coûts, clés, relance, purge (branche
  `feat/twin9-t10-costs`, sur celle de T9 ; `Twin_v9` : `feat/twin9-t10-costs`).** Chaque appel d'un
  run paie son coût réel, son pire cas réservé avant de partir ; un run ne dépasse jamais son budget
  et s'arrête à ses plafonds, sa carte incomplète, pour reprendre ; la page dit avant de lancer ce
  que le run instruira et coûtera ; le compte emporte ses runs, ses lots chez Anthropic compris, et
  son export les contient (`docs/contrats.md` §8.5).
  - Migration 028 : `twin9_appels.reserve_microusd`, `twin9_runs.debut_at` et `actif_s`, table
    `twin9_lots_a_effacer`.
  - Coûts (`Twin9\RunCosts`) : la grille couvre Haiku 5.5 (0,10 $ / 0,50 $ le million, 0,50 $ /
    2,50 $ au-delà de 100 000 jetons de prompt, `palier_long`) et Sonnet 5.5 (2 $ / 10 $) ; le coût
    d'un appel est l'usage rendu, à moitié prix par lots, marge comprise avec la clé de l'instance,
    sans elle avec la clé de la personne (`Twin9Config::coutMicrousd`). Avant chaque envoi, direct ou
    par lot, le pire cas (octets du prompt, budget de sortie) est réservé et, avec la clé de
    l'instance, débité du crédit dans la transaction qui écrit l'appel (`CreditService` rejoint une
    transaction ouverte) ; la réponse le solde (réconciliation par modèle), un run arrêté, annulé ou
    fini rend le reste. Un profil dont un modèle n'a pas de prix est refusé (`ProfilPolicy`).
  - Plafonds : budget et durée de la copie du profil. Ce qu'un run a engagé ne dépasse jamais son
    budget ; un appel qui le dépasserait ne part pas, le run s'arrête une fois rien dehors (`echoue`,
    « budget atteint : carte incomplète ») ; de même pour sa durée, comptée depuis son lancement ou
    sa dernière reprise, et pour le crédit. `POST …/reprendre` accepte un nouveau budget. Le suivi
    donne le coût réel et les plafonds ; les compteurs, les journées instruites et la durée active.
  - Avant de lancer (`POST /api/twin9/runs/apercu`, `Lancement::apercu`) : les journées nouvelles ou
    changées depuis la mémoire de la carte, par le moteur (`Plateforme::apercu`, dans `Twin_v9` et le
    moteur factice), et le coût et la durée estimés : la moyenne par journée des runs finis du même
    profil et du même mode, à défaut le vrai run de PLANT-01 (0,1344 $, 94 s, en essai) fois les
    pôles du référentiel. Rien n'est gardé.
  - Une clé par run : celle de l'instance ou celle de la personne (T7) ; aucune n'est écrite dans les
    tables du moteur, le grand-livre ni l'export (test).
  - Purge (`DELETE /api/auth/account`, `Twin9\RunPurge`) : ses lots chez Anthropic de sa propre clé
    annulés et supprimés avant que la clé parte ; ceux de la clé de l'instance confiés au tick
    (`twin9_lots_a_effacer`, l'identifiant Anthropic seul). Export (`GET /api/twin9/mes-analyses`,
    `Twin9\RunExport`) : runs, journaux, sorties et mémoire des cartes, filtrés, dans l'archive de
    compte (`analysesTwin9`, schéma 1.2.0, validateurs recompilés).
  - Front : `#/twin9` montre, l'accord donné, les journées à instruire, le coût et la durée estimés,
    les plafonds du profil, et prévient si le crédit ne suffit pas ; la page du run montre le coût,
    reprend sous un nouveau budget, renvoie vers la recharge, et ouvre la carte incomplète d'un run
    arrêté dans la cartographie, qui la dit incomplète (`twin9-run` : `incomplete`).
  - Textes : `docs/contrats.md` §8.5 et §4 (point 13), `docs/autorisations.md`,
    `docs/rgpd-verification.md`, le registre RGPD (§11, §13), la politique de confidentialité,
    l'aide de la rubrique, `docs/tests-e2e.md`.
  - Tests : `CoutsTest` (dont la DoD : plafonné à 1 $, le run s'arrête avant, et le dit ; aucune
    clé écrite), `ApercuTest` (dont : une journée ajoutée n'instruit qu'elle), `PurgeExportTest`
    (dont : après la purge, aucune ligne du compte dans les tables du moteur) ; les comptes des
    autres tests de runs ont du crédit ; moteur : `PlateformeTest::testThePreviewSaysWhichDaysARunInstructs` ;
    front : `Twin9View.test`, `twin9-run.test`, `archive.test` ; bout en bout : `twin9-run.e2e.js`.

- 2026-10-19 — **Moteur Twin9 en PHP, T9 : lancer, suivre, lire (branche `feat/twin9-t9-runs`, sur
  celle de T13).** Un run Twin9 se lance depuis le front, se suit, s'annule, se reprend et s'ouvre dans
  la cartographie, délibérations comprises (`docs/contrats.md` §8.1 et §8.4).
  - Migration 027 : `twin9_runs` reçoit `attestation`, `visibilite` (`privee`, `cartographe`) et
    `accord_at`.
  - Lancer (`Twin9\Lancement`, `POST /api/twin9/runs`) : un profil de la personne, ou celui de la
    v9.8, revalidé et admis, copié avec la version de son référentiel figée ; le jeu de gabarits
    vivant comme instantané ; l'accord exigé à chaque lancement. Les réglages du moteur viennent de
    cette copie seule (`MoteurReglages` : paramètres d'algorithme, backends aux modèles des étages,
    collège développé comme le fait `twin9.py`, graines et sels compris) : tirés du profil v9.8, ils
    rejouent le scénario `02-cloud` de l'oracle appel par appel (`PariteTest`). L'attestation garde le
    profil, les versions du jeu de gabarits (`ProtocoleRepository::jeu`), le référentiel et le commit
    du moteur (`EngineLoader::commit` : la tête de `TWIN_V9_DIR`, sinon son fichier `COMMIT`).
  - Suivre (`GET /api/twin9/runs/{id}`) : appels par état, journées finies, fusion, lots chez
    Anthropic, et en mots ce qui retient le run ; annuler, reprendre, visibilité. La page du run fait
    avancer les runs de son propriétaire par `POST /api/twin9/runs/avancer`, une tranche sous le
    verrou du tick (`Tick` : `twin9Utilisateur` ; `Twin9Slice`, `Twin9Lots::menage` et
    `RunRepository::aAvancer` filtrent par utilisateur), jamais avec le jeton du tick.
  - Lire (`Twin9\Resultats`, `GET /api/twin9/runs/{id}/resultats`) : les sorties et, pour les
    journées reprises de la mémoire, leurs cartes du jour, sans leur texte ; tout passe le filtre de
    fuite contre le jeu de gabarits du run (`LeakFilter::indexer`/`expurger`), le compte des
    expurgations à l'audit. Lus par le propriétaire, et par le cartographe lié si le run lui est
    visible ; l'administrateur n'a que des compteurs (`GET /api/twin9/admin/runs`).
  - Front : `#/twin9` (Twin9View) lance (profil, portfolio de la bibliothèque ou fichier, accord,
    visibilité), liste ses analyses ; `#/twin9/<id>` suit le run, le fait avancer, l'annule, le
    reprend, et l'ouvre dans la cartographie (`twin9RunFiles`, document `twin9-run`). L'interface en
    fait une journée par carte du jour, chaque verdict avec son dossier (`twin9Dossier` dans
    `engine/src/twin9/mapper.js` ; `carto/core/importers/twin9-run.js`) : traces et extraits (le
    surlignage marche), et, dans sa journée, le jury, le président, le débat et les pièces du greffier
    (`RunJury` montre tout juré et tous les temps du débat). Pas d'entrée de navigation avant le lot 3.
  - Textes : l'accord de Twin9View, la politique de confidentialité, le registre RGPD (§2, §8, §13),
    l'aide de la rubrique, la matrice « Runs Twin9 » de `docs/autorisations.md`.
  - Tests : `RunsTest` (9, moteur factice, chaque ligne de la matrice), `MoteurReglagesTest`,
    `PariteTest::testTheV98ProfileDrivesTheEngine`, `EngineLoaderTest` (commit) ; front :
    `Twin9View.test`, `twin9-run.test` (dont les sorties réelles de l'oracle, sautées sans Twin_v9),
    `Jury.twin9.test`, `mapper.test` (`twin9Dossier`). Bout en bout : `web/e2e/twin9-run.e2e.js`
    (moteur factice, Anthropic simulé par `WORKER_PROVIDER=mock`, `docs/tests-e2e.md`). Le moteur
    factice écrit désormais des sorties à la forme de la v9.8 là où la plateforme les lit.

- 2026-10-19 — **Moteur Twin9 en PHP, T13 : la page de configuration et les droits (branche
  `feat/twin9-t13-configuration`, sur celle de T8).** Chacun règle les profils de ses runs Twin9 sur
  `#/configuration`.
  - La page (`ConfigurationView`, `views/configuration/profilSchema.js`) se construit depuis
    `schemas/twin9-profil.schema.json`, sans liste de réglages tenue à côté : une section repliée
    par partie du profil, qui compte ses réglages modifiés ; un interrupteur pour le mode essai ;
    chaque réglage commandé selon son type (choix, case, nombre, texte, tables, collège des
    lecteurs) ; une valeur modifiée marquée, sa valeur par défaut au survol ; l'aide du schéma
    paraît quand on entre dans le réglage. On y ouvre ses profils, on en crée un depuis le profil
    v9.8, on l'enregistre, le copie ou le supprime (après confirmation) ; le serveur valide et la
    page affiche son message. Pas d'entrée de navigation tant que Twin9 reste masqué (lot 3) : la
    page s'ouvre par son adresse.
  - Routes (`routes/twin9-configuration.php`) : `GET /api/twin9/configuration` (ses profils, le
    profil v9.8, les référentiels publiés et leurs versions, les jeux de gabarits, sa clé
    personnelle : ouverte, enregistrée) ; `POST /api/twin9/profils` ; `GET`, `PUT`, `DELETE
    /api/twin9/profils/{id}`, à son propriétaire seul (404 pour tout autre).
  - `ProfilPolicy` admet les choix d'un profil : un référentiel publié et, s'il est donné, une de
    ses versions publiées ; un jeu de gabarits connu (« v9.8 » jusqu'à T14) ; la clé personnelle
    là où l'administrateur l'a ouverte. `ProfilRepository` refuse la réflexion coupée aux efforts
    `xhigh` et `max`, que l'API refuse, en nommant l'étape (`CallSettings::parEtape`, dont
    `combinaisons` dérive désormais) — la dette notée en T7 est levée ; il garde aux nombres la
    forme d'un flottant (`1.0`), que la v9.8 lit et que le navigateur ne distingue pas.
  - Droits : la matrice « Configuration Twin9 » de `docs/autorisations.md`, une ligne par droit,
    chacune testée dans `ConfigurationDroitsTest` (13 tests, dont le coffre de la clé personnelle
    et la clé de l'instance, qui ne passe jamais par l'interface). Front : `ConfigurationView.test`
    (9 tests ; l'un énumère les réglages du schéma, plus de 150, et n'en trouve aucun hors de la
    page). `rgpd-audit` : `twin9_profils` est désormais servi (`via`).

- 2026-10-19 — **Moteur Twin9 en PHP, T8 : la voie par lots (branche `feat/twin9-t8-batches`).** Un
  run réglé « lots » envoie ses appels par l'API Message Batches d'Anthropic, à moitié prix
  (ADR-011 §3) ; `docs/contrats.md` §8.3 décrit le protocole.
  - Migration 026 : `twin9_lots`, les lots d'un run (identifiant Anthropic, état, clé employée,
    instance ou personnelle, jamais la clé elle-même, nombre de requêtes, taille, dates) ;
    `twin9_appels` reçoit `lot_id` et `custom_id`.
  - `Worker/Twin9Lots.php` : les appels qu'attend une passe partent en lots bornés à une dizaine de
    mégaoctets. Chaque requête porte les `params` de l'appel direct et un `custom_id` tiré de
    l'identifiant de l'appel (32 caractères), gardé au journal. Avant le premier lot, un appel
    direct minimal part par combinaison de réglages du profil (`CallSettings::combinaisons`) : un
    refus arrête le run avec la raison de l'API. Une tranche suivante relève le lot fini : les
    réponses entrent au journal, au coût de l'usage à moitié prix (`coutMicrousd(…, parLots:
    true)`) ; les requêtes en erreur ou expirées repartent (l'erreur compte une tentative,
    l'expiration non) ; le lot est supprimé chez Anthropic. Un lot perdu se retrouve dans la liste
    des lots de la clé, puis par ses `custom_id` ; introuvable au bout de dix minutes, ses appels
    repartent. Les lots d'un run qui n'est plus en cours sont annulés, puis supprimés.
  - `Twin9\AnthropicBatches`, derrière l'interface `BatchApi`, s'en tient à l'adresse verrouillée
    et ne suit jamais le `results_url` que rend l'API. Entre deux lots, un run n'est pas rejoué et
    ne compte pas parmi les N runs du tick.
  - Tests : `LotsTest` (moteur factice et fournisseur de lots simulé : mêmes requêtes qu'en direct,
    un lot soumis puis relevé, tué entre deux lots sans rien payer deux fois, lot perdu retrouvé,
    erreurs et expirations, réglages refusés, annulation, bornes et coût), `AnthropicBatchesTest`.
    `PariteTest` rejoue `16-test-mode` par lots, tué deux fois, à l'oracle près (8 tests, 90 s).
  - **Constat** : la v9.8 enchaîne ses appels en vagues, et par lots chaque vague est un
    aller-retour chez Anthropic. Un run de dix journées (`12-jury-random`) en compte quelque 150,
    dont plus d'une centaine d'un seul appel ; une quinzaine de vagues de dix appels ou plus portent
    plus de 90 % des appels. Un run par lots dure donc quelque 150 fois le délai d'un lot et
    l'intervalle du déclencheur. Deux pistes, non codées : envoyer en direct les petites vagues, le
    prix des lots restant sur l'essentiel des appels ; vérifier dans `Twin_v9` si les tribunaux d'une
    même journée, que la v9.8 enchaîne, peuvent partir de front sans changer un prompt.

- 2026-10-19 — **Moteur Twin9 en PHP, T7 : l'exécution par tranches (branche `feat/twin9-t7-slices`,
  avec `feat/twin9-t7-platform-entry` dans `Twin_v9`).** Les runs Twin9 tournent sur le serveur, par
  tranches de 45 s au plus (ADR-011 §2) ; le contrat entre la plateforme et le moteur est au §8 de
  `docs/contrats.md`.
  - Migration 025 : `twin9_cartes` (la mémoire d'une carte : utilisateur, portfolio, référentiel, jeu
    de gabarits) et `twin9_memoire` ; `twin9_runs` (copie des réglages — le profil et les réglages de la
    v9.8 —, portfolio, instantané du jeu de gabarits, horloge figée, compteurs) ; `twin9_appels`, le
    journal, écrit avant et après chaque appel, jamais le prompt ni la clé ; `twin9_resultats`.
    Réglages, portfolio, gabarits, mémoire, réponses et sorties sont compressés (zlib). Un run fini ne
    garde du journal que ses compteurs ; la purge du compte emporte tout (cascade, registre §13, que
    `scripts/rgpd-audit.php` connaît ; l'export du compte attend T10).
  - Le tick (`Worker/Tick.php`, `Worker/Twin9Slice.php`) avance d'abord au plus N runs Twin9, puis la
    masse avec le temps qui reste ; `runs_par_tick` (défaut 3) et `secondes_par_tranche` (défaut 40,
    45 au plus) rejoignent `Twin9Config`. Chaque passe rejoue le run ; ses appels partent ensemble,
    chaque réponse s'inscrit à son retour, une nouvelle passe suit dès qu'une place se libère. Une
    journée finie entre aussitôt en mémoire, sauf panne, et les passes suivantes la reprennent ; seules
    les journées les plus anciennes envoient leurs appels (`parallelisme.journees`) ; un seul run à la
    fois par carte. **Écart au planning** : un faisceau du second ressort ne se relit pas en cours de
    run — la « chose jugée » de la v9.8 ne marque pas les graines comme un premier jugement, la carte
    changerait ; il se rejoue depuis le journal, sans qu'aucun appel reparte.
  - Appels directs : `AnthropicCaller::requete()` et `lire()`, `Twin9\DirectCalls` sur
    `Llm\CurlMultiHttpClient` (`curl_multi`). Réglages d'appel par étape (`CallSettings`) ; réflexion
    coupée `disabled`, ou `between_tools` pour Sonnet 5.5 ; jamais de température. Les trois tentatives
    de la v9.8 dans la tranche ; un 429 ou 529 attend son `Retry-After` sans compter de tentative, un
    429 sans (plafond de dépense) met le run en attente ; un refus du modèle est une panne ; modèle
    servi, jetons et coût relevés ; la clé est lue à chaque envoi (`RunKey`). Un appel coupé par la fin
    de la tranche repart à la suivante, et compte comme une tentative s'il a eu la moitié de la tranche.
    `appeler()`, des routes du moteur du navigateur, prend la même forme de réflexion.
  - L'empreinte des réglages (réglages d'appel, troncatures, gabarits et fiches hors relectures) est
    rangée dans chaque entrée de la mémoire à côté de celle de la v9.8 : d'autres réglages d'appel
    relisent les journées.
  - Route `worker-tick` : un jeton à elle, `WORKER_TICK_TOKEN` (en-tête `X-Worker-Tick-Token`), qui
    n'ouvre aucune autre route ; `X-Migrate-Token` l'ouvre toujours ; `ignore_user_abort` ; elle relève
    la limite de temps de PHP là où il y en a une, sans jamais en poser une (en CLI, elle aurait tué la
    suite de tests une minute plus tard).
    `scripts/worker.php` charge le moteur. `symfony/polyfill-intl-normalizer` entre dans
    `api/composer.json` : le moteur appelle `Normalizer`, et OVH n'a peut-être pas `intl`.
  - Moteur factice, public (`api/tests/fixtures/twin9-factice`), chargé par `EngineLoader` comme le
    vrai : `TrancheTest`, un processus par test, couvre le DoD (un run va au bout en tranches ; tué
    entre deux appels, il reprend sans appel en double ; tué pendant un appel, seul celui-ci repart ;
    deux runs simultanés gardent réglages, gabarits et clé ; aucune tranche ne dépasse sa durée), plus
    la mémoire journée par journée sans panne, les tentatives, la clé, les journées de front, une carte
    à la fois et l'empreinte des réglages. `WorkerTickTokenTest`, `AppelsDirectsTest`.
  - Parité (`api/tests/Twin9/PariteTest.php`, saute sans `Twin_v9`) : `03-scan-default` (Arpenteur),
    `12-jury-random`, `16-test-mode`, `10-resume` (sur la mémoire de `01-default`) et le vrai run de T2
    passent par le tick, tranches de 5 s, réponses dans le désordre : chaque appel part une fois, les
    sorties sont celles de l'oracle. S'y ajoutent un run tué en plein tribunal et un juré en panne
    rejoué au run suivant. La suite passe en 89 s ; un mot changé dans le gabarit du rapporteur, le
    dernier appel d'un run, fait échouer la première en 53 s et les sept en 66 s.
  - Pas encore : la voie par lots (T8 ; un run réglé « lots » attend), le lancement depuis un profil et
    la page du run (T9), crédits et plafonds (T10).

- 2026-10-18 — **Moteur Twin9 en PHP, T12 : le profil (branche `feat/twin9-t12-profile`).** Rien
  de la v9.8 dans ce dépôt.
  - Contrat `schemas/twin9-profil.schema.json` (`kind` « twin9-profil », fermé à tous les
    niveaux) : les paramètres d'algorithme du `config.json` de la v9.8, ses backends exceptés ; les
    options de sa ligne de commande qui règlent l'algorithme ; les 48 troncatures de son code, à
    leurs valeurs d'origine ; le mode, test (première journée, premier pôle) ou complet ; le
    collège, chaque lecteur avec sa famille ; trois étages (lecteurs, rapide, profond) et 17
    étapes qui les suivent ou s'en écartent : modèle Claude, budget de sortie, effort, réflexion,
    aucune température ; la voie, le parallélisme, budget et durée, la clé, le jeu de gabarits,
    le référentiel. `docs/contrats.md` §7 donne la correspondance avec la v9.8 ; l'endroit de
    chaque troncature dans son code reste dans `Twin_v9`.
  - Le profil v9.8 (`api/config/twin9-profil-v98.json`), par défaut et en lecture seule : Haiku
    5.5 aux lecteurs (un lecteur en trois passes) et à l'analyse rapide, Sonnet 5.5 à l'analyse
    profonde, la voie par lots ; pour le reste, les valeurs de la v9.8.
  - Migration 024 : `twin9_profils` (propriétaire, nom unique par propriétaire, profil JSON),
    CASCADE à la purge (registre §12). `ProfilRepository` : un réglage absent prend la valeur par
    défaut du schéma, comme la v9.8 lit son `config.json` ; un profil invalide n'est jamais
    écrit ; seul son propriétaire le modifie ou le supprime. `Validation` connaît le nouveau
    `kind`, côté PHP seulement.
  - Pas encore de route : la page et les droits viennent avec T13. D'ici là, l'export du compte
    ne restitue pas les profils (`rgpd-audit.php` : `none`).

- 2026-10-18 — **Documentation sans Docker (branche `feat/twin9-t0-docs-without-docker`, demande
  de Christian après la fusion de T0).** Ce qui citait Docker comme environnement de travail passe
  au PHP et au MySQL locaux : les 51 lignes « Exécuter » des fiches de cas d'utilisation
  (`(cd api && vendor/bin/phpunit …)`) et leur README, `docs/strategie-tests.md` (la CI joue
  désormais PHPUnit et le moteur), `docs/tests-e2e.md`, `docs/backup-restore.md`,
  `docs/securite-checklist.md`, `docs/administration.md`, `docs/plan-masse.md`, le chapitre
  d'exploitation de la formation des administrateurs, les commentaires (`api/config/`, en-têtes
  HTTP, `CurlHttpClient`, `LeakFilter`, `worker.php`) et l'usage des scripts PHP.
  - Ce qui exécutait Docker passe aussi en local : `stage-api.sh` installe le `vendor/` de
    production avec le Composer local (plateforme fixée à PHP 8.2, même jeu que le `composer.lock`) ;
    les scénarios Playwright et `scripts/dev/dod-p11.sh` interrogent la base de développement par
    le client `mysql` ; les scripts PHP sans `vendor/` conseillent `cd api && composer install`
    (attendu par UC-SYS-02-F16).
  - Restent, volontairement : `docker-compose*.yml` et `docker/`, pour qui s'en sert ; les journaux
    (`STATUS.md`, `docs/cartographie-ultime/JOURNAL.md`) et le plan de construction historique
    (`docs/plan-prompts.md`), qui consignent ce qui s'est fait alors ; les données
    d'`assets-existants/`.
  - Vérification, sans Docker : API **1 493 verts** (22 min 41 s) ; l'étape Composer de
    `stage-api.sh` n'installe que les dépendances de production (plateforme ≥ 8.2) ; l'assistant
    SQL des scénarios e2e et les ticks, requêtes et lectures de `dod-p11.sh` tournent contre le
    MySQL local ; `check-publiable` OK. Non rejoués : les scénarios Playwright, et `dod-p11.sh`
    en entier, cassé avant ce changement (voir les dettes).

- 2026-10-18 — **Moteur Twin9 en PHP, T0 : le cadre (branche `feat/twin9-t0-php-engine-frame`,
  ici et dans `Twin_v9`).** Aucun code du moteur ; rien de la v9.8 dans ce dépôt.
  - ADR-011 « Moteur Twin9 v9.8 en PHP » : la v9.8 réécrite en PHP, exécutée sur le serveur par
    tranches, par le tick de l'ADR-005 ; Anthropic seul, en direct ou par lots, avec les réglages
    que chaque modèle accepte ; le moteur vit dans `Twin_v9`, que la plateforme charge ; portfolio
    et état du run gardés sur le serveur avec l'accord de l'apprenant, qui remplace la garde
    `--donnees-reelles` ; coût moyen à la place du devis par run simulé. ADR-001, 005, 008 et 010
    portent en tête « Amendé par ADR-011 » ; `SUMMARY.md` régénéré.
  - Plus de Docker en développement (les fichiers `docker-compose` restent) : PHP et MySQL 8
    locaux, Composer fixé à PHP 8.2. `INSTALL.md` §2 crée les comptes MySQL et `.env.dev`, à la
    racine (valeurs de `docker-compose.yml`), qu'on exporte dans le terminal pour l'API, les
    scripts et les tests ; pas d'`api/.env` en développement : l'API et les scripts le
    chargeraient par-dessus l'environnement des tests (deux tests de `UcSys03` échouent alors).
    §2 ajoute aussi le `npm ci` du moteur qu'exige `build-default-prompt-package.mjs` ; §3 et
    §5 sans conteneur ; `CLAUDE.md` et le résumé du `README.md` suivent.
  - Chargeur `api/src/Twin9/EngineLoader.php`, appelé au démarrage (`Bootstrap`) : `TWIN_V9_DIR`
    (documenté dans `api/.env.example`), par défaut `../Twin_v9`, dossier `php/src` en PSR-4,
    préfixe `Twin9\`. Sans lui, Twin9 côté serveur reste désactivé (`EngineLoader::isLoaded()`)
    et ses tests sautent (`api/tests/Twin9/EngineLoaderTest.php`).
  - CI publique : job `php` (PHP 8.2, MySQL 8 en service, l'environnement et les données dérivées
    d'`INSTALL.md` §2, clé de chiffrement jetable) qui lance la suite existante ; une partie des
    tests suppose cet environnement (`MIGRATE_TOKEN`, `SODIUM_MASTER_KEY`). `Twin_v9` (pull request 1) : `php/composer.json` (PHP 8.2,
    PHPUnit), la classe vide `Twin9\Engine` et son test, son job `php` sous PHP 8.2 (vert, 8.2.34).
  - Vérification, sans Docker (PHP 8.3 local, MySQL 8.0.46 des paquets du système, `.env.dev`
    d'`INSTALL.md` §2, `../Twin_v9` cloné) : API **1 493 verts** (14 342 assertions, 24 min 52 s),
    dont les 4 du chargeur, moteur réel compris ; sans `../Twin_v9`, son test saute. Plateforme
    démarrée (`php -S`) avec et sans `../Twin_v9` : `/api/health` → `db: ok`,
    `/api/referentiel/versions` → 200, moteur chargé seulement quand il est là ; commandes
    d'`INSTALL.md` §3 passées ; `check-publiable` OK. CI de la pull request verte : `php` sous
    PHP 8.2.34, 1 493 tests dont le moteur réel sauté (15 min 17 s), `engine`, `check-publiable`.

- 2026-10-18 — **Documentation publiée sur GitBook : https://chamblandes.gitbook.io/humanome.**
  Espace créé par Christian (Site Git Sync, sens GitHub → GitBook) ; `gitbook-docs.yaml` à la
  racine : un espace « Documentation » sur `./`, qui reprend `.gitbook.yaml` et `SUMMARY.md` (quatre
  parties, 145 pages, liens tous résolus). Vérifié en ligne : accueil et pages profondes servies.
  Clôt l'action utilisateur de D10 (2026-07-17).

- 2026-10-18 — **Front déployé : Twin9 coupé en ligne, D-69 à D-71 publiées (demande utilisateur).**
  Construit dans la VM du Mac depuis un clone neuf de `4nd4ny/humanome.xyz` (`bed91d2`), avec les
  données de la copie locale ; `deploy.mjs static` après un `--dry-run` relu : 2 envois, 1
  suppression (l'ancien paquet, qui embarquait le moteur), données inchangées. Vérifié en ligne
  (Chromium) : accueil, `#/twin9` (avis), `#/cartographie` ; ancien paquet en 404, `www/assets/`
  ne contient que le nouveau, sans trace du moteur ; API inchangée (`v1.1.0-106-gc6a0231`).
  Copies locales (clones git) : `13. Cartographie/github/humanome.xyz` et `github/Twin_v9`, séparées
  des fichiers non versionnés de `13. Cartographie/humanome.xyz/` (hooks activés, `.env.deploy` et
  `web/public/data` recopiés, sans `node_modules`). Tags `v1.0.0`/`v1.1.0` recréés sur GitHub par
  deux releases, au choix de Christian : ce sont des tags légers, que `git describe` (version de
  l'API, `stage-api.sh`) ne lit qu'avec `--tags` ; les tags annotés d'origine restent dans l'ancienne copie.

- 2026-10-17 — **Moteur Twin9 sorti du dépôt public (décision de Christian).** Le portage JS du
  moteur, ses vecteurs et ses tests, les specs `docs/twin9/`, le plan `docs/plan-twin9-php.md`,
  `run-helpers.js` et `gen-oracles.sh` vivent désormais dans le dépôt privé `4nd4ny/Twin_v9`, aux
  mêmes chemins et avec leur historique ; le moteur PHP y naîtra aussi. L'historique de ce dépôt
  a été réécrit pour les en retirer, puis publié sous le nom `4nd4ny/humanome.xyz` (l'ancien,
  renommé `humanome~trash` et rendu privé, est à supprimer une fois la copie vérifiée). Jusqu'au lot 3, l'analyse
  approfondie est coupée : `#/twin9` affiche un avis, l'entrée de navigation est masquée. Restent
  publics `mapper.js`, `referentiel.js` et leurs utilitaires `py/`, ainsi que le service (crédits,
  PayPal, factures, atelier des gabarits). `check-publiable` refuse désormais les chemins du
  moteur ; les tests sur vecteur réel se sautent sans `../Twin_v9`. ADR-010 §1 révisé.

- 2026-10-17 — **Planning du moteur Twin9 v9.8 en PHP (`docs/plan-twin9-php.md`).** Six lots :
  préparer (dépôt privé `4nd4ny/Twin_v9` avec la v9.8 à sa racine, oracle tiré de la v9.8, vrai
  run de PLANT-01), le moteur PHP exécuté par tranches sur le serveur, le service (lancer,
  suivre, lire, payer, purger), le retrait du moteur du navigateur, la configuration (profil,
  jeux de gabarits, plusieurs référentiels, page et droits), la démonstration sur l'hébergement
  gratuit d'OVH, sans Docker. Dix-neuf prompts T0 → T18 à lancer chacun dans une conversation ;
  deux questions restent ouvertes (publication du moteur PHP, visibilité des gabarits v9.8).
  Relu par un agent distinct (paramètres des modèles 5.5, tests sans MySQL ni v9.8, jeton du
  déclencheur, voie par lots, parité PHP), corrections intégrées. Rien de la v9.8 n'entre dans
  ce dépôt ; aucun code dans ce commit.

- 2026-10-14 — **Interface ultime de cartographie (demande utilisateur, branche
  `feat/ultimate-cartography`) — validée, déployée et fusionnée dans `main` le même jour.**
  - Exigences : `04_specifications.md` du dossier de travail « Cartographie » de Christian (hors
    dépôt). Journal d'avancement, décisions D-1 → D-71, état des tests, les 42 questions et
    les réponses de Christian : `docs/cartographie-ultime/JOURNAL.md`.
  - Module autonome `web/src/carto/` (cœur sans DOM + interface React) sur `#/cartographie` ;
    l'ancienne vue V3 est retirée, `#/merge` et `#/cartographie-v3` y renvoient (D-38). P0 noyau (master v4,
    importeurs Aurora v3 / AuroraCore / Merge v2, formules §5, IndexedDB) ; P1 soleil,
    heatmap, gestionnaire, date t ; P2 lecteur de portfolio surligné, détail, jury ; P3
    comparaison de soi à soi ; P4 tableau de bord ; P5 archive JSON, copie autonome HTML
    (lisible hors ligne en `file://`), rapport imprimable, démo anonymisée ; P6 version
    partagée réservée aux adultes (auto-attestation gardée par le serveur, liste blanche,
    lien à mot de passe facultatif jamais indexé, journal des accès) ; P7 dialogue scripté
    local, relances LLM facultatives sur accord explicite ; puis relecture indépendante de P6
    et P7 (13 corrections, D-37).
  - API : migration `022_carto_partage_adultes.sql` (type `partage`, mot de passe de lien
    facultatif, `users.adult_attested_at`) — elle part avec la release API (`deploy.mjs api`
    appelle `migrate`) ; routes `partage.php` (attestation), `GET /api/share/open` (jeton en
    en-tête), `GET /api/shares/{id}/consultations`. Registre RGPD (3 bis, 3 ter), politique de
    confidentialité, matrice d'autorisations, UC-APP-05 et UC-EMP-01 mis à jour.
  - Données réelles (journaux 300 / 200 / GEN1) : importeurs, lecteur, anonymisation, surlignage
    approché, export du portfolio et archive de compte validés sur le Mac, compteurs
    seulement ; rien de personnel n'est versionné.
  - **Réponses de Christian (2026-10-14) appliquées** : l'angle compte les points, la hauteur
    est la confiance moyenne du jury (D-8) ; `connect-src` ouvert aux seuls fournisseurs, pour
    les runs et relances avec clé personnelle (D-36) ; pages V3 retirées (D-38) ; une nouvelle
    version partagée remplace l'ancienne sous le même lien (D-33) ; surlignage approché des
    extraits reformulés (D-39) ; un dialogue du carnet se verse au portfolio, exporté en
    Markdown (D-40) ; « Exporter toutes mes données » emporte les jeux de l'interface
    (archive 1.1.0), schéma JSON du master v4 (D-25) ; chapitres de formation V3 réécrits.
    Puis relecture indépendante de ces décisions : 9 corrections (D-41, `b651f38`).
  - **Question 17 (2026-10-14)** : la garantie passe par la publication — un cartographe publie
    la version partagée de l'apprenant, à sa demande (code à usage unique), avec sa garantie,
    que l'employeur lit (D-42, migration 023, `f55b036`) ; puis **l'ancien partage est retiré**
    (D-43) : plus de nouveau lien vers une cartographie du site (`422 share_retired`) ;
    « Partager depuis l'interface » et « Liens déjà créés » dans « Mes cartographies » ; la page
    de relecture du cartographe ouvre sa révision dans l'interface pour la publier garantie ;
    les liens déjà créés restent servis jusqu'à leur échéance. Relu par un agent distinct
    avant le commit (rien de bloquant, corrections intégrées).
  - **Questions 25 à 29** (D-44) : le niveau « Publique (partageable) » s'intitule « Partager » ;
    `CLAUDE.md` décrit le partage par une version choisie, mot de passe facultatif ; anciens
    liens non révoqués, publication par l'apprenant seul et code de demande confirmés.
  - **Pôle ouvert sur 360°** (D-45, demande du 2026-10-14) : un double-clic sur un pôle du soleil
    (ou « o ») l'ouvre — ses compétences font tout le tour selon leur part des points du pôle,
    hauteurs inchangées, codes écrits ; le centre (ou Échap) ramène à tous les pôles ; passage
    animé de 480 ms, aucun si le mouvement est réduit ; même geste dans la version partagée.
    Corrigé en chemin : un clic dans le soleil faisait défiler toute la page jusqu'à la liste
    (le second clic d'un double-clic tombait à côté) ; la colonne de gauche défile désormais
    seule, la liste y suit la sélection. Relu par un agent distinct (six corrections).
  - **Vérification après D-45** (2026-10-14) : front **2 285 verts** (235 fichiers) ; moteur
    **1 071 verts** + 17 sautés ; API **1 489 verts** (14 328 assertions) ; e2e Chromium
    **16 sur 16** (dont `carto-soleil.e2e.js`, nouveau : vrai double-clic, géométrie vérifiée
    sur le tracé rendu).
  - **Vérification** (2026-10-14, `b651f38`) : front **2 255 verts** (231 fichiers ;
    `twin6-prompt-package.test.js` toujours non chargeable, anomalie connue) ; moteur
    **1 071 verts** + 17 sautés ; API **1 484 verts** (14 162 assertions, 23 min 36 s) ; e2e
    Chromium de la cartographie verts : P5 (copie autonome, démo anonymisée), P6 (contre l'API
    docker locale), P7 (dialogue), clé personnelle sous la CSP de production.
  - **Vérification après D-43** (2026-10-14) : front **2 257 verts** (232 fichiers, dont
    `twin6-prompt-package.test.js`, chargeable une fois les gabarits Twin6 non versionnés
    déposés — `INSTALL.md` §4) ; moteur **1 071 verts** + 17 sautés ; API **1 489 verts**
    (suite complète) ; e2e Chromium verts : parcours apprenant et cartographe (réécrits pour le
    partage par l'interface, et remis en état : ils s'arrêtaient à l'inscription depuis
    l'activation par code D5), P6 et version garantie contre l'API docker, P5, P7, CSP, guides,
    sandbox. Deux e2e en échec depuis juillet, sans rapport, remis en état dans un commit à part :
    `navigation-burger.e2e.js` (le tiroir rétracté laisse dépasser 10 px depuis `189f20e` ;
    position lue après la transition) et `parcours-promptologue.e2e.js` (inscription d'avant
    D5) — **toute la suite e2e est verte** (11 fichiers).
  - **Déploiement** (2026-10-14, autorisé par Christian ; journal carto D-46) : release API
    `20261014-133427-v1.1.0-106-gc6a0231`, migrations `022` et `023` appliquées (référentiel,
    compétences, fiches et paquets de prompts inchangés), front (4 fichiers changés, ancien
    bundle retiré ; données de démo inchangées). `health` → `v1.1.0-106-gc6a0231`. Fait depuis la
    VM Linux du Mac (le FTP n'est pas joignable depuis le conteneur cloud) ; la release API a été
    complétée et vérifiée fichier par fichier avant l'écriture du pointeur. Vérifié en ligne dans
    Chromium (démo, pôle ouvert sur 360°, retour). Release précédente (`v1.1.0-20-g471d7cd`)
    gardée pour un retour arrière. La démo anonymisée (`data/demo/carto/archive.json`) n'est pas
    partie : aucune n'a été préparée (« Préparer une démo », relecture de Christian) ; le site
    garde les 59 journées publiques.
  - **Fusion** : PR `feat/ultimate-cartography` → `main` (CI verte), fusionnée le 2026-10-14.
  - **Question 30** (D-47, accord de Christian) : le script anti-FOUC autorisé par son hash dans
    la CSP de production (le thème choisi par un visiteur n'était pas réappliqué au chargement) ;
    garde `web/src/anti-fouc.test.js` ; déployé (front seul) et vérifié en ligne.
  - **Démonstration avec portfolio** (D-48, demande de Christian) : le journal dont viennent les
    extraits de la démonstration, découpé à ses titres datés, est déposé **sur le site seulement**
    (`data/demo/carto/archive.json`, archive de l'interface, hors manifeste du front ; jamais dans
    le dépôt) ; « Ouvrir dans le portfolio » surligne les passages (97,4 % retrouvés tels quels sur
    2 392 traces). Constaté : échappements Markdown et séparateurs mal rendus par `lib/md.js`
    (question 31).
  - **Question 31** (D-49, accord de Christian) : `lib/md.js` rend ce que Google Docs écrit en
    exportant un document — échappements (`\!`, `\*`…), traits (`---`, `- - -`), sauts de ligne
    (deux espaces en fin de ligne ; U+000B des cellules, affiché jusqu'ici en carré « VT »),
    images (« [image] », jamais chargées) ; le surlignage suit (`stripMarkdownMarks`) ; le
    découpage lit « 1er.01.2026 ». Archive de la démonstration reconstruite et redéposée, front
    redéployé, vérifié en ligne : 98,5 % des passages retrouvés tels quels (97,4 % avant).
    Suites : front **2 294 verts**, moteur **1 072** + 17 sautés, e2e P5, P7, soleil, guides
    verts. Ouvert : tableaux (question 32), traits d'un journal importé tel quel (question 33).
  - **Comparaison par défaut** (D-50, demande de Christian) : l'espace Comparaison s'ouvre sur
    janvier face à mars (l'année la plus récente où les deux mois ont des journées analysées ;
    sinon, comme avant, « depuis la dernière évaluation ») ; préréglage « Janvier et mars » ;
    changer de vue ne fige plus A et B. Déployé (front) et vérifié en ligne.
  - **Rectification, en-tête allégé, tuiles** (D-51 → D-53, demandes de Christian) : la comparaison
    s'ouvre sur la première moitié des journées analysées face à la seconde (préréglage avant
    « Depuis la dernière évaluation » ; janvier et mars retirés) ; l'en-tête offre « Réinitialiser
    l'affichage » et perd « Comparer A / B », « Exporter » et « mode expert » (ses réglages α et
    épaisseur deviennent une tuile) ; la légende du soleil garde deux lignes. L'espace Cartographie
    passe en **tuiles** (grille du tableau de bord) : douze tuiles masquables, déplaçables,
    redimensionnables ; au départ le soleil et le détail en pleine largeur ; menu « Panneaux » ;
    disposition gardée dans le navigateur (`localStorage`). Relu par un agent distinct (six
    corrections). Suites : front **2 315 verts**, e2e Chromium **16 sur 16**. Déployé (front) et
    vérifié en ligne.
  - **Questions 32 et 33** (D-54, D-55, accord de Christian du 2026-10-15) : le Markdown passe par
    la bibliothèque **marked** 18.0.14 (CommonMark et tableaux GFM, version figée), réglée pour les
    journaux (écarts documentés en tête de `lib/md.js`), avec une feuille de style du site
    (`styles/markdown.css`) : tableaux, encadrés (tableau d'une seule case), listes numérotées et
    imbriquées ; surlignage identique, trace par trace, sur les 2 392 traces de la démonstration.
    Le découpage (`engine/src/portfolio/segment.js`) ne coupe plus à un trait après un titre
    daté : le journal de la démonstration, importé tel quel, donne ses 67 journées ; l'export du
    portfolio place ses passages sans date en tête. Relu par un agent distinct (13 points
    traités). Suites : front **2 339 verts**, moteur **1 073** + 17 sautés, e2e Chromium
    **16 sur 16**. Déployé (front) et vérifié en ligne.
  - **Demande du 2026-10-15** (D-56 à D-60) : lecteur de portfolio épuré (la journée entre ◁ ▷,
    l'extrait du jury cité seulement s'il n'est pas retrouvé tel quel, plus de navigation par
    jour ni de ligne d'état) ; une démonstration intacte se met à jour d'elle-même, en
    arrière-plan (défaut de Chrome Android : une copie antérieure au dépôt du portfolio) ;
    anneau des pôles élément d'interface, épaisseur réglable (30 par défaut, de 0 à 160) ;
    heatmap « Tout voir » par défaut, contraste renforcé toujours ; soleil et heatmap au thème
    sombre (marches sombres validées par le script de la skill dataviz). Relu par un agent
    distinct (24 points, 21 traités). Suites : front **2 366 verts**, moteur **1 073**, e2e
    Chromium de la cartographie verts. Déployé (front) et vérifié en ligne, au bureau et au
    téléphone (une démonstration ancienne se met à jour en 1,9 s).
  - **Propositions 35 à 37 acceptées** (D-61 à D-63) : à la souris, les commandes des tuiles
    ne paraissent qu'au survol ou au clavier (toujours affichées sur un écran tactile) ; le
    tableau de bord en panneaux comme la cartographie (« Panneaux », « Réinitialiser
    l'affichage », au départ le profil et le rythme, disposition gardée dans le navigateur) ;
    résumé du profil sans total des points ni court-circuit ; couleurs des pôles plus sombres
    en clair, traduites à l'affichage (référentiel inchangé ; RACINES et FLAMBEAU à des valeurs
    plus justes que la proposition, à confirmer). Relu par un agent distinct (aucun bloquant).
    Suites : front **2 382 verts**, moteur **1 073**, e2e Chromium de la cartographie verts.
    Déployé (front) et vérifié en ligne, au bureau et au téléphone.
  - **Demande du 2026-10-15, 13 h 28** (D-64, D-65) : la tuile « Réglages » (ex-« Réglages de
    l'encodage ») propose cinq palettes des pôles (Contrastée par défaut, Vive, Pastel, Terre,
    Profonde), validées pour les daltoniens par le script de la skill dataviz, gardées dans le
    navigateur ; le rapport imprimé et la version partagée gardent la palette par défaut. La
    hauteur des secteurs part d'une confiance réglable (0 à 0,5, 0,25 par défaut) : les écarts
    de hauteur de la démonstration 1,6 fois plus visibles ; α garde son rôle dans les points.
    Relu par un agent distinct (aucun bloquant, six défauts traités). Suites : front **2 401
    verts**, e2e Chromium de la cartographie verts. Question 38 (la palette par défaut) posée.
    Déployé (front) et vérifié en ligne, au bureau et au téléphone.
  - **Demande du 2026-10-16, 5 h 30** (D-66) : chaque information une fois. La « synthèse
    complète » du portrait d'une journée ne s'affiche plus (59 sur 59 redisaient leurs
    rubriques) ; seul ce qu'un texte complet ajoute se lit, et seul cela se garde à l'import et
    à la relecture d'une archive (`core/restatement.js` : chaque mot doit être déjà dit — une
    négation, un nombre, un mot changé font une phrase neuve ; `docs/contrats.md` décision 10).
    Panneau d'une compétence : plus de « Journées observées », ligne d'une journée sans les
    chiffres du panneau quand elle est la seule, confiance finale du Pédagogue seulement si elle
    diffère, examen du Pédagogue à un niveau, sort de chaque pièce du Greffier (l'extrait d'une
    pièce retenue n'est plus redit) ; délibération AuroraCore : la décision du président
    d'abord, sans rien déplier ; pôle : un passage saillant déjà cité le même jour se lit sous
    son territoire ; rapport imprimé sans redites. Relu deux fois par un agent distinct (cinq
    puis six défauts, traités). Suites : front **2 426 verts**, e2e Chromium de la cartographie
    verts. Questions 39 (les délibérations du jury : dans AuroraCore, sur le Mac — trois façons
    de les joindre) et 40 (lire les données à la demande : proposition en trois points) posées.
    Déployé (front, et l'archive de la démonstration allégée : 18,4 → 17,2 Mo) et vérifié en
    ligne, au bureau et au téléphone.
  - **Réponse du 2026-10-16, 8 h 44** (« Ok pour choix A et choix 1. », D-67, D-68). La
    démonstration se lit à la demande : un index (38 Ko compressés) puis le seul fichier de ce
    qu'on ouvre, rangé par compétence, pôle, journée, texte ou délibération (`core/split.js`,
    `web/scripts/carto-demo-split.mjs` ; schéma : `remote`, `docs/contrats.md` décision 11) ;
    une démonstration où la personne met quelque chose à elle se copie dans son navigateur, et
    l'ancien dossier de version peut se retirer du site (hébergement gratuit : 100 Mo). La
    seconde lecture : un run AuroraCore joint à un jeu qui a ses analyses par journée ne touche
    plus aux journées ; sa délibération se lit avec chaque compétence, la décision du président
    d'abord (`ui/SecondReading.jsx` ; schéma : `readings`, décision 12). Relu deux fois par un
    agent distinct (quatorze, puis quatre points, traités). Suites : front **2 468 verts**,
    moteur 1 073, e2e Chromium de la cartographie verts. Déployé et vérifié en ligne (bureau,
    téléphone). L'hébergement gratuit (100 Mo) était plein : avec l'accord de Christian,
    l'ancienne `archive.json` (17,2 Mo) et la release API `v1.1.0-4` (3,7 Mo) sont sauvegardées
    sur le Mac (`backup-manuel/2026-10-16/`) puis effacées ; 56,1 Mo visibles ensuite. Question 41
    décidée (11 h 27) : on laisse en l'état — humanome.xyz est le site de développement et de
    démonstration ; la production viendra plus tard sur un autre serveur.
  - **Remarque du 2026-10-16, 18 h 35** (D-69) : la date de la seconde lecture se dit comme celle
    de l'analyse (faite après le journal), une fois ; « Réflexions des membres du jury » : une ligne
    par membre, un niveau de moins à déplier. Suites : front 2 468 verts, cartographie 527.
  - **Remarque du 2026-10-16, 19 h 21** (D-70, question 42) : la hauteur d'un secteur suit la
    confiance sur une échelle régulière, comptée depuis le départ (0,25) — 0,5 au tiers de
    l'anneau, 0,75 aux deux tiers — au lieu d'une aire proportionnelle, qui étirait le bas de
    l'échelle ; la légende perd sa ligne « Surface ». Suites : front 2 469 verts, cartographie 527,
    e2e Chromium du soleil verts. Déployé et vérifié en ligne.
  - **Remarque du 2026-10-16, 20 h 53** (D-71) : dans la modale du jour, les boutons de la journée
    voisine ne disent plus l'année, sauf quand elle change ; « 1er » dans les dates compactes.
    Suites : front 2 475 verts, cartographie 533. Déployé et vérifié en ligne (bureau, téléphone).

- 2026-09-29 — **Correction des tests en échec (demande utilisateur, PR 4nd4ny/humanome#4).**
  - **CI « Tests moteur » verte** : le job `engine` de `.github/workflows/publiable.yml`
    régénère d'abord les données dérivées lues par `engine/src/pipeline/merge.test.js`
    (convertisseurs d'`INSTALL.md` §2, sans dépendance npm) ; `engine/src/twin9/referentiel.test.js`
    ne lit plus l'oracle Twin9 gitignoré quand il est absent (le corps d'un
    `describe.skipIf` est évalué à la collecte ; même garde que `parite.test.js`).
  - **Référentiel 7.1.0** (`web/src/data/referentiel-v710.test.js`) : pas de défaut de code,
    le test lit l'export statique produit depuis la base. `INSTALL.md` était faux : le
    conteneur `php` travaille dans `api/`, donc `php scripts/migrate.php` échouait
    (« Could not open input file ») → `../scripts/…` ; étapes manquantes ajoutées
    (`enrich-referentiel`, import de la 7.1.0, `export-referentiel-static`). En-têtes
    « Usage » de `import-referentiel.php`, `import-prompt-packages.php` et
    `export-referentiel-static.php` alignés.
  - **Twin6 (UC-SYS-04 AN-2), correction PARTIELLE** : `generate-fiches.mjs` crée son dossier
    de sortie ; `stage-api.sh` régénère les P*.md avant le paquet Twin6 au lieu de dépendre
    d'un build du front antérieur. Tests UC-SYS-04-U06 et F11 mis à jour.
    **Reste (décision utilisateur)** : versionner les trois gabarits publics
    (`0-mega-prompt.md`, `1-scan-pole.md`, `2-kairos-final.md`) ; tant qu'ils manquent,
    `web/src/views/promptologue/twin6-prompt-package.test.js` échoue hors du poste de
    l'auteur. Leur ajout depuis la copie servie en production a été refusé par le
    garde-fou de sécurité de l'agent.
  - **Vérification** (checkout propre + modifications) : PHPUnit **1 470 verts** ; moteur
    **60/60 fichiers**, 1 069 verts + 17 sautés ; web **1 941 verts**, seul
    `twin6-prompt-package.test.js` en échec (gabarits absents).

- 2026-09-29 — **Catalogue des cas d'utilisation + jeux de tests unitaires et fonctionnels (demande utilisateur, PR 4nd4ny/humanome#4 — code de production inchangé).**
  - **Documentation** : `docs/cas-utilisation/` — **58 fiches** en 10 dossiers d'acteurs
    (visiteur 5, compte 6, apprenant 12, cartographe 7, employeur 1, promptologue 8,
    épistémiarque 4, établissement 4, administration 6, système 5). Chaque fiche : objectif,
    déclencheur, préconditions, garanties, scénarios nominal/alternatifs/d'erreur, règles de
    gestion, données et RGPD, code sollicité, jeux de tests (traçabilité), anomalies constatées. `README.md` = conventions,
    catalogue et index des anomalies GÉNÉRÉS (entre marqueurs `<!-- catalogue:… -->` /
    `<!-- anomalies:… -->`), méthode de vérification, outillage hors périmètre. Section
    « Cas d'utilisation » ajoutée au `SUMMARY.md` GitBook (`scripts/build-gitbook-summary.mjs`).
  - **Tests**, rangés à part des suites historiques, identifiés `UC-XXX-NN-Unn` (unitaire :
    code appelé directement) / `UC-XXX-NN-Fnn` (fonctionnel : scénario de la fiche rejoué par
    l'API HTTP in-process ou par `<App/>` rendu en jsdom) — 963 identifiants unitaires et
    1 140 fonctionnels distincts : PHP **941** tests (`api/tests/UseCases/{Unit,Functional}/`,
    helpers `Support/`), web **1 051** (`web/test/usecases/`), moteur **141**
    (`engine/test/usecases/unit/`, joués aussi par la CI GitHub : fichiers versionnés seulement).
  - **Vérification** : rédaction depuis le code réel → relecture adversariale indépendante
    par cas (affirmation par affirmation, corps des tests lus, tests non discriminants
    traqués) → correction contre-vérifiée → balayage de complétude (routes API/CLI, routes
    front, vues, composants, scripts ; d'où UC-SYS-04 « artefacts dérivés » et UC-SYS-05
    « sauvegarde/restauration ») → traçabilité fiche↔tests (0 écart d'identifiant), liens
    (0 cassé) → toutes les suites (historiques + cas d'utilisation) rejouées sur un checkout
    propre de HEAD : PHPUnit **1 470 verts** (13 961 assertions), Vitest web **1 937 verts**,
    moteur **1 060 verts + 14 sautés**. Seuls 3 fichiers historiques ne se chargent pas, faute
    de données non versionnées (oracle Twin9, export statique du référentiel depuis la base,
    gabarits Twin6 déposés à la main) — échec identique sur `main`, sans lien avec la PR.
  - **214 anomalies de production documentées, NON corrigées** (hors périmètre de la demande) :
    chacune est figée par un test vert « comportement actuel » et indexée dans le README du
    catalogue — corriger une anomalie = modifier le code, le test qui l'épingle et la fiche.
  - **Frictions de format** relevées (runMeta vs archive, tokens runner, `semver`/`version`,
    `type`/`kind`, `poleNum` chaîne/nombre, `{}` décodé en `[]`, ordre des clés JSON MySQL) :
    `docs/contrats.md` §6. `docs/strategie-tests.md` : nouvelle section « Tests par cas
    d'utilisation » + volumétrie.
  - **Infra de test** : `TestDb::name()` (env `DB_TEST_NAME`, défaut `humanome_test`, pour
    des bases de test parallèles) ; suites PHPUnit `usecases-unit` / `usecases-functional`
    (exclues de la suite `api`, toutes jouées par `composer test`) + `composer test:usecases` ;
    `Composer\Config::disableProcessTimeout` (la suite complète dépasse 300 s) ;
    `memory_limit` des tests 512M → 2048M ; `npm run test:usecases` (web, moteur).
  - **CI « Tests moteur » rouge AVANT cette PR** (sur `main` depuis l'exécution n° 5) :
    `engine/src/pipeline/merge.test.js` et `engine/src/twin9/referentiel.test.js` lisent des
    données gitignorées absentes en CI. Correctif proposé en commentaire de la PR (génération
    des données dérivées dans le workflow + lecture gardée de l'oracle), non intégré pour ne
    pas élargir le périmètre. Tous les autres tests moteur, dont ceux de cas d'utilisation,
    passent en CI.

- 2026-07-18 — **Panneau de monitoring admin ✅ DÉPLOYÉ EN PROD (autorisé par l'utilisateur, release `v1.1.0-20-g471d7cd`).**
  - API + front déployés, aucune migration (`applied:[]`), gates référentiel/golden « unchanged ».
    Smoke : health ok, `/api/admin/monitoring` et `?role=` → 401 sans session, front servi.
  - **GeoIP pays ACTIF** : « IP to Country Lite » db-ip (édition 2026-07, 8 182 135 octets,
    licence CC BY 4.0) déposée dans `~/app/shared/dbip-country-lite.mmdb` + `GEOIP_DB=dbip-country-lite.mmdb`
    ajouté au `.env` prod par download→merge→upload COMPLET (1007→1039 octets, relu à l'identique ;
    copie de sauvegarde `backup-manuel/app/shared/.env` mise à jour). `GEOIP_DB` relatif = résolu
    contre le dossier du `.env` (`Bootstrap::envDir()` public, commit `471d7cd`). Validé en local
    contre le vrai fichier (8.8.8.8→US, 90.15.0.1→FR, IPv6 OVH→FR). Décision utilisateur : pays
    OUI, IP brute NON (RGPD) — le réseau tronqué /24 + les rate-limits suffisent à la défense.
  - Le journal des connexions démarre maintenant : premières entrées à la prochaine connexion
    (pays visible dès celle-ci). Rafraîchir la base db-ip de temps en temps (mensuelle).

- 2026-07-18 — **Panneau de monitoring admin (`#/admin/monitoring`) — demande utilisateur. Détail du chantier :**
  - **Backend** : `GET /api/admin/monitoring?days=1..365` (`Admin\Monitoring`, RequireRole admin,
    lecture seule) — utilisateurs (total, actifs < 15 min via `sessions`, inscriptions/jour, par
    rôle), cartographies (volumes, partages actifs, consultations), finances (soldes `twin9_credits`,
    mouvements par nature/jour, captures PayPal), tokens/jour et par modèle (`llm_usage_daily` +
    `tuteur_usage_daily` + débits `twin9_credit_events` — série anti-anomalies), connexions, votes
    (propositions `review` des DEUX grains, décompte `MajorityTally`, retardataires à relancer).
    Filtre `role=` ajouté à `GET /admin/users` (UserDirectory).
  - **Journal des connexions (nouveau, prospectif)** : `Auth\LoginJournal` → `audit_events` type
    `login`/`login_failed` sur login, activation et échec. **RGPD §6.5 préservé** : détails =
    `{pays, reseau}` seulement — pays résolu LOCALEMENT (`Geo\CountryResolver`, MMDB via env
    `GEOIP_DB`, dépendance `maxmind-db/reader` ajoutée ; fichier absent → null, AUCUN service
    tiers) et réseau tronqué (`Geo\IpAnonymizer` : v4 /24, v6 /48) — jamais d'IP brute. Purge
    opportuniste > 365 j. Consultations de partage : événement `share_consulted` (ids seulement)
    dans `POST /share/{token}` (+ `cartographie_id` exposé par `ShareLinks::findByToken`).
  - **Front** : section « Monitoring » première de `#/admin` — tuiles de synthèse, période
    7/30/90/365 j, graphiques SVG maison (barres empilées connexions/tokens, barres divergentes
    finances ; palette `--mon-*` validée clair ET sombre par le validateur dataviz — sarcelle
    `#0f766e` recalée pour chroma insuffisant → `#0d9488` ; légende, infobulles `<title>`, table
    de secours « Voir les données »), tables (par pays, dernières connexions, par modèle,
    mouvements), bloc votes (verdict entérinable/en attente/rejetée + « écrire aux retardataires »
    mailto bcc), comptes par rôle. Aide `#/admin` mise à jour.
  - **Tests** : PHP **529** (AdminMonitoringTest 6, GeoIpAnonymizerTest 4, audit `share_consulted`
    dans ShareTest), web **894** (MonitoringSection 7), build OK. Vérifié navigateur bout-en-bout
    (docker + dev server, admin réel) : tuiles vivantes, MA connexion journalisée en direct
    (réseau /24, pays « — » sans MMDB), graphiques clair/sombre. NB : le volet de prévisualisation
    ne peint que le haut de page (bug du volet, contrôlé sur `#/referentiel` intact) — vérification
    par remontée des blocs.
  - ~~Reste côté admin/déploiement~~ → FAIT le 2026-07-18 (voir l'entrée au-dessus) : déployé
    avec la base pays db-ip installée et active.

- 2026-07-17 — **Tranche de panneau visible au bord + fermeture au clic de lien (demandes utilisateur).**
  - **Poignée visible** : sur pointeur à survol, le panneau fermé ne sort plus entièrement de
    l'écran — repos à `translateX(calc(10px - 100%))`, une TRANCHE de 10 px reste visible
    (fond carte + ombre + ligne d'accent `.app-menu-edge` passée à z-index 66, effacée quand
    le panneau est révélé). L'approche du bord (veille géométrique inchangée, zone 12 px) la
    fait glisser vers la droite jusqu'à visibilité complète. Tactile : panneau hors écran
    comme avant, bouton Menu seul accès. Impression : déjà masqué via `.app-header-actions`.
  - **Clic sur un lien du panneau non épinglé = fermeture immédiate.** Deux verrous
    tombaient mal : `route.name` inchangé (lien vers la rubrique courante ou une autre
    section de la même rubrique) ne déclenchait pas l'effet de route, ET Chrome focus le
    lien cliqué — la révélation `:focus-within` maintenait le panneau visuellement ouvert
    devant la page chargée (le symptôme smartphone signalé). Délégation `onClick` sur la
    nav : `setMenuOpen(false)` + `blur()` du lien pour les clics POINTEUR (`detail > 0`) ;
    l'activation clavier (`detail === 0`) garde le focus (contrat d'accessibilité de la
    révélation au focus). Épinglé : inchangé, la punaise prime.
  - **Correctifs issus de la revue adversariale du diff** (5 confirmés) : la tranche au
    repos ne reste plus peinte par-dessus les surfaces bloquantes (miroir CSS de
    `MENU_EDGE_BLOCKERS` via `body:has(...)` → rentrée complète, ligne effacée ; vérifié
    navigateur avec l'aide modale) ; tranche et ligne limitées à `min-width: 768px` (sous
    ce seuil la `.view-toolbar` basse occupe le coin — la veille reste active) ; fermeture
    par clic de lien ou clic extérieur DÉSARME le bord (le clic se fait souvent dans la
    zone des 12 px : sans cela la veille rouvrait au premier frémissement) ; activation
    clavier d'un lien = état intact (Échap restait mort sinon — `menuOpen` doit rester
    vrai pour que son effet soit branché) ; la ligne ne s'efface qu'au focus DANS le
    panneau (`:has(.app-nav-panel:focus-within)`), plus au focus du bouton Menu.
  - Vérifié navigateur desktop (tranche au repos clair/sombre, glissement complet au
    survol, clic « Accueil » sans hashchange → panneau refermé + focus rendu, page
    visible ; modale → tranche rentrée puis revenue) et viewport mobile 375 px (tap
    burger → tiroir, tap « Référentiel » → tiroir refermé, page visible).
    Suites : web **887** (30 tests App).
  - **Déployé** (static, autorisé par l'utilisateur) avec les trois lots nav de la
    journée (`426c297`, `7a7ea9c`, `189f20e`) : build Vite + `deploy.mjs static`
    (2 fichiers envoyés, ancien bundle purgé), puis vérifié EN LIGNE sur
    https://humanome.xyz — tranche visible, ouverture à l'approche du bord, fermeture
    au clic de lien avec focus rendu.

- 2026-07-17 — **D16 — Banc d'essai : score vs référence, multi-run croisé A/B, coût réel
  mesuré et persisté (retours utilisateur sur D15).**
  - **Score chiffré vs référence** (`scoreVsReference`) : précision/rappel/F1 par PUR calcul
    d'ensembles (exigence utilisateur : jamais une note générée par IA) — TP = établies
    communes, FP = seulement générées, FN = manquées. Seules les journées couvertes des DEUX
    côtés sont scorées (drapeaux `couvertA/couvertB` de buildAbReport, `joursExclus` signalés) ;
    un périmètre restreint écarte les compétences de la référence hors périmètre
    (`codesRetenus`) ; F1 = 0 en désaccord total (null réservé à l'absence de donnée).
  - **Multi-run croisé A/B** (`buildAbMultiReport`) : N runs PAR BRANCHE (1..5) ; pour chaque
    (journée, compétence), fraction d'établissement pA/pB ; classes « écart franc » (stables
    et opposées = signal attribuable au prompt), « bruit » (instable dans au moins une
    branche), « accord » ; consistance interne par branche (compareRuns). Interruption =
    rapport partiel sur les runs achevés (comme le mode multi). Provenance affichée (tableau
    et diff jury = run 1 ; la section multi agrège tout).
  - **Coût réel mesuré** : enveloppe provider unique dans runVersionOnDays (température +
    cumul `usage {inputTokens, outputTokens, mesures}` sur les trois chemins) ; lignes
    « Tokens réels » et « Coût réel » (table de prix, arrondi au dix-millième — un micro-run
    payant ne s'affiche jamais « 0 $ ») + totaux de SESSION en multi-run ; en mode service
    humanome le coût se chiffre sur le modèle de référence (`modeleTarif`), cohérent avec
    l'estimation. Compteurs au format fr-FR.
  - **Persistance en base à chaque génération** (demande utilisateur) : `executeRun`
    (run-launcher) mesure enfin l'usage réel que le pipeline jetait — RunWizard le range dans
    `runMeta.usage` (compteurs seulement, RGPD §6.5), stocké localement avec chaque
    cartographie et transmis TEL QUEL au serveur à la copie opt-in via la colonne `run_meta`
    (migration 007 — AUCUNE migration nécessaire, payload déjà validé ≤ 64 Ko). Affiché en fin
    de run (« Consommation réelle de cette session… »). Twin9 : déjà couvert côté serveur
    (facture/crédit au coût réel).
  - Revue adversariale (24 agents, 19 constats confirmés ~11 défauts distincts, TOUS
    corrigés) : journées non communes exclues du score, arrondi du coût, F1=0, tarif du mode
    service, totaux ×N, sauvetage A/B après interruption, nRunsAb dans le carnet, usage
    Twin6 affiché, libellé de distance harmonisé, provenance run 1, séparateurs de milliers.
  - Vérifié navigateur (mock service, compte promptologue dev) : A/B croisé 2×2 runs (tokens
    2 917/2 206 par run, session 5 834/4 412, coûts 0.0418 $/0.0837 $), boucle export run
    partiel → réimport référence → score 100 %, phase PoW affichée pendant la préparation,
    zéro erreur console. Suites : moteur **945**, web **885** (+15), build OK. Déployé (static)
    le 2026-07-17 avec D15 (autorisation utilisateur) — bundle vérifié en prod (chaînes D15/D16
    présentes, health ok, console propre). Abandonné sur décision utilisateur : la surcharge
    de variables de gabarit à la volée.

- 2026-07-17 — **D15 — Refonte du banc d'essai promptologue (demande utilisateur).**
  Le banc (P10.4) passe d'un comparateur sommaire à un banc paramétrable complet :
  - **Périmètre du journal** : tout le portfolio, UNE journée, ou une période [du..au]
    (`filterDayGroups`), journées listées depuis la fixture ou le portfolio local.
  - **Périmètre du référentiel** : entier, un pôle, ou UNE compétence — nouvelle option
    `perimetre` d'`extractDay` (moteur : `restreindreReferentiel`, kairos omis en partiel,
    document marqué `perimetre.partiel` — le schéma exige 7 pôles, validation par sonde) ;
    sandbox : référentiel filtré + `validatePartialJour` (sonde ; stricte dès 7 pôles) ;
    Twin6 : refus explicite (référentiel en dur). Vérifié en navigateur : 1 compétence ×
    1 journée = 1 appel LLM au lieu de 24.
  - **Version du référentiel par branche** (API `referentiel/versions`, déjà exposée aux
    promptologues) + détection des paquets à **référentiel en dur** (marqueur twin6, fiches
    « ## X.YY — » inline, orchestration ignorant son paramètre `referentiel`) — alerte
    pré-run (drapeau `reserved`, présomption sur le nom sinon) et alerte définitive au run.
  - **Fournisseur/modèle LLM PAR BRANCHE** en A/B (`ProviderPicker` ×2) + température
    (virgule décimale acceptée), pour comparer les LLM entre eux à prompt constant.
  - **Mode « Vs référence importée »** : un JSON de référence (document jour, tableau, ou
    export du banc — `buildRunReport` est réimportable tel quel) comparé au run généré ;
    le marqueur `perimetre.partiel` d'un fichier importé ne court-circuite PAS la
    validation (sonde tolérante systématique — revue adversariale).
  - **Diff de compétences avec traces du jury** (`CompetenceDiff`) : établies d'un côté
    et pas de l'autre, dépliables sur la délibération DES DEUX côtés — pièces du greffier
    avec extraits verbatim résolus (pid→passagesSaillants), présomptions du pédagogue
    (attaques a..h nommées depuis `ATTAQUES`), traces retenues, verdict motivé.
  - **Carnet du banc** (méta-page, `carnet.js`) : markdown éditable rendu via
    `renderMarkdown` (DOMPurify), **configurations emblématiques** nommées rechargeables
    en un clic (instantané complet du banc, clés API JAMAIS persistées — `sanitizeConfig`),
    export/import JSON. Chargement avec réserves signalées si une référence a disparu
    (brouillon supprimé, portfolio effacé, version retirée → replis sûrs).
  - **Estimations honnêtes** : `estimateRun` paramétrable (`callsPerDay`, `mergeCalls`) —
    le banc estime ce qu'il exécute vraiment (pôles retenus, 0 récit de fusion) ; en
    périmètre restreint l'écart était d'un facteur ~77 (vérifié navigateur : 0.02 $ vs
    1.71 $ affichés avant).
  - Robustesse (revue adversariale 25 agents, 20 constats confirmés TOUS corrigés) :
    verrou synchrone anti double-clic, résultat précédent conservé jusqu'au succès
    suivant, interruption volontaire = statut neutre + rapport partiel des runs multi
    achevés, pré-vol du périmètre sur les DEUX référentiels en A/B double-référentiel,
    `name` sur tous les groupes radio (a11y), progression Twin6 « Phase i/8 » et
    multi-run préfixée « Run i/n », portfolio sans journée datée signalé à la sélection.
  - Rapports enrichis (`configurations` par branche dans le rapport A/B, union des
    journées des deux côtés), aide contextuelle mise à jour (help/registry).
  - Vérifié navigateur (compte promptologue dev, mock) : run restreint, A/B
    moteur-vs-sandbox avec périmètre, carnet persistant restaurant toute la configuration
    après rechargement, zéro erreur console. Suites : moteur **945**, web **870** (+50),
    build de production OK. Déployé (static) le 2026-07-17 avec D16 (autorisation utilisateur).

- 2026-07-17 — **Bord gauche fiabilisé : déclenchement GÉOMÉTRIQUE (retour utilisateur).**
  L'utilisateur signalait que le bord gauche n'ouvrait pas le menu. Deux causes distinctes :
  (1) son serveur de dev ne tournait plus (page en cache navigateur = ancien code) — HMR
  vérifié fonctionnel sur Dropbox/CloudStorage, pas de config à changer ; (2) un vrai bug
  reproduit en navigateur : le déclenchement par survol d'élément (`pointerenter` sur la
  réglette) est structurellement fragile — souris DÉJÀ posée sur le bord au chargement
  (l'événement part avant le montage React) ou glissant LE LONG du bord = aucune frontière
  franchie, bord mort. Remplacé par une **veille géométrique** : écouteur `pointermove` du
  document (actif menu fermé et non épinglé), x ≤ 12 px = zone, transitions seulement.
  Gardes (audit 4 agents + revue adversariale 14 agents, 3 corrections intégrées) :
  tactile ignoré, glisser (`buttons`) ignoré, surfaces bloquantes (`aria-modal`, éditeur
  plein écran) suspendent le bord, appui souris annule l'attente, Échap DÉSARME le bord
  jusqu'à une vraie sortie de zone (pas de réouverture au frémissement), les entrées
  bloquées ne consomment pas la transition (le bord revit dès la levée du blocage), pas
  d'ouverture-éclair en sortie de fenêtre (fausse-positive en glisser-sélection ; fenêtre
  maximisée le curseur se cale à x=0 et la voie normale suffit). La réglette devient
  purement décorative (`pointer-events:none`, surbrillance `is-hot` posée par la veille) ;
  sortie du panneau vers la page = grâce courte, vers hors-fenêtre = grâce longue (lecture
  du `relatedTarget` NATIF, React substitue `window` au synthétique). Vérifié navigateur
  (scénario mort rejoué : souris posée sur le bord + rechargement + glissement le long du
  bord → ouverture ; Échap/désarmement/réarmement). Suites : web **820** (28 tests App).

- 2026-07-17 — **Menu au survol persistant + réglette du bord gauche (demande utilisateur).**
  Le va-et-vient bouton (droite) ↔ panneau (gauche) était pénible : l'aperçu au survol
  (CSS pur, grâce de 0,32 s) se rétractait pendant la traversée de l'écran. L'ouverture au
  survol passe en JS (`App.jsx`, souris uniquement — `pointerType !== 'touch'`) : ouverture
  différée de 150 ms (filtre les passages), **grâce de traversée de 1,6 s** après avoir quitté
  le déclencheur, annulée en entrant dans le panneau ; en ressortant du panneau, fermeture
  après 350 ms. Une ouverture née du survol se referme donc seule ; née d'un clic, elle attend
  clic extérieur/Échap/route comme avant (un clic sur le bouton pendant l'aperçu CONFIRME au
  lieu de refermer). **Réglette `.app-menu-edge`** : fine bande toujours visible au bord gauche
  (3 px d'accent, cible de survol 12 px, `hover: hover` seulement, aria-hidden) qui ouvre le
  panneau sans aller chercher le bouton. L'ancienne règle `.app-menu:hover` et le délai CSS
  sont retirés (source unique : l'état React) ; `:focus-within` clavier inchangé. Au passage,
  `vite.config.js` honore `PORT` (plusieurs serveurs dev en parallèle, défaut 5173 inchangé).
  Vérifié navigateur (survol bouton → panneau ouvert pendant la traversée → fermeture en
  sortie ; survol du bord gauche → ouverture). Suites : web **813** (+4).

- 2026-07-17 — **D14sexies — Vues préconfigurées par persona + tutoriels de l'interface V3.**
  - **Cinq vues** dans le sélecteur *Mode* : {Simplifié, Employeur, Apprenant, Cartographe, Expert}.
    Chacune est un préréglage de panneaux ET de disposition de tuiles déduit du rôle dans
    l'écosystème : *Employeur* (lire les forces et leurs preuves : soleil, indicateurs, légende,
    portfolio, partage), *Apprenant* (explorer et se comparer à soi : soleil, heatmap, timeline,
    comparaison, portfolio pleine largeur), *Cartographe* (relire et garantir : arbre + portfolio
    côte à côte, audit d'import + arbitrage, soleil de contrôle — sans éditeur JSON), *Expert*
    (tout). Un mode reste un NIVEAU DE PRÉSENTATION (§4) : l'audience borne toujours ; la
    disposition de tuiles est mémorisée PAR VUE (`humanome-v3-tiles-<mode>`), le mode choisi est
    restauré au retour.
  - **Tutoriels dans les guides** (`#/guides`) : trois nouveaux chapitres structurés en BESOINS
    LOGICIELS par persona — ce que chacun doit voir et pourquoi, panneau par panneau :
    `apprenant/07` (explorer, « Pourquoi ce rayon ? », droit de réponse, comparaison ipsative,
    partage), `employeur/06` (résumé des forces, preuves contextualisées, provenance/récence, ce
    que la vue ne montre JAMAIS par conception, bon usage en entretien), `cartographe/07`
    (provenance, anomalies à 4 gravités, arbitrage des variantes, file de revue, méthode de
    relecture). `SUMMARY.md` (GitBook) régénéré : 86 entrées.
  - Vérifié navigateur : les 5 vues rendent leurs panneaux respectifs, le mode est mémorisé, le
    chapitre apprenant se charge dans `#/guides`. Suites : web **809** (+1).

- 2026-07-17 — **D14quinquies — Titres-boutons de réinitialisation (arbre et heatmap).**
  Le soleil se réinitialisait déjà (clic hors du disque ou au centre) ; l'arbre et la heatmap n'avaient
  pas d'équivalent. Pour économiser l'espace (demande utilisateur), les titres `h3` **« Référentiel »**
  (arbre) et **« Journées »** (heatmap) deviennent des BOUTONS de réinitialisation, libellés inchangés
  (sémantique de titre conservée : `h3 > button`, aria-label explicite, affordance ⟲ au survol/focus).
  - « Référentiel » retire le filtre de portée (même geste que le centre du soleil) — les branches
    OUVERTES ne sont pas touchées (états séparés, spec §3.4).
  - « Journées » réinitialise la journée inspectée et l'année visible — la tête de lecture appartient
    à la timeline et n'est pas modifiée (AC-SYNC-04).
  - Vérifié navigateur (filtre → reset, inspection → reset). Suites : web **808** (+1).

- 2026-07-17 — **D14quater — Tuiles V3 : redimensionnement à la souris + mémoire du mode.**
  - **Redimensionnement au pointeur** (souris, doigt, stylet — pointer events) : poignée ◢ au coin
    bas-droit de chaque tuile ; le geste est **quantisé sur la grille virtuelle** (cellule la plus
    proche, bornée 1..colonnes × 1..6) et appliqué EN DIRECT — la grille CSS (auto-flow dense)
    **réagence les autres tuiles pendant le geste sans les redimensionner** ; la taille finale n'est
    persistée qu'au relâchement. Une taille libre hors préréglages s'affiche telle quelle (« 3×2 »)
    dans le menu, qui reste le chemin clavier/lecteur d'écran. Contenu de la tuile désactivé pendant
    le geste (pas de sélection parasite), contour accentué.
  - **Mémoire de présentation** (§14.4) : le mode expert/simplifié ET les panneaux visibles par mode
    sont restaurés en revenant sur la vue (localStorage `humanome-v3-presentation`, distinct des
    données d'évaluation) ; `renderedPanels` ré-intersecte toujours `availablePanels` — une préférence
    mémorisée ne réaffiche jamais un panneau interdit (AC-UI-04 préservé).
  - Vérifié navigateur : geste +450/+300 px sur la Heatmap → 2×1 → 3×2 en direct (marqueur visuel,
    rien de persisté pendant le geste) → commit au relâchement → **rechargement complet : mode expert
    ET taille 3×2 restaurés**. Suites : web **807** (+2).

- 2026-07-17 — **D14ter — Mode expert V3 : pleine largeur + grille de tuiles éditable (demande
  utilisateur ; anticipe la « personnalisation avancée » V3.1 §25.2).**
  - **Pleine largeur** : les routes V3 (`#/cartographie`, `#/merge` démo) échappent au plafond de
    1240 px (`.app-main--full`) ; le mode simplifié reste borné à 1500 px centré pour la lisibilité.
  - **Grille de tuiles (mode expert)** : chaque panneau devient une tuile **réordonnable** (glisser-
    déposer par poignée ⠿ + boutons ◀ ▶ pour tactile et clavier — le DnD HTML5 n'existe pas au doigt)
    et **redimensionnable** par tailles prédéterminées (1×1, 2×1, 1×2, 2×2, 1×3, 3×1, 3×2, 2×3, 3×3,
    pleine largeur ×1/×2). **Colonnes adaptées à l'espace** (~340 px/colonne, bornées 1–12) :
    téléphone portrait 1, paysage 2, tablette 2-3, moniteur 3-4, 2560 px → 7, 4K → 11, 8K → 12
    (plafonné). Empans bornés aux colonnes disponibles au rendu ; contenu défilant dans la tuile ;
    cibles tactiles ≥ 40 px. `ResizeObserver` + repli `window.resize` (RO muet observé dans certains
    panes embarqués). Disposition persistée en préférence de présentation (`localStorage`, §14.4 —
    jamais dans les données d'évaluation).
  - Vérifié navigateur : 11 tuiles en expert, redimensionnement 3×3 du soleil appliqué et persisté,
    réordonnancement par boutons, 1 colonne à 375 px / 2 à 812 px paysage / 7 à 2560 px, aucun
    débordement horizontal. Suites : web **805** (+7 : logique et composant de la grille).

- 2026-07-17 — **D14bis — Soleil V3 : look carto-phone + disposition ADDITIVE (décisions utilisateur).**
  Deux retouches demandées après livraison, la seconde étant un **écart assumé à la spec §11.1** :
  - **Look carto-phone** (`prototype cartographies/carto-phone.html`) : deux couronnes (familles
    colorées à l'intérieur, compétences à l'extérieur), cinq bandes grises graduées de référence
    (l'échelle du prototype, opacité 0,4 clair / 0,3 sombre), cercles pointillés concentriques,
    séparateurs clairs, **atténuation grisée** des secteurs non survolés, centre en dégradé doux
    cliquable (proportions 8 % / 48 % du prototype). Rayon inchangé = journées documentées (log2).
  - **Disposition additive** : seules les compétences DOCUMENTÉES à la tête de lecture occupent un
    angle — montrer les 61 emplacements exposait les manques, contre l'esprit ipsatif (« l'écart à la
    spec §11.1/§13.2 est un choix produit explicite », décision utilisateur du 2026-07-17). Les angles
    restent égaux entre secteurs visibles (familles contiguës) ; **l'animation depuis le passé AJOUTE
    les secteurs** (vérifié navigateur : 11 secteurs à la 1ʳᵉ journée → 40 après dix journées → 54 à
    l'état complet) ; une famille sans compétence documentée n'apparaît pas encore ; le filtre
    n'enlève pas un secteur, il l'atténue (la disposition ne dépend que de la tête de lecture) ;
    état vide expliqué (« les secteurs apparaîtront au fil de la lecture »).
  - Suites : web **798** ; l'arbre et le tableau accessible continuent de lister tout le référentiel
    (la navigation reste complète, seul le SOLEIL est additif).

- 2026-07-17 — **D14 (v1.2) — Interface de cartographie ipsative V3 (périmètre initial §25.1).**
  Implémente `prototype cartographies/specifications-fonctionnelles-interface-v3.md` et **remplace
  l'interface de consultation existante** : `#/cartographie` (nouvelle route, nav mise à jour) et
  `#/merge` (démo) rendent l'interface V3 ; l'ancienne MergeView ne subsiste que pour un document
  `cartographie-merge` chargé par l'utilisateur (la V3 exige un adaptateur par format, spec §7) et
  pour les vues embarquées (Twin6/Twin9/espace/partage). **Entièrement client-first (ADR-001) : le
  master privé ne quitte jamais le navigateur, zéro changement d'API.**
  - **Cœur logique** `web/src/v3/core/` (10 modules, 47 tests) : identifiants stables UUIDv5 dérivés
    des octets immuables (AC-DATA-03/09) ; adaptateurs historiques carto_Pn/kairos/document-jour avec
    rapport 4 gravités (référence pendante, numéro dupliqué, trace-par-pid : alerte, jamais de
    devinette — §6.4) ; import avec quarantaine (AC-DATA-01) et variantes concurrentes « à arbitrer »
    jamais additionnées (AC-DATA-02) ; admissibilité §10 (établie + non court-circuitée + ≥1 preuve
    résolue non contestée + variante active — la confiance du verdict n'entre jamais, AC-DATA-05) ;
    métriques versionnées documented-days/months/public-presence-v1 avec rayon log2 plafonné (§11) ;
    révisions immuables + droit de réponse confirmer/nuancer/contester (AC-EDIT-01→04) ; comparaison
    ipsative par préréglages + récit déterministe référencé (AC-REFL-01/02) ; calcul des panneaux
    availablePanels = format ∩ audience ∩ mode (AC-UI-04) ; projet de partage par LISTE POSITIVE avec
    cases 3 états, cascades §18.5, constructeur 8 étapes avec REMAPPAGE d'identifiants par projection
    (AC-SHARE-07), anti-fuite des verbatims exclus (AC-SHARE-12, mémoïsé), précision temporelle
    jour/mois/masquée avec métrique assortie (AC-SHARE-10/17/19), verrou de prévisualisation
    sourceDigest/policyDigest/outputDigest (AC-SHARE-15), confirmation d'irrévocabilité (AC-SHARE-13) ;
    JSON canonique trié + digest SHA-256 (§19.4) ; réimport avec contrôle d'intégrité bloquant
    (AC-SHARE-20) et duplication monotone sans lien au master (AC-SHARE-18) ; lecteur ZIP sans
    dépendance (chemins traversants rejetés) ; persistance IndexedDB séparée des préférences.
  - **UI** `web/src/v3/ui/` : arbre + soleil (angles FIXES par compétence, rayon = journées
    documentées, halo, contours fantômes du futur) + heatmap (grille clavier, jours multidomaines
    rayés, seuils fixes §11.3) + portfolio (provenance, revue, note privée, inclusion au partage) +
    lecteur temporel (avant/arrière/vitesse, inspection ≠ tête de lecture, AC-SYNC-03/04) ;
    « Pourquoi ce rayon ? » (unités exactes de la métrique courante, AC-SYNC-05) ; comparaison +
    « Ce qui a changé » ; modes simplifié/expert conservant l'état (AC-UI-01) ; panneaux masquables
    avec « Réafficher » toujours accessible (AC-UI-03) ; thèmes système/clair/sombre + distinctions
    renforcées (symboles/motifs par famille) + impression (tableau équivalent au soleil) ; éditeur
    JSON expert refusant l'invalide (AC-EDIT-02) ; constructeur de partage avec récapitulatif avant
    inclusion groupée (AC-SHARE-14) ; vue employeur = MÊME moteur que la prévisualisation (§18.8).
  - **Vérifié au navigateur sur le corpus RÉEL** (59 journées) : 61 emplacements, **54 secteurs
    documentés** (= les 54 compétences établies du corpus), 365 cellules ; le rapport d'import a
    attrapé une **vraie anomalie du corpus** (numéro de pièce dupliqué, 5.02 au 2026-02-14 — le cas
    §6.4) ; filtre soleil→arbre→heatmap synchronisés ; inspection sans déplacement de lecture ;
    parcours de partage complet → prévisualisation exacte (54 forces). Perf corpus entier : import
    210 ms, inclusion groupée 1795 liens 215 ms, instantané + anti-fuite 181 ms (§22.2).
  - Suites **toutes vertes : PHP 518 (inchangé), engine 938 (inchangé), web 798 (+47)**.
  - **Reste pour les itérations suivantes** (documenté, hors périmètre initial strict) : adaptateur
    cartographie-merge (§7 : à déclarer compatible avec tests), corpus multi-ZIP réel Christ300 à
    valider sur pièce, préférences persistées par appareil (§14.4 — store prêt), impression mensuelle
    dédiée, V3.1 (liens hébergés, fusion sélective, caviardage).

- 2026-07-17 — **D13 (v1.2) — Restauration des versions de gabarit Twin9 (retour arrière).**
  L'archivage automatique existait (chaque écrasement versionne l'ancien contenu) mais le « retour
  arrière » promis par ADR-010 §6 n'était pas implémenté : l'historique n'exposait que des métadonnées,
  sans lecture ni restauration. C'est fait — et **jamais destructif**.
  - **Repository** : `ProtocoleRepository::version(name, v)` (contenu d'une version archivée) et
    `restore(name, v, userId)` — la restauration passe par `put()` : le vivant est archivé D'ABORD,
    puis le contenu archivé redevient vivant. L'histoire reste complète (l'état pré-restauration est
    lui-même récupérable) ; restaurer un contenu identique au vivant = no-op annoncé.
  - **Routes** (garde conjonctive admin ∧ promptologue, comme le contenu vivant) :
    `GET /twin9/admin/protocole/{name}/versions/{version}` (lecture) et
    `POST /twin9/admin/protocole/{name}/restore {version}` (422 version manquante, 404 inconnue).
  - **Atelier** (`#/twin9-atelier`) : colonne Actions dans l'historique — « Voir » (aperçu texte brut
    de la version archivée, jamais de HTML) et « Restaurer » (recharge l'éditeur + l'historique).
  - **Tests** : PHP (restauration non destructive + no-op + validations + garde de rôles : un admin
    SEUL → 403 sur lecture ET restauration), web (parcours Voir/Restaurer complet). Suites **toutes
    vertes : PHP 518, engine 938, web 751**.
  - **Vérifié au navigateur** (compte atelier dédié, gabarit FICTIF créé pour l'occasion puis purgé) :
    v2 vivante → « Voir » montre la v1 archivée → « Restaurer » → le vivant redevient v1, message
    français, historique à 2 versions (v1 originale + v2 ex-vivante) — rien d'écrasé.

- 2026-07-17 — **D12 (v1.2) — Résultat Twin9 dans le sunburst évolutif + stockage opt-in RGPD.**
  Le résultat d'une analyse approfondie (carto_evolutive.json) n'était rendu que dans sa vue dédiée
  (jauges + narratifs) ; il alimente désormais **le même sunburst évolutif** que toute cartographie,
  et devient **conservable à long terme** sous le même contrat d'opt-in RGPD.
  - **Adaptateur moteur** `engine/src/twin9/mapper.js` (`twin9ToMergeDocument`) : reconstruit un
    document-jour par journée ATTESTÉE (attestation = présence établie avec ses scores du jour ;
    signal de renvoi daté = renvoi au cartographe ; `jour_index → date` résolu sur TOUTES les
    compétences — **jamais de date inventée**, un signal non datable est ignoré et documenté), puis
    réutilise `mergeDays` + `buildMergeDocument` (aucune logique d'agrégation/quintiles/archétypes/
    ipsatif dupliquée — même patron que l'adaptateur Twin6). Narratifs pris dans carto_evolutive
    (histoires, rapports de pôle, kairos). Fichier NOUVEAU, hors périmètre de parité CPython.
  - **Vue résultats** : section « Cartographie évolutive — sunburst » (MergeView + timeline) quand le
    référentiel est là ; dégradation silencieuse sans journée datée. Bouton **« Enregistrer dans mes
    cartographies »** : sauvegarde LOCALE du carto_evolutive NATIF (type `twin9`), masqué en démo ;
    la **copie serveur reste un choix explicite daté** via le panneau existant (POST /api/cartographies
    = la décision, `opt_in_at` horodaté). Migration `021` (ENUM + 'twin9'), route élargie,
    visionneuse de l'espace re-dérive la vue merge du document natif stocké, panneau étiqueté.
    `confidentialite.md` documente le stockage opt-in du RÉSULTAT (jamais le portfolio).
  - **Tests** : mapper moteur (11, dont vecteur figé réel + règles fines et « strictement valide au
    schéma » sur fixture 7 pôles), web (sunburst/save/démo-sans-save, visionneuse twin9, store),
    PHP (opt-in twin9). Suites **toutes vertes : PHP 516, engine 938, web 750**.
  - **Vérifié au navigateur** (démo Twin9 de bout en bout) : run mock → **sunburst réel** (15 secteurs,
    couleurs des pôles, timeline évolutive « Feuille 2 / 2 — 05/03/2026 · score du jour 2 »), bouton
    d'enregistrement correctement ABSENT en démo.

- 2026-07-17 — **D10 (plan v1.1) — Garde-fou de publication + structure GitBook (parties
  autonomes).** Le dépôt est déjà public (`4nd4ny/humanome`, historique purgé au jalon précédent) ;
  cette session en industrialise la publiabilité et prépare GitBook. Les actions restantes sont
  **côté utilisateur** (voir plus bas).
  - **Garde-fou automatisé** `scripts/check-publiable.mjs` : refuse, dans les fichiers **suivis**,
    (a) un répertoire de gabarit Twin9 (`golden-twin9/`, `twin9-oracles/`, `golden-prompt/`),
    (b) un `.env` réel ou un `.pyc`/`__pycache__`, (c) un secret en clair (forme de clé `sk-ant-`,
    `PAYPAL_SECRET`, `*_PASSWORD`), (d) un chemin local absolu (`/Users/…`), (e) un identifiant OVH
    réel (hôte/cluster). Placeholders et fixtures sur liste blanche (`EXEMPLE`, `change-me`, `_dev`,
    répertoires de test) ; la règle mot de passe s'assouplit dans les tests mais clé/OVH/chemin
    restent actifs partout. **Validé par un canari** (4 types détectés sur 4). Le garde-fou a d'ailleurs
    **débusqué un résidu réel** : les identifiants OVH nommés dans une vieille entrée `STATUS.md`
    (méta-référence à la purge) — neutralisés.
  - **Hook** `.githooks/pre-commit` (activé : `git config core.hooksPath .githooks`) + **CI**
    `.github/workflows/publiable.yml` (garde-fou + suite moteur). Le hook s'est déclenché et a
    bloqué/validé les commits de cette session (vérifié en direct). La suite **front** est
    volontairement hors CI : ses fixtures importent des données **générées** (`web/public/data/**`,
    gitignorées, chaîne convert/generate multi-étapes — vérifié en clean-room qu'elle échoue sur un
    checkout nu) ; elle tourne en local, comme la suite **PHP** (Docker). Pas de CI rouge au 1ᵉʳ push.
  - **GitBook** : `.gitbook.yaml` (root `./`, readme, summary) + `SUMMARY.md` **généré** par
    `scripts/build-gitbook-summary.mjs` depuis l'arbre de doc (9 parcours `content/formation/**` +
    docs `docs/**` + ADR), **83 entrées, 100 % des liens résolus**. La doc reste éditée en markdown
    dans le dépôt (source unique) ; GitBook n'en est qu'un rendu.
  - **README** : badges (site, licence AGPL-3.0, CI) + section « Documentation ».
  - **✅ PUBLIÉ** (autorisation utilisateur 2026-07-17) : `git push origin main` (26 commits) +
    **tag `v1.1.0`** sur **https://github.com/4nd4ny/humanome** (le push git passe par le trousseau
    macOS, valide, indépendamment du token `gh`). Delta re-scanné avant push : propre.
  - **⏳ RESTE À L'UTILISATEUR** : 1) créer/associer l'**espace GitBook** et activer le **Git Sync**
    (pas d'API d'upload) ; 2) renseigner l'URL GitBook dans le README. (Aucun changement de code
    applicatif : suites inchangées vs D9 — **PHP 515, engine 927, web 743**.)

- 2026-07-17 — **D9 (plan v1.1) — Assistant tuteur interactif (Haiku).** Un panneau « 💬 »
  répond, pour n'importe quel visiteur, aux questions « par où passer sur le site ». Le prompt
  système est construit CÔTÉ SERVEUR à partir d'un digest de la doc et du rôle (déterminé par la
  SESSION, jamais par un champ client) ; **le portfolio n'est JAMAIS transmis** — seulement la
  question et la rubrique courante. **Aucune conversation stockée côté serveur** (compteurs
  anonymes) ; l'historique vit en `sessionStorage`, le temps de la session.
  - **Backend** : `api/src/routes/tuteur.php` — `POST /tuteur` protégé par la MÊME preuve de travail
    que la démo + honeypot + quota IP ; **budget propre** (circuit breaker quotidien sur une table
    dédiée `tuteur_usage_daily`, `TUTEUR_BUDGET` = **1 $/jour** par défaut, Q3), modèle Haiku
    (`TUTEUR_MODEL`). Migration `020_tuteur_usage.sql`. `UsageCounters` paramétré (table sur liste
    blanche) pour ne pas toucher au compteur de la démo. `CsrfMiddleware` exempte `/api/tuteur`.
  - **Digest** : `scripts/build-tuteur-digest.mjs` génère `scripts/data/tuteur-digest.md` depuis les
    familles de `nav.js` + les frontmatters `content/` (9 parcours, ~6,2 Ko) ; **régénéré à chaque
    `stage-api`** — comme les prompt-packages, seul le générateur est versionné (artefact gitignoré,
    évite la dérive).
  - **Front** : `web/src/components/TuteurPanel.jsx` + `web/src/lib/tuteur.js` (PoW puis POST, n'envoie
    que question + rubrique), branché dans `App` après l'aide ; styles `.tuteur`. RGPD :
    `content/legal/confidentialite.md` gagne un point « Assistant tuteur ».
  - **Deux bugs attrapés par la vérification au navigateur** (là où MockProvider diverge du vrai
    fournisseur) : (1) *nonce* — `solvePow` renvoie `{nonce, attempts}`, `tuteur.js` prenait l'objet
    entier ; corrigé + mock de test rendu fidèle. (2) **`[]` en prod** — `AnthropicProvider::complete()`
    **force l'usage d'outil** (JSON garanti pour la démo/Twin9) ; le tuteur héritait de ce mode et
    Haiku renvoyait un document vide « [] » au lieu de prose. Corrigé par un paramètre
    `forceJsonDocument` (défaut `true` = comportement démo/Twin9 inchangé ; `false` pour le tuteur =
    **texte libre**). Rendu : le modèle produit quand même du Markdown léger (**gras**) ; le panneau
    n'a **pas de parseur Markdown** (surface XSS réduite) → on retire les marqueurs inline
    (`stripLightMarkdown` : `**`, `__`, backticks) CÔTÉ CLIENT, garanti quel que soit le modèle.
  - **Tests** : `api/tests/TuteurTest.php` (8) — pas de fuite du prompt/clé, PoW requis, honeypot,
    budget dédié distinct de la démo, visiteur **et** connecté, **le vrai chemin `AnthropicProvider`
    renvoie de la prose ET la requête amont ne porte pas `tool_choice`** (le discriminant que le mock
    masquait), **tarification Haiku non nulle** (le plafond dollar peut effectivement se déclencher).
    Front : `tuteur.test.js` + `TuteurPanel.test.jsx` (dont le strip Markdown). Suites **toutes
    vertes** : **PHP 515, engine 927, web 743**.
  - **✅ DÉPLOYÉ EN PRODUCTION** (API `020` + static, puis 2 redéploiements API — correctifs prose et
    texte brut — et 1 redéploiement static — strip Markdown) — API `v1.0.0-54`. **Vérifié en ligne**
    depuis un état vidé : réponses en **prose française cohérente** citant les vraies routes du digest
    (`#/merge`, `#/essayer`, `#/referentiel`, `#/guides/cartographe`, « 7 pôles et 61 compétences
    RESPIRE ») ; le rendu ne montre **aucun marqueur Markdown** (vérifié : la sortie brute du modèle en
    contient, le panneau les retire). `migrate` HTTP 200 (`020` appliqué), `health` HTTP 200.

- 2026-07-16 — **D11 (plan v1.1) — Renommage Twin_v9 → Twin9 dans l'artefact moteur.**
  L'en-tête du rapport évolutif téléchargeable dit enfin « Twin9 » (dernier résidu du renommage global).
  - Source Python `../Twin_v9/aurora/merge3.py` (hors dépôt) : ligne d'en-tête `"*Twin_v9 — %s — %d
    journées …"` → `"*Twin9 — …"` (SEULE cette ligne ; le champ `version:"Twin_v9"` de
    carto_evolutive.json reste GELÉ, contrat de parité).
  - `engine/src/twin9/merge.js` : même chaîne → « Twin9 ».
  - Vecteur figé `merge.vec.json` **régénéré depuis le Python renommé**
    (`python3 engine/test/twin9-vectors/gen_merge_scan_vectors.py`) : seule la ligne d'en-tête de
    `rapport_evolutif_md` change, `scan.vec.json` **inchangé** (pas de hand-édition d'oracle). Régénération
    documentée dans `merge.test.js`.
  - `renommage.test.js` : `it.skip` « en-tête dit Twin9 » **réactivé** (passe), ligne d'en-tête **retirée**
    de la liste blanche du lint (ne reste que le champ version gelé).
  - **Parité CPython INTACTE** (`parite.test.js`, 6 oracles, `plant01` bit-à-bit) ; `merge.vec` à jour.
  - Suites : **engine 927 (plus de skip)**, PHP 507, web 737 ; build front OK (le bundle porte « Twin9 — »).
  - **✅ DÉPLOYÉ EN PRODUCTION** (front **static**, le moteur est bundlé côté client) : app 200.

- 2026-07-16 — **D8 (plan v1.1) — Audit adversarial des paiements et crédits.** Audit OFFENSIF du
  système de crédits prépayés Twin9/Twin6 (8 angles, un test par angle). **Verdict : aucune
  vulnérabilité** — les défenses posées au durcissement #29 tiennent. Rien à corriger, donc **rien à
  déployer** (test + doc seulement). Détail (sobre, sans exploitation) dans `docs/securite-checklist.md`
  § « Audit adversarial paiements & crédits (D8) ».
  - Nouveau `api/tests/Twin9SecurityAuditTest.php` (6 tests, 28 assertions) confirmant les variantes
    non encore explicitement couvertes : montant crédité = capture PayPal (jamais le pack ni un champ
    client, angle 3) ; débit atomique anti-découvert (4) ; remboursement d'autrui refusé, plafonné à la
    room, jamais négatif (5) ; grand-livre/factures cadrés par session, pas d'IDOR (8). Angles 1/2/5
    (déjà) `Twin9PayPalTest`, 6 `LlmPowTest`/`LlmProxyTest`, 7 `Twin9AppelTest`.
  - Suites **toutes vertes** : **PHP 507, engine 926 (+1 skip), web 737**. (Pas de déploiement : aucun
    changement de code de production.)

- 2026-07-16 — **D7 (plan v1.1) — Typographie iA Writer Quattro (auto-hébergée).**
  Toute la police du site passe à **iA Writer Quattro** (AD-D5), auto-hébergée.
  - **Fichiers** : 4 graisses woff2 (Regular/Italic/Bold/BoldItalic, ~172 Ko au total) + licence
    **SIL OFL 1.1** (`OFL.txt`) dans `web/public/fonts/quattro/` (récupérées de `iaolo/iA-Fonts`,
    copiées telles quelles dans le build). Seules les graisses utilisées sont chargées ; hors bundle JS.
  - **CSS** : `@font-face` (4, `font-display:swap` → FOUT accepté, pas de FOIT) + pile corps
    `'iA Writer Quattro', system-ui, …`. Pile **monospace inchangée** (système `ui-monospace`) :
    iA Writer Mono non embarquée en v1.1 (choix noté en commentaire).
  - **CSP** : ajout explicite de `font-src 'self'` dans `web/public/.htaccess` (les polices même-origine
    étaient déjà couvertes par `default-src 'self'` — explicite pour la clarté/défense) ;
    `docs/securite-checklist.md` mis à jour.
  - **Vérifié au navigateur** : `document.fonts.check()` = **true**, body en iA Writer Quattro, les 2
    woff2 (Regular/Bold) → **200** (aucun blocage CSP), rendu appliqué partout, 0 erreur console.
    L'impression hérite de la police (aucune surcharge `@media print`).
  - **Test** : `web/src/styles/fonts.test.js` (garde anti-régression : 4 @font-face + swap + pile corps
    + présence des woff2/licence + aucune origine tierce de police).
  - Suites **toutes vertes** : **PHP 501, engine 926 (+1 skip), web 737**, build web OK (fonts copiées
    dans `dist/fonts/quattro/`).
  - **✅ DÉPLOYÉ EN PRODUCTION** (front **static**) : `GET /fonts/quattro/iAWriterQuattroS-Regular.woff2`
    → **200**, header CSP prod contient bien `font-src 'self'`.

- 2026-07-16 — **D6 (plan v1.1) — Profil : avatar et édition (dépend de D5).**
  Ajout d'une photo/avatar + modification de l'identifiant dans le profil (AD-D4).
  - **Migration 019** : `users.avatar` (MEDIUMBLOB NULL) + `users.avatar_mime` — avatar EN BASE (pas de
    FTP), purge RGPD gratuite par la ligne `users`.
  - **API** : `PATCH /auth/me {displayName}` (édition du nom) ; `PUT /auth/me/avatar {avatar (base64),
    mime}` — le serveur **valide mime (JPEG/PNG/WebP) + magic number + taille ≤ 200 Ko** (jamais confiance
    au client, `Media\AvatarValidator`) ; `DELETE /auth/me/avatar` (retrait indépendant) ;
    `GET /users/{id}/avatar` (cache privé, 404 si absent). `/auth/me` expose `hasAvatar`. CSRF/session.
  - **Front** : section « Profil » éditable (nom via Modifier/Enregistrer ; avatar : redimensionnement
    canvas client ~256 px → ≤ 200 Ko WebP/JPEG `lib/resize-image.js`, aperçu, ajout/retrait). Composant
    `Avatar` (image ou **initiales en repli**), affiché aussi dans le panneau de nav près de
    « Se déconnecter ». **Vérifié au navigateur** bout-en-bout (repli initiales → upload PNG réel via
    canvas → servi comme avatar → retrait → retour aux initiales), 0 erreur console.
  - **RGPD** : `docs/rgpd-registre.md` §1 (photo = donnée personnelle, retrait indépendant + cascade).
  - **Tests** : PHP (`AuthAvatarTest` : PATCH nom, PUT valide JPEG/PNG/WebP, refus mime/magic/taille/
    base64, DELETE, GET 200/404, purge avec le compte, session requise, pas d'IDOR) ; web
    (`Avatar` initiales/img, `resize-image` recadrage/encodage/plafond, `AccountView` édition nom +
    upload + retrait).
  - Suites **toutes vertes** : **PHP 501, engine 926 (+1 skip), web 733**, build web OK.
  - **✅ DÉPLOYÉ EN PRODUCTION** (release `v1.0.0-46-g4b5cb3d`) : migration 019 appliquée, health ok,
    front redéployé. Smoke prod : `GET /users/{id}/avatar` → **404** (route vivante, colonne avatar OK) ;
    `PATCH /auth/me` non authentifié → **401**.

- 2026-07-16 — **D5 (plan v1.1) — Inscription durcie : double email, activation par code à 4 chiffres.**
  Un compte n'est ACTIVÉ qu'après confirmation d'un code envoyé par email (AD-D3).
  - **Migration 018** : `users.email_verified_at` (NULL = non activé), `verification_code_hash`,
    `verification_expires_at`, `verification_attempts` (+ index). **Backfill** : les comptes existants
    (dont la prod) sont réputés vérifiés (`email_verified_at = created_at`).
  - **Service Mailer** (`api/src/Mail/`) : interface + `PhpMailMailer` (`mail()` OVH, expéditeur
    `MAIL_FROM` défaut **no-reply@humanome.xyz** — pas de modif de `~/app/shared/.env`) + `MemoryMailer`
    (fake de test) + `MailerFactory` (couture d'injection). Mail français : lien
    `#/activer?email=…&code=XXXX` + code en clair, expiration 30 min.
  - **API** : `register` = double saisie email (insensible casse), crée le compte **NON activé**, envoie
    le code, **n'ouvre pas de session** (201 `pending_activation`). `POST /auth/activate {email, code}`
    active + ouvre la session (« premier login qui confirme »). `login` d'un compte non activé → **403**
    `email_not_verified`. `POST /auth/resend` régénère le code. **Sécurité du code court** : 5 essais
    max/compte, expiration, rate-limit IP sur activate ; le VRAI garde-fou = **renvoi strictement
    limité** (3/h/compte + 10/h/IP). **Anti-énumération** : réponses génériques (compte inconnu / déjà
    activé / code faux → même 401 ; resend → « ok » générique).
  - **Front** : formulaire d'inscription avec email ×2 + identifiant + mot de passe ; écran d'activation
    (saisie du code, renvoi, retour) ; route `#/activer` qui pré-remplit email + code depuis le lien.
    **Vérifié au navigateur** bout-en-bout (inscription → écran d'activation → code → connecté).
  - **RGPD** : `docs/rgpd-registre.md` §1 bis (nouveau traitement, purge par cascade `users`).
  - **Tests** : PHP (`AuthActivationTest` : login bloqué, code faux ×5 + verrou, expiration, renvoi +
    rate-limit, anti-énumération, backfill ; `AuthRoutesTest` : pending + activate + double-email) ;
    web (`AccountView` : double-saisie bloquée, parcours activation, login-403→activation, lien #/activer).
    Rayon d'impact des tests géré : `register()` (helper) = inscription+activation via `MemoryMailer`.
  - Suites **toutes vertes** : **PHP 495, engine 926 (+1 skip), web 723**, build web OK.
  - **✅ DÉPLOYÉ EN PRODUCTION** (release `v1.0.0-44-g05580cd`) : **migration 018 appliquée**
    (`{"applied":["018_email_verification.sql"]}` — backfill des comptes prod existants), health ok,
    référentiel/fiches/paquets « unchanged », front redéployé. **Smoke prod** (compte jetable) :
    `register` → **201 `pending_activation`** (pas de session) ; `login` du compte non activé → **403**
    (garde `email_not_verified` vivante) ; `activate` code faux → **401** générique (anti-énumération) ;
    app 200. L'`mail()` n'a pas erré (register 201).
  - ⚠️ **ACTION UTILISATEUR RESTANTE (Q1)** : vérifier **SPF/DKIM** et l'expéditeur
    `no-reply@humanome.xyz` au **panel OVH** — je ne peux pas lire la boîte d'un compte jetable, donc
    la RÉCEPTION réelle de l'email reste à confirmer côté toi. (`MAIL_FROM` prend le défaut :
    `~/app/shared/.env` prod NON modifié.) Un compte de smoke non activé (@example.org) subsiste en base
    (inoffensif, inutilisable) — purge possible plus tard.

- 2026-07-16 — **D4 (plan v1.1) — Visualisation : thème sombre, synchro heatmap, responsive, export JSON.**
  Quatre défauts corrigés, **vérifiés au navigateur** (#/merge, démo 59 feuilles).
  1. **Thème sombre** : `.timeline-controls button` et `.timeline-speed` avaient `background:#fff`
     SANS `color` → glyphe clair (color-scheme:dark) invisible. Corrigé avec tokens sémantiques
     (`--viz-surface`/`--viz-ink`, explicites sur les deux). Vérifié : glyphes ⏮◀▶▶▶⏭ nets en sombre.
  2. **Synchro** : `HeatmapCalendar` gagne une prop `currentDate` (date de la trame courante, fournie
     par `MergeView`) : les feuilles postérieures passent « à venir » (inertes), celle du jour courant
     surlignée. Vérifié : feuille 1/59 → 1 posée + 58 à venir ; dernière trame → tout posé.
  3. **Responsive** : le SVG passe en `viewBox` + `width:100%` + `preserveAspectRatio:xMidYMid meet`
     (max-width = taille naturelle, conteneur `overflow-x:auto`). Vérifié à 360 px : heatmap 238 px,
     ne déborde pas.
  4. **Export JSON** : util UNIQUE `web/src/lib/download-json.js` (factorisé depuis Twin9) ; bouton
     « Exporter le JSON » ajouté à `EssayerView` (cartographie-jour) et `Twin6OuverteView` (run.doc) ;
     `ResultatsTwin9` réutilise l'util (fin de la triplication).
  - **Tests** : `HeatmapCalendar` (currentDate, à venir, fluidité SVG), `download-json` (objet/chaîne,
     no-op SSR), `EssayerView`/`Twin6OuverteView` (bouton + nom + type du blob), `TimelinePlayer`
     non-régression. Vérif navigateur documentée (sombre + 360 px + heatmap qui se remplit), 0 erreur console.
  - Suites **toutes vertes** : **PHP 487, engine 926 (+1 skip), web 719**, build web OK.
  - **✅ DÉPLOYÉ EN PRODUCTION** (front **static** seul) : app 200. Comportement visuel vérifié au
    navigateur en local (le prod sert le même bundle).

- 2026-07-16 — **D3 (plan v1.1) — Présenter l'offre employeur (moteur de recherche de compétences).**
  Présentation SEULE (AD-D6 : le moteur reste au backlog marketplace) : les tuiles employeur parlent
  enfin de l'offre payante à venir.
  - **FamilyTiles** : la carte persona employeur gagne un second volet « Rechercher des profils
    (à venir) » — abonnement payant qui finance l'accès gratuit à l'API pour les pays émergents, tarif
    **1 USD/cartographie remontée dégressif à partir de 10/100/1000**, facturation forfaitaire avant les
    recherches ajustée le mois suivant (crédits restants reportés), appel à manifestation d'intérêt
    (`mailto:contact@humanome.xyz`, constante `CONTACT_EMPLOYEUR`). Badge « à venir », aucune promesse
    de disponibilité immédiate.
  - **Aide** : entrée `employeur` dédiée (modèle tarifaire en clair + financement pays émergents).
  - **Formation** : nouveau chapitre `content/formation/employeur/05-offre-recherche-de-profils.md`
    (auto-globbé, statut complet, ordre 5).
  - **Doc source de vérité** : `docs/offre-employeur.md` (pricing versionné ; taux dégressifs marqués
    INDICATIFS — le plan ne fixe que base 1 USD + seuils 10/100/1000, pas les taux exacts, pas d'invention).
  - **Tests web** : volet + tarif + contact + « à venir » sans promesse immédiate (`FamilyTiles`),
    chapitre présent et complet (`formation-content`), traçabilité aide (`registry`).
  - Suites **toutes vertes** : **PHP 487, engine 926 (+1 skip), web 712**, build web OK.
  - **✅ DÉPLOYÉ EN PRODUCTION** (front **static** seul, pas de changement API/moteur) : app 200.
    Le volet employeur est rendu côté client (accueil → « Voir les profils » → « Employeur ») —
    vérifié par le test composant `FamilyTiles`.

- 2026-07-16 — **D2 (plan v1.1) — Édition du Twin9 réservée aux administrateurs-promptologues.**
  Décision AD-D2 : garde en **conjonction** admin ∧ promptologue, côté serveur ET front.
  - **Serveur** : nouveau `RequireRole::all(...)` (les DEUX rôles requis). Toutes les routes de
    CONTENU des gabarits Twin9 (`/twin9/admin/protocole**` en lecture/écriture/versions +
    `/twin9/admin/tester`) passent en `all('admin','promptologue')` : un admin non-promptologue ne
    voit plus le contenu (**403**), et le gabarit ne fuite jamais dans un refus. La SUPERVISION
    (config, contribution, promo « Twin9 gratuit », comptes) reste `admin` seul.
  - **Front** : l'éditeur des gabarits quitte l'admin pour une vue dédiée **`#/twin9-atelier`**
    (`Twin9AtelierView`) sous la famille « Faire évoluer », visible seulement si la session porte
    les deux rôles (nouvel attribut de nav `allRoles`, conjonction dans `navGroups`).
    `#/admin/twin9` (`Twin9Section`) garde la supervision (réglages + comptes) et pointe vers
    l'atelier. Le slider promo reste dans la supervision admin.
  - **Sécurité inchangée** : le contenu reste du texte brut (jamais de HTML/markdown) ;
    `/twin9/meta` et le filtre anti-fuite ne bougent pas.
  - **Tests** : matrice de rôles PHP complète (aucun rôle / admin seul / promptologue seul / les deux)
    sur chaque route de gabarits + garde supervision (`Twin9ProtocoleTest`) ; web
    (`Twin9AtelierView.test.jsx` garde 2 rôles + édition/banc d'essai, `Twin9Section.test.jsx`
    supervision seule, `nav.test.js` conjonction, aide `twin9atelier`). Doc : `docs/autorisations.md`.
  - Suites **toutes vertes** : **PHP 487, engine 926 (+1 skip), web 711**, build web OK.
  - **✅ DÉPLOYÉ EN PRODUCTION** (release `v1.0.0-38-gce6cea9`) : migrate skipped 17,
    référentiel/seed/fiches « unchanged », paquets « unchanged », health ok, front redéployé. Smoke
    prod : routes de contenu gabarits (`GET /twin9/admin/protocole`, `POST /twin9/admin/tester`) →
    **401** non authentifié (garde `RequireRole::all` vivante) ; app 200. La distinction admin-seul
    (403) vs admin ∧ promptologue (200) est couverte par la matrice PHP.

- 2026-07-16 — **D1 (plan v1.1) — Twin6 forkable dans l'atelier promptologue.** Le protocole open
  source Twin6 est désormais un **paquet publié forkable** au même titre qu'`aurora-v3-reconstruit`,
  sans changer la page publique `#/twin6-ouverte` (qui sert toujours le JSON statique).
  - **Import** : `scripts/build-twin6-prompt-package.mjs` construit un document `prompt-package`
    (scan-pole + kairos + méga-prompt + 7 fiches en `prompts[]` éditables, `code.orchestration` avec
    marqueur `engine://…(twin6)`) depuis le **même corpus** que le paquet statique. `stage-api.sh`
    régénère les deux paquets (aurora + twin6) avant chaque `deploy.mjs api` (import idempotent par hash).
  - **Byte-identité prouvée** : `twin6-prompt-package.test.js` — scan-pole/kairos/fiches du paquet
    importé === paquet statique (source unique, aucune dérive).
  - **Réservation + fork-with-rename** : `metadata.reserved: true` marque le paquet comme propriété du
    pipeline source-unique ; `POST /prompt-packages/drafts` d'un paquet réservé **exige** un `toId`
    (nouveau nom, slug frais) → le fork est SA copie, publiable sous son propre nom. Le fork mémorise son
    origine (`metadata.forkedFrom`). Garde-fou aussi dans `publishDraft`. `GET /prompt-packages` expose
    le drapeau `reserved` (via `JSON_EXTRACT`, sans migration).
  - **Diff fork ↔ original** : la route de diff existante ne compare que des versions **publiées du même
    id** ; nouvelle route `GET /prompt-packages/drafts/{id}/diff-origin` compare le brouillon (fork) à son
    original (`forkedFrom`) même sous des ids différents — owner-scopé. Bouton dédié dans l'éditeur.
  - **Banc d'essai** : branche Twin6 (`usesTwin6Engine`/`extractTwin6Templates`) → `executerTwin6` sur le
    **portfolio entier** (7 scan-pôle + kairos → `cartographie-merge`), jamais l'extraction aurora par
    jour ; modes multi-run/A-B réservés aux paquets par jour. Accueil de l'atelier : encart
    « Partir du Twin6 ».
  - **Doc** : `docs/contrats.md` §8 (sémantique de version immuable, réservation, exécution déléguée).
  - Suites **toutes vertes** : **PHP 487, engine 926 (+1 skip = D11), web 709**, build web OK.
  - **✅ DÉPLOYÉ EN PRODUCTION** (release `v1.0.0-36-gd52fcd0`) : `migrate` skipped 17,
    référentiel/seed/fiches **« unchanged »** (garde-fou confirme : aucun contenu confidentiel bougé),
    `import-prompt-package twin6-ouverte` → **`imported`** (aurora `unchanged`), health ok. Smoke prod :
    `GET /api/prompt-packages` → `twin6-ouverte reserved:true` ; le doc publié est `kind:prompt-package`
    (10 prompts, marqueur `(twin6)`) ; la page statique `data/twin6/twin6-ouverte-1.0.0.json` répond
    **200 inchangée** ; app 200. Vérif UI interactive du fork couverte par les tests composant (une
    session promptologue en prod donnerait la confirmation live).

- 2026-07-16 — **✅ DÉPLOYÉ EN PRODUCTION** (release `v1.0.0-33`, `/api/health` ok, `migrate` skipped 17,
  seed/référentiel/fiches tous « unchanged » — le garde-fou fiches confirme qu'aucun contenu confidentiel
  n'a bougé ; front `index-DEyhdUY0.js` servi). **Historique git PURGÉ** avant publication
  (`git filter-repo`) : le `.pyc` fuyant un chemin local et les identifiants OVH réels (hôte/cluster)
  retirés de **tout** l'historique (vérifié : 0 occurrence sur `git rev-list --all`) ; tag `v1.0.0` conservé,
  69 commits réécrits, sauvegarde `../humanome-backup.bundle` rafraîchie. **✅ PUBLIÉ OPEN SOURCE**
  sur **https://github.com/4nd4ny/humanome** (public, AGPL-3.0, `main` + tag `v1.0.0`) : 1463 fichiers,
  vérifié sans aucun fichier confidentiel (golden/twin9-oracles/gabarits/.pyc/.env absents),
  `.env.example` en placeholders seulement. Détail des correctifs ci-dessous.
  Vérification multi-agents (13 domaines, lecture seule) de tout ce qui avait été demandé dans les
  sessions précédentes ; la plupart est **réellement implémenté et désormais couvert par des tests
  dédiés** (~40 fichiers de tests écrits/étendus). Défauts détectés **corrigés** (pas seulement
  journalisés) :
  - **Packs de recharge** `Twin9Config` : la grille demandée 10/20/50/**100/200/500** USD (`PACK_MAX_USD`
    100 → 500). Tests préexistants alignés (`Twin9AppelTest`, `Twin9ProtocoleTest` : borne « trop gros »
    150 → 750).
  - **Réécriture d'historique au re-seed** (bug source-unique) : `CompetenceRepository::reconcileSeed`
    ne backfille plus une version de seed **dépassée par une édition gouvernée** (garde `Semver::greaterThan`)
    — la diff 1.0.0 → 1.1.0 reste visible (`FicheParityTest`).
  - **Éditeur de fiche épistémiarque** : `EditeurSection` expose enfin le champ `content.fiche`
    (source unique) — la chaîne « édition d'une fiche dans l'atelier → Twin6/Twin9 » est bouclée côté UI.
  - **Garde-fou crédits Twin6** : `Twin6OuverteView` bloque un run sur NOTRE clé si le solde ne couvre
    pas le poids du portfolio (heuristique utilisateur ~1 ko = 1 USD) ; `fetchTwin6Offer` propage
    `solde_microusd`.
  - **Promo Twin9 côté front** : `Twin9View` consulte `meta.twin9_cle_perso_ouverte` (le backend
    l'implémentait déjà : refus 403 hors promo) — bandeau promo + option « clé privée » proposée
    seulement quand la promo est ouverte.
  - **Aide contextuelle** `epistemiarque` (rubrique sans entrée dédiée) ; **libellé** grand-livre
    `refund` → « Remboursement » (`CreditView`).
  - **Pré-publication** : suppression d'un `.pyc` versionné (fuite de chemin local) + `__pycache__/`/`*.pyc`
    gitignorés ; `api/.env.example` re-placeholderisé (identifiants OVH réels retirés du template public).
  - **Reporté au plan v1.1 (D11)** : renommage `Twin_v9 → Twin9` dans l'en-tête de `rapport_evolutif.md`
    (moteur) — impose de régénérer le vecteur figé `merge.vec.json` depuis le Python renommé, pas de
    hand-éditer le vecteur (la parité CPython réelle ne compare pas cet en-tête). Test `renommage.test.js`
    en `it.skip` documenté + ligne d'en-tête en liste blanche du lint. **Reportés aussi** (feature/plan) :
    assistant tuteur Haiku (D9), GitBook (D10) — voir `cahier des charges/plan-prompts-v1.1-developpement.md`.
  - Suites **toutes vertes** : **PHP 481, engine 926 (+1 skip = D11), web 696**, build web OK.

- 2026-07-16 — **✅ DÉPLOYÉ EN PRODUCTION** (release `v1.0.0-29-g625a4ad`, commits `131326b` clé API profil
  + `625a4ad` source unique fiches). `migrate` → **017** (skipped 16). Seed : **61 compétences backfillées**
  avec fiche + 7 en-têtes, gate structurel OK (`b246101c`). **`generate-fiches` → `"unchanged"` (garde-fou) :
  le `twin9_fiches` généré depuis la base est BYTE-IDENTIQUE au golden prompt live — la prod CONFIRME la parité.**
  Front redéployé (prebuild régénère P*.md + paquet Twin6 byte-identique). Smoke prod : `/api/keys`→401 (live),
  `/api/competences/1.01` porte sa **fiche**, paquet Twin6 servi (7 fiches), app 200, référentiel 7.1.0. `deploy.mjs`
  n'a pas touché `~/app/shared/.env` ; `vendor/autoload.php` vérifié. Édition d'une fiche → `dump-fiches` (BDD→corpus)
  pour Twin6, `generate-fiches` (endpoint) pour Twin9 ; FUTURE-ONLY.

- 2026-07-16 — **SOURCE UNIQUE du référentiel : la compétence en base génère les fiches Twin6 + Twin9.** Fin du triple-maintien des fiches de scan (Twin6 P*.md publics +
  setting `twin9_fiches` + gabarits tagger, tous byte-identiques, `cmp` confirmé). Désormais **une seule
  source** : `competence.content.fiche`. Tests : **PHP 432, engine 911 (parité INTACTE), web 569**, parité
  octet prouvée à chaque niveau.
  - **Découverte clé (analyse multi-agents)** : la prose des fiches N'EST PAS confidentielle (déjà publique
    via Twin6, octet-identique au tagger Twin9) et **AUCUN oracle ne fige ses octets** (les vecteurs ne
    portent que [num,code,nom] ; le moteur teste la logique d'assemblage avec des fiches factices). La
    parité octet est donc une **cible auto-imposée** → gate dédié, pas un invariant existant.
  - **Extraction + preuve** : `scripts/extract-fiches.mjs` découpe les P*.md via le VRAI `parsePole` du
    moteur → `scripts/data/fiches-v7.json` (61 fiches + 7 en-têtes) et **prouve la régénération byte-exacte**
    (règle b : `header + Σ fiche.join("\n\n") + "\n"`, ≠ ficheComplete runtime qui double le `---`).
  - **Base = source** : schéma `competence.fiche` (hors hash structurel → `b246101c` intact) ; migration 017
    `referentiel_poles.header` ; `CompetenceSeeder` injecte fiche + en-tête et **backfille** les 1.0.0
    publiées sans fiche (`reconcileSeed` — sûr : aucune carto n'épingle une compétence).
  - **Générateurs déterministes** : `FicheGenerator` (PHP) reconstruit les P*.md (règle b) + la structure
    `twin9_fiches` depuis la base — `FicheParityTest` prouve **P*.md régénérés === fichiers d'or, octet pour
    octet**. `scripts/generate-fiches.mjs` (JS) régénère les P*.md depuis le corpus.
  - **Twin6 dérive du corpus** : `web` prebuild = `generate-fiches` + `build-twin6-package` → paquet
    byte-identique. Les P*.md (gitignorés) redeviennent des ARTEFACTS ; le corpus committé est la source.
  - **Twin9 dérive de la base** : endpoint `POST /api/admin/generate-fiches` (MIGRATE_TOKEN) régénère le
    setting confidentiel `twin9_fiches` via FicheGenerator→FicheStore. Le réassemblage runtime POLE_FICHES
    (avec `---` doublé) et COMPETENCE_FICHE restent **byte-identiques** (mêmes octets de fiche_md).
  - **Confidentiel PRÉSERVÉ** (non touché) : les 29 gabarits d'enrobage (`twin9_protocole`, tagger/lourd/
    merge) restent importés séparément par `import-protocole.mjs` (ils ne dérivent pas du référentiel) ;
    `twin9_fiches` jamais exposé par `/meta` ; permutation anti-gaming intacte.
  - **GARDE-FOU déploiement (revue advisor)** : `POST /admin/generate-fiches` COMPARE le `twin9_fiches`
    courant au généré et **refuse un écrasement silencieux** (409) sans `{"force":true}` — au 1er déploiement
    il DOIT rapporter « unchanged » (vérifié en dev) ; un diff = la prod contredit le corpus, on STOPPE.
    `deploy.mjs` sans force par défaut ; `FICHES_FORCE=1` pour une évolution assumée. Round-trip testé sur la
    règle RUNTIME (`FicheStore` → `poleFiches`, `---` doublé) que Twin9 envoie au LLM, pas seulement la règle P*.md.
  - **Boucle FERMÉE (source unique vraie)** : `GET /admin/dump-fiches` + `scripts/dump-fiches.mjs` re-synchronisent
    le corpus DEPUIS la base (byte-stable : dump === extract). Éditer `competence.fiche` dans l'atelier →
    `dump-fiches` (BDD→corpus) → Twin6 au build ; `generate-fiches` (endpoint) → Twin9. Les deux dérivent de la
    base. **FUTURE-ONLY** (cartos passées épinglent leur paquet). `stage-api.sh` embarque `scripts/data/`.
    **À COMMITER/DÉPLOYER sur demande** (tenir le déploiement jusqu'à ce que le garde-fou rapporte « unchanged »).

- 2026-07-15 — **Clé API privée dans le profil → Twin6 sur sa propre clé. FRONT-ONLY, NON COMMITÉ,
  NON DÉPLOYÉ.** Le backend `/api/keys` (KeyVault sodium, migration 005, providers anthropic/openai/
  google/openrouter/xai/ollama) existait déjà et est en prod — il manquait l'UI et le câblage.
  - `web/src/api/keys.js` (list/store/reveal/delete + `KEY_PROVIDERS`).
  - `web/src/views/account/ApiKeysSection.jsx` : section « Clés API personnelles » dans le profil
    (`#/compte`) — lister (provider + date, JAMAIS la clé), ajouter (select fournisseur + champ password,
    chiffrée serveur opt-in RGPD, jamais réaffichée), supprimer. Câblée dans `AccountView`.
  - `Twin6OuverteView` : voie « clé perso » — si une clé du fournisseur (anthropic) est enregistrée au
    profil, propose « Utiliser ma clé enregistrée » (révélée à la demande via `revealKey`, no-store) sans
    ressaisie ; sinon saisie manuelle + lien vers le profil.
  - Vérifié au navigateur (dev) : clé stockée **chiffrée** (blob sodium, pas le clair), listée sans le
    matériel, Twin6 propose la clé enregistrée, bouton « Lancer » actif sans ressaisie. Tests web 569 verts.
  - **Note** : « Option B » de notre échange = déverrouillage Twin9 (protocole→moteur + oracles) ; cette
    tâche est la clé-perso-Twin6, distincte. À committer/déployer sur demande.

- 2026-07-15 — **✅ DÉPLOYÉ EN PRODUCTION** (release `v1.0.0-26-g5ae20eb`, commit `5ae20eb`) —
  éditeur épistémiarque (gouvernance 015) + référentiel v7.1 enrichi + **modèle compétence ATOMIQUE
  (016)**, en un seul déploiement. `migrate` a appliqué **015 + 016** (skipped 14). Import référentiel :
  7.0.0 unchanged, **7.1.0 imported** (hash `b246101c`). **seed-competences** : 61 importées, 7 pôles,
  **gate de parité OK (`b246101c` === publié)**, lockfile 122. Smoke prod : `/api/competences` → **61**,
  `/api/referentiel` → 7.1.0 + définitions, `/api/competences/1.01` → protocole passe_1/2/3, health db:ok ;
  front statique déployé, `#/referentiel` affiche **RESPIRE v7.1 (61 compétences + définitions)**, 0 erreur
  console. `deploy.mjs` N'A PAS touché `~/app/shared/.env`. `vendor/autoload.php` vérifié avant push (483
  classmap). Reste (Option B, scopeLater) : brancher protocole→moteur + empreinteJournee (touche le golden
  prompt Twin9 verrouillé) pour rendre l'enrichissement agissant en prod.

- 2026-07-15 — **RÉARCHITECTURE : référentiel au grain COMPÉTENCE ATOMIQUE (migration 016).** Correction
  d'architecture demandée par l'utilisateur : les 61 compétences sont
  des ENTITÉS ATOMIQUES éditées / versionnées / gouvernées / concurrentes INDÉPENDAMMENT (modèle des
  YAML fournis : chaque compétence porte identité + protocole passe_1/2/3 + enrichissements). Décision
  utilisateur : **Option A « éditorial d'abord »** — modèle atomique complet, moteur Twin9 FIGÉ.
  Tests avant déploiement : **PHP 430, engine 911 (parité oracles INTACTE), web 562**, vérifié bout-en-bout
  au navigateur (proposer→éditer→CAS→voter→entériner ; 1.01 passée à v1.1.0 pendant que les 60 autres
  restent à v1.0.0 — indépendance prouvée). 0 erreur console.
  - **Migration 016 (additive)** : `competence_versions` (append-only par (code,semver), contenu riche
    JSON, nom/pôle STRUCTURELS porteurs du hash, `content_hash` = jeton CAS interne), `competence_votes`
    (miroir 015), `referentiel_snapshot_competences` (lockfile release↔version de compétence),
    `referentiel_poles`. `referentiel_versions` (003) CONSERVÉ comme couche de COMPOSITION (snapshot que
    le moteur consomme / que les cartographies épinglent — INCHANGÉ). Gouvernance document (015) conservée
    mais supersédée. Registre RGPD étendu (`competence_versions.created_by/submitted_by` SET NULL,
    `competence_votes.user_id` CASCADE).
  - **Deux hashes qui ne se mélangent jamais** : hash STRUCTUREL du snapshot = `ContentHash::compute`
    INCHANGÉ (`SnapshotAssembler` réassemble {poles,competences:{code,nom,pole}} et **appelle**
    ContentHash, aucune ré-implémentation) → **corps assemblé === publié `b246101c…` PROUVÉ** (gate de
    parité, aucun oracle/vecteur Twin9 ne bouge). `content_hash` par compétence = hash du contenu riche,
    PHP-interne (aucune parité Node).
  - **Concurrence PAR COMPÉTENCE (résout le lost update)** : `CompetenceRepository::updateDraft` fait un
    compare-and-swap ATOMIQUE dans le WHERE (`content_hash = :expectedHash AND status='draft'`) — en-tête
    `If-Match` côté API (428 si absent, 409 si périmé), gestion du no-op idempotent via re-findById.
    Deux épistémiarques sur deux compétences différentes = ZÉRO conflit.
  - **Gouvernance PAR COMPÉTENCE** : helpers purs `Electorate` + `MajorityTally` extraits (ReferentielGovernance
    délègue, non-régression verte) ; `CompetenceGovernance` (submit/withdraw/castVote/tally par
    competence_version_id) ; une compétence entérinée à la majorité pendant qu'une autre reste en débat.
  - **Coupe de release** : `ReferentielRepository::cutReleaseFromDocument` (assemble → gate complétude
    61/7 + semver strict, SANS second vote — déjà entériné par compétence) + lockfile.
  - **Schéma** `competence.schema.json` (identité/protocole/enrichissements, permissif) ajouté à
    Validation (PHP seul ; le moteur JS ne valide pas les compétences).
  - **Seed reproductible** : 61 YAML → `scripts/data/competences-v7.json` (converti PyYAML, committé) →
    `CompetenceSeeder` (partagé CLI `scripts/seed-competences.php` + endpoint `POST /api/admin/seed-competences`,
    MIGRATE_TOKEN, FTP-only). Lockfile WRITE-ONCE (INSERT IGNORE : un re-seed ne réécrit pas l'historique).
    `stage-api.sh` copie `scripts/data/` ; `deploy.mjs` applique 016 + importe référentiel + seed compétences.
  - **Routes** `api/src/routes/competences.php` (lectures publiques + cycle par compétence, mutations sous
    RoleGuard, vote membre-only). **Front** `EpistemiarqueView` réécrit au grain compétence : 61 par pôle,
    éditeur RICHE (identité + marqueurs + signaux passe_1 + enrichissements) avec CAS/If-Match, page de vote
    par compétence (diff, décompte, entérinement), coupe de release.
  - **scopeLater (Option B, non fait, touche le prompt verrouillé prod)** : brancher le protocole des
    compétences sur le moteur (générer les fiches `P{num}.md`) + `empreinteJournee` pour qu'un enrichissement
    déclenche un re-scan en PROD → impose de régénérer TOUS les oracles/vecteurs Twin9 + bump `VERSION_PROTOCOLE`.
    Tant que non fait : l'enrichissement d'un protocole est GOUVERNÉ et VERSIONNÉ mais n'AGIT PAS encore sur
    les cartographies de production. Export statique par compétence (ressource riche) non fait non plus.
  - **⚠️ À DÉPLOYER par l'utilisateur** : `deploy.mjs` (migration 016 + seed compétences via endpoint). Idem
    caveat précédent sur la page publique statique (déployer depuis ce working tree ou régénérer).

- 2026-07-15 — **Éditeur collaboratif des épistémiarques + gouvernance par vote (cahier §3.5)
  + référentiel enrichi des définitions (RESPIRE v7.1). PAS ENCORE DÉPLOYÉ.** Tests avant
  déploiement : PHP 401, engine 911, web 563 (verts).
  - **Gouvernance (migration 015)** : une édition du référentiel est un BROUILLON ; sa soumission
    ouvre un VOTE (statut `review`, déjà dans l'enum 003) ; elle n'est ENTÉRINÉE (publiée) qu'à la
    **majorité des membres épistémiarques** (`floor(N/2)+1` de l'électorat courant — abstentions et
    non-votants rendent le passage plus dur). Table `referentiel_votes` (1 bulletin/membre, upsert,
    purge RGPD en cascade), colonnes `submitted_at/by` + `decidim_url` sur `referentiel_versions`.
    Classe `ReferentielGovernance` (submit/withdraw/castVote/tally/électorat). `updateDraft` refuse
    d'éditer une proposition en vote (gel — sinon les votes seraient invalidés) ; `publish` gate sur
    `review` + majorité ; N=0 → publication bloquée (message clair) ; majorité `contre` → `rejected`.
    Vote réservé au rôle `epistemiarque` (un admin facilite mais n'est pas de l'électorat). Registre
    RGPD (`RgpdAuditTest`) mis à jour : `referentiel_votes.user_id` CASCADE, `submitted_by` SET NULL.
  - **Routes** : `GET/POST` drafts+`{id}`, `…/submit`, `…/withdraw`, `GET proposals[/{id}]` (diff+tally+votes),
    `POST proposals/{id}/votes`. Toutes les mutations derrière `RoleGuard` (`ReferentielAuthzTest` étendu).
  - **Vue `EpistemiarqueView`** (`#/epistemiarque[/editer|proposition/<id>]`) : atelier (version en
    vigueur, brouillons, propositions au vote), éditeur (noms/couleurs pôles, noms+**définitions**
    compétences), page de vote (diff, décompte + barre de progression, boutons pour/contre/abstention +
    commentaire, lien Decidim, bouton « Entériner » actif à la majorité, retrait). Nav « Édition du
    référentiel » repointée `#/referentiel`→`#/epistemiarque`. Vérifié au navigateur bout-en-bout :
    créer → éditer → soumettre → voter (1 membre, seuil 1) → entériner → 7.1.0 en vigueur, 0 erreur console.
  - **Référentiel enrichi (RESPIRE v7.1, E1)** : les 61 définitions fournies par les épistémiarques
    (`../referentiel/referentiel_liste.txt`) commitées in-repo (`scripts/data/referentiel-v7-definitions.json`),
    `scripts/enrich-referentiel.mjs` produit `respire-v7.1.0.json` (champ `description` facultatif).
    **Invariant clé** : `description` N'ENTRE PAS dans le hash (ContentHash inchangé sur le corps
    structurel) → 7.1.0 porte le **même contentHash que 7.0.0**, fixture et oracles engine intacts
    (911 verts = preuve de parité). Schéma étendu (description optionnelle) ; `ContentHash::normalize`
    préserve les clés extra en ordre canonique. `deploy.mjs` importe désormais 7.0.0 **et** 7.1.0.
    Vue publique `#/referentiel` affiche les définitions (cherchables). Limite notée : le diff est
    aveugle aux changements de définition seule (hors hash) — acceptable en v1.
  - **⚠️ À DÉPLOYER par l'utilisateur** — `deploy.mjs` importe 7.1.0 en BASE (atelier connecté) mais
    la page PUBLIQUE `#/referentiel` lit les fichiers STATIQUES `web/public/data/referentiel/` (gitignorés,
    générés). Déployer depuis CE working tree (les fichiers 7.1.0 y sont déjà présents) OU, sur un clone
    frais, régénérer d'abord dans l'ordre :
    `node scripts/extract-referentiel.mjs` → `node scripts/enrich-referentiel.mjs` →
    (import DB via `deploy.mjs api`) → `docker compose run --rm -w /var/www/html php php scripts/export-referentiel-static.php`
    → `cd web && npm run build` → `node scripts/deploy/deploy.mjs static`. Sinon l'atelier montre v7.1
    mais la page publique reste v7.0 (sans définitions). Un compte au moins doit porter le rôle
    `epistemiarque` pour entériner de futures éditions (électorat = comptes portant ce rôle).

- 2026-07-15 — **Déployé en production : thème sombre + Twin6 (front + API).** Commit `0a4933b`
  (feat twin6 + refinements Twin9 + renommage), release API `v1.0.0-24-g0a4933b`. `migrate`
  n'a rien appliqué (`{"applied":[],"skipped":14}` — schéma prod déjà à jour). Vérifié en ligne :
  `/api/health` `db:ok`, `POST /api/twin6/appel` sans session → **401** (route live + gardée),
  paquet public `data/twin6/…` → 200, page `#/twin6-ouverte` rendue (gratuit clé perso / crédits),
  thème sombre actif, 0 erreur console. Tests avant déploiement : PHP 382, engine 911, web 549.

- 2026-07-15 — **Thème sombre + épingle du menu persistante.** (1) **Thème sombre** complet :
  tout `global.css` passe par des tokens sémantiques (`:root` = clair) ; deux blocs redéfinissent
  ces valeurs en sombre — `@media (prefers-color-scheme: dark) :root:not([data-theme='light'])`
  (suit le système) et `:root[data-theme='dark']` (choix explicite qui prime). ~50 couleurs
  codées en dur tokenisées (statuts ok/warn/danger/info, badges, ombres, voile) via script
  protégeant les lignes de définition. La **visualisation** (sunburst + heatmap + timeline) reste
  sur une surface CLAIRE `--viz-surface` dans les deux thèmes (panneau graphique encadré : la
  géométrie du moteur — secteurs gris jusqu'au noir, dégradé central pâle — n'a pas à être
  réécrite) ; ses textes/liserés utilisent `--viz-ink*` (sombres partout). Bouton **bascule
  soleil/lune** dans la grappe d'actions ; script **anti-FOUC** dans `index.html` (pose
  `data-theme` avant le paint si un choix est stocké) ; util `src/lib/theme.js` (localStorage,
  `matchMedia` gardé, abonnement au système tant qu'aucun choix). (2) **Épingle du menu** :
  l'épinglage (punaise du panneau) est désormais **persisté** (`localStorage`) et, sur grand écran
  (≥ 921 px), **docke** le tiroir en décalant `.app-main` pour ne pas masquer le contenu.
  Vérifié au navigateur en clair ET sombre (accueil, merge/viz encadrée, journée, menu, badges,
  toggle, persistance) ; revue adversariale contraste ; tests web 549+.

- 2026-07-14 — **En-tête épuré : grappe d'actions flottante + tiroir de nav depuis la
  gauche + épinglage + déconnexion rapide.** `.app-header` perd la marque et son fond
  (coquille invisible, juste une réserve de hauteur) ; `.app-header-actions` (aide + burger)
  passe en `position: fixed` (un `sticky` classique serait resté borné par la boîte quasi
  vide de `.app-header`, qui n'a plus assez de hauteur propre pour offrir une plage
  d'accroche — piège découvert et corrigé en vérifiant au navigateur, pas juste supposé).
  Le panneau de nav (`.app-nav-panel`) passe d'un dropdown ancré sous le bouton à un tiroir
  `position: fixed` pleine hauteur qui glisse depuis le **bord gauche de l'écran** (pas du
  bouton, resté à droite) via `transform: translateX(-100%/0)`, toujours dans le DOM (pas de
  `display:none`, a11y). Ajout d'une **icône punaise** dans l'en-tête du panneau
  (`.app-nav-panel-head`) : épingle l'ouverture (`is-pinned`), qui résiste au survol perdu,
  au clic extérieur et même à un changement de route (seule Échap ou la punaise referment) —
  état `pinned` lu via ref dans l'effet de route pour ne pas le reprogrammer à chaque
  épinglage. Ajout d'un bouton **« Se déconnecter »** (icône porte + flèche) en bas de
  `app-nav`, visible seulement connecté, appelant le vrai `logout()` d'`api/client.js` avec
  dégradation gracieuse (comme `AccountView`). `html { overflow-x: hidden }` pour clipper le
  tiroir hors-écran sans élargir le scroll (attention : jamais sur `body` seul, bascule
  implicite d'`overflow-y` en `auto` qui casse les contextes de scroll imbriqués). Vérifié au
  navigateur : desktop (survol révèle, clic épingle, épinglage survit à une vraie navigation
  intra-app, Échap referme + rend le focus), mobile (tap ouvre/ferme au tap extérieur),
  actions flottantes visibles au défilement sans chevaucher le contenu. Tests web 537 verts.

- 2026-07-14 — **Refonte de la navigation : 7 familles d'intention + landing « palais mental ».**
  Étude d'ergonomie complète (`docs/ergonomie-navigation.md` : mindmaps par persona, frictions
  confirmées + découvertes via 8 lentilles-persona multi-agents, 3 philosophies candidates,
  synthèse) puis câblage validé par l'utilisateur. **(1) Burger accessible** : la nav quitte la
  barre pour un panneau déroulant (survol desktop avec délai de grâce, clic épinglant web+mobile,
  focus clavier via `:focus-within`, Échap/clic-extérieur ferment ; liens toujours dans le DOM,
  masquage visuel seulement). **(2) `nav.js` réécrit** = source unique des 7 familles nommées par
  le BUT (Découvrir · Ma cartographie · Encadrer et garantir · Piloter mon organisation · Faire
  évoluer · Administrer · Mon compte), role-additives, items filtrés par rôle (l'épistémiarque a
  enfin un domicile : « Édition du référentiel ») ; badges d'échelle de valeur
  gratuit/standard/premium sur Essayer / Cartographier mes écrits / Analyse approfondie
  (friction n°1) ; `isCurrentItem` route+section. **(3) Landing de profil**
  (`components/FamilyTiles.jsx`) : tuiles des familles de la session teintées par famille
  (`--fam-*`) ; visiteur = bouton « Voir les profils d'utilisateurs » révélant la persona-bar
  (8 profils ; Employeur = carte explicative du lien de partage) ; **callout d'aide** : le
  survol/focus d'un lien de tuile affiche le contenu du bouton « ? » (`help/registry.js` via
  `parseHash`), le **1er clic sélectionne** (aria-live, Échap désarme, clics modifiés natifs),
  le **2e clic ouvre** — la « table des matières interactive » en actes. Prototype TOC conservé
  dans l'état (`docs/prototypes/plan-du-site-toc.html`). **Revue adversariale multi-agents du
  diff avant commit : 17 findings confirmés, tous corrigés** — dont le survol qui reprend la
  main sur un lien armé, l'armement par item (alias #/espace), la purge du callout au
  changement de profil, `role=group` sur les familles du burger, contrastes AA (teal 700),
  consignes clavier, et `help/registry.js` + tableau de bord alignés sur les nouveaux libellés
  (fin de « Lancer un run »). Vérifié en navigateur (visiteur, aperçu Cartographe, survol,
  deux-clics, navigation réelle, armé+survol post-correctif). Tests web 535. Non déployé
  (front seulement, `npm run build` OK + deploy à la prochaine fenêtre).

- 2026-07-13 — **Twin9 (le vrai Golden Prompt) porté et intégré (ADR-010).** Système
  multi-agents Python (~4400 l., 29 gabarits, ~3000 appels/run) rendu opérationnel sur le
  site. (T1) specs de portage bit-à-bit ; (T2) **portage JS `engine/src/twin9/` avec parité
  OCTET-À-OCTET** contre 6 oracles mock Python (0 écart) ; (T3) serveur : gabarits secrets en
  base, `POST /api/twin9/appel` (rendu serveur, base_url verrouillée, filtre anti-fuite),
  crédits prépayés micro-USD + **PayPal en flux redirect**, **factures récapitulatives
  mensuelles** + suivi dépenses (particuliers ET établissements), **marge +10 %** (couvre
  PayPal/OVH/domaine/démo Haiku) ; (T4) front : run (consentement RGPD, **devis via run mock
  navigateur avant paiement**, progression + reprise IndexedDB, résultats), crédit+factures
  imprimables, éditeur admin des gabarits + table des comptes ; (T5) déployé (désactivé).
  **Revue de sécurité adversariale** → 2 failles corrigées (course de solde/découvert ;
  contournement du filtre anti-fuite). **Correctif majeur du raccord réel** (le portage rendait
  les prompts côté client ; sur le site les gabarits + fiches confidentielles doivent rester
  serveur) : le moteur envoie chemin+variables d'état, le serveur **injecte les fiches secrètes**
  (`FicheStore`, jamais dans `/meta`) — bug invisible aux 903 tests mock, attrapé par un **test
  de contrat hors-ligne** et **prouvé par un vrai appel Anthropic** (greffier réel, fiche injectée,
  réserve→réconciliation = coût réel). Suites : PHP 373, engine 903, web 520. **Reste avant mise
  en service (utilisateur)** : identifiants PayPal REST (fournis plus tard) ; import des gabarits
  en prod (`scripts/twin9/import-protocole.mjs`, X-Migrate-Token) qui active la fonctionnalité —
  décision délibérée de l'utilisateur. Source `Twin9/` + gabarits = confidentiels, gitignorés.

- 2026-07-13 — **Phase UX post-v1 (demande utilisateur, 6 points) : trois chantiers livrés.**
  **(B) Navigation adaptée au rôle + aide contextuelle.** `web/src/nav.js` = source unique
  rôle → sections, groupées par famille (« Découvrir » pour tous ; « Mon travail » selon les
  rôles de la session, rafraîchie sans rechargement via l'événement `humanome:auth`). Bouton
  « ? » dans l'en-tête : aide par rubrique et par rôle (`web/src/help/`). En-tête restylé
  (rubrique courante marquée, cibles 44px).
  **(A) Réglages démo éditables depuis l'admin (smartphone).** Couche d'overrides en base
  (`settings.demo_overrides`) prioritaire dans `DemoConfig::load()` (base > env > fichier >
  défaut, fail-safe DB) ; API session admin `GET/PUT/DELETE /api/admin/demo-config` (validation
  bornée 422, audit sans valeurs, clé API jamais exposée — env uniquement ; provider non
  éditable). UI Réglages : grand interrupteur activer/désactiver (un clic, effet immédiat sur
  POST /api/llm — vérifié en dev : OFF → challenge refusé → ON → reset), modèle (menu +
  champ libre), 7 champs bornés avec badge d'origine (base/env/fichier/défaut). Nav admin
  refondue (accueil en cartes, onglets pastilles, mobile-friendly).
  **(C) Timeline animée de la cartographie.** `web/src/lib/sunburst/as-of.js` reconstruit la
  carte cumulée à toute date (règles verbatim du moteur, seuils de quintile FIXES calculés sur
  le doc final → la dernière trame == merge.json publié, 0 écart, parité 331 intacte) ;
  `TimelinePlayer` (lecture/pause/vitesse/scrubber accessible, arrêt en fin de plage, pause
  auto à la sélection d'un secteur, prefers-reduced-motion) câblé dans MergeView à côté de la
  heatmap ; compteur cumulé « N compétences sur la carte » + score du jour. Vérifié en
  navigateur : la démo se construit de 11 → 54 compétences sur les 59 feuilles. Idées reprises
  des prototypes `temporal-progression`/`cartography-viewer` (lecteur, scrubber, pivot).
  Tests : PHP 320, web 480, engine 214. Déployé (static + api).

- 2026-07-12 — **Post-v1.0.0 : deux défauts détectés puis corrigés (au lieu de simplement journalisés).**
  (1) **Crash de la vue diff du promptologue** : `DiffView` attendait une forme française fictive
  (`ajoutes/retires/modifies`, `from/to` en chaînes) que le serveur n'émet jamais — `PackageDiff.php`
  renvoie des clés anglaises, `from/to` en objets `{version}`, lignes `{op,line,text}` ; rendre
  `{diff.from}` (objet) plantait React et vidait l'atelier. Vue réécrite pour consommer la forme
  RÉELLE ; le test unitaire nourrit désormais cette forme (il propait la fiction et masquait le bug),
  l'e2e clique le vrai bouton « Diff contre X » et vérifie le rendu. (2) **Portabilité RGPD des
  cartographies de masse** (art. 15/20) : un apprenant ne pouvait pas récupérer les documents produits
  pour lui par un établissement (accès réservé au rôle établissement). Ajout de
  `GET /api/mes-documents-masse` (rôle apprenant, accès survivant au départ de la cohorte) + intégration
  à l'export « un clic ». Déployé (v1.0.0-2). Tests : PHP 311, web 440, engine 214, e2e vert.

- 2026-07-12 — **P13 finalisé : v1.0.0 déployée et taguée.** Le chantier D du workflow M9
  (déploiement/clone/status) ayant échoué en cours de flux, complété à la main : `GET /api/status`
  (santé publique version/db/démo/worker, cacheable 30 s, sans secret, testé) ; commandes
  `deploy.mjs releases` et `rollback` (repointage de `current.txt`, exercées en prod) ;
  `scripts/backup/backup-db.mjs` + restauration **testée en round-trip sur Docker** (dump → base
  neuve → 29 tables) ; `INSTALL.md` (clone déployable), `README.md` (vitrine AGPL-3.0),
  `api/.env.example`, `docs/deploiement.md`, `docs/backup-restore.md`. Historique git scanné :
  aucun secret réel (seuls des placeholders EXEMPLE). Déploiement final : migration 010 en prod
  (10/10), `/api/status` sain, en-têtes API stricts (CSP `default-src 'none'`, X-Frame DENY),
  CSP front avec jetons sandbox, page /confidentialite rendue. **Contrainte OVH consignée**
  (vérifiée au panel) : offre gratuite → PAS de cron ; masse/maintenance par endpoints externes,
  rien ne casse sans cron. Suites finales : PHP 308/308, web 439/439, engine 214/214, e2e 5/5.

- 2026-07-12 — **M9 terminé (P12+P13) : admin, RGPD transverse, durcissement — v1.0.0 INTÉGRÉE.**
  Clôture qualité : les 4 chantiers M9 (A administration, B RGPD transverse, C durcissement,
  D déploiement) fusionnés sans friction. **Suites toutes vertes ENSEMBLE** : PHP **307/307**
  (2470 assertions), web **439/439** (54 fichiers), engine **214/214**, runner **25/25**,
  e2e **5/5**, `npm run build` OK. **Parcours clone déployable rejoué sur instance vierge**
  (`docker compose down -v` → `up -d`) : migration DEPUIS ZÉRO par l'endpoint de prod
  `POST /api/admin/migrate` → **10/10 migrations appliquées dans l'ordre, 0 collision**
  (010 se pose proprement sur 009) ; imports idempotents (référentiel 7.0.0 + prompt-package
  `aurora-v3-reconstruit@1.0.0`) ; `GET /api/health` → `status ok, db ok, version` ; parcours
  minimal register→me→logout→login→logout OK (compte id 1 rôle `apprenant`, logout gardé CSRF —
  403 sans jeton, 401 après logout). **Checklist sécurité re-vérifiée** (`docs/securite-checklist.md`),
  5 items à risque sondés et CONFIRMÉS : (1) **IDOR** — `CartographyRepository` scope
  `AND user_id = ?` sur toute lecture/écriture (404, pas la ressource) ; (2) **CSRF** —
  middleware global `$app->add(new CsrfMiddleware())` (auth.php), double-submit `hash_equals`,
  exemptions exactes (migrate/login/register/llm), les routes admin SESSION en héritent
  (403 empirique) ; (3) **CSP-sandbox** — le vrai bloqueur était le **hash du `<script>` inline
  du srcdoc** (pas `frame-src`) ; garde anti-dérive `csp-hash.test.js` (recalcul depuis
  `buildSrcdoc()`) + e2e `sandbox-isolation` jouant la **CSP de prod réelle** lue dans
  `.htaccess` (bénin→result ET hostile contenu) — les deux verts ; (4) **secrets historique** —
  `git log --all` propre, seul `.env.deploy.example` versionné, toute occurrence `sk-ant-*`
  est un EXEMPLE/fixture, `.env.deploy` gitignoré ; (5) **purge RGPD complète** — `purge()` =
  `DELETE FROM users` s'appuyant sur les cascades FK (pas de liste de tables en dur qui
  dériverait) ; **`golden_grants` (ajoutée en A après le code de suppression) couverte** —
  preuve empirique : grant présent → `DELETE` user → grant cascade-supprimé, paquet conservé.
  Cohérence multi-agents de `system.php` vérifiée : `/api/status` n'existe pas (santé =
  `/api/health`) ; `/admin/maintenance` inline == `scripts/maintenance.php Maintenance::run()`
  (mêmes 3 DELETE, testés) ; **aucune collision de route** admin session (`/admin/users`,
  `/admin/golden`, `/admin/settings/*`) vs outillage jeton (`/admin/grant-role`,
  `/admin/default-package`, `/admin/maintenance`). `SecurityHeaders` câblé en dernier
  (le plus externe → décore 401/403/404). Chantier A : API admin session
  (`RequireRole::any('admin')` + CSRF), Golden = `is_private=1` + `golden_grants` (invisible
  aux 5 chemins de lecture de `PromptPackageRepository`). Chantier B : `content/legal/`,
  `docs/rgpd-registre.md` (10 traitements), `scripts/rgpd-audit.php`. Chantier C : CSP front
  corrigée (`script-src` + hash srcdoc + `blob:` + `worker-src blob:`), `SecurityHeaders`,
  audits deps (composer 0 advisory, `npm audit --omit=dev` 0).

- 2026-07-12 — **M8 terminé (P11) : établissements B2B et cartographie de masse, EN PRODUCTION.**
  Déployé (migration 009 en prod, worker-tick opérationnel). Audit : 1 SSRF medium corrigé
  (réassertion du fournisseur après réservation du job). Cron OVH worker à configurer en M9
  (POST /api/admin/worker-tick ou php scripts/worker.php).
  API (chantier A) : cohortes + codes d'invitation, consentement explicite à deux étages
  (rejoindre `{"consentement": true}` 422 sinon, dépôt de portfolio = opt-in serveur),
  config LLM/budget (clé endpoint sodium, jeton worker sha256), runs de masse (versions
  figées), file `mass_jobs` (checkpoint PAR PÔLE, bail 5 min, GET_LOCK, écritures
  conditionnelles), tick borné < 50 s (`php scripts/worker.php` + POST /api/admin/worker-tick),
  coupe-circuit budget AVANT chaque appel, purge RGPD par FK. Front (chantier B) :
  #/etablissement (cohortes, config, lancement en 2 temps avec estimation, avancement
  poll 5 s, vue membre = MERGE CÔTÉ CLIENT par le moteur) ; #/espace/cohortes (consentement,
  dépôt, quitter). Runner Node (chantier C) : même file via /api/worker/*, zéro dépendance.
  **Intégration : DoD P11 rejouée HORS PHPUnit** (scripts/dev/dod-p11.sh, preuves) :
  20 apprenants × 3 journées → run de 60 jobs par ticks CLI mock (5 appels/tick),
  interruption à 24/60 (39 ticks/195 appels), reprise 58 ticks/285 appels → 60 done,
  **480 appels exactement (0 double-appel)**, coût cohérent (spent_usd = Σ jobs = tableau
  = 12.808770 $), 120/120 documents valides (ajv moteur) ; plafond abaissé en cours de
  2e run → budget_exceeded propre, réactivation par hausse ; runner Node --once (mock
  injecté) draine 60 jobs via l'API. **Frictions d'intégration corrigées** : contrat
  /api/worker/jobs (référentiel COMPLET partagé au niveau réponse + referentielVersion
  + provider, le runner tel que livré ne pouvait PAS fonctionner contre l'API) ;
  page cohorte établissement (crash React : avancement objet rendu tel quel ; membres
  sans détail de dépôt → run inlançable ; statuts pending/error ≠ queued/failed ;
  run 'running' ≠ 'active') ; GET /api/cohortes manquant (liste apprenant) ; enveloppe
  {membre, documents} ; tarifs famille claude-* moteur alignés sur Pricing.php ;
  WORKER_TICK_MAX_CALLS (tick CLI bornable). Vérifié en navigateur : avancement en
  direct pendant une boucle de ticks (28/60 → 60/60 done), merge client (10/61
  compétences, vues jour), parcours apprenant 21e (inscription → consentement coché →
  dépôt « Journal de Maya »). Suites : PHP 274/274 (2213 assertions), web 422/422,
  engine 214/214, runner 25/25, e2e 4/4, build OK.

- 2026-07-12 — **M7 terminé (P9+P10) : espaces cartographe et promptologue EN PRODUCTION.**
  P9 : invitations à usage unique, file de relecture, annotations par compétence, révisions
  validées au schéma avec historique, GARANTIE humaine (révision figée servie par le lien de
  partage public, retirée automatiquement à toute nouvelle révision — §8), comparaison côte à
  côte, rapport de consistance multi-run lisible, purge RGPD asymétrique (révisions anonymisées).
  P10 : éditeur brouillon→publication immuable (semver strict, diff structurel ligne à ligne),
  proposition/validation de version par défaut, régénération rétrospective, banc d'essai
  (multi-run, A/B avec rapport téléchargeable), SANDBOX iframe origine opaque + worker blob +
  pont postMessage (quota 16 appels, timeout) avec **isolation réseau DÉMONTRÉE en vrai Chromium**
  (spec e2e dédiée), docs/securite-prompts.md, outillage admin grant-role (audité).
  E2E 4/4, PHP 234/234, web 395/395. Rôles en prod : à attribuer via POST /api/admin/grant-role
  (X-Migrate-Token) en attendant l'UI admin P12.

- 2026-07-12 — **M6 terminé (P8) : espace apprenant complet, EN PRODUCTION.** API : cartographies
  (stockage opt-in daté, liste sans document), liens de partage (token 128 bits haché, Argon2id,
  404 homogène anti-énumération, révocation, rate-limit), formation trackée, clés API personnelles
  chiffrées sodium (AD-4), prompt-packages publiés + paquet par défaut aurora-v3-reconstruit@1.0.0
  généré depuis les gabarits RÉELS du moteur (import idempotent par hash, endpoint admin).
  Front : dashboard (#/espace, fonctionne aussi anonyme/local), formation Markdown embarquée
  (parseur maison + DOMPurify, progression locale→serveur), assistant de run 5 étapes (paquet,
  fournisseur clé perso/service humanome, estimation, exécution avec checkpoints IndexedDB et
  REPRISE réelle), panneau cartographies (confidentialité, opt-in serveur RGPD explicite,
  partage+révocation, visionneuse), ShareView lecture seule, export/import archive validée au
  schéma. **E2E Playwright DoD vert** (compte→portfolio→run mock 24 appels→partage en contexte
  privé→export validé→suppression→404). Audit : 1 faible corrigée (no-store sur révélation de
  clé). PHP 182/182, web 299/299. Smoke prod : parcours complet vérifié en ligne.
  Backlog : titre « Mes cartographies » dupliqué (cosmétique) ; récits narratifs du merge en P10.

- 2026-07-12 — **M5 terminé (P6+P7) : démo LLM publique VALIDÉE EN PRODUCTION** (run complet
  réel : collage → PoW → 7 pôles Sonnet → visualisation Journée interactive sur humanome.xyz/#/essayer).
  P6 : proxy /api/llm (provider/model/plafonds imposés serveur, clé jamais exposée), garde-fous
  tous VÉRIFIÉS EN LIGNE (honeypot, PoW HMAC one-time — rejeu 429, quota IP/h — 429 vécu,
  coupe-circuit budget quotidien — 503 vécu, plafond d'entrée), gdoc-text anti-SSRF, page
  Essayer (progression par pôle, annulation, zéro persistance). P7 : portfolio client-first
  (coller/.txt/.md/Google Docs, segmentation en journées testée ×30, IndexedDB, ADR-010
  repli éditeur — Sqilium est une app Rails non intégrable). Audit abuseur : faille ÉLEVÉE
  corrigée (rotation IPv6 /64 → buckets par préfixe, aussi appliqué à l'auth).
  **Fiabilisation LLM apprise en prod** (~20 runs de debug, chaque échec = un correctif) :
  thinking par défaut du modèle mange le budget (→ thinking disabled) ; JSON indenté double
  le coût (→ compact monoligne exigé) ; malformations stochastiques (→ tool_use forcé =
  JSON garanti par l'API + retry unique par appel) ; glissements sémantiques (→ normalisation
  déterministe des invariants du corpus + dégradation ciblée pilotée par les chemins d'erreur
  ajv + validation par pôle) ; kairos volumineux (→ bornes de longueur + kairosOptional :
  dégradation gracieuse à null avec note UI) ; timeouts (→ curl 150 s, le LB OVH suit ;
  8192 tokens de budget). Config prod (env ~/app/shared/.env) : Sonnet 5, 8192 tokens,
  40 req/h/IP, PoW 16 bits, budget **8 $/jour**.
  **DÉCISION DE COÛT à trancher par l'utilisateur** (écart au cahier §3.1/§5 qui visait Haiku
  bon marché) : un run démo = 8 appels Sonnet ≈ 1 $+, donc le plafond 8 $/jour coupe après
  ~6-8 visiteurs/jour. Testé le 2026-07-12 : **Haiku + tool_use forcé ne suffit PAS** (JSON
  valide mais structure incomplète — `competences` absent ; Haiku ne suit pas la structure
  adverse profonde). Options : (a) garder Sonnet + plafond bas (actuel) ; (b) monter le budget ;
  (c) **piste non testée prometteuse** : mettre le SCHÉMA COMPLET du pôle dans `input_schema`
  du tool (décodage contraint) pour forcer la structure → pourrait rendre Haiku (bien moins cher)
  viable. Backlog M5 : (c) ci-dessus ; panneau pôle sans rapport (dégradé) affiche l'état vide
  — afficher audit + passages à la place.

- 2026-07-12 — **M4 terminé (P5) : moteur complet, gate de parité franchie** (rapport :
  docs/rapport-parite-moteur.md). Étage A (merge numérique) : PARITÉ 100 % — 132 618 valeurs
  comparées à l'oracle, formules retrouvées jusqu'à l'arrondi demi-pair Python (pythonRound).
  Étage B1 : 69/69 prompts narratifs identiques au byte près. Étage B2 : 100 % — quintiles
  exclusifs Python retrouvés, **archétype déterministe retrouvé (arbre à médiane par pôle,
  54/54)**, feedback HTML octet à octet. Étage C (extraction) recréé sans oracle (typologie
  d'attaques a..h retrouvée dans le corpus) = v1 du prompt-package par défaut (P10).
  Providers ×6 (2 transports, retry, estimate/coûts), runs/checkpoints/reprise (IndexedDB
  injectable), consistance multi-run, bout-en-bout mock 3 jours avec interruption/reprise.
  Revue adversariale : 3 bugs réels corrigés (dont corruption silencieuse du parseur JSON).
  Tests engine 182/182 ; squelettes de formation ×3 parcours livrés (§4.6).

- 2026-07-12 — **M3 terminé (P3+P4) : API en production.** 5 migrations MySQL (users/roles/
  sessions PDO/rate_limits/referentiel_versions/prompt_*/cartographies opt-in datée/share_links/
  training_progress/user_api_keys/audit_events, purge RGPD par FK), auth complète (ARGON2ID,
  anti-énumération, CSRF double-submit, rate-limit progressif, RequireRole), module référentiel
  versionné (import v7 idempotent hash-vérifié, brouillon→publication immuable, diff, export
  statique), front #/referentiel (arbre+recherche+permaliens+Decidim) et #/compte (RGPD),
  audit sécurité adversarial passé (1 défaut latent corrigé + 9 tests). Déploiement par releases
  ADR-008 opérationnel : 3 off-by-one de layout corrigés (migrations/schemas/VERSION),
  route POST /api/admin/import-referentiel ajoutée (pas de SSH). Prod vérifiée : migrations
  idempotentes, referentiel v7.0.0 servi par l'API, parcours register→me→purge RGPD→401,
  health db:ok versionné. Tests : PHP 89/89, web 147/147, corpus 68/68.

- 2026-07-12 — **M2 terminé (P2) : humanome.xyz EN LIGNE.** Visualisation unifiée déployée
  (https://humanome.xyz) : vue Merge (sunburst porté à parité stricte 331/331 paths contre le
  rendu original — divergence d'1 ulp de Math.cos/sin V8 résolue par arrondi correct BigInt),
  vue Journée reconstruite depuis extracted/ (verdicts, blocs adversariaux, traces, exclus,
  ?focus=), heatmap chrono cliquable, réécriture des 1262 liens du corpus vers les routes hash,
  DOMPurify durci (aucune requête externe possible depuis le HTML narratif), drag & drop JSON
  validé ajv, responsive 360px (onglets une-main ; fix minmax(0,1fr)), CSS print, a11y clavier.
  Bundle IIFE file://-compatible. Déployé par manifeste SHA-256 (65 fichiers), HTTPS forcé,
  CSP/HSTS actifs, smoke en ligne OK (deep-link jour + data lazy + console propre).
  Tests : 112/112. Limitation vérifiée : le FTP OVH clusterNNN ne supporte pas AUTH TLS →
  transfert en FTP simple (documenté).

- 2026-07-12 — **M1 terminé (P0+P1)**. P0 : CLAUDE.md, ADR-001..009 (relus adversarialement),
  inventaire-assets, docker php8.2+mysql8, /api/health, web Vite+React, engine ESM, AGPL-3.0.
  P1 : 5 schémas draft 2020-12 dérivés du corpus réel (enums recensées sur 3590 compétences×59 jours),
  convertisseurs (carto-data→merge, extracted→jour, extract-referentiel), validation double runtime
  (ajv engine/src/validation.js + opis api/src/Validation.php), fixtures fictives « Maya » 3 journées,
  docs/contrats.md. Vérifié : validate-corpus 68/68 OK, engine 6/6, web 2/2, PHP 6/6.
  Bonus : deploy FTPS prêt (ADR-008), oracle de parité sunburst capturé (331 paths du rendu original),
  MySQL prod vérifiée (8.0.46 joignable depuis le cluster).

- 2026-07-12 — Repo initialisé (commit 1 = .gitignore seul), assets copiés en lecture seule
  (`assets-existants/merge-prototype/`, `assets-existants/prototypes-react/`), cahier des
  charges et plan-prompts dans `docs/`.
- 2026-07-12 — Décisions actées avec l'utilisateur : licence AGPL-3.0 ; clé API Anthropic
  fournie (hors repo) ; MySQL OVH à créer via panel (plugin Chrome) ; données réelles de
  démo publiées telles quelles (consentement explicite du 2026-07-11).
- 2026-07-12 — Vérifié serveur OVH : PHP 8.2 (.ovhconfig), www/ vide, FTP OK, pas de SSH.
- 2026-07-12 — MySQL : base OVH existante fournie par l'utilisateur (`example123.mysql.db`,
  hébergée sur un autre hébergement OVH — credentials hors repo, `cahier des charges/mysql.txt`).
  Plus de création via panel nécessaire. **Vérifié le jour même par sonde PDO éphémère
  depuis le cluster humanome.xyz : joignable, MySQL 8.0.46, utf8mb4, PHP webroot 8.2.29.**

## Actions manuelles restantes (chef d'orchestre — clôture v1.0.0)

1. **Déploiement final** : `cd web && npm run build` (fait, à refaire si diff), puis
   `node scripts/deploy/deploy.mjs static` (www/) ; `scripts/deploy/stage-api.sh` puis
   `node scripts/deploy/deploy.mjs api` (releases + `current.txt` + `POST /api/admin/migrate`
   + imports + smoke `/api/health`). Credentials dans `.env.deploy` (gitignoré).
2. **Tag `v1.0.0`** : `git tag -a v1.0.0 -m "humanome.xyz v1.0.0"` (+ `git push --tags` après
   publication GitHub). La version affichée par `/api/health` est estampillée au déploiement
   depuis `git describe` (via `stage-api.sh` → fichier `VERSION`) : **tagger AVANT de stager l'API**.
3. **Cron OVH** (ADR-005/008, aucun script shell déployé — endpoints à jeton) :
   - worker de masse — `POST /api/admin/worker-tick` (X-Migrate-Token), ticks courts, ~toutes
     les 1–5 min tant qu'il y a des jobs (voir `docs/plan-masse.md`) ;
   - maintenance RGPD — `POST /api/admin/maintenance` (X-Migrate-Token), **quotidien**
     (purge liens de partage > 30 j, reset compteurs démo, PoW expirés).
4. **Rôles admin/privilégiés à créer** : aucun compte n'est admin par défaut (le 1er inscrit
   est `apprenant`, `admin` n'est pas un super-rôle implicite). Attribuer via
   `POST /api/admin/grant-role {email, role}` (X-Migrate-Token) — au moins un `admin`, puis
   les `cartographe`/`promptologue`/`epistemiarque` selon les personnes. L'UI admin
   (#/admin) prend le relais une fois un premier admin créé.
5. **Publication GitHub** (reportée depuis M1) : créer le dépôt, `git push` (+ tags).
   Sauvegarde intermédiaire : `git bundle create ../humanome-backup.bundle --all`.
6. **Smokes post-déploiement** (`docs/securite-checklist.md` §« après déploiement ») :
   `curl -sI https://humanome.xyz/api/health` → en-têtes API (CSP `default-src 'none'`,
   `X-Frame-Options: DENY`, HSTS, `Referrer-Policy`, `Permissions-Policy`) ; ouvrir
   #/promptologue et lancer le banc d'essai sur un paquet publié → **zéro violation CSP**
   en console (preuve que la correction sandbox tient en prod réelle) ; ramener le budget
   démo quotidien à 5–10 $ selon usage (compteurs de test consommés en M5).

## Backlog post-v1 (hors périmètre v1.0.0)

- **Marketplace employeur payante** (mise en relation apprenants↔employeurs monétisée).
- **Portfolio multimédia** (au-delà du texte : images, audio, vidéo).
- **Open-data recherche** (jeux de données anonymisés pour la recherche).
- **Promptagogue** (rôle/atelier pédagogique autour des prompts).
- **Régénération de masse** (rejeu rétrospectif d'une nouvelle version de prompt-package
  sur une cohorte entière).
- **GPU local** (inférence LLM auto-hébergée, hors API tierce).
- **OAuth Google Docs** (import portfolio authentifié, au-delà du `gdoc-text` public actuel).
- **i18n** (internationalisation de l'UI, aujourd'hui français uniquement).

## Dettes techniques / décisions en attente

- Vestiges de T11 (retirés du code le 2026-10-20) : la base garde le réglage `twin9_fiches` et,
  dans `twin9_config`, `enabled`, `pipeline`, `appels_par_minute` (et des étages sous les modèles)
  jusqu'au prochain enregistrement de la supervision. Les effacer est une contraction (ADR-008) :
  une migration, une fois stabilisée en production la release qui ne les lit plus.
- Twin9, voie directe (T7) : un appel coupé par la fin d'une tranche repart à la suivante, et
  Anthropic facture sans doute ce qu'il avait déjà produit. Idée, non codée : ne lancer un appel
  que s'il tient dans le reste de la tranche, d'après la durée des appels de la même étape au
  journal. La voie par lots (T8) n'a pas ce coût.
- Twin9 (T7) : le tick donne d'abord sa tranche aux runs Twin9, la masse prend le temps qui reste.
  Des runs en voie directe peuvent l'occuper toute ; à revoir si la masse sert en même temps (T18).
- Twin9 (T13) : le nombre de runs par tick et la durée d'une tranche (T7) se règlent par
  `/api/twin9/admin/config` seulement ; `#/admin/twin9` ne les montre pas encore.
- Twin9 (T9) : les compteurs des runs pour l'administrateur ne sont servis que par
  `/api/twin9/admin/runs` ; `#/admin/twin9` (UC-ADM-05) ne les montre pas encore. On n'efface un run
  qu'en supprimant son compte ; UC-APP-10 décrit encore le moteur du navigateur (lot 3).
- Twin9 (T8, T10) : un lot soumis avec une clé qui change ensuite d'espace de travail n'est plus
  joignable. À la suppression d'un compte, un lot de sa clé encore en cours d'annulation, ou dont la
  soumission n'a pas eu de réponse, reste chez Anthropic jusqu'à ce qu'Anthropic l'efface (29 jours
  au plus) : la clé part avec le compte.
- Twin9 (T14) : une copie de gabarits ne se renomme ni ne se supprime ; un gabarit qu'un import
  ultérieur ajoute au jeu v9.8 n'entre pas dans les copies déjà faites (leurs runs sont refusés au
  lancement). L'atelier ne vérifie pas la forme d'une fiche du référentiel d'une copie : une fiche
  que le moteur ne lit plus fait refuser ses runs au lancement. Le contrat ne nomme que les
  variables qu'emploient les gabarits v9.8 : une variable que le moteur fournit à une étape sans que
  la v9.8 s'en serve est refusée. « Qui voit les gabarits ? » reste ouverte (D2 s'applique).
- Twin9 (T10) : les appels minimaux qui vérifient les réglages avant le premier lot ne sont pas
  débités (quelques jetons) ; un appel coupé par la fin d'une tranche n'est pas débité non plus,
  ce qu'Anthropic en facture reste à la charge de l'instance. `#/admin/twin9` garde le palier des
  longs prompts d'un modèle sans le montrer ni l'éditer (`PUT /api/twin9/admin/config` le règle).
  L'estimation compte au moins une journée, la fusion se refaisant à chaque run.

- `scripts/dev/dod-p11.sh` (répétition de la DoD P11) s'arrête à la première inscription
  (`422`, `emailConfirm` manquant) : il n'envoie pas la double saisie de l'email ni n'active le
  compte, exigés depuis D5. Constaté le 2026-10-18 en le passant sans Docker ; ses appels SQL,
  ses ticks CLI et sa lecture des documents marchent en local.
- Golden Prompt : non fourni, hors git par design (`assets-existants/golden-prompt/` gitignoré).
- Pipeline Python amont absent : moteur rétro-conçu en M4 avec oracles
  (`intermediate/carto_merge.json`, `intermediate/prompts/`).
- Bundle front monolithique (~1,58 Mo / 331 Ko gzip) : avertissement de taille Vite
  informatif, non bloquant — code-splitting à envisager (backlog outillage).
- `npm audit` complet : 5 findings **outillage de dev uniquement** (vite/vitest/esbuild),
  non déployés, non exploitables en prod (cf. checklist A06) — bump majeur reporté au backlog.
- CSP de production `connect-src 'self'` : corrigé (décision du 2026-10-14, question 22 :
  `connect-src` ouvert aux seuls fournisseurs) — en ligne depuis le déploiement du 2026-10-14.
- CSP de production et script anti-FOUC (`web/index.html`) : le script en ligne qui réapplique
  le thème choisi par le visiteur était **refusé par la CSP depuis qu'elle existe** — le choix
  clair/sombre n'était pas réappliqué au chargement. **Corrigé et déployé le 2026-10-14**
  (journal carto, question 30, D-47) : son hash est dans `script-src`, gardé par
  `web/src/anti-fouc.test.js`.
- `npm run test:dist` (`web/scripts/smoke-dist.mjs`) vise encore la vue merge retirée en D-38
  (`#/merge`, `svg.sunburst`) : il échoue depuis ; à réécrire pour l'interface ultime.
- `deploy.mjs api` téléverse la release fichier par fichier sur une seule connexion (~4 min
  pour 723 fichiers) : trop long pour un shell distant limité à 180 s. Le déploiement du
  2026-10-14 a suivi les mêmes étapes avec un téléversement reprenable et parallèle (outil
  ponctuel, hors dépôt) ; à intégrer à `deploy.mjs` si ce mode de déploiement se répète.
- Partage historique (`#/espace`, jour / merge / twin9) **retiré sur la branche
  `feat/ultimate-cartography`** (décision du 2026-10-14, journal carto D-43 : plus de nouveau
  lien, `422 share_retired`). Les liens déjà créés restent servis jusqu'à leur échéance — y
  compris ceux de comptes sans attestation de majorité : pas de révocation (décision du
  2026-10-14, journal carto question 25 : le site n'est pas encore ouvert au public). « Liens déjà créés » et les tests `legacyShareLink` pourront
  partir après le 2027-11-13 (dernière échéance + 30 jours de purge).

## Jalons

| Jalon | Contenu | État |
|---|---|---|
| M1 | P0 fondations + P1 schémas/convertisseurs | ✅ terminé |
| M2 | P2 visualisation unifiée + 1er déploiement | ✅ en production |
| M3 | P3 BDD/comptes + P4 référentiel | ✅ en production |
| M4 | P5 moteur (parité oracle) | ✅ terminé |
| M5 | P6 démo LLM + P7 portfolio | ✅ en production |
| M6 | P8 espace apprenant | ✅ en production |
| M7 | P9 cartographe + P10 promptologue | ✅ en production |
| M8 | P11 masse B2B | ✅ en production |
| M9 | P12 durcissement + P13 prod v1.0.0 | ✅ intégré — déploiement + tag v1.0.0 par le chef d'orchestre |
