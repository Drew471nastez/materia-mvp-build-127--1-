import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { Resend } from "resend"

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

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

    if (!resend) {
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
      ? `<img src="${avatarUrl}" alt="${senderName}" width="36" height="36" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; display: block;" />`
      : `<div style="width: 36px; height: 36px; border-radius: 50%; background-color: #e5e7eb; display: inline-block; text-align: center; line-height: 36px; font-size: 14px; font-weight: 600; color: #6b7280;">${senderName.charAt(0).toUpperCase()}</div>`

    const previewTextHtml = preview_text
      ? `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${preview_text}${"&nbsp;&zwnj;".repeat(100)}</div>`
      : ""

    const testEmailHtml = `
<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${subject}</title>
<style>html, body { margin: 0 !important; padding: 0 !important; } body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }</style></head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5;">
${previewTextHtml}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f5f5f5;">
<tr><td align="center" style="padding: 40px 20px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
<tr><td style="padding: 40px 40px 32px 40px; color: #333333; font-size: 16px; line-height: 1.7;">${body}</td></tr>
<tr><td style="padding: 28px 40px 32px 40px; border-top: 1px solid #f0f0f0; background-color: #fafafa;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding-bottom: 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; vertical-align: middle;">${avatarHtml}</td><td style="vertical-align: middle;"><span style="font-size: 14px; font-weight: 600; color: #374151;">${senderName}</span></td></tr></table></td></tr>
<tr><td align="center" style="padding-bottom: 16px; font-size: 12px; color: #9ca3af;"><span style="color: #6b7280;">Storelib</span><span style="margin: 0 6px; color: #d1d5db;">·</span><span>Powered by Storelib</span></td></tr>
<tr><td align="center"><a href="#" style="font-size: 12px; color: #9ca3af; text-decoration: underline;">Unsubscribe</a></td></tr>
</table></td></tr>
</table></td></tr></table>
</body></html>`

    const personalizedHtml = testEmailHtml
      .replace(/\{\{name\}\}/g, "Test Subscriber")
      .replace(/\{\{email\}\}/g, test_email)
      .replace(/\{\{my_name\}\}/g, senderName)
      .replace(/\{\{my_username\}\}/g, profile.username || "username")
      .replace(/\{\{product_name\}\}/g, "Product Name")

    const personalizedSubject = subject
      .replace(/\{\{name\}\}/g, "Test Subscriber")
      .replace(/\{\{my_name\}\}/g, senderName)
      .replace(/\{\{my_username\}\}/g, profile.username || "username")
      .replace(/\{\{product_name\}\}/g, "Product Name")

    await resend.emails.send({
      from: `${senderName} <noreplycustomers@materiabuilder.store>`,
      to: test_email,
      subject: `[TEST] ${personalizedSubject}`,
      html: personalizedHtml,
      replyTo: profile.email || undefined,
    })

    return NextResponse.json({ success: true, message: "Test email sent successfully" })
  } catch (error) {
    console.error("Send test email error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
