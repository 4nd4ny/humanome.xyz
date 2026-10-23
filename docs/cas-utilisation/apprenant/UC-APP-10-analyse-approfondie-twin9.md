# UC-APP-10 — Lancer une analyse approfondie (Twin9)

| Champ | Valeur |
|---|---|
| **Acteur principal** | Apprenant (tout compte connecté) |
| **Acteurs secondaires** | Moteur Twin9 (dépôt privé `4nd4ny/Twin_v9`, chargé depuis `TWIN_V9_DIR`, ADR-011) ; fournisseurs LLM (Anthropic : appels directs ou API Message Batches ; depuis P1-5, ceux que l'administrateur ouvre — OpenAI, Mistral AI, Google, xAI, OpenRouter —, en direct, ADR-012) ; tick du serveur (`POST /api/admin/worker-tick`) ; cartographe lié (lecture des résultats, s'il y est autorisé) ; administrateur (offre, contribution, promotion — UC-ADM-05 ; compteurs des runs) ; atelier (jeux de gabarits — UC-PRO-08) |
| **Portée** | humanome.xyz — vues `#/twin9` et `#/twin9/<id>`, routes `/api/twin9/runs…` (`api/src/routes/twin9-runs.php`), profils de `#/configuration` (`/api/twin9/configuration`, `/api/twin9/profils`), ouverture dans l'interface de cartographie (`#/cartographie`) |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.2, §4.3 (découpage journalier + fusion), §4.4, §6 (RGPD), §7 (Golden Prompt payant) ; ADR-004, ADR-007, ADR-010, ADR-011 ; `docs/contrats.md` §8 |
| **Statut** | Implémenté (T9, T10, T8 stratégie A, T16, T17 ; P0-1 : configuration et exécution du run, 2026-10-22 ; P1-5 : un fournisseur par étage, étape et lecteur, l'accord qui les nomme, 2026-10-22 ; S3-3 : les traces de la stigmergie du greffier dans la cartographie et le portfolio surligné, 2026-10-23 ; sprint 4, T0 : le portfolio envoyé découpé en les journées de l'interface ; C3, C4 : deux cartes du même jour, le second ressort en seconde lecture, 2026-10-23) ; le moteur du navigateur et son proxy `POST /api/twin9/appel` sont retirés depuis T11 |

## Objectif

Permettre à un apprenant d'obtenir l'analyse **approfondie** de son portfolio
par Twin9, le Golden Prompt de la plateforme : collège de lecteurs, ancrage
verbatim des citations, consensus mécanique, instruction rapide, tribunal
adversarial à résolution calculée, fusion chronologique et relectures. Le
moteur tourne **sur le serveur**, par tranches (ADR-011) : avec l'accord de
l'apprenant, son portfolio et l'état du run y restent jusqu'à ce qu'il les
efface. Le run se paie sur son crédit prépayé (contribution +20 %) ou, pendant
une promotion, avec sa propre clé. Sa carte s'ouvre dans l'interface de
cartographie, délibérations comprises.

## Déclencheur

L'apprenant choisit « Analyse approfondie » (famille « Ma cartographie »,
badge premium) ou ouvre `#/twin9`.

## Préconditions

- Compte actif et session (UC-CPT-01, UC-CPT-02).
- Le moteur Twin9 est chargé (`TWIN_V9_DIR`, un moteur qui lit le référentiel
  du run : T16 ou plus récent) : `GET /api/twin9/runs` dit `disponible`. Le
  jeu de gabarits v9.8 est importé (UC-PRO-08 A4) : sans lui, le lancement
  répond `503` (E2).
- Un référentiel publié, RESPIRE par défaut, avec ses fiches en base.
- Avec la clé de l'instance : un crédit (UC-APP-11) qui couvre au moins une
  journée et sa fusion. Avec sa clé personnelle : promotion ouverte (UC-ADM-05
  A1) et clé Anthropic enregistrée (UC-CPT-04).

## Garanties en cas de succès

- Un run, gardé sur le serveur avec l'accord daté et son **attestation**
  (profil et mode, journées admises, jeu de gabarits et ses versions,
  référentiel, sa version et son empreinte, commit du moteur), va au bout :
  ses journées instruites, puis la fusion de sa carte.
- Depuis P0-1, il garde aussi sa **configuration**, écrite une fois au
  lancement (le fournisseur, la voie, le modèle et le budget de sortie de
  chaque appel, les fournisseurs atteints et leur étiquette RGPD, le jeu de
  gabarits, le référentiel, la clé, les prix tels que facturés), et son
  **exécution** (appels, pannes, sorties tronquées, passes du moteur, coût,
  par fournisseur et par voie), que la page du run affiche (RG13).
- Ses résultats — carte évolutive, cartes du jour avec leurs délibérations,
  rapports — se lisent filtrés et s'ouvrent dans l'interface de cartographie,
  dans un jeu « Twin9 · <journal> · <référentiel> ».
- Le crédit n'est débité que du coût réel des appels (réserves réconciliées),
  dans la limite de l'admission et des plafonds du profil.
- Aucun gabarit ni aucune fiche n'atteint le navigateur ; ce qui s'affiche
  passe le filtre de fuite.

## Garanties minimales (en cas d'échec)

- Rien ne part sans l'accord ; un lancement refusé ne crée rien ; l'aperçu ne
  garde rien.
- Personne d'autre que son propriétaire, et le cartographe lié qu'il autorise,
  ne lit un run ; l'administrateur n'en voit que des compteurs.
- Un appel qui ne part pas, ou un run arrêté, rend ce qu'il tenait en
  réserve ; les messages d'erreur ne citent jamais un gabarit.

## Scénario nominal

