# ADR-012 — Twin9 multi-fournisseur : chaque étape choisit son fournisseur

## Statut

Accepté — 2026-10-22 (plan P1-5 « multi-fournisseur » du propriétaire). Amende l'ADR-010
(§2 et §4) et l'ADR-011 (§3, et §5 pour l'accord).

Deux choix sont des défauts proposés, à confirmer par le propriétaire : la garde RGPD, qui
**bloque** un fournisseur étiqueté « non » tant que l'administrateur ne l'a pas ouvert,
plutôt que de seulement exiger l'accord ; le refus de la clé personnelle hors Anthropic, qui
ne se lève qu'après une vérification par fournisseur consignée dans un amendement.

## Contexte

L'ADR-011 §3 n'envoie les appels de Twin9 qu'à Anthropic, à l'adresse verrouillée de
l'ADR-010 §2 ; l'ADR-010 §4 n'expose pas le « roster multi-fournisseurs » de Twin9. Le
propriétaire veut pouvoir confier une étape ou un lecteur à un autre fournisseur (OpenAI,
Mistral AI, Google Gemini, xAI, OpenRouter), pour comparer les modèles et diversifier le
collège, sans multiplier le code à entretenir.

Trois contraintes cadrent la décision :

- **Le secret des gabarits** (ADR-010 §2) : un prompt rendu contient les gabarits et les fiches.
  Le titulaire d'une clé chez un fournisseur peut, selon les réglages de son compte, relire ce
  qui est envoyé avec elle.
