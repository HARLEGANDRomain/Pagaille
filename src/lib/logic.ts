/* Logique métier pure : aucune dépendance au navigateur, à React ni à Supabase. Testée dans logic.test.ts. */
import type { SessionRow, Status, UserBook } from '../types'

export const STATUS_LABEL: Record<Status, string> = {
  cours: 'En cours',
  lire: 'À lire',
  fini: 'Terminé',
  pause: 'En pause',
  abandon: 'Abandonné',
}

export const GENRES = ['Roman', 'SF', 'Fantasy', 'Polar', 'Essai', 'BD', 'Design', 'Fantastique']

/* ---------- petits outils ---------- */
export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n))

export function hash(s: string): number {
  let h = 7
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

/** Titre comparable : minuscules, sans accents ni ponctuation. */
export const norm = (s: string) =>
  String(s).toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '')

export const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`

/* ---------- dates (jour local, semaine du lundi) ---------- */
export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Lundi (à midi, pour échapper aux changements d'heure) de la semaine de `d`. */
export function monday(d: Date): Date {
  const x = new Date(d)
  x.setHours(12, 0, 0, 0)
  return addDays(x, -((x.getDay() + 6) % 7))
}

export const weekId = (d: Date = new Date()) => iso(monday(d))
export const weekDates = (d: Date = new Date()) =>
  Array.from({ length: 7 }, (_, i) => iso(addDays(monday(d), i)))
export const dayIdx = (d: Date = new Date()) => (d.getDay() + 6) % 7

/* ---------- la pile en centimètres ---------- */
export const CM = 0.0065 // épaisseur moyenne d'une page de poche, en cm
export const MARKS: [number, string][] = [
  [2, 'un jeu de cartes'],
  [9, 'une tasse à café'],
  [30, 'une bouteille de vin'],
  [50, 'une table de chevet'],
  [75, 'un bureau'],
  [100, 'un mètre tout rond'],
  [204, 'une porte'],
]
export const fmtCm = (cm: number) => cm.toFixed(1).replace('.', ',') + ' cm'
export const pagesRead = (books: Pick<UserBook, 'page'>[]) => books.reduce((a, b) => a + (b.page || 0), 0)
export const pileCm = (books: Pick<UserBook, 'page'>[]) => pagesRead(books) * CM
export const reached = (cm: number) => MARKS.filter((m) => m[0] <= cm).pop()
export const nextMark = (cm: number) => MARKS.find((m) => m[0] > cm)

/* ---------- livres ---------- */
export const totalOf = (b: Pick<UserBook, 'total_pages' | 'edition'>) => b.total_pages ?? b.edition?.pages ?? 0
export const pct = (b: Pick<UserBook, 'page' | 'total_pages' | 'edition'>) => {
  const t = totalOf(b)
  return t ? clamp(Math.round((b.page / t) * 100), 0, 100) : 0
}

/** Couleurs de tranche : dérivées du titre, donc stables d'un appareil à l'autre. */
export const SPINES: [string, string][] = [
  ['#7A2333', '#F6E9D8'], ['#1F4D45', '#EDE6CF'], ['#1D3F6E', '#F1EBDD'], ['#C9772B', '#1E1608'],
  ['#4A2C5E', '#F0E4EE'], ['#DAD3C2', '#2A2620'], ['#B5423A', '#FBEFE2'], ['#2A2D3A', '#E8D9A8'],
  ['#5E7F8C', '#0F1A1E'], ['#E0B84A', '#2B2105'],
]
export const spineColors = (title: string) => SPINES[hash(title) % SPINES.length]
export const coverPattern = (title: string) => hash(title + 'c') % 5

/* ---------- missions de la semaine ---------- */
export interface WeekStats {
  days: number
  dates: Set<string>
  min: number
  pages: number
  team: number
  add: number
  close: number
  note: number
}

export interface Mission {
  id: string
  label: string
  goal: number
  reward: number
  val: (s: WeekStats) => number
}

export const MISSIONS: Mission[] = [
  { id: 'min', label: 'Cumule 45 minutes de lecture', goal: 45, reward: 40, val: (s) => s.min },
  { id: 'pages', label: 'Avance de 40 pages', goal: 40, reward: 40, val: (s) => s.pages },
  { id: 'team', label: 'Lis une fois avec ton cercle', goal: 1, reward: 50, val: (s) => s.team },
  { id: 'add', label: 'Ajoute un livre à ta pile à lire', goal: 1, reward: 20, val: (s) => s.add },
  { id: 'close', label: 'Tranche un livre : termine-le ou abandonne-le', goal: 1, reward: 50, val: (s) => s.close },
  { id: 'note', label: 'Écris une note sur un livre', goal: 1, reward: 30, val: (s) => s.note },
]

/** Trois missions qui tournent chaque lundi, les mêmes pour tout le monde la même semaine. */
export function weekMissions(d: Date = new Date()): Mission[] {
  const n = Math.floor(monday(d).getTime() / 6048e5)
  return [0, 2, 3].map((o) => MISSIONS[(n + o) % 6])
}

export const DAYS_MISSION = { id: 'days', reward: 60 }

export interface WeekInput {
  sessions: Pick<SessionRow, 'day' | 'minutes' | 'pages_read' | 'circle_id'>[]
  books: Pick<UserBook, 'added_at' | 'closed_at' | 'status'>[]
  noteDates: string[] // jours (iso) où une note personnelle a été écrite ou modifiée
}

const dayOf = (ts: string) => iso(new Date(ts))

export function weekStats({ sessions, books, noteDates }: WeekInput, now: Date = new Date()): WeekStats {
  const w = weekId(now)
  const end = iso(addDays(monday(now), 7))
  const inWeek = (d: string) => d >= w && d < end
  const ss = sessions.filter((s) => inWeek(s.day))
  return {
    days: new Set(ss.map((s) => s.day)).size,
    dates: new Set(ss.map((s) => s.day)),
    min: ss.reduce((a, s) => a + s.minutes, 0),
    pages: ss.reduce((a, s) => a + s.pages_read, 0),
    team: ss.some((s) => s.circle_id) ? 1 : 0,
    add: books.filter((b) => b.status === 'lire' && inWeek(dayOf(b.added_at))).length,
    close: books.filter((b) => b.closed_at && inWeek(dayOf(b.closed_at))).length,
    note: noteDates.filter(inWeek).length,
  }
}

/**
 * Série comptée en semaines : combien de semaines d'affilée ont tenu l'objectif de jours.
 * La semaine en cours compte dès qu'elle est tenue, mais ne casse jamais la série tant qu'elle n'est pas finie.
 */
export function weeksRow(sessions: Pick<SessionRow, 'day'>[], daysGoal: number, now: Date = new Date()): number {
  const perWeek = new Map<string, Set<string>>()
  for (const s of sessions) {
    const w = weekId(new Date(s.day + 'T12:00:00'))
    if (!perWeek.has(w)) perWeek.set(w, new Set())
    perWeek.get(w)!.add(s.day)
  }
  const kept = (w: string) => (perWeek.get(w)?.size ?? 0) >= daysGoal
  const cur = monday(now)
  let n = kept(iso(cur)) ? 1 : 0
  for (let i = 1; kept(iso(addDays(cur, -7 * i))); i++) n++
  return n
}

export const MIN_DAILY_REWARD = 10

export interface Badge { name: string; how: string; got: boolean }
export function badges(books: Pick<UserBook, 'status'>[], sessions: Pick<SessionRow, 'pages_read' | 'circle_id'>[], row: number): Badge[] {
  const fin = books.filter((b) => b.status === 'fini').length
  const pages = sessions.reduce((a, s) => a + s.pages_read, 0)
  return [
    { name: 'Première tranche', how: 'Ajouter un livre', got: books.length > 0 },
    { name: 'Dix minutes', how: 'Faire une première session', got: sessions.length > 0 },
    { name: 'Sans regret', how: 'Abandonner un livre qui ne te plaît pas', got: books.some((b) => b.status === 'abandon') },
    { name: 'Trois de finis', how: 'Terminer trois livres', got: fin >= 3 },
    { name: 'Cent pages', how: 'Lire 100 pages au total', got: pages >= 100 },
    { name: 'Semaine tenue', how: 'Atteindre ton objectif hebdo', got: row > 0 },
    { name: 'En bonne compagnie', how: 'Lire avec ton cercle', got: sessions.some((s) => s.circle_id) },
  ]
}

/**
 * Page atteinte après une session, bornée au total de l'édition.
 * Retourne aussi le nombre de pages gagnées : jamais négatif, même si on corrige la page vers l'arrière.
 */
export function applyPage(current: number, entered: number | null, total: number) {
  if (entered == null || Number.isNaN(entered)) return { page: current, gained: 0 }
  const p = total ? clamp(Math.round(entered), 0, total) : Math.max(0, Math.round(entered))
  return { page: Math.max(current, p), gained: Math.max(0, p - current) }
}

/** Même règle que la base : une note se dévoile quand la progression dépasse son ratio de 2 points. */
export const noteUnlocked = (readerProgress: number, finished: boolean, ratio: number) =>
  finished || readerProgress >= ratio + 0.02

export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c)
