/**
 * ===========================================================================
 *  ROUND 17: A POST OPENED INSIDE THE REAL COMMUNITY SHELL (worker P17)
 * ===========================================================================
 * Round 16's harness (render-communities-post16.tsx), with comments under the
 * post that has a picture, so the open and the close carry a real page and the
 * comment box sits under real rows. Rendered by
 * scripts/check-communities-post17.mjs. Round 16's note follows.
 *
 * Rendered by scripts/check-communities-post16.mjs. Round 15 measured the
 * opened post over a column of cards (render-communities-post15.tsx) and the
 * shell's places on their own (render-community-shell15.tsx); nobody ran the
 * two together, which is where the owner's "it glitches and flashes things in
 * the community feed" lives (ARCH16 finding B). So this is the real frame
 * (ShellFrame: the navigator, the place host, the header), the real feed with
 * its real cards, whose press opens the real post-overlay.tsx and
 * post-fullscreen.tsx, a person's profile place, Saved and a space, and the
 * real composer, with the phone's tab bar fixed at the foot.
 *
 * Everything the browser would ask the server for is answered here: the
 * feed's lists, a place's data (GET /api/community/<id>/place), one post
 * (GET .../posts/<id>) and its comments. The pictures are drawn here.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LocaleProvider } from "@/components/locale-provider"
import { ShellFrame } from "@/components/community/member/shell-frame"
import { PlaceSeed } from "@/components/community/member/place-host"
import { ViewportVars } from "@/components/viewport-vars"
import { SharedPost } from "@/components/community/member/shared-post"
import { CommunityFeed } from "@/components/community/member/feed"
import type { PlaceData } from "@/lib/communities/client/place-data"
import { placeFromKey } from "@/lib/communities/client/places"
import { requestCompose } from "@/lib/communities/client/compose-intent"
import { allowedActions } from "@/lib/communities/permissions"
import type { CommentView, FeedPostView, Role, ViewerView } from "@/lib/communities/types"
import type { ShellCommunity, SpaceView, TopBarData } from "@/components/community/member/view-types"
import type { MemberProfileData } from "@/lib/communities/member-profile-view"

const NOW = Date.now()
const HOUR = 3_600_000
const DAY = 24 * HOUR
const iso = (ms: number) => new Date(ms).toISOString()
const CID = "c0000000-0000-4000-8000-000000000001"

function svg(w: number, h: number, body: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`)}`
}
/* Hard edges and stripes, so a second copy of a picture at any offset is plain to see in a frame. */
const STRIPES = Array.from({ length: 16 }, (_, i) => `<rect x="${i * 100}" y="0" width="40" height="1200" fill="#2f3a44" opacity="0.55"/>`).join("")
const SHOTS = [
  svg(1200, 1200, `<rect width="1200" height="1200" fill="#d9cbb6"/>${STRIPES}<circle cx="820" cy="420" r="260" fill="#c0412e"/><rect x="0" y="900" width="1200" height="300" fill="#1f6b4f"/>`),
  svg(1600, 900, `<rect width="1600" height="900" fill="#cfdbd5"/>${STRIPES}<circle cx="1260" cy="240" r="110" fill="#f2efe6"/>`),
  svg(1600, 900, `<rect width="1600" height="900" fill="#efe9e1"/><ellipse cx="800" cy="560" rx="360" ry="220" fill="#b98f6a"/><ellipse cx="800" cy="470" rx="250" ry="90" fill="#d9b994"/>`),
]
const LOGO = svg(128, 128, `<rect width="128" height="128" rx="28" fill="#1a1a2e"/><path d="M38 86 L64 40 L90 86 Z" fill="#f4efe6"/>`)
const face = (bg: string, fg: string) => svg(96, 96, `<rect width="96" height="96" fill="${bg}"/><circle cx="48" cy="38" r="18" fill="${fg}"/><rect x="18" y="62" width="60" height="40" rx="30" fill="${fg}"/>`)

const community: ShellCommunity = {
  id: CID,
  slug: "clay-studio",
  name: "Clay Studio",
  tagline: "A working studio for people learning wheel throwing, glazing and firing at home.",
  logoUrl: LOGO,
  coverUrl: SHOTS[2],
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
  role: "member",
  status: "active",
  active: true,
  tierId: null,
  level: 3,
  points: 84,
  isOwner: false,
  isCreatorAccount: false,
  mutedUntil: null,
  can: allowedActions("member"),
}

