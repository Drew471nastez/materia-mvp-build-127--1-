import "server-only"

/**
 * ===========================================================================
 *  A COMMUNITY AS THE PUBLIC SEES IT
 * ===========================================================================
 * Everything a visitor is shown about a community comes from here: the sales
 * page (/community/<slug> for anyone who is not a member, /about for
 * everyone), the cards on Explore, a creator's page and the library, the
 * page's metadata and the sitemap.
 *
 * WHO MAY SEE THE PAGE. A published community's page is visible whatever its
 * visibility: public ones are listed and indexed, unlisted and private ones
 * are reachable by their address and kept out of search (the page says
 * noindex). Private only ever means the CONTENT is for members, which is the
 * member pages' business. A draft or a suspended community is a 404 to
 * everyone except its owner and staff, who see the page with one line saying
 * why nobody else can.
 *
 * PRICES ARE THE PRODUCTS'. A tier never stores a price: a recurring tier is
 * a membership product (its plan holds the monthly and yearly price), a one
 * time tier is a community product (its price_cents). Read in three queries
 * for any number of communities (tiers, products, plans), never one per card.
 *
 * Before part 81 has run every read here answers "nothing", so every page
 * built on it is a 404 or an empty list, never an error.
 */
import { cache } from "react"
import { money } from "@/lib/memberships/state"
import { sanitizeDescription } from "@/lib/rich-text/sanitize"
import { readPublishedReviews } from "@/lib/reviews/store"
import { getProductInternalPath } from "@/lib/url-helpers"
import { personHref } from "@/lib/profile/person-href"
import type { TopBarCommunity, TopBarData } from "@/components/community/member/view-types"
import { parseGallery, payingTenure, type GalleryItemView } from "@/components/community/public/gallery"
import { checkoutPath, communityPath } from "@/components/community/public/paths"
import { decideJoin } from "@/components/community/public/join-state"
import type { SeoFacts } from "@/components/community/public/seo"
import type { AccessProductLink, JoinOption, LibraryCommunityRow, PublicCommunityView, PublicCreatorView, PublicReviewView, SalesPageData } from "@/components/community/public/types"
import { priceLine } from "../format"
import { can, meetsRole } from "../permissions"
import { TIER_COLUMNS, type CommunityCard, type CommunityRow, type Role, type TierRow } from "../types"
import { communitiesEnabled } from "../flag"
import { communityOpen, loadCommunity, viewerContext, type Viewer } from "./context"
import { admin, missing, reasonOf, type Db } from "./db"
import { storefrontsOf } from "./directory"
import { communityStats } from "./presence"

/** What a card needs, and nothing as heavy as the description. */
export const CARD_COLUMNS = "id, slug, name, tagline, logo_url, cover_url, category, access, visibility, status, member_count, creator_id, created_at, trending_score"

export type CardRow = Pick<
  CommunityRow,
  "id" | "slug" | "name" | "tagline" | "logo_url" | "cover_url" | "category" | "access" | "visibility" | "status" | "member_count" | "creator_id" | "created_at" | "trending_score"
> & {
  /** Read with the rows by Explore once part 87 has run (lib/communities/server/explore.ts); cardsFor reads it itself for a list that did not. */
  view_count?: number | string | null
}

interface ProductLite {
  id: string
  title: string | null
  slug: string | null
  type: string | null
  status: string | null
  price_cents: number | null
  creator_id: string | null
  reviews_count: number | null
  reviews_average: number | null
}

interface PlanLite {
  product_id: string
  monthly_price_cents: number | null
  yearly_price_cents: number | null
  currency: string | null
}

interface CreatorLite {
  id: string
  user_id: string | null
  slug: string | null
  display_name: string | null
  avatar_url: string | null
  stripe_account_id: string | null
  stripe_onboarding_status: string | null
  charges_enabled: boolean | null
  onboarding_completed?: boolean | null
}

interface ProfileLite {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

const PRODUCT_COLUMNS = "id, title, slug, type, status, price_cents, creator_id, reviews_count, reviews_average"
const CREATOR_COLUMNS = "id, user_id, slug, display_name, avatar_url, stripe_account_id, stripe_onboarding_status, charges_enabled, onboarding_completed"

const uniq = (ids: (string | null | undefined)[]) => [...new Set(ids.filter((v): v is string => typeof v === "string" && v.length > 0))]

/** Rows of a read, or none: a table that is not there yet is "none", anything else is logged and "none". */
async function rows<T>(what: string, run: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await run()
    if (error) {
      if (!missing(error as { code?: string })) console.error(`[communities] ${what}: ${reasonOf(error)}`)
      return []
    }
    return (data as T[] | null) ?? []
  } catch (e) {
    console.error(`[communities] ${what}: ${reasonOf(e)}`)
    return []
  }
}

