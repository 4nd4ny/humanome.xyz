# Sécurité de la démo publique — modèle de l'abuseur (P6)

**Périmètre :** le proxy LLM plateforme (`POST /api/llm`, `GET /api/llm/challenge`,
`GET /api/llm/status`) et le proxy texte Google Docs (`GET /api/gdoc-text`) —
`api/src/routes/llm.php`, `api/src/Llm/**`, `api/config/demo.php`. Ce sont les
seules surfaces exposées **sans compte** (le visiteur est l'absence de session,
`docs/autorisations.md`). Tout ce qui passe par `POST /api/llm` partage les mêmes
gardes et le même budget du jour (1 $ par défaut depuis le 2026-10-21, visiteurs et
comptes confondus) : l'Essayer (UC-VIS-03), l'essai gratuit de la cartographie
ouverte (Twin6, UC-APP-09 A6), le « Service humanome » de l'assistant de
cartographie (UC-APP-02), le banc d'essai et la rétro-ingénierie du promptologue,
qui le choisissent par défaut. Le tuteur (UC-VIS-05) a son propre budget. Depuis le
2026-10-21, l'un et l'autre restent sur Haiku (Christian : « On garde Haiku pour les
démos. Sonnet et Opus disponibles uniquement pour les comptes ayant acheté
suffisamment de crédits API ou bien utilisant leur propre clé »), et la sortie d'un
appel de la démo n'est plus plafonnée (« Ok pour lever le plafond des tokens de
sortie. Du moment qu'un utilisateur ne dépense pas plus que le budget global alloué
au site »).

**Ce que veut l'abuseur :** vider le budget API de la plateforme, exfiltrer la
clé `ANTHROPIC_API_KEY`, contourner les quotas, ou faire tomber le service.

