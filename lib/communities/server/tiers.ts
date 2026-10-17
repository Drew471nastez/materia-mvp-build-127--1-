import "server-only"
import { trialDaysOf } from "@/lib/memberships/plan"

/**
 * ===========================================================================
 *  WHAT A COMMUNITY COSTS: ITS TIERS AND THE PRODUCTS THAT SELL THEM
 * ===========================================================================
 * A tier is a row in community_tiers. A free tier has no product. A paid
 * tier is sold by an ordinary Storelib product, so there is no second
 * checkout and no second Stripe integration:
 *
 *   monthly or yearly   a `membership` product made by the memberships
 *                       engine (lib/memberships/creator.ts
 *                       createMembershipProduct + saveMembership), with its
 *                       plan in membership_plans. The membership checkout
 *                       sells it and lib/memberships/sync.ts keeps the
 *                       member's row in step through payment-hooks.
 *   one time            a `community` product with price_cents, sold by the
 *                       normal checkout (fulfil-payment grants it).
 *
 * Either way products.community_id is set (so listings hide it and its
 * page sends people to the community) and the product is also a row in
 * community_access_products for its tier, which is what reconcileAccess
 * reads to decide who is in. Prices live only on the product and the plan,
 * never on the tier.
 *
 * A tier's product is on sale while the community is published and the
 * tier is not archived; syncTierProducts keeps that true.
 */
import { createMembershipProduct, ownedMembership, saveMembership, slugFrom } from "@/lib/memberships/creator"
import { avoidReservedProductSlug } from "@/lib/commerce/reserved-slugs"
import { sanitizeDescription } from "@/lib/rich-text/sanitize"
import { priceLine } from "../format"
import { subscriberCounts } from "../plan-change"
import { MAX_ACTIVE_TIERS, MAX_TIERS } from "../limits"
import { TIER_COLUMNS, type CommunityRow, type TierRow } from "../types"
import { htmlToText, textToHtml, type PriceInterval } from "@/components/community/creator/logic"
import type { PickProduct, TierView } from "@/components/community/creator/view-types"
import { audit } from "./audit"
import { missing, reasonOf, type Db } from "./db"

export type TierResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string; status: number; field?: string }

const failed = (error: string, status = 500, field?: string) => ({ ok: false as const, error, status, field })

async function freeProductSlug(db: Db, creatorId: string, title: string): Promise<string> {
  const tail = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
  let slug = slugFrom(title)
  const { data } = await db.from("products").select("id").eq("creator_id", creatorId).eq("slug", slug).limit(1)
  if (data && data.length > 0) slug = `${slug}-${tail()}`
  return avoidReservedProductSlug(slug, tail)
}

