import "server-only"

/**
 * ===========================================================================
 *  JOINING, ASKING, LEAVING, AN INVITE, AND THE GATE IN FRONT OF CHECKOUT
 * ===========================================================================
 * The writes behind the sales page's one button, and the one check every
 * payment for a community tier passes first. Routes call these after
 * requireCommunitiesOn, a signed in user and a rate limit; nothing here
 * trusts anything the browser said beyond a note and a token.
 *
 *   joinCommunity     a free tier: in at once. Approval required: a request
 *                     (a pending row with the note), the owner told. A paid
 *                     tier: never a grant here, only where to pay. Somebody
 *                     who already owns a granting product is let back in by
 *                     reconcileAccess first, so a press after a purchase is
 *                     not a second purchase.
 *   leaveCommunity    an active member leaves (cancelled), a pending request
 *                     is withdrawn (cancelled). The owner never. A member who
 *                     pays by subscription is sent to cancel it instead,
 *                     because leaving would keep charging them for nothing.
 *   finishOnboarding  the member's welcome steps are done (onboarded_at).
 *   redeemInvite      the token's hash to community_redeem_invite, which
 *                     counts the use atomically; a complimentary invite lets
 *                     them in on its tier, any other invite counts as an
 *                     approved request and sends them to pay.
 *   checkoutGate      every checkout of a product that sells a tier: signed
 *                     in, not banned, not already a member (no second
 *                     subscription), and approved first when the community
 *                     asks for approval. Never charge somebody who has not
 *                     been approved (FOUNDATION note 6).
 */
import { createHash } from "node:crypto"
import { rateLimit } from "@/lib/api/rate-limit"
import { checkoutPath, communityPath } from "@/components/community/public/paths"
import { primaryOption } from "@/components/community/public/join-state"
import { LENGTHS } from "../limits"
import { invitedIn, needsInvite } from "../access-model"
import { meetsRole } from "../permissions"
import { MEMBER_COLUMNS, type CommunityRow, type MemberRow } from "../types"
import { communityOpen, loadCommunity, viewerContext, type Viewer } from "./context"
import { grantMembership, reconcileAccess, revokeMembership } from "./membership"
import { notifyMember } from "./notify"
import { sendCommunityEmail } from "./email"
import { audit } from "./audit"
import { admin, missing, nowIso, reasonOf, type Db } from "./db"
import { creatorTakesPayments, optionsFor, readPlans, readProducts, readTiers } from "./public"
import { accountEmail, inviteStanding, reservedInviteUses } from "./invites"
import { watchJoin } from "./safety"
import { noteInviteJoin } from "./invite-joins"

/* ── Rate limits ────────────────────────────────────────────────────────── */

/** Joins, requests, leaves and invites share one bucket per person: 20 in ten minutes, 60 a day. */
export const JOIN_WINDOWS = [
  { limit: 20, seconds: 600 },
  { limit: 60, seconds: 86400 },
] as const
export const JOIN_BUCKET = "community-join"

export function joinRateLimit(userId: string) {
  return rateLimit({ bucket: JOIN_BUCKET, subjects: [`user:${userId}`], windows: JOIN_WINDOWS, message: "That is a lot of joining and leaving. Try again in a few minutes." })
}

/* ── Answers ────────────────────────────────────────────────────────────── */

export type JoinAnswer =
  | { ok: true; state: "member"; url: string }
  | { ok: true; state: "pending" }
  | { ok: true; state: "checkout"; url: string }
  | { ok: false; status: number; error: string; message: string; url?: string }

type Refusal = Extract<JoinAnswer, { ok: false }>
const refuse = (status: number, error: string, message: string, url?: string): Refusal => ({ ok: false, status, error, message, ...(url ? { url } : {}) })

function closedAnswer(c: CommunityRow): Refusal | null {
  if (!communityOpen(c)) return refuse(403, "suspended", "This community isn't available right now.")
  if (c.status === "archived" || c.archived_at) return refuse(403, "archived", "This community is closed to new members.")
  if (c.status !== "published") return refuse(404, "not_found", "This community isn't open yet.")
  return null
}

