/* Accès aux données. Chaque fonction lève une erreur lisible par `explain()` si la base refuse. */
import { supabase } from './supabase'
import { applyPage, escapeLike, iso, norm, totalOf, weekId } from './logic'
import type {
  Circle, EditionHit, FeedItem, Member, Message, Profile, SessionRow, Status, UserBook, WeekStat, WorkHit,
} from '../types'

function ok<T>(r: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (r.error) throw r.error
  return r.data as T
}

/* ---------- profil ---------- */
export async function getProfile(uid: string): Promise<Profile | null> {
  const r = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
  return ok(r) as Profile | null
}

export async function updateProfile(uid: string, patch: Partial<Omit<Profile, 'id'>>) {
  ok(await supabase.from('profiles').update(patch).eq('id', uid).select().single())
}

/* ---------- bibliothèque ---------- */
const BOOK_SELECT = '*, work:works(*), edition:editions(*)'

/** Les livres de la personne connectée. Le filtre est indispensable : la base renvoie aussi les livres des membres du cercle qui partagent leur bibliothèque. */
export async function listBooks(uid: string): Promise<UserBook[]> {
  const r = await supabase.from('user_books').select(BOOK_SELECT).eq('user_id', uid).order('added_at', { ascending: false })
  return ok(r) as UserBook[]
}

/** Trouve ou crée l'œuvre dans le catalogue partagé (sans doublon). */
async function ensureWork(w: Pick<WorkHit, 'olWorkId' | 'title' | 'author' | 'genre' | 'year' | 'description'>, uid: string): Promise<string> {
  const find = async () => {
    if (w.olWorkId) {
      const r = await supabase.from('works').select('id').eq('ol_work_id', w.olWorkId).maybeSingle()
      return (ok(r) as { id: string } | null)?.id ?? null
    }
    const r = await supabase
      .from('works')
      .select('id, title, author')
      .ilike('title', escapeLike(w.title.trim()))
    const rows = ok(r) as { id: string; title: string; author: string }[]
    return rows.find((x) => norm(x.author) === norm(w.author))?.id ?? null
  }
  const existing = await find()
  if (existing) return existing
  const ins = await supabase
    .from('works')
    .insert({
      title: w.title.trim(),
      author: w.author.trim(),
      genre: w.genre,
      first_published_year: w.year,
      ol_work_id: w.olWorkId,
      synopsis: w.description ?? null,
      created_by: uid,
    })
    .select('id')
    .single()
  if (ins.error?.code === '23505') {
    const again = await find() // quelqu'un l'a créée entre-temps
    if (again) return again
  }
  return (ok(ins) as { id: string }).id
}

async function ensureEdition(workId: string, e: EditionHit | null, pages: number | null, uid: string): Promise<string | null> {
  if (!e) {
    if (!pages) return null
    // Saisie manuelle : une édition « générique » par œuvre et par nombre de pages.
    const ex = await supabase.from('editions').select('id').eq('work_id', workId).is('ol_edition_id', null).is('isbn13', null).eq('pages', pages).limit(1)
    const found = (ok(ex) as { id: string }[])[0]
    if (found) return found.id
    const ins = await supabase.from('editions').insert({ work_id: workId, pages, created_by: uid }).select('id').single()
    return (ok(ins) as { id: string }).id
  }
  const lookups: [string, string | null][] = [['ol_edition_id', e.olEditionId], ['isbn13', e.isbn13]]
  for (const [col, val] of lookups) {
    if (!val) continue
    const r = await supabase.from('editions').select('id, work_id').eq(col, val).maybeSingle()
    const row = ok(r) as { id: string; work_id: string } | null
    if (row && row.work_id === workId) return row.id
  }
  const ins = await supabase
    .from('editions')
    .insert({
      work_id: workId,
      title: e.title,
      publisher: e.publisher,
      format: e.format,
      pages: e.pages,
      isbn13: e.isbn13,
      cover_url: e.coverUrl,
      ol_edition_id: e.olEditionId,
      language: e.language,
      published_year: e.year,
      created_by: uid,
    })
    .select('id')
    .single()
  if (ins.error?.code === '23505') {
    // L'ISBN existe déjà, rattaché à une autre œuvre : on garde l'œuvre choisie et on saisit les pages à la main.
    return ensureEdition(workId, null, e.pages, uid)
  }
  return (ok(ins) as { id: string }).id
}

