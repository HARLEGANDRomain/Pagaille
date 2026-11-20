import { useEffect, useId, useImperativeHandle, useRef, type Ref } from 'react'
import { desk, useDesk } from '../lib/trinkets/desk'

/* Les objets de la boutique, dessinés en SVG par morceaux (tête, queue, feuilles, flamme, sable…)
   pour animer chaque partie à part.
   - Au repos : une animation de fond lente (CSS) + de petites actions à intervalles irréguliers,
     sinon l'objet paraît mécanique au bout de quelques secondes.
   - Au clic (poke) : une action complète, puis retour au repos. Les clics pendant l'action sont ignorés.
   Si l'appareil demande moins d'animations, le repos est immobile ; le clic reste possible. */

export interface TrinketHandle { poke: () => void }

/** Dimensions : la boîte du dessin et la hauteur affichée. Le bas du dessin est le pied de l'objet. */
export const TRINKETS: Record<string, { vb: [number, number]; h: number }> = {
  'obj-plante': { vb: [60, 84], h: 84 },
  'obj-bougie': { vb: [40, 84], h: 78 },
  'obj-sablier': { vb: [44, 84], h: 74 },
  'obj-chat': { vb: [84, 60], h: 60 },
  'obj-globe': { vb: [60, 84], h: 80 },
}
export const trinketSize = (id: string, h?: number) => {
  const t = TRINKETS[id]
  const hh = h ?? t.h
  return { w: (hh * t.vb[0]) / t.vb[1], h: hh }
}

const still = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion:reduce)').matches
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
/** Origine des transformations exprimée dans les unités du dessin. */
const at = (x: number, y: number) => ({ transformBox: 'view-box', transformOrigin: `${x}px ${y}px` }) as React.CSSProperties

/** Une petite action de temps en temps, à intervalle irrégulier, seulement quand l'onglet est visible. */
function useNow(fn: () => void, min: number, max: number) {
  const f = useRef(fn)
  f.current = fn
  useEffect(() => {
    if (still()) return
    let id = 0
    const plan = () => { id = window.setTimeout(() => { if (!document.hidden) f.current(); plan() }, rnd(min, max)) }
    plan()
    return () => clearTimeout(id)
  }, [min, max])
}

