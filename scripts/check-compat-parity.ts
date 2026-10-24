/**
 * ===========================================================================
 *  WHAT THE WEBSITE SHOWS, THE CANVAS SHOWS (round BC)
 * ===========================================================================
 * The owner: "In the editor canvas certain things are not displaying that
 * do display on the live website." The same imported theme drawn two ways
 * in Chromium at 1440x900: the website (lib/storelib-theme/compat/site.ts
 * answer(), as a visitor's browser has it) and the real editor's canvas
 * (scripts/render-editor-probe.tsx). Each page is scrolled to its foot and
 * back, so what loads as it is scrolled to has loaded, and then every
 * element a visitor can see (a box, not hidden, not see-through, checked
 * with checkVisibility) is counted by where it is (its section's type) and
 * what it is (tag and classes), and every picture by whether it loaded.
 * What the website shows more of than the canvas is listed.
 *
 *   npx tsx scripts/check-compat-parity.ts [dawn.zip | theme folder]
 *   (the Posturex fixture, tests/fixtures/shopify-posture, by default)
 *   PAGES=home,product,collection,cart,search,wishlist,account
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import JSZip from "jszip"
import puppeteer, { type Frame, type Page } from "puppeteer-core"
import { editorFor, serveLive } from "./check-builder-nav19"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const PAGES = (process.env.PAGES ?? "home,product,collection,cart,search,wishlist,account").split(",")
let missing = 0

async function zipOf(path: string): Promise<JSZip> {
  if (!statSync(path).isDirectory()) return JSZip.loadAsync(readFileSync(path))
  const zip = new JSZip()
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else zip.file(relative(path, p), readFileSync(p))
    }
  }
  walk(path)
  return zip
}

/* Every element a visitor can see, by its section's type and its tag and classes; and the pictures, loaded or not. Text, so the frame runs it as written (no helper of the bundler's). */
const READ = `(() => {
  const STATE = /^(is-|has-|js|active|loaded|lazyload|animate|scroll-trigger|visible|hidden|open|focus)/
  const out = {}
  const pics = { shown: 0, broken: 0 }
  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    if (el.closest("[data-sl-box],[data-sl-add],[data-storelib-canvas],[data-probe-link]")) continue
    if (/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|LINK|META|BR)$/.test(el.tagName)) continue
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) continue
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
    const sec = el.closest(".shopify-section")
    const type = sec ? sec.id.replace(/^shopify-section-(template--\\d+__|sections--\\d+__)?/, "").replace(/_[A-Za-z0-9]{6}$/, "").replace(/-[0-9a-f]{6,}$/, "") : "(layout)"
    const cls = Array.from(el.classList).filter((c) => !STATE.test(c)).sort().slice(0, 3).join(".")
    const key = type + " " + el.tagName.toLowerCase() + (cls ? "." + cls : "")
    out[key] = (out[key] || 0) + 1
    if (el.tagName === "IMG") { if (el.complete && el.naturalWidth > 0) pics.shown++; else pics.broken++ }
  }
  return { out, pics, height: document.documentElement.scrollHeight }
})()`
type Reading = { out: Record<string, number>; pics: { shown: number; broken: number }; height: number }

