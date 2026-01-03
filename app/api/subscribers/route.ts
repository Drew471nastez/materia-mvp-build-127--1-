import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { email, creatorId } = await request.json()

    if (!email || !creatorId) {
      return NextResponse.json({ error: "Email and creator ID are required" }, { status: 400 })
    }

    const supabase = await createClient()

    // Save subscriber (you'll need to create this table in your database)
    const { error } = await supabase.from("subscribers").insert({
      email,
      creator_id: creatorId,
      subscribed_at: new Date().toISOString(),
    })

    if (error) {
      console.error("Subscriber insert error:", error)
      return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Subscribe error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
