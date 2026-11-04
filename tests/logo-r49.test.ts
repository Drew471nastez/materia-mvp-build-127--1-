/**
 * ===========================================================================
 *  A STORE'S LOGO: A SMALL CORNER, NO DEPTH, EVERYWHERE A BUYER SEES IT (round 49)
 * ===========================================================================
 * The owner: a store's logo has "a little bit of rounded corners, just a
 * small radius, NOT much, and NO depth". One corner (lib/brand/store-logo.ts)
 * for every email (lib/emails/brand-mark.ts logoImg), every buyer page
 * (components/brand/store-logo.tsx: the checkout's shop bar, the order status
 * page, the receipt, the order help page), the packing slip and the invoice
 * PDF. Storelib's own mark and a person's round photo are not this.
 */
import { readFileSync } from "node:fs"
import { STORE_LOGO_RADIUS, storeLogoRadius } from "@/lib/brand/store-logo"
import { STORELIB_LOGO_RADIUS } from "@/lib/brand/logo"
import { brandMarkHtml, logoImg, settleBrandMarks } from "@/lib/emails/brand-mark"
import { CUSTOMER_EMAILS, previewCustomerEmail } from "@/lib/emails/customer-catalog"
import { buyerRefundEmail } from "@/lib/emails/notices"
import { buyerReceiptEmailHtml, type ReceiptEmailModel } from "@/lib/receipts/email"
import { senderPicture } from "@/lib/email-campaigns/sender"
import { buildEmail } from "@/lib/email-campaigns/template"
import { reviewRequestEmail } from "@/lib/reviews/request-email"
import { packingSlipHtml, slipLines } from "@/lib/physical/packing-slip"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")

