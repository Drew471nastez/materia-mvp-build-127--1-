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
import { compatFilter } from "@/lib/storelib-theme/compat/filters"
import { shopifyBootstrap } from "@/lib/storelib-theme/compat/shims"
import { SITE_PREFETCH_RULES } from "@/lib/website-builder/prefetch-rules"
import { blocksIntoDetails, contentForStatics, isProductSection, staysInDetails } from "@/lib/website-builder/product-details-rule"

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
check("@current off a product page is the shop's first product, never a placeholder", titleOf(typedValue("product", "@current", res())) === "Wildflower honey")
check("a product list by addresses", (typedValue("product_list", ["/products/wildflower-honey", "/products/yogaclass-bachata-members"], res()) as unknown[]).length === 2)
check("a product the shop doesn't have is the shop's first (the original store's handle)", titleOf(typedValue("product", "/products/nope", res())) === "Wildflower honey")

console.log("\nWired")
const theme = read("lib/storelib-theme/compat/theme.ts")
check("the page's product is the resources' current", /current: page\.product \?\? null/.test(theme))
const canvas = read("components/website-builder/compat/compat-canvas.tsx")
check("the imported theme's canvas draws the picked product", /const picked = productId \?/.test(canvas) && /* Changed on purpose (round AE): the language previewed. */ /\[pageKey, dataKey, productId(, stockKey)?(, i18n)?\]/.test(canvas))
check("another product loads behind, never patched over the last", /pageKey === "product" \? productId/.test(canvas))
const editor = read("app/website-builder/editor/[installId]/page.tsx")
check("the editor hands the canvas the product picked", /productId=\{currentPage === "product" \? selectedProductId : null\}/.test(editor))
check("product switches: the latest one wins", (editor.match(/if \(nav !== pageNav\.current\) return/g) ?? []).length === 2)
check("a product link in the canvas opens that product", /selectProductRef\.current\(linked\.id, linked\.title\)/.test(editor))
const section = read("components/website-builder/sections/renderers/ProductSection.tsx")
check("the gallery starts again for another product", /key=\{product\.id\}/.test(section))

