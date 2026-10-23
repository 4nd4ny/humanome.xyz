// Assistant « Nouveau run » (P8.3) — #/espace/nouveau-run.
//
// Cinq étapes : (a) portfolio -> (b) version de prompt et référentiel ->
// (c) fournisseur -> (d) estimation -> (e) exécution. Toute la logique non-UI
// vit dans web/src/lib/run-launcher.js ; l'exécution s'appuie sur le moteur
// réel (extractDay par journée, checkpoints IndexedDB, reprise réelle après
// rechargement : les journées déjà checkpointées sont sautées).
//
// Référentiel (2026-10-20) : RESPIRE par défaut, ou un autre référentiel publié
// (ReferentielChoice) ; le run en lit la structure dans son JSON — pôles,
// codes, nombre d'appels — et l'enregistre avec la cartographie.
//
// v1 assumée (documentée) : le run exécute TOUJOURS le pipeline embarqué
// (Aurora v3 reconstruit, P5) ; la version de prompt choisie est enregistrée
// dans runMeta/promptPackage, et le banc d'essai promptologue (P10) branchera
// l'exécution des paquets publiés. Le document merge est construit SANS
// narratifs LLM (résumés locaux : badge + compteurs, pas de récit).
//
// Mode simple (lib/ui-mode.js, 2026-10-22) : l'étape 2 s'intitule
// « Référentiel » et dit en une ligne le protocole exécuté, le paquet embarqué,
// qui est aussi celui qu'enregistre la cartographie ; le champ « Modèle » de la
// clé personnelle disparaît (modèle par défaut du fournisseur). Le choix du
// référentiel reste visible dans les deux modes.
//
// La clé personnelle (ADR-013, règle R1 de Christian) reste dans ce
// navigateur : l'étape « Fournisseur » le dit, propose de la mémoriser ici
// (localStorage), et n'offre plus ni de la synchroniser sur le serveur ni de
// l'y récupérer ; une clé gardée avant se recopie depuis « Mon compte ».

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortfolioStore } from '../lib/portfolio-store.js'
import { loadPublishedReferentiel } from '../data/referentiel.js'
import { REFERENTIEL_PAR_DEFAUT } from '@engine/conformite.js'
import { apiFetch } from '../api/client.js'
import { createIndexedDbStorage } from '@engine/runs/index.js'
import { callsPerDayFor, mergeNarrativeCallsFor } from '@engine/providers/estimate.js'
import ReferentielChoice from './ReferentielChoice.jsx'
import { isAbortError, describeDemoError } from '../lib/demo-llm.js'
import {
  BUILTIN_PACKAGE,
  PROVIDERS,
  SERVICE_ESTIMATION_MODEL,
  buildEstimate,
  computeDayGroups,
  createProviderBundle,
  executeRun,
  fetchPromptPackages,
  getLocalKey,
  KEY_STAYS_IN_BROWSER,
  makeRunId,
  setLocalKey,
} from '../lib/run-launcher.js'
import { loadCartoStore } from '../views/espace/carto-store-bridge.js'
import { useUiMode } from '../lib/ui-mode.js'

const STEPS = [
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'prompt', label: 'Version de prompt', simpleLabel: 'Référentiel' },
  { key: 'fournisseur', label: 'Fournisseur' },
  { key: 'estimation', label: 'Estimation' },
  { key: 'execution', label: 'Exécution' },
]

