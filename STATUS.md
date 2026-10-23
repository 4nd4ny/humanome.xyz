# STATUS — journal de bord

## État : v1.1.0 + interface ultime de cartographie — EN PRODUCTION

Les 14 prompts P0→P13 (v1.0) puis les 11 chantiers v1.1 (D1→D11) sont appliqués, intégrés,
déployés sur https://humanome.xyz et vérifiés en ligne. Code public :
https://github.com/4nd4ny/humanome.xyz (`main` + tags `v1.0.0`/`v1.1.0`). Voir « Actions restantes
(utilisateur) » en fin de fichier.

Interface ultime de cartographie (branche `feat/ultimate-cartography`) : validée par Christian,
**déployée le 2026-10-14** (`health` → `v1.1.0-106-gc6a0231`, migrations 022 et 023) puis fusionnée
dans `main` (entrée du 2026-10-14 ci-dessous).

Chantier en cours : le moteur Twin9 v9.8 en PHP, exécuté sur le serveur (ADR-011), planifié et
développé dans le dépôt privé `4nd4ny/Twin_v9` (`docs/plan-twin9-php.md`, prompts T0 → T18, une
conversation chacun ; entrées du 2026-10-17). T0 à T17 sont fusionnés : le moteur
passe l'oracle complet dans `Twin_v9`, le profil est ici, les runs tournent sur le serveur par
tranches, par appels directs ou par lots, se lancent, se suivent, se lisent et se paient — la base
commune et la stratégie A de T8 comprises —, sur des jeux de gabarits et des référentiels de toute
structure, que le moteur lit (T16) et que la cartographie affiche (T17) ; le moteur du navigateur
est retiré (T11, fusionné le 2026-10-20). T18, la démonstration sur l'OVH, est préparé,
fusionné (#19, le 2026-10-21, après l'import des gabarits sans Python, #18) et **déployé le
2026-10-21** au feu vert de Christian (`health` → `7b198cc`, moteur Twin9 `9eea3a1` chargé ; entrée
« Déploiement » du jour) : restent les tâches planifiées — deux relais depuis un autre
hébergement OVH, plutôt que cron-job.org (entrée du 2026-10-22) —, dont Christian s'occupe, et la
recette (`docs/recette-twin9.md`).

Hors planning, à la demande de Christian (2026-10-20) : le référentiel dynamique — RESPIRE n'a
plus de structure imposée, et tous les parcours lisent la structure du référentiel qu'ils emploient
(#15, fusionnée le 2026-10-20) ; puis les gabarits Twin6 versionnés et les vestiges de T11 retirés
(#16, arrivée dans `main` le 2026-10-21 avec la documentation des fiches des référentiels
importés). Entrées du 2026-10-20. Puis, le 2026-10-21 : la démo à 1 $ par jour, qui tient, et
l'essai gratuit de la cartographie ouverte (#20) ; les prix d'Anthropic relevés chaque jour (Sonnet 5
n'est plus surfacturé), la sortie des appels sans plafond, Haiku seul pour la démo et les appels en
flux — la réponse arrive à mesure, un appel coupé est facturé pour ce qu'il a produit (#21,
empilée sur #20). Le soir même, le site est basculé sur l'OVH pour la démonstration, au feu vert de
Christian.

Le 2026-10-22, le plan « P0 et multi-fournisseur » de Twin9 commence par sa PR A
(`feat/twin9-p0-configuration`, #26) : chaque run garde sa configuration et son exécution
et les affiche, une sortie tronquée est une panne, la voie directe ne rejoue plus une passe à chaque
réponse. Suivent la PR B (adaptateurs JS, export Twin6, #24) et la PR C (multi-fournisseur,
#32, fusionnée le 2026-10-22) : chaque étape d'un run Twin9 peut partir chez un autre fournisseur
qu'Anthropic, que l'administrateur ouvre. Puis les sprints de `TODO_LIST.md` (1 à 5, 7a, 8, 11,
la phase D) et, le 2026-10-23, la première campagne réelle de Twin9 en local
(`docs/campagne-twin9-2026-10-23.md`, entrée ci-dessous).

## Fait

- 2026-10-23 — **Sprint 9, correctifs de relecture (branche `feat/trois-interfaces`, rien poussé
  ni déployé).** La relecture du sprint (entrée suivante) a confirmé des contrastes que la preuve
  sur les règles laissait passer, et un écart à la proposition B. Chaque correctif porte le test
  qui échouait avant lui.
  - `b48641a` — **encre héritée d'une règle de base** : UC-VIS-07-U09 mesure aussi le fond seul
    d'un état ou d'un modificateur (`:hover`, `[aria-pressed]`, `.is-*`, `.x--y`) sous l'encre
    de sa règle de base (14 couples), et exige qu'un modificateur garde son fond au survol. Rouge
    avant, il a trouvé exactement : le bouton « Confirmer : tout supprimer » de la cartographie
    (`.carto-btn--danger`), blanc sur le danger du sombre de l'épistémiarque (2,48:1), qui
    prenait l'aplat d'accent au survol (désormais le cramoisi en encre et en filet sur la carte,
    le fond de danger au survol, comme le Supprimer de la proposition A) ; le survol des boutons
    de démonstration de l'administration, blanc sur `--accent-strong` (1,94:1 ; désormais
    `--accent-solid-hover`). Les deux défauts existaient sur `main` (2,77 et 1,8:1).
  - `de6397d` — **repère de la feuille courante de la heatmap** (`.heatmap-day-current`) :
    l'aplat d'accent tombait à 2,69:1 sur la surface blanche du diagramme en noèsiologue et en
    technomancien sombres (régression de S9-1) ; désormais `--viz-ink`. Nouveau U12 : toute
    couleur d'interface tracée dans la zone du diagramme atteint 3:1 (4,5:1 pour un texte) sur
    `--viz-surface` dans les neuf contextes (16 tracés).
  - `04d2d20` — **case active de la heatmap de la cartographie** (`.carto-hm-cell.is-focus`) :
    `--focus` au lieu de l'accent (terre cuite, voisine de FLAMBEAU) ; U10 compte aussi les
    `.is-focus` (14 anneaux).
  - `d740018` — **champs visés par leur classe** : U11 lit aussi les classes que le JSX pose sur
    un champ et refuse un mélange ; il a trouvé la liste « Vitesse de lecture » du lecteur de
    timeline (environ 2,3:1, désormais `--viz-ink-soft`, 7,6:1) et deux zones de texte bordées
    de `--line` (`.epi-comp-desc`, `.portfolio-day-texte`). 39 bordures.
  - `91f3d8e` — **petits intertitres** : `--font-subheading` et `--fw-subheading` dans les trois
    blocs typographiques ; les 32 titres h1 à h3 qu'un composant ramène sous 1,125 rem les
    lisent : Nunito gras en noèsiologue (la proposition B réserve Fredoka aux titres de
    1,125 rem et plus), sans changement en épistémiarque ni en technomancien. Gardé par
    `fonts.test.js`.
  - Ce `docs:` — ADR-014 (la citation de Christian, désormais littérale, avec « technomacien
    [sic] » ; §4, §6 et conséquences) ; UC-VIS-07 (RG6, RG7, U09 à U12, limites, anomalies) ;
    `docs/ergonomie-navigation.md` §5quater ; catalogue recompté : 1 097 U, 1 239 F (UC-VIS-07 :
    12 U, 7 F).
  - **Vérifié** (Node 20, sur l'arbre de ce `docs:`) : front 3 072 tests verts, 9 sautés (279
    fichiers) ; moteur 593 verts sur 593 (avec `TWIN_V9_DIR`) ; `npm run build` puis
    `npm run test:dist` vert ; `check-publiable` OK. Chaque test étendu a été lancé rouge avant
    sa correction (U09 : 5 écarts, U12 : 4, U10 : 1, U11 : 3, polices : 32 titres). Dans
    Chromium (serveur de développement, API simulée), pour les trois interfaces en clair et en
    sombre : le bouton armé de suppression de la démonstration à 6,5:1 au moins, au survol à
    5,5:1 au moins ; un petit intertitre de la cartographie en Nunito 700 dans la noèsiologue,
    en Source Serif 4 et en Space Grotesk (600) ailleurs ; le repère de la heatmap et le filet de
    « Vitesse de lecture », injectés dans la zone du diagramme, à `#1e293b` et `#475569`. PHP
    non lancé : aucun fichier PHP touché.
  - **Non vérifié** : le survol des boutons de l'administration et la heatmap de la feuille
    courante dans leurs vraies pages (connexion requise ; règles calculées et cascade vérifiée
    hors page seulement) ; un état qui ne change que l'encre sur le fond de sa règle de base
    n'est pas mesuré (le cas inverse l'est) ; la date courante et la plage brossée de la heatmap
    de la cartographie tracent encore l'accent, et aucun trait d'une seule couleur n'atteint
    3:1 sur toutes les cases de niveau 5 des pôles ; le filet des boutons du lecteur de timeline
    reste à environ 2,3:1 (des boutons, pas des champs ; leur glyphe les signale).
  - **À décider (Christian)** : un repère à deux tons pour la heatmap de la cartographie (date
    courante, plage brossée, case active), s'il faut l'atteindre partout à 3:1.

- 2026-10-23 — **Sprint 9 : la charte graphique, trois interfaces au choix du visiteur (branche
  `feat/trois-interfaces`, rien poussé ni déployé ; humanome.xyz seulement).** Christian, le
  2026-10-23 : « Les trois propositions d'interface sont excellentes. Nous allons les conserver
  toutes les trois et […] leur attribuer les noms des filières » : **épistémiarque** (proposition
  A, le défaut), **noèsiologue** (B), **technomancien** (C ; son message écrit « technomacien »,
  les contenus écrivent « Technomancien »). Décision : `docs/decisions/ADR-014-trois-interfaces.md`
  (013 est pris par l'ADR des écoles du sprint 6, branche `feat/ecoles`) ; cas d'utilisation :
  UC-VIS-07. EduChat et la Fabrica ne sont pas touchés.
  - `13ec9b9` (S9-1) — **trois interfaces, chacune en clair et en sombre.** Les jetons `--ds-*`
    de chaque interface dans `global.css` (clair, sombre du système, sombre choisi : neuf
    contextes au même jeu de jetons), les variables historiques (`--ink`, `--paper`,
    `--accent`…) en alias, sans renommage ; les couleurs de données (familles, monitoring,
    visualisation, badges, palettes de la cartographie) ne dépendent pas de l'interface. Le
    choix est un réglage d'affichage, jamais un droit, gardé dans le navigateur
    (`humanome-interface`, à côté de `humanome-theme`) ; le script anti-FOUC pose toujours
    `data-interface`, son nouveau sha256 est dans la CSP de `web/public/.htaccess`, dans
    `docs/securite-checklist.md` et dans `anti-fouc.test.js`. Listes « Interface » et « Thème »
    (Système, Clair, Sombre) au bas du tiroir, sous « Mode expert », et dans la ligne
    « Affichage » de `#/compte`.
  - `c5e6880` (S9-2) — **les polices de chaque interface, auto-hébergées** (Fontsource, SIL OFL
    1.1, latin et latin-ext, `font-display: swap`) : Source Serif 4 et Source Sans 3, Fredoka et
    Nunito, Space Grotesk et JetBrains Mono, dans `web/public/fonts/<famille>/` avec leur
    licence ; piles et échelle par interface, qui ne nomment aucune famille d'une autre : une
    interface ne charge que ses polices. iA Writer Quattro n'est plus employée (ses fichiers
    restent). `fonts.test.js` réécrit ; la CSP ne change pas (`font-src 'self'`).
  - `6191a82` (S9-2) — **les couleurs d'interface passent par les jetons** : `--on-accent` sur
    chaque aplat d'accent (le blanc tombait sous 4,5:1 sur les aplats éclaircis du sombre de la
    noèsiologue et du technomancien), plus aucune couleur littérale dans `timeline.css` ni
    `twin9-credit.css`, `--muted` enfin défini.
  - `339a2e6` (S9-3) — **la preuve, sur les règles et non plus seulement sur les jetons**, dans
    les neuf contextes : chaque couple texte et fond d'une même règle des feuilles du site à
    4,5:1, 3:1 pour un grand texte (UC-VIS-07-U09, 143 règles) ; chaque règle `:focus` trace
    l'anneau de l'interface (`--focus`), à 3:1 sur tout fond où il tombe (U10, 13 anneaux) ;
    chaque champ bordé de `--line-strong`, à 3:1 (U11, 36 bordures). Ils ont trouvé, et ce commit
    corrige : les anneaux traçaient l'accent, jamais `--focus` (désormais aussi sur les champs ;
    la zone du diagramme et la feuille imprimable, claires dans les deux thèmes, ont le leur) ;
    34 champs bordés du filet décoratif `--line` (1,2 à 1,6:1) ; le badge « env » de
    l'administration à 4,26:1 sur le fond d'alerte (une régression de S9-1). Les captures ont
    montré l'intitulé « Interface » coupé en « Interfac / e » à 375 px dans `#/compte` : corrigé
    (U07).
  - Ce `docs:` — ADR-014 ; `docs/ergonomie-navigation.md` §5 et §5quater ; UC-VIS-06 (A5 : la
    ligne « Affichage » porte aussi l'interface et le thème) ; UC-VIS-07 (RG7, U09 à U11,
    captures, limites) ; catalogue des cas recompté : 1 096 U, 1 239 F (UC-VIS-07 : 11 U, 7 F) ;
    `SUMMARY.md` (UC-VIS-07 et ADR-014, ajoutés à la main : `build-gitbook-summary.mjs`
    retirerait la ligne de la campagne Twin9 du 2026-10-23, absente de ses groupes).
  - **Vérifié** (Node 20, sur l'arbre de `339a2e6` ; le moteur avec ce `docs:`) : front 3 070
    tests verts, 9 sautés (279 fichiers) ; moteur 585 verts, 8 sautés (593) ; `npm run build`
    puis `npm run test:dist` vert ; `check-publiable` OK. U09, U10 et U11 ont été lancés rouges
    avant leurs corrections (3, 10 et 34 écarts) ; la règle de l'intitulé, par mutation.
    Captures Playwright (Chromium, serveur de développement, API simulée avec un compte inventé,
    choix posé avant tout script donc par le vrai script anti-FOUC) : accueil, cartographie de
    démonstration et `#/compte`, à 375 et 1 280 px, clair et sombre, pour chaque interface, soit
    36 images, hors du dépôt ; sur chacune les bons attributs, aucun débordement horizontal,
    aucune erreur de page, seules les polices de l'interface chargées. PHP non lancé : le sprint
    ne touche ni `api/`, ni `engine/`, ni `schemas/`, ni `scripts/`.
  - **Non vérifié** : Safari, Firefox et un vrai téléphone (Chromium seul) ; un lecteur d'écran ;
    le contraste élevé (`forced-colors`, sans règle propre) ; les contrastes sont calculés sur
    les règles, pas mesurés à l'écran (un texte posé sur le fond d'un parent n'est couvert qu'au
    niveau des jetons) ; à 375 px, la ligne « Habilitations » de `#/compte` coupe encore
    « Apprenant » au milieu du mot (sa règle, `overflow-wrap: anywhere`, est antérieure au
    sprint ; non corrigé) ; rien n'est déployé.
  - **Pris par délégation, à signaler à Christian** : (1) le choix est par visiteur, gardé dans
    son navigateur, pas dans son compte (comme le mode expert) ; il ne change ni menu, ni pages,
    ni données ; (2) les jetons remplacent les valeurs des variables existantes, sans renommage ;
    les couleurs de données ne changent pas ; (3) les polices sont auto-hébergées et chaque
    interface ne télécharge que les siennes ; (4) le nouveau sha256 du script anti-FOUC est dans
    la CSP ; (5) pas de refonte de la mise en page : cibles de 44 px et points de rupture du
    sprint 1 inchangés, anneau de focus de 2 px (les propositions A et B en prévoyaient 3).
  - **À décider (Christian)** : (1) le défaut : l'épistémiarque, pour un visiteur sans choix ;
    (2) iA Writer Quattro : retirer ses fichiers de `web/public/fonts/quattro/`, qu'aucune
    interface n'emploie plus ; (3) EduChat et la Fabrica : appliquer ou non les notes de
    migration des propositions (autres dépôts, non touchés) ; (4) le déploiement : fusion de
    `feat/trois-interfaces` puis mise en ligne, avec le `.htaccess` qui porte le nouveau sha256
    du script anti-FOUC (sans lui, la CSP bloque le script : l'interface et le thème choisis ne
    se posent qu'au montage de l'application, après un éclair du défaut).

- 2026-10-23 — **Première campagne réelle de Twin9, en local : 1,04 $ engagés sur 10 $**
  (`docs/campagne-twin9-2026-10-23.md`). Christian : « 10 $ max c'est parfait », puis « Garde-fous
  locaux seuls » (aucune limite dans la console Anthropic). Plateforme `main` `11c4eae`, moteur
  `Twin_v9` `a1d84bf`, portfolio fictif PLANT-01, profil « tout Haiku » (R0c en v9.8 fidèle).
  - **Fait** : R0a (lots), R0b (voie directe), R0c (Sonnet par lots), R1 (PLANT-01 complet :
    945 appels, 27 lots, 1 h 44, 0,50 $), R2 (stigmergie, trois analyses d'une journée : dépôts,
    traces lues par le greffier, explorateurs, renforcement), R3a (Humanome V18 choisi au
    lancement, 5 pôles), R5 (le tuteur, 10 réponses sur 10 citent l'adresse attendue). Aucune
    sortie tronquée, aucune panne ; toutes les attestations portent le commit du moteur.
  - **Appris** : le routage réel fait 945 appels pour PLANT-01 contre 2 740 en simulé ; un run
    v9.8 fidèle (Sonnet à l'étage profond) coûterait environ 4,6 $ bruts par lots, extrapolé de R1
    (le plan en estimait 9 à 26 $).
  - **Non vérifié** : la console Anthropic (les coûts sont ceux de la plateforme) ; la recette en
    ligne (R6 : déclencheur, mémoire d'un tick OVH) ; R4 et R7, laissés à Christian ; la qualité
    des cartographies (aucune relecture humaine).

- 2026-10-22 — **Sprint 7, lot S7a : corrections de la revue indépendante (même branche
  `feat/plafond-offerts`, rien déployé).** Dix constats confirmés, dix corrigés : six commits
  `fix:`, chacun avec le test qui échouait avant lui, un `test:` (deux trous de couverture, prouvés
  par mutation), un `docs:` et cette entrée. `Twin_v9`, `api/src/Twin9/*`, `api/src/Worker/*`, les
  rôles et les menus ne sont pas touchés (le tick passe par `routes/worker.php` et
  `scripts/worker.php`, pas par `Worker/`) ; aucun appel LLM réel ; la migration 034, pas encore
  déployée, est complétée en place.
  - `077251a` — **une réserve orpheline du mois expire en dépense** : un processus tué entre sa
    réserve et son règlement (le kill d'OVH, un redéploiement, une erreur fatale) gardait son pire
    cas réservé jusqu'au 1er ; l'offert se fermait avant le plafond pendant que les inscriptions,
    qui ne lisent que le dépensé, restaient ouvertes. Chaque réserve est désormais une ligne datée
    (`free_credit_reservations`, migration 034, écrite dans la transaction de l'`UPDATE`
    conditionnel) ; passé `FreeCreditLedger::RESERVATION_TTL_SECONDS` (15 minutes, au-delà des
    300 s de délai amont permis), elle passe en dépensé à son pire cas, comptée comme un appel ;
    toute réserve, toute lecture du mois et le critère des inscriptions la font expirer d'abord.
    Réglée après coup, elle n'ajoute que l'excédent ; rendue, elle ne rend rien. La ligne du mois
    est verrouillée la première dans toute transaction du grand livre (un seul ordre de verrous).
  - `73e6950` — **le tuteur garde le pire cas d'une question peut-être facturée** : une réponse
    2xx qui n'est pas du JSON, et une connexion coupée après l'envoi complet (curl 52, 56) rendaient
    leur réserve. `CurlHttpClient` pose désormais `requestSent` comme `CurlHttpStream` (un statut
    reçu, ou tout le corps envoyé), et le tuteur garde le pire cas si `timedOut` ou `requestSent`.
    Rien d'autre ne lit `requestSent` d'un `request()` (ni Twin9, ni le worker).
  - `51f9e0b` — **le tuteur écrit après un long appel sur une connexion neuve** : ses compteurs du
    jour et le règlement du mois passaient par la connexion d'avant l'appel ; un MySQL 2006 donnait
    un 500 après un appel facturé, la réponse perdue, la réserve laissée. Chaque écriture d'après
    l'appel (succès et branches d'erreur) passe par `Db::avecReconnexion`, à part, comme `$compter`
    de la démo ; une écriture qui échoue malgré tout est journalisée (sa classe seule), la réponse
    est rendue. `docs/securite-demo.md` ne prétend plus qu'aucun `error_log` n'existe sur le chemin
    LLM.
  - `aa95854` — **une levée dont le courriel est refusé laisse le compte en liste d'attente** :
    `ActivationMail::send` ignorait le booléen du `Mailer` ; un `mail()` à `false` sortait le compte
    de la liste sans code, et l'administrateur lisait « levé ». `lift()` réserve le compte par un
    `UPDATE` conditionnel sur sa date, envoie, et sur un refus le remet à sa date sans code
    (`lifted`, `unchanged` ou `mail_failed` ; audit seulement d'un courriel accepté). La levée du
    mois s'arrête au premier refus et se retient 5 minutes (un compteur `rate_limits`, sans
    adresse) : ni chaque requête ni chaque tick ne renvoie un lot de courriels à codes neufs. Le
    tick compte `listeAttenteEchecs` ; « Lever » répond 502 et son message ; « Tout lever »
    `{lifted, failed, remaining}` ; la connexion d'un compte dû répond `403 waitlisted` « … le
    courriel de votre code d'activation n'a pas pu partir … ». `liftDue()` rend `{lifted, failed}`.
  - `cc1e9e3` — **l'inscription lit l'horloge une fois** (`Humanome\Clock`) : refusée sous octobre
    à 23 h 59 min 59 s UTC le 31 et datée de novembre après le hachage Argon2id, elle attendait
    jusqu'au 1er décembre. `register`, `login` et `resend` passent un seul `$now` à `liftDue`,
    `signupsOpen`, `enlist`, `sendWaitlisted`, `signupMessage`, `isDue` et `lift`.
  - `0ac326e` — **l'expiration du code d'activation est en UTC** (`gmdate`, lue avec `' UTC'`) :
    un code posé par le cron en UTC (`scripts/worker.php` lève la liste) et lu par un PHP web réglé
    sur Paris naissait expiré. Les codes posés avant ce changement en heure locale vivent au plus
    le décalage de plus, une fois.
  - `017b428` — **tests** : la branche de la connexion qui lève elle-même un compte dû n'était
    jamais atteinte (la levée du mois qu'elle déclenche passait avant) — UC-CPT-01-F35, 51 comptes
    dus, la couvre ; F28 et U21 donnent au dernier inscrit l'attente la plus ancienne. Mutations
    vérifiées : sans la branche, F35 échoue ; `ORDER BY waitlisted_at`, U21 et F28 échouent.
  - `e510879` — **docs, RGPD** : `waitlist_lifted` n'est pas anonymisé à la purge du compte levé —
    son identifiant reste dans `details.targetUserId`, pseudonyme orphelin comme `role_granted` ;
    registre §1 bis et §10, vérification RGPD et limites d'UC-CPT-06 le disent.
  - **Vérifié** (PHP 8.5.12, MySQL 8.0 locaux, base `humanome_test_s7a`, `TWIN_V9_DIR` =
    t9-s2, sur l'arbre de `e510879`, suite lancée à 10 h 32, hors de la fenêtre 0 h – 2 h
    d'`UcAdm06MonitoringTest`) : PHP `Tests: 1935, Assertions: 21552`, les 2 échecs connus seuls
    (`AuthActivationTest::testExpiredCodeIsRejected`, `UcCpt02…::testU17SessionCookieAttributes`),
    1 dépréciation, `PariteTest` compris ; front 3 012 tests verts (274 fichiers, 9 sautés) ;
    moteur 593 tests, 585 verts, 8 sautés ; `npm run build` puis `npm run test:dist` vert ;
    `check-publiable` OK. Chaque test nouveau a été lancé rouge avant sa correction (F31 :
    `pending_activation` au lieu de `waitlisted` ; F25, F26 : le mois à 0 ; F27 du tuteur : 500 ;
    U25, F32, F27 de l'administration et U34 du front : le compte levé malgré le refus ; F33 :
    `pending_activation` ; F34 : 401). Tests nouveaux : UC-VIS-03-U35 ; UC-VIS-05-U17, F25 à F27 ;
    UC-CPT-01-U25, F31 à F35 ; UC-ADM-04-F27, U34 (front). Catalogue des cas recompté : 1 056 U,
    1 216 F (UC-VIS-03 : 35 U, 30 F ; UC-VIS-05 : 17 U, 27 F ; UC-CPT-01 : 25 U, 35 F ; UC-ADM-04 :
    34 U, 27 F).
  - **Non vérifié** : PHP 8.2 (la CI) ; un vrai courriel (`PhpMailMailer`) et un vrai refus de
    `mail()` (simulés par `MemoryMailer::$refuse`) ; un vrai serveur MySQL qui lâche une connexion
    inactive (simulé par `KILL` de la connexion de la route) ; une vraie coupure curl 52 face à
    Anthropic (mesurée sur un serveur local en http : le client de production, https seul, n'y est
    exercé que pour les refus) ; `scripts/worker.php` en ligne de commande sous un autre fuseau que
    le web ; un vrai navigateur (jsdom) ; rien n'est déployé.
  - **À décider (Christian)** : (1) l'échéance de 15 minutes d'une réserve orpheline (prudente :
    son pire cas est compté comme dépensé, l'appel ayant pu être facturé) ; le tick ne la purge pas
    lui-même, chaque lecture du mois le fait ; (2) le budget du jour du tuteur ne compte toujours
    pas un appel facturé en échec (2xx illisible, coupure après l'envoi, délai dépassé), comme sur
    `main` ; seul le mois le compte ; (3) un courriel refusé pour une raison propre au compte
    bloquerait la levée du mois de ceux qui le suivent (elle s'arrête au premier refus) jusqu'à ce
    que l'administrateur le lève ou que le transport l'accepte ; un courriel accepté puis perdu en
    aval reste invisible (recours : « Renvoyer le code ») ; (4) effacer `targetUserId` des
    `details` à la purge, ou garder le pseudonyme orphelin ; (5) `AuthActivationTest::
    testExpiredCodeIsRejected`, compté parmi les échecs de PHP 8.5, échoue en fait parce qu'il
    écrit l'expiration avec `NOW()` de MySQL (heure de Paris en local) et que PHP la lit en UTC :
    il passerait avec `UTC_TIMESTAMP()`, désormais le contrat de la colonne ; non modifié.

- 2026-10-22 — **Sprint 7, lot S7a : le plafond mensuel des crédits offerts et la liste d'attente
  des inscriptions (branche `feat/plafond-offerts`, rien déployé).** TODO : « La somme totale des
  crédits offerts par mois ne doit pas dépasser 20 USD pour tous les utilisateurs anonymes et
  enregistrés du site. Après, mettre les inscriptions sur liste d'attente. » Jusqu'ici l'instance
  offrait jusqu'à 60 $ par mois environ (1 $ par jour pour `POST /api/llm`, 1 $ pour le tuteur).
  Trois commits — `a850b52` (S7a-1), `27d00d7` et celui de cette entrée (S7a-2), qui rend aussi
  vrai pour toute levée le premier mot du courriel de levée —, décisions de Christian prises par
  délégation (2026-10-22). Le lot S7b (école de
  rattachement, crédits restants, consentement RESPIRE) n'est pas fait : il attend le registre des
  écoles (sprint 6). `Twin_v9`, `api/src/Twin9/*`, `api/src/Worker/*`, les rôles et les menus ne
  sont pas touchés ; aucun appel LLM réel.
  - `a850b52` (S7a-1) — **un grand livre mensuel unique** (migration 034, `free_credit_monthly`,
    `Llm\FreeCreditLedger`) : chaque appel offert — l'Essayer, l'essai Twin6, le « Service
    humanome », le banc, le tuteur — réserve son pire cas sur le mois par un `UPDATE` conditionnel
    avant de partir, en plus des budgets du jour, qui restent, puis le règle au coût réel ; une
    réponse en cours n'est jamais coupée. Au plafond : `503 « Les crédits offerts de ce mois sont
    épuisés ; revenez le 1er novembre. »` (`offerts_epuises`). Mois UTC (`gmdate`, comme les
    budgets du jour, jamais `CURDATE()`/`NOW()`) : il s'ouvre le 1er à 1 h ou 2 h, heure de Paris.
    Plafond `monthlyFreeUsd`, 20 $ par défaut (`OFFERTS_MENSUEL_USD`, réglable dans
    `#/admin/reglages`, avec le grand livre du mois). Ne comptent pas : ce que paie un crédit
    acheté, une clé personnelle ou d'école ; aucun crédit d'accueil n'existe.
  - `27d00d7` (S7a-2) — **la liste d'attente des inscriptions** (`Auth\Waitlist`,
    `Auth\ActivationMail`, `users.waitlisted_at` de la migration 034). Une inscription attend dès
    que le plafond moins ce que le mois a **dépensé** ne couvre plus le plus petit appel de
    l'Essayer (son pire cas à l'entrée nulle : le surcoût de la requête et toute la sortie du
    modèle, au tarif de la grille ; 0,064 $ pour Haiku 5.5) : sous ce seuil, plus aucun appel de
    l'Essayer ne passe. Le compte est créé (rôle `apprenant`), sans code : un courriel et la
    réponse (`201 {status: "waitlisted"}`) le disent ; la connexion répond `403 {code:
    "waitlisted"}`, le renvoi et l'activation ne donnent rien ; les comptes existants ne sont pas
    touchés. Levée au 1er du mois UTC suivant, dans l'ordre d'inscription, par lots de 50 — à la
    première requête d'authentification du mois, au tick (`POST /api/admin/worker-tick` et
    `scripts/worker.php`, compteur `listeAttenteLevees`) ou à l'ouverture de la liste —, et par
    l'administrateur, un par un ou tous (`#/admin/reglages`, sous le grand livre :
    `GET /api/admin/waitlist`, `POST /api/admin/waitlist/{id}/lift`, `POST /api/admin/waitlist/lift`) ;
    le compte levé reçoit son code (« Votre inscription sur humanome.xyz sort de la liste
    d'attente », vrai aussi pour une levée par l'administrateur en cours de mois). Le monitoring compte la liste (« dont n en liste d'attente »).
    L'écran d'administration vit dans les Réglages, à côté du plafond, sans changer de menu : la
    fiche UC-ADM-04 (A9, RG11) y tient lieu de fiche « monitoring » pour la levée, UC-ADM-06 (RG7)
    n'a que le compteur, le monitoring restant en lecture seule. Contrat : `docs/contrats.md`
    §13.1 ; `docs/autorisations.md`, `docs/administration.md`, registre RGPD (§1 bis : le code
    différé, la date effacée à la levée) et vérification RGPD mis à jour ; la politique de
    confidentialité ne détaille pas les données d'inscription : inchangée.
  - **Vérifié** (PHP 8.5.12, MySQL 8.0 locaux, base `humanome_test_s7a`, `TWIN_V9_DIR` = t9-s2) :
    PHP `Tests: 1923, Assertions: 21427`, les 2 échecs connus de PHP 8.5 seuls
    (`AuthActivationTest::testExpiredCodeIsRejected`, `UcCpt02…::testU17SessionCookieAttributes`),
    1 dépréciation (suite lancée vers 8 h 40 : les échecs UTC/heure locale
    d'`UcAdm06MonitoringTest` entre 0 h et 2 h ne se sont pas présentés), `PariteTest` compris —
    sur l'arbre d'avant les deux dernières retouches (la branche de la connexion d'un compte en
    attente simplifiée, même comportement ; le premier mot du courriel de levée) ; sur l'arbre
    final, les classes touchées relancées (`UcCpt01`, `UcCpt02`, `AuthActivationTest`,
    `AuthRoutesTest`, `UcAdm04`, `UcAdm06`, `WorkerRouteTest`) : `Tests: 140`, les 2 mêmes
    échecs seuls ; front 3 011 tests verts (274 fichiers, 9 sautés :
    les 3 001 de la phase D, plus 3 de S7a-1 et 7 de S7a-2 ; le « 3 015 » de la fiche de travail
    ne se réconcilie pas avec ce compte) ; moteur 593 tests, 585 verts, 8 sautés ;
    `npm run build` puis `npm run test:dist` vert ;
    `check-publiable` OK. Tests nouveaux : UC-CPT-01-U19 à U24 et F26 à F30 (horloge figée du
    31 octobre au 1er novembre UTC, seuil au micro-dollar, réserve en vol, plafond 0, ordre et lots,
    un seul courriel par levée, le tick), UC-ADM-04-U32, U33, F25, F26, UC-ADM-06-U22, U23.
    Catalogue des cas recompté : 1 052 U, 1 207 F (UC-CPT-01 : 24 U, 30 F ; UC-ADM-04 : 33 U,
    26 F ; UC-ADM-06 : 23 U, 17 F).
  - **Non vérifié** : PHP 8.2 (la CI) ; un vrai navigateur (jsdom seulement) ; un vrai courriel
    (`PhpMailMailer`, jamais exercé) ; `scripts/worker.php` lancé en ligne de commande (sa levée
    est le code de la route, testée par UC-CPT-01-F29) ; la levée concurrente vraiment parallèle
    (l'`UPDATE` conditionnel est testé en séquence) ; rien n'est déployé.
  - **À décider (Christian)** : (1) le critère de la liste d'attente — ce que le mois a dépensé
    sous le seuil du plus petit appel de l'Essayer — laisse au tuteur, au pire cas plus petit,
    quelques questions dans cette bande, et le statut public peut dire `remainingThisMonth: true`
    alors que les inscriptions attendent : le garder, ou fermer aussi le tuteur à ce seuil ?
    (2) relever le plafond en cours de mois rouvre les inscriptions mais ne lève pas la liste
    d'elle-même : la lever automatiquement ? (3) la levée de 0 h UTC envoie un code de 30 minutes,
    mort au matin : le courriel renvoie à « Renvoyer le code » ; préférer un courriel sans code ?
    (4) un compte en liste d'attente ne peut pas se supprimer lui-même (il ne se connecte pas),
    comme un compte jamais activé (UC-CPT-01, AN3) ; (5) reste de S7a-1 : le fournisseur
    `humanome` des établissements (cartographie de masse, `Worker/Tick`) part sur la clé de
    l'instance sans être compté ici (`docs/contrats.md` §13).

- 2026-10-22 — **Sprint 8 : corrections de la revue (même branche `feat/roles-declares`, rien
  poussé ni déployé).** Huit constats confirmés : six défauts du code, un trou de test et une
  imprécision de l'entrée ci-dessous. Six commits `fix:`, chacun avec le test qui échouait avant
  lui ; un `test:` pour le trou de test, que rien ne pouvait faire échouer avant ; un `test:` de
  rattrapage ; ce `docs:`.
  Aucun appel LLM réel ; `Twin_v9` (t9-s2) n'est pas modifié.
  - `935840c` — **un rôle déclaré qui n'est pas de l'UTF-8 valide est refusé sans être cité**
    (`DeclaredRoles::validate`). Un corps de formulaire (`roles[]=%C3`, que Slim analyse aussi)
    arrivait jusqu'au message « Rôle non déclarable « … » ». Sous PHP 8.2 (la CI, OVH),
    `mb_substr` copie les octets bruts : le `422` ne s'encodait pas en JSON, d'où un `500` et une
    trace. Le message est désormais fixe : « Chaque rôle est un identifiant en UTF-8 valide ».
    UC-CPT-07-U04 et F04 échouaient avant (sous PHP 8.5, le message citait « ? »). Le `500`
    lui-même n'est pas reproduit ici : aucun PHP 8.2 n'est installé.
  - `6e62a0b` — **test : F06 a son contrôle positif, RG4 un test de structure.**
    - Chaque appel refusé à la déclarante est rejoué par un compte qui détient l'habilitation, et
      doit passer la garde (`200`, ou `404` sur une invitation ou une proposition qui n'existe
      pas).
    - UC-CPT-07-U22 (nouveau) lit le code PHP de `api/src`, commentaires exclus : hors de
      `DeclaredRoles`, seules la route de la déclaration et `UserDirectory` citent la table, la
      case ou la classe.
    - Rien ne pouvait échouer avant. Vérifié par mutation, annulée : une référence à
      `DeclaredRoles` ajoutée dans `Electorate.php` fait échouer U22 ; une garde
      `RoleGuard::any('nobody')` sur les brouillons de paquets fait échouer le nouveau F06,
      alors que l'ancien passait.
  - `7f484b5` — **le tableau des comptes défile dans son conteneur** (`.admin-table-scroll`,
    `overflow-x: auto`). La colonne « Rôles déclarés » l'avait élargi d'environ 140 px ; comme
    `html` ne défile pas en largeur, « Attribuer » devenait inatteignable dans une fenêtre de
    moins d'environ 530 px. `position: relative` y retient aussi les libellés `.visually-hidden`
    des cellules : sans lui, celui du menu « rôle » élargissait encore la page (461 px à 375).
    UC-ADM-01-U31 (nouveau) échouait avant.
  - `837ab35` — **les définitions des rôles atteignent 4,5:1** : `--ink-soft` au lieu de
    `--ink-faint` sur `--surface-2` (4,34 en clair et 4,44 en sombre avant ; 6,92 et 7,50 après).
    UC-CPT-07-U23 (nouveau) calcule le contraste sur les jetons des trois thèmes de `global.css`
    (clair, sombre du système, sombre choisi) ; il échouait avant.
  - `1f27727` — **« Enregistrer mes rôles » garde le focus au clavier** : `aria-disabled` au lieu
    de `disabled`, garde dans `save()`, libellé « Enregistrement… » pendant l'envoi (il valait
    « … »). UC-CPT-07-U24 (nouveau) échouait avant : jsdom ne focalise pas un bouton `disabled`.
  - `99a4da9`, puis `f34f40c` — **« habilitation » pour ce que l'administrateur attribue** :
    l'aide de `#/compte`, « Aucune habilitation pour l'instant » dans le profil, les messages de
    `#/admin/roles` (« Habilitation « x » accordée. », « … retirée. »), et le bouton
    « Habiliter « épistémiarque » », avec le libellé de `ROLE_LABELS` au lieu de l'identifiant.
    UC-ADM-01 U29, U30, F13, F14, F27, UC-CPT-02-F23 et UC-CPT-07-U25 (nouveau) échouaient avant.
    `f34f40c` rattrape le test colocalisé `RolesSection.test.jsx`, oublié par `99a4da9` : ce
    commit seul laisse ce test rouge (l'historique n'est pas réécrit).
  - `4268de7` — **une session perdue dit de se reconnecter.** Sans détail de champ, un `403` (le
    middleware CSRF) ou un `401` affiche « Votre session a expiré : reconnectez-vous, puis
    enregistrez de nouveau vos rôles. » au lieu de « Jeton CSRF absent ou invalide ». La section
    des clés API, sur la même page, dit de même (« … puis réessayez. »). UC-CPT-07-U19, F14 et un
    cas d'`ApiKeysSection.test.jsx` échouaient avant.
  - Ce commit `docs:` corrige l'entrée ci-dessous : U12 à U14 sont des tests web de `6364dbc`,
    UC-ADM-01 U28 et F26 y sont cités, et cinq e2e rendent le nouveau bloc sans l'exercer.
    Catalogue des cas recompté : 61 cas, 1 065 U, 1 209 F (UC-CPT-07 : 25 U, 14 F ; UC-ADM-01 :
    31 U, 27 F).
  - **Vérifié** (PHP 8.5.12, MySQL 8.0 locaux, base `humanome_test_s8`, `TWIN_V9_DIR` = t9-s2,
    arbre de `f34f40c`) :
    - PHP : `Tests: 1926, Assertions: 21482`, les 2 échecs connus de PHP 8.5 seuls
      (`AuthActivationTest::testExpiredCodeIsRejected`,
      `UcCpt02…::testU17SessionCookieAttributes`), 1 dépréciation (+1 test : U22) ;
    - front : 3 024 tests verts et 9 sautés, sur 277 fichiers. Au premier passage complet,
      `src/carto/ui/Tiles.test.jsx` (« le soleil dessine CŒUR un cran plus sombre… », hors de ce
      travail) a échoué une fois ; il passe seul trois fois de suite, et au passage complet
      suivant : instable sous charge ;
    - moteur : 585 verts et 8 sautés (593) ;
    - `npm run build` puis `npm run test:dist` : vert ; `check-publiable` : OK ;
    - Chromium (Playwright, le banc de la revue reconstruit) : à 375 et 480 px, avec ou sans
      émulation mobile, la page fait exactement la largeur de la fenêtre ; le tableau défile dans
      son conteneur (351 px visibles sur 686 à 375) ; Tab jusqu'au menu « rôle » y fait défiler
      le conteneur à 375 px. Bloc du compte : Espace, Tab, Entrée, et le focus reste sur le
      bouton pendant et après l'enregistrement.
  - **Non vérifié** :
    - PHP 8.2 : le `500` d'origine n'est établi que par lecture des sources de PHP 8.2 ;
    - les e2e Playwright, non relancés ; iOS Safari ; l'application servie avec son API dans un
      vrai navigateur ;
    - à 480 px, Chromium focalise le menu « rôle », à peine visible au bord droit, sans faire
      défiler le conteneur. Il se montre à la molette, au pavé tactile ou au doigt.
  - **À décider (Christian)** :
    1. La suppression du compte (UC-CPT-06) et les autres écrans affichent encore « Jeton CSRF
       absent ou invalide » quand la session est perdue. Faut-il traduire ce message une fois
       pour toutes, dans `apiFetch` ou dans le middleware ?
    2. Dans `#/admin/roles`, les puces, le menu « — rôle — » et « Retirer le rôle … » disent
       encore « rôle » pour une habilitation. C'était hors des quatre points de la revue.
    3. Restent ceux de l'entrée ci-dessous : la séparation déclaration / habilitation ; les
       libellés et définitions des neuf rôles, à relire ; le cercle des fondateurs déclaratif ;
       les jeux de tests à verser sur GitHub (une publication, non faite ici : des jeux fictifs
       seulement) ; les rôles partagés avec EduChat.

- 2026-10-22 — **Sprint 8 : les rôles RESPIRE se déclarent, les habilitations restent à
  l'administrateur (branche `feat/roles-declares`, sur `main` 11c4eae ; rien poussé ni déployé ;
  migration 035).** Le TODO demande des rôles « auto-attribués ». Or deux des sept rôles
  actuels donnent des droits : un cartographe lit les runs Twin9 partagés aux cartographes, et
  l'électorat du référentiel est fait des épistémiarques. Une auto-attribution aurait donc ouvert
  des données d'élèves et le vote à n'importe quel compte. Décision prise par délégation
  (recommandation de la fiche du sprint) : **séparer deux notions**, décrites dans
  `docs/roles.md` (nouveau glossaire) et `docs/autorisations.md` (principe 7).
  - **Le rôle déclaré** est l'identité RESPIRE que la personne se donne dans `#/compte`, parmi
    les neuf de la liste : cartographe, promptologue, promptagogue, éclaireur, architecte,
    épistémiarque, médiateur, noèsiologue, maître du grimoire. La case « membre du cercle des
    fondateurs » n'est proposée et acceptée qu'avec promptagogue, épistémiarque ou maître du
    grimoire ; le serveur la revérifie (`422`). Une déclaration n'ouvre **rien** : aucune garde,
    aucune famille du menu, aucun mode d'affichage par défaut, aucun vote. Elle est visible de la
    personne, de l'administrateur et dans l'archive de compte, et supprimée avec le compte.
  - **L'habilitation** désigne les sept rôles actuels. Elle reste attribuée par l'administrateur
    seul : personne ne s'habilite soi-même, `admin` compris.
  - **Habiliter d'un clic** : l'écran des rôles montre les déclarations, et un bouton
    « Habiliter » accorde celle qui y correspond (cartographe, promptologue, épistémiarque ; les
    six autres déclarations n'ont pas d'habilitation aujourd'hui). C'est l'attribution existante,
    auditée.

  Commits :
  - `6364dbc` — **serveur** : migration 035 (`user_declared_roles`, `users.founding_circle`) et
    `Auth\DeclaredRoles` (catalogue, validation, écriture sous verrou, `grantable`).
    - Routes : `GET`/`PUT /api/auth/me/declared-roles` ; `GET /api/admin/users` porte les
      déclarations et `grantable`.
    - Archive de compte 1.3.0 (`account.declaredRoles`, décision 17 de `docs/contrats.md`) ;
      registre RGPD §1 ter.
    - Tests PHP UC-CPT-07 U01 à U11 et F01 à F09, avec leurs contrôles positifs : une
      cartographe déclarée, même liée, ne lit pas un run partagé aux cartographes ; une
      épistémiarque déclarée ne vote pas. Tests PHP UC-ADM-01 U28 et F26 (la liste de
      l'administration porte les déclarations). Tests **web** UC-CPT-07 U12 à U14 : export et
      import de l'archive 1.3.0 (`uc-cpt-07-declarer-roles-respire.test.js`).
  - `f9f9e03` — **IHM** : le bloc « Mes rôles RESPIRE » de `#/compte`, après le profil et sa
    ligne « Affichage ».
    - Le bloc affiche le catalogue de l'API, avec définitions, et la mention « Une déclaration ne
      donne pas d'accès ; l'administrateur habilite. ». La case du cercle est conditionnelle.
    - L'enregistrement n'émet aucun événement de session. La ligne « Rôles » du profil devient
      « Habilitations ».
    - Dans `#/admin/roles` : la colonne « Rôles déclarés » et les boutons « Habiliter ».
    - Aide contextuelle mise à jour ; `docs/roles.md` ajouté au sommaire GitBook.
    - Tests web : UC-CPT-07 U15 à U21 et F10 à F14, UC-ADM-01 U29, U30 et F27. **F10 est la
      propriété du menu** : pour six jeux d'habilitations, déclarer les neuf rôles et la case ne
      change ni les familles du menu, ni ses liens, ni le mode par défaut, à l'enregistrement
      comme après rechargement. F11 en est le contrôle positif : l'habilitation, elle, change le
      menu.
    - Les faux serveurs lisent catalogue, validation et `grantable` dans `DeclaredRoles.php`. Des
      tests de concordance lient la copie des libellés du front et le glossaire à ce fichier.
  - Le commit `docs:` de cette entrée : fiches UC-CPT-07 et UC-ADM-01 (IHM, scénarios A4 et E5,
    RG6, tests), `docs/autorisations.md`, `docs/administration.md`,
    `docs/ergonomie-navigation.md`. Catalogue des cas recompté : 61 cas, 1 060 U, 1 209 F
    (UC-CPT-07 : 21 U, 14 F ; UC-ADM-01 : 30 U, 27 F).
  - **Vérifié** (PHP 8.5.12, MySQL 8.0 locaux, base `humanome_test_s8`, `TWIN_V9_DIR` = t9-s2,
    arbre de `f9f9e03`) :
    - PHP : `Tests: 1925, Assertions: 21454`, les 2 échecs connus de PHP 8.5 seuls
      (`AuthActivationTest::testExpiredCodeIsRejected`,
      `UcCpt02…::testU17SessionCookieAttributes`), 1 dépréciation ; UC-CPT-07 et UC-ADM-01 verts
      (le lot IHM ne touche pas le PHP) ;
    - front : 3 019 tests verts et 9 sautés, sur 277 fichiers (+15). Mesuré dans le même
      environnement : 3 004 verts et 9 sautés sur `6364dbc` (+3), 3 001 verts et 9 sautés sur
      `main` 11c4eae, comme à l'entrée « Phase D » (le « 3 015 verts » de `main` a été compté dans
      un autre environnement) ;
    - moteur : 585 verts et 8 sautés (593) ;
    - `npm run build` puis `npm run test:dist` : vert ; `check-publiable` : OK ;
    - F10 détecte une fuite. Faux serveur rendant les déclarations parmi les rôles de
      `auth/me` : F10 échoue (mutation annulée).
    - Rendu : le balisage produit en jsdom, avec `global.css`, dans Chromium headless. Bloc du
      compte en clair, en sombre et à 380 px ; colonne d'administration en clair et en sombre.
  - **Non vérifié** :
    - PHP 8.2 (la CI) ;
    - l'application servie avec son API dans un vrai navigateur ;
    - les e2e Playwright, non relancés. Cinq d'entre eux ouvrent `#/compte` connecté et rendent
      donc le nouveau bloc, sans l'exercer : `parcours-apprenant`, `parcours-cartographe`,
      `parcours-promptologue`, `twin9-run`, `twin9-referentiels`. Aucun n'ouvre `#/admin/roles`
      (précision apportée par la revue, entrée ci-dessus) ;
    - rien n'est déployé, et la migration 035 n'est appliquée nulle part hors des bases de test.
  - **« Uploader tous les jeux de tests dans GitHub » : non fait.** C'est une publication. Le
    dépôt alimente un miroir public (`check-publiable`) ; seuls des jeux **fictifs** pourraient y
    aller, pas le journal 300 ni la démo, qui sont réels. Il faut l'accord explicite de Christian
    et la liste des jeux.
  - **À décider (Christian)** :
    1. **La séparation déclaration / habilitation**, prise par délégation. L'alternative,
       habiliter d'office à la déclaration, ouvrirait les runs partagés aux cartographes et le
       vote du référentiel à tout compte.
    2. **Les libellés et définitions des neuf rôles** (`docs/roles.md`, à relire tous).
       - Six n'ont pas de source dans le dépôt : promptagogue, éclaireur et architecte ont une
         définition neutre ; médiateur, noèsiologue et maître du grimoire, une source indirecte
         (`content/formation/noesiologie`, ch. 1).
       - La graphie « noèsiologie » du catalogue suit la liste du TODO. `content/formation` écrit
         « noésiologie ».
    3. **Le cercle des fondateurs est déclaratif** : personne ne le vérifie. Faut-il une liste
       fermée, tenue par l'administrateur ?
    4. **Les jeux de tests à verser sur GitHub** (fictifs seulement).
    5. **Les rôles partagés avec EduChat** (`is_promptagogue`, `is_teacher`, autre dépôt) : hors
       de ce travail.
- 2026-10-22 — **Phase D : corrections de la revue (même branche `feat/phase-d-twin9`, rien
  déployé).** Douze constats confirmés, dont deux paires en double (la graine,
  « non conservées ») : dix défauts, huit commits `fix:`, chacun avec le test qui échouait avant
  lui, un `docs:`, un `test(e2e):` et cette entrée. `Twin_v9` (t9-s2, a1d84bf) n'est pas modifié ; aucun appel LLM réel.
  - `e92b0e5` — **un tableau de traces sans sa fermeture n'emporte plus les journées qui le
    suivent** (`lib/twin9/marques.js`) : une ouverture orpheline restait appariée à la fermeture
    du tableau d'une journée suivante, et tout le texte d'entre eux partait, en silence, de la
    fiche, des archives restaurées et du texte envoyé à Twin9. Un tableau ne contient plus
    d'autre ouverture ni fermeture.
  - `f91adc1` — **la graine de la stigmergie est bornée** à ±(2^53 − 1) : `1e21`, admis comme
    entier par le schéma, arrivait en flottant au moteur (`TypeError` : un 500 à l'aperçu, ou un
    run en échec). Le schéma du profil n'est validé qu'en PHP : rien à régénérer.
  - `eb16bd1` — **T0 : l'aperçu nomme les journées que Twin9 ne lit plus** dans le texte envoyé
    (un `_b` réuni, un « Retour sur la séance du … », une date corrigée dans la fiche) et que la
    mémoire de la carte garde : `disparues` (`portfolioPourTwin9`), `memoire` (l'aperçu de
    l'API) ; la carte étant additive, sa fusion les compte encore.
  - `3c47f80` — **T0, une seule journée dans l'interface** : le texte part toujours tel quel, et
    l'aperçu dit les journées que Twin9 y lit à la place (`autres`, `nonLues`).
  - `d51cb1c` — **« non conservées » n'accuse plus une panne** : la modale, le rapport d'import,
    les schémas et la documentation nomment les trois causes (une panne, un texte modifié
    depuis, une analyse trop ancienne), sans annoncer que l'analyse suivante la refera.
  - `a5cb47e` — **un bout seul d'une trace reste orange et souligné** (la couleur de la nature
    ne vaut que pour un passage retrouvé en entier ; « écartée » partielle, barrée et
    pointillée) ; « forte » passe au rouge (`#fecaca`), loin de l'orange du partiel. Un test
    calcule la cascade sur `carto.css`.
  - `625e6d3` — **C3 : les traces sans identifiant de deux cartes réunies restent toutes.**
  - `cd44bc2` — **docs** : aucune trace n'entre par le *texte* d'un fichier ; les traces d'un jeu
    sont une projection d'affichage, qu'une archive ou un `twin9-run` déposé à la main reprend
    tel quel (contrats §4 point 16, §7.4 ; UC-APP-06 RG10, UC-APP-01, UC-APP-10). Sans test :
    documentation seule.
  - `fb3a984` — **le menu « Référentiel » ne propose plus deux fois celui du profil** : la
    seconde option lisait sa dernière version publiée au lieu de celle que le profil fige, sans
    garde du jury ; le libellé dit la version figée.
  - `671c65a` — **l'e2e du lot C** (`web/e2e/twin9-referentiels.e2e.js`) : le profil v9.8,
    « Fictif lettré » choisi au lancement, sans créer de profil ; son lancement, par lots, est
    retenu par le scénario (le mock ne simule pas les lots : une requête partirait chez
    Anthropic) et son corps vérifié ; puis un profil RESPIRE direct, le référentiel lettré
    choisi au lancement, va au bout (pôles A à E, carte et attestation `fictif-lettre`).
  - **Vérifié** (PHP 8.5.12, MySQL 8.0 locaux, base `humanome_test_d`, `TWIN_V9_DIR` = t9-s2,
    sur l'arbre de `671c65a`) : PHP `Tests: 1899, Assertions: 21071`, les 2 échecs connus de PHP
    8.5 seuls (`AuthActivationTest::testExpiredCodeIsRejected`,
    `UcCpt02…::testU17SessionCookieAttributes`), 1 dépréciation ; `PariteTest`,
    `EmpreintesFigeesTest`, `RejeuTest`, `VoieMixteTest`, `ProfilTest`, `MoteurReglagesTest` :
    146 tests verts ; front 3 001 tests verts (274 fichiers, 9 sautés) ; moteur 592 tests, 579
    verts, 8 sautés et les 5 échecs locaux connus d'UC-PRO-08 (F19 à F22, F25) ; `npm run build`
    puis `npm run test:dist` vert ; `check-publiable` OK ; catalogue des cas recompté, inchangé
    (1 036 U, 1 193 F ; UC-APP-10 : 24 U, 28 F).
  - **Non vérifié** : PHP 8.2 (la CI) ; un vrai navigateur (jsdom seulement : la nouvelle teinte
    de « forte » et le partiel des traces ne sont vus qu'au calcul de la cascade) ; rien n'est
    déployé.
  - **Vérifié ensuite, le 2026-10-23** : les e2e sur une base MySQL isolée (`humanome_e2e`,
    montée selon INSTALL.md §3, moteur factice, Anthropic simulé, détruite après) —
    `twin9-referentiels` 2/2, `twin9-run` 1/1, `navigation-burger` 7/7. Le scénario du lot C
    échouait d'abord par deux défauts du test seul (`ef27fb3`) : un libellé « RESPIRE v7 » en dur
    alors que la base publie la 7.1, et un `goto` vers le fragment déjà ouvert, qui ne remonte
    pas la vue ; corrigé, il va au bout (carte aux pôles A à E, attestation sur `fictif-lettre`,
    profil enregistré resté sur `respire`).
  - **À décider (Christian)** : (1) les journées que Twin9 ne lit plus restent dans la mémoire de
    la carte, et sa fusion les compte encore (un même passage dans deux journées peut atteindre
    le seuil du faisceau) : les retirer de la carte au lancement (`journees/<id>`,
    `stigmergie/<id>`), ouvrir une carte neuve, ou s'en tenir à l'aperçu qui le dit ? (2) une
    seule journée dans l'interface, des titres datés d'autres jours que Twin9 lit : neutraliser
    ces titres (Twin9 ne daterait alors rien), ou le dire seulement, comme aujourd'hui ? (3) les
    traces d'un jeu venues d'une archive ou d'un `twin9-run` déposé à la main : ramener
    `conservee` à « non confirmées » (un drapeau de provenance dans la chaîne d'import), ou les
    garder telles qu'écrites ? (4) distinguer, côté serveur, une panne d'un journal remis à
    zéro (le journal des appels, tant qu'il existe) relève du chantier « une panne n'est jamais
    un verdict ».

- 2026-10-22 — **Phase D : l'algorithme Twin9 et ses entrées, en une seule version, avant la
  campagne payante (branche `feat/phase-d-twin9`, depuis `main` 6d44046 ; rien déployé).** Plan d'ensemble (`ordre.md` §2, phase D, hors dépôt) ; designs des sprints 3, 4, 1 (lot 2) et 5 (lot C).
  Moteur de référence : `Twin_v9` a1d84bf (stigmergie du greffier désactivée par défaut,
  `--rescan` en plusieurs passes), en lecture seule, jamais modifié. Aucun appel LLM réel. Neuf
  commits ; les décisions de Christian, prises par délégation, sont appliquées telles quelles.
  - `26c1b3c` — **S3-2, la stigmergie du greffier sur la plateforme** : clé `stigmergie` de
    premier niveau du profil, hors `required`, `{enabled: false}` par défaut (complété par
    `ProfilRepository::complete`), types stricts (`evaporation` de 0,2 à 1, `exploration` de 0 à
    1, `graine` entier, `lignes` de 0 à 10) ; `MoteurReglages` n'émet `config.stigmergie` que si
    elle est activée (le profil v9.8 porte `{enabled: false}`, `PariteTest` inchangé) ;
    `ProfilPolicy` refuse la stigmergie avec `calques.accumulation` à vrai, dès l'enregistrement ;
    profil prédéfini « Stigmergie (essai) » ; bloc `configuration.algorithme.stigmergie`.
  - `d230ddd` — ses réglages sur `#/configuration`, en mode expert (une stigmergie activée reste
    visible en mode simple) ; « Nouveau, depuis « Stigmergie (essai) » ».
  - `717b2af` — **S3-3, les traces dans la cartographie** : `traces_conservees` dans les
    résultats (une journée dont un appel est en panne ne montre pas ses traces comme
    conservées) ; les traces dans le jeu par liste blanche, la modale du jour (nature en mots et
    par sa marque ; l'intensité en mode expert et pour le cartographe seulement, jamais appelée
    « score ») ; le portfolio surligné à l'export, dont les marques sont retirées de tout texte
    importé ou envoyé à Twin9.
  - `cd60726`, `1102b54` — **S4 T0, Twin9 reçoit les journées de l'interface**
    (`web/src/lib/twin9/portfolio-pour-twin9.js`) : segments de la fiche du portfolio d'abord,
    en-têtes canoniques seulement là où Twin9 ne lit pas la date, le mode Google Docs gardé ;
    l'aperçu nomme les journées retouchées.
  - `274ffbf` — **S4 C3 et C4** : deux cartes de même date réunies (avertissement
    `twin9-journee-dupliquee`) ; « établie par faisceau (second ressort) » en seconde lecture
    (D-68). T3 n'est pas fait (décision).
  - `0b56282` — **S1, lot 2 du mode expert** : en mode simple, `#/twin9` lance avec le profil
    v9.8, sans liste des profils ni « Régler mes profils » (une ligne le nomme) ; un profil choisi
    en mode expert ne part pas en mode simple ; l'aide le dit ; en mode expert, rien ne change. Le
    mode n'est jamais un droit. UC-APP-10 A10, UC-VIS-06, UC-APP-10-F24.
  - `45fe62f` — **S5, lot C : le référentiel choisi au lancement de Twin9.** `POST
    /api/twin9/runs` et `…/apercu` acceptent `referentiel: {id, version?} | null`, écrit dans la
    **copie** du profil avant `ProfilPolicy::admettre` : brouillons (run d'essai de leur auteur),
    refus d'un référentiel non publié, gel de la version, refus d'un jeu d'avant T16 et
    attestation tiennent tous ; il entre dans la configuration, l'empreinte et la carte ; le
    profil enregistré ne change pas. **Garde du jury** : si l'identifiant change,
    `jury.specialistes` et `jury.par_competence` sont vidés dans la copie, et l'aperçu le dit
    (`jury_retire`, avec le référentiel lu). `ProfilPolicy::choix` donne le libellé de chaque
    référentiel, la configuration celui de chaque profil. Menu « Référentiel » dans « Lancer »,
    par défaut celui du profil : toujours en mode expert (brouillons compris), en mode simple
    dès que plus d'un référentiel est publié. UC-APP-10 (A11, RG18, F25 à F28), UC-VIS-06 RG2,
    UC-EPI-05 ; UC-ETA-03 vérifiée, non concernée (runs de masse).
  - Ce commit — **le test instable de `Twin9View.test.jsx` rendu déterministe, et cette
    entrée.** Cause trouvée (pas un délai allongé) : reproduit sous charge (1 échec sur 20
    passages parallèles), « relit ses comptes à chaque ouverture… » rouvrait « Configuration »
    avant que React ait rendu la fermeture ; les deux `toggle`, fermé puis ouvert, se rendaient
    d'un même lot (ou, fermé puis rouvert avant la tâche, le `<details>` n'en émet qu'un, ouvert :
    spécification HTML, suivie par jsdom), l'état « ouvert » ne changeait pas et rien ne se
    relisait. `ConfigurationDuRun` compte désormais les ouvertures ; un test fond la fermeture et
    la réouverture en un seul `toggle` : il échouait à coup sûr avant, il passe. Après le
    correctif : 24 passages parallèles sous charge, 24 verts.
  - **Vérifié** (PHP 8.5.12, MySQL 8.0 locaux, base `humanome_test_d`, sur l'arbre de ce
    commit, le code des deux derniers lots inclus) : PHP `Tests: 1894, Assertions: 20588`, les 2
    échecs connus de PHP 8.5 seuls (`AuthActivationTest::testExpiredCodeIsRejected`,
    `UcCpt02…::testU17SessionCookieAttributes`), 1 dépréciation, 22 tests sautés (ceux du vrai
    moteur, sans `TWIN_V9_DIR`) ; avec `TWIN_V9_DIR` = `Twin_v9` a1d84bf : `PariteTest`,
    `EmpreintesFigeesTest`, `RejeuTest`, `VoieMixteTest` 33 tests verts, et `StigmergieTest`,
    `PortfolioPourTwin9Test`, `ReferentielMoteurTest`, `ProfilTest` 115 tests verts ; front
    2 984 tests verts (273 fichiers, 9 sautés) ; moteur 592 tests, 587 verts et les 5 échecs
    locaux connus d'UC-PRO-08 (F19 à F22, F25) ; `npm run build` puis `npm run test:dist` vert ;
    catalogue des cas recompté (1 036 U, 1 193 F) ; `check-publiable` OK.
  - **Non vérifié** : PHP 8.2 (la CI) ; un vrai navigateur (jsdom seulement) ; les parcours e2e
    `twin9-run` et `twin9-referentiels` (le mode expert y est posé, ils ne sont pas lancés ici) ;
    l'essai réel S3-4 et « une panne n'est jamais un verdict », hors périmètre (Christian) ; rien
    n'est déployé. Une fois, sous forte charge, `UC-ADM-05-F01` a dépassé son délai de 1 s
    (`findByText`) ; il passe seul, non traité ici. Restent de la phase D, hors de cette branche :
    S5 B3 (l'Humanome V18 en base de développement) et le gel (tag du moteur, un aperçu de chaque
    run de la campagne).
  - **À décider (Christian)** : (1) la garde du jury ne joue que si l'identifiant change : une
    version de RESPIRE d'une autre structure (six pôles) choisie au lancement garde les
    spécialistes par numéro de pôle du profil — l'étendre à un changement de structure ? (2)
    l'attestation porte le référentiel du run, pas le fait qu'il a été choisi au lancement : un
    drapeau est-il utile ? (3) en mode simple, le menu « Référentiel » paraît dès deux
    référentiels publiés, sans brouillon : convient-il ? (4) un jury propre aux pôles d'Humanome
    (S5, Q5) reste ouvert : un référentiel lettré reçoit le « Spécialiste du pôle » générique.

- 2026-10-23 — **Les cinq échecs locaux d'UC-PRO-08 (F19 à F22, F25) : cause trouvée, test
  corrigé (branche `fix/uc-pro-08-node20`).** Le test copie `import-protocole.mjs` et le parseur
  `web/src/lib/twin9/*.js` dans un miroir temporaire, sans `package.json` : Node 20.17 (le poste)
  y lit ces `.js` en CommonJS, et le script meurt au chargement (« Named export 'parsePole' not
  found »). La CI (`node-version: 20`, soit Node 20.20.2) détecte la syntaxe des modules depuis
  Node 20.19 : elle passait. Le miroir reçoit désormais `web/package.json` (`"type": "module"`).
  Le script n'est pas en faute : dans le dépôt, ce `package.json` est le sien, et il se charge
  sous Node 20.17. Ces cinq échecs ne sont plus l'état normal du poste ; la cause qu'en donnait
  l'entrée « P0, PR B » du 2026-10-22 (« le faux dépôt Twin_v9 ne se crée pas ») n'est pas celle
  reproduite aujourd'hui.
  - Vérifié : le fichier 8/8 sous Node 20.17, avec et sans détection forcée
    (`NODE_OPTIONS=--experimental-detect-module`, `--no-experimental-detect-module`) ; l'ancien
    test : 5 échecs sans détection, 8/8 avec ; moteur 593 tests verts avec `TWIN_V9_DIR` (585,
    8 ignorés, sans) ; front 2 904 verts ; `check-publiable` vert ; le vrai script, lancé depuis
    le dépôt sous Node 20.17, passe ses imports ; journal de la CI de `5455c44` : Node 20.20.2,
    UC-PRO-08 8/8.
  - Non vérifié : le test corrigé sur un vrai Node 20.20 (rien n'est poussé) ; `"type":
    "module"` étant déclaré, la détection n'y joue plus.

- 2026-10-23 — **Le commit du moteur Twin9 en SHA-256 et au format reftable (revue de
  `fix/engine-commit-espace`, même branche).** Deux défauts latents, préexistants, du même
  symptôme (commit `null` sans bruit) : `51cbf90` accepte un nom de 64 chiffres (dépôt
  `--object-format=sha256`) dans `HEAD`, les refs et `COMMIT`, et le schéma
  (`configuration.moteur.commit` : `{7,64}`, validateurs recompilés, `docs/contrats.md`,
  `twin9-configuration/1` gardé : simple élargissement) ; `6bae0ff` demande la tête à git
  (`git --git-dir=… rev-parse`, sans shell) quand le dépôt est au format reftable, sur ce seul
  dépôt — jamais celui qui l'entoure. Format « files » et copie sans git : inchangés.
  - Vérifié : les deux tests rouges avant (`EngineLoaderTest`, vrai dépôt reftable sous un
    chemin à espace, branche et worktree détaché ; `validation.test.js` pour le motif) ; le moteur
    de référence donne toujours `a1d84bf…` ; filtre Twin9 32 tests OK ; suite PHP complète
    1 862 tests, 2 échecs préexistants (PHP 8.5).
  - Non vérifié : un vrai moteur recloné en SHA-256 ou en reftable ; la CI (le test reftable y
    saute si son git est antérieur à 2.45).

- 2026-10-23 — **Le commit du moteur Twin9 survit aux chemins avec une espace (branche
  `fix/engine-commit-espace`).** `afd5db9` : `EngineLoader::commit()` lisait le fichier `.git`
  d'un worktree avec `/^gitdir:\s*(\S+)/`, coupé à la première espace (« 13. Cartographie/… ») ;
  le commit gardé par l'attestation et le bloc configuration valait alors `null`. Il lit
  désormais toute la première ligne, sans fin de ligne (CRLF compris) ni blancs finaux ; et
  `packed-refs` en CRLF est reconnu (`\r?$`), ce qu'il ne faisait pas. `HEAD`, `commondir`
  (absolu ou relatif), les refs isolées et `COMMIT` passaient déjà par `trim()` : vérifiés,
  inchangés. Aucun autre lecteur de `.git` dans `api/` ni `scripts/` (le déploiement interroge
  git lui-même). Comportement inchangé pour un chemin sans espace.
  - Vérifié : `EngineLoaderTest` (faux worktree sous un chemin à espace : HEAD détaché, branche
    par `commondir` et `packed-refs`, `gitdir` relatif, CRLF ; et le vrai moteur comparé à
    `git rev-parse HEAD`), rouge avant le correctif ; le moteur de référence (worktree détaché dont
    le `gitdir` contient une espace) donne `a1d84bf…` ; suite PHP complète 1 860 tests, 2 échecs
    préexistants (PHP 8.5), `PariteTest` compris.
  - Non vérifié : une attestation produite par un vrai run après le correctif.

- 2026-10-22 — **Twin9 multi-fournisseur : corrections de la revue de la PR C (même branche
  `feat/twin9-multi-fournisseur`).** Dix-sept constats confirmés (deux en double),
  treize commits `fix:`, chacun avec le test qui échouait avant lui, et trois `docs:`. `Twin_v9`
  n'est pas modifié ; un profil tout Anthropic garde ses empreintes (`EmpreintesFigeesTest`,
  `PariteTest`). Sa conduite change sur ces points seulement : l'en-tête `traceparent` des requêtes
  de lots ; le lot d'un run en échec relevé au lieu d'annulé ; la garde de départ d'un lot
  (`borne − avantLaFin`) ; le solde d'un run annulé (aussitôt hors vol, au tick pour ses appels en
  vol) ; le libellé d'un Anthropic fermé (« indisponible sur cette instance »).
  - `058e372` — **un run arrêté garde son lot** (constats 1 et 5) : le lot d'un run en échec n'est
    plus annulé ni supprimé sans être lu ; `Twin9Lots::menage` le relève une fois fini (réponses
    écrites avec leur coût, débitées), solde, puis supprime ; seul un run **annulé** voit son lot
    annulé, et ses réponses venues malgré l'annulation sont lues et payées. Un lot en annulation
    compte en vol, et un run repris entre-temps le relève.
  - `5f44330` — **annuler pendant des appels directs** (constat 2, préexistant) : la tranche relit
    le statut avant chaque départ, garde le run tant que ses appels sont en vol (écrits avec leur
    coût), solde à sa fin au coût réel ; un run annulé entre deux tranches, ou laissé par un tick
    mort, est soldé en tête du tick suivant (`RunRepository::aSolder`). Puis `c5157e9` : la
    route rend aussitôt ce qu'aucune tranche n'a en vol (`RunCosts::libererHorsVol`) — sans
    déclencheur, la page d'un run annulé ne lance plus de tick, et le crédit serait resté retenu.
  - `538b876` — **l'excédent payé par l'instance ne pèse plus sur l'auteur** (constat 4) : budget,
    `disponible`, reprise lisent `RunCosts::impute` (coût réel plafonné au pire cas tenu, avec la
    clé de l'instance) ; compteurs `facture_microusd` à côté de `cout_microusd`, rendu par le suivi
    (`cout.depense_microusd`). Sans migration : le pire cas tenu est déjà gardé.
  - `ed7dc9d` — **« pire cas insuffisant »** (constat 3) : la marque est gardée (réglage
    `twin9_pire_cas_insuffisant`, à part de `twin9_config`), montrée sur la ligne du modèle dans
    `#/admin/twin9` et rendue par `GET /api/twin9/admin/config` ; le lancement la refuse tant que
    les plafonds du modèle n'ont pas changé — **au-delà de la spécification**, qui ne demandait
    que la marque (parade de la critique 2 n° 3).
  - `913eb7b` — la page du crédit ne promet plus qu'une clé Anthropic privée exempte tout run
    Twin9 du débit (constat 15).
  - `886dab2` — la page d'un run dit « fournisseur X indisponible sur cette instance » pour un
    fournisseur fermé comme pour une clé d'instance absente (constat 10).
  - `cb4caf1` — **une clé d'instance refusée par un tiers** (401, 403 ; constat 7) : l'appel
    attend comme sur un plafond, sans tentative perdue ni panne, la page le dit indisponible, le
    worker le compte (`twin9ClesRefusees`) ; trente minutes ainsi, le run s'arrête, sa réserve
    rendue. La voie directe d'Anthropic est laissée telle quelle (pas de symétrie : un profil tout
    Anthropic ne change pas).
  - `11d9842` — la création d'un lot garde le temps d'une soumission avant le dernier départ qui
    la borne ; une création jamais partie (`non_envoye`) n'est plus un « lot perdu » (constat 8).
  - `7963697` — chaque requête de la voie par lots porte le `traceparent` non échantillonné
    (constats 9 et 12) ; `docs/contrats.md` dit comme l'ADR-012.
  - `c7d0eaa` — **la tranche du déclencheur** (constat 6) : la route du tick garde la durée que
    demande cron-job.org (réglage `twin9_tranche_declencheur`) ; le lancement se mesure sur la
    tranche la plus courte servie (21 s au départ d'un appel sous 25 s, au lieu de 35) ;
    l'administration la dit et ne propose pas plus ; dans une tranche trop courte, seul le modèle
    trop long attend (pas tout le fournisseur), la page dit d'ouvrir le run ; trente minutes
    ainsi (migration `033_twin9_retenue.sql`, `twin9_runs.retenu_depuis`), le run s'arrête, sa
    réserve rendue. `docs/deploiement.md` : le profil mixte sous 25 s.
  - `5a15618` — `check-publiable` reconnaît une clé Google qui finit par « - » (constat 11 ;
    test UC-PRO-08-F26, qui couvre aussi les clés OpenAI, OpenRouter et xAI).
  - `ebe2ec6` — le coffre ne prend plus de clé Mistral AI, qu'aucun parcours n'emploie (constat
    17, minimisation) : la décision (4) ci-dessous est tranchée ainsi ; jamais déployée, aucune
    clé à purger.
  - `aee09ff` — politique de confidentialité et registre : ce que chaque fournisseur conserve, et
    les **transferts hors UE** (constat 13) — pays de traitement et garantie **non vérifiés**,
    Anthropic compris : rien n'en est affirmé.
  - **Ordre des commits de la PR C** (constat 14, historique seulement) : de `00281a9` à
    `9564e4a`, un administrateur pouvait ouvrir un tiers (par l'API) et y envoyer un portfolio
    avant que la politique, le registre et l'accord lié aux fournisseurs n'arrivent (`b18086e`),
    contre la règle « même commit » de la spécification. L'arbre final est conforme ; l'historique
    publié ne se réécrit pas : **fusionner la PR en squash**, pour que `main` n'ait aucun commit
    déployable qui l'enfreigne (à dire dans la PR).
  - **Badge RGPD de la page des clés** (constat 16, C9 du plan) : retiré du périmètre,
    volontairement. L'étiquette décrit les conditions des clés de l'instance ; une clé personnelle
    tierce ne sert jamais à Twin9 (ADR-012 §5) : la poser à côté d'une clé personnelle
    présenterait une garantie qui ne vaut pas pour elle.
  - Point ouvert : `Twin9Lots::menage` traite au plus 20 lots par tick, par ordre d'identifiant ; le
    lot d'un run en échec y reste désormais jusqu'à sa fin chez Anthropic (24 h au plus), une
    requête d'état par tick. Au-delà de vingt lots ainsi en attente, un lot plus récent (à annuler,
    ou perdu) attendrait son tour : sans effet à l'échelle d'aujourd'hui, à revoir s'il le faut.
  - À dire à Christian : les garanties des transferts hors UE sont à établir, fournisseur par
    fournisseur, avant d'ouvrir un tiers (Anthropic compris, déjà en production) ; le refus au
    lancement d'un modèle au pire cas insuffisant va au-delà de la spécification ; sous le
    déclencheur de 25 s, la durée maximale d'un appel tiers admise est de 21 s.
  - Vérifié, sur l'arbre de `c5157e9` (PHP 8.5.12, MySQL 8.0 locaux, base `humanome_test_c`) :
    PHP `Tests: 1843, Assertions: 20207`, les 2 échecs connus de PHP 8.5 seuls
    (`AuthActivationTest::testExpiredCodeIsRejected`, `UcCpt02…::testU17SessionCookieAttributes`),
    1 dépréciation, aucun test sauté ; `PariteTest` et `EmpreintesFigeesTest` verts (13 tests, vrai
    moteur `../Twin_v9`) ; front 2 820 tests verts (260 fichiers) et moteur 562 tests, 557 verts et
    les 5 échecs locaux connus d'UC-PRO-08 (F19 à F22, F25), sur `aee09ff` (`c5157e9` ne touche ni
    l'un ni l'autre) ; `check-publiable` OK. Un test du front
    (UC-ADM-05-F01) a dépassé une fois son délai sous charge, vert seul et aux passages suivants.
  - Non vérifié : PHP 8.2 (la CI) ; aucun appel réel à un fournisseur (la porte payante C10 reste à
    faire) ; la tranche du déclencheur n'est gardée que par la route HTTP du tick (pas par
    `scripts/worker.php`, dont la tranche est celle de l'instance).

- 2026-10-22 — **Twin9 multi-fournisseur : chaque étage, étape et lecteur choisit son fournisseur,
  l'administrateur les ouvre, l'accord les nomme (branche `feat/twin9-multi-fournisseur`, PR C du
  plan « P0 et multi-fournisseur »).** Spécification `spec-v2` (PR C : lots C7, C8a,
  C8b, C9), faits d'API relevés le 2026-10-22 sur les seules documentations officielles. Huit
  commits : ADR-012, C7, C8a, C8b, le lancement, C9, cette entrée et une précision du registre RGPD. `Twin_v9` n'est pas modifié ; un profil tout Anthropic garde
  exactement ses empreintes (`EmpreintesFigeesTest`, `PariteTest`).
  - **ADR-012** amende ADR-010 §2 et §4 et ADR-011 §3 : six fournisseurs connus (Anthropic, OpenAI,
    Mistral AI, Google, xAI, OpenRouter), une adresse verrouillée chacun, la route par appel, la
    clé personnelle chez Anthropic seulement, les prix tiers saisis à la main, l'étiquette RGPD et
    l'accord qui nomme les fournisseurs.
  - **C7 — le profil nomme le fournisseur de chaque appel, l'instance les ouvre.** `fournisseur`
    sans défaut sur étages, étapes, lecteurs et second ressort (hérité : Anthropic, l'étage,
    l'étage des lecteurs) ; motif de modèle par fournisseur (80 caractères ; OpenRouter sans
    suffixe `:`), un changement de fournisseur nomme son modèle, aucun effort hors d'Anthropic ;
    `famille` facultative ; `appels_directs` ≤ 32 ; le fournisseur hérité sort des empreintes,
    jamais celui du second ressort (test de collision). Réglages d'instance
    `twin9_fournisseurs_ouverts` (`["anthropic"]`) et `twin9_fournisseurs_non_rgpd` (`false`),
    à l'administrateur ; un profil qui nomme un fournisseur fermé s'enregistre, ne se lance pas ;
    clé personnelle refusée dès qu'un appel quitte Anthropic.
  - **C8a — un appelant par fournisseur, sa clé, ses plafonds.** `AnthropicAppelant` (en-tête
    `traceparent` non échantillonné), `ChatCompletionsAppelant` (OpenAI `store:false` et
    `max_completion_tokens`, Mistral, xAI, OpenRouter `data_collection: deny` sans repli),
    `GeminiAppelant` (`store:false`, parts de réflexion écartées) ; un vocabulaire d'arrêt ;
    aucun texte d'un fournisseur ne sort (test « canari » par appelant) ; chaque hôte reçoit sa
    clé factice, jamais une autre. Grille `fournisseur:modèle` avec `plafond_sortie`,
    `plafond_reflexion`, `duree_max_s`, `reflexion_param` ; débit plafonné à la réserve, l'excédent
    à l'instance (`depassements`). Coffre : `mistral` (retiré par la revue, `ebe2ec6`) ; cinq clés d'instance en `$secret` ;
    `phpunit.xml` vide les six `*_API_KEY` ; `check-publiable` reconnaît les vraies clés Google,
    OpenAI, OpenRouter et xAI.
  - **C8b — la voie mixte.** Anthropic par lots (si le profil le dit) et les autres en direct dans
    la même tranche : un lot au plus par run et par tranche, en tête ; suspensions par fournisseur
    ou pour les lots ; garde relue à l'ouverture de chaque tranche ; un appel tiers ne part que si
    sa `duree_max_s` tient dans la tranche ; repos commun après un 429 ; arrêt différé (rien ne
    part, les appels en vol reviennent ou sont coupés, journalisés avec leur coût). Migration
    `032_twin9_fournisseurs.sql` (fournisseur, coupures, plafond de chaque appel).
  - **Lancement** : l'accord `{fournisseurs: [ids]}` comparé aux fournisseurs qu'atteignent les
    appels (`422` sinon), gardé dans la configuration ; contrôle propre au lancement et à la
    reprise (fournisseur disponible, un seul message, prix et plafonds) ; prévision par route ;
    évaluations à la voie effective et à la part d'Anthropic.
  - **C9 — l'interface et les textes.** Page `#/configuration` : le fournisseur de chaque étage,
    étape et lecteur (« hérité : … », « celui de chaque étape » au second ressort), son étiquette
    RGPD visible sans le focus, les fournisseurs indisponibles non choisis (celui que nomme le
    profil se voit) ; changer de fournisseur emporte la famille d'un lecteur qui le suivait, un
    modèle qu'il n'admet pas (un étage en redemande un) et l'effort ; ce que le serveur
    refuserait est dit à côté (modèle hors motif, effort d'étage hérité ailleurs, clé
    personnelle avec un tiers) ; la voie expliquée en clair, sans effet sans appel Anthropic ;
    un résumé « Ce profil envoie son texte à… ». Page `#/twin9` : l'accord nomme chaque
    fournisseur, sa voie et son étiquette avant tout aperçu, dit un fournisseur « non » à éviter
    pour des journaux d'élèves réels, tombe quand le profil en atteint d'autres ou par une autre
    voie, et part en `{fournisseurs}` ; un run mixte « en partie par lots ». Pour cela,
    `GET /api/twin9/configuration` donne les fournisseurs de chaque profil
    (`profils[].fournisseurs`) et du profil v9.8 (`defaut_fournisseurs`), comme l'aperçu.
    `#/admin/twin9` : chaque fournisseur, son étiquette, sa voie, la clé de l'instance posée ou
    absente (`fournisseurs` en lecture seule : un booléen, jamais la clé), l'ouverture et le second
    interrupteur (le refermer referme les fournisseurs « non »), la grille d'un modèle tiers et
    ses plafonds ; « contribution sur les prix des fournisseurs » ; le relevé dit qu'il ne touche
    qu'Anthropic. Clés : Mistral AI proposé (retiré par la revue), l'exemple de clé de chaque fournisseur, et le message
    « pour l'analyse approfondie Twin9, une clé personnelle ne sert que chez Anthropic ». Textes :
    politique de confidentialité (destinataires, conservation de chacun d'après sa documentation,
    étiquettes indicatives), registre RGPD §6, §8, §12, §13, aide de Twin9, `docs/contrats.md` §7,
    §8.1, §8.4, `docs/autorisations.md`, fiches UC-ADM-05 (A7, A8, RG10, RG11, U20, U21, F21),
    UC-CPT-04 (A6, U12, F22), UC-APP-10 (A9, RG1, U17, F22).
  - Non signalé par la page, refusé par le serveur (`422` qui nomme l'étape) : l'effort propre d'une
    étape quand le second ressort part chez un autre fournisseur.
  - Vérifié, sur l'arbre du commit de C9 (PHP 8.5.12 et MySQL 8.0 locaux, base
    `humanome_test_c`) : PHP `Tests: 1826, Assertions: 20049`, les 2 échecs connus de PHP 8.5 seuls
    (`AuthActivationTest::testExpiredCodeIsRejected`, `UcCpt02…::testU17SessionCookieAttributes`),
    1 dépréciation, aucun test sauté (`PariteTest` compris, vrai moteur `../Twin_v9`) ; front 2 817 tests verts (260 fichiers ; 2 794 avant C9) ;
    moteur 561 tests, 556 verts et les 5 échecs locaux connus d'UC-PRO-08 (F19 à F22, F25) ;
    `check-publiable` OK.
  - Non vérifié : la syntaxe sous PHP 8.2 (la CI le dira) ; un vrai navigateur (jsdom seulement) et
    le bout en bout (Playwright) ; aucun appel réel à un fournisseur : la porte payante du plan
    (C10 : un run par lots puis en direct chez Anthropic, puis un appel par fournisseur tiers ouvert,
    Mistral et OpenAI d'abord, puis un run mixte, budget de 2 $) reste à faire, au feu vert de
    Christian ; le catalogue des cas (`docs/cas-utilisation/README.md`) n'est pas recompté : la copie
    de la branche est abîmée depuis la fusion `cc5fc1a` (les lignes UC-APP-09 et UC-APP-10 remplacées
    par une ligne de total), `main` a la bonne ; à recompter en fusionnant `main`, qui a reçu depuis
    #26 (la PR A), #25, #27 et #28.
  - À décider (Christian) : (1) la garde RGPD — aujourd'hui un fournisseur étiqueté « non » ne
    s'ouvre que derrière `twin9_fournisseurs_non_rgpd`, ou seulement exiger l'accord qui le nomme ;
    (2) à savoir, sans changement : avec une clé personnelle Anthropic, les résultats des lots sont
    visibles dans la Console du titulaire de la clé (les gabarits rendus compris) ; (3) un effort
    posé sur un étage empêche toute étape de cet étage de partir ailleurs qu'Anthropic (le serveur
    refuse l'effort hérité, la page le dit) : garder, ou ne pas transmettre l'effort d'un étage à un
    appel tiers ; (4) ~~la clé Mistral AI de « Mon compte » ne sert encore à aucun parcours
    (l'assistant n'a pas d'adaptateur Mistral, Twin9 n'emploie qu'une clé personnelle Anthropic) :
    la garder ainsi annoncée, ou la retirer~~ — retirée par la revue (`ebe2ec6`, minimisation) ; (5) l'accord retombe aussi quand seule la voie
    d'Anthropic change (par lots ↔ en direct : la conservation du lot change) ; (6) à vérifier à la
    pose des clés d'instance, que le code ne peut pas imposer et dont dépendent la politique de
    confidentialité et les étiquettes : la clé Google de l'offre payante (conditions de Gemini pour
    l'EEE) ; chez Mistral AI, l'usage des données pour l'entraînement coupé (Admin > Privacy,
    « Anonymous improvement data ») ou une offre payante ; chez OpenRouter, « Input & Output
    Logging » et « Use of Inputs/Outputs » laissés désactivés sur le compte de la clé.

- 2026-10-22 — **`npm run test:dist`, correctifs de la relecture (branche `fix/smoke-dist` ;
  non fusionnée, rien déployé).** Sept constats confirmés de la relecture de l'entrée suivante,
  corrigés un par un ; chaque `fix:` porte le contrôle qui ne voyait rien avant lui.
  - **Script d'entrée sans `defer`** (`eef3b6a`, `fix:`) : le bundle appelle `createRoot` dès
    qu'il s'exécute ; sans `defer`, un script classique dans `<head>` s'exécute avant `#root` et
    la page reste blanche (erreur React n° 299). Le script évaluant lui-même le bundle après
    l'analyse du document, il restait vert. Un contrôle statique exige désormais `defer`, ou la
    balise placée après `<div id="root">` (`async` ne suffit pas).
  - **Requêtes non comptées** (`1fbf975`, `fix:`) : « hors la démonstration, aucune requête »
    ne voyait ni les requêtes émises pendant l'évaluation du bundle, ni celles du retour à
    l'accueil, ni celles d'après le dernier contrôle. Chaque requête est notée avec la phase en
    cours (posée avant l'évaluation et avant chaque étape) ; chaque étape contrôle la sienne, la
    démonstration attend 300 ms de calme pour garder ses lectures tardives ; enfin, après le
    même calme, un contrôle global de l'évaluation du bundle à la fin.
  - **IndexedDB jamais exercé** (`a3f7aba`, `fix:`) : jsdom n'a pas IndexedDB, le magasin de la
    cartographie prenait son adaptateur en mémoire, qu'aucun navigateur ne prend. Le script
    fournit `fake-indexeddb` (déjà en devDependency) et vérifie que la base
    `humanome-carto-v4` existe après l'ouverture des fichiers.
  - **Copie autonome en `file://`** (`888c8d3`, `fix(carto):`, seul changement de
    l'application) : son modèle (`carto/viewer-template.html`) se lit à côté d'`index.html` ;
    depuis le bundle ouvert en `file://`, « Télécharger la copie » (et la copie HTML de
    « Préparer une démo ») affichait « Failed to fetch », alors qu'INSTALL.md §4 dit que ce qui
    se lit ainsi demande un serveur et le dit. `loadViewerTemplate` refuse désormais en `file:`
    sans rien lire : « La copie autonome n'a pas pu être produite : elle se prépare sur le site
    en ligne ou via un serveur local (…) ». Nouveau `viewerTemplate.test.js` et étape 6 de
    `test:dist` (espace Export des fichiers ouverts : message, aucune requête).
  - **Documentation** (`docs:`) : INSTALL.md §4 cite la copie autonome et « Préparer une démo »
    parmi ce qui demande un serveur ; la note d'ADR-009 ne garde « INSTALL.md §4,
    `npm run test:dist` » que pour l'accueil, le référentiel et les fichiers de la personne, et
    renvoie à `web/e2e/carto-export.e2e.js` (UC-APP-06 A6) pour la copie, exportée depuis le
    site ou un serveur local puis ouverte hors ligne ; UC-SYS-04 décrit les nouveaux contrôles
    et ses limites (`fake-indexeddb`, pas l'IndexedDB d'un navigateur) ; UC-APP-06 gagne E5
    (copie du site ouverte en `file://`) ; phrases de l'entrée suivante et de la note des dettes
    techniques reprises (la copie s'exporte depuis le site ou un serveur local).
  - **Vérifié** : `npm run build` puis `npm run test:dist` vert (35 contrôles). Mutations, une
    à une, vertes avant le correctif et rouges après, puis annulées (bundle reconstruit) :
    `defer` retiré par `classicScriptTags` (reconstruit) ou de `dist/index.html`, `async` à sa
    place ; `fetch("api/auth/me")` en tête du bundle ; un fetch au retour sur `#/` ; un fetch
    100 ms après le dessin du soleil ; `indexedDB.open(t,-1)` dans le bundle ; choix de
    l'adaptateur forcé en mémoire. Étape 6 rouge sur le bundle construit avant la garde
    (3 échecs : « Failed to fetch. », `carto/viewer-template.html` tenté, dans sa phase et au
    contrôle global). Suite web 2 878 tests verts (268 fichiers, dont les 2 nouveaux) ; moteur
    591 tests, 5 échecs préexistants locaux (UC-PRO-08 F19 à F22, F25), comme sur `main` ;
    `check-publiable` vert. PHP non concerné, non relancé.
  - **Non vérifié** : l'IndexedDB d'un vrai navigateur en `file://` (jsdom reçoit
    `fake-indexeddb`) ni la persistance après rechargement ; une requête émise plus de 300 ms
    après la dernière ; « Préparer une démo » n'est pas parcouru par `test:dist` (même garde,
    couverte par le test unitaire) ; le nouveau message n'a pas été vu dans un vrai navigateur
    (jsdom seulement). Toujours hors CI (le script lit `web/dist`).
  - **Décisions laissées à Christian** : aucune nouvelle. La garde de la copie autonome dit la
    limite au lieu de la lever (embarquer le modèle dans le bundle permettrait d'exporter la
    copie hors ligne : non fait, hors du périmètre d'ADR-003 et de D-38).
- 2026-10-22 — **`npm run test:dist` remis au vert sur ce que le bundle promet en `file://`
  (branche `fix/smoke-dist`, issue de `main` à `36d4509` ; non fusionnée, rien déployé).** Le
  script ouvrait encore `#/merge`, retirée en D-38 : sous jsdom, la redirection appelle
  `history.replaceState`, que jsdom 25 refuse pour toute adresse `file://` (il compare les
  chemins des deux adresses par référence), puis « sunburst never rendered ». Ce n'était pas un
  défaut de l'application : dans Chromium, `dist/index.html#/merge` ouvert en `file://` arrive
  sur `#/cartographie`, sans erreur (vérifié par un script ponctuel, hors dépôt). Application
  inchangée.
  - **Fait** (`ff21083`, `fix:`) : `web/scripts/smoke-dist.mjs` garde ses contrôles statiques
    (les cinq fichiers de la carte du site, script d'entrée classique en chemin relatif), puis
    ouvre le bundle construit en `file://` dans jsdom, chaque requête (fetch, XHR) comptée et
    refusée comme un navigateur la refuse : accueil rendu avec sa CSS, référentiel embarqué
    (61 compétences), message `file://` de la vue journée, écran d'import de la cartographie,
    dont la démonstration ne tente que `data/demo/…` et invite à importer ses fichiers ; enfin
    trois journées versionnées (`schemas/fixtures/cartographie-jour-2026-01-0{5,6,7}.json`)
    ouvertes depuis « Ouvrir mes fichiers de cartographie » de l'accueil : l'interface les
    dessine (7 pôles, les 12 compétences attendues, 3 journées). Hors la démonstration, aucune
    requête ; toute erreur de page fait échouer. Les API que jsdom n'a pas et que tout
    navigateur visé possède (`TextEncoder`, `TextDecoder`, `structuredClone`,
    `Blob.arrayBuffer`) sont fournies par le script. Documentation (`docs:`) : INSTALL.md §4 dit
    ce qui s'ouvre en `file://` et ce qui demande un serveur (vues journée, démonstration),
    §5 cite `npm run build && npm run test:dist` ; fiches UC-SYS-04 (ce que vérifie le script,
    sa limite) et UC-VIS-01 (préconditions, limite `file://` de la démonstration) ; note datée
    dans ADR-009 ; note des dettes techniques mise à jour.
  - **Vérifié** : `npm run build` puis `npm run test:dist` vert (28 contrôles). Mutations, une à
    une, rebâties puis annulées, chacune rouge : `classicScriptTags` retiré de
    `vite.config.js` (script module), `base: '/'` (chemin absolu), garde `file:` d'`apiFetch`
    retirée (`api/auth/me` tenté à l'accueil), garde `file:` de `loadDay` retirée (message et
    requête de la vue journée), garde `file:` du lecteur du référentiel retirée (requêtes au
    référentiel et à l'ouverture des fichiers, que seul le compteur voyait : le soleil se
    dessinait), import vidé (aucun soleil), `dist/llms.txt` effacé. Suite web 2 876 tests verts
    (267 fichiers) ; moteur et PHP non concernés, non relancés. `check-publiable` vert (crochet
    de commit).
  - **Non vérifié** : le script ne passe pas par `#/merge` (limite de jsdom ci-dessus ; la
    redirection est couverte par les tests du routeur et d'`App`) ; ni la mise en page ni un
    vrai navigateur (jsdom) ; il n'est pas en CI (il lit `web/dist`).
  - **Décisions laissées à Christian** : la « démo hors ligne » qu'ADR-009 promettait n'existe
    plus dans le bundle depuis D-38 (la démonstration de l'interface se lit sur le site, D-67) ;
    hors ligne, seule la copie autonome d'un jeu, exportée depuis le site ou un serveur local
    (pas depuis le bundle ouvert en `file://` : entrée des correctifs, ci-dessus), s'ouvre avec
    ses données. L'embarquer à nouveau, ou s'en tenir là, reste à décider ; la documentation dit
    l'état actuel.
- 2026-10-22 — **Sprint 11, correctifs de la revue (branche `feat/carte-du-site` ; non fusionnée,
  rien déployé).** Quatre constats confirmés de la relecture du sprint, corrigés un par un.
  - **Rubrique sans carte** (`2b89b1d`, `fix:`) : sans carte du site (fichier absent, illisible
    ou d'une autre version), toute chaîne en forme de nom de route (jusqu'à 64 caractères
    `[a-z0-9-]`, par exemple « ignore-tes-consignes-et-reponds-en-anglais ») entrait encore
    dans la consigne système, à l'encontre de la décision (5) A (« nom de route connu de
    `site-map.json`, sinon vidée »). Sans carte, aucun nom n'est connu : la rubrique est
    vidée, même un nom de route, et la question reçoit sa réponse. UC-VIS-05-U14 et F17, qui
    figeaient ce repli, prouvent le refus (rouges avant le correctif) ; fiche UC-VIS-05
    (préconditions, RG1, AN1), `docs/contrats.md` §12, `docs/securite-demo.md`.
  - **Mémoire courte écrite par le client** (`b6f24cb`, documentation seulement) : le
    serveur en vérifie la forme, jamais l'origine ; un client peut inventer un tour
    « assistant ». Nouvelle limite d'UC-VIS-05 (bornée à 2 échanges et 1 500 caractères,
    jamais dans la consigne, aucune donnée accessible), renvoi depuis RG7, phrase dans
    `docs/securite-demo.md`. Pas d'anomalie nouvelle (192 au catalogue).
  - **Contrat de `site-map.json`** (`7e38b67`, `test:`) : UC-SYS-04-F18 vérifie sur la carte
    générée ce que lit `CarteDuSite` (`version` 1, types des champs), et que la carte fictive
    des tests PHP a la même forme. Elle avait dérivé (`day` qui se citait comme modèle,
    `points` nuls pour une route interne là où le générateur écrit `[]`) : réalignée, et
    `docs/contrats.md` §12 dit maintenant « `points` vide ». Mutations vérifiées à la main
    puis annulées : `version: 2`, ou `resume` renommé partout dans le générateur, font
    échouer F18 (la seconde laissait la suite web verte).
  - **Modèle par défaut** (`3326083`, `test:`) : UC-VIS-05-F20 tourne aussi avec
    `TUTEUR_MODEL` absent des trois couches que lit `Env::get` ; la valeur vide n'exerçait
    que le repli « pas un Haiku ». Mutation vérifiée puis annulée : le défaut de la route
    remis à Haiku 4.5 fait échouer F20.
  - Écart à la consigne « commits `fix:` » : les constats 3 et 4 sont des trous de
    couverture, le code était juste ; ils sont en `test:`, chaque test prouvé par sa
    mutation. Tableau des cas inchangé (1 000 tests unitaires, 1 172 fonctionnels,
    192 anomalies ; recompté).
  - **Vérifié** (fournisseur `mock` et faux client HTTP, aucun appel LLM) : suite PHP
    complète, 1 779 tests, les 2 échecs connus sous PHP 8.5 seulement
    (`AuthActivationTest::testExpiredCodeIsRejected`, UC-CPT-02-U17), base
    `humanome_test_s11` ; les tests du tuteur aussi avec `TUTEUR_SITE_MAP` vers un fichier
    absent, comme en CI où la carte n'est pas générée ; front 2 831 tests verts sur 2 837
    (6 sautés) au second passage, le test de `Twin9View` (non touché) déjà signalé ayant
    échoué une fois au premier, vert seul trois fois ; moteur 586 verts, plus les 5 échecs
    locaux connus (UC-PRO-08 F19 à F22 et F25) ; `npm run build` ; `check-publiable` vert.
  - **Non vérifié** : `npm run test:dist` échoue toujours comme avant le sprint (la vue
    merge retirée, D-38 : `#/merge` redirige, `replaceState` refusé sous `file://`, « sunburst
    never rendered »), après avoir validé les cinq fichiers de la carte. Rien n'est déployé.
  - **Décisions laissées à Christian** : fermer la mémoire courte (signer côté serveur chaque
    réponse renvoyée et ne garder que les tours `assistant` signés) ou s'en tenir à la
    limite documentée.
- 2026-10-22 — **Sprint 11 de la liste de Christian : une carte du site pour l'assistant, lisible
  par les IA (branche `feat/carte-du-site`, issue de `main` à `fb502cf` ; non fusionnée, rien
  déployé).** Étude du sprint 11 (lecture seule, sans appel LLM). Décisions prises le 2026-10-22
  par délégation de Christian : `robots.txt` selon `ROBOTS_POLICY`, `index` par défaut (ce que
  demande le sprint 11), `noindex` pour un site de test, sans séparer pour l'instant les robots
  d'entraînement de ceux de recherche ; parcours publiés dans `llms-full.txt` et en `.md` : ceux
  du hub `#/guides`, tous (`PARCOURS_PUBLIES` pour en retirer) ; l'entrée d'aide
  `configuration` du sprint 1 reprise telle quelle ; l'assistant passe à Haiku 5.5 ; lots API
  A, C et D faits, B (consigne statique d'abord, pour un cache de prompt) non fait, l'étude ne
  le recommandant pas avant mesure.
  - **Lot de base** (`70e93fa`, `0e326da`), au build, sans PHP ni Python : un catalogue des
    routes (`web/src/routes-catalogue.js`, une ligne par nom de route de `router.js`, avec les
    adresses que le menu ne montre pas et leurs modèles `#/jour/AAAA-MM-JJ`,
    `#/partage/<jeton reçu>`), confronté par les tests au routeur, au `switch` d'`App.jsx`, à
    l'aide et au menu de chaque session dans les deux modes (le mode n'est jamais un droit) ;
    une bibliothèque pure (`scripts/lib/site-map.mjs`, liste blanche de sources) d'où sortent
    `scripts/data/site-map.json` et le digest de l'assistant (famille « Compte » des deux
    sessions, adresses hors menu, aide de chaque page, titres des chapitres seulement ;
    environ 24 000 caractères, contre 6 500), puis au `prebuild` du front `llms.txt`,
    `llms-full.txt`, un `.md` par chapitre publié (43), `legal/confidentialite.md`,
    `sitemap.xml` (URL réelles seulement, jamais de `#/`) et `robots.txt`, tous gitignorés ;
    `.htaccess` (`.md` en `text/markdown`, cache d'une heure, compression) et `index.html`
    (lien `alternate` vers `/llms.txt`, bloc `<noscript>`, hash anti-FOUC inchangé).
    UC-VIS-05 RG4, UC-SYS-04 RG8, `docs/contrats.md` §12.
  - **Lots API A, C et D** (`3d1c204`) :
    - A, la page courante : `POST /api/tuteur` lit `site-map.json` (livré par `stage-api.sh`,
      `api/src/Tuteur/CarteDuSite.php`) et ne garde la rubrique que si la carte nomme la page :
      « Elle consulte actuellement : <titre> (<adresse>). », puis l'aide de cette seule page
      (variante V1, en plus du digest V2). Un nom inconnu, une route interne, une ligne de
      texte libre sont vidés : **UC-VIS-05 AN1 corrigée** (F17, qui figeait l'injection,
      prouve le refus ; 192 anomalies au catalogue). Sans carte (absente ou illisible), la
      rubrique est vidée, sans erreur (correctif de la revue, entrée ci-dessus : d'abord, un
      texte en forme de nom de route passait).
    - C, la mémoire courte : le panneau envoie les 2 derniers échanges du fil de l'onglet
      (`memoireCourte`), le serveur les relit avec la même règle (`Tuteur\MemoireCourte`) :
      paires question → réponse seulement, rôles `user` puis `assistant`, 750 caractères par
      message, 1 500 en tout ; un rôle `system`, une question restée sans réponse ou toute
      autre forme sont écartés ; mêmes vecteurs des deux côtés
      (`api/tests/fixtures/tuteur/memoire-courte.json`). Les échanges partent en tours de
      conversation avant la question (`AnthropicProvider::complete`, paramètre final
      facultatif : la démo envoie le même corps qu'avant), jamais dans la consigne ; rien
      n'est stocké côté serveur.
    - D, le modèle : Haiku 5.5 par défaut (`ModelLimits::HAIKU_PAR_DEFAUT`), `TUTEUR_MODEL`
      prioritaire s'il nomme un Haiku ; tarif (0,10 $ / 0,50 $) et `thinking: disabled`
      vérifiés dans le fournisseur existant, sans y toucher.
    - Tests : UC-VIS-05-U03, U04, U05, F02, F10, F17 et F20 ajustés ; U14 à U16, F21 et F22
      nouveaux (1 000 tests unitaires et 1 172 fonctionnels au catalogue). Fiche UC-VIS-05
      (RG1, RG6, RG7 nouvelle, A5, données), `docs/contrats.md` §12 (ce que l'API lit),
      `docs/securite-demo.md`.
  - **Vérifié** (toute la branche, fournisseur `mock` et faux client HTTP, aucun appel LLM) :
    la suite PHP complète, 1 779 tests, les 2 échecs connus sous PHP 8.5 seulement
    (`AuthActivationTest::testExpiredCodeIsRejected`, UC-CPT-02-U17), base
    `humanome_test_s11` ; les tests du tuteur seuls, 27 verts ; front 2 831 tests verts sur
    2 837 (6 sautés), un test de `Twin9View` (non touché) en échec une fois sous la charge de
    la suite PHP voisine, vert seul ;
    moteur 586 tests verts, plus les 5 échecs locaux connus (UC-PRO-08 F19 à F22 et F25,
    faux dépôt `Twin_v9`) ; `check-publiable` vert (crochet de commit).
  - **Non vérifié** : rien n'est déployé. Le service des fichiers par l'OVH (`curl -I` sur
    `/llms.txt`, un `.md`, `sitemap.xml` : statut 200, type MIME, cache), un `robots.txt` déposé
    à la main dans `www/` (la synchronisation l'écraserait : lister `www/` avant) ; les
    réponses de l'assistant sur un vrai modèle (recette facultative de 5 à 10 questions, par
    exemple « comment me connecter ? » → `#/compte`, « où voir mes factures ? » →
    `#/compte/credit`, « et ensuite ? » après une réponse : environ 0,01 $ sur Haiku 5.5) ;
    `npm run test:dist`, en échec avant ce sprint sur la vue merge retirée (D-38), qui contrôle
    pourtant d'abord les fichiers de la carte.
  - **Décisions laissées à Christian** : la politique `robots` au déploiement (`index`, ou
    `noindex` tant que le site sert de site de test) et la séparation des robots
    d'entraînement (refuser GPTBot, ClaudeBot, CCBot, Google-Extended…) de ceux de recherche ;
    les parcours publiés (aujourd'hui tous, `admin` et `promptologue` compris, déjà publics
    dans le bundle et sur GitBook) ; la recette en ligne ; le plafond de 2 M de tokens par
    jour du tuteur, codé en dur : avec Haiku 5.5 et le digest enrichi, c'est lui qui coupe le
    premier (environ 220 questions par jour, quand 1 $ en paierait environ 900) ; déployer
    l'API et le front depuis le même commit (deux chaînes régénèrent la carte, UC-SYS-04).

- 2026-10-22 — **Revue des lots D et E du sprint 5 : les constats confirmés sont corrigés (branche
  `feat/referentiel-markdown`, non fusionnée).** Seize commits : douze `fix:`, chacun avec le test
  qui échouait avant lui, deux `test:`, un `style:` sans test (aucun comportement ne change) et ce
  `docs:`. Le menu de navigation n'a pas changé.
  - **Codes faits de chiffres seulement** (« ## 1 — Lire ») : la page Markdown les refuse à leur
    ligne, et le serveur à tout niveau, à son pointeur (`ReferentielRepository::controlerCode`,
    `CHIFFRES_SEULS`), pour le JSON aussi. Le moteur Twin9 refuse une compétence ainsi codée, et
    tout niveau peut tenir lieu de compétence ; une version publiée ne se corrige plus. Le test
    Twin9 qui vérifie ce refus au lancement (`api/tests/Twin9/ReferentielMoteurTest.php`) écrit
    désormais sa version telle quelle en base, comme une version d'avant le contrôle : le serveur
    refuse ce qu'il publiait. Le message « code invalide » dit « lettres sans accent ».
  - **Lecture du Markdown** : les espaces insécables (U+00A0, U+202F) et un « Pôle » décomposé
    se lisent (texte composé en NFC, blancs `\p{Zs}`, comme `Text::WS` du moteur) ; un texte qui
    n'est pas en UTF-8 (un « texte brut » Windows-1252) est refusé au lieu d'importer des noms
    corrompus ; un titre indenté d'une à trois espaces et des « # » de fermeture se lisent comme
    en CommonMark.
  - **Aller-retour Markdown → JSON → Markdown** : exact pour un texte composé, aux blancs près
    autour d'une description ou de la provenance. Une description qui commence par des blancs
    puis « # » ou par « <!-- » (la couleur d'un pôle), une provenance vide, un nom qui finit par
    « # » reviennent. Ce que le format ne peut pas écrire (provenance contenant « --> », nom de
    niveau contenant une virgule, nom sur plusieurs lignes ou entouré de blancs) est refusé à
    l'export, nommé, au lieu d'être perdu en silence.
  - **Motifs** : un motif saisi que JavaScript ne lit pas (syntaxe PCRE : possessif, atomique,
    « (?i) ») n'est plus qu'un avertissement, et le serveur tranche ; `\p{Lu}` se lit (drapeau u).
  - **Atelier** : l'aperçu compte au niveau choisi (« 3 compétences au niveau « facette » ») et
    accorde ses nombres ; « Importer le Markdown » est `aria-disabled`, décrit par un résumé
    visible (« 2 erreurs empêchent l'import »), et l'activer porte le focus sur les erreurs ; les
    trois champs fautifs sont `aria-invalid` et reliés à leur erreur ; un nouveau fichier repart
    des noms et motifs de son texte, et le champ fichier se vide.
  - **Page publique** : l'API est attendue 5 s au plus, puis l'export statique répond (une API
    qui pend ne bloque plus la page) ; le catalogue n'est demandé qu'une fois ; après un échec, le
    menu montre le référentiel affiché, et choisir de nouveau celui qui a échoué le redemande ; au
    clavier, l'option parcourue ne s'affiche qu'à sa validation (Entrée, sortie du menu, une
    seconde sans touche) ; `fold()` retrouve son échappement `̀-ͯ`.
  - **Tests** : la fixture de contrat `schemas/fixtures/markdown/referentiel-markdown-contrat.json`
    (fictive) tient ce que la page envoie et déduit (UC-EPI-05-U27) ; le serveur en valide les
    documents à chaque niveau et compile les motifs en PCRE (U28). L'assertion tautologique de U17
    est remplacée. Les tests que la fiche UC-EPI-05 nommait U11 à U13 et F16 à F18 portent enfin
    leurs identifiants.
  - Documentation : UC-EPI-05 (statut, garanties, A7, E1, E6, E7, RG2, RG11, L2, code sollicité ;
    U17, U18, U21 à U28, F19, F20), UC-VIS-02 (garanties, étape 2, A7, A9, E5, RG4, RG6, limites ;
    U15 à U17), `docs/contrats.md` §9 et §10, le tableau des cas (1 004 et 1 163 identifiants).
  - **Vérifié** :
    - front : 2 768 tests verts (261 fichiers, `TWIN_V9_DIR` défini), lancés sur `ad02b32` : seule la
      documentation a changé depuis ; `npm run build` passe ;
    - moteur : 573 tests, 568 verts et les 5 échecs locaux connus (UC-PRO-08 F19 à F22, F25) ;
    - PHP : 1 778 tests par `phpunit-locked.sh` (base `humanome_test_s5de`), les 2 échecs connus dus à PHP 8.5
      (`AuthActivationTest::testExpiredCodeIsRejected`,
      `UcCpt02SeConnecterDeconnecterTest::testU17SessionCookieAttributes`) et une dépréciation de
      PHPUnit, hors des classes touchées (relancées avec `--display-deprecations` : aucune) ;
    - `check-publiable` ; le recomptage des identifiants distincts égale chaque ligne du tableau et
      son total ;
    - chaque `fix:` : son test lancé rouge avant la correction, vert après.
  - **Non vérifié** : rien dans un navigateur (ni l'atelier, ni la page publique) ; le
    comportement réel du menu au clavier sous Windows (Chrome, Firefox), que jsdom ne reproduit
    pas ; rien en production.
  - **Décisions laissées à Christian** :
    - le serveur refuse les codes faits de chiffres à tout niveau, y compris par
      `importPublishedDocument`, l'amorçage et la route d'import admin ; une version déjà
      enregistrée avec de tels codes ne se soumet, ne se publie ni ne se forke plus ;
    - le texte Markdown se lit en NFC : un nom décomposé relu composé change d'empreinte ;
    - un motif que la page ne lit pas n'est qu'un avertissement (« A)|(B » n'est plus signalé
      avant l'envoi ; le serveur le refuse, par pointeur) ;
    - les délais : 5 s pour l'API, 10 s de validité du catalogue, 1 s au clavier ; au clavier,
      la validation par Entrée, sortie ou pause plutôt qu'un bouton « Afficher » ;
    - le nouvel essai d'un référentiel introuvable en le choisissant de nouveau au menu ;
    - ce que le Markdown ne peut pas écrire est refusé à l'export plutôt qu'échappé (une virgule
      dans un nom de niveau, « --> » dans la provenance).

- 2026-10-22 — **Un multi-référentiel simple, suite : écrire un référentiel en Markdown dans
  l'atelier, et la page publique montre tout référentiel publié (sprint 5, lots D et E ; branche
  `feat/referentiel-markdown`, non fusionnée).** Trois commits, deux pour le lot D, un pour le lot E.
  Décisions de Christian, prises par délégation : le lot D tel que S5 §4 (modèles, import Markdown au
  format des fiches, aperçu, export), sans éditeur riche, sans formulaire pôle par pôle, sans
  dépendance npm ; pour le lot E, le menu « Référentiel » sur la page publique, qui lit l'API
  d'abord. Le lot C (choix du référentiel au lancement de Twin9) viendra après la PR
  multi-fournisseur.
  - **Lot D, concevoir un référentiel simplement** (atelier, section « Autres référentiels »).
    - `web/src/lib/referentiel-markdown.js`, sans DOM ni dépendance, lit le texte des fiches de
      pôle que le moteur écrit (`# Pôle N — Nom`, `## CODE — Nom`, `### CODE — Nom`…) en document
      `referentiel` 2.1.0, chaque erreur à sa ligne (titre mal formé, niveau sauté, doublon, pôle
      vide, numérotation, code hors motif ; BOM et CRLF acceptés). L'identifiant, le libellé et la
      version se saisissent dans trois champs. Le motif de chaque niveau est déduit des codes, le
      plus étroit compatible (`A1`…`E4` donne `[A-E][1-4]`, RESPIRE `[1-7]\.[0-1]\d`), affiché et
      modifiable.
    - L'atelier propose deux modèles à télécharger, Markdown et JSON, le JSON expliqué champ par
      champ dans la page. Une zone de texte a son aperçu : pôles, compétences, éléments, motifs,
      erreurs, et l'avertissement qu'un pôle nommé comme un pôle de RESPIRE en reçoit les jurés
      Twin9. L'import passe par `POST /referentiel/import`, avec ses refus par pointeur. « Exporter
      en Markdown » vaut pour toute version publiée, RESPIRE compris
      (`GET /api/referentiels/{id}/versions/{semver}`).
    - Markdown, puis JSON, puis Markdown : le même texte à l'octet et la même empreinte pour
      RESPIRE 7.0.0 et 7.1.0 et pour la fixture fictive à la forme Humanome (UC-EPI-05-U15, U16).
    - UC-EPI-05 : A7 à A9, E6, E7, RG11 à RG13, L2 ; U14 à U20, F19 à F22.
  - **Lot E, la page publique `#/referentiel` montre tout référentiel publié.**
    - Le menu « Référentiel » (`ReferentielChoice`) propose chaque référentiel publié à sa
      dernière version, RESPIRE par défaut. La page lit comme les parcours : la base par l'API
      publique d'abord, l'export statique en repli, RESPIRE embarqué en dernier. Elle n'est donc
      plus « zéro PHP », et une version publiée en production s'y voit aussitôt : la limite L1
      d'UC-VIS-02 ne vaut plus qu'en repli.
    - Le lien profond `#/referentiel[/<code>]?id=<id>` ouvre un référentiel ; RESPIRE n'a pas
      d'`id`. Le menu remplace l'adresse, sans entrée d'historique et sans le code d'une
      compétence ; les permaliens portent l'`id`. Un identifiant introuvable ou hors forme est dit,
      et RESPIRE s'affiche à sa place ; un lien de l'alerte rend l'adresse sans lui.
    - La provenance d'un autre référentiel (le `source` du document : d'où il vient, sa licence)
      s'affiche sous l'en-tête, même en repli sur l'export statique, qui ne la porte pas : c'est
      l'attribution CC-BY-SA de l'Humanome V18 (S5, E9) que l'entrée des lots A et B renvoyait au
      lot E. L'aide de la page dit ce qu'est l'Humanome V18.
    - Les définitions gardent leurs retours à la ligne ; celles de RESPIRE n'en ont pas.
    - Hors de la page : « Voir dans le référentiel », sous une compétence de la cartographie
      (`DetailPanel`), mène à la page du référentiel de la carte. Il menait à RESPIRE, où le code
      d'un autre référentiel était « introuvable ».
    - Le menu de navigation n'a pas changé : aucune entrée ajoutée.
    - Documentation : UC-VIS-02 (objectif, préconditions, garanties, étapes 2 et 3, A6 à A9, E5,
      RG4, RG6, RG7, code sollicité, L1 et limites ; U12 à U14, F18 à F21 ; F12 récrit, la lecture
      passant par l'API), UC-EPI-05 (garanties, L4), UC-EPI-03 (étapes 7 et 8, L1), UC-EPI-04 (L5),
      `docs/contrats.md` §9 et §10, `docs/referentiel-humanome.md` §1, le commentaire de
      `StaticExporter.php`, et le tableau des cas (990 et 1 160 identifiants).
  - **Vérifié** :
    - front : 2 755 tests verts (261 fichiers, `TWIN_V9_DIR` défini) ; moteur : 573 tests, 568
      verts et les 5 échecs locaux connus (UC-PRO-08 F19 à F22, F25) ; `npm run build` passe ;
      `check-publiable` (crochet de pré-commit) ;
    - PHP : PHPUnit non lancé, aucun code PHP ne change (un commentaire de `StaticExporter.php`,
      `php -l` sans erreur) ; la file des suites PHP de la machine était tenue par la suite
      complète d'une autre session ;
    - F18 échoue si le menu empile l'adresse dans l'historique au lieu de la remplacer (essayé) ;
    - dans le navigateur intégré, l'application construite, servie avec l'API sur la base de
      développement (RESPIRE 7.0.0 et 7.1.0, Humanome V18 amorcé) : le menu ; « Humanome V18 »
      choisi (adresse `?id=humanome`, 5 pôles, 20 compétences, provenance et licence) ; le lien
      `#/referentiel/B2?id=humanome` (B2 surligné) ; `?id=inconnu` (l'alerte, RESPIRE).
  - **Non vérifié** : rien en production ; la page sur un téléphone ; l'e2e Playwright
    (`web/e2e`) ; le lot D dans un navigateur (ses tests seulement).
  - **Décisions laissées à Christian** :
    - la page publique appelle désormais PHP à chaque consultation (`GET /api/referentiels` et
      `GET /api/referentiels/{id}/versions/{semver}`, le document mis en cache le temps de la
      page), ce que la règle « zéro PHP » de P4 excluait : c'est la conséquence du choix délégué de
      l'API d'abord ;
    - montrer les éléments d'un référentiel (les facettes de l'Humanome) et rendre le Markdown de
      ses définitions (« **Finalité** » s'y lit tel quel) ;
    - proposer les versions antérieures sur la page, qui ne montre que la dernière de chaque
      référentiel (l'historique reste dans l'API) ;
    - lot D : un formulaire pôle par pôle, si l'usage le demande ; un motif saisi à la main n'est
      pas gardé dans le Markdown exporté, il se déduit de nouveau.
- 2026-10-22 — **Sprints 1 et 4 de la liste de Christian : l'ergonomie et le « Mode expert »
  (lot 1), puis la journée d'une analyse qui en couvre plusieurs (branche
  `feat/ergonomie-et-journees`, issue de `main` à `fd6a16d`, `main` à `2a5984c` fusionné
  depuis).** Études du
  sprint 1 (ergonomie, mode expert, quatorze améliorations) et du sprint 4 (cause prouvée,
  correctifs T0 à T3). Décisions prises le 2026-10-22 par délégation de Christian : D1
  option A (le mode simple masque la « Cartographie ouverte », Twin6 ; l'échelle Essayer →
  Cartographier mes écrits → Analyse approfondie reste), D2 oui (« Comparaison » en mode
  expert), D3 défaut selon le rôle (simple pour un visiteur ou un apprenant seul, expert dès
  un rôle de travail), D4 dans le navigateur seulement (clé `humanome-mode`), D5 « Mode
  expert » ; améliorations 1 à 8, le mode expert, puis 10, 11 et 14 ; T1 et T2.
  - **Sprint 1, améliorations 1 à 8** (`1338988`, `2ae9808`), mobile d'abord, sans refonte
    graphique : cibles tactiles de 44 px au toucher ; « Fermer le menu » dans le tiroir
    (remplace la punaise sous 921 px) ; espaces de la cartographie sur une ligne qui défile
    sous 768 px ; `fix:` un compte connecté sans rôle gardait le menu d'un visiteur, sans
    déconnexion (UC-VIS-04 AN2, UC-CPT-02 AN4 corrigées) ; aide juste (entrée
    `configuration`, plus de chiffres en dur) ; le portfolio ne promet plus « bientôt »
    (UC-APP-01 A-03) ; « Monitoring » dans le menu admin ; sous-menus cartographe et
    promptologue sur le gabarit des onglets admin (`aria-current`).
  - **Mode expert, lot 1** (`4fb10ff`) : un réglage d'affichage, jamais un droit (aucune
    garde de vue, aucun code serveur ne le lit, toute adresse reste valide, aucune famille de
    rôle n'est masquée). Bascule « Mode expert » en bas du tiroir et ligne « Affichage » du
    compte. En mode simple : pas de « Cartographie ouverte » ; l'assistant de run nomme le
    protocole embarqué, sans liste de paquets ni champ « Modèle » (ce qui s'enregistre est
    ce qui tourne) ; Twin6 sans liste de modèles ; la cartographie sans onglet
    « Comparaison » (sauf ouvert par son adresse), sans tuile « Réglages », sans « Préparer
    une démo ». En mode expert, « Mes profils Twin9 » (`#/configuration`) entre au menu.
    `docs/ergonomie-navigation.md` §5ter, fiche UC-VIS-06.
  - **Améliorations 10, 11 et 14** (`4fb10ff`) : « Mes analyses approfondies » au tableau
    de bord de l'apprenant ; Twin6 part d'un portfolio de « Mes portfolios » (journées
    datées en feuilles `### AAAA-MM-JJ`, passages sans date comptés et laissés de côté) ;
    les guides montrent d'abord les parcours des rôles de la session.
  - **Sprint 4, T1** (`4e056c6`, journal de la cartographie, D-14 et D-66 amendées) :
    l'analyse rangée au 10 février de la démonstration retient 175 traces écrites du 1er
    au 9 ; l'interface le dit partout où elle montre la trace (« passage du mar. 3 févr. »
    dans la modale du 10, « trace de l'analyse du 10 février 2026 » et « Ouvrir la journée
    analysée » dans le volet du portfolio) ; une journée qui ne contribue pas dit pourquoi
    (trois messages) ; « run du … » au lieu d'« analysée le … ». Test de caractérisation
    écrit d'abord, puis inversé.
  - **Sprint 4, T2** (`ab0285d`, D-72, `docs/contrats.md` §4 point 15) : l'index écrit la
    date du passage d'une trace écrite un autre jour (`at`, facultatif ; écrit à l'import
    pour tout importeur, run Twin9 compris, depuis la revue). La modale du 3 février garde
    « Aucune analyse n'est rangée à ce jour. » et ajoute « Relevé par l'analyse du 10
    février » : les compétences, leurs preuves et indices de ce jour, un lien vers le 10 sur
    chacune — sans rien lire de plus (D-67). Gestionnaire : « relevée le 10 févr. »,
    « couvre 8 autres journées (1er–9 févr.) » ; anomalies d'information `couverte-par` et
    `analyse-multi-journees` (jamais « à traiter ») ; la case de la heatmap le dit à qui la
    lit. Une archive d'avant reçoit `at` de ses détails à l'import, un index au découpage.
    **Jeux déjà dans le navigateur : une passe unique à l'ouverture** (tous les détails lus
    une fois, dans la transaction qui écrit l'index ; version notée, `passageDates` ; jamais
    sur un jeu lu à la demande ; si elle échoue, le jeu s'ouvre tel quel), plutôt que
    « réimportez » : réimporter les mêmes fichiers n'aurait rien changé, une variante
    gardant son identifiant.
  - **Années sur deux chiffres** (`cf09e8b`, `1adfb06`, D-72, UC-APP-01 RG5 ter) : le
    découpage lit `### 02.03.26` comme le 2026-03-02, comme Twin9, et seulement dans les
    titres où Twin9 la cherche (des points, dans un titre `##` ou `###` en début de ligne) ;
    une ligne nue, un titre `#` ou `####` à `######`, un titre indenté, `/`, `-`,
    « 1er.03.26 » et trois chiffres restent du texte. Deux écarts à Twin9 demeurent,
    connus : il ne date rien sans au moins deux tels titres, l'interface ouvre une journée
    dès le premier ; une année sur quatre chiffres se lit dans l'interface sous tout niveau
    de titre (comme avant ce sprint). Sur les cinq portfolios fictifs de Twin9, les journées
    de l'interface sont les siennes (PLANT-01 : dix journées au lieu d'un bloc daté du
    jour ; les SYNTH-* : aucune des deux côtés), vérifié contre le moteur PHP ; les fichiers
    sont lus dans `TWIN_V9_DIR`, jamais recopiés ici (UC-APP-01-U22). **Effet sur le
    coût** : un portfolio titré ainsi n'est plus un seul bloc mais une journée par titre ;
    l'estimation et les appels d'une cartographie standard (« Cartographier mes écrits »)
    croissent d'autant — voulu, puisque ce sont les journées que Twin9 analyse.
  - **Revue du 2026-10-22 : sept constats confirmés, corrigés**, chacun par un test écrit
    d'abord, qui échouait :
    - `d5a7095` (deux constats) : l'import écrit `at` pour tout importeur, depuis le détail
      de chaque variante (`mergeIntoDataset`). Un run Twin9 (`twin9-run.js`, non touché, ne
      garde que `{id, role}`) l'a donc dès l'import, dans un jeu neuf comme dans un jeu déjà
      passé, et le jeu affiché par « Ouvrir dans l'interface » sans attendre une
      réouverture. Avant, seule la passe le lui donnait, et seulement dans un jeu pas encore
      passé : les mêmes données s'affichaient avec ou sans « Relevé par … » selon l'ordre
      des opérations. La passe ne sert plus qu'aux jeux rangés avant T2 ; `passageDates`
      reste 1 (la branche n'a jamais été déployée).
    - `1adfb06` (deux constats) : l'année sur deux chiffres ne se lit plus sous `#`,
      `####` à `######` ni dans un titre indenté, où Twin9 ne la lit pas (`^#{2,3}`) : la
      première version y ouvrait des journées que Twin9 n'ouvre pas, d'où le symptôme du
      sprint 4. Un portfolio synthétique aux titres de tous niveaux est comparé au moteur
      PHP (mêmes dates des deux côtés).
    - `ecfa955` : « couvre N autres journées » et `analyse-multi-journees` ne comptent plus
      les traces d'un verdict court-circuité ou « présence non établie », que « relevée
      le … » et la section de la modale ignoraient déjà.
    - `c1ce242` : la plage des journées couvertes se lit sans survol, au toucher et au
      clavier (« couvre 8 autres journées (1er–9 févr.) ») ; le nombre de traces reste au
      survol.
    - `e1c5b51` : `main` (`2a5984c` : PR A #26, référentiels simples #25, sans Python #27)
      fusionné dans la branche. Le validateur compilé n'est pas résolu à la main : il est
      régénéré (`node scripts/build-validators.mjs`), avec `at`, `passageDates` et les
      schémas Twin9 de `main`. Le catalogue des cas est recompté depuis les identifiants des
      tests (60 cas, 988 tests unitaires, 1 167 fonctionnels, 193 anomalies). Les deux côtés
      avaient créé un UC-APP-02-F27 : celui de `main` le garde, le mode simple devient F29.
      `SOURCE_LABELS` avait deux clés `twin9` : « Twin9 (serveur) », de `main` et documenté
      par UC-APP-10, est gardé. Le test Twin9 de `main` attendait « analysée le », devenu
      « run du » (C10).
  - **Vérifié** (après la revue et la fusion de `main`) : front 2 828 tests verts (264
    fichiers, avec `TWIN_V9_DIR` : rien de sauté ; `main` a retiré des tests Python de
    `web/src/lib/twin9/py`) ; moteur 586 tests, dont les 5 échecs locaux connus
    (UC-PRO-08 F19 à F22 et F25), parité des années sur deux chiffres jouée contre le
    moteur PHP de `TWIN_V9_DIR` (après `npm ci` du moteur : `main` y ajoute `yaml`) ; PHP
    `ValidationTest`, `ConformiteTest`, `CartoPartageTest` et `UcVis04SeRepererTest` verts
    (46 tests, base `humanome_test_s1`) ; `check-publiable` vert. Avant la fusion, au fil
    des lots : e2e navigation-burger, carto-export, carto-soleil, guides-public. La plage de
    la démonstration (« couvre 8 autres journées (1er–9 févr.) », 175 traces, toutes
    établies ou à revoir) recalculée sur son document-jour du 10 février
    (`web/public/data/demo/jours/2026-02-10.json`), importé dans un jeu neuf.
  - **Vérifié aussi, avant la PR** : la suite PHP complète après la fusion (1 776 tests,
    les 2 échecs connus sous PHP 8.5 seulement) ; dans un navigateur, à 375 px, sur la
    démonstration : le tiroir (« Fermer le menu », pas de punaise), la bascule « Mode expert »
    (gardée, le tiroir reste ouvert ; « Comparaison » absente en mode simple), la modale du
    3 février (« Aucune analyse n'est rangée à ce jour. », « Relevé par l'analyse du 10
    février », neuf compétences), la ligne du 10 dans le Gestionnaire (« couvre 8 autres
    journées (1er–9 févr.) ») et « passage du mar. 3 févr. » sous 6.08 dans la modale du 10.
    Un test instable de `main` réparé au passage (`MonitoringSection` : deux requêtes en
    course, `root@b.fr` affiché deux fois).
  - **Non vérifié** : le volet du portfolio de T1 dans un navigateur ; les e2e
    `carto-soleil` et `carto-export`, pas relancés pour T1 ni T2 ; la passe dans un vrai
    IndexedDB (testée avec le magasin en mémoire) et sa durée sur une démonstration devenue
    locale (environ 17 Mo de détails) ; e2e `parcours-apprenant` (API locale) ; aucun e2e
    relancé après la fusion de `main` (qui a touché `global.css`, `help/registry.js`,
    `RunWizard.jsx`, `Twin6OuverteView.jsx`). Ouvert, dans `main` déjà : deux tests UC-APP-09-F31 (A4 du sprint 5 et E5),
    non renumérotés ici.
  - **Après les PR Twin9** : le lot 2 du mode expert (liste des profils de `Twin9View`) ;
    S4 T0 (envoyer à Twin9 des en-têtes que l'interface lit pareil), C3 (deux cartes Twin9
    le même jour) et C4 (« établie par faisceau »).
  - **À faire à distance (feu vert de Christian)** : redécouper la démonstration
    (`node web/scripts/carto-demo-split.mjs`, qui écrit `at`) puis la redéployer — d'ici
    là, son 3 février dit « Aucune analyse n'est rangée à ce jour. » sans le lien ; et
    déployer le front (aucune migration ; le schéma n'ajoute que des champs facultatifs à
    un contrat ouvert, l'ordre de déploiement est libre).
  - **Pas fait, voulu** : améliorations 12 (familles de rôle repliables) et 13 (thème dans
    le tiroir au téléphone), l'accessibilité est à revoir avec le sprint 9.
  - **Décisions laissées à Christian** :
    - **T3, répartir les traces par date de passage** : seul ce palier répond à « je ne
      devrais pas voir les compétences d'une autre journée ». Mais le statut et la
      confiance d'un verdict rendu sur neuf journées seraient recopiés sur chacune, pas
      mesurés (6.08 « établie » au 3 février sur une seule preuve) ; une journée qui a sa
      propre analyse imposerait un choix (l'analyse propre l'emporterait) ; le kairos et
      les rapports de pôle resteraient globaux. Variante minimale : répartir hors ligne la
      seule démonstration, l'interface inchangée.
    - Le nom d'un run Twin9 dans la provenance : « Twin9 (serveur) », de `main` (PR A),
      gardé à la fusion plutôt que « Twin9 » (sprint 4, C11) ; une ligne de
      `SOURCE_LABELS` (`Manager.jsx`) et deux tests à changer s'il préfère l'autre.
    - D4 V2 (le mode retenu par compte, et non par navigateur) : avec le sprint 8 (rôles
      auto-attribués) ; et une seule vue « journée » à garder (`#/jour/<date>` historique
      et `#/cartographie/jour/<date>`).

- 2026-10-22 — **Sprint 2, lot D : plus rien de Python dans humanome.xyz, et la production le
  vérifie (branche `chore/sans-python`, non fusionnée).** Le Sprint 2 (liste de travail de
  Christian, hors dépôt) demandait s'il restait du Python, s'il servait, et pourquoi il n'était pas
  converti. humanome.xyz n'en contenait déjà plus aucun fichier ; tout le Python est dans
  `Twin_v9` : la v9.8, étalon de l'oracle, gelée au tag `v9.8-reference` (décision 1 du Sprint 2,
  prise par délégation). Les lots A à C l'ont documenté dans `Twin_v9` (README, tag,
  `ReferenceTest`), où ils sont fusionnés ; la moitié humanome.xyz du lot B, l'amendement de
  l'ADR-011, manquait : ce lot la fait, et nettoie ce qui restait ici. Sept commits, dont cinq
  pour la revue ; `Twin_v9` n'est pas modifié.
  - **ADR-011 §1 amendé** (et sa ligne Statut), sans rien écrire au-dessus de « ## Statut », où
    l'ADR-012 de `feat/twin9-multi-fournisseur` pose son bandeau (`git merge-tree` avec cette
    branche : aucun conflit). L'amendement remplace « si elle évolue, l'oracle se régénère » : la
    v9.8 est gelée au tag `v9.8-reference` ; l'algorithme évolue dans le moteur PHP, chaque
    changement étant un écart voulu listé dans `OracleTest`, avec son test ; l'oracle n'est
    régénéré que si la v9.8 change, ce que `ReferenceTest` détecte.
  - **Documentation.** `docs/cahier-des-charges.md` §5 (« Système de prompts ») et §9 : une
    note datée, *ajoutée* sans rien réécrire, puisque le cahier est la spécification de
    Christian. Seul Twin9 a été converti : le pipeline Python de cartographie n'ayant jamais été
    livré, `engine/` (P5, juillet 2026) a été rétro-conçu depuis les artefacts ; Twin9 a été
    porté depuis sa v9.8 Python, en JavaScript (ADR-010), puis en PHP (ADR-011) ; la v9.8 reste
    l'étalon, dans `Twin_v9`, hors production. `docs/plan-prompts.md` (prérequis) : `assets-existants/prompts-python/`
    n'a jamais été versé. Il manque à l'inventaire de P0, au dossier `assets-existants/` du poste
    et aux 416 commits accessibles de toutes les branches. `CLAUDE.md`, contraintes d'hébergement :
    « Pas de Python, ni en production ni dans la CI ».
  - **`web/src/lib/twin9/py/` réduit à ce que lit le parseur des fiches de pôle**
    (`referentiel.js`) : `PY_WS_CLASS`, `pyStrip`, `pyFormat` et leurs dépendances (`pyStr`,
    `pyRepr`, `pyFloatRepr`, `PyFloat`, `formatFixed`). Partent, avec leurs tests, quatorze
    exports morts, vestiges du moteur du navigateur (T11) : `pyRound`, `pyFloor`, `pyInt`,
    `pyMod`, `pyDivmod`, `pyReprTuple`, `pyIsSpace`, `pyLStrip`, `pyRStrip`, `pySplitlines`,
    `universalNewlines`, `cpLen`, `cpSlice`, `u16ToCpIndexer`. Chaque nom et chaque chemin de
    module a d'abord été cherché dans tout le dépôt, imports dynamiques et scripts compris : aucun
    usage hors de son fichier et de ses tests. Le test exhaustif de `PY_WS_CLASS` (U+0000 à
    U+3100), qui prenait `pyIsSpace` pour oracle, compare désormais à la liste des 29 points de
    code ; un test pareil couvre `pyStrip`.
  - **`stage-api.sh` refuse le Python.** Après `composer install`, un `.py` ou un `.pyc` dans la
    release (sources, moteur Twin9, `scripts/data`, `vendor/`) fait échouer la préparation,
    code 1. Le script nomme les fichiers et supprime `build/api-release` : `deploy.mjs api`
    refuse alors de déployer. UC-SYS-02 : E13, F26 (le script lancé sur une copie jetable, avec de faux
    `node`, `composer` et `git`) ; UC-SYS-04, étape 7 et Limites ; `docs/deploiement.md`.
  - Vérifié :
    - **Suites.** Front 2 711 tests verts (259 fichiers, `TWIN_V9_DIR` défini). Sur `main`, la même
      suite en comptait 2 794 : les 83 tests des exports retirés partent. Dans `src/lib/twin9` :
      99 tests au lieu de 182. Moteur : 557 tests verts, F26 comprise, et les 5 échecs locaux
      connus d'UC-PRO-08 (F19 à F22, F25).
    - **F26 voit les fautes.** Elle échoue sans le contrôle, et s'il précède Composer.
    - **Mêmes sorties qu'avant.** `import-protocole.mjs --dry-run` donne une sortie identique
      (22 gabarits, 7 pôles). `parsePole`, sur les 7 fichiers de pôle de la v9.8, donne la même
      empreinte (61 compétences). `extract-fiches.mjs` : parité 7 sur 7, `fiches-v7.json`
      inchangé. `generate-fiches.mjs` : les 7 `P*.md`, identiques octet pour octet à ceux du code
      d'avant. `web/public/data/` est ignoré par git : un `git status` vide n'aurait rien prouvé.
    - **Construction et préparation.** `npm run build` passe. Le vrai `stage-api.sh` a tourné en
      local : release de 809 fichiers (moteur `9eea3a1`, `vendor/` compris), contrôle passé,
      aucun Python.
    - **`check-publiable`** : OK (crochet de pré-commit).
    - **PHPUnit** : non lancé, le lot ne touche aucun PHP.
    - **Revue.** Quatre constats, tous de documentation : l'ADR-011, la note du cahier sur
      `engine/`, l'étape 7 d'UC-SYS-04, et des renvois de cette entrée à des documents hors
      dépôt. Corrigés par des commits `docs:` : aucun test ne peut échouer avant une
      correction de texte. Relancés après ces corrections : le front (2 711 tests verts,
      259 fichiers), le moteur (557 verts, mêmes 5 échecs d'UC-PRO-08), `npm run build` et
      `check-publiable` ; pas les contrôles de sorties ni le vrai `stage-api.sh`, qu'aucun
      texte ne touche.
  - Non vérifié : le contenu réellement déployé sur l'OVH (pas d'accès FTP) ; F26 sous Linux
    (CI), lancé seulement sur le Mac.
  - Laissé à Christian, deux questions du Sprint 2 :
    - garder ou supprimer `bench9.py`, `tests/tests.py` et `genere_protocole.py` dans `Twin_v9` ;
    - l'outil local `--donnees-reelles` sert-il encore hors de la plateforme ?
  - Laissé tel quel :
    - `docs/plan-prompts.md:266` (le prompt de P5) et `docs/inventaire-assets.md:84`, des
      journaux de construction, citent encore `assets-existants/prompts-python/` ;
    - le compteur d'UC-SYS-02 dans `docs/cas-utilisation/README.md` ne compte pas F26, puisque
      la PR #25 répare ce tableau ;
    - le corps du commit `5f417e0` dit encore que les prompts ont été convertis (`engine/`,
      P5) : l'historique n'est pas réécrit. Écrits avant ce lot, l'ADR-001 (« portage JavaScript des
      prompts Python ») et l'en-tête d'UC-SYS-04 (« système de prompts converti en JavaScript »)
      gardent la même formule.

- 2026-10-22 — **Revue des lots A et B du sprint 5 : quatre constats corrigés (branche
  `feat/referentiels-simples`).**
  - **L'amorçage, idempotent pour de bon.** Le même YAML (même sha256) converti sous un autre nom
    — le `humanome_v18.yaml` de respire.school après la copie de `humanotwin` — ou avec une autre
    `--url` était refusé comme « autre contenu », et le message demandait une version qui n'existe
    pas en amont.
    - La comparaison laisse désormais `source`, la provenance, de côté. La ligne publiée garde
      celle du premier amorçage.
    - Rejoué sur le vrai YAML, sur la base de test : « amorcé », puis « déjà amorcé » pour la
      copie renommée et pour une autre `--url`.
  - **La production a les garde-fous de l'amorçage.** `POST /api/admin/import-referentiel`, seul
    chemin hors vote en production, ne comparait que l'empreinte : une autre description sous la
    même version y passait pour « unchanged ».
    - La route amorce désormais tout autre identifiant que `respire` par `AmorcageReferentiel`,
      déplacé dans `api/src/Referentiel` (la release n'embarque que `api/src`) : `409` dans ce cas,
      `422` pour un identifiant invalide. RESPIRE garde le chemin de `deploy.mjs api`.
    - La commande de `docs/referentiel-humanome.md` §5 ne met plus le jeton sur la ligne de
      commande : `sed` le lit dans `.env.deploy`, curl le reçoit par `-H @-`.
  - **Le menu et le parcours d'accord, même sans RESPIRE.** Sur une base qui n'a pas publié RESPIRE
    (amorcée de l'Humanome seul), le menu montrait l'Humanome et le run chargeait RESPIRE. Le
    premier référentiel de la liste devient alors le choix, jamais sous un run en cours : le
    parcours le charge, la masse l'envoie (`referentielId`).
  - **La provenance visible** (S5, E1 et E9).
    - `GET /api/referentiels` donne la `source` de la dernière version de chaque référentiel.
    - Le menu l'affiche sous lui pour tout autre référentiel que RESPIRE (« Provenance : … ») ;
      rien en repli sur l'index statique, qui ne la porte pas.
    - L'aide de l'espace, de Twin6 et de l'établissement dit que « Humanome V18 », s'il est
      proposé, est le référentiel de respire.school, sous CC-BY-SA Harmonia Éducation, et non
      RESPIRE v7.
  - Chaque correction porte le test qui échouait avant elle (`ReferentielAmorcageTest`,
    `AdminImportReferentielTest`, `ReferentielChoice.test.jsx`, UC-APP-02-F28, UC-ETA-03-F31,
    `referentiel.test.js`, `registry.test.js`, les formes du catalogue). Documentation :
    `docs/referentiel-humanome.md`, `docs/contrats.md` §9 et §11, UC-EPI-05 (A6, L6, F16 à F18),
    UC-APP-02 (A7, F28), UC-ETA-03 (A8, F31), UC-SYS-02 (E5).
  - **Vérifié** : PHP 1 736 tests, les 2 échecs connus dus à PHP 8.5 (`AuthActivationTest::
    testExpiredCodeIsRejected`, `UcCpt02…::testU17SessionCookieAttributes`) ; moteur 430 tests, les
    5 échecs locaux connus (UC-PRO-08 F19 à F22, F25) ; front 2 775 verts (6 ignorés) ;
    `check-publiable` propre. La commande de production, jeton compris, contre un serveur local
    factice. Lancée en même temps que les suites JS, la suite PHP a aussi vu échouer trois tests
    sensibles à la charge (`PariteTest::testTheRealRun`, `EtablissementRunsTest`, UC-APP-10-F14),
    verts seuls puis dans une seconde suite complète.
  - **Non vérifié** : rien en production ; la ligne de provenance et l'aide n'ont pas été vues dans
    un navigateur, seulement par les tests.
  - **Décisions laissées à Christian** : en production, l'atelier (vote) ou la route d'amorçage ;
    l'attribution CC-BY-SA sur la page publique multi-référentiel (lot E).
- 2026-10-22 — **Un multi-référentiel simple : les menus lisent la base, et l'Humanome V18 de
  respire.school entre (sprint 5, lots A et B ; branche `feat/referentiels-simples`).** Christian
  (TODO, sprint 5) : « Je ne vois pas https://respire.school/referentiel par exemple dans les choix
  possibles. C'est à ajouter impérativement. »
  - **Le diagnostic** (analyse S5) : la plateforme sait cartographier tout référentiel (T15 à
    T17), mais respire.school publie l'**Humanome V18** (`humanome`, 5 pôles lettrés, 20 capacités,
    64 facettes), pas le RESPIRE v7 de la plateforme. Son YAML n'entrait pas dans l'atelier, qui ne
    lit que du JSON. Et les menus des parcours lisaient l'index statique, exporté de la base de
    développement d'un poste : même publié en production, un référentiel n'y serait pas apparu.
  - **Lot A, les menus lisent la base.**
    - `GET /api/referentiels/{id}/versions/{semver}`, public, en lecture seule, sert une version
      **publiée** de tout référentiel : jamais un brouillon ni une proposition, ni une autre graphie
      (`404`).
    - `web/src/data/referentiel.js` lit l'API d'abord (catalogue et document), puis l'export
      statique, puis le RESPIRE embarqué. La page publique `#/referentiel` reste statique.
    - Les cartographies standard, ouverte (Twin6) et de masse proposent donc un référentiel dès sa
      publication, sans export ni redéploiement.
    - UC-APP-02, UC-APP-09, UC-ETA-03, UC-EPI-03, UC-EPI-05, UC-PRO-06, UC-EMP-01, UC-CAR-06,
      `docs/contrats.md` §9 et §11, `docs/autorisations.md`.
  - **Lot B, l'Humanome V18.** Décisions de Christian, prises par délégation : amorçage plutôt que
    vote (Q1), niveau capacité (Q2), rubriques du YAML sans rien inventer (Q3), palette fixe par
    rang (Q4), pas de jury propre (Q5), l'en-tête faux signalé (Q6).
    - **Le convertisseur** : `engine/src/referentiel-humanome.js`, sans DOM, et
      `scripts/convertir-humanome.mjs`.
      - Le paquet `yaml` 2.9.1 (ISC, sans dépendance) est une dépendance de développement du
        moteur : rien ne part sur l'OVH.
      - Il donne `humanome` 18.0.0-proposition.1, « Humanome V18 », les capacités pour
        compétences et les facettes pour éléments. Le niveau facette est en option.
      - Les descriptions sont composées des rubriques du YAML, en gras, jamais en titres :
        définition, finalité, savoirs pratiques, participation avec l'IA, frontière, limites,
        situation, relance, ancrage obligatoire ; pour une facette, manifestations et faux positif.
      - `source` porte la provenance : page, fichier, sha256, convertisseur, licence CC-BY-SA.
      - Il écrit dans `build/referentiels/`, jamais déployé, et refuse `respire`.
    - **L'amorçage** : `scripts/amorcer-referentiel.php` publie hors vote.
      - Il est idempotent sur le document **entier** : `importPublishedDocument` ne compare que
        l'empreinte, qui laisse les descriptions de côté.
      - Il refuse RESPIRE, une version déjà en base avec un autre contenu ou tenue par l'atelier.
    - **Les tests** portent sur une fixture **fictive** (`schemas/fixtures/referentiel-humanome-fictif.yaml`
      et les deux documents qu'en tire le script) : aucun vrai référentiel dans le dépôt.
    - **La documentation** : `docs/referentiel-humanome.md` (règles, procédure locale et de
      production, écarts de la source, mesures), UC-EPI-05 (A6, L2, L6, U11 à U13, F16, F17),
      `docs/contrats.md` §9, `INSTALL.md` §3.
  - **Fait sur le poste.** La base de développement (`humanome`) était vide : migrations, RESPIRE
    7.0.0 et 7.1.0 (`INSTALL.md` §3), puis l'Humanome converti de la copie de `humanotwin`.
    - Le second amorçage dit « déjà amorcé ».
    - Par `php -S` : `GET /api/referentiels` liste « Humanome V18 » et RESPIRE, et la version
      servie est le document converti, à l'identique (5 pôles, 20 compétences, 64 éléments).
    - L'export statique n'a pas été relancé.
  - **Relevé dans la source (Q6)** : son en-tête `referentiel.structure` annonce 18 capacités,
    57 facettes, `[3,4,4,4,3]` et `[9,14,12,12,10]` par pôle et 114 manifestations. Le contenu en
    compte 20, 64, `[4,4,4,4,4]`, `[12,14,12,12,14]` et 128. Le convertisseur compte dans le contenu
    et avertit.
  - **Mesures** : la fiche de scan d'un pôle Humanome pèse 17,4 à 20,3 Ko, contre 12,9 à 19,2 Ko
    pour RESPIRE. Twin9 réserve d'après la taille réelle des fiches.
  - **Vérifié** : PHP 1 734 tests, les 2 échecs connus dus à PHP 8.5 (`AuthActivationTest::
    testExpiredCodeIsRejected`, `UcCpt02…::testU17SessionCookieAttributes`) ; moteur 430 tests, les
    5 échecs locaux connus (UC-PRO-08 F19 à F22, F25) ; front 2 769 verts (6 ignorés) ;
    `check-publiable` propre.
  - **Non vérifié** :
    - le fichier converti n'a pas été comparé à l'octet à celui de respire.school, qui n'a pas été
      téléchargé : même identifiant, même version, même date ;
    - rien en production ;
    - aucun run Twin6 ni Twin9 sur l'Humanome, à 0 appel ;
    - les menus n'ont pas été ouverts dans un navigateur : tests et routes seulement.
  - **Décisions laissées à Christian** :
    - en production, l'atelier (vote) ou la route d'amorçage (`docs/referentiel-humanome.md` §5,
      qui a depuis les garde-fous du script : entrée ci-dessus) ;
    - signaler l'en-tête faux à Stéphane ;
    - le contrat de lecture de l'Humanome, que le schéma ne porte pas (S5, E8) ;
    - un jury pour ses pôles, plus tard (Q5).
    - Viennent dans une PR suivante : le choix du référentiel au lancement de Twin9 (lot C) et la
      création simple d'un référentiel (lot D).

- 2026-10-22 — **Twin9, P0 : un run garde sa configuration et son exécution, une sortie tronquée
  est une panne, la voie directe ne rejoue plus une passe à chaque réponse (branche
  `feat/twin9-p0-configuration`, PR A du plan « P0 et multi-fournisseur », non fusionnée).**
  Première des trois PR de la spécification v2 du plan : A (Twin9, plateforme : C0 à C4), B (les
  arrêts normalisés et la troncature explicite des adaptateurs JS, la configuration de l'export
  Twin6 : indépendante), C (le multi-fournisseur, après la fusion de A). Cinq commits, un par lot ;
  `Twin_v9` n'est pas modifié.
  - **C0 — chaque appel dit son fournisseur et sa voie, sans changement de comportement.**
    Registre `Twin9\Fournisseurs\Fournisseurs` : six fournisseurs (Anthropic, OpenAI, Mistral,
    Google, xAI, OpenRouter), leur étiquette RGPD, leur voie par lots, leur adresse verrouillée ;
    seul Anthropic est ouvert, aucun autre n'est câblé. `CallSettings::pour()` rend
    `{fournisseur, voie, modele, budget_sortie, effort, reflexion}`, `resume()` les réglages du run
    par étage (lus dans les étages eux-mêmes), étape, second ressort et lecteur ; plus
    d'`ETAGES[null]` pour une étape inconnue (dépréciation de PHP 8.5). `EmpreintesFigeesTest`
    fige, avec des gabarits et un référentiel inventés, l'empreinte des réglages, celle des
    réglages du moteur et la signature des évaluations du profil v9.8, relevées avant le
    changement : elles doivent rester vertes jusqu'au bout de la PR C, sans quoi la mémoire des
    cartes serait réinstruite et repayée.
  - **C1 — une sortie tronquée est une panne (P0-2).** Un arrêt d'Anthropic sur `max_tokens` (le
    budget de sortie de l'étape atteint) ou `model_context_window_exceeded`, par appel direct comme
    par lot, donne une panne définitive — ni relance, ni resoumission —, payée à son coût réel, au
    message écrit par le code ; sa journée n'entre pas dans la mémoire, et le run suivant la
    réinstruit. Écart voulu avec la v9.8, qui prenait le texte coupé pour une réponse
    (`docs/contrats.md` §8, avec le conseil d'augmenter le `budget_sortie` de l'étape). Compteur
    `tronques` (au total et par étape, une part de `pannes`) ; la raison d'arrêt est assainie
    avant d'être gardée (`^[A-Za-z_]{1,32}$`, sinon `other`) et classée
    (`Fournisseurs\Arret` : `end`, `max_tokens`, `context_window`, `refusal`, `other`).
  - **C2 — la voie directe ne rejoue une passe que si les appels déjà connus ne remplissent pas
    une place (P0-4).** Mesuré sur le scénario 02-cloud de l'oracle par le tick (vrai moteur,
    profil v9.8, 6 appels directs, 10 journées de front, l'oracle répondant un appel à la fois) :
    75 passes et 1,9 s de moteur au lieu de 2 743 et 35,5 s, les mêmes 2 740 appels, chacun une
    fois, les sorties de l'oracle. Un run par lots joue toujours une passe par tick.
  - **C3 — la configuration et l'exécution d'un run, côté serveur (P0-1).** Migration
    `031_twin9_configuration.sql` (expand : `configuration`, `execution`, `passes`,
    `moteur_ms`). La **configuration** (`RunConfiguration`, liste blanche) est écrite une fois, au
    lancement, dans le verrou d'admission : les réglages de chaque appel, les fournisseurs
    atteints et leur étiquette, le collège, les backends, l'algorithme, le référentiel et le jeu
    de gabarits par identifiant, version et empreinte, les prix tels que facturés, les versions du
    moteur ; jamais un gabarit, une fiche, une clé, la marge ni un prix catalogue ; une reprise ne
    la change pas. L'**exécution** (`RunExecution`) est figée par `terminer()` — sous SAVEPOINT :
    un échec laisse le run finir, l'exécution nulle — et lue dans le journal sinon ; ses totaux
    sont ceux des compteurs, ses tables des objets même vides, ses reprises datées. Le suivi n'en
    porte que `configuration_empreinte` (la page l'interroge sans cesse) ; `resultats.run` et
    l'export du compte portent les deux blocs, un cartographe lié sans prix, coût, plafond, budget
    de reprise ni clé ; l'export omet un bloc nul, et l'archive d'un compte qui a un run ancien
    reste valide. Schéma `schemas/twin9-run.schema.json` (blocs stricts), référencé par
    l'archive ; `twin9-run` connu des validations PHP et JS (validateurs recompilés) ; fixture
    inventée ; `docs/contrats.md` §8.9, `docs/rgpd-registre.md` §13.
  - **C4 — la configuration dans l'interface.** Sur la page d'un run lancé depuis, « Configuration »,
    à côté de l'attestation, qui ne change pas (`web/src/views/twin9/ConfigurationDuRun.jsx`) :
    lue dans les résultats du run à l'ouverture seulement, relue quand il change de statut ;
    chaque rôle (étage, étape, étape au second ressort, lecteur du collège) avec son fournisseur
    et son étiquette RGPD, sa voie, son modèle et son budget de sortie ; le jeu de gabarits, le
    référentiel, la clé ; puis appels, pannes et sorties tronquées par fournisseur et par voie,
    passes du moteur, lots, coût, et le conseil d'augmenter le budget de sortie d'une étape dont
    une sortie a été tronquée. Une ligne manque quand son champ manque (la vue d'un cartographe
    lié). Ouvert dans la cartographie, l'importeur ne garde des deux blocs qu'une liste blanche,
    champ par champ, sous « <run>|configuration » — l'empreinte, les fournisseurs (voie,
    étiquette), les réglages des appels, le référentiel, le nom du jeu, les comptes d'appels —,
    sans la compter comme une délibération ; chaque journée dit ses modèles et son jeu (« Twin9
    (serveur) — twin9:7 — profond: …, rapide: …, lecteurs: … — gabarits v9.8 »). Ni prix, ni coût,
    ni plafond, ni clé, ni l'admission de l'attestation n'entrent dans le jeu, qui se partage et
    s'archive : vérifié jusqu'au jeu exporté. UC-APP-10 : étape 8, RG13, RG14, U14, U15, F21 ;
    `docs/contrats.md` §8.4 et §8.9.
  - Vérifié, sur l'arbre du dernier commit (PHP 8.5.12 et MySQL 8.0 locaux) : PHP `Tests: 1760,
    Assertions: 18629`, les 2 échecs connus de PHP 8.5 seuls
    (`AuthActivationTest::testExpiredCodeIsRejected`,
    `UcCpt02…::testU17SessionCookieAttributes` : la clé `partitioned`), 1 dépréciation (2 sur `main`), `PariteTest` compris (vrai moteur,
    `../Twin_v9` : 10 tests verts, aussi lancé seul). Une première passe, lancée en même temps
    que les suites JS, a vu `PariteTest::testTheTestModeByBatchesKilledBetweenTwoBatches` ne pas
    finir en 100 tranches ; il passe seul et dans la suite relancée sans autre charge : sensible à
    la charge du poste, à surveiller. Front 2 777 tests verts (259 fichiers) ; moteur 421 tests, 416 verts et les 5 échecs locaux connus d'UC-PRO-08 (F19 à F22,
    F25 : le faux dépôt `Twin_v9` de ces tests ne se crée pas sur ce poste) ; `check-publiable` OK
    (crochet de pré-commit) ; catalogue des cas recompté sur les fichiers de tests (979 unitaires,
    1 144 fonctionnels).
  - Non vérifié : la syntaxe sous PHP 8.2 (pas de PHP 8.2 sur ce poste ; la CI le dira — une
    recherche des tournures de PHP 8.3 et plus dans le diff ne trouve rien) ; le bout en bout
    (Playwright) ; « Configuration » dans un vrai navigateur (jsdom seulement) ; aucun run réel
    chez Anthropic : la porte payante du plan (un run par lots puis un en direct, en mode test,
    budget de 2 $ : configuration remplie, exécution figée, coût réel sous la réserve, passes
    nettement sous les appels en direct) reste à faire, au feu vert de Christian.
  - **Revue de la PR A (2026-10-22), constats confirmés corrigés** (un commit `fix:` par thème,
    chacun avec le test qui échouait avant lui ; trois trous de test comblés par un commit
    `test:`, et un second rend un test du déploiement indépendant de l'horloge) : (1) un run fini par la release précédente après un retour arrière garde dans
    `execution` ses seules reprises : ce n'est jamais servi ni exporté comme un bloc figé
    (`RunRepository::figee`), l'archive du compte reste valide ; (2) un lecteur nommé « 0 » ne fait
    plus des tables de `configuration.appels` une liste ; (3) l'empreinte de la configuration
    comprend un **sel** tiré au lancement, que seul le propriétaire lit : un cartographe lié ne
    retrouve plus par essais la marge, la clé, le budget et la durée (les deux autres empreintes
    qu'il lit, `empreinte_reglages` et `signature_evaluations`, ne couvrent ni clé, ni plafond, ni
    marge, ni prix : vérifié dans `CallSettings::empreinte` et `Evaluations::comparables`) ;
    (4) chaque passe du moteur
    est comptée dès qu'elle est jouée (un tick mort ne perd que la sienne) ; `avance()` ne touche
    plus les colonnes de 031 ; (5) `deploy.mjs api` migre aussitôt après le pointeur et élague
    ensuite (la fenêtre où la nouvelle release tourne sur l'ancien schéma tombe des minutes de
    l'élagage à une requête ; elle ne peut pas disparaître : la route `migrate` est celle de la
    release en ligne) ; (6) « Configuration » est montée pour tout run (l'exécution partielle d'un
    run d'avant 031 s'y lit), relit ses comptes à chaque ouverture d'un run en cours, et le conseil
    des sorties tronquées nomme leurs étapes et dit son coût : un autre budget de sortie change
    l'empreinte des réglages, et toute la carte est instruite de nouveau ; (7) tests : la voie lue à
    `custom_id` (run par lots annulé), `execution_prevue` hors des valeurs par défaut, la pose de
    `plein` par `envoyer()` (UC-APP-10-U16 : les étapes du moteur nommées par le conseil, celles de
    `CallSettings::ETAPES`). Vérifié sur l'arbre du dernier commit : PHP `Tests: 1761, Assertions:
    18675`, les 2 échecs connus de PHP 8.5 seuls, 1 dépréciation ; `PariteTest` 10 tests verts
    (seul aussi) ; moteur 421 tests, 416 verts et les 5 échecs locaux connus d'UC-PRO-08 ; front
    2 779 tests verts (259 fichiers suivis). Sous la charge du poste (d'autres suites tournaient),
    des tests à durée sont instables : `CoutsTest` (« ne s'arrête pas en 30 tranches ») et deux
    tests d'administration du front ont échoué une fois et passent seuls ; non corrigés.
  - À décider (Christian) : la page lit les deux blocs dans `resultats`, qui porte aussi toutes
    les sorties du run (lourd pour un grand run, mais à l'ouverture seulement) ; une route légère
    les servirait seuls. Deux écarts antérieurs, signalés sans être corrigés :
    `attestation.admission` porte `reserve_microusd` et `engagement_microusd`, que lit aussi un
    cartographe lié ; `twin9_evaluations.reglages.marge` sort vers le propriétaire par
    `mes-analyses`. À savoir, sans changement : avec une clé personnelle Anthropic, les résultats
    des lots se lisent dans la Console du titulaire de la clé.

- 2026-10-22 — **P0, PR B : arrêts normalisés, sortie tronquée explicite, configuration du
  document Twin6 (branche `feat/p0-arrets-js-twin6`, indépendante de la PR A).** Spécification
  `spec-v2` (PR B : lots C5 et C6 du plan), faits d'API relevés le 2026-10-22 sur les seules
  documentations officielles.
  - **C5 — pourquoi une génération s'arrête** (`docs/contrats.md` §4 point 14). Tout résultat de
    `complete()` porte une classe d'arrêt (`end`, `max_tokens`, `context_window`, `refusal`,
    `other`, ou `null`), sa valeur brute et `truncated`. La table est partagée avec le PHP à venir
    (`schemas/fixtures/arrets/arrets-fournisseurs.json`) et ne retient que les valeurs vérifiées :
    toute autre vaut `other` — Ollama n'en a aucune, une réponse Ollama coupée n'est donc pas encore
    détectée (UC-APP-02 A-06 reste ouverte). Une sortie tronquée est payée et n'est qu'un fragment :
    `complete()` lève une `OutputTruncatedError` (statut 200, jamais réessayée, fragment non
    énumérable, message sans contenu), sauf `allowTruncated`. Décision pour chaque consommateur :
    `executerTwin6` nomme l'étape et joint l'usage du run, appel tronqué compris, et fait d'un refus
    une erreur explicite ; `extractDay` ne refait jamais un appel tronqué ; le fournisseur
    « crédits » compte le coût puis lève ; le banc, le lanceur de runs et le runner Node comptent
    l'usage de l'appel tronqué, et le banc l'affiche avec son coût même quand le run échoue
    (l'erreur emporte l'usage cumulé jusqu'à elle) ; la démo ne le refait pas et dit « Votre texte est trop long pour
    l'essai » ; la relance du dialogue dit « Relance coupée » ; le bac à sable rend `llm-error`.
    Gemini : parts de réflexion exclues, sortie comptée = ce qui est facturé. UC-APP-09 anomalie 1
    corrigée.
  - **C6 — le document Twin6 dit comment il a été produit** (`cartographie-merge` 1.1.0, §4
    point 8). La vue passe au moteur le paquet et l'empreinte SHA-256 de ses **octets servis**
    (calculée par `loadTwin6Package` avant toute lecture du JSON), le référentiel choisi (id,
    version, `contentHash`, et d'où le moteur lit ses pôles), l'origine de chaque fiche
    (`originesDesFiches`) et l'accès (`cle_perso`, `credits`, `essai`) ; `executerTwin6` complète,
    par liste blanche, le fournisseur et son tag RGPD — nouveau registre `PROVIDER_INFO` :
    Anthropic et OpenAI `sous_conditions`, Mistral `oui`, Google, xAI et OpenRouter `non`, Ollama
    `local` —, le transport, le modèle demandé, le budget de sortie résolu, la température, et tire
    `execution` des appels (bornes à horloge injectable, modèle servi, arrêt normalisé et jetons de
    chaque appel ; coût `null` : un document se partage, le montant reste au relevé du compte).
    `buildMergeDocument` n'ajoute les blocs qu'avec une configuration (une `execution` seule est
    ignorée, que le schéma refuserait) : tout autre document (banc,
    Aurora, Twin9, cohortes, corpus) reste en 1.0.0 à l'octet, parité du document inchangée. Schéma :
    `$defs/configurationTwin6` et `$defs/executionTwin6`, facultatifs, règle `voie = lots ⇒
    fournisseur = anthropic`, `execution` seulement avec `configuration` ; validateurs régénérés.
    L'importeur de la cartographie lit le modèle servi et garde la configuration, réduite à sa
    liste blanche, en provenance. Fixtures inventées partagées JS/PHP
    (`schemas/fixtures/twin6/`) : blocs valides greffés sur la fusion de trois jours, et huit cas
    refusés.
  - **Déploiement** : l'API (ses schémas) avant le front — le serveur valide au schéma une
    révision de cartographie, qui serait refusée en 1.1.0.
  - Tests : moteur 559 (5 échecs locaux préexistants, UC-PRO-08 F19-F22 et F25 : le faux dépôt
    Twin_v9 ne se crée pas dans cet environnement) ; front 2 778, tous verts (avec `TWIN_V9_DIR`
    et le paquet 1.1.0 construit) ; `ValidationTest` et `ConformiteTest` verts ; corpus 69/69 ;
    parité du document 100 %.
  - **Restent ouverts** : l'empreinte de la configuration n'entre pas dans l'identifiant stable
    d'une variante importée (deux runs aux compteurs identiques mais aux modèles différents se
    confondent encore) ; le nom du fichier exporté lit `source.journal_id` au lieu de
    `source.journalId` (toujours `cartographie-twin6-ouverte.json`, figé par un test) ; la PR C
    reflétera `PROVIDER_INFO` et la table des arrêts côté PHP.

- 2026-10-22 — **Deux tâches planifiées depuis un autre hébergement OVH ; les prix relevés aussi
  par `worker.php` (branche `fix/tarifs-worker-cli`, empilée sur `docs/deploiement-2026-10-21`).**
  Christian (00 h 05) : « J'ai la possibilité de définir un cron depuis un autre site avec l'offre
  OVH perso qui invoque un script PHP et non distant. Est-ce que ce serait jouable ? » ; puis
  (00 h 36) : « Oui, met aussi à jour les prix. Une fois par jour ça suffit. Je peux lancer deux
  crons distincts. »
  - **Jouable, sans `worker.php`** : une tâche planifiée d'OVH ne lance qu'un fichier de son
    propre hébergement, et `worker.php` a besoin du code, du `.env`, de la base et du moteur
    d'humanome.xyz (il n'est d'ailleurs pas dans la release). Deux relais
    (`scripts/deploy/cron-ovh/`) appellent les routes d'humanome.xyz, comme cron-job.org :
    `humanome-tick.php` chaque heure — une tâche OVH part au plus une fois par heure et s'arrête
    à 60 minutes : le tick chaque minute pendant 55 minutes, tranches de 40 s faute de service qui
    raccroche à 30 s —, `humanome-maintenance.php` chaque jour. Essayés contre l'API locale :
    compteurs, jeton refusé (code 1), serveur injoignable (le tick continue, code 0).
  - **La maintenance par le jeton du tick** : la route accepte aussi `X-Worker-Tick-Token`, pour
    que la seconde tâche ne tienne pas le jeton des migrations (qui migre, importe et donne des
    rôles) ; elle ne purge que ce qui a expiré. Le jeton du tick, qui n'ouvrait que le tick
    (ADR-011), ouvre ces deux routes. UC-SYS-03 A4, F11 ; `WorkerTickTokenTest`.
  - **Les prix par le cron** (`fix:`) : le relevé quotidien n'était que dans la route du tick ;
    `TarifsAnthropic::releverApresTranche`, appelé par la route et par `php scripts/worker.php`,
    le fait pour les deux (une fois par jour UTC, comme avant). UC-SYS-01-F26 : le script en
    sous-processus, la page injoignable par un mandataire qui refuse la connexion (aucun réseau).
  - **À déployer** : le relais du tick marche avec la production d'aujourd'hui ; celui de la
    maintenance y reçoit `403` tant que cette branche n'est pas déployée (feu vert de Christian).
    `deploiement.md`, « Depuis un autre hébergement OVH » : installation et vérification.

- 2026-10-21 — **Déploiement sur humanome.xyz : `main` (`7b198cc`) et le moteur Twin9 (T18).**
  Christian (22 h 40) : « Tu as mon feu vert pour déployer les deux repository humanome.xyz et
  Twin_v9 sur le serveur OVH. Je m'occuperai du cron plus tard. »
  - **Avant** : la production tournait `v1.1.0-106-gc6a0231` (14 octobre). Sa base — celle que
    nomme `~/app/shared/.env`, que Christian venait de mettre à jour ; d'après lui, la seule base
    disponible, sur l'hébergement d'harmonia.education — tenait déjà les tables d'humanome,
    migrations 001 à 023 ; les nouvelles ne créent ou ne modifient que des tables `twin9_*` (et la grille de
    `settings`), aucune collision possible avec les tables d'harmonia. Disque : 79 Mo sur 100
    (panel, relevé par Christian).
  - **Ce qui est parti** : release API `20261021-205251-7b198cc` (803 fichiers, 4,9 Mo, moteur
    `Twin_v9` `9eea3a1` embarqué) ; `migrate` → 024 à 030 appliquées, 23 déjà là ; référentiels
    7.0.0 et 7.1.0 et compétences (61) inchangés ; paquets `aurora-v3-reconstruit` 1.1.0 et
    `twin6-ouverte` 1.1.0 importés, les 1.0.0 inchangés ; `health` →
    `{"status":"ok","version":"7b198cc","db":"ok","twin9":{"moteur":true,"zlib":true}}`. Gabarits
    du même commit (`import-protocole.mjs`) : 22 importés, 18 inchangés, 7 retirés (les fiches de
    pôle, qui viennent de la base depuis T16) ; le second import : 22 inchangés, 0 retiré. Front :
    4 envois (bundle, gabarit de la copie autonome, `twin6-ouverte-1.1.0.json`, `index.html`),
    4 retraits (l'ancien bundle et les trois gabarits Twin6 publics, versionnés dans
    `scripts/data/twin6/` et servis par le paquet depuis #16). Les deux exports statiques du
    référentiel restent ceux de la production : l'export local n'en diffère que par la mise en
    forme et les dates de publication de la base locale, comme le 14 octobre.
  - **Comment** : comme le 14 octobre, le FTP ne se joint que depuis la VM Linux du Mac ; les
    artefacts sont construits dans le conteneur et remis par le dossier partagé
    (`13. Cartographie/deploiement-2026-10-21/`, archive vérifiée par son empreinte). Composer y
    installe depuis les sources (le proxy refuse les archives de GitHub, 403) : chaque dépendance
    est refaite par `git archive` de son commit verrouillé — ce que GitHub sert comme archive —,
    puis `composer dump-autoload --no-dev --optimize` (2 026 fichiers et 29 Mo sans cela). Les
    identifiants FTP et le jeton des migrations sont lus par les scripts dans le `.env.deploy` de
    la copie de Christian, jamais affichés. D'abord, sans effet : `migrate` sur la release en
    ligne, qui n'avait rien en attente (`skipped: 23`) — le jeton est le bon. Le shell de la VM
    coupe toute commande à 180 s et tue ses processus : la release est partie par un outil
    ponctuel hors dépôt, reprenable et parallèle (six connexions ; 126 dossiers, puis 803 fichiers
    en 85 s), vérifiée fichier par fichier (tailles), puis les étapes de `deploy.mjs api`
    (`www/api`, `current.txt` en dernier, migrations, imports, santé) ; l'API avant le front, qui
    a suivi par `deploy.mjs static` après un `--dry-run` relu. L'outil a été répété de bout en
    bout contre un serveur FTP local et l'API locale, sur une base au niveau de la production
    (023) : coupure et reprise, fichier corrompu repris, bascule, migrations, imports.
  - **Un tick à la main**, avec le `WORKER_TICK_TOKEN` du `.env.deploy` : 200 (le jeton du tick est
    le bon pour cron-job.org), aucun run ni appel, `"tarifs": "ok"` : la grille stockée est
    relevée sur la page des prix d'Anthropic — la correction de Sonnet 5 attendait ce premier tick.
  - **Vérifié en ligne** : santé et état ; en-têtes de l'API (`default-src 'none'`,
    `X-Frame-Options: DENY`) ; nouveau bundle servi, l'ancien en 404 ; Chromium, depuis le
    conteneur : accueil, Essayer, cartographie ouverte, référentiel, guides et cartographie se
    chargent, sans autre erreur que `401 /api/auth/me` (visiteur anonyme) et `/favicon.ico`
    (absent du bundle). Aucun appel payant : le flux en ligne (recette 5.3b, 5.3c) attend
    l'accord de Christian.
  - **Releases gardées** : `v1.1.0-20` (juillet), `v1.1.0-106` (14 octobre ; retour arrière :
    `deploy.mjs rollback`) et la nouvelle ; rien à élaguer.
  - **Restent** : la tâche cron-job.org (Christian) — sans elle, un run par lots n'avance que sa
    page ouverte, et les prix ne se relèvent plus après ce tick ; la recette
    (`docs/recette-twin9.md`) ; l'archive du dossier partagé, à effacer à la main.

- 2026-10-21 — **Prix d'Anthropic relevés chaque jour, sortie sans plafond, Haiku seul pour la
  démo (branche `feat/tarifs-et-sorties`, empilée sur `feat/demo-un-dollar`).** Christian :
  « Corrige la surfacturation de Sonnet et prévois une mise à jour quotidienne de la grille de
  tarification. Ok pour lever le plafond des tokens de sortie. Du moment qu'un utilisateur ne
  dépense pas plus que le budget global alloué au site. Mais si le prompt est déjà passé et les
  tokens déjà dépensés, ne pas limiter sur la longueur de la sortie qui aurait déjà été facturée
  […]. On garde Haiku pour les démos. Sonnet et Opus disponibles uniquement pour les comptes ayant
  acheté suffisamment de crédits API ou bien utilisant leur propre clé. »
  - **Sonnet 5 au juste prix.** La page des prix d'Anthropic (2026-10-21) donne Sonnet 5 et 5.5 à
    2 $ / 10 $ le million — la hausse à 3 / 15 annoncée pour le 1er septembre n'a pas eu lieu —,
    Opus 5.5 à 4 / 20, Fable et Mythos à 10 / 50 : la grille par défaut (`Twin9Config`), `Pricing`
    et la table indicative du moteur (`estimate.js`) les suivent. Un apprenant payait Sonnet 5 une
    fois et demie son prix, avant la contribution.
  - **Le relevé quotidien** (`Twin9\TarifsAnthropic`). Après sa tranche, le déclencheur du worker
    lit la page des prix (sa version markdown), une fois par jour UTC — une heure entre deux
    tentatives après un échec, sous verrou MySQL, là où `ANTHROPIC_API_KEY` est posée —, et récrit
    prix et palier long des modèles de l'offre que son tableau « Model pricing » donne ; il nomme
    ceux qu'il ne donne pas et ne change rien d'une page qu'il ne sait pas lire — ni d'une page
    où un modèle figure deux fois, ni d'une page qui perd un palier long de la grille, deux
    lectures qui seraient fausses en silence. Audit `twin9_tarifs_mis_a_jour` ; état dans le
    réglage `twin9_tarifs`, affiché sous l'offre de modèles de `#/admin/twin9`. La démo, le tuteur
    et la masse tarifent au plus haut de la grille et de la table de `Pricing` : une grille trop
    basse, ou qui a perdu le palier de Haiku 5.5, ne fait pas réserver moins. La grille stockée en production (Sonnet 5 à
    3 / 15) se corrige au premier tick du déclencheur de T18, sans autre geste — à la main dans
    `#/admin/twin9` d'ici là. UC-ADM-05 A6, RG9, U15 à U19, F19, F20 ; `docs/deploiement.md`.
  - **La sortie sans plafond.** Chaque appel demande tout ce que le modèle peut rendre
    (`Llm\ModelLimits`, `engine/src/providers/limits.js` : 128 000 tokens pour les modèles à un
    million de contexte — Haiku 5.5, Sonnet 5.x et 4.6, Opus 5.x et 4.6 à 4.8, Fable, Mythos —, 64 000
    pour Haiku 4.5 et les autres 4.5) : la démo, la voie crédits de Twin6 (défaut et borne : 8 192
    et 16 000 avant), le moteur Twin6 et la clé personnelle Anthropic de l'assistant. Le réglage
    `maxTokensPerRequest` et `DEMO_MAX_TOKENS_PER_REQUEST` disparaissent (422 ; une valeur stockée
    part au prochain enregistrement). Le budget tient par la réservation du pire cas, sortie
    entière comprise, **avant** l'appel : un appel qu'il ne couvre pas ne part pas (démo : 503 ;
    crédits : 402), une réponse n'est jamais coupée pour le tenir. Au-delà de 100 000 octets,
    l'entrée réservée par la démo est le compte d'Anthropic (`POST /v1/messages/count_tokens`,
    gratuit, +10 % et 64 tokens ; les octets s'il ne répond pas ou d'une valeur douteuse) : sans
    lui, une synthèse de Twin6 sous les 100 000 tokens aurait été réservée au palier long de
    Haiku 5.5 — 0,42 $ au lieu de 0,07 $ pour 200 000 caractères (≈ 80 000 tokens au tokenizer
    actuel, ≈ 2,5 caractères par token selon Anthropic) ; avec 10 %, un appel compté à plus de
    ≈ 90 850 tokens réserve au palier long, qu'un compte un peu court ne fasse pas passer le
    budget.
    `maxInputChars` passe à 2 000 000 (borne 4 000 000), pour cette synthèse, dont les scans n'ont
    plus de plafond. Le garde-fou de Twin6 compte aussi la réserve d'un appel (≈ 1,41 $ pour
    Sonnet 5) : sans elle, un solde qui couvre le poids du portfolio finissait sur un 402 après
    les premiers scans payés. Avec Haiku 5.5, un appel de la démo réserve ≈ 0,07 $ : une quinzaine
    au plus sont en vol à la fois sous le dollar du jour, et ses derniers ≈ 0,07 $ ne servent pas.
    UC-ADM-04 RG8, U29 ; UC-VIS-03 RG4, U26, F26 ; UC-APP-09 A3, RG3 à RG5, RG11, U37 ; UC-APP-02 ;
    `docs/securite-demo.md`, angle 3.
  - **Haiku seul pour la démo et le tuteur.** `DemoConfig` prend le premier Haiku de base > env >
    fichier, sinon Haiku 5.5, et nomme les autres (`modelRefuse`, alerte de `#/admin/reglages`) ;
    un `PUT` Sonnet ou Opus reçoit un 422. Le `DEMO_MODEL=claude-sonnet-5` du `.env` de production
    est donc ignoré, sans geste. `TUTEUR_MODEL` hors Haiku retombe sur Haiku 4.5. Sonnet et Opus
    restent aux voies payantes : crédits, clé personnelle, Twin9. L'estimation du Service humanome
    et du banc prend Haiku 5.5 (`SERVICE_ESTIMATION_MODEL`). UC-ADM-04 RG9, A7, U28, F23 ;
    UC-VIS-05 RG6, F20.
  - **Revue indépendante** : l'assistant estimait encore le Service humanome au prix de Sonnet 5
    (`RunWizard`, vingt fois Haiku 5.5 : corrigé, avec son test) ; le relevé refuse désormais les
    deux lectures fausses en silence, et `Pricing` prend le plus haut de la grille et de sa table ;
    la marge du compte passe de 2 à 10 % ; les tests du worker-tick ne relèvent rien, même si le
    poste exporte une clé ; les fixtures du front tarifent Sonnet 5 à 2 / 10. Elle a vérifié sur
    les pages d'Anthropic les prix et les sorties maximales retenus, et lu la vraie page des prix
    avec le parseur (vingt lignes, aucun changement sur la grille par défaut). Restent les
    décisions ci-dessous.
  - Remplace, dans l'entrée de la démo ci-dessous : les 16 000 jetons de sortie et les 420 000
    caractères ; le geste « sortie 16 000, entrée 420 000 » (plus de champ de sortie, l'entrée se
    laisse au fichier ou se règle à 2 000 000) ; « à aligner » pour `SERVICE_ESTIMATION_MODEL` ;
    la décision sur la grille ; la sortie de 8 192 des voies payantes de Twin6.
  - **Gestes en production**, au déploiement (feu vert de Christian) : aucun pour les prix ni pour
    le modèle. Dans `#/admin/reglages`, `maxInputChars` à 2 000 000 si une surcharge ou le `.env`
    le fixe plus bas, et retirer la surcharge de sortie si la page en garde une (elle ne sert
    plus).
  - **Les appels en flux** (Christian, à la question ouverte ci-dessous : « Si on passe en appel en
    flux, alors on voit la réponse arriver au fur et à mesure ? C'est bien ça ? Si oui, alors
    c'est mon choix. Mais augmente également le timeout si OVH le permet. Je ne peux pas prendre à
    charge les coûts extra, car le site est prévu pour me coûter de l'argent, pas pour m'en
    rapporter. »). La démo (`POST /api/llm`) et la voie crédits (`POST /api/twin6/appel`)
    demandent à Anthropic une réponse diffusée (`Llm\AnthropicFlux`, sur `CurlHttpStream`,
    curl_multi) et la relaient au navigateur qui le demande (`RelaisAppel`, `RelaisSse` :
    `progression` {caracteres}, `: attente` après 10 s de silence, puis `resultat` ou `erreur`) ;
    tout autre client reçoit le même JSON qu'avant, à la fin. L'Essayer, l'essai gratuit et la voie
    crédits de la cartographie ouverte affichent « N caractères reçus » pour l'appel en cours
    (`web/src/api/relais.js`). **Facturation** : un appel qu'Anthropic refuse (statut d'erreur) ou
    ne reçoit jamais (connexion impossible ; une requête partie entière avant la panne compte comme
    reçue) rend sa réserve ; un appel **coupé** après réception — délai dépassé, erreur en cours de
    flux, navigateur parti — est facturé pour ce qu'il a produit, jamais remboursé : l'entrée que
    donne Anthropic au début du flux (sinon la borne), la sortie bornée par les octets reçus plus
    1 024 tokens, au plus `max_tokens` ; toute la sortie quand ces octets ne bornent rien (bloc de
    réflexion, réponse qui n'est pas un flux). La démo compte de même sur son budget, au lieu de
    garder le pire cas, et son client ne refait plus un appel coupé (le moteur garde son nouvel
    essai). L'Essayer annulé, un onglet fermé, coupent désormais l'appel (`apiFetch` passe aussi le
    signal qu'on lui donne ; la cartographie ouverte n'a pas de bouton d'annulation). **Le
    délai** : OVH borne un script à 165 s sur le mutualisé, sans réglage possible (documentation
    d'OVH) ; il reste donc à 150 s, réglable — `TWIN6_UPSTREAM_TIMEOUT` (10 à 900) pour les
    crédits, `upstreamTimeoutSeconds` pour la démo —, à relever si la recette montre plus, ce que
    le flux rend plausible (dettes techniques). Vérifié en local avec un vrai navigateur, un faux Anthropic en TLS et le vrai client
    curl : la progression arrive à mesure (12, 36, 60, 84 caractères en 3 s), le délai coupe à
    10 s et facture 36 octets + 1 024, le navigateur parti fait couper l'appel en amont.
    `AnthropicCaller::appeler`, sans appelant, est retiré. UC-VIS-03 RG4, RG6, A4, E7, U27 à U30,
    F10, F25 à F27 ; UC-APP-09 RG12, E11, U26, U27, U38, U39, F17, F28, F29 ; `docs/securite-demo.md`.
  - **Revue indépendante du flux** : sans `eager_input_streaming`, l'API retient chaque valeur
    du JSON de l'outil forcé de la démo jusqu'à ce qu'elle soit complète (sa documentation le
    dit) — rien ne s'affichait avant, et un appel coupé n'aurait compté qu'une marge pour une
    sortie déjà générée : l'outil le demande désormais. Corrigés aussi : un texte de formulaire
    hors UTF-8 refusé (422) avant toute réservation, qui sinon restait réservée ; un règlement qui
    échoue (connexion à la base lâchée pendant un long appel — rouverte une fois,
    `Db::avecReconnexion`) ne perd plus la réponse, la réserve restant débitée ; la voie crédits
    facture au prix de la grille lue avant l'appel (un modèle retiré pendant l'appel était
    remboursé en entier) ; une erreur d'Anthropic avant que la réponse commence est un refus,
    rendu ; le type de la réponse, et non son premier caractère, dit si c'est un flux ; un
    événement inconnu compte ses données ; un statut 1xx est passé ; un `curl_multi` en échec ou
    bloqué s'arrête à son délai ; le compte d'Anthropic avant un long appel de la démo est borné
    à 5 s. UC-VIS-03 E3, U27, F06, F27 ; UC-APP-09 E11, U40, F29, F30.
  - **Points ouverts**, aux « Dettes techniques » : le relais à mesure et le délai réel d'OVH, à
    mesurer en recette ; le tuteur et la masse gardent leurs plafonds ; la masse tourne par défaut
    sur Sonnet 4.5, retiré le 2026-11-30 ; Opus 5.5, Fable et Mythos refusent la réflexion coupée de
    la voie crédits.

- 2026-10-21 — **Démo à 1 $ par jour, essai gratuit de la cartographie ouverte (branche
  `feat/demo-un-dollar`).** Christian : « Twin6 : en version gratuite, mettre une limite de 1 USD de
  démo par jour pour des tests anonymes. », puis « 1 USD par jour pour tous les utilisateurs anonymes
  ou connectés, mais pas plus de dépense journalière car je ne peux pas me le permettre. 5000
  caractères pour les démo "Essayer" sans compte, c'est suffisant. Ajuste toi-même les settings par
  défaut. »
  - **Un plafond qui tient.** Le pire cas de chaque appel à `POST /api/llm` est réservé avant qu'il
    parte, par un seul `UPDATE` conditionnel sur la ligne du jour (`UsageCounters::reserve`) — un
    token par octet du prompt, plus le surcoût de la requête (1 024), plus tout le plafond de
    sortie —, puis réglé au réel (`settle`) ou rendu sur un refus du fournisseur (`release`) ; un
    délai dépassé le garde, le fournisseur ayant pu facturer. Avant, le plafond était lu avant
    l'appel et écrit après : des appels concurrents le passaient tous. Et `Pricing` compte le palier
    long de Haiku 5.5 (0,50 $ / 2,50 $ au-delà de 100 000 tokens d'entrée, tout l'appel), sans quoi
    une entrée dense (CJK, emoji) ne comptait qu'un cinquième de son coût et laissait dépenser trois
    fois le dollar (revue du 2026-10-21). UC-VIS-03 RG4, U25, F25, F10 ; `docs/securite-demo.md`.
  - **Réglages du fichier** (`api/config/demo.php`, défauts codés de `DemoConfig`) : 1 $ par jour,
    que partage tout ce qui passe par la démo — l'Essayer, l'essai gratuit de Twin6, le Service
    humanome de l'assistant (UC-APP-02), le banc et la rétro-ingénierie du promptologue, qui le
    choisissent par défaut —, visiteurs et comptes confondus ; Haiku 5.5, avec lequel ce dollar paie
    de quarante à soixante Essayer ou de huit à vingt essais de Twin6 (0,05 à 0,13 $ chacun) ; 16 000
    jetons de sortie (les sorties du même schéma, dans le prototype de fusion, font 30 500 caractères
    compacts par pôle en médiane, plus de 8 192 jetons) ; 420 000 caractères par appel, pour la
    synthèse de Twin6, qui porte les sorties des sept scans (415 000 caractères quand chacun rend ses
    16 000 jetons, UC-APP-09-U35 ; à 200 000, elle recevait un `413`) ; borne de l'administration
    portée à 500 000 ; 6 millions de jetons par jour ; 150 s par appel. La liste de l'administration
    propose Haiku 5.5 ; `api/.env.example` ne surcharge plus la démo (UC-ADM-04 RG8). L'estimation
    du Service humanome et du banc garde Sonnet 5 pour tarif de référence
    (`SERVICE_ESTIMATION_MODEL`), trente fois plus cher : à aligner quand l'essai réel aura arrêté le
    modèle de la démo.
  - Essayer : 5 000 caractères au plus (AN3 de UC-VIS-03 corrigée) ; un lien sous le bouton mène à
    l'essai de la cartographie ouverte, que le menu d'un visiteur ne propose pas.
  - Twin6 : troisième voie, « Essai gratuit », par le proxy de la démo (`createDemoProvider`),
    seule voie d'un visiteur, au choix d'un compte ; 5 000 caractères au plus et une feuille datée
    au moins, sans quoi les huit appels finiraient sur « aucune feuille datée » ; modèle imposé ;
    pour un compte, un budget épuisé renvoie à ses deux autres voies (UC-APP-09 A6, E14, RG11, U34,
    F23 à F27). `extractJson` lit tel quel un document JSON pur : un bloc ``` cité dans une chaîne
    (portfolio d'informatique) le faisait échouer, sur toutes les voies (U36).
  - **En production, ces valeurs n'arrivent pas seules** : une variable `DEMO_*` de
    `~/app/shared/.env` (en juillet : Sonnet 5, 8 192 jetons, 40 requêtes par heure et par IP, preuve
    à 16 bits, 8 $ par jour) et une surcharge de `#/admin/reglages` passent avant le fichier.
    Christian règle dans cette page, champ par champ : budget 1 $ (dès maintenant, avant même le
    déploiement), puis, après lui, modèle `claude-haiku-5-5`, sortie 16 000, entrée 420 000 (la
    borne de 200 000 n'est levée qu'avec ce code), 6 000 000 de jetons. Mieux que de retirer les
    lignes `DEMO_*` : on perdrait aussi le quota de 40 et la preuve à 16 bits de juillet, au profit
    des 20 requêtes et 20 bits du fichier — la moitié du débit du Service humanome, une preuve seize
    fois plus longue.
  - **À vérifier au premier essai réel (recette de T18, 5.3)** : Haiku 5.5 n'a jamais tourné sur ces
    prompts (en juillet, Haiku 4.5 ne tenait pas la structure de l'Essayer), ni Twin6 sur un vrai
    modèle à 16 000 jetons. À défaut, Sonnet 5 dans la même page. Sonnet 5.5 ne convient pas : il
    refuse la réflexion désactivée qu'envoie la démo. Les voies payantes de Twin6 gardent les 8 192
    jetons d'`executerTwin6` : si l'essai montre des scans plus longs, elles en tronqueront la moitié
    (UC-APP-09, Limites).
  - **Décisions pour Christian** : le tuteur garde son propre budget de 1 $ par jour
    (`TUTEUR_BUDGET`, question 3), la dépense gratuite du site peut donc atteindre 2 $ ; et
    `TUTEUR_BUDGET=0` retombe sur 1 $ (`?: '1'`). La page des prix (2026-10-21) donne Sonnet 5 et
    5.5 à 2 $ / 10 $ : la grille des crédits (`Twin9Config`, réglable dans `#/admin/twin9`) compte
    Sonnet 5 à 3 $ / 15 $, la moitié de trop pour un apprenant qui paie ; `Pricing` aussi, mais il ne
    fait que borner la démo et la masse, prudemment.

- 2026-10-21 — **T18 préparé : Twin9 sur l'OVH (branche `feat/twin9-t18-demonstration`, empilée
  sur `feat/import-sans-python`).** Christian : « Feu vert pour la T18. » Le prompt prépare ;
  Christian fait les gestes du panel OVH, du service de tâches planifiées et du `.env` du serveur,
  et donne son feu vert à chaque déploiement. Rien n'est déployé.
  - **La place.** La release embarque le moteur : `scripts/deploy/stage-twin9.mjs`, appelé par
    `stage-api.sh`, copie le `php/src` du commit de `TWIN_V9_DIR` (défaut `../Twin_v9`) — les
    fichiers que donne git, pas la copie de travail — et ce commit dans `build/api-release/Twin_v9/`.
    Il refuse : moteur ou gabarits absents ; un dossier qui n'est pas la racine de son dépôt (le faux
    moteur des tests, DANS humanome, aurait reçu le commit de humanome : relevé par la revue
    indépendante) ; un changement non commité, non suivis compris quelle que soit la configuration
    git (`scripts/deploy/twin9-checkout.mjs`). Seules les sources partent : ni les tests du moteur
    (5 Mo), ni ses dépendances de développement, ni les gabarits, que l'import met en base.
    `EngineLoader` trouve `<release>/Twin_v9` sans `TWIN_V9_DIR` (qui, défini, passe avant : il ne
    doit pas figurer dans `~/app/shared/.env`). Moteur : 42 fichiers, 345 Ko (mesuré) ; release
    ≈ 4,9 à 6,9 Mo, trois releases ≈ 15 à 21 Mo (déduits : la préparation locale, Composer ayant
    installé depuis les sources, pesait 22 Mo avec les `.git` des dépendances, que `deploy.mjs`
    enverrait — la recette relève `du -sh build/api-release`). 56 Mo occupés sur 100 le 16 octobre.
    Le FTP du cluster n'étant pas chiffré, le moteur y transite en clair (`docs/hebergement.md`).
    `Twin_v9/` est ignoré par git et refusé par `check-publiable` : sous `api/`, `EngineLoader` le
    chargerait en développement.
  - **zlib et le moteur, vérifiés au déploiement.** `GET /api/health` dit
    `"twin9":{"moteur":…,"zlib":…}`. S'il manque l'un des deux à une release qui embarque le moteur,
    `deploy.mjs api` échoue en disant la release en ligne (pointeur basculé, migrations faites),
    Twin9 éteint, et ses causes : `TWIN_V9_DIR` dans le `.env` du serveur, zlib absent — qu'un
    retour arrière ne corrigerait pas.
  - **La base, en version figée.** Les migrations 024 à 030 et RESPIRE avec ses fiches viennent de
    `deploy.mjs api`. Le jeu « v9.8 » à variables vient ensuite par `import-protocole.mjs`, qui
    refuse un `TWIN_V9_DIR` hors de la racine d'un dépôt, un changement non commité dans
    `php/protocole` ou `protocole/tagger`, et une release préparée d'un autre commit ; il affiche le
    commit. Sa réponse compte les gabarits déjà en base à l'octet (`inchanges`) : un second import
    qui les trouve tous prouve que la base tient ceux du commit de la release. Poids d'un run de test
    réel (PLANT-01, une journée, un pôle, réponses du vrai run de T2 rejouées en local) : 86 Ko une
    fois fini, dont 42 Ko de réglages (le référentiel et ses fiches) ; le poids d'un run complet se
    relèvera dans le panel, avant et après le run de la recette. Le quota de la base reste à relever
    (Christian).
  - **Le déclencheur.** `docs/deploiement.md` décrit cron-job.org : `POST` toutes les minutes,
    `X-Worker-Tick-Token`, corps `{"budgetSeconds": 25}` — le service raccroche à 30 s et désactive
    une tâche après plus de 25 échecs de suite ; une clé `twin9Runs` dans sa réponse dit le moteur
    chargé. Le jeton se génère et se pose par Christian seul. À 25 s, **un run en appels directs ne
    tient pas navigateur fermé** : un appel de plus de ≈ 24 s, coupé trois fois, tombe en panne ; un
    run qui avance seul passe par lots, la voie du profil v9.8.
  - **La recette** : `docs/recette-twin9.md`, la liste à dérouler ensemble (avant le déploiement,
    déploiement, déclencheur, parcours compte → configuration → run par lots navigateur fermé →
    résultats → partage → purge, ouverture de la démonstration, prix de la grille compris). Twin9
    s'ouvre dès le déploiement de l'API : aucun interrupteur depuis T11.
  - Tests : UC-SYS-02-U12 (le moteur de la release), F23 (une release jetable servie par le
    front-controller charge son moteur, sans `TWIN_V9_DIR`), F24 (`deploy.mjs` et la santé),
    F25 (`stage-twin9.mjs` sur un faux dépôt git, cas imbriqué et fichier ignoré compris) ;
    UC-PRO-08-F25 (l'import en version figée), F17 (`Twin_v9/` refusé) ; UC-SYS-03-F01 lit `twin9` ;
    l'import compte `inchanges` (UC-PRO-08-F10, `Twin9ProtocoleTest`).
  - Documentation : `docs/deploiement.md`, `docs/hebergement.md`, `docs/recette-twin9.md` (au
    sommaire GitBook), `docs/contrats.md`, UC-SYS-02 (A8), UC-SYS-03, UC-PRO-08, ADR-011 et ADR-008,
    `.env.example`, `CLAUDE.md`.
  - Dettes et idées, non codées : un jeton dédié à la maintenance, comme celui du tick, la
    laisserait planifier sans confier à un service tiers le jeton des migrations ; d'ici là, elle se
    lance à la main. Des runs de masse en file peuvent mener un tick près d'une minute, au-delà des
    30 s du service (un appel de masse part jusqu'à la fin du budget, avec un délai de budget + 8 s) :
    à revoir si la masse sert en production. `stage-api.sh` pourrait passer `--prefer-dist` à
    Composer, et `deploy.mjs` sauter les `.git`. F23 suppose un autochargeur de `api/vendor` non
    optimisé.

- 2026-10-21 — **Import des gabarits sans Python (branche `feat/import-sans-python`).** À la
  demande de Christian (« Oui : remplacer le script d'import et son appel Python par le parseur
  JavaScript »), `scripts/twin9/import-protocole.mjs` lit la structure de RESPIRE v7 dans les
  fichiers de pôle de la v9.8 (`protocole/tagger/P1.md` à `P7.md`) par `parsePole`, le port du
  `parse_pole` de la v9.8 que la plateforme garde (`web/src/lib/twin9/referentiel.js`), comme le
  faisait `load_referentiel` : fins de ligne universelles, codes uniques d'un pôle à l'autre, noms
  accentués des pôles. Un fichier manquant ou illisible donne un avertissement, et le serveur garde
  sa structure. Vérifié sur les fichiers réels de `Twin_v9` : la structure extraite est identique
  à celle du Python (7 pôles, 61 compétences). UC-PRO-08-F21 ne dépend plus de `python3` ; il lit
  sept fichiers de pôle fictifs, dont un en CRLF, et un dossier incomplet.

- 2026-10-20 — **Gabarits Twin6 versionnés, vestiges de T11 retirés (branche
  `feat/gabarits-twin6-et-vestiges`, posée sur `feat/referentiel-dynamique`).** Christian a
  fourni la sauvegarde de Twin6 du site déployé (« Tu pourrais également l'importer dans le dépôt
  GitHub pour la prochaine fois ? »), puis demandé de retirer les six vestiges notés à T11 :
  « Peux-tu les supprimer et nettoyer le code de ce qui ne sert plus ? ». Deux commits.
  - Twin6 : les trois gabarits publics (`0-mega-prompt`, `1-scan-pole`, `2-kairos-final`) sont
    versionnés dans `scripts/data/twin6/`, tirés de sa sauvegarde ; le paquet statique qu'ils
    rebâtissent est identique à l'octet au paquet servi, et le paquet publié 1.0.0 inchangé
    (UC-SYS-04 AN-2 corrigée : un clone neuf construit le front et la release). Ils répondent à la
    question que laissait la branche précédente : ils écrivaient RESPIRE v7 en toutes lettres
    (« un des 7 pôles du référentiel RESPIRE », « les 61 verdicts », codes `X.YY`, quatre codes
    d'exemple). `twin6-ouverte` 1.1.0 en fait des variables que le moteur rend depuis le
    référentiel employé (`engine/src/twin6/variables.js` : `REFERENTIEL`, `NB_POLES`,
    `NB_COMPETENCES`, `FORMAT_CODE` comme `Referentiel::formatCode` du moteur Twin9,
    `PRECISION_FORMAT_CODE`, `CODES_EXEMPLE`) ; rendus pour RESPIRE v7, ses prompts sont ceux de
    1.0.0 à l'octet. `#/twin6-ouverte` sert 1.1.0 ; le méga-prompt, que le moteur n'exécute pas,
    reste le protocole manuel de RESPIRE v7.
  - Vestiges : retirés l'interrupteur `enabled` et le `pipeline` qu'écrivait l'import, les étages
    des modèles de l'offre (formulaire de supervision et son style compris), le rythme
    `appels_par_minute`, le magasin `twin9_fiches` avec `FicheStore`, la route `POST
    /api/admin/generate-fiches`, l'étape du déploiement qui l'appelait et `FICHES_FORCE`,
    `LeakFilter::redact`, la promotion dans `/meta` et `fetchTwin6Offer`. L'import n'envoie plus
    que les gabarits et la structure du référentiel ; il ignore les réglages et les fiches d'un
    ancien script. Rien n'est effacé de la base : la lecture ignore ces clés, que l'enregistrement
    suivant de la supervision retire du réglage stocké, et plus rien ne lit `twin9_fiches`. Les
    effacer est une contraction, qu'ADR-008 réserve à une release stabilisée (« Dettes
    techniques »). Les runs lisent leurs réglages dans leur profil (T12) et leurs fiches dans la
    base (T16).
  - Conséquences à connaître : (1) les appels payants de la cartographie ouverte ne sont plus
    limités par minute — la dépense reste bornée par le solde prépayé (UC-APP-09 E10 retiré), mais
    plus rien ne borne le débit d'un compte crédité (voir « À décider ») ;
    (2) un premier déploiement passe d'une traite, et une fiche entérinée atteint le run Twin9
    suivant sans déploiement ; (3) un `deploy.mjs` d'avant ce commit s'arrêterait sur le `404` de
    `generate-fiches` : déployer depuis le dépôt à jour ; (4) envoyées au `PUT` de supervision, ces
    clés sont refusées (`422 « Clé de configuration inconnue : … »`, « Modèle … : clé inconnue
    etages ») ; (5) la page Configuration lit la promotion dans `/api/twin9/configuration`, comme
    avant.
  - Tests : la parité des fiches passe par le bloc que lit le moteur (`ReferentielMoteur`) au lieu
    du magasin ; UC-EPI-03-F20 vérifie qu'une fiche entérinée est celle du bloc, sans déploiement ;
    UC-SYS-02 perd F12 et F13 avec la route, F18 montre le refus de Twin9 (`503`) après AN-6, et le
    test de l'outil (F21) s'arrête sur un seed en échec au lieu du garde-fou ; la route partie
    répond `404`.
  - Documentation : UC-ADM-05, UC-SYS-02 (étape 7, A4, E6 barrés ; AN-1 sans objet, AN-2 ne vise
    plus que le seed), UC-EPI-03, UC-PRO-08, UC-APP-09, note de révision d'ADR-010, catalogue. La
    ligne « Total » du catalogue, en retard depuis avant `feat/referentiel-dynamique` (944, 1111,
    205), est recalculée sur ses lignes : 956 tests unitaires, 1124 fonctionnels, 198 anomalies.
  - Revue indépendante (un agent neuf, sur toute la branche) : un point bloquant, corrigé —
    UC-APP-10-U08 envoyait encore des étages à la supervision, refusés désormais (`422`). Corrigé
    aussi : la migration prévue pour effacer `twin9_fiches` et les trois clés était une
    contraction, qu'ADR-008 interdit tant que la release précédente peut revenir par `rollback`
    (elle lit encore l'interrupteur, les fiches et le rythme) — non livrée, notée en dette ; deux
    références périmées (`fetchTwin9Meta`, `stage-api.sh`) ; UC-SYS-02-U08 vérifie tous les pôles,
    comme il l'annonce ; le rendu des variables Twin6 se fait en une passe (une valeur n'est jamais
    relue).
  - À décider (Christian) : le rythme `appels_par_minute` bornait aussi l'abus. Sans lui, un compte
    crédité peut lancer des appels Twin6 en parallèle sur la clé de la plateforme ; chacun garde un
    processus PHP du mutualisé jusqu'à la réponse et consomme les quotas Anthropic de l'instance,
    que partagent les runs Twin9 à clé d'instance. Le parcours normal (8 appels l'un après l'autre)
    n'approchait pas les 30 par minute. S'il le veut, une limite fixe dans le code, sans réglage
    (comme celle des routes PayPal), le remplacerait.
  - En attente de Christian : le script d'import extrait encore la structure du référentiel par le
    Python de `Twin_v9` (`aurora.referentiel`) ; le parseur JavaScript des fiches de pôle
    (`parsePole`) pourrait le remplacer. (Fait le 2026-10-21 : entrée « Import des gabarits sans
    Python ».) **À faire avant le déploiement** : valider la version
    par défaut du paquet (UC-ADM-03). La production n'en a pas : `GET /api/prompt-packages/default`
    y sert le plus récent paquet publié, `twin6-ouverte` 1.0.0 (relevé le 2026-10-20, UC-PRO-01
    AN-2) ; le déploiement importe les paquets dans l'ordre de leurs noms, et ce serait ensuite
    `twin6-ouverte` 1.1.0.
  - Fusion : #16 visait `feat/referentiel-dynamique`, sa base, que la fusion de #15 n'avait pas
    supprimée ; elle y a été fusionnée. Une PR de `docs/fiches-referentiels` l'amène dans `main`,
    avec une mise à jour d'UC-EPI-05 que Christian a demandée : un référentiel importé n'a pas de
    fiches à rédiger ni à générer — Twin6 et Twin9 les écrivent depuis son document (RG10).
  - Vérifié, sur l'arbre du commit : PHP `OK (1703 tests, 17825 assertions)` (Twin_v9 présent,
    PHP 8.3 local) ; front 2740 tests verts, ses 258 fichiers chargés ; moteur 413 ; bout en bout
    19/19 (le scénario promptologue rejoué après la remise à zéro documentée des compteurs de la
    démo, épuisés par les runs du jour : `503 « Démo épuisée »`) ; `check-publiable` OK ; catalogue
    recompté sur les fichiers de tests ; paquet publié `twin6-ouverte` 1.0.0 identique à l'octet
    (sha256 `732f18d7…`).

- 2026-10-20 — **Référentiel dynamique : RESPIRE n'a plus de structure imposée (branche
  `feat/referentiel-dynamique`, posée sur T11).** Christian a demandé pourquoi une journée de
  RESPIRE à six pôles était refusée, et s'il faudrait tout recoder pour un référentiel de six
  pôles ; puis : « Corrige directement sans autre. » Le verrou venait de T15 et T17 : les schémas
  figeaient RESPIRE à 7 pôles, 61 compétences, codes `P.NN`. Contrat : `docs/contrats.md` §11.
  - Lecture retenue : RESPIRE redevient un référentiel comme un autre (un pôle au moins, sans
    plafond ; 12 n'est que la limite de lisibilité de l'affichage). Le garde-fou contre un pôle
    perdu demeure, contre la version de référentiel que le document cartographie : la
    conformité (`engine/src/conformite.js`, `api/src/Referentiel/Conformite.php`, jumelles) — ses
    pôles chacun une fois, ses codes dans leur pôle, son identité. Chaque parcours lit la structure
    dans le JSON du référentiel qu'il emploie ; la cartographie standard, Twin6 et la masse offrent
    le choix d'un référentiel publié, RESPIRE par défaut.
  - Fondation : schémas déverrouillés (`referentiel` 2.1.0), conformité, chargement et choix d'un
    référentiel publié, fiches Twin6 de tout référentiel, nom et codes d'exemple des prompts,
    nombre d'appels par référentiel ; la coupe d'une release depuis le modèle atomique garde la
    structure de la dernière version publiée (UC-EPI-04 AN1 corrigée en partie).
  - Cartographie standard, Essayer, banc, bac à sable, rétrospective : prompts et validations lus
    dans le référentiel (la sonde à sept clones disparaît) ; choix du référentiel dans l'assistant.
    Paquet par défaut : 1.0.0 inchangée à l'octet (même empreinte, reconstruite depuis le commit
    précédent), et 1.1.0 dont les gabarits d'extraction lisent le référentiel (`referentiel_nom`,
    `nb_poles`, `code_exemple_1`, `code_exemple_2`) ; pour RESPIRE v7, ses prompts sont ceux de
    1.0.0 à l'octet ; le paquet embarqué passe à 1.1.0.
  - Masse : le run fige le référentiel publié choisi (`referentielId`, `referentielVersion`) ; un
    paquet qui ne sait pas le cartographier est refusé (1.0.0 ne sert que RESPIRE à sept pôles) ;
    le worker, le runner et la fusion d'un membre valident par la conformité.
  - Twin6 et Twin9 : un scan par pôle du référentiel choisi ; fiches du paquet pour les pôles
    qu'elles décrivent, sinon écrites depuis le document ; `ReferentielMoteur` écrit depuis le
    document ce que la base ne décrit pas d'une version de RESPIRE ; un jeu de gabarits d'avant T16
    ne sert RESPIRE que dans la structure de ses fichiers de pôle.
  - Relecture, visionneuses, importeurs, atelier : la version relue est celle stockée, sinon la
    plus récente version publiée du référentiel nommé à laquelle le document est conforme ; une
    annotation nomme un code de cette version, une révision lui est conforme ; les visionneuses
    lisent le référentiel que nomme le document ; `validate-corpus.mjs` vérifie aussi la
    conformité du corpus à RESPIRE v7.
  - Changements visibles, à connaître : (1) plus strict, RESPIRE compris — l'ancien schéma ne
    vérifiait que la forme d'un code (`[1-7].NN`) ; un code inconnu de la version, ou d'un autre
    pôle, fait désormais échouer l'appel d'extraction puis son nouvel essai, et un kairos qui en
    relie un est refait puis ramené à `null` ; (2) l'atelier épistémiarque affiche les noms de
    pôle du RESPIRE publié (« TETE — … », sans accent) au lieu d'une constante (« TÊTE ») ;
    (3) l'identifiant d'un run standard porte le référentiel, et le paquet embarqué passe à
    1.1.0 : un run commencé avant ne se reprend pas ; (4) là où aucune version par défaut du
    paquet n'est réglée, `GET /api/prompt-packages/default` rendra 1.1.0 après l'import du
    déploiement ; (5) une base sans RESPIRE publié refuse annotations et révisions (`422`) ;
    (6) le détail du cartographe porte `referentiel: {id, version}` ; (7) une base qui n'a pas
    importé 1.1.0 refuse la copie serveur d'une cartographie standard (`422` « Paquet de prompts
    publié introuvable ») : le déploiement l'importe (`deploy.mjs`, `build/prompt-packages`), un
    environnement de développement existant la régénère et l'importe (`docs/tests-e2e.md`) ;
    (8) la recherche de `#/referentiel` dit « Code ou nom — ex. 1.01 » (sans « pensée
    critique »).
  - Anomalies corrigées en passant : UC-PRO-07 AN-2, UC-PRO-06 AN-2, UC-APP-09 AN3 (« X / 61 »
    quel que soit le référentiel), UC-VIS-01 AN1, UC-CAR-06 AN17.
  - Hors périmètre, noté (règle 6) : le modèle atomique des compétences reste celui de RESPIRE
    (une version d'une autre structure s'édite comme un document, UC-EPI-04) ; les textes qui
    décrivent RESPIRE v7 (accueil, aide, formation) ; l'outillage de corpus et de parité ;
    `referentielCompatible` des paquets reste déclaratif ; une version de RESPIRE à dix pôles ou
    plus déclare ses niveaux (motif par défaut `\d\.\d{2}`). **À vérifier par Christian** : les
    gabarits scan-pôle et kairos de Twin6 ne sont pas versionnés (UC-SYS-04 AN-2) ; s'ils écrivent
    « RESPIRE » ou « 7 pôles » en toutes lettres, un run Twin6 sur un autre référentiel garde ces
    mots, même si la fiche jointe et le nombre d'appels suivent le référentiel. (Réglé le
    2026-10-20 : entrée « Gabarits Twin6 versionnés… ».)
  - Méthode : une fondation, puis quatre lots en parallèle (standard et banc ; masse ; Twin6 et
    Twin9 ; relecture et visionneuses), relus un par un, puis réunis en un seul commit : pris
    seuls, les commits de lot laissaient rouges les tests d'un lot pas encore commité.
  - Revue indépendante (un agent neuf, sur toute la branche) : aucun point bloquant ; RESPIRE v7
    vérifié identique à l'octet (prompts, paquet 1.0.0, documents). Corrigé : (1) le bac à sable
    se fiait au marqueur `perimetre` que le code d'un paquet pose sur sa journée — une journée
    qui avait perdu des pôles passait en se disant partielle ; il l'ôte et valide contre le
    référentiel qu'il a transmis (UC-PRO-07-U18) ; (2) la conformité d'une fusion admettait un
    sous-ensemble de domaines — une révision de fusion pouvait perdre un pôle, ce que l'ancien
    schéma interdisait pour RESPIRE : une fusion compte désormais tous les pôles de sa version
    (UC-CAR-04-F05) ; (3) sans version connue, les visionneuses, le partage et l'archive lisaient la
    dernière version publiée, la relecture la plus récente à laquelle le document est conforme :
    même règle partout (une journée de RESPIRE v7 reste lue avec la v7 quand une v8 d'une autre
    structure paraît) ; (4) parité JS ↔ PHP durcie hors schéma (numéros de pôle canoniques,
    listes, messages), cas jumeaux ajoutés ; (5) l'empreinte de 1.0.0 est figée par un test ;
    (6) refus non testés couverts (version non textuelle au lancement de masse, version figée
    illisible au dépôt d'un runner, révision sans référentiel chargé) ; documentation et
    commentaires périmés. Laissé à décider (Christian) : (a) un seul code inconnu dans le kairos
    fait perdre toute la synthèse (après un nouvel essai) ; on pourrait plutôt écarter les codes
    inconnus des émergences ; (b) l'assistant enregistre la version de paquet choisie (1.0.0
    publiée comprise) alors que le moteur rend toujours les prompts de l'embarqué (limite v1
    notée dans UC-APP-02) ; (c) l'atelier épistémiarque nomme les pôles d'après la dernière
    version publiée de RESPIRE, non d'après le modèle atomique ; (d) la fusion d'un membre dont
    les journées viennent de plusieurs référentiels échoue (UC-ETA-04 A5) avec un message qui
    parle des pôles.
  - Relecture finale, après la revue : la relecture vérifiait une révision comme une journée
    partielle — le schéma sans le marqueur `perimetre`, puis une conformité qui s'y fiait —,
    quand le serveur la vérifie entière et refuse ce marqueur. Elle fait désormais comme lui
    (test de `RelectureSection`) ; rien ne passait pour autant, le serveur refusant l'envoi.
  - Vérifié, sur l'arbre du commit : PHP `OK (1709 tests, 17986 assertions)` (Twin_v9 présent,
    PHP 8.3 local) ; front 2731 tests verts — un fichier ne se charge pas, faute des gabarits Twin6
    non versionnés (`twin6-prompt-package.test.js`, UC-SYS-04 AN-2), comme avant la branche ;
    moteur 403 ; bout en bout 19/19 ; `check-publiable` OK ; `validate-corpus.mjs` 69 OK sur 69 ;
    paquet 1.0.0 identique à l'octet (sha256 `4bd550fc…`, figé par `DefaultPackageParityTest`).

- 2026-10-20 — **Moteur Twin9 en PHP, T11 : retirer le moteur du navigateur (branche
  `feat/twin9-t11-retrait` ; `Twin_v9` : `feat/twin9-t11-retrait`).** L'analyse approfondie tourne
  sur le serveur depuis T9 ; ce qui servait encore le moteur du navigateur part, et l'entrée de
  navigation revient. T17 (#13 ; `Twin_v9` #18) a été fusionné le 2026-10-20.
  - Dans le front : l'adaptateur d'une carte Twin9 (`mapper.js`) et le parseur des fiches de pôle
    (`parsePole`, qu'importent `extract-fiches.mjs` et donc `generate-fiches.mjs`) passent de
    `engine/src/twin9/` à `web/src/lib/twin9/`, avec `pyText`, `pyStr` et le `pyRound` qu'il importe,
    et leurs tests. De `referentiel.js` ne restent que `parsePole`, la classe `Pole` qu'il rend et
    les noms des pôles : `permutation`, `loadReferentiel`, `polesFromStructure`, `allCompetences` et
    `ficheComplete` servaient le moteur du navigateur et partent avec lui, comme `stableHash` et
    `md5`, que seule `permutation` appelait. Le cas réel de l'adaptateur lit la carte du scénario
    cloud de l'oracle de `Twin_v9` au lieu du vecteur du portage JavaScript. Ces tests tournent
    désormais dans la suite front, locale ; la CI moteur garde `parsePole` par UC-SYS-04-F10, qui
    exécute `extract-fiches.mjs`. `check-publiable` refuse tout `engine/src/twin9/`.
  - Retirés : `POST /api/twin9/appel`, son test (`Twin9AppelTest`), `makeServerBackend`,
    `FicheStore::injecter` ; la route répond désormais comme une route inconnue (`Twin9MetaTest`).
    `GET /api/twin9/meta` ne sert plus que ce que lisent la page du crédit et la cartographie
    ouverte : offre Twin6, promotion, packs, PayPal, structure du référentiel, solde, clé privée ;
    plus les étapes, l'offre Twin9, l'interrupteur ni le pipeline (`Twin9Config::publicView`). Le
    reste du moteur du navigateur avait quitté ce dépôt le 2026-10-17 ; il quitte aussi `Twin_v9`
    (code, vecteurs et leurs générateurs, `gen-oracles.sh`, `run-helpers.js`), dont les
    spécifications `docs/twin9/` deviennent celles du moteur PHP.
  - Rétablie : l'entrée « Analyse approfondie » (premium) de « Ma cartographie », masquée « jusqu'au
    lot 3 » le 2026-10-17.
  - Cas d'utilisation : UC-APP-10 réécrit pour l'analyse sur le serveur (lancement, aperçu,
    admission, suivi, annulation, reprise, plafonds, visibilité, clé personnelle, autre
    référentiel, mode essai), avec ses tests sur le moteur factice : 13 unitaires et 19
    fonctionnels (7 et 15 sur l'API, 6 et 4 sur l'interface) au lieu des 45 et 28 du moteur du
    navigateur ; ses sept anomalies quittent l'index, avec le code qu'elles décrivaient. UC-ADM-05
    vérifie chaque réglage par son effet sur les runs (estimation, profils) au lieu du proxy ;
    UC-PRO-08 et UC-APP-09 suivent ; UC-APP-11, UC-CPT-04, UC-APP-01, UC-APP-03, UC-APP-04,
    UC-APP-06, UC-SYS-04 et le catalogue mis à jour. ADR-010 révisé (§1, §2) ;
    `docs/contrats.md`, `docs/strategie-tests.md`, `docs/securite-checklist.md`, `INSTALL.md`,
    `CLAUDE.md`.
  - Vestiges laissés en place, à décider (règle 6) : les réglages `enabled` et `pipeline`, que
    l'import écrit et que plus rien ne lit ; les étages des modèles de l'offre, que la supervision
    édite et que plus rien ne lit (un profil ne demande à un modèle qu'un prix) ; le rythme
    `appels_par_minute`, qui ne borne plus que la cartographie ouverte ; le magasin des fiches
    `twin9_fiches`, que l'import écrit et que le déploiement régénère, qu'aucun run ne lit (T16) ;
    `LeakFilter::redact`, que ses seuls tests appellent ; `twin9_cle_perso_ouverte` dans `/meta`,
    que lit `fetchTwin6Offer` sans qu'aucune vue s'en serve. Les retirer touche l'import, la
    supervision, le déploiement et leurs cas d'utilisation (UC-PRO-08, UC-ADM-05, UC-SYS-02).
    (Retirés le 2026-10-20, à la demande de Christian : entrée « Gabarits Twin6 versionnés… ».)
  - Limite notée : la page de l'analyse (`#/twin9`) n'a pas de titre de niveau 1, comme
    Configuration.
  - Régression de T17, réparée dans un commit à part : les scénarios bout en bout de la
    cartographie chargent `carto/core/model.js` sous Node, par leurs fixtures ; il importe
    `referential.js`, où T17 a ajouté l'import de `poleColor` par l'alias `@engine` de Vite, que
    Node ne résout pas — la suite e2e s'arrêtait avant son premier test. Il l'importe par son
    chemin ; seule la suite e2e, locale, le garde.
  - Revue indépendante (un agent neuf, sur les deux branches) : aucun point bloquant ; ses
    corrections sont faites — ADR-010 et UC-PRO-08 disaient qu'aucun nom de gabarit ne sort plus,
    or l'attestation d'un run nomme les siens pour son propriétaire et le cartographe lié ; les
    tests front de l'oracle lisent `TWIN_V9_DIR` ; UC-APP-10-F14 ne dépend plus de la durée d'une
    tranche ; des commentaires et des dates.
  - Vérifié : suites moteur (362 verts), front (2 681 verts ; `twin6-prompt-package.test.js` ne se
    charge pas sans le paquet Twin6, comme avant T11) et PHP (1 670 verts, aucun sauté, avec
    `TWIN_V9_DIR`) ; `check-publiable` vert ; bout en bout, les 19 scénarios passent, moteur
    factice pour Twin9 — deux relancés seuls : `twin9-run`, que le quota local d'inscriptions
    (dix par heure) arrêtait après des passages précédents, et `parcours-promptologue`, derrière
    un routeur (ci-dessous). Reste à confirmer, ici impossible : `npm run build`, dont le
    `prebuild` s'arrête, comme avant T11, à `build-twin6-package.mjs`, faute des gabarits Twin6
    (`web/public/data/`, non versionné) ; `generate-fiches`, `build-viewer` et `vite build`
    passent.
  - Constaté, hors T11 (règle 6, noté) : `php -S localhost:8080 -t api/public`, la commande
    d'INSTALL.md et de `docs/tests-e2e.md`, prend pour un fichier toute URL dont le dernier
    segment porte un point (`…/1.0.0`, une version de paquet) et répond 404 sans passer par
    `index.php` : `parcours-promptologue` échoue au diff. Derrière un routeur (`php -S
    localhost:8080 -t api/public api/public/index.php`), comme derrière Apache en production, il
    passe.

- 2026-10-20 — **Moteur Twin9 en PHP, T17 : plusieurs référentiels, la cartographie (branche
  `feat/twin9-t17-cartographie`).** La carte d'un run s'ouvre dans la cartographie avec son
  référentiel, RESPIRE ou celui d'une autre structure (`docs/contrats.md` §10). T8 (base commune et
  stratégie A, #11) et T16 (#12 ; `Twin_v9` #17) ont été fusionnés le 2026-10-20.
  - Formats : un document `cartographie-jour` ou `cartographie-merge` d'un autre référentiel le
    nomme (`referentiel`, facultatif) et compte alors 1 à N pôles, aux codes de ce référentiel (le
    `$defs/code` du schéma `referentiel`) ; sans nom, RESPIRE garde sa structure (7 pôles, codes
    `P.NN`), comme dans le schéma `referentiel` : les validations de l'extraction, de la masse, du
    banc et de la relecture gardent leur garantie. Le code d'une compétence (`competence`)
    s'élargit de même. Validateurs compilés régénérés ; chaque changement est noté dans
    `docs/contrats.md` §10. Un document de RESPIRE reste valide tel quel, et sa fusion identique à
    l'octet (parité du document : 100 %).
  - Couleurs et marques : `POLE_PALETTE` (moteur) prolonge les 7 couleurs de RESPIRE de 5 autres,
    choisies et validées avec le script de la skill dataviz telles que l'interface les affiche, dans
    ses 5 palettes et ses 2 thèmes, sur les voisins du soleil de 8 à 12 pôles (bouclage compris) ;
    un pôle sans couleur déclarée prend celle de son rang (il prenait un gris unique : les pôles des
    référentiels de test se confondaient). Les marques des distinctions renforcées passent de 8 à 12
    (quatre motifs nouveaux dans `Sun.jsx`). Un pôle lettré (`num: "A"`) d'un document venu
    d'ailleurs reçoit son numéro d'ordre ; ceux de la plateforme sont déjà numérotés (T15).
  - Serveur : les résultats d'un run portent son référentiel (`Resultats::referentiel`) — les pôles et
    compétences que son moteur a lus, gardés dans ses réglages, avec les couleurs de leur version ;
    ni fiche, ni préambule, ni description.
  - Front : « Ouvrir dans la cartographie » vaut pour tout référentiel (la restriction de T16 est
    levée) ; le document `twin9-run` porte le référentiel du run, complété des descriptions du
    référentiel publié de même identifiant (RESPIRE) ; le jeu neuf l'adopte ; son titre le nomme
    (`Twin9 · <journal> · <libellé>`).
  - Moteur factice : son tribunal juge la première compétence de chaque pôle du référentiel du run
    (1.01 seule sans référentiel), pour que chaque pôle ait son secteur.
  - Tests : schémas (moteur et PHP), adaptateur Twin9 (5 pôles lettrés, 9 pôles, schéma strict),
    référentiel et importeur de l'interface, cartographie (`Referentiels.test.jsx` : la carte
    lettrée, celle à 9 pôles, leurs couleurs et leurs motifs, les deux jeux qui coexistent), page du
    run, résultats (`RunsTest` : le référentiel porté ; deux cartes sur un même portfolio, qui ne
    partagent ni carte, ni mémoire, ni copie du profil). Recette de bout en bout
    `web/e2e/twin9-referentiels.e2e.js` : RESPIRE, le référentiel lettré et celui à 9 pôles sur un
    même portfolio — chacun ses deux journées à instruire, sa carte avec les noms de ses pôles, sa
    mémoire, son attestation —, trois jeux qui coexistent (`docs/tests-e2e.md`, « T17 »).
  - Revue indépendante (un agent qui n'avait pas écrit le lot), sans point bloquant ; corrigés avec
    leurs tests : le dépôt d'une journée par la masse et la révision d'une cartographie acceptaient
    un document qui nommait un autre référentiel que le leur, ce qui le sortait des contrôles de
    RESPIRE (désormais `422`) ; un identifiant de référentiel s'écrit en minuscules (« RESPIRE »
    n'en nomme aucun) ; la synthèse évolutive d'un pôle se rangeait sous le début du code de sa
    première compétence (« 21 » au pôle 2 donnait le pôle 21 : désormais les numéros du
    référentiel du run) ; les radars comptaient « sept pôles » ; un numéro de pôle « 3.5 » ou nul
    passait pour une lettre ou le pôle 0 ; un référentiel du run illisible était ignoré sans le
    dire ; le nom court d'un pôle lettré est sa lettre. Documentés : la couleur d'un pôle est celle
    que sa version a dans la base (un brouillon retouché donne la sienne) ; en deçà de 8 pôles, le
    bouclage des couleurs n'est validé qu'à 3, 5 et 7 (`docs/contrats.md` §10).
  - Reste hors T17 : la page publique `#/referentiel` ne montre que RESPIRE.

- 2026-10-20 — **Moteur Twin9 en PHP, T16 : plusieurs référentiels, le moteur (branche
  `feat/twin9-t16-moteur`, sur celle de T8 ; `Twin_v9` : `feat/twin9-t16-moteur`).** Le moteur lit
  le référentiel du run, tiré de la base, et non plus celui de la v9.8 (`docs/contrats.md` §8.8).
  Plan validé par Christian le 2026-10-20 : « Pas de modification du nombre de jurés dans le
  Twin_V9. Ok avec tout le reste du plan pour T16. »
  - Moteur (`Twin_v9`) : `Referentiel::depuisBloc` lit le référentiel que donne la plateforme
    (`{id, version, label, motif, poles: [{num, nom, entete, competences: [{code, nom, fiche}]}]}`) et
    en tire ce que la v9.8 écrivait de RESPIRE : noms et clés des pôles (profil ipsatif, jury), nombre
    de compétences, forme des codes, nom du référentiel, ordre des codes. Il refuse un pôle sans
    compétence, des pôles qui ne se numérotent pas de 1 à N, un code hors du motif, en double ou fait
    de chiffres seulement (PHP en ferait un nombre). Sans référentiel, il lit RESPIRE dans les
    fichiers de pôle du jeu, comme l'oracle. Le jury garde ses sièges : un pôle de RESPIRE, reconnu à
    sa clé, assoit les spécialistes de la v9.8 ; un autre, le « Spécialiste du pôle ».
  - Gabarits : `php/protocole/` copie les 22 gabarits de la v9.8, sans les fichiers de pôle, avec
    `{$NB_COMPETENCES}`, `{$FORMAT_CODE}`, `{$REFERENTIEL}` et `{$LISTE_COMPETENCES}` là où elle
    écrivait « 61 », « X.YY », « RESPIRE » et `{$LISTE_61}` ; l'original reste intact pour l'oracle.
    Pour RESPIRE, la copie rend le texte de la v9.8, et RESPIRE donné comme le donne la plateforme,
    à travers elle, rejoue les dix-sept scénarios de l'oracle, appels, prompts et sorties, octet pour
    octet.
  - Fournisseur simulé minimal (`php/tests/Simule.php`) : la plus petite réponse valide de chaque
    étape. Un référentiel à 5 pôles lettrés (A1 à E4) et un autre à 9 pôles traversent journées,
    tribunal (cinq sièges, dont le spécialiste du pôle), second ressort, Arpenteur et fusion, sans
    « RESPIRE », « 61 » ni « X.YY » dans leurs prompts (DoD).
  - Plateforme : `Twin9\ReferentielMoteur` tire le référentiel de la base à la version que fige le
    profil — RESPIRE avec les fiches de `FicheGenerator` (le vrai moteur les lit comme les fichiers
    de pôle de la v9.8, testé), un autre avec des fiches écrites depuis son document, codes dans leur
    ordre naturel — et le met dans les réglages du moteur ; son empreinte entre dans celle des
    réglages (la mémoire), l'attestation et la signature des évaluations ; le filtre de fuite indexe
    ses fiches (résultats et export) ; la prévision compte le plus grand pôle. Le refus de T15 est
    levé ; un référentiel que le moteur ne lit pas est refusé au lancement (`422`, le code fautif
    nommé) ; RESPIRE sans ses fiches dans la base, `503` (INSTALL.md §3 les sème désormais).
  - Import : il lit `php/protocole` ; complet (tous les gabarits que nomme le contrat des
    variables), il remplace le jeu v9.8 : un gabarit qu'il ne porte pas en sort, archivé (les
    fichiers de pôle) ; partiel, il n'ôte rien. Il répond `{imported, retires}`. L'appel du
    navigateur reçoit les nouvelles variables aux valeurs de RESPIRE ; le contrat des variables les
    nomme.
  - Front : « Ouvrir dans la cartographie » reste à RESPIRE jusqu'à T17 ; pour un autre
    référentiel, la page du run le dit.
  - Revue indépendante (un agent qui n'avait pas écrit le lot), ses constats corrigés chacun avec
    un test qui échouait sans lui : un moteur d'avant T16 ignorait le référentiel et, avec un jeu qui
    garde ses fichiers de pôle, faisait payer un run de RESPIRE attesté sur un autre référentiel
    (désormais `503`, le moteur reconnu à `ReferentielInvalide`) ; un jeu d'avant T16 — le jeu v9.8
    pas encore réimporté, une copie faite avant — demandait les codes de RESPIRE sur un autre
    référentiel (désormais `422`, RESPIRE seul servi) ; le nom de RESPIRE dans les prompts suivait son
    libellé (« RESPIRE v8.0.0-rc.1 », « RESPIRE 2027 ») et l'aurait fait sortir de la v9.8 ; un import
    partiel ôtait des gabarits du protocole, et un nom écrit à une autre casse pouvait ôter ce qu'il
    venait d'écrire ; un code de RESPIRE sans fiche donnait le `503` de l'instance (désormais `422`,
    le code nommé) ; la lentille du « Spécialiste du pôle » n'entrait dans aucune empreinte des
    journées ; les journées de la mémoire d'une carte n'étaient filtrées que contre les fiches du
    dernier run ; la parité de la plateforme rejouait encore l'oracle avec les fichiers de pôle
    (désormais avec `php/protocole` et RESPIRE tiré de la base, l'ancien chemin gardé pour les runs
    d'avant T16). Reste documenté (§8.8) : ce que la publication accepte sans que le moteur le lise.
  - Seconde revue indépendante, sur ces corrections, sans point bloquant ; corrigés avec leurs
    tests : un import partiel ôtait les fichiers de pôle d'un jeu d'avant T16, qui ne se disait plus
    tel (désormais seul un import complet remplace le jeu) ; le remède proposé pour une copie d'avant
    T16 ne valait pas quand le jeu v9.8 lui-même précède T16 ; la page des analyses proposait de
    lancer avec un moteur d'avant T16 (désormais non, les runs déjà lancés avançant toujours) ; le
    contrat des variables se lisait après l'écriture des gabarits ; le message d'une erreur imprévue
    du moteur parlait encore de fiches du jeu ; les clés des pôles de RESPIRE suivaient les titres
    de leurs préambules, que la base garde (désormais celles de la v9.8). Sans objet, le schéma
    gardant à toute version de RESPIRE 7 pôles et 61 codes « X.YY » : une version de RESPIRE à
    62 compétences servie par un jeu d'avant T16, ou un pôle 8 de RESPIRE sans préambule dans la
    base.
  - Textes : `docs/contrats.md` (§8 à §8.7, nouveau §8.8, §9), UC-PRO-08 (A4, limites), UC-EPI-05
    (RG8, L4), `docs/autorisations.md`, `docs/tests-e2e.md`, INSTALL.md, STATUS ; `Twin_v9` : le
    plan.
  - Tests : dans `Twin_v9`, `ReferentielsTest` (la copie rend l'original ; RESPIRE par le bloc ;
    autres structures ; douze refus ; sièges du jury), `SimuleTest` (la DoD), `OracleTest` (la copie
    et le bloc rejouent l'oracle), `PlateformeTest` ; ici, `ReferentielMoteurTest` (RESPIRE pris dans
    la base et lu par le vrai moteur comme les fichiers de pôle, fiches écrites depuis le document,
    ordre naturel, `503`, un code sans fiche, empreinte, et, avec le vrai moteur, le refus au
    lancement), `RunsTest` (un run sur 9 pôles, son attestation ; une fiche récitée, expurgée, même
    gardée par la mémoire sous une version ancienne ; un moteur ou un jeu d'avant T16 refusés),
    `PurgeExportTest` (de même à l'export), `AppelsDirectsTest` (l'empreinte), `Twin9ProtocoleTest`
    et UC-PRO-08 (complet, l'import remplace le jeu ; partiel, il n'ôte rien), `JeuxGabaritsTest` (le
    jeu de `php/protocole`), `PariteTest` (l'oracle par les tranches, comme la plateforme le lance
    depuis T16, et un run d'avant), `Twin9View.test`, bout en bout `twin9-run.e2e.js` (les fiches
    semées).
  - Déploiement (T18) : la plateforme de T16 demande un `Twin_v9` d'après T16 sur le serveur (sans
    lui, le lancement répond `503`), puis l'import du jeu de T16 et RESPIRE avec ses fiches dans la
    base (`seed-competences`).
  - Limites (§8.8) : les fiches de RESPIRE sont celles que la base publie au lancement, non celles
    de l'instantané de la version figée ; la mémoire d'une carte est rangée par référentiel, non par
    version : une journée gardée sous une version ancienne entre telle quelle dans la fusion ;
    l'import de T16 change l'empreinte des réglages, et la mémoire relira chaque journée une fois ;
    sans évaluation, la référence ignore la taille des fiches d'un autre référentiel ; un référentiel
    que le moteur ne lit pas (codes faits de chiffres, pôle sans compétence, nom fait d'espaces) se
    publie, et n'est refusé qu'au lancement ; la lentille du spécialiste du pôle a l'empreinte de son
    texte, pas une version déclarée.
  - Idées, non codées (règle 6) : lire les fiches de RESPIRE dans l'instantané de la version figée
    (`referentiel_snapshot_competences`) ; vérifier à la publication qu'un référentiel se lit par le
    moteur ; ranger la mémoire d'une carte par version de référentiel, ou écarter à la fusion les
    codes qui l'ont quittée (avec T17).

- 2026-10-19 — **Moteur Twin9 en PHP, T8 : la base commune et la stratégie A, choisies par Christian
  (branche `feat/twin9-t8-strategie-a`, sur celle de T15 ; `Twin_v9` : `feat/twin9-t8-vagues`, sur
  celle de T10).** Par lots, chaque vague d'appels attend un lot entier : il faut en faire le moins
  possible, sans épuiser le crédit d'une personne avant qu'une carte soit finie (`docs/contrats.md`
  §8.3 et §8.7).
  - Moteur (`Twin_v9`) : la fusion lance ensemble ce que la v9.8 enchaîne sans que les appels se
    lisent (faisceaux du second ressort, relectures avant le rapporteur, condensés et retours aux
    sources de l'Arpenteur) ; la passe qui finit les joue dans l'ordre de la v9.8, et l'oracle reste
    identique à l'octet. PLANT-01 passe de 286 vagues à 27, de 310 à 30 avec l'Arpenteur (un test
    le fixe). L'aperçu du moteur donne la taille de chaque journée, et les journées que la mémoire
    garde au-delà de celles qu'un run prend (la carte est additive : la fusion les relit).
  - Par lots, toutes les journées du run sont de front ; `parallelisme.journees` ne règle plus que
    la voie directe.
  - Historique des évaluations (migration 030, `Twin9\Evaluations`) : un run fini laisse, sans
    aucun contenu, la personne évaluée, la taille en Ko de chaque journée de sa carte avec ce qu'elle
    a coûté (rien pour une journée reprise de la mémoire ; marquée quand un appel a échoué), le coût
    de la fusion, le plus grand pire cas réservé par un appel d'une journée et de la fusion, le coût
    final, la durée, et les réglages du profil : modèles et performance, paramètres de l'algorithme,
    jeu de gabarits. La suppression du compte anonymise la ligne (SET NULL), qui reste pour les
    prévisions ; l'export du compte la porte avec son run. Un échec de la consignation n'empêche
    jamais le run de finir.
  - Prévision : une journée coûte une part fixe (les fiches de son pôle, dans chaque prompt de
    lecture) et une part par Ko, ni l'une ni l'autre négative, une fusion de même par les Ko de sa
    carte : la droite des moindres carrés des 200 dernières évaluations de mêmes réglages, converties
    à la voie et à la marge du run. Entre les tailles observées, au plus bas et au plus haut, les
    écarts extrêmes ; au-delà, ce qu'un tel coût permet (sous la plus petite taille, au plus ce
    qu'elle a coûté ; au-dessus de la plus grande, au plus autant au Ko). À défaut, le vrai run de
    PLANT-01. Elle remplace la moyenne par journée des runs du même profil.
  - Admission (stratégie A) : un lancement prend les premières journées que le crédit — moins ce que
    les autres analyses en cours de la personne peuvent encore en dépenser — ou le budget tient, au
    coût le plus haut, avec la fusion de leur carte et de quoi réserver le pire cas d'un appel (T10) ;
    les autres attendent une prochaine analyse, une journée changée restant d'ici là dans sa version
    déjà évaluée. Un profil qui relit tout (`rescan`, sans mémoire) prend tout ou rien. Le run garde
    la fusion en réserve, et ce qui lui est accordé (`engagement`) : un appel d'une journée n'entame
    jamais la réserve, ni aucun appel ce que les autres runs en cours peuvent encore dépenser
    (`crédit insuffisant (fusion réservée)`, `budget atteint (fusion réservée)`, `crédit insuffisant
    (engagé par vos autres analyses)`, qui se reprennent comme les arrêts par le crédit ou le budget).
    Refusé, le lancement dit ce qu'il faudrait ; la page le dit d'avance et ne laisse pas lancer. Un
    lancement à la fois par personne. La page de lancement dit la fourchette et les journées admises,
    la page du run son admission.
  - Deux revues indépendantes du lot (des agents qui ne l'avaient pas écrit). La première, quatorze
    points, corrigés chacun avec un test qui échouait sans lui : la fusion d'une carte coupée
    sous-estimée (droite par l'origine) ; la carte relue par la fusion comptée sans les journées de
    la mémoire ; les autres runs en cours ignorés ; un arrêt par la réserve sans issue sur la page ;
    les pires cas réservés avant chaque appel absents de l'admission ; une seule taille mal reconnue
    par arrondi ; une signature sans les paramètres de l'algorithme ni le jeu de gabarits ; les
    profils qui relisent tout ; les journées en panne comptées comme des journées ; toutes les
    évaluations relues ; un échec de consignation qui bloquait le run ; les textes « observé » sans
    observation ; le bouton de lancement actif sur un refus ; le cache de mémoire de l'oracle nourri
    par le test par passes. La seconde, sur ces corrections : ce que les autres runs peuvent encore
    dépenser, figé en début de tranche quand le crédit était lu à chaque appel (désormais lus
    ensemble, à chaque appel) ; le pire cas d'un appel qui peut dépasser celui observé ou la
    journée de référence (désormais au moins ce que disent ses réglages) ; une reprise sans
    admission ; la signature, qui ne voyait ni le contenu du jeu de gabarits ni la version du
    référentiel ; la source « observé » quand une part venait de la référence ; une perte de
    transaction pendant la consignation. La suite complète a ajouté la couverture d'export de
    l'audit RGPD.
  - Textes : `docs/contrats.md` (§7.1, §8.3, §8.5, §8.7), registre RGPD (§13, §13 bis) et
    vérification RGPD, schéma d'archive (description), `docs/tests-e2e.md`, STATUS. UC-APP-10 décrit
    encore le moteur du navigateur (T11) : il n'est pas repris ici.
  - Tests : `EvaluationsTest` (consignation sans contenu ni identifiant de journée, carte additive,
    panne, pires cas, anonymisation, échec de consignation ; droites, écarts, au-delà des tailles
    observées, une seule taille, conversion par lots et marge, 200 dernières, signature),
    `ApercuTest` (estimation et sa source, carte gardée par la mémoire, admission, refus et ses
    trois formes, budget, journées changées en attente, autres analyses en cours), `CoutsTest` (la
    réserve, en direct et par lots ; l'engagement d'un autre run, lu avec le crédit dans la même
    tranche ; la reprise admise de nouveau), `LotsTest` (toutes les journées de front),
    `PurgeExportTest`, `RgpdAuditTest`, `Twin9View.test`, bout en bout `twin9-run.e2e.js` ; dans
    `Twin_v9`, l'oracle, le compte des vagues et l'aperçu.
  - À valider : la base légale proposée pour l'historique, l'intérêt légitime (registre §13 bis) ; le
    coût le plus haut observé pour admettre (plutôt que la moyenne), et la place gardée pour le pire
    cas d'un appel ; l'anonymisation plutôt que l'effacement à la suppression du compte ; la droite
    (part fixe et part par Ko) et ses bornes ; ce que l'historique garde en plus de la liste demandée
    (coût de chaque journée et de la fusion, pires cas, paramètres de l'algorithme et jeu de
    gabarits), pour tracer ces droites et comparer ce qui est comparable.

- 2026-10-19 — **Moteur Twin9 en PHP, T15 : plusieurs référentiels, la gouvernance (branche
  `feat/twin9-t15-referentiels`, sur celle de T14 ; `Twin_v9` : `feat/twin9-t15-referentiels`).**
  La gouvernance accepte un référentiel de toute structure : l'épistémiarque l'importe et choisit le
  niveau qui tient lieu de compétence ; un code hors du motif de son niveau est refusé ; un brouillon
  sert aux runs d'essai de son auteur (`docs/contrats.md` §9, UC-EPI-05). Plan validé par Christian
  avec ses trois choix : le lancement refuse un autre référentiel que RESPIRE jusqu'à T16, une section
  d'atelier, des codes de 8 caractères au plus. Le référentiel alternatif consulté
  (respire.school/referentiel, l'Humanome V18 : 5 pôles A à E, 20 capacités, 64 facettes) a guidé le
  format ; rien de lui n'entre dans le dépôt, les tests prennent deux référentiels fictifs.
  - Schéma `referentiel` 2.0.0 : pôles numérotés de 1 à N, `niveaux` déclarés avec le motif de leurs
    codes (sans eux, le niveau et le motif de RESPIRE), `elements` des niveaux plus fins, descriptions
    en Markdown ; l'empreinte ne change pas de définition. RESPIRE garde sa structure par une clause du
    schéma (7 pôles, 61 compétences « P.NN », aucun niveau déclaré) : tout chemin vers une de ses
    versions la respecte, la coupe de sa release comprise. Validateurs compilés régénérés.
  - Import (`POST /api/referentiel/import`, épistémiarque ou admin) : validé tel quel, lu au niveau
    choisi (`ReferentielRepository::auNiveau`), validé de nouveau, brouillon de l'importateur ; RESPIRE
    refusé (`409`). Le cycle du grain document s'ouvre à tous les référentiels (listes, fork avec
    `referentiel`) ; `GET /api/referentiels` rend les publiés.
  - Profils et runs : `ProfilPolicy` admet le brouillon de son auteur en mode essai (tant qu'il est
    épistémiarque ou admin), la page Configuration le propose ; le lancement et l'aperçu refusent un
    autre référentiel que RESPIRE tant que le moteur lit les fiches de son jeu de gabarits (T16).
  - Annotations : le code d'une annotation appartient au référentiel que la cartographie désigne ;
    sans référentiel désigné, la forme de RESPIRE.
  - Front : section « Autres référentiels » de l'atelier épistémiarque (`#/epistemiarque/referentiels` :
    importer un fichier et choisir son niveau, lire le document (« Voir »), soumettre, voter, retirer,
    publier ; un refus montre ses pointeurs et écarte le fichier) ; brouillons proposés dans la page
    Configuration ; aide de l'atelier.
  - Revue indépendante du lot, ses constats corrigés avec leurs tests : un motif reste entre ses
    ancres (il compile seul, aucun verbe `(*…)`) et s'évalue sous une limite de retour arrière (un
    motif catastrophique coûtait une minute de calcul pour 2 000 codes) ; une branche qui s'arrête
    au-dessus du niveau choisi est refusée et nommée au lieu de disparaître ; un fork prend un
    `referentiel` de la forme d'un identifiant et garde celui de sa source (la colonne ignore la casse :
    « Respire » aurait classé une version de RESPIRE à part) ; un pôle numéroté `1.0` ne donne plus un
    `500` ; le document au vote se lit avant le vote.
  - Textes : UC-EPI-05 (nouveau), UC-EPI-03 et UC-EPI-04, le catalogue des cas et `SUMMARY.md`,
    `docs/autorisations.md` (P4, « Configuration Twin9 », runs), `docs/contrats.md` (§1, §3, §9).
  - Tests : UC-EPI-05 (U01-U10, F01-F15, dont la DoD : un référentiel à 5 pôles lettrés, A1 à E4,
    s'enregistre, se vote et se publie, un autre à 9 pôles aussi ; RESPIRE ne change pas),
    `ConfigurationDroitsTest` (la ligne de la matrice), `RunsTest` (le refus du lancement),
    `AnnotationsTest`, `ConfigurationView.test`.
  - À trancher (T8, voie par lots) : mesuré sur l'oracle de PLANT-01 (10 journées, toutes de front),
    un run fait 286 vagues d'appels, dont 15 pour les journées et 271 pour la fusion, que la v9.8
    enchaîne un appel après l'autre (25 faisceaux du second ressort, 21 relectures) ; par lots,
    chaque vague attend un lot. Base commune proposée : lancer ensemble les appels indépendants de la
    fusion (aucun prompt ne change) : 27 vagues. Puis A, toutes les journées de front avec une réserve
    de crédit pour finir la carte, ou B, des lots chronologiques de journées, une carte à chaque lot.
    Regrouper ou découper les journées changerait le protocole sans raccourcir le run. Tranché par
    Christian le 2026-10-19 : la base commune et A (entrée T8 ci-dessus).
  - Pas encore : le moteur (T16) et la cartographie (T17) ne lisent que RESPIRE ; la page publique du
    référentiel ne montre que lui ; l'import lit du JSON au format du schéma (le Markdown de la V18 se
    convertit d'abord) ; UC-EPI-04 AN2 (libellé ou version trop longs : `500`) vaut aussi à l'import ;
    l'attestation d'un run désigne son référentiel par `id@version`, et un brouillon peut changer
    ensuite : quand le moteur lira ce référentiel (T16), elle devra aussi en garder l'empreinte.

- 2026-10-19 — **Moteur Twin9 en PHP, T14 : les jeux de gabarits (branche
  `feat/twin9-t14-template-sets`, sur celle de T10 ; `Twin_v9` : `feat/twin9-t14-template-sets`).** Un
  promptologue de l'atelier copie le jeu v9.8, qui reste en lecture seule, édite sa copie avec les
  versions et le retour arrière de l'atelier, et la choisit dans son profil ; l'administrateur fixe le
  jeu par défaut (`docs/contrats.md` §8.6). Sans réponse à « Qui voit les gabarits ? », D2
  s'applique : l'atelier reste aux comptes à la fois administrateur et promptologue
  (`TemplateSets::ATELIER`).
  - Migration 029 : `twin9_jeux` (une copie, son nom, son auteur), `twin9_jeux_gabarits`,
    `twin9_jeux_versions` ; le jeu v9.8 reste dans `twin9_protocole`, que seul l'import écrit.
  - `ProtocoleRepository` travaille sur un jeu (le jeu v9.8 par défaut) ; `TemplateSets` copie le
    jeu v9.8 (chaque gabarit tel quel, sans son histoire), réserve l'écriture d'une copie à son auteur
    et à ses gabarits, dit les jeux qu'un compte choisit (le jeu v9.8, le jeu par défaut, ses copies
    tant qu'il est de l'atelier) et garde le jeu par défaut (`twin9_gabarits_defaut`).
  - Une variable qu'aucune étape ne fournit est refusée à l'enregistrement : le contrat des
    variables, repris de `Twin_v9`, complété de `MA_POSITION_R1` et `LISTE_61` que le moteur fournit,
    entre dans `schemas/twin9-protocole-contrat.json` (livré avec la release, `stage-api.sh`) ;
    s'y ajoutent les variables de l'original v9.8 du gabarit.
  - Routes : l'atelier passe par jeu, `/api/twin9/admin/jeux/{jeu}/protocole…` et `…/tester`, et
    copie par `POST /api/twin9/admin/jeux` (admin ∧ promptologue) ; l'administrateur lit les jeux
    (`GET /api/twin9/admin/jeux`, sans contenu) et fixe le jeu par défaut (`PUT
    /api/twin9/admin/jeux/defaut`). Les anciennes routes `/api/twin9/admin/protocole…` partent.
  - Profils et runs : `ProfilPolicy` admet un jeu que le propriétaire peut choisir (un profil resté
    sur un jeu qui ne lui est plus proposé est refusé, comme une clé personnelle fermée) ; le profil
    par défaut prend le jeu par défaut ; un run prend le jeu de son profil comme instantané, son
    attestation le nomme, et chaque jeu a sa mémoire de carte. Le lancement refuse (`422`) une copie
    à qui manque un gabarit du jeu v9.8 et un jeu que le moteur ne lit pas (fiche mal formée), au
    lieu d'une erreur du serveur.
  - Front : `#/twin9-atelier` choisit le jeu (le vôtre, en lecture seule pour le jeu v9.8 et la copie
    d'un autre), copie le jeu v9.8 sous un nom ; `#/admin/twin9` fixe le jeu par défaut ; aide de
    l'atelier.
  - Textes : UC-PRO-08 et UC-ADM-05 (scénarios, règles, tests), `docs/autorisations.md` (matrice
    « Configuration Twin9 », P12, AD-D2), `docs/contrats.md` (§7, §8.4, §8.6), registre RGPD et
    `docs/rgpd-verification.md` (migration 029), `rgpd-audit`.
  - Tests : `JeuxGabaritsTest` (dont la DoD : un mot changé dans une copie se retrouve dans le prompt
    rendu, moteur factice et vrai moteur de `TWIN_V9_DIR` ; le jeu v9.8 ne change jamais ; les copies
    incomplètes ou illisibles refusées au lancement ; le contrat couvre les gabarits v9.8),
    `Twin9ProtocoleTest` et UC-PRO-08 réécrits par jeu (U12-U14, F23-F24), `ConfigurationDroitsTest`
    (les jeux d'un profil, dont un ancien jeu par défaut), UC-ADM-05 (U14, F18), `RgpdAuditTest`,
    UC-SYS-03-U07 ; front : `Twin9AtelierView.test` (dont une réponse tardive d'un jeu quitté),
    `ConfigurationView.test` (un jeu qui n'est plus proposé).

- 2026-10-19 — **Moteur Twin9 en PHP, T10 : coûts, clés, relance, purge (branche
  `feat/twin9-t10-costs`, sur celle de T9 ; `Twin_v9` : `feat/twin9-t10-costs`).** Chaque appel d'un
  run paie son coût réel, son pire cas réservé avant de partir ; un run ne dépasse jamais son budget
  et s'arrête à ses plafonds, sa carte incomplète, pour reprendre ; la page dit avant de lancer ce
  que le run instruira et coûtera ; le compte emporte ses runs, ses lots chez Anthropic compris, et
  son export les contient (`docs/contrats.md` §8.5).
  - Migration 028 : `twin9_appels.reserve_microusd`, `twin9_runs.debut_at` et `actif_s`, table
    `twin9_lots_a_effacer`.
  - Coûts (`Twin9\RunCosts`) : la grille couvre Haiku 5.5 (0,10 $ / 0,50 $ le million, 0,50 $ /
    2,50 $ au-delà de 100 000 jetons de prompt, `palier_long`) et Sonnet 5.5 (2 $ / 10 $) ; le coût
    d'un appel est l'usage rendu, à moitié prix par lots, marge comprise avec la clé de l'instance,
    sans elle avec la clé de la personne (`Twin9Config::coutMicrousd`). Avant chaque envoi, direct ou
    par lot, le pire cas (octets du prompt, budget de sortie) est réservé et, avec la clé de
    l'instance, débité du crédit dans la transaction qui écrit l'appel (`CreditService` rejoint une
    transaction ouverte) ; la réponse le solde (réconciliation par modèle), un run arrêté, annulé ou
    fini rend le reste. Un profil dont un modèle n'a pas de prix est refusé (`ProfilPolicy`).
  - Plafonds : budget et durée de la copie du profil. Ce qu'un run a engagé ne dépasse jamais son
    budget ; un appel qui le dépasserait ne part pas, le run s'arrête une fois rien dehors (`echoue`,
    « budget atteint : carte incomplète ») ; de même pour sa durée, comptée depuis son lancement ou
    sa dernière reprise, et pour le crédit. `POST …/reprendre` accepte un nouveau budget. Le suivi
    donne le coût réel et les plafonds ; les compteurs, les journées instruites et la durée active.
  - Avant de lancer (`POST /api/twin9/runs/apercu`, `Lancement::apercu`) : les journées nouvelles ou
    changées depuis la mémoire de la carte, par le moteur (`Plateforme::apercu`, dans `Twin_v9` et le
    moteur factice), et le coût et la durée estimés : la moyenne par journée des runs finis du même
    profil et du même mode, à défaut le vrai run de PLANT-01 (0,1344 $, 94 s, en essai) fois les
    pôles du référentiel. Rien n'est gardé.
  - Une clé par run : celle de l'instance ou celle de la personne (T7) ; aucune n'est écrite dans les
    tables du moteur, le grand-livre ni l'export (test).
  - Purge (`DELETE /api/auth/account`, `Twin9\RunPurge`) : ses lots chez Anthropic de sa propre clé
    annulés et supprimés avant que la clé parte ; ceux de la clé de l'instance confiés au tick
    (`twin9_lots_a_effacer`, l'identifiant Anthropic seul). Export (`GET /api/twin9/mes-analyses`,
    `Twin9\RunExport`) : runs, journaux, sorties et mémoire des cartes, filtrés, dans l'archive de
    compte (`analysesTwin9`, schéma 1.2.0, validateurs recompilés).
  - Front : `#/twin9` montre, l'accord donné, les journées à instruire, le coût et la durée estimés,
    les plafonds du profil, et prévient si le crédit ne suffit pas ; la page du run montre le coût,
    reprend sous un nouveau budget, renvoie vers la recharge, et ouvre la carte incomplète d'un run
    arrêté dans la cartographie, qui la dit incomplète (`twin9-run` : `incomplete`).
  - Textes : `docs/contrats.md` §8.5 et §4 (point 13), `docs/autorisations.md`,
    `docs/rgpd-verification.md`, le registre RGPD (§11, §13), la politique de confidentialité,
    l'aide de la rubrique, `docs/tests-e2e.md`.
  - Tests : `CoutsTest` (dont la DoD : plafonné à 1 $, le run s'arrête avant, et le dit ; aucune
    clé écrite), `ApercuTest` (dont : une journée ajoutée n'instruit qu'elle), `PurgeExportTest`
    (dont : après la purge, aucune ligne du compte dans les tables du moteur) ; les comptes des
    autres tests de runs ont du crédit ; moteur : `PlateformeTest::testThePreviewSaysWhichDaysARunInstructs` ;
    front : `Twin9View.test`, `twin9-run.test`, `archive.test` ; bout en bout : `twin9-run.e2e.js`.

- 2026-10-19 — **Moteur Twin9 en PHP, T9 : lancer, suivre, lire (branche `feat/twin9-t9-runs`, sur
  celle de T13).** Un run Twin9 se lance depuis le front, se suit, s'annule, se reprend et s'ouvre dans
  la cartographie, délibérations comprises (`docs/contrats.md` §8.1 et §8.4).
  - Migration 027 : `twin9_runs` reçoit `attestation`, `visibilite` (`privee`, `cartographe`) et
    `accord_at`.
  - Lancer (`Twin9\Lancement`, `POST /api/twin9/runs`) : un profil de la personne, ou celui de la
    v9.8, revalidé et admis, copié avec la version de son référentiel figée ; le jeu de gabarits
    vivant comme instantané ; l'accord exigé à chaque lancement. Les réglages du moteur viennent de
    cette copie seule (`MoteurReglages` : paramètres d'algorithme, backends aux modèles des étages,
    collège développé comme le fait `twin9.py`, graines et sels compris) : tirés du profil v9.8, ils
    rejouent le scénario `02-cloud` de l'oracle appel par appel (`PariteTest`). L'attestation garde le
    profil, les versions du jeu de gabarits (`ProtocoleRepository::jeu`), le référentiel et le commit
    du moteur (`EngineLoader::commit` : la tête de `TWIN_V9_DIR`, sinon son fichier `COMMIT`).
  - Suivre (`GET /api/twin9/runs/{id}`) : appels par état, journées finies, fusion, lots chez
    Anthropic, et en mots ce qui retient le run ; annuler, reprendre, visibilité. La page du run fait
    avancer les runs de son propriétaire par `POST /api/twin9/runs/avancer`, une tranche sous le
    verrou du tick (`Tick` : `twin9Utilisateur` ; `Twin9Slice`, `Twin9Lots::menage` et
    `RunRepository::aAvancer` filtrent par utilisateur), jamais avec le jeton du tick.
  - Lire (`Twin9\Resultats`, `GET /api/twin9/runs/{id}/resultats`) : les sorties et, pour les
    journées reprises de la mémoire, leurs cartes du jour, sans leur texte ; tout passe le filtre de
    fuite contre le jeu de gabarits du run (`LeakFilter::indexer`/`expurger`), le compte des
    expurgations à l'audit. Lus par le propriétaire, et par le cartographe lié si le run lui est
    visible ; l'administrateur n'a que des compteurs (`GET /api/twin9/admin/runs`).
  - Front : `#/twin9` (Twin9View) lance (profil, portfolio de la bibliothèque ou fichier, accord,
    visibilité), liste ses analyses ; `#/twin9/<id>` suit le run, le fait avancer, l'annule, le
    reprend, et l'ouvre dans la cartographie (`twin9RunFiles`, document `twin9-run`). L'interface en
    fait une journée par carte du jour, chaque verdict avec son dossier (`twin9Dossier` dans
    `engine/src/twin9/mapper.js` ; `carto/core/importers/twin9-run.js`) : traces et extraits (le
    surlignage marche), et, dans sa journée, le jury, le président, le débat et les pièces du greffier
    (`RunJury` montre tout juré et tous les temps du débat). Pas d'entrée de navigation avant le lot 3.
  - Textes : l'accord de Twin9View, la politique de confidentialité, le registre RGPD (§2, §8, §13),
    l'aide de la rubrique, la matrice « Runs Twin9 » de `docs/autorisations.md`.
  - Tests : `RunsTest` (9, moteur factice, chaque ligne de la matrice), `MoteurReglagesTest`,
    `PariteTest::testTheV98ProfileDrivesTheEngine`, `EngineLoaderTest` (commit) ; front :
    `Twin9View.test`, `twin9-run.test` (dont les sorties réelles de l'oracle, sautées sans Twin_v9),
    `Jury.twin9.test`, `mapper.test` (`twin9Dossier`). Bout en bout : `web/e2e/twin9-run.e2e.js`
    (moteur factice, Anthropic simulé par `WORKER_PROVIDER=mock`, `docs/tests-e2e.md`). Le moteur
    factice écrit désormais des sorties à la forme de la v9.8 là où la plateforme les lit.

- 2026-10-19 — **Moteur Twin9 en PHP, T13 : la page de configuration et les droits (branche
  `feat/twin9-t13-configuration`, sur celle de T8).** Chacun règle les profils de ses runs Twin9 sur
  `#/configuration`.
  - La page (`ConfigurationView`, `views/configuration/profilSchema.js`) se construit depuis
    `schemas/twin9-profil.schema.json`, sans liste de réglages tenue à côté : une section repliée
    par partie du profil, qui compte ses réglages modifiés ; un interrupteur pour le mode essai ;
    chaque réglage commandé selon son type (choix, case, nombre, texte, tables, collège des
    lecteurs) ; une valeur modifiée marquée, sa valeur par défaut au survol ; l'aide du schéma
    paraît quand on entre dans le réglage. On y ouvre ses profils, on en crée un depuis le profil
    v9.8, on l'enregistre, le copie ou le supprime (après confirmation) ; le serveur valide et la
    page affiche son message. Pas d'entrée de navigation tant que Twin9 reste masqué (lot 3) : la
    page s'ouvre par son adresse.
  - Routes (`routes/twin9-configuration.php`) : `GET /api/twin9/configuration` (ses profils, le
    profil v9.8, les référentiels publiés et leurs versions, les jeux de gabarits, sa clé
    personnelle : ouverte, enregistrée) ; `POST /api/twin9/profils` ; `GET`, `PUT`, `DELETE
    /api/twin9/profils/{id}`, à son propriétaire seul (404 pour tout autre).
  - `ProfilPolicy` admet les choix d'un profil : un référentiel publié et, s'il est donné, une de
    ses versions publiées ; un jeu de gabarits connu (« v9.8 » jusqu'à T14) ; la clé personnelle
    là où l'administrateur l'a ouverte. `ProfilRepository` refuse la réflexion coupée aux efforts
    `xhigh` et `max`, que l'API refuse, en nommant l'étape (`CallSettings::parEtape`, dont
    `combinaisons` dérive désormais) — la dette notée en T7 est levée ; il garde aux nombres la
    forme d'un flottant (`1.0`), que la v9.8 lit et que le navigateur ne distingue pas.
  - Droits : la matrice « Configuration Twin9 » de `docs/autorisations.md`, une ligne par droit,
    chacune testée dans `ConfigurationDroitsTest` (13 tests, dont le coffre de la clé personnelle
    et la clé de l'instance, qui ne passe jamais par l'interface). Front : `ConfigurationView.test`
    (9 tests ; l'un énumère les réglages du schéma, plus de 150, et n'en trouve aucun hors de la
    page). `rgpd-audit` : `twin9_profils` est désormais servi (`via`).

- 2026-10-19 — **Moteur Twin9 en PHP, T8 : la voie par lots (branche `feat/twin9-t8-batches`).** Un
  run réglé « lots » envoie ses appels par l'API Message Batches d'Anthropic, à moitié prix
  (ADR-011 §3) ; `docs/contrats.md` §8.3 décrit le protocole.
  - Migration 026 : `twin9_lots`, les lots d'un run (identifiant Anthropic, état, clé employée,
    instance ou personnelle, jamais la clé elle-même, nombre de requêtes, taille, dates) ;
    `twin9_appels` reçoit `lot_id` et `custom_id`.
  - `Worker/Twin9Lots.php` : les appels qu'attend une passe partent en lots bornés à une dizaine de
    mégaoctets. Chaque requête porte les `params` de l'appel direct et un `custom_id` tiré de
    l'identifiant de l'appel (32 caractères), gardé au journal. Avant le premier lot, un appel
    direct minimal part par combinaison de réglages du profil (`CallSettings::combinaisons`) : un
    refus arrête le run avec la raison de l'API. Une tranche suivante relève le lot fini : les
    réponses entrent au journal, au coût de l'usage à moitié prix (`coutMicrousd(…, parLots:
    true)`) ; les requêtes en erreur ou expirées repartent (l'erreur compte une tentative,
    l'expiration non) ; le lot est supprimé chez Anthropic. Un lot perdu se retrouve dans la liste
    des lots de la clé, puis par ses `custom_id` ; introuvable au bout de dix minutes, ses appels
    repartent. Les lots d'un run qui n'est plus en cours sont annulés, puis supprimés.
  - `Twin9\AnthropicBatches`, derrière l'interface `BatchApi`, s'en tient à l'adresse verrouillée
    et ne suit jamais le `results_url` que rend l'API. Entre deux lots, un run n'est pas rejoué et
    ne compte pas parmi les N runs du tick.
  - Tests : `LotsTest` (moteur factice et fournisseur de lots simulé : mêmes requêtes qu'en direct,
    un lot soumis puis relevé, tué entre deux lots sans rien payer deux fois, lot perdu retrouvé,
    erreurs et expirations, réglages refusés, annulation, bornes et coût), `AnthropicBatchesTest`.
    `PariteTest` rejoue `16-test-mode` par lots, tué deux fois, à l'oracle près (8 tests, 90 s).
  - **Constat** : la v9.8 enchaîne ses appels en vagues, et par lots chaque vague est un
    aller-retour chez Anthropic. Un run de dix journées (`12-jury-random`) en compte quelque 150,
    dont plus d'une centaine d'un seul appel ; une quinzaine de vagues de dix appels ou plus portent
    plus de 90 % des appels. Un run par lots dure donc quelque 150 fois le délai d'un lot et
    l'intervalle du déclencheur. Deux pistes, non codées : envoyer en direct les petites vagues, le
    prix des lots restant sur l'essentiel des appels ; vérifier dans `Twin_v9` si les tribunaux d'une
    même journée, que la v9.8 enchaîne, peuvent partir de front sans changer un prompt.

- 2026-10-19 — **Moteur Twin9 en PHP, T7 : l'exécution par tranches (branche `feat/twin9-t7-slices`,
  avec `feat/twin9-t7-platform-entry` dans `Twin_v9`).** Les runs Twin9 tournent sur le serveur, par
  tranches de 45 s au plus (ADR-011 §2) ; le contrat entre la plateforme et le moteur est au §8 de
  `docs/contrats.md`.
  - Migration 025 : `twin9_cartes` (la mémoire d'une carte : utilisateur, portfolio, référentiel, jeu
    de gabarits) et `twin9_memoire` ; `twin9_runs` (copie des réglages — le profil et les réglages de la
    v9.8 —, portfolio, instantané du jeu de gabarits, horloge figée, compteurs) ; `twin9_appels`, le
    journal, écrit avant et après chaque appel, jamais le prompt ni la clé ; `twin9_resultats`.
    Réglages, portfolio, gabarits, mémoire, réponses et sorties sont compressés (zlib). Un run fini ne
    garde du journal que ses compteurs ; la purge du compte emporte tout (cascade, registre §13, que
    `scripts/rgpd-audit.php` connaît ; l'export du compte attend T10).
  - Le tick (`Worker/Tick.php`, `Worker/Twin9Slice.php`) avance d'abord au plus N runs Twin9, puis la
    masse avec le temps qui reste ; `runs_par_tick` (défaut 3) et `secondes_par_tranche` (défaut 40,
    45 au plus) rejoignent `Twin9Config`. Chaque passe rejoue le run ; ses appels partent ensemble,
    chaque réponse s'inscrit à son retour, une nouvelle passe suit dès qu'une place se libère. Une
    journée finie entre aussitôt en mémoire, sauf panne, et les passes suivantes la reprennent ; seules
    les journées les plus anciennes envoient leurs appels (`parallelisme.journees`) ; un seul run à la
    fois par carte. **Écart au planning** : un faisceau du second ressort ne se relit pas en cours de
    run — la « chose jugée » de la v9.8 ne marque pas les graines comme un premier jugement, la carte
    changerait ; il se rejoue depuis le journal, sans qu'aucun appel reparte.
  - Appels directs : `AnthropicCaller::requete()` et `lire()`, `Twin9\DirectCalls` sur
    `Llm\CurlMultiHttpClient` (`curl_multi`). Réglages d'appel par étape (`CallSettings`) ; réflexion
    coupée `disabled`, ou `between_tools` pour Sonnet 5.5 ; jamais de température. Les trois tentatives
    de la v9.8 dans la tranche ; un 429 ou 529 attend son `Retry-After` sans compter de tentative, un
    429 sans (plafond de dépense) met le run en attente ; un refus du modèle est une panne ; modèle
    servi, jetons et coût relevés ; la clé est lue à chaque envoi (`RunKey`). Un appel coupé par la fin
    de la tranche repart à la suivante, et compte comme une tentative s'il a eu la moitié de la tranche.
    `appeler()`, des routes du moteur du navigateur, prend la même forme de réflexion.
  - L'empreinte des réglages (réglages d'appel, troncatures, gabarits et fiches hors relectures) est
    rangée dans chaque entrée de la mémoire à côté de celle de la v9.8 : d'autres réglages d'appel
    relisent les journées.
  - Route `worker-tick` : un jeton à elle, `WORKER_TICK_TOKEN` (en-tête `X-Worker-Tick-Token`), qui
    n'ouvre aucune autre route ; `X-Migrate-Token` l'ouvre toujours ; `ignore_user_abort` ; elle relève
    la limite de temps de PHP là où il y en a une, sans jamais en poser une (en CLI, elle aurait tué la
    suite de tests une minute plus tard).
    `scripts/worker.php` charge le moteur. `symfony/polyfill-intl-normalizer` entre dans
    `api/composer.json` : le moteur appelle `Normalizer`, et OVH n'a peut-être pas `intl`.
  - Moteur factice, public (`api/tests/fixtures/twin9-factice`), chargé par `EngineLoader` comme le
    vrai : `TrancheTest`, un processus par test, couvre le DoD (un run va au bout en tranches ; tué
    entre deux appels, il reprend sans appel en double ; tué pendant un appel, seul celui-ci repart ;
    deux runs simultanés gardent réglages, gabarits et clé ; aucune tranche ne dépasse sa durée), plus
    la mémoire journée par journée sans panne, les tentatives, la clé, les journées de front, une carte
    à la fois et l'empreinte des réglages. `WorkerTickTokenTest`, `AppelsDirectsTest`.
  - Parité (`api/tests/Twin9/PariteTest.php`, saute sans `Twin_v9`) : `03-scan-default` (Arpenteur),
    `12-jury-random`, `16-test-mode`, `10-resume` (sur la mémoire de `01-default`) et le vrai run de T2
    passent par le tick, tranches de 5 s, réponses dans le désordre : chaque appel part une fois, les
    sorties sont celles de l'oracle. S'y ajoutent un run tué en plein tribunal et un juré en panne
    rejoué au run suivant. La suite passe en 89 s ; un mot changé dans le gabarit du rapporteur, le
    dernier appel d'un run, fait échouer la première en 53 s et les sept en 66 s.
  - Pas encore : la voie par lots (T8 ; un run réglé « lots » attend), le lancement depuis un profil et
    la page du run (T9), crédits et plafonds (T10).

- 2026-10-18 — **Moteur Twin9 en PHP, T12 : le profil (branche `feat/twin9-t12-profile`).** Rien
  de la v9.8 dans ce dépôt.
  - Contrat `schemas/twin9-profil.schema.json` (`kind` « twin9-profil », fermé à tous les
    niveaux) : les paramètres d'algorithme du `config.json` de la v9.8, ses backends exceptés ; les
    options de sa ligne de commande qui règlent l'algorithme ; les 48 troncatures de son code, à
    leurs valeurs d'origine ; le mode, test (première journée, premier pôle) ou complet ; le
    collège, chaque lecteur avec sa famille ; trois étages (lecteurs, rapide, profond) et 17
    étapes qui les suivent ou s'en écartent : modèle Claude, budget de sortie, effort, réflexion,
    aucune température ; la voie, le parallélisme, budget et durée, la clé, le jeu de gabarits,
    le référentiel. `docs/contrats.md` §7 donne la correspondance avec la v9.8 ; l'endroit de
    chaque troncature dans son code reste dans `Twin_v9`.
  - Le profil v9.8 (`api/config/twin9-profil-v98.json`), par défaut et en lecture seule : Haiku
    5.5 aux lecteurs (un lecteur en trois passes) et à l'analyse rapide, Sonnet 5.5 à l'analyse
    profonde, la voie par lots ; pour le reste, les valeurs de la v9.8.
  - Migration 024 : `twin9_profils` (propriétaire, nom unique par propriétaire, profil JSON),
    CASCADE à la purge (registre §12). `ProfilRepository` : un réglage absent prend la valeur par
    défaut du schéma, comme la v9.8 lit son `config.json` ; un profil invalide n'est jamais
    écrit ; seul son propriétaire le modifie ou le supprime. `Validation` connaît le nouveau
    `kind`, côté PHP seulement.
  - Pas encore de route : la page et les droits viennent avec T13. D'ici là, l'export du compte
    ne restitue pas les profils (`rgpd-audit.php` : `none`).

- 2026-10-18 — **Documentation sans Docker (branche `feat/twin9-t0-docs-without-docker`, demande
  de Christian après la fusion de T0).** Ce qui citait Docker comme environnement de travail passe
  au PHP et au MySQL locaux : les 51 lignes « Exécuter » des fiches de cas d'utilisation
  (`(cd api && vendor/bin/phpunit …)`) et leur README, `docs/strategie-tests.md` (la CI joue
  désormais PHPUnit et le moteur), `docs/tests-e2e.md`, `docs/backup-restore.md`,
  `docs/securite-checklist.md`, `docs/administration.md`, `docs/plan-masse.md`, le chapitre
  d'exploitation de la formation des administrateurs, les commentaires (`api/config/`, en-têtes
  HTTP, `CurlHttpClient`, `LeakFilter`, `worker.php`) et l'usage des scripts PHP.
  - Ce qui exécutait Docker passe aussi en local : `stage-api.sh` installe le `vendor/` de
    production avec le Composer local (plateforme fixée à PHP 8.2, même jeu que le `composer.lock`) ;
    les scénarios Playwright et `scripts/dev/dod-p11.sh` interrogent la base de développement par
    le client `mysql` ; les scripts PHP sans `vendor/` conseillent `cd api && composer install`
    (attendu par UC-SYS-02-F16).
  - Restent, volontairement : `docker-compose*.yml` et `docker/`, pour qui s'en sert ; les journaux
    (`STATUS.md`, `docs/cartographie-ultime/JOURNAL.md`) et le plan de construction historique
    (`docs/plan-prompts.md`), qui consignent ce qui s'est fait alors ; les données
    d'`assets-existants/`.
  - Vérification, sans Docker : API **1 493 verts** (22 min 41 s) ; l'étape Composer de
    `stage-api.sh` n'installe que les dépendances de production (plateforme ≥ 8.2) ; l'assistant
    SQL des scénarios e2e et les ticks, requêtes et lectures de `dod-p11.sh` tournent contre le
    MySQL local ; `check-publiable` OK. Non rejoués : les scénarios Playwright, et `dod-p11.sh`
    en entier, cassé avant ce changement (voir les dettes).

- 2026-10-18 — **Moteur Twin9 en PHP, T0 : le cadre (branche `feat/twin9-t0-php-engine-frame`,
  ici et dans `Twin_v9`).** Aucun code du moteur ; rien de la v9.8 dans ce dépôt.
  - ADR-011 « Moteur Twin9 v9.8 en PHP » : la v9.8 réécrite en PHP, exécutée sur le serveur par
    tranches, par le tick de l'ADR-005 ; Anthropic seul, en direct ou par lots, avec les réglages
    que chaque modèle accepte ; le moteur vit dans `Twin_v9`, que la plateforme charge ; portfolio
    et état du run gardés sur le serveur avec l'accord de l'apprenant, qui remplace la garde
    `--donnees-reelles` ; coût moyen à la place du devis par run simulé. ADR-001, 005, 008 et 010
    portent en tête « Amendé par ADR-011 » ; `SUMMARY.md` régénéré.
  - Plus de Docker en développement (les fichiers `docker-compose` restent) : PHP et MySQL 8
    locaux, Composer fixé à PHP 8.2. `INSTALL.md` §2 crée les comptes MySQL et `.env.dev`, à la
    racine (valeurs de `docker-compose.yml`), qu'on exporte dans le terminal pour l'API, les
    scripts et les tests ; pas d'`api/.env` en développement : l'API et les scripts le
    chargeraient par-dessus l'environnement des tests (deux tests de `UcSys03` échouent alors).
    §2 ajoute aussi le `npm ci` du moteur qu'exige `build-default-prompt-package.mjs` ; §3 et
    §5 sans conteneur ; `CLAUDE.md` et le résumé du `README.md` suivent.
  - Chargeur `api/src/Twin9/EngineLoader.php`, appelé au démarrage (`Bootstrap`) : `TWIN_V9_DIR`
    (documenté dans `api/.env.example`), par défaut `../Twin_v9`, dossier `php/src` en PSR-4,
    préfixe `Twin9\`. Sans lui, Twin9 côté serveur reste désactivé (`EngineLoader::isLoaded()`)
    et ses tests sautent (`api/tests/Twin9/EngineLoaderTest.php`).
  - CI publique : job `php` (PHP 8.2, MySQL 8 en service, l'environnement et les données dérivées
    d'`INSTALL.md` §2, clé de chiffrement jetable) qui lance la suite existante ; une partie des
    tests suppose cet environnement (`MIGRATE_TOKEN`, `SODIUM_MASTER_KEY`). `Twin_v9` (pull request 1) : `php/composer.json` (PHP 8.2,
    PHPUnit), la classe vide `Twin9\Engine` et son test, son job `php` sous PHP 8.2 (vert, 8.2.34).
  - Vérification, sans Docker (PHP 8.3 local, MySQL 8.0.46 des paquets du système, `.env.dev`
    d'`INSTALL.md` §2, `../Twin_v9` cloné) : API **1 493 verts** (14 342 assertions, 24 min 52 s),
    dont les 4 du chargeur, moteur réel compris ; sans `../Twin_v9`, son test saute. Plateforme
    démarrée (`php -S`) avec et sans `../Twin_v9` : `/api/health` → `db: ok`,
    `/api/referentiel/versions` → 200, moteur chargé seulement quand il est là ; commandes
    d'`INSTALL.md` §3 passées ; `check-publiable` OK. CI de la pull request verte : `php` sous
    PHP 8.2.34, 1 493 tests dont le moteur réel sauté (15 min 17 s), `engine`, `check-publiable`.

- 2026-10-18 — **Documentation publiée sur GitBook : https://chamblandes.gitbook.io/humanome.**
  Espace créé par Christian (Site Git Sync, sens GitHub → GitBook) ; `gitbook-docs.yaml` à la
  racine : un espace « Documentation » sur `./`, qui reprend `.gitbook.yaml` et `SUMMARY.md` (quatre
  parties, 145 pages, liens tous résolus). Vérifié en ligne : accueil et pages profondes servies.
  Clôt l'action utilisateur de D10 (2026-07-17).

- 2026-10-18 — **Front déployé : Twin9 coupé en ligne, D-69 à D-71 publiées (demande utilisateur).**
  Construit dans la VM du Mac depuis un clone neuf de `4nd4ny/humanome.xyz` (`bed91d2`), avec les
  données de la copie locale ; `deploy.mjs static` après un `--dry-run` relu : 2 envois, 1
  suppression (l'ancien paquet, qui embarquait le moteur), données inchangées. Vérifié en ligne
  (Chromium) : accueil, `#/twin9` (avis), `#/cartographie` ; ancien paquet en 404, `www/assets/`
  ne contient que le nouveau, sans trace du moteur ; API inchangée (`v1.1.0-106-gc6a0231`).
  Copies locales (clones git) : `13. Cartographie/github/humanome.xyz` et `github/Twin_v9`, séparées
  des fichiers non versionnés de `13. Cartographie/humanome.xyz/` (hooks activés, `.env.deploy` et
  `web/public/data` recopiés, sans `node_modules`). Tags `v1.0.0`/`v1.1.0` recréés sur GitHub par
  deux releases, au choix de Christian : ce sont des tags légers, que `git describe` (version de
  l'API, `stage-api.sh`) ne lit qu'avec `--tags` ; les tags annotés d'origine restent dans l'ancienne copie.

- 2026-10-17 — **Moteur Twin9 sorti du dépôt public (décision de Christian).** Le portage JS du
  moteur, ses vecteurs et ses tests, les specs `docs/twin9/`, le plan `docs/plan-twin9-php.md`,
  `run-helpers.js` et `gen-oracles.sh` vivent désormais dans le dépôt privé `4nd4ny/Twin_v9`, aux
  mêmes chemins et avec leur historique ; le moteur PHP y naîtra aussi. L'historique de ce dépôt
  a été réécrit pour les en retirer, puis publié sous le nom `4nd4ny/humanome.xyz` (l'ancien,
  renommé `humanome~trash` et rendu privé, est à supprimer une fois la copie vérifiée). Jusqu'au lot 3, l'analyse
  approfondie est coupée : `#/twin9` affiche un avis, l'entrée de navigation est masquée. Restent
  publics `mapper.js`, `referentiel.js` et leurs utilitaires `py/`, ainsi que le service (crédits,
  PayPal, factures, atelier des gabarits). `check-publiable` refuse désormais les chemins du
  moteur ; les tests sur vecteur réel se sautent sans `../Twin_v9`. ADR-010 §1 révisé.

- 2026-10-17 — **Planning du moteur Twin9 v9.8 en PHP (`docs/plan-twin9-php.md`).** Six lots :
  préparer (dépôt privé `4nd4ny/Twin_v9` avec la v9.8 à sa racine, oracle tiré de la v9.8, vrai
  run de PLANT-01), le moteur PHP exécuté par tranches sur le serveur, le service (lancer,
  suivre, lire, payer, purger), le retrait du moteur du navigateur, la configuration (profil,
  jeux de gabarits, plusieurs référentiels, page et droits), la démonstration sur l'hébergement
  gratuit d'OVH, sans Docker. Dix-neuf prompts T0 → T18 à lancer chacun dans une conversation ;
  deux questions restent ouvertes (publication du moteur PHP, visibilité des gabarits v9.8).
  Relu par un agent distinct (paramètres des modèles 5.5, tests sans MySQL ni v9.8, jeton du
  déclencheur, voie par lots, parité PHP), corrections intégrées. Rien de la v9.8 n'entre dans
  ce dépôt ; aucun code dans ce commit.

- 2026-10-14 — **Interface ultime de cartographie (demande utilisateur, branche
  `feat/ultimate-cartography`) — validée, déployée et fusionnée dans `main` le même jour.**
  - Exigences : `04_specifications.md` du dossier de travail « Cartographie » de Christian (hors
    dépôt). Journal d'avancement, décisions D-1 → D-71, état des tests, les 42 questions et
    les réponses de Christian : `docs/cartographie-ultime/JOURNAL.md`.
  - Module autonome `web/src/carto/` (cœur sans DOM + interface React) sur `#/cartographie` ;
    l'ancienne vue V3 est retirée, `#/merge` et `#/cartographie-v3` y renvoient (D-38). P0 noyau (master v4,
    importeurs Aurora v3 / AuroraCore / Merge v2, formules §5, IndexedDB) ; P1 soleil,
    heatmap, gestionnaire, date t ; P2 lecteur de portfolio surligné, détail, jury ; P3
    comparaison de soi à soi ; P4 tableau de bord ; P5 archive JSON, copie autonome HTML
    (lisible hors ligne en `file://`), rapport imprimable, démo anonymisée ; P6 version
    partagée réservée aux adultes (auto-attestation gardée par le serveur, liste blanche,
    lien à mot de passe facultatif jamais indexé, journal des accès) ; P7 dialogue scripté
    local, relances LLM facultatives sur accord explicite ; puis relecture indépendante de P6
    et P7 (13 corrections, D-37).
  - API : migration `022_carto_partage_adultes.sql` (type `partage`, mot de passe de lien
    facultatif, `users.adult_attested_at`) — elle part avec la release API (`deploy.mjs api`
    appelle `migrate`) ; routes `partage.php` (attestation), `GET /api/share/open` (jeton en
    en-tête), `GET /api/shares/{id}/consultations`. Registre RGPD (3 bis, 3 ter), politique de
    confidentialité, matrice d'autorisations, UC-APP-05 et UC-EMP-01 mis à jour.
  - Données réelles (journaux 300 / 200 / GEN1) : importeurs, lecteur, anonymisation, surlignage
    approché, export du portfolio et archive de compte validés sur le Mac, compteurs
    seulement ; rien de personnel n'est versionné.
  - **Réponses de Christian (2026-10-14) appliquées** : l'angle compte les points, la hauteur
    est la confiance moyenne du jury (D-8) ; `connect-src` ouvert aux seuls fournisseurs, pour
    les runs et relances avec clé personnelle (D-36) ; pages V3 retirées (D-38) ; une nouvelle
    version partagée remplace l'ancienne sous le même lien (D-33) ; surlignage approché des
    extraits reformulés (D-39) ; un dialogue du carnet se verse au portfolio, exporté en
    Markdown (D-40) ; « Exporter toutes mes données » emporte les jeux de l'interface
    (archive 1.1.0), schéma JSON du master v4 (D-25) ; chapitres de formation V3 réécrits.
    Puis relecture indépendante de ces décisions : 9 corrections (D-41, `b651f38`).
  - **Question 17 (2026-10-14)** : la garantie passe par la publication — un cartographe publie
    la version partagée de l'apprenant, à sa demande (code à usage unique), avec sa garantie,
    que l'employeur lit (D-42, migration 023, `f55b036`) ; puis **l'ancien partage est retiré**
    (D-43) : plus de nouveau lien vers une cartographie du site (`422 share_retired`) ;
    « Partager depuis l'interface » et « Liens déjà créés » dans « Mes cartographies » ; la page
    de relecture du cartographe ouvre sa révision dans l'interface pour la publier garantie ;
    les liens déjà créés restent servis jusqu'à leur échéance. Relu par un agent distinct
    avant le commit (rien de bloquant, corrections intégrées).
  - **Questions 25 à 29** (D-44) : le niveau « Publique (partageable) » s'intitule « Partager » ;
    `CLAUDE.md` décrit le partage par une version choisie, mot de passe facultatif ; anciens
    liens non révoqués, publication par l'apprenant seul et code de demande confirmés.
  - **Pôle ouvert sur 360°** (D-45, demande du 2026-10-14) : un double-clic sur un pôle du soleil
    (ou « o ») l'ouvre — ses compétences font tout le tour selon leur part des points du pôle,
    hauteurs inchangées, codes écrits ; le centre (ou Échap) ramène à tous les pôles ; passage
    animé de 480 ms, aucun si le mouvement est réduit ; même geste dans la version partagée.
    Corrigé en chemin : un clic dans le soleil faisait défiler toute la page jusqu'à la liste
    (le second clic d'un double-clic tombait à côté) ; la colonne de gauche défile désormais
    seule, la liste y suit la sélection. Relu par un agent distinct (six corrections).
  - **Vérification après D-45** (2026-10-14) : front **2 285 verts** (235 fichiers) ; moteur
    **1 071 verts** + 17 sautés ; API **1 489 verts** (14 328 assertions) ; e2e Chromium
    **16 sur 16** (dont `carto-soleil.e2e.js`, nouveau : vrai double-clic, géométrie vérifiée
    sur le tracé rendu).
  - **Vérification** (2026-10-14, `b651f38`) : front **2 255 verts** (231 fichiers ;
    `twin6-prompt-package.test.js` toujours non chargeable, anomalie connue) ; moteur
    **1 071 verts** + 17 sautés ; API **1 484 verts** (14 162 assertions, 23 min 36 s) ; e2e
    Chromium de la cartographie verts : P5 (copie autonome, démo anonymisée), P6 (contre l'API
    docker locale), P7 (dialogue), clé personnelle sous la CSP de production.
  - **Vérification après D-43** (2026-10-14) : front **2 257 verts** (232 fichiers, dont
    `twin6-prompt-package.test.js`, chargeable une fois les gabarits Twin6 non versionnés
    déposés — `INSTALL.md` §4) ; moteur **1 071 verts** + 17 sautés ; API **1 489 verts**
    (suite complète) ; e2e Chromium verts : parcours apprenant et cartographe (réécrits pour le
    partage par l'interface, et remis en état : ils s'arrêtaient à l'inscription depuis
    l'activation par code D5), P6 et version garantie contre l'API docker, P5, P7, CSP, guides,
    sandbox. Deux e2e en échec depuis juillet, sans rapport, remis en état dans un commit à part :
    `navigation-burger.e2e.js` (le tiroir rétracté laisse dépasser 10 px depuis `189f20e` ;
    position lue après la transition) et `parcours-promptologue.e2e.js` (inscription d'avant
    D5) — **toute la suite e2e est verte** (11 fichiers).
  - **Déploiement** (2026-10-14, autorisé par Christian ; journal carto D-46) : release API
    `20261014-133427-v1.1.0-106-gc6a0231`, migrations `022` et `023` appliquées (référentiel,
    compétences, fiches et paquets de prompts inchangés), front (4 fichiers changés, ancien
    bundle retiré ; données de démo inchangées). `health` → `v1.1.0-106-gc6a0231`. Fait depuis la
    VM Linux du Mac (le FTP n'est pas joignable depuis le conteneur cloud) ; la release API a été
    complétée et vérifiée fichier par fichier avant l'écriture du pointeur. Vérifié en ligne dans
    Chromium (démo, pôle ouvert sur 360°, retour). Release précédente (`v1.1.0-20-g471d7cd`)
    gardée pour un retour arrière. La démo anonymisée (`data/demo/carto/archive.json`) n'est pas
    partie : aucune n'a été préparée (« Préparer une démo », relecture de Christian) ; le site
    garde les 59 journées publiques.
  - **Fusion** : PR `feat/ultimate-cartography` → `main` (CI verte), fusionnée le 2026-10-14.
  - **Question 30** (D-47, accord de Christian) : le script anti-FOUC autorisé par son hash dans
    la CSP de production (le thème choisi par un visiteur n'était pas réappliqué au chargement) ;
    garde `web/src/anti-fouc.test.js` ; déployé (front seul) et vérifié en ligne.
  - **Démonstration avec portfolio** (D-48, demande de Christian) : le journal dont viennent les
    extraits de la démonstration, découpé à ses titres datés, est déposé **sur le site seulement**
    (`data/demo/carto/archive.json`, archive de l'interface, hors manifeste du front ; jamais dans
    le dépôt) ; « Ouvrir dans le portfolio » surligne les passages (97,4 % retrouvés tels quels sur
    2 392 traces). Constaté : échappements Markdown et séparateurs mal rendus par `lib/md.js`
    (question 31).
  - **Question 31** (D-49, accord de Christian) : `lib/md.js` rend ce que Google Docs écrit en
    exportant un document — échappements (`\!`, `\*`…), traits (`---`, `- - -`), sauts de ligne
    (deux espaces en fin de ligne ; U+000B des cellules, affiché jusqu'ici en carré « VT »),
    images (« [image] », jamais chargées) ; le surlignage suit (`stripMarkdownMarks`) ; le
    découpage lit « 1er.01.2026 ». Archive de la démonstration reconstruite et redéposée, front
    redéployé, vérifié en ligne : 98,5 % des passages retrouvés tels quels (97,4 % avant).
    Suites : front **2 294 verts**, moteur **1 072** + 17 sautés, e2e P5, P7, soleil, guides
    verts. Ouvert : tableaux (question 32), traits d'un journal importé tel quel (question 33).
  - **Comparaison par défaut** (D-50, demande de Christian) : l'espace Comparaison s'ouvre sur
    janvier face à mars (l'année la plus récente où les deux mois ont des journées analysées ;
    sinon, comme avant, « depuis la dernière évaluation ») ; préréglage « Janvier et mars » ;
    changer de vue ne fige plus A et B. Déployé (front) et vérifié en ligne.
  - **Rectification, en-tête allégé, tuiles** (D-51 → D-53, demandes de Christian) : la comparaison
    s'ouvre sur la première moitié des journées analysées face à la seconde (préréglage avant
    « Depuis la dernière évaluation » ; janvier et mars retirés) ; l'en-tête offre « Réinitialiser
    l'affichage » et perd « Comparer A / B », « Exporter » et « mode expert » (ses réglages α et
    épaisseur deviennent une tuile) ; la légende du soleil garde deux lignes. L'espace Cartographie
    passe en **tuiles** (grille du tableau de bord) : douze tuiles masquables, déplaçables,
    redimensionnables ; au départ le soleil et le détail en pleine largeur ; menu « Panneaux » ;
    disposition gardée dans le navigateur (`localStorage`). Relu par un agent distinct (six
    corrections). Suites : front **2 315 verts**, e2e Chromium **16 sur 16**. Déployé (front) et
    vérifié en ligne.
  - **Questions 32 et 33** (D-54, D-55, accord de Christian du 2026-10-15) : le Markdown passe par
    la bibliothèque **marked** 18.0.14 (CommonMark et tableaux GFM, version figée), réglée pour les
    journaux (écarts documentés en tête de `lib/md.js`), avec une feuille de style du site
    (`styles/markdown.css`) : tableaux, encadrés (tableau d'une seule case), listes numérotées et
    imbriquées ; surlignage identique, trace par trace, sur les 2 392 traces de la démonstration.
    Le découpage (`engine/src/portfolio/segment.js`) ne coupe plus à un trait après un titre
    daté : le journal de la démonstration, importé tel quel, donne ses 67 journées ; l'export du
    portfolio place ses passages sans date en tête. Relu par un agent distinct (13 points
    traités). Suites : front **2 339 verts**, moteur **1 073** + 17 sautés, e2e Chromium
    **16 sur 16**. Déployé (front) et vérifié en ligne.
  - **Demande du 2026-10-15** (D-56 à D-60) : lecteur de portfolio épuré (la journée entre ◁ ▷,
    l'extrait du jury cité seulement s'il n'est pas retrouvé tel quel, plus de navigation par
    jour ni de ligne d'état) ; une démonstration intacte se met à jour d'elle-même, en
    arrière-plan (défaut de Chrome Android : une copie antérieure au dépôt du portfolio) ;
    anneau des pôles élément d'interface, épaisseur réglable (30 par défaut, de 0 à 160) ;
    heatmap « Tout voir » par défaut, contraste renforcé toujours ; soleil et heatmap au thème
    sombre (marches sombres validées par le script de la skill dataviz). Relu par un agent
    distinct (24 points, 21 traités). Suites : front **2 366 verts**, moteur **1 073**, e2e
    Chromium de la cartographie verts. Déployé (front) et vérifié en ligne, au bureau et au
    téléphone (une démonstration ancienne se met à jour en 1,9 s).
  - **Propositions 35 à 37 acceptées** (D-61 à D-63) : à la souris, les commandes des tuiles
    ne paraissent qu'au survol ou au clavier (toujours affichées sur un écran tactile) ; le
    tableau de bord en panneaux comme la cartographie (« Panneaux », « Réinitialiser
    l'affichage », au départ le profil et le rythme, disposition gardée dans le navigateur) ;
    résumé du profil sans total des points ni court-circuit ; couleurs des pôles plus sombres
    en clair, traduites à l'affichage (référentiel inchangé ; RACINES et FLAMBEAU à des valeurs
    plus justes que la proposition, à confirmer). Relu par un agent distinct (aucun bloquant).
    Suites : front **2 382 verts**, moteur **1 073**, e2e Chromium de la cartographie verts.
    Déployé (front) et vérifié en ligne, au bureau et au téléphone.
  - **Demande du 2026-10-15, 13 h 28** (D-64, D-65) : la tuile « Réglages » (ex-« Réglages de
    l'encodage ») propose cinq palettes des pôles (Contrastée par défaut, Vive, Pastel, Terre,
    Profonde), validées pour les daltoniens par le script de la skill dataviz, gardées dans le
    navigateur ; le rapport imprimé et la version partagée gardent la palette par défaut. La
    hauteur des secteurs part d'une confiance réglable (0 à 0,5, 0,25 par défaut) : les écarts
    de hauteur de la démonstration 1,6 fois plus visibles ; α garde son rôle dans les points.
    Relu par un agent distinct (aucun bloquant, six défauts traités). Suites : front **2 401
    verts**, e2e Chromium de la cartographie verts. Question 38 (la palette par défaut) posée.
    Déployé (front) et vérifié en ligne, au bureau et au téléphone.
  - **Demande du 2026-10-16, 5 h 30** (D-66) : chaque information une fois. La « synthèse
    complète » du portrait d'une journée ne s'affiche plus (59 sur 59 redisaient leurs
    rubriques) ; seul ce qu'un texte complet ajoute se lit, et seul cela se garde à l'import et
    à la relecture d'une archive (`core/restatement.js` : chaque mot doit être déjà dit — une
    négation, un nombre, un mot changé font une phrase neuve ; `docs/contrats.md` décision 10).
    Panneau d'une compétence : plus de « Journées observées », ligne d'une journée sans les
    chiffres du panneau quand elle est la seule, confiance finale du Pédagogue seulement si elle
    diffère, examen du Pédagogue à un niveau, sort de chaque pièce du Greffier (l'extrait d'une
    pièce retenue n'est plus redit) ; délibération AuroraCore : la décision du président
    d'abord, sans rien déplier ; pôle : un passage saillant déjà cité le même jour se lit sous
    son territoire ; rapport imprimé sans redites. Relu deux fois par un agent distinct (cinq
    puis six défauts, traités). Suites : front **2 426 verts**, e2e Chromium de la cartographie
    verts. Questions 39 (les délibérations du jury : dans AuroraCore, sur le Mac — trois façons
    de les joindre) et 40 (lire les données à la demande : proposition en trois points) posées.
    Déployé (front, et l'archive de la démonstration allégée : 18,4 → 17,2 Mo) et vérifié en
    ligne, au bureau et au téléphone.
  - **Réponse du 2026-10-16, 8 h 44** (« Ok pour choix A et choix 1. », D-67, D-68). La
    démonstration se lit à la demande : un index (38 Ko compressés) puis le seul fichier de ce
    qu'on ouvre, rangé par compétence, pôle, journée, texte ou délibération (`core/split.js`,
    `web/scripts/carto-demo-split.mjs` ; schéma : `remote`, `docs/contrats.md` décision 11) ;
    une démonstration où la personne met quelque chose à elle se copie dans son navigateur, et
    l'ancien dossier de version peut se retirer du site (hébergement gratuit : 100 Mo). La
    seconde lecture : un run AuroraCore joint à un jeu qui a ses analyses par journée ne touche
    plus aux journées ; sa délibération se lit avec chaque compétence, la décision du président
    d'abord (`ui/SecondReading.jsx` ; schéma : `readings`, décision 12). Relu deux fois par un
    agent distinct (quatorze, puis quatre points, traités). Suites : front **2 468 verts**,
    moteur 1 073, e2e Chromium de la cartographie verts. Déployé et vérifié en ligne (bureau,
    téléphone). L'hébergement gratuit (100 Mo) était plein : avec l'accord de Christian,
    l'ancienne `archive.json` (17,2 Mo) et la release API `v1.1.0-4` (3,7 Mo) sont sauvegardées
    sur le Mac (`backup-manuel/2026-10-16/`) puis effacées ; 56,1 Mo visibles ensuite. Question 41
    décidée (11 h 27) : on laisse en l'état — humanome.xyz est le site de développement et de
    démonstration ; la production viendra plus tard sur un autre serveur.
  - **Remarque du 2026-10-16, 18 h 35** (D-69) : la date de la seconde lecture se dit comme celle
    de l'analyse (faite après le journal), une fois ; « Réflexions des membres du jury » : une ligne
    par membre, un niveau de moins à déplier. Suites : front 2 468 verts, cartographie 527.
  - **Remarque du 2026-10-16, 19 h 21** (D-70, question 42) : la hauteur d'un secteur suit la
    confiance sur une échelle régulière, comptée depuis le départ (0,25) — 0,5 au tiers de
    l'anneau, 0,75 aux deux tiers — au lieu d'une aire proportionnelle, qui étirait le bas de
    l'échelle ; la légende perd sa ligne « Surface ». Suites : front 2 469 verts, cartographie 527,
    e2e Chromium du soleil verts. Déployé et vérifié en ligne.
  - **Remarque du 2026-10-16, 20 h 53** (D-71) : dans la modale du jour, les boutons de la journée
    voisine ne disent plus l'année, sauf quand elle change ; « 1er » dans les dates compactes.
    Suites : front 2 475 verts, cartographie 533. Déployé et vérifié en ligne (bureau, téléphone).

- 2026-09-29 — **Correction des tests en échec (demande utilisateur, PR 4nd4ny/humanome#4).**
  - **CI « Tests moteur » verte** : le job `engine` de `.github/workflows/publiable.yml`
    régénère d'abord les données dérivées lues par `engine/src/pipeline/merge.test.js`
    (convertisseurs d'`INSTALL.md` §2, sans dépendance npm) ; `engine/src/twin9/referentiel.test.js`
    ne lit plus l'oracle Twin9 gitignoré quand il est absent (le corps d'un
    `describe.skipIf` est évalué à la collecte ; même garde que `parite.test.js`).
  - **Référentiel 7.1.0** (`web/src/data/referentiel-v710.test.js`) : pas de défaut de code,
    le test lit l'export statique produit depuis la base. `INSTALL.md` était faux : le
    conteneur `php` travaille dans `api/`, donc `php scripts/migrate.php` échouait
    (« Could not open input file ») → `../scripts/…` ; étapes manquantes ajoutées
    (`enrich-referentiel`, import de la 7.1.0, `export-referentiel-static`). En-têtes
    « Usage » de `import-referentiel.php`, `import-prompt-packages.php` et
    `export-referentiel-static.php` alignés.
  - **Twin6 (UC-SYS-04 AN-2), correction PARTIELLE** : `generate-fiches.mjs` crée son dossier
    de sortie ; `stage-api.sh` régénère les P*.md avant le paquet Twin6 au lieu de dépendre
    d'un build du front antérieur. Tests UC-SYS-04-U06 et F11 mis à jour.
    **Reste (décision utilisateur)** : versionner les trois gabarits publics
    (`0-mega-prompt.md`, `1-scan-pole.md`, `2-kairos-final.md`) ; tant qu'ils manquent,
    `web/src/views/promptologue/twin6-prompt-package.test.js` échoue hors du poste de
    l'auteur. Leur ajout depuis la copie servie en production a été refusé par le
    garde-fou de sécurité de l'agent.
  - **Vérification** (checkout propre + modifications) : PHPUnit **1 470 verts** ; moteur
    **60/60 fichiers**, 1 069 verts + 17 sautés ; web **1 941 verts**, seul
    `twin6-prompt-package.test.js` en échec (gabarits absents).

- 2026-09-29 — **Catalogue des cas d'utilisation + jeux de tests unitaires et fonctionnels (demande utilisateur, PR 4nd4ny/humanome#4 — code de production inchangé).**
  - **Documentation** : `docs/cas-utilisation/` — **58 fiches** en 10 dossiers d'acteurs
    (visiteur 5, compte 6, apprenant 12, cartographe 7, employeur 1, promptologue 8,
    épistémiarque 4, établissement 4, administration 6, système 5). Chaque fiche : objectif,
    déclencheur, préconditions, garanties, scénarios nominal/alternatifs/d'erreur, règles de
    gestion, données et RGPD, code sollicité, jeux de tests (traçabilité), anomalies constatées. `README.md` = conventions,
    catalogue et index des anomalies GÉNÉRÉS (entre marqueurs `<!-- catalogue:… -->` /
    `<!-- anomalies:… -->`), méthode de vérification, outillage hors périmètre. Section
    « Cas d'utilisation » ajoutée au `SUMMARY.md` GitBook (`scripts/build-gitbook-summary.mjs`).
  - **Tests**, rangés à part des suites historiques, identifiés `UC-XXX-NN-Unn` (unitaire :
    code appelé directement) / `UC-XXX-NN-Fnn` (fonctionnel : scénario de la fiche rejoué par
    l'API HTTP in-process ou par `<App/>` rendu en jsdom) — 963 identifiants unitaires et
    1 140 fonctionnels distincts : PHP **941** tests (`api/tests/UseCases/{Unit,Functional}/`,
    helpers `Support/`), web **1 051** (`web/test/usecases/`), moteur **141**
    (`engine/test/usecases/unit/`, joués aussi par la CI GitHub : fichiers versionnés seulement).
  - **Vérification** : rédaction depuis le code réel → relecture adversariale indépendante
    par cas (affirmation par affirmation, corps des tests lus, tests non discriminants
    traqués) → correction contre-vérifiée → balayage de complétude (routes API/CLI, routes
    front, vues, composants, scripts ; d'où UC-SYS-04 « artefacts dérivés » et UC-SYS-05
    « sauvegarde/restauration ») → traçabilité fiche↔tests (0 écart d'identifiant), liens
    (0 cassé) → toutes les suites (historiques + cas d'utilisation) rejouées sur un checkout
    propre de HEAD : PHPUnit **1 470 verts** (13 961 assertions), Vitest web **1 937 verts**,
    moteur **1 060 verts + 14 sautés**. Seuls 3 fichiers historiques ne se chargent pas, faute
    de données non versionnées (oracle Twin9, export statique du référentiel depuis la base,
    gabarits Twin6 déposés à la main) — échec identique sur `main`, sans lien avec la PR.
  - **214 anomalies de production documentées, NON corrigées** (hors périmètre de la demande) :
    chacune est figée par un test vert « comportement actuel » et indexée dans le README du
    catalogue — corriger une anomalie = modifier le code, le test qui l'épingle et la fiche.
  - **Frictions de format** relevées (runMeta vs archive, tokens runner, `semver`/`version`,
    `type`/`kind`, `poleNum` chaîne/nombre, `{}` décodé en `[]`, ordre des clés JSON MySQL) :
    `docs/contrats.md` §6. `docs/strategie-tests.md` : nouvelle section « Tests par cas
    d'utilisation » + volumétrie.
  - **Infra de test** : `TestDb::name()` (env `DB_TEST_NAME`, défaut `humanome_test`, pour
    des bases de test parallèles) ; suites PHPUnit `usecases-unit` / `usecases-functional`
    (exclues de la suite `api`, toutes jouées par `composer test`) + `composer test:usecases` ;
    `Composer\Config::disableProcessTimeout` (la suite complète dépasse 300 s) ;
    `memory_limit` des tests 512M → 2048M ; `npm run test:usecases` (web, moteur).
  - **CI « Tests moteur » rouge AVANT cette PR** (sur `main` depuis l'exécution n° 5) :
    `engine/src/pipeline/merge.test.js` et `engine/src/twin9/referentiel.test.js` lisent des
    données gitignorées absentes en CI. Correctif proposé en commentaire de la PR (génération
    des données dérivées dans le workflow + lecture gardée de l'oracle), non intégré pour ne
    pas élargir le périmètre. Tous les autres tests moteur, dont ceux de cas d'utilisation,
    passent en CI.

- 2026-07-18 — **Panneau de monitoring admin ✅ DÉPLOYÉ EN PROD (autorisé par l'utilisateur, release `v1.1.0-20-g471d7cd`).**
  - API + front déployés, aucune migration (`applied:[]`), gates référentiel/golden « unchanged ».
    Smoke : health ok, `/api/admin/monitoring` et `?role=` → 401 sans session, front servi.
  - **GeoIP pays ACTIF** : « IP to Country Lite » db-ip (édition 2026-07, 8 182 135 octets,
    licence CC BY 4.0) déposée dans `~/app/shared/dbip-country-lite.mmdb` + `GEOIP_DB=dbip-country-lite.mmdb`
    ajouté au `.env` prod par download→merge→upload COMPLET (1007→1039 octets, relu à l'identique ;
    copie de sauvegarde `backup-manuel/app/shared/.env` mise à jour). `GEOIP_DB` relatif = résolu
    contre le dossier du `.env` (`Bootstrap::envDir()` public, commit `471d7cd`). Validé en local
    contre le vrai fichier (8.8.8.8→US, 90.15.0.1→FR, IPv6 OVH→FR). Décision utilisateur : pays
    OUI, IP brute NON (RGPD) — le réseau tronqué /24 + les rate-limits suffisent à la défense.
  - Le journal des connexions démarre maintenant : premières entrées à la prochaine connexion
    (pays visible dès celle-ci). Rafraîchir la base db-ip de temps en temps (mensuelle).

- 2026-07-18 — **Panneau de monitoring admin (`#/admin/monitoring`) — demande utilisateur. Détail du chantier :**
  - **Backend** : `GET /api/admin/monitoring?days=1..365` (`Admin\Monitoring`, RequireRole admin,
    lecture seule) — utilisateurs (total, actifs < 15 min via `sessions`, inscriptions/jour, par
    rôle), cartographies (volumes, partages actifs, consultations), finances (soldes `twin9_credits`,
    mouvements par nature/jour, captures PayPal), tokens/jour et par modèle (`llm_usage_daily` +
    `tuteur_usage_daily` + débits `twin9_credit_events` — série anti-anomalies), connexions, votes
    (propositions `review` des DEUX grains, décompte `MajorityTally`, retardataires à relancer).
    Filtre `role=` ajouté à `GET /admin/users` (UserDirectory).
  - **Journal des connexions (nouveau, prospectif)** : `Auth\LoginJournal` → `audit_events` type
    `login`/`login_failed` sur login, activation et échec. **RGPD §6.5 préservé** : détails =
    `{pays, reseau}` seulement — pays résolu LOCALEMENT (`Geo\CountryResolver`, MMDB via env
    `GEOIP_DB`, dépendance `maxmind-db/reader` ajoutée ; fichier absent → null, AUCUN service
    tiers) et réseau tronqué (`Geo\IpAnonymizer` : v4 /24, v6 /48) — jamais d'IP brute. Purge
    opportuniste > 365 j. Consultations de partage : événement `share_consulted` (ids seulement)
    dans `POST /share/{token}` (+ `cartographie_id` exposé par `ShareLinks::findByToken`).
  - **Front** : section « Monitoring » première de `#/admin` — tuiles de synthèse, période
    7/30/90/365 j, graphiques SVG maison (barres empilées connexions/tokens, barres divergentes
    finances ; palette `--mon-*` validée clair ET sombre par le validateur dataviz — sarcelle
    `#0f766e` recalée pour chroma insuffisant → `#0d9488` ; légende, infobulles `<title>`, table
    de secours « Voir les données »), tables (par pays, dernières connexions, par modèle,
    mouvements), bloc votes (verdict entérinable/en attente/rejetée + « écrire aux retardataires »
    mailto bcc), comptes par rôle. Aide `#/admin` mise à jour.
  - **Tests** : PHP **529** (AdminMonitoringTest 6, GeoIpAnonymizerTest 4, audit `share_consulted`
    dans ShareTest), web **894** (MonitoringSection 7), build OK. Vérifié navigateur bout-en-bout
    (docker + dev server, admin réel) : tuiles vivantes, MA connexion journalisée en direct
    (réseau /24, pays « — » sans MMDB), graphiques clair/sombre. NB : le volet de prévisualisation
    ne peint que le haut de page (bug du volet, contrôlé sur `#/referentiel` intact) — vérification
    par remontée des blocs.
  - ~~Reste côté admin/déploiement~~ → FAIT le 2026-07-18 (voir l'entrée au-dessus) : déployé
    avec la base pays db-ip installée et active.

- 2026-07-17 — **Tranche de panneau visible au bord + fermeture au clic de lien (demandes utilisateur).**
  - **Poignée visible** : sur pointeur à survol, le panneau fermé ne sort plus entièrement de
    l'écran — repos à `translateX(calc(10px - 100%))`, une TRANCHE de 10 px reste visible
    (fond carte + ombre + ligne d'accent `.app-menu-edge` passée à z-index 66, effacée quand
    le panneau est révélé). L'approche du bord (veille géométrique inchangée, zone 12 px) la
    fait glisser vers la droite jusqu'à visibilité complète. Tactile : panneau hors écran
    comme avant, bouton Menu seul accès. Impression : déjà masqué via `.app-header-actions`.
  - **Clic sur un lien du panneau non épinglé = fermeture immédiate.** Deux verrous
    tombaient mal : `route.name` inchangé (lien vers la rubrique courante ou une autre
    section de la même rubrique) ne déclenchait pas l'effet de route, ET Chrome focus le
    lien cliqué — la révélation `:focus-within` maintenait le panneau visuellement ouvert
    devant la page chargée (le symptôme smartphone signalé). Délégation `onClick` sur la
    nav : `setMenuOpen(false)` + `blur()` du lien pour les clics POINTEUR (`detail > 0`) ;
    l'activation clavier (`detail === 0`) garde le focus (contrat d'accessibilité de la
    révélation au focus). Épinglé : inchangé, la punaise prime.
  - **Correctifs issus de la revue adversariale du diff** (5 confirmés) : la tranche au
    repos ne reste plus peinte par-dessus les surfaces bloquantes (miroir CSS de
    `MENU_EDGE_BLOCKERS` via `body:has(...)` → rentrée complète, ligne effacée ; vérifié
    navigateur avec l'aide modale) ; tranche et ligne limitées à `min-width: 768px` (sous
    ce seuil la `.view-toolbar` basse occupe le coin — la veille reste active) ; fermeture
    par clic de lien ou clic extérieur DÉSARME le bord (le clic se fait souvent dans la
    zone des 12 px : sans cela la veille rouvrait au premier frémissement) ; activation
    clavier d'un lien = état intact (Échap restait mort sinon — `menuOpen` doit rester
    vrai pour que son effet soit branché) ; la ligne ne s'efface qu'au focus DANS le
    panneau (`:has(.app-nav-panel:focus-within)`), plus au focus du bouton Menu.
  - Vérifié navigateur desktop (tranche au repos clair/sombre, glissement complet au
    survol, clic « Accueil » sans hashchange → panneau refermé + focus rendu, page
    visible ; modale → tranche rentrée puis revenue) et viewport mobile 375 px (tap
    burger → tiroir, tap « Référentiel » → tiroir refermé, page visible).
    Suites : web **887** (30 tests App).
  - **Déployé** (static, autorisé par l'utilisateur) avec les trois lots nav de la
    journée (`426c297`, `7a7ea9c`, `189f20e`) : build Vite + `deploy.mjs static`
    (2 fichiers envoyés, ancien bundle purgé), puis vérifié EN LIGNE sur
    https://humanome.xyz — tranche visible, ouverture à l'approche du bord, fermeture
    au clic de lien avec focus rendu.

- 2026-07-17 — **D16 — Banc d'essai : score vs référence, multi-run croisé A/B, coût réel
  mesuré et persisté (retours utilisateur sur D15).**
  - **Score chiffré vs référence** (`scoreVsReference`) : précision/rappel/F1 par PUR calcul
    d'ensembles (exigence utilisateur : jamais une note générée par IA) — TP = établies
    communes, FP = seulement générées, FN = manquées. Seules les journées couvertes des DEUX
    côtés sont scorées (drapeaux `couvertA/couvertB` de buildAbReport, `joursExclus` signalés) ;
    un périmètre restreint écarte les compétences de la référence hors périmètre
    (`codesRetenus`) ; F1 = 0 en désaccord total (null réservé à l'absence de donnée).
  - **Multi-run croisé A/B** (`buildAbMultiReport`) : N runs PAR BRANCHE (1..5) ; pour chaque
    (journée, compétence), fraction d'établissement pA/pB ; classes « écart franc » (stables
    et opposées = signal attribuable au prompt), « bruit » (instable dans au moins une
    branche), « accord » ; consistance interne par branche (compareRuns). Interruption =
    rapport partiel sur les runs achevés (comme le mode multi). Provenance affichée (tableau
    et diff jury = run 1 ; la section multi agrège tout).
  - **Coût réel mesuré** : enveloppe provider unique dans runVersionOnDays (température +
    cumul `usage {inputTokens, outputTokens, mesures}` sur les trois chemins) ; lignes
    « Tokens réels » et « Coût réel » (table de prix, arrondi au dix-millième — un micro-run
    payant ne s'affiche jamais « 0 $ ») + totaux de SESSION en multi-run ; en mode service
    humanome le coût se chiffre sur le modèle de référence (`modeleTarif`), cohérent avec
    l'estimation. Compteurs au format fr-FR.
  - **Persistance en base à chaque génération** (demande utilisateur) : `executeRun`
    (run-launcher) mesure enfin l'usage réel que le pipeline jetait — RunWizard le range dans
    `runMeta.usage` (compteurs seulement, RGPD §6.5), stocké localement avec chaque
    cartographie et transmis TEL QUEL au serveur à la copie opt-in via la colonne `run_meta`
    (migration 007 — AUCUNE migration nécessaire, payload déjà validé ≤ 64 Ko). Affiché en fin
    de run (« Consommation réelle de cette session… »). Twin9 : déjà couvert côté serveur
    (facture/crédit au coût réel).
  - Revue adversariale (24 agents, 19 constats confirmés ~11 défauts distincts, TOUS
    corrigés) : journées non communes exclues du score, arrondi du coût, F1=0, tarif du mode
    service, totaux ×N, sauvetage A/B après interruption, nRunsAb dans le carnet, usage
    Twin6 affiché, libellé de distance harmonisé, provenance run 1, séparateurs de milliers.
  - Vérifié navigateur (mock service, compte promptologue dev) : A/B croisé 2×2 runs (tokens
    2 917/2 206 par run, session 5 834/4 412, coûts 0.0418 $/0.0837 $), boucle export run
    partiel → réimport référence → score 100 %, phase PoW affichée pendant la préparation,
    zéro erreur console. Suites : moteur **945**, web **885** (+15), build OK. Déployé (static)
    le 2026-07-17 avec D15 (autorisation utilisateur) — bundle vérifié en prod (chaînes D15/D16
    présentes, health ok, console propre). Abandonné sur décision utilisateur : la surcharge
    de variables de gabarit à la volée.

- 2026-07-17 — **D15 — Refonte du banc d'essai promptologue (demande utilisateur).**
  Le banc (P10.4) passe d'un comparateur sommaire à un banc paramétrable complet :
  - **Périmètre du journal** : tout le portfolio, UNE journée, ou une période [du..au]
    (`filterDayGroups`), journées listées depuis la fixture ou le portfolio local.
  - **Périmètre du référentiel** : entier, un pôle, ou UNE compétence — nouvelle option
    `perimetre` d'`extractDay` (moteur : `restreindreReferentiel`, kairos omis en partiel,
    document marqué `perimetre.partiel` — le schéma exige 7 pôles, validation par sonde) ;
    sandbox : référentiel filtré + `validatePartialJour` (sonde ; stricte dès 7 pôles) ;
    Twin6 : refus explicite (référentiel en dur). Vérifié en navigateur : 1 compétence ×
    1 journée = 1 appel LLM au lieu de 24.
  - **Version du référentiel par branche** (API `referentiel/versions`, déjà exposée aux
    promptologues) + détection des paquets à **référentiel en dur** (marqueur twin6, fiches
    « ## X.YY — » inline, orchestration ignorant son paramètre `referentiel`) — alerte
    pré-run (drapeau `reserved`, présomption sur le nom sinon) et alerte définitive au run.
  - **Fournisseur/modèle LLM PAR BRANCHE** en A/B (`ProviderPicker` ×2) + température
    (virgule décimale acceptée), pour comparer les LLM entre eux à prompt constant.
  - **Mode « Vs référence importée »** : un JSON de référence (document jour, tableau, ou
    export du banc — `buildRunReport` est réimportable tel quel) comparé au run généré ;
    le marqueur `perimetre.partiel` d'un fichier importé ne court-circuite PAS la
    validation (sonde tolérante systématique — revue adversariale).
  - **Diff de compétences avec traces du jury** (`CompetenceDiff`) : établies d'un côté
    et pas de l'autre, dépliables sur la délibération DES DEUX côtés — pièces du greffier
    avec extraits verbatim résolus (pid→passagesSaillants), présomptions du pédagogue
    (attaques a..h nommées depuis `ATTAQUES`), traces retenues, verdict motivé.
  - **Carnet du banc** (méta-page, `carnet.js`) : markdown éditable rendu via
    `renderMarkdown` (DOMPurify), **configurations emblématiques** nommées rechargeables
    en un clic (instantané complet du banc, clés API JAMAIS persistées — `sanitizeConfig`),
    export/import JSON. Chargement avec réserves signalées si une référence a disparu
    (brouillon supprimé, portfolio effacé, version retirée → replis sûrs).
  - **Estimations honnêtes** : `estimateRun` paramétrable (`callsPerDay`, `mergeCalls`) —
    le banc estime ce qu'il exécute vraiment (pôles retenus, 0 récit de fusion) ; en
    périmètre restreint l'écart était d'un facteur ~77 (vérifié navigateur : 0.02 $ vs
    1.71 $ affichés avant).
  - Robustesse (revue adversariale 25 agents, 20 constats confirmés TOUS corrigés) :
    verrou synchrone anti double-clic, résultat précédent conservé jusqu'au succès
    suivant, interruption volontaire = statut neutre + rapport partiel des runs multi
    achevés, pré-vol du périmètre sur les DEUX référentiels en A/B double-référentiel,
    `name` sur tous les groupes radio (a11y), progression Twin6 « Phase i/8 » et
    multi-run préfixée « Run i/n », portfolio sans journée datée signalé à la sélection.
  - Rapports enrichis (`configurations` par branche dans le rapport A/B, union des
    journées des deux côtés), aide contextuelle mise à jour (help/registry).
  - Vérifié navigateur (compte promptologue dev, mock) : run restreint, A/B
    moteur-vs-sandbox avec périmètre, carnet persistant restaurant toute la configuration
    après rechargement, zéro erreur console. Suites : moteur **945**, web **870** (+50),
    build de production OK. Déployé (static) le 2026-07-17 avec D16 (autorisation utilisateur).

- 2026-07-17 — **Bord gauche fiabilisé : déclenchement GÉOMÉTRIQUE (retour utilisateur).**
  L'utilisateur signalait que le bord gauche n'ouvrait pas le menu. Deux causes distinctes :
  (1) son serveur de dev ne tournait plus (page en cache navigateur = ancien code) — HMR
  vérifié fonctionnel sur Dropbox/CloudStorage, pas de config à changer ; (2) un vrai bug
  reproduit en navigateur : le déclenchement par survol d'élément (`pointerenter` sur la
  réglette) est structurellement fragile — souris DÉJÀ posée sur le bord au chargement
  (l'événement part avant le montage React) ou glissant LE LONG du bord = aucune frontière
  franchie, bord mort. Remplacé par une **veille géométrique** : écouteur `pointermove` du
  document (actif menu fermé et non épinglé), x ≤ 12 px = zone, transitions seulement.
  Gardes (audit 4 agents + revue adversariale 14 agents, 3 corrections intégrées) :
  tactile ignoré, glisser (`buttons`) ignoré, surfaces bloquantes (`aria-modal`, éditeur
  plein écran) suspendent le bord, appui souris annule l'attente, Échap DÉSARME le bord
  jusqu'à une vraie sortie de zone (pas de réouverture au frémissement), les entrées
  bloquées ne consomment pas la transition (le bord revit dès la levée du blocage), pas
  d'ouverture-éclair en sortie de fenêtre (fausse-positive en glisser-sélection ; fenêtre
  maximisée le curseur se cale à x=0 et la voie normale suffit). La réglette devient
  purement décorative (`pointer-events:none`, surbrillance `is-hot` posée par la veille) ;
  sortie du panneau vers la page = grâce courte, vers hors-fenêtre = grâce longue (lecture
  du `relatedTarget` NATIF, React substitue `window` au synthétique). Vérifié navigateur
  (scénario mort rejoué : souris posée sur le bord + rechargement + glissement le long du
  bord → ouverture ; Échap/désarmement/réarmement). Suites : web **820** (28 tests App).

- 2026-07-17 — **Menu au survol persistant + réglette du bord gauche (demande utilisateur).**
  Le va-et-vient bouton (droite) ↔ panneau (gauche) était pénible : l'aperçu au survol
  (CSS pur, grâce de 0,32 s) se rétractait pendant la traversée de l'écran. L'ouverture au
  survol passe en JS (`App.jsx`, souris uniquement — `pointerType !== 'touch'`) : ouverture
  différée de 150 ms (filtre les passages), **grâce de traversée de 1,6 s** après avoir quitté
  le déclencheur, annulée en entrant dans le panneau ; en ressortant du panneau, fermeture
  après 350 ms. Une ouverture née du survol se referme donc seule ; née d'un clic, elle attend
  clic extérieur/Échap/route comme avant (un clic sur le bouton pendant l'aperçu CONFIRME au
  lieu de refermer). **Réglette `.app-menu-edge`** : fine bande toujours visible au bord gauche
  (3 px d'accent, cible de survol 12 px, `hover: hover` seulement, aria-hidden) qui ouvre le
  panneau sans aller chercher le bouton. L'ancienne règle `.app-menu:hover` et le délai CSS
  sont retirés (source unique : l'état React) ; `:focus-within` clavier inchangé. Au passage,
  `vite.config.js` honore `PORT` (plusieurs serveurs dev en parallèle, défaut 5173 inchangé).
  Vérifié navigateur (survol bouton → panneau ouvert pendant la traversée → fermeture en
  sortie ; survol du bord gauche → ouverture). Suites : web **813** (+4).

- 2026-07-17 — **D14sexies — Vues préconfigurées par persona + tutoriels de l'interface V3.**
  - **Cinq vues** dans le sélecteur *Mode* : {Simplifié, Employeur, Apprenant, Cartographe, Expert}.
    Chacune est un préréglage de panneaux ET de disposition de tuiles déduit du rôle dans
    l'écosystème : *Employeur* (lire les forces et leurs preuves : soleil, indicateurs, légende,
    portfolio, partage), *Apprenant* (explorer et se comparer à soi : soleil, heatmap, timeline,
    comparaison, portfolio pleine largeur), *Cartographe* (relire et garantir : arbre + portfolio
    côte à côte, audit d'import + arbitrage, soleil de contrôle — sans éditeur JSON), *Expert*
    (tout). Un mode reste un NIVEAU DE PRÉSENTATION (§4) : l'audience borne toujours ; la
    disposition de tuiles est mémorisée PAR VUE (`humanome-v3-tiles-<mode>`), le mode choisi est
    restauré au retour.
  - **Tutoriels dans les guides** (`#/guides`) : trois nouveaux chapitres structurés en BESOINS
    LOGICIELS par persona — ce que chacun doit voir et pourquoi, panneau par panneau :
    `apprenant/07` (explorer, « Pourquoi ce rayon ? », droit de réponse, comparaison ipsative,
    partage), `employeur/06` (résumé des forces, preuves contextualisées, provenance/récence, ce
    que la vue ne montre JAMAIS par conception, bon usage en entretien), `cartographe/07`
    (provenance, anomalies à 4 gravités, arbitrage des variantes, file de revue, méthode de
    relecture). `SUMMARY.md` (GitBook) régénéré : 86 entrées.
  - Vérifié navigateur : les 5 vues rendent leurs panneaux respectifs, le mode est mémorisé, le
    chapitre apprenant se charge dans `#/guides`. Suites : web **809** (+1).

- 2026-07-17 — **D14quinquies — Titres-boutons de réinitialisation (arbre et heatmap).**
  Le soleil se réinitialisait déjà (clic hors du disque ou au centre) ; l'arbre et la heatmap n'avaient
  pas d'équivalent. Pour économiser l'espace (demande utilisateur), les titres `h3` **« Référentiel »**
  (arbre) et **« Journées »** (heatmap) deviennent des BOUTONS de réinitialisation, libellés inchangés
  (sémantique de titre conservée : `h3 > button`, aria-label explicite, affordance ⟲ au survol/focus).
  - « Référentiel » retire le filtre de portée (même geste que le centre du soleil) — les branches
    OUVERTES ne sont pas touchées (états séparés, spec §3.4).
  - « Journées » réinitialise la journée inspectée et l'année visible — la tête de lecture appartient
    à la timeline et n'est pas modifiée (AC-SYNC-04).
  - Vérifié navigateur (filtre → reset, inspection → reset). Suites : web **808** (+1).

- 2026-07-17 — **D14quater — Tuiles V3 : redimensionnement à la souris + mémoire du mode.**
  - **Redimensionnement au pointeur** (souris, doigt, stylet — pointer events) : poignée ◢ au coin
    bas-droit de chaque tuile ; le geste est **quantisé sur la grille virtuelle** (cellule la plus
    proche, bornée 1..colonnes × 1..6) et appliqué EN DIRECT — la grille CSS (auto-flow dense)
    **réagence les autres tuiles pendant le geste sans les redimensionner** ; la taille finale n'est
    persistée qu'au relâchement. Une taille libre hors préréglages s'affiche telle quelle (« 3×2 »)
    dans le menu, qui reste le chemin clavier/lecteur d'écran. Contenu de la tuile désactivé pendant
    le geste (pas de sélection parasite), contour accentué.
  - **Mémoire de présentation** (§14.4) : le mode expert/simplifié ET les panneaux visibles par mode
    sont restaurés en revenant sur la vue (localStorage `humanome-v3-presentation`, distinct des
    données d'évaluation) ; `renderedPanels` ré-intersecte toujours `availablePanels` — une préférence
    mémorisée ne réaffiche jamais un panneau interdit (AC-UI-04 préservé).
  - Vérifié navigateur : geste +450/+300 px sur la Heatmap → 2×1 → 3×2 en direct (marqueur visuel,
    rien de persisté pendant le geste) → commit au relâchement → **rechargement complet : mode expert
    ET taille 3×2 restaurés**. Suites : web **807** (+2).

- 2026-07-17 — **D14ter — Mode expert V3 : pleine largeur + grille de tuiles éditable (demande
  utilisateur ; anticipe la « personnalisation avancée » V3.1 §25.2).**
  - **Pleine largeur** : les routes V3 (`#/cartographie`, `#/merge` démo) échappent au plafond de
    1240 px (`.app-main--full`) ; le mode simplifié reste borné à 1500 px centré pour la lisibilité.
  - **Grille de tuiles (mode expert)** : chaque panneau devient une tuile **réordonnable** (glisser-
    déposer par poignée ⠿ + boutons ◀ ▶ pour tactile et clavier — le DnD HTML5 n'existe pas au doigt)
    et **redimensionnable** par tailles prédéterminées (1×1, 2×1, 1×2, 2×2, 1×3, 3×1, 3×2, 2×3, 3×3,
    pleine largeur ×1/×2). **Colonnes adaptées à l'espace** (~340 px/colonne, bornées 1–12) :
    téléphone portrait 1, paysage 2, tablette 2-3, moniteur 3-4, 2560 px → 7, 4K → 11, 8K → 12
    (plafonné). Empans bornés aux colonnes disponibles au rendu ; contenu défilant dans la tuile ;
    cibles tactiles ≥ 40 px. `ResizeObserver` + repli `window.resize` (RO muet observé dans certains
    panes embarqués). Disposition persistée en préférence de présentation (`localStorage`, §14.4 —
    jamais dans les données d'évaluation).
  - Vérifié navigateur : 11 tuiles en expert, redimensionnement 3×3 du soleil appliqué et persisté,
    réordonnancement par boutons, 1 colonne à 375 px / 2 à 812 px paysage / 7 à 2560 px, aucun
    débordement horizontal. Suites : web **805** (+7 : logique et composant de la grille).

- 2026-07-17 — **D14bis — Soleil V3 : look carto-phone + disposition ADDITIVE (décisions utilisateur).**
  Deux retouches demandées après livraison, la seconde étant un **écart assumé à la spec §11.1** :
  - **Look carto-phone** (`prototype cartographies/carto-phone.html`) : deux couronnes (familles
    colorées à l'intérieur, compétences à l'extérieur), cinq bandes grises graduées de référence
    (l'échelle du prototype, opacité 0,4 clair / 0,3 sombre), cercles pointillés concentriques,
    séparateurs clairs, **atténuation grisée** des secteurs non survolés, centre en dégradé doux
    cliquable (proportions 8 % / 48 % du prototype). Rayon inchangé = journées documentées (log2).
  - **Disposition additive** : seules les compétences DOCUMENTÉES à la tête de lecture occupent un
    angle — montrer les 61 emplacements exposait les manques, contre l'esprit ipsatif (« l'écart à la
    spec §11.1/§13.2 est un choix produit explicite », décision utilisateur du 2026-07-17). Les angles
    restent égaux entre secteurs visibles (familles contiguës) ; **l'animation depuis le passé AJOUTE
    les secteurs** (vérifié navigateur : 11 secteurs à la 1ʳᵉ journée → 40 après dix journées → 54 à
    l'état complet) ; une famille sans compétence documentée n'apparaît pas encore ; le filtre
    n'enlève pas un secteur, il l'atténue (la disposition ne dépend que de la tête de lecture) ;
    état vide expliqué (« les secteurs apparaîtront au fil de la lecture »).
  - Suites : web **798** ; l'arbre et le tableau accessible continuent de lister tout le référentiel
    (la navigation reste complète, seul le SOLEIL est additif).

- 2026-07-17 — **D14 (v1.2) — Interface de cartographie ipsative V3 (périmètre initial §25.1).**
  Implémente `prototype cartographies/specifications-fonctionnelles-interface-v3.md` et **remplace
  l'interface de consultation existante** : `#/cartographie` (nouvelle route, nav mise à jour) et
  `#/merge` (démo) rendent l'interface V3 ; l'ancienne MergeView ne subsiste que pour un document
  `cartographie-merge` chargé par l'utilisateur (la V3 exige un adaptateur par format, spec §7) et
  pour les vues embarquées (Twin6/Twin9/espace/partage). **Entièrement client-first (ADR-001) : le
  master privé ne quitte jamais le navigateur, zéro changement d'API.**
  - **Cœur logique** `web/src/v3/core/` (10 modules, 47 tests) : identifiants stables UUIDv5 dérivés
    des octets immuables (AC-DATA-03/09) ; adaptateurs historiques carto_Pn/kairos/document-jour avec
    rapport 4 gravités (référence pendante, numéro dupliqué, trace-par-pid : alerte, jamais de
    devinette — §6.4) ; import avec quarantaine (AC-DATA-01) et variantes concurrentes « à arbitrer »
    jamais additionnées (AC-DATA-02) ; admissibilité §10 (établie + non court-circuitée + ≥1 preuve
    résolue non contestée + variante active — la confiance du verdict n'entre jamais, AC-DATA-05) ;
    métriques versionnées documented-days/months/public-presence-v1 avec rayon log2 plafonné (§11) ;
    révisions immuables + droit de réponse confirmer/nuancer/contester (AC-EDIT-01→04) ; comparaison
    ipsative par préréglages + récit déterministe référencé (AC-REFL-01/02) ; calcul des panneaux
    availablePanels = format ∩ audience ∩ mode (AC-UI-04) ; projet de partage par LISTE POSITIVE avec
    cases 3 états, cascades §18.5, constructeur 8 étapes avec REMAPPAGE d'identifiants par projection
    (AC-SHARE-07), anti-fuite des verbatims exclus (AC-SHARE-12, mémoïsé), précision temporelle
    jour/mois/masquée avec métrique assortie (AC-SHARE-10/17/19), verrou de prévisualisation
    sourceDigest/policyDigest/outputDigest (AC-SHARE-15), confirmation d'irrévocabilité (AC-SHARE-13) ;
    JSON canonique trié + digest SHA-256 (§19.4) ; réimport avec contrôle d'intégrité bloquant
    (AC-SHARE-20) et duplication monotone sans lien au master (AC-SHARE-18) ; lecteur ZIP sans
    dépendance (chemins traversants rejetés) ; persistance IndexedDB séparée des préférences.
  - **UI** `web/src/v3/ui/` : arbre + soleil (angles FIXES par compétence, rayon = journées
    documentées, halo, contours fantômes du futur) + heatmap (grille clavier, jours multidomaines
    rayés, seuils fixes §11.3) + portfolio (provenance, revue, note privée, inclusion au partage) +
    lecteur temporel (avant/arrière/vitesse, inspection ≠ tête de lecture, AC-SYNC-03/04) ;
    « Pourquoi ce rayon ? » (unités exactes de la métrique courante, AC-SYNC-05) ; comparaison +
    « Ce qui a changé » ; modes simplifié/expert conservant l'état (AC-UI-01) ; panneaux masquables
    avec « Réafficher » toujours accessible (AC-UI-03) ; thèmes système/clair/sombre + distinctions
    renforcées (symboles/motifs par famille) + impression (tableau équivalent au soleil) ; éditeur
    JSON expert refusant l'invalide (AC-EDIT-02) ; constructeur de partage avec récapitulatif avant
    inclusion groupée (AC-SHARE-14) ; vue employeur = MÊME moteur que la prévisualisation (§18.8).
  - **Vérifié au navigateur sur le corpus RÉEL** (59 journées) : 61 emplacements, **54 secteurs
    documentés** (= les 54 compétences établies du corpus), 365 cellules ; le rapport d'import a
    attrapé une **vraie anomalie du corpus** (numéro de pièce dupliqué, 5.02 au 2026-02-14 — le cas
    §6.4) ; filtre soleil→arbre→heatmap synchronisés ; inspection sans déplacement de lecture ;
    parcours de partage complet → prévisualisation exacte (54 forces). Perf corpus entier : import
    210 ms, inclusion groupée 1795 liens 215 ms, instantané + anti-fuite 181 ms (§22.2).
  - Suites **toutes vertes : PHP 518 (inchangé), engine 938 (inchangé), web 798 (+47)**.
  - **Reste pour les itérations suivantes** (documenté, hors périmètre initial strict) : adaptateur
    cartographie-merge (§7 : à déclarer compatible avec tests), corpus multi-ZIP réel Christ300 à
    valider sur pièce, préférences persistées par appareil (§14.4 — store prêt), impression mensuelle
    dédiée, V3.1 (liens hébergés, fusion sélective, caviardage).

- 2026-07-17 — **D13 (v1.2) — Restauration des versions de gabarit Twin9 (retour arrière).**
  L'archivage automatique existait (chaque écrasement versionne l'ancien contenu) mais le « retour
  arrière » promis par ADR-010 §6 n'était pas implémenté : l'historique n'exposait que des métadonnées,
  sans lecture ni restauration. C'est fait — et **jamais destructif**.
  - **Repository** : `ProtocoleRepository::version(name, v)` (contenu d'une version archivée) et
    `restore(name, v, userId)` — la restauration passe par `put()` : le vivant est archivé D'ABORD,
    puis le contenu archivé redevient vivant. L'histoire reste complète (l'état pré-restauration est
    lui-même récupérable) ; restaurer un contenu identique au vivant = no-op annoncé.
  - **Routes** (garde conjonctive admin ∧ promptologue, comme le contenu vivant) :
    `GET /twin9/admin/protocole/{name}/versions/{version}` (lecture) et
    `POST /twin9/admin/protocole/{name}/restore {version}` (422 version manquante, 404 inconnue).
  - **Atelier** (`#/twin9-atelier`) : colonne Actions dans l'historique — « Voir » (aperçu texte brut
    de la version archivée, jamais de HTML) et « Restaurer » (recharge l'éditeur + l'historique).
  - **Tests** : PHP (restauration non destructive + no-op + validations + garde de rôles : un admin
    SEUL → 403 sur lecture ET restauration), web (parcours Voir/Restaurer complet). Suites **toutes
    vertes : PHP 518, engine 938, web 751**.
  - **Vérifié au navigateur** (compte atelier dédié, gabarit FICTIF créé pour l'occasion puis purgé) :
    v2 vivante → « Voir » montre la v1 archivée → « Restaurer » → le vivant redevient v1, message
    français, historique à 2 versions (v1 originale + v2 ex-vivante) — rien d'écrasé.

- 2026-07-17 — **D12 (v1.2) — Résultat Twin9 dans le sunburst évolutif + stockage opt-in RGPD.**
  Le résultat d'une analyse approfondie (carto_evolutive.json) n'était rendu que dans sa vue dédiée
  (jauges + narratifs) ; il alimente désormais **le même sunburst évolutif** que toute cartographie,
  et devient **conservable à long terme** sous le même contrat d'opt-in RGPD.
  - **Adaptateur moteur** `engine/src/twin9/mapper.js` (`twin9ToMergeDocument`) : reconstruit un
    document-jour par journée ATTESTÉE (attestation = présence établie avec ses scores du jour ;
    signal de renvoi daté = renvoi au cartographe ; `jour_index → date` résolu sur TOUTES les
    compétences — **jamais de date inventée**, un signal non datable est ignoré et documenté), puis
    réutilise `mergeDays` + `buildMergeDocument` (aucune logique d'agrégation/quintiles/archétypes/
    ipsatif dupliquée — même patron que l'adaptateur Twin6). Narratifs pris dans carto_evolutive
    (histoires, rapports de pôle, kairos). Fichier NOUVEAU, hors périmètre de parité CPython.
  - **Vue résultats** : section « Cartographie évolutive — sunburst » (MergeView + timeline) quand le
    référentiel est là ; dégradation silencieuse sans journée datée. Bouton **« Enregistrer dans mes
    cartographies »** : sauvegarde LOCALE du carto_evolutive NATIF (type `twin9`), masqué en démo ;
    la **copie serveur reste un choix explicite daté** via le panneau existant (POST /api/cartographies
    = la décision, `opt_in_at` horodaté). Migration `021` (ENUM + 'twin9'), route élargie,
    visionneuse de l'espace re-dérive la vue merge du document natif stocké, panneau étiqueté.
    `confidentialite.md` documente le stockage opt-in du RÉSULTAT (jamais le portfolio).
  - **Tests** : mapper moteur (11, dont vecteur figé réel + règles fines et « strictement valide au
    schéma » sur fixture 7 pôles), web (sunburst/save/démo-sans-save, visionneuse twin9, store),
    PHP (opt-in twin9). Suites **toutes vertes : PHP 516, engine 938, web 750**.
  - **Vérifié au navigateur** (démo Twin9 de bout en bout) : run mock → **sunburst réel** (15 secteurs,
    couleurs des pôles, timeline évolutive « Feuille 2 / 2 — 05/03/2026 · score du jour 2 »), bouton
    d'enregistrement correctement ABSENT en démo.

- 2026-07-17 — **D10 (plan v1.1) — Garde-fou de publication + structure GitBook (parties
  autonomes).** Le dépôt est déjà public (`4nd4ny/humanome`, historique purgé au jalon précédent) ;
  cette session en industrialise la publiabilité et prépare GitBook. Les actions restantes sont
  **côté utilisateur** (voir plus bas).
  - **Garde-fou automatisé** `scripts/check-publiable.mjs` : refuse, dans les fichiers **suivis**,
    (a) un répertoire de gabarit Twin9 (`golden-twin9/`, `twin9-oracles/`, `golden-prompt/`),
    (b) un `.env` réel ou un `.pyc`/`__pycache__`, (c) un secret en clair (forme de clé `sk-ant-`,
    `PAYPAL_SECRET`, `*_PASSWORD`), (d) un chemin local absolu (`/Users/…`), (e) un identifiant OVH
    réel (hôte/cluster). Placeholders et fixtures sur liste blanche (`EXEMPLE`, `change-me`, `_dev`,
    répertoires de test) ; la règle mot de passe s'assouplit dans les tests mais clé/OVH/chemin
    restent actifs partout. **Validé par un canari** (4 types détectés sur 4). Le garde-fou a d'ailleurs
    **débusqué un résidu réel** : les identifiants OVH nommés dans une vieille entrée `STATUS.md`
    (méta-référence à la purge) — neutralisés.
  - **Hook** `.githooks/pre-commit` (activé : `git config core.hooksPath .githooks`) + **CI**
    `.github/workflows/publiable.yml` (garde-fou + suite moteur). Le hook s'est déclenché et a
    bloqué/validé les commits de cette session (vérifié en direct). La suite **front** est
    volontairement hors CI : ses fixtures importent des données **générées** (`web/public/data/**`,
    gitignorées, chaîne convert/generate multi-étapes — vérifié en clean-room qu'elle échoue sur un
    checkout nu) ; elle tourne en local, comme la suite **PHP** (Docker). Pas de CI rouge au 1ᵉʳ push.
  - **GitBook** : `.gitbook.yaml` (root `./`, readme, summary) + `SUMMARY.md` **généré** par
    `scripts/build-gitbook-summary.mjs` depuis l'arbre de doc (9 parcours `content/formation/**` +
    docs `docs/**` + ADR), **83 entrées, 100 % des liens résolus**. La doc reste éditée en markdown
    dans le dépôt (source unique) ; GitBook n'en est qu'un rendu.
  - **README** : badges (site, licence AGPL-3.0, CI) + section « Documentation ».
  - **✅ PUBLIÉ** (autorisation utilisateur 2026-07-17) : `git push origin main` (26 commits) +
    **tag `v1.1.0`** sur **https://github.com/4nd4ny/humanome** (le push git passe par le trousseau
    macOS, valide, indépendamment du token `gh`). Delta re-scanné avant push : propre.
  - **⏳ RESTE À L'UTILISATEUR** : 1) créer/associer l'**espace GitBook** et activer le **Git Sync**
    (pas d'API d'upload) ; 2) renseigner l'URL GitBook dans le README. (Aucun changement de code
    applicatif : suites inchangées vs D9 — **PHP 515, engine 927, web 743**.)

- 2026-07-17 — **D9 (plan v1.1) — Assistant tuteur interactif (Haiku).** Un panneau « 💬 »
  répond, pour n'importe quel visiteur, aux questions « par où passer sur le site ». Le prompt
  système est construit CÔTÉ SERVEUR à partir d'un digest de la doc et du rôle (déterminé par la
  SESSION, jamais par un champ client) ; **le portfolio n'est JAMAIS transmis** — seulement la
  question et la rubrique courante. **Aucune conversation stockée côté serveur** (compteurs
  anonymes) ; l'historique vit en `sessionStorage`, le temps de la session.
  - **Backend** : `api/src/routes/tuteur.php` — `POST /tuteur` protégé par la MÊME preuve de travail
    que la démo + honeypot + quota IP ; **budget propre** (circuit breaker quotidien sur une table
    dédiée `tuteur_usage_daily`, `TUTEUR_BUDGET` = **1 $/jour** par défaut, Q3), modèle Haiku
    (`TUTEUR_MODEL`). Migration `020_tuteur_usage.sql`. `UsageCounters` paramétré (table sur liste
    blanche) pour ne pas toucher au compteur de la démo. `CsrfMiddleware` exempte `/api/tuteur`.
  - **Digest** : `scripts/build-tuteur-digest.mjs` génère `scripts/data/tuteur-digest.md` depuis les
    familles de `nav.js` + les frontmatters `content/` (9 parcours, ~6,2 Ko) ; **régénéré à chaque
    `stage-api`** — comme les prompt-packages, seul le générateur est versionné (artefact gitignoré,
    évite la dérive).
  - **Front** : `web/src/components/TuteurPanel.jsx` + `web/src/lib/tuteur.js` (PoW puis POST, n'envoie
    que question + rubrique), branché dans `App` après l'aide ; styles `.tuteur`. RGPD :
    `content/legal/confidentialite.md` gagne un point « Assistant tuteur ».
  - **Deux bugs attrapés par la vérification au navigateur** (là où MockProvider diverge du vrai
    fournisseur) : (1) *nonce* — `solvePow` renvoie `{nonce, attempts}`, `tuteur.js` prenait l'objet
    entier ; corrigé + mock de test rendu fidèle. (2) **`[]` en prod** — `AnthropicProvider::complete()`
    **force l'usage d'outil** (JSON garanti pour la démo/Twin9) ; le tuteur héritait de ce mode et
    Haiku renvoyait un document vide « [] » au lieu de prose. Corrigé par un paramètre
    `forceJsonDocument` (défaut `true` = comportement démo/Twin9 inchangé ; `false` pour le tuteur =
    **texte libre**). Rendu : le modèle produit quand même du Markdown léger (**gras**) ; le panneau
    n'a **pas de parseur Markdown** (surface XSS réduite) → on retire les marqueurs inline
    (`stripLightMarkdown` : `**`, `__`, backticks) CÔTÉ CLIENT, garanti quel que soit le modèle.
  - **Tests** : `api/tests/TuteurTest.php` (8) — pas de fuite du prompt/clé, PoW requis, honeypot,
    budget dédié distinct de la démo, visiteur **et** connecté, **le vrai chemin `AnthropicProvider`
    renvoie de la prose ET la requête amont ne porte pas `tool_choice`** (le discriminant que le mock
    masquait), **tarification Haiku non nulle** (le plafond dollar peut effectivement se déclencher).
    Front : `tuteur.test.js` + `TuteurPanel.test.jsx` (dont le strip Markdown). Suites **toutes
    vertes** : **PHP 515, engine 927, web 743**.
  - **✅ DÉPLOYÉ EN PRODUCTION** (API `020` + static, puis 2 redéploiements API — correctifs prose et
    texte brut — et 1 redéploiement static — strip Markdown) — API `v1.0.0-54`. **Vérifié en ligne**
    depuis un état vidé : réponses en **prose française cohérente** citant les vraies routes du digest
    (`#/merge`, `#/essayer`, `#/referentiel`, `#/guides/cartographe`, « 7 pôles et 61 compétences
    RESPIRE ») ; le rendu ne montre **aucun marqueur Markdown** (vérifié : la sortie brute du modèle en
    contient, le panneau les retire). `migrate` HTTP 200 (`020` appliqué), `health` HTTP 200.

- 2026-07-16 — **D11 (plan v1.1) — Renommage Twin_v9 → Twin9 dans l'artefact moteur.**
  L'en-tête du rapport évolutif téléchargeable dit enfin « Twin9 » (dernier résidu du renommage global).
  - Source Python `../Twin_v9/aurora/merge3.py` (hors dépôt) : ligne d'en-tête `"*Twin_v9 — %s — %d
    journées …"` → `"*Twin9 — …"` (SEULE cette ligne ; le champ `version:"Twin_v9"` de
    carto_evolutive.json reste GELÉ, contrat de parité).
  - `engine/src/twin9/merge.js` : même chaîne → « Twin9 ».
  - Vecteur figé `merge.vec.json` **régénéré depuis le Python renommé**
    (`python3 engine/test/twin9-vectors/gen_merge_scan_vectors.py`) : seule la ligne d'en-tête de
    `rapport_evolutif_md` change, `scan.vec.json` **inchangé** (pas de hand-édition d'oracle). Régénération
    documentée dans `merge.test.js`.
  - `renommage.test.js` : `it.skip` « en-tête dit Twin9 » **réactivé** (passe), ligne d'en-tête **retirée**
    de la liste blanche du lint (ne reste que le champ version gelé).
  - **Parité CPython INTACTE** (`parite.test.js`, 6 oracles, `plant01` bit-à-bit) ; `merge.vec` à jour.
  - Suites : **engine 927 (plus de skip)**, PHP 507, web 737 ; build front OK (le bundle porte « Twin9 — »).
  - **✅ DÉPLOYÉ EN PRODUCTION** (front **static**, le moteur est bundlé côté client) : app 200.

- 2026-07-16 — **D8 (plan v1.1) — Audit adversarial des paiements et crédits.** Audit OFFENSIF du
  système de crédits prépayés Twin9/Twin6 (8 angles, un test par angle). **Verdict : aucune
  vulnérabilité** — les défenses posées au durcissement #29 tiennent. Rien à corriger, donc **rien à
  déployer** (test + doc seulement). Détail (sobre, sans exploitation) dans `docs/securite-checklist.md`
  § « Audit adversarial paiements & crédits (D8) ».
  - Nouveau `api/tests/Twin9SecurityAuditTest.php` (6 tests, 28 assertions) confirmant les variantes
    non encore explicitement couvertes : montant crédité = capture PayPal (jamais le pack ni un champ
    client, angle 3) ; débit atomique anti-découvert (4) ; remboursement d'autrui refusé, plafonné à la
    room, jamais négatif (5) ; grand-livre/factures cadrés par session, pas d'IDOR (8). Angles 1/2/5
    (déjà) `Twin9PayPalTest`, 6 `LlmPowTest`/`LlmProxyTest`, 7 `Twin9AppelTest`.
  - Suites **toutes vertes** : **PHP 507, engine 926 (+1 skip), web 737**. (Pas de déploiement : aucun
    changement de code de production.)

- 2026-07-16 — **D7 (plan v1.1) — Typographie iA Writer Quattro (auto-hébergée).**
  Toute la police du site passe à **iA Writer Quattro** (AD-D5), auto-hébergée.
  - **Fichiers** : 4 graisses woff2 (Regular/Italic/Bold/BoldItalic, ~172 Ko au total) + licence
    **SIL OFL 1.1** (`OFL.txt`) dans `web/public/fonts/quattro/` (récupérées de `iaolo/iA-Fonts`,
    copiées telles quelles dans le build). Seules les graisses utilisées sont chargées ; hors bundle JS.
  - **CSS** : `@font-face` (4, `font-display:swap` → FOUT accepté, pas de FOIT) + pile corps
    `'iA Writer Quattro', system-ui, …`. Pile **monospace inchangée** (système `ui-monospace`) :
    iA Writer Mono non embarquée en v1.1 (choix noté en commentaire).
  - **CSP** : ajout explicite de `font-src 'self'` dans `web/public/.htaccess` (les polices même-origine
    étaient déjà couvertes par `default-src 'self'` — explicite pour la clarté/défense) ;
    `docs/securite-checklist.md` mis à jour.
  - **Vérifié au navigateur** : `document.fonts.check()` = **true**, body en iA Writer Quattro, les 2
    woff2 (Regular/Bold) → **200** (aucun blocage CSP), rendu appliqué partout, 0 erreur console.
    L'impression hérite de la police (aucune surcharge `@media print`).
  - **Test** : `web/src/styles/fonts.test.js` (garde anti-régression : 4 @font-face + swap + pile corps
    + présence des woff2/licence + aucune origine tierce de police).
  - Suites **toutes vertes** : **PHP 501, engine 926 (+1 skip), web 737**, build web OK (fonts copiées
    dans `dist/fonts/quattro/`).
  - **✅ DÉPLOYÉ EN PRODUCTION** (front **static**) : `GET /fonts/quattro/iAWriterQuattroS-Regular.woff2`
    → **200**, header CSP prod contient bien `font-src 'self'`.

- 2026-07-16 — **D6 (plan v1.1) — Profil : avatar et édition (dépend de D5).**
  Ajout d'une photo/avatar + modification de l'identifiant dans le profil (AD-D4).
  - **Migration 019** : `users.avatar` (MEDIUMBLOB NULL) + `users.avatar_mime` — avatar EN BASE (pas de
    FTP), purge RGPD gratuite par la ligne `users`.
  - **API** : `PATCH /auth/me {displayName}` (édition du nom) ; `PUT /auth/me/avatar {avatar (base64),
    mime}` — le serveur **valide mime (JPEG/PNG/WebP) + magic number + taille ≤ 200 Ko** (jamais confiance
    au client, `Media\AvatarValidator`) ; `DELETE /auth/me/avatar` (retrait indépendant) ;
    `GET /users/{id}/avatar` (cache privé, 404 si absent). `/auth/me` expose `hasAvatar`. CSRF/session.
  - **Front** : section « Profil » éditable (nom via Modifier/Enregistrer ; avatar : redimensionnement
    canvas client ~256 px → ≤ 200 Ko WebP/JPEG `lib/resize-image.js`, aperçu, ajout/retrait). Composant
    `Avatar` (image ou **initiales en repli**), affiché aussi dans le panneau de nav près de
    « Se déconnecter ». **Vérifié au navigateur** bout-en-bout (repli initiales → upload PNG réel via
    canvas → servi comme avatar → retrait → retour aux initiales), 0 erreur console.
  - **RGPD** : `docs/rgpd-registre.md` §1 (photo = donnée personnelle, retrait indépendant + cascade).
  - **Tests** : PHP (`AuthAvatarTest` : PATCH nom, PUT valide JPEG/PNG/WebP, refus mime/magic/taille/
    base64, DELETE, GET 200/404, purge avec le compte, session requise, pas d'IDOR) ; web
    (`Avatar` initiales/img, `resize-image` recadrage/encodage/plafond, `AccountView` édition nom +
    upload + retrait).
  - Suites **toutes vertes** : **PHP 501, engine 926 (+1 skip), web 733**, build web OK.
  - **✅ DÉPLOYÉ EN PRODUCTION** (release `v1.0.0-46-g4b5cb3d`) : migration 019 appliquée, health ok,
    front redéployé. Smoke prod : `GET /users/{id}/avatar` → **404** (route vivante, colonne avatar OK) ;
    `PATCH /auth/me` non authentifié → **401**.

- 2026-07-16 — **D5 (plan v1.1) — Inscription durcie : double email, activation par code à 4 chiffres.**
  Un compte n'est ACTIVÉ qu'après confirmation d'un code envoyé par email (AD-D3).
  - **Migration 018** : `users.email_verified_at` (NULL = non activé), `verification_code_hash`,
    `verification_expires_at`, `verification_attempts` (+ index). **Backfill** : les comptes existants
    (dont la prod) sont réputés vérifiés (`email_verified_at = created_at`).
  - **Service Mailer** (`api/src/Mail/`) : interface + `PhpMailMailer` (`mail()` OVH, expéditeur
    `MAIL_FROM` défaut **no-reply@humanome.xyz** — pas de modif de `~/app/shared/.env`) + `MemoryMailer`
    (fake de test) + `MailerFactory` (couture d'injection). Mail français : lien
    `#/activer?email=…&code=XXXX` + code en clair, expiration 30 min.
  - **API** : `register` = double saisie email (insensible casse), crée le compte **NON activé**, envoie
    le code, **n'ouvre pas de session** (201 `pending_activation`). `POST /auth/activate {email, code}`
    active + ouvre la session (« premier login qui confirme »). `login` d'un compte non activé → **403**
    `email_not_verified`. `POST /auth/resend` régénère le code. **Sécurité du code court** : 5 essais
    max/compte, expiration, rate-limit IP sur activate ; le VRAI garde-fou = **renvoi strictement
    limité** (3/h/compte + 10/h/IP). **Anti-énumération** : réponses génériques (compte inconnu / déjà
    activé / code faux → même 401 ; resend → « ok » générique).
  - **Front** : formulaire d'inscription avec email ×2 + identifiant + mot de passe ; écran d'activation
    (saisie du code, renvoi, retour) ; route `#/activer` qui pré-remplit email + code depuis le lien.
    **Vérifié au navigateur** bout-en-bout (inscription → écran d'activation → code → connecté).
  - **RGPD** : `docs/rgpd-registre.md` §1 bis (nouveau traitement, purge par cascade `users`).
  - **Tests** : PHP (`AuthActivationTest` : login bloqué, code faux ×5 + verrou, expiration, renvoi +
    rate-limit, anti-énumération, backfill ; `AuthRoutesTest` : pending + activate + double-email) ;
    web (`AccountView` : double-saisie bloquée, parcours activation, login-403→activation, lien #/activer).
    Rayon d'impact des tests géré : `register()` (helper) = inscription+activation via `MemoryMailer`.
  - Suites **toutes vertes** : **PHP 495, engine 926 (+1 skip), web 723**, build web OK.
  - **✅ DÉPLOYÉ EN PRODUCTION** (release `v1.0.0-44-g05580cd`) : **migration 018 appliquée**
    (`{"applied":["018_email_verification.sql"]}` — backfill des comptes prod existants), health ok,
    référentiel/fiches/paquets « unchanged », front redéployé. **Smoke prod** (compte jetable) :
    `register` → **201 `pending_activation`** (pas de session) ; `login` du compte non activé → **403**
    (garde `email_not_verified` vivante) ; `activate` code faux → **401** générique (anti-énumération) ;
    app 200. L'`mail()` n'a pas erré (register 201).
  - ⚠️ **ACTION UTILISATEUR RESTANTE (Q1)** : vérifier **SPF/DKIM** et l'expéditeur
    `no-reply@humanome.xyz` au **panel OVH** — je ne peux pas lire la boîte d'un compte jetable, donc
    la RÉCEPTION réelle de l'email reste à confirmer côté toi. (`MAIL_FROM` prend le défaut :
    `~/app/shared/.env` prod NON modifié.) Un compte de smoke non activé (@example.org) subsiste en base
    (inoffensif, inutilisable) — purge possible plus tard.

- 2026-07-16 — **D4 (plan v1.1) — Visualisation : thème sombre, synchro heatmap, responsive, export JSON.**
  Quatre défauts corrigés, **vérifiés au navigateur** (#/merge, démo 59 feuilles).
  1. **Thème sombre** : `.timeline-controls button` et `.timeline-speed` avaient `background:#fff`
     SANS `color` → glyphe clair (color-scheme:dark) invisible. Corrigé avec tokens sémantiques
     (`--viz-surface`/`--viz-ink`, explicites sur les deux). Vérifié : glyphes ⏮◀▶▶▶⏭ nets en sombre.
  2. **Synchro** : `HeatmapCalendar` gagne une prop `currentDate` (date de la trame courante, fournie
     par `MergeView`) : les feuilles postérieures passent « à venir » (inertes), celle du jour courant
     surlignée. Vérifié : feuille 1/59 → 1 posée + 58 à venir ; dernière trame → tout posé.
  3. **Responsive** : le SVG passe en `viewBox` + `width:100%` + `preserveAspectRatio:xMidYMid meet`
     (max-width = taille naturelle, conteneur `overflow-x:auto`). Vérifié à 360 px : heatmap 238 px,
     ne déborde pas.
  4. **Export JSON** : util UNIQUE `web/src/lib/download-json.js` (factorisé depuis Twin9) ; bouton
     « Exporter le JSON » ajouté à `EssayerView` (cartographie-jour) et `Twin6OuverteView` (run.doc) ;
     `ResultatsTwin9` réutilise l'util (fin de la triplication).
  - **Tests** : `HeatmapCalendar` (currentDate, à venir, fluidité SVG), `download-json` (objet/chaîne,
     no-op SSR), `EssayerView`/`Twin6OuverteView` (bouton + nom + type du blob), `TimelinePlayer`
     non-régression. Vérif navigateur documentée (sombre + 360 px + heatmap qui se remplit), 0 erreur console.
  - Suites **toutes vertes** : **PHP 487, engine 926 (+1 skip), web 719**, build web OK.
  - **✅ DÉPLOYÉ EN PRODUCTION** (front **static** seul) : app 200. Comportement visuel vérifié au
    navigateur en local (le prod sert le même bundle).

- 2026-07-16 — **D3 (plan v1.1) — Présenter l'offre employeur (moteur de recherche de compétences).**
  Présentation SEULE (AD-D6 : le moteur reste au backlog marketplace) : les tuiles employeur parlent
  enfin de l'offre payante à venir.
  - **FamilyTiles** : la carte persona employeur gagne un second volet « Rechercher des profils
    (à venir) » — abonnement payant qui finance l'accès gratuit à l'API pour les pays émergents, tarif
    **1 USD/cartographie remontée dégressif à partir de 10/100/1000**, facturation forfaitaire avant les
    recherches ajustée le mois suivant (crédits restants reportés), appel à manifestation d'intérêt
    (`mailto:contact@humanome.xyz`, constante `CONTACT_EMPLOYEUR`). Badge « à venir », aucune promesse
    de disponibilité immédiate.
  - **Aide** : entrée `employeur` dédiée (modèle tarifaire en clair + financement pays émergents).
  - **Formation** : nouveau chapitre `content/formation/employeur/05-offre-recherche-de-profils.md`
    (auto-globbé, statut complet, ordre 5).
  - **Doc source de vérité** : `docs/offre-employeur.md` (pricing versionné ; taux dégressifs marqués
    INDICATIFS — le plan ne fixe que base 1 USD + seuils 10/100/1000, pas les taux exacts, pas d'invention).
  - **Tests web** : volet + tarif + contact + « à venir » sans promesse immédiate (`FamilyTiles`),
    chapitre présent et complet (`formation-content`), traçabilité aide (`registry`).
  - Suites **toutes vertes** : **PHP 487, engine 926 (+1 skip), web 712**, build web OK.
  - **✅ DÉPLOYÉ EN PRODUCTION** (front **static** seul, pas de changement API/moteur) : app 200.
    Le volet employeur est rendu côté client (accueil → « Voir les profils » → « Employeur ») —
    vérifié par le test composant `FamilyTiles`.

- 2026-07-16 — **D2 (plan v1.1) — Édition du Twin9 réservée aux administrateurs-promptologues.**
  Décision AD-D2 : garde en **conjonction** admin ∧ promptologue, côté serveur ET front.
  - **Serveur** : nouveau `RequireRole::all(...)` (les DEUX rôles requis). Toutes les routes de
    CONTENU des gabarits Twin9 (`/twin9/admin/protocole**` en lecture/écriture/versions +
    `/twin9/admin/tester`) passent en `all('admin','promptologue')` : un admin non-promptologue ne
    voit plus le contenu (**403**), et le gabarit ne fuite jamais dans un refus. La SUPERVISION
    (config, contribution, promo « Twin9 gratuit », comptes) reste `admin` seul.
  - **Front** : l'éditeur des gabarits quitte l'admin pour une vue dédiée **`#/twin9-atelier`**
    (`Twin9AtelierView`) sous la famille « Faire évoluer », visible seulement si la session porte
    les deux rôles (nouvel attribut de nav `allRoles`, conjonction dans `navGroups`).
    `#/admin/twin9` (`Twin9Section`) garde la supervision (réglages + comptes) et pointe vers
    l'atelier. Le slider promo reste dans la supervision admin.
  - **Sécurité inchangée** : le contenu reste du texte brut (jamais de HTML/markdown) ;
    `/twin9/meta` et le filtre anti-fuite ne bougent pas.
  - **Tests** : matrice de rôles PHP complète (aucun rôle / admin seul / promptologue seul / les deux)
    sur chaque route de gabarits + garde supervision (`Twin9ProtocoleTest`) ; web
    (`Twin9AtelierView.test.jsx` garde 2 rôles + édition/banc d'essai, `Twin9Section.test.jsx`
    supervision seule, `nav.test.js` conjonction, aide `twin9atelier`). Doc : `docs/autorisations.md`.
  - Suites **toutes vertes** : **PHP 487, engine 926 (+1 skip), web 711**, build web OK.
  - **✅ DÉPLOYÉ EN PRODUCTION** (release `v1.0.0-38-gce6cea9`) : migrate skipped 17,
    référentiel/seed/fiches « unchanged », paquets « unchanged », health ok, front redéployé. Smoke
    prod : routes de contenu gabarits (`GET /twin9/admin/protocole`, `POST /twin9/admin/tester`) →
    **401** non authentifié (garde `RequireRole::all` vivante) ; app 200. La distinction admin-seul
    (403) vs admin ∧ promptologue (200) est couverte par la matrice PHP.

- 2026-07-16 — **D1 (plan v1.1) — Twin6 forkable dans l'atelier promptologue.** Le protocole open
  source Twin6 est désormais un **paquet publié forkable** au même titre qu'`aurora-v3-reconstruit`,
  sans changer la page publique `#/twin6-ouverte` (qui sert toujours le JSON statique).
  - **Import** : `scripts/build-twin6-prompt-package.mjs` construit un document `prompt-package`
    (scan-pole + kairos + méga-prompt + 7 fiches en `prompts[]` éditables, `code.orchestration` avec
    marqueur `engine://…(twin6)`) depuis le **même corpus** que le paquet statique. `stage-api.sh`
    régénère les deux paquets (aurora + twin6) avant chaque `deploy.mjs api` (import idempotent par hash).
  - **Byte-identité prouvée** : `twin6-prompt-package.test.js` — scan-pole/kairos/fiches du paquet
    importé === paquet statique (source unique, aucune dérive).
  - **Réservation + fork-with-rename** : `metadata.reserved: true` marque le paquet comme propriété du
    pipeline source-unique ; `POST /prompt-packages/drafts` d'un paquet réservé **exige** un `toId`
    (nouveau nom, slug frais) → le fork est SA copie, publiable sous son propre nom. Le fork mémorise son
    origine (`metadata.forkedFrom`). Garde-fou aussi dans `publishDraft`. `GET /prompt-packages` expose
    le drapeau `reserved` (via `JSON_EXTRACT`, sans migration).
  - **Diff fork ↔ original** : la route de diff existante ne compare que des versions **publiées du même
    id** ; nouvelle route `GET /prompt-packages/drafts/{id}/diff-origin` compare le brouillon (fork) à son
    original (`forkedFrom`) même sous des ids différents — owner-scopé. Bouton dédié dans l'éditeur.
  - **Banc d'essai** : branche Twin6 (`usesTwin6Engine`/`extractTwin6Templates`) → `executerTwin6` sur le
    **portfolio entier** (7 scan-pôle + kairos → `cartographie-merge`), jamais l'extraction aurora par
    jour ; modes multi-run/A-B réservés aux paquets par jour. Accueil de l'atelier : encart
    « Partir du Twin6 ».
  - **Doc** : `docs/contrats.md` §8 (sémantique de version immuable, réservation, exécution déléguée).
  - Suites **toutes vertes** : **PHP 487, engine 926 (+1 skip = D11), web 709**, build web OK.
  - **✅ DÉPLOYÉ EN PRODUCTION** (release `v1.0.0-36-gd52fcd0`) : `migrate` skipped 17,
    référentiel/seed/fiches **« unchanged »** (garde-fou confirme : aucun contenu confidentiel bougé),
    `import-prompt-package twin6-ouverte` → **`imported`** (aurora `unchanged`), health ok. Smoke prod :
    `GET /api/prompt-packages` → `twin6-ouverte reserved:true` ; le doc publié est `kind:prompt-package`
    (10 prompts, marqueur `(twin6)`) ; la page statique `data/twin6/twin6-ouverte-1.0.0.json` répond
    **200 inchangée** ; app 200. Vérif UI interactive du fork couverte par les tests composant (une
    session promptologue en prod donnerait la confirmation live).

- 2026-07-16 — **✅ DÉPLOYÉ EN PRODUCTION** (release `v1.0.0-33`, `/api/health` ok, `migrate` skipped 17,
  seed/référentiel/fiches tous « unchanged » — le garde-fou fiches confirme qu'aucun contenu confidentiel
  n'a bougé ; front `index-DEyhdUY0.js` servi). **Historique git PURGÉ** avant publication
  (`git filter-repo`) : le `.pyc` fuyant un chemin local et les identifiants OVH réels (hôte/cluster)
  retirés de **tout** l'historique (vérifié : 0 occurrence sur `git rev-list --all`) ; tag `v1.0.0` conservé,
  69 commits réécrits, sauvegarde `../humanome-backup.bundle` rafraîchie. **✅ PUBLIÉ OPEN SOURCE**
  sur **https://github.com/4nd4ny/humanome** (public, AGPL-3.0, `main` + tag `v1.0.0`) : 1463 fichiers,
  vérifié sans aucun fichier confidentiel (golden/twin9-oracles/gabarits/.pyc/.env absents),
  `.env.example` en placeholders seulement. Détail des correctifs ci-dessous.
  Vérification multi-agents (13 domaines, lecture seule) de tout ce qui avait été demandé dans les
  sessions précédentes ; la plupart est **réellement implémenté et désormais couvert par des tests
  dédiés** (~40 fichiers de tests écrits/étendus). Défauts détectés **corrigés** (pas seulement
  journalisés) :
  - **Packs de recharge** `Twin9Config` : la grille demandée 10/20/50/**100/200/500** USD (`PACK_MAX_USD`
    100 → 500). Tests préexistants alignés (`Twin9AppelTest`, `Twin9ProtocoleTest` : borne « trop gros »
    150 → 750).
  - **Réécriture d'historique au re-seed** (bug source-unique) : `CompetenceRepository::reconcileSeed`
    ne backfille plus une version de seed **dépassée par une édition gouvernée** (garde `Semver::greaterThan`)
    — la diff 1.0.0 → 1.1.0 reste visible (`FicheParityTest`).
  - **Éditeur de fiche épistémiarque** : `EditeurSection` expose enfin le champ `content.fiche`
    (source unique) — la chaîne « édition d'une fiche dans l'atelier → Twin6/Twin9 » est bouclée côté UI.
  - **Garde-fou crédits Twin6** : `Twin6OuverteView` bloque un run sur NOTRE clé si le solde ne couvre
    pas le poids du portfolio (heuristique utilisateur ~1 ko = 1 USD) ; `fetchTwin6Offer` propage
    `solde_microusd`.
  - **Promo Twin9 côté front** : `Twin9View` consulte `meta.twin9_cle_perso_ouverte` (le backend
    l'implémentait déjà : refus 403 hors promo) — bandeau promo + option « clé privée » proposée
    seulement quand la promo est ouverte.
  - **Aide contextuelle** `epistemiarque` (rubrique sans entrée dédiée) ; **libellé** grand-livre
    `refund` → « Remboursement » (`CreditView`).
  - **Pré-publication** : suppression d'un `.pyc` versionné (fuite de chemin local) + `__pycache__/`/`*.pyc`
    gitignorés ; `api/.env.example` re-placeholderisé (identifiants OVH réels retirés du template public).
  - **Reporté au plan v1.1 (D11)** : renommage `Twin_v9 → Twin9` dans l'en-tête de `rapport_evolutif.md`
    (moteur) — impose de régénérer le vecteur figé `merge.vec.json` depuis le Python renommé, pas de
    hand-éditer le vecteur (la parité CPython réelle ne compare pas cet en-tête). Test `renommage.test.js`
    en `it.skip` documenté + ligne d'en-tête en liste blanche du lint. **Reportés aussi** (feature/plan) :
    assistant tuteur Haiku (D9), GitBook (D10) — voir `cahier des charges/plan-prompts-v1.1-developpement.md`.
  - Suites **toutes vertes** : **PHP 481, engine 926 (+1 skip = D11), web 696**, build web OK.

- 2026-07-16 — **✅ DÉPLOYÉ EN PRODUCTION** (release `v1.0.0-29-g625a4ad`, commits `131326b` clé API profil
  + `625a4ad` source unique fiches). `migrate` → **017** (skipped 16). Seed : **61 compétences backfillées**
  avec fiche + 7 en-têtes, gate structurel OK (`b246101c`). **`generate-fiches` → `"unchanged"` (garde-fou) :
  le `twin9_fiches` généré depuis la base est BYTE-IDENTIQUE au golden prompt live — la prod CONFIRME la parité.**
  Front redéployé (prebuild régénère P*.md + paquet Twin6 byte-identique). Smoke prod : `/api/keys`→401 (live),
  `/api/competences/1.01` porte sa **fiche**, paquet Twin6 servi (7 fiches), app 200, référentiel 7.1.0. `deploy.mjs`
  n'a pas touché `~/app/shared/.env` ; `vendor/autoload.php` vérifié. Édition d'une fiche → `dump-fiches` (BDD→corpus)
  pour Twin6, `generate-fiches` (endpoint) pour Twin9 ; FUTURE-ONLY.

- 2026-07-16 — **SOURCE UNIQUE du référentiel : la compétence en base génère les fiches Twin6 + Twin9.** Fin du triple-maintien des fiches de scan (Twin6 P*.md publics +
  setting `twin9_fiches` + gabarits tagger, tous byte-identiques, `cmp` confirmé). Désormais **une seule
  source** : `competence.content.fiche`. Tests : **PHP 432, engine 911 (parité INTACTE), web 569**, parité
  octet prouvée à chaque niveau.
  - **Découverte clé (analyse multi-agents)** : la prose des fiches N'EST PAS confidentielle (déjà publique
    via Twin6, octet-identique au tagger Twin9) et **AUCUN oracle ne fige ses octets** (les vecteurs ne
    portent que [num,code,nom] ; le moteur teste la logique d'assemblage avec des fiches factices). La
    parité octet est donc une **cible auto-imposée** → gate dédié, pas un invariant existant.
  - **Extraction + preuve** : `scripts/extract-fiches.mjs` découpe les P*.md via le VRAI `parsePole` du
    moteur → `scripts/data/fiches-v7.json` (61 fiches + 7 en-têtes) et **prouve la régénération byte-exacte**
    (règle b : `header + Σ fiche.join("\n\n") + "\n"`, ≠ ficheComplete runtime qui double le `---`).
  - **Base = source** : schéma `competence.fiche` (hors hash structurel → `b246101c` intact) ; migration 017
    `referentiel_poles.header` ; `CompetenceSeeder` injecte fiche + en-tête et **backfille** les 1.0.0
    publiées sans fiche (`reconcileSeed` — sûr : aucune carto n'épingle une compétence).
  - **Générateurs déterministes** : `FicheGenerator` (PHP) reconstruit les P*.md (règle b) + la structure
    `twin9_fiches` depuis la base — `FicheParityTest` prouve **P*.md régénérés === fichiers d'or, octet pour
    octet**. `scripts/generate-fiches.mjs` (JS) régénère les P*.md depuis le corpus.
  - **Twin6 dérive du corpus** : `web` prebuild = `generate-fiches` + `build-twin6-package` → paquet
    byte-identique. Les P*.md (gitignorés) redeviennent des ARTEFACTS ; le corpus committé est la source.
  - **Twin9 dérive de la base** : endpoint `POST /api/admin/generate-fiches` (MIGRATE_TOKEN) régénère le
    setting confidentiel `twin9_fiches` via FicheGenerator→FicheStore. Le réassemblage runtime POLE_FICHES
    (avec `---` doublé) et COMPETENCE_FICHE restent **byte-identiques** (mêmes octets de fiche_md).
  - **Confidentiel PRÉSERVÉ** (non touché) : les 29 gabarits d'enrobage (`twin9_protocole`, tagger/lourd/
    merge) restent importés séparément par `import-protocole.mjs` (ils ne dérivent pas du référentiel) ;
    `twin9_fiches` jamais exposé par `/meta` ; permutation anti-gaming intacte.
  - **GARDE-FOU déploiement (revue advisor)** : `POST /admin/generate-fiches` COMPARE le `twin9_fiches`
    courant au généré et **refuse un écrasement silencieux** (409) sans `{"force":true}` — au 1er déploiement
    il DOIT rapporter « unchanged » (vérifié en dev) ; un diff = la prod contredit le corpus, on STOPPE.
    `deploy.mjs` sans force par défaut ; `FICHES_FORCE=1` pour une évolution assumée. Round-trip testé sur la
    règle RUNTIME (`FicheStore` → `poleFiches`, `---` doublé) que Twin9 envoie au LLM, pas seulement la règle P*.md.
  - **Boucle FERMÉE (source unique vraie)** : `GET /admin/dump-fiches` + `scripts/dump-fiches.mjs` re-synchronisent
    le corpus DEPUIS la base (byte-stable : dump === extract). Éditer `competence.fiche` dans l'atelier →
    `dump-fiches` (BDD→corpus) → Twin6 au build ; `generate-fiches` (endpoint) → Twin9. Les deux dérivent de la
    base. **FUTURE-ONLY** (cartos passées épinglent leur paquet). `stage-api.sh` embarque `scripts/data/`.
    **À COMMITER/DÉPLOYER sur demande** (tenir le déploiement jusqu'à ce que le garde-fou rapporte « unchanged »).

- 2026-07-15 — **Clé API privée dans le profil → Twin6 sur sa propre clé. FRONT-ONLY, NON COMMITÉ,
  NON DÉPLOYÉ.** Le backend `/api/keys` (KeyVault sodium, migration 005, providers anthropic/openai/
  google/openrouter/xai/ollama) existait déjà et est en prod — il manquait l'UI et le câblage.
  - `web/src/api/keys.js` (list/store/reveal/delete + `KEY_PROVIDERS`).
  - `web/src/views/account/ApiKeysSection.jsx` : section « Clés API personnelles » dans le profil
    (`#/compte`) — lister (provider + date, JAMAIS la clé), ajouter (select fournisseur + champ password,
    chiffrée serveur opt-in RGPD, jamais réaffichée), supprimer. Câblée dans `AccountView`.
  - `Twin6OuverteView` : voie « clé perso » — si une clé du fournisseur (anthropic) est enregistrée au
    profil, propose « Utiliser ma clé enregistrée » (révélée à la demande via `revealKey`, no-store) sans
    ressaisie ; sinon saisie manuelle + lien vers le profil.
  - Vérifié au navigateur (dev) : clé stockée **chiffrée** (blob sodium, pas le clair), listée sans le
    matériel, Twin6 propose la clé enregistrée, bouton « Lancer » actif sans ressaisie. Tests web 569 verts.
  - **Note** : « Option B » de notre échange = déverrouillage Twin9 (protocole→moteur + oracles) ; cette
    tâche est la clé-perso-Twin6, distincte. À committer/déployer sur demande.

- 2026-07-15 — **✅ DÉPLOYÉ EN PRODUCTION** (release `v1.0.0-26-g5ae20eb`, commit `5ae20eb`) —
  éditeur épistémiarque (gouvernance 015) + référentiel v7.1 enrichi + **modèle compétence ATOMIQUE
  (016)**, en un seul déploiement. `migrate` a appliqué **015 + 016** (skipped 14). Import référentiel :
  7.0.0 unchanged, **7.1.0 imported** (hash `b246101c`). **seed-competences** : 61 importées, 7 pôles,
  **gate de parité OK (`b246101c` === publié)**, lockfile 122. Smoke prod : `/api/competences` → **61**,
  `/api/referentiel` → 7.1.0 + définitions, `/api/competences/1.01` → protocole passe_1/2/3, health db:ok ;
  front statique déployé, `#/referentiel` affiche **RESPIRE v7.1 (61 compétences + définitions)**, 0 erreur
  console. `deploy.mjs` N'A PAS touché `~/app/shared/.env`. `vendor/autoload.php` vérifié avant push (483
  classmap). Reste (Option B, scopeLater) : brancher protocole→moteur + empreinteJournee (touche le golden
  prompt Twin9 verrouillé) pour rendre l'enrichissement agissant en prod.

- 2026-07-15 — **RÉARCHITECTURE : référentiel au grain COMPÉTENCE ATOMIQUE (migration 016).** Correction
  d'architecture demandée par l'utilisateur : les 61 compétences sont
  des ENTITÉS ATOMIQUES éditées / versionnées / gouvernées / concurrentes INDÉPENDAMMENT (modèle des
  YAML fournis : chaque compétence porte identité + protocole passe_1/2/3 + enrichissements). Décision
  utilisateur : **Option A « éditorial d'abord »** — modèle atomique complet, moteur Twin9 FIGÉ.
  Tests avant déploiement : **PHP 430, engine 911 (parité oracles INTACTE), web 562**, vérifié bout-en-bout
  au navigateur (proposer→éditer→CAS→voter→entériner ; 1.01 passée à v1.1.0 pendant que les 60 autres
  restent à v1.0.0 — indépendance prouvée). 0 erreur console.
  - **Migration 016 (additive)** : `competence_versions` (append-only par (code,semver), contenu riche
    JSON, nom/pôle STRUCTURELS porteurs du hash, `content_hash` = jeton CAS interne), `competence_votes`
    (miroir 015), `referentiel_snapshot_competences` (lockfile release↔version de compétence),
    `referentiel_poles`. `referentiel_versions` (003) CONSERVÉ comme couche de COMPOSITION (snapshot que
    le moteur consomme / que les cartographies épinglent — INCHANGÉ). Gouvernance document (015) conservée
    mais supersédée. Registre RGPD étendu (`competence_versions.created_by/submitted_by` SET NULL,
    `competence_votes.user_id` CASCADE).
  - **Deux hashes qui ne se mélangent jamais** : hash STRUCTUREL du snapshot = `ContentHash::compute`
    INCHANGÉ (`SnapshotAssembler` réassemble {poles,competences:{code,nom,pole}} et **appelle**
    ContentHash, aucune ré-implémentation) → **corps assemblé === publié `b246101c…` PROUVÉ** (gate de
    parité, aucun oracle/vecteur Twin9 ne bouge). `content_hash` par compétence = hash du contenu riche,
    PHP-interne (aucune parité Node).
  - **Concurrence PAR COMPÉTENCE (résout le lost update)** : `CompetenceRepository::updateDraft` fait un
    compare-and-swap ATOMIQUE dans le WHERE (`content_hash = :expectedHash AND status='draft'`) — en-tête
    `If-Match` côté API (428 si absent, 409 si périmé), gestion du no-op idempotent via re-findById.
    Deux épistémiarques sur deux compétences différentes = ZÉRO conflit.
  - **Gouvernance PAR COMPÉTENCE** : helpers purs `Electorate` + `MajorityTally` extraits (ReferentielGovernance
    délègue, non-régression verte) ; `CompetenceGovernance` (submit/withdraw/castVote/tally par
    competence_version_id) ; une compétence entérinée à la majorité pendant qu'une autre reste en débat.
  - **Coupe de release** : `ReferentielRepository::cutReleaseFromDocument` (assemble → gate complétude
    61/7 + semver strict, SANS second vote — déjà entériné par compétence) + lockfile.
  - **Schéma** `competence.schema.json` (identité/protocole/enrichissements, permissif) ajouté à
    Validation (PHP seul ; le moteur JS ne valide pas les compétences).
  - **Seed reproductible** : 61 YAML → `scripts/data/competences-v7.json` (converti PyYAML, committé) →
    `CompetenceSeeder` (partagé CLI `scripts/seed-competences.php` + endpoint `POST /api/admin/seed-competences`,
    MIGRATE_TOKEN, FTP-only). Lockfile WRITE-ONCE (INSERT IGNORE : un re-seed ne réécrit pas l'historique).
    `stage-api.sh` copie `scripts/data/` ; `deploy.mjs` applique 016 + importe référentiel + seed compétences.
  - **Routes** `api/src/routes/competences.php` (lectures publiques + cycle par compétence, mutations sous
    RoleGuard, vote membre-only). **Front** `EpistemiarqueView` réécrit au grain compétence : 61 par pôle,
    éditeur RICHE (identité + marqueurs + signaux passe_1 + enrichissements) avec CAS/If-Match, page de vote
    par compétence (diff, décompte, entérinement), coupe de release.
  - **scopeLater (Option B, non fait, touche le prompt verrouillé prod)** : brancher le protocole des
    compétences sur le moteur (générer les fiches `P{num}.md`) + `empreinteJournee` pour qu'un enrichissement
    déclenche un re-scan en PROD → impose de régénérer TOUS les oracles/vecteurs Twin9 + bump `VERSION_PROTOCOLE`.
    Tant que non fait : l'enrichissement d'un protocole est GOUVERNÉ et VERSIONNÉ mais n'AGIT PAS encore sur
    les cartographies de production. Export statique par compétence (ressource riche) non fait non plus.
  - **⚠️ À DÉPLOYER par l'utilisateur** : `deploy.mjs` (migration 016 + seed compétences via endpoint). Idem
    caveat précédent sur la page publique statique (déployer depuis ce working tree ou régénérer).

- 2026-07-15 — **Éditeur collaboratif des épistémiarques + gouvernance par vote (cahier §3.5)
  + référentiel enrichi des définitions (RESPIRE v7.1). PAS ENCORE DÉPLOYÉ.** Tests avant
  déploiement : PHP 401, engine 911, web 563 (verts).
  - **Gouvernance (migration 015)** : une édition du référentiel est un BROUILLON ; sa soumission
    ouvre un VOTE (statut `review`, déjà dans l'enum 003) ; elle n'est ENTÉRINÉE (publiée) qu'à la
    **majorité des membres épistémiarques** (`floor(N/2)+1` de l'électorat courant — abstentions et
    non-votants rendent le passage plus dur). Table `referentiel_votes` (1 bulletin/membre, upsert,
    purge RGPD en cascade), colonnes `submitted_at/by` + `decidim_url` sur `referentiel_versions`.
    Classe `ReferentielGovernance` (submit/withdraw/castVote/tally/électorat). `updateDraft` refuse
    d'éditer une proposition en vote (gel — sinon les votes seraient invalidés) ; `publish` gate sur
    `review` + majorité ; N=0 → publication bloquée (message clair) ; majorité `contre` → `rejected`.
    Vote réservé au rôle `epistemiarque` (un admin facilite mais n'est pas de l'électorat). Registre
    RGPD (`RgpdAuditTest`) mis à jour : `referentiel_votes.user_id` CASCADE, `submitted_by` SET NULL.
  - **Routes** : `GET/POST` drafts+`{id}`, `…/submit`, `…/withdraw`, `GET proposals[/{id}]` (diff+tally+votes),
    `POST proposals/{id}/votes`. Toutes les mutations derrière `RoleGuard` (`ReferentielAuthzTest` étendu).
  - **Vue `EpistemiarqueView`** (`#/epistemiarque[/editer|proposition/<id>]`) : atelier (version en
    vigueur, brouillons, propositions au vote), éditeur (noms/couleurs pôles, noms+**définitions**
    compétences), page de vote (diff, décompte + barre de progression, boutons pour/contre/abstention +
    commentaire, lien Decidim, bouton « Entériner » actif à la majorité, retrait). Nav « Édition du
    référentiel » repointée `#/referentiel`→`#/epistemiarque`. Vérifié au navigateur bout-en-bout :
    créer → éditer → soumettre → voter (1 membre, seuil 1) → entériner → 7.1.0 en vigueur, 0 erreur console.
  - **Référentiel enrichi (RESPIRE v7.1, E1)** : les 61 définitions fournies par les épistémiarques
    (`../referentiel/referentiel_liste.txt`) commitées in-repo (`scripts/data/referentiel-v7-definitions.json`),
    `scripts/enrich-referentiel.mjs` produit `respire-v7.1.0.json` (champ `description` facultatif).
    **Invariant clé** : `description` N'ENTRE PAS dans le hash (ContentHash inchangé sur le corps
    structurel) → 7.1.0 porte le **même contentHash que 7.0.0**, fixture et oracles engine intacts
    (911 verts = preuve de parité). Schéma étendu (description optionnelle) ; `ContentHash::normalize`
    préserve les clés extra en ordre canonique. `deploy.mjs` importe désormais 7.0.0 **et** 7.1.0.
    Vue publique `#/referentiel` affiche les définitions (cherchables). Limite notée : le diff est
    aveugle aux changements de définition seule (hors hash) — acceptable en v1.
  - **⚠️ À DÉPLOYER par l'utilisateur** — `deploy.mjs` importe 7.1.0 en BASE (atelier connecté) mais
    la page PUBLIQUE `#/referentiel` lit les fichiers STATIQUES `web/public/data/referentiel/` (gitignorés,
    générés). Déployer depuis CE working tree (les fichiers 7.1.0 y sont déjà présents) OU, sur un clone
    frais, régénérer d'abord dans l'ordre :
    `node scripts/extract-referentiel.mjs` → `node scripts/enrich-referentiel.mjs` →
    (import DB via `deploy.mjs api`) → `docker compose run --rm -w /var/www/html php php scripts/export-referentiel-static.php`
    → `cd web && npm run build` → `node scripts/deploy/deploy.mjs static`. Sinon l'atelier montre v7.1
    mais la page publique reste v7.0 (sans définitions). Un compte au moins doit porter le rôle
    `epistemiarque` pour entériner de futures éditions (électorat = comptes portant ce rôle).

- 2026-07-15 — **Déployé en production : thème sombre + Twin6 (front + API).** Commit `0a4933b`
  (feat twin6 + refinements Twin9 + renommage), release API `v1.0.0-24-g0a4933b`. `migrate`
  n'a rien appliqué (`{"applied":[],"skipped":14}` — schéma prod déjà à jour). Vérifié en ligne :
  `/api/health` `db:ok`, `POST /api/twin6/appel` sans session → **401** (route live + gardée),
  paquet public `data/twin6/…` → 200, page `#/twin6-ouverte` rendue (gratuit clé perso / crédits),
  thème sombre actif, 0 erreur console. Tests avant déploiement : PHP 382, engine 911, web 549.

- 2026-07-15 — **Thème sombre + épingle du menu persistante.** (1) **Thème sombre** complet :
  tout `global.css` passe par des tokens sémantiques (`:root` = clair) ; deux blocs redéfinissent
  ces valeurs en sombre — `@media (prefers-color-scheme: dark) :root:not([data-theme='light'])`
  (suit le système) et `:root[data-theme='dark']` (choix explicite qui prime). ~50 couleurs
  codées en dur tokenisées (statuts ok/warn/danger/info, badges, ombres, voile) via script
  protégeant les lignes de définition. La **visualisation** (sunburst + heatmap + timeline) reste
  sur une surface CLAIRE `--viz-surface` dans les deux thèmes (panneau graphique encadré : la
  géométrie du moteur — secteurs gris jusqu'au noir, dégradé central pâle — n'a pas à être
  réécrite) ; ses textes/liserés utilisent `--viz-ink*` (sombres partout). Bouton **bascule
  soleil/lune** dans la grappe d'actions ; script **anti-FOUC** dans `index.html` (pose
  `data-theme` avant le paint si un choix est stocké) ; util `src/lib/theme.js` (localStorage,
  `matchMedia` gardé, abonnement au système tant qu'aucun choix). (2) **Épingle du menu** :
  l'épinglage (punaise du panneau) est désormais **persisté** (`localStorage`) et, sur grand écran
  (≥ 921 px), **docke** le tiroir en décalant `.app-main` pour ne pas masquer le contenu.
  Vérifié au navigateur en clair ET sombre (accueil, merge/viz encadrée, journée, menu, badges,
  toggle, persistance) ; revue adversariale contraste ; tests web 549+.

- 2026-07-14 — **En-tête épuré : grappe d'actions flottante + tiroir de nav depuis la
  gauche + épinglage + déconnexion rapide.** `.app-header` perd la marque et son fond
  (coquille invisible, juste une réserve de hauteur) ; `.app-header-actions` (aide + burger)
  passe en `position: fixed` (un `sticky` classique serait resté borné par la boîte quasi
  vide de `.app-header`, qui n'a plus assez de hauteur propre pour offrir une plage
  d'accroche — piège découvert et corrigé en vérifiant au navigateur, pas juste supposé).
  Le panneau de nav (`.app-nav-panel`) passe d'un dropdown ancré sous le bouton à un tiroir
  `position: fixed` pleine hauteur qui glisse depuis le **bord gauche de l'écran** (pas du
  bouton, resté à droite) via `transform: translateX(-100%/0)`, toujours dans le DOM (pas de
  `display:none`, a11y). Ajout d'une **icône punaise** dans l'en-tête du panneau
  (`.app-nav-panel-head`) : épingle l'ouverture (`is-pinned`), qui résiste au survol perdu,
  au clic extérieur et même à un changement de route (seule Échap ou la punaise referment) —
  état `pinned` lu via ref dans l'effet de route pour ne pas le reprogrammer à chaque
  épinglage. Ajout d'un bouton **« Se déconnecter »** (icône porte + flèche) en bas de
  `app-nav`, visible seulement connecté, appelant le vrai `logout()` d'`api/client.js` avec
  dégradation gracieuse (comme `AccountView`). `html { overflow-x: hidden }` pour clipper le
  tiroir hors-écran sans élargir le scroll (attention : jamais sur `body` seul, bascule
  implicite d'`overflow-y` en `auto` qui casse les contextes de scroll imbriqués). Vérifié au
  navigateur : desktop (survol révèle, clic épingle, épinglage survit à une vraie navigation
  intra-app, Échap referme + rend le focus), mobile (tap ouvre/ferme au tap extérieur),
  actions flottantes visibles au défilement sans chevaucher le contenu. Tests web 537 verts.

- 2026-07-14 — **Refonte de la navigation : 7 familles d'intention + landing « palais mental ».**
  Étude d'ergonomie complète (`docs/ergonomie-navigation.md` : mindmaps par persona, frictions
  confirmées + découvertes via 8 lentilles-persona multi-agents, 3 philosophies candidates,
  synthèse) puis câblage validé par l'utilisateur. **(1) Burger accessible** : la nav quitte la
  barre pour un panneau déroulant (survol desktop avec délai de grâce, clic épinglant web+mobile,
  focus clavier via `:focus-within`, Échap/clic-extérieur ferment ; liens toujours dans le DOM,
  masquage visuel seulement). **(2) `nav.js` réécrit** = source unique des 7 familles nommées par
  le BUT (Découvrir · Ma cartographie · Encadrer et garantir · Piloter mon organisation · Faire
  évoluer · Administrer · Mon compte), role-additives, items filtrés par rôle (l'épistémiarque a
  enfin un domicile : « Édition du référentiel ») ; badges d'échelle de valeur
  gratuit/standard/premium sur Essayer / Cartographier mes écrits / Analyse approfondie
  (friction n°1) ; `isCurrentItem` route+section. **(3) Landing de profil**
  (`components/FamilyTiles.jsx`) : tuiles des familles de la session teintées par famille
  (`--fam-*`) ; visiteur = bouton « Voir les profils d'utilisateurs » révélant la persona-bar
  (8 profils ; Employeur = carte explicative du lien de partage) ; **callout d'aide** : le
  survol/focus d'un lien de tuile affiche le contenu du bouton « ? » (`help/registry.js` via
  `parseHash`), le **1er clic sélectionne** (aria-live, Échap désarme, clics modifiés natifs),
  le **2e clic ouvre** — la « table des matières interactive » en actes. Prototype TOC conservé
  dans l'état (`docs/prototypes/plan-du-site-toc.html`). **Revue adversariale multi-agents du
  diff avant commit : 17 findings confirmés, tous corrigés** — dont le survol qui reprend la
  main sur un lien armé, l'armement par item (alias #/espace), la purge du callout au
  changement de profil, `role=group` sur les familles du burger, contrastes AA (teal 700),
  consignes clavier, et `help/registry.js` + tableau de bord alignés sur les nouveaux libellés
  (fin de « Lancer un run »). Vérifié en navigateur (visiteur, aperçu Cartographe, survol,
  deux-clics, navigation réelle, armé+survol post-correctif). Tests web 535. Non déployé
  (front seulement, `npm run build` OK + deploy à la prochaine fenêtre).

- 2026-07-13 — **Twin9 (le vrai Golden Prompt) porté et intégré (ADR-010).** Système
  multi-agents Python (~4400 l., 29 gabarits, ~3000 appels/run) rendu opérationnel sur le
  site. (T1) specs de portage bit-à-bit ; (T2) **portage JS `engine/src/twin9/` avec parité
  OCTET-À-OCTET** contre 6 oracles mock Python (0 écart) ; (T3) serveur : gabarits secrets en
  base, `POST /api/twin9/appel` (rendu serveur, base_url verrouillée, filtre anti-fuite),
  crédits prépayés micro-USD + **PayPal en flux redirect**, **factures récapitulatives
  mensuelles** + suivi dépenses (particuliers ET établissements), **marge +10 %** (couvre
  PayPal/OVH/domaine/démo Haiku) ; (T4) front : run (consentement RGPD, **devis via run mock
  navigateur avant paiement**, progression + reprise IndexedDB, résultats), crédit+factures
  imprimables, éditeur admin des gabarits + table des comptes ; (T5) déployé (désactivé).
  **Revue de sécurité adversariale** → 2 failles corrigées (course de solde/découvert ;
  contournement du filtre anti-fuite). **Correctif majeur du raccord réel** (le portage rendait
  les prompts côté client ; sur le site les gabarits + fiches confidentielles doivent rester
  serveur) : le moteur envoie chemin+variables d'état, le serveur **injecte les fiches secrètes**
  (`FicheStore`, jamais dans `/meta`) — bug invisible aux 903 tests mock, attrapé par un **test
  de contrat hors-ligne** et **prouvé par un vrai appel Anthropic** (greffier réel, fiche injectée,
  réserve→réconciliation = coût réel). Suites : PHP 373, engine 903, web 520. **Reste avant mise
  en service (utilisateur)** : identifiants PayPal REST (fournis plus tard) ; import des gabarits
  en prod (`scripts/twin9/import-protocole.mjs`, X-Migrate-Token) qui active la fonctionnalité —
  décision délibérée de l'utilisateur. Source `Twin9/` + gabarits = confidentiels, gitignorés.

- 2026-07-13 — **Phase UX post-v1 (demande utilisateur, 6 points) : trois chantiers livrés.**
  **(B) Navigation adaptée au rôle + aide contextuelle.** `web/src/nav.js` = source unique
  rôle → sections, groupées par famille (« Découvrir » pour tous ; « Mon travail » selon les
  rôles de la session, rafraîchie sans rechargement via l'événement `humanome:auth`). Bouton
  « ? » dans l'en-tête : aide par rubrique et par rôle (`web/src/help/`). En-tête restylé
  (rubrique courante marquée, cibles 44px).
  **(A) Réglages démo éditables depuis l'admin (smartphone).** Couche d'overrides en base
  (`settings.demo_overrides`) prioritaire dans `DemoConfig::load()` (base > env > fichier >
  défaut, fail-safe DB) ; API session admin `GET/PUT/DELETE /api/admin/demo-config` (validation
  bornée 422, audit sans valeurs, clé API jamais exposée — env uniquement ; provider non
  éditable). UI Réglages : grand interrupteur activer/désactiver (un clic, effet immédiat sur
  POST /api/llm — vérifié en dev : OFF → challenge refusé → ON → reset), modèle (menu +
  champ libre), 7 champs bornés avec badge d'origine (base/env/fichier/défaut). Nav admin
  refondue (accueil en cartes, onglets pastilles, mobile-friendly).
  **(C) Timeline animée de la cartographie.** `web/src/lib/sunburst/as-of.js` reconstruit la
  carte cumulée à toute date (règles verbatim du moteur, seuils de quintile FIXES calculés sur
  le doc final → la dernière trame == merge.json publié, 0 écart, parité 331 intacte) ;
  `TimelinePlayer` (lecture/pause/vitesse/scrubber accessible, arrêt en fin de plage, pause
  auto à la sélection d'un secteur, prefers-reduced-motion) câblé dans MergeView à côté de la
  heatmap ; compteur cumulé « N compétences sur la carte » + score du jour. Vérifié en
  navigateur : la démo se construit de 11 → 54 compétences sur les 59 feuilles. Idées reprises
  des prototypes `temporal-progression`/`cartography-viewer` (lecteur, scrubber, pivot).
  Tests : PHP 320, web 480, engine 214. Déployé (static + api).

- 2026-07-12 — **Post-v1.0.0 : deux défauts détectés puis corrigés (au lieu de simplement journalisés).**
  (1) **Crash de la vue diff du promptologue** : `DiffView` attendait une forme française fictive
  (`ajoutes/retires/modifies`, `from/to` en chaînes) que le serveur n'émet jamais — `PackageDiff.php`
  renvoie des clés anglaises, `from/to` en objets `{version}`, lignes `{op,line,text}` ; rendre
  `{diff.from}` (objet) plantait React et vidait l'atelier. Vue réécrite pour consommer la forme
  RÉELLE ; le test unitaire nourrit désormais cette forme (il propait la fiction et masquait le bug),
  l'e2e clique le vrai bouton « Diff contre X » et vérifie le rendu. (2) **Portabilité RGPD des
  cartographies de masse** (art. 15/20) : un apprenant ne pouvait pas récupérer les documents produits
  pour lui par un établissement (accès réservé au rôle établissement). Ajout de
  `GET /api/mes-documents-masse` (rôle apprenant, accès survivant au départ de la cohorte) + intégration
  à l'export « un clic ». Déployé (v1.0.0-2). Tests : PHP 311, web 440, engine 214, e2e vert.

- 2026-07-12 — **P13 finalisé : v1.0.0 déployée et taguée.** Le chantier D du workflow M9
  (déploiement/clone/status) ayant échoué en cours de flux, complété à la main : `GET /api/status`
  (santé publique version/db/démo/worker, cacheable 30 s, sans secret, testé) ; commandes
  `deploy.mjs releases` et `rollback` (repointage de `current.txt`, exercées en prod) ;
  `scripts/backup/backup-db.mjs` + restauration **testée en round-trip sur Docker** (dump → base
  neuve → 29 tables) ; `INSTALL.md` (clone déployable), `README.md` (vitrine AGPL-3.0),
  `api/.env.example`, `docs/deploiement.md`, `docs/backup-restore.md`. Historique git scanné :
  aucun secret réel (seuls des placeholders EXEMPLE). Déploiement final : migration 010 en prod
  (10/10), `/api/status` sain, en-têtes API stricts (CSP `default-src 'none'`, X-Frame DENY),
  CSP front avec jetons sandbox, page /confidentialite rendue. **Contrainte OVH consignée**
  (vérifiée au panel) : offre gratuite → PAS de cron ; masse/maintenance par endpoints externes,
  rien ne casse sans cron. Suites finales : PHP 308/308, web 439/439, engine 214/214, e2e 5/5.

- 2026-07-12 — **M9 terminé (P12+P13) : admin, RGPD transverse, durcissement — v1.0.0 INTÉGRÉE.**
  Clôture qualité : les 4 chantiers M9 (A administration, B RGPD transverse, C durcissement,
  D déploiement) fusionnés sans friction. **Suites toutes vertes ENSEMBLE** : PHP **307/307**
  (2470 assertions), web **439/439** (54 fichiers), engine **214/214**, runner **25/25**,
  e2e **5/5**, `npm run build` OK. **Parcours clone déployable rejoué sur instance vierge**
  (`docker compose down -v` → `up -d`) : migration DEPUIS ZÉRO par l'endpoint de prod
  `POST /api/admin/migrate` → **10/10 migrations appliquées dans l'ordre, 0 collision**
  (010 se pose proprement sur 009) ; imports idempotents (référentiel 7.0.0 + prompt-package
  `aurora-v3-reconstruit@1.0.0`) ; `GET /api/health` → `status ok, db ok, version` ; parcours
  minimal register→me→logout→login→logout OK (compte id 1 rôle `apprenant`, logout gardé CSRF —
  403 sans jeton, 401 après logout). **Checklist sécurité re-vérifiée** (`docs/securite-checklist.md`),
  5 items à risque sondés et CONFIRMÉS : (1) **IDOR** — `CartographyRepository` scope
  `AND user_id = ?` sur toute lecture/écriture (404, pas la ressource) ; (2) **CSRF** —
  middleware global `$app->add(new CsrfMiddleware())` (auth.php), double-submit `hash_equals`,
  exemptions exactes (migrate/login/register/llm), les routes admin SESSION en héritent
  (403 empirique) ; (3) **CSP-sandbox** — le vrai bloqueur était le **hash du `<script>` inline
  du srcdoc** (pas `frame-src`) ; garde anti-dérive `csp-hash.test.js` (recalcul depuis
  `buildSrcdoc()`) + e2e `sandbox-isolation` jouant la **CSP de prod réelle** lue dans
  `.htaccess` (bénin→result ET hostile contenu) — les deux verts ; (4) **secrets historique** —
  `git log --all` propre, seul `.env.deploy.example` versionné, toute occurrence `sk-ant-*`
  est un EXEMPLE/fixture, `.env.deploy` gitignoré ; (5) **purge RGPD complète** — `purge()` =
  `DELETE FROM users` s'appuyant sur les cascades FK (pas de liste de tables en dur qui
  dériverait) ; **`golden_grants` (ajoutée en A après le code de suppression) couverte** —
  preuve empirique : grant présent → `DELETE` user → grant cascade-supprimé, paquet conservé.
  Cohérence multi-agents de `system.php` vérifiée : `/api/status` n'existe pas (santé =
  `/api/health`) ; `/admin/maintenance` inline == `scripts/maintenance.php Maintenance::run()`
  (mêmes 3 DELETE, testés) ; **aucune collision de route** admin session (`/admin/users`,
  `/admin/golden`, `/admin/settings/*`) vs outillage jeton (`/admin/grant-role`,
  `/admin/default-package`, `/admin/maintenance`). `SecurityHeaders` câblé en dernier
  (le plus externe → décore 401/403/404). Chantier A : API admin session
  (`RequireRole::any('admin')` + CSRF), Golden = `is_private=1` + `golden_grants` (invisible
  aux 5 chemins de lecture de `PromptPackageRepository`). Chantier B : `content/legal/`,
  `docs/rgpd-registre.md` (10 traitements), `scripts/rgpd-audit.php`. Chantier C : CSP front
  corrigée (`script-src` + hash srcdoc + `blob:` + `worker-src blob:`), `SecurityHeaders`,
  audits deps (composer 0 advisory, `npm audit --omit=dev` 0).

- 2026-07-12 — **M8 terminé (P11) : établissements B2B et cartographie de masse, EN PRODUCTION.**
  Déployé (migration 009 en prod, worker-tick opérationnel). Audit : 1 SSRF medium corrigé
  (réassertion du fournisseur après réservation du job). Cron OVH worker à configurer en M9
  (POST /api/admin/worker-tick ou php scripts/worker.php).
  API (chantier A) : cohortes + codes d'invitation, consentement explicite à deux étages
  (rejoindre `{"consentement": true}` 422 sinon, dépôt de portfolio = opt-in serveur),
  config LLM/budget (clé endpoint sodium, jeton worker sha256), runs de masse (versions
  figées), file `mass_jobs` (checkpoint PAR PÔLE, bail 5 min, GET_LOCK, écritures
  conditionnelles), tick borné < 50 s (`php scripts/worker.php` + POST /api/admin/worker-tick),
  coupe-circuit budget AVANT chaque appel, purge RGPD par FK. Front (chantier B) :
  #/etablissement (cohortes, config, lancement en 2 temps avec estimation, avancement
  poll 5 s, vue membre = MERGE CÔTÉ CLIENT par le moteur) ; #/espace/cohortes (consentement,
  dépôt, quitter). Runner Node (chantier C) : même file via /api/worker/*, zéro dépendance.
  **Intégration : DoD P11 rejouée HORS PHPUnit** (scripts/dev/dod-p11.sh, preuves) :
  20 apprenants × 3 journées → run de 60 jobs par ticks CLI mock (5 appels/tick),
  interruption à 24/60 (39 ticks/195 appels), reprise 58 ticks/285 appels → 60 done,
  **480 appels exactement (0 double-appel)**, coût cohérent (spent_usd = Σ jobs = tableau
  = 12.808770 $), 120/120 documents valides (ajv moteur) ; plafond abaissé en cours de
  2e run → budget_exceeded propre, réactivation par hausse ; runner Node --once (mock
  injecté) draine 60 jobs via l'API. **Frictions d'intégration corrigées** : contrat
  /api/worker/jobs (référentiel COMPLET partagé au niveau réponse + referentielVersion
  + provider, le runner tel que livré ne pouvait PAS fonctionner contre l'API) ;
  page cohorte établissement (crash React : avancement objet rendu tel quel ; membres
  sans détail de dépôt → run inlançable ; statuts pending/error ≠ queued/failed ;
  run 'running' ≠ 'active') ; GET /api/cohortes manquant (liste apprenant) ; enveloppe
  {membre, documents} ; tarifs famille claude-* moteur alignés sur Pricing.php ;
  WORKER_TICK_MAX_CALLS (tick CLI bornable). Vérifié en navigateur : avancement en
  direct pendant une boucle de ticks (28/60 → 60/60 done), merge client (10/61
  compétences, vues jour), parcours apprenant 21e (inscription → consentement coché →
  dépôt « Journal de Maya »). Suites : PHP 274/274 (2213 assertions), web 422/422,
  engine 214/214, runner 25/25, e2e 4/4, build OK.

- 2026-07-12 — **M7 terminé (P9+P10) : espaces cartographe et promptologue EN PRODUCTION.**
  P9 : invitations à usage unique, file de relecture, annotations par compétence, révisions
  validées au schéma avec historique, GARANTIE humaine (révision figée servie par le lien de
  partage public, retirée automatiquement à toute nouvelle révision — §8), comparaison côte à
  côte, rapport de consistance multi-run lisible, purge RGPD asymétrique (révisions anonymisées).
  P10 : éditeur brouillon→publication immuable (semver strict, diff structurel ligne à ligne),
  proposition/validation de version par défaut, régénération rétrospective, banc d'essai
  (multi-run, A/B avec rapport téléchargeable), SANDBOX iframe origine opaque + worker blob +
  pont postMessage (quota 16 appels, timeout) avec **isolation réseau DÉMONTRÉE en vrai Chromium**
  (spec e2e dédiée), docs/securite-prompts.md, outillage admin grant-role (audité).
  E2E 4/4, PHP 234/234, web 395/395. Rôles en prod : à attribuer via POST /api/admin/grant-role
  (X-Migrate-Token) en attendant l'UI admin P12.

- 2026-07-12 — **M6 terminé (P8) : espace apprenant complet, EN PRODUCTION.** API : cartographies
  (stockage opt-in daté, liste sans document), liens de partage (token 128 bits haché, Argon2id,
  404 homogène anti-énumération, révocation, rate-limit), formation trackée, clés API personnelles
  chiffrées sodium (AD-4), prompt-packages publiés + paquet par défaut aurora-v3-reconstruit@1.0.0
  généré depuis les gabarits RÉELS du moteur (import idempotent par hash, endpoint admin).
  Front : dashboard (#/espace, fonctionne aussi anonyme/local), formation Markdown embarquée
  (parseur maison + DOMPurify, progression locale→serveur), assistant de run 5 étapes (paquet,
  fournisseur clé perso/service humanome, estimation, exécution avec checkpoints IndexedDB et
  REPRISE réelle), panneau cartographies (confidentialité, opt-in serveur RGPD explicite,
  partage+révocation, visionneuse), ShareView lecture seule, export/import archive validée au
  schéma. **E2E Playwright DoD vert** (compte→portfolio→run mock 24 appels→partage en contexte
  privé→export validé→suppression→404). Audit : 1 faible corrigée (no-store sur révélation de
  clé). PHP 182/182, web 299/299. Smoke prod : parcours complet vérifié en ligne.
  Backlog : titre « Mes cartographies » dupliqué (cosmétique) ; récits narratifs du merge en P10.

- 2026-07-12 — **M5 terminé (P6+P7) : démo LLM publique VALIDÉE EN PRODUCTION** (run complet
  réel : collage → PoW → 7 pôles Sonnet → visualisation Journée interactive sur humanome.xyz/#/essayer).
  P6 : proxy /api/llm (provider/model/plafonds imposés serveur, clé jamais exposée), garde-fous
  tous VÉRIFIÉS EN LIGNE (honeypot, PoW HMAC one-time — rejeu 429, quota IP/h — 429 vécu,
  coupe-circuit budget quotidien — 503 vécu, plafond d'entrée), gdoc-text anti-SSRF, page
  Essayer (progression par pôle, annulation, zéro persistance). P7 : portfolio client-first
  (coller/.txt/.md/Google Docs, segmentation en journées testée ×30, IndexedDB, ADR-010
  repli éditeur — Sqilium est une app Rails non intégrable). Audit abuseur : faille ÉLEVÉE
  corrigée (rotation IPv6 /64 → buckets par préfixe, aussi appliqué à l'auth).
  **Fiabilisation LLM apprise en prod** (~20 runs de debug, chaque échec = un correctif) :
  thinking par défaut du modèle mange le budget (→ thinking disabled) ; JSON indenté double
  le coût (→ compact monoligne exigé) ; malformations stochastiques (→ tool_use forcé =
  JSON garanti par l'API + retry unique par appel) ; glissements sémantiques (→ normalisation
  déterministe des invariants du corpus + dégradation ciblée pilotée par les chemins d'erreur
  ajv + validation par pôle) ; kairos volumineux (→ bornes de longueur + kairosOptional :
  dégradation gracieuse à null avec note UI) ; timeouts (→ curl 150 s, le LB OVH suit ;
  8192 tokens de budget). Config prod (env ~/app/shared/.env) : Sonnet 5, 8192 tokens,
  40 req/h/IP, PoW 16 bits, budget **8 $/jour**.
  **DÉCISION DE COÛT à trancher par l'utilisateur** (écart au cahier §3.1/§5 qui visait Haiku
  bon marché) : un run démo = 8 appels Sonnet ≈ 1 $+, donc le plafond 8 $/jour coupe après
  ~6-8 visiteurs/jour. Testé le 2026-07-12 : **Haiku + tool_use forcé ne suffit PAS** (JSON
  valide mais structure incomplète — `competences` absent ; Haiku ne suit pas la structure
  adverse profonde). Options : (a) garder Sonnet + plafond bas (actuel) ; (b) monter le budget ;
  (c) **piste non testée prometteuse** : mettre le SCHÉMA COMPLET du pôle dans `input_schema`
  du tool (décodage contraint) pour forcer la structure → pourrait rendre Haiku (bien moins cher)
  viable. Backlog M5 : (c) ci-dessus ; panneau pôle sans rapport (dégradé) affiche l'état vide
  — afficher audit + passages à la place.

- 2026-07-12 — **M4 terminé (P5) : moteur complet, gate de parité franchie** (rapport :
  docs/rapport-parite-moteur.md). Étage A (merge numérique) : PARITÉ 100 % — 132 618 valeurs
  comparées à l'oracle, formules retrouvées jusqu'à l'arrondi demi-pair Python (pythonRound).
  Étage B1 : 69/69 prompts narratifs identiques au byte près. Étage B2 : 100 % — quintiles
  exclusifs Python retrouvés, **archétype déterministe retrouvé (arbre à médiane par pôle,
  54/54)**, feedback HTML octet à octet. Étage C (extraction) recréé sans oracle (typologie
  d'attaques a..h retrouvée dans le corpus) = v1 du prompt-package par défaut (P10).
  Providers ×6 (2 transports, retry, estimate/coûts), runs/checkpoints/reprise (IndexedDB
  injectable), consistance multi-run, bout-en-bout mock 3 jours avec interruption/reprise.
  Revue adversariale : 3 bugs réels corrigés (dont corruption silencieuse du parseur JSON).
  Tests engine 182/182 ; squelettes de formation ×3 parcours livrés (§4.6).

- 2026-07-12 — **M3 terminé (P3+P4) : API en production.** 5 migrations MySQL (users/roles/
  sessions PDO/rate_limits/referentiel_versions/prompt_*/cartographies opt-in datée/share_links/
  training_progress/user_api_keys/audit_events, purge RGPD par FK), auth complète (ARGON2ID,
  anti-énumération, CSRF double-submit, rate-limit progressif, RequireRole), module référentiel
  versionné (import v7 idempotent hash-vérifié, brouillon→publication immuable, diff, export
  statique), front #/referentiel (arbre+recherche+permaliens+Decidim) et #/compte (RGPD),
  audit sécurité adversarial passé (1 défaut latent corrigé + 9 tests). Déploiement par releases
  ADR-008 opérationnel : 3 off-by-one de layout corrigés (migrations/schemas/VERSION),
  route POST /api/admin/import-referentiel ajoutée (pas de SSH). Prod vérifiée : migrations
  idempotentes, referentiel v7.0.0 servi par l'API, parcours register→me→purge RGPD→401,
  health db:ok versionné. Tests : PHP 89/89, web 147/147, corpus 68/68.

- 2026-07-12 — **M2 terminé (P2) : humanome.xyz EN LIGNE.** Visualisation unifiée déployée
  (https://humanome.xyz) : vue Merge (sunburst porté à parité stricte 331/331 paths contre le
  rendu original — divergence d'1 ulp de Math.cos/sin V8 résolue par arrondi correct BigInt),
  vue Journée reconstruite depuis extracted/ (verdicts, blocs adversariaux, traces, exclus,
  ?focus=), heatmap chrono cliquable, réécriture des 1262 liens du corpus vers les routes hash,
  DOMPurify durci (aucune requête externe possible depuis le HTML narratif), drag & drop JSON
  validé ajv, responsive 360px (onglets une-main ; fix minmax(0,1fr)), CSS print, a11y clavier.
  Bundle IIFE file://-compatible. Déployé par manifeste SHA-256 (65 fichiers), HTTPS forcé,
  CSP/HSTS actifs, smoke en ligne OK (deep-link jour + data lazy + console propre).
  Tests : 112/112. Limitation vérifiée : le FTP OVH clusterNNN ne supporte pas AUTH TLS →
  transfert en FTP simple (documenté).

- 2026-07-12 — **M1 terminé (P0+P1)**. P0 : CLAUDE.md, ADR-001..009 (relus adversarialement),
  inventaire-assets, docker php8.2+mysql8, /api/health, web Vite+React, engine ESM, AGPL-3.0.
  P1 : 5 schémas draft 2020-12 dérivés du corpus réel (enums recensées sur 3590 compétences×59 jours),
  convertisseurs (carto-data→merge, extracted→jour, extract-referentiel), validation double runtime
  (ajv engine/src/validation.js + opis api/src/Validation.php), fixtures fictives « Maya » 3 journées,
  docs/contrats.md. Vérifié : validate-corpus 68/68 OK, engine 6/6, web 2/2, PHP 6/6.
  Bonus : deploy FTPS prêt (ADR-008), oracle de parité sunburst capturé (331 paths du rendu original),
  MySQL prod vérifiée (8.0.46 joignable depuis le cluster).

- 2026-07-12 — Repo initialisé (commit 1 = .gitignore seul), assets copiés en lecture seule
  (`assets-existants/merge-prototype/`, `assets-existants/prototypes-react/`), cahier des
  charges et plan-prompts dans `docs/`.
- 2026-07-12 — Décisions actées avec l'utilisateur : licence AGPL-3.0 ; clé API Anthropic
  fournie (hors repo) ; MySQL OVH à créer via panel (plugin Chrome) ; données réelles de
  démo publiées telles quelles (consentement explicite du 2026-07-11).
- 2026-07-12 — Vérifié serveur OVH : PHP 8.2 (.ovhconfig), www/ vide, FTP OK, pas de SSH.
- 2026-07-12 — MySQL : base OVH existante fournie par l'utilisateur (`example123.mysql.db`,
  hébergée sur un autre hébergement OVH — credentials hors repo, `cahier des charges/mysql.txt`).
  Plus de création via panel nécessaire. **Vérifié le jour même par sonde PDO éphémère
  depuis le cluster humanome.xyz : joignable, MySQL 8.0.46, utf8mb4, PHP webroot 8.2.29.**

## Actions manuelles restantes (chef d'orchestre — clôture v1.0.0)

1. **Déploiement final** : `cd web && npm run build` (fait, à refaire si diff), puis
   `node scripts/deploy/deploy.mjs static` (www/) ; `scripts/deploy/stage-api.sh` puis
   `node scripts/deploy/deploy.mjs api` (releases + `current.txt` + `POST /api/admin/migrate`
   + imports + smoke `/api/health`). Credentials dans `.env.deploy` (gitignoré).
2. **Tag `v1.0.0`** : `git tag -a v1.0.0 -m "humanome.xyz v1.0.0"` (+ `git push --tags` après
   publication GitHub). La version affichée par `/api/health` est estampillée au déploiement
   depuis `git describe` (via `stage-api.sh` → fichier `VERSION`) : **tagger AVANT de stager l'API**.
3. **Cron OVH** (ADR-005/008, aucun script shell déployé — endpoints à jeton) :
   - worker de masse — `POST /api/admin/worker-tick` (X-Migrate-Token), ticks courts, ~toutes
     les 1–5 min tant qu'il y a des jobs (voir `docs/plan-masse.md`) ;
   - maintenance RGPD — `POST /api/admin/maintenance` (X-Migrate-Token), **quotidien**
     (purge liens de partage > 30 j, reset compteurs démo, PoW expirés).
4. **Rôles admin/privilégiés à créer** : aucun compte n'est admin par défaut (le 1er inscrit
   est `apprenant`, `admin` n'est pas un super-rôle implicite). Attribuer via
   `POST /api/admin/grant-role {email, role}` (X-Migrate-Token) — au moins un `admin`, puis
   les `cartographe`/`promptologue`/`epistemiarque` selon les personnes. L'UI admin
   (#/admin) prend le relais une fois un premier admin créé.
5. **Publication GitHub** (reportée depuis M1) : créer le dépôt, `git push` (+ tags).
   Sauvegarde intermédiaire : `git bundle create ../humanome-backup.bundle --all`.
6. **Smokes post-déploiement** (`docs/securite-checklist.md` §« après déploiement ») :
   `curl -sI https://humanome.xyz/api/health` → en-têtes API (CSP `default-src 'none'`,
   `X-Frame-Options: DENY`, HSTS, `Referrer-Policy`, `Permissions-Policy`) ; ouvrir
   #/promptologue et lancer le banc d'essai sur un paquet publié → **zéro violation CSP**
   en console (preuve que la correction sandbox tient en prod réelle) ; ramener le budget
   démo quotidien à 5–10 $ selon usage (compteurs de test consommés en M5).

## Backlog post-v1 (hors périmètre v1.0.0)

- **Marketplace employeur payante** (mise en relation apprenants↔employeurs monétisée).
- **Portfolio multimédia** (au-delà du texte : images, audio, vidéo).
- **Open-data recherche** (jeux de données anonymisés pour la recherche).
- **Promptagogue** (rôle/atelier pédagogique autour des prompts).
- **Régénération de masse** (rejeu rétrospectif d'une nouvelle version de prompt-package
  sur une cohorte entière).
- **GPU local** (inférence LLM auto-hébergée, hors API tierce).
- **OAuth Google Docs** (import portfolio authentifié, au-delà du `gdoc-text` public actuel).
- **i18n** (internationalisation de l'UI, aujourd'hui français uniquement).

## Dettes techniques / décisions en attente

- **Twin9, P0-1 (2026-10-22, PR A)** : « Configuration », sur la page d'un run, lit ses deux blocs
  dans `GET /api/twin9/runs/{id}/resultats`, qui porte aussi toutes ses sorties (à l'ouverture
  seulement) ; une route légère les servirait seuls. Antérieurs, signalés : `attestation.admission`
  (réserve et engagement) lue par un cartographe lié ; la marge dans `twin9_evaluations.reglages`,
  servie au propriétaire par `mes-analyses`.
- **À mesurer en recette, appels en flux** (décidés le 2026-10-21, entrée « Prix d'Anthropic
  relevés chaque jour… ») : qu'OVH relaie la réponse à mesure (Apache, PHP-FPM, compression ;
  sinon tout arrive à la fin, sans progression, ce qui marche aussi), et le délai réel qu'il
  laisse à un script (165 s documentées ; un forum rapporte un 504 vers 3 min) — un délai réglé
  au-delà fait arrêter le script avant l'issue, et l'appel garde sa réserve entière (l'apprenant
  paie le pire cas, la démo le compte). Le compte d'un appel coupé suppose qu'Anthropic cesse de
  générer quand le flux est fermé, ce que sa documentation ne dit pas (OpenRouter, claudelab.net
  et TrueFoundry le décrivent, UC-VIS-03 Limites) ; le serveur ne voit un navigateur parti qu'à
  une écriture qui échoue, puis à la suivante (une vingtaine de secondes au plus, et seulement à la
  fin si l'hébergement retient le flux). Le temps que borne OVH est sans doute celui de
  `max_execution_time`, qui, hors Windows, ne compte pas l'attente du réseau (documentation de
  PHP) : avec le flux, un appel pourrait tenir bien plus que 165 s — ligne 5.3c de
  `docs/recette-twin9.md`, avant de relever le délai (utile pour Sonnet, dont un scan Twin6
  peut approcher les 150 s).
- **Idée, non codée (à Christian)** : facturer un appel coupé au plus près. Un token par octet reçu
  est sûr pour le site (le JSON de l'outil de la démo venant à mesure, `eager_input_streaming`),
  mais compte jusqu'à trois ou quatre fois la sortie d'un texte français ;
  `count_tokens` (gratuit, déjà employé par la démo) sur ce qui est arrivé la ramènerait à la
  sortie réelle, plus la marge, au prix d'un appel de plus à la coupure.
- Opus 5.5, Fable et Mythos refusent `thinking: disabled` (400) ; la voie crédits l'envoie à tout
  modèle sauf Sonnet 5.5 (`between_tools`) : les ajouter à l'offre ferait échouer leurs appels.
  La grille par défaut ne les offre pas, et le relevé n'ajoute aucun modèle.
- La masse (flux établissement) appelle sur la clé de la plateforme le modèle que l'établissement
  choisit, Sonnet 4.5 par défaut, payé après coup sous un plafond qu'il fixe : pas des crédits
  achetés d'avance, au sens de la règle du 2026-10-21 (« Sonnet et Opus disponibles uniquement
  pour les comptes ayant acheté suffisamment de crédits »). Antérieur, à trancher.
- Plafonds de sortie gardés, à décider : le tuteur (600 tokens, la longueur d'une réponse, et son
  propre budget de 1 $ — la dépense gratuite du site peut donc atteindre 2 $ par jour) ; la masse
  (`WORKER_MAX_TOKENS`, 8 192, au budget de l'établissement), qui tourne par défaut sur Sonnet 4.5
  (`WORKER_MODEL`), retiré par Anthropic le 2026-11-30 ; les fournisseurs autres qu'Anthropic de
  la clé personnelle (8 192) ; les étapes de Twin9, réglées par son profil.
- Le relevé des prix lit une page de documentation : une mise en forme nouvelle le fait échouer
  (affiché, la grille garde ses prix) jusqu'à ce que `TarifsAnthropic::lire` suive. La table
  indicative du moteur (`engine/src/providers/estimate.js`) ne suit pas le relevé.

- Vestiges de T11 (retirés du code le 2026-10-20) : la base garde le réglage `twin9_fiches` et,
  dans `twin9_config`, `enabled`, `pipeline`, `appels_par_minute` (et des étages sous les modèles)
  jusqu'au prochain enregistrement de la supervision. Les effacer est une contraction (ADR-008) :
  une migration, une fois stabilisée en production la release qui ne les lit plus.
- Twin9, voie directe (T7) : un appel coupé par la fin d'une tranche repart à la suivante, et
  Anthropic facture sans doute ce qu'il avait déjà produit. Idée, non codée : ne lancer un appel
  que s'il tient dans le reste de la tranche, d'après la durée des appels de la même étape au
  journal. La voie par lots (T8) n'a pas ce coût.
- Twin9 (T7) : le tick donne d'abord sa tranche aux runs Twin9, la masse prend le temps qui reste.
  Des runs en voie directe peuvent l'occuper toute ; à revoir si la masse sert en même temps (T18).
- Twin9 (T13) : le nombre de runs par tick et la durée d'une tranche (T7) se règlent par
  `/api/twin9/admin/config` seulement ; `#/admin/twin9` ne les montre pas encore.
- Twin9 (T9) : les compteurs des runs pour l'administrateur ne sont servis que par
  `/api/twin9/admin/runs` ; `#/admin/twin9` (UC-ADM-05) ne les montre pas encore. On n'efface un run
  qu'en supprimant son compte ; UC-APP-10 décrit encore le moteur du navigateur (lot 3).
- Twin9 (T8, T10) : un lot soumis avec une clé qui change ensuite d'espace de travail n'est plus
  joignable. À la suppression d'un compte, un lot de sa clé encore en cours d'annulation, ou dont la
  soumission n'a pas eu de réponse, reste chez Anthropic jusqu'à ce qu'Anthropic l'efface (29 jours
  au plus) : la clé part avec le compte.
- Twin9 (T14) : une copie de gabarits ne se renomme ni ne se supprime ; un gabarit qu'un import
  ultérieur ajoute au jeu v9.8 n'entre pas dans les copies déjà faites (leurs runs sont refusés au
  lancement). L'atelier ne vérifie pas la forme d'une fiche du référentiel d'une copie : une fiche
  que le moteur ne lit plus fait refuser ses runs au lancement. Le contrat ne nomme que les
  variables qu'emploient les gabarits v9.8 : une variable que le moteur fournit à une étape sans que
  la v9.8 s'en serve est refusée. « Qui voit les gabarits ? » reste ouverte (D2 s'applique).
- Twin9 (T10) : les appels minimaux qui vérifient les réglages avant le premier lot ne sont pas
  débités (quelques jetons) ; un appel coupé par la fin d'une tranche n'est pas débité non plus,
  ce qu'Anthropic en facture reste à la charge de l'instance. `#/admin/twin9` garde le palier des
  longs prompts d'un modèle sans le montrer ni l'éditer (`PUT /api/twin9/admin/config` le règle).
  L'estimation compte au moins une journée, la fusion se refaisant à chaque run.

- `scripts/dev/dod-p11.sh` (répétition de la DoD P11) s'arrête à la première inscription
  (`422`, `emailConfirm` manquant) : il n'envoie pas la double saisie de l'email ni n'active le
  compte, exigés depuis D5. Constaté le 2026-10-18 en le passant sans Docker ; ses appels SQL,
  ses ticks CLI et sa lecture des documents marchent en local.
- Golden Prompt : non fourni, hors git par design (`assets-existants/golden-prompt/` gitignoré).
- Pipeline Python amont absent : moteur rétro-conçu en M4 avec oracles
  (`intermediate/carto_merge.json`, `intermediate/prompts/`).
- Bundle front monolithique (~1,58 Mo / 331 Ko gzip) : avertissement de taille Vite
  informatif, non bloquant — code-splitting à envisager (backlog outillage).
- `npm audit` complet : 5 findings **outillage de dev uniquement** (vite/vitest/esbuild),
  non déployés, non exploitables en prod (cf. checklist A06) — bump majeur reporté au backlog.
- CSP de production `connect-src 'self'` : corrigé (décision du 2026-10-14, question 22 :
  `connect-src` ouvert aux seuls fournisseurs) — en ligne depuis le déploiement du 2026-10-14.
- CSP de production et script anti-FOUC (`web/index.html`) : le script en ligne qui réapplique
  le thème choisi par le visiteur était **refusé par la CSP depuis qu'elle existe** — le choix
  clair/sombre n'était pas réappliqué au chargement. **Corrigé et déployé le 2026-10-14**
  (journal carto, question 30, D-47) : son hash est dans `script-src`, gardé par
  `web/src/anti-fouc.test.js`.
- `npm run test:dist` (`web/scripts/smoke-dist.mjs`) visait encore la vue merge retirée en D-38
  (`#/merge`, `svg.sunburst`) et échouait depuis : **réécrit le 2026-10-22** (branche
  `fix/smoke-dist`, non fusionnée ; deux entrées du jour) pour ce que le bundle promet en
  `file://` (INSTALL.md §4), puis corrigé après relecture le même jour. Reste à trancher : la
  « démo hors ligne » d'ADR-009 n'existe plus dans le bundle depuis D-38 (la démonstration de
  l'interface se lit sur le site, D-67) ; hors ligne, seule la copie autonome d'un jeu, exportée
  depuis le site ou un serveur local, s'ouvre avec ses données.
- `deploy.mjs api` téléverse la release fichier par fichier sur une seule connexion (~4 min
  pour 723 fichiers) : trop long pour un shell distant limité à 180 s. Le déploiement du
  2026-10-14 a suivi les mêmes étapes avec un téléversement reprenable et parallèle (outil
  ponctuel, hors dépôt) ; à intégrer à `deploy.mjs` si ce mode de déploiement se répète. Il
  s'est répété le 2026-10-21 (six connexions : 803 fichiers en 85 s, après plus de deux minutes
  pour créer les 126 dossiers un par un) : à décider.
- `stage-api.sh` n'embarque ni `scripts/worker.php` ni `scripts/maintenance.php` : sur une offre
  OVH avec cron, où `deploiement.md` conseille de les planifier, il faudrait d'abord les ajouter à
  la release (relevé le 2026-10-22 ; les relais `scripts/deploy/cron-ovh/` s'en passent).
- Partage historique (`#/espace`, jour / merge / twin9) **retiré sur la branche
  `feat/ultimate-cartography`** (décision du 2026-10-14, journal carto D-43 : plus de nouveau
  lien, `422 share_retired`). Les liens déjà créés restent servis jusqu'à leur échéance — y
  compris ceux de comptes sans attestation de majorité : pas de révocation (décision du
  2026-10-14, journal carto question 25 : le site n'est pas encore ouvert au public). « Liens déjà créés » et les tests `legacyShareLink` pourront
  partir après le 2027-11-13 (dernière échéance + 30 jours de purge).

## Jalons

| Jalon | Contenu | État |
|---|---|---|
| M1 | P0 fondations + P1 schémas/convertisseurs | ✅ terminé |
| M2 | P2 visualisation unifiée + 1er déploiement | ✅ en production |
| M3 | P3 BDD/comptes + P4 référentiel | ✅ en production |
| M4 | P5 moteur (parité oracle) | ✅ terminé |
| M5 | P6 démo LLM + P7 portfolio | ✅ en production |
| M6 | P8 espace apprenant | ✅ en production |
| M7 | P9 cartographe + P10 promptologue | ✅ en production |
| M8 | P11 masse B2B | ✅ en production |
| M9 | P12 durcissement + P13 prod v1.0.0 | ✅ intégré — déploiement + tag v1.0.0 par le chef d'orchestre |
