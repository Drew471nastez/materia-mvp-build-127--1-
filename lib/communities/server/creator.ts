import "server-only"
import { welcomeVideoSrc } from "@/lib/communities/post-media"

/**
 * ===========================================================================
 *  A CREATOR'S COMMUNITIES, ON THE SERVER
 * ===========================================================================
 * Everything /app/community reads and writes, with the service role, after
 * the checks: a page asks creatorCommunityPage (the signed in creator owns
 * the community, or is one of its admins or moderators) and a route asks
 * requireCreatorCommunity (lib/communities/server/context.ts) with the
 * action it is about to take, and every decision after that is can().
 *
 * Sections, in the order the screens show them: the list, the create flow,
 * the Overview's figures and next steps, settings, spaces, the classroom,
 * events, the feed, gamification and members. Prices and tiers are in
 * tiers.ts, invites in invites.ts, moderation in moderation.ts, the
 * analytics in analytics.ts.
 *
 * Nothing here loads a whole table. Lists are keyset pages; figures are
 * counts (head requests) or the counters the triggers keep; the one sum
 * (monthly revenue) reads the linked memberships a page at a time, and
 * only the three columns it needs.
 */
import { cache } from "react"
import { notFound } from "next/navigation"
import { communitiesEnabled } from "../flag"
import { pageUser } from "@/lib/auth/page-user"
import { creatorForRequest } from "@/lib/auth/request-scope"
import { rateLimit } from "@/lib/api/rate-limit"
import { communityMrr, communitySellingProducts, membershipsOf, mrrOfRows } from "./membership-money"
import { sanitizeDescription } from "@/lib/rich-text/sanitize"
import { communityCategoryId } from "@/lib/explore/communities-mode"
import { queueCommunityFanout } from "@/lib/notifications/fanout"
import { parseAccessRule } from "../access"
import { SEARCH_CAP, safeSearch } from "../search"
import { priceLine } from "../format"
import { LENGTHS, MAX_SPACES } from "../limits"
import { allowedActions, can, meetsRole, type CommunityAction, type RolePermissions } from "../permissions"
import { slugify, slugWithSuffix, validSlug, validSpaceSlug } from "../slug"
import { COMMUNITY_COLUMNS, COMMUNITY_VISIBILITIES, EVENT_COLUMNS, EVENT_COLUMNS_PRICED, MEMBER_COLUMNS, NOTIFY_LEVELS, PAID_SOURCES, SPACE_COLUMNS, isOneOf, type AccessRuleJson, type CommunityRow, type EventRow, type MemberRow, type MemberStatus, type Role, type SpaceRow } from "../types"
import { accessColumnsFor, accessWords, privacyOf } from "../access-model"
import {
  accessChoiceOf,
  accessForType,
  checkAccessChoice,
  checkBenefits,
  checkFaq,
  checkLinks,
  checkRules,
  csvRow,
  decodeCursor,
  encodeCursor,
  htmlToText,
  isUuid,
  keysetOr,
  replayVideoId,
  taglineFrom,
  textToHtml,
  MEMBERS_PAGE,
  type CommunityType,
  type CreateInput,
  type EventInput,
  type EventTicketInput,
  type GalleryItem,
  type LevelInput,
  type MemberQuery,
  type SpaceInput,
} from "@/components/community/creator/logic"
import type {
  BadgeView,
  CommunityHead,
  CommunityLimitView,
  CommunityListRow,
  CourseView,
  EventEditView,
  EventTicketMoney,
  EventTicketSetup,
  FeedRowView,
  LevelView,
  MemberActionTaken,
  MemberPage,
  MemberRowView,
  OverviewData,
  PickProduct,
  SettingsData,
  SpaceView,
  UpcomingEvent,
} from "@/components/community/creator/view-types"
import { audit } from "./audit"
import { createCommunity } from "./create"
import { loadCommunity, type Viewer } from "./context"
import { grantMembership, memberOf, revokeMembership } from "./membership"
import { awardPoints } from "./points"
import { notifyEventChanged, queueJob } from "./notify"
import { recordActivity } from "./activity"
import { eventScheduled } from "./events"
import { ticketsReady } from "./event-tickets"
import { eventPriceColumns, eventReadColumns, eventsTicketMoney, priceChangeRefusal, pricedEventCount } from "./event-admin"
import { eventTicketSetup } from "./event-ticket-setup"
import { admin, missing, nowIso, reasonOf, type Db } from "./db"
import { PAGE_FIELDS_NOT_READY, joinWordsRefusal, loadPageFields, pageFieldsPatch, writesPageFields } from "./page-fields"
import { inviteCount } from "./invites"
import { slugHeldByAnother } from "./slug-history"
import { openReportCount, peopleOf } from "./moderation"
import { overviewActivity } from "./overview-activity"
import { createPaidTier, loadTiers, pickableProducts, syncTierProducts } from "./tiers"
import { teamStaffContext } from "./team-page"
import { TEAM_COMMUNITY_ROLE } from "./team"
import { teamStoreForRequest } from "@/lib/team/server"
import { permits } from "@/lib/team/permissions"
import { checkGalleryForCommunity, coverAfterGallery, loadGallery, ownPicture, saveGallery } from "./gallery"
import { keptSafety, slowModeChoice, withSlowMode } from "./safety"
import { cleanLook, coverPosition, keptLook, pageLookOf, withPageLook } from "../page-look"
import { LEGAL_KINDS, keptLegal, legalLinksOf, legalUrl, withLegalLinks } from "../legal-links"
import { descriptionTooLong } from "@/lib/rich-text/policy"
import { communityAppearance, withAppearance } from "../appearance"
import { rolePermissionsOf, rolesView, staffPermissionsFor } from "./creator-roles"
import { communityRoom, loadPolicies, madeWithinLimit, pendingDeletions, type PendingDeletion } from "./creator-policies"
import { deletionScheduled, paidMemberships, scheduleDeletion, ticketedEventsAhead, ticketsHoldText, type DeletionDeps } from "./community-deletion"
import { communityGone } from "./community-gone"
import { factsFrom, setupExtras } from "./setup-checklist"
import { setupChecklist, stepsLeft } from "../setup-checklist"
import type { WizardInput } from "../create-wizard"
import type { ScheduledDeletionView } from "../community-deletion"
import { creatorSitePlan } from "@/lib/sites/plan-server"
import { communityLimitFor, PLAN_LIMIT_ERROR, takesCommunitySlot } from "../plan-limit"
import { librarySettings } from "./library"

export type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string; status: number; field?: string }
const no = (status: number, error: string, field?: string) => ({ ok: false as const, status, error, field })

const DAY = 86_400_000
const sinceIso = (days: number, now = Date.now()) => new Date(now - days * DAY).toISOString()

/* ── Writes are counted: one bucket for the creator's management writes ─── */

/** 300 changes in 10 minutes per person: far above any real editing, far below a script. */
export const MANAGE_WINDOWS = [{ limit: 300, seconds: 600 }] as const

/** The rate limit every creator write route asks first (posts and invites use their own buckets). */
export function manageLimit(userId: string) {
  return rateLimit({ bucket: "community-manage", subjects: [`user:${userId}`], windows: MANAGE_WINDOWS, message: "That is a lot of changes at once. Wait a minute and try again." })
}

/* ── Pictures: only our own storage (./gallery.ts ownPicture, shared with the gallery) ── */

export { ownPicture }

/* The member search's cleaning, where the screens and the other server files already look for it. */
export { safeSearch }

/* ── The page gate ──────────────────────────────────────────────────────── */

export interface CreatorPageContext {
  userId: string
  creatorId: string
  creatorName: string
  community: CommunityRow
  viewer: Viewer
  role: Role
  db: Db
  paymentsReady: boolean
}

/**
 * The signed in creator and this community, for a page under
 * /app/community/<id>: null when they may not see it (not found, not theirs,
 * a plain member), or "no-session" when the session could not be read in
 * time. Cached for the request, so the layout and the page read it once
 * between them.
 */
export const creatorCommunityPage = cache(async (id: string): Promise<CreatorPageContext | "no-session" | null> => {
  /* The readable address (/app/community/<slug>) or the id it used to be; the layout sends the id on to the slug. */
  const key = isUuid(id) ? { id } : /^[a-z0-9-]{1,64}$/i.test(id) ? { slug: id } : null
  if (!key) return null
  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the session in the browser (lib/auth/page-user.ts). */
  if (!user) return "no-session"
  /* Round 40: working in a store as a member of its team (lib/team). The owner pays no read here: no cookie, no query. */
  const team = await teamStoreForRequest(user.id).catch(() => null)
  if (team) return permits(team.acting.permissions, "community") ? teamStaffContext(admin(), key, user.id, team.acting, team.store) : null
  return staffContext(admin(), key, user.id, creatorForRequest(user.id))
})


/** The creator row as lib/auth/request-scope.ts reads it: the columns the gate needs. */
type PageCreator = { id: string; display_name?: string | null; username?: string | null; slug?: string | null; stripe_account_id?: string | null; stripe_onboarding_status?: string | null; charges_enabled?: boolean | null }

/**
 * WHO IS ASKING, IN AS FEW ROUNDS AS THE ANSWER ALLOWS (round 32). Every
 * section page starts here, so its rounds are paid on every first visit of
 * every section. It used to ask viewerContext (./context.ts), the member
 * side's question: it reconciles paid access, looks up the creator account
 * and the products the person owns, and only then the owner's role choices:
 * five reads one after another for the owner, nine for an admin
 * (scripts/measure-community-admin-server.mjs). A staff page needs the role
 * and, for an admin or a moderator, what the owner lets them do. So:
 *
 *   round 1   the creator row and the community, at once
 *   owner     done: the role is the ownership. Their own member row, made
 *             again if it was ever lost, is checked beside the section's
 *             reads instead of before them.
 *   staff     round 2: their member row and the owner's role choices, at
 *             once
 *
 * Every write still goes through requireCreatorCommunity, which asks
 * viewerContext and reconciles, so nothing a route decides rests on this.
 */
export async function staffContext(db: Db, key: { id: string } | { slug: string }, userId: string, creatorRead: Promise<PageCreator | null>): Promise<CreatorPageContext | null> {
  const [creator, community] = await Promise.all([creatorRead, loadCommunity(db, key)])
  if (!creator || !community) return null
  const ownsIt = community.creator_id === creator.id || community.owner_user_id === userId
  let member: MemberRow | null = null
  let perms: RolePermissions | null = null
  if (ownsIt) {
    if (community.owner_user_id === userId) void keepOwnerRow(db, community.id, userId)
  } else {
    const [row, choices] = await Promise.all([memberOf(db, community.id, userId), rolePermissionsOf(db, community.id)])
    if (row?.status !== "active" || !row.role || row.role === "member") return null
    member = row
    perms = row.role === "admin" || row.role === "moderator" ? choices.perms : null
  }
  const role: Role = ownsIt ? "owner" : (member as MemberRow).role
  const viewer: Viewer = {
    userId,
    member,
    role: member?.role ?? "owner",
    active: true,
    status: member?.status ?? "active",
    tierId: member?.tier_id ?? null,
    ownedProductIds: [],
    level: member?.level ?? 1,
    points: member?.points ?? 0,
    isOwner: community.owner_user_id === userId,
    isCreatorAccount: community.creator_id === creator.id,
    banned: false,
    mutedUntil: null,
    perms,
  }
  return {
    userId,
    creatorId: creator.id,
    creatorName: creator.display_name || creator.username || creator.slug || "A creator",
    community,
    viewer,
    role,
    db,
    paymentsReady: Boolean(creator.stripe_account_id) && creator.stripe_onboarding_status === "connected" && creator.charges_enabled !== false,
  }
}

/** The owner's own member row, made again if it was ever lost (viewerContext did this before every page; now beside it). */
async function keepOwnerRow(db: Db, communityId: string, userId: string): Promise<void> {
  try {
    const row = await memberOf(db, communityId, userId)
    if (!row || row.role !== "owner" || row.status !== "active") await grantMembership(db, { communityId, userId, source: "owner", role: "owner", status: "active" })
  } catch (e) {
    console.error(`[communities] owner row ${userId} in ${communityId}: ${reasonOf(e)}`)
  }
}

/**
 * The first line of every section page: the context when this person may
 * take the section's action, a 404 when communities are off or they may
 * not, and null when the session is still being recovered (the page then
 * renders nothing and the /app gate takes over).
 */
export async function sectionPage(id: string, action: CommunityAction): Promise<CreatorPageContext | null> {
  if (!(await communitiesEnabled())) notFound()
  const ctx = await creatorCommunityPage(id)
  if (ctx === "no-session") return null
  if (!ctx || !can(ctx.role, action, ctx.viewer.perms)) notFound()
  return ctx
}

/** Whether the payments behind a paid community are connected, for a route that has the creator id. */
export async function creatorPaymentsReady(db: Db, creatorId: string): Promise<boolean> {
  const { data } = await db.from("creators").select("stripe_account_id, stripe_onboarding_status, charges_enabled").eq("id", creatorId).maybeSingle()
  return Boolean(data?.stripe_account_id) && data?.stripe_onboarding_status === "connected" && data?.charges_enabled !== false
}

