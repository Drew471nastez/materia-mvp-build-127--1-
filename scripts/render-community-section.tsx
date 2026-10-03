/**
 * The creator page's Community section and the website's Community card,
 * with fixture data, for scripts/check-community-section.mjs. The real
 * renderer (components/store-builder/section-renderer.tsx, the one the live
 * creator page uses) is handed the data the page's server read would give it.
 *
 *   ?mode=full       every part on, a light page
 *   ?mode=dark       the same on a dark creator scheme
 *   ?mode=minimal    no cover, no logo, stats and the button only
 *   ?mode=phone      the builder's phone preview (isMobile)
 *   ?mode=off        no data: what a visitor sees while communities are off
 *   ?mode=builder    the builder canvas with the switch off (its note)
 *   ?mode=sample     the add modal's drawing
 * The website's community_card is drawn by the engine in node
 * (scripts/render-community-card.ts), which needs node:crypto.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"

import { SectionRenderer } from "@/components/store-builder/section-renderer"
import { UnifiedSectionRenderer } from "@/components/store-builder/unified-section-renderer"
import { CommunitySectionSample } from "@/components/store-builder/community-section"
import type { CommunityBlockData } from "@/lib/communities/blocks"
import { defaultCommunitySettings } from "@/lib/store-builder/defaults"
import type { CommunitySettings, Section } from "@/lib/store-builder/types"

const mode = new URLSearchParams(location.search).get("mode") ?? "full"
const ID = "11111111-1111-4111-8111-111111111111"
const NOW = Date.now()
const hours = (h: number) => new Date(NOW - h * 3_600_000).toISOString()
const ahead = (d: number, h = 18) => {
  const t = new Date(NOW + d * 86_400_000)
  t.setUTCHours(h, 0, 0, 0)
  return t.toISOString()
}
const face = (n: number) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="hsl(${(n * 47) % 360} 35% 62%)"/><circle cx="32" cy="26" r="12" fill="rgba(255,255,255,.8)"/><rect x="14" y="42" width="36" height="22" rx="11" fill="rgba(255,255,255,.8)"/></svg>`)}`
const cover = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="300"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#cfd8cf"/><stop offset="1" stop-color="#9fb3a6"/></linearGradient></defs><rect width="1200" height="300" fill="url(#g)"/><path d="M0 220 Q 300 150 600 210 T 1200 190 V300 H0Z" fill="#7d9686"/></svg>`)}`
const logo = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="112" height="112"><rect width="112" height="112" fill="#1f3b2d"/><circle cx="56" cy="56" r="26" fill="#f2c14e"/></svg>`)}`

const full: CommunityBlockData = {
  id: ID,
  slug: "morning-runners",
  name: "Morning Runners",
  tagline: "Run before the city wakes. Plans, routes and a crew that shows up at 6.",
  logoUrl: logo,
  coverUrl: cover,
  url: "/community/morning-runners",
  priceLine: "$9/month",
  joinLabel: "Join for $9/month",
  memberCount: 1240,
  postCount: 318,
  upcomingEventCount: 2,
  events: [
    { id: "e1", title: "Track night at the stadium", startsAt: ahead(2), endsAt: ahead(2, 19), timezone: "Europe/Lisbon", kind: "meetup" },
    { id: "e2", title: "Q&A: your first half marathon", startsAt: ahead(6, 17), endsAt: null, timezone: "Europe/Lisbon", kind: "ama" },
  ],
  posts: [
    { id: "p1", title: "Sunday long run: 18 km by the river", excerpt: "Meet at the bridge at 7. Two pace groups, coffee after. Bring a layer, it gets windy past the docks.", author: { name: "Ana", avatarUrl: face(1) }, createdAt: hours(3), reactionCount: 24, commentCount: 11 },
    { id: "p2", title: null, excerpt: "Week 6 of the base plan done. My easy pace finally feels easy. Thanks to everyone who kept me honest about slowing down.", author: { name: "Mihai", avatarUrl: face(2) }, createdAt: hours(20), reactionCount: 9, commentCount: 4 },
    { id: "p3", title: "Shoe rotation: what is everyone using this winter?", excerpt: "", author: { name: "Jordan", avatarUrl: null }, createdAt: hours(50), reactionCount: 3, commentCount: 1 },
  ],
  members: Array.from({ length: 8 }, (_, i) => ({ name: ["Ana", "Mihai", "Jordan", "Elena", "Sam", "Ioana", "Chris", "Lea"][i], avatarUrl: i === 5 ? null : face(i + 3) })),
  leaders: [
    { name: "Ana", avatarUrl: face(1), rank: 1, points: 240, level: 4 },
    { name: "Elena", avatarUrl: face(6), rank: 2, points: 188, level: 4 },
    { name: "Mihai", avatarUrl: face(2), rank: 3, points: 120, level: 3 },
  ],
  reviews: {
    average: 4.8,
    count: 37,
    items: [
      { name: "Sam", rating: 5, content: "I came for the plans and stayed for the people. Ran my first 10k in March.", createdAt: hours(100) },
      { name: "Lea", rating: 4, content: "Calm, useful, nobody shouting. The Sunday runs are the best part of my week.", createdAt: hours(300) },
    ],
  },
}

const settings: CommunitySettings = { ...defaultCommunitySettings, communityId: ID, headline: "Run with us", showLeaderboard: true }

/* The builder's read, answered as it is while communities are off. */
window.fetch = (async () => new Response(JSON.stringify({ error: "communities_off" }), { status: 404, headers: { "Content-Type": "application/json" } })) as typeof fetch

function section(s: CommunitySettings): Section {
  return { id: "s-community", type: "community", order: 0, settings: s } as Section
}

function Page({ dark, children }: { dark?: boolean; children: React.ReactNode }) {
  const vars = dark
    ? ({ "--background": "#121214", "--card": "#1b1b1f", "--foreground": "#f1f1f3", "--muted-foreground": "#a3a3ad", "--border": "rgba(255,255,255,0.12)" } as React.CSSProperties)
    : ({ "--background": "#ffffff", "--card": "#ffffff", "--foreground": "#111111", "--muted-foreground": "#6b7280", "--border": "#e5e7eb" } as React.CSSProperties)
  return (
    <div data-page style={{ ...vars, background: "var(--background)", color: "var(--foreground)", minHeight: "100vh", paddingTop: 1 }}>
      {children}
    </div>
  )
}

function App() {
  if (mode === "sample") return <div style={{ width: 700 }}><CommunitySectionSample /></div>
  if (mode === "builder") {
    return (
      <Page>
        <UnifiedSectionRenderer section={section(settings)} isPreviewMode onSelect={() => undefined} />
      </Page>
    )
  }
  const s =
    mode === "minimal"
      ? { ...settings, headline: "", showEvents: false, showPosts: false, showMembers: false, showLeaderboard: false, showReviews: false }
      : settings
  const data = mode === "minimal" ? { ...full, coverUrl: null, logoUrl: null } : full
  return (
    <Page dark={mode === "dark"}>
      <SectionRenderer section={section(s)} isMobile={mode === "phone"} communityBlocks={mode === "off" ? {} : { [ID]: data }} />
    </Page>
  )
}

createRoot(document.getElementById("root")!).render(<App />)
