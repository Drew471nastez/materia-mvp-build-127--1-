import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getSessionUserId } from "@/lib/auth/current-user"

/**
 * GET /api/notifications/unread → { count }
 *
 * The inbox asks this on mount to draw the red dot on the Notificări segment,
 * so it is the cheapest possible question: one head count over the partial
 * unread index, with RLS scoping the rows to the caller. A signed-out visitor
 * — or a database where the migration has not run yet — reads as zero, because
 * a badge should never be the thing that errors.
 */
export async function GET() {
  const supabase = await createClient()
  // A badge on a segmented control does not warrant a round trip to the auth
  // server: the id is read locally from the session cookie, and the head count
  // below goes through the caller's own client, where RLS on notifications is
  // what actually restricts the rows to this user.
  const userId = await getSessionUserId(supabase)
  if (!userId) return NextResponse.json({ count: 0 })

  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null)

  return NextResponse.json({ count: count ?? 0 })
}
