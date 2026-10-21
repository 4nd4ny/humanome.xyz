# Hébergement — OVH mutualisé (état vérifié le 2026-07-12)

## Réponses aux questions du plan-prompts (Q4)

| Question | Réponse vérifiée |
|---|---|
| Version PHP | **8.2** (`.ovhconfig` : `app.engine.version=8.2`, `container.image=stable64`) — conforme à la cible ADR-002 |
| Version MySQL | **8.0.46** (vérifié le 2026-07-12 par sonde PDO exécutée sur le cluster humanome.xyz). Base OVH mutualisée existante, hébergée sur un autre hébergement OVH (`example123.mysql.db`), **joignable depuis humanome.xyz**, charset serveur utf8mb4 — conforme ADR-002. PHP webroot vérifié : 8.2.29. Credentials hors repo (`cahier des charges/mysql.txt` côté poste de travail → `.env` local et `~/app/shared/.env` serveur) |
| Accès cron | **NON disponible** sur cette offre (vérifié dans le panel OVH le 2026-07-12 : « Ce service n'est pas accessible pour l'offre Hébergement gratuit 100M »). humanome.xyz est sur une offre **Hébergement gratuit 100 Mo** (hosting-free-100m). Conséquence : le tick (runs Twin9 et masse) se déclenche depuis un service externe de tâches planifiées (`POST /api/admin/worker-tick`, jeton du tick, T18), et la maintenance (P12) une fois par jour avec le même jeton depuis le 2026-10-22 (`POST /api/admin/maintenance`), ou à la main avec celui des migrations, qu'aucun service tiers ne doit tenir — aucun cron requis pour la correction (compteurs démo par jour UTC, expiration des liens appliquée à la lecture). Voir docs/deploiement.md § Tâches planifiées |
| Accès SSH/SFTP | **FTP uniquement** testé et fonctionnel (`ftp.clusterNNN.hosting.ovh.net`). SSH non fourni dans les accès. **FTPS non supporté par ce cluster** (AUTH TLS/SSL → « 500 This security scheme is not implemented », vérifié le 2026-07-12) → transferts en FTP simple, `FTP_SECURE=false` dans `.env.deploy` |
| Domaine pointé | **Oui** : humanome.xyz → 51.91.236.255 (clusterNNN), Apache répond, webroot `www/` vide |

## Topologie serveur (ADR-008)

```
~/                      # home FTP, HORS webroot
  .ovhconfig            # config PHP OVH — ne pas écraser sans raison
  app/
    shared/.env         # secrets : MySQL, clé Anthropic, MIGRATE_TOKEN, WORKER_TICK_TOKEN, clé libsodium
    releases/<ts>/      # code PHP par release (N conservées)
    current.txt         # chemin de la release active (pas de symlink en FTP)
  www/                  # webroot public
    index.html, assets/ # build Vite (noms hashés)
    data/               # JSON statiques (démo, référentiel publié)
    api/index.php       # front-controller : lit ../app/current.txt puis require la release
    .htaccess           # cache + en-têtes sécurité
```

## Twin9 sur cet hébergement (T18, 2026-10-21)

### Place

La release embarque le moteur Twin9 privé, hors du webroot :
`app/releases/<ts>/Twin_v9/php/src/` et `app/releases/<ts>/Twin_v9/COMMIT`
(`scripts/deploy/stage-twin9.mjs`, appelé par `stage-api.sh`). `EngineLoader`
l'y trouve sans `TWIN_V9_DIR`. Du dossier `php/` de `TWIN_V9_DIR`, seules les
sources partent : ni les tests du moteur (5 Mo), ni ses dépendances de
développement, ni les gabarits, que l'import met en base (ADR-010).