export interface NewBook {
  work: Pick<WorkHit, 'olWorkId' | 'title' | 'author' | 'genre' | 'year' | 'description'>
  edition: EditionHit | null
  pages: number | null
  status: Status
  genres?: string[]
}

export async function addBook(uid: string, b: NewBook): Promise<UserBook> {
  const workId = await ensureWork(b.work, uid)
  const editionId = await ensureEdition(workId, b.edition, b.pages, uid)
  const r = await supabase
    .from('user_books')
    .insert({
      user_id: uid,
      work_id: workId,
      edition_id: editionId,
      total_pages: b.pages,
      status: b.status,
      page: 0,
      genres: (b.genres?.length ? b.genres : [b.work.genre]).slice(0, 3),
    })
    .select(BOOK_SELECT)
    .single()
  const book = ok(r) as UserBook
  // Œuvre déjà connue mais sans résumé : on range celui qu'on vient de trouver.
  if (b.work.description && !book.work.synopsis) {
    const s = await saveSynopsis(book.work_id, b.work.description).catch(() => null)
    if (s) book.work = { ...book.work, synopsis: s }
  }
  return book
}

/** Range un résumé sur l'œuvre, seulement s'il n'en a pas encore ; renvoie celui qui fait foi. */
export async function saveSynopsis(workId: string, text: string): Promise<string | null> {
  return ok(await supabase.rpc('set_work_synopsis', { p_work: workId, p_text: text })) as string | null
}

export async function updateBook(id: string, patch: Partial<Pick<UserBook, 'status' | 'page' | 'rating' | 'total_pages' | 'custom_cover_url' | 'genres'>>) {
  return ok(await supabase.from('user_books').update(patch).eq('id', id).select(BOOK_SELECT).single()) as UserBook
}

export async function removeBook(id: string) {
  ok(await supabase.from('user_books').delete().eq('id', id).select())
}

/** Change l'édition suivie ; le total de pages suit celui de la nouvelle édition. */
export async function switchEdition(uid: string, b: UserBook, e: EditionHit) {
  const editionId = await ensureEdition(b.work_id, e, e.pages, uid)
  return updateBook2(b.id, { edition_id: editionId, total_pages: e.pages ?? b.total_pages })
}
async function updateBook2(id: string, patch: Record<string, unknown>) {
  return ok(await supabase.from('user_books').update(patch).eq('id', id).select(BOOK_SELECT).single()) as UserBook
}

/* ---------- notes personnelles ---------- */
export async function getNote(userBookId: string): Promise<string> {
  const r = await supabase.from('private_notes').select('body').eq('user_book_id', userBookId).maybeSingle()
  return (ok(r) as { body: string } | null)?.body ?? ''
}

export async function saveNote(uid: string, userBookId: string, body: string) {
  if (!body.trim()) {
    ok(await supabase.from('private_notes').delete().eq('user_book_id', userBookId).select())
    return
  }
  ok(
    await supabase
      .from('private_notes')
      .upsert({ user_book_id: userBookId, user_id: uid, body, updated_at: new Date().toISOString() })
      .select(),
  )
}

export async function noteDays(): Promise<string[]> {
  const r = await supabase.from('private_notes').select('updated_at').gte('updated_at', new Date(Date.now() - 14 * 864e5).toISOString())
  return (ok(r) as { updated_at: string }[]).map((n) => iso(new Date(n.updated_at)))
}

