/**
 * Every preview in Emails › Customer emails is the email that is sent:
 * drawn by the same builder, with the same facts, in the same language.
 *
 *   receipt      lib/receipts/receipt-mail.ts buildReceiptEmail, which
 *                lib/email.tsx sendBuyerDownloadEmail sends
 *   refund       lib/emails/notices.ts buyerRefundMail, which sendRefundEmails sends
 *   shipped      the order emails of lib/physical/email-templates.ts in the
 *                buyer's language, as lib/physical/jobs-server.ts builds them
 *   community    lib/communities/server/email-templates.ts: the payload
 *                sendCommunityEmail puts in the event, drawn by the
 *                template the engine sends with, in the context it sends in
 *
 *   npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { previewCustomerEmail } from "@/lib/emails/customer-catalog"
import { buildReceiptEmail } from "@/lib/receipts/receipt-mail"
import { buyerRefundMail } from "@/lib/emails/notices"
import { inEmailLanguage } from "@/lib/emails/words"
import { orderConfirmationEmail, orderDateText } from "@/lib/physical/email-templates"
import { formatMoney } from "@/lib/receipts/rules"
import { senderPicture } from "@/lib/email-campaigns/sender"
import { resolveCopy, itemsText } from "@/lib/emails/customer-custom"
import { renderEmail } from "@/lib/notify/templates"
import { safeData } from "@/lib/notify/workflows/common"
import { baseUrl } from "@/lib/notify/urls"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

async function main() {
  const shop = { name: "Bread Studio", currency: "EUR", logoUrl: "https://cdn.storelib.com/logos/bread.png", logoFrom: "store" as const, supportEmail: "hello@bread.studio", storeUrl: "https://bread.studio", accent: "#0f766e" }
  const fr = { lang: "fr", words: { "Thanks for your order, {name}": "Merci pour votre commande, {name}", "View your receipt": "Voir votre reçu", "Order {number} confirmed": "Commande {number} confirmée" }, own: false }
  const saved = { heading: "Thanks, {{customer_name}}", button: "Open it" }

  console.log("\nThe receipt: the sender's own build\n")
  /* The model as sendBuyerDownloadEmail's receiptEmailModel makes it for this sample: the shop signing, its money in en-US. */
  const model = {
    firstName: "Maria",
    sellerName: "Bread Studio",
    sellerPicture: senderPicture({ logoUrl: shop.logoUrl }),
    orderNumber: "#1042",
    dateText: "10 October 2026",
    dateIso: "2026-10-10T12:00:00Z",
    items: [{ title: "The bread baking course", variantName: null, amountText: formatMoney(4900, "EUR", "en-US"), note: null, thumbnailUrl: null }],
    subtotalText: null,
    tipText: null,
    totalText: formatMoney(4900, "EUR", "en-US"),
    refundedText: null,
    link: "https://bread.studio/receipt/preview",
    buttonLabel: "View your receipt",
    supportEmail: "hello@bread.studio",
    accent: "#0f766e",
  }
  for (const [label, language, words] of [
    ["English, the store's words", { lang: "en", words: {}, own: true }, saved],
    ["French, the standard words", fr, saved],
    ["no language given", null, null],
  ] as const) {
    const sent = buildReceiptEmail(model, language, words)
    const shown = previewCustomerEmail("receipt", shop, words, { channel: "website", language })!
    check(`${label}: the preview is the sent email, letter for letter`, shown.subject === sent.subject && shown.html === sent.html && shown.text === sent.text, { shown: shown.subject, sent: sent.subject })
  }
  const email = read("lib/email.tsx")
  check("sendBuyerDownloadEmail sends exactly that build", /const \{ subject, html, text \} = buildReceiptEmail\(model, language, saved\.receipt\)/.test(email) && /subject,\s*\n\s*html,\s*\n\s*text,\s*\n\s*attachments,/.test(email))
  check("  and the receipt's copy to another address too", (email.match(/buildReceiptEmail\(model, language, saved\.receipt\)/g) ?? []).length === 2)

  console.log("\nThe refund\n")
  const refund = buyerRefundMail({ storeName: "Bread Studio", productTitle: "The bread baking course", amountCents: 4900, currency: "EUR", orderId: "1a2b3c4d-0000-4000-8000-000000000000", reason: "requested_by_customer", orderDate: "2026-10-10T12:00:00Z", refundDate: "2026-10-12T12:00:00Z", contactEmail: "hello@bread.studio", sellerPictureUrl: null }, fr)
  const refundShown = previewCustomerEmail("digital_refund", { ...shop, logoUrl: null }, null, { channel: "website", language: fr })!
  check("the preview is the sent refund", refundShown.html === refund.html && refundShown.subject === refund.subject)
  check("sendRefundEmails sends that build", /const buyerMail = buyerRefundMail\(/.test(email))

  console.log("\nAn order that ships\n")
  const sentConfirm = inEmailLanguage("fr", fr.words, () => {
    const brand = { logoUrl: shop.logoUrl, email: shop.supportEmail, phone: null, websiteUrl: shop.storeUrl, helpUrl: "https://storelib.com/checkout/physical/order/preview#get-help", accent: shop.accent }
    const lines = [
      { title: "Wildflower honey", variantName: "500 g", quantity: 2, cents: 3200, imageUrl: null },
      { title: "Linen apron", variantName: "Sage", quantity: 1, cents: 6400, imageUrl: null },
    ]
    return orderConfirmationEmail({
      shopName: "Bread Studio",
      orderNumber: "#1042",
      buyerFirstName: "Maria",
      lines,
      totals: { subtotal: 9600, discount: 1000, shipping: 700, shippingDiscount: 0, tax: 0, taxIncluded: false, total: 9300, currency: "EUR" },
      address: { name: "Maria Popescu", line1: "Strada Lipscani 12", line2: "Ap. 4", city: "Bucharest", postalCode: "030031", country: "RO" },
      deliveryName: "Standard",
      deliveryEstimate: "3 to 5 business days",
      statusUrl: "https://storelib.com/checkout/physical/order/preview",
      hasDownloads: false,
      storeUrl: shop.storeUrl,
      paymentLabel: "Visa ending 4242",
      supportEmail: shop.supportEmail,
      brand: { ...brand, websiteUrl: null },
      copy: undefined,
      orderDate: orderDateText("2026-10-10T12:00:00Z", "UTC"),
    })
  })
  const shownConfirm = previewCustomerEmail("order_confirmation", { ...shop, phone: null }, saved, { language: fr })!
  check("in French the preview is the order confirmation the job builds (the store's words left out, as the job leaves them)", shownConfirm.html === sentConfirm.html && shownConfirm.subject === sentConfirm.subject, shownConfirm.subject)
  const ownConfirm = previewCustomerEmail("order_confirmation", { ...shop, phone: null }, saved, { language: { lang: "en", words: {}, own: true } })!
  check("in its own language it carries the store's words, as the job does", ownConfirm.html.includes("Thanks, Maria") && resolveCopy(saved, { customer_name: "Maria", items: itemsText(["x"]) })?.heading === "Thanks, Maria")
  const jobs = read("lib/physical/jobs-server.ts")
  check("the job builds each email inside the buyer's language, its words only in the website's", /const say = <T,>\(build: \(\) => T\): T => inEmailLanguage\(language\.lang, language\.words, build\)/.test(jobs) && /id && language\.own \? resolveCopy/.test(jobs))

  console.log("\nA community's email\n")
  const t = await import("@/lib/communities/server/email-templates")
  const community = { id: "11111111-1111-4111-8111-111111111111", name: "Makers Club", slug: "makers", creatorName: "Ana Lopez" }
  const words = { subject: "You made it into {community}", heading: "", intro: "So glad you are here." }
  const shown = t.previewEmailWords("welcome", words, community)
  const payload = t.communityEmailPayload({}, community.id, community, t.wordsPayload(words))
  const sent = renderEmail("COMMUNITY_WELCOME", safeData(payload, { communityId: community.id }), { baseUrl: baseUrl(), recipientName: null, unsubscribeUrl: null, preferencesUrl: null, when: null })
  check("the welcome's preview is what the engine sends a member, words and all", shown.html === sent.html && shown.subject === "You made it into Makers Club", shown.subject)
  const src = read("lib/communities/server/email.ts")
  check("sendCommunityEmail builds the event's payload with that same function", /\.\.\.communityEmailPayload\(plainData\(input\.data\), input\.communityId, community, words\)/.test(src))
  check("the email channel draws a member's email with no name and no unsubscribe link, as the preview does", /customerUnsubscribeUrl: \(job\) => \(job\.entity_type === "order"/.test(read("lib/notify/worker.ts")))
  const ticket = t.previewEmailWords("event_ticket", { subject: "Changed", heading: "", intro: "" }, { ...community, currency: "EUR" })
  check("a ticket email: Storelib's words, the store's currency", !/Changed/.test(ticket.subject) && /€15\.00/.test(ticket.html), ticket.subject)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
