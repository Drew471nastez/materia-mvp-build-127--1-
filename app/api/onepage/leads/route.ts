import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { v4 as uuidv4 } from "uuid"
import { sendLeadMagnetEmail } from "@/lib/email"

// POST - Submit a lead (public, no auth required)
export async function POST(request: Request) {
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
      // Digital product fields (quick upload files)
      enable_digital_product,
      digital_product_file_url,
      digital_product_title,
    } = body

    if (!onepage_id || !email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 })
    }

    // Verify the onepage exists and is published, and get creator info
    const { data: onepage, error: onepageError } = await supabase
      .from("onepages")
      .select("id, status, seller_id, owner_id, creator_id")
      .eq("id", onepage_id)
      .eq("status", "published")
      .single()

    if (onepageError || !onepage) {
      return NextResponse.json({ error: "OnePage not found" }, { status: 404 })
    }

    // Use the file URL and title directly from the block data
    const actualFileUrl = digital_product_file_url
    const actualProductTitle = digital_product_title || "Free Download"

    // Log digital product info for debugging
    console.log("[leads] Digital product info:", {
      enable_digital_product,
      digital_product_file_url: actualFileUrl ? "present" : "missing",
      digital_product_title: actualProductTitle,
    })

    // Check if email already submitted for this page (use admin client for anonymous access)
    const { data: existingLead } = await adminSupabase
      .from("onepage_leads")
      .select("id")
      .eq("onepage_id", onepage_id)
      .eq("email", email.toLowerCase().trim())
      .single()

    if (existingLead) {
      // Return success even if already exists, but still provide download URL
      return NextResponse.json({
        success: true,
        message: "Already subscribed",
        downloadLink: enable_digital_product && actualFileUrl ? actualFileUrl : null,
      })
    }

    // Insert lead using admin client to bypass RLS for anonymous users
    const { data: lead, error: insertError } = await adminSupabase
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
        lead_magnet_id: lead_magnet_id || null,
        delivery_status: enable_digital_product && actualFileUrl ? "pending" : "not_applicable",
      })
      .select()
      .single()

    if (insertError) {
      // Handle unique constraint violation gracefully
      if (insertError.code === "23505") {
        return NextResponse.json({
          success: true,
          message: "Already subscribed",
          downloadLink: enable_digital_product && actualFileUrl ? actualFileUrl : null,
        })
      }
      console.error("Lead insert error:", insertError)
      return NextResponse.json({ error: "Failed to save" }, { status: 500 })
    }

    // Also add to subscribers list for the creator/seller
    const subscriberCreatorId = onepage.creator_id || onepage.seller_id || onepage.owner_id
    if (subscriberCreatorId) {
      const unsubscribeToken = uuidv4()
      const { data: existingSubscriber } = await adminSupabase
        .from("subscribers")
        .select("id, status")
        .eq("creator_id", subscriberCreatorId)
        .eq("email", email.toLowerCase().trim())
        .single()

      if (!existingSubscriber) {
        // Create new subscriber
        await adminSupabase.from("subscribers").insert({
          email: email.toLowerCase().trim(),
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

    // Send digital product email if enabled
    let emailSent = false
    if (enable_digital_product && actualFileUrl && actualProductTitle) {
      try {
        // Use creator_id first, then owner_id, then seller_id for resolving identity
        const creatorId = onepage.creator_id || onepage.owner_id || onepage.seller_id
        console.log("[leads] 📧 Sending lead magnet email:", {
          creatorId,
          to: email,
          product: actualProductTitle,
          fileUrl: actualFileUrl.substring(0, 50) + "...",
        })
        const emailResult = await sendLeadMagnetEmail(adminSupabase, {
          recipientEmail: email.toLowerCase().trim(),
          productTitle: actualProductTitle,
          productFileUrl: actualFileUrl,
          creatorId: creatorId || undefined,
          onepageId: onepage_id,
        })

        if (emailResult.success) {
          emailSent = true
          // Update lead delivery status
          await adminSupabase
            .from("onepage_leads")
            .update({
              delivery_status: "sent",
              delivered_at: new Date().toISOString(),
            })
            .eq("id", lead.id)
        } else {
          console.error("Failed to send lead magnet email:", emailResult.error)
          // Update lead delivery status to failed
          await adminSupabase
            .from("onepage_leads")
            .update({ delivery_status: "failed" })
            .eq("id", lead.id)
        }
      } catch (emailError) {
        console.error("Error sending lead magnet email:", emailError)
        await adminSupabase
          .from("onepage_leads")
          .update({ delivery_status: "failed" })
          .eq("id", lead.id)
      }
    } else {
      console.log("[leads] 📭 Digital product email NOT sent - conditions not met:", {
        enable_digital_product,
        hasFileUrl: !!actualFileUrl,
        hasTitle: !!actualProductTitle,
      })
    }

    return NextResponse.json({
      success: true,
      lead_id: lead.id,
      email_sent: emailSent,
      downloadLink: enable_digital_product && actualFileUrl ? actualFileUrl : null,
    })
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
