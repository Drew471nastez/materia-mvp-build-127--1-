/**
 * Round 39's screens, drawn by the real components, for
 * scripts/check-community-people-r39.mjs. window.__probe.mode picks one:
 *
 *   panel   the messages panel (components/community/member/messages.tsx),
 *           opened by the probe; its pen opens New message (people-picker.tsx)
 *   chat    the panel opened on a conversation whose messages carry posts:
 *           one the reader may see, one they may not (chat-post-card.tsx)
 *   feed    two real post cards (post-card.tsx): one drawn as an opened post,
 *           whose share button offers Send in a message (share-to-chat.tsx),
 *           and one as the feed draws it, whose dots offer it too
 *
 * The probe answers every /api request the screens make.
 */
import React, { useCallback, useState } from "react"
import { createRoot } from "react-dom/client"
import { MessagesPanel } from "@/components/community/member/messages"
import { PostCard } from "@/components/community/member/post-card"
import { ViewportVars } from "@/components/viewport-vars"
import { Toasts } from "@/components/community/member/toast"
import { allowedActions } from "@/lib/communities/permissions"
import type { FeedPostView, ViewerView } from "@/lib/communities/types"

const p = (window as unknown as { __probe: { mode: string; communityId: string; me: { id: string; name: string }; start?: { userId?: string } | null } }).__probe
const w = window as unknown as { __openMessages?: () => void }
const NOW = Date.now()
const iso = (ms: number) => new Date(ms).toISOString()

function svg(width: number, height: number, body: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${body}</svg>`)}`
}
const face = (bg: string, fg: string) => svg(96, 96, `<rect width="96" height="96" fill="${bg}"/><circle cx="48" cy="38" r="18" fill="${fg}"/><rect x="18" y="62" width="60" height="40" rx="30" fill="${fg}"/>`)

const viewer: ViewerView = { userId: p.me.id, signedIn: true, role: "member", status: "active", active: true, tierId: null, level: 3, points: 84, isOwner: false, isCreatorAccount: false, mutedUntil: null, can: allowedActions("member") } as ViewerView

const post = (over: Partial<FeedPostView> & { id: string }): FeedPostView => ({
  communityId: p.communityId,
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
  author: { id: "dddddddd-0000-4000-8000-00000000000d", name: "Dan Wu", username: "danwu", avatarUrl: face("#e8d5c4", "#8a5a3c"), role: "member", level: 4, hasStorefront: false },
  reactionCount: 0,
  commentCount: 0,
  reacted: false,
  bookmarked: false,
  poll: null,
  createdAt: iso(NOW - 3 * 3_600_000),
  editedAt: null,
  lastActivityAt: iso(NOW - 3_600_000),
  canEdit: false,
  canModerate: false,
  ...over,
})

const POSTS: FeedPostView[] = [
  post({ id: "00000000-0000-4000-a000-000000000201", title: "Dovetail jig, finally square", bodyText: "How I cut the tails with a cheap dozuki and a block of oak. Three tries, then it clicked.", reactionCount: 18, commentCount: 4 }),
  post({ id: "00000000-0000-4000-a000-000000000202", bodyText: "Anyone near Porto with a bandsaw to share for an afternoon?", reactionCount: 3, commentCount: 1 }),
]

function Feed() {
  const [posts, setPosts] = useState(POSTS)
  const update = useCallback((id: string, fn: (x: FeedPostView) => FeedPostView | null) => {
    setPosts((list) => list.flatMap((x) => (x.id === id ? (fn(x) ? [fn(x)!] : []) : [x])))
  }, [])
  return (
    <main className="mx-auto max-w-[680px] px-4 pb-24 pt-6" data-community-feed="">
      {/* The first as an opened post draws it (its footer's share button), the second as the feed does (its dots). */}
      {posts.map((x, i) => (
        <div key={x.id} className="mb-3">
          <PostCard post={x} slug="studio-notes" viewer={viewer} update={update} full={i === 0} />
        </div>
      ))}
    </main>
  )
}

function App() {
  const [open, setOpen] = useState(false)
  w.__openMessages = () => setOpen(true)
  return (
    <div data-community-shell="" className="min-h-svh bg-[#f8f9fa] [--community-top:64px]">
      <div className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-[#e6e8ec] bg-white px-4 text-[15px] font-semibold text-[#1a1a2e]" data-probe-bar="">
        Studio Notes
        <button type="button" onClick={() => setOpen(true)} data-probe-open="" className="h-10 rounded-full px-4 text-[14px] font-medium hover:bg-[#f1f2f4]">
          Messages
        </button>
      </div>
      {p.mode === "feed" ? <Feed /> : <p className="px-6 pt-6 text-[14px] text-[#6b7280]">The community&apos;s page.</p>}
      {p.mode !== "feed" ? <MessagesPanel communityId={p.communityId} slug="studio-notes" userId={p.me.id} open={open} start={p.start ?? null} onClose={() => setOpen(false)} onRead={() => undefined} /> : null}
      <Toasts />
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <>
    <ViewportVars />
    <App />
  </>,
)
