# UC-APP-02 — Lancer une cartographie standard

| Champ | Valeur |
|---|---|
| **Acteur principal** | Apprenant (fonctionne aussi sans session) |
| **Acteurs secondaires** | Fournisseur LLM : service humanome (proxy plateforme) ou fournisseur choisi avec la clé personnelle de l'apprenant ; promptologues (versions publiées) ; administrateur (version par défaut) |
| **Portée** | humanome.xyz — assistant `#/espace/nouveau-run` ; moteur exécuté dans le navigateur |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.2 (déclencher une cartographie), §4.3 (découpage journalier, fusion obligatoire, traçabilité prompt/référentiel), §5 (clé API personnelle, LLM peu coûteux pour l'usage gratuit), §6.1 ; principe RGPD n°5 de `CLAUDE.md` (journalisation minimale) |
| **Décisions** | ADR-001 (exécution client-first), ADR-004 (clés API personnelles), ADR-005 (la masse passe par la file serveur — hors de ce cas) |
| **Statut** | Implémenté (P8.3) ; version par défaut exposée par le serveur (M7) mais non exploitée par l'assistant (anomalie A-01) ; choix du référentiel publié, dont le run lit la structure (2026-10-20, A7) |

## Objectif

Produire, à partir d'un portfolio local (UC-APP-01), une **cartographie de
compétences** : un document `cartographie-jour` par journée puis leur
**fusion chronologique** `cartographie-merge`, en choisissant la version de
prompt, le référentiel publié (RESPIRE par défaut) et le fournisseur du
modèle, après une estimation de coût, avec des **checkpoints** qui permettent
d'interrompre et de reprendre — le tout exécuté dans le navigateur, résultats
conservés localement. Le run lit la structure du référentiel dans son JSON :
nombre et numéros des pôles, codes, nombre d'appels.

## Déclencheur

L'apprenant ouvre `#/espace/nouveau-run` (menu « Ma cartographie →
Cartographier mes écrits », ou le bouton du tableau de bord `#/espace`).

## Préconditions

- Un portfolio local comportant au moins une journée **datée** (UC-APP-01).
- Mode « Service humanome » : API joignable, démonstration activée et budget
  du jour non épuisé — 1 $ par défaut depuis le 2026-10-21, que le Service
  partage avec l'Essayer, l'essai gratuit de la cartographie ouverte et le banc
  du promptologue (UC-ADM-04 RG8) : un run de plusieurs dizaines de journées
  peut l'épuiser seul. Avec la configuration par défaut, au plus
  ⌊`perIpPerHour` / 8⌋ journées par heure et par IP (20/h dans
  `api/config/demo.php` ⇒ 2 journées ; 40/h, la production de juillet, ⇒ 5) et
  des journées d'au plus `maxInputChars` − ~8,5 k caractères de gabarit
  (≈ 1,99 million de caractères avec les 2 000 000 par défaut, ≈ 11,5 k avec
  les 20 000 d'avant le 2026-10-21) ; au-delà, voir E5 et les anomalies A-02
  et A-05. Le modèle est celui de la démo, un Haiku (UC-ADM-04 RG9) : Sonnet et
  Opus passent par une clé personnelle.
- Mode « Clé personnelle » : une clé du fournisseur choisi (sauf Ollama,
  local et sans clé, attendu sur `http://localhost:11434` : l'assistant ne
  permet pas de changer cette adresse).
- Aucune session n'est exigée ; la synchronisation serveur de la clé et la
  récupération d'une clé enregistrée demandent d'être connecté.

## Garanties en cas de succès

- Un document `cartographie-jour` par journée et, si la fusion est
  constructible, un document `cartographie-merge` validé au schéma, sont
  enregistrés dans le **carto-store local** (IndexedDB
  `humanome-cartographies`) en visibilité `privee`, sans copie serveur
  (`serverId` null), avec leur traçabilité : `promptPackage` (version
  choisie), `referentiel`, `runMeta` (portfolio, mode, fournisseur, modèle,
  nombre de jours, date, compteurs de tokens réels).
- Les checkpoints par journée et le journal du run sont dans IndexedDB
  `humanome-runs` (magasin `kv`).
- Côté serveur (mode Service humanome) : des **compteurs** seulement
  (requêtes, tokens, coût estimé du jour), jamais de prompt ni de réponse.

## Garanties minimales (en cas d'échec)

- Chaque journée terminée reste checkpointée : une reprise ne refait pas le
  travail déjà payé.
- Aucune cartographie incomplète n'est enregistrée tant qu'une journée manque.
- La clé personnelle ne transite jamais par humanome, sauf synchronisation
  explicitement cochée (chiffrée côté serveur, ADR-004).

## Scénario nominal

1. L'apprenant ouvre l'assistant. L'espace vérifie la session
   (`GET api/auth/me`) ; l'assistant charge RESPIRE, sa dernière version
   publiée, celle que le menu « Référentiel » présélectionne : dans la base
   (`GET api/referentiels` puis `GET api/referentiels/respire/versions/{semver}`,
   S5), à défaut dans l'export statique (`data/referentiel/index.json` puis le
   fichier de la version), enfin la copie embarquée ; les portfolios locaux et les versions de prompt
   (`GET api/prompt-packages/default` puis `GET api/prompt-packages`).
2. **Portfolio** : il choisit un portfolio ; chaque entrée affiche son nombre
   de journées (segments datés regroupés par date, textes d'une même date
   concaténés, tri chronologique ; segments non datés ignorés). « Continuer »
   n'est actif qu'avec au moins une journée.
3. **Version de prompt** (mode expert ; en mode simple : A8) : le sélecteur
   « Référentiel » propose les
   référentiels publiés en base (`GET api/referentiels`, public ; l'index
   statique `data/referentiel/index.json` en repli, S5), RESPIRE en tête et à
   sa dernière version par défaut (un autre : A7) ; le paquet embarqué `aurora-v3-reconstruit@1.1.0`
   est proposé en tête et présélectionné, suivi des versions publiées ;
   l'apprenant garde ou change la version. « Continuer » attend que le
   référentiel soit chargé.
4. **Fournisseur** : il choisit « Service humanome » (modèle et plafonds
   imposés par la plateforme, preuve de travail à chaque appel).
5. **Estimation** : l'assistant affiche le nombre de journées × la taille
   moyenne, le nombre d'appels (un par pôle du référentiel et un kairos par
   journée, plus un récit de fusion par compétence, par pôle et un kairos —
   RESPIRE v7 : 8 par journée + 69), les tokens d'entrée/sortie, le coût estimé
   (ou « inconnu » hors table de prix) et la durée, avec l'avertissement de prix
   indicatifs.
