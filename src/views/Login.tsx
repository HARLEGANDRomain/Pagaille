import { useEffect, useRef, useState } from 'react'
import { explain, supabase } from '../lib/supabase'
import { Err } from '../lib/ui'

/* Connexion par code à 6 chiffres reçu par e-mail.
   Pas de lien magique : sur téléphone, le lien s'ouvrirait dans un autre navigateur que l'appli installée. */
export default function Login() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wait, setWait] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait(wait - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  useEffect(() => { if (step === 'code') codeRef.current?.focus() }, [step])

  async function send(e?: React.FormEvent) {
    e?.preventDefault()
    const addr = email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(addr)) return setError('Cette adresse e-mail ne semble pas complète.')
    setBusy(true); setError('')
    const { error } = await supabase.auth.signInWithOtp({ email: addr, options: { shouldCreateUser: true } })
    setBusy(false)
    if (error) return setError(explain(error))
    setEmail(addr); setStep('code'); setWait(30)
  }

  async function verify(e?: React.FormEvent) {
    e?.preventDefault()
    const token = code.replace(/\D/g, '')
    if (token.length < 6) return setError('Le code contient 6 chiffres ou plus. Regarde l’e-mail reçu.')
    setBusy(true); setError('')
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    setBusy(false)
    if (error) setError(explain(error))
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="logo" aria-label="Pagaille"><i /><i /><i />Pagaille</div>
        <div>
          <h1 style={{ fontSize: 'clamp(1.8rem,6vw,2.4rem)' }}>Lis dix minutes. Garde la trace de tout.</h1>
          <p className="muted" style={{ marginTop: 10 }}>
            Une bibliothèque qui compte aussi les livres jamais finis, et un petit cercle d’amis pour lire ensemble.
          </p>
        </div>

        {step === 'email' ? (
          <form className="stack" onSubmit={send} noValidate>
            <label className="field">
              Ton adresse e-mail
              <input type="email" autoComplete="email" inputMode="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@exemple.fr" />
            </label>
            <Err>{error}</Err>
            <button className="btn primary" disabled={busy}>{busy ? 'Envoi…' : 'Recevoir un code'}</button>
            <p className="muted small">Pas de mot de passe : on t’envoie un code à 6 chiffres. Premier passage ? Ton compte est créé automatiquement.</p>
          </form>
        ) : (
          <form className="stack" onSubmit={verify} noValidate>
            <p>Un code est parti à <b>{email}</b>. Il arrive en général en moins d’une minute.</p>
            <label className="field">
              Code reçu par e-mail
              <input ref={codeRef} className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="••••••" aria-describedby="hint" />
            </label>
            <Err>{error}</Err>
            <button className="btn primary" disabled={busy}>{busy ? 'Vérification…' : 'Entrer'}</button>
            <div className="row">
              <button type="button" className="btn ghost sm" disabled={wait > 0 || busy} onClick={() => send()}>
                {wait > 0 ? `Renvoyer le code (${wait} s)` : 'Renvoyer le code'}
              </button>
              <button type="button" className="btn ghost sm" onClick={() => { setStep('email'); setCode(''); setError('') }}>Changer d’adresse</button>
            </div>
            <p id="hint" className="muted small">Rien reçu ? Regarde dans les courriers indésirables.</p>
          </form>
        )}
      </div>
    </div>
  )
}
