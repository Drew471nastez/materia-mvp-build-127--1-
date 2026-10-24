/**
 * ROUND 10, THE ONEPAGE'S PRODUCTS
 *
 *   what a tap does        unset is the checkout (every block made before), a
 *                          sheet, the product page, and instant checkout only
 *                          for a download or a course
 *   who may see it         published shows and sells; a draft may be put on
 *                          the page in the editor and shows once published;
 *                          archived or deleted leaves the page and reads
 *                          "Unavailable" in the editor
 *   the price              free, pay what you want "From", a sale's old price
 *   tiles                  two that follow one another share a row
 *   instant checkout       pays through the checkout's own routes, in the
 *                          community's checkout window, never a new path
 *   the button's hover     the button moves, the card does not, only where
 *                          the device hovers
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  editorProductState,
  instantCheckoutOn,
  instantOrderBody,
  pairProductTiles,
  pickableProducts,
  productHref,
  productLayoutOf,
  productPriceParts,
  productSheetHash,
  productTapAction,
  productTapPlan,
  sellsInstantly,
  removePlanFor,
} from "@/lib/onepage/product-block"
import { resolveProductBlocks, answersForBlocks, type ProductsDb } from "@/lib/onepage/live-products"

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
const money = (c: number) => `$${(c / 100).toFixed(2)}`

async function main() {
  console.log("\nWhen someone taps it")
  check("a block with no setting goes to the checkout, as every block always did", productTapAction({}) === "checkout" && productTapAction(undefined) === "checkout")
  check("an unknown value is the checkout too", productTapAction({ tap_action: "teleport" as never }) === "checkout")
  check("page and sheet are kept", productTapAction({ tap_action: "page" }) === "page" && productTapAction({ tap_action: "sheet" }) === "sheet")
  check("checkout with instant checkout on a download: the window", productTapPlan({ tap_action: "checkout", instant_checkout: true, product_type: "digital" }) === "instant")
  check("  on a course too", productTapPlan({ instant_checkout: true, product_type: "course" }) === "instant")
  check("  never on a product that ships, a membership", productTapPlan({ instant_checkout: true, product_type: "physical" }) === "navigate" && productTapPlan({ instant_checkout: true, product_type: "membership" }) === "navigate")
  check("instant checkout off: the checkout page", productTapPlan({ tap_action: "checkout", product_type: "digital" }) === "navigate")
  check("a sheet wins over the window (the sheet's button opens it)", productTapPlan({ tap_action: "sheet", instant_checkout: true, product_type: "digital" }) === "sheet")
  check("the product page ignores instant checkout", productTapPlan({ tap_action: "page", instant_checkout: true, product_type: "digital" }) === "navigate")
  check("which kinds sell instantly", sellsInstantly("digital") && sellsInstantly("course") && sellsInstantly(null) && !sellsInstantly("physical") && !sellsInstantly("membership"))
  check("instantCheckoutOn needs the switch and the kind", instantCheckoutOn({ instant_checkout: true, product_type: "digital" }) && !instantCheckoutOn({ instant_checkout: false, product_type: "digital" }) && !instantCheckoutOn({ instant_checkout: true, product_type: "physical" }))

  console.log("\nWhere the link points (crawlers, long press, no script)")
  check("checkout: /checkout for a download", productHref({ product_id: "p1", product_slug: "pack", product_type: "digital" }) === "/checkout?productId=p1")
  check("checkout: the product page for a product that ships", productHref({ product_id: "p1", product_slug: "mug", product_type: "physical" }) === "/p/mug")
  check("page and sheet: the product page", productHref({ product_id: "p1", product_slug: "pack", tap_action: "page" }) === "/p/pack" && productHref({ product_id: "p1", product_slug: "pack", tap_action: "sheet" }) === "/p/pack")
  check("the sheet's address", productSheetHash("tech house") === "#product-tech%20house" && productSheetHash("") === null)

  console.log("\nLayouts")
  check("the old three keep their names", productLayoutOf({ style: "button" }) === "button" && productLayoutOf({ style: "callout" }) === "callout" && productLayoutOf({ style: "preview" }) === "preview")
  check("the new ones", ["row", "side", "minimal", "overlay", "tile"].every((s) => productLayoutOf({ style: s as never }) === s))
  check("an unknown or missing style is the callout", productLayoutOf({ style: "fancy" as never }) === "callout" && productLayoutOf(undefined) === "callout")
  const b = (id: string, style?: string, type = "product") => ({ id, type, data: { style } })
  const paired = pairProductTiles([b("h", undefined, "header"), b("t1", "tile"), b("t2", "tile"), b("t3", "tile"), b("x", "callout"), b("t4", "tile")])
  const shape = paired.map((x) => ("tiles" in x ? `[${x.tiles.map((t) => t.id).join(",")}]` : x.id)).join(" ")
  check("tiles that follow one another sit two in a row, a lone one alone, the rest in order", shape === "h [t1,t2] [t3] x [t4]", shape)

  console.log("\nPrices")
  check("free", productPriceParts({ product_price_cents: 0 }, money).now === "Free")
  check("pay what you want with a minimum: From, never Free", JSON.stringify(productPriceParts({ product_price_cents: 0, product_pwyw: true, product_pwyw_min_cents: 500 }, money)) === JSON.stringify({ now: "$5.00", was: null, prefix: "from", free: false }))
  check("pay what you want from nothing: Free", productPriceParts({ product_pwyw: true, product_pwyw_min_cents: 0 }, money).free)
  check("on sale: the old price beside it", productPriceParts({ product_price_cents: 900, product_compare_at_cents: 1500 }, money).was === "$15.00")
  check("a compare-at price that is not higher is not a sale", productPriceParts({ product_price_cents: 900, product_compare_at_cents: 900 }, money).was === null)

  console.log("\nDraft, published, archived")
  const rows = [
    { id: "live", status: "published", archived: false },
    { id: "draft", status: "draft", archived: false },
    { id: "flag", status: "published", archived: true },
    { id: "arch", status: "archived", archived: true },
  ]
  check("published", editorProductState("live", rows) === "published")
  check("a draft", editorProductState("draft", rows) === "draft")
  check("archived by the flag or the status: Unavailable", editorProductState("flag", rows) === "unavailable" && editorProductState("arch", rows) === "unavailable")
  check("deleted (not in the catalogue): Unavailable", editorProductState("gone", rows) === "unavailable")
  check("still loading: no verdict yet", editorProductState("live", null) === "loading")
  check("the picker: published first, then drafts, never archived", pickableProducts(rows).map((r) => r.id).join(",") === "live,draft")

  /* The live page and the preview: the catalogue decides, every render (lib/onepage/live-products). */
  const blocks = [
    { id: "a", type: "product", data: { product_id: "live", product_title: "Old" } },
    { id: "b", type: "product", data: { product_id: "draft", product_title: "Not yet" } },
    { id: "c", type: "product", data: { product_id: "arch", product_title: "Gone" } },
  ]
  const db: ProductsDb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          in: async () => ({
            data: [
              { id: "live", title: "Pack", slug: "pack", price_cents: 0, type: "digital", status: "published", archived: false, compare_at_cents: null, pay_what_you_want: true, pwyw_min_price_cents: 300 },
              { id: "draft", title: "Not yet", slug: "nope", price_cents: 900, type: "digital", status: "draft", archived: false },
              { id: "arch", title: "Gone", slug: "gone", price_cents: 900, type: "digital", status: "archived", archived: true },
            ],
            error: null,
          }),
        }),
      }),
    }),
  }
  const answers = await answersForBlocks(db, "creator-1", blocks)
  const shown = resolveProductBlocks(blocks, answers) as typeof blocks
  check("the live page shows only the published product", shown.map((x) => x.id).join(",") === "a", shown.map((x) => x.id))
  const live = shown[0]?.data as Record<string, unknown>
  check("  read from the row: its title and pay what you want minimum", live?.product_title === "Pack" && live?.product_pwyw === true && live?.product_pwyw_min_cents === 300, live)
  /* Published later: the same block appears by itself, nothing to redo in the editor. */
  const later = new Map(answers)
  later.set("draft", { id: "draft", title: "Not yet", slug: "nope", price_cents: 900, type: "digital" })
  check("a draft that is published appears by itself", (resolveProductBlocks(blocks, later) as typeof blocks).map((x) => x.id).join(",") === "a,b")

  console.log("\nInstant checkout pays through the checkout's own routes")
  const paid = instantOrderBody({ productId: "p1", variantId: "v1", couponCode: "SAVE", email: " bea@example.com ", name: "Bea Buyer Jones", emailOptIn: true, taxCountry: "RO" }, false)
  check("the body the checkout page sends: names split, terms agreed, card", paid.productId === "p1" && paid.variantId === "v1" && paid.firstName === "Bea" && paid.lastName === "Buyer Jones" && paid.email === "bea@example.com" && paid.agreedToTerms === true && paid.couponCode === "SAVE" && paid.taxCountry === "RO" && JSON.stringify(paid.paymentMethods) === '["card"]' && paid.tipCents === 0, paid)
  const free = instantOrderBody({ productId: "p1", email: "a@b.co", name: "Ana" }, true)
  check("a free order carries no tip, no invoice, no card", !("tipCents" in free) && !("business" in free) && !("paymentMethods" in free) && free.firstName === "Ana" && free.lastName === "")
  const instant = code("components/checkout/instant-checkout.tsx")
  check("paid: /api/checkout/stripe-session then /api/checkout/confirm-payment", /"\/api\/checkout\/stripe-session"/.test(instant) && /"\/api\/checkout\/confirm-payment"/.test(instant))
  check("free: /api/checkout/process; codes: /api/coupons/validate", /"\/api\/checkout\/process"/.test(instant) && /"\/api\/coupons\/validate"/.test(instant))
  check("and nothing else that charges: no Stripe secret calls, no new route", !/paymentIntents\.|stripe\.charges|\/api\/onepage\/(pay|checkout)/.test(instant + code("app/api/onepage/product/route.ts")))
  check("Stripe's own card field and wallet, the community's (CompactPay)", /<CompactPay/.test(instant))
  check("the community's window, shared, not copied", /<CheckoutWindow/.test(instant) && /<CheckoutWindow/.test(code("components/community/public/join-flow.tsx")) && !/createPortal\(\s*<div className="fixed inset-0 z-\[130\]/.test(code("components/community/public/join-flow.tsx")))
  check("  with the community's head, Powered by Stripe and the dark look", /data-checkout-head/.test(code("components/checkout/checkout-window.tsx")) && /<PoweredByStripe/.test(code("components/checkout/checkout-window.tsx")) && /data-community-theme=\{dark/.test(code("components/checkout/checkout-window.tsx")))
  const route = code("app/api/onepage/product/route.ts")
  check("the product facts answer only for a published product", /publicOnly\(admin\.from\("products"\)/.test(route) && /isPubliclyVisible\(/.test(route))
  check("  and say when the window cannot take it (ships, membership, pay what you want, account first, sold out)", /sellsInstantly\(type\)/.test(route) && /pwyw/.test(route) && /requireAccount/.test(route) && /soldOut/.test(route))

  console.log("\nThe button's hover, not the card's")
  const block = code("components/onepage/product-block.tsx")
  const ctaHover = /PRODUCT_CTA_HOVER =\s*"([^;]*?)"\s*$/m.exec(read("components/onepage/product-block.tsx"))
  const allCta = (read("components/onepage/product-block.tsx").match(/export const PRODUCT_CTA_HOVER =([\s\S]*?)\n\n/) ?? [])[1] ?? ""
  check("the button rises and tints when the card is pointed at", /group-hover\/pc:-translate-y-px/.test(allCta) && /group-hover\/pc:before:opacity/.test(allCta) && /group-hover\/pc:after:opacity-100/.test(allCta), ctaHover?.[1])
  check("its motion names the real properties (translate, opacity)", /transition-\[translate\]/.test(allCta) && /before:transition-opacity/.test(allCta) && !/transition-all/.test(block))
  check("the card itself has no hover that moves or recolours it", !/group\/pc[^"]*hover:(scale|-translate|opacity|bg-)/.test(block) && !/hoverEffect/.test(block))
  check("hover only where the device hovers (Tailwind 4's hover variants), so no stuck hover on a phone", !/@media \(hover: none\)/.test(block) && /group-hover\/pc:/.test(allCta))
  check("the old product case in public-onepage is gone, the block draws it", !/const calloutContent =/.test(read("components/onepage/public-onepage.tsx")) && /<ProductBlockWithQuickCheckout/.test(read("components/onepage/public-onepage.tsx")))
  check("a tap is counted before anything else, as before", /const onClick = \(e: React\.MouseEvent<HTMLAnchorElement>\) => \{\s*trackClick\(block\.id, href\)/.test(block))
  check("tiles are paired on the page", /pairProductTiles\(/.test(read("components/onepage/public-onepage.tsx")))

  console.log("\nThe editor")
  const editor = code("components/onepage/tabs/product-block-editor.tsx")
  const tab = code("components/onepage/tabs/links-tab.tsx")
  check("the two edit links are one pair of buttons, opening the same places", /data-edit-product=""/.test(editor) && /data-edit-product-page=""/.test(editor) && /`\/app\/products\/\$\{encodeURIComponent\(productId\)\}`/.test(editor) && /"\/creator-page\?pageType=product"/.test(editor) && /<ProductEditLinks/.test(tab) && !/\{tt\("Edit Product Page"\)\}/.test(tab))
  check("When someone taps it, with instant checkout", /data-tap-choice/.test(editor) && /instant_checkout: on, quick_checkout: false/.test(editor) && /<ProductTapSetting/.test(tab))
  check("eight layouts to pick from", /<ProductLayoutPicker/.test(tab) && /PRODUCT_LAYOUTS\.map/.test(editor))
  check("a draft says so and how to show it; a product that is gone offers Remove", /Publish it to show it on your page/.test(read("components/onepage/tabs/product-block-editor.tsx")) && /data-product-remove/.test(editor) && /<ProductStateNote/.test(tab))
  check("the picker lists drafts with a badge and leaves archived out", /pickableProducts\(effectiveSellerProducts/.test(tab) && /<ProductStateBadge state=\{editorProductState\(product\.id/.test(tab))

  console.log("\nRemove, on the page or inside a group")
  const page = [
    { id: "top", type: "product", data: {} },
    { id: "g", type: "group", data: { children: [{ id: "kid", type: "product", data: {} }, { id: "other", type: "link_button", data: {} }] } },
  ]
  check("a block on the page: the page removes it", removePlanFor(page, "top").kind === "top")
  const kid = removePlanFor(page, "kid")
  check("a block inside a group: taken out of the group's children, the rest kept", kid.kind === "child" && kid.groupId === "g" && JSON.stringify(kid.children.map((c: any) => c.id)) === '["other"]', kid)
  check("a block nowhere: nothing", removePlanFor(page, "ghost").kind === "none")
  check("the Unavailable note's Remove follows the plan", /removePlanFor\(onepage\?\.draft_blocks, block\.id\)/.test(tab) && /plan\.kind === "child"/.test(tab))
  check("the edit buttons read in full: a small Edit, then Product and Product page, each named in full", /\{tt\("Product page"\)\}/.test(editor) && /aria-label=\{tt\("Edit product page"\)\}/.test(editor))
  check("the tap choices never widen their column", /grid-cols-\[minmax\(0,1fr\)\]/.test(editor) && /min-w-0 items-center gap-3 rounded-xl/.test(editor))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
