/**
 * Round 14's paid events on the creator's side (worker A) for
 * scripts/check-community-events-tickets.mjs: the real components with
 * fixture props inside a stand-in for the /app shell, picked by ?case=:
 *
 *   list          the events list: a paid event with its money line, a free
 *                 one with none, and a cancelled one
 *   editor        the event editor open on a paid event: the Tickets part
 *   editor-free   the same editor on a free event
 *   no-payouts    payouts not connected: Paid is off and says where to go
 *   no-update     run-now part 105 has not run: one quiet staff line
 *   cancel        the cancel dialog for an event people hold tickets for
 *   panel         the Tickets panel: the figures and the holders
 *   invite        the Invite free sheet, with members found by name
 *   analytics     the Analytics screen with the ticket figures
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { allowedActions } from "@/lib/communities/permissions"
import { CommunityShell } from "@/components/community/creator/community-shell"
import { EventsSection } from "@/components/community/creator/events-section"
import { EventTicketsPanel } from "@/components/community/creator/event-tickets"
import { AnalyticsSection } from "@/components/community/creator/analytics-section"
import type { AnalyticsView, CommunityHead, EventEditView, EventTicketPanelView, EventTicketSetup, RuleOptions } from "@/components/community/creator/view-types"

const params = new URLSearchParams(location.search)
const which = params.get("case") || "list"
const ID = "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"
const EID = "2a1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"
const NOW = Date.now()
const inDays = (d: number) => new Date(NOW + d * 86_400_000).toISOString()
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString()

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
  openReports: 0,
}

const options: RuleOptions = { tiers: [{ id: "t1", name: "Members" }], levels: [{ level: 2, name: "Regular" }] }

const paidEvent: EventEditView = {
  id: EID,
  title: "Editing workshop: cut 20% of your words",
  description: "Two hours of line editing, together. Bring 500 words.",
  coverUrl: null,
  kind: "workshop",
  startsAt: inDays(9),
  endsAt: new Date(NOW + 9 * 86_400_000 + 7_200_000).toISOString(),
  timezone: "Europe/Bucharest",
  location: "Online",
  meetingUrl: "https://zoom.us/j/555",
  livestreamUrl: null,
  capacity: 20,
  goingCount: 12,
  access: {},
  replayVideoId: null,
  status: "scheduled",
  priceCents: 2500,
  currency: "usd",
  salesCloseAt: inDays(8),
  refundWindowHours: 48,
  refundPolicy: "Tell us two days before and we send it all back.",
  ticketsSold: 12,
  money: { sold: 11, invited: 1, grossCents: 27_500, refundedCents: 2500, currency: "usd" },
}

const freeEvent: EventEditView = {
  ...paidEvent,
  id: "3a1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  title: "Friday morning call",
  kind: "online",
  startsAt: inDays(2),
  endsAt: null,
  capacity: null,
  goingCount: 48,
  priceCents: null,
  currency: null,
  salesCloseAt: null,
  refundWindowHours: null,
  refundPolicy: null,
  ticketsSold: 0,
  money: null,
}

const cancelledEvent: EventEditView = { ...paidEvent, id: "4a1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", title: "Plot clinic", startsAt: inDays(16), status: "cancelled", ticketsSold: 4, money: { sold: 4, invited: 0, grossCents: 10_000, refundedCents: 0, currency: "usd" } }
const pastEvent: EventEditView = { ...paidEvent, id: "5a1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", title: "Dialogue night", startsAt: ago(12), endsAt: null, money: { sold: 18, invited: 2, grossCents: 45_000, refundedCents: 0, currency: "usd" } }

const setup = (over: Partial<EventTicketSetup> = {}): EventTicketSetup => ({ ready: true, currency: "usd", canSell: true, communityPolicy: "We give money back up to a week before anything we run.", ...over })

const holders = [
  { ticketId: "t-1", userId: "u-1", name: "Ana Petrescu", username: "ana", avatarUrl: null, email: "ana@example.com", status: "paid" as const, source: "purchase" as const, amountCents: 2500, currency: "usd", paidAt: ago(6), refundedAt: null, attendedAt: null, invitedByName: null, createdAt: ago(6) },
  { ticketId: "t-2", userId: "u-2", name: "Dan Ionescu", username: "dan", avatarUrl: null, email: "dan@example.com", status: "paid" as const, source: "invite" as const, amountCents: 0, currency: "usd", paidAt: ago(5), refundedAt: null, attendedAt: ago(1), invitedByName: "You", createdAt: ago(5) },
  { ticketId: "t-3", userId: "u-3", name: "Mara Vlad Constantinescu", username: "mara", avatarUrl: null, email: "mara.vlad.constantinescu@example.com", status: "refunded" as const, source: "purchase" as const, amountCents: 2500, currency: "usd", paidAt: ago(8), refundedAt: ago(2), attendedAt: null, invitedByName: null, createdAt: ago(8) },
  { ticketId: "t-4", userId: "u-4", name: "Victor Pop", username: "victor", avatarUrl: null, email: "victor@example.com", status: "paid" as const, source: "purchase" as const, amountCents: 2500, currency: "usd", paidAt: ago(3), refundedAt: null, attendedAt: null, invitedByName: null, createdAt: ago(3) },
]

const panel: EventTicketPanelView = {
  eventId: EID,
  title: paidEvent.title,
  startsAt: paidEvent.startsAt,
  cancelled: false,
  priceCents: 2500,
  currency: "usd",
  capacity: 20,
  ticketsSold: 12,
  seatsLeft: 8,
  money: { sold: 11, invited: 1, grossCents: 27_500, refundedCents: 2500, currency: "usd" },
  rows: holders,
  nextCursor: "next",
  capped: false,
  ready: true,
}

/* THE PANEL AND THE INVITE SHEET READ THEIR OWN DATA, so the probe answers for the server. */
const answers: Record<string, unknown> = {
  tickets: { panel },
  find: {
    members: [
      { userId: "u-9", name: "Ioana Marinescu", username: "ioana", avatarUrl: null, email: "ioana@example.com", hasTicket: false },
      { userId: "u-1", name: "Ana Petrescu", username: "ana", avatarUrl: null, email: "ana@example.com", hasTicket: true },
    ],
  },
  invite: { invited: 2, failed: 0, notMembers: 1 },
}
window.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const href = String(typeof url === "string" ? url : url instanceof URL ? url.href : url.url)
  const body = href.includes("find=") ? answers.find : href.includes("/invite") ? answers.invite : href.includes("/tickets") ? answers.tickets : { ok: true }
  ;(window as unknown as { __calls: [string, string][] }).__calls = [...((window as unknown as { __calls?: [string, string][] }).__calls ?? []), [init?.method ?? "GET", href]]
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
}) as typeof fetch

