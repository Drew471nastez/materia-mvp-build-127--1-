import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { createAdminClient } from "@/lib/supabase/admin"
import { announceThread } from "@/lib/messages/announce"
import { decodeImageBody } from "@/lib/messages/image-fallback"
import {
  STORELIB_AVATAR_URL,
  fetchProfilesWithOfficial,
  getSystemUserId,
  isOfficialProfile,
} from "@/lib/system-account"

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
  kind: "text" | "offer" | "image"
  body: string | null
  /** Unsent by its author. The row survives so the conversation keeps its shape;
   *  its contents do not. */
  deleted_at?: string | null
  /** A signed, short-lived URL by the time this leaves here. What is STORED is
   *  the object path in a private bucket — see the signing step below. */
  image_url: string | null
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
  other: {
    id: string
    display_name: string | null
    username: string | null
    avatar_url: string | null
    /** When they were last anywhere in the app. Undefined means the column is
     *  not there to read, which the header draws as nothing at all — an unknown
     *  presence must never be shown as "offline". */
    last_seen_at?: string | null
  } | null
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

  // `image_url` is asked for optimistically. A deploy is live the moment it
  // builds and its migration is run by hand afterwards, so for that window the
  // column does not exist — and a select naming a missing column does not
  // degrade the thread, it empties it. The narrow query is the fallback and the
  // only thing lost meanwhile is a feature nobody can have used yet.
  const readMessages = (columns: string) =>
    asCaller
      .from("messages")
      .select(columns)
      .eq("conversation_id", id)
      // DESCENDING, then reversed below. Ascending with a limit returns the
      // OLDEST five hundred — so a conversation with six hundred messages in it
      // showed the first five hundred and never the newest hundred, including
      // everything either party had said that week. The limit has to cut from
      // the far end of the history, not the near one.
      .order("created_at", { ascending: false })
      .limit(500)

  const [messagesRes, readRes] = await Promise.all([
    readMessages(
      "id, sender_id, kind, body, image_url, deleted_at, offer_cents, offer_status, created_at, read_at",
    )
      .then((res) =>
        res.error
          ? readMessages("id, sender_id, kind, body, image_url, offer_cents, offer_status, created_at, read_at")
          : res,
      )
      .then((res) =>
        res.error
          ? readMessages("id, sender_id, kind, body, offer_cents, offer_status, created_at, read_at")
          : res,
      ),
    markRead
      ? asCaller
          .from("messages")
          .update({ read_at: new Date().toISOString() })
          .eq("conversation_id", id)
          .neq("sender_id", userId)
          .is("read_at", null)
          // `select("id")` turns this into a returning update, which is the
          // difference between "we ran an update" and "we changed something".
          // Only the second is worth telling anyone about — see below.
          .select("id")
      : Promise.resolve(null),
  ])

  // "Văzut" arrives when they read it, not on the sender's next poll.
  //
  // A read receipt is an UPDATE, and updates only reach the other side over
  // postgres_changes — which needs `messages` to be in the realtime publication,
  // and on a database where that migration has not been run it is not. So the
  // sender's "Trimis" sat there until a poll happened to pick it up: up to
  // twelve seconds after the moment it describes, on the one line in a
  // conversation whose entire job is to be timely.
  //
  // Rung explicitly instead, on the same broadcast channel the messages use. And
  // only when rows actually changed: this runs on every poll of an open thread,
  // several times a minute, and announcing "something was read" each time would
  // be a broadcast storm reporting nothing.
  const readRows = (readRes as { data?: unknown[] } | null)?.data
  if (markRead && Array.isArray(readRows) && readRows.length > 0) {
    void announceThread(id, "read")
  }

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

  // Photos live in a private bucket and what the row holds is the object path,
  // so a reader gets a link minted for them, now, that expires. One batch call
  // rather than one per photo — a thread with twenty pictures in it must not be
  // twenty round trips to storage.
  // A photo stored the fallback way is a text row with its path in the body.
  // Decoded here, once, so nothing downstream — the client, the inbox preview,
  // the action sheet — has to know there are two ways a photo can be filed.
  // Back into reading order after the descending fetch above.
  const messages = ((messagesRes.data ?? []) as unknown as ThreadMessage[]).slice().reverse().map((m) => {
    const encoded = m.kind === "text" ? decodeImageBody(m.body) : null
    if (encoded) {
      return { ...m, kind: "image" as const, body: encoded.caption, image_url: encoded.path }
    }
    return { ...m, image_url: m.image_url ?? null }
  })
  const paths = messages
    .filter((m) => m.kind === "image" && m.image_url && !m.image_url.startsWith("http"))
    .map((m) => m.image_url as string)
  if (paths.length) {
    // Fifteen minutes, not an hour.
    //
    // A signed URL is a bearer token: anyone who has the string can fetch that
    // photograph, with no session and no membership check, for as long as it is
    // valid. It leaks the way every URL leaks — a screenshot of the address
    // bar, a "copy image address", a browser extension, an analytics script
    // that records resource loads — and an hour of validity is an hour of
    // somebody else being able to open a private picture.
    //
    // Nothing needs an hour. A thread re-reads itself every 2.5 to 30 seconds
    // and re-signs on each read, so links are replaced continuously while the
    // screen is open; the only thing this window has to cover is a tab left
    // untouched with the socket down, and fifteen minutes covers that several
    // times over. Shortening it costs nothing and removes 45 minutes of reach
    // from every link that gets out.
    const { data: signed } = await admin.storage.from("messages").createSignedUrls(paths, 15 * 60)
    const byPath = new Map((signed ?? []).map((s) => [s.path as string, s.signedUrl]))
    for (const m of messages) {
      if (m.kind === "image" && m.image_url) m.image_url = byPath.get(m.image_url) ?? null
    }
  }

  const official = isOfficialProfile(other, systemId)

  return {
    id: convo.id,
    youAre: convo.buyer_id === userId ? "buyer" : "seller",
    me: userId,
    listing: (listing as ThreadListing | null) ?? null,
    // Storelib wears its own mark. Only when the account has not set a picture
    // of its own, so an operator who uploads one is not overridden by a
    // constant. See STORELIB_AVATAR_URL.
    other: other && official && !other.avatar_url ? { ...other, avatar_url: STORELIB_AVATAR_URL } : other,
    official,
    messages,
  }
}
