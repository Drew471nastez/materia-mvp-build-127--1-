/**
 * ===========================================================================
 *  ROUND 33: A FEED'S VIDEOS, THE SPACES' DRAG, THE ADMIN'S PENCILS (harness)
 * ===========================================================================
 * The real components with fixture props, for scripts/check-media-round33.mjs,
 * picked by ?view=:
 *
 *   feed     the real shell and feed (as render-media-round32.tsx), with
 *              1  a video whose post keeps its still and its 16px copy
 *              2  a video with its still and no 16px copy (an older post)
 *              3  a video with no still, somebody else's
 *              4  a video with no still, the viewer's own (its frame is sent)
 *            ?dark=1 the dark look
 *   spaces   the admin's Spaces (spaces-section.tsx) in a stand in for the
 *            /app frame, fourteen spaces so the list scrolls; ?fail=1 the
 *            order's save refused
 *   hints    the member side's blocks that carry a pencil (the spaces row,
 *            the community card, Learn, the calendar); ?role=admin the owner,
 *            otherwise a member
 *
 * The 16px copy is handed in by the probe (window.__BLUR, made by sharp from
 * the poster as the server makes it). Every request a page makes is logged in
 * window.__asked (method, address, type, size).
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LocaleProvider } from "@/components/locale-provider"
import { ShellFrame } from "@/components/community/member/shell-frame"
import { PlaceSeed } from "@/components/community/member/place-host"
import { ViewportVars } from "@/components/viewport-vars"
import { SpacesSection } from "@/components/community/creator/spaces-section"
import { ToastHost } from "@/components/community/creator/parts"
import { SpaceChips } from "@/components/community/member/space-chips"
import { WallCommunityCard } from "@/components/community/member/wall"
import { LearnLibrary } from "@/components/community/learn/learn-library"
import { EventsPage } from "@/components/community/events/events-page"
import { adminHref } from "@/components/community/member/edit-hint"
import type { PlaceData } from "@/lib/communities/client/place-data"
import { placeFromKey } from "@/lib/communities/client/places"
import { allowedActions } from "@/lib/communities/permissions"
import type { FeedPostView, PostMedia, Role, ViewerView } from "@/lib/communities/types"
import type { ShellCommunity, SpaceView, TopBarData } from "@/components/community/member/view-types"
import type { CommunityHead, SpaceView as AdminSpace } from "@/components/community/creator/view-types"

const params = new URLSearchParams(location.search)
if (params.get("dark") === "1") document.documentElement.setAttribute("data-sl-dark", "")
const view = params.get("view") || "feed"
const admin = params.get("role") === "admin"

type W = Window & { __asked?: { method: string; path: string; type: string | null; size: number; body?: string }[]; __BLUR?: string }
const w = window as W
w.__asked = []

const NOW = Date.now()
const HOUR = 3_600_000
const iso = (ms: number) => new Date(ms).toISOString()
const CID = "c0000000-0000-4000-8000-000000000001"
const pic = (name: string) => `https://abc.supabase.co/storage/v1/object/public/community/${name}.jpg`
function svg(wd: number, h: number, body: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${wd} ${h}" width="${wd}" height="${h}">${body}</svg>`)}`
}
const LOGO = svg(128, 128, `<rect width="128" height="128" rx="28" fill="#1a1a2e"/><path d="M38 86 L64 40 L90 86 Z" fill="#f4efe6"/>`)
const COVER = svg(1600, 900, `<rect width="1600" height="900" fill="#cfdbd5"/>`)
const face = (bg: string, fg: string) => svg(96, 96, `<rect width="96" height="96" fill="${bg}"/><circle cx="48" cy="38" r="18" fill="${fg}"/><rect x="18" y="62" width="60" height="40" rx="30" fill="${fg}"/>`)

const community: ShellCommunity = {
  id: CID,
  slug: "clay-studio",
  name: "Clay Studio",
  tagline: "A working studio for people learning wheel throwing, glazing and firing at home.",
  logoUrl: LOGO,
  coverUrl: COVER,
  memberCount: 8012,
  postCount: 3412,
  classroomEnabled: true,
  eventsEnabled: true,
  directoryEnabled: true,
  chatEnabled: false,
  gamificationEnabled: true,
  archived: false,
}

const viewer: ViewerView = {
  userId: "u-me",
  signedIn: true,
  role: admin ? "owner" : "member",
  status: "active",
  active: true,
  tierId: null,
  level: 3,
  points: 84,
  isOwner: admin,
  isCreatorAccount: admin,
  mutedUntil: null,
  can: allowedActions(admin ? "owner" : "member"),
}

const people = {
  mara: { id: "u-mara", name: "Mara Lindqvist", username: "mara", avatarUrl: face("#e8d5c4", "#8a5a3c"), role: "owner" as Role, level: 6, hasStorefront: true },
  jonas: { id: "u-jonas", name: "Jonas Berg", username: "jonasb", avatarUrl: face("#cfdcd2", "#3f6b4f"), role: "member" as Role, level: 3, hasStorefront: false },
  me: { id: "u-me", name: "Sam Carter", username: "samc", avatarUrl: face("#efe3cf", "#8a6d3c"), role: "member" as Role, level: 3, hasStorefront: false },
}

const topBar: TopBarData = {
  community: { id: CID, slug: community.slug, name: community.name, logoUrl: LOGO },
  creator: { name: "Mara Lindqvist", href: "/mara" },
  me: { name: people.me.name, avatarUrl: people.me.avatarUrl, profileHref: "/@samc", username: "samc", seller: false },
  communities: [{ id: CID, slug: "clay-studio", name: "Clay Studio", logoUrl: LOGO }],
  manageHref: admin ? "/app/community/clay-studio" : null,
}

const spaces: SpaceView[] = [
  { id: "s-general", slug: "general", name: "General", description: "Anything about the work.", icon: "messages-square", kind: "feed", canPost: true, commentsEnabled: true, unread: 0 },
  { id: "s-glaze", slug: "glazes", name: "Glazes", description: null, icon: "🧪", kind: "feed", canPost: true, commentsEnabled: true, unread: 0 },
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

const PID = (n: number) => `a${n}000000-0000-4000-8000-00000000000${n}`
const MEDIA: Record<number, PostMedia[]> = {
  1: [{ type: "video", videoId: "v-blur", poster: pic("poster1"), w: 1280, h: 720, ...(w.__BLUR ? { blur: w.__BLUR } : {}) }],
  2: [{ type: "video", videoId: "v-poster", poster: pic("poster2"), w: 1280, h: 720 }],
  3: [{ type: "video", videoId: "v-bare" }],
  4: [{ type: "video", videoId: "v-mine" }],
}
const POSTS: FeedPostView[] = [
  post({ id: PID(1), author: people.mara, title: "Pulling a cylinder taller", bodyText: "Three pulls, a rib on the last one.", media: MEDIA[1], reactionCount: 12, createdAt: iso(NOW - 3 * HOUR) }),
  post({ id: PID(2), title: "Centering, slowed down", bodyText: "Watch the left hand.", media: MEDIA[2], reactionCount: 9, createdAt: iso(NOW - 5 * HOUR) }),
  post({ id: PID(3), title: "Trimming a foot ring, start to finish", bodyText: "Filmed on my phone, sorry about the angle.", media: MEDIA[3], reactionCount: 8, createdAt: iso(NOW - 6 * HOUR) }),
  post({ id: PID(4), author: people.me, title: "My first lidded jar", bodyText: "The lid fits, just.", media: MEDIA[4], reactionCount: 3, canEdit: true, createdAt: iso(NOW - 8 * HOUR) }),
]
const byId = new Map(POSTS.map((p) => [p.id, p]))

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const later = (ms: number) => new Promise((r) => setTimeout(r, ms))
const realFetch = window.fetch.bind(window)

const feedData: PlaceData = {
  kind: "feed",
  start: { kind: "all" },
  spaces,
  viewer,
  initial: { pinned: [], posts: POSTS, nextCursor: null },
  servedAt: Date.now(),
  readOnly: false,
  onboarding: null,
  compose: { userId: "u-me", me: { name: people.me.name, avatarUrl: people.me.avatarUrl }, fileProductId: null, eventHref: null },
}

/* The spaces the admin arranges: enough of them for the list to scroll on a phone. */
const NAMES = ["General", "Announcements", "Wins", "Glazes", "Firing log", "Studio setup", "Clay bodies", "Critique", "Events", "Kiln talk", "Tools", "Sales and markets", "Beginners", "Old prompts"]
const adminSpaces: AdminSpace[] = NAMES.map((name, i) => ({
  id: `s${i + 1}`,
  slug: name.toLowerCase().replace(/[^a-z]+/g, "-"),
  name,
  description: i % 3 === 0 ? "Say hello and share what you made" : null,
  icon: ["💬", "📣", "🏆", "🧪", "🔥", "🛠️", "🪨", "👀", "📅", "🔥", "🔧", "🛍️", "🌱", "📚"][i],
  kind: i === 1 ? "announcements" : "feed",
  position: i,
  postRole: i === 1 ? "admin" : "member",
  commentsEnabled: true,
  viewAccess: {},
  archived: false,
  posts: 10 + i * 7,
})) as unknown as AdminSpace[]

