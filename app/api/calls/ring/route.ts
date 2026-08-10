import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sendPushToUser } from "@/lib/push/sender"

/**
 * POST /api/calls/ring  { conversationId, callId, stage }  → { ok }
 *
 * ===========================================================================
 *  MAKING A PHONE THAT IS NOT LOOKING AT THIS APP RING
 * ===========================================================================
 *
 * The call itself is signalled over the realtime socket, which only reaches a
 * device with the app open. That covers the case where both people are already
 * in the conversation and no other. A call you can only receive while you are
 * already looking at the screen is not a call.
 *
 * So this is the second channel: a push, sent the instant the caller presses
 * the button, that wakes the device and says who is calling. The socket and the
 * push race, and whichever arrives first is right — the ringing screen is
 * driven by the call id, so being told twice about one call rings once.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS CANNOT DO, AND WHERE THE LINE IS
 * ---------------------------------------------------------------------------
 * This produces a NOTIFICATION, with a ringtone sound, that opens the call when
 * tapped. It does not produce the full-screen, slide-to-answer, rings-through-
 * silent-mode call UI that WhatsApp gets — that is CallKit on iOS and
 * ConnectionService on Android, reached through a VoIP push (PushKit), and all
 * three are native code plus an Apple VoIP certificate plus an App Store
 * release. None of that can ship from the web layer, which is where everything
 * in this repository ships from.
 *
 * The distinction in practice: app open or backgrounded, this rings properly.
 * Phone locked and the app killed, it arrives as a loud notification rather
 * than as an incoming call screen.
 *
 * ---------------------------------------------------------------------------
 * `stage`
 * ---------------------------------------------------------------------------
 *   ring    they are being called, now
 *   missed  nobody answered, or the caller gave up
 *
 * Both carry the same `collapseId`, which is the whole point of sending the
 * second one: it REPLACES the first rather than joining it, so a call that rang
 * out leaves one "missed call" line on the lock screen instead of a ringing
 * notification that lies about still ringing.
 */

export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  let body: { conversationId?: string; callId?: string; stage?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 })
  }

  const conversationId = String(body.conversationId ?? "")
  const callId = String(body.callId ?? "")
  const stage = body.stage === "missed" ? "missed" : "ring"
  if (!UUID_RE.test(conversationId) || !callId || callId.length > 64) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }

  // Membership decides who may ring whom, and it is RLS that decides
  // membership: a conversation that is not theirs reads as absent. Without this
  // the endpoint is "make any user's phone ring, by id".
  const { data: convo } = await supabase
    .from("conversations")
    .select("id, buyer_id, seller_id")
    .eq("id", conversationId)
    .maybeSingle()
  if (!convo) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const recipient = convo.buyer_id === user.id ? convo.seller_id : convo.buyer_id
  if (!recipient || recipient === user.id) {
    return NextResponse.json({ error: "No recipient" }, { status: 400 })
  }

  // The caller's own name, so the notification says who is ringing rather than
  // "Cineva". Read from profiles because the auth user has no display name.
  const { data: me } = await supabase
    .from("profiles")
    .select("display_name, username")
    .eq("id", user.id)
    .maybeSingle()
  const name = me?.display_name || me?.username || "Cineva"

  await sendPushToUser(recipient, {
    title: stage === "ring" ? `${name} te sună` : `Apel pierdut de la ${name}`,
    body: stage === "ring" ? "Apel vocal" : "Nu ai răspuns",
    // A ring has to be audible from a pocket, and it is the one push in this
    // app that is time-critical rather than informational.
    sound: stage === "ring" ? "default" : "default",
    // Replaces, rather than stacks — see the note above.
    collapseId: `call-${callId}`.slice(0, 64),
    threadId: `call-${conversationId}`,
    data: {
      kind: "call",
      stage,
      callId,
      conversationId,
      callerId: user.id,
      callerName: name,
      // Where a tap goes. The thread, not a call screen: by the time somebody
      // taps a missed-call notification the call is over, and a ringing one
      // opens the thread where the call host is already listening.
      url: `/messages/${conversationId}`,
    },
  })

  return NextResponse.json({ ok: true })
}
