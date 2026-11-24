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
  { slot: 'obj', label: 'Objets', help: 'Choisis leur couleur, prends-en jusqu’à 3 de chaque. Attrape-les pour les poser sur la barre de navigation, une carte, ta pile ou un livre ; touche-les pour les faire réagir. Leur place est retenue sur cet appareil. Les variantes rares se gagnent avec les séries.' },
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
  { id: 'obj-plante', slot: 'obj', name: 'Plante', price: 80, blurb: 'Ses feuilles bougent au moindre courant d’air.' },
  { id: 'obj-bougie', slot: 'obj', name: 'Bougie', price: 80, blurb: 'Pour lire le soir. Touche-la pour l’éteindre.' },
  { id: 'obj-sablier', slot: 'obj', name: 'Sablier', price: 100, blurb: 'Retourne-le, le sable recommence à couler.' },
  { id: 'obj-chat', slot: 'obj', name: 'Chat', price: 150, blurb: 'Il dort où tu le poses. Réveille-le d’une caresse.' },
  { id: 'obj-globe', slot: 'obj', name: 'Globe', price: 150, blurb: 'Fais-le tourner, il finit toujours par s’arrêter.' },

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

/** Applique les couleurs portées (étagères, surligneur) sur toute l'appli.
    `trial` : un article essayé dans la boutique, appliqué à la place de celui de sa catégorie, sans rien enregistrer. */
export function applyCosmetics(eq: Partial<Record<Slot, string>> | undefined, trial?: string | null) {
  const root = document.documentElement
  const t = itemById(trial ?? undefined)
  for (const slot of ['shelf', 'acc'] as Slot[]) {
    const it = t && t.slot === slot && t.vars ? t : equippedItem(eq, slot)
    for (const [k, v] of Object.entries(it.vars ?? {})) root.style.setProperty(k, v)
  }
}
