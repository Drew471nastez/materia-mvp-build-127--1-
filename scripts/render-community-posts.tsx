/**
 * Round 7's posts for scripts/check-community-posts.mjs: the real member
 * components (the frame, the feed with Skool like cards, the composer, a
 * post opened over the feed, the post page with its media grid, the
 * lightbox, member messages) with fixtures, chosen by ?case=. The API
 * routes they call are answered by the probe; realtime is a stub the probe
 * can push rows through (window.__emit), so a message sent on one page can
 * be seen arriving on another.
 *
 *   feed   /community/<slug>               cards: picture, video still, GIF, video by address, link, file, text
 *   post   /community/<slug>/post/<id>     the post page with its media grid
 *   dm     /community/<slug>?as=<user>     the frame with Messages, as one of two members
 *   long   /community/<slug>               round 9: the feed with more posts, for scroll that must come back
 *   mount  /community/<slug>               round 9: a page of 20 posts mounted when the probe calls
 *          window.__mount(n), each time new (going back to the feed, switching a space)
 *   media  /community/<slug>/post/<id>?post=<id>   round 8: one post of MEDIA_POSTS on its
 *          page (one picture, a tall one, two, many, a video alone, a YouTube
 *          address in the words, a picture linked in the words and in a comment)
 *
 * Like the real frame (components/community/member/shell.tsx), every case
 * draws MediaLinks, so a press on a picture link opens the viewer.
 */
