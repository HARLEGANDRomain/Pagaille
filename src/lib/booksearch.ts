/* Recherche de livres : Google Books (très bon sur les titres français et les éditions de poche) et Open Library
   (bon sur les classiques et les identifiants d'œuvre), interrogés en parallèle puis fusionnés.
   Chaque résultat est une ŒUVRE ; ses éditions (éditeur, année, pages, ISBN) arrivent avec la recherche quand c'est possible. */
import type { EditionHit, WorkHit } from '../types'
import { guessGenre, listEditions, searchWorks } from './openlibrary'
import { norm } from './logic'

/* ---------- utilitaires purs (testés) ---------- */

export function isbn10to13(isbn10: string): string | null {
  const d = isbn10.replace(/[^0-9X]/gi, '')
  if (d.length !== 10) return null
  const core = '978' + d.slice(0, 9)
  if (!/^\d{12}$/.test(core)) return null
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3)
  return core + String((10 - (sum % 10)) % 10)
}

export function isIsbnQuery(q: string): string | null {
  const d = q.replace(/[\s-]/g, '')
  if (/^\d{13}$/.test(d)) return d
  if (/^\d{9}[\dX]$/i.test(d)) return isbn10to13(d)
  return null
}

const POCHE = /livre de poche|\bfolio\b|j'ai lu|pocket|10\s?\/\s?18|\bpoints\b|babel|archipoche|\bpoche\b|librio|le masque|bibliothèque verte|presses pocket|j.ai lu/i
/** Google Books ne donne pas le format : on le devine d'après la collection ou l'éditeur, et on reste muet quand on ne sait pas. */
export function guessFormat(publisher: string | null | undefined): EditionHit['format'] {
  return publisher && POCHE.test(publisher.replace(/’/g, "'")) ? 'poche' : 'autre'
}

const LANG: Record<string, string> = { fr: 'fre', en: 'eng', es: 'spa', de: 'ger', it: 'ita', pt: 'por', nl: 'dut', ja: 'jpn' }

const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'une', 'et', 'the', 'of', 'a', 'an'])
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
// « 7 lettres » et « Sept lettres » désignent le même livre : on compare les petits nombres sous une seule forme.
const NUM: Record<string, string> = { un: '1', deux: '2', trois: '3', quatre: '4', cinq: '5', six: '6', sept: '7', huit: '8', neuf: '9', dix: '10' }
export function tokens(q: string): string[] {
  return fold(q).split(' ').filter(Boolean).map((t) => NUM[t] ?? t)
}
const keyTokens = (q: string) => tokens(q).filter((t) => !STOP.has(t))

export interface GBVolume {
  id?: string
  volumeInfo?: {
    title?: string
    subtitle?: string
    authors?: string[]
    publisher?: string
    publishedDate?: string
    pageCount?: number
    industryIdentifiers?: { type: string; identifier: string }[]
    imageLinks?: { thumbnail?: string }
    language?: string
    categories?: string[]
  }
}

function yearOf(d?: string): number | null {
  const y = Number(/^\d{4}/.exec(d ?? '')?.[0])
  return y >= 1400 && y <= 2100 ? y : null
}

const cover = (u?: string) => (u ? u.replace(/^http:/, 'https:').replace('&edge=curl', '') : null)

export function editionOf(v: GBVolume): EditionHit | null {
  const i = v.volumeInfo
  if (!i?.title) return null
  const ids = i.industryIdentifiers ?? []
  const i13 = ids.find((x) => x.type === 'ISBN_13')?.identifier
  const i10 = ids.find((x) => x.type === 'ISBN_10')?.identifier
  const isbn13 = i13 && /^\d{13}$/.test(i13) ? i13 : i10 ? isbn10to13(i10) : null
  const publisher = i.publisher?.trim() || null
  return {
    olEditionId: null,
    title: i.subtitle ? `${i.title} : ${i.subtitle}` : i.title,
    publisher,
    format: guessFormat(publisher),
    pages: i.pageCount && i.pageCount > 0 ? i.pageCount : null,
    isbn13,
    coverUrl: cover(i.imageLinks?.thumbnail),
    language: i.language ? LANG[i.language] ?? i.language : null,
    year: yearOf(i.publishedDate),
  }
}