const people = {
  mara: { id: "u-mara", name: "Mara Lindqvist", username: "mara", avatarUrl: face("#e8d5c4", "#8a5a3c"), role: "owner" as Role, level: 6, hasStorefront: true },
  jonas: { id: "u-jonas", name: "Jonas Berg", username: "jonasb", avatarUrl: face("#cfdcd2", "#3f6b4f"), role: "member" as Role, level: 3, hasStorefront: false },
  priya: { id: "u-priya", name: "Priya Raman", username: "priya", avatarUrl: null, role: "admin" as Role, level: 5, hasStorefront: false },
  me: { id: "u-me", name: "Sam Carter", username: "samc", avatarUrl: face("#efe3cf", "#8a6d3c"), role: "member" as Role, level: 3, hasStorefront: false },
}

const topBar: TopBarData = {
  community: { id: CID, slug: community.slug, name: community.name, logoUrl: LOGO },
  creator: { name: "Mara Lindqvist", href: "/mara" },
  me: { name: people.me.name, avatarUrl: people.me.avatarUrl, profileHref: "/@samc", username: "samc", seller: false },
  communities: [{ id: CID, slug: "clay-studio", name: "Clay Studio", logoUrl: LOGO }],
  manageHref: null,
}

const spaces: SpaceView[] = [
  { id: "s-general", slug: "general", name: "General", description: "Anything about the work.", icon: "messages-square", kind: "feed", canPost: true, commentsEnabled: true, unread: 0 },
  { id: "s-crit", slug: "critique", name: "Critique", description: "Honest notes on form, trimming and glaze.", icon: null, kind: "feed", canPost: true, commentsEnabled: true, unread: 0 },
  { id: "s-glaze", slug: "glaze-lab", name: "Glaze lab", description: null, icon: null, kind: "feed", canPost: true, commentsEnabled: true, unread: 0 },
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

/* Ids are uuids, as the server's are (the profile's rows open a post by its id). */
const PID = (n: number) => `a0000000-0000-4000-8000-00000000000${n}`
const POSTS: FeedPostView[] = [
  post({ id: PID(1), author: people.mara, title: "October firing schedule is up", bodyText: "Three slots this month at the shared kiln: the 9th, 16th and 27th. Book by Friday so I can plan the loads.", reactionCount: 42, createdAt: iso(NOW - 3 * HOUR), lastActivityAt: iso(NOW - 10 * 60_000) }),
  post({ id: PID(2), commentCount: 3, title: "Put yo", bodyText: "First set of bowls that did not crack. Slower drying under plastic for two days made the difference.", media: [{ type: "image", url: SHOTS[0], w: 1200, h: 1200 }], reactionCount: 17, author: people.mara, bookmarked: true, createdAt: iso(NOW - 5 * HOUR), lastActivityAt: iso(NOW - 20 * 60_000) }),
  post({ id: PID(3), author: people.priya, bodyText: "Glaze tip that saved me a whole batch: test tiles on the same shelf height as the real pieces.", reactionCount: 24, createdAt: iso(NOW - 2 * DAY), lastActivityAt: iso(NOW - 30 * 60_000) }),
  post({ id: PID(4), space: { id: "s-crit", slug: "critique", name: "Critique" }, title: "Is this foot too heavy?", bodyText: "Trimmed it twice and it still reads thick to me. Honest notes welcome.", media: [{ type: "image", url: SHOTS[1], w: 1600, h: 900 }], reactionCount: 9, author: people.mara, createdAt: iso(NOW - 6 * HOUR), lastActivityAt: iso(NOW - 40 * 60_000) }),
  post({ id: PID(5), space: { id: "s-crit", slug: "critique", name: "Critique" }, author: people.jonas, bodyText: "Anyone in Lisbon with a kiln to share? Happy to split costs.", reactionCount: 3, createdAt: iso(NOW - 3 * DAY), lastActivityAt: iso(NOW - 50 * 60_000) }),
  post({ id: PID(6), author: people.jonas, bodyText: "Recording of last week's trimming session is in the Classroom now.", reactionCount: 31, media: [{ type: "image", url: SHOTS[2], w: 1600, h: 900 }], createdAt: iso(NOW - 4 * DAY), lastActivityAt: iso(NOW - 60 * 60_000) }),
]
const byId = new Map(POSTS.map((p) => [p.id, p]))
const comment = (n: number, author: (typeof people)[keyof typeof people], body: string, ago: number): CommentView => ({ id: `c-${n}`, postId: PID(2), parentId: null, body, status: "published", deleted: false, author, reactionCount: n % 3, reacted: false, createdAt: iso(NOW - ago), editedAt: null, replies: [], canEdit: false, canModerate: false })
const COMMENTS: CommentView[] = [
  comment(1, people.jonas, "The two days under plastic is the part everyone skips. These look even all the way round.", 4 * HOUR),
  comment(2, people.priya, "What clay body? Mine still cracks at the foot with a slow dry.", 3 * HOUR),
  comment(3, people.mara, "Stoneware, a little grog. Compress the base twice before trimming.", 2 * HOUR),
]

/* ── The server, answered in the page ── */

type W = Window & { __feedLatency?: number; __placeLatency?: number; __postLatency?: number; __asked?: string[] }
const w = window as W
w.__asked = []
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const later = (ms: number) => new Promise((r) => setTimeout(r, ms))
const realFetch = window.fetch.bind(window)

const levels = [1, 2, 3, 4, 5, 6].map((level) => ({ level, name: ["", "Newcomer", "Regular", "Contributor", "Insider", "Core", "Pillar"][level] }))
const feedData: PlaceData = {
  kind: "feed",
  start: { kind: "all" },
  spaces,
  viewer,
  initial: { pinned: [], posts: POSTS.filter((p) => p.space?.id === "s-general"), nextCursor: null },
  servedAt: Date.now(),
  readOnly: false,
  onboarding: null,
  compose: { userId: "u-me", me: { name: people.me.name, avatarUrl: people.me.avatarUrl }, fileProductId: null, eventHref: null },
}
const here = { id: CID, slug: community.slug, name: community.name, logoUrl: LOGO }
const maraProfile: MemberProfileData = {
  self: false,
  person: { userId: people.mara.id, username: "mara", name: people.mara.name, avatarUrl: people.mara.avatarUrl, coverUrl: SHOTS[2], coverCrop: { x: 50, y: 50, zoom: 1 }, bio: "Runs Clay Studio.", location: "Lisbon, Portugal", role: "owner", level: 6, joinedAt: iso(NOW - 300 * DAY), followers: 120, following: 8, pageHref: "/mara", hasStorefront: true },
  viewerFollowing: false,
  scope: "community",
  posts: {
    posts: POSTS.filter((p) => p.author?.id === people.mara.id).map((p) => ({ id: p.id, title: p.title || p.bodyText.slice(0, 80), excerpt: p.title ? p.bodyText : null, space: p.space?.name ?? null, at: p.createdAt, reactions: p.reactionCount, comments: p.commentCount, href: `/community/${community.slug}/post/${p.id}`, imageUrl: p.media[0] && "url" in p.media[0] ? (p.media[0] as { url: string }).url : null, community: here, canEdit: false, canDelete: false })),
    next: null,
  },
  activity: null,
  now: NOW,
}
function placeData(key: string): PlaceData | null {
  const p = placeFromKey(key)
  if (!p) return null
  switch (p.kind) {
    case "feed":
    case "saved":
    case "space":
      return feedData
    case "profile":
      return { kind: "profile", ref: p.ref, data: p.ref === "mara" ? maraProfile : null }
    case "learn":
      return { kind: "learn", programs: [], manageHref: null }
    case "leaderboard":
      return { kind: "leaderboard", communityId: CID, slug: community.slug, me: { userId: "u-me", points: 111, level: 3 }, levels, initial: [] }
    default:
      return null
  }
}

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const u = new URL(url, location.origin)
  const path = u.pathname
  const get = !init?.method || init.method === "GET"
  if (!path.startsWith("/api/")) return realFetch(input, init)
  w.__asked!.push(`${init?.method || "GET"} ${path}${u.search}`)
  if (/\/api\/community\/[^/]+\/place$/.test(path)) {
    const key = u.searchParams.get("p") || ""
    await later(w.__placeLatency ?? 300)
    const data = placeData(key)
    return data ? json({ ok: true, key, data }) : json({ ok: false, error: "not_found" }, 404)
  }
  if (get && /\/api\/community\/[^/]+\/posts$/.test(path)) {
    await later(w.__feedLatency ?? 200)
    const space = u.searchParams.get("space")
    const list = space ? POSTS.filter((p) => p.space?.id === space) : POSTS
    return json({ pinned: [], posts: list, nextCursor: null })
  }
  if (/\/api\/community\/[^/]+\/bookmarks$/.test(path)) {
    await later(w.__feedLatency ?? 200)
    return json({ pinned: [], posts: POSTS.filter((p) => p.bookmarked), nextCursor: null })
  }
  if (/\/posts\/[^/]+\/comments/.test(path)) {
    await later(120)
    const pid = /\/posts\/([^/]+)\/comments/.exec(path)?.[1] ?? ""
    return json({ comments: COMMENTS.filter((c) => c.postId === pid), nextCursor: null, commentsEnabled: true, mediaReady: true, me: { name: people.me.name, avatarUrl: people.me.avatarUrl } })
  }
  const one = /\/api\/community\/[^/]+\/posts\/([^/?]+)$/.exec(path)
  if (get && one) {
    await later(w.__postLatency ?? 150)
    const p = byId.get(one[1])
    return p ? json({ post: p }) : json({ error: "not_found" }, 404)
  }
  if (/\/api\/notifications\/inbox/.test(path)) return json({ items: [], unread: 0, hasMore: false, nextCursor: null })
  return json({ error: "not_here" }, 404)
}

