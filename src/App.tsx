import { useEffect, useState } from 'react'
import { StoreProvider, useAuth, useStore } from './lib/store'
import { ChatProvider, useChat } from './lib/chat'
import { DlgHead, Modal, ToastProvider } from './lib/ui'
import Login from './views/Login'
import Onboarding from './views/Onboarding'
import Today from './views/Today'
import Library from './views/Library'
import Discover from './views/Discover'
import CircleView from './views/CircleView'
import Profile from './views/Profile'
import Shop from './views/Shop'
import AddBook, { type AddInitial } from './components/AddBook'
import ChatPanel from './components/ChatPanel'
import BookDialog from './components/BookDialog'
import Scene from './components/Scene'
import type { DiscoverPick } from './views/Discover'
import type { Circle, UserBook } from './types'

const ROUTES = {
  aujourdhui: ['Aujourd’hui', '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'],
  bibliotheque: ['Bibliothèque', '<path d="M5 4v16M10 4v16M14.5 5l4.5 15M3 20h18"/>'],
  decouvrir: ['Découvrir', '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>'],
  cercle: ['Cercle', '<circle cx="8" cy="9" r="3.2"/><circle cx="17" cy="10" r="2.5"/><path d="M2.5 20c.6-3.4 2.7-5 5.5-5s4.9 1.6 5.5 5M15 15.2c3-.6 5.6.8 6.5 4.3"/>'],
  profil: ['Profil', '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4-6.5 8-6.5s7 2 8 6.5"/>'],
} as const
// La boutique n'a pas sa place dans la barre (5 onglets tiennent sur un téléphone) : on y va par les signets.
type Route = keyof typeof ROUTES | 'boutique'
const readRoute = (): Route => {
  const h = location.hash.slice(1) as Route
  return h in ROUTES || h === 'boutique' ? h : 'aujourdhui'
}

