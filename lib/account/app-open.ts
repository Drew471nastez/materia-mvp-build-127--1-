import { openTarget } from "@/lib/platform/open-in-app"

/**
 * ===========================================================================
 *  THE PAGE THE APP SHOULD OPEN ON, REMEMBERED ON THE ACCOUNT
 * ===========================================================================
 * Somebody followed a community, a product, a creator or a course, then
 * installed Storelib and signed in on the phone. The store does not hand
 * the page to the app (iOS has no install referrer; Android's is a native
 * read this web layer cannot do). The account can: joining, or tapping
 * Open in the app, writes the path here. The next sign-in that was not
 * already going somewhere (lib/auth/continue) opens that path once.
 *
 * Pure aside from rememberAppOpen, which only the server calls.
 */

/** user_metadata: the path to open. */
export const APP_OPEN_PATH = "storelib_open_path"
/** user_metadata: that path, once a sign-in has used it. */
export const APP_OPEN_USED = "storelib_open_used"

/** A page the app is willing to open (openTarget), or null. */
export function safeAppOpenPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const path = raw.split("#")[0]
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 300) return null
  return openTarget(`https://storelib.com${path}`)
}

/** The path still waiting, or null once this sign-in has already used it. */
export function pendingAppOpen(meta: Record<string, unknown> | null | undefined): string | null {
  const path = safeAppOpenPath(meta?.[APP_OPEN_PATH])
  if (!path) return null
  if (meta?.[APP_OPEN_USED] === path) return null
  return path
}

/**
 * A sign-in with nowhere else to go opens the remembered page. An explicit
 * next (the community they just signed up from, Sell on Storelib, a
 * receipt) always wins.
 */
export function destinationWithAppOpen(
  destination: string,
  meta: Record<string, unknown> | null | undefined,
  carryNext: string | null,
): { destination: string; used: string | null } {
  if (carryNext) return { destination, used: null }
  const pending = pendingAppOpen(meta)
  if (!pending) return { destination, used: null }
  return { destination: pending, used: pending }
}

/** Remember the page on this account, so the app can open it after a sign-in. */
export async function rememberAppOpen(userId: string, raw: unknown): Promise<void> {
  const path = safeAppOpenPath(raw)
  if (!path || !userId) return
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const db = createAdminClient()
  const { data, error } = await db.auth.admin.getUserById(userId)
  if (error || !data.user) return
  const meta = { ...(data.user.user_metadata ?? {}) } as Record<string, unknown>
  if (meta[APP_OPEN_PATH] === path && meta[APP_OPEN_USED] !== path) return
  meta[APP_OPEN_PATH] = path
  meta[APP_OPEN_USED] = ""
  await db.auth.admin.updateUserById(userId, { user_metadata: meta })
}
