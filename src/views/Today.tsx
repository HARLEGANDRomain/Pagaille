import { useEffect, useState } from 'react'
import { missionKey, weekStatsOf } from '../lib/api'
import { explain } from '../lib/supabase'
import {
  DAYS_MISSION, MIN_DAILY_REWARD, fmtCm, fmtMinutes, hash, iso, nextMark, pct, plural, reached, spineColors, totalOf,
  weekDates, weekMissions, CM, applyPage,
} from '../lib/logic'
import { Bar, Cover, coverOf, DlgHead, Err, Modal, useToast } from '../lib/ui'
import { useStore } from '../lib/store'
import type { UserBook, WeekStat } from '../types'

function Pile({ max }: { max: number }) {
  const { books, pile: cm } = useStore()
  const nx = nextMark(cm)
  const top = nx ? nx[0] : Math.max(cm, 1)
  const k = max / top
  const step = k >= 6 ? 1 : k >= 1.5 ? 5 : 10
  const bs = books.filter((b) => b.page > 0).sort((a, b) => a.added_at.localeCompare(b.added_at))
  return (
    <div className="pile" style={{ ['--H' as string]: max + 'px', ['--cm' as string]: (k * step).toFixed(2) + 'px' }}>
      <div className="ruler" aria-hidden="true" />
      <div className="stackv" role="img" aria-label={`Pile de ${fmtCm(cm)}`} data-perch="pile" data-perch-floor="">
        {nx && <div className="markline"><span>{nx[1]}, {nx[0]} cm</span></div>}
        {bs.map((b) => {
          const [c, f] = spineColors(b.work.title)
          const t = Math.max(3, b.page * CM * k)
          const h = hash(b.work.title)
          return (
            <div key={b.id} className="slab" data-perch={`pile:${b.id}`} title={`${b.work.title}, ${b.page} pages lues`}
              style={{ ['--c' as string]: c, ['--f' as string]: f, ['--t' as string]: t.toFixed(1) + 'px', ['--w' as string]: 150 + (h % 80) + 'px', ['--x' as string]: ((h >>> 5) % 28) + 'px' }}>
              {t >= 13 ? b.work.title : ''}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MissionRow({ id, label, v, goal, reward, onClaim }: { id: string; label: string; v: number; goal: number; reward: number; onClaim: (id: string, r: number) => void }) {
  const st = useStore()
  const ok = v >= goal
  const done = st.claimed.has(missionKey(id))
  return (
    <div className="mission">
      <div><b>{label}</b> <span className="muted small num">{Math.min(v, goal)} / {goal}</span></div>
      <Bar v={v} g={goal} mark={ok} />
      <div className="act">
        {done ? <span className="done">Récupéré</span> : ok ? <button className="btn primary sm" onClick={() => onClaim(id, reward)}>Récupérer {reward}</button> : <span className="muted small num"><span className="signet" /> {reward}</span>}
      </div>
    </div>
  )
}

function QuickLog({ book, onClose }: { book: UserBook; onClose: () => void }) {
  const st = useStore()
  const toast = useToast()
  const [min, setMin] = useState(String(st.profile.daily_minutes))
  const [page, setPage] = useState(String(book.page))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const total = totalOf(book)
  async function save(e: React.FormEvent) {
    e.preventDefault()
    const m = Number(min)
    if (!Number.isFinite(m) || m < 1 || m > 720) return setError('Les minutes doivent être entre 1 et 720.')
    setBusy(true); setError('')
    try {
      const r = await st.recordSession(book, { minutes: m, page: page === '' ? null : Number(page) })
      if (r.queued) toast('Pas de réseau : ta lecture est gardée sur ton téléphone et sera envoyée au retour de la connexion.')
      else {
        toast((r.res.gained ? `+${r.res.gained} pages, ta pile gagne ${(r.res.gained * CM * 10).toFixed(1).replace('.', ',')} mm` : `${r.res.minutes} minutes notées`) + (r.ritual ? `. Rituel du jour tenu, +${MIN_DAILY_REWARD} signets` : ''))
        if (r.res.finished) toast('Livre terminé, +30 signets.')
        if (r.mark) toast(`Ta pile dépasse ${r.mark}.`)
      }
      onClose()
    } catch (err) { setError(explain(err)) } finally { setBusy(false) }
  }
  const preview = applyPage(book.page, page === '' ? null : Number(page), total).gained
  return (
    <Modal onClose={onClose} title="Noter une lecture">
      <DlgHead title="Noter une lecture" sub={`Pour ce que tu as lu de « ${book.work.title} » sans lancer le chrono.`} onClose={onClose} />
      <form className="stack" onSubmit={save} noValidate>
        <div className="two">
          <label className="field">Minutes lues<input type="number" min={1} max={720} value={min} inputMode="numeric" onChange={(e) => setMin(e.target.value)} autoFocus /></label>
          <label className="field">Page atteinte{total ? ` (sur ${total})` : ''}<input type="number" min={0} max={total || undefined} value={page} inputMode="numeric" onChange={(e) => setPage(e.target.value)} /></label>
        </div>
        {preview > 0 && <p className="muted small">+{preview} pages depuis ta dernière lecture.</p>}
        <Err>{error}</Err>
        <div className="row"><button className="btn primary" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer ma lecture'}</button></div>
      </form>
    </Modal>
  )
}

export default function Today({ onAdd, onOpen, onStart }: { onAdd: () => void; onOpen: (id: string) => void; onStart: (b: UserBook, team: boolean) => void }) {
  const st = useStore()
  const toast = useToast()
  const { profile, current, ws, todayMin, row } = st
  const [quick, setQuick] = useState(false)
  const [circleStats, setCircleStats] = useState<WeekStat[] | null>(null)
  const circle = st.circles[0] ?? null
  const hr = new Date().getHours()
  const hello = hr < 6 ? 'Bonne nuit' : hr < 12 ? 'Bonjour' : hr < 18 ? 'Bon après-midi' : 'Bonsoir'
  const g = profile.days_goal
  const others = st.books.filter((b) => b.status === 'cours' && b !== current)
  const wd = weekDates()
  const today = iso(new Date())

  useEffect(() => {
    if (!circle) return
    let live = true
    weekStatsOf(circle.id).then((r) => { if (live) setCircleStats(r) }).catch(() => {})
    return () => { live = false }
  }, [circle?.id, st.sessions.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const circleTotal = circleStats?.reduce((a, s) => a + s.pages, 0) ?? 0

  async function claim(id: string, reward: number) {
    try {
      const done = await st.pay(missionKey(id), reward)
      toast(done ? `+${reward} signets` : 'Déjà récupéré.')
    } catch (e) { toast(explain(e)) }
  }

  const m = reached(st.pile)
  const mission = weekMissions()

  return (
    <>
      <div className="head">
        <div>
          <h1>{hello} {profile.display_name}.</h1>
          <p className="muted" style={{ marginTop: 8 }}>
            {todayMin >= profile.daily_minutes ? `Rituel du jour tenu : ${fmtMinutes(todayMin)} lues.` : todayMin ? `${fmtMinutes(todayMin)} lues aujourd’hui, encore ${fmtMinutes(profile.daily_minutes - todayMin)} pour ton rituel.` : `Ton rituel du jour : ${fmtMinutes(profile.daily_minutes)}. C’est tout.`}
          </p>
          {st.pendingCount > 0 && <p className="small" role="status" style={{ marginTop: 6 }}>{plural(st.pendingCount, 'lecture')} en attente : envoi automatique au retour du réseau.</p>}
        </div>
        <a className="wallet-chip" href="#boutique" aria-label={`${st.signets} signets, ouvrir la boutique`}><span className="signet" aria-hidden="true" /> <b className="num">{st.signets}</b> <span className="small">Boutique</span></a>
      </div>
      <div className="cols">
        <div>
          <section>
            {current ? (
              <div className="now" data-perch="zone:lecture">
                <Cover title={current.work.title} author={current.work.author} url={coverOf(current)} onClick={() => onOpen(current.id)} />
                <div className="stack">
                  <div>
                    <p className="muted small">Lecture en cours</p>
                    <h2 className="bk" style={{ fontSize: '1.6rem', fontWeight: 600 }}>{current.work.title}</h2>
                    <p className="muted">{current.work.author}</p>
                  </div>
                  {totalOf(current) > 0 && (
                    <div className="stack" style={{ gap: 6 }}>
                      <Bar v={current.page} g={totalOf(current)} />
                      <p className="small num">Page {current.page} sur {totalOf(current)}, {pct(current)} %</p>
                    </div>
                  )}
                  <div className="row">
                    <button className="btn primary" onClick={() => onStart(current, false)}>Lire {fmtMinutes(profile.daily_minutes)}</button>
                    <button className="btn" onClick={() => setQuick(true)}>Noter une lecture déjà faite</button>
                  </div>
                  {others.length > 0 && (
                    <div className="row small"><span className="muted">Ou reprendre :</span>
                      {others.map((o) => <button key={o.id} className="chip" onClick={() => onOpen(o.id)}>{o.work.title}</button>)}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="stack">
                <h2>{st.books.length ? 'Aucun livre en cours' : 'Ta bibliothèque est vide'}</h2>
                <p className="muted">{st.books.length ? 'Passe un livre de ta pile en « En cours » : ouvre-le et choisis son statut.' : 'Ajoute un livre, même un que tu n’as jamais fini. Moins de 200 pages pour repartir, c’est une semaine à dix minutes par jour.'}</p>
                <div className="row"><button className="btn primary" onClick={onAdd}>Ajouter un livre</button></div>
              </div>
            )}
          </section>

          <section className="stack">
            <div>
              <h2>Cette semaine, {plural(ws.days, 'jour')} sur {g}</h2>
              <p className="muted small" style={{ marginTop: 4 }}>
                Rater un jour ne coûte rien. L’objectif, c’est {g} jours sur 7, pas 7 sur 7.{row ? ` ${plural(row, 'semaine')} tenue${row > 1 ? 's' : ''} d’affilée.` : ''}
              </p>
            </div>
            <div className="week">
              {wd.map((d, i) => (
                <div key={d} className={`day${ws.dates.has(d) ? ' read' : ''}${d === today ? ' today' : ''}`}><i />{'LMMJVSD'[i]}<span style={{ position: 'absolute', clip: 'rect(0 0 0 0)' }}>{ws.dates.has(d) ? 'lu' : 'pas lu'}</span></div>
              ))}
            </div>
          </section>

          <section className="stack" style={{ gap: 0 }}>
            <div>
              <h2>Ta pile : {fmtCm(st.pile)}</h2>
              <p className="muted small" style={{ marginTop: 4, maxWidth: '56ch' }}>{m ? `Plus haute qu’${m[1]}` : 'Elle commence ici'}. Chaque page lue l’épaissit, même dans un livre jamais fini.</p>
            </div>
            <Pile max={170} />
          </section>
        </div>

        <div className="stack" style={{ gap: 24 }}>
          <div className="panel" data-perch="zone:missions">
            <h2>Missions de la semaine</h2>
            <p className="muted small" style={{ margin: '2px 0 8px' }}>Remises à zéro lundi.</p>
            <MissionRow id={DAYS_MISSION.id} label={`Lis ${g} jours différents`} v={ws.days} goal={g} reward={DAYS_MISSION.reward} onClaim={claim} />
            {mission.map((x) => <MissionRow key={x.id} id={x.id} label={x.label} v={x.val(ws)} goal={x.goal} reward={x.reward} onClaim={claim} />)}
          </div>
          {circle ? (
            <div className="panel stack" data-perch="zone:cercle">
              <div className="row" style={{ justifyContent: 'space-between' }}><h2>{circle.name}</h2><a className="small" href="#cercle" style={{ color: 'inherit' }}>Ouvrir le cercle</a></div>
              <p className="small"><b className="num">{circleTotal} pages sur {circle.weekly_goal_pages}</b> lues à {circleStats?.length ?? '…'} cette semaine.</p>
              <Bar v={circleTotal} g={circle.weekly_goal_pages} mark />
              {current && <div><button className="btn sm" onClick={() => onStart(current, true)}>Lire avec le cercle</button></div>}
            </div>
          ) : (
            <div className="panel stack" data-perch="zone:cercle">
              <h2>Lire à plusieurs</h2>
              <p className="muted small">Crée un cercle ou rejoins celui d’un ami avec son code d’invitation. On additionne les pages, sans classement.</p>
              <div><a className="btn sm" href="#cercle" style={{ textDecoration: 'none', display: 'inline-block' }}>Ouvrir le cercle</a></div>
            </div>
          )}
        </div>
      </div>
      {quick && current && <QuickLog book={current} onClose={() => setQuick(false)} />}
    </>
  )
}
