/**
 * ===========================================================================
 *  THE ONE LAYOUT STORELIB'S OWN NOTIFICATION EMAILS ARE DRAWN IN
 * ===========================================================================
 * Not a creator's store email (that is lib/email-campaigns/template.ts): this
 * is Storelib writing to the people who use it. Every notification type is a
 * Message (plain text pieces, see catalog.ts) poured into this one layout.
 * The families differ only by small accents, never by structure:
 *
 *   base             plain card
 *   action_required  a thin amber line on the card and a quiet "Action needed"
 *                    label; one clear button
 *   success          a thin green line
 *   security         a "Security notice" label, the time, and a boxed "If this
 *                    was not you" with a link to account settings. Never an
 *                    unsubscribe link.
 *   transaction      a facts table (amount, product, date)
 *   receipt          a facts table and "keep this email for your records"
 *   digest           a "Summary" label and a facts table
 *   lifecycle        a gentle reminder; says it can be turned off
 *   marketing        always carries the unsubscribe link when one is given
 *
 * What an inbox needs, and how each is done (the same approach as the creator
 * layout, so both behave the same in the same clients):
 *
 *   width       a fluid table, 100% wide up to 600px, with a fixed 600px table
 *               around it only for Outlook on Windows. It fits a phone with no
 *               media query; the query only trims the padding.
 *   styles      inline. <style> adds dark mode and phone padding only.
 *   dark mode   color-scheme light dark, a dark palette for Apple Mail and
 *               Outlook.com ([data-ogsc]). The button turns over: near black
 *               with white words on the light card, near white with black
 *               words on the dark one. Measured, because a dark button on a
 *               dark card came out at 1.19:1 against it, which is a button
 *               nobody can see (scripts/check-notify-emails.mjs).
 *   preheader   hidden, followed by spacers.
 *   button      a padded table cell around a link, so the whole button is a
 *               target and it renders without images or VML.
 *   text        renderText writes the same message as readable plain text with
 *               every link spelled out; it is not stripped HTML.
 *
 * Every value that reaches the HTML is escaped here. Links arrive already
 * checked (escape.ts actionUrl / sameSiteUrl) and are escaped again for the
 * attribute.
 */
import type { TemplateFamily } from "../types"
import { escapeAttr, escapeHtml } from "./escape"
import { STORELIB_EMAIL_LOGO, STORELIB_LOGO_SHADOW, storelibAssetUrl } from "@/lib/brand/logo"

/**
 * The Storelib logo every platform email uses (lib/email.tsx too): a PNG,
 * because Outlook has no webp, with its 7px corners cut into the file,
 * because Outlook on Windows ignores border-radius. From storelib.com itself.
 */
export const EMAIL_LOGO_URL = storelibAssetUrl(STORELIB_EMAIL_LOGO)

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

export interface Fact {
  label: string
  value: string
}

export interface Link {
  label: string
  url: string
}

/** A row of money under an order's items: "Subtotal", "Discount (SPRING)", "Total". */
export interface SummaryRow {
  label: string
  value: string
  strong?: boolean
}

/**
 * An order drawn as a store platform draws one: a header with the number and
 * the time, one row per item, the totals, what the seller receives, then
 * small sections of facts (the customer, the payment).
 */
export interface OrderSummary {
  title: string
  subtitle?: string | null
  lines: { title: string; detail?: string | null; amount: string }[]
  totals: SummaryRow[]
  payout?: SummaryRow[]
  sections?: { title: string; rows: Fact[] }[]
}

/** One thing the email is about: a picture, a name, and a line under it. */
export interface Media {
  title: string
  subtitle?: string | null
  /** An absolute https address, already sized for an inbox. Null draws the letter tile. */
  imageUrl?: string | null
}

/** Everything the layout draws. Plain text only; the layout escapes it. */
export interface LayoutInput {
  family: TemplateFamily
  subject: string
  preview: string
  heading: string
  greeting?: string | null
  paragraphs: string[]
  facts?: Fact[]
  /**
   * What the email is about, drawn as one small card under the heading: the
   * product a review is asked about, by its picture, its name and who made
   * it. No picture draws a tile with the title's first letter, never a
   * broken image.
   */
  media?: Media | null
  /** An order summary, drawn after the paragraphs (a sale). */
  order?: OrderSummary | null
  action?: Link | null
  /** Five linked stars above the button: each opens the review form with that many chosen. */
  rate?: { label: string; links: Link[] } | null
  /** A quiet text link under the button: "Reply to the customer". */
  secondary?: Link | null
  /** A boxed note under the button: the security "If this was not you". */
  notice?: { title: string; text: string; link?: Link | null } | null
  /** A small grey line after everything: "You can turn these reminders off in settings." */
  note?: string | null
  /** Why the reader gets this, one sentence, in the footer. */
  reason: string
  homeUrl: string
  unsubscribeUrl?: string | null
  /** What the unsubscribe link says, when it turns off one kind of email rather than all of them. */
  unsubscribeLabel?: string | null
  preferencesUrl?: string | null
}

