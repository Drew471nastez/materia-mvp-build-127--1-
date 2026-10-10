/**
 * ===========================================================================
 *  THE ACCOUNT'S COVER, DECODED BEFORE THE PROFILE TAB IS PRESSED (round 18)
 * ===========================================================================
 * The owner: "when I switch between pages in the mobile nav bar and land on
 * the account page, the cover photo glitches", "get rid of the flash when I
 * land on the account page, in the cover".
 *
 * WHAT IT WAS, filmed at 4x CPU on a 390px phone in a real Next build
 * (scratchpad n18/realnav): the cover was drawn by a fresh <img> every time
 * the account page arrived, which started clear and faded in over 200ms on
 * the band's grey, even with the picture in the cache, because a layout read
 * in the same commit let the transition start from nothing. And with
 * `decoding="async"` a picture in the cache but no longer decoded (iOS lets
 * a decoded picture go once its page has gone) is painted a frame after the
 * page around it.
 *
 * So the picture is decoded ahead and kept:
 *   - the account page remembers its cover's address (rememberAccountCover);
 *   - the tab bar, once its page has settled, and again on the press that
 *     goes to Profile, decodes it (warmAccountCover) and keeps the decoded
 *     element alive, so the bitmap is still there when the page arrives;
 *   - components/profile/profile-cover-image.tsx asks coverReady(src) on its
 *     first render: a picture already decoded is drawn whole on that frame,
 *     with no fade and decoded in step with the page; only a picture really
 *     still on its way fades in.
 * Browser only, every call is a no-op on the server and fails quietly.
 */

const KEY = "storelib:account-cover"
/** Addresses whose picture has been decoded in this page. */
const ready = new Set<string>()
/** The decoded pictures, held so their bitmaps are not let go (the last two: the cover and one it replaced). */
const held = new Map<string, HTMLImageElement>()
const HOLD = 2

/** Whether this address's picture is decoded and can be drawn on the frame it mounts. */
export function coverReady(src: string | null | undefined): boolean {
  return !!src && ready.has(src)
}

/** A picture on screen has loaded: drawn again later, it needs no fade. */
export function markCoverReady(src: string | null | undefined) {
  if (src) ready.add(src)
}

/** Decode `src` and keep it decoded. Resolves when it is (or at once when it already is); never rejects. */
export function warmCover(src: string | null | undefined): Promise<void> {
  if (!src || typeof window === "undefined" || typeof Image === "undefined") return Promise.resolve()
  if (ready.has(src) && held.has(src)) return Promise.resolve()
  let img = held.get(src)
  if (!img) {
    img = new Image()
    img.decoding = "async"
    img.src = src
    held.set(src, img)
    while (held.size > HOLD) {
      const oldest = held.keys().next().value as string
      held.delete(oldest)
    }
  }
  const el = img
  const done = () => {
    if (el.naturalWidth > 0) ready.add(src)
  }
  if (typeof el.decode !== "function") {
    return new Promise((resolve) => {
      if (el.complete) {
        done()
        return resolve()
      }
      el.addEventListener("load", () => (done(), resolve()), { once: true })
      el.addEventListener("error", () => resolve(), { once: true })
    })
  }
  return el.decode().then(done, () => {
    held.delete(src)
  })
}

/** The account page says where its cover is (null: it has none), for the next time Profile is pressed. */
export function rememberAccountCover(src: string | null) {
  if (typeof window === "undefined") return
  try {
    if (src) window.localStorage.setItem(KEY, src)
    else window.localStorage.removeItem(KEY)
  } catch {
    /* no storage: the cover is simply not decoded ahead */
  }
}

/** The account cover's address as last seen, or null. */
export function rememberedAccountCover(): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(KEY)
  } catch {
    return null
  }
}

/** Decode the account's cover ahead of a press on Profile. */
export function warmAccountCover(): Promise<void> {
  return warmCover(rememberedAccountCover())
}
