/**
 * The emails scripts/check-email-weight.mjs weighs and photographs, drawn by
 * the same functions the sends use, with REAL pictures from Storelib's own
 * storage (a creator's logo, three product covers, a campaign picture), so
 * the bytes measured are the bytes an inbox downloads.
 *
 *   receipt        the buyer's receipt: the creator's logo, three products
 *   sale           the seller's "You sold" email for a three line basket
 *   broadcast      a campaign from the composer: text, a button, a full
 *                  width picture, a product card, a picture in the text
 *   contact        a buyer's message to the seller, from the receipt
 *   site-contact   a visitor's message from a creator's website form
 *
 * Each HTML is passed through the mailer's last step (lib/mailgun
 * finalizeEmailHtml) when the build has one, because that is what is sent.
 *
 *   OUT_DIR=<dir> node <bundle of this file>
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import * as mailgun from "@/lib/mailgun"
import { buyerReceiptEmailHtml, buyerReceiptEmailText, type ReceiptEmailModel } from "@/lib/receipts/email"
import { senderPicture } from "@/lib/email-campaigns/sender"
import { renderEmail } from "@/lib/notify/templates"
import { messageFor, type Frame } from "@/lib/email-campaigns/queue"
import { newBlock, renderBlocks, storeBlocks, type Block } from "@/lib/email-campaigns/blocks"
import { readStoredBody } from "@/lib/email-campaigns/stored"
import { themeOf, type Brand } from "@/lib/email-campaigns/brand"
import { sellerMessageEmail } from "@/lib/receipts/contact"
import { creatorEmail, type ContactMessage } from "@/lib/site-contact/contact"

process.env.EMAIL_LINK_SECRET = process.env.EMAIL_LINK_SECRET || "sample-signing-key-for-the-probe"
const out = process.env.OUT_DIR || join(process.cwd(), ".email-weight-probe", "out")
mkdirSync(out, { recursive: true })

const finalize = (html: string, subject: string): string => {
  const f = (mailgun as unknown as { finalizeEmailHtml?: (h: string, s?: string) => string }).finalizeEmailHtml
  return typeof f === "function" ? f(html, subject) : html
}

const STORE = "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public"
/* A creator's logo as uploaded (a 354 KB WebP) and three product covers: a PNG and two WebPs. */
const LOGO = `${STORE}/platform%20images/Untitled%20design%20(48).webp`
const PHOTO = `${STORE}/onepage-assets/ee48b026-347c-4372-8589-eea3863b443c/avatars/avatar-1770910695542.jpg`
const COVER_PNG = `${STORE}/product-images/31672c1b-0b7f-4ed9-af8f-f48c980bdf37/temp/1790331718087_cover-the-buyer-question-playbook.png`
const COVER_PHONE = `${STORE}/platform%20images/iPhone-13-PRO-negruw.storelib.com.webp`
const COVER_LAPTOP = `${STORE}/platform%20images/Macbook-Air-storelib.com%20(2).webp`
/* A picture a creator put in a campaign: a 4 MB PNG screenshot, the worst case the composer takes. */
const CAMPAIGN_PICTURE = `${STORE}/platform%20images/collage%20imags/awapage.png`

const manifest: Array<{ name: string; subject: string; headers: Record<string, string>; kind: "transactional" | "marketing" }> = []

function write(name: string, subject: string, html: string, text: string, headers: Record<string, string>, kind: "transactional" | "marketing") {
  writeFileSync(join(out, `${name}.html`), finalize(html, subject))
  writeFileSync(join(out, `${name}.txt`), text)
  manifest.push({ name, subject, headers, kind })
}

/* ── The receipt ─────────────────────────────────────────────────────── */
const receipt: ReceiptEmailModel = {
  firstName: "Alex",
  sellerName: "Negru Studio",
  sellerPicture: senderPicture({ photoUrl: null, logoUrl: LOGO }),
  orderNumber: "1042",
  dateText: "September 27, 2026",
  items: [
    { title: "The Buyer Question Playbook", variantName: null, amountText: "$24.00", note: null, thumbnailUrl: COVER_PNG },
    { title: "iPhone mockup pack", variantName: "PSD and Figma", amountText: "$18.00", note: null, thumbnailUrl: COVER_PHONE },
    { title: "MacBook Air scene", variantName: null, amountText: "$12.00", note: null, thumbnailUrl: COVER_LAPTOP },
  ],
  subtotalText: "$54.00",
  tipText: "$3.00",
  totalText: "$57.00",
  refundedText: null,
  link: "https://storelib.com/receipt/0f3c9a7e2b1d4c8a9e6f",
  buttonLabel: "View receipt and download",
  supportEmail: "hello@negru.studio",
}
write("receipt", "Your receipt from Negru Studio: 3 items", buyerReceiptEmailHtml(receipt), buyerReceiptEmailText(receipt), {}, "transactional")

