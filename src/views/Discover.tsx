import { useEffect, useMemo, useState } from 'react'
import { CATALOG, type CatalogBook } from '../lib/catalog'
import { norm } from '../lib/logic'
import { GENRE_FAMILIES, GOOGLE_SUBJECT, short, upgradeGenre } from '../lib/genres'
import { booksForSubject, relevance, searchBooks } from '../lib/booksearch'
import { Cover } from '../lib/ui'
import { useStore } from '../lib/store'
import type { WorkHit } from '../types'

/* Découvrir : une sélection éditoriale (du moment, classiques) et des livres dans tes goûts.
   Chaque livre est retrouvé dans les catalogues pour afficher sa vraie couverture française et l'ajouter avec son édition. */

export type DiscoverPick = { title: string; author: string; pages: number | null; genre: string; hit?: WorkHit; description?: string | null }

const CACHE = 'pagaille.discover.v3'
const loadCache = (): Record<string, WorkHit | null> => { try { return JSON.parse(localStorage.getItem(CACHE) ?? '{}') } catch { return {} } }
const saveCache = (c: Record<string, WorkHit | null>) => { try { localStorage.setItem(CACHE, JSON.stringify(c)) } catch { /* plein */ } }

/** Retrouve chaque livre de la sélection dans les catalogues (3 à la fois, résultat gardé sur l'appareil). */
function useResolved(books: CatalogBook[]) {
  const [map, setMap] = useState<Record<string, WorkHit | null>>(loadCache)
  const ids = books.map((b) => b.id).join(',')
  useEffect(() => {
    let live = true
    const todo = books.filter((b) => !(b.id in map))
    let i = 0
    const worker = async () => {
      while (live && i < todo.length) {
        const b = todo[i++]
        let hit: WorkHit | null = null
        try {
          const r = await searchBooks(`${b.title} ${b.author}`)
          hit = r.find((h) => relevance(`${b.title} ${b.author}`, h.title, h.author) >= 0.75) ?? null
        } catch { continue } // réseau : on réessaiera à la prochaine visite
        if (!live) return
        // Seules les trouvailles sont gardées : un livre introuvable aujourd'hui sera recherché à nouveau la prochaine fois.
        setMap((m) => { const n = { ...m, [b.id]: hit }; if (hit) saveCache(Object.fromEntries(Object.entries(n).filter(([, v]) => v))); return n })
      }
    }
    void Promise.all([worker(), worker(), worker()])
    return () => { live = false }
  }, [ids]) // eslint-disable-line react-hooks/exhaustive-deps
  return map
}

function Card({ title, author, pages, hit, onPick }: { title: string; author: string; pages?: number | null; hit?: WorkHit | null; onPick: () => void }) {
  const p = hit?.primary?.pages ?? hit?.pages ?? pages
  return (
    <div className="rec">
      <Cover title={title} author={author} url={hit?.coverUrl} onClick={onPick} />
      <div><b className="bk">{title}</b><br /><span className="muted small">{author}{p ? `, ${p} p.` : ''}</span></div>
      <div><button className="btn sm" onClick={onPick}>Ajouter à ma pile</button></div>
    </div>
  )
}

