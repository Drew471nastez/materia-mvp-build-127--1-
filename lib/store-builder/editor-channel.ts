/**
 * ===========================================================================
 *  THE FRAME TALKING TO THE WORKSPACE IT IS INSIDE
 * ===========================================================================
 * /app/creator-page holds the real /u/<handle> in an iframe, so every control
 * a creator uses is the one a visitor's browser runs. That is the point of
 * the arrangement, and it leaves exactly one gap: the page and the workspace
 * are two documents, and neither can see the other's state.
 *
 * Two messages cross the gap and no more.
 *
 *   "saved"  the page has written something, so the workspace should fetch it
 *            again. It used to be a reload button in the toolbar, which is
 *            the editor asking a creator to notice a save on its behalf.
 *
 *   "bar"    a draft of the top bar, posted while somebody types, so the bar
 *            repaints on the keystroke instead of after a round trip.
 *            "ready" is the frame asking for that draft again after a reload.
 *
 *   There was a third, "sheet", so the workspace could dim its bar along
 *   with a sheet that dimmed the page. The editors do not dim the page any
 *   more (components/storefront/editor-sheet), so there is nothing to match.
 *
 * Everything here is cheap on purpose: no shared state, no acknowledgement,
 * nothing that has to stay in step. A message that does not arrive costs a
 * creator one reload, never a lost edit, because the save itself is an
 * ordinary PATCH that has already returned before any of this fires.
 */

export const CREATOR_EDITOR_CHANNEL = "storelib-creator-editor"

/**
 * Tell the workspace this page has changed. A no-op when the page is not
 * framed, which is every visitor and the creator's own page at its own
 * address — so this is safe to call from any control, unconditionally.
 */
export function notifyEditorSaved(): void {
  if (typeof window === "undefined") return
  if (window.parent === window) return
  try {
    window.parent.postMessage({ channel: CREATOR_EDITOR_CHANNEL, kind: "saved" }, window.location.origin)
  } catch {
    /* A parent on another origin cannot be posted to, and does not need to be. */
  }
}

/** Is this page inside the creator-page workspace right now? */
export function isInEditorFrame(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.parent !== window
  } catch {
    return true
  }
}

/**
 * ===========================================================================
 *  WHERE A LINK INSIDE THE CANVAS SHOULD GO
 * ===========================================================================
 * The proxy relaxes framing for a page carrying `?embedded=1` and for nothing
 * else, so a product link followed inside the workspace has to carry it or it
 * ends in "storelib.com refused to connect".
 *
 * A pure function rather than logic buried in a click handler, because the
 * interesting part is what it REFUSES: another origin, a mail link, an
 * anchor, something already flagged. Each of those is a line somebody could
 * delete without noticing, and each has a test.
 *
 * Returns the address to go to, or null to leave the click alone.
 */
/**
 * ===========================================================================
 *  WHAT THE CANVAS WILL NOT FOLLOW
 * ===========================================================================
 * BROWSING, NOT BUYING. The canvas is for looking at the shop the way a
 * visitor does — products, the creator page, back again — and that is the
 * whole reason it holds the real page. Everything past the buy button is a
 * real transaction on a real account, and none of those pages is framable, so
 * following one turned the canvas into "refused to connect" rather than into
 * a purchase. Refused here AND at the button, because a button is not a link:
 * see components/storefront/use-editor-frame.
 *
 * The rest of the app is on the list for the second reason only. A creator
 * clicking through to their own dashboard inside a 900px frame is not
 * something to support; the controls that mean to leave carry `target="_top"`
 * and are untouched by any of this.
 */
const CANVAS_WILL_NOT_FOLLOW = new Set([
  "checkout", "purchase", "access", "downloads", "library", "receipt", "upgrade",
  "pricing", "app", "api", "auth", "login", "signup", "onboarding", "welcome",
])

/** Is this somewhere the editor's canvas refuses to go? */
export function canvasRefusesHref(href: string | null | undefined, base: string): boolean {
  if (!href) return false
  try {
    const url = new URL(href.trim(), base)
    if (url.origin !== new URL(base).origin) return false
    const first = url.pathname.split("/").filter(Boolean)[0]?.toLowerCase()
    return !!first && CANVAS_WILL_NOT_FOLLOW.has(first)
  } catch {
    return false
  }
}

export function embeddedHref(href: string | null | undefined, base: string): string | null {
  if (!href) return null
  const trimmed = href.trim()
  if (!trimmed || trimmed.startsWith("#")) return null
  /* Anything that is not an http(s) navigation: mailto, tel, sms, blob, data. */
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:/i.test(trimmed)) return null

  let url: URL
  let origin: string
  try {
    url = new URL(trimmed, base)
    origin = new URL(base).origin
  } catch {
    return null
  }
  if (url.origin !== origin) return null
  if (url.searchParams.get("embedded") === "1") return null

  url.searchParams.set("embedded", "1")
  return url.toString()
}
