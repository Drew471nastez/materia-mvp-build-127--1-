"use client"

/**
 * ===========================================================================
 *  A COMMUNITY'S EVENTS
 * ===========================================================================
 * /community/<slug>/events, inside the member shell. Upcoming (soonest
 * first) and Past (latest first) as one list each, a page at a time; on a
 * computer a third view, the month, as a calendar grid. Every time is the
 * viewer's own (components/community/events/use-zone.ts).
 *
 * The first page of Upcoming and the current month come with the page;
 * Past and other months are asked for when opened
 * (GET /api/community/<id>/events).
 *
 * Round 11, CLEANER: the page is called what its place is called (Calendar,
 * not Events under a Calendar tab), the views are Upcoming, Past and Month,
 * a wait is the community's own spinner rather than a generic one, and a
 * view with nothing in it is the community's empty card (member/
 * place-empty.tsx) with, for the people who run events, Schedule an event.
 *
 * Round 14, MONEY: an event with a price says it once, in ink, where the
 * other facts are; a free event says nothing, exactly as before. A seat
 * already bought reads Going, the same mark a free event's answer gets, and
 * a full paid event reads Sold out.
 */
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, ChevronLeft, ChevronRight, Clock3, Lock, MapPin, PlayCircle, Video } from "lucide-react"
import { CARD, SECONDARY } from "@/components/library/library-ui"
import { PlaceEmpty } from "@/components/community/member/place-empty"
import { Spinner } from "@/components/community/member/place-spinner"
import { eventDateBadge } from "@/lib/communities/format"
import { eventPriceLabel } from "@/lib/communities/event-tickets"
import { dayKey, goingLabel, isLive, monthGrid, monthKey, monthTitle, type EventCardView } from "./model"
import { clockIn, useViewerZone } from "./use-zone"

type Tab = "upcoming" | "past" | "calendar"

interface ListState {
  events: EventCardView[]
  nextCursor: string | null
  loaded: boolean
  loading: boolean
  error: string | null
}

