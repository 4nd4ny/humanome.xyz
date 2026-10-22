# Registre des traitements — humanome.xyz (RGPD art. 30)

**Responsable du traitement :** Harmonia Éducation (écosystème RESPIRE).
**Version :** M9 / P12.2 — 2026-07-12 ; fournisseurs des runs Twin9 (ADR-012) — 2026-10-22.
**Principe transverse (cahier §6) :** aucune donnée de portfolio ni de
cartographie côté serveur par défaut ; tout stockage serveur est un opt-in
explicite et réversible de la personne concernée. Journalisation minimale :
compteurs et identifiants hachés, jamais de contenu ni de secret.

Ce registre décrit un traitement par section. Le croisement table-par-table
avec le schéma de base (migrations 001-009), le sort à la suppression de compte
et la couverture d'export figure dans `docs/rgpd-verification.md`. L'outil
`scripts/rgpd-audit.php` vérifie ces garanties sur un compte réel.

Base légale (rappel des renvois RGPD art. 6.1) : **a** = consentement, **b** =
exécution du service/contrat, **f** = intérêt légitime.

---

## 1. Comptes et rôles

| Élément | Détail |
|---|---|
| Finalité | Authentifier la personne, rattacher ses données à son profil, porter les rôles de l'écosystème (§2). |
| Personnes concernées | Apprenants, cartographes, promptologues, épistémiarques, employeurs, établissements, administrateurs. |
| Données | Email, nom affiché (éditable), **photo de profil / avatar (optionnelle, D6)**, empreinte de mot de passe (Argon2id — jamais le mot de passe en clair), rôles, date de création. |
| Base légale | **b** (exécution du service dès la création de compte) ; **a** (consentement) pour la photo de profil, facultative. |
| Durée | Jusqu'à suppression du compte par la personne (effacement réel). La photo peut être retirée indépendamment à tout moment depuis le profil. |
| Destinataires | Interne uniquement (aucun tiers). La photo, servie par `GET /api/users/{id}/avatar`, est visible par qui dispose du lien (cache privé). |
| Tables | `users` (dont `avatar` MEDIUMBLOB + `avatar_mime`, migration 019), `roles`, `user_roles`, `sessions`. |
| Sort à la suppression | `users` supprimé (avatar inclus, colonnes de la ligne) ; `user_roles`, `sessions` en CASCADE. Retrait indépendant de la photo : `DELETE /api/auth/me/avatar`. |

### 1 bis. Vérification d'email à l'inscription (D5)

| Élément | Détail |
|---|---|
| Finalité | Confirmer que l'adresse email appartient bien à la personne qui s'inscrit (un compte n'est activé qu'après confirmation d'un code à 4 chiffres envoyé par email). |
| Personnes concernées | Toute personne créant un compte. |
| Données | Email (destinataire du message), empreinte du code de confirmation (hash — jamais le code en clair en base), date d'expiration, compteur d'essais, date de vérification. |
| Base légale | **b** (mesure précontractuelle : sécuriser la création du compte demandé). |
| Durée | Code : 30 minutes (expiration), effacé dès l'activation. `email_verified_at` : durée de vie du compte. |
| Destinataires | Transport email : `mail()` de l'hébergeur OVH (l'email transite par l'infrastructure OVH, sous-traitant d'hébergement déjà au registre). Aucun service d'emailing tiers. |
| Tables | Colonnes `users.email_verified_at`, `users.verification_code_hash`, `users.verification_expires_at`, `users.verification_attempts` (migration 018). |
| Sort à la suppression | Colonnes de la ligne `users` : purge en même temps que le compte (aucune table séparée). |

## 2. Portfolios (journal réflexif)

