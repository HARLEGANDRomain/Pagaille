import { useCallback, useEffect, useState } from 'react'
import * as api from '../lib/api'
import { explain } from '../lib/supabase'
import ChatPanel from '../components/ChatPanel'
import { Avatar, Bar, Err, Modal, DlgHead, Skeleton, useToast } from '../lib/ui'
import { useStore } from '../lib/store'
import { dayIdx, plural, STATUS_LABEL } from '../lib/logic'
import type { Circle, FeedItem, Member, UserBook, WeekStat } from '../types'

/* ---------- aucun cercle : créer ou rejoindre ---------- */
function Start() {
  const st = useStore()
  const toast = useToast()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Donne un nom à ton cercle.')
    setBusy(true); setError('')
    try { const c = await api.createCircle(name); toast(`Cercle « ${c.name} » créé. Partage son code pour inviter tes amis.`); await st.reload() }
    catch (err) { setError(explain(err)) } finally { setBusy(false) }
  }
  async function join(e: React.FormEvent) {
    e.preventDefault()
    if (code.trim().length < 6) return setError('Un code d’invitation fait 8 caractères.')
    setBusy(true); setError('')
    try { const c = await api.joinCircle(code); toast(`Tu as rejoint « ${c.name} ».`); await st.reload() }
    catch (err) { setError(explain(err)) } finally { setBusy(false) }
  }

  return (
    <>
      <div className="head"><div>
        <h1>Lire avec des amis</h1>
        <p className="muted" style={{ marginTop: 8, maxWidth: '62ch' }}>Un cercle est un petit groupe privé (12 personnes au plus), sur invitation. On additionne les pages de la semaine, on discute, on lit en même temps. Pas de classement.</p>
      </div></div>
      <div className="cols" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
        <form className="panel stack" onSubmit={join} noValidate>
          <h2>J’ai un code d’invitation</h2>
          <label className="field">Code<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={12} placeholder="K7M2QX9A" style={{ letterSpacing: '.18em', fontWeight: 700 }} /></label>
          <button className="btn primary" disabled={busy}>Rejoindre</button>
        </form>
        <form className="panel stack" onSubmit={create} noValidate>
          <h2>Créer un cercle</h2>
          <label className="field">Nom du cercle<input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Les Lents Lecteurs" /></label>
          <button className="btn" disabled={busy}>Créer</button>
        </form>
      </div>
      <div style={{ marginTop: 16 }}><Err>{error}</Err></div>
    </>
  )
}

/* ---------- bibliothèque d'un ami ---------- */
function FriendLibrary({ m, onClose }: { m: Member; onClose: () => void }) {
  const [books, setBooks] = useState<UserBook[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { api.libraryOf(m.user_id).then(setBooks).catch((e) => setError(explain(e))) }, [m.user_id])
  const groups: [string, UserBook[]][] = books ? [
    ['En cours', books.filter((b) => b.status === 'cours')],
    ['Terminés', books.filter((b) => b.status === 'fini')],
    ['À lire', books.filter((b) => b.status === 'lire')],
    ['Laissés de côté', books.filter((b) => b.status === 'pause' || b.status === 'abandon')],
  ] : []
  return (
    <Modal drawer onClose={onClose} title={`Bibliothèque de ${m.display_name}`}>
      <DlgHead title={m.display_name} sub={books ? plural(books.length, 'livre') : ''} onClose={onClose} />
      <Err>{error}</Err>
      {!books && !error && <Skeleton h={160} />}
      {books && !books.length && <p className="muted">{m.display_name} n’a pas encore ajouté de livre, ou ne partage pas sa bibliothèque.</p>}
      {groups.filter(([, l]) => l.length).map(([label, l]) => (
        <div key={label}>
          <h3>{label} <span className="muted num" style={{ fontWeight: 400 }}>{l.length}</span></h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0' }}>
            {l.map((b) => <li key={b.id} className="small" style={{ padding: '5px 0', borderTop: '1px solid var(--line)' }}><b className="bk">{b.work.title}</b> <span className="muted">{b.work.author}{b.status === 'abandon' ? ` · ${STATUS_LABEL.abandon.toLowerCase()}` : ''}</span></li>)}
          </ul>
        </div>
      ))}
    </Modal>
  )
}

