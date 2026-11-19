/* Fonction serveur « books » : recherche de livres pour Pagaille.
   - Google Books avec la clé du projet (secret GOOGLE_BOOKS_KEY) : sans clé, Google refuse vite (quota anonyme partagé).
   - Catalogue de la BnF (SRU, dépôt légal) : couvre les éditions françaises que Google et Open Library ratent.
   - Cache en base (table book_cache) : une même recherche ne coûte qu'une fois le quota Google.
   Tout est renvoyé au format « volume Google Books » pour que l'appli n'ait qu'un seul format à lire. */
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const KEY = Deno.env.get('GOOGLE_BOOKS_KEY') ?? ''
const ALLOW_ANON = Deno.env.get('BOOKS_ALLOW_ANON') ?? ''
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

type Vol = { id?: string; volumeInfo: Record<string, unknown> }

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

async function cached<T>(k: string, days: number, f: () => Promise<T>): Promise<T> {
  const { data } = await db.from('book_cache').select('body, created_at').eq('k', k).maybeSingle()
  if (data && Date.now() - new Date(data.created_at).getTime() < days * 864e5) return data.body as T
  const body = await f()
  await db.from('book_cache').upsert({ k, body, created_at: new Date().toISOString() })
  return body
}

async function fetchT(url: string, ms = 7000): Promise<Response> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try { return await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'Pagaille/1.0 (lecture personnelle)' } }) } finally { clearTimeout(t) }
}

/* ---------- Google Books ---------- */
const GB_FIELDS = 'items(id,volumeInfo(title,subtitle,authors,publisher,publishedDate,pageCount,industryIdentifiers,imageLinks/thumbnail,language,categories))'
async function google(params: string): Promise<Vol[]> {
  const url = `https://www.googleapis.com/books/v1/volumes?${params}&printType=books&maxResults=40&fields=${encodeURIComponent(GB_FIELDS)}${KEY ? `&key=${KEY}` : ''}`
  const r = await fetchT(url)
  if (!r.ok) throw new Error(`google ${r.status}`)
  const j = await r.json() as { items?: Vol[] }
  return j.items ?? []
}