interface FamilyStyle {
  /** The thin line across the top of the card. */
  accent: string | null
  /** A small label above the heading, sentence case. */
  label: string | null
  labelColor: string
  /** May a footer carry an unsubscribe link at all. */
  unsubscribable: boolean
}

export const FAMILY_STYLES: Record<TemplateFamily, FamilyStyle> = {
  base: { accent: null, label: null, labelColor: "#6b7280", unsubscribable: true },
  action_required: { accent: "#d97706", label: "Action needed", labelColor: "#b45309", unsubscribable: true },
  success: { accent: "#16a34a", label: null, labelColor: "#15803d", unsubscribable: true },
  security: { accent: "#475569", label: "Security notice", labelColor: "#475569", unsubscribable: false },
  transaction: { accent: null, label: null, labelColor: "#6b7280", unsubscribable: true },
  receipt: { accent: null, label: "Receipt", labelColor: "#6b7280", unsubscribable: false },
  digest: { accent: null, label: "Summary", labelColor: "#6b7280", unsubscribable: true },
  lifecycle: { accent: null, label: null, labelColor: "#6b7280", unsubscribable: true },
  marketing: { accent: null, label: null, labelColor: "#6b7280", unsubscribable: true },
}

/** Whether a footer shows the unsubscribe link for this family and context. */
export function showsUnsubscribe(family: TemplateFamily, unsubscribeUrl?: string | null): boolean {
  return Boolean(unsubscribeUrl) && FAMILY_STYLES[family].unsubscribable
}

const STYLE = `
:root{color-scheme:light dark;supported-color-schemes:light dark;}
body{margin:0!important;padding:0!important;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;}
img{border:0;line-height:100%;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}
a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;}
@media only screen and (max-width:620px){
.sn-outer{padding:20px 12px 28px!important;}
.sn-pad{padding:28px 22px!important;}
.sn-head{padding:0 6px 16px!important;}
.sn-h1{font-size:20px!important;line-height:28px!important;}
.sn-btn a{display:block!important;}
.sn-media-pad{padding:12px 14px!important;}
.sn-btn-wrap{width:100%!important;}
}
@media (prefers-color-scheme: dark){
.sn-bg{background-color:#111114!important;}
.sn-card{background-color:#1c1c21!important;border-color:#2c2c33!important;}
.sn-body,.sn-body p,.sn-body td{color:#e4e4e7!important;}
.sn-h1,.sn-mark{color:#fafafa!important;}
.sn-muted,.sn-foot,.sn-foot a{color:#a1a1aa!important;}
.sn-facts{border-color:#34343c!important;}
.sn-facts td{border-color:#34343c!important;}
.sn-notice{background-color:#26262c!important;border-color:#34343c!important;}
.sn-btn{background-color:#fafafa!important;}
.sn-btn a{color:#111114!important;}
.sn-link{color:#e4e4e7!important;}
.sn-media{border-color:#34343c!important;}
.sn-tile{background-color:#34343c!important;color:#d4d4d8!important;}
.sn-ord{border-color:#34343c!important;}
.sn-ord td{border-color:#34343c!important;}
.sn-ord-head,.sn-ord-pay{background-color:#26262c!important;}
.sn-strong{color:#fafafa!important;}
}
[data-ogsc] .sn-body,[data-ogsc] .sn-body p,[data-ogsc] .sn-body td{color:#e4e4e7!important;}
[data-ogsc] .sn-h1,[data-ogsc] .sn-mark{color:#fafafa!important;}
[data-ogsc] .sn-muted,[data-ogsc] .sn-foot,[data-ogsc] .sn-foot a{color:#a1a1aa!important;}
[data-ogsc] .sn-link{color:#e4e4e7!important;}
[data-ogsc] .sn-media{border-color:#34343c!important;}
[data-ogsb] .sn-tile{background-color:#34343c!important;}
[data-ogsc] .sn-strong{color:#fafafa!important;}
[data-ogsb] .sn-ord-head,[data-ogsb] .sn-ord-pay{background-color:#26262c!important;}
[data-ogsb] .sn-bg{background-color:#111114!important;}
[data-ogsb] .sn-card{background-color:#1c1c21!important;}
[data-ogsb] .sn-notice{background-color:#26262c!important;}
[data-ogsb] .sn-btn{background-color:#fafafa!important;}
[data-ogsc] .sn-btn a{color:#111114!important;}`

