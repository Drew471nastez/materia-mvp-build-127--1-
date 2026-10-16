/**
 * The community admin's content and people sections of round 32 for
 * scripts/check-community-content-round32.mjs: the real components with
 * fixture props, inside a stand-in for the /app frame, picked by ?case=:
 *
 *   spaces, feed, learn, events, members, members-pending, moderation,
 *   moderation-restricted, moderation-audit
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { allowedActions } from "@/lib/communities/permissions"
import { CommunityShell } from "@/components/community/creator/community-shell"
import { FeedSection } from "@/components/community/creator/feed-section"
import { EventsSection } from "@/components/community/creator/events-section"
import { SpacesSection } from "@/components/community/creator/spaces-section"
import { MembersSection } from "@/components/community/creator/members-section"
import { ModerationSection } from "@/components/community/creator/moderation-section"
import { LearnBuilder } from "@/components/community/learn/learn-builder"
import type { AuditView, CommunityHead, FeedRowView, MemberRowView, ReportView } from "@/components/community/creator/view-types"
import type { Role } from "@/lib/communities/types"
import { ViewportVars } from "@/components/viewport-vars"

const params = new URLSearchParams(location.search)
const which = params.get("case") || "members"
const ID = "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"
const ME = "00000000-0000-4000-8000-000000000001"
const NOW = Date.now()
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString()
const ahead = (d: number) => new Date(NOW + d * 86_400_000).toISOString()
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

function picture(ground: string, ink: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="${ground}"/><circle cx="470" cy="130" r="56" fill="${ink}" opacity="0.55"/><path d="M0 330 L220 200 L380 300 L520 230 L640 300 L640 400 L0 400Z" fill="${ink}"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const head: CommunityHead = {
  id: ID,
  slug: "morning-writers",
  name: "The Morning Writers",
  tagline: "Write 500 words before breakfast, together.",
  logoUrl: null,
  coverUrl: null,
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
  openReports: 5,
  me: { userId: ME, name: "Ana Popescu", avatarUrl: null },
}
const options = { tiers: [{ id: "t1", name: "Members" }, { id: "t2", name: "Lifetime" }], levels: [{ level: 1, name: "Newcomer", minPoints: 0, reward: null }, { level: 2, name: "Regular", minPoints: 50, reward: null }] }
const tiers = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Members", kind: "paid" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Lifetime", kind: "paid" },
]

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

const NAMES = ["Marcus Lee", "Priya Raman", "Sofia Rossi", "Jonas Becker", "Amélie Laurent", "Kwame Mensah", "Hana Sato", "Diego Alvarez", "Olivia Brown", "Mateusz Nowak", "Lucía Fernández", "Tom Fischer", "Ingrid Larsen", "Chen Wei"]
const ROLES: Role[] = ["admin", "moderator", "member", "member", "member", "member", "member", "member", "member", "member", "member", "member", "member", "member"]
const member = (i: number, over: Partial<MemberRowView> = {}): MemberRowView => ({
  userId: uid(100 + i),
  name: NAMES[i % NAMES.length],
  username: NAMES[i % NAMES.length].toLowerCase().replace(/[^a-z]+/g, ""),
  avatarUrl: null,
  email: `${NAMES[i % NAMES.length].toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
  role: ROLES[i % ROLES.length],
  status: "active",
  source: i % 5 === 0 ? "manual" : "subscription",
  tierId: tiers[i % 2].id,
  tierName: tiers[i % 2].name,
  level: 1 + (i % 6),
  points: 40 + i * 37,
  joinedAt: ago(3 + i * 9),
  requestedAt: null,
  requestNote: null,
  lastActiveAt: i % 4 === 3 ? null : ago(i * 0.7),
  mutedUntil: i === 4 ? ahead(1) : null,
  approved: false,
  acted: i === 4 ? { kind: "muted", byUserId: ME, byName: "Ana Popescu", byRole: "owner", at: ago(0.2), reason: "Spam links", until: ahead(1) } : null,
  ...over,
})
const members = NAMES.map((_, i) => member(i))
const requests = [0, 1, 2].map((i) => member(i + 3, { status: "pending", role: "member", requestedAt: ago(i + 0.5), joinedAt: null, requestNote: ["I run a writing club in Lisbon and want to join the Friday calls.", "Found you through the newsletter.", ""][i] }))

const row = (i: number, over: Partial<FeedRowView>): FeedRowView => ({
  id: `p${i}0000000-0000-4000-8000-00000000000${i}`,
  kind: "post",
  title: null,
  excerpt: "",
  spaceName: "General",
  authorName: "Marcus Lee",
  pinned: false,
  locked: false,
  featured: false,
  status: "published",
  reactionCount: 0,
  commentCount: 0,
  createdAt: ago(i * 0.3),
  media: [],
  poll: null,
  spaceId: "s1",
  spaceIcon: "✍️",
  spaceKind: "feed",
  authorId: uid(2),
  authorAvatar: null,
  ...over,
})
const feedRows: FeedRowView[] = [
  row(1, { kind: "announcement", title: "Friday call moves to 6pm", excerpt: "From this week the call starts an hour later so more of you can make it.", spaceName: "Announcements", spaceId: "s2", spaceIcon: null, spaceKind: "announcements", authorName: "Ana Popescu", authorId: ME, pinned: true, reactionCount: 48, commentCount: 12 }),
  row(2, { title: "My desk this morning", excerpt: "Day 31. Wrote about my grandmother's kitchen. 640 words before the kettle boiled.", featured: true, reactionCount: 21, commentCount: 4, media: [{ type: "image", url: picture("#d9c7a7", "#8b6b47"), w: 640, h: 400 }, { type: "image", url: picture("#c9d6c3", "#4f6b4a"), w: 640, h: 400 }] }),
  row(3, { kind: "poll", title: "When should the call be?", excerpt: "Pick the time that suits you.", poll: { question: "Which evening works best?", votes: 37, options: 3, closed: false }, reactionCount: 3, commentCount: 7, authorName: "Sofia Rossi" }),
  row(4, { title: "Prompt deck, March", excerpt: "Thirty prompts, one for each morning.", reactionCount: 15, commentCount: 1, authorId: ME, authorName: "Ana Popescu" }),
]

const report = (i: number, over: Partial<ReportView>): ReportView => ({
  id: uid(900 + i),
  targetType: "post",
  targetId: uid(800 + i),
  reason: "spam",
  note: null,
  status: "open",
  createdAt: ago(i * 0.2),
  reporterName: "Priya Raman",
  preview: "Buy my course, link in bio. Limited spots this week only.",
  subject: { userId: uid(700 + i), name: "Spam Account", role: "member", member: { role: "member", status: "active", source: "free", mutedUntil: null } },
  targetState: "published",
  resolution: null,
  ...over,
})
const reports: ReportView[] = [
  report(1, { note: "Third time this week" }),
  report(2, { targetType: "comment", reason: "harassment", preview: "Nobody wants to read your writing. Stop posting.", subject: { userId: uid(702), name: "Tom Fischer", role: "member", member: { role: "member", status: "active", source: "subscription", mutedUntil: null } } }),
  report(3, { targetType: "member", reason: "other", preview: "Jonas Becker", note: "Sends everyone private messages about crypto", subject: { userId: uid(703), name: "Jonas Becker", role: "member", member: { role: "member", status: "active", source: "free", mutedUntil: null } }, targetState: "member" }),
  report(4, { reporterName: null, note: "Held for review: three links in a first post", targetState: "removed", preview: "Check out these three sites for free followers" }),
  report(5, { reporterName: null, targetType: "member", reason: "other", note: "Join alarm: 40 people joined in 60 minutes, so new people now ask to join.", preview: "", subject: null, targetState: "member" }),
]
const audit: AuditView[] = [
  { id: 6, action: "member.muted", actorName: "Ana Popescu", actorKind: "member", targetType: "member", targetLabel: "Amélie Laurent", reason: "Spam links", createdAt: ago(0.2) },
  { id: 5, action: "post.removed", actorName: "Marcus Lee", actorKind: "member", targetType: "post", targetLabel: "Buy my course", reason: "Reported: Spam", createdAt: ago(0.6) },
  { id: 4, action: "post.pinned", actorName: "Ana Popescu", actorKind: "member", targetType: "post", targetLabel: "Friday call moves to 6pm", reason: null, createdAt: ago(1.2) },
  { id: 3, action: "space.created", actorName: "Ana Popescu", actorKind: "member", targetType: "space", targetLabel: "Inner circle", reason: null, createdAt: ago(3) },
  { id: 2, action: "community.join_alarm", actorName: null, actorKind: "system", targetType: "community", targetLabel: null, reason: "40 joins in an hour", createdAt: ago(4) },
]
const restrictedPage = (rows: MemberRowView[]) => ({ rows, next: null, capped: false })

function App() {
  switch (which) {
    case "spaces":
      return (
        <Shell section="spaces">
          <SpacesSection
            head={head}
            options={options}
            initial={[
              { id: "s1", slug: "general", name: "General", description: "Say hello and share what you wrote", icon: "messages-square", kind: "feed", position: 0, postRole: "member", commentsEnabled: true, viewAccess: {}, archived: false, posts: 2810 },
              { id: "s2", slug: "announcements", name: "Announcements", description: null, icon: "megaphone", kind: "announcements", position: 1, postRole: "admin", commentsEnabled: true, viewAccess: {}, archived: false, posts: 42 },
              { id: "s3", slug: "chat", name: "Morning chat", description: null, icon: null, kind: "chat", position: 2, postRole: "member", commentsEnabled: true, viewAccess: {}, archived: false, posts: 9120 },
              { id: "s4", slug: "inner", name: "Inner circle", description: "For lifetime members", icon: "👨‍👩‍👧", kind: "feed", position: 3, postRole: "member", commentsEnabled: true, viewAccess: { tierIds: ["t2"] }, archived: false, posts: 140 },
              { id: "s5", slug: "old", name: "Old prompts", description: null, icon: "AI", kind: "resources", position: 4, postRole: "admin", commentsEnabled: true, viewAccess: {}, archived: true, posts: 12 },
            ]}
          />
        </Shell>
      )
    case "feed":
      return (
        <Shell section="feed">
          <FeedSection head={head} spaces={[{ id: "s1", name: "General", announcements: false }, { id: "s2", name: "Announcements", announcements: true }]} compose={null} initial={{ next: "c1", rows: feedRows }} />
        </Shell>
      )
    case "learn":
      return (
        <Shell section="classroom">
          <LearnBuilder
            communityId={ID}
            initial={{
              communityId: ID,
              slug: "morning-writers",
              ready: true,
              enabled: true,
              currency: "usd",
              canSell: true,
              programs: [
                { id: "pg1", kind: "program", productId: null, title: "The 30 day writing habit", summary: "", coverUrl: picture("#d9c7a7", "#8b6b47"), status: "published", mode: "free", level: 1, priceCents: null, currency: "usd", dripDays: null, lessons: 30, buyers: 0, editHref: null },
                { id: "pg2", kind: "program", productId: null, title: "Editing your first draft", summary: "", coverUrl: null, status: "draft", mode: "level", level: 2, priceCents: null, currency: "usd", dripDays: null, lessons: 8, buyers: 0, editHref: null },
                { id: "pg3", kind: "program", productId: null, title: "Publishing a short story collection", summary: "", coverUrl: picture("#c9d6c3", "#4f6b4a"), status: "published", mode: "paid", level: 1, priceCents: 4900, currency: "usd", dripDays: null, lessons: 14, buyers: 23, editHref: null },
                { id: "pg4", kind: "course", productId: "c3", title: "Poetry in a week", summary: "", coverUrl: null, status: "published", mode: "free", level: 1, priceCents: null, currency: "usd", dripDays: null, lessons: 7, buyers: 0, editHref: "/app/products/c3" },
              ],
              levels: [{ level: 1, name: "Newcomer" }, { level: 2, name: "Regular" }],
              courses: [{ id: "c9", title: "Memoir basics", coverUrl: null, status: "published" }],
            }}
          />
        </Shell>
      )
    case "events":
      return (
        <Shell section="events">
          <EventsSection
            head={head}
            options={options}
            openNew={params.get("new") === "1"}
            initial={{
              upcoming: [
                { id: "e1", title: "Friday feedback call", description: "", coverUrl: null, kind: "live", startsAt: ahead(2), endsAt: new Date(Date.parse(ahead(2)) + 3_600_000).toISOString(), timezone: "Europe/Bucharest", location: null, meetingUrl: "https://zoom.us/j/1", livestreamUrl: null, capacity: 100, goingCount: 64, access: {}, replayVideoId: null, status: "scheduled", priceCents: null, currency: null, salesCloseAt: null, refundWindowHours: null, refundPolicy: null, ticketsSold: 0, money: null },
                { id: "e2", title: "Editing workshop: cutting the first page", description: "", coverUrl: null, kind: "workshop", startsAt: ahead(9), endsAt: new Date(Date.parse(ahead(9)) + 7_200_000).toISOString(), timezone: "Europe/Bucharest", location: null, meetingUrl: "https://zoom.us/j/2", livestreamUrl: null, capacity: 30, goingCount: 18, access: {}, replayVideoId: null, status: "scheduled", priceCents: 2500, currency: "usd", salesCloseAt: null, refundWindowHours: 24, refundPolicy: null, ticketsSold: 18, money: { sold: 18, invited: 2, grossCents: 45000, refundedCents: 0, currency: "usd" } },
                { id: "e3", title: "Writers meetup in Lisbon", description: "", coverUrl: null, kind: "meetup", startsAt: ahead(20), endsAt: new Date(Date.parse(ahead(20)) + 10_800_000).toISOString(), timezone: "Europe/Lisbon", location: "Rua Augusta 10", meetingUrl: null, livestreamUrl: null, capacity: null, goingCount: 9, access: {}, replayVideoId: null, status: "cancelled", priceCents: null, currency: null, salesCloseAt: null, refundWindowHours: null, refundPolicy: null, ticketsSold: 0, money: null },
              ],
              past: [],
              tickets: { ready: true, canSell: true, currency: "usd", communityPolicy: null },
            }}
          />
        </Shell>
      )
    case "members":
    case "members-pending":
      return (
        <Shell section="members">
          <MembersSection
            head={head}
            meId={ME}
            initial={{ rows: which === "members" ? members : requests, next: which === "members" ? "next1" : null, capped: false }}
            counts={{ active: 1284, pending: 3, restricted: 4, muted: 1, paused: 1, banned: 1, removed: 1, expired: 12, cancelled: 30 }}
            status={which === "members" ? "active" : "pending"}
            tiers={tiers}
            canEmail
            invites={{ rows: [], next: null }}
            openInvite={false}
            badges={[{ id: "b1", name: "Early bird", description: null, icon: "🐦", awarded: 4 }]}
          />
        </Shell>
      )
    default: {
      const tab = which === "moderation-restricted" ? "restricted" : which === "moderation-audit" ? "audit" : "reports"
      return (
        <Shell section="moderation">
          <ModerationSection
            head={head}
            meId={ME}
            initialTab={tab}
            initialReports={{ rows: reports, next: "r2" }}
            initialAudit={{ rows: audit, next: null }}
            rules={[{ title: "Be kind", body: "Critique the writing, never the writer." }]}
            restricted={{
              muted: restrictedPage([members[4]]),
              paused: restrictedPage([member(7, { status: "paused", acted: { kind: "suspended", byUserId: ME, byName: "Ana Popescu", byRole: "owner", at: ago(2), reason: "Cooling off", until: null } })]),
              banned: restrictedPage([member(8, { status: "banned", acted: { kind: "banned", byUserId: ME, byName: "Ana Popescu", byRole: "owner", at: ago(5), reason: "Harassment", until: null } })]),
              removed: restrictedPage([member(9, { status: "removed", acted: { kind: "removed", byUserId: uid(100), byName: "Marcus Lee", byRole: "admin", at: ago(8), reason: null, until: null } })]),
            }}
            tiers={tiers}
            badges={[]}
          />
        </Shell>
      )
    }
  }
}

createRoot(document.getElementById("app")!).render(
  <>
    <ViewportVars />
    <App />
  </>,
)
