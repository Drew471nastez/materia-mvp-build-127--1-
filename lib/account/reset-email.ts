import { STORELIB_EMAIL_LOGO, storelibAssetUrl } from "@/lib/brand/logo"
import { emailButton } from "@/lib/mail-document"

/**
 * ===========================================================================
 *  THE PASSWORD RESET EMAIL, FOR A STORELIB ACCOUNT
 * ===========================================================================
 * Sent by /api/auth/request-password-reset (signed out, "Forgot password")
 * and /api/auth/reset-password (Settings, signed in). Both used to write
 * their own copy inline: a blue button reading "Reset Password", not the
 * Storelib layout every other account email uses (./code-email.ts), and sent
 * as an ordinary email, which put the link through click tracking and let a
 * stale bounce on the address drop it silently. It is a link somebody just
 * asked for, so the routes send it transactional.
 *
 * The link is the bridge code page (https://storelib.com/reset-password
 * ?code=…): a query string survives every mail client, and the app claims
 * that address as a universal link.
 *
 * Pure: tests/physical-w7.test.ts reads exactly what is sent.
 */

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")

export function resetPasswordEmail(input: { resetUrl: string; minutes?: number }): { subject: string; html: string; text: string } {
  const minutes = input.minutes ?? 60
  const url = input.resetUrl
  const when = minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? "" : "s"}` : `${minutes} minutes`
  const subject = "Reset your Storelib password"
  const logoUrl = escapeHtml(storelibAssetUrl(STORELIB_EMAIL_LOGO))
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
  const html = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f8f9fa;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:480px;background-color:#ffffff;border:1px solid #e6e8eb;border-radius:16px;">
        <tr>
          <td align="center" style="padding:28px 32px 4px;font-family:${font};">
            <img src="${logoUrl}" width="40" height="40" alt="Storelib" style="display:block;width:40px;height:40px;border:0;border-radius:7px;" />
          </td>
        </tr>
        <tr>
          <td style="padding:12px 32px 8px;font-family:${font};">
            <h1 style="margin:0 0 10px;font-size:22px;font-weight:700;letter-spacing:-0.03em;line-height:1.25;color:#1a1a2e;">Reset your password</h1>
            <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#4b5563;">Someone asked to reset the password for your Storelib account. Press the button to choose a new one.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 8px;font-family:${font};">
            ${emailButton({ href: url, label: "Choose a new password", fill: "#1a1a2e", padding: "12px 22px", radius: 10, text: "font-size:15px;font-weight:600;" })}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 0;font-family:${font};">
            <p style="margin:0 0 6px;font-size:13px;line-height:1.55;color:#6b7280;">Or paste this link into your browser:</p>
            <p style="margin:0;font-size:12px;line-height:1.5;color:#4b5563;word-break:break-all;">${escapeHtml(url)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 28px;font-family:${font};">
            <p style="margin:0;font-size:13px;line-height:1.55;color:#6b7280;">The link works once, for ${when}. If you didn't ask for this, ignore this email. Your password stays the same.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`
  const text = [
    "Reset your password",
    "",
    "Someone asked to reset the password for your Storelib account. Open this link to choose a new one:",
    "",
    url,
    "",
    `The link works once, for ${when}. If you didn't ask for this, ignore this email. Your password stays the same.`,
    "",
    "Storelib",
  ].join("\n")
  return { subject, html, text }
}
