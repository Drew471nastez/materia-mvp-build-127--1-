import "server-only"

/**
 * ===========================================================================
 *  A PERSON'S PUBLIC ACTIVITY, NEWEST FIRST
 * ===========================================================================
 * What their profile's Activity tab lists, merged from three tables with a
 * keyset cursor (lib/profile/activity-cursor.ts):
 *
 *   COMMUNITIES   joined a community, posted, finished a course, from
 *                 community_activity, ONLY in communities that are
 *                 published, public, not suspended, not deleted and not
 *                 hidden by Storelib. A post counts only while it is
 *                 published and its space is open to every member (no tier,
 *                 level, product or role rule) and not archived. Private and
 *                 unlisted communities never appear, and neither do
 *                 reactions, comments, RSVPs or leaving.
 *   REVIEWS       their published reviews.
 *   PRODUCTS      what they published, when their store is live, without
 *                 the products that sell a community tier.
 *
 * A post's words stay behind the community's door: a post in a paid
 * community shows where it was posted and nothing of what it says. In a
 * free community, which anybody may join, its title is shown.
 *
 * The caller decides whether to ask at all (profiles.show_activity, the
 * communities switch); this file only reads what is public. Service role,
 * because every filter that keeps this public is written out here.
 */
import { isOpenRule } from "@/lib/communities/access"
import { getProductInternalPath } from "@/lib/url-helpers"
import { activityKey, afterFilter, mergePages, type Position, type SourcePage } from "./activity-cursor"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export type ProfileActivityKind = "joined" | "posted" | "posted_in" | "completed_course" | "reviewed" | "published"

export interface ProfileActivityItem extends Position {
  kind: ProfileActivityKind
  /** The thing it is about: a community, a post's title, a course, a product. */
  title: string
  /** Where it happened: "General · Design Club". */
  context: string | null
  /** A review's words. */
  excerpt: string | null
  rating: number | null
  href: string | null
  imageUrl: string | null
}

export interface ProfileActivityPage {
  items: ProfileActivityItem[]
  next: Position | null
}

export const ACTIVITY_PAGE = 12
/** How many communities a person's activity is read across. */
const COMMUNITY_SCAN = 300
const PUBLIC_KINDS = ["joined", "post", "course_completed"] as const

interface PublicCommunity {
  id: string
  slug: string
  name: string
  logo_url: string | null
  access: string
}

const uniq = (ids: (string | null | undefined)[]) => [...new Set(ids.filter((v): v is string => typeof v === "string" && v.length > 0))]
const rawId = (key: string) => key.slice(3).replace(/^0+(?=\d)/, "")

/* eslint-disable @typescript-eslint/no-explicit-any */
function keyset(q: any, prefix: "ca" | "pr" | "rv", after: Position | null): any {
  if (!after) return q
  const f = afterFilter(prefix, after, rawId)
  if (f.op === "or") return q.or(f.expr)
  return f.op === "lt" ? q.lt("created_at", f.at) : q.lte("created_at", f.at)
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function read<T>(what: string, run: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await run()
    if (error) {
      const code = String((error as { code?: string }).code ?? "")
      /* A table or column that is not there yet is "nothing yet", not a failure. */
      if (!["42P01", "PGRST205", "42703", "PGRST204"].includes(code)) console.error(`[profile] activity ${what}: ${(error as { message?: string }).message ?? code}`)
      return []
    }
    return (data as T[] | null) ?? []
  } catch (e) {
    console.error(`[profile] activity ${what}: ${e instanceof Error ? e.message : e}`)
    return []
  }
}

/** The public communities this person is or was in, or owns. */
export async function publicCommunitiesOf(db: Db, userId: string): Promise<Map<string, PublicCommunity>> {
  const [members, owned] = await Promise.all([
    read<{ community_id: string }>("memberships", () => db.from("community_members").select("community_id").eq("user_id", userId).limit(COMMUNITY_SCAN)),
    read<{ id: string }>("owned", () => db.from("communities").select("id").eq("owner_user_id", userId).limit(50)),
  ])
  const ids = uniq([...members.map((m) => m.community_id), ...owned.map((o) => o.id)])
  if (ids.length === 0) return new Map()
  const rows = await read<PublicCommunity>("communities", () =>
    db
      .from("communities")
      .select("id, slug, name, logo_url, access")
      .in("id", ids)
      .eq("status", "published")
      .eq("visibility", "public")
      .eq("platform_hidden", false)
      .is("deleted_at", null)
      .is("suspended_at", null),
  )
  return new Map(rows.map((c) => [c.id, c]))
}

