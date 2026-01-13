import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { v4 as uuidv4 } from "uuid"
import { Resend } from "resend"

const RESEND_API_KEY = process.env.RESEND_API_KEY || "re_Qiw9Lx4H_6QRy8NL48DoxHVZa1qTXv6Pu"
const resend = new Resend(RESEND_API_KEY)

const FROM_EMAIL = "noreplycustomers@materiabuilder.store"
const PLATFORM_BRAND_NAME = "Materia Builder"

function getBaseUrl() {
  const envUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || ""
  const raw = envUrl.trim()
  if (!raw) return "https://materiabuilder.store"
  const withScheme = raw.startsWith("http") ? raw : `https://${raw}`
  return withScheme.replace(/\/+$/, "")
}

// Build the download email HTML
function buildDownloadEmailHtml(params: {
  productTitle: string
  downloadLink: string
  customHeading?: string
  customBody?: string
  fromName: string
}) {
  const { productTitle, downloadLink, customHeading, customBody, fromName } = params
  const heading = customHeading || "Your download is ready!"
  const body =
    customBody || `Thanks for subscribing! As promised, here's your free download: <strong>${productTitle}</strong>`

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
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%);">
              <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #fff;">${heading}</h1>
              <p style="margin: 0; font-size: 14px; color: rgba(255,255,255,0.9);">from ${fromName}</p>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 28px 32px 16px;">
              <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #374151;">${body}</p>
              
              <!-- Product Card -->
              <div style="background: #f9fafb; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
                <p style="margin: 0 0 4px; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Your Download</p>
                <p style="margin: 0; font-size: 16px; font-weight: 600; color: #111827;">${productTitle}</p>
              </div>
            </td>
          </tr>
          
          <!-- Download Button -->
          <tr>
            <td style="padding: 0 32px 32px;">
              <a href="${downloadLink}" 
                 style="display: block; width: 100%; padding: 16px 24px; background-color: #7c3aed; color: #fff; text-decoration: none; border-radius: 12px; font-size: 16px; font-weight: 600; text-align: center; box-sizing: border-box;">
                Download Now
              </a>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; text-align: center; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                © ${new Date().getFullYear()} ${fromName}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// Build welcome email HTML (no download)
function buildWelcomeEmailHtml(params: {
  customHeading?: string
  customBody?: string
  fromName: string
}) {
  const { customHeading, customBody, fromName } = params
  const heading = customHeading || "Thanks for subscribing!"
  const body =
    customBody ||
    "Welcome to our community! We're excited to have you on board. Stay tuned for updates and exclusive content."

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
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%);">
              <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #fff;">${heading}</h1>
              <p style="margin: 0; font-size: 14px; color: rgba(255,255,255,0.9);">from ${fromName}</p>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #374151;">${body}</p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; text-align: center; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                © ${new Date().getFullYear()} ${fromName}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// Resolve creator name for email
async function resolveCreatorName(adminSupabase: any, creatorId: string): Promise<string> {
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
    console.log("[leads] Could not resolve creator name:", e)
  }

  return PLATFORM_BRAND_NAME
}