/** The tiers of a community with their prices, read from the selling products and plans. */
export async function loadTiers(db: Db, communityId: string): Promise<TierView[]> {
  const { data: rows, error } = await db.from("community_tiers").select(TIER_COLUMNS).eq("community_id", communityId).order("position", { ascending: true }).limit(50)
  if (error) {
    if (!missing(error)) console.error(`[communities] tiers read: ${reasonOf(error)}`)
    return []
  }
  const tiers = (rows as TierRow[] | null) ?? []
  if (tiers.length === 0) return []
  const tierIds = tiers.map((t) => t.id)
  const sellIds = tiers.map((t) => t.product_id).filter((x): x is string => Boolean(x))
  const [links, plans, products, counts] = await Promise.all([
    db.from("community_access_products").select("tier_id, product_id").in("tier_id", tierIds),
    sellIds.length ? db.from("membership_plans").select("product_id, monthly_price_cents, yearly_price_cents, currency, trial_days").in("product_id", sellIds) : Promise.resolve({ data: [] }),
    sellIds.length ? db.from("products").select("id, status, price_cents").in("id", sellIds) : Promise.resolve({ data: [] }),
    Promise.all(tierIds.map((id) => db.from("community_members").select("id", { count: "exact", head: true }).eq("community_id", communityId).eq("tier_id", id).eq("status", "active"))),
  ])
  /* Round AF: per plan, who pays, who is on a free trial, and how many ended trials became paying. */
  const { data: subRows } = sellIds.length
    ? await db.from("memberships").select("product_id, status, trial_end").in("product_id", sellIds).in("status", ["active", "trialing", "past_due", "canceled"]).limit(10000)
    : { data: [] }
  const subsOf = subscriberCounts((subRows as { product_id: string; status: string; trial_end: string | null }[] | null) ?? [])
  const linkRows = (links.data as { tier_id: string; product_id: string }[] | null) ?? []
  const otherIds = [...new Set(linkRows.filter((l) => !sellIds.includes(l.product_id)).map((l) => l.product_id))]
  const { data: others } = otherIds.length ? await db.from("products").select("id, title, type").in("id", otherIds) : { data: [] }
  const otherById = new Map(((others as { id: string; title: string; type: string }[] | null) ?? []).map((p) => [p.id, p]))
  const planOf = new Map(((plans.data as { product_id: string; monthly_price_cents: number | null; yearly_price_cents: number | null; currency: string | null; trial_days?: number | null }[] | null) ?? []).map((p) => [p.product_id, p]))
  const productOf = new Map(((products.data as { id: string; status: string; price_cents: number | null }[] | null) ?? []).map((p) => [p.id, p]))
  return tiers.map((t, i) => {
    const plan = t.product_id ? planOf.get(t.product_id) : undefined
    const product = t.product_id ? productOf.get(t.product_id) : undefined
    const monthly = plan?.monthly_price_cents ?? null
    const yearly = plan?.yearly_price_cents ?? null
    const once = t.billing === "one_time" ? (product?.price_cents ?? null) : null
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      kind: t.kind,
      billing: t.billing,
      isDefault: t.is_default,
      archived: Boolean(t.archived_at),
      productId: t.product_id,
      productStatus: product?.status ?? null,
      monthlyCents: monthly,
      yearlyCents: yearly,
      priceCents: once,
      priceLine: priceLine({ kind: t.kind, billing: t.billing, monthlyCents: monthly, yearlyCents: yearly, priceCents: once, currency: plan?.currency ?? "usd" }),
      benefits: Array.isArray(t.benefits) ? t.benefits : [],
      trialDays: t.billing === "recurring" ? trialDaysOf(plan?.trial_days) : 0,
      members: counts[i]?.count ?? 0,
      subscribers: t.product_id && t.billing === "recurring" ? (subsOf.get(t.product_id) ?? { paying: 0, trialing: 0, trialsEnded: 0, trialsConverted: 0 }) : null,
      accessProducts: linkRows
        .filter((l) => l.tier_id === t.id && l.product_id !== t.product_id)
        .map((l) => otherById.get(l.product_id))
        .filter((p): p is { id: string; title: string; type: string } => Boolean(p))
        .map((p) => ({ id: p.id, title: p.title || "Untitled", type: p.type })),
    }
  })
}

/** The creator's own products a tier can also be granted by: anything but a product that sells a community. */
export async function pickableProducts(db: Db, creatorId: string): Promise<PickProduct[]> {
  const { data } = await db
    .from("products")
    .select("id, title, type, status, thumbnail_url, community_id")
    .eq("creator_id", creatorId)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(200)
  return ((data as { id: string; title: string; type: string; status: string; thumbnail_url: string | null; community_id: string | null }[] | null) ?? [])
    .filter((p) => !p.community_id)
    .map((p) => ({ id: p.id, title: p.title || "Untitled", type: p.type, status: p.status, cover: p.thumbnail_url }))
}

async function nextPosition(db: Db, communityId: string): Promise<{ position: number; count: number; total: number; hasDefault: boolean }> {
  const { data } = await db.from("community_tiers").select("position, is_default, archived_at").eq("community_id", communityId).limit(100)
  const rows = (data as { position: number; is_default: boolean; archived_at: string | null }[] | null) ?? []
  return {
    position: rows.reduce((m, r) => Math.max(m, r.position + 1), 0),
    count: rows.filter((r) => !r.archived_at).length,
    total: rows.length,
    hasDefault: rows.some((r) => r.is_default),
  }
}

export interface NewPaidTier {
  creatorId: string
  community: CommunityRow
  name: string
  description?: string | null
  interval: PriceInterval
  cents: number
  actorId: string
}

/**
 * A paid tier and the product that sells it, in one go. Anything that fails
 * part way is taken back: the tier row, its access row and the product.
 */
