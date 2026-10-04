/**
 * The real platform header (light, as storelib.com has it) with the real
 * navigator, account menu, search field and bell, for
 * scripts/check-place-navigator.mjs. The probe stubs Supabase and the
 * router; this stubs the four routes the header asks (/api/me/places, the
 * bell's inbox and read, the wishlist) and reads which page and visitor
 * from the hash:
 *
 *   #path=/explore&who=buyer       signed in, no seller access, in three communities, two things recently opened
 *   #path=/explore&who=seller      a seller, in the same communities, nothing bought (no Recently opened)
 *   #path=/help&who=seller         a seller, on a page where the header's own search field shows
 *   #path=/help&who=guest          nobody signed in
 *   #mode=community&who=buyer      a community's own bar with the same navigator right of its name, "Mara Club" current
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LocaleProvider } from "@/components/locale-provider"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { PlatformHeaderClient } from "@/components/platform/platform-header-client"
import { PlaceNavigator } from "@/components/nav/place-navigator"
import { NotificationBell } from "@/components/notifications/notification-bell"

const params = new URLSearchParams(location.hash.slice(1))
const w = window as any
w.__nav = { path: params.get("path") || "/explore", subs: new Set<() => void>() }
w.__who = params.get("who") || "buyer"
const mode = params.get("mode") || "header"
try {
  localStorage.clear()
  sessionStorage.clear()
} catch {
  /* no storage */
}

const PIC = "https://abc.supabase.co/storage/v1/object/public/avatars/p.jpg"
const COVER = "https://abc.supabase.co/storage/v1/object/public/products/cover.jpg"
const places = () => {
  const who = w.__who
  if (who === "guest") return { signedIn: false, communitiesOn: true, isCreator: false, hasSellerAccess: false, communities: [], products: [] }
  return {
    signedIn: true,
    communitiesOn: true,
    isCreator: who === "seller",
    hasSellerAccess: who === "seller",
    communities: [
      { id: "c-mara", slug: "mara-club", name: "Mara Club", logoUrl: null },
      { id: "c-film", slug: "film-school", name: "Film School Collective", logoUrl: PIC },
      { id: "c-run", slug: "morning-runners", name: "Morning Runners", logoUrl: null },
    ],
    /* Recently opened: a course and a download for the buyer; a seller who bought nothing has none, and the section is not drawn. */
    products: who === "seller"
      ? []
      : [
          { id: "k-grade", kind: "course", title: "Color Grading for Film: the complete course", coverUrl: COVER },
          { id: "p-amb", kind: "product", title: "Ambience Kit Vol. 1", coverUrl: null },
        ],
  }
}
const now = Date.now()
const inbox = {
  items: [
    { id: "n1", kind: "reply", title: "Ava Stone replied to your comment", body: "Totally agree, the second lesson is the one that made it click for me.", url: "/community/mara-club/post/1", read: false, createdAt: new Date(now - 5 * 60_000).toISOString(), actor: { name: "Ava Stone", avatarUrl: PIC }, community: { name: "Mara Club" }, image: null },
    { id: "n2", kind: "followed_new_product", title: "Leo Park published Color Grading Pack", body: null, url: "/leo/color-grading-pack", read: false, createdAt: new Date(now - 2 * 3600_000).toISOString(), actor: null, community: null, image: COVER },
    { id: "n3", kind: "new_follower", title: "Sam Reed started following you", body: null, url: "/@sam", read: true, createdAt: new Date(now - 26 * 3600_000).toISOString(), actor: { name: "Sam Reed", avatarUrl: null }, community: null, image: null },
  ],
  unread: 2,
  nextCursor: null,
  available: true,
}
const realFetch = window.fetch.bind(window)
w.__fetches = []
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  w.__fetches.push(url)
  const json = (body: unknown, delay = 0) => new Promise<Response>((r) => setTimeout(() => r(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })), delay))
  if (url.startsWith("/api/me/places")) return json(places(), 60)
  if (url.startsWith("/api/notifications/inbox")) return url.includes("summary=1") ? json({ unread: 2 }) : json(inbox, 250)
  if (url.startsWith("/api/notifications/read")) return json({ unread: 0 })
  if (url.startsWith("/api/wishlist")) return json({ count: 3 })
  return realFetch(input as RequestInfo, init)
}) as typeof fetch

function CommunityBar() {
  /* A stand in for components/community/member/top-bar.tsx: the navigator right of the community's mark and name, as round 4 places it. */
  return (
    <header className="sticky top-0 z-40 border-b border-[#eceef1] bg-white shadow-[0_1px_2px_rgba(16,18,27,0.04)]">
      <div className="mx-auto flex h-14 w-full max-w-[1080px] items-center gap-2.5 px-4 sm:px-6 lg:px-8">
        <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-[#1a1a2e] text-[15px] font-semibold text-white" data-community-mark-stand-in="">M</span>
        <span className="leading-tight" data-community-identity="">
          <span className="block text-[15px] font-semibold text-[#1a1a2e]">Mara Club</span>
          <span className="block text-[12.5px] text-[#6b7280]">By Mara Lind</span>
        </span>
        <PlaceNavigator current={{ kind: "community", id: "c-mara" }} className="-ml-1 rounded-[10px] bg-transparent hover:bg-transparent" />
        <span className="ml-auto">
          <NotificationBell className="text-[#6b7280] hover:text-[#1a1a2e]" />
        </span>
      </div>
    </header>
  )
}

createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <PlatformSettingsProvider exploreMarketplace buyerHeaderLight>
      {mode === "community" ? <CommunityBar /> : <PlatformHeaderClient buyerHeaderLight />}
      <main className="min-h-[1600px] bg-[#f8f9fa] p-8 text-[15px] text-neutral-500" data-page="">
        <div className="mx-auto max-w-[900px] space-y-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-40 rounded-2xl border border-[#e5e7eb]/60 bg-white" />
          ))}
        </div>
      </main>
    </PlatformSettingsProvider>
  </LocaleProvider>,
)