/* ── Tiers and their prices ─────────────────────────────────────────────── */

export async function readTiers(db: Db, communityIds: (string | null | undefined)[]): Promise<TierRow[]> {
  const ids = uniq(communityIds)
  if (ids.length === 0) return []
  return rows<TierRow>("tiers", () => db.from("community_tiers").select(TIER_COLUMNS).in("community_id", ids).is("archived_at", null).order("position", { ascending: true }))
}

export async function readProducts(db: Db, productIds: string[]): Promise<Map<string, ProductLite>> {
  const ids = uniq(productIds)
  if (ids.length === 0) return new Map()
  const found = await rows<ProductLite>("tier products", () => db.from("products").select(PRODUCT_COLUMNS).in("id", ids))
  return new Map(found.map((p) => [p.id, p]))
}

export async function readPlans(db: Db, productIds: string[]): Promise<Map<string, PlanLite>> {
  const ids = uniq(productIds)
  if (ids.length === 0) return new Map()
  const found = await rows<PlanLite>("membership plans", () => db.from("membership_plans").select("product_id, monthly_price_cents, yearly_price_cents, currency").in("product_id", ids))
  return new Map(found.map((p) => [p.product_id, p]))
}

/** Whether a creator's Stripe account can take a subscription: the memberships checkout's own rule. */
export function creatorTakesPayments(c: Pick<CreatorLite, "stripe_account_id" | "stripe_onboarding_status" | "charges_enabled"> | null | undefined): boolean {
  return !!c && typeof c.stripe_account_id === "string" && c.stripe_account_id.startsWith("acct_") && c.charges_enabled !== false && c.stripe_onboarding_status === "connected"
}

const benefitsOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((b): b is string => typeof b === "string" && b.trim() !== "").map((b) => b.trim()) : [])

/**
 * The ways to belong, priced from their products. A paid tier whose product
 * is not published, or has no price, is listed with no checkout: shown,
 * never sold. A recurring tier also needs the creator's payments connected.
 */
export function optionsFor(slug: string, tiers: TierRow[], products: Map<string, ProductLite>, plans: Map<string, PlanLite>, recurringOk: boolean): JoinOption[] {
  return tiers.map((t) => {
    const product = t.product_id ? products.get(t.product_id) ?? null : null
    const plan = t.product_id ? plans.get(t.product_id) ?? null : null
    const live = !!product && product.status === "published"
    const recurring = t.billing === "recurring" || product?.type === "membership"
    const currency = (plan?.currency || "usd").toLowerCase()
    const monthly = recurring ? plan?.monthly_price_cents ?? null : null
    const yearly = recurring ? plan?.yearly_price_cents ?? null : null
    const once = !recurring ? product?.price_cents ?? null : null
    const line = priceLine({ kind: t.kind, billing: recurring ? "recurring" : t.kind === "paid" ? "one_time" : null, monthlyCents: monthly, yearlyCents: yearly, priceCents: once, currency })
    let checkout: JoinOption["checkout"] = null
    if (t.kind === "paid" && live && product) {
      if (recurring && recurringOk && (monthly || yearly)) {
        checkout = { month: monthly ? checkoutPath(product.id, slug, "month") : null, year: yearly ? checkoutPath(product.id, slug, "year") : null, once: null }
      } else if (!recurring && once && once > 0) {
        checkout = { month: null, year: null, once: checkoutPath(product.id, slug) }
      }
    }
    return {
      tierId: t.id,
      name: t.name,
      description: t.description,
      kind: t.kind,
      billing: t.kind === "free" ? null : recurring ? "recurring" : "one_time",
      productId: t.product_id,
      monthlyCents: monthly,
      yearlyCents: yearly,
      priceCents: once,
      currency,
      priceLine: line,
      benefits: benefitsOf(t.benefits),
      checkout,
    }
  })
}

/* ── Creators ───────────────────────────────────────────────────────────── */