- **Le RGPD** : le portfolio de l'apprenant part chez chaque fournisseur appelé. Le comparatif des
  plateformes (recherche de juillet 2026, ce n'est pas un avis juridique) étiquette les
  fournisseurs `oui`, `sous_conditions` ou `non`.
- **L'hébergement** (ADR-011 §2) : des tranches de 45 s au plus. Seul Anthropic a ici une voie
  par lots ; les autres fournisseurs partent en direct, dans la tranche.

Les faits d'API retenus ont été vérifiés sur les documentations officielles des six
fournisseurs, consultées le 2026-10-22 (liste en fin de document). Une valeur non confirmée par
la documentation est traitée comme inconnue.

## Décision

### 1. Six fournisseurs connus, ouverts par l'administrateur

Le registre `api/src/Twin9/Fournisseurs/Fournisseurs.php` connaît `anthropic`, `openai`,
`mistral`, `google`, `xai` et `openrouter`. Pour chacun : son libellé, son étiquette RGPD, son
adresse verrouillée, la variable d'environnement de la clé de l'instance, le motif de ses
identifiants de modèle et s'il a une voie par lots ici (Anthropic seul).

Un profil peut nommer chacun d'eux ; un run n'atteint que ceux que l'administrateur a ouverts :

- `twin9_fournisseurs_ouverts` : la liste des fournisseurs ouverts, `["anthropic"]` par défaut ;
- `twin9_fournisseurs_non_rgpd` : un fournisseur étiqueté `non` (Google, xAI, OpenRouter) ne
  figure dans la liste que si ce réglage vaut `true` ; `false` par défaut.

Ces deux réglages de la configuration Twin9 sont réservés à l'administrateur
(`docs/autorisations.md`). Un profil qui nomme un fournisseur fermé, ou sans sa clé d'instance,
s'enregistre, mais ne se lance pas, ni ne s'estime : « le fournisseur X n'est pas disponible sur
cette instance », un seul message pour les deux, pour que personne n'apprenne quelles clés
l'instance détient. La garde est revérifiée à l'ouverture de chaque tranche, où un run qu'elle ne
laisse plus passer est suspendu pour ce fournisseur, avec sa raison, et à la reprise d'un run, qui
est alors refusée avec le même message. Ouvrir un tiers suppose que le registre RGPD
et la politique de confidentialité le nomment : ils sont mis à jour dans le même changement que
l'ouverture possible des tiers.

### 2. Le profil nomme le fournisseur (amende l'ADR-011 §3)

- Les étages, les étapes, les lecteurs et le second ressort gagnent `fournisseur`, **sans valeur
  par défaut** : absent, il s'hérite — Anthropic pour un étage, son étage pour une étape,
  l'étage des lecteurs pour un lecteur. Un objet qui nomme un autre fournisseur que celui dont il
  hérite nomme aussi son modèle ; au second ressort, qui couvre des étapes des deux étages, tout
  fournisseur nommé demande son modèle.
- Le schéma admet tout identifiant de modèle de 80 caractères au plus ; l'API vérifie qu'il suit
  le motif de son fournisseur : `claude-…` chez Anthropic et nulle part ailleurs ; ni `/` ni `:`
  chez Google (le modèle est dans le chemin de la requête) ; chez OpenRouter, un slug
  `éditeur/modèle` **sans suffixe** `:` (ni `:free`, qui peut basculer vers un modèle payant ou
  vers des fournisseurs qui entraînent sur les données, ni `:online` et les autres variantes).
- La famille d'un lecteur devient facultative : absente, c'est son fournisseur, ou chez OpenRouter
  l'éditeur du modèle.
- L'effort et la réflexion sont des réglages d'Anthropic. Un appel qui part ailleurs n'a pas
  d'effort, pas même hérité de son étage. Son raisonnement suit l'entrée de la grille de
  l'instance pour ce modèle : le réglage le plus bas que l'administrateur y a nommé, à défaut le
  défaut du modèle, dont le pire cas compte alors le plafond de réflexion (§6).
- **Empreintes.** Un fournisseur nommé là où il s'hérite de toute façon ne change ni l'empreinte
  des réglages (mémoire de la carte), ni la signature des évaluations (prévisions) : un profil tout
  Anthropic garde les siennes, que des tests figent. Le second ressort garde toujours le
  fournisseur qu'il nomme : sur une étape d'un autre fournisseur que son étage, nommer celui de
  l'étage n'est pas en hériter, et deux profils dont les appels partent chez deux fournisseurs ne
  partagent jamais une empreinte.
- **Réglages du moteur.** Le `kind` d'un backend est le fournisseur de son étage, celui d'un
  lecteur son fournisseur résolu ; un profil Anthropic garde `anthropic` partout.

### 3. Une route par appel, des voies mixtes

- Un appel part **par lots** si et seulement si son fournisseur est Anthropic et que le profil a
  choisi `voie : "lots"` ; sinon, il part en direct. `voie` devient la voie des appels Anthropic,
  `lots` par défaut, y compris dans un profil mixte.
- Un run soumet au plus un lot par tranche, en tête de tranche, avant ses départs directs, avec
  tous les appels Anthropic connus et non soumis. Un run qui a une route directe est ouvert à
  chaque tick ; seul un run tout par lots attend son lot sans rejouer.
- Un run mixte n'est plus rapide que si des vagues entières partent en direct : il compte au moins
  autant de lots que de vagues contenant un appel Anthropic.
- **Arrêt différé.** Quand un run doit s'arrêter alors que des appels directs sont en vol, plus
  rien ne part ; on attend leur retour, ou la coupure de fin de tranche, on les journalise avec
  leur coût, puis le run s'arrête.
- Un appel tiers ne part pas si la tranche ne peut plus tenir la durée maximale déclarée pour son
  modèle : OpenRouter documente qu'une requête non streamée coupée par le client est facturée en
  entier, les autres fournisseurs ne disent rien. Les coupures sont comptées par fournisseur.
- Les suspensions se font par fournisseur, et pour la voie des lots : une clé OpenAI absente ne
  bloque pas un lot Anthropic. Après un refus de débit de la clé de l'instance, la pause vaut pour
  tous les runs de la tranche ; un run bloqué plus de 30 minutes sur un plafond tiers est arrêté,
  sa réserve libérée.

### 4. Une adresse verrouillée par fournisseur (amende l'ADR-010 §2)

- Chaque fournisseur a **une** adresse, constante du registre : ni paramètre, ni variable
  d'environnement, ni réglage d'administration. La clé ne voyage que dans un en-tête.
- Trois appelants : celui d'Anthropic (qui enveloppe l'appelant actuel), un appelant
  Chat Completions pour OpenAI, Mistral, xAI et OpenRouter — OpenAI passe par Chat Completions
  plutôt que Responses pour n'avoir qu'un appelant —, un appelant Gemini (`generateContent`).
  Le registre fournit, pour un fournisseur, le couple (appelant, clé) : une seule décision.
