/* Parcours de la v2 sur le faux Supabase (MOCK=1) : grand écran, étagères, recherche, couvertures, boutique, discussion. */
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
const URL = 'http://localhost:4173/'
mkdirSync('/tmp/shots2', { recursive: true })
const out = []
const ok = (c, m) => out.push((c ? 'OK   ' : 'ECHEC ') + m)
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource|net::/.test(m.text())) errors.push('console: ' + m.text()) })
await page.setRequestInterception(true)
page.on('request', (r) => (/^(https?:\/\/(localhost|127\.0\.0\.1)|data:)/.test(r.url()) ? r.continue() : r.abort()))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const txt = () => page.evaluate(() => document.body.innerText)
const clickText = async (sel, text) => {
  const h = await page.evaluateHandle((sel, text) => [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().startsWith(text)) ?? null, sel, text)
  const el = h.asElement(); if (!el) throw new Error('introuvable: ' + sel + ' ' + text); await el.click()
}

try {
// ---- grand écran
await page.setViewport({ width: 1920, height: 1080 })
await page.goto(URL, { waitUntil: 'networkidle0' }); await sleep(600)
const lay = await page.evaluate(() => {
  const m = document.querySelector('main').getBoundingClientRect()
  const d = document.querySelector('.dock')?.getBoundingClientRect()
  return { mainL: m.left, mainR: m.right, mainW: m.width, dock: d ? d.width : 0, vw: innerWidth }
})
ok(lay.dock > 300, `grand écran : la discussion est fixée à droite (${Math.round(lay.dock)} px)`)
ok(lay.mainW > 1100, `grand écran : le contenu s’élargit (${Math.round(lay.mainW)} px)`)
await page.screenshot({ path: '/tmp/shots2/01-accueil-1920.png' })
let t = await txt()
ok(t.includes('Session ce soir 21h'), 'la discussion du cercle est visible depuis l’accueil')
ok(/Boutique/.test(t), 'accès à la boutique depuis l’accueil')

// ---- bibliothèque : planches et pile repliée
await page.goto(URL + '#bibliotheque'); await sleep(700)
const fini = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.shelf[data-drop="fini"]')]
  const overflow = rows.some((r) => r.scrollWidth > r.clientWidth + 2)
  return { rows: rows.length, overflow, more: document.querySelector('.shelf[data-drop="fini"] .more-pile')?.textContent ?? '' }
})
ok(fini.rows >= 2, `« Terminés » s’étale sur ${fini.rows} planches`)
ok(!fini.overflow, 'aucune planche ne déborde (plus de défilement horizontal)')
ok(/\+\d+/.test(fini.more), `la suite est repliée en pile (${fini.more})`)
await page.screenshot({ path: '/tmp/shots2/02-bibliotheque.png', fullPage: true })
await page.click('.shelf[data-drop="fini"] .more-pile'); await sleep(300)
const afterOpen = await page.evaluate(() => document.querySelectorAll('.shelf[data-drop="fini"]').length)
ok(afterOpen > fini.rows, `déplier montre toutes les planches (${afterOpen})`)
await page.select('select[aria-label="Filtrer par genre"]', 'Polar'); await sleep(300)
const polar = await page.evaluate(() => document.querySelectorAll('.spine').length)
ok(polar > 0 && polar < 33, `filtre par genre (${polar} livres Polar)`)
await page.select('select[aria-label="Filtrer par genre"]', '')