async function readCreators(db: Db, creatorIds: (string | null | undefined)[]): Promise<Map<string, { creator: CreatorLite; profile: ProfileLite | null }>> {
  const ids = uniq(creatorIds)
  if (ids.length === 0) return new Map()
  const creators = await rows<CreatorLite>("creators", () => db.from("creators").select(CREATOR_COLUMNS).in("id", ids))
  const profiles = await rows<ProfileLite>("profiles", () => db.from("profiles").select("id, username, display_name, avatar_url").in("id", uniq(creators.map((c) => c.user_id))))
  const byUser = new Map(profiles.map((p) => [p.id, p]))
  return new Map(creators.map((c) => [c.id, { creator: c, profile: c.user_id ? byUser.get(c.user_id) ?? null : null }]))
}

function creatorView(entry: { creator: CreatorLite; profile: ProfileLite | null } | undefined): PublicCreatorView | null {
  if (!entry) return null
  const { creator, profile } = entry
  const username = (profile?.username || creator.slug || "").toLowerCase() || null
  const name = profile?.display_name?.trim() || creator.display_name?.trim() || username || "Creator"
  /* Their page, by the one rule every name follows: the storefront once onboarding is done, the profile before. */
  return { name, username, avatarUrl: profile?.avatar_url || creator.avatar_url || null, href: username ? personHref({ username, hasStorefront: !!creator.onboarding_completed }) : null }
}

/* ── Cards ──────────────────────────────────────────────────────────────── */

/** The price a card says: the free tier where there is one, else the first paid tier's. */
function cardPrice(access: CommunityRow["access"], options: JoinOption[]): string | null {
  if (access === "invite_only") return "Invite only"
  const free = options.find((o) => o.kind === "free")
  if (free && access !== "paid") return "Free"
  const paid = options.find((o) => o.kind === "paid" && o.priceLine)
  return paid?.priceLine || (free ? "Free" : null)
}

/**
 * The stars on a card: the tier products' own review averages, weighted by
 * their counts, which is what the sales page says too. Null with no reviews,
 * so a card never shows a rating nobody gave.
 */
export function cardRating(productIds: (string | null | undefined)[], products: Map<string, ProductLite>): { average: number; count: number } | null {
  const rated = uniq(productIds).map((id) => products.get(id)).filter((p): p is ProductLite => !!p && (p.reviews_count ?? 0) > 0 && (p.reviews_average ?? 0) > 0)
  const count = rated.reduce((n, p) => n + (p.reviews_count ?? 0), 0)
  if (count === 0) return null
  const average = rated.reduce((s, p) => s + (p.reviews_average ?? 0) * (p.reviews_count ?? 0), 0) / count
  return { average: Math.round(average * 10) / 10, count }
}

function viewsOf(v: CardRow["view_count"]): number | null {
  if (v === undefined || v === null) return null
  const n = typeof v === "string" ? Number(v) : v
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
}

/*
  VIEWS FOR A LIST THAT DID NOT READ THEM. Explore selects view_count with
  its rows; a creator's tab, a profile and the library select CARD_COLUMNS
  (which a database before part 87 can always answer), so their cards came
  without the eye and drew a shorter stats row than Explore's. One read by
  id for the whole list, quietly empty while the column is not there.
*/
async function readViewCounts(db: Db, ids: string[]): Promise<Map<string, CardRow["view_count"]>> {
  if (ids.length === 0) return new Map()
  const found = await rows<{ id: string; view_count: CardRow["view_count"] }>("card views", () => db.from("communities").select("id, view_count").in("id", ids))
  return new Map(found.map((r) => [r.id, r.view_count]))
}

/** Cards for any number of communities, in the order given, in five or six queries (the sixth reads views when the rows came without them). */
export async function cardsFor(db: Db, list: CardRow[]): Promise<CommunityCard[]> {
  if (list.length === 0) return []
  const withoutViews = list.some((c) => c.view_count === undefined)
  const [tiers, views] = await Promise.all([readTiers(db, list.map((c) => c.id)), withoutViews ? readViewCounts(db, uniq(list.map((c) => c.id))) : Promise.resolve(null)])
  const productIds = uniq(tiers.map((t) => t.product_id))
  const [products, plans, creators] = await Promise.all([readProducts(db, productIds), readPlans(db, productIds), readCreators(db, list.map((c) => c.creator_id))])
  return list.map((c) => {
    const own = tiers.filter((t) => t.community_id === c.id)
    const options = optionsFor(c.slug, own, products, plans, true)
    const who = c.creator_id ? creatorView(creators.get(c.creator_id)) : null
    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      tagline: c.tagline,
      logoUrl: c.logo_url,
      coverUrl: c.cover_url,
      category: c.category,
      access: c.access,
      visibility: c.visibility,
      memberCount: Math.max(0, c.member_count ?? 0),
      priceLine: cardPrice(c.access, options),
      creator: who ? { id: c.creator_id, name: who.name, username: who.username, avatarUrl: who.avatarUrl } : null,
      url: communityPath(c.slug),
      viewCount: viewsOf(c.view_count !== undefined ? c.view_count : views?.get(c.id)),
      rating: cardRating(own.map((t) => t.product_id), products),
      launchedAt: c.created_at ?? null,
    }
  })
}

