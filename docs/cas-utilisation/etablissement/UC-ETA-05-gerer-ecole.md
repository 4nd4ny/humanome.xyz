# UC-ETA-05 — Gérer son école : crédit, surtaxe, plafond par élève, clé

| Champ | Valeur |
|---|---|
| **Acteur principal** | École : le compte qui porte l'habilitation `etablissement`, que seul l'administrateur attribue (ADR-013 §2 h) |
| **Acteurs secondaires** | Ses élèves (membres de ses cohortes, UC-APP-08), dont les usages payants sont débités de son crédit ou partent sur sa clé (UC-APP-09, UC-APP-10, UC-APP-11) ; PayPal (bac à sable en local), par lequel l'école achète son crédit ; Anthropic, chez qui partent les appels sur la clé de l'école |
| **Portée** | humanome.xyz — section « Mon école » de `#/etablissement` ; API `GET/PUT /api/etablissement/ecole`, `PUT /api/etablissement/ecole/cle`, `DELETE /api/etablissement/ecole/cle/{fournisseur}` ; l'achat de crédit sur `#/compte/credit` (UC-APP-11) |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | TODO, sprint 6 (« une école paye les clés API de ses élèves », surtaxe de 3,5 % à 10 %, RESPIRE#0) ; **ADR-013** §1 (R1–R5), §2 (d, g, h), §3, §4, §5, §7, §9 |
| **Statut** | Implémenté (sprint 6, lot S6b, 2026-10-22) — le registre et le grand livre communs avec EduChat (S6c) et Stripe (S6d) restent à faire, sur accord de Christian |

## Objectif

Permettre à l'école de **payer les usages payants de ses élèves** — l'analyse
approfondie (Twin9) et la cartographie ouverte sur crédits (Twin6) — sans
qu'aucun élève n'achète rien (R2 : pas de contrôle d'âge), et de régler
**combien** et **comment** :

- sur la **clé de l'instance**, payée par son **crédit** (acheté par PayPal,
  seule une école en achète), au coût réel × (1 + sa **surtaxe**), qu'elle
  choisit entre 3,5 % et 10 % au centième (R4) — au lieu de la contribution
  des particuliers ;
- ou sur **sa propre clé Anthropic**, gardée chiffrée pour ses élèves (R1) :
  elle paie alors Anthropic directement, la plateforme rien ;
- sous un **plafond par élève et par mois** (UTC), le même pour tous ses
  élèves, 0 par défaut : rien de payant à ses frais tant qu'elle ne l'a pas
  réglé ;

et de voir ses élèves et ce que chacun a engagé, **en montants seulement**.

## Déclencheur

L'école ouvre `#/etablissement` : la section « Mon école » est la première de
l'espace.

## Préconditions

- Compte connecté portant l'habilitation `etablissement` (lue en base à chaque
  requête : une habilitation retirée vaut tout de suite) ; un rôle déclaré
  (UC-CPT-07) n'ouvre rien.
- Pour poser une clé : la clé maîtresse `SODIUM_MASTER_KEY` est configurée.
- Migration 037 passée (`ecoles`, `ecole_cles`, `ecole_consommations`).

## Garanties en cas de succès

- Les réglages de l'école (une ligne `ecoles`, écrite à la première
  écriture) portent sa surtaxe (DECIMAL 4,2, bornée par une contrainte CHECK
  de la base) et son plafond par élève en micro-USD.
- Sa clé est chiffrée (nonce de 24 octets ‖ secretbox, comme `KeyVault`),
  jamais renvoyée ni journalisée ; la page dit seulement qu'une clé est posée,
  et depuis quand.
- Les usages payants de ses élèves sont débités de son crédit (ou partent sur
  sa clé) dans la même transaction que l'appel qu'ils paient, le plafond de
  l'élève tenu d'abord ; chaque événement de son grand livre nomme l'élève
  (`beneficiaire_id`).
