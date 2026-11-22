/* État partagé : le profil, la bibliothèque, les sessions et les signets de la personne connectée.
   Tout vient de la base ; rien d'important n'est gardé seulement sur l'appareil. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import * as api from './api'
import { badges as computeBadges, MIN_DAILY_REWARD, iso, reached, pileCm, weekStats, streakOf, type Streak, type WeekStats } from './logic'
import { applyCosmetics } from './cosmetics'
import { drop, enqueue, isNetworkError, pending as pendingOf } from './offline'
import type { Circle, Profile, SessionRow, Status, UserBook } from '../types'

export type Recorded =
  | { queued: true }
  | { queued: false; res: api.SessionResult; ritual: boolean; mark: string | null }

interface Store {
  uid: string
  email: string
  profile: Profile
  books: UserBook[]
  sessions: SessionRow[]
  signets: number
  claimed: Set<string>
  circles: Circle[]
  ws: WeekStats
  row: number
  /** Série en semaines : longueur, record, paliers, 8 dernières semaines. */
  streak: Streak
  todayMin: number
  pile: number
  badges: ReturnType<typeof computeBadges>
  current: UserBook | null
  loading: boolean
  error: string
  reload: () => Promise<void>
  setBook: (b: UserBook) => void
  patchProfile: (p: Partial<Omit<Profile, 'id'>>) => Promise<void>
  /** Change le statut d'un livre ; renvoie l'état d'avant pour pouvoir annuler. */
  move: (b: UserBook, st: Status) => Promise<{ undo: () => Promise<void>; passed: [number, string] | null }>
  pay: (key: string, delta: number) => Promise<boolean>
  /** Enregistre une lecture ; sans réseau, elle est gardée sur l'appareil et envoyée plus tard. */
  recordSession: (book: UserBook, input: { minutes: number; page: number | null; circleId?: string | null }) => Promise<Recorded>
  pendingCount: number
  owned: Set<string>
  buy: (item: string) => Promise<void>
  equip: (item: string) => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<Store | null>(null)
export const useStore = () => {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore hors du fournisseur')
  return s
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  return { session, ready }
}

