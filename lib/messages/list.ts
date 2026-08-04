import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { createAdminClient } from "@/lib/supabase/admin"
import { decodeImageBody } from "@/lib/messages/image-fallback"
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
  kind: "text" | "offer" | "image"
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
  /** Optional: present only once 20260806_message_images_and_safety has run. */
  buyer_deleted_at?: string | null
  seller_deleted_at?: string | null
}

/** When THIS caller left the thread, if they did. */
function deletedAtFor(c: ConvoRow, userId: string): string | null {
  return (c.buyer_id === userId ? c.buyer_deleted_at : c.seller_deleted_at) ?? null
}

function deletedForMe(c: ConvoRow, userId: string): boolean {
  return deletedAtFor(c, userId) !== null
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

  // The per-person delete columns are asked for optimistically and dropped if
  // the database does not have them yet. A schema change and the code that uses
  // it never land at the same instant — the deploy is live the moment it builds
  // and the migration is run by hand afterwards — and in that window a select
  // naming a column that does not exist is not a degraded inbox, it is no inbox
  // at all. So the narrow query is the fallback, and the only thing lost until
  // the migration runs is that a deleted thread stays visible.
  const WITH_DELETES = "id, listing_id, buyer_id, seller_id, last_message_at, buyer_deleted_at, seller_deleted_at"
  const BASE = "id, listing_id, buyer_id, seller_id, last_message_at"

  const listPage = (columns: string) =>
    asCaller
      .from("conversations")
      .select(columns)
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
      .order("last_message_at", { ascending: false })
      .limit(60)

  let { data: page, error } = await listPage(WITH_DELETES)
  let selectColumns = WITH_DELETES
  if (error) {
    selectColumns = BASE
    ;({ data: page, error } = await listPage(BASE))
  }
  if (error) throw new InboxReadError(error.message)

  const convos: ConvoRow[] = ((page as unknown as ConvoRow[]) ?? []).filter(
    // Deleting is per person: the row survives for the other party, and comes
    // back for this one if they are written to again — `last_message_at` moving
    // past the delete is exactly that.
    (c) =>
      !deletedForMe(c, userId) ||
      (c.last_message_at ?? "") > (deletedAtFor(c, userId) ?? ""),
  )
  // Sixty active threads can push a quiet Storelib conversation off the page,
  // and a pin that disappears when you get popular is not a pin. Fetch it back
  // in that one case — normally this branch never runs.
  if (systemConvoId && !convos.some((c) => c.id === systemConvoId)) {
    const { data: pinned } = await asCaller
      .from("conversations")
      .select(selectColumns)
      .eq("id", systemConvoId)
      .maybeSingle()
    if (pinned) convos.push(pinned as unknown as ConvoRow)
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
