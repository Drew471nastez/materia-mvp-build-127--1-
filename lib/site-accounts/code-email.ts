/**
 * The email a creator's website sends with a sign in code. From the store,
 * by name (lib/site-accounts/brand.ts), so the visitor recognises the shop
 * they were on; the same words whether the address has an account there or
 * not, so the email never says which.
 *
 * Pure, so tests/site-accounts.test.ts reads exactly what is sent.
 */

export interface CodeEmail {
  subject: string
  html: string
  text: string
  /** The display name the email is sent from. */
  fromName: string
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)
}

/** A store name fit for a From header and a subject line: one line, no angle brackets, at most 80 characters. */
function oneLine(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "this store"
}

export function codeEmail(input: { store: string; code: string; host: string; minutes: number }): CodeEmail {
  const store = oneLine(input.store)
  const code = input.code.replace(/\D/g, "").slice(0, 6)
  const site = input.host.split(":")[0].replace(/^www\./, "")
  const subject = `${code} is your code for ${store}`
  const text = [
    `Your code to sign in to ${store}:`,
    "",
    code,
    "",
    `It works once, for ${input.minutes} minutes, on ${site}.`,
    "If you did not ask for it, you can ignore this email.",
  ].join("\n")
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f8f9fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a2e;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8f9fa;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:440px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">
        <tr><td style="padding:28px 28px 8px;">
          <p style="margin:0 0 16px;font-size:15px;font-weight:600;">${escapeHtml(store)}</p>
          <p style="margin:0;font-size:15px;line-height:1.5;color:#374151;">Your code to sign in:</p>
        </td></tr>
        <tr><td style="padding:8px 28px 4px;">
          <p style="margin:0;font-size:32px;line-height:1.2;font-weight:700;letter-spacing:6px;font-family:'SF Mono',Menlo,Consolas,monospace;">${escapeHtml(code)}</p>
        </td></tr>
        <tr><td style="padding:12px 28px 28px;">
          <p style="margin:0 0 6px;font-size:14px;line-height:1.5;color:#6b7280;">It works once, for ${input.minutes} minutes, on ${escapeHtml(site)}.</p>
          <p style="margin:0;font-size:14px;line-height:1.5;color:#6b7280;">If you did not ask for it, you can ignore this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
  return { subject, html, text, fromName: store }
}
