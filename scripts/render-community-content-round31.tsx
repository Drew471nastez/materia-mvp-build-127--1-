/**
 * The community's content sections in /app (Spaces, Feed, Learn, Calendar) for
 * scripts/check-community-content-round31.mjs: the real components with
 * fixture props, inside a stand-in for the /app frame, picked by ?case=:
 *
 *   spaces, feed, feed-welcome, feed-empty, classroom, events
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { allowedActions } from "@/lib/communities/permissions"
import { CommunityShell } from "@/components/community/creator/community-shell"
import { FeedSection } from "@/components/community/creator/feed-section"
import { EventsSection } from "@/components/community/creator/events-section"
import { SpacesSection } from "@/components/community/creator/spaces-section"
import { ClassroomSection } from "@/components/community/creator/classroom-section"
import type { CommunityHead, FeedRowView } from "@/components/community/creator/view-types"
import { ViewportVars } from "@/components/viewport-vars"

const params = new URLSearchParams(location.search)
const which = params.get("case") || "spaces"
const ID = "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"
const ME = "00000000-0000-4000-8000-000000000001"
const NOW = Date.now()
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString()
const ahead = (d: number) => new Date(NOW + d * 86_400_000).toISOString()

/** A flat picture drawn here (no network in the probe). */
function picture(ground: string, ink: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="${ground}"/><circle cx="470" cy="130" r="56" fill="${ink}" opacity="0.55"/><path d="M0 330 L220 200 L380 300 L520 230 L640 300 L640 400 L0 400Z" fill="${ink}"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const head: CommunityHead = {
  id: ID,
  slug: "morning-writers",
  name: "The Morning Writers",
  tagline: "Write 500 words before breakfast, together.",
  logoUrl: null,
  coverUrl: null,
  status: "published",
  access: "paid",
  visibility: "public",
  memberCount: 1284,
  postCount: 3412,
  archived: false,
  suspended: false,
  gamificationEnabled: true,
  classroomEnabled: true,
  eventsEnabled: true,
  role: "owner",
  can: allowedActions("owner"),
  openReports: 0,
  me: { userId: ME, name: "Ana Popescu", avatarUrl: null },
}
const options = { tiers: [{ id: "t1", name: "Members" }, { id: "t2", name: "Lifetime" }], levels: [{ level: 1, name: "Newcomer", minPoints: 0, reward: null }] }

function Frame({ children, path }: { children: React.ReactNode; path: string }) {
  ;(window as unknown as { __path: string }).__path = path
  return (
    <div className="h-svh overflow-hidden bg-[#131316]">
      <header className="fixed inset-x-0 top-0 z-30 h-[68px] bg-[#131316] md:h-[58px]" />
      <aside className="fixed bottom-0 left-0 top-[58px] hidden w-[240px] bg-[#131316] md:block" />
      <main className="h-svh overflow-hidden bg-[#f8f9fa] pt-[68px] md:bg-white md:pl-[240px] md:pt-[58px]">
        <div className="app-content-scroll h-[calc(100svh-68px)] overflow-y-auto md:h-[calc(100svh-58px)]">{children}</div>
      </main>
    </div>
  )
}

function Shell({ children, section }: { children: React.ReactNode; section: string }) {
  return (
    <Frame path={`/app/community/${ID}/${section}`}>
      <CommunityShell head={head}>{children}</CommunityShell>
    </Frame>
  )
}

const row = (i: number, over: Partial<FeedRowView>): FeedRowView => ({
  id: `p${i}0000000-0000-4000-8000-00000000000${i}`,
  kind: "post",
  title: null,
  excerpt: "",
  spaceName: "General",
  authorName: "Marcus Lee",
  pinned: false,
  locked: false,
  featured: false,
  status: "published",
  reactionCount: 0,
  commentCount: 0,
  createdAt: ago(i * 0.3),
  media: [],
  poll: null,
  spaceId: "s1",
  spaceIcon: "✍️",
  spaceKind: "feed",
  authorId: "00000000-0000-4000-8000-000000000002",
  authorAvatar: null,
  ...over,
})

const feedRows: FeedRowView[] = [
  row(1, { kind: "announcement", title: "Friday call moves to 6pm", excerpt: "From this week the call starts an hour later so more of you can make it.", spaceName: "Announcements", spaceId: "s2", spaceIcon: null, spaceKind: "announcements", authorName: "Ana Popescu", authorId: ME, pinned: true, reactionCount: 48, commentCount: 12 }),
  row(2, { title: "My desk this morning", excerpt: "Day 31. Wrote about my grandmother's kitchen. 640 words before the kettle boiled.", featured: true, reactionCount: 21, commentCount: 4, media: [{ type: "image", url: picture("#d9c7a7", "#8b6b47"), w: 640, h: 400 }, { type: "image", url: picture("#c9d6c3", "#4f6b4a"), w: 640, h: 400 }, { type: "image", url: picture("#d6cfe0", "#5b5470"), w: 640, h: 400 }] }),
  row(3, { title: "How I edit a first draft", excerpt: "A short video of the three passes I make.", media: [{ type: "video", videoId: "11111111-1111-4111-8111-111111111111", poster: picture("#2b3040", "#7a8199"), w: 1280, h: 720 }], reactionCount: 9, commentCount: 2, authorName: "Priya Raman" }),
  row(4, { kind: "poll", title: "When should the call be?", excerpt: "Pick the time that suits you.", poll: { question: "Which evening works best?", votes: 37, options: 3, closed: false }, reactionCount: 3, commentCount: 7, authorName: "Sofia Rossi" }),
  row(5, { title: "Prompt deck, March", excerpt: "Thirty prompts, one for each morning.", media: [{ type: "file", assetId: "a1", name: "prompts-march.pdf", size: 240_000, store: "community" }, { type: "file", assetId: "a2", name: "prompts-march-print.pdf", size: 1_200_000, store: "community" }], reactionCount: 15, commentCount: 1, authorId: ME, authorName: "Ana Popescu" }),
  row(6, { title: "Buy my course", excerpt: "Link in bio", authorName: "Spam Account", status: "removed", locked: true }),
]

function App() {
  switch (which) {
    case "spaces":
      return (
        <Shell section="spaces">
          <SpacesSection
            head={head}
            options={options}
            initial={[
              { id: "s1", slug: "general", name: "General", description: "Say hello", icon: "messages-square", kind: "feed", position: 0, postRole: "member", commentsEnabled: true, viewAccess: {}, archived: false, posts: 2810 },
              { id: "s2", slug: "announcements", name: "Announcements", description: null, icon: "megaphone", kind: "announcements", position: 1, postRole: "admin", commentsEnabled: true, viewAccess: {}, archived: false, posts: 42 },
              { id: "s3", slug: "chat", name: "Morning chat", description: null, icon: null, kind: "chat", position: 2, postRole: "member", commentsEnabled: true, viewAccess: {}, archived: false, posts: 9120 },
              { id: "s4", slug: "inner", name: "Inner circle", description: null, icon: "👨‍👩‍👧", kind: "feed", position: 3, postRole: "member", commentsEnabled: true, viewAccess: { tierIds: ["t2"] }, archived: false, posts: 140 },
              { id: "s5", slug: "ai", name: "AI tools", description: null, icon: "AI", kind: "resources", position: 4, postRole: "admin", commentsEnabled: true, viewAccess: {}, archived: false, posts: 12 },
            ]}
          />
        </Shell>
      )
    case "feed":
    case "feed-welcome":
    case "feed-empty":
      return (
        <Shell section="feed">
          <FeedSection
            head={head}
            spaces={[
              { id: "s1", name: "General", announcements: false },
              { id: "s2", name: "Announcements", announcements: true },
            ]}
            compose={which === "feed-welcome" ? "welcome" : null}
            initial={{ next: null, rows: which === "feed" ? feedRows : [] }}
          />
        </Shell>
      )
    case "classroom":
      return (
        <Shell section="classroom">
          <ClassroomSection
            head={head}
            options={options}
            initial={{
              attached: [
                { productId: "c1", title: "The 30 day writing course", cover: picture("#d9c7a7", "#8b6b47"), status: "published", position: 0, access: {}, dripDays: null },
                { productId: "c2", title: "Editing your first draft", cover: null, status: "draft", position: 1, access: { tierIds: ["t2"] }, dripDays: 14 },
              ],
              available: [{ id: "c3", title: "Poetry in a week", type: "course", cover: null, status: "published" }],
            }}
          />
        </Shell>
      )
    default:
      return (
        <Shell section="events">
          <EventsSection
            head={head}
            options={options}
            openNew={params.get("new") === "1"}
            initial={{
              upcoming: [
                { id: "e1", title: "Friday feedback call", description: "", coverUrl: null, kind: "live", startsAt: ahead(2), endsAt: new Date(Date.parse(ahead(2)) + 3_600_000).toISOString(), timezone: "Europe/Bucharest", location: null, meetingUrl: "https://zoom.us/j/1", livestreamUrl: null, capacity: 100, goingCount: 64, access: {}, replayVideoId: null, status: "scheduled", priceCents: null, currency: null, salesCloseAt: null, refundWindowHours: null, refundPolicy: null, ticketsSold: 0, money: null },
              ],
              past: [],
              tickets: { ready: true, canSell: true, currency: "usd", communityPolicy: null },
            }}
          />
        </Shell>
      )
  }
}

createRoot(document.getElementById("app")!).render(
  <>
    <ViewportVars />
    <App />
  </>,
)
