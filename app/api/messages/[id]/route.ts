import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { readSessionAuth } from "@/lib/auth/current-user"
import { createNotification } from "@/lib/notifications"
import { readThread } from "@/lib/messages/thread"
import { announceInbox, announceThread } from "@/lib/messages/announce"

/**
 * One conversation.
 *
 *   GET  /api/messages/:id                       → thread, listing, other party
 *   POST /api/messages/:id { body? offerCents? } → append a message
 *
 * GET also marks the other side's messages read — opening the thread IS reading
 * it, and a separate receipt endpoint would just be this with extra requests.
 * Everything runs on the caller's client except the listing/profile enrichment,
 * so RLS is the membership check: a conversation that isn't yours 404s.
 *
 * A thread with Storelib is the same object with listing_id null and an
 * official party on the other end, so both are handled as absences rather than
 * as a second code path.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 })

  const supabase = await createClient()
  // An open thread re-reads this on a timer, so the identity comes from the
  // session cookie rather than the auth server. Nothing here trusts that id on
  // its own: the conversation is fetched through the caller's client, so RLS is
  // still the membership check — a thread that isn't yours 404s below exactly
  // as it did before — and the admin client further down is only ever handed
  // ids that came back out of that RLS-scoped row.
  const auth = await readSessionAuth(supabase)
  // A session we could not read is not a session that isn't there. Saying 401
  // here would send the poller's client straight to /login on a transient auth
  // failure; 503 tells it to leave the reader where they are and try again.
  if (auth.status === "indeterminate") {
    return NextResponse.json({ error: "Auth unavailable" }, { status: 503 })
  }
  if (!auth.userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const user = { id: auth.userId }

  // The body of this lives in lib/messages/thread.ts, because /messages/[id]
  // now renders the same conversation on the server for its first paint and the
  // two must produce exactly the same object — the client swaps the server's for
  // a fetched one on its next poll, and any difference between them would read
  // as the thread rearranging itself after it had already arrived.
  // `?before=<iso>` asks for the page OLDER than that, which is how the client
  // walks backwards through a long conversation. Validated as a date rather
  // than trusted: it goes into a `lt()` on an indexed timestamp column, and a
  // string that is not one would be a query error rather than an empty page.
  const beforeParam = new URL(_req.url).searchParams.get("before")
  const before = beforeParam && !Number.isNaN(Date.parse(beforeParam)) ? beforeParam : null

  const payload = await readThread({ asCaller: supabase, userId: user.id, id, before })
  if (!payload) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(payload)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  let payload: { body?: string; offerCents?: number }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 })
  }
  const body = typeof payload.body === "string" ? payload.body.trim().slice(0, 2000) : ""
  const offerCents = Number.isFinite(payload.offerCents) ? Math.round(payload.offerCents as number) : null
  if (!body && !offerCents) return NextResponse.json({ error: "Empty message" }, { status: 400 })
  if (offerCents !== null && offerCents <= 0) return NextResponse.json({ error: "Bad offer" }, { status: 400 })

  // RLS proves membership: a conversation the caller isn't in reads as absent.
  // The party and listing columns come along so the notification below knows
  // who to address without a second read. Writing to Storelib needs no special
  // case — the caller is the buyer_id on that thread, so the same policy that
  // lets them answer a seller lets them answer support.
  const { data: convo } = await supabase
    .from("conversations")
    .select("id, listing_id, buyer_id, seller_id")
    .eq("id", id)
    .maybeSingle()
  if (!convo) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Blocking has to stop the messages, not just hide the thread.
  //
  // It hid the conversation from the person who blocked and left the sender able
  // to keep writing into it, which is the shape of the bug that makes a block
  // feel like a setting rather than a boundary — every new message would quietly
  // resurrect the thread they had just removed.
  //
  // Checked in one direction only, and deliberately: if THEY blocked YOU, you
  // are refused. If you blocked them, your own message still goes — you can
  // always write to someone you have blocked, you simply do not hear back. And
  // the refusal says nothing about a block existing, because "you have been
  // blocked" is information the blocked party is not owed.
  const otherParty = convo.buyer_id === user.id ? convo.seller_id : convo.buyer_id
  const { data: blockedBy } = await createAdminClient()
    .from("user_blocks")
    .select("blocker_id")
    .eq("blocker_id", otherParty)
    .eq("blocked_id", user.id)
    .maybeSingle()
  if (blockedBy) {
    return NextResponse.json({ error: "Nu poți trimite mesaje în această conversație." }, { status: 403 })
  }

  // A ceiling on how fast one person can write into one thread.
  //
  // Not a performance measure — an abuse one. Without it, a script with a valid
  // session can push thousands of rows into somebody's inbox in a minute, and
  // every one of them fires a notification. Twenty in thirty seconds is far
  // above what a person types and far below what a loop does, and it is counted
  // per conversation so a busy seller answering five buyers at once is never
  // the one who trips it.
  //
  // Counted from the table rather than held in memory on purpose: serverless
  // instances do not share memory, so an in-process counter is a limit that
  // resets whenever the platform decides to scale.
  const since = new Date(Date.now() - 30_000).toISOString()
  const { count: recent } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", id)
    .eq("sender_id", user.id)
    .gte("created_at", since)
  if ((recent ?? 0) >= 20) {
    return NextResponse.json(
      { error: "Prea multe mesaje trimise. Așteaptă câteva secunde." },
      { status: 429 },
    )
  }

  const { data: inserted, error } = await supabase
    .from("messages")
    .insert(
      offerCents !== null
        ? {
            conversation_id: id,
            sender_id: user.id,
            kind: "offer",
            offer_cents: offerCents,
            offer_status: "pending",
            body: body || null,
          }
        : { conversation_id: id, sender_id: user.id, kind: "text", body },
    )
    .select("id, sender_id, kind, body, offer_cents, offer_status, created_at, read_at")
    .single()
  if (error || !inserted) {
    // The database has its own limits under this route's — see the abuse-limits
    // section of supabase/sql/RUN_MESSAGING_ALL.sql. They exist because
    // PostgREST is reachable without going through here at all, so the app's
    // rate limit is not the last word. When one of them fires on a request that
    // DID come through here, it is worth saying what happened rather than
    // reporting a server fault the user cannot act on.
    const raised = error?.message ?? ""
    if (raised.startsWith("rate_limited")) {
      return NextResponse.json(
        { error: "Prea multe mesaje trimise. Așteaptă câteva secunde." },
        { status: 429 },
      )
    }
    if (raised.startsWith("blocked")) {
      return NextResponse.json(
        { error: "Nu poți trimite mesaje în această conversație." },
        { status: 403 },
      )
    }
    console.error("[messages/send] insert failed:", raised)
    return NextResponse.json({ error: "Could not send" }, { status: 500 })
  }

  // The doorbell first, then the bookkeeping. Announcing before the
  // notification insert takes a database round trip out of the path between the
  // row being committed and the other person's screen knowing about it — and
  // nothing below can fail in a way that should stop it ringing.
  const recipient = convo.buyer_id === user.id ? convo.seller_id : convo.buyer_id
  await Promise.all([
    announceThread(id),
    // …and their conversation LIST, which is a different screen with a
    // different subscription. Somebody sitting on their inbox sees the row move
    // and the unread count change now, rather than on a thirty-second poll.
    announceInbox(recipient),
    supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", id),
    // Whoever is on the other side of this thread hears about the new message.
    // listing_id is null on a system thread, which the notification already
    // treats as "about no particular item". Consecutive messages collapse into
    // one unread row — see lib/notifications.ts.
    createNotification(createAdminClient(), {
      userId: convo.buyer_id === user.id ? convo.seller_id : convo.buyer_id,
      kind: offerCents !== null ? "offer_received" : "message",
      actorId: user.id,
      listingId: convo.listing_id,
      conversationId: id,
    }),
  ])

  return NextResponse.json({ message: inserted })
}
