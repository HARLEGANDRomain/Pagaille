import { useEffect, useRef, useState } from 'react'
import { explain } from '../lib/supabase'
import { applyCosmetics, equippedItem, ITEMS, SLOTS, itemById, type Item } from '../lib/cosmetics'
import { ScenePreview } from '../components/Scene'
import { Trinket, type TrinketHandle } from '../components/Trinket'
import { desk, useDesk } from '../lib/trinkets/desk'
import { copiesOf, copyNo, MAX_COPIES, maxOut, unlocked, VARIANTS, variantOf } from '../lib/trinkets/variants'
import { Bar, useToast } from '../lib/ui'
import { useStore } from '../lib/store'

/* La boutique de signets. Rien ne s'achète avec de l'argent : les signets se gagnent en lisant
   (rituel du jour, missions, livres terminés ou abandonnés). Le serveur vérifie le prix et le solde. */

/** Aperçu vivant d'un objet : on peut déjà le toucher pour voir sa réaction avant de l'acheter. */
function ObjPreview({ id, variant }: { id: string; variant?: string }) {
  const t = useRef<TrinketHandle>(null)
  return (
    <button type="button" className="swatch-obj" onClick={() => t.current?.poke()} aria-label="Essayer l’objet" title="Touche-le">
      <Trinket id={id} h={70} ref={t} variant={variant} />
    </button>
  )
}

/** Un objet : ses couleurs, ses exemplaires (jusqu'à 3), « Sortir / Ranger » pour chacun. */
function ObjCard({ it }: { it: Item }) {
  const st = useStore()
  const toast = useToast()
  const d = useDesk()
  const copies = copiesOf(it.id, st.owned)
  const [pick, setPick] = useState<string | null>(null)
  const sel = pick && copies.includes(pick) ? pick : copies[0] ?? null
  const [look, setLook] = useState<string | null>(null) // couleur regardée sans être appliquée (pas encore achetée, ou verrouillée)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const list = VARIANTS[it.id] ?? []
  const current = variantOf(it.id, sel ? st.variants[sel] : undefined)!
  const shown = variantOf(it.id, look ?? current.id)!
  const short = st.signets < it.price
  const full = copies.length >= MAX_COPIES
  const out = sel ? d.out.includes(sel) : false
  const anyOut = copies.some((c) => d.out.includes(c))

  async function choose(v: (typeof list)[number]) {
    if (!sel || !unlocked(v, st.bestStreak)) { setLook(v.id === current.id && !sel ? null : v.id); return }
    setLook(null)
    if (v.id === current.id) return
    try { await st.setVariant(sel, v.id) } catch (e) { toast(explain(e)) }
  }
  function toggle(copy: string, on: boolean) {
    if (!desk.setOut(copy, on, maxOut())) toast(`Déjà ${maxOut()} objets sortis sur cet écran. Range-en un pour sortir celui-ci.`)
  }
  async function buy() {
    setBusy(true)
    try {
      const fresh = await st.buy(it.id)
      const want = look ? list.find((v) => v.id === look) : undefined
      if (want && unlocked(want, st.bestStreak) && want.id !== list[0].id) await st.setVariant(fresh, want.id).catch(() => { })
      setPick(fresh); setLook(null)
      toast(`« ${it.name} » acheté, ${it.price} signets.`)
      toggle(fresh, true) // il tombe sur la barre de navigation
    } catch (e) { toast(explain(e)) } finally { setBusy(false); setConfirm(false) }
  }

  const lockedLook = look ? list.find((v) => v.id === look && !unlocked(v, st.bestStreak)) : undefined
  return (
    <div className={`shop-item${anyOut ? ' on' : ''}`}>
      <ObjPreview id={it.id} variant={shown.id} />
      <div><b>{it.name}</b><br /><span className="muted small">{it.blurb}</span></div>
      <div className="swatches" role="group" aria-label={`Couleur${sel && copies.length > 1 ? ` de l’exemplaire ${copyNo(sel)}` : ''}`}>
        {list.map((v) => {
          const locked = !unlocked(v, st.bestStreak)
          return (
            <button key={v.id} type="button" className={`swatch-dot${locked ? ' locked' : ''}${v.weeks ? ' rare' : ''}`} style={{ ['--c' as string]: v.swatch }}
              aria-pressed={shown.id === v.id} aria-label={`${v.name}${locked ? `, se débloque avec une série de ${v.weeks} semaines` : v.weeks ? ', variante rare' : ''}`}
              title={`${v.name}${locked ? ` · série de ${v.weeks} semaines` : v.weeks ? ' · rare' : ''}`} onClick={() => void choose(v)} />
          )
        })}
        <span className="small muted swatch-name">{shown.name}</span>
      </div>
      {lockedLook && <p className="small muted" style={{ margin: 0 }}>Variante rare : se débloque avec une série de {lockedLook.weeks} semaines.</p>}
      {copies.length > 1 && (
        <div className="row" style={{ gap: 6 }} role="group" aria-label="Exemplaires">
          {copies.map((c) => (
            <button key={c} className="chip sm" aria-pressed={c === sel} onClick={() => { setPick(c); setLook(null) }}>
              n°{copyNo(c)}{d.out.includes(c) ? ' · sorti' : ''}
            </button>
          ))}
        </div>
      )}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="small num">{copies.length ? `${copies.length} sur ${MAX_COPIES}` : <><span className="signet" aria-hidden="true" /> {it.price}</>}</span>
        <span className="row" style={{ gap: 6 }}>
          {sel && <button className="btn sm" aria-pressed={out} onClick={() => toggle(sel, !out)}>{out ? 'Ranger' : 'Sortir'}</button>}
          {full ? null : confirm ? (
            <>
              <button className="btn primary sm" disabled={busy} onClick={() => void buy()}>Confirmer, {it.price}</button>
              <button className="btn ghost sm" onClick={() => setConfirm(false)}>Non</button>
            </>
          ) : (
            <button className={`btn ${copies.length ? 'ghost' : 'primary'} sm`} disabled={short} title={short ? `Il te manque ${it.price - st.signets} signets` : copies.length ? `Un autre exemplaire, ${it.price} signets` : undefined} onClick={() => setConfirm(true)}>
              {short ? `Encore ${it.price - st.signets}` : copies.length ? `+1 · ${it.price}` : 'Acheter'}
            </button>
          )}
        </span>
      </div>
    </div>
  )
}

