"use client"

/**
 * ===========================================================================
 *  WHICH POSTS ARE NEW TO ME
 * ===========================================================================
 * A card's dot and bold title say "something here you have not seen": a post
 * written, or commented on, since you last opened it. Opening a post (the
 * card, its page) marks it seen at its latest activity, so a new comment
 * lights it again.
 *
 * KEPT IN THIS BROWSER, per community and per person. There is no table of
 * who read which post (part 81 has none, and a write per post opened is not
 * worth a table for a dot), so the record is this device's: at most 600
 * posts, the oldest forgotten first. A first visit counts the last three days
 * as new, so a new member sees what is fresh rather than every post ever.
 * Your own posts are never new to you.
 */
import type { FeedPostView } from "@/lib/communities/types"

export const SEEN_EVENT = "storelib:community-seen"
const MAX_KEPT = 600
const FIRST_VISIT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

export interface SeenStore {
  /** Activity before this is not new. */
  since: string
  /** Post id to the latest activity seen on it. */
  seen: Record<string, string>
}

export function seenKey(communityId: string, userId: string | null): string {
  return `storelib:community-seen:${communityId}:${userId ?? "anon"}`
}

export function readSeen(communityId: string, userId: string | null, now = Date.now()): SeenStore {
  const fresh: SeenStore = { since: new Date(now - FIRST_VISIT_WINDOW_MS).toISOString(), seen: {} }
  try {
    const raw = window.localStorage.getItem(seenKey(communityId, userId))
    if (!raw) {
      window.localStorage.setItem(seenKey(communityId, userId), JSON.stringify(fresh))
      return fresh
    }
    const v = JSON.parse(raw) as SeenStore
    if (!v || typeof v.since !== "string" || typeof v.seen !== "object" || !v.seen) return fresh
    return v
  } catch {
    return fresh
  }
}

/** Whether this post has activity this person has not seen. */
export function isUnread(post: Pick<FeedPostView, "id" | "lastActivityAt" | "createdAt" | "author">, userId: string | null, store: SeenStore): boolean {
  if (!userId || post.author?.id === userId) return false
  const at = Date.parse(post.lastActivityAt || post.createdAt)
  if (!Number.isFinite(at) || at <= Date.parse(store.since)) return false
  const seen = store.seen[post.id]
  return !seen || Date.parse(seen) < at
}

/** Marks a post seen at its latest activity, and tells every card on the page. */
export function markSeen(communityId: string, userId: string | null, post: Pick<FeedPostView, "id" | "lastActivityAt" | "createdAt">): void {
  if (typeof window === "undefined") return
  try {
    const store = readSeen(communityId, userId)
    store.seen[post.id] = post.lastActivityAt || post.createdAt
    const ids = Object.keys(store.seen)
    if (ids.length > MAX_KEPT) {
      ids.sort((a, b) => Date.parse(store.seen[a]) - Date.parse(store.seen[b]))
      for (const id of ids.slice(0, ids.length - MAX_KEPT)) delete store.seen[id]
    }
    window.localStorage.setItem(seenKey(communityId, userId), JSON.stringify(store))
  } catch {
    /* Private mode: the dot stays until the page is left. */
  }
  window.dispatchEvent(new CustomEvent(SEEN_EVENT, { detail: { communityId, postId: post.id } }))
}
