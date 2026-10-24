"use client"

// A tiny, durable record of "who is signed in", written to localStorage.
//
// The header used to boot with loading=true, then wait on a network
// supabase.auth.getUser() followed by two more queries before it knew whether to
// show an avatar or a Log in button. That round trip is why it showed skeletons
// on every single page load, why it flickered between states, and why it looked
// like being signed in "didn't stick" — the session was fine, the header just
// didn't know yet.
//
// Reading this snapshot is synchronous, so the header renders the RIGHT header on
// its first paint. The real session is still verified straight afterwards; the
// snapshot is only ever a head start, never the authority. If verification
// disagrees, the snapshot is corrected — but that costs at most one late update
// instead of a guaranteed skeleton on every load.

const KEY = "_sl_auth_v1"

export type AuthSnapshot = {
  signedIn: boolean
  userId: string | null
  avatarUrl: string | null
  displayName: string | null
  username: string | null
  /** Finished seller onboarding — decides Dashboard vs Sell now. */
  isSeller: boolean
}

export function readAuthSnapshot(): AuthSnapshot | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed?.signedIn !== "boolean") return null
    return {
      signedIn: parsed.signedIn,
      userId: parsed.userId ?? null,
      avatarUrl: parsed.avatarUrl ?? null,
      displayName: parsed.displayName ?? null,
      username: parsed.username ?? null,
      isSeller: !!parsed.isSeller,
    }
  } catch {
    return null
  }
}

/**
 * Fired whenever the snapshot changes IN THIS TAB.
 *
 * The browser's own `storage` event is only sent to OTHER tabs, so a component
 * that read the snapshot before the header had finished verifying the session
 * has no way of learning that it has since arrived. That is not a corner case:
 * the snapshot is written after a network round trip, and everything on the
 * first screen renders before it. Anything that read "signed out" then would
 * keep believing it for the rest of the visit.
 */
export const AUTH_SNAPSHOT_EVENT = "storelib:auth-snapshot"

function announce(): void {
  if (typeof window === "undefined") return
  try {
    window.dispatchEvent(new Event(AUTH_SNAPSHOT_EVENT))
  } catch {
    /* an environment without CustomEvent is one with nobody listening */
  }
}

/**
 * Both directions: this tab, and any other tab of the same account.
 *
 * Returns its own unsubscribe, so a caller cannot leak a listener by forgetting
 * which of the two it added.
 */
export function subscribeAuthSnapshot(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  const onStorage = (e: StorageEvent) => {
    // A null key is `localStorage.clear()`, which is also a change to this.
    if (!e.key || e.key === KEY) onChange()
  }
  /*
    A PAGE BROUGHT BACK FROM THE BACK/FORWARD CACHE reads it again. While it
    was frozen another page wrote the record (a sign in, a sign out) and the
    storage event for that was never delivered to it, so the phone's tab bar
    came back as it was left: gone after a sign in, there after a sign out.
  */
  const onShow = (e: Event) => {
    if ((e as PageTransitionEvent).persisted) onChange()
  }
  window.addEventListener(AUTH_SNAPSHOT_EVENT, onChange)
  window.addEventListener("storage", onStorage)
  window.addEventListener("pageshow", onShow)
  return () => {
    window.removeEventListener(AUTH_SNAPSHOT_EVENT, onChange)
    window.removeEventListener("storage", onStorage)
    window.removeEventListener("pageshow", onShow)
  }
}

export function writeAuthSnapshot(snapshot: AuthSnapshot): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot))
  } catch {
    /* storage unavailable / full */
  }
  // Outside the try: a write that succeeded must be announced, and a write that
  // failed has left readers with a stale value they should re-check anyway.
  announce()
}

/** Signed out. Written eagerly so the next load doesn't flash a stale avatar. */
export function clearAuthSnapshot(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(KEY)
    // Legacy key from the previous avatar-only cache.
    localStorage.removeItem("_sl_avatar")
    // Which listings were saved is this person's, not this device's. The
    // wishlist store reads it back synchronously on the next load precisely so
    // hearts are right before any request is made — which would mean the next
    // visitor to this phone opening the app to somebody else's saves. Signing
    // out is the moment that has to stop being true.
    localStorage.removeItem("storelib_wishlist_ids_v1")
    // Same reasoning: who you follow is yours, not this device's.
    localStorage.removeItem("storelib_following_ids_v1")
  } catch {
    /* ignore */
  }
  // Signing out has to reach the same readers signing in does, or a control
  // hidden because a listing was yours stays hidden for the next person.
  announce()
}
