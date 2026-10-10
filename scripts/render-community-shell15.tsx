/**
 * ===========================================================================
 *  ROUND 15: THE COMMUNITY SHELL WITH ITS PLACE HOST, FOR MEASURING
 * ===========================================================================
 * scripts/check-community-shell15.mjs. The real frame (ShellFrame, which is
 * the navigator's provider and holds the place host), the real places
 * (CommunityFeed, MembersDirectory, Leaderboard, EventsPage, About's
 * CommunitySalesPage), and the same fixtures as scripts/render-community-
 * shell.tsx (copied from it, so "before" there and "after" here draw the
 * same data). The route's page is the feed's PlaceSeed, as the server would
 * draw it.
 *
 * GET /api/community/<id>/place?p=<place> is answered here after
 * window.__placeLatency ms (600 by default, the live site's RSC time for a
 * community place), each ask recorded in window.__placeCalls. ?idle=0 stops
 * idle callbacks, so nothing is read ahead (the cold measurements).
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LocaleProvider } from "@/components/locale-provider"
import { ShellFrame } from "@/components/community/member/shell-frame"
import { PlaceSeed } from "@/components/community/member/place-host"
import type { PlaceData } from "@/lib/communities/client/place-data"
import { placeFromKey } from "@/lib/communities/client/places"
import { openCommunitySearch } from "@/lib/nav/community-search-bridge"
import { CommunityFeed } from "@/components/community/member/feed"
import { PullToRefreshEvent } from "@/components/ui/pull-to-refresh"
import { MembersDirectory } from "@/components/community/member/members"
import { ClassroomLibrary } from "@/components/community/classroom/classroom-library"
import type { ClassroomCourse } from "@/components/community/classroom/model"
import { EventsPage } from "@/components/community/events/events-page"
import type { EventCardView } from "@/components/community/events/model"
import { Leaderboard } from "@/components/community/member/leaderboard"
import { CommunityPublicFrame } from "@/components/community/public/public-frame"
import { CommunitySalesPage } from "@/components/community/public/sales-page"
import { decideJoin } from "@/components/community/public/join-state"
import { checkoutPath } from "@/components/community/public/paths"
import type { JoinOption, PublicCommunityView, SalesPageData } from "@/components/community/public/types"
import { allowedActions } from "@/lib/communities/permissions"
import type { FeedPostView, MemberView, Role, ViewerView } from "@/lib/communities/types"
import type { ShellCommunity, SpaceView, TopBarData, WallData } from "@/components/community/member/view-types"
import { MembershipPage } from "@/components/community/member/membership"
import { CommunityContributions } from "@/components/profile/community-contributions"
import type { ContributionSection } from "@/lib/profile/shared-view"

const NOW = Date.now()
const HOUR = 3_600_000
const DAY = 24 * HOUR
const iso = (ms: number) => new Date(ms).toISOString()
const CID = "c0000000-0000-4000-8000-000000000001"

/* Pictures drawn here, so the probe needs no network: muted, natural tones, never a purple gradient. */
function svg(w: number, h: number, body: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`)}`
}
const SHOTS = [
  svg(1600, 900, `<rect width="1600" height="900" fill="#d9cbb6"/><circle cx="1180" cy="400" r="300" fill="#c0a17e"/><rect x="0" y="620" width="1600" height="280" fill="#8f7a5f"/><circle cx="420" cy="520" r="140" fill="#efe6d8"/><rect x="370" y="380" width="100" height="150" rx="20" fill="#a9845c"/>`),
  svg(1600, 900, `<rect width="1600" height="900" fill="#cfdbd5"/><path d="M0 640 C 400 480, 800 780, 1600 560 L1600 900 L0 900 Z" fill="#6f8f7f"/><circle cx="1260" cy="240" r="110" fill="#f2efe6"/>`),
  svg(1600, 900, `<rect width="1600" height="900" fill="#e7e2d8"/><rect x="200" y="200" width="560" height="480" rx="28" fill="#2f3a44"/><rect x="820" y="280" width="600" height="48" rx="24" fill="#b9b2a5"/><rect x="820" y="370" width="440" height="48" rx="24" fill="#cfc9be"/>`),
  svg(1600, 900, `<rect width="1600" height="900" fill="#22303c"/><circle cx="320" cy="450" r="240" fill="#36485a"/><circle cx="1300" cy="300" r="170" fill="#d3a35e"/>`),
  svg(1600, 900, `<rect width="1600" height="900" fill="#efe9e1"/><ellipse cx="800" cy="560" rx="360" ry="220" fill="#b98f6a"/><ellipse cx="800" cy="470" rx="250" ry="90" fill="#d9b994"/>`),
  svg(1600, 900, `<rect width="1600" height="900" fill="#dfe4ea"/><rect x="160" y="160" width="1280" height="580" rx="32" fill="#f7f8fa"/><rect x="240" y="240" width="380" height="420" rx="20" fill="#8aa1b4"/><rect x="680" y="260" width="620" height="40" rx="20" fill="#c9d3dc"/>`),
]
const LOGO = svg(128, 128, `<rect width="128" height="128" rx="28" fill="#1a1a2e"/><path d="M38 86 L64 40 L90 86 Z" fill="#f4efe6"/>`)
const face = (bg: string, fg: string) => svg(96, 96, `<rect width="96" height="96" fill="${bg}"/><circle cx="48" cy="38" r="18" fill="${fg}"/><rect x="18" y="62" width="60" height="40" rx="30" fill="${fg}"/>`)

