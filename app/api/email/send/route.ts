import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendEmail, isSmtpConfigured } from "@/lib/mail"

export const runtime = "nodejs"

// POST - Send an email campaign
export async function POST(request: NextRequest) {
  console.log("[email/send] ========== START SEND REQUEST ==========")
  try {
    const { campaign_id, schedule_for, is_resend } = await request.json()
    console.log("[email/send] Request params:", { campaign_id, schedule_for, is_resend })

    if (!campaign_id) {
      console.log("[email/send] Missing campaign_id")
      return NextResponse.json({ error: "Missing campaign_id" }, { status: 400 })
    }

    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    // Get the current user
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    // Get creator profile info including email, display_name, and avatar
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, display_name, username, avatar_url")
      .eq("id", user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    // Get the campaign
    console.log("[email/send] Fetching campaign:", campaign_id, "for creator:", creator.id)
    const { data: campaign, error: campaignError } = await supabase
      .from("email_campaigns")
      .select("*")
      .eq("id", campaign_id)
      .eq("creator_id", creator.id)
      .single()

    if (campaignError || !campaign) {
      console.log("[email/send] Campaign not found:", campaignError)
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    }
    console.log("[email/send] Campaign found with audience_type:", campaign.audience_type)

    if (is_resend) {
      const { data: existingResends } = await adminSupabase
        .from("email_sends")
        .select("id")
        .eq("campaign_id", campaign_id)
        .gt("sent_at", campaign.sent_at || "1970-01-01")

      if (existingResends && existingResends.length > 0) {
        return NextResponse.json({ error: "This campaign has already been resent once" }, { status: 400 })
      }
    }

    // If scheduling for later, just update the campaign
    if (schedule_for) {
      const { error: updateError } = await supabase
        .from("email_campaigns")
        .update({
          status: "scheduled",
          scheduled_at: schedule_for,
        })
        .eq("id", campaign_id)

      if (updateError) {
        return NextResponse.json({ error: "Failed to schedule campaign" }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: "Campaign scheduled successfully",
        scheduled_at: schedule_for,
      })
    }

    if (!isSmtpConfigured()) {
      return NextResponse.json({ error: "Email service not configured (SMTP credentials missing)" }, { status: 500 })
    }

    // Get subscribers based on audience type
    // Use admin client to bypass RLS and ensure all subscribers are fetched
    let subscribersQuery = adminSupabase
      .from("subscribers")
      .select("id, email, name, unsubscribe_token, subscribed_at")
      .eq("creator_id", creator.id)
      .eq("status", "subscribed")

    // Filter by audience type or timeframe
    if (campaign.audience_type === "onepage") {
      subscribersQuery = subscribersQuery.eq("source", "onepage")
    } else if (campaign.audience_type === "store_builder") {
      subscribersQuery = subscribersQuery.eq("source", "store_builder")
    } else if (campaign.audience_type === "last_24h") {
      const cutoffDate = new Date()
      cutoffDate.setHours(cutoffDate.getHours() - 24)
      subscribersQuery = subscribersQuery.gte("subscribed_at", cutoffDate.toISOString())
    } else if (campaign.audience_type === "last_7days") {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - 7)
      subscribersQuery = subscribersQuery.gte("subscribed_at", cutoffDate.toISOString())
    } else if (campaign.audience_type === "last_30days") {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - 30)
      subscribersQuery = subscribersQuery.gte("subscribed_at", cutoffDate.toISOString())
    } else if (campaign.audience_type === "last_90days") {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - 90)
      subscribersQuery = subscribersQuery.gte("subscribed_at", cutoffDate.toISOString())
    }
    // "all" audience_type doesn't need additional filtering

    console.log("[email/send] Executing subscriber query for audience_type:", campaign.audience_type)
    const { data: subscribers, error: subscribersError } = await subscribersQuery

    if (subscribersError) {
      console.log("[email/send] Subscriber query error:", subscribersError)
      return NextResponse.json({ error: "Failed to fetch subscribers" }, { status: 500 })
    }

    console.log("[email/send] Found subscribers:", subscribers?.length || 0)

    if (!subscribers || subscribers.length === 0) {
      console.log("[email/send] No subscribers found for audience_type:", campaign.audience_type)
      return NextResponse.json({ error: "No subscribers found for this audience" }, { status: 400 })
    }

    // Update campaign status to sending
    await supabase
      .from("email_campaigns")
      .update({
        status: "sending",
        audience_count: subscribers.length,
      })
      .eq("id", campaign_id)

    // Create send records for each subscriber
    const sendRecords = subscribers.map((subscriber) => ({
      campaign_id,
      subscriber_id: subscriber.id,
      email: subscriber.email,
      status: "pending",
    }))

    const { data: sends, error: sendsError } = await adminSupabase
      .from("email_sends")
      .insert(sendRecords)
      .select("id, email, subscriber_id")

    if (sendsError) {
      console.error("Error creating send records:", sendsError)
      await supabase.from("email_campaigns").update({ status: "failed" }).eq("id", campaign_id)
      return NextResponse.json({ error: "Failed to create send records" }, { status: 500 })
    }

    // Build the base URL for tracking
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://storelib.com"

    // Process email content with personalization and tracking
    const senderName = campaign.from_name || profile.display_name || profile.username || "Creator"
    const senderAvatarUrl = profile.avatar_url || ""

    let sentCount = 0
    let failedCount = 0

    for (const send of sends || []) {
      const subscriber = subscribers.find((s) => s.id === send.subscriber_id)
      if (!subscriber) continue

      // Build tracking pixel URL with campaign ID and email for tracking opens
      const encodedEmail = encodeURIComponent(subscriber.email)
      const trackingPixelUrl = `${baseUrl}/api/email/track?cid=${campaign_id}&e=${encodedEmail}`

      // Build unsubscribe URL - Use the new unsubscribe page
      const unsubscribeUrl = `${baseUrl}/unsubscribe?token=${subscriber.unsubscribe_token}`

      // Personalize email body
      let personalizedBody = campaign.body
        .replace(/\{\{name\}\}/g, subscriber.name || "there")
        .replace(/\{\{email\}\}/g, subscriber.email)
        .replace(/\{\{unsubscribe_url\}\}/g, unsubscribeUrl)

      // Wrap links with click tracking (except unsubscribe links)
      personalizedBody = wrapLinksWithTracking(personalizedBody, baseUrl, send.id, campaign_id, unsubscribeUrl)

      // Add tracking pixel before closing body tag
      const trackingPixel = `<img src="${trackingPixelUrl}" width="1" height="1" alt="" style="display:none;" />`

      personalizedBody = buildOptimizedEmailHtml({
        subject: campaign.subject,
        previewText: campaign.preview_text || "",
        body: personalizedBody,
        senderName,
        senderAvatarUrl,
        unsubscribeUrl,
        trackingPixel,
        replyTo: profile.email || "",
      })

      try {
        // Create plain text version for better deliverability
        const plainTextBody = stripHtmlForPlainText(campaign.body)
          .replace(/\{\{name\}\}/g, subscriber.name || "there")
          .replace(/\{\{email\}\}/g, subscriber.email)
          .replace(/\{\{unsubscribe_url\}\}/g, unsubscribeUrl)

        // Generate unique message ID for tracking
        const messageId = `${send.id}-${Date.now()}@storelib.com`

        const result = await sendEmail({
          from: `${senderName} <noreply@storelib.com>`,
          to: subscriber.email,
          subject: campaign.subject,
          html: personalizedBody,
          text: plainTextBody + `\n\n---\nUnsubscribe: ${unsubscribeUrl}`,
          replyTo: profile.email || campaign.reply_to || undefined,
          headers: {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            "X-Entity-Ref-ID": messageId,
            "X-Priority": "3",
            "Precedence": "bulk",
          },
        })

        // Check for errors in the response
        if (!result.success) {
          throw new Error(result.error || "SMTP send error")
        }

        // Update send record with success
        await adminSupabase
          .from("email_sends")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            resend_id: result.messageId || null,
          })
          .eq("id", send.id)

        // Log sent event with the correct schema
        await adminSupabase.from("email_events").insert({
          campaign_id,
          creator_id: creator.id,
          recipient_email: subscriber.email,
          event_type: "sent",
          metadata: {
            send_id: send.id,
            subscriber_id: subscriber.id,
            sent_at: new Date().toISOString(),
          },
        }).catch(() => {}) // Ignore if table doesn't exist yet

        sentCount++
      } catch (error) {
        console.error(`Failed to send to ${subscriber.email}:`, error)
        await adminSupabase
          .from("email_sends")
          .update({
            status: "failed",
            error_message: error instanceof Error ? error.message : "Unknown error",
          })
          .eq("id", send.id)
        failedCount++
      }
    }

    // Update campaign status
    const finalStatus = failedCount === (sends?.length || 0) ? "failed" : "sent"
    await supabase
      .from("email_campaigns")
      .update({
        status: finalStatus,
        sent_at: new Date().toISOString(),
        audience_count: sentCount,
      })
      .eq("id", campaign_id)

    return NextResponse.json({
      success: true,
      message: `Email campaign sent successfully`,
      sent: sentCount,
      failed: failedCount,
      total: subscribers.length,
    })
  } catch (error) {
    console.error("Send email error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

function buildOptimizedEmailHtml({
  subject,
  previewText,
  body,
  senderName,
  senderAvatarUrl,
  unsubscribeUrl,
  trackingPixel,
  replyTo,
}: {
  subject: string
  previewText: string
  body: string
  senderName: string
  senderAvatarUrl: string
  unsubscribeUrl: string
  trackingPixel: string
  replyTo: string
}): string {
  // Preview text hack - hidden text that shows in email preview
  const previewTextHtml = previewText
    ? `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${previewText}${"&nbsp;&zwnj;".repeat(100)}</div>`
    : ""

  // Build avatar HTML - either image or fallback initial
  const avatarHtml = senderAvatarUrl
    ? `<img src="${senderAvatarUrl}" alt="${senderName}" width="40" height="40" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; display: block;" />`
    : `<div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%); display: inline-block; text-align: center; line-height: 40px; font-size: 16px; font-weight: 600; color: #4338ca;">${senderName.charAt(0).toUpperCase()}</div>`

  return `
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
                  <td align="center" class="footer-text" style="padding-bottom: 16px; font-size: 13px; color: #9ca3af;">
                    Powered by Storelib
                  </td>
                </tr>
                <!-- Unsubscribe row -->
                <tr>
                  <td align="center">
                    <a href="${unsubscribeUrl}" style="font-size: 12px; color: #9ca3af; text-decoration: underline;">Unsubscribe from these emails</a>
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
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>

  ${trackingPixel}
</body>
</html>
`
}

// Helper function to strip HTML and create plain text version for multipart emails
// Having both HTML and text improves deliverability significantly
function stripHtmlForPlainText(html: string): string {
  return html
    // Remove style and script tags with their content
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    // Convert line breaks and paragraphs to newlines
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    // Convert links to show URL
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, "$2 ($1)")
    // Convert lists
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    // Remove remaining HTML tags
    .replace(/<[^>]+>/g, "")
    // Decode HTML entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&zwnj;/g, "")
    // Clean up whitespace
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .replace(/^\s+|\s+$/g, "")
    .trim()
}

// Helper function to wrap links with click tracking
function wrapLinksWithTracking(html: string, baseUrl: string, sendId: string, campaignId: string, unsubscribeUrl: string): string {
  // Match all href attributes in anchor tags
  const linkRegex = /<a([^>]*?)href=["']([^"']+)["']([^>]*)>/gi

  return html.replace(linkRegex, (match, before, href, after) => {
    // Skip unsubscribe links, mailto links, tel links, and # links
    if (
      href === unsubscribeUrl ||
      href.includes("unsubscribe") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      href.startsWith("#") ||
      href.includes("track?") // Skip tracking pixel URLs
    ) {
      return match
    }

    // Encode the URL in base64 for safe transport
    const encodedUrl = Buffer.from(href).toString("base64")
    const trackingUrl = `${baseUrl}/api/email/click?url=${encodeURIComponent(encodedUrl)}&sid=${sendId}&cid=${campaignId}`

    return `<a${before}href="${trackingUrl}"${after}>`
  })
}
