/* Jour d'une lecture commencée avant minuit et finie après (faux Supabase, MOCK=1).
   Horloge truquée : la page démarre le 26/11/2026 à 23 h 45 (heure locale), window.__advance(ms) fait avancer le temps.
   Lancer : MOCK=1 npx vite build && npx vite preview --port 4173, puis node dev/e2e9.mjs */
import puppeteer from 'puppeteer-core'
const URL = 'http://localhost:4173/'
const out = [], errors = []
const ok = (c, m) => out.push((c ? 'OK   ' : 'ECHEC ') + m)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] })
async function run(startH, startM, advanceMin) {
  const page = await browser.newPage()
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  await page.setRequestInterception(true)
  page.on('request', (r) => (/^(https?:\/\/(localhost|127\.0\.0\.1)|data:)/.test(r.url()) ? r.continue() : r.abort()))
  await page.evaluateOnNewDocument((h, m) => {
    localStorage.clear(); localStorage.setItem('pagaille.onboarded.u-me', '1')
    const Real = Date
    let off = new Real(2026, 10, 26, h, m, 0).getTime() - Real.now()
    class FakeDate extends Real {
      constructor(...a) { if (a.length === 0) super(Real.now() + off); else super(...a) }
      static now() { return Real.now() + off }
    }
    window.Date = FakeDate
    window.__advance = (ms) => { off += ms }
  }, startH, startM)
  await page.setViewport({ width: 1280, height: 1000 })
  await page.goto(URL + '#aujourdhui', { waitUntil: 'networkidle0' }); await sleep(700)
  const before = await page.evaluate(() => window.__mockdb.reading_sessions.length)
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /^Lire \d/.test(b.textContent)).click()); await sleep(500)
  await page.evaluate((n) => window.__advance(n * 60000), advanceMin); await sleep(1200)
  await page.evaluate(() => [...document.querySelectorAll('#scene button')].find((b) => /J’ai fini de lire/.test(b.textContent)).click()); await sleep(300)
  await page.evaluate(() => [...document.querySelectorAll('#scene button')].find((b) => /Enregistrer ma lecture/.test(b.textContent)).click()); await sleep(1200)
  const r = await page.evaluate((n) => {
    const s = window.__mockdb.reading_sessions.slice(n)
    return { added: s.length, day: s[0]?.day, minutes: s[0]?.minutes, ritual: window.__mockdb.signet_ledger.filter((x) => String(x.key).startsWith('ritual:')).map((x) => x.key), now: new Date().toString().slice(0, 21) }
  }, before)
  await page.close()
  return r
}
try {
  let r = await run(23, 45, 35)
  ok(r.added === 1 && r.day === '2026-11-26', `départ 23 h 45, fin 0 h 20 (${r.now}) : lecture comptée le ${r.day}, ${r.minutes} min`)
  ok(r.ritual.includes('ritual:2026-11-26') && !r.ritual.includes('ritual:2026-11-27'), 'rituel du jour payé pour le 26, pas pour le 27 : ' + r.ritual.join(', '))
  r = await run(21, 0, 20)
  ok(r.added === 1 && r.day === '2026-11-26', `départ 21 h, fin 21 h 20 : lecture comptée le ${r.day}`)
} catch (e) { out.push('ERREUR ' + e.stack) }
await browser.close()
console.log(out.join('\n'))
console.log(errors.length ? 'Erreurs JS :\n' + errors.join('\n') : 'Aucune erreur JS')