const WALK = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { scrollTo(0, y); await wait(120) }
  scrollTo(0, 0)
  await wait(1200)
})()`
async function walkDown(f: Frame | Page) {
  await f.evaluate(WALK)
}

function compare(name: string, live: Reading, canvas: Reading) {
  const rows: string[] = []
  for (const [k, n] of Object.entries(live.out)) {
    const c = canvas.out[k] ?? 0
    if (n > c) rows.push(`${String(n - c).padStart(4)} more on the website  ${k}  (website ${n}, canvas ${c})`)
  }
  const extra: string[] = []
  for (const [k, c] of Object.entries(canvas.out)) {
    const n = live.out[k] ?? 0
    if (c > n) extra.push(`${String(c - n).padStart(4)} more in the canvas   ${k}  (website ${n}, canvas ${c})`)
  }
  console.log(`\n  ${name}: website ${Object.values(live.out).reduce((a, b) => a + b, 0)} elements, ${live.pics.shown} pictures (${live.pics.broken} not loaded), ${live.height}px tall; canvas ${Object.values(canvas.out).reduce((a, b) => a + b, 0)}, ${canvas.pics.shown} (${canvas.pics.broken}), ${canvas.height}px`)
  for (const r of rows.sort().reverse().slice(0, 25)) console.log(`    ${r}`)
  for (const r of extra.sort().reverse().slice(0, 10)) console.log(`    ${r}`)
  missing += rows.length
}

async function main() {
  const arg = process.argv[2]
  const zip = arg ? await zipOf(arg) : undefined
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox", "--disable-gpu", "--force-device-scale-factor=1"] })
  const { server, base } = await serveLive(undefined, zip)
  const ed = await editorFor(browser, 1440, 900, false, undefined, zip)
  try {
    const live = await browser.newPage()
    await live.setViewport({ width: 1440, height: 900 })
    let frame = await ed.frame()
    await sleep(2500)
    const paths: Record<string, string> = { home: "/", cart: "/cart", search: "/search?q=a", wishlist: "/wishlist", account: "/account" }
    for (const name of PAGES) {
      /* A product's and a collection's address, read from the website's home page. */
      if ((name === "product" || name === "collection") && !paths[name]) {
        await live.goto(base + "/", { waitUntil: "load" })
        paths[name] = (await live.evaluate(`(() => { const a = Array.from(document.querySelectorAll("a[href]")).map((x) => x.getAttribute("href") || "").find((h) => /^\\/${name}s\\/[^/?#]+$/.test(h)); return a || "" })()`)) as string
        if (!paths[name]) { console.log(`\n  ${name}: no link to one on the home page`); continue }
      }
      const path = paths[name]
      /* One tab at a time in front: a tab behind runs no frames, so nothing that reveals as it is scrolled to would. */
      await live.bringToFront()
      await live.goto(base + path, { waitUntil: "load" }).catch(() => {})
      await sleep(1500)
      await walkDown(live)
      const a = (await live.evaluate(READ)) as Reading
      /* The canvas goes there as a click on a link in it does. */
      await ed.page.bringToFront()
      /* The frame in front now: the canvas may have drawn the page again behind and brought it forward since. */
      frame = await ed.frame()
      if (name !== "home") {
        const fb = await (await ed.page.$("[data-compat-frame='front']"))!.boundingBox()
        const at = (await frame.evaluate(`(() => {
          const l = document.createElement("a")
          l.setAttribute("href", ${JSON.stringify(path)})
          l.textContent = "probe"
          l.style.cssText = "position:fixed;left:10px;top:10px;z-index:2147483647;background:#fff;padding:8px;display:block"
          l.setAttribute("data-probe-link", "")
          /* In a nav, as the site's own navigation, which the canvas always follows. */
          const nav = document.createElement("nav")
          nav.setAttribute("data-probe-link", "")
          nav.appendChild(l)
          document.body.appendChild(nav)
          const r = l.getBoundingClientRect()
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        })()`)) as { x: number; y: number }
        await ed.page.mouse.click(fb!.x + at.x, fb!.y + at.y)
        await sleep(3500)
        frame = await ed.frame()
      }
      await sleep(1500)
      frame = await ed.frame()
      await walkDown(frame)
      frame = await ed.frame()
      const b = (await frame.evaluate(READ)) as Reading
      const where = (await frame.evaluate("location.pathname + ' ' + (document.querySelector('main .shopify-section') || {}).id")) as string
      compare(`${name} (${path}; the canvas shows ${where})`, a, b)
    }
  } finally {
    ed.close()
    server.close()
    await browser.close()
  }
  console.log(`\n${missing ? `${missing} kinds of element the website shows more of than the canvas` : "the canvas shows everything the website shows"}`)
}
main().catch((e) => { console.error(e); process.exit(1) })