**Ce document** est organisé de son point de vue : pour chaque angle d'attaque,
la **défense** en place puis le **résidu accepté** (ce qui reste possible et
pourquoi on l'assume). Il rend compte de l'audit adversarial P6 : une faille
réelle trouvée et corrigée, cinq angles déjà couverts, résidus documentés.

## Pipeline de gardes (le moins cher d'abord)

`POST /api/llm` empile les gardes du moins coûteux au plus coûteux, pour rejeter
un abus avant de dépenser quoi que ce soit :

1. **Interrupteur** `DEMO_ENABLED` (503 immédiat).
2. **Honeypot** : champ caché `website` rempli → 400 banal, indistinguable d'une
   erreur de validation (aucun indice que c'est un piège).
3. **Taille d'entrée** : `system + prompt` ≤ `maxInputChars` (2 000 000 car. depuis
   le 2026-10-21, 420 000 le matin même, 20 000 avant : la synthèse de Twin6 porte les
   sorties des sept scans, qu'aucun plafond ne borne plus — des scans de 64 000 tokens
   y tiennent, UC-APP-09-U35) → 413. Ce n'est plus une garde du budget, que la
   réservation tient seule, mais une borne d'abus.
4. **Preuve de travail** (PoW) : défi signé HMAC, à usage unique, expirant.
5. **Quota par IP et par heure** (`perIpPerHour`, partagé avec gdoc-text).
6. **Coupe-circuit journalier global** : plafond de tokens ET de budget USD. Le
   **pire cas** de l'appel y est réservé, atomiquement, avant qu'il parte
   (2026-10-21, voir l'angle 6) — son entrée et toute la sortie que le modèle peut
   rendre — ; sans la place, 503, et rien n'est parti.
7. **Appel amont** avec fournisseur, modèle (un Haiku) et sortie (le maximum du
   modèle) **imposés serveur**, en flux (2026-10-21) : relayé à mesure au
   navigateur qui le demande (UC-VIS-03 RG6), le JSON de l'outil forcé à mesure
   qu'il s'écrit (`eager_input_streaming`). Un texte hors UTF-8 est refusé
   (422) avant la preuve et la réservation.
8. **Compteurs seulement** (RGPD §6) : la réservation devient l'usage réel (tokens
   in/out + coût estimé), jamais le contenu ; un refus du fournisseur, ou une
   requête qui ne lui est jamais parvenue, la rend ; un appel coupé en route
   (délai dépassé, erreur en cours de flux, navigateur parti) compte ce qu'il a
   pu produire — l'entrée annoncée par le fournisseur, les octets reçus plus
   1 024 tokens, toute la sortie quand ces octets ne bornent rien.

---

## Faille réelle trouvée et corrigée — contournement du quota par rotation IPv6 /64

**Sévérité : élevée.** Le bucket du quota par IP hachait l'adresse **entière** :
`'llm:' . hash('sha256', $remoteAddr)`. En IPv6, une allocation de routine est un
**/64 complet** (2^64 adresses — souvent un /56 ou /48). L'abuseur faisait donc
varier l'identifiant d'interface (`2001:db8:0:1::1`, `::2`, …) pour obtenir un
**quota neuf à chaque requête**.

Impact le plus fort sur **`GET /api/gdoc-text`** : cet endpoint n'a **ni preuve
de travail ni coupe-circuit journalier** — le quota par IP est son **seul**
plafond. La rotation IPv6 le transformait en **proxy ouvert non borné** (1 Mo par
requête, débit uniquement limité par la bande passante). Sur `POST /api/llm`, le
coupe-circuit budgétaire ($5/jour) restait un garde-fou, mais le quota par IP
était neutralisé.

**Correctif :** `api/src/ClientIp.php` — `ClientIp::bucketIdentity()` réduit toute
adresse IPv6 à son **préfixe réseau /64** avant hachage ; l'IPv4 reste par
adresse ; l'IPv6 mappée-IPv4 (`::ffff:a.b.c.d`) est traitée comme l'IPv4 sous-
jacente (et **non** comme un /64 tout-zéro, ce qui aurait fusionné tous les
clients mappés dans un seul bucket — un déni de service sur les utilisateurs
légitimes). La propriété RGPD est préservée : on hache toujours l'identité, aucun
IP brut ne touche la base (§6.5).

Le même défaut existait sur le limiteur d'authentification (`routes/auth.php` :
`register:` et `login:` — spam d'inscription / force brute par email). Corrigé
au passage avec le même helper.

**Démonstration (rouge → vert) :**
`LlmProxyTest::testIpv6QuotaCannotBeBypassedByRotatingWithinA64` — épuise le quota
sur `2001:db8:0:1::1`, puis prouve qu'une adresse sœur du même /64 reste bloquée
(échouait avant le correctif : `200` au lieu de `429`) et qu'un /64 différent
obtient bien un bucket neuf. Idem côté gdoc-text :
`LlmGdocTextTest::testGdocQuotaIsNotBypassedByRotatingWithinAnIpv6_64`. Logique du
bucketing couverte par `ClientIpTest` (dont le garde anti-sur-fusion IPv4-mappée).

---

## Angle 1 — Contourner la preuve de travail

**Ce que tente l'abuseur :** pré-calculer des défis en masse ; réutiliser un nonce
entre IP ; rejouer un défi résolu ; profiter d'une difficulté trop basse.

**Défense** (`api/src/Llm/PowChallenge.php`, `routes/llm.php`) :
- **Défi signé** `v1.<expire>.<aléa>.<hmac>` : l'abuseur ne peut pas forger de
  défi ni prolonger l'expiration (HMAC-SHA256 sur `POW_SECRET`).
- **Usage unique** appliqué à la rédemption : insertion de `sha256(challenge)`
  dans `llm_pow_challenges` (clé primaire) — un rejeu (même en concurrence) tombe
  sur une violation `23000` → `429 pow_reused`. Atomique, pas de TOCTOU.
- **Expiration vérifiée serveur** : `verify()` refuse `expires < now` (EXPIRED).
  La fenêtre post-purge est fermée : un défi purgé est déjà expiré, donc rejeté
  par `verify()` avant même l'insertion.
- **Nonce lié au défi** : le nonce est vérifié sur `sha256(challenge . ':' . nonce)`.
  Un nonce valide pour un défi ne vaut pour aucun autre → pas de réutilisation
  entre IP, d'autant que le défi est à usage unique **global** (pas par IP).

**Résidu accepté :**
- **Difficulté faible pour un attaquant natif.** 20 bits ≈ 1 s dans un navigateur,
  mais ≈ quelques millisecondes en code natif / GPU. La PoW **n'est pas** le garde
  principal : elle décourage les bots navigateur naïfs. Les vrais plafonds de
  budget sont le **quota par IP (/64)** et le **coupe-circuit journalier**.
  Augmenter la difficulté pénaliserait les usagers légitimes (8 appels × 1 s déjà).
- **Émission de défis non limitée** (`GET /api/llm/challenge`). Choix délibéré :
  l'endpoint est **sans état** (aucune écriture en base à l'émission). Le
  pré-calcul en masse est borné par le TTL de 2 min (≈ 120 défis résolubles par
  navigateur dans la fenêtre) et **la rédemption reste soumise au quota**. Ajouter
  un limiteur y introduirait une **écriture par requête** — un vecteur
  d'amplification pire que le coût CPU actuel. On assume le statu quo.

