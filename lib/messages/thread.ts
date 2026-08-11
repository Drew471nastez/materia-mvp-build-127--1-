import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { createAdminClient } from "@/lib/supabase/admin"

import { announceInbox, announceThread } from "@/lib/messages/announce"
import { decodeImageBody } from "@/lib/messages/image-fallback"
import { legacyMediaKind, legacyMediaLabel } from "@/lib/messages/legacy-media"
import {
  STORELIB_AVATAR_URL,
  fetchProfilesWithOfficial,
  getSystemUserId,
  isOfficialProfile,
} from "@/lib/system-account"

/**
 * The service client, or null when it is not configured.
 *
 * Local rather than imported from lib/messages/list.ts to keep the dependency
 * one-way — list.ts already imports from here, and a cycle between the two
 * would be resolved differently by the bundler than by the test runner.
 */
function optionalAdminClient(): SupabaseClient | null {
  try {
    return createAdminClient()
  } catch {
    return null
  }
}

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
  kind: "text" | "offer" | "image" | "legacy"
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
  /** True when there is at least one message older than the oldest one here. */
  hasMore: boolean
}

/**
 * How many messages a read returns.
 *
 * Sixty rather than five hundred, and that is a change in kind rather than in
 * number. Five hundred was "as much history as we are willing to send in one
 * go", with everything past it simply unreachable — a conversation older than
 * that had a floor you could scroll to and no way through. Sixty is a page,
 * and `before` is how you ask for the next one, so there is no floor at all.
 *
 * It also makes opening a thread markedly cheaper: five hundred rows, every
 * image among them signed, on every poll of every open conversation.
 */
const PAGE = 60