function preheader(text: string): string {
  const t = text.replace(/\s+/g, " ").trim()
  if (!t) return ""
  return `<div style="display:none;font-size:1px;color:#f4f5f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(t)}${"&#8199;&#65279;&#847; ".repeat(40)}</div>`
}

function button(link: Link): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="sn-btn-wrap" style="margin:8px 0 4px;">
<tr><td class="sn-btn" align="center" bgcolor="#1a1a2e" style="background-color:#1a1a2e;border-radius:8px;mso-padding-alt:12px 24px;">
<a href="${escapeAttr(link.url)}" target="_blank" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(link.label)}</a>
</td></tr>
</table>`
}

function factsTable(facts: Fact[], labelWidth = "40%"): string {
  const rows = facts
    .map((f, i) => {
      const border = i < facts.length - 1 ? "border-bottom:1px solid #eceef1;" : ""
      return `<tr>
<td class="sn-muted" valign="top" style="padding:11px 14px;${border}font-family:${FONT};font-size:14px;line-height:20px;color:#6b7280;width:${labelWidth};">${escapeHtml(f.label)}</td>
<td valign="top" align="right" style="padding:11px 14px;${border}font-family:${FONT};font-size:14px;line-height:20px;color:#111827;font-weight:600;text-align:right;word-break:break-word;">${escapeHtml(f.value)}</td>
</tr>`
    })
    .join("\n")
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="sn-facts" style="width:100%;margin:4px 0 20px;border:1px solid #eceef1;border-radius:8px;border-collapse:separate;">
${rows}
</table>`
}

/** The drawn size of the picture on the media card, in CSS pixels. */
export const MEDIA_PX = 64

/**
 * WHAT THE EMAIL IS ABOUT, IN ONE ROW. A picture on the left at a fixed
 * 64px, the name and the maker on the right. Two cells of one table, so
 * Outlook on Windows draws it as a row and a phone still fits it. A picture
 * that is missing, an SVG, or one an inbox blocks leaves the letter tile,
 * which is drawn with a table cell rather than an image and so is always
 * there.
 */
function mediaBlock(m: Media): string {
  const cell = `font-family:${FONT};`
  const initial = (Array.from(m.title.trim())[0] || "\u2022").toUpperCase()
  const picture = m.imageUrl
    ? `<img src="${escapeAttr(m.imageUrl)}" alt="${escapeAttr(m.title)}" width="${MEDIA_PX}" height="${MEDIA_PX}" class="sn-pic" style="display:block;width:${MEDIA_PX}px;height:${MEDIA_PX}px;object-fit:cover;border:1px solid #e6e8ec;border-radius:10px;background-color:#f3f4f6;">`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="sn-tile" width="${MEDIA_PX}" height="${MEDIA_PX}" align="center" valign="middle" bgcolor="#f3f4f6" style="width:${MEDIA_PX}px;height:${MEDIA_PX}px;background-color:#f3f4f6;border:1px solid #e6e8ec;border-radius:10px;${cell}font-size:24px;line-height:${MEDIA_PX}px;font-weight:700;color:#9ca3af;text-align:center;">${escapeHtml(initial)}</td></tr></table>`
  const subtitle = m.subtitle
    ? `\n<p class="sn-muted" style="margin:3px 0 0;${cell}font-size:14px;line-height:20px;color:#6b7280;">${escapeHtml(m.subtitle)}</p>`
    : ""
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="sn-media" style="width:100%;margin:2px 0 22px;border:1px solid #eceef1;border-radius:10px;border-collapse:separate;">
<tr>
<td class="sn-media-pad" width="${MEDIA_PX + 2}" valign="middle" style="width:${MEDIA_PX + 2}px;padding:14px 0 14px 14px;">${picture}</td>
<td class="sn-media-pad" valign="middle" style="padding:14px 16px;">
<p class="sn-strong" style="margin:0;${cell}font-size:16px;line-height:23px;font-weight:700;color:#111827;word-break:break-word;">${escapeHtml(m.title)}</p>${subtitle}
</td>
</tr>
</table>`
}

