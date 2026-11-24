import { useSyncExternalStore } from 'react'

/* Les objets sortis et leur place, gardés SUR L'APPAREIL (localStorage) : la mise en page du téléphone
   et celle de l'ordinateur n'ont rien à voir, une place retenue sur l'un n'aurait pas de sens sur l'autre.
   L'achat, lui, reste en base (owned_items). */

export interface Placement {
  /** Clé du perchoir (attribut data-perch), ou « @sol » pour le bas de l'écran. */
  key: string
  /** Position relative du pied le long de la surface, de 0 à 1. */
  fx: number
  /** Onglet où l'objet a été posé ; null s'il est posé sur un élément présent partout (barre de navigation). */
  route: string | null
}

/* Les clés sont des identifiants d'EXEMPLAIRE (lib/trinkets/variants.ts) : « obj-chat » pour le premier,
   « obj-chat#2 »… ensuite. Le premier garde l'id de l'article : les places retenues avant les exemplaires restent valables. */
export interface DeskState {
  out: string[]
  place: Record<string, Placement>
  /** Bougies éteintes (exemplaires). */
  candlesOff: string[]
}

const EMPTY: DeskState = { out: [], place: {}, candlesOff: [] }
let uid = ''
let state: DeskState = EMPTY
const subs = new Set<() => void>()
const keyOf = (u: string) => `pagaille.desk.${u}`

function emit(next: DeskState) {
  state = next
  try { localStorage.setItem(keyOf(uid), JSON.stringify(state)) } catch { /* stockage indisponible : la session continue sans mémoire */ }
  subs.forEach((f) => f())
}

/** À appeler une fois par compte. `legacy` : l'objet porté avant cette version, sorti d'office la première fois. */
export function initDesk(u: string, legacy: string | undefined) {
  if (u === uid) return
  uid = u
  let saved: DeskState | null = null
  try { saved = JSON.parse(localStorage.getItem(keyOf(u)) ?? 'null') } catch { saved = null }
  if (saved && Array.isArray(saved.out)) {
    const old = saved as DeskState & { candleOff?: boolean } // avant les exemplaires : une seule bougie
    state = { out: old.out, place: old.place ?? {}, candlesOff: Array.isArray(old.candlesOff) ? old.candlesOff : old.candleOff ? ['obj-bougie'] : [] }
  } else state = { ...EMPTY, out: legacy && legacy !== 'obj-rien' ? [legacy] : [] }
  subs.forEach((f) => f())
}

export const desk = {
  get: () => state,
  /** Sort ou range un exemplaire. Renvoie false si le plafond d'objets sortis (`max`) est atteint. */
  setOut(id: string, on: boolean, max = Infinity) {
    const out = state.out.filter((x) => x !== id)
    if (on && !state.out.includes(id) && out.length >= max) return false
    const place = { ...state.place }
    delete place[id] // sorti à nouveau : il retombe sur la barre de navigation
    emit({ ...state, out: on ? [...out, id] : out, place })
    return true
  },
  place(id: string, p: Placement | null) {
    const place = { ...state.place }
    if (p) place[id] = p
    else delete place[id]
    emit({ ...state, place })
  },
  /** Tous les objets retournent sur la barre de navigation. */
  regroup() { emit({ ...state, place: {} }) },
  setCandleOff(copy: string, off: boolean) {
    const has = state.candlesOff.includes(copy)
    if (off !== has) emit({ ...state, candlesOff: off ? [...state.candlesOff, copy] : state.candlesOff.filter((x) => x !== copy) })
  },
}

export function useDesk(): DeskState {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => state)
}
