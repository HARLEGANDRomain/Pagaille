import type { ReactNode } from 'react'
import { ScenePreview } from './Scene'
import { Avatar } from '../lib/ui'
import type { Reader } from '../lib/presence'
import type { FeedItem, Member } from '../types'

/* La pièce de vie du cercle, en isométrique (2,5D, caméra fixe). Scène 800 × 560 dont les positions ne
   dépendent pas de l'écran. Un salon de lecture : deux canapés face à face autour d'une table basse,
   deux fauteuils, une banquette sous la fenêtre, une table de lecture. Trois rôles :
   - présence : chaque membre a sa place ; ceux qui lisent en ce moment ont la lampe allumée ;
   - mémoire : l'étagère commune (mur de droite) montre les livres terminés (droits) ou abandonnés (penchés) ;
   - objectif : la pile sur la table basse monte avec les pages de la semaine du cercle.
   La fenêtre (mur de gauche) montre l'ambiance de lecture de celui qui regarde : chacun voit la sienne.

   Repère : sol de GW × GD cases ; gx descend vers la droite (le long du mur de droite), gy vers la gauche
   (le long du mur de gauche), z monte. Le coin du fond est en (0, 0). */

export const W = 800, H = 560
const GW = 10, GD = 8, HW = 40, HH = 20, WALL = 200
const OX = 40 + GD * HW, OY = 18 + WALL
type Pt = [number, number]
const P = (gx: number, gy: number, z = 0): Pt => [OX + (gx - gy) * HW, OY + (gx + gy) * HH - z]
const pts = (l: Pt[]) => l.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

/** Une matière : dessus, face avant gauche (côté gy), face avant droite (côté gx). */
type Mat = { top: string; left: string; right: string }
const M = {
  wood: { top: 'var(--rm-wood-top)', left: 'var(--rm-wood-l)', right: 'var(--rm-wood-r)' },
  dark: { top: 'var(--rm-dark-top)', left: 'var(--rm-dark-l)', right: 'var(--rm-dark-r)' },
  blue: { top: 'var(--rm-blue-top)', left: 'var(--rm-blue-l)', right: 'var(--rm-blue-r)' },
  green: { top: 'var(--rm-green-top)', left: 'var(--rm-green-l)', right: 'var(--rm-green-r)' },
  red: { top: 'var(--rm-red-top)', left: 'var(--rm-red-l)', right: 'var(--rm-red-r)' },
  cream: { top: 'var(--rm-cream-top)', left: 'var(--rm-cream-l)', right: 'var(--rm-cream-r)' },
} satisfies Record<string, Mat>

/** Un pavé : origine (gx, gy, z), dimensions (w le long de gx, d le long de gy, h en hauteur). */
function Box({ x, y, z = 0, w, d, h, m }: { x: number; y: number; z?: number; w: number; d: number; h: number; m: Mat }) {
  const t = z + h
  return (
    <g>
      <polygon points={pts([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, t), P(x, y + d, t)])} fill={m.left} />
      <polygon points={pts([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, t), P(x + w, y, t)])} fill={m.right} />
      <polygon points={pts([P(x, y, t), P(x + w, y, t), P(x + w, y + d, t), P(x, y + d, t)])} fill={m.top} />
    </g>
  )
}

/** Un meuble à dessiner, trié par profondeur (centre au sol) pour que le plus proche passe devant. */
type Piece = { depth: number; node: ReactNode }
const piece = (x: number, y: number, w: number, d: number, node: ReactNode): Piece => ({ depth: x + w / 2 + y + d / 2, node })