console.log("\nA product's blocks stay in its Details column")
const takesAll = (_d: string, t: string) => t !== "_private"
const horizon = [
  { id: "media-gallery", type: "_product-media-gallery", static: true },
  { id: "product-details", type: "_product-details", static: true, blocks: [{ id: "price", type: "price" }, { id: "buy", type: "buy-buttons" }] },
  { id: "text-1", type: "text" },
  { id: "pic", type: "image-gallery" },
  { id: "priv", type: "_private" },
]
const homed = blocksIntoDetails("product-information", horizon, takesAll)
const det = homed?.find((b) => b.id === "product-details")
check("a text added at the end goes into Details, after what's there", det?.blocks?.map((b) => b.id).join() === "price,buy,text-1", det)
check("a picture stays where it is", !!homed?.some((b) => b.id === "pic"))
check("a block Details can't hold stays where it is", !!homed?.some((b) => b.id === "priv"))
check("nothing to move is nothing", blocksIntoDetails("product-information", homed ?? [], takesAll) === null)
const virtual = blocksIntoDetails<{ id: string; type: string; static?: boolean; blocks?: { id: string; type: string }[] }>("product-information", [{ id: "t", type: "text" }], takesAll, [{ type: "_product-media-gallery", id: "media-gallery" }, { type: "_product-details", id: "product-details" }])
check("Details nobody has edited yet is made, holding the block", virtual?.length === 1 && virtual[0].id === "product-details" && virtual[0].static === true && virtual[0].blocks?.[0]?.id === "t", virtual)
check("a section that isn't a product's is left alone", blocksIntoDetails("contact-form", [{ id: "info", type: "contact-info", static: true }, { id: "t", type: "text" }], takesAll) === null)
check("a featured product counts", isProductSection("featured-product", []))
check("so does a section with a media block beside its details", isProductSection("hero", [{ id: "m", type: "_media", static: true }, { id: "d", type: "_details", static: true }]))
check("out of Details to under the product is never offered", staysInDetails("product-information", horizon, "_product-details") === true)
check("out of any other group is", staysInDetails("product-information", horizon, "group") === false)
const statics = contentForStatics(`{% content_for 'block', type: '_product-media-gallery', id: 'media-gallery' %}{%- content_for 'block',\n type: "_product-details",\n id: "product-details", closest.product: closest.product -%}`)
check("the statics a file places are read, multi-line calls too", statics.map((x) => x.id).join() === "media-gallery,product-details", statics)
const theme2 = read("lib/storelib-theme/compat/theme.ts")
check("the website draws by the rule (imported themes)", /blocksIntoDetails\(instance\.type, instance\.blocks, this\.blockTakes/.test(theme2))
check("the editor keeps to it (what loads, drags, AI edits)", /const homed = blocksIntoDetails\(s\.type, s\.blocks, takes/.test(editor))
check("the sidebar doesn't offer dragging out of Details", /staysInDetails\(section\.type, section\.blocks/.test(editor))

console.log("\nBuying never lands in the wrong checkout")
const digital = read("app/checkout/page.tsx")
check("a product that ships, sent to the digital checkout, goes to the cart checkout", /\.type === "physical"\) \{[\s\S]{0,400}redirect\(physicalCheckoutHref\(product\.creator_id/.test(digital))
const physPage = read("app/checkout/physical/page.tsx")
const physClient = read("app/checkout/physical/physical-checkout.tsx")
check("Back in the cart checkout is the store's own site, checked on the server", /checkoutReturns\(\{ creatorId: shop, cancel: asked \}\)/.test(physPage) && /backTo=\{backTo\}/.test(physPage))
check("and any other address in ?return= is never a link", !/params\.get\("return"\)/.test(physClient))
check("fields keep their names once filled (floating labels)", (physClient.match(/className=\{FLOAT_INPUT\}/g) ?? []).length >= 4 && (physClient.match(/className=\{FLOAT_SELECT\}/g) ?? []).length === 2)

console.log("\nBuy it now in an imported theme")
const pay = String((compatFilter("payment_button") as unknown as (v: unknown, a: unknown[], k: object) => unknown)({}, [], {}) ?? "")
check("payment_button is Shopify's unbranded Buy it now, a submit named checkout", /shopify-payment-button__button--unbranded/.test(pay) && /name="checkout"/.test(pay) && /data-storelib-buy-now/.test(pay) && />Buy it now</.test(pay), pay)
const boot = shopifyBootstrap({ currency: "USD", designMode: false, shopName: "S" } as never)
check("the page catches it before a theme's own submit handler, and posts with checkout", /closest\("\[data-storelib-buy-now\]"\)/.test(boot) && /stopImmediatePropagation/.test(boot) && /c\.name="checkout"/.test(boot) && /,true\)/.test(boot))
check("not in the builder's canvas", /if\(!S\.designMode\)document\.addEventListener\("click"/.test(boot))
const site = read("lib/storelib-theme/compat/site.ts")
check("the site sends that item alone to checkout and leaves the cart as it was", /if \(buyNow\) return \{ \.\.\.checkoutHandoff\(site, asked, false[^)]*\), cart: req\.cart/.test(site) && /const buyNow = !ajax && field\(req\.body, "checkout"\) !== undefined/.test(site))

console.log("\nPages between pages")
const rules = JSON.stringify(SITE_PREFETCH_RULES)
check("a link rested on is prefetched, never prerendered", /"prefetch"/.test(rules) && !/prerender/.test(rules) && /"moderate"/.test(rules))
check("never the cart, checkout, account or the API", ["/cart", "/checkout", "/account", "/api/*"].every((x) => rules.includes(`"${x}`)))
check("on Storelib themes' sites", /type="speculationrules"/.test(read("app/(site)/layout.tsx")))
check("and imported themes' sites (not in the canvas)", /speculationrules/.test(boot) && /if\(!S\.designMode&&HTMLScriptElement\.supports/.test(boot))
check("the logo is decoded with the page, no blank first frame", /decoding="sync"/.test(read("components/website-builder/sections/renderers/HeaderSection.tsx")))
const canvas2 = read("components/website-builder/compat/compat-canvas.tsx")
check("an imported theme's canvas shows a page's outline until it has painted, then fades", /function CanvasPlaceholder/.test(canvas2) && /const shown = painted && slots\.length > 0/.test(canvas2) && /<CanvasPlaceholder hidden=\{shown\}/.test(canvas2) && !/Loading \{compat\?\.theme \?\? "the theme"\}…<\/div>/.test(canvas2))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
