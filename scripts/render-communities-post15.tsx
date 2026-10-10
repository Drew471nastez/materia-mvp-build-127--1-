/**
 * ===========================================================================
 *  ROUND 15: A FEED ON A PHONE, TO OPEN AND CLOSE A POST IN (worker O)
 * ===========================================================================
 * Rendered by scripts/check-communities-post15.mjs. The page is what the
 * owner's recording shows, drawn from the real parts: the community's header
 * fixed at the top ([data-community-top]), a column of real post cards
 * (components/community/member/post-card.tsx, whose press opens the real
 * post-overlay.tsx and post-fullscreen.tsx), the composer above them, and a
 * tab bar fixed at the foot ([data-buyer-tab-bar]) which, as the tab bar
 * worker's stylesheet does (lib/ui/layers.ts data-tabs-over), is lifted over
 * an opened post.
 *
 * The pictures are drawn here (no network). ViewportVars publishes the
 * visible viewport as the root layout does.
 */
import React, { useCallback, useState } from "react"
import { createRoot } from "react-dom/client"
import { PostCard } from "@/components/community/member/post-card"
import { Composer } from "@/components/community/member/composer"
import { ViewportVars } from "@/components/viewport-vars"
import { allowedActions } from "@/lib/communities/permissions"
import type { FeedPostView, Role, ViewerView } from "@/lib/communities/types"

const NOW = Date.now()
const HOUR = 3_600_000
const DAY = 24 * HOUR
const iso = (ms: number) => new Date(ms).toISOString()
const CID = "c0000000-0000-4000-8000-000000000001"

function svg(w: number, h: number, body: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`)}`
}
/* Pictures with hard edges and stripes, so a second copy of one drawn over it at any offset is plain to see in a frame. */
const STRIPES = Array.from({ length: 16 }, (_, i) => `<rect x="${i * 100}" y="0" width="40" height="1200" fill="#2f3a44" opacity="0.55"/>`).join("")
const SHOTS = [
  svg(1200, 1200, `<rect width="1200" height="1200" fill="#d9cbb6"/>${STRIPES}<circle cx="820" cy="420" r="260" fill="#c0412e"/><rect x="0" y="900" width="1200" height="300" fill="#1f6b4f"/>`),
  svg(1600, 900, `<rect width="1600" height="900" fill="#cfdbd5"/>${STRIPES}<circle cx="1260" cy="240" r="110" fill="#f2efe6"/>`),
]
const face = (bg: string, fg: string) => svg(96, 96, `<rect width="96" height="96" fill="${bg}"/><circle cx="48" cy="38" r="18" fill="${fg}"/><rect x="18" y="62" width="60" height="40" rx="30" fill="${fg}"/>`)
const LOGO = svg(128, 128, `<rect width="128" height="128" rx="28" fill="#1a1a2e"/><path d="M38 86 L64 40 L90 86 Z" fill="#f4efe6"/>`)

const people = {
  calvin: { id: "u-calvin", name: "Calvin Reyes", username: "calvin", avatarUrl: face("#e8d5c4", "#8a5a3c"), role: "member" as Role, level: 2, hasStorefront: false },
  mara: { id: "u-mara", name: "Mara Lindqvist", username: "mara", avatarUrl: face("#cfdcd2", "#3f6b4f"), role: "owner" as Role, level: 6, hasStorefront: true },
  me: { id: "u-me", name: "Sam Carter", username: "samc", avatarUrl: face("#efe3cf", "#8a6d3c"), role: "member" as Role, level: 3, hasStorefront: false },
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
  author: people.calvin,
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
  post({ id: "p-1", author: people.mara, title: "October firing schedule is up", bodyText: "Three slots this month at the shared kiln: the 9th, 16th and 27th. Book by Friday so I can plan the loads.", reactionCount: 42, commentCount: 0, createdAt: iso(NOW - 3 * DAY) }),
  post({ id: "p-pic", title: "Put yo", bodyText: "Put yo pants down", media: [{ type: "image", url: SHOTS[0], w: 1200, h: 1200 }], reactionCount: 1, commentCount: 0 }),
  post({ id: "p-3", bodyText: "Glaze tip that saved me a whole batch: test tiles on the same shelf height as the real pieces.", reactionCount: 24, commentCount: 0, createdAt: iso(NOW - 2 * DAY) }),
  post({ id: "p-wide", title: "Trimming session", bodyText: "Recording of last week's trimming session is in the Classroom now.", media: [{ type: "image", url: SHOTS[1], w: 1600, h: 900 }], reactionCount: 31, commentCount: 0, createdAt: iso(NOW - 4 * DAY) }),
  post({ id: "p-5", bodyText: "Anyone in Lisbon with a kiln to share? Happy to split costs.", reactionCount: 3, commentCount: 0, createdAt: iso(NOW - 3 * DAY) }),
  post({ id: "p-6", bodyText: "Slower drying under plastic for two days made the difference.", reactionCount: 7, commentCount: 0, createdAt: iso(NOW - 5 * DAY) }),
]

