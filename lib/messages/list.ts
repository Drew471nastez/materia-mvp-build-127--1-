import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { createAdminClient } from "@/lib/supabase/admin"
import {
  ensureSystemConversation,
  fetchProfilesWithOfficial,
  getSystemUserId,
  isOfficialProfile,
  type OfficialProfile,
} from "@/lib/system-account"

/**
 * The inbox listing, written once for the two places that need it.
 *
 * GET /api/messages owns the client's polling and its focus refresh, and the
 * /messages server component owns the first paint. Both want byte-identical
 * rows — the client replaces the server's array wholesale on its first refetch,
 * so any drift between the two would show up as the inbox quietly rearranging
 * itself a few seconds after it arrived. One function is the only way to
 * guarantee that cannot happen.
 *
 * The two clients are not interchangeable and the parameter names say so.
 * `asCaller` is the caller's own session client: it reads `conversations`, and
 * RLS is what decides that the answer is only their threads. `asAdmin` is the
 * service role, and it is used for nothing but decoration — listings, profiles,
 * last messages, unread counts — over rows the caller's client already proved
 * they are a party to. Rendering this on the server must not widen what anyone
 * can see, so the split the route established is preserved exactly rather than
 * collapsed into one privileged query.
 */

export type InboxListing = {
  id: string
  title: string
  slug: string
  thumbnail_url: string | null
  price_cents: number
  status?: string
}

export type InboxLastMessage = {
  sender_id: string
  kind: "text" | "offer"
  body: string | null
  offer_cents: number | null
  offer_status: "pending" | "accepted" | "declined" | null
}

export type InboxConversation = {
  id: string
  lastMessageAt: string
  youAre: "buyer" | "seller"
  listing: InboxListing | null
  other: OfficialProfile | null
  official: boolean
  lastMessage: InboxLastMessage | null
  unread: number
}

type ConvoRow = {
  id: string
  listing_id: string | null
  buyer_id: string
  seller_id: string
  last_message_at: string
}

/**
 * The admin client, treated as optional on purpose.
 *
 * An environment with no service role key should still show its conversations,
 * undecorated, rather than fail the whole inbox — so the one thing that can
 * throw here is caught at the boundary and every caller downstream handles a
 * null admin as "no enrichment".
 */
export function optionalAdminClient(): SupabaseClient | null {
  try {
    return createAdminClient()
  } catch (e: any) {
    console.error("[messages] admin client unavailable:", e?.message || e)
    return null
  }
}

/** Thrown when the conversations read itself fails, which is the one outcome
 *  neither caller can paper over: an empty inbox and a broken inbox must not
 *  look the same. */
export class InboxReadError extends Error {}

export async function listConversations({
  asCaller,
  asAdmin,
  userId,
}: {
  /** The caller's session client. RLS on `conversations` is the access check. */
  asCaller: SupabaseClient
  /** Service role, or null. Enrichment only — never the membership decision. */
  asAdmin: SupabaseClient | null
  userId: string
}): Promise<InboxConversation[]> {
  // Opening the inbox is what brings Storelib into it. Awaited rather than
  // fired and forgotten, because the whole point is that it is there on THIS
  // render; it returns null — and costs nothing — until an operator has
  // configured the official account.
  const systemConvoId = asAdmin ? await ensureSystemConversation(asAdmin, userId) : null
  const systemId = asAdmin ? await getSystemUserId(asAdmin) : null

  const { data: page, error } = await asCaller
    .from("conversations")
    .select("id, listing_id, buyer_id, seller_id, last_message_at")
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order("last_message_at", { ascending: false })
    .limit(60)
  if (error) throw new InboxReadError(error.message)

  const convos: ConvoRow[] = (page as ConvoRow[]) ?? []
  // Sixty active threads can push a quiet Storelib conversation off the page,
  // and a pin that disappears when you get popular is not a pin. Fetch it back
  // in that one case — normally this branch never runs.
  if (systemConvoId && !convos.some((c) => c.id === systemConvoId)) {
    const { data: pinned } = await asCaller
      .from("conversations")
      .select("id, listing_id, buyer_id, seller_id, last_message_at")
      .eq("id", systemConvoId)
      .maybeSingle()
    if (pinned) convos.push(pinned as ConvoRow)
  }
  if (!convos.length) return []

  const listings = new Map<string, InboxListing>()
  let profiles = new Map<string, OfficialProfile>()
  const last = new Map<string, InboxLastMessage & { conversation_id: string }>()
  const unread = new Map<string, number>()

  if (asAdmin) {
    // Only listing threads have a listing; the system thread contributes a
    // null that must not reach `.in()`, where it would match nothing and
    // widen the query for no reason.
    const listingIds = [...new Set(convos.map((c) => c.listing_id).filter(Boolean))] as string[]
    const otherIds = [...new Set(convos.map((c) => (c.buyer_id === userId ? c.seller_id : c.buyer_id)))]
    const convoIds = convos.map((c) => c.id)

    const [listingsRes, profilesRes, lastRes, unreadRes] = await Promise.all([
      listingIds.length
        ? asAdmin.from("products").select("id, title, slug, thumbnail_url, price_cents, status").in("id", listingIds)
        : Promise.resolve({ data: [] as any[] }),
      fetchProfilesWithOfficial(asAdmin, otherIds),
      asAdmin
        .from("messages")
        .select("conversation_id, sender_id, kind, body, offer_cents, offer_status, created_at")
        .in("conversation_id", convoIds)
        .order("created_at", { ascending: false }),
      asAdmin
        .from("messages")
        .select("conversation_id")
        .in("conversation_id", convoIds)
        .neq("sender_id", userId)
        .is("read_at", null),
    ])

    for (const l of listingsRes.data ?? []) listings.set(l.id, l as InboxListing)
    profiles = profilesRes
    // First hit per conversation in a created_at-desc list IS its latest message.
    for (const m of lastRes.data ?? []) if (!last.has(m.conversation_id)) last.set(m.conversation_id, m as any)
    for (const m of unreadRes.data ?? []) unread.set(m.conversation_id, (unread.get(m.conversation_id) ?? 0) + 1)
  }

  const rows: InboxConversation[] = convos.map((c) => {
    const otherId = c.buyer_id === userId ? c.seller_id : c.buyer_id
    const other = profiles.get(otherId) ?? null
    return {
      id: c.id,
      lastMessageAt: c.last_message_at,
      youAre: c.buyer_id === userId ? "buyer" : "seller",
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

  return rows
}
