import "server-only"

/**
 * ===========================================================================
 *  THE ADDRESSES A CREATOR'S WEBSITE ANSWERS AT, FROM THE DATABASE
 * ===========================================================================
 * The other half of ./return-url.ts: which hosts are this creator's own, so
 * a checkout can send the buyer back to one of them and to nothing else.
 *
 *   <username>.<platform>    their profile's username (proxy.ts serves it)
 *   <slug>.<platform>        their creator slug (published-site.ts, lookUpName)
 *   <handle>.<platform>      the name the website was given, now or before
 *                            (lib/website-builder/site-address-data.ts)
 *   their verified domains   custom_domains rows whose DNS has been seen
 *                            pointing at us, as stored and as served (www)
 *
 * Read with the service role, because a guest buyer has no session that
 * could read another person's rows, and scoped by hand to the one creator
 * whose product is being bought: the product decided whose sites count, the
 * link did not. Every read fails soft to "none", which sends the buyer to
 * the Storelib receipt as before: never somewhere unchecked.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { getMainDomain } from "@/lib/url-helpers"
import { servingHost } from "@/lib/custom-domains/hostname"
import { checkoutReturnTarget, normalHost } from "./return-url"
import { needsOwnHosts, onePageReturnTarget } from "@/lib/onepage/return-address"

type Admin = { from: ReturnType<typeof createAdminClient>["from"] }

/**
 * A domain whose DNS has been seen pointing at us: the same statuses as
 * LIVE_STATUSES in lib/custom-domains/store.ts, named here so this file does
 * not pull in that module's cache layer. A domain still being verified is
 * not an address anybody is sent to.
 */
const VERIFIED_STATUSES = ["active", "ssl_provisioning"]

/** A name as a subdomain label, the way getWebsiteShareUrl spells one. */
function label(name: unknown): string {
  if (typeof name !== "string") return ""
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

async function rows<T>(read: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await read()
    if (error || !data) return []
    return (Array.isArray(data) ? data : [data]) as T[]
  } catch {
    return []
  }
}

/** Every host this creator's website answers at. Empty when none can be read. */
export async function siteHostsFor(creatorId: string, admin?: Admin): Promise<string[]> {
  if (!creatorId) return []
  const db: Admin = admin ?? createAdminClient()
  const main = getMainDomain().toLowerCase()
  const [creators, domains, handles, pastHandles] = await Promise.all([
    rows<{ slug: string | null; user_id: string | null }>(() => db.from("creators").select("slug, user_id").eq("id", creatorId).maybeSingle()),
    rows<{ domain: string | null; status: string | null }>(() => db.from("custom_domains").select("domain, status").eq("creator_id", creatorId)),
    rows<{ handle: string | null }>(() => db.from("website_addresses").select("handle").eq("creator_id", creatorId)),
    rows<{ handle: string | null }>(() => db.from("website_address_history").select("handle").eq("creator_id", creatorId)),
  ])
  const creator = creators[0]
  const profiles = creator?.user_id
    ? await rows<{ username: string | null }>(() => db.from("profiles").select("username").eq("id", creator.user_id as string).maybeSingle())
    : []

  const names = [profiles[0]?.username, creator?.slug, ...handles.map((h) => h.handle), ...pastHandles.map((h) => h.handle)]
    .map(label)
    .filter(Boolean)
  const hosts = new Set<string>()
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(main)
  if (local) {
    /* A developer's machine serves every site at /w/<name> on itself. */
    hosts.add("localhost")
    hosts.add("127.0.0.1")
  } else {
    for (const n of names) hosts.add(`${n}.${main}`)
  }
  for (const d of domains) {
    if (typeof d.domain !== "string" || !VERIFIED_STATUSES.includes(String(d.status))) continue
    const bare = normalHost(d.domain).replace(/^www\./, "")
    if (!bare) continue
    hosts.add(bare)
    hosts.add(normalHost(servingHost(bare)))
  }
  return [...hosts]
}

/**
 * Where checkout sends this buyer: after paying, and when they press Back.
 * Null for either means the Storelib default (the receipt, the product).
 * The database is read only when the link asked for something.
 */
export async function checkoutReturns(input: {
  creatorId: string
  success?: unknown
  cancel?: unknown
  site?: unknown
}): Promise<{ success: string | null; cancel: string | null }> {
  const asked = [input.success, input.cancel].some((v) => typeof v === "string" && v.trim() !== "")
  if (!asked) return { success: null, cancel: null }
  /*
    BACK TO THE ONEPAGE IT WAS PRESSED ON (lib/onepage/return-address): a
    storelib.me page is checked as an address alone, with no read, since that
    host serves nothing but OnePages. A OnePage on the creator's own domain
    (<domain>/links) is one of their site hosts, read below like any other.
  */
  const onePageCancel = needsOwnHosts(input.cancel) ? null : onePageReturnTarget(input.cancel)
  if (onePageCancel && !(typeof input.success === "string" && input.success.trim() !== "")) return { success: null, cancel: onePageCancel }
  const hosts = await siteHostsFor(input.creatorId)
  if (hosts.length === 0) return { success: null, cancel: onePageCancel }
  const rules = { hosts, mainDomain: getMainDomain(), base: typeof input.site === "string" ? input.site : null }
  return {
    success: checkoutReturnTarget(input.success, rules),
    cancel: onePageCancel ?? checkoutReturnTarget(input.cancel, rules),
  }
}

/**
 * The OnePage a product page's Back returns to (`?back=`), or null. A
 * storelib.me page is checked by its address alone; one on the creator's own
 * domain is checked against the domains the database says are theirs.
 */
export async function onePageReturnFor(creatorId: string | null | undefined, raw: unknown): Promise<string | null> {
  if (typeof raw !== "string" || raw.trim() === "") return null
  if (!needsOwnHosts(raw)) return onePageReturnTarget(raw)
  if (!creatorId) return null
  return onePageReturnTarget(raw, { ownHosts: await siteHostsFor(creatorId) })
}
