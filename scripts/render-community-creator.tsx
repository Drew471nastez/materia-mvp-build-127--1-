/**
 * The creator's community screens (components/community/creator/*) for
 * scripts/check-community-creator.mjs: the real components with fixture
 * props, inside a stand-in for the /app shell (the dark rail and header on
 * a computer, the header on a phone), picked by ?case=:
 *
 *   list, create, create-paid, overview, members, members-pending,
 *   settings (the Page tab, with its gallery), settings-access,
 *   settings-features, feed, events, spaces, classroom, moderation,
 *   moderation-restricted, moderation-rules, analytics
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { allowedActions } from "@/lib/communities/permissions"
import { CommunityShell } from "@/components/community/creator/community-shell"
import { CommunityList } from "@/components/community/creator/community-list"
import { CreateCommunity } from "@/components/community/creator/create-flow"
import { Overview } from "@/components/community/creator/overview"
import { LeaveReasonsCard } from "@/components/community/creator/leave-reasons-card"
import { MembersSection } from "@/components/community/creator/members-section"
import { SettingsSection } from "@/components/community/creator/settings-section"
import { FeedSection } from "@/components/community/creator/feed-section"
import { EventsSection } from "@/components/community/creator/events-section"
import { ModerationSection } from "@/components/community/creator/moderation-section"
import { AnalyticsSection } from "@/components/community/creator/analytics-section"
import { SpacesSection } from "@/components/community/creator/spaces-section"
import { ClassroomSection } from "@/components/community/creator/classroom-section"
import { nextSteps } from "@/components/community/creator/logic"
import type { AnalyticsView, CommunityHead, MemberRowView, SettingsData } from "@/components/community/creator/view-types"

const params = new URLSearchParams(location.search)

/** A flat picture drawn here (no network in the probe): a ground, a sun and a hill. */
function picture(ground: string, ink: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="${ground}"/><circle cx="470" cy="130" r="56" fill="${ink}" opacity="0.55"/><path d="M0 330 L220 200 L380 300 L520 230 L640 300 L640 400 L0 400Z" fill="${ink}"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
const which = params.get("case") || "overview"
const ID = "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"
const NOW = Date.now()
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString()
const ahead = (d: number) => new Date(NOW + d * 86_400_000).toISOString()

const head: CommunityHead = {
  id: ID,
  slug: "morning-writers",
  name: "The Morning Writers",
  tagline: "Write 500 words before breakfast, together.",
  logoUrl: null,
  coverUrl: null,
  status: which === "overview" ? "draft" : "published",
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
  description: "A small group of people who write every morning.\n\nWe post our words, read each other, and meet on Fridays.",
  tagline: head.tagline,
  category: "Writing",
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
  gallery: [
    { type: "image", url: picture("#d9c7a7", "#8b6b47") },
    { type: "video", videoId: "11111111-1111-4111-8111-111111111111" },
    { type: "image", url: picture("#c9d6c3", "#4f6b4a") },
    { type: "image", url: picture("#d6cfe0", "#5b5470") },
    { type: "image", url: picture("#e6d0cb", "#8a4a3f") },
  ],
  galleryReady: params.get("gallery") !== "missing",
  galleryVideos: { "11111111-1111-4111-8111-111111111111": { status: "ready", thumbnailUrl: null, durationSeconds: 94 } },
  roles: null,
  policies: null,
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

const members = Array.from({ length: 12 }, (_, i) => member(i))
const pending = Array.from({ length: 4 }, (_, i) => member(i + 3, { status: "pending", role: "member", requestedAt: ago(i), requestNote: i === 0 ? "I have been writing for a year and want company." : null, joinedAt: null }))

function App() {
  switch (which) {
    case "list":
      return (
        <Frame path="/app/community">
          <CommunityList
            available
            rows={[
              { id: ID, slug: "morning-writers", name: "The Morning Writers", logoUrl: null, status: "published", access: "paid", visibility: "public", memberCount: 1284, postCount: 3412, role: "owner", priceLine: "$19/month", createdAt: ago(100), tagline: null, coverUrl: null, mrrCents: null, currency: "usd", archived: false, can: { edit: true, analytics: true, archive: true, duplicate: true } },
              { id: "x2", slug: "poetry", name: "Poetry Lab", logoUrl: null, status: "draft", access: "free", visibility: "public", memberCount: 1, postCount: 0, role: "owner", priceLine: "Free", createdAt: ago(1), tagline: null, coverUrl: null, mrrCents: null, currency: "usd", archived: false, can: { edit: true, analytics: true, archive: true, duplicate: true } },
              { id: "x3", slug: "studio", name: "Studio Circle", logoUrl: null, status: "published", access: "invite_only", visibility: "private", memberCount: 48, postCount: 220, role: "moderator", priceLine: "Invite only", createdAt: ago(300), tagline: null, coverUrl: null, mrrCents: null, currency: "usd", archived: false, can: { edit: true, analytics: true, archive: true, duplicate: true } },
            ]}
            limit={{ max: null, owned: 2 }}
          />
        </Frame>
      )
    case "create":
    case "create-paid":
      return (
        <Frame path="/app/community/new">
          <CreateCommunity />
        </Frame>
      )
    case "members":
    case "members-pending":
      return (
        <Shell section="members">
          <MembersSection
            head={head}
            meId={members[0].userId}
            initial={{ rows: which === "members" ? members : pending, next: "abc", capped: false }}
            counts={{ active: 1284, pending: 4, muted: 1, paused: 1, banned: 2, removed: 0, expired: 37, cancelled: 12 }}
            status={which === "members" ? "active" : "pending"}
            tiers={[{ id: "t1", name: "Members", kind: "paid" }, { id: "t2", name: "Lifetime", kind: "paid" }]}
            canEmail
            invites={{ rows: [{ id: "i1", email: null, maxUses: 50, uses: 12, expiresAt: ahead(20), revokedAt: null, createdAt: ago(10), tierName: null }, { id: "i2", email: "sam@example.com", maxUses: 1, uses: 0, expiresAt: ahead(29), revokedAt: null, createdAt: ago(1), tierName: "Lifetime" }], next: null }}
            openInvite={params.get("invite") === "1"}
            badges={[]}
          />
        </Shell>
      )
    case "settings":
    case "settings-access":
    case "settings-features":
      return (
        <Shell section="settings">
          <SettingsSection head={head} data={settings} tab={which === "settings" ? "access" : which === "settings-access" ? "access" : "features"} />
        </Shell>
      )
    case "spaces":
      return (
        <Shell section="spaces">
          <SpacesSection
            head={head}
            options={{ tiers: [{ id: "t1", name: "Members" }, { id: "t2", name: "Lifetime" }], levels: settings.levels }}
            initial={[
              { id: "s1", slug: "general", name: "General", description: "Say hello", icon: null, kind: "feed", position: 0, postRole: "member", commentsEnabled: true, viewAccess: {}, archived: false, posts: 2810 },
              { id: "s2", slug: "announcements", name: "Announcements", description: null, icon: null, kind: "announcements", position: 1, postRole: "admin", commentsEnabled: true, viewAccess: {}, archived: false, posts: 42 },
              { id: "s3", slug: "chat", name: "Morning chat", description: null, icon: null, kind: "chat", position: 2, postRole: "member", commentsEnabled: true, viewAccess: {}, archived: false, posts: 9120 },
              { id: "s4", slug: "inner", name: "Inner circle", description: null, icon: "🔥", kind: "feed", position: 3, postRole: "member", commentsEnabled: true, viewAccess: { tierIds: ["t2"] }, archived: false, posts: 140 },
            ]}
          />
        </Shell>
      )
    case "classroom":
      return (
        <Shell section="classroom">
          <ClassroomSection
            head={head}
            options={{ tiers: [{ id: "t1", name: "Members" }, { id: "t2", name: "Lifetime" }], levels: settings.levels }}
            initial={{
              attached: [
                { productId: "c1", title: "The 30 day writing course", cover: picture("#d9c7a7", "#8b6b47"), status: "published", position: 0, access: {}, dripDays: null },
                { productId: "c2", title: "Editing your first draft", cover: null, status: "draft", position: 1, access: { tierIds: ["t2"] }, dripDays: 14 },
              ],
              available: [],
            }}
          />
        </Shell>
      )
    case "feed":
      return (
        <Shell section="feed">
          <FeedSection
            head={head}
            spaces={[{ id: "s1", name: "General", announcements: false }, { id: "s2", name: "Announcements", announcements: true }]}
            compose={null}
            initial={{
              next: null,
              rows: [
                { id: "p1", kind: "announcement", title: "Friday call moves to 6pm", excerpt: "From this week the call starts an hour later so more of you can make it.", spaceName: "Announcements", authorName: "Ana Popescu", pinned: true, locked: false, featured: false, status: "published", reactionCount: 48, commentCount: 12, createdAt: ago(0.2) },
                { id: "p2", kind: "post", title: null, excerpt: "Day 31. Wrote about my grandmother's kitchen. 640 words before the kettle boiled.", spaceName: "General", authorName: "Marcus Lee", pinned: false, locked: false, featured: true, status: "published", reactionCount: 21, commentCount: 4, createdAt: ago(0.6) },
                { id: "p3", kind: "post", title: "Buy my course", excerpt: "Link in bio", spaceName: "General", authorName: "Spam Account", pinned: false, locked: true, featured: false, status: "removed", reactionCount: 0, commentCount: 0, createdAt: ago(1) },
              ],
            }}
          />
        </Shell>
      )
    case "events":
      return (
        <Shell section="events">
          <EventsSection
            head={head}
            options={{ tiers: [{ id: "t1", name: "Members" }, { id: "t2", name: "Lifetime" }], levels: settings.levels }}
            openNew={params.get("new") === "1"}
            initial={{
              upcoming: [{ id: "e1", title: "Friday feedback call", description: "", coverUrl: null, kind: "live", startsAt: ahead(2), endsAt: new Date(Date.parse(ahead(2)) + 3_600_000).toISOString(), timezone: "Europe/Bucharest", location: null, meetingUrl: "https://zoom.us/j/1", livestreamUrl: null, capacity: 100, goingCount: 64, access: {}, replayVideoId: null, status: "scheduled", priceCents: null, currency: null, salesCloseAt: null, refundWindowHours: null, refundPolicy: null, ticketsSold: 0, money: null }],
              past: [],
              tickets: { ready: true, canSell: true, currency: "usd", communityPolicy: null },
            }}
          />
        </Shell>
      )
    case "moderation":
    case "moderation-restricted":
    case "moderation-rules":
      return (
        <Shell section="moderation">
          <ModerationSection
            head={head}
            meId={members[0].userId}
            initialTab={which === "moderation-restricted" ? "restricted" : which === "moderation-rules" ? "rules" : "reports"}
            rules={[
              { title: "Be kind", body: "Feedback is about the words, never the person." },
              { title: "Post your own words", body: "Share what you wrote. Links to sell something go in the Wins space." },
            ]}
            restricted={{
              removed: { rows: [], next: null, capped: false },
              muted: { rows: [member(5, { mutedUntil: ahead(1) })], next: null, capped: false },
              paused: { rows: [member(7, { status: "paused" })], next: null, capped: false },
              banned: { rows: [member(9, { status: "banned", name: "Spam Account", email: "spam@example.com" })], next: null, capped: false },
            }}
            tiers={[{ id: "t1", name: "Members", kind: "paid" }]}
            slowMode={300}
            initialAudit={{
              next: null,
              rows: [
                { id: 4, action: "post.held", actorName: null, actorKind: "system", targetType: "post", targetLabel: "Your payout is waiting, verify here", reason: "Held for review: a link that imitates a known brand (paypal)", createdAt: ago(0.05) },
                { id: 3, action: "post.removed", actorName: "Priya Raman", actorKind: "member", targetType: "post", targetLabel: "Buy my course", reason: "Spam", createdAt: ago(0.1) },
                { id: 2, action: "member.muted", actorName: "Ana Popescu", actorKind: "member", targetType: "member", targetLabel: null, reason: null, createdAt: ago(0.5) },
                { id: 1, action: "community.settings_changed", actorName: "Ana Popescu", actorKind: "member", targetType: "community", targetLabel: "The Morning Writers", reason: null, createdAt: ago(3) },
              ],
            }}
            initialReports={{
              next: null,
              rows: [
                { id: "r1", targetType: "post", targetId: "p3", reason: "spam", note: "Same post in every space", status: "open", createdAt: ago(0.1), reporterName: "Priya Raman", preview: "Buy my course, link in bio", subject: { userId: "00000000-0000-4000-8000-000000000099", name: "Spam Account", role: "member", member: { role: "member", status: "active", source: "free", mutedUntil: null } }, targetState: "published", resolution: null },
                { id: "r2", targetType: "comment", targetId: "c1", reason: "harassment", note: null, status: "reviewing", createdAt: ago(1), reporterName: "Jonah Brooks", preview: "Nobody wants to read this.", subject: { userId: "00000000-0000-4000-8000-000000000098", name: "Lukas Novak", role: "member", member: { role: "member", status: "active", source: "free", mutedUntil: null } }, targetState: "published", resolution: null },
                { id: "r3", targetType: "post", targetId: "p4", reason: "spam", note: "Held for review: a link that imitates a known brand (paypal)", status: "open", createdAt: ago(0.05), reporterName: null, preview: "Your payout is waiting, verify here https://paypa1-secure.com", subject: { userId: "00000000-0000-4000-8000-000000000097", name: "New Account", role: "member", member: { role: "member", status: "active", source: "free", mutedUntil: null } }, targetState: "removed", resolution: null },
              ],
            }}
          />
        </Shell>
      )
    case "analytics":
      return (
        <Shell section="analytics">
          <AnalyticsSection head={head} initial={analytics} />
        </Shell>
      )
    /* Round 12: the overview with the card of why people left under it, as app/(storelib)/app/community/[id]/page.tsx draws it for an admin. */
    case "overview-left":
      return (
        <Shell section="">
          <LeaveReasonsCard
            summary={{
              total: 37,
              counts: [
                { reason: "not_for_me", count: 9 },
                { reason: "too_busy", count: 14 },
                { reason: "too_expensive", count: 6 },
                { reason: "content", count: 5 },
                { reason: "people", count: 0 },
                { reason: "other", count: 3 },
              ],
              notes: [
                { reason: "too_busy", note: "New job, no time for writing until spring. I'll be back.", createdAt: ago(0.4) },
                { reason: "content", note: "Hoped for more on editing, less on daily pages.", createdAt: ago(3) },
                { reason: "other", note: "Moving to a group in my own language.", createdAt: ago(9) },
              ],
            }}
          />
        </Shell>
      )
    default:
      return (
        <Shell section="">
          <Overview
            head={head}
            created={params.get("created") === "1"}
            data={{
              figures: { members: 1284, active30d: 702, new30d: 232, paidMembers: 1201, mrrCents: 2_183_400, currency: "usd", cancellations30d: 18, posts7d: 540, comments7d: 1650, openReports: 3, pendingRequests: 4 },
              upcoming: [{ id: "e1", title: "Friday feedback call", startsAt: ahead(2), endsAt: new Date(Date.parse(ahead(2)) + 3_600_000).toISOString(), timezone: "Europe/Bucharest", goingCount: 64, capacity: 100, kind: "live" }],
              sells: true,
              publicUrl: "/community/morning-writers",
              steps: nextSteps({ published: false, paid: true, paymentsReady: true, members: 1, invites: 0, posts: 0, courses: 0, events: 1, customized: false, rules: 0, classroomEnabled: true, eventsEnabled: true }, `/app/community/${ID}`),
            }}
          />
        </Shell>
      )
  }
}

createRoot(document.getElementById("app")!).render(<App />)
