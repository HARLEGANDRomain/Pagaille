import { useEffect, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

/* Qui lit en ce moment dans un cercle (Supabase Realtime, presence ; rien en base).
   Un seul canal par cercle pour toute l'appli, partagé par compteur : la page du cercle écoute (la pièce),
   l'écran de lecture écoute ET se signale. Deux canaux sur le même sujet dans un même client se gêneraient. */

export interface Reader { id: string; name: string; color: string; url?: string | null }
export type ReaderMeta = Omit<Reader, 'id'>

interface Entry {
  ch: RealtimeChannel
  refs: number
  readers: Reader[]
  listeners: Set<(r: Reader[]) => void>
  subscribed: boolean
  meta: ReaderMeta | null
  tracking: number // nombre d'écrans qui signalent « je lis »
}
const entries = new Map<string, Entry>()

function acquire(circleId: string, uid: string): Entry {
  let e = entries.get(circleId)
  if (e) { e.refs++; return e }
  const ch = supabase.channel(`presence:${circleId}`, { config: { presence: { key: uid } } })
  const entry: Entry = { ch, refs: 1, readers: [], listeners: new Set(), subscribed: false, meta: null, tracking: 0 }
  ch.on('presence', { event: 'sync' }, () => {
    const state = ch.presenceState() as Record<string, Partial<ReaderMeta>[]>
    entry.readers = Object.entries(state).map(([id, v]) => ({ id, name: v[0]?.name ?? '?', color: v[0]?.color ?? '#161D3A', url: v[0]?.url ?? null }))
    entry.listeners.forEach((f) => f(entry.readers))
  })
  ch.subscribe((s) => {
    if (s !== 'SUBSCRIBED') return
    entry.subscribed = true
    if (entry.tracking > 0 && entry.meta) void ch.track(entry.meta)
  })
  entries.set(circleId, entry)
  return entry
}

function release(circleId: string) {
  const e = entries.get(circleId)
  if (!e || --e.refs > 0) return
  entries.delete(circleId)
  void supabase.removeChannel(e.ch)
}

/** Les lecteurs présents dans un cercle (soi compris si on lit). Avec `me`, se signale comme lecteur tant que monté. */
export function useReaders(circleId: string | null | undefined, uid: string, me?: ReaderMeta | null): Reader[] {
  const [readers, setReaders] = useState<Reader[]>([])
  const name = me?.name, color = me?.color, url = me?.url
  useEffect(() => {
    if (!circleId) { setReaders([]); return }
    const e = acquire(circleId, uid)
    setReaders(e.readers)
    e.listeners.add(setReaders)
    const tracks = name !== undefined
    if (tracks) {
      e.tracking++
      e.meta = { name: name!, color: color ?? '#161D3A', url: url ?? null }
      if (e.subscribed) void e.ch.track(e.meta)
    }
    return () => {
      e.listeners.delete(setReaders)
      if (tracks && --e.tracking === 0 && e.subscribed) void e.ch.untrack()
      release(circleId)
    }
  }, [circleId, uid, name, color, url])
  return readers
}
