/* Faux Supabase en mémoire, utilisé UNIQUEMENT pour les essais d'interface hors ligne (MOCK=1).
   Il imite les tables, les déclencheurs utiles et quelques fonctions ; il ne prouve rien sur la vraie base. */
export { explain } from '../src/lib/explain'

type Row = Record<string, any>
const uid = () => crypto.randomUUID()
const day = (n: number) => { const d = new Date(Date.now() - n * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const ago = (n: number) => new Date(Date.now() - n * 864e5).toISOString()

const ME = 'u-me'
const db: Record<string, Row[]> = {
  profiles: [
    { id: ME, display_name: 'Romain', avatar_color: '#1D3F6E', avatar_url: null, tastes: ['Science-fiction', 'Art et design'], daily_minutes: 10, days_goal: 4, share_library: true, equipped: { shelf: 'shelf-chene', obj: 'obj-rien', scene: 'scene-pluie', acc: 'acc-jaune' } },
    { id: 'u-ines', display_name: 'Inès', avatar_color: '#7A2333', tastes: [], daily_minutes: 10, days_goal: 4, share_library: true },
    { id: 'u-malo', display_name: 'Malo', avatar_color: '#1F4D45', tastes: [], daily_minutes: 10, days_goal: 4, share_library: true },
  ],
  works: [
    { id: 'w1', title: 'Dune', author: 'Frank Herbert', genre: 'SF', ol_work_id: 'OL893415W' },
    { id: 'w2', title: 'Fahrenheit 451', author: 'Ray Bradbury', genre: 'SF', ol_work_id: null },
    { id: 'w3', title: 'Don’t Make Me Think', author: 'Steve Krug', genre: 'Design', ol_work_id: null },
    { id: 'w4', title: 'L’Étranger', author: 'Albert Camus', genre: 'Roman', ol_work_id: null },
    { id: 'w5', title: 'Le Petit Prince', author: 'Antoine de Saint-Exupéry', genre: 'Roman', ol_work_id: null },
    { id: 'w6', title: 'Sapiens', author: 'Yuval Noah Harari', genre: 'Essai', ol_work_id: null },
    { id: 'w7', title: 'Le Nom du vent', author: 'Patrick Rothfuss', genre: 'Fantasy', ol_work_id: null },
  ],
  editions: [
    { id: 'e1', work_id: 'w1', pages: 830, format: 'poche', publisher: 'Pocket', cover_url: null, isbn13: null },
    { id: 'e2', work_id: 'w2', pages: 235, format: 'poche', publisher: 'Folio', cover_url: null, isbn13: null },
    { id: 'e3', work_id: 'w3', pages: 200, format: 'broche', publisher: 'New Riders', cover_url: null, isbn13: null },
  ],
  user_books: [], private_notes: [], reading_sessions: [], signet_ledger: [], cheers: [],
  circles: [{ id: 'c1', name: 'Les Lents Lecteurs', invite_code: 'K7M2QX9A', weekly_goal_pages: 250, created_by: 'u-ines' }],
  circle_members: [
    { circle_id: 'c1', user_id: ME, role: 'member' }, { circle_id: 'c1', user_id: 'u-ines', role: 'owner' }, { circle_id: 'c1', user_id: 'u-malo', role: 'member' },
  ],
  circle_messages: [
    { id: 1, circle_id: 'c1', user_id: 'u-ines', body: 'Session ce soir 21h, qui vient ?', created_at: ago(0.3) },
    { id: 2, circle_id: 'c1', user_id: 'u-malo', body: 'Présent, mais je lis au lit.', created_at: ago(0.2) },
  ],
}
const ub = (work_id: string, edition_id: string | null, status: string, page: number, total: number | null, extra: Row = {}) =>
  db.user_books.push({ id: uid(), user_id: ME, work_id, edition_id, status, total_pages: total, page, rating: null, added_at: ago(10 - db.user_books.length), started_at: null, closed_at: status === 'fini' || status === 'abandon' ? ago(3) : null, ...extra })
ub('w1', 'e1', 'cours', 215, 830); ub('w2', 'e2', 'cours', 100, 235); ub('w3', 'e3', 'lire', 0, 200); ub('w4', null, 'fini', 185, 185, { rating: 4 })
ub('w5', null, 'fini', 95, 95, { rating: 5 }); ub('w6', null, 'pause', 140, 500); ub('w7', null, 'abandon', 90, 790)
for (const [n, m, p] of [[9, 22, 25], [8, 12, 13], [6, 15, 18], [5, 25, 30], [3, 10, 11], [1, 18, 21]] as const)
  db.reading_sessions.push({ id: uid(), user_id: ME, user_book_id: db.user_books[0].id, day: day(n), minutes: m, pages_read: p, circle_id: null, created_at: ago(n) })
db.signet_ledger.push({ id: 1, user_id: ME, key: 'seed', delta: 140 })

// Assez de livres pour remplir une étagère sur plusieurs planches.
for (let i = 0; i < 26; i++) {
  db.works.push({ id: 'wx' + i, title: `Livre de test numéro ${i + 1}`, author: 'Auteur ' + i, genre: i % 2 ? 'Polar' : 'Fantasy', ol_work_id: null })
  ub('wx' + i, null, 'fini', 200 + i * 20, 200 + i * 20, { genres: [i % 2 ? 'Polar' : 'Fantasy'] })
}
// Un livre d'un ami qui partage sa bibliothèque : la vraie base le renvoie aussi, il ne doit jamais apparaître chez ME.
db.works.push({ id: 'w-ami', title: 'Livre de l’ami', author: 'Autre Auteur', genre: 'Roman', ol_work_id: null })
db.user_books.push({ id: 'ub-ami', user_id: 'u-ines', work_id: 'w-ami', edition_id: null, status: 'cours', total_pages: 300, page: 50, rating: null, added_at: ago(1), started_at: null, closed_at: null })
Object.defineProperty(db, 'owned_items', { get: () => db.signet_ledger.filter((r) => String(r.key).startsWith('buy:')).map((r) => ({ user_id: ME, item_id: String(r.key).slice(4) })) })
Object.defineProperty(db, 'signet_balance', { get: () => [{ user_id: ME, signets: db.signet_ledger.reduce((a, r) => a + r.delta, 0) }] })
let seq = 100
const withJoins = (table: string, r: Row) => {
  if (table !== 'user_books') return r
  return { ...r, progress: r.total_pages ? Math.min(r.page / r.total_pages, 1) : null, work: db.works.find((w) => w.id === r.work_id), edition: db.editions.find((e) => e.id === r.edition_id) ?? null }
}
const err = (message: string, code?: string) => ({ message, code })

class Q {
  f: ((r: Row) => boolean)[] = []; op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'; val: any; ord?: [string, boolean]; lim?: number; one: 'single' | 'maybe' | null = null
  constructor(public t: string) {}
  select() { return this } order(c: string, o?: { ascending?: boolean }) { this.ord = [c, o?.ascending !== false]; return this } limit(n: number) { this.lim = n; return this }
  eq(c: string, v: any) { this.f.push((r) => r[c] === v); return this } is(c: string, v: any) { this.f.push((r) => (r[c] ?? null) === v); return this }
  in(c: string, v: any[]) { this.f.push((r) => v.includes(r[c])); return this } gte(c: string, v: any) { this.f.push((r) => r[c] >= v); return this }
  ilike(c: string, v: string) { const x = v.replace(/\\/g, '').toLowerCase(); this.f.push((r) => String(r[c]).toLowerCase() === x); return this }
  insert(v: any) { this.op = 'insert'; this.val = v; return this } update(v: any) { this.op = 'update'; this.val = v; return this }
  upsert(v: any) { this.op = 'upsert'; this.val = v; return this } delete() { this.op = 'delete'; return this }
  single() { this.one = 'single'; return this } maybeSingle() { this.one = 'maybe'; return this }
  then(res: (v: any) => any, rej?: (e: any) => any) { return Promise.resolve().then(() => this.run()).then(res, rej) }
  run() {
    const rows = db[this.t]; const mine = () => rows.filter((r) => this.f.every((f) => f(r)))
    let out: Row[] = []
    if (this.op === 'insert' || this.op === 'upsert') {
      const arr = Array.isArray(this.val) ? this.val : [this.val]
      for (const v of arr) {
        const row: Row = { id: this.t === 'circle_messages' || this.t === 'signet_ledger' ? ++seq : uid(), created_at: new Date().toISOString(), added_at: new Date().toISOString(), ...v }
        if (this.t === 'signet_ledger' && rows.some((r) => r.user_id === row.user_id && r.key === row.key)) return { data: null, error: err('duplicate', '23505') }
        if (this.t === 'user_books') {
          if (rows.some((r) => r.user_id === row.user_id && r.work_id === row.work_id)) return { data: null, error: err('duplicate', '23505') }
          row.page = row.page ?? 0; row.rating = null; row.started_at = null; row.closed_at = row.status === 'fini' || row.status === 'abandon' ? new Date().toISOString() : null
        }
        if (this.t === 'private_notes') { const i = rows.findIndex((r) => r.user_book_id === row.user_book_id); if (i >= 0) rows.splice(i, 1) }
        if (this.t === 'works') row.ol_work_id = row.ol_work_id ?? null
        rows.push(row); out.push(row)
        if (this.t === 'circle_messages') setTimeout(() => listeners.forEach((l) => l(row)), 10)
      }
    } else if (this.op === 'update') {
      out = mine()
      for (const r of out) {
        const was = r.status; Object.assign(r, this.val)
        if (this.t === 'user_books') {
          const tot = r.total_pages ?? db.editions.find((e) => e.id === r.edition_id)?.pages ?? null
          if (tot && r.page > tot) r.page = tot
          if (r.status === 'fini' && tot) r.page = tot
          if (r.status === 'fini' || r.status === 'abandon') { if (was !== r.status) r.closed_at = new Date().toISOString() } else r.closed_at = null
        }
      }
    } else if (this.op === 'delete') { out = mine(); for (const r of out) rows.splice(rows.indexOf(r), 1) } else out = mine()
    if (this.ord) { const [c, asc] = this.ord; out = [...out].sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1)) }
    if (this.lim) out = out.slice(0, this.lim)
    const data = out.map((r) => withJoins(this.t, r))
    if (this.one === 'single') return data.length ? { data: data[0], error: null } : { data: null, error: err('no rows') }
    if (this.one === 'maybe') return { data: data[0] ?? null, error: null }
    return { data, error: null }
  }
}

