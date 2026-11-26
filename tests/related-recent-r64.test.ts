/**
 * "YOU MAY ALSO LIKE" AND "RECENTLY VIEWED" ON A MATERIA WEBSITE (round 64).
 *
 * The Storelib Default template, composed and imported as a creator's
 * website is (scripts/theme-templates/site.ts), answered by the compat
 * engine's answer() for a shop of three products, A, B and C:
 *
 *   - B's page draws "You may also like" with A and C as the theme's own
 *     cards, never B; /recommendations/products answers the same products in
 *     the same order, up to the section's limit (12 at most).
 *   - A shop with one product: the section draws nothing (no heading over
 *     grey cards, nothing fetched). In the builder it stays selectable.
 *   - "Recently viewed" is drawn waiting, with B as the page's product, and
 *     /search?q=id:… with its section answers A's card; an id that is not
 *     this shop's is not answered.
 *
 * The browser half (visit A then B, read both rows, on every template) is
 * scripts/check-related-recent-r64.ts.
 */
import { readFileSync } from "node:fs"
import { importTemplate, siteFor, type SampleProduct } from "../scripts/theme-templates/site"
import { answer, type SiteData } from "../lib/storelib-theme/compat/site"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 500)}`}`)
}

const THREE: SampleProduct[] = [
  { title: "Alpha guide", price: "$10.00", image: "default-mug.webp" },
  { title: "Bravo plan", price: "$12.00", image: "default-cap.webp" },
  { title: "Charlie pack", price: "$14.00", image: "default-planner.webp", kind: "digital" },
]

/** One section's markup out of a page: from its wrapper to the next one. */
function sectionOf(html: string, id: string): string {
  const at = html.indexOf(`id="shopify-section-${id}"`)
  if (at < 0) return ""
  const next = html.indexOf('id="shopify-section-', at + 10)
  return html.slice(at, next < 0 ? undefined : next)
}
const productLinks = (html: string) => [...new Set([...html.matchAll(/href="\/products\/([a-z0-9-]+)"/g)].map((m) => m[1]))]

async function main() {
  const imported = await importTemplate("materia/default")
  const { site } = siteFor(imported, { name: "Shop", products: THREE })
  const [A, B, C] = site.products
  const get = async (s: SiteData, path: string, q = "") => {
    const o = await answer(s, { method: "GET", path, query: new URLSearchParams(q), body: null, cart: [] })
    return { status: o.status, body: String(o.body), headers: o.headers ?? {} }
  }

  console.log("\nYou may also like, on B's page\n")
  const pageB = await get(site, "/products/bravo-plan")
  const related = sectionOf(pageB.body, "related")
  check("the page draws", pageB.status === 200 && related.length > 0, pageB.status)
  check("A and C as cards, B never", JSON.stringify(productLinks(related)) === JSON.stringify(["alpha-guide", "charlie-pack"]), productLinks(related))
  check("  drawn with the page: no grey cards, nothing left to fetch", !related.includes(`class="related-skeleton__card"`) && !/<product-recommendations\s+data-section-id/.test(related), related.slice(0, 300))
  check("  the heading is there", /You may also like/.test(related))

  const rec = await get(site, "/recommendations/products", `product_id=${B.id}&section_id=related&limit=4&intent=related`)
  check("/recommendations/products: the same products, in the same order", rec.status === 200 && JSON.stringify(productLinks(sectionOf(rec.body, "related"))) === JSON.stringify(["alpha-guide", "charlie-pack"]), productLinks(rec.body))
  const one = await get(site, "/recommendations/products", `product_id=${B.id}&section_id=related&limit=1`)
  check("  up to the limit asked", productLinks(sectionOf(one.body, "related")).length === 1, productLinks(one.body))
  const asJson = JSON.parse((await get(site, "/recommendations/products.json", `product_id=${B.id}&limit=4`)).body) as { products: { handle: string }[] }
  check("  as data too", asJson.products.map((p) => p.handle).join() === "alpha-guide,charlie-pack", asJson)

  const many = Array.from({ length: 14 }, (_, i): SampleProduct => ({ title: `Item ${i + 1}`, price: "$5.00" }))
  const big = siteFor(imported, { name: "Shop", products: many }).site
  const bigRec = await get(big, "/recommendations/products.json", `product_id=${big.products[0].id}&limit=12`)
  const bigList = (JSON.parse(bigRec.body) as { products: { handle: string }[] }).products
  check("Products to show at its most (12) is honoured, never the page's own product", bigList.length === 12 && !bigList.some((p) => p.handle === "item-1"), bigList.length)

  console.log("\nA shop with one product\n")
  const lonely = siteFor(imported, { name: "Shop", products: THREE.slice(0, 1) }).site
  const pageOne = await get(lonely, "/products/alpha-guide")
  const lone = sectionOf(pageOne.body, "related")
  check("the section collapses: hidden, no grey cards, nothing fetched", /#shopify-section-related \{ display: none; \}/.test(lone) && !/<product-recommendations\s+data-section-id/.test(lone) && !lone.includes(`class="related-skeleton__card"`), lone.slice(lone.indexOf("data-rp-grid") - 300, lone.indexOf("data-rp-grid") + 300))
  check("  and links to no product", productLinks(lone).length === 0, productLinks(lone))
  const canvas = await get({ ...lonely, designMode: true } as SiteData, "/products/alpha-guide")
  check("  in the builder it stays on the page to be picked", !/#shopify-section-related \{ display: none; \}/.test(sectionOf(canvas.body, "related")), sectionOf(canvas.body, "related").slice(0, 200))

  console.log("\nRecently viewed\n")
  const rv = sectionOf(pageB.body, "recently_viewed")
  check("drawn waiting for the visitor's list, about B", /data-rv-state="wait"/.test(rv) && rv.includes(`data-rv-current="${B.id}"`), rv.slice(0, 400))
  check("  with no product card of its own (the list is the visitor's)", productLinks(rv).length === 0, productLinks(rv))
  const q = encodeURIComponent(`id:${A.id} OR id:00000000-0000-4000-8000-00000000dead`)
  const asked = await get(site, "/search", `q=${q}&type=product&options%5Bunavailable_products%5D=last&section_id=recently-viewed`)
  const cards = [...asked.body.matchAll(/data-rv-card data-rv-id="([^"]+)"/g)].map((m) => m[1])
  check("/search with the visitor's ids answers A's card, as the theme draws it", asked.status === 200 && JSON.stringify(cards) === JSON.stringify([A.id]) && productLinks(asked.body).includes("alpha-guide"), { status: asked.status, cards })
  check("  an id that is not this shop's is not answered", !cards.includes("00000000-0000-4000-8000-00000000dead"))
  check("  per visitor: never kept for everybody", !/public/i.test(String((asked.headers as Record<string, string>)["Cache-Control"] ?? "")), asked.headers)
  void C

  console.log("\nThe visitor's list in the browser (base assets/r7-products-runtime.js)\n")
  const js = readFileSync("theme-packages/materia/base/assets/r7-products-runtime.js", "utf8")
  check("every id is asked for, the row cut to its limit after the answer", /readIds\(\)\.filter\(id => id !== current\), key/.test(js) && /found\.has\(id\) && list\.length < limit/.test(js))
  check("back to a product page from the back/forward cache makes it the newest again", /pageshow[^\n]*record\(root\.dataset\.rvCurrent\)/.test(js))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