/* ── The sales page ─────────────────────────────────────────────────────── */

/**
 * What members say: the published reviews of the products that sell a tier,
 * newest first. Each reviewer's name opens their page, and the line "Still a
 * paying member after 3 months" is added only when it is true today: they
 * are an active member of THIS community through a paid source (payingTenure).
 * Three reads for the whole list (members, profiles, storefronts), never one
 * per review.
 */
async function readReviews(db: Db, communityId: string, products: ProductLite[], now: number = Date.now()): Promise<PublicCommunityView["reviews"]> {
  const rated = products.filter((p) => (p.reviews_count ?? 0) > 0).slice(0, 4)
  if (rated.length === 0) return null
  const pages = await Promise.all(
    rated.map((p) =>
      readPublishedReviews(db, { productId: p.id }, { limit: 6, offset: 0 }).catch((e: unknown) => {
        console.error(`[communities] reviews of ${p.id}: ${reasonOf(e)}`)
        return { reviews: [], total: 0 }
      }),
    ),
  )
  const total = pages.reduce((n, p) => n + p.total, 0)
  if (total === 0) return null
  const picked = pages
    .flatMap((p) => p.reviews)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 6)
  const buyerIds = uniq(picked.map((r) => r.buyer?.id))
  const [members, profiles, stores] = await Promise.all([
    buyerIds.length
      ? rows<{ user_id: string; status: string; source: string | null; joined_at: string | null }>("reviewer memberships", () =>
          db.from("community_members").select("user_id, status, source, joined_at").eq("community_id", communityId).in("user_id", buyerIds),
        )
      : Promise.resolve([]),
    buyerIds.length ? rows<{ id: string; username: string | null }>("reviewer profiles", () => db.from("profiles").select("id, username").in("id", buyerIds)) : Promise.resolve([]),
    storefrontsOf(db, buyerIds),
  ])
  const memberOf = new Map(members.map((m) => [m.user_id, m]))
  const usernameOf = new Map(profiles.map((p) => [p.id, p.username]))
  const items: PublicReviewView[] = picked.map((r) => {
    const buyer = r.buyer?.id ?? null
    const username = buyer ? usernameOf.get(buyer) ?? null : null
    const m = buyer ? memberOf.get(buyer) : undefined
    return {
      id: r.id,
      rating: Math.max(1, Math.min(5, Math.round(r.rating))),
      content: r.content,
      name: r.reviewer_name?.trim() || r.buyer?.display_name?.trim() || "A member",
      avatarUrl: r.buyer?.avatar_url ?? null,
      createdAt: r.created_at,
      href: username ? personHref({ username, hasStorefront: buyer ? stores.has(buyer) : false }) : null,
      payingFor: m ? payingTenure({ status: m.status, source: m.source, joinedAt: m.joined_at }, now) : null,
    }
  })
  /* The products' own averages, weighted by their counts: what each product page already says. */
  const counted = rated.reduce((n, p) => n + (p.reviews_count ?? 0), 0)
  const average = counted > 0 ? rated.reduce((s, p) => s + (p.reviews_average ?? 0) * (p.reviews_count ?? 0), 0) / counted : items.reduce((s, r) => s + r.rating, 0) / Math.max(1, items.length)
  return { average: Math.round(average * 10) / 10, total, items }
}

/* ── The gallery ────────────────────────────────────────────────────────── */

/** communities.gallery, or null while part 85 has not added the column (or it cannot be read). */
async function readGalleryColumn(db: Db, communityId: string): Promise<unknown[] | null> {
  try {
    const { data, error } = await db.from("communities").select("gallery").eq("id", communityId).maybeSingle()
    if (error) {
      const code = (error as { code?: string }).code
      if (code !== "42703" && code !== "PGRST204" && !missing(error)) console.error(`[communities] gallery read: ${reasonOf(error)}`)
      return null
    }
    const v = (data as { gallery?: unknown } | null)?.gallery
    return Array.isArray(v) ? v : []
  } catch (e) {
    console.error(`[communities] gallery read: ${reasonOf(e)}`)
    return null
  }
}

