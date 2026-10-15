/**
 * ROUND 29, FOR scripts/check-mobile-round29.mjs (images): the real picture components of the surfaces the round is
 * about, each given an address on this site so the probe can answer it slowly, the way a phone's network does:
 *
 *   library   a library row's thumbnail (components/ui/soft-img.tsx, as components/library/product-row.tsx draws it)
 *   explore   a community card on Explore (components/explore/community-card.tsx), its cover through the image route
 *   post      a picture in a community post (components/community/member/media.tsx SoftImg)
 *
 * window.__remount() draws all of them again, as a page left and come back to in the same tab does: what the eye
 * should see then is every picture there on its first frame, with no fade.
 */
import React, { useState } from "react"
import { createRoot } from "react-dom/client"
import { SoftImg } from "@/components/ui/soft-img"
import { SoftImg as PostImg } from "@/components/community/member/media"
import { ExploreCommunityCard } from "@/components/explore/community-card"
import type { CommunityCard } from "@/lib/communities/types"
import { optimizedImageUrl, optimizedSrcSet } from "@/lib/images/optimized-url"

const card: CommunityCard = {
  id: "c1",
  slug: "clay-studio",
  name: "Clay Studio",
  tagline: "Wheel throwing, glazing and firing at home.",
  logoUrl: null,
  coverUrl: "/probe-img/cover-1.jpg",
  category: "Art",
  access: "free",
  visibility: "public",
  memberCount: 8012,
  priceLine: "Free",
  creator: { id: "u1", name: "Mara Lindqvist", username: "mara", avatarUrl: null },
  url: "/community/clay-studio",
} as CommunityCard

function Screens() {
  return (
    <div className="mx-auto max-w-[420px] space-y-5 bg-[#f8f9fa] p-4">
      <ul className="divide-y divide-[#eef0f3] rounded-2xl border border-[#e5e7eb]/60 bg-white">
        {[1, 2, 3].map((i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-4">
            <div data-probe-img={`library-${i}`} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#f1f3f5]">
              <SoftImg src={`/probe-img/thumb-${i}.jpg`} width={72} sizes="64px" eager={i === 1} className="absolute inset-0 h-full w-full object-cover" />
            </div>
            <span className="text-[14px] text-[#1a1a2e]">Product {i}</span>
          </li>
        ))}
      </ul>
      <div data-probe-img="explore">
        <ExploreCommunityCard card={card} priority />
      </div>
      <div data-probe-img="post" className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-[#f8f9fa]">
        {/* As the post's tile hands it over (media.tsx MediaTile): the route's files at the post's widths. */}
        <PostImg src={optimizedImageUrl("/probe-img/post-1.jpg", 390)} srcSet={optimizedSrcSet("/probe-img/post-1.jpg", [640, 828, 1080])} sizes="(max-width: 639px) 100vw, 600px" width={1600} height={900} eager fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
      </div>
    </div>
  )
}

function App() {
  const [n, setN] = useState(0)
  ;(window as unknown as { __remount: () => void }).__remount = () => setN((x) => x + 1)
  return <Screens key={n} />
}

createRoot(document.getElementById("app")!).render(<App />)
