/**
 * A paid event on the member side, for scripts/check-community-events-paid.mjs:
 * the real components (components/community/events/*) with fixture props,
 * inside a stand in for the member shell's main column. Stripe's Embedded
 * Checkout is a stub (the probe's esbuild aliases @stripe/react-stripe-js
 * and @stripe/stripe-js/pure), and the API is the probe's. The case is the
 * query string:
 *
 *   ?list  ?month  ?pay  ?holder  ?invited  ?soldout  ?closed  ?cancelled
 *   ?free  ?checkout  ?refund
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { EventsPage } from "@/components/community/events/events-page"
import { EventDetail } from "@/components/community/events/event-detail"
import type { EventCardView, EventDetailView } from "@/components/community/events/model"
import type { TicketView } from "@/lib/communities/event-tickets"

const COMMUNITY = "8d0f3c52-5b8a-4a0e-9a57-3f0c6d1e2a11"
const DAY = 86_400_000
const HOUR = 3_600_000
const at = (ms: number) => new Date(Math.round((Date.now() + ms) / (15 * 60_000)) * 15 * 60_000).toISOString()

function cover(title: string, bg: string, fg = "#ffffff"): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320" viewBox="0 0 640 320"><rect width="640" height="320" fill="${bg}"/><circle cx="560" cy="60" r="130" fill="${fg}" opacity="0.07"/><text x="40" y="250" font-family="Inter, Arial, sans-serif" font-size="40" font-weight="700" fill="${fg}">${title}</text><text x="40" y="200" font-family="Inter, Arial, sans-serif" font-size="17" font-weight="600" fill="${fg}" opacity="0.7">MAKERS</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const ticket = (over: Partial<TicketView> = {}): TicketView => ({
  id: "t1",
  status: "paid",
  source: "purchase",
  amountCents: 2500,
  currency: "usd",
  paidAt: at(-1 * DAY),
  refundedAt: null,
  attendedAt: null,
  ...over,
})

function card(id: string, over: Partial<EventCardView>): EventCardView {
  return {
    id,
    title: "Event",
    coverUrl: null,
    kind: "online",
    startsAt: at(DAY),
    endsAt: at(DAY + HOUR),
    timezone: "Europe/London",
    location: null,
    locationHint: null,
    online: true,
    capacity: null,
    goingCount: 0,
    cancelled: false,
    myRsvp: null,
    locked: null,
    hasReplay: false,
    href: `/community/makers/events/${id}`,
    priceCents: null,
    currency: null,
    ticket: null,
    seatsLeft: null,
    soldOut: false,
    ...over,
  }
}

const upcoming: EventCardView[] = [
  card("e1", { title: "Glaze night: bring one piece", startsAt: at(2 * HOUR), endsAt: at(3 * HOUR), goingCount: 23, priceCents: 2500, currency: "usd", capacity: 40, seatsLeft: 17, coverUrl: cover("Glaze night", "#1f2a37") }),
  card("e2", { title: "Open studio hour", startsAt: at(DAY + 3 * HOUR), endsAt: at(DAY + 4 * HOUR), goingCount: 12, myRsvp: "going" }),
  card("e3", {
    title: "Wheel throwing, a whole Saturday",
    kind: "workshop",
    online: false,
    locationHint: "Lisbon",
    startsAt: at(4 * DAY),
    endsAt: at(4 * DAY + 6 * HOUR),
    goingCount: 12,
    capacity: 12,
    priceCents: 12000,
    currency: "usd",
    seatsLeft: 0,
    soldOut: true,
    coverUrl: cover("Wheel throwing", "#d8e2dc", "#1a1a2e"),
  }),
  card("e4", { title: "Kiln loading, in person", kind: "meetup", online: false, location: "Rua das Flores 28, Lisbon", startsAt: at(6 * DAY), goingCount: 7, capacity: 30, priceCents: 1500, currency: "usd", seatsLeft: 23, ticket: ticket({ amountCents: 1500 }) }),
  card("e7", { title: "Glaze chemistry, one evening", startsAt: at(7 * DAY), endsAt: at(7 * DAY + 2 * HOUR), goingCount: 4, priceCents: 1500, currency: "usd", capacity: 20, seatsLeft: 16 }),
  card("e5", { title: "Monthly planning session", startsAt: at(9 * DAY), priceCents: 2500, currency: "usd", cancelled: true }),
  card("e6", { title: "Pro AMA with a creative director", kind: "ama", startsAt: at(11 * DAY), locked: { reason: "tier", label: "Pro members", opensAt: null } }),
]

const past: EventCardView[] = [card("p1", { title: "Pricing teardown, live", startsAt: at(-5 * DAY), endsAt: at(-5 * DAY + HOUR), hasReplay: true })]

const DESCRIPTION =
  "<p>A whole Saturday at the wheel. We start with centering, move to pulling walls, and finish with a set of four cups you can take home once they are fired.</p><p>Clay, tools and glaze are included. Bring an apron and a towel, and wear something you do not mind ruining.</p><ul><li>Nine places only</li><li>Lunch is at the cafe next door</li></ul>"

const TEASER =
  "A whole Saturday at the wheel. We start with centering, move to pulling walls, and finish with a set of four cups you can take home once they are fired. Clay, tools and glaze are included."

function detail(over: Partial<EventDetailView>): EventDetailView {
  return {
    ...card("e9", {
      title: "Wheel throwing, a whole Saturday",
      kind: "workshop",
      startsAt: at(5 * DAY + 4 * HOUR),
      endsAt: at(5 * DAY + 10 * HOUR),
      goingCount: 7,
      capacity: 12,
      online: false,
      coverUrl: cover("Wheel throwing", "#1f2a37"),
      priceCents: 2500,
      currency: "usd",
    }),
    description: DESCRIPTION,
    host: { name: "Mara Lindqvist", avatarUrl: null },
    meetingUrl: null,
    livestreamUrl: null,
    joinOpensAt: null,
    replayVideoId: null,
    communityId: COMMUNITY,
    communityName: "Makers",
    attendees: [],
    googleUrl: "https://calendar.google.com/calendar/render?action=TEMPLATE",
    icsUrl: null,
    pageUrl: "https://storelib.com/community/makers/events/e9",
    pricing: { priceCents: 2500, currency: "usd", salesCloseAt: null, refundWindowHours: 48, refundPolicy: null },
    gate: { open: false, reason: "pay", priceCents: 2500, currency: "usd" },
    ticketsSold: 7,
    refundPolicyText: null,
    ...over,
  }
}

const OPEN = {
  description: DESCRIPTION,
  location: "Rua das Flores 28, Lisbon",
  locationHint: null,
  icsUrl: `/api/community/${COMMUNITY}/events/e9/ics`,
  attendees: [
    { name: "Ana Souza", avatarUrl: null },
    { name: "Ben Ito", avatarUrl: null },
    { name: "Chloe Park", avatarUrl: null },
    { name: "Dev Patel", avatarUrl: null },
    { name: "Eli Moss", avatarUrl: null },
  ],
}

const events = { eventsHref: "/community/makers/events", aboutHref: "/community/makers/about" }
const monthNow = new Date()

const which = location.search.slice(1) || "list"
let body: React.ReactNode = null
switch (which) {
  case "list":
    body = <EventsPage communityId={COMMUNITY} initial={{ events: upcoming, nextCursor: null }} month={{ year: monthNow.getUTCFullYear(), month: monthNow.getUTCMonth(), events: upcoming }} fallbackZone="UTC" />
    break
  case "month":
    body = <EventsPage communityId={COMMUNITY} initial={{ events: upcoming, nextCursor: null }} month={{ year: monthNow.getUTCFullYear(), month: monthNow.getUTCMonth(), events: [...upcoming, ...past] }} fallbackZone="UTC" />
    break
  case "pay":
  case "checkout":
    body = <EventDetail event={detail({ description: TEASER, locationHint: "Lisbon" })} {...events} />
    break
  case "soldout":
    body = <EventDetail event={detail({ description: TEASER, locationHint: "Lisbon", gate: { open: false, reason: "sold_out" }, ticketsSold: 12 })} {...events} />
    break
  case "closed":
    body = <EventDetail event={detail({ description: TEASER, locationHint: "Lisbon", gate: { open: false, reason: "sales_closed" } })} {...events} />
    break
  case "refund":
    body = <EventDetail event={detail({ description: TEASER, locationHint: "Lisbon", gate: { open: false, reason: "refunded" }, ticket: ticket({ status: "refunded", refundedAt: at(-2 * HOUR) }) })} {...events} />
    break
  case "holder":
    body = <EventDetail event={detail({ ...OPEN, gate: { open: true, via: "ticket" }, ticket: ticket(), ticketsSold: 8 })} {...events} />
    break
  case "invited":
    body = <EventDetail event={detail({ ...OPEN, gate: { open: true, via: "ticket" }, ticket: ticket({ source: "invite", amountCents: 0, id: "t2" }), ticketsSold: 8 })} {...events} />
    break
  case "cancelled":
    body = <EventDetail event={detail({ ...OPEN, cancelled: true, gate: { open: true, via: "ticket" }, ticket: ticket() })} {...events} />
    break
  case "free":
    body = (
      <EventDetail
        event={detail({
          ...OPEN,
          title: "Open studio hour",
          kind: "online",
          online: true,
          location: null,
          priceCents: null,
          currency: null,
          pricing: { priceCents: null, currency: null, salesCloseAt: null, refundWindowHours: null, refundPolicy: null },
          gate: { open: true, via: "free" },
          ticket: null,
          ticketsSold: 0,
          refundPolicyText: null,
          joinOpensAt: at(5 * DAY + 4 * HOUR - 15 * 60_000),
        })}
        {...events}
      />
    )
    break
}

createRoot(document.getElementById("app")!).render(
  <div className="min-h-screen bg-[#f8f9fa]" data-probe-case={which}>
    <main className="mx-auto w-full max-w-[1040px] px-4 py-5 sm:px-6 lg:py-8">{body}</main>
  </div>,
)
