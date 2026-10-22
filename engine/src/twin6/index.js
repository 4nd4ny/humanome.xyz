// « Cartographie ouverte Twin6 » — orchestrateur du pipeline open source.
//
// Un appel `1-scan-pole` par pôle du référentiel employé, sur le portfolio
// ENTIER, puis 1 appel `2-kairos-final`, et le mapping vers
// `cartographie-merge` (voir mapper.js) — RESPIRE v7 : 7 + 1 = 8 appels. C'est
// le pendant GRATUIT/ouvert de Twin9 (milliers d'appels, confidentiel).
//
// Contrat des prompts (vérifié sur les .md source) : `${POLE}` = le NUMÉRO du
// pôle ; la fiche de ce pôle et le portfolio sont des ENTRÉES attachées (pas de
// placeholder dédié), injectées ici sous des titres explicites. Le kairos
// reçoit les `carto_pole` de tous les pôles + le portfolio original. Les
// gabarits de twin6-ouverte 1.1.0 lisent en outre le référentiel employé
// (`${REFERENTIEL}`, `${NB_POLES}`, `${NB_COMPETENCES}`, `${FORMAT_CODE}`…,
// ./variables.js), rendus ici avant tout appel ; ceux de 1.0.0, qui écrivent
// RESPIRE v7 en toutes lettres, passent inchangés.
//
// Aucune E/S ni secret ici (convention moteur, P5) : les gabarits (scan-pole,
// kairos, une fiche par pôle — tous PUBLICS) sont injectés par l'appelant, qui
// choisit le référentiel et ses fiches (fichesPourTwin6, ./fiches.js : celles
// du paquet pour RESPIRE v7, écrites depuis le document pour tout autre
// pôle). La sortie LLM est du JSON ; on l'extrait de façon tolérante (fences
// ```json, préambule).
//
// Le document exporté peut dire comment il a été produit (2026-10-22,
// docs/contrats.md §4 point 8) : quand l'appelant passe `options.configuration`
// (le paquet et l'empreinte de ses octets, le référentiel, l'origine des
// fiches, l'accès), executerTwin6 la complète de ce que lui seul sait — le
// fournisseur et son tag RGPD, le transport, le modèle, le budget de sortie
// résolu, la température — et y joint `execution`, tirée des appels. Sans
// elle, le document reste celui d'hier, à l'octet.

import { twin6ToMergeDocument } from './mapper.js'
import { rendreGabaritTwin6, variablesTwin6 } from './variables.js'
import { sortieMaxAnthropic } from '../providers/limits.js'
import { ProviderError } from '../providers/errors.js'
import { PROVIDER_INFO } from '../providers/index.js'
import { STOP_CLASSES, classifyStop, isOutputTruncated, isTruncatedResult, truncationError } from '../providers/stop.js'

// Les fiches d'un pôle pour tout référentiel (WP1, 2026-10-20), exposées avec le pipeline.
export { fichesDuReferentiel, fichesPourTwin6, originesDesFiches } from './fiches.js'
// Les variables par lesquelles les gabarits 1.1.0 lisent le référentiel (2026-10-20).
export { formatCodeTwin6, rendreGabaritTwin6, variablesTwin6 } from './variables.js'

/** Nombre d'appels d'un run Twin6 sur RESPIRE v7 (7 pôles + kairos). */
export const TWIN6_CALLS = 8

/**
 * Nombre d'appels d'un run Twin6 sur un référentiel : un scan par pôle, plus
 * le kairos (RESPIRE v7 : TWIN6_CALLS).
 *
 * @param {{poles: Array}} referentiel
 */
export function twin6CallsFor(referentiel) {
  return referentiel.poles.length + 1
}

/** Prompt scan-pole : `${POLE}` → numéro, puis fiche du pôle + portfolio attachés. */
export function buildScanPolePrompt(scanPoleTemplate, poleNum, ficheMd, portfolio) {
  const base = scanPoleTemplate.replaceAll('${POLE}', String(poleNum))
  return (
    `${base}\n\n---\n\n# Fiche des compétences du pôle ${poleNum} (P${poleNum}.md)\n\n` +
    `${ficheMd}\n\n---\n\n# Portfolio à cartographier\n\n${portfolio}\n`
  )
}

/** Prompt kairos : les `carto_pole` (étiquetés carto_P<n>) + portfolio original. */
export function buildKairosPrompt(kairosTemplate, cartoPoles, portfolio) {
  const blocks = cartoPoles
    .map((cp) => `## carto_P${cp.poleNum}\n\n\`\`\`json\n${JSON.stringify(cp)}\n\`\`\``)
    .join('\n\n')
  return (
    `${kairosTemplate}\n\n---\n\n# Cartographies de pôle (entrée)\n\n${blocks}\n\n` +
    `---\n\n# Portfolio original\n\n${portfolio}\n`
  )
}