- Paramètres imposés, faute de quoi le titulaire de la clé ou un tiers garderait le contenu :
  `store: false` chez OpenAI (les complétions sont stockées par défaut pour les nouveaux comptes)
  et chez Gemini (le paramètre de requête l'emporte sur la journalisation du projet) ;
  `provider.data_collection: "deny"` et `allow_fallbacks: false` chez OpenRouter ; chez
  Anthropic, un en-tête `traceparent` non échantillonné sur toute requête, pour qu'un export
  OpenTelemetry « contenu complet » configuré sur le compte ne reçoive rien.
- Aucun texte venu d'un fournisseur ne sort dans une erreur : les messages sont construits par le
  code (ni `message.refusal`, ni `error.message`, ni `finishMessage`…), la valeur brute d'arrêt
  est assainie avant d'être gardée. La classe `OpenAiCompatibleProvider` du worker de masse, qui
  prend une adresse libre et recopie les erreurs du fournisseur, n'est ni réutilisée ni étendue.
- Une réponse 400 d'un tiers est une erreur de configuration : le run s'arrête, de façon
  différée, avec un message clair. Pas d'appel de vérification séparé.
- Une sortie tronquée est une panne, chez tout fournisseur (P0-2) ; chez Gemini, une réponse
  `CONTINUATION` aussi, comme une réponse 200 d'OpenRouter qui ne contient qu'une erreur.

Lignes ajoutées au modèle de menace de l'ADR-010 §2 :

| Menace | Parade |
|---|---|
| Une clé envoyée à l'hôte d'un autre fournisseur | adresse constante par fournisseur ; le registre rend le couple (appelant, clé) ; un test vérifie que chaque hôte reçoit sa clé factice et jamais une autre |
| Un fournisseur qui garde les prompts, ou les montre au titulaire de la clé | clés de l'instance seulement hors Anthropic (§5) ; `store: false`, `data_collection: "deny"`, `traceparent` non échantillonné |
| OpenRouter, agrégateur : un repli vers un autre modèle, ou un fournisseur amont qui garde les données | `allow_fallbacks: false`, `data_collection: "deny"`, slug sans suffixe ; étiquette `non`, fermé par défaut |
| La récitation d'un gabarit dans un texte de refus ou d'erreur du fournisseur | aucun texte du fournisseur ne sort ; libellés du code ; un test « canari » par appelant |
| La récitation d'un gabarit dans la sortie d'un modèle tiers | le filtre anti-fuite s'applique aux sorties de tout fournisseur, comme à celles d'Anthropic |

### 5. La clé personnelle : chez Anthropic seulement (amende l'ADR-010 §4)

Avec une clé personnelle, le titulaire du compte chez le fournisseur est l'utilisateur lui-même.
Selon le fournisseur, il peut relire ce qui part avec sa clé : journal des requêtes par clé chez
xAI, journal des entrées et sorties chez OpenRouter, journaux du projet chez Google AI Studio,
complétions stockées chez OpenAI. xAI et OpenRouter ne documentent aucune parade qu'une requête
puisse imposer. L'exigence 4 de l'ADR-010 (« impossible de sniffer nos prompts ») ne tient donc
pas hors d'Anthropic.

- Un profil à clé personnelle n'atteint qu'Anthropic : refusé à l'enregistrement (422) dès qu'un
  de ses appels part ailleurs, et refusé appel par appel au moment de lire la clé (fermé par
  défaut). Les autres fournisseurs ne servent qu'avec les clés de l'instance.
- Le roster multi-fournisseur est désormais exposé, avec ces seules clés.
- Avec une clé personnelle **Anthropic**, les résultats des lots restent visibles dans la Console
  de son titulaire ; le comportement ne change pas, le propriétaire en est informé.

### 6. Les prix des tiers

- La grille de l'instance s'indexe par `fournisseur:modele` pour les tiers ; l'identifiant reste
  nu pour Anthropic. Les prix des tiers sont saisis par l'administrateur : aucun n'entre dans le
  dépôt. Une entrée tierce porte aussi `plafond_sortie`, `plafond_reflexion` et `duree_max_s`,
  obligatoires ; le relevé quotidien des prix d'Anthropic ignore les clés à `:`.
- Le pire cas réservé avant l'envoi : en entrée, les octets du prompt et un surcoût fixe ; en
  sortie, le budget de sortie plus le plafond de réflexion — obligatoire et non nul chez xAI, dont
  le plafond de sortie ne compte pas le raisonnement, qui ne s'y coupe pas.
- Le solde d'un appel ne débite jamais plus que sa réserve : un excédent est journalisé, payé par
  l'instance et jamais par le solde de l'utilisateur ; le couple fournisseur:modèle est signalé à
  l'administrateur, son pire cas insuffisant (marque gardée avec les plafonds de son entrée de
  grille, signalée sur sa page), et refusé au lancement tant que ces plafonds n'ont pas changé
  (2026-10-22 : au-delà de la seule marque que demandait la spécification, la parade de la
  critique 2 n° 3 ; l'excédent ne pèse pas non plus sur le budget de l'utilisateur).

