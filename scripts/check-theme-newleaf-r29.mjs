/**
 * Octavo's (New Leaf until round 30) product hero lines up and never spills (round 29; round 30: light hero, no strip, still lined up).
 * The desktop row runs right to left with a 56px gap; when the theme's column
 * widths did not leave room for it the information column overflowed to the
 * left and the title was cut at the page's edge (-10px at 1024).
 * Serve public/ first, e.g. `cd public && python3 -m http.server 8731`, then:
 *   node scripts/check-theme-newleaf-r29.mjs [http://localhost:8731]
 * Exits 1 when a title, breadcrumb or price disagree, or anything leaves the page.
 */
import { createRequire } from "node:module"

const { chromium } = createRequire(import.meta.url)("playwright")

const base = process.argv[2] || "http://localhost:8731"
const products = ["recall-cards", "lecture-notes", "thesis-planner", "home-admin"]
const widths = [1440, 1200, 1024, 990, 820, 390]
const browser = await chromium.launch()
let failed = 0
for (const slug of products) {
  for (const w of widths) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 } })
    await page.goto(`${base}/theme-previews/notion-template-shop/products/${slug}.html`, { waitUntil: "load" })
    await page.waitForTimeout(800)
    const r = await page.evaluate(() => {
      const box = (s) => document.querySelector(s)?.getBoundingClientRect()
      return { crumb: Math.round(box(".nlb__crumbs")?.left ?? -1), h1: Math.round(box("h1")?.left ?? -1), price: Math.round(box(".product-detail__price")?.left ?? -1), mediaRight: Math.round(box(".product-detail__media")?.right ?? 0), scrollWidth: document.documentElement.scrollWidth }
    })
    const bad = r.h1 !== r.crumb || r.price !== r.h1 || r.h1 < 0 || r.scrollWidth > w || r.mediaRight > w
    if (bad) failed++
    console.log(`${bad ? "FAIL" : "ok  "} ${slug} ${w} ${JSON.stringify(r)}`)
    await page.close()
  }
}
await browser.close()
console.log(failed ? `${failed} failed` : "all lined up")
process.exit(failed ? 1 : 0)
