/**
 * The real platform header (light, as storelib.com has it) with the real
 * navigator, account menu, search field and bell, for
 * scripts/check-place-navigator.mjs. The probe stubs Supabase and the
 * router; this stubs the four routes the header asks (/api/me/places, the
 * bell's inbox and read, the wishlist) and reads which page and visitor
 * from the hash:
 *
 *   #path=/explore&who=buyer       signed in, no seller access: a course, a download and three communities in one recent list
 *   #path=/explore&who=seller      a seller, in the same communities, nothing bought (communities alone)
 *   #path=/help&who=seller         a seller, on a page where the header's own search field shows
 *   #path=/help&who=guest          nobody signed in
 *   #mode=community&who=buyer      a community's own bar with the same navigator right of its name, "Mara Club" current
 *   #mode=app-account&who=buyer    /app's own phone account sheet (components/app/mobile-account-menu.tsx), the look the header's account sheet takes after
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LocaleProvider } from "@/components/locale-provider"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { PlatformHeaderClient } from "@/components/platform/platform-header-client"
import { PlaceNavigator } from "@/components/nav/place-navigator"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { MobileAccountMenu } from "@/components/app/mobile-account-menu"

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
  if (who === "guest") return { signedIn: false, communitiesOn: true, isCreator: false, hasSellerAccess: false, recent: [] }
  const clubs = {
    mara: { kind: "community", id: "c-mara", slug: "mara-club", title: "Mara Club", imageUrl: null },
    film: { kind: "community", id: "c-film", slug: "film-school", title: "Film School Collective", imageUrl: PIC },
    run: { kind: "community", id: "c-run", slug: "morning-runners", title: "Morning Runners", imageUrl: null },
  }
  return {
    signedIn: true,
    communitiesOn: true,
    isCreator: who === "seller",
    hasSellerAccess: who === "seller",
    /* One recent list, the last touched first: for the buyer a course opened today, a community visited yesterday, a download, then the rest; a seller who bought nothing has communities only. */
    recent: who === "seller"
      ? [clubs.mara, clubs.film, clubs.run]
      : [
          { kind: "course", id: "k-grade", slug: "", title: "Color Grading for Film: the complete course", imageUrl: COVER },
          clubs.mara,
          { kind: "product", id: "p-amb", slug: "", title: "Ambience Kit Vol. 1", imageUrl: null },
          clubs.film,
          clubs.run,
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

function AppAccountBar() {
  /* /app's phone bar with its own account sheet, one business: the reference the Storelib header's account sheet is compared with. */
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center bg-[#0b0b0f] px-3">
      <MobileAccountMenu
        businesses={[{ userId: "u1", name: "Ava Stone", handle: "ava", avatarUrl: null, ready: true, current: true, role: "owner" }]}
        avatarSrc={undefined}
        userDisplayName="Ava Stone"
        settingsLabel="Settings"
        billingLabel="Billing"
        languageLabel="Language"
        onOpening={() => {}}
        onLanguage={() => {}}
        onSignOut={() => {}}
      />
    </header>
  )
}

createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <PlatformSettingsProvider exploreMarketplace buyerHeaderLight>
      {mode === "community" ? <CommunityBar /> : mode === "app-account" ? <AppAccountBar /> : <PlatformHeaderClient buyerHeaderLight />}
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
