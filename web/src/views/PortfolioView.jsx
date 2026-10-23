import { useEffect, useRef, useState } from 'react'
import { mergeSegments, segmentText, splitSegment } from '@engine/portfolio/segment.js'
import PortfolioEditor from '../components/PortfolioEditor.jsx'
import { extractGdocId, fetchGdocText } from '../lib/gdoc.js'
import { retirerMarquesTwin9 } from '../lib/twin9/marques.js'
import { createPortfolioStore } from '../lib/portfolio-store.js'
import { isValidIsoDate } from '../router.js'

/** Ce que dit l'import d'un portfolio surligné par Twin9 (S3-3). */
const MARQUES_RETIREES = ' Ses surlignages et tableaux de traces de Twin9 ont été retirés : le texte analysé n’en porte jamais.'

/**
 * Module Portfolio (#/portfolio, P7) — entièrement côté client (cahier §4.2,
 * §6) : les textes sont saisis, segmentés en journées et conservés dans le
 * navigateur (IndexedDB « humanome-portfolios »), jamais envoyés au serveur.
 * Seule exception, explicite dans l'interface : l'import Google Docs, relayé
 * par l'API (le texte y transite sans y être conservé).
 *
 * Trois sources (P7.1) : copier-coller (éditeur ADR-010), fichier .txt/.md
 * (FileReader), URL Google Docs publique. La segmentation automatique
 * (engine/src/portfolio/segment.js) est ajustable : renommer la date d'une
 * journée, fusionner avec la précédente, scinder au curseur.
 *
 * @param {{
 *   store?: ReturnType<typeof createPortfolioStore>,
 *   fetchFn?: typeof fetch,
 *   today?: string,
 *   saveDelay?: number,
 * }} props test seams; défauts = IndexedDB réel, fetch réel, date du jour.
 */
