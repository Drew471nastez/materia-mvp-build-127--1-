/**
 * ===========================================================================
 *  ROUND 15'S FEED, FOR scripts/check-communities-feed15.mjs
 * ===========================================================================
 * The real member frame (ShellFrame), the real feed (CommunityFeed) with its
 * real chips and cards, and pictures on "storage" so they go through the
 * optimizer the probe's own server answers with real photographs. The feed's
 * API is answered here, in the page, from one list of posts:
 *
 *   window.__bump()       the next read of any list carries new counts and a
 *                         new comment on every post (the same posts, the same
 *                         pictures), which is what a pull to refresh brings
 *   window.__reads        how many list reads the page has made
 *   window.__feedWait     how long a read takes (ms), 120 by default
 *
 * Seven spaces, so the row of chips scrolls sideways on a phone as it does in
 * a real community.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { ShellFrame } from "@/components/community/member/shell-frame"
import { FeedColumns } from "@/components/community/member/columns"
import { CommunityFeed } from "@/components/community/member/feed"
import { LocaleProvider } from "@/components/locale-provider"
import { openCommunitySearch } from "@/lib/nav/community-search-bridge"
import { CommunityNavigatorProvider, placeFromUrl, useCommunityNavigator } from "@/lib/communities/client/navigator"
import { ViewportVars } from "@/components/viewport-vars"
import { allowedActions } from "@/lib/communities/permissions"
import type { FeedPostView, PostMedia, ViewerView } from "@/lib/communities/types"
import type { ShellCommunity, SpaceView, TopBarData } from "@/components/community/member/view-types"

const NOW = Date.now()
const HOUR = 3_600_000
const iso = (ms: number) => new Date(ms).toISOString()
const CID = "6f1c2a1e-0000-4000-8000-000000000015"
const HOST = "https://probe.supabase.co/storage/v1/object/public/community-media"
const photo = (name: string) => `${HOST}/${name}.jpg`
const face = (bg: string, fg: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="${bg}"/><circle cx="48" cy="38" r="18" fill="${fg}"/><rect x="18" y="62" width="60" height="40" rx="30" fill="${fg}"/></svg>`)}`

const params = new URLSearchParams(location.search)
const which = params.get("case") || "feed"

const community: ShellCommunity = {
  id: CID,
  slug: "clay-studio",
  name: "Clay Studio",
  tagline: "Weekly firings, glaze tests and feedback on your pots.",
  logoUrl: face("#283044", "#5c6b8a"),
  coverUrl: null,
  memberCount: 1240,
  postCount: 812,
  classroomEnabled: true,
  eventsEnabled: true,
  directoryEnabled: true,
  chatEnabled: false,
  gamificationEnabled: true,
  archived: false,
}

const people = {
  maya: { id: "u-maya", name: "Maya Okafor", username: "mayao", avatarUrl: face("#e8d5c4", "#8a5a3c"), role: "owner" as const, level: 6 },
  jonas: { id: "u-jonas", name: "Jonas Berg", username: "jonasb", avatarUrl: face("#cfdcd2", "#3f6b4f"), role: "member" as const, level: 3 },
  leo: { id: "u-leo", name: "Leo Martins", username: "leom", avatarUrl: face("#d6d9ef", "#4a4f8a"), role: "member" as const, level: 2 },
  me: { id: "u-me", name: "Sam Carter", username: "samc", avatarUrl: face("#efe3cf", "#8a6d3c"), role: "member" as const, level: 3 },
}

const viewer: ViewerView = {
  userId: people.me.id,
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

const space = (id: string, name: string, icon: string): SpaceView => ({ id: `s-${id}`, slug: id, name, description: null, icon, kind: "feed", canPost: true, commentsEnabled: true, unread: 0 })
const spaces: SpaceView[] = [
  space("general", "General", "messages-square"),
  space("announcements", "Announcements", "megaphone"),
  space("introductions", "Introductions", "hand"),
  space("glazes", "Glazes", "🎨"),
  space("firing", "Firing logs", "🔥"),
  space("critique", "Critique", "🎯"),
  space("wins", "Wins", "🏆"),
]

const shapes: ((i: number) => PostMedia[])[] = [
  (i) => [{ type: "image", url: photo(`bowl-${i}-1`), w: 1600, h: 1067 }],
  (i) => [
    { type: "image", url: photo(`bowl-${i}-2`), w: 1600, h: 1067 },
    { type: "image", url: photo(`bowl-${i}-3`), w: 1600, h: 1067 },
  ],
  () => [],
  (i) => [
    { type: "image", url: photo(`bowl-${i}-4`), w: 1600, h: 1067 },
    { type: "image", url: photo(`bowl-${i}-5`), w: 1600, h: 1067 },
    { type: "image", url: photo(`bowl-${i}-6`), w: 1600, h: 1067 },
    { type: "image", url: photo(`bowl-${i}-7`), w: 1600, h: 1067 },
  ],
]
const titles = ["Three bowls out of the kiln", "Glaze test tiles, round two", "Paid critique night instead of a free one", "Trimming feet that look made", "Cone 6, slow cool, pooling in the rings"]
const authors = [people.maya, people.jonas, people.leo]

/** The posts every list is drawn from; a list for a space is the posts in it. */
function makePosts(version: number): FeedPostView[] {
  return Array.from({ length: 12 }, (_, i) => {
    const s = spaces[i % 4]
    return {
      id: `p-${i + 1}`,
      communityId: CID,
      space: { id: s.id, slug: s.slug, name: s.name },
      kind: "post",
      title: titles[i % titles.length],
      body: "",
      bodyText: "Two coats, cone 6, slow cool. The pooling in the rings is what I was after, and the foot came out cleaner than last time.",
      media: shapes[i % shapes.length](i),
      pinned: false,
      featured: false,
      locked: false,
      status: "published",
      author: authors[i % authors.length],
      reactionCount: 3 + i + version * 2,
      commentCount: 1 + (i % 4) + version,
      reacted: false,
      bookmarked: false,
      poll: null,
      createdAt: iso(NOW - (i + 1) * HOUR),
      editedAt: null,
      lastActivityAt: iso(NOW - (i + 1) * HOUR),
      canEdit: false,
      canModerate: false,
      recentCommenters: [],
      lastCommentAt: null,
      showLevel: true,
    } as FeedPostView
  })
}

