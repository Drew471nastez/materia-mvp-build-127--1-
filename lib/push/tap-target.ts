/**
 * Where a tapped notification sends you.
 *
 * Its own module, with no imports at all, for two reasons. It is the one piece
 * of the push client that handles untrusted input — everything in a payload's
 * `data` is a string that arrived over the network, and this one ends up in
 * `window.location.href`. And a module that imports Capacitor cannot be run by
 * a test outside a web view, so the alternative to this file is a test that
 * checks a copy of the rule rather than the rule.
 */

/** Conversation ids are UUIDs. Anything else in a push payload is not one. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Where a tapped notification sends you.
 *
 * Exported so it can be tested without a device, and written as a pure function
 * for the same reason: everything in a push payload's `data` is a string that
 * arrived over the network, and this one ends up in `window.location.href`.
 *
 * ALLOW-LIST, not deny-list. The only thing that can come out of here is
 * `/messages` or `/messages/<uuid>` — so `javascript:`, `//evil.example`,
 * `../../app/settings` and a malformed id are not four cases to remember, they
 * are simply everything that is not a uuid.
 */
export function tapTargetFor(data: Record<string, unknown> | undefined | null): string | null {
  const type = data?.type
  if (type === "sale") return "/app/sales"
  if (type === "payout_available") return "/app/payouts"
  // A social digest is a summary of several things, so it opens the list of
  // them rather than picking one to be about. Every row there links onward to
  // the listing or the person. A constant — nothing from the payload is used,
  // because nothing in the payload would improve the answer.
  if (type === "activity") return "/messages?tab=notificari"
  // A test push from the admin tool. It carries no subject, so it opens the app
  // at home rather than nowhere: a notification you tapped that does nothing at
  // all reads as broken, which is the opposite of what a test is for.
  if (type === "test") return "/"
  if (type !== "message") return null
  const id = data?.conversationId
  // The inbox rather than nothing: the tap was deliberate, and the list of
  // messages is a worse answer than the right thread but a far better one than
  // the screen they were already looking at.
  return typeof id === "string" && UUID_RE.test(id) ? `/messages/${id}` : "/messages"
}
