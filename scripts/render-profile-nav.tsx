/**
 * Opening a profile from a feed and going back, for scripts/check-profile-nav.mjs.
 * The real pieces, in the order the app shows them on a client move:
 *
 *   the feed      a list with a person's name to press (stands for the
 *                 community feed the profile is opened from)
 *   the skeleton  app/(storelib)/(marketing)/member/[username]/loading.tsx, for as long
 *                 as ?wait=<ms> says the server takes
 *   the profile   MemberProfilePage (round 12: the creator page template, no shell), reached from the
 *                 feed (backShown), its cover and photo from a host the probe
 *                 answers slowly (https://img.test), so they arrive after the
 *                 page as they do on a phone
 *
 * The press pushes a history entry, as the router does; the chevron's back
 * pops it, and the popstate puts the feed back where it was scrolled.
 */
import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import MemberProfileSkeleton from "@/app/(storelib)/(marketing)/member/[username]/loading"
import { MemberProfilePage } from "@/components/profile/member-profile-page"
import type { MemberProfileData } from "@/lib/profile/member-profile-data"

const q = new URLSearchParams(location.search)
const WAIT = Number(q.get("wait") || 600)

const sam: MemberProfileData = { socials: [],
  userId: "00000000-0000-4000-8000-0000000000b2",
  name: "Sam Rivera",
  username: "sam-rivera",
  avatarUrl: "https://img.test/face.svg",
  coverUrl: "https://img.test/cover.svg",
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

window.fetch = (async () => new Response(JSON.stringify({ items: [], next: null, hidden: false }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch

function Feed({ onOpen }: { onOpen: () => void }) {
  return (
    <main className="min-h-screen bg-[#f8f9fa] px-4 py-6" data-probe-feed="">
      <ul className="mx-auto max-w-[640px] space-y-3">
        {Array.from({ length: 24 }, (_, i) => (
          <li key={i} className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
            <button type="button" data-probe-open={i} onClick={onOpen} className="text-[15px] font-semibold text-[#1a1a2e]">
              Sam Rivera
            </button>
            <p className="mt-1 text-[14px] text-[#6b7280]">Post {i + 1}: Thinned it with a little more water and applied two coats instead of three.</p>
          </li>
        ))}
      </ul>
    </main>
  )
}

function App() {
  const [at, setAt] = useState<"feed" | "loading" | "profile">("feed")
  useEffect(() => {
    const pop = () => {
      setAt("feed")
      ;(window as unknown as { __pops: number }).__pops = ((window as unknown as { __pops: number }).__pops || 0) + 1
    }
    window.addEventListener("popstate", pop)
    return () => window.removeEventListener("popstate", pop)
  }, [])
  useEffect(() => {
    if (at === "feed") {
      const y = Number(sessionStorage.getItem("feedY") || 0)
      window.scrollTo(0, y)
    }
  }, [at])
  const open = () => {
    sessionStorage.setItem("feedY", String(window.scrollY))
    history.pushState({ profile: true }, "", "?profile")
    window.scrollTo(0, 0)
    setAt("loading")
    window.setTimeout(() => setAt("profile"), WAIT)
  }
  if (at === "feed") return <Feed onOpen={open} />
  if (at === "loading") return <MemberProfileSkeleton />
  return (
    <main className="explore-ground min-h-screen bg-[#f8f9fa]">
      <>
        <MemberProfilePage
          profile={sam}
          viewerId="00000000-0000-4000-8000-0000000000a1"
          viewerFollowing={false}
          extras={{ activity: { items: [], next: null, hidden: false }, communities: { enabled: true, owned: [], member: [] }, backShown: true, now: Date.parse("2026-10-03T12:00:00Z") }}
        />
      </>
    </main>
  )
}

createRoot(document.getElementById("app")!).render(<App />)
