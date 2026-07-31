import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /api/messages/unread → { count }
 *
 * The bottom nav asks this on every surface, so it is the cheapest possible
 * question: one indexed count, and RLS does the scoping — messages the caller
 * can see are exactly the messages in their conversations, so "unread by me"
 * is nothing more than "not mine and not read".
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ count: 0 })

  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .neq("sender_id", user.id)
    .is("read_at", null)

  return NextResponse.json({ count: count ?? 0 })
}
