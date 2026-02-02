import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { triggerEmailFlows } from "@/lib/email"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const { email, creatorId, name } = await request.json()

    if (!email || !creatorId) {
      return NextResponse.json({ error: "Email and creator ID are required" }, { status: 400 })
    }

    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    // Save subscriber (you'll need to create this table in your database)
    const { error } = await supabase.from("subscribers").insert({
      email,
      name: name || null,
      creator_id: creatorId,
      subscribed_at: new Date().toISOString(),
      status: "subscribed",
      is_active: true,
    })

    if (error) {
      console.error("Subscriber insert error:", error)
      return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 })
    }

    // Trigger new_subscriber email flows
    try {
      await triggerEmailFlows(adminSupabase, {
        triggerType: "new_subscriber",
        creatorId,
        recipientEmail: email,
        recipientName: name || undefined,
      })
    } catch (flowErr) {
      console.error("[subscribers] Email flow trigger error (non-fatal):", flowErr)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Subscribe error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
