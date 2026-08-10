import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { createAdminClient } from "@/lib/supabase/admin"
import { decodeImageBody } from "@/lib/messages/image-fallback"
import { isEncodedVoice } from "@/lib/messages/voice-message"
import { callPreview, decodeCallBody } from "@/lib/messages/call-message"
import {
  ensureSystemConversation,
  fetchProfilesWithOfficial,
  getSystemUserId,
  STORELIB_AVATAR_URL,
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
  kind: "text" | "offer" | "image" | "voice" | "call"
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
 * Did anything get said after this person left the thread?
 *
 * Compared as NUMBERS. These two timestamps come from different places and are
 * formatted differently: Postgres returns `2026-08-05T21:15:00.123456+00:00`
 * while the delete was written as `new Date().toISOString()` —
 * `2026-08-05T21:15:00.123Z`. Comparing those as text compares "4" against "Z"
 * at the fourth decimal place, so the answer depends on the shape of the string
 * rather than on the moments it stands for, and a conversation could come back
 * from the dead over a formatting difference. Parsed, they are two numbers and
 * cannot disagree about which is later.
 */
function spokeAfterDelete(c: ConvoRow, userId: string): boolean {
  const left = Date.parse(deletedAtFor(c, userId) ?? "")
  const said = Date.parse(c.last_message_at ?? "")
  if (Number.isNaN(left)) return true
  if (Number.isNaN(said)) return false
  return said > left
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

  const raw = (page as unknown as ConvoRow[]) ?? []

  /**
   * ZERO ROWS AND NO ERROR IS NOT PROOF OF AN EMPTY INBOX.
   *
   * This is the "sometimes it says I have no messages when I do". Everything
   * above is written around the rule that a broken inbox and an empty one must
   * not look the same — but the rule was only enforced for reads that THROW,
   * and the failure that actually happens does not throw.
   *
   * `asCaller` is the caller's session client and row-level security is the
   * access check. An RLS predicate that does not match does not raise anything:
   * PostgREST answers 200 with `[]`. So any moment where the request reaches the
   * database carrying something other than this person's identity — a token that
   * refreshed while the request was in flight, a session cookie that did not
   * make it onto the request, `auth.uid()` coming back null — is indistinguishable,
   * here, from an account that has never messaged anybody. It gets rendered as
   * "Niciun mesaj încă", which is a confident, wrong answer, and the next load
   * usually gets it right, which is why it looks random.
   *
   * The service role can settle it, and it is the only thing that can: ask
   * whether this account is a party to a single conversation, using the SAME
   * predicate the caller just used. If the answer is yes while the caller's own
   * read said no, the two disagree about a question that has one answer, and the
   * caller's read is the one that is wrong. That is a read failure and it is
   * raised as one — both callers already know how to show a failure, and both
   * of them retry.
   *
   * On the RAW result, before the per-person delete filter below. Filtering to
   * nothing is a legitimate way to have an empty inbox — you deleted everything
   * and nobody has written since — and cross-checking the filtered list would
   * turn that into a permanent skeleton.
   *
   * One indexed `limit(1)` on the one path where the answer would otherwise be
   * unverifiable. An account that genuinely has no conversations pays it too,
   * once, and it returns nothing.
   */
  if (!raw.length && asAdmin) {
    const { data: anyAtAll, error: checkError } = await asAdmin
      .from("conversations")
      .select("id")
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
      .limit(1)
    // The check failing is not evidence either way — say nothing and let the
    // empty answer stand rather than inventing a failure out of a second one.
    if (!checkError && anyAtAll && anyAtAll.length > 0) {
      throw new InboxReadError(
        "conversations read returned no rows for an account that has at least one — the caller's read was not authorised",
      )
    }
  }

  const convos: ConvoRow[] = raw.filter(
    // Deleting is per person: the row survives for the other party, and comes
    // back for this one if they are written to again — `last_message_at` moving
    // past the delete is exactly that.
    (c) =>
      !deletedForMe(c, userId) || spokeAfterDelete(c, userId),
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
      // Both of these were UNBOUNDED, and that is the most expensive thing in
      // the inbox by a wide margin: `.in()` over sixty conversations with no
      // limit fetches every message in all sixty, twice, on every load — tens of
      // thousands of rows over the wire to render sixty previews and sixty
      // counts.
      //
      // Four rows per conversation is enough to find each one's newest, because
      // they arrive newest-first and only the first hit per conversation is
      // kept. It degrades in exactly one case — a single thread with more than
      // ~240 messages newer than another thread's newest — and it degrades
      // cosmetically: that row shows no preview line, keeps its name, avatar and
      // timestamp, and opens normally.
      asAdmin
        .from("messages")
        .select("conversation_id, sender_id, kind, body, offer_cents, offer_status, created_at")
        .in("conversation_id", convoIds)
        .order("created_at", { ascending: false })
        .limit(Math.max(120, convoIds.length * 4)),
      // Unread is a badge, and a badge stops meaning anything past a hundred.
      // Counting five hundred is far more than it can ever usefully show.
      asAdmin
        .from("messages")
        .select("conversation_id")
        .in("conversation_id", convoIds)
        .neq("sender_id", userId)
        .is("read_at", null)
        .limit(500),
    ])

    for (const l of listingsRes.data ?? []) listings.set(l.id, l as InboxListing)
    profiles = profilesRes
    // First hit per conversation in a created_at-desc list IS its latest message.
    //
    // Decoded on the way past. A photo stored the fallback way is a text row
    // whose body carries a sentinel and an object path — which the preview was
    // printing verbatim, so an inbox row for a picture read
    // "\u0001storelib:image\u0001a81ccv72e-f3…". The row must not have to know
    // there are two ways a photo can be filed; it only has to know it is one.
    for (const m of lastRes.data ?? []) {
      if (last.has(m.conversation_id)) continue
      // A voice note is filed the same way and would print the same gibberish —
      // "\u0002storelib:voice\u0002a81ccv72e…" — down the inbox. It has no
      // text to preview at all, so the row is told what it is and says so
      // itself, the way it already does for a photograph.
      if (m.kind === "text" && isEncodedVoice(m.body)) {
        last.set(m.conversation_id, { ...m, kind: "voice", body: null } as any)
        continue
      }
      // And a third: a call leaves a row in the thread like everything else, so
      // it can be the newest thing in a conversation and would print its own
      // sentinel down the inbox exactly as the other two would have.
      const call = m.kind === "text" ? decodeCallBody(m.body) : null
      if (call) {
        last.set(m.conversation_id, { ...m, kind: "call", body: callPreview(call) } as any)
        continue
      }
      const encoded = m.kind === "text" ? decodeImageBody(m.body) : null
      last.set(
        m.conversation_id,
        encoded ? ({ ...m, kind: "image", body: encoded.caption } as any) : (m as any),
      )
    }
    for (const m of unreadRes.data ?? []) unread.set(m.conversation_id, (unread.get(m.conversation_id) ?? 0) + 1)
  }

  const rows: InboxConversation[] = convos.map((c) => {
    const otherId = c.buyer_id === userId ? c.seller_id : c.buyer_id
    const other = profiles.get(otherId) ?? null
    const official = isOfficialProfile(other, systemId) || (systemConvoId !== null && c.id === systemConvoId)
    return {
      id: c.id,
      lastMessageAt: c.last_message_at,
      youAre: c.buyer_id === userId ? "buyer" : "seller",
      listing: (c.listing_id && listings.get(c.listing_id)) || null,
      // The same substitution the thread makes, so the row you tap and the
      // screen it opens show the same face. See STORELIB_AVATAR_URL.
      other: other && official && !other.avatar_url ? { ...other, avatar_url: STORELIB_AVATAR_URL } : other,
      official,
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
