/* Recherche de livres dans Open Library. Une œuvre (works) a plusieurs éditions : on cherche des œuvres,
   puis on propose les éditions à la demande. Aucune clé n'est nécessaire. */
import type { Edition, EditionHit, WorkHit } from '../types'
import { guessGenres } from './genres'

const BASE = 'https://openlibrary.org'

async function getJson<T>(url: string, ms = 8000): Promise<T> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try {
    const r = await fetch(url, { signal: ctl.signal })
    if (!r.ok) throw new Error(`Open Library a répondu ${r.status}`)
    return (await r.json()) as T
  } finally {
    clearTimeout(t)
  }
}

interface SearchDoc {
  key: string
  title?: string
  author_name?: string[]
  first_publish_year?: number
  cover_i?: number
  number_of_pages_median?: number
  edition_count?: number
  subject?: string[]
}

const coverById = (id: number | undefined, size: 'S' | 'M' | 'L' = 'M') =>
  id && id > 0 ? `https://covers.openlibrary.org/b/id/${id}-${size}.jpg` : null
/** Couverture d'après l'ISBN : `default=false` fait répondre 404 s'il n'y en a pas (l'appli affiche alors sa couverture dessinée). */
export const isbnCover = (isbn: string, size: 'S' | 'M' | 'L' = 'M') => `https://covers.openlibrary.org/b/isbn/${isbn}-${size}.jpg?default=false`

/** Genre principal deviné (compatibilité) ; voir guessGenres pour la liste complète. */
export function guessGenre(subjects: string[] = []): string {
  return guessGenres(subjects)[0]
}

interface SearchEdition { key?: string; title?: string; language?: string[]; cover_i?: number; isbn?: string[]; publisher?: string[] }

export async function searchWorks(q: string): Promise<WorkHit[]> {
  const query = q.trim()
  if (query.length < 2) return []
  // « editions » + lang=fr : Open Library renvoie l'édition française de l'œuvre quand elle existe
  // (titre « Ça » plutôt que « It », et sa couverture française).
  const fields = 'key,title,author_name,first_publish_year,cover_i,number_of_pages_median,edition_count,subject,editions,editions.key,editions.title,editions.language,editions.cover_i,editions.isbn,editions.publisher'
  const data = await getJson<{ docs: (SearchDoc & { editions?: { docs?: SearchEdition[] } })[] }>(
    `${BASE}/search.json?q=${encodeURIComponent(query)}&fields=${fields}&limit=12&lang=fr`,
  )
  return (data.docs ?? [])
    .filter((d) => d.title)
    .map((d) => {
      const fr = d.editions?.docs?.find((e) => e.language?.includes('fre') && e.title)
      const isbn = fr?.isbn?.find((x) => /^\d{13}$/.test(x)) ?? null
      const genres = guessGenres(d.subject)
      const cover = coverById(fr?.cover_i) ?? (isbn ? isbnCover(isbn) : null) ?? coverById(d.cover_i)
      const primary: EditionHit | null = fr
        ? { olEditionId: fr.key?.replace('/books/', '') ?? null, title: fr.title ?? null, publisher: fr.publisher?.[0] ?? null, format: 'autre', pages: null, isbn13: isbn, coverUrl: cover, language: 'fre', year: null }
        : null
      return {
        olWorkId: d.key.replace('/works/', ''),
        title: fr?.title ?? d.title!,
        author: d.author_name?.[0] ?? '',
        year: d.first_publish_year ?? null,
        genre: genres[0],
        genres,
        pages: d.number_of_pages_median ?? null,
        coverUrl: cover,
        editionCount: d.edition_count ?? 0,
        editions: primary ? [primary] : undefined,
        primary,
      }
    })
}

interface EditionDoc {
  key: string
  title?: string
  publishers?: string[]
  physical_format?: string
  number_of_pages?: number
  isbn_13?: string[]
  covers?: number[]
  languages?: { key: string }[]
  publish_date?: string
}

function formatOf(s?: string): Edition['format'] {
  const f = (s ?? '').toLowerCase()
  if (/paperback|poche|mass market/.test(f)) return 'poche'
  if (/hardcover|reli|hardback/.test(f)) return 'relie'
  if (/ebook|electronic|kindle/.test(f)) return 'ebook'
  if (/audio/.test(f)) return 'audio'
  if (f) return 'broche'
  return 'autre'
}

export async function listEditions(olWorkId: string): Promise<EditionHit[]> {
  const data = await getJson<{ entries: EditionDoc[] }>(`${BASE}/works/${olWorkId}/editions.json?limit=30`)
  const hits = (data.entries ?? [])
    .map<EditionHit>((e) => ({
      olEditionId: e.key.replace('/books/', ''),
      title: e.title ?? null,
      publisher: e.publishers?.[0] ?? null,
      format: formatOf(e.physical_format),
      pages: e.number_of_pages ?? null,
      isbn13: e.isbn_13?.[0] && /^\d{13}$/.test(e.isbn_13[0]) ? e.isbn_13[0] : null,
      coverUrl: coverById(e.covers?.[0]) ?? (e.isbn_13?.[0] && /^\d{13}$/.test(e.isbn_13[0]) ? isbnCover(e.isbn_13[0]) : null),
      language: e.languages?.[0]?.key.replace('/languages/', '') ?? null,
      year: e.publish_date ? Number(/\d{4}/.exec(e.publish_date)?.[0]) || null : null,
    }))
    .filter((e) => e.pages) // sans nombre de pages, une édition ne sert pas à suivre la progression
  // Français d'abord, puis éditions les mieux renseignées (ISBN, couverture).
  const score = (e: EditionHit) => (e.language === 'fre' ? 4 : 0) + (e.isbn13 ? 2 : 0) + (e.coverUrl ? 1 : 0)
  return hits.sort((a, b) => score(b) - score(a))
}

export const FORMAT_LABEL: Record<Edition['format'], string> = {
  poche: 'Poche',
  broche: 'Broché',
  relie: 'Relié',
  ebook: 'Numérique',
  audio: 'Audio',
  autre: 'Édition',
}
