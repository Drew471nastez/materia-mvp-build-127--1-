/**
 * ===========================================================================
 *  NORTHPAPER, THE NOTION TEMPLATE PAGE, MEASURED IN A BROWSER (round 65)
 * ===========================================================================
 * components/onepage/themes/northpaper-theme. scripts/render-onepage-northpaper.tsx draws the real PublicOnePage
 * with Northpaper picked on a new page (its own blocks laid on) and on a creator who filled them in. For each
 * page at 360, 390, 768 and 1280 (deviceScaleFactor 2) this:
 *
 *   - screenshots the whole page into SHOTS;
 *   - holds the page to its width: nothing wider than the window, no sideways scroll;
 *   - reads every visible word's colour and the solid colour painted behind it, and holds it to 4.5:1
 *     (3:1 for large words: 24px, or 18.66px bold);
 *   - measures every link, button and field a finger presses: 44px tall or more, and 44px wide or more;
 *   - and screenshots the Northpaper website template (public/theme-previews/notion-sales-page) at the same
 *     widths, for the side by side.
 *
 *   node scripts/check-onepage-northpaper.mjs
 *   WIDTHS=360,390,768,1280   SHOTS=<dir>   MODES=default,creator
 */
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs"
import { extname, join, normalize } from "node:path"
import { createRequire } from "node:module"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const root = process.cwd()
/* Playwright is installed for the machine, not the repository: require finds it on NODE_PATH, an import does not. */
const { chromium } = createRequire(import.meta.url)("playwright")
const WIDTHS = (process.env.WIDTHS || "360,390,768,1280").split(",").map(Number)
const MODES = (process.env.MODES || "default,creator").split(",").filter(Boolean)
const SHOTS = process.env.SHOTS || join(root, ".northpaper-shots")
mkdirSync(SHOTS, { recursive: true })

let failed = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`  ok   ${name}`)
  else {
    failed++
    console.log(`  FAIL ${name}${detail !== undefined ? ` (${typeof detail === "string" ? detail : JSON.stringify(detail)})` : ""}`)
  }
}

/* The website template's and the Notion creator's own pictures, under /__files/. */
const files = join(root, ".northpaper-files")
mkdirSync(files, { recursive: true })
for (const [pkg, names] of [["notionpage", ["notionpage-dashboard.webp", "notionpage-sponsors.webp", "notionpage-calendar.webp"]], ["notionsite", ["notionsite-avatar.webp"]]]) {
  for (const n of names) {
    const from = join(root, "theme-packages/materia/templates", pkg, "assets", n)
    if (existsSync(from)) await import("node:fs").then((fs) => fs.copyFileSync(from, join(files, n)))
  }
}

const { base, server } = await serveEditorProbe({ entry: "scripts/render-onepage-northpaper.tsx", statics: { "/__files/": files } })

