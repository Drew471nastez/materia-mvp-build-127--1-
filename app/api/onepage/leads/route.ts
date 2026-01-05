import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { v4 as uuidv4 } from "uuid"

// POST - Submit a lead (public, no auth required)
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    const body = await request.json()
    const { onepage_id, email, name, block_id, referrer, utm_source, utm_medium, utm_campaign } = body

    if (!onepage_id || !email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 })
    }

    // Verify the onepage exists and is published, and get seller_id
    const { data: onepage, error: onepageError } = await supabase
      .from("onepages")
      .select("id, status, seller_id")
      .eq("id", onepage_id)
      .eq("status", "published")
      .single()

    if (onepageError || !onepage) {
      return NextResponse.json({ error: "OnePage not found" }, { status: 404 })
    }

    // Check if email already submitted for this page
    const { data: existingLead } = await supabase
      .from("onepage_leads")
      .select("id")
      .eq("onepage_id", onepage_id)
      .eq("email", email.toLowerCase().trim())
      .single()

    if (existingLead) {
      // Return success even if already exists (good UX)
      return NextResponse.json({ success: true, message: "Already subscribed" })
    }

    // Insert lead
    const { data: lead, error: insertError } = await supabase
      .from("onepage_leads")
      .insert({
        onepage_id,
        email: email.toLowerCase().trim(),
        name: name || null,
        block_id: block_id || null,
        referrer: referrer || null,
        utm_source: utm_source || null,
        utm_medium: utm_medium || null,
        utm_campaign: utm_campaign || null,
        delivery_status: "not_applicable", // Change to 'pending' if lead magnet configured
      })
      .select()
      .single()

    if (insertError) {
      // Handle unique constraint violation gracefully
      if (insertError.code === "23505") {
        return NextResponse.json({ success: true, message: "Already subscribed" })
      }
      console.error("Lead insert error:", insertError)
      return NextResponse.json({ error: "Failed to save" }, { status: 500 })
    }

    // Also add to subscribers list for the seller
    if (onepage.seller_id) {
      const unsubscribeToken = uuidv4()
      const { data: existingSubscriber } = await adminSupabase
        .from("subscribers")
        .select("id, status")
        .eq("creator_id", onepage.seller_id)
        .eq("email", email.toLowerCase().trim())
        .single()

      if (!existingSubscriber) {
        // Create new subscriber
        await adminSupabase.from("subscribers").insert({
          email: email.toLowerCase().trim(),
          name: name || null,
          source: "onepage",
          source_id: onepage_id,
          creator_id: onepage.seller_id,
          status: "subscribed",
          is_active: true,
          subscribed_at: new Date().toISOString(),
          consent_text: "Subscribed via OnePage email form",
          consent_timestamp: new Date().toISOString(),
          unsubscribe_token: unsubscribeToken,
        })
      } else if (existingSubscriber.status === "unsubscribed") {
        // Resubscribe
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

    return NextResponse.json({ success: true, lead_id: lead.id })
  } catch (error) {
    console.error("Lead submission error:", error)
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

    // Get user's onepage
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
      console.error("Leads fetch error:", error)
      return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 })
    }

    return NextResponse.json({ leads, total: count })
  } catch (error) {
    console.error("Leads GET error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
