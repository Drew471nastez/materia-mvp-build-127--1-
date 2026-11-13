/**
 * A cart, search window and menu drawer of the site's own, written the way an
 * agent writes them when nobody is watching: all three nested in a blurred,
 * hide-on-the-way-down header, shut by sliding off the edge or fading, with
 * no `visibility` anywhere. components/website-builder/sections/own-panel-layer.ts
 * says what the page guarantees about them; this holds it to that in a real
 * browser (Chromium at /opt/pw-browsers/chromium), on:
 *
 *   live        the published page
 *   legacy      the same with every size container also containing layout,
 *               as WebKit did before 2025 (the page root and every section box)
 *   no-popover  a browser without the top layer
 *   canvas      the builder's phone preview (the frame that contains fixed
 *               positioning, its own scroller, inCanvas hooks)
 *
 * In each: shut panels are not drawn (before any script too); scrolled down
 * with the header gone, an add opens the cart exactly over the screen, the
 * page behind holds still, nothing of the page shows through it; shut again,
 * nothing is left behind on the panel or its ancestors.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx tests/own-panel-layer.test.ts
 * OWN_PANEL_SHOTS=<directory> keeps a screenshot of each open panel.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { chromePlatformCss } from "@/lib/website-builder/theme-css"
import { PANEL_SHOWN, PANEL_UNTRAP, ownPanelCss } from "@/lib/website-builder/own-panel-css"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 900)}`}`) }
}
const section = (title: string) => console.log(`\n${title}`)
const root = process.cwd()

const HEADER_HTML = `<header class="nv" data-storelib-sticky="up">
  <div class="nv__bar">
    <a href="/">Radu Coaching</a>
    <button type="button" data-storelib-menu aria-label="Menu">Menu</button>
    <button type="button" data-storelib-search aria-label="Search">Find</button>
    <button type="button" data-storelib-cart aria-label="Bag">Bag <span data-storelib-cart-count></span></button>
    <div class="nv__menu" data-storelib-menu-panel aria-label="Menu">
      <button type="button" data-storelib-menu-close>Close</button>
      <nav><a href="/programmes">See the programmes</a><a href="/about">The coach</a></nav>
    </div>
    <aside class="nv__cart" data-storelib-cart-panel aria-label="Bag">
      <div class="nv__sheet">
        <button type="button" data-storelib-cart-close>Close</button>
        <p data-storelib-cart-empty>Your bag is empty.</p>
        <ul data-storelib-cart-lines><li data-storelib-cart-line hidden><span data-line-title></span> <span data-line-price></span></li></ul>
        <div data-storelib-cart-filled><span data-storelib-cart-subtotal></span><button type="button" data-storelib-checkout>Checkout</button></div>
      </div>
    </aside>
    <div class="nv__search" data-storelib-search-panel aria-label="Search">
      <input data-storelib-search-input placeholder="Search" aria-label="Search">
      <button type="button" data-storelib-search-close>Close</button>
      <ul data-storelib-search-results><li data-storelib-search-result hidden><a data-result-url><span data-result-title></span></a></li></ul>
    </div>
  </div>
</header>`

/* No `visibility`, no `display` for the shut drawers: off the edge, or see-through. The bar is blurred, so it holds anything fixed inside it. */
const HEADER_CSS = `.nv__bar{display:flex;gap:12px;align-items:center;height:64px;padding:0 16px;background:rgba(245,245,243,.8);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);}
.nv__bar button{min-height:44px;}
.nv__menu{position:fixed;inset:0;z-index:50;padding:24px;background:#f5f5f3;transform:translateX(-100%);transition:transform .3s ease;}
.nv__menu[data-open="true"]{transform:none;}
.nv__menu a{display:block;font-size:28px;font-weight:700;}
.nv__cart{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.45);opacity:0;pointer-events:none;transition:opacity .25s ease;}
.nv__cart[data-open="true"]{opacity:1;pointer-events:auto;}
.nv__sheet{position:absolute;top:0;right:0;bottom:0;width:min(420px,100%);padding:24px;background:#fff;overflow-y:auto;}
.nv__search{position:fixed;top:0;left:0;right:0;z-index:55;padding:16px;background:#fff;opacity:0;transition:opacity .2s ease;}
.nv__search[data-open="true"]{opacity:1;}`

