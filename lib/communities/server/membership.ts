import "server-only"

/**
 * ===========================================================================
 *  WHO IS IN A COMMUNITY, AND WHY
 * ===========================================================================
 * One row per person per community (community_members, unique on the pair),
 * and every way it changes goes through here: a free join, an invite, a
 * request approved, a payment, a refund, a membership ending, a visit that
 * finds billing moved on without us.
 *
 * GRANTING NEVER TAKES ANYTHING AWAY. grantMembership raises a role but never
 * lowers it, makes a row active but never turns an active member back into a
 * request, and keeps a paid tier when a free grant arrives on top of it. It
 * never brings back somebody a moderator banned or removed, unless an admin
 * says so outright (`force`), and an automatic re-check never brings back
 * somebody who left on their own. It never makes a second row: two grants
 * racing meet at the unique key and the second becomes an update.
 *
 * PAID ACCESS FOLLOWS BILLING. A member whose source is a subscription, a
 * purchase or a product is in for as long as they own one of the products in
 * community_access_products for a tier: an entitlement (a purchase, a free
 * claim, a course), or a membership that grantsAccess() says still grants
 * (active, trialing, cancelled until the period ends, past due for 7 days;
 * lib/memberships/state.ts). reconcileAccess works that out from the rows as
 * they are, so running it twice, late, or from three places at once gives the
 * same answer. When the last paid way in ends, a member of a free community
 * keeps its free tier; anyone else becomes expired (not removed: they come
 * back the moment they pay again). Each flip is written to the audit log and
 * the activity feed.
 *
 * THE OWNER IS NEVER TOUCHED by any of it.
 *
 * Before part 81 has run every function here answers null or 0.
 */
import { grantsAccess } from "@/lib/memberships/state"
import { ROLE_RANK } from "../permissions"
import { MEMBER_COLUMNS, PAID_SOURCES, type MemberRow, type MemberSource, type MemberStatus, type Role, type TierKind } from "../types"
import { audit } from "./audit"
import { recordActivity } from "./activity"
import { isUniqueViolation, missing, nowIso, reasonOf, type Db } from "./db"

const PAID: readonly MemberSource[] = PAID_SOURCES

export interface SourceRefs {
  membershipId?: string | null
  productId?: string | null
  orderId?: string | null
  inviteId?: string | null
  invitedBy?: string | null
  approvedBy?: string | null
}

export interface GrantInput {
  communityId: string
  userId: string
  source: MemberSource
  tierId?: string | null
  role?: Role
  sourceRefs?: SourceRefs
  /** "pending" is a request to join; it never turns an active member back into one. */
  status?: "active" | "pending"
  requestNote?: string | null
  expiresAt?: string | null
  /** A re-check nobody asked for (a visit, a renewal): never brings back somebody who left or was paused. */
  automatic?: boolean
  /** Admins only: brings back a banned or removed member. */
  force?: boolean
  /** Who did it, for the audit log. Left out, it was the system. */
  actorId?: string | null
}

export type RevokeStatus = "expired" | "cancelled" | "removed" | "banned" | "paused"

export interface RevokeInput {
  communityId: string
  userId: string
  reason: string
  status: RevokeStatus
  actorId?: string | null
  actorKind?: "member" | "platform" | "system"
}

const isOwnerRow = (m: MemberRow) => m.role === "owner" || m.source === "owner"
const isBlocked = (m: MemberRow) => m.status === "banned" || m.status === "removed" || Boolean(m.banned_at)

async function readMember(db: Db, communityId: string, userId: string): Promise<{ row: MemberRow | null; notSetUp: boolean }> {
  const { data, error } = await db.from("community_members").select(MEMBER_COLUMNS).eq("community_id", communityId).eq("user_id", userId).maybeSingle()
  if (error) {
    if (missing(error)) return { row: null, notSetUp: true }
    throw new Error(`community member read: ${reasonOf(error)}`)
  }
  return { row: (data as MemberRow | null) ?? null, notSetUp: false }
}

/** The member row for a person, or null (not a member, or the tables are not there yet). */
export async function memberOf(db: Db, communityId: string, userId: string): Promise<MemberRow | null> {
  try {
    return (await readMember(db, communityId, userId)).row
  } catch (e) {
    console.error(`[communities] ${reasonOf(e)}`)
    return null
  }
}