| Poids (préparation locale du 2026-10-21) | Valeur |
|---|---|
| Moteur : `php/src` et `COMMIT` (mesuré) | 42 fichiers, 345 Ko |
| Release de l'API, moteur compris (mesurée à l'envoi, 2026-10-21) | 4,9 Mo, 803 fichiers |
| Trois releases gardées (`deploy.mjs`) | ≈ 15 Mo au plus |
| Occupé (panel, 2026-10-16) | 56 Mo sur 100 |
| Occupé avant le déploiement du 2026-10-21 (panel, relevé par Christian) | 79 Mo sur 100 |

**Mesurée le 2026-10-21**, la release déployée pesait 4,9 Mo pour 803 fichiers :
Composer installant ici depuis les sources (le proxy de notre environnement
refuse les archives de GitHub, 403), chaque dépendance a été refaite par
`git archive` de son commit verrouillé — ce que GitHub sert comme archive —, puis
`composer dump-autoload --no-dev --optimize` (2 026 fichiers et 29 Mo sans
cela). Avant, le poids était **déduit** : dans notre
environnement, Composer avait installé les dépendances depuis leurs sources, et
la préparation pesait 22 Mo et 2 017 fichiers ; sans les dossiers `.git` des
dépendances, 6,9 Mo et 1 335 fichiers ; sans leurs tests non plus, ≈ 4,9 Mo et
≈ 850 fichiers. Or `deploy.mjs` envoie tout, `.git` compris (il ne saute que
`.DS_Store`) : préparée ainsi, une release ferait 22 Mo, et trois dépasseraient
les 44 Mo libres. Sur un poste où Composer prend les archives des versions
publiées — son défaut —, la release reste sous 7 Mo ; la recette relève
`du -sh build/api-release` (2.2) avant d'envoyer quoi que ce soit. La place
restante se lit dans le panel OVH, après le déploiement.

**Le FTP de ce cluster n'est pas chiffré** (AUTH TLS refusé, 2026-07-12) : le
moteur fermé y transite en clair, comme le reste de la release et les
identifiants FTP.

### Base

| Mesure | Valeur |
|---|---|
| Quota de la base (panel OVH) | à relever par Christian |
| Run de test réel, une fois fini : PLANT-01, une journée, un pôle, sept appels (réponses du vrai run de T2, rejouées en local par `PariteTest`) | 86 Ko de données : réglages 42 Ko (le profil et les réglages du moteur, référentiel et fiches compris : 125 Ko avant compression), gabarits 22 Ko, portfolio 3 Ko, résultats 15 Ko, mémoire de la carte 3 Ko |

Pendant le run, le journal des appels y ajoute leurs réponses, compressées ;
un run fini n'en garde que les compteurs. Un run complet garde les mêmes
réglages et gabarits, mais ses résultats, sa mémoire et son journal croissent
avec les journées et les pôles : le poids d'un vrai run complet se lit dans le
panel, l'espace de la base relevé avant et après le run de la recette
(`docs/recette-twin9.md`). Les sauvegardes automatiques d'OVH et
`backup-db.mjs` couvrent ces tables.

### zlib

Les runs Twin9 compressent leur état (`gzcompress`, `RunRepository`).
`GET /api/health` dit si le moteur est chargé et si l'extension est là
(`"twin9":{"moteur":…,"zlib":…}`) ; `deploy.mjs api` échoue si la release
embarque le moteur et que l'un des deux manque : c'est la vérification de zlib
sur OVH.

## Accès

- Credentials FTP : fournis hors repo (`cahier des charges/ftp-humanome.xyz.txt` côté
  poste de travail ; repris dans `.env.deploy` local gitignoré).
- Panel OVH (création MySQL, cron) : session navigateur de l'utilisateur (plugin Chrome).

## Déploiement

`node scripts/deploy/deploy.mjs` — sync par manifeste SHA-256 (delta seul), puis
`POST /api/admin/migrate` (token) et smoke `GET /api/health`. Rollback : réécrire
`~/app/current.txt` vers la release précédente. Détails : ADR-008.
