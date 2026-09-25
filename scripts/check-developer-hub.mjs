/**
 * ===========================================================================
 *  THE DEVELOPER HUB, MEASURED
 * ===========================================================================
 * Renders every page of storelib.com/developers on the server
 * (react-dom/server, the real HubPage), serves it to Chromium with the app's
 * own stylesheet under a stand-in for the site header, and checks with
 * numbers rather than a look:
 *
 *   nothing scrolls sideways                  the document's scroll width
 *                                              against the window, at 390 and
 *                                              1280, on every page
 *   code and tables stay in the column        each one's right edge
 *   a phone has the hub's own bar             under the site header, and still
 *                                              there after a long scroll
 *   its two menus open and close              the page list and "On this page"
 *                                              open with a tap, one at a time,
 *                                              and a link inside closes them
 *   a heading followed from the menu is not   its top against the two bars
 *     hidden under the bars
 *   every tap target on the bar, in its        40px or taller
 *     menus and in the page is big enough
 *   a computer has the side nav, and the      their boxes
 *     outline at 1280
 *
 * Writes screenshots of the front page and one reference page at both widths
 * to SHOTS_DIR (a temporary folder unless given), prefixed devhub-.
 *
 *   node scripts/check-developer-hub.mjs
 *   SLUGS=schema,themes node scripts/check-developer-hub.mjs
 */
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createRequire } from "node:module"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const css = await appCss(root)
/* Stubs and bundles in a folder git ignores (.*-probe/), removed at the end. */
const stubs = join(root, ".devhub-probe")
const out = join(stubs, "out")
mkdirSync(out, { recursive: true })
const shots = process.env.SHOTS_DIR || mkdtempSync(join(tmpdir(), "storelib-devhub-"))
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}