- Un événement d'audit sans secret : `ecole_reglages {surtaxePct,
  plafondEleveUsd}`, `ecole_cle_posee {fournisseur}`, `ecole_cle_retiree
  {fournisseur}`.

## Garanties minimales (en cas d'échec)

- Une saisie refusée ne change rien (`422` par champ ; rien n'est écrit).
- Un plafond ou un crédit insuffisant : rien n'est réservé ni débité — ni sur
  l'un ni sur l'autre —, et aucun appel ne part.
- Une clé ne quitte jamais le serveur.

## Scénario nominal

1. L'école ouvre `#/etablissement` ; le site lit `GET /api/etablissement/ecole`
   et affiche en tête « Mon école » : un avis quand le plafond par élève vaut 0,
   le crédit de l'école et le lien « Acheter du crédit » (`#/compte/credit`),
   le plafond par élève et la surtaxe, la clé Anthropic de l'école, ses élèves
   et leur dépense du mois et de toujours.
2. Elle achète du crédit sur la page du crédit (UC-APP-11 : packs PayPal,
   réservés aux écoles ; en local, le bac à sable seulement).
3. Elle saisit un plafond par élève (« 10 » $ par mois) et une surtaxe
   (« 6,5 » %) et clique « Enregistrer les réglages » ; le site envoie
   `PUT /api/etablissement/ecole {surtaxePct: 6.5, plafondEleveUsd: 10}` (avec
   `X-CSRF-Token`).
4. Le serveur valide (surtaxe entre 3,5 et 10 au centième, plafond de 0 à
   100 000 $ au centime), écrit la ligne `ecoles`, journalise
   `ecole_reglages` et répond `200` avec la page ; le site affiche « Réglages
   de l'école enregistrés. ».
5. Un élève rejoint une de ses cohortes (UC-APP-08) puis lance une
   cartographie ouverte sur crédits : son appel est réservé sur son plafond du
   mois, puis débité du crédit de l'école à son pire cas × 1,065, réglé au
   coût réel × 1,065 ; rien sur le compte de l'élève.
6. La page de l'école montre l'élève, ses cohortes, ce qu'il a engagé ce
   mois-ci et en tout.

## Scénarios alternatifs

- **A1 — Bornes de la surtaxe et du plafond** (étape 4) : 3,49, 10,01, 3,555,
  une chaîne (« 5 »), un plafond négatif, au millième ou au-delà de
  100 000 $ → `422 {error, fields}` sur le champ fautif ; un champ absent est
  gardé. Le site refuse localement une surtaxe hors bornes (« La surtaxe se
  choisit entre 3,5 % et 10 %. »), sans appel.
- **A2 — La clé de l'école** : elle saisit sa clé Anthropic et clique
  « Enregistrer la clé » (`PUT /api/etablissement/ecole/cle {cle, fournisseur:
  "anthropic"}`) ; le champ est vidé, la page dit « Une clé est posée depuis
  le … — jamais réaffichée ». Les appels de ses élèves (cartographie ouverte ;
  Twin9 sur la voie `ecole`) partent alors avec elle : son crédit n'est pas
  touché, le plafond de l'élève compte le prix de la grille (facteur 1,0).
  « Retirer la clé », en deux temps, l'efface (`DELETE …/cle/anthropic` →
  `204`, puis `404`) ; un run sur sa clé s'arrête à sa tranche suivante, et
  son élève choisit de nouveau qui paie (UC-APP-10).
- **A3 — Le plafond par élève** (étape 5) : 0 par défaut → l'appel de l'élève
  est refusé (`402 {error: "Plafond de votre école atteint pour ce mois",
  code: "plafond", reste_microusd}`) ; un plafond qui ne couvre pas le pire
  cas de l'appel (sa sortie entière) le refuse aussi ; un plafond suffisant le
  laisse partir, réglé au coût réel. Un run Twin9 s'arrête sur « plafond de
  votre école atteint : carte incomplète » (UC-APP-10).
