/**
 * ROUND 33: the community Page editor and the About page it edits, for scripts/check-page-editor-round33.mjs.
 *
 *   /app/community/salajanywood/page   the real Page editor (components/community/creator/page-editor) inside the real
 *                                      community admin shell, in a stand-in for the /app frame (round 32's harness)
 *   /community/salajanywood/about      the real About page (components/community/public/sales-page.tsx) in the visitor's
 *                                      bar and columns (the preview's own chrome, the same classes as public-frame.tsx)
 *
 * Round 37: the stand-in /app frame carries what the real one does for a page layer to hide ([data-shell-chrome] on the
 * header and the rail, [data-app-nav-pill] on the pill), the Overview is a section the shell holds beside the Page (a
 * tall stand-in, to see Back return to its scroll), and the app's history tracker counts the moves, as in /app.
 *
 * ?frame=1 draws the Page section's frame (what shows while its reads are on their way) in the editor's place.
 *
 * ?members=1 makes a community of one member (no Membership section); ?plain=1 an older plain text description; ?dark=1
 * puts the dark look on <html> before the first paint.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { allowedActions } from "@/lib/communities/permissions"
import { CommunityShell, SectionSeed } from "@/components/community/creator/community-shell"
import { AppHistoryTracker } from "@/components/platform/app-history-tracker"
import { ToastHost } from "@/components/community/creator/parts"
import { PageEditor } from "@/components/community/creator/page-editor/page-editor"
import { SectionFrame } from "@/components/community/creator/section-frame"
import { PreviewChrome } from "@/components/community/creator/page-editor/preview-chrome"
import { CommunitySalesPage } from "@/components/community/public/sales-page"
import type { CommunityHead, SettingsData } from "@/components/community/creator/view-types"
import type { SalesPageData } from "@/components/community/public/types"
import { joinLookOf, cleanLook } from "@/lib/communities/page-look"
import { socialLinksOf } from "@/lib/communities/social-links"

type ProbeRouter = { subscribe: (f: () => void) => () => void; get: () => { routed: string; v: number; pathname: string } }
const probe = (window as unknown as { __probeRouter: ProbeRouter }).__probeRouter

function picture(ground: string, ink: string, w = 640, h = 400): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${ground}"/><circle cx="${w * 0.73}" cy="${h * 0.32}" r="${h * 0.14}" fill="${ink}" opacity="0.55"/><path d="M0 ${h * 0.82} L${w * 0.34} ${h / 2} L${w * 0.6} ${h * 0.75} L${w * 0.81} ${h * 0.57} L${w} ${h * 0.75} L${w} ${h} L0 ${h}Z" fill="${ink}"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
function logo(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#ffffff"/><circle cx="100" cy="100" r="78" fill="#1f7a5c"/><path d="M60 120 L100 60 L140 120Z" fill="#ffffff"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const params = new URLSearchParams(location.search)
if (params.get("dark")) document.documentElement.setAttribute("data-sl-dark", "")
const ID = "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"
const one = !!params.get("members")
const COVER = picture("#d9c7a7", "#8b6b47", 1600, 900)
const LOGO = logo()
const DESCRIPTION = params.get("plain")
  ? "A small club of people who build with wood.\n\nWe post what we made and meet on Saturdays."
  : `<h2>Build one thing a week</h2><p>A small club of people who build with wood. We post what we made, ask for help when a joint will not close, and meet on <strong>Saturdays</strong> 🪵.</p><ul><li>A weekly build prompt</li><li>Live Q&amp;A with a cabinet maker</li></ul><p><img src="${picture("#c9d6c3", "#4f6b4a")}" alt="Bench" data-size="medium"></p><p>New here? Read <a href="https://example.com/start">the starter guide</a>.</p>`

const head: CommunityHead = {
  id: ID,
  slug: "salajanywood",
  name: "SalajanyWood Woodworking Club",
  tagline: "Make one thing a week, together.",
  logoUrl: LOGO,
  coverUrl: COVER,
  status: "published",
  access: "free",
  visibility: "public",
  memberCount: one ? 1 : 1284,
  postCount: 3412,
  archived: false,
  suspended: false,
  gamificationEnabled: true,
  classroomEnabled: false,
  eventsEnabled: true,
  role: "owner",
  can: allowedActions("owner"),
  openReports: 0,
}

const links = [
  { label: "Instagram", url: "https://www.instagram.com/salajanywood" },
  { label: "YouTube", url: "https://www.youtube.com/@salajanywood" },
  { label: "salajanywood.com", url: "https://salajanywood.com" },
]
const gallery = [
  { type: "image" as const, url: picture("#c9d6c3", "#4f6b4a") },
  { type: "image" as const, url: picture("#d6cfe0", "#5b5470") },
]
const look = cleanLook({ coverX: 50, coverY: 30, joinLabel: "Join for free", joinStyle: "brand", joinNote: "No card needed", brand: "#1f7a5c" })

const settings: SettingsData = {
  description: DESCRIPTION,
  descriptionHtml: DESCRIPTION,
  pageLook: look,
  tagline: head.tagline,
  category: "Crafts",
  rules: [],
  faq: [{ q: "Do I need tools?", a: "A saw, a chisel and a square are enough to start." }],
  benefits: ["A build prompt every Monday", "Saturday calls", "Plans for every project"],
  links,
  onboarding: {},
  discoveryEnabled: true,
  platformHidden: false,
  approvalRequired: false,
  directoryEnabled: true,
  chatEnabled: true,
  seoTitle: null,
  seoDescription: null,
  tiers: [],
  products: [],
  paymentsReady: true,
  myNotify: { level: "important", emailAnnouncements: true, emailEvents: true },
  levels: [],
  badges: [],
  gallery,
  galleryReady: true,
  galleryVideos: {},
  roles: null,
  policies: null,
}

const faces = ["Ana Popescu", "Marcus Lee", "Priya Raman", "Tomás Herrera", "Elena Ionescu"].map((name, i) => ({ id: `u${i}`, name, avatarUrl: i % 2 ? picture(["#e6d0cb", "#c9d6c3", "#d6cfe0"][i % 3], "#5b5470", 96, 96) : null }))
const freeOption = { tierId: "t0", name: "Members", description: null, kind: "free" as const, billing: null, productId: null, monthlyCents: null, yearlyCents: null, priceCents: null, currency: "usd", priceLine: "Free", benefits: [], checkout: null }

const sales: SalesPageData = {
  community: {
    id: ID,
    slug: head.slug,
    name: head.name,
    tagline: head.tagline,
    logoUrl: LOGO,
    coverUrl: COVER,
    category: "Crafts",
    visibility: "public",
    access: "free",
    status: "published",
    approvalRequired: false,
    memberCount: head.memberCount,
    descriptionHtml: params.get("plain") ? null : DESCRIPTION,
    descriptionText: params.get("plain") ? DESCRIPTION : null,
    benefits: settings.benefits,
    rules: [],
    faq: settings.faq,
    creator: { name: "Andrei Salajan", username: "andrei", avatarUrl: null, href: "/@andrei" },
    options: [freeOption],
    accessProducts: [],
    reviews: null,
    url: `/community/${head.slug}`,
    address: `storelib.com/community/${head.slug}`,
    gallery,
    stats: { members: head.memberCount, online: one ? 0 : 12, admins: one ? 1 : 3 },
    links: socialLinksOf(links),
    coverPosition: "50% 30%",
    joinLook: joinLookOf(look),
  },
  join: { kind: "join_free", signedIn: false, label: "Join", option: freeOption, href: `/login?next=/community/${head.slug}?join=1`, note: null, isOwner: false, canLeave: false, manageHref: null, role: null, status: null },
  notice: null,
  extras: { activity: { posts30: 40, active7: 210, since: "2025-03-02T00:00:00Z" }, classroom: null, creatorBio: "I make chairs.", faces: one ? faces.slice(0, 1) : faces },
  askWhy: false,
}

function App() {
  const state = React.useSyncExternalStore(probe.subscribe, probe.get)
  if (state.pathname.startsWith("/app/")) {
    return (
      <div className="h-svh overflow-hidden bg-[#131316]">
        <AppHistoryTracker />
        <header data-shell-chrome="" data-probe-app-header="" className="fixed inset-x-0 top-0 z-50 h-[68px] bg-[#131316] md:h-[58px]" />
        <aside data-shell-chrome="" data-probe-app-rail="" className="fixed bottom-0 left-0 top-[58px] z-40 hidden w-[240px] bg-[#131316] md:block" />
        <div data-app-nav-pill="" className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex justify-center pb-4 md:hidden">
          <span className="h-14 w-60 rounded-full bg-[#131316]" />
        </div>
        <main className="h-svh overflow-hidden bg-[#f8f9fa] pt-[68px] md:bg-white md:pl-[240px] md:pt-[58px]">
          <div className="app-content-scroll h-[calc(100svh-68px)] overflow-hidden md:h-[calc(100svh-58px)]">
            <ToastHost>
              <CommunityShell head={head}>
                <SectionSeed id="overview">
                  <div data-probe-overview="" className="space-y-4">
                    {Array.from({ length: 12 }, (_, i) => (
                      <section key={i} className="h-40 rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 text-[14px] text-[#6b7280]">
                        Overview card {i + 1}
                      </section>
                    ))}
                  </div>
                </SectionSeed>
                <SectionSeed id="page">
                  {params.get("frame") ? <SectionFrame id="page" facts={{ title: head.name }} /> : <PageEditor head={head} data={settings} preview={sales} creatorId="c1" />}
                </SectionSeed>
              </CommunityShell>
            </ToastHost>
          </div>
        </main>
      </div>
    )
  }
  return (
    <PreviewChrome community={sales.community}>
      <CommunitySalesPage data={sales} />
    </PreviewChrome>
  )
}

createRoot(document.getElementById("app")!).render(<App />)
