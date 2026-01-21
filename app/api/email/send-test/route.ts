import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sendEmail, isSmtpConfigured } from "@/lib/mail"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const { subject, body, preview_text, test_email } = await request.json()

    if (!subject || !body || !test_email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(test_email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 })
    }

    if (!isSmtpConfigured()) {
      return NextResponse.json({ error: "Email service not configured" }, { status: 500 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, display_name, username, avatar_url")
      .eq("id", user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const senderName = profile.display_name || profile.username || "Creator"
    const avatarUrl = profile.avatar_url || ""

    const avatarHtml = avatarUrl
      ? `<img src="${avatarUrl}" alt="${senderName}" width="40" height="40" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; display: block;" />`
      : `<div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%); display: inline-block; text-align: center; line-height: 40px; font-size: 16px; font-weight: 600; color: #4338ca;">${senderName.charAt(0).toUpperCase()}</div>`

    const previewTextHtml = preview_text
      ? `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${preview_text}${"&nbsp;&zwnj;".repeat(100)}</div>`
      : ""

    const testEmailHtml = `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <title>${subject}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <style>
    table { border-collapse: collapse; }
    td { font-family: Arial, sans-serif; }
  </style>
  <![endif]-->
  <style>
    /* Reset styles */
    html, body { margin: 0 !important; padding: 0 !important; height: 100% !important; width: 100% !important; }
    * { -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; box-sizing: border-box; }
    table, td { mso-table-lspace: 0pt !important; mso-table-rspace: 0pt !important; }
    table { border-spacing: 0 !important; border-collapse: collapse !important; margin: 0 auto !important; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; max-width: 100%; }
    a { text-decoration: none; color: #6366f1; }
    a:hover { text-decoration: underline; }

    /* Content styles */
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; }
    .email-wrapper { width: 100%; background-color: #f3f4f6; }
    .email-container { max-width: 600px; width: 100%; margin: 0 auto; background-color: #ffffff; }
    .content { color: #374151; line-height: 1.7; font-size: 16px; word-break: break-word; }
    .content p { margin: 0 0 16px 0; }
    .content a { color: #6366f1; text-decoration: underline; }
    .content h1 { font-size: 24px; margin: 0 0 16px 0; font-weight: 700; color: #111827; }
    .content h2 { font-size: 20px; margin: 0 0 14px 0; font-weight: 600; color: #1f2937; }
    .content h3 { font-size: 18px; margin: 0 0 12px 0; font-weight: 600; color: #374151; }
    .content ul, .content ol { margin: 0 0 16px 0; padding-left: 24px; }
    .content li { margin-bottom: 8px; }
    .content img { max-width: 100%; height: auto; border-radius: 8px; margin: 16px 0; }

    /* Responsive styles */
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .content-padding { padding: 24px 20px !important; }
      .footer-padding { padding: 20px !important; }
      .content { font-size: 15px !important; }
      .mobile-full-width { width: 100% !important; display: block !important; }
      .mobile-center { text-align: center !important; }
    }

    @media only screen and (max-width: 480px) {
      .content-padding { padding: 20px 16px !important; }
      .footer-padding { padding: 16px !important; }
      .content { font-size: 14px !important; line-height: 1.6 !important; }
      .content h1 { font-size: 20px !important; }
      .content h2 { font-size: 18px !important; }
      .content h3 { font-size: 16px !important; }
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      .email-wrapper { background-color: #1f2937 !important; }
      .email-container { background-color: #111827 !important; }
      .content { color: #e5e7eb !important; }
      .content h1, .content h2, .content h3 { color: #f9fafb !important; }
      .footer-bg { background-color: #1f2937 !important; }
      .footer-text { color: #9ca3af !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6;">
  ${previewTextHtml}

  <!-- Email wrapper -->
  <table role="presentation" class="email-wrapper" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 32px 16px;">

        <!-- Test Email Banner -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; margin-bottom: 16px;">
          <tr>
            <td style="padding: 12px 20px; background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 8px; text-align: center;">
              <span style="font-size: 13px; font-weight: 600; color: #92400e;">This is a test email - Preview how your email will look</span>
            </td>
          </tr>
        </table>

        <!-- Email container -->
        <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);">

          <!-- Content -->
          <tr>
            <td class="content content-padding" style="padding: 40px 40px 32px 40px; color: #374151; font-size: 16px; line-height: 1.7;">
              ${body}
            </td>
          </tr>

          <!-- Footer with avatar -->
          <tr>
            <td class="footer-bg footer-padding" style="padding: 28px 40px 32px 40px; border-top: 1px solid #e5e7eb; background: linear-gradient(180deg, #f9fafb 0%, #f3f4f6 100%);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <!-- Avatar and name row -->
                <tr>
                  <td align="center" style="padding-bottom: 16px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding-right: 12px; vertical-align: middle;">
                          ${avatarHtml}
                        </td>
                        <td style="vertical-align: middle;">
                          <span style="font-size: 15px; font-weight: 600; color: #1f2937;">${senderName}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Storelib branding row -->
                <tr>
                  <td align="center" class="footer-text" style="padding-bottom: 16px; font-size: 13px; color: #6b7280;">
                    <span style="font-weight: 500;">Storelib</span>
                    <span style="margin: 0 8px; color: #d1d5db;">·</span>
                    <span style="color: #9ca3af;">Powered by Storelib</span>
                  </td>
                </tr>
                <!-- Unsubscribe row -->
                <tr>
                  <td align="center">
                    <a href="#" style="font-size: 12px; color: #9ca3af; text-decoration: underline;">Unsubscribe from these emails</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

        <!-- Post-footer spacing -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%;">
          <tr>
            <td style="padding: 20px 0; text-align: center;">
              <span style="font-size: 11px; color: #9ca3af;">Sent via Storelib</span>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`

    const personalizedHtml = testEmailHtml
      .replace(/\{\{name\}\}/g, "Test Subscriber")
      .replace(/\{\{email\}\}/g, test_email)
      .replace(/\{\{my_name\}\}/g, senderName)
      .replace(/\{\{my_username\}\}/g, profile.username || "username")

    const personalizedSubject = subject
      .replace(/\{\{name\}\}/g, "Test Subscriber")
      .replace(/\{\{my_name\}\}/g, senderName)
      .replace(/\{\{my_username\}\}/g, profile.username || "username")

    const result = await sendEmail({
      from: `${senderName} <noreply@storelib.com>`,
      to: test_email,
      subject: `[TEST] ${personalizedSubject}`,
      html: personalizedHtml,
      replyTo: profile.email || undefined,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Failed to send test email" }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: "Test email sent successfully" })
  } catch (error) {
    console.error("Send test email error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