export async function readThread({
  asCaller,
  userId,
  id,
  markRead = true,
  before,
}: {
  asCaller: SupabaseClient
  userId: string
  id: string
  /** Opening a thread IS reading it. The server render does it too, so the
   *  receipt on the other side does not wait for the client's first poll. */
  markRead?: boolean
  /** An ISO timestamp. Returns the page of messages OLDER than this — how the
   *  client walks backwards through a long history. Reading older messages is
   *  not reading new ones, so `markRead` is forced off for these. */
  before?: string | null
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
  const olderThan = before && !Number.isNaN(Date.parse(before)) ? before : null
  const readMessages = (columns: string) => {
    const q = asCaller
      .from("messages")
      .select(columns)
      .eq("conversation_id", id)
    return (olderThan ? q.lt("created_at", olderThan) : q)
      // DESCENDING, then reversed below. Ascending with a limit returns the
      // OLDEST five hundred — so a conversation with six hundred messages in it
      // showed the first five hundred and never the newest hundred, including
      // everything either party had said that week. The limit has to cut from
      // the far end of the history, not the near one.
      .order("created_at", { ascending: false })
      // One more than a page, so the answer knows whether there IS another page
      // without a second count query. The extra row is dropped below.
      .limit(PAGE + 1)
  }

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
    markRead && !olderThan
      ? /**
         * MARKED READ WITH THE ADMIN CLIENT, AND THE REASON IS NOT CONVENIENCE.
         *
         * This ran as the caller, which means it needed the `messages_update`
         * RLS policy to exist. If that migration has not been applied — and on
         * a database where it has not, nothing says so — the update matches
         * zero rows and returns NO ERROR. PostgREST reports a policy that
         * forbids a row exactly the way it reports a row that was not there:
         * success, nothing changed.
         *
         * So "seen" silently did not work, everywhere, forever, and no amount
         * of correct client code could have fixed it. A feature whose failure
         * mode is indistinguishable from success is not a feature, it is a
         * coin toss, and this one has been reported as broken more than once.
         *
         * Membership was already PROVEN above: `convo` was read as the caller,
         * so if the caller is not in this conversation the function has
         * already returned null and nothing below runs. The predicate is then
         * fully closed — this conversation, not my own messages, not already
         * read — so there is no row it can reach that the caller could not
         * legitimately mark read. Using the service client removes a
         * dependency on a migration without widening what the operation can
         * touch by a single row.
         *
         * Falls back to the caller's own client when the service key is not
         * configured, which is the behaviour that shipped and is correct
         * wherever the policy does exist.
         */
        (optionalAdminClient() ?? asCaller)
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
    /**
     * AND THE READER'S OWN INBOX, which nothing was telling.
     *
     * Marking messages read changes two screens, not one. The sender's thread
     * learns it above. The READER's conversation list is the other, and it is
     * the one that was left stale: the unread wash and the violet dot on the row
     * you are at that moment reading stayed lit until that list happened to poll
     * — twenty seconds on a desktop, where the list is not somewhere you
     * navigated away from but a column sitting six inches from the conversation
     * it describes. Two panes of the same screen disagreeing about whether you
     * have read something is the most literal possible version of "seen is
     * buggy".
     *
     * Same doorbell as an arriving message, because it is the same question:
     * something about my inbox changed, look again. Guarded by the same
     * "rows actually changed" check as the line above, so an open thread
     * re-reading itself every few seconds does not ring anything.
     */
    void announceInbox(userId)
  }

  const admin = createAdminClient()

  // Back into reading order after the descending fetch above.
  const page = (messagesRes.data ?? []) as unknown as ThreadMessage[]
  const hasMore = page.length > PAGE
  const messages = page.slice(0, PAGE).reverse().map((m) => {
    // Two things can be hiding inside a text body, and they are told apart by
    // their own sentinels. Decoded here, once, so nothing downstream — the
    // client, the inbox preview, the action sheet — has to know there are
    // several ways a piece of media can be filed.
    // Two features that were removed left rows behind — see
    // lib/messages/legacy-media. Recognised so they read as a line about what
    // happened rather than as the raw sentinel they are stored as.
    const legacy = m.kind === "text" ? legacyMediaKind(m.body) : null
    if (legacy) {
      return { ...m, kind: "legacy" as const, body: legacyMediaLabel(legacy), image_url: null }
    }
    const encoded = m.kind === "text" ? decodeImageBody(m.body) : null
    if (encoded) {
      return { ...m, kind: "image" as const, body: encoded.caption, image_url: encoded.path }
    }
    return { ...m, image_url: m.image_url ?? null }
  })
  // Photographs are signed in one round trip for the whole page.
  const paths = [
    ...messages
      .filter((m) => m.kind === "image" && m.image_url && !m.image_url.startsWith("http"))
      .map((m) => m.image_url as string),
  ]
  /**
   * SIGNED WHILE THE LISTING IS BEING FETCHED, NOT AFTER IT.
   *
   * This used to run below, once the listing, the profiles and the system id had
   * all come back — so opening a conversation was two waits in a row that have
   * nothing to say to each other: storage does not care what the listing is
   * called and the listing does not care what the photographs are. On a phone
   * that is the difference between one round trip and two before the first
   * picture can start downloading.
   *
   * Started here and awaited with the rest. Nothing below it depends on the
   * links until they are applied, which is the definition of work that should
   * be running alongside something else.
   */
  const signing = paths.length
    ? admin.storage.from("messages").createSignedUrls(paths, 15 * 60)
    : Promise.resolve({ data: null })

  const otherId = convo.buyer_id === userId ? convo.seller_id : convo.buyer_id
  // No listing_id means a system thread: there is nothing to look up, and asking
  // products for a null id would only cost a round trip to learn that.
  const [{ data: listing }, profiles, systemId, { data: signed }] = await Promise.all([
    convo.listing_id
      ? admin
          .from("products")
          .select("id, title, slug, thumbnail_url, price_cents, status")
          .eq("id", convo.listing_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    fetchProfilesWithOfficial(admin, [otherId]),
    getSystemUserId(admin),
    signing,
  ])
  const other = profiles.get(otherId) ?? null

  // Photos live in a private bucket and what the row holds is the object path,
  // so a reader gets a link minted for them, now, that expires. One batch call
  // rather than one per photo — a thread with twenty pictures in it must not be
  // twenty round trips to storage.
  // A photo stored the fallback way is a text row with its path in the body.
  // Decoded here, once, so nothing downstream — the client, the inbox preview,
  // the action sheet — has to know there are two ways a photo can be filed.
  if (paths.length) {
    /**
     * Fifteen minutes, not an hour.
     *
     * A signed URL is a bearer token: anyone who has the string can fetch that
     * photograph, with no session and no membership check, for as long as it is
     * valid. It leaks the way every URL leaks — a screenshot of the address bar,
     * a "copy image address", a browser extension, an analytics script that
     * records resource loads — and an hour of validity is an hour of somebody
     * else being able to open a private picture.
     *
     * Nothing needs an hour. A thread re-reads itself every 2.5 to 30 seconds
     * and re-signs on each read, so links are replaced continuously while the
     * screen is open; the only thing this window has to cover is a tab left
     * untouched with the socket down.
     */
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
    hasMore,
  }
}
