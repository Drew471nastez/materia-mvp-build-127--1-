import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { triggerEmailFlows } from "@/lib/email"
import { contactSourceFrom, recordContactSource } from "@/lib/contacts/contact-source"
import { recordSignupAttribution } from "@/lib/attribution/server"
import { fromOfHost } from "@/lib/orders/order-source"
import { v4 as uuidv4 } from "uuid"

export const runtime = "nodejs"

// Country code to name mapping
const countryNames: Record<string, string> = {
  US: "United States", GB: "United Kingdom", CA: "Canada", AU: "Australia",
  DE: "Germany", FR: "France", ES: "Spain", IT: "Italy", NL: "Netherlands",
  BR: "Brazil", MX: "Mexico", JP: "Japan", KR: "South Korea", IN: "India",
  CN: "China", RU: "Russia", SE: "Sweden", NO: "Norway", DK: "Denmark",
  FI: "Finland", PL: "Poland", PT: "Portugal", BE: "Belgium", AT: "Austria",
  CH: "Switzerland", IE: "Ireland", NZ: "New Zealand", SG: "Singapore",
  HK: "Hong Kong", TW: "Taiwan", TH: "Thailand", MY: "Malaysia", ID: "Indonesia",
  PH: "Philippines", VN: "Vietnam", AE: "United Arab Emirates", SA: "Saudi Arabia",
  ZA: "South Africa", NG: "Nigeria", EG: "Egypt", AR: "Argentina", CL: "Chile",
  CO: "Colombia", PE: "Peru", IL: "Israel", TR: "Turkey", GR: "Greece",
  CZ: "Czech Republic", HU: "Hungary", RO: "Romania", UA: "Ukraine",
}

// POST - Submit a lead (public, no auth required)
export async function POST(request: Request) {
  console.log("[leads] ========== NEW SUBSCRIPTION REQUEST ==========")

  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()
    const headersList = await headers()

    // Get country from headers (Vercel provides these)
    const countryCode = headersList.get("x-vercel-ip-country") || null
    const countryName = countryCode ? (countryNames[countryCode] || countryCode) : null

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
    } = body
    /* A OnePage form: where the visit came from is what the page sent, as a host and the utm words. */
    let referrerHost: string | null = null
    try {
      referrerHost = typeof referrer === "string" && referrer ? new URL(referrer).host : null
    } catch {
      referrerHost = null
    }
    const leadSource = contactSourceFrom({ request, surface: "onepage", form: "lead_magnet", sent: { from: fromOfHost(referrerHost) ?? undefined, utm_source, utm_campaign } })

    const subscriberEmail = (email || "").toLowerCase().trim()

    console.log("[leads] Request data:", {
      onepage_id,
      subscriberEmail,
      enable_digital_product,
      has_file_url: !!digital_product_file_url,
    })

    // Validate
    if (!onepage_id || !subscriberEmail) {
      console.log("[leads] Missing required fields")
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(subscriberEmail)) {
      console.log("[leads] Invalid email format")
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
      console.log("[leads] OnePage not found or not published")
      return NextResponse.json({ error: "OnePage not found" }, { status: 404 })
    }

    console.log("[leads] OnePage found:", onepage.id)

    const fileUrl = digital_product_file_url || null
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
        delivery_status: hasDigitalProduct ? "not_applicable" : "not_applicable",
        country_code: countryCode,
        country_name: countryName,
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
      console.error("[leads] Insert error:", insertError)
      return NextResponse.json({ error: "Failed to save" }, { status: 500 })
    }

    console.log("[leads] Lead saved:", lead.id)

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
        const { error: subscriberInsertError } = await adminSupabase.from("subscribers").insert({
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
        console.log("[leads] Added to subscribers")

        // Trigger new_subscriber email flows if insert was successful
        if (!subscriberInsertError) {
          await recordContactSource(adminSupabase, creatorId, subscriberEmail, leadSource)
          await recordSignupAttribution(adminSupabase, { creatorId, email: subscriberEmail, source: leadSource, sent: body.origin })
          try {
            await triggerEmailFlows(adminSupabase, {
              triggerType: "new_subscriber",
              creatorId,
              recipientEmail: subscriberEmail,
              recipientName: name || undefined,
              source: leadSource,
            })
            console.log("[leads] Triggered new_subscriber email flows")
          } catch (flowErr) {
            console.error("[leads] Email flow trigger error (non-fatal):", flowErr)
          }
        }
      } else if (existingSub.status === "unsubscribed" || existingSub.status === "customer" || existingSub.status === "wrote") {
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
            consent_text: "Subscribed via OnePage",
            consent_timestamp: new Date().toISOString(),
          })
          .eq("id", existingSub.id)
        console.log("[leads] Resubscribed")

        /* Joining again is joining, so the welcome goes, as it does above. */
        if (!resubError) {
          await recordContactSource(adminSupabase, creatorId, subscriberEmail, leadSource)
          await recordSignupAttribution(adminSupabase, { creatorId, email: subscriberEmail, source: leadSource, sent: body.origin })
          try {
            await triggerEmailFlows(adminSupabase, {
              triggerType: "new_subscriber",
              creatorId,
              recipientEmail: subscriberEmail,
              recipientName: name || undefined,
              source: leadSource,
            })
          } catch (flowErr) {
            console.error("[leads] Email flow trigger error (non-fatal):", flowErr)
          }
        }
      }
    }

    // No email sending - download happens directly on the page
    console.log("[leads] ========== REQUEST COMPLETE ==========")

    return NextResponse.json({
      success: true,
      lead_id: lead.id,
      downloadLink: hasDigitalProduct ? fileUrl : null,
    })

  } catch (error) {
    console.error("[leads] FATAL ERROR:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// GET - Fetch leads for owner
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
