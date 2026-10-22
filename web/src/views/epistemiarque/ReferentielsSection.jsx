// Atelier épistémiarque, section « Autres référentiels » (T15, UC-EPI-05) —
// #/epistemiarque/referentiels. Un référentiel d'une autre structure que
// RESPIRE s'importe en brouillon, au niveau qui tient lieu de compétence ; il
// se soumet au vote, se lit (« Voir »), se vote et se publie à la majorité,
// comme une version.
// RESPIRE, lui, s'édite compétence par compétence dans l'atelier.
//
// S5, lot D (2026-10-22) : concevoir un référentiel simplement. Deux modèles à
// télécharger (Markdown, et JSON commenté dans la page) ; un texte Markdown au
// format des fiches de pôle du moteur, collé, écrit ou choisi, lu dans la page
// (lib/referentiel-markdown.js) avec son aperçu, ses erreurs à leur ligne et
// les motifs déduits de ses codes, modifiables, puis importé par la même route
// que le JSON ; enfin tout référentiel publié, RESPIRE compris, exporté en
// Markdown pour partir d'un existant.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, ApiUnavailableError } from '../../api/client.js'
import { downloadBlob } from '../../lib/download-json.js'
import {
  ErreurMarkdown,
  MODELE_JSON,
  MODELE_MARKDOWN,
  referentielDepuisMarkdown,
  referentielEnMarkdown,
} from '../../lib/referentiel-markdown.js'

const RESPIRE = 'respire'

const VOTES = [
  ['pour', 'Pour'],
  ['contre', 'Contre'],
  ['abstention', 'Abstention'],
]

/** Le Markdown en cours : son texte, les trois champs, les noms et motifs saisis par niveau, le niveau choisi. */
const MARKDOWN_VIDE = { texte: '', id: '', version: '', label: '', niveaux: [], niveau: '' }

/** Le modèle JSON, commenté champ par champ dans la page (un JSON n'a pas de commentaires). */
const CHAMPS_DU_MODELE = [
  ['schemaVersion', '« 2.1.0 », la version du schéma auquel le document se conforme.'],
  ['kind', 'Toujours « referentiel ».'],
  ['id', 'L’identifiant du référentiel, le même d’une version à l’autre : minuscules, chiffres, « . », « _ » ou « - ».'],
  ['version', 'Un semver (1.0.0). Une version publiée ne change plus : une correction en prend une nouvelle.'],
  ['label', 'Le libellé affiché, par exemple « Mon référentiel V2 ».'],
  ['contentHash', 'Facultatif à l’import : le serveur calcule l’empreinte des pôles et des compétences.'],
  ['source', 'La provenance : auteurs, date, licence (une licence CC-BY-SA demande de citer l’original).'],
  ['niveaux', 'Du plus large au plus fin, le nom de chaque niveau et le motif de ses codes, une expression régulière sans ancres ; le premier tient lieu de compétence, le suivant est celui des « elements ».'],
  ['poles', 'Numérotés de 1 à N sans trou : numéro, nom, couleur (« #rrggbb » ou null), description facultative.'],
  ['competences', 'Code, nom, numéro du pôle, description facultative (Markdown), et ses « elements » : code, nom, description et leurs propres éléments.'],
]

/** Un lien qui télécharge un texte, sans requête. */
const lienDe = (texte, type) => `data:${type};charset=utf-8,${encodeURIComponent(texte)}`

/** Une erreur ou un avertissement du Markdown, à sa ligne. */
const aSaLigne = (e) => (e.ligne === null ? e.message : `Ligne ${e.ligne} : ${e.message}`)

/** Le nombre d'éléments plus fins que les compétences. */
const elementsDe = (noeuds) =>
  noeuds.reduce((n, noeud) => n + (Array.isArray(noeud.elements) ? noeud.elements.length + elementsDe(noeud.elements) : 0), 0)