/* ---------- un cercle ---------- */
function CircleDetail({ circle, onStart }: { circle: Circle; onStart: (c: Circle) => void }) {
  const st = useStore()
  const toast = useToast()
  const [members, setMembers] = useState<Member[]>([])
  const [stats, setStats] = useState<WeekStat[]>([])
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [error, setError] = useState('')
  const [friend, setFriend] = useState<Member | null>(null)
  const [loaded, setLoaded] = useState(false)
  const nameOf = useCallback((id: string) => members.find((m) => m.user_id === id), [members])
  const owner = members.find((m) => m.user_id === st.uid)?.role === 'owner'

  const loadAll = useCallback(async () => {
    try {
      const [m, s, f] = await Promise.all([api.listMembers(circle.id), api.weekStatsOf(circle.id), api.circleFeed(circle.id)])
      setMembers(m); setStats(s); setFeed(f); setError('')
    } catch (e) { setError(explain(e)) } finally { setLoaded(true) }
  }, [circle.id])

  useEffect(() => { void loadAll() }, [loadAll])

  async function cheer(f: FeedItem) {
    const on = !f.cheered_by_me
    setFeed((l) => l.map((x) => (x.user_book_id === f.user_book_id ? { ...x, cheered_by_me: on, cheer_count: x.cheer_count + (on ? 1 : -1) } : x)))
    try { await api.setCheer(st.uid, f.user_book_id, on) }
    catch (err) { toast(explain(err)); void loadAll() }
  }

  async function copyCode() {
    try { await navigator.clipboard.writeText(circle.invite_code); toast('Code copié.') }
    catch { toast(`Code : ${circle.invite_code}`) }
  }
  async function share() {
    const text = `Rejoins mon cercle de lecture « ${circle.name} » sur Pagaille. Code d’invitation : ${circle.invite_code}`
    if (navigator.share) { try { await navigator.share({ title: 'Pagaille', text }); return } catch { /* annulé */ } }
    try { await navigator.clipboard.writeText(text); toast('Invitation copiée.') } catch { toast(text) }
  }
  async function rotate() {
    if (!confirm('Changer le code ? L’ancien ne fonctionnera plus. Les membres actuels restent dans le cercle.')) return
    try { await api.rotateInvite(circle.id); await st.reload(); toast('Nouveau code créé.') } catch (e) { toast(explain(e)) }
  }
  async function leave() {
    if (!confirm(owner && members.length > 1 ? 'Tu es le propriétaire. Si tu pars, le cercle reste sans propriétaire. Quitter quand même ?' : 'Quitter ce cercle ?')) return
    try { await api.leaveCircle(circle.id, st.uid); await st.reload(); toast('Tu as quitté le cercle.') } catch (e) { toast(explain(e)) }
  }

  const total = stats.reduce((a, s) => a + s.pages, 0)
  const days = dayIdx() + 1

  if (!loaded) return <Skeleton h={300} />

  return (
    <>
      <div className="head">
        <div>
          <h1>{circle.name}</h1>
          <p className="muted" style={{ marginTop: 8, maxWidth: '62ch' }}>Ton cercle de lecture. Pas de classement : on additionne les pages, on ne les compare pas.</p>
        </div>
        <div className="row">{members.map((m) => <Avatar key={m.user_id} name={m.display_name} color={m.avatar_color} url={m.avatar_url} me={m.user_id === st.uid} />)}</div>
      </div>
      <Err>{error}</Err>
      <div className="cols">
        <div>
          <section className="panel stack">
            <h2>Cette semaine : {total} pages sur {circle.weekly_goal_pages}</h2>
            <Bar v={total} g={circle.weekly_goal_pages} mark />
            <p className="muted small">{total >= circle.weekly_goal_pages ? 'Objectif du cercle atteint. Bravo à tous.' : `Jour ${days} sur 7. Chaque page de chacun compte pour le groupe.`}</p>
            {stats.map((s) => (
              <div className="member" key={s.user_id} style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto' }}>
                <Avatar name={s.display_name} color={nameOf(s.user_id)?.avatar_color} url={nameOf(s.user_id)?.avatar_url} me={s.user_id === st.uid} />
                <div>
                  <b>{s.user_id === st.uid ? `${s.display_name} (toi)` : s.display_name}</b>
                  <div className="muted small num">{plural(s.days, 'jour')} lu{s.days > 1 ? 's' : ''}, {s.minutes} min</div>
                </div>
                <span className="num"><b>{s.pages}</b> p.</span>
              </div>
            ))}
            <div className="row"><button className="btn primary" onClick={() => onStart(circle)}>Lire avec le cercle</button></div>
          </section>

          <section>
            <h2>Ce qui s’est passé</h2>
            <p className="muted small" style={{ margin: '4px 0 8px' }}>Livres terminés ou abandonnés par les membres qui partagent leur bibliothèque.</p>
            {!feed.length && <p className="empty">Rien pour l’instant. Le premier livre tranché apparaîtra ici.</p>}
            {feed.map((f) => (
              <div className="member" key={f.user_book_id}>
                <Avatar name={f.display_name} color={nameOf(f.user_id)?.avatar_color} url={nameOf(f.user_id)?.avatar_url} me={f.user_id === st.uid} />
                <p className="small"><b>{f.user_id === st.uid ? 'Toi' : f.display_name}</b> {f.status === 'fini' ? 'a terminé' : 'a abandonné'} <i className="bk">{f.work_title}</i></p>
                <button className="cheer" aria-pressed={f.cheered_by_me} onClick={() => cheer(f)} aria-label={`Bravo, ${f.cheer_count} pour l’instant`}>Bravo{f.cheer_count ? ` · ${f.cheer_count}` : ''}</button>
              </div>
            ))}
          </section>
        </div>

        <div className="stack" style={{ gap: 24 }}>
          <section className="panel stack">
            <h2>Discussion</h2>
            <ChatPanel circleId={circle.id} />
          </section>

          <section className="panel stack">
            <h2>Membres</h2>
            {members.map((m) => (
              <div className="member" key={m.user_id} style={{ borderTop: 0, padding: '6px 0' }}>
                <Avatar name={m.display_name} color={m.avatar_color} url={m.avatar_url} me={m.user_id === st.uid} />
                <span>{m.display_name}{m.role === 'owner' && <span className="muted small"> · propriétaire</span>}</span>
                {m.user_id !== st.uid && <button className="btn ghost sm" onClick={() => setFriend(m)}>Sa bibliothèque</button>}
              </div>
            ))}
            <hr className="rule" />
            <p className="small muted">Code d’invitation</p>
            <p className="invite">{circle.invite_code}</p>
            <div className="row">
              <button className="btn sm" onClick={share}>Inviter</button>
              <button className="btn ghost sm" onClick={copyCode}>Copier le code</button>
              {owner && <button className="btn ghost sm" onClick={rotate}>Changer le code</button>}
            </div>
            <p className="muted small">Toute personne qui a ce code peut rejoindre le cercle. Change-le si tu l’as partagé trop largement.</p>
            <div><button className="btn ghost sm" onClick={leave}>Quitter le cercle</button></div>
          </section>
        </div>
      </div>
      {friend && <FriendLibrary m={friend} onClose={() => setFriend(null)} />}
    </>
  )
}

export default function CircleView({ onStart }: { onStart: (c: Circle) => void }) {
  const st = useStore()
  const [i, setI] = useState(0)
  const [adding, setAdding] = useState(false)
  if (!st.circles.length) return <Start />
  const circle = st.circles[Math.min(i, st.circles.length - 1)]
  return (
    <>
      {(st.circles.length > 1 || adding) && (
        <div className="row" style={{ marginBottom: 16 }} role="group" aria-label="Tes cercles">
          {st.circles.map((c, k) => <button key={c.id} className="chip" aria-pressed={k === i} onClick={() => setI(k)}>{c.name}</button>)}
        </div>
      )}
      <CircleDetail key={circle.id} circle={circle} onStart={onStart} />
      <div style={{ marginTop: 40 }}>
        {!adding ? <button className="btn ghost sm" onClick={() => setAdding(true)}>Rejoindre ou créer un autre cercle</button> : <Start />}
      </div>
    </>
  )
}
