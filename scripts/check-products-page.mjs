/**
 * ===========================================================================
 *  THE PRODUCTS PAGE, MEASURED
 * ===========================================================================
 * On a phone: the bar with the title and New product as the one violet
 * button, the editor's Save to the letter; then the list as one white card
 * whose first row is its toolbar (the view with an up and down chevron, a
 * borderless search, a thin divider, Download with the faintest border),
 * then the column's name, then 64px rows with a 50px picture, the name, the
 * price and sales in grey, and at the right Preview and the more button,
 * 32px each in 44px presses, on one centre line. No search field or views
 * above the card. From 768px the same parts as a light table in the card
 * (56px rows, a 40px picture, 13px text; 64px rows and a 44px picture from
 * 1280px), with the views and the search above it, and from 1024px every
 * size 7% bigger (1200px column to 1284px), printed against what it was
 * before the 7%. A phone keeps its sizes. Every press
 * on a phone is 44px however small it is drawn, nothing scrolls sideways,
 * nothing moves after the first frame (CLS 0), and nothing of the page's
 * sits under the navigation pill, whose box is read from
 * components/app/sidebar-mobile-nav.
 *
 * Preview opens the product's page in a new tab (noopener noreferrer) and
 * never the editor; a draft's is off and says why. Its name is a near-black
 * tooltip with no arrow on a pointer. A row's more button has the editor's
 * more button's depth, held against the real one rendered off screen.
 * Switching views keeps every row's element (the same <img> before and
 * after), settles on opacity and transform, and never draws an empty frame.
 *
 *   node scripts/check-products-page.mjs          (a build's CSS if there is one, else the source's)
 *   PROBE_CSS=source node scripts/check-products-page.mjs
 *   SHOTS_DIR=<dir> node scripts/check-products-page.mjs   (where the screenshots go)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const css = await appCss(root)
const inter = interFaces(root)
if (!inter) console.log("(no build to take Inter from: text is measured in the fallback face, which is wider)")
const stubs = join(root, ".products-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-products-")), "shots")
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/*
  THE PILL'S BOX, FROM ITS SOURCE. The bar is its slots and padding, then the
  gap and the round menu button; the group is centred and lifted off the
  bottom by PILL_LIFT, which in a browser (no safe area) is its 4px floor.
  Read here rather than typed in, so a bigger pill fails this probe instead
  of quietly passing it.
*/
const navSrc = readFileSync(join(root, "components/app/sidebar-mobile-nav.tsx"), "utf8")
const num = (name) => {
  const m = navSrc.match(new RegExp(`const ${name} = (\\d+)`))
  if (!m) fail(`No ${name} in sidebar-mobile-nav.tsx`)
  return Number(m[1])
}
const itemsBlock = navSrc.match(/const items: BarItem\[\] = \[([\s\S]*?)\n\s*\]/)
const lift = navSrc.match(/const PILL_LIFT = "max\((\d+)px/)
if (!itemsBlock || !lift) fail("The pill's items or its lift were not found in sidebar-mobile-nav.tsx")
const PILL = (() => {
  const barH = num("BAR_H")
  const items = (itemsBlock[1].match(/\{ key: "/g) || []).length
  const width = items * num("SLOT") + num("PAD") * 2 + num("GAP") + barH
  return { width, height: barH, lift: Number(lift[1]), items, barW: items * num("SLOT") + num("PAD") * 2 }
})()
console.log(`the pill: ${PILL.items} slots, ${PILL.width} x ${PILL.height}, ${PILL.lift}px off the bottom`)

/* The numbers each width is held to, and printed in the summary at the end. */
const summary = []
const growth = []

try {
  writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/app/products"
export const useRouter = () => ({ push(href) { (window.__pushed ||= []).push(href) }, replace() {}, prefetch(href, o) { (window.__prefetched ||= []).push([href, o && o.kind]) }, back() {}, refresh() {} })
export const useSearchParams = () => new URLSearchParams()
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault() } }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined, ...rest }) }
`)
  execFileSync("npx", [
    "esbuild", "scripts/render-products-probe.tsx", "--bundle", "--format=iife", "--jsx=automatic",
    '--define:process.env.NODE_ENV="production"', "--alias:@=.",
    // The page reads public env values at module level; a browser has none.
    "--banner:js=var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};",
    "--alias:next/navigation=./.products-probe/navigation.js", "--alias:next/link=./.products-probe/link.jsx", "--alias:next/image=./.products-probe/image.jsx",
    `--outfile=${join(stubs, "app.js")}`, "--log-level=error",
  ], { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  writeFileSync(join(stubs, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
  const phone = (width) => ({ width, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  /* A stand-in for the pill at its real box: the bar and the round menu button beside it, as glass. */
  const drawPill = (p) => p.evaluate((P) => {
    const group = document.createElement("div")
    group.dataset.probePill = ""
    Object.assign(group.style, { position: "fixed", zIndex: 55, bottom: `${P.lift}px`, left: "50%", transform: "translateX(-50%)", width: `${P.width}px`, height: `${P.height}px`, display: "flex", gap: `${P.width - P.barW - P.height}px`, pointerEvents: "none" })
    const glass = { background: "rgba(255,255,255,0.72)", backdropFilter: "blur(25px)", borderRadius: "999px", boxShadow: "0 1px 2px rgba(16,18,27,0.06), 0 4px 10px rgba(16,18,27,0.07), 0 14px 30px rgba(16,18,27,0.14)" }
    const bar = document.createElement("div")
    Object.assign(bar.style, glass, { width: `${P.barW}px`, height: "100%" })
    const menu = document.createElement("div")
    Object.assign(menu.style, glass, { width: `${P.height}px`, height: "100%" })
    group.append(bar, menu)
    document.body.append(group)
  }, PILL)
  const open = async (vp, hash = "") => {
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    /* Every layout shift from the first frame, the way the browser scores CLS. */
    await p.evaluateOnNewDocument(() => {
      window.__cls = 0
      window.__shifts = []
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            if (e.hadRecentInput) continue
            window.__cls += e.value
            window.__shifts.push([Math.round(e.startTime), +e.value.toFixed(4), (e.sources || []).map((s) => s.node?.className?.toString().slice(0, 40) || s.node?.nodeName)])
          }
        }).observe({ type: "layout-shift", buffered: true })
      } catch { /* no layout-shift entries in this browser */ }
    })
    await p.setViewport(vp)
    await p.goto(`file://${join(stubs, "index.html")}${hash}`)
    await p.evaluate(() => document.fonts.ready)
    await wait(400)
    if (errors.length) fail(`The page threw: ${errors[0]}`)
    await p.waitForSelector("section[aria-label=Products]")
    if (vp.width < 768) await drawPill(p)
    return p
  }
  /* The one of two elements (phone list, computer table) that is drawn at this width. */
  const shown = `(sel) => [...document.querySelectorAll(sel)].find((el) => el.getBoundingClientRect().width > 0)`
  const rowsShown = `() => window.__shown("section[aria-label=Products] ul, section[aria-label=Products] table").querySelectorAll("li:not([hidden]), tbody tr:not([hidden])")`

  /*
    THE SIZES EACH WIDTH IS HELD TO. Under 1024px the page as it is (a tenth
    under the other pages since "reduce the products page's overall scale by
    about 10%"); from 1024px (lg) every one of those times 1.07, rounded to
    the pixel; from 1280px (xl) the step that was already there (64px rows,
    a 44px picture, 14px names, a 40px heading, a 44px footer) times 1.07.
    OLD is what lg and xl measured before the 7%, for the before and after.
  */
  const SIZES = {
    md: { bar: 66, btn: 32, btnText: "13px", search: 32, searchText: "13px", track: 32, segment: 28, tab: 32, tabText: "13px", head: 36, row: 56, pic: 40, radius: "9px", name: "13px", table: "13px", footer: 40, arrows: "32,28", title: "25px", rowBtn: 28, rowGap: 8 },
    lg: { bar: 71, btn: 34, btnText: "14px", search: 34, searchText: "14px", track: 34, segment: 30, tab: 34, tabText: "14px", head: 39, row: 60, pic: 43, radius: "10px", name: "14px", table: "14px", footer: 43, arrows: "34,30", title: "27px", rowBtn: 30, rowGap: 9 },
    xl: { bar: 71, btn: 34, btnText: "14px", search: 34, searchText: "14px", track: 34, segment: 30, tab: 34, tabText: "14px", head: 43, row: 68, pic: 47, radius: "11px", name: "15px", table: "14px", footer: 47, arrows: "34,30", title: "27px", rowBtn: 30, rowGap: 9 },
  }
  const OLD = {
    lg: { bar: 66, row: 56, pic: 40, name: 13, table: 13, head: 36, btn: 32, search: 32, track: 32, footer: 40, rowBtn: 28, container: 1200, title: 25 },
    xl: { bar: 66, row: 64, pic: 44, name: 14, table: 13, head: 40, btn: 32, search: 32, track: 32, footer: 44, rowBtn: 28, container: 1200, title: 25 },
  }
  for (const [label, vp, hash] of [
    ["phone-360", phone(360)],
    ["phone-390", phone(390)],
    ["phone-430", phone(430)],
    ["tablet-768", { width: 768, height: 1024 }, "#sidebar"],
    ["laptop-1100", { width: 1100, height: 800 }, "#sidebar"],
    ["desktop-1280", { width: 1280, height: 800 }, "#sidebar"],
    ["desktop-1440", { width: 1440, height: 900 }, "#sidebar"],
    ["wide-1920", { width: 1920, height: 1080 }, "#sidebar"],
  ]) {
    const isPhone = label.startsWith("phone")
    const tier = vp.width >= 1280 ? "xl" : vp.width >= 1024 ? "lg" : "md"
    const S = SIZES[tier]
    console.log(`\n${label}${hash ? ` (${hash.slice(1)}: the page 240px in, beside the sidebar)` : ""}`)
    const p = await open(vp, hash)
    await p.evaluate(`window.__shown = ${shown}; window.__rows = ${rowsShown}`)
    const pageLeft = hash ? 240 : 0
    const row = { label }
    const SEARCH = isPhone ? "section[aria-label=Products] [data-toolbar] input[type=search]" : "[data-controls] input[type=search]"
    const SEARCH_BOX = isPhone ? "[data-toolbar]" : "[data-controls]"

    /* Nothing moved after the first frame. */
    const cls = await p.evaluate(() => ({ cls: +window.__cls.toFixed(4), shifts: window.__shifts }))
    row.cls = cls.cls
    expect(cls.cls === 0, "CLS 0: nothing on the page moves once it is drawn", cls)

    /* The bar: Orders' 66px, the title, Export (from 768px), and New product as the one violet button. */
    const bar = await p.evaluate((pageLeft) => {
      const el = document.querySelector("[data-orders-bar]")
      const h = el.querySelector("h1")
      const addEl = el.querySelector("a[data-new-product]")
      const add = addEl.getBoundingClientRect()
      const expBtn = el.querySelector("button[aria-label='Export products']")
      const exp = expBtn.firstElementChild.getBoundingClientRect()
      const hitAbove = document.elementFromPoint(add.left + add.width / 2, add.top - 5)?.closest("a[data-new-product]") != null
      const hitBelow = document.elementFromPoint(add.left + add.width / 2, add.bottom + 5)?.closest("a[data-new-product]") != null
      const save = getComputedStyle(document.querySelector("[data-probe-save] button"))
      return {
        addShadow: getComputedStyle(addEl).boxShadow, saveShadow: save.boxShadow, saveBg: save.backgroundColor,
        barH: Math.round(el.getBoundingClientRect().height), titleSize: getComputedStyle(h).fontSize,
        add: [Math.round(add.width), Math.round(add.height)], addBg: getComputedStyle(addEl).backgroundColor, addText: addEl.textContent.trim(), addSize: getComputedStyle(addEl).fontSize,
        exp: [Math.round(exp.width), Math.round(exp.height)], expText: expBtn.innerText.trim(), expShown: getComputedStyle(expBtn).display !== "none", expSize: getComputedStyle(expBtn.firstElementChild).fontSize,
        titleLeft: Math.round(h.getBoundingClientRect().left - pageLeft), addRight: Math.round(window.innerWidth - add.right), hitAbove, hitBelow,
      }
    }, pageLeft)
    row.header = bar.barH
    row.title = bar.titleSize
    const barH = isPhone ? 66 : S.bar
    expect(bar.barH === barH, barH === 66 ? "the bar is Orders' 66px" : `the bar is Orders' 66px times 1.07, ${barH}px`, bar.barH)
    expect(bar.titleSize === (isPhone ? "22px" : S.title), `the title is ${isPhone ? "22px" : S.title}`, bar.titleSize)
    row.newBg = bar.addBg
    expect(bar.addText === "New product" && bar.add[1] === S.btn && bar.addSize === S.btnText && bar.addBg === "rgb(139, 92, 246)", `New product is one violet button, ${S.btn}px with ${S.btnText} text`, { add: bar.add, size: bar.addSize, bg: bar.addBg })
    expect(bar.addBg === bar.saveBg && bar.addShadow === bar.saveShadow, "with the editor's Save's colour and depth, to the letter", { newProduct: bar.addShadow, save: bar.saveShadow })
    if (isPhone) {
      expect(!bar.expShown, "Export is not in the bar on a phone: it is the list's own toolbar", bar.expShown)
      expect(bar.hitAbove && bar.hitBelow, "New product is a 44px press: a finger 5px outside it still lands on it", { above: bar.hitAbove, below: bar.hitBelow })
      expect(bar.titleLeft === 16 && bar.addRight === 16, "16px in from both edges", { left: bar.titleLeft, right: bar.addRight })
    } else {
      expect(bar.expShown && bar.expText === "Export" && bar.exp[1] === S.btn && bar.expSize === S.btnText, `Export says Export, ${S.btn}px`, bar)
    }

    if (isPhone) {
      /*
        THE PHONE'S TOOLBAR, INSIDE THE CARD. The view, the search, a thin
        divider and Download; nothing above the card but the bar.
      */
      const tb = await p.evaluate(() => {
        const section = document.querySelector("section[aria-label=Products]")
        const bar = section.querySelector("[data-toolbar]")
        const b = bar.getBoundingClientRect()
        const s = section.getBoundingClientRect()
        const select = bar.querySelector("button[data-view-select]")
        const label = bar.querySelector("label[data-search]")
        const input = label.querySelector("input[type=search]")
        const divider = bar.querySelector("[data-divider]")
        const dl = bar.querySelector("button[aria-label='Export products']")
        const dlDrawn = dl.firstElementChild
        const box = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] }
        const c = getComputedStyle(dlDrawn)
        const inputs = [...document.querySelectorAll("input[type=search]")].filter((i) => i.getClientRects().length > 0)
        const controls = document.querySelector("[data-controls]")
        const head = section.querySelector("[data-list-head]")
        const order = [select, label, divider, dl].map((el) => el.getBoundingClientRect().left)
        const inCard = bar.parentElement.parentElement === section && b.top - s.top <= 2
        return {
          inCard, bar: box(bar), card: box(section), order: order.every((x, i) => i === 0 || x > order[i - 1]),
          select: { box: box(select), text: select.textContent.trim(), chevron: !!select.querySelector("svg"), size: getComputedStyle(select).fontSize },
          search: { box: box(label), input: box(input), font: getComputedStyle(input).fontSize, placeholder: input.placeholder, border: getComputedStyle(input).borderTopWidth + "/" + getComputedStyle(label).borderTopWidth, icon: !!label.querySelector("svg") },
          divider: box(divider), dividerBg: getComputedStyle(divider).backgroundColor,
          download: { press: box(dl), drawn: box(dlDrawn), border: `${c.borderTopWidth} ${c.borderTopStyle} ${c.borderTopColor}`, radius: c.borderTopLeftRadius, bg: c.backgroundColor, shadow: c.boxShadow },
          visibleSearches: inputs.length, visibleSearchInCard: inputs.every((i) => section.contains(i)), controlsShown: controls ? getComputedStyle(controls).display !== "none" : false,
          views: [...document.querySelectorAll("[role=tablist]")].some((t) => t.getClientRects().length > 0),
          head: head ? { text: head.textContent.trim(), size: getComputedStyle(head).fontSize, color: getComputedStyle(head).color, box: box(head), checkbox: !!head.querySelector("input[type=checkbox]") } : null,
          section: [getComputedStyle(section).borderTopLeftRadius, getComputedStyle(section).backgroundColor],
        }
      })
      row.toolbar = tb.bar[3]
      row.download = `${tb.download.drawn[2]}px ${tb.download.border.split(" ").slice(2).join(" ")} r${tb.download.radius}`
      expect(tb.section[0] === "16px" && tb.section[1] === "rgb(255, 255, 255)", "the list is one white card, 16px round", tb.section)
      expect(tb.inCard && tb.bar[3] === 48 && tb.order, "its first row, inside the card, is the toolbar (48px): the view, the search, a divider, Download, in that order", { inCard: tb.inCard, bar: tb.bar, order: tb.order })
      expect(tb.select.text === "All" && tb.select.chevron && tb.select.box[3] === 44 && tb.select.box[2] >= 44 && tb.select.size === "15px", "the view reads All with an up and down chevron, a 44px press", tb.select)
      expect(tb.search.placeholder === "Search and filter" && tb.search.font === "16px" && tb.search.border === "0px/0px" && tb.search.icon && tb.search.box[3] === 44, "then a search with no box of its own, Search and filter, 16px text so iOS does not zoom, a 44px press", tb.search)
      expect(tb.search.box[2] >= 120, "and the search takes the rest of the row", tb.search.box[2])
      expect(tb.divider[2] === 1 && tb.divider[3] === 24, "a thin divider, 1 by 24", { box: tb.divider, bg: tb.dividerBg })
      expect(tb.download.press[2] === 44 && tb.download.press[3] === 44 && tb.download.drawn[2] === 32 && tb.download.drawn[3] === 32, "Download: drawn 32px in a 44px press", tb.download)
      expect(tb.download.border === "1px solid rgb(238, 240, 242)" && tb.download.radius === "8px" && tb.download.bg === "rgb(255, 255, 255)" && tb.download.shadow === "none", "with the faintest border (1px #eef0f2), 8px round, white, no shadow", tb.download)
      expect(Math.round(tb.card[0] + tb.card[2] - (tb.download.drawn[0] + tb.download.drawn[2])) === 13, "and on the rows' right edge (12px in from the card's inside)", tb.card[0] + tb.card[2] - (tb.download.drawn[0] + tb.download.drawn[2]))
      expect(tb.visibleSearches === 1 && tb.visibleSearchInCard && !tb.controlsShown && !tb.views, "no search field or segmented views above the list: the only search is in the card", { searches: tb.visibleSearches, inCard: tb.visibleSearchInCard, controls: tb.controlsShown, views: tb.views })
      expect(tb.head && tb.head.text === "Product" && tb.head.size === "12px" && tb.head.color === "rgb(107, 114, 128)" && !tb.head.checkbox, "under it the column's name, Product, in 12px grey (no checkbox: the list has no selection)", tb.head)

      /* Download pressed: the pressed look, then the two exports in a sheet. */
      const pressed = await p.evaluate(() => {
        const rules = []
        const walk = (list) => { for (const r of list) { if (r.selectorText?.includes("group-active\\/press\\:bg-\\[\\#f1f2f4\\]")) rules.push(r.style.backgroundColor); if (r.cssRules) walk(r.cssRules) } }
        for (const s of document.styleSheets) walk(s.cssRules)
        return rules
      })
      expect(pressed.length > 0, "Download goes a step darker while it is pressed", pressed)
      await p.click("[data-toolbar] button[aria-label='Export products']")
      await wait(650)
      const exp = await p.evaluate(() => { const d = [...document.querySelectorAll("[role=dialog]")].find((x) => /Export as CSV/.test(x.textContent)); return d ? [...d.querySelectorAll("[data-action-sheet] button, [data-action-sheet] a")].map((b) => b.textContent.trim()) : null })
      expect(exp && exp.includes("Export as CSV") && exp.includes("Export as PDF"), "and it opens Export as CSV and Export as PDF", exp)
      await p.keyboard.press("Escape")
      await wait(500)
      const ring = await p.evaluate(() => {
        const b = document.activeElement
        if (!b?.matches("[data-toolbar] button[aria-label='Export products']")) return { focused: b?.getAttribute("aria-label") ?? b?.tagName }
        const c = getComputedStyle(b.firstElementChild)
        return { focused: "Export products", visible: b.matches(":focus-visible"), outline: `${c.outlineStyle} ${c.outlineColor}`, own: getComputedStyle(b).outlineStyle }
      })
      if (ring.visible) expect(ring.outline === "solid rgb(139, 92, 246)" && ring.own === "none", "closed from the keyboard, the focus goes back to Download with the app's violet outline, not the browser's blue ring", ring)
      else console.log(`        (focus after the sheet: ${JSON.stringify(ring)})`)
    } else {
      /* Search and sort above the card: a real field, always there, with Sort beside it. */
      const tools = await p.evaluate(() => {
        const field = document.querySelector("[data-controls] label[data-search]")
        const input = field.querySelector("input[type=search]")
        const drawn = input.parentElement.getBoundingClientRect()
        const sort = document.querySelector("[data-controls] button[aria-label='Sort']")
        const sortDrawn = sort.firstElementChild.getBoundingClientRect()
        const tb = document.querySelector("[data-toolbar]")
        return {
          drawn: [Math.round(drawn.width), Math.round(drawn.height)], font: getComputedStyle(input).fontSize, placeholder: input.placeholder,
          sortDrawn: [Math.round(sortDrawn.width), Math.round(sortDrawn.height)], toolbar: tb ? tb.getClientRects().length > 0 : false,
        }
      })
      row.search = tools.drawn[1]
      expect(tools.placeholder === "Search products" && tools.font === S.searchText && tools.drawn[1] === S.search, `a search field above the card, ${S.search}px with ${S.searchText} text`, tools)
      expect(tools.sortDrawn.join() === `${S.search},${S.search}`, `Sort beside it at ${S.search}px`, tools.sortDrawn)
      expect(!tools.toolbar, "the phone's toolbar is not drawn", tools.toolbar)

      /* The views: one segmented control. */
      const seg = await p.evaluate(() => {
        const list = document.querySelector("[data-controls] [role=tablist][data-views]")
        const track = list.firstElementChild.getBoundingClientRect()
        const thumb = list.querySelector("[data-segment]").getBoundingClientRect()
        const tabs = [...list.querySelectorAll("[role=tab]")].map((x) => {
          const r = x.getBoundingClientRect()
          return { t: x.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), cut: x.scrollWidth > x.clientWidth, size: getComputedStyle(x).fontSize }
        })
        return { track: Math.round(track.height), thumb: [Math.round(thumb.left), Math.round(thumb.width), Math.round(thumb.height)], tabs }
      })
      row.views = seg.track
      expect(seg.tabs.map((t) => t.t).join() === "All,Active,Draft,Archived", "the views in Polaris's order, All first", seg.tabs.map((t) => t.t))
      expect(seg.track === S.track && seg.thumb[2] === S.segment, `a ${S.track}px grey track with a ${S.segment}px white segment`, { track: seg.track, segment: seg.thumb[2] })
      expect(seg.tabs.every((t) => t.h === S.tab && t.w >= 44 && !t.cut && t.size === S.tabText), `each view a ${S.tab}px button with ${S.tabText} text, none cut off`, seg.tabs.map((t) => [t.w, t.h, t.cut, t.size]))
      expect(Math.abs(seg.thumb[0] - seg.tabs[0].left) <= 2, "the segment sits on All", { segment: seg.thumb[0], all: seg.tabs[0].left })
    }

    /* The column: 1200px, 1284px (7% more) from 1024px, with 32px gutters, 34px from 1024px. */
    const col = await p.evaluate(() => {
      const c = document.querySelector("section[aria-label=Products]").parentElement
      const cs = getComputedStyle(c)
      return { width: Math.round(c.getBoundingClientRect().width), max: cs.maxWidth, pad: cs.paddingLeft }
    })
    row.column = col.width
    if (!isPhone) {
      const wantMax = tier === "md" ? "1200px" : "1284px"
      const wantPad = tier === "md" ? "24px" : "34px"
      expect(col.max === wantMax && col.pad === wantPad, `the column is at most ${wantMax}, with ${wantPad} gutters`, col)
      if (vp.width - pageLeft >= 1284) expect(col.width === 1284, "and it is 1284px wide on a wide screen (1200 before)", col.width)
    }

    /* No sideways scroll anywhere. */
    const sideways = await p.evaluate(() => {
      const pane = document.querySelector(".orders-pane")
      const inner = [...document.querySelectorAll(".orders-pane *")].filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible" && getComputedStyle(el).textOverflow !== "ellipsis" && !el.matches("[data-meta]")).map((el) => el.className.slice(0, 40))
      return { pane: pane.scrollWidth - pane.clientWidth, doc: document.documentElement.scrollWidth - window.innerWidth, inner }
    })
    row.sideways = sideways.pane + sideways.doc + sideways.inner.length
    expect(sideways.pane === 0 && sideways.doc <= 0 && sideways.inner.length === 0, "nothing scrolls sideways: the page, the pane or anything in it", sideways)

    if (isPhone) {
      const table = await p.$eval("section[aria-label=Products] table", (t) => getComputedStyle(t).display)
      expect(table === "none", "the table is not drawn on a phone", table)
      const rows = await p.$$eval("section[aria-label=Products] ul > li:not([hidden])", (r) => r.map((li) => {
        const card = li.closest("section").getBoundingClientRect()
        const box = li.getBoundingClientRect()
        const pic = li.querySelector("[data-thumb]")
        const pr = pic.getBoundingClientRect()
        const link = li.querySelector("a[data-row-link]").getBoundingClientRect()
        const target = (el) => {
          const b = el.getBoundingClientRect()
          const a = getComputedStyle(el, "::after")
          const grow = a.content !== "none" && a.position === "absolute" ? -parseFloat(a.top) || 0 : 0
          return { left: b.left - grow, right: b.right + grow, top: b.top - grow, bottom: b.bottom + grow, drawn: [Math.round(b.width), Math.round(b.height)], mid: b.top + b.height / 2, dl: b.left, dr: b.right }
        }
        const menuEl = li.querySelector("button[aria-label^='Actions for']")
        const eyeEl = li.querySelector("[data-preview]")
        const menu = target(menuEl)
        const eye = target(eyeEl)
        const name = li.querySelector("[data-name]")
        const meta = li.querySelector("[data-meta]")
        const metaRight = meta.getBoundingClientRect().right
        const status = meta.querySelector("[data-status]")
        const look = (el) => { const c = getComputedStyle(el); return [c.borderTopWidth, c.borderTopColor, c.backgroundColor, c.borderTopLeftRadius].join(" ") }
        return {
          h: Math.round(box.height), inset: Math.round(box.left - card.left), w: Math.round(box.width), cardW: Math.round(card.width), pic: [Math.round(pr.width), Math.round(pr.height)], picIn: Math.round(pr.left - box.left), radius: getComputedStyle(pic).borderTopLeftRadius,
          link: [Math.round(link.width), Math.round(link.height)],
          menu: [Math.round(menu.right - menu.left), Math.round(menu.bottom - menu.top)], menuDrawn: menu.drawn,
          eye: [Math.round(eye.right - eye.left), Math.round(eye.bottom - eye.top)], eyeDrawn: eye.drawn, eyeTag: eyeEl.tagName, eyeLabel: eyeEl.getAttribute("aria-label"), eyeTarget: eyeEl.getAttribute("target"), eyeRel: eyeEl.getAttribute("rel"), eyeHref: eyeEl.getAttribute("href"), eyeOff: eyeEl.getAttribute("aria-disabled"),
          midGap: +Math.abs(eye.mid - menu.mid).toFixed(1), rowMid: +Math.abs(eye.mid - (box.top + box.height / 2)).toFixed(1), gap: Math.round(menu.dl - eye.dr), overlap: eye.right > menu.left + 0.5,
          right: Math.round(box.right - menu.dr), sameLook: look(eyeEl).split(" ").slice(0, 2).join(" ") === look(menuEl).split(" ").slice(0, 2).join(" "),
          nameSize: getComputedStyle(name).fontSize, nameWeight: getComputedStyle(name).fontWeight, nameH: Math.round(name.getBoundingClientRect().height), metaSize: getComputedStyle(meta).fontSize, metaColor: getComputedStyle(meta).color,
          priceNums: getComputedStyle(meta.querySelector("[data-price]")).fontVariantNumeric, price: meta.querySelector("[data-price]").textContent,
          status: status ? status.textContent.trim() : "", statusBg: status ? getComputedStyle(status).backgroundColor : null, metaText: meta.textContent,
          clear: Math.round(eye.left - metaRight), nameClear: Math.round(eye.dl - name.getBoundingClientRect().right), cut: name.scrollWidth > name.clientWidth, ellipsis: getComputedStyle(name).textOverflow, metaCut: meta.scrollWidth > meta.clientWidth, metaEllipsis: getComputedStyle(meta).textOverflow, meta1line: Math.round(meta.getBoundingClientRect().height),
          letter: pic.querySelector("img") ? null : pic.textContent.trim(),
        }
      }))
      row.row = rows[0].h
      row.thumb = rows[0].pic.join("x")
      row.text = `${rows[0].nameSize} name, ${rows[0].metaSize} meta`
      row.eye = `${rows[0].eyeDrawn.join("x")} in ${rows[0].eye.join("x")}`
      expect(rows.length === 13, "one row per product in All (not archived)", rows.length)
      expect(rows.every((r) => r.h === 64), "every row is 64px, a long name included", [...new Set(rows.map((r) => r.h))])
      expect(rows.every((r) => r.inset === 1 && r.w === r.cardW - 2), "each row runs the card's full width inside its 1px border", [rows[0].inset, rows[0].w, rows[0].cardW])
      expect(rows.every((r) => r.pic.join() === "50,50" && r.radius === "11px" && r.picIn === 12), "a 50px picture, 11px round, 12px in", [...new Set(rows.map((r) => `${r.pic.join("x")} r${r.radius} at ${r.picIn}`))])
      expect(rows.filter((r) => r.letter !== null).every((r) => /^P$/.test(r.letter)), "a product with no picture shows its first letter, not a box icon", rows.filter((r) => r.letter !== null).map((r) => r.letter))
      expect(rows.every((r) => r.nameSize === "14px" && r.nameWeight === "500" && r.nameH === 18 && r.metaSize === "12px" && r.metaColor === "rgb(107, 114, 128)"), "the name at 14px medium on one line, price and sales under it at 12px grey", rows[2])
      expect(rows.every((r) => r.meta1line === 16), "on one 16px line", [...new Set(rows.map((r) => r.meta1line))])
      expect(rows.every((r) => /tabular-nums/.test(r.priceNums)), "prices in figures of one width", rows[0].priceNums)
      expect(rows.some((r) => r.price === "Free"), "a free product says Free, not $0.00", rows.map((r) => r.price).slice(0, 6))
      const drafts = rows.filter((r) => r.status)
      expect(drafts.length === 2 && drafts.every((r) => r.status === "Draft" && r.statusBg === "rgba(0, 0, 0, 0)"), "only the two drafts say so, as a dot and a word with no badge; a live row says nothing", rows.map((r) => r.status || "-"))
      expect(rows.every((r) => r.link[0] === r.w && r.link[1] >= r.h - 1), "the whole row is the link", rows[0].link)
      /* Preview, on every row, beside the more button. */
      expect(rows.every((r) => r.eyeDrawn.join() === "32,32" && r.menuDrawn.join() === "32,32"), "every row has Preview beside the more button, both drawn 32px", [...new Set(rows.map((r) => `${r.eyeDrawn.join("x")}/${r.menuDrawn.join("x")}`))])
      expect(rows.every((r) => r.eye.join() === "44,44" && r.menu.join() === "44,44"), "each a 44px press", [...new Set(rows.map((r) => `${r.eye.join("x")}/${r.menu.join("x")}`))])
      expect(rows.every((r) => r.midGap === 0 && r.rowMid <= 0.5), "on one centre line, the row's own", [...new Set(rows.map((r) => `${r.midGap}/${r.rowMid}`))])
      expect(rows.every((r) => r.gap === 12 && !r.overlap && r.right === 12), "12px apart, so their presses meet and never overlap, and 12px from the card's edge", [...new Set(rows.map((r) => `${r.gap} ${r.overlap} ${r.right}`))])
      expect(rows.every((r) => r.sameLook), "the same hairline on both", rows[0].sameLook)
      expect(rows.every((r) => r.clear >= 0 && r.nameClear >= 12), "the name and the line under it never run under Preview (12px clear at least)", [...new Set(rows.map((r) => Math.min(r.clear, r.nameClear)))])
      expect(rows[2].cut && rows[2].ellipsis === "ellipsis", "a long name gives way with an ellipsis before the buttons move", { cut: rows[2].cut, clear: rows[2].nameClear })
      expect(rows.every((r) => r.metaEllipsis === "ellipsis"), `and so does the line under it${rows.some((r) => r.metaCut) ? " (cut here: " + rows.filter((r) => r.metaCut).map((r) => r.metaText).join(", ") + ")" : ""}`, rows.filter((r) => r.metaCut).length)
      const live = rows.filter((r) => !r.status)
      expect(live.every((r) => r.eyeTag === "A" && r.eyeTarget === "_blank" && /noopener/.test(r.eyeRel) && /noreferrer/.test(r.eyeRel) && /^https:\/\/storelib\.com\/astrid\/product-\d+$/.test(r.eyeHref) && /^Preview /.test(r.eyeLabel)), "a live product's Preview is a link to its page, a new tab, noopener noreferrer, labelled Preview and its name", live[0])
      expect(drafts.every((r) => r.eyeTag === "BUTTON" && r.eyeOff === "true"), "a draft's is drawn but off: it has no page to open", drafts.map((r) => [r.eyeTag, r.eyeOff]))

      const rules = await p.$$eval("section[aria-label=Products] ul > li", (r) => r.map((li) => {
        const b = getComputedStyle(li, "::before")
        return b.content === "none" ? null : [Math.round(parseFloat(b.left)), b.backgroundColor]
      }))
      expect(rules[0] === null && rules.slice(1).every((x) => x && x[0] === 74 && x[1] === "rgb(236, 238, 241)"), "a light hairline between rows, starting where the text does", rules.slice(0, 3))
      const hit = await p.$eval("section[aria-label=Products] ul > li:nth-child(2)", (li) => {
        const r = li.getBoundingClientRect()
        return document.elementFromPoint(r.left + r.width * 0.45, r.top + r.height / 2)?.tagName
      })
      expect(hit === "A", "a press in the middle of a row lands on its link", hit)
      /* Once the list is idle, New product and the first three rows are fetched ahead; the gestures below are read after that. */
      await p.waitForFunction(() => (window.__prefetched || []).some(([h]) => h === "/app/products/new"), { timeout: 4000 }).catch(() => {})
      const ahead = await p.evaluate(() => { const got = window.__prefetched || []; window.__prefetched = []; return got })
      expect(ahead.map(([h, k]) => `${h} ${k}`).join() === "/app/products/new full,/app/products/p0 full,/app/products/p1 full,/app/products/p2 full", "once the list is idle, New product and the first three rows are fetched ahead in full, once each", ahead)
      await p.$eval("section[aria-label=Products] ul > li:nth-child(5) a[data-row-link]", (a) => a.dispatchEvent(new TouchEvent("touchstart", { bubbles: true })))
      const pre = await p.evaluate(() => window.__prefetched || [])
      expect(pre.length === 1 && pre[0][0] === "/app/products/p4" && pre[0][1] === "full", "the finger going down prefetches that product's editor in full", pre)

      /* Every press on the screen, with the invisible 44px box a small drawing carries. */
      const small = await p.evaluate(() => {
        const out = []
        for (const el of document.querySelectorAll(".orders-pane a[href], .orders-pane button, .orders-pane label[data-search], .orders-pane [data-preview]")) {
          const r = el.getBoundingClientRect()
          if (r.width === 0 || r.height === 0 || el.closest("table") || el.closest("label[data-search]") && el.tagName !== "LABEL" && el.getAttribute("aria-label") !== "Clear search") continue
          let [top, right, bottom, left] = [r.top, r.right, r.bottom, r.left]
          const a = getComputedStyle(el, "::after")
          if (a.content !== "none" && a.position === "absolute") {
            top -= -parseFloat(a.top) || 0; bottom += -parseFloat(a.bottom) || 0; left -= -parseFloat(a.left) || 0; right += -parseFloat(a.right) || 0
          }
          const w = Math.round(right - left), h = Math.round(bottom - top)
          if (w < 44 || h < 44) out.push([el.getAttribute("aria-label") || el.textContent.trim().slice(0, 20), w, h])
        }
        return out
      })
      expect(small.length === 0, "every press on the page is at least 44 by 44", small)

      /* The pill: New product is nowhere near it, and the last row scrolls clear of it. */
      const pill = await p.evaluate(() => {
        const box = document.querySelector("[data-probe-pill]").getBoundingClientRect()
        const add = document.querySelector("a[data-new-product]").getBoundingClientRect()
        const scroller = document.querySelector(".orders-pane")
        scroller.scrollTop = scroller.scrollHeight
        const last = [...document.querySelectorAll("section[aria-label=Products] ul > li")].pop().getBoundingClientRect()
        const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
        const room = parseFloat(getComputedStyle(scroller).paddingBottom)
        const out = { pill: [Math.round(box.left), Math.round(box.top), Math.round(box.width), Math.round(box.height)], add: [Math.round(add.top), Math.round(add.bottom)], newOverlaps: overlaps(add, box), lastBottom: Math.round(last.bottom), clear: Math.round(box.top - last.bottom), room }
        scroller.scrollTop = 0
        return out
      })
      row.pillClear = pill.clear
      expect(!pill.newOverlaps && pill.add[1] < pill.pill[1] - 600, "New product is in the bar at the top, far from the pill, and covers nothing", pill)
      expect(pill.room === 104 && pill.clear >= 8, "scrolled to the end, the last row stops above the pill (the pane's 104px room)", { clear: pill.clear, room: pill.room, pill: pill.pill })

      await p.screenshot({ path: join(shots, `${label}-products-v3.png`) })

      /*
        IN THE APP. Capacitor's web view has no tabs, so there Preview hands
        the address to openExternal (lib/native-bridge), which on iOS is
        window.open(url, "_system"): Safari, outside the app. Stubbed here as
        the app's bridge would answer.
      */
      if (vp.width === 390) {
        const native = await p.evaluate(async () => {
          const opened = []
          const realOpen = window.open
          window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios" }
          window.open = (url, name) => { opened.push([url, name]); return {} }
          let held = null
          window.addEventListener("click", (e) => { if (e.target.closest?.("a[data-preview]")) setTimeout(() => { held = e.defaultPrevented }, 0) }, { capture: true, once: true })
          document.querySelector("section[aria-label=Products] ul > li:not([hidden]) a[data-preview]").click()
          await new Promise((r) => setTimeout(r, 50))
          delete window.Capacitor
          window.open = realOpen
          return { opened, held, pushed: (window.__pushed || []).length }
        })
        expect(native.opened.length === 1 && native.opened[0][0] === "https://storelib.com/astrid/product-0" && native.opened[0][1] === "_system" && native.held === true && native.pushed === 0,
          "in the app, Preview opens the page in the phone's browser through openExternal, and the web view goes nowhere", native)
      }

      /* Preview on a draft says why it is off, in a toast, and opens nothing. */
      await p.evaluate(() => [...document.querySelectorAll("section[aria-label=Products] ul > li:not([hidden]) button[data-preview]")][0].scrollIntoView({ block: "center" }))
      await wait(100)
      await p.click("section[aria-label=Products] ul > li:not([hidden]) button[data-preview]")
      await wait(200)
      const toast = await p.evaluate(() => ({ text: document.body.innerText.includes("Publish to preview"), pushed: (window.__pushed || []).length }))
      expect(toast.text && toast.pushed === 0, "a draft's Preview says Publish to preview, and does not open the product", toast)
      await p.evaluate(() => { document.querySelector(".orders-pane").scrollTop = 0 })
    } else {
      const list = await p.$eval("section[aria-label=Products] ul", (u) => getComputedStyle(u).display)
      expect(list === "none", "the phone list is not drawn", list)
      const t = await p.evaluate(() => {
        const section = document.querySelector("section[aria-label=Products]")
        const table = section.querySelector("table")
        const head = table.querySelector("thead tr")
        const cols = [...head.children].filter((c) => c.getBoundingClientRect().width > 0).map((c) => ({ t: c.textContent.trim(), align: getComputedStyle(c).textAlign, bg: getComputedStyle(c).backgroundColor }))
        const rows = [...table.querySelectorAll("tbody tr")].map((tr) => {
          const pic = tr.querySelector("[data-thumb]")
          const pr = pic.getBoundingClientRect()
          const name = tr.querySelector("td a")
          const cells = [...tr.children].filter((c) => c.getBoundingClientRect().width > 0)
          const status = tr.querySelector("[data-status]")
          const eye = tr.querySelector("[data-preview]").getBoundingClientRect()
          const menu = tr.querySelector("button[aria-label^='Actions for']").getBoundingClientRect()
          return {
            h: Math.round(tr.getBoundingClientRect().height), pic: [Math.round(pr.width), Math.round(pr.height)], radius: getComputedStyle(pic).borderTopLeftRadius,
            nameSize: getComputedStyle(name).fontSize, nameWeight: getComputedStyle(name).fontWeight, cut: name.scrollWidth > name.clientWidth, tableSize: getComputedStyle(cells[1]).fontSize,
            inside: Math.round(cells[0].getBoundingClientRect().right - name.getBoundingClientRect().right), ellipsis: getComputedStyle(name).textOverflow,
            nums: cells.filter((c) => /^\$|^\d|^Free$/.test(c.textContent.trim())).map((c) => [getComputedStyle(c).textAlign, getComputedStyle(c).fontVariantNumeric]),
            divider: getComputedStyle(cells[0]).borderTopWidth + " " + getComputedStyle(cells[0]).borderTopColor,
            status: status.textContent.trim(), statusBg: getComputedStyle(status).backgroundColor, dot: getComputedStyle(status.firstElementChild).backgroundColor,
            eye: [Math.round(eye.width), Math.round(eye.height)], menu: [Math.round(menu.width), Math.round(menu.height)], mid: +Math.abs(eye.top + eye.height / 2 - (menu.top + menu.height / 2)).toFixed(1), gap: Math.round(menu.left - eye.right),
            eyeInCell: eye.left >= cells[cells.length - 1].getBoundingClientRect().left,
          }
        })
        const headH = Math.round(head.getBoundingClientRect().height)
        const headSize = getComputedStyle(head).fontSize
        const nameCol = Math.round(head.children[0].getBoundingClientRect().width)
        const c = getComputedStyle(section)
        return { cols, rows, headH, headSize, nameCol, card: [c.borderTopLeftRadius, c.backgroundColor] }
      })
      row.row = t.rows[0].h
      row.thumb = t.rows[0].pic.join("x")
      row.nameCol = t.nameCol
      row.text = `${t.rows[0].nameSize} name, ${t.rows[0].tableSize} cells`
      row.eye = `${t.rows[0].eye.join("x")}`
      const wantCols = tier === "md" ? "Product,Status,Price," : "Product,Status,Sales,Price,"
      expect(t.card[0] === "16px" && t.card[1] === "rgb(255, 255, 255)", "one white card round the table", t.card)
      expect(t.cols.map((c) => c.t).join() === wantCols, `the columns: ${wantCols.replace(/,$/, "")}${tier === "md" ? " (Sales from 1024px)" : ""}`, t.cols.map((c) => c.t))
      expect(t.cols.every((c) => c.bg === "rgba(0, 0, 0, 0)"), "no grey band behind the headings", t.cols.map((c) => c.bg))
      expect(t.cols.filter((c) => /Sales|Price/.test(c.t)).every((c) => c.align === "right"), "numbers' headings right aligned", t.cols)
      expect(t.headH === S.head && t.headSize === S.table.replace(/\d+/, (n) => String(n - 1)), `a ${S.head}px heading row`, { h: t.headH, size: t.headSize })
      expect(t.rows.length === 13 && t.rows.every((r) => r.h === S.row), `one ${S.row}px row per product in All`, { count: t.rows.length, heights: [...new Set(t.rows.map((r) => r.h))] })
      expect(t.rows.every((r) => r.pic.join() === `${S.pic},${S.pic}` && r.radius === S.radius), `a ${S.pic}px picture, ${S.radius} round`, [...new Set(t.rows.map((r) => `${r.pic.join("x")} r${r.radius}`))])
      expect(t.rows.every((r) => r.nameSize === S.name && r.nameWeight === "500" && r.tableSize === S.table), `the name at ${S.name} medium, the cells at ${S.table}`, [t.rows[0].nameSize, t.rows[0].tableSize])
      expect(t.rows.every((r) => r.statusBg === "rgba(0, 0, 0, 0)") && t.rows[0].status === "Active" && t.rows[0].dot === "rgb(34, 160, 107)" && t.rows[3].status === "Draft" && t.rows[3].dot === "rgb(224, 161, 0)",
        "the status is a dot and a word, green for Active and amber for Draft, with no badge", t.rows.slice(0, 4).map((r) => [r.status, r.dot]))
      expect(t.rows.every((r) => r.nums.length >= 1 && r.nums.every(([a, n]) => a === "right" && /tabular-nums/.test(n))), "numbers right aligned in figures of one width", t.rows[0].nums)
      expect(/^0px/.test(t.rows[0].divider) && /^1px rgb\(241, 242, 244\)$/.test(t.rows[1].divider), "no line over the first row, a light hairline between the rest", [t.rows[0].divider, t.rows[1].divider])
      expect(t.rows.every((r) => r.inside >= 12 && r.ellipsis === "ellipsis") && t.nameCol >= (tier === "md" ? 188 : 150), `a long name stays in its column${t.rows[2].cut ? " and stops with an ellipsis" : ", whole at this width"}`, { inside: t.rows[2].inside, cut: t.rows[2].cut, nameCol: t.nameCol })
      expect(t.rows.every((r) => r.eye.join() === `${S.rowBtn},${S.rowBtn}` && r.menu.join() === r.eye.join() && r.mid === 0 && r.gap === S.rowGap && r.eyeInCell), `Preview on every row in the actions column, ${S.rowBtn}px like the more button, ${S.rowGap}px before it, on one centre line`, [...new Set(t.rows.map((r) => `${r.eye.join("x")}/${r.menu.join("x")} gap ${r.gap} mid ${r.mid}`))])
      if (tier !== "md") {
        const o = OLD[tier]
        const n = { bar: bar.barH, row: t.rows[0].h, pic: t.rows[0].pic[0], name: parseFloat(t.rows[0].nameSize), table: parseFloat(t.rows[0].tableSize), head: t.headH, btn: bar.add[1], search: row.search, track: row.views, rowBtn: t.rows[0].menu[0], container: col.width, title: parseFloat(bar.titleSize) }
        const r = Object.fromEntries(Object.keys(n).filter((k) => k !== "container").map((k) => [k, +(n[k] / o[k]).toFixed(3)]))
        growth.push({ label, ...Object.fromEntries(Object.keys(r).map((k) => [k, `${o[k]} > ${n[k]} (${((r[k] - 1) * 100).toFixed(1)}%)`])), container: `${Math.min(o.container, col.width)} > ${col.width}` })
        /* The footer is measured on the sixty product page below; its before and after is added there. */
        expect(Object.values(r).every((x) => x >= 1.05 && x <= 1.09), "every size is 5 to 9% bigger than it was (7% rounded to the pixel)", r)
      }

      /* Headless Chromium reports (hover: none), so the tint is read from the rule itself. */
      const tint = await p.evaluate(() => {
        const rules = []
        const walk = (list, media, sel) => {
          for (const r of list) {
            const s = r.selectorText ? `${sel} ${r.selectorText}` : sel
            const m = r.media ? `${media} ${r.media.mediaText}` : media
            if (r.style && r.style.backgroundColor && s.includes("group-hover\\:bg-\\[\\#fafafb\\]")) rules.push([m, r.style.backgroundColor])
            if (r.cssRules) walk(r.cssRules, m, s)
          }
        }
        for (const s of document.styleSheets) walk(s.cssRules, "", "")
        const td = document.querySelector("section[aria-label=Products] tbody tr td")
        return { rules, onRow: td.className.includes("group-hover:bg-[#fafafb]") && td.parentElement.classList.contains("group") }
      })
      expect(tint.onRow && tint.rules.some(([m, c]) => /hover/.test(m) && /250, 250, 251|#fafafb/i.test(c)), "a row under a pointer is tinted #fafafb, as Orders' are", tint)

      /* Once the list is idle, New product and the first three rows are fetched ahead; the gestures below are read after that. */
      await p.waitForFunction(() => (window.__prefetched || []).some(([h]) => h === "/app/products/new"), { timeout: 4000 }).catch(() => {})
      const ahead = await p.evaluate(() => { const got = window.__prefetched || []; window.__prefetched = []; return got })
      expect(ahead.map(([h, k]) => `${h} ${k}`).join() === "/app/products/new full,/app/products/p0 full,/app/products/p1 full,/app/products/p2 full", "once the list is idle, New product and the first three rows are fetched ahead in full, once each", ahead)
      await p.hover("section[aria-label=Products] tbody tr:nth-child(7)")
      await p.hover("section[aria-label=Products] tbody tr:nth-child(5) td:nth-child(2)")
      await wait(150)
      const pre = await p.evaluate(() => window.__prefetched || [])
      expect(pre.length === 1 && pre[0][0] === "/app/products/p4" && pre[0][1] === "full", "a pointer resting on a row prefetches that product's editor in full, one passing over does not", pre)
      await p.click("section[aria-label=Products] tbody tr:nth-child(2) td:nth-child(2)")
      /* The push runs inside the editor's move, a frame after the press; here no editor arrives, and the move gives up after 450ms. */
      await wait(650)
      const pushed = await p.evaluate(() => window.__pushed || [])
      expect(pushed.length === 1 && pushed[0] === "/app/products/p1", "a click anywhere on a row opens the product", pushed)
      /* The press is answered at once: the row holds its tint with a spinner where its Preview was. */
      const answered = await p.evaluate(() => !!document.querySelector("section[aria-label=Products] tbody tr:nth-child(2)[data-opening] [data-row-opening] [role=status]"))
      expect(answered, "the pressed row answers at once, with a spinner where its Preview was", answered)
      /* A real open takes the list away; this harness stays. Shown again (the back cache's pageshow), the list comes back to life. */
      await p.evaluate(() => window.dispatchEvent(new Event("pageshow")))
      await wait(50)
      await p.mouse.move(5, 5)
      await wait(100)

      /* Preview's name on a pointer and on the keyboard: near black, no arrow. A draft's says why it is off. */
      const tipOf = async (sel) => {
        await p.hover(sel)
        await wait(650)
        return p.evaluate(() => {
          const c = [...document.querySelectorAll("[data-slot=tooltip-content]")].find((x) => x.getClientRects().length > 0)
          if (!c) return null
          const arrow = c.querySelector("svg")
          return { text: c.querySelector("[role=tooltip]")?.textContent.trim(), bg: getComputedStyle(c).backgroundColor, color: getComputedStyle(c).color, size: getComputedStyle(c).fontSize, arrow: arrow ? getComputedStyle(arrow).display : "none" }
        })
      }
      const tipLive = await tipOf("section[aria-label=Products] tbody tr:nth-child(1) [data-preview]")
      row.tip = tipLive?.text
      expect(tipLive && tipLive.text === "Preview" && tipLive.bg === "rgb(26, 26, 46)" && tipLive.color === "rgb(255, 255, 255)" && tipLive.arrow === "none", "Preview says Preview on a pointer: near black, white 12px words, no arrow", tipLive)
      const tipDraft = await tipOf("section[aria-label=Products] tbody tr:nth-child(4) [data-preview]")
      expect(tipDraft && tipDraft.text === "Publish to preview", "a draft's says Publish to preview", tipDraft)
      await p.mouse.move(5, 5)
      await wait(200)
      const focusTip = await p.evaluate(async () => {
        const eye = document.querySelector("section[aria-label=Products] tbody tr:nth-child(2) [data-preview]")
        eye.focus()
        await new Promise((r) => setTimeout(r, 150))
        const id = eye.getAttribute("aria-describedby")
        const text = id ? document.getElementById(id)?.textContent.trim() : null
        eye.blur()
        return text
      })
      expect(focusTip === "Preview", "and on the keyboard's focus", focusTip)
      await wait(200)

      /*
        A live product's Preview opens its page in a new tab, and not the
        product. The press is real; what it would open is read at the window
        as it starts (the link, its target and rel, and whether the page's
        own code held it back), and then held back here, so no real tab goes
        out to the network.
      */
      const pushedBefore = (await p.evaluate(() => window.__pushed || [])).length
      await p.evaluate(() => {
        window.__preview = null
        window.addEventListener("click", (e) => {
          const a = e.target.closest?.("a[data-preview]")
          if (!a) return
          const seen = { href: a.href, target: a.target, rel: a.rel, heldByPage: false }
          const hold = e.preventDefault.bind(e)
          e.preventDefault = () => { seen.heldByPage = true; hold() }
          window.__preview = seen
          hold()
        }, { capture: true, once: true })
      })
      await p.click("section[aria-label=Products] tbody tr:nth-child(1) [data-preview]")
      await wait(650)
      const opened = await p.evaluate(() => window.__preview)
      const pushedAfter = (await p.evaluate(() => window.__pushed || [])).length
      expect(opened && opened.href === "https://storelib.com/astrid/product-0" && opened.target === "_blank" && opened.rel === "noopener noreferrer" && !opened.heldByPage && pushedAfter === pushedBefore,
        "pressing it opens the product's page in a new tab (the browser's own, nothing held back) and does not open the editor", { opened, pushed: pushedAfter - pushedBefore })

      await p.mouse.move(5, 5)
    }
    const depth = await p.evaluate(() => {
      const look = (el) => { const c = getComputedStyle(el); const r = el.getBoundingClientRect(); return { shadow: c.boxShadow, border: `${c.borderTopWidth} ${c.borderTopColor}`, bg: c.backgroundColor, color: c.color, size: `${Math.round(r.width)}x${Math.round(r.height)}` } }
      const btn = [...document.querySelectorAll("section[aria-label=Products] button[aria-label^='Actions for']")].find((b) => b.getBoundingClientRect().width > 0)
      const eye = [...document.querySelectorAll("section[aria-label=Products] a[data-preview]")].find((b) => b.getBoundingClientRect().width > 0)
      return { row: look(btn), eye: look(eye), editor: look(document.querySelector("[data-probe-more]")) }
    })
    row.menuShadow = depth.row.shadow === depth.editor.shadow ? "= editor" : "differs"
    /* The rows' button is smaller than the editor's since the page's scale came down, so its size and radius are its own; the depth is still the editor's. */
    const rowSize = isPhone ? "32x32" : `${S.rowBtn}x${S.rowBtn}`
    expect(["shadow", "border", "bg", "color"].every((k) => depth.row[k] === depth.editor[k]) && depth.row.size === rowSize, `the rows' more button has the editor's depth: the same shade, hairline and white, at ${rowSize}`, depth)
    expect(["shadow", "border", "bg", "color", "size"].every((k) => depth.eye[k] === depth.row[k]), "and Preview the same, at the same size", { eye: depth.eye, menu: depth.row })

    const footer = await p.evaluate(() => { const f = document.querySelector("[data-footer]"); return f ? getComputedStyle(f).display : "missing" })
    expect(isPhone ? footer === "none" : footer === "flex", isPhone ? "no footer counting rows on a phone when there is one page" : "the footer counts what is shown", footer)
    if (!isPhone) await p.screenshot({ path: join(shots, `${label}-products-v3.png`) })

    /*
      SWITCHING VIEWS. All, Draft, Archived, All: every picture shown before is
      the same <img> element after (none made again), rows move and fade on
      opacity and transform only (the card's foot on clip-path), and every
      frame has a row drawn at half strength or more, a leaving one or an
      arriving one. Pressed on the views' own buttons, which on a phone are
      in the DOM but not drawn: the sheet's rows call the same showView, and
      the sheet itself is pressed further down.
    */
    const swap = await p.evaluate(async () => {
      const section = document.querySelector("section[aria-label=Products]")
      const imgs = () => new Map([...section.querySelectorAll("[data-row]")].filter((r) => !r.hidden && r.getClientRects().length > 0).map((r) => [r.dataset.row, r.querySelector("img")]).filter(([, i]) => i))
      const before = imgs()
      const made = []
      const mo = new MutationObserver((ms) => {
        for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && !n.matches("[data-list-leaving]") && !n.closest("[data-list-leaving]") && (n.matches("img") || n.querySelector("img"))) made.push(n.tagName)
      })
      mo.observe(section, { childList: true, subtree: true })
      const kind = (t) => (t.dataset?.row ? "row" : t === section ? "card" : t.matches?.("[data-list-leaving]") ? "leaving" : t.matches?.("[data-footer]") ? "footer" : t.matches?.("[data-empty]") ? "empty" : t.tagName)
      const run = async (name) => {
        const t0 = performance.now()
        ;[...document.querySelectorAll("[role=tab]")].find((t) => t.textContent.trim() === name).click()
        /* React commits a click's update in a microtask; the move starts in that commit's layout effect. */
        await new Promise((r) => setTimeout(r, 0))
        const anims = document.getAnimations().filter((a) => a.effect?.target && section.contains(a.effect.target)).map((a) => ({
          on: kind(a.effect.target),
          props: [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k).filter((x) => !["offset", "easing", "composite", "computedOffset"].includes(x))))],
          ms: a.effect.getTiming().duration,
        }))
        const frames = []
        while (performance.now() - t0 < 420) {
          const rows = [...section.querySelectorAll("[data-row]:not([hidden])")].filter((r) => r.getClientRects().length > 0)
          const layer = section.querySelector("[data-list-leaving]")
          const strongest = Math.max(0, ...rows.map((r) => +getComputedStyle(r).opacity), layer && layer.children.length ? +getComputedStyle(layer).opacity : 0)
          frames.push({ t: Math.round(performance.now() - t0), rows: rows.length, leaving: layer ? layer.children.length : 0, strongest: +strongest.toFixed(2), empty: !!section.querySelector("[data-empty]") })
          await new Promise((r) => requestAnimationFrame(r))
        }
        return { name, anims, frames }
      }
      const runs = []
      for (const name of ["Draft", "Archived", "All"]) runs.push(await run(name))
      mo.disconnect()
      const after = imgs()
      return { pictures: before.size, same: [...before].every(([id, img]) => after.get(id) === img), made, runs, left: section.querySelectorAll("[data-list-leaving]").length, minHeight: section.style.minHeight }
    })
    const allAnims = swap.runs.flatMap((r) => r.anims)
    const allowed = { row: ["opacity", "transform"], leaving: ["opacity"], footer: ["transform"], empty: ["opacity"], card: ["clipPath"] }
    const worst = Math.min(...swap.runs.flatMap((r) => r.frames.map((f) => f.strongest)))
    row.swapFrames = swap.runs.map((r) => r.frames.length).join("/")
    row.swapWeakest = worst
    console.log(`        (switches: ${swap.runs.map((r) => `${r.name} ${r.frames.length} frames, ${r.anims.length} animations [${[...new Set(r.anims.map((a) => `${a.on}:${a.props.join("+")} ${a.ms}ms`))].join(", ")}]`).join("; ")})`)
    expect(swap.pictures >= 10 && swap.same && swap.made.length === 0, "All, Draft, Archived, All: every picture is the same <img> element it was, none made again", { pictures: swap.pictures, same: swap.same, made: swap.made })
    expect(allAnims.length > 0 && allAnims.every((a) => allowed[a.on] && a.props.every((x) => allowed[a.on].includes(x))), "the change is played on opacity and transform (the card's foot on clip-path), nothing that lays the page out", [...new Set(allAnims.map((a) => `${a.on}:${a.props.join("+")}`))])
    expect(allAnims.every((a) => a.ms >= 140 && a.ms <= 220), "each part in 140 to 220ms", [...new Set(allAnims.map((a) => a.ms))])
    expect(swap.runs.every((r) => r.frames.every((f) => f.rows + f.leaving > 0)) && worst >= 0.5, "no frame with an empty list: some row, leaving or arriving, is always drawn at half strength or more", { weakest: worst, frames: swap.runs.map((r) => r.frames.slice(0, 4)) })
    expect(swap.left === 0 && swap.minHeight === "", "and when it has settled nothing is left behind: no copies, no held height", { copies: swap.left, minHeight: swap.minHeight })
    const pics = await p.evaluate(() => [...document.querySelectorAll("section[aria-label=Products] [data-thumb]")].filter((t) => t.getClientRects().length > 0).map((t) => { const i = t.querySelector("img"); return { bg: getComputedStyle(t).backgroundColor, decoding: i?.decoding ?? null, w: i?.getAttribute("width") ?? null, h: i?.getAttribute("height") ?? null } }))
    expect(pics.every((x) => x.bg === "rgb(236, 238, 241)") && pics.filter((x) => x.decoding !== null).every((x) => x.decoding === "async" && x.w && x.h), "each picture sits on grey (never white), decodes off the main thread, with its width and height set", pics.slice(0, 2))
    await p.screenshot({ path: join(shots, `products-${label}-after-switch.png`) })

    /* On a phone the views and the orders are one sheet, opened from the view's name. */
    const sheetPick = async (name) => {
      await p.click("[data-toolbar] button[data-view-select]")
      await wait(650)
      const found = await p.evaluate((name) => {
        const d = [...document.querySelectorAll("[role=dialog]")].find((x) => /Sort by/.test(x.textContent))
        if (!d) return null
        const rows = [...d.querySelectorAll("[data-action-sheet] button")]
        const b = rows.find((x) => x.textContent.trim() === name)
        const out = { rows: rows.map((x) => x.textContent.trim()), groups: [...d.querySelectorAll("[data-action-sheet] [role=group]")].map((g) => g.getAttribute("aria-label")) }
        b?.click()
        return out
      }, name)
      await wait(700)
      return found
    }
    if (isPhone) {
      const sheet = await sheetPick("Draft")
      await p.screenshot({ path: join(shots, `${label}-products-v3-draft.png`) })
      const now = await p.evaluate(() => ({ label: document.querySelector("[data-toolbar] button[data-view-select]").textContent.trim(), rows: window.__rows().length, statuses: [...window.__rows()].map((r) => r.querySelector("[data-meta] [data-status]")?.textContent ?? null) }))
      expect(sheet && ["All", "Active", "Draft", "Archived", "Newest", "Price high to low"].every((x) => sheet.rows.includes(x)) && sheet.groups.includes("Sort by"), "the view's name opens one sheet: All, Active, Draft, Archived, then Sort by", sheet)
      expect(now.label === "Draft" && now.rows === 2, "picking Draft there shows the two drafts, and the toolbar says Draft", now)
      expect(now.statuses.every((s) => s === null), "in the Draft view the rows do not say Draft again", now.statuses)
      await sheetPick("All")
    } else {
      /* Views: Draft holds the two drafts, and the segment slides under it. */
      await p.evaluate(() => [...document.querySelectorAll("[role=tab]")].find((t) => t.textContent.trim() === "Draft").click())
      await wait(320)
      const drafts = await p.evaluate(() => {
        const tab = [...document.querySelectorAll("[role=tab]")].find((t) => t.textContent.trim() === "Draft").getBoundingClientRect()
        const segment = document.querySelector("[data-segment]")
        const s = segment.getBoundingClientRect()
        return { rows: window.__rows().length, tab: [Math.round(tab.left), Math.round(tab.width)], segment: [Math.round(s.left), Math.round(s.width)], transition: getComputedStyle(segment).transitionProperty }
      })
      expect(drafts.rows === 2, "the Draft view holds the two drafts", drafts.rows)
      expect(Math.abs(drafts.segment[0] - drafts.tab[0]) <= 2 && Math.abs(drafts.segment[1] - drafts.tab[1]) <= 3 && /^transform\b/.test(drafts.transition), "and the white segment has slid under Draft, on transform alone", drafts)
      await p.evaluate(() => [...document.querySelectorAll("[role=tab]")].find((t) => t.textContent.trim() === "All").click())
      await wait(80)
    }

    /* Sort: price high to low puts the dearest first. */
    let sorted
    if (isPhone) {
      sorted = !!(await sheetPick("Price high to low"))
    } else {
      await p.click("[data-controls] button[aria-label='Sort']")
      await wait(250)
      sorted = await p.evaluate(() => {
        const option = [...document.querySelectorAll("[role=menuitem]")].find((b) => b.textContent.trim() === "Price high to low")
        if (!option) return null
        option.click()
        return true
      })
      await wait(150)
    }
    const prices = await p.evaluate(() => [...window.__rows()].slice(0, 3).map((r) => (r.textContent.match(/\$\d+\.\d{2}/) || [""])[0]))
    expect(sorted && prices.join() === "$54.00,$50.50,$47.00", "Sort, Price high to low, puts the dearest first", prices)
    if (!isPhone) {
      const sortOn = await p.$eval("[data-controls] button[aria-label='Sort']", (b) => getComputedStyle(b.firstElementChild).backgroundColor)
      expect(sortOn === "rgb(236, 238, 241)", "and the sort button shows an order other than Newest is on", sortOn)
    }

    /* Search: typing narrows; nothing found says so and offers to clear it. */
    await p.click(SEARCH)
    await p.type(SEARCH, "portrait")
    await wait(80)
    const found = await p.evaluate(() => [...window.__rows()].map((r) => r.textContent))
    expect(found.length === 1 && /portrait/.test(found[0]), "typing narrows the list", found.length)
    const clearBtn = await p.$eval(`${SEARCH_BOX} button[aria-label='Clear search']`, (b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)] })
    expect(isPhone ? clearBtn[0] >= 44 && clearBtn[1] >= 44 : clearBtn[0] >= 24, "and a clear button appears in the field", clearBtn)
    await p.screenshot({ path: join(shots, `${label}-products-v3-search.png`) })
    await p.type(SEARCH, "zzz")
    await wait(80)
    const empty = await p.evaluate(() => document.querySelector("section[aria-label=Products]").textContent)
    expect(/No products match/.test(empty) && /Clear search/.test(empty), "a search with nothing found says so and offers to clear it", /No products match/.test(empty))
    if (isPhone) {
      const stays = await p.evaluate(() => { const t = document.querySelector("[data-toolbar]"); return !!t && t.getClientRects().length > 0 })
      expect(stays, "and the toolbar stays, so the search can be changed", stays)
    }
    await p.evaluate(() => [...document.querySelectorAll("section[aria-label=Products] [data-empty] button")].find((b) => b.textContent.trim() === "Clear search").click())
    await wait(80)
    const back = await p.evaluate((sel) => ({ rows: window.__rows().length, value: document.querySelector(sel).value }), SEARCH)
    expect(back.rows === 13 && back.value === "", "Clear search brings every product back", back)
    await p.type(SEARCH, "Product 1")
    await p.keyboard.press("Escape")
    await wait(80)
    const esc = await p.evaluate((sel) => document.querySelector(sel).value, SEARCH)
    expect(esc === "", "Escape in the field clears it", esc)

    /* A row's actions: a dropdown on a computer, a sheet on a phone, all five there. */
    const btn = await p.$(isPhone ? "section[aria-label=Products] ul > li:not([hidden]) button[aria-label^='Actions for']" : "section[aria-label=Products] tbody tr:not([hidden]) button[aria-label^='Actions for']")
    const pushedBeforeMenu = (await p.evaluate(() => window.__pushed || [])).length
    await btn.click()
    await wait(isPhone ? 600 : 300)
    const menu = await p.evaluate(() => {
      const box = document.querySelector("[role=menu]") || [...document.querySelectorAll("[role=dialog]")].find((d) => /Duplicate/.test(d.textContent))
      return {
        kind: document.querySelector("[role=menu]") ? "dropdown" : box ? "sheet" : "none",
        labels: box ? [...box.querySelectorAll("a, button, [role=menuitem]")].map((b) => b.textContent.trim()).filter((t) => /^(View|Share|Archive|Restore|Duplicate|Delete)$/.test(t)) : [],
        pushed: (window.__pushed || []).length,
      }
    })
    expect(menu.kind === (isPhone ? "sheet" : "dropdown"), `a row's actions are a ${isPhone ? "bottom sheet" : "dropdown"}`, menu.kind)
    expect(["View", "Share", "Archive", "Duplicate", "Delete"].every((l) => menu.labels.includes(l)), "with View, Share, Archive, Duplicate and Delete", [...new Set(menu.labels)])
    expect(menu.pushed === pushedBeforeMenu, "and opening them does not open the product", menu.pushed - pushedBeforeMenu)
    await p.screenshot({ path: join(shots, `${label}-products-v3-actions.png`) })
    /* Delete asks first, with Cancel focused, and Escape takes the question away. */
    await p.evaluate(() => {
      const box = document.querySelector("[role=menu]") || [...document.querySelectorAll("[role=dialog]")].find((d) => /Duplicate/.test(d.textContent))
      ;[...box.querySelectorAll("a, button, [role=menuitem]")].find((b) => b.textContent.trim() === "Delete").click()
    })
    await wait(isPhone ? 700 : 300)
    const ask = await p.evaluate(() => ({ open: !!document.querySelector("[role=alertdialog]"), title: document.querySelector("#delete-product-title")?.textContent, focus: document.activeElement?.textContent?.trim() }))
    expect(ask.open && /^Delete Product \d+\?$/.test(ask.title || "") && ask.focus === "Cancel", "Delete asks first, with Cancel focused", ask)
    await p.keyboard.press("Escape")
    await wait(100)
    expect(!(await p.$("[role=alertdialog]")), "and Escape closes the question without deleting", null)
    await p.close()

    /* Sixty products: fifty on a page, then the footer's arrows. */
    const q = await open(vp, `${hash || "#"}many`)
    await q.evaluate(`window.__shown = ${shown}; window.__rows = ${rowsShown}`)
    const count = () => q.evaluate(() => ({ rows: window.__rows().length, footer: document.querySelector("[data-footer]").textContent.trim(), h: Math.round(document.querySelector("[data-footer]").getBoundingClientRect().height) }))
    const first = await count()
    const footH = isPhone ? 44 : S.footer
    expect(first.rows === 50 && /^1–50 of 59/.test(first.footer) && first.h === footH, `sixty products (59 not archived): fifty on the first page, and a ${footH}px footer says so`, first)
    if (!isPhone && tier !== "md") {
      const g = growth.find((x) => x.label === label)
      if (g) g.footer = `${OLD[tier].footer} > ${first.h} (${((first.h / OLD[tier].footer - 1) * 100).toFixed(1)}%)`
      expect(first.h / OLD[tier].footer >= 1.05 && first.h / OLD[tier].footer <= 1.09, "the footer 7% taller too", [OLD[tier].footer, first.h])
    }
    const next = await q.evaluate(() => {
      const press = document.querySelector("button[aria-label='Next page']")
      press.scrollIntoView({ block: "center" })
      const b = press.firstElementChild.getBoundingClientRect()
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top - 5)?.closest("button[aria-label='Next page']") != null
      return { drawn: [Math.round(b.width), Math.round(b.height)], press: [Math.round(press.getBoundingClientRect().width), Math.round(press.getBoundingClientRect().height)], hit }
    })
    const arrows = isPhone ? "32,28" : S.arrows
    expect(next.drawn.join() === arrows, `the page arrows are drawn at ${arrows.replace(",", " by ")}`, next.drawn)
    if (isPhone) expect(next.hit && next.press.join() === "44,44", "and are a 44px press on a phone", next)
    await q.click("button[aria-label='Next page']")
    await wait(80)
    const second = await count()
    expect(second.rows === 9 && /^51–59 of 59/.test(second.footer), "Next shows the other nine", second)
    const qSide = await q.evaluate(() => { const pane = document.querySelector(".orders-pane"); return pane.scrollWidth - pane.clientWidth })
    expect(qSide === 0, "and still nothing scrolls sideways", qSide)
    await q.close()
    summary.push(row)
  }

  /* An empty shop: one line, one way forward, and nothing to search, sort, filter or export. */
  {
    console.log("\nno products yet (390)")
    const p = await open(phone(390), "#none")
    const e = await p.evaluate(() => {
      const card = document.querySelector("section[aria-label=Products]")
      const create = card.querySelector("a[href='/app/products/new']")
      const r = create?.getBoundingClientRect()
      const a = create && getComputedStyle(create, "::after")
      return {
        text: card.textContent, create: !!create, createBox: r ? [Math.round(r.width), Math.round(r.height) - 2 * (parseFloat(a.top) || 0)] : null, createBg: create ? getComputedStyle(create).backgroundColor : null,
        controls: !!document.querySelector("[data-controls]"), export: !!document.querySelector("button[aria-label='Export products']"), barNew: !!document.querySelector("a[data-new-product]"), footer: !!card.querySelector("[data-footer]"),
      }
    })
    expect(/No products yet/.test(e.text) && e.create && e.createBg === "rgb(139, 92, 246)" && !e.footer, "No products yet, with a violet Create product, and no footer counting nothing", e)
    expect(e.createBox && e.createBox[1] >= 44, "Create product is a 44px press", e.createBox)
    expect(!e.controls && !e.export, "no search, sort, views or Export in an empty shop", { controls: e.controls, export: e.export })
    expect(!e.barNew, "and no second New product in the bar: one violet button on the screen, not two", e.barNew)
    await p.screenshot({ path: join(shots, "phone-390-products-v2-empty.png") })
    await p.close()
  }
  /*
    ARCHIVE AND RESTORE, AGAINST A FAKE DATABASE. The page's requests to the
    database are answered here, as the REST API would, from a table kept in
    this script, so what is measured is the request the page sends and what
    the list does with the answer. `#legacy` saves the last product with
    status "archived" and the flag off: the row Restore used to leave
    archived however often it was pressed.
  */
  {
    console.log("\narchive and restore (1280)")
    const table = new Map([["p13", { status: "archived", archived: false }], ["p0", { status: "published", archived: false }]])
    const sent = []
    const p = await browser.newPage()
    await p.setViewport({ width: 1280, height: 800 })
    await p.setRequestInterception(true)
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS" }
    p.on("request", (req) => {
      const url = req.url()
      if (!url.startsWith("https://placeholder.supabase.co")) return req.continue()
      if (req.method() === "OPTIONS") return req.respond({ status: 204, headers: cors })
      const u = new URL(url)
      if (req.method() !== "PATCH" || !u.pathname.endsWith("/rest/v1/products")) return req.respond({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: "[]" })
      const patch = JSON.parse(req.postData() || "{}")
      const id = (u.searchParams.get("id") || "").replace(/^eq\./, "")
      const onlyStatus = u.searchParams.get("status")?.replace(/^eq\./, "")
      sent.push({ id, patch, where: onlyStatus ? `status=${onlyStatus}` : "" })
      const row = table.get(id)
      const hit = row && (!onlyStatus || row.status === onlyStatus) ? [row] : []
      for (const r of hit) Object.assign(r, patch)
      const body = u.searchParams.has("select") ? JSON.stringify(hit.map((r) => ({ status: r.status, archived: r.archived }))) : ""
      return req.respond({ status: body ? 200 : 204, headers: { ...cors, "content-type": "application/json" }, body })
    })
    await p.goto(`file://${join(stubs, "index.html")}#legacy`)
    await p.evaluate(() => document.fonts.ready)
    await wait(300)
    const tabs = () => p.$$eval("[role=tab]", (t) => t.map((x) => x.textContent.trim()))
    const view = async (name) => { await p.evaluate((name) => [...document.querySelectorAll("[role=tab]")].find((t) => t.textContent.trim() === name).click(), name); await wait(350) }
    const names = () => p.$$eval("section[aria-label=Products] table tbody tr:not([hidden])", (r) => r.map((tr) => tr.querySelector("td a").textContent.trim()))
    const act = async (title, label) => {
      await p.click(`table button[aria-label='Actions for ${title}']`)
      await wait(250)
      await p.evaluate((label) => [...document.querySelectorAll("[role=menuitem]")].find((m) => m.textContent.trim() === label).click(), label)
      await wait(400)
    }
    await view("Archived")
    const before = await names()
    expect(before.includes("Product 14"), "a product saved as archived is in Archived", before)
    await act("Product 14", "Restore")
    const afterRestore = await names()
    expect(!afterRestore.includes("Product 14"), "Restore takes it out of Archived", afterRestore)
    expect(sent.length === 2 && sent[0].where === "status=archived" && sent[0].patch.status === "draft" && sent[1].patch.archived === false,
      "  by setting an archived status back to draft, then clearing the flag", sent)
    await view("Draft")
    const drafts = await names()
    expect(drafts.includes("Product 14") && table.get("p13").status === "draft", "  and it is a draft again, in the list and in the table", { drafts, row: table.get("p13") })
    await view("All")
    await act("Product 1", "Archive")
    const all = await names()
    expect(!all.includes("Product 1") && table.get("p0").status === "archived" && table.get("p0").archived === true,
      "Archive takes a live product off: its status is archived, and it leaves All", { row: table.get("p0"), sent: sent.slice(2) })
    await view("Archived")
    expect((await names()).includes("Product 1"), "  and it is in Archived", await tabs())
    await p.close()
  }
  await browser.close()
} finally {
  if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
}
console.log("\nsummary (px)")
console.table(summary)
console.log("\n7% from 1024px: before > after")
console.table(growth)
console.log(`\nscreenshots in ${shots}`)
if (broken) { console.error(`\n${broken} check(s) failed\n`); process.exit(1) }
console.log("\nall checks passed\n")
