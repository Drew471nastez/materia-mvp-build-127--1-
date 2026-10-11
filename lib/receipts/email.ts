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
 * How it holds up in an inbox:
 *
 *   width       a fluid table up to 600px, with a fixed 600px table around
 *               it for Outlook on Windows, which ignores max-width. Below
 *               480px the price moves under the product's name and the
 *               button fills the width, so a phone reads one column.
 *   pictures    absolute https, sized for the inbox (emailImageSrc), with
 *               width, height and alt. A product with no thumbnail gets a
 *               grey tile with its first letter and a creator with no
 *               picture gets their initial: never a broken image.
 *   the button  a table cell with its own fill, so it is a button with
 *               pictures off, and a VML roundrect for Outlook on Windows.
 *               The depth is a hairline highlight on top and a soft shadow
 *               under it, in clients that draw box-shadow; the rest show a
 *               flat button, which is still a button.
 *   dark mode   `color-scheme: light dark`, a dark palette for Apple Mail
 *               and Outlook.com, and the button turned light on the dark
 *               card so it is still seen.
 *
 * Pure: no database, no mailer, so tests/receipt-email.test.ts and
 * scripts/check-receipt-email.mjs draw exactly what is sent.
 */
import { emailImageSrc, initialOf, type SenderPicture } from "@/lib/email-campaigns/sender"

const PLATFORM_BRAND_NAME = "Storelib"
const FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const INK = "#1a1a2e"
const MUTED = "#6b7280"
const RULE = "#eef0f3"
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
}

/** The line under the totals that says the PDF is attached, and where to get it again. */
function documentLine(m: ReceiptEmailModel): { html: string; text: string } | null {
  if (!m.document) return null
  const noun = m.document.kind === "invoice" ? "invoice" : "receipt"
  return {
    html: `<p class="rc-muted" style="margin:14px 0 0;font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};">Your ${noun} is attached as a PDF. <a class="rc-link" href="${escapeHtml(m.document.link)}" style="color:${INK};text-decoration:underline;">Download it again</a></p>`,
    text: `Your ${noun} is attached as a PDF. Download it again: ${m.document.link}`,
  }
}

/*
  A LITTLE DEPTH, NOT A CARD ON A CARD. A hairline border so a white product
  shot does not melt into the white card, and a shadow soft enough to read as
  lift rather than as a box.
*/
const THUMB_EDGE = "border:1px solid #e6e8ec;border-radius:10px;box-shadow:0 1px 2px rgba(16,24,40,0.06),0 3px 8px -2px rgba(16,24,40,0.08);"

