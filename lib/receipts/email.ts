/**
 * ===========================================================================
 *  THE BUYER'S RECEIPT EMAIL
 * ===========================================================================
 * Sent once per payment, a paid order or a free download (lib/email.tsx
 * sendBuyerDownloadEmail), with the same lines and totals the receipt page
 * shows because both come from lib/receipts/load.
 *
 * What it shows, top to bottom: the creator, by their one picture and name
 * (lib/email-campaigns/sender senderPicture, the same picture every email of
 * theirs carries); the thanks and the order number; each product with its
 * thumbnail and name; the totals; the Download button; how to reach the
 * seller.
 *
 * It is drawn in the one layout every Storelib email shares
 * (lib/emails/layout.ts), as the store: its logo, or its photo beside its
 * name, on top; its accent on the button; tables and inline styles, dark
 * mode, a VML button for Outlook on Windows, and a preheader. A product
 * with no thumbnail gets a tile with its first letter, never a broken
 * image.
 *
 * Pure: no database, no mailer, so tests/receipt-email.test.ts and
 * scripts/check-receipt-email.mjs draw exactly what is sent.
 */
import { emailImageSrc, type SenderPicture } from "@/lib/email-campaigns/sender"
import { emailDocument, emailKit, esc, identity, type EmailSender } from "@/lib/emails/layout"

const PLATFORM_BRAND_NAME = "Storelib"
/** The drawn size of a product's thumbnail and of the creator's picture, in CSS pixels. */
export const THUMB_PX = 64
export const AVATAR_PX = 40

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function safeText(s: string) {
  return (s || "").toString().replace(/\s+/g, " ").trim()
}

function safeName(name?: string) {
  return safeText(name || "").replace(/[<>]/g, "")
}

/** One receipt email, whatever the payment held. Built by receiptEmailModel in lib/email.tsx. */
export interface ReceiptEmailModel {
  firstName: string
  sellerName: string
  /** The creator's one picture, as every email of theirs carries it. Null draws their initial. */
  sellerPicture?: SenderPicture | null
  orderNumber: string
  dateText: string
  items: Array<{
    title: string
    variantName: string | null
    amountText: string
    note: string | null
    /** products.thumbnail_url as stored. Null draws a tile with the title's first letter. */
    thumbnailUrl?: string | null
  }>
  subtotalText: string | null
  tipText: string | null
  /** Settings › Taxes: the tax in the total, and whether it was part of the prices. */
  taxText?: string | null
  taxIncluded?: boolean
  /** "VAT 19%", as the checkout named the tax (SQL part 153, lib/tax/rules taxLabel); "Tax" without one. */
  taxLabel?: string | null
  /** The business that sells (Settings › Store details › Business details): "Sold by" with its address and tax number. */
  legal?: { name: string; lines: string[]; taxId: string | null; taxIdLabel: string } | null
  totalText: string
  refundedText: string | null
  link: string
  buttonLabel: string
  supportEmail: string
  /** Every order row the email covers: one, or each line of a basket. */
  orderIds?: string[]
  /**
   * The PDF that goes with the email (lib/checkout/invoice.ts): "invoice"
   * when a company is billed, "receipt" otherwise, and the address that
   * draws it again, which the receipt token opens as the receipt link does.
   */
  document?: { kind: "invoice" | "receipt"; link: string } | null
  /**
   * The store's own words from Settings › Customer emails
   * (lib/emails/customer-custom.ts): a heading in place of "Thanks for your
   * order", and an opening paragraph under it, already escaped. The button's
   * label is `buttonLabel`.
   */
  heading?: string | null
  introHtml?: string | null
  introText?: string | null
  /** The store's accent (lib/email-campaigns/brand-server loadBrand), on the button when it reads on white. */
  accent?: string | null
}

/** The line under the totals that says the PDF is attached, and where to get it again. */
function documentLine(m: ReceiptEmailModel): { html: string; text: string } | null {
  if (!m.document) return null
  const noun = m.document.kind === "invoice" ? "invoice" : "receipt"
  return {
    html: `Your ${noun} is attached as a PDF. <a class="e-link" href="${escapeHtml(m.document.link)}" style="color:#111827;text-decoration:underline;">Download it again</a>`,
    text: `Your ${noun} is attached as a PDF. Download it again: ${m.document.link}`,
  }
}

