import { useEffect, useRef, useState } from 'react'
import { addBook } from '../lib/api'
import { explain } from '../lib/supabase'
import { GENRES, norm, STATUS_LABEL } from '../lib/logic'
import { FORMAT_LABEL } from '../lib/openlibrary'
import { editionsFor, searchBooks } from '../lib/booksearch'
import { DlgHead, Err, Modal, useToast } from '../lib/ui'
import { useStore } from '../lib/store'
import type { EditionHit, Status, WorkHit } from '../types'

/** « Pocket · Poche · 2012 · 480 p. » : ce qui distingue une édition d'une autre, sans répéter l'auteur. */
function editionLine(h: WorkHit): string {
  const e = h.primary
  const parts = e
    ? [e.publisher, e.format !== 'autre' ? FORMAT_LABEL[e.format] : null, e.year ?? h.year, e.pages ? `${e.pages} p.` : null]
    : [h.year, h.pages ? `~${h.pages} p.` : null]
  const line = parts.filter(Boolean).join(' · ')
  const n = h.editionCount > 1 ? `${h.editionCount} éditions` : ''
  return [line, n].filter(Boolean).join(' — ') || 'Détails inconnus'
}

const STATUSES: Status[] = ['lire', 'cours', 'fini', 'pause', 'abandon']

/* Ajout d'un livre : on choisit une ŒUVRE (la recherche), puis éventuellement son ÉDITION (pages, couverture).
   Hors ligne ou sans résultat, la saisie manuelle reste possible : le suivi ne dépend jamais d'Open Library. */
