import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * Answering an offer.
 *
 *   POST /api/messages/:id/offer { messageId, action: "accept" | "decline" }
 *
 * RLS already restricts updates to a participant who is NOT the sender — you
 * cannot accept your own offer. This route adds the semantic guards RLS cannot
 * express: only a pending offer can be answered, and the answer is one of two
 * words. Accepting also retires every other pending offer in the thread, so a
 * later "actually, 80?" cannot sit accept-able next to an accepted 100.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  let payload: { messageId?: string; action?: string }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 })
  }
  const { messageId, action } = payload
  if (!messageId || !UUID_RE.test(messageId) || (action !== "accept" && action !== "decline")) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }

  const { data: offer } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_id, kind, offer_status")
    .eq("id", messageId)
    .eq("conversation_id", id)
    .maybeSingle()
  if (!offer || offer.kind !== "offer") return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (offer.sender_id === user.id) return NextResponse.json({ error: "You made this offer" }, { status: 400 })
  if (offer.offer_status !== "pending") return NextResponse.json({ error: "Already answered" }, { status: 409 })

  const status = action === "accept" ? "accepted" : "declined"
  const { error } = await supabase
    .from("messages")
    .update({ offer_status: status })
    .eq("id", messageId)
    .eq("offer_status", "pending") // races resolve to one winner, not two answers
  if (error) return NextResponse.json({ error: "Could not update" }, { status: 500 })

  if (status === "accepted") {
    await supabase
      .from("messages")
      .update({ offer_status: "declined" })
      .eq("conversation_id", id)
      .eq("kind", "offer")
      .eq("offer_status", "pending")
      .neq("id", messageId)
  }

  await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", id)

  return NextResponse.json({ status })
}