import React, { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { ShellFrame } from "@/components/community/member/shell-frame"
import { FeedColumns } from "@/components/community/member/columns"
import { FeedView } from "@/components/community/member/feed"
import { SpaceChips } from "@/components/community/member/space-chips"
import { PostPage } from "@/components/community/member/post-page"
import { MediaLinks } from "@/components/community/member/media-viewer"
import { LocaleProvider } from "@/components/locale-provider"
import { ViewportVars } from "@/components/viewport-vars"
import { allowedActions } from "@/lib/communities/permissions"
import type { FeedPostView, ViewerView } from "@/lib/communities/types"
import type { ShellCommunity, SpaceView, TopBarData } from "@/components/community/member/view-types"

const NOW = Date.now()
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const iso = (ms: number) => new Date(ms).toISOString()
const CID = "6f1c2a1e-0000-4000-8000-000000000001"

const picture = (a: string, b: string, w = 1200, h = 800) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="${w * 0.7}" cy="${h * 0.3}" r="${h * 0.18}" fill="#ffffff" opacity="0.28"/><rect x="0" y="${h * 0.7}" width="${w}" height="${h * 0.3}" fill="#000" opacity="0.08"/></svg>`)}`
const face = (bg: string, fg: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="${bg}"/><circle cx="48" cy="38" r="18" fill="${fg}"/><rect x="18" y="62" width="60" height="40" rx="30" fill="${fg}"/></svg>`)}`

const community: ShellCommunity = {
  id: CID,
  slug: "studio-notes",
  name: "Studio Notes",
  tagline: "A working group for independent product designers.",
  logoUrl: picture("#283044", "#5c6b8a", 200, 200),
  coverUrl: picture("#d8dee9", "#9aa5b8"),
  memberCount: 1284,
  postCount: 3412,
  classroomEnabled: true,
  eventsEnabled: true,
  directoryEnabled: true,
  chatEnabled: true,
  gamificationEnabled: true,
  archived: false,
}

const params = new URLSearchParams(location.search)
const which = params.get("case") || "feed"
const as = params.get("as") || "u-me"

const people = {
  maya: { id: "u-maya", name: "Maya Okafor", username: "mayao", avatarUrl: face("#e8d5c4", "#8a5a3c"), role: "owner" as const, level: 6 },
  jonas: { id: "u-jonas", name: "Jonas Berg", username: "jonasb", avatarUrl: face("#cfdcd2", "#3f6b4f"), role: "member" as const, level: 3 },
  priya: { id: "u-priya", name: "Priya Raman", username: "priya", avatarUrl: null, role: "admin" as const, level: 5 },
  leo: { id: "u-leo", name: "Leo Martins", username: "leom", avatarUrl: face("#d6d9ef", "#4a4f8a"), role: "member" as const, level: 2 },
  me: { id: "u-me", name: "Sam Carter", username: "samc", avatarUrl: face("#efe3cf", "#8a6d3c"), role: "moderator" as const, level: 3 },
}
const self = as === "u-jonas" ? people.jonas : people.me

const viewer: ViewerView = {
  userId: self.id,
  signedIn: true,
  role: self.role,
  status: "active",
  active: true,
  tierId: null,
  level: self.level,
  points: 84,
  isOwner: false,
  isCreatorAccount: false,
  mutedUntil: null,
  can: allowedActions(self.role),
}

const spaces: SpaceView[] = [
  { id: "s-general", slug: "general", name: "General", description: null, icon: "messages-square", kind: "feed", canPost: true, commentsEnabled: true, unread: 0 },
  { id: "s-intro", slug: "introductions", name: "Introductions", description: null, icon: "hand", kind: "feed", canPost: true, commentsEnabled: true, unread: 0 },
  { id: "s-crit", slug: "critique", name: "Critique", description: null, icon: "🎯", kind: "feed", canPost: true, commentsEnabled: true, unread: 0 },
]

const commenters = [
  { id: "u-maya", name: "Maya Okafor", avatarUrl: people.maya.avatarUrl },
  { id: "u-leo", name: "Leo Martins", avatarUrl: people.leo.avatarUrl },
  { id: "u-jonas", name: "Jonas Berg", avatarUrl: people.jonas.avatarUrl },
]

const post = (over: Partial<FeedPostView> & { id: string }): FeedPostView => ({
  communityId: CID,
  space: { id: "s-general", slug: "general", name: "General" },
  kind: "post",
  title: "A post",
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
  canModerate: true,
  recentCommenters: [],
  lastCommentAt: null,
  showLevel: true,
  ...over,
})

export const POSTS: FeedPostView[] = [
  post({
    id: "p-intro",
    author: people.leo,
    space: { id: "s-intro", slug: "introductions", name: "Introductions" },
    title: "Hi everyone",
    bodyText: "Hi, I'm Leo. I design onboarding for small fintech teams and joined to get honest critique before things ship. Where I'm from: Lisbon. Why I'm here: to stop guessing whether my second screen is too sparse, and to meet people who care about the details.",
    media: [
      { type: "image", url: picture("#e9e4dc", "#c8b9a6"), w: 1200, h: 800 },
      { type: "image", url: picture("#dfe7ee", "#a9bccd"), w: 1200, h: 800 },
      { type: "gif", url: picture("#f4d7c8", "#d98f6a", 400, 300), still: picture("#f4d7c8", "#d98f6a", 400, 300), w: 200, h: 150 },
      { type: "video", videoId: "11111111-0000-4000-8000-000000000001", poster: picture("#1f2a3a", "#4b6b8a"), w: 1920, h: 1080 },
      { type: "file", assetId: "22222222-0000-4000-8000-000000000001", name: "Onboarding flow v3.pdf", size: 2_400_000, store: "community" },
    ],
    reactionCount: 3,
    commentCount: 3,
    recentCommenters: commenters,
    lastCommentAt: iso(NOW - 2 * DAY),
    createdAt: iso(NOW - 23 * DAY),
    lastActivityAt: iso(NOW - 2 * DAY),
  }),
  post({
    id: "p-video",
    author: people.maya,
    /* Round 8: the owner's pinned post, so the role and Pinned share the line at 390px. */
    pinned: true,
    title: "Recording from last week's critique night",
    bodyText: "Here is the recording. Skip to 14:20 for the pricing page discussion, it was the best part.",
    media: [{ type: "embed", provider: "youtube", id: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", thumb: picture("#283044", "#7c8db0", 480, 360), title: "Critique night" }],
    reactionCount: 21,
    commentCount: 7,
    recentCommenters: commenters.slice(0, 2),
    lastCommentAt: iso(NOW - 3 * HOUR),
    createdAt: iso(NOW - 5 * HOUR),
    lastActivityAt: iso(NOW - 3 * HOUR),
  }),
  post({
    id: "p-gif",
    author: people.priya,
    space: { id: "s-crit", slug: "critique", name: "Critique" },
    title: "Shipped the redesign",
    bodyText: "After six weeks of back and forth, it is live. Thank you all for the notes on the empty states.",
    media: [{ type: "gif", url: picture("#e8f0e4", "#8fb38a", 400, 300), still: picture("#e8f0e4", "#8fb38a", 400, 300), w: 200, h: 150, title: "celebrate" }],
    reactionCount: 44,
    reacted: true,
    commentCount: 12,
    recentCommenters: commenters,
    lastCommentAt: iso(NOW - 9 * DAY),
    createdAt: iso(NOW - 10 * DAY),
  }),
  post({
    id: "p-link",
    author: people.me,
    canEdit: true,
    title: "Best thing I read on empty states",
    bodyText: "This piece on writing UI copy for empty states is the best I have read in a while.",
    media: [{ type: "link", url: "https://example.com/notes/empty-states", title: "Empty states are the first thing people read", image: picture("#f1e9da", "#d9c3a0", 600, 400) }],
    reactionCount: 3,
    createdAt: iso(NOW - DAY - 2 * HOUR),
  }),
  post({
    id: "p-text",
    author: people.jonas,
    title: "Paid discovery week instead of a free pitch",
    bodyText:
      "Small win: a client agreed to a paid discovery week instead of a free pitch. What made the difference was showing the plan for the week as a one page calendar, with what they get at the end of each day.\n\nHappy to share the template if useful.",
    reactionCount: 24,
    commentCount: 1,
    recentCommenters: commenters.slice(1, 2),
    lastCommentAt: iso(NOW - 20 * MIN),
    createdAt: iso(NOW - 2 * DAY),
    lastActivityAt: iso(NOW - 20 * MIN),
  }),
]

/** Round 8: the opened post's media, one post per layout. */
const STORAGE = "https://placeholder.supabase.co/storage/v1/object/public/community-media/u-me"
export const MEDIA_POSTS: FeedPostView[] = [
  post({ id: "m-one", title: "One picture", bodyText: "The new studio, finally painted.", media: [{ type: "image", url: picture("#e9e4dc", "#c8b9a6", 1600, 1000), w: 1600, h: 1000 }] }),
  post({ id: "m-tall", title: "A tall picture", bodyText: "Phone screenshot of the onboarding.", media: [{ type: "image", url: picture("#dfe7ee", "#a9bccd", 900, 1950), w: 900, h: 1950 }] }),
  post({
    id: "m-two",
    title: "Two side by side",
    bodyText: "Before and after.",
    media: [
      { type: "image", url: picture("#efe3cf", "#c49a5a", 1200, 900), w: 1200, h: 900 },
      { type: "video", videoId: "11111111-0000-4000-8000-000000000002", poster: picture("#1f2a3a", "#4b6b8a", 1920, 1080), w: 1920, h: 1080 },
    ],
  }),
  post({
    id: "m-many",
    title: "Five from the workshop, and the talk",
    bodyText: "Some pictures from Saturday.",
    media: [
      { type: "image", url: picture("#e8d5c4", "#8a5a3c", 1600, 900), w: 1600, h: 900 },
      { type: "image", url: picture("#cfdcd2", "#3f6b4f"), w: 1200, h: 800 },
      { type: "gif", url: picture("#f4d7c8", "#d98f6a", 400, 300), still: picture("#f4d7c8", "#d98f6a", 400, 300), w: 400, h: 300 },
      { type: "embed", provider: "youtube", id: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", thumb: picture("#283044", "#7c8db0", 480, 360) },
      { type: "image", url: picture("#d6d9ef", "#4a4f8a"), w: 1200, h: 800 },
      { type: "image", url: picture("#f1e9da", "#d9c3a0"), w: 1200, h: 800 },
    ],
  }),
  post({ id: "m-video", title: "A video alone", bodyText: "Ten minutes on grids.", media: [{ type: "video", videoId: "11111111-0000-4000-8000-000000000003", poster: picture("#283044", "#5c6b8a", 1920, 1080), w: 1920, h: 1080 }] }),
  post({
    id: "m-yt",
    title: "Talks worth watching",
    bodyText: "This one changed how I name layers: https://youtu.be/aqz-KE-bpKQ\n\nAnd the short version: https://m.youtube.com/shorts/ScMzIvxBSi4",
    media: [],
  }),
  post({
    id: "m-links",
    title: "Picture in the words",
    bodyText: `Here is the sketch: ${STORAGE}/sketch.png and the clip ${STORAGE}/walkthrough.mp4`,
    media: [{ type: "file", assetId: "22222222-0000-4000-8000-000000000002", name: "Moodboard.jpg", size: 840_000, store: "community" }, { type: "file", assetId: "22222222-0000-4000-8000-000000000003", name: "Notes.pdf", size: 120_000, store: "community" }],
    commentCount: 1,
  }),
]

const MEDIA_COMMENTS = [
  {
    id: "c-pic",
    postId: "m-links",
    parentId: null,
    body: `Mine from last week: ${STORAGE}/mine.jpg`,
    status: "published" as const,
    deleted: false,
    author: people.maya,
    reactionCount: 2,
    reacted: false,
    createdAt: iso(NOW - HOUR),
    editedAt: null,
    replies: [],
    canEdit: false,
    canModerate: true,
  },
]

const topBar: TopBarData = {
  community: { id: CID, slug: community.slug, name: community.name, logoUrl: community.logoUrl },
  creator: { name: "Maya Okafor", href: "/mayao" },
  me: { name: self.name, avatarUrl: self.avatarUrl, profileHref: `/@${self.username}` },
  communities: [{ id: CID, slug: community.slug, name: community.name, logoUrl: community.logoUrl }],
  manageHref: null,
}

function Screen() {
  const shell = (children: React.ReactNode) => (
    <>
    <MediaLinks communityId={CID} />
    <ShellFrame community={community} viewer={viewer} topBar={topBar} unreadMessages={which === "dm" ? 0 : null} wall={{ card: { stats: { members: community.memberCount, online: 5, admins: 2 }, faces: [], more: 0, settingsHref: null }, upcoming: null, contributors: null }}>
      {children}
    </ShellFrame>
    </>
  )
  const me = { name: self.name, avatarUrl: self.avatarUrl }
  if (which === "media") {
    const chosen = MEDIA_POSTS.find((p) => p.id === params.get("post")) ?? MEDIA_POSTS[0]
    return shell(<FeedColumns main={<PostPage slug={community.slug} viewer={viewer} post={chosen} comments={{ comments: chosen.id === "m-links" ? MEDIA_COMMENTS : [], nextCursor: null }} me={me} />} />)
  }
  if (which === "mount") return shell(<MountBench me={me} />)
  if (which === "long") {
    /* Round 9: three times the posts, so there is a feed to scroll away into and come back to. */
    const many = [0, 1, 2].flatMap((k) => POSTS.filter((p) => !p.pinned).map((p) => ({ ...p, id: k ? `${p.id}-${k}` : p.id })))
    return shell(
      <FeedColumns
        main={<FeedView communityId={CID} slug={community.slug} viewer={viewer} initial={{ pinned: [], posts: many, nextCursor: null }} composer={{ communityId: CID, userId: self.id, me, spaces: spaces.map((s) => ({ id: s.id, name: s.name, kind: s.kind })), fileProductId: null }} />}
      />,
    )
  }
  if (which === "post") {
    return shell(<FeedColumns main={<PostPage slug={community.slug} viewer={viewer} post={POSTS[0]} comments={{ comments: [], nextCursor: null }} me={me} />} />)
  }
  return shell(
    <FeedColumns
      header={<SpaceChips slug={community.slug} spaces={spaces} active={null} />}
      main={
        <FeedView
          communityId={CID}
          slug={community.slug}
          viewer={viewer}
          initial={{ pinned: POSTS.filter((p) => p.pinned), posts: POSTS.filter((p) => !p.pinned), nextCursor: null }}
          composer={{ communityId: CID, userId: self.id, me, spaces: spaces.map((s) => ({ id: s.id, name: s.name, kind: s.kind })), fileProductId: null }}
        />
      }
    />,
  )
}

/* Twenty posts (a feed page) of the usual mix, with ids new to each mount, so nothing is reused from the one before. */
function MountBench({ me }: { me: { name: string; avatarUrl: string | null } }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    ;(window as unknown as { __mount: (k: number) => void }).__mount = setN
  }, [])
  if (!n) return <div data-bench-empty="" />
  const posts = Array.from({ length: 20 }, (_, i) => {
    const p = POSTS[i % POSTS.length]
    return { ...p, id: `${p.id}-m${n}-${i}`, pinned: false }
  })
  return (
    <FeedColumns
      main={<FeedView key={n} communityId={CID} slug={community.slug} viewer={viewer} initial={{ pinned: [], posts, nextCursor: null }} composer={{ communityId: CID, userId: self.id, me, spaces: spaces.map((s) => ({ id: s.id, name: s.name, kind: s.kind })), fileProductId: null }} />}
    />
  )
}

try {
  if (!params.get("keep")) window.localStorage.clear()
  /* Seen: a first visit a month ago, and the GIF post opened since its last activity; the rest are new. */
  window.localStorage.setItem(`storelib:community-seen:${CID}:${self.id}`, JSON.stringify({ since: iso(NOW - 30 * DAY), seen: { "p-gif": iso(NOW) } }))
} catch {
  /* fine */
}
/* The root layout's LocaleProvider: the community bar's account menu reads its words from it. */
/* The root layout's ViewportVars too: the phone editor and the post sheet size themselves from what it publishes (--vv-h, --vv-top, --kb-inset). */
createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <ViewportVars />
    <Screen />
  </LocaleProvider>,
)