export interface EventsPageProps {
  communityId: string
  initial: { events: EventCardView[]; nextCursor: string | null }
  month: { year: number; month: number; events: EventCardView[] }
  /** The zone times are drawn in until the browser's own is known. */
  fallbackZone: string
  /** The creator side's new event form, for somebody who may run events; null for everybody else. */
  manageHref?: string | null
}

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { cache: "no-store", credentials: "same-origin" })
    return res.ok ? ((await res.json()) as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function EventsPage({ communityId, initial, month, fallbackZone, manageHref = null }: EventsPageProps) {
  const zone = useViewerZone(fallbackZone)
  const [tab, setTab] = useState<Tab>("upcoming")
  const [lists, setLists] = useState<Record<"upcoming" | "past", ListState>>({
    upcoming: { ...initial, loaded: true, loading: false, error: null },
    past: { events: [], nextCursor: null, loaded: false, loading: false, error: null },
  })

  const loadMore = useCallback(
    async (which: "upcoming" | "past", cursor: string | null) => {
      setLists((l) => ({ ...l, [which]: { ...l[which], loading: true, error: null } }))
      const body = await getJson(`/api/community/${communityId}/events?when=${which}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`)
      setLists((l) => {
        const was = l[which]
        if (!body) return { ...l, [which]: { ...was, loading: false, error: "Events did not load. Try again." } }
        const more = (body.events as EventCardView[]) ?? []
        return { ...l, [which]: { events: cursor ? [...was.events, ...more] : more, nextCursor: (body.nextCursor as string | null) ?? null, loaded: true, loading: false, error: null } }
      })
    },
    [communityId],
  )

  useEffect(() => {
    if (tab === "past" && !lists.past.loaded && !lists.past.loading) void loadMore("past", null)
  }, [tab, lists.past.loaded, lists.past.loading, loadMore])

  const listTab: "upcoming" | "past" = tab === "past" ? "past" : "upcoming"
  const list = lists[listTab]

  return (
    <section data-events aria-labelledby="events-title">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 sm:mb-5">
        <h1 id="events-title" className="text-[22px] font-bold tracking-[-0.01em] text-[#1a1a2e] sm:text-[24px]">
          Calendar
        </h1>
        <div className="flex items-center gap-0.5 rounded-[11px] border border-[#e6e8eb] bg-[#f1f2f4] p-0.5" role="tablist" aria-label="Which events">
          {(
            [
              ["upcoming", "Upcoming"],
              ["past", "Past"],
              ["calendar", "Month"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              data-events-tab={id}
              onClick={() => setTab(id)}
              className={`h-10 touch-manipulation whitespace-nowrap rounded-[9px] sm:h-9 px-3.5 text-[13.5px] font-medium transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 motion-reduce:transition-none ${
                id === "calendar" ? "hidden lg:block" : ""
              } ${tab === id ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.08),0_0_0_0.5px_rgba(16,24,40,0.06)]" : "text-[#6b7280] hover:text-[#1a1a2e] active:text-[#1a1a2e]"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {tab === "calendar" ? (
        <div className="hidden lg:block">
          <MonthCalendar communityId={communityId} initial={month} zone={zone} />
        </div>
      ) : null}

      {/* The list; with Calendar picked on a narrow screen (no grid there), Upcoming. */}
      <div className={tab === "calendar" ? "lg:hidden" : ""}>
        <EventList state={list} past={listTab === "past"} zone={zone} onMore={() => void loadMore(listTab, list.nextCursor)} manageHref={manageHref} />
      </div>
    </section>
  )
}

function EventList({ state, past, zone, onMore, manageHref = null }: { state: ListState; past: boolean; zone: string | undefined; onMore: () => void; manageHref?: string | null }) {
  if (!state.loaded) {
    return (
      <div className="flex h-[220px] items-center justify-center" role="status" aria-label="Loading" data-events-loading>
        <Spinner />
      </div>
    )
  }
  if (state.events.length === 0) {
    if (state.error) {
      return (
        <div className={`${CARD} px-5 py-10 text-center`} data-events-empty>
          <p className="text-[14px] text-[#b42318]">{state.error}</p>
        </div>
      )
    }
    return past ? (
      <PlaceEmpty data-events-empty="" place="events" title="No past events yet" line="Events that have ended stay here, with their recordings when there are some." />
    ) : (
      <PlaceEmpty
        data-events-empty=""
        place="events"
        title="Nothing coming up"
        line={manageHref ? "Schedule a live session, a meetup or a workshop, and members see it here in their own time zone." : "Live sessions and meetups show up here, in your own time zone, as soon as they are planned."}
        action={manageHref ? { href: manageHref, label: "Schedule an event" } : null}
      />
    )
  }
  return (
    <div>
      <ul className={`${CARD} divide-y divide-[#eef0f3] overflow-hidden`} data-event-list={past ? "past" : "upcoming"}>
        {state.events.map((e) => (
          <EventRow key={e.id} event={e} zone={zone} past={past} />
        ))}
      </ul>
      {state.error ? <p className="mt-3 text-center text-[13px] text-[#b42318]">{state.error}</p> : null}
      {state.nextCursor ? (
        <button type="button" onClick={onMore} disabled={state.loading} className={`${SECONDARY} mt-3 w-full`} data-events-more>
          {state.loading ? <Spinner size={16} /> : null}
          {past ? "Show earlier events" : "Show later events"}
        </button>
      ) : null}
    </div>
  )
}

function EventRow({ event, zone, past }: { event: EventCardView; zone: string | undefined; past: boolean }) {
  const badge = eventDateBadge(event.startsAt, zone)
  const live = !event.cancelled && isLive(event)
  const end = event.endsAt ? ` to ${clockIn(event.endsAt, zone)}` : ""
  /* A free event says nothing about money; a paid one says the price once, until the seat is theirs. */
  const hasTicket = event.ticket?.status === "paid"
  const price = event.priceCents && !hasTicket && !past && !event.cancelled ? eventPriceLabel(event.priceCents, event.currency) : null
  const soldOut = event.soldOut && !hasTicket && !past && !event.cancelled
  const going = hasTicket || event.myRsvp === "going"
  return (
    <li data-event-row={event.id}>
      <Link href={event.href} className="flex items-start gap-3.5 px-3.5 py-3.5 transition-colors hover:bg-[#fafafb] focus-visible:bg-[#fafafb] focus-visible:outline-none sm:gap-4 sm:px-4">
        <span
          aria-hidden
          className={`flex w-12 shrink-0 flex-col items-center rounded-xl border pb-1.5 pt-1 ${past || event.cancelled ? "border-[#eceef1] bg-[#f8f9fa]" : "border-[#e4e7ec] bg-white"}`}
          data-date-badge
        >
          <span className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${past || event.cancelled ? "text-[#9ca3af]" : "text-[#c4290c]"}`}>{badge.month}</span>
          <span className={`text-[20px] font-bold leading-6 tabular-nums ${past || event.cancelled ? "text-[#6b7280]" : "text-[#1a1a2e]"}`}>{badge.day}</span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 text-[13px] text-[#6b7280]">
            <span className="tabular-nums">
              {badge.weekday}, {clockIn(event.startsAt, zone)}
              {end}
            </span>
            {live ? <span className="font-semibold text-[#b42318]">Live now</span> : null}
            {event.cancelled ? <span className="font-semibold text-[#b42318]">Cancelled</span> : null}
          </span>
          <span className={`mt-0.5 line-clamp-2 block text-[15px] font-semibold leading-5 ${event.cancelled ? "text-[#6b7280] line-through decoration-[#9ca3af]" : "text-[#1a1a2e]"}`}>{event.title}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[#6b7280]">
            <span className="inline-flex min-w-0 items-center gap-1">
              {event.online ? <Video className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />}
              <span className="truncate">{event.online ? "Online" : event.location || event.locationHint || "In person"}</span>
            </span>
            {!past && !event.cancelled && !soldOut && (event.goingCount > 0 || event.capacity) ? <span className="tabular-nums">{goingLabel(event.goingCount, event.capacity)}</span> : null}
            {soldOut ? (
              <span className="font-medium text-[#4b5563]" data-event-sold-out="">
                Sold out
              </span>
            ) : price ? (
              <span className="font-semibold tabular-nums text-[#1a1a2e]" data-event-price="">
                {price}
              </span>
            ) : null}
            {event.locked ? (
              <span className="inline-flex items-center gap-1 font-medium text-[#4b5563]" data-event-lock>
                <Lock className="h-3.5 w-3.5" aria-hidden />
                {event.locked.label}
              </span>
            ) : going && !past ? (
              <span className="inline-flex items-center gap-1 font-semibold text-[#1a1a2e]" data-my-rsvp="going">
                <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                Going
              </span>
            ) : event.myRsvp === "waitlist" && !past ? (
              <span className="inline-flex items-center gap-1 font-medium text-[#4b5563]" data-my-rsvp="waitlist">
                <Clock3 className="h-3.5 w-3.5" aria-hidden />
                Waitlist
              </span>
            ) : null}
            {past && event.hasReplay ? (
              <span className="inline-flex items-center gap-1 font-medium text-[#1a1a2e]">
                <PlayCircle className="h-3.5 w-3.5" aria-hidden />
                Replay
              </span>
            ) : null}
          </span>
        </span>

        {event.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.coverUrl} alt="" className="hidden h-[72px] w-[112px] shrink-0 rounded-lg object-cover sm:block" loading="lazy" />
        ) : null}
      </Link>
    </li>
  )
}

/* ── The month ──────────────────────────────────────────────────────────── */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const PER_DAY = 3

function MonthCalendar({ communityId, initial, zone }: { communityId: string; initial: { year: number; month: number; events: EventCardView[] }; zone: string | undefined }) {
  const [at, setAt] = useState({ year: initial.year, month: initial.month })
  const [cache, setCache] = useState<Record<string, EventCardView[]>>({ [monthKey(initial.year, initial.month)]: initial.events })
  const [loading, setLoading] = useState(false)
  const [todayKey, setTodayKey] = useState(() => dayKey(Date.now(), zone))
  useEffect(() => setTodayKey(dayKey(Date.now(), zone)), [zone])

  const key = monthKey(at.year, at.month)
  useEffect(() => {
    if (cache[key]) return
    let cancelled = false
    setLoading(true)
    void getJson(`/api/community/${communityId}/events?month=${key}`).then((body) => {
      if (cancelled) return
      setLoading(false)
      setCache((c) => ({ ...c, [key]: ((body?.events as EventCardView[]) ?? []) }))
    })
    return () => {
      cancelled = true
    }
  }, [cache, communityId, key])

  const byDay = useMemo(() => {
    const map = new Map<string, EventCardView[]>()
    for (const e of cache[key] ?? []) {
      const k = dayKey(Date.parse(e.startsAt), zone)
      map.set(k, [...(map.get(k) ?? []), e])
    }
    return map
  }, [cache, key, zone])

  const cells = monthGrid(at.year, at.month, todayKey)
  const step = (d: number) => setAt((a) => ({ year: a.year + Math.floor((a.month + d) / 12), month: (((a.month + d) % 12) + 12) % 12 }))
  const goToday = () => {
    const [y, m] = todayKey.split("-").map(Number)
    setAt({ year: y, month: m - 1 })
  }
  const iconBtn = "inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-[#4b5563] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20"

  return (
    <div className={`${CARD} overflow-hidden`} data-month-calendar={key}>
      <div className="flex items-center justify-between gap-3 border-b border-[#eef0f3] px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-[16px] font-semibold text-[#1a1a2e]" aria-live="polite">
          {monthTitle(at.year, at.month)}
          {loading ? <Spinner size={16} /> : null}
        </h2>
        <div className="flex items-center gap-1">
          <button type="button" onClick={goToday} className="h-9 rounded-[10px] px-3 text-[13px] font-medium text-[#4b5563] hover:bg-[#f3f4f6] hover:text-[#1a1a2e]">
            Today
          </button>
          <button type="button" onClick={() => step(-1)} className={iconBtn} aria-label="Previous month" data-month-prev>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => step(1)} className={iconBtn} aria-label="Next month" data-month-next>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-[#eef0f3] bg-[#fafafb]">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-1.5 text-[12px] font-medium text-[#6b7280]">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7" role="grid" aria-label={monthTitle(at.year, at.month)}>
        {cells.map((c, i) => {
          const events = byDay.get(c.key) ?? []
          return (
            <div
              key={c.key}
              role="gridcell"
              data-day={c.key}
              className={`min-h-[104px] border-[#eef0f3] p-1.5 ${i % 7 !== 6 ? "border-r" : ""} ${i < 35 ? "border-b" : ""} ${c.inMonth ? "bg-white" : "bg-[#fafafb]"}`}
            >
              <span
                className={`mb-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] font-semibold tabular-nums ${
                  c.today ? "bg-[#1a1a2e] text-white" : c.inMonth ? "text-[#1a1a2e]" : "text-[#b0b3ba]"
                }`}
              >
                {c.day}
              </span>
              <ul className="space-y-1">
                {events.slice(0, PER_DAY).map((e) => {
                  const cellPrice = e.priceCents && e.ticket?.status !== "paid" && !e.cancelled ? eventPriceLabel(e.priceCents, e.currency) : null
                  return (
                  <li key={e.id}>
                    <Link
                      href={e.href}
                      title={`${e.title} · ${clockIn(e.startsAt, zone)}${cellPrice ? ` · ${cellPrice}` : ""}`}
                      data-calendar-event={e.id}
                      className={`block truncate rounded-md px-1.5 py-1 text-[12px] leading-4 transition-colors ${
                        e.cancelled
                          ? "bg-[#f8f9fa] text-[#9ca3af] line-through"
                          : e.myRsvp === "going" || e.ticket?.status === "paid"
                            ? "bg-[#1a1a2e] text-white hover:bg-[#262640]"
                            : "bg-[#f1f2f4] text-[#1a1a2e] hover:bg-[#e7e9ed]"
                      }`}
                    >
                      {/* A cell is a glance: the price is the fact that decides a paid event, so it stands where the time would. */}
                      {cellPrice ? (
                        <span className="tabular-nums opacity-70" data-calendar-price="">
                          {cellPrice}
                        </span>
                      ) : (
                        <span className="tabular-nums opacity-70">{clockIn(e.startsAt, zone).replace(":00 ", " ")}</span>
                      )}{" "}
                      {e.title}
                    </Link>
                  </li>
                  )
                })}
                {events.length > PER_DAY ? <li className="px-1.5 text-[12px] text-[#6b7280]">{events.length - PER_DAY} more</li> : null}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
