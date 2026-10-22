# Déploiement (OVH mutualisé, sans SSH)

Modèle : **releases + pointeur** sur un hébergement FTP sans SSH ni processus
longs (ADR-008). Le front est un bundle statique ; l'API est une release PHP
pointée par `~/app/current.txt`.

## Topologie serveur

```
~/app/shared/.env          secrets (hors webroot, 403 en HTTP)
~/app/releases/<ts>/        code PHP par release (N=3 conservées)
~/app/releases/<ts>/Twin_v9/  moteur Twin9 privé de la release : php/src + COMMIT (T18)
~/app/current.txt          chemin de la release active
~/www/                      webroot : bundle Vite + data/ + api/index.php + .htaccess
```

`~/www/api/index.php` (front-controller) lit `current.txt` et délègue à la
release pointée.

## Prérequis

`cp .env.deploy.example .env.deploy` puis renseigner `FTP_HOST`, `FTP_USER`,
`FTP_PASSWORD`, `FTP_SECURE=false` (le cluster OVH ne supporte pas AUTH TLS,
vérifié), et `MIGRATE_TOKEN` (identique à celui de `~/app/shared/.env`).

Le moteur Twin9 (T18) : `Twin_v9` cloné à côté du dépôt (`../Twin_v9`), sinon
`TWIN_V9_DIR` ; à jour, sans changement non commité dans `php/src` ni dans
`php/protocole`. La release en embarque le moteur, et l'import ses gabarits, du
même commit. Sur le serveur, `~/app/shared/.env` n'a pas besoin de
`TWIN_V9_DIR` : défini, il y remplacerait le moteur de la release.

## Déployer

```bash
# Front statique (sync par manifeste SHA-256, delta seul)
cd web && npm run build && cd ..
node scripts/deploy/deploy.mjs static

# API : release (moteur Twin9 compris) + www/api + current.txt (écrit en
# dernier) + migrations à distance + imports référentiel/compétences/paquets
# + smoke health (moteur Twin9 chargé, zlib)
./scripts/deploy/stage-api.sh
node scripts/deploy/deploy.mjs api

# Twin9 : ses gabarits, du commit qu'embarque la release
node scripts/twin9/import-protocole.mjs
```

`stage-api.sh` finit par un contrôle : **pas de Python en production**. Un
`.py` ou un `.pyc` dans la release — sources, moteur Twin9, paquets Composer
compris — fait échouer la préparation (code 1) : il nomme les fichiers et
supprime `build/api-release`, que `deploy.mjs api` refuse alors de déployer
(« run scripts/deploy/stage-api.sh first »). La v9.8 Python reste dans
`Twin_v9`, hors production (UC-SYS-02, E13).

Le pointeur `current.txt` est écrit **après** l'upload complet de la release :
un déploiement interrompu ne bascule jamais sur une release partielle. Les
migrations sont **forward-only** (expand/contract) — jamais de destruction dans
la même release que le code qui l'utilise.

Elles suivent le pointeur **aussitôt**, avant l'élagage des anciennes releases
(une seconde session FTP, qui prend des minutes) : elles ne peuvent pas le
précéder, la route `migrate` étant celle de la release en ligne, qui applique
ses propres fichiers. Entre les deux reste une **fenêtre** d'une requête, où la
nouvelle release tourne sur l'ancien schéma : le mode expand protège l'ancienne
release du nouveau schéma (un retour arrière), pas l'inverse. Un tick ou une
page qui y lit une colonne à venir échoue, et se rétablit au suivant ; depuis la
migration 031 (Twin9, P0-1) : le comptage des passes d'un run, sa fin, le suivi
de sa page, son lancement. Une migration en échec arrête le déploiement avant
l'élagage : les releases précédentes restent, pour un retour arrière.

### Le moteur Twin9 dans la release (T18)

`stage-api.sh` appelle `scripts/deploy/stage-twin9.mjs` : il copie le `php/src`
du commit de `Twin_v9` — celui que donne git, pas la copie de travail : aucun
fichier ignoré ne part — dans `build/api-release/Twin_v9/php/src`, et ce commit
dans `build/api-release/Twin_v9/COMMIT`. Il refuse, sans rien copier : un moteur
ou des gabarits absents ; un dossier qui n'est pas la racine de son dépôt git
(le faux moteur de la plateforme, `api/tests/fixtures/twin9-factice`, est DANS
le dépôt humanome, dont git donnerait le commit) ; un changement non commité,
fichiers non suivis compris, dans `php/src` ou `php/protocole` : le commit doit
décrire le moteur embarqué comme les gabarits importés ensuite. Seules les
sources partent (41 fichiers, 345 Ko) : ni les
tests du moteur, ni ses dépendances de développement, ni les gabarits, que
l'import met en base (ADR-010). Sur le serveur, la release les garde hors du
webroot, et `EngineLoader` les y trouve. Le FTP du cluster n'étant pas chiffré,
le moteur fermé y transite en clair (`docs/hebergement.md`).

