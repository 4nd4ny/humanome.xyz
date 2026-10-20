# humanome.xyz

## Résumé du projet

humanome.xyz (human + genome) est la plateforme de cartographie de compétences humaines
de l'écosystème scolaire RESPIRE (Harmonia Éducation). Des apprenants construisent une
cartographie de leurs compétences à partir de leur portfolio réflexif, analysé par des
prompts LLM versionnés (promptologues), relu et garanti par des humains (cartographes),
sur la base d'un référentiel de 61 compétences en 7 pôles, édité collectivement
(épistémiarques). La visualisation centrale est un sunburst évolutif dans le temps
(vue merge chronologique + vue journée). Les cartographies validées peuvent être
partagées avec des employeurs (lien vers une version choisie par la personne, mot de passe
facultatif, jamais automatique). Le tout est RGPD-by-design :
le portfolio ne quitte jamais le navigateur par défaut, tout stockage serveur est opt-in.
Spécification complète : `docs/cahier-des-charges.md` ; plan de construction : `docs/plan-prompts.md`.

## Stack (ADR-002)

- **Backend** : PHP 8.2 + Slim 4 + PDO + MySQL 8 (utf8mb4). Pas d'ORM, pas de framework lourd.
- **Frontend** : Vite + React 18. Routing par hash (ADR-009). DOMPurify pour le HTML narratif (ADR-007).
- **Moteur** : `engine/` — package ESM sans dépendance DOM, s'exécute dans le navigateur (ADR-001).
- **Twin9** : moteur PHP du dépôt privé `4nd4ny/Twin_v9` (`php/src`), que la plateforme charge s'il est
  là ; ses runs tournent sur le serveur, par tranches (ADR-011).
- **Tests** : PHPUnit (PHP et MySQL 8 locaux, CI sous PHP 8.2), Vitest, Playwright (e2e, local uniquement).

## Contraintes d'hébergement (OVH mutualisé — docs/hebergement.md)

- Pas de Node serveur : build front en local, artefacts statiques déployés (ADR-003).
- Pas de processus longs : les runs LLM tournent côté client (ADR-001), sauf ceux de Twin9, exécutés
  sur le serveur par tranches de 45 s au plus (ADR-011) ; la masse passe par une file de jobs MySQL
  à ticks courts < 50 s (ADR-005), déclenchés de l'extérieur faute de cron.
- Pas de SSH : déploiement FTP par releases + pointeur `current.txt` + endpoint migrate (ADR-008).
- Secrets dans `~/app/shared/.env` (hors webroot), jamais dans le dépôt ni dans `www/`.
- Pas de Docker en développement : PHP et MySQL 8 locaux. PHP local (8.5 sur le Mac) ≠ cible 8.2 :
  Composer fixe la plateforme à 8.2 (`api/composer.json`) et la CI lance les tests sous 8.2, la
  version d'OVH. Les fichiers `docker-compose` restent pour qui s'en sert.

## Principes RGPD non négociables (cahier §6)

1. Aucune donnée de portfolio stockée côté serveur par défaut ; export local systématique.
2. Stockage serveur = opt-in explicite de l'apprenant, chiffré quand il s'agit de clés API (ADR-004).
3. Export/suppression de compte en un clic, purge réelle + événement d'audit.
4. Partage employeur = décision explicite individuelle (lien vers une version choisie par la personne,
   mot de passe facultatif), jamais automatique.
5. Journalisation minimale : compteurs, jamais de contenu.

## Conventions

- Documentation et UI en **français** ; code, commits et identifiants en **anglais**.
- Un commit par lot cohérent ; tests verts avant commit ; `STATUS.md` mis à jour en fin de session.
- `assets-existants/` est en **lecture seule absolue** (données réelles + prototypes de référence).
- Le moteur Twin9 (moteur PHP, gabarits, oracle, specs, plan) vit dans le dépôt **privé**
  `4nd4ny/Twin_v9`, cloné à côté (`../Twin_v9`) : rien de ce moteur n'entre ici. La plateforme en
  charge `php/src` depuis `TWIN_V9_DIR` (par défaut `../Twin_v9`) ; sans lui, Twin9 côté serveur
  reste désactivé et ses tests sautent (ADR-011). Le front garde l'adaptateur d'affichage d'une
  carte Twin9 et le parseur des fiches de pôle (`web/src/lib/twin9/`) ; `check-publiable` refuse
  les chemins de l'ancien moteur du navigateur, retiré par T11.
- Les schémas JSON (`schemas/`) sont le contrat entre modules : toute friction de format
  se documente dans `docs/contrats.md`, on ne renomme pas un champ pour contourner.
- Répertoires de build (`node_modules/`, `vendor/`, `dist/`) exclus de Dropbox, où vit le dépôt
  (client File Provider) : `xattr -w 'com.apple.fileprovider.ignore#P' 1 <dir>` — l'ancien
  `com.dropbox.ignored` n'y suffit plus —, à refaire s'ils sont recréés. `npm ci` se lance sur le
  Mac, jamais dans la VM Linux (binaires natifs).
- Sauvegarde hebdomadaire tant que GitHub est reporté : `git bundle create ../humanome-backup.bundle --all`.

## Commandes

- Environnement : `set -a; . ./.env.dev; set +a` dans chaque terminal (`.env.dev` à la racine,
  INSTALL.md §2 ; pas d'`api/.env` en développement, que l'API et les scripts chargeraient
  par-dessus l'environnement des tests) ; scripts PHP depuis la racine (`php scripts/migrate.php`).
- API : `php -S localhost:8080 -t api/public` puis http://localhost:8080/api/health ;
  tests : `cd api && composer test` (MySQL local, base `humanome_test` créée en root).
- Composer : `cd api && composer <cmd>` (plateforme fixée à PHP 8.2).
- Moteur Twin9 PHP : `cd ../Twin_v9/php && composer install && composer test`.
- Front : `cd web && npm run dev` (proxy /api → :8080) ; `npm test` ; `npm run build`.
- Moteur : `cd engine && npm test`.
- Déploiement : `node scripts/deploy/deploy.mjs` (credentials dans `.env.deploy`, gitignoré).
