import "server-only"

/**
 * ===========================================================================
 *  WHAT EACH SECTION OF /app/community/<slug> READS, IN ONE PLACE
 * ===========================================================================
 * A section's page (app/app/community/[id]/<section>/page.tsx) is two parts
 * since round 32: the gate (sectionPage, lib/communities/server/creator.ts),
 * and inside a Suspense boundary the section drawn from what it reads here.
 * The shell and the section's frame are on screen while these run.
 *
 * Every read a section needs goes in one Promise.all: none waits on another
 * unless it needs its answer. scripts/measure-community-admin-server.mjs
 * runs these against a database that answers each read after a set latency
 * and prints how many reads each section makes and how many rounds of them
 * the page waits on.
 */
import { can, meetsRole } from "../permissions"
import { communityHead, listMembers, loadBadges, loadEvents, loadFeedRows, loadOverview, loadSettings, loadSpaces, memberCounts, ruleOptions, type CreatorPageContext } from "./creator"
import { listInvites } from "./invites"
import { auditLog, listReports } from "./moderation"
import { leaveReasonsSummary } from "./leave-reasons"
import { learnBuilderFor } from "./learn-builder"
import { scheduledPanelReads } from "./scheduled-posts"
import { parseMemberQuery } from "@/components/community/creator/logic"
import { pageEditorReads } from "./page-editor"

type Query = Record<string, string | undefined>
type TierLite = { id: string; name: string; kind: string }

const liveTiers = (ctx: CreatorPageContext) =>
  ctx.db.from("community_tiers").select("id, name, kind").eq("community_id", ctx.community.id).is("archived_at", null).order("position", { ascending: true }).limit(50)

/** /app/community/<slug>: the figures, the next events, what is waiting, and why people left (the owner and admins). */
export async function overviewReads(ctx: CreatorPageContext) {
  const [head, data, left] = await Promise.all([communityHead(ctx), loadOverview(ctx), meetsRole(ctx.role, "admin") ? leaveReasonsSummary(ctx.db, ctx.community.id) : Promise.resolve(null)])
  return { head, data, left }
}

/**
 * Posts: the first page of the feed, the spaces this person may post in, and (round 33) the Scheduled and drafts panel's
 * rows, in the same round, so the panel is drawn with the page rather than after a request of its own. A panel read that
 * fails is null, and the panel then reads itself as it did before.
 */
export async function feedReads(ctx: CreatorPageContext) {
  const panel = can(ctx.role, "post", ctx.viewer.perms) ? scheduledPanelReads(ctx.db, ctx.community, ctx.viewer, ctx.userId).catch(() => null) : Promise.resolve(null)
  const [head, rows, spaces, scheduled] = await Promise.all([communityHead(ctx), loadFeedRows(ctx.db, ctx.community.id, { cursor: null, show: "all" }), loadSpaces(ctx.db, ctx.community.id), panel])
  const postable = spaces
    .filter((s) => !s.archived && s.kind !== "chat" && meetsRole(ctx.role, s.postRole) && (s.kind !== "announcements" || can(ctx.role, "announce", ctx.viewer.perms)))
    .map((s) => ({ id: s.id, name: s.name, announcements: s.kind === "announcements" }))
  return { head, rows, spaces: postable, scheduled }
}

export async function spacesReads(ctx: CreatorPageContext) {
  const [head, spaces, options] = await Promise.all([communityHead(ctx), loadSpaces(ctx.db, ctx.community.id), ruleOptions(ctx.db, ctx.community.id)])
  return { head, spaces, options }
}

export async function learnReads(ctx: CreatorPageContext) {
  return { initial: await learnBuilderFor(ctx.db, ctx.community).catch(() => null) }
}

export async function eventsReads(ctx: CreatorPageContext) {
  const [head, events, options] = await Promise.all([communityHead(ctx), loadEvents(ctx.db, ctx.community.id), ruleOptions(ctx.db, ctx.community.id)])
  return { head, events, options }
}

