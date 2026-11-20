import { useRef, useState } from 'react'
import { explain } from '../lib/supabase'
import { equippedItem, ITEMS, SLOTS, type Item } from '../lib/cosmetics'
import { ScenePreview } from '../components/Scene'
import { Trinket, type TrinketHandle } from '../components/Trinket'
import { desk, useDesk } from '../lib/trinkets/desk'
import { useToast } from '../lib/ui'
import { useStore } from '../lib/store'

/* La boutique de signets. Rien ne s'achète avec de l'argent : les signets se gagnent en lisant
   (rituel du jour, missions, livres terminés ou abandonnés). Le serveur vérifie le prix et le solde. */

function Preview({ it }: { it: Item }) {
  if (it.slot === 'shelf') return <div className="swatch-shelf" style={{ ['--plank' as string]: it.vars!['--plank'], ['--plank-edge' as string]: it.vars!['--plank-edge'] }}><i /><i /><i /><i /></div>
  if (it.slot === 'acc') return <div className="swatch-acc" style={{ ['--m' as string]: it.vars!['--mark'] }}><span>Surligné</span></div>
  if (it.slot === 'scene') return <ScenePreview kind={it.id} />
  return <ObjPreview id={it.id} />
}

/** Aperçu vivant d'un objet : on peut déjà le toucher pour voir sa réaction avant de l'acheter. */
function ObjPreview({ id }: { id: string }) {
  const t = useRef<TrinketHandle>(null)
  return (
    <button type="button" className="swatch-obj" onClick={() => t.current?.poke()} aria-label="Essayer l’objet" title="Touche-le">
      <Trinket id={id} h={70} ref={t} />
    </button>
  )
}

/* Les objets ne se « portent » pas : on en sort autant qu'on veut. Qui est sorti et où il est posé
   est retenu sur l'appareil (lib/trinkets/desk.ts) ; seul l'achat passe par la base. */

export default function Shop() {
  const st = useStore()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const d = useDesk()
  const isOut = (it: Item) => d.out.includes(it.id)

  const has = (it: Item) => it.price === 0 || st.owned.has(it.id)
  const worn = (it: Item) => equippedItem(st.profile.equipped, it.slot).id === it.id

  async function act(it: Item) {
    setBusy(it.id)
    try {
      if (!has(it)) {
        await st.buy(it.id)
        toast(`« ${it.name} » acheté, ${it.price} signets.`)
      }
      if (it.slot === 'obj') { desk.setOut(it.id, true); return } // il tombe sur la barre de navigation
      await st.equip(it.id)
      if (has(it)) toast(`« ${it.name} » utilisé.`)
    } catch (e) { toast(explain(e)) } finally { setBusy(null); setConfirm(null) }
  }

  return (
    <>
      <div className="head">
        <div>
          <h1>Boutique</h1>
          <p className="muted" style={{ marginTop: 8, maxWidth: '62ch' }}>Tes signets se gagnent en lisant : rituel du jour, missions de la semaine, livres terminés ou abandonnés. Ils ne s’achètent pas.</p>
        </div>
        <div className="wallet-chip big" aria-label={`${st.signets} signets`}><span className="signet" aria-hidden="true" /> <b className="num">{st.signets}</b> <span className="small">signets</span></div>
      </div>
      {SLOTS.map((s) => (
        <section key={s.slot}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>{s.label}</h2>
            {s.slot === 'obj' && d.out.length > 0 && <button className="btn ghost sm" onClick={() => desk.regroup()}>Remettre tous sur la barre</button>}
          </div>
          <p className="muted small" style={{ margin: '4px 0 14px', maxWidth: '72ch' }}>{s.help}</p>
          <div className="shop-grid">
            {ITEMS.filter((i) => i.slot === s.slot && i.id !== 'obj-rien').map((it) => {
              const owned = has(it), short = !owned && st.signets < it.price
              const obj = it.slot === 'obj', on = obj ? owned && isOut(it) : worn(it)
              return (
                <div key={it.id} className={`shop-item${on ? ' on' : ''}`}>
                  <Preview it={it} />
                  <div><b>{it.name}</b><br /><span className="muted small">{it.blurb}</span></div>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="small num">{it.price === 0 ? 'Offert' : owned ? 'À toi' : <><span className="signet" aria-hidden="true" /> {it.price}</>}</span>
                    {obj && owned ? <button className="btn sm" aria-pressed={on} onClick={() => desk.setOut(it.id, !on)}>{on ? 'Ranger' : 'Sortir'}</button>
                      : on ? <span className="done">Utilisé</span>
                      : owned ? <button className="btn sm" disabled={busy === it.id} onClick={() => void act(it)}>Utiliser</button>
                        : confirm === it.id ? (
                          <span className="row" style={{ gap: 6 }}>
                            <button className="btn primary sm" disabled={busy === it.id} onClick={() => void act(it)}>Confirmer</button>
                            <button className="btn ghost sm" onClick={() => setConfirm(null)}>Non</button>
                          </span>
                        ) : <button className="btn primary sm" disabled={short} title={short ? `Il te manque ${it.price - st.signets} signets` : undefined} onClick={() => setConfirm(it.id)}>{short ? `Encore ${it.price - st.signets}` : 'Acheter'}</button>}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </>
  )
}
