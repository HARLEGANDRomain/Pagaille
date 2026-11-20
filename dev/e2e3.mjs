/* Chevauchement de la couverture dans l'ajout d'un livre + résumés (ajout, fiche, Découvrir), sur le faux Supabase (MOCK=1). */
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
const URL = 'http://localhost:4173/'
mkdirSync('/tmp/shots3', { recursive: true })
const out = []
const ok = (c, m) => out.push((c ? 'OK   ' : 'ECHEC ') + m)
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource|net::/.test(m.text())) errors.push('console: ' + m.text()) })
// Une vraie image de 300 × 450 pour toutes les couvertures : c'est elle qui débordait.
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="#b33"/><rect x="20" y="40" width="260" height="120" fill="#fc3"/></svg>'
await page.setRequestInterception(true)
page.on('request', (r) => { const u = r.url(); if (/^(https?:\/\/(localhost|127\.0\.0\.1)|data:)/.test(u)) return r.continue(); if (/covers\.openlibrary|books\.google|gallica/.test(u)) return r.respond({ status: 200, contentType: 'image/svg+xml', body: svg }); r.abort() })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const box = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height } }, sel)
const txt = () => page.evaluate(() => document.body.innerText)
const clickBtn = (sel, text) => page.evaluate((sel, text) => { const e = [...document.querySelectorAll(sel)].find((x) => x.textContent.trim().startsWith(text)); e?.click(); return !!e }, sel, text)

try {
for (const [w, h] of [[390, 844], [1280, 800]]) {
  await page.setViewport({ width: w, height: h })
  await page.goto(URL + '#bibliotheque', { waitUntil: 'networkidle0' }); await sleep(600)
  ok(await clickBtn('button', 'Ajouter un livre'), `${w}px : ouverture de l’ajout`); await sleep(400)
  await page.type('dialog input[type=search]', 'corne joe hill'); await sleep(1500)
  await page.evaluate(() => document.querySelector('dialog .hit')?.click()); await sleep(800)
  const mini = await box('dialog form .mini'), img = await box('dialog form .mini img'), title = await box('dialog form b.bk')
  ok(mini && mini.w <= 80 && mini.h <= 130, `${w}px : la couverture reste dans son cadre (${Math.round(mini?.w)}×${Math.round(mini?.h)})`)
  ok(img && Math.abs(img.w - mini.w) < 2 && Math.abs(img.h - mini.h) < 2, `${w}px : l’image n’est pas plus grande que son cadre`)
  ok(title && mini && title.l >= mini.r, `${w}px : le titre est à droite de la couverture, sans chevauchement`)
  const t = await txt()
  ok(t.includes('Ig Perrish se réveille avec des cornes'), `${w}px : le résumé s’affiche dans l’ajout`)
  await page.screenshot({ path: `/tmp/shots3/ajout-${w}.png` })
  if (w === 390) {
    ok(await clickBtn('dialog form button.btn.primary', 'Ajouter'), 'ajout du livre'); await sleep(1000)
  } else {
    await page.keyboard.press('Escape'); await sleep(300)
  }
}
// un ami partage sa bibliothèque : ses livres ne doivent pas apparaître sur mes étagères
await page.setViewport({ width: 1280, height: 900 })
await page.goto(URL + '#bibliotheque', { waitUntil: 'networkidle0' }); await sleep(700)
const lib = await txt()
ok(!lib.includes('Livre de l’ami') && !/Livre de l.ami/.test(lib), 'bibliothèque : les livres d’un ami ne sont pas affichés chez moi')
// fiche d'un livre ajouté avec résumé connu
await page.setViewport({ width: 390, height: 844 })
await page.goto(URL + '#bibliotheque', { waitUntil: 'networkidle0' }); await sleep(600)
await page.evaluate(() => document.querySelector('.spine, .shelf button')?.click()); await sleep(900)
let t = await txt()
ok(/Résumé/.test(t) && /Montag/.test(t), 'fiche : le résumé est cherché puis affiché (Fahrenheit 451)')
const cover = await box('dialog .cover'), head = await box('dialog .dlg-head')
ok(cover && head && cover.t >= head.b, 'fiche : la couverture est sous l’en-tête')
await page.screenshot({ path: '/tmp/shots3/fiche.png' })
await page.keyboard.press('Escape'); await sleep(300)
// Découvrir : le résumé ou l'accroche est visible sur les cartes
await page.goto(URL + '#decouvrir', { waitUntil: 'networkidle0' }); await sleep(1200)
const onCards = await page.evaluate(() => document.querySelectorAll('.rec .synopsis, .rec p.muted').length)
ok(onCards === 0, 'Découvrir : plus de résumé sous les livres')
await page.screenshot({ path: '/tmp/shots3/decouvrir.png' })
await page.evaluate(() => document.querySelector('.rec .cover')?.click()); await sleep(900)
const dlgSyn = await page.evaluate(() => document.querySelector('dialog[open] .synopsis')?.textContent?.length ?? 0)
ok(dlgSyn > 60, `Découvrir : le résumé s’affiche au clic sur le livre (${dlgSyn} caractères)`)
await page.screenshot({ path: '/tmp/shots3/decouvrir-clic.png' })
} catch (e) { out.push('ECHEC exception: ' + e.message) }
await browser.close()
console.log(out.join('\n')); if (errors.length) console.log('Erreurs JS:\n' + errors.join('\n')); else console.log('Aucune erreur JS.')
process.exit(out.some((l) => l.startsWith('ECHEC')) ? 1 : 0)