// POST - Submit a lead (public, no auth required)
export async function POST(request: Request) {
  console.log("[leads] ========================================")
  console.log("[leads] API endpoint called")

  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    const body = await request.json()
    console.log("[leads] Request body:", JSON.stringify(body, null, 2))

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
      // Digital product fields
      enable_digital_product,
      digital_product_file_url,
      digital_product_title,
      // Email customization fields
      send_welcome_email,
      email_subject,
      email_heading,
      email_body,
    } = body

    console.log("[leads] Parsed fields:")
    console.log("[leads]   - email:", email)
    console.log("[leads]   - onepage_id:", onepage_id)
    console.log("[leads]   - block_id:", block_id)
    console.log("[leads]   - enable_digital_product:", enable_digital_product)
    console.log("[leads]   - digital_product_file_url:", digital_product_file_url || "NONE")
    console.log("[leads]   - send_welcome_email:", send_welcome_email)
    console.log("[leads]   - RESEND_API_KEY configured:", !!RESEND_API_KEY)

    if (!onepage_id || !email) {
      console.log("[leads] ERROR: Missing required fields")
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const normalizedEmail = email.toLowerCase().trim()
    if (!emailRegex.test(normalizedEmail)) {
      console.log("[leads] ERROR: Invalid email format:", normalizedEmail)
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 })
    }

    // Verify the onepage exists and is published
    const { data: onepage, error: onepageError } = await supabase
      .from("onepages")
      .select("id, status, seller_id, owner_id, creator_id")
      .eq("id", onepage_id)
      .eq("status", "published")
      .single()

    if (onepageError || !onepage) {
      console.log("[leads] ERROR: OnePage not found:", onepageError?.message)
      return NextResponse.json({ error: "OnePage not found" }, { status: 404 })
    }

    console.log("[leads] OnePage found:", onepage.id)

    const hasDigitalProduct = !!(digital_product_file_url && digital_product_file_url.trim())
    const actualProductTitle = digital_product_title || "Free Download"

    console.log("[leads] Digital product check:")
    console.log("[leads]   - hasDigitalProduct:", hasDigitalProduct)
    console.log("[leads]   - productTitle:", actualProductTitle)

    // Check if already subscribed
    const { data: existingLead } = await adminSupabase
      .from("onepage_leads")
      .select("id")
      .eq("onepage_id", onepage_id)
      .eq("email", normalizedEmail)
      .single()

    if (existingLead) {
      console.log("[leads] User already subscribed")
      return NextResponse.json({
        success: true,
        message: "Already subscribed",
        downloadLink: hasDigitalProduct ? digital_product_file_url : null,
      })
    }

    // Insert lead
    const { data: lead, error: insertError } = await adminSupabase
      .from("onepage_leads")
      .insert({
        onepage_id,
        email: normalizedEmail,
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
        console.log("[leads] Duplicate entry")
        return NextResponse.json({
          success: true,
          message: "Already subscribed",
          downloadLink: hasDigitalProduct ? digital_product_file_url : null,
        })
      }
      console.error("[leads] Insert error:", insertError)
      return NextResponse.json({ error: "Failed to save" }, { status: 500 })
    }

    console.log("[leads] Lead inserted:", lead.id)

    // Add to subscribers list
    const subscriberCreatorId = onepage.creator_id || onepage.seller_id || onepage.owner_id
    if (subscriberCreatorId) {
      const unsubscribeToken = uuidv4()
      const { data: existingSubscriber } = await adminSupabase
        .from("subscribers")
        .select("id, status")
        .eq("creator_id", subscriberCreatorId)
        .eq("email", normalizedEmail)
        .single()

      if (!existingSubscriber) {
        await adminSupabase.from("subscribers").insert({
          email: normalizedEmail,
          name: name || null,
          source: "onepage",
          source_id: onepage_id,
          creator_id: subscriberCreatorId,
          status: "subscribed",
          is_active: true,
          subscribed_at: new Date().toISOString(),
          consent_text: "Subscribed via OnePage email form",
          consent_timestamp: new Date().toISOString(),
          unsubscribe_token: unsubscribeToken,
        })
        console.log("[leads] Added to subscribers list")
      }
    }

    // Default to sending welcome email unless explicitly disabled
    const shouldSendEmail = hasDigitalProduct || send_welcome_email !== false

    console.log("[leads] ========================================")
    console.log("[leads] EMAIL DECISION:")
    console.log("[leads]   - shouldSendEmail:", shouldSendEmail)
    console.log("[leads]   - hasDigitalProduct:", hasDigitalProduct)
    console.log("[leads]   - send_welcome_email flag:", send_welcome_email)
    console.log("[leads]   - Recipient email:", normalizedEmail)
    console.log("[leads] ========================================")

    let emailSent = false
    const creatorId = onepage.creator_id || onepage.owner_id || onepage.seller_id

    if (shouldSendEmail) {
      try {
        const fromName = creatorId ? await resolveCreatorName(adminSupabase, creatorId) : PLATFORM_BRAND_NAME
        const fromHeader = `${fromName} <${FROM_EMAIL}>`

        let emailHtml: string
        let subject: string

        if (hasDigitalProduct) {
          // Download email
          subject = email_subject || `Your download is ready: ${actualProductTitle}`
          emailHtml = buildDownloadEmailHtml({
            productTitle: actualProductTitle,
            downloadLink: digital_product_file_url,
            customHeading: email_heading,
            customBody: email_body,
            fromName,
          })
          console.log("[leads] Sending DOWNLOAD email")
        } else {
          // Welcome email
          subject = email_subject || "Thanks for subscribing!"
          emailHtml = buildWelcomeEmailHtml({
            customHeading: email_heading,
            customBody: email_body,
            fromName,
          })
          console.log("[leads] Sending WELCOME email")
        }

        console.log("[leads] Email details:")
        console.log("[leads]   - From:", fromHeader)
        console.log("[leads]   - To:", normalizedEmail)
        console.log("[leads]   - Subject:", subject)
        console.log("[leads] Calling Resend API...")

        const response = await resend.emails.send({
          from: fromHeader,
          to: normalizedEmail,
          subject,
          html: emailHtml,
        })

        console.log("[leads] Resend response:", JSON.stringify(response, null, 2))

        // Check for error
        if ((response as any)?.error) {
          throw new Error((response as any).error.message || "Resend error")
        }

        emailSent = true
        console.log("[leads] EMAIL SENT SUCCESSFULLY!")

        // Update lead status
        await adminSupabase
          .from("onepage_leads")
          .update({
            delivery_status: "sent",
            delivered_at: new Date().toISOString(),
          })
          .eq("id", lead.id)
      } catch (emailError: any) {
        console.error("[leads] EMAIL FAILED:", emailError?.message || emailError)

        await adminSupabase.from("onepage_leads").update({ delivery_status: "failed" }).eq("id", lead.id)
      }
    } else {
      console.log("[leads] Email skipped - explicitly disabled")
      await adminSupabase.from("onepage_leads").update({ delivery_status: "not_applicable" }).eq("id", lead.id)
    }

    console.log("[leads] ========================================")
    console.log("[leads] COMPLETE - Email sent:", emailSent)
    console.log("[leads] ========================================")

    return NextResponse.json({
      success: true,
      lead_id: lead.id,
      email_sent: emailSent,
      downloadLink: hasDigitalProduct ? digital_product_file_url : null,
    })
  } catch (error) {
    console.error("[leads] Fatal error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// GET - Fetch leads for owner (authenticated)
export async function GET(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: onepage } = await supabase.from("onepages").select("id").eq("owner_id", user.id).single()

    if (!onepage) {
      return NextResponse.json({ leads: [] })
    }

    const { searchParams } = new URL(request.url)
    const limit = Number.parseInt(searchParams.get("limit") || "50")
    const offset = Number.parseInt(searchParams.get("offset") || "0")

    const {
      data: leads,
      error,
      count,
    } = await supabase
      .from("onepage_leads")
      .select("*", { count: "exact" })
      .eq("onepage_id", onepage.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error("Leads fetch error:", error)
      return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 })
    }

    return NextResponse.json({ leads, total: count })
  } catch (error) {
    console.error("Leads GET error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