export default function Discover({ onPick }: { onPick: (p: DiscoverPick) => void }) {
  const st = useStore()
  const tastes = st.profile.tastes.map(upgradeGenre)
  const [allGenres, setAllGenres] = useState(false)
  const [extra, setExtra] = useState<WorkHit[]>([])
  const have = useMemo(() => new Set(st.books.map((b) => norm(b.work.title))), [st.books])

  const sections = useMemo(() => {
    const pool = CATALOG.filter((c) => !have.has(norm(c.title)))
    const used = new Set<string>()
    const take = (arr: CatalogBook[], n: number) => {
      const r = arr.filter((c) => !used.has(c.id)).slice(0, n)
      r.forEach((c) => used.add(c.id))
      return r
    }
    const liked = (c: CatalogBook) => tastes.includes(upgradeGenre(c.genre)) || (tastes.includes('Classiques') && c.tags.includes('classique'))
    return {
      empty: !pool.length,
      taste: take(pool.filter(liked).sort((a, b) => (a.pages || 999) - (b.pages || 999)), 6),
      moment: take(pool.filter((c) => c.tags.includes('moment')), 6),
      classic: take(pool.filter((c) => c.tags.includes('classique')), 6),
    }
  }, [have, tastes.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  const resolved = useResolved([...sections.taste, ...sections.moment, ...sections.classic])

  // Dans tes goûts, au-delà de la sélection : des livres en français trouvés par genre (jusqu'à 3 genres).
  useEffect(() => {
    let live = true
    setExtra([])
    const subjects = tastes.slice(0, 3).map((t) => GOOGLE_SUBJECT[t]).filter(Boolean)
    if (!subjects.length) return
    void Promise.allSettled(subjects.map(booksForSubject)).then((rs) => {
      if (!live) return
      const seen = new Set([...have, ...CATALOG.map((c) => norm(c.title))])
      const out: WorkHit[] = []
      for (let i = 0; out.length < 12; i++) {
        let added = false
        for (const r of rs) {
          const h = r.status === 'fulfilled' ? r.value[i] : undefined
          if (h && !seen.has(norm(h.title))) { seen.add(norm(h.title)); out.push(h); added = true }
        }
        if (!added && rs.every((r) => r.status !== 'fulfilled' || i >= r.value.length)) break
      }
      setExtra(out)
    })
    return () => { live = false }
  }, [tastes.join('|'), have]) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(g: string) {
    const next = tastes.includes(g) ? tastes.filter((x) => x !== g) : [...tastes, g]
    await st.patchProfile({ tastes: next })
  }

  const pickCat = (c: CatalogBook) => {
    const hit = resolved[c.id] ?? undefined
    // Le résumé affiché sur la carte est celui qui sera rangé avec le livre.
    onPick({ title: c.title, author: c.author, pages: c.pages || null, genre: upgradeGenre(c.genre), hit: hit ? { ...hit, description: c.resume ?? hit.description } : undefined, description: c.resume ?? hit?.description })
  }

  const Sec = ({ h, p, arr, more = [] }: { h: string; p: string; arr: CatalogBook[]; more?: WorkHit[] }) =>
    arr.length || more.length ? (
      <section>
        <h2>{h}</h2>
        {p && <p className="muted small" style={{ margin: '4px 0 18px', maxWidth: '60ch' }}>{p}</p>}
        <div className="grid">
          {arr.map((c) => <Card key={c.id} title={c.title} author={c.author} pages={c.pages} hit={resolved[c.id]} onPick={() => pickCat(c)} />)}
          {more.map((h) => <Card key={h.title + h.author} title={h.title} author={h.author} hit={h} onPick={() => onPick({ title: h.title, author: h.author, pages: h.pages, genre: h.genre, hit: h })} />)}
        </div>
      </section>
    ) : null

  const shownFamilies = allGenres ? GENRE_FAMILIES : GENRE_FAMILIES.map((f) => ({ ...f, genres: f.genres.filter((g) => tastes.includes(g) || ['Littérature contemporaine', 'Fantasy', 'Science-fiction', 'Polar', 'Thriller', 'Romance', 'BD', 'Manga', 'Essai', 'Horreur'].includes(g)) })).filter((f) => f.genres.length)

  return (
    <>
      <div className="head">
        <div>
          <h1>Découvrir</h1>
          <p className="muted" style={{ marginTop: 8, maxWidth: '62ch' }}>Uniquement des livres absents de ta bibliothèque. Dis ce que tu aimes, la sélection suit.</p>
        </div>
      </div>
      <div className="tastes" role="group" aria-label="Tes goûts">
        {shownFamilies.map((f) => (
          <div key={f.family} className="row" style={{ gap: 6 }}>
            {allGenres && <span className="small muted fam">{f.family}</span>}
            {f.genres.map((g) => <button key={g} className="chip" aria-pressed={tastes.includes(g)} onClick={() => void toggle(g)}>{short(g)}</button>)}
          </div>
        ))}
        <div><button className="btn ghost sm" onClick={() => setAllGenres(!allGenres)}>{allGenres ? 'Moins de genres' : 'Voir les 34 genres'}</button></div>
      </div>
      {!tastes.length && <p className="panel small" style={{ marginBottom: 24 }} data-perch="zone:gouts">Choisis un ou plusieurs genres ci-dessus : la section « Dans tes goûts » apparaîtra en tête.</p>}
      <Sec h="Dans tes goûts" p={tastes.length ? `D’après ${tastes.map(short).join(', ')}.` : ''} arr={sections.taste} more={extra} />
      <Sec h="Du moment" p="Les prix de l’automne et ce dont on parle." arr={sections.moment} />
      <Sec h="Les classiques qui se lisent bien" p="Ceux qu’on cite sans les avoir ouverts." arr={sections.classic} />
      {sections.empty && !extra.length && <p className="empty">Tu as tout ajouté. Respect.</p>}
    </>
  )
}