/** Ready videos of this community, with their posters, in one read. */
async function readyVideos(db: Db, communityId: string, ids: string[]): Promise<Map<string, string | null>> {
  if (!ids.length) return new Map()
  const found = await rows<{ id: string; thumbnail_url: string | null }>("gallery videos", () =>
    db.from("media_videos").select("id, thumbnail_url").eq("community_id", communityId).eq("status", "ready").in("id", ids),
  )
  return new Map(found.map((v) => [v.id, v.thumbnail_url]))
}

/**
 * What the about page shows at the top: the creator's gallery (pictures and
 * ready videos of this community, in their order), or, before part 85 or
 * when they chose none, the cover video and the cover picture. Empty when
 * there is nothing at all, and the page then shows no media block.
 */
export async function communityGallery(db: Db, community: Pick<CommunityRow, "id" | "cover_url" | "cover_video_id">): Promise<GalleryItemView[]> {
  const raw = await readGalleryColumn(db, community.id)
  const chosen = parseGallery(raw ?? [])
  const fallback = chosen.length === 0
  const wanted = fallback ? (community.cover_video_id ? [{ type: "video" as const, videoId: community.cover_video_id }] : []) : chosen
  const posters = await readyVideos(db, community.id, wanted.filter((g) => g.type === "video").map((g) => (g as { videoId: string }).videoId))
  const out: GalleryItemView[] = []
  for (const g of wanted) {
    if (g.type === "image") out.push(g)
    else if (posters.has(g.videoId)) out.push({ type: "video", videoId: g.videoId, posterUrl: posters.get(g.videoId) ?? community.cover_url ?? null })
  }
  if (fallback && community.cover_url) out.push({ type: "image", url: community.cover_url })
  return out
}

/**
 * Whether a video is in this community's gallery while its about page is
 * open to everyone (published, not suspended): the one other video, beside
 * the cover, a visitor may play (app/api/community/[communityId]/videos/
 * [videoId]/play). Before part 85, never.
 */
export async function inPublicGallery(db: Db, community: CommunityRow, videoId: string): Promise<boolean> {
  if (community.status !== "published" || !communityOpen(community)) return false
  const raw = await readGalleryColumn(db, community.id)
  return parseGallery(raw ?? []).some((g) => g.type === "video" && g.videoId === videoId)
}

const looksLikeHtml = (v: string) => /<[a-z][\s\S]*>/i.test(v)

function rulesOf(v: unknown): { title: string; body: string }[] {
  if (!Array.isArray(v)) return []
  return v
    .map((r) => ({ title: typeof r?.title === "string" ? r.title.trim() : "", body: typeof r?.body === "string" ? r.body.trim() : "" }))
    .filter((r) => r.title || r.body)
}

function faqOf(v: unknown): { q: string; a: string }[] {
  if (!Array.isArray(v)) return []
  return v.map((f) => ({ q: typeof f?.q === "string" ? f.q.trim() : "", a: typeof f?.a === "string" ? f.a.trim() : "" })).filter((f) => f.q && f.a)
}

export interface SalesPageLoad {
  data: SalesPageData
  community: CommunityRow
  viewer: Viewer
}

/** Staff of this community: may see it while it is a draft or suspended. */
function isStaff(v: Viewer): boolean {
  return v.isOwner || v.isCreatorAccount || meetsRole(v.role, "moderator")
}

/** The community at an address, once per request however many parts of the page ask (metadata, the page). */
export const communityBySlug = cache(async (slug: string): Promise<CommunityRow | null> => loadCommunity(admin(), { slug }))

/** What the page's metadata says, from the row alone. */
export function seoFacts(c: CommunityRow): SeoFacts {
  return {
    slug: c.slug,
    name: c.name,
    tagline: c.tagline,
    description: c.description,
    seoTitle: c.seo_title,
    seoDescription: c.seo_description,
    coverUrl: c.cover_url,
    logoUrl: c.logo_url,
    indexable: communityIndexable(c),
    creatorName: null,
  }
}

/**
 * Everything the sales page draws, for this viewer, or null for a 404 (no
 * such community, deleted, or a draft or suspended one seen by somebody who
 * is not its staff).
 */