/* ---------- BnF (SRU, Dublin Core) ---------- */
const dec = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").trim()
const all = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<dc:${tag}[^>]*>([\\s\\S]*?)</dc:${tag}>`, 'g'))].map((m) => dec(m[1]))

/** « Hill, Joe (1972-....). Auteur du texte » → « Joe Hill » */
function person(s: string): string {
  const core = s.replace(/\([^)]*\)/g, '').split(/\.\s/)[0].replace(/\.$/, '').trim()
  const [last, first] = core.split(',').map((x) => x.trim())
  return first ? `${first} ${last}` : last
}

function bnfRecord(rec: string, i: number): Vol | null {
  const type = all(rec, 'type').join(' ').toLowerCase()
  if (type && !/texte/.test(type)) return null
  const rawTitle = all(rec, 'title')[0]
  if (!rawTitle) return null
  // « Cornes : roman / Joe Hill ; traduit… » → « Cornes » ; la BnF écrit « Ç » avec un crochet combinant (U+0321).
  const title = rawTitle.split(' / ')[0]
    .replace(/C\u0321/g, 'Ç').replace(/c\u0321/g, 'ç').normalize('NFC')
    .replace(/\s*\((\d+e|nouvelle|[0-9]+)[^)]*éd[^)]*\)\s*$/i, '')
    .replace(/\s*:\s*(roman|nouvelles?|récits?|thriller|polar|conte|essai|bande dessinée|roman graphique)\s*$/i, '')
    .replace(/\s*:\s*$/, '').replace(/\b([LlDdJjMmNnSsTt]|[Qq]u)' /g, "$1'").trim()
  const authors = all(rec, 'creator').filter((c) => !/traduct|illustr|préfac|editeur scientifique/i.test(c)).map(person).filter(Boolean)
  const ids = all(rec, 'identifier')
  const isbn = ids.map((x) => /ISBN\s*([\dXx-]{10,17})/.exec(x)?.[1]?.replace(/-/g, '')).find(Boolean)
  const fmt = all(rec, 'format').join(' ')
  const cm = Number(/(\d{2})\s*cm/.exec(fmt)?.[1]) || 0
  const collection = all(rec, 'description').find((d) => /^Collection/i.test(d))?.replace(/^Collection\s*:\s*/i, '')
  const pages = Number(/(\d{2,5})\s*p\./.exec(fmt)?.[1]) || undefined
  const pubRaw = all(rec, 'publisher')[0] ?? ''
  const publisher = (pubRaw.split(' : ').pop() ?? pubRaw).replace(/\s*\(.*$/, '').trim() || undefined
  const date = /\d{4}/.exec(all(rec, 'date')[0] ?? '')?.[0]
  const lang = all(rec, 'language')[0]
  const industryIdentifiers = isbn ? [{ type: isbn.length === 13 ? 'ISBN_13' : 'ISBN_10', identifier: isbn.toUpperCase() }] : []
  return {
    id: `bnf-${isbn ?? i}`,
    volumeInfo: {
      title, authors: authors.slice(0, 2), publisher, publishedDate: date, pageCount: pages,
      industryIdentifiers, language: lang === 'fre' ? 'fr' : lang, source: 'bnf',
      // Hauteur de 18 cm ou moins : un format de poche dans l'édition française.
      format: cm && cm <= 18 ? 'poche' : cm ? 'broche' : undefined, collection,
    },
  }
}

async function bnf(cql: string): Promise<Vol[]> {
  const url = `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&recordSchema=dublincore&maximumRecords=25&query=${encodeURIComponent(cql)}`
  const r = await fetchT(url, 8000)
  if (!r.ok) throw new Error(`bnf ${r.status}`)
  const xml = await r.text()
  const recs = [...xml.matchAll(/<srw:recordData>([\s\S]*?)<\/srw:recordData>/g)].map((m) => m[1])
  return recs.map(bnfRecord).filter((v): v is Vol => !!v)
}

/** Mots exacts d'abord ; si la BnF trouve peu, on tronque les mots (« corne » → « corne* », « stephan » → « steph* »)
    pour rattraper un pluriel oublié ou une faute de frappe. */
async function bnfWords(words: string[]): Promise<Vol[]> {
  const DOC = ' and bib.doctype any "a"' // a = texte imprimé
  const exact = await bnf(`bib.anywhere all "${words.join(' ')}"${DOC}`)
  if (exact.length >= 5) return exact
  const loose = words.map((w) => (/^\d+$/.test(w) || w.length < 4 ? w : w.length >= 6 ? w.slice(0, -2) + '*' : w + '*'))
  if (loose.join(' ') === words.join(' ')) return exact
  const more = await bnf(`bib.anywhere all "${loose.join(' ')}"${DOC}`).catch(() => [] as Vol[])
  const seen = new Set(exact.map((v) => v.id))
  return [...exact, ...more.filter((v) => !seen.has(v.id))]
}

const settle = async (p: Promise<Vol[]>) => {
  try { return { ok: true as const, items: await p } } catch (e) { return { ok: false as const, items: [] as Vol[], error: String(e) } }
}

/* ---------- actions ---------- */
async function search(q: string) {
  const f = fold(q)
  const words = f.split(' ').filter((w) => w.length > 1).slice(0, 8)
  const enc = encodeURIComponent
  const [g1, g2, b] = await Promise.all([
    settle(cached(`g:${f}`, 7, () => google(`q=${enc(q)}`))),
    settle(cached(`gfr:${f}`, 7, () => google(`q=${enc(q)}&langRestrict=fr`))),
    settle(words.length ? cached(`b:${f}`, 14, () => bnfWords(words)) : Promise.resolve([])),
  ])
  return { google: [...g1.items, ...g2.items], bnf: b.items, errors: [g1, g2, b].filter((x) => !x.ok).map((x) => (x as { error: string }).error) }
}

async function byIsbn(isbn: string) {
  const [g, b] = await Promise.all([
    settle(cached(`gi:${isbn}`, 30, () => google(`q=isbn:${isbn}`))),
    settle(cached(`bi:${isbn}`, 30, () => bnf(`bib.isbn all "${isbn}"`))),
  ])
  return { google: g.items, bnf: b.items, errors: [g, b].filter((x) => !x.ok).map((x) => (x as { error: string }).error) }
}

async function editions(title: string, author: string) {
  const f = fold(`${title} ${author}`)
  const t = fold(title)
  const [g, b] = await Promise.all([
    settle(cached(`ge:${f}`, 14, () => google(`q=${encodeURIComponent(`intitle:${title} ${author ? `inauthor:${author}` : ''}`.trim())}`))),
    settle(t ? cached(`be:${f}`, 14, () => bnf(`bib.title all "${t}"${author ? ` and bib.author all "${fold(author)}"` : ''} and bib.doctype any "a"`)) : Promise.resolve([])),
  ])
  return { google: g.items, bnf: b.items, errors: [g, b].filter((x) => !x.ok).map((x) => (x as { error: string }).error) }
}

async function subject(s: string) {
  const g = await settle(cached(`gs:${fold(s)}`, 3, () => google(`q=${encodeURIComponent(`subject:${s}`)}&langRestrict=fr&orderBy=relevance`)))
  return { google: g.items, bnf: [], errors: g.ok ? [] : [g.error] }
}

/** La passerelle a déjà vérifié la signature du jeton ; on n'accepte que les personnes connectées (pas la clé publique seule). */
function role(req: Request): string {
  try {
    const t = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').split('.')[1]
    return JSON.parse(atob(t.replace(/-/g, '+').replace(/_/g, '/'))).role ?? ''
  } catch { return '' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (ALLOW_ANON !== '1' && role(req) !== 'authenticated') {
    return new Response(JSON.stringify({ error: 'connexion requise' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
  try {
    const body = await req.json() as { q?: string; isbn?: string; title?: string; author?: string; subject?: string }
    const clean = (s?: string) => (s ?? '').trim().slice(0, 200)
    let out
    if (body.isbn && /^\d{13}$/.test(body.isbn)) out = await byIsbn(body.isbn)
    else if (body.title) out = await editions(clean(body.title), clean(body.author))
    else if (body.subject) out = await subject(clean(body.subject))
    else if (clean(body.q).length >= 2) out = await search(clean(body.q))
    else return new Response(JSON.stringify({ error: 'requête vide' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    return new Response(JSON.stringify({ ...out, keyed: !!KEY }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
