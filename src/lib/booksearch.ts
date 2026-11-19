/* Recherche de livres. Trois sources, interrogées en parallèle puis fusionnées :
   - la fonction serveur « books » (Supabase) : Google Books avec la clé du projet + catalogue de la BnF, avec cache ;
   - Open Library, appelé directement (gratuit, bon sur les classiques et les identifiants d'œuvre) ;
   - Google Books en direct, seulement si la fonction serveur ne répond pas.
   Chaque résultat est une ŒUVRE ; ses éditions (éditeur, année, pages, ISBN) arrivent avec la recherche quand c'est possible. */
import type { EditionHit, WorkHit } from '../types'
import { listEditions, searchWorks, isbnCover } from './openlibrary'
import { guessGenres } from './genres'
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

/** Vérifie la clé de contrôle d'un EAN-13 (utile pour le scan : un code mal lu est rejeté). */
export function validEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(code[i]) * (i % 2 === 0 ? 1 : 3)
  return (10 - (sum % 10)) % 10 === Number(code[12])
}

export function isIsbnQuery(q: string): string | null {
  const d = q.replace(/[\s-]/g, '')
  if (/^\d{13}$/.test(d)) return d
  if (/^\d{9}[\dX]$/i.test(d)) return isbn10to13(d)
  return null
}

const POCHE = /livre de poche|\bfolio\b|j'ai lu|pocket|10\s?\/\s?18|\bpoints\b|babel|archipoche|\bpoche\b|librio|le masque|bibliothèque verte|presses pocket|j.ai lu|\bl\.?g\.?f\b/i
/** Google Books ne donne pas le format : on le devine d'après la collection ou l'éditeur, et on reste muet quand on ne sait pas. */
export function guessFormat(publisher: string | null | undefined): EditionHit['format'] {
  return publisher && POCHE.test(publisher.replace(/’/g, "'")) ? 'poche' : 'autre'
}

const LANG: Record<string, string> = { fr: 'fre', en: 'eng', es: 'spa', de: 'ger', it: 'ita', pt: 'por', nl: 'dut', ja: 'jpn' }

const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'une', 'un', 'et', 'the', 'of', 'a', 'an', 'par'])
export const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
// « 7 lettres » et « Sept lettres » désignent le même livre : on compare les petits nombres sous une seule forme.
const NUM: Record<string, string> = { sept: '7', deux: '2', trois: '3', quatre: '4', cinq: '5', six: '6', huit: '8', neuf: '9', dix: '10' }
export function tokens(q: string): string[] {
  return fold(q).split(' ').filter(Boolean).map((t) => NUM[t] ?? t)
}
export const keyTokens = (q: string) => tokens(q).filter((t) => !STOP.has(t))

/** Distance d'édition bornée (on s'arrête dès que la borne est dépassée). */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      best = Math.min(best, cur[j])
    }
    if (best > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

/** Un mot tapé correspond-il à un mot du livre ? Tolère une faute (« stephan » ≈ « stephen »),
    deux sur les mots longs, et un mot tapé incomplet (« camu » → « camus », « corne » → « cornes »). */
export function tokenMatches(t: string, hay: string[]): boolean {
  for (const h of hay) {
    if (h === t) return true
    if (t.length >= 4 && h.startsWith(t)) return true
    if (/^\d+$/.test(t) || /^\d+$/.test(h)) continue
    const tol = t.length >= 8 ? 2 : t.length >= 5 ? 1 : 0
    if (tol && editDistance(t, h, tol) <= tol) return true
  }
  return false
}

/** Pertinence d'un résultat (0 à 1) : part des mots de la recherche retrouvés dans le titre ou l'auteur. */
export function relevance(query: string, title: string, author: string): number {
  const qt = keyTokens(query)
  if (!qt.length) return 0
  const hay = keyTokens(`${title} ${author}`)
  return qt.filter((t) => tokenMatches(t, hay)).length / qt.length
}

/** Mots du titre absents de la recherche : « Albert Camus et l'Étranger » est moins bon que « L'Étranger » pour « l'étranger camus ». */
function extraTitleWords(query: string, title: string): number {
  const qt = keyTokens(query)
  return keyTokens(title).filter((w) => !tokenMatches(w, qt)).length
}

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
    /** Renseignés par la fonction serveur pour les notices de la BnF. */
    source?: 'bnf'
    format?: 'poche' | 'broche'
    collection?: string
  }
}

