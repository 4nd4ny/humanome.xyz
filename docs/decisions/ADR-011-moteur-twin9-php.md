# ADR-011 — Moteur Twin9 v9.8 en PHP

> **Amendé par [ADR-012](ADR-012-multi-fournisseur-twin9.md)** : les appels ne partent plus seulement chez Anthropic : chaque étape et chaque lecteur nomment leur fournisseur, parmi ceux que l'administrateur a ouverts, à l'adresse verrouillée de chacun ; les appels Anthropic gardent les deux voies, ceux des autres partent en direct (§3) ; l'accord nomme les fournisseurs que le run atteint (§5).

## Statut

Accepté — 2026-10-18 (décisions du propriétaire du 2026-10-17). Amende ADR-001,
ADR-005, ADR-008 et ADR-010.

## Contexte

Twin9 a suivi l'ADR-010 : sa v9.8 de référence, écrite en Python, portée en
JavaScript pour s'exécuter dans le navigateur (ADR-001), chaque appel passant par
`POST /api/twin9/appel` ; un run de dix journées compte quelque 3 000 appels. Le
2026-10-17, le propriétaire a tranché autrement :

- **Un seul moteur, sur le serveur.** La plateforme fait tout : comptes,
  configuration, exécution des runs, résultats. Un run ne dépend plus d'un onglet
  resté ouvert pendant des heures.
