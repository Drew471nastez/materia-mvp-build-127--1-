/**
 * Round V: the website builder's product fixes. A product picked for a
 * section is the product drawn, in an imported theme as in Storelib's own;
 * a product page shows the product asked for, and the last one asked for.
 *
 *   npx tsx tests/round-v.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { productKey, typedValue, type Resources } from "@/lib/storelib-theme/compat/objects"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const card = (id: string, slug: string, title: string) => ({ id, settings: { slug, title, url: `/products/${slug}`, price: 1999, image: "", variants: [] } })
const yoga = card("p-yoga", "yogaclass-bachata-members", "YogaClass Bachata: Members")
const honey = card("p-honey", "wildflower-honey", "Wildflower honey")
const res = (over: Partial<Resources> = {}): Resources => ({ products: [honey], catalog: [honey, yoga], collections: [], menus: {}, schemes: {}, imageUrl: (v) => v, currentPath: "/", ...over })
const titleOf = (o: unknown) => (o && typeof o === "object" ? String((o as Record<string, unknown>).title ?? "") : null)

console.log("\nWhat a product setting names")
check("an address is its handle", productKey("/products/wildflower-honey") === "wildflower-honey")
check("a Shopify default is its handle", productKey("shopify://products/wildflower-honey") === "wildflower-honey")
check("a full address with a query and a slash", productKey("https://shop.example.com/products/wildflower-honey/?variant=1") === "wildflower-honey")
check("a market prefix", productKey("/en-gb/products/wildflower-honey") === "wildflower-honey")
check("an id stays an id", productKey("p-honey") === "p-honey")

console.log("\nA featured product in an imported theme")
check("picked by its address (what Storelib's picker stores)", titleOf(typedValue("product", "/products/wildflower-honey", res())) === "Wildflower honey")
check("a membership product, left out of the shop's list, still resolves", titleOf(typedValue("product", "/products/yogaclass-bachata-members", res())) === "YogaClass Bachata: Members")
check("picked by id", titleOf(typedValue("product", "p-yoga", res())) === "YogaClass Bachata: Members")
check("@current is the page's product", titleOf(typedValue("product", "@current", res({ current: yoga }))) === "YogaClass Bachata: Members")
check("@current off a product page is nothing (the theme's placeholder)", typedValue("product", "@current", res()) === null)
check("a product list by addresses", (typedValue("product_list", ["/products/wildflower-honey", "/products/yogaclass-bachata-members"], res()) as unknown[]).length === 2)
check("an unknown product is nothing", typedValue("product", "/products/nope", res()) === null)

console.log("\nWired")
const theme = read("lib/storelib-theme/compat/theme.ts")
check("the page's product is the resources' current", /current: page\.product \?\? null/.test(theme))
const canvas = read("components/website-builder/compat/compat-canvas.tsx")
check("the imported theme's canvas draws the picked product", /const picked = productId \?/.test(canvas) && /\[pageKey, dataKey, productId\]/.test(canvas))
check("another product loads behind, never patched over the last", /pageKey === "product" \? productId/.test(canvas))
const editor = read("app/website-builder/editor/[installId]/page.tsx")
check("the editor hands the canvas the product picked", /productId=\{currentPage === "product" \? selectedProductId : null\}/.test(editor))
check("product switches: the latest one wins", (editor.match(/if \(nav !== pageNav\.current\) return/g) ?? []).length === 2)
check("a product link in the canvas opens that product", /selectProductRef\.current\(linked\.id, linked\.title\)/.test(editor))
const section = read("components/website-builder/sections/renderers/ProductSection.tsx")
check("the gallery starts again for another product", /key=\{product\.id\}/.test(section))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
