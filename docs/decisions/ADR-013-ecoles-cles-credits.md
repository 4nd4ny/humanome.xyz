# ADR-013 — Écoles, clés et crédits : la clé reste dans le navigateur, l'école paie pour ses élèves

## Statut

Accepté — 2026-10-22, par délégation (sprint 6 du TODO, lots locaux S6a et S6b). Les cinq
règles du §1 sont celles de Christian, écrites dans le TODO ; les décisions du §2 ont été prises
par délégation, et la section « À signaler à Christian » les lui signale, avec les détails que
cet ADR fixe en plus. Amende l'ADR-004 (le stockage serveur opt-in des clés d'utilisateur est
retiré), l'ADR-010 (§3 : seule une école achète des crédits ; §4 : la clé privée de Twin9 n'est
plus celle de l'utilisateur, mais celle de son école) et l'ADR-012 (§5 : sa garde passe de la clé
personnelle à la clé d'école).

Mise en œuvre : les lots S6a et S6b (§10). À la date de cet ADR, le code n'a pas encore changé ;
les références `fichier:ligne` sont celles de `main` (`9f623b1`).

Mis en œuvre le 2026-10-22, sur la branche `feat/ecoles` : S6a (les clés restent dans le navigateur,
seule une école achète, migration 036) puis S6b (l'école paie, migration 037). Ce que S6b a fixé
en plus des noms indicatifs du §3 : le type de payeur s'appelle `twin9_runs.payeur`
(`ENUM('personnel', 'ecole') NOT NULL DEFAULT 'personnel'` : les runs d'avant sont `personnel`) ;
le mois d'une réserve, que le §3 demande sans la nommer, est `twin9_appels.mois_reserve` ; la clé
d'école référence le compte (`ecole_cles.ecole_id → users`) ; une école pour elle-même est un payeur
de type `ecole` dont l'école est elle-même, sans plafond ; la surtaxe est bornée aussi par une
contrainte `CHECK` de la base ; un changement de payeur à la reprise attend que les lots qui tiennent
encore une réserve de l'ancien se règlent (`409`). Le grand livre des écoles est
`Etablissement\GrandLivreEcoles`, implémenté par `GrandLivreLocal` (§9).

Les lots distants S6c (registre et grand livre communs avec EduChat) et S6d (Stripe, PayPal réel)
ne sont pas décidés ici : chaque geste y demande l'accord de Christian. Le §9 décrit seulement
l'interface où ils se brancheront, et le code de S6b la prépare sans la brancher.

## Contexte

Le TODO du sprint 6 demande une gestion complète des écoles, de leurs dépenses, de leurs recharges
et de leurs clés, et pose cinq règles (§1). Le sprint 6 n'avait pas été repéré avant l'analyse des
sprints du 2026-10-22 ; ce qui existe a été revérifié sur `main` (`9f623b1`), après le
multi-fournisseur (#32), les rôles déclarés (#36) et le plafond des crédits offerts (#37).

Ce qui existe :

- **L'école.** L'habilitation `etablissement`, attribuée par l'administrateur (migration 001 ;
  `docs/roles.md`, « Les sept habilitations ») ; depuis le sprint 8, un rôle déclaré n'ouvre rien
  et `etablissement` ne se déclare pas (migration 035). Elle a ses cohortes et leurs membres, dont
  la ligne est le consentement (`scripts/migrations/009_etablissements_masse.sql:21-46`), et une
  configuration (`009…sql:74-88`) : une clé chiffrée — celle du point d'accès compatible OpenAI des
  runs de masse —, un plafond `budget_cap_usd` que l'école règle elle-même et un compteur
  `spent_usd`, « base de la facturation à l'usage » (`docs/plan-masse.md` §4) : ses runs de masse
  sur la clé de la plateforme sont facturés après coup, pas prépayés.
- **Les clés d'utilisateur.** `user_api_keys` (migration 005), chiffrées par `KeyVault`
  (`api/src/Keys/KeyVault.php:9-33`) et rendues en clair à leur propriétaire
  (`GET /api/keys/{provider}`, `api/src/routes/keys.php:106-113`). Le stockage est proposé par
  l'assistant de run du navigateur (`web/src/components/RunWizard.jsx:556-576` : « Synchroniser sur
  le serveur (chiffrée) », « Récupérer la clé depuis le serveur ») et par la page du compte
  (`web/src/views/AccountView.jsx:508`, texte de `web/src/views/account/ApiKeysSection.jsx:102-113`).
  La clé gardée est relue par la cartographie ouverte (`web/src/views/Twin6OuverteView.jsx:298-314,
  393-399`) et par Twin9 sous `cle: "personnelle"` (`api/src/Twin9/RunKey.php:37-44`), derrière le
  réglage `twin9_cle_perso_ouverte`, fermé par défaut (`api/src/Twin9/Twin9Config.php:124-129`).
- **Les crédits.** Un solde par compte en micro-USD, avec son grand livre (`twin9_credits`,
  `twin9_credit_events`, migration 011) ; un débit conditionnel atomique et une recharge
  idempotente par `paypal_order_id` (`api/src/Twin9/CreditService.php:61-164`) ; des packs de 10 à
  500 $ (`Twin9Config.php:134-141`) que tout compte connecté peut acheter
  (`api/src/routes/twin9.php:651`, `:695`) ; un remboursement du solde sur demande (`twin9.php:750`).
  La même ligne sert déjà aux comptes établissement (factures, ADR-010 §3).
- **Trois chemins payants.** Les runs Twin9, réservés appel par appel (`RunCosts`), à la
  contribution `marge` (1,2) ; l'appel de la cartographie ouverte par crédits (`POST
  /api/twin6/appel`, `twin9.php:368`), à la contribution `marge_twin6` (1,1) ; les runs de masse.
  La démonstration, l'essai de la cartographie ouverte et le tuteur sont gratuits, sous le plafond
  des crédits offerts (S7a) : cet ADR ne les change pas.
- **Aucun Stripe** dans humanome (`git grep -i stripe 9f623b1` ne trouve rien), ni dans EduChat,
  d'après l'analyse des sprints.

Les contraintes :

- **L'âge.** Vendre des crédits à un particulier obligerait à contrôler l'âge des apprenants : la
  règle 2 l'évite en ne vendant qu'aux écoles.
- **Le run serveur.** Un run Twin9 avance par tranches, pendant des heures, sans navigateur ouvert
  (ADR-011 §2) : il ne peut pas partir sur une clé que seul le navigateur détient.
- **Le titulaire de la clé.** Le titulaire d'une clé chez un fournisseur peut relire ce qui part
  avec elle (ADR-012 §5). Une école est le titulaire de sa clé, comme l'était l'utilisateur de la
  sienne.
- **L'hébergement.** Pas de SSH sur l'OVH mutualisé, des migrations à sens unique selon le motif
  expand/contract (ADR-008).
- **Le miroir public.** Le dépôt est publié (`scripts/check-publiable.mjs`) : aucune donnée réelle,
  aucune adresse de serveur ; l'école de démonstration n'existe qu'en base.

## Décision

### 1. Les règles de Christian (TODO, sprint 6)

- **R1.** Les clés API d'un utilisateur restent dans son navigateur et ne sont **jamais** gardées
  sur le serveur, **sauf** celles d'une école, pour ses apprenants. L'interface le dit à
  l'utilisateur.
- **R2.** Un utilisateur ne peut pas acheter de crédits (pour ne pas avoir à contrôler l'âge des
  apprenants) : il n'utilise que ses propres clés. Seule une école achète des crédits.
- **R3.** Une école paie les clés API, ou les crédits, de ses élèves.
- **R4.** Une école qui ne veut ni compte chez un fournisseur ni clé à gérer peut utiliser la clé de
  l'instance — celle que le TODO appelle « celle de RESPIRE#1 » —, moyennant une surtaxe
  qu'**elle** choisit entre 3,5 % (frais de Stripe et de PayPal) et 10 %.
- **R5.** Une école RESPIRE#0 par défaut, pour les tests, créée **en base** et pas dans GitHub.

### 2. Les décisions prises par délégation

- **(a) Les clés d'utilisateur déjà gardées** ne servent plus à aucun run nouveau. La page du compte
  les montre « à supprimer », avec un bouton. Un script d'administration, versionné et jamais lancé
  automatiquement, les purge après un avis par courriel (§8). Aucune purge n'est faite dans ce
  sprint.
- **(b) Twin9 ne part plus sur une clé personnelle.** Deux voies restent : `instance` (la clé de
  l'instance, payée par le crédit d'une école ou par le solde restant de l'utilisateur) et `ecole`
  (la clé de l'école).
- **(c) Les soldes individuels déjà achetés** restent utilisables jusqu'à épuisement, sans nouvel
  achat individuel. Leur remboursement éventuel suit la procédure existante
  (`POST /api/twin9/credit/rembourser`), sur demande.
- **(d) L'apprenant membre d'une cohorte d'une école.** Ses usages payants — Twin9 et toute
  cartographie payante — sont débités du crédit de son école, ou partent sur la clé de l'école, sous
  un plafond par élève que l'école règle (§3). Une école sur la clé de l'instance paie le coût réel
  × (1 + sa surtaxe), la surtaxe choisie dans [3,5 % ; 10 %], au lieu de la contribution des
  particuliers. Une école sur sa propre clé ne paie rien à la plateforme.
- **(e) Les packs PayPal** (le bac à sable en local seulement) sont réservés aux comptes école.
- **(f) La cartographie ouverte Twin6 sur la clé du navigateur ne change pas.** Seule disparaît la
  lecture d'une clé gardée sur le serveur (§5).
- **(g) RESPIRE#0** est créée par un script hors dépôt, jamais versionné, essayé sur la base de test
  seulement. Ses données ne figurent ni dans le dépôt, ni dans une migration, ni dans un jeu
  d'amorçage.
- **(h) L'école est le compte qui a l'habilitation `etablissement`**, que seul l'administrateur
  attribue ; jamais une déclaration du sprint 8.

Vocabulaire : la **contribution** reste le nom de la part des particuliers (`marge`, `marge_twin6` :
« contribution », jamais « surtaxe », `Twin9Config.php:115-121`) ; la **surtaxe** est celle d'une
école, sur la clé de l'instance seulement.

### 3. Le modèle de données

Les noms de tables et de colonnes sont indicatifs ; ce que l'ADR fixe, c'est qui paie, ce qui est
gardé, où et combien de temps.

- **L'école est un compte** : celui qui porte l'habilitation `etablissement` (h). Pas de seconde
  identité : une ligne de réglages par école, `ecoles` (clé : l'identifiant du compte, CASCADE),
  créée à la première écriture ; une école qui n'en a pas encore a les défauts.
  - `surtaxe_pct` : de 3,50 à 10,00, au centième ; défaut 3,50, le plancher de R4. L'école la change
    quand elle veut ; un run en cours garde celle de son lancement (§6).
  - `plafond_eleve_microusd` : ce que chacun de ses élèves peut engager par mois, en micro-USD ;
    défaut 0, rien de payant pour ses élèves tant que l'école ne l'a pas réglé.
  - `respire_numero` : NULL pour une école qui n'est pas RESPIRE, 0 pour RESPIRE#0, 1 pour
    RESPIRE#1, plus pour les suivantes (sprint 7), unique. Rien n'en dépend encore : il prépare le
    consentement du lot S7b.
- **Le crédit d'école** est le solde `twin9_credits` du compte école, avec le même grand livre
  `twin9_credit_events`, les mêmes factures et la même recharge idempotente. Rien à migrer : le
  solde qu'un compte établissement a déjà devient son crédit d'école.
- **La clé d'école** : une table `ecole_cles` (école, fournisseur, clé chiffrée, date), chiffrée
  comme `KeyVault` (nonce de 24 octets suivi du `secretbox`, clé maîtresse `SODIUM_MASTER_KEY` hors
  webroot). Elle s'écrit et s'efface ; **aucune route ne la rend**, pas même à l'école, comme la clé
  du point d'accès de `etablissement_config`. Anthropic seulement (§6). Purgée avec le compte école
  (CASCADE).
- **Le rattachement d'un apprenant** : ses cohortes, sans table de plus. Les écoles d'un compte sont
  les comptes `etablissement` dont une cohorte le compte parmi ses membres (`cohorte_membres` →
  `cohortes.etablissement_id`), plus lui-même s'il est une école. Un apprenant peut être membre de
  cohortes de deux écoles : il choisit son payeur au lancement (§4).
- **Le plafond par élève** : une ligne par (école, élève, mois UTC), `ecole_consommations`, qui
  compte ce que l'élève a engagé du crédit ou de la clé de l'école ce mois-là. Le mois est celui du
  grand livre des crédits offerts (S7a, UTC) ; une réserve se règle dans le mois où elle a été
  prise. CASCADE depuis l'école et depuis l'élève.
- **L'attribution** : les événements que les runs d'un élève écrivent dans le grand livre de son
  école portent l'élève (`twin9_credit_events.beneficiaire_id`, SET NULL à la purge de l'élève),
  pour que l'école voie ce que chacun a dépensé, en montants seulement.
- **Le payeur d'un run**, figé au lancement. Le **type de payeur**, gardé dans le run
  (`personnel` ou `ecole`), fait foi ; une valeur nulle ne le remplace jamais. Avec lui :
  `twin9_runs.payeur_id`, l'école qui paie (SET NULL à la purge de l'école, jamais CASCADE : les
  runs sont à l'élève), et `facteur_prix`, le facteur de l'école au lancement (1 + surtaxe sur son
  crédit, 1,0 sur sa clé). Un particulier n'a ni l'un ni l'autre : il garde la contribution de
  l'instance, comme aujourd'hui. Un run de type `ecole` dont l'école a disparu (`payeur_id` nul) ou
  sans facteur est suspendu, « votre école ne paie plus cette analyse » ; il ne bascule jamais sur
  le solde de l'élève, qui ne paie qu'en le choisissant à une reprise. La configuration du run dit
  la voie et le type de payeur, jamais la marge ni la surtaxe (registre §13).

### 4. Qui paie quoi

| Usage | Lancé par | Clé | Payeur | Débité |
|---|---|---|---|---|
| Twin9, voie `instance` | un particulier, hors de toute école | de l'instance | lui, sur son solde restant | coût réel × `marge` |
| Twin9, voie `instance` | un élève, payeur « mon école » | de l'instance | son école | coût réel × (1 + surtaxe), sous le plafond par élève |
| Twin9, voie `ecole` | un élève, payeur « mon école » | de l'école | l'école, chez son fournisseur | rien sur le crédit ; le coût réel compte sous le plafond par élève |
| Twin9, voie `instance` ou `ecole` | un compte école, pour lui-même | selon la voie | l'école | comme un élève, sans plafond par élève |
| Cartographie ouverte, crédits (`/api/twin6/appel`) | un particulier | de l'instance | lui, sur son solde restant | coût réel × `marge_twin6` |
| Cartographie ouverte, crédits | un élève | de l'école si elle en a une, sinon de l'instance | son école | rien sur sa clé ; sinon × (1 + surtaxe) ; sous le plafond |
| Cartographie ouverte, clé du navigateur ; assistant de run du navigateur | tous | du navigateur | le titulaire de la clé | rien (inchangé, f) |
| Démonstration, essai, tuteur | tous | de l'instance | les crédits offerts (S7a) | inchangé |
| Run de masse, fournisseur `humanome` | l'école | de l'instance | l'école, après coup | `spent_usd` sous `budget_cap_usd` (inchangé dans S6a et S6b) |
| Run de masse, fournisseur `endpoint` | l'école | de l'école | l'école, chez son fournisseur | rien (inchangé) |

- **Le choix du payeur.** Au lancement, la page propose les payeurs possibles : chacune de ses
  écoles — avec son crédit pour la voie `instance`, avec sa clé pour la voie `ecole` —, et son solde
  restant s'il en a un. Par défaut, son école quand il n'en a qu'une ; plusieurs, il choisit. Le
  serveur revérifie le choix ; le run le garde (§3).
- **Une seule transaction.** La réserve d'un appel payé par une école vérifie, atomiquement et dans
  la transaction qui écrit l'appel, le plafond de l'élève (un `UPDATE` conditionnel de sa ligne du
  mois, verrouillée la première) puis le crédit de l'école (le débit conditionnel de
  `CreditService`). L'un des deux manque : rien n'est débité, et le run s'arrête comme sur un crédit
  insuffisant, « plafond de votre école atteint : carte incomplète ». Le règlement ajuste les deux
  lignes dans sa propre transaction. Sur la clé de l'école, seul le plafond est réservé.
- **Ce que relit chaque tranche**, pour un run de type `ecole` : l'existence et l'habilitation de
  l'école qui paie, l'appartenance de l'élève à l'une de ses cohortes et, sur la voie `ecole`, la
  présence de sa clé. Ce qui manque suspend le run avec sa
  raison, comme une garde de fournisseur (ADR-012 §1) ; une reprise choisit de nouveau son payeur.
- **Les runs de masse** suivent la même règle à terme : sur la clé de l'instance, un débit prépayé
  du crédit de l'école, × (1 + surtaxe). Leur bascule du compteur après coup vers le crédit prépayé
  touche le budget du worker de masse (`JobQueue`) ; elle fera un lot à part, après S6b. D'ici là,
  ils gardent leur plafond, leur compteur et la facturation à l'usage du plan de masse.
- **Un particulier hors de toute école**, une fois son solde épuisé, n'a plus de Twin9 : il lui
  reste la cartographie ouverte avec sa clé, dans son navigateur, et les fonctions gratuites.

### 5. Les clés : ce que fait le serveur, ce que dit l'interface

Côté API (S6a) :

- `PUT /api/keys` répond `410` à tout compte : « Vos clés restent dans votre navigateur :
  humanome ne les garde plus sur ses serveurs. » Plus aucune clé d'utilisateur n'est écrite.
- `GET /api/keys` (la liste, jamais une clé) et `DELETE /api/keys/{provider}` restent : la page du
  compte montre chaque clé encore gardée, « à supprimer », avec son bouton.
- `GET /api/keys/{provider}` reste ouvert à son seul propriétaire jusqu'à la purge (le canal de
  l'ADR-004, réponse `no-store`), pour **une** action de la page du compte : recopier la clé dans ce
  navigateur avant de la supprimer, pour que personne ne perde une clé qu'il n'aurait gardée nulle
  part ailleurs. Aucun chemin de run ne l'appelle plus : le bouton « Récupérer la clé depuis le
  serveur » de l'assistant de run et la clé gardée de la cartographie ouverte disparaissent. La
  route part avec la contraction (§8).
- `/api/twin9/meta` ne dit plus si une clé privée est disponible (`cle_privee_disponible`,
  `twin9.php:557-559`) ; il dit les payeurs possibles du compte.
- Les clés d'école : `PUT` et `DELETE` sur une route de l'espace établissement, gardée par
  l'habilitation `etablissement` (S6b) ; écrites dans `ecole_cles`, jamais relues par une route.
- Les packs : `POST /api/twin9/credit/paypal/creer` et `…/capturer` répondent `403` à un compte
  sans l'habilitation `etablissement` : « Seule une école achète des crédits. » La capture revérifie
  l'habilitation. Le remboursement reste ouvert à tous (c).

Côté interface (S6a) — R1 demande de le dire :

- Partout où l'on saisit une clé (assistant de run, cartographie ouverte, compte) : « Votre clé
  reste dans ce navigateur : humanome ne la garde jamais sur ses serveurs. Seule une école peut y
  garder la sienne, pour ses élèves. » La case « Synchroniser sur le serveur » disparaît ; la case
  « Mémoriser la clé dans ce navigateur » reste.
- La page du compte : la section des clés liste les clés encore gardées, « à supprimer », avec
  « Supprimer du serveur » et « Recopier dans ce navigateur, puis supprimer » ; plus de formulaire
  d'ajout.
- La page du crédit : les packs pour une école seulement ; pour un autre compte, son solde restant,
  son remboursement, et pourquoi il ne peut pas acheter (« pour ne pas avoir à vérifier l'âge des
  apprenants, seules les écoles achètent des crédits : utilisez votre propre clé, dans votre
  navigateur, ou le crédit de votre école »).

### 6. Twin9 : RunKey, ProfilPolicy, CallSettings et le reste du run

- **Le profil.** `cle` admet `instance` (défaut) et `ecole`. `personnelle` reste lisible dans le
  schéma (les profils et les runs déjà gardés restent valides), mais ne se choisit ni ne se lance
  plus : refusée à l'enregistrement, au lancement et à la reprise (422, « la clé personnelle ne
  sert plus aux analyses du serveur ; choisissez la clé de l'instance ou celle de votre école »).
  Un profil qui la porte reste enregistré jusqu'à ce que son propriétaire en choisisse une autre,
  comme un jeu de gabarits qui ne lui est plus proposé (`ProfilPolicy.php:102-106`). Le contrat
  est décrit dans `docs/contrats.md` par le lot qui le change.
- **`RunKey`** (`RunKey.php:32-48`) prend la clé du **payeur** du run et plus celle de son
  propriétaire : aujourd'hui appelé avec `$run->userId` (`api/src/Worker/Twin9Lots.php:190`,
  `api/src/Worker/Twin9Slice.php:558`), il reçoit le run, ou son payeur. Voie `instance` : la
  variable du registre, inchangée. Voie `ecole` : la clé d'école du payeur, lue au départ de chaque
  appel, gardée nulle part ailleurs. Sa branche `personnelle` (`:37-44`) ne sert plus qu'aux runs
  lancés avant S6a, jusqu'à leur fin (§8), puis part avec la contraction.
- **`ProfilPolicy`.** La garde de l'ADR-012 §5 n'est pas retirée : elle passe à la clé d'école, dont
  l'école est le titulaire comme l'utilisateur l'était de la sienne. Un profil `cle: "ecole"` qui
  appelle un autre fournisseur qu'Anthropic est refusé à l'enregistrement (422, aujourd'hui
  `ProfilPolicy.php:91-101`) et appel par appel au moment de lire la clé (`Twin9Slice.php:370`),
  fermé par défaut. Le refus d'une clé fermée (`:81-84`) devient : au lancement, la voie `ecole`
  demande un payeur qui est une école de l'utilisateur et qui a une clé. `choix()` (`:261-300`) rend
  les payeurs possibles à la place de `cle_perso_ouverte` et de `cle_perso_enregistree`. La voie
  `ecole` n'a pas d'interrupteur à part : l'habilitation que l'administrateur donne en est la garde.
- **`CallSettings` et les empreintes.** `cle` n'est pas un réglage d'appel : ni l'empreinte des
  réglages (`CallSettings::empreinte`, `api/src/Twin9/CallSettings.php:240-262`, mémoire de la
  carte), ni la signature des évaluations (`Evaluations::signature` et `comparables`,
  `api/src/Twin9/Evaluations.php:66-70, 319-336`, prévisions) ne la lisent. Changer de voie ne
  change donc l'empreinte d'aucun profil existant, ni sa mémoire, ni ses prévisions. Le lot S6a fige
  cela par un test : un même profil, avec chacune des trois valeurs de `cle`, garde la même
  empreinte et la même signature.
- **Le prix d'un run.** Le facteur s'applique au coût réel, au prix de la grille (demi-tarif par
  lots) : `marge` pour un particulier, 1 + surtaxe sur le crédit d'une école, 1,0 sur une clé
  d'école. Aujourd'hui, la marge est un booléen tiré de la configuration vivante
  (`Twin9Config::cout`, `RunCosts::pireCasDe`, `Lancement.php:285`, `Twin9Slice.php:440`) et la
  grille de la configuration du run est facturée selon `cle === "instance"`
  (`RunConfiguration.php:219-223`). Le lot S6b les fait passer par un seul facteur, lu sur le run :
  celui de l'école est figé au lancement (§3) ; celui d'un particulier reste la contribution de
  l'instance, comme aujourd'hui. Les prévisions convertissent déjà par la marge enregistrée
  (`Evaluations::modele`, `:156`) : une évaluation sur clé d'école compte 1,0, sur crédit d'école
  1 + surtaxe, et reste comparable.
- **La réserve et l'admission.** `RunCosts` débite le payeur (`debiter()`, aujourd'hui le
  propriétaire) et juge `parCredits()` (`RunCosts.php:184-192`) sur la voie et le payeur.
  `Lancement::prevoir` borne le run par le crédit du payeur, moins ce que ses autres runs en cours
  peuvent encore en dépenser — pour une école, ceux de tous ses élèves —, et par ce qui reste du
  plafond de l'élève ce mois-ci.
- **Les lots.** `twin9_lots.cle` (`ENUM('instance', 'personnelle')`, migration 026) gagne `ecole`.
  Un lot soumis avec la clé d'une école s'annule et s'efface avec elle : à la purge du compte de
  l'élève, la file des lots à effacer (`twin9_lots_a_effacer`) garde l'école avec l'identifiant
  Anthropic, et le tick lit sa clé. Une école qui a retiré sa clé laisse ses lots chez Anthropic
  jusqu'à ce qu'Anthropic les efface, 29 jours au plus (registre §13).
- **La Console de l'école.** Avec la clé d'une école, les résultats des lots restent lisibles dans
  la Console Anthropic de l'école, comme ceux d'une clé personnelle (ADR-012 §5) : l'accord du
  lancement le dit à l'élève.
- **`twin9_cle_perso_ouverte`** n'a plus d'objet : la promotion « Twin9 gratuit sur sa propre clé »
  disparaît avec la voie. Ignoré à la lecture, il part à la sauvegarde suivante, comme les clés
  retirées le 2026-10-20 (`Twin9Config.php:45-51`).

### 7. RGPD

- **Les clés d'école** : chiffrées au repos, jamais rendues, jamais journalisées ; posée et retirée
  écrivent un événement d'audit sans aucune matière de clé. Purgées avec le compte école. Le
  registre §6 se scinde : les clés d'école, gardées ; les clés d'utilisateur, plus collectées, en
  cours de purge.
- **Les clés d'utilisateur déjà gardées** : plus aucune collecte. Chaque personne concernée reçoit
  un avis par courriel avant la purge (§8) : ce qui est gardé, pourquoi cela part, à quelle date,
  comment la recopier dans son navigateur ou la supprimer tout de suite. La purge est un événement
  d'audit par compte (le fournisseur, sans la clé). La suppression du compte purge toujours ses
  clés (CASCADE).
- **Ce que l'école voit de ses élèves** : ce que chacun a engagé de son crédit ou de sa clé, en
  montants, dates et références de run — jamais un portfolio, une sortie ni un prompt. C'est un
  traitement nouveau : la page du lancement le dit à l'élève (« payé par votre école : elle voit le
  montant ») et le texte du consentement de la cohorte l'ajoute pour les nouvelles adhésions. À la
  purge de l'élève, ses lignes deviennent anonymes (SET NULL) ; à la purge de l'école, tout part.
- **Avec la clé de l'école**, les résultats des lots d'un élève restent lisibles par l'école dans
  sa Console Anthropic (§6) : l'accord du lancement le nomme, le registre §13 aussi.
- **Les mineurs.** Aucun paiement n'est demandé à un particulier : l'acheteur est l'école.
- **EduChat** : les courriels des élèves passeraient entre deux hébergeurs. Le registre et la
  sous-traitance sont à écrire avant le premier échange, dans S6c (§9).

### 8. Plan de migration des données existantes

Dans l'ordre ; chaque pas suppose le précédent fait.

1. **Avant le déploiement de S6a**, des comptages en lecture seule : comptes ayant une clé gardée,
   par fournisseur ; runs non finis sur `cle: "personnelle"` ; profils qui la portent ; comptes à
   solde positif, écoles comprises. Des nombres, jamais une clé ni une adresse.
2. **Le déploiement de S6a** (migration 036) : plus de lancement ni de reprise sur une clé
   personnelle, plus d'écriture de clé d'utilisateur, plus aucune lecture d'une clé gardée pour un
   run nouveau, packs réservés aux écoles, « à supprimer » sur la page du compte.
3. **Les runs en cours sur une clé personnelle** finissent sur elle, ou leur propriétaire les annule.
   Le réglage étant fermé par défaut, il ne devrait y en avoir aucun ; le comptage du pas 1 le dit.
4. **Leurs lots** : avant d'effacer la clé d'un compte, le script annule puis efface chez Anthropic
   les lots soumis avec elle (`RunPurge::lotsPersonnels`, `api/src/Twin9/RunPurge.php:38`), tant
   qu'elle existe. Une clé dont un run n'est pas fini n'est pas purgée.
5. **L'avis** : le script, en mode `aviser`, écrit à chaque compte qui a une clé gardée et note la
   date de l'avis (`user_api_keys.avis_purge_at`, migration 036) ; un compte déjà avisé ne l'est pas
   deux fois.
6. **La purge** : en mode `purger`, le script efface les clés avisées depuis 30 jours au moins,
   après le pas 4 pour leur compte. Il compte par défaut sans rien changer ; il n'agit que sur
   demande explicite. Il n'est appelé ni par le worker, ni par une tâche planifiée, ni par le
   déploiement. En production, faute de SSH (ADR-008), le moyen de le lancer — une route
   d'administration protégée comme `/api/admin/maintenance`, ou le Mac sur la base de production —
   et le jour de la purge sont des gestes de Christian.
7. **Les soldes individuels** ne bougent pas : utilisables jusqu'à épuisement, remboursables sur
   demande (c) ; aucun transfert vers une école.
8. **Les profils `cle: "personnelle"`** restent tels quels ; la page de configuration propose
   `instance` ou `ecole`. Aucune réécriture, et aucune empreinte ne change (§6).
9. **Les comptes école existants** : leurs réglages naissent à la première écriture (surtaxe 3,5 %,
   plafond 0) ; leur solde devient leur crédit d'école ; `etablissement_config` n'est pas touché.
10. **La contraction**, plus tard (ADR-008) : une fois aucune clé d'utilisateur restante et la
    release qui ne les lit plus stable, partent la branche `personnelle` de `RunKey` et de
    `RunPurge`, la route `GET /api/keys/{provider}`, le réglage `twin9_cle_perso_ouverte`, puis la
    table `user_api_keys` et la valeur `personnelle` des énumérations. Ni 036 ni 037 n'en retirent
    rien.

### 9. L'interface future : S6c (EduChat) et S6d (Stripe)

Rien de ce paragraphe n'est branché : ni client HTTP, ni adresse, ni secret, ni appel au serveur
d'EduChat, ni à Stripe. Le lot S6b introduit seulement la couture : une interface du grand livre des
écoles — réserver, régler, libérer, solde — dont la seule implémentation est locale (le crédit du
compte école et `ecole_consommations`).

**S6c — registre et grand livre communs avec EduChat** (sur le VPS d'EduChat, accord de Christian à
chaque geste) :

- **Transport** : une API HTTPS, en JSON, et non une connexion à la base. Son adresse est fixée par
  la configuration du déploiement, de chaque côté ; jamais par une requête ni par un réglage
  d'administration (comme l'adresse verrouillée de l'ADR-012 §4).
- **Signature** : HMAC-SHA256 avec un secret partagé, gardé dans le `.env` de chaque serveur, jamais
  dans le dépôt. La signature couvre la méthode, le chemin, un horodatage, un nonce et l'empreinte
  SHA-256 du corps ; elle est comparée en temps constant ; une requête hors d'une fenêtre de cinq
  minutes, ou dont le nonce a déjà servi, est refusée. Deux secrets sont acceptés le temps d'une
  rotation.
- **Idempotence** : toute écriture porte une clé d'idempotence (par exemple le run et l'opération) ;
  le rejeu rend la première réponse.
- **Identité commune : le courriel**, normalisé (espaces retirés, minuscules). Une école de humanome
  garde l'identifiant de son établissement chez EduChat, ajouté par S6c. Le maître du registre des
  écoles — EduChat, d'après le TODO — est une décision de Christian.
- **Une réservation par run, pas par appel** : un run complet fait des milliers d'appels (2 740
  pour PLANT-01, d'après l'analyse des sprints). Au lancement, le run réserve chez EduChat ce que
  son admission lui accorde (`Lancement::prevoir`) ; ses réserves par appel restent locales, dans
  cette allocation ; à sa fin, et à chacun de ses arrêts, il règle son coût réel. Un grand livre
  injoignable au lancement : l'analyse ne part pas, avec un message clair. Un run en cours vit sur
  son allocation ; son règlement est rejoué, de façon idempotente, par le tick.
- **La devise** : chaque montant est un entier en micro-unités, avec sa devise ISO 4217 explicite.
  Humanome compte en USD prépayés ; EduChat, d'après l'analyse des sprints, en jetons facturés après
  coup. Prépayé ou facturé après coup, la devise commune et la conversion sont des décisions de
  Christian.
- **La surtaxe** : humanome applique les bornes fixes de R4. L'analyse des sprints a relevé, dans un
  travail d'EduChat non commité, un plancher calculé plutôt que 3,5 % ; l'écart reste ouvert pour
  S6c, et cet ADR ne le tranche pas.
- **RGPD** : les courriels des élèves entre deux hébergeurs, au registre et dans la sous-traitance,
  avant le premier échange.

**S6d — Stripe et PayPal réel** (accord de Christian à chaque geste) :

- La recharge du **crédit d'école** seulement, par Stripe Checkout, en mode test puis réel.
- Le webhook est vérifié par sa signature (`Stripe-Signature`, HMAC-SHA256 de l'horodatage et du
  corps avec le secret du point d'arrivée, une tolérance de cinq minutes) et idempotent par
  l'identifiant de l'événement, comme la capture PayPal l'est par `paypal_order_id` (clé unique).
  Le montant crédité est celui que Stripe rapporte, jamais celui du client ; la session est liée à
  l'école qui l'a créée, comme l'ordre PayPal à son créateur.
- Aucune donnée de carte ne passe par humanome ; les secrets restent dans l'environnement.
- PayPal réel pour les écoles : la bascule `sandbox`/`live` de l'environnement existe déjà ; la
  faire est un geste de Christian.

### 10. Découpage et migrations

- **S6a — la politique des clés et des crédits** : §5 ; §6 sans la voie `ecole` (le profil refuse
  `personnelle`, aucun run nouveau ne lit plus de clé personnelle, test des empreintes) ; le
  script de purge, versionné, jamais lancé ; packs réservés aux écoles. Migration **036** :
  `user_api_keys.avis_purge_at`.
- **S6b — l'école** : ses réglages (surtaxe, plafond par élève), sa clé, ses membres et leurs
  dépenses dans l'espace établissement ; le crédit d'école débité par les runs et la cartographie
  ouverte de ses élèves ; la voie `ecole` de Twin9 ; la couture du grand livre (§9). Migration
  **037** : `ecoles`, `ecole_cles`, `ecole_consommations`, `twin9_runs.payeur_id` et
  `facteur_prix`, `twin9_credit_events.beneficiaire_id`, la valeur `ecole` de `twin9_lots.cle`,
  l'école de `twin9_lots_a_effacer`. RESPIRE#0 par le script hors dépôt, en base de test.
- 036 et 037 sont des expansions : tables nouvelles, colonnes qui peuvent être nulles, valeur
  ajoutée en fin d'énumération ; la release précédente les ignore (ADR-008).
- Documents à suivre, dans le lot qui change le comportement : `docs/autorisations.md` (routes des
  clés, des packs, de l'école), `docs/contrats.md` (le `cle` du profil et du run),
  `docs/rgpd-registre.md` (§6, §9, §11, §13), `docs/roles.md`, les cas d'utilisation.

## Conséquences

Positives :

- R1 tient : plus aucune clé d'utilisateur n'est écrite, et l'interface le dit. Seule l'école garde
  la sienne, pour ses élèves.
- R2 tient : aucun particulier n'achète ; aucun contrôle d'âge n'est nécessaire pour un achat.
- Le crédit d'école réutilise le solde, le grand livre, les factures et la recharge idempotente
  existants : pas de second système de paiement à entretenir.
- Aucune empreinte de profil ne change ; la mémoire des cartes et les prévisions restent valables.
- La couture du grand livre laisse S6c changer de lieu de vérité sans toucher aux runs.

Négatives / à assumer :

- Un particulier hors de toute école, son solde épuisé, n'a plus de Twin9 ; la promotion « Twin9
  sur sa propre clé » disparaît avec la voie personnelle.
- Le plafond par élève par défaut à 0 bloque les usages payants d'une école tant qu'elle ne l'a pas
  réglé ; l'espace établissement doit le montrer en premier.
- Avec la clé de l'école, l'école peut relire dans sa Console les résultats des lots de ses élèves.
- Les runs de masse sur la clé de l'instance restent facturés après coup jusqu'à leur lot.
- Deux comptabilités coexistent jusqu'à S6c (humanome prépayé en USD, EduChat facturé après coup).
- Les clés déjà gardées le restent jusqu'à la purge, que personne ne lance automatiquement.

Réversibilité : rouvrir le stockage des clés d'utilisateur serait un nouvel ADR, qui contredirait
R1. Le crédit d'école, le plafond et la surtaxe sont des données de l'école, sans effet sur les
profils ; la voie `ecole` se ferme en retirant les clés d'école, sans réécrire un profil.

## À signaler à Christian

Les décisions (a) à (h) du §2, prises par délégation, et ces détails, fixés par cet ADR :

1. La surtaxe vaut 3,5 % par défaut, au centième, figée au lancement de chaque run.
2. Le plafond par élève est mensuel (mois UTC), le même pour tous les élèves d'une école, à 0 par
   défaut.
3. Un élève de deux écoles choisit son payeur au lancement ; un élève peut aussi choisir son solde
   restant, qui reste le sien (c).
4. `GET /api/keys/{provider}` reste ouvert au propriétaire jusqu'à la purge, pour recopier sa clé
   dans son navigateur avant de la supprimer.
5. Délai de 30 jours entre l'avis et la purge ; moyen de lancer le script en production à décider.
6. La clé d'école ne sert que chez Anthropic, comme la clé personnelle de l'ADR-012 §5 ; aucun
   interrupteur d'administration à part.
7. Les runs de masse sur la clé de l'instance gardent leur facturation après coup jusqu'à un lot à
   part, après S6b.
8. Un particulier sans école, son solde épuisé, n'a plus de Twin9 ; la promotion
   `twin9_cle_perso_ouverte` disparaît.
9. L'école voit ce que chacun de ses élèves a dépensé (montants seulement) ; le consentement de la
   cohorte l'ajoute pour les nouvelles adhésions. Les adhésions antérieures restent à traiter.
10. Restent à Christian, pour S6c et S6d : prépayé ou facturé après coup, la devise et la
    conversion, le maître du registre, le plancher de la surtaxe face à celui d'EduChat, Stripe en
    test puis en réel, PayPal réel, la création de RESPIRE#0 et de RESPIRE#1 en production.

Décisions liées : ADR-004, ADR-005, ADR-008, ADR-010, ADR-011, ADR-012.