function messageDe(error) {
  if (error instanceof ApiUnavailableError) return error.message
  if (error instanceof ApiError) return error.serverMessage ?? error.message
  if (error instanceof ErreurMarkdown) return error.message
  return 'Une erreur est survenue. Réessayez.'
}

function titre(version) {
  return `${version.label} — ${version.referentielId} ${version.semver}`
}

function decompte(tally) {
  if (!tally) return null
  const issue = { adopted: 'majorité atteinte', rejected: 'rejetée', pending: 'en cours', blocked: 'aucun électeur' }
  return (
    <span className={`epi-chip epi-chip-${tally.outcome}`}>
      {tally.pour}/{tally.threshold ?? '—'} pour · {issue[tally.outcome] ?? tally.outcome}
    </span>
  )
}

/**
 * @param {{api: ReturnType<typeof import('./api.js').createEpistemiarqueApi>, canVote: boolean}} props
 *   canVote : les membres épistémiarques votent ; un administrateur importe, soumet et publie.
 */
export default function ReferentielsSection({ api, canVote }) {
  const [etat, setEtat] = useState({ status: 'loading' })
  const [cle, setCle] = useState(0)
  const [note, setNote] = useState(null)
  const [fichier, setFichier] = useState(null)
  const [niveau, setNiveau] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [apercu, setApercu] = useState(null)
  const [md, setMd] = useState(MARKDOWN_VIDE)
  const [exporte, setExporte] = useState('')

  useEffect(() => {
    let vivant = true
    Promise.all([api.listDrafts(), api.listCatalogue()])
      .then(([versions, catalogue]) => {
        if (!vivant) return
        const publies = Array.isArray(catalogue) ? catalogue : []
        setEtat({
          status: 'ready',
          versions: (Array.isArray(versions) ? versions : []).filter((v) => v.referentielId !== RESPIRE),
          catalogue: publies.filter((r) => r.id !== RESPIRE),
          // l'export en Markdown part de tout référentiel publié, RESPIRE compris
          publies,
        })
      })
      .catch((error) => {
        if (vivant) setEtat({ status: 'error', message: messageDe(error) })
      })
    return () => {
      vivant = false
    }
  }, [api, cle])

  const recharger = useCallback(() => setCle((k) => k + 1), [])

  const lire = async (event) => {
    const file = event.target.files?.[0] ?? null
    setNote(null)
    setFichier(null)
    if (!file) return
    try {
      const document = JSON.parse(await file.text())
      const niveaux = (Array.isArray(document?.niveaux) ? document.niveaux : [])
        .map((n) => n?.nom)
        .filter((nom) => typeof nom === 'string' && nom !== '')
      setFichier({ nom: file.name, document, niveaux })
      setNiveau(niveaux[0] ?? '')
    } catch {
      setNote({ erreur: true, texte: `« ${file.name} » n’est pas un fichier JSON lisible.` })
    }
  }

  const annoncer = (brouillon) => {
    const { competences = [], poles = [] } = brouillon.content ?? {}
    setNote({
      erreur: false,
      texte: `Brouillon « ${brouillon.referentielId} » ${brouillon.semver} importé : ${competences.length} compétences en ${poles.length} pôles.`,
    })
  }

  const importer = async (event) => {
    event.preventDefault()
    if (!fichier || occupe) return
    setOccupe(true)
    setNote(null)
    try {
      annoncer(await api.importReferentiel(fichier.document, fichier.niveaux.length > 1 ? niveau : null))
      setFichier(null)
      event.target.reset?.()
      recharger()
    } catch (error) {
      setNote({ erreur: true, texte: messageDe(error), details: error?.errors ?? null })
      // le fichier refusé est écarté : choisi de nouveau, même sous le même nom (sans quoi le
      // navigateur ne signale aucun changement), c'est sa version corrigée qui part
      setFichier(null)
      event.target.reset?.()
    } finally {
      setOccupe(false)
    }
  }

  // Le Markdown, relu à chaque frappe : aperçu, erreurs, motifs déduits.
  const lecture = useMemo(
    () =>
      md.texte.trim() === ''
        ? null
        : referentielDepuisMarkdown(md.texte, { id: md.id, version: md.version, label: md.label, niveaux: md.niveaux }),
    [md.texte, md.id, md.version, md.label, md.niveaux],
  )
  const nomsMd = lecture ? lecture.niveaux.map((n) => n.nom) : []
  const niveauMd = nomsMd.includes(md.niveau) ? md.niveau : (nomsMd[0] ?? '')

  const changerMd = (champ) => (event) => {
    const valeur = event.target.value
    setMd((m) => ({ ...m, [champ]: valeur }))
  }

  /** Le nom ou le motif saisi pour le niveau k ; `undefined` reprend celui du texte. */
  const saisirNiveau = (k, cle, valeur) =>
    setMd((m) => {
      const niveaux = [...m.niveaux]
      niveaux[k] = { ...(niveaux[k] ?? {}), [cle]: valeur }
      return { ...m, niveaux }
    })

  const lireMarkdown = async (event) => {
    const file = event.target.files?.[0] ?? null
    if (!file) return
    setNote(null)
    try {
      const texte = await file.text()
      setMd((m) => ({ ...m, texte }))
    } catch {
      setNote({ erreur: true, texte: `« ${file.name} » ne se lit pas.` })
    }
  }

  const importerMarkdown = async (event) => {
    event.preventDefault()
    if (!lecture?.document || occupe) return
    setOccupe(true)
    setNote(null)
    try {
      annoncer(await api.importReferentiel(lecture.document, nomsMd.length > 1 ? niveauMd : null))
      setMd(MARKDOWN_VIDE)
      event.target.reset?.()
      recharger()
    } catch (error) {
      // le texte reste : on le corrige sur place, puis on l'importe de nouveau
      setNote({ erreur: true, texte: messageDe(error), details: error?.errors ?? null })
    } finally {
      setOccupe(false)
    }
  }

  const exportables =
    etat.status === 'ready'
      ? etat.publies.flatMap((r) =>
          (Array.isArray(r.versions) ? r.versions : []).map((semver) => ({
            valeur: `${r.id}@${semver}`,
            id: r.id,
            semver,
            libelle: `${r.label} — ${r.id} ${semver}`,
          })),
        )
      : []
  const aExporter = exportables.find((x) => x.valeur === exporte) ?? exportables[0] ?? null

  const exporter = async (event) => {
    event.preventDefault()
    if (!aExporter || occupe) return
    setOccupe(true)
    setNote(null)
    try {
      const texte = referentielEnMarkdown(await api.getPublishedVersion(aExporter.id, aExporter.semver))
      const nom = `${aExporter.id}-v${aExporter.semver}.md`
      const parti = downloadBlob(new Blob([texte], { type: 'text/markdown;charset=utf-8' }), nom)
      setNote(
        parti
          ? { erreur: false, texte: `« ${aExporter.id} » ${aExporter.semver} exporté en Markdown : ${nom}.` }
          : { erreur: true, texte: 'Ce navigateur ne permet pas le téléchargement.' },
      )
    } catch (error) {
      setNote({ erreur: true, texte: messageDe(error) })
    } finally {
      setOccupe(false)
    }
  }

  // Le document d'une version listée, à lire avant de voter (ou de soumettre).
  const basculer = (id) => {
    if (apercu?.id === id) {
      setApercu(null)
      return
    }
    setApercu({ id, status: 'loading' })
    api
      .getDraft(id)
      .then((version) => setApercu((a) => (a?.id === id ? { id, status: 'ready', content: version.content } : a)))
      .catch((error) => setApercu((a) => (a?.id === id ? { id, status: 'error', message: messageDe(error) } : a)))
  }

  const contenuDe = (id) => {
    if (apercu?.id !== id) return null
    if (apercu.status === 'loading') return <p role="status">Chargement du document…</p>
    if (apercu.status === 'error') return <p className="load-error">{apercu.message}</p>
    const competences = Array.isArray(apercu.content?.competences) ? apercu.content.competences : []
    return (
      <ul className="epi-list" aria-label="Document">
        {(Array.isArray(apercu.content?.poles) ? apercu.content.poles : []).map((pole) => (
          <li key={pole.num}>
            {`${pole.num} · ${pole.nom}`}
            <ul>
              {competences
                .filter((c) => c.pole === pole.num)
                .map((c) => (
                  <li key={c.code}>{`${c.code} — ${c.nom}`}</li>
                ))}
            </ul>
          </li>
        ))}
      </ul>
    )
  }

  const voir = (id) => (
    <button type="button" aria-expanded={apercu?.id === id} onClick={() => basculer(id)}>
      {apercu?.id === id ? 'Masquer' : 'Voir'}
    </button>
  )

  const agir = async (action, reussite) => {
    setOccupe(true)
    setNote(null)
    try {
      await action()
      setNote({ erreur: false, texte: reussite })
      recharger()
    } catch (error) {
      setNote({ erreur: true, texte: messageDe(error) })
    } finally {
      setOccupe(false)
    }
  }

  let listes = null
  if (etat.status === 'loading') {
    listes = <p role="status">Chargement des référentiels…</p>
  } else if (etat.status === 'error') {
    listes = (
      <p role="alert" className="load-error">
        {etat.message}
      </p>
    )
  } else {
    const auVote = etat.versions.filter((v) => v.status === 'review')
    const brouillons = etat.versions.filter((v) => v.status === 'draft')
    listes = (
      <>
        {auVote.length > 0 && (
          <section className="epi-block" aria-label="Référentiels au vote">
            <h3>Au vote</h3>
            <ul className="epi-list">
              {auVote.map((p) => (
                <li key={p.id} className="epi-list-item">
                  <span className="epi-list-title">{titre(p)}</span> {decompte(p.tally)} {voir(p.id)}{' '}
                  {canVote &&
                    VOTES.map(([vote, libelle]) => (
                      <button
                        key={vote}
                        type="button"
                        disabled={occupe}
                        onClick={() => agir(() => api.vote(p.id, vote), `Vote « ${libelle.toLowerCase()} » enregistré.`)}
                      >
                        {libelle}
                      </button>
                    ))}{' '}
                  <button
                    type="button"
                    disabled={occupe}
                    onClick={() => agir(() => api.withdrawDraft(p.id), `« ${p.referentielId} » ${p.semver} retiré du vote.`)}
                  >
                    Retirer
                  </button>
                  {p.tally?.reached && (
                    <button
                      type="button"
                      disabled={occupe}
                      onClick={() => agir(() => api.publishDraft(p.id, null), `« ${p.referentielId} » ${p.semver} publié.`)}
                    >
                      Publier
                    </button>
                  )}
                  {contenuDe(p.id)}
                </li>
              ))}
            </ul>
          </section>
        )}
        {brouillons.length > 0 && (
          <section className="epi-block" aria-label="Brouillons de référentiel">
            <h3>Brouillons</h3>
            <ul className="epi-list">
              {brouillons.map((d) => (
                <li key={d.id} className="epi-list-item">
                  <span className="epi-list-title">{titre(d)}</span> {voir(d.id)}{' '}
                  <button
                    type="button"
                    disabled={occupe}
                    onClick={() => agir(() => api.submitDraft(d.id), `« ${d.referentielId} » ${d.semver} soumis au vote.`)}
                  >
                    Soumettre au vote
                  </button>
                  {contenuDe(d.id)}
                </li>
              ))}
            </ul>
          </section>
        )}
        {etat.catalogue.length > 0 && (
          <section className="epi-block" aria-label="Référentiels publiés">
            <h3>Publiés</h3>
            <ul className="epi-list">
              {etat.catalogue.map((r) => (
                <li key={r.id} className="epi-list-item">
                  {r.label} — {r.id} {r.versions.join(', ')}
                </li>
              ))}
            </ul>
          </section>
        )}
        {auVote.length + brouillons.length + etat.catalogue.length === 0 && <p>Aucun autre référentiel pour l’instant.</p>}
      </>
    )
  }

  return (
    <div className="epi-referentiels">
      <p>
        <a href="#/epistemiarque">Retour à l’atelier</a>
      </p>
      <h2>Autres référentiels</h2>
      <p className="epi-intro">
        Un référentiel d’une autre structure que RESPIRE s’importe en brouillon, depuis un fichier JSON au format du
        référentiel ou depuis un texte Markdown au format des fiches de pôle, au niveau qui tient lieu de compétence ;
        il se vote et se publie ensuite comme une version.
      </p>
      <section className="epi-block epi-modele" aria-label="Modèles de référentiel">
        <h3>Modèles</h3>
        <p>
          Télécharger un modèle :{' '}
          <a href={lienDe(MODELE_MARKDOWN, 'text/markdown')} download="modele-referentiel.md">
            en Markdown
          </a>{' '}
          ·{' '}
          <a href={lienDe(MODELE_JSON, 'application/json')} download="modele-referentiel.json">
            en JSON
          </a>
          . Les deux décrivent le même référentiel fictif, à deux pôles et deux niveaux.
        </p>
        <p className="epi-hint">
          Un pôle dont le premier mot est, en capitales, celui d’un pôle de RESPIRE (TÊTE, CŒUR, MAIN, ÂME, RACINES,
          CITÉ, FLAMBEAU) reçoit dans l’analyse approfondie (Twin9) les jurés de ce pôle de RESPIRE.
        </p>
        <details>
          <summary>Le modèle JSON, champ par champ</summary>
          <pre>{MODELE_JSON}</pre>
          <dl>
            {CHAMPS_DU_MODELE.map(([champ, sens]) => (
              <div key={champ}>
                <dt>{champ}</dt>
                <dd>{sens}</dd>
              </div>
            ))}
          </dl>
        </details>
      </section>
      <form className="epi-block" aria-label="Importer un référentiel" onSubmit={importer}>
        <label>
          Fichier du référentiel <input type="file" accept=".json,application/json" onChange={lire} />
        </label>
        {fichier && fichier.niveaux.length > 1 && (
          <label>
            {' '}
            Niveau qui tient lieu de compétence{' '}
            <select value={niveau} onChange={(e) => setNiveau(e.target.value)}>
              {fichier.niveaux.map((nom) => (
                <option key={nom} value={nom}>
                  {nom}
                </option>
              ))}
            </select>
          </label>
        )}{' '}
        <button type="submit" disabled={!fichier || occupe}>
          Importer
        </button>
      </form>
      <form className="epi-block epi-markdown" aria-label="Écrire un référentiel en Markdown" onSubmit={importerMarkdown}>
        <h3>En Markdown</h3>
        <p className="epi-hint">
          « # Pôle N — Nom » ouvre un pôle, « ## CODE — Nom » une compétence, « ### CODE — Nom » un élément plus fin ;
          le texte sous un titre le décrit. Collez le texte, écrivez-le ou choisissez un fichier : l’aperçu suit chaque
          frappe, et le motif de chaque niveau se déduit de ses codes.
        </p>
        <label>
          Fichier Markdown <input type="file" accept=".md,.markdown,text/markdown,text/plain" onChange={lireMarkdown} />
        </label>
        <label className="epi-field">
          Texte Markdown du référentiel
          <textarea value={md.texte} onChange={changerMd('texte')} rows={14} spellCheck={false} />
        </label>
        <div className="epi-md-champs">
          <label>
            Identifiant <input value={md.id} onChange={changerMd('id')} placeholder="mon-referentiel" />
          </label>
          <label>
            Libellé <input value={md.label} onChange={changerMd('label')} placeholder="Mon référentiel" />
          </label>
          <label>
            Version <input value={md.version} onChange={changerMd('version')} placeholder="1.0.0" />
          </label>
        </div>
        {lecture && (
          <div className="epi-md-apercu">
            <p>
              {`Aperçu : ${lecture.analyse.poles.length} pôles, ${lecture.analyse.competences.length} compétences`}
              {elementsDe(lecture.analyse.competences) > 0 &&
                `, ${elementsDe(lecture.analyse.competences)} éléments plus fins`}
              .
            </p>
            <ul className="epi-list" aria-label="Pôles lus">
              {lecture.analyse.poles.map((pole) => (
                <li key={pole.num}>
                  {`${pole.num} · ${pole.nom} — ${lecture.analyse.competences.filter((c) => c.pole === pole.num).length} compétences`}
                </li>
              ))}
            </ul>
            {lecture.niveaux.map((n, k) => (
              <div key={k} className="epi-md-niveau">
                <label>
                  Nom du niveau {k + 1}{' '}
                  <input
                    value={md.niveaux[k]?.nom ?? lecture.analyse.niveaux[k].nom}
                    onChange={(e) => saisirNiveau(k, 'nom', e.target.value)}
                  />
                </label>
                <label>
                  Motif du niveau {k + 1}{' '}
                  <input
                    value={md.niveaux[k]?.motif ?? lecture.analyse.niveaux[k].motif}
                    onChange={(e) => saisirNiveau(k, 'motif', e.target.value)}
                    spellCheck={false}
                  />
                </label>
                {md.niveaux[k]?.motif === undefined ? (
                  <span className="epi-hint">déduit des codes</span>
                ) : (
                  <button type="button" onClick={() => saisirNiveau(k, 'motif', undefined)}>
                    Reprendre le motif déduit
                  </button>
                )}
              </div>
            ))}
            {nomsMd.length > 1 && (
              <label>
                Niveau qui tient lieu de compétence{' '}
                <select value={niveauMd} onChange={changerMd('niveau')}>
                  {nomsMd.map((nom, k) => (
                    <option key={k} value={nom}>
                      {nom}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {lecture.erreurs.length > 0 && (
              <ul className="epi-md-erreurs" aria-label="Erreurs du Markdown">
                {lecture.erreurs.map((e, i) => (
                  <li key={i}>{aSaLigne(e)}</li>
                ))}
              </ul>
            )}
            {lecture.avertissements.length > 0 && (
              <ul className="epi-md-avertissements" aria-label="Avertissements du Markdown">
                {lecture.avertissements.map((e, i) => (
                  <li key={i}>{aSaLigne(e)}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <button type="submit" disabled={!lecture?.document || occupe}>
          Importer le Markdown
        </button>
      </form>
      {exportables.length > 0 && (
        <form className="epi-block" aria-label="Exporter un référentiel publié" onSubmit={exporter}>
          <h3>Exporter en Markdown</h3>
          <p className="epi-hint">
            Tout référentiel publié s’écrit dans ce format, pour partir d’un existant : le texte se réimporte sous un
            autre identifiant, ou sous une nouvelle version du même (RESPIRE, lui, s’édite dans son atelier).
          </p>
          <label>
            Référentiel publié{' '}
            <select value={aExporter.valeur} onChange={(e) => setExporte(e.target.value)}>
              {exportables.map((x) => (
                <option key={x.valeur} value={x.valeur}>
                  {x.libelle}
                </option>
              ))}
            </select>
          </label>{' '}
          <button type="submit" disabled={occupe}>
            Exporter en Markdown
          </button>
        </form>
      )}
      {note && (
        <div role={note.erreur ? 'alert' : 'status'} className={note.erreur ? 'load-error' : undefined}>
          <p>{note.texte}</p>
          {note.details && (
            <ul>
              {Object.entries(note.details)
                .slice(0, 20)
                .map(([pointeur, messages]) => (
                  <li key={pointeur}>
                    {pointeur} : {[].concat(messages).join(' ; ')}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
      {listes}
    </div>
  )
}