function yearOf(d?: string): number | null {
  const y = Number(/^\d{4}/.exec(d ?? '')?.[0])
  return y >= 1400 && y <= 2100 ? y : null
}

/** Miniature Google en meilleure définition, en https, sans le coin corné ajouté par Google. */
export const googleCover = (u?: string) => (u ? u.replace(/^http:/, 'https:').replace('&edge=curl', '').replace(/zoom=\d/, 'zoom=1') : null)

export function editionOf(v: GBVolume): EditionHit | null {
  const i = v.volumeInfo
  if (!i?.title) return null
  const ids = i.industryIdentifiers ?? []
  const i13 = ids.find((x) => x.type === 'ISBN_13')?.identifier
  const i10 = ids.find((x) => x.type === 'ISBN_10')?.identifier
  const isbn13 = i13 && /^\d{13}$/.test(i13) ? i13 : i10 ? isbn10to13(i10) : null
  const publisher = i.publisher?.trim() || null
  const fmt = guessFormat(`${publisher ?? ''} ${i.collection ?? ''}`)
  return {
    olEditionId: null,
    title: i.subtitle ? `${i.title} : ${i.subtitle}` : i.title,
    publisher,
    format: fmt !== 'autre' ? fmt : i.format ?? 'autre',
    pages: i.pageCount && i.pageCount > 0 ? i.pageCount : null,
    isbn13,
    // Pas de couverture Google (cas de la BnF) : on tente Open Library par l'ISBN.
    coverUrl: googleCover(i.imageLinks?.thumbnail) ?? (isbn13 ? isbnCover(isbn13) : null),
    language: i.language ? LANG[i.language] ?? i.language : null,
    year: yearOf(i.publishedDate),
  }
}

/** Édition la plus utile à suivre : française, avec pages, ISBN, une vraie couverture et de préférence de poche. */
export function editionScore(e: EditionHit): number {
  const realCover = e.coverUrl && !e.coverUrl.includes('default=false')
  return (e.language === 'fre' ? 4 : 0) + (e.pages ? 3 : 0) + (e.isbn13 ? 1 : 0) + (realCover ? 1 : e.coverUrl ? 0.4 : 0) + (e.format === 'poche' ? 0.5 : 0)
}
export const sortEditions = (eds: EditionHit[]) => [...eds].sort((a, b) => editionScore(b) - editionScore(a))

export function dedupeEditions(eds: EditionHit[]): EditionHit[] {
  const seen = new Map<string, EditionHit>()
  for (const e of eds) {
    const k = e.isbn13 ?? e.olEditionId ?? `${norm(e.publisher ?? '')}|${e.year}|${e.pages}`
    const prev = seen.get(k)
    if (!prev) { seen.set(k, e); continue }
    // Même ISBN vu deux fois (Google et BnF) : on complète l'une par l'autre.
    seen.set(k, {
      ...prev,
      pages: prev.pages ?? e.pages,
      coverUrl: prev.coverUrl && !prev.coverUrl.includes('default=false') ? prev.coverUrl : e.coverUrl ?? prev.coverUrl,
      format: prev.format !== 'autre' ? prev.format : e.format,
      publisher: prev.publisher ?? e.publisher,
      year: prev.year ?? e.year,
      language: prev.language ?? e.language,
    })
  }
  return [...seen.values()]
}

/** Titre d'œuvre comparable : sans article de tête ni tome (« Ça. 2 » reste distinct de « Ça »). */
const workKey = (title: string, author: string) => `${fold(title.replace(/[’']/g, ' ')).replace(/^(l|le|la|les|the) /, '')}|${fold(author).split(' ').sort().join(' ')}`

