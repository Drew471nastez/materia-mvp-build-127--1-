/**
 * ROUND 26 (W1): the creator's community cards and a community's states, for scripts/check-cards-round26.mjs.
 *
 *   /app/community                          the real list (components/community/creator/community-list.tsx): published
 *                                           with a cover and money, published with a logo, a draft, archived, one whose
 *                                           deletion is scheduled for November 5, and a long name; ?plan=free says
 *                                           "1 of 2 communities" with the one being deleted not counted
 *   /app/community/<slug>/settings?tab=advanced&state=draft|published|archived|deleting
 *                                           the real shell and Settings, Publish and archive, with the header's badge
 *
 * The router is the probe's stand-in (next/navigation stub); the delete card's plan comes from the probe's answer to
 * GET /api/app/community/<id>/delete.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { allowedActions } from "@/lib/communities/permissions"
import { CommunityShell, SectionSeed } from "@/components/community/creator/community-shell"
import { SettingsSection } from "@/components/community/creator/settings-section"
import { CommunityList } from "@/components/community/creator/community-list"
import { settingsTabAsked, settingsTabOf } from "@/components/community/creator/logic"
import type { CommunityHead, CommunityListRow, SettingsData } from "@/components/community/creator/view-types"

function picture(ground: string, ink: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="${ground}"/><circle cx="470" cy="130" r="56" fill="${ink}" opacity="0.55"/><path d="M0 330 L220 200 L380 300 L520 230 L640 300 L640 400 L0 400Z" fill="${ink}"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
function logo(ground: string, ink: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="${ground}"/><circle cx="48" cy="48" r="26" fill="${ink}"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const params = new URLSearchParams(location.search)
const NOW = Date.now()
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString()
const NOV5 = new Date(Date.UTC(2026, 10, 5, 12)).toISOString()

const row = (i: number, over: Partial<CommunityListRow>): CommunityListRow => ({
  id: `c${i}`,
  slug: `c${i}`,
  name: "Community",
  logoUrl: null,
  status: "published",
  access: "free",
  visibility: "public",
  memberCount: 120 * (i + 1),
  postCount: 40,
  role: "owner",
  priceLine: "Free",
  createdAt: ago(i * 10),
  coverUrl: null,
  tagline: "Make one thing a week, together.",
  mrrCents: null,
  currency: "usd",
  archived: false,
  deleting: null,
  can: { edit: true, analytics: true, archive: true, duplicate: true },
  ...over,
})

const LIST: CommunityListRow[] = [
  row(0, { name: "SalajanyWood Woodworking Club", coverUrl: picture("#d9c7a7", "#8b6b47"), logoUrl: picture("#c9a87a", "#6b4a2b"), access: "paid", mrrCents: 2_183_400, priceLine: "$19/month" }),
  row(1, { name: "Morning Pages", logoUrl: logo("#0f766e", "#f59e0b") }),
  row(2, { name: "Trail Runners Cluj", status: "draft", logoUrl: logo("#1d4ed8", "#e11d48") }),
  row(3, { name: "Old Photo Restorers", archived: true, status: "archived", logoUrl: logo("#b45309", "#fde68a") }),
  row(4, { name: "Night Shift Writers", archived: true, status: "archived", coverUrl: picture("#c9d6c3", "#4f6b4a"), deleting: { deleteAt: NOV5, canKeep: true } }),
  row(5, { name: "The Very Long Named Community For Weekend Furniture Restoration Enthusiasts", tagline: null, priceLine: "Free" }),
]

const state = params.get("state") || "published"
const head: CommunityHead = {
  id: "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a",
  slug: "nightshift",
  name: "Night Shift Writers",
  tagline: "Write at night, together.",
  logoUrl: logo("#0f766e", "#f59e0b"),
  coverUrl: picture("#c9d6c3", "#4f6b4a"),
  status: state === "draft" ? "draft" : state === "published" ? "published" : "archived",
  access: "paid",
  visibility: "public",
  memberCount: 214,
  postCount: 980,
  archived: state === "archived" || state === "deleting",
  suspended: false,
  deleting: state === "deleting" ? { deleteAt: NOV5, canKeep: true } : null,
  gamificationEnabled: false,
  classroomEnabled: false,
  eventsEnabled: false,
  role: "owner",
  can: allowedActions("owner"),
  openReports: 0,
}

const settings = {
  description: "",
  tagline: head.tagline,
  category: "Writing",
  rules: [],
  faq: [],
  benefits: [],
  links: [],
  onboarding: { enabled: false, welcome: "", askIntro: false, showRules: false },
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
  gallery: [],
  galleryReady: true,
  galleryVideos: {},
  roles: { ready: true, admin: {}, moderator: {} },
  policies: { ready: true, refundPolicy: "", contactEmail: "", contactEmailPublic: false },
} as unknown as SettingsData

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-svh overflow-hidden bg-[#131316]">
      <header className="fixed inset-x-0 top-0 z-30 h-[68px] bg-[#131316] md:h-[58px]" />
      <aside className="fixed bottom-0 left-0 top-[58px] hidden w-[240px] bg-[#131316] md:block" />
      <main className="h-svh overflow-hidden bg-[#f8f9fa] pt-[68px] md:bg-white md:pl-[240px] md:pt-[58px]">
        <div className="app-content-scroll h-[calc(100svh-68px)] overflow-hidden md:h-[calc(100svh-58px)]">{children}</div>
      </main>
    </div>
  )
}

function App() {
  if (location.pathname === "/app/community") {
    const free = params.get("plan") === "free"
    return (
      <Frame>
        <CommunityList available rows={LIST} limit={free ? { max: 2, owned: 1 } : { max: null, owned: 5 }} />
      </Frame>
    )
  }
  return (
    <Frame>
      <CommunityShell head={head}>
        <SectionSeed id="settings">
          <SettingsSection head={head} data={settings} tab={settingsTabOf("advanced")} asked={settingsTabAsked("advanced")} />
        </SectionSeed>
      </CommunityShell>
    </Frame>
  )
}

createRoot(document.getElementById("app")!).render(<App />)