export async function createPaidTier(db: Db, t: NewPaidTier): Promise<TierResult<{ tierId: string; productId: string }>> {
  const slot = await nextPosition(db, t.community.id)
  if (slot.count >= MAX_ACTIVE_TIERS) return failed(`A community sells up to ${MAX_ACTIVE_TIERS} plans at once. Archive one to add another.`, 400)
  if (slot.total >= MAX_TIERS) return failed(`A community has up to ${MAX_TIERS} plans, archived ones included.`, 400)
  const live = t.community.status === "published"
  const title = t.name && t.name !== t.community.name ? `${t.community.name}: ${t.name}` : t.community.name
  const descriptionText = t.description?.trim() || t.community.tagline || htmlToText(t.community.description) || ""
  const cover = t.community.cover_url || t.community.logo_url || null
  let productId: string | null = null
  let billing: "recurring" | "one_time"

  if (t.interval === "once") {
    billing = "one_time"
    const slug = await freeProductSlug(db, t.creatorId, title)
    const { data, error } = await db
      .from("products")
      .insert({
        creator_id: t.creatorId,
        type: "community",
        title: title.slice(0, 120),
        slug,
        status: live ? "published" : "draft",
        price_cents: t.cents,
        description: sanitizeDescription(textToHtml(descriptionText)),
        call_to_action: "Join",
        whats_included: [],
        thumbnail_url: cover,
        community_id: t.community.id,
      })
      .select("id")
      .single()
    if (error || !data) {
      console.error(`[communities] one time product: ${reasonOf(error)}`)
      return failed("The price could not be saved. Try again.")
    }
    productId = data.id as string
  } else {
    billing = "recurring"
    const made = await createMembershipProduct(db, t.creatorId, title)
    if (!made.ok) return failed(made.error, made.status)
    productId = made.productId
    const linked = await db.from("products").update({ community_id: t.community.id }).eq("id", productId)
    const product = linked.error ? null : await ownedMembership(db, t.creatorId, productId)
    const saved = product
      ? await saveMembership(db, t.creatorId, product, {
          title,
          description: descriptionText,
          thumbnailUrl: cover,
          plan: { monthlyPriceCents: t.interval === "month" ? t.cents : null, yearlyPriceCents: t.interval === "year" ? t.cents : null, trialDays: 0, benefits: [], includedProductIds: [] },
          publish: live,
        })
      : null
    if (!saved || !saved.ok) {
      await db.from("products").delete().eq("id", productId)
      return failed(saved && !saved.ok ? saved.error : "The price could not be saved. Try again.", saved && !saved.ok ? saved.status : 500)
    }
  }

  const { data: tier, error: tierError } = await db
    .from("community_tiers")
    .insert({
      community_id: t.community.id,
      name: (t.name || "Members").slice(0, 60),
      description: t.description?.slice(0, 500) || null,
      position: slot.position,
      kind: "paid",
      billing,
      product_id: productId,
      is_default: !slot.hasDefault,
    })
    .select("id")
    .single()
  if (tierError || !tier) {
    console.error(`[communities] paid tier: ${reasonOf(tierError)}`)
    await db.from("products").delete().eq("id", productId)
    return failed("The tier could not be saved. Try again.")
  }
  const { error: linkError } = await db.from("community_access_products").insert({ community_id: t.community.id, tier_id: tier.id, product_id: productId })
  if (linkError) {
    console.error(`[communities] tier access row: ${reasonOf(linkError)}`)
    await db.from("community_tiers").delete().eq("id", tier.id)
    await db.from("products").delete().eq("id", productId)
    return failed("The tier could not be saved. Try again.")
  }
  await audit(db, {
    communityId: t.community.id,
    actorId: t.actorId,
    actorKind: "member",
    action: "tier.created",
    targetType: "tier",
    targetId: tier.id,
    targetLabel: t.name || "Members",
    detail: { billing, interval: t.interval, cents: t.cents, productId },
  })
  return { ok: true, tierId: tier.id as string, productId: productId as string }
}