/** Regroupe des volumes (= éditions) en œuvres, puis classe par pertinence pour la recherche. */
export function groupVolumes(vols: GBVolume[], query: string, keepAll = false): WorkHit[] {
  const groups = new Map<string, { title: string; author: string; cats: string[]; eds: EditionHit[]; rank: number; fr: boolean }>()
  vols.forEach((v, rank) => {
    const e = editionOf(v)
    if (!e) return
    const title = cleanTitle(v.volumeInfo!.title!)
    const author = v.volumeInfo!.authors?.[0]?.trim() ?? ''
    const k = workKey(title, author)
    const g = groups.get(k)
    if (g) {
      g.eds.push(e); g.cats.push(...(v.volumeInfo!.categories ?? []))
      // Le titre affiché est celui d'une édition française quand il y en a une.
      if (!g.fr && e.language === 'fre') { g.title = title; g.fr = true }
      g.rank = Math.min(g.rank, rank)
    } else groups.set(k, { title, author, cats: [...(v.volumeInfo!.categories ?? [])], eds: [e], rank, fr: e.language === 'fre' })
  })
  const scored = [...groups.values()].map((g) => {
    const eds = sortEditions(dedupeEditions(g.eds))
    const primary = eds[0]
    const years = eds.map((e) => e.year).filter((y): y is number => !!y)
    const genres = guessGenres(g.cats)
    const hit: WorkHit = {
      olWorkId: null,
      title: g.title,
      author: g.author,
      year: years.length ? Math.min(...years) : null,
      genre: genres[0],
      genres,
      pages: primary.pages,
      coverUrl: primary.coverUrl ?? eds.find((e) => e.coverUrl)?.coverUrl ?? null,
      editionCount: eds.length,
      editions: eds,
      primary,
    }
    const rel = keepAll ? 1 : relevance(query, g.title, g.author)
    return { hit, rel, score: rel * 10 - (keepAll ? 0 : extraTitleWords(query, g.title) * 0.6) + editionScore(primary) + Math.min(eds.length, 5) * 0.2 - g.rank * 0.02 }
  })
  return scored.filter((s) => s.rel > 0).sort((a, b) => b.score - a.score).map((s) => s.hit)
}

