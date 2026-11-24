import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { bestStreakReward, copiesOf, copyId, copyNo, itemOf, unlocked, VARIANTS, variantOf } from './variants'
import { ITEMS } from '../cosmetics'
import { TRINKETS } from '../../components/Trinket'

describe('exemplaires', () => {
  it('le premier garde l’id de l’article, les suivants sont numérotés', () => {
    expect(copyId('obj-chat', 1)).toBe('obj-chat')
    expect(copyId('obj-chat', 3)).toBe('obj-chat#3')
    expect(itemOf('obj-chat#2')).toBe('obj-chat')
    expect(copyNo('obj-chat')).toBe(1)
    expect(copyNo('obj-chat#3')).toBe(3)
  })
  it('liste les exemplaires possédés dans l’ordre', () => {
    const owned = new Set(['obj-chat#3', 'obj-chat', 'obj-globe', 'acc-corail'])
    expect(copiesOf('obj-chat', owned)).toEqual(['obj-chat', 'obj-chat#3'])
    expect(copiesOf('obj-bougie', owned)).toEqual([])
  })
})

describe('variantes', () => {
  it('chaque objet a 3 variantes de base et une rare', () => {
    for (const it of ITEMS.filter((i) => i.slot === 'obj' && i.id !== 'obj-rien')) {
      const l = VARIANTS[it.id]
      expect(l, it.id).toBeDefined()
      expect(TRINKETS[it.id], it.id).toBeDefined()
      expect(l.filter((v) => v.weeks === 0)).toHaveLength(3)
      expect(l.filter((v) => v.weeks > 0)).toHaveLength(1)
      expect(l[0].weeks).toBe(0) // la variante d'origine vient en premier
    }
  })
  it('id inconnu : la variante d’origine', () => {
    expect(variantOf('obj-chat', undefined)?.id).toBe('noir')
    expect(variantOf('obj-chat', 'licorne')?.id).toBe('noir')
  })
  it('palier de série le plus long, d’après le registre', () => {
    expect(bestStreakReward(['ritual:2026-11-20', 'streak:2026-09-01:4', 'streak:2026-09-01:12', 'streak:2026-01-05:2'])).toBe(12)
    expect(bestStreakReward(['seed', 'streak:x:abc'])).toBe(0)
    const chat = VARIANTS['obj-chat'].find((v) => v.weeks > 0)!
    expect(unlocked(chat, 12)).toBe(false)
    expect(unlocked(chat, 26)).toBe(true)
  })
  it('la base connaît exactement les mêmes variantes (migration du 24/11)', () => {
    const sql = readFileSync(new URL('../../../supabase/migrations/20261124_trinket_copies_variants.sql', import.meta.url), 'utf8')
    const inBase = new Map([...sql.matchAll(/when '(obj-[a-z]+):([a-z]+)' then (\d+)/g)].map((m) => [`${m[1]}:${m[2]}`, Number(m[3])]))
    const inCode = new Map(Object.entries(VARIANTS).flatMap(([item, l]) => l.map((v) => [`${item}:${v.id}`, v.weeks] as [string, number])))
    expect(inBase).toEqual(inCode)
  })
})