/** A search for "glaze" in Clay Studio, the shape GET /api/community/<id>/search answers with (view-types.ts SearchResults). */
const SEARCH_REPLY = (q: string) => ({
  results: {
    q,
    posts: [
      { id: "p-2", title: "Glaze test tiles, round two", snippet: "Six glazes over the same clay body, fired to cone 6 with a slow cool. The celadon pooled best.", createdAt: iso(NOW - 2 * HOUR), space: { slug: "glazes", name: "Glazes", icon: "🎨", kind: "feed" }, author: { name: "Jonas Berg", avatarUrl: people.jonas.avatarUrl } },
      { id: "p-7", title: "Which glaze for a matte white?", snippet: "Looking for a matte white glaze that does not crawl on the rim. What works for you at cone 6?", createdAt: iso(NOW - 26 * HOUR), space: { slug: "general", name: "General", icon: "messages-square", kind: "feed" }, author: { name: "Leo Martins", avatarUrl: people.leo.avatarUrl } },
      { id: "p-9", title: null, snippet: "The shino glaze crawled again on the inside of the bowl. Thicker coat next time.", createdAt: iso(NOW - 6 * 24 * HOUR), space: { slug: "firing", name: "Firing logs", icon: "🔥", kind: "feed" }, author: { name: "Maya Okafor", avatarUrl: people.maya.avatarUrl } },
    ],
    members: [
      { id: "u-glazer", name: "Gladys Zeller", username: "glazequeen", avatarUrl: face("#f3dccb", "#9a5b3a"), href: "/community/clay-studio?profile=glazequeen", role: "member" },
      { id: "u-maya", name: "Maya Okafor", username: "mayao", avatarUrl: people.maya.avatarUrl, href: "/community/clay-studio?profile=mayao", role: "owner" },
    ],
    spaces: [{ id: "s-glazes", slug: "glazes", name: "Glazes", kind: "feed", icon: "🎨", description: "Recipes, tests and the results, good and bad." }],
    lessons: [{ id: "l-1", kind: "lesson", title: "Mixing your first glaze", course: "Glaze basics", href: "/community/clay-studio/learn/glaze-basics" }],
    events: [],
  },
})

