<?php

declare(strict_types=1);

/**
 * Configuration administrateur de la démo publique (cahier §3.8 : « un
 * fichier de configuration édité à la main suffit en v1 »).
 *
 * Ce fichier gouverne le proxy LLM plateforme (POST /api/llm) utilisé par les
 * visiteurs SANS compte (cahier §3.1) : le serveur IMPOSE fournisseur, modèle
 * et plafond de tokens — les valeurs envoyées par le client sont ignorées
 * (protection du budget).
 *
 * PRÉCÉDENCE (chantier A) : depuis que la démo est éditable depuis l'admin
 * (#/admin/reglages, PUT /api/admin/demo-config), les réglages stockés en
 * base (settings["demo_overrides"]) gagnent sur TOUT le reste :
 *
 *   base (settings.demo_overrides) > env (DEMO_*) > ce fichier > défauts codés
 *
 * Effet immédiat, sans redéploiement (cas d'usage : activer/désactiver la
 * démo d'un geste depuis un smartphone). Fail-safe : si la base est absente
 * ou injoignable, la couche « base » est ignorée en silence et la démo
 * retombe sur env/fichier. DELETE /api/admin/demo-config supprime tous les
 * overrides (retour à env/fichier).
 *
 * Deux exceptions, volontaires :
 *   - `provider` n'est PAS éditable depuis l'admin (env/fichier uniquement) :
 *     la démo utilise la clé plateforme Anthropic, et 'mock' est un mode de
 *     dev — le rendre commutable depuis une UI web serait un piège budget/
 *     sécurité.
 *   - ANTHROPIC_API_KEY reste EXCLUSIVEMENT en environnement : jamais en
 *     base, jamais renvoyée par l'API (seulement un booléen « configurée »).
 *
 * Chaque clé est surchargeable par variable d'environnement (~/app/shared/.env
 * en production, .env.dev exporté en dev) — la variable, si non vide, gagne
 * sur la valeur ci-dessous (mais perd face à un override en base) :
 *
 *   enabled            DEMO_ENABLED              Interrupteur général de la démo.
 *                                                false -> POST /api/llm répond 503.
 *                                                Valeurs env : 1/0, true/false, on/off.
 *   provider           DEMO_PROVIDER             'anthropic' (clé plateforme lue dans
 *                                                ANTHROPIC_API_KEY, jamais exposée)
 *                                                ou 'mock' (réponses simulées depuis
 *                                                schemas/fixtures/, dev sans clé).
 *   model              DEMO_MODEL                Modèle imposé côté serveur.
 *   maxTokensPerRequest DEMO_MAX_TOKENS_PER_REQUEST
 *                                                Plafond de tokens de sortie par appel,
 *                                                imposé quel que soit le client.
 *   maxInputChars      DEMO_MAX_INPUT_CHARS      Taille maximale de l'entrée
 *                                                (system + prompt), en caractères.
 *   perIpPerHour       DEMO_PER_IP_PER_HOUR      Quota de requêtes par IP et par heure
 *                                                (fenêtre fixe, buckets hachés dans
 *                                                rate_limits — jamais d'IP brute, §6).
 *                                                Quota PARTAGÉ entre POST /api/llm et
 *                                                GET /api/gdoc-text.
 *   dailyGlobalTokens  DEMO_DAILY_GLOBAL_TOKENS  Plafond global journalier (UTC) de
 *                                                tokens entrée+sortie, toutes IP
 *                                                confondues. Dépassé -> 503
 *                                                « démo épuisée pour aujourd'hui ».
 *   dailyBudgetUsd     DEMO_DAILY_BUDGET_USD     Coupe-circuit budgétaire journalier
 *                                                (coût estimé, USD).
 *   powDifficultyBits  DEMO_POW_DIFFICULTY_BITS  Difficulté de la preuve de travail :
 *                                                nombre de bits à zéro en tête de
 *                                                sha256(challenge . ':' . nonce).
 *                                                ~2^N hachages côté client (20 bits
 *                                                ≈ 1 s sur un navigateur moderne).
 *   upstreamTimeoutSeconds DEMO_UPSTREAM_TIMEOUT Délai maximal (s) d'un appel au
 *                                                fournisseur amont (pas de streaming
 *                                                sur mutualisé : appel bufferisé).
 *
 * Secret de la preuve de travail : POW_SECRET (env). S'il est absent, un
 * secret est dérivé de MIGRATE_TOKEN (sha256) — voir Llm/PowChallenge. Si ni
 * l'un ni l'autre n'est défini, GET /api/llm/challenge répond 503.
 *
 * Tarifs par modèle (USD par million de tokens) pour l'estimation de coût du
 * coupe-circuit : voir Llm/Pricing (préfixe de modèle le plus long gagnant).
 *
 * VALEURS (2026-10-21, Christian : « 1 USD par jour pour tous les utilisateurs
 * anonymes ou connectés, mais pas plus de dépense journalière ») : un budget
 * de 1 $ par jour, que partage tout ce qui passe par POST /api/llm — l'Essayer,
 * l'essai gratuit de la cartographie ouverte (Twin6), le « Service humanome »
 * de l'assistant de cartographie, le banc et la rétro-ingénierie du
 * promptologue —, visiteurs et comptes confondus. Le pire cas de chaque appel
 * y est réservé avant qu'il parte (routes/llm.php) : la dépense ne le dépasse
 * pas, même sous concurrence. Avec Haiku 5.5, ce dollar paie de quarante à
 * soixante Essayer, ou de huit à vingt essais de Twin6 (0,05 à 0,13 $). Les
 * deux pages bornent le texte du visiteur à 5 000 caractères ; le serveur, lui,
 * borne l'appel entier, gabarit compris : 420 000 caractères, pour la synthèse
 * de Twin6, qui porte les sorties des sept scans (jusqu'à 415 000 caractères
 * quand chacun rend ses 16 000 tokens). 16 000 jetons de sortie, car un scan de
 * Twin6 en rend couramment plus de 8 192 ; 150 s par appel ; 6 millions de
 * jetons par jour, un garde-fou qui ne dépend pas des tarifs. Sonnet 5.5 ne
 * convient pas : il refuse la réflexion désactivée qu'envoie la démo.
 */

return [
    'enabled' => true,
    'provider' => 'anthropic', // 'anthropic' | 'mock'
    'model' => 'claude-haiku-5-5',
    'maxTokensPerRequest' => 16000,
    'maxInputChars' => 420000,
    'perIpPerHour' => 20,
    'dailyGlobalTokens' => 6000000,
    'dailyBudgetUsd' => 1.0,
    'powDifficultyBits' => 20,
    'upstreamTimeoutSeconds' => 150,
];
