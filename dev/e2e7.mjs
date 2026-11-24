/* Objets : variantes, exemplaires, plafond d'objets sortis, bougies indépendantes (faux Supabase, MOCK=1).
   mock.best : palier de série déjà atteint (débloque les variantes rares jusqu'à ce nombre de semaines).
   Lancer : MOCK=1 npx vite build && npx vite preview --port 4173, puis node dev/e2e7.mjs */
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
const URL = 'http://localhost:4173/'
mkdirSync('/tmp/shots7', { recursive: true })
const out = [], errors = []
const ok = (c, m) => out.push((c ? 'OK   ' : 'ECHEC ') + m)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] })
async function open(best = 0, w = 1280, h = 1000, dark = false) {
  const page = await browser.newPage()
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  await page.setRequestInterception(true)
  page.on('request', (r) => (/^(https?:\/\/(localhost|127\.0\.0\.1)|data:)/.test(r.url()) ? r.continue() : r.abort()))
  await page.evaluateOnNewDocument((b) => { localStorage.clear(); localStorage.setItem('mock.seed', '2000'); if (b) localStorage.setItem('mock.best', String(b)); localStorage.setItem('pagaille.onboarded.u-me', '1') }, best)
  if (dark) await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
  await page.setViewport({ width: w, height: h })
  await page.goto(URL + '#boutique', { waitUntil: 'networkidle0' }); await sleep(700)
  return page
}
const inCard = (p, name, fn, arg) => p.evaluate((n, f, a) => {
  const c = [...document.querySelectorAll('.shop-item')].find((x) => x.querySelector('b')?.textContent === n)
  return new Function('c', 'a', f)(c, a)
}, name, fn.toString().replace(/^[^{]*{/, '').replace(/}$/, ''), arg)
const clickBtn = (p, name, re) => inCard(p, name, (c, a) => { const b = [...c.querySelectorAll('button')].find((x) => new RegExp(a).test(x.textContent)); b?.click(); return !!b }, re)
const clickDot = (p, name, label) => inCard(p, name, (c, a) => { const b = [...c.querySelectorAll('.swatch-dot')].find((x) => x.getAttribute('aria-label').startsWith(a)); b?.click(); return !!b }, label)
const cardText = (p, name) => inCard(p, name, (c) => { return c.innerText })
const previewHas = (p, name, color) => inCard(p, name, (c, a) => { return c.querySelector('.swatch-obj').innerHTML.toUpperCase().includes(a.toUpperCase()) }, color)
const deskHas = (p, copy, color) => p.evaluate((k, col) => document.querySelector(`.free-obj[data-obj="${k}"]`)?.innerHTML.toUpperCase().includes(col.toUpperCase()) ?? null, copy, color)
const deskOut = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('pagaille.desk.u-me') ?? '{"out":[]}').out)
async function buy(p, name, re = 'Acheter|\\+1') { await clickBtn(p, name, re); await sleep(80); await clickBtn(p, name, 'Confirmer'); await sleep(900) }
try {
  let p = await open(0)
  // Couleur choisie avant l'achat
  const dots = await inCard(p, 'Chat', (c) => { return c.querySelectorAll('.swatch-dot').length })
  ok(dots === 4, `chat : 4 couleurs proposées (${dots})`)
  ok(await previewHas(p, 'Chat', '#2A2D3A'), 'aperçu d’origine : chat noir')
  await clickDot(p, 'Chat', 'Roux'); await sleep(100)
  ok(await previewHas(p, 'Chat', '#D9813A'), 'pastille « Roux » avant achat : l’aperçu passe au roux')
  await clickDot(p, 'Chat', 'Siamois'); await sleep(100)
  ok(/série de 26 semaines/.test(await cardText(p, 'Chat')), 'siamois verrouillé : « série de 26 semaines » annoncé')
  await clickDot(p, 'Chat', 'Roux'); await sleep(100)
  await buy(p, 'Chat')
  ok(await deskHas(p, 'obj-chat', '#D9813A'), 'acheté en roux : le chat sorti est roux')
  ok(/1 sur 3/.test(await cardText(p, 'Chat')), 'compteur « 1 sur 3 »')

  // Deuxième exemplaire, couleur changée après coup
  await buy(p, 'Chat', '\\+1')
  ok((await deskOut(p)).includes('obj-chat#2'), 'deuxième exemplaire acheté et sorti (obj-chat#2)')
  ok(await deskHas(p, 'obj-chat#2', '#2A2D3A'), 'deuxième exemplaire à la couleur d’origine')
  await inCard(p, 'Chat', (c) => [...c.querySelectorAll('.chip')].find((x) => /n°2/.test(x.textContent)).click()); await sleep(100)
  await clickDot(p, 'Chat', 'Gris'); await sleep(300)
  ok(await deskHas(p, 'obj-chat#2', '#8E93A3') && await deskHas(p, 'obj-chat', '#D9813A'), 'n°2 passé en gris tigré, n°1 reste roux')
  await clickDot(p, 'Chat', 'Siamois'); await sleep(300)
  ok(await deskHas(p, 'obj-chat#2', '#8E93A3'), 'rare verrouillée : l’exemplaire ne change pas')
  await buy(p, 'Chat', '\\+1')
  const t3 = await cardText(p, 'Chat')
  ok(/3 sur 3/.test(t3) && !/\+1/.test(t3), '3 exemplaires : plus de bouton « +1 »')

  // Plafond d'objets sortis (6 sur ordinateur)
  for (const n of ['Bougie', 'Plante', 'Sablier']) await buy(p, n)
  ok((await deskOut(p)).length === 6, `6 objets sortis (${(await deskOut(p)).length})`)
  await buy(p, 'Globe')
  ok(!(await deskOut(p)).includes('obj-globe'), '7e objet : acheté mais pas sorti (plafond de 6)')
  ok(await p.evaluate(() => /Déjà 6 objets sortis/.test(document.body.innerText)), 'message : range-en un pour sortir celui-ci')
  await inCard(p, 'Chat', (c) => [...c.querySelectorAll('.chip')].find((x) => /n°3/.test(x.textContent)).click()); await sleep(80)
  await clickBtn(p, 'Chat', '^Ranger$'); await sleep(150)
  await clickBtn(p, 'Globe', '^Sortir$'); await sleep(900)
  ok((await deskOut(p)).includes('obj-globe') && !(await deskOut(p)).includes('obj-chat#3'), 'un chat rangé : le globe peut sortir')

  // Bougies indépendantes
  await clickBtn(p, 'Plante', '^Ranger$'); await sleep(100)
  await buy(p, 'Bougie', '\\+1'); await sleep(1500)
  const box = await p.evaluate(() => { const r = document.querySelector('.free-obj[data-obj="obj-bougie#2"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * 0.7 } })
  await p.mouse.click(box.x, box.y); await sleep(900)
  const off = await p.evaluate(() => JSON.parse(localStorage.getItem('pagaille.desk.u-me')).candlesOff)
  ok(JSON.stringify(off) === '["obj-bougie#2"]', 'on souffle la 2e bougie : seule elle s’éteint ' + JSON.stringify(off))
  await p.screenshot({ path: '/tmp/shots7/bureau.png' })
  await (await p.$$('.shop-grid'))[1].screenshot({ path: '/tmp/shots7/objets.png' })
  await p.close()

  // Palier de 26 semaines atteint : le siamois se débloque
  p = await open(26)
  await clickDot(p, 'Chat', 'Siamois'); await sleep(100)
  ok(!/série de 26 semaines/.test(await cardText(p, 'Chat')), 'série de 26 semaines : siamois disponible')
  await buy(p, 'Chat')
  ok(await deskHas(p, 'obj-chat', '#EDE3D0'), 'chat acheté en siamois')
  await p.close()

  // Téléphone, mode sombre : plafond de 4, chat noir sans contour
  p = await open(0, 390, 844, true)
  for (const n of ['Chat', 'Bougie', 'Plante', 'Sablier', 'Globe']) await buy(p, n)
  ok((await deskOut(p)).length === 4, `téléphone : 4 objets sortis au plus (${(await deskOut(p)).length})`)
  const f = await p.evaluate(() => getComputedStyle(document.querySelector('.free-obj svg')).filter)
  ok(f === 'none', 'pas de contour autour des objets')
  await p.screenshot({ path: '/tmp/shots7/tel.png' })
  await p.close()
} catch (e) { out.push('ERREUR ' + e.stack) }
await browser.close()
console.log(out.join('\n'))
console.log(errors.length ? 'Erreurs JS :\n' + errors.join('\n') : 'Aucune erreur JS')