/** The header every section shows; cached per request with the context, so the layout and the page share it. */
export const communityHead = cache(async (ctx: CreatorPageContext): Promise<CommunityHead> => {
  const c = ctx.community
  /* Round 31: who is signed in, for the Feed's writer (its picture and name), read beside the report count. */
  const archived = c.status === "archived" || Boolean(c.archived_at)
  const [openReports, people, pending, library] = await Promise.all([
    can(ctx.role, "review_reports", ctx.viewer.perms) ? openReportCount(ctx.db, c.id) : Promise.resolve(0),
    peopleOf(ctx.db, [ctx.userId]).catch(() => new Map<string, { name: string; avatarUrl: string | null }>()),
    /* Round 26: only an archived community can be on its way to being deleted (scheduling archives it). */
    archived ? pendingDeletions(ctx.db, [c.id]) : Promise.resolve(new Map<string, PendingDeletion>()),
    /* Round 39: whether the Library is on (part 278), for its tab, in the same round as the rest. */
    librarySettings(ctx.db, c.id).catch(() => ({ ready: false, enabled: false })),
  ])
  const deletion = pending.get(c.id)
  const person = people.get(ctx.userId)
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    tagline: c.tagline,
    logoUrl: c.logo_url,
    coverUrl: c.cover_url,
    status: c.status,
    access: c.access,
    visibility: c.visibility,
    memberCount: c.member_count,
    postCount: c.post_count,
    archived,
    suspended: Boolean(c.suspended_at) || c.status === "suspended",
    deleting: deletion ? { deleteAt: deletion.deleteAt, canKeep: deletion.canKeep && ctx.role === "owner" } : null,
    gamificationEnabled: c.gamification_enabled,
    classroomEnabled: c.classroom_enabled,
    eventsEnabled: c.events_enabled,
    libraryEnabled: library.enabled,
    role: ctx.role,
    can: allowedActions(ctx.role, ctx.viewer.perms),
    openReports,
    me: { userId: ctx.userId, name: person?.name ?? ctx.creatorName, avatarUrl: person?.avatarUrl ?? null },
  }
})

/* ── The list ───────────────────────────────────────────────────────────── */

/**
 * The communities this creator owns, and the ones they help run as an admin
 * or a moderator, as the list's cards draw them: cover, logo, name, state,
 * members, and the monthly revenue of a paid one for whoever may see its
 * analytics. What each card's menu offers is the person's own: the owner's
 * choices for their role (./creator-roles.ts) included. With them, the Free
 * plan's limit (lib/communities/plan-limit.ts) for New community.
 */
export async function loadCreatorCommunities(db: Db, creatorId: string, userId: string, opts: { team?: boolean } = {}): Promise<{ available: boolean; rows: CommunityListRow[]; limit: CommunityLimitView }> {
  const LIST_COLUMNS = "id, slug, name, tagline, logo_url, cover_url, status, access, visibility, member_count, post_count, created_at, archived_at, creator_id, owner_user_id, onboarding"
  /* Round 40: a store's team member (./team.ts) sees the store's communities, as an admin of each, and none they help run elsewhere. */
  const ownRole: Role = opts.team ? TEAM_COMMUNITY_ROLE : "owner"
  const [owned, staff, plan] = await Promise.all([
    db.from("communities").select(LIST_COLUMNS).eq("creator_id", creatorId).is("deleted_at", null).order("created_at", { ascending: false }).limit(100),
    opts.team ? Promise.resolve({ data: [] }) : db.from("community_members").select("community_id, role").eq("user_id", userId).eq("status", "active").in("role", ["admin", "moderator"]).limit(100),
    creatorSitePlan(creatorId),
  ])
  const limit: CommunityLimitView = { max: communityLimitFor(plan), owned: 0 }
  if (owned.error) {
    if (missing(owned.error)) return { available: false, rows: [], limit }
    console.error(`[communities] creator list: ${reasonOf(owned.error)}`)
  }
  type Lite = { id: string; slug: string; name: string; tagline: string | null; logo_url: string | null; cover_url: string | null; status: CommunityRow["status"]; access: CommunityRow["access"]; visibility: CommunityRow["visibility"]; member_count: number; post_count: number; created_at: string; archived_at: string | null; onboarding?: unknown }
  const rows = new Map<string, Lite & { role: Role }>()
  for (const c of (owned.data as Lite[] | null) ?? []) rows.set(c.id, { ...c, role: ownRole })
  const staffRoles = new Map(((staff.data as { community_id: string; role: Role }[] | null) ?? []).map((m) => [m.community_id, m.role]))
  const extra = [...staffRoles.keys()].filter((id) => !rows.has(id))
  if (extra.length) {
    const { data } = await db.from("communities").select(LIST_COLUMNS).in("id", extra).is("deleted_at", null)
    for (const c of (data as Lite[] | null) ?? []) rows.set(c.id, { ...c, role: staffRoles.get(c.id) ?? "moderator" })
  }
  const list = [...rows.values()]
  /* Round 26: a community whose deletion is scheduled says so on its card and takes no place on the plan (lib/communities/plan-limit.ts). */
  const [perms, pending] = await Promise.all([staffPermissionsFor(db, list.filter((c) => c.role !== "owner").map((c) => c.id)), pendingDeletions(db, list.filter((c) => c.status === "archived" || c.archived_at).map((c) => c.id))])
  limit.owned = list.filter((c) => (c.role === "owner" || (opts.team && c.role === ownRole)) && takesCommunitySlot({ deleting: pending.has(c.id) })).length
  const may = (c: Lite & { role: Role }, action: CommunityAction) => can(c.role, action, perms.get(c.id) ?? null)
  const paidIds = list.filter((c) => c.access === "paid").map((c) => c.id)
  const prices = new Map<string, string>()
  const mrr = new Map<string, { cents: number; currency: string }>()
  if (paidIds.length) {
    const { data: tiers } = await db.from("community_tiers").select("community_id, billing, product_id, is_default").in("community_id", paidIds).eq("kind", "paid").is("archived_at", null).order("position", { ascending: true })
    const tierRows = (tiers as { community_id: string; billing: string | null; product_id: string | null; is_default: boolean }[] | null) ?? []
    const first = new Map<string, { billing: string | null; product_id: string | null }>()
    for (const t of tierRows) if (!first.has(t.community_id) || t.is_default) first.set(t.community_id, t)
    const productIds = [...first.values()].map((t) => t.product_id).filter((x): x is string => Boolean(x))
    if (productIds.length) {
      const [plans, products] = await Promise.all([
        db.from("membership_plans").select("product_id, monthly_price_cents, yearly_price_cents").in("product_id", productIds),
        db.from("products").select("id, price_cents").in("id", productIds),
      ])
      const planOf = new Map(((plans.data as { product_id: string; monthly_price_cents: number | null; yearly_price_cents: number | null }[] | null) ?? []).map((p) => [p.product_id, p]))
      const priceOf = new Map(((products.data as { id: string; price_cents: number | null }[] | null) ?? []).map((p) => [p.id, p.price_cents]))
      for (const [cid, t] of first) {
        if (!t.product_id) continue
        const plan = planOf.get(t.product_id)
        const line = priceLine({ kind: "paid", billing: t.billing === "one_time" ? "one_time" : "recurring", monthlyCents: plan?.monthly_price_cents, yearlyCents: plan?.yearly_price_cents, priceCents: t.billing === "one_time" ? priceOf.get(t.product_id) : null })
        if (line) prices.set(cid, line)
      }
    }
    /* The money on a card, only for somebody who may see the community's analytics: one sum per paid community, from its recurring tiers. */
    const shown = list.filter((c) => c.access === "paid" && may(c, "view_analytics"))
    await Promise.all(
      shown.map(async (c) => {
        /* Round 41: the same products the community's Overview and Analytics count, archived tiers and products made for it too. */
        /* Round 43: in the currency its Analytics reports in, converted the same way (./membership-money communityMrr). */
        const m = await communityMrr(db, c.id, Date.now(), (c as { creator_id?: string | null }).creator_id ?? null)
        mrr.set(c.id, { cents: m.cents, currency: m.currency })
      }),
    )
  }
  return {
    available: true,
    limit,
    rows: list
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        tagline: c.tagline,
        logoUrl: c.logo_url,
        coverUrl: c.cover_url,
        coverPosition: coverPosition(pageLookOf(c.onboarding)) ?? null,
        status: c.status,
        access: c.access,
        visibility: c.visibility,
        memberCount: c.member_count,
        postCount: c.post_count,
        role: c.role,
        /* The two facts as two facts: "Invite only · $19/month" where a private community charges (../access-model.ts). */
        priceLine: accessWords(privacyOf(c), c.access === "paid" ? (prices.get(c.id) ?? null) : "Free"),
        createdAt: c.created_at,
        archived: c.status === "archived" || Boolean(c.archived_at),
        deleting: pending.has(c.id) ? { deleteAt: pending.get(c.id)!.deleteAt, canKeep: pending.get(c.id)!.canKeep && c.role === "owner" } : null,
        mrrCents: mrr.get(c.id)?.cents ?? null,
        currency: mrr.get(c.id)?.currency ?? "usd",
        can: { edit: may(c, "manage_settings"), analytics: may(c, "view_analytics"), archive: may(c, "archive"), duplicate: c.role === "owner" },
      })),
  }
}

/* ── Create ─────────────────────────────────────────────────────────────── */

/**
 * The create flow: the community with its spaces, levels and owner row
 * (create.ts), its description, and for a paid one the tier and the product
 * that sells it (tiers.ts). If the price cannot be saved the community is
 * taken back, so a paid community never exists without a price.
 */
export async function createFromFlow(db: Db, a: { creatorId: string; userId: string; input: CreateInput & Partial<Pick<WizardInput, "slug" | "spaceName" | "welcome">> }): Promise<Result<{ community: CommunityRow }>> {
  if (!(await communityRoom(db, a.creatorId)).ok) return no(402, PLAN_LIMIT_ERROR)
  const { access, visibility } = accessForType(a.input.type)
  const made = await createCommunity(db, {
    creatorId: a.creatorId,
    ownerUserId: a.userId,
    name: a.input.name,
    /* Round 33: the address the wizard asked for, as asked; none means made from the name, with -2, -3 when taken. */
    slug: a.input.slug ?? null,
    tagline: taglineFrom(a.input.description),
    access,
    visibility,
    logoUrl: ownPicture(a.input.logoUrl),
    coverUrl: ownPicture(a.input.coverUrl),
  })
  if ("error" in made) {
    if (made.error === "not_set_up") return no(503, "Communities are not set up on Storelib yet.")
    if (made.error === "invalid_name") return no(400, "Give your community a name up to 80 characters.", "name")
    if (made.error === "slug_taken") return no(409, "That address is taken.", "slug")
    if (made.error === "invalid_slug") return no(400, "That address cannot be used. Try another.", "slug")
    return no(500, "The community could not be made. Try again.")
  }
  /* Round 26: two tabs making one at the same moment both passed the room check; the later one is taken back here. */
  if (!(await madeWithinLimit(db, a.creatorId, made.community.id))) {
    await db.from("communities").delete().eq("id", made.community.id)
    return no(402, PLAN_LIMIT_ERROR)
  }
  let community = made.community
  if (a.input.description) {
    const html = sanitizeDescription(textToHtml(a.input.description))
    const { data } = await db.from("communities").update({ description: html }).eq("id", community.id).select(COMMUNITY_COLUMNS).single()
    if (data) community = data as CommunityRow
  }
  if (a.input.type === "paid" && a.input.price) {
    const tier = await createPaidTier(db, { creatorId: a.creatorId, community, name: "Members", interval: a.input.price.interval, cents: a.input.price.cents, actorId: a.userId })
    if ("error" in tier) {
      await db.from("communities").delete().eq("id", community.id)
      return no(tier.status, tier.error, "price")
    }
  }
  /*
    ROUND 33, THE FIRST SPACE AND THE WELCOME: General renamed as the wizard asked, and the welcome post in it, the owner's,
    pinned. Neither ever fails the create: a community without them is still a whole community.
  */
  const { data: spaceRow } = await db.from("community_spaces").select("id, name").eq("community_id", community.id).eq("slug", "general").maybeSingle()
  const general = spaceRow as { id: string; name: string } | null
  if (general && a.input.spaceName && a.input.spaceName !== general.name) await db.from("community_spaces").update({ name: a.input.spaceName }).eq("id", general.id)
  if (general && a.input.welcome) {
    const posted = await createCreatorPost(db, { community, role: "owner", actorId: a.userId, spaceId: general.id, title: a.input.welcome.title, body: a.input.welcome.body, pin: true })
    if ("error" in posted) console.error(`[communities] create ${community.slug}: the welcome post was not written: ${posted.error}`)
  }
  return { ok: true, community }
}

/* ── Overview ───────────────────────────────────────────────────────────── */

async function count(q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count: n, error } = await q
  return error ? 0 : (n ?? 0)
}

/** Monthly recurring revenue of the memberships that sell this community, by the one rule and in the one currency its Analytics uses (./membership-money mrrOfRows). */
async function monthlyRevenue(db: Db, productIds: string[], creatorId: string | null | undefined): Promise<{ cents: number; currency: string }> {
  const m = await mrrOfRows(db, (await membershipsOf(db, productIds, { open: true })) ?? [], Date.now(), creatorId)
  return { cents: m.cents, currency: m.currency }
}