/** Vrai tant que la fenêtre fait au moins `px` de large. */
function useWide(px: number) {
  const q = `(min-width:${px}px)`
  const [on, setOn] = useState(() => matchMedia(q).matches)
  useEffect(() => {
    const m = matchMedia(q)
    const f = () => setOn(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [q])
  return on
}

/* La discussion du cercle, accessible depuis tous les onglets :
   colonne fixe à droite sur grand écran, bulle + tiroir ailleurs. */
function ChatDock() {
  const st = useStore()
  const chat = useChat()
  return (
    <aside className="dock" aria-label="Discussion du cercle">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>Discussion</h2>
        <a className="small" href="#cercle" style={{ color: 'inherit' }}>Le cercle</a>
      </div>
      {st.circles.length === 1 && <p className="muted small">{st.circles[0].name}</p>}
      <ChatPanel tall />
      {chat.unread() > 0 && <span className="sr-only" role="status">{chat.unread()} nouveaux messages</span>}
    </aside>
  )
}

function ChatBubble({ hidden }: { hidden: boolean }) {
  const chat = useChat()
  const st = useStore()
  const n = chat.unread()
  if (hidden || !st.circles.length) return null
  return (
    <>
      <button className={`chat-fab${n ? ' has' : ''}`} onClick={() => chat.setOpen(true)} aria-label={n ? `Discussion, ${n} message${n > 1 ? 's' : ''} non lu${n > 1 ? 's' : ''}` : 'Ouvrir la discussion du cercle'}>
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /></svg>
        {n > 0 && <b>{n > 9 ? '9+' : n}</b>}
      </button>
      {chat.open && (
        <Modal drawer onClose={() => chat.setOpen(false)} title="Discussion du cercle">
          <DlgHead title="Discussion" sub={st.circles.length === 1 ? st.circles[0].name : undefined} onClose={() => chat.setOpen(false)} />
          <ChatPanel tall autoFocus />
        </Modal>
      )}
    </>
  )
}

function useRoute() {
  const [r, setR] = useState<Route>(readRoute)
  useEffect(() => {
    const f = () => { setR(readRoute()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return r
}

function useOnline() {
  const [on, setOn] = useState(navigator.onLine)
  useEffect(() => {
    const a = () => setOn(true), b = () => setOn(false)
    window.addEventListener('online', a); window.addEventListener('offline', b)
    return () => { window.removeEventListener('online', a); window.removeEventListener('offline', b) }
  }, [])
  return on
}

function Shell() {
  const st = useStore()
  const route = useRoute()
  const online = useOnline()
  const flag = `pagaille.onboarded.${st.uid}`
  const [onboarded, setOnboarded] = useState(() => {
    try { return localStorage.getItem(flag) === '1' } catch { return true }
  })
  const [add, setAdd] = useState<{ initial?: AddInitial } | null>(null)
  const wide = useWide(1400)
  const [open, setOpen] = useState<string | null>(null)
  const [scene, setScene] = useState<{ book: UserBook; circle: Circle | null } | null>(null)

  const isNew = !onboarded && st.books.length === 0 && st.sessions.length === 0 && st.profile.tastes.length === 0
  if (isNew) {
    return <Onboarding onDone={() => { try { localStorage.setItem(flag, '1') } catch { /* sans effet */ } setOnboarded(true) }} />
  }

  const start = (book: UserBook | null, circle: Circle | null = null) => {
    const b = book ?? st.current ?? st.books.find((x) => x.status === 'lire' || x.status === 'pause')
    if (!b) { setAdd({}); return }
    setOpen(null)
    setScene({ book: b, circle })
  }

  const fromCatalog = (c: DiscoverPick) =>
    setAdd({ initial: { title: c.title, author: c.author, pages: c.pages, genre: c.genre, status: 'lire', hit: c.hit, description: c.description } })

  // Sur l'onglet Cercle, la discussion est déjà dans la page : ni colonne, ni bulle.
  const docked = wide && st.circles.length > 0 && route !== 'cercle'

  return (
    <>
      {!online && <div className="offline" role="status">Hors ligne. Tes lectures sont gardées sur l’appareil et partiront au retour du réseau.</div>}
      <div className={`app${docked ? ' docked' : ''}`}>
        <aside className="rail">
          <div className="logo" aria-label="Pagaille"><i /><i /><i />Pagaille</div>
          <nav className="nav" aria-label="Navigation principale">
            {(Object.keys(ROUTES) as (keyof typeof ROUTES)[]).map((k) => (
              <a key={k} href={`#${k}`} aria-current={route === k ? 'page' : undefined}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ROUTES[k][1] }} />
                {ROUTES[k][0]}
              </a>
            ))}
          </nav>
          <div className="rail-foot">
            <a className="wallet" href="#boutique" aria-current={route === 'boutique' ? 'page' : undefined} title="Ouvrir la boutique"><span className="signet" aria-hidden="true" /><span className="num">{st.signets}</span> <span className="muted small" style={{ fontWeight: 400 }}>signets · boutique</span></a>
          </div>
        </aside>
        <main>
          {st.error && <div className="banner" role="alert"><span>{st.error}</span><button className="btn sm" onClick={() => void st.reload()}>Réessayer</button></div>}
          {route === 'aujourdhui' && <Today onAdd={() => setAdd({})} onOpen={setOpen} onStart={(b, team) => start(b, team ? st.circles[0] ?? null : null)} />}
          {route === 'bibliotheque' && <Library onAdd={() => setAdd({})} onOpen={setOpen} />}
          {route === 'decouvrir' && <Discover onPick={fromCatalog} />}
          {route === 'cercle' && <CircleView onStart={(c) => start(null, c)} />}
          {route === 'profil' && <Profile />}
          {route === 'boutique' && <Shop />}
        </main>
        {docked && <ChatDock />}
      </div>
      <ChatBubble hidden={docked || route === 'cercle' || !!scene} />
      {add && <AddBook initial={add.initial} onClose={() => setAdd(null)} />}
      {open && <BookDialog id={open} onClose={() => setOpen(null)} onRead={(b) => start(b)} />}
      {scene && <Scene book={scene.book} circle={scene.circle} onClose={() => setScene(null)} />}
    </>
  )
}

export default function App() {
  const { session, ready } = useAuth()
  if (!ready) return <div className="auth"><p className="muted" role="status">Chargement…</p></div>
  return (
    <ToastProvider>
      {session ? <StoreProvider key={session.user.id} session={session}><ChatProvider><Shell /></ChatProvider></StoreProvider> : <Login />}
    </ToastProvider>
  )
}