/** 12345 -> « 12 345 » */
function formatInt(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/**
 * @param {object} props
 * @param {{status: string, user: object | null}} props.session
 * @param {object} [props.deps] coutures de test :
 *   {portfolioStore, loadReferentiel, listReferentiels, apiFetchFn, fetchFn,
 *    keyStorage, providerBundleFactory, runStorageFactory, cartoStoreLoader,
 *    navigate, now}
 */
export default function RunWizard({ session, deps = {} }) {
  // Mode d'affichage (défaut du contexte : expert, tout est proposé).
  const { expert } = useUiMode()
  const portfolioStore = useMemo(
    () => deps.portfolioStore ?? createPortfolioStore(),
    [deps.portfolioStore],
  )
  const loadReferentiel = deps.loadReferentiel ?? loadPublishedReferentiel
  const apiFetchFn = deps.apiFetchFn ?? apiFetch
  const bundleFactory = deps.providerBundleFactory ?? createProviderBundle
  const runStorageFactory = deps.runStorageFactory ?? (() => createIndexedDbStorage())
  const cartoStoreLoader = deps.cartoStoreLoader ?? loadCartoStore
  const navigate = deps.navigate ?? ((hash) => (window.location.hash = hash))

  const [step, setStep] = useState(0)
  // Référentiel choisi ({id, version}) ; null : RESPIRE, dernière version publiée.
  const [refChoix, setRefChoix] = useState(null)
  const [referentiel, setReferentiel] = useState(null)
  const [referentielError, setReferentielError] = useState(null)

  // (a) portfolio
  const [portfolios, setPortfolios] = useState(null)
  const [portfolioId, setPortfolioId] = useState(null)

  // (b) version de prompt
  const [packages, setPackages] = useState(null) // {packages, origin} | null
  const [packageKey, setPackageKey] = useState(`${BUILTIN_PACKAGE.id}@${BUILTIN_PACKAGE.version}`)

  // (c) fournisseur
  const [mode, setMode] = useState('cle') // 'cle' | 'humanome'
  const [providerId, setProviderId] = useState('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(PROVIDERS[0].defaultModel)
  const [rememberKey, setRememberKey] = useState(true)

  // (e) exécution
  const [runState, setRunState] = useState('idle')
  // 'idle' | 'running' | 'saving' | 'done' | 'interrupted' | 'error'
  const [runError, setRunError] = useState(null)
  const [resumedFrom, setResumedFrom] = useState(0)
  const [dayInfo, setDayInfo] = useState(null) // {iso, position, total}
  const [callInfo, setCallInfo] = useState(null) // {step, poleNum, done, total}
  const [daysDone, setDaysDone] = useState(0)
  const [failedDays, setFailedDays] = useState([])
  const [mergeNotice, setMergeNotice] = useState(null) // fusion non constructible (portfolio creux)
  const [saveFallback, setSaveFallback] = useState(null) // JSON à télécharger si carto-store absent
  const [runUsage, setRunUsage] = useState(null) // tokens réels mesurés sur la session de run
  const controllerRef = useRef(null)
  const storageRef = useRef(null)

  useEffect(() => {
    let alive = true
    portfolioStore.list().then((records) => alive && setPortfolios(records))
    fetchPromptPackages({ apiFetchFn }).then((result) => alive && setPackages(result))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Le référentiel du run : RESPIRE par défaut (repli embarqué garanti), ou
  // celui choisi, dont le run lit la structure. Par défaut, la dernière version
  // publiée de RESPIRE lue comme le menu la montre : dans la base d'abord (S5).
  useEffect(() => {
    let alive = true
    setReferentiel(null)
    setReferentielError(null)
    const load = loadReferentiel(refChoix ? { id: refChoix.id, version: refChoix.version } : { id: REFERENTIEL_PAR_DEFAUT })
    load
      .then(({ doc }) => alive && setReferentiel(doc))
      .catch((err) => alive && setReferentielError(err?.message ?? 'Référentiel indisponible.'))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refChoix])

  // Navigation qui démonte l'assistant -> interruption coopérative du run.
  useEffect(() => () => controllerRef.current?.abort(), [])

  // Clé locale pré-remplie quand le fournisseur change.
  useEffect(() => {
    setApiKey(getLocalKey(providerId, deps.keyStorage))
    setModel(PROVIDERS.find((p) => p.id === providerId)?.defaultModel ?? '')
  }, [providerId, deps.keyStorage])

  const portfolio = portfolios?.find((p) => p.id === portfolioId) ?? null
  const dayGroups = useMemo(
    () => (portfolio ? computeDayGroups(portfolio.segments) : []),
    [portfolio],
  )
  // Mode simple : la liste n'est pas proposée, le paquet est l'embarqué — celui
  // que le moteur exécute —, même si un autre avait été choisi en mode expert.
  const selectedPackage = useMemo(() => {
    if (!expert) return BUILTIN_PACKAGE
    const list = packages?.packages ?? [BUILTIN_PACKAGE]
    return list.find((p) => `${p.id}@${p.version}` === packageKey) ?? BUILTIN_PACKAGE
  }, [expert, packages, packageKey])

  const providerDef = PROVIDERS.find((p) => p.id === providerId)
  // Le modèle de la clé personnelle : en mode simple, celui du fournisseur par
  // défaut (le champ n'est pas affiché).
  const runModel = expert ? model : (providerDef?.defaultModel ?? model)
  // Le Service humanome s'estime au modèle de la démo qui le sert, un Haiku (2026-10-21).
  const estimationModel = mode === 'humanome' ? SERVICE_ESTIMATION_MODEL : runModel
  const estimate = useMemo(() => {
    if (!referentiel || dayGroups.length === 0) return null
    try {
      return buildEstimate({ dayGroups, referentiel, model: estimationModel })
    } catch {
      return null
    }
  }, [referentiel, dayGroups, estimationModel])

  const canLeaveStep = {
    portfolio: dayGroups.length > 0,
    prompt: referentiel !== null,
    fournisseur: mode === 'humanome' || !providerDef?.requiresKey || apiKey.trim() !== '',
    estimation: estimate !== null,
  }

  async function saveResults(document, dayDocuments, usage) {
    const refMeta = { id: referentiel.id ?? 'respire', version: referentiel.version ?? null }
    const pkgMeta = { id: selectedPackage.id, version: selectedPackage.version }
    const runMeta = {
      portfolioId: portfolio.id,
      portfolioTitre: portfolio.titre,
      mode,
      provider: mode === 'humanome' ? 'humanome' : providerId,
      model: mode === 'humanome' ? 'impose par la plateforme' : runModel,
      jours: dayGroups.length,
      generatedAt: new Date().toISOString(),
      // Tokens RÉELS mesurés sur cette session de run (compteurs seulement,
      // RGPD §6.5) — conservés en base avec la cartographie à la copie opt-in.
      ...(usage && usage.mesures > 0
        ? {
            usage: {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              mesures: usage.mesures,
            },
          }
        : {}),
    }
    const store = await cartoStoreLoader()
    if (!store) {
      // carto-store (chantier C) absent : proposer le téléchargement JSON.
      setSaveFallback(
        JSON.stringify({ merge: document, jours: dayDocuments, runMeta }, null, 1),
      )
      return { saved: 0 }
    }
    let saved = 0
    for (const dayDoc of dayDocuments) {
      await store.saveCartography({
        type: 'jour',
        titre: `Journée ${dayDoc.date} — ${portfolio.titre}`,
        visibility: 'privee',
        document: dayDoc,
        promptPackage: pkgMeta,
        referentiel: refMeta,
        runMeta,
        serverId: null,
      })
      saved += 1
    }
    if (document) {
      await store.saveCartography({
        type: 'merge',
        titre: `Cartographie — ${portfolio.titre}`,
        visibility: 'privee',
        document,
        promptPackage: pkgMeta,
        referentiel: refMeta,
        runMeta,
        serverId: null,
      })
      saved += 1
    }
    return { saved }
  }

  async function launch() {
    setRunError(null)
    setSaveFallback(null)
    setMergeNotice(null)
    setFailedDays([])
    setCallInfo(null)
    setDayInfo(null)
    const controller = new AbortController()
    controllerRef.current = controller
    setRunState('running')
    try {
      // Mémorisation de la clé dans ce navigateur (avant le run) ; jamais sur le serveur (ADR-013).
      if (mode === 'cle' && providerDef?.requiresKey) {
        if (rememberKey) setLocalKey(providerId, apiKey.trim(), deps.keyStorage)
      }

      const bundle = bundleFactory({
        mode,
        provider: providerId,
        apiKey: apiKey.trim(),
        model: runModel,
        fetchFn: deps.fetchFn,
      })
      if (bundle.prime) await bundle.prime(controller.signal)

      if (!storageRef.current) storageRef.current = runStorageFactory()
      let localDaysDone = 0
      const result = await executeRun({
        runId: makeRunId(portfolio.id, selectedPackage, referentiel),
        dayGroups,
        referentiel,
        provider: bundle.provider,
        model: bundle.model,
        maxTokens: bundle.maxTokens,
        storage: storageRef.current,
        signal: controller.signal,
        now: deps.now,
        onResume: ({ done }) => {
          setResumedFrom(done)
          localDaysDone = done
          setDaysDone(done)
        },
        onDayStart: (info) => setDayInfo(info),
        onCall: (info) => {
          setCallInfo(info)
          if (info.done === info.total) {
            localDaysDone += 1
            setDaysDone(localDaysDone)
          }
        },
      })

      if (result.aborted) {
        setRunState('interrupted')
        return
      }
      if (result.status.remaining > 0) {
        setFailedDays(result.status.failed)
        setRunState('error')
        setRunError(
          'Certaines journées ont échoué. Les journées réussies sont checkpointées : ' +
            '« Reprendre » ne retentera que les journées manquantes.',
        )
        return
      }

      setRunState('saving')
      setMergeNotice(result.mergeError)
      setRunUsage(result.usage?.mesures > 0 ? result.usage : null)
      await saveResults(result.document, result.dayDocuments, result.usage)
      setRunState('done')
    } catch (err) {
      if (controller.signal.aborted || isAbortError(err)) {
        setRunState('interrupted')
        return
      }
      setRunState('error')
      setRunError(
        mode === 'humanome' ? describeDemoError(err).message : (err?.message ?? String(err)),
      )
    } finally {
      controllerRef.current = null
    }
  }

  function interrupt() {
    controllerRef.current?.abort()
  }

  // ---- Rendu ----------------------------------------------------------------

  const stepKey = STEPS[step].key

  return (
    <section className="run-wizard" aria-label="Nouveau run de cartographie">
      <h2>Nouveau run de cartographie</h2>
      <ol className="run-wizard-steps" data-testid="run-wizard-steps">
        {STEPS.map((s, i) => (
          <li
            key={s.key}
            aria-current={i === step ? 'step' : undefined}
            className={i === step ? 'step-active' : i < step ? 'step-done' : 'step-pending'}
          >
            {expert ? s.label : (s.simpleLabel ?? s.label)}
          </li>
        ))}
      </ol>

      {stepKey === 'portfolio' ? (
        <div className="run-step" data-testid="step-portfolio">
          <h3>1. Choisir le portfolio</h3>
          {portfolios === null ? (
            <p>Chargement des portfolios locaux…</p>
          ) : portfolios.length === 0 ? (
            <p>
              Aucun portfolio local. <a href="#/portfolio">Créez d’abord un portfolio</a> puis
              revenez lancer le run.
            </p>
          ) : (
            <ul className="run-portfolios">
              {portfolios.map((p) => {
                const groups = computeDayGroups(p.segments)
                return (
                  <li key={p.id}>
                    <label>
                      <input
                        type="radio"
                        name="run-portfolio"
                        checked={portfolioId === p.id}
                        onChange={() => setPortfolioId(p.id)}
                      />{' '}
                      <strong>{p.titre}</strong> — {groups.length} journée(s)
                      {groups.length === 0 ? ' (aucune journée segmentée : à découper dans le module portfolio)' : ''}
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}

      {stepKey === 'prompt' ? (
        <div className="run-step" data-testid="step-prompt">
          <h3>{expert ? '2. Version de prompt' : '2. Référentiel'}</h3>
          <ReferentielChoice value={refChoix} onChange={setRefChoix} list={deps.listReferentiels} />
          {referentielError ? (
            <p role="alert" className="load-error" data-testid="referentiel-error">
              {referentielError}
            </p>
          ) : null}
          {!expert ? (
            <p className="privacy-note" data-testid="run-protocol">
              Protocole : {BUILTIN_PACKAGE.id}@{BUILTIN_PACKAGE.version} (embarqué). Le mode expert, au
              bas du menu, propose les autres versions publiées.
            </p>
          ) : packages === null ? (
            <p>Chargement des versions publiées…</p>
          ) : (
            <>
              {packages.origin === 'embarque' ? (
                <p role="status" data-testid="packages-fallback">
                  Versions publiées indisponibles (API injoignable) : version embarquée proposée.
                </p>
              ) : null}
              <ul className="run-packages">
                {packages.packages.map((p) => {
                  const key = `${p.id}@${p.version}`
                  return (
                    <li key={key}>
                      <label>
                        <input
                          type="radio"
                          name="run-package"
                          checked={packageKey === key}
                          onChange={() => setPackageKey(key)}
                        />{' '}
                        <strong>
                          {p.id}@{p.version}
                        </strong>
                        {p.builtin ? ' (embarqué)' : ''} — {p.description ?? ''}
                      </label>
                    </li>
                  )
                })}
              </ul>
              <p className="privacy-note">
                v1 : le moteur exécute le protocole embarqué ; la version choisie est enregistrée
                avec la cartographie. L’exécution des paquets publiés arrive avec le banc d’essai
                promptologue (P10).
              </p>
            </>
          )}
        </div>
      ) : null}

      {stepKey === 'fournisseur' ? (
        <div className="run-step" data-testid="step-fournisseur">
          <h3>3. Fournisseur du modèle de langage</h3>
          <p>
            <label>
              <input
                type="radio"
                name="run-mode"
                checked={mode === 'cle'}
                onChange={() => setMode('cle')}
              />{' '}
              Clé personnelle (appel direct au fournisseur, la clé ne transite jamais par
              humanome)
            </label>
          </p>
          <p>
            <label>
              <input
                type="radio"
                name="run-mode"
                checked={mode === 'humanome'}
                onChange={() => setMode('humanome')}
              />{' '}
              Service humanome (modèle fourni par la plateforme, quotas anti-abus, preuve de
              travail)
            </label>
          </p>

          {mode === 'cle' ? (
            <fieldset className="run-key">
              <legend>Clé personnelle</legend>
              <p>
                <label>
                  Fournisseur{' '}
                  <select
                    value={providerId}
                    onChange={(event) => setProviderId(event.target.value)}
                    aria-label="Fournisseur"
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
              </p>
              {expert ? (
                <p>
                  <label>
                    Modèle{' '}
                    <input
                      type="text"
                      value={model}
                      onChange={(event) => setModel(event.target.value)}
                      aria-label="Modèle"
                    />
                  </label>
                </p>
              ) : null}
              {providerDef?.requiresKey ? (
                <>
                  <p>
                    <label>
                      Clé API{' '}
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(event) => setApiKey(event.target.value)}
                        autoComplete="off"
                        aria-label="Clé API"
                      />
                    </label>
                  </p>
                  <p>
                    <label>
                      <input
                        type="checkbox"
                        checked={rememberKey}
                        onChange={(event) => setRememberKey(event.target.checked)}
                      />{' '}
                      Mémoriser la clé dans ce navigateur (localStorage)
                    </label>
                  </p>
                  <p className="field-hint" data-testid="cle-reste-navigateur">
                    {KEY_STAYS_IN_BROWSER}
                  </p>
                </>
              ) : (
                <p className="field-hint">Ollama tourne en local : aucune clé requise.</p>
              )}
            </fieldset>
          ) : (
            <p className="privacy-note">
              Le service humanome impose son modèle et ses plafonds ; chaque appel résout une
              preuve de travail anti-robot. Aucun contenu n’est journalisé côté serveur
              (compteurs uniquement).
            </p>
          )}
        </div>
      ) : null}

      {stepKey === 'estimation' ? (
        <div className="run-step" data-testid="step-estimation">
          <h3>4. Estimation avant lancement</h3>
          {estimate ? (
            <>
              <ul data-testid="run-estimate">
                <li>
                  {estimate.days} journée(s) × {formatInt(estimate.avgDayChars)} caractères en
                  moyenne — {estimate.totalCalls} appels au modèle
                </li>
                <li>
                  ≈ {formatInt(estimate.tokensIn)} tokens d’entrée,{' '}
                  {formatInt(estimate.tokensOut)} tokens de sortie
                </li>
                <li>
                  Coût estimé :{' '}
                  {estimate.costUsd === null
                    ? 'inconnu pour ce modèle (hors table de prix indicative)'
                    : `≈ ${estimate.costUsd.toFixed(2)} $ US`}
                </li>
                <li>Durée estimée : ≈ {estimate.durationMin} min (appels séquentiels)</li>
              </ul>
              <p className="privacy-note">{estimate.disclaimer}</p>
              <p className="privacy-note">
                Estimation haute : elle compte aussi les {mergeNarrativeCallsFor(referentiel)} appels
                narratifs de fusion, qui ne seront exécutés qu’à partir du banc promptologue (P10) —
                ce run n’exécute que les appels journaliers.
              </p>
            </>
          ) : (
            <p>Estimation impossible : vérifiez le portfolio et le référentiel.</p>
          )}
        </div>
      ) : null}

      {stepKey === 'execution' ? (
        <div className="run-step" data-testid="step-execution">
          <h3>5. Exécution</h3>

          {runState === 'idle' ? (
            <>
              <p>
                {dayGroups.length} journée(s) à cartographier, checkpoint après chaque journée :
                vous pouvez interrompre puis reprendre, même après un rechargement de la page.
              </p>
              <p>
                <button type="button" className="button button-primary" onClick={launch}>
                  Lancer le run
                </button>
              </p>
            </>
          ) : null}

          {runState === 'running' ? (
            <>
              {resumedFrom > 0 ? (
                <p role="status" data-testid="run-resumed">
                  Repris à la journée {Math.min(resumedFrom + 1, dayGroups.length)}/
                  {dayGroups.length} : les {resumedFrom} journée(s) déjà checkpointée(s) sont
                  sautées.
                </p>
              ) : null}
              <p role="status" data-testid="run-progress">
                Journée {Math.min(daysDone + 1, dayGroups.length)}/{dayGroups.length}
                {dayInfo ? ` (${dayInfo.iso})` : ''} — appel{' '}
                {callInfo
                  ? `${Math.min(callInfo.done + 1, callInfo.total)}/${callInfo.total}`
                  : `1/${referentiel ? callsPerDayFor(referentiel) : '…'}`}
                {callInfo?.step === 'pole' && callInfo.poleNum ? ` (pôle ${callInfo.poleNum})` : ''}
              </p>
              <p>
                <button type="button" className="button" onClick={interrupt}>
                  Interrompre
                </button>
              </p>
              <p className="privacy-note">
                {mode === 'humanome'
                  ? 'Le texte du portfolio transite par le proxy humanome vers le modèle de la plateforme, sans y être conservé (journalisation par compteurs, jamais de contenu — RGPD §6)'
                  : 'Le texte du portfolio part vers le fournisseur choisi, jamais vers le serveur humanome (mode clé personnelle)'}{' '}
                ; les documents produits restent dans ce navigateur jusqu’à un partage
                explicite.
              </p>
            </>
          ) : null}

          {runState === 'interrupted' ? (
            <>
              <p role="status" data-testid="run-interrupted">
                Run interrompu. Les journées terminées sont checkpointées : la reprise sautera
                ce qui est déjà fait.
              </p>
              <p>
                <button type="button" className="button button-primary" onClick={launch}>
                  Reprendre le run
                </button>
              </p>
            </>
          ) : null}

          {runState === 'saving' ? <p role="status">Enregistrement des cartographies…</p> : null}

          {runState === 'error' ? (
            <>
              <p role="alert" className="load-error">
                {runError}
              </p>
              {failedDays.length > 0 ? (
                <ul>
                  {failedDays.map((f) => (
                    <li key={f.iso}>
                      {f.iso} : {f.error}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p>
                <button type="button" className="button button-primary" onClick={launch}>
                  Reprendre le run
                </button>
              </p>
            </>
          ) : null}

          {runState === 'done' ? (
            <>
              <p role="status" className="account-notice" data-testid="run-success">
                {mergeNotice
                  ? `Run terminé : ${dayGroups.length} document(s) jour enregistrés (visibilité « privée »).`
                  : `Cartographie terminée et enregistrée (${dayGroups.length} document(s) jour + le document merge, visibilité « privée »).`}
              </p>
              {mergeNotice ? (
                <p role="status" className="privacy-note" data-testid="run-merge-notice">
                  {mergeNotice}
                </p>
              ) : null}
              {runUsage ? (
                <p className="privacy-note" data-testid="run-usage">
                  Consommation réelle de cette session :{' '}
                  {new Intl.NumberFormat('fr-FR').format(runUsage.inputTokens)} tokens d’entrée /{' '}
                  {new Intl.NumberFormat('fr-FR').format(runUsage.outputTokens)} tokens de sortie
                  sur {runUsage.mesures} appel(s) — compteurs conservés avec la cartographie
                  (jamais le contenu).
                </p>
              ) : null}
              {saveFallback ? (
                <p>
                  Le stockage local des cartographies n’est pas encore disponible :{' '}
                  <a
                    download="cartographie.json"
                    href={`data:application/json;charset=utf-8,${encodeURIComponent(saveFallback)}`}
                  >
                    télécharger le résultat (JSON)
                  </a>
                  .
                </p>
              ) : null}
              <p>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => navigate('#/espace')}
                >
                  Retour à l’espace apprenant
                </button>
              </p>
            </>
          ) : null}
        </div>
      ) : null}

      <p className="run-wizard-nav">
        {step > 0 && stepKey !== 'execution' ? (
          <button type="button" className="button" onClick={() => setStep(step - 1)}>
            Retour
          </button>
        ) : null}
        {step > 0 && stepKey === 'execution' && runState === 'idle' ? (
          <button type="button" className="button" onClick={() => setStep(step - 1)}>
            Retour
          </button>
        ) : null}{' '}
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            className="button button-primary"
            disabled={!canLeaveStep[stepKey]}
            onClick={() => setStep(step + 1)}
          >
            Continuer
          </button>
        ) : null}
      </p>
    </section>
  )
}
