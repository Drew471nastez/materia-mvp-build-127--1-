/**
 * ROUND 49, A ONEPAGE'S BUY FOR A PRODUCT THAT SHIPS OPENS THE NEW CHECKOUT
 *
 * The owner: buying a physical product on a OnePage opened the OLD checkout
 * (storelib.com/checkout/physical, Stripe's embedded form under the shop's
 * bar). It should open the NEW one, the store website's checkout at
 * https://<site>/checkout (app/(storelib)/checkout/site, drawn as the Explore checkout),
 * which the website's product pages and cart already pay on.
 *
 *   every OnePage entry point   the block's tap, the sheet's Check out, and
 *                               a download's checkout link: the new checkout
 *                               URL, with src=onepage and the OnePage to
 *                               come back to
 *   the cart in the link        option, quantity and the buyer's answers;
 *                               no option named: chosen in the checkout
 *   Back, Continue shopping     the OnePage, checked on the server
 *   the order's Source          the OnePage, on the website's host too
 *   old links                   /checkout?productId=<ships> and
 *                               /checkout/physical?items= go on to the
 *                               website's checkout; only a store with no
 *                               published website keeps the old page
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { productCheckoutUrl, productHref, productTapPlan, PRODUCT_TAP_ACTIONS } from "@/lib/onepage/product-block"
import { onePageOutboundHref, CHECKOUT_BACK_PARAM } from "@/lib/onepage/return-address"
import { cleanSiteOrigin, onePageShippedCheckoutHref, onePageTapCheckoutHref, ONEPAGE_SRC } from "@/lib/onepage/shipped-checkout"
import { onePageNamed, readSiteCheckoutParams, siteCheckoutBack, siteCheckoutHref, siteCheckoutRouteFor, withOnePageBack } from "@/lib/checkout/site-checkout"
import { decodeItems } from "@/lib/physical/cart-link"
import { describeCheckout } from "@/lib/orders/checkout-origin"
import { ONEPAGE_SOURCE, originFromRequest } from "@/lib/orders/order-source"
import { purchaseProperty } from "@/lib/attribution/server"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else {
    failed++
    failures.push(name)
  }
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 500)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

const SHOP = "22222222-2222-4222-8222-2222222222cc"
const MUG = "33333333-3333-4333-8333-0000000000a1"
const LARGE = "55555555-5555-4555-8555-0000000000a1"
const ONEPAGE = "https://storelib.me/lena"
const SITE = "https://lena.storelib.com"

function main() {
  console.log("\nThe block's tap: every action and kind builds the new checkout's address (or the product page)")
  for (const type of ["physical", "digital", "course", null]) {
    for (const action of PRODUCT_TAP_ACTIONS) {
      const href = productHref({ product_id: MUG, product_slug: "mug", product_type: type, tap_action: action })
      const want = action === "checkout" ? `/checkout?productId=${MUG}&src=onepage` : "/p/mug"
      check(`${String(type)} · ${action}: ${want}`, href === want, href)
    }
  }
  check("a product that ships never links to its page or the old checkout from the checkout tap", !/\/checkout\/physical|^\/p\//.test(productHref({ product_id: MUG, product_slug: "mug", product_type: "physical" })))
  check("the tap that ships navigates (never the instant window)", productTapPlan({ tap_action: "checkout", instant_checkout: true, product_type: "physical" }) === "navigate")
  check("productCheckoutUrl carries src=onepage, and the option when named", productCheckoutUrl(MUG, LARGE) === `/checkout?productId=${MUG}&variantId=${LARGE}&src=onepage`)
  const outbound = onePageOutboundHref(productHref({ product_id: MUG, product_slug: "mug", product_type: "physical" }), ONEPAGE)
  const ou = new URL(outbound)
  check("on the page: storelib.com/checkout with the OnePage to come back to", ou.pathname === "/checkout" && ou.searchParams.get("src") === "onepage" && ou.searchParams.get(CHECKOUT_BACK_PARAM) === ONEPAGE, outbound)

  const tap = onePageTapCheckoutHref({ siteOrigin: SITE, shopId: SHOP, productId: MUG, onePage: ONEPAGE })
  const tu2 = tap ? new URL(tap) : null
  const tapItems = tu2 ? decodeItems(tu2.searchParams.get("items")) : []
  check("once the facts name the website, the tap goes straight to its checkout: one of it, no option named (chosen there)", !!tu2 && tu2.origin === SITE && tu2.pathname === "/checkout" && tapItems.length === 1 && tapItems[0].productId === MUG && tapItems[0].variantId === null && tapItems[0].quantity === 1 && tu2.searchParams.get("src") === "onepage" && tu2.searchParams.get("cancel") === ONEPAGE, tap)
  check("  no website known yet: no direct link (storelib.com's stays)", onePageTapCheckoutHref({ siteOrigin: null, shopId: SHOP, productId: MUG, onePage: ONEPAGE }) === null && onePageTapCheckoutHref({ siteOrigin: SITE, shopId: null, productId: MUG, onePage: ONEPAGE }) === null)
  const blockCode = code("components/onepage/product-block.tsx")
  check("  the block reads the facts as it nears the screen and links the website's checkout", /const shipsToCheckout = plan === "navigate" && productTapAction\(data\) === "checkout" && shipsProduct\(data\.product_type\)/.test(blockCode) && /onePageTapCheckoutHref\(\{ siteOrigin: shopSite\.origin/.test(blockCode) && /const href = direct \?\? onePageOutboundHref\(path, back\)/.test(blockCode) && /if \(shipsToCheckout\)\s*void loadProductFacts/.test(blockCode) && /plan !== "navigate" \|\| shipsToCheckout \? <span ref=\{seen\}/.test(blockCode))

  console.log("\nThe sheet's Check out: straight to the website's checkout")
  const items = [{ productId: MUG, variantId: LARGE, quantity: 3, properties: { Name: "Ana" } }]
  const sheet = onePageShippedCheckoutHref({ siteOrigin: SITE, shopId: SHOP, items, onePage: ONEPAGE })
  const su = new URL(sheet)
  check("the website's own /checkout, never /checkout/physical", su.origin === SITE && su.pathname === "/checkout", sheet)
  const back = decodeItems(su.searchParams.get("items"))
  check("the option, the quantity and the buyer's answers ride in the cart", back.length === 1 && back[0].productId === MUG && back[0].variantId === LARGE && back[0].quantity === 3 && back[0].properties?.Name === "Ana", back)
  check("src=onepage and Back to the OnePage", su.searchParams.get("src") === ONEPAGE_SRC && su.searchParams.get("cancel") === ONEPAGE, sheet)
  check("not the whole cart: paying never empties the website's cart", su.searchParams.get("cart") === null)
  const preview = onePageShippedCheckoutHref({ siteOrigin: SITE, shopId: SHOP, items, onePage: null })
  check("in the editor's preview (no address yet): still the website's checkout, still src=onepage", new URL(preview).origin === SITE && new URL(preview).searchParams.get("src") === "onepage" && !new URL(preview).searchParams.has("cancel"))
  const noSite = onePageShippedCheckoutHref({ siteOrigin: null, shopId: SHOP, items, onePage: ONEPAGE })
  check("a store with no website: storelib.com's link for the same cart (its only checkout), with src=onepage", noSite.startsWith(`/checkout/physical?shop=${SHOP}&items=`) && new URLSearchParams(noSite.split("?")[1]).get("src") === "onepage" && new URLSearchParams(noSite.split("?")[1]).get("return") === ONEPAGE, noSite)
  check("the site origin is checked: https only, no user:pass, nothing after the host", cleanSiteOrigin("https://lena.storelib.com/x?y") === SITE && cleanSiteOrigin("javascript:alert(1)") === null && cleanSiteOrigin("http://shop.example") === null && cleanSiteOrigin("https://a:b@shop.example") === null && cleanSiteOrigin("http://localhost:3000") === "http://localhost:3000")
  const evil = onePageShippedCheckoutHref({ siteOrigin: "javascript:alert(1)//", shopId: SHOP, items, onePage: ONEPAGE })
  check("  a bad origin falls back to storelib.com's link, never a script address", evil.startsWith("/checkout/physical?"), evil)

  console.log("\nThe website's checkout reads it")
  const q = new URL(sheet).searchParams
  const params = readSiteCheckoutParams(q)
  check("the page reads the cart from the link", params.items.length === 1 && params.items[0].variantId === LARGE && params.items[0].quantity === 3)
  check("the OnePage is named for the page to check (onePageNamed)", onePageNamed(q) === ONEPAGE)
  check("  only with src=onepage, only a full address", onePageNamed(new URLSearchParams({ cancel: ONEPAGE })) === null && onePageNamed(new URLSearchParams({ src: "onepage", cancel: "/cart" })) === null)
  check("the website's own Back rule ignores another host (the page puts the checked OnePage first)", siteCheckoutBack(q, "lena.storelib.com", null) === null)
  check("a OnePage on the website's own domain (/links) is a page of the site too", siteCheckoutBack(new URLSearchParams({ src: "onepage", cancel: "https://lenashop.test/links" }), "lenashop.test", null) === "/links")
  check("after paying, the thank you page carries the OnePage for Continue shopping", withOnePageBack("/checkout/thanks/tok_12345678", ONEPAGE) === `/checkout/thanks/tok_12345678?src=onepage&back=${encodeURIComponent(ONEPAGE)}` && withOnePageBack("/checkout/thanks/t?cart=1", null) === "/checkout/thanks/t?cart=1")
  check("  and the thank you page reads it back", onePageNamed(new URLSearchParams({ src: "onepage", back: ONEPAGE })) === ONEPAGE)
  check("siteCheckoutHref: source alone is src=onepage with no Back", siteCheckoutHref({ origin: SITE, items, source: "onepage" }).includes("src=onepage") && !siteCheckoutHref({ origin: SITE, items, source: "onepage" }).includes("cancel="))
  check("siteCheckoutHref: a website's own links are unchanged (no src)", !siteCheckoutHref({ origin: SITE, items, back: "/products/mug" }).includes("src="))
  const old = siteCheckoutRouteFor("/checkout/physical", `?shop=${SHOP}&items=${encodeURIComponent(q.get("items") ?? "")}&return=${encodeURIComponent(`${SITE}/products/mug`)}`, "GET", "lena.storelib.com")
  check("an old /checkout/physical link on the website's host goes to its /checkout with the cart (unchanged)", old?.kind === "redirect" && old.to.startsWith("/checkout?items="), old)

  console.log("\nThe order's Source: the OnePage, on the website's host too")
  const onSite = describeCheckout({ href: sheet, referrer: "https://storelib.me/", trail: [], landingSearch: "", userAgent: "Mozilla/5.0", mainDomain: "storelib.com" })
  check("src=onepage on lena.storelib.com: surface onepage, no website named", onSite?.surface === "onepage" && !onSite?.site, onSite)
  const plainSite = describeCheckout({ href: `${SITE}/checkout?items=x`, referrer: `${SITE}/products/mug`, trail: [], landingSearch: "", userAgent: "Mozilla/5.0", mainDomain: "storelib.com" })
  check("  a website's own Buy is still the website's", plainSite?.surface === "website" && plainSite?.site === "lena.storelib.com", plainSite)
  const onPlatform = describeCheckout({ href: `https://storelib.com/checkout?productId=${MUG}&src=onepage`, referrer: "", trail: [], landingSearch: "", userAgent: "Mozilla/5.0", mainDomain: "storelib.com" })
  check("  a download's checkout from a OnePage with no referrer: still the OnePage", onPlatform?.surface === "onepage", onPlatform)
  check("ONEPAGE_SOURCE is the surface's own name", ONEPAGE_SOURCE === "onepage")
  const fromReferer = originFromRequest(new Request("https://lena.storelib.com/api/checkout/site", { headers: { referer: sheet } }))
  check("a route reading the checkout's address says OnePage too", fromReferer?.surface === "onepage", fromReferer)
  check("the purchase's property: the OnePage, though paid on the website", purchaseProperty("website", { surface: "onepage" }) === "onepage")
  check("  the website's own sale stays the website's, Storelib's stays the creator page's", purchaseProperty("website", { surface: "website" }) === "website" && purchaseProperty("website", null) === "website" && purchaseProperty("storelib", { surface: "profile" }) === "creator_page" && purchaseProperty("storelib", { surface: "onepage" }) === "onepage")

  console.log("\nThe code says the same")
  const sheetCode = code("components/onepage/product-sheet.tsx")
  check("the sheet builds its Check out with onePageShippedCheckoutHref and the product's website", /onePageShippedCheckoutHref\(\{ siteOrigin: p\.siteOrigin, shopId: p\.shopId/.test(sheetCode) && !/physicalCheckoutHref/.test(sheetCode))
  for (const f of ["components/onepage/product-block.tsx", "components/onepage/product-sheet.tsx", "components/onepage/public-onepage.tsx", "components/onepage/storelib-blocks.tsx", "components/onepage/creator-blocks.tsx", "components/onepage/extra-blocks.tsx"]) {
    check(`${f}: no link to the old checkout of its own`, !/checkout\/physical|physicalCheckoutHref/.test(code(f)))
  }
  const api = code("app/api/onepage/product/route.ts")
  check("the product's facts name its website (storeOriginFor), never storelib.com as one", /storeOriginFor\(admin, creatorId\)/.test(api) && /siteOrigin: storeOrigin && storeOrigin !== `https:\/\/\$\{getMainDomain\(\)\}` \? storeOrigin : null/.test(api))
  const site = code("app/api/checkout/site/route.ts")
  check("the website's checkout route keeps a OnePage's surface, everything else is the website's", /if \(sent\?\.surface === "onepage"\)/.test(site) && /surface: "website", site: cleanHost/.test(site))
  const sitePage = code("app/(storelib)/checkout/site/page.tsx")
  check("the website's checkout checks the OnePage before Back goes there", /onePageReturnFor\(site\.creatorId, named\)/.test(sitePage) && /const backTo = onePage \?\? /.test(sitePage) && /onePage=\{onePage\}/.test(sitePage))
  check("  and hands it to the thank you page after paying", /withOnePageBack\(inLang, onePage\)/.test(code("app/(storelib)/checkout/site/site-checkout.tsx")))
  const thanks = code("app/(storelib)/checkout/site/thanks/[token]/page.tsx")
  check("the thank you page checks it again before Continue shopping goes there", /onePageReturnFor\(site\.creatorId, named\)/.test(thanks) && /shopUrl=\{onePage \?\? shopUrl\}/.test(thanks))
  const productCheckout = code("app/(storelib)/checkout/page.tsx")
  check("storelib.com/checkout?productId=<ships>: the website's checkout first, the old page only without one", /websiteCheckoutFor\(checkoutAdmin\(\)/.test(productCheckout) && /redirect\(website \?\? physicalCheckoutHref\(/.test(productCheckout))
  check("  no option named: the buyer chooses it there (no first option forced)", /variantId: variantId && ID\.test\(variantId\) \? variantId : null, quantity: 1/.test(productCheckout))
  const physicalPage = code("app/(storelib)/checkout/physical/page.tsx")
  check("an old /checkout/physical link with its cart goes on to the website's checkout", /linkItems\.length\s*\?\s*await websiteCheckoutFor\(db, \{ shopId: shop, items: linkItems, back: asked/.test(physicalPage) && /if \(website\) redirect\(website\)/.test(physicalPage))
  const server = code("lib/checkout/shipped-checkout-server.ts")
  check("the server helper checks the OnePage and the website, and never names storelib.com as one", /onePageReturnFor\(ask\.shopId, back\)/.test(server) && /servingSiteOrigin\(db, ask\.shopId/.test(server) && /firstServingSite\(db, ask\.shopId/.test(server) && /hostname === getMainDomain\(\)\) return null/.test(server))
  check("the editor no longer says a product that ships opens its page", !/Products that ship open their page/.test(code("components/onepage/tabs/product-block-editor.tsx")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
