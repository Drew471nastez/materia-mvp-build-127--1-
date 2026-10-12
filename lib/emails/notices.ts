/**
 * ===========================================================================
 *  THE SHORT EMAILS lib/email.tsx SENDS, DRAWN IN THE SHARED LAYOUT
 * ===========================================================================
 * Each used to be its own page of markup inside lib/email.tsx: a purple
 * header for a free download, an amber one with an emoji for a review, two
 * refund emails with a 44px amount, pills and icons. They are now built
 * from the same blocks as every other email (lib/emails/layout.ts):
 *
 *   leadMagnetEmail        a buyer's free download, from the store
 *   reviewNoticeEmail      "someone reviewed your product", from Storelib
 *   buyerRefundEmail       the buyer's refund, from the store
 *   sellerRefundEmail      the seller's "a refund was issued", from Storelib
 *
 * Pure: the sender in lib/email.tsx passes plain values, a test and a probe
 * draw exactly what is sent.
 */
import { emailDocument, emailKit, emailText, identity, platformEmail, type EmailSender } from "./layout"

type Mail = { subject: string; html: string; text: string }

function clean(s: unknown, max = 200): string {
  return String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max)
}

/* ---- Free download ------------------------------------------------------ */

export function leadMagnetEmail(p: {
  sellerName: string
  /** The seller's picture, https and sized; null draws their initial. */
  sellerPictureUrl?: string | null
  productTitle: string
  downloadLink: string
  supportEmail: string
  /** The creator's own words, from the page's settings. Plain text. */
  customSubject?: string | null
  customHeading?: string | null
  customBody?: string | null
}): Mail {
  const seller = clean(p.sellerName, 80) || "Storelib"
  const title = clean(p.productTitle)
  const subject = clean(p.customSubject, 120) || `Your download is ready: ${title}`
  const heading = clean(p.customHeading, 120) || "Here's your free download"
  const body = clean(p.customBody, 2000) || `Thanks for signing up. As promised, here's ${title}.`
  const sender: EmailSender = { kind: "store", name: seller, pictureUrl: p.sellerPictureUrl ?? null, picture: "avatar" }
  const k = emailKit(sender)
  const html = emailDocument({
    sender,
    subject,
    preview: body,
    rows: [
      k.heading(heading),
      k.text(body),
      k.media({ title, subtitle: `Free download from ${seller}` }),
      k.button("Download now", p.downloadLink),
      k.fallback(p.downloadLink),
      k.smallHtml(`Need help? Reply to this email or write to ${identity(p.supportEmail, false)}.`),
    ],
    footer: { reason: `You got this because you signed up for ${title}.`, legal: `Sent by ${seller} through Storelib.` },
  })
  const text = emailText([heading, body, title, `Download now:\n${p.downloadLink}`, `Need help? Reply to this email or write to ${p.supportEmail}.`], [seller, `You got this because you signed up for ${title}.`])
  return { subject, html, text }
}

/* ---- A new review, to the seller ---------------------------------------- */

export function reviewNoticeEmail(p: { productTitle: string; reviewerName: string; rating: number; content: string; link: string }): Mail {
  const title = clean(p.productTitle)
  const who = clean(p.reviewerName, 60) || "A customer"
  const rating = Math.max(1, Math.min(5, Math.round(Number(p.rating) || 0)))
  const stars = "★".repeat(rating) + "☆".repeat(5 - rating)
  const content = String(p.content ?? "").trim().slice(0, 4000)
  return platformEmail({
    subject: `New ${rating} star review on "${title}"`,
    heading: `New ${rating} star review`,
    media: { title, subtitle: `${stars}  ${rating} out of 5` },
    paragraphs: [`${who} reviewed ${title}.`],
    quote: content ? { text: content, by: who } : null,
    action: { label: "Read and reply", url: p.link },
    fallback: false,
    note: "A reply shows under the review on your product page.",
    reason: "You get this because you have a Storelib account.",
  })
}

/* ---- Refunds ------------------------------------------------------------ */

export interface RefundFacts {
  storeName: string
  productTitle: string
  /** "$12.00" */
  amount: string
  orderDate: string
  refundDate: string
  reason: string
  /** "#1A2B3C4D" */
  orderRef: string
}

/** The buyer's: from the store, with how long the bank takes and who to ask. */
export function buyerRefundEmail(p: RefundFacts & { contactEmail: string; sellerPictureUrl?: string | null }): Mail {
  const store = clean(p.storeName, 80) || "Store"
  const product = clean(p.productTitle)
  const subject = `Your ${p.amount} refund for ${product} has been processed`
  const sender: EmailSender = { kind: "store", name: store, pictureUrl: p.sellerPictureUrl ?? null, picture: "avatar" }
  const k = emailKit(sender)
  const facts = [
    { label: "Refund", value: p.amount },
    { label: "Product", value: product },
    { label: "Order date", value: p.orderDate },
    { label: "Refund date", value: p.refundDate },
    { label: "Reason", value: clean(p.reason) || "Not given" },
    { label: "Order", value: p.orderRef },
  ]
  const lead = `${store} refunded ${p.amount} for ${product}. You don't need to do anything.`
  const html = emailDocument({
    sender,
    subject,
    preview: lead,
    rows: [
      k.heading("Your refund is on its way"),
      k.text(lead),
      k.facts(facts),
      k.notice({ text: "Banks usually take 5 to 10 business days to show it on your statement." }),
      k.small("The downloads for this product stopped working with the refund.", { below: 20 }),
      k.button(`Contact ${store}`, `mailto:${p.contactEmail}`),
      k.smallHtml(`Or write to ${identity(p.contactEmail, false)}.`),
    ],
    footer: { reason: `You're getting this email because of your order with ${store}.`, legal: `Sold by ${store} through Storelib.` },
  })
  const text = emailText(
    [
      "Your refund is on its way",
      lead,
      facts.map((f) => `${f.label}: ${f.value}`).join("\n"),
      "Banks usually take 5 to 10 business days to show it on your statement.",
      "The downloads for this product stopped working with the refund.",
      `Questions? Write to ${store} at ${p.contactEmail}`,
    ],
    [store, `Sold by ${store} through Storelib.`],
  )
  return { subject, html, text }
}

/** The seller's: from Storelib, with what it does to their payout. */
export function sellerRefundEmail(p: RefundFacts & { buyerEmail: string | null; payoutsUrl: string }): Mail {
  const product = clean(p.productTitle)
  return platformEmail({
    subject: `Refund issued: ${p.amount} for ${product}`,
    heading: "A refund was issued",
    paragraphs: [`${p.amount} was refunded for ${product}. It comes out of your next payout.`],
    facts: [
      { label: "Refund", value: `-${p.amount}` },
      { label: "Product", value: product },
      { label: "Customer", value: p.buyerEmail || "Not known" },
      { label: "Order date", value: p.orderDate },
      { label: "Refund date", value: p.refundDate },
      { label: "Reason", value: clean(p.reason) || "Not given" },
      { label: "Order", value: p.orderRef },
    ],
    notice: { text: "If no payout covers it, it may be taken from your bank account.", tone: "warn" },
    action: { label: "View payouts", url: p.payoutsUrl },
    fallback: false,
    reason: "You get this because a refund was issued on your store.",
  })
}
