/**
 * A COMMUNITY'S ABOUT PAGE AND ITS JOIN, with fixtures, for
 * scripts/check-community-about.mjs (round 10, asks 32 and 33). The real
 * components: the community's public frame (its bar), the sales page with
 * its pricing card, classroom, creator and sticky card, the phone's join
 * bar, and (with ?tabs=1) the real buyer tab bar mounted after the page as
 * the marketing layout mounts it.
 *
 *   ?case=paid       monthly and yearly, a lifetime tier too, courses, a bio
 *   ?case=free       a free one, no cover, signed in (Join for free)
 *   ?case=once       one time: pay once
 *   ?case=invite     invite only: nothing to press
 *   ?case=approval   approval required: Request to join
 *   ?case=member     a member on /about: Open community
 *
 * THE JOIN, END TO END WITH STUBBED ROUTES. router.refresh (the probe's
 * next/navigation stub) calls window.__onRefresh: here that draws what the
 * server would answer next, the member's inside (a marker the probe waits
 * for), after the server's time (?server=<ms>, 350 by default).
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { CommunityPublicFrame } from "@/components/community/public/public-frame"
import { CommunitySalesPage } from "@/components/community/public/sales-page"
import { decideJoin } from "@/components/community/public/join-state"
import { checkoutPath } from "@/components/community/public/paths"
import type { AboutExtras, JoinOption, PublicCommunityView, SalesPageData } from "@/components/community/public/types"
import type { TopBarData } from "@/components/community/member/view-types"
import { BuyerTabBar } from "@/components/nav/buyer-tab-bar"
import { LocaleProvider } from "@/components/locale-provider"
import { ExploreMarketplaceProvider } from "@/components/platform/explore-marketplace-context"

function svg(w: number, h: number, body: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`)}`
}
const COVERS = [
  svg(1600, 900, `<rect width="1600" height="900" fill="#d9cbb6"/><circle cx="1180" cy="400" r="300" fill="#c0a17e"/><rect x="0" y="600" width="1600" height="300" fill="#8f7a5f"/><circle cx="420" cy="520" r="140" fill="#efe6d8"/><rect x="380" y="380" width="80" height="140" rx="16" fill="#a9845c"/>`),
  svg(1600, 900, `<rect width="1600" height="900" fill="#cfdbd5"/><path d="M0 620 C 400 480, 800 740, 1600 550 L1600 900 L0 900 Z" fill="#6f8f7f"/><circle cx="1260" cy="240" r="100" fill="#f2efe6"/>`),
  svg(1600, 900, `<rect width="1600" height="900" fill="#e7e2d8"/><rect x="200" y="200" width="520" height="460" rx="24" fill="#2f3a44"/><rect x="760" y="280" width="640" height="40" rx="20" fill="#b9b2a5"/><rect x="760" y="360" width="460" height="40" rx="20" fill="#cfc9be"/>`),
]
const LOGO = svg(128, 128, `<rect width="128" height="128" rx="28" fill="#1a1a2e"/><path d="M38 86 L64 40 L90 86 Z" fill="#f4efe6"/>`)
const FACE = svg(64, 64, `<rect width="64" height="64" fill="#c9b8a6"/><circle cx="32" cy="26" r="12" fill="#f3ebe2"/><rect x="14" y="42" width="36" height="22" rx="11" fill="#f3ebe2"/>`)
const THUMBS = [svg(320, 200, `<rect width="320" height="200" fill="#e9dfd2"/><circle cx="160" cy="110" r="60" fill="#b78f68"/>`), svg(320, 200, `<rect width="320" height="200" fill="#dfe7e3"/><rect x="60" y="60" width="200" height="90" rx="12" fill="#6f8f7f"/>`), null]

const CID = "c0000000-0000-4000-8000-000000000001"
const pro: JoinOption = {
  tierId: "tier-pro",
  name: "Studio members",
  description: "Weekly critiques, the course library and the members' chat.",
  kind: "paid",
  billing: "recurring",
  productId: "prod-pro",
  monthlyCents: 1900,
  yearlyCents: 19000,
  priceCents: null,
  currency: "usd",
  priceLine: "$19/month",
  benefits: ["Weekly live critique, recorded", "All 9 courses, 140 lessons", "Monthly glaze recipe drop", "The members' chat"],
  checkout: { month: checkoutPath("prod-pro", "clay-studio", "month"), year: checkoutPath("prod-pro", "clay-studio", "year"), once: null },
}
const lifetime: JoinOption = { ...pro, tierId: "tier-life", name: "Lifetime", description: "Pay once, keep access.", billing: "one_time", monthlyCents: null, yearlyCents: null, priceCents: 24900, priceLine: "$249", benefits: [], checkout: { month: null, year: null, once: checkoutPath("prod-life", "clay-studio") } }
const free: JoinOption = { tierId: "tier-free", name: "Members", description: null, kind: "free", billing: null, productId: null, monthlyCents: null, yearlyCents: null, priceCents: null, currency: "usd", priceLine: "Free", benefits: [], checkout: null }

const base: PublicCommunityView = {
  id: CID,
  slug: "clay-studio",
  name: "Clay Studio",
  tagline: "A working studio for people learning wheel throwing, glazing and firing at home.",
  logoUrl: LOGO,
  coverUrl: COVERS[0],
  category: "education",
  visibility: "public",
  access: "paid",
  status: "published",
  approvalRequired: false,
  memberCount: 1284,
  descriptionHtml:
    "<p>Clay Studio is where I share what I learned over twelve years of running a pottery workshop. Every week there is a live critique where members post a piece and we talk through form, trimming and glaze.</p><p>You get the course library, a monthly firing schedule if you work with a shared kiln, and a quiet place to ask questions.</p>",
  descriptionText: null,
  benefits: ["Weekly live critique, recorded", "The course library: 9 courses, 140 lessons", "Monthly glaze recipe drop", "Members' chat and the studio directory"],
  rules: [
    { title: "Critique the piece, not the person", body: "Say what you see and what you would try next." },
    { title: "Credit recipes", body: "If you share a glaze recipe that is not yours, say where it came from." },
    { title: "No selling in the feed", body: "" },
    { title: "Photos of your own work only", body: "" },
  ],
  faq: [
    { q: "Do I need my own kiln?", a: "No. Most members fire at a shared studio." },
    { q: "Can I cancel?", a: "Yes, any time from your library." },
  ],
  creator: { name: "Mara Lindqvist", username: "mara", avatarUrl: FACE, href: "/mara" },
  options: [pro, lifetime],
  accessProducts: [],
  reviews: {
    average: 4.8,
    total: 37,
    items: [
      { id: "r1", rating: 5, content: "The weekly critique is worth the price on its own.", name: "Jonas", avatarUrl: null, createdAt: "2026-09-12T10:00:00Z", href: "/@jonas", payingFor: "3 months" },
      { id: "r2", rating: 4, content: "Calm, practical and kind.", name: "Priya Shah", avatarUrl: null, createdAt: "2026-08-30T10:00:00Z", href: null, payingFor: null },
    ],
  },
  url: "/community/clay-studio",
  address: "storelib.com/community/clay-studio",
  gallery: COVERS.map((url) => ({ type: "image" as const, url })),
  stats: { members: 1284, online: 14, admins: 2 },
}

const extrasFull: AboutExtras = {
  activity: { posts30: 186, active30: 402, since: "2025-03-02T00:00:00Z" },
  classroom: {
    total: 9,
    courses: [
      { productId: "co-1", title: "Centering, the first month", coverUrl: THUMBS[0], lessons: 18 },
      { productId: "co-2", title: "Trimming feet that look made", coverUrl: THUMBS[1], lessons: 12 },
      { productId: "co-3", title: "Glaze chemistry without the fear", coverUrl: null, lessons: 24 },
      { productId: "co-4", title: "Firing at a shared kiln", coverUrl: THUMBS[0], lessons: 7 },
    ],
  },
  creatorBio: "Potter and teacher in Gothenburg. Twelve years running a workshop, now teaching online.",
}
const extrasSmall: AboutExtras = { activity: { posts30: 23, active30: 41, since: "2026-08-20T00:00:00Z" }, classroom: null, creatorBio: null }

const viewer = { signedIn: true, active: false, status: null, role: null, isOwner: false, banned: false, approved: false, source: null, membershipId: null } as const
const decide = (c: PublicCommunityView, v: Record<string, unknown> = {}) =>
  decideJoin({
    community: { slug: c.slug, status: c.status, access: c.access, approvalRequired: c.approvalRequired, suspended: false, archived: false, creatorName: c.creator?.name ?? null },
    viewer: { ...viewer, ...v } as never,
    options: c.options,
    accessProducts: c.accessProducts,
    canTakePayments: true,
  })

function page(which: string): SalesPageData {
  if (which === "free") {
    const c: PublicCommunityView = { ...base, slug: "night-runners", name: "Night Runners", tagline: "Running after dark, together. Routes, gear and a weekly group run.", coverUrl: null, logoUrl: null, access: "free", memberCount: 86, options: [free], reviews: null, gallery: [], stats: { members: 86, online: null, admins: 1 }, creator: { name: "Dev Patel", username: "dev", avatarUrl: null, href: "/@dev" }, address: "storelib.com/community/night-runners", url: "/community/night-runners" }
    return { community: c, join: decide(c), notice: null, extras: extrasSmall }
  }
  if (which === "once") {
    const c: PublicCommunityView = { ...base, options: [lifetime], access: "paid" }
    return { community: c, join: decide(c), notice: null, extras: { ...extrasFull, classroom: null } }
  }
  if (which === "invite") {
    const c: PublicCommunityView = { ...base, access: "invite_only", options: [free], reviews: null }
    return { community: c, join: decide(c), notice: null, extras: extrasFull }
  }
  if (which === "approval") {
    const c: PublicCommunityView = { ...base, access: "free", approvalRequired: true, options: [free], reviews: null }
    return { community: c, join: decide(c), notice: null, extras: extrasSmall }
  }
  if (which === "member") return { community: base, join: decide(base, { active: true, role: "member", status: "active" }), notice: null, extras: extrasFull }
  return { community: base, join: decide(base), notice: null, extras: extrasFull }
}

const params = new URLSearchParams(location.search)
const which = params.get("case") || "paid"
const data = page(which)
const c = data.community
const topBar: TopBarData = {
  community: { id: c.id, slug: c.slug, name: c.name, logoUrl: c.logoUrl },
  creator: c.creator ? { name: c.creator.name, href: c.creator.href } : null,
  me: { name: "Alex Morgan", avatarUrl: null, profileHref: "/account", username: "alex" },
  communities: [],
  manageHref: null,
}

/* The member's inside, as the server answers the refresh after a join: the probe waits for this marker. */
function Inside() {
  React.useLayoutEffect(() => {
    ;(window as unknown as { __insideAt?: number }).__insideAt = performance.now()
  }, [])
  return (
    <div data-probe-inside="" className="mx-auto max-w-[680px] px-4 py-6">
      <p className="text-[15px] font-semibold text-[#1a1a2e]">Welcome to {c.name}</p>
    </div>
  )
}