export interface SeatDef { gx: number; gy: number; z: number; kind: string }
/** Les 12 places ; l'indice est celui enregistré en base (circle_members.seat). */
export const SEATS: SeatDef[] = [
  { gx: 0.5, gy: 2.9, z: 30, kind: 'la banquette sous la fenêtre' },
  { gx: 0.5, gy: 4.5, z: 30, kind: 'la banquette sous la fenêtre' },
  { gx: 3.75, gy: 2.05, z: 28, kind: 'le canapé du fond' },
  { gx: 5, gy: 2.05, z: 28, kind: 'le canapé du fond' },
  { gx: 6.25, gy: 2.05, z: 28, kind: 'le canapé du fond' },
  { gx: 3.75, gy: 6.2, z: 28, kind: 'le canapé de devant' },
  { gx: 5, gy: 6.2, z: 28, kind: 'le canapé de devant' },
  { gx: 6.25, gy: 6.2, z: 28, kind: 'le canapé de devant' },
  { gx: 8.35, gy: 4.1, z: 28, kind: 'le fauteuil près de la lampe' },
  { gx: 1.95, gy: 4.1, z: 28, kind: 'le fauteuil près de la fenêtre' },
  { gx: 8.5, gy: 7.4, z: 26, kind: 'la table de lecture' },
  { gx: 9.55, gy: 6.45, z: 26, kind: 'la table de lecture' },
]
const seatPt = (s: SeatDef) => P(s.gx, s.gy, s.z + 18)

const SPINES = ['#7A2333', '#1F4D45', '#24326B', '#C9772B', '#6B4428', '#3D5A9E', '#9C7A4A', '#5E7F8C', '#B8413A', '#2F6B5E']
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
const firstName = (n: string) => n.split(/\s+/)[0]

/* ---------- meubles ---------- */

function Sofa({ x, y, back }: { x: number; y: number; back: 'far' | 'near' }) {
  // 4 × 1 ; le dossier côté mur (far) ou côté spectateur (near).
  const by = back === 'far' ? y : y + 0.75
  return (
    <g>
      {back === 'far' && <Box x={x} y={by} w={4} d={0.25} h={58} m={M.blue} />}
      <Box x={x} y={y} w={0.3} d={1} h={36} m={M.blue} />
      <Box x={x + 0.3} y={back === 'far' ? y + 0.25 : y} w={3.4} d={0.75} h={24} m={M.blue} />
      <Box x={x + 3.7} y={y} w={0.3} d={1} h={36} m={M.blue} />
      {back === 'near' && <Box x={x} y={by} w={4} d={0.25} h={46} m={M.blue} />}
    </g>
  )
}
function Armchair({ x, y, back }: { x: number; y: number; back: 'right' | 'left' }) {
  // 1 × 1 ; dossier contre gx+ (right) ou gx- (left).
  return (
    <g>
      {back === 'left' && <Box x={x} y={y} w={0.25} d={1} h={56} m={M.green} />}
      <Box x={x} y={y} w={1} d={0.2} h={36} m={M.green} />
      <Box x={back === 'left' ? x + 0.25 : x} y={y + 0.2} w={0.75} d={0.6} h={24} m={M.green} />
      <Box x={x} y={y + 0.8} w={1} d={0.2} h={36} m={M.green} />
      {back === 'right' && <Box x={x + 0.75} y={y} w={0.25} d={1} h={56} m={M.green} />}
    </g>
  )
}
function Chair({ x, y, back }: { x: number; y: number; back: 'near' | 'right' }) {
  return (
    <g>
      <Box x={x + 0.05} y={y + 0.05} w={0.1} d={0.1} h={20} m={M.dark} /><Box x={x + 0.45} y={y + 0.45} w={0.1} d={0.1} h={20} m={M.dark} />
      <Box x={x} y={y} w={0.6} d={0.6} h={6} z={20} m={M.wood} />
      {back === 'near' ? <Box x={x} y={y + 0.5} w={0.6} d={0.1} h={30} z={26} m={M.wood} /> : <Box x={x + 0.5} y={y} w={0.1} d={0.6} h={30} z={26} m={M.wood} />}
    </g>
  )
}

/* ---------- étagère commune (mur de droite, face avant en gy = SD) ---------- */
const SX = 4.6, SW = 4.9, SD = 0.55, SH = 176, PLANKS = [8, 64, 120]
const onShelf = (gx: number, z: number) => P(gx, SD, z)

