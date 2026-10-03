import "server-only"

/**
 * ===========================================================================
 *  THE ROWS BEHIND A COMMUNITY SECTION ON A CREATOR'S PAGE
 * ===========================================================================
 * The creator page's Community section and the website's Community card
 * draw from what this reads (the shape is lib/communities/blocks.ts). Read
 * on the server, with the service role, after three checks that decide
 * whether there is anything to draw at all:
 *
 *   the switch      communities are on (lib/communities/flag.ts)
 *   whose           the community's creator is the page's creator, so a
 *                   section holding somebody else's id draws nothing
 *   what            published, public, not suspended, not deleted
 *
 * Then only the public previews the section asked for (see blocks.ts for
 * what each may show). Every read is bounded (a handful of rows, or a count
 * the database makes), so a community of ten thousand members costs the
 * page what a community of ten does. A read that fails leaves its part
 * empty; the section still draws.
 */
import { isOpenRule } from "../access"
import { BLOCK_LIMITS, DEFAULT_BLOCK_TOGGLES, excerptOf, firstName, isCommunityId, whyHidden, type CommunityBlockData, type CommunityBlockPerson, type CommunityBlockToggles, type CommunityChoice } from "../blocks"
import { communitiesEnabled } from "../flag"
import { joinButtonLabel, priceLine } from "../format"
import { leaderboard } from "./points"
import { missing, nowIso, reasonOf, type Db } from "./db"

const BLOCK_COLUMNS =
  "id, creator_id, slug, name, tagline, logo_url, cover_url, visibility, access, status, member_count, post_count, approval_required, directory_enabled, events_enabled, gamification_enabled, platform_hidden, suspended_at, deleted_at"

type Row = Record<string, unknown>

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null)
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0)
const safeImage = (v: unknown): string | null => {
  const s = str(v)
  return s && /^(https:\/\/|\/(?![/\\]))/i.test(s) ? s : null
}

/** People by user id, as a public preview names them: first name and photo. */
async function peopleOf(db: Db, ids: string[]): Promise<Map<string, CommunityBlockPerson>> {
  const out = new Map<string, CommunityBlockPerson>()
  if (!ids.length) return out
  try {
    const { data } = await db.from("profiles").select("id, display_name, username, avatar_url").in("id", ids.slice(0, 50))
    for (const p of (data as Row[] | null) ?? []) {
      out.set(String(p.id), { name: firstName(str(p.display_name) ?? str(p.username)), avatarUrl: safeImage(p.avatar_url) })
    }
  } catch {
    /* names left out */
  }
  return out
}

/** The price a visitor would pay to join, from the default tier (or the first one), or null. */
async function priceOf(db: Db, communityId: string): Promise<string | null> {
  try {
    const { data } = await db
      .from("community_tiers")
      .select("kind, billing, product_id, is_default, position")
      .eq("community_id", communityId)
      .is("archived_at", null)
      .order("is_default", { ascending: false })
      .order("position", { ascending: true })
      .limit(1)
    const tier = ((data as Row[] | null) ?? [])[0]
    if (!tier) return null
    if (tier.kind === "free") return "Free"
    const productId = str(tier.product_id)
    if (!productId) return null
    if (tier.billing === "recurring") {
      const { data: plan } = await db.from("membership_plans").select("monthly_price_cents, yearly_price_cents, currency").eq("product_id", productId).maybeSingle()
      return priceLine({ kind: "paid", billing: "recurring", monthlyCents: plan?.monthly_price_cents ?? null, yearlyCents: plan?.yearly_price_cents ?? null, currency: plan?.currency ?? "usd" }) || null
    }
    const { data: product } = await db.from("products").select("price_cents").eq("id", productId).maybeSingle()
    return priceLine({ kind: "paid", billing: "one_time", priceCents: product?.price_cents ?? null }) || null
  } catch {
    return null
  }
}

async function upcomingEvents(db: Db, communityId: string, now: number): Promise<{ count: number; events: CommunityBlockData["events"] }> {
  const { data, error } = await db
    .from("community_events")
    .select("id, title, starts_at, ends_at, timezone, kind, access")
    .eq("community_id", communityId)
    .eq("status", "scheduled")
    .gte("starts_at", nowIso(now))
    .order("starts_at", { ascending: true })
    .limit(20)
  if (error) throw error
  const open = ((data as Row[] | null) ?? []).filter((e) => isOpenRule(e.access as never))
  return {
    count: open.length,
    events: open.slice(0, BLOCK_LIMITS.events).map((e) => ({
      id: String(e.id),
      title: String(e.title ?? ""),
      startsAt: String(e.starts_at),
      endsAt: str(e.ends_at),
      timezone: str(e.timezone) ?? "UTC",
      kind: String(e.kind ?? "online"),
    })),
  }
}

