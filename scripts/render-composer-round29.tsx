/**
 * ===========================================================================
 *  ROUND 29: POSTING AND AN OPENED POST, IN BOTH LOOKS (render harness)
 * ===========================================================================
 * Round 17's harness (render-communities-post17.tsx: the real shell, feed,
 * composer, opened post and comments), with what round 29 is about:
 *
 *   - two posts with an uploaded video: one with no still of its own (a file
 *     the browser could not cut one from), one with a poster;
 *   - Post answered by the server here (POST .../posts, after __postLatency),
 *     so the pending state, the close, the glide and the arrival are real;
 *   - a video's play address answered with /__clip.webm, which the probe
 *     serves (a two second clip made by ffmpeg);
 *   - ?dark=1 sets the dark look on the document (html[data-sl-dark]), as
 *     lib/appearance does.
 *
 * One space takes posts (General), so the composer picks it by itself.
 * Rendered by scripts/check-composer-round29.mjs.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LocaleProvider } from "@/components/locale-provider"
import { ShellFrame } from "@/components/community/member/shell-frame"
import { PlaceSeed } from "@/components/community/member/place-host"
import { ViewportVars } from "@/components/viewport-vars"
import type { PlaceData } from "@/lib/communities/client/place-data"
import { placeFromKey } from "@/lib/communities/client/places"
import { allowedActions } from "@/lib/communities/permissions"
import type { CommentView, FeedPostView, Role, ViewerView } from "@/lib/communities/types"
import type { ShellCommunity, SpaceView, TopBarData } from "@/components/community/member/view-types"
import { POST_CHIME, postChime } from "@/components/community/member/heart"

/* The post's chime, for the probe to render offline and measure. */
;(window as unknown as { __chime?: unknown }).__chime = { postChime, POST_CHIME }

const params = new URLSearchParams(location.search)
if (params.get("dark") === "1") document.documentElement.setAttribute("data-sl-dark", "")

const NOW = Date.now()
const HOUR = 3_600_000
const DAY = 24 * HOUR
const iso = (ms: number) => new Date(ms).toISOString()
const CID = "c0000000-0000-4000-8000-000000000001"

function svg(w: number, h: number, body: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`)}`
}
const SHOTS = [
  svg(1200, 1200, `<rect width="1200" height="1200" fill="#d9cbb6"/><circle cx="820" cy="420" r="260" fill="#c0412e"/><rect x="0" y="900" width="1200" height="300" fill="#1f6b4f"/>`),
  svg(1600, 900, `<rect width="1600" height="900" fill="#cfdbd5"/><circle cx="1260" cy="240" r="110" fill="#f2efe6"/>`),
  svg(1280, 720, `<rect width="1280" height="720" fill="#3b4a6b"/><rect x="420" y="200" width="440" height="320" rx="40" fill="#e9c46a"/>`),
]
const LOGO = svg(128, 128, `<rect width="128" height="128" rx="28" fill="#1a1a2e"/><path d="M38 86 L64 40 L90 86 Z" fill="#f4efe6"/>`)
const face = (bg: string, fg: string) => svg(96, 96, `<rect width="96" height="96" fill="${bg}"/><circle cx="48" cy="38" r="18" fill="${fg}"/><rect x="18" y="62" width="60" height="40" rx="30" fill="${fg}"/>`)

