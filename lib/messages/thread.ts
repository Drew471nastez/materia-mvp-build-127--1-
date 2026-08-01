import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { createAdminClient } from "@/lib/supabase/admin"
import { fetchProfilesWithOfficial, getSystemUserId, isOfficialProfile } from "@/lib/system-account"

/**
 * One conversation, read once for the two places that need it.
 *
 * The same split lib/messages/list.ts made for the inbox, for the same reason
 * and with the same rule: `asCaller` is the caller's own session client and RLS
 * is the membership check — a thread that is not theirs comes back empty and
 * this returns null. The service role is used for nothing but decoration, over
 * a row the caller's client has already proved they are a party to. Reading a
 * conversation on the server must not widen what anyone can see.
 *
 * GET /api/messages/:id owns the poll; the /messages/[id] server component owns
 * the first paint. They must produce byte-identical objects, because the client
 * swaps the server's for a fetched one on its first refresh and any drift shows
 * up as the conversation rearranging itself a second after it arrived.
 */

export type ThreadMessage = {
  id: string
  sender_id: string
  kind: "text" | "offer"
  body: string | null
  offer_cents: number | null
  offer_status: "pending" | "accepted" | "declined" | null
  created_at: string
  read_at: string | null
}

export type ThreadListing = {
  id: string
  title: string
  slug: string
  thumbnail_url: string | null
  price_cents: number
  status: string
}

export type ThreadPayload = {
  id: string
  youAre: "buyer" | "seller"
  me: string
  listing: ThreadListing | null
  other: { id: string; display_name: string | null; username: string | null; avatar_url: string | null } | null
  official: boolean
  messages: ThreadMessage[]
}

export async function readThread({
  asCaller,
  userId,
  id,
  markRead = true,
}: {
  asCaller: SupabaseClient
  userId: string
  id: string
  /** Opening a thread IS reading it. The server render does it too, so the
   *  receipt on the other side does not wait for the client's first poll. */
  markRead?: boolean
}): Promise<ThreadPayload | null> {
  const { data: convo } = await asCaller
    .from("conversations")
    .select("id, listing_id, buyer_id, seller_id")
    .eq("id", id)
    .maybeSingle()
  if (!convo) return null

  const [messagesRes] = await Promise.all([
    asCaller
      .from("messages")
      .select("id, sender_id, kind, body, offer_cents, offer_status, created_at, read_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true })
      .limit(500),
    markRead
      ? asCaller
          .from("messages")
          .update({ read_at: new Date().toISOString() })
          .eq("conversation_id", id)
          .neq("sender_id", userId)
          .is("read_at", null)
      : Promise.resolve(null),
  ])

  const admin = createAdminClient()
  const otherId = convo.buyer_id === userId ? convo.seller_id : convo.buyer_id
  // No listing_id means a system thread: there is nothing to look up, and asking
  // products for a null id would only cost a round trip to learn that.
  const [{ data: listing }, profiles, systemId] = await Promise.all([
    convo.listing_id
      ? admin
          .from("products")
          .select("id, title, slug, thumbnail_url, price_cents, status")
          .eq("id", convo.listing_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    fetchProfilesWithOfficial(admin, [otherId]),
    getSystemUserId(admin),
  ])
  const other = profiles.get(otherId) ?? null

  return {
    id: convo.id,
    youAre: convo.buyer_id === userId ? "buyer" : "seller",
    me: userId,
    listing: (listing as ThreadListing | null) ?? null,
    other,
    official: isOfficialProfile(other, systemId),
    messages: (messagesRes.data ?? []) as ThreadMessage[],
  }
}