const params = new URLSearchParams(location.search)
const which = params.get("case") || "feed"
const wallCase = params.get("wall") || "both"
const staff = params.get("staff") === "1"

/* ── The community and who is looking ─────────────────────────────────── */

const community: ShellCommunity = {
  id: CID,
  slug: "clay-studio",
  name: "Clay Studio",
  tagline: "A working studio for people learning wheel throwing, glazing and firing at home.",
  logoUrl: LOGO,
  coverUrl: SHOTS[0],
  memberCount: 8012,
  postCount: 3412,
  classroomEnabled: true,
  eventsEnabled: true,
  directoryEnabled: true,
  chatEnabled: true,
  gamificationEnabled: true,
  archived: false,
}

const viewer: ViewerView = {
  userId: "u-me",
  signedIn: true,
  role: staff ? "admin" : "member",
  status: "active",
  active: true,
  tierId: null,
  level: 3,
  points: 84,
  isOwner: false,
  isCreatorAccount: staff,
  mutedUntil: null,
  can: allowedActions(staff ? "admin" : "member"),
}

const people = {
  mara: { id: "u-mara", name: "Mara Lindqvist", username: "mara", avatarUrl: face("#e8d5c4", "#8a5a3c"), role: "owner" as Role, level: 6, hasStorefront: true },
  jonas: { id: "u-jonas", name: "Jonas Berg", username: "jonasb", avatarUrl: face("#cfdcd2", "#3f6b4f"), role: "member" as Role, level: 3, hasStorefront: false },
  priya: { id: "u-priya", name: "Priya Raman", username: "priya", avatarUrl: null, role: "admin" as Role, level: 5, hasStorefront: false },
  leo: { id: "u-leo", name: "Leo Martins", username: null, avatarUrl: face("#d6d9ef", "#4a4f8a"), role: "member" as Role, level: 2, hasStorefront: false },
  me: { id: "u-me", name: "Sam Carter", username: "samc", avatarUrl: face("#efe3cf", "#8a6d3c"), role: "member" as Role, level: 3, hasStorefront: false },
}

const topBar = (signedIn = true): TopBarData => ({
  community: { id: CID, slug: community.slug, name: community.name, logoUrl: LOGO },
  creator: { name: "Mara Lindqvist", href: "/mara" },
  me: signedIn ? { name: people.me.name, avatarUrl: people.me.avatarUrl, profileHref: "/@samc", username: "samc", seller: staff } : null,
  communities: signedIn
    ? [
        { id: CID, slug: "clay-studio", name: "Clay Studio", logoUrl: LOGO },
        { id: "c2", slug: "night-runners", name: "Night Runners", logoUrl: null },
        { id: "c3", slug: "film-photo-club", name: "Film Photo Club", logoUrl: svg(64, 64, `<rect width="64" height="64" rx="14" fill="#36485a"/><circle cx="32" cy="32" r="14" fill="#d3a35e"/>`) },
      ]
    : [],
  manageHref: null,
})