function App() {
  const [inside, setInside] = React.useState(false)
  React.useEffect(() => {
    const server = Number(params.get("server") || 350)
    ;(window as unknown as { __onRefresh?: () => void }).__onRefresh = () => window.setTimeout(() => setInside(true), server)
  }, [])
  return (
    <div style={{ display: "flex", minHeight: "100svh", flexDirection: "column" }}>
      <CommunityPublicFrame topBar={topBar}>{inside ? <Inside /> : <CommunitySalesPage data={data} />}</CommunityPublicFrame>
      <footer data-fake-footer="" style={{ background: "#fff", borderTop: "1px solid #e5e7eb", padding: "32px 24px", color: "#6b7280", fontSize: 13 }}>
        <div data-footer-last="">© Storelib · Terms · Privacy</div>
      </footer>
    </div>
  )
}

createRoot(document.getElementById("app") as HTMLElement).render(
  <LocaleProvider>
    <App />
  </LocaleProvider>,
)

if (params.get("tabs") === "1") {
  const el = document.createElement("div")
  el.setAttribute("data-probe-tabs-root", "")
  document.body.appendChild(el)
  createRoot(el).render(
    <LocaleProvider>
      <ExploreMarketplaceProvider exploreMarketplace buyerHeaderLight={false} physicalCommerce={false}>
        <BuyerTabBar />
      </ExploreMarketplaceProvider>
    </LocaleProvider>,
  )
}