/* ── The seller's new order email ────────────────────────────────────── */
const BASE = "https://storelib.com"
const sale = renderEmail(
  "NEW_SALE",
  {
    orderId: "ord-2",
    orderNumber: "1043",
    productTitle: "The Buyer Question Playbook",
    amountCents: 5700,
    currency: "usd",
    lines: [
      { title: "The Buyer Question Playbook", amountCents: 2400 },
      { title: "iPhone mockup pack", variantName: "PSD and Figma", amountCents: 1800 },
      { title: "MacBook Air scene", amountCents: 1200 },
    ],
    subtotalCents: 5400,
    tipCents: 300,
    feeCents: 285,
    customerName: "Alex Morgan",
    customerEmail: "alex@example.com",
    customerCountry: "PT",
    paymentMethod: "card",
    cardBrand: "visa",
    cardLast4: "4242",
  },
  {
    baseUrl: BASE,
    recipientName: "Negru Studio",
    when: "Sunday, September 27, 2026 at 9:40 AM GMT+3",
    preferencesUrl: `${BASE}/app/settings?tab=notifications`,
    unsubscribeUrl: `${BASE}/api/notify/unsubscribe?token=t`,
  },
)
write("sale", sale.subject, sale.html, sale.text, { "List-Unsubscribe": `<${BASE}/api/notify/unsubscribe?token=t>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }, "transactional")

/* ── A broadcast from the composer ───────────────────────────────────── */
const brand: Brand = {
  name: "Negru Studio",
  logoUrl: LOGO,
  storeUrl: "https://storelib.com/negru",
  accent: "#1a1a2e",
  address: "12 Harbour Street, Unit 4, Portland, ME 04101, United States",
}
const blocks: Block[] = [
  newBlock("rich", {
    html: `<h2>New mockups are in</h2><p>Hi {{first_name}},</p><p>Two new scenes this month, shot in daylight and ready for Figma and Photoshop.</p><p><img src="${COVER_PHONE}" alt="An iPhone on a desk" width="260"></p><p>Questions? Reply to this email.</p>`,
  } as Partial<Block>),
  newBlock("button", { label: "See the new scenes", url: "https://storelib.com/negru" } as Partial<Block>),
  newBlock("image", { src: CAMPAIGN_PICTURE, alt: "The new storefront on a laptop", width: 100 } as Partial<Block>),
  newBlock("product", { productId: "p1", title: "MacBook Air scene", price: "$12.00", imageUrl: COVER_LAPTOP, url: "https://storelib.com/negru/macbook-air" } as Partial<Block>),
  newBlock("divider"),
  newBlock("rich", { html: "<p>Thank you for being here,<br>Andrei</p>" } as Partial<Block>),
]
const sendBlocks = readStoredBody(storeBlocks(blocks)).blocks
const frame: Frame = {
  subject: "{{first_name}}, new mockups are in",
  previewText: "Two new scenes, ready for Figma and Photoshop",
  body: renderBlocks(sendBlocks, themeOf(brand)),
  trackOpens: true,
  sender: {
    creatorId: "c-1",
    userId: "u-1",
    name: brand.name,
    from: `${brand.name} <noreply@storelib.com>`,
    replyTo: "hello@negru.studio",
    avatarUrl: PHOTO,
    username: "negru",
    accountEmail: "andrei@example.com",
    planId: "growth",
    planStatus: "active",
    blocked: false,
    brand,
  },
} as Frame
const m = messageFor(frame, "11111111-1111-4111-8111-111111111111", { id: "22222222-2222-4222-8222-222222222222", email: "reader@example.com", name: "Maya Chen", subscriber_id: "s-1", tracking_token: "33333333-3333-4333-8333-333333333333" } as never, "44444444-4444-4444-8444-444444444444")
write("broadcast", m.subject, m.html, m.text, m.headers, "marketing")

/* ── Contact seller, from the receipt ────────────────────────────────── */
const contact = sellerMessageEmail({
  buyerName: "Alex",
  buyerEmail: "alex@example.com",
  orderNumber: "#1042",
  items: ["The Buyer Question Playbook", "iPhone mockup pack", "MacBook Air scene"],
  message: "Hi, the PSD in the iPhone pack opens without the screen layer.\n\nCould you send the file again? <b>Thanks</b>",
  orderLink: "https://storelib.com/app/orders/ord-1",
})
write("contact", contact.subject, contact.html, contact.text, {}, "transactional")

/* ── A website's contact form ────────────────────────────────────────── */
const msg: ContactMessage = { creatorId: "c-1", name: "Jo Visitor", email: "jo@example.org", subject: "Wholesale", message: "Do you sell the mockups as a bundle for a studio of five?\n\nThanks, Jo", consent: true, page: "contact", sectionId: null }
const site = creatorEmail({ store: "Negru Studio", msg, site: "negru.storelib.com", contactUrl: "https://storelib.com/app/emails" })
write("site-contact", site.subject, site.html, site.text, {}, "transactional")

writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2))
console.log(`wrote ${manifest.length} emails to ${out}`)
