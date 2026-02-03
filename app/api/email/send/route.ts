import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendEmail, isSmtpConfigured } from "@/lib/mail"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// POST - Send an email campaign
export async function POST(request: NextRequest) {
  console.log("[email/send] ========== START SEND REQUEST ==========")
  const startTime = Date.now()

  try {
    const { campaign_id, schedule_for } = await request.json()
    console.log("[email/send] Request params:", { campaign_id, schedule_for })

    if (!campaign_id) {
      console.log("[email/send] Missing campaign_id")
      return NextResponse.json({ error: "Missing campaign_id" }, { status: 400 })
    }

    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    // Get the current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: creator } = await supabase
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    // Get creator profile info
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, display_name, username, avatar_url")
      .eq("id", user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    // Get the campaign
    console.log("[email/send] Fetching campaign:", campaign_id)
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

    console.log("[email/send] Campaign found:", { subject: campaign.subject, audience_type: campaign.audience_type })

    // Handle scheduling
    if (schedule_for) {
      const { error: updateError } = await supabase
        .from("email_campaigns")
        .update({ status: "scheduled", scheduled_at: schedule_for })
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

    // Check SMTP configuration
    if (!isSmtpConfigured()) {
      return NextResponse.json({ error: "Email service not configured" }, { status: 500 })
    }

    // Get subscribers based on audience type
    let subscribersQuery = adminSupabase
      .from("subscribers")
      .select("id, email, name, unsubscribe_token, subscribed_at")
      .eq("creator_id", creator.id)
      .eq("status", "subscribed")

    // Apply audience filters
    const audienceType = campaign.audience_type || "all"
    const now = new Date()

    if (audienceType === "onepage") {
      subscribersQuery = subscribersQuery.eq("source", "onepage")
    } else if (audienceType === "store_builder") {
      subscribersQuery = subscribersQuery.eq("source", "store_builder")
    } else if (audienceType === "last_24h") {
      const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      subscribersQuery = subscribersQuery.gte("subscribed_at", cutoff.toISOString())
    } else if (audienceType === "last_7days") {
      const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      subscribersQuery = subscribersQuery.gte("subscribed_at", cutoff.toISOString())
    } else if (audienceType === "last_30days") {
      const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      subscribersQuery = subscribersQuery.gte("subscribed_at", cutoff.toISOString())
    } else if (audienceType === "last_90days") {
      const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      subscribersQuery = subscribersQuery.gte("subscribed_at", cutoff.toISOString())
    }

    const { data: subscribers, error: subscribersError } = await subscribersQuery

    if (subscribersError) {
      console.error("[email/send] Subscriber query error:", subscribersError)
      return NextResponse.json({ error: "Failed to fetch subscribers" }, { status: 500 })
    }

    if (!subscribers || subscribers.length === 0) {
      console.log("[email/send] No subscribers found for audience:", audienceType)
      return NextResponse.json({ error: "No subscribers found for this audience" }, { status: 400 })
    }

    console.log(`[email/send] Found ${subscribers.length} subscribers for audience: ${audienceType}`)

    // Update campaign to sending status
    await adminSupabase
      .from("email_campaigns")
      .update({ status: "sending", audience_count: subscribers.length })
      .eq("id", campaign_id)

    // Create send records for each subscriber
    const sendRecords = subscribers.map(sub => ({
      campaign_id,
      subscriber_id: sub.id,
      email: sub.email,
      status: "pending",
    }))

    const { data: sends, error: sendsError } = await adminSupabase
      .from("email_sends")
      .insert(sendRecords)
      .select("id, email, subscriber_id")

    if (sendsError) {
      console.error("[email/send] Failed to create send records:", sendsError)
      await adminSupabase.from("email_campaigns").update({ status: "failed" }).eq("id", campaign_id)
      return NextResponse.json({ error: "Failed to create send records" }, { status: 500 })
    }

    // Build base URL for tracking
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://storelib.com"
    const senderName = campaign.from_name || profile.display_name || profile.username || "Creator"
    const senderAvatar = profile.avatar_url || ""

    // Send emails
    let sentCount = 0
    let failedCount = 0

    for (const send of sends || []) {
      const subscriber = subscribers.find(s => s.id === send.subscriber_id)
      if (!subscriber) continue

      try {
        // Build tracking URLs
        const encodedEmail = encodeURIComponent(subscriber.email)
        const trackingPixelUrl = `${baseUrl}/api/email/track?cid=${campaign_id}&e=${encodedEmail}`
        const unsubscribeUrl = `${baseUrl}/unsubscribe?token=${subscriber.unsubscribe_token}`

        // Personalize email body
        let personalizedBody = campaign.body
          .replace(/\{\{name\}\}/g, subscriber.name || "there")
          .replace(/\{\{email\}\}/g, subscriber.email)
          .replace(/\{\{unsubscribe_url\}\}/g, unsubscribeUrl)

        // Wrap links with click tracking
        personalizedBody = wrapLinksWithTracking(
          personalizedBody,
          baseUrl,
          send.id,
          campaign_id,
          unsubscribeUrl,
          subscriber.email
        )

        // Build final HTML
        const trackingPixel = `<img src="${trackingPixelUrl}" width="1" height="1" alt="" style="display:none;" />`
        const finalHtml = buildEmailHtml({
          subject: campaign.subject,
          previewText: campaign.preview_text || "",
          body: personalizedBody,
          senderName,
          senderAvatar,
          unsubscribeUrl,
          trackingPixel,
        })

        // Create plain text version
        const plainText = stripHtml(campaign.body)
          .replace(/\{\{name\}\}/g, subscriber.name || "there")
          .replace(/\{\{email\}\}/g, subscriber.email)
          .replace(/\{\{unsubscribe_url\}\}/g, unsubscribeUrl)
          + `\n\n---\nUnsubscribe: ${unsubscribeUrl}`

        // Send the email
        const result = await sendEmail({
          from: `${senderName} <noreply@storelib.com>`,
          to: subscriber.email,
          subject: campaign.subject,
          html: finalHtml,
          text: plainText,
          replyTo: profile.email || campaign.reply_to || undefined,
          headers: {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        })

        if (!result.success) {
          throw new Error(result.error || "Send failed")
        }

        const sentTime = new Date().toISOString()

        // Update send record
        await adminSupabase
          .from("email_sends")
          .update({
            status: "sent",
            sent_at: sentTime,
            resend_id: result.messageId || null,
          })
          .eq("id", send.id)

        // Record sent event in email_events (single source of truth for tracking)
        await adminSupabase.from("email_events").insert({
          campaign_id,
          creator_id: creator.id,
          email: subscriber.email,
          event_type: "sent",
          metadata: {
            send_id: send.id,
            subscriber_id: subscriber.id,
            message_id: result.messageId,
            sent_at: sentTime,
          },
        })

        sentCount++
      } catch (error) {
        console.error(`[email/send] Failed to send to ${subscriber.email}:`, error)

        // Update send record with failure
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

    // Update campaign final status
    const finalStatus = sentCount > 0 ? "sent" : "failed"
    await adminSupabase
      .from("email_campaigns")
      .update({
        status: finalStatus,
        sent_at: new Date().toISOString(),
        audience_count: sentCount,
      })
      .eq("id", campaign_id)

    const elapsed = Date.now() - startTime
    console.log(`[email/send] Completed in ${elapsed}ms - sent: ${sentCount}, failed: ${failedCount}`)

    return NextResponse.json({
      success: sentCount > 0,
      message: sentCount > 0 ? "Campaign sent successfully" : "Failed to send campaign",
      sent: sentCount,
      failed: failedCount,
      total: subscribers.length,
      campaign_id,
    })

  } catch (error) {
    console.error("[email/send] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Wrap links with click tracking (except unsubscribe and special links)
function wrapLinksWithTracking(
  html: string,
  baseUrl: string,
  sendId: string,
  campaignId: string,
  unsubscribeUrl: string,
  email: string
): string {
  const linkRegex = /<a([^>]*?)href=["']([^"']+)["']([^>]*)>/gi

  return html.replace(linkRegex, (match, before, href, after) => {
    // Skip tracking for these types of links
    if (
      href === unsubscribeUrl ||
      href.includes("unsubscribe") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      href.startsWith("#") ||
      href.includes("/api/email/track")
    ) {
      return match
    }

    // Create tracked URL
    const encodedUrl = Buffer.from(href).toString("base64")
    const encodedEmail = encodeURIComponent(email)
    const trackingUrl = `${baseUrl}/api/email/click?url=${encodeURIComponent(encodedUrl)}&sid=${sendId}&cid=${campaignId}&e=${encodedEmail}`

    return `<a${before}href="${trackingUrl}"${after}>`
  })
}

// Strip HTML tags for plain text version
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, "$2 ($1)")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&zwnj;/g, "")
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .trim()
}

// Build optimized email HTML
function buildEmailHtml({
  subject,
  previewText,
  body,
  senderName,
  senderAvatar,
  unsubscribeUrl,
  trackingPixel,
}: {
  subject: string
  previewText: string
  body: string
  senderName: string
  senderAvatar: string
  unsubscribeUrl: string
  trackingPixel: string
}): string {
  const previewTextHtml = previewText
    ? `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${previewText}${"&nbsp;&zwnj;".repeat(100)}</div>`
    : ""

  const avatarHtml = senderAvatar
    ? `<img src="${senderAvatar}" alt="${senderName}" width="40" height="40" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" />`
    : `<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#e0e7ff,#c7d2fe);text-align:center;line-height:40px;font-size:16px;font-weight:600;color:#4338ca;">${senderName.charAt(0).toUpperCase()}</div>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${subject}</title>
  <style>
    body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f3f4f6;}
    .content{color:#374151;line-height:1.7;font-size:16px;}
    .content p{margin:0 0 16px;}
    .content a{color:#6366f1;text-decoration:underline;}
    .content h1{font-size:24px;margin:0 0 16px;font-weight:700;color:#111827;}
    .content h2{font-size:20px;margin:0 0 14px;font-weight:600;color:#1f2937;}
    .content ul,.content ol{margin:0 0 16px;padding-left:24px;}
    .content li{margin-bottom:8px;}
    .content img{max-width:100%;height:auto;border-radius:8px;margin:16px 0;}
    @media(max-width:620px){.container{width:100%!important;}.content{font-size:15px!important;padding:24px 20px!important;}}
  </style>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;">
  ${previewTextHtml}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
          <tr>
            <td class="content" style="padding:40px;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:28px 40px;border-top:1px solid #e5e7eb;background:linear-gradient(180deg,#f9fafb,#f3f4f6);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:16px;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-right:12px;vertical-align:middle;">${avatarHtml}</td>
                        <td style="vertical-align:middle;"><span style="font-size:15px;font-weight:600;color:#1f2937;">${senderName}</span></td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom:16px;font-size:13px;color:#9ca3af;">Powered by Storelib</td>
                </tr>
                <tr>
                  <td align="center">
                    <a href="${unsubscribeUrl}" style="font-size:12px;color:#9ca3af;text-decoration:underline;">Unsubscribe from these emails</a>
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
</html>`
}