const spaces: SpaceView[] = [
  { id: "s-general", slug: "general", name: "General", description: "Anything about the work.", icon: "messages-square", kind: "feed", canPost: true, commentsEnabled: true, unread: 0 },
  { id: "s-ann", slug: "announcements", name: "Announcements", description: null, icon: "megaphone", kind: "announcements", canPost: false, commentsEnabled: true, unread: 0 },
  { id: "s-crit", slug: "critique", name: "Critique", description: "Post a piece, get honest notes on form, trimming and glaze.", icon: "🏺", kind: "feed", canPost: true, commentsEnabled: true, unread: 0 },
  { id: "s-glaze", slug: "glaze-lab", name: "Glaze lab", description: null, icon: null, kind: "feed", canPost: true, commentsEnabled: true, unread: 0 },
  { id: "s-chat", slug: "kiln-room", name: "Kiln room", description: "Live chat.", icon: null, kind: "chat", canPost: true, commentsEnabled: true, unread: 3 },
]

/* ── Posts ────────────────────────────────────────────────────────────── */

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
  post({ id: "p-photo", space: { id: "s-crit", slug: "critique", name: "Critique" }, title: "First set of bowls that did not crack", bodyText: "Slower drying under plastic for two days made the difference. Curious whether the foot on the third one reads as too heavy.", media: [{ type: "image", url: SHOTS[4], w: 1600, h: 900 }], reactionCount: 17, commentCount: 6, author: people.leo, createdAt: iso(NOW - 5 * HOUR) }),
  post({ id: "p-text", lastActivityAt: iso(NOW - 20 * 60_000), author: people.priya, bodyText: "Glaze tip that saved me a whole batch: test tiles on the same shelf height as the real pieces. Same glaze, two shelves apart, two different colours.", reactionCount: 24, commentCount: 9, createdAt: iso(NOW - 2 * DAY) }),
  post({ id: "p-more", bookmarked: true, author: people.jonas, bodyText: "Anyone in Lisbon with a kiln to share? Happy to split costs.", reactionCount: 3, commentCount: 2, createdAt: iso(NOW - 3 * DAY) }),
  post({ id: "p-last", author: people.mara, bodyText: "Recording of last week's trimming session is in the Classroom now.", reactionCount: 31, commentCount: 4, createdAt: iso(NOW - 4 * DAY) }),
]

/* ── The feed's lists, answered in the page ─────────────────────────────── */

/* Glaze lab's own posts, so a switch to it has something to show. */
const GLAZE: FeedPostView[] = [
  post({ id: "p-glaze-1", space: { id: "s-glaze", slug: "glaze-lab", name: "Glaze lab" }, author: people.priya, title: "Celadon over a dark body", bodyText: "Two coats, cone 6, slow cool. The pooling in the rings is what I was after.", reactionCount: 12, commentCount: 3, createdAt: iso(NOW - 7 * HOUR), lastActivityAt: iso(NOW - 30 * 60_000) }),
  post({ id: "p-glaze-2", space: { id: "s-glaze", slug: "glaze-lab", name: "Glaze lab" }, author: people.jonas, bodyText: "Does anyone sieve their glaze twice? Mine still has lumps after 80 mesh.", reactionCount: 4, commentCount: 7, createdAt: iso(NOW - DAY) }),
]
const ALL_POSTS = [...POSTS, ...GLAZE]
type W = Window & { __feedLatency?: number; __feedCalls?: string[]; __feedSpans?: { url: string; start: number; end: number }[]; __navigate?: (href: string) => void; __onPrefetch?: (href: string) => void }
const w = window as W
w.__feedCalls = []
w.__feedSpans = []
/* The phone's tab bar Search, which opens the community's search screen (round 9: the bar has no icon for it). */
;(window as unknown as { __openCommunitySearch: typeof openCommunitySearch }).__openCommunitySearch = openCommunitySearch
/* ?idle=0: no idle callbacks, so nothing is read ahead (the uncached measurements). */
if (new URLSearchParams(location.search).get("idle") === "0") {
  ;(window as unknown as { requestIdleCallback: () => number }).requestIdleCallback = () => 0
  ;(window as unknown as { cancelIdleCallback: () => void }).cancelIdleCallback = () => {}
}
const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const u = new URL(url, location.origin)
  const feed = /\/api\/community\/[^/]+\/posts$/.test(u.pathname) && (!init?.method || init.method === "GET")
  const saved = /\/api\/community\/[^/]+\/bookmarks$/.test(u.pathname)
  if (!feed && !saved) return realFetch(input, init)
  w.__feedCalls!.push(u.pathname.split("/").pop() + u.search)
  const span = { url: u.pathname.split("/").pop() + u.search, start: performance.now(), end: 0 }
  w.__feedSpans!.push(span)
  await new Promise((r) => setTimeout(r, w.__feedLatency ?? 250))
  span.end = performance.now()
  let list = saved ? ALL_POSTS.filter((p) => p.bookmarked) : ALL_POSTS
  const space = u.searchParams.get("space")
  if (space) list = list.filter((p) => p.space?.id === space)
  const sort = u.searchParams.get("sort") || "default"
  let pinned: FeedPostView[] = []
  if (!saved) {
    if (sort === "default") {
      pinned = list.filter((p) => p.pinned)
      list = list.filter((p) => !p.pinned).sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt))
    } else if (sort === "new") list = [...list].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    else if (sort === "top") list = [...list].sort((a, b) => b.reactionCount - a.reactionCount)
    else if (sort === "unread") list = list.filter((p) => Date.parse(p.lastActivityAt) > NOW - 45 * 60_000).sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt))
  }
  return new Response(JSON.stringify({ pinned, posts: list, nextCursor: null }), { status: 200, headers: { "Content-Type": "application/json" } })
}

