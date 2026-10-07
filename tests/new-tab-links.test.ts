/**
 * A link that opens in a new tab, and a link straight to one product's
 * checkout (lib/website-builder/new-tab.ts), as the picker writes them, the
 * editor follows them and the published site turns them into real links.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { checkoutProductOf, opensNewTab, productCheckoutHref, withNewTab, withoutNewTab } from "../lib/website-builder/new-tab"
import { storeLinkTargets } from "../lib/website-builder/link-targets"
import { linkCategoryOf } from "../lib/website-builder/link-menu"
import { resolveEditorHref } from "../lib/website-builder/editor-navigation"
import { normalizeLinkAddress } from "../lib/website-builder/link-address"

let passed = 0
let failed = 0
function check(label: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nThe mark")
check("on and off again leaves the address as it was", withNewTab(withNewTab("https://example.com", true), false) === "https://example.com")
check("on twice is one mark", withNewTab(withNewTab("/about", true), true) === "/about#_blank" && opensNewTab("/about#_blank"))
check("an empty link stays empty", withNewTab("", true) === "")
check("a place on a page keeps its own hash", withoutNewTab("/#section-abc#_blank") === "/#section-abc")

console.log("\nTyping www")
check("www.example.com is saved as https://www.example.com", normalizeLinkAddress("www.example.com").ok && (normalizeLinkAddress("www.example.com") as { href: string }).href === "https://www.example.com")
check("www alone is not an address yet, and says how to finish it", normalizeLinkAddress("www").ok === false)

console.log("\nCheckout for a product")
const targets = storeLinkTargets({ products: [{ id: "p1", slug: "guide", title: "The guide" }] })
const checkout = targets.find((t) => t.kind === "checkout")
check("a product with an id is offered as its checkout", checkout?.href === productCheckoutHref("p1") && checkout?.label === "The guide")
check("it sorts under Checkout for a product", !!checkout && linkCategoryOf(checkout) === "checkout")
check("the link reads back its product, marked or not", checkoutProductOf(productCheckoutHref("p1")) === "p1" && checkoutProductOf(`${productCheckoutHref("p1")}#_blank`) === "p1")
const ctx = { currentPage: "home", inspectorEnabled: false, fromNav: false, shopPath: "/products", customPageKeys: [] }
check("in the editor it opens that product's checkout", resolveEditorHref(productCheckoutHref("p1"), ctx).kind === "checkout")
check("and a marked page link still opens the page", resolveEditorHref("/about#_blank", ctx).kind === "page")

console.log("\nThe published site")
const layout = read("app/(site)/layout.tsx")
const links = read("components/website-builder/new-tab-links.tsx")
check("every website mounts it", /<NewTabLinks \/>/.test(layout))
check("a marked link loses the mark and opens in a new tab, safely", /setAttribute\("target", "_blank"\)/.test(links) && /setAttribute\("rel", "noopener noreferrer"\)/.test(links))
check("a section out of the document's reach is caught on the click", /composedPath\(\)/.test(links))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
