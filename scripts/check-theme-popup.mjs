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
 *   • Browse themes: six template cards, three to a row on a laptop, one on
 *     a phone, none cut off, then Show more, which opens the popup
 *   • a cover's frame has its shape before the picture arrives and nothing
 *     under it moves when it does; the picture is asked for through the
 *     optimizer with a srcset and sizes, lazily
 *
 *   THE POPUP ON A COMPUTER
 *   • opens from the heading's button and from Show more; lists every
 *     listing the page was given; three cards to a row at 1440, two at 1024,
 *     every card whole inside the window
 *   • the category chips: the chosen one on a dark pill that slides to the
 *     next by transform; a hover and a press each shade a chip; no chip is
 *     clipped by the row
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
 *   THE PREVIEW
 *   • a cover opens it over the popup, on transform and opacity, 200 to
 *     280ms, one history entry; the popup and the page under it do not move
 *   • its bar: Back, the name, the desktop and phone switch, Add, close;
 *     the desktop picture drawn at the width it was taken at, crisp
 *   • the switch crossfades to the phone picture at 390px
 *   • Escape and Back land on the grid with the focus on the cover; close
 *     closes the popup too, the address is the page's own and the focus is
 *     on what opened the marketplace
 *   • on a phone: the whole screen, sliding in from the right, inside the
 *     safe areas, on the phone picture; the system's back lands on the grid
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
    if (url.pathname.startsWith("/themes/") && /^[\w/.-]+$/.test(url.pathname) && existsSync(join(root, "public", url.pathname))) {
      res.writeHead(200, { "content-type": "image/webp", "cache-control": "no-store" })
      return res.end(readFileSync(join(root, "public", url.pathname)))
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
    if (!phone) await asMouse(p)
    /* Browse themes waits two frames on a phone before it is laid out. */
    await sleep(120)
    return p
  }
  /*
    A MOUSE. Headless Chromium says it has no hover and no fine pointer, so
    every `pointer-fine:` rule (a hover's shade, the cover's Preview label)
    would never apply. On a computer's width the page's stylesheet is read
    as a mouse's: those media conditions are made true.
  */
  const asMouse = (p) =>
    p.evaluate(() => {
      for (const el of document.querySelectorAll("style")) {
        if (!el.textContent.includes("(hover: hover)")) continue
        el.textContent = el.textContent.replaceAll("(hover: hover) and (pointer: fine)", "all").replaceAll("@media (hover: hover)", "@media all")
      }
      return matchMedia("(hover: hover)").matches
    })
  const shot = async (p, name) => {
    if (SHOTS) await p.screenshot({ path: join(SHOTS, `${name}.png`), captureBeyondViewport: false })
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
    await asMouse(p)
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
        more: document.querySelector("[data-theme-marketplace-open='more']")?.textContent.trim() ?? null,
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
    expect(page.count === 6 && page.explore === 0 && page.columns === 3 && page.widths.length === 1 && page.more === "Show more", "Browse themes: six templates, three to a row, equal, then Show more", `${page.count} cards, ${page.columns} columns, ${page.widths.join("/")}px wide, button "${page.more}"`)
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
    const below = await p.evaluate(() => {
      const r = document.querySelector("[data-themes-popup]").getBoundingClientRect()
      const at = document.elementFromPoint(r.left + 200, r.bottom + 8)
      return at?.hasAttribute("data-themes-scrim") ? "scrim" : at?.outerHTML.slice(0, 120)
    })
    expect(below === "scrim", "nothing of the grid is under the pointer past the window's foot", below)
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
        preview: c.querySelector("[data-template-preview]")?.getAttribute("aria-label") ?? null,
        eager: img.getAttribute("loading"),
        drawn: Math.round(ir.width),
        current: img.currentSrc.match(/[?&]w=(\d+)/)?.[1],
      }
    })
    expect(Math.abs(card.ratio - 1.25) < 0.01 && card.top === 0 && card.taller, "a big card's cover is 5:4, the page from its top", `ratio ${card.ratio}, picture ${card.top}px from the frame's top`)
    expect(!!card.name && /^by /.test(card.by) && !!card.price && card.actions.length === 1 && card.actions[0] === "add:Add to library" && card.preview === `Preview ${card.name}`, "name, author, price, one Add to library, and the cover is Preview", `${card.name} / ${card.by} / ${card.price} / ${card.actions.join(", ")} / ${card.preview}`)
    const listed = await p.evaluate(() => ({ given: window.__probeListings, shown: [...document.querySelectorAll("[data-themes-grid] > [data-template-card]")].map((c) => c.getAttribute("data-template-card")), count: document.querySelector("[data-themes-popup] h2 + span")?.textContent }))
    expect(listed.given.length === listed.shown.length && listed.given.every((g) => listed.shown.includes(g)) && listed.count === String(listed.given.length), "the popup lists every listing the page was given, and says how many", `${listed.shown.length} of ${listed.given.length} shown, count "${listed.count}"`)
    expect(Number(card.current) >= card.drawn * 2 && Number(card.current) <= card.drawn * 2 * 1.6, "its picture fits the size drawn at 2x", `drawn ${card.drawn}px, asked for w=${card.current}`)

    /* ── Hover: the page slides, by transform ──────────────────────────── */
    const frame = await p.$("[data-themes-grid] [data-template-frame]")
    const fb = await frame.boundingBox()
    const readShot = () => p.evaluate(() => {
      const img = document.querySelector("[data-themes-grid] img[data-template-shot]")
      const c = getComputedStyle(img)
      return { y: new DOMMatrix(c.transform).m42, prop: c.transitionProperty, top: c.top }
    })
    const hintOf = () => p.evaluate(() => {
      const h = document.querySelector("[data-themes-grid] [data-template-hint]")
      const t = getComputedStyle(h).translate.split(" ")
      return { o: +getComputedStyle(h).opacity, y: Math.round(parseFloat(t[1] ?? "0") * 10) / 10 }
    })
    const hint0 = await hintOf()
    await p.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2)
    await sleep(700)
    const hov = await readShot()
    const hint1 = await hintOf()
    await shot(p, "popup-1440-hover")
    expect(hint0.o === 0 && hint1.o === 1 && hint1.y === 0 && hint0.y > 0, "under a mouse a Preview label rises onto the cover", `opacity ${hint0.o} -> ${hint1.o}, y ${hint0.y} -> ${hint1.y}`)
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

    /* ── The category chips: chosen, hover, press, no clipping ─────────── */
    const chips = () => p.evaluate(() => {
      const row = document.querySelector("[data-themes-categories]")
      const rr = row.getBoundingClientRect()
      const pill = row.querySelector("[data-themes-category-pill]")
      const btns = [...row.querySelectorAll("[data-themes-category]")]
      const on = btns.find((b) => b.getAttribute("aria-pressed") === "true")
      const pr = pill?.getBoundingClientRect()
      const or = on.getBoundingClientRect()
      return {
        on: on.getAttribute("data-themes-category"),
        onColor: getComputedStyle(on).color,
        pillOver: !!pr && Math.abs(pr.left - or.left) < 1 && Math.abs(pr.width - or.width) < 1 && Math.abs(pr.top - or.top) < 1 && Math.abs(pr.height - or.height) < 1,
        pillBg: pill ? getComputedStyle(pill).backgroundColor : null,
        pillMotion: pill ? getComputedStyle(pill).transitionProperty + " " + getComputedStyle(pill).transitionDuration : null,
        clipped: btns.filter((b) => { const r = b.getBoundingClientRect(); return r.top < rr.top + 3 || r.bottom > rr.bottom - 3 }).length,
        radius: getComputedStyle(btns[0]).borderRadius,
        bgs: btns.map((b) => getComputedStyle(b).backgroundColor),
      }
    })
    /* Forty Tabs above walked the focus along the row and scrolled it: back to its start. */
    await p.evaluate(() => document.querySelector("[data-themes-categories]").scrollTo({ left: 0, behavior: "instant" }))
    await sleep(60)
    const c0 = await chips()
    expect(c0.on === "all" && c0.pillOver && c0.pillBg === "rgb(26, 26, 46)" && c0.onColor === "rgb(255, 255, 255)" && /translate/.test(c0.pillMotion) && /0\.22s/.test(c0.pillMotion), "the chosen chip: white words on the dark pill, which slides by translate in 220ms", `${c0.on}, pill over it ${c0.pillOver}, ${c0.pillBg}, ${c0.pillMotion}`)
    expect(c0.clipped === 0 && parseFloat(c0.radius) > 100, "chips are round and none is clipped by the row (room for the focus ring)", `${c0.clipped} clipped, radius ${c0.radius}`)
    const second = await p.$("[data-themes-category]:nth-of-type(2)")
    const sb = await second.boundingBox()
    await p.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2)
    await sleep(260)
    const hoverBg = await second.evaluate((b) => getComputedStyle(b).backgroundColor)
    await p.mouse.down()
    await sleep(260)
    const pressBg = await second.evaluate((b) => getComputedStyle(b).backgroundColor)
    await p.mouse.up()
    await sleep(80)
    const sliding = await p.evaluate(() => document.querySelector("[data-themes-category-pill]").getAnimations().length + " " + new DOMMatrix(getComputedStyle(document.querySelector("[data-themes-category-pill]")).transform).m41)
    await sleep(300)
    const c1 = await chips()
    const alpha = (c) => parseFloat(c.match(/\/ ([\d.]+)\)$/)?.[1] ?? c.match(/, ([\d.]+)\)$/)?.[1] ?? "0")
    expect(Math.abs(alpha(hoverBg) - 0.05) < 0.005 && Math.abs(alpha(pressBg) - 0.09) < 0.005, "a hover shades a chip, a press shades it more", `hover ${hoverBg}, press ${pressBg}`)
    expect(c1.on !== "all" && c1.pillOver, "a press moves the pill to that chip", `${c1.on}, pill over it ${c1.pillOver}, mid-slide ${sliding}`)
    await shot(p, "popup-1440-chips")
    await p.click("[data-themes-category='all']")
    await sleep(300)

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

    /* ── The dim closes it; Show more opens it ─────────────────────────── */
    await p.$eval("[data-theme-marketplace-open='more']", (b) => b.scrollIntoView({ block: "center" }))
    await sleep(80)
    const beforeMore = await pageRects(p)
    await p.click("[data-theme-marketplace-open='more']")
    await sleep(60)
    const moreMotion = await motion(p)
    await sleep(380)
    const viaMore = await popup(p)
    const underMore = await pageRects(p)
    await p.mouse.click(12, 12)
    await sleep(420)
    expect(!!viaMore && viaMore.count === (await p.evaluate(() => window.__probeListings.length)) && moreMotion[0]?.[0]?.name === "wb-themes-in" && (await popup(p)) === null, "Show more opens it with every theme, smoothly, and a press on the dim closes it", `${viaMore?.count} cards, ${JSON.stringify(moreMotion[0])}`)
    expect(same(beforeMore, underMore), "the page did not move under it")
    expect(await p.evaluate(() => document.activeElement === document.querySelector("[data-theme-marketplace-open='more']")), "the focus is back on Show more")

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
    expect(empty.card === "first" && empty.add.length === 2 && empty.templates === 6 && empty.market, "an empty library: a template in one press, Start from blank, and the templates under it", JSON.stringify(empty))
    await shot(e, "empty-1440")
    await e.close()
  }

  /* ══ 4b. The preview, 1440 ═════════════════════════════════════════════ */
  const preview = (p) =>
    p.evaluate(() => {
      const el = document.querySelector("[data-theme-preview]")
      if (!el) return null
      const r = el.getBoundingClientRect()
      const bar = el.querySelector("[data-preview-bar]").getBoundingClientRect()
      const layers = [...el.querySelectorAll("[data-preview-layer]")].map((l) => {
        const img = l.querySelector("img")
        const ir = img.getBoundingClientRect()
        return { d: l.getAttribute("data-preview-layer"), o: +getComputedStyle(l).opacity, inert: l.inert, w: Math.round(ir.width), natural: img.naturalWidth, src: img.getAttribute("src"), scroll: l.scrollHeight > l.clientHeight }
      })
      const sw = el.querySelector("[data-preview-switch]")
      return {
        rect: [r.left, r.top, r.width, r.height].map(Math.round),
        state: el.getAttribute("data-state"),
        device: el.getAttribute("data-device"),
        bar: Math.round(bar.height),
        title: el.querySelector("h2")?.textContent,
        back: !!el.querySelector("[data-preview-back]"),
        close: !!el.querySelector("[data-preview-close]"),
        add: el.querySelector("[data-preview-bar] [data-template-action]")?.innerText.trim() ?? null,
        switch: sw ? [...sw.querySelectorAll("[data-preview-device]")].map((b) => `${b.getAttribute("data-preview-device")}:${b.getAttribute("aria-pressed")}`) : null,
        switchCentre: sw ? Math.round(sw.getBoundingClientRect().left + sw.getBoundingClientRect().width / 2 - (r.left + r.width / 2)) : null,
        layers,
        focusInside: el.contains(document.activeElement),
        safe: ["safe-area-inset-top", "safe-area-inset-left", "safe-area-inset-right"].filter((k) => !el.querySelector("[data-preview-bar]").className.includes(k)),
      }
    })
  const previewMotion = (p) =>
    p.evaluate(() =>
      ["[data-theme-preview]", "[data-preview-scrim]"].map((sel) => {
        const el = document.querySelector(sel)
        if (!el) return null
        return el.getAnimations().filter((a) => a.animationName).map((a) => ({
          name: a.animationName,
          ms: a.effect.getTiming().duration,
          props: [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k)).filter((k) => !["offset", "easing", "composite", "computedOffset"].includes(k)))].sort(),
        }))
      }),
    )
  const gridRect = (p) => p.evaluate(() => {
    const g = document.querySelector("[data-themes-grid]")
    const r = g?.getBoundingClientRect()
    return r ? [r.left, r.top, r.width, r.height, document.querySelector("[data-themes-scroll]").scrollTop].map((n) => Math.round(n * 100) / 100) : null
  })
  {
    console.log("\nThe preview, 1440 x 900\n")
    const p = await open("/app/website-builder", 1440, 900)
    await scrollToThemes(p)
    await p.click(openButton)
    await sleep(450)
    const cover = "[data-themes-grid] [data-template-card='clothing'] [data-template-preview]"
    await p.$eval(cover, (b) => b.scrollIntoView({ block: "center" }))
    await sleep(100)
    const page0 = await pageRects(p)
    const grid0 = await gridRect(p)
    const len = await p.evaluate(() => history.length)
    await p.click(cover)
    await sleep(60)
    const inMotion = await previewMotion(p)
    await shot(p, "preview-1440-opening")
    await sleep(500)
    await p.waitForFunction(() => [...document.querySelectorAll("[data-preview-layer] img")].every((i) => i.complete), { timeout: 10_000 }).catch(() => null)
    await sleep(250)
    const v = await preview(p)
    const desk = v?.layers.find((l) => l.d === "desktop")
    const mob = v?.layers.find((l) => l.d === "phone")
    const win = inMotion[0]?.[0]
    expect(!!v && v.state === "open" && v.title === "Clothing", "a cover opens its preview over the popup", v ? `${v.rect.join(", ")}, "${v.title}"` : "no preview")
    expect(!!win && win.name === "wb-preview-in" && win.ms >= 200 && win.ms <= 280 && onlyCompositor(inMotion), "it arrives on transform and opacity only, in 200 to 280ms", JSON.stringify(inMotion))
    expect(v.back && v.close && v.add === "Add to library" && same(v.switch, ["desktop:true", "phone:false"]) && Math.abs(v.switchCentre) <= 1, "its bar: Back, the name, the switch in the middle on Desktop, Add to library, close", `${v.bar}px tall, switch ${v.switch}, ${v.switchCentre}px off centre, add "${v.add}"`)
    expect(!!desk && desk.o === 1 && !desk.inert && desk.natural > 0 && desk.w === Math.min(desk.natural, 1200) && desk.scroll && mob.o === 0 && mob.inert && mob.natural > 0, "the desktop home page at the width it was taken at, scrolling; the phone one already loaded, hidden", `desktop drawn ${desk?.w}px of ${desk?.natural}, phone loaded ${mob?.natural}px`)
    expect(v.focusInside, "the focus is inside the preview")
    expect((await p.evaluate(() => location.search)) === "?themes=1&preview=clothing" && (await p.evaluate(() => history.length)) === len + 1, "the address names it on one new history entry", await p.evaluate(() => location.search))
    expect(same(page0, await pageRects(p)) && same(grid0, await gridRect(p)) && (await popup(p))?.state === "open", "the page and the popup's grid under it did not move")
    await shot(p, "preview-1440")
    await p.evaluate(() => document.querySelector("[data-preview-layer='desktop']").scrollTo(0, 1400))
    await sleep(120)
    await shot(p, "preview-1440-scrolled")

    let escaped = 0
    for (let i = 0; i < 16; i++) {
      await p.keyboard.press("Tab")
      if (!(await p.evaluate(() => document.querySelector("[data-theme-preview]").contains(document.activeElement)))) escaped++
    }
    expect(escaped === 0, "sixteen Tabs never leave the preview", `${escaped} outside`)

    /* The switch: a crossfade, the phone picture at 390. */
    await p.click("[data-preview-device='phone']")
    await sleep(110)
    const mid = await preview(p)
    const midO = mid.layers.map((l) => `${l.d}:${l.o.toFixed(2)}`).join(" ")
    await sleep(320)
    const ph = await preview(p)
    const phone = ph.layers.find((l) => l.d === "phone")
    const pressed = ph.switch
    expect(mid.layers.every((l) => l.o > 0.02 && l.o < 0.98), "the switch crossfades one picture into the other", midO)
    expect(ph.device === "phone" && phone.o === 1 && phone.w === 390 && same(pressed, ["desktop:false", "phone:true"]), "and shows the phone home page at 390px", `${phone.w}px, ${pressed}`)
    await shot(p, "preview-1440-phone")
    await p.click("[data-preview-device='desktop']")
    await sleep(320)

    /* Escape: the grid, the focus on the cover, the entry gone. */
    await p.keyboard.press("Escape")
    await sleep(60)
    const out = (await previewMotion(p))[0]?.[0]
    await sleep(400)
    expect((await preview(p)) === null && (await popup(p))?.state === "open", "Escape closes the preview and leaves the grid", JSON.stringify(out))
    expect(!!out && out.name === "wb-preview-out" && out.ms >= 200 && out.ms <= 280, "leaving in 200 to 280ms")
    expect(await p.evaluate((s) => document.activeElement === document.querySelector(s), cover), "the focus is back on the cover")
    expect((await p.evaluate(() => location.search)) === "?themes=1" && (await p.evaluate(() => history.length)) === len + 1, "and the address is the popup's again", await p.evaluate(() => location.search))
    expect(same(grid0, await gridRect(p)), "the grid is where it was")

    /* Back. */
    await p.click(cover)
    await sleep(450)
    await p.click("[data-preview-back]")
    await sleep(450)
    expect((await preview(p)) === null && (await popup(p))?.state === "open" && (await p.evaluate(() => location.search)) === "?themes=1", "Back lands on the grid")

    /* Add from the preview: the same states as the card. */
    await p.click(cover)
    await sleep(450)
    await p.click("[data-preview-bar] [data-template-action]")
    await sleep(150)
    const addingTop = await p.$eval("[data-preview-bar] [data-template-action]", (b) => `${b.getAttribute("data-template-action")}:${b.textContent.trim()}`)
    await sleep(900)
    const addedTop = await p.$eval("[data-preview-bar] [data-template-action]", (b) => `${b.getAttribute("data-template-action")}:${b.textContent.trim()}`)
    const cardNow = await p.$eval("[data-themes-grid] [data-template-card='clothing'] [data-template-action]", (b) => b.getAttribute("data-template-action"))
    expect(addingTop === "adding:Adding" && addedTop === "in-library:In library" && cardNow === "in-library", "Add in the preview: Adding, then In library, and the card under it agrees", `${addingTop} -> ${addedTop}, card ${cardNow}`)
    await shot(p, "preview-1440-added")

    /* Close: the preview and the popup, the focus on what opened the marketplace. */
    await p.click("[data-preview-close]")
    await sleep(1100)
    const gone = { preview: await preview(p), popup: await popup(p), search: await p.evaluate(() => location.search), len: await p.evaluate(() => history.length) }
    expect(gone.preview === null && gone.popup === null && gone.search === "", "close closes the preview and the popup, and the address is the page's own", JSON.stringify({ ...gone, preview: !!gone.preview, popup: !!gone.popup }))
    expect(await p.evaluate((s) => document.activeElement === document.querySelector(s), openButton), "the focus is on Theme marketplace, which opened the popup")
    const after = await pageRects(p)
    expect(after.scrollerWidth === page0.scrollerWidth && after.bodyPadding === page0.bodyPadding && after.docWidth === page0.docWidth, "the page's width never changed under it", `${page0.scrollerWidth} -> ${after.scrollerWidth}`)

    /* From the page's own grid: the preview over the page, Back to the page. */
    await p.$eval("[data-theme-grid] [data-template-preview]", (b) => b.scrollIntoView({ block: "center" }))
    await sleep(100)
    const pageOwn = await pageRects(p)
    await p.click("[data-theme-grid] [data-template-preview]")
    await sleep(450)
    const overPage = await preview(p)
    await p.keyboard.press("Escape")
    await sleep(450)
    expect(!!overPage && (await popup(p)) === null && (await preview(p)) === null && same(pageOwn, await pageRects(p)) && (await p.evaluate(() => document.activeElement?.hasAttribute("data-template-preview"))), "a cover on the page previews over the page, and Escape gives the cover the focus back")
    await p.close()
  }

  /* ══ 4c. The preview on a phone ═════════════════════════════════════════ */
  {
    console.log("\nThe preview, 390 x 844 at 2x\n")
    const p = await open("/app/website-builder", 390, 844)
    await scrollToThemes(p)
    await p.tap(openButton)
    await sleep(450)
    const cover = "[data-themes-grid] [data-template-card='clothing'] [data-template-preview]"
    await p.$eval(cover, (b) => b.scrollIntoView({ block: "center" }))
    await sleep(100)
    await shot(p, "popup-390-cards")
    const grid0 = await gridRect(p)
    await p.tap(cover)
    await sleep(90)
    const inMotion = await previewMotion(p)
    await shot(p, "preview-390-opening")
    await sleep(500)
    await p.waitForFunction(() => [...document.querySelectorAll("[data-preview-layer] img")].every((i) => i.complete), { timeout: 10_000 }).catch(() => null)
    await sleep(250)
    const v = await preview(p)
    const push = inMotion[0]?.[0]
    const phone = v.layers.find((l) => l.d === "phone")
    expect(same(v.rect, [0, 0, 390, 844]), "it covers the whole screen", v.rect.join(", "))
    expect(!!push && push.name === "wb-preview-push" && push.ms >= 200 && push.ms <= 280 && push.props.join() === "transform", "it slides in from the side by transform, in 200 to 280ms", JSON.stringify(inMotion[0]))
    expect(v.device === "phone" && phone.o === 1 && phone.w === 390, "on the phone picture, at 390px", `${v.device}, ${phone.w}px`)
    expect(v.safe.length === 0 && v.bar >= 56 && v.back && v.close && v.add === "Add", "the bar is compact, inside the safe areas: Back, the name, the switch, Add, close", `${v.bar}px, add "${v.add}", missing ${v.safe.join(", ")}`)
    const small = await p.evaluate(() => [...document.querySelectorAll("[data-preview-bar] button")].map((b) => ({ t: (b.getAttribute("aria-label") || b.textContent).trim(), h: Math.round(b.getBoundingClientRect().height), r: Math.round(b.getBoundingClientRect().right) })))
    expect(small.every((b) => b.h >= 36 && b.r <= 390), "every control in the bar is whole and 36px or taller", small.map((b) => `${b.t} ${b.h}`).join(", "))
    await shot(p, "preview-390")
    await p.evaluate(() => document.querySelector("[data-preview-layer='phone']").scrollTo(0, 1600))
    await sleep(120)
    await shot(p, "preview-390-scrolled")

    await p.goBack({ waitUntil: "domcontentloaded" }).catch(() => null)
    await sleep(60)
    const pop = (await previewMotion(p))[0]?.[0]
    await sleep(450)
    expect((await preview(p)) === null && (await popup(p))?.state === "open" && (await p.evaluate(() => location.search)) === "?themes=1", "the system's back lands on the grid", await p.evaluate(() => location.search))
    expect(!!pop && pop.name === "wb-preview-pop" && pop.ms >= 200 && pop.ms <= 280, "sliding away by transform, in 200 to 280ms", JSON.stringify(pop))
    expect(same(grid0, await gridRect(p)), "the grid is where it was")
    await p.goBack({ waitUntil: "domcontentloaded" }).catch(() => null)
    await sleep(450)
    expect((await popup(p)) === null && (await p.evaluate(() => location.pathname + location.search)) === "/app/website-builder", "and a second back closes the popup, on the Website page")
    await p.close()
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
