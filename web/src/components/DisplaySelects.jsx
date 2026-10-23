import {
  INTERFACES,
  INTERFACE_LABELS,
  THEME_CHOICES,
  THEME_CHOICE_LABELS,
  useDisplay,
} from '../lib/theme.js'

/**
 * Réglages d'affichage du sprint 9 : l'interface (épistémiarque,
 * noèsiologue, technomancien) et le thème (« Système » compris), deux listes
 * natives lues et écrites dans le contexte d'affichage du shell (App.jsx).
 * Servent au bas du tiroir et dans la ligne « Affichage » de « Mon compte » :
 * les deux restent synchronisées. Ni lien (le tiroir ne se referme pas) ni
 * groupe ARIA (le tiroir n'en compte qu'un par famille).
 *
 * @param {{idPrefix: string, className?: string, hint?: string}} props
 *   idPrefix rend les identifiants uniques dans la page ; hint, s'il est
 *   donné, est annoncé par les deux listes (aria-describedby).
 */
export default function DisplaySelects({ idPrefix, className, hint }) {
  const { interfaceName, setInterface, themeChoice, setThemeChoice } = useDisplay()
  const hintId = hint ? `${idPrefix}-display-hint` : undefined
  return (
    <div className={['display-selects', className].filter(Boolean).join(' ')}>
      <div className="display-select">
        <label className="display-select-label" htmlFor={`${idPrefix}-interface`}>
          Interface
        </label>
        <select
          id={`${idPrefix}-interface`}
          value={interfaceName}
          aria-describedby={hintId}
          onChange={(event) => setInterface(event.target.value)}
        >
          {INTERFACES.map((id) => (
            <option key={id} value={id}>
              {INTERFACE_LABELS[id]}
            </option>
          ))}
        </select>
      </div>
      <div className="display-select">
        <label className="display-select-label" htmlFor={`${idPrefix}-theme`}>
          Thème
        </label>
        <select
          id={`${idPrefix}-theme`}
          value={themeChoice}
          aria-describedby={hintId}
          onChange={(event) => setThemeChoice(event.target.value)}
        >
          {THEME_CHOICES.map((choice) => (
            <option key={choice} value={choice}>
              {THEME_CHOICE_LABELS[choice]}
            </option>
          ))}
        </select>
      </div>
      {hint ? (
        <span className="display-select-hint" id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  )
}
