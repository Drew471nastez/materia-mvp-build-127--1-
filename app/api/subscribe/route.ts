import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { v4 as uuidv4 } from "uuid"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, name, source, source_id, creator_id, consent_text } = body

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }
    if (!source) {
      return NextResponse.json({ error: "Source is required" }, { status: 400 })
    }
    if (!creator_id) {
      return NextResponse.json({ error: "Creator ID is required" }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const cleanEmail = email.toLowerCase().trim()
    if (!emailRegex.test(cleanEmail)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 })
    }

    const adminSupabase = createAdminClient()

    // Check if subscriber already exists for this creator
    const { data: existingSubscriber, error: checkError } = await adminSupabase
      .from("subscribers")
      .select("id, status")
      .eq("creator_id", creator_id)
      .eq("email", cleanEmail)
      .maybeSingle()

    if (checkError) {
      console.error("Error checking existing subscriber:", checkError)
      return NextResponse.json({ error: "Failed to check subscription status" }, { status: 500 })
    }

    if (existingSubscriber) {
      // If already subscribed, return success
      if (existingSubscriber.status === "subscribed") {
        return NextResponse.json({ success: true, message: "Already subscribed" }, { status: 200 })
      }

      // If previously unsubscribed, resubscribe them
      const { error: updateError } = await adminSupabase
        .from("subscribers")
        .update({
          status: "subscribed",
          is_active: true,
          subscribed_at: new Date().toISOString(),
          unsubscribed_at: null,
        })
        .eq("id", existingSubscriber.id)

      if (updateError) {
        console.error("Error resubscribing:", updateError)
        return NextResponse.json({ error: "Failed to resubscribe" }, { status: 500 })
      }

      return NextResponse.json({ success: true, message: "Resubscribed successfully" }, { status: 200 })
    }

    const unsubscribeToken = uuidv4()

    // Insert new subscriber
    const { data, error } = await adminSupabase
      .from("subscribers")
      .insert({
        email: cleanEmail,
        name: name || null,
        source,
        source_id: source_id || null,
        creator_id,
        status: "subscribed",
        is_active: true,
        subscribed_at: new Date().toISOString(),
        consent_text: consent_text || "I agree to receive email updates",
        consent_timestamp: new Date().toISOString(),
        unsubscribe_token: unsubscribeToken,
      })
      .select()
      .single()

    if (error) {
      console.error("Error saving subscriber:", error)
      return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 })
    }

    return NextResponse.json({ success: true, subscriber: data }, { status: 201 })
  } catch (error) {
    console.error("Subscribe error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
