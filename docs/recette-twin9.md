# Recette de Twin9 sur humanome.xyz (T18)

Ce que Christian et Claude déroulent ensemble sur le site, une fois Twin9
déployé (lot 5 du plan du moteur PHP, dans `Twin_v9`). Chaque ligne dit le
geste, ce qu'on attend et ce qu'on a relevé. Un écart bloquant arrête la
recette ; un écart mineur se note et la recette continue.

**Qui fait quoi.** Christian fait les gestes du panel OVH, du service de tâches
planifiées et du `.env` du serveur, et donne son feu vert à chaque
déploiement. Claude prépare, lance ce qui ne demande ni secret ni panel, et
relève.

**Twin9 s'ouvre dès le déploiement de l'API (2.3).** L'entrée « Analyse
approfondie » du menu ne dépend que du moteur chargé, sans interrupteur depuis
T11 : tout compte crédité peut lancer un run dès lors. La recette suit donc le
déploiement sans attendre.

## 1. Avant le déploiement

| # | Geste | Attendu | Relevé |
|---|---|---|---|
| 1.1 | Christian relève dans le panel l'espace occupé de l'hébergement et celui de la base | Deux nombres, notés dans `docs/hebergement.md` (place restante, quota de la base) | |
| 1.2 | Christian ajoute `WORKER_TICK_TOKEN` à `~/app/shared/.env` (`docs/deploiement.md`, « Le déclencheur des runs ») ; il y vérifie `ANTHROPIC_API_KEY`, que lisent les runs à la clé de l'instance, et l'absence de `TWIN_V9_DIR`, qui passerait devant le moteur embarqué | Les deux clés là, `TWIN_V9_DIR` absent ; ni ce jeton ni `TWIN_V9_DIR` dans le dépôt | |
| 1.3 | `Twin_v9` à jour, à la racine de son clone, propre dans `php/src`, `php/protocole` et `protocole/tagger` | `git status --untracked-files=all` vide pour ces dossiers (`stage-twin9.mjs` et l'import le refusent sinon) | |
| 1.4 | Feu vert de Christian | — | |

## 2. Déploiement

| # | Geste | Attendu | Relevé |
|---|---|---|---|
| 2.1 | `cd web && npm run build`, puis `node scripts/deploy/deploy.mjs static` | Fin « deploy done » | |
| 2.2 | `./scripts/deploy/stage-api.sh`, puis `du -sh build/api-release` | « Twin9 engine <commit> staged … (41 files, 345 KB) » ; moins de 7 Mo — au-delà, Composer a installé des dépendances depuis leurs sources, et leurs dossiers `.git` partiraient (`docs/hebergement.md`, « Place ») | |
| 2.3 | `node scripts/deploy/deploy.mjs api` | Migrations 024 à 030 appliquées ; RESPIRE, compétences et paquets importés ; « Twin9 engine loaded, zlib present; the release embeds Twin_v9 <commit> » ; « api deploy done ». Un échec laisse la release en ligne, Twin9 éteint : vérifier `~/app/shared/.env` et zlib, comme il le dit | |
| 2.4 | `node scripts/twin9/import-protocole.mjs`, deux fois | « Twin_v9 commit: <commit> », celui de 2.2 ; la seconde réponse : `{"imported": N, "inchanges": N, "retires": 0}` | |
| 2.5 | `GET https://humanome.xyz/api/health` | `"twin9":{"moteur":true,"zlib":true}` et la version du déploiement | |

**Les gabarits rendus en production égalent ceux de la v9.8** quand trois
choses tiennent : le moteur est celui du commit (2.2, 2.3, et l'attestation du
run en 4.6) ; la base tient les gabarits de ce commit à l'octet (2.4 — l'import
refuse tout autre commit que celui de la release) ; elle tient les fiches de
RESPIRE de la v9.8 (le seed de 2.3 ; avec le vrai moteur,
`ReferentielMoteurTest::testTheRealEngineReadsRespiresBlockAsTheV98sPoleFiles`
lit le bloc de RESPIRE tiré de la base comme la v9.8 lit ses fichiers de pôle).
Sur ces mêmes entrées, `PariteTest` fait passer les scénarios de l'oracle par la
plateforme et exige de chaque appel l'empreinte SHA-256 du prompt de la v9.8 :
relancer ces deux tests avec `TWIN_V9_DIR` au commit déployé clôt la preuve.
`PariteTest` fige RESPIRE 7.0.0, quand un run de production fige la dernière
version publiée — 7.1.0 après 2.3 : leurs prompts sont les mêmes aujourd'hui
(même structure ; le moteur nomme RESPIRE quel que soit le libellé), et 4.6
relève la version que le run a figée.

