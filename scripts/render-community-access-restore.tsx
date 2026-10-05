/**
 * Round 14's two screens (worker C) for
 * scripts/check-community-access-restore.mjs: the real components with
 * fixture props in a stand-in for the /app shell, picked by ?case=:
 *
 *   access          Settings, Access: who can get in and what it costs, on a
 *                   private community with a paid tier
 *   access-free     the same card on a private free community
 *   members         Members, the Not active view: who took each person out,
 *                   when and why, with the undo on the row
 *   members-mod     the same view seen by a moderator: no undo of what
 *                   somebody ranked above them did
 *   members-active  the ordinary Active view, unchanged
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { allowedActions, roleGroups } from "@/lib/communities/permissions"
import { CommunityShell } from "@/components/community/creator/community-shell"
import { SettingsSection } from "@/components/community/creator/settings-section"
import { MembersSection } from "@/components/community/creator/members-section"
import type { CommunityHead, MemberPage, MemberRowView, SettingsData, TierView } from "@/components/community/creator/view-types"

const params = new URLSearchParams(location.search)
const which = params.get("case") || "access"
const ID = "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"
const ME = "00000000-0000-4000-8000-000000000001"
const NOW = Date.now()
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString()

function picture(ground: string, ink: string, w = 800, h = 400): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${ground}"/><path d="M0 ${h * 0.82} L${w * 0.34} ${h * 0.5} L${w * 0.62} ${h * 0.76} L${w} ${h * 0.6} L${w} ${h} L0 ${h}Z" fill="${ink}"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
function logo(ground: string, letter: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="${ground}"/><text x="48" y="62" font-family="Georgia,serif" font-size="44" fill="#fff" text-anchor="middle">${letter}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/* A private community that charges: the combination that could not exist before. */
const head: CommunityHead = {
  id: ID,
  slug: "studio-circle",
  name: "Studio Circle",
  tagline: "Weekly critiques for working illustrators.",
  logoUrl: logo("#2f4858", "S"),
  coverUrl: picture("#c9d6c3", "#4f6b4a"),
  status: "published",
  access: which === "access-free" ? "invite_only" : "paid",
  visibility: "private",
  memberCount: 148,
  postCount: 920,
  archived: false,
  suspended: false,
  gamificationEnabled: true,
  classroomEnabled: false,
  eventsEnabled: true,
  role: which === "members-mod" ? "moderator" : "owner",
  can: allowedActions(which === "members-mod" ? "moderator" : "owner"),
  openReports: 0,
}

const paidTier: TierView = {
  id: "t-paid",
  name: "Studio",
  description: "The weekly critique and the archive.",
  kind: "paid",
  billing: "recurring",
  isDefault: true,
  archived: false,
  productId: "p-studio",
  productStatus: "published",
  monthlyCents: 1900,
  yearlyCents: 19000,
  priceCents: null,
  priceLine: "$19/month",
  benefits: ["A critique every Friday", "The whole archive"],
  members: 141,
  accessProducts: [],
}
const freeTier: TierView = { ...paidTier, id: "t-free", name: "Members", description: null, kind: "free", billing: null, productId: null, productStatus: null, monthlyCents: null, yearlyCents: null, priceLine: "Free", benefits: [], members: 148 }

const settings: SettingsData = {
  description: "A small group of working illustrators who show each other what they are making.",
  tagline: head.tagline,
  category: "art",
  rules: [],
  faq: [],
  benefits: ["A critique every Friday"],
  links: [],
  onboarding: { enabled: true, welcome: "Glad you are here.", askIntro: true, showRules: true },
  discoveryEnabled: false,
  platformHidden: false,
  approvalRequired: false,
  directoryEnabled: true,
  chatEnabled: true,
  seoTitle: null,
  seoDescription: null,
  tiers: which === "access-free" ? [freeTier] : [paidTier],
  products: [],
  paymentsReady: true,
  myNotify: { level: "important", emailAnnouncements: true, emailEvents: true },
  levels: [],
  badges: [],
  gallery: [],
  galleryReady: true,
  galleryVideos: {},
  roles: { ready: true, admin: roleGroups("admin"), moderator: roleGroups("moderator") },
  policies: { ready: true, refundPolicy: "", contactEmail: "", contactEmailPublic: false },
}

