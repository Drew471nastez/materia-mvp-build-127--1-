/**
 * ROUND 8, COMMUNITY GROWTH, with fixtures, for scripts/check-community-growth.mjs.
 * The real client components:
 *
 *   ?case=feed        the member frame (ShellFrame) on the feed: the community
 *                     card's Invite (and Settings for staff), the Invite at the
 *                     end of the row of tabs, the invite sheet they open
 *   ?case=members     the members list: Owner, Admin, Moderator as RoleBadge
 *   ?case=library     /account/communities rows: no stray "Members" beside
 *                     "by <creator>", a role where they hold one
 *
 * ?staff=1 makes the viewer an admin with a creator account (Private invites
 * in the sheet, Manage invites, Settings on the card). ?access=paid|free|
 * invite_only|approval says how the community lets people in. ?name=long
 * gives the community a long name (the phone bar's two lines).
 *
 * POST /api/community/<id>/invites is answered here (window.__invites keeps
 * what was sent); navigator.clipboard is the page's own, so the probe reads
 * what Copy wrote.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LocaleProvider } from "@/components/locale-provider"
import { ShellFrame } from "@/components/community/member/shell-frame"
import { CommunityFeed } from "@/components/community/member/feed"
import { MembersDirectory } from "@/components/community/member/members"
import { RoleBadge } from "@/components/community/member/role-badge"
import { LibraryCommunitiesList } from "@/components/community/public/library-list"
import type { LibraryCommunityRow } from "@/components/community/public/types"
import { allowedActions } from "@/lib/communities/permissions"
import type { CommunityAccess, FeedPostView, MemberView, Role, ViewerView } from "@/lib/communities/types"
import type { ShellCommunity, SpaceView, TopBarData, WallData } from "@/components/community/member/view-types"

const NOW = Date.now()
const HOUR = 3_600_000
const DAY = 24 * HOUR
const iso = (ms: number) => new Date(ms).toISOString()
const CID = "c0000000-0000-4000-8000-000000000001"

function svg(w: number, h: number, body: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`)}`
}
const COVER = svg(1600, 900, `<rect width="1600" height="900" fill="#d9cbb6"/><circle cx="1180" cy="400" r="300" fill="#c0a17e"/><rect x="0" y="620" width="1600" height="280" fill="#8f7a5f"/><circle cx="420" cy="520" r="140" fill="#efe6d8"/><rect x="370" y="380" width="100" height="150" rx="20" fill="#a9845c"/>`)
const LOGO = svg(128, 128, `<rect width="128" height="128" rx="28" fill="#1a1a2e"/><path d="M38 86 L64 40 L90 86 Z" fill="#f4efe6"/>`)
const face = (bg: string, fg: string) => svg(96, 96, `<rect width="96" height="96" fill="${bg}"/><circle cx="48" cy="38" r="18" fill="${fg}"/><rect x="18" y="62" width="60" height="40" rx="30" fill="${fg}"/>`)

const params = new URLSearchParams(location.search)
const which = params.get("case") || "feed"
const staff = params.get("staff") === "1"
const accessParam = params.get("access") || "paid"
const access: CommunityAccess = accessParam === "approval" ? "free" : (accessParam as CommunityAccess)
const longName = params.get("name") === "long"

const community: ShellCommunity = {
  id: CID,
  slug: "clay-studio",
  name: longName ? "SalajanyWood Club of Weekend Potters" : "Clay Studio",
  tagline: "A working studio for people learning wheel throwing, glazing and firing at home.",
  logoUrl: LOGO,
  coverUrl: COVER,
  memberCount: 8012,
  postCount: 3412,
  classroomEnabled: true,
  eventsEnabled: true,
  directoryEnabled: true,
  chatEnabled: true,
  gamificationEnabled: true,
  archived: false,
  access,
  approvalRequired: accessParam === "approval",
}

const role: Role = staff ? "admin" : "member"
const viewer: ViewerView = { userId: "u-me", signedIn: true, role, status: "active", active: true, tierId: null, level: 3, points: 84, isOwner: false, isCreatorAccount: staff, mutedUntil: null, can: allowedActions(role) }

const people = {
  mara: { id: "u-mara", name: "Mara Lindqvist", username: "mara", avatarUrl: face("#e8d5c4", "#8a5a3c"), role: "owner" as Role, level: 6, hasStorefront: true },
  priya: { id: "u-priya", name: "Priya Raman", username: "priya", avatarUrl: null, role: "admin" as Role, level: 5, hasStorefront: false },
  omar: { id: "u-omar", name: "Omar Haddad", username: "omar", avatarUrl: face("#dfe7ef", "#3f5f7f"), role: "moderator" as Role, level: 4, hasStorefront: false },
  jonas: { id: "u-jonas", name: "Jonas Berg", username: "jonasb", avatarUrl: face("#cfdcd2", "#3f6b4f"), role: "member" as Role, level: 3, hasStorefront: false },
  me: { id: "u-me", name: "Sam Carter", username: "samc", avatarUrl: face("#efe3cf", "#8a6d3c"), role: "member" as Role, level: 3, hasStorefront: false },
}

const topBar: TopBarData = {
  community: { id: CID, slug: community.slug, name: community.name, logoUrl: LOGO },
  creator: { name: "Mara Lindqvist", href: "/mara" },
  me: { name: people.me.name, avatarUrl: people.me.avatarUrl, profileHref: "/@samc", username: "samc", seller: staff },
  communities: [{ id: CID, slug: "clay-studio", name: community.name, logoUrl: LOGO }],
  manageHref: staff ? `/app/community/${CID}` : null,
}

const spaces: SpaceView[] = [
  { id: "s-general", slug: "general", name: "General", description: null, icon: "messages-square", kind: "feed", canPost: true, commentsEnabled: true, unread: 0 },
  { id: "s-ann", slug: "announcements", name: "Announcements", description: null, icon: "megaphone", kind: "announcements", canPost: false, commentsEnabled: true, unread: 0 },
  { id: "s-crit", slug: "critique", name: "Critique", description: null, icon: "🏺", kind: "feed", canPost: true, commentsEnabled: true, unread: 0 },
]

const post = (over: Partial<FeedPostView> & { id: string }): FeedPostView => ({
  communityId: CID,
  space: { id: "s-general", slug: "general", name: "General" },
  kind: "post",
  title: null,
  body: "",
  bodyText: "",
  media: [],
  pinned: false,
  featured: false,
  locked: false,
  status: "published",
  author: people.jonas,
  reactionCount: 0,
  commentCount: 0,
  reacted: false,
  bookmarked: false,
  poll: null,
  createdAt: iso(NOW - 2 * HOUR),
  editedAt: null,
  lastActivityAt: iso(NOW - HOUR),
  canEdit: false,
  canModerate: false,
  ...over,
})
const POSTS: FeedPostView[] = [
  post({ id: "p-pinned", pinned: true, kind: "announcement", space: { id: "s-ann", slug: "announcements", name: "Announcements" }, author: people.mara, title: "October firing schedule is up", bodyText: "Three slots this month at the shared kiln: the 9th, 16th and 27th. Book in the Kiln room by Friday so I can plan the loads.", reactionCount: 42, commentCount: 18, createdAt: iso(NOW - 3 * DAY) }),
  post({ id: "p-text", author: people.priya, title: "Test tiles on the same shelf", bodyText: "Glaze tip that saved me a whole batch: test tiles on the same shelf height as the real pieces.", reactionCount: 24, commentCount: 9, createdAt: iso(NOW - 2 * DAY) }),
]

const wall: WallData = {
  card: {
    stats: { members: 8012, online: 191, admins: 2 },
    faces: [people.mara, people.priya, people.jonas, people.omar, people.me].map((p) => ({ id: p.id, name: p.name, username: p.username, avatarUrl: p.avatarUrl, hasStorefront: p.hasStorefront })),
    more: 8007,
    settingsHref: staff ? `/app/community/${CID}/settings` : null,
  },
  upcoming: { id: "e1", title: "Live critique: trimming feet", startsAt: iso(NOW + 4 * DAY), endsAt: iso(NOW + 4 * DAY + 90 * 60_000), going: 128 },
  contributors: { basis: "points", since: null, rows: [{ rank: 1, userId: people.priya.id, name: people.priya.name, username: people.priya.username, avatarUrl: people.priya.avatarUrl, value: 420 }] },
}

const member = (p: (typeof people)[keyof typeof people], bio: string | null = null): MemberView => ({
  userId: p.id,
  name: p.name,
  username: p.username,
  avatarUrl: p.avatarUrl,
  role: p.role,
  status: "active",
  tierId: null,
  tierName: null,
  level: p.level,
  levelName: null,
  points: p.level * 37,
  bio,
  joinedAt: iso(NOW - p.level * 30 * DAY),
  lastActiveAt: iso(NOW - HOUR),
  hasStorefront: p.hasStorefront,
})
const MEMBERS = [member(people.mara, "Runs Clay Studio."), member(people.priya, "Glaze chemistry nerd."), member(people.omar, "Keeps the critique space kind."), member(people.jonas, "Weekend potter, Lisbon."), member(people.me)]

/* The feed's lists and the staff invites, answered in the page. */
type W = Window & { __invites?: unknown[] }
const w = window as W
w.__invites = []
const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const u = new URL(url, location.origin)
  if (/\/api\/community\/[^/]+\/invites$/.test(u.pathname) && init?.method === "POST") {
    const body = JSON.parse(String(init.body || "{}"))
    w.__invites!.push(body)
    await new Promise((r) => setTimeout(r, 120))
    const token = body.email ? "tok-email-7f3a9c2e1b5d4a6f8e0c" : "tok-link-2b9e7c4a1f6d3e8a0c5b"
    return new Response(JSON.stringify({ invite: { id: "i1", email: body.email ?? null, url: `https://storelib.com/community/clay-studio/join?invite=${token}` }, sent: body.email ? true : null }), { status: 201, headers: { "Content-Type": "application/json" } })
  }
  if (/\/api\/community\/[^/]+\/(posts|bookmarks)$/.test(u.pathname)) return new Response(JSON.stringify({ pinned: [], posts: POSTS.slice(1), nextCursor: null }), { status: 200, headers: { "Content-Type": "application/json" } })
  if (/\/presence$/.test(u.pathname)) return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } })
  return realFetch(input, init)
}