1. L'apprenant ouvre `#/twin9`. La vue lit `GET /api/twin9/runs` (`disponible`
   et ses runs, sans portfolio ni résultat), `GET /api/twin9/configuration`
   (ses profils, et pour chacun et pour le profil v9.8 les fournisseurs
   qu'atteignent ses appels, avec leur voie et leur étiquette RGPD) et sa
   bibliothèque locale de portfolios (IndexedDB, UC-APP-01).
2. Il choisit un profil (« Profil v9.8 », par défaut, ou un des siens ; « Régler
   mes profils » mène à `#/configuration`), un portfolio de sa bibliothèque ou
   un fichier (`.md`, `.txt`) et, s'il le veut, « Mon cartographe peut lire les
   résultats » (A5).
3. Il coche l'**accord** : son portfolio et l'état de l'analyse restent sur le
   serveur jusqu'à ce qu'il les efface ; le texte part chez les fournisseurs
   que l'accord nomme, chacun avec sa voie et son étiquette RGPD — pour le
   profil v9.8, « Anthropic (par lots ; RGPD : sous conditions), le
   fournisseur du modèle » ; par lots, Anthropic garde le lot jusqu'à sa
   suppression, 29 jours au plus (RG1, A9).
4. L'accord donné, la vue demande l'**aperçu** (`POST /api/twin9/runs/apercu
   {profil, portfolio}`, rien n'est gardé) et l'affiche : les journées à
   instruire (« 2 journées à instruire. » au premier run), le coût estimé — en
   moyenne, au plus bas, au plus haut — et la durée, d'après les évaluations
   passées de mêmes réglages ou, à défaut, d'après le vrai run de PLANT-01 ×
   les pôles du référentiel (RG4) ; les plafonds du profil ; ce que le crédit
   ou le budget admet (A2, E5). Le texte envoyé est le portfolio découpé en
   les journées de l'interface, et l'aperçu dit les journées qu'il retouche
   pour cela (RG16).
5. « Lancer l'analyse » envoie `POST /api/twin9/runs {profil, portfolio,
   accord: {fournisseurs: [ids]}, visibilite}` avec le jeton CSRF, le
   portfolio tel que l'aperçu l'a envoyé (RG16). Le serveur revalide et admet
   le profil, fige la version de son référentiel, prend l'instantané du jeu de
   gabarits, admet les journées (RG5), crée le run `en_cours` et son
   attestation, et renvoie son suivi (`201`) ; la vue ouvre `#/twin9/<id>`.
6. La page du run lit `GET /api/twin9/runs/<id>` : son statut et ce qui le
   retient (« En attente de son premier tour »…), ses journées finies, sa
   fusion, ses appels par état, ses lots chez Anthropic, son coût et son
   budget. Tant qu'elle est ouverte et le run en cours, elle le fait avancer
   (`POST /api/twin9/runs/avancer` : une tranche, pour les seuls runs du
   compte) puis relit son suivi ; page fermée, le tick du serveur le fait
   avancer (RG10).
7. Le run fini (`termine`), « Ouvrir dans la cartographie » lit `GET
   /api/twin9/runs/<id>/resultats` — ses sorties filtrées (RG9), les cartes du
   jour reprises de la mémoire, le référentiel du run — et en fait le document
   `twin9-run` (`twin9RunFiles`), que l'interface de cartographie ouvre
   (`#/cartographie`) : une journée par carte du jour, chaque verdict avec son
   dossier (traces probantes, jury, délibération), dans un jeu « Twin9 ·
   <journal> · <référentiel> » (« Twin9 · <journal> » pour un run d'avant
   T16, qui n'a pas gardé de référentiel).
8. La page garde l'attestation du run (profil, référentiel et version, jeu de
   gabarits et empreinte, moteur, admission, date de l'accord) ; « Mes
   analyses » liste ses runs. À côté, « Configuration » (P0-1 ; son suivi
   n'en porte que `configuration_empreinte`), ouverte, lit
   `GET /api/twin9/runs/<id>/resultats` — de nouveau à chaque ouverture tant
   que le run est en cours, et quand son statut change — et dit chaque rôle
   (étage, étape, étape au second ressort,
   lecteur du collège) avec son fournisseur et son étiquette RGPD, sa voie,
   son modèle et son budget de sortie ; le jeu de gabarits
   (`jeu@empreinte`), le référentiel (`id@version`), la clé ; puis
   l'exécution : appels, pannes dont sorties tronquées (avec le conseil
   d'augmenter le budget de sortie de leur étape, qu'il nomme quand le run
   est fini, et ce que coûte ce remède : toute la carte instruite de
   nouveau), par fournisseur et par voie, passes du moteur, lots, coût
   (RG13). Ouvert dans la cartographie
   (étape 7), chaque journée dit ses modèles et son jeu de gabarits, et le
   jeu garde la configuration par liste blanche (RG14). Quand le profil
   active la stigmergie du greffier, la modale de chaque journée montre les
   traces de son analyse selon leur nature, conservées ou non (RG15).

## Scénarios alternatifs

- **A1 — Portfolio déjà évalué** (étape 4) : la carte d'un même journal, sous
  le même référentiel et le même jeu de gabarits, se souvient de ses journées
  (RG3) : l'aperçu ne compte que les journées nouvelles ou changées (« Ce
  portfolio a déjà été évalué : 1 journée sur 3 à instruire (1 nouvelle), les
  autres reprises telles quelles. ») ; le run n'instruit qu'elles et refait la
  fusion ; rien de neuf : seule la fusion se refait. Les résultats donnent
  aussi les cartes du jour reprises de la mémoire (`memoire`).
- **A2 — Admission partielle** (étapes 4-5, T8, stratégie A) : le crédit,
  déduit ce que ses autres analyses en cours peuvent encore dépenser, ou le
  budget du profil couvre les premières journées avec leur fusion, pas toutes :
  l'aperçu le dit, le run prend celles-là, les autres attendent une prochaine
  analyse ; l'attestation le garde.
- **A3 — Annuler, reprendre** (étape 6) : « Annuler » (`POST
  /api/twin9/runs/<id>/annuler`) arrête le run en cours et rend aussitôt ce
  que tiennent ses appels hors vol ; le tick paie au coût réel ses appels en
  vol une fois revenus, annule ses lots chez Anthropic et en relève les
  réponses ; « Reprendre » (`POST …/reprendre`) relance
  un run annulé ou arrêté depuis son journal : ce qui est fait n'est pas
  refait.
- **A4 — Arrêt par un plafond** (étape 6) : le budget, la durée du profil ou le
  crédit atteint, le run s'arrête (`echoue`) en le disant (« Budget atteint :
  carte incomplète »…). Arrêté par son budget, il reprend sous un nouveau
  budget (champ « Nouveau budget (USD) », vide pour aucun : `{budget_usd}`) ;
  par le crédit, une fois rechargé (« Recharger mon crédit », UC-APP-11). Ses
  journées finies s'ouvrent dans la cartographie, qui le dit (« Twin9 · … —
  carte incomplète »).
- **A5 — Résultats au cartographe** (étapes 2 et 6) : la case, au lancement ou
  sur la page du run (`PUT /api/twin9/runs/<id>/visibilite`), rend les
  résultats lisibles du cartographe auquel l'apprenant est lié (UC-APP-07),
  et de lui seul ; il ne suit ni ne commande le run.
- **A6 — Clé personnelle** (étape 2) : un profil à clé personnelle (promotion
  ouverte, clé enregistrée) : l'estimation est sans contribution, le crédit ne
  borne rien, et rien n'est débité ; la clé, chiffrée (ADR-004), ne sert que
  sur le serveur.
- **A7 — Autre référentiel** (étape 2, T16-T17) : un profil qui nomme un autre
  référentiel publié, ou un brouillon de son auteur en mode essai : le moteur
  le lit, et la carte s'ouvre avec ses pôles, que le titre du jeu nomme. De même
  une version de RESPIRE d'une autre structure (2026-10-20, UC-EPI-04 : six
  pôles, une compétence déplacée) : le moteur en lit les pôles (numérotés de 1
  à N, la règle du moteur), et ses fiches suivent RG12.
- **A8 — Mode essai** (étape 2) : un profil en mode essai ne lit que la
  première journée et le premier pôle ; « essai » dans « Mes analyses » et
  dans l'attestation.
