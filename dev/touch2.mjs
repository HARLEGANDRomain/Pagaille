import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox','--disable-gpu'] })
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
await p.setRequestInterception(true); p.on('request', r => /localhost/.test(r.url()) ? r.continue() : r.abort())
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
await p.goto('http://localhost:4173/#bibliotheque', { waitUntil: 'networkidle0' }); await sleep(500)
await p.evaluate(() => {
  window.__log = []
  for (const t of ['pointerdown','pointermove','pointerup','pointercancel','touchstart','touchmove','touchend','touchcancel'])
    document.addEventListener(t, (e) => window.__log.push(t + (e.cancelable === false ? '(non-cancelable)' : '') + (e.pointerType ? ':' + e.pointerType : '') + (document.querySelector('.spine.ghost') ? ' [ghost]' : '')), { capture: true, passive: true })
})
const sp = await p.$('.shelf[data-drop="cours"] .spine[title="Dune"]'); await sp.evaluate(e => e.scrollIntoView({ block: 'center' }))
const a = await sp.boundingBox()
const target = await (await p.$('.shelf[data-drop="fini"]')).boundingBox()
await p.touchscreen.touchStart(a.x + a.width / 2, a.y + 60)
await p.touchscreen.touchMove(a.x + a.width / 2, a.y + 10)
await p.touchscreen.touchEnd(); await sleep(400)
window_log: await p.evaluate(() => window.__log.push('--- 2e geste ---'))
const sp2 = await p.$('.shelf[data-drop="cours"] .spine[title="Dune"]'); const a2 = await sp2.boundingBox()
console.log('Dune après swipe: y=', Math.round(a2.y), 'scrollY=', await p.evaluate(() => scrollY))
await p.touchscreen.touchStart(a2.x + a2.width / 2, a2.y + 60)
await sleep(500)
console.log('ghost après appui long (sans bouger):', !!(await p.$('.spine.ghost')))
for (let i = 1; i <= 6; i++) { await p.touchscreen.touchMove(a2.x + a2.width / 2 + 10 * i, a2.y + 60 + 20 * i); await sleep(30) }
await p.touchscreen.touchEnd(); await sleep(300)
const log = await p.evaluate(() => window.__log)
const compact = []; for (const l of log) { if (compact.length && compact[compact.length-1].l === l) compact[compact.length-1].n++; else compact.push({ l, n: 1 }) }
console.log(compact.map(c => c.l + (c.n > 1 ? ' x' + c.n : '')).join('\n'))
await b.close()
