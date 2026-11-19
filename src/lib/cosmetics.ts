/* La boutique : ce qu'on peut acheter avec ses signets. Les PRIX FONT FOI CÔTÉ BASE (fonction shop_price) :
   ceux d'ici ne servent qu'à l'affichage et doivent rester identiques. Chaque catégorie a un article gratuit, porté par défaut. */

export type Slot = 'shelf' | 'obj' | 'scene' | 'acc'

export interface Item {
  id: string
  slot: Slot
  name: string
  price: number
  blurb: string
  /** Variables CSS appliquées à toute l'appli (étagères et couleur d'accent). */
  vars?: Record<string, string>
}

export const SLOTS: { slot: Slot; label: string; help: string }[] = [
  { slot: 'shelf', label: 'Bois des étagères', help: 'La couleur des planches de ta bibliothèque.' },
  { slot: 'obj', label: 'Objet sur l’étagère', help: 'Posé au bout de l’étagère « En cours ».' },
  { slot: 'scene', label: 'Ambiance de lecture', help: 'Le décor animé pendant le chrono.' },
  { slot: 'acc', label: 'Surligneur', help: 'La couleur d’accent de l’appli : boutons, rubans, jours lus.' },
]

export const ITEMS: Item[] = [
  { id: 'shelf-chene', slot: 'shelf', name: 'Chêne', price: 0, blurb: 'Le bois d’origine.', vars: { '--plank': '#B98A55', '--plank-edge': '#8E6638' } },
  { id: 'shelf-noyer', slot: 'shelf', name: 'Noyer', price: 120, blurb: 'Brun profond, presque chocolat.', vars: { '--plank': '#6B4428', '--plank-edge': '#4A2E1A' } },
  { id: 'shelf-bouleau', slot: 'shelf', name: 'Bouleau', price: 120, blurb: 'Clair, scandinave.', vars: { '--plank': '#E2CFA6', '--plank-edge': '#BFA675' } },
  { id: 'shelf-noir', slot: 'shelf', name: 'Laqué noir', price: 200, blurb: 'Les tranches ressortent comme en vitrine.', vars: { '--plank': '#22232B', '--plank-edge': '#0E0F14' } },
  { id: 'shelf-nuit', slot: 'shelf', name: 'Bleu nuit', price: 200, blurb: 'Accordé à l’encre de l’appli.', vars: { '--plank': '#24326B', '--plank-edge': '#141D45' } },

  { id: 'obj-rien', slot: 'obj', name: 'Rien', price: 0, blurb: 'L’étagère nue.' },
  { id: 'obj-plante', slot: 'obj', name: 'Plante', price: 80, blurb: 'Elle pousse pendant que tu lis.' },
  { id: 'obj-bougie', slot: 'obj', name: 'Bougie', price: 80, blurb: 'Pour lire le soir.' },
  { id: 'obj-sablier', slot: 'obj', name: 'Sablier', price: 100, blurb: 'Dix minutes, pas plus. Ou un peu plus.' },
  { id: 'obj-chat', slot: 'obj', name: 'Chat', price: 150, blurb: 'Il dort sur ta pile à lire.' },
  { id: 'obj-globe', slot: 'obj', name: 'Globe', price: 150, blurb: 'Tous les pays de tes livres.' },

  { id: 'scene-pluie', slot: 'scene', name: 'Pluie', price: 0, blurb: 'La pluie à la fenêtre, l’ambiance d’origine.' },
  { id: 'scene-etoiles', slot: 'scene', name: 'Nuit étoilée', price: 150, blurb: 'Un ciel calme qui scintille.' },
  { id: 'scene-neige', slot: 'scene', name: 'Neige', price: 150, blurb: 'Des flocons lents.' },
  { id: 'scene-braises', slot: 'scene', name: 'Coin du feu', price: 200, blurb: 'Des braises qui montent doucement.' },

  { id: 'acc-jaune', slot: 'acc', name: 'Jaune', price: 0, blurb: 'Le surligneur d’origine.', vars: { '--mark': '#FFDD3C', '--mark-ink': '#161D3A' } },
  { id: 'acc-corail', slot: 'acc', name: 'Corail', price: 100, blurb: 'Chaud, sans crier.', vars: { '--mark': '#FF9E80', '--mark-ink': '#161D3A' } },
  { id: 'acc-menthe', slot: 'acc', name: 'Menthe', price: 100, blurb: 'Frais et doux.', vars: { '--mark': '#7FE0B8', '--mark-ink': '#161D3A' } },
  { id: 'acc-lilas', slot: 'acc', name: 'Lilas', price: 100, blurb: 'Pour les lectures du soir.', vars: { '--mark': '#C7B5FF', '--mark-ink': '#161D3A' } },
]

