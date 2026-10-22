# UC-VIS-05 — Interroger l'assistant tuteur

| Champ | Valeur |
|---|---|
| **Acteur principal** | Visiteur (aucun compte requis) — tout utilisateur connecté y a accès de la même façon |
| **Acteurs secondaires** | Fournisseur LLM de la plateforme (Haiku, clé `ANTHROPIC_API_KEY`) ou `mock` ; exploitation (digest et carte du site générés au build) ; administrateur (interrupteur et réglages communs avec la démo, UC-ADM-04) |
| **Portée** | humanome.xyz — bouton « 💬 » de l'en-tête, sur toutes les rubriques ; API `GET /api/llm/challenge` (partagé), `POST /api/tuteur` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | Décision D9 (plan v1.1, `STATUS.md` 2026-07-17) ; §4.6 (formation, accompagnement) ; principe RGPD n°5 de `CLAUDE.md` (journalisation minimale : compteurs, jamais de contenu) |
| **Statut** | Implémenté (D9 ; compteurs dédiés migration 020 ; carte du site, mémoire courte et Haiku 5.5 par défaut : sprint 11, 2026-10-22) |

## Objectif

Permettre à quiconque de poser, en langage naturel, une question courte sur le
site (« comment cartographier mon texte ? », « à quoi sert le référentiel ? »)
et d'obtenir une réponse brève qui pointe vers les bonnes rubriques (`#/…`),
adaptée à son profil — sans jamais exposer son portfolio ni conserver la
conversation côté serveur.

## Déclencheur

L'utilisateur clique « 💬 » (« Assistant : poser une question sur le site »)
dans l'en-tête, à côté du bouton d'aide « ? ».

## Préconditions

- La démo publique est activée (l'assistant partage son interrupteur, sa
  difficulté de preuve de travail, son quota horaire configuré, son
  fournisseur `DEMO_PROVIDER` mock/anthropic et son délai amont).
- Un secret de preuve de travail existe ; en fournisseur `anthropic`, la clé
  plateforme est en environnement.
- Le budget journalier **du tuteur** (`TUTEUR_BUDGET`, 1 $ si absent, vide ou
  `0` ; 2 M de tokens) n'est pas épuisé.
- Le digest de documentation (`scripts/data/tuteur-digest.md`, généré par
  `scripts/build-tuteur-digest.mjs` depuis la carte du site,
  `scripts/lib/site-map.mjs`, UC-SYS-04 RG8) est présent dans la release —
  sinon la consigne est envoyée sans digest.
- La carte du site (`scripts/data/site-map.json`, écrite par le même script,
  au même commit) est présente dans la release — sinon la page courante n'est
  donnée que par son nom de route, sans titre ni aide (RG1).

## Garanties en cas de succès

- La réponse s'affiche en **texte simple** dans le panneau ; l'historique de
  l'onglet est gardé en `sessionStorage` (40 derniers messages), jamais sur le
  serveur ni dans le `localStorage`.
- Côté serveur : seulement les compteurs du jour du tuteur
  (`tuteur_usage_daily` : requêtes, tokens, coût estimé), l'empreinte du défi
  consommé et un seau de quota haché `tuteur:…`.