// ---- recherche tolérante (réponse BnF simulée)
await clickText('button', 'Ajouter un livre'); await sleep(300)
await page.type('input[aria-label="Chercher un livre"]', 'Corne joe hill'); await sleep(1500)
t = await txt()
ok(t.includes('Cornes') && t.includes('Joe Hill'), 'la recherche « Corne joe hill » trouve « Cornes »')
ok(/J'ai lu|Poche/.test(t), 'l’édition de poche est mise en avant')
await page.screenshot({ path: '/tmp/shots2/03-recherche.png' })
await clickText('.hit', 'Cornes'); await sleep(300)
await clickText('button', 'Choisir mon édition'); await sleep(800)
const eds = await page.evaluate(() => document.querySelectorAll('.ed.with-cover').length)
ok(eds >= 2, `liste des éditions avec vignette (${eds})`)
await clickText('button', 'Tous les genres'); await sleep(200)
const fams = await page.evaluate(() => document.querySelectorAll('.genre-families .chip').length)
ok(fams === 34, `34 genres proposés (${fams})`)
await clickText('.genre-families .chip', 'Horreur'); await clickText('.genre-families .chip', 'Thriller')
await page.screenshot({ path: '/tmp/shots2/04-ajout.png' })
await clickText('dialog form button.btn.primary', 'Ajouter'); await sleep(1000)
t = await txt()
ok(t.includes('Cornes') && /ajouté/.test(t), 'Cornes ajouté')

// ---- couverture
await page.evaluate(() => [...document.querySelectorAll('.spine')].find((s) => s.title === 'Cornes')?.click()); await sleep(500)
out.push('  (spines Cornes: ' + await page.evaluate(() => [...document.querySelectorAll('.spine')].filter((s) => s.title === 'Cornes').length) + ')')
await clickText('button', 'Changer la couverture'); await sleep(700)
t = await txt()
ok(t.includes('Importer une image'), 'choix de couverture : import possible')
const inp = await page.$('dialog input[type=file]')
// une image PNG générée à la volée
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACgAAAA8CAIAAACb22+3AAAAOElEQVR4nO3NQQkAAAgEsMvk2/4YyxgiDPZfputExGKxWCwWi8VisVgsFovFYrFYLBaLxWLxp3gBwZRa5rFq95AAAAAASUVORK5CYII=', 'base64')
const fs = await import('node:fs'); fs.writeFileSync('/tmp/cover.png', png)
await inp.uploadFile('/tmp/cover.png'); await sleep(1200)
t = await txt()
ok(t.includes('Revenir à la couverture d’origine') || /couverture de ce livre/.test(t), 'image importée comme couverture, avec retour à l’origine possible')
await page.screenshot({ path: '/tmp/shots2/05-couverture.png' })
await page.keyboard.press('Escape'); await sleep(300)

// ---- boutique
await page.goto(URL + '#boutique'); await sleep(500)
t = await txt()
ok(t.includes('Bois des étagères') && t.includes('Ambiance de lecture'), 'boutique affichée')
await page.evaluate(() => { const it = [...document.querySelectorAll('.shop-item')].find((x) => x.textContent.includes('Noyer')); [...it.querySelectorAll('button')].find((b) => b.textContent === 'Acheter').click() }); await sleep(200)
await clickText('button', 'Confirmer'); await sleep(600)
const plank = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--plank').trim())
ok(plank.toLowerCase() === '#6b4428', `achat + utilisation du noyer (--plank = ${plank})`)
await page.screenshot({ path: '/tmp/shots2/06-boutique.png', fullPage: true })

// ---- découvrir
await page.goto(URL + '#decouvrir'); await sleep(600)
t = await txt()
ok(!t.includes('moins de 200 pages'), 'la section « moins de 200 pages » a disparu')
ok(t.indexOf('Dans tes goûts') < t.indexOf('Du moment'), '« Dans tes goûts » vient en premier')

// ---- profil
await page.goto(URL + '#profil'); await sleep(400)
const opts = await page.evaluate(() => [...document.querySelectorAll('select')].find((s) => s.textContent.includes('minutes'))?.textContent ?? '')
ok(opts.includes('2 h') && opts.includes('1 h 30'), 'rituel jusqu’à 2 h')
ok((await txt()).includes('Ajouter une photo'), 'photo de profil proposée')

// ---- téléphone : bulle de discussion, et discussion pendant la lecture
await page.setViewport({ width: 400, height: 860, isMobile: true, hasTouch: true })
await page.goto(URL, { waitUntil: 'networkidle0' }); await sleep(500)
ok(!!(await page.$('.chat-fab')), 'téléphone : bulle de discussion')
await page.click('.chat-fab'); await sleep(400)
ok((await txt()).includes('Session ce soir 21h'), 'la bulle ouvre la discussion')
await page.screenshot({ path: '/tmp/shots2/07-bulle.png' })
await page.keyboard.press('Escape'); await sleep(300)
await clickText('button', 'Lire 10 minutes'); await sleep(600)
await page.click('.scene-chat-btn'); await sleep(400)
await page.type('.scene-chat input', 'Je lis aussi !'); await page.keyboard.press('Enter'); await sleep(500)
t = await txt()
ok(t.includes('Je lis aussi !') && /\d\d:\d\d/.test(t), 'message envoyé depuis la lecture, chrono toujours là')
await page.screenshot({ path: '/tmp/shots2/08-lecture-chat.png' })

} catch (e) { out.push('ARRÊT ' + e.message); await page.screenshot({ path: '/tmp/shots2/zz-arret.png' }) }
ok(!errors.length, 'aucune erreur JS' + (errors.length ? ' : ' + errors.slice(0, 3).join(' | ') : ''))
console.log(out.join('\n'))
await browser.close()