---

## Angle 2 — Contourner le quota par IP

**Ce que tente l'abuseur :** forger `X-Forwarded-For` ; faire tourner un /64 IPv6.

**Défense :**
- **`REMOTE_ADDR` seul fait foi.** Les en-têtes de forwarding fournis par le
  client (`X-Forwarded-For`, `X-Real-IP`, …) sont **ignorés** (`routes/llm.php`,
  `routes/auth.php`). Sur OVH mutualisé, derrière l'IPLB OVH, `REMOTE_ADDR` porte
  déjà l'IP client réelle : c'est la source correcte. Forger un en-tête ne
  déplace pas le bucket.
- **Bucketing IPv6 /64** (voir la faille corrigée ci-dessus). La rotation
  d'interface au sein d'un /64 partage désormais un seul bucket.

**Résidu accepté :**
- **Un détenteur de /48 dispose encore de 65 536 buckets /64.** Pour `POST /api/llm`,
  le **coupe-circuit journalier** (1 $ et 6 M tokens par défaut depuis le
  2026-10-21) reste le plafond dur — un
  abuseur bien doté vide au pire le budget du jour, ce qui est précisément le rôle
  du coupe-circuit. Pour **gdoc-text** (pas de coupe-circuit journalier), il reste
  un **résidu de DoS de bande passante** proportionnel au nombre de /64 détenus ;
  bornage plus fin (par /48, ou plafond journalier gdoc) reporté à P12 si l'abus
  se matérialise.

---

## Angle 3 — Amplifier le coût par requête

**Ce que tente l'abuseur :** injecter un `provider` / `model` cher, un `maxTokens`
géant, un prompt système énorme, une entrée massive.

**Défense :**
- **Fournisseur, modèle et sortie imposés serveur.** `provider`, `model`,
  `maxTokens` envoyés par le client sont **acceptés puis ignorés** —
  `routes/llm.php` passe toujours le fournisseur et le modèle de la configuration,
  et le maximum de ce modèle (`DemoConfig::sortieMax()`, `Llm\ModelLimits`), à
  l'appel amont (`AnthropicProvider::complete`). Couvert par
  `LlmProxyTest::testServerImposesProviderModelAndMaxTokens` (le client demande
  `gpt-4o` / `maxTokens: 999999` → le payload amont reste Haiku 4.5 / 64 000).
- **Un Haiku seulement** (2026-10-21) : un Sonnet ou un Opus, en base, en
  environnement ou dans le fichier, est refusé — la démo prend le premier Haiku des
  couches, sinon Haiku 5.5, et la page d'administration nomme le modèle refusé ; un
  PUT qui en propose un reçoit un 422 (UC-ADM-04-U28, F23). Le `.env` de production
  de juillet, qui nomme Sonnet 5, ne s'applique donc plus. Même règle pour le tuteur
  (`TUTEUR_MODEL`, UC-VIS-05-F20), sur Haiku 5.5 par défaut depuis le 2026-10-22.
  Ce que le client lui envoie est borné côté serveur : question de 1 500 caractères,
  mémoire courte de 1 500 (deux échanges, UC-VIS-05 RG7) ; la page courante vient
  de la carte du site, jamais du texte du client (RG1).
- **Taille d'entrée plafonnée AVANT l'appel amont** : `mb_strlen(system . prompt)
  > maxInputChars` → 413, avant toute dépense
  (`LlmProxyTest::testOversizedInputAnswers413`).
- **Plus de plafond de sortie** (2026-10-21) : chaque appel demande tout ce que le
  modèle peut rendre — 128 000 tokens pour Haiku 5.5, 64 000 pour Haiku 4.5. Une
  réponse coupée serait payée et perdue ; ce qui borne la dépense est la réservation,
  jamais la longueur de la réponse. Le réglage `maxTokensPerRequest` (16 000 le
  matin du 2026-10-21, 8 192 de juillet à octobre, 2 048 avant) n'existe plus, ni
  `DEMO_MAX_TOKENS_PER_REQUEST` ; une valeur stockée en base n'est plus lue et part
  au prochain enregistrement (UC-ADM-04-U29).
