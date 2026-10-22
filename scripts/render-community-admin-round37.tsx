/**
 * ROUND 37: the community admin as the owner moves through it, for scripts/check-community-admin-round37.mjs (every tab
 * in order and back, filmed). The round 33 harness below with every section real: Page is the real Page editor
 * (components/community/creator/page-editor, the fixtures of scripts/render-page-editor-round33.tsx) and Learn the real
 * builder (components/community/learn/learn-builder.tsx), Learn switched on so its tab is in the row, and <html> carries
 * the app's class (app-layout), so the pane has the scrollbar /app gives it.
 *
 * ROUND 33: the community admin for scripts/check-community-admin-round33.mjs, the round 32 harness below with
 *
 *   /app/community                 the real list of cards (components/community/creator/community-list.tsx): a
 *                                  community with a cover, one with a logo and no cover, one with neither, a draft and
 *                                  an archived one
 *   /app/community/<slug>/page     an editor page standing in for the Page section (its worker builds the real one):
 *                                  long cards and the editor's save bar (./parts EditorFoot with a status, always up)
 *   ?nologo=1                      the community has no logo (the header's letter on the name's gradient)
 *
 * ROUND 32: the community admin's Overview and Settings for scripts/check-community-admin-round32.mjs, the round 31
 * harness (./render-community-admin-round31.tsx) with an overview that has setup left and recent activity, a settings
 * owner with roles and policies, and ?empty=1 for a community with no gallery yet.
 *
 * The community admin shell of round 31 for scripts/check-community-admin-round31.mjs: the real shell
 * (components/community/creator/community-shell.tsx) and the real sections, each wrapped in its SectionSeed the way its
 * page.tsx wraps it, inside a stand-in for the /app frame (the rail and header on a computer, the header and the
 * navigation pill on a phone).
 *
 * A stand-in for the router lives in the probe's next/navigation stub (window.__probeRouter): router.push answers after
 * ?delay= ms (450 by default) with the section's page, router.refresh draws the page at the address again after the same
 * wait, history.pushState moves the address and nothing else, as Next does. Every router call is logged in
 * window.__router, so the probe can tell a section the shell showed from one the "server" sent.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { allowedActions } from "@/lib/communities/permissions"
import { CommunityShell, SectionSeed } from "@/components/community/creator/community-shell"
import { Overview } from "@/components/community/creator/overview"
import { MembersSection } from "@/components/community/creator/members-section"
import { SettingsSection } from "@/components/community/creator/settings-section"
import { FeedSection } from "@/components/community/creator/feed-section"
import { EventsSection } from "@/components/community/creator/events-section"
import { ModerationSection } from "@/components/community/creator/moderation-section"
import { AnalyticsSection } from "@/components/community/creator/analytics-section"
import { SpacesSection } from "@/components/community/creator/spaces-section"
import { PERMISSION_GROUPS } from "@/lib/communities/permissions"
import { CommunityList } from "@/components/community/creator/community-list"
import { PageEditor } from "@/components/community/creator/page-editor/page-editor"
import { LearnBuilder } from "@/components/community/learn/learn-builder"
import type { SalesPageData } from "@/components/community/public/types"
import { joinLookOf, cleanLook } from "@/lib/communities/page-look"
import { socialLinksOf } from "@/lib/communities/social-links"
import type { CommunityListRow } from "@/components/community/creator/view-types"
import { adminSectionOf, nextSteps, settingsTabAsked, settingsTabOf } from "@/components/community/creator/logic"
import type { AnalyticsView, CommunityHead, MemberRowView, SettingsData } from "@/components/community/creator/view-types"

type ProbeRouter = { subscribe: (f: () => void) => () => void; get: () => { routed: string; v: number } }
const probe = (window as unknown as { __probeRouter: ProbeRouter }).__probeRouter

function picture(ground: string, ink: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="${ground}"/><circle cx="470" cy="130" r="56" fill="${ink}" opacity="0.55"/><path d="M0 330 L220 200 L380 300 L520 230 L640 300 L640 400 L0 400Z" fill="${ink}"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
const params = new URLSearchParams(location.search)
document.documentElement.classList.add("app-layout")
const ID = "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"
const NOW = Date.now()
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString()
const ahead = (d: number) => new Date(NOW + d * 86_400_000).toISOString()

const head: CommunityHead = {
  id: ID,
  slug: "salajanywood",
  name: params.get("name") || "SalajanyWood Woodworking Club",
  tagline: "Make one thing a week, together.",
  logoUrl: params.get("nologo") ? null : picture("#c9a87a", "#6b4a2b"),
  coverUrl: picture("#d9c7a7", "#8b6b47"),
  status: params.get("draft") ? "draft" : "published",
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

const names = ["Ana Popescu", "Marcus Lee", "Priya Raman", "Tomás Herrera", "Elena Ionescu", "Jonah Brooks", "Sofia Rossi", "Kenji Watanabe", "Amara Okafor", "Lukas Novak", "Chloé Martin", "Daniel Avram"]
const member = (i: number, over: Partial<MemberRowView> = {}): MemberRowView => ({
  userId: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  name: names[i % names.length],
  username: names[i % names.length].toLowerCase().split(" ")[0],
  avatarUrl: null,
  email: `${names[i % names.length].toLowerCase().split(" ")[0]}@example.com`,
  role: i === 0 ? "owner" : i === 1 ? "admin" : i === 2 ? "moderator" : "member",
  status: "active",
  source: i % 3 === 0 ? "subscription" : i % 3 === 1 ? "free" : "manual",
  tierId: "t1",
  tierName: i % 2 ? "Members" : "Inner circle",
  level: 1 + (i % 5),
  points: 12 * i,
  joinedAt: ago(i * 3 + 1),
  requestedAt: null,
  requestNote: null,
  lastActiveAt: ago(i * 0.3),
  mutedUntil: i === 5 ? ahead(1) : null,
  approved: false,
  ...over,
})

const settings: SettingsData = {
  description: "A small club of people who build with wood.\n\nWe post what we made and meet on Saturdays.",
  tagline: head.tagline,
  category: "Crafts",
  rules: [{ title: "Be kind", body: "Feedback is about the words, never the person." }],
  faq: [{ q: "Do I need to be a writer?", a: "No. You need to want to write." }],
  benefits: ["A prompt every morning", "Friday feedback calls", "The 30 day course"],
  links: [],
  onboarding: { enabled: true, welcome: "Glad you are here.", askIntro: true, showRules: true },
  discoveryEnabled: true,
  platformHidden: false,
  approvalRequired: false,
  directoryEnabled: true,
  chatEnabled: true,
  seoTitle: null,
  seoDescription: null,
  tiers: [
    { trialDays: 0, id: "t1", name: "Members", description: null, kind: "paid", billing: "recurring", isDefault: true, archived: false, productId: "p1", productStatus: "published", monthlyCents: 1900, yearlyCents: 19000, priceCents: null, priceLine: "$19/month", benefits: [], members: 1201, accessProducts: [{ id: "p9", title: "The 30 day writing course", type: "course" }] },
    { trialDays: 0, id: "t2", name: "Lifetime", description: null, kind: "paid", billing: "one_time", isDefault: false, archived: false, productId: "p2", productStatus: "published", monthlyCents: null, yearlyCents: null, priceCents: 29900, priceLine: "$299", benefits: [], members: 83, accessProducts: [] },
  ],
  products: [{ id: "p8", title: "Prompt deck", type: "digital", status: "published", cover: null }],
  paymentsReady: true,
  myNotify: { level: "important", emailAnnouncements: true, emailEvents: true },
  levels: [
    { level: 1, name: "Newcomer", minPoints: 0, reward: null },
    { level: 2, name: "Regular", minPoints: 20, reward: null },
    { level: 3, name: "Contributor", minPoints: 60, reward: null },
  ],
  badges: [],
  gallery: params.get("empty") ? [] : [
    { type: "image", url: picture("#d9c7a7", "#8b6b47") },
    { type: "video", videoId: "11111111-1111-4111-8111-111111111111" },
    { type: "image", url: picture("#c9d6c3", "#4f6b4a") },
    { type: "image", url: picture("#d6cfe0", "#5b5470") },
    { type: "image", url: picture("#e6d0cb", "#8a4a3f") },
  ],
  galleryReady: params.get("gallery") !== "missing",
  /* Round 37: read with the page, as settingsReads does. */
  joinForm: { ready: true, questions: [] },
  galleryVideos: { "11111111-1111-4111-8111-111111111111": { status: "ready", thumbnailUrl: null, durationSeconds: 94 } },
  roles: { ready: true, admin: Object.fromEntries(PERMISSION_GROUPS.map((g) => [g.key, true])) as never, moderator: Object.fromEntries(PERMISSION_GROUPS.map((g, i) => [g.key, i < 2])) as never },
  policies: { ready: true, refundPolicy: "Cancel any time and keep access until the end of the period you paid for.", contactEmail: "club@salajanywood.com", contactEmailPublic: true },
}