export const DEFAULTS: Record<Slot, string> = { shelf: 'shelf-chene', obj: 'obj-rien', scene: 'scene-pluie', acc: 'acc-jaune' }
export const itemById = (id: string | undefined) => ITEMS.find((i) => i.id === id)
export const equippedItem = (eq: Partial<Record<Slot, string>> | undefined, slot: Slot) => itemById(eq?.[slot]) ?? itemById(DEFAULTS[slot])!

/** Applique les couleurs portées (étagères, surligneur) sur toute l'appli. */
export function applyCosmetics(eq: Partial<Record<Slot, string>> | undefined) {
  const root = document.documentElement
  for (const slot of ['shelf', 'acc'] as Slot[]) {
    for (const [k, v] of Object.entries(equippedItem(eq, slot).vars ?? {})) root.style.setProperty(k, v)
  }
}

/** Dessins des objets (SVG en ligne, couleur de l'encre). */
export const OBJ_SVG: Record<string, string> = {
  'obj-plante': '<svg viewBox="0 0 60 84" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 60h24l-3 22H21z" fill="#C9772B" stroke="none"/><path d="M30 60V34"/><path d="M30 44c-10-2-15-9-15-18 9 0 15 7 15 18zM30 38c9-3 14-11 13-20-9 2-14 10-13 20z" fill="#1F4D45" stroke="none"/><path d="M30 52c-7 0-12-5-13-11 7 0 12 4 13 11z" fill="#2F6B5E" stroke="none"/></svg>',
  'obj-bougie': '<svg viewBox="0 0 40 84"><rect x="12" y="44" width="16" height="38" rx="2" fill="#F1EBDD" stroke="#161D3A" stroke-width="1.5"/><path d="M20 44v-6" stroke="#161D3A" stroke-width="1.5"/><path d="M20 22c5 6 6 10 0 16-6-6-5-10 0-16z" fill="#FFDD3C" stroke="#C9772B" stroke-width="1.2"><animate attributeName="d" dur="1.6s" repeatCount="indefinite" values="M20 22c5 6 6 10 0 16-6-6-5-10 0-16z;M20 21c6 7 5 11 0 17-5-6-6-10 0-17z;M20 22c5 6 6 10 0 16-6-6-5-10 0-16z"/></path></svg>',
  'obj-sablier': '<svg viewBox="0 0 44 84" fill="none" stroke="#161D3A" stroke-width="1.8"><path d="M8 30h28M8 82h28" stroke-width="3"/><path d="M12 32c0 14 20 16 20 24s-20 10-20 24M32 32c0 14-20 16-20 24s20 10 20 24"/><path d="M15 76c4-6 10-6 14 0z" fill="#E0B84A" stroke="none"/><path d="M17 40c3 5 7 5 10 0z" fill="#E0B84A" stroke="none"/></svg>',
  'obj-chat': '<svg viewBox="0 0 84 60"><path d="M8 58c0-18 12-28 32-28s34 10 34 28z" fill="#2A2D3A"/><circle cx="62" cy="30" r="13" fill="#2A2D3A"/><path d="M52 22l3-12 7 9M64 19l8-9 1 13" fill="#2A2D3A"/><path d="M57 31q3 2 5 0M65 31q3 2 5 0" stroke="#E8D9A8" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M8 56c-6-2-6-10 2-12" stroke="#2A2D3A" stroke-width="5" fill="none" stroke-linecap="round"/></svg>',
  'obj-globe': '<svg viewBox="0 0 60 84" fill="none" stroke="#161D3A" stroke-width="1.6"><circle cx="30" cy="34" r="20" fill="#5E7F8C"/><path d="M18 26c6 2 8 8 4 12s2 10 8 8M36 18c-2 6 4 8 8 8M40 44c-4-2-8 2-6 6" stroke="#1F4D45" stroke-width="3" stroke-linecap="round"/><path d="M8 34a22 22 0 0 0 44 0"/><path d="M30 56v14M18 82h24M30 70l-8 12M30 70l8 12" stroke-width="2.2"/></svg>',
}