export async function loadSalesPage(slug: string, userId: string | null, given?: Db): Promise<SalesPageLoad | null> {
  /* The page's own read is shared with its metadata (communityBySlug); a caller with its own database reads its own. */
  const db: Db = given ?? admin()
  const community = given ? await loadCommunity(db, { slug }) : await communityBySlug(slug)
  if (!community) return null
  const viewer = await viewerContext(db, community, userId)
  const suspended = !communityOpen(community)
  const staff = isStaff(viewer)
  if (suspended && !staff) return null
  if (community.status === "draft" && !staff) return null

  const [tiers, links, creators] = await Promise.all([
    readTiers(db, [community.id]),
    community.access === "product" || community.access === "custom"
      ? rows<{ tier_id: string; product_id: string }>("access products", () => db.from("community_access_products").select("tier_id, product_id").eq("community_id", community.id))
      : Promise.resolve([] as { tier_id: string; product_id: string }[]),
    readCreators(db, [community.creator_id ?? ""]),
  ])
  const tierProductIds = uniq(tiers.map((t) => t.product_id))
  const accessIds = uniq(links.map((l) => l.product_id)).filter((id) => !tierProductIds.includes(id))
  const allIds = [...tierProductIds, ...accessIds]
  const [products, plans] = await Promise.all([readProducts(db, allIds), readPlans(db, allIds)])
  const entry = community.creator_id ? creators.get(community.creator_id) : undefined
  const creator = creatorView(entry)
  const recurringOk = creatorTakesPayments(entry?.creator)
  const options = optionsFor(community.slug, tiers, products, plans, recurringOk)

  const accessProducts: AccessProductLink[] = accessIds
    .map((id) => products.get(id))
    .filter((p): p is ProductLite => !!p && p.status === "published" && !!p.slug)
    .slice(0, 6)
    .map((p) => {
      const plan = plans.get(p.id)
      const line = p.type === "membership" ? priceLine({ billing: "recurring", monthlyCents: plan?.monthly_price_cents, yearlyCents: plan?.yearly_price_cents, currency: plan?.currency }) : p.price_cents && p.price_cents > 0 ? money(p.price_cents) : "Free"
      return { productId: p.id, title: p.title || "Product", href: getProductInternalPath(p.slug as string, creator?.username ?? undefined), priceLine: line }
    })

  const [reviews, gallery, stats] = await Promise.all([
    readReviews(db, community.id, tierProductIds.map((id) => products.get(id)).filter((p): p is ProductLite => !!p && p.status === "published")),
    communityGallery(db, community),
    communityStats(db, community),
  ])

  const raw = community.description ?? ""
  const view: PublicCommunityView = {
    id: community.id,
    slug: community.slug,
    name: community.name,
    tagline: community.tagline,
    logoUrl: community.logo_url,
    coverUrl: community.cover_url,
    category: community.category,
    visibility: community.visibility,
    access: community.access,
    status: community.status,
    approvalRequired: community.approval_required,
    memberCount: Math.max(0, community.member_count ?? 0),
    descriptionHtml: raw && looksLikeHtml(raw) ? sanitizeDescription(raw) || null : null,
    descriptionText: raw && !looksLikeHtml(raw) ? raw.trim() || null : null,
    benefits: benefitsOf(community.benefits),
    rules: rulesOf(community.rules),
    faq: faqOf(community.faq),
    creator,
    options,
    accessProducts,
    reviews,
    url: communityPath(community.slug),
    address: `storelib.com${communityPath(community.slug)}`,
    gallery,
    stats,
  }

  const member = viewer.member
  const join = decideJoin({
    community: {
      slug: community.slug,
      status: community.status,
      access: community.access,
      approvalRequired: community.approval_required,
      suspended,
      archived: Boolean(community.archived_at) || community.status === "archived",
      creatorName: creator?.name ?? null,
    },
    viewer: {
      signedIn: Boolean(userId),
      active: viewer.active,
      status: viewer.status,
      role: viewer.role,
      isOwner: viewer.isOwner,
      banned: viewer.banned,
      approved: member?.status === "pending" && Boolean(member.approved_by),
      source: member?.source ?? null,
      membershipId: member?.source_membership_id ?? null,
    },
    options,
    accessProducts,
    canTakePayments: true,
  })

  let notice: string | null = null
  if (suspended) notice = "Storelib has suspended this community. Nobody else can open it until it is restored."
  else if (community.status === "draft") notice = "This community is a draft. Only you and your team can see it until you publish it."
  return { data: { community: view, join, notice }, community, viewer }
}

/** Whether search engines may index this community's page: published, public, open. */
export function communityIndexable(c: Pick<CommunityRow, "status" | "visibility" | "suspended_at" | "deleted_at" | "platform_hidden">): boolean {
  return c.status === "published" && c.visibility === "public" && !c.suspended_at && !c.deleted_at && !c.platform_hidden
}