/* In the page: every visible word with its colour and the first solid colour behind it, and every pressable thing's box. */
const MEASURE = () => {
  const cv = document.createElement("canvas")
  cv.width = cv.height = 1
  const cx = cv.getContext("2d", { willReadFrequently: true })
  const parse = (s) => {
    cx.clearRect(0, 0, 1, 1)
    cx.fillStyle = "rgba(0,0,0,0)"
    cx.fillStyle = s
    cx.fillRect(0, 0, 1, 1)
    const d = cx.getImageData(0, 0, 1, 1).data
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }
  }
  const lum = ({ r, g, b }) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
  /* The colour behind an element: its own and its ancestors' backgrounds, laid over each other from the page up. */
  const behind = (el) => {
    const layers = []
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e)
      if (cs.backgroundImage && cs.backgroundImage !== "none" && !/gradient/.test(cs.backgroundImage)) return null
      const c = parse(cs.backgroundColor)
      if (c.a > 0) layers.push(c)
      if (c.a >= 1) break
    }
    let out = { r: 255, g: 255, b: 255 }
    for (const c of layers.reverse()) out = { r: c.r * c.a + out.r * (1 - c.a), g: c.g * c.a + out.g * (1 - c.a), b: c.b * c.a + out.b * (1 - c.a) }
    return out
  }
  const words = []
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest("script,style,svg,[aria-hidden=true]")) continue
    const field = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
    const hasText = field ? (el.value || el.placeholder) : [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())
    if (!hasText) continue
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    if (r.width < 1 || r.height < 1 || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue
    let op = 1
    for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity)
    if (op < 0.05) continue
    const fg = parse(field && !el.value ? getComputedStyle(el, "::placeholder").color : cs.color)
    const bg = behind(el)
    if (!bg) continue
    const blended = { r: fg.r * fg.a * op + bg.r * (1 - fg.a * op), g: fg.g * fg.a * op + bg.g * (1 - fg.a * op), b: fg.b * fg.a * op + bg.b * (1 - fg.a * op) }
    const size = Number.parseFloat(cs.fontSize)
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700)
    const text = (field ? el.value || el.placeholder : el.textContent).trim().slice(0, 40)
    words.push({ text, ratio: Math.round(ratio(blended, bg) * 100) / 100, need: large ? 3 : 4.5 })
  }
  const taps = []
  for (const el of document.querySelectorAll("a[href], button, input:not([type=hidden]), textarea, [role=button]")) {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    if (r.width < 1 || r.height < 1 || cs.visibility === "hidden" || el.closest("[aria-hidden=true]")) continue
    let op = 1
    for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity)
    if (op < 0.05) continue
    const what = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.tagName).trim().slice(0, 40)
    /* What every theme's page draws the same (Share, Subscribe, the socials' tiles, the Storelib badge, the legal links): reported, not this theme's to change. */
    const shared = !!el.closest("[data-onepage-legal],[data-op-social-icon]") || /^(Subscribe to|Share) /.test(what) || / on Storelib$/.test(what)
    taps.push({ what: el.closest("[data-op-social-icon]")?.getAttribute("data-op-social-icon") || what, w: Math.round(r.width), h: Math.round(r.height), shared })
  }
  const wide = [...document.body.querySelectorAll("*")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 1 && getComputedStyle(e).position !== "fixed" && !e.closest("[data-carousel],[data-drag-scroll],.overflow-x-auto,.overflow-x-scroll") }).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 40)}`)
  return { words, taps, scrollW: document.documentElement.scrollWidth, innerWidth, wide: wide.slice(0, 5), blocks: window.__probeBlocks }
}

const browser = await chromium.launch()
try {
  for (const mode of MODES) {
    console.log(`\nNorthpaper, ${mode}`)
    for (const w of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 })
      const page = await ctx.newPage()
      const errors = []
      page.on("pageerror", (e) => errors.push(String(e)))
      await page.goto(`${base}/app/onepage?t=northpaper&mode=${mode}`, { waitUntil: "load" })
      await page.waitForTimeout(800)
      await page.evaluate(() => document.fonts.ready)
      /* Blocks come in as they reach the screen (components/onepage/reveal): scroll the page through once. */
      await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 300) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)) } scrollTo(0, 0) })
      await page.waitForTimeout(900)
      await page.screenshot({ path: join(SHOTS, `northpaper-${mode}-${w}.png`), fullPage: true })
      const m = await page.evaluate(MEASURE)
      if (w === WIDTHS[0]) console.log(`       pictures: ${JSON.stringify(await page.evaluate(() => [...document.images].map((i) => [i.getAttribute("src")?.slice(0, 60), i.naturalWidth])))}`)
      check(`${w}: no script errors`, errors.length === 0, errors[0])
      if (w === WIDTHS[0]) console.log(`       blocks: ${m.blocks.join(", ")}`)
      check(`${w}: no sideways scroll (page ${m.scrollW}px in ${m.innerWidth}px)`, m.scrollW <= m.innerWidth && m.wide.length === 0, m.wide)
      const low = m.words.filter((x) => x.ratio < x.need)
      check(`${w}: ${m.words.length} words read at AA (lowest ${Math.min(...m.words.map((x) => x.ratio))}:1)`, low.length === 0, low.slice(0, 4))
      const own = m.taps.filter((t) => !t.shared)
      const small = own.filter((t) => t.h < 44 || t.w < 44)
      check(`${w}: the theme's ${own.length} tap targets 44px or more (smallest ${Math.min(...own.map((t) => t.h))}px tall)`, small.length === 0, small.slice(0, 6))
      const chrome = m.taps.filter((t) => t.shared && (t.h < 44 || t.w < 44))
      if (chrome.length) console.log(`       shared by every theme, under 44px: ${chrome.map((t) => `${t.what} ${t.w}x${t.h}`).join(", ")}`)
      await ctx.close()
    }
  }

  /* The Northpaper website template, for the side by side. */
  const site = join(root, "public/theme-previews/notion-sales-page")
  if (existsSync(join(site, "index.html"))) {
    const pub = join(root, "public")
    const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json" }
    const statics = createServer((req, res) => {
      let p = normalize(join(pub, decodeURIComponent(req.url.split("?")[0])))
      if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html")
      if (!existsSync(p) && existsSync(p + ".html")) p += ".html"
      if (!p.startsWith(pub) || !existsSync(p)) { res.writeHead(404); return res.end() }
      res.writeHead(200, { "content-type": types[extname(p)] || "application/octet-stream" })
      res.end(readFileSync(p))
    })
    await new Promise((r) => statics.listen(0, "127.0.0.1", r))
    for (const w of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 })
      const page = await ctx.newPage()
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort())
      await page.goto(`http://127.0.0.1:${statics.address().port}/theme-previews/notion-sales-page/index.html`, { waitUntil: "load" }).catch(() => {})
      await page.waitForTimeout(1200)
      await page.screenshot({ path: join(SHOTS, `northpaper-website-${w}.png`) })
      await ctx.close()
    }
    statics.close()
  }

  /*
    The editor (scripts/render-onepage-editor.tsx): Design › Themes, Northpaper picked
    on a page with blocks of the creator's own (the offer shows, and Add blocks puts
    them under), and on a new page (its blocks laid on with the look, no offer).
  */
  const fresh = [
    { id: "hdr", type: "header", enabled: true, sort_order: 0, data: { show_avatar: true, show_name: true, show_bio: true } },
    { id: "soc", type: "social_row", enabled: true, sort_order: 1, data: { platforms: [], style: "icons" } },
    { id: "l1", type: "link_button", enabled: true, sort_order: 2, data: { label: "My Link", url: "https://", icon: null, thumbnail_url: null } },
    { id: "l2", type: "link_button", enabled: true, sort_order: 3, data: { label: "My Link", url: "https://", icon: null, thumbnail_url: null } },
  ]
  for (const [label, blocks] of [["own blocks", null], ["new page", fresh]]) {
    console.log(`\nThe editor, ${label}`)
    const editor = await serveEditorProbe({ blocks })
    for (const w of [390, 1280]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2, hasTouch: w < 640, isMobile: w < 640 })
      const page = await ctx.newPage()
      const errors = []
      page.on("pageerror", (e) => errors.push(String(e)))
      await page.goto(`${editor.base}/app/onepage#design`)
      await page.waitForSelector('[data-nav-row="theme"]', { timeout: 20000 })
      await page.locator('[data-nav-row="theme"]').first().click()
      await page.waitForSelector("[data-theme-card=northpaper]", { state: "visible", timeout: 20000 })
      await page.waitForTimeout(600)
      const card = page.locator("[data-theme-card=northpaper]")
      await card.scrollIntoViewIfNeeded()
      await card.click()
      await page.waitForTimeout(500)
      const offer = page.locator("[data-theme-blocks-offer]:visible")
      const shown = await offer.count()
      const previewText = async () => {
        let text = await page.evaluate(() => document.body.innerText)
        for (const f of page.frames()) text += await f.evaluate(() => document.body?.innerText || "").catch(() => "")
        return text
      }
      if (blocks === null) {
        check(`${w}: the offer shows under Clean once Northpaper is picked`, shown === 1)
        if (shown) {
          await offer.scrollIntoViewIfNeeded()
          const box = await offer.boundingBox()
          await page.screenshot({ path: join(SHOTS, `northpaper-editor-offer-${w}.png`), clip: { x: 0, y: Math.max(0, box.y - 360), width: w, height: Math.min(900, box.height + 420) } })
          const btns = await offer.locator("button").evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().height)))
          check(`${w}: its two buttons are 44px tall or more`, btns.length === 2 && btns.every((h) => h >= 44), btns)
          await offer.getByRole("button", { name: "Add blocks" }).click()
          await page.waitForTimeout(800)
          check(`${w}: Add blocks puts them on the page and the offer goes`, (await page.locator("[data-theme-blocks-offer]:visible").count()) === 0 && /Free Notion template/.test(await previewText()))
        }
      } else {
        check(`${w}: on a new page there is no offer`, shown === 0)
        await page.waitForTimeout(600)
        check(`${w}: the blocks came with the look`, /Free Notion template/.test(await previewText()) && /Questions/.test(await previewText()))
        await page.screenshot({ path: join(SHOTS, `northpaper-editor-new-page-${w}.png`) })
      }
      check(`${w}: no script errors in the editor`, errors.length === 0, errors[0])
      await ctx.close()
    }
    editor.server.close()
  }
} finally {
  await browser.close()
  server.close()
  await import("node:fs").then((fs) => fs.rmSync(files, { recursive: true, force: true }))
}

console.log(failed ? `\n${failed} failed` : "\nall passed")
process.exit(failed ? 1 : 0)