/** The newest posts in the spaces every member can read: no chat, no restricted space, no removed post. */
async function openPosts(db: Db, communityId: string): Promise<CommunityBlockData["posts"]> {
  const { data: spaces, error } = await db.from("community_spaces").select("id, kind, view_access").eq("community_id", communityId).is("archived_at", null)
  if (error) throw error
  const open = ((spaces as Row[] | null) ?? []).filter((s) => s.kind !== "chat" && isOpenRule(s.view_access as never)).map((s) => String(s.id))
  if (!open.length) return []
  const { data, error: postsError } = await db
    .from("community_feed_posts")
    .select("id, title, body_text, author_id, created_at, reaction_count, comment_count")
    .eq("community_id", communityId)
    .eq("status", "published")
    .is("deleted_at", null)
    .in("space_id", open)
    .order("created_at", { ascending: false })
    .limit(BLOCK_LIMITS.posts)
  if (postsError) throw postsError
  const rows = (data as Row[] | null) ?? []
  const people = await peopleOf(db, [...new Set(rows.map((r) => str(r.author_id)).filter((v): v is string => Boolean(v)))])
  return rows.map((r) => ({
    id: String(r.id),
    title: str(r.title),
    excerpt: excerptOf(str(r.body_text)),
    author: str(r.author_id) ? (people.get(String(r.author_id)) ?? null) : null,
    createdAt: String(r.created_at),
    reactionCount: num(r.reaction_count),
    commentCount: num(r.comment_count),
  }))
}

async function newestMembers(db: Db, communityId: string): Promise<CommunityBlockPerson[]> {
  const { data, error } = await db
    .from("community_members")
    .select("user_id")
    .eq("community_id", communityId)
    .eq("status", "active")
    .order("joined_at", { ascending: false, nullsFirst: false })
    .limit(BLOCK_LIMITS.members)
  if (error) throw error
  const ids = ((data as Row[] | null) ?? []).map((r) => String(r.user_id))
  const people = await peopleOf(db, ids)
  return ids.map((id) => people.get(id)).filter((p): p is CommunityBlockPerson => Boolean(p))
}

async function leaders(db: Db, communityId: string): Promise<CommunityBlockData["leaders"]> {
  const top = await leaderboard(db, communityId, "30d", BLOCK_LIMITS.leaders)
  const people = await peopleOf(db, top.map((t) => t.userId))
  return top.map((t) => ({ ...(people.get(t.userId) ?? { name: "Member", avatarUrl: null }), rank: t.rank, points: t.points, level: t.level }))
}

/** Published reviews of the products that sell this community, when there are any. */
async function reviewsOf(db: Db, communityId: string): Promise<CommunityBlockData["reviews"]> {
  const { data, error } = await db.from("products").select("id, reviews_count, reviews_average").eq("community_id", communityId).limit(20)
  if (error) throw error
  const products = ((data as Row[] | null) ?? []).filter((p) => num(p.reviews_count) > 0)
  const count = products.reduce((n, p) => n + num(p.reviews_count), 0)
  if (count === 0) return null
  const average = products.reduce((n, p) => n + num(p.reviews_average) * num(p.reviews_count), 0) / count
  const { readPublishedReviews } = await import("@/lib/reviews/store")
  const pages = await Promise.all(products.slice(0, 4).map((p) => readPublishedReviews(db, { productId: String(p.id) }, { limit: BLOCK_LIMITS.reviews, offset: 0 }).catch(() => ({ reviews: [], total: 0 }))))
  const items = pages
    .flatMap((p) => p.reviews)
    .filter((r) => typeof r.content === "string" && r.content.trim())
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, BLOCK_LIMITS.reviews)
    .map((r) => ({ name: firstName(r.buyer?.display_name ?? r.reviewer_name ?? null), rating: Math.max(1, Math.min(5, Math.round(num(r.rating)))), content: excerptOf(r.content, 280), createdAt: String(r.created_at) }))
  return { average: Math.round(average * 10) / 10, count, items }
}

/** Settles a part: its value, or the empty answer when it could not be read. */
async function part<T>(label: string, run: () => Promise<T>, empty: T): Promise<T> {
  try {
    return await run()
  } catch (e) {
    if (!missing(e as { code?: string })) console.error(`[communities] block ${label}: ${reasonOf(e)}`)
    return empty
  }
}

/**
 * One community's section data, or null when there is nothing a visitor may
 * see: not this creator's, not published and public, suspended, deleted,
 * or the switch is off (`enabled` lets a caller that already asked skip the
 * second read).
 */
