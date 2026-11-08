/**
 * ===========================================================================
 *  START WITH AI: WHAT THIS CREATOR REALLY HAS (no model)
 * ===========================================================================
 * The capability manifest a generated website is planned against. A site
 * that promises a shop with no products, quotes reviews nobody wrote or
 * links a community that does not exist is worse than a plain one, so the
 * planner and every section writer are told exactly what is real:
 *
 *   • the store: its name, products by type with ids and prices, collections,
 *     currency and the reviews shown on the site (the agent's own
 *     read_store facts, lib/website-builder/agent/store-facts-server.ts);
 *   • its communities (only the ones a website may show), published forms
 *     and booking forms, live blog posts;
 *   • the brand: the name and picture the creator uses.
 *
 * `readCapabilities` reads; `describeCapabilities`, `realNumbers` and
 * `proofAvailable` are pure, so the tests hand in a manifest of their own.
 * Every query is scoped to the creator and every read may fail on its own: a
 * table that is not there is "none", never an error.
 */
import type { StoreFacts } from "../agent/operations"
import { describeStore } from "../agent/operations"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface Capabilities {
  /** The store's facts as the website agent reads them, or null when the catalogue would not load. */
  facts: StoreFacts | null
  brand: { name: string; avatarUrl: string | null; tagline: string | null }
  /** Products by type ("digital": 3, "course": 1, ...). */
  productTypes: Record<string, number>
  /** Communities a website may show (published, public, not hidden). */
  communities: { id: string; name: string }[]
  forms: { published: number; bookings: number }
  blog: { posts: number }
}

export const EMPTY_CAPABILITIES: Capabilities = {
  facts: null,
  brand: { name: "", avatarUrl: null, tagline: null },
  productTypes: {},
  communities: [],
  forms: { published: 0, bookings: 0 },
  blog: { posts: 0 },
}

async function quiet<T>(work: () => PromiseLike<T> | T, fallback: T): Promise<T> {
  try {
    return await work()
  } catch {
    return fallback
  }
}

/**
 * Reads the manifest. `readFacts` is the store read (the agent's), passed in
 * so the server route hands lib/website-builder/agent/store-facts-server.ts
 * and a test a stand in.
 */
export async function readCapabilities(
  db: Db,
  input: { creatorId: string; ownerUserId: string | null },
  readFacts: (db: Db, creatorId: string) => Promise<StoreFacts | null>,
): Promise<Capabilities> {
  const { creatorId, ownerUserId } = input
  const [facts, profile, creatorRow, communities, forms, posts] = await Promise.all([
    quiet(() => readFacts(db, creatorId), null),
    quiet(async () => {
      if (!ownerUserId) return null
      const { data } = await db.from("profiles").select("display_name, username, avatar_url").eq("id", ownerUserId).maybeSingle()
      return (data ?? null) as { display_name?: string | null; username?: string | null; avatar_url?: string | null } | null
    }, null),
    quiet(async () => {
      const { data } = await db.from("creators").select("*").eq("id", creatorId).maybeSingle()
      return (data ?? null) as Record<string, unknown> | null
    }, null),
    quiet(async () => {
      const { data, error } = await db
        .from("communities")
        .select("id, name, status, visibility, suspended_at, deleted_at, platform_hidden")
        .eq("creator_id", creatorId)
        .is("deleted_at", null)
        .limit(20)
      if (error) return []
      return ((data ?? []) as Record<string, unknown>[])
        .filter((c) => c.status === "published" && c.visibility === "public" && !c.suspended_at && !c.platform_hidden)
        .map((c) => ({ id: String(c.id), name: String(c.name ?? "") }))
    }, [] as { id: string; name: string }[]),
    quiet(async () => {
      if (!ownerUserId) return { published: 0, bookings: 0 }
      const { data, error } = await db.from("native_forms").select("id, status, published").eq("owner_id", ownerUserId).eq("status", "published").limit(50)
      if (error) return { published: 0, bookings: 0 }
      const rows = (data ?? []) as { published?: unknown }[]
      const bookings = rows.filter((r) => JSON.stringify(r.published ?? "").includes('"booking"')).length
      return { published: rows.length, bookings }
    }, { published: 0, bookings: 0 }),
    quiet(async () => {
      const { count, error } = await db.from("site_blog_posts").select("id", { count: "exact", head: true }).eq("creator_id", creatorId).eq("status", "published")
      return error ? 0 : count ?? 0
    }, 0),
  ])
  const productTypes: Record<string, number> = {}
  for (const p of facts?.products ?? []) if (p.published) productTypes[p.type || "product"] = (productTypes[p.type || "product"] ?? 0) + 1
  const pick = (...values: unknown[]) => values.map((v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "")).find(Boolean) ?? ""
  const name = pick(creatorRow?.store_name, creatorRow?.brand_name, profile?.display_name, facts?.storeName !== "this store" ? facts?.storeName : "", profile?.username)
  return {
    facts,
    brand: {
      name: name.slice(0, 80),
      avatarUrl: typeof profile?.avatar_url === "string" && /^https:\/\//.test(profile.avatar_url) ? profile.avatar_url : null,
      tagline: pick(creatorRow?.tagline, creatorRow?.bio).slice(0, 200) || null,
    },
    productTypes,
    communities,
    forms,
    blog: { posts },
  }
}