- **Le pire cas réservé avant l'appel** (angle 6) : son entrée — un token par octet,
  qu'un tokenizer BPE ne dépasse jamais, plus le surcoût de la requête
  (`AnthropicProvider::REQUEST_OVERHEAD_TOKENS`, 1 024 : le prompt système que le
  fournisseur ajoute pour l'outil forcé, 406 tokens avec Haiku 5.5) ; au-delà de
  100 000 octets, le compte d'Anthropic (`POST /v1/messages/count_tokens`, gratuit,
  augmenté de 10 % et de 64 tokens, jamais au-dessus des octets ; sans réponse ou
  d'une valeur douteuse, les octets, UC-VIS-03-F26) : dès ≈ 90 850 tokens comptés,
  la réserve prend le palier long, et un compte un peu court près du seuil ne fait
  pas passer le budget — et toute la sortie du modèle ; au plus haut du tarif de la
  grille des crédits, que le relevé quotidien tient aux prix d'Anthropic, et de la
  table de `Pricing`, palier long compris : une grille trop basse ou qui a perdu son
  palier ne fait pas réserver moins (UC-VIS-03-U26).

Coût par requête ainsi borné. Avec Haiku 5.5 — 0,10 $ / 0,50 $ le million jusqu'à
100 000 tokens d'entrée, 0,50 $ / 2,50 $ au-delà, pour tout l'appel (page des prix,
2026-10-21) — et son tokenizer, celui des modèles depuis Opus 4.7 (≈ 2,5 caractères
par token selon Anthropic, un tiers de tokens de plus que l'ancien ; à mesurer en
français), un scan de Twin6 (≈ 56 000 caractères, ≈ 22 000 tokens) coûte ≈ 0,008 $
et en réserve ≈ 0,07 $, dont 0,064 $ pour ses 128 000 tokens de sortie ; une
synthèse de 200 000 caractères (≈ 80 000 tokens, comptés par Anthropic) coûte
≈ 0,01 $ et en réserve ≈ 0,07 $ — sans le compte, ses octets l'auraient mise au
palier long et lui auraient fait réserver ≈ 0,42 $ ; une synthèse de plus de
≈ 90 850 tokens comptés en réserve ≈ 0,37 $ ; une entrée au plafond (2 000 000 de
caractères, ≈ 800 000 tokens) réserve ≈ 0,76 $. Au-delà d'un million de tokens, le
fournisseur refuse l'appel, sans le facturer.

**Résidu accepté :** la réservation compte toute la sortie du modèle, 0,064 $ par
appel au tarif de base de Haiku 5.5, et les octets d'une entrée de moins de 100 000
octets, trois à quatre fois ses tokens. En fin de journée, un appel que le reste du
budget ne couvre plus est refusé (503) alors que son coût réel y tiendrait : les
derniers ≈ 0,07 $ du jour ne servent pas, et un essai (Essayer, Twin6) commencé tout
près de la fin peut s'arrêter après ses premiers appels payés. Et lever le plafond
ne lève pas le délai : une sortie plus longue que ce que le modèle écrit en
`upstreamTimeoutSeconds` (150 s, sous les 165 s qu'OVH laisse à un script) est
coupée par lui, et comptée pour ce qu'elle a produit. C'est le prix d'un plafond
qui tient sous concurrence sans couper une réponse payée.

---

## Angle 4 — Exfiltrer la clé API

**Ce que tente l'abuseur :** lire la clé dans une erreur amont relayée, dans les
logs, ou via une SSRF de gdoc-text (métadonnées cloud, hôte interne, redirections).

**Défense :**
- **La clé ne circule que dans l'en-tête `x-api-key`** de la requête amont —
  jamais dans une URL, un log, une réponse, ou un message d'exception
  (`AnthropicProvider`, `HttpClientException`, `UpstreamException`). Couvert par
  `LlmProxyTest::testApiKeyNeverAppearsInResponses` (succès ET erreur 500 amont).
- **Erreur amont relayée = `error.message` du fournisseur uniquement** (jamais un
  en-tête ni le corps de requête). Anthropic n'y renvoie pas la clé.
- **Middleware d'erreur Slim** : `displayErrorDetails` n'est vrai qu'en `dev`
  (`Bootstrap.php`) ; en production, une exception non capturée donne un 500
  générique — aucune fuite de détail.
- **Anti-SSRF gdoc-text** : origine **codée en dur** (`docs.google.com`), `docId`
  validé `^[A-Za-z0-9_-]{20,80}$`, **`CURLPROTO_HTTPS` seul**, redirections suivies
  **manuellement** (curl ne suit rien) au plus 3 fois et **uniquement** vers
  `*.googleusercontent.com` en https, sans IP littérale ni port non standard.
  Couvert par `LlmGdocTextTest::testRedirectTricksAreRefused` (http, IP,
  usurpation de suffixe, absence de frontière de point, port non standard).

**Résidu accepté :** on relaie le **texte d'erreur** du fournisseur amont dans un
502 (borné, sans secret). Divulgation d'info mineure (un abuseur apprend qu'une
erreur amont est survenue) — assumée pour l'utilité du message.

---

## Angle 5 — Persistance / RGPD (faire écrire du contenu)

**Ce que tente l'abuseur :** faire atterrir du contenu utilisateur (prompt,
réponse, texte de document, IP brute) dans une table ou un log.

