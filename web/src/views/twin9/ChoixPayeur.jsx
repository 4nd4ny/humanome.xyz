// Qui paie (sprint 6, lot S6b — ADR-013 §4) : un menu quand l'élève a le
// choix (plusieurs écoles, ou son école et son propre solde), une phrase
// quand son école paie seule, rien quand il paie seul. La valeur est celle de
// lib/payeurs.js : '' (le défaut du serveur), 'personnel', ou l'identifiant
// d'une école en texte.

import {
  ECOLE_VOIT_LE_MONTANT,
  libellePayeur,
  listePayeurs,
  phrasePayeur,
  valeurDe,
} from '../../lib/payeurs.js'

/**
 * @param {object} props
 * @param {Array<object>} props.payeurs les payeurs possibles (GET /api/twin9/meta)
 * @param {string} props.valeur le choix
 * @param {(valeur: string) => void} props.onChange
 * @param {string} [props.id] l'identifiant du menu
 * @param {string} [props.cle] la clé de l'usage : 'instance' (le crédit de l'école) ou 'ecole' (sa clé)
 * @param {boolean} [props.disabled]
 */
export default function ChoixPayeur({ payeurs, valeur, onChange, id = 'choix-payeur', cle = 'instance', disabled = false }) {
  const liste = listePayeurs(payeurs)
  if (liste.length === 0) return null
  if (liste.length === 1) {
    const phrase = phrasePayeur(liste[0])
    return phrase ? (
      <p className="privacy-note" data-testid="payeur-ecole">
        {phrase}
      </p>
    ) : null
  }
  const ecoles = liste.filter((p) => p.type === 'ecole')
  const choisie = ecoles.find((p) => valeurDe(p) === valeur && !p.soi)
  return (
    <div className="config-champ" data-testid="choix-payeur">
      <label htmlFor={id}>Qui paie</label>
      <div className="config-commande">
        <select id={id} value={valeur} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          {ecoles.length > 1 && valeur === '' ? <option value="">Choisir…</option> : null}
          {liste.map((p) => (
            <option key={valeurDe(p)} value={valeurDe(p)}>
              {libellePayeur(p, cle)}
            </option>
          ))}
        </select>
      </div>
      {choisie ? <p className="privacy-note">{ECOLE_VOIT_LE_MONTANT}</p> : null}
    </div>
  )
}
