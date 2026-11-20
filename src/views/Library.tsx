import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { explain } from '../lib/supabase'
import { hash, norm, pct, plural, SPINES, spineColors, STATUS_LABEL, totalOf } from '../lib/logic'
import { genresOf, GENRES, short } from '../lib/genres'
import { Bar, Pill, Spine, spineWidth, useToast } from '../lib/ui'
import { useStore } from '../lib/store'
import type { Status, UserBook } from '../types'

type Group = { key: 'cours' | 'lire' | 'fini' | 'aside'; label: string; statuses: Status[] }
const GROUPS: Group[] = [
  { key: 'cours', label: 'En cours', statuses: ['cours'] },
  { key: 'lire', label: 'Pile à lire', statuses: ['lire'] },
  { key: 'fini', label: 'Terminés', statuses: ['fini'] },
  { key: 'aside', label: 'Laissés de côté', statuses: ['pause', 'abandon'] },
]

const SORTERS: Record<string, (a: UserBook, b: UserBook) => number> = {
  recent: (a, b) => b.added_at.localeCompare(a.added_at),
  titre: (a, b) => a.work.title.localeCompare(b.work.title, 'fr'),
  auteur: (a, b) => a.work.author.split(' ').pop()!.localeCompare(b.work.author.split(' ').pop()!, 'fr'),
  avance: (a, b) => pct(b) - pct(a),
  note: (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
  couleur: (a, b) => (hash(a.work.title) % SPINES.length) - (hash(b.work.title) % SPINES.length),
  genre: (a, b) => genresOf(a)[0].localeCompare(genresOf(b)[0], 'fr') || a.work.title.localeCompare(b.work.title, 'fr'),
}

const GAP = 3, PAD = 24, MORE_W = 74, MAX_ROWS = 2

/** Répartit les tranches en rangées qui tiennent dans la largeur (mesurée), comme les planches d'une vraie bibliothèque. */
export function splitRows(widths: number[], avail: number, firstReserve = 0): number[][] {
  const rows: number[][] = [[]]
  let used = firstReserve
  widths.forEach((w, i) => {
    const row = rows[rows.length - 1]
    if (row.length && used + w > avail) { rows.push([i]); used = w + GAP }
    else { row.push(i); used += w + GAP }
  })
  return rows
}

/* Une étagère : autant de planches que nécessaire. Au-delà de deux planches, la suite se replie
   en une petite pile « +N » au bout de la dernière planche ; un clic la déplie. */
function Shelf({ k, books, empty }: { k: string; books: UserBook[]; empty: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  const [open, setOpen] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const avail = Math.max(120, w - PAD)
  const rows = w ? splitRows(books.map(spineWidth), avail) : [books.map((_, i) => i)]
  let shown = open ? rows : rows.slice(0, MAX_ROWS)
  let hidden: number[] = []
  if (!open && rows.length > MAX_ROWS) {
    // Place pour la pile « +N » au bout de la dernière planche visible.
    const last = [...shown[MAX_ROWS - 1]]
    const width = (ids: number[]) => ids.reduce((a, i) => a + spineWidth(books[i]) + GAP, 0)
    while (last.length > 1 && width(last) + MORE_W > avail) hidden.unshift(last.pop()!)
    shown = [...shown.slice(0, MAX_ROWS - 1), last]
    hidden = [...hidden, ...rows.slice(MAX_ROWS).flat()]
  }
  return (
    <div ref={ref} className="shelf-stack">
      {!books.length && <div className={`shelf ${k}`} data-drop={k} data-perch={`etagere:${k}:0`} data-perch-floor=""><p className="empty small">{empty}</p></div>}
      {shown.map((row, r) => (
        <div key={r} className={`shelf ${k}`} data-drop={k} data-perch={`etagere:${k}:${r}`} data-perch-floor="">
          {row.map((i) => <Spine key={books[i].id} b={books[i]} pct={pct(books[i])} />)}
          {r === shown.length - 1 && hidden.length > 0 && (
            <button type="button" className="more-pile" onClick={() => setOpen(true)} aria-label={`Afficher les ${hidden.length} autres livres`}>
              {hidden.slice(0, 5).map((i) => { const [c] = spineColors(books[i].work.title); return <i key={i} style={{ background: c }} /> })}
              <b>+{hidden.length}</b>
            </button>
          )}
        </div>
      ))}
      {open && rows.length > MAX_ROWS && <button type="button" className="btn ghost sm" onClick={() => setOpen(false)} style={{ marginTop: 8 }}>Replier l’étagère</button>}
    </div>
  )
}

export default function Library({ onAdd, onOpen }: { onAdd: () => void; onOpen: (id: string) => void }) {
  const st = useStore()
  const toast = useToast()
  const [filter, setFilter] = useState<'tous' | Status>('tous')
  const [sort, setSort] = useState('recent')
  const [view, setView] = useState<'tranches' | 'liste'>('tranches')
  const [q, setQ] = useState('')
  const [genre, setGenre] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const stRef = useRef(st)
  stRef.current = st
  const openRef = useRef(onOpen)
  openRef.current = onOpen

  const list = useMemo(
    () => st.books
      .filter((b) => !q || norm(b.work.title + b.work.author).includes(norm(q)))
      .filter((b) => !genre || genresOf(b).includes(genre))
      .sort(SORTERS[sort]),
    [st.books, q, sort, genre],
  )
  // Seuls les genres présents dans la bibliothèque sont proposés au filtre, dans l'ordre des familles.
  const presentGenres = useMemo(() => { const set = new Set(st.books.flatMap(genresOf)); return GENRES.filter((g) => set.has(g)) }, [st.books])
  const count = (s: Status) => st.books.filter((b) => b.status === s).length
  const aside = count('pause') + count('abandon')
  const fin = count('fini')

  // Glisser-déposer au pointeur (souris, doigt, stylet) : on clone la tranche, on la suit, on la dépose sur une étagère.
  // Le clavier n'est pas oublié : ouvrir un livre permet de changer son statut.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    type Drag = { el: HTMLElement; id: string; x: number; y: number; on: boolean; touch: boolean; timer?: number; ghost?: HTMLElement; target?: HTMLElement | null; pid: number }
    let drag: Drag | null = null
    let blockClick = false
    let raf = 0
    let last = { x: 0, y: 0 }
    const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n))

    // Survol : quelle étagère est sous le doigt (recalculé aussi quand la page défile toute seule).
    const hover = () => {
      if (!drag?.on) return
      const t = document.elementFromPoint(last.x, last.y)?.closest<HTMLElement>('.shelf[data-drop]') ?? null
      root.querySelectorAll('.shelf.over').forEach((s) => { if (s !== t) s.classList.remove('over') })
      t?.classList.add('over')
      drag.target = t
    }
    // Près du haut ou du bas de l'écran, la page défile pour atteindre une étagère lointaine
    // (sur téléphone, les étagères sont empilées et la barre de navigation masque le bas).
    const autoScroll = () => {
      raf = 0
      if (!drag?.on) return
      const zone = 130, bottomZone = window.innerWidth <= 860 ? 190 : zone
      let v = 0
      if (last.y < zone) v = -((zone - last.y) / zone) * 20
      else if (last.y > window.innerHeight - bottomZone) v = ((last.y - (window.innerHeight - bottomZone)) / bottomZone) * 20
      if (v) { window.scrollBy(0, v); hover() }
      raf = requestAnimationFrame(autoScroll)
    }

    const end = () => {
      if (!drag) return
      clearTimeout(drag.timer)
      cancelAnimationFrame(raf); raf = 0
      drag.ghost?.remove()
      drag.el.classList.remove('lifting')
      document.body.classList.remove('dragging')
      root.querySelectorAll('.shelf.over').forEach((s) => s.classList.remove('over'))
      drag = null
    }
    // Soulève la tranche : on la clone, le clone suit le doigt ou la souris.
    const lift = (d: Drag) => {
      d.on = true
      const r = d.el.getBoundingClientRect()
      const g = d.el.cloneNode(true) as HTMLElement
      g.classList.add('ghost')
      g.style.left = r.left + 'px'; g.style.top = r.top + 'px'
      document.body.append(g)
      d.ghost = g
      d.el.classList.add('lifting')
      document.body.classList.add('dragging')
      navigator.vibrate?.(12)
      last = { x: d.x, y: d.y }
      if (!raf) raf = requestAnimationFrame(autoScroll)
    }
    const down = (e: PointerEvent) => {
      const sp = (e.target as HTMLElement).closest<HTMLElement>('.shelf[data-drop] .spine')
      if (!sp || e.button) return
      const d: Drag = { el: sp, id: sp.dataset.id!, x: e.clientX, y: e.clientY, on: false, touch: e.pointerType === 'touch', pid: e.pointerId }
      // Au doigt, un appui long soulève le livre : un simple glissement fait défiler la page.
      if (d.touch) d.timer = window.setTimeout(() => { if (drag === d) lift(d) }, 320)
      drag = d
    }
    const move = (e: PointerEvent) => {
      if (!drag) return
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y
      if (!drag.on) {
        if (Math.hypot(dx, dy) < 7) return
        if (drag.touch) { end(); return } // le doigt a bougé avant la fin de l'appui long : c'est un défilement
        lift(drag)
      }
      e.preventDefault()
      drag.ghost!.style.transform = `translate(${dx}px,${dy}px) rotate(${clamp(dx / 18, -9, 9)}deg)`
      last = { x: e.clientX, y: e.clientY }
      hover()
    }
    // Une fois le livre soulevé au doigt, la page ne doit plus défiler.
    const touchMove = (e: TouchEvent) => { if (drag?.on && e.cancelable) e.preventDefault() }
    const up = () => {
      if (!drag) return
      const d = drag, was = d.on
      end()
      if (!was) return
      blockClick = true
      setTimeout(() => { blockClick = false }, 80)
      const drop = d.target?.dataset.drop
      if (drop) void relocate(d.id, drop)
    }
    const click = (e: MouseEvent) => {
      if (blockClick) { e.stopPropagation(); e.preventDefault(); blockClick = false; return }
      const sp = (e.target as HTMLElement).closest<HTMLElement>('.spine')
      if (sp?.dataset.id) openRef.current(sp.dataset.id)
    }
    async function relocate(id: string, drop: string) {
      const cur = stRef.current
      const b = cur.books.find((x) => x.id === id)
      if (!b) return
      const target: Status = drop === 'aside' ? (b.status === 'pause' || b.status === 'abandon' ? b.status : 'pause') : (drop as Status)
      if (target === b.status) return
      try {
        const r = await cur.move(b, target)
        toast(`« ${b.work.title} » : ${STATUS_LABEL[target].toLowerCase()}.`, () => void r.undo().catch((e) => toast(explain(e))))
        if (r.passed) toast(`Ta pile dépasse ${r.passed[1]}.`)
      } catch (e) { toast(explain(e)) }
    }

    root.addEventListener('pointerdown', down)
    document.addEventListener('pointermove', move, { passive: false })
    document.addEventListener('touchmove', touchMove, { passive: false })
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', end)
    root.addEventListener('click', click, true)
    return () => {
      end()
      root.removeEventListener('pointerdown', down)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('touchmove', touchMove)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', end)
      root.removeEventListener('click', click, true)
    }
  }, [toast])

  const groups = GROUPS.filter((g) => filter === 'tous' || g.statuses.includes(filter))

  return (
    <div ref={rootRef}>
      <div className="head">
        <div>
          <h1>Ta bibliothèque</h1>
          <p className="muted" style={{ marginTop: 8 }}>{plural(st.books.length, 'livre')}, dont {fin} terminé{fin > 1 ? 's' : ''} et {aside} laissé{aside > 1 ? 's' : ''} de côté. Tout compte.</p>
        </div>
        <button className="btn primary" onClick={onAdd}>Ajouter un livre</button>
      </div>

      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <div className="row" role="group" aria-label="Filtrer par statut">
          {([['tous', 'Tous'], ...Object.entries(STATUS_LABEL)] as [string, string][]).map(([k, l]) => (
            <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k as 'tous' | Status)}>{l}</button>
          ))}
        </div>
        <div className="row">
          <input className="search" type="search" placeholder="Chercher un titre, un auteur" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Chercher dans la bibliothèque" style={{ width: 220 }} />
          {presentGenres.length > 1 && (
            <select className="search" value={genre} onChange={(e) => setGenre(e.target.value)} aria-label="Filtrer par genre" style={{ width: 'auto' }}>
              <option value="">Tous les genres</option>
              {presentGenres.map((g) => <option key={g} value={g}>{short(g)}</option>)}
            </select>
          )}
          <select className="search" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Trier" style={{ width: 'auto' }}>
            {[['recent', 'Ajout récent'], ['titre', 'Titre'], ['auteur', 'Auteur'], ['genre', 'Genre'], ['avance', 'Avancement'], ['note', 'Note'], ['couleur', 'Couleur']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button className="chip" aria-pressed={view === 'liste'} onClick={() => setView(view === 'liste' ? 'tranches' : 'liste')}>Vue liste</button>
        </div>
      </div>

      {!st.books.length ? (
        <div className="panel stack" style={{ marginTop: 24 }} data-perch="zone:bibliotheque-vide">
          <h2>Ta bibliothèque est vide</h2>
          <p className="muted">Commence par les livres que tu as déjà ouverts, même pas finis. Ils ont leur étagère.</p>
          <div className="row"><button className="btn primary" onClick={onAdd}>Ajouter un livre</button></div>
        </div>
      ) : view === 'liste' ? (
        <div className="list">
          {list.filter((b) => filter === 'tous' || b.status === filter).map((b) => (
            <button key={b.id} onClick={() => onOpen(b.id)}>
              <span><b className="bk">{b.work.title}</b><br /><span className="muted small">{b.work.author}</span></span>
              <span className="hide-s muted small">{genresOf(b).map(short).join(', ')}{totalOf(b) ? `, ${totalOf(b)} p.` : ''}</span>
              <span><Pill status={b.status} /></span>
              <span className="hide-s">{totalOf(b) && b.status !== 'lire' ? <Bar v={b.page} g={totalOf(b)} /> : null}</span>
              <span className="hide-s stars" aria-label={`${b.rating ?? 0} sur 5`}>{b.rating ? '★'.repeat(b.rating) : ''}</span>
            </button>
          ))}
          {!list.length && <p className="empty">Aucun livre ici.</p>}
        </div>
      ) : (
        <>
          <p className="muted small" style={{ marginTop: 12 }}>Glisse un livre d’une étagère à l’autre pour changer son statut.</p>
          <div className="shelves">
            {groups.map((g) => {
              const bs = list.filter((b) => g.statuses.includes(b.status) && (filter === 'tous' || b.status === filter))
              return (
                <div key={g.key}>
                  <div className="shelf-label">
                    <h3>{g.label} <span className="muted num" style={{ fontWeight: 400 }}>{bs.length}</span></h3>
                    {g.key === 'aside' && <span className="muted small">Ils comptent aussi. Un livre abandonné, c’est de la place pour le suivant.</span>}
                  </div>
                  <Shelf k={g.key} books={bs}
                    empty={q || genre ? 'Rien ne correspond à ta recherche.' : g.key === 'cours' ? 'Rien en cours. Glisse ici un livre de ta pile.' : 'Dépose un livre ici.'} />
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
