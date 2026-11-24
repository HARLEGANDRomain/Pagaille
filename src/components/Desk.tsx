import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Trinket, TRINKETS, trinketSize, type TrinketHandle } from './Trinket'
import { desk, useDesk, type Placement } from '../lib/trinkets/desk'
import { fractionOn, pointOn, stepFall, stepSlide, throwVelocity, type Body, type Surface } from '../lib/trinkets/physics'
import { useStore } from '../lib/store'
import { itemOf } from '../lib/trinkets/variants'

/* Les objets libres : un calque au-dessus de l'appli, qui ne capte les clics que sur les objets.
   Les objets tombent, rebondissent et se posent sur les PERCHOIRS : les éléments marqués data-perch
   (barre de navigation, zones comme la carte des missions, la pile, les livres). Jamais sur un texte ni un bouton.

   Une fois posé, un objet est accroché à son perchoir par une clé et une position relative (0 à 1) :
   il suit l'élément quand la page défile ou change de taille. S'il est posé sur un élément fixe
   (barre de navigation), il est positionné en fixed et visible sur tous les onglets ; sinon il est
   positionné dans la page (absolute), et le défilement le déplace sans calcul ni décalage.
   Si son perchoir disparaît (livre retiré, filtre, mise en page mobile), il retombe sur ce qu'il y a dessous. */

const GRACE = 1500 // ms à attendre qu'un perchoir apparaisse (chargement des livres) avant de laisser tomber l'objet
const SOL = '@sol'

const visible = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 8 && r.height > 0 }

