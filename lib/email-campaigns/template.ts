/**
 * ===========================================================================
 *  THE ONE LAYOUT EVERY EMAIL A CREATOR SENDS IS DRAWN IN
 * ===========================================================================
 * A campaign, a test of one, an automated email, the preview beside the
 * composer and the copy on an email's page all come out of buildEmail, so
 * they cannot drift apart: the preview is this HTML in a sandboxed frame, not
 * a React imitation of it.
 *
 * What an inbox needs, and how each is done:
 *
 *   width        a fluid table, 100% wide up to 600px, with a fixed 600px
 *                table around it only for Outlook on Windows (which ignores
 *                max-width). No media query is needed for a phone, so the
 *                Gmail app on a non-Google account, which drops <style>,
 *                still fits the screen.
 *   styles       every one inline. The <style> block only adds dark mode
 *                and the phone padding, where it is read.
 *   dark mode    `color-scheme: light dark` and a dark palette for Apple Mail
 *                and Outlook.com ([data-ogsc]). Buttons keep their fill in
 *                both. The logo is drawn as it was uploaded, in both: no
 *                border, no padding, no plate behind it. It used to sit on a
 *                white plate in dark mode, which read as a white frame round
 *                the logo in the preview and in a dark inbox ("I don't know
 *                why there's a white border applied to the logo").
 *   preheader    the line after the subject in the inbox, hidden in the
 *                body, followed by spacers so the inbox does not fill the
 *                rest of the line with the first words of the email.
 *   pictures     https only, each with its alt text and a width attribute.
 *   footer       the creator's name and postal address, why the reader is
 *                getting it, and for marketing email a working way out. The
 *                matching List-Unsubscribe headers are the sender's job
 *                (lib/email-campaigns/queue.ts, lib/automations/run.ts).
 *   plain text   emailText, from the same body, sent as the text part.
 *
 * Pure and browser-safe. The body is trusted here: it is HTML the block and
 * rich text renderers wrote (lib/email-campaigns/blocks.ts, ./rich.ts),
 * never a creator's HTML as it arrived.
 */
import { DEFAULT_BRAND, httpsUrl, type Brand } from "./brand"
import { FONT, esc } from "./rich"
import { decodeHtmlEntities } from "@/lib/html-entities"
import { resolveVariables, variableKey, type ResolveOptions, type VariableValues } from "@/lib/email-variables"

export interface EmailFrame {
  subject: string
  previewText?: string | null
  /** Trusted email HTML: renderBlocks or richToEmail output. */
  bodyHtml: string
  brand: Brand
  /** The creator's own photo beside their name in the footer. */
  avatarUrl?: string | null
  /** Marketing email says why it came and how to stop; a receipt does not. */
  kind: "marketing" | "transactional"
  /** Why the reader is getting it, one sentence. */
  reason?: string | null
  /** The page a reader lands on to leave the list. "#" in a preview. */
  unsubscribeUrl?: string | null
  /** A 1x1 image that records the open. Left out when opens are not counted, and in tests and previews. */
  openPixelUrl?: string | null
}

/**
 * The inbox's preview line. The spacers after it (a figure space, a zero
 * width no-break space and a combining grapheme joiner, repeated) are the
 * pattern every major sender uses to keep the body out of that line.
 */
function preheader(text?: string | null): string {
  const t = (text || "").replace(/\s+/g, " ").trim()
  if (!t) return ""
  return `<div class="sl-preheader" style="display:none;font-size:1px;color:#f4f5f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(t)}${"&#8199;&#65279;&#847; ".repeat(60)}</div>`
}

function avatar(name: string, url?: string | null): string {
  const safe = httpsUrl(url)
  if (safe) {
    return `<img src="${esc(safe)}" alt="" width="28" height="28" style="display:block;width:28px;height:28px;border-radius:14px;border:0;object-fit:cover;">`
  }
  const letter = esc((name.trim()[0] || "S").toUpperCase())
  return `<div style="width:28px;height:28px;border-radius:14px;background-color:#e5e7eb;color:#374151;font-family:${FONT};font-size:13px;font-weight:600;line-height:28px;text-align:center;">${letter}</div>`
}