export async function loadOverview(ctx: CreatorPageContext): Promise<OverviewData> {
  const { db, community: c } = ctx
  const now = Date.now()
  const d30 = sinceIso(30, now)
  const d7 = sinceIso(7, now)
  const members = () => db.from("community_members").select("id", { count: "exact", head: true }).eq("community_id", c.id)
  /* Round 32: the newest posts and members, read beside the figures (./overview-activity). */
  const recentLines = overviewActivity(db, c)
  /*
    ONE ROUND, NOT THREE (round 32): the products that sell it were read first and the unsellable events last, each a
    round of its own before or after the figures. Now only the money waits on the products; everything else goes at once.
  */
  const recurringRead = communitySellingProducts(db, c.id).then((p) => p.recurring)
  /* Round 33: the setup list's own facts (members who came without an invite, staff posts, the app, this person's skips), read beside the figures. */
  const staffSees = ctx.role === "owner" || ctx.role === "admin"
  const extrasRead = staffSees ? setupExtras(db, c, ctx.userId) : null
  const [active30d, new30d, paidMembers, pending, posts7d, comments7d, openReports, revenue, cancellations, invites, courses, events, anyPost, upcomingRows, sells, pricedEvents] = await Promise.all([
    count(members().eq("status", "active").gte("last_active_at", d30)),
    count(members().eq("status", "active").gte("joined_at", d30)),
    count(members().eq("status", "active").in("source", [...PAID_SOURCES])),
    count(members().eq("status", "pending")),
    count(db.from("community_feed_posts").select("id", { count: "exact", head: true }).eq("community_id", c.id).eq("status", "published").gte("created_at", d7)),
    count(db.from("community_feed_comments").select("id", { count: "exact", head: true }).eq("community_id", c.id).eq("status", "published").gte("created_at", d7)),
    openReportCount(db, c.id),
    recurringRead.then((recurring) => monthlyRevenue(db, recurring, c.creator_id ?? ctx.creatorId)),
    recurringRead.then((recurring) => (recurring.length ? count(db.from("memberships").select("id", { count: "exact", head: true }).in("product_id", recurring).gte("canceled_at", d30)) : 0)),
    inviteCount(db, c.id),
    count(db.from("community_courses").select("product_id", { count: "exact", head: true }).eq("community_id", c.id)),
    count(db.from("community_events").select("id", { count: "exact", head: true }).eq("community_id", c.id)),
    count(db.from("community_feed_posts").select("id", { count: "exact", head: true }).eq("community_id", c.id)),
    db.from("community_events").select("id, title, starts_at, ends_at, timezone, going_count, capacity, kind").eq("community_id", c.id).eq("status", "scheduled").gte("starts_at", nowIso(now - 60 * 60_000)).order("starts_at", { ascending: true }).limit(3),
    count(db.from("community_tiers").select("id", { count: "exact", head: true }).eq("community_id", c.id).eq("kind", "paid")),
    /* AN EVENT WITH A PRICE NOBODY CAN PAY (round 14): said once, where the creator will see it. */
    ctx.paymentsReady ? Promise.resolve(0) : pricedEventCount(db, c.id),
  ])
  const base = `/app/community/${c.slug}`
  const upcoming: UpcomingEvent[] = ((upcomingRows.data as { id: string; title: string; starts_at: string; ends_at: string | null; timezone: string; going_count: number; capacity: number | null; kind: UpcomingEvent["kind"] }[] | null) ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    timezone: e.timezone,
    goingCount: e.going_count,
    capacity: e.capacity,
    kind: e.kind,
  }))
  return {
    figures: {
      members: c.member_count,
      active30d,
      new30d,
      paidMembers,
      mrrCents: revenue.cents,
      currency: revenue.currency,
      cancellations30d: cancellations,
      posts7d,
      comments7d,
      openReports,
      pendingRequests: pending,
    },
    upcoming,
    recent: await recentLines,
    sells: sells > 0,
    pricedEventsUnsellable: pricedEvents,
    publicUrl: `/community/${c.slug}`,
    /*
      ROUND 33: the setup list (lib/communities/setup-checklist.ts): set up the group, the rules, three people, the first
      post, the app, the intro, and the steps the Overview always had, each ticked from rows; what is left or not skipped
      is what this card shows.
    */
    steps:
      staffSees && extrasRead
        ? stepsLeft(
            setupChecklist(
              factsFrom(
                c,
                {
                  published: c.status === "published",
                  paid: c.access === "paid",
                  paymentsReady: ctx.paymentsReady,
                  members: c.member_count,
                  invites,
                  posts: anyPost,
                  courses,
                  events,
                  customized: Array.isArray(c.benefits) && c.benefits.length > 0,
                  rules: Array.isArray(c.rules) ? c.rules.length : 0,
                  classroomEnabled: c.classroom_enabled,
                  eventsEnabled: c.events_enabled,
                  pricedEventsUnsellable: pricedEvents,
                },
                await extrasRead,
                { invitesSent: invites, isOwner: ctx.role === "owner" },
              ),
              base,
            ),
          )
        : [],
  }
}

/* ── Settings ───────────────────────────────────────────────────────────── */

export async function loadLevels(db: Db, communityId: string): Promise<LevelView[]> {
  const { data } = await db.from("community_levels").select("level, name, min_points, reward").eq("community_id", communityId).order("level", { ascending: true }).limit(20)
  return ((data as { level: number; name: string; min_points: number; reward: string | null }[] | null) ?? []).map((l) => ({ level: l.level, name: l.name, minPoints: l.min_points, reward: l.reward }))
}

export async function loadBadges(db: Db, communityId: string): Promise<BadgeView[]> {
  const { data } = await db.from("community_badges").select("id, name, description, icon").eq("community_id", communityId).order("created_at", { ascending: true }).limit(50)
  const rows = (data as { id: string; name: string; description: string | null; icon: string | null }[] | null) ?? []
  const counts = await Promise.all(rows.map((b) => count(db.from("community_member_badges").select("user_id", { count: "exact", head: true }).eq("badge_id", b.id))))
  return rows.map((b, i) => ({ ...b, awarded: counts[i] }))
}

export async function loadSettings(ctx: CreatorPageContext): Promise<SettingsData> {
  const { db, community: c } = ctx
  const owner = ctx.role === "owner"
  const [tiers, products, me, levels, badges, gallery, roles, policies, pageFields] = await Promise.all([
    loadTiers(db, c.id),
    can(ctx.role, "manage_pricing") ? pickableProducts(db, ctx.creatorId) : Promise.resolve([] as PickProduct[]),
    memberOf(db, c.id, ctx.userId),
    loadLevels(db, c.id),
    loadBadges(db, c.id),
    loadGallery(db, c.id),
    owner ? rolePermissionsOf(db, c.id) : Promise.resolve(null),
    owner ? loadPolicies(db, c.id) : Promise.resolve(null),
    /* Round 26: the short description and the member links (run-now part 220), read apart so the row reads as before without it. */
    loadPageFields(db, c.id),
  ])
  return {
    description: htmlToText(c.description),
    /* Round 33: the stored HTML, for the Page editor's rich text field. */
    descriptionHtml: c.description ?? "",
    pageLook: pageLookOf(c.onboarding),
    legalLinks: legalLinksOf(c.onboarding),
    tagline: c.tagline,
    summary: pageFields.summary,
    memberLinks: pageFields.memberLinks,
    pageFieldsReady: pageFields.ready,
    category: c.category,
    rules: Array.isArray(c.rules) ? c.rules : [],
    faq: Array.isArray(c.faq) ? c.faq : [],
    benefits: Array.isArray(c.benefits) ? c.benefits : [],
    links: Array.isArray(c.links) ? c.links : [],
    onboarding: c.onboarding && typeof c.onboarding === "object" ? c.onboarding : {},
    discoveryEnabled: c.discovery_enabled,
    platformHidden: c.platform_hidden,
    approvalRequired: c.approval_required,
    directoryEnabled: c.directory_enabled,
    chatEnabled: c.chat_enabled,
    seoTitle: c.seo_title,
    seoDescription: c.seo_description,
    tiers,
    products,
    paymentsReady: ctx.paymentsReady,
    myNotify: { level: me?.notify_level ?? "important", emailAnnouncements: me?.email_announcements ?? true, emailEvents: me?.email_events ?? true },
    levels,
    badges,
    gallery: gallery.items,
    galleryReady: gallery.ready,
    galleryVideos: gallery.videos,
    roles: roles ? { ready: roles.ready, ...rolesView(roles.perms) } : null,
    policies,
  }
}

const SETTING_FLAGS = {
  discoveryEnabled: "discovery_enabled",
  approvalRequired: "approval_required",
  directoryEnabled: "directory_enabled",
  classroomEnabled: "classroom_enabled",
  eventsEnabled: "events_enabled",
  chatEnabled: "chat_enabled",
  gamificationEnabled: "gamification_enabled",
} as const

/** The permission each settings field needs: access (who may join) is money, so the owner's; the rest is settings. */
export function settingNeeds(field: string): CommunityAction {
  if (field === "type") return "manage_pricing"
  if (field === "gamificationEnabled") return "manage_gamification"
  if (field === "slug") return "manage_settings"
  return "manage_settings"
}

/**
 * Saves whatever settings the body carries, each checked on its own; a
 * field that is not there is left as it is. Answers the community as it now
 * is, or the first field that was refused.
 */
