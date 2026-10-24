/**
 * ===========================================================================
 *  A SAVED LIST, AS THE BROWSER KEEPS IT
 * ===========================================================================
 * The heart on a product saves it. For a visitor who is not signed in the
 * list lives in this browser, per website: local storage under the creator's
 * id, so two creators' websites never share one, and a copy in a cookie on
 * the website's own host so the Wishlist page can be drawn on the server
 * with the products in it rather than empty and then filled.
 *
 * For a visitor who is signed in, the list is their account's, in Postgres
 * (lib/site-accounts/wishlist-store.ts), and what the browser keeps is a copy
 * for drawing hearts without waiting. Signing in moves the guest list into
 * the account's and empties the guest one.
 *
 * Pure and dependency free, so the header, the sections and the routes all
 * read a list the same way, and tests/site-accounts.test.ts can drive it.
 */

/** More than anybody saves on one shop, and a bound on the cookie's size. */
export const WISHLIST_MAX = 60
/** The cards the builder canvas's Wishlist page shows as samples before a heart is pressed there (StorelibSection). */
export const WISHLIST_SAMPLE_COUNT = 4

export const GUEST_COOKIE = "sl_wishlist"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isProductId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value)
}

/** Where a website's guest list is kept in local storage. */
export function guestStorageKey(creatorId: string): string {
  return `storelib:wishlist:${creatorId}`
}

/** Where the signed-in account's copy is kept, for drawing hearts at once. */
export function accountStorageKey(creatorId: string): string {
  return `storelib:wishlist-account:${creatorId}`
}

/** Newest first, product ids only, each once, at most WISHLIST_MAX. */
export function cleanList(input: unknown): string[] {
  const list = Array.isArray(input) ? input : []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of list) {
    if (!isProductId(item)) continue
    const id = item.toLowerCase()
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= WISHLIST_MAX) break
  }
  return out
}

/** Whatever local storage held, as a list. A broken value is an empty list, not a broken page. */
export function parseStored(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    return cleanList(JSON.parse(raw))
  } catch {
    return []
  }
}

export function serializeList(list: string[]): string {
  return JSON.stringify(cleanList(list))
}

/**
 * The cookie copy: ids joined by dots. A comma is not allowed in a cookie
 * value and a UUID has no dot, so nothing needs escaping.
 */
export function cookieValue(list: string[]): string {
  return cleanList(list).join(".")
}

export function parseCookieValue(raw: string | null | undefined): string[] {
  if (!raw) return []
  return cleanList(String(raw).split("."))
}

/** Saved now, at the front; or taken out. */
export function toggled(list: string[], id: string, on: boolean): string[] {
  if (!isProductId(id)) return cleanList(list)
  const key = id.toLowerCase()
  const without = cleanList(list).filter((x) => x !== key)
  return on ? cleanList([key, ...without]) : without
}

/** The account's list with a guest list moved into it: the account's order first, the guest's new ones after. */
export function merged(account: string[], guest: string[]): string[] {
  const a = cleanList(account)
  const have = new Set(a)
  return cleanList([...a, ...cleanList(guest).filter((id) => !have.has(id))])
}
