/**
 * ===========================================================================
 *  WHAT EVERY AUTOMATED EMAIL A CREATOR SENDS MUST CARRY
 * ===========================================================================
 * A creator's automations (the welcome email on the Emails page, and the one
 * after a purchase) are marketing email from that creator to a person on
 * their list. Two things were missing from every one of them:
 *
 *   a way out     no unsubscribe link and no List-Unsubscribe header, which
 *                 the law requires of marketing email and which Gmail and
 *                 Yahoo require of any bulk sender before they will deliver
 *   a check       a delayed email was queued at sign-up and sent days later
 *                 whether or not the person had unsubscribed in between
 *
 * Both the immediate send (triggerEmailFlows in lib/email.tsx) and the
 * delayed one (app/api/cron/process-scheduled-emails) go through here, so
 * they cannot drift apart again.
 */

export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://storelib.com").replace(/\/$/, "")

/** Statuses that mean "do not email this person", however they got there. */
const SUPPRESSED = new Set(["unsubscribed", "bounced", "complained", "cleaned"])

export interface Standing {
  /** True when this address must not get an automated email from this creator. */
  suppressed: boolean
  /** Their unsubscribe token, when they are on the list. */
  unsubscribeToken: string | null
}

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Where this address stands with this creator's list.
 *
 * An address with no row at all is not suppressed: a buyer who never joined
 * the list still gets the creator's purchase follow-up, as they always have.
 * They get no unsubscribe link either, because there is nothing to leave.
 */
export async function standingOf(db: Db, creatorId: string, email: string): Promise<Standing> {
  const { data, error } = await db
    .from("subscribers")
    .select("status, is_active, unsubscribe_token")
    .eq("creator_id", creatorId)
    .eq("email", email.toLowerCase().trim())
    .maybeSingle()
  if (error || !data) return { suppressed: false, unsubscribeToken: null }
  const status = typeof data.status === "string" ? data.status : ""
  return {
    suppressed: SUPPRESSED.has(status) || data.is_active === false,
    unsubscribeToken: typeof data.unsubscribe_token === "string" ? data.unsubscribe_token : null,
  }
}

export function unsubscribeUrlFor(token: string): string {
  return `${APP_URL}/unsubscribe?token=${encodeURIComponent(token)}`
}

/** Replaces {{name}}, {{first_name}} and the older {{customer_name}} / {{product_name}}. */
export function personalize(content: string, values: { name?: string; product?: string }): string {
  const name = (values.name || "").trim()
  const first = name.split(/\s+/)[0] || ""
  return content
    .replace(/\{\{\s*(customer_name|name)\s*\}\}/gi, escapeHtml(name || "there"))
    .replace(/\{\{\s*first_name\s*\}\}/gi, escapeHtml(first || "there"))
    .replace(/\{\{\s*product_name\s*\}\}/gi, escapeHtml(values.product || "your product"))
    /* The editor's own placeholders, typed as words in the default text. */
    .replace(/Customer Name/g, escapeHtml(name || "there"))
    .replace(/Product Name/g, escapeHtml(values.product || "your product"))
}

/** The same personalization for a subject line, which is text, not HTML. */
export function personalizeText(content: string, values: { name?: string; product?: string }): string {
  const name = (values.name || "").trim()
  const first = name.split(/\s+/)[0] || ""
  return content
    .replace(/\{\{\s*(customer_name|name)\s*\}\}/gi, name || "there")
    .replace(/\{\{\s*first_name\s*\}\}/gi, first || "there")
    .replace(/\{\{\s*product_name\s*\}\}/gi, values.product || "your product")
    .replace(/Customer Name/g, name || "there")
    .replace(/Product Name/g, values.product || "your product")
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)
}

export function stripHtml(html: string): string {
  return html
    /* A paragraph ends with a blank line after it; a line break is one. */
    .replace(/<\/(p|div|h[1-6]|ul|ol|blockquote)\s*>/gi, "\n\n")
    .replace(/<(br|\/li|\/tr)\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim()
}

/**
 * The finished email: the creator's body in a plain frame, and a footer that
 * says who it is from, why the reader got it, and how to stop.
 */
export function automationEmail(input: {
  body: string
  fromName: string
  unsubscribeToken: string | null
}): { html: string; text: string; headers?: Record<string, string> } {
  const from = escapeHtml(input.fromName.replace(/\s+/g, " ").trim() || "Storelib")
  const url = input.unsubscribeToken ? unsubscribeUrlFor(input.unsubscribeToken) : null
  const footer = url
    ? `You are getting this because you joined ${from}'s list. <a href="${escapeHtml(url)}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>`
    : `Sent by ${from}`

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background-color:#f6f9fc;">
  <table role="presentation" style="width:100%;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:34px;">
              <div style="font-size:15px;color:#374151;line-height:1.6;">
                ${input.body}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 22px;text-align:center;background:#f9fafb;color:#6b7280;font-size:12px;line-height:1.5;">
              ${footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = `${stripHtml(input.body)}${url ? `\n\n---\nUnsubscribe: ${url}` : ""}`
  const headers = url
    ? { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
    : undefined
  return { html, text, headers }
}
