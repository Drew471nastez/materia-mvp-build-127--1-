/**
 * ===========================================================================
 *  WHERE A TAP ON A PUSH OPENS, INSIDE THE APP
 * ===========================================================================
 * The phone apps (lib/push/client.ts, pushNotificationActionPerformed) and
 * browsers (lib/push/sender.ts, the notification's url) read a push's data
 * here, so both open the same page:
 *
 *   type "sale"              /app/sales
 *   type "payout_available"  /app/payouts
 *   type "notification"      its page inside /app (lib/notifications/push.ts)
 *   type "inbox"             its page anywhere on storelib.com: a community
 *                            post, an event, a conversation (?dm=), a
 *                            creator's product (lib/notifications/push-bridge.ts)
 *
 * Only a path on storelib.com is ever followed, in the app's own WebView: never
 * another host, never "//host", never a script address. Anything else opens
 * nothing (the app stays where it is). Pure and browser safe.
 */

/** A path on storelib.com that a tap may open, or null. */
export function inboxTapTarget(url: unknown): string | null {
  if (typeof url !== "string") return null
  const u = url.trim()
  if (!u.startsWith("/") || u.startsWith("//") || u.startsWith("/\\") || u.length > 500) return null
  if (/[\s<>"'`\u0000-\u001f\u007f\\]/.test(u)) return null
  /* The launch gate is not a page to land on: it would only send the person on again. */
  if (/^\/native-start(?:[/?#]|$)/.test(u)) return null
  return u
}

/** Inside /app only, as lib/notifications/push.ts appPath writes it. */
function appTarget(url: unknown): string {
  const u = typeof url === "string" ? url : ""
  return /^\/app(?:[/?#]|$)/.test(u) && !u.includes("//") && !/[\s<>"'\\]/.test(u) ? u : "/app"
}

/** The page a tap on this push opens, or null when it opens nothing. */
export function pushTapTarget(data: Record<string, unknown> | null | undefined): string | null {
  const type = typeof data?.type === "string" ? data.type : ""
  if (type === "sale") return "/app/sales"
  if (type === "payout_available") return "/app/payouts"
  if (type === "notification") return appTarget(data?.url)
  if (type === "inbox") return inboxTapTarget(data?.url)
  return null
}
