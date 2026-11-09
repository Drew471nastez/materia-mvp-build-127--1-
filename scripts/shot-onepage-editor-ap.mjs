/**
 * Round AP's editor pictures, for a look against CLAUDE.md, and the numbers
 * behind them: the real editor (scripts/render-onepage-editor.tsx) at 390 and
 * 1440 with a page of the blocks this round touched.
 *
 *   rows         the blocks list: each row's tile is its Add block entry's
 *                glyph and colours (data-row-tile), a booking row wears
 *                Calendly's mark; at 1440 under a mouse the row's bin shows
 *   shelf        the digital products shelf open: Products, All / Choose / One,
 *                and the creator's products to pick from
 *   seo          Settings › SEO: the shared link card's width (at most 380)
 *                and its picture at 1200:630
 *
 *   SHOTS=<dir> node scripts/shot-onepage-editor-ap.mjs
 */
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const shots = process.env.SHOTS || "/tmp/onepage-ap-shots"
mkdirSync(shots, { recursive: true })
const CHROMIUM = process.env.CHROMIUM || ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p))
const pic = (n, w = 400, h = 500) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="hsl(${n * 53},55%,55%)"/></svg>`)}`
const uuid = (n) => `6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c${String(n).padStart(2, "0")}`
const PRODUCTS = Array.from({ length: 5 }, (_, i) => ({ id: uuid(i), title: ["Strength Blueprint", "Meal plan PDF", "Mobility course", "Home workout guide", "Macro calculator"][i], price_cents: 900 + i * 400, thumbnail_url: pic(i + 1), type: "digital", status: i === 4 ? "draft" : "published", archived: false, slug: `p${i}` }))
let order = 0
const b = (id, type, data) => ({ id, type, enabled: true, sort_order: order++, data })
const BLOCKS = [
  b("l1", "link_button", { label: "Vreau să lucrăm împreună", url: "https://wa.me/40751048522" }),
  b("cal", "calendly", { title: "Antrenamente 1:1", calendly_url: "https://calendly.com/radu/30min" }),
  b("shelf", "storelib_shelf", { source: "digital", pick: "some", product_ids: [uuid(2), uuid(0)] }),
  b("shelfc", "storelib_shelf", { source: "course" }),
  b("d", "divider", {}),
  b("g", "group", { title: "Group", layout: "carousel", children: [b("g1", "link_button", { label: "Plan", url: "https://example.com/p" })] }),
  b("f", "followers", { networks: [] }),
  b("e", "email_capture", { headline: "Weekly notes" }),
]

const { base, server } = await serveEditorProbe()
/* A computer that hovers (Blink's own hover settings), so the row's bin shows under the mouse; the phone is a touch screen. */
const HOVER = "--blink-settings=availableHoverTypes=2,primaryHoverType=2,availablePointerTypes=4,primaryPointerType=4"
/* At the window's own size: setViewport would reset the hover settings. */
const desk = await puppeteer.launch({ executablePath: CHROMIUM, defaultViewport: null, args: ["--no-sandbox", "--disable-gpu", "--window-size=1440,1000", "--hide-scrollbars", HOVER] })
const touch = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const out = {}
try {
  for (const [tag, vp] of [["1440", { width: 1440, height: 1000 }], ["390", { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
    const p = await (tag === "1440" ? desk : touch).newPage()
    if (tag === "390") await p.setViewport({ deviceScaleFactor: 1, ...vp })
    await p.evaluateOnNewDocument((blocks, products) => { window.PROBE_BLOCKS = blocks; window.PROBE_PRODUCTS = products }, BLOCKS, PRODUCTS)
    await p.goto(`${base}/app/onepage#links`)
    await p.waitForSelector("[data-scroll-container]")
    await sleep(1500)
    if (tag === "390") out["390 bin"] = await p.evaluate(() => [...document.querySelectorAll("[data-block-quick-remove]")].map((b) => getComputedStyle(b).display).join(","))
    out[`${tag} tiles`] = await p.evaluate(() => [...document.querySelectorAll("[data-block-open]")].map((t) => {
      const row = t.parentElement
      const tile = row.querySelector("[data-row-tile]")
      return `${t.querySelector("p")?.textContent?.trim()}: ${tile ? getComputedStyle(tile).backgroundColor : row.querySelector("[data-mark]")?.getAttribute("data-mark") ?? "grey"}`
    }))
    const list = await p.$("[data-block-open]")
    await list.evaluate((el) => el.closest("[data-reorder-zone]")?.parentElement?.parentElement?.scrollIntoView({ block: "start" }))
    await sleep(300)
    await p.screenshot({ path: join(shots, `editor-rows-${tag}.png`) })
    if (tag === "1440") {
      /* A mouse over the booking row: its bin shows. */
      const row = await p.evaluateHandle(() => [...document.querySelectorAll("[data-block-open]")].find((t) => t.textContent.includes("Antrenamente")).parentElement)
      const box = await row.boundingBox()
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await sleep(300)
      out["1440 bin on hover"] = await row.evaluate((r) => { const bin = r.querySelector("[data-block-quick-remove]"); const cs = getComputedStyle(bin); return { display: cs.display, opacity: cs.opacity } })
      out["1440 bin elsewhere"] = await p.evaluate(() => { const bins = [...document.querySelectorAll("[data-block-quick-remove]")]; return bins.map((b) => getComputedStyle(b).opacity).join(",") })
      await p.screenshot({ path: join(shots, `editor-row-hover-1440.png`), clip: { x: Math.max(0, box.x - 20), y: box.y - 20, width: box.width + 40, height: box.height + 40 } })
    }
    /* The shelf, open. */
    await p.evaluate(() => [...document.querySelectorAll("[data-block-open]")].find((t) => t.textContent.includes("Digital products"))?.click())
    await sleep(900)
    const pick = await p.$("[data-shelf-pick]")
    if (pick) {
      await pick.evaluate((el) => el.scrollIntoView({ block: "center" }))
      await sleep(300)
      out[`${tag} shelf`] = await p.evaluate(() => ({ mode: document.querySelector("[data-shelf-pick]").getAttribute("data-shelf-pick"), listed: document.querySelectorAll("[data-shelf-pick-item]").length, chosen: [...document.querySelectorAll("[data-shelf-pick-item][aria-checked=true]")].map((e) => e.textContent.trim()) }))
      await p.screenshot({ path: join(shots, `editor-shelf-pick-${tag}.png`) })
    } else out[`${tag} shelf`] = "no pick control found"
    /* Settings › SEO. */
    await p.goto(`${base}/app/onepage#settings`)
    await p.waitForSelector("[data-scroll-container]")
    await sleep(1200)
    await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "SEO" && x.getClientRects().length)?.click())
    await sleep(900)
    const card = await p.$("[data-og-card]")
    if (card) {
      await card.evaluate((el) => el.scrollIntoView({ block: "center" }))
      await sleep(300)
      out[`${tag} share card`] = await card.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const img = el.querySelector("[data-og-generated], [data-og-crop]")
        const ir = img?.getBoundingClientRect()
        return { width: Math.round(r.width), height: Math.round(r.height), image: ir ? `${Math.round(ir.width)}x${Math.round(ir.height)} (${(ir.width / ir.height).toFixed(3)})` : null, column: Math.round(el.parentElement.getBoundingClientRect().width) }
      })
      await p.screenshot({ path: join(shots, `seo-share-card-${tag}.png`) })
    } else out[`${tag} share card`] = "not found"
    await p.close()
  }
} finally {
  await desk.close()
  await touch.close()
  server.close()
}
console.log(JSON.stringify(out, null, 1))