`deploy.mjs api` finit par la santé : quand la release embarque le moteur,
`GET /api/health` doit dire `"twin9":{"moteur":true,"zlib":true}`. Sinon il
échoue — mais la release est **en ligne**, le pointeur basculé, les migrations
et les imports faits : seul Twin9 est éteint. Ses causes réalistes, qu'il nomme,
survivent à un retour arrière, qui ne ramène que le code d'avant : une ligne
`TWIN_V9_DIR` dans `~/app/shared/.env` (elle passerait devant le moteur
embarqué : elle ne doit pas y être), ou l'extension zlib absente du PHP du
serveur. Le moteur chargé, il affiche le commit qu'embarque la release — c'est
celui qui tourne tant que `TWIN_V9_DIR` est absent, ce que l'attestation d'un
run montre ensuite (recette, 4.6) — et la suite :

**Les gabarits, en version figée.** `import-protocole.mjs` envoie le jeu
« v9.8 » à variables (`php/protocole`) au serveur, avec le `MIGRATE_TOKEN` de
`.env.deploy` et le même `TWIN_V9_DIR`. Il refuse, sans rien envoyer, un
`TWIN_V9_DIR` qui n'est pas la racine d'un dépôt git, un changement non commité
(non suivis compris) dans `php/protocole` ou `protocole/tagger`, et une release
préparée (`build/api-release/Twin_v9/COMMIT`) d'un autre commit que le sien :
les gabarits sont ceux du moteur de la release. Il affiche ce commit. Lancé deux
fois, il prouve que la base les tient : la seconde réponse vaut `{"imported": N,
"inchanges": N, "retires": 0}`, chaque gabarit déjà en base à l'octet. RESPIRE et ses fiches
viennent de `deploy.mjs api` lui-même (`import-referentiel`,
`seed-competences`), et les migrations des tables Twin9 aussi.

## Rollback

```bash
node scripts/deploy/deploy.mjs releases   # lister les releases distantes
node scripts/deploy/deploy.mjs rollback   # repointe current.txt sur la précédente
```

Le rollback est **code-seul** (les migrations forward-only restent compatibles).
Les assets front hashés des releases précédentes restent présents jusqu'à leur
purge (N=3), donc un `index.html` antérieur reste servable ; pour revenir aussi
le front, redéployer le `static` de la version cible.

## Invalidation de cache

Le versioning par répertoire de release neutralise l'OPcache (chemins neufs).
Côté navigateur, `.htaccess` marque les assets hashés `immutable` (1 an) et
`index.html` `no-cache`. Ne pas activer le CDN OVH en v1.

## Tâches planifiées

L'offre OVH **gratuite** n'inclut pas de cron (vérifié dans le panel :
« Ce service n'est pas accessible pour l'offre Hébergement gratuit 100M »).
Aucun cron n'est requis pour la **correction** : les compteurs de démo sont
indexés par jour UTC (rollover automatique) et l'expiration des liens est
appliquée à la lecture. Pour les runs Twin9 et la cartographie de masse,
déclencher le tick depuis un planificateur externe (« Le déclencheur des runs »,
ci-dessous) ; la maintenance, une fois par jour, avec le même jeton depuis le
2026-10-22 (ou à la main, avec celui des migrations) :

```bash
curl -X POST https://humanome.xyz/api/admin/worker-tick  -H "X-Worker-Tick-Token: $WORKER_TICK_TOKEN"
curl -X POST https://humanome.xyz/api/admin/maintenance   -H "X-Worker-Tick-Token: $WORKER_TICK_TOKEN"
```

Le jeton du tick (`WORKER_TICK_TOKEN`, ADR-011) n'ouvre que cette route et,
depuis le 2026-10-22, la maintenance (UC-SYS-03 A4), qui ne fait que purger ce
qui a expiré : le planificateur ne tient pas celui des migrations, qui donne
aussi les rôles et l'import des gabarits. Un tick avance d'abord au plus N runs Twin9, puis la
masse, dans une tranche de 45 s au plus ; N et la durée de la tranche se
règlent dans la configuration Twin9 (`runs_par_tick`, `secondes_par_tranche`).
Un déclencheur qui raccroche n'interrompt pas la tranche.

Un run par lots n'avance qu'aux ticks : une tranche soumet un lot, une suivante
le relève (`docs/contrats.md` §8.3). Un run de dix journées compte quelque
150 vagues d'appels, donc autant de lots l'un après l'autre : plus le
déclencheur est fréquent, plus le run est court. Un run dont les lots sont
encore chez Anthropic ne compte pas parmi les N runs du tick.