/* ── Members ──────────────────────────────────────────────────────────── */

type Person = (typeof people)[keyof typeof people]
const member = (p: Person, extra: Partial<MemberView> = {}): MemberView => ({
  userId: p.id,
  name: p.name,
  username: p.username,
  avatarUrl: p.avatarUrl,
  role: p.role,
  status: "active",
  tierId: null,
  tierName: null,
  level: p.level,
  levelName: ["", "Newcomer", "Regular", "Contributor", "Insider", "Core", "Pillar"][p.level] ?? null,
  points: p.level * 37,
  bio: null,
  joinedAt: iso(NOW - p.level * 30 * DAY),
  lastActiveAt: iso(NOW - HOUR),
  hasStorefront: p.hasStorefront,
  ...extra,
})
/* Round 12: where people are from, as the server words it (lib/communities/location.ts placeLine). */
const MEMBERS: MemberView[] = [
  member(people.mara, { bio: "Runs Clay Studio. Twelve years running a pottery workshop.", location: "Lisbon, Portugal" }),
  member(people.priya, { bio: "Glaze chemistry nerd.", location: "Bengaluru, India" }),
  member(people.me, { location: "United Kingdom" }),
  member(people.jonas, { bio: "Weekend potter, Lisbon.", location: "Porto, Portugal" }),
  member(people.leo),
]

/* ── The wall's side columns ──────────────────────────────────────────── */

const wall: WallData = {
  card: {
    stats: { members: 8012, online: 191, admins: 2 },
    faces: [people.mara, people.priya, people.jonas, people.leo, people.me, { ...people.jonas, id: "u-ana", name: "Ana Ruiz", username: "ana", avatarUrl: face("#dfe7ef", "#3f5f7f") }, { ...people.leo, id: "u-tom", name: "Tom Hale", username: "tomh", avatarUrl: face("#efe6dc", "#7a5a3c") }].map((p) => ({ id: p.id, name: p.name, username: p.username, avatarUrl: p.avatarUrl, hasStorefront: p.hasStorefront })),
    more: 8005,
    settingsHref: staff ? `/app/community/${CID}/settings` : null,
  },
  upcoming: wallCase === "both" || wallCase === "event" ? { id: "e1", title: "Live critique: trimming feet", startsAt: iso(NOW + 4 * DAY), endsAt: iso(NOW + 4 * DAY + 90 * 60_000), going: 128 } : null,
  contributors:
    wallCase === "both" || wallCase === "contributors"
      ? { basis: "points", since: null, rows: [{ rank: 1, userId: people.priya.id, name: people.priya.name, username: people.priya.username, avatarUrl: people.priya.avatarUrl, value: 420 }, { rank: 2, userId: people.jonas.id, name: people.jonas.name, username: people.jonas.username, avatarUrl: people.jonas.avatarUrl, value: 312 }, { rank: 3, userId: people.leo.id, name: people.leo.name, username: people.leo.username, avatarUrl: people.leo.avatarUrl, value: 287 }] }
      : wallCase === "activity"
        ? { basis: "activity", since: null, rows: [{ rank: 1, userId: people.jonas.id, name: people.jonas.name, username: people.jonas.username, avatarUrl: people.jonas.avatarUrl, value: 14 }, { rank: 2, userId: people.priya.id, name: people.priya.name, username: people.priya.username, avatarUrl: people.priya.avatarUrl, value: 9 }] }
        : null,
}