- **Twin9 reste fermé pour l'instant.** Son code a quitté ce dépôt public pour le
  dépôt privé `4nd4ny/Twin_v9` (révision de l'ADR-010 §1) ; or un moteur exécuté
  dans le navigateur est public de fait (ADR-001).
- **Un seul langage serveur.** L'hébergement n'a pas de Node serveur (ADR-003) :
  le moteur JavaScript ne peut pas y tourner, et y ajouterait un second langage.
- **La démonstration reste sur l'offre gratuite d'OVH** (`docs/hebergement.md`) :
  Apache et PHP 8.2, ni processus long ni cron, 100 Mo de disque, base MySQL sur
  un autre hébergement.

## Décision

### 1. La v9.8 réécrite en PHP

Le moteur est la v9.8, réécrite en PHP fonction par fonction et dans le même
ordre, pour que chacune se relise contre l'original. Un oracle tiré de la v9.8
vérifie, appel par appel, que le moteur PHP envoie les mêmes prompts ; les écarts
voulus sont listés dans ses tests. La v9.8 reste la référence : si elle évolue,
l'oracle se régénère. Le portage n'ajoute aucun plafond à l'algorithme : budget et
durée d'un run sont des plafonds facultatifs, choisis par l'utilisateur.

### 2. Exécution sur le serveur, par tranches

Le moteur s'exécute par le tick de l'ADR-005, sous le verrou qui existe déjà, en
tranches de 45 s au plus. Chaque tick reprend les runs en attente là où ils
s'étaient arrêtés, rejoue le moteur depuis le journal d'appels du run, envoie les
appels suivants et rend la main. L'offre gratuite n'ayant pas de cron, le tick est
déclenché de l'extérieur, avec un jeton qui ne sert qu'à lui, et par la page du
run tant qu'elle est ouverte, pour les seuls runs de son propriétaire. Le nombre de
runs avancés par tick et la durée d'une tranche sont des réglages de
l'administrateur.

- Chaque run garde une copie de ses réglages.
- Chaque appel est inscrit au journal avant et après : identifiant, étape, modèle
  servi, empreinte du prompt, réponse, jetons, coût, durée. À la reprise, une
  réponse ne sert que si le prompt recalculé a la même empreinte : un run tué en
  plein travail reprend sans appel en double.
- Une panne (un appel qui échoue après ses tentatives, ou que le modèle refuse)
  n'est jamais retenue comme un jugement : la journée ou le dossier qu'elle touche
  se rejoue au run suivant.
- Aucune transaction ne reste ouverte pendant une attente, et l'état se charge
  par parties, dans la mémoire que permet l'hébergement.

### 3. Anthropic seul, en direct ou par lots

Les appels ne partent que vers l'API d'Anthropic, à l'adresse verrouillée de
l'ADR-010 §2, par deux voies :

- **en direct** : des appels simultanés dans la tranche ; un refus de débit attend
  son `Retry-After`, dans la limite de la tranche ;
- **par lots** (API Message Batches) : les appels en attente partent ensemble, à
  moitié prix ; une tranche soumet le lot, une suivante le relève. Un lot relevé
  est supprimé chez Anthropic, qui le garderait sinon jusqu'à 29 jours. Un run par
  lots dure des heures : c'est la voie qui convient à cet hébergement.

Chaque étape choisit son modèle Claude, son budget de sortie, son effort et sa
réflexion, envoyés sous la seule forme que ce modèle accepte : la réflexion est
coupée par défaut, et aucune température n'est envoyée, les modèles 5.5 la
refusant. Les lots ne se validant qu'à la fin, un appel direct minimal par modèle
du run vérifie, avant le premier lot, que l'API accepte ses réglages. Le modèle
réellement servi est relevé à chaque réponse.

La clé d'un run est celle de l'utilisateur, tirée de son coffre (ADR-004) quand le
réglage `twin9_cle_perso_ouverte` l'autorise, ou celle de l'instance ; elle est lue
au moment de l'appel et n'est écrite nulle part ailleurs.

### 4. Le moteur vit dans Twin_v9, la plateforme le charge

Le moteur PHP vit dans le dépôt privé `4nd4ny/Twin_v9`, dossier `php/`, à côté de
la v9.8. La plateforme cherche ce dépôt dans `TWIN_V9_DIR`, par défaut `../Twin_v9`
à côté du sien, et charge `php/src` en autoload PSR-4, préfixe `Twin9\`
(`api/src/Twin9/EngineLoader.php`). Sans lui, la plateforme démarre et fonctionne
comme avant : Twin9 côté serveur reste désactivé, et les tests qui ont besoin du
moteur sautent.

La plateforme fournit au moteur les appels aux modèles, les clés et l'état du run ;
les gabarits restent en base (ADR-010 §2). Rien de la v9.8 n'entre dans ce dépôt,
ni code, ni gabarit, ni enregistrement : `scripts/check-publiable.mjs` le vérifie.
En production, la release embarque le `php/` de `TWIN_V9_DIR`, hors du webroot
(ADR-008) : depuis T18, ses sources (`php/src`) et son commit, dans
`<release>/Twin_v9`, où `EngineLoader` les trouve sans `TWIN_V9_DIR` ; ni les
tests du moteur, ni ses dépendances de développement, ni les gabarits, que
l'import met en base (`docs/deploiement.md`).

### 5. Le portfolio et l'état du run sur le serveur, avec l'accord de l'apprenant

À chaque lancement, l'apprenant accepte que son portfolio et l'état du run soient
gardés sur le serveur, jusqu'à ce qu'il les efface : c'est le stockage serveur sur
opt-in explicite du principe RGPD 2. Cet accord remplace la garde
`--donnees-reelles` de la v9.8, qui gardait tout en local en n'admettant que des
modèles locaux : la plateforme n'appelle qu'Anthropic, et c'est l'accord de
l'apprenant qui ouvre le traitement. L'écran de consentement (ADR-010 §5), la
politique de confidentialité et le registre RGPD le disent, ainsi que la
conservation d'un lot chez Anthropic jusqu'à sa suppression.

Le journal d'appels fait partie de l'état du run, sous cet accord : ce n'est pas
une journalisation, qui reste aux compteurs (principe 5), et un run fini n'en
garde que les compteurs. Supprimer son compte efface aussi ses runs, leur journal,
la mémoire de ses cartes et ses lots encore chez Anthropic ; l'export du compte les
contient.

### 6. Le coût moyen à la place du devis simulé

Le devis par run simulé de l'ADR-010 §3 tenait au moteur du navigateur. Avant de
lancer, l'utilisateur voit désormais le coût et la durée moyens par journée des
runs passés du même profil, à défaut ceux d'un vrai run de référence. Le débit
reste celui de l'ADR-010 §3 : pire cas réservé avant chaque envoi, réconcilié à
l'usage réel, marge comprise, à moitié prix par lots ; un run ne dépasse jamais son
budget.

## Conséquences

Positives :

- Un seul moteur, un seul langage serveur ; un run va au bout navigateur fermé.
- Le moteur reste fermé : son code n'est plus livré au client, et les gabarits ne
  quittent toujours pas le serveur.
- Compatible avec l'offre gratuite d'OVH : ni processus long, ni cron, ni Node
  serveur.
- La voie par lots divise le coût des appels par deux.

Négatives / à assumer :

- Le portfolio réside sur le serveur pendant et après le run : l'accord, la purge
  et le registre RGPD en sont les garanties. Le régime des établissements
  (consentement explicite, pseudonymisation avant l'envoi à un tiers, portfolio
  effacé en fin de run sauf accord) attend la production.
- Un run par lots dure des heures et dépend d'un déclencheur externe.
- Quatre limites ne viennent pas de l'algorithme : la capacité du serveur, le
  débit du fournisseur, la fenêtre de contexte de chaque modèle et les crédits de
  l'utilisateur. Quand l'une d'elles retarde ou arrête un run, la page du run le
  dit.
- Deux dépôts à cloner côte à côte. La CI publique ne voit pas le moteur : un
  moteur factice, public et chargé comme le vrai, y teste le tick, le journal et la
  reprise ; les tests de parité tournent là où `Twin_v9` est cloné.
- Embarqué dans la release, le moteur pèse sur le quota de 100 Mo, et le FTP du
  cluster, non chiffré (`docs/hebergement.md`), le fait transiter en clair.

Réversibilité : sur un serveur qui admet les processus longs (production), un
worker résident peut remplacer les tranches en lisant le même journal. Le jour où
Twin9 est publié, `php/` entre dans ce dépôt tel quel ; les gabarits restent privés
(ADR-010).

Décisions liées : ADR-001, ADR-003, ADR-004, ADR-005, ADR-008, ADR-010.
