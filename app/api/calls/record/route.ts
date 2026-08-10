import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { announceInbox, announceThread } from "@/lib/messages/announce"
import { encodeCallBody } from "@/lib/messages/call-message"
import type { CallEnding } from "@/lib/calls/protocol"

/**
 * POST /api/calls/record  { conversationId, ending, ms }  → { message }
 *
 * The line a finished call leaves in the thread. See lib/messages/call-message
 * for why it is an ordinary text row with a sentinel rather than a new kind.
 *
 * ---------------------------------------------------------------------------
 * ONLY THE CALLER WRITES IT
 * ---------------------------------------------------------------------------
 * Both ends know the call ended, so both could write, and then every call would
 * leave two lines. Deduplicating after the fact means a shared key, an index,
 * and a race — for a problem that disappears if one end is simply responsible.
 *
 * The caller is the end that knows every ending: it cancelled, or it was
 * declined, or it rang out, or it connected and somebody hung up. The callee
 * only knows the ones it caused. So the caller writes, and the callee writes
 * nothing at all.
 *
 * The cost is honest: if the caller's app dies mid-call the line is missing.
 * The alternative costs a duplicate on every call, and a call that happened
 * with no line is better than a call that happened twice.
 *
 * NO PUSH. A missed call has already sent one — from the ring route, replacing
 * the ringing notification. Sending another here would be the same event
 * arriving twice, once as "missed call" and once as "new message".
 */

export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ENDINGS: CallEnding[] = ["ended", "missed", "declined", "cancelled", "failed"]
/** A call longer than this is a stuck timer, not a conversation. */
const MAX_MS = 6 * 60 * 60 * 1000

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  let body: { conversationId?: string; ending?: string; ms?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 })
  }

  const conversationId = String(body.conversationId ?? "")
  const ending = body.ending as CallEnding
  if (!UUID_RE.test(conversationId) || !ENDINGS.includes(ending)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
  const ms = Math.min(MAX_MS, Math.max(0, Math.round(Number(body.ms) || 0)))

  const { data: convo } = await supabase
    .from("conversations")
    .select("id, buyer_id, seller_id")
    .eq("id", conversationId)
    .maybeSingle()
  if (!convo) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data: inserted, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      kind: "text",
      body: encodeCallBody(ending, ending === "ended" ? ms : 0),
    })
    .select("id, sender_id, kind, body, offer_cents, offer_status, created_at, read_at")
    .single()

  if (error || !inserted) {
    console.error("[calls/record] insert failed:", error)
    return NextResponse.json({ error: "Nu am putut salva apelul." }, { status: 500 })
  }

  const recipient = convo.buyer_id === user.id ? convo.seller_id : convo.buyer_id
  await Promise.all([
    announceThread(conversationId),
    recipient ? announceInbox(recipient) : Promise.resolve(),
    supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId),
  ])

  return NextResponse.json({ message: inserted })
}
