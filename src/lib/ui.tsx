/* Petits composants partagés : notifications, fenêtres, couvertures, barres. */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { clamp, coverPattern, hash, spineColors, STATUS_LABEL } from './logic'
import type { Status, UserBook } from '../types'

/* ---------- notifications ---------- */
interface Toast { id: number; text: string; undo?: () => void }
const ToastCtx = createContext<(text: string, undo?: () => void) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([])
  const seq = useRef(0)
  const push = useCallback((text: string, undo?: () => void) => {
    const id = ++seq.current
    setList((l) => [...l, { id, text, undo }])
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), undo ? 6500 : 3600)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div id="toasts" aria-live="polite">
        {list.map((t) => (
          <div className="toast" key={t.id}>
            {t.text}
            {t.undo && (
              <button
                onClick={() => {
                  t.undo!()
                  setList((l) => l.filter((x) => x.id !== t.id))
                }}
              >
                Annuler
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

/* ---------- fenêtre (dialog natif : focus piégé, Échap, fond inerte) ---------- */
export function Modal({ children, onClose, drawer = false, title }: { children: ReactNode; onClose: () => void; drawer?: boolean; title: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current!
    if (!d.open) d.showModal()
    return () => d.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className={drawer ? 'drawer' : 'modal'}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <div className="dlg">{children}</div>
    </dialog>
  )
}

export function DlgHead({ title, sub, onClose }: { title: string; sub?: string; onClose: () => void }) {
  return (
    <div className="dlg-head">
      <div>
        <h2>{title}</h2>
        {sub && <p className="muted small" style={{ marginTop: 4 }}>{sub}</p>}
      </div>
      <button className="x" onClick={onClose} aria-label="Fermer">×</button>
    </div>
  )
}

/* ---------- livres ---------- */
export function Cover({ title, author, url, onClick }: { title: string; author: string; url?: string | null; onClick?: () => void }) {
  const [c, f] = spineColors(title)
  const [bad, setBad] = useState(false)
  return (
    <div className="cover-wrap">
      <button
        className={`cover p${coverPattern(title)}`}
        style={{ ['--c' as string]: c, ['--f' as string]: f }}
        onClick={onClick}
        aria-label={`${title}, ${author}`}
        type="button"
      >
        <b>{title}</b>
        <span>{author}</span>
        {url && !bad && <img src={url} alt="" loading="lazy" onError={() => setBad(true)} onLoad={(e) => { if (e.currentTarget.naturalWidth < 20) setBad(true) }} />}
      </button>
    </div>
  )
}

export function Spine({ b, pct }: { b: UserBook; pct: number }) {
  const h = hash(b.work.title)
  const [c, f] = spineColors(b.work.title)
  const pages = b.total_pages ?? b.edition?.pages ?? 260
  const w = Math.round(clamp(22 + pages / 24, 24, 60))
  const ht = 150 + ((h >>> 4) % 58)
  return (
    <button
      className={`spine${w < 30 ? ' thin' : ''}`}
      style={{ ['--c' as string]: c, ['--f' as string]: f, ['--w' as string]: w + 'px', ['--h' as string]: ht + 'px', ['--band' as string]: 1 + ((h >>> 9) % 4) + 'px' }}
      data-id={b.id}
      title={b.work.title}
      aria-label={`${b.work.title}, ${b.work.author}, ${STATUS_LABEL[b.status]}${b.status === 'cours' ? ', ' + pct + ' %' : ''}`}
    >
      <span className="spine-t">{b.work.title}</span>
      {b.status === 'cours' && <i className="ribbon" style={{ ['--p' as string]: pct }} />}
    </button>
  )
}

export function Bar({ v, g, mark = false }: { v: number; g: number; mark?: boolean }) {
  return (
    <div className={`bar ${mark ? 'mark' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={g} aria-valuenow={Math.min(v, g)}>
      <i style={{ width: `${clamp(g ? (v / g) * 100 : 0, 0, 100)}%` }} />
    </div>
  )
}

export function Avatar({ name, color, me = false, size }: { name: string; color?: string; me?: boolean; size?: number }) {
  return (
    <span
      className={`avatar${me ? ' me' : ''}`}
      style={{ ['--c' as string]: color, ...(size ? { width: size, height: size, fontSize: size * 0.42 } : {}) }}
      aria-hidden="true"
    >
      {(name || '?')[0].toUpperCase()}
    </span>
  )
}

export function Pill({ status }: { status: Status }) {
  return <span className={`pill ${status}`}>{STATUS_LABEL[status]}</span>
}

export function Skeleton({ h = 120 }: { h?: number }) {
  return <div className="skeleton" style={{ height: h }} aria-hidden="true" />
}

export function Err({ children }: { children?: ReactNode }) {
  return children ? <p className="err" role="alert">{children}</p> : null
}