export function StoreProvider({ session, children }: { session: Session; children: ReactNode }) {
  const uid = session.user.id
  const [profile, setProfile] = useState<Profile | null>(null)
  const [books, setBooks] = useState<UserBook[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [noteDays, setNoteDays] = useState<string[]>([])
  const [signets, setSignets] = useState(0)
  const [claimed, setClaimed] = useState<Set<string>>(new Set())
  const [circles, setCircles] = useState<Circle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [owned, setOwned] = useState<Set<string>>(new Set())
  const [pendingCount, setPendingCount] = useState(() => pendingOf(uid).length)

  const reload = useCallback(async () => {
    try {
      const [p, b, s, n, sg, cl, ci, ow] = await Promise.all([
        api.getProfile(uid), api.listBooks(uid), api.listSessions(), api.noteDays(),
        api.signetBalance(uid), api.claimedKeys(), api.listCircles(), api.ownedItems().catch(() => new Set<string>()),
      ])
      setProfile(p); setBooks(b); setSessions(s); setNoteDays(n); setSignets(sg); setClaimed(cl); setCircles(ci); setOwned(ow)
      setError('')
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Chargement impossible')
    } finally {
      setLoading(false)
    }
  }, [uid])

  useEffect(() => { void reload() }, [reload])

  const setBook = useCallback((b: UserBook) => {
    setBooks((l) => (l.some((x) => x.id === b.id) ? l.map((x) => (x.id === b.id ? b : x)) : [b, ...l]))
  }, [])

  const pay = useCallback(async (key: string, delta: number) => {
    const done = await api.award(uid, key, delta)
    if (done) {
      setSignets((n) => n + delta)
      setClaimed((c) => new Set(c).add(key))
    }
    return done
  }, [uid])

  const move = useCallback(async (b: UserBook, st: Status) => {
    const before = { status: b.status, page: b.page }
    const m0 = reached(pileCm(books))
    const updated = await api.updateBook(b.id, { status: st })
    setBook(updated)
    if ((st === 'fini' || st === 'abandon') && b.status !== st) {
      await pay(api.closeKey(b.id, st), st === 'fini' ? 30 : 10).catch(() => false)
    }
    const next = books.map((x) => (x.id === b.id ? updated : x))
    const m1 = reached(pileCm(next))
    return {
      passed: m1 && m1 !== m0 ? m1 : null,
      undo: async () => setBook(await api.updateBook(b.id, before)),
    }
  }, [books, pay, setBook])

  const patchProfile = useCallback(async (p: Partial<Omit<Profile, 'id'>>) => {
    await api.updateProfile(uid, p)
    setProfile((x) => (x ? { ...x, ...p } : x))
  }, [uid])

  const signOut = useCallback(async () => { await supabase.auth.signOut() }, [])

  useEffect(() => { if (profile) applyCosmetics(profile.equipped) }, [profile?.equipped]) // eslint-disable-line react-hooks/exhaustive-deps

  const buy = useCallback(async (item: string) => {
    const left = await api.buyItem(item)
    setSignets(left); setOwned((o) => new Set(o).add(item))
  }, [])
  const equip = useCallback(async (item: string) => {
    const eq = await api.equipItem(item)
    setProfile((x) => (x ? { ...x, equipped: eq } : x))
  }, [])

  // Le rituel est payé une fois par jour, le jour où la lecture a eu lieu.
  const payRitual = useCallback(async (day: string, before: number, added: number, goal: number) => {
    if (before < goal && before + added >= goal) return pay(`ritual:${day}`, MIN_DAILY_REWARD).catch(() => false)
    return false
  }, [pay])

  const recordSession = useCallback(async (book: UserBook, input: { minutes: number; page: number | null; circleId?: string | null }): Promise<Recorded> => {
    const today = iso(new Date())
    const before = sessions.filter((x) => x.day === today).reduce((a, x) => a + x.minutes, 0)
    try {
      const m0 = reached(pileCm(books))
      const res = await api.logSession(uid, book, input)
      const ritual = await payRitual(today, before, res.minutes, profile?.daily_minutes ?? 10)
      if (res.finished) await pay(api.closeKey(book.id, 'fini'), 30).catch(() => false)
      const m1 = reached(pileCm(books.map((b) => (b.id === book.id ? res.book : b))))
      setBook(res.book)
      void reload()
      return { queued: false, res, ritual, mark: m1 && m1 !== m0 ? m1[1] : null }
    } catch (e) {
      if (!isNetworkError(e)) throw e
      enqueue(uid, { userBookId: book.id, minutes: input.minutes, page: input.page, circleId: input.circleId ?? null })
      setPendingCount(pendingOf(uid).length)
      return { queued: true }
    }
  }, [uid, books, sessions, profile?.daily_minutes, pay, payRitual, setBook, reload])

  // Au retour du réseau (et à l'ouverture), on envoie les lectures gardées sur l'appareil.
  const flushing = useRef(false)
  const flush = useCallback(async () => {
    if (flushing.current || !navigator.onLine) return
    const list = pendingOf(uid)
    if (!list.length) return
    flushing.current = true
    let sent = 0
    try {
      let current = await api.listBooks(uid)
      let ss = await api.listSessions(30)
      for (const p of list) {
        const book = current.find((b) => b.id === p.userBookId)
        if (!book) { drop(uid, p.id); continue }
        try {
          const before = ss.filter((x) => x.day === p.day).reduce((a, x) => a + x.minutes, 0)
          const res = await api.logSession(uid, book, { minutes: p.minutes, page: p.page, circleId: p.circleId, day: p.day })
          drop(uid, p.id); sent++
          await payRitual(p.day, before, res.minutes, profile?.daily_minutes ?? 10)
          if (res.finished) await pay(api.closeKey(book.id, 'fini'), 30).catch(() => false)
          current = current.map((b) => (b.id === book.id ? res.book : b))
          ss = [...ss, { id: p.id, user_book_id: book.id, day: p.day, minutes: res.minutes, pages_read: res.gained, circle_id: p.circleId, created_at: new Date().toISOString() }]
        } catch (e) {
          if (isNetworkError(e)) break
          drop(uid, p.id) // refusée par la base (ex. livre supprimé) : inutile de réessayer sans fin
        }
      }
    } catch { /* réseau encore instable */ } finally {
      flushing.current = false
      setPendingCount(pendingOf(uid).length)
      if (sent) void reload()
    }
  }, [uid, pay, payRitual, profile?.daily_minutes, reload])

  useEffect(() => {
    if (!profile) return
    void flush()
    const on = () => void flush()
    window.addEventListener('online', on)
    return () => window.removeEventListener('online', on)
  }, [!!profile, flush]) // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<Store | null>(() => {
    if (!profile) return null
    const ws = weekStats({ sessions, books, noteDates: noteDays })
    const today = iso(new Date())
    // Livre « du moment » : celui lu en dernier parmi ceux en cours (sinon le plus récemment ajouté).
    const lastRead = new Map<string, string>()
    for (const x of sessions) if (x.user_book_id && x.created_at > (lastRead.get(x.user_book_id) ?? '')) lastRead.set(x.user_book_id, x.created_at)
    const current = books.filter((b) => b.status === 'cours').sort((a, b) => (lastRead.get(b.id) ?? '').localeCompare(lastRead.get(a.id) ?? ''))[0] ?? null
    const streak = streakOf(sessions, profile.days_goal)
    return {
      uid, email: session.user.email ?? '', profile, books, sessions, signets, claimed, circles, ws,
      row: streak.row,
      streak,
      todayMin: sessions.filter((s) => s.day === today).reduce((a, s) => a + s.minutes, 0),
      pile: pileCm(books),
      badges: computeBadges(books, sessions, streak.row),
      current, loading, error, reload, setBook, patchProfile, move, pay, signOut,
      recordSession, pendingCount, owned, buy, equip,
    }
  }, [uid, session, profile, books, sessions, noteDays, signets, claimed, circles, loading, error, reload, setBook, patchProfile, move, pay, signOut, recordSession, pendingCount, owned, buy, equip])

  if (!value) {
    return (
      <div className="auth">
        <div className="auth-card" role="status">
          {error ? (
            <>
              <h2>Impossible de charger tes données</h2>
              <p className="err">{error}</p>
              <button className="btn" onClick={() => { setLoading(true); void reload() }}>Réessayer</button>
              <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
            </>
          ) : !loading ? (
            <>
              <h2>Ton profil n’a pas été trouvé</h2>
              <p className="muted">Ton compte existe mais son profil n’a pas été créé. Déconnecte-toi puis reconnecte-toi ; si ça persiste, préviens la personne qui gère l’app.</p>
              <button className="btn" onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
            </>
          ) : (
            <p className="muted">Chargement de ta bibliothèque…</p>
          )}
        </div>
      </div>
    )
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export { MIN_DAILY_REWARD }