const LOGO = "https://bread.example/loud-lib-wordmark.png"
const imgsOf = (html: string) => html.match(/<img\b[^>]*>/g) ?? []
const storeLogosOf = (html: string) => imgsOf(html).filter((i) => /class="(e-store-logo|sl-logo)"/.test(i))
/** The shared corner and nothing else: one border-radius, the shared one, and no shadow. */
const sharedCorner = (img: string) => (img.match(/border-radius:[^;"]*/g) ?? []).join() === `border-radius:${STORE_LOGO_RADIUS}px` && !/box-shadow/.test(img)

console.log("\n1. One corner\n")
{
  check("6px at an email's 40px logo", STORE_LOGO_RADIUS === 6 && storeLogoRadius(40) === 6)
  check("15% of a shorter logo, never more than 6px", storeLogoRadius(32) === 4.8 && storeLogoRadius(20) === 3 && storeLogoRadius(44) === 6 && storeLogoRadius(120) === 6)
  check("no height: the full corner", storeLogoRadius(0) === 6 && storeLogoRadius(Number.NaN) === 6)
  check("Storelib's own mark keeps its own corner", STORELIB_LOGO_RADIUS === 7)
}

console.log("\n2. Emails\n")
{
  check("the picture itself", sharedCorner(logoImg(LOGO, "x")), logoImg(LOGO, "x"))
  for (const shape of ["wide", "square", "auto"] as const) {
    const html = brandMarkHtml({ name: "loud LIB.", src: LOGO, shape, font: "Arial", ink: "#111" })
    check(`the mark drawn ${shape}`, imgsOf(html).length === 1 && sharedCorner(imgsOf(html)[0] ?? ""), html)
  }
  const auto = brandMarkHtml({ name: "loud LIB.", src: LOGO, shape: "auto", font: "Arial", ink: "#111" })
  for (const shape of ["wide", "square"] as const) {
    const settled = settleBrandMarks(auto, new Map([[LOGO, shape]]))
    check(`settled ${shape} at send, the corner kept`, imgsOf(settled).length === 1 && sharedCorner(imgsOf(settled)[0] ?? "") && new RegExp(`data-logo-shape="${shape}"`).test(settled), settled)
  }

  const SHOP = { name: "loud LIB.", supportEmail: "hi@loud.example", storeUrl: "https://loud.example", currency: "EUR", logoUrl: LOGO, phone: null, accent: "#111111" }
  const CREATOR = { name: "Maria Popescu", photoUrl: "https://bread.example/maria.jpg", logoUrl: null }
  let drawn = 0
  const bad: string[] = []
  for (const channel of ["website", "storelib"] as const) {
    for (const e of CUSTOMER_EMAILS) {
      const m = previewCustomerEmail(e.id, SHOP, null, { channel, creator: CREATOR })
      if (!m) continue
      const logos = storeLogosOf(m.html)
      drawn += logos.length
      if (!logos.length || !logos.every(sharedCorner)) bad.push(`${e.id} (${channel})`)
    }
  }
  check("every customer email (order confirmations, shipping, refunds, and the rest): the logo with the shared corner, no shadow", drawn > 0 && bad.length === 0, bad)

  const refund = buyerRefundEmail({ storeName: "loud LIB.", productTitle: "Guide", amount: "€12.00", orderRef: "#1A2B3C4D", reason: "Requested", orderDate: "1 October 2026", refundDate: "3 October 2026", contactEmail: "a@b.co", sellerPictureUrl: LOGO } as Parameters<typeof buyerRefundEmail>[0])
  check("a refund", storeLogosOf(refund.html).length === 1 && storeLogosOf(refund.html).every(sharedCorner), storeLogosOf(refund.html))
  const model = { firstName: "Ana", sellerName: "loud LIB.", sellerPicture: senderPicture({ logoUrl: LOGO }), orderNumber: "#1", dateText: "1 October 2026", items: [{ title: "Guide", variantName: null, amountText: "€12.00", note: null, thumbnailUrl: null }], subtotalText: null, tipText: null, totalText: "€12.00", refundedText: null, link: "https://loud.example/r", buttonLabel: "View", supportEmail: "a@b.co" } as unknown as ReceiptEmailModel
  const receipt = buyerReceiptEmailHtml(model)
  check("a receipt", storeLogosOf(receipt).length === 1 && storeLogosOf(receipt).every(sharedCorner), storeLogosOf(receipt))
  const review = reviewRequestEmail({ reminder: false, shopName: "loud LIB.", logoUrl: LOGO, productTitle: "Guide", pageUrl: "https://loud.example/review" })
  check("a review request", storeLogosOf(review.html).length === 1 && storeLogosOf(review.html).every(sharedCorner), storeLogosOf(review.html))
  const campaign = buildEmail({ subject: "s", bodyHtml: "<p>Hi</p>", brand: { name: "loud LIB.", logoUrl: LOGO, storeUrl: null, accent: "#111111", address: null }, avatarUrl: null, kind: "marketing", unsubscribeUrl: "#" })
  check("a campaign", storeLogosOf(campaign).length === 1 && storeLogosOf(campaign).every(sharedCorner), storeLogosOf(campaign))
}

console.log("\n3. Buyer pages\n")
{
  const comp = read("components/brand/store-logo.tsx")
  check("one component: the shared corner on the picture, as drawn", /borderRadius: storeLogoRadius\(wideAt\)/.test(comp) && /borderRadius: storeLogoRadius\(height\)/.test(comp))
  check("  no shadow, no ring, never cropped", !/shadow|ring-|object-cover/.test(comp.replace(/\/\*[\s\S]*?\*\//g, "")))
  check("  a wordmark wider than its box is drawn at its own height, so its own corners are the rounded ones", /height: "auto", maxHeight: height/.test(comp) && /naturalWidth \/ img\.naturalHeight/.test(comp))
  const pages: [string, string, RegExp][] = [
    ["the checkout's shop bar (cart, physical, site checkout, thanks, tracking, preview)", "app/checkout/parts/shop-bar.tsx", /<StoreLogo src=\{brand\.imageUrl\}/],
    ["the order status page", "app/checkout/physical/order/[token]/order-status-view.tsx", /<StoreLogo src=\{shop\.avatar\}/],
    ["the order help page", "app/order-help/[id]/case-view.tsx", /<StoreLogo src=\{store\.logoUrl\}/],
    ["the receipt", "app/receipt/[token]/receipt-view.tsx", /kind === "logo" && avatarUrl[\s\S]{0,80}<StoreLogo src=\{avatarUrl\}/],
  ]
  for (const [what, file, drawnBy] of pages) {
    const src = read(file)
    const ownImg = (src.match(/<img\b[^>]*>/g) ?? []).filter((i) => /brand\.imageUrl|shop\.avatar|store\.logoUrl|seller\.avatarUrl|src=\{avatarUrl\}/.test(i))
    check(`${what}: drawn by StoreLogo, never its own <img>`, drawnBy.test(src) && ownImg.length === 0, ownImg)
  }
  check("the receipt knows a logo from a photo: a photo stays the round avatar", /avatarKind: store\.logoUrl && store\.logoFrom !== "profile" \? "logo" : "photo"/.test(read("lib/receipts/load.ts")) && /<AppAvatar src=\{avatarUrl\}/.test(read("app/receipt/[token]/receipt-view.tsx")))
  check("the photo in the checkout bar stays a circle", /<AppAvatar src=\{brand\.imageUrl\}/.test(read("app/checkout/parts/shop-bar.tsx")))
}

console.log("\n4. The packing slip and the invoice PDF\n")
{
  const tt = (s: string, v?: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v?.[k] ?? ""))
  const order = { id: "0f3a9c2e-1111-4222-8333-444455556666", createdAt: "2026-10-10T10:00:00Z", address: null, delivery: null, deliveryMethod: "ship", pickup: null, buyerName: "Maria", buyerNote: null, lines: [], shipments: [] }
  const slip = packingSlipHtml(order as never, slipLines(order as never), { name: "loud LIB.", logoUrl: LOGO }, { tt, lang: "en", back: "/app/orders" })
  const rule = slip.match(/\.store img\{[^}]*\}/)?.[0] ?? ""
  check("the slip: at its own shape inside 160 by 44, the shared corner, no shadow, never cropped", /width:auto;height:auto;max-width:160px;max-height:44px/.test(rule) && rule.includes(`border-radius:${storeLogoRadius(44)}px`) && !/shadow|object-fit:cover/.test(rule), rule)
  const inv = read("lib/checkout/invoice.ts")
  check("the PDF: its own shape inside 120 by 32pt, clipped to the shared corner of the drawn picture", /doc\.roundedRect\(x, top, w, h, storeLogoRadius\(h\)\)\.clip\(\)/.test(inv) && /Math\.min\(PDF_LOGO_MAX_W \/ iw, PDF_LOGO_H \/ ih\)/.test(inv) && !/roundedRect\(right - 32, 46, 32, 32, 7\)/.test(inv))
  check("  Storelib's own mark in the invoice route unchanged", /roundedRect\(L, 47, 24, 24, 5\.25\)\.clip\(\)/.test(read("app/api/invoice/route.ts")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
