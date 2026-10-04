/**
 * The real Storelib header (light, as storelib.com has it) for
 * scripts/check-header-round8.mjs: its navigator, its search field and
 * results, its bell and its Dashboard button, over a page of placeholder
 * cards. The probe stubs Supabase (products for the search), the router and
 * the consent cookie; this answers the routes the header asks for and reads
 * which page and visitor from the hash:
 *
 *   #path=/explore&who=seller            Explore: no wishlist heart, Dashboard for a seller
 *   #path=/help&who=seller               a page where the header carries its own search field
 *   #path=/explore&who=buyer&rows=20     the bell with twenty rows, so the sheet has to scroll
 *   #...&rows=4                          the bell with four rows (image 55)
 *   #...&communities=off                 the communities switch off: the search asks for none
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LocaleProvider } from "@/components/locale-provider"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { PlatformHeaderClient } from "@/components/platform/platform-header-client"

const params = new URLSearchParams(location.hash.slice(1))
const w = window as any
w.__nav = { path: params.get("path") || "/explore", subs: new Set<() => void>() }
w.__who = params.get("who") || "buyer"
const rows = Number(params.get("rows") || "4")
const communitiesOn = params.get("communities") !== "off"
try {
  localStorage.clear()
  sessionStorage.clear()
  if (params.get("recent")) localStorage.setItem("storelib_recent_searches", JSON.stringify(params.get("recent")!.split(",")))
} catch {
  /* no storage */
}

const face = (a: string, letter: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="${a}"/><text x="48" y="62" font-family="Arial" font-size="40" font-weight="700" fill="#fff" text-anchor="middle">${letter}</text></svg>`)}`
const now = Date.now()
const names = ["Calvin", "Drew", "Ava Stone", "Leo Park", "Mara Lind", "Sam Reed"]
const inbox = {
  items: Array.from({ length: rows }, (_, i) => ({
    id: `n${i}`,
    kind: "new_follower",
    title: `${names[i % names.length]} followed you`,
    body: i % 3 === 1 ? "Second lesson is the one that made it click." : null,
    url: "/@x",
    read: i > 0,
    createdAt: new Date(now - (i + 1) * 3600_000).toISOString(),
    actor: { name: names[i % names.length], avatarUrl: face(["#5b7c99", "#c08457", "#8a9a5b", "#4b5563"][i % 4], names[i % names.length][0]) },
    community: null,
    image: null,
  })),
  unread: 1,
  nextCursor: null,
  available: true,
}
const communities = [
  { id: "c1", name: "Editors Guild", url: "/community/editors-guild", logoUrl: face("#1a1a2e", "E"), coverUrl: null, memberCount: 1240, priceLine: "Free" },
  { id: "c2", name: "Film School Collective", url: "/community/film-school", logoUrl: null, coverUrl: null, memberCount: 87, priceLine: "$9/month" },
]
const realFetch = window.fetch.bind(window)
w.__fetches = []
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  w.__fetches.push(url)
  const json = (body: unknown, delay = 0) => new Promise<Response>((r) => setTimeout(() => r(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })), delay))
  if (url.startsWith("/api/platform/flags")) return json({ communities: communitiesOn, exploreMarketplace: true })
  if (url.startsWith("/api/me/places")) return json({ signedIn: w.__who !== "guest", communitiesOn: true, isCreator: w.__who === "seller", hasSellerAccess: w.__who === "seller", recent: [{ kind: "community", id: "c-mara", slug: "mara-club", title: "Mara Club", imageUrl: null }] }, 40)
  if (url.startsWith("/api/notifications/inbox")) return url.includes("summary=1") ? json({ unread: 1 }) : json(inbox, 250)
  if (url.startsWith("/api/notifications/read")) return json({ unread: 0 })
  if (url.startsWith("/api/wishlist")) return json({ count: 3 })
  if (url.startsWith("/api/explore/communities")) {
    const q = new URL(url, "https://storelib.com").searchParams.get("q")?.toLowerCase() || ""
    return json({ items: communities.filter((c) => c.name.toLowerCase().includes(q)), next: null }, 120)
  }
  return realFetch(input as RequestInfo, init)
}) as typeof fetch

createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <PlatformSettingsProvider exploreMarketplace buyerHeaderLight>
      <PlatformHeaderClient buyerHeaderLight />
      <main className="min-h-[1600px] bg-[#f8f9fa] p-8 text-[15px] text-neutral-500" data-page="">
        <div className="mx-auto grid max-w-[1100px] grid-cols-2 gap-4 sm:grid-cols-3">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="rounded-2xl border border-[#e5e7eb]/60 bg-white p-3">
              <div className="aspect-[4/3] rounded-xl" style={{ background: ["#d9c7b1", "#b7c4cf", "#c9d3b4"][i % 3] }} />
              <div className="mt-3 h-3 w-3/4 rounded bg-[#e5e7eb]" />
            </div>
          ))}
        </div>
      </main>
    </PlatformSettingsProvider>
  </LocaleProvider>,
)
