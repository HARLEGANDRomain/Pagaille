/* Lectures enregistrées sans réseau (métro, avion…) : gardées sur l'appareil, envoyées dès que le réseau revient.
   Le jour de lecture est celui où on a lu, pas celui de l'envoi. */
import { iso } from './logic'

export interface PendingSession {
  id: string
  userBookId: string
  minutes: number
  page: number | null
  circleId: string | null
  day: string
  at: number
}

const key = (uid: string) => `pagaille.pending.${uid}`

export function pending(uid: string): PendingSession[] {
  try { return JSON.parse(localStorage.getItem(key(uid)) ?? '[]') as PendingSession[] } catch { return [] }
}

function save(uid: string, list: PendingSession[]) {
  try { localStorage.setItem(key(uid), JSON.stringify(list)) } catch { /* stockage plein ou interdit */ }
}

export function enqueue(uid: string, s: Omit<PendingSession, 'id' | 'at' | 'day'> & { day?: string }): PendingSession {
  const item: PendingSession = { ...s, day: s.day ?? iso(new Date()), id: crypto.randomUUID(), at: Date.now() }
  save(uid, [...pending(uid), item])
  return item
}

export function drop(uid: string, id: string) {
  save(uid, pending(uid).filter((x) => x.id !== id))
}

/** Erreur réseau (et non refus de la base) : la lecture mérite d'être gardée pour plus tard. */
export const isNetworkError = (e: unknown) => {
  const m = String((e as { message?: string })?.message ?? e)
  return !navigator.onLine || /Failed to fetch|NetworkError|Load failed|fetch failed|network/i.test(m)
}
