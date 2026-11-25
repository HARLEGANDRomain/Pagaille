/* Pièce de vie du cercle : sièges, présence, étagère commune, pile de la semaine, version lecture (faux Supabase, MOCK=1).
   localStorage['mock.readers'] = ids des amis « en train de lire ». Inès est assise (siège 3, canapé du fond), Malo non, moi non.
   Lancer : MOCK=1 npx vite build && npx vite preview --port 4173, puis node dev/e2e8.mjs */
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
const URL = 'http://localhost:4173/'
mkdirSync('/tmp/shots8', { recursive: true })
const out = [], errors = []
const ok = (c, m) => out.push((c ? 'OK   ' : 'ECHEC ') + m)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] })
async function open(readers, w = 1280, h = 1000, dark = false) {
  const page = await browser.newPage()
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  await page.setRequestInterception(true)
  page.on('request', (r) => (/^(https?:\/\/(localhost|127\.0\.0\.1)|data:)/.test(r.url()) ? r.continue() : r.abort()))
  await page.evaluateOnNewDocument((rd) => { localStorage.clear(); localStorage.setItem('mock.readers', JSON.stringify(rd)); localStorage.setItem('pagaille.onboarded.u-me', '1') }, readers)
  if (dark) await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
  await page.setViewport({ width: w, height: h })
  await page.goto(URL + '#cercle', { waitUntil: 'networkidle0' }); await sleep(900)
  return page
}
const seatAt = (p, i) => p.evaluate((k) => document.querySelector(`.room:not(.compact) [data-seat="${k}"]`)?.outerHTML ?? null, i)
const legend = (p) => p.$eval('.room-legend', (e) => e.innerText)
try {
  let p = await open(['u-ines'])
  ok(await p.$('.room:not(.compact)') !== null, 'la pièce s’affiche en haut de la page du cercle')
  const box = await p.$eval('.room', (e) => { const r = e.getBoundingClientRect(); return r.width / r.height })
  ok(Math.abs(box - 10 / 7) < 0.02, `proportions fixes 10:7 (${box.toFixed(3)})`)
  const ines = await seatAt(p, 3)
  ok(ines && /Inès/.test(ines) && /reading/.test(ines), 'Inès assise sur le canapé du fond, lampe allumée (elle lit)')
  ok(/Inès<\/b> lit en ce moment/.test(await p.$eval('.room-legend', (e) => e.innerHTML)), 'légende : « Inès lit en ce moment »')
  ok(/Choisis ta place/.test(await legend(p)) && /Pas encore assis : Malo/.test(await legend(p)), 'légende : choisis ta place ; Malo pas encore assis')
  ok((await p.$$('.room-seat.free')).length === 11, '11 places libres proposées')
  ok(await p.$eval('.room svg', (s) => [...s.querySelectorAll('title')].some((t) => t.textContent === 'Maus — terminé par Inès')), 'étagère commune : « Maus », terminé par Inès')
  ok(await p.$eval('.room svg', (s) => /\d+ \/ 250 p\./.test(s.textContent)), 'pile de la semaine : « N / 250 p. »')
  ok(await p.$('.room-window canvas') !== null, 'la fenêtre montre l’ambiance de lecture')
  await p.screenshot({ path: '/tmp/shots8/piece.png' })

  // S'asseoir
  await p.evaluate(() => [...document.querySelectorAll('.room-seat.free')].find((b) => /fauteuil près de l’étagère/.test(b.getAttribute('aria-label'))).click()); await sleep(500)
  const mine = await seatAt(p, 8)
  ok(mine && /mine/.test(mine) && /Toi/.test(mine), 'je m’assois dans le fauteuil près de l’étagère')
  ok(await p.evaluate(() => /Tu t’assois sur le fauteuil près de l’étagère/.test(document.body.innerText)), 'message : « Tu t’assois sur le fauteuil près de l’étagère »')
  ok((await p.$$('.room-seat.free')).length === 10, 'plus que 10 places libres')
  // Changer de place
  await p.evaluate(() => [...document.querySelectorAll('.room-seat.free')].find((b) => /table de lecture/.test(b.getAttribute('aria-label'))).click()); await sleep(500)
  ok(/mine/.test(await seatAt(p, 10) ?? '') && (await seatAt(p, 8) ?? '').includes('free'), 'je change de place : la table de lecture, le fauteuil se libère')
  // Siège d'un ami : sa bibliothèque
  await p.evaluate(() => document.querySelector('.room-seat.taken:not(.mine)').click()); await sleep(500)
  ok(await p.evaluate(() => /Bibliothèque de Inès|Inès/.test(document.querySelector('dialog[open]')?.innerText ?? '')), 'toucher la place d’Inès ouvre sa bibliothèque')
  await p.keyboard.press('Escape'); await sleep(300)
  // Se lever
  await p.evaluate(() => document.querySelector('.room-seat.mine').click()); await sleep(500)
  ok(await p.$('.room-seat.mine') === null && /Choisis ta place/.test(await legend(p)), 'toucher ma place : je me lève')
  // Se rasseoir pour la lecture
  await p.evaluate(() => [...document.querySelectorAll('.room-seat.free')].find((b) => /fauteuil près de l’étagère/.test(b.getAttribute('aria-label'))).click()); await sleep(500)

  // Lire avec le cercle : la pièce en petit, ma lampe allumée
  await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Lire avec le cercle/.test(b.textContent)).click()); await sleep(1500)
  ok(await p.$('#scene .room.compact') !== null, 'pendant la lecture en cercle : la pièce en petit')
  const lit = await p.$$eval('#scene .room-seat.reading', (l) => l.map((e) => e.getAttribute('aria-label')))
  ok(lit.length === 2 && lit.some((l) => /^Toi/.test(l)) && lit.some((l) => /^Inès/.test(l)), 'ma lampe et celle d’Inès sont allumées : ' + lit.join(' | '))
  ok(await p.$$eval('#scene .room-seat.free', (l) => l.length) === 0, 'en lecture, pas de bouton de place libre')
  ok(/Inès lit en même temps que toi/.test(await p.$eval('#scene', (e) => e.innerText)), 'texte : « Inès lit en même temps que toi »')
  await p.screenshot({ path: '/tmp/shots8/lecture.png' })
  // Sous la scène, la page du cercle voit aussi ma lampe
  ok(await p.evaluate(() => !!document.querySelector('.room:not(.compact) .room-seat.mine.reading')), 'sur la page du cercle, ma place est aussi allumée')
  await p.evaluate(() => [...document.querySelectorAll('#scene button')].find((b) => /Quitter sans enregistrer/.test(b.textContent)).click()); await sleep(600)
  ok(await p.evaluate(() => !document.querySelector('.room-seat.mine.reading') && !!document.querySelector('.room-seat.mine')), 'lecture quittée : ma lampe s’éteint, je reste assis')
  await p.close()

  // Personne ne lit ; téléphone en mode sombre
  p = await open([], 390, 844, true)
  ok(/Personne ne lit en ce moment/.test(await legend(p)), 'personne ne lit : la légende invite à lancer la lecture')
  ok(await p.$$eval('.room-seat.reading', (l) => l.length) === 0, 'aucune lampe allumée')
  const sz = await p.$eval('.room-seat.taken .avatar', (e) => e.getBoundingClientRect().width)
  ok(sz >= 21, `téléphone : avatars lisibles (${Math.round(sz)} px)`)
  await p.$eval('.room', (e) => e.scrollIntoView())
  await p.screenshot({ path: '/tmp/shots8/tel.png' })
  await p.close()
} catch (e) { out.push('ERREUR ' + e.stack) }
await browser.close()
console.log(out.join('\n'))
console.log(errors.length ? 'Erreurs JS :\n' + errors.join('\n') : 'Aucune erreur JS')