function blockedAnswer(v: Viewer): Refusal | null {
  if (v.banned || v.status === "banned") return refuse(403, "banned", "You can't join this community.")
  if (v.status === "removed") return refuse(403, "removed", "You can't join this community.")
  return null
}

/**
 * THE WELCOME EMAIL (lib/communities/server/email.ts, template COMMUNITY_WELCOME),
 * once per member row: leaving and coming back is not a second welcome. It was
 * registered and drawn but nothing raised it, so a free join sent nothing (found
 * end to end). Never throws, like every community email.
 */
async function welcome(db: Db, c: CommunityRow, userId: string, memberId: string): Promise<void> {
  const text = typeof c.onboarding?.welcome === "string" ? c.onboarding.welcome : ""
  await sendCommunityEmail(db, "welcome", { userId, communityId: c.id, data: text ? { welcomeText: text } : {}, key: `member:${memberId}` })
}

/** Tells the owner a request is waiting. One notice per person per day, whatever they press. */
async function tellOwner(db: Db, c: CommunityRow, userId: string): Promise<void> {
  if (!c.owner_user_id) return
  try {
    await notifyMember(db, {
      userId: c.owner_user_id,
      communityId: c.id,
      kind: "join_request",
      actorId: userId,
      target: { type: "member", id: userId },
      title: `New request to join ${c.name}`.slice(0, 200),
      url: `/app/community/${c.id}/members?status=pending`,
      dedupeKey: `join_request:${c.id}:${userId}:${nowIso().slice(0, 10)}`,
    })
  } catch (e) {
    console.error(`[communities] join request notice: ${reasonOf(e)}`)
  }
}

/**
 * The press of the sales page's button, for a signed in person. `interval`
 * picks the paid tier's checkout when it offers both.
 */