function refColumns(refs: SourceRefs | undefined): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  if (!refs) return out
  if (refs.membershipId !== undefined) out.source_membership_id = refs.membershipId
  if (refs.productId !== undefined) out.source_product_id = refs.productId
  if (refs.orderId !== undefined) out.source_order_id = refs.orderId
  if (refs.inviteId !== undefined) out.invite_id = refs.inviteId
  if (refs.invitedBy !== undefined) out.invited_by = refs.invitedBy
  if (refs.approvedBy !== undefined) out.approved_by = refs.approvedBy
  return out
}

async function afterJoin(db: Db, row: MemberRow, input: GrantInput): Promise<void> {
  await recordActivity(db, { communityId: row.community_id, userId: row.user_id, kind: "joined" })
  await audit(db, {
    communityId: row.community_id,
    actorId: input.actorId ?? null,
    actorKind: input.actorId ? "member" : "system",
    action: "member.joined",
    targetType: "member",
    targetId: row.user_id,
    detail: { source: row.source, tierId: row.tier_id, role: row.role },
  })
}

/**
 * Puts a person in a community, or moves their row forward. Idempotent: the
 * same grant twice is one row and one "joined". Returns the row as it now is,
 * or null before part 81 has run.
 */
export async function grantMembership(db: Db, input: GrantInput, retried = false): Promise<MemberRow | null> {
  const { row: existing, notSetUp } = await readMember(db, input.communityId, input.userId)
  if (notSetUp) return null
  const now = nowIso()
  const status = input.status ?? "active"
  const role: Role = input.role ?? "member"
  const note = input.requestNote ? input.requestNote.trim().slice(0, 500) : null

  if (!existing) {
    const { data, error } = await db
      .from("community_members")
      .insert({
        community_id: input.communityId,
        user_id: input.userId,
        status,
        role,
        tier_id: input.tierId ?? null,
        source: input.source,
        ...refColumns(input.sourceRefs),
        request_note: status === "pending" ? note : null,
        requested_at: status === "pending" ? now : null,
        joined_at: status === "active" ? now : null,
        expires_at: input.expiresAt ?? null,
      })
      .select(MEMBER_COLUMNS)
      .single()
    if (error) {
      if (missing(error)) return null
      /* The other grant made the row a moment ago: this one is an update of it. */
      if (isUniqueViolation(error) && !retried) return grantMembership(db, input, true)
      throw new Error(`community member insert: ${reasonOf(error)}`)
    }
    const row = data as MemberRow
    if (row.status === "active") await afterJoin(db, row, input)
    return row
  }

  if (isOwnerRow(existing)) {
    if (input.source !== "owner" || existing.status === "active") return existing
  }
  const blocked = isBlocked(existing)
  if (blocked && !input.force) return existing
  if (!input.force && input.automatic && (existing.status === "cancelled" || existing.status === "paused")) return existing

  const wasActive = existing.status === "active"
  const patch: Record<string, unknown> = {}
  if (ROLE_RANK[role] > ROLE_RANK[existing.role]) patch.role = role

  let next: MemberStatus = existing.status
  if (status === "active") next = "active"
  else if (!wasActive) next = "pending"
  if (blocked) {
    patch.banned_at = null
    patch.ban_reason = null
    patch.banned_by = null
    patch.removed_at = null
  }
  if (next !== existing.status) patch.status = next
  if (next === "pending" && (existing.status !== "pending" || input.requestNote !== undefined)) {
    patch.request_note = note
    if (existing.status !== "pending") patch.requested_at = now
  }
  if (next === "active" && !wasActive) {
    patch.joined_at = now
    patch.expires_at = input.expiresAt ?? null
  }

  /* A paid way in is kept when a free one arrives on top of it. */
  const keepPaid = wasActive && PAID.includes(existing.source) && !PAID.includes(input.source)
  if ((status === "active" || !wasActive) && !keepPaid) {
    if (input.source !== existing.source) patch.source = input.source
    if (input.tierId !== undefined && input.tierId !== existing.tier_id) patch.tier_id = input.tierId
    for (const [k, v] of Object.entries(refColumns(input.sourceRefs))) if ((existing as unknown as Record<string, unknown>)[k] !== v) patch[k] = v
  } else if (input.sourceRefs?.approvedBy !== undefined && existing.approved_by !== input.sourceRefs.approvedBy) {
    patch.approved_by = input.sourceRefs.approvedBy
  }

  if (Object.keys(patch).length === 0) return existing
  const { data, error } = await db.from("community_members").update(patch).eq("id", existing.id).select(MEMBER_COLUMNS).single()
  if (error) {
    if (missing(error)) return null
    throw new Error(`community member update: ${reasonOf(error)}`)
  }
  const row = data as MemberRow
  if (row.status === "active" && !wasActive) await afterJoin(db, row, input)
  return row
}