/* ── The about page ───────────────────────────────────────────────────── */

const pro: JoinOption = {
  tierId: "tier-pro",
  name: "Studio members",
  description: "Weekly critiques, the full course library and the members' chat.",
  kind: "paid",
  billing: "recurring",
  productId: "prod-pro",
  monthlyCents: 900,
  yearlyCents: 9000,
  priceCents: null,
  currency: "usd",
  priceLine: "$9/month",
  benefits: [],
  checkout: { month: checkoutPath("prod-pro", "clay-studio", "month"), year: checkoutPath("prod-pro", "clay-studio", "year"), once: null },
}
const free: JoinOption = { tierId: "tier-free", name: "Members", description: null, kind: "free", billing: null, productId: null, monthlyCents: null, yearlyCents: null, priceCents: null, currency: "usd", priceLine: "Free", benefits: [], checkout: null }

const VIDEO = "a1111111-1111-4111-8111-111111111111"
const studio: PublicCommunityView = {
  id: CID,
  slug: "clay-studio",
  name: "Clay Studio",
  tagline: community.tagline,
  logoUrl: LOGO,
  coverUrl: SHOTS[0],
  category: "education",
  visibility: "private",
  access: "paid",
  status: "published",
  approvalRequired: false,
  memberCount: 8012,
  descriptionHtml:
    "<p>Clay Studio is where I share what I learned over twelve years of running a pottery workshop. Every week there is a live critique where members post a piece and we talk through form, trimming and glaze.</p><p>You get the full course library, a monthly firing schedule if you work with a shared kiln, and a quiet place to ask questions without the noise of a big forum.</p><h3>Who it is for</h3><ul><li>Beginners with their first wheel</li><li>Hobbyists who want honest feedback</li><li>Teachers looking for structure</li></ul>",
  descriptionText: null,
  benefits: ["Weekly live critique, recorded", "The full course library: 9 courses, 140 lessons", "Monthly glaze recipe drop", "Members' chat and the studio directory"],
  rules: [
    { title: "Critique the piece, not the person", body: "Say what you see and what you would try next. Keep it specific." },
    { title: "Credit recipes", body: "If you share a glaze recipe that is not yours, say where it came from." },
    { title: "No selling in the feed", body: "Use the marketplace space for anything you want to sell." },
    { title: "Photos of your own work only", body: "" },
  ],
  faq: [
    { q: "Do I need my own kiln?", a: "No. Most members fire at a shared studio. The firing schedule helps you plan around it." },
    { q: "Can I cancel?", a: "Yes, any time from your library. You keep access until the end of the period you paid for." },
  ],
  creator: { name: "Mara Lindqvist", username: "mara", avatarUrl: people.mara.avatarUrl, href: "/mara" },
  options: [pro],
  accessProducts: [],
  reviews: {
    average: 4.9,
    total: 121,
    items: [
      { id: "r1", rating: 5, content: "", name: "Ayla Demir", avatarUrl: face("#d8e2dc", "#5b7f6c"), createdAt: iso(NOW - 5 * HOUR), href: "/@ayla", payingFor: "3 months" },
      { id: "r2", rating: 5, content: "Day one I threw my first cylinder that did not collapse. Day two I trimmed it. The weekly critique is worth the price on its own.", name: "Joe Moss", avatarUrl: face("#e2d6cb", "#8a6248"), createdAt: iso(NOW - 2 * DAY), href: "/joemoss", payingFor: "4 days" },
      { id: "r3", rating: 4, content: "Calm, practical and kind. Nothing like the big Facebook groups. I wish the firing schedule had more slots in winter.", name: "Priya Shah", avatarUrl: null, createdAt: iso(NOW - 12 * DAY), href: null, payingFor: null },
    ],
  },
  url: "/community/clay-studio",
  address: "storelib.com/community/clay-studio",
  gallery: [{ type: "image", url: SHOTS[0] }, { type: "video", videoId: VIDEO, posterUrl: SHOTS[3] }, ...SHOTS.slice(1, 3).map((url) => ({ type: "image" as const, url })), ...SHOTS.slice(4).map((url) => ({ type: "image" as const, url }))],
  stats: { members: 8012, online: 191, admins: 2 },
}
const freeOne: PublicCommunityView = {
  ...studio,
  slug: "night-runners",
  name: "Night Runners",
  tagline: "Running after dark, together. Routes, gear and a weekly group run.",
  coverUrl: null,
  logoUrl: null,
  visibility: "public",
  access: "free",
  memberCount: 86,
  options: [free],
  reviews: null,
  faq: [],
  benefits: ["A weekly group run in four cities", "Shared routes with lighting notes"],
  descriptionHtml: "<p>Free to join. Post your route, find people near you and come to the Thursday run.</p>",
  creator: { name: "Dev Patel", username: "dev", avatarUrl: null, href: "/@dev" },
  address: "storelib.com/community/night-runners",
  gallery: [],
  stats: { members: 86, online: null, admins: 1 },
}

