import { useEffect, useState } from 'react'
import { getNote, removeBook, saveNote, switchEdition, updateBook } from '../lib/api'
import { explain } from '../lib/supabase'
import { pct, STATUS_LABEL, totalOf } from '../lib/logic'
import { FORMAT_LABEL } from '../lib/openlibrary'
import { editionsFor } from '../lib/booksearch'
import { Bar, Cover, DlgHead, Err, Modal, Pill, useToast } from '../lib/ui'
import { useStore } from '../lib/store'
import type { EditionHit, Status, UserBook } from '../types'

const ORDER: Status[] = ['cours', 'lire', 'fini', 'pause', 'abandon']

export default function BookDialog({ id, onClose, onRead }: { id: string; onClose: () => void; onRead: (b: UserBook) => void }) {
  const st = useStore()
  const toast = useToast()
  const b = st.books.find((x) => x.id === id)
  const [note, setNote] = useState('')
  const [noteLoaded, setNoteLoaded] = useState(false)
  const [page, setPage] = useState(b?.page ?? 0)
  const [error, setError] = useState('')
  const [eds, setEds] = useState<EditionHit[] | null>(null)
  const [showEds, setShowEds] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  useEffect(() => { void getNote(id).then((n) => { setNote(n); setNoteLoaded(true) }).catch(() => setNoteLoaded(true)) }, [id])
  useEffect(() => { if (b) setPage(b.page) }, [b?.page]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!b) return null
  const total = totalOf(b)

  async function run<T>(f: () => Promise<T>): Promise<T | undefined> {
    setError('')
    try { return await f() } catch (e) { setError(explain(e)) }
  }

  const move = (s: Status) => run(async () => {
    const r = await st.move(b, s)
    toast(`« ${b.work.title} » : ${STATUS_LABEL[s].toLowerCase()}.`, () => void r.undo())
    if (r.passed) toast(`Ta pile dépasse ${r.passed[1]}.`)
  })

  const commitPage = () => run(async () => {
    if (page === b.page) return
    const nb = await updateBook(b.id, { page })
    st.setBook(nb)
    if (nb.status === 'fini' && b.status !== 'fini') void st.reload()
  })

  const rate = (n: number) => run(async () => st.setBook(await updateBook(b.id, { rating: b.rating === n ? null : n })))

  const commitNote = () => run(async () => { await saveNote(st.uid, b.id, note); void st.reload() })

  async function openEditions() {
    setShowEds(true)
    if (eds) return
    try { setEds(await editionsFor({ title: b!.work.title, author: b!.work.author, olWorkId: b!.work.ol_work_id })) } catch { setEds([]) }
  }

  const pick = (e: EditionHit) => run(async () => {
    st.setBook(await switchEdition(st.uid, b, e))
    toast(e.pages ? `Édition changée : ${e.pages} pages.` : 'Édition changée. Le nombre de pages reste le même.')
    setShowEds(false)
  })

  const remove = () => run(async () => {
    await removeBook(b.id)
    await st.reload()
    toast(`« ${b.work.title} » retiré de ta bibliothèque.`)
    onClose()
  })

  return (
    <Modal drawer onClose={onClose} title={b.work.title}>
      <DlgHead title={b.work.title} sub={b.work.author} onClose={onClose} />
      <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0,1fr)', gap: 18 }}>
        <Cover title={b.work.title} author={b.work.author} url={b.edition?.cover_url} />
        <div className="stack" style={{ gap: 10 }}>
          <div><Pill status={b.status} /></div>
          {total > 0 && (
            <>
              <Bar v={page} g={total} />
              <p className="small num">Page {page} sur {total}, {pct({ ...b, page })} %</p>
            </>
          )}
          {b.edition && <p className="muted small">{[b.edition.format !== 'autre' ? FORMAT_LABEL[b.edition.format] : null, b.edition.publisher, b.edition.published_year].filter(Boolean).join(', ')}</p>}
        </div>
      </div>

      <div className="row" role="group" aria-label="Statut">
        {ORDER.map((s) => <button key={s} className="chip" aria-pressed={b.status === s} onClick={() => move(s)}>{STATUS_LABEL[s]}</button>)}
      </div>

      {b.status !== 'fini' && (
        <div className="row"><button className="btn primary" onClick={() => onRead(b)}>Lire maintenant</button></div>
      )}

      {total > 0 && (
        <label className="field">Page atteinte
          <input type="range" min={0} max={total} value={page} onChange={(e) => setPage(Number(e.target.value))} onPointerUp={commitPage} onKeyUp={commitPage} onBlur={commitPage} />
        </label>
      )}

      <div>
        <p className="small" style={{ fontWeight: 500, marginBottom: 4 }}>Ta note</p>
        <div className="stars" role="group" aria-label="Note sur 5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} className={(b.rating ?? 0) >= n ? 'on' : ''} onClick={() => rate(n)} aria-label={`${n} sur 5`} aria-pressed={b.rating === n}>★</button>
          ))}
        </div>
      </div>

      <label className="field">Note personnelle (visible par toi seul)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} onBlur={commitNote} disabled={!noteLoaded} placeholder="Ce qui t’a marqué, ce qui t’a lassé…" maxLength={5000} />
      </label>

      <div className="stack" style={{ gap: 6 }}>
        <p className="small muted">Ton exemplaire a un autre nombre de pages ?</p>
        <div className="row">
          {!showEds && <button className="btn sm" onClick={openEditions}>Changer d’édition</button>}
        </div>
        {showEds && (
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {!eds && <p className="muted small" role="status">Chargement des éditions…</p>}
            {eds && !eds.length && <p className="muted small">Aucune autre édition trouvée.</p>}
            {eds?.map((e, i) => (
              <button key={e.olEditionId ?? e.isbn13 ?? i} className="ed" aria-pressed={b.edition?.isbn13 === e.isbn13 && !!e.isbn13} onClick={() => pick(e)}>
                <span className="small"><b>{e.format !== 'autre' ? FORMAT_LABEL[e.format] : 'Édition'}</b>{e.publisher ? `, ${e.publisher}` : ''}{e.year ? `, ${e.year}` : ''}</span>
                <span className="num small">{e.pages ? `${e.pages} p.` : 'pages ?'}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <Err>{error}</Err>
      <hr className="rule" />
      {!confirmDel ? (
        <div><button className="btn ghost sm" onClick={() => setConfirmDel(true)}>Retirer de ma bibliothèque</button></div>
      ) : (
        <div className="row">
          <span className="small">Retirer aussi tes pages lues et ta note de ce livre ?</span>
          <button className="btn sm" onClick={remove}>Retirer</button>
          <button className="btn ghost sm" onClick={() => setConfirmDel(false)}>Garder</button>
        </div>
      )}
    </Modal>
  )
}