function orderBlock(o: OrderSummary): string {
  const cell = `font-family:${FONT};font-size:14px;line-height:20px;`
  const head = `<tr><td class="sn-ord-head" colspan="2" style="padding:14px 16px;background-color:#f8f9fa;border-bottom:1px solid #eceef1;border-radius:8px 8px 0 0;">
<p class="sn-strong" style="margin:0;${cell}font-size:15px;font-weight:700;color:#111827;">${escapeHtml(o.title)}</p>${
    o.subtitle ? `\n<p class="sn-muted" style="margin:2px 0 0;${cell}font-size:13px;line-height:19px;color:#6b7280;">${escapeHtml(o.subtitle)}</p>` : ""
  }
</td></tr>`
  const lines = o.lines
    .map(
      (l) => `<tr>
<td valign="top" style="padding:14px 8px 14px 16px;border-bottom:1px solid #eceef1;${cell}color:#111827;word-break:break-word;">
<span class="sn-strong" style="font-weight:600;color:#111827;">${escapeHtml(l.title)}</span>${
        l.detail ? `<br><span class="sn-muted" style="font-size:13px;line-height:19px;color:#6b7280;">${escapeHtml(l.detail)}</span>` : ""
      }
</td>
<td valign="top" align="right" style="padding:14px 16px 14px 8px;border-bottom:1px solid #eceef1;${cell}color:#111827;white-space:nowrap;text-align:right;">${escapeHtml(l.amount)}</td>
</tr>`,
    )
    .join("\n")
  const row = (r: SummaryRow, top: string, pad: string, tint = false, last = false) => {
    const bg = tint ? "background-color:#fafbfc;" : ""
    const cls = tint ? " sn-ord-pay" : ""
    const left = last ? "border-radius:0 0 0 8px;" : ""
    const right = last ? "border-radius:0 0 8px 0;" : ""
    return `<tr>
<td class="${r.strong ? "sn-strong" : "sn-muted"}${cls}" style="padding:${pad};${top}${bg}${left}${cell}color:${r.strong ? "#111827" : "#6b7280"};${r.strong ? "font-weight:700;" : ""}">${escapeHtml(r.label)}</td>
<td align="right" class="sn-strong${cls}" style="padding:${pad};${top}${bg}${right}${cell}color:#111827;text-align:right;white-space:nowrap;${r.strong ? "font-weight:700;" : ""}">${escapeHtml(r.value)}</td>
</tr>`
  }
  /* Totals: the strong row (Total) is set off by a line; the first and last rows get the box's breathing room. */
  const totals = o.totals
    .map((r, i) => {
      const divider = Boolean(r.strong) && i > 0
      const top = divider ? "10px" : i === 0 ? "12px" : "3px"
      const bottom = i === o.totals.length - 1 ? "12px" : "3px"
      return row(r, divider ? "border-top:1px solid #eceef1;" : "", `${top} 16px ${bottom}`)
    })
    .join("\n")
  /* What the seller receives, on a faint tint under the totals. */
  const payout = o.payout ?? []
  const payoutRows = payout
    .map((r, i) => {
      const top = i === 0 ? "12px" : "3px"
      const bottom = i === payout.length - 1 ? "12px" : "3px"
      return row(r, i === 0 ? "border-top:1px solid #eceef1;" : "", `${top} 16px ${bottom}`, true, i === payout.length - 1)
    })
    .join("\n")
  const box = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="sn-ord" style="width:100%;margin:4px 0 20px;border:1px solid #eceef1;border-radius:8px;border-collapse:separate;">
${head}
${lines}
${totals}
${payoutRows}
</table>`
  const sections = (o.sections ?? [])
    .filter((sec) => sec.rows.length > 0)
    .map(
      (sec) => `<p class="sn-muted" style="margin:0 0 6px;font-family:${FONT};font-size:13px;line-height:18px;font-weight:600;color:#6b7280;">${escapeHtml(sec.title)}</p>
${factsTable(sec.rows, "30%")}`,
    )
    .join("\n")
  return box + sections
}

function noticeBox(n: NonNullable<LayoutInput["notice"]>): string {
  const link = n.link
    ? `<p style="margin:8px 0 0;font-family:${FONT};font-size:14px;line-height:21px;"><a class="sn-link" href="${escapeAttr(n.link.url)}" target="_blank" style="color:#1a1a2e;text-decoration:underline;font-weight:600;">${escapeHtml(n.link.label)}</a></p>`
    : ""
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:4px 0 20px;">
<tr><td class="sn-notice" style="padding:16px 18px;background-color:#f8f9fa;border:1px solid #eceef1;border-radius:8px;">
<p style="margin:0 0 4px;font-family:${FONT};font-size:14px;line-height:21px;font-weight:600;color:#111827;">${escapeHtml(n.title)}</p>
<p style="margin:0;font-family:${FONT};font-size:14px;line-height:21px;color:#374151;">${escapeHtml(n.text)}</p>
${link}
</td></tr>
</table>`
}