/**
 * Extrait le premier objet JSON d'une réponse LLM. Tolère un bloc ```json … ```
 * et un préambule/épilogue en prose. Lève si aucun objet n'est trouvable.
 */
export function extractJson(text) {
  if (typeof text !== 'string') throw new Error('extractJson: réponse non textuelle')
  // Un document JSON pur — la sortie à outil forcé de la démo et des crédits —
  // se lit tel quel : un bloc ``` qu'une de ses chaînes cite (un portfolio
  // d'informatique) n'est pas une clôture (revue du 2026-10-21).
  try {
    const direct = JSON.parse(text)
    if (direct !== null && typeof direct === 'object' && !Array.isArray(direct)) return direct
  } catch {
    // De la prose autour, ou un bloc ```json : l'extraction tolérante ci-dessous.
  }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fence ? fence[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) {
    throw new Error('extractJson: aucun objet JSON trouvé dans la réponse')
  }
  return JSON.parse(candidate.slice(start, end + 1))
}

/** Horodatage sans fuseau, le motif de `generatedAt` (AAAA-MM-JJThh:mm:ss). */
function horodatage(date) {
  return date.toISOString().slice(0, 19)
}

/** Un compte de jetons : un entier positif, 0 sinon. */
function jetons(n) {
  return Number.isInteger(n) && n >= 0 ? n : 0
}

/** Les champs nommés d'un objet, chacun null quand il manque. */
function champs(objet, noms) {
  return Object.fromEntries(noms.map((nom) => [nom, objet?.[nom] ?? null]))
}

/**
 * Le bloc `configuration` d'un document Twin6 (schéma `twin6-configuration/1`) :
 * ce que l'appelant seul sait — le paquet (avec l'empreinte sha256 de ses octets
 * servis), le référentiel, l'origine de chaque fiche, l'accès —, complété de ce
 * que l'exécution seule sait. Liste blanche : rien d'autre n'en sort, aucune clé.
 * Un fournisseur que le registre ne connaît pas (un double de test) est null,
 * son tag aussi : le bloc ne devine pas.
 *
 * @param {{paquet?: object, referentiel?: object, fiches?: Record<string,string>,
 *   acces?: 'cle_perso'|'credits'|'essai'}} donnees ce que l'appelant passe
 * @param {{provider: {name?: string, fournisseur?: string, transport?: string},
 *   model: string, maxTokens: number, temperature?: number}} run
 */
export function configurationTwin6(donnees, { provider, model, maxTokens, temperature }) {
  const id = provider?.fournisseur ?? provider?.name ?? null
  const info = typeof id === 'string' && Object.hasOwn(PROVIDER_INFO, id) ? PROVIDER_INFO[id] : null
  const fiches = {}
  for (const [num, origine] of Object.entries(donnees?.fiches ?? {})) fiches[String(num)] = origine
  return {
    schema: 'twin6-configuration/1',
    moteur: 'twin6',
    paquet: champs(donnees?.paquet, ['id', 'version', 'sha256']),
    referentiel: champs(donnees?.referentiel, ['id', 'version', 'contentHash', 'structure']),
    fiches,
    fournisseur: info ? id : null,
    // Twin6 enchaîne ses appels depuis le navigateur : jamais de lots.
    voie: 'directe',
    acces: donnees?.acces ?? null,
    transport: provider?.transport === 'direct' || provider?.transport === 'proxy' ? provider.transport : null,
    modele: model,
    maxTokens,
    temperature: typeof temperature === 'number' ? temperature : null,
    rgpd: info?.rgpd ?? null,
  }
}

/**
 * L'arrêt d'un appel tel que le document l'exporte : une classe normalisée (un
 * fournisseur injecté qui rend sa valeur brute est classé), et la valeur brute
 * seulement si c'est un identifiant court (sinon « other »), comme le journal PHP.
 */
function arretExporte(fournisseur, stopReason, stopReasonRaw) {
  const classe = stopReason === null || stopReason === undefined || stopReason === ''
    ? null
    : STOP_CLASSES.includes(stopReason) ? stopReason : classifyStop(fournisseur, stopReason).stopReason
  return { stopReason: classe, stopReasonRaw: classifyStop(fournisseur, stopReasonRaw).stopReasonRaw }
}

