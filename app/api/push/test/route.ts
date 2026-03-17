import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sendPushToUser } from "@/lib/push/sender"

/**
 * POST /api/push/test
 * Sends a test push notification to the logged-in user.
 * TEMPORARY — remove this route before production launch.
 */
export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await sendPushToUser(user.id, {
    title: "Test push",
    body: "Storelib push is working",
    sound: "cash",
  })

  return NextResponse.json({ ok: true })
}