function footerLinks(input: LayoutInput): Link[] {
  if (!showsUnsubscribe(input.family, input.unsubscribeUrl)) return []
  const links: Link[] = []
  if (input.preferencesUrl) links.push({ label: "Notification settings", url: input.preferencesUrl })
  /* A buyer's link turns off one kind of email, so it says which one rather than "Unsubscribe". */
  links.push({ label: input.unsubscribeLabel || "Unsubscribe", url: input.unsubscribeUrl as string })
  return links
}

/** The whole email as HTML. */
export function renderHtml(input: LayoutInput): string {
  const style = FAMILY_STYLES[input.family]
  const P = (text: string) =>
    `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:25px;color:#1f2937;">${escapeHtml(text)}</p>`
  const accent = style.accent
    ? `<tr><td height="4" style="height:4px;line-height:4px;font-size:0;background-color:${style.accent};border-radius:12px 12px 0 0;">&nbsp;</td></tr>`
    : ""
  const label = style.label
    ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:13px;line-height:18px;font-weight:600;color:${style.labelColor};">${escapeHtml(style.label)}</p>`
    : ""
  const greeting = input.greeting ? P(input.greeting) : ""
  const facts = input.facts && input.facts.length > 0 ? factsTable(input.facts) : ""
  const media = input.media && input.media.title ? mediaBlock(input.media) : ""
  const order = input.order ? orderBlock(input.order) : ""
  const action = input.action ? button(input.action) : ""
  /* Big enough to press on a phone (44px cells), amber like the stars on the page, plain text characters so they draw with images off. */
  const rate =
    input.rate && input.rate.links.length === 5
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 6px;"><tr>${input.rate.links
          .map(
            (l) =>
              `<td align="center" style="padding:0 2px;"><a href="${escapeAttr(l.url)}" target="_blank" title="${escapeAttr(l.label)}" aria-label="${escapeAttr(l.label)}" style="display:block;width:44px;height:44px;font-family:${FONT};font-size:34px;line-height:44px;color:#f5a524;text-decoration:none;">&#9733;</a></td>`,
          )
          .join("")}</tr></table>