- La consigne système (profil, page courante, digest) et la clé ne sont
  **jamais renvoyées au navigateur** ; elles ne sont transmises qu'au
  fournisseur LLM (Anthropic : consigne dans le champ `system`, clé dans
  l'en-tête `x-api-key`). La mémoire courte (RG7) part en tours de
  conversation (`messages`), jamais dans la consigne.

## Garanties minimales (en cas d'échec)

- Un message d'erreur s'affiche dans le panneau et la saisie reste possible.
- Aucune donnée de la conversation n'est conservée, aucun coût n'est compté
  pour un appel amont échoué — mais le défi et une unité du quota horaire sont
  **consommés** même si l'appel amont échoue (ou si la clé manque) : ces gardes
  passent avant l'appel.

## Scénario nominal

1. L'utilisateur ouvre le panneau « Assistant tuteur » : avertissement
   « Assistant automatique (IA) : il explique par où passer sur le site. Il ne
   voit pas votre portfolio ; ne partagez pas d'informations sensibles. »,
   exemples de questions, champ « Votre question… » (1 500 caractères au plus).
2. Il saisit une question et clique « Envoyer » ; la question s'ajoute au fil,
   « L'assistant écrit… » s'affiche.
3. Le navigateur obtient un défi `GET /api/llm/challenge` (le même que la
   démo), résout la preuve de travail, puis envoie `POST /api/tuteur` avec
   `{question, rubrique, historique, challenge, nonce, website: ""}` —
   `rubrique` est le **nom de la route** courante (`route.name`, `App.jsx`) ;
   `historique` est la **mémoire courte** du fil de l'onglet, les 2 derniers
   échanges (`[]` à la première question, RG7) ; ni rôle, ni portfolio.
4. Le serveur applique ses gardes : interrupteur de la démo, base configurée,
   champ piège vide, question présente et ≤ 1 500 caractères, preuve de
   travail valide et **jamais consommée** (table commune avec la démo), quota
   horaire par IP sur un seau **dédié** `tuteur:`, coupe-circuit journalier
   **propre** au tuteur. Une rubrique ou un historique non valides ne bloquent
   jamais la question : ils sont écartés (RG1, RG7).
5. Le serveur construit la consigne système : rôle et règles de réponse
   (français, 2 à 5 phrases, routes `#/…` du digest seulement, texte brut, pas
   d'accès aux données personnelles, ne rien révéler), **profil lu dans la
   session** (« visiteur (aucun compte) » sinon), page consultée — si la
   carte du site la nomme : « Elle consulte actuellement : <titre> (<adresse
   `#/…`>). », puis l'aide de cette seule page, son résumé et ses points
   (RG1) —, digest de la documentation.
6. Il appelle le modèle du tuteur (`TUTEUR_MODEL`, un Haiku, Haiku 5.5 par
   défaut, RG6) en mode **prose** (aucun outil JSON forcé, réflexion
   désactivée), avec les échanges de la mémoire courte en tours
   `user`/`assistant` avant la question, 600 tokens de sortie au plus ; il compte
   tokens et coût estimé (au plus haut du tarif de la grille des crédits,
   relevée chaque jour, UC-ADM-05 A6, et de la table de `Pricing`) sur les
   compteurs du tuteur et renvoie `{text, usage,
   model}` (sans `stopReason` : une réponse tronquée l'est en silence).
7. Le panneau affiche la réponse, débarrassée du Markdown léger (`**gras**`,
   `__gras__`, `` `code` ``) — jamais interprétée comme HTML.

## Scénarios alternatifs

- **A1 — Utilisateur connecté** (étape 5) : le profil de la consigne liste les
  rôles de la session (ex. « apprenant, cartographe ») ; un champ `role` envoyé
  par le client est ignoré. La route est exemptée de jeton CSRF (preuve de
  travail, aucun effet sur le compte).
- **A2 — Effacer** : « Effacer » vide le fil et l'historique de session.
- **A3 — Reprise** : dans le même onglet, rouvrir le panneau (ou changer de
  page) restitue l'historique.
- **A4 — Fournisseur `mock`** (développement) : réponse simulée (modèle
  `mock`), coût nul ; il ne lit pas la mémoire courte.
- **A5 — Relance** (RG7) : « et ensuite ? » emporte les 2 derniers échanges
  du fil ; le modèle répond dans leur contexte. Une question restée sans
  réponse (refus, panne) n'en fait pas partie.

## Scénarios d'erreur

- **E1 — Saisie** : question vide → bouton inactif (serveur : `422`) ; plus de
  1 500 caractères → bornée par le champ (serveur : `413` « Question trop
  longue (1500 caractères maximum). ») ; champ piège rempli → `400` « Requête
  invalide ».
- **E2 — Preuve de travail** : absente → `400` `pow_required` ; invalide →
  `400` `pow_invalid` ; expirée → `400` `pow_expired` ; défi déjà consommé (y
  compris par la démo) → `429` `pow_reused`.
- **E3 — Quota horaire par IP** atteint (seau du tuteur) → `429` « Quota
  horaire atteint, réessayez plus tard. » + `Retry-After` ; la démo reste
  utilisable depuis la même IP (et inversement).
- **E4 — Budget du tuteur épuisé** (dollars **ou** 2 M de tokens) → `503`
  « L'assistant a atteint son budget du jour, revenez demain. » (le budget de
  la démo n'y est pour rien, et inversement).
- **E5 — Démo désactivée** → `503` « L'assistant est indisponible pour le
  moment. » ; sans secret, base ou clé → `503` « Service indisponible ». Côté
  panneau, un refus du **défi** s'affiche avec le message technique du client
  (voir L1).
- **E6 — Fournisseur** : saturé → `429` « L'assistant est saturé… » +
  `Retry-After` ; erreur → `502` « Erreur de l'assistant, réessayez plus
  tard. » (aucun détail amont) ; injoignable → « L'assistant est injoignable,
  réessayez plus tard. » en `504` (délai) ou `502`.

## Règles de gestion

- **RG1** — Le profil vient **exclusivement de la session** ; la consigne est
  construite côté serveur et n'est jamais renvoyée au navigateur. La page
  courante n'y entre que si la carte du site (`site-map.json`,
  `Tuteur\CarteDuSite`) nomme la page que désigne la rubrique, une page qui a
  une aide (ni route interne, ni nom inconnu) : par son titre et son adresse,
  puis l'aide de cette seule page (variante V1 du sprint 11, en plus du
  digest, qui a l'aide de toutes les pages). Sinon la ligne manque. Sans carte
  (fichier absent ou illisible), la rubrique passe telle quelle si elle a la
  forme d'un nom de route (minuscules, chiffres, tirets), jamais une ligne de
  texte libre (AN1, corrigée le 2026-10-22).
- **RG2** — Garde-fous de la démo réutilisés, mais **budget, compteurs et seau
  de quota propres** au tuteur ; interrupteur, difficulté, valeur du quota
  horaire, fournisseur et délai amont communs.
- **RG3** — Aucune conversation n'est stockée côté serveur ; le portfolio n'est
  jamais envoyé.
- **RG4** — Le digest contient le plan du site, l'aide publique de chaque page
  et les **titres** des chapitres des guides — jamais leur corps ni d'élément
  confidentiel (sprint 11, 2026-10-22). Le plan du site, ce sont les routes par
  famille du menu, « Compte » compris dans ses deux variantes (« Se
  connecter » pour un visiteur, « Profil et rôles » et « Crédit et factures »
  une fois connecté), les liens du mode expert marqués comme tels (le mode est
  un réglage d'affichage, jamais un droit), puis les adresses hors menu et les
  modèles d'adresse du catalogue des routes (`#/jour/AAAA-MM-JJ`,
  `#/partage/<jeton reçu>`…). L'aide de chaque page, c'est son titre, son
  adresse, son résumé et ses points (`HELP_ENTRIES`), la même qu'affiche le
  bouton « ? ». Le générateur ne lit qu'une liste blanche de sources ; le
  digest est déterministe et borné à 40 000 caractères (environ 12 000 tokens
  par question).
- **RG5** — Rendu en texte simple (pas de parseur Markdown, surface XSS nulle).
- **RG6** — Un Haiku seulement (2026-10-21, comme la démo, UC-ADM-04 RG9 :
  « Sonnet et Opus disponibles uniquement pour les comptes ayant acheté
  suffisamment de crédits API ou bien utilisant leur propre clé ») :
  Haiku 5.5 par défaut (`ModelLimits::HAIKU_PAR_DEFAUT`, celui de la démo,
  dix fois moins cher que Haiku 4.5 : 0,10 $ / 0,50 $ par million de tokens ;
  sprint 11, 2026-10-22) ; `TUTEUR_MODEL` qui nomme un Haiku l'emporte (servi
  tel quel), un Sonnet ou un Opus est ignoré au profit du défaut ; réflexion
  désactivée (`thinking: disabled`, aucun token de réflexion facturé). Les
  600 tokens de sortie restent : c'est la longueur d'une réponse de
  l'assistant (2 à 5 phrases), pas une garde du budget — la sortie de la
  démo, elle, n'est plus plafonnée.
- **RG7** — Mémoire courte (sprint 11, 2026-10-22) : avec chaque question, le
  panneau envoie les 2 derniers échanges du fil de l'onglet
  (`memoireCourte`, `web/src/lib/tuteur.js`) ; le serveur les relit avec la
  même règle (`Tuteur\MemoireCourte`) : un échange est une question (`user`)
  immédiatement suivie de sa réponse (`assistant`), de texte non vide ; tout
  autre rôle (`system` compris), toute autre forme et une question restée
  sans réponse rompent la paire et sont écartés ; chaque message est coupé à
  750 caractères, et l'échange le plus ancien tombe tant que le tout dépasse
  1 500. Les deux côtés appliquent les mêmes vecteurs
  (`api/tests/fixtures/tuteur/memoire-courte.json`) : le serveur ne coupe
  jamais ce qu'envoie un panneau honnête. Les échanges partent en tours de
  conversation avant la question, jamais dans la consigne système ; rien
  n'est conservé côté serveur (RG3).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Question, réponse | Jamais stockées côté serveur ; historique de l'onglet en `sessionStorage` ; les 2 derniers échanges repartent avec la question suivante (mémoire courte, RG7), vers le fournisseur seulement |
| Rôle de l'utilisateur | Lu dans la session à chaque question, jamais transmis par le client |
| Question, mémoire courte, profil, page courante | Transmis au fournisseur LLM (sous-traitant, Anthropic) pour produire la réponse ; non conservés par la plateforme |
| IP | Seau haché `tuteur:` + sha256 de l'identité (/64 en IPv6) |
| Usage | `tuteur_usage_daily` (migration 020) : requêtes, tokens, coût estimé du jour |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/components/TuteurPanel.jsx` — `stripLightMarkdown` | Panneau, avertissement, fil, historique de session (le fil d'avant la question part à `askTuteur`), erreurs |
| Front | `web/src/lib/tuteur.js` — `askTuteur`, `memoireCourte` | Défi, preuve, POST `tuteur` ; mémoire courte tirée du fil (RG7) |
| Front | `web/src/lib/demo-llm.js` — `fetchChallenge` ; `web/src/lib/pow.js` — `solvePow` | Défi et preuve partagés avec UC-VIS-03 |
| Front | `web/src/App.jsx` (`<TuteurPanel route={route.name} />`) | Rubrique = nom de la route courante ; panneau monté dans l'en-tête sur toutes les pages |
| Front | `web/src/api/client.js` — `apiFetch` | Message français du serveur relayé au panneau (E4) |
| API | `POST /api/tuteur` — `api/src/routes/tuteur.php` | Gardes, consigne serveur, appel, compteurs |
| Domaine | `api/src/Tuteur/CarteDuSite.php` — `charger`, `lignesRubrique` (`TUTEUR_SITE_MAP` ne sert qu'aux tests) | Page courante reconnue par la carte du site : titre, adresse, aide (RG1) |
| Domaine | `api/src/Tuteur/MemoireCourte.php` — `borner` | Mémoire courte relue, bornée et validée (RG7) |
| Domaine | `api/src/Llm/UsageCounters.php` (table `tuteur_usage_daily`) | Budget propre (RG2) |
| Domaine | `api/src/Llm/AnthropicProvider.php` (`forceJsonDocument: false`, `precedents`), `MockProvider`, `Pricing`, `ModelLimits::HAIKU_PAR_DEFAUT` | Réponse en prose, tours précédents, modèle par défaut, coût |
| Domaine | `api/src/Llm/PowChallenge.php`, `DemoConfig.php`, `api/src/Auth/RateLimiter.php`, `api/src/Auth/Session.php`, `Users::rolesOf` (ordre alphabétique : « apprenant, cartographe ») | Gardes partagés, profil de session |
| Domaine | `api/src/ClientIp.php` — `bucketIdentity` | Identité du seau (/64 en IPv6) |
| Middleware | `api/src/Middleware/CsrfMiddleware.php` — `EXEMPT_PATHS` | Exemption CSRF de `/api/tuteur` (A1) |
| Base | `scripts/migrations/020_tuteur_usage.sql` | Compteurs quotidiens du tuteur |
| Front | `web/src/routes-catalogue.js` — `ROUTE_CATALOGUE`, `AIDE_SANS_ROUTE` | Une ligne par nom de route du routeur : adresses hors menu, modèles, entrée d'aide (RG4) |
| Front | `web/src/help/registry.js` — `HELP_ENTRIES` ; `web/src/nav.js` — `navGroups` | Résumé et points de chaque page ; menu des deux sessions et des deux modes |
| Build | `scripts/build-tuteur-digest.mjs`, `scripts/lib/site-map.mjs` — `loadSources`, `collectSiteMap`, `renderDigest` | Digest de navigation (RG4) et `scripts/data/site-map.json` (UC-SYS-04 RG8), lu par l'API (RG1) |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-VIS-05-U01 | Migration 020 | Table de compteurs seuls, clé = jour | `api/tests/UseCases/Unit/UcVis05InterrogerTuteurTest.php` |
| UC-VIS-05-U02 | `UsageCounters('tuteur_usage_daily')` | Budget propre (plafond passé en paramètre), sans effet sur la démo (RG2) ; la valeur par défaut est vérifiée par F16 | idem |
| UC-VIS-05-U03 | `AnthropicProvider::complete(…, false, $precedents)` | Prose : pas d'outil, réflexion désactivée, blocs texte concaténés, 600 tokens, modèle par défaut ; tours précédents avant la question, consigne seule dans `system` | idem |
| UC-VIS-05-U04 | `Pricing::estimateUsd`, `ModelLimits::HAIKU_PAR_DEFAUT` | Modèle par défaut du tuteur : Haiku 5.5, tarifé (dix fois moins que Haiku 4.5), le plafond peut couper | idem |
| UC-VIS-05-U05 | `askTuteur` | Défi, preuve, corps exact (ni rôle ni portfolio), `historique` vide à la première question, seule la mémoire courte du fil part | `web/test/usecases/unit/uc-vis-05-interroger-assistant-tuteur.test.js` |
| UC-VIS-05-U06 | `stripLightMarkdown` | Texte simple, listes et routes conservées (RG5) | idem |
| UC-VIS-05-U07 | `scripts/build-tuteur-digest.mjs` | Toutes les routes du menu (famille « Compte » des deux sessions, liens du mode expert marqués), adresses hors menu et modèles, aide de chaque page (titre, résumé, points), tous les chapitres ; déterministe, titres seulement (RG4) ; `site-map.json` écrit à côté, une page par route — exécuté dans un miroir temporaire | idem |
| UC-VIS-05-U08 | `ROUTE_CATALOGUE`, `parseHash` | Une ligne par nom de route du routeur (sauf `not-found`), noms uniques ; chaque exemple, variante et exemple de modèle se résout vers son nom | idem |
| UC-VIS-05-U09 | `ROUTE_CATALOGUE`, `App.jsx` (lu comme texte) | Chaque `case` du switch de rendu est au catalogue ; chaque route du catalogue a son cas, sauf l'accueil (`default`) | idem |
| UC-VIS-05-U10 | `ROUTE_CATALOGUE`, `HELP_ENTRIES` | Chaque route non interne a son entrée d'aide (titre, résumé) ; chaque entrée est une route ou un profil sans route (`employeur`) | idem |
| UC-VIS-05-U11 | `navGroups`, `ROUTE_CATALOGUE` | Visiteur, chaque rôle et tous les rôles, en mode simple et expert : chaque lien du menu mène à une route du catalogue (ni `not-found` ni `redirect`) cohérente avec son `route` ; le menu d'un visiteur ne mène qu'à des routes publiques | idem |
| UC-VIS-05-U12 | `content/**`, `HELP_ENTRIES`, `parseHash` | Chaque `#/…` des guides, de la confidentialité et de l'aide se résout vers une route réelle ; exceptions déclarées, et toutes présentes : `#/merge` et `#/cartographie-v3` (redirigées), `#/jour/<date>` et `#/partage/<jeton>` (modèles, résolus une fois complétés) | idem |
| UC-VIS-05-U13 | `scripts/build-tuteur-digest.mjs` | Digest de moins de 40 000 caractères, et plus long que l'ensemble des résumés de l'aide (RG4) | idem |
| UC-VIS-05-U14 | `CarteDuSite` (carte fictive) | Rubrique reconnue : titre, adresse ou modèle, résumé et points de la seule page ; nom inconnu, route interne, casse, blancs internes, valeur non textuelle → rien ; sans carte, le nom de route seul, jamais du texte libre ; fichier absent, illisible ou d'une autre version → pas de carte (RG1, AN1 corrigée) | `api/tests/UseCases/Unit/UcVis05InterrogerTuteurTest.php` |
| UC-VIS-05-U15 | `MemoireCourte::borner` | Vecteurs communs : paires question → réponse seulement, les 2 dernières, 750 / 1 500 caractères (points de code), rôle `system`, question sans réponse et autre forme écartés (RG7) | idem |
| UC-VIS-05-U16 | `memoireCourte` | Les mêmes vecteurs que U15, côté navigateur ; idempotente | `web/test/usecases/unit/uc-vis-05-interroger-assistant-tuteur.test.js` |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-VIS-05-F01 | Nominal, A4 | API | Réponse du mock (modèle `mock`, coût nul), compteur du tuteur seul, rien de stocké, seau `tuteur:` | `api/tests/UseCases/Functional/UcVis05InterrogerTuteurTest.php` |
| UC-VIS-05-F02 | Nominal (5-6), RG1 | API | Consigne serveur : profil visiteur (une seule ligne de profil), page courante reconnue par la carte fictive (titre, adresse, résumé et points de cette seule page, juste après le profil), champs pirates (`role`, `roles`, `system`) ignorés, partie précédant le digest indépendante du digest généré, question seule sans historique, rien renvoyé, prose, coût | idem |
| UC-VIS-05-F03 | A1 | API | Rôles de la session dans la consigne, sans en-tête CSRF | idem |
| UC-VIS-05-F04 | E1 | API | Champ piège 400, vide 422, 1 500 OK, 1 501 → 413 | idem |
| UC-VIS-05-F05 | E2 | API | Preuve absente (400), invalide (`pow_invalid`), expirée (`pow_expired`) ; défi consommé par la démo → rejeu refusé | idem |
| UC-VIS-05-F06 | E3 | API | Quota IP dédié (message, `Retry-After`) ; démo intacte ; et inversement (quota de la démo atteint → tuteur OK) | idem |
| UC-VIS-05-F07 | E4, RG2 | API | Budgets séparés dans les deux sens (démo épuisée → tuteur OK ; tuteur épuisé → démo OK) ; coupe-circuit en dollars et en tokens | idem |
| UC-VIS-05-F08 | E5 | API | Interrupteur commun → 503 ; sans secret → 503 « Service indisponible » | idem |
| UC-VIS-05-F09 | E6 | API | 429 + `Retry-After`, 502 sans détail, 504 (délai), 502 « injoignable », clé absente 503 « Service indisponible » ; rien compté | idem |
| UC-VIS-05-F10 | Nominal | IHM | Avertissement, question, « L'assistant écrit… », réponse en texte simple, corps exact (`historique` vide à la première question), historique de session | `web/test/usecases/functional/uc-vis-05-interroger-assistant-tuteur.test.jsx` |
| UC-VIS-05-F11 | A2, A3 | IHM | Historique restitué après fermeture/réouverture, changement de page (panneau toujours monté) et rechargement de l'onglet ; « Effacer » | idem |
| UC-VIS-05-F12 | A1 | IHM | Connecté : rubrique envoyée, aucun rôle | idem |
| UC-VIS-05-F13 | E4 | IHM | Message du serveur, saisie rendue | idem |
| UC-VIS-05-F14 | E5, limite L1 | IHM | Défi refusé → message technique affiché | idem |
| UC-VIS-05-F15 | E1 | IHM | Question vide non envoyable, champ borné, fermeture | idem |
| UC-VIS-05-F16 | Préconditions | API | `TUTEUR_BUDGET` vide → 1 $ par défaut : 0,999999 $ → 200, 1 $ → 503 | `api/tests/UseCases/Functional/UcVis05InterrogerTuteurTest.php` |
| UC-VIS-05-F17 | RG1 (anomalie AN1 corrigée) | API | Rubrique que la carte ne nomme pas (ligne de profil glissée, 200 caractères, `not-found`, routes internes, casse, valeur non textuelle) → aucune ligne « Elle consulte », un seul profil ; modèle d'adresse d'une page à compléter donné tel quel ; sans carte (absente ou illisible) : 200, le nom de route seul, la ligne glissée refusée | idem |
| UC-VIS-05-F18 | RG5 | IHM | Réponse contenant du HTML affichée comme texte, aucun élément créé | `web/test/usecases/functional/uc-vis-05-interroger-assistant-tuteur.test.jsx` |
| UC-VIS-05-F19 | Garanties | IHM | Historique de session borné aux 40 derniers messages | idem |
| UC-VIS-05-F20 | RG6 | API | `TUTEUR_MODEL` vide → Haiku 5.5 ; un Sonnet ou un Opus → Haiku 5.5 appelé ; un autre Haiku (4.5) servi tel quel ; `thinking: disabled` à chaque appel | `api/tests/UseCases/Functional/UcVis05InterrogerTuteurTest.php` |
| UC-VIS-05-F21 | RG7, A4, A5 | API | Mémoire courte : les 2 derniers échanges en tours `user`/`assistant` avant la question, jamais dans la consigne ; rôle `system`, question sans réponse écartés ; message coupé à 750 caractères ; historique qui n'est pas une liste ignoré ; le mock répond sans le lire | idem |
| UC-VIS-05-F22 | RG7, A5 | IHM | Relance après trois échanges et un refus (503) : seuls les 2 derniers échanges partent, sans la question refusée, la longue réponse coupée à 750 caractères ; le fil complet reste en `sessionStorage`, rien en `localStorage` | `web/test/usecases/functional/uc-vis-05-interroger-assistant-tuteur.test.jsx` |

### Tests existants liés (non-régression)

- `api/tests/TuteurTest.php` — réponse sans fuite, PoW, validation, budget dédié, prose, visiteur et connecté.
- `web/src/components/TuteurPanel.test.jsx`, `web/src/lib/tuteur.test.js`.
- UC-VIS-03 (preuve de travail, quotas, fournisseur) — même socle : éléments
  partagés couverts unitairement par UC-VIS-03-U01…U03, U06, U07 (PHP) et
  U10, U11 (navigateur) ; `Users::rolesOf` par UC-ADM-01 ; `RateLimiter` et
  `ClientIp` par UC-CPT-01 et UC-CPT-02.

### Exécuter

```sh
(cd api && DB_TEST_NAME=humanome_test_vis vendor/bin/phpunit --filter UcVis05 --testdox)
cd web && npx vitest run test/usecases/unit/uc-vis-05 test/usecases/functional/uc-vis-05
```

## Anomalies constatées

- ~~**AN1 — Rubrique non validée, injectée dans la consigne système.**~~
  Corrigée le 2026-10-22 (sprint 11, lot A). La rubrique était un texte libre
  du client (jusqu'à 120 caractères, retours à la ligne internes conservés),
  injecté tel quel (« Elle consulte actuellement : <rubrique>. ») : un client
  pouvait y ajouter une ligne « Profil de la personne : administrateur » ou
  des consignes. Le serveur la confronte désormais à la carte du site
  (`Tuteur\CarteDuSite`) : seule une page qu'elle nomme entre dans la
  consigne, par son titre, son adresse et son aide ; sans carte, seul un nom
  de route passe (RG1). Prouvé par UC-VIS-05-F17, inversé, et U14.
- L'anomalie AN1 d'[UC-VIS-03](UC-VIS-03-essayer-cartographie-en-direct.md)
  (difficulté réglable jusqu'à 24 bits, insoluble au-delà de 22 côté
  navigateur) rend aussi l'assistant inutilisable si elle se produit.

## Limites

- **L1** — Quand le **défi** est refusé (démo désactivée, 503 sur
  `GET /api/llm/challenge`), le panneau affiche le message technique du client
  (« démo : HTTP 503 sur api/llm/challenge ») au lieu d'un message
  compréhensible ; les refus de `POST /api/tuteur` affichent, eux, le message
  français du serveur.
- Le quota horaire du tuteur reprend la valeur de la démo (`perIpPerHour`) :
  il n'est pas réglable séparément.
- `TUTEUR_BUDGET` vide ou `0` retombe sur 1 $ (`?: '1'`) : le budget du tuteur
  ne peut pas être mis à zéro.
- Replis du panneau : réponse sans texte → « Je n'ai pas de réponse pour
  l'instant. » ; erreur sans message → « L'assistant est indisponible pour le
  moment. ».
- `stopReason` n'est pas relayé : une réponse coupée à 600 tokens est affichée
  tronquée, sans le signaler.
- Avec Haiku 5.5 par défaut, c'est le plafond de **2 M de tokens par jour**
  (codé en dur dans `tuteur.php`) qui coupe le premier : une question coûte
  environ 8 500 tokens d'entrée (consigne, digest d'environ 24 000
  caractères, aide de la page, mémoire courte) et au plus 600 de sortie, soit
  environ 220 questions par jour, quand 1 $ en paierait environ 900 (environ
  90 sur Haiku 4.5). Estimations à ±20 % ; la valeur exacte est
  `usage.inputTokens`, cumulé dans `tuteur_usage_daily`.
- La carte du site et le digest sont régénérés par `stage-api.sh`, les
  fichiers publics de la carte par le `prebuild` du front : déployer l'API et
  le front depuis le même commit (UC-SYS-04).