/** Aperçu d'une ambiance : fixe, animé au survol (souris) ou au toucher. Un seul joue à la fois. */
function ScenePlay({ id, playing, onPlay }: { id: string; playing: boolean; onPlay: (on: boolean) => void }) {
  return (
    <button
      type="button" className="swatch-scene" aria-pressed={playing} aria-label={playing ? 'Arrêter l’aperçu' : 'Animer l’aperçu'}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') onPlay(true) }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') onPlay(false) }}
      onClick={(e) => { if ((e.nativeEvent as PointerEvent).pointerType !== 'mouse') onPlay(!playing) }}
      onFocus={() => onPlay(true)} onBlur={() => onPlay(false)}
    >
      <ScenePreview kind={id} playing={playing} />
    </button>
  )
}

/** L'ambiance en plein écran, comme pendant le chrono. Échap ou « Fermer » pour revenir. */
function SceneTry({ it, onClose }: { it: Item; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    close.current?.focus()
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="scene-try" role="dialog" aria-modal="true" aria-label={`Aperçu de l’ambiance ${it.name}`}>
      <ScenePreview kind={it.id} playing className="scene-try-cv" />
      <div className="scene-try-ui">
        <p className="scene-try-clock num" aria-hidden="true">10:00</p>
        <p><b>{it.name}</b> · {it.blurb}</p>
        <button ref={close} className="btn" onClick={onClose}>Fermer l’aperçu</button>
      </div>
    </div>
  )
}

/** Une maquette des vrais usages de l'accent, pour juger un surligneur dans la boutique même. */
function AccentDemo() {
  return (
    <div className="acc-demo" aria-hidden="true">
      <span className="btn primary sm">Lire 10 minutes</span>
      <span className="pill cours">En cours</span>
      <div className="week acc-demo-week">
        {'LMMJVSD'.split('').map((d, i) => <div key={i} className={`day${[0, 1, 3].includes(i) ? ' read' : ''}${i === 4 ? ' today' : ''}`}><i />{d}</div>)}
      </div>
      <div className="acc-demo-bar"><Bar v={62} g={100} mark /></div>
    </div>
  )
}

/* Les objets ne se « portent » pas : on en sort autant qu'on veut. Qui est sorti et où il est posé
   est retenu sur l'appareil (lib/trinkets/desk.ts) ; seul l'achat passe par la base. */