| Élément | Détail |
|---|---|
| Finalité | Servir de source à la production d'une cartographie de compétences. |
| Personnes concernées | Apprenants. |
| Données | Texte libre du journal réflexif, segmenté par journée. |
| Localisation | **Local par défaut** (IndexedDB navigateur) ; transite par le serveur uniquement le temps d'un traitement déclenché, ou lorsqu'il est déposé dans une cohorte d'établissement (§9) ; reste sur le serveur avec un run Twin9, sur accord de l'apprenant (§13). |
| Base légale | **a** (consentement) pour tout dépôt/traitement serveur ; le traitement purement local ne relève pas d'un stockage serveur. |
| Durée | Local : tant que la personne ne vide pas son navigateur. Dépôt cohorte : jusqu'au retrait du consentement (quitter la cohorte) ou suppression du compte. Run Twin9 : §13. |
| Destinataires | Fournisseur de LLM le temps du traitement (§8) ; établissement si dépôt en cohorte (§9). |
| Tables | Stockage serveur dans deux cas seulement : `cohorte_portfolios` (dépôt B2B, §9) et `twin9_runs` (run Twin9, §13). |
| Sort à la suppression | `cohorte_portfolios` en CASCADE (compte apprenant et cohorte) ; `twin9_runs` en CASCADE (compte). |

## 3. Cartographies

| Élément | Détail |
|---|---|
| Finalité | Résultat JSON de l'analyse d'un portfolio ; visualisation, relecture, partage. |
| Personnes concernées | Apprenants. |
| Données | Document JSON de cartographie (jour/merge), métadonnées de run (fournisseur, modèle, coûts estimés — compteurs, jamais de texte de portfolio), versions de prompt et de référentiel utilisées. |
| Localisation | **Local par défaut** ; enregistrement serveur uniquement sur **opt-in daté** (`opt_in_at`), cartographie par cartographie. |
| Base légale | **a** (consentement, opt-in explicite). |
| Durée | Jusqu'à retrait de l'opt-in, suppression de la cartographie, ou suppression du compte. |
| Destinataires | Cartographe lié (si visibilité `cartographe`), employeur (via lien de partage, §5), établissement (cadre cohorte, §9). |
| Tables | `cartographies` (+ `cartography_annotations`, `cartography_revisions`, `cartography_garanties` pour la relecture cartographe). |
| Sort à la suppression | `cartographies` en CASCADE ; annotations CASCADE ; révisions anonymisées (`author_id` SET NULL) car ce sont des données de l'apprenant ; garanties CASCADE. |

### 3 bis. Versions partagées de l'interface ultime (adultes, spécification §12)