async function communitySource(db: Db, userId: string, after: Position | null, limit: number): Promise<SourcePage<ProfileActivityItem>> {
  const communities = await publicCommunitiesOf(db, userId)
  if (communities.size === 0) return { items: [], horizon: null }
  const fetch = (limit + 1) * 2
  type Row = { id: number | string; community_id: string; kind: string; target_type: string | null; target_id: string | null; created_at: string }
  const rows = await read<Row>("community", () =>
    keyset(
      db
        .from("community_activity")
        .select("id, community_id, kind, target_type, target_id, created_at")
        .eq("user_id", userId)
        .in("community_id", [...communities.keys()])
        .in("kind", [...PUBLIC_KINDS]),
      "ca",
      after,
    )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(fetch),
  )
  const postIds = uniq(rows.filter((r) => r.kind === "post").map((r) => r.target_id))
  const courseIds = uniq(rows.filter((r) => r.kind === "course_completed").map((r) => r.target_id))
  type PostRow = { id: string; community_id: string; space_id: string | null; title: string | null; status: string; deleted_at: string | null }
  const [posts, courses] = await Promise.all([
    postIds.length
      ? read<PostRow>("posts", () => db.from("community_feed_posts").select("id, community_id, space_id, title, status, deleted_at").in("id", postIds))
      : Promise.resolve([] as PostRow[]),
    courseIds.length
      ? read<{ id: string; title: string | null; slug: string | null; thumbnail_url: string | null }>("courses", () => db.from("products").select("id, title, slug, thumbnail_url").in("id", courseIds))
      : Promise.resolve([]),
  ])
  const spaceIds = uniq(posts.map((p) => p.space_id))
  const spaces = spaceIds.length
    ? await read<{ id: string; name: string; view_access: unknown; archived_at: string | null }>("spaces", () => db.from("community_spaces").select("id, name, view_access, archived_at").in("id", spaceIds))
    : []
  const postById = new Map(posts.map((p) => [p.id, p]))
  const spaceById = new Map(spaces.map((s) => [s.id, s]))
  const courseById = new Map(courses.map((c) => [c.id, c]))

  const items: ProfileActivityItem[] = []
  for (const r of rows) {
    const c = communities.get(r.community_id)
    if (!c) continue
    const base = { at: r.created_at, key: activityKey(r.id), excerpt: null, rating: null }
    if (r.kind === "joined") {
      items.push({ ...base, kind: "joined", title: c.name, context: null, href: `/community/${c.slug}`, imageUrl: c.logo_url })
    } else if (r.kind === "post") {
      const p = r.target_id ? postById.get(r.target_id) : undefined
      if (!p || p.community_id !== c.id || p.status !== "published" || p.deleted_at) continue
      let space: string | null = null
      if (p.space_id) {
        const s = spaceById.get(p.space_id)
        /* A restricted or archived space is not public, even inside a public community. */
        if (!s || s.archived_at || !isOpenRule(s.view_access as never)) continue
        space = s.name
      }
      const href = `/community/${c.slug}/post/${p.id}`
      const title = c.access === "free" ? p.title?.trim() || null : null
      if (title) {
        /* "Posted Hello world", under it "General · Design Club". */
        items.push({ ...base, kind: "posted", title, context: space ? `${space} · ${c.name}` : c.name, href, imageUrl: c.logo_url })
      } else {
        /* "Posted in General", under it "Design Club": where, and nothing of what. */
        items.push({ ...base, kind: "posted_in", title: space ?? c.name, context: space ? c.name : null, href, imageUrl: c.logo_url })
      }
    } else if (r.kind === "course_completed") {
      const course = r.target_id ? courseById.get(r.target_id) : undefined
      if (!course) continue
      items.push({ ...base, kind: "completed_course", title: course.title?.trim() || "A course", context: c.name, href: `/community/${c.slug}/classroom`, imageUrl: course.thumbnail_url })
    }
  }
  const last = rows[rows.length - 1]
  return { items, horizon: rows.length >= fetch && last ? { at: last.created_at, key: activityKey(last.id) } : null }
}

