import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createNotification } from "@/lib/notifications"
import {
  ensureSystemConversation,
  fetchProfilesWithOfficial,
  getSystemUserId,
  isOfficialProfile,
  type OfficialProfile,
} from "@/lib/system-account"

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
 * GET carries one extra job: it is where the official Storelib thread comes
 * into existence, so nobody's first visit here is a blank page. That thread has
 * no listing behind it, which is why the enrichment below treats listing_id as
 * optional throughout.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type ConvoRow = {
  id: string
  listing_id: string | null
  buyer_id: string
  seller_id: string
  last_message_at: string
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  // The admin client both creates the Storelib thread and decorates the rows,
  // so it is built before anything else — and treated as optional. An
  // environment with no service role key should still show its conversations,
  // undecorated, rather than fail the whole inbox.
  let admin: ReturnType<typeof createAdminClient> | null = null
  try {
    admin = createAdminClient()
  } catch (e: any) {
    console.error("[messages] admin client unavailable:", e?.message || e)
  }

  // Opening the inbox is what brings Storelib into it. Awaited rather than
  // fired and forgotten, because the whole point is that it is there on THIS
  // render; it returns null — and costs nothing — until an operator has
  // configured the official account.
  const systemConvoId = admin ? await ensureSystemConversation(admin, user.id) : null
  const systemId = admin ? await getSystemUserId(admin) : null

  const { data: page, error } = await supabase
    .from("conversations")
    .select("id, listing_id, buyer_id, seller_id, last_message_at")
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
    .order("last_message_at", { ascending: false })
    .limit(60)
  if (error) return NextResponse.json({ error: "Failed to load" }, { status: 500 })

  const convos: ConvoRow[] = (page as ConvoRow[]) ?? []
  // Sixty active threads can push a quiet Storelib conversation off the page,
  // and a pin that disappears when you get popular is not a pin. Fetch it back
  // in that one case — normally this branch never runs.
  if (systemConvoId && !convos.some((c) => c.id === systemConvoId)) {
    const { data: pinned } = await supabase
      .from("conversations")
      .select("id, listing_id, buyer_id, seller_id, last_message_at")
      .eq("id", systemConvoId)
      .maybeSingle()
    if (pinned) convos.push(pinned as ConvoRow)
  }
  if (!convos.length) return NextResponse.json({ conversations: [] })

  const listings = new Map<string, any>()
  let profiles = new Map<string, OfficialProfile>()
  const last = new Map<string, any>()
  const unread = new Map<string, number>()

  if (admin) {
    // Only listing threads have a listing; the system thread contributes a
    // null that must not reach `.in()`, where it would match nothing and
    // widen the query for no reason.
    const listingIds = [...new Set(convos.map((c) => c.listing_id).filter(Boolean))] as string[]
    const otherIds = [...new Set(convos.map((c) => (c.buyer_id === user.id ? c.seller_id : c.buyer_id)))]
    const convoIds = convos.map((c) => c.id)

    const [listingsRes, profilesRes, lastRes, unreadRes] = await Promise.all([
      listingIds.length
        ? admin.from("products").select("id, title, slug, thumbnail_url, price_cents, status").in("id", listingIds)
        : Promise.resolve({ data: [] as any[] }),
      fetchProfilesWithOfficial(admin, otherIds),
      admin
        .from("messages")
        .select("conversation_id, sender_id, kind, body, offer_cents, offer_status, created_at")
        .in("conversation_id", convoIds)
        .order("created_at", { ascending: false }),
      admin
        .from("messages")
        .select("conversation_id")
        .in("conversation_id", convoIds)
        .neq("sender_id", user.id)
        .is("read_at", null),
    ])

    for (const l of listingsRes.data ?? []) listings.set(l.id, l)
    profiles = profilesRes
    // First hit per conversation in a created_at-desc list IS its latest message.
    for (const m of lastRes.data ?? []) if (!last.has(m.conversation_id)) last.set(m.conversation_id, m)
    for (const m of unreadRes.data ?? []) unread.set(m.conversation_id, (unread.get(m.conversation_id) ?? 0) + 1)
  }

  const rows = convos.map((c) => {
    const otherId = c.buyer_id === user.id ? c.seller_id : c.buyer_id
    const other = profiles.get(otherId) ?? null
    return {
      id: c.id,
      lastMessageAt: c.last_message_at,
      youAre: c.buyer_id === user.id ? "buyer" : "seller",
      listing: (c.listing_id && listings.get(c.listing_id)) || null,
      other,
      official: isOfficialProfile(other, systemId) || (systemConvoId !== null && c.id === systemConvoId),
      lastMessage: last.get(c.id) ?? null,
      unread: unread.get(c.id) ?? 0,
    }
  })

  // Storelib sits at the top whatever its timestamp says — it is a fixture of
  // the inbox, not a participant in the recency race. Everything else keeps
  // the ordering the query already gave it.
  rows.sort((a, b) => {
    if (a.official !== b.official) return a.official ? -1 : 1
    return Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt)
  })

  return NextResponse.json({ conversations: rows })
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
  if (!body && !offerCents) return NextResponse.json({ error: "Empty message" }, { status: 400 })
  if (offerCents !== null && offerCents <= 0) return NextResponse.json({ error: "Bad offer" }, { status: 400 })

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

  const { error: msgErr } = await supabase.from("messages").insert(
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
  if (msgErr) return NextResponse.json({ error: "Could not send" }, { status: 500 })

  await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId)

  // The seller hears about it either way; an offer is louder than a message.
  await createNotification(admin, {
    userId: sellerId,
    kind: offerCents !== null ? "offer_received" : "message",
    actorId: user.id,
    listingId,
    conversationId,
  })

  return NextResponse.json({ conversationId })
}
