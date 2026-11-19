import { useCallback, useEffect, useRef, useState } from 'react'
import { addBook } from '../lib/api'
import { explain } from '../lib/supabase'
import { norm, STATUS_LABEL } from '../lib/logic'
import { DEFAULT_GENRE, upgradeGenre } from '../lib/genres'
import { FORMAT_LABEL } from '../lib/openlibrary'
import { editionsFor, searchBooks } from '../lib/booksearch'
import { DlgHead, Err, Modal, Synopsis, useToast } from '../lib/ui'
import { useStore } from '../lib/store'
import GenrePicker from './GenrePicker'
import Scanner, { canScan } from './Scanner'
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

function Mini({ url, lg = false }: { url?: string | null; lg?: boolean }) {
  const [bad, setBad] = useState(false)
  useEffect(() => setBad(false), [url])
  return <span className={`mini${lg ? ' lg' : ''}`}>{url && !bad && <img src={url} alt="" loading="lazy" onError={() => setBad(true)} onLoad={(e) => { if (e.currentTarget.naturalWidth < 20) setBad(true) }} />}</span>
}

const STATUSES: Status[] = ['lire', 'cours', 'fini', 'pause', 'abandon']

export interface AddInitial extends Partial<Omit<WorkHit, 'genres'>> { status?: Status; hit?: WorkHit; genres?: string[] }

/* Ajout d'un livre : on choisit une ŒUVRE (la recherche ou le code-barres), puis éventuellement son ÉDITION (pages, couverture).
   Hors ligne ou sans résultat, la saisie manuelle reste possible : le suivi ne dépend jamais d'un service extérieur. */