- **A9 — Plusieurs fournisseurs** (étapes 2-5, P1-5, ADR-012) : sur
  `#/configuration`, chaque étage, étape et lecteur choisit son fournisseur —
  absent, il hérite du sien (« hérité : Anthropic ») ; son étiquette RGPD se lit
  à côté, sans le focus ; un fournisseur que l'instance n'a pas ouvert, ou dont
  elle n'a pas la clé, ne se choisit pas (« indisponible sur cette instance »,
  jamais pourquoi). Changer de fournisseur emporte la famille d'un lecteur qui
  suivait l'ancien, un modèle qu'il n'admet pas (un étage, qui en exige un, le
  demande), l'effort d'Anthropic ; ce que le serveur refuserait — un modèle
  hors du motif du fournisseur, un effort qu'hériterait un appel parti
  ailleurs, la clé personnelle avec un autre fournisseur — se dit à côté du
  réglage. La voie ne règle que les appels Anthropic, et son explication reste
  visible : par lots à moitié prix, en différé ; les autres fournisseurs
  toujours en direct ; sans appel Anthropic, elle est sans effet. Au
  lancement, l'accord nomme les fournisseurs du profil choisi, leur voie et
  leur étiquette (un fournisseur étiqueté « non » est dit à éviter pour des
  journaux d'élèves réels) ; donné, il ne vaut que pour eux : un profil qui en
  atteint d'autres, ou par une autre voie, le redemande avant tout aperçu. Le
  serveur compare la liste envoyée à celle des appels du profil (`422` si elle
  diffère) et refuse un fournisseur fermé ou sans clé d'instance, un modèle
  tiers sans prix ni plafonds (`422` qui nomme l'étape, affiché). Un run
  « mixte » : « en partie par lots, la durée dépend d'Anthropic ».
- **A10 — Mode d'affichage** (étape 2, 2026-10-22,
  [UC-VIS-06](../visiteur/UC-VIS-06-choisir-affichage-simple-expert.md)) :
  en mode expert, le menu « Ma cartographie » porte « Mes profils Twin9 »
  (`#/configuration`, jusque-là atteinte seulement par « Régler mes
  profils ») ; en mode simple, ce lien n'est pas listé, l'adresse reste
  valide. Le tableau de bord (`#/espace`) mène aux analyses par « Mes
  analyses approfondies » (UC-APP-03). La page `#/twin9` elle-même ne change
  pas encore : la liste des profils et « Régler mes profils » ne passeront
  en mode expert qu'avec le lot 2 du mode expert, après la fusion des lots
  Twin9 en cours.

## Scénarios d'erreur

- **E1 — Sans session** (étape 1) : « Connectez-vous pour lancer une analyse
  approfondie » ; l'API répond `401` sur toutes ses routes, `403` à une
  écriture sans jeton CSRF.
- **E2 — Analyse indisponible** (étapes 1, 5) : sans moteur (ou avec un moteur
  d'avant T16), « L'analyse approfondie n'est pas disponible sur cette
  instance » au lieu du formulaire ; un lancement ou un aperçu → `503` ; sans
  gabarit → `503` « Aucun gabarit sur cette instance… ».
- **E3 — Accord absent** (étape 5) : le bouton reste désactivé ; l'API répond
  `422` « Accord requis… », sans rien créer.
- **E4 — Portfolio ou profil refusé** (étapes 4-5) : nom ou texte invalide
  (`422`), profil d'un autre (`404`), profil refusé — clé personnelle fermée
  ou absente, jeu de gabarits non proposé ou incomplet, modèle sans prix sur
  l'instance, référentiel non publié ou illisible, jeu de gabarits d'avant T16
  hors de la structure que décrivent ses fiches (RG12) — `422` qui nomme le
  choix refusé ; la vue affiche le message.
- **E5 — Refus d'admission** (étapes 4-5) : le crédit ou le budget ne couvre
  pas même une journée et sa fusion : l'aperçu dit ce qu'il faudrait (« Votre
  crédit ne couvre pas une carte, même d'une journée : il faudrait … ») avec
  « Recharger », le bouton reste désactivé ; un lancement → `422`, même
  message.
- **E6 — Run d'un autre** (étapes 6-7) : `404` pour tout autre compte,
  l'administrateur compris ; l'administrateur lit les compteurs de tous les
  runs (`GET /api/twin9/admin/runs`), jamais un portfolio ni un résultat.
- **E7 — Récitation d'un gabarit ou d'une fiche** (étape 7) : expurgée à la
  lecture (« [expurgé] ») ; l'audit `twin9_fuite_expurgee` n'en garde que
  `{run, fuites}` — le run et le nombre de fuites —, jamais renvoyé.
- **E8 — Action impossible** (étape 6) : annuler un run qui n'est pas en cours,
  reprendre un run ni annulé ni arrêté → `409` ; budget invalide ou visibilité
  inconnue → `422`.

## Règles de gestion

- **RG1 — Accord** : demandé à chaque lancement, daté (`accord_at`) ; sans lui
  rien ne part. Il nomme les fournisseurs qu'atteignent les appels du profil,
  avec leur voie et leur étiquette RGPD, avant tout aperçu (l'aperçu emporte
  déjà le portfolio) ; il ne vaut que pour cette liste, que le lancement
  envoie et que le run garde dans sa configuration (`accord.fournisseurs`) ;
  `true` reste admis pour un profil tout Anthropic (ADR-012). Le portfolio et l'état restent sur le serveur jusqu'à la
  suppression du compte, qui les purge (UC-CPT-06, lots chez Anthropic
  compris) ; l'archive du compte les exporte (UC-APP-06).
- **RG2 — Profil** : revalidé et admis à chaque aperçu et à chaque lancement
  (`ProfilPolicy`) ; copié dans le run, la version de son référentiel figée ;
  le moteur ne lit que cette copie.
- **RG3 — Mémoire** : une carte par compte, journal, référentiel et jeu de
  gabarits ; ses journées inchangées sont reprises sans appel.
- **RG4 — Estimation** : d'après les évaluations des mêmes réglages (taille des
  journées et de la carte), sinon le vrai run de PLANT-01 (0,1344 $ et 94 s par
  pôle) × les pôles du référentiel ; à moitié prix par lots ; contribution
  comprise avec la clé de l'instance.
- **RG5 — Admission** (T8, stratégie A) : les premières journées, tant qu'elles
  tiennent avec leur fusion et la place du pire cas de leurs appels dans le
  crédit (moins ce que ses autres runs en cours peuvent dépenser) et dans le
  budget ; sinon refus, qui dit ce qu'il faudrait, au centime supérieur.
- **RG6 — Coût** : chaque appel réserve son pire cas avant de partir (débité
  avec la clé de l'instance), réconcilié au coût réel ; un run arrêté, annulé
  ou fini rend ce que ses appels tiennent encore.
- **RG7 — Plafonds** : budget et durée du profil ; atteints, aucun appel ne
  part plus et le run s'arrête, carte incomplète.
- **RG8 — Lecture** : le propriétaire suit, annule, reprend et lit ; le
  cartographe lié lit les résultats quand le run lui est visible ; tout autre
  reçoit `404` ; l'administrateur, des compteurs.
- **RG9 — Filtre de fuite** : tout ce qui s'affiche passe le filtre contre les
  jeux de gabarits et les fiches de référentiel de tous les runs de sa carte ;
  le compteur reste à l'audit.
- **RG10 — Avance** : le tick fait avancer tous les runs ; la page d'un run, les
  seuls runs de son compte, jamais avec le jeton du tick.
- **RG11 — Référentiel** : celui du profil ; les résultats en portent les pôles
  et les compétences, jamais une fiche ni une description.
- **RG12 — Fiches du référentiel lu** (T16, 2026-10-20, `ReferentielMoteur`) :
  celles d'un autre référentiel s'écrivent depuis son document (« # Pôle N —
  nom », sa description ; « ## CODE — nom », sa description, ses éléments) ;
  celles de RESPIRE viennent de la base (le modèle atomique) pour ce qu'elle
  décrit de la version lue — la fiche d'une compétence qu'elle connaît dans le
  même pôle, l'en-tête d'un pôle dont elle connaît exactement les compétences
  (il les compte) —, le reste s'écrit depuis le document ; sans aucune fiche en
  base, `503`. RESPIRE v7 se lit donc comme avant, à l'octet. Un jeu de
  gabarits d'avant T16 (ses fichiers de pôle `tagger/P1`…) écrit RESPIRE en
  toutes lettres, dans la structure que décrivent ses fichiers de pôle : il
  n'admet que RESPIRE, et dans cette structure (mêmes pôles, mêmes codes) ;
  sinon `422` (« … précède T16 … Pour un autre référentiel » ou « … tel que le
  décrivent ses fiches (7 pôles, 61 compétences). Pour une autre structure de
  RESPIRE, il faut … »).
- **RG13 — Configuration et exécution** (P0-1, `docs/contrats.md` §8.9) :
  la configuration est écrite au lancement et ne change plus, une reprise
  comprise ; l'exécution est figée quand le run finit, lue dans son journal
  sinon (« partielle » pour un run lancé avant elle). Le suivi, interrogé
  sans cesse, n'en porte que l'empreinte : la page lit les deux blocs dans
  les résultats, à l'ouverture seulement — à chaque ouverture tant que le
  run est en cours, ses comptes avançant —, jamais au rythme du suivi. Une
  sortie tronquée est une panne (§8) : la journée d'un appel en panne
  n'entre pas dans la mémoire, et sera instruite de nouveau ; un appel de la
  fusion n'est d'aucune journée. Le remède, un budget de sortie plus grand,
  change l'empreinte des réglages : au run suivant, toutes les journées de
  la carte sont instruites de nouveau, et payées ; la page le dit, et nomme
  les étapes en cause d'après les compteurs d'un run fini. Un cartographe lié
  les lit, sans prix, coût, plafond, clé ni sel, dans les résultats (l'API) :
  la page du run n'est que celle de son propriétaire ; chaque ligne de la vue
  tient à la présence de son champ. Un run d'avant P0-1 n'a pas de
  configuration : « Configuration » le dit, et montre son exécution,
  partielle, quand il en a une (un run en cours au déploiement de la
  migration 031).
- **RG14 — Ce que le jeu de cartographie en garde** (`importTwin9Run`) : une
  liste blanche, champ par champ — l'empreinte, les fournisseurs (libellé,
  étiquette RGPD, voie), les réglages de chaque appel, le référentiel
  (`id`, `version`, `label`, `empreinte`), le nom du jeu de gabarits ; de
  l'exécution, ses comptes d'appels et ses passes —, sous la clé
  « <run>|configuration » des délibérations de run, qui ne la compte pas
  comme une délibération. Jamais un prix, un coût, un plafond, la clé,
  l'admission de l'attestation ni l'empreinte du jeu de gabarits : le jeu se
  partage et s'archive. Chaque journée porte `provenance.model` (« profond:
  …, rapide: …, lecteurs: … »), `provenance.prompt` (« gabarits <jeu> ») et
  `provenance.configurationRef` ; l'interface les affiche sous « Twin9
  (serveur) ». Sans configuration, l'import ne change pas.
- **RG15 — Les traces de la stigmergie du greffier** (S3-3,
  `docs/contrats.md` §4 point 16, §7.4, §8.4) : une analyse dont le profil
  active la stigmergie laisse, dans la mémoire de sa carte, des traces — un
  passage validé par la procédure pour une compétence, sa nature
  (l'incertitude calculée : faible, moyenne, forte, écartée) et son
  intensité, de 0 à 3. Les résultats disent, par journée, si l'analyse est au
  journal de la mémoire (`traces_conservees`) : une journée dont un appel est
  en panne n'y dépose rien, et ses traces se montrent **non conservées** ;
  sans ce signal, jamais conservées, sauf pour une journée que la mémoire a
  reprise. Le jeu de cartographie en garde, par liste blanche, le rang, le
  run, la conservation et les traces (jamais les dépôts ni les traces lues),
  résumés dans son index. La modale du jour montre chaque trace, sa nature en
  mots et par la marque de son surlignage, son dernier verdict, et « Ouvrir
  dans le portfolio » la surligne de cette marque ; son **intensité** ne se
  lit qu'en mode expert et pour le cartographe, jamais sans session ni dans
  une copie autonome, et n'est jamais appelée « score ». L'Export propose
  alors le **portfolio surligné** (Markdown) : les passages des traces
  conservées entourés de `<mark data-twin9-code data-incertitude
  [data-intensite]>`, ligne par ligne, et le tableau des traces de chaque
  journée. Le texte envoyé au moteur n'en porte jamais : la page Twin9 retire
  ces marques avant l'aperçu et le lancement (UC-APP-01 RG10, UC-APP-06).
- **RG16 — Les journées de l'interface** (sprint 4, T0, `docs/contrats.md`
  §8.4, journal de la cartographie D-73) : le moteur découpe le texte à sa
  façon, l'interface autrement (UC-APP-01 RG5 ter : « 1er.02.2026 »,
  `#### 30.01.2026`, un titre daté au milieu d'une journée, deux entrées du
  même jour). La page n'envoie donc pas le texte brut, mais ses journées :
  celles de la fiche du portfolio, retouches à la main comprises (UC-APP-01),
  ou du découpage du site pour un fichier, une par date ; un en-tête que le
  moteur lit à la même date est gardé, sinon `### AAAA-MM-JJ` s'ajoute ;
  toute autre ligne qu'il lirait comme un titre daté, ou que l'interface
  lirait comme l'en-tête d'une autre journée, est précédée de « — » ; les
  passages sans date passent en tête, où le moteur ne lit rien. Un texte
  qu'il lit déjà en ces journées part à l'octet, comme un texte de moins de
  deux journées datées ; un export Google Docs (des dates seules, puis un
  trait) garde cette forme. Le run garde le texte tel qu'il a été envoyé. L'aperçu nomme les journées dont le texte change
  pour le moteur (« … : 2 journées touchées, 1er févr. 2026 et 10 févr.
  2026. ») — une journée évaluée sur le texte brut est instruite de nouveau
  une fois (RG3) : le texte envoyé ensuite est le même — et les passages
  sans date qu'il ne lit pas. Aperçu et lancement envoient le même
  texte.
- **RG17 — Deux cartes du même jour, le second ressort** (sprint 4, C3 et
  C4, `docs/contrats.md` §4 point 12, §8.4) : ouvert dans la cartographie,
  un run dont deux cartes du jour portent la même date (`<date>_b`) en fait
  une journée — à code égal, le statut le plus fort l'emporte avec son
  dossier, les traces des deux réunies — et le rapport d'import le dit. Une
  compétence que le second ressort établit par faisceau d'indices de
  plusieurs journées (« établie par faisceau (second ressort) ») se lit en
  **seconde lecture**, avec la compétence : son statut, sa confiance, ses
  indices, les journées de ses traces, sa délibération ; elle n'entre dans
  aucune journée ni dans le soleil, et le panneau de son pôle la nomme.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Portfolio | Envoyé au lancement avec l'accord ; gardé sur le serveur, compressé, avec l'état du run, jusqu'à la suppression du compte ; jamais renvoyé par le suivi ni les résultats ; part chez les fournisseurs que l'accord nomme — Anthropic, qui garde un lot 29 jours au plus ; les autres, ouverts par l'administrateur, en direct, selon leur conservation (`docs/rgpd-registre.md` §13) |
| Gabarits et fiches | En base ; jamais transmis au navigateur ; le filtre de fuite protège les résultats |
| Clé personnelle | Chiffrée (ADR-004), utilisée sur le serveur seulement, chez Anthropic seulement (ADR-012) |
| Grand-livre | Montants, modèle, jetons, libellé du run et de l'étape — jamais de contenu |
| Évaluation d'un run fini | Tailles et coûts de ses journées et de sa fusion, rien d'autre ; anonyme une fois le compte supprimé (T8) |
| Audit anti-fuite | `{run, fuites}` seulement |
| Configuration et exécution d'un run (P0-1) | Réglages, versions, empreintes, prix facturés et compteurs, jamais un gabarit, une fiche, la clé ni la marge ; lues par le propriétaire entières, par un cartographe lié sans prix, coût, plafond ni clé ; dans le jeu de cartographie, la seule liste blanche de RG14 |
| Traces de la stigmergie (S3-3) | Dans la mémoire de la carte (journal `stigmergie/<jour>`, exporté et purgé avec elle) et dans la carte du jour ; propres à la carte, jamais partagées ; dans le jeu de cartographie, la liste blanche de RG15 ; le portfolio surligné est produit dans le navigateur, jamais envoyé |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash` ; `web/src/nav.js` — `navGroups` | Routes `#/twin9` et `#/twin9/<id>` ; entrée « Analyse approfondie » (premium) |
| Front | `web/src/views/Twin9View.jsx` — `Lancer`, `Apercu`, `PageDuRun`, `phraseFournisseurs` | Choix, accord qui nomme les fournisseurs (A9), aperçu, lancement ; suivi, avance, annulation, reprise sous un nouveau budget, visibilité, ouverture dans la cartographie, attestation |
| Front | `web/src/views/ConfigurationView.jsx` ; `web/src/views/configuration/profilSchema.js` — `fournisseurDe`, `fournisseurHerite`, `fournisseursDuProfil`, `suivreLeFournisseur`, `modeleAdmis` | Le fournisseur de chaque étage, étape et lecteur, son étiquette, la voie, ce que le serveur refuserait (A9) |
| Front | `web/src/views/twin9/ConfigurationDuRun.jsx` — `ConfigurationDuRun`, `VueConfiguration` | « Configuration » de la page du run : lecture à l'ouverture, réglages par rôle, exécution (RG13) |
| Front | `web/src/api/twin9.js` — `fetchRuns`, `fetchConfiguration`, `apercuRun`, `lancerRun`, `fetchRun`, `avancerRuns`, `annulerRun`, `reprendreRun`, `rendreRunVisible`, `fetchResultats`, `formatUsd` | Client des runs |
| Front | `web/src/lib/interface-handoff.js` — `twin9RunFiles` | Document `twin9-run` remis à l'interface de cartographie |
| Front | `web/src/carto/core/importers/twin9-run.js` — `importTwin9Run`, `configurationGardee`, `executionGardee` ; `web/src/lib/twin9/mapper.js` — `twin9Dossier`, `twin9ToMergeDocument` | Jeu de cartographie d'un run, dossier de chaque verdict, configuration par liste blanche (RG14) |
| Front | `web/src/carto/ui/Manager.jsx` — `SOURCE_LABELS`, `provenanceLabel` | « Twin9 (serveur) », modèles et jeu de gabarits d'une journée |
| Front | `web/src/carto/core/stigmergie.js` — `stigmergieGardee`, `tracesConserveesDuJour`, `intensitesVisibles` ; `web/src/carto/ui/Stigmergie.jsx` — `StigmergieDuJour` ; `web/src/carto/ui/highlight-dom.js` — `traceClass` ; `web/src/carto/ui/PortfolioReader.jsx` | Les traces de la stigmergie dans le jeu, la modale du jour et le volet du portfolio (RG15) |
| Front | `web/src/carto/core/portfolio-md.js` — `buildHighlightedPortfolioMarkdown` ; `web/src/carto/ui/ExportPanel.jsx` ; `web/src/lib/twin9/marques.js` — `sansMarquesTwin9`, `retirerMarquesTwin9` | Le portfolio surligné ; ses marques retirées de tout texte importé ou envoyé (RG15) |
| Front | `web/src/lib/twin9/portfolio-pour-twin9.js` — `portfolioPourTwin9`, `journeesLuesParTwin9` ; `web/src/carto/core/portfolio-md.js` — `keepInDay` | Le portfolio envoyé, découpé en les journées de l'interface ; ce que l'aperçu en dit (RG16) |
| Front | `web/src/carto/core/importers/twin9-run.js` — `importTwin9Run` (`cartesReunies`, `stigmergieReunie`, `secondRessort`) ; `web/src/carto/core/import.js` — `mergeIntoDataset` ; `web/src/carto/ui/SecondReading.jsx` — `readingName`, `readingVerdict`, `SecondReadings` ; `web/src/carto/ui/DetailPanel.jsx` | Deux cartes du même jour réunies ; le second ressort en seconde lecture, sa ligne, le panneau du pôle (RG17) |
| API | `GET/POST /api/twin9/runs`, `POST …/apercu`, `POST …/avancer`, `GET …/{id}`, `POST …/{id}/annuler`, `POST …/{id}/reprendre`, `PUT …/{id}/visibilite`, `GET …/{id}/resultats`, `GET /api/twin9/admin/runs` — `api/src/routes/twin9-runs.php` | Runs du serveur |
| API | `api/src/Middleware/CsrfMiddleware.php` | Jeton CSRF des écritures (E1) — logique unitaire couverte par UC-CPT-02-U07 |
| Domaine | `api/src/Twin9/Lancement.php` — `lancer`, `apercu`, `empreinte` | Lancement, aperçu, estimation, admission ; jeu d'avant T16 (RG12) |
| Domaine | `api/src/Twin9/ReferentielMoteur.php` — `bloc` | Le référentiel du run tel que le moteur le lit, ses fiches (RG12) |
| Domaine | `api/src/Twin9/ProfilPolicy.php` — `admettre`, `admettreAuLancement`, `choix` | Ce qu'un profil peut choisir sur l'instance ; les fournisseurs disponibles (A9) |
| API | `GET /api/twin9/configuration` — `api/src/routes/twin9-configuration.php` ; `Lancement::fournisseurs` | Les fournisseurs de chaque profil et du profil v9.8, pour l'accord (A9) |
| Domaine | `api/src/Twin9/RunRepository.php` — `duProprietaire`, `suivi`, `annuler`, `reprendre`, `rendreVisible`, `acces` | Liste, suivi, actions du propriétaire |
| Domaine | `api/src/Twin9/RunCosts.php`, `api/src/Twin9/CreditService.php` | Réserves, réconciliation, remboursements |
| Domaine | `api/src/Twin9/Resultats.php` — `lire` ; `api/src/Twin9/LeakFilter.php` | Résultats filtrés, mémoire, référentiel du run ; traces de la stigmergie conservées ou non (RG15) |
| Domaine | `api/src/Twin9/RunConfiguration.php` — `depuis`, `pourCartographe` ; `api/src/Twin9/RunExecution.php` — `bloc`, `depuis`, `pourCartographe` ; `RunRepository::configuration`, `execution` | Configuration et exécution d'un run (RG13) |
| Domaine | `api/src/Twin9/EngineLoader.php`, `api/src/Worker/Tick.php` | Chargement du moteur, tranches (tick et page) |
| Moteur | `Twin_v9/php/src` (dépôt privé), `api/tests/fixtures/twin9-factice` (moteur factice des tests) | Exécution du protocole |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-APP-10-U01 | `parseHash`, `navGroups` | `#/twin9` et `#/twin9/<id>` ; l'entrée « Analyse approfondie », premium, pour un apprenant | `web/test/usecases/unit/uc-app-10-analyse-approfondie-twin9.test.jsx` |
| UC-APP-10-U02 | client des runs | Méthode, chemin et corps de chaque route (aperçu, lancement, avance, annulation, reprise avec ou sans budget, visibilité, résultats) | idem |
| UC-APP-10-U03 | `twin9RunFiles` | Document `twin9-run` : fusion et cartes du jour lues, mémoire, référentiel du run complété des descriptions du publié de même identifiant, `incomplete` ; rien à ouvrir → erreur | idem |
| UC-APP-10-U04 | `Twin9View` (`Lancer`) | Journées à instruire : premier run, portfolio déjà évalué (A1), rien de neuf | idem |
| UC-APP-10-U05 | `Twin9View` (`Apercu`) | Admission partielle (A2) ; refus (E5) : message, « Recharger », bouton désactivé | idem |
| UC-APP-10-U06 | `Twin9View` (`PageDuRun`) | Arrêt par le budget : nouveau budget, reprise `{budget_usd}` ; par le crédit : « Recharger mon crédit » (A4) | idem |
| UC-APP-10-U07 | `Lancement::lancer` | Accord absent, visibilité inconnue → `422`, rien n'est créé (RG1, E3) | `api/tests/UseCases/Unit/UcApp10AnalyseApprofondieTwin9Test.php` |
| UC-APP-10-U08 | `ProfilPolicy::admettre` | Profil v9.8 admis ; clé personnelle fermée, jeu non proposé, modèle sans prix, référentiel non publié → `422` qui nomme le choix (RG2, E4) | idem |
| UC-APP-10-U09 | `Lancement::apercu` | Estimation sans évaluation : référence × pôles × contribution, la moitié par lots ; clé personnelle sans contribution ; rien n'est gardé (RG4) | idem |
| UC-APP-10-U10 | `RunRepository::annuler`, `reprendre`, `rendreVisible` | Seul le propriétaire agit, et seulement depuis le bon statut ; un nouveau budget remplace celui de la copie (A3, A4, A5, E8) | idem |
| UC-APP-10-U11 | `RunRepository::suivi` | Ce qui retient un run en mots (premier tour, run précédent de la même carte) ; ni portfolio ni sortie | idem |
| UC-APP-10-U12 | `Resultats::lire` | Seules les sorties publiques ; récitation expurgée, audit en compteur ; référentiel sans fiche ni description (RG9, RG11) | idem |
| UC-APP-10-U13 | `Lancement::empreinte` | Empreinte d'un jeu de gabarits stable, indépendante de l'ordre, sensible au contenu | idem |
| UC-APP-10-U14 | `VueConfiguration` | Chaque rôle (fournisseur, étiquette RGPD, voie, modèle, budget de sortie), jeu, référentiel, clé ; exécution par fournisseur et par voie, passes, coût ; conseil des sorties tronquées (étapes nommées d'après les compteurs, journée ou fusion, coût du remède : toute la carte instruite de nouveau) ; d'où viennent les comptes (figés, en cours, arrêté) ; les blocs filtrés d'un cartographe lié (la vue réutilisée) : ni clé ni coût ; un run d'avant P0-1 : son exécution partielle seule (RG13) | `web/test/usecases/unit/uc-app-10-analyse-approfondie-twin9.test.jsx` |
| UC-APP-10-U15 | `importTwin9Run` | Configuration et exécution gardées par liste blanche sous « <run>\|configuration », non comptées comme une délibération ; modèles et jeu de gabarits de chaque journée ; ni prix, ni coût, ni plafond, ni clé (RG14) | idem |
| UC-APP-10-U17 | `Twin9View` (`Lancer`) | L'accord nomme chaque fournisseur du profil, sa voie et son étiquette RGPD, avant tout aperçu ; un fournisseur « non » dit à éviter ; un autre profil le redemande ; un serveur qui ne nomme pas les fournisseurs : Anthropic ; le lancement envoie `{fournisseurs}` (RG1, A9) | `web/test/usecases/unit/uc-app-10-analyse-approfondie-twin9.test.jsx` |
| UC-APP-10-U16 | `ETAPES_DU_MOTEUR` | Les étapes du moteur que comptent les compteurs du run, rapportées à celles du profil comme `CallSettings::ETAPES` les range (lu dans le code PHP) : le conseil des sorties tronquées nomme celles de la page des profils (RG13) | idem |
| UC-APP-10-U18 | `Resultats::lire` | `traces_conservees` : par carte du jour qui porte la stigmergie, vrai si son analyse est au journal de la mémoire de la carte, faux pour une journée en panne ; les journées de la mémoire de même ; sans bloc ou d'un run illisible, rien ; `{}` sans bloc ; sous `test/` en mode essai (RG15) | `api/tests/UseCases/Unit/UcApp10AnalyseApprofondieTwin9Test.php` |
| UC-APP-10-U19 | `importTwin9Run` | Le bloc gardé par liste blanche dans le détail, résumé dans l'index ; conservé si les résultats le disent, non conservé (rapport) pour une journée en panne, nul sans signal, conservé pour une journée de la mémoire ; mêmes identifiants et empreintes avec ou sans lui (RG15) | `web/test/usecases/unit/uc-app-10-analyse-approfondie-twin9.test.jsx` |
| UC-APP-10-U20 | `twin9RunFiles`, `StigmergieDuJour` | `traces_conservees` remis à l'interface (nul sans lui) ; la nature de chaque trace en mots, sa conservation, son intensité seulement quand elle se montre, jamais « score » ; « Ouvrir dans le portfolio » emporte la nature et, visible, l'intensité (RG15) | idem |
| UC-APP-10-U21 | `buildHighlightedPortfolioMarkdown` | Le portfolio surligné : marque par nature, intensité seulement quand elle se montre, jamais une trace non conservée ; sans ses marques, le portfolio exporté à l'octet (RG15) | idem |
| UC-APP-10-U22 | `Twin9View` (`Lancer`) | Le texte envoyé à l'aperçu ne porte jamais les marques d'un portfolio surligné rangé dans la bibliothèque (RG15) | idem |
| UC-APP-10-U23 | `portfolioPourTwin9`, `Twin9View` (`Lancer`, `Apercu`) | Le texte envoyé à l'aperçu et au lancement, le même, découpé selon la fiche du portfolio (une fusion faite à la main comprise) : en-tête ajouté, en-tête intérieur neutralisé ; l'aperçu nomme les journées retouchées ; un portfolio que le moteur lit déjà ainsi part à l'octet, l'aperçu n'en dit rien ; un passage sans date en tête : l'aperçu dit que le moteur ne le lit pas (RG16) | idem |
| UC-APP-10-U24 | `importTwin9Run`, `SecondReadings` | Deux cartes du même jour : une journée, leurs compétences réunies, le rapport le dit ; une compétence établie par faisceau : une seconde lecture, sa ligne (statut du moteur, journée de ses traces), hors du soleil (RG17) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-APP-10-F01 | Nominal | API | Liste vide et `disponible` ; aperçu ; lancement `201` avec attestation ; la page fait avancer le run jusqu'au bout ; résultats du propriétaire, référentiel du run ; liste | `api/tests/UseCases/Functional/UcApp10AnalyseApprofondieTwin9Test.php` |
| UC-APP-10-F02 | A1 | API | Une journée ajoutée : l'aperçu ne compte qu'elle, le run n'instruit qu'elle, les autres viennent de la mémoire | idem |
| UC-APP-10-F03 | A2 | API | Crédit pour une journée : le run la prend, l'autre attend ; l'attestation le dit | idem |
| UC-APP-10-F04 | A3, E8 | API | Annuler puis reprendre jusqu'au bout ; `409` pour une action hors de son statut | idem |
| UC-APP-10-F05 | A4, E8 | API | Reprise sous un nouveau budget, puis sans budget ; budget invalide → `422` | idem |
| UC-APP-10-F06 | A5 | API | Privé : le cartographe lié ne lit rien ; visible : lui seul lit les résultats, sans suivre le run | idem |
| UC-APP-10-F07 | A6 | API | Clé personnelle : run au bout, crédit intact, aucun événement au grand-livre | idem |
| UC-APP-10-F08 | A7 | API | Un autre référentiel : run au bout, résultats portant ses pôles et ses compétences | idem |
| UC-APP-10-F20 | A7, RG12 | API | Une version de RESPIRE à six pôles : l'aperçu en compte six, run au bout, résultats portant ses six pôles et ses compétences | idem |
| UC-APP-10-F09 | A8 | API | Mode essai : une journée lue, « test » dans la liste et l'attestation | idem |
| UC-APP-10-F10 | E1 | API | `401` sans session sur chaque route ; `403` sans jeton CSRF | idem |
| UC-APP-10-F11 | E2 | API | Sans moteur : `disponible` faux, aperçu et lancement `503` ; sans gabarit : `503` | idem |
| UC-APP-10-F12 | E3, E4 | API | Accord absent, portfolio invalide, profil d'un autre, profil refusé : `422` ou `404`, aucun run | idem |
| UC-APP-10-F13 | E5 | API | Crédit nul : l'aperçu dit ce qu'il faudrait ; le lancement est refusé du même message | idem |
| UC-APP-10-F14 | E6, RG10 | API | Le run d'un autre : `404` pour tous, l'administrateur compris, qui ne lit que des compteurs ; la page n'avance que les runs de son compte | idem |
| UC-APP-10-F15 | E7 | API | Un gabarit récité est expurgé des résultats ; l'audit garde le nombre, la réponse ne le dit pas | idem |
| UC-APP-10-F16 | Nominal | IHM | `<App/>` : profil, portfolio, accord, aperçu, lancement ; la page du run avance jusqu'au bout, puis s'ouvre dans la cartographie | `web/test/usecases/functional/uc-app-10-analyse-approfondie-twin9.test.jsx` |
| UC-APP-10-F17 | E1, E2 | IHM | Visiteur : invite à se connecter ; instance sans moteur : message, sans formulaire | idem |
| UC-APP-10-F18 | A2, E5 | IHM | Admission partielle dite ; refus : message, « Recharger », aucun lancement possible | idem |
| UC-APP-10-F19 | A3, A4, A5 | IHM | Annuler, reprendre ; arrêté par le budget, reprise sous un nouveau budget ; case du cartographe | idem |
| UC-APP-10-F22 | A9, RG1, E4 | IHM | `<App/>` : un profil Anthropic et Mistral AI ; l'accord nomme les deux, leur voie et leur étiquette, avant tout aperçu ; le lancement envoie `{fournisseurs: [anthropic, mistral]}` (CSRF) ; un fournisseur non ouvert fait refuser le lancement (`422`), message affiché, la page reste | `web/test/usecases/functional/uc-app-10-analyse-approfondie-twin9.test.jsx` |
| UC-APP-10-F21 | Nominal (étapes 7-8), RG13, RG14 | IHM | `<App/>` : la page d'un run fini ouvre sa configuration, lue dans ses résultats à l'ouverture seulement, à côté de l'attestation inchangée ; le conseil de la sortie tronquée nomme son étape et dit le coût du remède ; ouvert dans la cartographie, le jeu garde la configuration par liste blanche, chaque journée dit ses modèles et son jeu, rien d'un prix, d'un coût ni de la clé | `web/test/usecases/functional/uc-app-10-analyse-approfondie-twin9.test.jsx` |
| UC-APP-10-F23 | Nominal (étape 7), RG15 | IHM | `<App/>` : un run dont la stigmergie est activée, ouvert dans la cartographie ; le jeu garde les traces de chaque journée, conservées ou non ; la modale du 5 montre sa trace et sa nature, sans intensité pour l'apprenant en mode simple ; celle du 6, en panne, les dit non conservées | idem |

### Tests existants liés (non-régression)

- `api/tests/Twin9/RunsTest.php` — lancement, suivi, annulation, reprise, visibilité, avance par la page, filtre de fuite des résultats, référentiel du run, moteur ou jeu d'avant T16 (un autre référentiel, une version de RESPIRE à six pôles refusés ; RESPIRE dans la structure de ses fiches lancé).
- `api/tests/Twin9/ReferentielMoteurTest.php` — le bloc du référentiel (RG12) : RESPIRE v7 tel que la base le garde, un autre référentiel écrit depuis son document, un code que la base ne connaît pas, une version de RESPIRE à six pôles (compétence déplacée), et, avec le vrai moteur, RESPIRE v7 lu comme les fichiers de pôle de la v9.8 et RESPIRE à six pôles lu.
- `api/tests/Twin9/JeuxGabaritsTest.php` — copie d'un jeu d'avant T16 : ce qu'il faut refaire pour un autre référentiel.
- `api/tests/Twin9/ApercuTest.php` — journées nouvelles ou changées, estimation, admission (T8), refus.
- `api/tests/Twin9/CoutsTest.php` — réserves, réconciliation, plafonds (budget, durée, crédit), clé personnelle.
- `api/tests/Twin9/PurgeExportTest.php` — purge du compte, lots chez Anthropic, export.
- `api/tests/Twin9MetaTest.php` — le proxy du moteur du navigateur est parti (T11).
- `api/tests/Twin9/RunConfigurationTest.php`, `api/tests/Twin9/RunsTest.php`, `api/tests/Twin9/PurgeExportTest.php` — configuration et exécution d'un run (P0-1) : liste blanche, vue du cartographe, tables vides en objets, reprises, export d'un run ancien.
- `web/src/views/Twin9View.test.jsx` — lancement, aperçu, admission, page du run, carte incomplète, référentiels (T17) ; « Configuration » (P0-1) : lue à l'ouverture seulement, l'exécution partielle seule d'un run d'avant elle, relue à chaque ouverture d'un run en cours et quand il finit, erreur dans le bloc ; l'accord qui nomme les fournisseurs, tient pour les mêmes, tombe pour d'autres, la durée d'un run mixte (A9).
- `web/src/views/ConfigurationView.test.jsx`, `web/src/views/configuration/profilSchema.test.js` — le fournisseur de chaque réglage : hérité, étiquette visible, indisponible non choisi, famille, modèle et effort qui suivent, ce que le serveur refuserait dit à côté, la voie expliquée, la clé personnelle chez Anthropic seulement ; l'héritage, les fournisseurs atteints et les tables recopiées du PHP (étages des étapes, libellés, étiquettes, motifs de modèle) comparés au code PHP (A9).
- `api/tests/Twin9/ConfigurationDroitsTest.php` — `testTheConfigurationNamesEachProfilesProviders` (les fournisseurs de chaque profil et du profil v9.8, avant tout aperçu), `testAProviderNotOpenYetIsSavedNotLaunched` ; `api/tests/Twin9/RunsTest.php` — l'accord comparé aux fournisseurs du run, gardé dans sa configuration (A9).
- `web/src/carto/core/importers/twin9-run.test.js`, `web/src/lib/twin9/mapper.test.js` — jeu de cartographie d'un run, dossiers ; configuration par liste blanche, variantes inchangées avec ou sans elle, jeu exporté sans prix ni clé (P0-1).
- `web/src/lib/archive.test.js` — l'archive du compte avec la configuration et l'exécution d'un run, sans elles pour un run ancien, invalide avec une clé inconnue (P0-1).
- `api/tests/Twin9/StigmergieTest.php` — avec le vrai moteur (`TWIN_V9_DIR`) : deux runs d'une carte déposent puis renforcent leurs traces ; une journée dont le président d'un tribunal est en panne écrit le bloc, son analyse n'entre pas au journal, et ses résultats, le run fini (journal d'appels effacé), la disent non conservée, ceux du run d'avant conservée (RG15).
- `web/src/carto/core/stigmergie.test.js`, `web/src/carto/ui/Stigmergie.test.jsx`, `web/src/carto/ui/highlight-dom.test.js`, `web/src/carto/core/portfolio-md.test.js`, `web/src/lib/twin9/marques.test.js` — les traces dans le jeu, la modale et le volet (marque par nature, intensité selon le mode et le rôle), le portfolio surligné et son aller-retour, le retrait des marques (sécurité : aucune trace forgée par un fichier, aucune marque dans le texte rendu) (RG15).
- `web/src/carto/core/importers/twin9-run.test.js`, `web/src/lib/twin9/mapper.test.js`, `web/src/carto/ui/SecondReading.test.jsx` — deux cartes du même jour, le second ressort en seconde lecture, la fusion sans journée « - », la ligne et le panneau du pôle (RG17) ; l'oracle 12 de Twin9 (un faisceau établi), lu dans `TWIN_V9_DIR`.
- `web/src/lib/twin9/portfolio-pour-twin9.test.js` — le portfolio envoyé (RG16) : les onze formes d'en-tête de l'étude du sprint 4, journées égales des deux côtés, journées retouchées ; les cinq portfolios de Twin9 à l'octet (lus dans `TWIN_V9_DIR`) et le moteur PHP lui-même quand il est là ; journal à rebours, deux entrées du même jour, fiche retouchée, passages sans date, Google Docs. `api/tests/Twin9/PortfolioPourTwin9Test.php` — le texte rendu pour les onze formes, découpé par le vrai moteur chargé par `EngineLoader` : les dix journées de l'interface.
- `web/e2e/twin9-run.e2e.js`, `web/e2e/twin9-referentiels.e2e.js` — de bout en bout, en local (`docs/tests-e2e.md`).

### Exécuter

```sh
(cd api && vendor/bin/phpunit --filter UcApp10 --testdox)
cd web && npx vitest run test/usecases/unit/uc-app-10 test/usecases/functional/uc-app-10
```

## Anomalies constatées

Aucune.

## Limites

- A10 n'est couvert que par les tests du menu (UC-VIS-04-U13, F20 ; UC-VIS-06-U02,
  F02) et du tableau de bord (UC-APP-03-F16) : la vue `#/twin9` ne lit pas
  encore le mode.
- Le moteur est le dépôt privé `Twin_v9` : sans lui, l'analyse est indisponible
  (E2) et ses tests PHP sur le vrai moteur se sautent ; les tests de ce cas
  tournent sur le moteur factice, public, et l'Anthropic simulé de l'instance.
- La page du run n'a pas de titre de niveau 1 (« Analyse approfondie » est un
  titre de niveau 2), comme la page Configuration.
- L'arrêt par un plafond se vérifie de bout en bout par `CoutsTest`, qui pilote
  le coût des appels ; avec le moteur factice, le coût réel reste loin des
  plafonds, et UC-APP-10-F05 ne vérifie que la reprise sous un nouveau budget.