/* ── Members ────────────────────────────────────────────────────────────── */

const member = (n: number, over: Partial<MemberRowView>): MemberRowView => ({
  userId: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`,
  name: "Member",
  username: `member${n}`,
  avatarUrl: null,
  email: `member${n}@example.com`,
  role: "member",
  status: "active",
  source: "free",
  tierId: "t-paid",
  tierName: "Studio",
  level: 3,
  points: 240,
  joinedAt: ago(200),
  requestedAt: null,
  requestNote: null,
  lastActiveAt: ago(2),
  mutedUntil: null,
  approved: true,
  acted: null,
  ...over,
})

const notActive: MemberRowView[] = [
  member(11, { name: "Rae Jordan", status: "banned", acted: { kind: "banned", byUserId: "a1", byName: "Ana Maker", byRole: "owner", at: ago(3), reason: "posting the same link in every space", until: null } }),
  member(12, { name: "Theo Park", status: "removed", source: "subscription", acted: { kind: "removed", byUserId: "a2", byName: "Bo Admin", byRole: "admin", at: ago(11), reason: null, until: null } }),
  member(13, { name: "Mira Sandoval", status: "paused", acted: { kind: "suspended", byUserId: ME, byName: "You", byRole: "owner", at: ago(1), reason: "a week off after the argument", until: null } }),
  member(14, { name: "Lev Ostrowski", status: "active", mutedUntil: new Date(NOW + 20 * 3_600_000).toISOString(), acted: { kind: "muted", byUserId: "00000000-0000-4000-8000-0000000000a4", byName: "Cy Mod", byRole: "moderator", at: ago(0.2), reason: "shouting", until: new Date(NOW + 20 * 3_600_000).toISOString() } }),
  member(15, { name: "Juno Fields", status: "removed", acted: { kind: "removed", byUserId: null, byName: null, byRole: null, at: ago(40), reason: null, until: null } }),
]

const active: MemberRowView[] = [
  member(21, { name: "Ana Maker", role: "owner", source: "owner" }),
  member(22, { name: "Bo Admin", role: "admin" }),
  member(23, { name: "Cy Mod", role: "moderator" }),
  member(24, { name: "Dee Maker", source: "subscription" }),
]

const page = (rows: MemberRowView[]): MemberPage => ({ rows, next: null, capped: false })

function Frame({ children, path }: { children: React.ReactNode; path: string }) {
  ;(window as unknown as { __path: string }).__path = path
  return (
    <div className="h-svh overflow-hidden bg-[#131316]">
      <header className="fixed inset-x-0 top-0 z-30 h-[68px] bg-[#131316] md:h-[58px]" />
      <aside className="fixed bottom-0 left-0 top-[58px] hidden w-[240px] bg-[#131316] md:block" />
      <main className="h-svh overflow-hidden bg-[#f8f9fa] pt-[68px] md:bg-white md:pl-[240px] md:pt-[58px]">
        <div className="app-content-scroll h-[calc(100svh-68px)] overflow-y-auto md:h-[calc(100svh-58px)]">{children}</div>
      </main>
    </div>
  )
}

function Shell({ children, section }: { children: React.ReactNode; section: string }) {
  return (
    <Frame path={`/app/community/${ID}/${section}`}>
      <CommunityShell head={head}>{children}</CommunityShell>
    </Frame>
  )
}

function App() {
  if (which === "members" || which === "members-mod" || which === "members-active") {
    const restricted = which !== "members-active"
    return (
      <Shell section="members">
        <MembersSection
          head={head}
          meId={which === "members-mod" ? "00000000-0000-4000-8000-0000000000a3" : ME}
          initial={page(restricted ? notActive : active)}
          counts={{ active: 148, pending: 2, restricted: notActive.length, paused: 1, banned: 1, removed: 2, muted: 1, expired: 0, cancelled: 4 }}
          status={restricted ? "restricted" : "active"}
          tiers={[{ id: "t-paid", name: "Studio", kind: "paid" }]}
          canEmail
          invites={{ rows: [], next: null }}
          openInvite={false}
          badges={[]}
        />
      </Shell>
    )
  }
  return (
    <Shell section="settings">
      <SettingsSection head={head} data={settings} tab="access" />
    </Shell>
  )
}

createRoot(document.getElementById("app")!).render(<App />)
