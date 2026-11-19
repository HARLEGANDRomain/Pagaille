import { useEffect, useRef, useState } from 'react'
import { supabase, explain } from '../lib/supabase'
import { type SessionResult } from '../lib/api'
import { CM, MIN_DAILY_REWARD, clamp, plural, totalOf, weekDates, iso, fmtMinutes } from '../lib/logic'
import { Avatar, Err, useToast } from '../lib/ui'
import { useStore } from '../lib/store'
import { useChat } from '../lib/chat'
import { equippedItem } from '../lib/cosmetics'
import ChatPanel from './ChatPanel'
import type { Circle, UserBook } from '../types'

/* La scène de lecture : un chrono, une ambiance, rien d'autre.
   Avec un cercle, les amis connectés au même moment apparaissent (présence temps réel). */

type Phase = 'run' | 'form' | 'done' | 'queued'

export default function Scene({ book, circle, onClose }: { book: UserBook; circle: Circle | null; onClose: () => void }) {
  const st = useStore()
  const chat = useChat()
  const toast = useToast()
  const [chatOpen, setChatOpen] = useState(false)
  const chatCircle = circle?.id ?? st.circles[0]?.id ?? null
  const unread = chatCircle ? chat.unread(chatCircle) : 0
  const ambiance = equippedItem(st.profile.equipped, 'scene').id
  const goal = (circle ? 20 : st.profile.daily_minutes) * 60
  const [phase, setPhase] = useState<Phase>('run')
  const [paused, setPaused] = useState(false)
  const [secs, setSecs] = useState(0)
  const [minutes, setMinutes] = useState(1)
  const [page, setPage] = useState(String(book.page))
  const [res, setRes] = useState<SessionResult | null>(null)
  const [ritual, setRitual] = useState(false)
  const [mark, setMark] = useState<string | null>(null)
  const [peers, setPeers] = useState<{ id: string; name: string; color: string; url?: string | null }[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const acc = useRef(0)
  const t0 = useRef(Date.now())
  const pausedRef = useRef(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const first = useRef<HTMLButtonElement>(null)
  const pageInput = useRef<HTMLInputElement>(null)
  const total = totalOf(book)

  // Chrono basé sur l'horloge : il reste juste si l'onglet est mis en veille.
  useEffect(() => {
    const id = setInterval(() => {
      if (phase !== 'run') return
      setSecs(Math.floor((acc.current + (pausedRef.current ? 0 : Date.now() - t0.current)) / 1000))
    }, 500)
    return () => clearInterval(id)
  }, [phase])

  useEffect(() => {
    if (phase === 'form') pageInput.current?.select() // une seule fois à l'ouverture du formulaire, pas à chaque frappe
    else first.current?.focus()
  }, [phase])

  // Garde l'écran allumé pendant la lecture, quand le navigateur le permet.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    const ask = () => navigator.wakeLock?.request('screen').then((l) => { lock = l }).catch(() => {})
    if (phase === 'run') void ask()
    const vis = () => { if (document.visibilityState === 'visible' && phase === 'run') void ask() }
    document.addEventListener('visibilitychange', vis)
    return () => { document.removeEventListener('visibilitychange', vis); void lock?.release() }
  }, [phase])

  // Présence : qui lit en ce moment dans ce cercle.
  useEffect(() => {
    if (!circle) return
    const ch = supabase.channel(`presence:${circle.id}`, { config: { presence: { key: st.uid } } })
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState() as Record<string, { name: string; color: string; url?: string | null }[]>
      setPeers(Object.entries(state).filter(([id]) => id !== st.uid).map(([id, v]) => ({ id, name: v[0]?.name ?? '?', color: v[0]?.color ?? '#161D3A', url: v[0]?.url })))
    })
    ch.subscribe((s) => {
      if (s === 'SUBSCRIBED') void ch.track({ name: st.profile.display_name, color: st.profile.avatar_color, url: st.profile.avatar_url ?? null })
    })
    return () => { void supabase.removeChannel(ch) }
  }, [circle, st.uid, st.profile.display_name, st.profile.avatar_color, st.profile.avatar_url])

  useEffect(() => drawScene(canvas.current!, () => pausedRef.current, ambiance), [ambiance])

  const elapsed = () => acc.current + (pausedRef.current ? 0 : Date.now() - t0.current)

  function togglePause() {
    if (pausedRef.current) t0.current = Date.now()
    else acc.current += Date.now() - t0.current
    pausedRef.current = !pausedRef.current
    setPaused(pausedRef.current)
  }

  function finish() {
    const ms = elapsed()
    acc.current = ms
    pausedRef.current = true
    setMinutes(Math.max(1, Math.round(ms / 60000)))
    setPhase('form')
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const r = await st.recordSession(book, { minutes, page: page === '' ? null : Number(page), circleId: circle?.id ?? null })
      if (r.queued) { setPhase('queued'); return }
      setMark(r.mark)
      setRitual(r.ritual)
      setRes(r.res)
      setPhase('done')
    } catch (err) {
      setError(explain(err))
      toast('Ta lecture n’a pas été enregistrée. Réessaie.')
    } finally {
      setBusy(false)
    }
  }

  const mm = res ? (res.gained * CM * 10).toFixed(1).replace('.', ',') : '0'
  const mins = String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0')
  const wd = weekDates()
  const readDays = new Set(st.sessions.map((s) => s.day))
  if (res) readDays.add(iso(new Date()))

  return (
    <div id="scene" className="on" role="dialog" aria-modal="true" aria-label="Session de lecture">
      <canvas ref={canvas} />
      {chatCircle && phase === 'run' && (
        <button className={`scene-chat-btn${unread ? ' has' : ''}`} onClick={() => setChatOpen(!chatOpen)} aria-expanded={chatOpen} aria-label={unread ? `Discussion du cercle, ${unread} message${unread > 1 ? 's' : ''} non lu${unread > 1 ? 's' : ''}` : 'Discussion du cercle'}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /></svg>
          {unread > 0 && <b>{unread > 9 ? '9+' : unread}</b>}
        </button>
      )}
      {chatOpen && chatCircle && phase === 'run' && (
        <div className="scene-chat" role="region" aria-label="Discussion du cercle">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>{st.circles.find((c) => c.id === chatCircle)?.name}</b>
            <button className="x" onClick={() => setChatOpen(false)} aria-label="Fermer la discussion" style={{ color: 'inherit' }}>×</button>
          </div>
          <p className="small" style={{ opacity: 0.7 }}>Le chrono continue pendant que tu écris.</p>
          <ChatPanel circleId={chatCircle} dark />
        </div>
      )}
      <div className="scene-ui">
        {phase === 'run' && (
          <>
            <p className="bk" style={{ fontStyle: 'italic', fontSize: '1.2rem', maxWidth: '30ch' }}>{book.work.title}</p>
            <div className="timer" aria-live="off">{mins}</div>
            <div className="goalbar"><i style={{ width: clamp((secs / goal) * 100, 0, 100) + '%' }} /></div>
            <p style={{ opacity: 0.8 }}>
              {secs >= goal ? 'Rituel tenu. Le chrono continue : tout ce que tu lis en plus compte aussi.' : `Rituel : ${fmtMinutes(goal / 60)}. Pose ton téléphone, ouvre ton livre.`}
            </p>
            {circle && (
              <>
                <div className="row pres" style={{ justifyContent: 'center' }} aria-label="Présents">
                  <Avatar name={st.profile.display_name} url={st.profile.avatar_url} me />
                  {peers.map((p) => <Avatar key={p.id} name={p.name} color={p.color} url={p.url} />)}
                </div>
                <p className="small" style={{ opacity: 0.7 }}>
                  {peers.length ? `${peers.map((p) => p.name).join(', ')} ${peers.length > 1 ? 'lisent' : 'lit'} en même temps que toi.` : `Personne d’autre de ${circle.name} n’est là pour l’instant.`}
                </p>
              </>
            )}
            <div className="row" style={{ justifyContent: 'center' }}>
              <button ref={first} className="btn" onClick={togglePause}>{paused ? 'Reprendre' : 'Mettre en pause'}</button>
              <button className="btn primary" onClick={finish}>J’ai fini de lire</button>
            </div>
            <button className="btn ghost sm" onClick={onClose} style={{ color: '#EEF1FA', opacity: 0.7 }}>Quitter sans enregistrer</button>
          </>
        )}

        {phase === 'form' && (
          <form className="scene-form" onSubmit={save}>
            <h2>Tu t’es arrêté où ?</h2>
            <label className="field">Minutes lues
              <input type="number" min={1} max={720} value={minutes} inputMode="numeric" onChange={(e) => setMinutes(Number(e.target.value))} />
            </label>
            <label className="field">Page atteinte{total ? ` (sur ${total})` : ''}
              <input ref={pageInput} type="number" min={0} max={total || undefined} value={page} inputMode="numeric" onChange={(e) => setPage(e.target.value)} />
            </label>
            <Err>{error}</Err>
            <div className="row">
              <button className="btn primary" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer ma lecture'}</button>
              <button type="button" className="btn ghost sm" onClick={onClose} style={{ color: '#EEF1FA' }}>Annuler</button>
            </div>
          </form>
        )}

        {phase === 'queued' && (
          <>
            <p className="bk" style={{ fontStyle: 'italic', fontSize: '1.2rem', maxWidth: '30ch' }}>{book.work.title}</p>
            <h2 style={{ font: '800 clamp(2.2rem,7vw,3.6rem)/1 var(--display)', letterSpacing: '-.03em' }}>Gardée sur ton téléphone.</h2>
            <p style={{ opacity: 0.85, maxWidth: '44ch' }}>Pas de réseau pour l’instant. Tes {minutes} minutes seront envoyées toutes seules dès que la connexion revient, à la date d’aujourd’hui.</p>
            <button ref={first} className="btn primary" onClick={onClose}>Revenir à l’accueil</button>
          </>
        )}

        {phase === 'done' && res && (
          <>
            <p className="bk" style={{ fontStyle: 'italic', fontSize: '1.2rem', maxWidth: '30ch' }}>{book.work.title}</p>
            <h2 style={{ font: '800 clamp(2.6rem,8vw,4.4rem)/1 var(--display)', letterSpacing: '-.03em' }}>C’est noté.</h2>
            <p className="num" style={{ fontSize: '1.15rem' }}>
              {res.minutes} min{res.gained ? `, ${res.gained} pages. Ta pile gagne ${mm} mm.` : '.'}
            </p>
            <div className="week" style={{ width: 'min(340px,90%)' }}>
              {wd.map((d, i) => (
                <div key={d} className={`day${readDays.has(d) ? ' read' : ''}${d === iso(new Date()) ? ' today' : ''}`}><i />{'LMMJVSD'[i]}</div>
              ))}
            </div>
            <p style={{ opacity: 0.85, maxWidth: '44ch' }}>
              {plural(wd.filter((d) => readDays.has(d)).length, 'jour')} sur {st.profile.days_goal} cette semaine.
              {ritual ? ` Rituel du jour tenu, +${MIN_DAILY_REWARD} signets.` : ''}
              {mark ? ` Ta pile dépasse ${mark}.` : ''}
              {res.finished ? ' Livre terminé, +30 signets.' : ''}
            </p>
            <button ref={first} className="btn primary" onClick={onClose}>Revenir à l’accueil</button>
          </>
        )}
      </div>
    </div>
  )
}