/* The blank canvas: a full screen menu that paints its ground always and shuts by fading only its links. Shut, it was a screen of the page's own colour over everything, header included. */
const BLANK_HTML = `<header class="bl"><a href="/">Radu Coaching</a><button type="button" data-storelib-menu aria-label="Menu">Menu</button>
  <div class="bl__menu" data-storelib-menu-panel aria-label="Menu"><button type="button" data-storelib-menu-close>Close</button><nav><a href="/programmes">See the programmes</a></nav></div></header>`
const BLANK_CSS = `.bl{display:flex;gap:12px;align-items:center;height:64px;padding:0 16px;}.bl button{min-height:44px;}
.bl__menu{position:fixed;inset:0;z-index:90;padding:24px;background:#f5f5f3;}
.bl__menu a,.bl__menu button{opacity:0;transition:opacity .2s ease;}
.bl__menu[data-open="true"] a,.bl__menu[data-open="true"] button{opacity:1;}`

const HERO_HTML = `<section style="min-height:3000px;background:#f5f5f3;padding:120px 16px 40px"><h1 style="margin:0;font-size:40px">A plan written for your body and your week</h1><p style="margin-top:1100px"><button type="button" id="add" data-storelib-add-to-cart="p1" data-title="Strength plan" data-price="€40" data-url="/products/strength" data-kind="digital" style="min-height:44px">Add to bag</button></p></section>`

const ORIGIN = "https://shop.example"
const PANELS = "[data-storelib-cart-panel],[data-storelib-search-panel],[data-storelib-menu-panel]"