export default function AddBook({ onClose, initial }: { onClose: () => void; initial?: AddInitial }) {
  const st = useStore()
  const toast = useToast()
  const [q, setQ] = useState(initial?.hit ? '' : [initial?.title, initial?.author].filter(Boolean).join(' '))
  const [hits, setHits] = useState<WorkHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState('')
  const [scan, setScan] = useState(false)
  const [pick, setPick] = useState<WorkHit | null>(null)
  const [manual, setManual] = useState(false)
  const [editions, setEditions] = useState<EditionHit[] | null>(null)
  const [edition, setEdition] = useState<EditionHit | null>(null)
  const [showEds, setShowEds] = useState(false)
  const [more, setMore] = useState(false)
  const [edLoading, setEdLoading] = useState(false)
  const [title, setTitle] = useState(initial?.title ?? '')
  const [author, setAuthor] = useState(initial?.author ?? '')
  const [genres, setGenres] = useState<string[]>(initial?.genres?.length ? initial.genres.map(upgradeGenre) : initial?.genre ? [upgradeGenre(initial.genre)] : [])
  const [suggested, setSuggested] = useState<string[]>([])
  const [pages, setPages] = useState(initial?.pages ? String(initial.pages) : '')
  const [status, setStatus] = useState<Status>(initial?.status ?? 'lire')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const seq = useRef(0)

  const choose = useCallback((h: WorkHit) => {
    const p = h.primary ?? null
    setPick(h); setTitle(h.title); setAuthor(h.author)
    const g = h.genres?.length ? h.genres : [h.genre || DEFAULT_GENRE]
    setGenres(g.slice(0, 1)); setSuggested(g)
    setPages(p?.pages ? String(p.pages) : h.pages ? String(h.pages) : '')
    setEditions(h.editions ?? null); setEdition(p); setShowEds(false); setMore(false)
  }, [])

  // Venu de « Découvrir » avec une œuvre déjà trouvée : on saute la recherche.
  useEffect(() => { if (initial?.hit) choose(initial.hit) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const run = useCallback(async (query: string, autoPick = false) => {
    const id = ++seq.current
    setSearching(true); setSearchErr('')
    try {
      const r = await searchBooks(query)
      if (id !== seq.current) return
      setHits(r)
      if (autoPick && r.length) choose(r[0])
      else if (autoPick) setSearchErr(`Aucun livre trouvé pour l’ISBN ${query}. Tu peux le saisir à la main.`)
    } catch {
      if (id === seq.current) { setHits([]); setSearchErr('La recherche n’a pas répondu. Tu peux saisir le livre à la main.') }
    } finally {
      if (id === seq.current) setSearching(false)
    }
  }, [choose])

  // Recherche différée : une requête quand on arrête de taper, et seule la dernière réponse compte.
  useEffect(() => {
    if (pick || manual || scan) return
    const query = q.trim()
    if (query.length < 2) { setHits([]); setSearchErr(''); return }
    const t = setTimeout(() => void run(query), 450)
    return () => clearTimeout(t)
  }, [q, pick, manual, scan, run])

  const onIsbn = useCallback((isbn: string) => {
    setScan(false); setQ(isbn)
    void run(isbn, true)
  }, [run])

  async function loadEditions() {
    setShowEds(true)
    if (!pick || more) return
    setMore(true); setEdLoading(true)
    try { setEditions(await editionsFor({ title: pick.title, author: pick.author, olWorkId: pick.olWorkId, known: editions ?? [] })) } catch { setEditions((x) => x ?? []) } finally { setEdLoading(false) }
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
    const g = genres.length ? genres : [DEFAULT_GENRE]
    setBusy(true); setError('')
    try {
      const b = await addBook(st.uid, {
        work: { olWorkId: pick?.olWorkId ?? null, title, author, genre: g[0], year: pick?.year ?? null, description },
        edition, pages: n, status, genres: g,
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
  // Livre choisi dans la recherche : son résumé ; saisie à la main depuis Découvrir : celui de la carte, tant que le titre n'a pas changé.
  const description = pick ? pick.description ?? null : title.trim() === initial?.title ? initial?.description ?? null : null
  const fromSearch = !!(pick && (pick.olWorkId || pick.editions?.length))

  return (
    <Modal onClose={onClose} title="Ajouter un livre">
      <DlgHead title="Ajouter un livre" sub={editing ? undefined : 'Cherche un titre, un auteur ou un ISBN. Même un livre jamais fini a sa place.'} onClose={onClose} />
      {!editing && (
        <div className="stack">
          {scan ? (
            <Scanner onIsbn={onIsbn} onClose={() => setScan(false)} />
          ) : (
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input className="search" autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cornes Joe Hill, Ça, 978…" aria-label="Chercher un livre" />
              {canScan() && <button type="button" className="btn sm" onClick={() => setScan(true)} aria-label="Scanner le code-barres">Scanner</button>}
            </div>
          )}
          {initial?.description && !initial.hit && q === [initial.title, initial.author].filter(Boolean).join(' ') && (
            <div className="stack" style={{ gap: 4 }}>
              <b className="bk">{initial.title}</b>
              <span className="muted small">{initial.author}</span>
              <Synopsis text={initial.description} lines={5} />
            </div>
          )}
          {searching && <p className="muted small" role="status">Recherche…</p>}
          <Err>{searchErr}</Err>
          <div className="hits">
            {hits.map((h, i) => (
              <button key={(h.olWorkId ?? '') + h.title + h.author + i} className="hit" onClick={() => choose(h)}>
                <Mini url={h.coverUrl} />
                <span>
                  <b className="bk">{h.title}</b><br />
                  <span className="muted small">{h.author || 'Auteur inconnu'}</span><br />
                  <span className="muted small">{editionLine(h)}</span>
                </span>
              </button>
            ))}
            {!searching && q.trim().length >= 2 && !hits.length && !searchErr && <p className="muted small">Aucun résultat pour « {q.trim()} ». Essaie avec moins de mots, ou l’ISBN au dos du livre.</p>}
          </div>
          <div><button className="btn ghost sm" onClick={() => { setManual(true); setTitle(q.trim()) }}>Je ne le trouve pas : le saisir à la main</button></div>
        </div>
      )}

      {editing && (
        <form className="stack" onSubmit={submit} noValidate>
          {pick && (
            <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 14 }}>
              <Mini lg url={edition?.coverUrl ?? pick.coverUrl} />
              <div className="stack" style={{ gap: 4 }}>
                <b className="bk" style={{ fontSize: '1.15rem' }}>{title}</b>
                <span className="muted small">{author || 'Auteur inconnu'}</span>
                <span className="muted small">Tu pourras changer la couverture depuis la fiche du livre.</span>
              </div>
            </div>
          )}
          {description && <Synopsis text={description} lines={4} />}
          {!pick && <label className="field">Titre<input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></label>}
          <div className="two">
            {!pick && <label className="field">Auteur<input value={author} onChange={(e) => setAuthor(e.target.value)} /></label>}
            <label className="field">Pages<input type="number" min={1} max={10000} inputMode="numeric" value={pages} onChange={(e) => setPages(e.target.value)} placeholder="Inconnu" /></label>
          </div>
          {fromSearch && (
            <div>
              <p className="small muted">
                {edition ? [edition.format !== 'autre' ? FORMAT_LABEL[edition.format] : 'Édition', edition.publisher, edition.year].filter(Boolean).join(', ') : 'Édition non précisée'}
                {pages ? `, ${pages} pages` : ''}. Le nombre de pages dépend de l’édition : corrige-le si ton exemplaire est différent.
              </p>
              {!showEds && <button type="button" className="btn ghost sm" onClick={loadEditions}>Choisir mon édition</button>}
              {showEds && (
                <div className="eds">
                  {edLoading && <p className="muted small" role="status">Recherche des autres éditions…</p>}
                  {!edLoading && editions && !editions.length && <p className="muted small">Aucune autre édition trouvée. Saisis le nombre de pages à la main.</p>}
                  {editions?.map((e, i) => (
                    <button type="button" key={e.olEditionId ?? e.isbn13 ?? `${e.publisher}-${e.year}-${i}`} className="ed with-cover" aria-pressed={edition === e} onClick={() => chooseEdition(edition === e ? null : e)}>
                      <Mini url={e.coverUrl} />
                      <span className="small"><b>{e.format !== 'autre' ? FORMAT_LABEL[e.format] : 'Édition'}</b>{e.publisher ? `, ${e.publisher}` : ''}{e.year ? `, ${e.year}` : ''}{e.isbn13 ? <span className="muted"> · {e.isbn13}</span> : null}</span>
                      <span className="num small">{e.pages ? `${e.pages} p.` : 'pages ?'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <GenrePicker value={genres} onChange={setGenres} suggested={suggested} />
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