/* ---------- ambiances (achetées à la boutique) ---------- */
function drawScene(cv: HTMLCanvasElement, isPaused: () => boolean, kind: string, once = false): () => void {
  const x = cv.getContext('2d')!
  const still = matchMedia('(prefers-reduced-motion:reduce)').matches
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const fit = () => { cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr }
  fit()
  const R = Math.random
  const n = kind === 'scene-etoiles' ? 220 : kind === 'scene-neige' ? 160 : kind === 'scene-braises' ? 70 : 150
  const P = Array.from({ length: n }, () => ({ x: R(), y: R(), v: 0.3 + R() * 0.7, p: R() * Math.PI * 2 }))
  const sky: Record<string, [string, string, string]> = {
    'scene-pluie': ['#0B1024', '#1B2750', 'rgba(255,221,60,.16)'],
    'scene-etoiles': ['#050816', '#141B3D', 'rgba(200,210,255,.10)'],
    'scene-neige': ['#1A2238', '#3A4766', 'rgba(255,255,255,.12)'],
    'scene-braises': ['#140A0A', '#3A1A10', 'rgba(255,130,40,.28)'],
  }
  const [top, bottom, glow] = sky[kind] ?? sky['scene-pluie']
  let raf = 0
  let t = 0
  const frame = () => {
    if (cv.width !== cv.clientWidth * dpr || cv.height !== cv.clientHeight * dpr) fit()
    const W = cv.width, H = cv.height, mv = isPaused() || still ? 0 : 1
    t += mv * 0.016
    const g = x.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, top); g.addColorStop(1, bottom)
    x.fillStyle = g; x.fillRect(0, 0, W, H)
    const lx = kind === 'scene-braises' ? W * 0.5 : W * 0.78, ly = kind === 'scene-braises' ? H * 1.05 : H * 0.2
    const l = x.createRadialGradient(lx, ly, 0, lx, ly, H * (kind === 'scene-braises' ? 0.8 : 0.6))
    l.addColorStop(0, glow); l.addColorStop(1, 'rgba(0,0,0,0)')
    x.fillStyle = l; x.fillRect(0, 0, W, H)
    if (kind === 'scene-etoiles') {
      for (const p of P) {
        const a = 0.25 + 0.75 * Math.abs(Math.sin(p.p + t * p.v * 1.6))
        x.fillStyle = `rgba(230,235,255,${a.toFixed(2)})`
        x.beginPath(); x.arc(p.x * W, p.y * H * 0.85, (0.6 + p.v) * dpr, 0, Math.PI * 2); x.fill()
      }
    } else if (kind === 'scene-neige') {
      x.fillStyle = 'rgba(255,255,255,.8)'
      for (const p of P) {
        p.y += mv * p.v * 0.0025; p.x += mv * Math.sin(t + p.p) * 0.0006
        if (p.y > 1.03) { p.y = -0.03; p.x = R() }
        x.beginPath(); x.arc(p.x * W, p.y * H, (1 + p.v * 2.2) * dpr, 0, Math.PI * 2); x.fill()
      }
    } else if (kind === 'scene-braises') {
      for (const p of P) {
        p.y -= mv * p.v * 0.003; p.x += mv * Math.sin(t * 2 + p.p) * 0.0008
        if (p.y < -0.03) { p.y = 1.03; p.x = 0.2 + R() * 0.6 }
        const a = Math.max(0, Math.min(1, p.y * 1.1))
        x.fillStyle = `rgba(255,${120 + Math.round(p.v * 80)},40,${a.toFixed(2)})`
        x.beginPath(); x.arc(p.x * W, p.y * H, (1 + p.v * 1.6) * dpr, 0, Math.PI * 2); x.fill()
      }
    } else {
      x.strokeStyle = 'rgba(190,208,255,.34)'; x.lineWidth = 1.2 * dpr; x.beginPath()
      for (const p of P) {
        p.y += mv * p.v * 0.022; p.x -= mv * p.v * 0.004
        if (p.y > 1.05) { p.y = -0.05; p.x = R() * 1.2 }
        x.moveTo(p.x * W, p.y * H); x.lineTo(p.x * W - 5 * p.v * dpr, p.y * H + 22 * p.v * dpr)
      }
      x.stroke()
    }
    if (!once) raf = requestAnimationFrame(frame)
  }
  frame()
  return () => cancelAnimationFrame(raf)
}

/** Aperçu fixe d'une ambiance (boutique). */
export function ScenePreview({ kind }: { kind: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => drawScene(ref.current!, () => true, kind, true), [kind])
  return <canvas ref={ref} className="scene-preview" aria-hidden="true" />
}
