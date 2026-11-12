/**
 * THE THEME CARDS FOR TWO ACCOUNTS, PHOTOGRAPHED (round AT).
 *
 * The Design tab's Theme page in the real editor (scripts/onepage-probe-server.mjs)
 * for a brand new account (a name, no photo, no blocks: the monogram and
 * the samples) and for a filled one (a photo, links with thumbnails, a
 * product with its picture and price, a newsletter), at 390 (touch) and
 * 1440. Each grid whole, and a close look at a few cards.
 *
 *   SHOTS=/some/dir node scripts/shot-onepage-theme-cards-at1.mjs
 */
import { existsSync, mkdirSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const shots = process.env.SHOTS || mkdtempSync(join(tmpdir(), "storelib-theme-cards-at1-"))
mkdirSync(shots, { recursive: true })
const CLOSE = (process.env.CLOSE || "stoicism,dune,neon,gallery,blocks,midnight").split(",")
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* Abstract pictures only: no person, no brand. */
const pic = (a, b, shape) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/>${shape}</svg>`)}`
const FILLED = {
  title: "Mara Okafor",
  avatar: pic("#c9b8a6", "#6d5a4b", `<circle cx="100" cy="86" r="38" fill="#efe6da"/><rect x="40" y="132" width="120" height="80" rx="60" fill="#efe6da"/>`),
  blocks: [
    { id: "l1", type: "link_button", enabled: true, sort_order: 0, data: { label: "Studio visits", url: "https://example.com/v", thumbnail_url: pic("#e9c46a", "#e76f51", `<circle cx="100" cy="100" r="46" fill="#fff" fill-opacity=".5"/>`) } },
    { id: "l2", type: "link_button", enabled: true, sort_order: 1, data: { label: "Glaze notebook", url: "https://example.com/n" } },
    { id: "p1", type: "product", enabled: true, sort_order: 2, data: { product_id: "p1", product_title: "Moon jar", product_price_cents: 12000, product_thumbnail: pic("#264653", "#2a9d8f", `<ellipse cx="100" cy="110" rx="52" ry="60" fill="#f4f1de"/>`), cta_text: "Order", show_price: true } },
    { id: "e1", type: "email_capture", enabled: true, sort_order: 3, data: { headline: "Kiln notes", description: "When the kiln opens.", placeholder: "Email", button_preset: "join" } },
  ],
}
const NEW = { title: "Mara Okafor", avatar: null, blocks: [] }

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
for (const [name, acc] of [["new", NEW], ["filled", FILLED]]) {
  const { base, server } = await serveEditorProbe({ blocks: acc.blocks, fail })
  for (const width of [390, 1440]) {
    const phone = width < 600
    const p = await browser.newPage()
    await p.evaluateOnNewDocument((a) => { window.PROBE_TITLE = a.title; window.PROBE_AVATAR = a.avatar }, acc)
    await p.setViewport({ width, height: phone ? 844 : 900, deviceScaleFactor: 2, isMobile: phone, hasTouch: phone })
    await p.goto(`${base}/app/onepage#design`)
    await p.waitForSelector('[data-nav-row="theme"]', { timeout: 60000 })
    await sleep(600)
    if (phone) await p.tap('[data-nav-row="theme"]')
    else await p.click('[data-nav-row="theme"]')
    await p.waitForSelector("[data-theme-card] [data-tp-label]", { timeout: 30000 })
    await sleep(1500)
    const grid = await p.$("[data-theme-grid]")
    const tall = await grid.evaluate((e) => Math.ceil(e.getBoundingClientRect().height) + 400)
    await p.setViewport({ width, height: tall, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone })
    await sleep(1200)
    await grid.screenshot({ path: join(shots, `cards-${name}-${width}.png`) })
    if (phone) {
      for (const id of CLOSE) {
        const card = await p.$(`[data-theme-card="${id}"]`)
        if (card) await card.screenshot({ path: join(shots, `card-${name}-${id}.png`) })
      }
    }
    await p.close()
  }
  server.close()
}
await browser.close()
console.log(`Pictures in ${shots}`)
