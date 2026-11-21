/**
 * ===========================================================================
 *  THE THEME MARKETPLACE POPUP, MEASURED (templates round 16)
 * ===========================================================================
 * The real Website page (WebsiteBuilderClient) mounted in Chromium with
 * fixture websites and listings, at 1440x900, 1024x768 and 390x844 (a
 * phone's touch screen at 2x):
 *
 *   THE PAGE
 *   • no Create a website section; it is there with `create` (the /ai page)
 *   • Browse themes: three template cards and the Explore more themes card,
 *     four to a row on a laptop, one on a phone, none cut off
 *   • a cover's frame has its shape before the picture arrives and nothing
 *     under it moves when it does; the picture is asked for through the
 *     optimizer with a srcset and sizes, lazily
 *
 *   THE POPUP ON A COMPUTER
 *   • opens from the heading's button and from the card; three cards to a
 *     row at 1440, two at 1024, every card whole inside the window
 *   • the page behind does not move by a pixel, open or closed
 *   • the window animates transform and opacity only, 200 to 280ms each way
 *   • the focus goes into the window, Tab stays inside it, Escape and a
 *     press on the dim close it, and the focus is back on the button
 *   • the address says ?themes=1 while it is open and not after
 *   • a cover slides by transform under a mouse and comes back
 *   • Add to library goes to Adding and then In library; with a full
 *     library the full library sheet is drawn over the window
 *   • the category filter narrows the grid and the order sorts it
 *   • ?themes=1 on arrival opens it; closing leaves the page, not the site
 *   • reduced motion: no animation at all
 *
 *   THE POPUP ON A PHONE
 *   • covers the whole screen, one card to a row, 44px controls
 *   • opening adds one history entry; Back closes it and stays on the page
 *   • the close button slides it away and the entry is gone
 *
 *   node scripts/check-theme-popup.mjs            SHOTS=dir saves pictures
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const out = mkdtempSync(join(tmpdir(), "storelib-theme-popup-"))
const SHOTS = process.env.SHOTS || ""
const fail = (m) => {
  console.error(m)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === "" ? "" : `   ${got}`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* The page's own stylesheet from source, so classes written today are in it. */
const css = (await appCss(root, join(root, "app/globals.css"))) + "\n" + interFaces(root)
const stubs = join(root, ".theme-popup-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, replace, scroll, ...rest }) {
  return React.createElement("a", { href: String(href), ...rest }, children)
}
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => window.location.pathname
export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {} })
export const useSearchParams = () => new URLSearchParams(window.location.search)
`)
writeFileSync(join(stubs, "toast.js"), `export const useToast = () => ({ toast(t) { (window.__toasts = window.__toasts || []).push(t.title) } })
`)
writeFileSync(join(stubs, "navbar.js"), `export const startNavigationLoading = () => {}
export const NavigationLoadingBar = () => null
`)
const aliases = [
  `--alias:next/link=${join(stubs, "link.jsx")}`,
  `--alias:next/navigation=${join(stubs, "navigation.js")}`,
  `--alias:@/hooks/use-toast=${join(stubs, "toast.js")}`,
  `--alias:@/components/app/navigation-loading-bar=${join(stubs, "navbar.js")}`,
  `--alias:@=${root}`,
]

/* A tall page, like a full page screenshot: bands a pan can be seen moving through. */
const tall = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="4600" viewBox="0 0 1280 4600"><rect width="1280" height="4600" fill="#fff"/><rect width="1280" height="72" fill="#fff"/><text x="64" y="46" font-family="Inter,Arial" font-size="24" font-weight="700" fill="#1a1a2e">Candle shop</text>${Array.from({ length: 11 }, (_, i) => `<rect y="${72 + i * 410}" width="1280" height="${i === 0 ? 560 : 240}" fill="${["#1f2937", "#e9e3d9", "#f3ede4", "#dbe4ee", "#111827", "#efe7dc"][i % 6]}"/><text x="80" y="${72 + i * 410 + 150}" font-family="Inter,Arial" font-size="64" font-weight="700" fill="${i % 6 === 0 || i % 6 === 4 ? "#fff" : "#374151"}">Section ${i + 1}</text>`).join("")}</svg>`

