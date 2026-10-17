/**
 * ROUND 26 (W4): the community's About page and its info card, with fixtures, for scripts/check-about26.mjs.
 *
 *   ?case=free      a free community, signed out: Join free
 *   ?case=paid      $24/month or $240/year, signed in: Join $24/month
 *   ?case=trial     the same tier with a 7 day trial: Start free trial
 *   ?case=invite    private (invite only), $24/month: nothing to press, no Share
 *   ?view=member    the member's community card (components/community/member/wall.tsx) in its 280px column
 *   ?dark=1         the reader's dark look (the frame's data-community-theme and data-sl-dark on <html>)
 *   ?summary=0      no short description: the card falls back to the tagline
 *
 * The real components: the community's public frame (its bar, the left card from 1024px), the sales page with the side
 * card from 1280px and the phone's bar.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { CommunityPublicFrame } from "@/components/community/public/public-frame"
import { CommunitySalesPage } from "@/components/community/public/sales-page"
import { decideJoin } from "@/components/community/public/join-state"
import { checkoutPath } from "@/components/community/public/paths"
import type { AboutExtras, JoinOption, PublicCommunityView, SalesPageData } from "@/components/community/public/types"
import type { ShellCommunity, TopBarData, WallCardData } from "@/components/community/member/view-types"
import { WallCommunityCard } from "@/components/community/member/wall"
import { socialLinksOf } from "@/lib/communities/social-links"
import { LocaleProvider } from "@/components/locale-provider"

const params = new URLSearchParams(location.search)
const which = params.get("case") || "paid"
const dark = params.get("dark") === "1"
try {
  localStorage.setItem("storelib:appearance", dark ? "dark" : "light")
} catch {
  /* no storage */
}
if (dark) document.documentElement.setAttribute("data-sl-dark", "")

function svg(w: number, h: number, body: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`)}`
}
const COVERS = [
  svg(1600, 900, `<rect width="1600" height="900" fill="#d9cbb6"/><circle cx="1180" cy="400" r="300" fill="#c0a17e"/><rect x="0" y="600" width="1600" height="300" fill="#8f7a5f"/><circle cx="420" cy="520" r="140" fill="#efe6d8"/>`),
  svg(1600, 900, `<rect width="1600" height="900" fill="#cfdbd5"/><path d="M0 620 C 400 480, 800 740, 1600 550 L1600 900 L0 900 Z" fill="#6f8f7f"/><circle cx="1260" cy="240" r="100" fill="#f2efe6"/>`),
  svg(1600, 900, `<rect width="1600" height="900" fill="#e7e2d8"/><rect x="200" y="200" width="520" height="460" rx="24" fill="#2f3a44"/><rect x="760" y="280" width="640" height="40" rx="20" fill="#b9b2a5"/>`),
  svg(1600, 900, `<rect width="1600" height="900" fill="#3b4252"/><circle cx="800" cy="450" r="260" fill="#88c0d0"/>`),
]
const LOGO = svg(128, 128, `<rect width="128" height="128" rx="28" fill="#1a1a2e"/><path d="M38 86 L64 40 L90 86 Z" fill="#f4efe6"/>`)
const FACE = (fill: string) => svg(64, 64, `<rect width="64" height="64" fill="${fill}"/><circle cx="32" cy="26" r="12" fill="#f3ebe2"/><rect x="14" y="42" width="36" height="22" rx="11" fill="#f3ebe2"/>`)

const CID = "c0000000-0000-4000-8000-000000000026"
const SLUG = "clay-studio"
const paid: JoinOption = {
  tierId: "tier-pro",
  name: "Studio members",
  description: "Weekly critiques, the course library and the members' chat.",
  kind: "paid",
  billing: "recurring",
  productId: "prod-pro",
  monthlyCents: 2400,
  yearlyCents: 24000,
  priceCents: null,
  currency: "usd",
  priceLine: "$24/month",
  benefits: ["Weekly live critique, recorded", "All 9 courses"],
  checkout: { month: checkoutPath("prod-pro", SLUG, "month"), year: checkoutPath("prod-pro", SLUG, "year"), once: null },
}
const free: JoinOption = { tierId: "tier-free", name: "Members", description: null, kind: "free", billing: null, productId: null, monthlyCents: null, yearlyCents: null, priceCents: null, currency: "usd", priceLine: "Free", benefits: [], checkout: null }
const links = socialLinksOf([
  { label: "Instagram", url: "https://www.instagram.com/claystudio" },
  { label: "YouTube", url: "https://www.youtube.com/@claystudio" },
  { label: "TikTok", url: "https://www.tiktok.com/@claystudio" },
  { label: "claystudio.com", url: "https://claystudio.com" },
])

