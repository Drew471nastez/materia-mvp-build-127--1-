/**
 * ===========================================================================
 *  THE PAGE A WEBSITE REVIEW WAS WRITTEN ON (round AH)
 * ===========================================================================
 * A buyer who writes a review on a store's website and confirms it from the
 * email comes back to that page, at the reviews, not to a Storelib page. The
 * form sends the page's address (or the browser's Referer says it); it is
 * kept only when it is on the host the form was posted to, and it rides the
 * confirm link as `back`. Before anybody is sent there, the confirm step
 * checks the host serves that store's website (lib/physical/order-link-server
 * storeOriginFor), so the link can never be turned into a way to anywhere
 * else.
 *
 * Pure, so the route, the email and the tests agree.
 */

const MAX = 1000

/** The page, as an https (or local http) address on `host`, without its #fragment; else null. */
export function cleanReturnPage(raw: unknown, host: string | null | undefined): string | null {
  if (typeof raw !== "string" || !raw || raw.length > MAX || !host) return null
  try {
    const u = new URL(raw)
    if (u.protocol !== "https:" && !(u.protocol === "http:" && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(u.host))) return null
    if (u.username || u.password) return null
    if (u.host.toLowerCase() !== host.toLowerCase()) return null
    u.hash = ""
    u.searchParams.delete("slr")
    return u.toString()
  } catch {
    return null
  }
}

/** The page again with the section told what happened (lib/reviews/widgets/enhance.ts reads `slr`). */
export function returnWithState(page: string, state: "posted" | "waiting"): string {
  const u = new URL(page)
  u.hash = ""
  u.searchParams.set("slr", state)
  return u.toString()
}
