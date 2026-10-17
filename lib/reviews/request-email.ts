/**
 * ===========================================================================
 *  STORELIB REVIEWS: THE REVIEW REQUEST EMAIL, AS THE STORE'S OWN
 * ===========================================================================
 * The ask and its one reminder (lib/reviews/requests-server.ts sends them)
 * in the layout every buyer email shares (lib/emails/layout.ts): the store's
 * logo and name on top, its accent on the button, the product's picture and
 * name, five stars that each open the review page with that many chosen, one
 * button, and a footer with the way out of review emails.
 *
 * THE STORE'S WORDS. Requests › Request email changes the subject, the
 * heading, the opening text and the button (store_settings.customer_emails,
 * ids review_request and review_reminder, the same editor rules as every
 * customer email: plain text, known placeholders only). They are written in
 * the website's own language, so a buyer who bought in another language gets
 * the standard words in theirs instead (`useOwnWords` false), as the order
 * emails do.
 *
 * THE LANGUAGE. Every standard sentence goes through et() and is built inside
 * inEmailLanguage by the sender, so it reads in the language the order was
 * placed in (lib/emails/words.ts); scripts/i18n/checkout-sentences.mjs lists
 * these sentences for Translate.
 *
 * Pure: the sender and the preview route share it, so the preview is the
 * email that goes.
 */
import { emailDocument, emailKit, emailText, type EmailSender } from "@/lib/emails/layout"
import { et } from "@/lib/emails/words"
import { resolveCopy, type CopyVars, type EmailCopy } from "@/lib/emails/customer-custom"

export const REQUEST_EMAIL_IDS = { request: "review_request", reminder: "review_reminder" } as const

export interface RequestEmailInput {
  reminder: boolean
  shopName: string
  /** The store's logo (https), its accent and its website, as every buyer email draws them. */
  logoUrl?: string | null
  accent?: string | null
  websiteUrl?: string | null
  productTitle: string
  productImage?: string | null
  firstName?: string | null
  orderNumber?: string | null
  /** The review page; `?rate=n` is added for each star. */
  pageUrl: string
  unsubscribeUrl?: string | null
  /** The store says a reminder follows when the buyer has not reviewed. */
  reminderOn?: boolean
  /** The store's own words for this email, when it changed any. */
  copy?: EmailCopy | null
}

export interface RequestEmail {
  subject: string
  preview: string
  html: string
  text: string
}

const one = (s: string, max: number) => s.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max)

export function rateUrl(pageUrl: string, n: number): string {
  return `${pageUrl}${pageUrl.includes("?") ? "&" : "?"}rate=${n}`
}

export function reviewRequestEmail(input: RequestEmailInput): RequestEmail {
  const shop = one(input.shopName || "", 80) || "Store"
  const product = one(input.productTitle || "", 80)
  const what = product || et("your purchase")
  const vars: CopyVars = { customer_name: input.firstName ?? null, shop_name: shop, items: what, order_number: input.orderNumber ?? null }
  const own = resolveCopy(input.copy ?? null, vars)

  const subject = own?.subject || (input.reminder ? et("A quick review of {product}?", { product: what }) : et("How is {product}?", { product: what }))
  const heading = own?.heading || (input.reminder ? et("Would you review {product}?", { product: what }) : et("How is {product}?", { product: what }))
  const intro = input.reminder
    ? [et("If you have had a chance to use it, a rating and a line or two is all it takes."), et("Good or bad, an honest review helps the next buyer.")]
    : [et("If you have had a chance to use it, how was it?"), et("Your review helps other buyers decide, and tells {shop} what works.", { shop })]
  const button = own?.button || et("Write a review")
  const preview = own?.introText ? one(own.introText, 140) : input.reminder ? et("One line and a rating is plenty.") : et("A few honest words help other buyers decide.")
  const note = input.reminder ? et("This is the last email about reviewing this purchase.") : input.reminderOn ? et("If you have not reviewed it, we will ask once more.") : null

  const sender: EmailSender = { kind: "store", name: shop, pictureUrl: input.logoUrl ?? null, picture: "mark", accent: input.accent ?? null, url: input.websiteUrl ?? null }
  const k = emailKit(sender)
  const stars = [1, 2, 3, 4, 5].map((n) => ({ label: n === 1 ? et("1 star") : et("{n} stars", { n }), url: rateUrl(input.pageUrl, n) }))
  const rows = [
    k.heading(heading),
    product ? k.media({ title: product, subtitle: et("from {shop}", { shop }), imageUrl: input.productImage ?? null }) : "",
    own?.introHtml !== undefined ? (own.introHtml ? k.html(own.introHtml) : "") : intro.map((p) => k.text(p)).join("\n"),
    k.stars(stars, et("Tap a star to start")),
    k.button(button, input.pageUrl),
    k.fallback(input.pageUrl),
    note ? k.small(note) : "",
  ]
  const links = input.unsubscribeUrl ? [{ label: et("Turn off review emails"), url: input.unsubscribeUrl }] : []
  const reason = et("You get this because you bought from {shop}.", { shop })
  const html = emailDocument({ sender, subject: one(subject, 150), preview, rows, footer: { reason, links } })
  const text = emailText(
    [
      heading,
      product ? `${product} · ${et("from {shop}", { shop })}` : null,
      own?.introText !== undefined ? own.introText : intro.join("\n\n"),
      `${button}: ${input.pageUrl}`,
      stars.map((s) => `${s.label}: ${s.url}`).join("\n"),
      note,
    ],
    [reason, input.unsubscribeUrl ? `${et("Turn off review emails")}: ${input.unsubscribeUrl}` : null],
  )
  return { subject: one(subject, 150), preview, html, text }
}

/** The sample the editor previews with: the store's own name and logo, a product of its own when it has one. */
export function sampleRequestEmail(input: Omit<RequestEmailInput, "pageUrl" | "firstName" | "orderNumber"> & { origin: string }): RequestEmail {
  return reviewRequestEmail({ ...input, pageUrl: `${input.origin.replace(/\/$/, "")}/review/sample`, firstName: "Ana", orderNumber: "1042", unsubscribeUrl: input.unsubscribeUrl ?? `${input.origin.replace(/\/$/, "")}/unsubscribe` })
}
