# INSTALL — monter sa propre instance de humanome.xyz

humanome.xyz est **clone déployable** (cahier §5) : ce dépôt contient tout le
nécessaire pour redémarrer une instance complète — référentiel, prompts,
schémas, moteur, API, front. Ce guide monte une instance de zéro.

## Prérequis

- **PHP 8.2**, la version d'OVH, avec `pdo_mysql`, `mbstring`, `curl`, `sodium`
  et `xml`, et **Composer 2**. Une version plus récente suffit pour développer :
  Composer fixe la plateforme à PHP 8.2 (`api/composer.json`), et la CI lance
  les tests sous 8.2.
- **MySQL 8** (utf8mb4).
- **Node 20+** (build du front, moteur, runner, outil de déploiement).
- Git.

Docker n'est plus nécessaire : `docker-compose.yml` reste pour qui préfère
PHP 8.2 et MySQL 8 en conteneurs.

## 1. Cloner et configurer

```bash
git clone <url-du-dépôt> humanome && cd humanome
cp api/.env.example api/.env          # puis renseigner DB_*, MIGRATE_TOKEN,
                                      # ANTHROPIC_API_KEY, SODIUM_MASTER_KEY…
                                      # (en développement : .env.dev, §2)
```

Générer les secrets : `openssl rand -hex 32` (MIGRATE_TOKEN, POW_SECRET) et
`openssl rand -hex 32` pour `SODIUM_MASTER_KEY` (64 caractères hex).

Le moteur Twin9 vit dans le dépôt privé `4nd4ny/Twin_v9` et ses runs tournent
sur le serveur (ADR-011). Qui y a accès le clone à côté de celui-ci, dans
`../Twin_v9` (ailleurs : variable `TWIN_V9_DIR`) ; la plateforme en charge
`php/src`. Sans lui, l'instance fonctionne, sans Twin9 côté serveur.

## 2. Environnement de développement (PHP et MySQL locaux)

PHP, MySQL 8 et Composer viennent des paquets du système (macOS : Homebrew).
Les comptes de développement reprennent ceux de `docker-compose.yml` ; les
tests créent leur propre base, `humanome_test`, avec le compte root
(`sudo mysql` sous Debian ou Ubuntu) :

```bash
mysql -uroot <<'SQL'
ALTER USER 'root'@'localhost' IDENTIFIED BY 'root_dev';
CREATE DATABASE humanome CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'humanome'@'localhost' IDENTIFIED BY 'humanome_dev';
GRANT ALL PRIVILEGES ON humanome.* TO 'humanome'@'localhost';
SQL
```

En développement, la configuration reprend les seules valeurs de
`docker-compose.yml` dans `.env.dev`, à la racine (ignoré par git), et non dans
`api/.env` : l'API et les scripts chargeraient `api/.env` par-dessus
l'environnement que les tests leur donnent.

```bash
cat > .env.dev <<EOF
APP_ENV=dev
DB_HOST=127.0.0.1
DB_NAME=humanome
DB_USER=humanome
DB_PASSWORD=humanome_dev
DB_ROOT_PASSWORD=root_dev
MIGRATE_TOKEN=dev_migrate_token
SODIUM_MASTER_KEY=$(openssl rand -hex 32)
DEMO_PROVIDER=mock
DEMO_PER_IP_PER_HOUR=500
EOF
```

`DB_ROOT_PASSWORD` ne sert qu'aux tests ; `DEMO_PROVIDER=mock` fait tourner la
démo sans clé API. On l'exporte dans chaque terminal de travail, depuis la
racine du dépôt :

```bash
set -a; . ./.env.dev; set +a
(cd api && composer install)
```

Générer les données dérivées (référentiel, documents de démo) ; le paquet de
prompts par défaut importe le moteur, d'où son `npm ci` :

```bash
(cd engine && npm ci)
node scripts/convert/carto-data-to-merge-json.mjs
node scripts/convert/extracted-to-day-json.mjs
node scripts/extract-referentiel.mjs                 # référentiel 7.0.0
node scripts/enrich-referentiel.mjs                  # 7.1.0 (définitions des compétences)
node scripts/build-default-prompt-package.mjs
```

## 3. Base de données