export async function updateSettings(db: Db, a: { community: CommunityRow; role: Role; perms?: RolePermissions | null; actorId: string; creatorId: string; body: Record<string, unknown> }): Promise<Result<{ community: CommunityRow }>> {
  const b = a.body
  const c = a.community
  const patch: Record<string, unknown> = {}
  const changed: string[] = []
  for (const key of Object.keys(b)) {
    if (!can(a.role, settingNeeds(key), a.perms)) return no(403, "forbidden", key)
  }
  if (b.name !== undefined) {
    const name = typeof b.name === "string" ? b.name.replace(/\s+/g, " ").trim() : ""
    if (!name || name.length > LENGTHS.communityName.max) return no(400, `A name is 1 to ${LENGTHS.communityName.max} characters.`, "name")
    patch.name = name
  }
  if (b.tagline !== undefined) {
    const t = typeof b.tagline === "string" ? b.tagline.replace(/\s+/g, " ").trim() : ""
    if (t.length > LENGTHS.tagline.max) return no(400, `A tagline is up to ${LENGTHS.tagline.max} characters.`, "tagline")
    patch.tagline = t || null
  }
  if (b.description !== undefined) {
    const text = typeof b.description === "string" ? b.description.slice(0, 10_000) : ""
    patch.description = text.trim() ? sanitizeDescription(textToHtml(text)) : null
  }
  /*
    ROUND 33: THE DESCRIPTION AS THE PRODUCT EDITOR WRITES IT. The Page editor sends the rich text field's HTML
    (components/app/rich-text-editor.tsx: headings, lists, links, pictures, emoji), cleaned here by the same allow list
    a product description is (lib/rich-text/sanitize.ts) and refused over the same size. A field with nothing in it
    (no words, no picture) is no description.
  */
  if (b.descriptionHtml !== undefined) {
    const html = typeof b.descriptionHtml === "string" ? b.descriptionHtml : ""
    const tooLong = descriptionTooLong(html)
    if (tooLong) return no(400, tooLong, "descriptionHtml")
    const clean = html.trim() ? sanitizeDescription(html) : ""
    patch.description = clean && (htmlToText(clean) || /<(img|iframe|hr)\b/i.test(clean)) ? clean : null
  }
  if (b.slug !== undefined) {
    const slug = typeof b.slug === "string" ? b.slug.trim().toLowerCase() : ""
    if (!validSlug(slug)) return no(400, "An address is 3 to 48 lowercase letters, numbers and single hyphens.", "slug")
    if (slug !== c.slug) {
      const { data: taken } = await db.from("communities").select("id").eq("slug", slug).maybeSingle()
      if (taken) return no(409, "That address is taken.", "slug")
      /* Another community's old address stays theirs, so a link shared to it never opens this one (./slug-history.ts). */
      if (await slugHeldByAnother(db, slug, c.id)) return no(409, "That address is taken.", "slug")
      /*
        THE OLD ADDRESS KEEPS WORKING. The database records it as this
        community's in the same step as the change (run-now part 94, a trigger
        on communities), and every page under it answers a permanent redirect
        to the new one, the rest of the path and the query kept.
      */
      patch.slug = slug
    }
  }
  for (const key of ["logoUrl", "coverUrl"] as const) {
    if (b[key] === undefined) continue
    if (b[key] === null || b[key] === "") patch[key === "logoUrl" ? "logo_url" : "cover_url"] = null
    else {
      const url = ownPicture(b[key])
      if (!url) return no(400, "Upload the picture again.", key)
      patch[key === "logoUrl" ? "logo_url" : "cover_url"] = url
    }
  }
  /* One of the ids Explore's pills use (lib/explore/communities-mode), so the community is found under its pill. */
  if (b.category !== undefined) patch.category = communityCategoryId(b.category)
  if (b.rules !== undefined) {
    const r = checkRules(b.rules)
    if ("error" in r) return no(400, r.error, r.field)
    patch.rules = r.value
  }
  if (b.faq !== undefined) {
    const r = checkFaq(b.faq)
    if ("error" in r) return no(400, r.error, r.field)
    patch.faq = r.value
  }
  if (b.benefits !== undefined) {
    const r = checkBenefits(b.benefits)
    if ("error" in r) return no(400, r.error, r.field)
    patch.benefits = r.value
  }
  if (b.links !== undefined) {
    const r = checkLinks(b.links)
    if ("error" in r) return no(400, r.error, r.field)
    patch.links = r.value
  }
  /* Checked with the rest, before anything is written; saved on its own below (./gallery.ts). */
  let gallery: GalleryItem[] | null = null
  if (b.gallery !== undefined) {
    const r = await checkGalleryForCommunity(db, c.id, b.gallery)
    if ("error" in r) return no(400, r.error, r.field)
    gallery = r.value
    /* A cover video's still is the cover picture, so every place that draws a still keeps drawing one (./gallery.ts). */
    const cover = coverAfterGallery(c.cover_url ?? null, patch.cover_url !== undefined, gallery)
    if (cover !== undefined) patch.cover_url = cover
  }
  if (b.onboarding !== undefined) {
    const o = (b.onboarding && typeof b.onboarding === "object" ? b.onboarding : {}) as Record<string, unknown>
    const welcome = typeof o.welcome === "string" ? o.welcome.trim().slice(0, 2000) : ""
    /* The look lives beside the welcome steps, so saving one never drops the other. */
    const look = communityAppearance(c.onboarding)
    /* Round AF: the welcome's heading, video and button, and popup or card. A video link Storelib cannot embed is refused, never kept to break later. */
    const videoUrl = typeof o.videoUrl === "string" ? o.videoUrl.trim().slice(0, 500) : ""
    if (videoUrl && !welcomeVideoSrc(videoUrl)) return no(400, "Use a YouTube, Vimeo or Loom link for the welcome video.", "videoUrl")
    const extra = {
      title: typeof o.title === "string" ? o.title.trim().slice(0, 80) : "",
      videoUrl,
      button: typeof o.button === "string" ? o.button.trim().slice(0, 30) : "",
      style: o.style === "popup" ? ("popup" as const) : ("card" as const),
    }
    patch.onboarding = { ...keptSafety(c.onboarding), ...keptLook(c.onboarding), ...keptLegal(c.onboarding), ...(look === "dark" ? { appearance: "dark" as const } : {}), enabled: o.enabled === true, welcome, askIntro: o.askIntro !== false, showRules: o.showRules !== false, ...extra }
  }
  /* Round 33: the cover's focus and the join button (../page-look.ts), beside the welcome steps, everything else kept. */
  if (b.pageLook !== undefined) {
    /* Round 26: never a price, a currency or a billing period of the creator's own on the button, nor free on a page that charges. */
    const refused = joinWordsRefusal(b.pageLook, c.access)
    if (refused) return no(400, refused.error, refused.field)
    patch.onboarding = withPageLook(patch.onboarding ?? c.onboarding, cleanLook(b.pageLook))
  }
  /* Round 27: the community's own Privacy and Terms pages (../legal-links.ts), beside the look; each checked, an empty one is Storelib's. */
  if (b.legalLinks !== undefined) {
    const raw = b.legalLinks && typeof b.legalLinks === "object" ? (b.legalLinks as Record<string, unknown>) : {}
    const next = legalLinksOf(patch.onboarding ?? c.onboarding)
    for (const kind of LEGAL_KINDS) {
      if (raw[kind] === undefined) continue
      const checked = legalUrl(raw[kind])
      if ("problem" in checked) return no(400, checked.problem === "long" ? "That address is too long." : kind === "privacy" ? "Enter the full address of your privacy policy, starting with https://" : "Enter the full address of your terms, starting with https://", `legalLinks.${kind}`)
      next[kind] = checked.url
    }
    patch.onboarding = withLegalLinks(patch.onboarding ?? c.onboarding, next)
  }
  if (b.appearance !== undefined) {
    if (b.appearance !== "light" && b.appearance !== "dark") return no(400, "Pick a look.", "appearance")
    patch.onboarding = withAppearance(patch.onboarding ?? c.onboarding, b.appearance)
  }
  /* Slow mode lives beside the welcome steps (./safety.ts), so no column is needed. */
  if (b.slowMode !== undefined) {
    const seconds = slowModeChoice(b.slowMode)
    if (seconds === null) return no(400, "Pick a slow mode.", "slowMode")
    patch.onboarding = withSlowMode(patch.onboarding ?? c.onboarding, seconds)
  }
  for (const [key, column] of Object.entries(SETTING_FLAGS)) {
    if (b[key] === undefined) continue
    if (typeof b[key] !== "boolean") return no(400, "On or off.", key)
    patch[column] = b[key]
  }
  /* Round 26: the short description and the member links (./page-fields.ts, run-now part 220). */
  {
    const r = pageFieldsPatch(b)
    if ("error" in r) return no(400, r.error, r.field)
    Object.assign(patch, r.patch)
  }
  if (b.seoTitle !== undefined) {
    const t = typeof b.seoTitle === "string" ? b.seoTitle.trim() : ""
    if (t.length > LENGTHS.seoTitle.max) return no(400, `Up to ${LENGTHS.seoTitle.max} characters.`, "seoTitle")
    patch.seo_title = t || null
  }
  if (b.seoDescription !== undefined) {
    const t = typeof b.seoDescription === "string" ? b.seoDescription.trim() : ""
    if (t.length > LENGTHS.seoDescription.max) return no(400, `Up to ${LENGTHS.seoDescription.max} characters.`, "seoDescription")
    patch.seo_description = t || null
  }
  if (b.visibility !== undefined) {
    if (!isOneOf(COMMUNITY_VISIBILITIES, b.visibility)) return no(400, "Pick who can find it.", "visibility")
    patch.visibility = b.visibility
  }
  /*
    WHO CAN GET IN, AND WHAT IT COSTS. Settings sends the two facts apart
    (privacy, pricing), which is what lets a private community charge; the
    create flow still sends one `type`, and an older screen may too, so both
    are read and both land in the same two columns
    (lib/communities/access-model.ts accessColumnsFor).
  */
  if (b.privacy !== undefined || b.pricing !== undefined || b.type !== undefined) {
    const asked =
      b.privacy !== undefined || b.pricing !== undefined
        ? checkAccessChoice(b, accessChoiceOf(c))
        : (() => {
            const type = b.type
            if (type !== "free" && type !== "paid" && type !== "private") return { ok: false as const, error: "Pick who can join.", field: "type" }
            return { ok: true as const, value: accessChoiceOf(accessForType(type)) }
          })()
    if ("error" in asked) return no(400, asked.error, asked.field)
    if (asked.value.pricing === "paid") {
      const { count: paid } = await db.from("community_tiers").select("id", { count: "exact", head: true }).eq("community_id", c.id).eq("kind", "paid").is("archived_at", null)
      if (!paid) return no(409, "Add a paid tier with a price first.", "pricing")
    } else {
      await ensureFreeDefault(db, c.id)
    }
    const { access, visibility } = accessColumnsFor(asked.value.privacy, asked.value.pricing)
    patch.access = access
    if (b.visibility === undefined) patch.visibility = visibility
  }
  /* The gallery first: before part 85 has run it answers "run the update", and nothing else is half saved. */
  if (gallery) {
    const g = await saveGallery(db, c.id, gallery)
    if ("error" in g) return no(g.status, g.error, "gallery")
    changed.push("gallery")
  }
  if (Object.keys(patch).length === 0 && !gallery) return { ok: true, community: c }
  for (const k of Object.keys(patch)) changed.push(k)
  let saved: CommunityRow = c
  if (Object.keys(patch).length) {
    const { data, error } = await db.from("communities").update(patch).eq("id", c.id).select(COMMUNITY_COLUMNS).single()
    if (error) {
      if (error.code === "23505") return no(409, "That address is taken.", "slug")
      if (missing(error) && writesPageFields(patch)) return no(409, PAGE_FIELDS_NOT_READY, "summary" in patch ? "summary" : "memberLinks")
      console.error(`[communities] settings ${c.id}: ${reasonOf(error)}`)
      return no(500, "The settings could not be saved. Try again.")
    }
    saved = data as CommunityRow
  }
  await audit(db, {
    communityId: c.id,
    actorId: a.actorId,
    actorKind: "member",
    action: "community.settings_changed",
    targetType: "community",
    targetId: c.id,
    targetLabel: (patch.name as string | undefined) ?? c.name,
    detail: { fields: changed },
  })
  return { ok: true, community: saved }
}

/** A free or invite only community joins on a free tier: there is one, and it is the default. */
async function ensureFreeDefault(db: Db, communityId: string): Promise<void> {
  const { data } = await db.from("community_tiers").select("id, kind, is_default, archived_at").eq("community_id", communityId).limit(50)
  const rows = (data as { id: string; kind: string; is_default: boolean; archived_at: string | null }[] | null) ?? []
  let free = rows.find((t) => t.kind === "free" && !t.archived_at)
  if (!free) {
    const { data: made } = await db.from("community_tiers").insert({ community_id: communityId, name: "Members", kind: "free", is_default: false, position: rows.length }).select("id, kind, is_default, archived_at").single()
    if (!made) return
    free = made
  }
  if (free && !free.is_default) {
    await db.from("community_tiers").update({ is_default: false }).eq("community_id", communityId).eq("is_default", true)
    await db.from("community_tiers").update({ is_default: true }).eq("id", free.id)
  }
}

/**
 * Publishes or takes back to a draft. A paid community needs a live paid
 * tier to publish. The tiers' products go on and off sale with it.
 */
export async function setPublished(db: Db, a: { community: CommunityRow; actorId: string; publish: boolean }): Promise<Result<{ community: CommunityRow }>> {
  const c = a.community
  if (c.suspended_at || c.status === "suspended") return no(409, "Storelib suspended this community. Contact support.")
  if (c.status === "archived") return no(409, "Bring it back from the archive first.")
  if (a.publish && c.access === "paid") {
    const { count: paid } = await db.from("community_tiers").select("id", { count: "exact", head: true }).eq("community_id", c.id).eq("kind", "paid").is("archived_at", null)
    if (!paid) return no(409, "Add a price before you publish a paid community.")
  }
  const status = a.publish ? "published" : "draft"
  const { data, error } = await db.from("communities").update({ status }).eq("id", c.id).select(COMMUNITY_COLUMNS).single()
  if (error) return no(500, "That did not save. Try again.")
  await syncTierProducts(db, data as CommunityRow, a.publish)
  await audit(db, { communityId: c.id, actorId: a.actorId, actorKind: "member", action: a.publish ? "community.published" : "community.unpublished", targetType: "community", targetId: c.id, targetLabel: c.name })
  /* The owner's followers hear about a new community once (lib/notifications/fanout.ts; never throws). */
  if (a.publish) await queueCommunityFanout(db, { communityId: c.id, ownerUserId: (data as CommunityRow).owner_user_id ?? c.owner_user_id })
  return { ok: true, community: data as CommunityRow }
}

/** Archived: kept to read, nothing new; off sale. Brought back as a draft. */
export async function setArchived(db: Db, a: { community: CommunityRow; actorId: string; archived: boolean }): Promise<Result<{ community: CommunityRow }>> {
  const c = a.community
  /* Round 33: a community on its way to being deleted comes back through Keep (./community-deletion.ts undoDeletion), which renews its memberships too. */
  if (!a.archived && (await deletionScheduled(db, c.id))) return no(409, "It is being deleted. Press Keep the community first.")
  const patch = a.archived ? { status: "archived", archived_at: nowIso() } : { status: "draft", archived_at: null }
  const { data, error } = await db.from("communities").update(patch).eq("id", c.id).select(COMMUNITY_COLUMNS).single()
  if (error) return no(500, "That did not save. Try again.")
  await syncTierProducts(db, data as CommunityRow, false)
  await audit(db, { communityId: c.id, actorId: a.actorId, actorKind: "member", action: a.archived ? "community.archived" : "community.unarchived", targetType: "community", targetId: c.id, targetLabel: c.name })
  return { ok: true, community: data as CommunityRow }
}

/**
 * Deleted, after the name is typed back.
 *
 * NOBODY PAYS: at once, as it always was: hidden everywhere (deleted_at),
 * archived, off sale. Rows, posts and orders are kept.
 *
 * SOMEBODY PAYS (round 33, the owner: "do it the way big platforms do"):
 * it was refused here with "Archive it instead". Now every membership is
 * stopped through Stripe and the community is deleted when the last paid
 * period ends, or now with prorated refunds when the owner chose that
 * (./community-deletion.ts scheduleDeletion, `mode`).
 */
export async function deleteCommunity(db: Db, a: { community: CommunityRow; actorId: string; confirm: unknown; mode?: unknown }, deps?: DeletionDeps): Promise<Result<{ deleted: boolean; scheduled: ScheduledDeletionView | null }>> {
  const c = a.community
  const typed = typeof a.confirm === "string" ? a.confirm.trim() : ""
  if (typed !== c.name.trim() && typed !== c.slug) return no(400, "Type the community's name exactly to delete it.", "confirm")
  /* Round 51: tickets sold for an event still to come are refunded by cancelling it first; nothing changes until then. */
  const ticketed = await ticketedEventsAhead(db, c.id)
  if (ticketed.length) return no(409, ticketsHoldText(ticketed))
  const paid = await paidMemberships(db, c.id)
  if (paid.length > 0) return scheduleDeletion(db, { community: c, actorId: a.actorId, mode: a.mode, paid }, deps)
  if (await deletionScheduled(db, c.id)) return no(409, "It is already being deleted. Keep it first to delete it another way.")
  /* Round 26, a double tap or two tabs: only the request that finds it not yet deleted deletes it and writes the log. */
  const { data: gone, error } = await db.from("communities").update({ status: "archived", archived_at: c.archived_at ?? nowIso(), deleted_at: nowIso() }).eq("id", c.id).is("deleted_at", null).select("id")
  if (error) return no(500, "That did not save. Try again.")
  if (!Array.isArray(gone) || gone.length !== 1) return no(409, "It has already been deleted.")
  await syncTierProducts(db, { ...c, status: "archived" }, false)
  await audit(db, { communityId: c.id, actorId: a.actorId, actorKind: "member", action: "community.deleted", targetType: "community", targetId: c.id, targetLabel: c.name })
  /* Round 51: out of everybody's bell, and the engines and stored copies told (./community-gone.ts). */
  await communityGone(db, c, c.status)
  return { ok: true, deleted: true, scheduled: null }
}

/** The owner's own notification choices in this community (their member row). */
export async function updateMyNotify(db: Db, a: { communityId: string; userId: string; body: Record<string, unknown> }): Promise<Result> {
  const patch: Record<string, unknown> = {}
  if (a.body.level !== undefined) {
    if (!isOneOf(NOTIFY_LEVELS, a.body.level)) return no(400, "Pick what you hear about.", "level")
    patch.notify_level = a.body.level
  }
  if (typeof a.body.emailAnnouncements === "boolean") patch.email_announcements = a.body.emailAnnouncements
  if (typeof a.body.emailEvents === "boolean") patch.email_events = a.body.emailEvents
  if (Object.keys(patch).length === 0) return { ok: true }
  const { error } = await db.from("community_members").update(patch).eq("community_id", a.communityId).eq("user_id", a.userId)
  if (error) return no(500, "That did not save. Try again.")
  return { ok: true }
}

