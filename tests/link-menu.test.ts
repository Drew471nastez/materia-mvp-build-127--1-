/**
 * ===========================================================================
 *  THE LINK PICKER'S KINDS OF PLACE, AND THE PANEL IT OPENS IN
 * ===========================================================================
 * "Like Shopify's": a first list of kinds (Home, Shop, Products, Pages,
 * Customer accounts, Policies, Search), the single ones picked straight
 * away, the others opening onto their own list with Back and a count, and
 * typing finding across all of them. lib/website-builder/link-menu.ts is run
 * here; the component and its panel are read for the rules that are only
 * visible in source. scripts/check-link-field.mjs measures it in Chromium.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { LINK_CATEGORIES, linkCategoryOf, linkMenu, picksDirectly, resultCount, searchLinkTargets } from "../lib/website-builder/link-menu"
import { ACCOUNT_PAGE_PATHS } from "../lib/website-builder/account-pages"
import { POLICY_PAGE_KEYS } from "../lib/website-builder/policy-pages"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? `: ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? `: ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

type T = { href: string; label: string; kind: "page" | "product"; image?: string }
const page = (href: string, label: string): T => ({ href, label, kind: "page" })
const product = (slug: string, label: string): T => ({ href: `/products/${slug}`, label, kind: "product" })

/* The editor's own list, in the order it builds it (app/website-builder/editor/[installId]/page.tsx). */
const TARGETS: T[] = [
  page("/", "Home"),
  page("/products", "Shop"),
  page("/about", "About"),
  page("/contact", "Contact"),
  page("/search", "Search"),
  page("/account", "Account"),
  page("/account/login", "Sign in"),
  page("/wishlist", "Wishlist"),
  page("/lookbook", "Lookbook"),
  page("/terms-of-service", "Terms Of Service"),
  page("/privacy-policy", "Privacy Policy"),
  page("/refund-policy", "Refund Policy"),
  product("tote", "Canvas tote"),
  product("pen", "Brass pen"),
]

function main() {
  console.log("\nThe first list")
  const menu = linkMenu(TARGETS)
  check("is the kinds, in Shopify's order, with nothing empty", menu.map((e) => e.category.label).join(",") === "Home,Shop,Products,Pages,Customer accounts,Policies,Search", menu.map((e) => e.category.label).join(","))
  check("Home, Shop and Search are one place each, picked straight away", menu.filter(picksDirectly).map((e) => e.targets[0].href).join(",") === "/,/products,/search")
  check("and the rest open onto their own list", menu.filter((e) => !picksDirectly(e)).map((e) => e.category.key).join(",") === "products,pages,accounts,policies")
  check("a kind with nothing in it is not there", linkMenu([page("/", "Home"), product("x", "X")]).map((e) => e.category.key).join(",") === "home,products")
  check("nothing is lost or listed twice", menu.reduce((n, e) => n + e.targets.length, 0) === TARGETS.length)
  check("no collections and no blogs: this product has neither", !LINK_CATEGORIES.some((c) => /collection|blog/i.test(c.label)))

  console.log("\nWhere each place goes")
  check("a product is a product, whatever its address", linkCategoryOf(product("search", "Search")) === "products")
  check("the visitor's pages are exactly account-pages.ts's, contact aside",
    Object.entries(ACCOUNT_PAGE_PATHS).filter(([k]) => k !== "contact").every(([, p]) => linkCategoryOf(page(p, "")) === "accounts") && linkCategoryOf(page("/contact", "Contact")) === "pages")
  check("the policies are exactly policy-pages.ts's, in its order",
    menu.find((e) => e.category.key === "policies")?.targets.map((t) => t.href.slice(1)).join(",") === POLICY_PAGE_KEYS.join(","))
  check("an address nobody knows is one of the creator's pages", linkCategoryOf(page("/size-guide", "Size guide")) === "pages")
  check("the creator's pages keep the order they were given", menu.find((e) => e.category.key === "pages")?.targets.map((t) => t.label).join(",") === "About,Contact,Lookbook")

  console.log("\nTyping")
  check("finds across every kind, in the kinds' order", searchLinkTargets(TARGETS, "o").length > 5 && searchLinkTargets(TARGETS, "o")[0].href === "/")
  check("by name or address, any case, every word", searchLinkTargets(TARGETS, "SIGN").map((t) => t.href).join(",") === "/account/login" && searchLinkTargets(TARGETS, "canvas tote")[0]?.label === "Canvas tote")
  check("and by the name of its kind, so every policy comes up", searchLinkTargets(TARGETS, "polic").length === 3)
  check("an address matches nothing, so the list steps aside for it", searchLinkTargets(TARGETS, "shop.example.com/sale").length === 0)
  check("nothing typed finds nothing (the first list shows instead)", searchLinkTargets(TARGETS, "   ").length === 0)
  check("the count reads as words", resultCount(1) === "1 result" && resultCount(12) === "12 results")

  console.log("\nThe component")
  const picker = read("components/website-builder/link-picker.tsx")
  const popover = read("components/website-builder/field-popover.tsx")
  const css = read("app/globals.css")
  check("Back sits above the rows and does not scroll away", /\{back && \(/.test(picker) && picker.indexOf("{back && (") < picker.indexOf("data-float-scroll"))
  check("with the count on its right", /\{resultCount\(back\.count\)\}/.test(picker))
  check("Escape inside a kind goes back before it closes", /onEscape=\{onEscape\}/.test(picker) && /if \(onEscape\?\.\(\)\) return/.test(popover))
  check("a product row draws its picture", /image=\{t\.kind === "product" \? t\.image : undefined\}/.test(picker))
  check("the list's scrollbar is the drawn thumb, taking no width", /cp-overlay-scroll min-h-0 overflow-y-auto/.test(picker) && /<OverlayRail scrollerRef=\{listRef\} \/>/.test(picker))
  check("the panel opens under the field or over it, and keeps its side while it fits",
    /s = below >= want \? "below" : above >= want \? "above" : below >= above \? "below" : "above"/.test(popover) && /if \(!s \|\| \(s === "below" \? below : above\) < want\)/.test(popover))
  check("it is placed again on every scroll, in the scroll event", /window\.addEventListener\("scroll", onScroll, \{ capture: true, passive: true \}\)/.test(popover))
  check("and closes once the field has scrolled out of its sidebar", /if \(a\.bottom <= top \|\| a\.top >= bottom\) \{\s*onOpenChange(Ref\.current)?\(false\)/.test(popover))
  check("it comes and goes by opacity and transform, and not at all under reduced motion",
    /opacity: 0, transform: `translate3d\(0, \$\{dy\}px, 0\) scale\(0\.985\)`/.test(popover) && /prefers-reduced-motion: reduce/.test(popover) && /\.wb-link-level\[data-dir\] \{ animation: none; \}/.test(css))
  check("the editor gives it the account pages and the products' pictures",
    /href: "\/account\/login", label: "Sign in", kind: "page"/.test(read("app/website-builder/editor/[installId]/page.tsx")) && /image: p\.thumbnail_url \|\| undefined/.test(read("app/website-builder/editor/[installId]/page.tsx")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
