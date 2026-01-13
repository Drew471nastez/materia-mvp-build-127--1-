import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { v4 as uuidv4 } from "uuid"

// =====================================================
// DIRECT RESEND EMAIL SENDING - NO EXTERNAL DEPENDENCIES
// =====================================================

const RESEND_API_KEY = "re_Qiw9Lx4H_6QRy8NL48DoxHVZa1qTXv6Pu"
const FROM_EMAIL = "noreplycustomers@materiabuilder.store"
const PLATFORM_NAME = "Materia Builder"

// Send email directly via Resend API
async function sendEmailViaResend(params: {
  to: string
  subject: string
  html: string
  fromName?: string
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const { to, subject, html, fromName } = params
  
  const from = `${fromName || PLATFORM_NAME} <${FROM_EMAIL}>`
  
  console.log("[RESEND] 📧 Sending email:", { from, to, subject })
  
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
      }),
    })
    
    const data = await response.json()
    
    console.log("[RESEND] 📨 Response:", JSON.stringify(data))
    
    if (!response.ok) {
      console.error("[RESEND] ❌ Error:", data)
      return { success: false, error: data.message || "Resend API error" }
    }
    
    console.log("[RESEND] ✅ Email sent successfully! ID:", data.id)
    return { success: true, id: data.id }
    
  } catch (error: any) {
    console.error("[RESEND] ❌ Fetch error:", error)
    return { success: false, error: error.message || "Network error" }
  }
}

// Build download email HTML
function buildDownloadEmail(params: {
  productTitle: string
  downloadLink: string
  heading?: string
  body?: string
  fromName: string
}): string {
  const { productTitle, downloadLink, heading, body, fromName } = params
  const h = heading || "Your download is ready!"
  const b = body || `Thanks for subscribing! Here's your free download: <strong>${productTitle}</strong>`

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%);">
              <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #fff;">${h}</h1>
              <p style="margin: 0; font-size: 14px; color: rgba(255,255,255,0.9);">from ${fromName}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px 32px 16px;">
              <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #374151;">${b}</p>
              <div style="background: #f9fafb; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
                <p style="margin: 0 0 4px; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Your Download</p>
                <p style="margin: 0; font-size: 16px; font-weight: 600; color: #111827;">${productTitle}</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px;">
              <a href="${downloadLink}" style="display: block; width: 100%; padding: 16px 24px; background-color: #7c3aed; color: #fff; text-decoration: none; border-radius: 12px; font-size: 16px; font-weight: 600; text-align: center; box-sizing: border-box;">
                Download Now
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; text-align: center; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">© ${new Date().getFullYear()} ${fromName}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// Build welcome email HTML
function buildWelcomeEmail(params: {
  heading?: string
  body?: string
  fromName: string
}): string {
  const { heading, body, fromName } = params
  const h = heading || "Thanks for subscribing!"
  const b = body || "Welcome! We're excited to have you on board. Stay tuned for updates and exclusive content."

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%);">
              <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #fff;">${h}</h1>
              <p style="margin: 0; font-size: 14px; color: rgba(255,255,255,0.9);">from ${fromName}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #374151;">${b}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; text-align: center; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">© ${new Date().getFullYear()} ${fromName}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// Get creator display name
async function getCreatorName(adminSupabase: any, creatorId: string): Promise<string> {
  try {
    const { data: creator } = await adminSupabase
      .from("creators")
      .select("headline, user_id")
      .eq("id", creatorId)
      .single()

    if (creator?.user_id) {
      const { data: profile } = await adminSupabase
        .from("profiles")
        .select("display_name, username")
        .eq("id", creator.user_id)
        .single()

      if (profile?.display_name) return profile.display_name
      if (profile?.username) return profile.username
    }
    if (creator?.headline) return creator.headline
  } catch (e) {
    console.log("[leads] Could not get creator name")
  }
  return PLATFORM_NAME
}

