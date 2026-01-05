import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const { email, name, source, source_id, creator_id, consent_text } = await request.json()

    if (!email || !source || !creator_id) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Insert subscriber (using upsert to handle duplicates)
    const { data, error } = await supabase
      .from("subscribers")
      .upsert(
        {
          email: email.toLowerCase().trim(),
          name: name || null,
          source,
          source_id,
          creator_id,
          status: "subscribed",
          is_active: true,
          subscribed_at: new Date().toISOString(),
          consent_text: consent_text || "I agree to receive email updates",
          consent_timestamp: new Date().toISOString(),
        },
        {
          onConflict: "creator_id,email",
          ignoreDuplicates: false,
        }
      )
      .select()
      .single()

    if (error) {
      // If it's a unique constraint violation, the subscriber already exists
      if (error.code === "23505") {
        return NextResponse.json(
          { success: true, message: "Already subscribed" },
          { status: 200 }
        )
      }
      console.error("Error saving subscriber:", error)
      return NextResponse.json(
        { error: "Failed to subscribe" },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { success: true, subscriber: data },
      { status: 201 }
    )
  } catch (error) {
    console.error("Subscribe error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
