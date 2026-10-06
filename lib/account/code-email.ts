import { STORELIB_EMAIL_LOGO, storelibAssetUrl } from "@/lib/brand/logo"

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")

/**
 * The email that carries a one time code (signup, a new address, the current
 * address). One layout for every code Storelib sends: white on #f8f9fa, ink
 * type, the code large and on its own, no picture and no link for a filter
 * to rewrite. Readable as text, with the code on its own line.
 */
export function codeEmail({
  heading,
  lead,
  code,
  minutes,
  footer,
  /** Opens verify with the code prefilled and copied in the browser. */
  copyHref,
}: {
  heading: string
  lead: string
  code?: string
  minutes?: number
  footer: string
  copyHref?: string | null
}): { html: string; text: string } {
  const digits = code ? escapeHtml(code) : ""
  void copyHref
  const codeBlock = code
    ? `<tr>
        <td style="padding:0 32px 8px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f5f7;border:1px solid #e6e8eb;border-radius:14px;">
            <tr>
              <td align="center" style="padding:22px 16px 20px;">
                <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">Your verification code</p>
                <p style="margin:0;font-size:36px;font-weight:700;letter-spacing:0.32em;color:#1a1a2e;font-family:'SF Mono',ui-monospace,Menlo,Consolas,monospace;-webkit-user-select:all;user-select:all;">${digits}</p>
                ${minutes ? `<p style="margin:14px 0 0;font-size:13px;line-height:1.4;color:#6b7280;">Select the code to copy it. It expires in ${minutes} minutes.</p>` : `<p style="margin:14px 0 0;font-size:13px;line-height:1.4;color:#6b7280;">Select the code to copy it.</p>`}
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : ""
  const logoUrl = escapeHtml(storelibAssetUrl(STORELIB_EMAIL_LOGO))
  const html = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f8f9fa;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:480px;background-color:#ffffff;border:1px solid #e6e8eb;border-radius:16px;">
        <tr>
          <td align="center" style="padding:28px 32px 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <img src="${logoUrl}" width="40" height="40" alt="Storelib" style="display:block;width:40px;height:40px;border:0;border-radius:7px;" />
          </td>
        </tr>
        <tr>
          <td style="padding:12px 32px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <h1 style="margin:0 0 10px;font-size:22px;font-weight:700;letter-spacing:-0.03em;line-height:1.25;color:#1a1a2e;">${escapeHtml(heading)}</h1>
            <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#4b5563;">${escapeHtml(lead)}</p>
          </td>
        </tr>
        ${codeBlock}
        <tr>
          <td style="padding:16px 32px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <p style="margin:0;font-size:13px;line-height:1.55;color:#6b7280;">${escapeHtml(footer)}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`
  const text = [heading, "", lead, "", ...(code ? [code, minutes ? `This code expires in ${minutes} minutes.` : "", ""] : []), footer, "", "Storelib"].filter((line) => line !== undefined).join("\n")
  return { html, text }
}
