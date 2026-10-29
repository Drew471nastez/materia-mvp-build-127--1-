/**
 * The store's logo at the top of the emails that carry it, written to files
 * for scripts/check-email-logo.mjs to open in Chromium, drawn by the same
 * functions the send uses, and settled the way the send settles them
 * (lib/emails/brand-mark.ts settleBrandMarks, as lib/emails/logo-shape-server
 * does once it has read the picture's size).
 *
 *   OUT_DIR=<dir> node <bundle of this file>
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { autoLogoSources, settleBrandMarks } from "@/lib/emails/brand-mark"
import { buyerRefundEmail } from "@/lib/emails/notices"
import { buyerReceiptEmailHtml, type ReceiptEmailModel } from "@/lib/receipts/email"
import { senderPicture } from "@/lib/email-campaigns/sender"
import { buildEmail } from "@/lib/email-campaigns/template"
import { reviewRequestEmail } from "@/lib/reviews/request-email"
import { previewCustomerEmail } from "@/lib/emails/customer-catalog"

const out = process.env.OUT_DIR || join(process.cwd(), "email-logo-samples")
mkdirSync(out, { recursive: true })

/* A 4:1 wordmark ("loud LIB.") and a square icon, served by the check by their file names. */
const WORDMARK = "https://cdn.example.com/wordmark.png"
const ICON = "https://cdn.example.com/icon.png"
const SHAPES = new Map<string, "wide" | "square">([[WORDMARK, "wide"], [ICON, "square"]])
const settled = (html: string) => settleBrandMarks(html, new Map(autoLogoSources(html).map((s) => [s, SHAPES.get(s) ?? null])))

const refund = (logo: string) =>
  buyerRefundEmail({ storeName: "loud LIB.", productTitle: "Guide", amount: "€12.00", orderRef: "#1A2B3C4D", reason: "Requested", orderDate: "1 October 2026", refundDate: "3 October 2026", contactEmail: "a@b.co", sellerPictureUrl: logo, creditNote: { number: "CN-1", url: "https://loud.example/cn.pdf" } }).html
const receipt: ReceiptEmailModel = {
  firstName: "Ana",
  sellerName: "loud LIB.",
  sellerPicture: senderPicture({ logoUrl: WORDMARK }),
  orderNumber: "#1042",
  dateText: "1 October 2026",
  items: [{ title: "Guide", variantName: null, amountText: "€12.00", note: null, thumbnailUrl: null }],
  subtotalText: null,
  tipText: null,
  totalText: "€12.00",
  refundedText: null,
  link: "https://loud.example/receipt/x",
  buttonLabel: "View your receipt",
  supportEmail: "a@b.co",
}
const shop = { name: "loud LIB.", supportEmail: "a@b.co", storeUrl: "https://loud.example", currency: "EUR", logoUrl: WORDMARK, phone: null, accent: "#111111" }

const samples: Record<string, { html: string; expect: "wide" | "square" }> = {
  "refund-wordmark": { html: settled(refund(WORDMARK)), expect: "wide" },
  "refund-wordmark-unsettled": { html: refund(WORDMARK), expect: "wide" },
  "refund-icon": { html: settled(refund(ICON)), expect: "square" },
  "receipt-wordmark": { html: settled(buyerReceiptEmailHtml(receipt)), expect: "wide" },
  "receipt-photo": { html: settled(buyerReceiptEmailHtml({ ...receipt, sellerPicture: senderPicture({ photoUrl: ICON }) })), expect: "square" },
  "order-wordmark": { html: settled(previewCustomerEmail("order_confirmation", shop, null, { channel: "website" })!.html), expect: "wide" },
  "shipped-icon": { html: settled(previewCustomerEmail("shipping_confirmation", { ...shop, logoUrl: ICON }, null, { channel: "website" })!.html), expect: "square" },
  "review-wordmark": { html: settled(reviewRequestEmail({ reminder: false, shopName: "loud LIB.", logoUrl: WORDMARK, productTitle: "Guide", pageUrl: "https://loud.example/review" }).html), expect: "wide" },
  "campaign-wordmark": { html: buildEmail({ subject: "s", bodyHtml: "<p>Hi</p>", brand: { name: "loud LIB.", logoUrl: WORDMARK, storeUrl: null, accent: "#111111", address: null }, avatarUrl: null, kind: "marketing", unsubscribeUrl: "#" }), expect: "wide" },
}
for (const [name, s] of Object.entries(samples)) writeFileSync(join(out, `${name}.html`), s.html)
writeFileSync(join(out, "samples.json"), JSON.stringify(Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, v.expect]))))