const series = (n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => ({ day: new Date(NOW - (n - i) * 86_400_000).toISOString().slice(0, 10), value: Math.max(0, Math.round(f(i))) }))
const analytics: AnalyticsView = {
  days: 30,
  today: new Date(NOW).toISOString().slice(0, 10),
  series: {
    members: series(30, (i) => 1100 + i * 6 + (i % 4)),
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
}


/* The Page editor's fixtures (scripts/render-page-editor-round33.tsx). */
const links = [
  { label: "Instagram", url: "https://www.instagram.com/salajanywood" },
  { label: "salajanywood.com", url: "https://salajanywood.com" },
]
const look = cleanLook({ coverX: 50, coverY: 30, joinLabel: "Join for free", joinStyle: "brand", joinNote: "No card needed", brand: "#1f7a5c" })
const DESCRIPTION = `<h2>Build one thing a week</h2><p>A small club of people who build with wood. We post what we made and meet on <strong>Saturdays</strong>.</p><ul><li>A weekly build prompt</li><li>Live Q&amp;A with a cabinet maker</li></ul>`
const pageSettings: SettingsData = { ...settings, description: DESCRIPTION, descriptionHtml: DESCRIPTION, pageLook: look, links } as SettingsData
const freeOption = { tierId: "t0", name: "Members", description: null, kind: "free" as const, billing: null, productId: null, monthlyCents: null, yearlyCents: null, priceCents: null, currency: "usd", priceLine: "Free", benefits: [], checkout: null }
const sales: SalesPageData = {
  community: {
    id: ID, slug: head.slug, name: head.name, tagline: head.tagline, logoUrl: head.logoUrl, coverUrl: head.coverUrl, category: "Crafts", visibility: "public", access: "free", status: "published", approvalRequired: false, memberCount: head.memberCount,
    descriptionHtml: DESCRIPTION, descriptionText: null, benefits: settings.benefits, rules: [], faq: settings.faq,
    creator: { name: "Andrei Salajan", username: "andrei", avatarUrl: null, href: "/@andrei" },
    options: [freeOption], accessProducts: [], reviews: null, url: `/community/${head.slug}`, address: `storelib.com/community/${head.slug}`,
    gallery: settings.gallery.filter((g) => g.type === "image"), stats: { members: head.memberCount, online: 12, admins: 3 }, links: socialLinksOf(links), coverPosition: "50% 30%", joinLook: joinLookOf(look),
  },
  join: { kind: "join_free", signedIn: false, label: "Join", option: freeOption, href: `/login?next=/community/${head.slug}?join=1`, note: null, isOwner: false, canLeave: false, manageHref: null, role: null, status: null },
  notice: null,
  extras: { activity: { posts30: 40, active7: 210, since: "2025-03-02T00:00:00Z" }, classroom: null, creatorBio: "I make chairs.", faces: [] },
  askWhy: false,
} as SalesPageData
const learn = {
  communityId: ID, slug: head.slug, ready: true, enabled: true, currency: "usd", canSell: true,
  programs: [
    { members: [], id: "pg1", kind: "program" as const, productId: null, title: "The 30 day build", summary: "", coverUrl: picture("#d9c7a7", "#8b6b47"), status: "published" as const, mode: "free" as const, level: 1, priceCents: null, currency: "usd", dripDays: null, lessons: 30, buyers: 0, editHref: null },
    { members: [], id: "pg2", kind: "program" as const, productId: null, title: "Joinery basics", summary: "", coverUrl: null, status: "draft" as const, mode: "level" as const, level: 2, priceCents: null, currency: "usd", dripDays: null, lessons: 8, buyers: 0, editHref: null },
    { members: [], id: "pg3", kind: "program" as const, productId: null, title: "Finishing outdoors", summary: "", coverUrl: picture("#c9d6c3", "#4f6b4a"), status: "published" as const, mode: "paid" as const, level: 1, priceCents: 4900, currency: "usd", dripDays: null, lessons: 14, buyers: 23, editHref: null },
  ],
  levels: [{ level: 1, name: "Newcomer" }, { level: 2, name: "Regular" }],
  courses: [{ id: "c9", title: "Sharpening", coverUrl: null, status: "published" }],
}

const members = Array.from({ length: 12 }, (_, i) => member(i))
const BASE = `/app/community/${head.slug}`

/** The page the "server" draws for an address, wrapped as its page.tsx wraps it. `v` is the draw: a refresh draws new objects. */
function pageFor(path: string, v: number): React.ReactNode {
  const url = new URL(path, location.origin)
  const q = url.searchParams
  const id = adminSectionOf(url.pathname)
  const fresh = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T
  switch (id) {
    case "page":
      return (
        <SectionSeed id="page">
          <PageEditor head={head} data={pageSettings} preview={sales} creatorId="c1" />
        </SectionSeed>
      )
    case "members":
      return (
        <SectionSeed id="members" stamp={q.get("invite") === "1" ? "invite" : ""}>
          <MembersSection head={head} meId={members[0].userId} initial={{ rows: fresh(members), next: "abc", capped: false }} counts={{ active: 1284 + v, pending: 4, muted: 1, paused: 1, banned: 2, removed: 0, expired: 37, cancelled: 12 }} status="active" tiers={[{ id: "t1", name: "Members", kind: "paid" }, { id: "t2", name: "Lifetime", kind: "paid" }]} canEmail invites={{ rows: [], next: null }} openInvite={q.get("invite") === "1"} badges={[]} />
        </SectionSeed>
      )
    case "settings":
      return (
        <SectionSeed id="settings">
          <SettingsSection head={head} data={fresh(settings)} tab={settingsTabOf(q.get("tab"))} asked={settingsTabAsked(q.get("tab"))} />
        </SectionSeed>
      )
    case "spaces":
      return (
        <SectionSeed id="spaces">
          <SpacesSection
            head={head}
            options={{ tiers: [{ id: "t1", name: "Members" }, { id: "t2", name: "Lifetime" }], levels: settings.levels }}
            initial={[
              { id: "s1", slug: "general", name: "General", description: "Say hello", icon: null, kind: "feed", position: 0, postRole: "member", commentsEnabled: true, viewAccess: {}, archived: false, posts: 2810 },
              { id: "s2", slug: "announcements", name: "Announcements", description: null, icon: null, kind: "announcements", position: 1, postRole: "admin", commentsEnabled: true, viewAccess: {}, archived: false, posts: 42 },
              { id: "s3", slug: "chat", name: "Shop talk", description: null, icon: null, kind: "chat", position: 2, postRole: "member", commentsEnabled: true, viewAccess: {}, archived: false, posts: 9120 },
            ]}
          />
        </SectionSeed>
      )
    case "feed":
      return (
        <SectionSeed id="feed" stamp={q.get("compose") ? `compose:${q.get("compose")}` : ""}>
          <FeedSection
            head={head}
            spaces={[{ id: "s1", name: "General", announcements: false }, { id: "s2", name: "Announcements", announcements: true }]}
            compose={q.get("compose")}
            scheduled={{ rows: [], ready: true, media: true, spaces: [] }}
            initial={{
              next: null,
              rows: [
                { id: "p1", kind: "announcement", title: "Saturday build moves to 10am", excerpt: "From this week the build starts an hour earlier.", spaceName: "Announcements", authorName: "Ana Popescu", pinned: true, locked: false, featured: false, status: "published", reactionCount: 48, commentCount: 12, createdAt: ago(0.2) },
                { id: "p2", kind: "post", title: null, excerpt: "Finished the walnut stool. Three coats of oil, one week of waiting.", spaceName: "General", authorName: "Marcus Lee", pinned: false, locked: false, featured: true, status: "published", reactionCount: 21, commentCount: 4, createdAt: ago(0.6) },
              ],
            }}
          />
        </SectionSeed>
      )
    case "classroom":
      return (
        <SectionSeed id="classroom">
          <LearnBuilder communityId={ID} initial={learn} />
        </SectionSeed>
      )
    case "events":
      return (
        <SectionSeed id="events" stamp={q.get("new") === "1" ? "new" : ""}>
          <EventsSection head={head} options={{ tiers: [{ id: "t1", name: "Members" }], levels: settings.levels }} openNew={q.get("new") === "1"} initial={{
              upcoming: [
                { id: "e1", title: "Saturday build", description: "", coverUrl: null, kind: "live", startsAt: ahead(2), endsAt: new Date(Date.parse(ahead(2)) + 3_600_000).toISOString(), timezone: "Europe/Bucharest", location: null, meetingUrl: "https://zoom.us/j/1", livestreamUrl: null, capacity: 100, goingCount: 64, access: {}, replayVideoId: null, status: "scheduled", priceCents: null, currency: null, salesCloseAt: null, refundWindowHours: null, refundPolicy: null, ticketsSold: 0, money: null },
                { id: "e2", title: "Finishing workshop", description: "", coverUrl: null, kind: "workshop", startsAt: ahead(9), endsAt: new Date(Date.parse(ahead(9)) + 7_200_000).toISOString(), timezone: "Europe/Bucharest", location: null, meetingUrl: "https://zoom.us/j/2", livestreamUrl: null, capacity: 30, goingCount: 18, access: {}, replayVideoId: null, status: "scheduled", priceCents: 2500, currency: "usd", salesCloseAt: null, refundWindowHours: 24, refundPolicy: null, ticketsSold: 18, money: { sold: 18, invited: 2, grossCents: 45000, refundedCents: 0, currency: "usd" } },
              ],
              past: [],
              tickets: { ready: true, canSell: true, currency: "usd", communityPolicy: null },
            } as never}
          />
        </SectionSeed>
      )
    case "moderation":
      return (
        <SectionSeed id="moderation">
          <ModerationSection head={head} meId={members[0].userId} initialTab="reports" rules={[{ title: "Be kind", body: "Feedback is about the work, never the person." }]} restricted={null} tiers={[]} slowMode={300} initialAudit={{ next: null, rows: [] }} initialReports={{ next: null, rows: [] }} />
        </SectionSeed>
      )
    case "analytics":
      return (
        <SectionSeed id="analytics">
          <AnalyticsSection head={head} initial={fresh(analytics)} />
        </SectionSeed>
      )
    default:
      return (
        <SectionSeed id="overview" stamp={q.get("created") === "1" ? "created" : ""}>
          <Overview
            head={head}
            created={q.get("created") === "1"}
            data={{
              figures: { members: 1284, active30d: 702, new30d: 232, paidMembers: 1201, mrrCents: 2_183_400, currency: "usd", cancellations30d: 18, posts7d: 540, comments7d: 1650, openReports: 3, pendingRequests: 4 },
              upcoming: [{ id: "e1", title: "Saturday build", startsAt: ahead(2), endsAt: new Date(Date.parse(ahead(2)) + 3_600_000).toISOString(), timezone: "Europe/Bucharest", goingCount: 64, capacity: 100, kind: "live" }],
              sells: true,
              publicUrl: `/community/${head.slug}`,
              steps: nextSteps({ published: !params.get("draft"), paid: true, paymentsReady: true, members: 1284, invites: 2, posts: 40, courses: 0, events: 1, customized: !params.get("draft"), rules: params.get("draft") ? 0 : 1, classroomEnabled: false, eventsEnabled: true }, BASE),
              recent: params.get("quiet")
                ? []
                : [
                    { kind: "post", id: "post:p1", name: "Marcus Lee", avatarUrl: null, text: "Finished the walnut stool. Three coats of oil, one week of waiting, and it finally sits flat.", at: ago(0.05), href: "/community/salajanywood/post/finished-the-walnut-stool-aaaaaaaa" },
                    { kind: "join", id: "join:u2", name: "Priya Raman", avatarUrl: null, text: "", at: ago(0.2), href: `${BASE}/members` },
                    { kind: "post", id: "post:p2", name: "Ana Popescu", avatarUrl: null, text: "Saturday build moves to 10am", at: ago(0.6), href: "/community/salajanywood/post/saturday-build-bbbbbbbb" },
                    { kind: "join", id: "join:u3", name: "Tomás Herrera", avatarUrl: null, text: "", at: ago(1.2), href: `${BASE}/members` },
                    { kind: "post", id: "post:p3", name: "Elena Ionescu", avatarUrl: null, text: "Which finish for an oak table that lives outside?", at: ago(2), href: "/community/salajanywood/post/which-finish-cccccccc" },
                  ],
            }}
          />
        </SectionSeed>
      )
  }
}

const listRow = (i: number, over: Partial<CommunityListRow>): CommunityListRow => ({
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
  can: { edit: true, analytics: true, archive: true, duplicate: true },
  ...over,
})

/** Logos in strong brand colours, so the probe can tell the logo's gradient from the name's. */
function logo(ground: string, ink: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="${ground}"/><circle cx="48" cy="48" r="26" fill="${ink}"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const LIST: CommunityListRow[] = [
  listRow(0, { name: "SalajanyWood Woodworking Club", coverUrl: picture("#d9c7a7", "#8b6b47"), logoUrl: picture("#c9a87a", "#6b4a2b"), access: "paid", mrrCents: 2_183_400, priceLine: "$19/month" }),
  listRow(1, { name: "Morning Pages", logoUrl: logo("#0f766e", "#f59e0b") }),
  listRow(2, { name: "Trail Runners Cluj", status: "draft", logoUrl: logo("#1d4ed8", "#e11d48") }),
  listRow(3, { name: "Book Circle" }),
  listRow(4, { name: "Old Photo Restorers", archived: true, status: "archived", logoUrl: logo("#b45309", "#fde68a") }),
]

function App() {
  if (location.pathname === "/app/community") {
    return (
      <div className="h-svh overflow-hidden bg-[#131316]">
        <header className="fixed inset-x-0 top-0 z-30 h-[68px] bg-[#131316] md:h-[58px]" />
        <aside className="fixed bottom-0 left-0 top-[58px] hidden w-[240px] bg-[#131316] md:block" />
        <main className="h-svh overflow-hidden bg-[#f8f9fa] pt-[68px] md:bg-white md:pl-[240px] md:pt-[58px]">
          <div className="app-content-scroll h-[calc(100svh-68px)] overflow-hidden md:h-[calc(100svh-58px)]">
            <CommunityList available rows={LIST} limit={{ max: null, owned: 5 }} />
          </div>
        </main>
      </div>
    )
  }
  return <AdminApp />
}

function AdminApp() {
  const state = React.useSyncExternalStore(probe.subscribe, probe.get)
  /* The same objects until the "server" draws the page again, as an RSC payload is. */
  const page = React.useMemo(() => pageFor(state.routed, state.v), [state.routed, state.v])
  return (
    <div className="h-svh overflow-hidden bg-[#131316]">
      <header className="fixed inset-x-0 top-0 z-30 h-[68px] bg-[#131316] md:h-[58px]" />
      <aside className="fixed bottom-0 left-0 top-[58px] hidden w-[240px] bg-[#131316] md:block" />
      <main className="h-svh overflow-hidden bg-[#f8f9fa] pt-[68px] md:bg-white md:pl-[240px] md:pt-[58px]">
        <div className="app-content-scroll h-[calc(100svh-68px)] overflow-hidden md:h-[calc(100svh-58px)]">
          <CommunityShell head={head}>{page}</CommunityShell>
        </div>
      </main>
      {/* The phone's navigation pill, where the app draws it. */}
      <div data-app-nav-pill="" className="fixed bottom-[var(--app-nav-lift)] left-1/2 z-[45] h-[var(--app-nav-bar)] w-[var(--app-nav-width)] -translate-x-1/2 rounded-full bg-[#1a1a2e]/90 md:hidden" />
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<App />)
