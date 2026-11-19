import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox','--disable-gpu'] })
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
await p.setRequestInterception(true); p.on('request', r => /localhost/.test(r.url()) ? r.continue() : r.abort())
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
await p.goto('http://localhost:4173/#bibliotheque', { waitUntil: 'networkidle0' }); await sleep(500)
const shelf = (k) => p.$eval(`.shelf[data-drop="${k}"]`, e => [...e.querySelectorAll('.spine')].map(s => s.title))
const sp = await p.$('.shelf[data-drop="cours"] .spine[title="Dune"]')
const a = await sp.boundingBox(); const t = await (await p.$('.shelf[data-drop="lire"]')).boundingBox()
console.log('Dune y=', Math.round(a.y), ' étagère « à lire » y=', Math.round(t.y), 'h=', Math.round(t.height), ' scrollY=', await p.evaluate(() => scrollY))
console.log('avant, à lire:', await shelf('lire'))
await p.touchscreen.touchStart(a.x + a.width / 2, a.y + 60); await sleep(480)
// 1) le doigt va vers le bas de l'écran et y reste : la page doit défiler toute seule
const x0 = a.x + a.width / 2
for (let i = 1; i <= 10; i++) { await p.touchscreen.touchMove(x0, a.y + 60 + (820 - a.y - 60) * i / 10); await sleep(25) }
for (let k = 0; k < 40; k++) {
  const y = (await (await p.$('.shelf[data-drop="lire"]')).boundingBox()).y
  if (y < 560) break
  await sleep(50)
}
console.log('scrollY après maintien en bas:', await p.evaluate(() => scrollY))
// 2) puis il se pose sur l'étagère « à lire », maintenant visible
const t2 = await (await p.$('.shelf[data-drop="lire"]')).boundingBox()
console.log('étagère « à lire » y=', Math.round(t2.y))
await p.touchscreen.touchMove(x0, Math.min(t2.y + t2.height / 2, 600)); await sleep(150)
console.log('survol étagère:', await p.$eval('.shelf.over', e => e.dataset.drop).catch(() => 'aucune'))
await p.touchscreen.touchEnd(); await sleep(700)
console.log('après, à lire:', await shelf('lire'), '| en cours:', await shelf('cours'))
console.log('toast:', await p.$eval('.toast', e => e.textContent).catch(() => 'aucun'))
await p.screenshot({ path: '/tmp/shots/16-touch.png' })
await b.close()
