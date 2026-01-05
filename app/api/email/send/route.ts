import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { Resend } from "resend"

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

// POST - Send an email campaign
export async function POST(request: NextRequest) {
  try {
    const { campaign_id, schedule_for, is_resend } = await request.json()

    if (!campaign_id) {
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

    // Get creator profile info including email and display_name
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, display_name, username")
      .eq("id", user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    // Get the campaign
    const { data: campaign, error: campaignError } = await supabase
      .from("email_campaigns")
      .select("*")
      .eq("id", campaign_id)
      .eq("creator_id", creator.id)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    }

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

    if (!resend) {
      return NextResponse.json({ error: "Email service not configured (RESEND_API_KEY missing)" }, { status: 500 })
    }

    // Get subscribers based on audience type
    let subscribersQuery = supabase
      .from("subscribers")
      .select("id, email, name, unsubscribe_token")
      .eq("creator_id", creator.id)
      .eq("status", "subscribed")
      .eq("is_active", true)

    // Filter by audience type
    if (campaign.audience_type === "onepage") {
      subscribersQuery = subscribersQuery.eq("source", "onepage")
    } else if (campaign.audience_type === "store_builder") {
      subscribersQuery = subscribersQuery.eq("source", "store_builder")
    }

    // If segment is specified, apply segment filters
    if (campaign.segment_id) {
      const { data: segment } = await supabase
        .from("email_segments")
        .select("filters")
        .eq("id", campaign.segment_id)
        .single()

      if (segment?.filters) {
        const filters = segment.filters as Record<string, any>
        if (filters.source) {
          subscribersQuery = subscribersQuery.eq("source", filters.source)
        }
        if (filters.tags && Array.isArray(filters.tags) && filters.tags.length > 0) {
          subscribersQuery = subscribersQuery.contains("tags", filters.tags)
        }
      }
    }

    const { data: subscribers, error: subscribersError } = await subscribersQuery

    if (subscribersError) {
      return NextResponse.json({ error: "Failed to fetch subscribers" }, { status: 500 })
    }

    if (!subscribers || subscribers.length === 0) {
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
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://materia.so"

    // Process email content with personalization and tracking
    const senderName = campaign.from_name || profile.display_name || profile.username || "Creator"

    let sentCount = 0
    let failedCount = 0

    for (const send of sends || []) {
      const subscriber = subscribers.find((s) => s.id === send.subscriber_id)
      if (!subscriber) continue

      // Build tracking pixel URL
      const trackingPixelUrl = `${baseUrl}/api/email/track?sid=${send.id}&cid=${campaign_id}`

      // Build unsubscribe URL - Use the new unsubscribe page
      const unsubscribeUrl = `${baseUrl}/unsubscribe?token=${subscriber.unsubscribe_token}`

      // Personalize email body
      let personalizedBody = campaign.body
        .replace(/\{\{name\}\}/g, subscriber.name || "there")
        .replace(/\{\{email\}\}/g, subscriber.email)
        .replace(/\{\{unsubscribe_url\}\}/g, unsubscribeUrl)

      // Add tracking pixel before closing body tag
      const trackingPixel = `<img src="${trackingPixelUrl}" width="1" height="1" alt="" style="display:none;" />`

      personalizedBody = buildOptimizedEmailHtml({
        subject: campaign.subject,
        previewText: campaign.preview_text || "",
        body: personalizedBody,
        senderName,
        unsubscribeUrl,
        trackingPixel,
        replyTo: profile.email || "",
      })

      try {
        const result = await resend.emails.send({
          from: `${senderName} <noreplycustomers@materiabuilder.store>`,
          to: subscriber.email,
          subject: campaign.subject,
          html: personalizedBody,
          replyTo: profile.email || campaign.reply_to || undefined,
          headers: {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        })

        // Check for errors in the response
        if ((result as any)?.error) {
          throw new Error((result as any).error.message || "Resend API error")
        }

        // Update send record with success
        await adminSupabase
          .from("email_sends")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            resend_id: (result as any).id || null,
          })
          .eq("id", send.id)

        // Log sent event
        await adminSupabase.from("email_events").insert({
          campaign_id,
          send_id: send.id,
          subscriber_id: subscriber.id,
          email: subscriber.email,
          event_type: "sent",
        })

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
  unsubscribeUrl,
  trackingPixel,
  replyTo,
}: {
  subject: string
  previewText: string
  body: string
  senderName: string
  unsubscribeUrl: string
  trackingPixel: string
  replyTo: string
}): string {
  // Preview text hack - hidden text that shows in email preview
  const previewTextHtml = previewText
    ? `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${previewText}${"&nbsp;&zwnj;".repeat(100)}</div>`
    : ""

  return `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>${subject}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    /* Reset styles */
    html, body { margin: 0 !important; padding: 0 !important; height: 100% !important; width: 100% !important; }
    * { -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt !important; mso-table-rspace: 0pt !important; }
    table { border-spacing: 0 !important; border-collapse: collapse !important; table-layout: fixed !important; margin: 0 auto !important; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    a { text-decoration: none; }
    
    /* Content styles */
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .content { color: #333333; line-height: 1.6; font-size: 16px; }
    .content p { margin: 0 0 16px 0; }
    .content a { color: #0066cc; }
    .content h1, .content h2, .content h3 { margin: 0 0 16px 0; font-weight: 600; }
    
    /* Responsive */
    @media screen and (max-width: 600px) {
      .container { width: 100% !important; padding: 20px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5;">
  ${previewTextHtml}
  
  <!-- Email wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        
        <!-- Email container -->
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          
          <!-- Content -->
          <tr>
            <td class="content" style="padding: 40px 40px 32px 40px; color: #333333; font-size: 16px; line-height: 1.6;">
              ${body}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px 40px 40px; border-top: 1px solid #eeeeee;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="color: #999999; font-size: 12px; line-height: 1.5;">
                    <p style="margin: 0 0 8px 0;">You received this email because you subscribed to ${senderName}.</p>
                    <p style="margin: 0;">
                      <a href="${unsubscribeUrl}" style="color: #999999; text-decoration: underline;">Unsubscribe</a> from future emails
                      ${replyTo ? ` · <a href="mailto:${replyTo}" style="color: #999999; text-decoration: underline;">Contact us</a>` : ""}
                    </p>
                  </td>
                </tr>
              </table>
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