/** Édition la plus utile à suivre : française, avec pages, ISBN, couverture et de préférence de poche. */
export function editionScore(e: EditionHit): number {
  return (e.language === 'fre' ? 4 : 0) + (e.pages ? 3 : 0) + (e.isbn13 ? 1 : 0) + (e.coverUrl ? 1 : 0) + (e.format === 'poche' ? 0.5 : 0)
}
export const sortEditions = (eds: EditionHit[]) => [...eds].sort((a, b) => editionScore(b) - editionScore(a))

export function dedupeEditions(eds: EditionHit[]): EditionHit[] {
  const seen = new Set<string>()
  const out: EditionHit[] = []
  for (const e of eds) {
    const k = e.isbn13 ?? e.olEditionId ?? `${norm(e.publisher ?? '')}|${e.year}|${e.pages}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(e)
  }
  return out
}

const workKey = (title: string, author: string) => `${norm(title.replace(/[’']/g, ' '))}|${norm(author)}`

/** Regroupe des volumes Google Books (= éditions) en œuvres, puis classe par pertinence pour la recherche. */
export function groupVolumes(vols: GBVolume[], query: string): WorkHit[] {
  const groups = new Map<string, { title: string; author: string; cats: string[]; eds: EditionHit[]; rank: number }>()
  vols.forEach((v, rank) => {
    const e = editionOf(v)
    if (!e) return
    const title = v.volumeInfo!.title!.trim()
    const author = v.volumeInfo!.authors?.[0]?.trim() ?? ''
    const k = workKey(title, author)
    const g = groups.get(k)
    if (g) { g.eds.push(e); g.cats.push(...(v.volumeInfo!.categories ?? [])) }
    else groups.set(k, { title, author, cats: [...(v.volumeInfo!.categories ?? [])], eds: [e], rank })
  })
  const qt = keyTokens(query)
  const scored = [...groups.values()].map((g) => {
    const eds = sortEditions(dedupeEditions(g.eds))
    const primary = eds[0]
    const hay = new Set(keyTokens(`${g.title} ${g.author}`))
    const match = qt.length ? qt.filter((t) => hay.has(t)).length / qt.length : 0
    const years = eds.map((e) => e.year).filter((y): y is number => !!y)
    const hit: WorkHit = {
      olWorkId: null,
      title: g.title,
      author: g.author,
      year: years.length ? Math.min(...years) : null,
      genre: guessGenre(g.cats),
      pages: primary.pages,
      coverUrl: eds.find((e) => e.coverUrl)?.coverUrl ?? null,
      editionCount: eds.length,
      editions: eds,
      primary,
    }
    return { hit, score: match * 10 + editionScore(primary) - g.rank * 0.05 }
  })
  return scored.sort((a, b) => b.score - a.score).map((s) => s.hit)
}

/** Ajoute à la liste Google les œuvres Open Library absentes, et rattache l'identifiant d'œuvre quand c'est la même. */
export function mergeHits(google: WorkHit[], ol: WorkHit[], query: string): WorkHit[] {
  const byKey = new Map(google.map((g) => [workKey(g.title, g.author), g]))
  const extra: WorkHit[] = []
  for (const o of ol) {
    const g = byKey.get(workKey(o.title, o.author))
    if (g) { g.olWorkId = g.olWorkId ?? o.olWorkId; g.editionCount = Math.max(g.editionCount, o.editionCount); g.year = g.year ?? o.year }
    else extra.push(o)
  }
  const qt = keyTokens(query)
  const rel = (h: WorkHit) => (qt.length ? qt.filter((t) => keyTokens(`${h.title} ${h.author}`).includes(t)).length / qt.length : 0)
  // Les œuvres Open Library seules passent après les résultats Google qui correspondent aussi bien.
  const tail = extra.sort((a, b) => rel(b) - rel(a))
  return [...google, ...tail.filter((h) => rel(h) >= 0.5)]
}

/* ---------- réseau ---------- */

async function gbFetch(params: string, ms = 8000): Promise<GBVolume[]> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try {
    const fields = 'items(id,volumeInfo(title,subtitle,authors,publisher,publishedDate,pageCount,industryIdentifiers,imageLinks/thumbnail,language,categories))'
    const r = await fetch(`https://www.googleapis.com/books/v1/volumes?${params}&printType=books&maxResults=40&fields=${encodeURIComponent(fields)}`, { signal: ctl.signal })
    if (!r.ok) throw new Error(`Google Books a répondu ${r.status}`)
    const j = (await r.json()) as { items?: GBVolume[] }
    return j.items ?? []
  } finally {
    clearTimeout(t)
  }
}

async function googleHits(query: string): Promise<WorkHit[]> {
  const isbn = isIsbnQuery(query)
  const enc = encodeURIComponent
  const runs = isbn
    ? [gbFetch(`q=isbn:${isbn}`)]
    : [gbFetch(`q=${enc(query)}`), gbFetch(`q=${enc(query)}&langRestrict=fr`)] // 2e appel : fait remonter les éditions françaises
  const settled = await Promise.allSettled(runs)
  const ok = settled.filter((s): s is PromiseFulfilledResult<GBVolume[]> => s.status === 'fulfilled')
  if (!ok.length) throw new Error('google')
  const seen = new Set<string>()
  const vols = ok.flatMap((s) => s.value).filter((v) => (v.id ? !seen.has(v.id) && !!seen.add(v.id) : true))
  let hits = groupVolumes(vols, query)
  // Rien trouvé : on retire les petits mots (« d' », « de », « la »…) qui gênent parfois la recherche.
  const kt = keyTokens(query)
  if (!hits.length && !isbn && kt.length && kt.join(' ') !== tokens(query).join(' ')) {
    hits = groupVolumes(await gbFetch(`q=${enc(kt.join(' '))}`), query)
  }
  return hits
}

export async function searchBooks(q: string): Promise<WorkHit[]> {
  const query = q.trim().replace(/[’]/g, "'")
  if (query.length < 2) return []
  const [g, o] = await Promise.allSettled([googleHits(query), isIsbnQuery(query) ? Promise.resolve([]) : searchWorks(query)])
  if (g.status === 'rejected' && o.status === 'rejected') throw new Error('Aucune source de livres n’a répondu.')
  const google = g.status === 'fulfilled' ? g.value : []
  const ol = o.status === 'fulfilled' ? o.value : []
  return mergeHits(google, ol, query).slice(0, 10)
}

/** Éditions d'une œuvre déjà choisie ou déjà dans la bibliothèque : Open Library (si on a l'identifiant) + Google Books. */
export async function editionsFor(w: { title: string; author: string; olWorkId: string | null; known?: EditionHit[] }): Promise<EditionHit[]> {
  const [o, g] = await Promise.allSettled([
    w.olWorkId ? listEditions(w.olWorkId) : Promise.resolve([] as EditionHit[]),
    gbFetch(`q=${encodeURIComponent(`intitle:${w.title} inauthor:${w.author}`.trim())}`).then((v) => {
      const k = workKey(w.title, w.author)
      return v.filter((x) => x.volumeInfo?.title && workKey(x.volumeInfo.title, x.volumeInfo.authors?.[0] ?? '') === k).map(editionOf).filter((e): e is EditionHit => !!e)
    }),
  ])
  const all = [...(w.known ?? []), ...(g.status === 'fulfilled' ? g.value : []), ...(o.status === 'fulfilled' ? o.value : [])]
  return sortEditions(dedupeEditions(all))
}