/** The numbers a stats band may show: only ones that are true of this store. */
export function realNumbers(c: Capabilities): string[] {
  const out = new Set<string>()
  const published = c.facts?.publishedProducts ?? 0
  if (published > 0) out.add(String(published))
  const reviews = c.facts?.reviews
  if (reviews && reviews.count > 0) {
    out.add(String(reviews.count))
    if (reviews.average !== null) {
      out.add(reviews.average.toFixed(1))
      out.add(`${reviews.average.toFixed(1)}/5`)
    }
  }
  if (c.communities.length) out.add(String(c.communities.length))
  if (c.blog.posts > 0) out.add(String(c.blog.posts))
  return [...out]
}

/** Kinds of social proof this store can show truthfully. */
export function proofAvailable(c: Capabilities): { quotes: boolean; reviews: boolean; numbers: boolean } {
  const reviews = c.facts?.reviews
  return {
    quotes: !!reviews && reviews.quotes.length > 0,
    reviews: !!reviews && reviews.count > 0,
    numbers: realNumbers(c).length >= 2,
  }
}

/** The manifest as the planner and the section writers read it. Stable for one job, so it caches. */
export function describeCapabilities(c: Capabilities): string {
  const proof = proofAvailable(c)
  const types = Object.entries(c.productTypes)
    .map(([t, n]) => `${n} ${t}`)
    .join(", ")
  return [
    `BRAND: ${c.brand.name || "(no name given: take it from the brief, or keep it neutral)"}${c.brand.tagline ? `. They describe themselves: "${c.brand.tagline}"` : ""}`,
    c.facts ? describeStore(c.facts) : "STORE: the catalogue could not be read. Do not plan product sections.",
    types ? `PRODUCT TYPES (published): ${types}` : "",
    c.communities.length ? `COMMUNITIES (a community_card takes the id): ${c.communities.map((x) => `${x.name} [id ${x.id}]`).join(", ")}` : "COMMUNITIES: none. Do not plan a community section.",
    `FORMS: ${c.forms.published} published${c.forms.bookings ? `, ${c.forms.bookings} for bookings` : ""}. A website cannot embed them yet: a contact section is the built-in contact form.`,
    `BLOG: ${c.blog.posts} published post${c.blog.posts === 1 ? "" : "s"}.${c.blog.posts ? " blog_featured shows them." : " Do not plan a blog section."}`,
    `SOCIAL PROOF THAT IS REAL: ${[proof.quotes ? "buyer quotes (above)" : "", proof.reviews ? "Storelib Reviews (the reviews_* sections draw them live)" : "", proof.numbers ? `numbers: ${realNumbers(c).join(", ")}` : ""].filter(Boolean).join("; ") || "none. Plan no testimonials, no reviews, no logos, no stats and no team: there is nobody real to show."}`,
  ]
    .filter(Boolean)
    .join("\n")
}
