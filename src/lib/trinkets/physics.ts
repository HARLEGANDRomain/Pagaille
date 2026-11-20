/* La physique des objets de l'étagère, en version « jeu de plateforme » : gravité, rebond, glissade.
   Pas de rotation réelle ni de collision entre objets. Les surfaces sont des plateformes à sens unique :
   on tombe dessus par le haut, on les traverse par en dessous. Tout est en pixels de la fenêtre (viewport).
   Ce module ne touche pas au DOM : il est testé à part (physics.test.ts). */

export interface Surface {
  key: string
  x0: number
  x1: number
  y: number
  /** Surface attachée à un élément fixe (barre de navigation, sol de l'écran) plutôt qu'au contenu de la page. */
  fixed: boolean
}

export interface Body {
  /** Pied de l'objet : milieu du bas. */
  x: number
  y: number
  vx: number
  vy: number
  w: number
  /** Surface qu'on vient de quitter par le bord : ignorée tant que le pied n'est pas passé dessous. */
  ignore?: { key: string; y: number }
}

export const G = 2600 // px/s²
export const BOUNCE_MIN = 520 // en dessous de cette vitesse d'impact, l'objet se pose au lieu de rebondir
export const RESTITUTION = 0.28
export const FRICTION = 1700 // décélération de glissade, px/s²
export const MAX_V = 2600

export const clampV = (v: number) => Math.max(-MAX_V, Math.min(MAX_V, v))

/** La plus haute surface traversée par le pied entre y0 et y1, sous l'emprise horizontale de l'objet. */
export function landingSurface(x: number, w: number, y0: number, y1: number, surfaces: Surface[]): Surface | null {
  const l = x - w * 0.3, r = x + w * 0.3 // le pied, pas toute la largeur du dessin
  let best: Surface | null = null
  for (const s of surfaces) {
    if (s.x1 <= l || s.x0 >= r) continue
    if (s.y < y0 - 0.5 || s.y > y1) continue
    if (!best || s.y < best.y) best = s
  }
  return best
}

export type StepResult =
  | { kind: 'fall' }
  | { kind: 'bounce'; on: Surface; impact: number }
  | { kind: 'land'; on: Surface; impact: number }

/** Un pas de chute libre. `floor` est le bas de l'écran : rien ne passe en dessous. */
export function stepFall(b: Body, dt: number, surfaces: Surface[], viewW: number, floor: Surface): StepResult {
  b.vy = clampV(b.vy + G * dt)
  b.vx = clampV(b.vx)
  b.x += b.vx * dt
  // Les bords de l'écran renvoient l'objet.
  const half = b.w / 2
  if (b.x < half) { b.x = half; b.vx = Math.abs(b.vx) * 0.4 }
  if (b.x > viewW - half) { b.x = viewW - half; b.vx = -Math.abs(b.vx) * 0.4 }
  const y0 = b.y, y1 = b.y + b.vy * dt
  if (b.ignore && y0 > b.ignore.y + 6) b.ignore = undefined
  const ign = b.ignore
  if (b.vy > 0) {
    const pool = ign ? surfaces.filter((s) => s.key !== ign.key) : surfaces
    const hit = landingSurface(b.x, b.w, y0, y1, [...pool, floor])
    if (hit) {
      const impact = b.vy
      b.y = hit.y
      if (impact > BOUNCE_MIN) {
        b.vy = -impact * RESTITUTION
        b.vx *= 0.7
        return { kind: 'bounce', on: hit, impact }
      }
      b.vy = 0
      return { kind: 'land', on: hit, impact }
    }
  }
  b.y = y1
  return { kind: 'fall' }
}

/** Glissade sur une surface : renvoie la nouvelle position et `off` si le pied a quitté le bord. */
export function stepSlide(x: number, vx: number, dt: number, s: Surface): { x: number; vx: number; off: boolean } {
  if (vx === 0) return { x, vx, off: x < s.x0 || x > s.x1 }
  const dec = FRICTION * dt
  const nv = Math.abs(vx) <= dec ? 0 : vx - Math.sign(vx) * dec
  const nx = x + ((vx + nv) / 2) * dt
  return { x: nx, vx: nv, off: nx < s.x0 || nx > s.x1 }
}

/** Position relative (0 à 1) du pied le long d'une surface, pour la retrouver quand la page bouge. */
export const fractionOn = (x: number, s: Surface) => (s.x1 - s.x0 <= 0 ? 0.5 : Math.max(0, Math.min(1, (x - s.x0) / (s.x1 - s.x0))))
export const pointOn = (fx: number, s: Surface) => s.x0 + fx * (s.x1 - s.x0)

/** Vitesse de lancer à partir des derniers points du pointeur (les ~80 dernières ms).
    `now` : l'instant du lâcher. Si le pointeur est resté immobile avant, ce n'est pas un lancer. */
export function throwVelocity(samples: { x: number; y: number; t: number }[], now?: number): { vx: number; vy: number } {
  if (samples.length < 2) return { vx: 0, vy: 0 }
  const last = samples[samples.length - 1]
  if (now !== undefined && now - last.t > 60) return { vx: 0, vy: 0 }
  let first = samples[0]
  for (const s of samples) if (last.t - s.t <= 80) { first = s; break }
  const dt = (last.t - first.t) / 1000
  if (dt <= 0) return { vx: 0, vy: 0 }
  return { vx: clampV((last.x - first.x) / dt), vy: clampV((last.y - first.y) / dt) }
}
