/**
 * ===========================================================================
 *  THE FRAME EVERY CAMPAIGN IS SENT IN
 * ===========================================================================
 * The creator's blocks sit in a 600px white card on a light grey page, and
 * under the card is the part every marketing email owes its reader: who it
 * is from, why they got it, and a working way out.
 *
 * One function for the send, the test send and the preview beside the
 * editor, so the three cannot drift apart: the preview is this HTML in an
 * iframe, not a React imitation of it.
 *
 * Pure and browser-safe. The body is trusted here: the server sanitizes it
 * before it gets this far (lib/email-campaigns/sanitize.ts), and the editor
 * renders it from its own blocks.
 */
import { escapeHtml } from "./blocks"

export interface CampaignFrame {
  subject: string
  previewText?: string | null
  bodyHtml: string
  senderName: string
  senderAvatarUrl?: string | null
  /** The page a reader lands on to leave the list. "#" in a preview. */
  unsubscribeUrl: string
  /** A 1x1 image that records the open. Left out of tests and previews. */
  trackingPixelUrl?: string | null
}

/**
 * The inbox's preview line: the text after the subject. A run of invisible
 * spacers after it stops the client filling the rest of the line with the
 * first words of the body.
 */
function preheader(text?: string | null): string {
  const t = (text || "").trim()
  if (!t) return ""
  return `<div style="display:none;font-size:1px;color:#f4f5f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(t)}${"&#8199;&#65279;&#847; ".repeat(60)}</div>`
}

function avatar(name: string, url?: string | null): string {
  const safe = typeof url === "string" && /^https:\/\//i.test(url) ? url : ""
  if (safe) {
    return `<img src="${escapeHtml(safe)}" alt="" width="32" height="32" style="display:block;width:32px;height:32px;border-radius:16px;border:0;object-fit:cover;">`
  }
  const letter = escapeHtml((name.trim()[0] || "S").toUpperCase())
  return `<div style="width:32px;height:32px;border-radius:16px;background-color:#eceef1;color:#374151;font-size:14px;font-weight:600;line-height:32px;text-align:center;">${letter}</div>`
}

export function buildCampaignEmail(f: CampaignFrame): string {
  const name = escapeHtml(f.senderName.trim() || "Storelib")
  const unsubscribe = escapeHtml(f.unsubscribeUrl || "#")
  const pixel = f.trackingPixelUrl
    ? `<img src="${escapeHtml(f.trackingPixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;">`
    : ""
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
<title>${escapeHtml(f.subject)}</title>
<style>
body{margin:0;padding:0;width:100%;background-color:#f4f5f7;-webkit-text-size-adjust:100%;}
table{border-collapse:collapse;}
img{border:0;line-height:100%;outline:none;text-decoration:none;max-width:100%;}
.sl-body p{margin:0 0 16px;}
.sl-body h1,.sl-body h2,.sl-body h3{color:#111827;}
.sl-body a{color:#111827;}
.sl-body ul,.sl-body ol{margin:0 0 16px;padding-left:24px;}
@media only screen and (max-width:620px){
.sl-card{width:100%!important;border-radius:0!important;}
.sl-pad{padding:28px 20px!important;}
.sl-outer{padding:0!important;}
}
</style>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;">
${preheader(f.previewText)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;">
<tr><td class="sl-outer" align="center" style="padding:32px 16px;">
<table role="presentation" class="sl-card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:12px;border:1px solid #eceef1;">
<tr><td class="sl-pad sl-body" style="padding:40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;color:#1f2937;word-break:break-word;">
${f.bodyHtml}
</td></tr>
</table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">
<tr><td align="center" style="padding:24px 20px 8px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="padding-right:10px;vertical-align:middle;">${avatar(f.senderName, f.senderAvatarUrl)}</td>
<td style="vertical-align:middle;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:#374151;">${name}</td>
</tr></table>
</td></tr>
<tr><td align="center" style="padding:4px 20px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#6b7280;">
You are getting this because you joined ${name}'s list.<br>
<a href="${unsubscribe}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a> &nbsp;·&nbsp; Sent with Storelib
</td></tr>
</table>
</td></tr>
</table>
${pixel}
</body>
</html>`
}

/** The text part: the same words without the markup, and the way out. */
export function campaignPlainText(bodyHtml: string, unsubscribeUrl: string): string {
  const text = bodyHtml
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
      const words = label.replace(/<[^>]*>/g, "").trim()
      const url = href.replace(/&amp;/g, "&")
      if (!words || words === url || url === "#") return words || ""
      return `${words} (${url})`
    })
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/(p|div|h[1-6]|ul|ol|blockquote|table)\s*>/gi, "\n\n")
    .replace(/<(br|\/li|\/tr)\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return `${text}\n\n---\nUnsubscribe: ${unsubscribeUrl}`
}

/**
 * The fields a creator can put in an email, and what each becomes. Values
 * are escaped: a subscriber who signed up as "<b>Ana" gets their name shown,
 * not rendered.
 */
export const MERGE_FIELDS = ["first_name", "name", "email"] as const

export interface Reader {
  name?: string | null
  email?: string | null
}

function values(r: Reader): Record<string, string> {
  const name = (r.name || "").replace(/\s+/g, " ").trim()
  return {
    name: name || "there",
    first_name: name.split(" ")[0] || "there",
    email: (r.email || "").trim(),
  }
}

export function personalizeHtml(html: string, r: Reader): string {
  const v = values(r)
  return html.replace(/\{\{\s*(first_name|name|email)\s*\}\}/gi, (_m, key: string) => escapeHtml(v[key.toLowerCase()] ?? ""))
}

export function personalizeSubject(text: string, r: Reader): string {
  const v = values(r)
  return text.replace(/\{\{\s*(first_name|name|email)\s*\}\}/gi, (_m, key: string) => v[key.toLowerCase()] ?? "").replace(/[\r\n]+/g, " ")
}

/** Any {{field}} this send does not know, so it can be refused before it goes out as braces. */
export function unknownMergeFields(...texts: string[]): string[] {
  const out = new Set<string>()
  for (const t of texts) {
    for (const m of (t || "").matchAll(/\{\{\s*([^}\s]*)\s*\}\}/g)) {
      const key = (m[1] || "").toLowerCase()
      if (!(MERGE_FIELDS as readonly string[]).includes(key) && key !== "unsubscribe_url") out.add(m[1] || "")
    }
  }
  return [...out]
}