- **A4 — Un élève de deux écoles** : sans payeur, son appel est refusé
  (`422` « Choisissez qui paie cette analyse : vous êtes membre de plusieurs
  écoles ») ; avec `payeur`, l'école choisie paie seule ; une école dont il
  n'est membre d'aucune cohorte → `422` ; son propre solde restant (acheté
  avant l'ADR-013), s'il le choisit, paie à la contribution des particuliers.
  Règle documentée (ADR-013 §4) : chaque école ne compte sous son plafond que
  ce qu'elle paie.
- **A5 — Une école pour elle-même** : ses propres usages sont payés par son
  crédit à (1 + sa surtaxe), sans plafond par élève.

## Scénarios d'erreur

- **E1 — Accès refusé** : sans session `401` ; sans l'habilitation
  `etablissement` (un apprenant, même avec un rôle déclaré) `403` sur les
  quatre routes ; l'espace dit « réservé aux établissements » et ne lit rien.
- **E2 — Clé maîtresse absente** (A2) : `503 {error: "Chiffrement des clés non
  configuré sur ce serveur"}` ; rien n'est écrit ; la page ne propose pas de
  champ.
- **E3 — Clé invalide** (A2) : un autre fournisseur qu'Anthropic, une clé vide
  ou avec des espaces, plus de 400 caractères → `422`.
- **E4 — Crédit de l'école insuffisant** (étape 5) : `402 {error: "Crédit de
  votre école insuffisant", code: "credit_ecole"}`, sans le solde de l'école ;
  rien n'est réservé, pas même sur le plafond (UC-APP-11, E10).

## Règles de gestion

- **RG1** — L'école est le compte qui porte l'habilitation `etablissement`
  (ADR-013 §2 h) ; ses élèves sont les membres de ses cohortes, la ligne
  `cohorte_membres` étant leur consentement (le texte de consentement le dit
  pour les nouvelles adhésions : l'école voit le montant de ce qu'elle paie,
  jamais le contenu).
- **RG2** — Surtaxe de 3,5 % à 10 %, au centième ; 3,5 % par défaut ; figée au
  lancement de chaque run (`twin9_runs.facteur_prix` = 1 + surtaxe sur son
  crédit, 1,0 sur sa clé).
- **RG3** — Plafond par élève, par mois UTC (`gmdate`, l'horloge du grand livre
  des crédits offerts), en micro-USD ; 0 par défaut ; il compte ce que l'école
  paie pour l'élève : le pire cas de chaque appel réservé, puis son coût réel
  réglé — dans le mois où la réserve a été prise (`twin9_appels.mois_reserve`).
- **RG4** — Une seule transaction, un seul ordre de verrous : la ligne du mois
  de l'élève (verrouillée exclusivement d'emblée), puis le crédit de l'école,
  puis l'appel. L'un des deux manque : rien n'est tenu. Des processus
  concurrents ne dépassent jamais ni le plafond ni le crédit.
- **RG5** — La clé de l'école ne sert que chez Anthropic (ADR-013 §6) ; elle est
  relue au départ de chaque appel, jamais gardée ailleurs, jamais rendue.
- **RG6** — Un usage payé par une école ne bascule jamais sur le solde de son
  élève : une école qui ne paie plus (purgée, habilitation retirée, élève
  parti, clé retirée sur la voie `ecole`) arrête le run, que son élève reprend
  en choisissant de nouveau qui paie.
- **RG7** — Le grand livre des écoles est une couture (`GrandLivreEcoles`,
  réserver, régler, solde, reste) dont la seule implémentation est locale
  (`GrandLivreLocal`) : S6c y branchera le grand livre commun d'EduChat sans
  toucher aux runs (ADR-013 §9).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Réglages de l'école | `ecoles` : surtaxe, plafond par élève, `respire_numero` (NULL ; 0 pour RESPIRE#0, créée en base par un script hors dépôt) ; purgés avec le compte (CASCADE) |
