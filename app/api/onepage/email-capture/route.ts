import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendLeadMagnetEmail } from "@/lib/email"
import { v4 as uuidv4 } from "uuid"

function getBaseUrl() {
  const envUrl =
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ""
  const raw = (envUrl || "").trim()
  if (!raw) return "https://storelib.com"
  const withScheme = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`
  return withScheme.replace(/\/+$/, "")
}

// POST - Submit email capture with optional digital product delivery
export async function POST(request: Request) {
  try {
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
      digital_product_id,
    } = body

    if (!onepage_id || !email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const normalizedEmail = email.toLowerCase().trim()
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 })
    }

    // Get onepage with seller info
    const { data: onepage, error: onepageError } = await adminSupabase
      .from("onepages")
      .select("id, status, seller_id, title")
      .eq("id", onepage_id)
      .eq("status", "published")
      .single()

    if (onepageError || !onepage) {
      return NextResponse.json({ error: "OnePage not found" }, { status: 404 })
    }

    // Check if already subscribed
    const { data: existingLead } = await adminSupabase
      .from("onepage_leads")
      .select("id, digital_product_id")
      .eq("onepage_id", onepage_id)
      .eq("email", normalizedEmail)
      .single()

    let downloadLink: string | null = null
    let downloadToken: string | null = null

    // Handle digital product delivery
    if (digital_product_id) {
      // Verify product exists and is free
      const { data: product, error: productError } = await adminSupabase
        .from("products")
        .select("id, title, price_cents, thumbnail_url, slug")
        .eq("id", digital_product_id)
        .single()

      if (productError || !product) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 })
      }

      if (product.price_cents && product.price_cents > 0) {
        return NextResponse.json({ error: "Only free products can be used for email capture" }, { status: 400 })
      }

      // Check if subscriber already has this download
      const { data: existingDownload } = await adminSupabase
        .from("subscriber_digital_products")
        .select("id, download_token")
        .eq("subscriber_email", normalizedEmail)
        .eq("onepage_id", onepage_id)
        .eq("product_id", digital_product_id)
        .single()

      if (existingDownload) {
        // Return existing download token
        downloadToken = existingDownload.download_token
        downloadLink = `${getBaseUrl()}/api/onepage/download/${downloadToken}`
      } else {
        // Create new download record
        downloadToken = uuidv4()
        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + 30) // 30 days expiry

        const { error: downloadInsertError } = await adminSupabase
          .from("subscriber_digital_products")
          .insert({
            subscriber_email: normalizedEmail,
            onepage_id: onepage_id,
            product_id: digital_product_id,
            download_token: downloadToken,
            max_downloads: 10,
            expires_at: expiresAt.toISOString(),
          })

        if (downloadInsertError) {
          console.error("Error creating download record:", downloadInsertError)
        } else {
          downloadLink = `${getBaseUrl()}/api/onepage/download/${downloadToken}`
        }
      }

      // Get seller info for email
      let sellerName = "The Creator"
      if (onepage.seller_id) {
        const { data: creator } = await adminSupabase
          .from("creators")
          .select("user_id")
          .eq("id", onepage.seller_id)
          .single()

        if (creator?.user_id) {
          const { data: profile } = await adminSupabase
            .from("profiles")
            .select("display_name, username")
            .eq("id", creator.user_id)
            .single()

          if (profile?.display_name) {
            sellerName = profile.display_name
          } else if (profile?.username) {
            sellerName = profile.username
          }
        }
      }

      // Send download email using shared email function with retry logic
      let emailSent = false
      if (downloadLink) {
        const emailResult = await sendLeadMagnetEmail(adminSupabase, {
          recipientEmail: normalizedEmail,
          productTitle: product.title,
          productFileUrl: downloadLink,
          creatorId: onepage.seller_id,
          onepageId: onepage_id,
          baseUrl: getBaseUrl(),
          customSubject: `Your download is ready - ${product.title}`,
          customHeading: "Your download is ready!",
          customBody: `Thanks for joining ${sellerName}'s list! As promised, here's your free digital download: <strong>${product.title}</strong>. This link expires in 30 days and can be used up to 10 times.`,
        })

        emailSent = emailResult.success
        if (!emailResult.success) {
          console.error("[email-capture] Error sending download email:", emailResult.error)
        } else {
          console.log("[email-capture] ✅ Download email sent successfully to:", normalizedEmail)
        }
      }

      // Update lead/download record with email status if email failed
      if (!emailSent && downloadToken) {
        await adminSupabase
          .from("subscriber_digital_products")
          .update({ email_sent: false, email_error: "Failed to send after retries" })
          .eq("download_token", downloadToken)
      }
    }

    // Insert or update lead
    if (existingLead) {
      // Update existing lead with digital product if provided
      if (digital_product_id && !existingLead.digital_product_id) {
        await adminSupabase
          .from("onepage_leads")
          .update({
            digital_product_id,
            digital_download_sent: !!downloadLink,
            digital_download_sent_at: downloadLink ? new Date().toISOString() : null,
          })
          .eq("id", existingLead.id)
      }
      
      return NextResponse.json({
        success: true,
        message: "Already subscribed",
        downloadLink,
      })
    }

    // Insert new lead
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
        delivery_status: digital_product_id ? "sent" : "not_applicable",
        digital_product_id: digital_product_id || null,
        digital_download_sent: !!downloadLink,
        digital_download_sent_at: downloadLink ? new Date().toISOString() : null,
      })
      .select()
      .single()

    if (insertError) {
      if (insertError.code === "23505") {
        return NextResponse.json({
          success: true,
          message: "Already subscribed",
          downloadLink,
        })
      }
      console.error("Lead insert error:", insertError)
      return NextResponse.json({ error: "Failed to save" }, { status: 500 })
    }

    // Add to subscribers list
    if (onepage.seller_id) {
      const unsubscribeToken = uuidv4()
      const { data: existingSubscriber } = await adminSupabase
        .from("subscribers")
        .select("id, status")
        .eq("creator_id", onepage.seller_id)
        .eq("email", normalizedEmail)
        .single()

      if (!existingSubscriber) {
        await adminSupabase.from("subscribers").insert({
          email: normalizedEmail,
          name: name || null,
          source: "onepage_email_capture",
          source_id: onepage_id,
          creator_id: onepage.seller_id,
          status: "subscribed",
          is_active: true,
          subscribed_at: new Date().toISOString(),
          consent_text: "Subscribed via OnePage email capture form",
          consent_timestamp: new Date().toISOString(),
          unsubscribe_token: unsubscribeToken,
        })
      } else if (existingSubscriber.status === "unsubscribed") {
        await adminSupabase
          .from("subscribers")
          .update({
            status: "subscribed",
            is_active: true,
            subscribed_at: new Date().toISOString(),
            unsubscribed_at: null,
          })
          .eq("id", existingSubscriber.id)
      }
    }

    return NextResponse.json({
      success: true,
      lead_id: lead.id,
      downloadLink,
    })
  } catch (error) {
    console.error("Email capture submission error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
