/**
 * ===========================================================================
 *  WHERE A ONEPAGE NAME LEADS, FOR EVERY CREATOR, OLD ADDRESS OR NEW
 * ===========================================================================
 * Every address a OnePage has ever had ends up asking one question: whose
 * page is `{name}`, and where does it live now? This file is the only
 * answer. Three callers ask it:
 *
 *   proxy.ts                  the old addresses ({name}.storelib.com/links,
 *                             storelib.com/{name}/links, /{name}.links,
 *                             /l/{name}, and storelib.me/l/{name}), so the
 *                             visitor is sent to the final address in one hop
 *   app/(marketing)/l/[slug]  the page itself, which storelib.me/{name}
 *                             renders from (lib/onepage/published-page)
 *   the share image           through the same published-page read
 *
 * THE ORDER, and why each step is where it is:
 *
 *   1. a published OnePage whose address (slug) is the name, in any case
 *   2. else the published OnePage of the account whose username is the name,
 *      in any case (a page saved under another address, "andrew-rullz" for
 *      the account "andrewrullz", still answers at the username)
 *   3. else, when an account holds the name but has no published OnePage,
 *      that account's creator page, storelib.com/{username}, with a
 *      TEMPORARY redirect so the address moves to the OnePage the day
 *      they make one. Before a past name, because the person who holds a
 *      name now owns every address made of it.
 *   4. else a name somebody used to have: a past username
 *      (username_history) or a past page address (onepage_slug_history),
 *      followed to the current name and resolved again by steps 1 to 3.
 *      A permanent move, so a search engine moves what it knows.
 *   5. else nothing: the real not found.
 *
 * WHY dj-danut.storelib.com/links WAS A 404. Every old address was sent to
 * storelib.me/{name} on the assumption that a OnePage lives there. Measured
 * on production: storelib.com/dj-danut, the creator page, answered 200,
 * while storelib.me/dj-danut and its share image answered 404. That page
 * already looked the name up as an address and then as a username, so a 404
 * there means the account has no published OnePage the lookup can reach.
 * That is how an account from before onboarding made one looks
 * (lib/onepage/ensure-onepage: the row used to be made only the first time a
 * creator opened the OnePage screen), and the Share card had been handing
 * out their /links address all the same. Step 3 is what sends them
 * somewhere real.
 *
 * Pure: the database is reached only through the `OnePageAddressLookup` it
 * is handed (lib/onepage/address-lookup builds one on Supabase), so every
 * case is pinned by tests/onepage-old-links.test.ts with fixtures.
 */
import { onePageUrl } from "@/lib/onepage/address"
import { isResolvableOnePageName } from "@/lib/onepage/username"

/** What the resolver may ask. Each answer is case-insensitive on the name. */
export interface OnePageAddressLookup<Row> {
  /** The PUBLISHED OnePage whose address is this name. */
  pageBySlug(name: string): Promise<Row | null>
  /** The account whose username is this name now. */
  accountByUsername(name: string): Promise<{ id: string; username: string } | null>
  /** That account's PUBLISHED OnePage, whatever its address. */
  pageOfAccount(accountId: string): Promise<Row | null>
  /** The username an account that once had this name has now (newest change first). */
  renamedUsername(name: string): Promise<string | null>
  /** The address a published OnePage that once had this name has now. */
  renamedSlug(name: string): Promise<string | null>
}

export type OnePageAddress<Row> =
  /** A page answers at this name: render it, or send an old address to storelib.me/{name}. */
  | { kind: "page"; name: string; page: Row; via: "slug" | "username" }
  /** The name was somebody's once; their page is at storelib.me/{name} now. */
  | { kind: "moved"; name: string; via: "username" | "slug" }
  /** The account has no published OnePage: their creator page, storelib.com/{username}. */
  | { kind: "creator"; username: string }
  | { kind: "missing" }

/** How many renames in a row are followed (a to b, b to c...). A loop stops at the first name seen twice. */
const MAX_RENAMES = 3

type Current<Row> = Extract<OnePageAddress<Row>, { kind: "page" | "creator" }>

/** Steps 1 to 3 for one name: what answers at it today, or null. */
async function answersToday<Row>(name: string, lookup: OnePageAddressLookup<Row>): Promise<Current<Row> | null> {
  const bySlug = await lookup.pageBySlug(name)
  if (bySlug) return { kind: "page", name: name.toLowerCase(), page: bySlug, via: "slug" }
  const account = await lookup.accountByUsername(name)
  if (!account) return null
  const byAccount = await lookup.pageOfAccount(account.id)
  if (byAccount) return { kind: "page", name: name.toLowerCase(), page: byAccount, via: "username" }
  return { kind: "creator", username: account.username }
}

/**
 * Where `name` leads. A lookup that throws is left to throw: the proxy then
 * keeps the redirect it would have made anyway, and the page answers its
 * not found, so a database hiccup never sends anybody somewhere wrong.
 */
export async function resolveOnePageAddress<Row>(rawName: string, lookup: OnePageAddressLookup<Row>): Promise<OnePageAddress<Row>> {
  const name = (rawName || "").trim()
  if (!isResolvableOnePageName(name)) return { kind: "missing" }

  const today = await answersToday(name, lookup)
  if (today) return today

  const seen = new Set([name.toLowerCase()])
  let current = name
  for (let i = 0; i < MAX_RENAMES; i++) {
    const username = await lookup.renamedUsername(current)
    const next = username ?? (await lookup.renamedSlug(current))
    if (!next || !isResolvableOnePageName(next) || seen.has(next.toLowerCase())) break
    seen.add(next.toLowerCase())
    const now = await answersToday(next, lookup)
    if (now?.kind === "page") return { kind: "moved", name: now.name, via: username ? "username" : "slug" }
    if (now) return now
    current = next
  }
  return { kind: "missing" }
}

export interface OldAddressRedirect {
  location: string
  status: 301 | 307 | 308
}

/**
 * The redirect an OLD address answers with, once the name is resolved. A
 * page, and a name nothing answers to, keep the redirect the proxy already
 * had (storelib.me/{name}, where the page is or where its 404 is), so every
 * creator whose old link worked gets byte for byte the same answer. Only a
 * rename and a creator without a OnePage change it, and both go straight to
 * the final address, with the query (utm, ref) carried through.
 */
export function oldAddressRedirect(
  address: OnePageAddress<unknown>,
  already: OldAddressRedirect,
  context: { search: string; mainDomain: string },
): OldAddressRedirect {
  const search = context.search || ""
  if (address.kind === "moved") return { location: `${onePageUrl(address.name)}${search}`, status: 308 }
  if (address.kind === "creator") return { location: `${creatorPageUrl(address.username, context.mainDomain)}${search}`, status: 307 }
  return already
}

/** storelib.com/{username}, the creator page, lower case. */
export function creatorPageUrl(username: string, mainDomain: string): string {
  const main = (mainDomain || "storelib.com").toLowerCase()
  const scheme = main.includes("localhost") ? "http" : "https"
  return `${scheme}://${main}/${encodeURIComponent(username.trim().toLowerCase())}`
}