/** The tiers and levels an access rule can name, for the editors. */
export async function ruleOptions(db: Db, communityId: string): Promise<{ tiers: { id: string; name: string }[]; levels: { level: number; name: string }[] }> {
  const [tiers, levels] = await Promise.all([
    db.from("community_tiers").select("id, name").eq("community_id", communityId).is("archived_at", null).order("position", { ascending: true }).limit(50),
    db.from("community_levels").select("level, name").eq("community_id", communityId).order("level", { ascending: true }).limit(20),
  ])
  return { tiers: (tiers.data as { id: string; name: string }[] | null) ?? [], levels: (levels.data as { level: number; name: string }[] | null) ?? [] }
}

/* ── Spaces ─────────────────────────────────────────────────────────────── */

/** Access rules keep only this community's own tiers. */
async function ownRule(db: Db, communityId: string, rule: AccessRuleJson): Promise<AccessRuleJson> {
  const r = parseAccessRule(rule)
  if (r.tierIds?.length) {
    const { data } = await db.from("community_tiers").select("id").eq("community_id", communityId).in("id", r.tierIds)
    const ok = new Set(((data as { id: string }[] | null) ?? []).map((t) => t.id))
    r.tierIds = r.tierIds.filter((id) => ok.has(id))
    if (!r.tierIds.length) delete r.tierIds
  }
  delete r.productIds
  return r
}

export async function loadSpaces(db: Db, communityId: string): Promise<SpaceView[]> {
  const { data, error } = await db.from("community_spaces").select(SPACE_COLUMNS).eq("community_id", communityId).order("position", { ascending: true }).limit(MAX_SPACES + 10)
  if (error) return []
  const rows = (data as SpaceRow[] | null) ?? []
  /* A chat space's messages are counted beside its posts, not in a round after them (round 32), and used when it has no posts. */
  const [posts, chats] = await Promise.all([
    Promise.all(rows.map((s) => count(db.from("community_feed_posts").select("id", { count: "exact", head: true }).eq("space_id", s.id)))),
    Promise.all(rows.map((s) => (s.kind === "chat" ? count(db.from("community_messages").select("id", { count: "exact", head: true }).eq("space_id", s.id)) : Promise.resolve(0)))),
  ])
  const messages = rows.map((_, i) => (posts[i] === 0 ? chats[i] : 0))
  return rows.map((s, i) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    icon: s.icon,
    kind: s.kind,
    position: s.position,
    postRole: s.post_role,
    commentsEnabled: s.comments_enabled,
    viewAccess: parseAccessRule(s.view_access),
    archived: Boolean(s.archived_at),
    posts: posts[i] + messages[i],
  }))
}

export async function createSpace(db: Db, a: { communityId: string; actorId: string; input: SpaceInput }): Promise<Result<{ space: SpaceView }>> {
  const { data: existing } = await db.from("community_spaces").select("slug, position").eq("community_id", a.communityId).limit(MAX_SPACES + 10)
  const rows = (existing as { slug: string; position: number }[] | null) ?? []
  if (rows.length >= MAX_SPACES) return no(400, `A community has up to ${MAX_SPACES} spaces.`)
  let base = slugify(a.input.name, 40)
  if (!validSpaceSlug(base)) base = "space"
  const taken = new Set(rows.map((r) => r.slug))
  let slug = base
  for (let n = 2; taken.has(slug); n++) slug = slugWithSuffix(base, n)
  const { data, error } = await db
    .from("community_spaces")
    .insert({
      community_id: a.communityId,
      slug,
      name: a.input.name,
      description: a.input.description,
      icon: a.input.icon,
      kind: a.input.kind,
      position: rows.reduce((m, r) => Math.max(m, r.position + 1), 0),
      view_access: await ownRule(db, a.communityId, a.input.viewAccess),
      post_role: a.input.postRole,
      comments_enabled: a.input.commentsEnabled,
    })
    .select(SPACE_COLUMNS)
    .single()
  if (error || !data) return no(500, "The space could not be made. Try again.")
  const s = data as SpaceRow
  await audit(db, { communityId: a.communityId, actorId: a.actorId, actorKind: "member", action: "space.created", targetType: "space", targetId: s.id, targetLabel: s.name, detail: { kind: s.kind } })
  return { ok: true, space: { id: s.id, slug: s.slug, name: s.name, description: s.description, icon: s.icon, kind: s.kind, position: s.position, postRole: s.post_role, commentsEnabled: s.comments_enabled, viewAccess: parseAccessRule(s.view_access), archived: false, posts: 0 } }
}

async function spaceOf(db: Db, communityId: string, spaceId: string): Promise<SpaceRow | null> {
  if (!isUuid(spaceId)) return null
  const { data } = await db.from("community_spaces").select(SPACE_COLUMNS).eq("id", spaceId).eq("community_id", communityId).maybeSingle()
  return (data as SpaceRow | null) ?? null
}

/**
 * Whether anything was written in a space: its first post and its first message, asked side by side. Only the answer
 * "any" is wanted, so neither table is counted (a chat space can hold a hundred thousand messages, and an exact count
 * read every one of them, one table after the other). A read that fails says "used", so a space is never deleted on a
 * question that went unanswered (a delete takes its posts and messages with it); a table this database does not have yet
 * holds nothing.
 */
const NO_TABLE = new Set(["42P01", "PGRST205"])
async function spaceUsed(db: Db, spaceId: string): Promise<boolean> {
  const first = (table: string) =>
    Promise.resolve(db.from(table).select("id").eq("space_id", spaceId).limit(1)).then(
      ({ data, error }: { data: unknown[] | null; error: { code?: string } | null }) => (error ? !NO_TABLE.has(error.code ?? "") : (data?.length ?? 0) > 0),
      () => true,
    )
  const [posts, messages] = await Promise.all([first("community_feed_posts"), first("community_messages")])
  return posts || messages
}

export async function updateSpace(db: Db, a: { communityId: string; spaceId: string; actorId: string; input: SpaceInput; archived?: boolean }): Promise<Result> {
  const space = await spaceOf(db, a.communityId, a.spaceId)
  if (!space) return no(404, "That space is not in this community.")
  if (space.kind !== a.input.kind && (space.kind === "chat" || a.input.kind === "chat")) {
    if (await spaceUsed(db, space.id)) return no(409, "A space with posts cannot change between chat and posts. Make a new space instead.", "kind")
  }
  const patch: Record<string, unknown> = {
    name: a.input.name,
    description: a.input.description,
    icon: a.input.icon,
    kind: a.input.kind,
    post_role: a.input.postRole,
    comments_enabled: a.input.commentsEnabled,
    view_access: await ownRule(db, a.communityId, a.input.viewAccess),
  }
  if (a.archived !== undefined) patch.archived_at = a.archived ? (space.archived_at ?? nowIso()) : null
  const { error } = await db.from("community_spaces").update(patch).eq("id", space.id)
  if (error) return no(500, "The space could not be saved. Try again.")
  await audit(db, {
    communityId: a.communityId,
    actorId: a.actorId,
    actorKind: "member",
    action: a.archived === true && !space.archived_at ? "space.archived" : a.archived === false && space.archived_at ? "space.restored" : "space.updated",
    targetType: "space",
    targetId: space.id,
    targetLabel: a.input.name,
  })
  return { ok: true }
}

/** New order for the spaces: every id must be one of this community's. */
export async function reorderSpaces(db: Db, a: { communityId: string; actorId: string; ids: unknown }): Promise<Result> {
  const ids = Array.isArray(a.ids) ? a.ids.filter(isUuid) : []
  const { data } = await db.from("community_spaces").select("id").eq("community_id", a.communityId).limit(MAX_SPACES + 10)
  const own = new Set(((data as { id: string }[] | null) ?? []).map((s) => s.id))
  if (ids.length === 0 || ids.length !== own.size || ids.some((id) => !own.has(id)) || new Set(ids).size !== ids.length) return no(400, "Send every space once.")
  const results = await Promise.all(ids.map((id, i) => db.from("community_spaces").update({ position: i }).eq("id", id).eq("community_id", a.communityId)))
  if (results.some((r: { error: unknown }) => r.error)) return no(500, "The order could not be saved. Try again.")
  await audit(db, { communityId: a.communityId, actorId: a.actorId, actorKind: "member", action: "space.reordered", targetType: "community", targetId: a.communityId })
  return { ok: true }
}

/** Only an empty space is deleted; one with posts or messages is archived instead, so nothing anybody wrote is lost. */
export async function deleteSpace(db: Db, a: { communityId: string; spaceId: string; actorId: string }): Promise<Result> {
  const space = await spaceOf(db, a.communityId, a.spaceId)
  if (!space) return no(404, "That space is not in this community.")
  if (await spaceUsed(db, space.id)) return no(409, "It has posts in it. Archive it instead.")
  const { count: total } = await db.from("community_spaces").select("id", { count: "exact", head: true }).eq("community_id", a.communityId).is("archived_at", null)
  if ((total ?? 0) <= 1 && !space.archived_at) return no(409, "Keep at least one space.")
  const { error } = await db.from("community_spaces").delete().eq("id", space.id).eq("community_id", a.communityId)
  if (error) return no(500, "The space could not be deleted. Try again.")
  await audit(db, { communityId: a.communityId, actorId: a.actorId, actorKind: "member", action: "space.deleted", targetType: "space", targetId: space.id, targetLabel: space.name })
  return { ok: true }
}

/* ── Classroom ──────────────────────────────────────────────────────────── */

export async function loadClassroom(db: Db, communityId: string, creatorId: string): Promise<{ attached: CourseView[]; available: PickProduct[] }> {
  const [{ data: links }, { data: courses }] = await Promise.all([
    db.from("community_courses").select("product_id, position, access, drip_days").eq("community_id", communityId).order("position", { ascending: true }).limit(200),
    db.from("products").select("id, title, status, thumbnail_url, type").eq("creator_id", creatorId).eq("type", "course").neq("status", "archived").order("created_at", { ascending: false }).limit(200),
  ])
  const rows = (links as { product_id: string; position: number; access: AccessRuleJson; drip_days: number | null }[] | null) ?? []
  const all = (courses as { id: string; title: string; status: string; thumbnail_url: string | null; type: string }[] | null) ?? []
  const byId = new Map(all.map((p) => [p.id, p]))
  const missingIds = rows.map((r) => r.product_id).filter((id) => !byId.has(id))
  if (missingIds.length) {
    const { data } = await db.from("products").select("id, title, status, thumbnail_url, type").in("id", missingIds)
    for (const p of (data as { id: string; title: string; status: string; thumbnail_url: string | null; type: string }[] | null) ?? []) byId.set(p.id, p)
  }
  const attachedIds = new Set(rows.map((r) => r.product_id))
  return {
    attached: rows.map((r) => {
      const p = byId.get(r.product_id)
      return { productId: r.product_id, title: p?.title || "Course", cover: p?.thumbnail_url ?? null, status: p?.status ?? "archived", position: r.position, access: parseAccessRule(r.access), dripDays: r.drip_days }
    }),
    available: all.filter((p) => !attachedIds.has(p.id)).map((p) => ({ id: p.id, title: p.title || "Course", type: p.type, status: p.status, cover: p.thumbnail_url })),
  }
}

export async function attachCourse(db: Db, a: { communityId: string; creatorId: string; productId: string; actorId: string }): Promise<Result> {
  if (!isUuid(a.productId)) return no(404, "That course is not yours.")
  const { data: p } = await db.from("products").select("id, creator_id, type, title").eq("id", a.productId).maybeSingle()
  if (!p || p.creator_id !== a.creatorId || p.type !== "course") return no(404, "That course is not yours.")
  const { data: rows } = await db.from("community_courses").select("position").eq("community_id", a.communityId).limit(200)
  const position = ((rows as { position: number }[] | null) ?? []).reduce((m, r) => Math.max(m, r.position + 1), 0)
  const { error } = await db.from("community_courses").insert({ community_id: a.communityId, product_id: p.id, position })
  if (error && error.code !== "23505") return no(500, "The course could not be added. Try again.")
  await audit(db, { communityId: a.communityId, actorId: a.actorId, actorKind: "member", action: "course.attached", targetType: "course", targetId: p.id, targetLabel: p.title })
  return { ok: true }
}

export async function updateCourse(db: Db, a: { communityId: string; productId: string; actorId: string; access?: AccessRuleJson; dripDays?: unknown }): Promise<Result> {
  const { data: row } = await db.from("community_courses").select("product_id").eq("community_id", a.communityId).eq("product_id", a.productId).maybeSingle()
  if (!row) return no(404, "That course is not in this community.")
  const patch: Record<string, unknown> = {}
  if (a.access !== undefined) patch.access = await ownRule(db, a.communityId, a.access)
  if (a.dripDays !== undefined) {
    if (a.dripDays === null || a.dripDays === "" || a.dripDays === 0) patch.drip_days = null
    else {
      const n = Number(a.dripDays)
      if (!Number.isInteger(n) || n < 1 || n > 3650) return no(400, "Days after joining is a whole number from 1.", "dripDays")
      patch.drip_days = n
    }
  }
  if (Object.keys(patch).length === 0) return { ok: true }
  const { error } = await db.from("community_courses").update(patch).eq("community_id", a.communityId).eq("product_id", a.productId)
  if (error) return no(500, "That did not save. Try again.")
  await audit(db, { communityId: a.communityId, actorId: a.actorId, actorKind: "member", action: "course.updated", targetType: "course", targetId: a.productId, detail: patch })
  return { ok: true }
}

export async function reorderCourses(db: Db, a: { communityId: string; actorId: string; ids: unknown }): Promise<Result> {
  const ids = Array.isArray(a.ids) ? a.ids.filter(isUuid) : []
  const { data } = await db.from("community_courses").select("product_id").eq("community_id", a.communityId).limit(200)
  const own = new Set(((data as { product_id: string }[] | null) ?? []).map((s) => s.product_id))
  if (ids.length === 0 || ids.length !== own.size || ids.some((id) => !own.has(id)) || new Set(ids).size !== ids.length) return no(400, "Send every course once.")
  await Promise.all(ids.map((id, i) => db.from("community_courses").update({ position: i }).eq("community_id", a.communityId).eq("product_id", id)))
  await audit(db, { communityId: a.communityId, actorId: a.actorId, actorKind: "member", action: "course.reordered", targetType: "community", targetId: a.communityId })
  return { ok: true }
}