La page d'un run fait aussi avancer les runs de son propriétaire tant
qu'elle est ouverte (T9) : une tranche de la même durée, sous le même verrou
que le tick, qui finit plus tôt quand ses runs n'attendent plus rien, par une
route de session qui ne connaît pas le jeton du tick.

L'attestation d'un run garde le commit du moteur : la tête du dépôt
`TWIN_V9_DIR`, ou, sur un hébergement sans git, la première ligne d'un fichier
`COMMIT` posé à la racine de la copie de `Twin_v9`.

Sur une offre avec cron (perso/pro), planifier plutôt `php scripts/worker.php`
et `php scripts/maintenance.php` — le premier relève aussi les prix d'Anthropic
une fois par jour (2026-10-22). Ni l'un ni l'autre n'est dans la release :
`stage-api.sh` ne les embarque pas, il faudrait les y ajouter.

### Le déclencheur des runs (T18)

Un service gratuit de tâches planifiées appelle le tick toutes les minutes. Nous
retenons [cron-job.org](https://cron-job.org/) : gratuit, à la minute, en
`POST` avec en-têtes et corps, il garde l'historique de ses exécutions. Trois
de ses règles, relevées dans sa FAQ le 2026-10-21, décident des réglages :

- il raccroche au bout de **30 secondes** ;
- il désactive une tâche qui échoue **plus de 25 fois de suite** ;
- il lit au plus 64 Ko d'une réponse, et garde les réponses deux jours.

Une tranche dure 40 s par défaut (`secondes_par_tranche`) : le corps
`{"budgetSeconds": 25}` la ramène à 25 s, pour que le tick réponde avant que le
service raccroche — sans quoi chaque appel compterait comme un échec. Un run
**tout** par lots n'y perd rien : une tranche soumet ou relève ses lots en
quelques secondes. **Un run en appels directs, lui, ne tient pas navigateur
fermé** : un appel plus long que la tranche (≈ 24 s) est coupé ; compté dès
qu'il en a duré la moitié, il tombe en panne à sa troisième coupe (« délai
dépassé : l'appel ne tient pas dans une tranche », `Twin9Slice::couper`), et sa
journée manque à la carte — chaque appel coupé ayant pu être facturé par le
fournisseur. Un run qui doit avancer seul passe donc par lots, la voie du profil
v9.8 par défaut ; en appels directs, il lui faut sa page ouverte, qui donne des
tranches de 40 s.

**Un profil mixte** (ADR-012 : des étapes chez un autre fournisseur
qu'Anthropic) garde `voie = lots` pour ses appels d'Anthropic, mais ses appels
aux autres fournisseurs partent en direct, à chaque tranche. La route garde la
durée que demande le déclencheur (réglage `twin9_tranche_declencheur`), et le
lancement se mesure sur la tranche la plus courte servie : sous 25 s, un appel
tiers ne part que si la durée maximale de son modèle (`duree_max_s` de la
grille) tient dans les **21 s** qu'une telle tranche laisse à son départ (35 s
pour 40 s) ; un modèle plus long est refusé au lancement. Un run lancé avant
que le déclencheur ne raccourcisse ses tranches attend, pour ce modèle seul,
une tranche plus longue (sa page ouverte), puis s'arrête au bout de
30 minutes, sa réserve rendue (2026-10-22). La page d'administration dit la
tranche du déclencheur et ce qu'elle laisse.

Le tick relève aussi les prix d'Anthropic, une fois par jour UTC, après sa
tranche (UC-ADM-05 A6, 2026-10-21 ; par la route comme par `php scripts/worker.php`
depuis le 2026-10-22) — là où `ANTHROPIC_API_KEY` est posée : sa
réponse porte alors `"tarifs": "ok"` ou `"echec"`, et `#/admin/twin9` affiche le
relevé. La page se lit d'ordinaire en moins d'une seconde, en 10 s au plus : le
tick du relevé peut, une fois par jour, dépasser les 30 s du service, qui
compte alors un échec isolé ; le relevé, lui, se termine (`ignore_user_abort`).
Sans déclencheur, aucun relevé : la grille garde ses prix, à corriger à la main.

Des runs de **masse** en file allongent le tick : un appel de masse peut partir
jusqu'à la fin du budget, avec un délai de fournisseur de budget + 8 s
(`Tick::defaultProviderFactory`) ; le tick peut alors durer près d'une minute,
et le service compte un échec. Aucune masse ne tourne en production aujourd'hui :
résidu noté (STATUS, dettes techniques).

**Gestes du mainteneur** (le jeton ne passe ni par le dépôt ni par un assistant) :

1. **Le jeton.** Sur son poste : `openssl rand -hex 32`. Ajouter la ligne
   `WORKER_TICK_TOKEN=<valeur>` à `~/app/shared/.env`, par le client FTP. Ce
   jeton n'ouvre que le tick et la maintenance : ne jamais confier au service
   celui des migrations, qui ouvre aussi les rôles et les imports.
2. **La tâche**, sur cron-job.org (compte gratuit), « Create cronjob » :
   - URL : `https://humanome.xyz/api/admin/worker-tick` ;
   - planification : toutes les minutes ;
   - réglages avancés : méthode `POST` ; en-têtes `X-Worker-Tick-Token: <valeur>`
     et `Content-Type: application/json` ; corps `{"budgetSeconds": 25}` ;
   - notifications : sur échec, et quand la tâche est désactivée.
3. **La vérification**, dans l'historique de la tâche :
   - `200` et des compteurs : une clé `twin9Runs` dit le moteur chargé (sans
     elle, Twin9 est éteint sur le serveur), une clé `tarifs` le relevé du jour
     (au premier tick de la journée UTC) — sauf `{"locked": true}` : un autre
     tick tenait le verrou (la page d'un run ouverte), rien d'anormal de temps en
     temps ;
   - `403` : le jeton diffère de celui du `.env`, ou `WORKER_TICK_TOKEN` manque
     au `.env` (la route n'accepte alors que le jeton des migrations) ;
   - `404` : le serveur n'a ni jeton du tick ni jeton des migrations — jamais en
     production, où `MIGRATE_TOKEN` est réglé.

Toutes les minutes : un tick sans travail ne coûte que quelques millisecondes,
et un run par lots avance d'autant plus vite. La réponse ne porte que des
compteurs, jamais de contenu. La maintenance n'y passe pas : une tâche à part
l'appelle une fois par jour, avec le même jeton (`POST /api/admin/maintenance`,
en-tête `X-Worker-Tick-Token`).

### Depuis un autre hébergement OVH (deux tâches planifiées, 2026-10-22)

Un hébergement OVH payant (Perso, Pro) a des tâches planifiées, que l'offre
gratuite d'humanome.xyz n'a pas. Elles ne lancent qu'un fichier de **leur**
hébergement — `scripts/worker.php` ne peut pas y tourner, il lui faut le code,
le `.env`, la base et le moteur d'humanome.xyz — et ont trois règles
([documentation d'OVH](https://docs.ovhcloud.com/fr/guides/web-cloud/web-hosting/cron-tasks),
relevée le 2026-10-22) : une tâche part **au plus une fois par heure** ; elle
s'arrête au bout de **60 minutes** ; elle est désactivée après **10 échecs**.
Deux relais, dans `scripts/deploy/cron-ovh/`, appellent donc les routes
d'humanome.xyz, comme cron-job.org le ferait :

- `humanome-tick.php`, **chaque heure** : appelle le tick chaque minute pendant
  55 minutes, puis s'arrête avant la limite d'OVH ; la tâche suivante prend le
  relais (une pause de 5 minutes par heure). Il n'envoie pas de
  `budgetSeconds` : sans service qui raccroche à 30 s, la tranche garde sa
  durée réglée (40 s par défaut), qui tient mieux les runs en appels directs.
  Il sort en 1 si le jeton manque ou est refusé (une tâche à désactiver), en 0
  sur une panne passagère (un serveur lent, une coupure). Deux relais qui se
  chevauchent ne se gênent pas : le serveur tient un verrou.
- `humanome-maintenance.php`, **une fois par jour** : appelle la maintenance une
  fois, et sort en 0 sur sa réponse `200`, en 1 sinon.

Installation, sur l'autre hébergement : un dossier `cron/` hors de `www/`, avec
les deux relais et `humanome-tick.jeton`, qui contient la valeur de
`WORKER_TICK_TOKEN` seule sur sa ligne (droits `600`) ; si le panel exige un
chemin sous `www/`, un `.htaccess` `Require all denied` dans le dossier. Dans le
panel, « Tâches planifiées – Cron » : `cron/humanome-tick.php`, PHP 8, chaque
heure ; `cron/humanome-maintenance.php`, PHP 8, chaque jour. Vérification dans
les journaux « CRON » : une ligne `bilan : … ticks` par heure, une ligne
`maintenance : {…}` par jour. Ces tâches remplacent cron-job.org ; garder les
deux ne gêne pas.

## Santé

- `GET /api/health` → `{status, version, db, twin9: {moteur, zlib}}` (smoke de
  déploiement ; `twin9` depuis T18 : le moteur chargé, l'extension zlib présente).
- `GET /api/status` → + état démo et worker (page de santé, cacheable 30 s).
