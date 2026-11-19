import { useState } from 'react'
import { GENRE_FAMILIES, MAX_GENRES, short } from '../lib/genres'

/* Choix de 1 à 3 genres. Les genres déjà choisis et ceux devinés restent visibles ;
   les 34 genres, rangés par famille, se déplient à la demande pour ne pas noyer le formulaire. */
export default function GenrePicker({ value, onChange, suggested = [] }: { value: string[]; onChange: (g: string[]) => void; suggested?: string[] }) {
  const [open, setOpen] = useState(false)
  const toggle = (g: string) => {
    if (value.includes(g)) onChange(value.filter((x) => x !== g))
    else if (value.length < MAX_GENRES) onChange([...value, g])
    else onChange([...value.slice(1), g]) // au-delà de 3, le plus ancien choix laisse sa place
  }
  const quick = [...new Set([...value, ...suggested])]
  return (
    <div className="field">
      <span>Genres <span className="muted small">({value.length}/{MAX_GENRES})</span></span>
      <div className="row" role="group" aria-label="Genres choisis">
        {quick.map((g) => <button type="button" key={g} className="chip" aria-pressed={value.includes(g)} onClick={() => toggle(g)}>{short(g)}</button>)}
        <button type="button" className="btn ghost sm" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Masquer les genres' : 'Tous les genres'}</button>
      </div>
      {open && (
        <div className="genre-families">
          {GENRE_FAMILIES.map((f) => (
            <div key={f.family}>
              <p className="small muted">{f.family}</p>
              <div className="row" role="group" aria-label={f.family}>
                {f.genres.map((g) => <button type="button" key={g} className="chip sm" aria-pressed={value.includes(g)} onClick={() => toggle(g)}>{short(g)}</button>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
