import "server-only"

/**
 * ===========================================================================
 *  LIVE POSTS AND COMMENTS, AS IDS ONLY (round 10)
 * ===========================================================================
 * A new post or comment is told to the members who have the community (or
 * that post) open through a Supabase Realtime BROADCAST, sent by the server
 * after the row is written, through Realtime's REST endpoint with the service
 * role. Nothing is published from the tables, and no SQL is needed.
 *
 * WHAT GOES OUT IS AN ID, NEVER CONTENT. A broadcast carries the post's id
 * (with its space and author ids, so a browser can tell whether the list on
 * its screen is the post's list); the browser then reads the post through
 * the gated API (GET /api/community/<id>/posts/<postId>), which checks
 * membership, the space and the post's status like any other read. A member
 * who may not see that space gets a 404 and shows nothing.
 *
 * THE CHANNEL NAME IS A SECRET PER COMMUNITY. A broadcast channel is open to
 * whoever knows its name, so the name is an HMAC of the community id under
 * the service role key: it cannot be guessed from the community's id or
 * slug, and it is handed only to active members (GET .../live). Someone who
 * leaves keeps a name that only ever carries ids they can no longer read.
 * The per post channel (comments arriving, "is writing...") is the same name
 * with the post id after it.
 *
 * Never throws and never holds the answer up: the routes send it in after(),
 * once the member already has their post.
 */
import { createHmac } from "node:crypto"

/** How long a broadcast may take before it is given up (it is a courtesy, the next read shows the post anyway). */
const SEND_TIMEOUT_MS = 2500
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The community's live channel name, or null when the server has no key to make one with (realtime is then simply off). */
export function liveTopic(communityId: string): string | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key || !UUID.test(communityId)) return null
  const mac = createHmac("sha256", key).update(`storelib:community-live:v1:${communityId.toLowerCase()}`).digest("hex").slice(0, 32)
  return `community-live:${mac}`
}

/** A post's own channel: comments arriving and who is writing. The browser builds the same name from the community's. */
export function postTopic(communityId: string, postId: string): string | null {
  const base = liveTopic(communityId)
  return base && UUID.test(postId) ? `${base}:${postId.toLowerCase()}` : null
}

export interface LiveMessage {
  topic: string
  event: "post" | "comment" | "post-change" | "comment-change"
  payload: Record<string, string | null>
}

/** Sends broadcasts through Realtime's REST endpoint as the service role. True when Realtime took them. */
export async function broadcastLive(messages: LiveMessage[], fetcher: typeof fetch = fetch): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || !messages.length) return false
  try {
    const res = await fetcher(`${url.replace(/\/+$/, "")}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: messages.map((m) => ({ topic: m.topic, event: m.event, payload: m.payload, private: false })) }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    })
    if (!res.ok) console.error(`[communities] live broadcast refused: ${res.status}`)
    return res.ok
  } catch (e) {
    console.error(`[communities] live broadcast failed: ${e instanceof Error ? e.message : String(e)}`)
    return false
  }
}

/** A new post: ids only, to everybody with the community open. */
export function announcePost(communityId: string, post: { id: string; spaceId: string | null; authorId: string | null }, fetcher?: typeof fetch): Promise<boolean> {
  const topic = liveTopic(communityId)
  if (!topic) return Promise.resolve(false)
  return broadcastLive([{ topic, event: "post", payload: { postId: post.id, spaceId: post.spaceId, authorId: post.authorId } }], fetcher)
}

/** A new comment or reply: ids only, to everybody with that post open. */
export function announceComment(communityId: string, comment: { id: string; postId: string; parentId: string | null; authorId: string | null }, fetcher?: typeof fetch): Promise<boolean> {
  const topic = postTopic(communityId, comment.postId)
  if (!topic) return Promise.resolve(false)
  return broadcastLive([{ topic, event: "comment", payload: { commentId: comment.id, postId: comment.postId, parentId: comment.parentId, authorId: comment.authorId } }], fetcher)
}

/*
  AN EDIT OR A DELETE, LIVE (round 13). Whoever has the community open hears
  that a post changed ("edit") or went ("delete"), by id only, like a new
  one: an edit is read again through the gated route (a member who may no
  longer see it gets a 404, and it leaves their screen), a delete takes the
  card away.
  A comment's edit or delete goes to whoever has its post open.
*/
export type LiveChange = "edit" | "delete"

/** A post edited or deleted: ids only, to everybody with the community open. */
export function announcePostChange(communityId: string, post: { id: string; spaceId?: string | null; change: LiveChange }, fetcher?: typeof fetch): Promise<boolean> {
  const topic = liveTopic(communityId)
  if (!topic || !UUID.test(post.id)) return Promise.resolve(false)
  return broadcastLive([{ topic, event: "post-change", payload: { postId: post.id, spaceId: post.spaceId ?? null, change: post.change } }], fetcher)
}

/** A comment edited or deleted: ids only, to everybody with its post open. */
export function announceCommentChange(communityId: string, comment: { id: string; postId: string; change: LiveChange }, fetcher?: typeof fetch): Promise<boolean> {
  const topic = postTopic(communityId, comment.postId)
  if (!topic || !UUID.test(comment.id)) return Promise.resolve(false)
  return broadcastLive([{ topic, event: "comment-change", payload: { commentId: comment.id, postId: comment.postId, change: comment.change } }], fetcher)
}