const SUMMARY = params.get("summary") === "0" ? null : "A working studio for people learning wheel throwing, glazing and firing at home, with a weekly critique, a course library and a calm members' chat."
const base: PublicCommunityView = {
  id: CID,
  slug: SLUG,
  name: "Clay Studio",
  tagline: "Wheel throwing, glazing and firing at home.",
  summary: SUMMARY,
  adminCount: 2,
  logoUrl: LOGO,
  coverUrl: COVERS[0],
  category: "education",
  visibility: "public",
  access: "paid",
  status: "published",
  approvalRequired: false,
  memberCount: 1284,
  descriptionHtml:
    "<p>Clay Studio is where I share what I learned over <strong>twelve years</strong> of running a pottery workshop. Every week there is a live critique where members post a piece and we talk through form, trimming and glaze.</p><ul><li>A weekly build prompt</li><li>Live Q&amp;A</li></ul><p>New here? Read <a href=\"https://example.com/start\">the starter guide</a>.</p>",
  descriptionText: null,
  benefits: ["Weekly live critique, recorded", "The course library: 9 courses, 140 lessons", "Monthly glaze recipe drop", "Members' chat and the studio directory"],
  rules: [{ title: "Critique the piece, not the person", body: "Say what you see and what you would try next." }],
  faq: [{ q: "Do I need my own kiln?", a: "No. Most members fire at a shared studio." }],
  creator: { name: "Mara Lindqvist", username: "mara", avatarUrl: FACE("#c9b8a6"), href: "/mara" },
  options: [paid],
  accessProducts: [],
  reviews: null,
  url: `/community/${SLUG}`,
  address: `storelib.com/community/${SLUG}`,
  gallery: COVERS.map((url) => ({ type: "image" as const, url })),
  stats: { members: 1284, online: 14, admins: 2 },
  links,
  coverPosition: null,
  joinLook: null,
}

const faces = ["Ana Popescu", "Marcus Lee", "Priya Raman", "Tomás Herrera", "Elena Ionescu"].map((name, i) => ({ id: `u${i}`, name, avatarUrl: i % 2 ? FACE(["#e6d0cb", "#c9d6c3", "#d6cfe0"][i % 3]) : null }))
const extras: AboutExtras = { activity: { posts30: 186, active7: 402, since: "2025-03-02T00:00:00Z" }, classroom: null, creatorBio: "Potter and teacher in Gothenburg.", faces }

const viewer = { signedIn: true, active: false, status: null, role: null, isOwner: false, banned: false, approved: false, source: null, membershipId: null } as const
const decide = (c: PublicCommunityView, v: Record<string, unknown> = {}) =>
  decideJoin({
    community: { slug: c.slug, status: c.status, access: c.access, visibility: c.visibility, approvalRequired: c.approvalRequired, suspended: false, archived: false, creatorName: c.creator?.name ?? null },
    viewer: { ...viewer, ...v } as never,
    options: c.options,
    accessProducts: c.accessProducts,
    canTakePayments: true,
  })

function page(): SalesPageData {
  if (which === "free") {
    const c: PublicCommunityView = { ...base, access: "free", options: [free], name: "Night Runners", tagline: "Running after dark, together.", slug: "night-runners", url: "/community/night-runners", address: "storelib.com/community/night-runners" }
    return { community: c, join: decide(c, { signedIn: false }), notice: null, extras }
  }
  if (which === "trial") {
    const c: PublicCommunityView = { ...base, options: [{ ...paid, trialDays: 7 }] }
    return { community: c, join: decide(c), notice: null, extras }
  }
  if (which === "invite") {
    const c: PublicCommunityView = { ...base, visibility: "private", access: "paid", links: links.slice(0, 2) }
    return { community: c, join: decide(c), notice: null, extras }
  }
  return { community: base, join: decide(base), notice: null, extras }
}

const data = page()
const c = data.community
const topBar: TopBarData = {
  community: { id: c.id, slug: c.slug, name: c.name, logoUrl: c.logoUrl },
  creator: c.creator ? { name: c.creator.name, href: c.creator.href } : null,
  me: which === "free" ? null : { name: "Alex Morgan", avatarUrl: null, profileHref: "/account", username: "alex" },
  communities: [],
  manageHref: null,
}
const shell: ShellCommunity = {
  id: c.id,
  slug: c.slug,
  name: c.name,
  tagline: c.tagline,
  summary: c.summary ?? null,
  links: c.links ?? [],
  logoUrl: c.logoUrl,
  coverUrl: c.coverUrl,
  memberCount: c.memberCount,
  postCount: 12,
  classroomEnabled: true,
  eventsEnabled: true,
  directoryEnabled: true,
  chatEnabled: true,
  gamificationEnabled: true,
  archived: false,
  published: true,
  access: c.access,
  visibility: c.visibility,
  approvalRequired: false,
}
const card: WallCardData = { stats: c.stats, faces: faces.map((f) => ({ ...f, username: null })), more: 1279, settingsHref: params.get("staff") === "1" ? `/app/community/${c.id}/settings` : null }

function App() {
  if (params.get("view") === "member") {
    return (
      <div data-community-theme={dark ? "dark" : "light"} className="min-h-svh bg-[#f8f9fa] p-6">
        <div className="w-[280px]">
          <WallCommunityCard community={shell} card={card} membersHref="/community/clay-studio/members" />
        </div>
      </div>
    )
  }
  /* ?shrink=1: the gallery goes from two pictures to one and back in place, as the Page editor does while a picture is removed (W5's note). */
  const [shown, setShown] = React.useState(data)
  React.useEffect(() => {
    if (params.get("shrink") !== "1") return
    const two = { ...data, community: { ...data.community, gallery: data.community.gallery.slice(0, 2) } }
    const one = { ...data, community: { ...data.community, gallery: data.community.gallery.slice(0, 1) } }
    setShown(two)
    const steps = [one, two, one, data]
    const timers = steps.map((d, i) => window.setTimeout(() => setShown(d), 400 * (i + 1)))
    window.setTimeout(() => ((window as unknown as { __shrunk?: boolean }).__shrunk = true), 400 * (steps.length + 1))
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [])
  return (
    <CommunityPublicFrame topBar={topBar} card={{ community: shell, card: { ...card, faces: [], more: 0 } }}>
      <CommunitySalesPage data={shown} />
    </CommunityPublicFrame>
  )
}

createRoot(document.getElementById("app") as HTMLElement).render(
  <LocaleProvider>
    <App />
  </LocaleProvider>,
)