const listeners: ((r: Row) => void)[] = []
const user = { id: ME, email: 'romain@exemple.fr' }
const session = { user, access_token: 'mock' }
let authCb: ((e: string, s: any) => void) | null = null

export const supabase = {
  from: (t: string) => new Q(t),
  rpc: async (fn: string, a: Row) => {
    if (fn === 'create_circle') { const c = { id: uid(), name: a.p_name, invite_code: 'ABCD2345', weekly_goal_pages: 250, created_by: ME }; db.circles.push(c); db.circle_members.push({ circle_id: c.id, user_id: ME, role: 'owner' }); return { data: c, error: null } }
    if (fn === 'join_circle') { const c = db.circles.find((x) => x.invite_code === String(a.p_code).toUpperCase()); return c ? { data: c, error: null } : { data: null, error: err('code_invalide') } }
    if (fn === 'rotate_invite') { return { data: 'NEWCODE9', error: null } }
    if (fn === 'circle_week_stats') {
      const w = a.p_week
      return { data: db.circle_members.filter((m) => m.circle_id === a.p_circle).map((m) => { const p = db.profiles.find((x) => x.id === m.user_id)!; const ss = db.reading_sessions.filter((s) => s.user_id === m.user_id && s.day >= w); const fake = m.user_id === ME ? 0 : m.user_id === 'u-ines' ? 62 : 35
        return { user_id: m.user_id, display_name: p.display_name, pages: ss.reduce((x, s) => x + s.pages_read, 0) + fake, minutes: ss.reduce((x, s) => x + s.minutes, 0) + fake, days: new Set(ss.map((s) => s.day)).size + (fake ? 3 : 0) } }), error: null }
    }
    if (fn === 'buy_item') {
      const prices: Record<string, number> = { 'shelf-noyer': 120, 'obj-plante': 80, 'scene-etoiles': 150, 'acc-menthe': 100, 'obj-chat': 150 }
      const bal = db.signet_ledger.reduce((x, r) => x + r.delta, 0), pr = prices[a.p_item] ?? 100
      if (bal < pr) return { data: null, error: err('Pas assez de signets') }
      db.signet_ledger.push({ id: ++seq, user_id: ME, key: 'buy:' + a.p_item, delta: -pr }); return { data: bal - pr, error: null }
    }
    if (fn === 'equip_item') { const p = db.profiles[0]; p.equipped = { ...p.equipped, [String(a.p_item).split('-')[0]]: a.p_item }; return { data: p.equipped, error: null } }
    if (fn === 'set_work_synopsis') {
      const w = db.works.find((x) => x.id === a.p_work)
      if (!w) return { data: null, error: err('œuvre inconnue') }
      if (!w.synopsis) w.synopsis = String(a.p_text)
      return { data: w.synopsis, error: null }
    }
    if (fn === 'circle_feed') return { data: [{ user_book_id: 'x1', user_id: 'u-ines', display_name: 'Inès', work_title: 'Maus', status: 'fini', closed_at: ago(0.2), cheer_count: 2, cheered_by_me: false }], error: null }
    return { data: null, error: err('rpc inconnue ' + fn) }
  },
  auth: {
    getSession: async () => ({ data: { session: localStorage.getItem('mock-out') ? null : session } }),
    onAuthStateChange: (cb: (e: string, s: any) => void) => { authCb = cb; return { data: { subscription: { unsubscribe() {} } } } },
    signInWithOtp: async () => ({ error: null }),
    verifyOtp: async () => { localStorage.removeItem('mock-out'); authCb?.('SIGNED_IN', session); return { error: null } },
    signOut: async () => { localStorage.setItem('mock-out', '1'); authCb?.('SIGNED_OUT', null) },
  },
  channel: () => {
    const ch: any = {
      on: (_t: string, cfg: any, cb: (p: any) => void) => { if (cfg?.table === 'circle_messages' && cfg.event === 'INSERT') listeners.push((r) => cb({ new: r })); return ch },
      subscribe: (cb?: (s: string) => void) => { cb?.('SUBSCRIBED'); return ch }, track: async () => {}, presenceState: () => ({}),
    }
    return ch
  },
  removeChannel: async () => {},
  functions: {
    // Recherche hors ligne : deux notices au format de la fonction serveur.
    invoke: async (_name: string, { body }: { body: Row }) => body.synopsis
      ? { data: { synopsis: /fahrenheit|dune|corne/i.test(String(body.title)) ? '<p>Dans un futur où les pompiers brûlent les livres, Montag commence à douter de sa mission.</p><p>Un roman sur la mémoire, la censure et le goût de lire.</p>' : null }, error: null }
      : {
      data: {
        google: [],
        bnf: String(body.q ?? body.title ?? '').toLowerCase().includes('corne') || body.isbn
          ? [{ id: 'bnf-1', volumeInfo: { title: 'Cornes', authors: ['Joe Hill'], publisher: "J'ai lu", pageCount: 510, industryIdentifiers: [{ type: 'ISBN_13', identifier: '9782290054345' }], language: 'fr', source: 'bnf', format: 'poche', description: '<p>Un matin, Ig Perrish se réveille avec des cornes sur le front : il découvre que chacun lui avoue ses pensées les plus sombres.</p>' } },
             { id: 'bnf-2', volumeInfo: { title: 'Cornes', authors: ['Joe Hill'], publisher: 'J.-C. Lattès', pageCount: 414, industryIdentifiers: [{ type: 'ISBN_13', identifier: '9782709629058' }], language: 'fr', source: 'bnf', format: 'broche' } }]
          : [],
        errors: [],
      },
      error: null,
    },
  },
  storage: {
    from: (_b: string) => ({
      upload: async () => ({ data: {}, error: null }),
      getPublicUrl: (path: string) => ({ data: { publicUrl: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="90"><rect width="60" height="90" fill="#7A2333"/></svg>') + '#' + path } }),
      remove: async () => ({ data: [], error: null }),
    }),
  },
}
