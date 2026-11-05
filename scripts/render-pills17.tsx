/**
 * The account page's pills and Settings' section pills, as app/(storelib)/account/layout.tsx draws them, for
 * scripts/check-pills17.mjs: the account's wrapper (account-nav-fade.tsx), the hub (the profile's header, its pills and
 * the panel under them) over the real pages filled with a made up buyer:
 *
 *   /account               Activity (components/profile/profile-activity.tsx)
 *   /account/posts         your posts from every community (components/account/account-posts.tsx)
 *   /account/communities   the communities you are in (the list accountCommunitiesBody draws)
 *   /account/settings      Settings and its section pills (components/account/account-settings.tsx)
 *   /community/<slug>/post/<id>   a post of yours opened by its address (components/community/member/
 *                          shared-post.tsx), where the account's Edit post and its rows land
 *
 * THE ROUTER, STOOD IN FOR the way Next's moves: the probe's next/navigation reads the path from a context this file
 * updates in a transition. A page the router was asked to prefetch commits on the press; one it was not waits for the
 * server (window.__serverMs, 350ms by default), the old page on screen meanwhile. So a pill that is not read ahead is
 * measured as the wait it is on a phone.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { AccountNavFade } from "@/components/account/account-nav-fade"
import { AccountHub } from "@/components/account/account-hub"
import { AccountSettings } from "@/components/account/account-settings"
import { AccountPosts } from "@/components/account/account-posts"
import { ProfileActivity, type ActivityItemView } from "@/components/profile/profile-activity"
import { LibraryCommunitiesList } from "@/components/community/public/library-list"
import type { LibraryCommunityRow } from "@/components/community/public/types"
import type { CommunityCard } from "@/lib/communities/types"
import type { ProfilePostView } from "@/lib/communities/member-profile-view"
import { LocaleProvider } from "@/components/locale-provider"
import { SharedPost } from "@/components/community/member/shared-post"
import { allowedActions } from "@/lib/communities/permissions"
import type { FeedPostView, ViewerView } from "@/lib/communities/types"

const w = window as unknown as {
  __path?: string
  __serverMs?: number
  __navigate?: (href: string) => void
  __prefetched?: Set<string>
  __PathContext: React.Context<string | null>
  __commits?: { path: string; at: number }[]
}

const thumb = (fill: string, dot: string) =>
  "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="${fill}"/><circle cx="48" cy="40" r="18" fill="${dot}"/></svg>`)
const COVER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 600" width="1600" height="600"><rect width="1600" height="600" fill="#d9d2c5"/><path d="M0 430 C 420 320, 860 520, 1600 380 L1600 600 L0 600 Z" fill="#8a7f6c"/><circle cx="300" cy="170" r="70" fill="#f4efe6"/></svg>`)

const NOW = Date.parse("2026-10-10T12:00:00Z")
const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString()
const ACTIVITY: ActivityItemView[] = [
  { key: "rv:r1", at: ago(5), kind: "reviewed", title: "Film Emulation Presets", context: null, excerpt: "The Portra look is the one I keep coming back to. Skin tones stay natural.", rating: 5, href: "/p/presets", imageUrl: thumb("#c7d2fe", "#1f2937") },
  { key: "ca:1", at: ago(50), kind: "joined", title: "Retouch Club", context: null, excerpt: null, rating: null, href: "/community/retouch-club", imageUrl: thumb("#1a1a2e", "#f4efe6") },
  { key: "rv:r2", at: ago(90), kind: "reviewed", title: "Drum One Shots Vol. 1", context: null, excerpt: "Punchy, already mixed, and the kicks sit under a bass without fighting it.", rating: 4, href: "/p/drums", imageUrl: thumb("#111827", "#9ca3af") },
  { key: "ca:2", at: ago(200), kind: "joined", title: "Clay Studio", context: null, excerpt: null, rating: null, href: "/community/clay-studio", imageUrl: thumb("#fde68a", "#1f2937") },
  { key: "rv:r3", at: ago(400), kind: "reviewed", title: "Watercolor Brush Pack", context: null, excerpt: "Twenty brushes I actually use. The wet edge one is the reason to buy it.", rating: 5, href: "/p/brushes", imageUrl: thumb("#fecaca", "#7f1d1d") },
]

const CLAY = { id: "c1", slug: "clay-studio", name: "Clay Studio", logoUrl: thumb("#1a1a2e", "#f4efe6") }
const RETOUCH = { id: "c2", slug: "retouch-club", name: "Retouch Club", logoUrl: null }
const POSTS: ProfilePostView[] = [
  { id: "p1", title: "First firing of the new glaze", excerpt: "Came out greener than the test tile. Anyone else seeing that with the celadon?", space: "Show and tell", at: ago(3), reactions: 4, comments: 2, href: "/community/clay-studio/post/p1", imageUrl: thumb("#bbf7d0", "#065f46"), community: CLAY, canEdit: true, canDelete: true },
  { id: "p2", title: "Where do you buy brushes for frequency separation?", excerpt: null, space: "General", at: ago(30), reactions: 0, comments: 5, href: "/community/retouch-club/post/p2", imageUrl: null, community: RETOUCH, canEdit: true, canDelete: true },
  { id: "p3", title: "Studio hours over the holidays", excerpt: "We open late on the 24th and stay closed on the 25th.", space: null, at: ago(120), reactions: 11, comments: 0, href: "/community/clay-studio/post/p3", imageUrl: null, community: CLAY, canEdit: false, canDelete: true },
]

const logo = (hue: number, letter: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="hsl(${hue} 40% 46%)"/><text x="48" y="60" font-family="Inter,Arial" font-size="40" font-weight="700" fill="white" text-anchor="middle">${letter}</text></svg>`)
const card = (i: number, name: string, tagline: string, members: number, price: string): CommunityCard => ({
  id: `00000000-0000-4000-8000-00000000000${i}`,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  name,
  tagline,
  logoUrl: logo(30 + i * 70, name[0]),
  coverUrl: null,
  category: "design",
  access: price === "Free" ? "free" : "paid",
  visibility: "public",
  memberCount: members,
  priceLine: price,
  creator: { id: `cr${i}`, name: ["Ines Duarte", "Sam Reyes", "Ava Stone"][i], username: `maker${i}`, avatarUrl: null },
  url: `/community/c${i}`,
  viewCount: [5210, 128_000, 1200][i],
  rating: i === 0 ? { average: 4.9, count: 37 } : null,
  excerpt: null,
})
const CARDS = [card(0, "Clay Studio", "Potters sharing glazes and kiln notes.", 284, "$9/month"), card(1, "Founders Weekly", "Weekly calls for founders.", 9800, "Free"), card(2, "Retouch Club", "Skin, colour and the people who fix them.", 43, "$19/month")]
const COMMUNITIES: LibraryCommunityRow[] = CARDS.map((c, i) => ({
  id: c.id,
  slug: c.slug,
  name: c.name,
  logoUrl: c.logoUrl,
  coverUrl: c.coverUrl,
  creatorName: c.creator?.name ?? null,
  status: "active",
  role: i === 0 ? "owner" : "member",
  tierName: i === 0 ? "Studio" : null,
  memberCount: c.memberCount,
  url: c.url,
  card: c,
}))

function Panel({ path }: { path: string }) {
  if (path === "/account/posts") return <AccountPosts initial={{ posts: POSTS, next: "more" }} now={NOW} />
  if (path === "/account/communities")
    return (
      <div data-page-communities="" className="space-y-3 pb-4">
        <p className="text-[14px] text-[#6b7280]">3 communities</p>
        <LibraryCommunitiesList rows={COMMUNITIES} />
      </div>
    )
  if (path === "/account/settings")
    return (
      <AccountSettings
        userId="u1"
        email="alex@example.com"
        name="Alex Morgan"
        bio="Buying presets and brushes for retouching work. Mostly film looks."
        bioSupported
        avatarUrl={null}
        createdAt="2025-03-14T10:00:00Z"
        hasPassword
        via="Google"
        isSeller={false}
        newsletter={false}
        personalized
        username="alexmorgan"
        usernameEditable
        cover={{ url: COVER, supported: true }}
        privacy={{ showActivity: true, showCommunities: true, supported: true }}
        location={{ city: "Lisbon", country: "PT", supported: true }}
        initialSection="profile"
      />
    )
  return <ProfileActivity userId="u1" initial={ACTIVITY} initialNext={null} now={NOW} emptyText="Nothing here yet." />
}

function NavApp() {
  const [path, setPath] = React.useState(w.__path || location.pathname || "/account")
  React.useEffect(() => {
    w.__navigate = (href: string) => {
      const to = href.split("?")[0]
      const go = () => {
        history.pushState({}, "", href)
        React.startTransition(() => setPath(to))
        /* The router keeps a page it has shown (next.config.mjs staleTimes): the next press of it commits at once. */
        ;(w.__prefetched ||= new Set()).add(to)
      }
      /* A page the router holds commits with the press; any other waits for the server. */
      if (w.__prefetched?.has(to)) go()
      else window.setTimeout(go, w.__serverMs ?? 350)
    }
    const onPop = () => React.startTransition(() => setPath(location.pathname))
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])
  React.useLayoutEffect(() => {
    ;(w.__commits ||= []).push({ path, at: performance.now() })
  }, [path])
  const PathContext = w.__PathContext
  return (
    <PathContext.Provider value={path}>
      <div className="flex min-h-svh flex-col bg-[#fafafa]" data-page="account">
        <div className="sticky top-0 z-40 h-14 border-b border-[#eceef1] bg-white" data-fake-header="" />
        <main className="flex-1 overflow-x-clip">
          <AccountNavFade>
            <AccountHub identity={{ userId: "u1", name: "Alex Morgan", username: "alexmorgan", avatarUrl: null, bio: "Buying presets and brushes for retouching work. Mostly film looks.", coverUrl: COVER, followers: 12, following: 30, creator: false }} communities>
              <div data-probe-path={path}>
                <Panel path={path} />
              </div>
            </AccountHub>
          </AccountNavFade>
        </main>
        <footer className="h-64 bg-[#0b0b10]" data-fake-footer="" />
      </div>
    </PathContext.Provider>
  )
}