try {
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, scroll, replace, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
  writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => (typeof location === "undefined" ? "/developers" : location.pathname)
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const notFound = () => { throw new Error("notFound") }
export const redirect = () => {}
`)
  writeFileSync(join(stubs, "server.tsx"), `import React from "react"
import { renderToString } from "react-dom/server"
import { App } from "${join(root, "scripts/render-developer-hub.tsx")}"
import { DEV_PAGES } from "${join(root, "lib/developers/pages.ts")}"
export const slugs = DEV_PAGES.map((p) => p.slug)
export function ssr(slug: string) { return renderToString(React.createElement(App, { slug })) }
`)
  /* The page's client islands, mounted on their own over the server's markup,
     the way Next hydrates them: here, the one that closes the phone menus. */
  const islands = existsSync(join(root, "components/developers/hub-menus.tsx"))
  writeFileSync(join(stubs, "browser.tsx"), islands
    ? `import React from "react"
import { createRoot } from "react-dom/client"
import { HubMenus } from "${join(root, "components/developers/hub-menus.tsx")}"
window.__errors = []
const box = document.createElement("div")
document.body.append(box)
createRoot(box).render(React.createElement(HubMenus))
`
    : `window.__errors = []\n`)

  const { build } = await import("esbuild")
  const common = {
    bundle: true,
    logLevel: "error",
    jsx: "automatic",
    loader: { ".jsx": "jsx", ".css": "empty", ".svg": "dataurl" },
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "next/link": join(stubs, "link.jsx"), "next/navigation": join(stubs, "navigation.js"), "@": root },
    nodePaths: [join(root, "node_modules")],
  }
  await build({ ...common, entryPoints: [join(stubs, "server.tsx")], platform: "node", format: "cjs", outfile: join(out, "server.cjs"), external: ["server-only"] })
  await build({ ...common, entryPoints: [join(stubs, "browser.tsx")], platform: "browser", format: "iife", outfile: join(out, "probe.js") })
  const { ssr, slugs: allSlugs } = createRequire(import.meta.url)(join(out, "server.cjs"))
  const wanted = process.env.SLUGS ? process.env.SLUGS.split(",").map((s) => (s === "index" ? "" : s)) : allSlugs
  const bundle = (await import("node:fs")).readFileSync(join(out, "probe.js"))

  const page = (html) =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<style>${css}</style>` +
    /* The site header, as tall as it is measured on storelib.com: 65 on a phone, 70 wider. */
    `<style>body{margin:0}#platform-header-root{height:65px}@media (min-width:768px){#platform-header-root{height:70px}}</style>` +
    `</head><body>${html}<script src="/probe.js"></script></body></html>`
  const pages = new Map(wanted.map((s) => [s, page(ssr(s))]))

  const server = createServer((req, res) => {
    if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
    const path = decodeURIComponent(req.url.split("?")[0].split("#")[0])
    const slug = path === "/developers" ? "" : path.replace(/^\/developers\//, "")
    const html = pages.get(slug)
    if (html === undefined) { res.writeHead(404); return res.end("") }
    res.writeHead(200, { "content-type": "text/html" })
    res.end(html)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const origin = `http://127.0.0.1:${server.address().port}`
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  async function open(width, slug) {
    const p = await browser.newPage()
    await p.setViewport({ width, height: width < 768 ? 844 : 900, deviceScaleFactor: 1, isMobile: width < 768, hasTouch: width < 768 })
    await p.goto(`${origin}${slug ? `/developers/${slug}` : "/developers"}`, { waitUntil: "load" })
    await sleep(150)
    return p
  }

  /** Everything the checks read from a page, in one evaluate. */
  const measure = (p) => p.evaluate(() => {
    const vw = document.documentElement.clientWidth
    /* A table may be wider than its frame and scroll inside it; the frame itself may not be. */
    const wide = [...document.querySelectorAll("figure, [data-doc-table]")]
      .map((el) => ({ tag: el.tagName, right: Math.round(el.getBoundingClientRect().right), w: Math.round(el.getBoundingClientRect().width) }))
      .filter((b) => b.w > 0 && b.right > vw + 0.5)
    return {
      vw,
      scrollW: document.documentElement.scrollWidth,
      bodyScrollW: document.body.scrollWidth,
      wide,
      bar: (() => { const b = document.querySelector("[data-hub-bar]"); if (!b) return null; const r = b.getBoundingClientRect(); return { top: r.top, h: r.height, visible: getComputedStyle(b).display !== "none" && r.height > 0 } })(),
      side: (() => { const s = document.querySelector("[data-hub-side]"); return s ? s.getBoundingClientRect().width : 0 })(),
      toc: (() => { const s = document.querySelector("[data-hub-toc]"); return s ? s.getBoundingClientRect().width : 0 })(),
      /* What a thumb presses in the page itself: copy buttons, the + of a collapsed sample,
         the front page's map, previous and next. Links inside a sentence are exempt, as WCAG exempts them. */
      taps: [...document.querySelectorAll("article figure button, article details > summary, article section li a, nav[aria-label='Previous and next'] a")]
        .map((el) => Math.round(el.getBoundingClientRect().height))
        .filter((h) => h > 0),
    }
  })

  for (const width of [390, 1280]) {
    console.log(`\nAt ${width}px`)
    for (const slug of wanted) {
      const p = await open(width, slug)
      const m = await measure(p)
      const name = slug || "(front page)"
      expect(m.scrollW <= m.vw && m.bodyScrollW <= m.vw, `${name}: nothing scrolls sideways`, `${m.scrollW} in ${m.vw}`)
      expect(m.wide.length === 0, `${name}: every code sample and table stays in the column`, m.wide.slice(0, 3))
      if (width < 768) {
        expect(!!m.bar && m.bar.visible, `${name}: the hub's own bar is there`)
        expect(m.taps.every((h) => h >= 40), `${name}: every button and link row in the page is 40px or taller`, `${m.taps.length}, shortest ${m.taps.length ? Math.min(...m.taps) : "none"}`)
      } else {
        expect(m.side > 200, `${name}: the side nav is drawn`, Math.round(m.side))
        if (width >= 1280) expect(m.toc > 150 || !(await p.$("[data-hub-toc] a")), `${name}: and the outline beside the page`, Math.round(m.toc))
      }
      if ((slug === "" || slug === "schema") && process.env.NO_SHOTS !== "1") {
        await p.screenshot({ path: join(shots, `devhub-${slug || "index"}-${width}.png`), fullPage: false })
      }
      await p.close()
    }
  }

  /* ── The phone's bar and its two menus, in detail, on a long page ── */
  const long = wanted.includes("schema") ? "schema" : wanted[0]
  console.log(`\nThe phone bar, on ${long || "the front page"}`)
  {
    const p = await open(390, long)
    const header = await p.$eval("#platform-header-root", (el) => el.getBoundingClientRect().height)
    await p.evaluate(() => window.scrollTo(0, 1600))
    await sleep(100)
    const bar = await p.$eval("[data-hub-bar]", (el) => ({ top: el.getBoundingClientRect().top, h: el.getBoundingClientRect().height })).catch(() => null)
    expect(!!bar && Math.abs(bar.top - header) <= 1, "after a long scroll the bar sits right under the site header", bar ? `${Math.round(bar.top)} vs ${header}` : "no bar")
    const targets = await p.$$eval("[data-hub-bar] summary, [data-hub-bar] button", (els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))
    expect(targets.length >= 2 && targets.every((h) => h >= 40), "its buttons are 40px or taller", targets)

    for (const which of ["pages", "outline"]) {
      const sel = `[data-hub-menu="${which}"]`
      if (!(await p.$(sel))) { expect(false, `the ${which} menu exists`); continue }
      await p.click(`${sel} > summary`)
      await sleep(150)
      const panel = await p.$eval(sel, (d) => {
        const panel = d.querySelector("[data-hub-panel]")
        const r = panel?.getBoundingClientRect()
        const links = [...(panel?.querySelectorAll("a") ?? [])].map((a) => Math.round(a.getBoundingClientRect().height))
        return { open: d.open, left: r?.left ?? -1, right: r?.right ?? 9999, bottom: r?.bottom ?? 9999, links }
      })
      expect(panel.open, `the ${which} menu opens with a tap`)
      expect(panel.left >= 0 && panel.right <= 390.5, `and fits the width of the phone`, `${Math.round(panel.left)} to ${Math.round(panel.right)}`)
      expect(panel.bottom <= 844.5, "and the height of its screen", Math.round(panel.bottom))
      expect(panel.links.length > 0 && panel.links.every((h) => h >= 40), "every link in it is 40px or taller", `${panel.links.length} links, shortest ${Math.min(...panel.links)}`)
    }
    const both = await p.$$eval("[data-hub-menu]", (ds) => ds.filter((d) => d.open).length)
    expect(both <= 1, "only one menu is open at a time", both)

    /* A heading followed from "On this page" lands below both bars, and the menu closes. */
    if (await p.$('[data-hub-menu="outline"]')) {
      await p.evaluate(() => { document.querySelectorAll("[data-hub-menu]").forEach((d) => { d.open = false }) })
      await p.click('[data-hub-menu="outline"] > summary')
      await sleep(100)
      const hrefs = await p.$$eval('[data-hub-menu="outline"] [data-hub-panel] a', (as) => as.map((a) => a.getAttribute("href")))
      const target = hrefs[Math.min(2, hrefs.length - 1)]
      await p.click(`[data-hub-menu="outline"] [data-hub-panel] a[href="${target}"]`)
      await sleep(600)
      const after = await p.evaluate((href) => {
        const h = document.getElementById(href.slice(1))
        const bar = document.querySelector("[data-hub-bar]").getBoundingClientRect()
        return { open: document.querySelector('[data-hub-menu="outline"]').open, top: h ? h.getBoundingClientRect().top : -1, barBottom: bar.bottom }
      }, target)
      expect(!after.open, "a link in the menu closes it")
      expect(after.top >= after.barBottom - 1, "and the heading it goes to is not under the bars", `${Math.round(after.top)} vs ${Math.round(after.barBottom)}`)
    }
    await p.screenshot({ path: join(shots, `devhub-${long || "index"}-390-scrolled.png`) })
    await p.close()
  }

  await browser.close()
  server.close()
  console.log(`\nscreenshots in ${shots}`)
} finally {
  rmSync(stubs, { recursive: true, force: true })
}

if (broken) { console.log(`\n${broken} checks failed`); process.exit(1) }
console.log("\nall checks passed")
