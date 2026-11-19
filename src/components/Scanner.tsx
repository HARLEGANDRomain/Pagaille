import { useEffect, useRef, useState } from 'react'
import { validEan13 } from '../lib/booksearch'

/* Lecture du code-barres au dos d'un livre avec la caméra (Chrome sur Android, ChromeOS, macOS).
   Un livre porte un EAN-13 qui commence par 978 ou 979 : c'est son ISBN. */

interface Detected { rawValue: string }
interface BarcodeDetectorLike { detect: (src: CanvasImageSource) => Promise<Detected[]> }
declare global {
  interface Window { BarcodeDetector?: { new (o: { formats: string[] }): BarcodeDetectorLike; getSupportedFormats?: () => Promise<string[]> } }
}

export const canScan = () => typeof window !== 'undefined' && !!window.BarcodeDetector && !!navigator.mediaDevices?.getUserMedia

export default function Scanner({ onIsbn, onClose }: { onIsbn: (isbn: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('Place le code-barres du livre dans le cadre.')

  useEffect(() => {
    let stream: MediaStream | null = null
    let stop = false
    let timer = 0
    const run = async () => {
      try {
        if (!window.BarcodeDetector) throw new Error('unsupported')
        const formats = (await window.BarcodeDetector.getSupportedFormats?.()) ?? ['ean_13']
        if (!formats.includes('ean_13')) throw new Error('unsupported')
        const det = new window.BarcodeDetector({ formats: ['ean_13'] })
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false })
        if (stop) return
        const v = video.current!
        v.srcObject = stream
        await v.play()
        const tick = async () => {
          if (stop) return
          try {
            const codes = await det.detect(v)
            const isbn = codes.map((c) => c.rawValue).find((c) => /^97[89]\d{10}$/.test(c) && validEan13(c))
            if (isbn) { navigator.vibrate?.(30); onIsbn(isbn); return }
            if (codes.length) setHint('Ce code-barres n’est pas un ISBN. Cherche celui qui commence par 978 ou 979.')
          } catch { /* image pas prête */ }
          timer = window.setTimeout(tick, 250)
        }
        void tick()
      } catch (e) {
        const name = (e as { name?: string; message?: string })
        setError(
          name.message === 'unsupported'
            ? 'Ton navigateur ne sait pas lire les codes-barres. Tape l’ISBN (les 13 chiffres sous le code-barres) dans la recherche.'
            : name.name === 'NotAllowedError'
              ? 'L’accès à la caméra a été refusé. Autorise-le dans les réglages du site, ou tape l’ISBN.'
              : 'Impossible d’ouvrir la caméra. Tape l’ISBN dans la recherche.',
        )
      }
    }
    void run()
    return () => {
      stop = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onIsbn])

  return (
    <div className="scanner stack">
      {!error ? (
        <>
          <div className="scan-frame">
            <video ref={video} playsInline muted />
            <i aria-hidden="true" />
          </div>
          <p className="muted small" role="status">{hint}</p>
        </>
      ) : (
        <p className="err" role="alert">{error}</p>
      )}
      <div><button className="btn ghost sm" type="button" onClick={onClose}>Fermer la caméra</button></div>
    </div>
  )
}