export async function loadCommunityBlock(
  db: Db,
  creatorId: string,
  communityId: string,
  toggles: Partial<CommunityBlockToggles> = {},
  opts: { enabled?: boolean; now?: number } = {},
): Promise<CommunityBlockData | null> {
  if (!creatorId || !isCommunityId(communityId)) return null
  if (!(opts.enabled ?? (await communitiesEnabled()))) return null
  const t = { ...DEFAULT_BLOCK_TOGGLES, ...toggles }
  const now = opts.now ?? Date.now()
  let row: Row | null = null
  try {
    const { data, error } = await db.from("communities").select(BLOCK_COLUMNS).eq("id", communityId).eq("creator_id", creatorId).maybeSingle()
    if (error) {
      if (!missing(error)) console.error(`[communities] block read: ${reasonOf(error)}`)
      return null
    }
    row = (data as Row | null) ?? null
  } catch (e) {
    console.error(`[communities] block read: ${reasonOf(e)}`)
    return null
  }
  if (!row || whyHidden(row as never)) return null

  const id = String(row.id)
  const eventsOn = row.events_enabled !== false
  const [price, events, posts, members, top, reviews] = await Promise.all([
    t.showJoin || t.showStats ? priceOf(db, id) : Promise.resolve(null),
    eventsOn && (t.showEvents || t.showStats) ? part("events", () => upcomingEvents(db, id, now), { count: 0, events: [] }) : Promise.resolve(null),
    t.showPosts ? part("posts", () => openPosts(db, id), []) : Promise.resolve([]),
    t.showMembers && row.directory_enabled === true ? part("members", () => newestMembers(db, id), []) : Promise.resolve([]),
    t.showLeaderboard && row.gamification_enabled === true ? part("leaders", () => leaders(db, id), []) : Promise.resolve([]),
    t.showReviews ? part("reviews", () => reviewsOf(db, id), null) : Promise.resolve(null),
  ])
  const slug = String(row.slug)
  return {
    id,
    slug,
    name: String(row.name),
    tagline: str(row.tagline),
    logoUrl: safeImage(row.logo_url),
    coverUrl: safeImage(row.cover_url),
    url: `/community/${encodeURIComponent(slug)}`,
    priceLine: price,
    joinLabel: row.access === "invite_only" ? "See the community" : joinButtonLabel({ isMember: false, approvalRequired: row.approval_required === true, priceLine: price }),
    memberCount: num(row.member_count),
    postCount: num(row.post_count),
    upcomingEventCount: events ? events.count : null,
    events: t.showEvents && events ? events.events : [],
    posts,
    members,
    leaders: top,
    reviews,
  }
}

/** Every Community section on a page, read together: id to data. Nothing when the switch is off. */
export async function loadCommunityBlocks(
  db: Db,
  creatorId: string,
  sections: readonly { type: string; settings?: unknown }[] | null | undefined,
): Promise<Record<string, CommunityBlockData>> {
  const wanted = (sections ?? []).filter((s) => s?.type === "community" && isCommunityId((s.settings as { communityId?: unknown } | undefined)?.communityId))
  if (!creatorId || wanted.length === 0) return {}
  if (!(await communitiesEnabled())) return {}
  /* One read per community, with every part any of its sections asked for. */
  const toggles = new Map<string, Partial<CommunityBlockToggles>>()
  for (const s of wanted.slice(0, 6)) {
    const st = (s.settings ?? {}) as Partial<CommunityBlockToggles> & { communityId: string }
    const id = st.communityId.toLowerCase()
    const prev = toggles.get(id) ?? {}
    const merged: Partial<CommunityBlockToggles> = { ...prev }
    for (const k of Object.keys(DEFAULT_BLOCK_TOGGLES) as (keyof CommunityBlockToggles)[]) merged[k] = Boolean(prev[k]) || (st[k] ?? DEFAULT_BLOCK_TOGGLES[k])
    toggles.set(id, merged)
  }
  const entries = await Promise.all([...toggles].map(async ([id, t]) => [id, await loadCommunityBlock(db, creatorId, id, t, { enabled: true })] as const))
  const out: Record<string, CommunityBlockData> = {}
  for (const [id, data] of entries) if (data) out[id] = data
  return out
}

/** The creator's communities for the builder's picker, newest first, each saying whether a visitor would see it. */
export async function creatorCommunityChoices(db: Db, creatorId: string): Promise<CommunityChoice[]> {
  if (!creatorId) return []
  const { data, error } = await db
    .from("communities")
    .select("id, name, slug, status, visibility, suspended_at, deleted_at, platform_hidden")
    .eq("creator_id", creatorId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50)
  if (error) {
    if (!missing(error)) console.error(`[communities] choices: ${reasonOf(error)}`)
    return []
  }
  return ((data as Row[] | null) ?? []).map((c) => {
    const why = whyHidden(c as never)
    return { id: String(c.id), name: String(c.name), slug: String(c.slug), status: String(c.status), visibility: String(c.visibility), shows: !why, why }
  })
}
