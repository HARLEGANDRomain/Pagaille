/* Discussion des cercles, disponible partout dans l'appli (et pendant la lecture) :
   les messages arrivent en temps réel même quand on n'est pas sur l'onglet Cercle, d'où un compteur de non-lus. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import * as api from './api'
import { useStore } from './store'
import type { Member, Message } from '../types'

interface Chat {
  messages: (circleId: string) => Message[]
  members: (circleId: string) => Member[]
  unread: (circleId?: string) => number
  markRead: (circleId: string) => void
  send: (circleId: string, body: string) => Promise<void>
  /** Panneau de discussion ouvert par-dessus l'écran courant. */
  open: boolean
  setOpen: (o: boolean) => void
  active: string | null
  setActive: (id: string) => void
}

const Ctx = createContext<Chat | null>(null)
export const useChat = () => {
  const c = useContext(Ctx)
  if (!c) throw new Error('useChat hors du fournisseur')
  return c
}

const readKey = (uid: string, c: string) => `pagaille.read.${uid}.${c}`

export function ChatProvider({ children }: { children: ReactNode }) {
  const st = useStore()
  const ids = st.circles.map((c) => c.id).join(',')
  const [msgs, setMsgs] = useState<Record<string, Message[]>>({})
  const [mems, setMems] = useState<Record<string, Member[]>>({})
  const [read, setRead] = useState<Record<string, string>>({})
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<string | null>(st.circles[0]?.id ?? null)
  const uid = st.uid
  const uidRef = useRef(uid)
  uidRef.current = uid
  const memsRef = useRef(mems)
  memsRef.current = mems

  useEffect(() => {
    if (!active || !st.circles.some((c) => c.id === active)) setActive(st.circles[0]?.id ?? null)
  }, [ids]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const list = ids ? ids.split(',') : []
    let live = true
    const r: Record<string, string> = {}
    for (const c of list) { try { r[c] = localStorage.getItem(readKey(uid, c)) ?? '' } catch { r[c] = '' } }
    setRead(r)
    for (const c of list) {
      Promise.all([api.listMessages(c), api.listMembers(c)]).then(([m, mb]) => {
        if (!live) return
        setMsgs((x) => ({ ...x, [c]: m }))
        setMems((x) => ({ ...x, [c]: mb }))
        // Premier passage sur un cercle : rien n'est « non lu », sinon tout l'historique le serait.
        if (!r[c]) {
          const last = m[m.length - 1]?.created_at ?? new Date().toISOString()
          try { localStorage.setItem(readKey(uid, c), last) } catch { /* sans effet */ }
          setRead((x) => ({ ...x, [c]: last }))
        }
      }).catch(() => {})
    }
    const chans = list.map((c) =>
      supabase
        .channel(`chat:${c}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'circle_messages', filter: `circle_id=eq.${c}` }, (p) => {
          const m = p.new as Message
          setMsgs((x) => ({ ...x, [c]: (x[c] ?? []).some((y) => y.id === m.id) ? x[c] : [...(x[c] ?? []), m].slice(-120) }))
          // Un nouveau venu dans le cercle : on recharge les membres pour afficher son nom.
          if (!(memsRef.current[c] ?? []).some((y) => y.user_id === m.user_id)) void api.listMembers(c).then((mb) => setMems((z) => ({ ...z, [c]: mb }))).catch(() => {})
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'circle_messages' }, (p) => {
          const id = (p.old as { id?: number }).id
          if (id) setMsgs((x) => ({ ...x, [c]: (x[c] ?? []).filter((y) => y.id !== id) }))
        })
        .subscribe(),
    )
    return () => { live = false; chans.forEach((ch) => void supabase.removeChannel(ch)) }
  }, [ids, uid])

  const markRead = useCallback((c: string) => {
    const last = msgs[c]?.[msgs[c].length - 1]?.created_at
    if (!last || (read[c] ?? '') >= last) return
    try { localStorage.setItem(readKey(uidRef.current, c), last) } catch { /* sans effet */ }
    setRead((x) => ({ ...x, [c]: last }))
  }, [msgs, read])

  const unread = useCallback((c?: string) => {
    const count = (id: string) => (msgs[id] ?? []).filter((m) => m.user_id !== uid && m.created_at > (read[id] ?? '')).length
    return c ? count(c) : Object.keys(msgs).reduce((a, id) => a + count(id), 0)
  }, [msgs, read, uid])

  const send = useCallback(async (c: string, body: string) => { await api.sendMessage(uid, c, body) }, [uid])

  const value = useMemo<Chat>(() => ({
    messages: (c) => msgs[c] ?? [],
    members: (c) => mems[c] ?? [],
    unread, markRead, send, open, setOpen, active, setActive,
  }), [msgs, mems, unread, markRead, send, open, active])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