/** Members: everyone, 50 at a time, the counts per status, the tiers, the invites and the badges. */
export async function membersReads(ctx: CreatorPageContext, sp: Query) {
  const query = { ...parseMemberQuery(sp), q: "", cursor: null }
  const canEmail = can(ctx.role, "manage_members", ctx.viewer.perms)
  const [head, page, counts, tiers, invites, badges] = await Promise.all([
    communityHead(ctx),
    listMembers(ctx.db, ctx.community.id, query, { withEmail: canEmail }),
    memberCounts(ctx.db, ctx.community.id),
    liveTiers(ctx),
    can(ctx.role, "invite", ctx.viewer.perms) ? listInvites(ctx.db, ctx.community.id, null) : Promise.resolve({ rows: [], next: null }),
    ctx.community.gamification_enabled ? loadBadges(ctx.db, ctx.community.id) : Promise.resolve([]),
  ])
  return { head, query, canEmail, page, counts, tiers: (tiers.data as TierLite[] | null) ?? [], invites, badges }
}

/** Moderation: what a tab needs is read only when the role may use it. */
export async function moderationReads(ctx: CreatorPageContext, query: Query) {
  const { db, community: c } = ctx
  const restrict = can(ctx.role, "mute", ctx.viewer.perms) || can(ctx.role, "suspend", ctx.viewer.perms) || can(ctx.role, "ban", ctx.viewer.perms)
  const page = (status: "muted" | "paused" | "banned" | "removed") => listMembers(db, c.id, { status, role: null, tierId: null, q: "", cursor: null }, { withEmail: can(ctx.role, "manage_members", ctx.viewer.perms) })
  /* Removed members belong here too: Remove had no way back at all before (round 14). */
  const canRemove = can(ctx.role, "remove_member", ctx.viewer.perms)
  const [head, reports, audit, muted, paused, banned, removed, tiers, badges] = await Promise.all([
    communityHead(ctx),
    listReports(db, c.id, { status: query.tab === "resolved" ? "closed" : "open", cursor: null }),
    can(ctx.role, "view_audit", ctx.viewer.perms) ? auditLog(db, c.id, null) : Promise.resolve(null),
    restrict ? page("muted") : Promise.resolve(null),
    restrict ? page("paused") : Promise.resolve(null),
    restrict ? page("banned") : Promise.resolve(null),
    restrict && canRemove ? page("removed") : Promise.resolve(null),
    can(ctx.role, "manage_members", ctx.viewer.perms) ? liveTiers(ctx) : Promise.resolve({ data: [] }),
    c.gamification_enabled && can(ctx.role, "award_points", ctx.viewer.perms) ? loadBadges(db, c.id) : Promise.resolve([]),
  ])
  return {
    head,
    reports,
    audit,
    restricted: muted && paused && banned ? { muted, paused, banned, removed: removed ?? { rows: [], next: null, capped: false } } : null,
    restrictAllowed: restrict,
    tiers: (tiers.data as TierLite[] | null) ?? [],
    badges,
  }
}

/** Analytics asks for its period itself, in the viewer's time zone (round 31): the page reads the head only. */
export async function analyticsReads(ctx: CreatorPageContext) {
  return { head: await communityHead(ctx) }
}

export async function settingsReads(ctx: CreatorPageContext) {
  const [head, data] = await Promise.all([communityHead(ctx), loadSettings(ctx)])
  return { head, data }
}

/** Every section's reads by its id, for the measure. */
export const ADMIN_SECTION_READS: Record<string, (ctx: CreatorPageContext, query: Query) => Promise<unknown>> = {
  overview: overviewReads,
  feed: feedReads,
  spaces: spacesReads,
  learn: learnReads,
  events: eventsReads,
  members: membersReads,
  moderation: moderationReads,
  analytics: analyticsReads,
  settings: settingsReads,
  /* Round 33: the Page editor (./page-editor.ts). */
  page: pageEditorReads,
}