/* ── The community's own top bar ────────────────────────────────────────── */

/**
 * What the top bar draws on every page of a community, for this viewer:
 * whose it is ("By <name>", to their page), who is looking (their name,
 * picture and page) and the communities they are in, for the switcher.
 * Four small reads, once per page load: a layout is kept while somebody
 * moves around inside the community.
 */
export async function topBarData(community: CommunityRow, viewer: Viewer | null, db: Db = admin()): Promise<TopBarData> {
  const userId = viewer?.userId ?? null
  const [creators, me, stores, mine] = await Promise.all([
    readCreators(db, [community.creator_id ?? ""]),
    userId ? rows<ProfileLite>("top bar profile", () => db.from("profiles").select("id, username, display_name, avatar_url").eq("id", userId).limit(1)) : Promise.resolve([] as ProfileLite[]),
    userId ? storefrontsOf(db, [userId]) : Promise.resolve(new Set<string>()),
    userId
      ? rows<{ community_id: string; role: Role }>("top bar communities", () =>
          db.from("community_members").select("community_id, role").eq("user_id", userId).eq("status", "active").order("last_active_at", { ascending: false, nullsFirst: false }).limit(20),
        )
      : Promise.resolve([] as { community_id: string; role: Role }[]),
  ])
  const ids = uniq(mine.map((m) => m.community_id))
  const found = ids.length
    ? await rows<{ id: string; slug: string; name: string; logo_url: string | null; status: string; suspended_at: string | null }>("top bar community names", () =>
        db.from("communities").select("id, slug, name, logo_url, status, suspended_at").in("id", ids).is("deleted_at", null),
      )
    : []
  const byId = new Map(found.map((c) => [c.id, c]))
  const communities: TopBarCommunity[] = []
  for (const m of mine) {
    const c = byId.get(m.community_id)
    /* Somewhere the row can take them: not suspended, and a draft only for its staff. */
    if (!c || c.suspended_at || c.status === "suspended" || (c.status === "draft" && !meetsRole(m.role, "moderator"))) continue
    communities.push({ id: c.id, slug: c.slug, name: c.name, logoUrl: c.logo_url })
  }
  const creator = community.creator_id ? creatorView(creators.get(community.creator_id)) : null
  const profile = me[0] ?? null
  const role = viewer?.active ? viewer.role : null
  const staffAccount = !!viewer && (viewer.isOwner || viewer.isCreatorAccount)
  return {
    community: { id: community.id, slug: community.slug, name: community.name, logoUrl: community.logo_url },
    creator: creator ? { name: creator.name, href: creator.href } : null,
    me: userId
      ? {
          name: profile?.display_name?.trim() || profile?.username || "You",
          avatarUrl: profile?.avatar_url ?? null,
          /* No username yet: their account page, where one is set. */
          profileHref: profile?.username ? personHref({ username: profile.username, hasStorefront: stores.has(userId) }) : "/account",
        }
      : null,
    communities,
    manageHref: staffAccount && (can(role, "manage_settings") || can(role, "review_reports")) ? `/app/community/${community.id}` : null,
  }
}

/* ── A creator's page ───────────────────────────────────────────────────── */

/**
 * The communities a creator's page shows on its Communities tab: published,
 * public, open and not hidden by Storelib, biggest first. Unlisted and
 * private ones are reachable by link only, so they are not listed here.
 */
export async function creatorCommunityCards(creatorId: string, db: Db = admin()): Promise<CommunityCard[]> {
  if (!creatorId) return []
  const found = await rows<CardRow>("creator communities", () =>
    db
      .from("communities")
      .select(CARD_COLUMNS)
      .eq("creator_id", creatorId)
      .eq("status", "published")
      .eq("visibility", "public")
      .eq("platform_hidden", false)
      .is("deleted_at", null)
      .is("suspended_at", null)
      .order("member_count", { ascending: false })
      .limit(24),
  )
  return cardsFor(db, found)
}

/* ── The library ────────────────────────────────────────────────────────── */