function header(brand: Brand): string {
  const logo = httpsUrl(brand.logoUrl)
  const store = httpsUrl(brand.storeUrl)
  const inner = logo
    ? `<img class="sl-logo" src="${esc(logo)}" alt="${esc(brand.name)}" height="40" style="display:block;height:40px;width:auto;max-width:200px;border:0;outline:none;text-decoration:none;">`
    : `<span class="sl-brand" style="font-family:${FONT};font-size:17px;line-height:24px;font-weight:700;color:#111827;text-decoration:none;">${esc(brand.name)}</span>`
  const linked = store ? `<a href="${esc(store)}" target="_blank" style="text-decoration:none;color:#111827;">${inner}</a>` : inner
  return `<tr><td align="center" style="padding:0 0 20px;">${linked}</td></tr>`
}

const DARK = `
@media (prefers-color-scheme: dark) {
.sl-bg{background-color:#111114!important;}
.sl-card{background-color:#1c1c21!important;border-color:#2c2c33!important;}
.sl-body p,.sl-body li,.sl-body ul,.sl-body ol,.sl-body blockquote{color:#e4e4e7!important;}
.sl-body h1,.sl-body h2,.sl-body h3,.sl-brand,.sl-name{color:#fafafa!important;}
.sl-body hr,.sl-rule{border-color:#34343c!important;}
.sl-product{border-color:#34343c!important;}
.sl-foot,.sl-foot a{color:#a1a1aa!important;}
.sl-btn{border:1px solid #7a7a85!important;}
}
[data-ogsc] .sl-body p,[data-ogsc] .sl-body li,[data-ogsc] .sl-body ul,[data-ogsc] .sl-body ol,[data-ogsc] .sl-body blockquote{color:#e4e4e7!important;}
[data-ogsc] .sl-body h1,[data-ogsc] .sl-body h2,[data-ogsc] .sl-body h3,[data-ogsc] .sl-brand,[data-ogsc] .sl-name{color:#fafafa!important;}
[data-ogsc] .sl-foot,[data-ogsc] .sl-foot a{color:#a1a1aa!important;}
[data-ogsb] .sl-bg{background-color:#111114!important;}
[data-ogsb] .sl-card{background-color:#1c1c21!important;}
[data-ogsb] .sl-btn{border:1px solid #7a7a85!important;}`

