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
 * it. When none does, the post's own page is opened by address
 * (/community/<slug>/post/<id>, the slug read from the address this page is
 * at), so a press is never dead.
 */
import { useEffect, useRef } from "react"

export interface OpenPostRequest {
  postId: string
  from: HTMLElement | null
}

/** Return true when this handler opened the post. */
export type OpenPostHandler = (req: OpenPostRequest) => boolean

const handlers: OpenPostHandler[] = []

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

/** Ask for a post to open. True when it opened over the page; false when its page was opened by address instead (or nothing could be). */
export function openPost(postId: string, from?: HTMLElement | null): boolean {
  const req: OpenPostRequest = { postId, from: from ?? null }
  for (let i = handlers.length - 1; i >= 0; i--) if (handlers[i](req)) return true
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

/** For tests: forget every handler. */
export function resetOpenPost(): void {
  handlers.length = 0
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
