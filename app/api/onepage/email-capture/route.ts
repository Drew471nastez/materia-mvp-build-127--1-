import { NextResponse, after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isPubliclyVisible, publicOnly } from "@/lib/products/visibility"
import { sendLeadMagnetEmail, triggerEmailFlows } from "@/lib/email"
import { contactSourceFrom, recordContactSource } from "@/lib/contacts/contact-source"
import { recordSignupAttribution } from "@/lib/attribution/server"
import { fromOfHost } from "@/lib/orders/order-source"
import { v4 as uuidv4 } from "uuid"
import { rateLimit, addressSubject, emailSubject, LIMITS } from "@/lib/api/rate-limit"
import { deliverSignup, pageSignup } from "@/lib/onepage/integrations/deliver-server"

export const runtime = "nodejs"

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
    /* A OnePage form: where the visit came from is what the page sent, as a host and the utm words. */
    let referrerHost: string | null = null
    try {
      referrerHost = typeof referrer === "string" && referrer ? new URL(referrer).host : null
    } catch {
      referrerHost = null
    }
    const leadSource = contactSourceFrom({ request, surface: "onepage", form: "lead_magnet", sent: { from: fromOfHost(referrerHost) ?? undefined, utm_source, utm_campaign } })

    if (!onepage_id || !email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const normalizedEmail = email.toLowerCase().trim()
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 })
    }

    /* Same as the other sign-up forms: counted by address and by the address
       being signed up. See lib/api/rate-limit.ts. */
    const limited = await rateLimit({
      bucket: "email-capture",
      subjects: [addressSubject(request), emailSubject(normalizedEmail)],
      windows: LIMITS.subscribe,
      message: "That is a lot of sign-ups at once. Try again in a minute.",
    })
    if (limited) return limited

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

    /*
      THE DOWNLOAD IS GIVEN ONLY WHILE THE PRODUCT IS ON SALE, AND ONLY THIS
      PAGE'S OWN. The id comes from the visitor's request, and this route
      used to read any product by it: an archived, unpublished or draft one,
      or another creator's, was emailed all the same. Now it has to be
      published and belong to the page's creator (lib/products/visibility).
      A product that is not is simply not sent: the address is still
      collected, which is what the live page does with the block too
      (lib/onepage/live-products.ts withoutDelivery).
    */
    let deliverable: { id: string; title: string; price_cents: number | null } | null = null
    if (digital_product_id) {
      let lookup = publicOnly(
        adminSupabase
          .from("products")
          .select("id, title, price_cents, thumbnail_url, slug, status")
          .eq("id", digital_product_id),
      )
      if (onepage.seller_id) lookup = lookup.eq("creator_id", onepage.seller_id)
      const { data: product, error: productError } = await lookup.maybeSingle()
      if (!productError && product && isPubliclyVisible(product)) deliverable = product
    }

    // Handle digital product delivery
    if (deliverable) {
      const product = deliverable

      if (product.price_cents && product.price_cents > 0) {
        return NextResponse.json({ error: "Only free products can be used for email capture" }, { status: 400 })
      }

      // Check if subscriber already has this download
      const { data: existingDownload } = await adminSupabase
        .from("subscriber_digital_products")
        .select("id, download_token")
        .eq("subscriber_email", normalizedEmail)
        .eq("onepage_id", onepage_id)
        .eq("product_id", deliverable.id)
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
            product_id: deliverable.id,
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
      if (deliverable && !existingLead.digital_product_id) {
        await adminSupabase
          .from("onepage_leads")
          .update({
            digital_product_id: deliverable.id,
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
        delivery_status: deliverable ? "sent" : "not_applicable",
        digital_product_id: deliverable?.id ?? null,
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
        const { error: subscriberInsertError } = await adminSupabase.from("subscribers").insert({
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

        // Trigger new_subscriber email flows if insert was successful
        if (!subscriberInsertError) {
          await recordContactSource(adminSupabase, onepage.seller_id, normalizedEmail, leadSource)
          await recordSignupAttribution(adminSupabase, { creatorId: onepage.seller_id, email: normalizedEmail, source: leadSource, sent: body.origin })
          try {
            await triggerEmailFlows(adminSupabase, {
              triggerType: "new_subscriber",
              creatorId: onepage.seller_id,
              recipientEmail: normalizedEmail,
              recipientName: name || undefined,
              source: leadSource,
            })
          } catch (flowErr) {
            console.error("[email-capture] Email flow trigger error (non-fatal):", flowErr)
          }
        }
      } else if (existingSubscriber.status === "unsubscribed" || existingSubscriber.status === "customer" || existingSubscriber.status === "wrote") {
        /* Back on the list, or a buyer who never asked for news asking now
           (lib/contacts/checkout-contact): this form is the yes, and the
           record says so. */
        const { error: resubError } = await adminSupabase
          .from("subscribers")
          .update({
            status: "subscribed",
            is_active: true,
            subscribed_at: new Date().toISOString(),
            unsubscribed_at: null,
            consent_text: "Subscribed via OnePage email capture form",
            consent_timestamp: new Date().toISOString(),
          })
          .eq("id", existingSubscriber.id)

        /* Joining again is joining, so the welcome goes, as it does above. */
        if (!resubError) {
          await recordContactSource(adminSupabase, onepage.seller_id, normalizedEmail, leadSource)
          await recordSignupAttribution(adminSupabase, { creatorId: onepage.seller_id, email: normalizedEmail, source: leadSource, sent: body.origin })
          try {
            await triggerEmailFlows(adminSupabase, {
              triggerType: "new_subscriber",
              creatorId: onepage.seller_id,
              recipientEmail: normalizedEmail,
              recipientName: name || undefined,
              source: leadSource,
            })
          } catch (flowErr) {
            console.error("[email-capture] Email flow trigger error (non-fatal):", flowErr)
          }
        }
      }
    }

    /* The creator's own tools (lib/onepage/integrations), after the answer. */
    after(() => deliverSignup(adminSupabase, onepage.seller_id, pageSignup({ email: normalizedEmail, name, form: "lead_magnet", magnet: deliverable ? "download" : null, detail: deliverable?.title ?? null, blockId: block_id, onepageId: onepage_id, pageUrl: request.headers.get("referer") })))

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
