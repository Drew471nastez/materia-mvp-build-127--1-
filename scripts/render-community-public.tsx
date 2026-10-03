/**
 * The public side of a community, with fixture data, for
 * scripts/check-community-public.mjs. The real components: the sales page
 * (its sticky card and the phone's bar), Explore's communities grid, the
 * library's Communities tab and a creator page's Communities tab.
 *
 *   ?sales          a paid community, monthly and yearly, a visitor signed in
 *   ?sales-free     a free one, signed out, no cover
 *   ?sales-member   the owner of it, on /about
 *   ?sales-pending  a request waiting
 *   ?explore        /explore/communities
 *   ?library        /library/communities
 *   ?storefront     a creator page's Communities tab
 */
import { createRoot } from "react-dom/client"
import { CommunitySalesPage } from "@/components/community/public/sales-page"
import { ExploreCommunities } from "@/components/community/public/explore-communities"
import { LibraryCommunitiesList } from "@/components/community/public/library-list"
import { StorefrontCommunities } from "@/components/community/public/storefront-communities"
import { decideJoin } from "@/components/community/public/join-state"
import { checkoutPath } from "@/components/community/public/paths"
import type { JoinOption, PublicCommunityView, SalesPageData } from "@/components/community/public/types"
import type { CommunityCard } from "@/lib/communities/types"

/* Pictures drawn here, so the probe needs no network: muted, natural tones, never a purple gradient. */
function svg(w: number, h: number, body: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`)}`
}
const COVERS = [
  svg(1600, 700, `<rect width="1600" height="700" fill="#d9cbb6"/><circle cx="1180" cy="330" r="260" fill="#c0a17e"/><rect x="0" y="470" width="1600" height="230" fill="#8f7a5f"/><circle cx="420" cy="420" r="120" fill="#efe6d8"/><rect x="380" y="300" width="80" height="120" rx="16" fill="#a9845c"/>`),
  svg(1600, 700, `<rect width="1600" height="700" fill="#cfdbd5"/><path d="M0 520 C 400 380, 800 640, 1600 450 L1600 700 L0 700 Z" fill="#6f8f7f"/><circle cx="1260" cy="200" r="90" fill="#f2efe6"/>`),
  svg(1600, 700, `<rect width="1600" height="700" fill="#e7e2d8"/><rect x="200" y="160" width="520" height="380" rx="24" fill="#2f3a44"/><rect x="760" y="220" width="640" height="40" rx="20" fill="#b9b2a5"/><rect x="760" y="300" width="460" height="40" rx="20" fill="#cfc9be"/>`),
  svg(1600, 700, `<rect width="1600" height="700" fill="#22303c"/><circle cx="300" cy="350" r="200" fill="#36485a"/><circle cx="1300" cy="250" r="140" fill="#d3a35e"/>`),
]
const LOGO = svg(128, 128, `<rect width="128" height="128" rx="28" fill="#1a1a2e"/><path d="M38 86 L64 40 L90 86 Z" fill="#f4efe6"/>`)
const FACE = svg(64, 64, `<rect width="64" height="64" fill="#c9b8a6"/><circle cx="32" cy="26" r="12" fill="#f3ebe2"/><rect x="14" y="42" width="36" height="22" rx="11" fill="#f3ebe2"/>`)

const proOption: JoinOption = {
  tierId: "tier-pro",
  name: "Studio members",
  description: "Weekly critiques, the full course library and the members' chat.",
  kind: "paid",
  billing: "recurring",
  productId: "prod-pro",
  monthlyCents: 1900,
  yearlyCents: 19000,
  priceCents: null,
  currency: "usd",
  priceLine: "$19/month",
  benefits: [],
  checkout: { month: checkoutPath("prod-pro", "clay-studio", "month"), year: checkoutPath("prod-pro", "clay-studio", "year"), once: null },
}
const lifetime: JoinOption = { ...proOption, tierId: "tier-life", name: "Lifetime", description: "Pay once, keep access.", billing: "one_time", monthlyCents: null, yearlyCents: null, priceCents: 24900, priceLine: "$249", checkout: { month: null, year: null, once: checkoutPath("prod-life", "clay-studio") } }
const freeOption: JoinOption = { tierId: "tier-free", name: "Members", description: null, kind: "free", billing: null, productId: null, monthlyCents: null, yearlyCents: null, priceCents: null, currency: "usd", priceLine: "Free", benefits: [], checkout: null }

