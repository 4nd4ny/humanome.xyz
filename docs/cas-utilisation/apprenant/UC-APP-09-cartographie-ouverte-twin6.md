# UC-APP-09 — Lancer une cartographie ouverte (Twin6)

| Champ | Valeur |
|---|---|
| **Acteur principal** | Apprenant (tout compte connecté) ; visiteur sans compte, pour l'essai gratuit (A6) |
| **Acteurs secondaires** | Fournisseur LLM (Anthropic) ; plateforme (clé plateforme et crédit prépayé, UC-APP-11 ; proxy de la démo, UC-VIS-03) ; administrateur (tarifs et contribution, UC-ADM-05 ; réglages de la démo, UC-ADM-04) |
| **Portée** | humanome.xyz — vue `#/twin6-ouverte`, moteur navigateur `engine/src/twin6/`, proxy facturé `POST /api/twin6/appel`, proxy de la démo `POST /api/llm` (essai gratuit) |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.2 (déclencher une cartographie), §4.3 (module cartographie), §5 (clé API personnelle), §6.1-6.2 (RGPD), §7 (modèle économique) ; ADR-001, ADR-004, ADR-010 §3 |
| **Statut** | Implémenté (cartographie ouverte Twin6, contribution +10 %) |

## Objectif

Permettre à un apprenant d'obtenir une cartographie de ses compétences avec le
protocole **ouvert** Twin6 — un scan par pôle du référentiel choisi (RESPIRE par
défaut, ou tout référentiel publié) puis une synthèse « kairos », sur le
portfolio **entier** — et de la voir dans le même sunburst
évolutif que toute cartographie. Le protocole est **open source** : ses prompts
sont publics et téléchargeables. L'usage du modèle est payé soit par la **clé
API personnelle** de l'apprenant (gratuit pour la plateforme), soit par son
**crédit prépayé** (coût réel des tokens + 10 % de contribution), soit, en
**essai gratuit** (A6), par la plateforme, dans les limites de sa démo :
5 000 caractères de portfolio, une feuille datée au moins, un budget du jour
commun avec l'Essayer et les autres usages de la démo.

## Déclencheur

L'apprenant ouvre `#/twin6-ouverte` (menu « Ma cartographie »), colle son
portfolio et clique sur « Lancer la cartographie ouverte ». Un visiteur, dont le
menu n'a pas cette entrée, y arrive par le lien « cartographie ouverte » de la
page Essayer (UC-VIS-03), ou par l'adresse.

## Préconditions

- Hors essai gratuit, l'apprenant a un compte actif et une session (UC-CPT-01,
  UC-CPT-02). Pour l'essai gratuit (A6), la démo est activée, un secret de
  preuve de travail existe et le budget du jour n'est pas épuisé (UC-VIS-03,
  UC-ADM-04).
- Le paquet public `data/twin6/twin6-ouverte-1.1.0.json` est servi par le site
  (scanPole, kairos, fiches P1..P7). Ce fichier n'est **pas versionné**
  (`web/public/data/` est ignoré par git) : il est **construit** avant chaque
  build du front (`prebuild` de `web/package.json`) — `scripts/generate-fiches.mjs`
  régénère les fiches `P1.md`..`P7.md` de `web/public/data/twin6/prompts/` depuis
  le corpus versionné `scripts/data/fiches-v7.json`, puis
  `scripts/build-twin6-package.mjs` assemble ces fiches avec les gabarits
  `1-scan-pole.md`, `2-kairos-final.md` et `0-mega-prompt.md`, versionnés dans
  `scripts/data/twin6/` (modèle cible par défaut `claude-sonnet-5`), en deux
  versions : 1.0.0, le paquet déployé à l'octet, et 1.1.0, dont les gabarits
  lisent le référentiel (RG10). Le même corpus alimente les paquets **publiés**
  et forkables `twin6-ouverte` 1.0.0 et 1.1.0 de l'atelier promptologue
  (`scripts/build-twin6-prompt-package.mjs`, régénéré par
  `scripts/deploy/stage-api.sh` dans `build/prompt-packages/`, marqués réservés),
  aux textes identiques octet pour octet. Ces constructions sont techniques,
  hors parcours de l'apprenant : elles relèvent de UC-SYS-04
  (`docs/cas-utilisation/systeme/UC-SYS-04-construire-artefacts-derives.md`).
- Un référentiel publié, RESPIRE par défaut, lisible dans l'export statique
  `data/referentiel/` (index et une version par fichier, UC-VIS-02) ; sans
  index (copie hors ligne), le RESPIRE embarqué. Pour RESPIRE, la structure
  servie par `GET /api/twin9/meta` (importée, UC-PRO-08 A4 : noms de pôle
  accentués) est celle des documents Twin6 tant qu'elle compte exactement les
  pôles et les compétences de la version choisie (RG9).
- Voie crédits : la clé plateforme `ANTHROPIC_API_KEY` est configurée et le
  solde prépayé couvre le run (UC-APP-11). Voie clé perso : l'apprenant saisit
  une clé Anthropic ou en a enregistré une dans son profil (UC-CPT-04).

## Garanties en cas de succès

- Un document `cartographie-merge` est produit **dans le navigateur** et rendu
  par `MergeView` (sunburst, feuilles de portfolio) ; il est exportable en JSON.
- Voie crédits : le solde est débité du **coût réel** de chacun des appels
  (un par pôle du référentiel, plus le kairos : 8 pour RESPIRE v7), à la
  contribution Twin6 (×1,10), et rien d'autre.
- Voie clé perso : aucun appel ne passe par l'API humanome, rien n'est débité.
- Essai gratuit (A6) : rien n'est débité ; le serveur ne garde que les
  compteurs de la démo (requêtes, jetons et coût estimé du jour, défis
  consommés hachés, seau de quota haché).

## Garanties minimales (en cas d'échec)

- Aucun document partiel n'est affiché ; le formulaire reste disponible.
- Un appel **refusé** (401, 403, 413, 422, 402) n'atteint pas l'amont et
  n'est pas facturé ; un appel qu'**Anthropic refuse** (statut d'erreur) ou ne
  reçoit jamais (connexion impossible) est intégralement remboursé (réserve
  rendue, E11). Un appel **coupé** après qu'Anthropic l'a reçu — délai
  dépassé, erreur en cours de flux, navigateur parti — est facturé pour ce
  qu'il a produit, jamais remboursé (E11, RG12) : la plateforme ne paie rien
  qu'elle ne refacture.
- En revanche, un appel **abouti** côté serveur est facturé au coût réel, même
  si le moteur échoue ensuite sur sa sortie : l'appel tronqué de E5, et tous les
  appels déjà aboutis d'un run qui s'arrête en cours (E4, E5, RG6, E11, JSON
  illisible), restent débités. Aucun document partiel n'est produit et il n'y a
  **pas de reprise** : relancer refacture tous les appels.
- Ni le portfolio, ni les prompts, ni les sorties ne sont conservés côté
  serveur : le grand-livre ne porte que des compteurs.

## Scénario nominal (voie crédits)

1. L'apprenant ouvre `#/twin6-ouverte`. La vue vérifie la session
   (`GET /api/auth/me`, qui sème aussi le jeton CSRF).
2. La vue charge en parallèle le paquet PUBLIC (`GET data/twin6/twin6-ouverte-1.1.0.json`,
   contrôlé : scanPole, kairos, fiches) et l'offre (`GET /api/twin9/meta` :
   prix Twin6 déjà margés `modeles_twin6`, référentiel, solde) ; en parallèle
   encore (effets séparés), elle lit la liste des clés enregistrées
   (`GET /api/keys`), dont l'échec est ignoré silencieusement, et le référentiel
   choisi — RESPIRE, sa dernière version publiée, par défaut
   (`GET data/referentiel/index.json` puis son fichier ; RESPIRE embarqué à
   défaut). Le choix « Référentiel » liste les référentiels publiés, chacun à sa
   dernière version, RESPIRE en tête (aucun choix sans index). Le modèle cible
   par défaut du paquet est présélectionné ; le décompte des appels s'affiche
   (« 8 appels au modèle (7 pôles + synthèse) » pour RESPIRE v7) ; un lien
   « Télécharger les prompts » (AGPL) est affiché.
