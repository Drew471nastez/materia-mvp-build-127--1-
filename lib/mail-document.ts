/**
 * ===========================================================================
 *  THE LAST STEP BEFORE ANY EMAIL LEAVES
 * ===========================================================================
 * Every email Storelib sends passes lib/mailgun.ts, and lib/mailgun.ts passes
 * every body through finalizeEmailHtml. The designed emails (the receipt,
 * the notification layout, a creator's campaign) already arrive as whole
 * documents and leave unchanged. The short ones written inline in a route (a
 * password reset, a contact form message) arrived as a bare <div>, with no
 * doctype, no language and no charset: spam filters count a document without
 * them against the sender, and a client left to guess the charset can show
 * "Ã©" for "é". So:
 *
 *   a fragment      is put inside a document: doctype, <html lang="en">, a
 *                   UTF-8 charset, a viewport, the subject as its title, and
 *                   the fragment untouched as the body
 *   a document      gets whichever of those it lacks (the doctype, lang on
 *                   <html>, the charset), and nothing else changes
 *
 * Nothing is restyled: the body is the same markup it was, so an email looks
 * as it did. emailButton is the one shared piece of markup: a link drawn as a
 * button that Outlook on Windows paints too (a table cell with its own fill),
 * for the short emails that used a bare styled <a>, which Outlook shows as a
 * coloured strip behind the words.
 *
 * Pure: tests/email-document.test.ts reads it as it is.
 */

/** Gmail cuts a message off after 102 KB of HTML and hides the rest behind "View entire message". */
export const GMAIL_CLIP_BYTES = 102 * 1024

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export function finalizeEmailHtml(html: string, subject = ""): string {
  const body = String(html ?? "").trim()
  if (!body) return body
  const title = escapeText(subject.replace(/[\r\n]+/g, " ").trim())

  if (!/<html[\s>]/i.test(body)) {
    return [
      "<!DOCTYPE html>",
      '<html lang="en">',
      "<head>",
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      '<meta name="x-apple-disable-message-reformatting">',
      `<title>${title}</title>`,
      "</head>",
      "<body>",
      body,
      "</body>",
      "</html>",
    ].join("\n")
  }

  let doc = body
  if (!/^<!doctype\s+html/i.test(doc)) doc = `<!DOCTYPE html>\n${doc}`
  doc = doc.replace(/<html\b([^>]*)>/i, (tag, attrs: string) => (/\slang\s*=/i.test(attrs) ? tag : `<html lang="en"${attrs}>`))
  if (!/<meta[^>]+charset/i.test(doc)) {
    doc = /<head\b[^>]*>/i.test(doc)
      ? doc.replace(/<head\b[^>]*>/i, (head) => `${head}\n<meta charset="utf-8">`)
      : doc.replace(/<html\b[^>]*>/i, (tag) => `${tag}\n<head>\n<meta charset="utf-8">\n</head>`)
  }
  return doc
}

export interface EmailButton {
  href: string
  /** Already escaped: the words on the button. */
  label: string
  fill: string
  color?: string
  /** CSS padding, "12px 24px". */
  padding?: string
  radius?: number
  /** Extra inline CSS for the link: font size, weight, letter spacing. */
  text?: string
  align?: "left" | "center"
}

/**
 * A button every inbox draws: the fill on a table cell (bgcolor for Outlook
 * on Windows, which paints no background on a link and ignores its padding,
 * so the cell carries the padding there as mso-padding-alt), and the link
 * inside with the same padding for everyone else, so the whole button is the
 * link. The same look it had as a styled <a> in Gmail and Apple Mail.
 */
export function emailButton(b: EmailButton): string {
  const color = b.color ?? "#ffffff"
  const padding = b.padding ?? "12px 24px"
  const radius = b.radius ?? 8
  const href = b.href.replace(/"/g, "&quot;")
  const align = b.align === "center" ? ' align="center"' : ""
  const margin = b.align === "center" ? "margin:0 auto;" : ""
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${align} style="border-collapse:separate;${margin}"><tr><td align="center" bgcolor="${b.fill}" style="background-color:${b.fill};border-radius:${radius}px;mso-padding-alt:${padding};"><a href="${href}" target="_blank" style="display:inline-block;padding:${padding};border-radius:${radius}px;color:${color};text-decoration:none;${b.text ?? ""}mso-padding-alt:0;"><span style="color:${color};">${b.label}</span></a></td></tr></table>`
}