/** A free tier (the default for a free community already exists; this adds another). */
export async function createFreeTier(db: Db, t: { community: CommunityRow; name: string; description?: string | null; actorId: string }): Promise<TierResult<{ tierId: string }>> {
  const slot = await nextPosition(db, t.community.id)
  if (slot.count >= MAX_TIERS) return failed(`A community has up to ${MAX_TIERS} tiers.`, 400)
  const { data, error } = await db
    .from("community_tiers")
    .insert({ community_id: t.community.id, name: t.name.slice(0, 60), description: t.description?.slice(0, 500) || null, position: slot.position, kind: "free", is_default: !slot.hasDefault })
    .select("id")
    .single()
  if (error || !data) return failed("The tier could not be saved. Try again.")
  await audit(db, { communityId: t.community.id, actorId: t.actorId, actorKind: "member", action: "tier.created", targetType: "tier", targetId: data.id, targetLabel: t.name, detail: { kind: "free" } })
  return { ok: true, tierId: data.id as string }
}

async function tierOf(db: Db, communityId: string, tierId: string): Promise<TierRow | null> {
  const { data } = await db.from("community_tiers").select(TIER_COLUMNS).eq("id", tierId).eq("community_id", communityId).maybeSingle()
  return (data as TierRow | null) ?? null
}

export interface TierPatch {
  name?: string
  description?: string | null
  benefits?: string[]
  /** A recurring tier: both prices; null removes one (at least one stays). */
  monthlyCents?: number | null
  yearlyCents?: number | null
  /** A one time tier. */
  priceCents?: number
  /** A recurring tier's free trial: 0 for none, up to TRIAL_MAX_DAYS. New members only; members already in keep their terms. */
  trialDays?: number
}

/**
 * A tier's words and its price. A recurring price goes through
 * saveMembership, so Stripe gets a new price and members who joined before
 * keep the one they joined at; a one time price is the product's own.
 */
export async function updateTier(db: Db, u: { creatorId: string; community: CommunityRow; tierId: string; patch: TierPatch; actorId: string }): Promise<TierResult> {
  const tier = await tierOf(db, u.community.id, u.tierId)
  if (!tier) return failed("That tier is not in this community.", 404)
  const rowPatch: Record<string, unknown> = {}
  if (u.patch.name !== undefined) rowPatch.name = u.patch.name.slice(0, 60)
  if (u.patch.description !== undefined) rowPatch.description = u.patch.description ? u.patch.description.slice(0, 500) : null
  if (u.patch.benefits !== undefined) rowPatch.benefits = u.patch.benefits
  const before: Record<string, unknown> = {}

  if (tier.kind === "paid" && tier.product_id) {
    if (tier.billing === "recurring" && (u.patch.monthlyCents !== undefined || u.patch.yearlyCents !== undefined || u.patch.benefits !== undefined || u.patch.trialDays !== undefined)) {
      const product = await ownedMembership(db, u.creatorId, tier.product_id)
      if (!product) return failed("The product that sells this tier is not yours any more.", 409)
      const { data: plan } = await db.from("membership_plans").select("monthly_price_cents, yearly_price_cents, trial_days, included_product_ids").eq("product_id", product.id).maybeSingle()
      const monthly = u.patch.monthlyCents !== undefined ? u.patch.monthlyCents : (plan?.monthly_price_cents ?? null)
      const yearly = u.patch.yearlyCents !== undefined ? u.patch.yearlyCents : (plan?.yearly_price_cents ?? null)
      if (monthly === null && yearly === null) return failed("Keep a monthly or a yearly price.", 400, "price")
      before.monthly = plan?.monthly_price_cents ?? null
      before.yearly = plan?.yearly_price_cents ?? null
      before.trialDays = plan?.trial_days ?? 0
      const saved = await saveMembership(db, u.creatorId, product, {
        title: product.title,
        description: htmlToText(product.description),
        thumbnailUrl: product.thumbnail_url,
        plan: {
          monthlyPriceCents: monthly,
          yearlyPriceCents: yearly,
          trialDays: u.patch.trialDays !== undefined ? u.patch.trialDays : Number(plan?.trial_days ?? 0),
          benefits: u.patch.benefits ?? (Array.isArray(tier.benefits) ? tier.benefits : []),
          includedProductIds: Array.isArray(plan?.included_product_ids) ? plan.included_product_ids : [],
        },
        publish: null,
      })
      if (!saved.ok) return failed(saved.error, saved.status, saved.field)
    }
    if (tier.billing === "one_time" && u.patch.priceCents !== undefined) {
      const { data: product } = await db.from("products").select("id, creator_id, price_cents").eq("id", tier.product_id).maybeSingle()
      if (!product || product.creator_id !== u.creatorId) return failed("The product that sells this tier is not yours any more.", 409)
      before.price = product.price_cents
      const { error } = await db.from("products").update({ price_cents: u.patch.priceCents }).eq("id", tier.product_id)
      if (error) return failed("The price could not be saved. Try again.")
    }
  }

  if (Object.keys(rowPatch).length) {
    const { error } = await db.from("community_tiers").update(rowPatch).eq("id", tier.id)
    if (error) return failed("The tier could not be saved. Try again.")
  }
  await audit(db, {
    communityId: u.community.id,
    actorId: u.actorId,
    actorKind: "member",
    action: "tier.updated",
    targetType: "tier",
    targetId: tier.id,
    targetLabel: (rowPatch.name as string | undefined) ?? tier.name,
    detail: { before, after: { monthly: u.patch.monthlyCents, yearly: u.patch.yearlyCents, price: u.patch.priceCents, name: u.patch.name, trialDays: u.patch.trialDays } },
  })
  return { ok: true }
}

