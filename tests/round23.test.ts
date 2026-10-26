/**
 * ===========================================================================
 *  ROUND 23: PACKING SLIPS TO THE SHARE SHEET, ORDERS AND ANALYTICS ON A PHONE,
 *  THE STATUS BAR OVER FULL SCREEN PAGES, A PUSH IN THE EDITOR, BUNDLES WHOLE
 * ===========================================================================
 * The owner's round 23. Measured with scripts/check-orders27.mjs (the order
 * page and its print icon), scripts/check-analytics-page.mjs, scripts/
 * check-ask-sheet-r18.mjs (the Ask sheet's close, 367ms, no frame dropped)
 * and scripts/check-wb-stability-r13.mjs PROFILE=1 (a push's hit tests,
 * 50 to 70ms before, 14 to 17ms after). The arithmetic is run here; the
 * rest is read from source (comments out).
 *
 *   npm run test:push
 */
import { readCode } from "./_source"
import { addAllLines, cartCount, MAX_LINES, MAX_QUANTITY, type CartLine } from "@/lib/website-builder/cart"
import { NO_CART_OFFERS } from "@/lib/offers/contract"
import { renderPackingSlipPdf, packingSlipFilename } from "@/lib/physical/packing-slip-pdf"
import { slipLines } from "@/lib/physical/packing-slip"

