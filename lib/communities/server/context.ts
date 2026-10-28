import "server-only"

/**
 * ===========================================================================
 *  WHO IS LOOKING, AND MAY THEY
 * ===========================================================================
 * Every community page and route starts here. loadCommunity reads the
 * community; viewerContext says who the signed in person is to it (their row,
 * role, tier, level, what they own), after reconciling their access once so
 * a paid member whose sync was missed is fixed on the visit itself.
 * requireMember is the gate for member routes and requireCreatorCommunity the
 * gate for the creator's /api/app/community routes: both answer with the
 * NextResponse to send when the answer is no, so a route reads
 *
 *   const gate = await requireMember(db, communityId, userId, "post")
 *   if (gate instanceof NextResponse) return gate
 *
 * and every decision is can() (lib/communities/permissions.ts).
 */
import { NextResponse } from "next/server"
import { requireCreator, type CreatorContext } from "@/lib/email-campaigns/route-auth"
import { parseAccessRule } from "../access"
import { allowedActions, can, type CommunityAction, type RolePermissions } from "../permissions"
import { COMMUNITY_COLUMNS, type CommunityRow, type MemberRow, type MemberStatus, type Role, type ViewerView } from "../types"
import { grantMembership, ownedProductIds, reconcileAccess } from "./membership"
import { admin, missing, reasonOf, type Db } from "./db"
import { communityIdForOldSlug } from "./slug-history"
import { staffPermissions } from "./creator-roles"
import { TEAM_COMMUNITY_ROLE, teamAuditDb, teamCommunityIdentity } from "./team"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface Viewer {
  userId: string | null
  member: MemberRow | null
  /** The role, only while the row is active: an expired admin may do nothing. */
  role: Role | null
  active: boolean
  status: MemberStatus | null
  tierId: string | null
  ownedProductIds: string[]
  level: number
  points: number
  isOwner: boolean
  isCreatorAccount: boolean
  banned: boolean
  mutedUntil: string | null
  /**
   * What the owner lets this admin or moderator do (run-now part 100,
   * ./creator-roles.ts), handed to every can() about them; null for
   * everybody else, and the defaults before the part has run.
   */
  perms?: RolePermissions | null
}

const NOBODY: Viewer = {
  userId: null,
  member: null,
  role: null,
  active: false,
  status: null,
  tierId: null,
  ownedProductIds: [],
  level: 1,
  points: 0,
  isOwner: false,
  isCreatorAccount: false,
  banned: false,
  mutedUntil: null,
}

/** A community by its address (or an address it used to have) or its id, or null (not there, deleted, or part 81 not run). */
export async function loadCommunity(db: Db, key: { slug: string } | { id: string }): Promise<CommunityRow | null> {
  try {
    let q = db.from("communities").select(COMMUNITY_COLUMNS)
    if ("id" in key) {
      if (!UUID.test(key.id)) return null
      q = q.eq("id", key.id)
    } else {
      const slug = (key.slug ?? "").toLowerCase()
      if (!slug || slug.length > 48) return null
      q = q.eq("slug", slug)
    }
    const { data, error } = await q.is("deleted_at", null).maybeSingle()
    if (error) {
      if (!missing(error)) console.error(`[communities] community read: ${reasonOf(error)}`)
      return null
    }
    if (data) return data as CommunityRow
    /*
      AN OLD ADDRESS (run-now part 94): nobody is at it now, but a community
      was, so it answers with that community under its current address. The
      community's layout compares the two and sends the visitor on
      (app/(marketing)/community/[slug]/layout.tsx, lib/communities/slug-move.ts).
    */
    if ("slug" in key) {
      const moved = await communityIdForOldSlug(db, key.slug)
      if (moved) return loadCommunity(db, { id: moved })
    }
    return null
  } catch (e) {
    console.error(`[communities] community read: ${reasonOf(e)}`)
    return null
  }
}

/** Product ids a community's own rules can name: its access products, its courses, its spaces' rules. */
async function ruleProductIds(db: Db, communityId: string): Promise<string[]> {
  const [links, courses, spaces] = await Promise.all([
    db.from("community_access_products").select("product_id").eq("community_id", communityId),
    db.from("community_courses").select("product_id").eq("community_id", communityId),
    db.from("community_spaces").select("view_access").eq("community_id", communityId).is("archived_at", null),
  ])
  const ids = new Set<string>()
  for (const r of (links.data as { product_id: string }[] | null) ?? []) ids.add(r.product_id)
  for (const r of (courses.data as { product_id: string }[] | null) ?? []) ids.add(r.product_id)
  for (const s of (spaces.data as { view_access: unknown }[] | null) ?? []) for (const id of parseAccessRule(s.view_access).productIds ?? []) ids.add(id)
  return [...ids]
}

