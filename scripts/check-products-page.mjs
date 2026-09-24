/**
 * ===========================================================================
 *  THE PRODUCTS PAGE, MEASURED
 * ===========================================================================
 * In the Orders page's language: the pane's bar, the area's tabs, one card
 * with the views and search in its toolbar. From 768px the card holds the
 * dense table; under it, a list drawn for a phone: a 56px picture, the name
 * on up to two lines, price and status under it, the whole row one press,
 * and nothing that scrolls sideways.
 *
 *   node scripts/check-products-page.mjs          (a build's CSS if there is one, else the source's)
 *   PROBE_CSS=source node scripts/check-products-page.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const css = await appCss(root)
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
  writeFileSync(join(stubs, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)

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
    await new Promise((r) => setTimeout(r, 450))
    if (errors.length) fail(`The page threw: ${errors[0]}`)
    await p.waitForSelector("[role=tablist]")

    /* The bar: 14px above the title and its button, not 8. */
    const bar = await p.evaluate(() => {
      const pane = document.querySelector(".orders-pane").getBoundingClientRect()
      const b = document.querySelector("[data-orders-bar] a[href='/app/products/new']").getBoundingClientRect()
      const h = document.querySelector("[data-orders-bar] h1").getBoundingClientRect()
      return { buttonTop: Math.round(b.top - pane.top), buttonH: Math.round(b.height), buttonW: Math.round(b.width), titleTop: Math.round(h.top - pane.top), barH: Math.round(document.querySelector("[data-orders-bar]").getBoundingClientRect().height) }
    })
    expect(bar.barH === 66, "the bar is 66px, 6px more room above its contents", bar)
    expect(isPhone ? bar.buttonH === 44 : bar.buttonH === 32, `New product is ${isPhone ? "44" : "32"}px tall`, bar.buttonH)

    const subnav = await p.$$eval("nav[aria-label='Products area'] a", (a) => a.map((x) => ({ t: x.textContent.trim(), cur: x.getAttribute("aria-current"), h: Math.round(x.getBoundingClientRect().height) })))
    expect(subnav.length === 2 && subnav[0].cur === "page" && subnav[1].t === "Coupons", "the area's tabs: Products (here) and Coupons", subnav)

    const tabs = await p.$$eval("[role=tablist][aria-label=Views] [role=tab]", (t) => t.map((x) => ({ t: x.textContent.trim(), h: Math.round(x.getBoundingClientRect().height) })))
    expect(tabs.length === 3 && /^Active\s*11$/.test(tabs[0].t), "the views are tabs with their counts, in the card", tabs.map((t) => t.t))
    expect(tabs.every((t) => t.h === (isPhone ? 36 : 32)), `each view is ${isPhone ? 36 : 32}px tall`, tabs.map((t) => t.h))
    const tools = await p.$$eval("button[aria-label='Search products'], button[aria-label='Export products']", (b) => b.map((x) => Math.round(x.getBoundingClientRect().height)))
    expect(tools.every((h) => h === (isPhone ? 40 : 32)), `search and export are ${isPhone ? 40 : 32}px`, tools)

    const sideways = await p.evaluate(() => { const el = document.querySelector(".orders-pane"); return el.scrollWidth - el.clientWidth })
    expect(sideways === 0, "the page never scrolls sideways", sideways)
    const inner = await p.evaluate(() => [...document.querySelectorAll("section[aria-label=Products] *")].filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible" && !el.matches("[role=tablist]") && getComputedStyle(el).textOverflow !== "ellipsis" && getComputedStyle(el).webkitLineClamp === "none").length)
    expect(inner === 0, "and nothing inside the card does either", inner)

    if (isPhone) {
      const table = await p.$eval("section[aria-label=Products] table", (t) => getComputedStyle(t).display)
      expect(table === "none", "the table is not drawn on a phone", table)
      const rows = await p.$$eval("section[aria-label=Products] ul > li", (r) => r.map((li) => {
        const box = li.getBoundingClientRect()
        const pic = li.querySelector("span.relative").getBoundingClientRect()
        const link = li.querySelector("a").getBoundingClientRect()
        const menu = li.querySelector("button").getBoundingClientRect()
        const name = li.querySelector(".line-clamp-2")
        return { h: Math.round(box.height), pic: [Math.round(pic.width), Math.round(pic.height)], link: [Math.round(link.width), Math.round(link.height)], rowW: Math.round(box.width), menu: [Math.round(menu.width), Math.round(menu.height)], lines: Math.round(name.getBoundingClientRect().height / 20), right: Math.round(box.right - menu.right) }
      }))
      expect(rows.length === 11, "one row per active product", rows.length)
      expect(rows.every((r) => r.h >= 80), "every row is at least 80px", [...new Set(rows.map((r) => r.h))])
      expect(rows.every((r) => r.pic[0] === 56 && r.pic[1] === 56), "with a 56px picture", rows[0].pic)
      expect(rows.every((r) => r.link[0] === r.rowW && r.link[1] >= r.h - 1), "the whole row is the link", rows[0].link)
      expect(rows.every((r) => r.menu[0] >= 44 && r.menu[1] >= 44), "the actions button is a 44px target", rows[0].menu)
      expect(rows[2].lines === 2, "a long name wraps to two lines and stops", rows[2].lines)
      const second = await p.$eval("section[aria-label=Products] ul > li:nth-child(1)", (li) => li.querySelector(".mt-1\\.5").textContent)
      expect(/\$12\.00/.test(second) && /Active/.test(second), "price and status under the name", second)
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
      await p.hover("section[aria-label=Products] tbody tr:nth-child(2)")
      const pre = await p.evaluate(() => window.__prefetched || [])
      expect(pre.some(([h, k]) => h === "/app/products/p1" && k === "full"), "a hover prefetches that product's editor in full", pre)
    }
    await p.screenshot({ path: join(shots, `${label}-products.png`) })

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