/* ---------- sessions de lecture ---------- */
export async function listSessions(days = 400): Promise<SessionRow[]> {
  const from = iso(new Date(Date.now() - days * 864e5))
  const r = await supabase.from('reading_sessions').select('*').gte('day', from).order('day', { ascending: false })
  return ok(r) as SessionRow[]
}

export interface SessionResult {
  minutes: number
  gained: number
  finished: boolean
  book: UserBook
}

export async function logSession(
  uid: string,
  book: UserBook,
  input: { minutes: number; page: number | null; circleId?: string | null; day?: string },
): Promise<SessionResult> {
  const total = totalOf(book)
  const { page, gained } = applyPage(book.page, input.page, total)
  const minutes = Math.min(720, Math.max(1, Math.round(input.minutes)))
  ok(
    await supabase
      .from('reading_sessions')
      .insert({
        user_id: uid,
        user_book_id: book.id,
        day: input.day ?? iso(new Date()),
        minutes,
        pages_read: Math.min(2000, gained),
        circle_id: input.circleId ?? null,
      })
      .select(),
  )
  const finished = total > 0 && page >= total && book.status !== 'fini'
  const status: Status = finished ? 'fini' : book.status === 'lire' || book.status === 'pause' ? 'cours' : book.status
  const updated = await updateBook(book.id, { page, status })
  return { minutes, gained, finished, book: updated }
}

/* ---------- signets (registre) ---------- */
export async function signetBalance(uid: string): Promise<number> {
  const r = await supabase.from('signet_balance').select('signets').eq('user_id', uid).maybeSingle()
  return (ok(r) as { signets: number } | null)?.signets ?? 0
}

export async function claimedKeys(): Promise<Set<string>> {
  const r = await supabase.from('signet_ledger').select('key')
  return new Set((ok(r) as { key: string }[]).map((x) => x.key))
}

/** Crédite des signets une seule fois par clé : un doublon est ignoré, jamais compté deux fois. */
export async function award(uid: string, key: string, delta: number): Promise<boolean> {
  const r = await supabase.from('signet_ledger').insert({ user_id: uid, key, delta })
  if (r.error?.code === '23505') return false
  if (r.error) throw r.error
  return true
}

export const missionKey = (id: string) => `mission:${weekId()}:${id}`
/** Palier de série : une fois par série (identifiée par son premier lundi) et par palier. */
export const streakKey = (start: string, weeks: number) => `streak:${start}:${weeks}`
export const ritualKey = () => `ritual:${iso(new Date())}`
export const closeKey = (userBookId: string, status: Status) => `close:${userBookId}:${status}`

/* ---------- boutique (les prix et le solde sont vérifiés par la base) ---------- */
export async function ownedItems(): Promise<Set<string>> {
  const r = await supabase.from('owned_items').select('item_id')
  return new Set((ok(r) as { item_id: string }[]).map((x) => x.item_id))
}

export async function buyItem(item: string): Promise<number> {
  return ok(await supabase.rpc('buy_item', { p_item: item })) as number
}

/** Couleur de chaque exemplaire d'objet (table trinket_variants, écrite par set_variant). */
export async function trinketVariants(): Promise<Record<string, string>> {
  const r = await supabase.from('trinket_variants').select('copy_id, variant')
  return Object.fromEntries((ok(r) as { copy_id: string; variant: string }[]).map((x) => [x.copy_id, x.variant]))
}

/** Change la couleur d'un exemplaire. La base vérifie l'exemplaire et, pour une variante rare, le palier de série. */
export async function setVariant(copy: string, variant: string): Promise<void> {
  ok(await supabase.rpc('set_variant', { p_copy: copy, p_variant: variant }))
}

export async function equipItem(item: string): Promise<Record<string, string>> {
  return ok(await supabase.rpc('equip_item', { p_item: item })) as Record<string, string>
}

/* ---------- cercles ---------- */
export async function listCircles(): Promise<Circle[]> {
  const r = await supabase.from('circles').select('*').order('created_at')
  return ok(r) as Circle[]
}

