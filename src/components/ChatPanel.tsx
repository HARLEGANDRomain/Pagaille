import { useEffect, useRef, useState } from 'react'
import { explain } from '../lib/supabase'
import { useChat } from '../lib/chat'
import { useStore } from '../lib/store'
import { Avatar, useToast } from '../lib/ui'

const time = (s: string) => new Date(s).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
const dayLabel = (s: string) => {
  const d = new Date(s), t = new Date()
  const y = new Date(t); y.setDate(t.getDate() - 1)
  if (d.toDateString() === t.toDateString()) return 'Aujourd’hui'
  if (d.toDateString() === y.toDateString()) return 'Hier'
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

/* La discussion d'un cercle. Utilisée dans l'onglet Cercle, dans le panneau latéral (grand écran),
   dans le tiroir ouvert par la bulle (téléphone) et par-dessus la scène de lecture. */
export default function ChatPanel({ circleId, tall = false, dark = false, autoFocus = false }: { circleId?: string; tall?: boolean; dark?: boolean; autoFocus?: boolean }) {
  const st = useStore()
  const chat = useChat()
  const toast = useToast()
  const id = circleId ?? chat.active ?? st.circles[0]?.id
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const msgs = id ? chat.messages(id) : []
  const members = id ? chat.members(id) : []

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs.length, id])
  // Visible = lu (seulement si l'onglet est au premier plan).
  useEffect(() => { if (id && document.visibilityState === 'visible') chat.markRead(id) }, [id, msgs.length]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!id) return <p className="muted small">Rejoins ou crée un cercle pour discuter avec tes amis.</p>

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const body = draft.trim()
    if (!body || !id) return
    setSending(true)
    try { await chat.send(id, body); setDraft('') } catch (err) { toast(explain(err)) } finally { setSending(false) }
  }

  return (
    <div className={`chatbox${dark ? ' dark' : ''}${tall ? ' tall' : ''}`}>
      {!circleId && st.circles.length > 1 && (
        <div className="row" role="group" aria-label="Choisir le cercle" style={{ gap: 6 }}>
          {st.circles.map((c) => {
            const n = chat.unread(c.id)
            return <button key={c.id} className="chip sm" aria-pressed={c.id === id} onClick={() => chat.setActive(c.id)}>{c.name}{n ? ` · ${n}` : ''}</button>
          })}
        </div>
      )}
      <div className="chat" aria-live="polite" role="log">
        {!msgs.length && <p className="empty small">Personne n’a encore écrit. Lance la discussion.</p>}
        {msgs.map((m, i) => {
          const mine = m.user_id === st.uid
          const who = members.find((x) => x.user_id === m.user_id)
          const prev = msgs[i - 1]
          const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString()
          const sameAuthor = !newDay && prev?.user_id === m.user_id
          return (
            <div key={m.id}>
              {newDay && <p className="chat-day">{dayLabel(m.created_at)}</p>}
              <div className={`msg${mine ? ' me' : ''}${sameAuthor ? ' cont' : ''}`}>
                {!mine && (sameAuthor ? <span className="avatar-gap" /> : <Avatar name={who?.display_name ?? '?'} color={who?.avatar_color} url={who?.avatar_url} />)}
                <p>
                  {!sameAuthor && <span className="small" style={{ display: 'block', opacity: 0.75, fontWeight: 700 }}>{mine ? 'Toi' : who?.display_name ?? 'Ancien membre'}</span>}
                  {m.body}
                  <span className="me-msg-time"> {time(m.created_at)}</span>
                </p>
              </div>
            </div>
          )
        })}
        <div ref={end} />
      </div>
      <form className="row" onSubmit={send} style={{ flexWrap: 'nowrap' }}>
        <input className="search" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={1000} placeholder="Écrire au cercle" aria-label="Ton message" autoComplete="off" autoFocus={autoFocus} enterKeyHint="send" />
        <button className="btn" disabled={sending || !draft.trim()}>Envoyer</button>
      </form>
    </div>
  )
}