export async function joinCommunity(db: Db, communityId: string, userId: string, input: { note?: unknown; interval?: unknown } = {}): Promise<JoinAnswer> {
  const community = await loadCommunity(db, { id: communityId })
  if (!community) return refuse(404, "not_found", "This community could not be found.")
  const closed = closedAnswer(community)
  const url = communityPath(community.slug)

  let viewer = await viewerContext(db, community, userId)
  if (viewer.active) return { ok: true, state: "member", url }
  const blocked = blockedAnswer(viewer)
  if (blocked) return blocked
  if (closed) return closed

  /* Already owns a product that gives access, and left once: the purchase brings them back, no second payment. */
  const back = await reconcileAccess(db, community.id, userId, { automatic: false }).catch(() => null)
  if (back?.status === "active") return { ok: true, state: "member", url }
  if (back) viewer = { ...viewer, member: back, status: back.status }

  /*
    A PRIVATE COMMUNITY IS NOT A REFUSAL OF EVERYTHING ANY MORE. Privacy says
    who may enter, the tiers say what joining costs, and the two are
    independent (lib/communities/access-model.ts). With no invite and no
    approved request there is no way in; with one, the ordinary free or paid
    path below runs, which is what lets a private community charge.
  */
  if (needsInvite(community) && !invitedIn(viewer.member)) return refuse(403, "invite_only", "This community is invite only.")
  if (community.access === "product") return refuse(409, "needs_product", "Access comes with one of the creator's products.", `${url}/about#ways-to-join`)

  const tiers = await readTiers(db, [community.id])
  const productIds = tiers.map((t) => t.product_id).filter(Boolean) as string[]
  const [products, plans, creator] = await Promise.all([
    readProducts(db, productIds),
    readPlans(db, productIds),
    community.creator_id ? db.from("creators").select("stripe_account_id, stripe_onboarding_status, charges_enabled").eq("id", community.creator_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const options = optionsFor(community.slug, tiers, products, plans, creatorTakesPayments(creator.data))
  const option = primaryOption(options, community.access, true)
  if (!option) return refuse(409, "unavailable", "Joining isn't open yet.")

  const member = viewer.member
  const approved = member?.status === "pending" && Boolean(member.approved_by)

  if (community.approval_required && !approved) {
    if (member?.status === "pending") return { ok: true, state: "pending" }
    const note = typeof input.note === "string" ? input.note.trim().slice(0, LENGTHS.requestNote.max) : null
    /* The source says what the request is for: a paid source on a pending row is "approved to pay", never "let in" (lib/communities/server/join.ts checkoutGate). */
    const source = option.kind === "free" ? "free" : option.billing === "recurring" ? "subscription" : "purchase"
    const row = await grantMembership(db, { communityId: community.id, userId, source, tierId: option.tierId, status: "pending", requestNote: note || null, actorId: userId })
    if (!row) return refuse(503, "not_set_up", "Communities are not set up on Storelib yet. Try again later.")
    if (row.status === "active") return { ok: true, state: "member", url }
    if (row.status !== "pending") return refuse(403, "removed", "You can't join this community.")
    await tellOwner(db, community, userId)
    return { ok: true, state: "pending" }
  }

  if (option.kind === "free") {
    const row = await grantMembership(db, { communityId: community.id, userId, source: "free", tierId: option.tierId, status: "active", actorId: userId })
    if (!row) return refuse(503, "not_set_up", "Communities are not set up on Storelib yet. Try again later.")
    if (row.status !== "active") return refuse(403, "removed", "You can't join this community.")
    await welcome(db, community, userId, row.id)
    await watchJoin(db, community, userId)
    return { ok: true, state: "member", url }
  }

  /* A paid tier is never granted here: the payment's own sync does that. */
  const c = option.checkout
  const target = input.interval === "year" ? c?.year ?? c?.month : c?.month ?? c?.year ?? c?.once
  if (!target) return refuse(409, "unavailable", "Joining isn't open yet.")
  return { ok: true, state: "checkout", url: target }
}

/* ── Leaving ────────────────────────────────────────────────────────────── */

export type LeaveAnswer = { ok: true; state: "left" | "withdrawn" } | { ok: false; status: number; error: string; message: string; url?: string }

export async function leaveCommunity(db: Db, communityId: string, userId: string): Promise<LeaveAnswer> {
  const community = await loadCommunity(db, { id: communityId })
  if (!community) return { ok: false, status: 404, error: "not_found", message: "This community could not be found." }
  const { data, error } = await db.from("community_members").select(MEMBER_COLUMNS).eq("community_id", community.id).eq("user_id", userId).maybeSingle()
  if (error) {
    if (missing(error)) return { ok: false, status: 503, error: "not_set_up", message: "Communities are not set up on Storelib yet." }
    console.error(`[communities] leave read: ${reasonOf(error)}`)
    return { ok: false, status: 500, error: "failed", message: "That did not go through. Try again." }
  }
  const member = data as MemberRow | null
  if (!member || (member.status !== "active" && member.status !== "pending")) return { ok: false, status: 409, error: "not_member", message: "You are not a member of this community." }
  if (meetsRole(member.role, "owner") || member.source === "owner" || community.owner_user_id === userId) {
    return { ok: false, status: 409, error: "owner", message: "You own this community. Archive it from its settings instead." }
  }
  if (member.status === "active" && member.source === "subscription" && member.source_membership_id) {
    /* Leaving would end the access and keep the subscription: cancel it where it is billed. */
    return { ok: false, status: 409, error: "manage_billing", message: "Cancel your membership first. You keep access until the period you paid for ends.", url: `/account/library/memberships/${member.source_membership_id}` }
  }
  const wasPending = member.status === "pending"
  const row = await revokeMembership(db, { communityId: community.id, userId, status: "cancelled", reason: wasPending ? "request withdrawn" : "left", actorId: userId, actorKind: "member" })
  if (!row) return { ok: false, status: 500, error: "failed", message: "That did not go through. Try again." }
  return { ok: true, state: wasPending ? "withdrawn" : "left" }
}

/* ── Onboarding ─────────────────────────────────────────────────────────── */

/** The welcome steps are done. Once: a second call changes nothing. */
export async function finishOnboarding(db: Db, communityId: string, userId: string): Promise<{ ok: true; onboardedAt: string } | { ok: false; status: number; error: string }> {
  const { data, error } = await db
    .from("community_members")
    .update({ onboarded_at: nowIso() })
    .eq("community_id", communityId)
    .eq("user_id", userId)
    .eq("status", "active")
    .is("onboarded_at", null)
    .select("onboarded_at")
    .maybeSingle()
  if (error) {
    if (missing(error)) return { ok: false, status: 503, error: "not_set_up" }
    console.error(`[communities] onboarding: ${reasonOf(error)}`)
    return { ok: false, status: 500, error: "failed" }
  }
  if (data?.onboarded_at) return { ok: true, onboardedAt: data.onboarded_at as string }
  const { data: done } = await db.from("community_members").select("onboarded_at").eq("community_id", communityId).eq("user_id", userId).maybeSingle()
  return { ok: true, onboardedAt: (done?.onboarded_at as string | undefined) ?? nowIso() }
}

/* ── Invites ────────────────────────────────────────────────────────────── */

/** The 32 byte base64url token an invite link carries; anything else is not one. */
const TOKEN = /^[A-Za-z0-9_-]{32,64}$/

/** sha256 hex of the raw token: what community_invites.token_hash holds. */
export function inviteTokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

export type RedeemAnswer =
  | { ok: true; state: "member"; url: string; already: boolean }
  | { ok: true; state: "checkout"; url: string }
  | { ok: false; status: number; error: string; message: string }

const REDEEM_MESSAGES: Record<string, [number, string]> = {
  /* 400, not 404: the community is there, the link is not a valid invite to it. */
  not_found: [400, "This invite link isn't valid."],
  revoked: [410, "This invite link was turned off."],
  expired: [410, "This invite link has expired."],
  email_mismatch: [403, "This invite was sent to a different email address. Sign in with that one."],
  used_up: [410, "This invite link has been used up."],
}

interface InviteFacts {
  id: string
  tier_id?: string | null
  complimentary?: boolean | null
  created_by?: string | null
  email?: string | null
  max_uses?: number | null
  uses?: number | null
  expires_at?: string | null
  revoked_at?: string | null
}

/** Where the person pays for a tier, on the interval its plan offers. */
async function priceUrl(db: Db, slug: string, productId: string): Promise<string> {
  const { data: plan } = await db.from("membership_plans").select("monthly_price_cents, yearly_price_cents").eq("product_id", productId).maybeSingle()
  const p = plan as { monthly_price_cents?: number | null; yearly_price_cents?: number | null } | null
  const interval = p ? (p.monthly_price_cents ? "month" : p.yearly_price_cents ? "year" : null) : null
  return checkoutPath(productId, slug, interval)
}

/**
 * An invite to a tier that is sold, which the creator did not make
 * complimentary: the answer is "you are approved, now pay", and the invite's
 * use is not counted. Null when this invite is not that (and the atomic
 * redeem below runs instead).
 */
async function heldInvite(db: Db, community: CommunityRow, invite: InviteFacts, userId: string): Promise<RedeemAnswer | null> {
  if (invite.complimentary !== false) return null
  const tiers = await readTiers(db, [community.id])
  const tier = (invite.tier_id && tiers.find((t) => t.id === invite.tier_id)) || tiers.find((t) => t.is_default) || tiers.find((t) => t.kind === "free") || null
  if (!tier || tier.kind !== "paid" || !tier.product_id) return null

  const [email, reserved] = await Promise.all([invite.email ? accountEmail(db, userId) : Promise.resolve(null), reservedInviteUses(db, invite.id, userId)])
  const standing = inviteStanding(invite, { email, reserved })
  if (standing !== "ok") {
    const [status, message] = REDEEM_MESSAGES[standing] ?? REDEEM_MESSAGES.not_found
    return { ok: false, status, error: standing, message }
  }

  const invitedBy = invite.created_by ?? null
  const row = await grantMembership(db, {
    communityId: community.id,
    userId,
    source: "invite",
    tierId: tier.id,
    status: "pending",
    sourceRefs: { inviteId: invite.id, invitedBy, approvedBy: invitedBy ?? community.owner_user_id },
    actorId: userId,
  })
  if (!row) return { ok: false, status: 503, error: "not_set_up", message: "Communities are not set up on Storelib yet." }
  if (row.status === "active") return { ok: true, state: "member", url: communityPath(community.slug), already: false }
  if (row.status !== "pending") return { ok: false, status: 403, error: "banned", message: "You can't join this community." }
  await audit(db, { communityId: community.id, actorId: userId, actorKind: "member", action: "invite.held", targetType: "invite", targetId: invite.id, detail: { tierId: tier.id } })
  return { ok: true, state: "checkout", url: await priceUrl(db, community.slug, tier.product_id) }
}

export async function redeemInvite(db: Db, communityId: string, userId: string, rawToken: unknown): Promise<RedeemAnswer> {
  const token = typeof rawToken === "string" ? rawToken.trim() : ""
  if (!TOKEN.test(token)) return { ok: false, status: 400, error: "not_found", message: REDEEM_MESSAGES.not_found[1] }
  const community = await loadCommunity(db, { id: communityId })
  if (!community) return { ok: false, status: 404, error: "not_found", message: "This community could not be found." }
  const hash = inviteTokenHash(token)

  /* The invite must be THIS community's before a use is counted: a token for another one counts nothing here. */
  const { data: invite, error } = await db
    .from("community_invites")
    .select("id, community_id, tier_id, complimentary, created_by, email, max_uses, uses, expires_at, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle()
  if (error) {
    if (missing(error)) return { ok: false, status: 503, error: "not_set_up", message: "Communities are not set up on Storelib yet." }
    console.error(`[communities] invite read: ${reasonOf(error)}`)
    return { ok: false, status: 500, error: "failed", message: "That did not go through. Try again." }
  }
  if (!invite || invite.community_id !== community.id) return { ok: false, status: 400, error: "not_found", message: REDEEM_MESSAGES.not_found[1] }

  const url = communityPath(community.slug)
  const viewer = await viewerContext(db, community, userId)
  if (viewer.active) return { ok: true, state: "member", url, already: true }
  if (viewer.banned || viewer.status === "banned" || viewer.status === "removed") return { ok: false, status: 403, error: "banned", message: "You can't join this community." }
  const closed = closedAnswer(community)
  if (closed) return { ok: false, status: closed.status, error: closed.error, message: closed.message }

  /*
    A PRICED INVITE IS HELD, NOT SPENT. Accepting an invite to a tier that is
    sold only says "you may pay now", and the payment may never come, so
    counting the use here would burn a one use link on somebody who closed
    the checkout. The invite's own checks run first, with the people already
    holding it counted against its uses (./invites.ts inviteStanding), the
    request row is written with the invite on it, and the use is counted when
    the payment makes that row active (./invite-spend.ts, called from
    ./membership.ts). A refund takes the access away again the way every
    paid membership does (reconcileAccess).
  */
  const held = await heldInvite(db, community, invite, userId)
  if (held) return held

  const { data: result, error: rpcError } = await db.rpc("community_redeem_invite", { p_token_hash: hash, p_user: userId })
  if (rpcError) {
    if (missing(rpcError)) return { ok: false, status: 503, error: "not_set_up", message: "Communities are not set up on Storelib yet." }
    console.error(`[communities] invite redeem: ${reasonOf(rpcError)}`)
    return { ok: false, status: 500, error: "failed", message: "That did not go through. Try again." }
  }
  const r = (result ?? {}) as { ok?: boolean; reason?: string; tier_id?: string | null; complimentary?: boolean; invite_id?: string; new?: boolean }
  if (!r.ok) {
    const [status, message] = REDEEM_MESSAGES[r.reason ?? "not_found"] ?? REDEEM_MESSAGES.not_found
    return { ok: false, status, error: r.reason ?? "not_found", message }
  }

  const tiers = await readTiers(db, [community.id])
  const tier = (r.tier_id && tiers.find((t) => t.id === r.tier_id)) || tiers.find((t) => t.is_default) || tiers.find((t) => t.kind === "free") || null
  const refs = { inviteId: r.invite_id ?? invite.id, invitedBy: (invite.created_by as string | null) ?? null }

  /* Anything that reaches here is complimentary: they are in on the invite's tier, with nothing to pay. */
  const row = await grantMembership(db, { communityId: community.id, userId, source: "invite", tierId: tier?.id ?? null, status: "active", sourceRefs: refs, actorId: userId })
  if (!row) return { ok: false, status: 503, error: "not_set_up", message: "Communities are not set up on Storelib yet." }
  if (row.status !== "active") return { ok: false, status: 403, error: "banned", message: "You can't join this community." }
  await audit(db, { communityId: community.id, actorId: userId, actorKind: "member", action: "invite.redeemed", targetType: "invite", targetId: refs.inviteId, detail: { new: r.new ?? null } })
  if (r.new !== false) await watchJoin(db, community, userId, { inviteId: refs.inviteId })
  /* Whoever shared the link hears about it once a day, quietly (round 13, invite-joins.ts). */
  if (r.new !== false) await noteInviteJoin(db, { communityId: community.id, slug: community.slug, inviterId: refs.invitedBy, joinerId: userId })
  await welcome(db, community, userId, row.id)
  return { ok: true, state: "member", url, already: false }
}

/* ── The gate in front of checkout ──────────────────────────────────────── */

export interface CheckoutRefusal {
  status: number
  code: "sign_in" | "banned" | "already_member" | "needs_approval" | "unavailable"
  error: string
  /** Where the buyer belongs instead: sign in, or the community. */
  url: string
}

/**
 * Null when this person may pay for this product. Products that sell no tier
 * always pass (an ordinary product, or the column not there yet).
 */
export async function checkoutGate(
  product: { id: string; community_id?: string | null },
  userId: string | null,
  db: Db = admin(),
): Promise<{ community: CommunityRow | null; refusal: CheckoutRefusal | null }> {
  /* Read softly when the caller's row did not carry it: before part 81 there is no column, and every product passes. */
  let communityId: string | null = product.community_id ?? null
  if (product.community_id === undefined) {
    try {
      const { data, error } = await db.from("products").select("community_id").eq("id", product.id).maybeSingle()
      if (!error) communityId = (data?.community_id as string | null) ?? null
    } catch {
      communityId = null
    }
  }
  if (!communityId) return { community: null, refusal: null }
  const community = await loadCommunity(db, { id: communityId })
  if (!community) return { community: null, refusal: { status: 404, code: "unavailable", error: "This community is not available.", url: "/explore?type=communities" } }
  const url = communityPath(community.slug)
  if (!communityOpen(community) || community.status !== "published" || community.archived_at) {
    return { community, refusal: { status: 404, code: "unavailable", error: "This community is not taking new members.", url } }
  }
  if (!userId) {
    return { community, refusal: { status: 401, code: "sign_in", error: "Sign in to join this community.", url: `/login?next=${encodeURIComponent(`${url}?join=1`)}` } }
  }
  const viewer = await viewerContext(db, community, userId)
  if (viewer.active) return { community, refusal: { status: 409, code: "already_member", error: "You are already a member of this community.", url } }
  if (viewer.banned || viewer.status === "banned" || viewer.status === "removed") return { community, refusal: { status: 403, code: "banned", error: "You can't join this community.", url } }
  if (community.approval_required) {
    const approved = viewer.member?.status === "pending" && Boolean(viewer.member.approved_by)
    if (!approved) return { community, refusal: { status: 403, code: "needs_approval", error: "Send a request to join first. You can pay once it is approved.", url } }
  }
  return { community, refusal: null }
}
