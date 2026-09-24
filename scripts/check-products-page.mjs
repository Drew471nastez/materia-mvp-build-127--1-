/**
 * ===========================================================================
 *  THE PRODUCTS PAGE, MEASURED
 * ===========================================================================
 * Brought into the Orders page's language: the pane's bar, one card with the
 * views and search in its toolbar, and one dense table for every width whose
 * Product column stays put while a phone scrolls it sideways.
 *
 *   pnpm build && node scripts/check-products-page.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")
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
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })
export const useSearchParams = () => new URLSearchParams()
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })
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
  for (const [label, vp] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
    console.log(`\n${label}`)
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setViewport(vp)
    await p.goto(`file://${join(stubs, "index.html")}`)
    await new Promise((r) => setTimeout(r, 300))
    if (errors.length) fail(`The page threw: ${errors[0]}`)
    await p.waitForSelector("[role=tablist]")
    const tabs = await p.$$eval("[role=tablist][aria-label=Views] [role=tab]", (t) => t.map((x) => x.textContent.trim()))
    expect(tabs.length === 3 && /^Active\s*11$/.test(tabs[0]), "the views are tabs with their counts, in the card", tabs)
    const toolbar = await p.$eval("[role=tablist]", (t) => Math.round(t.closest("div.flex.h-12").getBoundingClientRect().height))
    expect(toolbar === 48, "in one 48px toolbar", toolbar)
    const rows = await p.$$eval("section[aria-label=Products] tbody tr", (r) => r.map((x) => Math.round(x.getBoundingClientRect().height)))
    expect(rows.length === 11 && rows.every((h) => h === 56), "one 56px row per active product, the same table at every width", { count: rows.length, heights: [...new Set(rows)] })
    const long = await p.$eval("section[aria-label=Products] tbody tr:nth-child(3) td a span:last-child", (s) => ({ cut: s.scrollWidth > s.clientWidth, ell: getComputedStyle(s).textOverflow }))
    expect(long.cut && long.ell === "ellipsis", "a long name is cut, not wrapped", long)
    const sideways = await p.evaluate(() => { const el = document.querySelector(".orders-pane"); return el.scrollWidth - el.clientWidth })
    expect(sideways === 0, "the page never scrolls sideways", sideways)
    if (label === "phone") {
      const before = await p.$eval("section[aria-label=Products] tbody td", (td) => Math.round(td.getBoundingClientRect().left))
      await p.$eval("section[aria-label=Products] .overflow-x-auto", (el) => { el.scrollLeft = 300 })
      const after = await p.$eval("section[aria-label=Products] tbody td", (td) => Math.round(td.getBoundingClientRect().left))
      expect(before === after, "the Product column stays put while the table scrolls", { before, after })
      const col = await p.$eval("section[aria-label=Products] tbody td", (td) => Math.round(td.getBoundingClientRect().width))
      expect(col <= 220, "and is narrow enough to leave the scrolling columns in view", col)
      await p.$eval("section[aria-label=Products] .overflow-x-auto", (el) => { el.scrollLeft = 0 })
    }
    await p.screenshot({ path: join(shots, `${label}-products.png`) })
    /* Pressed where a thumb would: its own spot on the screen, after it has
       been scrolled into view, so nothing lying over it can take the press. */
    const btn = await p.$("section[aria-label=Products] tbody tr:first-child button[aria-label^='Actions for']")
    await btn.evaluate((b) => b.scrollIntoView({ block: "center", inline: "end" }))
    const hit = await btn.evaluate((b) => { const r = b.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest("button") === b })
    expect(hit, "the actions button is not covered by the pinned column", hit)
    await btn.click()
    await new Promise((r) => setTimeout(r, 450))
    const menu = await p.evaluate(() => ({
      dropdown: /Duplicate/.test(document.querySelector("[role=menu]")?.textContent ?? ""),
      sheet: [...document.querySelectorAll("[role=dialog]")].some((d) => /Duplicate/.test(d.textContent)),
    }))
    expect(label === "phone" ? menu.sheet : menu.dropdown, `a row's actions are a ${label === "phone" ? "sheet" : "dropdown"}`, menu)
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
