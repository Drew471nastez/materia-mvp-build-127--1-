/**
 * Round 13's /app/community screens (worker A) for
 * scripts/check-community-admin13.mjs: the real components with fixture
 * props in a stand-in for the /app shell, picked by ?case=:
 *
 *   list            three cards: a paid one with a cover and its MRR, a draft
 *                   with no pictures, one the viewer moderates
 *   list-limit      the same on Free with two made: New community asks to upgrade
 *   create          New community (the product editor's layout)
 *   create-limit    New community opened at the limit: the upgrade sheet
 *   settings        the Page tab, two columns and the save foot
 *   roles           the owner's Roles tab
 *   policies        Rules and policies
 *   analytics       revenue, joins and invite links above the daily charts
 *   moderation      the queue with a join alarm, a held post and a report
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { allowedActions, roleGroups } from "@/lib/communities/permissions"
import { CommunityShell } from "@/components/community/creator/community-shell"
import { CommunityList } from "@/components/community/creator/community-list"
import { CreateCommunity } from "@/components/community/creator/create-flow"
import { SettingsSection } from "@/components/community/creator/settings-section"
import { ModerationSection } from "@/components/community/creator/moderation-section"
import { AnalyticsSection } from "@/components/community/creator/analytics-section"
import type { AnalyticsView, CommunityHead, CommunityListRow, SettingsData } from "@/components/community/creator/view-types"

const params = new URLSearchParams(location.search)
const which = params.get("case") || "list"
const ID = "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"
const NOW = Date.now()
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString()

/** A flat picture drawn here (no network in the probe). */
function picture(ground: string, ink: string, w = 800, h = 400): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${ground}"/><circle cx="${w * 0.72}" cy="${h * 0.32}" r="${h * 0.14}" fill="${ink}" opacity="0.5"/><path d="M0 ${h * 0.82} L${w * 0.34} ${h * 0.5} L${w * 0.6} ${h * 0.74} L${w * 0.8} ${h * 0.58} L${w} ${h * 0.74} L${w} ${h} L0 ${h}Z" fill="${ink}"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
function logo(ground: string, letter: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="${ground}"/><text x="48" y="62" font-family="Georgia,serif" font-size="44" fill="#fff" text-anchor="middle">${letter}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const head: CommunityHead = {
  id: ID,
  slug: "morning-writers",
  name: "The Morning Writers",
  tagline: "Write 500 words before breakfast, together.",
  logoUrl: logo("#7a5c3e", "M"),
  coverUrl: picture("#d9c7a7", "#8b6b47"),
  status: "published",
  access: "paid",
  visibility: "public",
  memberCount: 1284,
  postCount: 3412,
  archived: false,
  suspended: false,
  gamificationEnabled: true,
  classroomEnabled: true,
  eventsEnabled: true,
  role: "owner",
  can: allowedActions("owner"),
  openReports: 3,
}

const all = { edit: true, analytics: true, archive: true, duplicate: true }
const rows: CommunityListRow[] = [
  { id: ID, slug: "morning-writers", name: "The Morning Writers", tagline: "Write 500 words before breakfast, together.", logoUrl: logo("#7a5c3e", "M"), coverUrl: picture("#d9c7a7", "#8b6b47"), status: "published", access: "paid", visibility: "public", memberCount: 1284, postCount: 3412, role: "owner", priceLine: "$19/month", createdAt: ago(100), mrrCents: 2_183_400, currency: "usd", archived: false, can: all },
  { id: "x2", slug: "poetry-lab", name: "Poetry Lab", tagline: null, logoUrl: null, coverUrl: null, status: "draft", access: "free", visibility: "public", memberCount: 1, postCount: 0, role: "owner", priceLine: "Free", createdAt: ago(1), mrrCents: null, currency: "usd", archived: false, can: all },
  { id: "x3", slug: "studio-circle", name: "Studio Circle", tagline: "Weekly critiques for working illustrators", logoUrl: logo("#2f4858", "S"), coverUrl: picture("#c9d6c3", "#4f6b4a"), status: "published", access: "invite_only", visibility: "private", memberCount: 48, postCount: 220, role: "moderator", priceLine: "Invite only", createdAt: ago(300), mrrCents: null, currency: "usd", archived: false, can: { edit: false, analytics: false, archive: false, duplicate: false } },
  { id: "x4", slug: "old-club", name: "Old Book Club", tagline: "Kept to read", logoUrl: null, coverUrl: picture("#d6cfe0", "#5b5470"), status: "archived", access: "free", visibility: "public", memberCount: 312, postCount: 900, role: "owner", priceLine: "Free", createdAt: ago(600), mrrCents: null, currency: "usd", archived: true, can: all },
]

const settings: SettingsData = {
  description: "A small group of people who write every morning.\n\nWe post our words, read each other, and meet on Fridays.",
  tagline: head.tagline,
  category: "writing",
  rules: [
    { title: "Be kind", body: "Feedback is about the words, never the person." },
    { title: "Post your own words", body: "Share what you wrote." },
  ],
  faq: [{ q: "Do I need to be a writer?", a: "No. You need to want to write." }],
  benefits: ["A prompt every morning", "Friday feedback calls"],
  links: [],
  onboarding: { enabled: true, welcome: "Glad you are here.", askIntro: true, showRules: true },
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
  gallery: [
    { type: "image", url: picture("#d9c7a7", "#8b6b47") },
    { type: "image", url: picture("#c9d6c3", "#4f6b4a") },
  ],
  galleryReady: true,
  galleryVideos: {},
  roles: { ready: params.get("ready") !== "no", admin: roleGroups("admin", { admin: { analytics: false } }), moderator: roleGroups("moderator") },
  policies: { ready: params.get("ready") !== "no", refundPolicy: "Cancel any time and keep access until the end of the period you paid for.", contactEmail: "ana@morningwriters.co", contactEmailPublic: false },
}

const series = (n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => ({ day: new Date(NOW - (n - i) * 86_400_000).toISOString().slice(0, 10), value: Math.max(0, Math.round(f(i))) }))
const analytics: AnalyticsView = {
  days: 30,
  today: new Date(NOW).toISOString().slice(0, 10),
  series: {
    members: series(30, (i) => 1100 + i * 6),
    newMembers: series(30, (i) => 4 + ((i * 7) % 9)),
    activeMembers: series(30, (i) => 310 + ((i * 37) % 80)),
    posts: series(30, (i) => 60 + ((i * 13) % 45)),
    comments: series(30, (i) => 200 + ((i * 17) % 90)),
    reactions: series(30, (i) => 500 + ((i * 23) % 200)),
  },
  totals: { newMembers: 232, left: 41, posts: 2380, comments: 7110, reactions: 18240, rsvps: 316, lessons: 920 },
  live: { members: 1284, newToday: 6, postsToday: 41, commentsToday: 133 },
  rolledUp: true,
  topPosts: [{ id: "x1", title: "What I learned from 100 mornings", reactions: 212, comments: 48 }],
  money: {
    days: 30,
    revenue: {
      currency: "usd",
      mrrCents: 2_183_400,
      activeSubscribers: 1149,
      newSubscribers: 87,
      cancellations: 23,
      reasons: [
        { reason: "too_expensive", count: 9 },
        { reason: "not_using", count: 7 },
        { reason: "temporary", count: 4 },
        { reason: "other", count: 3 },
      ],
      latestCancellations: [],
      churnRate: 2.1,
      refunds: { count: 2, totalCents: 3800, currency: "usd" },
    },
    joins: {
      total: 232,
      bySource: [
        { source: "subscription", count: 87 },
        { source: "free", count: 70 },
        { source: "invite", count: 52 },
        { source: "purchase", count: 15 },
        { source: "manual", count: 8 },
      ],
      invites: [
        { id: "i1", label: "Link made Sep 2", uses: 31, revoked: false },
        { id: "i2", label: "Link made Aug 14", uses: 14, revoked: true },
        { id: "i3", label: "Invite to sam@example.com", uses: 1, revoked: false },
      ],
    },
    active: { last7: 512, last30: 702 },
  },
}

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
    <Frame path={`/app/community/${ID}${section ? `/${section}` : ""}`}>
      <CommunityShell head={head}>{children}</CommunityShell>
    </Frame>
  )
}

