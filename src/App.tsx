import { useEffect, useState } from 'react'
import { StoreProvider, useAuth, useStore } from './lib/store'
import { ToastProvider } from './lib/ui'
import Login from './views/Login'
import Onboarding from './views/Onboarding'
import Today from './views/Today'
import Library from './views/Library'
import Discover from './views/Discover'
import CircleView from './views/CircleView'
import Profile from './views/Profile'
import AddBook from './components/AddBook'
import BookDialog from './components/BookDialog'
import Scene from './components/Scene'
import type { CatalogBook } from './lib/catalog'
import type { Circle, UserBook } from './types'

const ROUTES = {
  aujourdhui: ['Aujourd’hui', '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'],
  bibliotheque: ['Bibliothèque', '<path d="M5 4v16M10 4v16M14.5 5l4.5 15M3 20h18"/>'],
  decouvrir: ['Découvrir', '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>'],
  cercle: ['Cercle', '<circle cx="8" cy="9" r="3.2"/><circle cx="17" cy="10" r="2.5"/><path d="M2.5 20c.6-3.4 2.7-5 5.5-5s4.9 1.6 5.5 5M15 15.2c3-.6 5.6.8 6.5 4.3"/>'],
  profil: ['Profil', '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4-6.5 8-6.5s7 2 8 6.5"/>'],
} as const
type Route = keyof typeof ROUTES
const readRoute = (): Route => {
  const h = location.hash.slice(1) as Route
  return h in ROUTES ? h : 'aujourdhui'
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
  const [add, setAdd] = useState<{ initial?: Parameters<typeof AddBook>[0]['initial'] } | null>(null)
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

  const fromCatalog = (c: CatalogBook) =>
    setAdd({ initial: { title: c.title, author: c.author, pages: c.pages || null, genre: c.genre, status: 'lire' } })

  return (
    <>
      {!online && <div className="offline" role="status">Tu es hors ligne. Tes lectures ne seront pas enregistrées avant le retour du réseau.</div>}
      <div className="app">
        <aside className="rail">
          <div className="logo" aria-label="Pagaille"><i /><i /><i />Pagaille</div>
          <nav className="nav" aria-label="Navigation principale">
            {(Object.keys(ROUTES) as Route[]).map((k) => (
              <a key={k} href={`#${k}`} aria-current={route === k ? 'page' : undefined}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ROUTES[k][1] }} />
                {ROUTES[k][0]}
              </a>
            ))}
          </nav>
          <div className="rail-foot">
            <div className="wallet"><span className="signet" aria-hidden="true" /><span className="num">{st.signets}</span> <span className="muted small" style={{ fontWeight: 400 }}>signets</span></div>
          </div>
        </aside>
        <main>
          {st.error && <div className="banner" role="alert"><span>{st.error}</span><button className="btn sm" onClick={() => void st.reload()}>Réessayer</button></div>}
          {route === 'aujourdhui' && <Today onAdd={() => setAdd({})} onOpen={setOpen} onStart={(b, team) => start(b, team ? st.circles[0] ?? null : null)} />}
          {route === 'bibliotheque' && <Library onAdd={() => setAdd({})} onOpen={setOpen} />}
          {route === 'decouvrir' && <Discover onPick={fromCatalog} />}
          {route === 'cercle' && <CircleView onStart={(c) => start(null, c)} />}
          {route === 'profil' && <Profile />}
        </main>
      </div>
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
      {session ? <StoreProvider key={session.user.id} session={session}><Shell /></StoreProvider> : <Login />}
    </ToastProvider>
  )
}