function Shelf({ feed, uid }: { feed: FeedItem[]; uid: string }) {
  const books: ReactNode[] = []
  let p = 0, x = SX + 0.15
  for (const f of feed) {
    const h = hash(f.work_title + f.user_id)
    const w = 0.28 + (h % 4) * 0.05, ht = 36 + (h % 12)
    if (x + w > SX + SW - 0.15) { p++; x = SX + 0.15 }
    if (p >= PLANKS.length) break
    const z = PLANKS[p] + 6, tilt = f.status === 'abandon' ? 0.22 : 0
    books.push(
      <polygon key={f.user_book_id} points={pts([onShelf(x, z), onShelf(x + w, z), onShelf(x + w - tilt, z + ht), onShelf(x - tilt, z + ht)])} fill={SPINES[h % SPINES.length]} stroke="rgba(0,0,0,.25)" strokeWidth=".6">
        <title>{`${f.work_title} — ${f.status === 'fini' ? 'terminé' : 'abandonné'} par ${f.user_id === uid ? 'toi' : f.display_name}`}</title>
      </polygon>,
    )
    x += w + (tilt ? 0.3 : 0.04)
  }
  const [hx, hy] = onShelf(SX + SW / 2 - 1.6, 78)
  return (
    <g>
      <Box x={SX} y={0} w={SW} d={SD} h={SH} m={M.dark} />
      {/* creux du meuble : le fond, puis les planches */}
      <polygon points={pts([onShelf(SX + 0.12, 8), onShelf(SX + SW - 0.12, 8), onShelf(SX + SW - 0.12, SH - 8), onShelf(SX + 0.12, SH - 8)])} fill="var(--rm-shelf-back)" />
      {PLANKS.map((z) => <polygon key={z} points={pts([onShelf(SX + 0.12, z), onShelf(SX + SW - 0.12, z), onShelf(SX + SW - 0.12, z + 6), onShelf(SX + 0.12, z + 6)])} fill="var(--rm-wood-top)" />)}
      {books}
      {!feed.length && <text transform={`matrix(1 .5 0 1 ${hx} ${hy})`} className="room-hint">Les livres finis du cercle viendront ici</text>}
    </g>
  )
}

/* ---------- table basse et pile de la semaine ---------- */
const TX = 4, TY = 3.65, TW = 2, TD = 1.25, TH = 26

function Pile({ total, goal }: { total: number; goal: number }) {
  const n = Math.min(10, Math.ceil((total / Math.max(1, goal)) * 10))
  const out: ReactNode[] = []
  for (let i = 0; i < n; i++) {
    const h = hash('p' + i), c = SPINES[h % SPINES.length], j = ((h % 5) - 2) * 0.04
    const m = { top: c, left: c, right: c }
    out.push(<g key={i} opacity={1}><Box x={4.65 + j} y={3.95 - j} w={0.75} d={0.55} h={7} z={TH + i * 7} m={m} /><polygon points={pts([P(4.65 + j, 4.5 - j, TH + i * 7 + 2), P(5.4 + j, 4.5 - j, TH + i * 7 + 2), P(5.4 + j, 4.5 - j, TH + i * 7 + 5), P(4.65 + j, 4.5 - j, TH + i * 7 + 5)])} fill="#F4EEDF" opacity=".85" /></g>)
  }
  const [fx, fy] = P(5.02, 4.22, TH + n * 7)
  return (
    <g>
      <title>{`Cette semaine : ${total} pages sur ${goal}`}</title>
      {out}
      {total >= goal && <path d={`M${fx} ${fy}v-26l18 7-18 7`} fill="var(--mark)" stroke="var(--rm-line)" strokeWidth="1.5" />}
      <text x={fx} y={fy - (total >= goal ? 40 : 12)} textAnchor="middle" className="room-count">{total} / {goal} p.</text>
    </g>
  )
}

function Lamp({ on }: { on: boolean }) {
  const [bx, by] = P(9.4, 2.7, 0), [sx, sy] = P(9.4, 2.7, 150)
  return (
    <g>
      {on && <circle cx={sx} cy={sy + 10} r="70" fill="url(#room-glow)" />}
      <ellipse cx={bx} cy={by} rx="16" ry="7" fill="var(--rm-line)" />
      <path d={`M${bx} ${by}V${sy}`} stroke="var(--rm-line)" strokeWidth="3" />
      <path d={`M${sx - 18} ${sy + 6}h36l-8-26h-20z`} fill={on ? '#FFE9A0' : 'var(--rm-cream-top)'} stroke="var(--rm-line)" strokeWidth="1.2" />
    </g>
  )
}