/** Every community this person is in, or has asked to join, most recently active first. */
export async function libraryCommunities(userId: string, db: Db = admin()): Promise<{ available: boolean; rows: LibraryCommunityRow[] }> {
  try {
    const { data, error } = await db
      .from("community_members")
      .select("community_id, status, role, tier_id, last_active_at, joined_at, requested_at")
      .eq("user_id", userId)
      .in("status", ["active", "pending"])
      .order("last_active_at", { ascending: false, nullsFirst: false })
      .limit(200)
    if (error) {
      if (missing(error)) return { available: false, rows: [] }
      console.error(`[communities] library: ${reasonOf(error)}`)
      return { available: true, rows: [] }
    }
    const members = (data as { community_id: string; status: "active" | "pending"; role: Role; tier_id: string | null }[] | null) ?? []
    if (members.length === 0) return { available: true, rows: [] }
    const [communities, tiers] = await Promise.all([
      rows<CardRow & { suspended_at: string | null }>("library communities", () =>
        db.from("communities").select(`${CARD_COLUMNS}, suspended_at`).in("id", uniq(members.map((m) => m.community_id))).is("deleted_at", null),
      ),
      rows<{ id: string; name: string }>("library tiers", () => db.from("community_tiers").select("id, name").in("id", uniq(members.map((m) => m.tier_id)))),
    ])
    const byId = new Map(communities.map((c) => [c.id, c]))
    const tierName = new Map(tiers.map((t) => [t.id, t.name]))
    /* The cards every list draws (the stats row, the creator's face), in one batch for the whole list. */
    const cards = new Map((await cardsFor(db, communities)).map((card) => [card.id, card]))
    const out: LibraryCommunityRow[] = []
    for (const m of members) {
      const c = byId.get(m.community_id)
      /* A suspended or unpublished community is not somewhere the row could take them. */
      const card = c ? cards.get(c.id) : undefined
      if (!c || !card || c.suspended_at || c.status === "suspended" || (c.status === "draft" && !meetsRole(m.role, "moderator"))) continue
      out.push({
        id: c.id,
        slug: c.slug,
        name: c.name,
        logoUrl: c.logo_url,
        coverUrl: c.cover_url,
        creatorName: card.creator?.name ?? null,
        status: m.status,
        role: m.role,
        tierName: m.tier_id ? tierName.get(m.tier_id) ?? null : null,
        memberCount: Math.max(0, c.member_count ?? 0),
        url: communityPath(c.slug),
        card,
      })
    }
    /* The ones they are in first, requests after. */
    return { available: true, rows: [...out.filter((r) => r.status === "active"), ...out.filter((r) => r.status === "pending")] }
  } catch (e) {
    console.error(`[communities] library: ${reasonOf(e)}`)
    return { available: true, rows: [] }
  }
}

/** How many communities this person is an active member of, or null when that cannot be read. */
export async function activeCommunityCount(userId: string, db: Db = admin()): Promise<number | null> {
  try {
    const { count, error } = await db.from("community_members").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "active")
    if (error) return null
    return count ?? 0
  } catch {
    return null
  }
}

/* ── Products that sell a tier ──────────────────────────────────────────── */

/**
 * The community a product sells a tier of, or null. Read softly: before part
 * 81 the column is not there and every product is an ordinary product.
 */
export async function communityOfProduct(productId: string, db: Db = admin()): Promise<CommunityRow | null> {
  if (!productId) return null
  try {
    const { data, error } = await db.from("products").select("community_id").eq("id", productId).maybeSingle()
    if (error || !data?.community_id) return null
    return await loadCommunity(db, { id: data.community_id as string })
  } catch {
    return null
  }
}

/**
 * Where a product that sells a tier sends its visitors: the community's page
 * while communities are on and the community is there, else null (a 404).
 */
export async function communityAddressForProduct(communityId: string, db: Db = admin()): Promise<string | null> {
  if (!(await communitiesEnabled())) return null
  const community = await loadCommunity(db, { id: communityId })
  return community ? communityPath(community.slug) : null
}

/* ── The sitemap ────────────────────────────────────────────────────────── */

/** Indexable communities as sitemap rows, `limit` from `offset`; empty before part 81. */
export async function sitemapCommunities(offset: number, limit: number, db: Db = admin()): Promise<{ slug: string; updated_at: string | null; cover_url: string | null }[]> {
  return rows("sitemap communities", () =>
    db
      .from("communities")
      .select("slug, updated_at, cover_url")
      .eq("status", "published")
      .eq("visibility", "public")
      .eq("platform_hidden", false)
      .is("deleted_at", null)
      .is("suspended_at", null)
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1),
  )
}

export async function sitemapCommunityCount(db: Db = admin()): Promise<number> {
  try {
    const { count, error } = await db
      .from("communities")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .eq("visibility", "public")
      .eq("platform_hidden", false)
      .is("deleted_at", null)
      .is("suspended_at", null)
    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}