export async function createCircle(name: string): Promise<Circle> {
  return ok(await supabase.rpc('create_circle', { p_name: name })) as Circle
}

export async function joinCircle(code: string): Promise<Circle> {
  return ok(await supabase.rpc('join_circle', { p_code: code })) as Circle
}

export async function rotateInvite(circleId: string): Promise<string> {
  return ok(await supabase.rpc('rotate_invite', { p_circle: circleId })) as string
}

export async function renameCircle(id: string, patch: { name?: string; weekly_goal_pages?: number }) {
  ok(await supabase.from('circles').update(patch).eq('id', id).select().single())
}

export async function leaveCircle(circleId: string, uid: string) {
  ok(await supabase.from('circle_members').delete().eq('circle_id', circleId).eq('user_id', uid).select())
}

export async function listMembers(circleId: string): Promise<Member[]> {
  // `seat` arrive avec la pièce de vie (migration du 25/11) ; sans elle, on retombe sur l'ancienne liste.
  type Row = { user_id: string; role: 'owner' | 'member'; seat?: number | null }
  const withSeat = await supabase.from('circle_members').select('user_id, role, seat').eq('circle_id', circleId)
  const m = (withSeat.error ? ok(await supabase.from('circle_members').select('user_id, role').eq('circle_id', circleId)) : ok(withSeat)) as Row[]
  const ids = m.map((x) => x.user_id)
  const p = ok(await supabase.from('profiles').select('id, display_name, avatar_color, avatar_url').in('id', ids)) as { id: string; display_name: string; avatar_color: string; avatar_url: string | null }[]
  return m.map((x) => {
    const pr = p.find((y) => y.id === x.user_id)
    return { ...x, display_name: pr?.display_name ?? 'Lecteur', avatar_color: pr?.avatar_color ?? '#161D3A', avatar_url: pr?.avatar_url ?? null }
  })
}

/** S'asseoir dans la pièce du cercle (siège 0 à 11) ou se lever (null). */
export async function chooseSeat(circleId: string, seat: number | null): Promise<void> {
  ok(await supabase.rpc('choose_seat', { p_circle: circleId, p_seat: seat }))
}

export async function weekStatsOf(circleId: string): Promise<WeekStat[]> {
  const r = await supabase.rpc('circle_week_stats', { p_circle: circleId, p_week: weekId() })
  return ok(r) as WeekStat[]
}

export async function circleFeed(circleId: string): Promise<FeedItem[]> {
  const r = await supabase.rpc('circle_feed', { p_circle: circleId, p_limit: 15 })
  return (ok(r) as (FeedItem & { cheer_count: number | string })[]).map((x) => ({ ...x, cheer_count: Number(x.cheer_count) }))
}

export async function setCheer(uid: string, userBookId: string, on: boolean) {
  if (on) {
    const r = await supabase.from('cheers').insert({ user_id: uid, user_book_id: userBookId })
    if (r.error && r.error.code !== '23505') throw r.error
  } else {
    ok(await supabase.from('cheers').delete().eq('user_id', uid).eq('user_book_id', userBookId).select())
  }
}

export async function listMessages(circleId: string): Promise<Message[]> {
  const r = await supabase.from('circle_messages').select('*').eq('circle_id', circleId).order('created_at', { ascending: false }).limit(60)
  return (ok(r) as Message[]).reverse()
}

export async function sendMessage(uid: string, circleId: string, body: string) {
  ok(await supabase.from('circle_messages').insert({ user_id: uid, circle_id: circleId, body: body.trim() }).select())
}

/* ---------- bibliothèque d'un ami ---------- */
export async function libraryOf(uid: string): Promise<UserBook[]> {
  const r = await supabase.from('user_books').select(BOOK_SELECT).eq('user_id', uid).order('added_at', { ascending: false })
  return ok(r) as UserBook[]
}