export async function detachCourse(db: Db, a: { communityId: string; productId: string; actorId: string }): Promise<Result> {
  const { data: row } = await db.from("community_courses").select("product_id").eq("community_id", a.communityId).eq("product_id", a.productId).maybeSingle()
  if (!row) return no(404, "That course is not in this community.")
  const { error } = await db.from("community_courses").delete().eq("community_id", a.communityId).eq("product_id", a.productId)
  if (error) return no(500, "That did not save. Try again.")
  await audit(db, { communityId: a.communityId, actorId: a.actorId, actorKind: "member", action: "course.detached", targetType: "course", targetId: a.productId })
  return { ok: true }
}

/* ── Events ─────────────────────────────────────────────────────────────── */

/*
  TICKETS ON AN EVENT (round 14, run-now part 105). The price and its
  settings live on the event row, so they are read and written with it. The
  columns only exist once part 105 has run, which is why every read asks
  worker E's ticketsReady() first and falls back to the columns events have
  always had: without the update every event is free and the editor says so
  rather than offering a price nobody could pay.
*/
function eventView(e: EventRow, money: EventTicketMoney | null = null): EventEditView {
  return {
    id: e.id,
    title: e.title,
    description: htmlToText(e.description),
    coverUrl: e.cover_url,
    kind: e.kind,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    timezone: e.timezone,
    location: e.location,
    meetingUrl: e.meeting_url,
    livestreamUrl: e.livestream_url,
    capacity: e.capacity,
    goingCount: e.going_count,
    access: parseAccessRule(e.access),
    replayVideoId: e.replay_video_id,
    status: e.status,
    priceCents: e.price_cents ?? null,
    currency: e.currency ?? null,
    salesCloseAt: e.sales_close_at ?? null,
    refundWindowHours: e.refund_window_hours ?? null,
    refundPolicy: e.refund_policy ?? null,
    ticketsSold: e.tickets_sold ?? 0,
    money,
  }
}

/** Upcoming events oldest first, and the latest past ones, with what each took. */
export async function loadEvents(db: Db, communityId: string): Promise<{ upcoming: EventEditView[]; past: EventEditView[]; tickets: EventTicketSetup }> {
  const cut = nowIso(Date.now() - 2 * 60 * 60_000)
  /* Round 32: whether tickets are set up, and the ticket setup itself, are asked beside the events, not after them. */
  const [columns, ready, tickets] = await Promise.all([eventReadColumns(db), ticketsReady(db), eventTicketSetup(db, communityId)])
  const [up, past] = await Promise.all([
    db.from("community_events").select(columns).eq("community_id", communityId).gte("starts_at", cut).order("starts_at", { ascending: true }).limit(100),
    db.from("community_events").select(columns).eq("community_id", communityId).lt("starts_at", cut).order("starts_at", { ascending: false }).limit(30),
  ])
  const upRows = (up.data as EventRow[] | null) ?? []
  const pastRows = (past.data as EventRow[] | null) ?? []
  const money = ready ? await eventsTicketMoney(db, communityId, [...upRows, ...pastRows]) : new Map<string, EventTicketMoney>()
  return {
    upcoming: upRows.map((e) => eventView(e, money.get(e.id) ?? null)),
    past: pastRows.map((e) => eventView(e, money.get(e.id) ?? null)),
    tickets,
  }
}

function eventColumns(input: EventInput): Record<string, unknown> {
  return {
    title: input.title,
    description: input.description ? sanitizeDescription(textToHtml(input.description)) : null,
    kind: input.kind,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    timezone: input.timezone,
    location: input.location,
    meeting_url: input.meetingUrl,
    livestream_url: input.livestreamUrl,
    capacity: input.capacity,
    cover_url: ownPicture(input.coverUrl),
  }
}

export async function createEvent(db: Db, a: { community: CommunityRow; actorId: string; input: EventInput; tickets?: EventTicketInput | null; role?: Role; perms?: RolePermissions | null }): Promise<Result<{ event: EventEditView }>> {
  /* A PRICE IS ITS OWN PERMISSION, decided here as well as in the route, so hiding the card is never the only gate. */
  const refused = priceChangeRefusal({ role: a.role, perms: a.perms, tickets: a.tickets ?? null })
  if (refused) return refused
  const setup = a.tickets ? await eventTicketSetup(db, a.community.id) : null
  const { data, error } = await db
    .from("community_events")
    .insert({
      community_id: a.community.id,
      ...eventColumns(a.input),
      ...(await eventPriceColumns(db, a.tickets ?? null, setup?.currency ?? "usd")),
      access: await ownRule(db, a.community.id, a.input.access),
      host_id: a.actorId,
      created_by: a.actorId,
      status: "scheduled",
    })
    .select(await eventReadColumns(db))
    .single()
  if (error || !data) {
    if (missing(error)) return no(503, "Communities are not set up on Storelib yet.")
    console.error(`[communities] event: ${reasonOf(error)}`)
    return no(500, "The event could not be saved. Try again.")
  }
  const e = data as EventRow
  await audit(db, { communityId: a.community.id, actorId: a.actorId, actorKind: "member", action: "event.created", targetType: "event", targetId: e.id, targetLabel: e.title, detail: { startsAt: e.starts_at, priceCents: e.price_cents ?? null } })
  /* Members hear about it (the event fan out) and the reminders are set (lib/communities/server/events.ts). */
  await eventScheduled(db, e, { announce: true })
  return { ok: true, event: eventView(e) }
}

async function eventOf(db: Db, communityId: string, eventId: string): Promise<EventRow | null> {
  if (!isUuid(eventId)) return null
  const { data } = await db.from("community_events").select(await eventReadColumns(db)).eq("id", eventId).eq("community_id", communityId).maybeSingle()
  return (data as EventRow | null) ?? null
}

/** A replay must be a ready video of this creator's (media_videos). */
async function checkReplay(db: Db, creatorId: string, communityId: string, raw: unknown): Promise<string | null | false> {
  const id = replayVideoId(raw)
  if (id === null || id === false) return id
  const { data, error } = await db.from("media_videos").select("id, creator_id, community_id, status").eq("id", id).maybeSingle()
  if (error || !data) return false
  if (data.creator_id !== creatorId && data.community_id !== communityId) return false
  return data.status === "failed" ? false : data.id
}

export async function updateEvent(db: Db, a: { community: CommunityRow; creatorId: string; eventId: string; actorId: string; input: EventInput; replay?: unknown; tickets?: EventTicketInput | null; role?: Role; perms?: RolePermissions | null }): Promise<Result<{ event: EventEditView }>> {
  const e = await eventOf(db, a.community.id, a.eventId)
  if (!e) return no(404, "That event is not in this community.")
  /* THE PRICE'S OWN RULES: the permission, and never taking a price off under somebody who paid. */
  const refused = priceChangeRefusal({ role: a.role, perms: a.perms, tickets: a.tickets ?? null, event: e })
  if (refused) return refused
  const setup = a.tickets ? await eventTicketSetup(db, a.community.id) : null
  const patch: Record<string, unknown> = { ...eventColumns(a.input), ...(await eventPriceColumns(db, a.tickets ?? null, setup?.currency ?? e.currency ?? "usd")), access: await ownRule(db, a.community.id, a.input.access) }
  if (a.input.coverUrl === null && e.cover_url && !ownPicture(a.input.coverUrl)) patch.cover_url = null
  if (a.replay !== undefined) {
    const replay = await checkReplay(db, a.creatorId, a.community.id, a.replay)
    if (replay === false) return no(400, "No video with that id in your Storelib videos.", "replay")
    patch.replay_video_id = replay
  }
  /* A new time means the reminders are due again. */
  if (patch.starts_at !== e.starts_at) {
    patch.reminder_24h_at = null
    patch.reminder_1h_at = null
  }
  const { data, error } = await db.from("community_events").update(patch).eq("id", e.id).eq("community_id", a.community.id).select(await eventReadColumns(db)).single()
  if (error || !data) return no(500, "The event could not be saved. Try again.")
  await audit(db, { communityId: a.community.id, actorId: a.actorId, actorKind: "member", action: "event.updated", targetType: "event", targetId: e.id, targetLabel: a.input.title, detail: { moved: patch.starts_at !== e.starts_at } })
  if (patch.starts_at !== e.starts_at) await eventScheduled(db, data as EventRow, { announce: false })
  /* Members who are going hear that it moved (worker N2's fan out, lib/communities/server/notify.ts). */
  if (patch.starts_at !== e.starts_at) await notifyEventChanged(db, { eventId: e.id, communityId: a.community.id, change: "moved", startsAt: (data as EventRow).starts_at, actorId: a.actorId })
  return { ok: true, event: eventView(data as EventRow) }
}

export async function setEventCancelled(db: Db, a: { communityId: string; eventId: string; actorId: string; cancelled: boolean }): Promise<Result> {
  const e = await eventOf(db, a.communityId, a.eventId)
  if (!e) return no(404, "That event is not in this community.")
  const { error } = await db.from("community_events").update({ status: a.cancelled ? "cancelled" : "scheduled" }).eq("id", e.id).eq("community_id", a.communityId)
  if (error) return no(500, "That did not save. Try again.")
  await audit(db, { communityId: a.communityId, actorId: a.actorId, actorKind: "member", action: a.cancelled ? "event.cancelled" : "event.restored", targetType: "event", targetId: e.id, targetLabel: e.title })
  if (!a.cancelled) await eventScheduled(db, { ...e, status: "scheduled" }, { announce: false })
  else await notifyEventChanged(db, { eventId: e.id, communityId: a.communityId, change: "cancelled", actorId: a.actorId })
  return { ok: true }
}

/* ── Feed ───────────────────────────────────────────────────────────────── */

export const FEED_PAGE = 20

/** The feed as the creator manages it: newest first, removed posts included so they can be put back. */
export async function loadFeedRows(db: Db, communityId: string, opts: { cursor: string | null; show: "all" | "removed" | "pinned"; spaceId?: string | null; q?: string | null }): Promise<{ rows: FeedRowView[]; next: string | null }> {
  /* Round 31: the media too, so the row shows what the post carries (pictures, a video's still, files), as the feed does. */
  let q = db.from("community_feed_posts").select("id, kind, title, body_text, media, space_id, author_id, pinned, locked, featured, status, reaction_count, comment_count, created_at").eq("community_id", communityId)
  q = opts.show === "removed" ? q.eq("status", "removed") : opts.show === "pinned" ? q.eq("status", "published").eq("pinned", true) : q.in("status", ["published", "removed"])
  /* Round 32: one space, and words in the title or the text (the member search's cleaning, so nothing reaches the filter as syntax). */
  if (opts.spaceId && isUuid(opts.spaceId)) q = q.eq("space_id", opts.spaceId)
  const words = opts.q ? safeSearch(opts.q) : ""
  if (words.length >= 2) q = q.or(`title.ilike.*${words}*,body_text.ilike.*${words}*`)
  const c = decodeCursor(opts.cursor)
  if (c && typeof c.sort === "string") q = q.or(keysetOr("created_at", c.sort, c.id))
  const { data, error } = await q.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(FEED_PAGE + 1)
  if (error) return { rows: [], next: null }
  type Lite = { id: string; kind: FeedRowView["kind"]; title: string | null; body_text: string; media: unknown; space_id: string | null; author_id: string | null; pinned: boolean; locked: boolean; featured: boolean; status: FeedRowView["status"]; reaction_count: number; comment_count: number; created_at: string }
  const all = (data as Lite[] | null) ?? []
  const rows = all.slice(0, FEED_PAGE)
  const spaceIds = [...new Set(rows.map((r) => r.space_id).filter((x): x is string => Boolean(x)))]
  const [people, spaces, polls] = await Promise.all([
    peopleOf(db, rows.map((r) => r.author_id).filter((x): x is string => Boolean(x))),
    spaceIds.length ? db.from("community_spaces").select("id, name, icon, kind").in("id", spaceIds) : Promise.resolve({ data: [] }),
    feedRowPolls(db, rows.filter((r) => r.kind === "poll").map((r) => r.id)),
  ])
  const spaceById = new Map(((spaces.data as { id: string; name: string; icon: string | null; kind: SpaceRow["kind"] }[] | null) ?? []).map((s) => [s.id, s]))
  const last = rows[rows.length - 1]
  return {
    rows: rows.map((r) => {
      const space = r.space_id ? spaceById.get(r.space_id) : undefined
      const author = r.author_id ? people.get(r.author_id) : undefined
      return {
        id: r.id,
        kind: r.kind,
        title: r.title,
        excerpt: (r.body_text || "").slice(0, 240),
        spaceName: space?.name ?? null,
        authorName: r.author_id ? (author?.name ?? "Member") : "Deleted account",
        pinned: r.pinned,
        locked: r.locked,
        featured: r.featured,
        status: r.status,
        reactionCount: r.reaction_count,
        commentCount: r.comment_count,
        createdAt: r.created_at,
        media: Array.isArray(r.media) ? (r.media as NonNullable<FeedRowView["media"]>) : [],
        poll: polls.get(r.id) ?? null,
        spaceId: r.space_id,
        spaceIcon: space?.icon ?? null,
        spaceKind: space?.kind ?? null,
        authorId: r.author_id,
        authorAvatar: author?.avatarUrl ?? null,
      }
    }),
    next: all.length > FEED_PAGE && last ? encodeCursor(last.created_at, last.id) : null,
  }
}