/** Boucle d'animation (requestAnimationFrame) ; `fn` renvoie false pour s'arrêter. */
function loop(fn: (dt: number) => boolean) {
  let raf = 0, last = performance.now()
  const tick = (t: number) => {
    const dt = Math.min(0.05, (t - last) / 1000)
    last = t
    if (fn(dt)) raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(raf)
}

const play = (el: Element | null, k: Keyframe[], o: KeyframeAnimationOptions) => el?.animate(k, { fill: 'none', ...o }).finished.catch(() => {})

/* ---------------- Chat ---------------- */
function Cat({ handle }: { handle: Ref<TrinketHandle> | undefined }) {
  const head = useRef<SVGGElement>(null), tail = useRef<SVGGElement>(null), earL = useRef<SVGGElement>(null), earR = useRef<SVGGElement>(null)
  const open = useRef<SVGGElement>(null), shut = useRef<SVGGElement>(null)
  const busy = useRef(false)
  useNow(() => {
    if (busy.current) return
    if (Math.random() < 0.55) void play(Math.random() < 0.5 ? earL.current : earR.current, [{ transform: 'rotate(0)' }, { transform: 'rotate(-14deg)' }, { transform: 'rotate(4deg)' }, { transform: 'rotate(0)' }], { duration: 380, easing: 'ease-out' })
    else void play(tail.current, [{ transform: 'rotate(0)' }, { transform: 'rotate(-16deg)' }, { transform: 'rotate(6deg)' }, { transform: 'rotate(0)' }], { duration: 900, easing: 'ease-in-out' })
  }, 7000, 20000)
  useImperativeHandle(handle, () => ({
    poke() {
      if (busy.current) return
      busy.current = true
      const eyes = (o: boolean) => { open.current?.setAttribute('opacity', o ? '1' : '0'); shut.current?.setAttribute('opacity', o ? '0' : '1') }
      eyes(true)
      void play(head.current, [
        { transform: 'rotate(0)', offset: 0 }, { transform: 'rotate(26deg)', offset: 0.18, easing: 'ease-in-out' },
        { transform: 'rotate(22deg)', offset: 0.5 }, { transform: 'rotate(26deg)', offset: 0.72 }, { transform: 'rotate(0)', offset: 1 },
      ], { duration: 2000, easing: 'ease-in-out' })
      void play(tail.current, [
        { transform: 'rotate(0)' }, { transform: 'rotate(-30deg)' }, { transform: 'rotate(12deg)' }, { transform: 'rotate(-26deg)' },
        { transform: 'rotate(10deg)' }, { transform: 'rotate(-18deg)' }, { transform: 'rotate(0)' },
      ], { duration: 1700, delay: 150, easing: 'ease-in-out' })!.then(() => setTimeout(() => { eyes(false); busy.current = false }, 300))
    },
  }), [])
  return (
    <>
      <g className="t-cat-tail" style={at(16, 57)} ref={tail}>
        <g className="t-sway-tail" style={at(16, 57)}><path d="M17 57c-9 0-13-6-10-13" stroke="#2A2D3A" strokeWidth="5" fill="none" strokeLinecap="round" /></g>
      </g>
      <path className="t-breathe" style={at(42, 60)} d="M10 60c0-18 12-28 31-28s33 10 33 28z" fill="#2A2D3A" />
      <g ref={head} style={at(54, 42)}>
        <g ref={earL} style={at(55, 21)}><path d="M51 23l3-13 8 9z" fill="#2A2D3A" /></g>
        <g ref={earR} style={at(69, 21)}><path d="M64 19l9-9 1 14z" fill="#2A2D3A" /></g>
        <circle cx="62" cy="30" r="13" fill="#2A2D3A" />
        <g ref={shut}><path d="M56 31q3 2 5 0M64 31q3 2 5 0" stroke="#E8D9A8" strokeWidth="1.4" fill="none" strokeLinecap="round" /></g>
        <g ref={open} opacity="0"><circle cx="58.5" cy="31" r="1.9" fill="#E8D9A8" /><circle cx="66.5" cy="31" r="1.9" fill="#E8D9A8" /></g>
        <path d="M62 34.5l-1.4 1.2h2.8z" fill="#C98B8B" />
      </g>
    </>
  )
}

/* ---------------- Bougie ---------------- */
function Candle({ handle, uid }: { handle: Ref<TrinketHandle> | undefined; uid: string }) {
  const { candleOff } = useDesk()
  const flame = useRef<SVGGElement>(null), halo = useRef<SVGCircleElement>(null), smoke = useRef<SVGPathElement>(null), inner = useRef<SVGGElement>(null)
  const busy = useRef(false)
  useNow(() => {
    if (busy.current || desk.get().candleOff) return
    void play(inner.current, [{ transform: 'skewX(0) scaleY(1)' }, { transform: 'skewX(14deg) scaleY(.82)' }, { transform: 'skewX(-9deg) scaleY(1.1)' }, { transform: 'skewX(0) scaleY(1)' }], { duration: 520, easing: 'ease-out' })
  }, 4000, 12000)
  useImperativeHandle(handle, () => ({
    poke() {
      if (busy.current) return
      busy.current = true
      const off = !desk.get().candleOff
      if (off) {
        void play(smoke.current, [{ opacity: 0, transform: 'translateY(0)' }, { opacity: 0.75, transform: 'translateY(-3px)', offset: 0.2 }, { opacity: 0, transform: 'translateY(-14px)' }], { duration: 1500, easing: 'ease-out' })
        void play(flame.current, [{ transform: 'scale(1)' }, { transform: 'scale(1.15,.6)', offset: 0.4 }, { transform: 'scale(0)' }], { duration: 260, easing: 'ease-in' })!.then(() => { desk.setCandleOff(true); busy.current = false })
      } else {
        desk.setCandleOff(false)
        void play(flame.current, [{ transform: 'scale(0)' }, { transform: 'scale(.5,1.3)', offset: 0.45 }, { transform: 'scale(1.18,.9)', offset: 0.7 }, { transform: 'scale(1)' }], { duration: 650, easing: 'ease-out' })!.then(() => { busy.current = false })
      }
    },
  }), [])
  return (
    <>
      <defs><radialGradient id={`halo${uid}`}><stop offset="0" stopColor="#FFDD3C" stopOpacity=".55" /><stop offset="1" stopColor="#FFDD3C" stopOpacity="0" /></radialGradient></defs>
      <circle ref={halo} className={`t-halo${candleOff ? ' off' : ''}`} style={at(20, 30)} cx="20" cy="30" r="17" fill={`url(#halo${uid})`} />
      <rect x="12" y="44" width="16" height="39" rx="2" fill="#F1EBDD" stroke="#161D3A" strokeWidth="1.5" />
      <path d="M13 47c2 0 2 6 4 6s1-5 3-5" stroke="#D9CFB8" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M20 44v-6" stroke="#161D3A" strokeWidth="1.5" />
      <path ref={smoke} d="M20 37c-3-4 3-7 0-11s3-7 0-11" stroke="#9AA3C4" strokeWidth="1.3" fill="none" strokeLinecap="round" opacity="0" />
      <g ref={flame} style={{ ...at(20, 38), transform: candleOff ? 'scale(0)' : undefined }}>
        <g ref={inner} style={at(20, 38)}>
          <g className="t-flicker" style={at(20, 38)}>
            <path d="M20 21c5 6 6 11 0 17-6-6-5-11 0-17z" fill="#FFDD3C" stroke="#C9772B" strokeWidth="1.2" />
            <path d="M20 29c2 3 2.5 5 0 8-2.5-3-2-5 0-8z" fill="#FFF6C8" />
          </g>
        </g>
      </g>
    </>
  )
}

/* ---------------- Plante ---------------- */
const LEAVES: { d: string; o: [number, number]; fill: string }[] = [
  { d: 'M30 52c-7 0-12-5-13-11 7 0 12 4 13 11z', o: [30, 52], fill: '#2F6B5E' },
  { d: 'M30 48c6-1 11-5 12-11-7 0-11 4-12 11z', o: [30, 48], fill: '#2F6B5E' },
  { d: 'M30 44c-10-2-15-9-15-18 9 0 15 7 15 18z', o: [30, 44], fill: '#1F4D45' },
  { d: 'M30 38c9-3 14-11 13-20-9 2-14 10-13 20z', o: [30, 38], fill: '#1F4D45' },
]
function Plant({ handle }: { handle: Ref<TrinketHandle> | undefined }) {
  const leaves = useRef<(SVGGElement | null)[]>([])
  const stem = useRef<SVGGElement>(null)
  const busy = useRef(false)
  useNow(() => {
    if (busy.current) return
    const i = Math.floor(Math.random() * LEAVES.length)
    void play(leaves.current[i], [{ transform: 'rotate(0)' }, { transform: 'rotate(5deg)' }, { transform: 'rotate(-3deg)' }, { transform: 'rotate(0)' }], { duration: 700, easing: 'ease-in-out' })
  }, 5000, 14000)
  useImperativeHandle(handle, () => ({
    poke() {
      if (busy.current) return
      busy.current = true
      // Une rafale venue de la gauche : chaque feuille oscille comme un ressort qui s'amortit, un peu après la précédente.
      const k = [0, 18, -11, 8, -5, 3, -1, 0].map((d) => ({ transform: `rotate(${d}deg)` }))
      void play(stem.current, [0, 5, -3, 2, -1, 0].map((d) => ({ transform: `rotate(${d}deg)` })), { duration: 1600, easing: 'ease-out' })
      const all = leaves.current.map((el, i) => play(el, k, { duration: 1800, delay: i * 70, easing: 'ease-out' }))
      void Promise.all(all).then(() => { busy.current = false })
    },
  }), [])
  return (
    <>
      <g ref={stem} style={at(30, 60)}>
        <path d="M30 60V34" stroke="#1F4D45" strokeWidth="2" strokeLinecap="round" />
        {LEAVES.map((l, i) => (
          <g key={i} className={`t-leaf t-leaf${i}`} style={at(...l.o)}>
            <g ref={(el) => { leaves.current[i] = el }} style={at(...l.o)}><path d={l.d} fill={l.fill} /></g>
          </g>
        ))}
      </g>
      <path d="M18 61h24l-3 22H21z" fill="#C9772B" />
      <rect x="16" y="57" width="28" height="5" rx="1.5" fill="#B5651F" />
    </>
  )
}

/* ---------------- Sablier ---------------- */
const GLASS = 'M12 32C12 46 21 50 21 56C21 62 12 66 12 80L32 80C32 66 23 62 23 56C23 50 32 46 32 32Z'
function Hourglass({ handle, uid }: { handle: Ref<TrinketHandle> | undefined; uid: string }) {
  const flip = useRef<SVGGElement>(null), top = useRef<SVGRectElement>(null), bot = useRef<SVGRectElement>(null), stream = useRef<SVGLineElement>(null)
  const s = useRef(0.4) // part du sable encore en haut
  const rate = useRef(1 / 120) // vitesse d'écoulement (part par seconde) : lente au repos, rapide après un retournement
  const busy = useRef(false)
  const stop = useRef<() => void>(() => {})
  const draw = () => {
    const v = s.current
    top.current?.setAttribute('y', String(56 - 22 * v)); top.current?.setAttribute('height', String(22 * v))
    bot.current?.setAttribute('y', String(80 - 22 * (1 - v))); bot.current?.setAttribute('height', String(22 * (1 - v)))
    stream.current?.setAttribute('y2', String(80 - 22 * (1 - v)))
    stream.current?.setAttribute('opacity', v > 0.002 && !busy.current ? '1' : '0')
  }
  const flow = () => {
    stop.current()
    if (still() && rate.current < 0.1) { draw(); return }
    stop.current = loop((dt) => {
      s.current = Math.max(0, s.current - rate.current * dt)
      draw()
      if (s.current <= 0) { rate.current = 1 / 120; draw(); return false }
      return true
    })
  }
  useEffect(() => { draw(); flow(); return () => stop.current() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useImperativeHandle(handle, () => ({
    poke() {
      if (busy.current) return
      busy.current = true
      stop.current()
      draw()
      void play(flip.current, [{ transform: 'rotate(0)' }, { transform: 'rotate(-12deg)', offset: 0.15 }, { transform: 'rotate(195deg)', offset: 0.8 }, { transform: 'rotate(180deg)' }], { duration: 800, easing: 'ease-in-out' })!.then(() => {
        // Le dessin est symétrique : on remet à l'endroit et on échange le sable, l'œil n'y voit rien.
        s.current = 1 - s.current
        busy.current = false
        rate.current = 1 / 5
        draw(); flow()
      })
    },
  }), []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <defs><clipPath id={`glass${uid}`}><path d={GLASS} /></clipPath></defs>
      <g ref={flip} style={at(22, 56)}>
        <path d={GLASS} fill="rgba(255,255,255,.4)" />
        <g clipPath={`url(#glass${uid})`}>
          <rect ref={top} x="10" width="24" fill="#E0B84A" />
          <rect ref={bot} x="10" width="24" fill="#E0B84A" />
        </g>
        <line ref={stream} className="t-stream" x1="22" y1="56" x2="22" y2="80" stroke="#E0B84A" strokeWidth="1.2" />
        <path d={GLASS} fill="none" stroke="#161D3A" strokeWidth="1.4" />
        <path d="M9 32v48M35 32v48" stroke="#6B4428" strokeWidth="2" />
        <rect x="5" y="28" width="34" height="4" rx="1.2" fill="#6B4428" />
        <rect x="5" y="80" width="34" height="4" rx="1.2" fill="#6B4428" />
      </g>
    </>
  )
}

/* ---------------- Globe ---------------- */
const LAND = [
  'M4 20c5-3 11-2 13 2s-1 8 2 11-3 7-7 5-6-6-8-10 0-6 0-8z',
  'M28 13c6 0 10 4 8 7s-6 2-8 5-6 1-6-3 2-9 6-9z',
  'M44 31c5-1 10 2 9 7s-5 9-9 8-3-6-4-9 1-5 4-6z',
  'M60 16c4-2 9 0 10 3s-2 5-6 5-6-5-4-8z',
  'M21 41c3-1 6 1 6 4s-3 4-5 3-3-6-1-7z',
  'M66 40c3 0 5 2 4 4s-4 2-5 0-1-4 1-4z',
]
const BAND = 80
function Globe({ handle, uid }: { handle: Ref<TrinketHandle> | undefined; uid: string }) {
  const band = useRef<SVGGElement>(null)
  const off = useRef(Math.random() * BAND)
  const v = useRef(0) // vitesse de rotation, unités du dessin par seconde
  const mode = useRef<'idle' | 'spin' | 'rest'>('idle')
  const restUntil = useRef(0)
  const IDLE = 2.2
  useEffect(() => {
    const calm = still()
    if (!calm) v.current = IDLE
    const draw = () => band.current?.setAttribute('transform', `translate(${(off.current % BAND) - BAND} 0)`)
    draw()
    return loop((dt) => {
      if (mode.current === 'spin') {
        v.current *= Math.exp(-1.25 * dt) // frottement : vite au début, puis de plus en plus lentement
        if (v.current < 6) v.current -= 4 * dt
        if (v.current <= 0) { v.current = 0; mode.current = 'rest'; restUntil.current = performance.now() + 1800 }
      } else if (mode.current === 'rest') {
        if (performance.now() > restUntil.current && !calm) mode.current = 'idle'
      } else if (!calm) v.current += (IDLE - v.current) * Math.min(1, dt * 0.8)
      off.current += v.current * dt
      draw()
      return true
    })
  }, [])
  useImperativeHandle(handle, () => ({
    poke() {
      mode.current = 'spin'
      v.current = Math.min(520, v.current + 300) // chaque clic relance, sans repartir de zéro
    },
  }), [])
  return (
    <>
      <defs>
        <clipPath id={`sphere${uid}`}><circle cx="30" cy="34" r="20" /></clipPath>
        <radialGradient id={`shade${uid}`} cx="38%" cy="32%" r="70%"><stop offset="0" stopColor="#fff" stopOpacity=".28" /><stop offset=".55" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#0B1024" stopOpacity=".45" /></radialGradient>
      </defs>
      <circle cx="30" cy="34" r="20" fill="#5E7F8C" />
      <g clipPath={`url(#sphere${uid})`}>
        <g transform="rotate(-18 30 34)">
          <g ref={band}>
            {[0, BAND].map((dx) => <g key={dx} transform={`translate(${dx} 0)`}>{LAND.map((d, i) => <path key={i} d={d} fill="#2F6B5E" />)}</g>)}
          </g>
        </g>
      </g>
      <circle cx="30" cy="34" r="20" fill={`url(#shade${uid})`} stroke="#161D3A" strokeWidth="1.4" />
      <path d="M8 34a22 22 0 0 0 44 0" fill="none" stroke="#161D3A" strokeWidth="1.6" />
      <path d="M30 56v14M18 83h24M30 70l-8 13M30 70l8 13" fill="none" stroke="#161D3A" strokeWidth="2.2" strokeLinecap="round" />
    </>
  )
}

/** Un objet de la boutique, vivant. `h` : hauteur affichée en px (par défaut, celle de l'objet libre). */
export function Trinket({ id, h, ref }: { id: string; h?: number; ref?: Ref<TrinketHandle> }) {
  const uid = useId().replace(/:/g, '')
  const t = TRINKETS[id]
  if (!t) return null
  const { w, h: hh } = trinketSize(id, h)
  return (
    <svg className="trinket" viewBox={`0 0 ${t.vb[0]} ${t.vb[1]}`} width={w} height={hh} aria-hidden="true" overflow="visible">
      {id === 'obj-chat' && <Cat handle={ref} />}
      {id === 'obj-bougie' && <Candle handle={ref} uid={uid} />}
      {id === 'obj-plante' && <Plant handle={ref} />}
      {id === 'obj-sablier' && <Hourglass handle={ref} uid={uid} />}
      {id === 'obj-globe' && <Globe handle={ref} uid={uid} />}
    </svg>
  )
}