Depuis la racine du dépôt, l'environnement exporté (§2) :

```bash
php scripts/migrate.php                     # applique les migrations en attente
php scripts/import-referentiel.php
php scripts/import-referentiel.php web/public/data/referentiel/respire-v7.1.0.json
php scripts/seed-competences.php            # les fiches de RESPIRE, que lit Twin9 (T16)
php scripts/import-prompt-packages.php
php scripts/export-referentiel-static.php
```

L'export statique écrit dans `web/public/data/referentiel/` les versions
publiées (`respire-v7.0.0.json`, `respire-v7.1.0.json`) et `index.json`, que
lit la page `#/referentiel`.

Lancer l'API dans un terminal à part, l'environnement exporté :
`php -S localhost:8080 -t api/public`. Vérifier :
`curl http://localhost:8080/api/health` → `{"status":"ok","db":"ok"}`.

## 4. Front

```bash
cd web && npm install && npm run build   # bundle statique dans web/dist
npm run dev                              # ou : serveur de dev, proxy /api -> :8080
```

Le `prebuild` assemble le paquet Twin6 public : il faut au préalable déposer
ses trois gabarits (`0-mega-prompt.md`, `1-scan-pole.md`, `2-kairos-final.md`)
dans `web/public/data/twin6/prompts/`, car ils ne sont pas encore versionnés
(anomalie AN-2 de `docs/cas-utilisation/systeme/UC-SYS-04-construire-artefacts-derives.md`).

Ouvrir http://localhost:5173. Le bundle `web/dist` est aussi ouvrable en
`file://` (routing par hash, ADR-009) sauf les vues journée (fetch relatif).

## 5. Tests

```bash
cd api && composer test                      # API (PHPUnit, MySQL local)
cd engine && npm test                        # moteur
cd web && npm test                           # front (Vitest)
cd web && npm run test:e2e                   # Playwright (API locale, DEMO_PROVIDER=mock)
node scripts/validate-corpus.mjs             # schémas ↔ données réelles
cd ../Twin_v9/php && composer install && composer test   # moteur Twin9 (dépôt privé)
```

Les suites front et moteur lisent les données dérivées du §2 ; la suite front
lit aussi l'export statique du référentiel (§3) et le paquet Twin6 construit
par `npm run build` (§4). La suite PHP lit l'environnement exporté (§2) ; ses
tests du moteur Twin9 sautent sans `../Twin_v9`, comme ceux de la suite front
qui lisent une vraie carte de son oracle (adaptateur et importeur Twin9).

## 6. Déploiement (OVH mutualisé, sans SSH — ADR-008)

Le déploiement se fait par **releases + pointeur** via FTP (voir `docs/deploiement.md`).

```bash
cp .env.deploy.example .env.deploy            # FTP_HOST/USER/PASSWORD (+ MIGRATE_TOKEN)
# Front statique
cd web && npm run build && cd ..
node scripts/deploy/deploy.mjs static
# API (release + migrations + imports à distance + smoke)
./scripts/deploy/stage-api.sh
node scripts/deploy/deploy.mjs api
```

Rollback : `node scripts/deploy/deploy.mjs rollback` (repointe la release
précédente). Lister les releases distantes : `node scripts/deploy/deploy.mjs releases`.

## 7. Rôles et administration

Le premier compte administrateur s'attribue via l'outillage de déploiement
(jeton `MIGRATE_TOKEN`), puis l'UI `#/admin` prend le relais :

```bash
curl -X POST https://<votre-domaine>/api/admin/grant-role \
  -H "X-Migrate-Token: $MIGRATE_TOKEN" -H "Content-Type: application/json" \
  -d '{"email":"vous@exemple.org","role":"admin"}'
```

## Hors OVH mutualisé

Sur un hébergement avec cron et SSH, on peut planifier `scripts/worker.php`
(cartographie de masse, ticks courts) et `scripts/maintenance.php` (purge des
liens expirés). Sur l'offre OVH gratuite (sans cron), déclencher plutôt les
endpoints `POST /api/admin/worker-tick` et `POST /api/admin/maintenance` depuis
un planificateur externe. Détails : `docs/plan-masse.md`, `docs/deploiement.md`.