/** A poll in short for the Feed's rows (round 31): its question, how many voted and how many choices, in two reads a page. */
async function feedRowPolls(db: Db, postIds: string[]): Promise<Map<string, NonNullable<FeedRowView["poll"]>>> {
  const out = new Map<string, NonNullable<FeedRowView["poll"]>>()
  if (!postIds.length) return out
  try {
    const { data: polls, error } = await db.from("community_polls").select("id, post_id, question, closes_at").in("post_id", postIds)
    if (error || !polls?.length) return out
    const list = polls as { id: string; post_id: string; question: string; closes_at: string | null }[]
    const { data: options } = await db.from("community_poll_options").select("poll_id, vote_count").in("poll_id", list.map((p) => p.id))
    const opts = (options as { poll_id: string; vote_count: number }[] | null) ?? []
    const now = Date.now()
    for (const p of list) {
      const own = opts.filter((o) => o.poll_id === p.id)
      out.set(p.post_id, { question: p.question, votes: own.reduce((n, o) => n + (Number(o.vote_count) || 0), 0), options: own.length, closed: !!p.closes_at && Date.parse(p.closes_at) <= now })
    }
  } catch {
    /* The rows show without their poll line. */
  }
  return out
}

/**
 * A post from the creator's Feed screen, written as a member's post is: in
 * a space they may post in, sanitized, counted by the trigger, in the
 * activity feed. In the Announcements space it is an announcement, and
 * members hear about it through the announcement fan out.
 */
export async function createCreatorPost(db: Db, a: { community: CommunityRow; role: Role; perms?: RolePermissions | null; actorId: string; spaceId: unknown; title: unknown; body: unknown; pin?: boolean }): Promise<Result<{ id: string }>> {
  if (a.community.status === "archived" || a.community.archived_at) return no(403, "archived")
  if (!isUuid(a.spaceId)) return no(400, "Pick a space.", "space")
  const space = await spaceOf(db, a.community.id, a.spaceId)
  if (!space || space.archived_at || space.kind === "chat") return no(404, "That space is not in this community.", "space")
  if (!can(a.role, "post") || !meetsRole(a.role, space.post_role)) return no(403, "forbidden", "space")
  const announcement = space.kind === "announcements"
  if (announcement && !can(a.role, "announce", a.perms)) return no(403, "forbidden", "space")
  const title = typeof a.title === "string" ? a.title.replace(/\s+/g, " ").trim() : ""
  if (title.length > LENGTHS.postTitle.max) return no(400, `A title is up to ${LENGTHS.postTitle.max} characters.`, "title")
  const text = typeof a.body === "string" ? a.body.replace(/\r\n?/g, "\n").trim() : ""
  if (!text && !title) return no(400, "Write something first.", "body")
  if (text.length > 10_000) return no(400, "A post is up to 10,000 characters.", "body")
  const now = nowIso()
  const { data, error } = await db
    .from("community_feed_posts")
    .insert({
      community_id: a.community.id,
      space_id: space.id,
      author_id: a.actorId,
      kind: announcement ? "announcement" : "post",
      title: title || null,
      body: text ? sanitizeDescription(textToHtml(text)) : "",
      body_text: text,
      pinned: a.pin === true && can(a.role, "pin", a.perms),
      last_activity_at: now,
    })
    .select("id")
    .single()
  if (error || !data) {
    console.error(`[communities] creator post: ${reasonOf(error)}`)
    return no(500, "The post could not be published. Try again.")
  }
  await recordActivity(db, { communityId: a.community.id, userId: a.actorId, kind: "post", targetType: "post", targetId: data.id })
  if (announcement) await queueJob(db, { kind: "fanout_announcement", payload: { communityId: a.community.id, postId: data.id }, idempotencyKey: `fanout_announcement:${data.id}` })
  await audit(db, { communityId: a.community.id, actorId: a.actorId, actorKind: "member", action: announcement ? "announcement.posted" : "post.created", targetType: "post", targetId: data.id, targetLabel: title || text.slice(0, 80) })
  return { ok: true, id: data.id as string }
}

/* ── Gamification ───────────────────────────────────────────────────────── */

/**
 * The levels, as the editor sent them, and every member moved to the level
 * their points now reach: one update per level, never one per member.
 */
export async function saveLevels(db: Db, a: { communityId: string; actorId: string; levels: LevelInput[] }): Promise<Result> {
  const rows = a.levels.map((l) => ({ community_id: a.communityId, level: l.level, name: l.name, min_points: l.minPoints, reward: l.reward }))
  const { error } = await db.from("community_levels").upsert(rows, { onConflict: "community_id,level" })
  if (error) return no(500, "The levels could not be saved. Try again.")
  await db.from("community_levels").delete().eq("community_id", a.communityId).gt("level", a.levels.length)
  for (let i = 0; i < a.levels.length; i++) {
    const l = a.levels[i]
    const next = a.levels[i + 1]
    let q = db.from("community_members").update({ level: l.level }).eq("community_id", a.communityId).gte("points", l.minPoints).neq("level", l.level)
    if (next) q = q.lt("points", next.minPoints)
    const { error: moveError } = await q
    if (moveError) console.error(`[communities] level ${l.level} recompute: ${reasonOf(moveError)}`)
  }
  await audit(db, { communityId: a.communityId, actorId: a.actorId, actorKind: "member", action: "levels.saved", targetType: "community", targetId: a.communityId, detail: { levels: a.levels.length } })
  return { ok: true }
}

export async function createBadge(db: Db, a: { communityId: string; actorId: string; name: unknown; description: unknown; icon: unknown }): Promise<Result<{ badge: BadgeView }>> {
  const name = typeof a.name === "string" ? a.name.replace(/\s+/g, " ").trim() : ""
  if (!name || name.length > LENGTHS.badgeName.max) return no(400, `A badge name is 1 to ${LENGTHS.badgeName.max} characters.`, "name")
  const description = typeof a.description === "string" ? a.description.trim().slice(0, 300) || null : null
  const icon = typeof a.icon === "string" ? a.icon.trim().slice(0, 16) || null : null
  const { count: existing } = await db.from("community_badges").select("id", { count: "exact", head: true }).eq("community_id", a.communityId)
  if ((existing ?? 0) >= 50) return no(400, "A community has up to 50 badges.")
  const { data, error } = await db.from("community_badges").insert({ community_id: a.communityId, name, description, icon, kind: "manual" }).select("id, name, description, icon").single()
  if (error || !data) return no(500, "The badge could not be made. Try again.")
  await audit(db, { communityId: a.communityId, actorId: a.actorId, actorKind: "member", action: "badge.created", targetType: "badge", targetId: data.id, targetLabel: name })
  return { ok: true, badge: { ...data, awarded: 0 } }
}

export async function deleteBadge(db: Db, a: { communityId: string; badgeId: string; actorId: string }): Promise<Result> {
  const { data: b } = await db.from("community_badges").select("id, name").eq("id", a.badgeId).eq("community_id", a.communityId).maybeSingle()
  if (!b) return no(404, "That badge is not in this community.")
  const { error } = await db.from("community_badges").delete().eq("id", b.id)
  if (error) return no(500, "That did not save. Try again.")
  await audit(db, { communityId: a.communityId, actorId: a.actorId, actorKind: "member", action: "badge.deleted", targetType: "badge", targetId: b.id, targetLabel: b.name })
  return { ok: true }
}

export async function awardBadge(db: Db, a: { communityId: string; badgeId: string; userId: string; actorId: string; on: boolean }): Promise<Result> {
  const { data: b } = await db.from("community_badges").select("id, name").eq("id", a.badgeId).eq("community_id", a.communityId).maybeSingle()
  if (!b) return no(404, "That badge is not in this community.")
  const m = await memberOf(db, a.communityId, a.userId)
  if (!m || m.status !== "active") return no(404, "They are not a member.")
  if (a.on) {
    const { error } = await db.from("community_member_badges").insert({ badge_id: b.id, user_id: a.userId, community_id: a.communityId, awarded_by: a.actorId })
    if (error && error.code !== "23505") return no(500, "That did not save. Try again.")
  } else {
    await db.from("community_member_badges").delete().eq("badge_id", b.id).eq("user_id", a.userId)
  }
  await audit(db, { communityId: a.communityId, actorId: a.actorId, actorKind: "member", action: a.on ? "badge.awarded" : "badge.taken_back", targetType: "member", targetId: a.userId, targetLabel: b.name })
  return { ok: true }
}

/** Points by hand: a positive award or a negative adjustment, each its own key so it counts once. */
export async function givePoints(db: Db, a: { communityId: string; userId: string; actorId: string; points: number; note: string | null }): Promise<Result<{ level: number | null }>> {
  const m = await memberOf(db, a.communityId, a.userId)
  if (!m || m.status !== "active") return no(404, "They are not a member.")
  const key = `admin:${a.actorId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`
  const done = await awardPoints(db, { communityId: a.communityId, userId: a.userId, points: a.points, reason: a.points > 0 ? "admin_award" : "admin_adjust", sourceKey: key, actorId: a.actorId })
  if (!done.awarded) return no(500, "The points were not added. Try again.")
  await audit(db, { communityId: a.communityId, actorId: a.actorId, actorKind: "member", action: "points.given", targetType: "member", targetId: a.userId, reason: a.note, detail: { points: a.points } })
  return { ok: true, level: done.level }
}

/* ── Members ────────────────────────────────────────────────────────────── */

const LIST_MEMBER_COLUMNS =
  "id, user_id, status, role, tier_id, source, joined_at, requested_at, request_note, last_active_at, muted_until, points, level, approved_by, banned_at, ban_reason, banned_by, removed_at, created_at"
type ListMember = Pick<
  MemberRow,
  | "id"
  | "user_id"
  | "status"
  | "role"
  | "tier_id"
  | "source"
  | "joined_at"
  | "requested_at"
  | "request_note"
  | "last_active_at"
  | "muted_until"
  | "points"
  | "level"
  | "approved_by"
  | "banned_at"
  | "ban_reason"
  | "banned_by"
  | "removed_at"
  | "created_at"
>

/* ── Who took somebody's access away, when, and why ─────────────────────── */

/** The statuses the "Not active" view holds: everybody a moderator took out. */
const RESTRICTED_STATUSES = ["paused", "banned", "removed"] as const

/** The audit entry behind each of them (./membership.ts revokeMembership, ./moderation.ts mute). */
const TAKEN_AWAY_ACTIONS = ["member.banned", "member.removed", "member.paused", "member.muted"] as const

const TAKEN_AWAY_KIND: Record<string, MemberActionTaken["kind"]> = {
  "member.banned": "banned",
  "member.removed": "removed",
  "member.paused": "suspended",
  "member.muted": "muted",
}

/**
 * WHO DID IT, WHEN AND WHY, for a page of people who are not active. The ban
 * carries its own three columns; a removal, a suspension and a mute leave
 * only the audit log, so the newest entry about each person is read in one
 * pass (never one read per row) and the actor's name and role come with it.
 * The role is what the screen and the server both use for the rule that a
 * moderator never undoes an action taken by somebody ranked above them.
 */
async function takenAway(db: Db, communityId: string, rows: ListMember[]): Promise<Map<string, MemberActionTaken>> {
  const out = new Map<string, MemberActionTaken>()
  const ids = [...new Set(rows.filter((r) => r.status !== "active" || r.muted_until).map((r) => r.user_id))]
  if (ids.length === 0) return out
  const { data, error } = await db
    .from("community_audit_log")
    .select("id, actor_id, actor_kind, action, target_id, reason, created_at")
    .eq("community_id", communityId)
    .eq("target_type", "member")
    .in("target_id", ids.slice(0, 200))
    .in("action", [...TAKEN_AWAY_ACTIONS])
    .order("id", { ascending: false })
    .limit(400)
  if (error && !missing(error)) console.error(`[communities] who acted read: ${reasonOf(error)}`)
  type Entry = { actor_id: string | null; actor_kind: string; action: string; target_id: string; reason: string | null; created_at: string }
  const newest = new Map<string, Entry>()
  for (const e of ((data as Entry[] | null) ?? [])) {
    const key = `${e.target_id}:${TAKEN_AWAY_KIND[e.action] ?? ""}`
    if (!newest.has(key)) newest.set(key, e)
  }
  const [people, staff] = await Promise.all([
    peopleOf(db, [...newest.values()].map((e) => e.actor_id).filter((x): x is string => Boolean(x))),
    db.from("community_members").select("user_id, role, status").eq("community_id", communityId).in("user_id", [...new Set([...newest.values()].map((e) => e.actor_id).filter((x): x is string => Boolean(x)))].slice(0, 100)),
  ])
  const roleOfActor = new Map(((staff.data as { user_id: string; role: Role; status: MemberStatus }[] | null) ?? []).map((m) => [m.user_id, m.status === "active" ? m.role : null]))
  for (const r of rows) {
    const kind: MemberActionTaken["kind"] | null = r.status === "banned" ? "banned" : r.status === "removed" ? "removed" : r.status === "paused" ? "suspended" : r.muted_until ? "muted" : null
    if (!kind) continue
    const entry = newest.get(`${r.user_id}:${kind}`) ?? null
    const byUserId = kind === "banned" ? (r.banned_by ?? entry?.actor_id ?? null) : (entry?.actor_id ?? null)
    out.set(r.user_id, {
      kind,
      byUserId,
      byName: byUserId ? (people.get(byUserId)?.name ?? null) : entry?.actor_kind === "platform" ? "Storelib" : null,
      byRole: byUserId ? (roleOfActor.get(byUserId) ?? null) : null,
      at: kind === "banned" ? (r.banned_at ?? entry?.created_at ?? null) : kind === "removed" ? (r.removed_at ?? entry?.created_at ?? null) : (entry?.created_at ?? null),
      reason: kind === "banned" ? (r.ban_reason ?? entry?.reason ?? null) : (entry?.reason ?? null),
      until: kind === "muted" ? (r.muted_until ?? null) : null,
    })
  }
  return out
}