6. **Exécution** : « Lancer le run ». Une première preuve de travail est
   pré-résolue, puis, journée par journée, le moteur appelle le modèle une fois
   par pôle du référentiel (7 pour RESPIRE v7) et une fois pour la synthèse
   kairos ; ces prompts nomment le référentiel (« RESPIRE », ou le libellé
   d'un autre sans sa version) et chacun porte, après un préambule de rôle,
   l'en-tête « # Feuille de portfolio du JJ/MM/AAAA (AAAA-MM-JJ) »
   (`formatDateFr`, `narrative-prompts.js`) suivi du texte de la journée entre
   balises `<portfolio>` ;
   pour chaque appel du service humanome, le navigateur obtient un défi
   (`GET api/llm/challenge`), le résout et envoie
   `POST api/llm {provider, model, system, prompt, maxTokens, challenge, nonce, website: ''}`.
   Chaque pôle rendu est validé au schéma puis à la conformité au référentiel
   (ses codes, de ce pôle), la journée entière de même (tous les pôles du
   référentiel, chacun une fois ; un kairos qui ne relie que ses codes).
   Chaque journée validée est **checkpointée** ; la progression affiche
   « Journée k/n (date) — appel x/N (pôle p) », N = pôles + 1.
7. Toutes les journées terminées, le moteur fusionne les documents
   (`mergeDays`) et construit le document `cartographie-merge` avec des
   **résumés locaux** à la place des récits narratifs, puis le valide au
   schéma et à la conformité au référentiel du run. Les prompts de récits de
   fusion que le moteur sait produire sur ces agrégats (`buildNarrativePrompts` :
   un par compétence, par pôle et un kairos — 69 pour RESPIRE v7, exactement les
   appels que compte l'estimation, RG6) ne sont ni construits ni envoyés par
   l'assistant v1 (voir Limites). Les documents d'un autre référentiel que
   RESPIRE le nomment (`referentiel`) ; ceux de RESPIRE ne changent pas.
8. Les documents sont enregistrés dans le carto-store (« Journée <date> —
   <titre> », « Cartographie — <titre> ») ; message « Cartographie terminée et
   enregistrée (n document(s) jour + le document merge, visibilité
   « privée ») » et consommation réelle (tokens, appels).
9. « Retour à l'espace apprenant » ramène au tableau de bord `#/espace`
   (UC-APP-03).

## Scénarios alternatifs

- **A1 — Clé personnelle** (étape 4) : fournisseur (Anthropic, OpenAI,
  Google, xAI, OpenRouter, Ollama), modèle (défaut du fournisseur) et clé ; la
  clé est pré-remplie depuis `localStorage` (`humanome-keys`) et y est
  mémorisée par défaut ; « Synchroniser sur le serveur (chiffrée) » (opt-in,
  connecté) envoie `PUT api/keys` avant le run ; « Récupérer la clé depuis le
  serveur » lit `GET api/keys/{fournisseur}` (clé absente : message du
  serveur, « Aucune clé enregistrée pour ce fournisseur »). L'assistant
  construit un transport `direct` du moteur (`createProviderBundle` →
  `createProvider`, modèle saisi — pré-rempli avec le défaut du fournisseur,
  défaut si le champ est vide —, budget de sortie : tout ce que le modèle peut
  rendre pour Anthropic (`sortieMaxAnthropic`, 128 000 tokens pour Sonnet 5,
  64 000 pour Haiku 4.5, depuis le 2026-10-21 : une réponse coupée est payée et
  perdue), 8 192 tokens pour les autres fournisseurs, dont la plateforme ne
  connaît pas le maximum ; ni consigne système ni température). Les appels partent
  **directement** vers l'API du fournisseur, jamais vers humanome, la clé
  dans l'en-tête propre à chaque API — jamais dans l'URL ni dans le corps ;
  Ollama ne reçoit aucun en-tête d'authentification (RG9). Le moteur fait
  3 tentatives au total sur 429/5xx/erreur réseau (`Retry-After` respecté,
  plafonné à 5 min ; sinon attente de 250–500 ms puis de 500–1 000 ms),
  aucune sur une autre erreur HTTP (E7), soit, avec le nouvel essai
  d'`extractDay`, jusqu'à 6 requêtes par pôle ; une réponse tronquée n'est
  jamais refaite (une requête, 2026-10-22). « Interrompre » abandonne
  aussi l'attente avant reprise. Un refus de la synchronisation bloque le
  lancement (E6).
- **A2 — API injoignable ou en erreur** (étapes 1 et 3) : API absente (échec
  réseau, réponse non JSON d'une copie statique) : bandeau « Copie statique du
  site… » ; API joignable mais en erreur 5xx JSON : bandeau « Vous n'êtes pas
  connecté… ». Dans les deux cas, seule la version embarquée est proposée
  (« Versions publiées indisponibles (API injoignable) : version embarquée
  proposée. ») et la synchronisation de clé est désactivée. Le mode clé
  personnelle reste utilisable.
- **A3 — Version publiée choisie** (étape 3) : la version choisie est
  enregistrée avec chaque cartographie (`promptPackage`) et entre dans
  l'identifiant du run ; en v1 le moteur exécute **toujours** le protocole
  embarqué (annoncé à l'écran), qui lit le référentiel choisi — y compris si la
  version enregistrée est une version publiée dont les gabarits ne le lisent
  pas (Limites).
- **A4 — Interrompre puis reprendre** (étape 6) : « Interrompre » arrête le run
  (l'appel en cours est abandonné, la journée entamée sera refaite) ;
  « Reprendre le run » saute les journées checkpointées : « Repris à la
  journée k/n : les j journée(s) déjà checkpointée(s) sont sautées. » (k est
  faux après une journée en échec, anomalie A-04).
- **A5 — Rechargement de la page** (étape 6) : quitter l'assistant interrompt
  le run ; relancé avec le même portfolio et la même version (même
  identifiant de run `portfolioId::paquet@version`), il reprend depuis les
  checkpoints IndexedDB.
- **A6 — Fusion non constructible** (étape 7) : la fusion rend un domaine par
  pôle du référentiel ; si un pôle n'a aucune compétence établie sur la période
  (portfolio court), les documents jour sont enregistrés seuls : « Run
  terminé : n document(s) jour enregistrés… » et une note explique pourquoi la
  fusion manque (« … le format exige au moins une compétence établie dans
  chacun des pôles du référentiel sur la période… »), pour tout référentiel.
- **A7 — Autre référentiel publié** (étape 3, 2026-10-20) : l'apprenant choisit
  dans « Référentiel » un autre référentiel publié (ou une autre structure de
  RESPIRE). L'assistant le charge depuis la base
  (`GET api/referentiels/{id}/versions/{semver}`, versions publiées seulement ;
  à défaut, `data/referentiel/index.json` puis son fichier) ; l'estimation, les appels (un par pôle + kairos), les prompts (nom,
  pôles, codes, codes d'exemple), la validation et la fusion suivent sa
  structure ; ses documents le nomment (`referentiel`) et sont enregistrés avec
  sa version (`referentiel: {id, version}`) ; l'identifiant du run l'inclut
  (RG3). Un référentiel voté et publié sur le site est donc proposé sans
  attendre un export statique. Sans API ni index lisibles (copie statique),
  aucun choix n'est offert : RESPIRE embarqué. Une liste sans RESPIRE (une
  base qui ne l'a pas publié) présélectionne son premier référentiel, qui
  devient le choix : l'assistant charge celui que le menu montre. Sous le
  menu, la provenance d'un autre référentiel que RESPIRE (`source` : d'où il
  vient, sa licence). Un référentiel qui ne se charge pas : message,
  « Continuer » inactif.
- **A8 — Mode simple** (étapes 3 et 4, 2026-10-22,
  [UC-VIS-06](../visiteur/UC-VIS-06-choisir-affichage-simple-expert.md)) :
  un compte apprenant seul, sans choix enregistré dans le navigateur, est en
  mode simple. L'étape 3 s'intitule « Référentiel » (dans la liste des
  étapes comme dans son titre) : le choix du référentiel reste offert, la
  liste des versions de prompt ne l'est pas, une ligne dit le protocole
  exécuté (« Protocole : aurora-v3-reconstruit@1.1.0 (embarqué) ») ; la
  cartographie enregistre ce paquet, qui est celui que le moteur exécute,
  même si une autre version avait été choisie en mode expert. À l'étape 4,
  la clé personnelle n'a pas de champ « Modèle » : le modèle par défaut du
  fournisseur est employé et enregistré (`runMeta.model`). Les scénarios
  A3 et le choix du modèle de A1 se jouent en mode expert.

## Scénarios d'erreur

- **E1 — Aucun portfolio local** (étape 2) : « Aucun portfolio local. Créez
  d'abord un portfolio… » (lien `#/portfolio`), « Continuer » inactif.
- **E2 — Portfolio sans journée datée** (étape 2) : « (aucune journée
  segmentée : à découper dans le module portfolio) », « Continuer » inactif.
- **E3 — Clé manquante** (étape 4) : « Continuer » inactif tant que la clé est
  vide (sauf Ollama : « Ollama tourne en local : aucune clé requise. »). Le
  moteur refuse aussi, avant tout appel, un transport direct sans clé
  (« createProvider(): apiKey requise pour <fournisseur> en transport
  direct », sauf Ollama) et un fournisseur inconnu.
- **E4 — Journée en échec** (étape 6) : réponse illisible deux fois de suite,
  erreur du fournisseur… La journée est marquée en échec, le run **continue**
  avec les suivantes, puis affiche « Certaines journées ont échoué. Les
  journées réussies sont checkpointées : « Reprendre » ne retentera que les
  journées manquantes. » et la liste des journées en échec ; rien n'est
  enregistré dans le carto-store.
- **E5 — Service humanome indisponible** (étape 6). Au défi initial
  (`GET api/llm/challenge`, pré-résolu avant la 1re journée), seul un `503`
  est possible (démo désactivée, ou secret de preuve de travail absent) :
  « La démo est épuisée pour aujourd'hui ou momentanément désactivée.
  Revenez un peu plus tard — ou créez un compte pour cartographier sans ces
  limites. » avec « Reprendre le run », aucun appel LLM. Le quota horaire par
  IP (`429` + `Retry-After`), le budget du jour épuisé (`503`), le texte trop
  long (`413`) et les refus de preuve (`400 pow_*`, `429 pow_reused`) ne
  surviennent que sur `POST api/llm`, donc **en cours de run** : les journées
  concernées échouent avec le détail technique (E4, anomalie A-02).
- **E6 — Synchronisation de la clé refusée** (étape 6, A1) : `PUT api/keys`
  en échec (`401` session expirée, `403` CSRF, `422` « Validation échouée »,
  clé de moins de 8 caractères) : le run ne démarre pas, le message du
  serveur s'affiche avec « Reprendre le run », aucun appel au fournisseur —
  bien que la clé fonctionnerait localement.
- **E7 — Clé refusée ou requête rejetée par le fournisseur** (étape 6, A1) :
  une réponse HTTP autre que 429/5xx (`401` clé invalide, `400`, `403`,
  `404` modèle absent d'Ollama…) ou un `200` au corps non JSON n'est pas
  réessayé par le transport ; `extractDay` refait l'appel une fois
  (2 requêtes), puis la journée échoue avec le détail du fournisseur, par
  exemple « extractDay : pôle 1 (2026-01-05) — openai: HTTP 401 — Incorrect
  API key provided », et le run passe à la journée suivante (E4).

## Règles de gestion

- **RG1** — Exécution dans le navigateur (ADR-001) : le serveur ne voit le
  texte d'une journée qu'en mode Service humanome, le temps de l'appel, sans
  le conserver (compteurs seulement, principe RGPD n°5).
- **RG2** — Une journée = un appel par pôle du référentiel + 1 synthèse kairos
  (RESPIRE v7 : 7 + 1) ; un appel en échec (réponse illisible, erreur du
  fournisseur, pôle invalide au schéma ou non conforme au référentiel — un code
  qu'il ne connaît pas ou d'un autre pôle) est réessayé **une**
  fois par `extractDay` ; une synthèse kairos en échec — pour **toute**
  cause, erreur HTTP ou réseau comprise — est dégradée en `kairos: null` : la
  journée reste valable et est checkpointée **définitivement** (jamais
  retentée, cf. A-03), sans signalement à l'écran.
- **RG3** — Identifiant de run stable
  `portfolioId::paquet@version::référentiel@version` : même portfolio, même
  version de prompt et même version du référentiel ⇒ mêmes checkpoints
  (reprise automatique) ; une autre structure ne reprend pas ces journées.
- **RG4** — Checkpoint atomique par journée (`run:<id>:checkpoint:<date>`),
  échec persistant (`run:<id>:failed:<date>`), journal horodaté
  (`run_started`, `run_resumed`, `day_started`, `day_completed`, `day_failed`,
  `run_completed`). Le moteur ne consulte le signal d'interruption qu'**entre**
  deux journées, mais l'assistant le transmet aussi aux appels du
  fournisseur : l'appel en cours est abandonné et la journée entamée est
  refaite à la reprise.
- **RG5** — Service humanome : une preuve de travail **par appel** (défi signé
  HMAC, 5 minutes, usage unique), pot de miel `website` vide ; le serveur
  impose modèle (un Haiku), sortie (le maximum du modèle, sans plafond depuis
  le 2026-10-21 ; le `maxTokens` envoyé est ignoré) et plafonds
  (`api/config/demo.php`, surcharges admin). Reprises (`demo-llm.js`, transport à `maxAttempts: 1`) : **aucune**
  sur quota (`429` hors défi) ni sur `503` ; **une seule**, après 2,5 s et
  avec un défi neuf, sur `500`/`502`/`504`/`529`, erreur réseau ou défi refusé
  (`pow_reused`, `pow_expired`, `pow_required`).
- **RG6** — Estimation sur la structure du référentiel (`callsPerDayFor`,
  `mergeNarrativeCallsFor`) : un appel par pôle et le kairos par journée, un
  récit de fusion par compétence, par pôle et le kairos — RESPIRE v7 : 8 appels
  par journée + 69 récits (61 compétences + 7 pôles + 1 kairos : le nombre de
  prompts que `buildNarrativePrompts` produit sur une fusion, U38) ; tokens
  ≈ caractères / 3,6 ; 1 000 tokens de sortie et 20 s par appel ; le service
  humanome est estimé sur le modèle de référence `claude-haiku-5-5`, celui de
  la démo qui le sert (`claude-sonnet-5` jusqu'au 2026-10-21) ; un modèle hors
  table de prix donne un coût « inconnu ».
- **RG7** — Le document merge n'est produit que si **toutes** les journées
  sont checkpointées, s'il valide le schéma (un domaine par pôle du référentiel,
  portant chacun au moins une compétence établie) et s'il est conforme au
  référentiel du run ; sinon seuls les documents jour sont gardés.
- **RG8** — Les cartographies produites sont **privées et locales** ; toute
  copie serveur est un opt-in ultérieur (UC-APP-04).
- **RG9** — Voie clé personnelle (A1) : `createProvider` choisit l'adaptateur
  par identifiant parmi `SUPPORTED_PROVIDERS` (les 6 fournisseurs proposés
  par l'écran, dans le même ordre) ; chaque adaptateur traduit l'appel
  unifié `{model, prompt, maxTokens}` dans le format de son API et ramène
  `{text, usage: {inputTokens, outputTokens}, model, stopReason,
  stopReasonRaw, truncated}` (l'arrêt normalisé, `docs/contrats.md` §4
  point 14 ; le modèle renvoyé par
  l'API remplace le modèle demandé dans cette valeur de retour) ; l'assistant
  n'en retient que l'usage, cumulé dans `runMeta.usage` — `runMeta.model`
  reste le modèle saisi.

  | Fournisseur | `POST` vers | Clé | Budget de sortie | Texte ; usage entrée / sortie |
  |---|---|---|---|---|
  | Anthropic (`anthropic.js`) | `https://api.anthropic.com/v1/messages` | `x-api-key` (+ `anthropic-version`, `anthropic-dangerous-direct-browser-access`) | `max_tokens` | blocs `content[].text` de type `text` ; `usage.input_tokens` / `output_tokens` |
  | OpenAI (`openai.js`) | `https://api.openai.com/v1/chat/completions` | `authorization: Bearer <clé>` | `max_tokens` | `choices[0].message.content` ; `usage.prompt_tokens` / `completion_tokens` |
  | xAI (`xai.js`) | `https://api.x.ai/v1/chat/completions` | idem OpenAI | idem | idem (adaptateur compatible OpenAI) |
  | OpenRouter (`openrouter.js`) | `https://openrouter.ai/api/v1/chat/completions` | idem OpenAI | idem | idem ; identifiant `éditeur/modèle` transmis tel quel |
  | Google (`google.js`) | `https://generativelanguage.googleapis.com/v1beta/models/<modèle encodé>:generateContent` | `x-goog-api-key` (jamais `?key=`) | `generationConfig.maxOutputTokens` | `candidates[0].content.parts[].text` concaténés, parts de réflexion (`thought: true`) exclues (vide si réponse bloquée : refus) ; `usageMetadata.promptTokenCount` / `candidatesTokenCount` + `thoughtsTokenCount` |
  | Ollama (`ollama.js`) | `http://localhost:11434/api/chat`, `stream: false` | aucune — une clé saisie n'est pas envoyée | `options.num_predict` | `message.content` ; `prompt_eval_count` / `eval_count` |

  Toute réponse non 2xx devient une `ProviderError` (`errors.js` :
  `status`, `retryable`, `provider`), de message « <fournisseur>: HTTP
  <code> — <détail> », le détail étant lu dans `error.message`, `error` ou
  `message` du corps JSON (rien si le corps n'est pas du JSON) ; elle n'est
  réessayable (`retry.js`) que pour 429, ≥ 500 et l'erreur réseau
  (`status` 0, « <fournisseur>: erreur réseau (…) »). Un `200` au corps non
  JSON donne une `ProviderError` non réessayable. Une réponse coupée par le
  budget de sortie ou la fenêtre de contexte (`max_tokens`, `length`,
  `MAX_TOKENS`, `model_context_window_exceeded`…) lève une
  `OutputTruncatedError` (`status` 200, jamais réessayée, usage de l'appel
  porté) : `extractDay` échoue la journée sur « réponse tronquée (budget de
  sortie atteint) — réduisez le texte de la journée » sans refaire l'appel,
  et le lanceur en compte l'usage. Ollama fait exception (A-06).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Texte des journées | Navigateur ; transite vers le fournisseur choisi (clé personnelle) ou via le proxy humanome sans conservation |
| Clé API personnelle | `localStorage` par défaut ; serveur seulement sur opt-in (chiffrée, ADR-004) ; jamais dans une URL |
| Checkpoints, journal de run | IndexedDB `humanome-runs` |
| Cartographies | IndexedDB `humanome-cartographies`, visibilité `privee` |
| Usage du service humanome | Compteurs journaliers (`llm_usage_daily`) ; empreinte du défi consommé (`llm_pow_challenges`) ; seau de quota haché |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/EspaceView.jsx` | Session, dispatch de `#/espace/nouveau-run` |
| Front | `web/src/components/RunWizard.jsx` ; `web/src/components/ReferentielChoice.jsx` | Assistant en 5 étapes, choix du référentiel publié (A7), exécution, enregistrement ; étapes 3 et 4 réduites en mode simple (A8) |
| Front | `web/src/lib/ui-mode.js` — `useUiMode` | Mode d'affichage fourni par le shell (A8, UC-VIS-06) |
| Front | `web/src/data/referentiel.js` — `loadPublishedReferentiel`, `listPublishedReferentiels` | RESPIRE publié (repli embarqué) ou le référentiel choisi, liste des référentiels publiés : la base par l'API publique d'abord, l'export statique en repli (S5) |
| API | `api/src/routes/referentiel.php` — `GET /referentiels`, `GET /referentiels/{id}/versions/{semver}` | Référentiels publiés et document d'une version publiée, publics, en lecture seule (A7) |
| Front | `web/src/lib/run-launcher.js` — `computeDayGroups`, `fetchPromptPackages`, `buildEstimate`, `createProviderBundle`, `makeRunId`, `executeRun`, `buildLocalNarratives`, clés locales et synchronisation | Logique non-UI du lancement, résumés locaux du merge, validation de la fusion (schéma puis conformité) |
| Front | `web/src/lib/demo-llm.js` — `createDemoProvider`, `describeDemoError` ; `web/src/lib/pow.js` | Service humanome : défi, preuve de travail, messages |
| Front | `web/src/lib/carto-store.js` (via `carto-store-bridge.js`) | Enregistrement local des résultats |
| Moteur | `engine/src/pipeline/extract.js` — `extractDay` ; `engine/src/conformite.js` — `validateDocumentPourReferentiel` | Un appel par pôle du référentiel + kairos, validation (schéma puis conformité), nouvel essai (jamais sur une réponse tronquée) |
| Moteur | `engine/src/conformite.js` ; `engine/src/referentiel.js` — `nomCourtReferentiel`, `codesExemples` ; `engine/src/providers/estimate.js` — `callsPerDayFor`, `mergeNarrativeCallsFor` | Conformité au référentiel ; nom et codes d'exemple des prompts ; nombre d'appels par référentiel |
| Moteur | `engine/src/runs/run.js`, `journal.js`, `memory.js`, `indexeddb.js` | Checkpoints, échec, interruption, reprise, journal |
| Moteur | `engine/src/pipeline/merge.js`, `merge-document.js` ; `engine/src/validation.js` | Fusion chronologique, document merge, schémas |
| Moteur | `engine/src/pipeline/narrative-prompts.js` — `formatDateFr` ; `buildNarrativePrompts` (`buildCompetencePrompt`, `buildPolePrompt`, `buildKairosPrompt`, `formatFixed2`) | Date « JJ/MM/AAAA » de l'en-tête des prompts d'extraction (importé par `extract.js`, étape 6) ; les prompts de récits de fusion (69 pour RESPIRE v7), comptés par l'estimation (RG6) mais non envoyés en v1 (étape 7, Limites) |
| Moteur | `engine/src/providers/index.js` — `createProvider`, `SUPPORTED_PROVIDERS` ; `retry.js`, `errors.js` — `ProviderError` ; `mock.js`, `estimate.js` | Sélection de l'adaptateur, transports direct/proxy, erreurs typées, reprises, estimation |
| Moteur | `engine/src/providers/anthropic.js`, `openai.js` (+ `xai.js`, `openrouter.js`, compatibles OpenAI), `google.js`, `ollama.js` | Adaptateurs de la voie clé personnelle : URL, en-tête de clé, corps, extraction du texte et de l'usage (A1, RG9) |
| API | `GET /api/prompt-packages`, `/default`, `/{id}/{version}` — `api/src/routes/packages.php` | Versions de prompt proposées |
| API | `GET /api/llm/challenge`, `POST /api/llm` — `api/src/routes/llm.php` | Proxy du service humanome |
| Domaine | `api/src/Packages/PromptPackageRepository.php`, `SettingsRepository.php` | Versions publiques, défaut validé |
| Domaine | `api/src/Llm/PowChallenge.php`, `MockProvider.php`, `UsageCounters.php`, `Pricing.php` | Preuve de travail, fournisseur mock, compteurs, coût |
| Domaine | `api/src/Llm/DemoConfig.php`, `api/src/Auth/RateLimiter.php` | Configuration du service (interrupteur, plafonds, quota), quota horaire par IP à délai progressif (RG5, E5) |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-APP-02-U01 | `estimateRun` | 3 journées : 93 appels, tokens, coût, durée ; modèle inconnu refusé (RG6) | `engine/test/usecases/unit/uc-app-02-lancer-cartographie-standard.test.js` |
| UC-APP-02-U02 | `extractDay` | 7 pôles puis kairos, texte du jour dans chaque prompt, document valide | idem |
| UC-APP-02-U03 | `extractDay` | Un nouvel essai par pôle ; kairos en échec → `null` (RG2) | idem |
| UC-APP-02-U04 | `extractDay` | Pôle en échec deux fois → erreur contextualisée (E4) | idem |
| UC-APP-02-U05 | `createRun` | Checkpoint par journée, journal, fusion des 3 journées (RG4) | idem |
| UC-APP-02-U06 | `createRun` | Journée en échec persistée ; reprise limitée à celle-ci (E4) | idem |
| UC-APP-02-U07 | `createRun` | Moteur seul : interruption coopérative entre journées (A4 ; l'abandon de l'appel en cours est vu par F05/F06) | idem |
| UC-APP-02-U08 | `createIndexedDbStorage` + `createRun` | Base `humanome-runs` relue après rechargement (A5) | idem |
| UC-APP-02-U09 | `mergeDays`, `buildMergeDocument` | 3 journées → merge valide ; 2 journées → pôle vide, invalide (A6, RG7) | idem |
| UC-APP-02-U10 | `createProvider` (direct) | Appel direct, clé en en-tête seulement (A1) | idem |
| UC-APP-02-U11 | `createProvider` (proxy) | Transport proxy générique du moteur (politique par défaut, non utilisée par le Service humanome) : pas de clé, 429 réessayé après `Retry-After`, 413 jamais | idem |
| UC-APP-02-U12 | `computeDayGroups` | Vrai découpage : préambule non daté ignoré, tri ; textes d'une même date concaténés | `web/test/usecases/unit/uc-app-02-lancer-cartographie-standard.test.js` |
| UC-APP-02-U13 | `makeRunId` | Identifiant stable portfolio + version de prompt + version du référentiel (RG3) | idem |
| UC-APP-02-U14 | `fetchPromptPackages` | Ordre des appels, embarqué (1.1.0) en tête sans doublon de sa copie publiée, 1.0.0 publiée proposée, défaut marqué | idem |
| UC-APP-02-U15 | `createProviderBundle` | Service humanome (modèle imposé), clé requise sauf Ollama | idem |
| UC-APP-02-U16 | `setLocalKey`, `readLocalKeys` | `humanome-keys` : mémoriser, effacer, JSON corrompu toléré | idem |
| UC-APP-02-U17 | `syncKeyToServer`, `fetchKeyFromServer` | `PUT api/keys`, `GET api/keys/{fournisseur}` ; clé absente = 404 du serveur, message propagé ; garde défensive `{apiKey: ''}` | idem |
| UC-APP-02-U18 | `createDemoProvider`, `pow.js` | Un défi par appel, nonce satisfaisant la difficulté (sha256 recalculé), pot de miel joint (RG5) | idem |
| UC-APP-02-U19 | `describeDemoError` | 429 → minutes, 503 → épuisé, autre → détail | idem |
| UC-APP-02-U20 | `buildEstimate` | Modèle de référence du service, coût inconnu, surcharges | idem |
| UC-APP-02-U21 | `executeRun` + `createIndexedDbStorage` | Checkpoints persistés, reprise sur nouvel onglet, compteurs de session ; merge à résumés locaux (étape 7) | idem |
| UC-APP-02-U22 | `PowChallenge` | Format, TTL 5 min, OK / WEAK / EXPIRED / INVALID | `api/tests/UseCases/Unit/UcApp02LancerCartographieStandardTest.php` |
| UC-APP-02-U23 | `MockProvider` | Prompt de pôle/kairos → JSON de la fixture du jour | idem |
| UC-APP-02-U24 | `UsageCounters`, `Pricing` | Compteurs seuls, disjoncteur tokens/budget, jour UTC | idem |
| UC-APP-02-U25 | `PromptPackageRepository`, `SettingsRepository` | Versions publiées et publiques seulement ; dernière publiée tous paquets confondus ; lecture/écriture du réglage (la décision réglage > plus récente est testée par F14) | idem |
| UC-APP-02-U26 | `createDemoProvider` | Aucune reprise sur quota 429 ni sur 503 : 1 défi, 1 POST (RG5) | `web/test/usecases/unit/uc-app-02-lancer-cartographie-standard.test.js` |
| UC-APP-02-U27 | `createDemoProvider` | Une seule reprise après 2,5 s avec un défi neuf sur 502, erreur réseau, `pow_reused`, `pow_expired` ; pas de seconde reprise (RG5) | idem |
| UC-APP-02-U28 | `createProvider`, `SUPPORTED_PROVIDERS` | 6 fournisseurs ; clé exigée en direct sauf Ollama ; fournisseur, transport, `model` ou `prompt` invalides refusés sans aucun envoi (E3, RG9) | `engine/test/usecases/unit/uc-app-02-fournisseurs-cle-personnelle.test.js` |
| UC-APP-02-U29 | `openai.js` | URL, `authorization: Bearer`, messages system/user, `max_tokens` ; texte, usage, modèle, arrêt normalisé (`stop` → `end`) ; réponse vide → `''`, 0 et arrêt `null` (A1, RG9) | idem |
| UC-APP-02-U30 | `xai.js`, `openrouter.js` | Même format compatible OpenAI, URL propre ; modèle `éditeur/modèle` transmis tel quel (RG9) | idem |
| UC-APP-02-U31 | `google.js` | Modèle encodé dans le chemin (pas d'injection de paramètre), `x-goog-api-key` jamais en `?key=`, `generationConfig` ; parties concaténées, `usageMetadata` (réflexion comptée en sortie depuis le 2026-10-22), `modelVersion` ; réponse bloquée → texte vide, arrêt `refusal` | idem |
| UC-APP-02-U32 | `ollama.js` | `localhost:11434/api/chat` sans en-tête de clé (une clé saisie n'est pas envoyée), `stream: false`, `num_predict` ; compteurs Ollama (RG9) | idem |
| UC-APP-02-U33 | `ProviderError` (`errors.js`) | 401 OpenAI, 400 Google, 404 Ollama, 403 non JSON (xAI) : message et détail par format d'API, non réessayés ; `200` non JSON refusé (E7) | idem |
| UC-APP-02-U34 | `retry.js` via `createProvider` | 429 + `Retry-After` ; 503 : 3 essais, attentes 250 puis 500 ms ; réseau (status 0) ; `Retry-After` d'1 h plafonné à 5 min ; interruption pendant une attente de `Retry-After` déjà en cours (attente réelle abandonnée aussitôt, aucun 2e envoi), signal transmis à `fetch` (A1, A4) | idem |
| UC-APP-02-U35 | `extractDay` + transport direct | Journée nominale sur Gemini (8 requêtes, document valide) ; 503 persistant → 6 requêtes au pôle 1 puis échec contextualisé ; 401 → 2 requêtes (A1, E4, E7) | idem |
| UC-APP-02-U36 | Adaptateurs directs, `extractDay` (anomalie A-06, corrigée en partie) | Fin par budget de sortie (`max_tokens`, `length`, `MAX_TOKENS`) → `OutputTruncatedError` (un appel, usage porté), en direct comme en proxy ; journée tronquée → « réponse tronquée », sans second appel ; **comportement actuel** : Ollama (`done_reason: length`) rend encore le fragment | idem |
| UC-APP-02-U37 | `formatDateFr` via `extractDay` | Les 8 prompts d'une journée portent « # Feuille de portfolio du 07/01/2026 (2026-01-07) » une seule fois (étape 6) | `engine/test/usecases/unit/uc-app-02-prompts-narratifs.test.js` |
| UC-APP-02-U38 | `buildNarrativePrompts` sur `mergeDays` | 3 journées → 69 prompts = `MERGE_NARRATIVE_CALLS` de l'estimation ; ordre compétences → pôles → kairos ; période, court-circuit, trace verbatim jointe, moyennes `formatFixed2` à deux décimales (égalité exacte au demi arrondie au demi pair : 0.625 → 0.62), rapports de pôle et synthèse kairos des journées (étape 7, RG6) | idem |
| UC-APP-02-U39 | `createProviderBundle` (mode clé) | Liste de l'écran = `SUPPORTED_PROVIDERS` ; pour chacun des 6 fournisseurs : modèle par défaut et budget de sortie (toute la sortie du modèle pour Anthropic, 8 192 pour les autres) au bon endpoint, dans le champ de l'API, clé dans l'en-tête attendu, rien vers humanome (A1, RG9) | `web/test/usecases/unit/uc-app-02-fournisseurs-cle-personnelle.test.js` |
| UC-APP-02-U40 | `anthropic.js` | `api.anthropic.com/v1/messages`, en-têtes exacts (`x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true`), `max_tokens`, `system` seulement s'il est fourni ; seuls les blocs de type `text` concaténés, usage, modèle et arrêt normalisé (`end_turn` → `end`) ; réponse vide → `''`, 0 et arrêt `null` (A1, RG9) | `engine/test/usecases/unit/uc-app-02-fournisseurs-cle-personnelle.test.js` |
| UC-APP-02-U41 | `buildEstimate`, `executeRun` (A7, A6, RG6, RG7) | Tout référentiel : estimation sur sa structure (5 pôles lettrés : 34 appels ; RESPIRE à six pôles : 7 par journée) ; 18 appels pour 3 journées, prompts qui le nomment, documents jour et fusion qui le nomment, un domaine par pôle ; un pôle sans compétence établie → fusion non constructible, message « chacun des pôles du référentiel » | `web/test/usecases/unit/uc-app-02-lancer-cartographie-standard.test.js` |

### Tests fonctionnels

Les scénarios IHM se jouent en mode expert, posé dans le navigateur avant le
montage (`humanome-mode`), sauf F29, qui rejoue le mode simple (A8).

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-APP-02-F01 | Nominal | IHM | `<App/>` : 5 étapes, estimation, 24 POST avec défis distincts, 3 jours + merge privés et tracés | `web/test/usecases/functional/uc-app-02-lancer-cartographie-standard.test.jsx` |
| UC-APP-02-F02 | A1 | IHM | 24 appels directs à Anthropic ; clé vers humanome uniquement par `PUT api/keys` (CSRF, réponse 204) ; `localStorage` | idem |
| UC-APP-02-F03 | A2 | IHM | Bandeau copie statique, version embarquée seule, synchronisation désactivée | idem |
| UC-APP-02-F04 | A3 (anomalie A-01) | IHM | Version publiée tracée ; paquet publié jamais téléchargé, 1er prompt = prompt du moteur embarqué ; défaut serveur ni présélectionné ni signalé | idem |
| UC-APP-02-F05 | A4 | IHM | Interruption en journée 2, reprise : 16 appels, journée 1 sautée | idem |
| UC-APP-02-F06 | A5 | IHM | Démontage (rechargement) : signal de la requête en cours abandonné ; reprise depuis IndexedDB | idem |
| UC-APP-02-F07 | A6 | IHM | 2 journées : documents jour seuls, note de fusion | idem |
| UC-APP-02-F08 | E1 | IHM | Aucun portfolio : lien `#/portfolio`, « Continuer » inactif | idem |
| UC-APP-02-F09 | E2 | IHM | Portfolio sans journée datée signalé, « Continuer » inactif | idem |
| UC-APP-02-F10 | E3 | IHM | Clé vide bloquante ; Ollama sans clé | idem |
| UC-APP-02-F11 | E4 (anomalie A-04) | IHM | Journée en échec listée, rien enregistré ; reprise = 8 appels de cette journée ; **comportement actuel** des indicateurs de progression et de reprise | idem |
| UC-APP-02-F12 | E5 | IHM | Démo désactivée (503) au défi initial : message dédié, aucun POST, « Reprendre le run » | idem |
| UC-APP-02-F13 | E5 (anomalie A-02) | IHM | **Comportement actuel** : 503 en cours de run → détails techniques, 6 appels | idem |
| UC-APP-02-F14 | Nominal (étape 3) | API | Versions publiées, défaut (réglage/plus récente/404), document, lecture publique | `api/tests/UseCases/Functional/UcApp02LancerCartographieStandardTest.php` |
| UC-APP-02-F15 | Nominal (étape 6) | API | Une journée = 8 appels avec défi, JSON pôle/kairos, compteurs sans contenu | idem |
| UC-APP-02-F16 | E5 | API | Preuve absente → 400 ; défi réutilisé → 429 + `Retry-After` | idem |
| UC-APP-02-F17 | E5 | API | Quota IP → 429 ; budget épuisé → 503 ; démo coupée → 503 | idem |
| UC-APP-02-F18 | E5 | API | Journée trop longue → 413, aucun défi ni compteur consommé | idem |
| UC-APP-02-F19 | A5 (anomalie A-03) | IHM | **Comportement actuel** : relance après modification → aucun appel, anciens documents ré-enregistrés en double | `web/test/usecases/functional/uc-app-02-lancer-cartographie-standard.test.jsx` |
| UC-APP-02-F20 | E5 (anomalie A-02) | IHM | **Comportement actuel** : quota 429 sur `POST api/llm` à partir du 9e appel → journée 1 checkpointée, journées 2 et 3 en échec « HTTP 429 », 12 appels | idem |
| UC-APP-02-F21 | A1 | IHM | Clé pré-remplie depuis `localStorage`, « Récupérer la clé depuis le serveur » ; sans synchronisation : aucun `api/keys`, aucune clé dans une requête vers humanome | idem |
| UC-APP-02-F22 | E6 | IHM | `PUT api/keys` → 422 : message du serveur, aucun appel au fournisseur, « Reprendre le run » | idem |
| UC-APP-02-F23 | A2 | IHM | API en erreur 5xx JSON : bandeau « non connecté », version embarquée seule, synchronisation et récupération indisponibles | idem |
| UC-APP-02-F24 | E5 (anomalie A-05) | API | **Comportement actuel** : quota par défaut (20/h) → un run de 3 journées bloqué au 21e appel, `Retry-After` 30/60/120/240 | `api/tests/UseCases/Functional/UcApp02LancerCartographieStandardTest.php` |
| UC-APP-02-F25 | E7 | IHM | Clé personnelle refusée (`401` d'Anthropic) : 2 requêtes par journée (aucune reprise du transport, nouvel essai d'`extractDay`), 6 au total ; les 3 journées listées en échec « extractDay : pôle 1 (…) — anthropic: HTTP 401 — invalid x-api-key » ; aucun appel à `api/llm`, rien d'enregistré | `web/test/usecases/functional/uc-app-02-lancer-cartographie-standard.test.jsx` |
| UC-APP-02-F26 | A7 | IHM | Index des référentiels publiés : « Référentiel » propose RESPIRE (défaut) et un référentiel lettré ; choisi, il est chargé ; estimation 34 appels ; 18 POST dont les prompts le nomment ; 3 jours + fusion enregistrés avec `referentiel: {id, version}`, documents nommés, 5 domaines ; checkpoints sous l'identifiant qui l'inclut | `web/test/usecases/functional/uc-app-02-lancer-cartographie-standard.test.jsx` |
| UC-APP-02-F27 | A7 | IHM | Référentiels publiés en base, absents de l'export statique : `GET api/referentiels` (rangés par identifiant) → RESPIRE en tête et par défaut, le lettré proposé ; choisi, il est lu par `GET api/referentiels/fictif-lettre/versions/1.0.0` ; estimation 34 appels ; aucun fichier statique du lettré demandé | idem |
| UC-APP-02-F28 | A7 | IHM | Base sans RESPIRE publié (`GET api/referentiels` ne rend que le lettré) : le menu le montre et le présélectionne, l'assistant le charge (`GET api/referentiels/fictif-lettre/versions/1.0.0`) → estimation 34 appels, pas celle de RESPIRE embarqué | idem |
| UC-APP-02-F29 | A8 | IHM | Mode simple (apprenant, aucun choix stocké), une autre version publiée par le serveur : étape « Référentiel » (liste des étapes et titre), ligne du protocole embarqué, aucun bouton de version, choix du référentiel offert ; clé personnelle sans champ « Modèle » ; 24 appels directs au modèle par défaut (`claude-sonnet-4-6`) ; 3 jours + fusion enregistrés avec `aurora-v3-reconstruit@1.1.0` et ce modèle ; mode jamais écrit par l'assistant | idem |

### Tests existants liés (non-régression)

- `web/src/components/RunWizard.test.jsx` — étapes, estimation (le Service humanome au tarif de Haiku 5.5, RG6), exécution et reprise (coutures injectées) ; mode simple (A8) et mode expert sous `UiModeContext`.
- `web/src/lib/run-launcher.test.js` — groupes de journées, estimation, paquets, clés, `executeRun` sur stockage mémoire.
- `web/src/lib/demo-llm.test.js`, `web/src/lib/pow.test.js` — défi, preuve de travail, messages.
- `engine/src/runs/run.test.js`, `journal.test.js`, `storage.test.js` — machine à états, journal, adaptateurs.
- `engine/src/pipeline/extract.test.js`, `merge.test.js`, `merge-document.test.js`, `narrative-prompts.test.js` (gabarits sur mini-données, arrondi `formatFixed2` au demi pair).
- `engine/src/integration.test.js` — pipeline bout-en-bout sur mock, **avec** les 69 récits de fusion (`buildNarrativePrompts`), chemin que l'assistant v1 n'emprunte pas.
- `scripts/parity/parity-prompts.mjs` — parité des 69 prompts narratifs avec l'oracle `assets-existants/merge-prototype/intermediate/prompts/` (lancement manuel, hors CI : lit `assets-existants/`).
- `engine/src/providers/index.test.js` (requêtes et réponses de chaque adaptateur, proxy, erreurs, reprises, validation), `mock.test.js`, `retry.test.js`, `estimate.test.js` ; `engine/src/validation.test.js`.
- `api/tests/LlmProxyTest.php`, `LlmPowTest.php`, `LlmMockProviderTest.php`, `PackagesDefaultTest.php`, `PackagesTest.php`.
- `web/e2e/parcours-apprenant.e2e.js` — étapes « Lancement du run » (en mode simple : ligne du protocole embarqué, A8) et « Run complet » (24 appels mock, navigateur réel).

### Exécuter

```sh
(cd api && vendor/bin/phpunit --filter UcApp02 --testdox)
cd web && npx vitest run test/usecases --testNamePattern UC-APP-02
cd engine && npx vitest run test/usecases --testNamePattern UC-APP-02
```

## Anomalies constatées

- **A-01 — Version par défaut du serveur ignorée par l'assistant.**
  `fetchPromptPackages` interroge `GET api/prompt-packages/default` et marque
  la version correspondante (`defaut: true`), mais `RunWizard` ne lit jamais
  ce marqueur : l'embarqué `aurora-v3-reconstruit@1.1.0` reste présélectionné
  et la version validée par l'administrateur n'est ni cochée ni signalée.
  Figé par F04.
- **A-02 — Quota ou épuisement du service en cours de run.** Un `429`/`503`
  de `POST api/llm` n'est pas traduit par `describeDemoError` (réservé aux
  échecs hors journée, comme le défi initial — qui ne peut renvoyer que
  `503`) : chaque journée échoue avec le détail technique (« extractDay :
  pôle 1 (…) — anthropic: HTTP 503 — Démo épuisée… », « … HTTP 429 — Quota
  horaire atteint… »), et le run **continue d'appeler** le proxy pour toutes
  les journées restantes (un essai + un nouvel essai d'`extractDay` par
  journée), alors que `demo-llm.js` désactive volontairement les reprises
  automatiques sur quota. Sur quota, chaque appel refusé allonge encore le
  `Retry-After` (30 s × 2^excès, jusqu'à 1 h). Figé par F13 (503) et F20 (429).
- **A-03 — Checkpoints jamais purgés : relance sans recalcul.** L'identifiant
  de run ne dépend que du portfolio et de la version
  (`portfolioId::paquet@version`), et les checkpoints de `humanome-runs` ne
  sont jamais effacés. Relancer après avoir **modifié le texte** du portfolio
  reprend les anciens checkpoints : aucune journée n'est recalculée, et les
  anciens documents sont ré-enregistrés, **en double**, dans le carto-store.
  Figé par F19.
- **A-04 — Indicateurs de progression faux après une journée en échec.**
  `RunWizard.jsx` calcule le numéro de journée affiché à partir du nombre de
  journées **terminées** (`Math.min(daysDone + 1, …)`, `resumedFrom + 1`) au
  lieu de la position de la journée (`dayInfo.position`, pourtant transmise
  par `executeRun`). Après l'échec de la journée 2, la journée 3 s'affiche
  « Journée 2/3 (2026-01-07) » ; à la reprise (journées 1 et 3 checkpointées),
  l'écran annonce « Repris à la journée 3/3 : les 2 journée(s)… » et
  « Journée 3/3 (2026-01-06) » alors que c'est la journée 2 qui est refaite.
  Figé par F11.
- **A-05 — Quota par défaut incompatible avec un run standard, sans
  avertissement.** Avec la configuration livrée (`perIpPerHour` = 20 dans
  `api/config/demo.php` ; 40 dans l'environnement de la production en juillet)
  et 8 `POST /api/llm` par journée, le Service humanome ne peut pas mener au
  bout un run de plus de 2 journées (5 avec 40/h) dans l'heure : le 21e appel reçoit un `429`, la
  journée échoue et le run continue d'appeler le proxy (A-02), chaque refus
  allongeant le délai. L'assistant n'en tient pas compte (l'estimation
  annonce 93 appels pour 3 journées sans avertissement) ; seul
  `DEMO_PER_IP_PER_HOUR` relève le quota, en développement (500 dans `.env.dev`). Figé côté
  API par F24.
- **A-06 — Troncature non signalée en mode clé personnelle.** `extractDay`
  échoue « bruyamment » quand l'appel s'est arrêté sur le budget de sortie
  (`stopReason === 'max_tokens'` → « réponse tronquée (budget de sortie
  atteint) — réduisez le texte de la journée »), et le transport proxy relaie
  ce `stopReason` ; mais aucun adaptateur direct (`anthropic.js`,
  `openai.js` et ses dérivés, `google.js`, `ollama.js`) ne le remonte :
  `stop_reason: 'max_tokens'`, `finish_reason: 'length'`,
  `finishReason: 'MAX_TOKENS'` et `done_reason: 'length'` sont ignorés (le
  worker serveur, lui, traduit `length` en `max_tokens` dans
  `api/src/Worker/OpenAiCompatibleProvider.php`). Sur une réponse de pôle
  tronquée, le filet de `parseExtractionResponse` retient le plus grand objet
  complet qu'il y trouve (dans le cas figé, une compétence, sans tableau
  `competences`) et la journée échoue après le même nombre d'appels, mais
  avec un message trompeur (« réponse sans tableau competences (objet
  code/…) ») au lieu de la consigne de réduire le texte. Figé par U36.
  **Corrigé en partie le 2026-10-22** (`docs/contrats.md` §4 point 14) : les
  adaptateurs Anthropic, OpenAI, xAI, OpenRouter et Google lisent l'arrêt et
  lèvent une `OutputTruncatedError` ; `extractDay` dit « réponse tronquée »
  sans refaire l'appel. Reste Ollama : aucune valeur de `done_reason` n'est
  vérifiée sur sa documentation officielle, son arrêt vaut `other` et une
  réponse coupée y passe encore pour un fragment (U36).

## Limites

- v1 : la version de prompt choisie est enregistrée mais **non exécutée** ;
  le protocole embarqué (Aurora v3 reconstruit) tourne toujours (annoncé à
  l'étape 3). Avec un autre référentiel que RESPIRE à sept pôles, la version
  enregistrée peut donc être une version publiée dont les gabarits ne le lisent
  pas (`aurora-v3-reconstruit@1.0.0`, qui écrit RESPIRE en toutes lettres et que
  le serveur refuse pour un autre référentiel, `PromptRunner::referentielRefusal`) :
  ce qui a tourné est le moteur embarqué, qui le lit. Les récits narratifs de fusion sont remplacés par des résumés
  locaux, alors que l'estimation compte les 69 appels correspondants
  (« estimation haute », annoncée). Le moteur sait pourtant produire ces
  69 prompts (`buildNarrativePrompts`, vérifié par U38, et exercé de bout en
  bout sur mock par `engine/src/integration.test.js`) ; hors du moteur, seuls
  des scripts s'en servent : `scripts/parity/parity-prompts.mjs` (les
  69 prompts, parité) et `scripts/build-default-prompt-package.mjs` (un
  exemple de chaque gabarit via `buildCompetencePrompt`, `buildPolePrompt`,
  `buildKairosPrompt`, voir UC-PRO-01).
- Voie clé personnelle : les tests simulent `fetch` (aucun appel réel). Ni
  le contrat des API réelles, ni le CORS des appels navigateur (U40 vérifie
  seulement l'envoi de l'en-tête `anthropic-dangerous-direct-browser-access`
  d'Anthropic, pas son acceptation ; origines admises par un serveur Ollama
  local), ni le contenu mixte ne sont vérifiés ici.
  Un point reste à confronter aux API réelles : le corps OpenAI utilise
  `max_tokens`, que les modèles de raisonnement récents d'OpenAI peuvent
  refuser au profit de `max_completion_tokens` (sans effet sur le modèle par
  défaut `gpt-4o-mini`). Les jetons de réflexion de Gemini
  (`thoughtsTokenCount`) sont comptés en sortie depuis le 2026-10-22 (U31).
- `GET /api/prompt-packages/{id}/{version}` n'est pas appelé par l'assistant
  (il sert à l'archive, UC-APP-06, et à l'atelier promptologue).
- Le repli « télécharger le résultat (JSON) » de l'assistant ne s'affiche que
  si le module carto-store est absent du bundle : chemin mort dans la version
  livrée, non testé.
- Service humanome : une journée dont le texte dépasse `maxInputChars` moins
  le gabarit du prompt d'extraction (8 300 à 8 600 caractères selon le pôle,
  soit ≈ 1,99 million de caractères de texte avec les 2 000 000 par défaut,
  ≈ 11,5 k avec 20 000) échoue en `413` à chaque
  pôle ; l'assistant ne le vérifie pas avant le lancement (le `413` lui-même
  est testé par F18).