/** « Après : roman » → « Après » ; casse du premier caractère rétablie. */
function cleanTitle(t: string): string {
  const s = t.trim().replace(/\s*:\s*(roman|novel|a novel|nouvelles|récit)\s*$/i, '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Ajoute à la liste les œuvres Open Library absentes, et rattache l'identifiant d'œuvre quand c'est la même. */
export function mergeHits(main: WorkHit[], ol: WorkHit[], query: string): WorkHit[] {
  const byKey = new Map(main.map((g) => [workKey(g.title, g.author), g]))
  const extra: WorkHit[] = []
  for (const o of ol) {
    const g = byKey.get(workKey(o.title, o.author))
    if (g) {
      g.olWorkId = g.olWorkId ?? o.olWorkId
      g.editionCount = Math.max(g.editionCount, o.editionCount)
      g.year = o.year ?? g.year // Open Library connaît mieux la date de première parution
      if (!g.coverUrl) g.coverUrl = o.coverUrl
    } else extra.push(o)
  }
  const rel = (h: WorkHit) => relevance(query, h.title, h.author)
  const tail = extra.filter((h) => rel(h) >= 0.5).sort((a, b) => rel(b) - rel(a))
  // Une œuvre Open Library très pertinente passe devant un résultat principal peu pertinent.
  return [...main, ...tail].sort((a, b) => Math.round(rel(b) * 2) - Math.round(rel(a) * 2))
}

/* ---------- réseau ---------- */

interface ServerResult { google: GBVolume[]; bnf: GBVolume[]; errors?: string[]; keyed?: boolean }

/** Appelle la fonction serveur ; `null` si elle est injoignable (l'appli bascule alors sur Google en direct). */
async function viaServer(body: Record<string, string>): Promise<ServerResult | null> {
  try {
    const { supabase } = await import('./supabase') // import différé : les tests purs n'ont pas besoin de Supabase
    const { data, error } = await supabase.functions.invoke<ServerResult>('books', { body })
    if (error || !data) return null
    return data
  } catch {
    return null
  }
}

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

async function volumesFor(query: string): Promise<GBVolume[] | null> {
  const isbn = isIsbnQuery(query)
  const s = await viaServer(isbn ? { isbn } : { q: query })
  if (s && (s.google.length || s.bnf.length || !s.errors?.length)) return [...s.google, ...s.bnf]
  // Serveur injoignable ou toutes ses sources en panne : dernier recours, Google en direct.
  const enc = encodeURIComponent
  const direct = await Promise.allSettled(isbn ? [gbFetch(`q=isbn:${isbn}`)] : [gbFetch(`q=${enc(query)}`), gbFetch(`q=${enc(query)}&langRestrict=fr`)])
  const ok = direct.filter((d): d is PromiseFulfilledResult<GBVolume[]> => d.status === 'fulfilled')
  if (!ok.length) return s ? [...s.google, ...s.bnf] : null
  return ok.flatMap((d) => d.value)
}

const memo = new Map<string, WorkHit[]>()

export async function searchBooks(q: string): Promise<WorkHit[]> {
  const query = q.trim().replace(/[’]/g, "'")
  if (query.length < 2) return []
  const k = fold(query)
  if (memo.has(k)) return memo.get(k)!
  const isbn = isIsbnQuery(query)
  const [v, o] = await Promise.allSettled([volumesFor(query), isbn ? Promise.resolve([] as WorkHit[]) : searchWorks(query)])
  const vols = v.status === 'fulfilled' ? v.value : null
  const ol = o.status === 'fulfilled' ? o.value : []
  if (!vols && o.status === 'rejected') throw new Error('Aucune source de livres n’a répondu.')
  const seen = new Set<string>()
  const uniq = (vols ?? []).filter((x) => (x.id ? !seen.has(x.id) && !!seen.add(x.id) : true))
  let hits = isbn ? groupVolumes(uniq, query, true) : mergeHits(groupVolumes(uniq, query), ol, query)

  // Peu de résultats pertinents : on relance Open Library sans chacun des mots, un mot mal tapé suffisant à tout bloquer.
  const kt = keyTokens(query)
  const good = hits.filter((h) => relevance(query, h.title, h.author) >= 0.67).length
  if (!isbn && good < 2 && kt.length >= 2 && kt.length <= 4) {
    const variants = kt.map((_, i) => kt.filter((__, j) => j !== i).join(' ')).filter((x) => x.length >= 3)
    const more = (await Promise.allSettled(variants.map((x) => searchWorks(x))))
      .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    hits = mergeHits(hits, more, query)
  }
  const out = hits.slice(0, 12)
  if (out.length) memo.set(k, out)
  return out
}

/** Éditions d'une œuvre déjà choisie ou déjà dans la bibliothèque : Open Library (si on a l'identifiant), Google et BnF. */
export async function editionsFor(w: { title: string; author: string; olWorkId: string | null; known?: EditionHit[] }): Promise<EditionHit[]> {
  const k = workKey(w.title, w.author)
  const sameWork = (x: GBVolume) => !!x.volumeInfo?.title && (workKey(cleanTitle(x.volumeInfo.title), x.volumeInfo.authors?.[0] ?? '') === k || workKey(cleanTitle(x.volumeInfo.title), '') === workKey(w.title, ''))
  const [o, s] = await Promise.allSettled([
    w.olWorkId ? listEditions(w.olWorkId) : Promise.resolve([] as EditionHit[]),
    viaServer({ title: w.title, author: w.author }).then(async (r) => {
      const vols = r ? [...r.google, ...r.bnf] : await gbFetch(`q=${encodeURIComponent(`intitle:${w.title} inauthor:${w.author}`.trim())}`)
      return vols.filter(sameWork).map(editionOf).filter((e): e is EditionHit => !!e)
    }),
  ])
  const all = [...(w.known ?? []), ...(s.status === 'fulfilled' ? s.value : []), ...(o.status === 'fulfilled' ? o.value : [])]
  return sortEditions(dedupeEditions(all))
}

/** Livres d'un genre pour « Découvrir » (Google Books, en français, via le serveur et son cache).
    Seules les œuvres avec une édition française, une couverture et un nombre de pages sont gardées. */
export async function booksForSubject(subject: string): Promise<WorkHit[]> {
  const r = await viaServer({ subject })
  if (!r) return []
  return groupVolumes(r.google, '', true).filter((h) => h.primary?.language === 'fre' && h.coverUrl && h.pages)
}
