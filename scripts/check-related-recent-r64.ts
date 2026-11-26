/**
 * ===========================================================================
 *  "YOU MAY ALSO LIKE" AND "RECENTLY VIEWED", IN CHROMIUM (round 64)
 * ===========================================================================
 * Each Materia template drawn the way a creator's website draws it
 * (scripts/theme-templates/site.ts: composed, imported, answered by the
 * compat engine's answer() on a local port) for a shop of three products,
 * A, B and C. Chromium opens A, then B, and reads on B:
 *   - "You may also like": the product cards' addresses (A and C, never B),
 *     and whether a heading shows with no cards under it
 *   - "Recently viewed": the cards' addresses (A only), and whether it is
 *     hidden on the first product page of a visit
 * A shop with one product: neither section shows a heading.
 *
 * Compiled like a test suite (tsc, then node with scripts/push-test-register.mjs),
 * with Playwright from PLAYWRIGHT_MODULE or the global install:
 *   node <runner> scripts/check-related-recent-r64.ts
 * TEMPLATES=default,fitness limits the templates; OUT=<dir> writes screenshots
 * of B at 1280 and 390 (deviceScaleFactor 2) for the first template.
 */
import { createRequire } from "node:module"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { importTemplate, serve, siteFor, type SampleProduct } from "./theme-templates/site"
import { SAMPLE_SHOPS } from "./theme-templates/shops"
import { templateDirs } from "../lib/themes/template-packages"
import { readdirSync, existsSync } from "node:fs"

const OUT = process.env.OUT ?? ""
const ALL = readdirSync("theme-packages/materia/templates").filter((d) => existsSync(join("theme-packages/materia/templates", d, "templates", "product.json")))
const TEMPLATES = (process.env.TEMPLATES ?? ALL.join(",")).split(",").filter(Boolean)
void templateDirs

type Seen = { related: string[]; relatedHeading: boolean; recent: string[]; recentHeading: boolean; errors: string[] }