/**
 * Stops selling a tier: archived, and its product taken off sale. Members
 * already on it keep it for as long as they pay. The default tier stays.
 */
export async function archiveTier(db: Db, a: { community: CommunityRow; tierId: string; actorId: string; archived: boolean }): Promise<TierResult> {
  const tier = await tierOf(db, a.community.id, a.tierId)
  if (!tier) return failed("That tier is not in this community.", 404)
  if (tier.is_default && a.archived) return failed("This is the tier people join on. Make another tier the default first.", 409)
  if (!a.archived && tier.archived_at) {
    const slot = await nextPosition(db, a.community.id)
    if (slot.count >= MAX_ACTIVE_TIERS) return failed(`A community sells up to ${MAX_ACTIVE_TIERS} plans at once. Archive one to bring this back.`, 409)
  }
  const { error } = await db.from("community_tiers").update({ archived_at: a.archived ? new Date().toISOString() : null }).eq("id", tier.id)
  if (error) return failed("The tier could not be saved. Try again.")
  if (tier.product_id) {
    await db
      .from("products")
      .update({ status: !a.archived && a.community.status === "published" ? "published" : "draft" })
      .eq("id", tier.product_id)
  }
  await audit(db, { communityId: a.community.id, actorId: a.actorId, actorKind: "member", action: a.archived ? "tier.archived" : "tier.restored", targetType: "tier", targetId: tier.id, targetLabel: tier.name })
  return { ok: true }
}

/**
 * Moves a plan one place up or down among the community's plans on sale, the
 * order the plan picker and the About page list them in. Swaps the two
 * positions; archived plans keep theirs.
 */
export async function moveTier(db: Db, a: { community: CommunityRow; tierId: string; direction: "up" | "down"; actorId: string }): Promise<TierResult> {
  const { data } = await db.from("community_tiers").select("id, position, archived_at, name").eq("community_id", a.community.id).order("position", { ascending: true }).limit(100)
  const live = ((data as { id: string; position: number; archived_at: string | null; name: string }[] | null) ?? []).filter((r) => !r.archived_at)
  const at = live.findIndex((r) => r.id === a.tierId)
  if (at < 0) return failed("That tier is not in this community.", 404)
  const other = live[a.direction === "up" ? at - 1 : at + 1]
  if (!other) return { ok: true }
  const mine = live[at]
  /* Two plans that share a position (older rows) are told apart first, so the swap always moves something. */
  const [p1, p2] = mine.position === other.position ? (a.direction === "up" ? [other.position, other.position + 1] : [other.position + 1, other.position]) : [other.position, mine.position]
  const first = await db.from("community_tiers").update({ position: p1 }).eq("id", mine.id)
  const second = first.error ? first : await db.from("community_tiers").update({ position: p2 }).eq("id", other.id)
  if (first.error || second.error) return failed("The order could not be saved. Try again.")
  await audit(db, { communityId: a.community.id, actorId: a.actorId, actorKind: "member", action: "tier.moved", targetType: "tier", targetId: mine.id, targetLabel: mine.name, detail: { direction: a.direction } })
  return { ok: true }
}

