/**
 * ===========================================================================
 *  THE PRODUCTS LIST IN ORDERS' STYLE, ON A FINGER AND ON LANDING
 * ===========================================================================
 * Renders the Products list (app/app/products/products-client.tsx) as it is
 * now and as it was before this round (the commit given by BASE, default
 * d98efc5^), each in the app's own scroller, at 390 (a phone: touch, no
 * hover, a coarse pointer) and 1280 (a mouse), and measures:
 *
 *   LANDING     every layout shift from the first frame (CLS), and the
 *               card's top over the first second.
 *   A LATE      a readiness banner that arrives 600ms after the page drew,
 *   BANNER      as the real one does on a first visit: the largest jump of
 *               the card's top between two frames.
 *   A SCROLL    a finger that lands on a row and moves 40px within 80ms (a
 *   ON A ROW    scroll), sampled every frame: whether the row was ever
 *               marked pressed or painted anything but white.
 *   A TAP       a finger that stays 200ms: the row is marked pressed.
 *   HOVER       every `:hover` rule in the stylesheet that matches an
 *               element on the page with the hover taken off, and whether
 *               it is gated behind (hover: hover) and (pointer: fine); then
 *               a mouse moved over a row on the touch emulation and the
 *               cell's colour read.
 *   THE PARTS   the title's size, the bar, the toolbar, a row's height and
 *               the column's width, beside Orders' (24/28px title, 66px bar,
 *               48px toolbar, 1200px column).
 *
 *   node scripts/check-products-list-r40.mjs
 *   BASE=<commit> node scripts/check-products-list-r40.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const BASE = process.env.BASE || "d98efc5^"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const dir = join(root, ".products-r40")
mkdirSync(dir, { recursive: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

/* The old client and its press mark, with its relative imports made absolute so they resolve from here. */
const show = (path) => execFileSync("git", ["show", `${BASE}:${path}`], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 })
writeFileSync(
  join(dir, "old-client.tsx"),
  show("app/app/products/products-client.tsx")
    .replace(/from "\.\/(?!\.)/g, 'from "@/app/app/products/')
    .replace(/from "\.\.\/orders\//g, 'from "@/app/app/orders/')
    .replace(/"@\/lib\/press-mark"/g, '"@/.products-r40/old-press-mark"'),
)
writeFileSync(join(dir, "old-press-mark.ts"), show("lib/press-mark.ts"))

const entry = (client) => `
import React from "react"
import { createRoot } from "react-dom/client"
import { LanguageProvider } from "@/lib/i18n"
import { ProductsClient } from "${client}"
const cover = (i: number) => "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="' + ["#d9cbb6", "#c9d6df", "#e5d0d0", "#d3dccb"][i % 4] + '"/></svg>')
const products = Array.from({ length: 24 }, (_, i) => ({
  id: "p" + i, creator_id: "c1", title: "Product " + (i + 1), type: "digital", price_cents: i === 4 ? 0 : 1200 + i * 350,
  status: i % 5 === 3 ? "draft" : "published", thumbnail_url: i % 4 === 1 ? null : cover(i), slug: "product-" + i,
  created_at: new Date(Date.UTC(2026, 8, 1) - i * 86400000).toISOString(), archived: i === 13, sales_count: i % 3 === 0 ? 12 * i : 0,
}))
document.documentElement.classList.add("app-layout")
const HEADER = window.innerWidth >= 768 ? 58 : 68
document.head.insertAdjacentHTML("beforeend", "<style>html.app-layout, html.app-layout body { background-color: #f8f9fa !important }</style>")
createRoot(document.getElementById("app")!).render(
  <LanguageProvider>
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: HEADER, background: "#fff" }} />
    <div className="app-content-scroll" style={{ position: "fixed", top: HEADER, left: window.innerWidth >= 768 ? 240 : 0, right: 0, bottom: 0, overflowY: "auto" }}>
      <ProductsClient products={products} creatorUsername="astrid" />
    </div>
  </LanguageProvider>,
)
`
const stub = (name, body) => writeFileSync(join(dir, name), body)
stub("navigation.js", `export const usePathname = () => "/app/products"
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })
export const useSearchParams = () => new URLSearchParams()
`)
stub("link.jsx", `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault() } }, children) })
`)
stub("image.jsx", `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)

const css = await appCss(root)
const pages = {}
try {
  for (const [name, client] of [["new", "@/app/app/products/products-client"], ["old", "@/.products-r40/old-client"]]) {
    writeFileSync(join(dir, `entry-${name}.tsx`), entry(client))
    execFileSync("npx", [
      "esbuild", join(dir, `entry-${name}.tsx`), "--bundle", "--format=iife", "--jsx=automatic",
      '--define:process.env.NODE_ENV="production"', "--alias:@=.",
      "--banner:js=var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};",
      `--alias:next/navigation=./.products-r40/navigation.js`, `--alias:next/link=./.products-r40/link.jsx`, `--alias:next/image=./.products-r40/image.jsx`,
      `--outfile=${join(dir, `${name}.js`)}`, "--log-level=error",
    ], { cwd: root, stdio: "inherit" })
    const js = readFileSync(join(dir, `${name}.js`), "utf8")
    writeFileSync(join(dir, `${name}.html`), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)
    pages[name] = join(dir, `${name}.html`)
  }

  /* What the device answers to hover and pointer is a browser setting (Emulation.setEmulatedMedia does not reach these two): a phone's browser and a computer's. */
  const launch = (hover, pointer) => puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", `--blink-settings=primaryHoverType=${hover},availableHoverTypes=${hover},primaryPointerType=${pointer},availablePointerTypes=${pointer}`] })
  const browsers = { touch: await launch(1, 2), mouse: await launch(2, 4) }
  const phone = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const desk = { width: 1280, height: 800 }

  const open = async (which, vp, touch) => {
    const p = await (touch ? browsers.touch : browsers.mouse).newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.evaluateOnNewDocument(() => {
      window.__cls = 0
      window.__shifts = 0
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) { window.__cls += e.value; window.__shifts++ }
      }).observe({ type: "layout-shift", buffered: true })
      /* The card's top every frame from the first. */
      window.__tops = []
      const tick = () => {
        const s = document.querySelector("section[aria-label=Products]")
        if (s) window.__tops.push([Math.round(performance.now()), +s.getBoundingClientRect().top.toFixed(1)])
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await p.setViewport(vp)
    await p.goto(`file://${pages[which]}`)
    await p.waitForSelector("section[aria-label=Products]")
    await wait(1000)
    if (errors.length) fail(`${which} threw: ${errors[0]}`)
    return p
  }

  const results = {}
  for (const which of ["old", "new"]) {
    console.log(`\n${which === "new" ? "NOW" : `BEFORE (${BASE})`}`)
    const r = (results[which] = {})
    for (const [label, vp, touch] of [["390", phone, true], ["1280", desk, false]]) {
      const p = await open(which, vp, touch)
      const landing = await p.evaluate(() => {
        const tops = window.__tops.map((t) => t[1])
        return { cls: +window.__cls.toFixed(4), shifts: window.__shifts, topMoved: +(Math.max(...tops) - Math.min(...tops)).toFixed(1) }
      })
      const parts = await p.evaluate(() => {
        const vis = (sel) => [...document.querySelectorAll(sel)].find((el) => el.getBoundingClientRect().width > 0 && !el.closest("[hidden]"))
        const h1 = document.querySelector("h1")
        const bar = document.querySelector("[data-orders-bar]")
        const tb = document.querySelector("[data-toolbar]")
        const row = vis("[data-row]:not([hidden])")
        const col = bar?.firstElementChild
        return {
          title: getComputedStyle(h1).fontSize,
          bar: Math.round(bar.getBoundingClientRect().height),
          toolbar: Math.round(tb.getBoundingClientRect().height),
          row: Math.round(row.getBoundingClientRect().height),
          column: Math.round(col.getBoundingClientRect().width),
          tabs: !!document.querySelector("[data-toolbar] [role=tablist]"),
        }
      })
      r[label] = { ...landing, ...parts }
      console.log(`  ${label}: landing CLS ${landing.cls} (${landing.shifts} shifts), card top moved ${landing.topMoved}px in the first second; title ${parts.title}, bar ${parts.bar}px, toolbar ${parts.toolbar}px, row ${parts.row}px, column ${parts.column}px, views as tabs ${parts.tabs}`)

      /* A late banner, as the real one arrives: into the slot when there is one, else where the old page drew it. */
      const late = await p.evaluate(async () => {
        const s = document.querySelector("section[aria-label=Products]")
        window.__tops = []
        /* Two frames of the card where it is, before the banner comes. */
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
        const banner = document.createElement("section")
        banner.style.cssText = "height:64px;margin-top:16px;border-radius:16px;background:#fffcf5;border:1px solid #fedf89"
        const slot = document.querySelector("[data-readiness-slot]")
        if (slot) slot.append(banner)
        else s.before(banner)
        await new Promise((r) => setTimeout(r, 600))
        const tops = window.__tops.map((t) => t[1])
        let jump = 0
        for (let i = 1; i < tops.length; i++) jump = Math.max(jump, Math.abs(tops[i] - tops[i - 1]))
        banner.remove()
        return { frames: tops.length, largestJump: +jump.toFixed(1), total: +(tops[tops.length - 1] - tops[0]).toFixed(1) }
      })
      r[label].late = late
      console.log(`  ${label}: a banner arriving late moves the card ${late.total}px, the largest jump between two frames ${late.largestJump}px (${late.frames} frames)`)

      /* Hover rules that would match on this page, and whether each is gated to a mouse. */
      const hover = await p.evaluate(() => {
        let gated = 0, open = 0, touchOnly = 0
        const openSamples = []
        /* Nested rules too: Tailwind writes a variant as `.x { @media … { &:hover { … } } }`. */
        const walk = (rules, media, parent) => {
          for (const rule of rules) {
            if (rule.media && rule.cssRules) { walk(rule.cssRules, media + " " + rule.media.mediaText, parent); continue }
            if (!rule.selectorText) { if (rule.cssRules) walk(rule.cssRules, media, parent); continue }
            const own = rule.selectorText
            const full = parent ? (own.includes("&") ? own.replace(/&/g, `:is(${parent})`) : `:is(${parent}) ${own}`) : own
            if (rule.cssRules?.length) walk(rule.cssRules, media, full)
            if (!full.includes(":hover") || !rule.style?.length) continue
            const sel = full.replace(/:hover/g, "")
            let hits = false
            try { hits = [...document.querySelectorAll(sel)].some((el) => el.closest("section[aria-label=Products], [data-orders-bar]")) } catch { hits = false }
            if (!hits) continue
            if (/hover:\s*hover/.test(media) && /pointer:\s*fine/.test(media)) gated++
            /* A rule for touch screens only (hover: none, a coarse pointer) that takes a hover look away, never adds one. */
            else if (/hover:\s*none|pointer:\s*coarse/.test(media)) touchOnly++
            else { open++; if (openSamples.length < 4) openSamples.push(full.slice(0, 100) + " @" + media.slice(0, 60)) }
          }
        }
        for (const sh of document.styleSheets) walk(sh.cssRules, "", "")
        return { gated, open, touchOnly, openSamples, hoverMedia: matchMedia("(hover: hover) and (pointer: fine)").matches }
      })
      r[label].hover = hover
      console.log(`  ${label}: hover rules matching this page: ${hover.gated} gated to (hover: hover) and (pointer: fine), ${hover.touchOnly} touch-only resets, ${hover.open} ungated ${hover.openSamples.length ? JSON.stringify(hover.openSamples) : ""}; the page's own query says hover ${hover.hoverMedia}`)

      if (!touch) {
        /* A mouse over a table row tints its cells: the hover a mouse should have is still there. */
        const b = await p.evaluate(() => { const row = [...document.querySelectorAll("tbody > tr[data-row]:not([hidden])")][3]; const r = row.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, id: row.dataset.row } })
        await p.mouse.move(b.x, b.y)
        await wait(200)
        r[label].mouseHover = await p.evaluate((id) => getComputedStyle(document.querySelector(`tbody > tr[data-row="${id}"] > td`)).backgroundColor, b.id)
        console.log(`  1280: a mouse over a table row paints its cells ${r[label].mouseHover}`)
      }
      if (touch) {
        const cdp = await p.target().createCDPSession()
        const center = await p.evaluate(() => {
          const row = [...document.querySelectorAll("ul[data-list] > li[data-row]:not([hidden])")][2]
          const b = row.getBoundingClientRect()
          window.__probeRow = row
          return { x: Math.round(b.left + b.width / 3), y: Math.round(b.top + b.height / 2) }
        })
        const sample = () => p.evaluate(() => {
          window.__painted = []
          const look = () => {
            const row = window.__probeRow
            const bg = getComputedStyle(row).backgroundColor
            window.__painted.push([row.hasAttribute("data-pressed"), bg])
            if (window.__painted.length < 30) requestAnimationFrame(look)
          }
          requestAnimationFrame(look)
        })
        const read = () => p.evaluate(() => {
          const lit = window.__painted.filter(([pressed, bg]) => pressed || (bg !== "rgba(0, 0, 0, 0)" && bg !== "rgb(255, 255, 255)"))
          return { frames: window.__painted.length, lit: lit.length, first: lit[0] ?? null }
        })
        const touchAt = (type, pt) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pt ? [{ x: pt.x, y: pt.y }] : [] })

        /* A scroll: down, 40px in four moves over 80ms, up. */
        await sample()
        await touchAt("touchStart", center)
        for (let i = 1; i <= 4; i++) { await wait(20); await touchAt("touchMove", { x: center.x, y: center.y - i * 10 }) }
        await wait(300)
        await touchAt("touchEnd")
        await wait(200)
        const scroll = await read()
        r[label].scroll = scroll
        console.log(`  390: a finger scrolling from a row: lit in ${scroll.lit} of ${scroll.frames} frames ${scroll.first ? JSON.stringify(scroll.first) : ""}`)

        /* A deliberate press: down and held still for 200ms. */
        await p.evaluate(() => { window.__probeRow = [...document.querySelectorAll("ul[data-list] > li[data-row]:not([hidden])")][4] })
        const c2 = await p.evaluate(() => { const b = window.__probeRow.getBoundingClientRect(); return { x: Math.round(b.left + b.width / 3), y: Math.round(b.top + b.height / 2) } })
        await touchAt("touchStart", c2)
        await wait(80)
        const early = await p.evaluate(() => window.__probeRow.hasAttribute("data-pressed"))
        await wait(140)
        const held = await p.evaluate(() => ({ pressed: window.__probeRow.hasAttribute("data-pressed"), bg: getComputedStyle(window.__probeRow).backgroundColor }))
        await touchAt("touchCancel")
        r[label].tap = { at80ms: early, at220ms: held.pressed, bg: held.bg }
        console.log(`  390: a finger held still: pressed at 80ms ${early}, at 220ms ${held.pressed} (${held.bg})`)

        /* A mouse over a row on a touch screen paints nothing. */
        const b = await p.evaluate(() => { const row = [...document.querySelectorAll("ul[data-list] > li[data-row]:not([hidden])")][6]; const r = row.getBoundingClientRect(); return { x: r.left + 60, y: r.top + 20, id: row.dataset.row } })
        await p.mouse.move(b.x, b.y)
        await wait(150)
        const hovered = await p.evaluate((id) => getComputedStyle(document.querySelector(`ul[data-list] > li[data-row="${id}"]`)).backgroundColor, b.id)
        r[label].hovered = hovered
        console.log(`  390: a pointer over a row on the touch emulation paints ${hovered}`)
      }
      await p.close()
    }
  }
  await browsers.touch.close()
  await browsers.mouse.close()

  console.log("\nHELD TO")
  const now = results.new
  expect(now["390"].cls === 0 && now["1280"].cls === 0, "no layout shift on landing at 390 and 1280", [now["390"].cls, now["1280"].cls])
  expect(now["390"].topMoved === 0 && now["1280"].topMoved === 0, "the card's top never moves in the first second", [now["390"].topMoved, now["1280"].topMoved])
  expect(now["390"].late.largestJump < 16 && now["1280"].late.largestJump < 16, "a late banner moves the card in steps under 16px a frame, not one jump", [now["390"].late.largestJump, now["1280"].late.largestJump])
  expect(now["390"].hover.open === 0 && now["1280"].hover.open === 0, "every hover rule on the page is gated to (hover: hover) and (pointer: fine)", [now["390"].hover.open, now["1280"].hover.open])
  expect(now["390"].hover.hoverMedia === false && now["1280"].hover.hoverMedia === true, "the touch emulation answers no hover, the mouse one does", [now["390"].hover.hoverMedia, now["1280"].hover.hoverMedia])
  expect(now["390"].scroll.lit === 0, "a finger scrolling from a row lights it in no frame", now["390"].scroll)
  expect(!now["390"].tap.at80ms && now["390"].tap.at220ms, "a finger held still is pressed after the wait, not before", now["390"].tap)
  expect(now["390"].hovered === "rgba(0, 0, 0, 0)" || now["390"].hovered === "rgb(255, 255, 255)", "a pointer over a row on a touch screen paints nothing", now["390"].hovered)
  expect(now["1280"].mouseHover !== "rgb(255, 255, 255)", "a mouse over a table row still tints it", now["1280"].mouseHover)
  expect(now["1280"].hover.gated > 0, "the desktop's hover rules are found and every one is gated", now["1280"].hover)
  expect(now["390"].title === "24px" && now["1280"].title === "28px", "the title is Orders' 24px, 28px from 640px", [now["390"].title, now["1280"].title])
  expect(now["390"].bar === 66 && now["1280"].bar === 66, "the bar is Orders' 66px", [now["390"].bar, now["1280"].bar])
  expect(now["390"].toolbar === 48 && now["1280"].toolbar === 48 && now["390"].tabs && now["1280"].tabs, "the toolbar is Orders' 48px row with the views as tabs", [now["390"].toolbar, now["1280"].toolbar])
  expect(now["1280"].column <= 1200, "the column is Orders' 1200px at most", now["1280"].column)
} finally {
  if (!process.env.KEEP) rmSync(dir, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} failed\n` : "\nall held\n")
process.exit(broken ? 1 : 0)
