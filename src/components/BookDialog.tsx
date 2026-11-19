import { useEffect, useRef, useState } from 'react'
import { getNote, removeBook, saveNote, saveSynopsis, switchEdition, updateBook } from '../lib/api'
import { explain } from '../lib/supabase'
import { pct, STATUS_LABEL, totalOf } from '../lib/logic'
import { FORMAT_LABEL } from '../lib/openlibrary'
import { editionsFor, synopsisFor } from '../lib/booksearch'
import { Bar, Cover, coverOf, DlgHead, Err, Modal, Pill, Synopsis, useToast } from '../lib/ui'
import { cropToBlob, removeOwnImage, uploadImage } from '../lib/images'
import { genresOf } from '../lib/genres'
import GenrePicker from './GenrePicker'
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
  const [coverOpen, setCoverOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [editGenres, setEditGenres] = useState(false)
  const [synLoading, setSynLoading] = useState(false)
  const [synMissing, setSynMissing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { void getNote(id).then((n) => { setNote(n); setNoteLoaded(true) }).catch(() => setNoteLoaded(true)) }, [id])
  useEffect(() => { if (b) setPage(b.page) }, [b?.page]) // eslint-disable-line react-hooks/exhaustive-deps

  // Livre sans résumé en base : on le cherche une fois, puis on le range pour tout le monde.
  const needSyn = !!b && !b.work.synopsis
  useEffect(() => {
    if (!b || b.work.synopsis) return
    let live = true
    setSynLoading(true); setSynMissing(false)
    void (async () => {
      const text = await synopsisFor({ title: b.work.title, author: b.work.author, isbn: b.edition?.isbn13 })
      if (!live) return
      if (!text) { setSynMissing(true); setSynLoading(false); return }
      const kept = await saveSynopsis(b.work_id, text).catch(() => null)
      if (!live) return
      st.setBook({ ...b, work: { ...b.work, synopsis: kept ?? text } })
      setSynLoading(false)
    })()
    return () => { live = false }
  }, [id, needSyn]) // eslint-disable-line react-hooks/exhaustive-deps

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

  async function loadEds() {
    if (eds) return
    try { setEds(await editionsFor({ title: b!.work.title, author: b!.work.author, olWorkId: b!.work.ol_work_id })) } catch { setEds([]) }
  }
  async function openEditions() { setShowEds(true); await loadEds() }
  async function openCovers() { setCoverOpen(true); await loadEds() }

  const setCover = (url: string | null) => run(async () => {
    const old = b.custom_cover_url
    st.setBook(await updateBook(b.id, { custom_cover_url: url }))
    if (old && old !== url) void removeOwnImage(old)
    toast(url ? 'Couverture changée.' : 'Couverture d’origine rétablie.')
    setCoverOpen(false)
  })

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setUploading(true)
    await run(async () => {
      const blob = await cropToBlob(f, 600, 900)
      const url = await uploadImage('covers', st.uid, b!.id, blob)
      const old = b!.custom_cover_url
      st.setBook(await updateBook(b!.id, { custom_cover_url: url }))
      if (old) void removeOwnImage(old)
      toast('Ta photo est maintenant la couverture de ce livre.')
      setCoverOpen(false)
    })
    setUploading(false)
  }

  const saveGenres = (g: string[]) => run(async () => { st.setBook(await updateBook(b.id, { genres: g })) })

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
        <div className="stack" style={{ gap: 6 }}>
          <Cover title={b.work.title} author={b.work.author} url={coverOf(b)} onClick={openCovers} />
          <button className="btn ghost sm" onClick={openCovers} style={{ padding: '4px 8px' }}>Changer la couverture</button>
        </div>
        <div className="stack" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 6 }}><Pill status={b.status} />{genresOf(b).map((g) => <span key={g} className="pill">{g}</span>)}</div>
          {total > 0 && (
            <>
              <Bar v={page} g={total} />
              <p className="small num">Page {page} sur {total}, {pct({ ...b, page })} %</p>
            </>
          )}
          {b.edition && <p className="muted small">{[b.edition.format !== 'autre' ? FORMAT_LABEL[b.edition.format] : null, b.edition.publisher, b.edition.published_year].filter(Boolean).join(', ')}</p>}
        </div>
      </div>

      {coverOpen && (
        <div className="panel stack" style={{ gap: 10 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3>Couverture</h3>
            <button className="x" onClick={() => setCoverOpen(false)} aria-label="Fermer le choix de couverture">×</button>
          </div>
          <p className="muted small">Choisis celle de ton édition, ou prends ton exemplaire en photo.</p>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          <div className="row">
            <button className="btn primary sm" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? 'Envoi…' : 'Importer une image'}</button>
            {b.custom_cover_url && <button className="btn ghost sm" onClick={() => setCover(null)}>Revenir à la couverture d’origine</button>}
          </div>
          {!eds && <p className="muted small" role="status">Recherche des couvertures des autres éditions…</p>}
          {eds && (() => {
            const seen = new Set<string>()
            const list = [b.edition?.cover_url, ...eds.map((e) => e.coverUrl)].filter((u): u is string => !!u && !seen.has(u) && !!seen.add(u)).slice(0, 18)
            return list.length ? (
              <div className="cover-grid">
                {list.map((u) => (
                  <button key={u} className="cover-opt" aria-pressed={coverOf(b) === u} onClick={() => setCover(u === b.edition?.cover_url ? null : u)} aria-label="Choisir cette couverture">
                    <img src={u} alt="" loading="lazy" onError={(e) => { (e.currentTarget.parentElement as HTMLElement).hidden = true }} onLoad={(e) => { if (e.currentTarget.naturalWidth < 20) (e.currentTarget.parentElement as HTMLElement).hidden = true }} />
                  </button>
                ))}
              </div>
            ) : <p className="muted small">Aucune autre couverture trouvée. Importe une photo de ton exemplaire.</p>
          })()}
        </div>
      )}

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

      {(b.work.synopsis || synLoading || synMissing) && (
        <div className="stack" style={{ gap: 6 }}>
          <h3>Résumé</h3>
          <Synopsis text={b.work.synopsis} loading={synLoading} empty="Aucun résumé trouvé pour ce livre." />
        </div>
      )}

      <label className="field">Note personnelle (visible par toi seul)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} onBlur={commitNote} disabled={!noteLoaded} placeholder="Ce qui t’a marqué, ce qui t’a lassé…" maxLength={5000} />
      </label>

      {editGenres ? (
        <div className="stack" style={{ gap: 6 }}>
          <GenrePicker value={genresOf(b)} onChange={(g) => void saveGenres(g.length ? g : genresOf(b))} />
          <div><button className="btn ghost sm" onClick={() => setEditGenres(false)}>Terminé</button></div>
        </div>
      ) : (
        <div><button className="btn ghost sm" onClick={() => setEditGenres(true)}>Modifier les genres</button></div>
      )}

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
