/**
 * ===========================================================================
 *  ROUND 32: A POST'S PICTURES AND VIDEOS, OPENED AND CLOSED (render harness)
 * ===========================================================================
 * The real shell, feed, opened post and picture viewer (as round 29's
 * render-composer-round29.tsx), with posts that carry what round 32 is about:
 *
 *   1  one tall picture (1080x1920): drawn whole in an opened post, a narrow
 *      picture in a box as wide as the post, the case the owner recorded
 *   2  two pictures side by side, each cropped square
 *   3  a video with its poster
 *   4  a video with no still of its own (its first frame)
 *
 * Every picture is on Supabase storage, so it goes through the image route
 * (/_next/image) as in production; the probe answers that route with real
 * JPEGs, late when it is told to. A video's play address is answered with
 * /__clip.webm (a two second clip the probe makes with ffmpeg).
 *
 *   ?dark=1        the dark look on the document, as lib/appearance does
 *   ?solo=poster   only an opened post's media (PostMediaGrid) for post 3,
 *   ?solo=bare     or 4, on a white panel: nothing drawn before it, nothing
 *                  in the cache, the first frame as a link opened cold
 *
 * Rendered by scripts/check-media-round32.mjs.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LocaleProvider } from "@/components/locale-provider"
import { ShellFrame } from "@/components/community/member/shell-frame"
import { PlaceSeed } from "@/components/community/member/place-host"
import { PostMediaGrid } from "@/components/community/member/media"
import { ViewportVars } from "@/components/viewport-vars"
import type { PlaceData } from "@/lib/communities/client/place-data"
import { placeFromKey } from "@/lib/communities/client/places"
import { allowedActions } from "@/lib/communities/permissions"
import type { CommentView, FeedPostView, PostMedia, Role, ViewerView } from "@/lib/communities/types"
import type { ShellCommunity, SpaceView, TopBarData } from "@/components/community/member/view-types"

const params = new URLSearchParams(location.search)
if (params.get("dark") === "1") document.documentElement.setAttribute("data-sl-dark", "")

const NOW = Date.now()
const HOUR = 3_600_000
const DAY = 24 * HOUR
const iso = (ms: number) => new Date(ms).toISOString()
const CID = "c0000000-0000-4000-8000-000000000001"
const pic = (name: string) => `https://abc.supabase.co/storage/v1/object/public/community/${name}.jpg`

function svg(w: number, h: number, body: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`)}`
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

const spaces: SpaceView[] = [{ id: "s-general", slug: "general", name: "General", description: "Anything about the work.", icon: "messages-square", kind: "feed", canPost: true, commentsEnabled: true, unread: 0 }]

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

/* Ids differ in their first eight characters too: a post address carries those eight. */
const PID = (n: number) => `a${n}000000-0000-4000-8000-00000000000${n}`
const MEDIA: Record<number, PostMedia[]> = {
  1: [{ type: "image", url: pic("tall"), w: 1080, h: 1920 }],
  2: [
    { type: "image", url: pic("wide"), w: 1600, h: 900 },
    { type: "image", url: pic("square"), w: 1200, h: 1200 },
  ],
  3: [{ type: "video", videoId: "v-poster", poster: pic("poster"), w: 1280, h: 720 }],
  4: [{ type: "video", videoId: "v-bare" }],
}
const POSTS: FeedPostView[] = [
  post({ id: PID(1), author: people.mara, title: "Tall jar, after the second firing", bodyText: "The shino broke nicely over the shoulder.", media: MEDIA[1], reactionCount: 17, createdAt: iso(NOW - 3 * HOUR) }),
  post({ id: PID(2), title: "Two angles on the same bowl", bodyText: "Foot ring on the right.", media: MEDIA[2], reactionCount: 9, createdAt: iso(NOW - 5 * HOUR) }),
  post({ id: PID(3), author: people.mara, title: "Pulling a cylinder taller", bodyText: "Three pulls, a rib on the last one.", media: MEDIA[3], reactionCount: 12, createdAt: iso(NOW - 6 * HOUR) }),
  post({ id: PID(4), title: "Trimming a foot ring, start to finish", bodyText: "Filmed on my phone, sorry about the angle.", media: MEDIA[4], reactionCount: 8, createdAt: iso(NOW - 8 * HOUR) }),
  post({ id: PID(5), author: people.jonas, bodyText: "Anyone in Lisbon with a kiln to share? Happy to split costs.", reactionCount: 3, createdAt: iso(NOW - 3 * DAY) }),
  post({ id: PID(6), author: people.mara, bodyText: "Glaze tip: test tiles on the same shelf height as the real pieces.", reactionCount: 24, createdAt: iso(NOW - 5 * DAY) }),
]
const byId = new Map(POSTS.map((p) => [p.id, p]))
const COMMENTS: CommentView[] = []

type W = Window & { __asked?: string[] }
const w = window as W
w.__asked = []
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
    await later(80)
    return json({ url: `${location.origin}/__clip.webm`, expiresAt: Date.now() + 3_000_000, mime: "video/webm", captions: null, poster: null, durationSeconds: 2 })
  }
  if (/\/posts\/[^/]+\/comments/.test(path)) {
    await later(100)
    return json({ comments: COMMENTS, nextCursor: null, commentsEnabled: true, mediaReady: true, me: { name: people.me.name, avatarUrl: people.me.avatarUrl } })
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

const solo = params.get("solo")
const app = createRoot(document.getElementById("app")!)
if (solo) {
  /* An opened post's media alone, cold: the panel an opened post draws it in, at its width. */
  const n = solo === "bare" ? 4 : 3
  app.render(
    <LocaleProvider>
      <div className="min-h-svh bg-[#f8f9fa] px-4 pt-6">
        <div className="mx-auto max-w-[680px] rounded-2xl bg-white p-4" data-solo-panel="">
          <PostMediaGrid media={MEDIA[n]} communityId={CID} postId={PID(n)} priority />
        </div>
      </div>
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