/* ── The library rows ─────────────────────────────────────────────────── */

const libRow = (over: Partial<LibraryCommunityRow> & { id: string; slug: string; name: string }): LibraryCommunityRow => ({
  logoUrl: LOGO,
  coverUrl: null,
  creatorName: "Mara Lindqvist",
  status: "active",
  role: "member",
  tierName: "Members",
  memberCount: 8012,
  url: `/community/${over.slug}`,
  card: { id: over.id, slug: over.slug, name: over.name, tagline: "A working studio for people learning wheel throwing.", logoUrl: LOGO, coverUrl: null, category: null, access: "paid", visibility: "public", memberCount: 8012, priceLine: "$9/month", creator: { id: "cr1", name: "Mara Lindqvist", username: "mara", avatarUrl: people.mara.avatarUrl }, url: `/community/${over.slug}`, viewCount: 1200, rating: null },
  ...over,
})
const LIBRARY: LibraryCommunityRow[] = [
  libRow({ id: "l1", slug: "clay-studio", name: "Clay Studio" }),
  libRow({ id: "l2", slug: "night-runners", name: "Night Runners", role: "owner", tierName: "Members" }),
  libRow({ id: "l3", slug: "film-club", name: "Film Photo Club", role: "member", tierName: "Gold" }),
  libRow({ id: "l4", slug: "glaze-lab", name: "Glaze Lab", status: "pending", tierName: null }),
]

