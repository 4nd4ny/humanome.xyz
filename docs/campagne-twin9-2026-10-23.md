# Première campagne réelle de Twin9 (23 octobre 2026, en local)

Le P0 du comparatif (`comparatif-humanotwin-twin9.md` §8, point 3) demandait un premier run
réel : « relever coût, durée, nombre de vagues, mémoire d'un tick, écart avec la prévision ».
Cette page rend compte de la campagne qui l'a fait, en local, sur la plateforme de `main`
`11c4eae` (phase D comprise) et le moteur `Twin_v9` `a1d84bf`.

## Cadre

- **Décisions de Christian** (22 et 23 octobre) : 10 $ au plus, sa clé Anthropic, **garde-fous
  locaux seuls** (aucune limite n'a été réglée dans la console Anthropic), portfolios fictifs
  seulement, autres fournisseurs simulés.
- **Garde-fous** : chaque run a son `budget_usd`, que la plateforme tient en réservant le pire cas
  de chaque appel ; un registre cumulé refuse tout lancement qui ferait dépasser 9 $ ; la règle
  d'arrêt (dépense réelle de plus de deux fois la borne haute estimée) n'a jamais été atteinte.
- **Portfolio** : `PLANT-01` de `Twin_v9/tests/portfolios/` (fictif), référentiel RESPIRE 7.1.0,
  et Humanome V18 pour R3a.
- **Profil d'essai « tout Haiku »** : le profil v9.8 avec `etages.profond.modele` =
  `claude-haiku-5-5` ; R0c garde le profil v9.8 fidèle (Sonnet 5.5 à l'étage profond).
- Les coûts ci-dessous sont **bruts**, au prix d'Anthropic, sans la marge de l'instance (1,2).

## Les runs

| Run | Ce qu'il prouve | Voie | Appels | Lots | Durée | Coût brut | Borne haute prévue |
|---|---|---|---:|---:|---:|---:|---:|
| R0a | Lots réels, tick local, bloc `configuration`, attestation | lots | 7 | 3 | 7 min | 0,0033 $ | 0,005 $ |
| R0b | Voie directe, tranche de 40 s | directe | 7 | 0 | 30 s | 0,0068 $ | 0,01 $ |
| R0c | Sonnet répond, réserve du pire cas sous plafond | lots | 7 (3 Sonnet) | 3 | 10 min | 0,0665 $ | 0,07 $ |
| R1 | PLANT-01 complet, 10 journées, de bout en bout | lots | 945 | 27 | 1 h 44 | 0,5015 $ | 1,65 $ |
| R2-1 | Stigmergie, 1re analyse (journée du 13 mars) | directe | 113 | 0 | 7 min | 0,1166 $ | 0,24 $ |
| R2-2 | Stigmergie, 2e analyse sous `rescan` | directe | 99 | 0 | 7 min | 0,1020 $ | 0,24 $ |
| R2-3 | Stigmergie, 3e analyse sous `rescan` | directe | 92 | 0 | 7 min | 0,0961 $ | 0,24 $ |
| R3a | Humanome V18 choisi au lancement (5 pôles) | lots | 23 | 3 | 8 min | 0,0094 $ | 0,13 $ |
| R5 | Le tuteur, 10 questions types | directe | 10 | — | 1 min | 0,0120 $ | 0,008 $ |
| **Total** | | | **1 303** | | | **0,914 $** | |

Le registre compte en plus 0,126 $ « incertains » : le pire cas des 8 nouvelles tentatives et de
la coupure des appels directs de R2, qu'Anthropic a peut-être facturés. Total engagé : **1,04 $**.

**Aucune sortie tronquée, aucune panne.** Toutes les attestations portent le commit du moteur
(`a1d84bf`), l'empreinte du jeu de gabarits et le référentiel lu ; les blocs `configuration` et
`execution` sont complets.

## Ce qu'on apprend

- **Le routage réel est bien plus sobre que le simulé.** PLANT-01 en mode complet fait
  **945 appels** (R1), contre 2 740 dans le scénario simulé `02-cloud`. Le nombre de vagues, lui,
  est celui que prévoyait le plan : 27 lots.
- **Le coût d'un run v9.8 fidèle, extrapolé de R1 à 0 $.** L'étage profond (tribunal, président,
  relectures, gardien du raisonnement) a coûté 0,26 $ sur Haiku. Sonnet 5.5 coûtant 20 fois Haiku
  5.5, un PLANT-01 complet fidèle à la v9.8 coûterait environ **4,6 $ bruts par lots** (5,5 $
  facturés avec la marge), et à peu près le double en voie directe. Le plan en estimait 9 à 26 $
  (routage simulé). Hypothèse non vérifiée : Sonnet écrit autant de jetons que Haiku ; le run R4
  (une journée v9.8 fidèle, environ 0,5 à 1 $) la vérifierait.
- **La voie par lots coûte bien la moitié** : R0a 0,0033 $ contre R0b 0,0068 $ pour les mêmes
  7 appels.
- **Les ticks** : par lots, 10 s au plus (67 ticks pour R1) ; en voie directe, jusqu'à 39 s dans
  une tranche de 40 s. La mémoire d'un tick n'est pas relevée par le worker : elle reste à mesurer
  sur OVH (recette T18, R6).
- **La stigmergie du greffier fonctionne sur de vraies réponses** (journal `stigmergie/F01`) :

  | Analyse | Dépôts | Rejets | Compétences dont le greffier lit les traces | Explorateurs |
  |---|---:|---:|---:|---:|
  | 1 | 30 | 1 | 0 | 1 |
  | 2 | 44 | 0 | 4 | 2 |
  | 3 | 34 | 1 | 5 | 2 |

  Les mêmes traces de la compétence 3.01 reviennent aux analyses 2 et 3 (renforcement). Le prompt
  du greffier grandit de 176 jetons par dossier (borne du design : environ 400), sans étape ni
  appel en plus. C'est un contrôle du **mécanisme**, pas de la qualité, qui demande la relecture
  humaine à l'aveugle (hors périmètre pour l'instant).
- **Le tuteur** : 10 réponses sur 10 citent l'adresse attendue (`#/compte`, `#/compte/credit`,
  `#/configuration`, `#/twin9`, `#/essayer`, `#/referentiel`), avec le digest du sprint 11
  (environ 11 200 jetons d'entrée) ; 0,0012 $ la question sur Haiku 5.5.

## Défauts trouvés en préparant la campagne

- **Le commit du moteur manquait à l'attestation** quand le chemin du moteur contenait une espace
  (« 13. Cartographie ») : corrigé dans #33, avant les runs.
- **Le défi du tuteur répondait 503** dans le mode de campagne, qui retire `MIGRATE_TOKEN` : sans
  `POW_SECRET`, le défi n'a pas de secret. En production, `POW_SECRET` ou `MIGRATE_TOKEN` doit être
  défini (c'est déjà le cas par `.env`) ; le script de campagne en donne un jetable.

## Non vérifié

- La console Anthropic n'a pas été relevée : les coûts sont ceux que la plateforme calcule à partir
  des jetons rendus par l'API et de la grille de prix.
- La recette en ligne (R6 : déclencheur cron-job.org, mémoire d'un tick OVH, `.env` du serveur).
- R4 (une journée v9.8 fidèle) et R7 (un autre fournisseur), laissés à la décision de Christian.
- La qualité des cartographies : aucune relecture humaine.
