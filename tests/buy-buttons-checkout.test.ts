/**
 * Buy buttons open the product's checkout, never its page: the theme's
 * product sections, the OnePage product button, and a buyer who already owns
 * the product lands in their library rather than on storelib.com.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DEFAULT_THEME_SOURCES } from "../themes/default/sources.generated"
import { renderStorelibSection } from "../lib/website-builder/storelib-runtime"
import type { SectionInstance, ThemeSettingsValues } from "../lib/website-builder/types"
import { productHref } from "../lib/onepage/product-block"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 300)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nThe theme's product buttons\n")
for (const type of ["hero_product", "product_spotlight"]) {
  const src = DEFAULT_THEME_SOURCES[`sections/${type}.storelib`]
  check(`${type}: the button reads the product's checkout first`, /settings\.button_url\.checkout_url \| default: settings\.button_url/.test(src))
  const catalog = [{ id: "p1", type: "product", settings: { url: "/products/tote", title: "Tote", checkout_url: "/checkout?productId=p1&src=website" } }]
  const r = renderStorelibSection(
    { id: "s", type, name: type, settings: { button_url: "/products/tote", button_text: "Buy it" }, blocks: [] } as unknown as SectionInstance,
    {} as ThemeSettingsValues,
    { template: "index" },
    undefined,
    [],
    { catalog } as never,
  )
  const html = r.ok === true ? r.html : ""
  check(`${type}: a picked product's button opens its checkout`, /href="\/checkout\?productId=p1&amp;src=website"|href="\/checkout\?productId=p1&src=website"/.test(html), html.match(/href="[^"]*"/g))
}

console.log("\nEverywhere else\n")
{
  const page = read("app/checkout/page.tsx")
  check("a buyer who owns it opens it in their library", /const OWNED = `\/account\/library\/products\/\$\{encodeURIComponent\(product\.id\)\}`/.test(page) && (page.match(/redirect\(OWNED\)/g) ?? []).length === 1 && /if \(rowsOwn\(existingEntitlements/.test(page))
  /*
    Round 10: the OnePage's product block is its own component (components/onepage/product-block) and where it points
    is lib/onepage/product-block productHref. A block with no "When someone taps it" setting (every block made before)
    still opens the checkout; since round 49 a product that ships does too (sent on to its website's checkout). The
    block links there with href={href}.
  */
  const block = read("components/onepage/product-block.tsx")
  check("the OnePage product button opens checkout", productHref({ product_id: "p1", product_slug: "pack", product_type: "digital" }) === "/checkout?productId=p1&src=onepage" && productHref({ product_id: "p1", product_slug: "pack", product_type: null }) === "/checkout?productId=p1&src=onepage" && productHref({ product_id: "p1", product_slug: "mug", product_type: "physical" }) === "/checkout?productId=p1&src=onepage" && (block.match(/href=\{href\}/g) ?? []).length >= 2 && /<ProductBlockWithQuickCheckout/.test(read("components/onepage/public-onepage.tsx")))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