;(window as unknown as { __compose?: typeof requestCompose }).__compose = requestCompose
document.documentElement.setAttribute("data-buyer-tabs", "shown")
const lift = document.createElement("style")
/* As the tab bar's stylesheet does (lib/ui/layers.ts): lifted over an opened post, covered by the composer. */
lift.textContent = `html[data-tabs-over] [data-buyer-tab-bar]{z-index:140}`
document.head.appendChild(lift)
try {
  window.localStorage.clear()
} catch {
  /* fine */
}

function TabBar() {
  return (
    <div data-buyer-tab-bar="shown" className="fixed inset-x-0 bottom-0 z-50 bg-white shadow-[0_-1px_0_rgba(16,24,40,0.06)]" style={{ height: "calc(56px + env(safe-area-inset-bottom, 0px))" }}>
      <nav className="flex h-14 items-center justify-around text-[12px] text-[#6b7280]">
        {["Home", "Explore", "Create", "Profile"].map((t) => (
          <span key={t} className="flex h-11 w-16 items-center justify-center" data-tab={t}>
            {t}
          </span>
        ))}
      </nav>
    </div>
  )
}

/*
  THE ROUTE'S PAGE. What the server draws for the address, drawn again when the router moves (the probe's stub fires
  probe:route for router.push and replace, as Next's soft navigation does; a history push of the shell's own does not).
  A post's own address is the post route's page: its post over a feed. ?postpage=feed draws it as the base commit's page
  did (a CommunityFeed of its own, closed by router.replace), anything else as this checkout's does (the shell's seeded
  feed, page.tsx).
*/
const postPage = new URLSearchParams(location.search).get("postpage") || (sessionStorage.getItem("postpage") ?? "seed")
try {
  sessionStorage.setItem("postpage", postPage)
} catch {
  /* fine */
}
function routeOf(): { key: string; post: FeedPostView | null } {
  const m = /^\/community\/[^/]+\/post\/([^/?#]+)/.exec(location.pathname)
  if (m) return { key: `post:${m[1]}`, post: byId.get(decodeURIComponent(m[1])) ?? null }
  return { key: "home", post: null }
}
function Routed() {
  const [route, setRoute] = React.useState(routeOf)
  React.useEffect(() => {
    const on = () => setRoute(routeOf())
    window.addEventListener("probe:route", on)
    return () => window.removeEventListener("probe:route", on)
  }, [])
  if (route.post) {
    const under =
      postPage === "feed" ? (
        <CommunityFeed communityId={CID} slug={community.slug} viewer={viewer} spaces={spaces} start={{ kind: "all" }} initial={{ pinned: [], posts: POSTS, nextCursor: null }} servedAt={NOW} readOnly={false} onboarding={null} compose={feedData.kind === "feed" ? feedData.compose : null} />
      ) : (
        <PlaceSeed communityId={CID} slug={community.slug} place={{ kind: "feed" }} data={feedData} />
      )
    return (
      <SharedPost key={route.key} slug={community.slug} post={route.post} viewer={viewer} readOnly={false}>
        {under}
      </SharedPost>
    )
  }
  return <PlaceSeed key={route.key} communityId={CID} slug={community.slug} place={{ kind: "feed" }} data={feedData} />
}

createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <ViewportVars />
    <ShellFrame community={community} viewer={viewer} topBar={topBar} unreadMessages={null} wall={null} chatSpaces={[]}>
      <Routed />
    </ShellFrame>
    <TabBar />
  </LocaleProvider>,
)
