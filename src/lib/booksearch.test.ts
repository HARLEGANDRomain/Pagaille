import { describe, expect, it } from 'vitest'
import { dedupeEditions, groupVolumes, guessFormat, isbn10to13, isIsbnQuery, mergeHits, tokens, type GBVolume } from './booksearch'
import type { WorkHit } from '../types'

const vol = (title: string, authors: string[], extra: Partial<NonNullable<GBVolume['volumeInfo']>> = {}): GBVolume => ({
  id: title + JSON.stringify(extra),
  volumeInfo: { title, authors, language: 'fr', ...extra },
})

describe('ISBN', () => {
  it('convertit un ISBN-10 en ISBN-13', () => {
    expect(isbn10to13('2070360024')).toBe('9782070360024')
    expect(isbn10to13('0-306-40615-2')).toBe('9780306406157')
  })
  it('reconnaît une recherche par ISBN', () => {
    expect(isIsbnQuery('978-2-07-036002-4')).toBe('9782070360024')
    expect(isIsbnQuery('0306406152')).toBe('9780306406157')
    expect(isIsbnQuery('Dune')).toBeNull()
    expect(isIsbnQuery('7 lettres')).toBeNull()
  })
})

describe('format', () => {
  it('devine le poche d’après la collection ou l’éditeur', () => {
    expect(guessFormat('Le Livre de Poche')).toBe('poche')
    expect(guessFormat('Gallimard Folio')).toBe('poche')
    expect(guessFormat("J'ai lu")).toBe('poche')
    expect(guessFormat('Pocket')).toBe('poche')
    expect(guessFormat('Albin Michel')).toBe('autre')
    expect(guessFormat(null)).toBe('autre')
  })
})

describe('tokens', () => {
  it('gère accents, apostrophes et chiffres', () => {
    expect(tokens('7 lettres d’Olivia Harvard')).toEqual(['7', 'lettres', 'd', 'olivia', 'harvard'])
    expect(tokens('Écrit à l’encre')).toEqual(['ecrit', 'a', 'l', 'encre'])
    expect(tokens('Sept lettres')).toEqual(tokens('7 lettres'))
  })
})

describe('groupVolumes', () => {
  const vols = [
    vol('Horns', ['Joe Hill'], { language: 'en', pageCount: 400, publisher: 'Harper', publishedDate: '2010-02-01' }),
    vol('Cornes', ['Joe Hill'], { pageCount: 480, publisher: 'Le Livre de Poche', publishedDate: '2012-05-01', industryIdentifiers: [{ type: 'ISBN_10', identifier: '2253169226' }] }),
    vol('Cornes', ['Joe Hill'], { pageCount: 0, publisher: 'Fayard', publishedDate: '2010' }),
    vol('Cornes', ['Joe Hill'], { pageCount: 480, publisher: 'Le Livre de Poche', publishedDate: '2012', industryIdentifiers: [{ type: 'ISBN_10', identifier: '2253169226' }] }),
  ]
  const hits = groupVolumes(vols, 'cornes joe hill')
  it('regroupe les éditions d’un même titre et auteur', () => {
    expect(hits).toHaveLength(2)
    const c = hits.find((h) => h.title === 'Cornes')!
    expect(c.editions).toHaveLength(2) // le doublon de poche est fusionné par ISBN
  })
  it('met en avant la bonne édition : française, avec pages, de poche', () => {
    const c = hits[0]
    expect(c.title).toBe('Cornes')
    expect(c.primary?.publisher).toBe('Le Livre de Poche')
    expect(c.primary?.format).toBe('poche')
    expect(c.primary?.pages).toBe(480)
    expect(c.primary?.year).toBe(2012)
    expect(c.primary?.isbn13).toMatch(/^978\d{10}$/)
    expect(c.year).toBe(2010)
  })
  it('classe d’abord ce qui correspond à la requête', () => {
    const r = groupVolumes([vol('Autre chose', ['Quelqu’un'], { pageCount: 100 }), vol('Sept lettres', ['Olivia Harvard'])], '7 lettres d’olivia harvard')
    expect(r[0].title).toBe('Sept lettres')
  })
  it('ignore les volumes sans titre', () => {
    expect(groupVolumes([{ id: 'x', volumeInfo: {} }], 'x')).toEqual([])
  })
})

describe('dedupeEditions / mergeHits', () => {
  it('fusionne par ISBN', () => {
    const e = { olEditionId: null, title: null, publisher: 'A', format: 'autre' as const, pages: 1, isbn13: '9782070360024', coverUrl: null, language: null, year: 2000 }
    expect(dedupeEditions([e, { ...e, publisher: 'B' }])).toHaveLength(1)
  })
  it('rattache l’identifiant Open Library au résultat Google correspondant', () => {
    const g: WorkHit[] = groupVolumes([vol('Dune', ['Frank Herbert'], { pageCount: 700 })], 'dune')
    const o: WorkHit[] = [
      { olWorkId: 'OL1W', title: 'Dune', author: 'Frank Herbert', year: 1965, genre: 'SF', pages: null, coverUrl: null, editionCount: 90 },
      { olWorkId: 'OL2W', title: 'Dune Messiah', author: 'Frank Herbert', year: 1969, genre: 'SF', pages: null, coverUrl: null, editionCount: 20 },
    ]
    const m = mergeHits(g, o, 'dune')
    expect(m[0].olWorkId).toBe('OL1W')
    expect(m[0].editionCount).toBe(90)
    expect(m.map((h) => h.title)).toContain('Dune Messiah')
    expect(m).toHaveLength(2)
  })
})
