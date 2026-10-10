"use client"

/**
 * ===========================================================================
 *  OPEN A POST, FROM ANYWHERE IN THE COMMUNITY
 * ===========================================================================
 * Round 15. A post opens over the place it was pressed in (the feed, a
 * space, search, notifications, a profile), on a phone as a screen pushed in
 * from the right (components/community/member/post-fullscreen.tsx), on a
 * computer as the panel over the page. Whoever draws the post's card, or
 * holds the post's data, answers:
 *
 *   openPost(postId, from?)       anyone: a card, a search row, a notification
 *   useOpenPostRequests(handler)  a card on screen, or a host that can read
 *                                 the post by its id
 *
 * `from` is the element pressed. The opened post does not grow out of it (no
 * second copy of the card is ever drawn), but it is where focus goes back to
 * on close, and the card a host scrolls clear of the bars if the feed moved.
 *
 * Handlers are asked newest first; the first that returns true has opened
 * it. Then the FALLBACKS (round 16): the community's place host reads a post
 * nobody on screen holds by its id and opens it over the place it is on (a
 * profile's row, Saved, a notification), so the place stays and nothing
 * loads a page. When none of them does, the post's own page is opened by
 * address (/community/<slug>/post/<id>, the slug read from the address this
 * page is at), so a press is never dead.
 */
import { useEffect, useRef } from "react"

export interface OpenPostRequest {
  /** The post's id: a uuid, or the eight digit short id a post's address carries (lib/communities/post-url.ts). */
  postId: string
  from: HTMLElement | null
}

/** Whether a request names this post: by its whole id, or by the short id its address carries. */
export function requestNames(req: OpenPostRequest, id: string): boolean {
  const asked = req.postId.toLowerCase()
  if (asked === id.toLowerCase()) return true
  return /^[0-9a-f]{8}$/.test(asked) && id.replace(/-/g, "").slice(0, 8).toLowerCase() === asked
}

/** Return true when this handler opened the post. */
export type OpenPostHandler = (req: OpenPostRequest) => boolean

const handlers: OpenPostHandler[] = []
/* Asked only once every handler has said no (the place host's reader). */
const fallbacks: OpenPostHandler[] = []

/** The community's slug in a community address, or null. */
export function slugFromPath(pathname: string): string | null {
  const m = /^\/community\/([^/?#]+)/.exec(pathname)
  return m ? decodeURIComponent(m[1]) : null
}

/** Where a post nobody on screen could open is read instead. */
export function postFallbackHref(pathname: string, postId: string): string | null {
  const slug = slugFromPath(pathname)
  return slug ? `/community/${encodeURIComponent(slug)}/post/${encodeURIComponent(postId)}` : null
}

/*
  ONE PRESS, ONE OPEN. A link's press can be heard twice (the community's link catcher, then the row's own handler): the same
  post asked for again within this long of the last time it opened is the same press, already answered.
*/
const SAME_PRESS_MS = 400
let last: { id: string; at: number } | null = null

/**
 * Ask for a post to open over the page, without falling back to its own page: true when a card or a fallback took it,
 * false when nobody could (the caller then lets its link go where it points).
 */
export function openPostOver(postId: string, from?: HTMLElement | null): boolean {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now()
  if (last && last.id === postId && now - last.at < SAME_PRESS_MS) return true
  const req: OpenPostRequest = { postId, from: from ?? null }
  let took = false
  for (let i = handlers.length - 1; i >= 0 && !took; i--) took = handlers[i](req)
  for (let i = fallbacks.length - 1; i >= 0 && !took; i--) took = fallbacks[i](req)
  if (took) last = { id: postId, at: now }
  return took
}

/** Ask for a post to open. True when it opened over the page; false when its page was opened by address instead (or nothing could be). */
export function openPost(postId: string, from?: HTMLElement | null): boolean {
  if (openPostOver(postId, from)) return true
  if (typeof window === "undefined") return false
  const href = postFallbackHref(window.location.pathname, postId)
  if (href) window.location.assign(href)
  return false
}

/** Register a handler; the returned function lets it go. */
export function addOpenPostHandler(handler: OpenPostHandler): () => void {
  handlers.push(handler)
  return () => {
    const i = handlers.lastIndexOf(handler)
    if (i >= 0) handlers.splice(i, 1)
  }
}

/** Register a fallback, asked only after every handler has said no; the returned function lets it go. */
export function addOpenPostFallback(handler: OpenPostHandler): () => void {
  fallbacks.push(handler)
  return () => {
    const i = fallbacks.lastIndexOf(handler)
    if (i >= 0) fallbacks.splice(i, 1)
  }
}

/** For tests: forget every handler. */
export function resetOpenPost(): void {
  handlers.length = 0
  fallbacks.length = 0
  last = null
}


/**
 * A card or a host answers requests while it is mounted (a place kept alive
 * but hidden under <Activity> has its effects let go, so it does not answer).
 */
export function useOpenPostRequests(handler: OpenPostHandler): void {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  useEffect(() => addOpenPostHandler((req) => ref.current(req)), [])
}
