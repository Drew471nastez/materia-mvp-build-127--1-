/**
 * ===========================================================================
 *  ROUND 40, MEASURED: THE LEGAL PAGES AND A OnePage'S SHEETS
 * ===========================================================================
 * The real components (scripts/render-legal-r40.tsx) in headless Chromium at
 * 1440x900 and 390x844:
 *
 *   PAGES     one h1 with the document's name in the ink band, no sideways
 *             scroll, every contents link reaching its heading, the side
 *             contents on a desk and the folded one on a phone
 *   DIALOGS   Share, Subscribe and the legal sheet: a bottom sheet on a
 *             phone, a centred card on a desk; the card's corners are its own
 *             (nothing inside reaches its edge in another colour), and it is
 *             dark on a dark page
 *   PANELS    PillPanels `fit`: the box is the short panel's height, not the
 *             tall one's, and leaves nothing to scroll
 *
 *   node scripts/check-legal-r40.mjs        SHOTS_DIR=dir keeps the pictures (the temp folder by default)
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const stubs = join(root, ".legal-r40-probe")
const shots = process.env.SHOTS_DIR || join(tmpdir(), "legal-r40-shots")
const ORIGIN = "https://storelib.com"
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

mkdirSync(stubs, { recursive: true })
mkdirSync(shots, { recursive: true })
try {
  writeFileSync(join(stubs, "navigation.js"), `const router = { push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const permanentRedirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"\nexport default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })\n`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"\nexport default function Image({ src, alt, fill, sizes, priority, preload, unoptimized, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src?.src, alt, ...rest }) }\n`)
  writeFileSync(join(stubs, "dynamic.jsx"), `import React from "react"\nexport default function dynamic(load, opts = {}) { const Lazy = React.lazy(() => load().then((m) => ({ default: m.default ?? m }))); const Fallback = opts.loading || (() => null); return function Dynamic(props) { return React.createElement(React.Suspense, { fallback: React.createElement(Fallback) }, React.createElement(Lazy, props)) } }\n`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() { const q = { select: () => q, eq: () => q, in: () => q, maybeSingle: async () => ({ data: null }), then: (f) => f({ data: [] }) }; return { from: () => q, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } } }\nexport const isNativePlatform = () => false\n`)
  const css = await appCss(root)
  const fonts = interFaces(root)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-legal-r40.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.legal-r40-probe/navigation.js", "next/link": "./.legal-r40-probe/link.jsx", "next/image": "./.legal-r40-probe/image.jsx", "next/dynamic": "./.legal-r40-probe/dynamic.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty", ".webp": "dataurl", ".png": "dataurl" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"], protocolTimeout: 240_000, timeout: 180_000 })
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  /* DESK_WIDTH=1280 measures the legal update at the width it was reviewed at. */
  const DESK = { width: Number(process.env.DESK_WIDTH) || 1440, height: 900, deviceScaleFactor: 1 }

  async function open(path, vp) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) return void r.respond({ status: 200, contentType: "application/json", body: "{}" })
      if (url.startsWith(`${ORIGIN}/`)) return void r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:") || url.startsWith("about:")) return void r.continue()
      return void r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}${path}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(900)
    return { p, errors }
  }

  console.log("\nThe pages")
  for (const doc of ["terms", "privacy", "refunds"]) {
    for (const [name, vp] of [["desk", DESK], ["phone", PHONE]]) {
      const tag = `${doc} ${name}`
      const { p, errors } = await open(`/legal-probe?view=${doc}`, vp)
      const m = await p.evaluate(() => {
        const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== "none"
        const h1 = [...document.querySelectorAll("h1")]
        const hero = document.querySelector("[data-legal-hero]")
        const links = [...document.querySelectorAll("[data-help-toc] a")].map((a) => a.getAttribute("href"))
        const missing = links.filter((h) => !document.querySelector(h))
        const side = document.querySelector("aside [data-help-toc]")
        const inline = document.querySelector("[data-help-toc-inline]")
        const body = document.querySelector("[data-help-body] p")
        return {
          h1: h1.map((h) => h.textContent),
          inHero: !!hero && hero.contains(h1[0]),
          heroBg: hero ? getComputedStyle(hero).backgroundColor : null,
          sideways: document.documentElement.scrollWidth - innerWidth,
          missing,
          side: vis(side),
          inline: vis(inline),
          bodySize: body ? getComputedStyle(body.parentElement).fontSize : null,
          lineLength: body ? Math.round(body.getBoundingClientRect().width) : null,
        }
      })
      expect(errors.length === 0, `${tag}: no page errors`, errors.slice(0, 2))
      expect(m.h1.length === 1 && m.h1[0] === ({ terms: "Terms of service", privacy: "Privacy policy", refunds: "Refund policy" })[doc] && m.inHero, `${tag}: one h1, the name, in the band`, m.h1)
      expect(m.heroBg === "rgb(26, 26, 46)", `${tag}: the Help Center's ink band`, m.heroBg)
      expect(m.sideways <= 0, `${tag}: no sideways scroll`, m.sideways)
      expect(m.missing.length === 0, `${tag}: every contents link reaches its heading`, m.missing)
      expect(name === "desk" ? m.side && !m.inline : !m.side && m.inline, `${tag}: contents ${name === "desk" ? "beside the text" : "folded under the title"}`, { side: m.side, inline: m.inline })
      expect(m.lineLength <= 720, `${tag}: a reading column (${m.lineLength}px, ${m.bodySize})`, m.lineLength)
      await p.screenshot({ path: join(shots, `${tag.replace(/ /g, "-")}.png`) })
      if (process.env.FULL_PAGE) await p.screenshot({ path: join(shots, `${tag.replace(/ /g, "-")}-full.png`), fullPage: true })
      await p.close()
    }
  }

  console.log("\nThe dialogs")
  for (const view of ["share", "subscribe", "legal"]) {
    for (const dark of [false, true]) {
      for (const [name, vp] of [["desk", DESK], ["phone", PHONE]]) {
        const tag = `${view} ${dark ? "dark" : "light"} ${name}`
        const { p, errors } = await open(`/legal-probe?view=${view}${dark ? "&dark=1" : ""}`, vp)
        await sleep(700)
        const m = await p.evaluate(() => {
          const card = document.querySelector("[data-onepage-dialog-panel]")
          const sheet = document.querySelector("[data-sheet-panel]")
          const panel = card || sheet
          const r = panel?.getBoundingClientRect()
          const bg = panel ? getComputedStyle(panel).backgroundColor : null
          /* Anything inside drawn edge to edge at the top in a colour that is not the card's would show at its corners. */
          const edge = panel
            ? [...panel.querySelectorAll("*")].filter((el) => {
                const b = getComputedStyle(el).backgroundColor
                if (b === "rgba(0, 0, 0, 0)" || b === bg) return false
                const e = el.getBoundingClientRect()
                return e.width > 0 && Math.abs(e.left - r.left) < 1 && Math.abs(e.right - r.right) < 1 && Math.abs(e.top - r.top) < 1
              }).length
            : -1
          return {
            kind: card ? "card" : sheet ? "sheet" : "none",
            bg,
            radius: panel ? getComputedStyle(panel).borderTopLeftRadius : null,
            width: r ? Math.round(r.width) : 0,
            left: r ? Math.round(r.left) : 0,
            bottomGap: r ? Math.round(innerHeight - r.bottom) : 0,
            edge,
            sideways: document.documentElement.scrollWidth - innerWidth,
            text: (panel?.textContent || "").replace(/\s+/g, " ").slice(0, 80),
            legalLoaded: !!document.querySelector("[data-legal-reader]"),
          }
        })
        expect(errors.length === 0, `${tag}: no page errors`, errors.slice(0, 2))
        /* Round 41: Share is the centred card at every width again, with no surface of its own (its band and body are their own colours, cut by the card's clip): scripts/check-onepage-r41.mjs measures it. */
        const shareCard = view === "share"
        expect(m.kind === (name === "phone" && !shareCard ? "sheet" : "card"), `${tag}: ${name === "phone" && !shareCard ? "the app's bottom sheet" : "a centred card"}`, m.kind)
        if (!shareCard) expect(dark ? m.bg === "rgb(24, 24, 28)" : m.bg === "rgb(255, 255, 255)", `${tag}: the page's ${dark ? "dark" : "light"}`, m.bg)
        if (!shareCard) expect(m.edge === 0, `${tag}: nothing inside reaches the corners in another colour`, m.edge)
        expect(m.sideways <= 0, `${tag}: no sideways scroll`, m.sideways)
        if (name === "phone" && !shareCard) expect(m.width === 390 && m.bottomGap <= 1, `${tag}: full width, on the bottom edge`, { width: m.width, gap: m.bottomGap })
        else expect(Math.abs(m.left - (vp.width - m.width) / 2) <= 1, `${tag}: centred`, { left: m.left, width: m.width })
        if (view === "legal") expect(m.legalLoaded && /Terms of service/.test(m.text), `${tag}: the terms, read in the sheet`, m.text)
        await p.screenshot({ path: join(shots, `${tag.replace(/ /g, "-")}.png`) })
        await p.close()
      }
    }
  }

  console.log("\nPillPanels fit")
  {
    const { p, errors } = await open(`/legal-probe?view=panels`, DESK)
    await sleep(1800)
    const read = () => p.evaluate(() => {
      const s = document.querySelector("[data-probe-scroller]")
      return { box: Math.round(document.querySelector("[data-pill-panels]").getBoundingClientRect().height), scroll: s.scrollHeight - s.clientHeight, built: document.querySelectorAll("[data-pill-panel]").length }
    })
    const short = await read()
    expect(errors.length === 0, "panels: no page errors", errors)
    expect(short.built === 2 && short.box === 220 && short.scroll === 0, "the short panel shown: the box is its height and nothing scrolls, with the tall one built", short)
    await p.evaluate(() => window.__setPanel("tall"))
    await sleep(500)
    const tall = await read()
    expect(tall.box === 2400, "the tall one shown: the box is its height", tall)
    await p.evaluate(() => window.__setPanel("short"))
    await sleep(500)
    const back = await read()
    expect(back.box === 220 && back.scroll === 0, "and back: short again", back)
    await p.close()
  }

  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} FAILED` : "\nall ok")
process.exit(broken ? 1 : 0)
