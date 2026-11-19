import { useState } from 'react'
import { explain } from '../lib/supabase'
import { plural } from '../lib/logic'
import { GENRE_FAMILIES, short } from '../lib/genres'
import { Err } from '../lib/ui'
import { useStore } from '../lib/store'

/* Trois questions, une seule page : prénom, rythme, goûts. Tout est modifiable plus tard dans le profil. */
export default function Onboarding({ onDone }: { onDone: () => void }) {
  const st = useStore()
  const p = st.profile
  const [name, setName] = useState(/^[a-z0-9._-]+$/i.test(p.display_name) && st.email.startsWith(p.display_name) ? '' : p.display_name)
  const [min, setMin] = useState(10)
  const [days, setDays] = useState(4)
  const [tastes, setTastes] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function go(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Dis-nous comment t’appeler.')
    setBusy(true); setError('')
    try { await st.patchProfile({ display_name: name.trim(), daily_minutes: min, days_goal: days, tastes }); onDone() }
    catch (err) { setError(explain(err)); setBusy(false) }
  }

  const toggle = (g: string) => setTastes((t) => (t.includes(g) ? t.filter((x) => x !== g) : [...t, g]))

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={go} noValidate>
        <div className="logo" aria-label="Pagaille"><i /><i /><i />Pagaille</div>
        <div>
          <h1 style={{ fontSize: 'clamp(1.8rem,6vw,2.4rem)' }}>On règle ça en dix secondes.</h1>
          <p className="muted" style={{ marginTop: 10 }}>Rien n’est définitif, tu pourras tout changer dans ton profil.</p>
        </div>
        <label className="field">Comment t’appelles-tu ?
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus autoComplete="given-name" />
        </label>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small" style={{ fontWeight: 500, marginBottom: 6 }}>Ton rituel quotidien</legend>
          <div className="row">{[5, 10, 15, 20].map((n) => <button type="button" key={n} className="chip" aria-pressed={min === n} onClick={() => setMin(n)}>{n} minutes</button>)}</div>
        </fieldset>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small" style={{ fontWeight: 500, marginBottom: 6 }}>Objectif de la semaine</legend>
          <div className="row">{[3, 4, 5].map((n) => <button type="button" key={n} className="chip" aria-pressed={days === n} onClick={() => setDays(n)}>{plural(n, 'jour')} sur 7</button>)}</div>
          <p className="muted small" style={{ marginTop: 6 }}>Rater un jour ne coûte rien : la série compte des semaines, pas des jours.</p>
        </fieldset>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small" style={{ fontWeight: 500, marginBottom: 6 }}>Ce que tu aimes (facultatif)</legend>
          <div className="tastes">
            {GENRE_FAMILIES.map((f) => (
              <div key={f.family} className="row" style={{ gap: 6 }}>
                <span className="small muted fam">{f.family}</span>
                {f.genres.map((g) => <button type="button" key={g} className="chip sm" aria-pressed={tastes.includes(g)} onClick={() => toggle(g)}>{short(g)}</button>)}
              </div>
            ))}
          </div>
        </fieldset>
        <Err>{error}</Err>
        <button className="btn primary" disabled={busy}>{busy ? 'Un instant…' : 'Entrer dans ma bibliothèque'}</button>
      </form>
    </div>
  )
}
