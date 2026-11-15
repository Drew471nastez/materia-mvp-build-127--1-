/**
 * NO BLOCK ON A ONEPAGE SCROLLS UP AND DOWN BY ITSELF (round 17).
 *
 * The owner: "why do some blocks that don't need vertical scrolling scroll".
 * The live page (scripts/onepage-probe-server.mjs ?live) with carousels that
 * scroll sideways (a group's, a picture slider, a shelf), at 390 and 1440.
 * Every element on the page that the browser would let a wheel or a finger
 * scroll vertically (overflow-y auto or scroll, and taller inside than out)
 * is listed. Only a PDF's own page list may (it is a reader). And every row
 * that slides sideways computes overflow-y hidden, so it cannot become one.
 *
 *   node scripts/check-onepage-no-stray-scroll.mjs
 */
import { existsSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = 0
const check = (name, ok, detail = "") => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || !detail ? "" : `\n        ${detail}`}`); if (!ok) failed++ }

const px = (n) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="hsl(${n * 47},55%,62%)"/></svg>`)}`
const link = (id, label, extra = {}) => ({ id, type: "link_button", enabled: true, sort_order: 0, data: { label, url: `https://example.com/${id}`, ...extra } })
const blocks = [
  link("a", "First link"),
  { id: "g", type: "group", enabled: true, sort_order: 1, data: { title: "Picks", layout: "carousel", children: [link("g1", "One", { thumbnail_url: px(1) }), link("g2", "Two", { thumbnail_url: px(2) }), link("g3", "Three", { thumbnail_url: px(3) }), link("g4", "Four", { thumbnail_url: px(4) })] } },
  { id: "i", type: "image", enabled: true, sort_order: 2, data: { layout: "carousel", images: [{ image_url: px(5) }, { image_url: px(6) }, { image_url: px(7) }] } },
  ...Array.from({ length: 8 }, (_, i) => ({ ...link(`l${i}`, `Link ${i + 1}`), sort_order: 3 + i })),
]
const { base, server } = await serveEditorProbe({ blocks, fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
for (const [w, h] of [[390, 844], [1440, 900]]) {
  console.log(`\n${w}px`)
  for (const template of (process.env.THEMES || "graph,sunset,blocks,paper").split(",")) {
    const p = await browser.newPage()
    await p.setViewport({ width: w, height: h, isMobile: w < 600, hasTouch: w < 600 })
    await p.goto(`${base}/app/onepage?live&template=${template}`)
    await sleep(2200)
    const stray = await p.evaluate(() => [...document.querySelectorAll("body *")].filter((el) => {
      if (el.getClientRects().length === 0) return false
      const oy = getComputedStyle(el).overflowY
      return (oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1 && !el.closest("[data-pdf-pages]")
    }).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")} ${el.scrollHeight}>${el.clientHeight}`))
    check(`${template}: no block scrolls up and down by itself`, stray.length === 0, stray.slice(0, 4).join(" | "))
    /* A wheel cannot be tried here (the probe's document holds the window still): every sideways row is read instead. */
    const rails = await p.evaluate(() => [...document.querySelectorAll(".op-rail, [data-onepage-slides]")].filter((e) => e.getClientRects().length > 0).map((e) => getComputedStyle(e).overflowY))
    check(`${template}: every row that slides sideways (${rails.length}) cannot scroll up and down`, rails.length > 0 && rails.every((o) => o === "hidden"), rails.join())
    await p.close()
  }
}
await browser.close()
server.close()
console.log(failed ? `\n${failed} FAILED` : "\nall passed")
process.exit(failed ? 1 : 0)