/** The product's thumbnail, or a grey tile with its first letter. */
function thumbnail(title: string, url: string | null | undefined): string {
  const src = emailImageSrc(url, THUMB_PX)
  if (src) {
    return `<img class="rc-thumb" src="${escapeHtml(src)}" alt="${escapeHtml(title)}" width="${THUMB_PX}" height="${THUMB_PX}" style="display:block;width:${THUMB_PX}px;height:${THUMB_PX}px;object-fit:cover;background-color:#f3f4f6;${THUMB_EDGE}">`
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${THUMB_PX + 2}" style="width:${THUMB_PX + 2}px;border-collapse:separate;"><tr><td class="rc-tile" width="${THUMB_PX}" height="${THUMB_PX}" align="center" valign="middle" bgcolor="#f3f4f6" style="width:${THUMB_PX}px;height:${THUMB_PX}px;background-color:#f3f4f6;${THUMB_EDGE}font-family:${FONT};font-size:24px;line-height:${THUMB_PX}px;font-weight:600;color:#9ca3af;text-align:center;">${escapeHtml(initialOf(title, "#"))}</td></tr></table>`
}

/** The creator's picture beside their name: the photo round, the logo as uploaded, else their initial. */
function sellerMark(name: string, picture: SenderPicture | null | undefined): string {
  if (picture?.kind === "logo") {
    const src = emailImageSrc(picture.url, 120)
    if (src) return `<img src="${escapeHtml(src)}" alt="${escapeHtml(name)}" height="${AVATAR_PX}" style="display:block;height:${AVATAR_PX}px;width:auto;max-width:120px;border:0;">`
  }
  const src = picture?.kind === "photo" ? emailImageSrc(picture.url, AVATAR_PX) : null
  if (src) {
    return `<img class="rc-avatar" src="${escapeHtml(src)}" alt="${escapeHtml(name)}" width="${AVATAR_PX}" height="${AVATAR_PX}" style="display:block;width:${AVATAR_PX}px;height:${AVATAR_PX}px;border-radius:${AVATAR_PX / 2}px;object-fit:cover;border:0;background-color:#e5e7eb;">`
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="rc-tile" width="${AVATAR_PX}" height="${AVATAR_PX}" align="center" valign="middle" bgcolor="#e5e7eb" style="width:${AVATAR_PX}px;height:${AVATAR_PX}px;border-radius:${AVATAR_PX / 2}px;background-color:#e5e7eb;font-family:${FONT};font-size:16px;line-height:${AVATAR_PX}px;font-weight:600;color:#374151;text-align:center;">${escapeHtml(initialOf(name))}</td></tr></table>`
}

/**
 * THE DOWNLOAD BUTTON. A table cell with its own fill, an inset highlight
 * along its top edge and a soft shadow underneath; for Outlook on Windows,
 * which draws neither, a VML roundrect of the same size and colour.
 */
function button(label: string, link: string): string {
  const width = Math.max(200, Math.round(label.length * 9 + 56))
  return `<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${link}" style="height:48px;v-text-anchor:middle;width:${width}px;" arcsize="21%" strokecolor="#0e0e1a" fillcolor="${INK}">
<w:anchorlock/>
<center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${escapeHtml(label)}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-- -->
<table role="presentation" class="rc-btn-wrap" cellpadding="0" cellspacing="0" border="0">
<tr><td class="rc-btn" align="center" bgcolor="${INK}" style="border-radius:10px;background-color:${INK};box-shadow:inset 0 1px 0 rgba(255,255,255,0.16),0 1px 2px rgba(16,24,40,0.18),0 6px 14px -4px rgba(26,26,46,0.45);">
<a class="rc-btn-a" href="${link}" target="_blank" style="display:inline-block;padding:14px 28px;border-radius:10px;border-bottom:1px solid #0e0e1a;font-family:${FONT};font-size:15px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a>
</td></tr>
</table>
<!--<![endif]-->`
}

const STYLE = `
:root{color-scheme:light dark;supported-color-schemes:light dark;}
body{margin:0!important;padding:0!important;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;}
img{border:0;line-height:100%;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}
a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;}
@media only screen and (max-width:480px){
.rc-outer{padding:16px 10px 28px!important;}
.rc-pad{padding-left:20px!important;padding-right:20px!important;}
.rc-amount{display:none!important;}
.rc-amount-under{display:block!important;max-height:none!important;overflow:visible!important;}
.rc-btn-wrap{width:100%!important;}
.rc-btn-a{display:block!important;}
}
@media (prefers-color-scheme: dark){
.rc-bg{background-color:#111114!important;}
.rc-card{background-color:#1c1c21!important;border-color:#2c2c33!important;}
.rc-ink{color:#fafafa!important;}
.rc-muted,.rc-foot{color:#a1a1aa!important;}
.rc-link{color:#e4e4e7!important;}
.rc-rule{border-color:#2f2f37!important;}
.rc-thumb,.rc-tile{border-color:#3a3a43!important;}
.rc-tile{background-color:#26262d!important;color:#a1a1aa!important;}
.rc-btn{background-color:#f4f4f5!important;}
.rc-btn-a{color:${INK}!important;border-bottom-color:#d4d4d8!important;}
}
[data-ogsc] .rc-ink{color:#fafafa!important;}
[data-ogsc] .rc-muted,[data-ogsc] .rc-foot{color:#a1a1aa!important;}
[data-ogsc] .rc-link{color:#e4e4e7!important;}
[data-ogsc] .rc-btn-a{color:${INK}!important;}
[data-ogsb] .rc-bg{background-color:#111114!important;}
[data-ogsb] .rc-card{background-color:#1c1c21!important;}
[data-ogsb] .rc-tile{background-color:#26262d!important;}
[data-ogsb] .rc-btn{background-color:#f4f4f5!important;}`

export function buyerReceiptEmailHtml(m: ReceiptEmailModel): string {
  const sellerPlain = safeText(m.sellerName) || PLATFORM_BRAND_NAME
  const seller = escapeHtml(sellerPlain)
  const first = escapeHtml(safeName(m.firstName) || "there")
  const link = escapeHtml(m.link)
  const support = escapeHtml(m.supportEmail)
  const cell = `border-top:1px solid ${RULE};font-family:${FONT};`

  const itemRows = m.items
    .map(
      (it) => `<tr>
<td class="rc-rule" width="${THUMB_PX + 16}" valign="top" style="${cell}width:${THUMB_PX + 16}px;padding:16px 16px 16px 0;vertical-align:top;">${thumbnail(safeText(it.title), it.thumbnailUrl)}</td>
<td class="rc-rule" valign="top" style="${cell}padding:16px 0;vertical-align:top;">
<div class="rc-ink" style="font-size:15px;line-height:21px;font-weight:600;color:${INK};">${escapeHtml(safeText(it.title))}</div>
${it.variantName ? `<div class="rc-muted" style="font-size:13px;line-height:19px;color:${MUTED};margin-top:2px;">${escapeHtml(safeText(it.variantName))}</div>` : ""}
${it.note ? `<div style="font-size:13px;line-height:19px;color:#b91c1c;margin-top:2px;">${escapeHtml(it.note)}</div>` : ""}
<div class="rc-amount-under rc-ink" style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:14px;line-height:20px;font-weight:600;color:${INK};margin-top:6px;">${escapeHtml(it.amountText)}</div>
</td>
<td class="rc-rule rc-amount rc-ink" valign="top" style="${cell}padding:16px 0 16px 12px;vertical-align:top;text-align:right;white-space:nowrap;font-size:14px;line-height:21px;font-weight:600;color:${INK};">${escapeHtml(it.amountText)}</td>
</tr>`,
    )
    .join("\n")

  const sumRow = (label: string, value: string, strong = false) => `<tr>
<td class="${strong ? "rc-ink" : "rc-muted"}" style="padding:4px 0;font-family:${FONT};font-size:14px;line-height:20px;color:${strong ? INK : MUTED};${strong ? "font-weight:700;" : ""}">${escapeHtml(label)}</td>
<td class="rc-ink" style="padding:4px 0;font-family:${FONT};font-size:14px;line-height:20px;text-align:right;color:${INK};${strong ? "font-weight:700;" : ""}">${escapeHtml(value)}</td>
</tr>`

  const preheader = `Order ${m.orderNumber} from ${sellerPlain}, ${m.totalText}`

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<meta name="referrer" content="no-referrer">
<title>Your receipt from ${seller}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>${STYLE}
</style>
</head>
<body class="rc-bg" style="margin:0;padding:0;background-color:#f8f9fa;word-spacing:normal;">
<div class="rc-preheader" style="display:none;font-size:1px;color:#f8f9fa;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}${"&#8199;&#65279;&#847; ".repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="rc-bg" style="width:100%;background-color:#f8f9fa;">
<tr><td align="center" class="rc-outer" style="padding:32px 16px 40px;">
<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">
<tr><td class="rc-card" style="background-color:#ffffff;border:1px solid #eceef1;border-radius:14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td class="rc-pad" style="padding:32px 36px 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="padding-right:12px;vertical-align:middle;">${sellerMark(sellerPlain, m.sellerPicture)}</td>
<td class="rc-ink" style="vertical-align:middle;font-family:${FONT};font-size:15px;line-height:20px;font-weight:600;color:${INK};">${seller}</td>
</tr></table>
</td></tr>
<tr><td class="rc-pad" style="padding:24px 36px 0;font-family:${FONT};">
<h1 class="rc-ink" style="margin:0;font-size:22px;line-height:29px;font-weight:700;color:${INK};">${m.heading ? escapeHtml(m.heading) : `Thanks for your order, ${first}`}</h1>
<p class="rc-muted" style="margin:6px 0 0;font-size:14px;line-height:20px;color:${MUTED};">Order ${escapeHtml(m.orderNumber)} &middot; ${escapeHtml(m.dateText)}</p>
${m.introHtml ? `<p class="rc-ink" style="margin:14px 0 0;font-size:14px;line-height:22px;color:${INK};">${m.introHtml}</p>` : ""}
</td></tr>
<tr><td class="rc-pad" style="padding:20px 36px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
${itemRows}
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="rc-rule" style="width:100%;border-top:1px solid ${RULE};">
<tr><td colspan="2" style="height:8px;line-height:8px;font-size:0;">&nbsp;</td></tr>
${m.subtotalText ? sumRow("Subtotal", m.subtotalText) : ""}
${m.tipText ? sumRow("Tip", m.tipText) : ""}
${m.taxText && !m.taxIncluded ? sumRow(taxName(m), m.taxText) : ""}
${sumRow("Total", m.totalText, true)}
${m.taxText && m.taxIncluded ? sumRow(includedName(m), m.taxText) : ""}
${m.refundedText ? sumRow("Refunded", m.refundedText) : ""}
</table>
${documentLine(m)?.html ?? ""}
</td></tr>
<tr><td class="rc-pad" style="padding:28px 36px 0;">
${button(m.buttonLabel, link)}
</td></tr>
<tr><td class="rc-pad" style="padding:16px 36px 32px;font-family:${FONT};">
<p class="rc-muted" style="margin:0;font-size:13px;line-height:20px;color:${MUTED};">The button opens your receipt with the files, on any device, so keep this email. If it does not open, paste this address into your browser:</p>
<p class="rc-muted" style="margin:6px 0 0;font-size:12px;line-height:18px;color:${MUTED};word-break:break-all;">${link}</p>
<p class="rc-muted" style="margin:18px 0 0;font-size:13px;line-height:20px;color:${MUTED};">Questions about the order? Reply to this email to reach ${seller}, or write to <a class="rc-link" href="mailto:${support}" style="color:${INK};text-decoration:underline;">${support}</a>.</p>
</td></tr>
</table>
</td></tr>
<tr><td align="center" class="rc-foot" style="padding:18px 16px 0;font-family:${FONT};font-size:12px;line-height:18px;color:#9ca3af;">${legalHtml(m) || `Sold by ${seller} through ${PLATFORM_BRAND_NAME}`}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`
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

function legalHtml(m: ReceiptEmailModel): string {
  const t = legalText(m)
  return t ? `${escapeHtml(t)}<br>Through ${PLATFORM_BRAND_NAME}` : ""
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