const head = {
  id: CID,
  slug: "clay-studio",
  name: "Clay Studio",
  tagline: "",
  logoUrl: null,
  coverUrl: null,
  status: "published",
  access: "free",
  visibility: "public",
  memberCount: 8012,
  postCount: 3412,
  archived: false,
  suspended: false,
  gamificationEnabled: true,
  classroomEnabled: true,
  eventsEnabled: true,
  role: "owner",
  can: allowedActions("owner"),
  openReports: 0,
  me: { userId: "u-me", name: "Sam Carter", avatarUrl: null },
} as unknown as CommunityHead

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const u = new URL(url, location.origin)
  const path = u.pathname
  const method = init?.method || "GET"
  if (!path.startsWith("/api/")) return realFetch(input, init)
  const headers = new Headers(init?.headers)
  const body = init?.body
  const size = body instanceof Blob ? body.size : typeof body === "string" ? body.length : 0
  w.__asked!.push({ method, path: `${path}${u.search}`, type: headers.get("content-type"), size, body: typeof body === "string" ? body.slice(0, 400) : undefined })
  if (/\/api\/community\/[^/]+\/place$/.test(path)) {
    await later(200)
    const p = placeFromKey(u.searchParams.get("p") || "")
    return p && (p.kind === "feed" || p.kind === "space") ? json({ ok: true, key: u.searchParams.get("p"), data: feedData }) : json({ ok: false, error: "not_found" }, 404)
  }
  if (/\/videos\/[^/]+\/play$/.test(path)) {
    await later(120)
    /* ?noplay=1: the play route refuses (a video this browser will never draw a frame of). */
    if (params.get("noplay") === "1") return json({ error: "not_found" }, 404)
    return json({ url: `${location.origin}/__clip.webm`, expiresAt: Date.now() + 3_000_000, mime: "video/webm", captions: null, poster: null, durationSeconds: 2 })
  }
  if (/\/videos\/[^/]+\/poster$/.test(path) && method === "POST") return json({ poster: pic("sent"), w: 640, h: 360, blur: null, posts: 1 })
  if (/\/api\/app\/community\/[^/]+\/spaces$/.test(path)) {
    await later(150)
    if (method === "PUT") return params.get("fail") === "1" ? json({ error: "failed" }, 500) : json({ ok: true })
    return json({ spaces: adminSpaces })
  }
  if (/\/posts\/[^/]+\/comments/.test(path)) return json({ comments: [], nextCursor: null, commentsEnabled: true, mediaReady: true, me: { name: people.me.name, avatarUrl: people.me.avatarUrl } })
  const one = /\/api\/community\/[^/]+\/posts\/([^/?]+)$/.exec(path)
  if (method === "GET" && one) {
    const p = byId.get(one[1])
    return p ? json({ post: p }) : json({ error: "not_found" }, 404)
  }
  if (/\/api\/community\/[^/]+\/events/.test(path)) return json({ events: [], nextCursor: null })
  if (/\/api\/notifications\/inbox/.test(path)) return json({ items: [], unread: 0, hasMore: false, nextCursor: null })
  return json({ error: "not_here" }, 404)
}

