import puppeteer from 'puppeteer-core'
const gb = (title, authors, o) => ({ id: title + JSON.stringify(o), volumeInfo: { title, authors, language: 'fr', ...o } })
const GOOGLE = { items: [
  gb('Cornes', ['Joe Hill'], { publisher: 'Le Livre de Poche', publishedDate: '2012-05-01', pageCount: 480, industryIdentifiers: [{ type: 'ISBN_13', identifier: '9782253169222' }] }),
  gb('Cornes', ['Joe Hill'], { publisher: 'Fayard', publishedDate: '2010-02-03', pageCount: 460, industryIdentifiers: [{ type: 'ISBN_13', identifier: '9782213645117' }] }),
  gb('Sept lettres', ['Olivia Harvard'], { publisher: 'Pocket', publishedDate: '2021', pageCount: 352 }),
] }
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] })
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
const errs = []; p.on('pageerror', e => errs.push(e.message))
await p.setRequestInterception(true)
p.on('request', r => {
  const u = r.url()
  if (/googleapis\.com\/books/.test(u)) return r.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(GOOGLE) })
  if (/openlibrary\.org/.test(u)) return r.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ docs: [{ key: '/works/OL1W', title: 'Cornes', author_name: ['Joe Hill'], first_publish_year: 2010, edition_count: 12 }] }) })
  return /localhost/.test(u) ? r.continue() : r.abort()
})
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
await p.goto('http://localhost:4173/#bibliotheque', { waitUntil: 'networkidle0' }); await sleep(400)
for (const x of await p.$$('button')) { if (/Ajouter/.test(await x.evaluate(e => e.textContent))) { await x.click(); break } }
await sleep(300)
await p.type('dialog input[type=search]', '7 lettres d’Olivia Harvard'); await sleep(900)
console.log('résultats pour "7 lettres…":', await p.$$eval('dialog .hit', hs => hs.map(h => h.innerText.replace(/\n/g, ' | '))))
await p.$eval('dialog input[type=search]', e => { e.focus(); e.select() }); await p.keyboard.press('Backspace'); await p.type('dialog input[type=search]', 'cornes joe hill'); await sleep(900)
console.log('résultats pour "cornes…":', await p.$$eval('dialog .hit', hs => hs.map(h => h.innerText.replace(/\n/g, ' | '))))
await p.screenshot({ path: '/tmp/shots/20-search.png' })
await (await p.$('dialog .hit')).click(); await sleep(300)
console.log('fiche:', await p.$eval('dialog form', f => f.innerText.replace(/\n+/g, ' | ').slice(0, 400)))
console.log('pages préremplies:', await p.$$eval('dialog input[type=number]', i => i[0].value))
const btns = await p.$$('dialog button'); for (const x of btns) if (/autres éditions/.test(await x.evaluate(e => e.textContent))) { await x.click(); break }
await sleep(700)
console.log('éditions:', await p.$$eval('dialog .ed', es => es.map(e => e.innerText.replace(/\n/g, ' '))))
await p.screenshot({ path: '/tmp/shots/21-editions.png' })
console.log('Erreurs JS:', errs.length ? errs : 'aucune')
await b.close()