/**
 * Takes somebody out: their membership ended (expired), they left
 * (cancelled), a moderator removed or banned them, or the creator paused
 * them. The row stays, so points, posts and history stay theirs. Never the
 * owner. Returns the row as it now is, or null when there is none.
 */
export async function revokeMembership(db: Db, input: RevokeInput): Promise<MemberRow | null> {
  const { row: existing, notSetUp } = await readMember(db, input.communityId, input.userId)
  if (notSetUp || !existing) return null
  if (isOwnerRow(existing) || existing.status === input.status) return existing
  const now = nowIso()
  const patch: Record<string, unknown> = { status: input.status }
  if (input.status === "removed") patch.removed_at = now
  if (input.status === "banned") {
    patch.banned_at = now
    patch.ban_reason = input.reason.slice(0, 500)
    patch.banned_by = input.actorId ?? null
  }
  if (input.status === "expired") patch.expires_at = now
  const { data, error } = await db.from("community_members").update(patch).eq("id", existing.id).select(MEMBER_COLUMNS).single()
  if (error) {
    if (missing(error)) return null
    throw new Error(`community member revoke: ${reasonOf(error)}`)
  }
  const row = data as MemberRow
  if (existing.status === "active") await recordActivity(db, { communityId: row.community_id, userId: row.user_id, kind: "left" })
  await audit(db, {
    communityId: row.community_id,
    actorId: input.actorId ?? null,
    actorKind: input.actorKind ?? (input.actorId ? "member" : "system"),
    action: `member.${input.status}`,
    targetType: "member",
    targetId: row.user_id,
    reason: input.reason,
    detail: { from: existing.status, source: existing.source, tierId: existing.tier_id },
  })
  return row
}

/* ── What a person owns ─────────────────────────────────────────────────── */

interface Ownership {
  viaMembership: Map<string, string>
  viaEntitlement: Set<string>
}

async function ownership(db: Db, userId: string, productIds: string[], now: number = Date.now()): Promise<Ownership> {
  const out: Ownership = { viaMembership: new Map(), viaEntitlement: new Set() }
  const ids = [...new Set(productIds.filter(Boolean))]
  if (ids.length === 0) return out
  const [ents, subs] = await Promise.all([
    db.from("entitlements").select("product_id").eq("buyer_id", userId).in("product_id", ids),
    db.from("memberships").select("id, product_id, status, current_period_end, past_due_since").eq("buyer_id", userId).in("product_id", ids),
  ])
  if (ents.error && !missing(ents.error)) throw new Error(`entitlements read: ${reasonOf(ents.error)}`)
  if (subs.error && !missing(subs.error)) throw new Error(`memberships read: ${reasonOf(subs.error)}`)
  for (const e of (ents.data as { product_id: string }[] | null) ?? []) out.viaEntitlement.add(e.product_id)
  for (const m of (subs.data as { id: string; product_id: string; status: string; current_period_end: string | null; past_due_since: string | null }[] | null) ?? []) {
    if (m.product_id && grantsAccess(m, now)) out.viaMembership.set(m.product_id, m.id)
  }
  return out
}

/**
 * The products among `productIds` this person owns now: a library row
 * (entitlement), or a membership that still grants access.
 */
export async function ownedProductIds(db: Db, userId: string, productIds: string[]): Promise<string[]> {
  try {
    const o = await ownership(db, userId, productIds)
    return [...new Set([...o.viaEntitlement, ...o.viaMembership.keys()])]
  } catch (e) {
    console.error(`[communities] owned products: ${reasonOf(e)}`)
    return []
  }
}

interface AccessGrant {
  tierId: string
  tierKind: TierKind
  position: number
  productId: string
  source: "subscription" | "purchase" | "product"
  membershipId: string | null
}

