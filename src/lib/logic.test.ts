import { describe, expect, it } from 'vitest'
import {
  applyPage, badges, escapeLike, hash, iso, monday, nextMark, noteUnlocked, norm, pct, pileCm, reached,
  spineColors, weekDates, weekId, weekMissions, weekStats, weeksRow,
} from './logic'

const d = (s: string) => new Date(s + 'T12:00:00')

describe('semaine', () => {
  it('commence le lundi, y compris un dimanche', () => {
    expect(weekId(d('2026-11-18'))).toBe('2026-11-16') // mercredi
    expect(weekId(d('2026-11-22'))).toBe('2026-11-16') // dimanche
    expect(weekId(d('2026-11-16'))).toBe('2026-11-16') // lundi
  })
  it('donne sept jours consécutifs', () => {
    const w = weekDates(d('2026-11-18'))
    expect(w).toHaveLength(7)
    expect(w[0]).toBe('2026-11-16')
    expect(w[6]).toBe('2026-11-22')
  })
  it('traverse un changement d’heure sans sauter de jour', () => {
    // fin octobre 2026 : passage à l'heure d'hiver le dimanche 25
    expect(weekDates(d('2026-10-28'))).toEqual([
      '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01',
    ])
    expect(iso(monday(d('2026-10-25')))).toBe('2026-10-19')
  })
})

describe('série en semaines', () => {
  const week = (start: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({ day: iso(new Date(d(start).getTime() + i * 864e5)) }))
  it('vaut 0 sans lecture', () => expect(weeksRow([], 4, d('2026-11-18'))).toBe(0))
  it('compte les semaines tenues d’affilée', () => {
    const s = [...week('2026-11-02', 4), ...week('2026-11-09', 4)]
    expect(weeksRow(s, 4, d('2026-11-18'))).toBe(2) // semaine en cours pas encore tenue : elle ne casse rien
  })
  it('ajoute la semaine en cours dès qu’elle est tenue', () => {
    const s = [...week('2026-11-09', 4), ...week('2026-11-16', 4)]
    expect(weeksRow(s, 4, d('2026-11-19'))).toBe(2)
  })
  it('s’arrête à la première semaine manquée', () => {
    const s = [...week('2026-10-26', 4), ...week('2026-11-09', 4)] // semaine du 2 nov vide
    expect(weeksRow(s, 4, d('2026-11-18'))).toBe(1)
  })
  it('ignore les jours en double dans une même semaine', () => {
    const s = [{ day: '2026-11-09' }, { day: '2026-11-09' }, { day: '2026-11-10' }, { day: '2026-11-10' }]
    expect(weeksRow(s, 4, d('2026-11-18'))).toBe(0)
  })
})

describe('missions', () => {
  it('donne trois missions distinctes, stables toute la semaine', () => {
    const a = weekMissions(d('2026-11-16')).map((m) => m.id)
    const b = weekMissions(d('2026-11-22')).map((m) => m.id)
    expect(new Set(a).size).toBe(3)
    expect(a).toEqual(b)
  })
  it('change d’une semaine à l’autre', () => {
    const a = weekMissions(d('2026-11-16')).map((m) => m.id).join()
    const b = weekMissions(d('2026-11-23')).map((m) => m.id).join()
    expect(a).not.toBe(b)
  })
  it('calcule les valeurs de la semaine courante seulement', () => {
    const st = weekStats(
      {
        sessions: [
          { day: '2026-11-17', minutes: 20, pages_read: 15, circle_id: null },
          { day: '2026-11-18', minutes: 30, pages_read: 25, circle_id: 'c1' },
          { day: '2026-11-10', minutes: 99, pages_read: 99, circle_id: 'c1' }, // semaine précédente
        ],
        books: [
          { added_at: '2026-11-17T10:00:00', closed_at: null, status: 'lire' },
          { added_at: '2026-11-17T10:00:00', closed_at: '2026-11-18T09:00:00', status: 'fini' },
          { added_at: '2026-10-01T10:00:00', closed_at: '2026-11-02T09:00:00', status: 'abandon' },
        ],
        noteDates: ['2026-11-18', '2026-11-01'],
      },
      d('2026-11-18'),
    )
    expect(st.days).toBe(2)
    expect(st.min).toBe(50)
    expect(st.pages).toBe(40)
    expect(st.team).toBe(1)
    expect(st.add).toBe(1) // seul le livre « à lire » ajouté cette semaine
    expect(st.close).toBe(1)
    expect(st.note).toBe(1)
  })
})

describe('pile', () => {
  it('additionne les pages lues, y compris dans les livres abandonnés', () => {
    expect(pileCm([{ page: 100 }, { page: 20 }])).toBeCloseTo(0.78, 5)
  })
  it('trouve le repère atteint et le suivant', () => {
    expect(reached(1)).toBeUndefined()
    expect(reached(9.5)?.[1]).toBe('une tasse à café')
    expect(nextMark(9.5)?.[1]).toBe('une bouteille de vin')
    expect(nextMark(500)).toBeUndefined()
  })
})

describe('progression et pages', () => {
  it('prend le total saisi avant celui de l’édition', () => {
    expect(pct({ page: 50, total_pages: 200, edition: { pages: 400 } as never })).toBe(25)
    expect(pct({ page: 50, total_pages: null, edition: { pages: 400 } as never })).toBe(13)
    expect(pct({ page: 50, total_pages: null, edition: null })).toBe(0)
  })
  it('borne la page au total et ne retire jamais de pages gagnées', () => {
    expect(applyPage(10, 40, 200)).toEqual({ page: 40, gained: 30 })
    expect(applyPage(10, 999, 200)).toEqual({ page: 200, gained: 190 })
    expect(applyPage(50, 20, 200)).toEqual({ page: 50, gained: 0 })
    expect(applyPage(10, null, 200)).toEqual({ page: 10, gained: 0 })
    expect(applyPage(10, 30, 0)).toEqual({ page: 30, gained: 20 }) // total inconnu
  })
})

describe('notes de lecture commune', () => {
  it('suit la règle de la base : ratio + 2 points, ou livre fini', () => {
    expect(noteUnlocked(0.3, false, 0.3)).toBe(false)
    expect(noteUnlocked(0.31, false, 0.3)).toBe(false)
    expect(noteUnlocked(0.32, false, 0.3)).toBe(true)
    expect(noteUnlocked(0.1, true, 0.9)).toBe(true)
  })
})

describe('divers', () => {
  it('normalise les titres pour la comparaison', () => {
    expect(norm('L’Étranger')).toBe(norm('letranger'))
    expect(norm('Dune !')).toBe('dune')
  })
  it('donne toujours la même couleur à un titre', () => {
    expect(spineColors('Dune')).toEqual(spineColors('Dune'))
    expect(hash('Dune')).toBe(hash('Dune'))
  })
  it('échappe les jokers SQL', () => {
    expect(escapeLike('100% vrai_ \\')).toBe('100\\% vrai\\_ \\\\')
  })
  it('débloque les badges selon les données', () => {
    const b = badges(
      [{ status: 'abandon' }, { status: 'fini' }, { status: 'fini' }, { status: 'fini' }],
      [{ pages_read: 60, circle_id: null }, { pages_read: 50, circle_id: 'c' }],
      1,
    )
    expect(b.every((x) => x.got)).toBe(true)
    expect(badges([], [], 0).some((x) => x.got)).toBe(false)
  })
})
