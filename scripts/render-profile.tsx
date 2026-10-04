/**
 * Profiles and follows with fixture data, for scripts/check-profile.mjs.
 * The real components:
 *
 *   ?other          somebody else's profile (a buyer): Follow, Message, the
 *                   way back in a top bar beside their photo (reached from
 *                   a community), "In Clay Studio" with their posts there
 *                   six at a time, Activity and Communities tabs
 *   ?self           your own profile: the owner's pills, no Follow, your
 *                   activity hidden from others with the "only you" line
 *   ?creator        a creator's page on the Sage scheme: the newsletter bar
 *                   with the way back before the photo, and Follow in the
 *                   scheme's own green
 *   ?creator-dark   the same on a dark scheme (Astrid), drawn in its colours
 *   ?creator-nobar  a creator page with no newsletter bar: the slim top bar
 *
 * fetch is answered here (the follow, the list, the next activity page),
 * so the probe needs no server and no network.
 */
import { createRoot } from "react-dom/client"
import { MemberProfilePage } from "@/components/profile/member-profile-page"
import { ProfileSocial } from "@/components/profile/profile-social"
import { TopBarBack, ProfileTopBar } from "@/components/profile/profile-top-bar"
import { SubscribeBar } from "@/components/store-builder/subscribe-bar"
import { resolveStorefrontChrome } from "@/lib/store-builder/storefront-chrome"
import type { SharedPostsPage, SharedPostView } from "@/lib/profile/shared-view"
import { StorefrontTabs } from "@/components/storefront/storefront-tabs"
import { UnifiedShopHeader } from "@/components/store-builder/unified-section-renderer"
import { defaultShopHeaderSettings, defaultGlobalStoreSettings } from "@/lib/store-builder/defaults"
import type { MemberProfileData } from "@/lib/profile/member-profile-data"
import type { CommunityCard } from "@/lib/communities/types"
import type { ActivityItemView } from "@/components/profile/profile-activity"

function svg(w: number, h: number, body: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`)}`
}
const FACE = svg(128, 128, `<rect width="128" height="128" fill="#c9b8a6"/><circle cx="64" cy="52" r="24" fill="#f3ebe2"/><rect x="28" y="86" width="72" height="44" rx="22" fill="#f3ebe2"/>`)
const FACE2 = svg(128, 128, `<rect width="128" height="128" fill="#9fb3a8"/><circle cx="64" cy="52" r="24" fill="#eef2ee"/><rect x="28" y="86" width="72" height="44" rx="22" fill="#eef2ee"/>`)
const LOGO = svg(128, 128, `<rect width="128" height="128" rx="28" fill="#1a1a2e"/><path d="M38 86 L64 40 L90 86 Z" fill="#f4efe6"/>`)
const LOGO2 = svg(128, 128, `<rect width="128" height="128" rx="28" fill="#d9cbb6"/><circle cx="64" cy="64" r="28" fill="#8f7a5f"/>`)
const COVER = svg(1600, 600, `<rect width="1600" height="600" fill="#cfdbd5"/><path d="M0 420 C 400 300, 800 520, 1600 360 L1600 600 L0 600 Z" fill="#6f8f7f"/><circle cx="1260" cy="160" r="80" fill="#f2efe6"/>`)
const PRODUCT = svg(400, 400, `<rect width="400" height="400" fill="#e7e2d8"/><rect x="80" y="80" width="240" height="240" rx="24" fill="#2f3a44"/>`)

const now = Date.parse("2026-10-03T12:00:00Z")
const ago = (h: number) => new Date(now - h * 3600_000).toISOString()

const activity: ActivityItemView[] = [
  { key: "ca:000000000000012", at: ago(3), kind: "posted", title: "My first raku firing, what went wrong?", context: "General · Clay Studio", excerpt: null, rating: null, href: "/community/clay-studio/post/p1", imageUrl: LOGO },
  { key: "rv:r1", at: ago(30), kind: "reviewed", title: "Glaze chemistry handbook", context: null, excerpt: "Clear, practical and the recipes work. The section on cone 6 alone was worth it.", rating: 5, href: "/p/glaze", imageUrl: PRODUCT },
  { key: "ca:000000000000010", at: ago(72), kind: "completed_course", title: "Wheel throwing basics", context: "Clay Studio", excerpt: null, rating: null, href: "/community/clay-studio/classroom", imageUrl: null },
  { key: "ca:000000000000009", at: ago(120), kind: "posted_in", title: "Lounge", context: "Night Runners", excerpt: null, rating: null, href: "/community/night-runners/post/p9", imageUrl: LOGO2 },
  { key: "ca:000000000000004", at: ago(400), kind: "joined", title: "Clay Studio", context: null, excerpt: null, rating: null, href: "/community/clay-studio", imageUrl: LOGO },
]
const moreActivity: ActivityItemView[] = [
  { key: "ca:000000000000002", at: ago(900), kind: "joined", title: "Night Runners", context: null, excerpt: null, rating: null, href: "/community/night-runners", imageUrl: LOGO2 },
]

