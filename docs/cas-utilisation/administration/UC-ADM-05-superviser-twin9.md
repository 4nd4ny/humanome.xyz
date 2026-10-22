# UC-ADM-05 — Superviser Twin9

| Champ | Valeur |
|---|---|
| **Acteur principal** | Administrateur (rôle `admin`) |
| **Acteurs secondaires** | Apprenants et établissements (offre, prix, promotion et fournisseurs ouverts appliqués à leurs analyses et à leurs profils, UC-APP-09/10/11) ; PayPal (montants des packs) ; Anthropic (page des prix, relevée chaque jour, A6) ; le déclencheur externe du worker (T18), qui fait le relevé ; les autres fournisseurs des appels Twin9 (OpenAI, Mistral AI, Google, xAI, OpenRouter : A7, A8, ADR-012) |
| **Portée** | humanome.xyz — vue `#/admin/twin9` (section « Supervision Twin9 » de l'administration), routes `GET/PUT /api/twin9/admin/config`, `GET /api/twin9/admin/comptes`, `GET /api/twin9/admin/jeux`, `PUT /api/twin9/admin/jeux/defaut` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.8 et §4.10 (administration), §7 (modèle économique : coût API + marge) ; ADR-010 §3 et §6 ; décision AD-D2 (`docs/autorisations.md`) |
| **Statut** | Implémenté (supervision commerciale séparée de l'atelier des gabarits, AD-D2 ; fournisseurs des appels Twin9 à l'écran le 2026-10-22, ADR-012) |

## Objectif

Permettre à l'administrateur de piloter l'offre commerciale de Twin9 et de la
cartographie ouverte Twin6 — contributions (marges), promotion « Twin9 avec sa
propre clé », packs de recharge, modèles et leurs prix, que la plateforme
relève chaque jour sur la page d'Anthropic (A6) —, d'ouvrir aux runs Twin9
d'autres fournisseurs qu'Anthropic et de tarifer leurs modèles (A7, A8), de
fixer le jeu de gabarits par défaut (T14) et de suivre les soldes et cumuls de
tous les comptes qui utilisent le crédit prépayé, **sans jamais voir le
contenu des gabarits** (réservé à l'atelier, UC-PRO-08).

## Déclencheur

L'administrateur ouvre « Administrer » → « Supervision Twin9 » (`#/admin/twin9`).

## Préconditions

- Le compte porte le rôle `admin` (UC-ADM-01).

## Garanties en cas de succès

- La configuration enregistrée est complète et valide ; elle s'applique
  immédiatement à l'offre publique (`/api/twin9/meta`), aux profils et à
  l'estimation des runs Twin9, à la facturation de leurs appels et de ceux de
  la cartographie ouverte, et aux ordres PayPal.
- L'administrateur voit, pour chaque compte ayant une activité, le solde, les
  cumuls et la date de dernière activité.

## Garanties minimales (en cas d'échec)

- Une mise à jour refusée ne modifie rien.
- Les apprenants ne voient jamais les prix catalogue ni les marges.

## Scénario nominal

1. L'administrateur ouvre `#/admin/twin9` ; la vue d'administration vérifie la
   session et le rôle `admin`.
2. La section charge `GET /api/twin9/admin/config` (forme administrateur :
   contributions `marge` et `marge_twin6`, promotion, packs, modèles avec prix
   **catalogue** — l'interrupteur, le rythme, les réglages du pipeline et les
   étages de l'offre sont partis le 2026-10-20, voir Limites —, fournisseurs
   ouverts aux runs, et en lecture seule chaque fournisseur avec son étiquette
   RGPD et la présence de la clé de l'instance, A7) et
   `GET /api/twin9/admin/comptes`.
3. Elle affiche le formulaire des réglages, le jeu de gabarits par défaut (A5),
   la table des comptes et un renvoi vers l'atelier (`#/twin9-atelier`) pour
   les gabarits.
4. L'administrateur modifie la contribution Twin9 (par exemple 1,20 → 1,35) et
   clique « Enregistrer les réglages ». La vue calcule le **diff** (seules les
   clés de premier niveau modifiées), le vérifie sommairement et envoie
   `PUT /api/twin9/admin/config {marge: 1.35}` avec le jeton CSRF (vérifié par
   `CsrfMiddleware` avant la route, E5).
5. Le serveur refuse toute clé inconnue, fusionne le diff avec la configuration
   effective (fusion de **premier niveau** : une clé envoyée remplace
   entièrement sa valeur), **revalide l'ensemble**, enregistre la configuration
   **complète**, défauts compris (réglage `twin9_config`), et renvoie la nouvelle
   configuration ; la vue affiche « Réglages Twin9 enregistrés. » et se
   resynchronise : la configuration renvoyée devient la référence du diff
   suivant.
6. L'effet est immédiat : un run Twin9 s'estime (aperçu, UC-APP-10) et ses
   appels se paient au nouveau taux ; `/api/twin9/meta` publie les nouveaux
   prix de la cartographie ouverte, dont les appels sont facturés au taux de
   `marge_twin6`.
7. La table des comptes liste les comptes ayant au moins un mouvement au
   grand-livre, du plus récemment actif au moins récent, avec solde, recharges
   cumulées, consommé cumulé et dernière activité.

## Scénarios alternatifs

- **A1 — Promotion « Twin9 avec sa propre clé »** (étape 4) : la case ouvre ou
  ferme la fenêtre promotionnelle ; ouverte, un apprenant ayant enregistré sa
  clé peut régler un profil à clé personnelle et lancer Twin9 sans débit ni
  contribution (UC-APP-10 A6) ; fermée, un tel profil est refusé (`422`), à
  l'enregistrement comme au lancement. La clé de l'instance reste facturée
  dans les deux cas.
- **A2 — Grille de packs** (étape 4) : ajout, modification ou suppression de
  packs (montant + libellé) ; l'offre publique et le montant des ordres PayPal
  suivent (UC-APP-11). Un pack est désigné par sa **position** (`pack_index`) :
  une page apprenant chargée avant un changement de grille crée un ordre pour le
  pack qui occupe désormais cet index (voir Limites).
- **A3 — Offre de modèles** (étape 4) : ajout, suppression, prix catalogue
  [entrée, sortie] ; un profil qui nomme un modèle sans prix sur l'instance est
  refusé (`422`), à l'enregistrement comme au lancement, et un modèle de
  l'offre sert à tout étage d'un profil. Un modèle ne porte que ses prix (et le
  palier des longs prompts, que le formulaire n'édite pas) : ses étages sont
  partis le 2026-10-20 (voir Limites). Un prix saisi ici tient jusqu'au relevé
  suivant (A6), qui récrit ceux d'un modèle que la page d'Anthropic donne : la
  contribution de la plateforme se règle par la marge (RG2), pas par le prix
  catalogue.
- **A7 — Fournisseurs des appels Twin9** (ADR-012, étape 4) : sous « Fournisseurs
  des appels Twin9 », chaque fournisseur du registre, son étiquette RGPD
  (indicative, pas un avis juridique), sa voie (Anthropic : par lots ou en
  direct ; les autres : en direct) et la clé de l'instance « posée » ou
  « absente », avec le nom de sa variable d'environnement — un booléen, jamais
  la clé (`fournisseurs`, que `GET` et `PUT` renvoient et qu'aucun `PUT` ne
  prend). Une case par fournisseur l'ouvre aux runs (`twin9_fournisseurs_ouverts`,
  Anthropic seul par défaut, envoyé dans l'ordre du registre et seulement s'il
  change) ; un fournisseur étiqueté « non » (Google, xAI, OpenRouter) ne se coche
  qu'une fois l'interrupteur « Permettre d'ouvrir les fournisseurs étiquetés
  « non » au regard du RGPD » coché (`twin9_fournisseurs_non_rgpd`, fermé par
  défaut), et le décocher referme ces fournisseurs avec lui, que le serveur
  refuserait sinon. Un profil peut nommer un fournisseur fermé : il
  s'enregistre, ne se lance pas (UC-APP-10 A9) ; un run en cours n'envoie
  plus rien à un fournisseur refermé dès sa tranche suivante : ses appels
  l'attendent, sa page dit pourquoi, ses autres fournisseurs continuent.
- **A8 — Modèles d'un autre fournisseur** (ADR-012, étape 4) : une ligne de l'offre
  choisit son fournisseur ; hors d'Anthropic, sa clé est « fournisseur:modèle »
  et elle porte, saisis à la main (aucun relevé ne les touche), son plafond de
  sortie, son plafond de réflexion, la durée maximale d'un appel (30 s
  proposées pour un modèle ajouté, au plus ce que laisse au départ d'un appel
  la tranche la plus courte que sert l'instance — la sienne, ou celle du
  déclencheur, que la section dit) et, chez OpenAI et Google, son réglage de
  raisonnement (RG11). Ces champs n'existent pas pour un modèle d'Anthropic.
  Un modèle dont un appel a coûté plus que sa réserve (l'instance a payé
  l'excédent) est signalé sur sa ligne, « pire cas insuffisant », avec le plus
  grand excédent et depuis quand ; il est refusé au lancement tant que ses
  plafonds n'ont pas changé (2026-10-22).
- ~~**A4 — Réglages hors formulaire**~~ : retiré le 2026-10-20 avec
  l'interrupteur `enabled`, le rythme `appels_par_minute` et les réglages du
  `pipeline`, à la demande de Christian (voir Limites). La fusion de premier
  niveau demeure (RG7) : un `PUT {packs: [...]}` **remplace** toute la grille,
  de même pour `modeles`.
- **A5 — Jeu de gabarits par défaut** (T14, étape 3) : la section lit `GET
  /api/twin9/admin/jeux` — le jeu v9.8 et les copies des promptologues, par
  leur nom et leur auteur, **sans contenu** — et propose le jeu par défaut ;
  « Enregistrer » envoie `PUT /api/twin9/admin/jeux/defaut {jeu}` (jeton CSRF)
  et affiche « Jeu par défaut : « {jeu} ». ». Le profil par défaut, celui
  qu'ouvre la page Configuration et que prend un run lancé sans profil, prend
  ce jeu (UC-PRO-08, RG11). Un profil déjà enregistré ne change pas : s'il
  nommait l'ancien jeu par défaut, que son propriétaire ne peut plus choisir,
  il est refusé au lancement jusqu'à ce qu'il en choisisse un autre. Un jeu
  inconnu → `404` « Jeu de gabarits introuvable », affiché.
- **A6 — Relevé quotidien des prix** (2026-10-21, sans geste de
  l'administrateur ; Christian : « Corrige la surfacturation de Sonnet et
  prévois une mise à jour quotidienne de la grille de tarification ») : après sa
  tranche, le déclencheur du worker (`POST /api/admin/worker-tick`, et le cron
  `php scripts/worker.php` depuis le 2026-10-22, UC-SYS-01-F26) lit la page
  des prix d'Anthropic (sa version markdown), une fois par jour UTC, et récrit
  les prix et le palier long des modèles de l'offre que son tableau « Model
  pricing » donne (RG9). La grille de juillet, qui facturait Sonnet 5 à 3 $ /
  15 $ le million quand Anthropic le vend 2 $ / 10 $, est ainsi corrigée au
  premier tick, sans geste de production. Sous l'offre de modèles, la section
  affiche le dernier relevé : sa date, les prix changés (avant → après), les
  modèles absents de la page (prix inchangés), ou l'échec de la dernière
  tentative et sa raison (« La grille garde ses prix ; le déclencheur réessaie
  dans l'heure. »). `GET` et `PUT /api/twin9/admin/config` le renvoient
  (`releve_tarifs`), jamais l'offre publique ; la vue ne le renvoie jamais dans
  un `PUT`.

## Scénarios d'erreur

- **E1 — Compte non administrateur** (étape 1) : la vue affiche « Cet espace est
  réservé à l'administration de la plateforme » sans rien charger ; l'API
  répond `401` sans session et `403` à tout autre rôle (apprenant, promptologue,
  établissement) ; un refus n'ouvre évidemment pas la promotion.
- **E2 — Mise à jour refusée par le serveur** (étape 5) : corps scalaire ou JSON
  invalide → `400` ; un tableau JSON est traité comme un objet : `[]` (ou corps
  vide) est accepté sans changement (`200`), une liste non vide donne `422
  « Clé de configuration inconnue : 0 »` ; clé inconnue ou valeur hors bornes →
  `422` avec un message précis
  (« Marge hors bornes (entre 1 et 5) », « Modèle m : clé inconnue etages »,
  « Clé de configuration inconnue : appels_par_minute ») ; rien n'est modifié ;
  la vue affiche le message et garde la saisie.
- **E3 — Saisie invalide détectée dans le navigateur** (étape 4) : contribution
  Twin9 ou Twin6 non numérique, identifiant de modèle vide, prix ou montant de
  pack non numérique, et pour le modèle d'un autre fournisseur un plafond de
  sortie qui n'est pas un entier strictement positif, un plafond de réflexion
  qui n'est pas un entier, une durée hors de 1 à 45 s → message, aucun envoi.
- **E4 — Chargement impossible** (étape 2) : erreur serveur → « Chargement
  impossible. » ; copie statique → message d'indisponibilité d'`AdminView`
  (« Copie statique du site… »), la section n'est pas montée.
- **E5 — Jeton CSRF absent ou invalide** (étape 4) : une session admin sans
  `X-CSRF-Token` valide → `403 {error: "Jeton CSRF absent ou invalide"}` ; rien
  n'est modifié.

## Règles de gestion

- **RG1** — Supervision = `admin` seul (`RequireRole::any('admin')`), jeu de
  gabarits par défaut compris ; le contenu des gabarits exige `admin` ∧
  `promptologue` et vit dans l'atelier (AD-D2).
- **RG2** — Contributions : `marge` (Twin9, 1,20 par défaut) et `marge_twin6`
  (1,10 par défaut), nombres entre 1 et 5. Les apprenants ne voient que les prix
  margés de la cartographie ouverte (arrondis à 4 décimales) et les coûts
  estimés de leurs runs Twin9, jamais la marge ni le prix catalogue.
- **RG3** — Packs : liste non vide ; montant entre 1 et 500 USD ; libellé non
  vide ; par défaut 10, 20, 50, 100, 200 et 500 USD.
- **RG4** — Modèles : au moins un ; prix `[entrée, sortie]` strictement positifs
  (USD par million de tokens) ; palier des longs prompts facultatif ; aucune
  autre clé (les étages sont partis le 2026-10-20).
- **RG5** — Promotion : booléen, fermée par défaut ; elle n'ouvre que les
  profils à clé personnelle.
- ~~**RG6**~~ — retirée le 2026-10-20 avec `enabled`, `appels_par_minute` et
  `pipeline` : ce sont désormais des clés inconnues (`422`) ; stockées par une
  instance plus ancienne, elles sont ignorées à la lecture et l'enregistrement
  suivant les efface (voir Limites).
- **RG7** — Mise à jour partielle : clés inconnues refusées, fusion de premier
  niveau, configuration complète revalidée avant écriture. Toute mise à jour
  persiste la configuration **complète**, défauts compris : les défauts du code
  ne complètent plus ensuite que les clés ajoutées après coup (la migration 014
  a dû corriger une marge ainsi figée). À la lecture, les clés stockées
  inconnues sont ignorées, comme les étages qu'un modèle portait avant le
  2026-10-20 ; l'enregistrement suivant les efface. (Jusqu'au 2026-10-20,
  l'import écrivait aussi la configuration, en ouvrant l'interrupteur.)
- **RG8** — Comptes : uniquement ceux qui ont au moins un événement au
  grand-livre ; compteurs et montants seulement.
- **RG10** — Fournisseurs (A7, ADR-012) : `twin9_fournisseurs_ouverts`, liste
  d'identifiants du registre sans doublon, `["anthropic"]` par défaut ;
  `twin9_fournisseurs_non_rgpd`, booléen, `false` par défaut ; un fournisseur
  étiqueté « non » ouvert sans lui → `422`. La clé de l'instance d'un
  fournisseur vient de l'environnement (`api/.env.example`), jamais de
  l'interface ; l'administrateur seul apprend si elle est posée, une page
  d'utilisateur ne lit qu'un booléen `disponible` sans sa cause.
- **RG11** — Grille d'un autre fournisseur (A8, `Twin9Config::validerTiers`) :
  clé « fournisseur:modèle », le modèle suivant le motif de son fournisseur ;
  `plafond_sortie` entier > 0 (32 768 au plus chez Google, requête non
  streamée) ; `plafond_reflexion` entier ≥ 0 (> 0 chez xAI, dont le
  raisonnement ne se coupe pas) ; `duree_max_s` de 1 à 45 ; `reflexion_param`
  chez OpenAI et Google seulement, parmi les valeurs que leur documentation
  liste (un mauvais choix pour un modèle fait refuser ses appels, `400`). Ces
  champs sont refusés sur un modèle d'Anthropic ; le relevé (A6) et l'offre
  publique ignorent les clés à « : ».
- **RG9** — Relevé des prix (A6, `Twin9\TarifsAnthropic`) : dû quand aucun
  relevé n'a réussi ce jour UTC, et qu'une heure a passé depuis une tentative
  échouée ; fait sous verrou MySQL (`GET_LOCK`), un seul processus à la fois ;
  seulement si `ANTHROPIC_API_KEY` est posée (une instance qui ne paie aucun
  appel Anthropic n'a rien à tarifer). Les colonnes du tableau « Model pricing »
  sont trouvées par leurs titres (« Model », « Base input tokens », « Output
  tokens »), l'identifiant d'un modèle par son nom (« Claude Haiku 4.5 » →
  `claude-haiku-4-5`, qu'un identifiant daté de la grille retrouve sans sa
  date), les deux lignes de Haiku 5.5 (« up to / over 100,000 tokens ») en un
  prix de base et un palier long ; aucun autre tableau n'est lu (lots,
  cache…). Seuls les modèles de l'offre sont récrits — l'offre reste le choix
  de l'administrateur — ; un modèle absent de la page garde ses prix et est
  nommé. Une page illisible (réseau, statut HTTP, section, tableau ou colonnes
  introuvables, prix illisible ou hors de ]0 ; 1000], palier sans prix de base,
  moins de trois modèles) ne change rien : l'état dit pourquoi, et le dernier
  relevé réussi reste affiché. Deux lectures qui seraient fausses en silence
  échouent de même (revue indépendante du 2026-10-21) : un modèle qui figure
  deux fois dans le tableau — un libellé de palier que le code ne reconnaît
  plus ferait écraser son prix de base par celui des longs prompts, cinq fois
  plus cher — et un palier long de la grille que la page ne donne plus — il a pu
  passer dans un autre tableau, et l'ôter tarifierait les longs prompts de
  Haiku 5.5 au cinquième de leur prix. Une personne en décide. Un prix changé laisse l'événement d'audit
  `twin9_tarifs_mis_a_jour` (modèle, avant, après) ; l'état vit dans le réglage
  `twin9_tarifs`. Des prix seulement, jamais une donnée personnelle.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Configuration Twin9 | Réglage `twin9_config` (table `settings`) ; aucune donnée personnelle |
| Relevé des prix (A6) | Réglage `twin9_tarifs` : source, date, statut, changements, modèles absents ; événement `twin9_tarifs_mis_a_jour` ; aucune donnée personnelle, la page d'Anthropic lue sans rien lui envoyer |
| Jeu de gabarits par défaut | Réglage `twin9_gabarits_defaut` (son identifiant seul) ; la liste des jeux montre le nom affiché de l'auteur d'une copie, jamais un gabarit |
| Table des comptes | Nom affiché et email des comptes actifs, solde, cumuls, dernière activité — visibles de l'administrateur seul, jamais de contenu |
| Prix catalogue et marges | Vue administrateur seulement |
| Fournisseurs ouverts, étiquettes RGPD, présence des clés de l'instance (A7) | Réglage `twin9_config` ; la présence d'une clé est un booléen lu dans l'environnement à chaque requête, jamais la clé ; administrateur seul. Ouvrir un fournisseur l'ajoute aux destinataires des runs Twin9 (`docs/rgpd-registre.md` §13, politique de confidentialité), que l'accord de chaque lancement nomme |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash` ; `web/src/nav.js` — `navGroups` | Route `#/admin/twin9`, entrée réservée à l'admin |
| Front | `web/src/views/AdminView.jsx` | Garde de session et de rôle, dépêche de la section |
| Front | `web/src/views/admin/Twin9Section.jsx` | Réglages (diff, validation cliente), fournisseurs (A7), modèles d'un autre fournisseur (A8), état du relevé des prix (`ReleveTarifs`, A6), jeu de gabarits par défaut, table des comptes |
| Front | `web/src/views/configuration/profilSchema.js` — `FOURNISSEURS`, `RGPD_FOURNISSEURS`, `REFLEXION_PARAMS`, `clePrix`, `depuisClePrix` | Registre recopié du PHP (comparé par un test) |
| Front | `web/src/api/twin9.js` — `fetchTwin9Config`, `saveTwin9Config`, `fetchComptes`, `fetchJeux`, `fixerJeuDefaut`, `formatUsd` | Client de supervision |
| API | `GET/PUT /api/twin9/admin/config`, `GET /api/twin9/admin/comptes`, `GET /api/twin9/admin/jeux`, `PUT /api/twin9/admin/jeux/defaut` — `api/src/routes/twin9.php` | Routes de supervision (admin) |
| API | `api/src/Middleware/RequireRole.php` — `any('admin')` | Garde admin (401 / 403, RG1, E1) — logique unitaire couverte par UC-ADM-01-U10 |
| API | `api/src/Middleware/CsrfMiddleware.php` | Jeton CSRF des mutations (E5) — logique unitaire couverte par UC-CPT-02-U07 |
| Domaine | `api/src/Twin9/Twin9Config.php` — `read`, `update`, `defaults`, `publicView`, `validerTiers` | Configuration effective, validation (RG10, RG11), vue publique |
| Domaine | `api/src/Twin9/Fournisseurs/Fournisseurs.php` — `REGISTRE`, `actifs`, `pourAdministrateur` | Les fournisseurs, ceux qu'un run atteint, ce que l'administrateur en lit (A7) |
| Domaine | `api/src/Twin9/FactureService.php` — `comptes` | Table de supervision |
| Domaine | `api/src/Twin9/TarifsAnthropic.php` — `releverSiDu`, `du`, `relever`, `lire`, `appliquer`, `etat` | Relevé quotidien des prix (A6, RG9) |
| API | `POST /api/admin/worker-tick` — `api/src/routes/worker.php` | Fait le relevé après sa tranche, quand il est dû (compteur `tarifs`) |
| Domaine | `api/src/Twin9/TemplateSets.php` — `lister`, `defaut`, `fixerDefaut` | Jeux de gabarits, jeu par défaut (A5) |
| Domaine | `api/src/Packages/SettingsRepository.php` | Persistance |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-ADM-05-U01 | `parseHash`, `navGroups` | `#/admin/twin9`, entrée réservée à l'admin (RG1) | `web/test/usecases/unit/uc-adm-05-superviser-twin9.test.jsx` |
| UC-ADM-05-U02 | client de supervision | GET config/comptes, PUT partiel avec CSRF | idem |
| UC-ADM-05-U03 | `Twin9Section` (diff) | Rien modifié → aucun PUT ; contribution seule | idem |
| UC-ADM-05-U04 | `Twin9Section` (diff) | Pack supprimé, prix d'entrée modifié ; un modèle n'a plus d'étages | idem |
| UC-ADM-05-U05 | `Twin9Section` (validation) | Contributions Twin9 / Twin6, montant de pack, identifiant, prix invalides → aucun PUT (E3) | idem |
| UC-ADM-05-U06 | `Twin9Section` (diff) | **Anomalie 1 figée** : config relue de MySQL → packs renvoyés (les modèles ne le sont plus depuis T10) | idem |
| UC-ADM-05-U07 | `Twin9Section` (comptes), `formatUsd` | Montants en USD (4 décimales sous le centime) ; aucun compte → message | idem |
| UC-ADM-05-U13 | `AdminView` | Admin → section Twin9 ; non-admin → espace réservé sans appel ; copie statique → message (RG1, E1, E4) | idem |
| UC-ADM-05-U14 | `Twin9Section` (jeu par défaut) | Jeux par leur nom et leur auteur, sans contenu ; « Enregistrer » désactivé sur le défaut actuel, puis `PUT jeux/defaut {jeu}` (A5) | idem |
| UC-ADM-05-U19 | `Twin9Section` (`ReleveTarifs`) | L'état du relevé sous l'offre de modèles : aucun relevé, puis ses changements et les modèles absents de la page, ou l'échec et sa raison ; jamais renvoyé dans le `PUT` (A6) | idem |
| UC-ADM-05-U20 | `Twin9Section` (fournisseurs) | Chaque fournisseur, son étiquette RGPD, sa voie, sa clé d'instance posée ou absente ; rien de modifié → aucun `PUT` (offre relue dans un autre ordre comprise) ; Mistral AI ouvert → `{twin9_fournisseurs_ouverts}` seul ; un fournisseur « non » attend le second interrupteur, que refermer referme avec lui (A7, RG10) | idem |
| UC-ADM-05-U21 | `Twin9Section` (grille tierce) | Le modèle d'un autre fournisseur : son fournisseur, ses plafonds, son réglage de raisonnement (OpenAI et Google) ; une modification ne change que sa valeur ; un modèle ajouté, à 30 s ; plafonds invalides → message, aucun `PUT` (A8, RG11, E3) | idem |
| UC-ADM-05-U08 | `Twin9Config::update` | Fusion partielle, persistance de la configuration complète (défauts figés), clé inconnue refusée sans écriture (RG7) | `api/tests/UseCases/Unit/UcAdm05SuperviserTwin9Test.php` |
| UC-ADM-05-U09 | `Twin9Config::update` | Bornes de chaque réglage (RG2-RG5) ; un modèle ne porte que ses prix (RG4) ; les réglages retirés le 2026-10-20 sont des clés inconnues ; configuration entière inchangée après les refus | idem |
| UC-ADM-05-U10 | `Twin9Config::update` | **Anomalie 2 figée** : message « 1 et 100 USD » pour une borne à 500 | idem |
| UC-ADM-05-U11 | `Twin9Config::read`, `publicView` | Défauts, clés obsolètes ignorées (dont les réglages retirés et les étages d'un modèle, effacés au prochain enregistrement) ; vue publique sans marge, sans promotion, sans offre Twin9 (T11) | idem |
| UC-ADM-05-U12 | `FactureService::comptes` | Comptes actifs, cumuls, ordre ; **anomalie 3 figée** | idem |
| UC-ADM-05-U15 | `TarifsAnthropic::lire` | Le tableau « Model pricing », colonnes trouvées par leurs titres : un identifiant par nom, liens et notes ôtés, le palier long de Haiku 5.5 ; le tableau d'une autre section jamais lu (RG9) | idem |
| UC-ADM-05-U16 | `TarifsAnthropic::lire` | Une page qu'on ne sait pas lire est refusée en entier : section, tableau ou colonnes absents, prix illisible ou hors bornes, palier sans prix de base, un modèle deux fois (un libellé de palier qu'on ne reconnaît plus), trop peu de modèles (RG9) | idem |
| UC-ADM-05-U17 | `TarifsAnthropic::appliquer` | Seuls les modèles de la grille sont récrits, prix et palier long tels que la page les donne (un identifiant daté retrouve son modèle) ; un modèle absent garde ses prix et est nommé ; 2 et 2,0 sont un même prix ; un palier long que la page ne donne plus fait échouer le relevé (RG9) | idem |
| UC-ADM-05-U18 | `TarifsAnthropic::du`, `relever` | Dû une fois par jour UTC, une heure entre deux tentatives après un échec ; un échec garde le dernier relevé réussi et ne touche pas la grille (RG9) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-ADM-05-F01 | Nominal | IHM | `<App/>` : réglages et comptes, contribution modifiée → PUT partiel avec CSRF, confirmation, resynchronisation (second enregistrement : « Aucune modification ») ; aucun appel aux gabarits | `web/test/usecases/functional/uc-adm-05-superviser-twin9.test.jsx` |
| UC-ADM-05-F02 | A1 | IHM | Promotion ouverte → `{twin9_cle_perso_ouverte: true}` | idem |
| UC-ADM-05-F03 | A2 | IHM | Pack ajouté → liste complète envoyée ; **anomalie 2 figée** (borne affichée) | idem |
| UC-ADM-05-F04 | A3 | IHM | Prix modifié → `modeles` envoyé ; plus d'étages | idem |
| UC-ADM-05-F05 | E1 | IHM | Promptologue : espace réservé, rien chargé | idem |
| UC-ADM-05-F06 | E2 | IHM | 422 serveur : message affiché, saisie gardée | idem |
| UC-ADM-05-F07 | E3 | IHM | Identifiant vide : message, aucun PUT | idem |
| UC-ADM-05-F08 | E4 | IHM | Erreur de chargement : message, pas de formulaire ; copie statique : message, aucun appel de supervision | idem |
| UC-ADM-05-F09 | Nominal | API | Contributions changées → l'estimation d'un run Twin9 (×1,5), les prix Twin6 de `/meta` et le coût réel de `/api/twin6/appel` (×1,25) suivent | `api/tests/UseCases/Functional/UcAdm05SuperviserTwin9Test.php` |
| UC-ADM-05-F10 | A1 | API | Promotion fermée : profil à clé personnelle refusé ; ouverte : lue par `/api/twin9/configuration` (plus par `/meta`), admis, estimé sans contribution ; refermée : son lancement refusé ; pendant la promotion, un profil à la clé de l'instance s'estime toujours avec contribution | idem |
| UC-ADM-05-F11 | A2 | API | Packs → `/meta` et montant de l'ordre PayPal ; index hors grille 422 ; limite figée : pack désigné par sa position | idem |
| UC-ADM-05-F12 | A3 | API | Modèle retiré de l'offre : profil qui le nomme refusé (422) ; un modèle de l'offre à tous les étages d'un profil : admis, estimé, lancé ; des étages envoyés pour un modèle → 422 | idem |
| UC-ADM-05-F13 | Nominal (étape 7) | API | Table des comptes : actifs seulement, ordre, montants | idem |
| UC-ADM-05-F14 | E1 | API | 401 visiteur ; 403 apprenant, promptologue, établissement ; la promotion reste fermée | idem |
| UC-ADM-05-F15 | E2 | API | 400 corps scalaire ; `[1]` → 422, `[]` → 200 ; 422 par cas, dont les réglages retirés ; configuration entière inchangée | idem |
| UC-ADM-05-F16 | Anomalie 1 | API | Config relue : clés réordonnées par MySQL (cause) | idem |
| UC-ADM-05-F17 | E5 | API | Session admin sans jeton CSRF ou jeton faux → 403, configuration inchangée | idem |
| UC-ADM-05-F18 | A5 | IHM | `<App/>` : la copie d'un promptologue choisie → PUT avec CSRF → confirmation, aucun appel aux gabarits ; jeu inconnu → message du serveur | `web/test/usecases/functional/uc-adm-05-superviser-twin9.test.jsx` |
| UC-ADM-05-F19 | A6 | API | Le déclencheur relève les prix une fois par jour : la grille stockée de juillet (Sonnet 5 à 3 / 15) passe à 2 / 10, l'apprenant le voit sur `/meta`, l'administrateur lit le relevé ; le tick suivant du jour ne relit rien | `api/tests/UseCases/Functional/UcAdm05SuperviserTwin9Test.php` |
| UC-ADM-05-F20 | A6 | API | Une page des prix illisible ne change rien : le tick répond, la grille garde ses prix, l'administrateur lit l'échec et sa raison ; sans clé de la plateforme, aucun relevé | idem |
| UC-ADM-05-F21 | A7, A8, E2 | IHM | `<App/>` : Mistral AI ouvert et un de ses modèles tarifé avec ses plafonds → un `PUT` (CSRF) ; clés de l'instance posée ou absente, jamais montrées ; Google ne se coche qu'avec le second interrupteur, que refermer le referme ; un plafond de sortie que Gemini n'admet pas, refusé par le serveur (`422`) : message, saisie gardée | `web/test/usecases/functional/uc-adm-05-superviser-twin9.test.jsx` |

### Tests existants liés (non-régression)

- `api/tests/Twin9ProtocoleTest.php` — défauts et bornes de la config, vue publique, garde admin de la supervision, jeu de gabarits par défaut (`testTheAdministratorFixesTheDefaultSet`).
- `api/tests/Twin9/JeuxGabaritsTest.php` — le profil par défaut prend le jeu par défaut (A5).
- `api/tests/Twin9FactureTest.php` — `testAdminComptesIsAdminOnlyAndAggregates`.
- `api/tests/Twin9PayPalTest.php` — packs 200 et 500 configurables.
- `web/src/views/admin/Twin9Section.test.jsx` — supervision sans contenu, diff, promotion, pack, comptes, garde d'`AdminView`.
- `api/tests/Twin9/ConfigurationDroitsTest.php` — `testTheProvidersAreOpenedByTheAdministrator` (RG10, admin seul), `testTheAdministratorReadsWhichInstanceKeysAreSet` (A7 : un booléen, jamais la clé, refusé en `PUT`), `testTheInstanceKeyNeverPassesThroughTheInterface`.
- `api/tests/Twin9/CoutsTest.php` — `testTheGridKeepsAThirdPartysCaps` (RG11), `testAThirdPartysWorstCaseCountsItsCaps`.
- `web/src/views/configuration/profilSchema.test.js` — le registre recopié (libellés, étiquettes, motifs de modèle, réglages de raisonnement) égal à celui du PHP.

### Exécuter

```sh
(cd api && vendor/bin/phpunit --filter UcAdm05 --testdox)
cd web && npx vitest run test/usecases/unit/uc-adm-05 test/usecases/functional/uc-adm-05
```

## Anomalies constatées

1. **Diff non minimal après le premier enregistrement.** La configuration est
   stockée dans une colonne JSON MySQL, qui réordonne les clés des objets
   (`{libelle, montant_usd}`, `{palier_long, prix_usd_mtok}`). `Twin9Section` compare
   ses packs et modèles au format `JSON.stringify` : dès que la configuration a
   été enregistrée une fois, **les packs repartent à chaque enregistrement**
   même inchangés, « Aucune modification à enregistrer » ne s'affiche plus, et
   un enregistrement peut écraser la modification concurrente d'un autre
   administrateur sur ces clés. Comme toute mise à jour persiste la
   configuration complète (RG7), le premier enregistrement suffit à la
   déclencher, et elle est ensuite permanente (jusqu'au 2026-10-20, l'import,
   qui écrivait la configuration, la déclenchait dès le déploiement). Les modèles
   repartaient de même jusqu'à T10 : depuis, un modèle garde ce que le
   formulaire n'édite pas (le palier des longs prompts), et avec lui l'ordre
   de ses clés relues. Figé par UC-ADM-05-U06 (cause : UC-ADM-05-F16).
2. **Borne des packs annoncée à 100 USD.** Le serveur accepte jusqu'à 500 USD
   (et propose 200 et 500 par défaut), mais son message de refus dit « montant
   entre 1 et 100 USD » et le champ du formulaire affiche « 1 – 100 »
   (`max="100"`). Figé par UC-ADM-05-U10 et UC-ADM-05-F03.
3. **Consommé cumulé gonflé par les remboursements.** `FactureService::comptes`
   compte comme consommé tout ce qui n'est pas une recharge : un remboursement
   PayPal (UC-APP-11 A3) y apparaît comme une dépense. Figé par UC-ADM-05-U12
   (même cause que l'anomalie 1 de UC-APP-11).
4. **Mises à jour concurrentes perdues côté serveur.** `Twin9Config::update`
   lit la configuration, fusionne puis réécrit **tout** le document, sans verrou
   ni transaction. Deux `PUT` concurrents sur des clés **différentes** (deux
   administrateurs) peuvent se perdre : A lit, B
   lit, B écrit `packs`, A écrit `marge` avec les anciens packs — les packs de B
   disparaissent, même avec un diff minimal. L'anomalie 1 n'est donc pas la
   seule source d'écrasement. Non testable de façon fiable sans concurrence
   réelle : documenté seulement.

## Limites

- Retirés le 2026-10-20, à la demande de Christian : trois réglages que plus
  rien ne commandait depuis T11 (qui a retiré le moteur du navigateur et son
  proxy `/api/twin9/appel`) — l'interrupteur `enabled` et le `pipeline`
  qu'écrivait l'import (les runs prennent leurs réglages dans leur profil), les
  étages des modèles de l'offre qu'éditait le formulaire (un profil ne demande
  à un modèle qu'un prix) —, et le rythme `appels_par_minute`, qui ne bornait
  plus que la cartographie ouverte : ses appels payants ne sont plus limités
  par minute, la dépense restant bornée par le solde prépayé (UC-APP-09).
  Envoyés, ce sont des clés inconnues (`422`) ; stockés, ils sont ignorés à la
  lecture et partent au prochain enregistrement. Aucune migration ne les efface
  encore, ni le réglage `twin9_fiches` : ce serait une contraction, qui attend
  que la release qui ne les lit plus soit stabilisée en production (ADR-008).
- Le relevé des prix (A6) lit une page de documentation, pas une API. Une
  mise en forme nouvelle de son tableau le fait échouer quand le code s'en
  aperçoit — colonnes ou section renommées, prix illisible, un modèle deux fois,
  un palier disparu (RG9) : la grille garde alors ses derniers prix, et l'échec
  s'affiche jusqu'à ce que le code suive. Une baisse de prix, elle, s'applique
  sans contrôle de vraisemblance : Anthropic en a fait de fortes (Opus 4.5), et
  un seuil les bloquerait ; le budget de la démo n'en dépend pas, `Pricing`
  prenant le plus haut de la grille et de sa table (UC-VIS-03 RG4).
  Il ne relit que les modèles de l'offre : ajouter un modèle reste un geste de
  l'administrateur, et un modèle qu'Anthropic ne liste plus garde son dernier
  prix (il est nommé parmi les absents). Il n'a lieu que si le
  déclencheur appelle le worker-tick (T18) et que la clé de la plateforme est
  posée. Il écrit la grille comme un `PUT` : un enregistrement de
  l'administrateur au même instant peut perdre ses prix, ou les siens
  (anomalie 4).
- Un pack est désigné par sa **position** (`pack_index`) et non par son
  montant : si l'administrateur supprime ou réordonne des packs pendant qu'un
  apprenant a déjà chargé l'offre, le clic de l'apprenant sur « 10 $ » crée un
  ordre PayPal pour le pack qui occupe désormais cet index ; l'apprenant ne
  découvre le montant réel que chez PayPal (figé par UC-ADM-05-F11).