function Feed() {
  const [posts, setPosts] = useState(POSTS)
  const update = useCallback((id: string, fn: (p: FeedPostView) => FeedPostView | null) => {
    setPosts((list) => list.flatMap((p) => (p.id === id ? (fn(p) ? [fn(p)!] : []) : [p])))
  }, [])
  return (
    <div className="min-h-screen bg-[#f8f9fa]" data-community-shell="">
      <header data-community-top="" className="fixed inset-x-0 top-0 z-30 border-b border-[#eceef1] bg-white">
        <div className="flex h-12 items-center gap-2 px-3">
          <span className="flex h-10 w-10 items-center justify-center text-[#1a1a2e]" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 20 20"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" /></svg>
          </span>
          <img src={LOGO} alt="" width={26} height={26} className="rounded-md" />
          <span className="text-[15px] font-semibold text-[#1a1a2e]" data-community-name="">Bandido Social</span>
        </div>
        <nav className="flex h-10 items-end gap-5 px-4 text-[13.5px] text-[#6b7280]">
          <span className="border-b-2 border-[#1a1a2e] pb-2 font-medium text-[#1a1a2e]">Community</span>
          <span className="pb-2">Learn</span>
          <span className="pb-2">Calendar</span>
          <span className="pb-2">Members</span>
        </nav>
      </header>
      <main className="mx-auto max-w-[680px] px-4 pb-[120px] pt-[104px]" data-community-body="" data-community-feed="">
        <div className="mb-3">
          <Composer communityId={CID} userId="u-me" me={{ name: people.me.name, avatarUrl: people.me.avatarUrl }} spaces={[{ id: "s-general", name: "General", kind: "feed", icon: null }]} onPosted={() => undefined} />
        </div>
        {posts.map((p, i) => (
          <PostCard key={p.id} post={p} slug="bandido" viewer={viewer} update={update} priority={i < 3} />
        ))}
      </main>
      <div data-buyer-tab-bar="shown" className="fixed inset-x-0 bottom-0 z-50 bg-white shadow-[0_-1px_0_rgba(16,24,40,0.06)]" style={{ height: "calc(56px + env(safe-area-inset-bottom, 0px))" }}>
        <nav className="flex h-14 items-center justify-around text-[12px] text-[#6b7280]">
          {["Home", "Explore", "Create", "Profile"].map((t) => (
            <span key={t} className="flex h-11 w-16 items-center justify-center" data-tab={t}>
              {t}
            </span>
          ))}
        </nav>
      </div>
    </div>
  )
}

document.documentElement.setAttribute("data-buyer-tabs", "shown")
const lift = document.createElement("style")
/* As the tab bar worker's stylesheet does for an opened post (lib/ui/layers.ts: data-tabs-over on <html>). */
lift.textContent = `html[data-tabs-over] [data-buyer-tab-bar]{z-index:140}`
document.head.appendChild(lift)
try {
  window.localStorage.clear()
} catch {
  /* fine */
}
createRoot(document.getElementById("app")!).render(
  <>
    <ViewportVars />
    <Feed />
  </>,
)
