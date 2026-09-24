/**
 * ===========================================================================
 *  THE PRODUCTS PAGE, MEASURED
 * ===========================================================================
 * On a phone: the bar with the title, Export as a plain icon and New product
 * as the one dark button; a real search field with Sort beside it; one
 * segmented control for the views; then the products straight on the page,
 * 72px rows with a 56px picture, the name, and the price and sales in grey,
 * a status only on a row that is not on sale. From 768px the same parts as a
 * light table in one card: 64px rows, a 44px picture, the status as a dot
 * and a word. Every press on a phone is 44px however small it is drawn,
 * nothing scrolls sideways, and nothing of the page's sits under the
 * navigation pill, whose box is read from components/app/sidebar-mobile-nav.
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

try {
  writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/app/products"
export const useRouter = () => ({ push(href) { (window.__pushed ||= []).push(href) }, replace() {}, prefetch(href, o) { (window.__prefetched ||= []).push([href, o && o.kind]) }, back() {}, refresh() {} })
export const useSearchParams = () => new URLSearchParams()
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { e.preventDefault(); rest.onClick && rest.onClick(e) } }, children) })
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
  const rowsShown = `() => window.__shown("section[aria-label=Products] ul, section[aria-label=Products] table").querySelectorAll("li, tbody tr")`

  for (const [label, vp, hash] of [
    ["phone-360", phone(360)],
    ["phone-390", phone(390)],
    ["phone-430", phone(430)],
    ["tablet-768", { width: 768, height: 1024 }, "#sidebar"],
    ["desktop-1280", { width: 1280, height: 800 }],
  ]) {
    const isPhone = label.startsWith("phone")
    console.log(`\n${label}${hash ? ` (${hash.slice(1)}: the page 240px in, beside the sidebar)` : ""}`)
    const p = await open(vp, hash)
    await p.evaluate(`window.__shown = ${shown}; window.__rows = ${rowsShown}`)
    const pageLeft = hash ? 240 : 0
    const row = { label }

    /* The bar: Orders' 66px, the title, Export, and New product as the one dark button. */
    const bar = await p.evaluate((pageLeft) => {
      const el = document.querySelector("[data-orders-bar]")
      const h = el.querySelector("h1")
      const addEl = el.querySelector("a[data-new-product]")
      const add = addEl.getBoundingClientRect()
      const expBtn = el.querySelector("button[aria-label='Export products']")
      const exp = expBtn.firstElementChild.getBoundingClientRect()
      const hitAbove = document.elementFromPoint(add.left + add.width / 2, add.top - 5)?.closest("a[data-new-product]") != null
      const hitBelow = document.elementFromPoint(add.left + add.width / 2, add.bottom + 5)?.closest("a[data-new-product]") != null
      const expLook = getComputedStyle(expBtn.firstElementChild)
      return {
        barH: Math.round(el.getBoundingClientRect().height), titleSize: getComputedStyle(h).fontSize,
        add: [Math.round(add.width), Math.round(add.height)], addBg: getComputedStyle(addEl).backgroundColor, addText: addEl.textContent.trim(),
        exp: [Math.round(exp.width), Math.round(exp.height)], expText: expBtn.innerText.trim(), expBorder: expLook.borderTopColor, expBg: expLook.backgroundColor,
        titleLeft: Math.round(h.getBoundingClientRect().left - pageLeft), addRight: Math.round(window.innerWidth - add.right), hitAbove, hitBelow,
        press: [Math.round(expBtn.getBoundingClientRect().width), Math.round(expBtn.getBoundingClientRect().height)],
      }
    }, pageLeft)
    row.header = bar.barH
    expect(bar.barH === 66, "the bar is Orders' 66px", bar.barH)
    expect(bar.titleSize === (isPhone ? "24px" : "28px"), `the title is ${isPhone ? 24 : 28}px`, bar.titleSize)
    expect(bar.addText === "New product" && bar.add[1] === 32 && bar.addBg === "rgb(26, 26, 46)", "New product is one compact dark button, 32px, #1a1a2e, not the violet", { add: bar.add, bg: bar.addBg })
    if (isPhone) {
      expect(bar.expText === "" && bar.exp.join() === "32,32" && bar.expBg === "rgba(0, 0, 0, 0)" && bar.expBorder === "rgba(0, 0, 0, 0)", "Export is a plain icon on a phone, with no box drawn round it", bar)
      expect(bar.hitAbove && bar.hitBelow && bar.press.join() === "44,44", "and both are a 44px press: a finger 5px outside New product still lands on it", { press: bar.press, above: bar.hitAbove, below: bar.hitBelow })
      expect(bar.titleLeft === 16 && bar.addRight === 16, "16px in from both edges", { left: bar.titleLeft, right: bar.addRight })
    } else {
      expect(bar.expText === "Export", "Export says Export", bar.expText)
    }

    /* Search and sort: a real field, always there, with Sort beside it. */
    const tools = await p.evaluate(() => {
      const field = document.querySelector("[data-controls] label[data-search]")
      const input = field.querySelector("input[type=search]")
      const drawn = input.parentElement.getBoundingClientRect()
      const sort = document.querySelector("[data-controls] button[aria-label='Sort']")
      const sortDrawn = sort.firstElementChild.getBoundingClientRect()
      return {
        field: [Math.round(field.getBoundingClientRect().width), Math.round(field.getBoundingClientRect().height)], drawn: [Math.round(drawn.width), Math.round(drawn.height)],
        font: getComputedStyle(input).fontSize, placeholder: input.placeholder,
        sort: [Math.round(sort.getBoundingClientRect().width), Math.round(sort.getBoundingClientRect().height)], sortDrawn: [Math.round(sortDrawn.width), Math.round(sortDrawn.height)],
      }
    })
    row.search = tools.drawn[1]
    expect(tools.placeholder === "Search products" && tools.font === (isPhone ? "16px" : "13px"), `a search field that is always there, ${isPhone ? "16px text so iOS does not zoom" : "13px text"}`, tools)
    expect(isPhone ? tools.field[1] === 44 && tools.drawn[1] === 40 : tools.drawn[1] === 32, isPhone ? "drawn 40px in a 44px press" : "drawn 32px", tools.drawn)
    expect(isPhone ? tools.sort.join() === "44,44" && tools.sortDrawn.join() === "40,40" : tools.sortDrawn.join() === "32,32", isPhone ? "Sort beside it, drawn 40px, a 44px press" : "Sort beside it at 32px", { press: tools.sort, drawn: tools.sortDrawn })

    /* The views: one segmented control. */
    const seg = await p.evaluate(() => {
      const list = document.querySelector("[data-controls] [role=tablist][data-views]")
      const track = list.firstElementChild.getBoundingClientRect()
      const thumb = list.querySelector("[data-segment]").getBoundingClientRect()
      const tabs = [...list.querySelectorAll("[role=tab]")].map((x) => {
        const r = x.getBoundingClientRect()
        return { t: x.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), cut: x.scrollWidth > x.clientWidth, size: getComputedStyle(x).fontSize }
      })
      const lr = list.getBoundingClientRect()
      return { h: Math.round(lr.height), w: Math.round(lr.width), left: Math.round(lr.left), track: Math.round(track.height), thumb: [Math.round(thumb.left), Math.round(thumb.width), Math.round(thumb.height)], tabs }
    })
    row.views = seg.track
    expect(seg.tabs.map((t) => t.t).join() === "All,Active,Draft,Archived", "the views in Polaris's order, All first", seg.tabs.map((t) => t.t))
    expect(seg.track === 36 && seg.thumb[2] === 32, "a 36px grey track with a 32px white segment", { track: seg.track, segment: seg.thumb[2] })
    expect(seg.tabs.every((t) => t.h === (isPhone ? 44 : 36) && t.w >= 44 && !t.cut && t.size === "13px"), `each view a ${isPhone ? "44px press" : "36px button"}, none cut off`, seg.tabs.map((t) => [t.w, t.h, t.cut]))
    expect(Math.abs(seg.thumb[0] - seg.tabs[0].left) <= 2, "the segment sits on All", { segment: seg.thumb[0], all: seg.tabs[0].left })
    if (isPhone) expect(seg.w === vp.width - 32, "full width between the gutters on a phone", seg.w)

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
      const section = await p.$eval("section[aria-label=Products]", (s) => { const c = getComputedStyle(s); return [c.borderTopWidth, c.backgroundColor, c.boxShadow] })
      expect(section[0] === "0px" && section[1] === "rgba(0, 0, 0, 0)" && section[2] === "none", "no card round the list on a phone: the rows sit on the page", section)
      const rows = await p.$$eval("section[aria-label=Products] ul > li", (r) => r.map((li) => {
        const box = li.getBoundingClientRect()
        const pic = li.querySelector("[data-thumb]")
        const pr = pic.getBoundingClientRect()
        const link = li.querySelector("a").getBoundingClientRect()
        const menu = li.querySelector("button").getBoundingClientRect()
        const name = li.querySelector("[data-name]")
        const meta = li.querySelector("[data-meta]")
        const metaRight = Math.max(...[...meta.children].map((c) => c.getBoundingClientRect().right))
        const status = meta.querySelector("[data-status]")
        return {
          h: Math.round(box.height), left: Math.round(box.left), w: Math.round(box.width), pic: [Math.round(pr.width), Math.round(pr.height)], picLeft: Math.round(pr.left), radius: getComputedStyle(pic).borderTopLeftRadius,
          link: [Math.round(link.width), Math.round(link.height)], menu: [Math.round(menu.width), Math.round(menu.height)],
          nameSize: getComputedStyle(name).fontSize, nameWeight: getComputedStyle(name).fontWeight, nameH: Math.round(name.getBoundingClientRect().height), metaSize: getComputedStyle(meta).fontSize, metaColor: getComputedStyle(meta).color,
          priceNums: getComputedStyle(meta.querySelector("[data-price]")).fontVariantNumeric, price: meta.querySelector("[data-price]").textContent,
          status: status ? status.textContent.trim() : "", statusBg: status ? getComputedStyle(status).backgroundColor : null, metaText: meta.textContent,
          clear: Math.round(menu.left - metaRight), nameClear: Math.round(menu.left - name.getBoundingClientRect().right), meta1line: Math.round(meta.getBoundingClientRect().height),
          letter: pic.querySelector("img") ? null : pic.textContent.trim(),
        }
      }))
      row.row = rows[0].h
      row.thumb = rows[0].pic.join("x")
      row.text = `${rows[0].nameSize} name, ${rows[0].metaSize} meta`
      expect(rows.length === 13, "one row per product in All (not archived)", rows.length)
      expect(rows.every((r) => r.h === 72), "every row is 72px, a long name included", [...new Set(rows.map((r) => r.h))])
      expect(rows.every((r) => r.left === 0 && r.w === vp.width), "each row runs edge to edge, so a press tints the whole width", [rows[0].left, rows[0].w])
      expect(rows.every((r) => r.pic.join() === "56,56" && r.radius === "12px" && r.picLeft === 16), "a 56px picture, 12px round, 16px in", [...new Set(rows.map((r) => `${r.pic.join("x")} r${r.radius} at ${r.picLeft}`))])
      expect(rows.filter((r) => r.letter !== null).every((r) => /^P$/.test(r.letter)), "a product with no picture shows its first letter, not a box icon", rows.filter((r) => r.letter !== null).map((r) => r.letter))
      expect(rows.every((r) => r.nameSize === "15px" && r.nameWeight === "500" && r.nameH === 20 && r.metaSize === "13px" && r.metaColor === "rgb(107, 114, 128)"), "the name at 15px medium on one line, price and sales under it at 13px grey", rows[2])
      expect(rows.every((r) => r.meta1line === 18), "on one 18px line", [...new Set(rows.map((r) => r.meta1line))])
      expect(rows.every((r) => /tabular-nums/.test(r.priceNums)), "prices in figures of one width", rows[0].priceNums)
      expect(rows.some((r) => r.price === "Free"), "a free product says Free, not $0.00", rows.map((r) => r.price).slice(0, 6))
      const drafts = rows.filter((r) => r.status)
      expect(drafts.length === 2 && drafts.every((r) => r.status === "Draft" && r.statusBg === "rgba(0, 0, 0, 0)"), "only the two drafts say so, as a dot and a word with no badge; a live row says nothing", rows.map((r) => r.status || "-"))
      expect(rows.every((r) => r.link[0] === r.w && r.link[1] >= r.h - 1), "the whole row is the link", rows[0].link)
      expect(rows.every((r) => r.menu[0] >= 44 && r.menu[1] >= 44), "the actions button is a 44px target", rows[0].menu)
      expect(rows.every((r) => r.clear >= 0 && r.nameClear >= 0), "the name and the line under it never run under the actions button", rows.map((r) => Math.min(r.clear, r.nameClear)))
      const rules = await p.$$eval("section[aria-label=Products] ul > li", (r) => r.map((li) => {
        const b = getComputedStyle(li, "::before")
        return b.content === "none" ? null : [Math.round(parseFloat(b.left)), b.backgroundColor]
      }))
      expect(rules[0] === null && rules.slice(1).every((x) => x && x[0] === 84 && x[1] === "rgb(236, 238, 241)"), "a light hairline between rows, starting where the text does", rules.slice(0, 3))
      const hit = await p.$eval("section[aria-label=Products] ul > li:nth-child(2)", (li) => {
        const r = li.getBoundingClientRect()
        return document.elementFromPoint(r.left + r.width * 0.45, r.top + r.height / 2)?.tagName
      })
      expect(hit === "A", "a press in the middle of a row lands on its link", hit)
      await p.$eval("section[aria-label=Products] ul > li:nth-child(1) a", (a) => a.dispatchEvent(new TouchEvent("touchstart", { bubbles: true })))
      const pre = await p.evaluate(() => window.__prefetched || [])
      expect(pre.length === 1 && pre[0][0] === "/app/products/p0" && pre[0][1] === "full", "the finger going down prefetches that product's editor in full", pre)

      /* Every press on the screen, with the invisible 44px box a small drawing carries. */
      const small = await p.evaluate(() => {
        const out = []
        for (const el of document.querySelectorAll(".orders-pane a[href], .orders-pane button, .orders-pane label[data-search]")) {
          const r = el.getBoundingClientRect()
          if (r.width === 0 || r.height === 0 || el.closest("table") || el.closest("label[data-search]") && el.tagName !== "LABEL") continue
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
          return {
            h: Math.round(tr.getBoundingClientRect().height), pic: [Math.round(pr.width), Math.round(pr.height)], radius: getComputedStyle(pic).borderTopLeftRadius,
            nameSize: getComputedStyle(name).fontSize, nameWeight: getComputedStyle(name).fontWeight, cut: name.scrollWidth > name.clientWidth,
            inside: Math.round(cells[0].getBoundingClientRect().right - name.getBoundingClientRect().right), ellipsis: getComputedStyle(name).textOverflow,
            nums: cells.filter((c) => /^\$|^\d|^Free$/.test(c.textContent.trim())).map((c) => [getComputedStyle(c).textAlign, getComputedStyle(c).fontVariantNumeric]),
            divider: getComputedStyle(cells[0]).borderTopWidth + " " + getComputedStyle(cells[0]).borderTopColor,
            status: status.textContent.trim(), statusBg: getComputedStyle(status).backgroundColor, dot: getComputedStyle(status.firstElementChild).backgroundColor,
          }
        })
        const headH = Math.round(head.getBoundingClientRect().height)
        const nameCol = Math.round(head.children[0].getBoundingClientRect().width)
        const c = getComputedStyle(section)
        return { cols, rows, headH, nameCol, card: [c.borderTopLeftRadius, c.backgroundColor] }
      })
      row.row = t.rows[0].h
      row.thumb = t.rows[0].pic.join("x")
      row.text = `${t.rows[0].nameSize} name`
      const wantCols = label.startsWith("tablet") ? "Product,Status,Price," : "Product,Status,Sales,Price,"
      expect(t.card[0] === "16px" && t.card[1] === "rgb(255, 255, 255)", "one white card round the table", t.card)
      expect(t.cols.map((c) => c.t).join() === wantCols, `the columns: ${wantCols.replace(/,$/, "")}${label.startsWith("tablet") ? " (Sales from 1024px)" : ""}`, t.cols.map((c) => c.t))
      expect(t.cols.every((c) => c.bg === "rgba(0, 0, 0, 0)"), "no grey band behind the headings", t.cols.map((c) => c.bg))
      expect(t.cols.filter((c) => /Sales|Price/.test(c.t)).every((c) => c.align === "right"), "numbers' headings right aligned", t.cols)
      expect(t.headH === 40, "a 40px heading row", t.headH)
      expect(t.rows.length === 13 && t.rows.every((r) => r.h === 64), "one 64px row per product in All", { count: t.rows.length, heights: [...new Set(t.rows.map((r) => r.h))] })
      expect(t.rows.every((r) => r.pic.join() === "44,44" && r.radius === "10px"), "a 44px picture, 10px round", [...new Set(t.rows.map((r) => `${r.pic.join("x")} r${r.radius}`))])
      expect(t.rows.every((r) => r.nameSize === "14px" && r.nameWeight === "500"), "the name at 14px medium", t.rows[0])
      expect(t.rows.every((r) => r.statusBg === "rgba(0, 0, 0, 0)") && t.rows[0].status === "Active" && t.rows[0].dot === "rgb(34, 160, 107)" && t.rows[3].status === "Draft" && t.rows[3].dot === "rgb(224, 161, 0)",
        "the status is a dot and a word, green for Active and amber for Draft, with no badge", t.rows.slice(0, 4).map((r) => [r.status, r.dot]))
      expect(t.rows.every((r) => r.nums.length >= 1 && r.nums.every(([a, n]) => a === "right" && /tabular-nums/.test(n))), "numbers right aligned in figures of one width", t.rows[0].nums)
      expect(/^0px/.test(t.rows[0].divider) && /^1px rgb\(241, 242, 244\)$/.test(t.rows[1].divider), "no line over the first row, a light hairline between the rest", [t.rows[0].divider, t.rows[1].divider])
      expect(t.rows.every((r) => r.inside >= 12 && r.ellipsis === "ellipsis") && t.nameCol > 150, `a long name stays in its column${t.rows[2].cut ? " and stops with an ellipsis" : ", whole at this width"}`, { inside: t.rows[2].inside, cut: t.rows[2].cut, nameCol: t.nameCol })

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
      await p.hover("section[aria-label=Products] tbody tr:nth-child(4)")
      await p.hover("section[aria-label=Products] tbody tr:nth-child(2) td:nth-child(2)")
      await wait(150)
      const pre = await p.evaluate(() => window.__prefetched || [])
      expect(pre.length === 1 && pre[0][0] === "/app/products/p1" && pre[0][1] === "full", "a pointer resting on a row prefetches that product's editor in full, one passing over does not", pre)
      await p.click("section[aria-label=Products] tbody tr:nth-child(2) td:nth-child(2)")
      const pushed = await p.evaluate(() => window.__pushed || [])
      expect(pushed.length === 1 && pushed[0] === "/app/products/p1", "a click anywhere on a row opens the product", pushed)
      await p.mouse.move(5, 5)
    }
    const footer = await p.evaluate(() => { const f = document.querySelector("[data-footer]"); return f ? getComputedStyle(f).display : "missing" })
    expect(isPhone ? footer === "none" : footer === "flex", isPhone ? "no footer counting rows on a phone when there is one page" : "the footer counts what is shown", footer)
    await p.screenshot({ path: join(shots, `${label}-products-v2.png`) })

    /* Views: Draft holds the two drafts, and the segment slides under it. */
    await p.evaluate(() => [...document.querySelectorAll("[role=tab]")].find((t) => t.textContent.trim() === "Draft").click())
    await wait(320)
    const drafts = await p.evaluate(() => {
      const tab = [...document.querySelectorAll("[role=tab]")].find((t) => t.textContent.trim() === "Draft").getBoundingClientRect()
      const segment = document.querySelector("[data-segment]")
      const s = segment.getBoundingClientRect()
      return { rows: window.__rows().length, statuses: [...window.__rows()].map((r) => r.querySelector("[data-meta] [data-status]")?.textContent ?? null), tab: [Math.round(tab.left), Math.round(tab.width)], segment: [Math.round(s.left), Math.round(s.width)], transition: getComputedStyle(segment).transitionProperty }
    })
    expect(drafts.rows === 2, "the Draft view holds the two drafts", drafts.rows)
    expect(Math.abs(drafts.segment[0] - drafts.tab[0]) <= 2 && Math.abs(drafts.segment[1] - drafts.tab[1]) <= 3 && /^transform\b/.test(drafts.transition), "and the white segment has slid under Draft, on transform alone", drafts)
    if (isPhone) expect(drafts.statuses.every((s) => s === null), "in the Draft view the rows do not say Draft again", drafts.statuses)
    await p.evaluate(() => [...document.querySelectorAll("[role=tab]")].find((t) => t.textContent.trim() === "All").click())
    await wait(80)

    /* Sort: price high to low puts the dearest first. */
    await p.click("[data-controls] button[aria-label='Sort']")
    await wait(isPhone ? 600 : 250)
    const sorted = await p.evaluate(() => {
      const option = [...document.querySelectorAll("[role=menuitem], [data-action-sheet] button")].find((b) => b.textContent.trim() === "Price high to low")
      if (!option) return null
      option.click()
      return true
    })
    await wait(isPhone ? 500 : 150)
    const prices = await p.evaluate(() => [...window.__rows()].slice(0, 3).map((r) => (r.textContent.match(/\$\d+\.\d{2}/) || [""])[0]))
    expect(sorted && prices.join() === "$54.00,$50.50,$47.00", "Sort, Price high to low, puts the dearest first", prices)
    const sortOn = await p.$eval("[data-controls] button[aria-label='Sort']", (b) => getComputedStyle(b.firstElementChild).backgroundColor)
    expect(sortOn === "rgb(236, 238, 241)", "and the sort button shows an order other than Newest is on", sortOn)

    /* Search: typing narrows; nothing found says so and offers to clear it. */
    await p.click("[data-controls] input[type=search]")
    await p.type("[data-controls] input[type=search]", "portrait")
    await wait(80)
    const found = await p.evaluate(() => [...window.__rows()].map((r) => r.textContent))
    expect(found.length === 1 && /portrait/.test(found[0]), "typing narrows the list", found.length)
    const clearBtn = await p.$eval("[data-controls] button[aria-label='Clear search']", (b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)] })
    expect(isPhone ? clearBtn[0] >= 40 && clearBtn[1] >= 40 : clearBtn[0] >= 24, "and a clear button appears in the field", clearBtn)
    await p.screenshot({ path: join(shots, `${label}-products-v2-search.png`) })
    await p.type("[data-controls] input[type=search]", "zzz")
    await wait(80)
    const empty = await p.evaluate(() => document.querySelector("section[aria-label=Products]").textContent)
    expect(/No products match/.test(empty) && /Clear search/.test(empty), "a search with nothing found says so and offers to clear it", /No products match/.test(empty))
    await p.evaluate(() => [...document.querySelectorAll("section[aria-label=Products] button")].find((b) => b.textContent.trim() === "Clear search").click())
    await wait(80)
    const back = await p.evaluate(() => ({ rows: window.__rows().length, value: document.querySelector("[data-controls] input[type=search]").value }))
    expect(back.rows === 13 && back.value === "", "Clear search brings every product back", back)
    await p.type("[data-controls] input[type=search]", "Product 1")
    await p.keyboard.press("Escape")
    await wait(80)
    const esc = await p.evaluate(() => document.querySelector("[data-controls] input[type=search]").value)
    expect(esc === "", "Escape in the field clears it", esc)

    /* A row's actions: a dropdown on a computer, a sheet on a phone, all five there. */
    const btn = await p.$(isPhone ? "section[aria-label=Products] ul > li:first-child button[aria-label^='Actions for']" : "section[aria-label=Products] tbody tr:first-child button[aria-label^='Actions for']")
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
    if (!isPhone) expect(menu.pushed === 1, "and opening them does not open the product", menu.pushed)
    await p.screenshot({ path: join(shots, `${label}-products-v2-actions.png`) })
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
    expect(first.rows === 50 && /^1–50 of 59/.test(first.footer) && first.h === 44, "sixty products (59 not archived): fifty on the first page, and a 44px footer says so", first)
    const next = await q.evaluate(() => {
      const press = document.querySelector("button[aria-label='Next page']")
      press.scrollIntoView({ block: "center" })
      const b = press.firstElementChild.getBoundingClientRect()
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top - 5)?.closest("button[aria-label='Next page']") != null
      return { drawn: [Math.round(b.width), Math.round(b.height)], press: [Math.round(press.getBoundingClientRect().width), Math.round(press.getBoundingClientRect().height)], hit }
    })
    expect(next.drawn.join() === "32,28", "the page arrows are drawn at Orders' 32 by 28", next.drawn)
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
    expect(/No products yet/.test(e.text) && e.create && e.createBg === "rgb(26, 26, 46)" && !e.footer, "No products yet, with a dark Create product, and no footer counting nothing", e)
    expect(e.createBox && e.createBox[1] >= 44, "Create product is a 44px press", e.createBox)
    expect(!e.controls && !e.export, "no search, sort, views or Export in an empty shop", { controls: e.controls, export: e.export })
    expect(!e.barNew, "and no second New product in the bar: one dark button on the screen, not two", e.barNew)
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
    const view = async (name) => { await p.evaluate((name) => [...document.querySelectorAll("[role=tab]")].find((t) => t.textContent.trim() === name).click(), name); await wait(80) }
    const names = () => p.$$eval("section[aria-label=Products] table tbody tr", (r) => r.map((tr) => tr.querySelector("td a").textContent.trim()))
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
console.log(`\nscreenshots in ${shots}`)
if (broken) { console.error(`\n${broken} check(s) failed\n`); process.exit(1) }
console.log("\nall checks passed\n")