**Défense :** **compteurs seulement** (cahier §6.5). Sur tout le chemin LLM/gdoc,
les seules écritures sont :
- `llm_usage_daily` : compteurs de tokens + coût (aucun contenu) ;
- `llm_pow_challenges` : `sha256(challenge)` (aucune donnée client) ;
- `rate_limits` : bucket **haché** (jamais d'IP brute).

Aucun `error_log` n'existe sur le chemin LLM ni gdoc (grep vérifié : les seuls
`error_log` du dépôt sont dans `Middleware/CsrfMiddleware.php`, `routes/system.php`
(migrate), `routes/system.php`/`import-referentiel` et `routes/referentiel.php` —
tous hors chemin démo, et aucun ne journalise de contenu utilisateur). Couvert par
`LlmProxyTest::testSuccessfulCallIncrementsCountersOnly` (le prompt « confidentiel »
n'apparaît dans **aucune** table).

**Résidu accepté :** aucun identifié sur cet angle.

---

## Angle 6 — Déni de service

**Ce que tente l'abuseur :** des requêtes concurrentes qui contournent les
compteurs (atomicité) ; un fichier gdoc de 10 Go pour saturer la mémoire.

**Défense :**
- **Incréments atomiques** : quota (`RateLimiter`) et compteurs journaliers
  (`UsageCounters`) utilisent `INSERT … ON DUPLICATE KEY UPDATE compteur = … + 1`
  — sûr en concurrence, pas de perte d'incrément. La rédemption PoW est
  sérialisée par la clé primaire.
- **Réservation atomique du budget** (2026-10-21, Christian : « pas plus de dépense
  journalière ») : `UsageCounters::reserve` ajoute le pire cas de l'appel aux
  compteurs du jour par un seul `UPDATE` conditionnel — il ne s'applique que si les
  deux plafonds tiennent encore — sur la ligne du jour, que InnoDB verrouille. Des
  requêtes concurrentes réservent donc l'une après l'autre et, ensemble, ne passent
  jamais le budget. La réservation devient l'usage réel (`settle`) ; un refus du
  fournisseur la rend (`release`). Couvert par UC-VIS-03-U25 et F25.
- **Téléchargement gdoc plafonné pendant le transfert** : `CurlHttpClient`
  interrompt le transfert (`CURLOPT_WRITEFUNCTION` renvoie 0) dès que le corps
  dépasse 1 Mo → mémoire bornée à ~1 Mo, jamais 10 Go. Timeout de 15 s. Couvert
  par `LlmGdocTextTest::testOversizedDocumentAnswers413`.

**Résidu accepté :**
- ~~**Dépassement du coupe-circuit journalier sous concurrence.**~~ Fermé le
  2026-10-21 par la réservation ci-dessus : le plafond était lu **avant** l'appel et
  écrit **après** (`isExhausted` puis `record`), si bien que N requêtes concurrentes
  passaient toutes le contrôle avant que l'une n'écrive — et, Haiku 5.5 compté sans
  son palier long, une entrée dense ne comptait qu'un cinquième de son coût.
- **Appel coupé : compté pour ce qu'il a pu produire** (2026-10-21 ; avant, le délai
  dépassé gardait la réservation entière, toute la sortie du modèle comprise). Avec
  l'appel en flux, ce qui est arrivé borne ce qui a été généré — à condition que
  le JSON de l'outil forcé vienne à mesure qu'il s'écrit : sans
  `eager_input_streaming`, l'API retient chaque valeur jusqu'à ce qu'elle soit
  complète, et un appel coupé n'aurait rien reçu de ce qu'il a généré —
  : l'entrée que le fournisseur annonce au début du flux, un token par octet
  reçu, plus 1 024 tokens encore en vol. Le compte suppose que le fournisseur cesse de générer quand le
  flux est fermé, ce que sa documentation ne dit pas et que d'autres décrivent
  (UC-VIS-03, Limites) ; une requête partie entière avant une panne du réseau
  compte son entrée et ces 1 024 tokens. Un script arrêté par l'hébergement avant
  l'issue garde sa réservation entière.