## 3. Le déclencheur

| # | Geste | Attendu | Relevé |
|---|---|---|---|
| 3.1 | Christian crée la tâche cron-job.org (`docs/deploiement.md`) | Historique : `200`, des compteurs avec `twin9Runs` | |
| 3.2 | Laisser tourner dix minutes | Aucun échec ni délai dépassé dans l'historique | |

## 4. Le parcours

Sur un compte d'essai, créé pour la recette et supprimé à la fin (4.8).

| # | Geste | Attendu | Relevé |
|---|---|---|---|
| 4.1 | **Compte** : inscription, activation par le code reçu, connexion | `#/twin9` accessible | |
| 4.2 | **Moyen de payer** : un pack de crédit (`#/compte/credit`), ou la clé personnelle du compte si la supervision (`#/admin/twin9`) ouvre Twin9 aux clés personnelles | Crédit affiché, ou clé enregistrée | |
| 4.3 | **Configuration** (`#/configuration`) : le profil v9.8 par défaut, voie par lots, mode test | Le profil s'enregistre ; un réglage changé se distingue du défaut | |
| 4.4 | **Run par lots** : `#/twin9`, un court portfolio, l'accord coché, lancement ; puis **fermer le navigateur** | Le run part ; la page dit l'estimation avant de lancer | |
| 4.5 | Revenir une heure plus tard, ou quand le run le dit | Le run est **terminé**, navigateur fermé entre-temps : seul le déclencheur l'a fait avancer | |
| 4.6 | **Résultats** : la page du run, puis l'ouverture dans la cartographie | La carte s'affiche ; l'attestation porte le commit du moteur, celui de 2.2, et la version du référentiel que le run a figée (7.1.0 attendue) | |
| 4.7 | **Partage** : rendre le run visible à un cartographe, puis partager une version depuis l'interface | Le cartographe le voit ; le lien de partage s'ouvre | |
| 4.8 | **Purge** : supprimer le compte d'essai (`#/compte`) | Compte, runs, cartes et lots disparaissent ; la supervision ne le compte plus | |
| 4.9 | Christian relève à nouveau l'espace de la base | La différence avec 1.1, après 4.5, est le poids d'un vrai run, noté dans `docs/hebergement.md` | |

## 5. Ouverture de la démonstration

| # | Geste | Attendu | Relevé |
|---|---|---|---|
| 5.0 | `#/admin/twin9` : les packs, les prix de la grille, leur relevé et la promotion « Twin9 avec sa clé » | Sous l'offre de modèles, un relevé réussi du jour (le déclencheur relève les prix d'Anthropic une fois par jour, UC-ADM-05 A6) : Sonnet 5 à 2 $ / 10 $, comme la page des prix d'Anthropic depuis le 2026-10-21 ; un échec affiché dit sa raison, et la grille garde ses prix — les corriger à la main en attendant ; la promotion dans l'état voulu | |
| 5.1 | `#/admin/reglages` : la version de prompt par défaut validée (UC-ADM-03) | `GET /api/prompt-packages/default` sert le paquet choisi | |
| 5.2 | `#/admin/reglages`, démo : budget, modèle (un Haiku) et plafonds voulus | Les valeurs et leur origine (« réglage base ») ; « Sortie par appel : le maximum du modèle, 128 000 jetons » ; aucune alerte « Modèle refusé » — sinon le `DEMO_MODEL` du `.env` (Sonnet 5 en juillet) est ignoré, à retirer | |
| 5.3 | Un essai de l'Essayer et un essai gratuit de la cartographie ouverte | Deux cartes ; le compteur de la démo du jour avance | |
| 5.4 | Christian annonce l'ouverture | — | |

## Écarts relevés

| # | Écart | Bloquant ? | Suite |
|---|---|---|---|
| | | | |