const card = (id: string, name: string, tagline: string, logo: string | null, cover: string | null, members: number, price: string | null): CommunityCard => ({
  id,
  slug: id,
  name,
  tagline,
  logoUrl: logo,
  coverUrl: cover,
  category: null,
  access: price ? "paid" : "free",
  visibility: "public",
  memberCount: members,
  priceLine: price ?? "Free",
  creator: { id: "cr", name: "Maya Ortiz", username: "maya", avatarUrl: null },
  url: `/community/${id}`,
})
const communities = [card("clay-studio", "Clay Studio", "A working studio for people learning wheel throwing at home.", LOGO, COVER, 1240, "$19/month"), card("night-runners", "Night Runners", "Easy miles after dark, every Tuesday.", LOGO2, null, 86, null)]

const base: MemberProfileData = {
  userId: "00000000-0000-4000-8000-0000000000b2",
  name: "Sam Rivera",
  username: "sam-rivera",
  avatarUrl: FACE,
  coverUrl: null,
  bio: "Learning to throw pots and run longer. Mostly here for the glaze talk.",
  memberSince: "March 2025",
  joinedAt: "2025-03-14T10:00:00Z",
  hasStorefront: false,
  storefrontHandle: "sam-rivera",
  creatorId: null,
  followers: 128,
  following: 41,
  products: [],
  productCount: 0,
  reviews: [],
  privacy: { showActivity: true, showCommunities: true, supported: true },
}

