import { after, type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createNotification } from "@/lib/notifications"
import { announceInbox, announceThread } from "@/lib/messages/announce"
import { listConversations, optionalAdminClient } from "@/lib/messages/list"
import { runMessagePush } from "@/lib/push/message-db"

/**
 * The inbox, and the way into it.
 *
 *   GET  /api/messages                                  → { conversations: [...] }
 *   POST /api/messages { listingId, body?, offerCents? } → { conversationId }
 *
 * POST is find-or-create: messaging a seller about a listing you already have a
 * thread for lands in that thread. Writes go through the caller's own client so
 * RLS enforces membership; the admin client only resolves the seller (listing →
 * creator → user, a chain the caller has no SELECT rights over) and enriches
 * the inbox with listing and profile fields.
 *
 * GET's body lives in lib/messages/list.ts, because /messages now renders that
 * same list on the server for its first paint and the two must produce exactly
 * the same rows — the client swaps the server's array for a fetched one on its
 * next refresh, and any difference between them would read as the inbox
 * rearranging itself after it had already arrived. The client/admin split it
 * relies on is documented there and unchanged: the caller's client reads the
 * conversations, the service role only decorates them.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  try {
    const conversations = await listConversations({
      asCaller: supabase,
      asAdmin: optionalAdminClient(),
      userId: user.id,
    })
    return NextResponse.json({ conversations })
  } catch {
    return NextResponse.json({ error: "Failed to load" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  let payload: { listingId?: string; body?: string; offerCents?: number }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 })
  }
  const listingId = payload.listingId
  const body = typeof payload.body === "string" ? payload.body.trim().slice(0, 2000) : ""
  const offerCents = Number.isFinite(payload.offerCents) ? Math.round(payload.offerCents as number) : null
  if (!listingId || !UUID_RE.test(listingId)) return NextResponse.json({ error: "Bad listing" }, { status: 400 })
  if (offerCents !== null && offerCents <= 0) return NextResponse.json({ error: "Bad offer" }, { status: 400 })

  // Neither a message nor an offer is a valid request, and it is the one every
  // marketplace actually needs: "message this seller about this item" opens the
  // conversation and lets you type IN it, rather than making you compose your
  // first sentence in a modal on the product page before you are allowed in.
  // The thread is created, nothing is said, and nobody is notified — a seller
  // does not want a ping for a buyer who opened a chat window and thought
  // better of it.
  const openOnly = !body && offerCents === null

  // Resolve the seller. Admin client: products → creators is not a chain the
  // caller can read, and the answer is not secret — it's who they're writing to.
  const admin = createAdminClient()
  const { data: listing } = await admin
    .from("products")
    .select("id, status, price_cents, creator_id")
    .eq("id", listingId)
    .maybeSingle()
  if (!listing || listing.status !== "published") {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 })
  }
  const { data: creator } = await admin
    .from("creators")
    .select("user_id")
    .eq("id", listing.creator_id)
    .maybeSingle()
  const sellerId = creator?.user_id
  if (!sellerId) return NextResponse.json({ error: "Seller not found" }, { status: 404 })
  if (sellerId === user.id) return NextResponse.json({ error: "That's your own listing" }, { status: 400 })
  // An offer above asking is a purchase with extra steps — cap it at list price.
  if (offerCents !== null && listing.price_cents && offerCents > listing.price_cents) {
    return NextResponse.json({ error: "Offer exceeds the asking price" }, { status: 400 })
  }

  // Find-or-create through the caller's client, so RLS holds buyer_id = caller.
  let conversationId: string | null = null
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("listing_id", listingId)
    .eq("buyer_id", user.id)
    .maybeSingle()
  if (existing) {
    conversationId = existing.id
  } else {
    const { data: created, error: createErr } = await supabase
      .from("conversations")
      .insert({ listing_id: listingId, buyer_id: user.id, seller_id: sellerId })
      .select("id")
      .single()
    if (createErr || !created) return NextResponse.json({ error: "Could not start conversation" }, { status: 500 })
    conversationId = created.id
  }

  if (openOnly) return NextResponse.json({ conversationId })

  // `.select("id").single()` turns this into a RETURNING insert. The id is the
  // idempotency key for the push — without it this path could not be
  // deduplicated at all, and it is the one path that can run twice for the same
  // intent (a retried "message this seller" finds the existing conversation and
  // inserts a second message).
  const { data: insertedFirst, error: msgErr } = await supabase
    .from("messages")
    .insert(
      offerCents !== null
        ? {
            conversation_id: conversationId,
            sender_id: user.id,
            kind: "offer",
            offer_cents: offerCents,
            offer_status: "pending",
            body: body || null,
          }
        : { conversation_id: conversationId, sender_id: user.id, kind: "text", body },
    )
    .select("id")
    .single()
  if (msgErr || !insertedFirst) return NextResponse.json({ error: "Could not send" }, { status: 500 })

  await Promise.all([
    supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId),
    // This route is the ONLY one that can create a conversation that did not
    // exist a moment ago, which is precisely the case a per-thread subscription
    // structurally cannot cover: the seller's inbox is not listening to a
    // channel for a thread nobody had opened. Their list would have waited out
    // a thirty-second poll for the one message most worth seeing immediately —
    // a stranger asking about something they are selling.
    announceInbox(sellerId),
    announceThread(conversationId as string),
    // The seller hears about it either way; an offer is louder than a message.
    createNotification(admin, {
      userId: sellerId,
      kind: offerCents !== null ? "offer_received" : "message",
      actorId: user.id,
      listingId,
      conversationId,
    }),
  ])

  /**
   * The push, after the response — see app/api/messages/[id]/route.ts.
   *
   * Below the `openOnly` return above, deliberately. "Message this seller"
   * creates the thread and says nothing, and a notification for a conversation
   * somebody opened and thought better of is a ping for an event that did not
   * happen. This is the only one of the three creation paths that can insert no
   * message at all, and it returns before reaching here when it does — which is
   * also why there is no duplicate: exactly one row, exactly one push.
   */
  after(() => {
    void runMessagePush({
      messageId: insertedFirst.id as string,
      conversationId: conversationId as string,
      senderId: user.id,
      recipientId: sellerId,
      kind: offerCents !== null ? "offer" : "text",
      body,
      offerCents,
    }).catch((e) => console.error("[push:message] failed:", e?.message ?? e))
  })

  return NextResponse.json({ conversationId })
}