export function buyerReceiptEmailHtml(m: ReceiptEmailModel): string {
  const sellerPlain = safeText(m.sellerName) || PLATFORM_BRAND_NAME
  const first = safeName(m.firstName) || "there"
  const picture = m.sellerPicture
  const pictureUrl = picture ? emailImageSrc(picture.url, picture.kind === "logo" ? 120 : AVATAR_PX) : null
  const sender: EmailSender = { kind: "store", name: sellerPlain, pictureUrl, picture: picture?.kind === "photo" ? "avatar" : "logo", accent: m.accent ?? null }
  const k = emailKit(sender)
  const doc = documentLine(m)
  const totals = [
    ...(m.subtotalText ? [{ label: "Subtotal", value: m.subtotalText }] : []),
    ...(m.tipText ? [{ label: "Tip", value: m.tipText }] : []),
    ...(m.taxText && !m.taxIncluded ? [{ label: taxName(m), value: m.taxText }] : []),
    { label: "Total", value: m.totalText, strong: true },
    ...(m.taxText && m.taxIncluded ? [{ label: includedName(m), value: m.taxText }] : []),
    ...(m.refundedText ? [{ label: "Refunded", value: m.refundedText }] : []),
  ]
  const rows = [
    k.heading(m.heading ? safeText(m.heading) : `Thanks for your order, ${first}`, { sub: `Order ${m.orderNumber} · ${m.dateText}` }),
    m.introHtml ? k.html(m.introHtml) : "",
    k.items(
      m.items.map((it) => ({
        title: safeText(it.title),
        detail: it.variantName ? safeText(it.variantName) : null,
        warning: it.note,
        amount: it.amountText,
        imageUrl: emailImageSrc(it.thumbnailUrl, THUMB_PX),
      })),
      { ruleTop: true },
    ),
    k.totals(totals, { below: doc ? 12 : 28 }),
    doc ? k.smallHtml(doc.html, { below: 24 }) : "",
    k.button(m.buttonLabel, m.link),
    k.small("The button opens your receipt with the files, on any device, so keep this email.", { below: 4 }),
    k.fallback(m.link),
    k.smallHtml(`Questions about the order? Reply to this email to reach ${esc(sellerPlain)}, or write to ${identity(m.supportEmail, false)}.`),
  ]
  return emailDocument({
    sender,
    subject: `Your receipt from ${sellerPlain}`,
    preview: `Order ${m.orderNumber} from ${sellerPlain}, ${m.totalText}`,
    rows,
    footer: { legal: legalText(m) ? `${legalText(m)}. Through ${PLATFORM_BRAND_NAME}.` : `Sold by ${sellerPlain} through ${PLATFORM_BRAND_NAME}.` },
  })
}

/** The tax row's name: the checkout's own ("VAT 19%"), else "Tax". */
function taxName(m: ReceiptEmailModel): string {
  return safeText(m.taxLabel || "").replace(/[<>]/g, "").slice(0, 80) || "Tax"
}

/** Under the total, for prices that had the tax in them: "Including VAT 19%" (the same words as lib/tax/rules includedTaxLabel). */
function includedName(m: ReceiptEmailModel): string {
  const l = taxName(m)
  return `Including ${/^tax\b/i.test(l) ? "tax" + l.slice(3) : l}`
}

/** "Sold by Astrid SRL", its address and its tax number, one line each part, when the store gave its business details. */
function legalText(m: ReceiptEmailModel): string {
  const l = m.legal
  if (!l?.name?.trim()) return ""
  return [`Sold by ${safeText(l.name)}`, ...l.lines.map(safeText).filter(Boolean), l.taxId ? `${safeText(l.taxIdLabel || "Tax ID")} ${safeText(l.taxId)}` : ""].filter(Boolean).join(", ")
}

export function buyerReceiptEmailText(m: ReceiptEmailModel): string {
  const lines = m.items.map((it) => {
    const name = it.variantName ? `${safeText(it.title)} (${safeText(it.variantName)})` : safeText(it.title)
    return `  ${name}: ${it.amountText}${it.note ? ` (${it.note})` : ""}`
  })
  return [
    `Hi ${safeName(m.firstName) || "there"},`,
    "",
    m.heading ? safeText(m.heading) : `Thanks for your order from ${safeText(m.sellerName) || PLATFORM_BRAND_NAME}.`,
    `Order ${m.orderNumber}, ${m.dateText}`,
    ...(m.introText ? ["", m.introText] : []),
    "",
    ...lines,
    m.subtotalText ? `Subtotal: ${m.subtotalText}` : null,
    m.tipText ? `Tip: ${m.tipText}` : null,
    m.taxText && !m.taxIncluded ? `${taxName(m)}: ${m.taxText}` : null,
    `Total: ${m.totalText}`,
    m.taxText && m.taxIncluded ? `${includedName(m)}: ${m.taxText}` : null,
    m.refundedText ? `Refunded: ${m.refundedText}` : null,
    "",
    `${m.buttonLabel}: ${m.link}`,
    documentLine(m)?.text ?? null,
    "",
    "Reply to this email to reach the seller.",
    ...(legalText(m) ? ["", legalText(m)] : []),
  ]
    .filter((l): l is string => l !== null)
    .join("\n")
}
