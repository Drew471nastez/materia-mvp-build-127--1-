/**
 * ===========================================================================
 *  THE PRODUCTS PAGE, MEASURED
 * ===========================================================================
 * In the Orders page's language: the pane's bar, then one card. From 768px
 * the card's toolbar holds the views, search and export and the card holds
 * the dense table. Under it, a phone gets a 44px search field with Export,
 * the views as three equal 44px segments, and a list drawn for it: a 64px
 * square picture, the name at 16px on up to two lines, price and status
 * under it, the whole row one press, 16px from both edges, and nothing that
 * scrolls sideways. No Products and Coupons tabs: Coupons is its own page.
 *
 *   node scripts/check-products-page.mjs          (a build's CSS if there is one, else the source's)
 *   PROBE_CSS=source node scripts/check-products-page.mjs
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

try {
  writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/app/products"
export const useRouter = () => ({ push() {}, replace() {}, prefetch(href, o) { (window.__prefetched ||= []).push([href, o && o.kind]) }, back() {}, refresh() {} })
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
  for (const [label, vp] of [
    ["desktop", { width: 1440, height: 900 }],
    ["wide", { width: 1920, height: 1080 }],
    ["phone-390", phone(390)],
    ["phone-360", phone(360)],
    ["phone-430", phone(430)],
  ]) {
    const isPhone = label.startsWith("phone")
    console.log(`\n${label}`)
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setViewport(vp)
    await p.goto(`file://${join(stubs, "index.html")}`)
    await p.evaluate(() => document.fonts.ready)
    await new Promise((r) => setTimeout(r, 450))
    if (errors.length) fail(`The page threw: ${errors[0]}`)
    await p.waitForSelector("[role=tablist]")

    /* The bar: 14px above the title and its button, not 8. */
    const bar = await p.evaluate(() => {
      const pane = document.querySelector(".orders-pane").getBoundingClientRect()
      const b = document.querySelector("[data-orders-bar] a[href='/app/products/new']").getBoundingClientRect()
      const h = document.querySelector("[data-orders-bar] h1")
      return { buttonTop: Math.round(b.top - pane.top), buttonH: Math.round(b.height), buttonW: Math.round(b.width), titleTop: Math.round(h.getBoundingClientRect().top - pane.top), titleSize: getComputedStyle(h).fontSize, titleLeft: Math.round(h.getBoundingClientRect().left), buttonRight: Math.round(window.innerWidth - b.right), barH: Math.round(document.querySelector("[data-orders-bar]").getBoundingClientRect().height) }
    })
    expect(bar.barH === 66, "the bar is 66px, 14px of room under the app's top bar", bar)
    expect(isPhone ? bar.buttonH === 44 : bar.buttonH === 32, `New product is ${isPhone ? "44" : "32"}px tall`, bar.buttonH)
    expect(bar.titleSize === (isPhone ? "24px" : "28px"), `the title is ${isPhone ? 24 : 28}px`, bar.titleSize)
    if (isPhone) expect(bar.titleLeft === 16 && bar.buttonRight === 16, "the title and New product sit 16px in from the edges", bar)

    const subnav = await p.$$eval("nav[aria-label='Products area']", (n) => n.length)
    expect(subnav === 0, "no Products and Coupons tabs: Coupons has its own page", subnav)

    /* The views: the tablist that is drawn at this width (the phone's and the computer's are separate). */
    const tabs = await p.$$eval("[role=tablist][aria-label=Views]", (lists) => {
      const list = lists.find((l) => l.getBoundingClientRect().width > 0)
      return [...list.querySelectorAll("[role=tab]")].map((x) => {
        const r = x.getBoundingClientRect()
        const inner = x.querySelector("span") || x
        return { t: x.textContent.trim(), h: Math.round(r.height), w: Math.round(r.width), cut: inner.scrollWidth > inner.clientWidth + 1 || r.right > list.getBoundingClientRect().right + 1 }
      })
    })
    expect(tabs.length === 3 && /^Active\s*11$/.test(tabs[0].t), "the views are tabs with their counts", tabs.map((t) => t.t))
    expect(tabs.every((t) => t.h === (isPhone ? 44 : 32)), `each view is ${isPhone ? "a 44px press" : "32px tall"}`, tabs.map((t) => t.h))
    expect(tabs.every((t) => !t.cut), "and no view's name is cut off", tabs)
    if (isPhone) expect(new Set(tabs.map((t) => t.w)).size === 1, "three equal segments", tabs.map((t) => t.w))

    if (isPhone) {
      const tools = await p.evaluate(() => {
        const input = [...document.querySelectorAll("input[type=search]")].find((i) => i.getBoundingClientRect().width > 0)
        const field = input.closest("label").getBoundingClientRect()
        const exp = [...document.querySelectorAll("button[aria-label='Export products']")].find((b) => b.getBoundingClientRect().width > 0).getBoundingClientRect()
        const card = document.querySelector("section[aria-label=Products]").getBoundingClientRect()
        return { field: [Math.round(field.left), Math.round(field.height)], font: getComputedStyle(input).fontSize, exp: [Math.round(exp.width), Math.round(exp.height), Math.round(window.innerWidth - exp.right)], card: [Math.round(card.left), Math.round(window.innerWidth - card.right)] }
      })
      expect(tools.field[1] === 44 && tools.font === "16px", "search is a 44px field with 16px text, open without a tap first", tools)
      expect(tools.exp[0] === 44 && tools.exp[1] === 44, "Export is a 44px press beside it", tools.exp)
      expect(tools.field[0] === 16 && tools.exp[2] === 16 && tools.card[0] === 16 && tools.card[1] === 16, "16px from both edges of the screen, the list too", tools)
    } else {
      const tools = await p.$$eval("button[aria-label='Search products'], button[aria-label='Export products']", (b) => b.filter((x) => x.getBoundingClientRect().width > 0).map((x) => Math.round(x.getBoundingClientRect().height)))
      expect(tools.length === 2 && tools.every((h) => h === 32), "search and export are 32px, in the card's toolbar", tools)
    }

    const sideways = await p.evaluate(() => { const el = document.querySelector(".orders-pane"); return el.scrollWidth - el.clientWidth })
    expect(sideways === 0, "the page never scrolls sideways", sideways)
    const inner = await p.evaluate(() => [...document.querySelectorAll("section[aria-label=Products] *")].filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible" && !el.matches("[role=tablist]") && getComputedStyle(el).textOverflow !== "ellipsis" && getComputedStyle(el).webkitLineClamp === "none").length)
    expect(inner === 0, "and nothing inside the card does either", inner)

    if (isPhone) {
      const table = await p.$eval("section[aria-label=Products] table", (t) => getComputedStyle(t).display)
      expect(table === "none", "the table is not drawn on a phone", table)
      const rows = await p.$$eval("section[aria-label=Products] ul > li", (r) => r.map((li) => {
        const box = li.getBoundingClientRect()
        const pic = li.querySelector("[data-thumb]").getBoundingClientRect()
        const link = li.querySelector("a").getBoundingClientRect()
        const menu = li.querySelector("button").getBoundingClientRect()
        const name = li.querySelector("[data-name]")
        const meta = li.querySelector("[data-meta]")
        const price = meta.firstElementChild
        const metaRight = Math.max(...[...meta.children].map((c) => c.getBoundingClientRect().right))
        return {
          h: Math.round(box.height), pic: [Math.round(pic.width), Math.round(pic.height)], link: [Math.round(link.width), Math.round(link.height)], rowW: Math.round(box.width),
          menu: [Math.round(menu.width), Math.round(menu.height)], lines: Math.round(name.getBoundingClientRect().height / 22),
          nameSize: getComputedStyle(name).fontSize, nameWeight: getComputedStyle(name).fontWeight, priceSize: getComputedStyle(price).fontSize, metaSize: getComputedStyle(meta).fontSize,
          clear: Math.round(menu.left - metaRight), right: Math.round(box.right - menu.right),
        }
      }))
      expect(rows.length === 11, "one row per active product", rows.length)
      expect(rows.every((r) => (r.lines === 1 ? r.h === 88 : r.h >= 88)), "every row is 88px, a two line name the only thing that makes one taller", rows.map((r) => r.h))
      expect(rows.every((r) => r.pic[0] === 64 && r.pic[1] === 64), "with a 64px square picture, the same on every row", [...new Set(rows.map((r) => r.pic.join("x")))])
      expect(rows.every((r) => r.nameSize === "16px" && r.priceSize === "15px" && r.metaSize === "14px"), "the name at 16px, the price at 15px, the rest at 14px", rows[0])
      expect(rows.every((r) => r.link[0] === r.rowW && r.link[1] >= r.h - 1), "the whole row is the link", rows[0].link)
      expect(rows.every((r) => r.menu[0] >= 44 && r.menu[1] >= 44), "the actions button is a 44px target", rows[0].menu)
      expect(rows.every((r) => r.clear >= 0), "the price, status and sales never run under the actions button", rows.map((r) => r.clear))
      expect(rows[2].lines === 2, "a long name wraps to two lines and stops", rows[2].lines)
      const second = await p.$eval("section[aria-label=Products] ul > li:nth-child(1)", (li) => li.querySelector("[data-meta]").textContent)
      expect(/^\$12\.00$/.test(second), "the price under the name, and no Active on every row of the Active view", second)
      const rules = await p.$$eval("section[aria-label=Products] ul > li", (r) => r.map((li) => {
        const b = getComputedStyle(li, "::before")
        return b.content === "none" ? null : Math.round(parseFloat(b.left))
      }))
      expect(rules[0] === null && rules.slice(1).every((x) => x === 94), "a hairline between rows, starting where the text does", rules.slice(0, 3))
      const hit = await p.$eval("section[aria-label=Products] ul > li:nth-child(2)", (li) => {
        const r = li.getBoundingClientRect()
        return document.elementFromPoint(r.left + r.width * 0.45, r.top + r.height / 2)?.tagName
      })
      expect(hit === "A", "a press in the middle of a row lands on its link", hit)
      await p.$eval("section[aria-label=Products] ul > li:nth-child(1) a", (a) => a.dispatchEvent(new TouchEvent("touchstart", { bubbles: true })))
      const pre = await p.evaluate(() => window.__prefetched || [])
      expect(pre.length === 1 && pre[0][0] === "/app/products/p0" && pre[0][1] === "full", "the finger going down prefetches that product's editor in full", pre)
    } else {
      const rows = await p.$$eval("section[aria-label=Products] tbody tr", (r) => r.map((x) => Math.round(x.getBoundingClientRect().height)))
      expect(rows.length === 11 && rows.every((h) => h === 56), "the table: one 56px row per active product", { count: rows.length, heights: [...new Set(rows)] })
      const list = await p.$eval("section[aria-label=Products] ul", (u) => getComputedStyle(u).display)
      expect(list === "none", "and the phone list is not drawn", list)
      const phoneTools = await p.$$eval("[role=tablist][aria-label=Views]", (l) => l.filter((x) => x.getBoundingClientRect().width > 0).length)
      expect(phoneTools === 1, "and neither are the phone's search and views", phoneTools)
      await p.hover("section[aria-label=Products] tbody tr:nth-child(4)")
      await p.hover("section[aria-label=Products] tbody tr:nth-child(2)")
      await new Promise((r) => setTimeout(r, 150))
      const pre = await p.evaluate(() => window.__prefetched || [])
      expect(pre.length === 1 && pre[0][0] === "/app/products/p1" && pre[0][1] === "full", "a pointer resting on a row prefetches that product's editor in full, one passing over does not", pre)
    }
    await p.screenshot({ path: join(shots, `${label}-products.png`) })
    if (isPhone) {
      /* Typing finds a product at once, and All, where live and draft are mixed, marks each. */
      const input = await p.evaluateHandle(() => [...document.querySelectorAll("input[type=search]")].find((i) => i.getBoundingClientRect().width > 0))
      await input.type("portrait")
      await new Promise((r) => setTimeout(r, 100))
      const found = await p.$$eval("section[aria-label=Products] ul > li", (r) => r.map((li) => li.querySelector("[data-name]").textContent))
      expect(found.length === 1 && /portrait/.test(found[0]), "typing in the field narrows the list", found)
      await p.screenshot({ path: join(shots, `${label}-products-search.png`) })
      await p.$eval("button[aria-label='Clear search']", (b) => b.click())
      await p.evaluate(() => [...document.querySelectorAll("[role=tab]")].find((t) => t.getBoundingClientRect().width > 0 && /^All/.test(t.textContent.trim())).click())
      await new Promise((r) => setTimeout(r, 100))
      const all = await p.$$eval("section[aria-label=Products] ul > li", (r) => r.map((li) => {
        const meta = li.querySelector("[data-meta]")
        const menu = li.querySelector("button").getBoundingClientRect()
        return { status: (meta.textContent.match(/Active|Draft/) || [""])[0], clear: Math.round(menu.left - Math.max(...[...meta.children].map((c) => c.getBoundingClientRect().right))) }
      }))
      expect(all.length === 13 && all.every((r) => r.status) && all.filter((r) => r.status === "Draft").length === 2, "All marks every row Active or Draft", all.map((r) => r.status))
      expect(all.every((r) => r.clear >= 0), "and the marks never run under the actions button", all.map((r) => r.clear))
      await p.screenshot({ path: join(shots, `${label}-products-all.png`) })
      await p.evaluate(() => [...document.querySelectorAll("[role=tab]")].find((t) => t.getBoundingClientRect().width > 0 && /^Active/.test(t.textContent.trim())).click())
      await new Promise((r) => setTimeout(r, 100))
    }

    const btn = await p.$(isPhone ? "section[aria-label=Products] ul > li:first-child button[aria-label^='Actions for']" : "section[aria-label=Products] tbody tr:first-child button[aria-label^='Actions for']")
    await btn.click()
    await new Promise((r) => setTimeout(r, 450))
    const menu = await p.evaluate(() => ({
      dropdown: /Duplicate/.test(document.querySelector("[role=menu]")?.textContent ?? ""),
      sheet: [...document.querySelectorAll("[role=dialog]")].some((d) => /Duplicate/.test(d.textContent)),
    }))
    expect(isPhone ? menu.sheet : menu.dropdown, `a row's actions are a ${isPhone ? "sheet" : "dropdown"}`, menu)
    await p.screenshot({ path: join(shots, `${label}-product-actions.png`) })
    await p.close()
  }
  await browser.close()
} finally {
  if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nscreenshots in ${shots}`)
if (broken) { console.error(`\n${broken} check(s) failed\n`); process.exit(1) }
console.log("\nall checks passed\n")
