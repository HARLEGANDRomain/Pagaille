import { useMemo } from 'react'
import { CATALOG, type CatalogBook } from '../lib/catalog'
import { GENRES, norm } from '../lib/logic'
import { Cover } from '../lib/ui'
import { useStore } from '../lib/store'

export default function Discover({ onPick }: { onPick: (c: CatalogBook) => void }) {
  const st = useStore()
  const tastes = st.profile.tastes
  const sections = useMemo(() => {
    const have = new Set(st.books.map((b) => norm(b.work.title)))
    const pool = CATALOG.filter((c) => !have.has(norm(c.title)))
    const used = new Set<string>()
    const take = (arr: CatalogBook[], n: number) => {
      const r = arr.filter((c) => !used.has(c.id)).slice(0, n)
      r.forEach((c) => used.add(c.id))
      return r
    }
    const liked = (c: CatalogBook) => Number(tastes.includes(c.genre))
    return {
      empty: !pool.length,
      short: take(pool.filter((c) => c.pages && c.pages < 200).sort((a, b) => liked(b) - liked(a) || a.pages - b.pages), 5),
      taste: take(pool.filter((c) => tastes.includes(c.genre)).sort((a, b) => (a.pages || 999) - (b.pages || 999)), 5),
      moment: take(pool.filter((c) => c.tags.includes('moment')), 5),
      classic: take(pool.filter((c) => c.tags.includes('classique')), 5),
    }
  }, [st.books, tastes])

  const Sec = ({ h, p, arr }: { h: string; p: string; arr: CatalogBook[] }) =>
    arr.length ? (
      <section>
        <h2>{h}</h2>
        <p className="muted small" style={{ margin: '4px 0 18px', maxWidth: '60ch' }}>{p}</p>
        <div className="grid">
          {arr.map((c) => (
            <div className="rec" key={c.id}>
              <Cover title={c.title} author={c.author} onClick={() => onPick(c)} />
              <div><b className="bk">{c.title}</b><br /><span className="muted small">{c.author}{c.pages ? `, environ ${c.pages} p.` : ''}</span></div>
              <p className="muted">{c.pitch}</p>
              <div><button className="btn sm" onClick={() => onPick(c)}>Ajouter à ma pile</button></div>
            </div>
          ))}
        </div>
      </section>
    ) : null

  async function toggle(g: string) {
    const next = tastes.includes(g) ? tastes.filter((x) => x !== g) : [...tastes, g]
    await st.patchProfile({ tastes: next })
  }

  return (
    <>
      <div className="head">
        <div>
          <h1>Découvrir</h1>
          <p className="muted" style={{ marginTop: 8, maxWidth: '62ch' }}>Uniquement des livres absents de ta bibliothèque. Dis ce que tu aimes, la sélection se réordonne.</p>
        </div>
      </div>
      <div className="row" role="group" aria-label="Tes goûts" style={{ marginBottom: 36 }}>
        {GENRES.map((g) => <button key={g} className="chip" aria-pressed={tastes.includes(g)} onClick={() => void toggle(g)}>{g}</button>)}
      </div>
      <Sec h="Pour repartir : moins de 200 pages" p="Finir un livre court relance mieux qu’entamer un pavé. À dix minutes par jour, chacun tient en une à deux semaines." arr={sections.short} />
      <Sec h="Dans tes goûts" p={tastes.length ? `D’après ${tastes.join(', ')}. Les plus courts d’abord.` : ''} arr={sections.taste} />
      <Sec h="Du moment" p="Les prix de l’automne et ce dont on parle." arr={sections.moment} />
      <Sec h="Les classiques qui se lisent bien" p="Ceux qu’on cite sans les avoir ouverts." arr={sections.classic} />
      {sections.empty && <p className="empty">Tu as tout ajouté. Respect.</p>}
    </>
  )
}
