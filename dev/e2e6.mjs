/* Boutique : essai du surligneur, aperçus d'ambiance, contour des objets (faux Supabase, MOCK=1).
   Lancer : MOCK=1 npx vite build && npx vite preview --port 4173, puis node dev/e2e6.mjs */
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
const URL = 'http://localhost:4173/'
mkdirSync('/tmp/shots6', { recursive: true })
const out = [], errors = []
const ok = (c, m) => out.push((c ? 'OK   ' : 'ECHEC ') + m)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] })
async function open(hash, w = 1280, h = 1000, dark = false) {
  const page = await browser.newPage()
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
  await page.setRequestInterception(true)
  page.on('request', (r) => (/^(https?:\/\/(localhost|127\.0\.0\.1)|data:)/.test(r.url()) ? r.continue() : r.abort()))
  await page.evaluateOnNewDocument(() => { localStorage.setItem('mock.seed', '600'); localStorage.setItem('pagaille.onboarded.u-me', '1') })
  if (dark) await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
  await page.setViewport({ width: w, height: h })
  await page.goto(URL + hash, { waitUntil: 'networkidle0' }); await sleep(800)
  return page
}
const mark = (p) => p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--mark').trim().toUpperCase())
const clickText = (p, sel, re) => p.evaluate((s, r) => { const b = [...document.querySelectorAll(s)].find((x) => new RegExp(r).test(x.textContent)); b?.click(); return !!b }, sel, re)
const card = (p, name, re) => p.evaluate((n, r) => { const c = [...document.querySelectorAll('.shop-item')].find((x) => x.querySelector('b')?.textContent === n); const b = c && [...c.querySelectorAll('button')].find((x) => new RegExp(r).test(x.textContent)); b?.click(); return !!b }, name, re)
try {
  let p = await open('#boutique')
  const base = await mark(p)
  ok(base === '#FFDD3C', 'surligneur d’origine : ' + base)

  // Essai
  ok(await card(p, 'Corail', 'Essayer'), 'bouton « Essayer » sur Corail')
  await sleep(200)
  ok(await mark(p) === '#FF9E80', 'essai : toute l’appli passe en corail')
  ok(await p.$('.trial-bar') !== null, 'bandeau d’essai affiché')
  await p.screenshot({ path: '/tmp/shots6/essai.png' })

  // Un autre essai remplace le premier
  await card(p, 'Menthe', 'Essayer'); await sleep(200)
  ok(await mark(p) === '#7FE0B8', 'un autre essai remplace le premier (menthe)')

  // Changer d'onglet ramène la couleur portée
  await p.evaluate(() => { location.hash = '#bibliotheque' }); await sleep(400)
  ok(await mark(p) === base, 'changement d’onglet : retour au surligneur porté')
  await p.evaluate(() => { location.hash = '#boutique' }); await sleep(400)
  ok(await p.$('.trial-bar') === null, 'en revenant, plus d’essai en cours')

  // Arrêter l'essai
  await card(p, 'Lilas', 'Essayer'); await sleep(150)
  await clickText(p, '.trial-bar button', 'Arrêter'); await sleep(150)
  ok(await mark(p) === base && await p.$('.trial-bar') === null, '« Arrêter l’essai » : retour au surligneur porté')

  // Achat pendant l'essai : acheté, pas utilisé, la couleur s'enlève
  await card(p, 'Corail', 'Essayer'); await sleep(150)
  const before = Number((await p.$eval('.wallet-chip b', (e) => e.textContent)).replace(/\D/g, ''))
  await clickText(p, '.trial-bar button', 'Acheter'); await sleep(100)
  await clickText(p, '.trial-bar button', 'Confirmer'); await sleep(700)
  const after = Number((await p.$eval('.wallet-chip b', (e) => e.textContent)).replace(/\D/g, ''))
  ok(before - after === 100, `achat pendant l’essai : -${before - after} signets`)
  ok(await mark(p) === base, 'après l’achat, la couleur d’essai s’enlève')
  const cor = await p.evaluate(() => [...document.querySelectorAll('.shop-item')].find((x) => x.querySelector('b')?.textContent === 'Corail')?.innerText ?? '')
  ok(/Utiliser/.test(cor) && /À toi/.test(cor) && !/Essayer/.test(cor), 'Corail : « À toi », bouton « Utiliser », plus d’essai')
  await card(p, 'Corail', 'Utiliser'); await sleep(600)
  ok(await mark(p) === '#FF9E80', '« Utiliser » : corail porté')
  await p.evaluate(() => { location.hash = '#aujourdhui' }); await sleep(300)
  ok(await mark(p) === '#FF9E80', 'corail reste porté hors de la boutique')

  // Aperçus d'ambiance
  await p.evaluate(() => { location.hash = '#boutique' }); await sleep(400)
  const sig = () => p.evaluate(() => { const c = document.querySelectorAll('.swatch-scene canvas')[1]; return c.toDataURL().length + ':' + c.toDataURL().slice(-200) })
  const s1 = await sig(); await sleep(300); const s2 = await sig()
  ok(s1 === s2, 'ambiance au repos : image fixe')
  const sc = await p.$$('.swatch-scene'); await sc[1].hover(); await sleep(400)
  const s3 = await sig(); await sleep(300); const s4 = await sig()
  ok(s3 !== s4, 'ambiance survolée : animée')
  const pressed = await p.evaluate(() => [...document.querySelectorAll('.swatch-scene')].filter((b) => b.getAttribute('aria-pressed') === 'true').length)
  ok(pressed === 1, `une seule ambiance animée à la fois (${pressed})`)
  await p.mouse.move(5, 5); await sleep(200)
  ok(await p.evaluate(() => [...document.querySelectorAll('.swatch-scene')].every((b) => b.getAttribute('aria-pressed') === 'false')), 'souris partie : arrêt')
  await card(p, 'Neige', 'Voir en grand'); await sleep(600)
  ok(await p.$('.scene-try') !== null, '« Voir en grand » : ambiance en plein écran')
  await p.screenshot({ path: '/tmp/shots6/plein-ecran.png' })
  await p.keyboard.press('Escape'); await sleep(200)
  ok(await p.$('.scene-try') === null, 'Échap ferme l’aperçu')
  await p.screenshot({ path: '/tmp/shots6/boutique.png', fullPage: true })
  await p.close()

  // Téléphone, mode sombre : objets sur la barre, contour visible
  p = await open('#boutique', 390, 844, true)
  await card(p, 'Chat', 'Acheter'); await sleep(100); await card(p, 'Chat', 'Confirmer'); await sleep(1500)
  await card(p, 'Globe', 'Acheter'); await sleep(100); await card(p, 'Globe', 'Confirmer'); await sleep(1500)
  const sizes = await p.evaluate(() => [...document.querySelectorAll('.free-obj svg')].map((s) => Math.round(s.getBoundingClientRect().height)))
  ok(sizes.length === 2 && sizes.every((h) => h > 60), 'chat et globe sortis, taille normale : ' + sizes.join(', '))
  const f = await p.evaluate(() => getComputedStyle(document.querySelector('.free-obj svg')).filter)
  ok(f === 'none', 'pas de contour autour des objets (retiré le 24/11 : le chat noir reste discret dans le noir)')
  await p.screenshot({ path: '/tmp/shots6/tel-sombre.png' })
  await p.evaluate(() => { location.hash = '#boutique' }); await sleep(200)
  await card(p, 'Lilas', 'Essayer'); await sleep(200)
  await p.screenshot({ path: '/tmp/shots6/tel-essai.png' })
  await p.close()
} catch (e) { out.push('ERREUR ' + e.stack) }
await browser.close()
console.log(out.join('\n'))
console.log(errors.length ? 'Erreurs JS :\n' + errors.join('\n') : 'Aucune erreur JS')