let browser
try {
  const liveJs = join(out, "live.js")
  try {
    execFileSync(
      "npx",
      ["--no-install", "esbuild", join(root, "scripts/render-theme-popup-probe.tsx"), "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${liveJs}`,
        '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
        '--define:process.env.NODE_ENV="production"', "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl", ...aliases],
      { stdio: ["ignore", "ignore", "inherit"] },
    )
  } catch {
    fail("The probe did not bundle. The error above is esbuild's.")
  }
  const js = readFileSync(liveJs)

  /* The app's shell in small: the document does not scroll, the page scrolls inside its own box. */
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style><style>*{box-sizing:border-box}html,body{height:100%;margin:0;overflow:hidden}body{background:#f8f9fa;font-family:Inter,system-ui,sans-serif}#root{height:100dvh}</style>`
  let coverDelay = 0
  const requested = []
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://x")
    if (url.pathname === "/cover.svg" || url.pathname === "/_next/image") {
      requested.push(req.url)
      if (coverDelay) await sleep(coverDelay)
      res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "no-store" })
      return res.end(tall)
    }
    if (url.pathname === "/live.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js) }
    if (url.pathname.startsWith("/api/")) {
      /* Add: a moment, then the new website's id. /api/website-builder/themes/[id]/cover and the rest answer nothing useful. */
      const add = /\/themes\/add$|\/marketplace\/add$/.test(url.pathname)
      if (add) await sleep(500)
      res.writeHead(add ? 200 : 404, { "content-type": "application/json" })
      return res.end(add ? JSON.stringify({ install: { id: "new-1" } }) : "{}")
    }
    res.writeHead(200, { "content-type": "text/html" })
    res.end(`<!doctype html><html><head>${head}</head><body><div id="root"></div><script src="/live.js"></script></body></html>`)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const origin = `http://127.0.0.1:${server.address().port}`

  browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
  const open = async (path, W, H, { reduce = false } = {}) => {
    const p = await browser.newPage()
    const phone = W < 768
    await p.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: phone, hasTouch: phone })
    await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: reduce ? "reduce" : "no-preference" }])
    p.on("pageerror", (e) => expect(false, `no script error at ${W}`, String(e).slice(0, 200)))
    await p.goto(`${origin}${path}`, { waitUntil: "networkidle0", timeout: 60_000 })
    await p.waitForSelector("[data-wb-page]")
    /* Browse themes waits two frames on a phone before it is laid out. */
    await sleep(120)
    return p
  }
  const shot = async (p, name) => {
    if (SHOTS) await p.screenshot({ path: join(SHOTS, `${name}.png`) })
  }
  /* Where the page's own things are: read before, during and after, and compared. */
  const pageRects = (p) =>
    p.evaluate(() => {
      const box = (el) => {
        if (!el) return null
        const r = el.getBoundingClientRect()
        return [r.left, r.top, r.width, r.height].map((n) => Math.round(n * 100) / 100)
      }
      const scroller = document.querySelector(".page-scroll")
      return {
        title: box(document.querySelector("[data-title-row] h1")),
        blocks: [...document.querySelectorAll("[data-page-block]")].map(box),
        cards: [...document.querySelectorAll("[data-theme-grid] > [data-template-card]")].map(box),
        scrollTop: scroller.scrollTop,
        scrollerWidth: scroller.clientWidth,
        docWidth: document.documentElement.clientWidth,
        bodyPadding: getComputedStyle(document.body).paddingRight,
        bodyMargin: getComputedStyle(document.body).marginRight,
      }
    })
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  const popup = (p) =>
    p.evaluate(() => {
      const el = document.querySelector("[data-themes-popup]")
      if (!el) return null
      const r = el.getBoundingClientRect()
      const scroll = el.querySelector("[data-themes-scroll]")
      const sr = scroll.getBoundingClientRect()
      const cards = [...el.querySelectorAll("[data-themes-grid] > [data-template-card]")]
      const rects = cards.map((c) => c.getBoundingClientRect())
      return {
        rect: [r.left, r.top, r.width, r.height].map(Math.round),
        state: el.getAttribute("data-state"),
        count: cards.length,
        columns: new Set(rects.map((c) => Math.round(c.left))).size,
        widths: [...new Set(rects.map((c) => Math.round(c.width)))],
        cut: rects.filter((c) => c.left < sr.left - 0.5 || c.right > sr.right + 0.5).length,
        sideways: scroll.scrollWidth - scroll.clientWidth,
        focusInside: el.contains(document.activeElement),
        title: el.querySelector("h2")?.textContent,
        closeRight: Math.round(r.right - el.querySelector("[data-themes-close]").getBoundingClientRect().right),
        titleLeft: Math.round(el.querySelector("h2").getBoundingClientRect().left - r.left),
        names: cards.map((c) => c.querySelector("h3").textContent),
      }
    })
  const openButton = "[data-theme-marketplace-open='heading']"
  const scrollToThemes = (p) => p.evaluate(() => document.querySelector("[data-theme-marketplace-open='heading']").scrollIntoView({ block: "center" }))
  /* The animations running on the window and the dim: their names, what they change, and how long. */
  const motion = (p) =>
    p.evaluate(() =>
      ["[data-themes-popup]", "[data-themes-scrim]"].map((sel) => {
        const el = document.querySelector(sel)
        if (!el) return null
        return el.getAnimations().map((a) => ({
          name: a.animationName,
          ms: a.effect.getTiming().duration,
          props: [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k)).filter((k) => !["offset", "easing", "composite", "computedOffset"].includes(k)))].sort(),
        }))
      }),
    )
  const onlyCompositor = (m) => m.every((list) => !list || list.every((a) => a.props.every((x) => x === "transform" || x === "opacity")))

  /* ══ 1. The page, 1440 ══════════════════════════════════════════════════ */
  {
    console.log("\nThe Website page, 1440 x 900\n")
    coverDelay = 700
    const p = await browser.newPage()
    await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 })
    await p.goto(`${origin}/app/website-builder`, { waitUntil: "domcontentloaded" })
    await p.waitForSelector("[data-wb-page]")
    await scrollToThemes(p)
    await sleep(150)
    const before = await pageRects(p)
    const pending = await p.evaluate(() => [...document.querySelectorAll("[data-theme-grid] img")].filter((i) => !i.complete).length)
    await p.waitForNetworkIdle({ idleTime: 300 })
    await sleep(100)
    const after = await pageRects(p)
    expect(pending > 0 && same(before.cards, after.cards) && same(before.blocks, after.blocks), "a cover arriving moves nothing: the frames had their shape first", `${pending} covers still loading at the first reading, card boxes equal: ${same(before.cards, after.cards)}`)
    coverDelay = 0

    const page = await p.evaluate(() => {
      const grid = document.querySelector("[data-theme-grid]")
      const cards = [...grid.querySelectorAll(":scope > [data-template-card]")]
      const rects = cards.map((c) => c.getBoundingClientRect())
      const frame = grid.querySelector("[data-template-frame]").getBoundingClientRect()
      const img = grid.querySelector("img[data-template-shot]")
      const first = document.querySelector("[data-wb-page] > section, [data-wb-page] > [data-page-block]")
      const blocks = [...document.querySelectorAll("[data-page-block]")].map((b) => b.getAttribute("aria-labelledby"))
      return {
        start: !!document.querySelector("[data-start-website]"),
        text: /Create a website|Start with AI|Describe your website|Candle shop example|From scratch|Other ways to start/.test(document.querySelector("[data-wb-page]").innerText.replace("Candle shop", "")),
        blocks,
        firstBlock: first?.getAttribute("aria-labelledby"),
        count: cards.length,
        explore: cards.filter((c) => c.getAttribute("data-template-card") === "explore").length,
        columns: new Set(rects.map((c) => Math.round(c.left))).size,
        widths: [...new Set(rects.map((c) => Math.round(c.width)))],
        ratio: +(frame.width / frame.height).toFixed(3),
        srcset: (img.getAttribute("srcset") || "").split(", ").length,
        optimizer: (img.getAttribute("srcset") || "").startsWith("/_next/image?url="),
        sizes: img.getAttribute("sizes"),
        lazy: img.getAttribute("loading"),
        drawn: Math.round(img.getBoundingClientRect().width),
        current: img.currentSrc.match(/[?&]w=(\d+)/)?.[1],
        blank: !!document.querySelector("[data-start-blank='library']"),
        link: document.querySelectorAll("a[href*='website-builder/themes'], a[href='/themes']").length,
      }
    })
    expect(!page.start && !page.text, "no Create a website section on the page", `blocks: ${page.blocks.join(", ")}`)
    expect(page.firstBlock === "live-heading", "the page starts with the websites", `first block: ${page.firstBlock}`)
    expect(page.count === 4 && page.explore === 1 && page.columns === 4 && page.widths.length === 1, "Browse themes: three templates and Explore more themes, four to a row, equal", `${page.count} cards, ${page.columns} columns, ${page.widths.join("/")}px wide`)
    expect(Math.abs(page.ratio - 4 / 3) < 0.01, "a small card's cover is 4:3", String(page.ratio))
    expect(page.optimizer && page.srcset >= 4 && !!page.sizes && page.lazy === "lazy", "covers come through the optimizer, with a srcset and sizes, lazily", `${page.srcset} widths, loading=${page.lazy}, sizes="${page.sizes}"`)
    expect(Number(page.current) >= page.drawn * 2 && Number(page.current) <= page.drawn * 2 * 1.6, "the picture asked for fits the size drawn at 2x", `drawn ${page.drawn}px, asked for w=${page.current}`)
    expect(page.blank, "Start from blank sits beside the Library heading")
    expect(page.link === 0, "nothing on the page links to a marketplace page", `${page.link} links`)
    await shot(p, "page-1440")

    /* ── Open ──────────────────────────────────────────────────────────── */
    console.log("\nThe popup, 1440 x 900\n")
    const closed = await pageRects(p)
    const hist0 = await p.evaluate(() => history.length)
    await p.click(openButton)
    await sleep(60)
    const during = await motion(p)
    const midway = await pageRects(p)
    await shot(p, "popup-1440-opening")
    await sleep(400)
    const opened = await pageRects(p)
    const m = await popup(p)
    const win = during[0]?.[0]
    expect(!!m && m.state === "open", "Theme marketplace opens the popup over the page", m ? `${m.rect[2]} x ${m.rect[3]} at ${m.rect[0]}, ${m.rect[1]}` : "no popup")
    expect(!!win && win.name === "wb-themes-in" && win.ms >= 200 && win.ms <= 280 && onlyCompositor(during), "it arrives on transform and opacity only, in 200 to 280ms", JSON.stringify(during))
    expect(same(closed, midway) && same(closed, opened), "the page behind does not move, opening or open", `scrollTop ${closed.scrollTop} -> ${opened.scrollTop}, width ${closed.scrollerWidth} -> ${opened.scrollerWidth}, body padding ${opened.bodyPadding}`)
    expect(m.columns === 3 && m.widths.length === 1 && m.cut === 0 && m.sideways === 0, "three cards to a row, equal, every card whole inside the window", `${m.count} cards, ${m.columns} columns, ${m.widths.join("/")}px, ${m.cut} cut, sideways scroll ${m.sideways}`)
    expect(m.title === "Theme marketplace" && m.titleLeft <= 24 && m.closeRight <= 24, "the title at the top left, the close button at the top right", `title ${m.titleLeft}px from the left, close ${m.closeRight}px from the right`)
    expect(m.rect[0] === Math.round((1440 - m.rect[2]) / 2) && m.rect[1] === Math.round((900 - m.rect[3]) / 2), "the window is in the middle", `${m.rect.join(", ")}`)
    expect(m.focusInside, "the focus is inside the window")
    expect((await p.evaluate(() => location.search)) === "?themes=1" && (await p.evaluate(() => history.length)) === hist0 + 1, "the address says ?themes=1 on one new history entry")
    await shot(p, "popup-1440")

    /* A card, whole: its picture, name, author, price, Preview and Add. */
    const card = await p.evaluate(() => {
      const c = document.querySelector("[data-themes-grid] [data-template-card]")
      const f = c.querySelector("[data-template-frame]").getBoundingClientRect()
      const img = c.querySelector("img")
      const ir = img.getBoundingClientRect()
      return {
        ratio: +(f.width / f.height).toFixed(3),
        top: Math.round(ir.top - f.top),
        taller: ir.height > f.height + 50,
        name: c.querySelector("h3").textContent,
        by: c.querySelector("p").textContent,
        price: c.querySelector("[data-template-price]").textContent,
        actions: [...c.querySelectorAll("[data-template-action]")].map((a) => `${a.getAttribute("data-template-action")}:${a.textContent.trim()}`),
        eager: img.getAttribute("loading"),
        drawn: Math.round(ir.width),
        current: img.currentSrc.match(/[?&]w=(\d+)/)?.[1],
      }
    })
    expect(Math.abs(card.ratio - 1.25) < 0.01 && card.top === 0 && card.taller, "a big card's cover is 5:4, the page from its top", `ratio ${card.ratio}, picture ${card.top}px from the frame's top`)
    expect(!!card.name && /^by /.test(card.by) && !!card.price && card.actions.length === 2, "name, author, price, Preview and Add to library", `${card.name} / ${card.by} / ${card.price} / ${card.actions.join(", ")}`)
    expect(Number(card.current) >= card.drawn * 2 && Number(card.current) <= card.drawn * 2 * 1.6, "its picture fits the size drawn at 2x", `drawn ${card.drawn}px, asked for w=${card.current}`)

    /* ── Hover: the page slides, by transform ──────────────────────────── */
    const frame = await p.$("[data-themes-grid] [data-template-frame]")
    const fb = await frame.boundingBox()
    const readShot = () => p.evaluate(() => {
      const img = document.querySelector("[data-themes-grid] img[data-template-shot]")
      const c = getComputedStyle(img)
      return { y: new DOMMatrix(c.transform).m42, prop: c.transitionProperty, top: c.top }
    })
    await p.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2)
    await sleep(700)
    const hov = await readShot()
    await p.mouse.move(5, 5)
    await sleep(1100)
    const left = await readShot()
    expect(hov.y < -40 && hov.prop === "transform" && Math.abs(left.y) < 1, "under a mouse the cover slides up by transform, and comes back", `${Math.round(hov.y)}px after 700ms, ${Math.round(left.y)}px after leaving, transition-property ${hov.prop}`)

    /* ── Focus stays inside ────────────────────────────────────────────── */
    let escaped = 0
    for (let i = 0; i < 40; i++) {
      await p.keyboard.press("Tab")
      if (!(await p.evaluate(() => document.querySelector("[data-themes-popup]").contains(document.activeElement)))) escaped++
    }
    expect(escaped === 0, "forty Tabs never leave the window", `${escaped} outside`)

    /* ── Filter and order ──────────────────────────────────────────────── */
    const cats = await p.$$eval("[data-themes-category]", (b) => b.map((x) => x.getAttribute("data-themes-category")))
    await p.click(`[data-themes-category='${cats[1]}']`)
    await sleep(60)
    const narrowed = await popup(p)
    await p.click("[data-themes-category='all']")
    await p.select("[data-themes-sort]", "name")
    await sleep(60)
    const sorted = await popup(p)
    await p.select("[data-themes-sort]", "featured")
    expect(cats.length > 2 && narrowed.count > 0 && narrowed.count < m.count, "a category narrows the grid", `${cats.length - 1} categories; ${cats[1]}: ${narrowed.count} of ${m.count}`)
    expect(same(sorted.names, [...sorted.names].sort((a, b) => a.localeCompare(b))) && !same(sorted.names, m.names), "Name puts them in order", sorted.names.slice(0, 4).join(", "))

    /* ── Escape ────────────────────────────────────────────────────────── */
    await p.keyboard.press("Escape")
    await sleep(50)
    const leaving = await motion(p)
    const lw = leaving[0]?.[0]
    const midClose = await pageRects(p)
    await sleep(400)
    const gone = await popup(p)
    const back = await pageRects(p)
    expect(!!lw && lw.name === "wb-themes-out" && lw.ms >= 200 && lw.ms <= 280 && onlyCompositor(leaving), "Escape: it leaves on transform and opacity only, in 200 to 280ms", JSON.stringify(leaving))
    expect(gone === null, "and it is out of the page after")
    expect(same(closed, midClose) && same(closed, back), "the page behind did not move while it closed")
    expect(await p.evaluate((s) => document.activeElement === document.querySelector(s), openButton), "the focus is back on Theme marketplace")
    expect((await p.evaluate(() => location.search)) === "", "the address is the page's own again")

    /* ── The dim closes it; the card opens it ──────────────────────────── */
    await p.click("[data-theme-marketplace-open='card']")
    await sleep(420)
    const viaCard = await popup(p)
    await p.mouse.click(12, 12)
    await sleep(420)
    expect(!!viaCard && (await popup(p)) === null, "Explore more themes opens it, and a press on the dim closes it")
    expect(await p.evaluate(() => document.activeElement === document.querySelector("[data-theme-marketplace-open='card']")), "the focus is back on the card's button")

    /* ── Add ───────────────────────────────────────────────────────────── */
    await p.click(openButton)
    await sleep(420)
    const addSel = "[data-themes-grid] [data-template-card='fern'] :is(button, span)[data-template-action]"
    await p.click(addSel)
    await sleep(120)
    const adding = await p.$eval(addSel, (b) => `${b.getAttribute("data-template-action")}:${b.textContent.trim()}:${b.disabled}`)
    const others = await p.$$eval("[data-themes-grid] [data-template-action='add']", (b) => b.every((x) => x.disabled))
    await sleep(900)
    const added = await p.$eval(addSel, (b) => `${b.getAttribute("data-template-action")}:${b.textContent.trim()}`)
    expect(adding === "adding:Adding:true" && others && added === "in-library:In library", "Add to library: Adding (the others wait), then In library", `${adding} -> ${added}; toast: ${await p.evaluate(() => (window.__toasts || []).join(" | "))}`)
    const paid = await p.$$eval("[data-themes-grid] [data-template-action='view']", (a) => a.map((x) => x.getAttribute("href")))
    expect(paid.length === 2 && paid.every((h) => h.startsWith("/themes/")), "a theme with a price or a plan shows View, to its own page", paid.join(", "))
    await shot(p, "popup-1440-added")
    await p.close()
  }

  /* ══ 2. A full library ══════════════════════════════════════════════════ */
  for (const [W, H] of [[1440, 900], [390, 844]]) {
    console.log(`\nA full library, ${W} x ${H}\n`)
    const p = await open("/app/website-builder?full=1", W, H)
    await scrollToThemes(p)
    await (W < 768 ? p.tap(openButton) : p.click(openButton))
    await sleep(450)
    const addSel = "[data-themes-grid] [data-template-card='bright-coach'] :is(button, span)[data-template-action]"
    await p.$eval(addSel, (b) => b.scrollIntoView({ block: "center" }))
    await sleep(80)
    await (W < 768 ? p.tap(addSel) : p.click(addSel))
    await sleep(700)
    const full = await p.evaluate(() => {
      const el = document.querySelector("[data-library-full]")
      if (!el) return null
      const r = el.getBoundingClientRect()
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + 24)
      return { surface: el.getAttribute("data-surface"), onTop: el.contains(at) || !!at?.closest("[data-sheet-root]"), popup: !!document.querySelector("[data-themes-popup]"), text: el.closest("[role='alertdialog'], [data-sheet-root]")?.textContent.slice(0, 40) }
    })
    expect(!!full && full.onTop && full.popup, "Add with no room: the full library sheet is drawn over the popup, which stays", full ? `${full.surface}: "${full.text}"` : "no sheet")
    await shot(p, `full-${W}`)
    /* Its Close is pressable there, and closing it leaves the marketplace open. */
    const closeBtn = await p.evaluateHandle(() => [...document.querySelectorAll("[role='alertdialog'] button, [data-sheet-root] button")].find((b) => b.textContent.trim() === "Close"))
    await (W < 768 ? closeBtn.asElement().tap() : closeBtn.asElement().click())
    await sleep(700)
    const after = await p.evaluate(() => ({ full: !!document.querySelector("[data-library-full]") && !!document.querySelector("[role='alertdialog'], [data-app-sheet='open']"), popup: document.querySelector("[data-themes-popup]")?.getAttribute("data-state") }))
    expect(!after.full && after.popup === "open", "its Close closes the sheet alone", JSON.stringify(after))
    await p.close()
  }

  /* ══ 3. 1024: two to a row ══════════════════════════════════════════════ */
  {
    console.log("\nThe popup, 1024 x 768\n")
    const p = await open("/app/website-builder", 1024, 768)
    await scrollToThemes(p)
    const closed = await pageRects(p)
    await p.click(openButton)
    await sleep(450)
    const m = await popup(p)
    expect(m.columns === 2 && m.cut === 0 && m.sideways === 0 && m.widths.length === 1, "two cards to a row, every card whole", `${m.columns} columns, ${m.widths.join("/")}px, window ${m.rect[2]} x ${m.rect[3]}`)
    expect(same(closed, await pageRects(p)), "the page behind does not move")
    await shot(p, "popup-1024")
    await p.close()
  }

  /* ══ 4. A link that arrives with ?themes=1, and the /ai page ════════════ */
  {
    console.log("\nA link with ?themes=1, and the page with Create a website\n")
    const p = await open("/app/website-builder?themes=1&theme=bright-coach", 1440, 900)
    await sleep(450)
    const m = await popup(p)
    const len = await p.evaluate(() => history.length)
    const inView = await p.evaluate(() => {
      const c = document.querySelector("[data-themes-grid] [data-template-card='bright-coach']").getBoundingClientRect()
      const s = document.querySelector("[data-themes-scroll]").getBoundingClientRect()
      return c.top >= s.top && c.bottom <= s.bottom
    })
    expect(!!m && m.state === "open" && inView, "it opens on arrival, with the theme the link named in view")
    await p.click("[data-themes-close]")
    await sleep(420)
    expect((await popup(p)) === null && (await p.evaluate(() => location.pathname + location.search)) === "/app/website-builder" && (await p.evaluate(() => history.length)) === len, "closing it stays on the page and takes the words out of the address", await p.evaluate(() => location.pathname + location.search))
    expect(await p.evaluate((s) => document.activeElement === document.querySelector(s), openButton), "the focus goes to Theme marketplace, having no opener to return to")
    await p.close()

    const a = await open("/app/website-builder/ai?create=1", 1440, 900)
    const ai = await a.evaluate(() => ({
      start: document.querySelector("[data-start-website]")?.getAttribute("data-start-website"),
      first: document.querySelector("[data-page-block]")?.hasAttribute("data-start-website"),
      doors: [...document.querySelectorAll("[data-start-door]")].map((d) => d.getAttribute("data-start-door")),
      chips: document.querySelectorAll("[data-start-example]").length,
      modes: document.querySelectorAll("[data-start-generation-option]").length,
      quiet: !!document.querySelector("[data-start-blank='library']"),
    }))
    expect(ai.start === "open" && ai.first && same(ai.doors, ["ai", "blank", "themes"]) && ai.chips === 4 && ai.modes === 2, "with `create` the section is at the top: Start with AI, four examples, both modes, blank, themes", JSON.stringify(ai))
    expect(!ai.quiet, "and the Library heading does not repeat Start from blank")
    await a.click("[data-start-door='themes']")
    await sleep(420)
    expect((await popup(a))?.state === "open", "its Browse themes door opens the popup over that page")
    await shot(a, "ai-1440-popup")
    await a.keyboard.press("Escape")
    await sleep(420)
    expect(await a.evaluate(() => document.activeElement === document.querySelector("[data-start-door='themes']")), "and gets the focus back")
    await shot(a, "ai-1440")
    await a.close()

    const e = await open("/app/website-builder?empty=1", 1440, 900)
    const empty = await e.evaluate(() => ({
      card: document.querySelector("[data-live-empty]")?.getAttribute("data-live-empty"),
      add: [...document.querySelectorAll("[data-live-empty] button")].map((b) => b.textContent.trim()),
      templates: document.querySelectorAll("[data-theme-grid] > [data-template-card]").length,
      market: !!document.querySelector("[data-theme-marketplace-open='heading']"),
    }))
    expect(empty.card === "first" && empty.add.length === 2 && empty.templates === 4 && empty.market, "an empty library: a template in one press, Start from blank, and the templates under it", JSON.stringify(empty))
    await shot(e, "empty-1440")
    await e.close()
  }

  /* ══ 5. Reduced motion ══════════════════════════════════════════════════ */
  {
    console.log("\nReduced motion\n")
    const p = await open("/app/website-builder", 1440, 900, { reduce: true })
    await scrollToThemes(p)
    await p.click(openButton)
    await sleep(40)
    const m = await motion(p)
    const there = await popup(p)
    await p.keyboard.press("Escape")
    await sleep(60)
    expect(!!there && m.every((l) => l && l.length === 0) && (await popup(p)) === null, "no animation: it is there, then it is not", JSON.stringify(m))
    await p.close()
  }

  /* ══ 6. A phone ═════════════════════════════════════════════════════════ */
  {
    console.log("\nA phone, 390 x 844 at 2x\n")
    const p = await open("/app/website-builder", 390, 844)
    const page = await p.evaluate(() => {
      const grid = document.querySelector("[data-theme-grid]")
      const cards = [...grid.querySelectorAll(":scope > [data-template-card]")].map((c) => c.getBoundingClientRect())
      return { start: !!document.querySelector("[data-start-website]"), columns: new Set(cards.map((c) => Math.round(c.left))).size, widths: [...new Set(cards.map((c) => Math.round(c.width)))], overflow: document.querySelector(".page-scroll").scrollWidth - document.querySelector(".page-scroll").clientWidth }
    })
    expect(!page.start && page.columns === 1 && page.overflow === 0, "the page: no Create a website, one template to a row, nothing off the side", `${page.widths.join("/")}px wide, overflow ${page.overflow}`)
    await shot(p, "page-390")
    await scrollToThemes(p)
    await sleep(80)
    await shot(p, "page-390-themes")
    const closed = await pageRects(p)
    const len = await p.evaluate(() => history.length)
    await p.tap(openButton)
    await sleep(90)
    const during = await motion(p)
    await shot(p, "popup-390-opening")
    await sleep(420)
    const m = await popup(p)
    const up = during[0]?.[0]
    expect(same(m.rect, [0, 0, 390, 844]), "it covers the whole screen", m.rect.join(", "))
    expect(!!up && up.name === "wb-themes-up" && up.ms >= 200 && up.ms <= 280 && up.props.join() === "transform", "it slides up by transform, in 200 to 280ms", JSON.stringify(during[0]))
    expect(m.columns === 1 && m.cut === 0 && m.sideways === 0 && m.widths[0] === 358, "one card to a row, whole, on the 16px gutters", `${m.widths.join("/")}px, ${m.cut} cut`)
    const small = await p.evaluate(() => [...document.querySelectorAll("[data-themes-popup] :is(button, a, select)")].map((el) => ({ t: (el.getAttribute("aria-label") || el.textContent).trim().slice(0, 18), h: Math.round(el.getBoundingClientRect().height), filter: el.hasAttribute("data-themes-category") || el.hasAttribute("data-themes-sort"), frame: el.hasAttribute("data-template-frame") })).filter((x) => !x.frame && x.h < (x.filter ? 36 : 44)))
    expect(small.length === 0, "Close, Preview and Add are 44px or taller; the filter row 36px", small.map((s) => `${s.t} ${s.h}`).join(", "))
    const safe = await p.evaluate(() => {
      const css = [...document.querySelectorAll("[data-themes-head], [data-themes-scroll]")].map((e) => e.className).join(" ")
      return ["safe-area-inset-top", "safe-area-inset-bottom", "safe-area-inset-left", "safe-area-inset-right"].filter((k) => !css.includes(k))
    })
    expect(safe.length === 0, "the head and the list are padded by the safe areas", safe.join(", "))
    expect(same(closed, await pageRects(p)), "the page behind does not move")
    expect((await p.evaluate(() => history.length)) === len + 1, "opening adds one history entry")
    await shot(p, "popup-390")
    await p.evaluate(() => document.querySelector("[data-themes-scroll]").scrollTo(0, 560))
    await sleep(150)
    await shot(p, "popup-390-scrolled")

    await p.goBack({ waitUntil: "domcontentloaded" }).catch(() => null)
    await sleep(60)
    const down = (await motion(p))[0]?.[0]
    await sleep(420)
    expect((await popup(p)) === null && (await p.evaluate(() => location.pathname + location.search)) === "/app/website-builder" && !!(await p.$("[data-wb-page]")), "Back closes it and stays on the Website page", await p.evaluate(() => location.pathname + location.search))
    expect(!!down && down.name === "wb-themes-down" && down.ms >= 200 && down.ms <= 280 && down.props.join() === "transform", "sliding down by transform, in 200 to 280ms", JSON.stringify(down))

    await p.tap(openButton)
    await sleep(450)
    await p.tap("[data-themes-close]")
    await sleep(450)
    const end = await p.evaluate(() => ({ path: location.pathname + location.search, page: !!document.querySelector("[data-wb-page]"), popup: !!document.querySelector("[data-themes-popup]") }))
    expect(!end.popup && end.page && end.path === "/app/website-builder", "the close button closes it and the address is the page's own", JSON.stringify(end))
    await p.goForward({ waitUntil: "domcontentloaded" }).catch(() => null)
    await sleep(450)
    const fwd = await popup(p)
    if (fwd) {
      await p.tap("[data-themes-close]")
      await sleep(450)
    }
    expect(!!(await p.$("[data-wb-page]")) && (await popup(p)) === null && (await p.evaluate(() => location.search)) === "", "Forward onto its entry opens it again, and closing goes back over that entry", `opened by Forward: ${!!fwd}`)
    await p.close()
  }

  server.close()
} finally {
  if (browser) await browser.close()
  rmSync(stubs, { recursive: true, force: true })
  rmSync(out, { recursive: true, force: true })
}

console.log(broken ? `\n${broken} failed\n` : "\nall passed\n")
process.exit(broken ? 1 : 0)