const community: ShellCommunity = {
  id: CID,
  slug: "clay-studio",
  name: "Clay Studio",
  tagline: "A working studio for people learning wheel throwing, glazing and firing at home.",
  logoUrl: LOGO,
  coverUrl: SHOTS[1],
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
  { id: "s-crit", slug: "critique", name: "Critique", description: "Honest notes on form.", icon: null, kind: "feed", canPost: false, commentsEnabled: true, unread: 0 },
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

/* Ids are uuids that differ in their first eight characters too: a post address carries those eight (lib/communities/client/open-post.ts requestNames). */
const PID = (n: number) => `a${n}000000-0000-4000-8000-00000000000${n}`
const POSTS: FeedPostView[] = [
  post({ id: PID(1), author: people.mara, title: "October firing schedule is up", bodyText: "Three slots this month at the shared kiln: the 9th, 16th and 27th. Book by Friday so I can plan the loads.", reactionCount: 42, createdAt: iso(NOW - 3 * HOUR) }),
  post({ id: PID(2), commentCount: 3, title: "First bowls that did not crack", bodyText: "Slower drying under plastic for two days made the difference.", media: [{ type: "image", url: SHOTS[0], w: 1200, h: 1200 }], reactionCount: 17, author: people.mara, createdAt: iso(NOW - 5 * HOUR) }),
  post({ id: PID(3), title: "Trimming a foot ring, start to finish", bodyText: "Filmed on my phone, sorry about the angle.", media: [{ type: "video", videoId: "v-bare" }], reactionCount: 8, author: people.jonas, createdAt: iso(NOW - 6 * HOUR) }),
  post({ id: PID(4), title: "Pulling a cylinder taller", bodyText: "Three pulls, a rib on the last one.", media: [{ type: "video", videoId: "v-poster", poster: SHOTS[2], w: 1280, h: 720 }], reactionCount: 12, author: people.mara, createdAt: iso(NOW - 8 * HOUR) }),
  post({ id: PID(5), author: people.jonas, bodyText: "Anyone in Lisbon with a kiln to share? Happy to split costs.", reactionCount: 3, createdAt: iso(NOW - 3 * DAY) }),
  post({ id: PID(6), author: people.jonas, bodyText: "Recording of last week's trimming session is in the Classroom now.", reactionCount: 31, media: [{ type: "image", url: SHOTS[1], w: 1600, h: 900 }], createdAt: iso(NOW - 4 * DAY) }),
  post({ id: PID(7), author: people.mara, bodyText: "Glaze tip: test tiles on the same shelf height as the real pieces.", reactionCount: 24, createdAt: iso(NOW - 5 * DAY) }),
  post({ id: PID(8), author: people.jonas, bodyText: "Reclaiming slop: let it sit a week, then wedge twice.", reactionCount: 6, createdAt: iso(NOW - 6 * DAY) }),
]
const byId = new Map(POSTS.map((p) => [p.id, p]))
const comment = (n: number, author: (typeof people)[keyof typeof people], body: string, ago: number): CommentView => ({ id: `c-${n}`, postId: PID(2), parentId: null, body, status: "published", deleted: false, author, reactionCount: n % 3, reacted: false, createdAt: iso(NOW - ago), editedAt: null, replies: [], canEdit: false, canModerate: false })
const COMMENTS: CommentView[] = [
  comment(1, people.jonas, "The two days under plastic is the part everyone skips.", 4 * HOUR),
  comment(2, people.mara, "Compress the base twice before trimming.", 2 * HOUR),
]

type W = Window & { __postLatency?: number; __asked?: string[]; __posted?: FeedPostView[] }
const w = window as W
w.__asked = []
w.__posted = []
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
function placeData(key: string): PlaceData | null {
  const p = placeFromKey(key)
  if (!p) return null
  return p.kind === "feed" || p.kind === "space" || p.kind === "saved" ? feedData : null
}

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const u = new URL(url, location.origin)
  const path = u.pathname
  const method = init?.method || "GET"
  if (!path.startsWith("/api/")) return realFetch(input, init)
  w.__asked!.push(`${method} ${path}${u.search}`)
  if (/\/api\/community\/[^/]+\/place$/.test(path)) {
    await later(200)
    const data = placeData(u.searchParams.get("p") || "")
    return data ? json({ ok: true, key: u.searchParams.get("p"), data }) : json({ ok: false, error: "not_found" }, 404)
  }
  if (/\/videos\/[^/]+\/play$/.test(path)) {
    await later(60)
    return json({ url: `${location.origin}/__clip.webm`, expiresAt: Date.now() + 3_000_000, mime: "video/webm", captions: null, poster: null, durationSeconds: 2 })
  }
  if (method === "POST" && /\/api\/community\/[^/]+\/posts$/.test(path)) {
    const body = JSON.parse(String(init?.body || "{}")) as { title: string; body: string; spaceId: string }
    await later(w.__postLatency ?? 700)
    const made = post({ id: `b${String(w.__posted!.length).padStart(2, "0")}00000-0000-4000-8000-000000000100`, author: people.me, title: body.title, bodyText: body.body, createdAt: iso(Date.now()), lastActivityAt: iso(Date.now()), canEdit: true })
    w.__posted!.push(made)
    return json({ post: made })
  }
  if (method === "GET" && /\/api\/community\/[^/]+\/posts$/.test(path)) {
    await later(150)
    return json({ pinned: [], posts: [...w.__posted!, ...POSTS], nextCursor: null })
  }
  if (/\/posts\/[^/]+\/comments/.test(path)) {
    await later(100)
    const pid = /\/posts\/([^/]+)\/comments/.exec(path)?.[1] ?? ""
    return json({ comments: COMMENTS.filter((c) => c.postId === pid), nextCursor: null, commentsEnabled: true, mediaReady: true, me: { name: people.me.name, avatarUrl: people.me.avatarUrl } })
  }
  const one = /\/api\/community\/[^/]+\/posts\/([^/?]+)$/.exec(path)
  if (method === "GET" && one) {
    await later(120)
    const p = byId.get(one[1])
    return p ? json({ post: p }) : json({ error: "not_found" }, 404)
  }
  if (/\/api\/notifications\/inbox/.test(path)) return json({ items: [], unread: 0, hasMore: false, nextCursor: null })
  return json({ error: "not_here" }, 404)
}

try {
  window.localStorage.clear()
} catch {
  /* fine */
}

createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <ViewportVars />
    <ShellFrame community={community} viewer={viewer} topBar={topBar} unreadMessages={null} wall={null} chatSpaces={[]}>
      <PlaceSeed communityId={CID} slug={community.slug} place={{ kind: "feed" }} data={feedData} />
    </ShellFrame>
  </LocaleProvider>,
)
