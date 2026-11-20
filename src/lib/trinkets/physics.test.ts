import { describe, expect, it } from 'vitest'
import { fractionOn, landingSurface, pointOn, stepFall, stepSlide, throwVelocity, type Body, type Surface } from './physics'

const S = (key: string, x0: number, x1: number, y: number, fixed = false): Surface => ({ key, x0, x1, y, fixed })
const floor = S('@sol', 0, 1000, 800, true)

function drop(b: Body, surfaces: Surface[], max = 600) {
  for (let i = 0; i < max; i++) {
    const r = stepFall(b, 1 / 60, surfaces, 1000, floor)
    if (r.kind === 'land') return r.on
  }
  return null
}

describe('physique des objets', () => {
  it('tombe sur la plus haute surface sous le pied', () => {
    const b: Body = { x: 100, y: 0, vx: 0, vy: 0, w: 40 }
    const on = drop(b, [S('bas', 0, 300, 500), S('haut', 50, 150, 300)])
    expect(on?.key).toBe('haut')
    expect(b.y).toBe(300)
  })

  it('traverse une surface par en dessous (plateforme à sens unique)', () => {
    const b: Body = { x: 100, y: 400, vx: 0, vy: -1400, w: 40 }
    const on = drop(b, [S('plafond', 0, 300, 300)])
    // monte à travers « plafond », redescend et s'y pose par le haut
    expect(on?.key).toBe('plafond')
  })

  it('ignore une surface qui n’est pas sous le pied', () => {
    expect(landingSurface(500, 40, 0, 900, [S('loin', 0, 100, 300)])).toBeNull()
  })

  it('finit sur le sol de l’écran quand rien ne l’arrête', () => {
    const b: Body = { x: 500, y: 0, vx: 0, vy: 0, w: 40 }
    expect(drop(b, [])?.key).toBe('@sol')
  })

  it('rebondit sur un impact fort puis se pose', () => {
    const b: Body = { x: 100, y: 0, vx: 0, vy: 0, w: 40 }
    const s = [S('table', 0, 300, 700)]
    let bounced = false
    for (let i = 0; i < 600; i++) {
      const r = stepFall(b, 1 / 60, s, 1000, floor)
      if (r.kind === 'bounce') bounced = true
      if (r.kind === 'land') break
    }
    expect(bounced).toBe(true)
    expect(b.y).toBe(700)
  })

  it('les bords de l’écran renvoient l’objet', () => {
    const b: Body = { x: 980, y: 0, vx: 2000, vy: 0, w: 40 }
    stepFall(b, 1 / 60, [], 1000, floor)
    expect(b.x).toBeLessThanOrEqual(980)
    expect(b.vx).toBeLessThan(0)
  })

  it('ne se repose pas sur la surface qu’il vient de quitter par le bord', () => {
    const table = S('table', 0, 100, 300)
    const b: Body = { x: 105, y: 300, vx: 0, vy: 0, w: 40, ignore: { key: 'table', y: 300 } }
    expect(drop(b, [table])?.key).toBe('@sol')
  })

  it('la glissade ralentit et peut faire tomber du bord', () => {
    const s = S('t', 0, 200, 100)
    let st = { x: 100, vx: 300, off: false }
    for (let i = 0; i < 120 && st.vx; i++) st = stepSlide(st.x, st.vx, 1 / 60, s)
    expect(st.vx).toBe(0)
    expect(st.off).toBe(false)
    expect(stepSlide(190, 3000, 1 / 60, s).off).toBe(true)
  })

  it('retrouve la même position relative quand la surface change de taille', () => {
    const a = S('z', 100, 300, 0), b = S('z', 0, 1000, 0)
    expect(pointOn(fractionOn(250, a), b)).toBe(750)
  })

  it('calcule la vitesse de lancer sur les dernières millisecondes', () => {
    const v = throwVelocity([{ x: 0, y: 0, t: 0 }, { x: 0, y: 0, t: 500 }, { x: 50, y: -20, t: 550 }])
    expect(v.vx).toBeCloseTo(1000)
    expect(v.vy).toBeCloseTo(-400)
  })

  it('pas de lancer si le pointeur s’est arrêté avant le lâcher', () => {
    const s = [{ x: 0, y: 0, t: 0 }, { x: 100, y: 0, t: 50 }]
    expect(throwVelocity(s, 60).vx).toBeCloseTo(2000)
    expect(throwVelocity(s, 200)).toEqual({ vx: 0, vy: 0 })
  })
})