/* The phone's tab bar opens the community's search through the bridge; the probe does the same. */
;(window as unknown as { __openSearch: () => boolean }).__openSearch = () => openCommunitySearch("clay-studio")

type ProbeWindow = Window & { __bump?: () => void; __reads?: number; __feedWait?: number; __version?: number; __pushes?: string[] }
const w = window as ProbeWindow
w.__version = 0
w.__reads = 0
w.__bump = () => {
  w.__version = (w.__version ?? 0) + 1
}
/* Every address the page puts up, so the probe can count one switch per tap. */
w.__pushes = []
const push = history.pushState.bind(history)
history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
  w.__pushes!.push(String(url))
  return push(data, unused, url)
}

const realFetch = window.fetch.bind(window)
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input instanceof Request ? input.url : input), location.href)
  if (url.pathname.startsWith("/api/")) {
    const reply = (body: unknown, wait = 60) =>
      new Promise<Response>((done) => setTimeout(() => done(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })), wait))
    if (/\/posts$/.test(url.pathname) && (!init?.method || init.method === "GET")) {
      w.__reads = (w.__reads ?? 0) + 1
      const want = url.searchParams.get("space")
      const all = makePosts(w.__version ?? 0)
      const posts = want ? all.filter((p) => p.space?.id === want) : all
      return reply({ pinned: [], posts, nextCursor: null }, w.__feedWait ?? 120).then((r) => {
        ;(w as unknown as { __readAt: number }).__readAt = performance.now()
        return r
      })
    }
    if (url.pathname.endsWith("/live")) return reply({ topic: "community-live:probe" })
    /* The community's search: what the server answers for "glaze" (and its index, empty, so the server's answer is drawn). */
    if (url.pathname.endsWith("/search")) {
      if (url.searchParams.get("index")) return reply({ index: { at: Date.now(), spaces: [], posts: [], members: [], lessons: [], events: [] } })
      return reply(SEARCH_REPLY(url.searchParams.get("q") || ""), 90)
    }
    return reply({})
  }
  return realFetch(input, init)
}

const topBar: TopBarData = {
  community: { id: CID, slug: community.slug, name: community.name, logoUrl: community.logoUrl },
  creator: { name: "Maya Okafor", href: "/mayao" },
  me: { name: people.me.name, avatarUrl: people.me.avatarUrl, profileHref: `/@${people.me.username}` },
  communities: [{ id: CID, slug: community.slug, name: community.name, logoUrl: community.logoUrl }],
  manageHref: null,
}

/* The navigator's refresh, for the probe: what a pull asks the shell for (navigator.refresh, the feed's registered one). */
function RefreshHandle() {
  const nav = useCommunityNavigator()
  ;(window as unknown as { __refreshFeed?: () => Promise<void> }).__refreshFeed = () => nav.refresh()
  return null
}

function Screen() {
  const first = makePosts(0)
  return (
    <ShellFrame community={community} viewer={viewer} topBar={topBar} unreadMessages={null} wall={{ card: { stats: { members: community.memberCount, online: 5, admins: 2 }, faces: [], more: 0, settingsHref: null }, upcoming: null, contributors: null }}>
      <FeedColumns
        main={
          <CommunityFeed
            communityId={CID}
            slug={community.slug}
            viewer={viewer}
            spaces={spaces}
            start={{ kind: "all" }}
            initial={{ pinned: [], posts: first, nextCursor: null }}
            servedAt={Date.now()}
            compose={{ userId: people.me.id, me: { name: people.me.name, avatarUrl: people.me.avatarUrl }, fileProductId: null }}
          />
        }
      />
    </ShellFrame>
  )
}

try {
  window.localStorage.clear()
} catch {
  /* fine */
}
/* ?nav=0 draws the feed with no shell navigator, as a caller outside the community's shell would. */
const withNav = params.get("nav") !== "0"
createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <ViewportVars />
    {withNav ? (
      <CommunityNavigatorProvider slug={community.slug} initial={placeFromUrl(location.pathname, location.search) ?? { kind: "feed" }} chatSpaces={new Set()}>
        <RefreshHandle />
        <Screen />
      </CommunityNavigatorProvider>
    ) : (
      <Screen />
    )}
  </LocaleProvider>,
)