/* ---------- la pièce ---------- */

export default function Room({ members, feed, total, goal, readers, uid, ambiance, compact = false, onSit, onMember }: {
  members: Member[]
  feed: FeedItem[]
  total: number
  goal: number
  readers: Reader[]
  uid: string
  ambiance: string
  compact?: boolean
  onSit?: (seat: number | null) => void
  onMember?: (m: Member) => void
}) {
  const reading = new Set(readers.map((r) => r.id))
  const bySeat = new Map<number, Member>()
  for (const m of members) if (m.seat != null && SEATS[m.seat]) bySeat.set(m.seat, m)
  const me = members.find((m) => m.user_id === uid)
  const mySeat = me?.seat ?? null
  const pct = (v: number, of: number) => `${(v / of) * 100}%`

  // Fenêtre sur le mur de gauche (plan gx = 0), de gy 2.2 à 5.2, de z 72 à 178.
  const WIN = { gy0: 2.3, gy1: 5.1, z0: 74, z1: 176 }
  const [wx, wy] = P(0, WIN.gy1, WIN.z1) // coin haut gauche à l'écran
  const winW = (WIN.gy1 - WIN.gy0) * HW, winH = WIN.z1 - WIN.z0

  const furniture: Piece[] = [
    piece(TX, TY, TW, TD, <Box x={TX} y={TY} w={TW} d={TD} h={TH} m={M.wood} />),
    piece(3, 1.3, 4, 1, <Sofa x={3} y={1.3} back="far" />),
    piece(3, 5.85, 4, 1, <Sofa x={3} y={5.85} back="near" />),
    piece(7.85, 3.6, 1, 1, <Armchair x={7.85} y={3.6} back="right" />),
    piece(1.45, 3.6, 1, 1, <Armchair x={1.45} y={3.6} back="left" />),
    piece(0, 2.1, 0.95, 3.3, <g><Box x={0} y={2.1} w={0.95} d={3.3} h={22} m={M.red} /><Box x={0.05} y={2.15} w={0.85} d={3.2} h={6} z={22} m={M.cream} /></g>),
    piece(8.4, 6.05, 1.1, 1.1, <g><Box x={8.85} y={6.5} w={0.2} d={0.2} h={30} m={M.dark} /><Box x={8.4} y={6.05} w={1.1} d={1.1} h={5} z={30} m={M.wood} /></g>),
    piece(8.2, 7.1, 0.6, 0.6, <Chair x={8.2} y={7.1} back="near" />),
    piece(9.25, 6.15, 0.6, 0.6, <Chair x={9.25} y={6.15} back="right" />),
  ].sort((a, b) => a.depth - b.depth)

  return (
    <div className={`room${compact ? ' compact' : ''}`} role="group" aria-label="La pièce du cercle">
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <defs>
          <radialGradient id="room-glow"><stop offset="0" stopColor="#FFDD3C" stopOpacity=".55" /><stop offset="1" stopColor="#FFDD3C" stopOpacity="0" /></radialGradient>
        </defs>
        {/* murs et sol */}
        <polygon points={pts([P(0, 0, 0), P(0, GD, 0), P(0, GD, WALL), P(0, 0, WALL)])} fill="var(--rm-wall-l)" />
        <polygon points={pts([P(0, 0, 0), P(GW, 0, 0), P(GW, 0, WALL), P(0, 0, WALL)])} fill="var(--rm-wall-r)" />
        <polygon points={pts([P(0, 0), P(GW, 0), P(GW, GD), P(0, GD)])} fill="var(--rm-floor)" />
        {Array.from({ length: GD * 2 - 1 }, (_, i) => <line key={i} x1={P(0, (i + 1) / 2)[0]} y1={P(0, (i + 1) / 2)[1]} x2={P(GW, (i + 1) / 2)[0]} y2={P(GW, (i + 1) / 2)[1]} stroke="var(--rm-floor-line)" strokeWidth="1" />)}
        <polygon points={pts([P(0, GD, 0), P(0, 0, 0), P(GW, 0, 0), P(GW, 0, 7), P(0, 0, 7), P(0, GD, 7)])} fill="var(--rm-dark-l)" />
        <polyline points={pts([P(0, GD, WALL), P(0, 0, WALL), P(GW, 0, WALL)])} fill="none" stroke="var(--rm-dark-r)" strokeWidth="4" />
        {/* encadrement de la fenêtre (le <canvas> de l'ambiance est posé par-dessus) */}
        <polygon points={pts([P(0, WIN.gy0 - 0.15, WIN.z0 - 8), P(0, WIN.gy1 + 0.15, WIN.z0 - 8), P(0, WIN.gy1 + 0.15, WIN.z1 + 8), P(0, WIN.gy0 - 0.15, WIN.z1 + 8)])} fill="var(--rm-wood-l)" />
        {/* tapis */}
        <polygon points={pts([P(2.6, 2.6), P(7.5, 2.6), P(7.5, 5.7), P(2.6, 5.7)])} fill="var(--rm-rug)" />
        <Shelf feed={feed} uid={uid} />
        {furniture.map((f, i) => <g key={i}>{f.node}</g>)}
        <Pile total={total} goal={goal} />
        <Lamp on={readers.length > 0} />
        {[...bySeat].filter(([, m]) => reading.has(m.user_id)).map(([i]) => { const [x, y] = seatPt(SEATS[i]); return <circle key={i} cx={x} cy={y} r="62" fill="url(#room-glow)" /> })}
      </svg>
      <div className="room-window" style={{ left: pct(wx, W), top: pct(wy, H), width: pct(winW, W), height: pct(winH, H) }}>
        <ScenePreview kind={ambiance} playing className="room-window-cv" />
        <i className="room-mullion v" /><i className="room-mullion h" />
      </div>

      {SEATS.map((s, i) => {
        const m = bySeat.get(i)
        const [x, y] = seatPt(s)
        const style = { left: pct(x, W), top: pct(y, H) }
        if (!m) {
          if (compact || !onSit) return null
          return (
            <button key={i} data-seat={i} className="room-seat free" style={style} onClick={() => onSit(i)}
              aria-label={mySeat == null ? `Place libre : ${s.kind}. T’y asseoir` : `Place libre : ${s.kind}. Changer de place pour celle-ci`}
              title={mySeat == null ? 'T’asseoir ici' : 'Changer de place'} />
          )
        }
        const mine = m.user_id === uid, on = reading.has(m.user_id)
        const label = `${mine ? 'Toi' : m.display_name}, ${s.kind}${on ? ', en train de lire' : ''}`
        const body = (
          <>
            <span className="room-av">
              <Avatar name={m.display_name} color={m.avatar_color} url={m.avatar_url} me={mine} />
              {on && <svg className="room-book" viewBox="0 0 24 12" aria-hidden="true"><path d="M1 2c4-1.5 8-1.5 11 1 3-2.5 7-2.5 11-1v9c-4-1.5-8-1.5-11 1-3-2.5-7-2.5-11-1z" fill="#F4EEDF" stroke="#161D3A" strokeWidth="1" /><path d="M12 3v9" stroke="#161D3A" strokeWidth="1" /></svg>}
            </span>
            {!compact && <span className="room-name">{mine ? 'Toi' : firstName(m.display_name)}</span>}
          </>
        )
        const cls = `room-seat taken${on ? ' reading' : ''}${mine ? ' mine' : ''}`
        if (compact || (!onMember && !mine)) return <div key={i} data-seat={i} className={cls} style={style} role="img" aria-label={label}>{body}</div>
        return (
          <button key={i} data-seat={i} className={cls} style={style} aria-label={mine ? `${label}. Te lever` : `${label}. Voir sa bibliothèque`}
            onClick={() => (mine ? onSit?.(null) : onMember?.(m))} title={mine ? 'Te lever' : 'Sa bibliothèque'}>
            {body}
          </button>
        )
      })}
    </div>
  )
}
