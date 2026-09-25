/**
 * ===========================================================================
 *  WHERE A BROWSER'S SUBSCRIPTION IS KEPT
 * ===========================================================================
 * "Sometimes in Privacy, 'Notifications on this browser' shows the error
 * 'Could not turn notifications on.'"
 *
 * The save was an upsert into push_tokens with platform "web". That table
 * was made for phones, with CHECK (platform IN ('ios', 'android')), so the
 * database refused every browser (23514) and the route said "Could not turn
 * notifications on". supabase/sql/run-now/22 lets the table take "web". Until
 * that has run, the subscription is kept on the account instead (the auth
 * user's app_metadata, which only the server can write), the same fallback
 * Settings uses for its other switches, and lib/push/sender reads both.
 *
 * The save is also no longer an upsert: a delete of this browser's endpoint,
 * then an insert. The upsert named `token` as its conflict target, which
 * needs a unique index on it; a table without one answers 42P10 and the
 * switch failed for that reason too.
 */

/** A browser push subscription as the browser gives it (PushSubscription.toJSON()). */
export type WebSubscription = { endpoint: string; keys: { p256dh: string; auth: string } }

/** The key the subscriptions are kept under in the account's app_metadata. */
export const ACCOUNT_KEY = "storelib_web_push"
/** Browsers kept on one account: the newest few. */
const ACCOUNT_LIMIT = 4

export function validSubscription(s: unknown): s is WebSubscription {
  const v = s as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null
  return (
    !!v &&
    typeof v.endpoint === "string" &&
    /^https:\/\//.test(v.endpoint) &&
    v.endpoint.length < 2048 &&
    typeof v.keys?.p256dh === "string" &&
    v.keys.p256dh.length < 256 &&
    typeof v.keys?.auth === "string" &&
    v.keys.auth.length < 128
  )
}

/** The row's token: the subscription, endpoint first. */
export function tokenOf(s: WebSubscription): string {
  return JSON.stringify({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } })
}

export function endpointOf(token: string): string | null {
  try {
    const parsed = JSON.parse(token) as { endpoint?: unknown }
    return typeof parsed.endpoint === "string" ? parsed.endpoint : null
  } catch {
    return null
  }
}

/**
 * A LIKE pattern for the rows holding this endpoint. `%` and `_` in the
 * address are escaped, so they match themselves and nothing else.
 */
export function endpointPattern(endpoint: string): string {
  const quoted = JSON.stringify(endpoint).slice(1, -1)
  return `%"endpoint":"${quoted.replace(/[\\%_]/g, (c) => `\\${c}`)}"%`
}

/** What a database error means for this save. */
export function saveFailure(error: { code?: string | null; message?: string | null } | null | undefined):
  | "none"
  | "platform_refused"
  | "no_table"
  | "duplicate"
  | "other" {
  if (!error) return "none"
  const code = String(error.code ?? "")
  const message = String(error.message ?? "")
  if (code === "23514" || /check constraint/i.test(message)) return "platform_refused"
  if (code === "42P01" || code === "PGRST205" || /could not find the table|does not exist/i.test(message)) return "no_table"
  if (code === "23505") return "duplicate"
  return "other"
}

type AdminAuth = {
  auth: {
    admin: {
      getUserById: (id: string) => Promise<{ data: { user: { app_metadata?: Record<string, unknown> } | null }; error: unknown }>
      updateUserById: (id: string, attrs: { app_metadata: Record<string, unknown> }) => Promise<{ error: unknown }>
    }
  }
}

/** The subscriptions kept on the account, newest first. */
export function keptOn(appMetadata: Record<string, unknown> | null | undefined): WebSubscription[] {
  const list = appMetadata?.[ACCOUNT_KEY]
  return Array.isArray(list) ? list.filter(validSubscription) : []
}

export async function readKept(admin: AdminAuth, userId: string): Promise<WebSubscription[]> {
  try {
    const { data } = await admin.auth.admin.getUserById(userId)
    return keptOn(data?.user?.app_metadata)
  } catch {
    return []
  }
}

/** Keeps this browser on the account (newest first, one entry per endpoint). */
export async function keepOnAccount(admin: AdminAuth, userId: string, sub: WebSubscription): Promise<boolean> {
  const current = await readKept(admin, userId)
  const next = [sub, ...current.filter((s) => s.endpoint !== sub.endpoint)].slice(0, ACCOUNT_LIMIT)
  const { error } = await admin.auth.admin.updateUserById(userId, { app_metadata: { [ACCOUNT_KEY]: next } })
  return !error
}

export async function forgetOnAccount(admin: AdminAuth, userId: string, endpoints: string[]): Promise<void> {
  const current = await readKept(admin, userId)
  const next = current.filter((s) => !endpoints.includes(s.endpoint))
  if (next.length === current.length) return
  await admin.auth.admin.updateUserById(userId, { app_metadata: { [ACCOUNT_KEY]: next } })
}