const studio: PublicCommunityView = {
  id: "c0000000-0000-4000-8000-000000000001",
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
    "<p>Clay Studio is where I share what I learned over twelve years of running a pottery workshop. Every week there is a live critique where members post a piece and we talk through form, trimming and glaze.</p><p>You get the full course library, a monthly firing schedule if you work with a shared kiln, and a quiet place to ask questions without the noise of a big forum.</p><h3>Who it is for</h3><ul><li>Beginners with their first wheel</li><li>Hobbyists who want honest feedback</li><li>Teachers looking for structure</li></ul>",
  descriptionText: null,
  benefits: ["Weekly live critique, recorded", "The full course library: 9 courses, 140 lessons", "Monthly glaze recipe drop", "Members' chat and the studio directory"],
  rules: [
    { title: "Critique the piece, not the person", body: "Say what you see and what you would try next. Keep it specific." },
    { title: "Credit recipes", body: "If you share a glaze recipe that is not yours, say where it came from." },
    { title: "No selling in the feed", body: "Use the marketplace space for anything you want to sell." },
    { title: "Photos of your own work only", body: "" },
    { title: "Keep kiln safety posts accurate", body: "" },
  ],
  faq: [
    { q: "Do I need my own kiln?", a: "No. Most members fire at a shared studio. The firing schedule helps you plan around it." },
    { q: "Can I cancel?", a: "Yes, any time from your library. You keep access until the end of the period you paid for." },
    { q: "Is there a yearly price?", a: "Yes. Yearly is $190, about two months free." },
  ],
  creator: { name: "Mara Lindqvist", username: "mara", avatarUrl: FACE, href: "/mara" },
  options: [proOption, lifetime],
  accessProducts: [],
  reviews: {
    average: 4.8,
    total: 37,
    items: [
      { id: "r1", rating: 5, content: "The weekly critique is worth the price on its own. I finally understand trimming.", name: "Jonas", avatarUrl: null, createdAt: "2026-09-12T10:00:00Z" },
      { id: "r2", rating: 5, content: "Calm, practical and kind. Nothing like the big Facebook groups.", name: "Priya Shah", avatarUrl: null, createdAt: "2026-08-30T10:00:00Z" },
      { id: "r3", rating: 4, content: "Lots of glaze knowledge. I wish the firing schedule had more slots in winter.", name: "Ellen", avatarUrl: null, createdAt: "2026-08-02T10:00:00Z" },
    ],
  },
  url: "/community/clay-studio",
}

const viewer = { signedIn: true, active: false, status: null, role: null, isOwner: false, banned: false, approved: false, source: null, membershipId: null } as const
const facts = (c: PublicCommunityView, v: Partial<typeof viewer> | Record<string, unknown> = {}) =>
  decideJoin({
    community: { slug: c.slug, status: c.status, access: c.access, approvalRequired: c.approvalRequired, suspended: false, archived: false, creatorName: c.creator?.name ?? null },
    viewer: { ...viewer, ...v } as never,
    options: c.options,
    accessProducts: c.accessProducts,
    canTakePayments: true,
  })

const freeOne: PublicCommunityView = {
  ...studio,
  slug: "night-runners",
  name: "Night Runners",
  tagline: "Running after dark, together. Routes, gear and a weekly group run.",
  coverUrl: null,
  logoUrl: null,
  access: "free",
  memberCount: 86,
  options: [freeOption],
  reviews: null,
  faq: [],
  rules: studio.rules.slice(0, 2),
  benefits: ["A weekly group run in four cities", "Shared routes with lighting notes"],
  descriptionHtml: "<p>Free to join. Post your route, find people near you and come to the Thursday run.</p>",
  creator: { name: "Dev Patel", username: "dev", avatarUrl: null, href: "/dev" },
}

const pages: Record<string, () => SalesPageData> = {
  sales: () => ({ community: studio, join: facts(studio), notice: null }),
  "sales-free": () => ({ community: freeOne, join: facts(freeOne, { signedIn: false }), notice: null }),
  "sales-member": () => ({ community: studio, join: facts(studio, { active: true, role: "owner", isOwner: true, status: "active" }), notice: null }),
  "sales-pending": () => {
    const c = { ...studio, approvalRequired: true }
    return { community: c, join: facts(c, { status: "pending" }), notice: null }
  },
}

