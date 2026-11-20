/* Objets libres : achat, sortie, chute sur la barre, glisser-déposer sur une carte, réactions au clic,
   place retenue après rechargement, perchoirs absents (texte, bouton). Sur le faux Supabase (MOCK=1). */
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
const URL = 'http://localhost:4173/'
mkdirSync('/tmp/shots4', { recursive: true })
const out = []
const ok = (c, m) => out.push((c ? 'OK   ' : 'ECHEC ') + m)
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource|net::/.test(m.text())) errors.push('console: ' + m.text()) })
await page.setRequestInterception(true)
page.on('request', (r) => { const u = r.url(); if (/^(https?:\/\/(localhost|127\.0\.0\.1)|data:)/.test(u)) return r.continue(); r.abort() })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const box = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, cx: r.left + r.width / 2 } }, sel)
const clickBtn = (sel, text, within) => page.evaluate((sel, text, within) => {
  const root = within ? [...document.querySelectorAll('.shop-item')].find((x) => x.textContent.includes(within)) : document
  const e = [...(root?.querySelectorAll(sel) ?? [])].find((x) => x.textContent.trim().startsWith(text)); e?.click(); return !!e
}, sel, text, within)
const objBox = (id) => box(`.free-obj[data-obj="${id}"]`)

try {
  await page.evaluateOnNewDocument(() => { localStorage.setItem('mock.seed', '2000'); localStorage.setItem('pagaille.onboarded.u-me', '1') })
  await page.setViewport({ width: 1280, height: 860 })
  await page.goto(URL + '#boutique', { waitUntil: 'networkidle0' }); await sleep(800)
  ok(!(await page.evaluate(() => document.body.innerText.includes('Étagère nue'))), 'boutique : l’article « Rien » a disparu')
  for (const name of ['Chat', 'Bougie', 'Plante', 'Sablier', 'Globe']) {
    ok(await clickBtn('button', 'Acheter', name), `achat ${name} : bouton`); await sleep(150)
    ok(await clickBtn('button', 'Confirmer', name), `achat ${name} : confirmation`); await sleep(500)
  }
  await sleep(1500)
  const n = await page.evaluate(() => document.querySelectorAll('.free-obj').length)
  ok(n === 5, `5 objets sortis en même temps (${n})`)
  const foot = await box('.rail-foot')
  const cat = await objBox('obj-chat')
  ok(cat && Math.abs(cat.b - foot.t) < 3, `ordinateur : le chat tombe et se pose sur le pied du rail (bas ${cat?.b?.toFixed(0)}, surface ${foot?.t?.toFixed(0)})`)
  ok(await page.evaluate(() => document.querySelector('.free-obj[data-obj="obj-chat"]').style.position === 'fixed'), 'posé sur la barre : positionné en fixed (visible partout)')
  await page.screenshot({ path: '/tmp/shots4/boutique-rail.png' })

  // Clic = réaction, pas de déplacement
  const before = await objBox('obj-globe')
  await page.mouse.click(before.cx, before.t + before.h * 0.4); await sleep(200)
  const after = await objBox('obj-globe')
  ok(Math.abs(after.l - before.l) < 1 && Math.abs(after.t - before.t) < 1, 'clic sur le globe : il ne bouge pas de place')
  const t1 = await page.evaluate(() => document.querySelector('.free-obj[data-obj="obj-globe"] g[transform^="translate"]')?.getAttribute('transform'))
  await sleep(300)
  const t2 = await page.evaluate(() => document.querySelector('.free-obj[data-obj="obj-globe"] g[transform^="translate"]')?.getAttribute('transform'))
  const dx = (a) => Number(a.match(/translate\(([-\d.]+)/)[1])
  const turned = (((dx(t2) - dx(t1)) % 80) + 80) % 80
  ok(turned > 15, `le globe tourne vite après le clic (${turned.toFixed(1)} unités sur 80 en 0,3 s ; au repos ≈ 0,7)`)

  const candle = await objBox('obj-bougie')
  await page.mouse.click(candle.cx, candle.t + candle.h * 0.7); await sleep(600)
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('pagaille.desk.u-me')).candleOff === true), 'clic sur la bougie : elle s’éteint (état retenu)')
  await page.mouse.click(candle.cx, candle.t + candle.h * 0.7); await sleep(900)
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('pagaille.desk.u-me')).candleOff === false), 'second clic : elle se rallume')

  // Glisser le chat sur la carte des missions (onglet Aujourd'hui)
  await page.goto(URL + '#aujourdhui', { waitUntil: 'networkidle0' }); await sleep(1500)
  const missions = await box('[data-perch="zone:missions"]')
  const c0 = await objBox('obj-chat')
  await page.mouse.move(c0.cx, c0.t + c0.h * 0.6)
  await page.mouse.down()
  for (let i = 1; i <= 20; i++) { await page.mouse.move(c0.cx + ((missions.cx - c0.cx) * i) / 20, c0.t + ((missions.t - 90 - c0.t) * i) / 20); await sleep(16) }
  await sleep(120) // immobile avant de lâcher : pas de lancer
  await page.mouse.up(); await sleep(1400)
  const c1 = await objBox('obj-chat')
  ok(c1 && Math.abs(c1.b - missions.t) < 3, `chat lâché au-dessus des missions : il se pose sur la carte (bas ${c1?.b?.toFixed(0)}, carte ${missions.t.toFixed(0)})`)
  ok(await page.evaluate(() => document.querySelector('.free-obj[data-obj="obj-chat"]').style.position === 'absolute'), 'posé sur une carte : il défile avec la page (absolute)')
  const pl = await page.evaluate(() => JSON.parse(localStorage.getItem('pagaille.desk.u-me')).place['obj-chat'])
  ok(pl?.key === 'zone:missions' && pl?.route === 'aujourdhui', `place retenue : ${JSON.stringify(pl)}`)
  await page.screenshot({ path: '/tmp/shots4/aujourdhui-missions.png' })

  // Défilement : il reste collé à la carte
  await page.evaluate(() => window.scrollTo(0, 200)); await sleep(300)
  const m2 = await box('[data-perch="zone:missions"]'), c2 = await objBox('obj-chat')
  ok(Math.abs(c2.b - m2.t) < 3, 'après défilement : toujours sur la carte')
  await page.evaluate(() => window.scrollTo(0, 0)); await sleep(200)

  // Un titre n'est pas un perchoir : lâché au-dessus du titre de la page, le chat passe à travers
  const h1 = await box('h1')
  const c3 = await objBox('obj-chat')
  await page.mouse.move(c3.cx, c3.t + c3.h * 0.6); await page.mouse.down()
  for (let i = 1; i <= 10; i++) { await page.mouse.move(c3.cx + ((h1.l + 40 - c3.cx) * i) / 10, c3.t + ((h1.t - 80 - c3.t) * i) / 10); await sleep(16) }
  await sleep(120); await page.mouse.up(); await sleep(1600)
  const c4 = await objBox('obj-chat')
  ok(c4 && Math.abs(c4.b - h1.t) > 6, `lâché au-dessus du titre : il ne s’y arrête pas (bas ${c4?.b?.toFixed(0)}, titre ${h1.t.toFixed(0)})`)
  const pl2 = await page.evaluate(() => JSON.parse(localStorage.getItem('pagaille.desk.u-me')).place['obj-chat'])
  ok(pl2 && !/^(h|btn)/.test(pl2.key), `il finit sur un vrai perchoir : ${pl2?.key}`)

  // Remontage (le faux Supabase est en mémoire : un rechargement effacerait les achats) : la place est retrouvée
  await page.goto(URL + '#profil', { waitUntil: 'networkidle0' }); await sleep(400)
  await page.goto(URL + '#aujourdhui', { waitUntil: 'networkidle0' }); await sleep(1200)
  const c5 = await objBox('obj-chat'), perch = await box(`[data-perch="${pl2.key}"]`)
  ok(pl2.route === null || (c5 && perch && Math.abs(c5.b - perch.t) < 3), 'retour sur l’onglet : le chat est à sa place')
  const pl3 = await page.evaluate(() => JSON.parse(localStorage.getItem('pagaille.desk.u-me')).place['obj-chat'])
  ok(pl3?.key === pl2?.key, 'même perchoir retenu')

  // Autre onglet : un objet posé dans « Aujourd'hui » n'apparaît pas ailleurs ; ceux de la barre, si
  await page.goto(URL + '#bibliotheque', { waitUntil: 'networkidle0' }); await sleep(1200)
  const ids = await page.evaluate(() => [...document.querySelectorAll('.free-obj')].map((e) => e.dataset.obj))
  ok(pl2.route === null ? ids.includes('obj-chat') : !ids.includes('obj-chat'), `bibliothèque : objets visibles ${ids.join(', ')}`)
  ok(ids.includes('obj-globe'), 'bibliothèque : le globe posé sur la barre est toujours là')
  await page.screenshot({ path: '/tmp/shots4/bibliotheque.png' })

  // Lancer : le globe jeté vers la droite garde son élan
  const g0 = await objBox('obj-globe')
  await page.mouse.move(g0.cx, g0.t + 20); await page.mouse.down()
  for (let i = 1; i <= 8; i++) { await page.mouse.move(g0.cx + i * 14, g0.t + 20 - i * 8); await sleep(16) }
  const released = await objBox('obj-globe')
  await page.mouse.up(); await sleep(2500)
  const g1 = await objBox('obj-globe')
  ok(g1 && g1.cx > released.cx + 80, `globe lancé : il garde son élan après le lâcher (${(g1.cx - released.cx).toFixed(0)} px de plus)`)

  // « Remettre tous sur la barre »
  await page.goto(URL + '#boutique', { waitUntil: 'networkidle0' }); await sleep(1000)
  ok(await clickBtn('button', 'Remettre tous sur la barre'), 'bouton « Remettre tous sur la barre »'); await sleep(1800)
  const foot2 = await box('.rail-foot')
  const all = await page.evaluate(() => [...document.querySelectorAll('.free-obj')].map((e) => e.getBoundingClientRect().bottom))
  ok(all.length === 5 && all.every((b) => Math.abs(b - foot2.t) < 3), `tous de retour sur la barre (${all.map((b) => b.toFixed(0)).join(', ')})`)
  // Ranger un objet
  ok(await clickBtn('button', 'Ranger', 'Sablier'), 'ranger le sablier'); await sleep(400)
  ok(!(await objBox('obj-sablier')), 'le sablier a disparu')

  // Téléphone : la barre du bas
  // (changer de mode d'appareil recharge la page : le faux Supabase repart de zéro, on rachète le globe)
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
  await page.goto(URL + '#boutique', { waitUntil: 'networkidle0' }); await sleep(800)
  await clickBtn('button', 'Acheter', 'Globe'); await sleep(150); await clickBtn('button', 'Confirmer', 'Globe'); await sleep(500)
  await page.goto(URL + '#aujourdhui', { waitUntil: 'networkidle0' }); await sleep(1800)
  const rail = await box('.rail')
  const onNav = await page.evaluate(() => JSON.parse(localStorage.getItem('pagaille.desk.u-me')).place)
  const globeM = await objBox('obj-globe')
  ok(globeM && Math.abs(globeM.b - rail.t) < 3, `téléphone : le globe est posé sur la barre du bas (bas ${globeM?.b?.toFixed(0)}, barre ${rail.t.toFixed(0)})`)
  ok(Object.values(onNav).every((p) => p.key === 'nav'), 'même perchoir « nav » sur téléphone et ordinateur')
  await page.screenshot({ path: '/tmp/shots4/telephone.png' })
} catch (e) { out.push('ERREUR ' + e.stack) }
console.log(out.join('\n'))
console.log(errors.length ? 'Erreurs JS :\n' + errors.join('\n') : 'Aucune erreur JS')
await browser.close()