// =====================================================
// POST - Submit lead and send email
// =====================================================
export async function POST(request: Request) {
  console.log("[leads] ========== NEW SUBSCRIPTION REQUEST ==========")
  
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    const body = await request.json()
    const {
      onepage_id,
      email,
      name,
      block_id,
      referrer,
      utm_source,
      utm_medium,
      utm_campaign,
      lead_magnet_id,
      enable_digital_product,
      digital_product_file_url,
      digital_product_title,
      send_welcome_email,
      email_subject,
      email_heading,
      email_body,
    } = body

    const subscriberEmail = (email || "").toLowerCase().trim()
    
    console.log("[leads] Request data:", {
      onepage_id,
      subscriberEmail,
      enable_digital_product,
      has_file_url: !!digital_product_file_url,
      send_welcome_email,
    })

    // Validate
    if (!onepage_id || !subscriberEmail) {
      console.log("[leads] ❌ Missing required fields")
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(subscriberEmail)) {
      console.log("[leads] ❌ Invalid email format")
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 })
    }

    // Verify onepage exists and is published
    const { data: onepage, error: onepageError } = await supabase
      .from("onepages")
      .select("id, status, seller_id, owner_id, creator_id")
      .eq("id", onepage_id)
      .eq("status", "published")
      .single()

    if (onepageError || !onepage) {
      console.log("[leads] ❌ OnePage not found or not published")
      return NextResponse.json({ error: "OnePage not found" }, { status: 404 })
    }

    console.log("[leads] ✓ OnePage found:", onepage.id)

    const fileUrl = digital_product_file_url || null
    const productTitle = digital_product_title || "Free Download"
    const hasDigitalProduct = enable_digital_product && fileUrl

    // Check for existing subscription
    const { data: existingLead } = await adminSupabase
      .from("onepage_leads")
      .select("id")
      .eq("onepage_id", onepage_id)
      .eq("email", subscriberEmail)
      .single()

    if (existingLead) {
      console.log("[leads] Already subscribed, returning success")
      return NextResponse.json({
        success: true,
        message: "Already subscribed",
        downloadLink: hasDigitalProduct ? fileUrl : null,
      })
    }

    // Insert lead
    const { data: lead, error: insertError } = await adminSupabase
      .from("onepage_leads")
      .insert({
        onepage_id,
        email: subscriberEmail,
        name: name || null,
        block_id: block_id || null,
        referrer: referrer || null,
        utm_source: utm_source || null,
        utm_medium: utm_medium || null,
        utm_campaign: utm_campaign || null,
        lead_magnet_id: lead_magnet_id || null,
        delivery_status: "pending",
      })
      .select()
      .single()

    if (insertError) {
      if (insertError.code === "23505") {
        console.log("[leads] Duplicate entry, returning success")
        return NextResponse.json({
          success: true,
          message: "Already subscribed",
          downloadLink: hasDigitalProduct ? fileUrl : null,
        })
      }
      console.error("[leads] ❌ Insert error:", insertError)
      return NextResponse.json({ error: "Failed to save" }, { status: 500 })
    }

    console.log("[leads] ✓ Lead saved:", lead.id)

    // Add to subscribers list
    const creatorId = onepage.creator_id || onepage.seller_id || onepage.owner_id
    if (creatorId) {
      const { data: existingSub } = await adminSupabase
        .from("subscribers")
        .select("id, status")
        .eq("creator_id", creatorId)
        .eq("email", subscriberEmail)
        .single()

      if (!existingSub) {
        await adminSupabase.from("subscribers").insert({
          email: subscriberEmail,
          name: name || null,
          source: "onepage",
          source_id: onepage_id,
          creator_id: creatorId,
          status: "subscribed",
          is_active: true,
          subscribed_at: new Date().toISOString(),
          consent_text: "Subscribed via OnePage",
          consent_timestamp: new Date().toISOString(),
          unsubscribe_token: uuidv4(),
        })
        console.log("[leads] ✓ Added to subscribers")
      } else if (existingSub.status === "unsubscribed") {
        await adminSupabase
          .from("subscribers")
          .update({ status: "subscribed", is_active: true, subscribed_at: new Date().toISOString() })
          .eq("id", existingSub.id)
        console.log("[leads] ✓ Resubscribed")
      }
    }

    // =====================================================
    // SEND EMAIL - THIS IS THE CRITICAL PART
    // =====================================================
    let emailSent = false
    const shouldSendEmail = send_welcome_email || hasDigitalProduct

    console.log("[leads] 📧 EMAIL DECISION:", {
      shouldSendEmail,
      send_welcome_email,
      hasDigitalProduct,
      enable_digital_product,
      has_file_url: !!fileUrl,
      recipient: subscriberEmail,
    })

    if (shouldSendEmail) {
      console.log("[leads] 📧 SENDING EMAIL TO:", subscriberEmail)
      
      // Get creator name for email
      const fromName = creatorId ? await getCreatorName(adminSupabase, creatorId) : PLATFORM_NAME
      
      let subject: string
      let html: string

      if (hasDigitalProduct) {
        // Download email
        subject = email_subject || `Your download is ready: ${productTitle}`
        html = buildDownloadEmail({
          productTitle,
          downloadLink: fileUrl!,
          heading: email_heading,
          body: email_body,
          fromName,
        })
        console.log("[leads] 📧 Sending DOWNLOAD email with link:", fileUrl?.substring(0, 50))
      } else {
        // Welcome email
        subject = email_subject || "Thanks for subscribing!"
        html = buildWelcomeEmail({
          heading: email_heading,
          body: email_body,
          fromName,
        })
        console.log("[leads] 📧 Sending WELCOME email")
      }

      // SEND THE EMAIL
      const emailResult = await sendEmailViaResend({
        to: subscriberEmail,
        subject,
        html,
        fromName,
      })

      if (emailResult.success) {
        emailSent = true
        console.log("[leads] ✅ EMAIL SENT SUCCESSFULLY to:", subscriberEmail)
        
        await adminSupabase
          .from("onepage_leads")
          .update({ delivery_status: "sent", delivered_at: new Date().toISOString() })
          .eq("id", lead.id)
      } else {
        console.error("[leads] ❌ EMAIL FAILED:", emailResult.error)
        
        await adminSupabase
          .from("onepage_leads")
          .update({ delivery_status: "failed" })
          .eq("id", lead.id)
      }
    } else {
      console.log("[leads] 📭 NO EMAIL SENT - conditions not met")
      await adminSupabase
        .from("onepage_leads")
        .update({ delivery_status: "not_applicable" })
        .eq("id", lead.id)
    }

    console.log("[leads] ========== REQUEST COMPLETE ==========")
    console.log("[leads] Result:", { success: true, emailSent, downloadLink: hasDigitalProduct ? fileUrl : null })

    return NextResponse.json({
      success: true,
      lead_id: lead.id,
      email_sent: emailSent,
      downloadLink: hasDigitalProduct ? fileUrl : null,
    })

  } catch (error) {
    console.error("[leads] ❌ FATAL ERROR:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// =====================================================
// GET - Fetch leads for owner
// =====================================================
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: onepage } = await supabase
      .from("onepages")
      .select("id")
      .eq("owner_id", user.id)
      .single()

    if (!onepage) {
      return NextResponse.json({ leads: [] })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = parseInt(searchParams.get("offset") || "0")

    const { data: leads, error, count } = await supabase
      .from("onepage_leads")
      .select("*", { count: "exact" })
      .eq("onepage_id", onepage.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 })
    }

    return NextResponse.json({ leads, total: count })
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
