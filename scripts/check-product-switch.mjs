/**
 * ===========================================================================
 *  OPENING ONE PRODUCT PAGE AFTER ANOTHER IN THE BUILDER
 * ===========================================================================
 * "Sometimes when switching between product pages it does not work: it
 * still shows the old one, or on the page of one product it shows another."
 *
 * The real editor (scripts/editor-probe-harness.mjs) at 1280 x 800, three
 * products, two of them with the same name:
 *
 *   ONE AFTER ANOTHER  product A (its answer held back 1.5s), then product
 *             B as soon as the page menu can be used again: the canvas and
 *             the page pill show B, and nothing of A
 *   SAME NAME the other product with A's name is opened: the canvas shows
 *             that product (its own price), not the first one with the name
 *   BACK      a plain page opened after a product: no product is left on it
 *
 *   node scripts/check-product-switch.mjs
 */
import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { bundle, css } from "./editor-probe-harness.mjs"
import { interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const PRODUCTS = [
  { id: "prod-1", title: "Linen shirt", slug: "linen-shirt", price_cents: 1200, compare_at_cents: null, thumbnail_url: "", gallery_urls: [], description: "First", whats_included: [] },
  { id: "prod-2", title: "Linen shirt", slug: "linen-shirt-2", price_cents: 3400, compare_at_cents: null, thumbnail_url: "", gallery_urls: [], description: "Second", whats_included: [] },
  { id: "prod-3", title: "Wool scarf", slug: "wool-scarf", price_cents: 5600, compare_at_cents: null, thumbnail_url: "", gallery_urls: [], description: "Third", whats_included: [] },
]
const js = readFileSync(bundle)
const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${interFaces()}</style><style>${css}</style></head><body><div id="app"></div>
<script>
  window.PROBE_SHORT = true
  window.PROBE_PAGES = { product: ["header", "product", "footer"], about: ["header", "text_rich", "footer"] }
  window.PROBE_PAGE_DELAY_MS = 0
  window.PROBE_PRODUCTS = ${JSON.stringify(PRODUCTS)}
  window.PROBE_PRODUCT_DELAY_MS = { "prod-1": 1500 }
</script>
<script src="/editor-probe.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url.startsWith("/editor-probe.js")) {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(js)
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(req.url.startsWith("/editor") ? page : "<!doctype html><title>blank</title>")
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage"] })

let bad = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) bad++
}

try {
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e.message || e)))
  await p.setViewport({ width: 1280, height: 800 })
  await p.goto(`${origin}/editor`, { waitUntil: "load" })
  await p.waitForFunction(() => document.querySelectorAll("#wb-preview-root [data-section-box]").length >= 2, { timeout: 60_000 })
  await sleep(600)

  /* Opens the page menu and presses one row; the products group is unfolded first when it is folded. */
  const open = async (row) => {
    /* The menu is held while a page is loading, as a person finds it. */
    await p.waitForFunction(() => !document.querySelector("[data-page-switcher]")?.closest("[disabled]") && !document.querySelector("[data-page-switcher][disabled]"), { timeout: 10_000 })
    /* The last menu has finished closing. */
    await p.waitForFunction(() => !document.querySelector(".wb-pages-menu"), { timeout: 5000 }).catch(() => {})
    const at = await p.evaluate(() => { const r = document.querySelector("[data-page-switcher]").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
    await p.mouse.click(at.x, at.y)
    await p.waitForFunction(() => !!document.querySelector(".wb-pages-menu"), { timeout: 5000 }).catch(async () => {
      if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/switch-nomenu.png` })
      console.log("no menu", at, await p.evaluate(() => document.querySelector("[data-page-switcher]")?.outerHTML.slice(0, 300)))
    })
    await sleep(250)
    if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/switch-menu-${row.replace(":", "-")}.png` })
    await p.evaluate((row) => {
      const menu = document.querySelector(".wb-pages-menu")
      if (!menu) return
      if (row.startsWith("product:") && !menu.querySelector(`[data-page-row='${row}']`)) menu.querySelector("[data-page-group-toggle='products']")?.click()
    }, row)
    await p.waitForFunction((row) => !!document.querySelector(`.wb-pages-menu [data-page-row='${row}']`), { timeout: 8000 }, row).catch(async () => { console.log("rows:", await p.evaluate(() => [...document.querySelectorAll(".wb-pages-menu [data-page-row], .wb-pages-menu [data-page-group-toggle]")].map((r) => r.getAttribute("data-page-row") ?? `toggle:${r.getAttribute("data-page-group-toggle")}`))); throw new Error(`no row ${row}`) })
    await sleep(300)
    await p.evaluate((row) => { const el = document.querySelector(`.wb-pages-menu [data-page-row='${row}']`); (el.matches("button, a") ? el : el.querySelector("button, a") ?? el).click() }, row)
  }
  const shown = () => p.evaluate(() => ({
    canvas: document.getElementById("wb-preview-root")?.innerText ?? "",
    pill: document.querySelector("[data-page-switcher]")?.textContent?.trim() ?? "",
  }))

  /* ONE AFTER ANOTHER: A held back, then B. */
  await open("product:prod-1")
  if (process.env.DEBUG) { await sleep(2500); console.log("after A:", JSON.stringify(await shown()).slice(0, 300), await p.evaluate(() => window.probeCalls.filter((c) => /products|sections/.test(c)).slice(-6))) }
  await sleep(150)
  await open("product:prod-3")
  await sleep(1500)
  const race = await shown()
  expect(race.canvas.includes("Wool scarf") && !race.canvas.includes("Linen shirt"), "the product opened last is the one drawn, with nothing of the one before", race.canvas.slice(0, 200).replace(/\s+/g, " "))
  expect(/Wool scarf/.test(race.pill), "and the page pill names it", race.pill)

  /* SAME NAME: the second Linen shirt, by its own price. */
  await p.evaluate(() => { window.PROBE_PRODUCT_DELAY_MS = {} })
  await open("product:prod-2")
  await sleep(1200)
  const twin = await shown()
  expect(twin.canvas.includes("Linen shirt") && twin.canvas.includes("34") && !twin.canvas.includes("$12"), "a product that shares its name with another draws itself, not the other", twin.canvas.slice(0, 240).replace(/\s+/g, " "))

  /* BACK: a product, then a plain page. */
  await open("product:prod-1")
  await sleep(150)
  await open("about")
  await sleep(1500)
  const back = await shown()
  expect(!back.canvas.includes("Linen shirt") && !/Linen shirt/.test(back.pill), "a page opened after a product has no product left on it", { pill: back.pill, canvas: back.canvas.slice(0, 160).replace(/\s+/g, " ") })
  expect(errors.length === 0, "no script error", errors.slice(0, 3))
} finally {
  await browser.close()
  server.close()
}
console.log(bad ? `\n${bad} failed` : "\nall passed")
process.exit(bad ? 1 : 0)