const people = Array.from({ length: 30 }, (_, i) => ({
  id: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`,
  name: ["Ana Lucia Perez", "Jo Smith", "Kwame Mensah", "Lena Fischer", "Ravi Shah"][i % 5],
  username: `person-${i}`,
  avatarUrl: i % 3 === 0 ? FACE2 : null,
  href: `/@person-${i}`,
  followedByViewer: i % 4 === 0,
  isViewer: false,
}))

const post = (i: number): SharedPostView => ({
  id: `00000000-0000-4000-8000-0000000002${String(i).padStart(2, "0")}`,
  title: ["Cone 6 glaze that finally stopped crawling", "Is a banding wheel worth it?", "Trimming feet without chatter", "Studio photos from Saturday", "Best clay for a first wheel?", "Bisque at 04 or 06?", "Throwing off the hump, notes", "A shelf of mugs, finally", "Reclaiming slop the lazy way"][i % 9],
  excerpt: i % 3 === 1 ? null : "Thinned it with a little more water and applied two coats instead of three. The difference was obvious after the first firing.",
  space: ["General", "Glazes", "Show and tell"][i % 3],
  at: ago(6 + i * 20),
  reactions: (i * 7) % 23,
  comments: (i * 3) % 9,
  href: `/community/clay-studio/post/p${i}`,
  imageUrl: i % 4 === 0 ? PRODUCT : null,
})
const sharedFirst: SharedPostsPage = { posts: Array.from({ length: 6 }, (_, i) => post(i)), next: "c2" }
const sharedSecond: SharedPostsPage = { posts: Array.from({ length: 3 }, (_, i) => post(i + 6)), next: null }

/* The server, answered in the page. */
const realFetch = window.fetch.bind(window)
let followers = 128
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  ;(window as unknown as { __fetches: string[] }).__fetches ||= []
  ;(window as unknown as { __fetches: string[] }).__fetches.push(url)
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
  if (url.startsWith("/api/follow/list")) {
    const cursor = new URL(url, "https://x").searchParams.get("cursor")
    return json(cursor ? { people: people.slice(20), next: null } : { people: people.slice(0, 20), next: "c2" })
  }
  if (url.startsWith("/api/follow")) {
    const body = JSON.parse(String(init?.body || "{}"))
    followers += body.follow === false ? -1 : 1
    return json({ following: body.follow !== false, followers })
  }
  if (url.startsWith("/api/profile/activity")) return json({ items: moreActivity, next: null, hidden: false })
  if (url.startsWith("/api/profile/shared-posts")) return new Promise<Response>((r) => setTimeout(() => r(json(sharedSecond)), 120))
  return realFetch(input, init)
}) as typeof fetch

function Header() {
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 30, height: 64, background: "#fff", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", padding: "0 24px", fontWeight: 600, color: "#1a1a2e" }} data-fake-header="">
      Storelib
    </div>
  )
}

/* A profile has no Storelib header over it (it is somebody's page), so the frame is only the page's ground. */
function ProfileFrame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#f8f9fa", minHeight: "100vh" }}>
      <main className="explore-ground min-h-screen bg-[#f8f9fa]">{children}</main>
    </div>
  )
}

const which = location.search.slice(1) || "other"
let app: React.ReactNode = null

if (which === "other") {
  app = (
    <ProfileFrame>
      <MemberProfilePage
        profile={base}
        viewerId="00000000-0000-4000-8000-0000000000a1"
        viewerFollowing={false}
        extras={{
          messageHref: "/community/clay-studio?dm=00000000-0000-4000-8000-0000000000b2",
          activity: { items: activity, next: "n1", hidden: false },
          communities: { enabled: true, owned: [], member: communities },
          shared: [{ community: { id: "00000000-0000-4000-8000-00000000c1a5", slug: "clay-studio", name: "Clay Studio", logoUrl: LOGO }, page: sharedFirst }],
          backShown: true,
          now,
        }}
      />
    </ProfileFrame>
  )
} else if (which === "self") {
  app = (
    <ProfileFrame>
      <MemberProfilePage
        profile={{ ...base, privacy: { showActivity: false, showCommunities: true, supported: true } }}
        viewerId={base.userId}
        viewerFollowing={false}
        extras={{ messageHref: null, activity: { items: activity.slice(0, 3), next: null, hidden: true }, communities: { enabled: true, owned: [], member: communities }, backShown: false, now }}
      />
    </ProfileFrame>
  )
} else if (which === "creator" || which === "creator-dark" || which === "creator-nobar") {
  const dark = which === "creator-dark"
  const chrome = resolveStorefrontChrome(dark ? "astrid" : "sage")
  const surface = { textColor: chrome.text, mutedColor: chrome.muted, avatarBorderColor: chrome.avatarBorder }
  const settings = { ...defaultShopHeaderSettings, showBio: true, bio: "Ceramics, glaze recipes and a weekly studio community.", showStats: true, coverImageUrl: COVER } as never
  app = (
    <div data-storefront-root="" style={{ background: chrome.pageBackground, minHeight: "100vh", color: chrome.text, ...(chrome.tokens as React.CSSProperties) }}>
      {which === "creator-nobar" ? (
        <ProfileTopBar initiallyShown name="Maya Ortiz" avatarUrl={FACE2} colors={{ background: chrome.bar.backgroundColor, text: chrome.bar.textColor }} />
      ) : (
        <SubscribeBar
          settings={{ visible: true, text: "Join Maya's newsletter!", showAvatar: true, avatarUrl: FACE2, creatorName: "Maya Ortiz", backgroundColor: chrome.bar.backgroundColor, textColor: chrome.bar.textColor, buttonColor: chrome.bar.buttonColor, buttonTextColor: chrome.bar.buttonTextColor } as never}
          creatorId="cr"
          leading={<TopBarBack initiallyShown />}
        />
      )}
      <UnifiedShopHeader
        settings={settings}
        creator={{ cover_url: COVER, bio: null, show_total_sales_badge: false } as never}
        profile={{ display_name: "Maya Ortiz", avatar_url: FACE2, username: "maya", created_at: "2024-01-01" } as never}
        products={[]}
        globalSettings={defaultGlobalStoreSettings as never}
        reviewCount={42}
        reviewAverage={4.8}
        followerCount={1280}
        surface={surface}
        followRow={
          <ProfileSocial tone="storefront" scheme={chrome.action} userId="00000000-0000-4000-8000-0000000000c3" name="Maya Ortiz" followers={1280} following={64} viewerFollowing={false} signedIn isSelf={false} messageHref="/community/clay-studio?dm=00000000-0000-4000-8000-0000000000c3" />
        }
      />
      <StorefrontTabs
        surface={{ textColor: chrome.text, mutedColor: chrome.muted, borderColor: chrome.border }}
        tabs={[
          { id: "home", label: "Home", panel: <div style={{ height: 400 }} /> },
          { id: "activity", label: "Activity", panel: <div /> },
          { id: "about", label: "About", panel: <div /> },
        ]}
      />
    </div>
  )
}

createRoot(document.getElementById("app")!).render(app)