async function searchUserIds(db: Db, q: string, withEmail: boolean): Promise<{ ids: string[]; capped: boolean }> {
  const s = safeSearch(q)
  if (s.length < 2) return { ids: [], capped: false }
  const parts = [`display_name.ilike.*${s}*`, `username.ilike.*${s.replace(/^@/, "")}*`]
  if (withEmail && s.includes("@")) parts.push(`email.ilike.*${s}*`)
  const { data, error } = await db.from("profiles").select("id").or(parts.join(",")).limit(SEARCH_CAP)
  if (error) return { ids: [], capped: false }
  const ids = ((data as { id: string }[] | null) ?? []).map((p) => p.id)
  return { ids, capped: ids.length >= SEARCH_CAP }
}

function sortColumn(status: MemberQuery["status"]): "joined_at" | "requested_at" | "created_at" {
  if (status === "active" || status === "muted") return "joined_at"
  if (status === "pending") return "requested_at"
  return "created_at"
}

/**
 * ROUND 32: THE ORDER THE LIST IS READ IN. The default is the view's own column, newest first, as it always was. Oldest
 * turns it round; Recently active reads last_active_at, which a member who never came back does not have, so those are
 * read after everybody else (by id: a page cursor whose sort is the number -1 says the list has reached them); Most
 * points reads points. Each is a keyset on (column, id), so the hundredth page costs what the first does.
 */
interface MemberSortSpec {
  col: "joined_at" | "requested_at" | "created_at" | "last_active_at" | "points"
  asc: boolean
  /** The column can be empty: those rows come last, after a cursor of -1. */
  nullable: boolean
}

function memberSortSpec(query: Pick<MemberQuery, "status" | "sort">): MemberSortSpec {
  const base = sortColumn(query.status)
  if (query.sort === "oldest") return { col: base, asc: true, nullable: false }
  if (query.sort === "active") return { col: "last_active_at", asc: false, nullable: true }
  if (query.sort === "points") return { col: "points", asc: false, nullable: false }
  return { col: base, asc: false, nullable: false }
}

/** A cursor whose sort is this number has passed every row with a value and is among the empty ones. */
const EMPTY_PHASE = -1

function memberQuery(db: Db, communityId: string, query: Pick<MemberQuery, "status" | "role" | "tierId" | "joined">) {
  let q = db.from("community_members").select(LIST_MEMBER_COLUMNS).eq("community_id", communityId)
  if (query.status === "restricted") {
    /*
      EVERYBODY A MODERATOR TOOK OUT, in one view: removed, banned, suspended,
      and the muted, who are still active rows with a mute that has not run
      out. One `or` of four branches, which PostgREST ands with the keyset's
      own `or` below.
    */
    q = q.or([...RESTRICTED_STATUSES.map((st) => `status.eq.${st}`), `and(status.eq.active,muted_until.gt."${nowIso()}")`].join(","))
  } else {
    /* Muted is not a status: active members whose mute has not run out. */
    q = q.eq("status", query.status === "muted" ? "active" : query.status)
    if (query.status === "muted") q = q.gt("muted_until", nowIso())
  }
  if (query.role) q = q.eq("role", query.role)
  if (query.tierId) q = q.eq("tier_id", query.tierId)
  if (query.joined) q = q.gte("joined_at", new Date(Date.now() - query.joined * 86_400_000).toISOString())
  const col = sortColumn(query.status)
  if (col !== "created_at") q = q.not(col, "is", null)
  return q
}

async function memberViews(db: Db, communityId: string, rows: ListMember[], withEmail: boolean): Promise<MemberRowView[]> {
  const [people, tiers, acted] = await Promise.all([
    peopleOf(db, rows.map((r) => r.user_id), { email: withEmail }),
    db.from("community_tiers").select("id, name").eq("community_id", communityId).limit(50),
    takenAway(db, communityId, rows),
  ])
  const tierName = new Map(((tiers.data as { id: string; name: string }[] | null) ?? []).map((t) => [t.id, t.name]))
  return rows.map((r) => {
    const p = people.get(r.user_id)
    return {
      userId: r.user_id,
      name: p?.name ?? "Member",
      username: p?.username ?? null,
      avatarUrl: p?.avatarUrl ?? null,
      email: withEmail ? (p?.email ?? null) : null,
      role: r.role,
      status: r.status,
      source: r.source,
      tierId: r.tier_id,
      tierName: r.tier_id ? (tierName.get(r.tier_id) ?? null) : null,
      level: r.level,
      points: r.points,
      joinedAt: r.joined_at,
      requestedAt: r.requested_at,
      requestNote: r.request_note,
      lastActiveAt: r.last_active_at,
      mutedUntil: r.muted_until && Date.parse(r.muted_until) > Date.now() ? r.muted_until : null,
      approved: Boolean(r.approved_by),
      acted: acted.get(r.user_id) ?? null,
    }
  })
}

/**
 * One page of members (50), newest first by when they joined (requests by
 * when they asked), on the community's (community_id, status, joined_at)
 * index. A search finds the matching accounts first (at most 300) and
 * reads their rows here; past that it asks for a narrower search rather
 * than reading the whole list.
 */
export async function listMembers(db: Db, communityId: string, query: MemberQuery, opts: { withEmail: boolean }): Promise<MemberPage> {
  const spec = memberSortSpec(query)
  const valueOf = (r: ListMember): string | number | null => (r as unknown as Record<string, string | number | null>)[spec.col] ?? null
  if (query.q) {
    const found = await searchUserIds(db, query.q, opts.withEmail)
    if (found.ids.length === 0) return { rows: [], next: null, capped: false }
    const chunks: string[][] = []
    for (let i = 0; i < found.ids.length; i += 100) chunks.push(found.ids.slice(i, i + 100))
    const reads = await Promise.all(chunks.map((ids) => memberQuery(db, communityId, query).in("user_id", ids).order(spec.col, { ascending: spec.asc, nullsFirst: false }).limit(MEMBERS_PAGE + 1)))
    /* Each chunk is in order; put together they are ordered once more the same way, empty values last. */
    const rows = reads
      .flatMap((r: { data: ListMember[] | null }) => r.data ?? [])
      .sort((a: ListMember, b: ListMember) => {
        const x = valueOf(a)
        const y = valueOf(b)
        if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1
        const d = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))
        return spec.asc ? d : -d
      })
    return { rows: await memberViews(db, communityId, rows.slice(0, MEMBERS_PAGE), opts.withEmail), next: null, capped: found.capped || rows.length > MEMBERS_PAGE }
  }
  const dir = spec.asc ? "asc" : "desc"
  const c = decodeCursor(query.cursor)
  const amongEmpty = spec.nullable && c !== null && c.sort === EMPTY_PHASE
  let all: ListMember[] = []
  if (!amongEmpty) {
    let q = memberQuery(db, communityId, query)
    if (spec.nullable) q = q.not(spec.col, "is", null)
    if (c && (typeof c.sort === "string" || (typeof c.sort === "number" && spec.col === "points"))) q = q.or(keysetOr(spec.col, c.sort, c.id, dir))
    const { data, error } = await q.order(spec.col, { ascending: spec.asc }).order("id", { ascending: spec.asc }).limit(MEMBERS_PAGE + 1)
    if (error) {
      if (!missing(error)) console.error(`[communities] members read: ${reasonOf(error)}`)
      return { rows: [], next: null, capped: false }
    }
    all = (data as ListMember[] | null) ?? []
  }
  if (spec.nullable && all.length <= MEMBERS_PAGE) {
    /* Everybody with a value has been read: the ones without follow, newest row first. */
    let q = memberQuery(db, communityId, query).is(spec.col, null)
    if (amongEmpty && c) q = q.lt("id", c.id)
    const { data, error } = await q.order("id", { ascending: false }).limit(MEMBERS_PAGE + 1 - all.length)
    if (error && !missing(error)) console.error(`[communities] members read: ${reasonOf(error)}`)
    all = [...all, ...((data as ListMember[] | null) ?? [])]
  }
  const rows = all.slice(0, MEMBERS_PAGE)
  const last = rows[rows.length - 1]
  const lastSort = last ? valueOf(last) : null
  const next = all.length > MEMBERS_PAGE && last ? (lastSort !== null ? encodeCursor(lastSort, last.id) : spec.nullable ? encodeCursor(EMPTY_PHASE, last.id) : null) : null
  return { rows: await memberViews(db, communityId, rows, opts.withEmail), next, capped: false }
}

/** How many members each status has, for the filter's counts (head requests). */
export async function memberCounts(db: Db, communityId: string): Promise<Record<string, number>> {
  const statuses = ["active", "pending", "paused", "banned", "removed", "expired", "cancelled"] as const
  const head = () => db.from("community_members").select("id", { count: "exact", head: true }).eq("community_id", communityId)
  const [counts, muted] = await Promise.all([Promise.all(statuses.map((s) => count(head().eq("status", s)))), count(head().eq("status", "active").gt("muted_until", nowIso()))])
  const by = Object.fromEntries(statuses.map((s, i) => [s, counts[i]])) as Record<string, number>
  /* The one view that holds them all, counted from the four it is made of rather than a fifth read. */
  const restricted = by.paused + by.banned + by.removed + muted
  return { ...by, muted, restricted }
}

/**
 * The members as CSV, written a page of 500 at a time while it is read, so
 * an export of 10,000 members never holds them all at once.
 */
export function membersCsv(db: Db, community: CommunityRow, query: Pick<MemberQuery, "status" | "role" | "tierId" | "joined">, opts: { withEmail: boolean }): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const col = sortColumn(query.status)
  let cursor: { sort: string; id: string } | null = null
  let started = false
  let pages = 0
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!started) {
          started = true
          controller.enqueue(encoder.encode(csvRow(["Name", "Username", ...(opts.withEmail ? ["Email"] : []), "Role", "Status", "Tier", "Level", "Points", "Joined", "Last active", "Source"])))
          return
        }
        let q = memberQuery(db, community.id, query)
        if (cursor) q = q.or(keysetOr(col, cursor.sort, cursor.id))
        const { data, error } = await q.order(col, { ascending: false }).order("id", { ascending: false }).limit(500)
        if (error) throw new Error(reasonOf(error))
        const rows = (data as ListMember[] | null) ?? []
        if (rows.length === 0 || pages >= 400) {
          controller.close()
          return
        }
        pages++
        const views = await memberViews(db, community.id, rows, opts.withEmail)
        controller.enqueue(encoder.encode(views.map((v) => csvRow([v.name, v.username ?? "", ...(opts.withEmail ? [v.email ?? ""] : []), v.role, v.status, v.tierName ?? "", v.level, v.points, v.joinedAt ?? "", v.lastActiveAt ?? "", v.source])).join("")))
        const last = rows[rows.length - 1]
        const sort = (last as unknown as Record<string, string | null>)[col]
        if (rows.length < 500 || !sort) controller.close()
        else cursor = { sort, id: last.id }
      } catch (e) {
        console.error(`[communities] members export ${community.id}: ${reasonOf(e)}`)
        controller.error(e)
      }
    },
  })
}

/**
 * Complimentary access: somebody the creator lets in without paying, on a
 * tier of their choice. Found by account email when they are not a member
 * yet (only an owner or admin sees and types emails). Taking it back ends
 * it (expired), never a paid membership.
 */
export async function grantComplimentary(db: Db, a: { community: CommunityRow; actorId: string; userId?: unknown; email?: unknown; tierId: unknown }): Promise<Result<{ userId: string }>> {
  let userId = isUuid(a.userId) ? a.userId : null
  if (!userId && typeof a.email === "string" && a.email.includes("@")) {
    const email = a.email.trim().toLowerCase().slice(0, 254)
    const { data } = await db.from("profiles").select("id").eq("email", email).limit(1)
    userId = ((data as { id: string }[] | null) ?? [])[0]?.id ?? null
    if (!userId) return no(404, "No Storelib account uses that email. Send them an invite instead.", "email")
  }
  if (!userId) return no(400, "Pick a member.", "user")
  if (!isUuid(a.tierId)) return no(400, "Pick a tier.", "tier")
  const { data: tier } = await db.from("community_tiers").select("id, name, archived_at").eq("id", a.tierId).eq("community_id", a.community.id).maybeSingle()
  if (!tier || tier.archived_at) return no(404, "That tier is not in this community.", "tier")
  const existing = await memberOf(db, a.community.id, userId)
  if (existing && (existing.status === "banned" || existing.status === "removed")) return no(409, "They were banned or removed. Bring them back from their row first.")
  if (existing?.role === "owner") return no(409, "That is the owner.")
  if (existing?.status === "active" && PAID_SOURCES.some((s) => s === existing.source)) return no(409, "They pay for their membership. Complimentary access would not change it.")
  let row: MemberRow | null = null
  if (existing && existing.status === "active") {
    const { data, error } = await db.from("community_members").update({ source: "manual", tier_id: tier.id, source_membership_id: null, source_product_id: null }).eq("id", existing.id).select(MEMBER_COLUMNS).single()
    if (error) return no(500, "That did not save. Try again.")
    row = data as MemberRow
  } else {
    row = await grantMembership(db, { communityId: a.community.id, userId, source: "manual", tierId: tier.id, status: "active", actorId: a.actorId })
  }
  if (!row) return no(503, "Communities are not set up on Storelib yet.")
  await audit(db, { communityId: a.community.id, actorId: a.actorId, actorKind: "member", action: "member.complimentary", targetType: "member", targetId: userId, targetLabel: tier.name })
  return { ok: true, userId }
}

export async function revokeComplimentary(db: Db, a: { community: CommunityRow; actorId: string; userId: unknown }): Promise<Result> {
  if (!isUuid(a.userId)) return no(404, "not_found")
  const m = await memberOf(db, a.community.id, a.userId)
  if (!m || m.status !== "active") return no(404, "They are not a member.")
  if (m.source !== "manual") return no(409, "Their access is not complimentary.")
  await revokeMembership(db, { communityId: a.community.id, userId: a.userId, status: "expired", reason: "complimentary access ended", actorId: a.actorId })
  return { ok: true }
}
