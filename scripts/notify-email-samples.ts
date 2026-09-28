/**
 * The notification emails scripts/check-notify-emails.mjs opens in a browser
 * and photographs, drawn by the same renderEmail() the engine and the sale
 * sender use, so what is measured is what an inbox gets.
 *
 *   review-request        the buyer, seven days after a Storelib purchase:
 *                         the product card, five stars, one button
 *   review-request-bare   the same with no picture: the letter tile
 *   review-reminder       the one reminder, fourteen days after
 *   sale-paid             the seller's "You made a sale" for a paid order
 *   sale-free             the same for a free claim: Free, never $0.00
 *   sale-first            the creator's first paid sale
 *
 * Each is written as HTML and as the plain text part beside it.
 *
 *   OUT_DIR=<dir> node <bundle of this file>
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { renderEmail } from "@/lib/notify/templates"
import type { TemplateContext } from "@/lib/notify/types"

const out = process.env.OUT_DIR || join(process.cwd(), ".notify-email-probe", "out")
mkdirSync(out, { recursive: true })

const BASE = "https://storelib.com"
const THUMB = "https://abc.supabase.co/storage/v1/object/public/products/presets.png"

const buyer: TemplateContext = {
  baseUrl: BASE,
  recipientName: "Ana Lopez",
  unsubscribeUrl: `${BASE}/api/notify/unsubscribe?token=sample-review-token`,
  preferencesUrl: null,
  when: null,
}
const seller: TemplateContext = {
  baseUrl: BASE,
  recipientName: "Maria Ruiz",
  unsubscribeUrl: `${BASE}/api/notify/unsubscribe?token=sample-sales-token`,
  preferencesUrl: `${BASE}/app/settings?tab=notifications`,
  when: "Thursday, October 1, 2026 at 9:40 AM GMT+3",
}

const review = {
  productTitle: "Lightroom Presets Vol 2",
  productId: "prod_1",
  productImage: THUMB,
  creatorName: "Loudlib",
  creatorSupportEmail: "hello@loudlib.com",
  receiptToken: "rt_9f2c41ab",
  orderId: "8f4a1c92-0f1e-4a2b-9c3d-7e6f5a4b3c2d",
}

const paid = {
  orderId: "ord-1",
  orderNumber: "1042",
  productTitle: "Lightroom Presets Vol 2",
  variantName: "Mobile",
  amountCents: 2900,
  currency: "usd",
  lines: [{ title: "Lightroom Presets Vol 2", variantName: "Mobile", quantity: null, amountCents: 2900 }],
  subtotalCents: 2900,
  feeCents: 145,
  customerName: "Sam Rivera",
  customerEmail: "sam@example.com",
  customerCountry: "PT",
  paymentMethod: "card",
  cardBrand: "visa",
  cardLast4: "4242",
}

const free = {
  orderId: "ord-2",
  orderNumber: "1043",
  productTitle: "Starter Pack",
  amountCents: 0,
  currency: "usd",
  lines: [{ title: "Starter Pack", variantName: null, quantity: null, amountCents: 0 }],
  customerName: "Jordan Lee",
  customerEmail: "jordan@example.com",
  customerCountry: "US",
}

const samples: Array<[string, ReturnType<typeof renderEmail>]> = [
  ["review-request", renderEmail("REVIEW_REQUEST", review, buyer)],
  ["review-request-bare", renderEmail("REVIEW_REQUEST", { ...review, productImage: "" }, buyer)],
  ["review-reminder", renderEmail("REVIEW_REMINDER", review, buyer)],
  ["sale-paid", renderEmail("NEW_SALE", paid, seller)],
  ["sale-free", renderEmail("NEW_SALE", free, seller)],
  ["sale-first", renderEmail("FIRST_SALE", paid, seller)],
]

for (const [name, email] of samples) {
  writeFileSync(join(out, `${name}.html`), email.html)
  writeFileSync(join(out, `${name}.txt`), email.text)
  writeFileSync(join(out, `${name}.json`), JSON.stringify({ subject: email.subject, preview: email.preview, fromName: email.fromName ?? null, replyTo: email.replyTo ?? null }, null, 2))
  console.log(`${name}: ${email.subject}`)
}