let passed = 0
let failed = 0
function check(label: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}`)
  }
}

const line = (productId: string, quantity = 1, extra: Partial<CartLine> = {}): CartLine => ({ productId, variantId: null, title: productId, variantName: null, priceCents: 1000, thumbnailUrl: null, slug: productId, digital: false, physical: true, quantity, ...extra })

async function main() {
  console.log("\nA bundle goes in whole or not at all (lib/website-builder/cart addAllLines)")
  const two = addAllLines([], [line("a"), line("b")])
  check("two lines into an empty cart: both", !!two && two.length === 2 && cartCount(two) === 2)
  const nearlyFull = Array.from({ length: MAX_LINES - 1 }, (_, i) => line(`p${i}`))
  check("a set of three into a cart with room for one: none, and the cart is as it was", addAllLines(nearlyFull, [line("x"), line("y"), line("z")]) === null && nearlyFull.length === MAX_LINES - 1)
  check("more of a line already there is taken even in a full cart", !!addAllLines(Array.from({ length: MAX_LINES }, (_, i) => line(`p${i}`)), [line("p0")]))
  check("a line that would pass the quantity limit refuses the whole set", addAllLines([line("a", MAX_QUANTITY)], [line("b"), line("a")]) === null)
  check("the same line twice in one set adds up, not two rows", (() => { const n = addAllLines([], [line("a"), line("a")]); return !!n && n.length === 1 && n[0].quantity === 2 })())

  console.log("\nThe one contract (lib/offers/contract.ts)")
  const contract = readCode("lib/offers/contract.ts")
  const route = readCode("app/api/offers/cart/route.ts")
  check("the answer names currency, subtotal, offers, total and free shipping", ["currency", "subtotalCents", "offerCents", "totalCents", "freeShipping", "offers", "lines", "suggestions", "completions"].every((k) => k in NO_CART_OFFERS))
  check("the route answers by the contract's type, with the server's own subtotal and the store's currency", /const answer: CartOffersAnswer = \{/.test(route) && /const subtotalCents = priced\.reduce\(\(n, l\) => n \+ l\.unitCents \* l\.quantity, 0\)/.test(route) && /readStoreCurrency\(db, shopId\)/.test(route) && /totalCents: Math\.max\(0, subtotalCents - offerCents\)/.test(route))
  check("no offer id is taken from the browser: the offers are the store's active ones", !/body\.offerId|body\.offers/.test(route) && /loadOffers\(db, shopId, \{ activeOnly: true \}\)/.test(route) && contract.includes("NO_CART_OFFERS"))
  const cartOffers = readCode("components/offers/cart-offers.tsx")
  check("the drawer and the cart page print the server's subtotal when it answers for every line in their currency", /export function offerSubtotalCents\(lines: CartLine\[\], data: CartOffersData \| null\): number/.test(cartOffers) && /data\.lines\.length !== lines\.length/.test(cartOffers) && /offerSubtotalCents\(lines, offers\)/.test(readCode("components/website-builder/sections/renderers/HeaderSection.tsx")) && /offerSubtotalCents\(lines, offers\)/.test(readCode("components/website-builder/cart-page-body.tsx")))

  console.log("\nA press adds once, with the buyer's answers")
  const bundle = readCode("components/offers/bundle-offers.tsx")
  check("a second press while the first is said, or one 600ms after it, adds nothing", /if \(added === key \|\| now - pressedAt\.current < 600\) return/.test(bundle) && bundle.indexOf("const pressedAt = React.useRef(0)") < bundle.indexOf("if (bundles.length === 0 && upsells.length === 0) return null"))
  check("Added is said only when the cart took every line", /if \(onAdd\(lines\) === false\) return/.test(bundle))
  const product = readCode("components/website-builder/sections/renderers/ProductSection.tsx")
  check("the website product section checks the answers and adds the set whole", /if \(personalized\.missing\) \{ setPersonalTouched\(true\); return false \}/.test(product) && /return cart\.addAll\(withAnswersLines\)/.test(product) && /addAllLines\(parseCart\(window\.localStorage\.getItem\(key\)\), withAnswersLines\)/.test(product))
  const buyBox = readCode("components/physical/buy-box.tsx")
  check("Storelib's own product page does the same", /if \(site\.live\) return site\.addAll\(lines\)/.test(buyBox) && /const answers = personalization\.check\(\)\s*if \(answers === null\) return false/.test(buyBox))
  check("an imported theme's Buy it now goes once per press", /b\.hasAttribute\("data-sl-going"\)/.test(readCode("lib/storelib-theme/compat/shims.ts")))

  console.log("\nThe packing slip as a PDF, to the share sheet")
  const order = {
    id: "11111111-1111-4111-8111-111111111111",
    createdAt: "2026-10-26T10:00:00Z",
    address: { name: "Ronald Appel", line1: "33 Vultee Crescent", city: "Cape Town", postal_code: "7100", country: "ZA" },
    delivery: { name: "Standard" },
    deliveryMethod: "ship",
    pickup: null,
    buyerName: "Ronald",
    buyerNote: "Leave it with the neighbour",
    lines: [{ orderId: "a", title: "Linen shirt", variantName: "M / Natural", sku: "LS-M", imageUrl: null, quantity: 2, fulfilled: 0, requiresShipping: true, locationId: null, properties: { Engraving: "AB" } }],
    shipments: [],
  }
  const tt = (s: string, v?: Record<string, string | number>) => s.replace(/\{n, plural[^}]*\}[^}]*\}/, String(v?.n ?? "")).replace(/\{(\w+)\}/g, (_, k) => String(v?.[k] ?? ""))
  const trace: string[] = []
  const pdf = await renderPackingSlipPdf(order as never, slipLines(order as never), { name: "Materia", logoUrl: null }, { tt, lang: "en" }, trace)
  check("a PDF", pdf.subarray(0, 5).toString() === "%PDF-")
  check("with the store, the order, where it goes, the item with its choices and how many", ["Materia", "Order #11111111", "Ronald Appel", "Linen shirt", "M / Natural · SKU LS-M", "Engraving: AB", "2", "Leave it with the neighbour"].every((t) => trace.includes(t)))
  check("named by its order", packingSlipFilename(order) === "packing-slip-11111111.pdf")
  const slipRoute = readCode("app/api/physical/orders/[id]/packing-slip/route.ts")
  check("the slip's address answers format=pdf with the PDF", /url\.searchParams\.get\("format"\) === "pdf"/.test(slipRoute) && /"Content-Type": "application\/pdf"/.test(slipRoute))
  const share = readCode("components/physical/slip-share.tsx")
  check("a phone shares the file the tap already has, and a late tap becomes the notice's own Share", /navigator\.share\(\{ files: \[file\]/.test(share) && /if \(name === "NotAllowedError"\) return "late"/.test(share) && /set\(\{ phase: "tap", file \}\)/.test(share))
  check("a computer prints, as before", /if \(!window\.matchMedia\?\.\("\(pointer: coarse\)"\)\.matches\) return false/.test(share))
  const detail = readCode("app/app/orders/order-detail.tsx")
  check("the print icon sits beside the order's menu, and Previous and Next are a computer's", /data-slip-print=""/.test(detail) && detail.indexOf("data-slip-print") < detail.indexOf("<ResponsiveActionMenu") && /<span className="flex shrink-0 items-center max-sm:hidden">/.test(detail))

  console.log("\nOrders on a phone")
  const client = readCode("app/app/orders/orders-client.tsx")
  check("a view already read is drawn in the press's frame, and the others are read ahead", /const kept = viewCache\.current\.get\(wanted\)\s*if \(kept\) adopt\(kept\)/.test(client) && /const readViewsAhead = useStable/.test(client))
  check("the list never dims while a view comes", /const WAITING = ""/.test(readCode("app/app/orders/orders-list.tsx")))
  const css = readCode("app/globals.css")
  check("an order's row is never faded under a scrolling finger", /html\.capacitor \.orders-list \[data-phone-row\] a:active \{\s*opacity: 1;/.test(css) && /\.orders-scroller\.scroll-edge-scroller \{ overflow-x: visible;/.test(css))
  check("an order's cards run edge to edge on a phone", /\.orders-body section\.rounded-2xl,/.test(css))

  console.log("\nThe status bar over a full screen page")
  check("the band is white under a layer, so the clock is dark on its light strip", /html\.app-layout\.has-page-layer \{\s*--native-band: #ffffff;/.test(css) && /html\.app-layout\.has-phone-page-layer \{\s*--native-band: #ffffff;/.test(css))

  console.log("\nAnalytics")
  const commerce = readCode("app/app/analytics/commerce-reports.tsx")
  check("sales over time leads and the breakdown comes last", commerce.indexOf('card="sales-over-time"') < commerce.indexOf('card="sales-breakdown"') && commerce.indexOf('card="sales-by-channel"') < commerce.indexOf('card="sales-breakdown"'))
  check("the breakdown keeps gross, net and total and the lines that hold money, with no change column", /const shownRows = rows\.filter\(\(r\) => r\.key === "gross" \|\| r\.key === "net" \|\| r\.key === "total"/.test(commerce) && !/w-\[52px\] text-right", kinds/.test(commerce))
  check("cards rise in as they are reached", /function useRevealCards\(\)/.test(readCode("app/app/analytics/analytics-client.tsx")) && /\[data-reveal="wait"\] \[data-bar\] \{\s*width: 0 !important;/.test(css))

  console.log("\nThe editor")
  const editor = readCode("app/website-builder/editor/[installId]/page.tsx")
  check("a section picked on a phone is felt, once", /if \(isMobileViewRef\.current && !\(field && !mobileSidebarOpenRef\.current\)\) hapticTap\("soft"\)/.test(editor))
  check("Ask Storelib's sheet moves as the sidebar's does, with no fade", /<MobileEditorSheet open=\{aiOpen\}[^\n]*detents=\{AI_SHEET_DETENTS\} keyboard="composer">/.test(editor))
  check("the first open holds its loader for 2.4s over a canvas that paints under it", /const OPEN_HOLD_MS = 2400/.test(editor) && /const canvasCovered = canvasLoaderUp \|\| \(openHold && !loadFailed\)/.test(editor))
  check("an outline asks the top of the stack first", /var top = document\.elementFromPoint\(x, y\);/.test(readCode("lib/storelib-theme/compat/canvas-bridge.ts")))

  check("this suite runs with the others", readCode("scripts/run-push-tests.mjs").includes('"tests/round23.test.ts"'))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

void main()