/** Makes a tier the one people join on (one per community, a partial unique index). */
export async function setDefaultTier(db: Db, a: { community: CommunityRow; tierId: string; actorId: string }): Promise<TierResult> {
  const tier = await tierOf(db, a.community.id, a.tierId)
  if (!tier || tier.archived_at) return failed("That tier is not in this community.", 404)
  await db.from("community_tiers").update({ is_default: false }).eq("community_id", a.community.id).eq("is_default", true)
  const { error } = await db.from("community_tiers").update({ is_default: true }).eq("id", tier.id)
  if (error) return failed("The tier could not be saved. Try again.")
  await audit(db, { communityId: a.community.id, actorId: a.actorId, actorKind: "member", action: "tier.default", targetType: "tier", targetId: tier.id, targetLabel: tier.name })
  return { ok: true }
}

/**
 * Another of the creator's products that also gives this tier (a course, a
 * download, a membership): owning it lets the buyer in. The tier's own
 * selling product is always there and cannot be taken off.
 */
export async function setAccessProduct(db: Db, a: { creatorId: string; community: CommunityRow; tierId: string; productId: string; on: boolean; actorId: string }): Promise<TierResult> {
  const tier = await tierOf(db, a.community.id, a.tierId)
  if (!tier) return failed("That tier is not in this community.", 404)
  if (tier.product_id === a.productId) return failed("That product sells this tier and always gives it.", 409)
  const { data: product } = await db.from("products").select("id, creator_id, title, community_id").eq("id", a.productId).maybeSingle()
  if (!product || product.creator_id !== a.creatorId) return failed("That product is not yours.", 404)
  if (a.on) {
    if (product.community_id) return failed("That product sells a community.", 409)
    const { error } = await db.from("community_access_products").insert({ community_id: a.community.id, tier_id: tier.id, product_id: a.productId })
    if (error && error.code !== "23505") return failed("The product could not be added. Try again.")
  } else {
    const { error } = await db.from("community_access_products").delete().eq("tier_id", tier.id).eq("product_id", a.productId)
    if (error) return failed("The product could not be taken off. Try again.")
  }
  await audit(db, {
    communityId: a.community.id,
    actorId: a.actorId,
    actorKind: "member",
    action: a.on ? "tier.product_added" : "tier.product_removed",
    targetType: "tier",
    targetId: tier.id,
    targetLabel: tier.name,
    detail: { productId: a.productId, title: product.title },
  })
  return { ok: true }
}

/**
 * Puts every live tier's product on sale while the community is published,
 * and takes them all off while it is a draft, archived or deleted. Members
 * already paying are not touched: billing keeps running as it was.
 */
export async function syncTierProducts(db: Db, community: Pick<CommunityRow, "id" | "status" | "deleted_at">, onSale: boolean): Promise<void> {
  const { data } = await db.from("community_tiers").select("product_id, archived_at").eq("community_id", community.id).limit(50)
  const rows = (data as { product_id: string | null; archived_at: string | null }[] | null) ?? []
  const live = rows.filter((r) => r.product_id && !r.archived_at).map((r) => r.product_id as string)
  const archived = rows.filter((r) => r.product_id && r.archived_at).map((r) => r.product_id as string)
  if (live.length) {
    const { error } = await db.from("products").update({ status: onSale ? "published" : "draft" }).in("id", live)
    if (error) console.error(`[communities] tier products ${onSale ? "on" : "off"} sale: ${reasonOf(error)}`)
  }
  if (archived.length) await db.from("products").update({ status: "draft" }).in("id", archived)
}

/** Product ids that sell a recurring tier of this community, for the revenue figures. */
export async function recurringProductIds(db: Db, communityId: string): Promise<string[]> {
  const { data } = await db.from("community_tiers").select("product_id, billing").eq("community_id", communityId).eq("kind", "paid").limit(50)
  return ((data as { product_id: string | null; billing: string | null }[] | null) ?? []).filter((t) => t.product_id && t.billing === "recurring").map((t) => t.product_id as string)
}