const facts = (c: PublicCommunityView, v: Record<string, unknown> = {}) =>
  decideJoin({
    community: { slug: c.slug, status: c.status, access: c.access, approvalRequired: c.approvalRequired, suspended: false, archived: false, creatorName: c.creator?.name ?? null },
    viewer: { signedIn: true, active: false, status: null, role: null, isOwner: false, banned: false, approved: false, source: null, membershipId: null, ...v } as never,
    options: c.options,
    accessProducts: c.accessProducts,
    canTakePayments: true,
  })

/* ── The classroom and the calendar ───────────────────────────────────── */

const course = (over: Partial<ClassroomCourse> & { productId: string; title: string }): ClassroomCourse => ({
  coverUrl: null,
  lessons: 12,
  completedLessons: 0,
  percent: 0,
  status: "not_started",
  totalSeconds: 3 * 3600,
  locked: null,
  href: `/community/clay-studio/classroom/${over.productId}`,
  ...over,
})
const COURSES: ClassroomCourse[] = [
  course({ productId: "co-1", title: "Trimming feet that look made", coverUrl: SHOTS[4], completedLessons: 5, percent: 42, status: "in_progress" }),
  course({ productId: "co-2", title: "Glazes without fear", coverUrl: SHOTS[1], lessons: 9 }),
  course({ productId: "co-3", title: "Firing at a shared kiln", coverUrl: SHOTS[3], locked: { reason: "tier", label: "Studio members", opensAt: null } }),
]
const event = (over: Partial<EventCardView> & { id: string; title: string; startsAt: string }): EventCardView => ({
  coverUrl: null,
  kind: "live",
  endsAt: null,
  timezone: "Europe/Lisbon",
  location: null,
  online: true,
  capacity: null,
  goingCount: 0,
  cancelled: false,
  myRsvp: null,
  locked: null,
  hasReplay: false,
  href: `/community/clay-studio/events/${over.id}`,
  ...over,
} as EventCardView)
const EVENTS: EventCardView[] = [
  event({ id: "e1", title: "Live critique: trimming feet", startsAt: iso(NOW + 4 * DAY), endsAt: iso(NOW + 4 * DAY + 90 * 60_000), goingCount: 128, myRsvp: "going", coverUrl: SHOTS[4] }),
  event({ id: "e2", title: "Café crawl and kiln tour", startsAt: iso(NOW + 11 * DAY), online: false, location: "Lisbon, Rua da Prata 12", goingCount: 14, capacity: 20 }),
]
const monthOf = (events: EventCardView[]) => {
  const d = new Date()
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), events }
}
const manage = staff ? `/app/community/${CID}` : null
function classroomPage(courses: ClassroomCourse[]) {
  return <ClassroomLibrary courses={courses} manageHref={manage ? `${manage}/classroom` : null} />
}
function eventsPage(events: EventCardView[]) {
  return <EventsPage communityId={CID} initial={{ events, nextCursor: null }} month={monthOf(events)} fallbackZone="Europe/Lisbon" manageHref={manage ? `${manage}/events?new=1` : null} />
}
/* Round 13: &cover=only (no gallery chosen: the media is the cover alone), &extras=1 (the server's extra facts). */
const coverOnly = params.get("cover") === "only"
const EXTRAS = params.get("extras") === "1" ? { activity: { posts30: 186, active7: 402, since: "2024-03-02T00:00:00Z" }, classroom: { total: 9, courses: [] }, creatorBio: "Potter for twelve years. I run a small studio in Lisbon and teach wheel throwing to adults who never thought they could." } : null
const withCover = (c: PublicCommunityView): PublicCommunityView => (coverOnly ? { ...c, gallery: c.coverUrl ? [{ type: "image", url: c.coverUrl }] : [] } : c)
function aboutPage() {
  const data: SalesPageData = { community: withCover(studio), join: facts(studio, { active: true, role: "member", status: "active" }), notice: null, askWhy: params.get("ask") !== "0", extras: EXTRAS }
  return <CommunitySalesPage data={data} />
}