3. L'apprenant colle son portfolio (feuilles `### AAAA-MM-JJ`, plus de 40
   caractères), choisit le modèle, garde RESPIRE (ou choisit un autre
   référentiel, A4) et garde la voie « Avec nos crédits ».
4. Au clic, la vue vérifie que le solde couvre le **poids** du portfolio
   (RG5), puis lance le moteur `executerTwin6` avec un provider « crédits »,
   le référentiel du run (RG9) et une fiche par pôle (RG6).
5. Le moteur enchaîne **un appel scan-pole par pôle** du référentiel (pôles
   triés par numéro, 1→7 pour RESPIRE v7 : gabarit public où `${POLE}` devient
   le numéro et dont les variables du référentiel sont rendues, RG10, fiche du
   pôle et portfolio attachés) puis **1 appel kairos** (les
   `carto_pole` de tous les pôles + le portfolio). Chaque appel est un
   `POST /api/twin6/appel {model, prompt, system, max_tokens}` avec le jeton CSRF,
   qui demande la réponse en flux (RG12) ;
   la progression « étape n/N » (N = pôles + 1, 8 pour RESPIRE v7), les
   caractères reçus de l'appel en cours (« 1 234 caractères reçus ») et la
   contribution cumulée (« … débités jusqu'ici ») s'affichent. Une sortie
   tronquée est détectée **ici**, dès le premier appel concerné (E5).
6. Pour chaque appel, le serveur : vérifie le jeton CSRF de la session (403,
   E12), exige la session (401), la clé plateforme
   (503), borne le corps à 2 Mo (413), valide modèle, prompt et `max_tokens`
   (422), **réserve** atomiquement le
   pire-cas au tarif Twin6 (402 sinon), appelle Anthropic en flux sur l'URL
   verrouillée, **réconcilie** la réserve au coût réel et renvoie
   `{text, usage, model, stopReason, cout_microusd}` (aucun rendu, aucun filtre :
   le prompt est public) — relayé à mesure qu'il arrive (RG12).
7. Le moteur extrait le JSON de chaque sortie, puis `twin6ToMergeDocument`
   décompose chaque `carto_pole` en instantanés **par feuille** (date des
   passages) et réutilise le pipeline de merge : niveaux, ipsatif, narratifs
   (rapport de pôle, kairos, histoire synthétisée) sans appel supplémentaire.
   Le document suit le référentiel du run (ses pôles, ses compétences) et le
   nomme (`referentiel`) s'il n'est pas RESPIRE (T17).
8. La vue affiche « Cartographie ouverte terminée — X $ de contribution », le
   bouton « Exporter le JSON » et le sunburst ; « Compétences établies » se
   compte sur les compétences du référentiel du run (« X / 61 » pour RESPIRE v7).

## Scénarios alternatifs

- **A1 — Voie clé perso, clé saisie** (étapes 3-6) : l'apprenant choisit « Avec
  ma propre clé API » et saisit sa clé (le bouton reste désactivé sans clé). Le
  provider est **direct** : chaque appel part du navigateur vers
  `https://api.anthropic.com/v1/messages` avec la clé en en-tête ; aucun appel à
  `/api/twin6/appel`, aucun débit, aucun garde-fou de solde (RG5) ; le message
  final indique « (avec votre clé) ». Contrairement à la voie crédits, le
  transport direct **réessaie automatiquement** (3 tentatives au plus sur 429,
  5xx ou erreur réseau, `Retry-After` honoré).
- **A2 — Clé enregistrée au profil** (étape 3) : si `GET /api/keys` liste une clé
  `anthropic`, l'option « Utiliser ma clé Anthropic enregistrée » est cochée par
  défaut ; au lancement la clé est révélée une fois (`GET /api/keys/anthropic`,
  propriétaire seul) puis utilisée comme en A1, sans ressaisie.
- **A3 — Sortie demandée hors bornes** (étape 6) : `max_tokens` (ou l'alias
  `maxTokens`) est ramené dans [256, maximum du modèle] — 128 000 pour Sonnet 5,
  Opus 5.5 ou Haiku 5.5, 64 000 pour Haiku 4.5 (`Llm\ModelLimits`) ; absent,
  c'est ce maximum. Le moteur envoie d'ailleurs ce même maximum
  (`sortieMaxAnthropic`, UC-APP-09-F01) : 16 000 au plus et 8 192 par défaut
  avant le 2026-10-21. Un arrêt `max_tokens` est relayé tel quel
  (`stopReason`) pour que le moteur échoue explicitement (E5).
- **A4 — Autre référentiel publié** (étapes 2-3, 2026-10-20) : l'apprenant
  choisit un autre référentiel dans « Référentiel » ; la vue charge sa dernière
  version et le décompte suit ses pôles (« 6 appels au modèle (5 pôles +
  synthèse) » pour cinq pôles). Le run lit son document : un scan par pôle, la
  fiche de chaque pôle écrite depuis le document (celles du paquet décrivent
  RESPIRE v7, RG6) ; le document produit le nomme et « Compétences établies »
  se compte sur ses compétences.
- **A5 — Version de RESPIRE d'une autre structure** (étapes 2-5) : la dernière
  version publiée de RESPIRE (ou celle choisie) n'a plus exactement les pôles
  et les compétences de `/api/twin9/meta` (six pôles, une compétence déplacée,
  UC-EPI-04) : le run lit le document de cette version (noms de pôle sans
  accent du document publié), un scan par pôle ; les fiches du paquet servent
  les pôles qu'elles décrivent encore à l'identique, les autres s'écrivent
  depuis le document. Le document reste un document de RESPIRE (sans
  `referentiel`).

- **A6 — Essai gratuit, avec ou sans compte** (2026-10-21, à la demande de
  Christian : « Twin6 : en version gratuite, mettre une limite de 1 USD de démo
  par jour pour des tests anonymes. », puis « 1 USD par jour pour tous les
  utilisateurs anonymes ou connectés ») : un visiteur sans session voit le
  formulaire avec cette seule voie, cochée, et une invitation à se connecter
  pour les deux autres (« Connectez-vous ») ; ni l'offre (`/api/twin9/meta`)
  ni les clés ne sont lues, et le run lit le document publié du référentiel
  choisi (RG9). Un compte la choisit parmi les trois. Le choix du modèle
  disparaît : le serveur de la démo impose le sien, un Haiku
  (`claude-haiku-5-5` par défaut, UC-ADM-04 RG8 et RG9) — Sonnet et Opus sont
  réservés aux voies crédits et clé perso. Un compteur « n / 5 000 caractères (essai gratuit) »
  s'affiche ; au-delà, le bouton reste inactif et la page dit combien retirer
  (RG11). Sans feuille datée — aucune ligne `### AAAA-MM-JJ` —, le bouton reste
  inactif aussi, et la page le dit : les huit appels, payés sur le budget du
  jour, finiraient sur « aucune feuille datée » (le texte collé dans l'Essayer
  n'en a pas). Au lancement, une première preuve de travail est résolue, puis
  chaque appel — un scan par pôle et le kairos, comme à l'étape 5 — est un
  `POST /api/llm` portant un défi neuf résolu à la volée (UC-VIS-03, étapes 3
  à 5) ; rien n'est débité, et le message final dit « (essai gratuit) ».

## Scénarios d'erreur

- **E1 — Visiteur sans session, ou erreur serveur sur `/auth/me`** (étape 1) :
  la vue propose l'essai gratuit seul (A6) et invite à se connecter pour les
  autres voies (« Connectez-vous ») ; le paquet et le référentiel sont chargés,
  ni l'offre ni les clés. Toute erreur non-401 de `GET /api/auth/me` (500,
  503…) produit le même écran, y compris pour un utilisateur connecté.
- **E2 — Copie statique sans API** (étape 1) : « Cette fonctionnalité nécessite le
  serveur (indisponible sur cette copie statique) ».
- **E3 — Solde trop bas pour le portfolio et le modèle** (étape 4, voie
  crédits) : alerte « Solde insuffisant pour ce portfolio avec ce modèle (~T $ :
  P $ estimés, et R $ réservés le temps de chaque appel puis rendus ; solde
  S $). Rechargez votre crédit, choisissez un modèle moins cher ou utilisez
  votre propre clé API. » — aucun appel (RG5).
- **E4 — Réserve non couverte** (étape 6) : `402 {error: "Solde insuffisant",
  solde_microusd, requis_estime_microusd}` ; l'amont n'est pas appelé ; la vue
  arrête le run et affiche le message, suivi de ce que le run a débité
  (« Solde insuffisant (0,0066 $ débités pour ce run.) », 2026-10-21) ; le bouton
  redevient cliquable. Les appels déjà aboutis du run restent facturés.
- **E5 — Sortie tronquée** (étape 5, dès le premier appel tronqué, sur toutes
  les voies depuis le 2026-10-22) : `stopReason = max_tokens` → le moteur lève
  « sortie tronquée (max_tokens) à l'étape … », sans nouvel essai, l'usage du
  run (l'appel tronqué compris) joint à l'erreur ; aucun document partiel. Un
  refus du fournisseur (`stopReason = refusal`) arrête le run de même. L'appel tronqué est un `200` côté
  serveur : il est facturé au coût réel, comme les appels aboutis avant lui.
  Depuis le 2026-10-21, chaque appel demande tout ce que le modèle peut rendre :
  une sortie n'est plus coupée que si elle atteint ce maximum.
- **E6 — Paquet public introuvable ou invalide, offre illisible** (étape 2) :
  « Paquet Twin6 introuvable (404) » ou « Paquet Twin6 invalide
  (scanPole/kairos/fiches attendus) » ; idem si l'offre `/api/twin9/meta` ne
  peut être lue (message du serveur) ; le formulaire n'est pas proposé.
- **E7 — Appel sans session** (étape 6) : `401 {error: "Authentification requise"}`.
- **E8 — Clé plateforme non configurée** (étape 6) : `503 Service indisponible`.
- **E9 — Requête invalide** (étape 6) : corps non JSON ou JSON scalaire →
  `400` ; corps > 2 Mo → `413` ; modèle hors offre (« Modèle non proposé »),
  prompt vide ou `max_tokens` non entier → `422` ; une liste JSON ou un corps
  vide sont traités comme un objet sans champ → `422` (modèle absent) ; rien
  n'est débité.
- ~~**E10 — Rythme dépassé**~~ : retiré le 2026-10-20 avec le réglage
  `appels_par_minute`, qui ne bornait plus que la cartographie ouverte depuis
  T11, à la demande de Christian ; la dépense reste bornée par le solde prépayé
  (RG3), le débit d'un compte ne l'est plus (voir Limites).
- **E11 — Échec du fournisseur** (étape 6), au message **générique**, jamais
  le texte amont :
  - refusé par Anthropic (statut d'erreur, avant toute réponse) → `502`
    (« Clé API refusée par le fournisseur LLM. » sur 401/403), `429` si saturé ;
    jamais reçu (connexion impossible) → `502`, ou `504` « Le fournisseur LLM ne
    répond pas… » quand la connexion n'aboutit pas à temps ; une erreur
    d'Anthropic dans le flux avant que la réponse commence (ni `message_start`,
    ni rien de produit) → `502`. Anthropic n'a rien facturé : la réserve est
    rendue (« twin6/cartographie (remboursement échec) ») ;
  - **coupé** après qu'Anthropic l'a reçu (2026-10-21, RG12) : délai dépassé
    (`TWIN6_UPSTREAM_TIMEOUT`, 150 s par défaut) → `504` « La réponse a dépassé
    le délai de N s : coupée, elle est facturée pour ce qu'elle a produit. » ;
    erreur d'Anthropic en cours de flux, réponse illisible → `502` « Le
    fournisseur LLM a interrompu sa réponse : elle est facturée pour ce qu'elle
    a produit. » ; le corps porte `code: "coupe"` et `cout_microusd`. Facturé :
    l'entrée annoncée par Anthropic au début du flux (sinon les octets du
    prompt), la sortie bornée par les octets reçus plus 1 024 jetons, au plus
    `max_tokens` — toute la sortie quand ces octets ne bornent rien (bloc de
    réflexion, réponse qui n'est pas un flux) ; le reste de la réserve est rendu
    (« twin6/cartographie (appel coupé) »). La page en ajoute le coût à la
    contribution cumulée et affiche le message suivi de ce que le run a débité
    (« (0,04 $ débités pour ce run.) »). Le navigateur qui part (onglet fermé)
    coupe l'appel de même. Un flux qui s'arrête sans issue — l'hébergement a
    arrêté le script — laisse la réserve débitée : la page dit « La connexion
    au serveur a été coupée avant la fin de la réponse. L'appel a pu être
    facturé, au plus le montant réservé pour lui : votre solde fait foi. »
  - **le règlement** (2026-10-21) : l'appel se facture au prix de la grille lue
    avant lui, même si elle change pendant qu'il court ; les crédits s'écrivent
    après un appel qui a pu durer des minutes, sur une connexion rouverte si la
    base a lâché la sienne. S'ils ne s'écrivent pas même ainsi, la réponse est
    rendue quand même, et le coût qu'elle annonce est la réserve, restée
    débitée — jamais un appel perdu, jamais au site.
- **E12 — Jeton CSRF absent ou invalide** (étape 6) : avec un cookie de session
  mais sans `X-CSRF-Token` valide → `403 {error: "Jeton CSRF absent ou
  invalide"}` (`CsrfMiddleware`, avant la route) ; rien n'est appelé ni débité.
- **E13 — Référentiel choisi illisible** (étapes 2-3, A4) : sa version ne se
  charge pas (« Le référentiel « id » version n'a pas pu être chargé ») : alerte,
  le bouton reste désactivé ; RESPIRE retombe sur le RESPIRE embarqué.
- **E14 — Essai refusé par la démo** (A6) : le premier refus arrête le run, sans
  nouvel essai contre un quota ou un budget. Budget du jour épuisé ou démo
  coupée (`503`) → « La démo est épuisée pour aujourd’hui ou momentanément
  désactivée. Revenez un peu plus tard — ou créez un compte pour cartographier
  sans ces limites. » ; quota horaire par IP (`429`) → « La démo est très
  demandée en ce moment : réessayez dans N minutes. » ; autre échec →
  « L’analyse a échoué en cours de route (détail technique : …) ». Ce sont les
  messages de l'Essayer (`describeDemoError`) ; le bouton redevient cliquable.
  Pour un compte, le `503` ne l'invite pas à en créer un : « L’essai gratuit est
  épuisé pour aujourd’hui ou momentanément désactivé. Revenez un peu plus tard —
  ou cartographiez avec nos crédits ou votre propre clé API. »
  Le fournisseur de la démo refait une fois un appel sur incident transitoire
  (UC-VIS-03 A4).

## Règles de gestion

- **RG1** — Twin6 est **open source** (AGPL) : prompts publics, aucun gabarit
  rendu côté serveur, aucune fiche confidentielle injectée, **aucun filtre
  anti-fuite** (contrairement à Twin9, UC-APP-10).
- **RG2** — Contribution Twin6 = `marge_twin6` (×1,10 par défaut, 1 à 5,
  réglable par l'administrateur), distincte de Twin9 (×1,20). Coût réel d'un
  appel en µUSD = ⌈tokens_in × prix_in × marge⌉ + ⌈tokens_out × prix_out × marge⌉
  (jamais arrondi en faveur de l'apprenant, au plus 2 µUSD au-dessus du montant
  exact).
- **RG3** — Réserve pire-cas **atomique** avant l'appel : entrée = octets du
  prompt (+ système), sortie = `max_tokens` (par défaut toute la sortie du
  modèle, RG4), au prix de la grille (relevée chaque jour, UC-ADM-05 A6) ;
  débit conditionnel sans découvert (402 sinon, avant toute dépense) ;
  réconciliation au coût réel après l'appel ; remboursement intégral si l'appel
  échoue. Une sortie sans plafond (2026-10-21) ne fait donc jamais dépenser plus
  que le solde : un compte qui ne couvre pas le pire cas d'un appel reçoit son
  402 avant que l'appel parte, jamais une réponse coupée.
- **RG4** — Bornes serveur : corps ≤ 2 Mo ; `max_tokens` (ou `maxTokens`)
  entier ramené dans [256, maximum du modèle] (ce maximum si les deux sont
  absents, `ModelLimits::sortieMax`) ; modèle ∈ offre ; prompt non vide.
- **RG5** — Garde-fou client avant un run sur crédits : solde ≥ max(1,
  ⌈octets du portfolio / 1 024⌉) USD (heuristique « ~1 ko = 1 $ »), plus la
  réserve d'un appel — toute la sortie du modèle à son prix Twin6 (≈ 1,41 $
  pour Sonnet 5 : 128 000 tokens à 11 $ le million, contribution comprise ;
  ≈ 0,07 $ pour Haiku 5.5), rendue après chaque appel mais qui doit tenir à
  chacun ; sans elle,
  un solde qui couvre le poids finirait sur un 402 au milieu du run, ses
  premiers scans payés (2026-10-21). Aucune garde sur la voie clé perso.
- **RG6** — Un run = un appel scan-pole par pôle du référentiel du run (pôles
  triés par numéro) + 1 kairos — 8 pour RESPIRE v7 (`twin6CallsFor`). La fiche
  d'un pôle est celle du paquet public quand ses titres « ## CODE — »
  nomment exactement les compétences du pôle (RESPIRE v7 : P1..P7 à
  l'identique), sinon écrite depuis le document du référentiel — « # Pôle N —
  nom », sa description, puis chaque compétence (`fichesPourTwin6`). Le moteur,
  lui, arrête le run avant l'appel d'un pôle sans fiche (UC-APP-09-U06) ; la
  vue lui en donne toujours une.
- **RG7** — Twin6 ne dépend ni de l'import de Twin9 ni de la promotion
  « Twin9 gratuit » (UC-ADM-05). (L'interrupteur `enabled` qu'écrivait l'import
  est parti le 2026-10-20.)
- **RG8** — Projection : une compétence n'est « présente » sur une feuille que si
  une de ses traces retenues renvoie à un passage de cette feuille ; le verdict
  d'une feuille n'est jamais promu au-dessus du verdict global.
- **RG9** — Référentiel du run (2026-10-20, `referentielTwin6`) : le document
  publié choisi ; pour RESPIRE, la structure de `/api/twin9/meta` (noms de pôle
  accentués de l'import, ceux des documents Twin6 d'avant) tant qu'elle a
  exactement les pôles et les compétences de la version choisie. Un document
  d'un autre référentiel le nomme (`referentiel`), un document de RESPIRE non
  (T17) ; la version n'est pas dans le document.
- **RG10** — Gabarits du paquet servi (1.1.0, 2026-10-20) : ce qu'écrit en
  toutes lettres la 1.0.0 de RESPIRE v7 — « un des 7 pôles du référentiel
  RESPIRE », « les 61 verdicts », la forme `X.YY`, quatre codes d'exemple — y
  est une variable (`${REFERENTIEL}`, `${NB_POLES}`, `${NB_COMPETENCES}`,
  `${FORMAT_CODE}`, `${PRECISION_FORMAT_CODE}`, `${CODES_EXEMPLE}`) que
  `executerTwin6` rend depuis le référentiel du run avant tout appel
  (`variablesTwin6`). Pour RESPIRE v7, les prompts sont ceux de 1.0.0 à
  l'octet (UC-APP-09-U33).
- **RG11** — Essai gratuit (A6) : par le proxy de la démo, avec ses garde-fous
  (preuve de travail à usage unique, quota par IP, coupe-circuit journalier qui
  réserve le pire cas de chaque appel, UC-VIS-03 RG4) et le budget du jour que
  partage tout ce qui passe par `POST /api/llm` — 1 $ par défaut —, visiteurs et
  comptes confondus ; le serveur impose modèle (un Haiku), sortie (le maximum
  du modèle, 128 000 jetons pour Haiku 5.5, sans plafond depuis le 2026-10-21)
  et délai (UC-ADM-04) ; la réponse y arrive en flux comme sur la voie crédits
  (UC-VIS-03 RG6), les caractères reçus affichés de même. La page borne le portfolio à 5 000 caractères
  (`DEMO_TEXT_MAX_CHARS`) et exige une feuille datée ; le serveur borne l'appel
  entier (`maxInputChars`, 2 000 000 par défaut : un scan porte ≈ 56 000
  caractères, gabarit public, fiche du pôle et portfolio, et la synthèse les
  sorties des sept scans, qu'aucun plafond ne borne plus — des scans de 64 000
  jetons chacun y tiennent, UC-APP-09-U35). Chaque appel réserve son pire cas,
  ≈ 0,07 $ avec Haiku 5.5 : un essai commencé près de la fin du budget du jour
  peut s'arrêter après ses premiers scans (E14).
- **RG12** — Réponse en flux (2026-10-21, Christian : « Si on passe en appel en
  flux, alors on voit la réponse arriver au fur et à mesure ? […] Si oui,
  alors c'est mon choix » ; « Je ne peux pas prendre à charge les coûts
  extra ») : `/api/twin6/appel` demande à Anthropic une réponse diffusée et la
  relaie au navigateur qui le demande (`Accept: text/event-stream`, ce que
  fait le provider « crédits ») — `progression` {caracteres}, `: attente`
  après 10 s de silence, puis `resultat` (le JSON du nominal) ou `erreur`
  {status, error, code, cout_microusd} ; tout autre client reçoit ce JSON à la
  fin. Le délai d'un appel est `TWIN6_UPSTREAM_TIMEOUT` (150 s par défaut, de
  10 à 900) : OVH borne un script à 165 s sur le mutualisé, sans réglage
  possible — du temps de calcul, sans doute, où l'attente du réseau ne compte
  pas : à mesurer en recette avant de le relever. Un appel coupé est facturé pour ce qu'il a produit (E11),
  jamais remboursé : seul un appel qu'Anthropic n'a pas facturé — refusé, ou
  jamais reçu — rend sa réserve. Aucun nouvel essai côté serveur.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Texte du portfolio | Voie crédits et essai gratuit : transite par le serveur et Anthropic le temps de l'appel, **jamais stocké** ni journalisé ; voie clé perso : ne passe que du navigateur au fournisseur |
| Clé API personnelle | Saisie : reste dans le navigateur ; enregistrée : coffre chiffré (ADR-004), révélée au seul propriétaire |
| Prompts | Publics (paquet AGPL téléchargeable) |
| Grand-livre | `twin9_credit_events` : montants, modèle, tokens, libellé d'étape — jamais de contenu |
| Essai gratuit | Compteurs de la démo seulement (`llm_usage_daily`, `llm_pow_challenges` hachés, `rate_limits` au seau haché), comme l'Essayer (UC-VIS-03) |
| Document produit | Reste dans le navigateur (export JSON à la demande) |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash` | Route `#/twin6-ouverte` |
| Front | `web/src/views/Twin6OuverteView.jsx` | Garde de session, formulaire, voies de paiement, garde-fou de solde, progression, résultat |
| Front | `web/src/api/twin6.js` — `loadTwin6Package`, `makeCreditsProvider`, `makeOwnKeyProvider`, `fetchTwin6Offer` | Paquet public, provider proxy facturé, provider direct, offre |
| Front | `web/src/api/twin6.js` — `referentielTwin6` | Référentiel du run (RG9) — unitaire : UC-APP-09-U32 |
| Front | `web/src/components/ReferentielChoice.jsx`, `web/src/data/referentiel.js` — `listPublishedReferentiels`, `loadPublishedReferentiel` | Choix et chargement du référentiel publié (étape 2, A4, E13) |
| Front | `web/src/api/twin9.js` — `referentielPourMoteur`, `formatUsd` | Adaptation du référentiel de `/meta`, montants |
| Front | `web/src/api/keys.js` — `listKeys`, `revealKey` | Clé enregistrée au profil |
| Front | `web/src/lib/demo-llm.js` — `createDemoProvider`, `describeDemoError`, `DEMO_MODEL`, `DEMO_TEXT_MAX_CHARS` | Essai gratuit : un défi par appel, messages des refus, borne du portfolio (A6, E14) — unitaires : UC-VIS-03 |
| Front | `web/src/api/client.js` — `fetchMe`, `apiFetch`, `ApiError`, `ApiUnavailableError` | Session et amorçage du jeton CSRF (étape 1), jeton sur chaque mutation, erreurs typées (E1, E2, E4) — unitaires : UC-APP-09-U15, U16 ; copie statique : UC-CPT-02-U12 |
| Build | `scripts/build-twin6-package.mjs` (après `scripts/generate-fiches.mjs`, `prebuild` du front) | Construit le paquet public servi à l'étape 2 (précondition) — relève de UC-SYS-04 : rejoué en sous-processus dans un miroir temporaire par UC-SYS-04-F11 (fiches absentes, puis entrées versionnées seules) et F12 (1.0.0 et 1.1.0, dérive d'un gabarit) |
| Build | `scripts/build-twin6-prompt-package.mjs` — `buildTwin6PromptPackageDoc` | Paquet publié forkable `twin6-ouverte` (même corpus) — relève de UC-SYS-04 : rejoué en sous-processus dans un miroir temporaire par UC-SYS-04-F11 et F12 ; test historique `web/src/views/promptologue/twin6-prompt-package.test.js` |
| Front | `web/src/views/MergeView.jsx`, `web/src/components/StatBadges.jsx`, `web/src/lib/download-json.js` | Rendu sunburst commun, total « Compétences établies » du référentiel du run, export JSON (étape 8) — composants partagés (unitaires relevant de UC-APP-03 et UC-APP-12), rendus ici fonctionnellement (UC-APP-09-F01, F21, F22) |
| Moteur | `engine/src/twin6/index.js` — `buildScanPolePrompt`, `buildKairosPrompt`, `extractJson`, `executerTwin6`, `TWIN6_CALLS`, `twin6CallsFor` | Orchestration : un scan par pôle + le kairos |
| Moteur | `engine/src/twin6/fiches.js` — `fichesPourTwin6`, `fichesDuReferentiel` | La fiche de chaque pôle (RG6) |
| Moteur | `engine/src/twin6/variables.js` — `variablesTwin6`, `rendreGabaritTwin6` | Les variables du référentiel dans les gabarits (RG10) |
| Build | `scripts/twin6-gabarits.mjs` — `gabaritsTwin6` | Gabarits versionnés : 1.0.0 tels quels, 1.1.0 par remplacements vérifiés (RG10) — relève de UC-SYS-04 |
| Moteur | `engine/src/twin6/mapper.js` — `twin6ToMergeDocument` | Projection vers `cartographie-merge` |
| Moteur | `engine/src/providers/index.js` — `createProvider` (direct) | Voie clé perso |
| API | `POST /api/twin6/appel` — `api/src/routes/twin9.php` | Proxy facturé (voie crédits) |
| Domaine | `api/src/Llm/ModelLimits.php` — `sortieMax` ; `engine/src/providers/limits.js` — `sortieMaxAnthropic` | La sortie maximale de chaque modèle Claude : défaut et borne du serveur (RG4), défaut du moteur, réserve du garde-fou client (RG5) |
| API | `GET /api/llm/challenge`, `POST /api/llm` — `api/src/routes/llm.php` ; `api/src/Llm/DemoConfig.php`, `api/src/Llm/Pricing.php` | Proxy de la démo (essai gratuit), ses réglages et son tarif — relèvent de UC-VIS-03 et UC-ADM-04 |
| API | `api/src/Middleware/CsrfMiddleware.php` | Jeton CSRF des mutations (E12) — logique unitaire couverte par UC-CPT-02-U07 |
| API | `GET /api/keys/anthropic` — `api/src/routes/keys.php`, `api/src/Keys/KeyVault.php` | Révélation de la clé enregistrée (A2) — garde propriétaire et chiffrement couverts par UC-CPT-04 |
| API | `GET /api/twin9/meta` — `api/src/routes/twin9.php` | Offre (prix Twin6, référentiel, solde) |
| Domaine | `api/src/Twin9/Twin9Config.php` — `coutMicrousd`, `reserveMicrousd`, `publicView`, `marge`, `modeles` | Tarification Twin6, bornes |
| Domaine | `api/src/Twin9/CreditService.php` — `debit`, `adjust` ; `SoldeInsuffisantException` | Réserve, réconciliation, remboursement |
| Domaine | `api/src/Twin9/AnthropicCaller.php` — `params`, `entetes`, `BASE_URL` | La requête amont, sur l'URL verrouillée |
| Domaine | `api/src/Llm/AnthropicFlux.php`, `RelaisAppel.php` | L'appel en flux, son relais, ce qu'un appel coupé a produit (RG12, E11) |
| Front | `web/src/api/relais.js` ; `web/src/api/client.js` — `apiFetch` | Lecture du relais : progression, issue, annulation (RG12) |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-APP-09-U01 | `buildScanPolePrompt` | Toutes les occurrences de `${POLE}` remplacées ; fiche puis portfolio attachés | `engine/test/usecases/unit/uc-app-09-cartographie-ouverte-twin6.test.js` |
| UC-APP-09-U02 | `buildKairosPrompt` | Blocs `carto_P<n>` JSON dans l'ordre reçu, portfolio original | idem |
| UC-APP-09-U03 | `extractJson` | Bloc ```json prioritaire, préambule toléré, erreurs explicites | idem |
| UC-APP-09-U36 | `extractJson` | Un document JSON pur (sortie à outil forcé) se lit tel quel, même quand une de ses chaînes cite un bloc ``` (un portfolio d'informatique) ; un tableau garde le chemin tolérant | idem |
| UC-APP-09-U04 | `executerTwin6` | Entrées invalides refusées avant tout appel | idem |
| UC-APP-09-U05 | `executerTwin6` | 8 appels, pôles triés, `poleNum` complété, progression, usage, document valide | idem |
| UC-APP-09-U06 | `executerTwin6` | Fiche manquante → arrêt avant l'appel du pôle (RG6) | idem |
| UC-APP-09-U07 | `executerTwin6` | `stopReason max_tokens` → échec nommant l'étape (E5) | idem |
| UC-APP-09-U08 | `twin6ToMergeDocument` | Feuilles par date, renvoi jamais promu, narratifs rattachés ; un pôle sur deux feuilles : chaque compétence n'est présente que là où ses traces renvoient (RG8) | idem |
| UC-APP-09-U09 | `twin6ToMergeDocument` | **Anomalie figée** : pôle sans présence → domaine vide non conforme au schéma | idem |
| UC-APP-09-U10 | `twin6ToMergeDocument` | Entrées vides refusées | idem |
| UC-APP-09-U11 | `createProvider` direct (A1) | Appel direct à api.anthropic.com ; sortie tronquée → `OutputTruncatedError` (un appel, usage porté), puis échec d'`executerTwin6` nommant l'étape (anomalie 1 corrigée le 2026-10-22) | idem |
| UC-APP-09-U12 | `executerTwin6` | **Limite figée** : référentiel vide → 1 appel kairos puis échec | idem |
| UC-APP-09-U31 | `executerTwin6`, `twin6CallsFor`, `fichesPourTwin6`, `twin6ToMergeDocument` | Tout référentiel : cinq pôles lettrés → 6 appels, fiches écrites depuis le document, document qui le nomme et lui est conforme ; RESPIRE à six pôles → 7 appels, document de RESPIRE conforme à sa version (A4, A5, RG6, RG9) | idem |
| UC-APP-09-U33 | `executerTwin6`, `gabaritsTwin6`, `variablesTwin6` | Paquet servi (1.1.0) : pour RESPIRE v7, les huit prompts de 1.0.0 à l'octet ; pour cinq pôles lettrés, son nom, ses pôles, ses compétences et la forme de ses codes, sans variable restante (RG10) | idem |
| UC-APP-09-U35 | `buildScanPolePrompt`, `buildKairosPrompt`, `gabaritsTwin6` | Essai gratuit : sur les gabarits servis et RESPIRE v7, les scans d'un portfolio de 5 000 caractères et la synthèse dont les sept scans, sans plafond de sortie, ont rendu chacun 64 000 jetons, la moitié du maximum de Haiku 5.5, tiennent sous les 2 000 000 de caractères par défaut (RG11) | idem |
| UC-APP-09-U37 | `executerTwin6` | Sans `maxTokens`, chaque appel demande toute la sortie du modèle : 128 000 pour Sonnet 5, 64 000 pour Haiku 4.5, 64 000 pour un Claude que la table ne connaît pas (RG4, 2026-10-21) | idem |
| UC-APP-09-U13 | `parseHash` | `#/twin6-ouverte` → vue `twin6ouverte` | `web/test/usecases/unit/uc-app-09-cartographie-ouverte-twin6.test.jsx` |
| UC-APP-09-U14 | `loadTwin6Package` | URL publique, modèle par défaut, HTTP en échec ou paquet incomplet → message (E6) | idem |
| UC-APP-09-U15 | `makeCreditsProvider` | Corps, jeton CSRF de session, contrat moteur, contribution remontée | idem |
| UC-APP-09-U16 | `makeCreditsProvider` | Replis sûrs ; 402 → `ApiError`, aucune contribution | idem |
| UC-APP-09-U17 | `makeOwnKeyProvider` | Transport direct, jamais `/api`, clé exigée | idem |
| UC-APP-09-U18 | `fetchTwin6Offer` | Prix Twin6, promo, référentiel, solde, replis | idem |
| UC-APP-09-U19 | `referentielPourMoteur` | Pôles et compétences aplaties | idem |
| UC-APP-09-U20 | `formatUsd` | µUSD → « x,yy $ », 4 décimales sous le centime | idem |
| UC-APP-09-U32 | `referentielTwin6` | RESPIRE : la structure de `/meta` tant qu'elle est celle de la version (ordre indifférent) ; compétence déplacée, pôle en moins, `/meta` vide, autre référentiel → le document (RG9) | idem |
| UC-APP-09-U28 | `listKeys`, `revealKey` | Liste sans la clé, révélation `GET api/keys/anthropic` (A2) ; la garde propriétaire relève de UC-CPT-04 | idem |
| UC-APP-09-U29 | `Twin6OuverteView` (isolée) | Garde-fou : ⌈octets / 1024⌉ $, plus la réserve d'un appel (toute la sortie du modèle à son prix), comparés au solde avant tout provider ; montant requis arrondi au centime supérieur (RG5, E3) | idem |
| UC-APP-09-U38 | `makeCreditsProvider` | Demande le relais ; progression en caractères ; le résultat relayé rend le contrat moteur et sa contribution ; coupé, l'appel remonte son coût puis échoue au message du serveur ; connexion perdue : l'appel a pu être facturé ; l'annulation reste une `AbortError` (RG12, E11) | `web/test/usecases/unit/uc-app-09-cartographie-ouverte-twin6.test.jsx` |
| UC-APP-09-U39 | `Twin6OuverteView` (isolée) | Voie crédits : les caractères reçus de l'appel en cours, remis à zéro à chaque étape ; un appel coupé laisse son message et ce que le run a débité (RG12, E11) | idem |
| UC-APP-09-U34 | `Twin6OuverteView` (isolée) | Essai gratuit : un visiteur n'a que cette voie, ni offre ni clés lues ; 5 000 caractères au plus, une feuille datée au moins (sinon bouton inactif et la page dit pourquoi) ; la première preuve avant le moteur, qui reçoit le fournisseur de la démo et le modèle indicatif « demo » (A6, RG11) | idem |
| UC-APP-09-U21 | `Twin9Config::coutMicrousd` | Coût Twin6 ×1,10 arrondi au-dessus, < Twin9 ×1,20 (RG2) | `api/tests/UseCases/Unit/UcApp09CartographieOuverteTwin6Test.php` |
| UC-APP-09-U22 | `Twin9Config::reserveMicrousd` | Réserve ≥ tout coût réel possible (RG3) | idem |
| UC-APP-09-U23 | `Twin9Config::publicView` | Prix Twin6 margés exposés, marges jamais | idem |
| UC-APP-09-U24 | `CreditService::debit`, `adjust` | Réserve + réconciliation = coût réel ; remboursement d'échec | idem |
| UC-APP-09-U25 | `CreditService::debit`, `SoldeInsuffisantException` | Aucun découvert, montants portés par l'exception | idem |
| UC-APP-09-U26 | `AnthropicCaller::params`, `AnthropicFlux` | URL verrouillée, système transmis, réflexion coupée, flux demandé ; texte et usage réels relus du flux, la réflexion jamais dans le texte (RG12) | idem |
| UC-APP-09-U40 | `Db::avecReconnexion` | Une connexion que le serveur a lâchée (MySQL 2006) est rouverte, l'écriture refaite une fois ; toute autre erreur remonte, sans nouvel essai (E11) | `api/tests/UseCases/Unit/UcApp09CartographieOuverteTwin6Test.php` |
| UC-APP-09-U27 | `AnthropicFlux::parvenu` | Refus d'Anthropic (son corps lu entier) ou requête jamais partie : rien à facturer ; réponse commencée, ou requête partie entière avant la panne du réseau : facturable (E11) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-APP-09-F01 | Nominal | IHM | `<App/>` : RESPIRE par défaut, « 8 appels au modèle (7 pôles + synthèse) » ; progression « étape 1/8 » et contribution cumulée pendant le run ; 8 appels via `/api/twin6/appel` avec CSRF, la fiche du paquet telle quelle, contribution finale, secteurs du sunburst, export JSON (`cartographie-merge` sans `referentiel`, noms de pôle de `/meta`, `.json`, aucun envoi réseau) ; « Compétences établies » sur les compétences du référentiel du run (anomalie 3 corrigée) ; portfolio envoyé nulle part ailleurs | `web/test/usecases/functional/uc-app-09-cartographie-ouverte-twin6.test.jsx` |
| UC-APP-09-F02 | A1, RG5 | IHM | Clé saisie, solde nul : 8 appels directs au fournisseur, aucun passage par l'API, aucun garde-fou de solde | idem |
| UC-APP-09-F03 | A2 | IHM | Clé du profil révélée une fois, 8 appels directs avec elle, aucun appel à `/api/twin6/appel` (voie crédits câblée en échec), « (avec votre clé) » | idem |
| UC-APP-09-F04 | E1 | IHM | Anonyme : l'essai gratuit seul, invitation à se connecter pour les autres voies ; ni offre ni clés lues | idem |
| UC-APP-09-F05 | E2 | IHM | Copie statique : fonctionnalité indisponible | idem |
| UC-APP-09-F06 | E3 | IHM | Solde < poids du portfolio et réserve d'un appel (« ~2.41 $ : 1 $ estimés, et 1.41 $ réservés… », Sonnet 5 à 2 / 10) : blocage avant tout appel | idem |
| UC-APP-09-F07 | E4 | IHM | 402 en cours de run : arrêt, message suivi de ce que le run a débité, bouton réutilisable | idem |
| UC-APP-09-F08 | E5 | IHM | Sortie tronquée : échec explicite, pas d'export | idem |
| UC-APP-09-F09 | E6 | IHM | Paquet public introuvable, ou offre `/meta` en erreur : erreur de chargement, formulaire absent | idem |
| UC-APP-09-F21 | A4 | IHM | Autre référentiel publié choisi : décompte « 6 appels (5 pôles + synthèse) », 6 appels, fiches écrites depuis son document, export qui le nomme, total de ses compétences | idem |
| UC-APP-09-F22 | A5 | IHM | Dernière version de RESPIRE à six pôles : 7 appels, document de RESPIRE aux pôles de cette version (noms du document publié), total de ses compétences | idem |
| UC-APP-09-F23 | A6 | IHM | Visiteur : 8 `POST /api/llm` à un faux serveur aux règles PHP, chacun avec un défi neuf résolu ; aucun `/api/twin6/appel`, ni offre ni clés ; « (essai gratuit) », sunburst | idem |
| UC-APP-09-F24 | A6 | IHM | Un compte choisit l'essai gratuit : le choix du modèle disparaît, 8 appels par la démo, aucun par `/api/twin6/appel` | idem |
| UC-APP-09-F25 | A6, RG11 | IHM | Portfolio de 5 001 caractères : bouton inactif, « (retirez-en 1) », aucune requête à la démo | idem |
| UC-APP-09-F26 | E14 | IHM | Budget du jour épuisé (`503`) : message de la démo dès le premier appel, sans nouvel essai, bouton de nouveau cliquable | idem |
| UC-APP-09-F27 | E14 | IHM | Un compte sur l'essai gratuit, budget du jour épuisé (`503`) : ses deux autres voies, pas l'invitation à créer un compte | idem |
| UC-APP-09-F10 | Nominal | API | 8 appels : contrat, `text` amont intact et `model`, coût 4 400 µUSD chacun (Sonnet 5 à 2 / 10), prompt public transmis tel quel, grand-livre réserve/réconciliation | `api/tests/UseCases/Functional/UcApp09CartographieOuverteTwin6Test.php` |
| UC-APP-09-F11 | Nominal (étape 2), RG7 | API | `/api/twin9/meta` : prix Twin6, référentiel, solde ; Twin6 fonctionne sans Twin9 importé | idem |
| UC-APP-09-F12 | E7 | API | 401 sans session, aucun appel amont | idem |
| UC-APP-09-F13 | E8 | API | 503 sans clé plateforme, rien débité | idem |
| UC-APP-09-F14 | E9 | API | 422 / 413 / 400 (JSON scalaire ou illisible) ; liste JSON ou corps vide → 422 ; avant tout débit | idem |
| UC-APP-09-F15 | E4 | API | 402 avec montants (réserve exacte), solde intact | idem |
| UC-APP-09-F17 | E11 | API | Refus d'Anthropic (500, 529, 401 « Clé API refusée », 429 relayé) ou requête jamais reçue (502, 504 à son délai) : messages génériques, jamais le texte amont, réserves rendues | idem |
| UC-APP-09-F28 | RG12 | API | La réponse arrive en flux : progressions, puis le résultat du nominal, coût compris ; débit net = coût réel ; le navigateur parti après la première progression → l'appel coupé, facturé pour l'entrée annoncée et le premier morceau reçu, « appel coupé » au grand-livre | idem |
| UC-APP-09-F29 | E11, RG12 | API | Délai dépassé en route (504, délai réglé à 40 s par `TWIN6_UPSTREAM_TIMEOUT`, celui de la requête amont), erreur d'Anthropic en cours de flux relayée (502), délai dépassé après l'envoi sans réponse (504, au plus `max_tokens`) : facturés pour ce qu'ils ont produit, jamais remboursés ; une erreur avant que la réponse commence : rendue | idem |
| UC-APP-09-F30 | E11 | API | La grille change pendant l'appel (Sonnet 5 retiré) : facturé au prix lu avant lui ; le grand-livre indisponible au règlement : la réponse est rendue, son coût annoncé est la réserve, restée débitée | idem |
| UC-APP-09-F18 | A3, E5 | API | `max_tokens` borné à [256, maximum du modèle] (alias accepté ; par défaut toute la sortie, 128 000 pour Sonnet 5), `stopReason max_tokens` relayé ; l'appel tronqué est facturé au coût réel (Sonnet 5 à 2 / 10 ; solde = recharge − somme des coûts) | idem |
| UC-APP-09-F19 | RGPD | API | Sortie relayée non filtrée à l'apprenant ; grand-livre et audit sans prompt ni sortie | idem |
| UC-APP-09-F20 | E12 | API | Session sans jeton CSRF ou avec un jeton faux → 403, amont non appelé, solde intact | idem |

### Tests existants liés (non-régression)

- `api/tests/Twin6AppelTest.php` — session, 503, validation, 402, facturation à +10 %.
- `web/src/views/Twin6OuverteView.test.jsx` — vue isolée (voies, clé du profil, garde-fou, export).
- `web/src/api/twin6.test.js` — client du paquet, providers, offre.
- `engine/src/twin6/index.test.js`, `engine/src/twin6/mapper.test.js` — moteur et projection, sur RESPIRE et
  sur d'autres structures (cinq pôles lettrés, RESPIRE à six pôles).
- `engine/src/twin6/fiches.test.js` — la fiche de chaque pôle pour tout référentiel (RG6).
- `web/src/components/StatBadges.test.jsx`, `web/src/views/MergeView.test.jsx` — total des compétences établies lu
  dans le référentiel, jamais 61 supposé.
- `engine/src/providers/index.test.js` — transport direct Anthropic.
- `api/tests/PackagesTwin6Test.php`, `web/src/views/promptologue/twin6-prompt-package.test.js` — paquet Twin6 côté atelier promptologue.

### Exécuter

```sh
(cd api && vendor/bin/phpunit --filter UcApp09 --testdox)
cd web && npx vitest run test/usecases/unit/uc-app-09 test/usecases/functional/uc-app-09
cd engine && npx vitest run test/usecases/unit/uc-app-09
```

## Anomalies constatées

1. ~~**Voie clé perso : troncature non détectée explicitement.**~~ Corrigée le
   2026-10-22 (`docs/contrats.md` §4 point 14). Le provider direct Anthropic
   (`engine/src/providers/anthropic.js`, `parseResponse`) ne relayait pas
   `stop_reason` ; la garde « sortie tronquée (max_tokens) » d'`executerTwin6` ne
   se déclenchait que sur la voie crédits, et une sortie tronquée échouait plus
   loin, au parsing JSON. L'arrêt est désormais lu et normalisé, la sortie
   tronquée lève une `OutputTruncatedError` sur toutes les voies, et
   `executerTwin6` échoue en nommant l'étape, l'usage de l'appel payé compté
   (UC-APP-09-U11).
2. **Pôle sans aucune présence établie → document non conforme au schéma.**
   `twin6ToMergeDocument` émet alors un domaine sans compétence, ce que le schéma
   `cartographie-merge` refuse (`domains[].competences` : `minItems 1`). Le viewer
   le tolère, mais le JSON exporté ne se revalide pas : le rechargement d'un fichier
   utilisateur (`web/src/data/load.js`, validation ajv) le refuse. Le test
   historique du mapper Twin6 qualifie ces domaines vides de « légitimes » sans
   en produire aucun (figé par UC-APP-09-U09).
3. ~~**Dénominateur « Compétences établies » figé à 61.**~~ Corrigée le
   2026-10-20 : `Twin6OuverteView` passe à `MergeView` le référentiel du run
   (`{poles, competences}`), et `MergeView` / `StatBadges` ne supposent plus 61 —
   sans référentiel, le compte s'affiche seul. Avec le référentiel fictif à 7
   compétences, l'écran affiche « X / 7 » (UC-APP-09-F01).

## Limites

- Un run n'est pas reprenable : une interruption (402, sortie tronquée, fiche
  manquante, échec amont, JSON illisible) laisse facturés les appels déjà
  aboutis, et une relance refacture tous les appels (UC-APP-09-F07, UC-APP-09-F18).
- Au niveau du moteur, un référentiel sans pôle lance un unique appel kairos
  (facturé sur la voie crédits) puis échoue au mapping (figé par
  UC-APP-09-U12). La vue n'y mène plus : depuis le 2026-10-20, si
  `/api/twin9/meta` n'a jamais été importé, le run lit le document publié de
  RESPIRE (RG9).
- Le méga-prompt du paquet (`0-mega-prompt.md`), un protocole manuel que le
  moteur n'exécute pas, décrit RESPIRE v7 (P1..P7) dans ses deux versions.
- Un pôle du référentiel où le run n'établit aucune présence produit un domaine
  vide, que le schéma refuse (anomalie 2) : plus un référentiel compte de
  pôles, plus le cas est probable.
- La construction du paquet public (précondition) n'est pas testée au titre de
  ce cas mais de UC-SYS-04 : `scripts/build-twin6-package.mjs` (qui écrit
  `web/public/data/twin6/twin6-ouverte-1.0.0.json` et `-1.1.0.json`) et
  `scripts/build-twin6-prompt-package.mjs` y sont rejoués dans un miroir
  temporaire (UC-SYS-04-F11, F12), depuis les gabarits versionnés
  (`scripts/data/twin6/`, depuis le 2026-10-20). Les tests de ce cas utilisent
  un paquet fictif de même forme, sauf UC-APP-09-U33, qui lit les gabarits
  versionnés.
- Aucun rythme ne borne plus les appels d'un compte (E10, retiré le
  2026-10-20) : un compte crédité peut en lancer en parallèle sur la clé de la
  plateforme, chacun occupant un processus PHP jusqu'à la réponse et les quotas
  Anthropic de l'instance, que partagent les runs Twin9 à clé d'instance. Le
  parcours de la vue (un appel après l'autre) n'en approche pas l'ancien seuil
  (30 par minute). Une limite fixe dans le code reste à décider.
- L'essai gratuit ne vérifie pas d'avance que la démo est ouverte : une démo
  coupée se découvre au premier défi (`503` dès la première preuve), une démo
  épuisée au premier appel, après une preuve résolue (E14), comme pour
  l'Essayer (UC-VIS-03, Limites). La borne de 5 000
  caractères est celle de la page : un client qui appelle `POST /api/llm`
  lui-même n'est borné que par `maxInputChars`, son quota horaire et le budget
  du jour.
- ~~**À vérifier au premier run réel : le plafond de sortie des voies
  payantes.**~~ Levé le 2026-10-21 (Christian : « Ok pour lever le plafond des
  tokens de sortie ») : les sorties du même schéma du prototype de fusion
  (`assets-existants/merge-prototype/extracted`, 59 journées) font 30 500
  caractères compacts par pôle en médiane, plus que les 8 192 jetons que les
  voies « crédits » et « clé perso » demandaient ; chaque appel demande
  désormais tout ce que le modèle peut rendre, sur les trois voies (A3, RG11).
  Mais le délai borne encore la sortie : la voie crédits attend l'amont 150 s
  au plus (`TWIN6_UPSTREAM_TIMEOUT`), et une sortie plus longue que ce que le
  modèle écrit dans ce délai est coupée. Jusqu'au 2026-10-21, le délai dépassé
  rendait la réserve alors qu'Anthropic avait pu facturer l'appel : la
  plateforme le payait, et un compte crédité pouvait le provoquer exprès.
  Décidé ce jour-là (Christian choisit l'appel en flux, RG12) : l'appel coupé
  est facturé pour ce qu'il a produit, jamais remboursé (E11). Restent : le
  compte d'un appel coupé suppose qu'Anthropic cesse de générer quand le flux
  est fermé (UC-VIS-03, Limites, et ses sources) ; OVH borne un script à 165 s,
  sans réglage — sans doute du temps de calcul, où l'attente du réseau ne compte
  pas (documentation de PHP), ce que la recette mesurera avant qu'on relève le
  délai ; un script arrêté avant son issue laisse à l'appel sa réserve entière,
  payée par le compte ; et
  rien n'assure qu'OVH relaie le flux à mesure (sinon, tout arrive à la fin,
  sans progression) : à mesurer en recette (`docs/recette-twin9.md`).
- Opus 5.5, Fable et Mythos refusent la réflexion coupée qu'envoie la voie
  crédits (`thinking: disabled` ; Sonnet 5.5 reçoit `between_tools`) : les
  ajouter à l'offre ferait échouer leurs appels (400, réserve rendue). La
  grille par défaut ne les offre pas, et le relevé quotidien n'ajoute aucun
  modèle.
- Le garde-fou de solde (RG5) est une heuristique client ; seul le refus 402
  serveur (réserve pire-cas) est opposable. Son message arrondit le montant
  requis au centime supérieur et le solde au centime le plus proche, avec un
  point décimal : à moins d'un centime d'écart, les deux peuvent s'afficher
  égaux (UC-APP-09-U29).