/* A post of yours, opened by its address over its community's feed: what the account's rows and Edit post open. */
const ME = { id: "u1", name: "Alex Morgan", username: "alexmorgan", avatarUrl: null, role: "member" as const, level: 3, hasStorefront: false }
const VIEWER: ViewerView = { userId: "u1", signedIn: true, role: "member", status: "active", active: true, tierId: null, level: 3, points: 84, isOwner: false, isCreatorAccount: false, mutedUntil: null, can: allowedActions("member") }
const MY_POST: FeedPostView = {
  id: "a0000000-0000-4000-8000-000000000001",
  communityId: "c1",
  space: { id: "s-show", slug: "show-and-tell", name: "Show and tell" },
  kind: "post",
  title: "First firing of the new glaze",
  body: "<p>Came out greener than the test tile. Anyone else seeing that with the celadon?</p>",
  bodyText: "Came out greener than the test tile. Anyone else seeing that with the celadon?",
  media: [],
  pinned: false,
  featured: false,
  locked: false,
  status: "published",
  author: ME,
  reactionCount: 4,
  commentCount: 0,
  reacted: false,
  bookmarked: false,
  poll: null,
  createdAt: ago(3),
  editedAt: null,
  lastActivityAt: ago(3),
  canEdit: true,
  canModerate: false,
} as FeedPostView

function PostRoute() {
  return (
    <LocaleProvider>
      <SharedPost slug="clay-studio" post={MY_POST} viewer={VIEWER} readOnly={false}>
        <div data-probe-feed="" className="min-h-svh bg-[#f8f9fa] p-6 text-[14px] text-[#6b7280]">
          The community's feed
        </div>
      </SharedPost>
    </LocaleProvider>
  )
}

createRoot(document.getElementById("app")!).render(location.pathname.startsWith("/community/") ? <PostRoute /> : <NavApp />)