### 7. L'étiquette RGPD et l'accord (amende l'ADR-011 §5)

- Étiquettes : `oui` pour Mistral AI ; `sous_conditions` pour Anthropic et OpenAI ; `non` pour
  Google, xAI et OpenRouter. Elles figurent dans le registre, dans la configuration de chaque
  run, dans l'interface et dans l'accord.
- L'accord du lancement nomme les fournisseurs atteints, leur voie et leur étiquette. La page
  envoie la liste des fournisseurs acceptés ; le serveur la compare à ceux que les appels du run
  atteignent effectivement et refuse un écart ; la liste est gardée dans la configuration du run.
  Un booléen reste accepté pour un profil tout Anthropic.
- Gemini : la clé de l'instance doit être une clé de l'offre payante. Les conditions de Google
  n'autorisent que les services payants pour une application proposée à des utilisateurs de
  l'Espace économique européen, de Suisse ou du Royaume-Uni.

## Conséquences

Positives :

- Chaque étape, chaque lecteur, choisit son fournisseur ; le collège peut réunir plusieurs
  familles de modèles, comme le prévoit Twin9.
- Un profil tout Anthropic ne change pas : mêmes appels, mêmes lots, mêmes prix, mêmes
  empreintes ; sa mémoire et ses prévisions restent valables.
- Un seul appelant couvre quatre fournisseurs.

Négatives / à assumer :

- Les prix des tiers sont saisis à la main : une erreur de grille coûte à l'instance, jamais à
  l'utilisateur.
- La tranche de 45 s convient mal aux appels tiers longs : la garde de durée les retient, mais un
  modèle qui réfléchit longtemps peut ne jamais tenir dans une tranche.
- La parité avec l'oracle ne vaut que pour Anthropic : les autres fournisseurs n'ont ni lot ni
  oracle, et leurs réponses ne sont pas déterministes.
- Google classe désormais `generateContent` parmi ses API héritées, et xAI son Chat Completions :
  un appelant de plus pourra être nécessaire.
- La garde et les étiquettes ne sont pas un avis juridique ; le registre RGPD et la politique de
  confidentialité doivent suivre chaque ouverture.

Réversibilité : fermer un fournisseur, c'est le retirer de `twin9_fournisseurs_ouverts` ; ses
runs en cours sont suspendus à leur tranche suivante, et ses profils restent enregistrés.

Décisions liées : ADR-004, ADR-010, ADR-011.

## Documentations consultées (2026-10-22)

- OpenAI : référence Chat Completions, guides « reasoning », « token counting », « your data »,
  « rate limits », « error codes » (developers.openai.com).
- Mistral AI : spécification OpenAPI, guides « reasoning », « error glossary », « batch
  processing », « zero data retention » (docs.mistral.ai, help.mistral.ai).
- Google : référence `generateContent`, guides « thinking », « API errors », « billing »,
  « logs », conditions de l'API Gemini (ai.google.dev).
- xAI : référence Chat Completions, guides « reasoning », « rate limits », « cost tracking »,
  FAQ sécurité (docs.x.ai).
- OpenRouter : « provider selection », « model variants », « reasoning tokens », « errors and
  debugging », « streaming », « data collection », « input and output logging »
  (openrouter.ai/docs).
- Anthropic : référence Messages, « handling stop reasons », « batch processing », « data
  residency », « OpenTelemetry », « API and data retention » (platform.claude.com).
