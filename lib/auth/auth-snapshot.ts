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

export function writeAuthSnapshot(snapshot: AuthSnapshot): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot))
  } catch {
    /* storage unavailable / full */
  }
}

/** Signed out. Written eagerly so the next load doesn't flash a stale avatar. */
export function clearAuthSnapshot(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(KEY)
    // Legacy key from the previous avatar-only cache.
    localStorage.removeItem("_sl_avatar")
  } catch {
    /* ignore */
  }
}