const subject = (n: number, name: string) => ({ userId: `00000000-0000-4000-8000-0000000000${n}`, name, role: "member" as const, member: { role: "member" as const, status: "active", source: "free", mutedUntil: null } })

function App() {
  switch (which) {
    case "list":
    case "list-limit":
      return (
        <Frame path="/app/community">
          <CommunityList available rows={rows} limit={which === "list-limit" ? { max: 2, owned: 3 } : { max: null, owned: 3 }} />
        </Frame>
      )
    case "create":
    case "create-limit":
      return (
        <Frame path="/app/community/new">
          <CreateCommunity limitReached={which === "create-limit"} />
        </Frame>
      )
    case "settings":
    case "roles":
    case "policies":
      return (
        <Shell section="settings">
          <SettingsSection head={head} data={settings} tab={which === "settings" ? "page" : which} />
        </Shell>
      )
    case "analytics":
      return (
        <Shell section="analytics">
          <AnalyticsSection head={head} initial={analytics} />
        </Shell>
      )
    default:
      return (
        <Shell section="moderation">
          <ModerationSection
            head={head}
            meId="00000000-0000-4000-8000-000000000001"
            initialTab="reports"
            rules={settings.rules}
            restricted={null}
            tiers={[]}
            slowMode={0}
            initialAudit={null}
            initialReports={{
              next: null,
              rows: [
                { id: "r0", targetType: "member", targetId: "00000000-0000-4000-8000-000000000090", reason: "other", note: "Join alarm: 40 people joined in 60 minutes, so new people now ask to join. Turn approval off in Settings, Access when it calms down.", status: "open", createdAt: ago(0.02), reporterName: null, preview: "", subject: subject(90, "Rae Jordan"), targetState: "published", resolution: null },
                { id: "r1", targetType: "post", targetId: "p3", reason: "spam", note: "Same post in every space", status: "open", createdAt: ago(0.1), reporterName: "Priya Raman", preview: "Buy my course, link in bio", subject: subject(99, "Spam Account"), targetState: "published", resolution: null },
                { id: "r3", targetType: "post", targetId: "p4", reason: "spam", note: "Held for review: a link that imitates a known brand (paypal)", status: "open", createdAt: ago(0.05), reporterName: null, preview: "Your payout is waiting, verify here https://paypa1-secure.com", subject: subject(97, "New Account"), targetState: "removed", resolution: null },
              ],
            }}
          />
        </Shell>
      )
  }
}

createRoot(document.getElementById("app")!).render(<App />)