async function main() {
  const require = createRequire(import.meta.url)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pw = require(process.env.PLAYWRIGHT_MODULE ?? "playwright") as any
  const browser = await pw.chromium.launch()
  const rows: Record<string, unknown>[] = []
  let bad = 0
  for (const id of TEMPLATES) {
    const imported = await importTemplate(`materia/${id}`)
    const sample = (SAMPLE_SHOPS[id] ?? SAMPLE_SHOPS.default).products
    const three: SampleProduct[] = sample.slice(0, 3).map((p, i) => ({ ...p, title: ["Alpha guide", "Bravo plan", "Charlie pack"][i] }))
    const built = siteFor(imported, { name: "Shop", products: three })
    const { base, server } = await serve(built, join("scripts/theme-templates/products", id))
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 })
    const page = await ctx.newPage()
    const errors: string[] = []
    page.on("pageerror", (e: Error) => errors.push(e.message.slice(0, 200)))
    const read = async (): Promise<Seen> => {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await page.waitForTimeout(1200)
      const r = await page.evaluate(() => {
        const vis = (el: Element | null) => !!el && (el as HTMLElement).offsetParent !== null && el.getBoundingClientRect().height > 0
        const cardsIn = (root: Element | null) => (root ? [...new Set([...root.querySelectorAll("a[href*='/products/']")].filter(vis).map((a) => new URL((a as HTMLAnchorElement).href).pathname.split("/").pop() ?? ""))] : [])
        const rel = document.querySelector("[data-section-type='related-products']") ?? document.querySelector(".sec__related-product")
        const rv = document.querySelector("[data-section-type='recently-viewed']")
        const headingOf = (root: Element | null) => !!root && [...root.querySelectorAll("h2")].some((h) => vis(h) && (h.textContent ?? "").trim() !== "")
        return { related: cardsIn(rel), relatedHeading: headingOf(rel), recent: cardsIn(rv), recentHeading: headingOf(rv) }
      })
      return { ...r, errors: [...errors] }
    }
    await page.goto(`${base}/products/alpha-guide`, { waitUntil: "load" }); await new Promise((r) => setTimeout(r, 800))
    const onA = await read()
    await page.goto(`${base}/products/bravo-plan`, { waitUntil: "load" }); await new Promise((r) => setTimeout(r, 800))
    const onB = await read()
    if (OUT && id === TEMPLATES[0]) {
      mkdirSync(OUT, { recursive: true })
      for (const w of [1280, 390]) {
        const c2 = await browser.newContext({ viewport: { width: w, height: w < 700 ? 844 : 900 }, deviceScaleFactor: 2 })
        const p2 = await c2.newPage()
        await p2.goto(`${base}/products/alpha-guide`, { waitUntil: "load" }); await new Promise((r) => setTimeout(r, 800))
        await p2.goto(`${base}/products/bravo-plan`, { waitUntil: "load" }); await new Promise((r) => setTimeout(r, 800))
        await p2.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
        await p2.waitForTimeout(1200)
        const rel = await p2.$("[data-section-type='related-products']")
        if (rel) await rel.scrollIntoViewIfNeeded()
        await p2.waitForTimeout(600)
        await p2.screenshot({ path: join(OUT, `${process.env.SHOT ?? "after"}-${id}-${w}.png`), fullPage: true })
        await c2.close()
      }
    }
    await ctx.close()
    server.close()
    /* One product: nothing to recommend and nothing else viewed. */
    const one = siteFor(imported, { name: "Shop", products: three.slice(0, 1) })
    const s1 = await serve(one, join("scripts/theme-templates/products", id))
    const c1 = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const p1 = await c1.newPage()
    await p1.goto(`${s1.base}/products/alpha-guide`, { waitUntil: "load" }); await new Promise((r) => setTimeout(r, 800))
    await p1.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await p1.waitForTimeout(1000)
    const lonely = await p1.evaluate(() => {
      const vis = (el: Element | null) => !!el && (el as HTMLElement).offsetParent !== null && el.getBoundingClientRect().height > 0
      const rel = document.querySelector("[data-section-type='related-products']")
      const rv = document.querySelector("[data-section-type='recently-viewed']")
      return { relatedVisible: !!rel && rel.getBoundingClientRect().height > 0 && [...rel.querySelectorAll("h2")].some(vis), recentVisible: !!rv && rv.getBoundingClientRect().height > 0 }
    })
    await c1.close()
    s1.server.close()

    const hasRel = onB.related.length > 0 || onB.relatedHeading
    const relOk = !hasRel || (onB.related.includes("alpha-guide") && onB.related.includes("charlie-pack") && !onB.related.includes("bravo-plan"))
    const hasRv = onB.recentHeading || onB.recent.length > 0
    const rvOk = !hasRv || (onB.recent.length === 1 && onB.recent[0] === "alpha-guide")
    const firstOk = !onA.recentHeading && onA.recent.length === 0
    const row = { id, onA: { recent: onA.recent, recentHeading: onA.recentHeading }, onB, lonely, relOk, rvOk, firstOk }
    const ok = relOk && rvOk && firstOk && !lonely.relatedVisible && !lonely.recentVisible && !onB.errors.length
    if (!ok) bad++
    console.log(`${ok ? "ok  " : "FAIL"} ${id.padEnd(14)} related=${JSON.stringify(onB.related)} rv=${JSON.stringify(onB.recent)} rvOnA=${JSON.stringify(onA.recent)}/${onA.recentHeading} lonely=${JSON.stringify(lonely)} errors=${onB.errors.length}`)
    rows.push(row)
  }
  await browser.close()
  if (OUT) writeFileSync(join(OUT, `${process.env.SHOT ?? "after"}-related-recent.json`), JSON.stringify(rows, null, 1))
  console.log(`\n${TEMPLATES.length - bad}/${TEMPLATES.length} templates ok`)
  process.exit(bad ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