export default function AddBook({ onClose, initial }: { onClose: () => void; initial?: Partial<WorkHit> & { status?: Status } }) {
  const st = useStore()
  const toast = useToast()
  const [q, setQ] = useState(initial?.title ?? '')
  const [hits, setHits] = useState<WorkHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState('')
  const [pick, setPick] = useState<WorkHit | null>(initial?.title ? { olWorkId: null, title: initial.title, author: initial.author ?? '', year: null, genre: initial.genre ?? 'Roman', pages: initial.pages ?? null, coverUrl: null, editionCount: 0 } : null)
  const [manual, setManual] = useState(false)
  const [editions, setEditions] = useState<EditionHit[] | null>(null)
  const [edition, setEdition] = useState<EditionHit | null>(null)
  const [showEds, setShowEds] = useState(false)
  const [more, setMore] = useState(false)
  const [title, setTitle] = useState(initial?.title ?? '')
  const [author, setAuthor] = useState(initial?.author ?? '')
  const [genre, setGenre] = useState(initial?.genre ?? 'Roman')
  const [pages, setPages] = useState(initial?.pages ? String(initial.pages) : '')
  const [status, setStatus] = useState<Status>(initial?.status ?? 'lire')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const seq = useRef(0)

  // Recherche différée : une requête quand on arrête de taper, et seule la dernière réponse compte.
  useEffect(() => {
    if (pick || manual) return
    const query = q.trim()
    if (query.length < 2) { setHits([]); setSearchErr(''); return }
    const id = ++seq.current
    const t = setTimeout(async () => {
      setSearching(true); setSearchErr('')
      try {
        const r = await searchBooks(query)
        if (id === seq.current) setHits(r)
      } catch {
        if (id === seq.current) { setHits([]); setSearchErr('La recherche n’a pas répondu. Tu peux saisir le livre à la main.') }
      } finally {
        if (id === seq.current) setSearching(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [q, pick, manual])

  function choose(h: WorkHit) {
    const p = h.primary ?? null
    setPick(h); setTitle(h.title); setAuthor(h.author); setGenre(h.genre)
    setPages(p?.pages ? String(p.pages) : h.pages ? String(h.pages) : '')
    setEditions(h.editions ?? null); setEdition(p); setShowEds(false)
  }

  async function loadEditions() {
    setShowEds(true)
    if (!pick || more) return
    setMore(true)
    try { setEditions(await editionsFor({ title: pick.title, author: pick.author, olWorkId: pick.olWorkId, known: editions ?? [] })) } catch { setEditions((x) => x ?? []) }
  }

  function chooseEdition(e: EditionHit | null) {
    setEdition(e)
    if (e?.pages) setPages(String(e.pages))
  }

  const have = st.books.find((b) => norm(b.work.title) === norm(title) && (!author || norm(b.work.author) === norm(author)))

  async function submit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!title.trim()) return setError('Il manque le titre.')
    const n = pages === '' ? null : Number(pages)
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 10000)) return setError('Le nombre de pages doit être entre 1 et 10 000.')
    setBusy(true); setError('')
    try {
      const b = await addBook(st.uid, {
        work: { olWorkId: pick?.olWorkId ?? null, title, author, genre, year: pick?.year ?? null },
        edition, pages: n, status,
      })
      st.setBook(b)
      toast(`« ${b.work.title} » ajouté à ${status === 'lire' ? 'ta pile à lire' : 'ta bibliothèque'}`)
      void st.reload()
      onClose()
    } catch (e) {
      const m = explain(e)
      setError(m === 'Cet élément existe déjà.' ? 'Ce livre est déjà dans ta bibliothèque.' : m)
    } finally { setBusy(false) }
  }

  const editing = pick || manual
  const fromSearch = !!(pick && (pick.olWorkId || pick.editions?.length))

  return (
    <Modal onClose={onClose} title="Ajouter un livre">
      <DlgHead title="Ajouter un livre" sub={editing ? undefined : 'Cherche un titre ou un auteur. Même un livre jamais fini a sa place.'} onClose={onClose} />
      {!editing && (
        <div className="stack">
          <input className="search" autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Dune, Hemingway, ISBN…" aria-label="Chercher un livre" />
          {searching && <p className="muted small" role="status">Recherche…</p>}
          <Err>{searchErr}</Err>
          <div className="hits">
            {hits.map((h) => (
              <button key={h.olWorkId ?? h.title} className="hit" onClick={() => choose(h)}>
                <span className="mini">{h.coverUrl && <img src={h.coverUrl} alt="" loading="lazy" />}</span>
                <span>
                  <b className="bk">{h.title}</b><br />
                  <span className="muted small">{h.author || 'Auteur inconnu'}</span><br />
                  <span className="muted small">{editionLine(h)}</span>
                </span>
              </button>
            ))}
            {!searching && q.trim().length >= 2 && !hits.length && !searchErr && <p className="muted small">Aucun résultat pour « {q.trim()} ».</p>}
          </div>
          <div><button className="btn ghost sm" onClick={() => { setManual(true); setTitle(q.trim()) }}>Je ne le trouve pas : le saisir à la main</button></div>
        </div>
      )}

      {editing && (
        <form className="stack" onSubmit={submit} noValidate>
          <label className="field">Titre<input value={title} onChange={(e) => setTitle(e.target.value)} readOnly={fromSearch} autoFocus={!pick} /></label>
          <div className="two">
            <label className="field">Auteur<input value={author} onChange={(e) => setAuthor(e.target.value)} readOnly={fromSearch} /></label>
            <label className="field">Pages<input type="number" min={1} max={10000} inputMode="numeric" value={pages} onChange={(e) => setPages(e.target.value)} placeholder="Inconnu" /></label>
          </div>
          {fromSearch && (
            <div>
              <p className="small muted">
                {edition ? [edition.format !== 'autre' ? FORMAT_LABEL[edition.format] : 'Édition', edition.publisher, edition.year].filter(Boolean).join(', ') : 'Édition non précisée'}
                {pages ? `, ${pages} pages` : ''}. Le nombre de pages dépend de l’édition : corrige-le si ton exemplaire est différent.
              </p>
              {!showEds && (pick!.editionCount > 1 || !pick!.editions) && <button type="button" className="btn ghost sm" onClick={loadEditions}>Voir les autres éditions</button>}
              {showEds && (
                <div style={{ marginTop: 8, maxHeight: 220, overflowY: 'auto' }}>
                  {!editions && <p className="muted small" role="status">Chargement des éditions…</p>}
                  {editions && !editions.length && <p className="muted small">Aucune autre édition trouvée. Saisis le nombre de pages à la main.</p>}
                  {editions?.map((e, i) => (
                    <button type="button" key={e.olEditionId ?? e.isbn13 ?? `${e.publisher}-${e.year}-${i}`} className="ed" aria-pressed={edition === e} onClick={() => chooseEdition(edition === e ? null : e)}>
                      <span className="small"><b>{e.format !== 'autre' ? FORMAT_LABEL[e.format] : 'Édition'}</b>{e.publisher ? `, ${e.publisher}` : ''}{e.year ? `, ${e.year}` : ''}{e.isbn13 ? ` · ${e.isbn13}` : ''}</span>
                      <span className="num small">{e.pages ? `${e.pages} p.` : 'pages ?'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {!pick?.olWorkId && (
            <label className="field">Genre
              <select value={genre} onChange={(e) => setGenre(e.target.value)}>{GENRES.map((g) => <option key={g}>{g}</option>)}</select>
            </label>
          )}
          <label className="field">Où le ranger ?
            <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </label>
          {have && <p className="small" role="status">« {have.work.title} » est déjà dans ta bibliothèque ({STATUS_LABEL[have.status].toLowerCase()}).</p>}
          <Err>{error}</Err>
          <div className="row">
            <button className="btn primary" disabled={busy || !!have}>{busy ? 'Ajout…' : 'Ajouter'}</button>
            <button type="button" className="btn ghost" onClick={() => { setPick(null); setManual(false); setEdition(null) }}>Retour à la recherche</button>
          </div>
        </form>
      )}
    </Modal>
  )
}
