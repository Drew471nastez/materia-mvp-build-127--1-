import { NextResponse, after } from "next/server"
import { headers } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { onePageActor } from "@/lib/team/onepage"
import { permits } from "@/lib/team/permissions"
import { createAdminClient } from "@/lib/supabase/admin"
import { triggerEmailFlows } from "@/lib/email"
import { contactSourceFrom, recordContactSource } from "@/lib/contacts/contact-source"
import { recordSignupAttribution } from "@/lib/attribution/server"
import { fromOfHost } from "@/lib/orders/order-source"
import { v4 as uuidv4 } from "uuid"
import { rateLimit, addressSubject, emailSubject, LIMITS } from "@/lib/api/rate-limit"
import { signupLooksAutomated, signupName } from "@/lib/onepage/creator-blocks"
import { signupFileFor } from "@/lib/onepage/signup-file"
import { deliverSignup, pageSignup } from "@/lib/onepage/integrations/deliver-server"

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
    /* A script (the block's hidden field filled, or sent faster than a person can): told it worked, and nothing is written (lib/onepage/creator-blocks). */
    if (signupLooksAutomated(body)) return NextResponse.json({ success: true })
    const name = signupName(body?.name)
    const {
      onepage_id,
      email,
      block_id,
      referrer,
      utm_source,
      utm_medium,
      utm_campaign,
      lead_magnet_id,
      enable_digital_product,
      digital_product_file_url,
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

    /* Counted by address and by the address being signed up, as every other sign-up form is (lib/api/rate-limit; app/api/onepage/email-capture). It had no limit. */
    const limited = await rateLimit({
      bucket: "email-capture",
      subjects: [addressSubject(request), emailSubject(subscriberEmail)],
      windows: LIMITS.subscribe,
      message: "That is a lot of sign-ups at once. Try again in a minute.",
    })
    if (limited) return limited

    // Verify onepage exists and is published
    const { data: onepage, error: onepageError } = await supabase
      .from("onepages")
      .select("id, status, seller_id, owner_id, creator_id, published_blocks, draft_blocks")
      .eq("id", onepage_id)
      .eq("status", "published")
      .single()

    if (onepageError || !onepage) {
      console.log("[leads] OnePage not found or not published")
      return NextResponse.json({ error: "OnePage not found" }, { status: 404 })
    }

    console.log("[leads] OnePage found:", onepage.id)

    /*
      THE FILE IS THE PAGE'S, NOT THE REQUEST'S (round 40). Whether this
      signup gets a file, and which, is read from the block on the published
      page (lib/onepage/signup-file), so a request cannot make this route
      hand back an address of its own choosing, and a block whose file was
      switched off or removed since the page was loaded gives nothing. The
      request's own fields are only read for a page saved before blocks had
      ids to find them by.
    */
    const pageFile = signupFileFor((onepage as { published_blocks?: unknown }).published_blocks ?? (onepage as { draft_blocks?: unknown }).draft_blocks, block_id)
    const fileUrl = pageFile.found ? pageFile.url : (enable_digital_product && typeof digital_product_file_url === "string" && /^https:\/\//i.test(digital_product_file_url) ? digital_product_file_url : null)
    const hasDigitalProduct = !!fileUrl

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
    /*
      THE COUNTRY IS A NICETY, THE ADDRESS IS NOT. country_code and
      country_name are written here and created by no SQL file in this
      repository (tests/e2e-onepage-signup.test.ts builds the database from
      them and has no such columns). Where a database lacks them the insert
      was refused and the visitor saw nothing happen: the lead is now saved
      without them instead.
    */
    const insertLead = (row: Record<string, unknown>) => adminSupabase.from("onepage_leads").insert(row).select().single()
    const leadRow: Record<string, unknown> = {
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
    }
    let { data: lead, error: insertError } = await insertLead(leadRow)
    if (insertError && (insertError.code === "PGRST204" || insertError.code === "42703")) {
      const withoutCountry = Object.fromEntries(Object.entries(leadRow).filter(([k]) => k !== "country_code" && k !== "country_name"))
      ;({ data: lead, error: insertError } = await insertLead(withoutCountry))
    }

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

    /*
      THE CREATOR'S OWN TOOLS GET IT TOO: Mailchimp, Kit, beehiiv, a Zapier,
      Make or Sheets hook (lib/onepage/integrations), after the answer, so the
      visitor never waits for them. Klaviyo and Omnisend take it from the
      subscriber list on their own sync (lib/integrations/marketing).
    */
    const toolsOwner = onepage.seller_id || onepage.creator_id || null
    after(() => deliverSignup(adminSupabase, toolsOwner, pageSignup({ email: subscriberEmail, name, form: "signup", blockId: block_id, onepageId: onepage_id, pageUrl: request.headers.get("referer"), eventId: lead.id })))

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

    /*
      Whose leads (lib/team/onepage). The emails people left are the store's
      customers: a team member sees them only with Customers as well as
      OnePage. The owner, as before.
    */
    const actor = await onePageActor(supabase, user.id)
    if (actor instanceof NextResponse) return actor
    if (actor.acting && !permits(actor.acting.permissions, "customers")) {
      return NextResponse.json({ error: "Signups are with Customers. Ask the store's owner for it." }, { status: 403, headers: { "Cache-Control": "no-store" } })
    }
    const db = actor.db

    const { data: onepage } = await db
      .from("onepages")
      .select("id")
      .eq("owner_id", actor.pageOwnerId)
      .single()

    if (!onepage) {
      return NextResponse.json({ leads: [] })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = parseInt(searchParams.get("offset") || "0")

    const { data: leads, error, count } = await db
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