| Clé de l'école | `ecole_cles` : chiffrée (nonce ‖ secretbox), jamais rendue ni journalisée ; purgée avec le compte (CASCADE) ; ses lots chez Anthropic annulés et effacés avant la purge du compte (RunPurge::lotsEcole) |
| Ce que chaque élève a engagé | `ecole_consommations` (école, élève, mois, montant) : CASCADE depuis l'école et depuis l'élève |
| Grand livre de l'école | `twin9_credit_events.beneficiaire_id` : l'élève, SET NULL à sa purge ; des montants, des jetons, des libellés — jamais un portfolio, une sortie ni un prompt |
| Audit | `ecole_reglages`, `ecole_cle_posee`, `ecole_cle_retiree` — le fournisseur, jamais la clé |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/etablissement/EcoleSection.jsx` | « Mon école » : avis du plafond nul, crédit et lien d'achat, réglages (contrôle local de la surtaxe), clé (posée, retirée en deux temps, jamais réaffichée), élèves et dépenses |
| Front | `web/src/views/etablissement/etablissement-api.js` — `fetchEcole`, `saveEcole`, `poserCleEcole`, `retirerCleEcole` | Page normalisée, écritures CSRF |
| Front | `web/src/lib/payeurs.js`, `web/src/views/twin9/ChoixPayeur.jsx` | Qui paie : défaut, menu « Qui paie », ce qu'une école peut encore payer pour l'élève |
| API | `api/src/routes/etablissement.php` — `GET/PUT /api/etablissement/ecole`, `PUT /api/etablissement/ecole/cle`, `DELETE /api/etablissement/ecole/cle/{fournisseur}` | Validation, 503 sans clé maîtresse, audit sans secret |
| Domaine | `api/src/Etablissement/Ecoles.php` | Bornes, réglages, facteur, écoles d'un compte, élèves et dépenses |
| Domaine | `api/src/Etablissement/EcoleCles.php` | Clé chiffrée, relue pour un appel seulement |
| Domaine | `api/src/Etablissement/GrandLivreEcoles.php`, `GrandLivreLocal.php`, `PlafondAtteintException.php` | Plafond puis crédit, atomiquement ; règlement dans le mois de la réserve |
| Domaine | `api/src/Etablissement/Payeurs.php`, `Payeur.php` | Qui paie, élève de deux écoles, l'école paie encore ? |
| Domaine | `api/src/Twin9/CreditService.php` — `debit`, `adjust` (`beneficiaire`) | L'élève nommé dans le grand livre de l'école |
| Domaine | `api/src/routes/twin9.php` — `POST /api/twin6/appel` | L'appel d'un élève payé par son école |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-ETA-05-U01 | `Ecoles::surtaxe` | 3,5 à 10 au centième ; 3,49, 10,01, 3,555, chaîne, NaN refusés | `api/tests/UseCases/Unit/UcEta05GererEcoleTest.php` |
| UC-ETA-05-U02 | `Ecoles::plafond` | Dollars au centime, de 0 à 100 000 | idem |
| UC-ETA-05-U03 | `Ecoles::reglages`, `regler`, `facteur` | Défauts sans ligne ; première écriture ; CHECK de la base ; 1 + surtaxe, 1,0 sur la clé | idem |
| UC-ETA-05-U04 | `Ecoles::de`, `paiePour` | Ses écoles par ses cohortes, une école pour elle-même, habilitation retirée | idem |
| UC-ETA-05-U05 | `GrandLivreLocal::reserver` | Plafond puis crédit ; plafond 0 ; l'élève nommé ; au-delà du plafond rien | idem |
| UC-ETA-05-U06 | `GrandLivreLocal::reserver` | Crédit court : le plafond non plus ; clé : plafond seul ; école pour elle-même ; transaction de l'appelant annulée | idem |
| UC-ETA-05-U07 | `GrandLivreLocal::regler` | Mois de la réserve, jetons, jamais sous zéro | idem |
| UC-ETA-05-U08 | `GrandLivreLocal::reserver` sous concurrence | Quatre processus, vingt réserves : exactement ce que le plafond, ou le crédit, tient (RG4) | idem (`api/tests/fixtures/ecoles/reserver.php`) |
| UC-ETA-05-U09 | `EcoleCles` | Chiffrée, relue, listée sans matériau, Anthropic seul, retirée | idem |
| UC-ETA-05-U10 | `Payeurs::resoudre`, `pourCartographieOuverte` | Défaut, deux écoles, école étrangère, voie `ecole` sans clé, son solde | idem |
| UC-ETA-05-U11 | `Payeurs::encorePaie` | École purgée, sans facteur, clé retirée, élève parti | idem |
| UC-ETA-05-U12 | `RunPayeur` | Compte débité, élève plafonné, prix, titulaire de la clé, école disparue | idem |
| UC-ETA-05-U13 | `Ecoles::eleves`, `Payeurs::possibles` | Membres, cohortes, mois et total ; ce que l'école peut encore payer, jamais son crédit | idem |
| UC-ETA-05-U14 | `lib/payeurs.js` | Défaut, valeur de requête, restes, libellés, phrase | `web/test/usecases/unit/uc-eta-05-gerer-ecole.test.jsx` |
| UC-ETA-05-U15 | `ChoixPayeur` | Rien, une phrase, ou un menu « Qui paie » | idem |
| UC-ETA-05-U16 | `EcoleSection` | Plafond nul d'abord, crédit, élèves, réglages (PUT), surtaxe refusée localement | idem |
| UC-ETA-05-U17 | `EcoleSection` | Clé posée, jamais réaffichée, retirée en deux temps ; sans chiffrement, aucun champ | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-ETA-05-F01 | Nominal | API | Défauts, réglages, audit, achat PayPal (bac à sable simulé), un élève rejoint ; son appel Twin6 débite l'école à × 1,065, nommé, rien sur l'élève | `api/tests/UseCases/Functional/UcEta05GererEcoleTest.php` |
| UC-ETA-05-F02 | A1 | API | 422 par champ ; rien changé ; champ absent gardé | idem |
| UC-ETA-05-F03 | A2, E2, E3 | API | Clé chiffrée, jamais rendue ni journalisée ; l'appel de l'élève part avec elle, crédit intact, plafond au prix de la grille ; 422 ; 204 puis 404 ; 503 | idem |
| UC-ETA-05-F04 | E1 | API | 403 pour un apprenant, 401 pour un visiteur | idem |
| UC-ETA-05-F05 | A3 | API | Plafond 0 → 402 « plafond » ; 0,01 $ refusé ; 0,02 $ passe | idem |
| UC-ETA-05-F06 | A4 | API | Deux écoles : 422 sans choix, l'école choisie seule, école étrangère 422, son solde à la contribution | idem |
| UC-ETA-05-F07 | Nominal | IHM | « Mon école » en tête, plafond nul dit, réglages enregistrés (CSRF) puis relus, crédit, élèves | `web/test/usecases/functional/uc-eta-05-gerer-ecole.test.jsx` |
| UC-ETA-05-F08 | A2 | IHM | Clé posée (CSRF), jamais réaffichée, retirée en deux temps | idem |
| UC-ETA-05-F09 | E1 | IHM | Un apprenant ne voit pas « Mon école », rien n'est lu | idem |

Tests existants liés : `api/tests/Twin9/EcolesTest.php` (les runs Twin9 payés
par une école : débit au coût réel × (1 + surtaxe), plafond qui arrête le run,
clé de l'école et ses lots, école qui ne paie plus, purge d'un élève), UC-APP-10
(F29–F34), UC-APP-11 (F33–F35), UC-APP-09 (F36).

## Limites

- Les runs de masse (UC-ETA-02, UC-ETA-03) gardent leur plafond, leur compteur
  et leur facturation après coup : leur bascule vers le crédit prépayé de
  l'école, × (1 + surtaxe), fera un lot à part (ADR-013 §4).
- Le registre et le grand livre communs avec EduChat (S6c) et Stripe (S6d) ne
  sont pas branchés : ADR-013 §9 décrit leur interface.
- Les adhésions antérieures au nouveau texte de consentement n'ont pas été
  reprises (ADR-013, « À signaler à Christian », point 9).
- Ce qu'un élève lit de ce que son école peut encore payer pour lui
  (`reste_credit_microusd`) est son plafond restant borné par le crédit de
  l'école : quand ce crédit est plus bas, c'est ce crédit qu'il lit — le seul
  cas où il en apprend le montant. Le borner évite qu'une cartographie ouverte
  parte pour s'arrêter, faute de crédit, après ses premiers appels payés.
- Une école qui retire sa clé pendant qu'un lot parti avec elle est encore
  chez Anthropic : le tick ne peut plus relever ce lot ; ses appels gardent
  leur pire cas sur le plafond de l'élève du mois, le run arrêté ne change pas
  de payeur (`409`) et ne reprend pas sans payeur (`422`) tant que le lot n'a
  pas été relevé — ce qui n'arrive plus. À traiter dans un lot suivant (rendre
  la réserve d'un lot devenu illisible, après le délai d'Anthropic).
- Le plafond s'applique à l'admission d'un run par ce qui reste du plafond du
  mois, pas déduction faite de ce que les autres runs de l'élève payés par la
  même école ont été accordés : la réserve de chaque appel, elle, le tient
  exactement (RG4).

## Anomalies constatées

Aucune à ce jour.