export default function Shop() {
  const st = useStore()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  const [big, setBig] = useState<string | null>(null)
  const d = useDesk()

  /* Essai d'un surligneur : appliqué à toute l'appli tant qu'on reste dans la boutique.
     Rien n'est enregistré : quitter l'onglet (la boutique se démonte), recharger ou lancer un autre essai
     ramène la couleur portée. Un achat depuis l'essai n'équipe pas : on « Utilise » ensuite, comme d'habitude. */
  const [trial, setTrial] = useState<string | null>(null)
  const [trialConfirm, setTrialConfirm] = useState(false)
  const equipped = useRef(st.profile.equipped)
  equipped.current = st.profile.equipped
  useEffect(() => {
    if (!trial) return
    applyCosmetics(equipped.current, trial)
    return () => applyCosmetics(equipped.current)
  }, [trial])
  const tried = itemById(trial ?? undefined)
  const stopTrial = () => { setTrial(null); setTrialConfirm(false) }

  const has = (it: Item) => it.price === 0 || st.owned.has(it.id)
  const worn = (it: Item) => equippedItem(st.profile.equipped, it.slot).id === it.id

  async function act(it: Item) {
    setBusy(it.id)
    stopTrial() // « Utiliser » ou acheter depuis une carte remplace l'essai en cours
    try {
      if (!has(it)) {
        await st.buy(it.id)
        toast(`« ${it.name} » acheté, ${it.price} signets.`)
      }
      await st.equip(it.id)
      if (has(it)) toast(`« ${it.name} » utilisé.`)
    } catch (e) { toast(explain(e)) } finally { setBusy(null); setConfirm(null) }
  }

  /** Achat depuis le bandeau d'essai : on achète seulement, l'essai s'arrête, la couleur portée revient. */
  async function buyTried(it: Item) {
    setBusy(it.id)
    try {
      await st.buy(it.id)
      stopTrial()
      toast(`« ${it.name} » acheté, ${it.price} signets. Touche « Utiliser » pour l’adopter.`)
    } catch (e) { toast(explain(e)) } finally { setBusy(null); setTrialConfirm(false) }
  }

  const triedShort = tried ? st.signets < tried.price : false

  return (
    <>
      <div className="head">
        <div>
          <h1>Boutique</h1>
          <p className="muted" style={{ marginTop: 8, maxWidth: '62ch' }}>Tes signets se gagnent en lisant : rituel du jour, missions de la semaine, livres terminés ou abandonnés. Ils ne s’achètent pas.</p>
        </div>
        <div className="wallet-chip big" aria-label={`${st.signets} signets`}><span className="signet" aria-hidden="true" /> <b className="num">{st.signets}</b> <span className="small">signets</span></div>
      </div>

      {tried && (
        <div className="trial-bar" role="status">
          <p><b>Essai : {tried.name}.</b> <span className="muted">Toute l’appli est à cette couleur tant que tu restes dans la boutique.</span></p>
          <div className="row" style={{ gap: 6 }}>
            {trialConfirm ? (
              <>
                <button className="btn primary sm" disabled={busy === tried.id} onClick={() => void buyTried(tried)}>Confirmer, {tried.price} signets</button>
                <button className="btn ghost sm" onClick={() => setTrialConfirm(false)}>Non</button>
              </>
            ) : (
              <>
                <button className="btn primary sm" disabled={triedShort} title={triedShort ? `Il te manque ${tried.price - st.signets} signets` : undefined} onClick={() => setTrialConfirm(true)}>
                  {triedShort ? `Encore ${tried.price - st.signets}` : <>Acheter · <span className="signet" aria-hidden="true" /> {tried.price}</>}
                </button>
                <button className="btn sm" onClick={stopTrial}>Arrêter l’essai</button>
              </>
            )}
          </div>
        </div>
      )}

      {SLOTS.map((s) => (
        <section key={s.slot}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>{s.label}</h2>
            {s.slot === 'obj' && d.out.length > 0 && <button className="btn ghost sm" onClick={() => desk.regroup()}>Remettre tous sur la barre</button>}
          </div>
          <p className="muted small" style={{ margin: '4px 0 14px', maxWidth: '72ch' }}>{s.help}</p>
          {s.slot === 'acc' && <AccentDemo />}
          <div className="shop-grid">
            {ITEMS.filter((i) => i.slot === s.slot && i.id !== 'obj-rien').map((it) => {
              if (it.slot === 'obj') return <ObjCard key={it.id} it={it} />
              const owned = has(it), short = !owned && st.signets < it.price
              const on = worn(it)
              const trying = trial === it.id
              return (
                <div key={it.id} className={`shop-item${on ? ' on' : ''}${trying ? ' trying' : ''}`}>
                  {it.slot === 'shelf' && <div className="swatch-shelf" style={{ ['--plank' as string]: it.vars!['--plank'], ['--plank-edge' as string]: it.vars!['--plank-edge'] }}><i /><i /><i /><i /></div>}
                  {it.slot === 'acc' && <div className="swatch-acc" style={{ ['--m' as string]: it.vars!['--mark'] }}><span>Surligné</span></div>}
                  {it.slot === 'scene' && <ScenePlay id={it.id} playing={playing === it.id} onPlay={(p) => setPlaying(p ? it.id : (cur) => (cur === it.id ? null : cur) as never)} />}
                  <div><b>{it.name}</b><br /><span className="muted small">{it.blurb}</span></div>
                  {it.slot === 'scene' && <button className="btn ghost sm" onClick={() => setBig(it.id)}>Voir en grand</button>}
                  {it.slot === 'acc' && !owned && (
                    <button className="btn ghost sm" aria-pressed={trying} onClick={() => (trying ? stopTrial() : (setTrialConfirm(false), setTrial(it.id)))}>
                      {trying ? 'Arrêter l’essai' : 'Essayer sur toute l’appli'}
                    </button>
                  )}
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="small num">{it.price === 0 ? 'Offert' : owned ? 'À toi' : <><span className="signet" aria-hidden="true" /> {it.price}</>}</span>
                    {on ? <span className="done">Utilisé</span>
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
      {big && itemById(big) && <SceneTry it={itemById(big)!} onClose={() => setBig(null)} />}
    </>
  )
}