function findPerch(key: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-perch="${CSS.escape(key)}"]`)) if (visible(el)) return el
  return null
}

function floorSurface(): Surface { return { key: SOL, x0: 0, x1: window.innerWidth, y: window.innerHeight, fixed: true } }

function surfaceOf(el: HTMLElement): Surface | null {
  const r = el.getBoundingClientRect()
  if (r.width <= 8 || r.height <= 0) return null
  const key = el.dataset.perch!
  const fixed = el.hasAttribute('data-perch-fixed')
  // « floor » : on se pose à l'intérieur, sur le fond (la planche d'une étagère, le sol de la pile).
  if (el.hasAttribute('data-perch-floor')) {
    const x0 = r.left + el.clientLeft + 4
    return { key, fixed, x0, x1: x0 + el.clientWidth - 8, y: r.top + el.clientTop + el.clientHeight }
  }
  return { key, fixed, x0: r.left + 4, x1: r.right - 4, y: r.top }
}

function allSurfaces(onlyFixed: boolean): Surface[] {
  const out: Surface[] = []
  for (const el of document.querySelectorAll<HTMLElement>('[data-perch]')) {
    if (onlyFixed && !el.hasAttribute('data-perch-fixed')) continue
    const s = surfaceOf(el)
    if (s && s.y > -40 && s.y < window.innerHeight + 4) out.push(s)
  }
  return out
}

type Mode = 'wait' | 'rest' | 'fall' | 'drag'

/** `id` : l'exemplaire (« obj-chat », « obj-chat#2 »…) ; `variant` : sa couleur. */
function Free({ id, variant, route, placement, slot, loading }: { id: string; variant?: string; route: string; placement: Placement | undefined; slot: number; loading: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const poke = useRef<TrinketHandle>(null)
  const { w, h } = trinketSize(itemOf(id))
  const R = useRef({
    mode: 'wait' as Mode,
    body: { x: 0, y: 0, vx: 0, vy: 0, w } as Body,
    key: '', fx: 0.5, el: null as HTMLElement | null, slide: 0,
    spawn: false, since: performance.now(), lastPos: '',
    press: null as null | { x: number; y: number; gx: number; gy: number; pid: number },
    samples: [] as { x: number; y: number; t: number }[], tilt: 0,
  })
  const live = useRef({ route, placement, slot, loading })
  live.current = { route, placement, slot, loading }

  const write = (x: number, y: number, fixed: boolean) => {
    const el = box.current
    if (!el) return
    const left = x - w / 2 + (fixed ? 0 : window.scrollX), top = y - h + (fixed ? 0 : window.scrollY)
    const pos = `${fixed ? 'f' : 'a'}${left.toFixed(1)},${top.toFixed(1)}`
    if (pos === R.current.lastPos) return
    R.current.lastPos = pos
    el.style.position = fixed ? 'fixed' : 'absolute'
    el.style.transform = `translate3d(${left.toFixed(1)}px,${top.toFixed(1)}px,0)`
  }

  const squash = (impact: number) => {
    const k = Math.min(1, impact / 1800)
    inner.current?.animate([
      { transform: 'scale(1,1)' }, { transform: `scale(${1 + 0.16 * k},${1 - 0.22 * k})` },
      { transform: `scale(${1 - 0.05 * k},${1 + 0.06 * k})` }, { transform: 'scale(1,1)' },
    ], { duration: 360, easing: 'ease-out' })
  }

  /** Lâche l'objet depuis sa position actuelle (en coordonnées de la fenêtre). */
  const fall = (vx = 0, vy = 0, ignore?: { key: string; y: number }) => {
    const r = R.current
    r.mode = 'fall'; r.el = null; r.slide = 0
    r.body.vx = vx; r.body.vy = vy; r.body.ignore = ignore
  }

  const spawn = () => {
    const r = R.current
    const nav = findPerch('nav')
    const s = nav ? surfaceOf(nav) : null
    const n = Math.max(1, live.current.slot + 1)
    const x = s ? pointOn(Math.min(0.92, 0.12 + live.current.slot * 0.2), s) : (window.innerWidth * n) / 6
    r.body.x = x; r.body.y = -20
    r.spawn = true
    if (box.current) box.current.style.opacity = '1'
    fall(0, 200)
  }

  const land = (s: Surface) => {
    const r = R.current
    r.mode = 'rest'; r.spawn = false
    r.key = s.key; r.fx = fractionOn(r.body.x, s)
    r.el = s.key === SOL ? null : findPerch(s.key)
    r.slide = r.body.vx * 0.6
    r.body.vx = 0
    desk.place(id, { key: s.key, fx: r.fx, route: s.fixed && s.key !== SOL ? null : live.current.route })
  }

  // Ranger tout (placement retiré) : l'objet retombe sur la barre de navigation.
  useEffect(() => {
    const r = R.current
    if (!placement && r.mode !== 'drag' && !r.spawn) spawn()
    else if (placement && r.mode === 'wait') { r.key = placement.key; r.fx = placement.fx; r.since = performance.now() }
  }, [placement]) // eslint-disable-line react-hooks/exhaustive-deps

  // Changement d'onglet : un objet posé sur un perchoir absent laisse le temps à la page de s'afficher.
  useEffect(() => { R.current.since = performance.now() }, [route])

  useEffect(() => {
    const r = R.current
    let raf = 0, last = performance.now()
    const frame = (t: number) => {
      const dt = Math.min(0.033, (t - last) / 1000)
      last = t
      if (r.mode === 'wait' || r.mode === 'rest') {
        let s: Surface | null = null
        if (r.key === SOL) s = floorSurface()
        else if (r.key) {
          if (!r.el || !r.el.isConnected || !visible(r.el)) r.el = findPerch(r.key)
          s = r.el ? surfaceOf(r.el) : null
        }
        if (s) {
          if (r.mode === 'wait') { r.mode = 'rest'; if (box.current) box.current.style.opacity = '1' }
          let x = pointOn(r.fx, s)
          if (r.slide) {
            const g = stepSlide(x, r.slide, dt, s)
            x = g.x; r.slide = g.vx
            if (g.off) { r.body.x = x; r.body.y = s.y; fall(r.slide, 0, { key: s.key, y: s.y }) }
            else { r.fx = fractionOn(x, s); if (!r.slide) desk.place(id, { key: r.key, fx: r.fx, route: s.fixed && s.key !== SOL ? null : live.current.route }) }
          }
          if (r.mode === 'rest') { r.body.x = x; r.body.y = s.y; write(x, s.y, s.fixed) }
        } else if (r.mode === 'rest' || (performance.now() - r.since > GRACE && !live.current.loading)) {
          // Le perchoir a disparu : l'objet tombe depuis là où il était (ou depuis le haut s'il n'a jamais été vu).
          if (r.mode === 'wait') { r.body.x = window.innerWidth * (0.3 + 0.1 * live.current.slot); r.body.y = -20 }
          if (box.current) box.current.style.opacity = '1'
          fall()
        }
      }
      if (r.mode === 'fall') {
        const res = stepFall(r.body, dt, allSurfaces(r.spawn), window.innerWidth, floorSurface())
        if (res.kind !== 'fall') squash(res.impact)
        if (res.kind === 'land') land(res.on)
        write(r.body.x, r.body.y, true)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- prise en main : un clic fait réagir l'objet, un glissement l'emporte, un lâcher le lance ---- */
  const footOnScreen = () => ({ x: R.current.body.x, y: R.current.body.y })
  const onDown = (e: React.PointerEvent) => {
    if (e.button > 0) return
    e.preventDefault(); e.stopPropagation()
    box.current!.setPointerCapture(e.pointerId)
    const f = footOnScreen()
    R.current.press = { x: e.clientX, y: e.clientY, gx: e.clientX - f.x, gy: e.clientY - f.y, pid: e.pointerId }
  }
  const onMove = (e: React.PointerEvent) => {
    const r = R.current, p = r.press
    if (!p || p.pid !== e.pointerId) return
    if (r.mode !== 'drag') {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return
      r.mode = 'drag'; r.el = null; r.slide = 0; r.spawn = false; r.samples = []
      box.current!.classList.add('held')
      document.body.classList.add('holding-trinket')
    }
    r.body.x = e.clientX - p.gx; r.body.y = e.clientY - p.gy
    r.samples.push({ x: e.clientX, y: e.clientY, t: performance.now() })
    if (r.samples.length > 12) r.samples.shift()
    const v = throwVelocity(r.samples)
    r.tilt += (Math.max(-20, Math.min(20, v.vx / 70)) - r.tilt) * 0.3
    if (inner.current) inner.current.style.rotate = `${r.tilt.toFixed(1)}deg`
    write(r.body.x, r.body.y, true)
  }
  const release = (e: React.PointerEvent, cancelled: boolean) => {
    const r = R.current, p = r.press
    if (!p || p.pid !== e.pointerId) return
    r.press = null
    if (r.mode === 'drag') {
      box.current!.classList.remove('held')
      document.body.classList.remove('holding-trinket')
      r.tilt = 0
      if (inner.current) inner.current.style.rotate = ''
      const v = cancelled ? { vx: 0, vy: 0 } : throwVelocity(r.samples, performance.now())
      fall(v.vx, v.vy)
    } else if (!cancelled) poke.current?.poke()
  }

  return (
    <div ref={box} className="free-obj" style={{ width: w, height: h, opacity: 0 }} data-obj={id}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={(e) => release(e, false)} onPointerCancel={(e) => release(e, true)}
      onContextMenu={(e) => e.preventDefault()}>
      <div ref={inner} className="free-inner"><Trinket id={itemOf(id)} variant={variant} copy={id} ref={poke} /></div>
    </div>
  )
}

/** Le calque des objets sortis, posé dans <body>. */
export default function Desk({ route }: { route: string }) {
  const st = useStore()
  const d = useDesk()
  const ids = d.out.filter((id) => TRINKETS[itemOf(id)] && st.owned.has(id))
  return createPortal(
    <>
      {ids.map((id, i) => {
        const p = d.place[id]
        if (p && p.route !== null && p.route !== route) return null // posé dans un autre onglet
        return <Free key={id} id={id} variant={st.variants[id]} route={route} placement={p} slot={i} loading={st.loading} />
      })}
    </>,
    document.body,
  )
}