async function reviewSource(db: Db, userId: string, after: Position | null, limit: number): Promise<SourcePage<ProfileActivityItem>> {
  const fetch = limit + 1
  type Row = { id: string; rating: number | null; content: string | null; created_at: string; product_id: string | null }
  const rows = await read<Row>("reviews", () =>
    keyset(db.from("reviews").select("id, rating, content, created_at, product_id").eq("buyer_id", userId).eq("status", "published"), "rv", after)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(fetch),
  )
  const productIds = uniq(rows.map((r) => r.product_id))
  const products = productIds.length
    ? await read<{ id: string; title: string | null; slug: string | null; thumbnail_url: string | null; status: string | null }>("reviewed products", () =>
        db.from("products").select("id, title, slug, thumbnail_url, status").in("id", productIds),
      )
    : []
  const byId = new Map(products.map((p) => [p.id, p]))
  const items: ProfileActivityItem[] = rows.map((r) => {
    const p = r.product_id ? byId.get(r.product_id) : undefined
    const live = p?.status === "published" && p.slug
    return {
      at: r.created_at,
      key: `rv:${r.id}`,
      kind: "reviewed" as const,
      title: p?.title?.trim() || "A product",
      context: null,
      excerpt: (r.content || "").trim().slice(0, 280) || null,
      rating: Math.min(5, Math.max(1, Math.round(Number(r.rating) || 5))),
      href: live ? getProductInternalPath(p!.slug as string) : null,
      imageUrl: p?.thumbnail_url ?? null,
    }
  })
  const last = rows[rows.length - 1]
  return { items, horizon: rows.length >= fetch && last ? { at: last.created_at, key: `rv:${last.id}` } : null }
}

async function productSource(db: Db, creatorId: string, handle: string | null, after: Position | null, limit: number): Promise<SourcePage<ProfileActivityItem>> {
  const fetch = limit + 1
  type Row = { id: string; title: string | null; slug: string | null; thumbnail_url: string | null; created_at: string }
  const base = (exclude: boolean) => {
    let q = db.from("products").select("id, title, slug, thumbnail_url, created_at").eq("creator_id", creatorId).eq("status", "published")
    if (exclude) q = q.is("community_id", null)
    return keyset(q, "pr", after).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(fetch)
  }
  let rows: Row[] = []
  try {
    let res = await base(true)
    if (res.error && ["42703", "PGRST204"].includes(String(res.error.code))) res = await base(false)
    rows = res.error ? [] : ((res.data as Row[] | null) ?? [])
  } catch {
    rows = []
  }
  const items: ProfileActivityItem[] = rows.map((r) => ({
    at: r.created_at,
    key: `pr:${r.id}`,
    kind: "published" as const,
    title: r.title?.trim() || "A product",
    context: null,
    excerpt: null,
    rating: null,
    href: r.slug ? getProductInternalPath(r.slug, handle || undefined) : null,
    imageUrl: r.thumbnail_url,
  }))
  const last = rows[rows.length - 1]
  return { items, horizon: rows.length >= fetch && last ? { at: last.created_at, key: `pr:${last.id}` } : null }
}

/**
 * One page of a person's public activity. `creatorId` only when their store
 * is live (their products are then part of it); `communities` false while
 * the communities switch is off.
 */
export async function readProfileActivity(
  db: Db,
  input: { userId: string; creatorId: string | null; storeHandle?: string | null; communities: boolean; after?: Position | null; limit?: number },
): Promise<ProfileActivityPage> {
  const limit = Math.max(1, Math.min(30, input.limit ?? ACTIVITY_PAGE))
  const after = input.after ?? null
  const sources = await Promise.all([
    input.communities ? communitySource(db, input.userId, after, limit) : Promise.resolve({ items: [], horizon: null }),
    reviewSource(db, input.userId, after, limit),
    input.creatorId ? productSource(db, input.creatorId, input.storeHandle ?? null, after, limit) : Promise.resolve({ items: [], horizon: null }),
  ])
  return mergePages<ProfileActivityItem>(sources, limit, after)
}
