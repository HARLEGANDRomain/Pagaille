/* Exemplaires et variantes des objets.
   - Une FORME différente est un nouvel article de la boutique ; une COULEUR ou un MOTIF est une variante.
   - Acheter un objet donne un exemplaire et les variantes de base. La variante rare se débloque avec un palier
     de série (une fois débloquée, elle reste, même si la série casse).
   - Jusqu'à MAX_COPIES exemplaires par objet, chacun avec sa variante.
   Identifiant d'exemplaire : l'id de l'article pour le premier (« obj-chat », compatible avec les places déjà
   retenues), puis « obj-chat#2 », « obj-chat#3 ». La base reprend les mêmes règles (fonctions buy_item, set_variant,
   trinket_variant_weeks) : les deux listes doivent rester identiques. */

export const MAX_COPIES = 3
/** Objets sortis en même temps, par appareil. */
export const MAX_OUT = { desk: 6, phone: 4 }
export const maxOut = () => (typeof matchMedia !== 'undefined' && matchMedia('(max-width:860px)').matches ? MAX_OUT.phone : MAX_OUT.desk)

export const itemOf = (copy: string) => copy.split('#')[0]
export const copyNo = (copy: string) => Number(copy.split('#')[1] ?? 1)
export const copyId = (item: string, n: number) => (n <= 1 ? item : `${item}#${n}`)

export interface Variant {
  id: string
  name: string
  /** Semaines de série nécessaires (0 : variante de base). */
  weeks: number
  /** Couleur de la pastille dans la boutique. */
  swatch: string
  /** Couleurs du dessin, propres à chaque objet. */
  c: Record<string, string>
}

export const VARIANTS: Record<string, Variant[]> = {
  'obj-chat': [
    { id: 'noir', name: 'Noir', weeks: 0, swatch: '#2A2D3A', c: { fur: '#2A2D3A', ear: '#2A2D3A', tail: '#2A2D3A', lid: '#E8D9A8', eye: '#E8D9A8', nose: '#C98B8B' } },
    { id: 'roux', name: 'Roux', weeks: 0, swatch: '#D9813A', c: { fur: '#D9813A', ear: '#C46E2A', tail: '#C46E2A', lid: '#6E3410', eye: '#8DB84A', nose: '#B5524A' } },
    { id: 'gris', name: 'Gris tigré', weeks: 0, swatch: '#8E93A3', c: { fur: '#8E93A3', ear: '#6F7486', tail: '#6F7486', lid: '#2A2D3A', eye: '#E0B84A', nose: '#C98B8B', stripe: '#5E6375' } },
    { id: 'siamois', name: 'Siamois', weeks: 26, swatch: '#EDE3D0', c: { fur: '#EDE3D0', ear: '#4A3A33', tail: '#4A3A33', lid: '#4A3A33', eye: '#5FA8E0', nose: '#8E5A50', mask: '#6B544A' } },
  ],
  'obj-bougie': [
    { id: 'creme', name: 'Crème', weeks: 0, swatch: '#F1EBDD', c: { wax: '#F1EBDD', drip: '#D9CFB8', flame: '#FFDD3C', edge: '#C9772B', core: '#FFF6C8', halo: '#FFDD3C' } },
    { id: 'rouge', name: 'Rouge', weeks: 0, swatch: '#B8413A', c: { wax: '#B8413A', drip: '#94302A', flame: '#FFDD3C', edge: '#C9772B', core: '#FFF6C8', halo: '#FFDD3C' } },
    { id: 'sauge', name: 'Sauge', weeks: 0, swatch: '#9DB59A', c: { wax: '#9DB59A', drip: '#7F9A7C', flame: '#FFDD3C', edge: '#C9772B', core: '#FFF6C8', halo: '#FFDD3C' } },
    { id: 'bleue', name: 'Flamme bleue', weeks: 2, swatch: '#8FD3FF', c: { wax: '#24326B', drip: '#141D45', flame: '#8FD3FF', edge: '#3A6FB0', core: '#E8F7FF', halo: '#8FD3FF' } },
  ],
  'obj-sablier': [
    { id: 'dore', name: 'Sable doré', weeks: 0, swatch: '#E0B84A', c: { sand: '#E0B84A', wood: '#6B4428' } },
    { id: 'bleu', name: 'Sable bleu', weeks: 0, swatch: '#7FA7E0', c: { sand: '#7FA7E0', wood: '#6B4428' } },
    { id: 'noir', name: 'Bois noir', weeks: 0, swatch: '#22232B', c: { sand: '#E0B84A', wood: '#22232B' } },
    { id: 'aube', name: 'Sable d’aube', weeks: 4, swatch: '#F2A3B5', c: { sand: '#F2A3B5', wood: '#E2CFA6' } },
  ],
  'obj-plante': [
    { id: 'terre', name: 'Terre cuite', weeks: 0, swatch: '#C9772B', c: { pot: '#C9772B', rim: '#B5651F', leaf: '#2F6B5E', leaf2: '#1F4D45' } },
    { id: 'bleu', name: 'Pot bleu', weeks: 0, swatch: '#3D5A9E', c: { pot: '#3D5A9E', rim: '#2E4680', leaf: '#2F6B5E', leaf2: '#1F4D45' } },
    { id: 'blanc', name: 'Pot blanc', weeks: 0, swatch: '#E9E4DA', c: { pot: '#E9E4DA', rim: '#CFC8BA', leaf: '#2F6B5E', leaf2: '#1F4D45' } },
    { id: 'automne', name: 'Automne', weeks: 8, swatch: '#D2691E', c: { pot: '#6B4428', rim: '#4A2E1A', leaf: '#E0913A', leaf2: '#B5482A' } },
  ],
  'obj-globe': [
    { id: 'classique', name: 'Classique', weeks: 0, swatch: '#5E7F8C', c: { sea: '#5E7F8C', land: '#2F6B5E' } },
    { id: 'ancien', name: 'Ancien', weeks: 0, swatch: '#D9C7A0', c: { sea: '#D9C7A0', land: '#9C7A4A' } },
    { id: 'nuit', name: 'Nuit', weeks: 0, swatch: '#24326B', c: { sea: '#24326B', land: '#4E6BB0' } },
    { id: 'or', name: 'Or', weeks: 12, swatch: '#E0B84A', c: { sea: '#2A2D3A', land: '#E0B84A' } },
  ],
}

/** La variante d'un objet, ou celle d'origine si l'id est inconnu. */
export function variantOf(item: string, id: string | undefined): Variant | undefined {
  const l = VARIANTS[item]
  if (!l) return undefined
  return l.find((v) => v.id === id) ?? l[0]
}

/** Plus long palier de série déjà atteint, d'après les clés du registre (« streak:<lundi>:<semaines> »). */
export function bestStreakReward(keys: Iterable<string>): number {
  let best = 0
  for (const k of keys) {
    if (!k.startsWith('streak:')) continue
    const n = Number(k.split(':')[2])
    if (Number.isFinite(n) && n > best) best = n
  }
  return best
}

export const unlocked = (v: Variant, best: number) => v.weeks <= best

/** Les exemplaires possédés d'un objet, dans l'ordre (premier, #2, #3). */
export function copiesOf(item: string, owned: Set<string>): string[] {
  const out: string[] = []
  for (let n = 1; n <= MAX_COPIES; n++) if (owned.has(copyId(item, n))) out.push(copyId(item, n))
  return out
}