export default function PortfolioView({ store, fetchFn, today, saveDelay = 600 }) {
  const [effectiveStore] = useState(() => store ?? createPortfolioStore())
  const [portfolios, setPortfolios] = useState(null) // null = chargement
  const [storageError, setStorageError] = useState(null)
  const [current, setCurrent] = useState(null)
  const [savedAt, setSavedAt] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [notice, setNotice] = useState(null) // {kind: 'info' | 'error', text}
  const [gdocUrl, setGdocUrl] = useState('')
  const [gdocBusy, setGdocBusy] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
  const [showCarto, setShowCarto] = useState(false)
  const [dirty, setDirty] = useState(0)

  const currentRef = useRef(null)
  currentRef.current = current
  const dirtyRef = useRef(false)
  const fileInputRef = useRef(null)

  const segmentOptions = today ? { today } : undefined

  // Liste des portfolios locaux au montage.
  useEffect(() => {
    let alive = true
    effectiveStore
      .list()
      .then((records) => {
        if (alive) setPortfolios(records)
      })
      .catch((error) => {
        if (!alive) return
        setPortfolios([])
        setStorageError(
          `Stockage local indisponible (${error.message}) : vous pouvez travailler sur un ` +
            'texte, mais il ne sera pas conservé à la fermeture de l’onglet.',
        )
      })
    return () => {
      alive = false
    }
  }, [effectiveStore])

  // Sauvegarde continue : toute modification est persistée localement après
  // une courte pause (ADR-010.3). Jamais de contenu vers le serveur (§6).
  useEffect(() => {
    if (dirty === 0) return undefined
    const timer = setTimeout(async () => {
      const record = currentRef.current
      if (!record) return
      try {
        const saved = await effectiveStore.save(record)
        dirtyRef.current = false
        setSaveError(null)
        setSavedAt(new Date(saved.updatedAt).toLocaleTimeString('fr-FR'))
        setCurrent((value) =>
          value && value.id === saved.id ? { ...value, updatedAt: saved.updatedAt } : value,
        )
        setPortfolios((list) => upsertSummary(list, saved))
      } catch (error) {
        setSaveError(`La sauvegarde locale a échoué : ${error.message}`)
      }
    }, saveDelay)
    return () => clearTimeout(timer)
  }, [dirty, saveDelay, effectiveStore])

  /** Enregistre une modification du portfolio courant (sauvegarde différée). */
  function touch(next) {
    dirtyRef.current = true
    currentRef.current = next
    setCurrent(next)
    setDirty((value) => value + 1)
  }

  /** Sauvegarde immédiate avant de quitter le portfolio courant. */
  function flushPendingSave() {
    if (dirtyRef.current && currentRef.current) {
      dirtyRef.current = false
      effectiveStore.save(currentRef.current).catch(() => {})
    }
  }

  /**
   * Remplace le texte : re-segmentation automatique + sauvegarde différée. Les
   * marques d'un portfolio surligné par Twin9 (S3-3) n'y entrent jamais, d'où
   * qu'il vienne (fichier, Google Docs, texte collé ou écrit) : c'est le texte
   * analysé. Rend vrai si des marques ont été retirées.
   */
  function applyTexte(texte, extra = {}) {
    const base = currentRef.current
    if (!base) return false
    const nettoye = retirerMarquesTwin9(texte)
    touch({ ...base, ...extra, texte: nettoye.texte, segments: segmentText(nettoye.texte, segmentOptions) })
    return nettoye.retire
  }

  async function handleCreate() {
    flushPendingSave()
    setNotice(null)
    setShowCarto(false)
    setSavedAt(null)
    try {
      const record = await effectiveStore.create()
      setPortfolios((list) => upsertSummary(list, record))
      setCurrent(record)
    } catch {
      // Stockage indisponible : portfolio de travail en mémoire seulement.
      const stamp = new Date().toISOString()
      setCurrent({
        id: `memoire-${Date.now()}`,
        titre: 'Portfolio sans titre',
        source: 'colle',
        texte: '',
        segments: [],
        createdAt: stamp,
        updatedAt: stamp,
      })
    }
  }

  async function handleSelect(id) {
    flushPendingSave()
    setNotice(null)
    setShowCarto(false)
    setSavedAt(null)
    setPendingDeleteId(null)
    try {
      const record = await effectiveStore.get(id)
      if (record) setCurrent(record)
    } catch (error) {
      setNotice({ kind: 'error', text: `Impossible d’ouvrir ce portfolio : ${error.message}` })
    }
  }

  async function handleDelete(id) {
    if (pendingDeleteId !== id) {
      setPendingDeleteId(id)
      return
    }
    setPendingDeleteId(null)
    try {
      await effectiveStore.remove(id)
      setPortfolios((list) => (list ?? []).filter((p) => p.id !== id))
      if (currentRef.current?.id === id) {
        dirtyRef.current = false
        setCurrent(null)
      }
    } catch (error) {
      setNotice({ kind: 'error', text: `Suppression impossible : ${error.message}` })
    }
  }

  async function handleFile(file) {
    if (!file) return
    setNotice(null)
    try {
      const texte = await file.text()
      const extra = { source: 'fichier' }
      if (currentRef.current?.titre === 'Portfolio sans titre') {
        extra.titre = file.name.replace(/\.(txt|md|markdown)$/i, '')
      }
      const retire = applyTexte(texte, extra)
      setNotice({
        kind: 'info',
        text: `Fichier « ${file.name} » importé (${texte.length.toLocaleString('fr-FR')} caractères), lu localement par votre navigateur.${retire ? MARQUES_RETIREES : ''}`,
      })
    } catch (error) {
      setNotice({ kind: 'error', text: `Lecture du fichier impossible : ${error.message}` })
    }
  }

  async function handleGdocImport(event) {
    event.preventDefault()
    setNotice(null)
    const docId = extractGdocId(gdocUrl)
    if (!docId) {
      setNotice({
        kind: 'error',
        text: 'URL non reconnue : collez le lien complet du document (https://docs.google.com/document/d/…).',
      })
      return
    }
    setGdocBusy(true)
    try {
      const texte = await fetchGdocText(docId, fetchFn ? { fetchFn } : undefined)
      const retire = applyTexte(texte, { source: 'gdocs' })
      setNotice({
        kind: 'info',
        text:
          `Document importé (${texte.length.toLocaleString('fr-FR')} caractères). ` +
          'Il est maintenant stocké localement dans votre navigateur ; le serveur n’en conserve aucune copie.' +
          (retire ? MARQUES_RETIREES : ''),
      })
    } catch (error) {
      setNotice({ kind: 'error', text: error.message })
    } finally {
      setGdocBusy(false)
    }
  }

  function handleDateCommit(index, date) {
    const base = currentRef.current
    if (!base) return
    const segments = base.segments.map((segment, i) =>
      i === index ? { ...segment, date } : segment,
    )
    touch({ ...base, segments })
  }

  function handleMerge(index) {
    const base = currentRef.current
    if (!base) return
    touch({ ...base, segments: mergeSegments(base.segments, index, base.texte) })
  }

  function handleSplit(index, offset) {
    const base = currentRef.current
    if (!base) return
    try {
      touch({ ...base, segments: splitSegment(base.segments, index, offset) })
    } catch {
      setNotice({
        kind: 'error',
        text: 'Pour scinder, placez le curseur à l’intérieur du texte de la journée (ni tout début, ni toute fin).',
      })
    }
  }

  function handleExport() {
    const record = currentRef.current
    if (!record) return
    try {
      const blob = new Blob([record.texte], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${slugify(record.titre)}.md`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      setNotice({ kind: 'error', text: `Export impossible : ${error.message}` })
    }
  }

  const list = portfolios ?? []

  return (
    <div className="portfolio">
      <h1>Portfolio</h1>
      <p className="portfolio-banner" role="note">
        <strong>Vos textes ne quittent pas ce navigateur.</strong> Ils sont enregistrés
        localement (IndexedDB) et ne sont jamais envoyés au serveur. Seule exception, choisie
        explicitement : l’import Google Docs, dont le texte transite par le serveur sans y être
        conservé.
      </p>

      {storageError ? (
        <p className="load-error" role="alert">
          {storageError}
        </p>
      ) : null}

      <div className="portfolio-layout">
        <aside className="portfolio-sidebar" aria-label="Mes portfolios">
          <h2>Mes portfolios</h2>
          {portfolios === null ? <p className="portfolio-muted">Chargement…</p> : null}
          {portfolios !== null && list.length === 0 ? (
            <p className="portfolio-muted">Aucun portfolio pour l’instant.</p>
          ) : null}
          <ul className="portfolio-list">
            {list.map((portfolio) => (
              <li key={portfolio.id} className="portfolio-list-item">
                <button
                  type="button"
                  className={`portfolio-list-open${
                    current?.id === portfolio.id ? ' portfolio-list-open-active' : ''
                  }`}
                  onClick={() => handleSelect(portfolio.id)}
                >
                  {portfolio.titre}
                </button>
                <button
                  type="button"
                  className="button button-danger portfolio-list-delete"
                  onClick={() => handleDelete(portfolio.id)}
                >
                  {pendingDeleteId === portfolio.id ? 'Confirmer la suppression' : 'Supprimer'}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="button button-primary" onClick={handleCreate}>
            Nouveau portfolio
          </button>
        </aside>

        <section className="portfolio-main">
          {current === null ? (
            <p className="portfolio-empty">
              Créez un portfolio (ou ouvrez-en un) pour coller votre journal de bord, importer
              un fichier <code>.txt</code>/<code>.md</code> ou un Google Docs public, puis
              ajuster son découpage en journées.
            </p>
          ) : (
            <>
              <label className="portfolio-title-label">
                Titre du portfolio
                <input
                  type="text"
                  className="portfolio-title-input"
                  value={current.titre}
                  onChange={(event) => touch({ ...current, titre: event.target.value })}
                />
              </label>

              <h2>1. Coller ou écrire votre texte</h2>
              <PortfolioEditor
                value={current.texte}
                onChange={(texte) => applyTexte(texte)}
                statusText={
                  saveError ?? (savedAt ? `Enregistré localement à ${savedAt}` : null)
                }
              />

              <div className="portfolio-sources">
                <section className="portfolio-source" aria-label="Importer un fichier">
                  <h2>2. Importer un fichier (.txt, .md)</h2>
                  <p className="privacy-note">
                    Le fichier est lu directement par votre navigateur, sans transfert.
                  </p>
                  <button
                    type="button"
                    className="button"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choisir un fichier…
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.markdown,text/plain,text/markdown"
                    className="visually-hidden"
                    aria-label="Importer un fichier .txt ou .md"
                    onChange={(event) => {
                      handleFile(event.target.files?.[0])
                      event.target.value = ''
                    }}
                  />
                </section>

                <section className="portfolio-source" aria-label="Importer depuis Google Docs">
                  <h2>3. Importer depuis Google Docs</h2>
                  <p className="privacy-note">
                    Pour cette source uniquement, le texte transite par le serveur humanome.xyz
                    afin de contourner les restrictions techniques de Google — il n’y est jamais
                    conservé. Le document doit être public ou partagé « en lecture » par lien.
                  </p>
                  <form className="portfolio-gdoc-form" onSubmit={handleGdocImport}>
                    <label>
                      URL du document Google Docs
                      <input
                        type="url"
                        inputMode="url"
                        placeholder="https://docs.google.com/document/d/…"
                        value={gdocUrl}
                        onChange={(event) => setGdocUrl(event.target.value)}
                      />
                    </label>
                    <button type="submit" className="button" disabled={gdocBusy}>
                      {gdocBusy ? 'Import en cours…' : 'Importer le document'}
                    </button>
                  </form>
                </section>
              </div>

              {notice ? (
                <p
                  className={notice.kind === 'error' ? 'load-error' : 'portfolio-notice'}
                  role={notice.kind === 'error' ? 'alert' : 'status'}
                >
                  {notice.text}
                </p>
              ) : null}

              <section className="portfolio-days" aria-label="Découpage en journées">
                <h2>Découpage en journées ({current.segments.length})</h2>
                <p className="portfolio-muted">
                  Le découpage est recalculé automatiquement à chaque modification du texte
                  (les ajustements manuels ci-dessous sont alors réinitialisés). Renommez la
                  date d’une journée, fusionnez-la avec la précédente ou scindez-la au curseur.
                </p>
                {current.segments.length === 0 ? (
                  <p className="portfolio-muted">
                    Aucune journée : le découpage apparaîtra dès que le texte n’est plus vide.
                  </p>
                ) : (
                  <ol className="portfolio-day-list">
                    {current.segments.map((segment, index) => (
                      <DayItem
                        key={`${segment.debut}-${segment.fin}-${index}`}
                        segment={segment}
                        index={index}
                        onDateCommit={handleDateCommit}
                        onMerge={handleMerge}
                        onSplit={handleSplit}
                      />
                    ))}
                  </ol>
                )}
              </section>

              <div className="portfolio-actions">
                <button type="button" className="button" onClick={handleExport}>
                  Exporter (.md)
                </button>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => setShowCarto(true)}
                >
                  Cartographier
                </button>
              </div>

              {showCarto ? (
                <section className="portfolio-carto" role="status" aria-label="Cartographier">
                  <h3>Cartographier ce portfolio</h3>
                  {/* Les trois chemins réels (UC-APP-01 A-03, corrigée le
                      2026-10-22) : l'échelle standard → premium → essai du menu. */}
                  <ul className="portfolio-carto-paths">
                    <li>
                      <a href="#/espace/nouveau-run">Cartographier mes écrits</a> (standard) :
                      l’assistant de l’espace apprenant vous fait choisir ce portfolio, le
                      référentiel et le fournisseur, et estime le coût avant de lancer.
                    </li>
                    <li>
                      <a href="#/twin9">Analyse approfondie</a> (premium, Twin9) : choisissez ce
                      portfolio parmi « Mes portfolios » ; la page annonce le coût et la durée
                      estimés avant tout lancement.
                    </li>
                    <li>
                      <a href="#/essayer">Essayer</a> (gratuit, sans compte) : collez une page de
                      votre journal pour une cartographie en direct, que rien ne conserve.
                    </li>
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  )
}

/**
 * Une journée du découpage : date renommable (AAAA-MM-JJ), texte en lecture
 * seule (le texte s'édite dans l'éditeur principal pour garder des offsets
 * exacts), fusion avec la précédente, scission au curseur.
 */
function DayItem({ segment, index, onDateCommit, onMerge, onSplit }) {
  const [draft, setDraft] = useState(segment.date ?? '')
  const [invalid, setInvalid] = useState(false)
  const textareaRef = useRef(null)

  // Resynchronise le champ quand la segmentation est recalculée.
  useEffect(() => {
    setDraft(segment.date ?? '')
    setInvalid(false)
  }, [segment.date, segment.debut, segment.fin])

  function commit() {
    const value = draft.trim()
    if (value === '') {
      setInvalid(false)
      if (segment.date !== null) onDateCommit(index, null)
      return
    }
    if (!isValidIsoDate(value)) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    if (value !== segment.date) onDateCommit(index, value)
  }

  const label = segment.date ?? segment.titre ?? `journée ${index + 1}`

  return (
    <li className="portfolio-day">
      <div className="portfolio-day-head">
        <label className="portfolio-day-date">
          Date (AAAA-MM-JJ)
          <input
            type="text"
            inputMode="numeric"
            placeholder="AAAA-MM-JJ"
            value={draft}
            aria-invalid={invalid}
            aria-label={`Date de la journée ${index + 1}`}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commit()
              }
            }}
          />
        </label>
        {segment.titre ? <span className="portfolio-day-titre">{segment.titre}</span> : null}
        <span className="portfolio-day-meta">
          {segment.texte.length.toLocaleString('fr-FR')} caractères
        </span>
      </div>
      {invalid ? (
        <p className="load-error" role="alert">
          Date invalide : utilisez le format AAAA-MM-JJ (ou videz le champ si la journée n’est
          pas datée).
        </p>
      ) : null}
      <textarea
        ref={textareaRef}
        className="portfolio-day-texte"
        value={segment.texte}
        readOnly
        aria-label={`Texte de la journée ${label}`}
      />
      <div className="portfolio-day-actions">
        {index > 0 ? (
          <button type="button" className="button" onClick={() => onMerge(index)}>
            Fusionner avec la journée précédente
          </button>
        ) : null}
        <button
          type="button"
          className="button"
          onClick={() => onSplit(index, textareaRef.current?.selectionStart ?? 0)}
        >
          Scinder au curseur
        </button>
      </div>
    </li>
  )
}

/** Met à jour (ou insère) le résumé d'un portfolio dans la liste, triée. */
function upsertSummary(list, record) {
  const next = (list ?? []).filter((p) => p.id !== record.id)
  next.unshift({ ...record })
  return next.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
}

/** @returns {string} nom de fichier sûr dérivé du titre */
function slugify(titre) {
  const slug = String(titre)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return slug === '' ? 'portfolio' : slug
}