- **Le plafond de tokens doit laisser passer un appel entier.** La réservation y
  compte l'entrée et les 128 000 tokens de sortie de Haiku 5.5 : `dailyGlobalTokens`
  réglé en dessous (la borne de l'administration descend à 10 000) éteint la démo.
- **Rafale au changement de fenêtre horaire (fixed-window).** `RateLimiter` est à
  fenêtre fixe : un abuseur peut placer `perIpPerHour` requêtes à `10:59:59` puis
  `perIpPerHour` de plus à `11:00:00`, soit un pic de **2×** à la frontière. Résidu
  standard du fixed-window, borné et mineur pour le budget de la démo ; un
  sliding-window serait disproportionné sur mutualisé.

---

## Tableau des résidus acceptés

| # | Angle | Résidu accepté | Garde-fou de repli |
|---|-------|----------------|--------------------|
| 1 | PoW | Difficulté ~gratuite pour un attaquant natif | Quota /64 + coupe-circuit journalier |
| 1 | PoW | Émission de défis non limitée (sans état) | TTL 2 min + rédemption sous quota |
| 2 | Quota IP | Un /48 = 65 536 buckets /64 | LLM : coupe-circuit 1 $/jour ; gdoc : résidu bande passante |
| 3 | Coût | Pire cas réservé avec toute la sortie du modèle (et un token par octet sous 100 000 octets) : un appel refusé en fin de journée alors que son coût réel tiendrait | Le budget tient, aucune réponse payée n'est coupée |
| 3 | Coût | Une sortie plus longue que ce que le modèle écrit en 150 s est coupée par le délai | Comptée pour ce qu'elle a produit, le budget tient |
| 4 | Clé | Texte d'erreur amont relayé (sans secret) | 502 générique, clé jamais dans le corps |
| 6 | DoS | Appel coupé compté par les octets reçus : suppose que le fournisseur cesse de générer à la coupure | Marge de 1 024 tokens ; un script arrêté avant l'issue garde son pire cas |
| 6 | DoS | Rafale 2× à la frontière de fenêtre horaire (fixed-window) | Borné, coupe-circuit journalier au-dessus |

## Références

- **Code :** `api/src/routes/llm.php`, `api/src/routes/auth.php`,
  `api/src/ClientIp.php`, `api/src/Llm/{PowChallenge,UsageCounters,DemoConfig,`
  `AnthropicProvider,CurlHttpClient,Pricing,ModelLimits}.php`, `api/config/demo.php`,
  `scripts/migrations/006_llm_usage.sql`.
- **Tests :** `api/tests/{ClientIpTest,LlmProxyTest,LlmPowTest,LlmGdocTextTest,`
  `LlmMockProviderTest,AuthRateLimitTest}.php`, `api/tests/UseCases/*/UcVis03EssayerCartographieTest.php`
  (réservation : U25, F25, F26 ; tarifs : U05, U26), `UcAdm04ConfigurerDemoTest`
  (Haiku seul, sortie du modèle : U28, U29, F23), `web/src/lib/pow.test.js`,
  `web/src/lib/gdoc.test.js`.
- **Config d'abus :** `perIpPerHour`, `dailyGlobalTokens`, `dailyBudgetUsd`,
  `powDifficultyBits`, `maxInputChars` — tous surchargeables par variable
  d'environnement `DEMO_*` (`api/config/demo.php`) ; le modèle aussi, s'il est un
  Haiku.