/**
 * Le bloc `execution` d'un document Twin6 (schéma `twin6-execution/1`), tiré des
 * appels du run : leur étape, le modèle servi, l'arrêt, les jetons ; le modèle
 * servi, que seule la réponse connaît (l'essai impose le sien) ; le coût reste
 * null : le moteur ne le connaît pas, et un document se partage — le montant
 * débité reste au relevé du compte.
 *
 * @param {Array<{etape: string, usage: ?object, model: ?string, stopReason: ?string,
 *   stopReasonRaw: ?string}>} calls les appels d'executerTwin6
 * @param {{debut: string, fin: string, fournisseur: ?string}} bornes
 */
export function executionTwin6(calls, { debut, fin, fournisseur }) {
  const usage = { inputTokens: 0, outputTokens: 0 }
  const modelesServis = []
  const appels = calls.map((c) => {
    const inputTokens = jetons(c.usage?.inputTokens)
    const outputTokens = jetons(c.usage?.outputTokens)
    usage.inputTokens += inputTokens
    usage.outputTokens += outputTokens
    const modele = typeof c.model === 'string' && c.model !== '' ? c.model : null
    if (modele !== null && !modelesServis.includes(modele)) modelesServis.push(modele)
    return { etape: c.etape, modele, ...arretExporte(fournisseur, c.stopReason, c.stopReasonRaw), inputTokens, outputTokens }
  })
  return { schema: 'twin6-execution/1', debut, fin, appels, usage, modelesServis, coutMicrousd: null }
}

/**
 * Exécute une Cartographie ouverte Twin6 de bout en bout.
 *
 * @param {object} args
 * @param {string} args.portfolio portfolio markdown (feuilles `### YYYY-MM-DD`).
 * @param {{scanPole: string, kairos: string, fiches: Record<string|number,string>}} args.templates
 *   gabarits PUBLICS (scan-pole, kairos, fiche par pôle).
 * @param {{id?: string, competences: Array, poles: Array<{num,nom}>}} args.referentiel structure du
 *   référentiel employé (un scan par pôle ; un autre que RESPIRE nomme le document, T17).
 * @param {{complete: Function, name?: string}} args.provider handle de createProvider().
 * @param {string} args.model identifiant de modèle.
 * @param {object} [args.options] { maxTokens, temperature, signal, onProgress, meta, configuration,
 *   now } — maxTokens : par défaut tout ce que le modèle peut rendre (sortieMaxAnthropic,
 *   2026-10-21 : une réponse coupée est payée et perdue ; le proxy de la démo impose de toute façon
 *   le sien). configuration : {paquet: {id, version, sha256}, referentiel: {id, version,
 *   contentHash, structure}, fiches: {num: 'paquet'|'document'}, acces} — présente, le document
 *   porte les blocs `configuration` (complétée, configurationTwin6) et `execution`
 *   (executionTwin6), en schemaVersion 1.1.0 ; absente, il reste en 1.0.0, à l'octet. now : horloge
 *   injectable (() => Date) des bornes `debut` et `fin` de l'exécution.
 * @returns {Promise<{document: object, cartoPoles: Array, kairos: object,
 *   usage: {inputTokens:number, outputTokens:number}, calls: Array}>}
 *   calls : {etape, usage, model, stopReason, stopReasonRaw} par appel.
 * @throws {OutputTruncatedError} sortie tronquée (budget de sortie ou fenêtre de contexte) :
 *   le message nomme l'étape ; `etape`, `usageRun` (le run jusqu'à l'appel tronqué compris, qui
 *   est payé) et `calls` y sont joints ; aucun nouvel essai.
 * @throws {ProviderError} code 'refus' : le fournisseur a refusé de répondre (mêmes champs joints).
 */
