/**
 * For scripts/check-community-post-media13.mjs: the real feed (FeedView) with three posts whose pictures are on
 * Supabase storage, so every picture goes through the image route (/_next/image) as in production, which the probe
 * answers with real PNGs at the asked width, the full size ones late. One picture, two pictures, a video alone.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { FeedColumns } from "@/components/community/member/columns"
import { FeedView } from "@/components/community/member/feed"
import { LocaleProvider } from "@/components/locale-provider"
import { ViewportVars } from "@/components/viewport-vars"
import { allowedActions } from "@/lib/communities/permissions"
import type { FeedPostView, ViewerView } from "@/lib/communities/types"

const NOW = Date.now()
const HOUR = 3_600_000
const iso = (ms: number) => new Date(ms).toISOString()
const CID = "6f1c2a1e-0000-4000-8000-000000000001"
const pic = (name: string) => `https://abc.supabase.co/storage/v1/object/public/community/${name}.jpg`

const author = { id: "u-jonas", name: "Jonas Berg", username: "jonasb", avatarUrl: null, role: "member" as const, level: 3 }
const viewer: ViewerView = {
  userId: "u-me",
  signedIn: true,
  role: "member",
  status: "active",
  active: true,
  tierId: null,
  level: 2,
  points: 10,
  isOwner: false,
  isCreatorAccount: false,
  mutedUntil: null,
  can: allowedActions("member"),
}

const post = (over: Partial<FeedPostView> & { id: string }): FeedPostView => ({
  communityId: CID,
  space: { id: "s-general", slug: "general", name: "General" },
  kind: "post",
  title: "A post",
  body: "",
  bodyText: "A few words under the title.",
  media: [],
  pinned: false,
  featured: false,
  locked: false,
  status: "published",
  author,
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
  recentCommenters: [],
  lastCommentAt: null,
  showLevel: true,
  ...over,
})

const posts: FeedPostView[] = [
  post({ id: "p-one", title: "One picture", media: [{ type: "image", url: pic("one"), w: 1600, h: 1067 }] }),
  post({ id: "p-two", title: "Two pictures", media: [{ type: "image", url: pic("two-a"), w: 1200, h: 900 }, { type: "image", url: pic("two-b"), w: 1200, h: 900 }] }),
  post({ id: "p-video", title: "A video", media: [{ type: "video", videoId: "v1", poster: pic("poster"), w: 1280, h: 720 }] }),
]

createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <ViewportVars />
    <div className="min-h-svh bg-[#f8f9fa] px-8 pt-6">
      <div className="mx-auto max-w-[627px]"><FeedColumns main={<FeedView communityId={CID} slug="studio-notes" viewer={viewer} initial={{ pinned: [], posts, nextCursor: null }} />} /></div>
    </div>
  </LocaleProvider>,
)