/** Every tier this person's purchases and memberships give them in a community; null before part 81. */
async function accessGrants(db: Db, communityId: string, userId: string): Promise<AccessGrant[] | null> {
  const { data: links, error } = await db.from("community_access_products").select("tier_id, product_id").eq("community_id", communityId)
  if (error) {
    if (missing(error)) return null
    throw new Error(`community access products read: ${reasonOf(error)}`)
  }
  const rows = (links as { tier_id: string; product_id: string }[] | null) ?? []
  if (rows.length === 0) return []
  const owned = await ownership(db, userId, rows.map((r) => r.product_id))
  if (owned.viaEntitlement.size === 0 && owned.viaMembership.size === 0) return []
  const { data: tiers, error: tierError } = await db.from("community_tiers").select("id, kind, product_id, position").in("id", [...new Set(rows.map((r) => r.tier_id))])
  if (tierError) {
    if (missing(tierError)) return null
    throw new Error(`community tiers read: ${reasonOf(tierError)}`)
  }
  const byId = new Map(((tiers as { id: string; kind: TierKind; product_id: string | null; position: number }[] | null) ?? []).map((t) => [t.id, t]))
  const grants: AccessGrant[] = []
  for (const link of rows) {
    const tier = byId.get(link.tier_id)
    if (!tier) continue
    const membershipId = owned.viaMembership.get(link.product_id)
    if (membershipId) grants.push({ tierId: tier.id, tierKind: tier.kind, position: tier.position, productId: link.product_id, source: "subscription", membershipId })
    else if (owned.viaEntitlement.has(link.product_id))
      grants.push({ tierId: tier.id, tierKind: tier.kind, position: tier.position, productId: link.product_id, source: tier.product_id === link.product_id ? "purchase" : "product", membershipId: null })
  }
  return grants
}

/** The way in to keep when there are several: a paid tier, bought directly, first in the creator's order. */
function bestGrant(grants: AccessGrant[]): AccessGrant | null {
  const rank = (g: AccessGrant) => (g.tierKind === "paid" ? 0 : 10) + (g.source === "product" ? 1 : 0)
  return [...grants].sort((a, b) => rank(a) - rank(b) || a.position - b.position || a.tierId.localeCompare(b.tierId))[0] ?? null
}

function grantRefs(g: AccessGrant, orderId?: string | null): SourceRefs {
  return { membershipId: g.membershipId, productId: g.source === "subscription" ? null : g.productId, ...(orderId !== undefined ? { orderId } : {}) }
}

async function defaultFreeTier(db: Db, communityId: string): Promise<string | null> {
  const { data: community } = await db.from("communities").select("access").eq("id", communityId).maybeSingle()
  if (community?.access !== "free") return null
  const { data: tier } = await db
    .from("community_tiers")
    .select("id")
    .eq("community_id", communityId)
    .eq("is_default", true)
    .eq("kind", "free")
    .is("archived_at", null)
    .maybeSingle()
  return (tier?.id as string | undefined) ?? null
}

/**
 * Makes a person's row agree with what they own now. Cheap enough to run on
 * every visit (a member read, the community's access products, and the
 * person's entitlements and memberships for those products only).
 *
 * `automatic` (the default) is a re-check nobody asked for, which never brings
 * back somebody who left; a payment that has just been made passes false.
 */