/** The whole email as HTML. */
export function buildEmail(f: EmailFrame): string {
  const brand = f.brand ?? DEFAULT_BRAND
  const name = esc(brand.name.trim() || "Storelib")
  const marketing = f.kind === "marketing"
  const unsubscribe = marketing ? esc(f.unsubscribeUrl || "#") : ""
  const reason = f.reason ? esc(f.reason) : marketing ? `You are getting this because you joined ${name}'s list.` : ""
  const address = brand.address ? `<br><span class="sl-address">${esc(brand.address)}</span>` : ""
  const pixel = f.openPixelUrl ? `<img src="${esc(f.openPixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;">` : ""
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
<title>${esc(f.subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
:root{color-scheme:light dark;supported-color-schemes:light dark;}
body{margin:0!important;padding:0!important;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;}
img{border:0;line-height:100%;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}
a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;}
@media only screen and (max-width:620px){
.sl-outer{padding:16px 10px 24px!important;}
.sl-pad{padding:28px 22px!important;}
}${DARK}
</style>
</head>
<body class="sl-bg" style="margin:0;padding:0;background-color:#f4f5f7;word-spacing:normal;">
${preheader(f.previewText)}
<div role="article" aria-roledescription="email" aria-label="${esc(f.subject)}" lang="en" class="sl-bg" style="background-color:#f4f5f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="sl-bg" style="width:100%;background-color:#f4f5f7;">
<tr><td align="center" class="sl-outer" style="padding:32px 16px 40px;">
<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">
${header(brand)}
<tr><td class="sl-card" style="background-color:#ffffff;border:1px solid #eceef1;border-radius:12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="sl-pad sl-body" style="padding:40px;font-family:${FONT};font-size:16px;line-height:26px;color:#1f2937;word-break:break-word;">
${f.bodyHtml}
</td></tr></table>
</td></tr>
<tr><td align="center" style="padding:24px 16px 4px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="padding-right:8px;vertical-align:middle;">${avatar(brand.name, f.avatarUrl)}</td>
<td class="sl-name" style="vertical-align:middle;font-family:${FONT};font-size:14px;font-weight:600;color:#374151;">${name}</td>
</tr></table>
</td></tr>
<tr><td align="center" class="sl-foot" style="padding:6px 16px 0;font-family:${FONT};font-size:12px;line-height:18px;color:#6b7280;">
${reason}${address}${marketing ? `<br><a href="${unsubscribe}" target="_blank" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>` : ""}
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</div>
${pixel}
</body>
</html>`
}

/**
 * The text part, from the same body: headings and paragraphs as lines,
 * lists with dashes, a link's words followed by its address, then the
 * footer the HTML has.
 */
export function emailText(f: Pick<EmailFrame, "bodyHtml" | "brand" | "kind" | "reason" | "unsubscribeUrl">): string {
  const body = f.bodyHtml
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
      const words = decodeHtmlEntities(label.replace(/<[^>]*>/g, "")).trim()
      const url = decodeHtmlEntities(href)
      if (!words || words === url || url === "#") return words || ""
      if (/^mailto:/i.test(url)) return `${words} (${url.slice(7)})`
      return `${words} (${url})`
    })
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<hr[^>]*>/gi, "\n----------\n")
    .replace(/<\/(p|div|h[1-6]|ul|ol|blockquote|table)\s*>/gi, "\n\n")
    .replace(/<(br|\/li|\/tr)\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
  const text = decodeHtmlEntities(body)
    .replace(/[ ﻿͏ ]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  const brand = f.brand ?? DEFAULT_BRAND
  const lines = [brand.name]
  if (brand.address) lines.push(brand.address)
  if (f.reason) lines.push(f.reason)
  else if (f.kind === "marketing") lines.push(`You are getting this because you joined ${brand.name}'s list.`)
  if (f.kind === "marketing" && f.unsubscribeUrl) lines.push(`Unsubscribe: ${f.unsubscribeUrl}`)
  return `${text}\n\n--\n${lines.join("\n")}`
}

/* ─── Merge fields ───────────────────────────────────────────────────── */

/**
 * The fields a creator can put in a campaign, and what each becomes: the
 * reader, the creator as they are when the email is sent, the year, the way
 * out. Filled by the one resolver automations use too (lib/email-variables),
 * which also reads the older spellings and bracket placeholders ("[Your
 * name]") and removes what it does not know. Values are escaped: a
 * subscriber who signed up as "<b>Ana" gets their name shown, not rendered.
 */
export const MERGE_FIELDS = ["first_name", "last_name", "name", "email", "creator_name", "store_name", "store_url", "current_year", "unsubscribe_url"] as const

export interface Reader {
  name?: string | null
  email?: string | null
  /** The creator's name to sign with, as their profile has it now. */
  creatorName?: string | null
  /** The store's name, logo and page as they are now (lib/email-campaigns/brand-server loadBrand). */
  storeName?: string | null
  storeUrl?: string | null
  /** This reader's own unsubscribe page. Left as {{unsubscribe_url}} when not given, for the caller to fill. */
  unsubscribeUrl?: string | null
}

function valuesOf(r: Reader): VariableValues {
  return {
    name: r.name,
    email: r.email,
    creator_name: r.creatorName,
    store_name: r.storeName,
    store_url: r.storeUrl,
    unsubscribe_url: r.unsubscribeUrl,
  }
}

function optionsOf(r: Reader): ResolveOptions {
  return { leave: r.unsubscribeUrl ? [] : ["unsubscribe_url"] }
}

export function personalizeHtml(html: string, r: Reader): string {
  return resolveVariables(html, valuesOf(r), "html", optionsOf(r))
}

export function personalizeSubject(text: string, r: Reader): string {
  return resolveVariables(text, valuesOf(r), "text", optionsOf(r))
}

/** Any {{field}} a campaign does not know, so it can be refused before it goes out as braces. */
export function unknownMergeFields(...texts: string[]): string[] {
  const out = new Set<string>()
  for (const t of texts) {
    for (const m of (t || "").matchAll(/\{\{\s*([^}|]*?)\s*(?:\|[^}]*)?\}\}/g)) {
      const key = variableKey(m[1] || "")
      if (!key || !(MERGE_FIELDS as readonly string[]).includes(key)) out.add(m[1] || "")
    }
  }
  return [...out]
}
