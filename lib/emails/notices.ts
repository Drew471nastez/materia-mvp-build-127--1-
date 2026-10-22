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
import { emailLanguage, et, inEmailLanguage } from "./words"

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

/**
 * The buyer's: from the store, with how long the bank takes and who to ask.
 * Written through et() (lib/emails/words.ts), so a refund for an order on
 * the store's website reads in the buyer's language, like its receipt; each
 * sentence is a line of Translate › Order emails.
 */
export function buyerRefundEmail(p: RefundFacts & { contactEmail: string; sellerPictureUrl?: string | null }): Mail {
  const store = clean(p.storeName, 80) || "Store"
  const product = clean(p.productTitle)
  const subject = et("Your {amount} refund for {product} has been processed", { amount: p.amount, product })
  const sender: EmailSender = { kind: "store", name: store, pictureUrl: p.sellerPictureUrl ?? null, picture: "avatar" }
  const k = emailKit(sender)
  const facts = [
    { label: et("Refund"), value: p.amount },
    { label: et("Product"), value: product },
    { label: et("Order date"), value: p.orderDate },
    { label: et("Refund date"), value: p.refundDate },
    { label: et("Reason"), value: clean(p.reason) || et("Not given") },
    { label: et("Order"), value: p.orderRef },
  ]
  const lead = et("{store} refunded {amount} for {product}. You don't need to do anything.", { store, amount: p.amount, product })
  const heading = et("Your refund is on its way")
  const bank = et("Banks usually take 5 to 10 business days to show it on your statement.")
  const downloads = et("The downloads for this product stopped working with the refund.")
  const sold = et("Sold by {store} through Storelib.", { store })
  const html = emailDocument({
    sender,
    subject,
    preview: lead,
    rows: [
      k.heading(heading),
      k.text(lead),
      k.facts(facts),
      k.notice({ text: bank }),
      k.small(downloads, { below: 20 }),
      k.button(et("Contact {store}", { store }), `mailto:${p.contactEmail}`),
      k.smallHtml(et("Or write to {email}.", { email: identity(p.contactEmail, false) })),
    ],
    footer: { reason: et("You're getting this email because of your order with {shop}.", { shop: store }), legal: sold },
  })
  const text = emailText([heading, lead, facts.map((f) => `${f.label}: ${f.value}`).join("\n"), bank, downloads, et("Questions? Write to {store} at {email}", { store, email: p.contactEmail })], [store, sold])
  return { subject, html, text }
}

/** Stripe's reason codes as words a buyer reads ("requested_by_customer" was sent as it is); anything else as the seller wrote it. */
function refundReason(reason: string): string {
  switch ((reason || "").trim()) {
    case "requested_by_customer":
      return et("Requested by you")
    case "duplicate":
      return et("Charged twice")
    case "fraudulent":
      return et("Payment not made by the card's owner")
    case "expired_uncaptured_charge":
      return et("Payment not completed")
    default:
      return reason
  }
}

/** "#1A2B3C4D", the short reference a refund names the order by. */
export function refundOrderRef(orderId: string): string {
  return `#${orderId.slice(0, 8).toUpperCase()}`
}

/**
 * THE BUYER'S REFUND, BUILT ONE WAY FOR THE INBOX AND THE PREVIEW: the
 * amount and the days written in the email's language, then the email
 * inside it. lib/email.tsx sendRefundEmails and Emails › Customer emails ›
 * Refund (lib/emails/customer-catalog.ts) both call this.
 */
export function buyerRefundMail(
  p: { storeName: string; productTitle: string; amountCents: number; currency: string; orderId: string; reason: string; orderDate?: string | null; refundDate: string; contactEmail: string; sellerPictureUrl?: string | null },
  language?: { lang: string; words: Record<string, string> | null } | null,
): Mail {
  return inEmailLanguage(language?.lang, language?.words, () => {
    const locale = emailLanguage() === "en" ? "en-US" : [emailLanguage(), "en-US"]
    const day = (iso: string | null | undefined) => {
      const at = iso ? new Date(iso) : null
      if (!at || Number.isNaN(at.getTime())) return et("Not known")
      return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" }).format(at)
    }
    const amount = new Intl.NumberFormat(locale, { style: "currency", currency: p.currency }).format(p.amountCents / 100)
    return buyerRefundEmail({
      storeName: p.storeName,
      reason: refundReason(p.reason),
      productTitle: p.productTitle,
      amount,
      orderDate: day(p.orderDate),
      refundDate: day(p.refundDate),
      orderRef: refundOrderRef(p.orderId),
      contactEmail: p.contactEmail,
      sellerPictureUrl: p.sellerPictureUrl ?? null,
    })
  })
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
