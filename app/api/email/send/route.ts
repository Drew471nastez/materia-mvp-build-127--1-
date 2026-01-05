import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { Resend } from "resend"

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

// POST - Send an email campaign
export async function POST(request: NextRequest) {
  try {
    const { campaign_id, schedule_for } = await request.json()

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

      // Build unsubscribe URL
      const unsubscribeUrl = `${baseUrl}/api/email/unsubscribe?token=${subscriber.unsubscribe_token}`

      // Personalize email body
      let personalizedBody = campaign.body
        .replace(/\{\{name\}\}/g, subscriber.name || "there")
        .replace(/\{\{email\}\}/g, subscriber.email)
        .replace(/\{\{unsubscribe_url\}\}/g, unsubscribeUrl)

      // Add tracking pixel before closing body tag
      const trackingPixel = `<img src="${trackingPixelUrl}" width="1" height="1" alt="" style="display:none;" />`

      // Wrap in template if not already HTML
      if (!personalizedBody.includes("<html")) {
        personalizedBody = buildEmailHtml({
          subject: campaign.subject,
          body: personalizedBody,
          senderName,
          unsubscribeUrl,
          trackingPixel,
        })
      } else {
        // Just add tracking pixel to existing HTML
        personalizedBody = personalizedBody.replace("</body>", `${trackingPixel}</body>`)
      }

      try {
        const result = await resend.emails.send({
          from: `${senderName} <noreplycustomers@materiabuilder.store>`,
          to: subscriber.email,
          subject: campaign.subject,
          html: personalizedBody,
          replyTo: profile.email || campaign.reply_to || undefined,
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

// Helper to build email HTML
function buildEmailHtml({
  subject,
  body,
  senderName,
  unsubscribeUrl,
  trackingPixel,
}: {
  subject: string
  body: string
  senderName: string
  unsubscribeUrl: string
  trackingPixel: string
}): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .content { color: #333; line-height: 1.6; font-size: 16px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 12px; }
    .footer a { color: #999; text-decoration: underline; }
    a { color: #0066cc; }
  </style>
</head>
<body>
  <div class="container">
    <div class="content">
      ${body}
    </div>
    <div class="footer">
      <p>You received this email because you subscribed to ${senderName}.</p>
      <p><a href="${unsubscribeUrl}">Unsubscribe</a> from future emails</p>
    </div>
  </div>
  ${trackingPixel}
</body>
</html>
`
}