const analytics: AnalyticsView = {
  days: 30,
  today: new Date(NOW).toISOString().slice(0, 10),
  series: { members: [], newMembers: [], activeMembers: [], posts: [], comments: [], reactions: [] },
  totals: { newMembers: 42, left: 5, posts: 180, comments: 420, reactions: 900, rsvps: 60, lessons: 30 },
  live: { members: 1284, newToday: 3, postsToday: 6, commentsToday: 14 },
  rolledUp: false,
  topPosts: [],
  money: {
    days: 30,
    revenue: null,
    joins: { total: 42, bySource: [{ source: "subscription", count: 30 }], invites: [] },
    active: { last7: 512, last30: 702 },
    events: { sold: 34, invited: 3, grossCents: 85_000, refundedCents: 5000, netCents: 80_000, refunds: 2, events: 3, currency: "usd" },
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Frame path={`/app/community/${ID}/events`}>
      <CommunityShell head={head}>{children}</CommunityShell>
    </Frame>
  )
}

function App() {
  const list = { upcoming: [paidEvent, freeEvent, cancelledEvent], past: [pastEvent] }
  if (which === "analytics")
    return (
      <Shell>
        <AnalyticsSection head={head} initial={analytics} />
      </Shell>
    )
  if (which === "panel" || which === "invite")
    return (
      <Shell>
        <EventTicketsPanel head={head} event={paidEvent} currency="usd" onBack={() => {}} />
      </Shell>
    )
  const tickets = which === "no-payouts" ? setup({ canSell: false }) : which === "no-update" ? setup({ ready: false }) : setup()
  return (
    <Shell>
      <EventsSection head={head} initial={{ ...list, tickets }} options={options} openNew={which !== "list" && which !== "cancel"} />
    </Shell>
  )
}

createRoot(document.getElementById("app")!).render(<App />)