<p class="sn-muted" style="margin:0 0 20px;font-family:${FONT};font-size:13px;line-height:19px;color:#6b7280;">${escapeHtml(input.rate.label)}</p>`
      : ""
  const secondary = input.secondary
    ? `<p style="margin:14px 0 0;font-family:${FONT};font-size:14px;line-height:21px;"><a class="sn-link" href="${escapeAttr(input.secondary.url)}" style="color:#1a1a2e;text-decoration:underline;font-weight:600;">${escapeHtml(input.secondary.label)}</a></p>`
    : ""
  const fallback = input.action
    ? `<p class="sn-muted" style="margin:14px 0 0;font-family:${FONT};font-size:13px;line-height:19px;color:#6b7280;word-break:break-all;">Or open this link: <a class="sn-link" href="${escapeAttr(input.action.url)}" target="_blank" style="color:#1a1a2e;text-decoration:underline;">${escapeHtml(input.action.url)}</a></p>`
    : ""
  const notice = input.notice ? noticeBox(input.notice) : ""
  const note = input.note
    ? `<p class="sn-muted" style="margin:20px 0 0;font-family:${FONT};font-size:13px;line-height:19px;color:#6b7280;">${escapeHtml(input.note)}</p>`
    : ""
  const links = footerLinks(input)
  const linkLine = links.length
    ? `<br><br>${links.map((l) => `<a href="${escapeAttr(l.url)}" target="_blank" style="color:#6b7280;text-decoration:underline;">${escapeHtml(l.label)}</a>`).join(`&nbsp;&nbsp;&middot;&nbsp;&nbsp;`)}`
    : ""

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(input.subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>${STYLE}
</style>
</head>
<body class="sn-bg" style="margin:0;padding:0;background-color:#f4f5f7;word-spacing:normal;">
${preheader(input.preview)}
<div role="article" aria-roledescription="email" aria-label="${escapeAttr(input.subject)}" lang="en" class="sn-bg" style="background-color:#f4f5f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="sn-bg" style="width:100%;background-color:#f4f5f7;">
<tr><td align="center" class="sn-outer" style="padding:32px 16px 40px;">
<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">
<tr><td class="sn-head" align="left" style="padding:0 4px 18px;">
<a href="${escapeAttr(input.homeUrl)}" target="_blank" style="text-decoration:none;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="vertical-align:middle;"><img class="sn-logo" src="${EMAIL_LOGO_URL}" alt="" width="28" height="28" style="display:block;width:28px;height:28px;border:0;outline:none;border-radius:7px;box-shadow:${STORELIB_LOGO_SHADOW};"></td>
<td class="sn-mark" style="vertical-align:middle;padding-left:10px;font-family:${FONT};font-size:17px;line-height:24px;font-weight:700;color:#111827;letter-spacing:-0.2px;">Storelib</td>
</tr></table>
</a>
</td></tr>
<tr><td class="sn-card" style="background-color:#ffffff;border:1px solid #eceef1;border-radius:12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
${accent}
<tr><td class="sn-pad sn-body" style="padding:36px 40px 36px;font-family:${FONT};font-size:16px;line-height:25px;color:#1f2937;word-break:break-word;">
${label}<h1 class="sn-h1" style="margin:0 0 18px;font-family:${FONT};font-size:22px;line-height:30px;font-weight:700;color:#111827;letter-spacing:-0.3px;">${escapeHtml(input.heading)}</h1>
${greeting}${media}${input.paragraphs.map(P).join("\n")}
${facts}${order}${notice}${rate}${action}${secondary}${fallback}${note}
</td></tr>
</table>
</td></tr>
<tr><td align="center" class="sn-foot" style="padding:24px 16px 0;font-family:${FONT};font-size:12px;line-height:18px;color:#6b7280;">
<strong style="font-weight:600;">Storelib</strong><br>${escapeHtml(input.reason)}${linkLine}
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</div>
</body>
</html>`
}

/** The same message as plain text: readable on its own, every link written out. */
export function renderText(input: LayoutInput): string {
  const style = FAMILY_STYLES[input.family]
  const blocks: string[] = []
  blocks.push(style.label ? `${style.label}: ${input.heading}` : input.heading)
  if (input.greeting) blocks.push(input.greeting)
  if (input.media && input.media.title) blocks.push([input.media.title, input.media.subtitle].filter(Boolean).join("\n"))
  blocks.push(...input.paragraphs)
  if (input.facts && input.facts.length) blocks.push(input.facts.map((f) => `${f.label}: ${f.value}`).join("\n"))
  if (input.order) {
    const o = input.order
    blocks.push([o.title, o.subtitle].filter(Boolean).join("\n"))
    blocks.push(o.lines.map((l) => `${l.title}${l.detail ? ` (${l.detail})` : ""}: ${l.amount}`).join("\n"))
    const money = [...o.totals, ...(o.payout ?? [])]
    if (money.length) blocks.push(money.map((r) => `${r.label}: ${r.value}`).join("\n"))
    for (const sec of o.sections ?? []) {
      if (sec.rows.length) blocks.push([sec.title, ...sec.rows.map((f) => `${f.label}: ${f.value}`)].join("\n"))
    }
  }
  if (input.notice) {
    const lines = [input.notice.title, input.notice.text]
    if (input.notice.link) lines.push(`${input.notice.link.label}: ${input.notice.link.url}`)
    blocks.push(lines.join("\n"))
  }
  if (input.rate && input.rate.links.length) {
    blocks.push([input.rate.label, ...input.rate.links.map((l) => `${l.label}: ${l.url}`)].join("\n"))
  }
  if (input.action) blocks.push(`${input.action.label}:\n${input.action.url}`)
  if (input.secondary) blocks.push(`${input.secondary.label}: ${input.secondary.url.replace(/^mailto:/, "").replace(/\?.*$/, "")}`)
  if (input.note) blocks.push(input.note)
  const foot = ["--", "Storelib", input.reason]
  for (const l of footerLinks(input)) foot.push(`${l.label}: ${l.url}`)
  blocks.push(foot.join("\n"))
  return blocks.join("\n\n") + "\n"
}