| Élément | Détail |
|---|---|
| Finalité | Permettre à un apprenant **majeur** de montrer, par un lien, une version de sa cartographie qu'il a lui-même composée (employeur, recruteur…). |
| Personnes concernées | Apprenants adultes (auto-attestation) ; destinataires des liens (aucune donnée collectée sur eux). |
| Données | Instantané figé `carto-partage` : compétences retenues et leurs chiffres recalculés, dates à la précision choisie (jour, mois ou masquées), extraits choisis et relus (masques de courriels, liens, téléphones, adresses ; remplacements de noms), titre. **Jamais** le portfolio, les délibérations du jury, les notes. Liste blanche de champs vérifiée par le serveur (`Share\SharedVersion`). |
| Localisation | Local par défaut ; serveur uniquement sur demande explicite (case à cocher + publication), version par version. |
| Base légale | **a** (consentement explicite, après aperçu verrouillé et relecture des contenus tiers). |
| Durée | Jusqu'au retrait de la version (effacement immédiat), à la publication d'une nouvelle version à sa place (l'ancien document est effacé, le lien reste), au retrait de l'attestation (versions et liens **effacés** aussitôt) ou à la suppression du compte. Liens : 90 jours par défaut (1-365), révocables, purgés au plus tard 30 jours après expiration ou révocation. |
| Destinataires | Toute personne munie du lien (et du mot de passe s'il y en a un). Pages et réponses non indexées (`noindex`, `no-store`), aucune statistique tierce. |
| Journal | Dates des consultations réussies, visibles par l'auteur (`share_consulted` : ids seulement, ni IP ni navigateur). |
| Tables | `cartographies` (`type = 'partage'`, `visibility = 'privee'` imposée), `share_links` (`password_hash` NULL = lien sans mot de passe), `audit_events`. |
| Sort à la suppression | Comme les cartographies : CASCADE (versions et liens). |

### 3 bis A. Version garantie par un cartographe (journal de la cartographie, D-42)

| Élément | Détail |
|---|---|
| Finalité | Qu'une version partagée puisse porter la **garantie** d'un cartographe : à la demande de l'apprenant, le cartographe qui a relu sa cartographie avec lui la publie dans son compte et atteste avoir vérifié ce que la personne a fait, ce que l'analyse par IA a détecté et ce qu'en a vu le groupe classe. |
| Personnes concernées | Apprenants adultes (demandeurs) ; cartographes (garants) ; destinataires des liens (aucune donnée collectée sur eux). |
| Données | Demande : un code à usage unique (10 caractères), la version éventuellement visée, des dates — aucun contenu. Garantie : nom affiché du cartographe **figé** à la publication, date (`cartography_garanties`). La version elle-même relève du §3 bis. |
| Localisation | Serveur. La composition se fait dans le navigateur du cartographe, depuis le jeu de données qu'il a relu avec la personne ; rien d'autre n'est envoyé. Ce jeu est une **copie locale** de la cartographie de la personne dans le navigateur du cartographe (IndexedDB) — fichiers qu'elle lui a remis, ou cartographie ouverte depuis la page de relecture (« Ouvrir dans l'interface de cartographie », D-43) : elle survit au passage en « privée », au retrait de la copie serveur ou à la suppression du compte de la personne, et entre dans l'archive de compte du cartographe s'il l'exporte. Après la publication, l'interface lui propose de l'effacer ; la formation cartographe (chapitre 7) l'y invite. |
| Base légale | **a** pour l'apprenant (demande explicite, attestation de majorité de la demande) ; **a** pour le cartographe (sa garantie, case explicite à chaque publication : son nom figurera sur la version). |
| Durée | Demande : jusqu'à sa publication (consommée), son annulation, son expiration (30 jours), la disparition de la version visée, le retrait de l'attestation de l'apprenant ou la suppression de son compte. Garantie : tant que la version reste celle que le cartographe a publiée — l'apprenant qui la remplace lui-même la lui retire — et que le compte du cartographe existe. |
| Destinataires | Garantie : toute personne munie d'un lien vers la version (« Relue et garantie par … »). Le cartographe n'a plus accès à la version après publication, ni à ses liens. |
| Tables | `carto_publication_requests` (migration 023), `cartography_garanties` (008), `audit_events` (`publication_request_created`, `publication_request_cancelled`, `shared_version_guaranteed` : ids seulement, jamais le code). |
| Sort à la suppression | Compte de l'apprenant : demandes, versions et garanties CASCADE. Compte du cartographe : sa garantie CASCADE ; la version reste à l'apprenant, sans garantie. |

### 3 ter. Attestation de majorité

| Élément | Détail |
|---|---|
| Finalité | Réserver la copie serveur et le partage par lien aux adultes (spécification §12 : « pas de contrôle d'âge, mais une auto-certification »). |
| Données | Date de l'attestation (`users.adult_attested_at`), posée par la personne elle-même au moment de partager ; aucune date de naissance, aucun justificatif. |
| Base légale | **b** (condition d'accès à la fonction). |
| Durée | Jusqu'à son retrait (qui efface les versions partagées du compte, leurs liens et leurs garanties, et ses demandes de publication garantie) ou à la suppression du compte. |
| Sort à la suppression | Colonne de la ligne `users` : purgée avec le compte. |

## 4. Progression de formation

| Élément | Détail |
|---|---|
| Finalité | Afficher l'avancement d'une personne dans les parcours de formation (§4.6). |
| Personnes concernées | Toute personne connectée suivant un parcours. |
| Données | Parcours + chapitre + date de complétion (aucun contenu). |
| Base légale | **b** (fonctionnalité du compte). |
| Durée | Jusqu'à suppression du compte. |
| Destinataires | Interne. |
| Tables | `training_progress`. |
| Sort à la suppression | CASCADE. |

## 5. Liens de partage employeur

| Élément | Détail |
|---|---|
| Finalité | Partager une cartographie validée avec un employeur (lien, avec ou sans mot de passe), décision individuelle explicite (§3.6). Depuis le 2026-10-14 (ancien partage retiré, journal de la cartographie D-43), un lien ne se crée plus que vers une **version partagée** de l'interface (§3 bis) ; les liens créés avant vers une cartographie du site restent servis jusqu'à leur échéance ou leur révocation, puis sont purgés comme les autres. |
| Personnes concernées | Apprenants (émetteurs), employeurs (destinataires). |
| Données | Empreinte (sha256) du jeton de lien, empreinte (Argon2id) du mot de passe de partage (facultatif pour une version partagée de l'interface ultime, §3 bis ; obligatoire pour les liens créés avant le retrait de l'ancien partage), échéance, date de révocation — **jamais** les valeurs en clair. |
| Base légale | **a** (consentement, décision individuelle). |
| Durée | Validité **90 jours par défaut** (réglable 1-365 j à la création, `share.php` `expiresInDays`) ; révocable à tout moment ; liens expirés/révoqués **purgés au plus tard 30 jours** après expiration (`scripts/maintenance.php`). |
| Destinataires | Employeur muni du lien (et du mot de passe s'il y en a un). |
| Tables | `share_links`. |
| Sort à la suppression | CASCADE via la cartographie ; entretien périodique pour les liens dormants. |

## 6. Clés d'API personnelles

| Élément | Détail |
|---|---|
| Finalité | Permettre à une personne d'utiliser sa propre clé d'un fournisseur de LLM. |
| Personnes concernées | Apprenants/utilisateurs avancés ; établissements (clé de cohorte, §9). |
| Données | Clé d'API **chiffrée au repos** (libsodium, clé maîtresse hors webroot, ADR-004) ; jamais réaffichée ni exposée. |
| Base légale | **a**/**b** (fonctionnalité demandée). |
| Durée | Jusqu'à effacement par la personne ou suppression du compte. |
| Destinataires | Le fournisseur choisi par la personne, le temps du traitement. Pour un run Twin9, la clé personnelle ne sert que chez Anthropic : un profil qui appelle un autre fournisseur ne part qu'avec les clés de l'instance, refus à l'enregistrement et appel par appel (ADR-012, §13). |
| Tables | `user_api_keys` (+ `etablissement_config.encrypted_key` pour le B2B). |
| Sort à la suppression | CASCADE. |

## 7. Démonstration publique (proxy LLM)

| Élément | Détail |
|---|---|
| Finalité | Offrir une démonstration de cartographie à un visiteur sans compte (§3.1) : l'Essayer, et depuis le 2026-10-21 l'essai gratuit de la cartographie ouverte (Twin6), sur un portfolio de 5 000 caractères au plus. |
| Personnes concernées | Visiteurs anonymes ; titulaires d'un compte qui choisissent l'essai gratuit de la cartographie ouverte, le « Service humanome » de l'assistant de cartographie, ou le service humanome du banc d'essai et de la rétro-ingénierie du promptologue (aucune donnée de compte n'y est liée). |
| Données | **Compteurs anonymes uniquement** : tokens et coût estimé par jour (UTC), quotas par IP hachée (sha256, jamais d'IP brute), empreintes de défis anti-abus consommés. Aucun prompt, aucune réponse, aucune IP en clair conservés. |
| Base légale | **f** (intérêt légitime : sécurité et maîtrise du budget). |
| Durée | Compteurs journaliers (fenêtres courtes), purgés par l'entretien ; défis anti-rejeu à TTL de 2 min. |
| Destinataires | Anthropic (le temps du traitement, texte non conservé côté serveur). |
| Tables | `llm_usage_daily`, `llm_pow_challenges`, `rate_limits` (buckets hachés). |
| Sort à la suppression | Sans objet (aucune donnée nominative ; aucune colonne `user_id`). |

## 8. Sous-traitance modèles de langage (LLM)

| Élément | Détail |
|---|---|
| Finalité | Analyse du texte du portfolio pour produire la cartographie. |
| Personnes concernées | Toute personne déclenchant un run. |
| Données transmises | Le texte à analyser + consignes système. Jamais le mot de passe ni les identifiants de compte. |
| Destinataire | **Démo** : Anthropic via le proxy plateforme. **Clé perso** : le fournisseur choisi par la personne. **Établissement** : la clé de l'établissement ou de la plateforme, selon sa configuration. **Run Twin9** : les fournisseurs des modèles de son profil — Anthropic par défaut, avec la clé de l'instance ou la clé personnelle de la personne ; OpenAI, Mistral AI, Google, xAI ou OpenRouter, avec la clé de l'instance seulement, quand l'administrateur les a ouverts (§13, ADR-012). |
| Base légale | **a** (le run est déclenché par la personne). |
| Conservation côté humanome | Aucune, au-delà de ce que la personne a explicitement stocké (§3) ou accepté de garder sur le serveur avec un run Twin9 (§13). |

### 8 bis. Dialogue d'accompagnement de l'interface ultime (P7)

| Élément | Détail |
|---|---|
| Finalité | Aider la personne à relire ses propres traces par des questions scriptées (citation datée, silence, apparition, constance, renvoi, changement de vocabulaire, écart entre deux ensembles). |
| Traitement | **Local** : le script et le carnet des réponses vivent dans le navigateur (jeu de données IndexedDB) ; aucune table serveur. Le carnet part dans l'archive JSON seulement si la personne y inclut son portfolio, jamais dans une version partagée (§3 bis) ni dans une démo anonymisée. |
| Option LLM | **Désactivée par défaut.** Après choix d'un fournisseur et accord explicite (case décochée par défaut, non enregistrée), chaque relance demandée envoie **uniquement** la question, la réponse et le passage cité, **directement du navigateur** au fournisseur choisi (clé personnelle) ou à Ollama sur l'ordinateur de la personne — jamais par les serveurs de humanome. |
| Base légale | **a** (consentement explicite, relance par relance). |
| Conservation côté humanome | Aucune. |

## 9. Cartographie de masse — établissements (B2B)

| Élément | Détail |
|---|---|
| Finalité | Cartographier les cohortes d'un établissement de formation (§3.7/§4.9). |
| Personnes concernées | Apprenants membres d'une cohorte ; établissement. |
| Données | Adhésion **avec consentement explicite** (`cohorte_membres.consent_at` — rejoindre exige `{"consentement": true}`), portfolio déposé (`cohorte_portfolios`, texte + segments), documents journaliers produits (`mass_jobs.document`), configuration LLM/budget de l'établissement, journaux de run (compteurs). |
| Base légale | **a** (consentement de l'apprenant à deux étages : rejoindre, puis déposer) ; **b** (contrat établissement). |
| Durée | Jusqu'au retrait du consentement (quitter la cohorte : adhésion + portfolio effacés, jobs en attente annulés), suppression du compte apprenant, ou suppression de la cohorte/compte établissement. |
| Destinataires | L'établissement voit les cartographies produites dans ce cadre (tant que l'adhésion est active). |
| Tables | `cohortes`, `cohorte_membres`, `cohorte_portfolios`, `etablissement_config`, `mass_runs`, `mass_jobs`. |
| Sort à la suppression | CASCADE sur le compte apprenant (adhésion, portfolio, jobs) ET sur le compte établissement (tout l'arbre). `mass_jobs.portfolio_id` SET NULL quand le portfolio est effacé (les documents déjà produits survivent au départ, mais sortent de la portée de l'établissement — cf. limite d'accès dans `docs/rgpd-verification.md`). |

## 10. Journal d'audit

| Élément | Détail |
|---|---|
| Finalité | Traçabilité minimale des événements sensibles (création/suppression de compte, partage, adhésion, octroi de rôle…) — §6.5. |
| Personnes concernées | Toute personne effectuant une action tracée. |
| Données | Type d'événement, date, `details` = faits structurés minuscules (identifiants, compteurs, valeurs de liste blanche). **Jamais** de contenu, de mot de passe, de clé, d'email. |
| Base légale | **f** (intérêt légitime : sécurité, obligations de traçabilité). |
| Durée | Conservé au-delà du compte, mais **anonymisé** : `user_id` passe à NULL à la purge — la trace datée subsiste sans identifier personne. |
| Destinataires | Interne. |
| Tables | `audit_events`. |
| Sort à la suppression | `user_id` SET NULL (anonymisation légitime, pas un oubli de purge). |

## 11. Crédit prépayé Twin9

| Élément | Détail |
|---|---|
| Finalité | Facturer l'usage de la clé API plateforme pour les runs Twin9 (ADR-010 §3) : solde prépayé, recharges PayPal, débit par appel. |
| Personnes concernées | Titulaires de compte utilisant Twin9. |
| Données | **Compteurs uniquement** : solde en micro-USD (`twin9_credits`), journal des mouvements (`twin9_credit_events` : montant, étiquette d'étape — pour un run sur le serveur, son numéro et son étape —, modèle, tokens réels, identifiant d'ordre PayPal). **Aucune donnée bancaire** (le paiement se fait chez PayPal), aucun contenu de portfolio ni de prompt. |
| Base légale | **b** (exécution du service prépayé demandé par la personne). |
| Durée | Vie du compte. |
| Destinataires | PayPal (paiement chez eux ; nous ne recevons que l'id d'ordre, le montant, l'état). |
| Tables | `twin9_credits`, `twin9_credit_events`. |
| Sort à la suppression | CASCADE (le solde et son journal appartiennent à la personne). |

## 12. Profils Twin9

| Élément | Détail |
|---|---|
| Finalité | Régler les runs Twin9 de la personne : fournisseurs et modèles de chaque étage, étape et lecteur (ADR-012), seuils, troncatures, voie des appels Anthropic, plafonds (`docs/plan-twin9-php.md` de `Twin_v9`, lot 4a). |
| Personnes concernées | Titulaires de compte qui règlent leurs runs Twin9. |
| Données | **Réglages uniquement**, validés par `schemas/twin9-profil.schema.json` : aucun contenu de portfolio ni de prompt, aucune clé (le profil dit laquelle employer, celle de l'instance ou la clé personnelle, jamais la clé elle-même). |
| Base légale | **b** (exécution du service demandé par la personne). |
| Durée | Vie du compte, ou jusqu'à ce que la personne supprime le profil. |
| Destinataires | Interne. |
| Tables | `twin9_profils` (migration 024). |
| Sort à la suppression | CASCADE (le profil appartient à la personne). |

## 13. Runs Twin9

| Élément | Détail |
|---|---|
| Finalité | Exécuter sur le serveur, par tranches, les runs Twin9 de la personne (ADR-011), et reprendre une carte d'un run à l'autre. |
| Personnes concernées | Titulaires de compte qui lancent des runs Twin9. |
| Données | Par run (`twin9_runs`) : copie des réglages (profil et réglages de la v9.8), **copie du portfolio**, instantané du jeu de gabarits, horloge, compteurs, attestation (profil, versions du jeu de gabarits et du référentiel, commit du moteur), visibilité, date de l'accord, début de sa période en cours et secondes actives ; sa configuration et son exécution (migration 031, P0-1) : **réglages, versions, compteurs et montants uniquement** — réglages d'appel de chaque étape (fournisseur, voie, modèle, budget de sortie, effort, réflexion), collège, paramètres d'algorithme, versions et empreintes du moteur, du référentiel et du jeu de gabarits, prix facturés des modèles employés, appels, pannes, jetons et coûts par voie, fournisseur et modèle, passes du moteur et leur durée, reprises (date, budget) ; jamais un gabarit, une fiche, une clé, la marge ni un contenu de portfolio. Journal des appels (`twin9_appels`) : empreinte SHA-256 du prompt (jamais le prompt), réponse du modèle, fournisseur de l'appel, modèle servi, jetons, coût, réserve tenue avant l'envoi et son montant gardé une fois réglée (le pire cas, T8), durée, coupures par la fin d'une tranche et date depuis laquelle l'appel bute sur un plafond de dépense (migration 032, voie mixte) ; jamais la clé. Lots (`twin9_lots`, voie par lots) : identifiant Anthropic, nombre de requêtes, taille, dates, aucun contenu. Sorties du run (`twin9_resultats`). Mémoire de la carte (`twin9_cartes`, `twin9_memoire`) : journées instruites, faisceaux, calques archivés, par portfolio, référentiel et jeu de gabarits. Tout ce contenu est compressé (zlib), non chiffré. |
| Base légale | **a** : à chaque lancement, l'accord de l'apprenant pour garder son portfolio et l'état du run sur le serveur (ADR-011 §5), que l'écran de lancement (`#/twin9`, T9) demande, daté (`accord_at`) ; sans lui, rien ne part. L'accord nomme les fournisseurs auxquels le run envoie le texte, avec leur voie et leur étiquette RGPD (ADR-012) : la page les lit avant tout aperçu, le lancement envoie leur liste, que le serveur compare aux fournisseurs qu'atteignent les appels du profil (`422` si elle diffère) et garde dans la configuration du run (`accord.fournisseurs`). |
| Durée | Un run fini ne garde de son journal que les compteurs. Le run, portfolio et sorties compris, et la mémoire de ses cartes restent jusqu'à ce que la personne les efface (ADR-011 §5) ; aujourd'hui, en supprimant son compte. |
| Destinataires | Les fournisseurs des modèles du profil (§8), le temps de chaque appel. Anthropic par défaut ; par lots, jusqu'à ce que le lot soit relevé, puis supprimé chez Anthropic, ou annulé puis supprimé avec son run. Un lot qui ne serait pas supprimé y resterait 29 jours. Les autres fournisseurs (ADR-012) — seulement ceux que l'administrateur a ouverts (`twin9_fournisseurs_ouverts`, Anthropic seul par défaut ; un fournisseur étiqueté « non » derrière `twin9_fournisseurs_non_rgpd`, fermé par défaut), avec la clé de l'instance, en direct — conservent selon leur documentation officielle (relevée le 2026-10-22) : OpenAI, appelé avec `store: false`, des journaux de lutte contre les abus jusqu'à 30 jours ; Mistral AI, durée standard non trouvée dans sa documentation (conservation nulle sur demande) ; Google (Gemini), offre payante seule, `store: false`, 55 jours pour la lutte contre les abus ; xAI, 30 jours pour audit, sans entraînement ; OpenRouter, intermédiaire appelé avec `data_collection: deny` et sans repli, la conservation du fournisseur final. Étiquettes RGPD du registre `Twin9\Fournisseurs\Fournisseurs` (recherche de juillet 2026, pas un avis juridique) : Mistral AI « oui » ; Anthropic, OpenAI « sous conditions » ; Google, xAI, OpenRouter « non ». La garde (fournisseur ouvert, étiquette, clé de l'instance, pas de clé personnelle hors d'Anthropic) est relue au lancement, à la reprise et à l'ouverture de chaque tranche ; à l'enregistrement d'un profil, seule la clé personnelle hors d'Anthropic est refusée (un profil qui nomme un fournisseur fermé s'enregistre, mais ne se lance pas). Ce que la plateforme ne règle pas requête par requête se règle sur les comptes des clés de l'instance, à leur pose : chez Mistral AI, l'usage des données pour l'entraînement coupé (« Anonymous improvement data ») ou une offre payante ; chez OpenRouter, la journalisation des entrées et sorties et leur usage par OpenRouter laissés désactivés ; chez Google, une clé de l'offre payante. Les résultats (sorties, cartes du jour de la mémoire) sont lus par la personne et, si elle le décide (visibilité « cartographe », réversible), par le cartographe auquel elle est liée, avec la configuration et l'exécution du run sans prix, coût, plafond ni clé ; l'administrateur ne voit que des compteurs (`docs/autorisations.md`, « Runs Twin9 »). |
| Tables | `twin9_cartes`, `twin9_memoire`, `twin9_runs`, `twin9_appels`, `twin9_resultats` (migration 025), `twin9_lots` (migration 026) ; attestation, visibilité et accord (migration 027) ; réserves, période et secondes actives, `twin9_lots_a_effacer` (migration 028) ; réserve de la fusion, engagement sur le crédit, pire cas de chaque appel, `twin9_evaluations` (migration 030, ci-dessous) ; configuration, exécution, passes et temps du moteur (migration 031) ; fournisseur, coupures et plafond de chaque appel (migration 032). |
| Sort à la suppression | CASCADE depuis le compte (cartes et runs), puis depuis la carte (mémoire) et le run (journal, lots, sorties) (T10). Ses lots encore chez Anthropic sont annulés puis supprimés : ceux de sa clé personnelle au moment de la suppression, tant que la clé existe ; ceux de la clé de l'instance par le tick, qui n'en garde que l'identifiant Anthropic (`twin9_lots_a_effacer`, sans propriétaire). Un lot de sa clé encore en cours d'annulation, ou dont la soumission n'a pas eu de réponse, reste chez Anthropic jusqu'à ce qu'Anthropic l'efface, 29 jours après sa création au plus. |
| Accès et portabilité | L'archive de compte (« Exporter toutes mes données ») contient ses runs — copie du profil, portfolio, configuration et exécution, journal, sorties, évaluation — et la mémoire de ses cartes (`analysesTwin9`, `GET /api/twin9/mes-analyses`, T10), filtrés contre la récitation des gabarits. |

### 13 bis. Évaluations Twin9 (prévisions de coût)

| Élément | Détail |
|---|---|
| Finalité | Prévoir le coût des prochains runs, au plus bas, en moyenne et au plus haut, et ne lancer que les journées que le crédit ou le budget permet de finir avec leur fusion (T8, stratégie A, décision de Christian du 2026-10-19). |
| Personnes concernées | Titulaires de compte dont un run Twin9 est allé au bout. |
| Données | Par run fini (`twin9_evaluations`), **sans aucun contenu** : l'identifiant de la personne évaluée, la taille en Ko de chaque journée de sa carte avec ce que le run a payé pour elle (rien pour une journée reprise de la mémoire ; une marque quand un de ses appels a échoué), le coût de la fusion, le plus grand pire cas réservé par un appel d'une journée et de la fusion, le coût final (ce que la personne a payé, marge de l'instance comprise avec la clé de l'instance), la durée active, et les réglages du profil : le mode, la voie, la clé, la marge, le référentiel et sa version, le jeu de gabarits (son identifiant et son empreinte), les modèles et la performance (étages, étapes, lecteurs : modèle, budget de sortie, effort, réflexion, passes) et les paramètres de l'algorithme (seuils, jury, calques, fusion, Arpenteur, troncatures). Ni le portfolio, ni le nom du journal, ni les identifiants, dates ou titres des journées. |
| Base légale | **f** : intérêt légitime de l'instance à prévoir les coûts qu'elle engage sur le crédit des personnes, et à ne jamais l'épuiser sans finir une carte ; des tailles et des montants, sans contenu. |
| Durée | La ligne survit à son run ; elle sert les prévisions tant que l'instance existe. |
| Destinataires | Aucun : seul le calcul des prévisions la lit (`Twin9\Evaluations`). |
| Tables | `twin9_evaluations` (migration 030). |
| Sort à la suppression | **SET NULL** `user_id` : la ligne reste, pour les prévisions, sans plus appartenir à personne. |
| Accès et portabilité | Dans l'archive de compte, avec son run (`evaluation`, §13). |

---

## Référentiel et système de prompts (donnée non personnelle)

Le référentiel de compétences (`referentiel_versions`) et les prompts
(`prompt_packages`, `prompt_versions`, `settings`) sont des **contenus
collectifs, publics en lecture et immuables une fois publiés**. Ils ne
contiennent pas de donnée personnelle des apprenants. La seule attache à une
personne est `created_by` (l'auteur épistémiarque/promptologue), passée en
**SET NULL** à la suppression de son compte : la version publiée survit
anonymisée, ce qui est cohérent avec son caractère immuable et collectif. Ce
n'est donc pas un traitement de données personnelles d'apprenant.

Il en va de même des gabarits Twin9 (`twin9_protocole`,
`twin9_protocole_versions`, migration 011) et des copies qu'en font les
promptologues (`twin9_jeux`, `twin9_jeux_gabarits`, `twin9_jeux_versions`,
migration 029, T14) : contenu de plateforme confidentiel (ADR-010), sans
donnée personnelle. Les colonnes `updated_by` / `created_by` (l'éditeur) et
`twin9_jeux.user_id` (l'auteur d'une copie) passent en **SET NULL** à la
suppression de son compte, comme `golden_grants.granted_by` : la copie
survit, que personne ne modifie plus.
