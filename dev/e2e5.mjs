/* Série en semaines + mission finale, sur le faux Supabase (MOCK=1).
   mock.streak ajoute N semaines tenues avant la semaine en cours. */
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
const URL = 'http://localhost:4173/'
mkdirSync('/tmp/shots5', { recursive: true })
const out = [], errors = []
const ok = (c, m) => out.push((c ? 'OK   ' : 'ECHEC ') + m)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] })
async function open(streak, w = 1280, h = 1000) {
  const page = await browser.newPage()
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  await page.setRequestInterception(true)
  page.on('request', (r) => (/^(https?:\/\/(localhost|127\.0\.0\.1)|data:)/.test(r.url()) ? r.continue() : r.abort()))
  await page.evaluateOnNewDocument((n) => { localStorage.setItem('mock.streak', String(n)); localStorage.setItem('pagaille.onboarded.u-me', '1') }, streak)
  await page.setViewport({ width: w, height: h })
  await page.goto(URL + '#aujourdhui', { waitUntil: 'networkidle0' }); await sleep(800)
  return page
}
const text = (p, sel) => p.evaluate((s) => document.querySelector(s)?.innerText ?? '', sel)
try {
  // Sans semaines passées
  let p = await open(0)
  let t = await text(p, '.streak')
  ok(/^\d/.test(t), 'carte de série affichée : ' + t.replace(/\s+/g, ' ').slice(0, 140))
  const fin = await text(p, '.mission.final')
  ok(/Mission finale/i.test(fin) && /Valide les 4 missions/.test(fin), 'mission finale affichée : ' + fin.replace(/\s+/g, ' '))
  const n = await p.evaluate(() => document.querySelectorAll('.streak-weeks li').length)
  ok(n === 8, `8 dernières semaines (${n})`)
  await (await p.$('.streak')).screenshot({ path: '/tmp/shots5/serie-0.png' })
  await (await p.$('[data-perch="zone:missions"]')).screenshot({ path: '/tmp/shots5/missions.png' })
  await p.close()

  // 4 semaines passées tenues : paliers 2 et 4 à récupérer
  p = await open(4)
  t = await text(p, '.streak')
  const row = Number(t.match(/^\d+/)[0])
  ok(row >= 4, `série de ${row} semaines`)
  const btns = await p.evaluate(() => [...document.querySelectorAll('.streak button')].map((b) => b.textContent))
  ok(btns.some((b) => /Palier 2 semaines/.test(b)) && btns.some((b) => /Palier 4 semaines/.test(b)), 'paliers 2 et 4 à récupérer : ' + btns.join(' | '))
  await (await p.$('.streak')).screenshot({ path: '/tmp/shots5/serie-4.png' })
  const before = Number((await text(p, '.wallet-chip b')).replace(/\D/g, ''))
  await p.evaluate(() => [...document.querySelectorAll('.streak button')].find((b) => /Palier 2/.test(b.textContent)).click()); await sleep(600)
  const after = Number((await text(p, '.wallet-chip b')).replace(/\D/g, ''))
  ok(after - before === 50, `palier 2 : +${after - before} signets`)
  const btns2 = await p.evaluate(() => [...document.querySelectorAll('.streak button')].map((b) => b.textContent))
  ok(!btns2.some((b) => /Palier 2/.test(b)), 'palier 2 disparu après récupération')
  await p.evaluate(() => document.querySelector('.streak button').click()); await sleep(600)
  t = await text(p, '.streak')
  ok(/Prochain palier : 8 semaines/.test(t), 'ensuite : prochain palier annoncé')
  await (await p.$('.streak')).screenshot({ path: '/tmp/shots5/serie-4-apres.png' })
  await p.close()

  // Téléphone
  p = await open(2, 390, 844)
  await (await p.$('.streak')).screenshot({ path: '/tmp/shots5/serie-tel.png' })
  await p.close()
} catch (e) { out.push('ERREUR ' + e.stack) }
console.log(out.join('\n'))
console.log(errors.length ? 'Erreurs JS :\n' + errors.join('\n') : 'Aucune erreur JS')
await browser.close()