async function main() {
  section("1. The stylesheet")
  const css = chromePlatformCss("[data-storelib-theme]")
  check("every site's stylesheet carries the panel rules", css.includes(ownPanelCss("[data-storelib-theme]", ["[data-storelib-cart-panel]", "[data-storelib-search-panel]", "[data-storelib-menu-panel]"])))
  check("a panel the page has not marked shown is not drawn, whatever its own CSS says", new RegExp(`\\[data-storelib-menu-panel\\]:not\\(\\[${PANEL_SHOWN}\\]\\)\\{display:none!important;\\}`).test(css))
  check("the browser's popover look is taken off in :where(), so the section's CSS always wins", /:where\(.*\[popover\]\)\{inset:auto;margin:0;border:0;padding:0;/.test(css))

  section("2. In a real browser")
  const chrome = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium"
  if (!existsSync(chrome)) { check("Chromium is here for the browser checks", false, `no browser at ${chrome}; set CHROMIUM_PATH`); return done() }
  const stubs = join(root, ".own-panel-probe")
  mkdirSync(stubs, { recursive: true })
  try {
    writeFileSync(join(stubs, "navigation.js"), `const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
    writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })
`)
    const { build } = await import("esbuild")
    await build({
      entryPoints: [join(root, "tests/_headless/chrome-probe.tsx")],
      bundle: true,
      format: "iife",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      alias: { "@": ".", "next/navigation": "./.own-panel-probe/navigation.js", "next/link": "./.own-panel-probe/link.jsx" },
      banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
      loader: { ".css": "empty" },
      outfile: join(stubs, "app.js"),
      logLevel: "error",
      absWorkingDir: root,
      nodePaths: [join(root, "node_modules")],
    })
    const js = readFileSync(join(stubs, "app.js"), "utf8")
    const sections = [
      { id: "ai_header", html: HEADER_HTML, css: HEADER_CSS, group: "header" },
      { id: "ai_hero", html: HERO_HTML, css: "" },
    ]
    const blank = [
      { id: "ai_blank_header", html: BLANK_HTML, css: BLANK_CSS, group: "header" },
      { id: "ai_hero", html: HERO_HTML, css: "" },
    ]
    const pageHtml = (opts: { canvas?: boolean; legacy?: boolean; noPopover?: boolean; noScript?: boolean; blank?: boolean }) => {
      const head = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:Arial,sans-serif}</style></head><body>`
      if (opts.noScript) return `${head}<div data-storelib-theme=""><style>${css}${HEADER_CSS}</style>${HEADER_HTML}${HERO_HTML}</div></body></html>`
      const probe = { sections: opts.blank ? blank : sections, canvas: !!opts.canvas, legacy: !!opts.legacy }
      const pre = opts.noPopover ? `<script>delete HTMLElement.prototype.showPopover;delete HTMLElement.prototype.hidePopover;</script>` : ""
      return `${head}<div id="app"></div>${pre}<script>window.__PROBE__=${JSON.stringify(probe).replace(/</g, "\\u003c")}</script><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
    }

    const puppeteer = (await import("puppeteer-core")).default
    const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] })
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    const shots = process.env.OWN_PANEL_SHOTS
    if (shots) mkdirSync(shots, { recursive: true })
    try {
      const open = async (html: string, width: number, height: number) => {
        const p = await browser.newPage()
        await p.setViewport({ width, height })
        const errors: string[] = []
        /* tsx names the functions it compiles with a helper the page does not have. */
        await p.evaluateOnNewDocument("window.__name = (f) => f")
        p.on("pageerror", (e) => errors.push(String((e as Error).message || e)))
        await p.setRequestInterception(true)
        p.on("request", (r) => {
          if (r.isNavigationRequest() && r.url() === `${ORIGIN}/`) return void r.respond({ status: 200, contentType: "text/html", body: html })
          if (r.isNavigationRequest()) return void r.respond({ status: 200, contentType: "text/html", body: "<p>elsewhere</p>" })
          return void r.respond({ status: 204, body: "" })
        })
        await p.goto(`${ORIGIN}/`, { waitUntil: "load" })
        await sleep(300)
        return { p, errors }
      }

      {
        const { p } = await open(pageHtml({ noScript: true }), 390, 800)
        const drawn = await p.evaluate((sel) => [...document.querySelectorAll<HTMLElement>(sel)].filter((el) => el.getClientRects().length > 0).length, PANELS)
        const words = await p.evaluate(() => document.body.innerText)
        check("before any script: no panel is drawn, none of its words are on the page", drawn === 0 && !/Your bag is empty|See the programmes/.test(words), { drawn })
        await p.close()
      }

      const MODES: { name: string; opts: Parameters<typeof pageHtml>[0]; canvas: boolean }[] = [
        { name: "live", opts: {}, canvas: false },
        { name: "legacy containment", opts: { legacy: true }, canvas: false },
        { name: "no top layer", opts: { noPopover: true }, canvas: false },
        { name: "canvas", opts: { canvas: true }, canvas: true },
      ]
      for (const mode of MODES) {
        const { p, errors } = mode.canvas ? await open(pageHtml(mode.opts), 1280, 800) : await open(pageHtml(mode.opts), 390, 800)
        /* The screen a panel has to cover: the window, or the canvas card. */
        const screen = await p.evaluate(() => { const f = document.querySelector(".wb-canvas-frame"); const r = f ? f.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight }; return { x: r.left, y: r.top, w: r.width, h: r.height } })
        const state = () => p.evaluate((sel, shown, untrap) => {
          const rect = (el: Element) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } }
          const panels = [...document.querySelectorAll<HTMLElement>(sel)]
          const scroller = document.getElementById("wb-preview-root")
          return {
            drawn: panels.filter((el) => el.getClientRects().length > 0).map((el) => el.className),
            shown: panels.filter((el) => el.hasAttribute(shown)).map((el) => el.className),
            popover: panels.filter((el) => el.hasAttribute("popover")).length,
            untrapped: document.querySelectorAll(`[${untrap}]`).length,
            cart: rect(document.querySelector("[data-storelib-cart-panel]")!),
            sheet: rect(document.querySelector(".nv__sheet")!),
            menu: rect(document.querySelector("[data-storelib-menu-panel]")!),
            search: rect(document.querySelector("[data-storelib-search-panel]")!),
            top: scroller ? scroller.scrollTop : scrollY,
          }
        }, PANELS, PANEL_SHOWN, PANEL_UNTRAP)
        const covers = (r: { x: number; y: number; w: number; h: number }) => Math.abs(r.x - screen.x) <= 1 && Math.abs(r.y - screen.y) <= 1 && Math.abs(r.w - screen.w) <= 1 && Math.abs(r.h - screen.h) <= 1
        const scrollPage = (y: number) => p.evaluate((to) => { const s = document.getElementById("wb-preview-root"); if (s) s.scrollTop = to; else window.scrollTo(0, to) }, y)
        /* A real wheel over the open panel, as a visitor's hand would: script can always move a page, a wheel cannot move a held one. */
        const nudge = async () => { await p.mouse.move(screen.x + 30, screen.y + screen.h / 2); await p.mouse.wheel({ deltaY: 400 }); await sleep(250) }

        let s = await state()
        check(`${mode.name}: shut, no panel is drawn`, s.drawn.length === 0 && s.shown.length === 0, s)

        /* Down the page in two steps, so the header has gone (data-scroll-dir="down"), then the add button opens the cart. */
        await scrollPage(600)
        await sleep(120)
        await scrollPage(1150)
        await sleep(450)
        const gone = await p.evaluate(() => { const box = document.querySelector("[data-section-box][data-chrome]")!; return getComputedStyle(box).translate })
        check(`${mode.name}: scrolled down, the header's box is moved away (the trap is real)`, gone !== "none", gone)
        await p.evaluate(() => (document.getElementById("add") as HTMLElement).scrollIntoView({ block: "center" }))
        await sleep(200)
        await p.click("#add")
        await sleep(600)
        s = await state()
        if (shots) await p.screenshot({ path: join(shots, `${mode.name.replace(/\s+/g, "-")}-cart.png`) as `${string}.png` })
        check(`${mode.name}: an add opens the site's own cart, and only it`, s.drawn.length === 1 && /nv__cart/.test(s.drawn[0] ?? ""), s.drawn)
        check(`${mode.name}:   it covers the screen exactly`, covers(s.cart), { cart: s.cart, screen })
        check(`${mode.name}:   its sheet ends at the bottom of the screen`, Math.abs(s.sheet.y + s.sheet.h - (screen.y + screen.h)) <= 1 && Math.abs(s.sheet.x + s.sheet.w - (screen.x + screen.w)) <= 1, { sheet: s.sheet, screen })
        const onTop = await p.evaluate((x, y) => !!document.elementFromPoint(x, y)?.closest("[data-storelib-cart-panel]"), screen.x + 20, screen.y + screen.h / 2)
        check(`${mode.name}:   nothing of the page is in front of it`, onTop)
        const before = s.top
        await nudge()
        await sleep(120)
        s = await state()
        check(`${mode.name}:   the page behind it does not scroll`, s.top === before, { before, after: s.top })
        check(`${mode.name}:   ${mode.canvas || mode.opts.noPopover ? "held by no ancestor (stilled while open)" : "in the top layer"}`, mode.canvas || mode.opts.noPopover ? s.popover === 0 && s.untrapped > 0 : s.popover === 1, { popover: s.popover, untrapped: s.untrapped })

        await p.keyboard.press("Escape")
        await sleep(900)
        s = await state()
        check(`${mode.name}: Escape shuts it and nothing is left behind`, s.drawn.length === 0 && s.shown.length === 0 && s.popover === 0 && s.untrapped === 0, s)

        /* Back up a little: the header returns; its Menu and Find buttons open the other two the same way. */
        await scrollPage(900)
        await sleep(500)
        if (process.env.OWN_PANEL_DEBUG) console.log(await p.evaluate(() => { const b = document.querySelector("[data-storelib-menu]")!; const r = b.getBoundingClientRect(); const box = document.querySelector("[data-section-box][data-chrome]")!; return JSON.stringify({ btn: [r.left, r.top, r.width, r.height], at: document.elementFromPoint(r.left + 5, r.top + 5)?.outerHTML.slice(0, 120), box: [box.getAttribute("data-scrolled"), box.getAttribute("data-scroll-dir"), getComputedStyle(box).translate, getComputedStyle(box).position] }) }))
        await p.click("[data-storelib-menu]")
        await sleep(600)
        s = await state()
        if (shots) await p.screenshot({ path: join(shots, `${mode.name.replace(/\s+/g, "-")}-menu.png`) as `${string}.png` })
        check(`${mode.name}: the menu drawer covers the screen exactly`, s.drawn.length === 1 && covers(s.menu), { drawn: s.drawn, menu: s.menu, screen })
        await p.evaluate(() => (document.querySelector("[data-storelib-menu-close]") as HTMLElement).click())
        await sleep(900)
        s = await state()
        check(`${mode.name}:   and is gone again`, s.drawn.length === 0 && s.untrapped === 0 && s.popover === 0, s)
        await p.click("[data-storelib-search]")
        await sleep(600)
        s = await state()
        check(`${mode.name}: the search window sits at the top of the screen, as wide as it`, s.drawn.length === 1 && Math.abs(s.search.x - screen.x) <= 1 && Math.abs(s.search.y - screen.y) <= 1 && Math.abs(s.search.w - screen.w) <= 1, { drawn: s.drawn, search: s.search, screen })
        await p.keyboard.press("Escape")
        await sleep(900)
        s = await state()
        check(`${mode.name}:   and is gone again`, s.drawn.length === 0 && s.untrapped === 0 && s.popover === 0, s)
        check(`${mode.name}: no page error`, errors.length === 0, errors)
        await p.close()
      }

      /* THE BLANK PHONE PREVIEW: a menu that paints its ground while shut must not be between the visitor and the page. */
      for (const canvas of [false, true]) {
        const name = canvas ? "canvas" : "live"
        const { p, errors } = canvas ? await open(pageHtml({ blank: true, canvas: true }), 1280, 800) : await open(pageHtml({ blank: true }), 390, 800)
        const seen = await p.evaluate(() => {
          const f = document.querySelector(".wb-canvas-frame")
          const r = f ? f.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight }
          const h1 = document.querySelector("h1")!.getBoundingClientRect()
          const at = document.elementFromPoint(h1.left + 10, h1.top + 10)
          const mid = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          return { heading: at?.tagName ?? "", covered: !!mid?.closest("[data-storelib-menu-panel]"), drawn: document.querySelector<HTMLElement>("[data-storelib-menu-panel]")!.getClientRects().length }
        })
        check(`${name}: a shut full screen menu that paints its ground does not blank the page (the heading is what a press lands on)`, seen.heading === "H1" && !seen.covered && seen.drawn === 0, seen)
        await p.click("[data-storelib-menu]")
        await sleep(600)
        const opened = await p.evaluate(() => { const m = document.querySelector<HTMLElement>("[data-storelib-menu-panel]")!; const a = m.querySelector("a")!; return { open: m.getAttribute("data-open"), link: getComputedStyle(a).opacity, drawn: m.getClientRects().length } })
        check(`${name}:   and still opens, its links faded in`, opened.open === "true" && opened.link === "1" && opened.drawn > 0, opened)
        check(`${name}:   no page error`, errors.length === 0, errors)
        await p.close()
      }
    } finally {
      await browser.close()
    }
  } finally {
    rmSync(stubs, { recursive: true, force: true })
  }
  done()
}

function done() {
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