const card = (i: number, over: Partial<CommunityCard> = {}): CommunityCard => ({
  id: `c-${i}`,
  slug: `community-${i}`,
  name: ["Clay Studio", "Night Runners", "Indie Hackers Lab", "Film Photo Club", "Sourdough School", "The Quiet Writers", "Synth Workshop"][i % 7],
  tagline: [
    "A working studio for people learning wheel throwing, glazing and firing at home.",
    "Running after dark, together.",
    "Ship a small product every month with people doing the same.",
    "Develop at home, share scans, learn to print.",
    "Bake better bread with weekly bakes and feedback on your crumb.",
    "Writing sprints and gentle accountability for long projects.",
    "Patches, sound design and a monthly track challenge.",
  ][i % 7],
  logoUrl: i % 3 === 1 ? null : LOGO,
  coverUrl: i % 4 === 3 ? null : COVERS[i % COVERS.length],
  category: null,
  access: i % 2 ? "free" : "paid",
  visibility: "public",
  memberCount: [1284, 86, 3420, 412, 9876, 57, 1203][i % 7],
  priceLine: i % 2 ? "Free" : ["$19/month", "$9/month", "$249", "$12/month"][i % 4],
  creator: { id: `cr-${i}`, name: ["Mara Lindqvist", "Dev Patel", "Sam Okafor", "Lena Ito", "Tomás Ruiz", "Ada Byrne", "Kofi Mensah"][i % 7], username: null, avatarUrl: null },
  url: `/community/community-${i}`,
  ...over,
})

function Header() {
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 30, height: 64, background: "#fff", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", padding: "0 24px", fontWeight: 600, color: "#1a1a2e" }} data-fake-header="">
      Storelib
    </div>
  )
}
function Footer() {
  return (
    <footer data-fake-footer="" style={{ background: "#fff", borderTop: "1px solid #e5e7eb", padding: "32px 24px", color: "#6b7280", fontSize: 13 }}>
      <div data-footer-last="">© Storelib · Terms · Privacy</div>
    </footer>
  )
}

const which = location.search.replace(/^\?/, "") || "sales"
const root = createRoot(document.getElementById("app") as HTMLElement)

if (pages[which]) {
  root.render(
    <div style={{ display: "flex", minHeight: "100svh", flexDirection: "column" }}>
      <Header />
      <CommunitySalesPage data={pages[which]()} />
      <Footer />
    </div>,
  )
} else if (which === "explore") {
  root.render(
    <div>
      <Header />
      <main className="explore-ground min-h-screen bg-[#f8f9fa]">
        <div className="mx-auto max-w-[1400px] px-4 pb-10 pt-5 sm:px-6 sm:pb-14 sm:pt-7 lg:px-8">
          <ExploreCommunities initial={Array.from({ length: 7 }, (_, i) => card(i))} next="cursor" q="" sort="trending" />
        </div>
      </main>
    </div>,
  )
} else if (which === "library") {
  root.render(
    <div className="min-h-screen bg-[#fafafa]">
      <Header />
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="text-[24px] font-bold tracking-[-0.01em] text-[#1a1a2e] sm:text-[28px]">Library</h1>
        <div className="mt-5 space-y-3">
          <p className="text-[14px] text-[#6b7280]">3 communities</p>
          <LibraryCommunitiesList
            rows={[
              { id: "a", slug: "clay-studio", name: "Clay Studio", logoUrl: LOGO, coverUrl: COVERS[0], creatorName: "Mara Lindqvist", status: "active", role: "member", tierName: "Studio members", memberCount: 1284, url: "/community/clay-studio" },
              { id: "b", slug: "night-runners", name: "Night Runners", logoUrl: null, coverUrl: null, creatorName: "Dev Patel", status: "active", role: "moderator", tierName: "Members", memberCount: 86, url: "/community/night-runners" },
              { id: "c", slug: "my-own", name: "Indie Hackers Lab, the long name that has to truncate on a phone", logoUrl: null, coverUrl: COVERS[2], creatorName: "You", status: "active", role: "owner", tierName: null, memberCount: 3420, url: "/community/my-own" },
              { id: "d", slug: "film", name: "Film Photo Club", logoUrl: null, coverUrl: COVERS[3], creatorName: "Lena Ito", status: "pending", role: "member", tierName: null, memberCount: 412, url: "/community/film" },
            ]}
          />
        </div>
      </div>
    </div>,
  )
} else if (which === "library-empty") {
  root.render(
    <div className="min-h-screen bg-[#fafafa] px-4 py-6">
      <LibraryCommunitiesList rows={[]} />
    </div>,
  )
} else if (which === "storefront") {
  root.render(
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
        <StorefrontCommunities cards={[card(0), card(1), card(4)]} />
      </div>
    </div>,
  )
}
