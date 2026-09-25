const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")

/**
 * The email that carries a one time code for a change to an account, or
 * tells the old address that a change was made. Plain, in Storelib's own
 * colours, and readable as text.
 */
export function codeEmail({
  heading,
  lead,
  code,
  minutes,
  footer,
}: {
  heading: string
  lead: string
  code?: string
  minutes?: number
  footer: string
}): { html: string; text: string } {
  const codeBlock = code
    ? `<div style="background:#f8f9fa;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:0 0 20px;text-align:center;">
         <div style="font-size:30px;font-weight:700;letter-spacing:0.18em;color:#1a1a2e;">${escapeHtml(code)}</div>
         ${minutes ? `<p style="margin:10px 0 0;color:#6b7280;font-size:12px;">Expires in ${minutes} minutes</p>` : ""}
       </div>`
    : ""
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a2e;">
  <h1 style="font-size:20px;font-weight:700;margin:0 0 12px;">${escapeHtml(heading)}</h1>
  <p style="color:#4b5563;font-size:14px;line-height:1.55;margin:0 0 20px;">${escapeHtml(lead)}</p>
  ${codeBlock}
  <p style="color:#6b7280;font-size:13px;line-height:1.55;margin:0;">${escapeHtml(footer)}</p>
</div>`
  const text = [heading, "", lead, "", ...(code ? [code, minutes ? `Expires in ${minutes} minutes.` : "", ""] : []), footer].join("\n")
  return { html, text }
}