/**
 * The signed in person as this community sees them. Never throws: anything
 * that cannot be read leaves them a visitor.
 */
export async function viewerContext(db: Db, community: CommunityRow, userId: string | null): Promise<Viewer> {
  if (!userId) return { ...NOBODY }
  const isOwner = community.owner_user_id === userId
  /*
    ROUND 39: THREE QUESTIONS AT ONCE. Their standing here, whether the store's own account is looking, and the products
    the community's rules can name were asked one after the other, four round trips before any page of a community (and
    every request through requireMember) could go on. None needs another's answer.
  */
  const standing = (async (): Promise<MemberRow | null> => {
    let member: MemberRow | null = null
    try {
      member = await reconcileAccess(db, community.id, userId)
      /* The owner's own row, made again if it was ever lost. */
      if (isOwner && (!member || member.role !== "owner" || member.status !== "active")) {
        member = (await grantMembership(db, { communityId: community.id, userId, source: "owner", role: "owner", status: "active" })) ?? member
      }
    } catch (e) {
      console.error(`[communities] viewer ${userId} in ${community.id}: ${reasonOf(e)}`)
    }
    return member
  })()

  const creatorAccount = (async (): Promise<boolean> => {
    if (isOwner) return true
    if (!community.creator_id) return false
    try {
      const { data } = await db.from("creators").select("user_id").eq("id", community.creator_id).maybeSingle()
      return data?.user_id === userId
    } catch {
      /* A visitor, as far as this page knows. */
      return false
    }
  })()

  const ownedIds = (async (): Promise<string[]> => {
    try {
      const ids = await ruleProductIds(db, community.id)
      return ids.length ? await ownedProductIds(db, userId, ids) : []
    } catch {
      return []
    }
  })()

  const [member, isCreatorAccount, owned] = await Promise.all([standing, creatorAccount, ownedIds])

  const active = member?.status === "active"
  const role: Role | null = active ? (member?.role ?? null) : null
  const perms = await staffPermissions(db, community.id, role)
  return {
    userId,
    member,
    role,
    active,
    status: member?.status ?? null,
    tierId: member?.tier_id ?? null,
    ownedProductIds: owned,
    level: member?.level ?? 1,
    points: member?.points ?? 0,
    isOwner,
    isCreatorAccount,
    banned: member?.status === "banned" || Boolean(member?.banned_at),
    mutedUntil: member?.muted_until && Date.parse(member.muted_until) > Date.now() ? member.muted_until : null,
    perms,
  }
}

/** What a client component may be handed about the viewer. */
export function viewerView(v: Viewer): ViewerView {
  return {
    userId: v.userId,
    signedIn: Boolean(v.userId),
    role: v.role,
    status: v.status,
    active: v.active,
    tierId: v.tierId,
    level: v.level,
    points: v.points,
    isOwner: v.isOwner,
    isCreatorAccount: v.isCreatorAccount,
    mutedUntil: v.mutedUntil,
    joinedAt: v.member?.joined_at ?? null,
    can: allowedActions(v.role, v.perms),
  }
}

/** Actions a muted member may not take until the mute ends. */
export const MUTED_ACTIONS: readonly CommunityAction[] = ["post", "comment", "react", "chat", "upload"]
/** Actions nobody takes in an archived community: it is kept to read. */
export const ARCHIVED_READ_ONLY: readonly CommunityAction[] = ["post", "comment", "react", "chat", "upload", "announce", "invite"]

const noStore = { "Cache-Control": "no-store" }
const answer = (status: number, error: string, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status, headers: noStore })

/** Whether a community is open to its members at all: not suspended, not deleted. */
export function communityOpen(c: CommunityRow): boolean {
  return !c.deleted_at && !c.suspended_at && c.status !== "suspended"
}

export interface MemberGate {
  ok: true
  viewer: Viewer
  community: CommunityRow
}

/**
 * The gate for a member route: 404 when there is no such community, 401 when
 * signed out, 403 when not an active member, muted for this, the community
 * is archived for this, or the role may not.
 */
