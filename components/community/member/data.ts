import "server-only"
import { welcomeVideoSrc } from "@/lib/communities/post-media"

/**
 * WHAT EVERY MEMBER PAGE READS FIRST: the community by its address and who is
 * looking, once per request. The route group's layout and the page under it
 * both ask (React's cache makes the second ask free), so the reconcile in
 * viewerContext runs once per page view, not twice.
 */
import { cache } from "react"
import { communitiesEnabled } from "@/lib/communities/flag"
import { communityOpen, viewerContext, type Viewer } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { listSpaces, spaceViews } from "@/lib/communities/server/feed"
import { unreadCounts } from "@/lib/communities/server/chat"
import { unreadConversations } from "@/lib/communities/server/direct"
import { loadChatSettings } from "@/lib/communities/server/chat-settings"
import { chatTabOf } from "@/lib/communities/chat-rules"
import { librarySettings } from "@/lib/communities/server/library"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { communityBySlug, warmTopBar } from "@/lib/communities/server/public"
import { warmWall } from "@/lib/communities/server/wall"
export { eventHrefFor } from "@/lib/communities/server/wall"
import type { CommunityRow, SpaceRow } from "@/lib/communities/types"
import type { ShellCommunity, SpaceView } from "./view-types"
import { coverPosition, pageLookOf } from "@/lib/communities/page-look"
import { socialLinksOf } from "@/lib/communities/social-links"
import { htmlToPlainText } from "@/lib/rich-text/html"
import { cardSummary } from "@/components/community/public/about-facts"

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
  /*
    ROUND 39: THE COMMUNITY AND WHO IS LOOKING AT ONCE. Neither needs the other, and every page of a community (its frame
    included) waited on one and then the other: one round trip to the database and one to the sign in, in a row, before
    anything else could start (scripts/measure-community-member-server.mjs).
  */
  /*
    The same read the page and its metadata make (communityBySlug, round rel2-public): the community's row once per
    request, live, so who may see it is always decided from the row as it is now.
  */
  const [community, current] = await Promise.all([communityBySlug(slug), currentUserForRequest()])
  if (!community) return { state: "missing", community: null, viewer: null }
  const userId = current.user?.id ?? null
  /*
    AND WHAT THE FRAME NEEDS WITHOUT THE VIEWER'S STANDING, ASKED NOW, beside it (round 39): the top bar's reads (both
    frames draw the bar), and for somebody signed in the community's spaces, its chat settings and the wall's own facts
    (the member frame's: lib/communities/server/wall.ts warmWall, held WALL_CACHE_S for every member).
    The frame takes the same answers (React's cache, one per request) instead of asking after the standing is in.
  */
  warmTopBar(community, userId)
  if (userId) {
    warmWall(community)
    spacesForRequest(community.id).catch(() => undefined)
    if (community.chat_enabled) chatSettingsForRequest(community.id).catch(() => undefined)
  }
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
    coverPosition: coverPosition(pageLookOf(c.onboarding)) ?? null,
    memberCount: c.member_count,
    postCount: c.post_count,
    classroomEnabled: c.classroom_enabled,
    eventsEnabled: c.events_enabled,
    directoryEnabled: c.directory_enabled,
    chatEnabled: c.chat_enabled,
    gamificationEnabled: c.gamification_enabled,
    archived: c.status === "archived" || !!c.archived_at,
    access: c.access,
    visibility: c.visibility,
    approvalRequired: c.approval_required,
    /* Round 26: the card's short description (summary is part 220's column, on the row once it is read), its icons, and whether it may be shared. */
    summary: cardSummary({ summary: (c as CommunityRow & { summary?: string | null }).summary ?? null, tagline: c.tagline, descriptionPlain: htmlToPlainText(c.description) }),
    links: socialLinksOf(c.links),
    published: c.status === "published",
  }
}

export interface ShellData {
  community: ShellCommunity
  spaces: SpaceView[]
  rows: SpaceRow[]
  /** Conversations with something unread; null when member messages are not available here. */
  unreadMessages: number | null
}

/** The community's spaces and its chat settings, once per request: memberPage asks them as soon as the community is known. */
const spacesForRequest = cache((communityId: string) => listSpaces(admin(), communityId))
const chatSettingsForRequest = cache((communityId: string) => loadChatSettings(admin(), communityId))

/** The spaces the viewer may see (with unread chat counts) and their unread conversations, once per request. */
export const shellData = cache(async (communityId: string, viewer: Viewer, community: CommunityRow): Promise<ShellData> => {
  const db = admin()
  /* Round 39: the member's unread conversations need nothing from the spaces, so they are asked beside them, not after. */
  const conversations = unreadConversations(db, community, viewer)
  conversations.catch(() => undefined)
  /* Round 39: whether the Library is a place here (part 278), read beside the spaces too. */
  const libraryRead = librarySettings(db, communityId).catch(() => ({ ready: false, enabled: false }))
  const rows = await spacesForRequest(communityId)
  const chatIds = rows.filter((s) => s.kind === "chat").map((s) => s.id)
  const [unread, messages, chatSettings] = await Promise.all([
    community.chat_enabled && chatIds.length ? unreadCounts(db, viewer, chatIds) : Promise.resolve(new Map<string, number>()),
    conversations,
    community.chat_enabled && chatIds.length ? chatSettingsForRequest(communityId) : Promise.resolve(null),
  ])
  const spaces = spaceViews(rows, viewer, community, unread)
  const library = await libraryRead
  return { community: { ...toShellCommunity(community), chatTab: chatTabOf(spaces, chatSettings), libraryEnabled: library.enabled }, spaces, rows, unreadMessages: messages }
})

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
    /* Round AF: the creator's heading, intro video and button, as a popup or a card. */
    title: (o.title || "").trim() || null,
    videoEmbed: o.videoUrl ? welcomeVideoSrc(o.videoUrl) : null,
    button: (o.button || "").trim() || null,
    popup: o.style === "popup",
  }
}

/** The spaces a post may go to from this composer. */
export function composerSpaces(spaces: SpaceView[]) {
  return spaces.filter((s) => s.canPost && s.kind !== "chat").map((s) => ({ id: s.id, name: s.name, kind: s.kind }))
}
