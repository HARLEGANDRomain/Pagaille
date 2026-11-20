import { useRef, useState } from 'react'
import { explain } from '../lib/supabase'
import { fmtCm, fmtMinutes, plural, reached, nextMark, RITUAL_CHOICES } from '../lib/logic'
import { cropToBlob, removeOwnImage, uploadImage } from '../lib/images'
import { Avatar, Err, useToast } from '../lib/ui'
import { useStore } from '../lib/store'

const COLORS = ['#161D3A', '#7A2333', '#1F4D45', '#1D3F6E', '#C9772B', '#4A2C5E', '#B5423A', '#2A2D3A']

export default function Profile() {
  const st = useStore()
  const toast = useToast()
  const p = st.profile
  const [name, setName] = useState(p.display_name)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const finished = st.books.filter((b) => b.status === 'fini').length
  const pages = st.books.reduce((a, b) => a + b.page, 0)
  const minutes = st.sessions.reduce((a, s) => a + s.minutes, 0)
  const m = reached(st.pile), nx = nextMark(st.pile)

  async function save(patch: Parameters<typeof st.patchProfile>[0], ok?: string) {
    setError('')
    try { await st.patchProfile(patch); if (ok) toast(ok) } catch (e) { setError(explain(e)) }
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setUploading(true); setError('')
    try {
      const url = await uploadImage('avatars', st.uid, 'avatar', await cropToBlob(f, 320, 320))
      const old = p.avatar_url
      await st.patchProfile({ avatar_url: url })
      void removeOwnImage(old)
      toast('Photo de profil mise à jour.')
    } catch (err) { setError(explain(err)) } finally { setUploading(false) }
  }
  async function removePhoto() {
    const old = p.avatar_url
    await save({ avatar_url: null }, 'Photo retirée.')
    void removeOwnImage(old)
  }
  // Une durée déjà enregistrée hors de la liste (ex. 25 min) reste proposée.
  const ritualChoices = RITUAL_CHOICES.includes(p.daily_minutes) ? RITUAL_CHOICES : [...RITUAL_CHOICES, p.daily_minutes].sort((a, b) => a - b)

  return (
    <>
      <div className="head">
        <div className="row" style={{ gap: 18 }}>
          <Avatar name={p.display_name} color={p.avatar_color} url={p.avatar_url} className="lg" />
          <div><h1>{p.display_name}</h1><p className="muted" style={{ marginTop: 6 }}>{st.email}</p></div>
        </div>
      </div>
      <Err>{error}</Err>

      <section>
        <div className="stats">
          <div><b className="num">{fmtCm(st.pile)}</b><span className="muted small">de pile{m ? `, plus haute qu’${m[1]}` : ''}</span></div>
          <div><b className="num">{pages}</b><span className="muted small">pages lues</span></div>
          <div><b className="num">{finished}</b><span className="muted small">livre{finished > 1 ? 's' : ''} terminé{finished > 1 ? 's' : ''}</span></div>
          <div><b className="num">{Math.round(minutes / 60 * 10) / 10}</b><span className="muted small">heures de lecture</span></div>
          <div><b className="num">{st.row}</b><span className="muted small">{st.row > 1 ? 'semaines tenues d’affilée' : 'semaine tenue d’affilée'}</span></div>
          <div><b className="num">{st.signets}</b><span className="muted small"><span className="signet" /> signets</span></div>
        </div>
        {nx && <p className="muted small" style={{ marginTop: 10 }}>Prochain repère : {nx[1]}, à {nx[0]} cm.</p>}
      </section>

      <section>
        <h2>Badges</h2>
        <div className="badges" style={{ marginTop: 12 }}>
          {st.badges.map((b) => (
            <div key={b.name} className={`badge${b.got ? '' : ' locked'}`}>
              <b>{b.name}</b><span className="small">{b.got ? 'Obtenu' : b.how}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel row" style={{ justifyContent: 'space-between', marginBottom: 24 }} data-perch="zone:profil">
        <div><h2>{st.signets} signets</h2><p className="muted small">Gagnés en lisant, à dépenser en étagères, objets et ambiances.</p></div>
        <a className="btn primary" href="#boutique" style={{ textDecoration: 'none' }}>Ouvrir la boutique</a>
      </section>

      <section className="panel stack" style={{ maxWidth: 640 }} data-perch="zone:reglages">
        <h2>Réglages</h2>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); if (name.trim() && name.trim() !== p.display_name) void save({ display_name: name.trim() }, 'Prénom mis à jour.') }}>
          <label className="field">Prénom affiché
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          </label>
          <div><button className="btn sm" disabled={!name.trim() || name.trim() === p.display_name}>Enregistrer</button></div>
        </form>
        <div className="field">Photo de profil
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} />
          <div className="row">
            <Avatar name={p.display_name} color={p.avatar_color} url={p.avatar_url} size={52} />
            <button className="btn sm" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? 'Envoi…' : p.avatar_url ? 'Changer la photo' : 'Ajouter une photo'}</button>
            {p.avatar_url && <button className="btn ghost sm" onClick={() => void removePhoto()}>Retirer</button>}
          </div>
          <span className="muted small">Visible par les membres de tes cercles. Sans photo, ton initiale s’affiche sur la couleur choisie.</span>
        </div>
        <div className="field">Couleur de ton avatar
          <div className="row" role="group" aria-label="Couleur de l’avatar">
            {COLORS.map((c) => (
              <button key={c} onClick={() => void save({ avatar_color: c })} aria-label={`Couleur ${c}`} aria-pressed={p.avatar_color === c}
                style={{ width: 34, height: 34, borderRadius: '50%', background: c, border: p.avatar_color === c ? '3px solid var(--mark)' : '2px solid var(--line)', outline: p.avatar_color === c ? '2px solid var(--ink)' : 'none' }} />
            ))}
          </div>
        </div>
        <div className="two">
          <label className="field">Rituel quotidien
            <select value={p.daily_minutes} onChange={(e) => void save({ daily_minutes: Number(e.target.value) })}>
              {ritualChoices.map((n) => <option key={n} value={n}>{fmtMinutes(n)}{n === 10 ? ' (conseillé pour démarrer)' : ''}</option>)}
            </select>
            <span className="muted small">C’est ton minimum pour valider la journée, pas une limite : le chrono continue après, et tout compte. Un petit rituel se tient plus facilement les jours chargés.</span>
          </label>
          <label className="field">Objectif de la semaine
            <select value={p.days_goal} onChange={(e) => void save({ days_goal: Number(e.target.value) })}>
              {[2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{plural(n, 'jour')} sur 7</option>)}
            </select>
          </label>
        </div>
        <label className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
          <input type="checkbox" checked={p.share_library} onChange={(e) => void save({ share_library: e.target.checked }, e.target.checked ? 'Ta bibliothèque est visible des membres de tes cercles.' : 'Ta bibliothèque est privée.')} style={{ marginTop: 5, width: 18, height: 18 }} />
          <span>Montrer ma bibliothèque aux membres de mes cercles<br /><span className="muted small">Tes notes personnelles et tes sessions restent toujours privées. Seuls les livres, leur statut et les bravos sont visibles.</span></span>
        </label>
        <hr className="rule" />
        <div><button className="btn" onClick={() => void st.signOut()}>Se déconnecter</button></div>
      </section>
    </>
  )
}
