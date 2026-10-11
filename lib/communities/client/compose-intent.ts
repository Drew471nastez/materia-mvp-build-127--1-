"use client"

/**
 * ===========================================================================
 *  "CREATE POST", ASKED FOR FROM ANYWHERE
 * ===========================================================================
 * Round 15, the owner: inside a community the tab bar's Library becomes
 * Create post, and it "triggers the new post thing, very smooth". The tab
 * bar (components/nav, worker T) does not hold the composer; the composer
 * (components/community/member/composer.tsx) is drawn by the feed. This is
 * the one wire between them:
 *
 *   requestCompose({ spaceSlug })   anyone: the tab bar, a menu, an empty feed
 *   useComposeRequests(handler)     the composer on screen answers it
 *
 * A HANDLER SAYS WHETHER IT TOOK IT. Handlers are asked newest first and the
 * first that returns true opens its editor; the rest are not asked. A
 * composer that cannot post in the space asked for returns false.
 *
 * NOBODY ON SCREEN TO ANSWER. A request no handler took is kept for
 * PENDING_MS: the composer that mounts next (the feed arriving after the
 * shell was asked to go to it) takes it as it mounts. So a caller outside the
 * feed may go to the feed first and ask straight after, in the same tick, in
 * either order. Past PENDING_MS it is dropped: a composer that opens by
 * itself a minute later would be a surprise.
 *
 * OVER THE PLACE YOU ARE ON (round 21). On a phone, Create post on Learn, the
 * Calendar, Members or a profile went to the feed first and opened the composer
 * there: the place jumped away under the finger. The community's shell now
 * holds a composer of its own for that (compose-anywhere.tsx), set as the
 * FALLBACK: asked only when no composer on screen took the request, it opens
 * over the place as it is. It says no when it cannot (no feed data in hand, a
 * computer), and the caller then goes to the feed as before.
 *
 * Pure module state, no React context: the tab bar may be outside the
 * community's tree (useNavigatorOutsideCommunity), and a request must cross
 * from one tree to the other. Nothing here touches the DOM.
 */
import { useEffect, useRef } from "react"

export interface ComposeRequest {
  /** The space the post should go to, by its slug; none means the composer's own choice. */
  spaceSlug?: string
  /** When it was asked (performance-ish ms), to drop a stale pending request. */
  at: number
}

/** Return true when this composer opened for the request. */
export type ComposeHandler = (req: ComposeRequest) => boolean

/** How long a request no composer took waits for one to mount. */
export const PENDING_MS = 4000

const handlers: ComposeHandler[] = []
let pending: ComposeRequest | null = null
let fallback: ComposeHandler | null = null

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now()
}

/**
 * Ask for the composer. True when a composer on screen opened for it; false
 * when it is waiting (up to PENDING_MS) for one to mount.
 */
export function requestCompose(opts?: { spaceSlug?: string }): boolean {
  const req: ComposeRequest = { spaceSlug: opts?.spaceSlug || undefined, at: now() }
  for (let i = handlers.length - 1; i >= 0; i--) {
    if (handlers[i](req)) {
      pending = null
      return true
    }
  }
  if (fallback?.(req)) {
    pending = null
    return true
  }
  pending = req
  return false
}

/** The one composer asked when none on screen took a request (the shell's, over the place); null lets it go. */
export function setComposeFallback(handler: ComposeHandler | null): () => void {
  fallback = handler
  return () => {
    if (fallback === handler) fallback = null
  }
}

/** Register a handler; the returned function lets it go. A pending request is offered to it at once. */
export function addComposeHandler(handler: ComposeHandler): () => void {
  handlers.push(handler)
  const waiting = takePending()
  if (waiting && !handler(waiting)) pending = waiting
  return () => {
    const i = handlers.lastIndexOf(handler)
    if (i >= 0) handlers.splice(i, 1)
  }
}

/** The pending request if it is still fresh, taken (so only one composer opens for it). */
export function takePending(at: number = now()): ComposeRequest | null {
  const p = pending
  pending = null
  if (!p || at - p.at > PENDING_MS) return null
  return p
}

/** For tests: forget every handler and request. */
export function resetComposeIntent(): void {
  handlers.length = 0
  pending = null
  fallback = null
}

/**
 * The composer on screen answers requests while it is mounted. The handler
 * may change on every render; the registration does not.
 */
export function useComposeRequests(handler: ComposeHandler): void {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  useEffect(() => addComposeHandler((req) => ref.current(req)), [])
}
