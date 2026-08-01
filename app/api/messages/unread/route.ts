import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getSessionUserId } from "@/lib/auth/current-user"

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
  // The bottom nav asks this from every page, so the identity is read locally
  // out of the session cookie rather than re-validated over the network. The
  // count below runs on the caller's own client, so RLS is what decides which
  // rows exist to be counted — the id only picks out which of the caller's own
  // messages are someone else's, and a cookie the database won't vouch for
  // counts nothing at all.
  const userId = await getSessionUserId(supabase)
  if (!userId) return NextResponse.json({ count: 0 })

  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .neq("sender_id", userId)
    .is("read_at", null)

  return NextResponse.json({ count: count ?? 0 })
}
