import "server-only"

/**
 * WHAT EVERY MEMBER PAGE READS FIRST: the community by its address and who is
 * looking, once per request. The route group's layout and the page under it
 * both ask (React's cache makes the second ask free), so the reconcile in
 * viewerContext runs once per page view, not twice.
 */
import { cache } from "react"
import { communitiesEnabled } from "@/lib/communities/flag"
import { communityOpen, loadCommunity, viewerContext, type Viewer } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { listSpaces, spaceViews } from "@/lib/communities/server/feed"
import { unreadCounts } from "@/lib/communities/server/chat"
import { unreadConversations } from "@/lib/communities/server/direct"
import { unreadNotificationCount } from "@/lib/communities/server/mentions"
import { communityStats, type CommunityStats } from "@/lib/communities/server/presence"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import type { CommunityRow, SpaceRow } from "@/lib/communities/types"
import type { ShellCommunity, SpaceView } from "./view-types"

export type MemberState = "off" | "missing" | "closed" | "signed_out" | "unknown" | "member" | "pending" | "banned" | "not_member"

export interface MemberPage {
  state: MemberState
  community: CommunityRow | null
  viewer: Viewer | null
}

/** The community at this address and the viewer's standing in it, read once per request. */
export const memberPage = cache(async (slug: string): Promise<MemberPage> => {
  if (!(await communitiesEnabled())) return { state: "off", community: null, viewer: null }
  const db = admin()
  const community = await loadCommunity(db, { slug })
  if (!community) return { state: "missing", community: null, viewer: null }
  const current = await currentUserForRequest()
  const userId = current.user?.id ?? null
  if (!userId) return { state: current.state === "indeterminate" ? "unknown" : "signed_out", community, viewer: null }
  const viewer = await viewerContext(db, community, userId)
  if (!communityOpen(community) && !viewer.isOwner) return { state: "closed", community, viewer }
  /* A draft is its owner's and its staff's until it is published. */
  if (community.status === "draft" && !(viewer.active && viewer.role && viewer.role !== "member")) return { state: "not_member", community, viewer }
  if (viewer.active) return { state: "member", community, viewer }
  if (viewer.banned) return { state: "banned", community, viewer }
  if (viewer.status === "pending") return { state: "pending", community, viewer }
  return { state: "not_member", community, viewer }
})

export function toShellCommunity(c: CommunityRow): ShellCommunity {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    tagline: c.tagline,
    logoUrl: c.logo_url,
    coverUrl: c.cover_url,
    memberCount: c.member_count,
    postCount: c.post_count,
    classroomEnabled: c.classroom_enabled,
    eventsEnabled: c.events_enabled,
    directoryEnabled: c.directory_enabled,
    chatEnabled: c.chat_enabled,
    gamificationEnabled: c.gamification_enabled,
    archived: c.status === "archived" || !!c.archived_at,
  }
}

export interface ShellData {
  community: ShellCommunity
  spaces: SpaceView[]
  rows: SpaceRow[]
  unreadNotifications: number
  /** Conversations with something unread; null when member messages are not available here. */
  unreadMessages: number | null
}

/** The spaces the viewer may see (with unread chat counts) and their unread notifications, once per request. */
export const shellData = cache(async (communityId: string, viewer: Viewer, community: CommunityRow): Promise<ShellData> => {
  const db = admin()
  const rows = await listSpaces(db, communityId)
  const chatIds = rows.filter((s) => s.kind === "chat").map((s) => s.id)
  const [unread, notifications, messages] = await Promise.all([
    community.chat_enabled && chatIds.length ? unreadCounts(db, viewer, chatIds) : Promise.resolve(new Map<string, number>()),
    viewer.userId ? unreadNotificationCount(db, communityId, viewer.userId) : Promise.resolve(0),
    unreadConversations(db, community, viewer),
  ])
  return { community: toShellCommunity(community), spaces: spaceViews(rows, viewer, community, unread), rows, unreadNotifications: notifications, unreadMessages: messages }
})

/** Members, online (a real heartbeat, or null before part 85) and admins, once per request. */
export const statsFor = cache(async (community: CommunityRow): Promise<CommunityStats> => communityStats(admin(), community))

/** The product a creator's post files are uploaded under: one that sells this community, when it has one. */
export async function fileProductFor(community: CommunityRow, viewer: Viewer): Promise<string | null> {
  if (!viewer.isCreatorAccount || !community.creator_id) return null
  try {
    const { data } = await admin().from("products").select("id").eq("community_id", community.id).eq("creator_id", community.creator_id).limit(1).maybeSingle()
    return (data as { id: string } | null)?.id ?? null
  } catch {
    return null
  }
}

/** The viewer's own name and picture, for the composer. */
export async function meOf(communityId: string, viewer: Viewer): Promise<{ name: string; avatarUrl: string | null }> {
  if (!viewer.userId) return { name: "Member", avatarUrl: null }
  const { authorViews } = await import("@/lib/communities/server/directory")
  const me = (await authorViews(admin(), communityId, [viewer.userId])).get(viewer.userId)
  return { name: me?.name ?? "Member", avatarUrl: me?.avatarUrl ?? null }
}

/** The next scheduled event the viewer may see, for the side column; null when events are off or none is coming. */
export async function upcomingEventFor(community: CommunityRow, viewer: Viewer): Promise<{ id: string; title: string; startsAt: string; endsAt: string | null } | null> {
  if (!community.events_enabled) return null
  try {
    const { evaluateAccess } = await import("@/lib/communities/access")
    const { accessOf } = await import("@/lib/communities/server/feed")
    const { data } = await admin()
      .from("community_events")
      .select("id, title, starts_at, ends_at, access, status")
      .eq("community_id", community.id)
      .eq("status", "scheduled")
      .gt("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(5)
    const next = ((data as { id: string; title: string; starts_at: string; ends_at: string | null; access: unknown }[] | null) ?? []).find((e) => evaluateAccess(e.access as never, accessOf(viewer)).ok)
    return next ? { id: next.id, title: next.title, startsAt: next.starts_at, endsAt: next.ends_at } : null
  } catch {
    return null
  }
}

/** The welcome a new member sees once, when the creator switched it on and they have not seen it. */
export function onboardingFor(community: CommunityRow, viewer: Viewer, spaces: SpaceView[]) {
  const o = community.onboarding ?? {}
  if (!o.enabled || !viewer.member || viewer.member.onboarded_at) return null
  const intro = o.askIntro ? spaces.find((s) => s.slug === "introductions" && s.canPost) : null
  return {
    name: community.name,
    welcome: (o.welcome || "").trim() || null,
    rules: o.showRules && Array.isArray(community.rules) ? community.rules.slice(0, 20).filter((r) => r && typeof r.title === "string") : [],
    introHref: intro ? `/community/${community.slug}/space/${intro.slug}` : null,
  }
}

/** The spaces a post may go to from this composer. */
export function composerSpaces(spaces: SpaceView[]) {
  return spaces.filter((s) => s.canPost && s.kind !== "chat").map((s) => ({ id: s.id, name: s.name, kind: s.kind }))
}