/* ── Round 15: the places as their loader returns them ────────────────── */

const levels = [1, 2, 3, 4, 5, 6].map((level) => ({ level, name: ["", "Newcomer", "Regular", "Contributor", "Insider", "Core", "Pillar"][level] }))
const feedData: PlaceData = {
  kind: "feed",
  start: { kind: "all" },
  spaces,
  viewer,
  initial: { pinned: [POSTS[0]], posts: POSTS.slice(1), nextCursor: "c2" },
  servedAt: Date.now(),
  readOnly: false,
  onboarding: null,
  compose: { userId: "u-me", me: { name: people.me.name, avatarUrl: people.me.avatarUrl }, fileProductId: null, eventHref: null },
}
function placeData(key: string): PlaceData | null {
  const p = placeFromKey(key)
  if (!p) return null
  switch (p.kind) {
    case "feed":
    case "saved":
    case "space":
      return feedData
    case "members":
      return { kind: "members", communityId: CID, slug: community.slug, memberCount: community.memberCount, initial: { members: MEMBERS, nextCursor: null }, meId: "u-me", canMessage: true, countryFilter: true }
    case "leaderboard":
      return { kind: "leaderboard", communityId: CID, slug: community.slug, me: { userId: "u-me", points: 111, level: 3 }, levels, initial: MEMBERS.slice(0, 4).map((m, i) => ({ rank: i + 1, userId: m.userId, points: 400 - i * 90, level: m.level, levelName: m.levelName, name: m.name, username: m.username, avatarUrl: m.avatarUrl, hasStorefront: m.hasStorefront })) }
    case "calendar":
      return { kind: "calendar", communityId: CID, initial: { events: EVENTS, nextCursor: null }, month: monthOf(EVENTS), fallbackZone: "Europe/Lisbon", manageHref: null }
    case "about":
      return { kind: "about", sales: { community: withCover(studio), join: facts(studio, { active: true, role: "member", status: "active" }), notice: null, askWhy: true, extras: EXTRAS } }
    case "learn":
      return { kind: "learn", programs: [], manageHref: null }
    default:
      return null
  }
}
const placeWindow = window as Window & { __placeLatency?: number; __placeCalls?: string[] }
placeWindow.__placeCalls = []
const feedFetch = window.fetch
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const u = new URL(url, location.origin)
  if (!/\/api\/community\/[^/]+\/place$/.test(u.pathname)) return feedFetch(input, init)
  const key = u.searchParams.get("p") || ""
  placeWindow.__placeCalls!.push(key)
  await new Promise((r) => setTimeout(r, placeWindow.__placeLatency ?? 600))
  const data = placeData(key)
  return new Response(JSON.stringify(data ? { ok: true, key, data } : { ok: false, error: "not_found" }), { status: data ? 200 : 404, headers: { "Content-Type": "application/json" } })
}

function Screen() {
  return (
    <ShellFrame community={community} viewer={viewer} topBar={topBar()} unreadMessages={2} wall={wall} chatSpaces={spaces.filter((s) => s.kind === "chat").map((s) => s.slug)}>
      <PlaceSeed communityId={CID} slug={community.slug} place={{ kind: "feed" }} data={feedData} />
    </ShellFrame>
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