export async function executerTwin6({ portfolio, templates, referentiel, provider, model, options = {} }) {
  if (typeof portfolio !== 'string' || portfolio.trim() === '') {
    throw new Error('executerTwin6: portfolio (string non vide) requis')
  }
  if (!templates?.scanPole || !templates?.kairos || !templates?.fiches) {
    throw new Error('executerTwin6: templates { scanPole, kairos, fiches } requis')
  }
  if (!referentiel?.poles || !referentiel?.competences) {
    throw new Error('executerTwin6: referentiel { poles[], competences[] } requis')
  }
  if (!provider?.complete || !model) {
    throw new Error('executerTwin6: provider (createProvider) et model requis')
  }

  const { maxTokens = sortieMaxAnthropic(model), temperature, signal, onProgress, meta = {} } = options
  const donneesConfiguration =
    options.configuration !== null && typeof options.configuration === 'object' ? options.configuration : null
  const now = options.now ?? (() => new Date())
  const poleNums = referentiel.poles.map((p) => p.num).sort((a, b) => a - b)
  // Les variables du référentiel (gabarits 1.1.0) ; sans elles (1.0.0), rien ne change.
  const variables = variablesTwin6(referentiel)
  const scanPole = rendreGabaritTwin6(templates.scanPole, variables)
  const kairosGabarit = rendreGabaritTwin6(templates.kairos, variables)
  const total = poleNums.length + 1
  let done = 0
  const usage = { inputTokens: 0, outputTokens: 0 }
  const calls = []

  // Tout appel qui a répondu est payé, même tronqué ou refusé : il entre au cumul.
  const accumulate = (etape, res) => {
    usage.inputTokens += res.usage?.inputTokens ?? 0
    usage.outputTokens += res.usage?.outputTokens ?? 0
    calls.push({
      etape,
      usage: res.usage ?? null,
      model: res.model ?? model,
      stopReason: res.stopReason ?? null,
      stopReasonRaw: res.stopReasonRaw ?? null,
    })
  }
  // L'échec porte l'étape et ce que le run a consommé jusqu'à lui.
  const echec = (err, etape) => {
    err.etape = etape
    err.usageRun = { ...usage }
    err.calls = calls.map((c) => ({ ...c }))
    return err
  }
  const tronque = (etape, res, cause) =>
    echec(
      truncationError(res, {
        provider: res.provider ?? provider.name ?? null,
        maxTokens: res.maxTokens ?? maxTokens,
        message: `executerTwin6: sortie tronquée (${res.stopReason === 'context_window' ? 'context_window' : 'max_tokens'}) à l'étape ${etape}`
          + (cause ? ` — ${cause.message}` : ''),
        cause,
      }),
      etape,
    )

  // Un appel : la sortie tronquée (levée par le fournisseur, ou signalée par un
  // fournisseur injecté) et le refus deviennent des erreurs explicites, plutôt
  // qu'un échec obscur d'extractJson sur un fragment ou un texte vide.
  const appeler = async (etape, prompt) => {
    let res
    try {
      res = await provider.complete({ model, prompt, maxTokens, temperature, signal })
    } catch (err) {
      if (!isOutputTruncated(err)) throw err
      const coupe = {
        text: err.fragment,
        usage: err.usage,
        model: err.model,
        stopReason: err.stopReason,
        stopReasonRaw: err.stopReasonRaw,
        provider: err.provider,
        maxTokens: err.maxTokens,
      }
      accumulate(etape, coupe)
      throw tronque(etape, coupe, err)
    }
    accumulate(etape, res)
    if (isTruncatedResult(res)) throw tronque(etape, res)
    if (res.stopReason === 'refusal') {
      const refus = new ProviderError(`executerTwin6: le fournisseur a refusé de répondre à l'étape ${etape}`, {
        status: 200,
        retryable: false,
        provider: provider.name ?? null,
      })
      refus.code = 'refus'
      throw echec(refus, etape)
    }
    return res
  }

  // Phase 1 — un scan-pole par pôle du référentiel, dans l'ordre de leurs numéros.
  const debut = donneesConfiguration ? horodatage(now()) : null
  const cartoPoles = []
  for (const num of poleNums) {
    const fiche = templates.fiches[num] ?? templates.fiches[String(num)]
    if (!fiche) throw new Error(`executerTwin6: fiche manquante pour le pôle ${num}`)
    onProgress?.({ phase: 'scan-pole', pole: num, done, total })
    const prompt = buildScanPolePrompt(scanPole, num, fiche, portfolio)
    const res = await appeler(`scan-pole/${num}`, prompt)
    const cartoPole = extractJson(res.text)
    if (cartoPole.poleNum == null) cartoPole.poleNum = num
    cartoPoles.push(cartoPole)
    done += 1
  }

  // Phase 2 — kairos transversal.
  onProgress?.({ phase: 'kairos', done, total })
  const kairosPrompt = buildKairosPrompt(kairosGabarit, cartoPoles, portfolio)
  const kres = await appeler('kairos', kairosPrompt)
  const kairos = extractJson(kres.text)
  done += 1
  onProgress?.({ phase: 'done', done, total })

  // Phase 3 — mapping vers le document du viewer, avec la configuration et
  // l'exécution du run quand l'appelant en a passé une (sinon, `meta` tel quel).
  let metaDocument = meta
  if (donneesConfiguration) {
    const configuration = configurationTwin6(donneesConfiguration, { provider, model, maxTokens, temperature })
    const execution = executionTwin6(calls, { debut, fin: horodatage(now()), fournisseur: configuration.fournisseur })
    metaDocument = { ...meta, configuration, execution }
  }
  const document = twin6ToMergeDocument(cartoPoles, kairos, referentiel, metaDocument)
  return { document, cartoPoles, kairos, usage, calls }
}
