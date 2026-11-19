import { describe, expect, it } from 'vitest'
import { isDiscoverable, bestSynopsis, cleanSynopsis, dedupeEditions, groupVolumes, guessFormat, isbn10to13, isIsbnQuery, mergeHits, relevance, tokenMatches, tokens, validEan13, type GBVolume } from './booksearch'
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

/* Les six livres de Romain qui ne remontaient pas (novembre 2026) : notices de la BnF, fautes de frappe comprises. */
describe('recherche tolérante', () => {
  const bnf = (title: string, author: string, isbn: string, pages?: number, format?: 'poche' | 'broche', publisher = 'X'): GBVolume => ({
    id: 'bnf-' + isbn,
    volumeInfo: { title, authors: author ? [author] : [], publisher, pageCount: pages, industryIdentifiers: [{ type: 'ISBN_13', identifier: isbn }], language: 'fr', source: 'bnf', format },
  })
  it('tolère une faute ou un mot incomplet', () => {
    expect(relevance('stephan king', 'Après', 'Stephen King')).toBe(1)
    expect(relevance('corne joe hill', 'Cornes', 'Joe Hill')).toBe(1)
    expect(relevance('albert camu', 'L’Étranger', 'Albert Camus')).toBe(1)
    expect(relevance('dune', 'Le Hobbit', 'Tolkien')).toBe(0)
    expect(tokenMatches('ca', ['cas'])).toBe(false) // pas de tolérance sur les mots très courts
  })
  it('« Après stephan king » trouve Après de Stephen King devant les adaptations', () => {
    const r = groupVolumes([
      bnf('La tour sombre', '', '9782302000001'),
      bnf('Ôter les masques : d’après "Shining" de Stephen King', 'Éric Pessan', '9782350183251', 152),
      bnf('Après', 'Stephen King', '9782226459763', 329),
    ], 'Après stephan king')
    expect(r[0].title).toBe('Après')
  })
  it('« L’étranger albert camu » préfère le roman aux études sur le roman', () => {
    const r = groupVolumes([
      bnf('Albert Camus et "l’Étranger"', 'Pierre-Georges Castex', '9782714301401'),
      bnf('L’absurde', 'Albert Camus', '9782070454600', 245),
      bnf('L’étranger', 'Albert Camus', '9782070360024', 186, 'poche', 'Gallimard'),
    ], "L'étranger albert camu")
    expect(r[0].title).toBe('L’étranger')
  })
  it('regroupe les éditions BnF de « Cornes » et met le poche en avant', () => {
    const r = groupVolumes([
      bnf('Cornes', 'Joe Hill', '9782709629058', 414, 'broche', 'J.-C. Lattès'),
      bnf('Cornes', 'Joe Hill', '9782290054345', 510, 'poche', "J'ai lu"),
      bnf('Christian anarchist', 'William Marling', '9781479810079'),
    ], 'Corne joe hill')
    expect(r).toHaveLength(1)
    expect(r[0].editions).toHaveLength(2)
    expect(r[0].primary?.format).toBe('poche')
    expect(r[0].coverUrl).toContain('covers.openlibrary.org/b/isbn/')
  })
  it('« 7 lettres olivia harvard » et « Sept lettres » désignent le même livre', () => {
    const v = [bnf('7 lettres', 'Olivia Harvard', '9782017134282', 397, 'poche')]
    expect(groupVolumes(v, '7 lettres olivia harvard')[0].title).toBe('7 lettres')
    expect(groupVolumes(v, 'sept lettres')[0].title).toBe('7 lettres')
  })
  it('« ça stephan king » garde le titre français Ça', () => {
    const r = groupVolumes([
      bnf('It', 'Stephen King', '9781444707861', 1184, 'broche'),
      bnf('Ça', 'Stephen King', '9782253151340', 799, 'poche', 'Le Livre de poche'),
    ].map((v, i) => (i === 0 ? { ...v, volumeInfo: { ...v.volumeInfo, language: 'en' } } : v)), 'ça stephan king')
    expect(r[0].title).toBe('Ça')
  })
  it('contrôle la clé d’un code-barres EAN-13', () => {
    expect(validEan13('9782070360024')).toBe(true)
    expect(validEan13('9782070360025')).toBe(false)
  })
})

describe('résumés', () => {
  it('nettoie le HTML et rejette les textes trop courts', () => {
    expect(cleanSynopsis('<p>Un homme <b>seul</b> face à la mer &amp; au temps, pendant vingt jours.</p><p>Suite.</p>')).toBe('Un homme seul face à la mer & au temps, pendant vingt jours.\nSuite.')
    expect(cleanSynopsis('Trop court')).toBeNull()
    expect(cleanSynopsis(null)).toBeNull()
  })
  it('coupe un long résumé à la fin d’une phrase', () => {
    const long = 'Une phrase assez longue pour compter. '.repeat(80)
    const r = cleanSynopsis(long, 500)!
    expect(r.length).toBeLessThanOrEqual(500)
    expect(r.endsWith('.')).toBe(true)
  })
  it('préfère un résumé français, puis le plus complet', () => {
    const en = 'An English blurb that is quite a bit longer than the French one, with many more words in it overall.'
    const fr = 'Un résumé français plus court mais dans la bonne langue pour le lecteur.'
    expect(bestSynopsis([{ text: en, fr: false }, { text: fr, fr: true }])).toBe(fr)
    expect(bestSynopsis([{ text: 'court', fr: true }])).toBeNull()
  })
  it('groupVolumes remonte le résumé de l’édition française', () => {
    const vols: GBVolume[] = [
      { id: 'a', volumeInfo: { title: 'Cornes', authors: ['Joe Hill'], language: 'en', description: 'A man wakes up with horns growing from his forehead and everyone confesses to him.' } },
      { id: 'b', volumeInfo: { title: 'Cornes', authors: ['Joe Hill'], language: 'fr', publisher: "J'ai lu", pageCount: 510, description: '<p>Ig Perrish se réveille avec des cornes : chacun lui avoue ses secrets.</p>' } },
    ]
    const hits = groupVolumes(vols, 'cornes joe hill')
    expect(hits[0].description).toBe('Ig Perrish se réveille avec des cornes : chacun lui avoue ses secrets.')
  })
})

describe('sélection de découverte', () => {
  const base = { olWorkId: null, year: null, genre: 'Roman', pages: 200, coverUrl: 'https://x/c.jpg', editionCount: 1, primary: { language: 'fre' } } as unknown as Parameters<typeof isDiscoverable>[0]
  it('écarte les résultats sans auteur et les revues', () => {
    expect(isDiscoverable({ ...base, title: 'Revue bourguignonne de l’enseignement supérieur', author: '' })).toBe(false)
    expect(isDiscoverable({ ...base, title: 'Bulletin de la société', author: 'Jean Dupont' })).toBe(false)
    expect(isDiscoverable({ ...base, title: 'Matin brun', author: '' })).toBe(false)
  })
  it('garde un vrai livre', () => {
    expect(isDiscoverable({ ...base, title: 'Matin brun', author: 'Franck Pavloff' })).toBe(true)
    expect(isDiscoverable({ ...base, title: 'La Revue des mondes inconnus', author: 'A. Auteur' })).toBe(false) // « revue » en mot entier : écarté par prudence
  })
})