try {
  window.localStorage.clear()
  window.sessionStorage.clear()
} catch {
  /* fine */
}

function AdminFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-svh overflow-hidden bg-[#131316]">
      <main className="h-svh overflow-hidden bg-[#f8f9fa] pt-[58px] md:bg-white md:pl-[240px]">
        <div className="app-content-scroll h-[calc(100svh-58px)] overflow-y-auto" data-scroll-pane="">
          <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </div>
      </main>
    </div>
  )
}

const programs = [
  { id: "pg1", kind: "program" as const, title: "Throwing your first cylinder", summary: null, coverUrl: COVER, lessons: 12, completedLessons: 3, percent: 25, status: "in_progress" as const, totalSeconds: 5400, draft: false, mode: "free" as const, priceLabel: null, owned: false, locked: null, href: "/community/clay-studio/learn/pg1" },
  { id: "pg2", kind: "program" as const, title: "Glazing without guesswork", summary: null, coverUrl: null, lessons: 8, completedLessons: 0, percent: 0, status: "not_started" as const, totalSeconds: 3600, draft: false, mode: "free" as const, priceLabel: null, owned: false, locked: null, href: "/community/clay-studio/learn/pg2" },
]

function Hints() {
  const chipsHref = adminHref("clay-studio", viewer, "manage_spaces", "spaces")
  const learnHref = adminHref("clay-studio", viewer, "manage_classroom", "learn")
  const eventsHref = admin ? "/app/community/clay-studio/events?new=1" : null
  const settingsHref = admin ? "/app/community/clay-studio/settings" : null
  return (
    <div className="min-h-svh bg-[#f8f9fa] px-4 py-6">
      <div className="mx-auto grid max-w-[1100px] gap-8 lg:grid-cols-[280px_1fr]">
        <div data-hint-block="card">
          <WallCommunityCard community={community} card={{ stats: { members: 8012, online: 31, admins: 3 }, faces: [], more: 0, settingsHref }} membersHref={null} />
        </div>
        <div className="min-w-0 space-y-10">
          <div data-hint-block="chips">
            <SpaceChips slug="clay-studio" spaces={spaces} active={null} editHref={chipsHref} />
          </div>
          <div data-hint-block="learn">
            <LearnLibrary programs={programs as never} manageHref={learnHref} />
          </div>
          <div data-hint-block="events">
            <EventsPage communityId={CID} initial={{ events: [], nextCursor: null }} month={{ year: 2026, month: 9, events: [] }} fallbackZone="UTC" manageHref={eventsHref} />
          </div>
        </div>
      </div>
    </div>
  )
}

const app = createRoot(document.getElementById("app")!)
if (view === "spaces") {
  app.render(
    <LocaleProvider>
      <ViewportVars />
      <AdminFrame>
        <ToastHost>
          <SpacesSection head={head} options={{ tiers: [], levels: [] } as never} initial={adminSpaces} />
        </ToastHost>
      </AdminFrame>
    </LocaleProvider>,
  )
} else if (view === "hints") {
  app.render(
    <LocaleProvider>
      <Hints />
    </LocaleProvider>,
  )
} else {
  app.render(
    <LocaleProvider>
      <ViewportVars />
      <ShellFrame community={community} viewer={viewer} topBar={topBar} unreadMessages={null} wall={null} chatSpaces={[]}>
        <PlaceSeed communityId={CID} slug={community.slug} place={{ kind: "feed" }} data={feedData} />
      </ShellFrame>
    </LocaleProvider>,
  )
}