export async function reconcileAccess(
  db: Db,
  communityId: string,
  userId: string,
  opts: { automatic?: boolean; orderId?: string | null } = {},
): Promise<MemberRow | null> {
  const automatic = opts.automatic ?? true
  const { row: member, notSetUp } = await readMember(db, communityId, userId)
  if (notSetUp) return null
  if (member && (isOwnerRow(member) || isBlocked(member))) return member
  if (member && automatic && (member.status === "cancelled" || member.status === "paused")) return member

  const grants = await accessGrants(db, communityId, userId)
  if (grants === null) return member
  const best = bestGrant(grants)

  if (!member) {
    if (!best) return null
    return grantMembership(db, { communityId, userId, source: best.source, tierId: best.tierId, sourceRefs: grantRefs(best, opts.orderId), automatic })
  }

  if (member.status !== "active") {
    if (!best) return member
    return grantMembership(db, { communityId, userId, source: best.source, tierId: best.tierId, sourceRefs: grantRefs(best, opts.orderId), automatic })
  }

  const paidSource = PAID.includes(member.source)
  if (best) {
    if (paidSource && grants.some((g) => g.tierId === member.tier_id)) return member
    if (!paidSource && best.tierKind !== "paid") return member
    if (!paidSource && grants.some((g) => g.tierId === member.tier_id)) return member
    const { data, error } = await db
      .from("community_members")
      .update({ source: best.source, tier_id: best.tierId, source_membership_id: best.membershipId, source_product_id: best.source === "subscription" ? null : best.productId, ...(opts.orderId !== undefined ? { source_order_id: opts.orderId } : {}) })
      .eq("id", member.id)
      .select(MEMBER_COLUMNS)
      .single()
    if (error) throw new Error(`community member tier: ${reasonOf(error)}`)
    await audit(db, { communityId, actorId: null, actorKind: "system", action: "member.tier_changed", targetType: "member", targetId: userId, detail: { from: member.tier_id, to: best.tierId, source: best.source } })
    return data as MemberRow
  }

  if (!paidSource) return member
  /* The last paid way in has ended. */
  const freeTier = await defaultFreeTier(db, communityId)
  if (freeTier) {
    const { data, error } = await db
      .from("community_members")
      .update({ source: "free", tier_id: freeTier, source_membership_id: null, source_product_id: null })
      .eq("id", member.id)
      .select(MEMBER_COLUMNS)
      .single()
    if (error) throw new Error(`community member free tier: ${reasonOf(error)}`)
    await audit(db, { communityId, actorId: null, actorKind: "system", action: "member.downgraded", targetType: "member", targetId: userId, reason: "paid access ended", detail: { from: member.tier_id, to: freeTier } })
    return data as MemberRow
  }
  return revokeMembership(db, { communityId, userId, status: "expired", reason: "paid access ended", actorKind: "system" })
}

async function communitiesSellingTo(db: Db, productId: string): Promise<{ id: string; owner_user_id: string | null }[]> {
  const { data: links, error } = await db.from("community_access_products").select("community_id").eq("product_id", productId)
  if (error) {
    if (missing(error)) return []
    throw new Error(`community access products read: ${reasonOf(error)}`)
  }
  const ids = [...new Set(((links as { community_id: string }[] | null) ?? []).map((l) => l.community_id))]
  if (ids.length === 0) return []
  const { data: communities, error: cError } = await db.from("communities").select("id, owner_user_id").in("id", ids)
  if (cError) throw new Error(`communities read: ${reasonOf(cError)}`)
  return (communities as { id: string; owner_user_id: string | null }[] | null) ?? []
}

/**
 * After every membership sync (lib/memberships/sync.ts): each community the
 * membership's product gives access to is brought in step with it. `fresh`
 * is a membership whose access has just started, which may bring back a
 * member who had left. Returns how many communities were looked at.
 */
export async function syncCommunityAccessForMembership(
  db: Db,
  membershipRow: { product_id: string | null; buyer_id: string | null },
  opts: { fresh?: boolean } = {},
): Promise<number> {
  if (!membershipRow?.product_id || !membershipRow.buyer_id) return 0
  const communities = await communitiesSellingTo(db, membershipRow.product_id)
  let n = 0
  for (const c of communities) {
    if (c.owner_user_id === membershipRow.buyer_id) continue
    await reconcileAccess(db, c.id, membershipRow.buyer_id, { automatic: !opts.fresh })
    n++
  }
  return n
}

/**
 * After a library row is written (a purchase, a free claim: granted true) or
 * taken away (a full refund: granted false). Each community the product
 * gives access to is brought in step with what the buyer owns now.
 */
export async function syncCommunityAccessForEntitlement(
  db: Db,
  e: { userId: string | null; productId: string | null; orderId?: string | null; granted: boolean },
): Promise<number> {
  if (!e.userId || !e.productId) return 0
  const communities = await communitiesSellingTo(db, e.productId)
  let n = 0
  for (const c of communities) {
    if (c.owner_user_id === e.userId) continue
    await reconcileAccess(db, c.id, e.userId, { automatic: !e.granted, ...(e.granted && e.orderId ? { orderId: e.orderId } : {}) })
    n++
  }
  return n
}