export async function requireMember(db: Db, communityId: string, userId: string | null, action: CommunityAction): Promise<MemberGate | NextResponse> {
  const community = await loadCommunity(db, { id: communityId })
  if (!community) return answer(404, "not_found")
  if (!communityOpen(community)) return answer(403, "suspended")
  if (!userId) return answer(401, "sign_in")
  const viewer = await viewerContext(db, community, userId)
  if (!viewer.active) return answer(403, viewer.banned ? "banned" : viewer.status === "pending" ? "pending" : "not_member")
  if (viewer.mutedUntil && MUTED_ACTIONS.includes(action)) return answer(403, "muted", { until: viewer.mutedUntil })
  if ((community.status === "archived" || community.archived_at) && ARCHIVED_READ_ONLY.includes(action)) return answer(403, "archived")
  if (!can(viewer.role, action, viewer.perms)) return answer(403, "forbidden")
  return { ok: true, viewer, community }
}

export interface CreatorCommunityGate {
  ok: true
  ctx: CreatorContext
  community: CommunityRow
  viewer: Viewer
  role: Role
}

/**
 * The gate for /api/app/community/[id]: a signed in creator account
 * (requireCreator) who is this community's owner (its creator, or its owner
 * account) or one of its admins or moderators, with a role that may take
 * this action.
 */
/** What a suspended community's staff may not do: anything that reaches people (requireCreatorCommunity). */
const SUSPENDED_REFUSES: readonly CommunityAction[] = ["invite", "post", "announce", "manage_events", "chat", "upload"]

export async function requireCreatorCommunity(communityId: string, action: CommunityAction): Promise<CreatorCommunityGate | NextResponse> {
  const ctx = await requireCreator("community")
  /* requireCreator's own words are about email; a community route answers in its own codes. */
  if (ctx instanceof NextResponse) return ctx.status === 401 ? answer(401, "sign_in") : answer(403, "not_creator")
  const db = ctx.admin ?? admin()
  const community = await loadCommunity(db, { id: communityId })
  if (!community) return answer(404, "not_found")
  /* Round 40: someone on the store's team with Community, working in the store (./team.ts). */
  if (ctx.isOwner === false) return teamCommunityGate(ctx, db, community, action)
  const viewer = await viewerContext(db, community, ctx.userId)
  const ownsIt = community.creator_id === ctx.creatorId || community.owner_user_id === ctx.userId
  const role: Role | null = ownsIt ? "owner" : viewer.role
  if (!role || role === "member") return answer(404, "not_found")
  if (!can(role, action, viewer.perms)) return answer(403, "forbidden")
  /*
    A COMMUNITY STORELIB SUSPENDED REACHES NOBODY NEW (round 27 review). Its owner and staff can still open it, read what is
    in it, remove things and leave it, but nothing that goes out to people: no invitations sent, no posts or
    announcements, no events. Only publishing refused this before, so a taken down community could still send invites.
  */
  if ((community.suspended_at || community.status === "suspended") && SUSPENDED_REFUSES.includes(action)) return answer(403, "suspended")
  return { ok: true, ctx, community, viewer: ownsIt ? { ...viewer, role: "owner", active: true } : viewer, role }
}

/**
 * THE SAME GATE FOR A STORE'S TEAM MEMBER (./team.ts): only a community of
 * the store they work in, as an admin with what the owner lets admins do
 * there, acting as the store (the community owner's account), with every
 * audit line naming them. Never the owner's role, whatever the store is.
 */
export async function teamCommunityGate(ctx: CreatorContext, db: Parameters<typeof loadCommunity>[0], community: CommunityRow, action: CommunityAction): Promise<CreatorCommunityGate | NextResponse> {
  const identity = teamCommunityIdentity(community, { creatorId: ctx.creatorId, ownerUserId: ctx.ownerUserId ?? null })
  if (!identity) return answer(404, "not_found")
  const role = TEAM_COMMUNITY_ROLE
  const perms = await staffPermissions(db, community.id, role)
  if (!can(role, action, perms)) return answer(403, "forbidden")
  if ((community.suspended_at || community.status === "suspended") && SUSPENDED_REFUSES.includes(action)) return answer(403, "suspended")
  const viewer: Viewer = { ...NOBODY, userId: identity, role, active: true, status: "active", perms }
  return { ok: true, ctx: { ...ctx, userId: identity, admin: teamAuditDb(db, ctx.userId) }, community, viewer, role }
}
