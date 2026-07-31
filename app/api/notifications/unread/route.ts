import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

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
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ count: 0 })

  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null)

  return NextResponse.json({ count: count ?? 0 })
}