function Screen() {
  if (which === "library") {
    return (
      <div className="min-h-svh bg-[#f8f9fa] px-4 py-6">
        <div className="mx-auto max-w-[760px]">
          <LibraryCommunitiesList rows={LIBRARY} />
          <div className="mt-8 flex flex-wrap items-center gap-6 rounded-2xl border border-[#e5e7eb] bg-white p-4" data-badge-strip="">
            <span className="text-[15px] font-semibold text-[#1a1a2e]">Mara Lindqvist</span>
            <RoleBadge role="owner" />
            <RoleBadge role="admin" />
            <RoleBadge role="moderator" />
            <RoleBadge role="member" />
          </div>
        </div>
      </div>
    )
  }
  const shell = (children: React.ReactNode) => (
    <ShellFrame community={community} viewer={viewer} topBar={topBar} unreadMessages={2} wall={wall}>
      {children}
    </ShellFrame>
  )
  if (which === "members") return shell(<MembersDirectory communityId={CID} slug={community.slug} memberCount={community.memberCount} initial={{ members: MEMBERS, nextCursor: null }} meId="u-me" canMessage />)
  return shell(
    <CommunityFeed
      communityId={CID}
      slug={community.slug}
      viewer={viewer}
      spaces={spaces}
      start={{ kind: "all" }}
      initial={{ pinned: [POSTS[0]], posts: POSTS.slice(1), nextCursor: null }}
      servedAt={Date.now()}
      compose={{ userId: "u-me", me: { name: people.me.name, avatarUrl: people.me.avatarUrl }, fileProductId: null, eventHref: null }}
    />,
  )
}

try {
  window.localStorage.clear()
} catch {
  /* fine */
}
createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <Screen />
  </LocaleProvider>,
)
